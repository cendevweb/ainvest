/*
 * Carnet de notes de ton Claude, d'une séance à l'autre : dates à surveiller, raisons
 * d'une décision, pistes à suivre, leçons. Briques pures (validation, tri, texte),
 * testables sans Redis. Le stockage est dans notes.ts.
 */

export const NOTE_KINDS = ["date", "decision", "watch", "lesson", "other"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export type Note = {
  id: string;
  kind: NoteKind;
  title: string;
  body: string;
  ticker: string | null;
  /** Date utile (AAAA-MM-JJ) : résultats, dividende, réunion, échéance d'une piste. */
  due: string | null;
  status: "open" | "closed";
  createdAt: number;
  updatedAt: number;
  /** Séance pendant laquelle la note a été écrite ou modifiée en dernier, si connue. */
  sessionDay: string;
};

export const MAX_NOTES = 300;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export type NoteInput = { kind?: unknown; title?: unknown; body?: unknown; ticker?: unknown; due?: unknown };

/** Valide une nouvelle note. Renvoie une erreur lisible pour le modèle si elle est incomplète. */
export function parseNewNote(input: NoteInput): { ok: true; value: Omit<Note, "id" | "createdAt" | "updatedAt" | "sessionDay" | "status"> } | { ok: false; error: string } {
  const title = clean(input.title, 140);
  const body = clean(input.body, 2000);
  if (!title) return { ok: false, error: "title est obligatoire." };
  const kind = NOTE_KINDS.includes(input.kind as NoteKind) ? (input.kind as NoteKind) : "other";
  const due = clean(input.due, 10);
  if (due && !ISO_DAY.test(due)) return { ok: false, error: "due doit être au format AAAA-MM-JJ." };
  const ticker = clean(input.ticker, 20).toUpperCase() || null;
  return { ok: true, value: { kind, title, body, ticker, due: due || null } };
}

/** Applique une modification partielle. */
export function applyNoteUpdate(note: Note, input: NoteInput & { status?: unknown; append?: unknown }, now: number, day: string): { ok: true; value: Note } | { ok: false; error: string } {
  const next: Note = { ...note, updatedAt: now, sessionDay: day };
  if (input.title !== undefined) next.title = clean(input.title, 140) || note.title;
  if (input.body !== undefined) next.body = clean(input.body, 2000);
  if (typeof input.append === "string" && input.append.trim()) {
    next.body = `${next.body}${next.body ? "\n" : ""}[${day}] ${input.append.trim()}`.slice(-2000);
  }
  if (input.kind !== undefined && NOTE_KINDS.includes(input.kind as NoteKind)) next.kind = input.kind as NoteKind;
  if (input.ticker !== undefined) next.ticker = clean(input.ticker, 20).toUpperCase() || null;
  if (input.due !== undefined) {
    const due = clean(input.due, 10);
    if (due && !ISO_DAY.test(due)) return { ok: false, error: "due doit être au format AAAA-MM-JJ." };
    next.due = due || null;
  }
  if (input.status === "open" || input.status === "closed") next.status = input.status;
  return { ok: true, value: next };
}

/** Ordre de lecture : dates à venir d'abord (la plus proche en tête), puis les plus récentes. */
export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.due && b.due) return a.due.localeCompare(b.due);
    if (a.due) return -1;
    if (b.due) return 1;
    return b.updatedAt - a.updatedAt;
  });
}

export function filterNotes(notes: Note[], f: { ticker?: string; kind?: string; status?: string; query?: string }): Note[] {
  const q = f.query?.toLowerCase();
  return notes.filter(
    (n) =>
      (!f.ticker || n.ticker === f.ticker.toUpperCase()) &&
      (!f.kind || n.kind === f.kind) &&
      (f.status === "all" || n.status === (f.status === "closed" ? "closed" : "open")) &&
      (!q || `${n.title} ${n.body}`.toLowerCase().includes(q)),
  );
}

const KIND_FR: Record<NoteKind, string> = { date: "date", decision: "décision", watch: "piste", lesson: "leçon", other: "note" };

export function noteLine(n: Note, today: string): string {
  const late = n.due && n.due < today ? " (DÉPASSÉE)" : "";
  const due = n.due ? ` · échéance ${n.due}${late}` : "";
  const ticker = n.ticker ? ` · ${n.ticker}` : "";
  const body = n.body ? ` : ${n.body.replace(/\s+/g, " ").slice(0, 300)}` : "";
  return `- [${n.id}] ${KIND_FR[n.kind]}${ticker}${due} · ${n.title}${body} (écrite le ${n.sessionDay})`;
}

/** Résumé injecté dans get_session_context : notes ouvertes, dates en tête. */
export function notesDigest(notes: Note[], today: string, max = 40): string {
  const open = sortNotes(notes.filter((n) => n.status === "open"));
  if (!open.length) return "Ton carnet est vide. Note ce qui servira aux prochaines séances.";
  const shown = open.slice(0, max).map((n) => noteLine(n, today));
  const more = open.length > max ? `\n… et ${open.length - max} autres notes ouvertes (list_notes pour tout voir).` : "";
  return shown.join("\n") + more;
}
