import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAll, checkProposal, DEFAULT_RULES } from "./rules.ts";
import type { Proposal, Report } from "./schema.ts";

const report: Report = {
  summary: "",
  market_context: "",
  news: [],
  proposals: [],
  snapshot: {
    as_of: "2026-11-16",
    net_worth_eur: 100000,
    allocation: [],
    cto: {
      account_name: "CTO",
      total_eur: 10000,
      cash_eur: 1000,
      positions: [
        { name: "A", ticker: "AAA", isin: null, sector: "Tech", quantity: 10, price_eur: 150, value_eur: 1500, pru_eur: 100 },
        { name: "B", ticker: "BBB", isin: null, sector: "Luxe", quantity: 5, price_eur: 300, value_eur: 1500, pru_eur: null },
      ],
    },
  },
};

const base: Proposal = {
  action: "buy", title: "", ticker: "AAA", name: "A", sector: "Tech", quantity: 2, order_type: "market",
  limit_price_eur: null, est_amount_eur: 300, realized_gain_eur: null, confidence: 60, arguments: [],
  abandon_level: "", rationale: "", sources: [],
};

test("un achat raisonnable passe", () => {
  assert.equal(checkProposal(base, report, DEFAULT_RULES).ok, true);
});

test("un achat qui vide les liquidités sous le plancher est bloqué", () => {
  const r = checkProposal({ ...base, est_amount_eur: 800, quantity: 5 }, report, DEFAULT_RULES);
  assert.equal(r.ok, false);
  assert.match(r.reasons.join(" "), /plancher/);
});

test("une vente de plus de titres que détenus est bloquée", () => {
  const r = checkProposal({ ...base, action: "sell", quantity: 20 }, report, DEFAULT_RULES);
  assert.equal(r.ok, false);
});

test("le plafond de propositions par séance s'applique", () => {
  const many = { ...report, proposals: Array.from({ length: 5 }, () => ({ ...base, est_amount_eur: 50, quantity: 1 })) };
  const checks = checkAll(many, DEFAULT_RULES);
  assert.equal(checks.filter((c) => !c.ok).length, 1);
});

test("une vente valide libère des liquidités pour un achat de la même séance", () => {
  const sell: Proposal = { ...base, action: "sell", ticker: "BBB", sector: "Luxe", quantity: 2, est_amount_eur: 600 };
  const buy: Proposal = { ...base, ticker: "CCC", sector: "Énergie", est_amount_eur: 700, quantity: 7 };
  assert.equal(checkProposal(buy, report, DEFAULT_RULES).ok, false);
  const checks = checkAll({ ...report, proposals: [buy, sell] }, DEFAULT_RULES);
  assert.equal(checks[0].ok, true);
  assert.equal(checks[1].ok, true);
});
