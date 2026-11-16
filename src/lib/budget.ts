import "server-only";
import { keys, redis } from "./store";

/*
 * Budget mensuel de la clé API (brief du matin et séances lancées par l'app).
 * Coûts au prix catalogue : jetons du modèle + recherches web (10 $ les 1 000).
 */

export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-fable-5-2": { input: 8, output: 40 },
};
export const WEB_SEARCH_USD = 0.01;

/** Plafond prudent d'une exécution, pour ne jamais dépasser le budget en cours de mois. */
export const MAX_RUN_USD = 3;

export function costUsd(model: string, inputTokens: number, outputTokens: number, searches = 0): number {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000 + searches * WEB_SEARCH_USD;
}

export function monthlyBudgetUsd(): number {
  const v = Number(process.env.AINVEST_MONTHLY_BUDGET_USD);
  return Number.isFinite(v) && v > 0 ? v : 100;
}

const month = (d = new Date()) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }).slice(0, 7);

export async function spentThisMonth(): Promise<number> {
  return Number((await redis().get<number | string>(keys.budget(month()))) ?? 0);
}

export async function recordSpend(usd: number): Promise<void> {
  if (!(usd > 0)) return;
  await redis().incrbyfloat(keys.budget(month()), Number(usd.toFixed(4)));
  await redis().expire(keys.budget(month()), 60 * 60 * 24 * 400);
}

/** Lève une erreur si une nouvelle exécution risque de dépasser le budget du mois. */
export async function assertBudget(): Promise<void> {
  const spent = await spentThisMonth();
  const budget = monthlyBudgetUsd();
  if (spent + MAX_RUN_USD > budget) {
    throw new Error(`Budget API du mois presque atteint (${spent.toFixed(2)} $ sur ${budget} $) : exécution annulée.`);
  }
}
