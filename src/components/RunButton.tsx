"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function RunButton({
  label,
  className = "btn primary",
  endpoint,
  busyLabel = "Claude analyse…",
}: {
  label: string;
  className?: string;
  endpoint: string;
  busyLabel?: string;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [running]);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) setError(body.error ?? `Erreur ${res.status}`);
    } catch {
      setError("Interrompu (réseau ou délai dépassé). L'opération peut avoir abouti : recharge la page.");
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 6 }}>
      <button className={className} onClick={run} disabled={running} type="button">
        {running ? <><span className="spin" aria-hidden="true" />{busyLabel} {elapsed} s</> : label}
      </button>
      {error && <span role="alert" style={{ fontSize: 12.5, color: "var(--loss)" }}>{error}</span>}
    </span>
  );
}
