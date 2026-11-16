import { redirect } from "next/navigation";
import Link from "next/link";
import { isLoggedIn } from "@/lib/auth";
import { finaryStatus } from "@/lib/finary-oauth";
import { getRules, hasRunToday, latestSession } from "@/lib/sessions";
import { Shell } from "@/components/Shell";
import { SessionView } from "@/components/SessionView";
import { RunButton } from "@/components/RunButton";
import { SeenMarker } from "@/components/SeenMarker";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await isLoggedIn())) redirect("/login");
  const [finary, session, rules] = await Promise.all([finaryStatus(), latestSession(), getRules()]);
  const pending = session?.proposals.filter((p) => p.decision.status === "pending").length ?? 0;
  const isNew = session?.status === "done" && !session.seenAt;

  return (
    <Shell finaryConnected={finary.connected}>
      {isNew && session && (
        <div className="banner" role="status">
          <span className="chip warn"><span className="dot" />Nouveau</span>
          <span>Séance terminée : <b>{pending} proposition{pending > 1 ? "s" : ""}</b> t&apos;attend{pending > 1 ? "ent" : ""}.</span>
          <SeenMarker sessionId={session.id} />
        </div>
      )}

      {!finary.connected ? (
        <div className="panel empty">
          <h1>Connecte ton patrimoine</h1>
          <p>AInvest lit tes comptes et positions via le connecteur officiel Finary, en lecture seule. Connecte-le pour lancer la première séance.</p>
          <Link className="btn primary" href="/parametres">Connecter Finary</Link>
        </div>
      ) : !session ? (
        <div className="panel empty">
          <h1>Prêt pour la première séance</h1>
          <p>Claude va lire ton patrimoine, parcourir l&apos;actualité de tes lignes et te proposer quelques actions à valider. Compte quelques minutes.</p>
          <RunButton label="Lancer la première séance" />
        </div>
      ) : (
        <>
          {!hasRunToday(session) && (
            <div className="banner">
              <span>Pas encore de séance aujourd&apos;hui. La prochaine tourne automatiquement chaque jour ouvré avant l'ouverture de la Bourse.</span>
              <span style={{ marginLeft: "auto" }}><RunButton label="Lancer maintenant" /></span>
            </div>
          )}
          <SessionView session={session} rules={rules} isLatest />
        </>
      )}
    </Shell>
  );
}
