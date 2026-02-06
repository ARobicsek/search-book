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

1. **In the search function, remove the link to the dashboard** — The command palette Navigate section shows "Dashboard" which is redundant
2. **Make sure in global search the lozenges are the correct colors** — Ecosystem and status badges should use the same colors as elsewhere in the app
3. **For company status, change the color of 'Active Target'** — Currently may share a color with another status; give it a unique color
4. **Add a company status called 'In Discussions'** — New status with a unique color not used by other statuses

---

## What Was Completed Last Session

### UI Fixes + Global Search Feature
1. **Fixed scroll arrows on contact card tab bar** — Removed `overflow-x-auto` from TabsList
2. **Mutual connections auto-create** — Contacts entered in "Mutual Connections" field now auto-create with status=CONNECTED if name doesn't exist
3. **Global Search feature:**
   - New `/api/search` endpoint — searches across contacts, companies, actions, ideas with related entities
   - New `/search` page — with expandable result cards showing relationships (companies, contacts, actions, ideas, conversations)
   - Enhanced command palette — live search results (debounced 300ms) as you type
   - Mobile search button — 44px touch target in header, opens command palette on tap

### How to use Global Search:
- **Desktop:** Press Ctrl+K or navigate to `/search`
- **Mobile:** Tap the search icon in the header
- Search returns contacts, companies, actions, and ideas
- Expand any result to see related entities (who they know, what actions exist, etc.)

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
