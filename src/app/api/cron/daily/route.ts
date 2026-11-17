import { safeEqual } from "@/lib/crypto";
import { apiModeAvailable, requireEnv } from "@/lib/env";
import { runBrief } from "@/lib/brief";

export const maxDuration = 800;

// Appelée par la tâche planifiée Vercel (vercel.json), qui envoie « Authorization: Bearer CRON_SECRET ».
// Elle prépare le brief marché du matin avec ta clé API ; ta routine Claude le reprend ensuite.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${requireEnv("CRON_SECRET")}`)) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!apiModeAvailable()) return Response.json({ ok: true, skipped: "Pas de clé API : rien à faire." });
  try {
    const b = await runBrief();
    return Response.json({ ok: true, day: b.day, costUsd: b.stats.costUsd });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
