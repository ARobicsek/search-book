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

**Data backup — start from scratch.** The core question: how do I make sure I have a backup of the precious data in SearchBook in some place that I have full control over?

### Context from failed attempts this session:
- The Vercel serverless function has a **30-second timeout** (hobby plan max). Every server-side approach timed out:
  1. Single endpoint with `$queryRawUnsafe` on `sqlite_master` + all table SELECTs — timed out
  2. Parallel `Promise.all` on the same — timed out
  3. Split into per-table endpoints (`/schema` + `/data/:tableName`) with client fetching one by one — timed out
  4. Single endpoint with `prisma.*.findMany()` for all 16 models via `Promise.all` — timed out
- The Turso/Prisma adapter appears to have significant overhead per query in Vercel's serverless environment (cold starts, connection setup, etc.)
- **Current state of code:** The `/api/backup/export` endpoint exists (Prisma findMany approach) but doesn't complete within 30s on Vercel

### Possible directions to explore:
- **Turso's own backup/export tools** — Does Turso have a dump or export API?
- **Direct libsql client** (bypass Prisma) — Might be faster than Prisma adapter
- **Turso HTTP API** — Could call Turso directly from the client browser (no Vercel middleman)
- **Scheduled export via GitHub Actions or external cron** — Not bound by Vercel's 30s limit
- **Smaller incremental approach** — Export one table at a time from the client with separate button clicks or auto-periodic fetches

---

## What Was Completed This Session

### Backup Feature (Partial — Not Working in Production)
Attempted to implement "Create Backup" for the web version. Multiple approaches tried (see above), all timing out on Vercel's 30s serverless limit. The backup works conceptually but Turso queries via Prisma are too slow in the Vercel serverless environment.

### Technical changes (current state):
- `server/src/routes/backup.ts` — Has `/export` endpoint using `prisma.*.findMany()` for all 16 models (times out on Vercel)
- `client/src/pages/settings.tsx` — Downloads JSON from `/backup/export`, triggers browser file download

---

## What Was Completed Last Session

### Ctrl-K Command Palette Simplified
Removed Quick Add, Navigate, Contacts, Companies sections from command palette initial view. Only Global Search remains when Ctrl-K/mobile search button is opened. Live search results still appear when typing.

### Manual Merge Feature
Added Combobox-based contact picker on duplicates page. Users can select any two contacts and merge them with field-by-field selection dialog (useful for non-obvious duplicates like "Dick Jones" vs "Richard Jones III").

### "Keep Both" for Phone Numbers
Merge dialog now supports "Keep Both" for phone numbers (in addition to emails). Server combines phone numbers with " | " separator.

### Duplicate Detection Performance Fix (Vercel Timeout)
The duplicates page was timing out on Vercel's 30s limit. Fixed with inverted-index candidate generation and slimmed DB queries.

### Lazy-Load Merge Details
Both auto-detected and manual merge buttons now fetch full contact details on demand via `/contacts/:id` before opening the merge dialog.

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
2. **@libsql/client version** — Downgraded to 0.5.6 to avoid "migration jobs" 400 errors
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
13. **Vercel 30s timeout** — Hobby plan max. Bulk Turso queries via Prisma adapter are too slow for this limit. Any backup/export solution must account for this constraint.
