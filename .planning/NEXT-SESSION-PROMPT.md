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

1. **Fix Last Outreach column** — Column shows "—" for all contacts even those with conversations. The server code looks correct (queries `Conversation` table by `contactId`), but data isn't displaying. Debug why.
2. **Phase 8: Document Search** — Begin Google Drive document search integration (see ROADMAP.md)

---

## What Was Completed Last Session

### Contacts List Performance + Pagination
After importing ~100 contacts, the contacts page was timing out. Fixed with:

1. **Pagination** — Contacts list now loads 50 contacts per page with Previous/Next navigation
2. **Server-side filtering** — Ecosystem, Status, Flagged, and Search filters now applied server-side (so they filter all 171 contacts, not just current page)
3. **Lightweight `/contacts/names` endpoint** — Returns just id/name for comboboxes (fast)
4. **Debounced search** — 300ms debounce to reduce API calls while typing

### Technical changes:
- `server/src/routes/contacts.ts` — Added pagination (`limit`, `offset`), server-side filters (`ecosystem`, `status`, `flagged`, `search`), and `/names` endpoint
- `client/src/pages/contacts/contact-list.tsx` — Pagination UI, server-side filter params, debounced search
- Other client files updated to use `/contacts/names` endpoint for comboboxes

### Bug to fix next session:
The `lastOutreachDate` query was fixed to use `Conversation.contactId` (not `ConversationContact` junction table), but the column still shows "—". Server logs show conversations exist. Need to debug.

---

## What Was Completed Previous Session

### Auto-save Extensions + Merge Enhancements
1. **Auto-save for Ideas form** — Edit mode auto-saves after 1.5s debounce
2. **Auto-save for Conversation dialog** — Edit mode auto-saves after 2s debounce
3. **Enhanced duplicate merge** — All fields + "Keep Both" option for emails

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
