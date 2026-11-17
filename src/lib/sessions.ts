import "server-only";
import { keys, redis } from "./store";
import { DEFAULT_RULES, RulesSchema, type RuleCheck, type Rules } from "./rules";
import type { Proposal, Report } from "./schema";

export type DecisionStatus = "pending" | "approved" | "rejected" | "done" | "blocked";

export type StoredProposal = Proposal & {
  id: string;
  check: RuleCheck;
  decision: { status: DecisionStatus; at?: number; quantity?: number; note?: string };
};

export type TraceKind = "finary" | "web_search" | "web_fetch" | "decision" | "report" | "other";
export type TraceStep = { kind: TraceKind; tool: string; label: string; detail?: string; at?: number };

export type Session = {
  id: string;
  trigger: "cron" | "manual" | "claude";
  status: "running" | "done" | "error";
  model: string;
  startedAt: number;
  finishedAt?: number;
  error?: string;
  seenAt?: number;
  trace: TraceStep[];
  /** Lien vers la conversation Claude Code de la routine, pour une séance lancée depuis l'app. */
  claudeSessionUrl?: string;
  stats?: {
    durationMs: number;
    toolCalls: Record<string, number>;
    sources: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  report?: Report;
  proposals: StoredProposal[];
};

const KEEP = 120; // séances conservées

export async function getRules(): Promise<Rules> {
  const parsed = RulesSchema.safeParse(await redis().get(keys.rules));
  return parsed.success ? parsed.data : DEFAULT_RULES;
}

export async function saveRules(rules: Rules): Promise<void> {
  await redis().set(keys.rules, RulesSchema.parse(rules));
}

export async function saveSession(s: Session): Promise<void> {
  await redis().set(keys.session(s.id), s);
  await redis().zadd(keys.sessionIndex, { score: s.startedAt, member: s.id });
  const count = await redis().zcard(keys.sessionIndex);
  if (count > KEEP) {
    const old = await redis().zrange<string[]>(keys.sessionIndex, 0, count - KEEP - 1);
    if (old.length) {
      await redis().del(...old.map(keys.session));
      await redis().zrem(keys.sessionIndex, ...old);
    }
  }
}

export async function getSession(id: string): Promise<Session | null> {
  return (await redis().get<Session>(keys.session(id))) ?? null;
}

export async function listSessions(limit = 30): Promise<Session[]> {
  const ids = await redis().zrange<string[]>(keys.sessionIndex, 0, limit - 1, { rev: true });
  if (!ids.length) return [];
  const rows = await redis().mget<(Session | null)[]>(...ids.map(keys.session));
  return rows.filter((s): s is Session => Boolean(s));
}

export async function latestSession(): Promise<Session | null> {
  return (await listSessions(1))[0] ?? null;
}

/** Une séance « en cours » depuis plus de 45 min est considérée comme interrompue. */
export const STALE_MS = 45 * 60 * 1000;

export function isStale(s: Session, now = Date.now()): boolean {
  return s.status === "running" && now - s.startedAt > STALE_MS;
}

export async function appendTrace(id: string, step: TraceStep): Promise<Session | null> {
  const s = await getSession(id);
  if (!s) return null;
  s.trace = [...s.trace, { ...step, at: step.at ?? Date.now() }].slice(-200);
  await redis().set(keys.session(s.id), s);
  return s;
}

export function hasRunToday(s: Session | null, now = new Date()): boolean {
  if (!s || s.status === "error") return false;
  const day = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  return day(new Date(s.startedAt)) === day(now);
}
