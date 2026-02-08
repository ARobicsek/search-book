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

(Add tasks here)

---

## What Was Completed Last Session

### Ctrl-K Command Palette Simplified
Removed Quick Add, Navigate, Contacts, Companies sections from command palette initial view. Only Global Search remains when Ctrl-K/mobile search button is opened. Live search results still appear when typing.

### Manual Merge Feature
Added Combobox-based contact picker on duplicates page. Users can select any two contacts and merge them with field-by-field selection dialog (useful for non-obvious duplicates like "Dick Jones" vs "Richard Jones III").

### "Keep Both" for Phone Numbers
Merge dialog now supports "Keep Both" for phone numbers (in addition to emails). Server combines phone numbers with " | " separator.

### Duplicate Detection Performance Fix (Vercel Timeout)
The duplicates page was timing out on Vercel's 30s limit. Multiple iterations:
1. Pre-computed normalized names/tokens before comparison loop
2. Rewrote algorithm with inverted-index candidate generation (name tokens + email) instead of O(n^2)
3. Removed company/LinkedIn matching indexes to reduce candidate pairs
4. Slimmed DB query to only `id`, `name`, `email`, `title`, `company` (was fetching all fields)
5. Increased client-side fetch timeout from 15s to 30s

### Lazy-Load Merge Details
Both auto-detected and manual merge buttons now fetch full contact details on demand via `/contacts/:id` before opening the merge dialog. This decouples the list response (slim) from the merge dialog (full), reducing payload size.

### Technical changes:
- `server/src/routes/duplicates.ts` — Slim DB query, inverted-index candidate generation (name tokens + email only), OR logic (similar name OR same email)
- `client/src/pages/duplicates.tsx` — Split into `DuplicateContactSummary` (list) and `DuplicateContact` (merge dialog) types; async `openMergeDialog` with lazy-load; manual merge UI with Comboboxes; "Keep Both" for phone
- `client/src/components/command-palette.tsx` — Stripped to Global Search only
- `client/src/lib/api.ts` — Timeout increased from 15s to 30s

---

## What Was Completed Previous Session

### Last Outreach Column Fix
Added server-side `sortBy=lastOutreachDate` + `sortDir` params so clicking the column header sorts across ALL contacts (not just current page).

### Links in Contact Edit Form
Added a Links card to contact-form.tsx with inline add/remove. Edit mode loads via API; create mode stores pending links locally.

### CSV Export Includes Links
Export fetches all links, groups by contactId, adds "Links" column with pipe-separated entries.

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
