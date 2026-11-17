/*
 * Briques pures des outils de données boursières (screener, fondamentaux) exposés
 * à ton Claude via le connecteur AInvest. Pas d'accès réseau ici : seulement la
 * construction des requêtes et l'allègement des réponses, pour pouvoir les tester.
 */

export const FMP_BASE = "https://financialmodelingprep.com/stable";

/** Filtres du screener acceptés, avec leur type. Tout le reste est ignoré. */
export const SCREENER_FILTERS = {
  marketCapMoreThan: "number",
  marketCapLowerThan: "number",
  priceMoreThan: "number",
  priceLowerThan: "number",
  betaMoreThan: "number",
  betaLowerThan: "number",
  volumeMoreThan: "number",
  dividendMoreThan: "number",
  sector: "string",
  industry: "string",
  country: "string",
  exchange: "string",
  isEtf: "boolean",
  isFund: "boolean",
  limit: "number",
} as const;

export type ScreenerFilters = Partial<Record<keyof typeof SCREENER_FILTERS, string | number | boolean>>;

/** Transforme les filtres reçus en paramètres de requête sûrs (liste blanche, types vérifiés, limite bornée). */
export function screenerParams(input: unknown): Record<string, string> {
  const out: Record<string, string> = { isActivelyTrading: "true", limit: "25" };
  if (!input || typeof input !== "object") return out;
  for (const [key, kind] of Object.entries(SCREENER_FILTERS)) {
    const value = (input as Record<string, unknown>)[key];
    if (value === undefined || value === null || value === "") continue;
    if (kind === "number" && typeof value === "number" && Number.isFinite(value)) out[key] = String(value);
    else if (kind === "string" && typeof value === "string" && value.length <= 80) out[key] = value.trim();
    else if (kind === "boolean" && typeof value === "boolean") out[key] = String(value);
  }
  out.limit = String(Math.min(Math.max(Math.trunc(Number(out.limit)) || 25, 1), 50));
  return out;
}

/** URL d'un appel FMP. La clé n'est jamais renvoyée au modèle : seule l'app la connaît. */
export function fmpUrl(path: string, params: Record<string, string | number>, apiKey: string): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  qs.set("apikey", apiKey);
  return `${FMP_BASE}/${path}?${qs.toString()}`;
}

/** Arrondit les nombres et retire les champs vides, pour garder des réponses courtes. */
export function compact(value: unknown, depth = 0): unknown {
  if (depth > 6) return undefined;
  if (typeof value === "number") return Number.isInteger(value) ? value : Number(value.toPrecision(5));
  if (Array.isArray(value)) return value.map((v) => compact(v, depth + 1)).filter((v) => v !== undefined);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === null || v === "" || v === undefined) continue;
      const c = compact(v, depth + 1);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return value;
}

/** Ne garde que certains champs de chaque ligne (états financiers très verbeux). */
export function pick<T extends Record<string, unknown>>(rows: unknown, fields: readonly string[]): Partial<T>[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const f of fields) if (row && typeof row === "object" && f in row) out[f] = (row as Record<string, unknown>)[f];
    return out as Partial<T>;
  });
}

export const INCOME_FIELDS = [
  "date", "fiscalYear", "period", "reportedCurrency", "revenue", "grossProfit", "operatingIncome",
  "ebitda", "netIncome", "eps", "epsDiluted", "weightedAverageShsOutDil",
] as const;

export const BALANCE_FIELDS = [
  "date", "fiscalYear", "period", "reportedCurrency", "cashAndShortTermInvestments", "totalAssets",
  "totalLiabilities", "totalDebt", "netDebt", "totalStockholdersEquity",
] as const;

export const CASHFLOW_FIELDS = [
  "date", "fiscalYear", "period", "reportedCurrency", "operatingCashFlow", "capitalExpenditure",
  "freeCashFlow", "commonDividendsPaid", "commonStockRepurchased",
] as const;

/** Message clair quand FMP refuse un appel (clé, offre, quota). */
export function fmpErrorMessage(status: number, body: unknown): string {
  const raw = body && typeof body === "object" ? String((body as Record<string, unknown>)["Error Message"] ?? (body as Record<string, unknown>).message ?? "") : String(body ?? "");
  if (status === 401 || /invalid api key/i.test(raw)) return "clé FMP invalide ou absente";
  if (status === 402 || status === 403 || /premium|subscription|upgrade|plan/i.test(raw)) return "donnée non incluse dans l'offre FMP actuelle";
  if (status === 429 || /limit reach/i.test(raw)) return "quota FMP du jour atteint";
  return raw ? raw.slice(0, 160) : `erreur HTTP ${status}`;
}
