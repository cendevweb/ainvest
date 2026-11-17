/*
 * Indicateurs techniques calculés à partir des cours de clôture quotidiens, pour que
 * ton Claude puisse « lire la courbe » sans image : moyennes mobiles, RSI, ATR,
 * plus hauts et plus bas, supports et résistances, bougies hebdomadaires.
 * Fonctions pures, testées dans indicators.test.ts.
 */

export type Bar = { date: string; open: number; high: number; low: number; close: number; volume: number };

const round = (x: number | null, digits = 4) => (x === null || !Number.isFinite(x) ? null : Number(x.toPrecision(digits + 2)));

/** Normalise les barres FMP (ordre chronologique croissant, valeurs numériques). */
export function normalizeBars(rows: unknown): Bar[] {
  if (!Array.isArray(rows)) return [];
  const bars = rows
    .map((r) => {
      const o = r as Record<string, unknown>;
      return {
        date: String(o.date ?? ""),
        open: Number(o.open),
        high: Number(o.high),
        low: Number(o.low),
        close: Number(o.close ?? o.price),
        volume: Number(o.volume ?? 0),
      };
    })
    .filter((b) => b.date && Number.isFinite(b.close) && Number.isFinite(b.high) && Number.isFinite(b.low));
  return bars.sort((a, b) => a.date.localeCompare(b.date));
}

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i += 1) sum += values[i];
  return sum / period;
}

/** RSI de Wilder. */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < closes.length; i += 1) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

/** ATR de Wilder. */
export function atr(bars: Bar[], period = 14): number | null {
  if (bars.length <= period) return null;
  const tr = bars.slice(1).map((b, i) => Math.max(b.high - b.low, Math.abs(b.high - bars[i].close), Math.abs(b.low - bars[i].close)));
  let value = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < tr.length; i += 1) value = (value * (period - 1) + tr[i]) / period;
  return value;
}

/** Regroupe les barres quotidiennes en semaines (clé : lundi de la semaine). */
export function weeklyBars(bars: Bar[]): Bar[] {
  const weeks = new Map<string, Bar>();
  for (const b of bars) {
    const d = new Date(`${b.date}T00:00:00Z`);
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
    const w = weeks.get(monday);
    if (!w) weeks.set(monday, { ...b, date: monday });
    else {
      w.high = Math.max(w.high, b.high);
      w.low = Math.min(w.low, b.low);
      w.close = b.close;
      w.volume += b.volume;
    }
  }
  return [...weeks.values()];
}

/**
 * Plus hauts et plus bas locaux (pivots) : une barre dont le haut (ou le bas) est le plus
 * extrême sur `span` barres de chaque côté. Les niveaux proches (moins de 2 %) sont fusionnés
 * et comptés comme des « touches ».
 */
export function pivotLevels(bars: Bar[], span = 2): { price: number; touches: number; last: string; kind: "support" | "resistance" }[] {
  const raw: { price: number; date: string; kind: "support" | "resistance" }[] = [];
  for (let i = span; i < bars.length - span; i += 1) {
    const win = bars.slice(i - span, i + span + 1);
    if (bars[i].high === Math.max(...win.map((b) => b.high))) raw.push({ price: bars[i].high, date: bars[i].date, kind: "resistance" });
    if (bars[i].low === Math.min(...win.map((b) => b.low))) raw.push({ price: bars[i].low, date: bars[i].date, kind: "support" });
  }
  const last = bars.at(-1)?.close ?? 0;
  const levels: { price: number; touches: number; last: string; kind: "support" | "resistance" }[] = [];
  for (const p of raw.sort((a, b) => a.price - b.price)) {
    const near = levels.find((l) => Math.abs(l.price - p.price) / l.price < 0.02);
    if (near) {
      near.price = (near.price * near.touches + p.price) / (near.touches + 1);
      near.touches += 1;
      if (p.date > near.last) near.last = p.date;
    } else levels.push({ price: p.price, touches: 1, last: p.date, kind: p.kind });
  }
  // Le rôle dépend de la position du cours actuel : sous le cours = support, au-dessus = résistance.
  return levels.map((l) => ({ ...l, price: round(l.price)!, kind: l.price <= last ? "support" : "resistance" }));
}

const pct = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : round(((a - b) / b) * 100, 2));

/** Synthèse technique d'une série quotidienne (au moins ~1 an conseillé). */
export function technicalSummary(input: Bar[]) {
  const bars = input;
  if (bars.length < 30) return { indisponible: "historique trop court pour des indicateurs fiables" };
  const closes = bars.map((b) => b.close);
  const last = bars.at(-1)!;
  const weeks = weeklyBars(bars);
  const wCloses = weeks.map((w) => w.close);
  const year = bars.slice(-252);
  const high52 = Math.max(...year.map((b) => b.high));
  const low52 = Math.min(...year.map((b) => b.low));
  const closeAgo = (n: number) => (closes.length > n ? closes[closes.length - 1 - n] : null);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const sma200Prev = closes.length >= 220 ? sma(closes.slice(0, -20), 200) : null;
  const w10 = sma(wCloses, 10);
  const w20 = sma(wCloses, 20);
  const w40 = sma(wCloses, 40);
  const atr14 = atr(bars, 14);
  const vol20 = sma(bars.map((b) => b.volume), 20);
  const vol50 = sma(bars.map((b) => b.volume), 50);
  const levels = pivotLevels(weeks.slice(-78), 2);
  const supports = levels.filter((l) => l.kind === "support").sort((a, b) => b.price - a.price).slice(0, 4);
  const resistances = levels.filter((l) => l.kind === "resistance").sort((a, b) => a.price - b.price).slice(0, 4);
  return {
    dernier_cours: { date: last.date, cloture: round(last.close) },
    performance_pct: { "1_mois": pct(last.close, closeAgo(21)), "3_mois": pct(last.close, closeAgo(63)), "6_mois": pct(last.close, closeAgo(126)), "1_an": pct(last.close, closeAgo(252)) },
    plus_haut_52_semaines: round(high52),
    plus_bas_52_semaines: round(low52),
    ecart_au_plus_haut_pct: pct(last.close, high52),
    moyennes_mobiles: {
      quotidienne_50j: round(sma50),
      quotidienne_200j: round(sma200),
      pente_200j_sur_1_mois_pct: pct(sma200, sma200Prev),
      hebdo_10s: round(w10),
      hebdo_20s: round(w20),
      hebdo_40s: round(w40),
      cours_vs_200j_pct: pct(last.close, sma200),
    },
    rsi_14j: round(rsi(closes, 14), 2),
    rsi_14s: round(rsi(wCloses, 14), 2),
    atr_14j: round(atr14),
    atr_14j_pct_du_cours: atr14 === null ? null : round((atr14 / last.close) * 100, 2),
    volume_moyen_20j_vs_50j: vol20 && vol50 ? round(vol20 / vol50, 2) : null,
    supports_proches: supports,
    resistances_proches: resistances,
    bougies_hebdo_recentes: weeks.slice(-26).map((w) => ({ semaine: w.date, o: round(w.open), h: round(w.high), b: round(w.low), c: round(w.close), v: Math.round(w.volume) })),
  };
}
