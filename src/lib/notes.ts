import "server-only";
import { randomToken } from "./crypto";
import { keys, redis } from "./store";
import { parisDay } from "./brief";
import { MAX_NOTES, applyNoteUpdate, parseNewNote, type Note, type NoteInput } from "./notes-core";

/* Stockage du carnet de notes de ton Claude : un hash Redis, une entrée par note. */

export async function allNotes(): Promise<Note[]> {
  const raw = (await redis().hgetall<Record<string, Note>>(keys.notes)) ?? {};
  return Object.values(raw).filter((n): n is Note => Boolean(n && typeof n === "object" && "id" in n));
}

export async function addNote(input: NoteInput): Promise<{ ok: true; note: Note } | { ok: false; error: string }> {
  const parsed = parseNewNote(input);
  if (!parsed.ok) return parsed;
  const count = await redis().hlen(keys.notes);
  if (count >= MAX_NOTES) return { ok: false, error: `Carnet plein (${MAX_NOTES} notes) : ferme ou supprime des notes avant d'en ajouter.` };
  const now = Date.now();
  const note: Note = { ...parsed.value, id: `n_${randomToken(4)}`, status: "open", createdAt: now, updatedAt: now, sessionDay: parisDay() };
  await redis().hset(keys.notes, { [note.id]: note });
  return { ok: true, note };
}

export async function updateNote(id: string, input: NoteInput & { status?: unknown; append?: unknown; delete?: unknown }): Promise<{ ok: true; note: Note | null } | { ok: false; error: string }> {
  const note = await redis().hget<Note>(keys.notes, id);
  if (!note) return { ok: false, error: `Note ${id} introuvable.` };
  if (input.delete === true) {
    await redis().hdel(keys.notes, id);
    return { ok: true, note: null };
  }
  const next = applyNoteUpdate(note, input, Date.now(), parisDay());
  if (!next.ok) return next;
  await redis().hset(keys.notes, { [id]: next.value });
  return { ok: true, note: next.value };
}
