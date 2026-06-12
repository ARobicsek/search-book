# Next Session Prompt

This file is the handoff document for the next AI session (Claude Code **or** Gemini/Antigravity — the protocol is agent-agnostic). It summarizes what was just accomplished, what to work on next, and any open items.

### What Was Just Completed (2026-06-12, third session) — Phase 2 touch-ups, DEPLOYED

Commits `e099388`, `68e8eaa`, `9f90bdd`, `d718ffa` on `main`; Turso DDL (2 additive CREATE TABLEs) run by the user in the console; deploy + `/api/health` verified live.

1. **Edit/delete everywhere**: every card on `/meetings` has Edit (pencil) and Delete (trash + confirm). The Quick Log dialog is now the **canonical meeting editor** — `useQuickLog().openEdit(id)` loads the full record (title/date/type/summary/notes/next steps/anchor contact/org/participants with per-person notes/attendees description/tags) and PUTs on save.
2. **Meeting prep notes** (`ConversationPrepNote` + `/api/conversation-prepnotes`): on ANY meeting. Advance prep = quick-log the meeting with a future date, add prep notes (staged locally in create mode, live in edit mode). Amber block on meeting cards.
3. **Attachments** (`ConversationAttachment` + `/api/conversation-attachments` + `POST /api/upload/file`): images/PDF/Office/text/zip, **4MB cap** (Vercel body limit). Prod → Vercel Blob `files/` prefix (best-effort `del()` on remove); dev → `server/data/files/` at `/files` (vite proxy added). Image attachments = thumbnails; others = name links.
4. **Markdown speed typing** (`client/src/components/markdown-textarea.tsx`): toolbar + **Ctrl+B / Ctrl+I / Ctrl+Shift+8 / Ctrl+Shift+7 / Ctrl+Alt+1-3** + **Enter auto-continues lists** + **paste-screenshot → upload → `![](url)`**. Wired into meeting dialog, contact-detail conversation editor, contact prep-note forms.
5. Backup paths now cover **26 tables**, `_meta.version` **4** (server `buildExport`/import + client `TABLES_PARENT_FIRST`).
6. `prep-note-markdown` CSS styles h1–h3 + constrains inline images.

**Gotchas captured this session:**
- The client **build** (`tsc -b`, used by Vercel `build:vercel`) enforces `noUnusedLocals`; the `typecheck` script (`tsc --noEmit`) does not. **Run `npm run build --prefix client` before pushing UI changes**, or prepush alone can pass while the deploy fails (that happened; fixed in `d718ffa`).
- `npx prisma db push` resolves `file:./dev.db` against the **CWD**; the runtime (`db.ts`) resolves it against `server/prisma/`. Push with: `cd server; $env:DATABASE_URL='file:./prisma/dev.db'; npx prisma db push`. A stray empty `server/dev.db` from before this was caught still exists — **safe to delete** (gitignored).
- The Turso auth token commented out in `server/.env` is **stale (401)**. The user runs console DDL instead; if a script run is ever needed, get a fresh token first (`server/scripts/migrate-turso-phase2-touchups.js` shows the pattern).
- Local dev photo/file binaries under `server/data/` are tracked in git (existing convention).

### What's Next — Search Upgrade (user-requested)

**Plan of record: `.planning/SEARCH-UPGRADE-PLAN.md`.** Read it fully (it's short), then build top-to-bottom:

- **Task S.1** — server: full field coverage (incl. contact `personalDetails`, tags everywhere, meeting takeaways/prep notes, org activity log), `scopes` + `sort` params, multi-term AND with quoted phrases, match-evidence snippets. No schema changes, no Turso DDL.
- **Task S.2** — client `/search`: scope chips (URL + localStorage), sort dropdown, highlighted snippets, per-group "show all" deep links.
- **Task S.3** — mobile (390px) + prod perf validation.

After that: back to the adaptation plan — **Phase 3** (blocked on D8/D9) / **Phase 4** (blocked on D5/D6). The user said login changes + AI features wait ~2 weeks for info they don't yet have — **don't push on D5–D9 until they raise them.**

### Suggested verification at session start (2 min)

Live site smoke test if the user hasn't already: /meetings → edit a meeting, add a prep note, upload an attachment (first prod use of Blob `files/` prefix), delete a throwaway meeting.

### Carry-over items (pre-dating, lower priority)

1. **[USER ACTION]** Set `SENTRY_DSN` / `VITE_SENTRY_DSN` in Vercel (hardening Task 17).
2. Desktop-only verifications parked from Phase 7.5 (photo-ZIP CORS vs prod; restore into scratch Turso DB).
3. Replace `resetPrisma()` per-request pattern with a long-lived PrismaClient.
4. Company near-duplicate scan (LinkedIn-variant suffixes).
5. Meeting-editor parity: contact-detail's embedded editor still has its own actions/links/photo sections; the global dialog doesn't do follow-up actions yet. Consolidate when it next causes friction.

### Open Bugs / Known Caveats

- No confirmed bugs. Attachment binaries (like photos) are NOT in the daily cloud DB backup — by design. Attachment delete may orphan a blob (harmless).

### Working branch

`main`, clean and pushed; Vercel deploy of `d718ffa` verified live (new bundle + healthy DB).
