import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Autosave,
  SaveFailure,
  type Draft,
  type Persist,
} from "../src/lib/autosave";
import { emptyContent, type NoteDocument } from "../src/lib/schema";
const document: NoteDocument = {
  id: "e1b0d4e0-3448-4128-b9c3-9fc434af2f30",
  title: "Page",
  content: emptyContent,
  revision: 0,
  createdAt: "2026-10-12T00:00:00.000Z",
  updatedAt: "2026-10-12T00:00:00.000Z",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
test("edits during a save use the returned revision and remain dirty until persisted", async () => {
  const first = deferred<NoteDocument>();
  const calls: { draft: Draft; revision: number }[] = [];
  const persist: Persist = async (_id, draft, revision) => {
    calls.push({ draft, revision });
    return calls.length === 1
      ? first.promise
      : { ...document, ...draft, revision: revision + 1 };
  };
  const saver = new Autosave(document, persist);
  saver.update({ title: "First" });
  const saving = saver.flush();
  assert.equal(saver.getSnapshot().status, "saving");
  saver.update({ title: "Second" });
  assert.equal(saver.isDirty(), true);
  assert.equal(saver.flush(), saving);
  first.resolve({ ...document, title: "First", revision: 1 });
  assert.equal(await saving, true);
  assert.deepEqual(
    calls.map((call) => [call.draft.title, call.revision]),
    [
      ["First", 0],
      ["Second", 1],
    ],
  );
  assert.equal(saver.isDirty(), false);
  assert.equal(saver.getSnapshot().status, "saved");
  saver.dispose();
});
test("network failure retains dirty changes; retry saves the same draft", async () => {
  let attempts = 0;
  const saver = new Autosave(document, async (_id, draft, revision) => {
    if (++attempts === 1) throw new Error("Network unavailable");
    return { ...document, ...draft, revision: revision + 1 };
  });
  saver.update({ title: "Do not lose me" });
  assert.equal(await saver.flush(), false);
  assert.equal(saver.getSnapshot().status, "error");
  assert.equal(saver.isDirty(), true);
  assert.equal(saver.getDraft().title, "Do not lose me");
  assert.equal(await saver.flush(), true);
  assert.equal(saver.getSnapshot().status, "saved");
  saver.dispose();
});
test("conflicts stop autosaving and never overwrite the remote revision", async () => {
  let calls = 0;
  const saver = new Autosave(document, async () => {
    calls++;
    throw new SaveFailure(409, "Conflict");
  });
  saver.update({ title: "Local draft" });
  assert.equal(await saver.flush(), false);
  saver.update({ title: "Keep writing" });
  assert.equal(await saver.flush(), false);
  assert.equal(calls, 1);
  assert.equal(saver.getSnapshot().status, "conflict");
  assert.equal(saver.getDraft().title, "Keep writing");
  saver.dispose();
});
test("invalid structured content is not sent to the server", async () => {
  let called = false;
  const saver = new Autosave(document, async () => {
    called = true;
    return document;
  });
  saver.update({ content: { type: "doc", content: [{ type: "unknown" }] } });
  assert.equal(await saver.flush(), false);
  assert.equal(called, false);
  assert.equal(saver.getSnapshot().status, "error");
  saver.dispose();
});
test("untitled drafts are normalized and unchanged documents do not write", async () => {
  let calls = 0;
  const saver = new Autosave(document, async (_id, draft, revision) => {
    calls++;
    assert.equal(draft.title, "Untitled");
    return { ...document, ...draft, revision: revision + 1 };
  });
  assert.equal(await saver.flush(), true);
  assert.equal(calls, 0);
  saver.update({ title: "  " });
  assert.equal(await saver.flush(), true);
  assert.equal(calls, 1);
  saver.dispose();
});
