import { z } from "zod";
import { assertLoggedIn } from "@/lib/auth";
import { getSession, saveSession } from "@/lib/sessions";

const Body = z.object({
  sessionId: z.string(),
  proposalId: z.string(),
  status: z.enum(["approved", "rejected", "done", "pending"]),
  quantity: z.number().positive().optional(),
  note: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const denied = await assertLoggedIn();
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "Requête invalide" }, { status: 400 });
  const { sessionId, proposalId, status, quantity, note } = parsed.data;
  const session = await getSession(sessionId);
  const proposal = session?.proposals.find((p) => p.id === proposalId);
  if (!session || !proposal) return Response.json({ error: "Proposition introuvable" }, { status: 404 });
  if (proposal.decision.status === "blocked") {
    return Response.json({ error: "Proposition bloquée par tes règles" }, { status: 409 });
  }
  if (quantity) {
    const unit = proposal.quantity > 0 ? proposal.est_amount_eur / proposal.quantity : 0;
    proposal.quantity = quantity;
    proposal.est_amount_eur = unit * quantity;
  }
  proposal.decision = { status, at: Date.now(), quantity: proposal.quantity, note: note ?? proposal.decision.note };
  await saveSession(session);
  return Response.json({ ok: true, proposal });
}
