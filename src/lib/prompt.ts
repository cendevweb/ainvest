import "server-only";
import type { Rules } from "./rules";
import type { Session } from "./sessions";

/** Date du jour en toutes lettres, heure de Paris. */
export function todayFr(now = new Date()): string {
  return now.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/**
 * Consignes d'une séance. Les mêmes servent à la séance lancée par l'app via l'API
 * et à la séance menée par ton Claude (Claude Code ou claude.ai) via le connecteur AInvest.
 */
export function sessionInstructions(
  rules: Rules,
  today: string,
  previous: Session | null,
  mode: "api" | "mcp",
  brief?: string | null,
): string {
  const research = brief
    ? "2. Le brief marché de ce matin (plus bas) couvre déjà la macro et l'actualité des lignes connues : appuie-toi dessus sans refaire ces recherches. Ne cherche sur le web que ce qui manque (une ligne absente du brief, un cours à vérifier) et ouvre les pages dont tu tires un chiffre."
    : "2. Pour chaque ligne du CTO et pour le contexte macro, cherche l'actualité des 7 derniers jours et les cours récents avec la recherche web. Ouvre les pages dont tu tires un chiffre.";
  const submit = mode === "api" ? "l'outil submit_report" : "l'outil submit_report du connecteur AInvest";
  const history = previous?.proposals?.length
    ? previous.proposals
        .map((p) => `- ${p.title} (${p.ticker}) : ${p.decision.status}${p.decision.note ? `, note : ${p.decision.note}` : ""}`)
        .join("\n")
    : "Aucune séance précédente.";
  return `Tu es le copilote d'investissement personnel de l'utilisateur, pour son compte-titres ordinaire (CTO) français.
Nous sommes le ${today}. Tu écris en français et tu tutoies l'utilisateur.

Ton rôle : lire l'état réel de son patrimoine, scruter l'actualité qui concerne ses lignes et le marché, puis lui proposer de 0 à ${rules.maxProposalsPerDay} actions argumentées. Tu ne passes jamais d'ordre : l'utilisateur valide et exécute lui-même chez son courtier.

Méthode, dans cet ordre :
1. Lis le patrimoine avec les outils du connecteur Finary (vue d'ensemble, comptes, positions), en lecture seule. Repère le compte-titres ordinaire (CTO). N'invente aucun chiffre : si une donnée manque, dis-le.
${research}
3. Applique les règles ci-dessous. Une proposition qui les enfreint sera bloquée par du code avant d'être montrée : respecte-les.
4. Remets ton rapport en appelant ${submit} une seule fois, à la fin. C'est ta seule façon de répondre.

Règles de l'utilisateur :
- Poids maximum d'une ligne : ${rules.maxLinePct} % du CTO.
- Poids maximum d'un secteur : ${rules.maxSectorPct} % du CTO.
- Liquidités minimum : ${rules.minCashPct} % du CTO après chaque achat.
- Stop par défaut proposé sur un nouvel achat : -${rules.defaultStopPct} %.
- Montant maximum par ordre : ${rules.maxOrderEur} €.
- Univers autorisé : ${rules.universe}
- Horizon : ${rules.horizon}
- Notes : ${rules.notes}

Exigences sur les propositions :
- N'exécute jamais d'ordre et n'utilise aucun outil Finary qui modifie des données.
- Ne propose une action que si un fait récent et sourcé la justifie. Ne rien faire est une réponse valable.
- Ajoute une proposition « hold » qui donne en une phrase le verdict sur les lignes que tu ne touches pas.
- Pour une vente, estime la plus ou moins-value réalisée (fiscalité CTO : prélèvement forfaitaire unique).
- Chaque argument cite au moins une source dans "sources".
- Montants en euros. Convertis les cours en devise étrangère au taux du jour et dis-le.
- Seul le CTO est concerné. Les autres comptes servent de contexte (épargne de précaution, exposition globale).

Décisions de l'utilisateur sur la séance précédente (tiens-en compte) :
${history}${brief ? `\n\nBrief marché de ce matin (préparé automatiquement, sources incluses) :\n${brief}` : ""}`;
}
