import { assertLoggedIn } from "@/lib/auth";
import { runSession } from "@/lib/claude-session";

// Une séance dure plusieurs minutes. Vercel plafonne la durée selon ton offre.
export const maxDuration = 800;

export async function POST() {
  const denied = await assertLoggedIn();
  if (denied) return denied;
  const result = await runSession("manual");
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
