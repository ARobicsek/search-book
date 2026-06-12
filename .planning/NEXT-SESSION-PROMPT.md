# Next Session Prompt

This file is the handoff document for the next AI session (Claude Code **or** Gemini/Antigravity — the protocol is agent-agnostic). It summarizes what was just accomplished, what to work on next, and any open items.

### ⚠️ FIRST: Turso DDL is pending — code is committed locally but NOT pushed

The 2026-06-12 (third session) work is committed on local `main` (`e099388` + `68e8eaa`) but **not pushed**, per the rule "never push schema-touching code before the Turso DDL is applied." Two **additive CREATE TABLEs** (zero risk to existing rows) must run against Turso first. Either:

- **Option A (Turso web console, easiest):** paste the two `CREATE TABLE` statements from `server/scripts/migrate-turso-phase2-touchups.js` (drop the `IF NOT EXISTS` if you prefer; omit BEGIN/COMMIT — the console auto-commits per statement), **or**
- **Option B (script):** the Turso auth token in `server/.env` (commented out) is **stale — returns 401**. Get a fresh token (Turso dashboard → database → tokens, or `vercel env pull` after `vercel login`), then:
  `cd server; $env:TURSO_DATABASE_URL='libsql://searchbook-arobicsek.aws-us-east-2.turso.io'; $env:TURSO_AUTH_TOKEN='<fresh>'; node scripts/migrate-turso-phase2-touchups.js`
  (script verifies both tables + untouched Conversation row count). Consider updating the commented token in `server/.env` while at it.

Then `git push` (auto-deploys) and verify on https://searchbook-three.vercel.app: /meetings shows pencil/trash icons; edit a meeting; add a prep note + attachment (attachment upload exercises Vercel Blob `files/` prefix — first prod use).

### What Was Just Completed (2026-06-12, third session) — Phase 2 touch-ups

User-requested additions to the Phase 2 meetings work (commit `e099388`):

1. **Edit/delete everywhere**: every card on `/meetings` has Edit (pencil) and Delete (trash + confirm dialog). The Quick Log dialog is now the **canonical meeting editor** — `useQuickLog().openEdit(id)` loads the full record (title/date/type/summary/notes/next steps/anchor contact/org/participants **with per-person notes**/attendees description/tags) and PUTs on save. Server PUT/DELETE already existed; this was client-only plus payload includes.
2. **Meeting prep notes** (`ConversationPrepNote` table + `/api/conversation-prepnotes`, mirrors company-prepnotes): on ANY meeting, not just contact-anchored ones. For notes **in advance**: quick-log the meeting with a future date, then add prep notes (in create mode they're staged locally and saved right after the meeting POST). Shown in an amber block on meeting cards and inside the editor.
3. **Attachments** (`ConversationAttachment` table + `/api/conversation-attachments` + `POST /api/upload/file`): screenshots/decks/PDFs/Office/text/zip, **4MB cap** (Vercel ~4.5MB serverless body limit). Prod → Vercel Blob (`files/` prefix, best-effort `del()` on remove); dev → `server/data/files/` served at `/files` (vite proxy added). Images render as 16×16 thumbnails on cards, other files as name links.
4. **Markdown speed typing** (`client/src/components/markdown-textarea.tsx`): toolbar (H3/bold/italic/bullets/numbered) + shortcuts **Ctrl+B / Ctrl+I / Ctrl+Shift+8 (bullets) / Ctrl+Shift+7 (numbered) / Ctrl+Alt+1-3 (# ## ###)** + **Enter auto-continues lists** (numbered lists auto-increment; Enter on an empty item ends the list) + **paste a screenshot → auto-upload → `![](url)` inserted**. Wired into: meeting dialog notes + prep notes, contact-detail conversation notes, contact prep-note add/edit forms.
5. Both backup paths updated (**26 tables now**, `_meta.version` 4): server `buildExport`/import + client `TABLES_PARENT_FIRST`.
6. `prep-note-markdown` CSS now styles h1–h3 and constrains inline images.

All verified in-browser locally (edit→save→card refresh, prep note add/delete, attachment upload/serve/remove, delete-with-confirm, bullet auto-continue, Ctrl+B). Typecheck passes. Test artifacts were cleaned up.

**Gotchas discovered this session:**
- `npx prisma db push` resolves `file:./dev.db` against the **CWD** (Prisma 7 + prisma.config.ts), but runtime `db.ts` resolves it against `server/prisma/`. Run pushes as: `$env:DATABASE_URL='file:./prisma/dev.db'; npx prisma db push` from `server/`. A stray empty `server/dev.db` was created before this was caught — **delete `server/dev.db`** (it's gitignored, harmless, but confusing).
- Local dev photo/file binaries under `server/data/` are **tracked in git** (existing convention for photos; files follows it).
- The Turso token in `server/.env` is stale (401) — see above.

### What's Next

1. **Search upgrade — plan of record: `.planning/SEARCH-UPGRADE-PLAN.md`** (user-requested; 3 tasks S.1–S.3, no schema changes). Read that file; start with Task S.1.
2. Then back to the adaptation plan: **Phase 3** (gated on D8/D9 for auth-before-stance-data) / **Phase 4** (gated on D5/D6). Decisions D5–D9 still open (list in `NCQA-ADAPTATION-PLAN.md`); the user said login changes + AI features wait ~2 weeks for info they don't have yet — don't push on these until they raise them.

### Carry-over items (pre-dating, lower priority)

1. **[USER ACTION]** Set `SENTRY_DSN` / `VITE_SENTRY_DSN` in Vercel (hardening Task 17).
2. Two desktop-only verifications parked from Phase 7.5 (photo-ZIP CORS vs prod; restore into scratch Turso DB).
3. Replace `resetPrisma()` per-request pattern with a long-lived PrismaClient.
4. Company near-duplicate scan (LinkedIn-variant suffixes).
5. Meeting-editor parity backlog: the contact-detail conversation dialog still has its own (older) editor with actions/links/photo sections; the global meeting dialog doesn't do follow-up actions yet. Consider consolidating when it next causes friction.

### Open Bugs / Known Caveats

- No confirmed bugs. Attachment binaries (like photo binaries) are NOT in the daily cloud DB backup — by design.
- Attachment `DELETE` removes the DB row and best-effort deletes the Vercel Blob; orphaned blobs are possible and harmless.
- Vercel Blob `files/` uploads not yet exercised in prod (first use comes after this deploy).

### Working branch

Local `main`, two commits ahead of `origin/main` (`e099388`, `68e8eaa`) — push blocked on the Turso DDL above. Standing permission to push to `main` once DDL is applied.
