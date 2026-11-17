import { safeEqual, randomToken } from "@/lib/crypto";
import { finalizeReport } from "@/lib/ingest";
import { sessionInstructions, todayFr } from "@/lib/prompt";
import { ReportSchema, reportJsonSchema } from "@/lib/schema";
import { appendTrace, getRules, getSession, isStale, latestSession, listSessions, saveSession, type Session, type TraceKind } from "@/lib/sessions";
import { eur } from "@/lib/format";
import { briefAsText, getBrief } from "@/lib/brief";
import { companyFundamentals, earningsCalendar, marketDataAvailable, screenStocks, searchSecurity } from "@/lib/market-data";

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
  {
    name: "search_security",
    title: "Trouver un titre",
    description:
      "Données boursières (Financial Modeling Prep). Trouve le symbole boursier d'une action ou d'un ETF à partir de son nom, d'un ticker ou d'un ISIN, avant d'appeler get_company_fundamentals.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Nom ou ticker, ex. « LVMH » ou « MC »." },
        isin: { type: "string", description: "ISIN, ex. FR0000121014." },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "get_company_fundamentals",
    title: "Fondamentaux d'une entreprise",
    description:
      "Données boursières (Financial Modeling Prep). Fiche chiffrée d'une entreprise : profil, cours, valorisation et ratios sur 12 mois glissants (PER, marges, ROE, endettement, rendement), compte de résultat, bilan, flux de trésorerie, estimations et objectif de cours des analystes, notes récentes. À utiliser pour juger une ligne détenue ou une idée d'achat. Les sections absentes de l'offre FMP sont signalées « indisponible ».",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Symbole FMP, ex. AAPL, MC.PA, ASML.AS (voir search_security)." },
        period: { type: "string", enum: ["annual", "quarter"], description: "États financiers annuels (défaut) ou trimestriels." },
        limit: { type: "integer", minimum: 1, maximum: 8, description: "Nombre d'exercices ou trimestres, 4 par défaut." },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "screen_stocks",
    title: "Screener d'actions",
    description:
      "Données boursières (Financial Modeling Prep). Filtre les actions et ETF selon des critères chiffrés (capitalisation, prix, bêta, dividende, secteur, pays, place de cotation). Sert à trouver des idées d'achat cohérentes avec les règles et le portefeuille, à approfondir ensuite avec get_company_fundamentals.",
    inputSchema: {
      type: "object",
      properties: {
        marketCapMoreThan: { type: "number", description: "Capitalisation minimum, en dollars." },
        marketCapLowerThan: { type: "number" },
        priceMoreThan: { type: "number" },
        priceLowerThan: { type: "number" },
        betaMoreThan: { type: "number" },
        betaLowerThan: { type: "number" },
        volumeMoreThan: { type: "number" },
        dividendMoreThan: { type: "number", description: "Dividende annuel par action minimum." },
        sector: { type: "string", description: "Secteur en anglais, ex. Technology, Healthcare, Energy." },
        industry: { type: "string" },
        country: { type: "string", description: "Code pays, ex. FR, US, DE." },
        exchange: { type: "string", description: "Place, ex. EURONEXT, NASDAQ, NYSE, XETRA." },
        isEtf: { type: "boolean" },
        isFund: { type: "boolean" },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "25 par défaut." },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "get_earnings_calendar",
    title: "Agenda des résultats",
    description:
      "Données boursières (Financial Modeling Prep). Dates de publication des résultats, avec BPA et chiffre d'affaires attendus puis publiés. Filtre possible sur des symboles. Par défaut, les 14 prochains jours.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "AAAA-MM-JJ" },
        to: { type: "string", description: "AAAA-MM-JJ" },
        symbols: { type: "array", items: { type: "string" }, description: "Symboles à garder, ex. [\"NVDA\", \"TSLA\"]." },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
];

const MARKET_TOOLS = new Set(["search_security", "get_company_fundamentals", "screen_stocks", "get_earnings_calendar"]);

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

/** Séance en cours à reprendre : celle demandée, sinon la dernière si elle tourne encore. */
async function runningSession(requested: string | null): Promise<Session | null> {
  if (requested && SESSION_ID.test(requested)) {
    const s = await getSession(requested);
    if (s && s.status === "running" && !isStale(s)) return s;
  }
  // Sans identifiant (consigne de routine ancienne), on reprend la séance que l'app vient de lancer.
  const last = await latestSession();
  return last && last.status === "running" && !isStale(last) ? last : null;
}

/** Séance « en cours » à utiliser : celle demandée ou en cours, sinon une nouvelle. */
async function openSession(requested: string | null): Promise<Session> {
  const existing = await runningSession(requested);
  if (existing) return existing;
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
  return text(sessionInstructions(rules, todayFr(), previous, session.id, brief ? briefAsText(brief) : null, marketDataAvailable()));
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
  if (!session) session = await runningSession(null);
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

async function marketTool(name: string, rawArgs: unknown) {
  if (!marketDataAvailable()) return text("Données boursières non configurées : FMP_API_KEY manque dans Vercel. Utilise la recherche web.", true);
  const args = (rawArgs && typeof rawArgs === "object" ? rawArgs : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  let result: unknown;
  if (name === "search_security") result = await searchSecurity({ query: str(args.query), isin: str(args.isin) });
  else if (name === "get_company_fundamentals") {
    const symbol = str(args.symbol);
    if (!symbol) return text("Paramètre symbol manquant.", true);
    result = await companyFundamentals({ symbol, period: args.period === "quarter" ? "quarter" : "annual", limit: typeof args.limit === "number" ? args.limit : undefined });
  } else if (name === "screen_stocks") result = await screenStocks(args);
  else
    result = await earningsCalendar({
      from: str(args.from),
      to: str(args.to),
      symbols: Array.isArray(args.symbols) ? args.symbols.filter((s): s is string => typeof s === "string").slice(0, 40) : undefined,
    });
  return text(JSON.stringify(result));
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
          "Connecteur de ton instance AInvest. Pour une séance : appelle get_session_context, lis le patrimoine avec le connecteur Finary, cherche l'actualité, appuie-toi sur les outils de données boursières (fondamentaux, screener, agenda des résultats) s'ils sont présents, puis appelle submit_report.",
      });
    }
    case "ping":
      return ok(req.id, {});
    case "tools/list":
      // Les outils de données n'apparaissent que si la clé FMP est configurée.
      return ok(req.id, { tools: marketDataAvailable() ? TOOLS : TOOLS.filter((t) => !MARKET_TOOLS.has(t.name)) });
    case "tools/call": {
      const name = req.params?.name;
      try {
        if (name === "get_session_context") return ok(req.id, await getContext(req.params?.arguments));
        if (name === "log_step") return ok(req.id, await logStep(req.params?.arguments));
        if (name === "get_session") return ok(req.id, await readSession(req.params?.arguments));
        if (name === "submit_report") return ok(req.id, await submitReport(req.params?.arguments));
        if (typeof name === "string" && MARKET_TOOLS.has(name)) return ok(req.id, await marketTool(name, req.params?.arguments));
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
