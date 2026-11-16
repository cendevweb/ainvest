import { checkPassword, startSession } from "@/lib/auth";

export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  // Petite pause constante pour freiner les essais en rafale.
  await new Promise((r) => setTimeout(r, 400));
  if (!checkPassword(password)) {
    return Response.redirect(new URL("/login?erreur=1", req.url), 303);
  }
  await startSession();
  return Response.redirect(new URL("/", req.url), 303);
}
