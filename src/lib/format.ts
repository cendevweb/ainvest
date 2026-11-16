export const eur = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined
    ? "–"
    : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: digits, maximumFractionDigits: digits });

export const pct = (n: number, digits = 1) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;

export const signedEur = (n: number) => `${n >= 0 ? "+" : ""}${eur(n)}`;

export const dateFr = (ts: number, withTime = false) =>
  new Date(ts).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });

export const duration = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}`;
};

export const ACTION_LABEL: Record<string, string> = {
  buy: "Achat",
  sell: "Vente",
  protect: "Protection",
  hold: "Conserver",
};

export const ORDER_LABEL: Record<string, string> = {
  market: "au marché",
  limit: "à cours limité",
  stop: "stop",
  trailing_stop: "stop suiveur",
  none: "",
};
