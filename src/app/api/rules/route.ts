import { assertLoggedIn } from "@/lib/auth";
import { RulesSchema } from "@/lib/rules";
import { saveRules } from "@/lib/sessions";

export async function POST(req: Request) {
  const denied = await assertLoggedIn();
  if (denied) return denied;
  const parsed = RulesSchema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "Règles invalides", details: parsed.error.issues }, { status: 400 });
  await saveRules(parsed.data);
  return Response.json({ ok: true });
}
