import Link from "next/link";
import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { finaryStatus } from "@/lib/finary-oauth";
import { listSessions } from "@/lib/sessions";
import { Shell } from "@/components/Shell";
import { dateFr, duration } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Journal() {
  if (!(await isLoggedIn())) redirect("/login");
  const [sessions, finary] = await Promise.all([listSessions(60), finaryStatus()]);
  const all = sessions.flatMap((s) => s.proposals.filter((p) => p.action !== "hold"));
  const decided = all.filter((p) => ["approved", "done", "rejected"].includes(p.decision.status));
  const accepted = all.filter((p) => ["approved", "done"].includes(p.decision.status));

  return (
    <Shell finaryConnected={finary.connected}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Historique</div>
          <h1>Journal des séances</h1>
          <p>Chaque séance garde son raisonnement, ses sources et tes décisions. Claude relit tes choix de la veille avant de proposer.</p>
        </div>
      </div>
      <div className="grid">
        <div className="panel">
          {sessions.length === 0 && <p className="muted" style={{ margin: 0 }}>Aucune séance pour l&apos;instant.</p>}
          {sessions.map((s) => {
            const actions = s.proposals.filter((p) => p.action !== "hold");
            return (
              <Link key={s.id} href={`/seance/${s.id}`} className="row" style={{ color: "inherit", textDecoration: "none" }}>
                <div>
                  <b style={{ textTransform: "capitalize" }}>{dateFr(s.startedAt, true)}</b>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    {s.status === "error" ? s.error : actions.length ? actions.map((p) => p.title).join(" · ") : "Aucune action proposée"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {s.status === "error" ? <span className="chip bad">Échec</span> : <span className="chip">{s.trigger === "cron" ? "Planifiée" : "Manuelle"}</span>}
                  {s.stats && <span className="chip">{duration(s.stats.durationMs)}</span>}
                </div>
              </Link>
            );
          })}
        </div>
        <div className="panel">
          <h2>Bilan</h2>
          <div className="stats">
            <div><div className="v">{all.length}</div><div className="s">propositions</div></div>
            <div><div className="v">{decided.length ? Math.round((accepted.length / decided.length) * 100) : 0} %</div><div className="s">approuvées</div></div>
            <div><div className="v">{all.filter((p) => p.decision.status === "blocked").length}</div><div className="s">bloquées par tes règles</div></div>
            <div><div className="v">{sessions.length}</div><div className="s">séances</div></div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
