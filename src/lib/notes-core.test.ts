import { test } from "node:test";
import assert from "node:assert/strict";
import { applyNoteUpdate, filterNotes, notesDigest, parseNewNote, sortNotes, type Note } from "./notes-core.ts";

const note = (o: Partial<Note>): Note => ({
  id: "n_1", kind: "other", title: "t", body: "", ticker: null, due: null, status: "open",
  createdAt: 1, updatedAt: 1, sessionDay: "2026-11-17", ...o,
});

test("une note sans titre ou avec une date mal formée est refusée", () => {
  assert.equal(parseNewNote({ body: "x" }).ok, false);
  assert.equal(parseNewNote({ title: "x", due: "18/11" }).ok, false);
});

test("une note valide est nettoyée", () => {
  const r = parseNewNote({ title: " Résultats Nvidia ", kind: "date", ticker: "nvda", due: "2026-11-18" });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.value, { kind: "date", title: "Résultats Nvidia", body: "", ticker: "NVDA", due: "2026-11-18" });
  const k = parseNewNote({ title: "x", kind: "bidon" });
  assert.ok(k.ok && k.value.kind === "other");
});

test("append ajoute un suivi daté, status ferme la note", () => {
  const r = applyNoteUpdate(note({ body: "Seuil 300 $" }), { append: "Cassé à 295 $", status: "closed" }, 5, "2026-11-20");
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.body, "Seuil 300 $\n[2026-11-20] Cassé à 295 $");
    assert.equal(r.value.status, "closed");
    assert.equal(r.value.updatedAt, 5);
  }
});

test("les dates proches passent en tête, puis les plus récentes", () => {
  const sorted = sortNotes([note({ id: "a", updatedAt: 9 }), note({ id: "b", due: "2026-12-01" }), note({ id: "c", due: "2026-11-18" }), note({ id: "d", updatedAt: 3 })]);
  assert.deepEqual(sorted.map((n) => n.id), ["c", "b", "a", "d"]);
});

test("filtre par ticker, statut et mot-clé", () => {
  const notes = [note({ id: "a", ticker: "TSLA" }), note({ id: "b", ticker: "NVDA", status: "closed" }), note({ id: "c", title: "dividende Spok" })];
  assert.deepEqual(filterNotes(notes, { ticker: "tsla" }).map((n) => n.id), ["a"]);
  assert.deepEqual(filterNotes(notes, { status: "all" }).length, 3);
  assert.deepEqual(filterNotes(notes, { query: "DIVIDENDE" }).map((n) => n.id), ["c"]);
});

test("le résumé signale les échéances dépassées et ignore les notes fermées", () => {
  const d = notesDigest([note({ id: "a", due: "2026-11-10", title: "Revoir Tesla" }), note({ id: "b", status: "closed", title: "fermée" })], "2026-11-17");
  assert.match(d, /DÉPASSÉE/);
  assert.doesNotMatch(d, /fermée/);
  assert.match(notesDigest([], "2026-11-17"), /vide/);
});
