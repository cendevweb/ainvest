import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { apiModeAvailable, connectorUrl } from "@/lib/env";
import { monthlyBudgetUsd, spentThisMonth } from "@/lib/budget";
import { Shell } from "@/components/Shell";
import { routineConfigured } from "@/lib/routine";

export const dynamic = "force-dynamic";

export default async function Settings() {
  if (!(await isLoggedIn())) redirect("/login");
  const connector = connectorUrl();
  const hasKey = apiModeAvailable();
  const spent = hasKey ? await spentThisMonth().catch(() => 0) : 0;
  return (
    <Shell>
      <div className="page-head">
        <div>
          <div className="eyebrow">Configuration</div>
          <h1>Paramètres</h1>
          <p>
            Ta routine Claude lit ton patrimoine avec son connecteur Finary et dépose ses rapports ici via le connecteur AInvest.
            L&apos;app n&apos;a aucun accès direct à Finary.
          </p>
        </div>
      </div>
      <div className="grid">
        <div className="panel">
          <h2>Connecteur AInvest</h2>
          {connector ? (
            <>
              <p style={{ marginTop: 0 }}>
                Ajoute cette URL comme connecteur personnalisé sur claude.ai (Réglages → Connecteurs), à côté de Finary, puis clique sur
                « Connecter ». Elle contient un secret : ne la partage pas.
              </p>
              <pre className="code-block"><code>{connector}</code></pre>
            </>
          ) : (
            <p style={{ marginTop: 0 }}>
              Définis <code>INGEST_TOKEN</code> dans les variables Vercel (<code>openssl rand -base64 32 | tr &apos;+/&apos; &apos;-_&apos; | tr -d &apos;=&apos;</code>) puis
              redéploie pour obtenir l&apos;URL du connecteur.
            </p>
          )}
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
            La séance quotidienne est une tâche planifiée Claude : voir le guide <code>docs/routine-claude.md</code> du dépôt.
          </p>
        </div>
        <div className="panel">
          <h2>Lancement depuis l&apos;app</h2>
          <div className="row">
            <span>Déclencheur de la routine</span>
            {routineConfigured() ? <span className="chip ok">Configuré</span> : <span className="chip warn">À configurer</span>}
          </div>
          <p style={{ marginBottom: 0 }}>
            Le bouton « Lancer une séance » démarre ta routine Claude sans ouvrir claude.ai. Sur{" "}
            <a href="https://claude.ai/code/routines" target="_blank" rel="noreferrer noopener">claude.ai/code/routines</a>, ouvre la
            routine AInvest, ajoute un déclencheur « API » et génère son jeton. Copie l&apos;URL dans <code>ROUTINE_FIRE_URL</code> et le
            jeton dans <code>ROUTINE_FIRE_TOKEN</code> (variables Vercel), puis redéploie. Le jeton permet seulement de lancer cette
            routine ; la séance est décomptée de ton abonnement Claude.
          </p>
        </div>
        <div className="panel">
          <h2>Brief marché (clé API)</h2>
          <div className="row">
            <span>Clé API</span>
            {hasKey ? <span className="chip ok">Dans les variables Vercel</span> : <span className="chip warn">Absente : pas de brief</span>}
          </div>
          <div className="row"><span>Modèle</span><code>{process.env.AINVEST_BRIEF_MODEL || "claude-sonnet-5-5"}</code></div>
          <div className="row"><span>Horaire</span><span>Jours ouvrés, 6 h 15 (7 h 15 en été)</span></div>
          {hasKey && <div className="row"><span>Dépense du mois</span><span>{spent.toFixed(2)} $ / {monthlyBudgetUsd()} $</span></div>}
        </div>
      </div>
    </Shell>
  );
}
