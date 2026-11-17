import { assertLoggedIn } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
import { fireRoutine, routineConfigured } from "@/lib/routine";
import { appendTrace, getSession, isStale, latestSession, saveSession, type Session } from "@/lib/sessions";

/*
 * Lance une séance depuis l'app : crée la séance « en cours », puis déclenche ta routine Claude
 * par son déclencheur API. La routine lit Finary avec ton connecteur claude.ai, journalise ses
 * étapes via log_step et dépose son rapport avec submit_report, sur cette même séance.
 */
export async function POST() {
  const denied = await assertLoggedIn();
  if (denied) return denied;
  if (!routineConfigured()) {
    return Response.json({ ok: false, error: "Lancement non configuré : ajoute ROUTINE_FIRE_URL et ROUTINE_FIRE_TOKEN dans Vercel (voir Paramètres)." }, { status: 400 });
  }
  const last = await latestSession();
  if (last && last.status === "running" && !isStale(last)) {
    return Response.json({ ok: false, error: "Une séance est déjà en cours." }, { status: 409 });
  }

  const now = Date.now();
  const session: Session = {
    id: `${new Date(now).toISOString().slice(0, 10)}-${randomToken(4)}`,
    trigger: "manual",
    status: "running",
    model: "Routine Claude",
    startedAt: now,
    trace: [{ kind: "other", tool: "app", label: "Séance demandée depuis l'app", at: now }],
    proposals: [],
  };
  await saveSession(session);

  try {
    const { sessionUrl } = await fireRoutine(
      `Identifiant de séance AInvest : ${session.id}\nPasse-le à get_session_context, à chaque log_step et à submit_report.`,
    );
    const current = (await getSession(session.id)) ?? session;
    if (sessionUrl) current.claudeSessionUrl = sessionUrl;
    current.trace = [...current.trace, { kind: "other", tool: "routine", label: "Routine Claude démarrée", at: Date.now() }];
    await saveSession(current);
    return Response.json({ ok: true, id: session.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const current = (await getSession(session.id)) ?? session;
    current.status = "error";
    current.error = message;
    current.finishedAt = Date.now();
    await saveSession(current);
    await appendTrace(session.id, { kind: "other", tool: "routine", label: "Échec du lancement" }).catch(() => null);
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}
