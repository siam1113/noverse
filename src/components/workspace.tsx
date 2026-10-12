"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  FileText,
  GitBranch,
  Menu,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Route,
  Search,
  Trash2,
  X,
  Download,
} from "lucide-react";
import {
  contentSchema,
  type DocumentSummary,
  type NoteDocument,
} from "@/lib/schema";
import { processContent, welcomeContent } from "@/lib/templates";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { DocumentPane, type DocumentHandle } from "./document-pane";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data;
}
export function Workspace() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [active, setActive] = useState<NoteDocument | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reloadOpen, setReloadOpen] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const pane = useRef<DocumentHandle>(null);
  const operation = useRef(false);
  const listRequest = useRef(0);
  const search = useRef<HTMLInputElement>(null);
  const loadList = useCallback(async () => {
    const request = ++listRequest.current;
    setLoading(true);
    setError("");
    try {
      const items = await api<DocumentSummary[]>("/api/documents");
      if (request !== listRequest.current) return;
      setDocuments(items);
      let lastId: string | null = null;
      try {
        lastId = localStorage.getItem("noverse:last-page");
      } catch {
        /* Storage may be disabled. */
      }
      if (lastId && items.some((item) => item.id === lastId)) {
        const document = await api<NoteDocument>(`/api/documents/${lastId}`);
        if (request !== listRequest.current) return;
        if (!contentSchema.safeParse(document.content).success)
          throw new Error(
            "This page contains invalid content and cannot be opened safely.",
          );
        setActive(document);
      }
    } catch (error) {
      if (request === listRequest.current) setError((error as Error).message);
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadList();
  }, [loadList]);
  useEffect(() => {
    if (active) {
      try {
        localStorage.setItem("noverse:last-page", active.id);
      } catch {
        /* Persistence lives in PostgreSQL; this is only a navigation preference. */
      }
    }
  }, [active]);
  const onSaved = useCallback((document: NoteDocument) => {
    setDocuments((items) =>
      items
        .map((item) =>
          item.id === document.id
            ? {
                id: document.id,
                title: document.title,
                revision: document.revision,
                createdAt: document.createdAt,
                updatedAt: document.updatedAt,
              }
            : item,
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  }, []);
  async function run(action: () => Promise<void>, flush = true) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      if (flush && pane.current && !(await pane.current.flush())) {
        setError(
          "Save or download your current changes before leaving this page.",
        );
        return;
      }
      await action();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  function open(document: DocumentSummary) {
    if (document.id === active?.id) {
      setSidebarOpen(false);
      return;
    }
    void run(async () => {
      const next = await api<NoteDocument>(`/api/documents/${document.id}`);
      if (!contentSchema.safeParse(next.content).success)
        throw new Error(
          "This page contains invalid content and cannot be opened safely.",
        );
      setActive(next);
      setSidebarOpen(false);
    });
  }
  function create(template: "blank" | "welcome" | "process" = "blank") {
    void run(async () => {
      const body =
        template === "welcome"
          ? { title: "A little room to think", content: welcomeContent() }
          : template === "process"
            ? { title: "One step at a time", content: processContent() }
            : {};
      const document = await api<NoteDocument>("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setDocuments((items) => [document, ...items]);
      setActive(document);
      setSidebarOpen(false);
    });
  }
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setSidebarOpen(true);
        requestAnimationFrame(() => search.current?.focus());
      }
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
  const filtered = documents.filter((document) =>
    document.title.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="workspace">
      {sidebarOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}
        aria-label="Documents"
      >
        <div className="brand">
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span>
            noverse<span className="brand-dot">.</span>
          </span>
          <Button
            className="mobile-close"
            variant="ghost"
            size="icon"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          >
            <PanelLeftClose size={18} />
          </Button>
        </div>
        <div className="workspace-label">
          <span className="avatar">You</span>
          <div>
            Personal space<small>A place for your thoughts</small>
          </div>
        </div>
        <label className="search-field">
          <Search size={16} />
          <input
            ref={search}
            aria-label="Search documents"
            placeholder="Find a page…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>⌘ K</kbd>
        </label>
        <Button
          className="new-document"
          disabled={busy || loading}
          onClick={() => create()}
        >
          <Plus size={17} />
          New page
        </Button>
        <div className="sidebar-section-title">
          <span>Your pages</span>
          <span>{documents.length}</span>
        </div>
        <nav className="document-list" aria-label="Your pages">
          {loading ? (
            <p className="sidebar-empty">Loading your pages…</p>
          ) : filtered.length ? (
            filtered.map((document) => (
              <button
                key={document.id}
                className={`document-link ${active?.id === document.id ? "active" : ""}`}
                disabled={busy}
                aria-current={active?.id === document.id ? "page" : undefined}
                onClick={() => open(document)}
              >
                <FileText size={16} />
                <span>{document.title}</span>
                {active?.id === document.id && <span className="active-dot" />}
              </button>
            ))
          ) : (
            <p className="sidebar-empty">
              {query
                ? "No pages match your search."
                : "Your first thought starts with a new page."}
            </p>
          )}
        </nav>
        <div className="sidebar-bottom">
          <BookOpen size={17} />
          <div>
            Your ideas, connected.<small>One page at a time.</small>
          </div>
          <span className="version-badge">v1</span>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs">
            <Button
              variant="ghost"
              size="icon"
              className="mobile-menu"
              aria-label="Open sidebar"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={18} />
            </Button>
            <span>Personal space</span>
            <ChevronRight size={14} />
            <strong>
              {active
                ? (documents.find((item) => item.id === active.id)?.title ??
                  active.title)
                : "Your notebook"}
            </strong>
          </div>
          {active && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Page actions">
                  <MoreHorizontal size={20} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => pane.current?.download()}>
                  <Download />
                  Download JSON
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="danger-text"
                  onSelect={() => setDeleteOpen(true)}
                >
                  <Trash2 />
                  Delete page
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </header>
        {error && (
          <div className="workspace-error" role="alert">
            <span>{error}</span>
            {!active && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadList()}
              >
                Retry
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <X size={16} />
            </Button>
          </div>
        )}
        {active ? (
          <DocumentPane
            key={`${active.id}:${editorKey}`}
            ref={pane}
            disabled={busy}
            document={active}
            onSaved={onSaved}
            onReload={() => setReloadOpen(true)}
          />
        ) : (
          <div className="welcome">
            <div className="welcome-symbol">
              <Route size={38} strokeWidth={1.3} />
            </div>
            <p className="welcome-intro">
              A notebook with a little more possibility
            </p>
            <h1>
              Make room
              <br />
              for your thoughts.
            </h1>
            <p className="welcome-description">
              A quiet place to write, connect the dots, and turn a tangle of
              ideas into something you can see.
            </p>
            <Button disabled={busy || loading} onClick={() => create()}>
              <Plus size={17} />
              Create your first page
            </Button>
            <div className="starter-heading">
              Or start with a little structure
            </div>
            <div className="template-grid">
              <button
                disabled={busy || loading}
                className="template-card"
                onClick={() => create("welcome")}
              >
                <div className="template-preview timeline-preview">
                  <i />
                  <i />
                  <i />
                </div>
                <span>
                  <Route size={17} />A little room to think
                  <ArrowUpRight size={16} />
                </span>
                <p>An editable tour of timelines and ideas.</p>
              </button>
              <button
                disabled={busy || loading}
                className="template-card"
                onClick={() => create("process")}
              >
                <div className="template-preview steps-preview">
                  <i>1</i>
                  <i>2</i>
                  <i>3</i>
                </div>
                <span>
                  <GitBranch size={17} />
                  One step at a time
                  <ArrowUpRight size={16} />
                </span>
                <p>Give your next process a clear path.</p>
              </button>
            </div>
          </div>
        )}
      </main>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogTitle>Delete this page?</DialogTitle>
          <DialogDescription>
            “
            {documents.find((item) => item.id === active?.id)?.title ??
              active?.title}
            ” will be permanently deleted. You can download a copy first.
          </DialogDescription>
          <div className="dialog-actions">
            <Button variant="outline" onClick={() => pane.current?.download()}>
              <Download size={15} />
              Download copy
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (!active) return;
                  await api(`/api/documents/${active.id}`, {
                    method: "DELETE",
                  });
                  setDocuments((items) =>
                    items.filter((item) => item.id !== active.id),
                  );
                  setActive(null);
                  setDeleteOpen(false);
                }, false)
              }
            >
              Delete page
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={reloadOpen} onOpenChange={setReloadOpen}>
        <DialogContent>
          <DialogTitle>Load the saved version?</DialogTitle>
          <DialogDescription>
            This replaces your current unsaved draft. Download it first if you
            want to keep a copy.
          </DialogDescription>
          <div className="dialog-actions">
            <Button variant="outline" onClick={() => pane.current?.download()}>
              Download draft
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (!active) return;
                  const document = await api<NoteDocument>(
                    `/api/documents/${active.id}`,
                  );
                  if (!contentSchema.safeParse(document.content).success)
                    throw new Error(
                      "The saved document contains invalid content.",
                    );
                  setActive(document);
                  setEditorKey((value) => value + 1);
                  onSaved(document);
                  setReloadOpen(false);
                }, false)
              }
            >
              Load saved version
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
