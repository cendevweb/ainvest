import { redirect } from "next/navigation";
import Link from "next/link";
import { isLoggedIn } from "@/lib/auth";
import { finaryStatus } from "@/lib/finary-oauth";
import { apiModeAvailable } from "@/lib/env";
import { latestBrief, parisDay } from "@/lib/brief";
import { BriefPanel } from "@/components/BriefPanel";
import { monthlyBudgetUsd, spentThisMonth } from "@/lib/budget";
import { getRules, hasRunToday, latestSession } from "@/lib/sessions";
import { Shell } from "@/components/Shell";
import { SessionView } from "@/components/SessionView";
import { RunButton } from "@/components/RunButton";
import { SeenMarker } from "@/components/SeenMarker";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await isLoggedIn())) redirect("/login");
  const [finary, session, rules, brief] = await Promise.all([finaryStatus(), latestSession(), getRules(), latestBrief()]);
  const spent = apiModeAvailable() ? await spentThisMonth().catch(() => 0) : 0;
  const pending = session?.proposals.filter((p) => p.decision.status === "pending").length ?? 0;
  const isNew = session?.status === "done" && !session.seenAt;
  // La séance lancée par l'app exige sa propre connexion Finary, que Finary réserve aux clients approuvés.
  const canRunHere = apiModeAvailable() && finary.connected;

  return (
    <Shell finaryConnected={finary.connected}>
      {isNew && session && (
        <div className="banner" role="status">
          <span className="chip warn"><span className="dot" />Nouveau</span>
          <span>Séance terminée : <b>{pending} proposition{pending > 1 ? "s" : ""}</b> t&apos;attend{pending > 1 ? "ent" : ""}.</span>
          <SeenMarker sessionId={session.id} />
        </div>
      )}

      <BriefPanel brief={brief} isToday={brief?.day === parisDay()} canRun={apiModeAvailable()} spent={spent} budget={monthlyBudgetUsd()} />

      {!session ? (
        <div className="panel empty">
          <h1>Prêt pour la première séance</h1>
          <p>
            Ta routine Claude lit ton patrimoine avec le connecteur Finary, parcourt l&apos;actualité de tes lignes puis dépose ici
            ses propositions grâce à ta routine Claude. Suis le guide docs/routine-claude.md pour la mettre en place.
          </p>
          {canRunHere ? <RunButton label="Lancer la première séance depuis l'app" /> : <Link className="btn primary" href="/parametres">Configurer le connecteur</Link>}
        </div>
      ) : (
        <>
          {!hasRunToday(session) && (
            <div className="banner">
              <span>Pas encore de séance aujourd&apos;hui. Elle arrive dès que ta routine Claude a déposé son rapport.</span>
              {canRunHere && <span style={{ marginLeft: "auto" }}><RunButton label="Lancer depuis l'app" /></span>}
            </div>
          )}
          <SessionView session={session} rules={rules} isLatest />
        </>
      )}
    </Shell>
  );
}
