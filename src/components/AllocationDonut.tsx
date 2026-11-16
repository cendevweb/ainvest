import { eur, pct } from "@/lib/format";

const COLORS = ["var(--accent)", "var(--gold)", "#6E8FB8", "#9C7BB5", "#C9735B", "#5FA39A", "#8A8F5A", "var(--muted)"];

/** Anneau de répartition du patrimoine, dessiné en SVG (pas de bibliothèque). */
export function AllocationDonut({ rows }: { rows: { label: string; value_eur: number }[] }) {
  const data = rows.filter((r) => r.value_eur > 0).sort((a, b) => b.value_eur - a.value_eur);
  const total = data.reduce((s, r) => s + r.value_eur, 0);
  if (!total) return <p className="muted">Pas de répartition disponible.</p>;
  const R = 54, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
      <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="Répartition du patrimoine">
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="18" />
        {data.map((r, i) => {
          const len = (r.value_eur / total) * C;
          const el = (
            <circle key={r.label} cx="70" cy="70" r={R} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth="18"
              strokeDasharray={`${Math.max(len - 1.5, 0)} ${C}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)" />
          );
          offset += len;
          return el;
        })}
        <text x="70" y="66" textAnchor="middle" fontSize="10" fill="var(--muted)" fontFamily="var(--f-body)">Total</text>
        <text x="70" y="82" textAnchor="middle" fontSize="12" fill="var(--fg)" fontFamily="var(--f-mono)">{eur(total)}</text>
      </svg>
      <div className="legend" style={{ flex: 1, minWidth: 180 }}>
        {data.map((r, i) => (
          <div key={r.label}>
            <i style={{ background: COLORS[i % COLORS.length] }} />
            <span>{r.label}</span>
            <span className="num muted">{pct((r.value_eur / total) * 100)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
