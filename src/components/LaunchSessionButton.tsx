/*
 * Lance une séance à la main : ouvre claude.ai avec la consigne de séance préremplie.
 * La séance tourne sur ton abonnement Claude, avec tes connecteurs Finary et AInvest,
 * exactement comme la tâche planifiée du matin. Le rapport arrive ensuite dans l'app.
 */
const PROMPT = [
  "Lance une séance AInvest maintenant pour mon compte-titres ordinaire (CTO).",
  "1. Appelle get_session_context du connecteur AInvest et suis exactement ses consignes (règles, décisions précédentes, méthode, brief marché s'il est présent).",
  "2. Lis mon patrimoine avec le connecteur Finary, en lecture seule. N'invente aucun chiffre.",
  "3. Cherche sur le web l'actualité qui manque au brief.",
  "4. Termine en appelant submit_report du connecteur AInvest une seule fois. Si le rapport est refusé, corrige-le et renvoie-le.",
  "5. Résume ce que tu proposes et donne le lien de la séance.",
  "Ne passe jamais d'ordre.",
].join("\n");

export const LAUNCH_URL = `https://claude.ai/new?q=${encodeURIComponent(PROMPT)}`;

export function LaunchSessionButton({ label = "Lancer une séance", className = "btn primary", hint = true }: { label?: string; className?: string; hint?: boolean }) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 6 }}>
      <a className={className} href={LAUNCH_URL} target="_blank" rel="noreferrer noopener">
        {label}
      </a>
      {hint && (
        <span className="muted" style={{ fontSize: 12 }}>
          S&apos;ouvre dans claude.ai avec la consigne prête : vérifie que Finary et AInvest sont activés, puis envoie. Recharge cette page une fois le rapport déposé.
        </span>
      )}
    </span>
  );
}
