import Link from "next/link";
import { routineConfigured } from "@/lib/routine";
import { RunButton } from "./RunButton";

/** Bouton « Lancer une séance » : déclenche ta routine Claude sans quitter l'app. */
export function LaunchSession({ label, className = "btn primary" }: { label: string; className?: string }) {
  if (!routineConfigured()) {
    return <Link href="/parametres" className="btn">Configurer le lancement manuel</Link>;
  }
  return <RunButton endpoint="/api/session/run" label={label} className={className} busyLabel="Lancement…" />;
}
