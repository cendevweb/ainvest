import { isLoggedIn } from "@/lib/auth";
import { ALLOWLIST_HELP, completeAuthorization, resetClient } from "@/lib/finary-oauth";

export async function GET(req: Request) {
  if (!(await isLoggedIn())) return Response.redirect(new URL("/login", req.url), 303);
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");
  if (denied === "invalid_client" || denied === "unauthorized_client") {
    await resetClient();
    const msg = encodeURIComponent(`Finary ne reconnaît pas ce client (${denied}). ${ALLOWLIST_HELP}`);
    return Response.redirect(new URL(`/parametres?erreur=${msg}`, req.url), 303);
  }
  if (denied || !code || !state) {
    const detail = url.searchParams.get("error_description");
    const msg = encodeURIComponent(
      denied ? `Finary a refusé l'accès (${denied}${detail ? ` : ${detail}` : ""}).` : "Réponse Finary incomplète.",
    );
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
