"use client";
import { useState } from "react";
import type { Rules } from "@/lib/rules";

const NUMERIC: { key: keyof Rules; label: string; help: string; unit: string; step?: number }[] = [
  { key: "maxLinePct", label: "Poids maximum d'une ligne", help: "Au-delà, aucun achat supplémentaire n'est proposé.", unit: "%" },
  { key: "maxSectorPct", label: "Poids maximum d'un secteur", help: "Calculé sur la valeur totale du CTO.", unit: "%" },
  { key: "minCashPct", label: "Liquidités minimum", help: "Aucun achat ne peut descendre sous ce seuil.", unit: "%" },
  { key: "defaultStopPct", label: "Stop par défaut", help: "Proposé sur chaque nouvel achat.", unit: "%" },
  { key: "maxOrderEur", label: "Montant maximum par ordre", help: "Plafond d'une proposition.", unit: "€", step: 100 },
  { key: "maxProposalsPerDay", label: "Propositions maximum par séance", help: "Pour éviter de suractiver le compte.", unit: "" },
];

export function RulesForm({ initial }: { initial: Rules }) {
  const [rules, setRules] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    const res = await fetch("/api/rules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(rules) });
    setState(res.ok ? "saved" : "error");
  }

  return (
    <form onSubmit={save} className="panel">
      <div className="form-grid">
        {NUMERIC.map((f) => (
          <label key={f.key} className="field" htmlFor={f.key}>
            {f.label} {f.unit && <span className="muted">({f.unit})</span>}
            <input id={f.key} type="number" step={f.step ?? 1} value={rules[f.key] as number}
              onChange={(e) => setRules({ ...rules, [f.key]: Number(e.target.value) })} />
            <small>{f.help}</small>
          </label>
        ))}
        <label className="field" htmlFor="universe">
          Univers autorisé
          <input id="universe" type="text" value={rules.universe} onChange={(e) => setRules({ ...rules, universe: e.target.value })} />
          <small>Ce que Claude peut proposer d&apos;acheter.</small>
        </label>
        <label className="field" htmlFor="horizon">
          Horizon
          <input id="horizon" type="text" value={rules.horizon} onChange={(e) => setRules({ ...rules, horizon: e.target.value })} />
          <small>Oriente le type d&apos;arguments retenus.</small>
        </label>
      </div>
      <label className="field" htmlFor="notes" style={{ marginTop: 18 }}>
        Consignes libres pour Claude
        <textarea id="notes" value={rules.notes} onChange={(e) => setRules({ ...rules, notes: e.target.value })} />
      </label>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 18 }}>
        <button className="btn primary" type="submit" disabled={state === "saving"}>Enregistrer</button>
        {state === "saved" && <span className="chip ok">Enregistré pour la prochaine séance</span>}
        {state === "error" && <span className="chip bad">Valeurs invalides, vérifie les champs</span>}
      </div>
    </form>
  );
}
