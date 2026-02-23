I'm building **SearchBook**, a lightweight local CRM for managing my executive job search networking.

**Before doing anything, read these files:**
- `.planning/STATE.md` — Session history and decisions
- `.planning/ROADMAP.md` — All phases and acceptance criteria

**GSD methodology.** Atomic commits per task.

---

## What Was Completed Last Session

### Bug Fix: "Resume Edit" badge + card refresh not working after closing edit dialog with 'x'

**Symptom (now resolved):**
- After clicking 'x' to close the edit conversation dialog, the conversation card did not refresh to show auto-saved content and the amber "Resume Edit" badge did not appear.

**Root cause:**
`onOpenChange` was an inline arrow function that captured `editId` and `form` from the React render closure. If Radix UI fired the callback during a window where React had a pending-but-not-yet-committed render, the handler read stale values. Specifically, `editId` could appear as `null`, silently failing the `editId !== null` guard and skipping the entire draft-save + `onRefresh()` block.

**Fix applied** in [client/src/pages/contacts/contact-detail.tsx](client/src/pages/contacts/contact-detail.tsx):
- Added `editIdRef = useRef<number | null>(null)` and `formRef = useRef<ConversationForm>(emptyForm)`
- A no-dependency `useEffect` keeps both refs in sync after every committed render
- `onOpenChange` now reads `editIdRef.current` and `formRef.current` instead of closure variables
- Result: both symptoms resolved — amber badge appears immediately on close, card refreshes to show server content

---

## Edit Mode Draft UX — Full Behavior (for reference)

- Dialog footer: **"Cancel"** reverts form to server state + clears draft + closes. **"Done"** saves to server + clears draft + refreshes.
- Clicking **'x'** or Escape: saves `form` to `localStorage` as `draft_edit_conversation_${editId}`, updates `editDrafts` state, calls `onRefresh()`.
- `editDrafts: Set<number>` state syncs from localStorage on `conversations` prop change.
- Cards with a pending draft show amber border + "Resume Edit" pencil badge.
- Opening a card with a draft restores the draft into the form; `originalForm` stays as server version.

---

## Running Locally
```bash
npm start
```
- **Client**: http://localhost:5173
- **Server**: http://localhost:3001

**Important:** `server/.env` must have Turso credentials **commented out** for local development:
```
# TURSO_DATABASE_URL="libsql://..."
# TURSO_AUTH_TOKEN="..."
```
If these are uncommented, the app will try to connect to Turso cloud DB and hang indefinitely.

If Prisma errors: `cd server && npx prisma generate`

## Work for Next Session

In our next session I'd like to fix a bug we seem to have just created. When I finish logging a conversation and click "Done" in the log conversation modal, the "Resume Draft" button displays. It should not, since the conversation is done.

---

## Production Deployment

**Auto-deploys on push to main** — Vercel is connected to GitHub.

**Before pushing, always run:**
```bash
npm run prepush
```
This catches TypeScript errors and missing files before they break the Vercel build.

Then push:
```bash
git push
```

To set environment variables (use printf to avoid newlines):
```bash
printf 'value' | vercel env add VAR_NAME production
```

---

## Technical Notes

1. **Turso CLI on Windows requires WSL** — Use web dashboard instead
2. **@libsql/client versions** — Server: 0.5.6 (downgraded for Prisma adapter compatibility). Client: 0.17.0 (browser-direct via `/web` export)
3. **Vercel env vars** — Use `printf` not heredoc to avoid trailing newlines that break URLs/tokens
4. **build:vercel script** — Must install client and server dependencies before build
5. **Photos in production** — Only Vercel Blob URLs work; local `/photos/` paths are dev-only
6. **Overdue timezone** — Server accepts `today` query param from client to fix timezone issues
7. **Auto-save pattern** — `useAutoSave` hook in `client/src/hooks/use-auto-save.ts` handles debounced saves
8. **Contacts pagination** — Server returns `{ data: [...], pagination: { total, limit, offset, hasMore } }`
9. **Server-side filters** — `/contacts` accepts `ecosystem`, `status`, `flagged`, `search` query params
10. **Server-side sorting** — `/contacts` accepts `sortBy=lastOutreachDate` + `sortDir=asc|desc` for cross-page sort
11. **Duplicate detection** — Normalizes names (strips middle initials, suffixes) before Levenshtein; inverted-index candidate generation (name tokens + email); OR logic (similar name OR same email); slim DB query; merge dialog lazy-loads full details on demand
12. **Client timeout** — `TIMEOUT_MS = 30000` in `client/src/lib/api.ts`; Vercel `maxDuration: 30` in `vercel.json`
13. **Vercel 30s timeout** — Hobby plan max. Browser-direct Turso access bypasses this for backup/restore.
14. **Browser-direct Turso** — `@libsql/client/web` in client connects to Turso over HTTPS. The `/web` export auto-converts `libsql://` URLs to `https://`. Used for backup export and restore to avoid Vercel timeout.
15. **Backup security** — Turso auth token is exposed to browser via `/api/backup/credentials`. Acceptable for personal single-user app. Can create read-only token later for hardening.
16. **Express body limit** — Increased to 50MB (`express.json({ limit: '50mb' })` in `app.ts`) for backup import payloads.
17. **Backup date formats** — Turso returns dates as Unix ms timestamps, ISO strings, or raw SQLite strings. `toDate()` in `backup.ts` handles all three.
18. **Production backup workflow** — JSON downloads to browser; user manually copies to `SearchBook/backups/` (amber UI reminder). Save-local endpoint only works in local dev (Vercel has read-only filesystem).
19. **Turso schema migrations** — Prisma `db push` only works against local SQLite. For Turso production, run DDL directly: temporarily uncomment Turso creds in `server/.env`, use `node -e "require('dotenv').config(); const { createClient } = require('@libsql/client'); ..."` to execute CREATE TABLE statements, then re-comment creds.
20. **Multi-select actions** — Actions support 0-N contacts and companies via `ActionContact`/`ActionCompany` junction tables. Legacy single `contactId`/`companyId` fields preserved for backward compatibility. All views (form, detail, list) fall back to legacy fields when junction tables are empty.
21. **Company Activity Log** — `CompanyActivity` model for company-level action log. Types: APPLIED, EMAIL, CALL, MEETING, RESEARCH, FOLLOW_UP, OTHER. CRUD at `/api/company-activities`. Turso table created via direct libsql client.
22. **Edit mode drafts** — localStorage key: `draft_edit_conversation_${conversationId}`. New conversation drafts use `draft_conversation_${contactId}`. `editDrafts: Set<number>` state in `ConversationsTab` tracks which conversations have a pending edit draft; syncs from localStorage inside `useEffect([conversations])`. `editIdRef` and `formRef` refs prevent stale closures in `onOpenChange`.
23. **Radix UI onOpenChange** — fires for 'x' button and Escape key, but NOT for programmatic `setDialogOpen(false)`. This is critical for the edit draft save-on-close logic.
24. **Stale closure pattern** — When Radix UI (or any library) fires callbacks that need current React state, use `useRef` + a no-dep `useEffect` to sync refs after every render, then read from refs inside the callback. Never rely solely on closure-captured state in event handlers that Radix controls.
