# SearchBook — Next Session Starting Prompt

Copy and paste everything below the line into Claude Code to start the next session.

---

## Prompt

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

**Backup is fully working.** Both bugs are fixed. Ready for Phase 8 or user feedback items.

Possible next directions:
- **Phase 8: Document Search** — Full-text search across linked Google Drive documents (see ROADMAP.md)
- **User feedback** — Any new items from testing
- **Push to deploy** — Run `npm run prepush && git push` to deploy the backup fixes + save reminder UI to production

---

## What Was Completed This Session

### Backup Bug Fixes
1. **Date parsing fixed** — `transformRecords()` in `server/src/routes/backup.ts` now handles all three Turso date formats via `toDate()` helper: Unix millisecond timestamps (`1770157191736`), ISO strings with timezone (`"2026-02-06T16:18:17.954+00:00"`), and raw SQLite strings (`"2026-02-08 15:39:27"`). Local restore from production backup works.
2. **Save-local path fixed** — Robust project root detection tries three candidate paths (`__dirname`-based, `process.cwd()`, parent of cwd) and verifies each contains `server/` + `client/` subdirectories.
3. **Backups folder** — Created `backups/` directory with `.gitkeep` (contents gitignored via `backups/*` + `!backups/.gitkeep`).
4. **Save reminder UI** — Amber banner on Settings page after backup download reminds user to copy JSON from Downloads into `SearchBook/backups/`.

### Backup Architecture (completed last session):
- `GET /api/backup/credentials` — returns Turso URL + auth token (404 in local dev)
- `client/src/lib/backup.ts` — `exportViaTurso()` and `importViaTurso()` using `@libsql/client/web`
- `client/src/pages/settings.tsx` — tries browser-direct first, falls back to server-side Prisma
- `POST /api/backup/import` — server-side restore for local dev (uses `transformRecords()` for type conversion)
- `POST /api/backup/save-local` — writes backup JSON to project `backups/` folder (local dev only)

### Flow:
- **Production export:** Browser → Turso directly (no Vercel timeout) → JSON download + amber reminder to copy to backups/
- **Production restore:** Browser → Turso directly (import via batch INSERTs)
- **Local dev export:** Server Prisma `findMany` fallback → JSON download + auto-save to backups/
- **Local dev restore:** Server Prisma `createMany` fallback (working)

---

## What Was Completed Last Session

### Browser-Direct Turso Backup
Implemented `@libsql/client/web` in the browser to query Turso directly, bypassing Vercel's 30-second timeout.

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
