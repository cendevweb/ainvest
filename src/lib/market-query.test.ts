import { test } from "node:test";
import assert from "node:assert/strict";
import { compact, fmpErrorMessage, fmpUrl, pick, screenerParams } from "./market-query.ts";

test("le screener ne garde que les filtres connus et bien typés", () => {
  const p = screenerParams({ sector: "Technology", marketCapMoreThan: 1e10, betaLowerThan: "1", apikey: "vol", foo: 1, isEtf: false });
  assert.deepEqual(p, { isActivelyTrading: "true", limit: "25", sector: "Technology", marketCapMoreThan: "10000000000", isEtf: "false" });
});

test("la limite du screener est bornée", () => {
  assert.equal(screenerParams({ limit: 500 }).limit, "50");
  assert.equal(screenerParams({ limit: 0 }).limit, "25");
  assert.equal(screenerParams(null).limit, "25");
});

test("l'URL FMP place la clé en dernier et encode les paramètres", () => {
  assert.equal(fmpUrl("profile", { symbol: "MC.PA" }, "k"), "https://financialmodelingprep.com/stable/profile?symbol=MC.PA&apikey=k");
});

test("compact arrondit et retire les champs vides", () => {
  assert.deepEqual(compact({ a: 1.234567891, b: null, c: "", d: [{ e: 2, f: null }] }), { a: 1.2346, d: [{ e: 2 }] });
});

test("pick ne garde que les champs demandés", () => {
  assert.deepEqual(pick([{ date: "2025", revenue: 10, junk: 1 }], ["date", "revenue"]), [{ date: "2025", revenue: 10 }]);
  assert.deepEqual(pick("x", ["date"]), []);
});

test("les erreurs FMP sont traduites", () => {
  assert.match(fmpErrorMessage(401, { "Error Message": "Invalid API KEY." }), /clé FMP/);
  assert.match(fmpErrorMessage(402, { "Error Message": "Premium Query Parameter" }), /offre FMP/);
  assert.match(fmpErrorMessage(429, { "Error Message": "Limit Reach" }), /quota/);
});
