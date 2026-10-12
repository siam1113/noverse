# Visual Notes — V1 MVP Specification

## 1. Product thesis
A personal, visual-first note-taking app where each document is composed of editable blocks, including richer structured components (timelines, process flows, callouts, comparison tables, decision logs). Instead of being constrained to paragraphs and lists, the user types `/` to insert a component and edits it directly in the document. Every edit persists and reloads reliably.

**Primary V1 promise:** Type `/timeline`, insert a timeline, add/edit/reorder milestones, refresh the page, and find the timeline unchanged.

**Target user:** A solo knowledge worker mapping ideas, decisions, people, and workflows. Single-user POC first.

## 2. Product principles
1. **Components are real data, not screenshots or Markdown hacks.** Each block has a type and validated structured props.
2. **Edit in place.** No separate complicated builder for ordinary actions.
3. **One source of truth.** Persist the editor document as structured JSON; render components from that document.
4. **Escape hatches.** Standard paragraphs/headings/lists remain simple and fast.
5. **Extensible registry.** New component types can be added without rewriting the editor.
6. **Keyboard-first, accessible, mobile-friendly.** Slash search, arrow navigation, Enter to insert, Escape to close; pointer/touch work too.

## 3. V1 scope
### Must have
- Documents: create, rename, list/search by title, open, delete (with confirmation).
- Rich text: paragraphs, headings H1–H3, bullets, numbered lists, checklists, links, bold/italic/code.
- Slash command menu on typing `/` in an editable text block, filtered by query; keyboard + mouse support.
- **Timeline block**: create using `/timeline`; add/edit/delete/reorder events, date or freeform time label, title, details, optional status (planned/in progress/done); chronological sort toggle; allow undated events; readable vertical display.
- **Callout block**: type (info/warning/idea), title + body.
- **Steps / process block**: ordered steps with title + description, drag or up/down reorder controls.
- Autosave with visible Saving / Saved / Error status; re-open and refresh preserves content.
- Basic responsive layout: left document sidebar, central editor. Collapse sidebar on smaller screens.
- Component toolbar: insert block above/below, duplicate, delete, move up/down, convert to paragraph where safe.
- Empty states and sensible templates for newly inserted components.

### Explicitly not V1
- Real-time collaboration, accounts/permissions, organization profiles, AI generation, databases inside pages, relations/backlinks, infinite canvas, mind maps, sophisticated embedded apps, comments, file uploads, mobile native apps, publishing, offline-first sync, version history. These are potential later stages, not prerequisites.

## 4. Core user flow
1. Open app → document list → New document.
2. Write a title and paragraph; press Enter.
3. Type `/time` → menu filters → choose **Timeline**.
4. A sample editable timeline with 1 placeholder event appears at caret.
5. Fill an event's date, title, and details; add more events and reorder.
6. Autosave runs; refresh → timeline and surrounding text are identical.
7. Continue writing before and after the timeline.

## 5. Recommended POC architecture
- **Frontend:** Next.js + TypeScript + Tailwind CSS + shadcn/ui (Radix-based UI primitives).
- **Editor:** Tiptap / ProseMirror with custom block node views for timeline, callout and steps. Use a slash-command suggestion extension / popup. Choose a well-maintained compatible version and confirm extension APIs before implementing.
- **Database:** PostgreSQL with JSONB for structured document content; local SQLite with JSON text is acceptable for a purely local throwaway POC. Prefer PostgreSQL if this will evolve into a hosted app.
- **Backend:** Next.js route handlers or server actions; Zod validation of document metadata and block props.
- **State:** Editor document is canonical in-memory state; debounced persistence, plus flush on blur/navigation; server returns revision/version for conflict detection.
- **UI elements:** shadcn/ui for menus, dialogs, buttons, popovers—not as an editor engine.

**Architecture choice:** Keep timeline as a true Tiptap custom block node with a React node view, not standalone HTML injected into a rich-text string. The editor owns block ordering, selection and serialization; the node view owns timeline fields and controls.

## 6. Data model
### Database tables
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled',
  content JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
For V1 single-user POC this is sufficient. When authentication is introduced, add ownership and enforce row-level access controls. Never expose write endpoints publicly in production without authentication.

### Illustrative Tiptap/ProseMirror document JSON
```json
{
  "type": "doc",
  "content": [
    {"type":"paragraph","content":[{"type":"text","text":"Project journey"}]},
    {
      "type":"timeline",
      "attrs": {
        "schemaVersion": 1,
        "events": [
          {"id":"e1","date":"2026-10-12","title":"Capture problem","description":"Observe developer pain","status":"done"},
          {"id":"e2","date":null,"title":"Interview users","description":"Validate assumptions","status":"planned"}
        ],
        "sortMode": "manual"
      }
    }
  ]
}
```
Use stable UUIDs for events in implementation. For V1, event descriptions are plain text; nested rich text can come later. Keep event metadata constrained and validate lengths/counts on both client and server.

### Extensible block registry (concept)
```ts
type BlockDefinition = {
  type: string;
  label: string;
  keywords: string[];
  icon: React.ComponentType;
  insert: (editor: Editor) => void;
};

const blockRegistry: BlockDefinition[] = [
  { type: 'timeline', label: 'Timeline', keywords: ['milestones', 'history'], icon: TimelineIcon, insert: insertTimeline },
  { type: 'callout', label: 'Callout', keywords: ['note', 'warning'], icon: CalloutIcon, insert: insertCallout },
  { type: 'steps', label: 'Steps', keywords: ['process', 'workflow'], icon: StepsIcon, insert: insertSteps },
];
```
**Adding a new block should require:** a schema/node extension, a React node view, an insertion command, a registry entry, and serialization/reload tests. Avoid arbitrary user-provided executable components in V1.

## 7. Interaction specification
### Slash menu
- `/` opens menu with searchable available blocks.
- `/timeline` + Enter inserts timeline and removes trigger text.
- Arrow up/down to navigate; Escape dismisses without altering text.
- Slash inside timeline text fields should not accidentally insert editor-level blocks.
- Trigger menu only in editor text contexts; menu follows caret.

### Timeline component
- Inline header: **Timeline**; optional editable subtitle.
- Vertical rail with numbered/status markers and event cards.
- Each event: date/time label (optional), title (required for completed edit), description (optional), status.
- Add event; remove with confirmation or undo; move up/down; sort chronologically or manually.
- Empty placeholder is actionable: “Add your first event.”
- Accessible labels for each control; touch-friendly interaction.

### Saving
- Debounce edits (~500–1000 ms); show optimistic local edits immediately.
- Persist with `revision` optimistic concurrency check (`If-Match` or revision in payload); increment on success.
- Never silently overwrite newer server content. On conflict, show a resolution prompt (V1 may offer reload/copy unsaved JSON).
- On network failure, preserve dirty document in memory and offer retry. No false “Saved” indication.

## 8. API outline
- `GET /api/documents` → lightweight document list.
- `POST /api/documents` → new document.
- `GET /api/documents/:id` → full JSON + revision.
- `PATCH /api/documents/:id` → `{title?, content?, expectedRevision}`; rejects conflict.
- `DELETE /api/documents/:id` → delete.

Validate JSON node types and component attributes; enforce request size and item count limits. Do not blindly trust a client-supplied JSON tree.

## 9. Suggested implementation phases
**Phase 1 — Foundation:** App shell, database, CRUD, editor with standard text blocks, stable JSON round-tripping.

**Phase 2 — Extensibility:** Slash menu + block registry + generic custom node architecture; build callout first to verify pattern.

**Phase 3 — Signature feature:** Timeline React node view, event editing, add/delete/reorder, optional date, sorting, toolbar.

**Phase 4 — Practical polish:** Steps block, autosave status/conflicts, keyboard behavior, responsive UI, undo/redo, error states, regression tests.

## 10. Acceptance tests / definition of done
1. Creating and renaming multiple documents works.
2. `/timeline` inserts a timeline at the cursor and removes the literal slash text.
3. Adding three events and editing dates/title/details/status works.
4. Reordering events preserves order across a hard browser refresh.
5. Text blocks above/below the timeline remain editable and in the correct order.
6. Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z operate predictably on structural changes.
7. Saving state is accurate; a forced API error never displays “Saved”.
8. Invalid structured content fails validation safely rather than crashing the editor.
9. All essential actions are keyboard accessible; narrow mobile viewport has no broken overflow.
10. A new block can be added through registry + extension without changing existing timeline code.

## 11. Agent implementation prompt
> Build the V1 visual-first notes app described in this specification. Prioritize the single end-to-end flow: create a document, type `/timeline`, edit timeline events, autosave structured JSON to a database, reload accurately. Use Next.js, TypeScript, Tailwind, shadcn/ui, Tiptap custom node views, and PostgreSQL JSONB. Implement a clean extensible block registry and supporting Callout and Steps components only after the timeline flow is reliable. Write schema validation, keyboard interactions, error/conflict states, and tests for edit/persist/reload. Do not build authentication, AI, collaboration, or infinite canvas in V1. Avoid mocked persistence or fake ‘Saved’ states. Document how to run locally and demonstrate the acceptance tests.

## 12. Product direction after V1
- **V1.1:** Comparison matrix, decision log, Kanban, embedded Mermaid (read-only then editable), simple relation cards.
- **V1.2:** Cross-document links, backlinks, graph, reusable document templates.
- **V2:** Canvas view with blocks represented spatially, AI-proposed layouts, optional mind maps, more expressive component SDK.

**Build discipline:** First make *one* nontrivial component feel native and reliable. If timeline insertion, editing, ordering, and persistence are shaky, adding 20 block types only multiplies bugs.
