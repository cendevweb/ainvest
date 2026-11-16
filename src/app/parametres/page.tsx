import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { finaryStatus, redirectUri } from "@/lib/finary-oauth";
import { model } from "@/lib/env";
import { Shell } from "@/components/Shell";
import { dateFr } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Settings({ searchParams }: { searchParams: Promise<{ erreur?: string; finary?: string }> }) {
  if (!(await isLoggedIn())) redirect("/login");
  const { erreur, finary: finaryParam } = await searchParams;
  const finary = await finaryStatus();
  return (
    <Shell finaryConnected={finary.connected}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Configuration</div>
          <h1>Paramètres</h1>
          <p>Ton instance est à toi seul : ta clé Claude reste dans tes variables Vercel, ton jeton Finary est chiffré dans ta base Redis.</p>
        </div>
      </div>
      {erreur && <div className="banner" role="alert"><span className="chip bad">Erreur</span>{erreur}</div>}
      {finaryParam === "ok" && <div className="banner" role="status"><span className="chip ok">Connecté</span>Finary est connecté. Tu peux lancer une séance.</div>}
      <div className="grid">
        <div className="panel">
          <h2>Finary</h2>
          {finary.connected ? (
            <>
              <p style={{ marginTop: 0 }}>
                Connecté depuis le {dateFr(finary.connectedAt!)}.
                {finary.expiresAt ? " Le jeton se renouvelle automatiquement." : ""}
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <a className="btn" href="/api/finary/connect">Reconnecter</a>
                <form action="/api/finary/disconnect" method="post"><button className="btn danger" type="submit">Déconnecter</button></form>
              </div>
            </>
          ) : (
            <>
              <p style={{ marginTop: 0 }}>Tu vas être redirigé vers l&apos;écran d&apos;autorisation Finary. Accorde l&apos;accès en lecture au patrimoine ; les autres droits sont facultatifs.</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a className="btn primary" href="/api/finary/connect">Connecter Finary</a>
                <form action="/api/finary/disconnect" method="post"><button className="btn" type="submit">Réinitialiser le client OAuth</button></form>
              </div>
            </>
          )}
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>URL de retour OAuth : <code>{redirectUri()}</code>. Tu peux révoquer l&apos;accès à tout moment dans Finary, rubrique Sécurité.</p>
        </div>
        <div className="panel">
          <h2>Claude</h2>
          <div className="row"><span>Modèle</span><code>{model()}</code></div>
          <div className="row"><span>Clé API</span><span className="chip ok">Dans les variables Vercel</span></div>
          <div className="row"><span>Séance planifiée</span><span>Jours ouvrés, avant 9 h (heure de Paris)</span></div>
        </div>
      </div>
    </Shell>
  );
}
