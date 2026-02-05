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

## Phase 7: iPhone PWA Access — IN PROGRESS

### What's ready:
- **Vercel configuration** — `vercel.json` with single serverless function
- **Express refactored** — `app.ts` (exportable) + `index.ts` (local server)
- **iOS PWA meta tags** — Added to `client/index.html`
- **Turso adapter** — Prisma configured for Turso (production) / SQLite (local)
- **Vercel Blob** — `upload.ts` uses `@vercel/blob` when `BLOB_READ_WRITE_TOKEN` is set
- **Company current/past** — "Past" checkbox in form, header shows only current, search includes all

### Remaining deployment steps:

#### 1. Create Turso Database
```bash
npm install -g turso
turso auth login
turso db create searchbook
turso db show searchbook --url
turso db tokens create searchbook
```

#### 2. Export & Import Data
```bash
cd server
sqlite3 dev.db ".dump" > data_export.sql
turso db shell searchbook < data_export.sql
```

#### 3. Deploy to Vercel
```bash
npm install -g vercel
vercel
```

Set environment variables in Vercel dashboard:
- `TURSO_DATABASE_URL` — libsql:// URL
- `TURSO_AUTH_TOKEN` — auth token

Enable Blob Storage:
- Storage → Create Store → Blob → Connect to project

#### 4. Test on iPhone
- Open deployment URL in Safari
- Share → Add to Home Screen
- Verify standalone mode
- Test contacts, actions, conversations, photo uploads

#### 5. Re-upload Photos
Photos in `server/data/photos/` won't transfer — re-upload through app after deployment.

---

## Running Locally
```bash
npm start
```
- **Client**: http://localhost:5173
- **Server**: http://localhost:3001

If Prisma errors: `cd server && npx prisma generate`

---

## Recent Changes (this session)
- Added Vercel Blob support for photo uploads in production
- Company current/past indicator with "Past" checkbox
- Past companies shown with "formerly" styling in contact detail
- Search includes past company names
- Fixed trash icon overflow in company list

---

**Goal: Deploy to Vercel and test the PWA on web/mobile.**
