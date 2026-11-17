import "server-only";
import { redis } from "./store";
import {
  BALANCE_FIELDS,
  CASHFLOW_FIELDS,
  INCOME_FIELDS,
  compact,
  fmpErrorMessage,
  fmpUrl,
  pick,
  screenerParams,
} from "./market-query";

/*
 * Données boursières pour ton Claude pendant la séance (outils du connecteur AInvest) :
 * recherche de titre, fondamentaux chiffrés, consensus d'analystes, screener, agenda des résultats.
 * Source : Financial Modeling Prep (FMP), clé dans FMP_API_KEY. L'app appelle FMP côté serveur,
 * donc ça marche quel que soit le réseau de la routine. Rien de tout ça n'est affiché dans l'interface.
 */

const CACHE_SECONDS = 6 * 60 * 60; // l'offre gratuite compte les appels par jour : on évite les doublons

export function marketDataAvailable(): boolean {
  return Boolean(process.env.FMP_API_KEY);
}

type Result = { ok: true; data: unknown } | { ok: false; error: string };

async function fmp(path: string, params: Record<string, string | number>): Promise<Result> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return { ok: false, error: "FMP_API_KEY non définie dans Vercel" };
  const cacheKey = `fmp:${path}:${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()}`;
  try {
    const cached = await redis().get<unknown>(cacheKey);
    if (cached !== null && cached !== undefined) return { ok: true, data: cached };
  } catch {
    // cache indisponible : on appelle FMP directement
  }
  let res: Response;
  try {
    res = await fetch(fmpUrl(path, params, apiKey), { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  } catch (err) {
    return { ok: false, error: `FMP injoignable (${err instanceof Error ? err.message : String(err)})` };
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok || (body && typeof body === "object" && !Array.isArray(body) && "Error Message" in body)) {
    return { ok: false, error: fmpErrorMessage(res.status, body) };
  }
  try {
    await redis().set(cacheKey, body, { ex: CACHE_SECONDS });
  } catch {
    // pas grave
  }
  return { ok: true, data: body };
}

/** Lance plusieurs appels et rend chaque section, ou la raison de son absence. */
async function sections(calls: Record<string, () => Promise<unknown>>): Promise<Record<string, unknown>> {
  const names = Object.keys(calls);
  const results = await Promise.all(names.map((n) => calls[n]().catch((e) => ({ error: e instanceof Error ? e.message : String(e) }))));
  return Object.fromEntries(names.map((n, i) => [n, results[i]]));
}

const unwrap = (r: Result, map: (d: unknown) => unknown = (d) => d) => (r.ok ? compact(map(r.data)) : { indisponible: r.error });
const first = (d: unknown) => (Array.isArray(d) ? d[0] ?? null : d);

/** Trouve le symbole d'un titre à partir d'un nom, d'un ticker ou d'un ISIN. */
export async function searchSecurity(args: { query?: string; isin?: string }) {
  if (args.isin) return unwrap(await fmp("search-isin", { isin: args.isin }));
  if (!args.query) return { indisponible: "donne query ou isin" };
  const [bySymbol, byName] = await Promise.all([
    fmp("search-symbol", { query: args.query, limit: 10 }),
    fmp("search-name", { query: args.query, limit: 10 }),
  ]);
  return { par_symbole: unwrap(bySymbol), par_nom: unwrap(byName) };
}

/** Fiche fondamentale d'une entreprise : profil, cours, ratios, états financiers, consensus. */
export async function companyFundamentals(args: { symbol: string; period?: "annual" | "quarter"; limit?: number }) {
  const symbol = args.symbol.trim().toUpperCase();
  const period = args.period === "quarter" ? "quarter" : "annual";
  const limit = Math.min(Math.max(Math.trunc(args.limit ?? 4), 1), 8);
  const statement = (path: string, fields: readonly string[]) => async () =>
    unwrap(await fmp(path, { symbol, period, limit }), (d) => pick(d, fields));
  return {
    symbol,
    source: "Financial Modeling Prep (financialmodelingprep.com), montants dans la devise de publication",
    ...(await sections({
      profil: async () =>
        unwrap(await fmp("profile", { symbol }), (d) => {
          const p = first(d) as Record<string, unknown> | null;
          if (!p) return null;
          const { description, image, defaultImage, ...rest } = p;
          return { ...rest, description: typeof description === "string" ? description.slice(0, 600) : undefined };
        }),
      cours: async () => unwrap(await fmp("quote", { symbol }), first),
      ratios_ttm: async () => unwrap(await fmp("ratios-ttm", { symbol }), first),
      indicateurs_ttm: async () => unwrap(await fmp("key-metrics-ttm", { symbol }), first),
      compte_de_resultat: statement("income-statement", INCOME_FIELDS),
      bilan: statement("balance-sheet-statement", BALANCE_FIELDS),
      flux_de_tresorerie: statement("cash-flow-statement", CASHFLOW_FIELDS),
      estimations_analystes: async () => unwrap(await fmp("analyst-estimates", { symbol, period: "annual", page: 0, limit: 3 })),
      objectif_de_cours: async () => unwrap(await fmp("price-target-consensus", { symbol }), first),
      notes_analystes_recentes: async () => unwrap(await fmp("grades", { symbol }), (d) => (Array.isArray(d) ? d.slice(0, 10) : d)),
    })),
  };
}

/** Screener d'actions et d'ETF selon des filtres chiffrés. */
export async function screenStocks(args: unknown) {
  const params = screenerParams(args);
  return { filtres: params, resultats: unwrap(await fmp("company-screener", params)) };
}

/** Agenda des publications de résultats, pour une liste de symboles ou tout le marché. */
export async function earningsCalendar(args: { from?: string; to?: string; symbols?: string[] }) {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const from = args.from && iso.test(args.from) ? args.from : day(new Date());
  const to = args.to && iso.test(args.to) ? args.to : day(new Date(Date.now() + 14 * 86400000));
  const r = await fmp("earnings-calendar", { from, to });
  const wanted = new Set((args.symbols ?? []).map((s) => s.toUpperCase()));
  return {
    du: from,
    au: to,
    publications: unwrap(r, (d) => {
      const rows = Array.isArray(d) ? d : [];
      return (wanted.size ? rows.filter((x) => wanted.has(String((x as { symbol?: string }).symbol).toUpperCase())) : rows).slice(0, 80);
    }),
  };
}
