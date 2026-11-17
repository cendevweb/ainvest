import { safeEqual, randomToken } from "@/lib/crypto";
import { finalizeReport } from "@/lib/ingest";
import { sessionInstructions, todayFr } from "@/lib/prompt";
import { ReportSchema, reportJsonSchema } from "@/lib/schema";
import { getRules, getSession, latestSession, saveSession, type Session } from "@/lib/sessions";
import { eur } from "@/lib/format";
import { briefAsText, getBrief } from "@/lib/brief";

/*
 * Serveur MCP d'AInvest (transport HTTP « streamable », mode sans état, réponses JSON).
 * Ton Claude (Claude Code ou claude.ai) l'ajoute comme connecteur à côté de Finary :
 * il lit le contexte, scanne ton patrimoine avec SON accès Finary, puis dépose le rapport ici.
 * L'URL contient un secret (INGEST_TOKEN) : elle ne doit pas être partagée.
 */

const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];

const TOOLS = [
  {
    name: "get_session_context",
    title: "Contexte de la séance AInvest",
    description:
      "À appeler en premier. Renvoie les consignes de la séance du jour : règles de l'utilisateur, décisions sur la séance précédente et méthode à suivre.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_session",
    title: "Lire une séance AInvest",
    description:
      "Renvoie une séance enregistrée (la dernière par défaut) : rapport, propositions avec la vérification des règles et les décisions de l'utilisateur, plus les règles en vigueur. Sert à approfondir une proposition.",
    inputSchema: {
      type: "object",
      properties: { session_id: { type: "string", description: "Identifiant de la séance, ex. 2026-11-16-ab12cd34. Facultatif." } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "submit_report",
    title: "Déposer le rapport AInvest",
    description:
      "À appeler une seule fois, à la fin. Dépose le rapport de la séance (instantané du CTO, synthèse, actualités, propositions). L'app vérifie chaque proposition contre les règles et renvoie celles qui sont bloquées.",
    inputSchema: reportJsonSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
];

type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const ok = (id: RpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: RpcRequest["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const text = (t: string, isError = false) => ({ content: [{ type: "text", text: t }], ...(isError ? { isError: true } : {}) });

function authorized(token: string): boolean {
  const expected = process.env.INGEST_TOKEN;
  return Boolean(expected && expected.length >= 24 && safeEqual(token, expected));
}

async function getContext() {
  const [rules, previous, brief] = await Promise.all([getRules(), latestSession(), getBrief()]);
  return text(sessionInstructions(rules, todayFr(), previous, brief ? briefAsText(brief) : null));
}

async function readSession(args: unknown) {
  const id = typeof (args as { session_id?: unknown })?.session_id === "string" ? (args as { session_id: string }).session_id : null;
  const [session, rules] = await Promise.all([id ? getSession(id) : latestSession(), getRules()]);
  if (!session) return text(id ? `Séance ${id} introuvable.` : "Aucune séance enregistrée.", true);
  const { trace: _trace, ...rest } = session;
  return text(JSON.stringify({ rules, session: rest }, null, 1));
}

async function submitReport(args: unknown) {
  const parsed = ReportSchema.safeParse(args);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 8).map((i) => `- ${i.path.join(".") || "(racine)"} : ${i.message}`).join("\n");
    return text(`Rapport refusé, il ne respecte pas le schéma. Corrige puis rappelle submit_report :\n${issues}`, true);
  }
  const rules = await getRules();
  const now = Date.now();
  const session: Session = {
    id: `${new Date(now).toISOString().slice(0, 10)}-${randomToken(4)}`,
    trigger: "claude",
    status: "running",
    model: "Ton Claude (connecteur)",
    startedAt: now,
    trace: [{ kind: "report", tool: "submit_report", label: "Rapport déposé par ton Claude via le connecteur AInvest" }],
    proposals: [],
  };
  finalizeReport(session, parsed.data, rules);
  await saveSession(session);

  const lines = session.proposals.map((p) => {
    const amount = p.est_amount_eur ? `, ${eur(p.est_amount_eur)}` : "";
    return p.check.ok
      ? `- ${p.title} (${p.ticker}${amount}) : enregistrée`
      : `- ${p.title} (${p.ticker}${amount}) : BLOQUÉE, ${p.check.reasons.join(" ; ")}`;
  });
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  return text(
    [
      `Rapport enregistré (séance ${session.id}).`,
      ...lines,
      appUrl ? `L'utilisateur valide les propositions dans l'app : ${appUrl}/seance/${session.id}` : "",
      "Résume en quelques lignes à l'utilisateur ce que tu as proposé et pourquoi.",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

async function handle(req: RpcRequest) {
  switch (req.method) {
    case "initialize": {
      const asked = String(req.params?.protocolVersion ?? "");
      return ok(req.id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "ainvest", title: "AInvest", version: "1.0.0" },
        instructions:
          "Connecteur de ton instance AInvest. Pour une séance : appelle get_session_context, lis le patrimoine avec le connecteur Finary, cherche l'actualité, puis appelle submit_report.",
      });
    }
    case "ping":
      return ok(req.id, {});
    case "tools/list":
      return ok(req.id, { tools: TOOLS });
    case "tools/call": {
      const name = req.params?.name;
      try {
        if (name === "get_session_context") return ok(req.id, await getContext());
        if (name === "get_session") return ok(req.id, await readSession(req.params?.arguments));
        if (name === "submit_report") return ok(req.id, await submitReport(req.params?.arguments));
      } catch (err) {
        return ok(req.id, text(`Erreur côté AInvest : ${err instanceof Error ? err.message : String(err)}`, true));
      }
      return fail(req.id, -32602, `Outil inconnu : ${String(name)}`);
    }
    default:
      return fail(req.id, -32601, `Méthode non prise en charge : ${req.method}`);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!authorized(token)) return json({ error: "Non autorisé" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(fail(null, -32700, "JSON invalide"), 400);
  }
  const batch = Array.isArray(body) ? (body as RpcRequest[]) : [body as RpcRequest];
  const responses = [];
  for (const msg of batch) {
    if (!msg || typeof msg.method !== "string") {
      responses.push(fail(null, -32600, "Requête invalide"));
      continue;
    }
    if (msg.id === undefined) continue; // notification (ex. notifications/initialized)
    responses.push(await handle(msg));
  }
  if (!responses.length) return new Response(null, { status: 202 });
  return json(Array.isArray(body) ? responses : responses[0]);
}

// Pas de flux SSE côté serveur : le mode sans état n'en a pas besoin.
export async function GET() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
