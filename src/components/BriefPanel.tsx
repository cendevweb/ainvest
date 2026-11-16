import type { Brief } from "@/lib/brief";
import { dateFr } from "@/lib/format";
import { RunButton } from "./RunButton";

const IMPACT: Record<string, { label: string; cls: string }> = {
  positive: { label: "Positif", cls: "chip ok" },
  negative: { label: "Négatif", cls: "chip bad" },
  neutral: { label: "Neutre", cls: "chip" },
};

/** Brief marché du matin, produit par la tâche planifiée avec ta clé API. */
export function BriefPanel({
  brief,
  isToday,
  canRun,
  spent,
  budget,
}: {
  brief: Brief | null;
  isToday: boolean;
  canRun: boolean;
  spent: number;
  budget: number;
}) {
  return (
    <section className="panel" style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Brief marché</h2>
        {brief && (
          <span className="muted" style={{ fontSize: 12.5 }}>
            {isToday ? "Ce matin" : dateFr(brief.createdAt)} · {brief.stats.searches} recherches · {brief.stats.costUsd.toFixed(2)} $
          </span>
        )}
        {canRun && (
          <span className="muted" style={{ fontSize: 12.5 }} title="Dépense de la clé API ce mois-ci, au prix catalogue">
            Budget API : {spent.toFixed(2)} $ / {budget} $
          </span>
        )}
        {canRun && (
          <span style={{ marginLeft: "auto" }}>
            <RunButton endpoint="/api/brief/run" className="btn" label={isToday ? "Regénérer" : "Générer le brief"} />
          </span>
        )}
      </div>
      {!brief ? (
        <p className="muted" style={{ marginBottom: 0 }}>
          {canRun
            ? "Pas encore de brief. Il est préparé chaque jour ouvré vers 6 h 15 (7 h 15 en été) avec ta clé API, avant ta routine Claude."
            : "Ajoute ANTHROPIC_API_KEY dans Vercel pour préparer chaque matin le brief marché et l'actualité de tes lignes."}
        </p>
      ) : (
        <>
          <p>{brief.content.macro}</p>
          <p>{brief.content.markets}</p>
          {brief.content.items.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 10 }}>
              {brief.content.items.map((i, n) => (
                <li key={n} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span className={IMPACT[i.impact].cls}>{IMPACT[i.impact].label}</span>
                    <b>{i.name}</b>
                    <code>{i.ticker}</code>
                    <span className="muted" style={{ fontSize: 12.5 }}>{i.date}</span>
                  </div>
                  <div style={{ marginTop: 4 }}>{i.headline}</div>
                  <div className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>
                    {i.summary}{" "}
                    {i.sources.map((s, k) => (
                      <a key={k} href={s.url} target="_blank" rel="noreferrer noopener" style={{ marginRight: 8 }}>{s.title}</a>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
