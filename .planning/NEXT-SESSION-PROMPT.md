I'm building **SearchBook**, a lightweight local CRM for managing my executive job search networking.

**Before doing anything, read these files:**
- `.planning/STATE.md` — Session history and decisions
- `.planning/ROADMAP.md` — All phases and acceptance criteria

**GSD methodology.** Atomic commits per task.

---

## What Was Completed Last Session

### Bug Fixes

1. **Bug: Actions not saved in Log Conversation edit mode** — "Done" button was calling `setDialogOpen(false)` directly, bypassing `handleSubmit()`. Fixed by wiring Done to `handleSubmit()`. Server `PUT /api/conversations/:id` already supported `createActions[]`.

2. **Bug: Stale UI after clicking Done in edit mode** — Same root cause as above. `handleSubmit()` now calls `onRefresh()` after a successful PUT, which re-fetches from the server and updates conversation cards. Added `autoSave.cancel()` at the top of `handleSubmit()` to stop any in-flight debounce before the final PUT fires.

3. **Bug: Mobile search showing irrelevant results (stale API responses)** — Slow mobile typing triggered multiple debounced fetches ("V", "Vi", "Vig"). The response for "V" (many results) could arrive after the "Vig" response, overwriting it. Fixed with a `currentSearchRef` in `search.tsx`: responses whose query string doesn't match the current ref are silently discarded.

4. **Bonus fix: Due dates missing from conversation action cards** — Added `dueDate: true` to `conversationIncludes.actions` select in `server/src/routes/conversations.ts`.

### Partially Implemented: Edit Mode Draft / Resume Edit UX

- Dialog footer changed from "Revert + Done" to **"Cancel + Done"**
  - Cancel: clears localStorage draft, reverts form to `originalForm`, closes dialog
  - Done: calls `handleSubmit()` → saves to server → clears draft → calls `onRefresh()`
- Clicking **'x'** (or Escape) to close the dialog now:
  - Calls `autoSave.cancel()` to stop any pending debounce
  - Saves current `form` state to `localStorage` under key `draft_edit_conversation_${editId}`
  - Adds `editId` to `editDrafts` state (a `Set<number>`)
  - Calls `onRefresh()` to refresh the conversations list
- `editDrafts` is a `useState<Set<number>>` that syncs from localStorage via `useEffect([conversations])`
- Conversation cards with a pending draft show an amber border and a "Resume Edit" badge with a pencil icon
- Opening a conversation card that has a draft restores the draft into the form; `originalForm` stays as the server version (for auto-save diffing)

---

## REMAINING BUG — Work for Next Session

### Symptom
After clicking **'x'** to close the edit conversation dialog:
1. The conversation card does **not** show the auto-saved (latest) content
2. The amber **"Resume Edit"** indicator does **not** appear on the card

### Expected behavior
- The card should immediately show whatever was auto-saved (the PUT already happened via `useAutoSave`)
- The card should have an amber border and "Resume Edit" label

### What was tried
- Added `onRefresh()` call inside `Dialog onOpenChange` handler (when `!open && editId !== null`)
- Added `setEditDrafts((prev) => new Set([...prev, editId]))` inside the same handler
- The `useEffect([conversations])` that reads localStorage and populates `editDrafts` depends on the `conversations` prop changing — `onRefresh()` should trigger this

### Hypothesis / Possible Root Causes
1. **Closure staleness in `onOpenChange`**: The `onOpenChange` callback may be capturing a stale `editId` or `form` snapshot from when the dialog first opened. By the time 'x' is clicked, `editId` could be the current value but `form` might be from an earlier render.
2. **`onRefresh()` timing**: `onRefresh()` initiates an async fetch; the result won't arrive synchronously, so `conversations` prop may not update before the component re-renders for the closed state.
3. **`useEffect([conversations])` not running when expected**: If React batches the `setDialogOpen(false)` + the `onRefresh()` state update, the effect may not re-run as expected.
4. **`editDrafts` state update lost**: The `setEditDrafts` call inside `onOpenChange` may be overridden by the subsequent `useEffect([conversations])` if it runs before `onRefresh()` completes (it would see localStorage correctly, but the draft key has just been written — should be fine).
5. **The `onOpenChange` is not firing**: Verify it's actually being called by adding a `console.log` — Radix UI's `onOpenChange` fires for 'x' and Escape but NOT for programmatic `setDialogOpen(false)`.

### Files to Inspect
- [client/src/pages/contacts/contact-detail.tsx](client/src/pages/contacts/contact-detail.tsx) — `ConversationsTab` component; look at `onOpenChange`, `openEdit`, `handleSubmit`, `editDrafts` state and its `useEffect`
- [client/src/hooks/use-auto-save.ts](client/src/hooks/use-auto-save.ts) — `cancel()` method and `useAutoSave` hook

### Suggested Debug Approach
1. Add `console.log` inside `onOpenChange` to confirm it fires and check the values of `editId`, `form`, and `open`
2. Add `console.log` inside the `useEffect([conversations])` to confirm it re-runs after `onRefresh()` completes
3. Add `console.log` inside the `openEdit` function to confirm draft is being read from localStorage when card is tapped
4. Check whether `onRefresh()` actually changes the `conversations` reference (it should, since it's a new array from the server)

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
22. **Edit mode drafts** — localStorage key: `draft_edit_conversation_${conversationId}`. New conversation drafts use `draft_conversation_${contactId}`. `editDrafts: Set<number>` state in `ConversationsTab` tracks which conversations have a pending edit draft; syncs from localStorage inside `useEffect([conversations])`.
23. **Radix UI onOpenChange** — fires for 'x' button and Escape key, but NOT for programmatic `setDialogOpen(false)`. This is critical for the edit draft save-on-close logic.
