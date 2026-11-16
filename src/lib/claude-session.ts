import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaMessageParam,
  BetaToolUnion,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { FINARY_MCP_URL, model as configuredModel, requireEnv } from "./env";
import { getAccessToken } from "./finary-oauth";
import { checkAll, type Rules } from "./rules";
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

const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-fable-5-2": { input: 8, output: 40 },
};

const BETAS = ["mcp-client-2025-11-20", "server-side-fallback-2026-07-01"];

function systemPrompt(rules: Rules, today: string, previous: Session | null): string {
  const history = previous?.proposals?.length
    ? previous.proposals
        .map((p) => `- ${p.title} (${p.ticker}) : ${p.decision.status}${p.decision.note ? `, note : ${p.decision.note}` : ""}`)
        .join("\n")
    : "Aucune séance précédente.";
  return `Tu es le copilote d'investissement personnel de l'utilisateur, pour son compte-titres ordinaire (CTO) français.
Nous sommes le ${today}. Tu écris en français et tu tutoies l'utilisateur.

Ton rôle : lire l'état réel de son patrimoine, scruter l'actualité qui concerne ses lignes et le marché, puis lui proposer de 0 à ${rules.maxProposalsPerDay} actions argumentées. Tu ne passes jamais d'ordre : l'utilisateur valide et exécute lui-même chez son courtier.

Méthode, dans cet ordre :
1. Lis le patrimoine avec les outils Finary (vue d'ensemble, comptes, positions). Repère le compte-titres ordinaire (CTO). N'invente aucun chiffre : si une donnée manque, dis-le.
2. Pour chaque ligne du CTO et pour le contexte macro, cherche l'actualité des 7 derniers jours et les cours récents avec la recherche web. Ouvre les pages dont tu tires un chiffre.
3. Applique les règles ci-dessous. Une proposition qui les enfreint sera bloquée par du code avant d'être montrée : respecte-les.
4. Remets ton rapport en appelant l'outil submit_report une seule fois, à la fin. C'est ta seule façon de répondre.

Règles de l'utilisateur :
- Poids maximum d'une ligne : ${rules.maxLinePct} % du CTO.
- Poids maximum d'un secteur : ${rules.maxSectorPct} % du CTO.
- Liquidités minimum : ${rules.minCashPct} % du CTO après chaque achat.
- Stop par défaut proposé sur un nouvel achat : -${rules.defaultStopPct} %.
- Montant maximum par ordre : ${rules.maxOrderEur} €.
- Univers autorisé : ${rules.universe}
- Horizon : ${rules.horizon}
- Notes : ${rules.notes}

Exigences sur les propositions :
- Ne propose une action que si un fait récent et sourcé la justifie. Ne rien faire est une réponse valable.
- Ajoute une proposition « hold » qui donne en une phrase le verdict sur les lignes que tu ne touches pas.
- Pour une vente, estime la plus ou moins-value réalisée (fiscalité CTO : prélèvement forfaitaire unique).
- Chaque argument cite au moins une source dans "sources".
- Montants en euros. Convertis les cours en devise étrangère au taux du jour et dis-le.
- Seul le CTO est concerné. Les autres comptes servent de contexte (épargne de précaution, exposition globale).

Décisions de l'utilisateur sur la séance précédente (tiens-en compte) :
${history}`;
}

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
    const token = await getAccessToken();
    if (!token) throw new Error("Finary n'est pas connecté. Connecte-le dans Paramètres.");
    await saveSession(session);

    const rules = await getRules();
    const previous = await latestSession();
    const today = new Date().toLocaleDateString("fr-FR", {
      timeZone: "Europe/Paris",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

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
        system: systemPrompt(rules, today, previous),
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
    const checks = checkAll(report, rules);

    const price = PRICES[modelId] ?? PRICES["claude-opus-5-5"];
    const toolCalls: Record<string, number> = {};
    for (const s of session.trace) toolCalls[s.kind] = (toolCalls[s.kind] ?? 0) + 1;

    Object.assign(session, {
      status: "done",
      finishedAt: Date.now(),
      report,
      proposals: report.proposals.map((p, i) => ({
        ...p,
        id: `${session.id}-${i}`,
        check: checks[i],
        decision: { status: checks[i].ok ? (p.action === "hold" ? "done" : "pending") : "blocked" },
      })),
      stats: {
        durationMs: Date.now() - session.startedAt,
        toolCalls,
        sources: (toolCalls.web_search ?? 0) + (toolCalls.web_fetch ?? 0),
        inputTokens,
        outputTokens,
        costUsd: (inputTokens * price.input + outputTokens * price.output) / 1_000_000,
      },
    } satisfies Partial<Session>);
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
