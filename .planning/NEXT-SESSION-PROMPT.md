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

1. **Extend auto-save to Ideas** — Apply the same auto-save pattern (useAutoSave hook, SaveStatus indicator) to the Ideas form in edit mode.
2. **Extend auto-save to Conversation logging** — Apply auto-save to the conversation dialog when editing existing conversations.
3. **Review auto-save UX** — Test the current implementation and refine debounce timing or UI feedback if needed.

---

## What Was Completed Last Session

### Duplicate Merge Enhancement + Auto-save
1. **Enhanced duplicate merge with field selection:**
   - Modified `/api/duplicates/merge` endpoint to accept `fieldSelections` parameter
   - New merge dialog UI with side-by-side field comparison and radio buttons
   - Users can pick values from either contact for each field (name, email, title, etc.)
   - Related data (conversations, actions, relationships) still auto-combines
2. **Auto-save on all edit forms:**
   - Created `useAutoSave` hook with 1.5s debounce (`client/src/hooks/use-auto-save.ts`)
   - Created `SaveStatus` indicator component (`client/src/components/save-status.tsx`)
   - Updated Company form with auto-save in edit mode
   - Updated Contact form with auto-save in edit mode
   - Updated Action form with auto-save in edit mode
   - Edit mode shows "Saving..." / "Saved ✓" indicator and "Revert" button
   - Create mode still uses explicit Save button

---

## What Was Completed Previous Session

### Contact Statuses + CSV Import Enhancements
1. **Add actions when editing conversations** — Removed create-only restriction; can now add follow-up actions when editing a conversation
2. **Updated contact statuses** — Renamed "Warm Lead" → "Lead to Pursue", added "Researching" status
3. **Distinct status lozenge colors:**
   - Contacts: NEW (slate), RESEARCHING (blue), CONNECTED (green), AWAITING_RESPONSE (yellow), FOLLOW_UP_NEEDED (orange), LEAD_TO_PURSUE (pink), ON_HOLD (gray), CLOSED (red)
   - Companies: RESEARCHING (sky), ACTIVE_TARGET (indigo), IN_DISCUSSIONS (violet), CONNECTED (emerald), ON_HOLD (gray), CLOSED (red)
4. **Links in Contact profiles** — Links card added to Overview tab with add/delete functionality
5. **Enhanced CSV import:**
   - Supports separate First Name / Last Name columns (auto-combines)
   - Auto-creates companies when importing contacts with company names
   - Creates links from "Link" column in CSV
   - Improved header aliases: recognizes "LinkedIn Profile", "Mobile", "City", "First Name", "Last Name", etc.
   - Combines phone + mobile fields

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
7. **Auto-save pattern** — `useAutoSave` hook in `client/src/hooks/use-auto-save.ts` handles debounced saves; use with `SaveStatusIndicator` component
