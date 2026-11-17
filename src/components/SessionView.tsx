import Link from "next/link";
import { isStale, type Session, type TraceStep } from "@/lib/sessions";
import type { Rules } from "@/lib/rules";
import { dateFr, duration, eur, pct, signedEur } from "@/lib/format";
import { ProposalCard } from "./ProposalCard";
import { LaunchSession } from "./LaunchSession";
import { LiveRefresh } from "./LiveRefresh";
import { AllocationDonut } from "./AllocationDonut";

const KIND_ICON: Record<string, string> = { finary: "F", web_search: "W", web_fetch: "P", decision: "D", report: "✓", other: "·" };

function timeFr(ms?: number) {
  return ms ? new Date(ms).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
}

/** Journal de la séance : actions principales de Claude et décisions de son raisonnement. */
function Journal({ steps }: { steps: TraceStep[] }) {
  if (!steps.length) return <p className="muted" style={{ margin: 0 }}>Aucune étape journalisée pour l&apos;instant.</p>;
  return (
    <ol className="trace">
      {steps.map((t, i) => (
        <li key={i} className={t.kind === "decision" ? "is-decision" : undefined}>
          <span className={`ic ${t.kind}`}>{KIND_ICON[t.kind] ?? "·"}</span>
          <div>
            <div className="tool">{t.kind === "decision" ? "Décision" : t.tool}{t.at ? ` · ${timeFr(t.at)}` : ""}</div>
            <div className="d">{t.label}</div>
            {t.detail && <div className="dd">{t.detail}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function SessionView({ session, rules, isLatest }: { session: Session; rules: Rules; isLatest: boolean }) {
  const r = session.report;
  const pending = session.proposals.filter((p) => p.decision.status === "pending").length;
  const approved = session.proposals.filter((p) => p.decision.status === "approved").length;

  if (session.status !== "done" || !r) {
    const stale = isStale(session);
    const running = session.status === "running" && !stale;
    return (
      <div className="stack">
        {running && <LiveRefresh />}
        <div className="panel empty">
          <h2>{running ? <><span className="spin" aria-hidden="true" style={{ display: "inline-block", marginRight: 10, verticalAlign: "-1px" }} />Séance en cours…</> : stale ? "La séance s'est interrompue" : "La séance a échoué"}</h2>
          <p>
            {running
              ? "Claude lit ton patrimoine et l'actualité. Le journal ci-dessous se met à jour tout seul, le résultat s'affichera ici."
              : stale
                ? "Aucun rapport n'est arrivé dans les 45 minutes. Ouvre la conversation Claude pour voir ce qui s'est passé, ou relance."
                : session.error}
          </p>
          {session.claudeSessionUrl && (
            <p style={{ marginTop: 0 }}>
              <a href={session.claudeSessionUrl} target="_blank" rel="noreferrer noopener" className="muted" style={{ fontSize: 13 }}>
                Voir la conversation de la routine sur claude.ai
              </a>
            </p>
          )}
          {isLatest && !running && <LaunchSession label="Relancer une séance" />}
        </div>
        <div className="panel">
          <h2>Journal de la séance</h2>
          <Journal steps={session.trace} />
        </div>
      </div>
    );
  }

  const cto = r.snapshot.cto;
  const latent = cto.positions.reduce((s, p) => s + (p.pru_eur !== null ? (p.price_eur - p.pru_eur) * p.quantity : 0), 0);

  return (
    <>
      <section className="hero">
        <div style={{ position: "relative", zIndex: 1 }}>
          <div className="eyebrow">Séance du {dateFr(session.startedAt, true)}</div>
          <h1>
            {pending > 0
              ? `${pending} proposition${pending > 1 ? "s" : ""} à valider`
              : approved > 0
                ? `${approved} ordre${approved > 1 ? "s" : ""} à passer chez ton courtier`
                : "Rien à faire aujourd'hui"}
          </h1>
          <p>{r.summary}</p>
          {isLatest && (
            <div className="actions">
              <LaunchSession label="Relancer une séance" className="btn secondary" />
            </div>
          )}
        </div>
        <div className="kpi">
          <div><div className="eyebrow">Patrimoine net</div><div className="v">{eur(r.snapshot.net_worth_eur)}</div></div>
          <div><div className="eyebrow">CTO</div><div className="v">{eur(cto.total_eur)}</div></div>
          <div><div className="eyebrow">Liquidités CTO</div><div className="v">{pct((cto.cash_eur / cto.total_eur) * 100)}</div><div className="s">{eur(cto.cash_eur)}</div></div>
          <div><div className="eyebrow">Latent CTO</div><div className="v">{signedEur(latent)}</div></div>
        </div>
      </section>

      <div className="grid" style={{ marginTop: 22 }}>
        <div className="stack">
          <div>
            {session.proposals.length === 0 ? (
              <div className="panel"><p className="muted" style={{ margin: 0 }}>Aucune proposition sur cette séance.</p></div>
            ) : (
              session.proposals.map((p) => <ProposalCard key={p.id} p={p} sessionId={session.id} />)
            )}
          </div>

          <div className="panel">
            <h2>Contexte de marché</h2>
            <p style={{ margin: 0, whiteSpace: "pre-line", maxWidth: "72ch" }}>{r.market_context}</p>
          </div>

          <div className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <h2>Positions du CTO</h2>
              <span className="muted" style={{ fontSize: 12 }}>{cto.account_name} · données Finary du {r.snapshot.as_of}</span>
            </div>
            <div className="scroll-x">
              <table>
                <thead>
                  <tr><th>Valeur</th><th className="r">Qté</th><th className="r">PRU</th><th className="r">Cours</th><th className="r">Valeur</th><th className="r">+/- latente</th><th>Poids</th></tr>
                </thead>
                <tbody>
                  {cto.positions.map((p) => {
                    const w = (p.value_eur / cto.total_eur) * 100;
                    const pl = p.pru_eur !== null ? (p.price_eur - p.pru_eur) * p.quantity : null;
                    return (
                      <tr key={p.ticker + p.name}>
                        <td><b>{p.name}</b> <span className="tk">{p.ticker}</span><br /><span className="tk">{p.sector}</span></td>
                        <td className="r num">{p.quantity.toLocaleString("fr-FR")}</td>
                        <td className="r num">{p.pru_eur !== null ? eur(p.pru_eur, 2) : "–"}</td>
                        <td className="r num">{eur(p.price_eur, 2)}</td>
                        <td className="r num">{eur(p.value_eur)}</td>
                        <td className={`r num ${pl === null ? "" : pl >= 0 ? "pos" : "neg"}`}>{pl === null ? "–" : signedEur(pl)}</td>
                        <td>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <div className="bar" style={{ width: 70 }}><i className={w > rules.maxLinePct ? "over" : ""} style={{ width: `${Math.min((w / rules.maxLinePct) * 100, 100)}%` }} /></div>
                            <span className="num" style={{ fontSize: 12 }}>{pct(w)}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <h2>Répartition du patrimoine</h2>
            <AllocationDonut rows={r.snapshot.allocation} />
          </div>
          {session.stats && (
            <div className="panel">
              <h2>La séance en chiffres</h2>
              <div className="stats">
                <div><div className="v">{session.stats.sources}</div><div className="s">recherches et pages lues</div></div>
                <div><div className="v">{duration(session.stats.durationMs)}</div><div className="s">durée</div></div>
                {session.stats.costUsd > 0 ? (
                  <div><div className="v">{session.stats.costUsd.toFixed(2).replace(".", ",")} $</div><div className="s">coût API estimé</div></div>
                ) : (
                  <div><div className="v">{session.trace.filter((t) => t.kind === "decision").length}</div><div className="s">décisions</div></div>
                )}
              </div>
            </div>
          )}
          {session.trace.length > 0 && (
            <div className="panel">
              <h2>Journal de Claude</h2>
              <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
                {session.trace.filter((t) => t.kind === "decision").length} décision{session.trace.filter((t) => t.kind === "decision").length > 1 ? "s" : ""} · {session.trace.length} étapes
                {session.claudeSessionUrl && <> · <a href={session.claudeSessionUrl} target="_blank" rel="noreferrer noopener">conversation complète</a></>}
              </p>
              <Journal steps={session.trace} />
            </div>
          )}
          {r.news.length > 0 && (
            <div className="panel">
              <h2>Actualités retenues</h2>
              <div className="news">
                {r.news.map((n) => (
                  <a key={n.url} href={n.url} target="_blank" rel="noreferrer noopener">
                    <b style={{ fontWeight: 600 }}>{n.title}</b>
                    <div className="src">{n.source} · {n.date}{n.tickers.length ? ` · ${n.tickers.join(", ")}` : ""}</div>
                  </a>
                ))}
              </div>
            </div>
          )}
          {!isLatest && <Link href="/journal" className="btn">Retour au journal</Link>}
        </div>
      </div>
    </>
  );
}
