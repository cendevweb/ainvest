import { test } from "node:test";
import assert from "node:assert/strict";
import { atr, normalizeBars, pivotLevels, rsi, sma, technicalSummary, weeklyBars, type Bar } from "./indicators.ts";

const day = (i: number) => new Date(Date.UTC(2025, 0, 6) + i * 86400000).toISOString().slice(0, 10); // 6 janv. 2025 = lundi
const bar = (i: number, close: number, range = 1): Bar => ({ date: day(i), open: close, high: close + range, low: close - range, close, volume: 1000 });

test("normalizeBars trie par date et ignore les lignes invalides", () => {
  const bars = normalizeBars([{ date: "2025-01-07", open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }, { date: "2025-01-06", open: 1, high: 2, low: 0.5, close: 1.2 }, { date: "", close: 3 }]);
  assert.deepEqual(bars.map((b) => b.date), ["2025-01-06", "2025-01-07"]);
  assert.equal(bars[0].volume, 0);
});

test("moyenne mobile simple", () => {
  assert.equal(sma([1, 2, 3, 4], 2), 3.5);
  assert.equal(sma([1], 2), null);
});

test("RSI : 100 en hausse continue, bas en baisse continue", () => {
  assert.equal(rsi(Array.from({ length: 30 }, (_, i) => i + 1)), 100);
  assert.ok(rsi(Array.from({ length: 30 }, (_, i) => 30 - i))! < 1);
});

test("ATR d'une série à amplitude constante", () => {
  const bars = Array.from({ length: 30 }, (_, i) => bar(i, 100, 2));
  assert.equal(atr(bars), 4);
});

test("regroupement hebdomadaire : lundi comme clé, haut/bas/clôture/volume agrégés", () => {
  const w = weeklyBars([bar(0, 10), bar(1, 12), bar(4, 11), bar(7, 13)]);
  assert.equal(w.length, 2);
  assert.deepEqual(w[0], { date: "2025-01-06", open: 10, high: 13, low: 9, close: 11, volume: 3000 });
  assert.equal(w[1].date, "2025-01-13");
});

test("les pivots proches sont fusionnés et classés selon le cours actuel", () => {
  const closes = [10, 12, 15, 12, 10, 12, 15.1, 12, 10, 11, 12, 13];
  const levels = pivotLevels(closes.map((c, i) => bar(i, c, 0)), 2);
  const res = levels.find((l) => l.kind === "resistance");
  assert.ok(res && res.touches === 2 && Math.abs(res.price - 15.05) < 0.01);
  assert.ok(levels.some((l) => l.kind === "support" && l.price === 10));
});

test("synthèse : refuse un historique trop court, calcule sinon", () => {
  assert.ok("indisponible" in technicalSummary([bar(0, 1)]));
  const bars = Array.from({ length: 300 }, (_, i) => bar(i, 100 + i * 0.5));
  const s = technicalSummary(bars) as Record<string, any>;
  assert.equal(s.dernier_cours.cloture, 249.5);
  assert.ok(s.moyennes_mobiles.cours_vs_200j_pct > 0);
  assert.equal(s.bougies_hebdo_recentes.length, 26);
});
