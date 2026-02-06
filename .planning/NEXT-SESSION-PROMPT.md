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

## Next Session Task: iPhone UI Review

**Goal:** Extensively browse the production site in iPhone dimensions and identify ways to improve the mobile UI.

Please:
1. Review each page/feature in mobile viewport (375px width)
2. Identify UI issues: touch targets too small, text overflow, spacing problems, unusable controls
3. Create a prioritized list of mobile UX improvements
4. Implement the fixes

Key pages to review:
- Dashboard
- Contacts list and detail
- Companies list and detail
- Actions list and detail/form
- Calendar
- Ideas
- Search/filters
- Command palette
- All dialogs/modals

---

## What Was Completed Last Session

### Bug Fixes
1. **Overdue timezone fix** — Dashboard now passes client's local date to server, so overdue actions are calculated in user's timezone (not server UTC)
2. **Photos in production** — Explained that local `/photos/` paths don't work in production; users need to re-upload photos via production site to use Vercel Blob

### Previous Session Fixes (still deployed)
- Date precision display (MONTH → "January 2026", YEAR → "2026")
- Prep notes yellow background in conversation dialog
- SPA routing fix (no more 404 on hard refresh)
- Document links for Actions
- Links card for Companies
- Default sort by updatedAt

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
```bash
cd "c:\Users\ariro\OneDrive\Documents\Job research\SearchBook"
vercel --prod
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
