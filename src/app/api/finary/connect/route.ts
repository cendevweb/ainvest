import { isLoggedIn } from "@/lib/auth";
import { startAuthorization } from "@/lib/finary-oauth";

export async function GET(req: Request) {
  if (!(await isLoggedIn())) return Response.redirect(new URL("/login", req.url), 303);
  try {
    return Response.redirect(await startAuthorization(), 303);
  } catch (err) {
    const msg = encodeURIComponent(err instanceof Error ? err.message : "Erreur inconnue");
    return Response.redirect(new URL(`/parametres?erreur=${msg}`, req.url), 303);
  }
}
