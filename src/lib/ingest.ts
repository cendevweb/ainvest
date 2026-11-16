import "server-only";
import { checkAll, type Rules } from "./rules";
import type { Report } from "./schema";
import type { Session } from "./sessions";

/**
 * Transforme un rapport en séance finalisée : vérification des règles par le code,
 * statut initial de chaque proposition et statistiques. Commun aux deux modes
 * (séance via l'API, rapport déposé par ton Claude via le connecteur AInvest).
 */
export function finalizeReport(
  session: Session,
  report: Report,
  rules: Rules,
  usage?: { inputTokens: number; outputTokens: number; costUsd: number },
): Session {
  const checks = checkAll(report, rules);
  const toolCalls: Record<string, number> = {};
  for (const s of session.trace) toolCalls[s.kind] = (toolCalls[s.kind] ?? 0) + 1;
  const sourceCount = new Set(report.proposals.flatMap((p) => p.sources.map((s) => s.url)).concat(report.news.map((n) => n.url))).size;

  Object.assign(session, {
    status: "done",
    finishedAt: Date.now(),
    report,
    proposals: report.proposals.map((p, i) => ({
      ...p,
      id: `${session.id}-${i}`,
      check: checks[i],
      decision: { status: checks[i].ok ? (p.action === "hold" ? "done" : "pending") : "blocked" },
    })),
    stats: {
      durationMs: Date.now() - session.startedAt,
      toolCalls,
      sources: (toolCalls.web_search ?? 0) + (toolCalls.web_fetch ?? 0) || sourceCount,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      costUsd: usage?.costUsd ?? 0,
    },
  } satisfies Partial<Session>);
  return session;
}
