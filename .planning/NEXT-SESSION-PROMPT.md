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

## Next Session: Phase 8 — Google Drive Document Search

**Goal:** Enable full-text search across Google Drive documents linked to contacts/companies/actions.

Refer to `.planning/ROADMAP.md` for Phase 8 acceptance criteria.

Potential approach:
1. OAuth2 integration with Google Drive API
2. Index content of linked documents (Google Docs, PDFs)
3. Full-text search across document content
4. Surface search results in global search / command palette

---

## What Was Completed Last Session

### PWA Icon + Calendar Fix
1. **Installed @fullcalendar/list** — Fixes calendar build error; mobile calendar now uses list view
2. **PWA icons** — Used existing Windows 95 pixel-art "S" scroll icon (`SearchBook icon.png`) for:
   - pwa-192x192.png
   - pwa-512x512.png
   - apple-touch-icon.png
3. **Browser favicon** — Changed from SVG to PNG for consistent branding

### Previous Session (Mobile UI)
- Dashboard ActionRow with 44px touch targets
- Column visibility on mobile (hide non-essential columns)
- Responsive headers, filter bars, forms
- Calendar mobile list view

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
