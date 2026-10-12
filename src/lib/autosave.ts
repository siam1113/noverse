import {
  contentSchema,
  MAX_BODY_BYTES,
  type DocNode,
  type NoteDocument,
} from "./schema";

export type SaveStatus = "saved" | "pending" | "saving" | "error" | "conflict";
export type SaveSnapshot = { status: SaveStatus; message: string };
export type Draft = { title: string; content: DocNode };
export class SaveFailure extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Persist = (
  id: string,
  draft: Draft,
  revision: number,
) => Promise<NoteDocument>;
export const persistDocument: Persist = async (id, draft, revision) => {
  const response = await fetch(`/api/documents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...draft, expectedRevision: revision }),
    keepalive: false,
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new SaveFailure(
      response.status,
      data.error ?? "Could not save your changes",
    );
  return data;
};

/** One writer per open document. Each request waits for the last revision; edits
 * made during a request stay dirty and are drained before navigation succeeds. */
export class Autosave {
  private listeners = new Set<() => void>();
  private snapshot: SaveSnapshot = {
    status: "saved",
    message: "All changes saved",
  };
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<boolean>;
  private generation = 0;
  private savedGeneration = 0;
  private revision: number;
  private draft: Draft;
  constructor(
    private document: NoteDocument,
    private persist: Persist = persistDocument,
    private onSaved: (document: NoteDocument) => void = () => {},
  ) {
    this.revision = document.revision;
    this.draft = { title: document.title, content: document.content };
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  getDraft = () => this.draft;
  isDirty = () => this.generation !== this.savedGeneration;
  private publish(status: SaveStatus, message: string) {
    this.snapshot = { status, message };
    this.listeners.forEach((listener) => listener());
  }
  update(patch: Partial<Draft>) {
    this.draft = { ...this.draft, ...patch };
    this.generation++;
    clearTimeout(this.timer);
    if (this.snapshot.status === "conflict") return;
    this.publish("pending", "Unsaved changes");
    this.timer = setTimeout(() => {
      void this.flush();
    }, 700);
  }
  flush = (): Promise<boolean> => {
    clearTimeout(this.timer);
    if (this.snapshot.status === "conflict") return Promise.resolve(false);
    if (this.running) return this.running;
    if (!this.isDirty()) return Promise.resolve(true);
    this.running = this.drain().finally(() => {
      this.running = undefined;
    });
    return this.running;
  };
  private async drain(): Promise<boolean> {
    while (this.isDirty()) {
      const generation = this.generation;
      const draft = {
        ...this.draft,
        title: this.draft.title.trim() || "Untitled",
      };
      const valid = contentSchema.safeParse(draft.content);
      if (
        !valid.success ||
        draft.title.length > 240 ||
        new TextEncoder().encode(JSON.stringify(draft)).length >
          MAX_BODY_BYTES - 100
      ) {
        this.publish(
          "error",
          valid.success
            ? "This document is too large to save. Shorten it and retry."
            : "A block contains invalid content. Undo your last edit or download your draft.",
        );
        return false;
      }
      this.publish("saving", "Saving changes…");
      try {
        const saved = await this.persist(
          this.document.id,
          draft,
          this.revision,
        );
        this.revision = saved.revision;
        this.savedGeneration = generation;
        this.onSaved(saved);
      } catch (error) {
        this.publish(
          error instanceof SaveFailure && [409, 404].includes(error.status)
            ? "conflict"
            : "error",
          error instanceof Error
            ? error.message
            : "Could not save. Your changes are still here.",
        );
        return false;
      }
    }
    this.publish("saved", "All changes saved");
    return true;
  }
  dispose() {
    clearTimeout(this.timer);
    this.listeners.clear();
  }
}
