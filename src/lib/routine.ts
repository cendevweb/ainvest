import "server-only";

/*
 * Déclenchement de ta routine Claude (tâche planifiée claude.ai/code) par son déclencheur API.
 * Le jeton est propre à la routine : il permet seulement de la lancer, sans aucun accès en lecture.
 * Doc : https://platform.claude.com/docs/en/api/claude-code/routines-fire
 */

export function routineConfigured(): boolean {
  return Boolean(process.env.ROUTINE_FIRE_URL && process.env.ROUTINE_FIRE_TOKEN);
}

export async function fireRoutine(text: string): Promise<{ sessionUrl: string }> {
  const url = process.env.ROUTINE_FIRE_URL;
  const token = process.env.ROUTINE_FIRE_TOKEN;
  if (!url || !token) throw new Error("Lancement non configuré : renseigne ROUTINE_FIRE_URL et ROUTINE_FIRE_TOKEN dans Vercel.");
  if (!url.startsWith("https://api.anthropic.com/")) throw new Error("ROUTINE_FIRE_URL doit pointer vers https://api.anthropic.com/.");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "anthropic-version": "2026-10-21",
      "content-type": "application/json",
    },
    body: JSON.stringify({ text }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as
    | { claude_code_session_url?: string; error?: { type?: string; message?: string } }
    | null;
  if (!res.ok) {
    const hint =
      res.status === 401 ? "jeton refusé (régénère-le dans claude.ai/code)" :
      res.status === 429 ? "limite horaire de lancements atteinte, réessaie plus tard" :
      res.status === 400 ? "routine en pause ou requête invalide" :
      body?.error?.message ?? "erreur inconnue";
    throw new Error(`Lancement de la routine refusé (${res.status}) : ${hint}.`);
  }
  return { sessionUrl: body?.claude_code_session_url ?? "" };
}
