"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StoredProposal } from "@/lib/sessions";
import { ACTION_LABEL, ORDER_LABEL, eur, signedEur } from "@/lib/format";

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "En attente", cls: "chip" },
  approved: { label: "Approuvée, à passer", cls: "chip ok" },
  rejected: { label: "Rejetée", cls: "chip bad" },
  done: { label: "Passée", cls: "chip acc" },
  blocked: { label: "Bloquée par tes règles", cls: "chip bad" },
};

/** Lien vers claude.ai avec une consigne préremplie : l'approfondissement tourne sur ton abonnement Claude. */
function deepDiveUrl(p: StoredProposal, sessionId: string): string {
  const prompt = [
    `Avec mes connecteurs AInvest et Finary, aide-moi à décider sur la proposition « ${p.title} » (${p.ticker}, séance ${sessionId}).`,
    `1. Appelle get_session du connecteur AInvest avec session_id "${sessionId}" pour relire le rapport, cette proposition et mes règles.`,
    "2. Vérifie ma position actuelle avec le connecteur Finary (lecture seule).",
    "3. Approfondis : thèse et contre-thèse, valorisation, catalyseurs à venir, risques, alternatives, taille de position et fiscalité CTO. Cite tes sources.",
    "4. Termine par un verdict clair (faire, ajuster, ne pas faire) et le niveau qui invaliderait l'idée.",
    "Ne passe aucun ordre.",
  ].join("\n");
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

export function ProposalCard({ p, sessionId }: { p: StoredProposal; sessionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(p.quantity);
  const [error, setError] = useState<string | null>(null);
  const st = p.decision.status;
  const actionable = p.action !== "hold";

  async function decide(status: "approved" | "rejected" | "done" | "pending", quantity?: number) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/proposals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, proposalId: p.id, status, quantity }),
    });
    setBusy(false);
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Échec de l'enregistrement");
    else {
      setEditing(false);
      router.refresh();
    }
  }

  const order = ORDER_LABEL[p.order_type];
  const sub =
    p.action === "hold"
      ? p.name
      : `${ACTION_LABEL[p.action]} de ${p.quantity} ${p.ticker}${order ? ` ${order}` : ""}${p.limit_price_eur ? ` à ${eur(p.limit_price_eur, 2)}` : ""}`;

  return (
    <article className={`prop ${st}`}>
      <div className="prop-head">
        <span className={`side ${p.action}`}>{ACTION_LABEL[p.action]}</span>
        <div className="prop-title">
          <b>{p.title}</b>
          <div className="sub">{sub}</div>
        </div>
        <div className="conf" title="Confiance de Claude">
          confiance <div className="bar"><i style={{ width: `${p.confidence}%` }} /></div>
          <span className="num">{Math.round(p.confidence)} %</span>
        </div>
      </div>

      {!p.check.ok && (
        <div className="reasons">
          <b>Bloquée avant affichage :</b>
          <ul>{p.check.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}

      <div className="prop-body">
        <dl className="args">
          {p.arguments.map((a) => (
            <div key={a.label}>
              <dt>{a.label}</dt>
              <dd>{a.text}</dd>
            </div>
          ))}
        </dl>
        {actionable && (
          <div className="facts">
            <div><span>Montant estimé</span><span className="num">{eur(p.est_amount_eur)}</span></div>
            {p.realized_gain_eur !== null && (
              <div><span>Plus-value réalisée</span><span className={`num ${p.realized_gain_eur >= 0 ? "pos" : "neg"}`}>{signedEur(p.realized_gain_eur)}</span></div>
            )}
            <div><span>Secteur</span><span>{p.sector}</span></div>
            <div><span>Abandon si</span><span style={{ textAlign: "right" }}>{p.abandon_level}</span></div>
          </div>
        )}
      </div>

      {open && (
        <div className="detail">
          <div className="eyebrow" style={{ marginBottom: 6 }}>Raisonnement complet</div>
          <p>{p.rationale}</p>
          {p.sources.length > 0 && (
            <ul>
              {p.sources.map((s) => (
                <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer noopener">{s.title}</a></li>
              ))}
            </ul>
          )}
        </div>
      )}

      {editing && (
        <div className="detail" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor={`q-${p.id}`}>Quantité</label>
          <input id={`q-${p.id}`} type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          <button className="btn primary" disabled={busy || !(qty > 0)} onClick={() => decide("approved", qty)} type="button">
            Approuver avec {qty} titres
          </button>
        </div>
      )}

      <div className="prop-foot">
        {actionable && st === "pending" && (
          <>
            <button className="btn primary" disabled={busy} onClick={() => decide("approved")} type="button">Approuver</button>
            <button className="btn" disabled={busy} onClick={() => setEditing((v) => !v)} type="button">Modifier</button>
            <button className="btn danger" disabled={busy} onClick={() => decide("rejected")} type="button">Rejeter</button>
          </>
        )}
        {st === "approved" && (
          <>
            <button className="btn primary" disabled={busy} onClick={() => decide("done")} type="button">J&apos;ai passé l&apos;ordre</button>
            <button className="btn" disabled={busy} onClick={() => decide("pending")} type="button">Annuler</button>
          </>
        )}
        {st === "rejected" && (
          <button className="btn" disabled={busy} onClick={() => decide("pending")} type="button">Revenir dessus</button>
        )}
        <a className="btn ghost" href={deepDiveUrl(p, sessionId)} target="_blank" rel="noreferrer noopener" title="Ouvre claude.ai avec une consigne préremplie, sur ton abonnement Claude">
          Creuser avec Claude
        </a>
        <button className="btn ghost" onClick={() => setOpen((v) => !v)} type="button">
          {open ? "Masquer le raisonnement" : "Raisonnement et sources"}
        </button>
        <span className="status">
          {error ? <span className="chip bad">{error}</span> : <span className={STATUS[st].cls}>{STATUS[st].label}</span>}
        </span>
      </div>
    </article>
  );
}
