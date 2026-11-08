# Aether Writer

Local-first, desktop-grade writing workspace for long-form texts: novels, screenplays and manuscripts.
It combines a Scrivener-style binder, a Notion-flavoured interface and a Word-like WYSIWYG editor.

Project data stays on the device — no server, no account, no upload. New installations start in
`localStorage`; the app can migrate projects to IndexedDB and Yjs after a full backup is downloaded
and explicitly confirmed.

## Features

- **Binder tree** — folders, documents, research notes and character cards, with drag & drop,
  inline rename, duplicate (content included), colour labels and document status.
- **WYSIWYG editor** — TipTap/ProseMirror (block-based document model) with a block-type selector,
  lists, quotes, inline code, marks, alignment and font family. Writing always stays continuous;
  page mode is a read-only Paged.js preview with print CSS and a Print / Save PDF action.
- **Page set-up** — A4, A5, Letter or custom paper, portrait/landscape, four margins and running
  header/footer text (with `{page}` / `{pages}` counters). Edit it under **Preferences → Page**. The
  set-up is shared through the project's Y.Map; page breaks themselves are calculated locally by
  each client.
- **Self-hosted fonts** — Literata, PT Serif, Inter, EB Garamond, JetBrains Mono and Cinzel ship as
  local woff2 files, so page layout does not depend on fonts installed on a collaborator's device.
- **Customisable toolbar** — every group (block type, marks, lists, alignment, find, view switch, zoom,
  selection bubble) can be hidden; the choice is persisted per device.
- **Find & replace** — operates on the ProseMirror document, so formatting is preserved.
- **Book typography** — prose set like a printed page: justified lines, first-line indent, no gaps
  between paragraphs, hyphenation per manuscript language. A spaced draft style is one setting away.
- **Draft view** — compiles only the Manuscript folder into one continuous, editable scroll
  (Scrivener-style), with an optional scene separator (none / line / * * *).
- **Inspector** — synopsis, status, scratchpad notes, bookmarks, editorial comments and snapshots.
- **Snapshots** — save/restore a full copy of the project, including each document's Yjs state and a
  readable preview (the last 20 are kept).
- **Automatic recovery** — writing checkpoints every five active minutes and safety snapshots before
  document deletion, imports, restores and session close.
- **Autosave** — debounced writes with a visible save state and error reporting.
- **Import / export** — import a project from the start page, export an individual project's
  documents from its actions menu, and create a full `.aether-backup` archive for migration/recovery.
- **Backups and installability** — weekly full-backup reminders, optional daily backups to a chosen
  folder in Chromium browsers, and an installable offline app shell.
- **Dark and light themes**, persisted together with typography preferences.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

### Scripts

| Script            | What it does                                    |
| ----------------- | ----------------------------------------------- |
| `npm run dev`     | Vite dev server with HMR on port 3000           |
| `npm run build`   | Production build into `dist/`                   |
| `npm run preview` | Serve the production build                      |
| `npm run typecheck` / `npm run lint` | Strict TypeScript check        |
| `npm run test:storage` | Storage contract and migration tests |
| `npm run clean`   | Remove `dist/`                                 |

For a browser pagination smoke test, run `npm run dev` and open
`/tests/paged-preview-smoke.html`. It renders 60 table rows, long paragraphs, headings and an image,
and writes `READY:<page-count>` to an `<output>` element when Paged.js finishes. Open it in two
browsers and compare that count: the table rows must all survive and every split table page must
repeat its header. The page also exercises the running header/footer margin boxes.

## Project structure

```
src/
  components/
    start/            Start page + create-project modal
    workspace/        Menu bar, toolbar, status bar, binder, editor, inspector
    modals/           Preferences dialog
  editor/             TipTap editor wrapper
  storage/            Storage contract, localStorage and IndexedDB/Yjs implementations
  store/              Zustand stores (UI, editor preferences, project data)
  types/              Domain model (project, binder, documents…)
  utils/              Templates, text helpers, ProseMirror replacement
```

## Persistence

`StorageBootstrapper` keeps the legacy projects in `LocalStorageAdapter` until the user exports a
full backup, saves it outside the browser, and confirms that step on the start page. It then copies
projects, documents, snapshots, and recents into the `aether-writer` IndexedDB database and writes
each document and project structure as a Yjs document. A migration marker is saved only after
verification. The original `localStorage` data is not deleted.

Collaborative document storage is scoped by both project and document ID. New template documents
also receive project-unique IDs, so creating or opening the same template in multiple projects
cannot attach one project's Yjs state to another. Compatible legacy Yjs state is verified against
the saved document before it is adopted; mismatched legacy state falls back to the project's saved
document copy.

The legacy localStorage keys are namespaced:

- `aether_recent_projects_v1` — project library index
- `aether_manifest_<projectId>` — project tree + settings
- `aether_doc_<projectId>_<documentId>` — document content
- `aether_snapshot_<projectId>_<snapshotId>` — project snapshots
- `aether_theme`, `aether_editor_preferences_v1` — device preferences

After migration, project data uses IndexedDB; device preferences and the untouched legacy copy
remain in localStorage. A failed migration is reported and the app continues using the legacy
storage.

The Backup section in Preferences reports the browser's storage estimate for this origin. Use
**Protect data** to request persistent browser storage; Aether also requests it after the first
user interaction. The browser may decline either request, and persistence does not replace
exporting backups to another device.

Snapshots retain a Yjs binary update alongside readable document content. Restore applies the saved
content to the existing collaborative document in a transaction, rather than replacing its Yjs
document identity. Automatic snapshots are created every five minutes during active editing, before
deleting documents, importing projects, restoring a snapshot, and closing a session. The newest 20
snapshots per project are retained; Yjs garbage collection remains enabled.

Full-library backups include all projects and snapshots. A weekly reminder appears until a backup is
downloaded or saved. In Chromium-based browsers, choose a folder in Preferences to write a daily
`.aether-backup` file while the app is in use, when leaving the workspace, and before closing a
project. Reconnect the folder in Preferences if the browser revokes its permission.

The production service worker caches only the app shell and built assets, not project data.
Installation is available through the browser's install action; offline launch works after the
service worker has installed and the app assets have been loaded at least once.

When migration is enabled, the editor waits for the scene's Yjs IndexedDB provider before mounting
TipTap. The Yjs `default` fragment is the editor's source of truth, and Collaboration supplies
undo/redo instead of StarterKit history. Open copies of a scene exchange Yjs updates through
`BroadcastChannel`; browsers without it open the scene read-only. Scene lifecycle cleanup also
prevents a deleted document from being written back by an editor that was already open.

The project binder and settings are read from the project's Yjs maps. Structure saves notify other
open tabs through `BroadcastChannel`, which reload their current project view. Projects with a
`schemaVersion` newer than this app's supported version open read-only: the editor does not attach
a writable Yjs provider, and storage writes are rejected to avoid downgrading or changing data.
Browsers without `BroadcastChannel` do not receive live binder updates from other tabs.
Binder siblings use fractional string order keys. Concurrent inserts into the same gap may receive
the same key, so the node id is the stable tie-breaker; moving an item does not renumber its peers.
Moves are applied as atomic IndexedDB/Yjs updates to a single binder node, allowing concurrent moves
of different nodes to merge without one stale tab overwriting the other's move.
Binder creation, duplication, metadata updates, deletion, expansion, and document word-count updates
also write only changed nodes in one IndexedDB transaction, so unrelated edits in another tab are
preserved.

Word counts are cached on each binder node, so the status bar can show the manuscript total
without loading every document.

The editor always remains continuous while writing. Page preview serializes the current document
to read-only HTML, preloads the selected self-hosted font, waits for `document.fonts.ready`, and
uses Paged.js plus print CSS (`@page`, `break-inside`, and semantic table headers) to preview page
breaks. Automatic hyphenation is disabled in the paginated preview because browser dictionaries
move breaks between engines; keeping it manual makes the same document produce the same page count
and break positions in different browsers. Split tables repeat their `thead` in the preview; table
content and images remain in the TipTap document schema. Use **Print / Save PDF** from the preview
to print the paginated output. Paged.js is lazy-loaded only when page preview is opened; pagination
is client-side and is not stored in Yjs. Page size, orientation, margins and header/footer text live
in the project settings map and therefore reach every collaborator; the computed pages do not.

The bundled fonts are licensed under the SIL Open Font License 1.1; see
[`public/fonts/FONT-LICENSES.txt`](public/fonts/FONT-LICENSES.txt).

## Keyboard shortcuts

| Shortcut                | Action                     |
| ----------------------- | -------------------------- |
| `⌘S` / `Ctrl+S`         | Save the current document  |
| `⌘F` / `Ctrl+F`         | Find & replace             |
| `⌘⇧B` / `Ctrl+Shift+B`  | Toggle binder              |
| `⌘⇧I` / `Ctrl+Shift+I`  | Toggle inspector           |
| `⌘\` / `Ctrl+\`         | Toggle focus mode          |

## License

Apache-2.0. See [LICENSE](LICENSE).
