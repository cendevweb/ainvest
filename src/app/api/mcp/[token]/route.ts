import { safeEqual, randomToken } from "@/lib/crypto";
import { finalizeReport } from "@/lib/ingest";
import { sessionInstructions, todayFr } from "@/lib/prompt";
import { ReportSchema, reportJsonSchema } from "@/lib/schema";
import { appendTrace, getRules, getSession, isStale, latestSession, listSessions, saveSession, type Session, type TraceKind } from "@/lib/sessions";
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
    inputSchema: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Identifiant de séance donné dans ta consigne de lancement (« Identifiant de séance AInvest : … »). Facultatif : sans lui, une séance est ouverte.",
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "log_step",
    title: "Journaliser une étape de la séance",
    description:
      "Ajoute une entrée au journal que l'utilisateur suit en direct : une lecture Finary, une recherche ou page web importante, ou une décision majeure de ton raisonnement. Phrases courtes, aucun identifiant de compte.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Identifiant renvoyé par get_session_context." },
        kind: { type: "string", enum: ["finary", "web_search", "web_fetch", "decision", "other"] },
        label: { type: "string", description: "Ce que tu as fait ou décidé, en une phrase (200 caractères max)." },
        detail: { type: "string", description: "Facultatif. Pour une décision : le raisonnement en 1 à 3 phrases (600 caractères max)." },
      },
      required: ["session_id", "kind", "label"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
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
    inputSchema: {
      ...reportJsonSchema,
      properties: {
        ...reportJsonSchema.properties,
        session_id: { type: "string", description: "Identifiant renvoyé par get_session_context. Facultatif." },
      },
    },
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

const KINDS: TraceKind[] = ["finary", "web_search", "web_fetch", "decision", "other"];
const SESSION_ID = /^\d{4}-\d{2}-\d{2}-[A-Za-z0-9_-]{4,16}$/;

function argString(args: unknown, key: string): string | null {
  const v = (args as Record<string, unknown> | null | undefined)?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Séance « en cours » à utiliser : celle demandée si elle tourne encore, sinon une nouvelle. */
async function openSession(requested: string | null): Promise<Session> {
  if (requested && SESSION_ID.test(requested)) {
    const s = await getSession(requested);
    if (s && s.status === "running" && !isStale(s)) return s;
  }
  const now = Date.now();
  const session: Session = {
    id: `${new Date(now).toISOString().slice(0, 10)}-${randomToken(4)}`,
    trigger: "claude",
    status: "running",
    model: "Routine Claude",
    startedAt: now,
    trace: [{ kind: "other", tool: "routine", label: "Séance ouverte par ta routine Claude", at: now }],
    proposals: [],
  };
  await saveSession(session);
  return session;
}

async function getContext(args: unknown) {
  const [rules, previousLatest, brief] = await Promise.all([getRules(), latestSession(), getBrief()]);
  const session = await openSession(argString(args, "session_id"));
  // La séance précédente est la dernière séance terminée, pas celle qu'on vient d'ouvrir.
  const previous =
    previousLatest && previousLatest.id !== session.id && previousLatest.status === "done"
      ? previousLatest
      : (await listSessions(5)).find((s) => s.id !== session.id && s.status === "done") ?? null;
  if (!session.trace.some((t) => t.tool === "get_session_context")) {
    await appendTrace(session.id, { kind: "other", tool: "get_session_context", label: "Consignes et règles lues" });
  }
  return text(sessionInstructions(rules, todayFr(), previous, session.id, brief ? briefAsText(brief) : null));
}

async function logStep(args: unknown) {
  const id = argString(args, "session_id");
  const kind = argString(args, "kind") as TraceKind | null;
  const label = argString(args, "label");
  if (!id || !label || !kind || !KINDS.includes(kind)) {
    return text("log_step attend session_id, kind (finary, web_search, web_fetch, decision, other) et label.", true);
  }
  const s = id && SESSION_ID.test(id) ? await getSession(id) : null;
  if (!s) return text(`Séance ${id} introuvable : utilise l'identifiant renvoyé par get_session_context.`, true);
  if (s.status !== "running") return text(`Séance ${id} déjà close, entrée ignorée.`);
  const detail = argString(args, "detail");
  await appendTrace(id, {
    kind,
    tool: kind === "decision" ? "décision" : kind,
    label: label.slice(0, 200),
    ...(detail ? { detail: detail.slice(0, 600) } : {}),
  });
  return text("Noté.");
}

async function readSession(args: unknown) {
  const id = typeof (args as { session_id?: unknown })?.session_id === "string" ? (args as { session_id: string }).session_id : null;
  const [session, rules] = await Promise.all([id ? getSession(id) : latestSession(), getRules()]);
  if (!session) return text(id ? `Séance ${id} introuvable.` : "Aucune séance enregistrée.", true);
  const { trace: _trace, ...rest } = session;
  return text(JSON.stringify({ rules, session: rest }, null, 1));
}

async function submitReport(args: unknown) {
  const requested = argString(args, "session_id");
  const { session_id: _sid, ...reportArgs } = (args ?? {}) as Record<string, unknown>;
  const parsed = ReportSchema.safeParse(reportArgs);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 8).map((i) => `- ${i.path.join(".") || "(racine)"} : ${i.message}`).join("\n");
    return text(`Rapport refusé, il ne respecte pas le schéma. Corrige puis rappelle submit_report :\n${issues}`, true);
  }
  const rules = await getRules();
  let session = requested && SESSION_ID.test(requested) ? await getSession(requested) : null;
  if (!session || session.status === "done") {
    const now = Date.now();
    session = {
      id: `${new Date(now).toISOString().slice(0, 10)}-${randomToken(4)}`,
      trigger: "claude",
      status: "running",
      model: "Routine Claude",
      startedAt: now,
      trace: [],
      proposals: [],
    };
  }
  session.error = undefined;
  session.trace = [...session.trace, { kind: "report", tool: "submit_report", label: "Rapport déposé par ta routine Claude", at: Date.now() }];
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
        if (name === "get_session_context") return ok(req.id, await getContext(req.params?.arguments));
        if (name === "log_step") return ok(req.id, await logStep(req.params?.arguments));
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
