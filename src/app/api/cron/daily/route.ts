import { safeEqual } from "@/lib/crypto";
import { requireEnv } from "@/lib/env";
import { runSession } from "@/lib/claude-session";

export const maxDuration = 800;

// Appelée par la tâche planifiée Vercel (vercel.json), qui envoie « Authorization: Bearer CRON_SECRET ».
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${requireEnv("CRON_SECRET")}`)) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }
  const result = await runSession("cron");
  return Response.json({ ok: result.ok, error: result.ok ? undefined : result.error });
}
