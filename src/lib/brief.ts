import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam, BetaToolUnion } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import { requireEnv } from "./env";
import { arr, obj, str } from "./schema";
import { keys, redis } from "./store";
import { getRules, latestSession } from "./sessions";
import { todayFr } from "./prompt";
import { assertBudget, costUsd, recordSpend } from "./budget";

/*
 * Brief marché du matin, produit par la tâche planifiée Vercel avec TA clé API Claude.
 * Il ne touche pas à Finary : il couvre le contexte macro et l'actualité des lignes
 * connues par la dernière séance. Ta routine Claude le récupère via get_session_context
 * et se concentre sur la lecture du patrimoine et les décisions.
 */

export const BriefSchema = z.object({
  macro: z.string(),
  markets: z.string(),
  agenda: z.array(z.object({ date: z.string(), event: z.string() })),
  items: z.array(
    z.object({
      ticker: z.string(),
      name: z.string(),
      headline: z.string(),
      summary: z.string(),
      impact: z.enum(["positive", "negative", "neutral"]),
      date: z.string(),
      sources: z.array(z.object({ title: z.string(), url: z.string() })),
    }),
  ),
});
export type BriefContent = z.infer<typeof BriefSchema>;

export type Brief = {
  day: string;
  createdAt: number;
  model: string;
  tickers: string[];
  content: BriefContent;
  stats: { durationMs: number; searches: number; inputTokens: number; outputTokens: number; costUsd: number };
};

const briefJsonSchema = obj({
  macro: { ...str, description: "Contexte macro et taux en 4 à 6 phrases : banques centrales, inflation, devises, matières premières." },
  markets: { ...str, description: "Ce qui a bougé la veille et ce matin : indices européens et américains, secteurs, avec chiffres." },
  agenda: arr(obj({ date: str, event: { ...str, description: "Publication, résultats, réunion de banque centrale à venir cette semaine." } })),
  items: arr(
    obj({
      ticker: str,
      name: str,
      headline: { ...str, description: "Le fait marquant en une phrase." },
      summary: { ...str, description: "2 à 4 phrases factuelles, chiffres et date compris." },
      impact: { type: "string", enum: ["positive", "negative", "neutral"] },
      date: { ...str, description: "Date de l'information (AAAA-MM-JJ)." },
      sources: arr(obj({ title: str, url: str })),
    }),
  ),
});

export const parisDay = (d = new Date()) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

export async function getBrief(day = parisDay()): Promise<Brief | null> {
  return (await redis().get<Brief>(keys.brief(day))) ?? null;
}

export async function latestBrief(): Promise<Brief | null> {
  return (await redis().get<Brief>(keys.briefLatest)) ?? null;
}

/** Texte du brief, inséré dans les consignes de la routine. */
export function briefAsText(b: Brief): string {
  const items = b.content.items.length
    ? b.content.items
        .map((i) => `- ${i.name} (${i.ticker}), ${i.date}, impact ${i.impact} : ${i.headline} ${i.summary} Sources : ${i.sources.map((s) => s.url).join(", ")}`)
        .join("\n")
    : "- Aucune actualité notable sur les lignes suivies.";
  const agenda = b.content.agenda.map((a) => `- ${a.date} : ${a.event}`).join("\n") || "- Rien de notable.";
  return `Macro : ${b.content.macro}\n\nMarchés : ${b.content.markets}\n\nAgenda :\n${agenda}\n\nActualité des lignes (${b.tickers.join(", ") || "aucune ligne connue"}) :\n${items}`;
}

/** Produit et enregistre le brief du jour. */
export async function runBrief(): Promise<Brief> {
  const started = Date.now();
  await assertBudget();
  // Sonnet par défaut : le brief est surtout de la recherche et de la synthèse.
  const modelId = process.env.AINVEST_BRIEF_MODEL || "claude-sonnet-5-5";
  const [rules, last] = await Promise.all([getRules(), latestSession()]);
  const positions = last?.report?.snapshot.cto.positions ?? [];
  const lines = positions.map((p) => `- ${p.name} (${p.ticker}${p.isin ? `, ${p.isin}` : ""}), secteur ${p.sector}`).join("\n");

  const system = `Tu prépares le brief marché du matin d'un investisseur particulier français, pour son compte-titres ordinaire.
Nous sommes le ${todayFr()}. Tu écris en français, de façon factuelle et concise. Tu ne donnes aucune recommandation d'achat ou de vente : un autre agent décidera avec les positions réelles.

1. Contexte macro et marchés : cherche ce qui a bougé depuis la veille (indices européens et américains, taux, euro-dollar, pétrole, or) et l'agenda de la semaine.
2. Pour chaque ligne ci-dessous, cherche l'actualité des 7 derniers jours (résultats, guidance, notes d'analystes, litiges, opérations). Ouvre les pages dont tu tires un chiffre. Ne crée une entrée que pour un fait réel et daté.
3. Remets le brief en appelant submit_brief une seule fois.

Lignes suivies (dernière séance connue) :
${lines || "- Aucune ligne connue : couvre seulement la macro et les marchés."}

Univers de l'investisseur : ${rules.universe}`;

  const client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  const tools: BetaToolUnion[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: 12 },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 6 },
    { name: "submit_brief", description: "Remet le brief marché du matin.", strict: true, input_schema: briefJsonSchema as never },
  ];
  const messages: BetaMessageParam[] = [{ role: "user", content: "Prépare le brief marché de ce matin et remets-le avec submit_brief." }];

  let input: unknown = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let searches = 0;
  for (let turn = 0; turn < 6 && input === null; turn += 1) {
    const message = await client.beta.messages
      .stream({
        model: modelId,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system,
        tools,
        messages,
      })
      .finalMessage();
    inputTokens += message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0) + (message.usage.cache_creation_input_tokens ?? 0);
    outputTokens += message.usage.output_tokens;
    for (const block of message.content) {
      if (block.type === "server_tool_use" && block.name === "web_search") searches += 1;
      if (block.type === "tool_use" && block.name === "submit_brief") input = block.input;
    }
    if (input !== null) break;
    if (message.stop_reason === "refusal") throw new Error("Claude a refusé de préparer le brief.");
    messages.push({ role: "assistant", content: message.content });
    if (message.stop_reason !== "pause_turn") messages.push({ role: "user", content: "Remets maintenant le brief avec submit_brief." });
  }
  if (input === null) throw new Error("Le brief s'est terminé sans résultat.");

  const brief: Brief = {
    day: parisDay(),
    createdAt: Date.now(),
    model: modelId,
    tickers: positions.map((p) => p.ticker),
    content: BriefSchema.parse(input),
    stats: {
      durationMs: Date.now() - started,
      searches,
      inputTokens,
      outputTokens,
      costUsd: costUsd(modelId, inputTokens, outputTokens, searches),
    },
  };
  await redis().set(keys.brief(brief.day), brief, { ex: 60 * 60 * 24 * 30 });
  await redis().set(keys.briefLatest, brief);
  await recordSpend(brief.stats.costUsd);
  return brief;
}
