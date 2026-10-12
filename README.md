# noverse

A personal visual notebook built from [the V1 specification](visual-notes-v1-mvp.md). Pages combine rich text with editable timelines, callouts, and processes. The Tiptap document is canonical; PostgreSQL stores the structured JSON without flattening components into HTML.

## Run locally

Requires Node.js 22+, npm, and Docker (or an existing PostgreSQL database).

```bash
npm install
cp .env.example .env
docker compose up -d --wait
npm run db:migrate
npm run dev
```

Open **http://127.0.0.1:3000**. Create a blank page, or choose one of the editable starter templates. Type `/timeline` and press Enter to insert a timeline. Add events, change their order, wait for **Saved**, then refresh.

The development and production scripts bind to the loopback interface. This is the single-user local MVP: do not expose its unauthenticated API publicly. For an existing PostgreSQL installation, set `DATABASE_URL` in `.env` and skip Docker. The migration is idempotent and never deletes existing records. Docker data persists in the `noverse-data` volume.

For a production build on your machine:

```bash
npm run build
npm start
```

## Included

- Create, rename, search, reopen, and delete pages, with confirmation before deletion.
- Paragraphs, H1–H3, bullet/numbered/task lists, links, bold, italic, and inline code. StarterKit also supports blockquotes, code blocks, strikethrough, and horizontal rules.
- A filtered slash menu with arrow navigation, Enter, Escape, and pointer support; an Insert button offers the same registry.
- Timelines with an optional subtitle, optional date or freeform time label, title, details, optional status, add/remove, manual reorder, and chronological display.
- Callouts in idea, information, and warning styles; ordered processes with editable steps.
- Component menus for text above/below, duplicate, delete, move, and text conversion. Duplicate components receive new item IDs. Deleted items and structural changes can be undone with the toolbar or Cmd/Ctrl+Z; Cmd/Ctrl+Shift+Z redoes them.
- A responsive document sidebar and editor, accessible labels, Radix dialogs and menus, visible focus states, and reduced-motion support.
- Debounced saves, serialized revision-aware writes, navigation/blur flush, accurate save status, retry, draft JSON download, and explicit conflict recovery.

ISO dates (`YYYY-MM-DD`) sort first in chronological mode; undated events and freeform labels retain their relative order afterward. Returning to manual mode restores the original order. A blank new event is an editable placeholder; leaving its empty title field assigns “Untitled milestone”.

## Persistence and recovery

`PATCH` atomically updates a page only when `expectedRevision` matches the stored revision, then increments it. Concurrent writers receive HTTP 409 instead of silently overwriting another tab. Missing/deleted pages receive 404. Every successful save returns the new revision.

Only one save request runs at a time for an open page. Edits arriving during it remain dirty and are saved with the returned revision. Switching pages waits for all pending edits; the editor is temporarily disabled during that transition. A failed save prevents navigation and retains the draft in memory. Retry after restoring the connection, or download the draft. On conflict, download the draft and explicitly load the saved version. Draft downloads are a recovery/export format; V1 has no import UI.

The browser warns before closing or refreshing with unsaved changes. There is no offline sync or version history. After a successful save, refresh opens the last selected page. Only its ID is stored in localStorage; document content is stored in PostgreSQL.

## Architecture

| Area                                        | Location                                |
| ------------------------------------------- | --------------------------------------- |
| App shell and document navigation           | `src/components/workspace.tsx`          |
| Editor, formatting and slash menu           | `src/components/editor/note-editor.tsx` |
| Extensible insertion registry               | `src/components/editor/registry.ts`     |
| Tiptap custom node definitions              | `src/components/editor/extensions.ts`   |
| Timeline, callout and step React node views | `src/components/editor/block-views.tsx` |
| Validation shared by client and API         | `src/lib/schema.ts`                     |
| Serialized autosave state machine           | `src/lib/autosave.ts`                   |
| CRUD route handlers                         | `src/app/api/documents/`                |
| PostgreSQL migration                        | `migrations/001_documents.sql`          |
| shadcn-style Radix UI primitives            | `src/components/ui/`                    |

The API accepts only recognized nodes, valid parent-child relationships, allowed marks, safe link protocols, and strictly validated block attributes. Limits: 1 MB request bodies, 5,000 total nodes, 12 nesting levels, 100 items per visual component, 240-character titles, and 10,000-character item descriptions. Mutations reject cross-origin browser requests. SQL values are parameterized.

Tiptap packages are pinned together at 3.31.4. Integration follows the official [React node view API](https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views/react), [Next.js setup](https://tiptap.dev/docs/editor/getting-started/install/nextjs), and [StarterKit documentation](https://tiptap.dev/docs/editor/extensions/functionality/starterkit). `immediatelyRender: false` avoids SSR hydration issues. Next.js API handlers use asynchronous route parameters.

To add a component, add its typed attribute schema and parent-child allowance in `schema.ts`, a registry entry with fresh stable item IDs, a React node view and node extension, and round-trip/interaction tests. Existing timeline code does not need to change. Persisted `schemaVersion` is explicitly validated; future versions need a migration before loading old documents.

## Checks

```bash
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

The browser/API suite requires a migrated PostgreSQL database and starts Next.js itself. It creates uniquely named pages and removes them afterward. Use a separate test database if running against a notebook containing important pages. Tests cover:

1. Three timeline events, all fields, manual reorder, surrounding text, and exact JSON after refresh.
2. Slash insertion and Escape, component fields, structural undo/redo, and reload.
3. Forced save failure, retained local edits, retry, stale revision conflict, and explicit resolution.
4. UI creation, title edits, search, navigation flush, and confirmed deletion.
5. Invalid/oversized API input, concurrent writers, and cross-origin mutation rejection.
6. A narrow mobile viewport and sidebar accessibility.

Unit tests cover schema round-tripping, malformed document trees, depth/count limits, chronological order, request guards, and autosave queue behavior.

### Validation in the implementation environment

All 17 unit tests and TypeScript checks pass. Live PostgreSQL API checks cover listing, creation, saving, reopening, deletion, and rejection of unrelated origins. The browser test for document creation, renaming, searching, navigation flush, and confirmed deletion passes using installed Google Chrome. The full browser suite, production build, and screenshot review have not yet been verified. The default Playwright command requires `npx playwright install chromium`.

## Local troubleshooting

- **GET `/api/documents` returns 503:** run `docker compose up -d --wait`, then `npm run db:migrate`. The local database listens on port 55439.
- **Opening the wrong app:** use `http://127.0.0.1:3000`. Another app can independently listen on IPv6 `localhost:3000`.
- Mutation origin checks use the incoming HTTP Host header because Next.js may normalize its internal request URL to `localhost`. The browser origin must still match the actual host, protocol, and port; forwarded headers do not bypass that check.
