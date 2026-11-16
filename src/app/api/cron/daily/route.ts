import { safeEqual } from "@/lib/crypto";
import { apiModeAvailable, requireEnv } from "@/lib/env";
import { finaryStatus } from "@/lib/finary-oauth";
import { runSession } from "@/lib/claude-session";
import { runBrief } from "@/lib/brief";

export const maxDuration = 800;

// Appelée par la tâche planifiée Vercel (vercel.json), qui envoie « Authorization: Bearer CRON_SECRET ».
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${requireEnv("CRON_SECRET")}`)) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!apiModeAvailable()) return Response.json({ ok: true, skipped: "Pas de clé API : rien à faire." });

  // 1. Brief marché et actualité, avec ta clé API. Ta routine Claude le reprend ensuite.
  let brief: { ok: boolean; error?: string; costUsd?: number };
  try {
    const b = await runBrief();
    brief = { ok: true, costUsd: b.stats.costUsd };
  } catch (err) {
    brief = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // 2. Séance complète par l'app, seulement si elle a sa propre connexion Finary (client approuvé par Finary).
  if (!(await finaryStatus()).connected) return Response.json({ ok: brief.ok, brief, session: "confiée à la routine Claude" });
  const result = await runSession("cron");
  return Response.json({ ok: result.ok && brief.ok, brief, error: result.ok ? undefined : result.error });
}
