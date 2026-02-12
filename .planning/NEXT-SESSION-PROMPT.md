I'm building **SearchBook**, a lightweight local CRM for managing my executive job search networking.

**Before doing anything, read these files:**
- `.planning/STATE.md` — Session history and decisions
- `.planning/ROADMAP.md` — All phases and acceptance criteria

**GSD methodology.** Atomic commits per task.

---

## Phase 7: iPhone PWA Access — COMPLETE

**App is live:** https://searchbook-three.vercel.app

### Deployment details:
- **Database:** Turso cloud (libsql://searchbook-arobicsek.aws-us-east-2.turso.io)
- **Photo storage:** Vercel Blob (configured)
- **Environment variables:** Set in Vercel dashboard

---

## Next Session Tasks

- **Verify Deployment Error** — User reported a `vercel build` error after the "Fix New Company Creation" push. Need to verify if the build failed and fix if necessary.
- **Verify New Company Creation Fix** — Once deployed, confirm that adding a NEW company (not in list) to a contact works and doesn't disappear (fix involved omitting partial auto-save).
- **Fix "People Discussed" Bug** — User reported that adding a new name in "People Discussed" (Conversation Log) does NOT auto-create a contact. Needs investigation (likely `MultiCombobox` sending name string vs API expecting `contactId` array).
- **Schema migrations** — If adding new tables, remember to run DDL against Turso directly (see Technical Notes #19).

---

## What Was Completed This Session

### Bug Fixes (3 items)

1. **Fixed Single Past Company Bug** — Resolved issue where a contact's only company was treated as "Current" even if marked "Past". Server logic updated (`server/src/routes/contacts.ts`) to correctly unset `companyId` if all entries are past.

2. **Fixed Multiple Past Companies Bug** — Resolved race condition in `contact-form.tsx` where `autoSave` (triggered by typing) would overwrite the `handleSubmit` payload, causing multiple past companies to be lost.

3. **Fixed New Company Creation Bug** — Preventing "disappearing company" issue by modifying `autoSave` to **omit** the company list payload if it detects any new (unsaved) companies. This prevents specific partial data from overwriting the server state.

---

## What Was Completed Last Session

### User Feedback Features (2 items)

1. **Quick Status/Ecosystem Changes** — Implemented inline editing for Status and Ecosystem in Contact/Company lists, and interactive dropdown badges in detail headers.

2. **Add Action Enhancements** — "New Action" form now supports auto-creation of Contacts and Companies. Users can type a new name and select "Add [Name]" to create the entity on the fly.

### Build Fix
- Fixed navigation bug where clicking status/ecosystem dropdowns in list view triggered row navigation.

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
