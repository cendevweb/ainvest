import { isLoggedIn } from "@/lib/auth";
import { completeAuthorization } from "@/lib/finary-oauth";

export async function GET(req: Request) {
  if (!(await isLoggedIn())) return Response.redirect(new URL("/login", req.url), 303);
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");
  if (denied || !code || !state) {
    const msg = encodeURIComponent(denied ? `Finary a refusé l'accès (${denied}).` : "Réponse Finary incomplète.");
    return Response.redirect(new URL(`/parametres?erreur=${msg}`, req.url), 303);
  }
  try {
    await completeAuthorization(code, state);
    return Response.redirect(new URL("/parametres?finary=ok", req.url), 303);
  } catch (err) {
    const msg = encodeURIComponent(err instanceof Error ? err.message : "Erreur inconnue");
    return Response.redirect(new URL(`/parametres?erreur=${msg}`, req.url), 303);
  }
}
