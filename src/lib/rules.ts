import { z } from "zod";
import type { Proposal, Report } from "./schema";

export const RulesSchema = z.object({
  maxLinePct: z.number().min(1).max(100),
  maxSectorPct: z.number().min(1).max(100),
  minCashPct: z.number().min(0).max(100),
  defaultStopPct: z.number().min(1).max(50),
  maxOrderEur: z.number().min(1),
  maxProposalsPerDay: z.number().int().min(1).max(10),
  universe: z.string().max(300),
  horizon: z.string().max(300),
  notes: z.string().max(2000),
});
export type Rules = z.infer<typeof RulesSchema>;

export const DEFAULT_RULES: Rules = {
  maxLinePct: 20,
  maxSectorPct: 35,
  minCashPct: 5,
  defaultStopPct: 10,
  maxOrderEur: 5000,
  maxProposalsPerDay: 4,
  universe: "Tout ce que le courtier du CTO permet d'acheter (actions, ETF).",
  horizon: "Moyen terme, de 3 à 18 mois.",
  notes: "Toutes les propositions sont des recommandations, appliquées à la main.",
};

export type RuleCheck = { ok: boolean; reasons: string[] };

const pct = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);
const fmt = (n: number) => `${n.toFixed(1).replace(".", ",")} %`;

type Book = { total: number; cash: number; lines: Map<string, { value: number; quantity: number; sector: string }> };

function bookFrom(report: Report): Book {
  const { cto } = report.snapshot;
  return {
    total: cto.total_eur,
    cash: cto.cash_eur,
    lines: new Map(cto.positions.map((x) => [x.ticker, { value: x.value_eur, quantity: x.quantity, sector: x.sector }])),
  };
}

/**
 * Vérifie une proposition contre les règles, avec du code et non le modèle.
 * Les poids sont recalculés après l'opération, à partir du portefeuille `book`
 * (l'instantané du CTO, éventuellement déjà ajusté des propositions précédentes).
 */
export function checkProposal(p: Proposal, report: Report, rules: Rules, book: Book = bookFrom(report)): RuleCheck {
  const reasons: string[] = [];
  if (p.action === "hold" || p.action === "protect") return { ok: true, reasons };

  if (!(p.quantity > 0)) reasons.push("Quantité nulle ou négative.");
  if (p.est_amount_eur > rules.maxOrderEur) {
    reasons.push(`Montant ${Math.round(p.est_amount_eur)} € au-dessus du plafond de ${rules.maxOrderEur} € par ordre.`);
  }
  const { total } = book;
  const line = book.lines.get(p.ticker);

  if (p.action === "buy") {
    const cashAfter = book.cash - p.est_amount_eur;
    if (cashAfter < 0) reasons.push("Liquidités insuffisantes pour cet achat.");
    else if (pct(cashAfter, total) < rules.minCashPct) {
      reasons.push(`Les liquidités tomberaient à ${fmt(pct(cashAfter, total))}, sous le plancher de ${fmt(rules.minCashPct)}.`);
    }
    const lineAfter = (line?.value ?? 0) + p.est_amount_eur;
    if (pct(lineAfter, total) > rules.maxLinePct) {
      reasons.push(`La ligne ${p.ticker} pèserait ${fmt(pct(lineAfter, total))}, au-dessus de ${fmt(rules.maxLinePct)}.`);
    }
    let sectorAfter = p.est_amount_eur;
    for (const l of book.lines.values()) if (l.sector === p.sector) sectorAfter += l.value;
    if (pct(sectorAfter, total) > rules.maxSectorPct) {
      reasons.push(`Le secteur ${p.sector} pèserait ${fmt(pct(sectorAfter, total))}, au-dessus de ${fmt(rules.maxSectorPct)}.`);
    }
  }

  if (p.action === "sell") {
    if (!line) reasons.push(`${p.ticker} n'est pas détenu dans le CTO.`);
    else if (p.quantity > line.quantity) reasons.push(`Vente de ${p.quantity} titres pour ${line.quantity} détenus.`);
  }

  return { ok: reasons.length === 0, reasons };
}

function apply(book: Book, p: Proposal) {
  const line = book.lines.get(p.ticker) ?? { value: 0, quantity: 0, sector: p.sector };
  const sign = p.action === "buy" ? 1 : -1;
  book.cash -= sign * p.est_amount_eur;
  book.lines.set(p.ticker, { ...line, value: line.value + sign * p.est_amount_eur, quantity: line.quantity + sign * p.quantity });
}

/**
 * Vérifie toutes les propositions comme si elles étaient exécutées ensemble :
 * les ventes d'abord (elles libèrent des liquidités), puis les achats, chacun sur
 * le portefeuille ajusté des opérations valides qui le précèdent. Applique aussi
 * le plafond de propositions actionnables par séance.
 */
export function checkAll(report: Report, rules: Rules): RuleCheck[] {
  const book = bookFrom(report);
  const checks: RuleCheck[] = report.proposals.map(() => ({ ok: true, reasons: [] }));
  const order = report.proposals
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(a.p.action === "buy") - Number(b.p.action === "buy"));
  for (const { p, i } of order) {
    checks[i] = checkProposal(p, report, rules, book);
    if (checks[i].ok && (p.action === "buy" || p.action === "sell")) apply(book, p);
  }
  let actionable = 0;
  report.proposals.forEach((p, i) => {
    if (p.action === "hold") return;
    actionable += 1;
    if (actionable > rules.maxProposalsPerDay) {
      checks[i].reasons.push(`Au-delà de ${rules.maxProposalsPerDay} propositions par séance.`);
      checks[i].ok = false;
    }
  });
  return checks;
}
