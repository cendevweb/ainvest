import { assertLoggedIn } from "@/lib/auth";
import { getSession, saveSession } from "@/lib/sessions";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await assertLoggedIn();
  if (denied) return denied;
  const session = await getSession((await params).id);
  if (!session) return Response.json({ error: "Séance introuvable" }, { status: 404 });
  if (!session.seenAt) {
    session.seenAt = Date.now();
    await saveSession(session);
  }
  return Response.json({ ok: true });
}
