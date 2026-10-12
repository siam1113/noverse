"use client";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Check,
  CloudOff,
  Download,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { Autosave } from "@/lib/autosave";
import type { NoteDocument } from "@/lib/schema";
import { Button } from "./ui/button";
import { NoteEditor } from "./editor/note-editor";
export type DocumentHandle = {
  flush: () => Promise<boolean>;
  download: () => void;
};
export const DocumentPane = forwardRef<
  DocumentHandle,
  {
    document: NoteDocument;
    onSaved: (document: NoteDocument) => void;
    onReload: () => void;
    disabled?: boolean;
  }
>(function DocumentPane({ document, onSaved, onReload, disabled }, ref) {
  const [title, setTitle] = useState(document.title);
  const [saver] = useState(() => new Autosave(document, undefined, onSaved));
  const state = useSyncExternalStore(
    saver.subscribe,
    saver.getSnapshot,
    saver.getSnapshot,
  );
  function download() {
    const blob = new Blob(
      [JSON.stringify({ ...saver.getDraft(), id: document.id }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${title.replace(/[^a-z0-9 -]/gi, "").slice(0, 80) || "Untitled"}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  useImperativeHandle(ref, () => ({ flush: saver.flush, download }));
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (saver.isDirty()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const flush = () => {
      void saver.flush();
    };
    const visibility = () => {
      if (window.document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("blur", flush);
    window.document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("blur", flush);
      window.document.removeEventListener("visibilitychange", visibility);
      saver.dispose();
    };
  }, [saver]);
  const failed = state.status === "error" || state.status === "conflict";
  return (
    <div
      className="document-pane"
      inert={disabled || undefined}
      aria-busy={disabled}
    >
      <div className="document-meta">
        <span className="document-kind">Personal note</span>
        <span
          className={`save-status ${failed ? "save-error" : ""}`}
          role="status"
          aria-live="polite"
          title={state.message}
        >
          {state.status === "saved" ? (
            <Check size={14} />
          ) : failed ? (
            <CloudOff size={14} />
          ) : (
            <LoaderCircle className="saving-spinner" size={14} />
          )}
          {
            {
              saved: "Saved",
              saving: "Saving…",
              pending: "Unsaved changes",
              error: "Save failed",
              conflict: "Conflict",
            }[state.status]
          }
        </span>
      </div>
      <input
        aria-label="Document title"
        className="document-title"
        value={title}
        placeholder="Untitled"
        maxLength={240}
        onChange={(event) => {
          setTitle(event.target.value);
          saver.update({ title: event.target.value });
        }}
        onBlur={() => {
          if (!title.trim()) setTitle("Untitled");
          void saver.flush();
        }}
      />
      <div className="document-date">
        Created{" "}
        {new Date(document.createdAt).toLocaleDateString(undefined, {
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </div>
      {failed && (
        <div className="save-notice" role="alert">
          <strong>
            {state.status === "conflict"
              ? "There’s a newer version of this page."
              : "Your changes haven’t been saved."}
          </strong>
          <p>{state.message}</p>
          <div>
            <Button variant="outline" size="sm" onClick={download}>
              <Download size={14} />
              Download draft
            </Button>
            {state.status === "conflict" ? (
              <Button variant="outline" size="sm" onClick={onReload}>
                <RefreshCw size={14} />
                Load latest…
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void saver.flush()}
              >
                <RefreshCw size={14} />
                Retry save
              </Button>
            )}
          </div>
        </div>
      )}
      <NoteEditor
        content={document.content}
        onChange={(content) => saver.update({ content })}
        onBlur={() => void saver.flush()}
      />
      <div className="page-footer">
        <span>Space for your next thought.</span>
        <span>
          Type <kbd>/</kbd> to add a block
        </span>
      </div>
    </div>
  );
});
