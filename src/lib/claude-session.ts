import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaMessageParam,
  BetaToolUnion,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { FINARY_MCP_URL, model as configuredModel, requireEnv } from "./env";
import { getAccessToken } from "./finary-oauth";
import { sessionInstructions, todayFr } from "./prompt";
import { finalizeReport } from "./ingest";
import { assertBudget, costUsd, recordSpend } from "./budget";
import { ReportSchema, reportJsonSchema } from "./schema";
import {
  acquireLock,
  getRules,
  latestSession,
  releaseLock,
  saveSession,
  type Session,
  type TraceStep,
} from "./sessions";
import { randomToken } from "./crypto";

const BETAS = ["mcp-client-2025-11-20", "server-side-fallback-2026-07-01"];

function traceFrom(block: BetaContentBlock): TraceStep | null {
  if (block.type === "mcp_tool_use") {
    return { kind: "finary", tool: `finary.${block.name}`, label: `Lecture Finary : ${block.name}` };
  }
  if (block.type === "server_tool_use") {
    const input = (block.input ?? {}) as { query?: string; url?: string };
    if (block.name === "web_search") return { kind: "web_search", tool: "web_search", label: input.query ?? "Recherche web" };
    if (block.name === "web_fetch") return { kind: "web_fetch", tool: "web_fetch", label: input.url ?? "Lecture d'une page" };
    return { kind: "other", tool: block.name, label: block.name };
  }
  if (block.type === "tool_use" && block.name === "submit_report") {
    return { kind: "report", tool: "submit_report", label: "Rapport et propositions remis" };
  }
  return null;
}

export type RunResult = { ok: true; session: Session } | { ok: false; error: string; session?: Session };

/** Lance une séance complète. Sûr à appeler depuis la tâche planifiée ou un clic. */
export async function runSession(trigger: Session["trigger"]): Promise<RunResult> {
  if (!(await acquireLock())) return { ok: false, error: "Une séance est déjà en cours." };

  const modelId = configuredModel();
  const session: Session = {
    id: `${new Date().toISOString().slice(0, 10)}-${randomToken(4)}`,
    trigger,
    status: "running",
    model: modelId,
    startedAt: Date.now(),
    trace: [],
    proposals: [],
  };

  try {
    await assertBudget();
    const token = await getAccessToken();
    if (!token) throw new Error("Finary n'est pas connecté. Connecte-le dans Paramètres.");
    await saveSession(session);

    const rules = await getRules();
    const previous = await latestSession();
    const today = todayFr();

    const client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
    const tools: BetaToolUnion[] = [
      { type: "mcp_toolset", mcp_server_name: "finary" },
      { type: "web_search_20260209", name: "web_search", max_uses: 20 },
      { type: "web_fetch_20260209", name: "web_fetch", max_uses: 10 },
      {
        name: "submit_report",
        description: "Remet le rapport final de la séance : instantané du CTO, synthèse, actualités et propositions.",
        strict: true,
        input_schema: reportJsonSchema as never,
      },
    ];
    const messages: BetaMessageParam[] = [
      { role: "user", content: "Lance la séance du jour sur mon CTO et remets ton rapport avec submit_report." },
    ];

    let inputTokens = 0;
    let outputTokens = 0;
    let reportInput: unknown = null;

    for (let turn = 0; turn < 6 && reportInput === null; turn += 1) {
      const stream = client.beta.messages.stream({
        model: modelId,
        max_tokens: 64000,
        betas: BETAS,
        fallbacks: "default",
        output_config: { effort: "high" },
        system: sessionInstructions(rules, today, previous, "api"),
        mcp_servers: [{ type: "url", url: FINARY_MCP_URL, name: "finary", authorization_token: token }],
        tools,
        messages,
      });
      const message = await stream.finalMessage();
      inputTokens += message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0);
      outputTokens += message.usage.output_tokens;

      for (const block of message.content) {
        const step = traceFrom(block);
        if (step) session.trace.push(step);
        if (block.type === "tool_use" && block.name === "submit_report") reportInput = block.input;
      }
      await saveSession(session);

      if (reportInput !== null) break;
      if (message.stop_reason === "refusal") throw new Error("Claude a refusé la demande pour cette séance.");
      // Tour mis en pause par l'API (outils serveur) : on renvoie la réponse telle quelle pour continuer.
      messages.push({ role: "assistant", content: message.content });
      if (message.stop_reason !== "pause_turn") {
        messages.push({ role: "user", content: "Remets maintenant ton rapport en appelant submit_report." });
      }
    }

    if (reportInput === null) throw new Error("La séance s'est terminée sans rapport.");
    const report = ReportSchema.parse(reportInput);
    const searches = session.trace.filter((t) => t.kind === "web_search").length;
    const cost = costUsd(modelId, inputTokens, outputTokens, searches);
    finalizeReport(session, report, rules, { inputTokens, outputTokens, costUsd: cost });
    await recordSpend(cost);
    await saveSession(session);
    return { ok: true, session };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    Object.assign(session, { status: "error", error, finishedAt: Date.now() });
    await saveSession(session).catch(() => undefined);
    return { ok: false, error, session };
  } finally {
    await releaseLock();
  }
}
