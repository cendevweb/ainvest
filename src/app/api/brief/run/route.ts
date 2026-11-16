import { assertLoggedIn } from "@/lib/auth";
import { runBrief } from "@/lib/brief";
import { apiModeAvailable } from "@/lib/env";

export const maxDuration = 800;

export async function POST() {
  const denied = await assertLoggedIn();
  if (denied) return denied;
  if (!apiModeAvailable()) return Response.json({ ok: false, error: "Ajoute ANTHROPIC_API_KEY dans Vercel." }, { status: 400 });
  try {
    const brief = await runBrief();
    return Response.json({ ok: true, day: brief.day });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
