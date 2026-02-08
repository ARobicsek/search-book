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

No specific bugs queued. Possible directions:
- **Phase 8: Document Search** — Full-text search across linked Google Drive documents (see ROADMAP.md)
- **User-reported issues** — Test the app and report any bugs or feature requests

---

## What Was Completed Last Session

### Last Outreach Column Fix
The "Last Outreach" column showed "—" for all contacts on the default page. Root cause: bulk-imported contacts (no conversations) sorted first by `updatedAt desc`, so the first 2 pages had zero outreach data. The API was returning correct data — it was just on later pages.

**Fix:** Added server-side sorting by `lastOutreachDate`. Clicking the column header now sorts across ALL contacts (server fetches all, computes dates from Conversation table, sorts with nulls last, then paginates).

### Smarter Duplicate Detection
"Katie Tucker" vs "Katie M. Tucker" wasn't flagged (Levenshtein similarity = 0.80, threshold was strict >0.8).

**Fix:** Added `normalizeName()` that strips middle initials and suffixes (J.D., Jr., PhD, etc.) before comparison. Also added compound signal: same company + name similarity >0.6 flags as duplicate.

### Links in Contact Edit Form
Links were only manageable on the detail page, not in the edit form.

**Fix:** Added a Links card to contact-form.tsx. Edit mode loads/adds/deletes via API. Create mode stores pending links locally and saves after contact creation.

### CSV Export Includes Links
Export now fetches all links, groups by contactId, and adds a "Links" column with pipe-separated entries.

### Technical changes:
- `server/src/routes/contacts.ts` — Added `sortBy`, `sortDir` query params; server-side lastOutreachDate sorting
- `server/src/routes/duplicates.ts` — Added `normalizeName()`, normalized comparison, same-company signal
- `client/src/pages/contacts/contact-list.tsx` — Passes sortBy/sortDir for lastOutreachDate; async CSV export with links
- `client/src/pages/contacts/contact-form.tsx` — Links card with add/remove, pending links for create mode

---

## What Was Completed Previous Session

### Contacts List Performance + Pagination
After importing ~100 contacts, the contacts page was timing out. Fixed with:

1. **Pagination** — Contacts list now loads 50 contacts per page with Previous/Next navigation
2. **Server-side filtering** — Ecosystem, Status, Flagged, and Search filters now applied server-side
3. **Lightweight `/contacts/names` endpoint** — Returns just id/name for comboboxes
4. **Debounced search** — 300ms debounce to reduce API calls while typing

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
11. **Duplicate detection** — Normalizes names (strips middle initials, suffixes) before Levenshtein; also flags same-company + moderate name similarity
