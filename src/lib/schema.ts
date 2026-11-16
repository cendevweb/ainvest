import { z } from "zod";

/** Format du rapport que Claude remet à la fin de chaque session (outil submit_report). */
export const ReportSchema = z.object({
  summary: z.string(),
  market_context: z.string(),
  snapshot: z.object({
    as_of: z.string(),
    net_worth_eur: z.number().nullable(),
    allocation: z.array(z.object({ label: z.string(), value_eur: z.number() })),
    cto: z.object({
      account_name: z.string(),
      total_eur: z.number(),
      cash_eur: z.number(),
      positions: z.array(
        z.object({
          name: z.string(),
          ticker: z.string(),
          isin: z.string().nullable(),
          sector: z.string(),
          quantity: z.number(),
          price_eur: z.number(),
          value_eur: z.number(),
          pru_eur: z.number().nullable(),
        }),
      ),
    }),
  }),
  proposals: z.array(
    z.object({
      action: z.enum(["buy", "sell", "protect", "hold"]),
      title: z.string(),
      ticker: z.string(),
      name: z.string(),
      sector: z.string(),
      quantity: z.number(),
      order_type: z.enum(["market", "limit", "stop", "trailing_stop", "none"]),
      limit_price_eur: z.number().nullable(),
      est_amount_eur: z.number(),
      realized_gain_eur: z.number().nullable(),
      confidence: z.number(),
      arguments: z.array(z.object({ label: z.string(), text: z.string() })),
      abandon_level: z.string(),
      rationale: z.string(),
      sources: z.array(z.object({ title: z.string(), url: z.string() })),
    }),
  ),
  news: z.array(
    z.object({ title: z.string(), source: z.string(), url: z.string(), date: z.string(), tickers: z.array(z.string()) }),
  ),
});
export type Report = z.infer<typeof ReportSchema>;
export type Proposal = Report["proposals"][number];

/** JSON Schema strict équivalent, pour la définition de l'outil côté API Claude. */
const str = { type: "string" } as const;
const num = { type: "number" } as const;
const numOrNull = { type: ["number", "null"] } as const;
const strOrNull = { type: ["string", "null"] } as const;
function obj(properties: Record<string, unknown>) {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}
function arr(items: unknown) {
  return { type: "array", items };
}

export const reportJsonSchema = obj({
  summary: { ...str, description: "Synthèse de la séance en 3 à 5 phrases, en français, tutoiement." },
  market_context: { ...str, description: "Contexte de marché et ce que tu refuses de faire, avec la raison." },
  snapshot: obj({
    as_of: { ...str, description: "Date des données Finary (AAAA-MM-JJ)." },
    net_worth_eur: numOrNull,
    allocation: arr(obj({ label: { ...str, description: "Classe d'actifs ou compte" }, value_eur: num })),
    cto: obj({
      account_name: str,
      total_eur: { ...num, description: "Valeur totale du CTO, liquidités comprises." },
      cash_eur: num,
      positions: arr(
        obj({
          name: str,
          ticker: str,
          isin: strOrNull,
          sector: str,
          quantity: num,
          price_eur: num,
          value_eur: num,
          pru_eur: numOrNull,
        }),
      ),
    }),
  }),
  proposals: arr(
    obj({
      action: { type: "string", enum: ["buy", "sell", "protect", "hold"] },
      title: { ...str, description: "Titre court à l'infinitif, ex. « Alléger LVMH »." },
      ticker: str,
      name: str,
      sector: str,
      quantity: { ...num, description: "Nombre de titres. 0 pour hold." },
      order_type: { type: "string", enum: ["market", "limit", "stop", "trailing_stop", "none"] },
      limit_price_eur: numOrNull,
      est_amount_eur: { ...num, description: "Montant estimé de l'ordre en euros. 0 pour hold ou protect." },
      realized_gain_eur: { ...numOrNull, description: "Plus ou moins-value réalisée estimée pour une vente, sinon null." },
      confidence: { ...num, description: "Confiance de 0 à 100." },
      arguments: arr(obj({ label: str, text: str })),
      abandon_level: { ...str, description: "Ce qui invaliderait la proposition (prix, événement)." },
      rationale: { ...str, description: "Raisonnement complet : options envisagées et pourquoi celle-ci." },
      sources: arr(obj({ title: str, url: str })),
    }),
  ),
  news: arr(obj({ title: str, source: str, url: str, date: str, tickers: arr(str) })),
});
