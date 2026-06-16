# Next Session Prompt

This file is the handoff document for the next AI session (Claude Code **or** Gemini/Antigravity — the
protocol is agent-agnostic). It summarizes what was just accomplished, what to work on next, and open items.

### What Was Just Completed (Session 11) — Meetings page polish

Owner-requested tweaks to the **Meetings** page (`client/src/pages/meetings.tsx`,
`server/src/routes/meetings.ts`). All typecheck + full client build pass; **server
behavior verified live** against the running dev API. Client UI compiled & HMR-live
but **not yet visually verified** (chrome-devtools MCP couldn't attach — a browser
held its automation profile). Owner should eyeball on localhost:5173 / prod.

1. **Search = the meeting's heading text.** The Meetings Search box matches
   `Conversation.title` (contains), and for **untitled** meetings also the name shown in
   its place (first participant → anchor contact → org → attendees text, per
   `conversationDisplayName`). Titled meetings match title only; notes/summary/tags stay
   out. Removed the JS relevance-rank path; search respects the chosen sort. Global
   `/api/search` unchanged. Verified live: a participant's name now returns their untitled
   meetings; a titled meeting still won't match on its people.
2. **Org filter widened.** Organization filter now also pulls meetings where the anchor
   contact / any participant **currently works** at that org (not just meetings with the
   org in the org field). New `meetingOrgClauses()` in `meetings.ts`; reuses
   `currentEmployerCompanyIds`. Verified: `companyId=4` now includes a meeting matched
   only via a current employee. Fast at single-user scale (owner's 20s ceiling not a risk).
3. **Filter row reordered.** Search is now top-left (most-used); Type is bottom-left
   (least-used). Order: Search, Series, Organization / Type, Tag, Date range.
4. **Collapsible meeting cards.** Cards clamp to ~2in (`COLLAPSED_MAX_PX = 168`) with a
   fade + "Show more"/"Show less"; clicking a clamped card expands it (inner links/buttons
   excluded). `MeetingCard` extracted; overflow measured via `ResizeObserver`. **This is
   the one change to eyeball** (runtime measurement / click-to-expand).
5. **"Recently updated" — merge bug found & fixed.** Root cause of old meetings jumping to
   the top: **merging duplicate contacts** re-linked their meetings via
   `conversation.updateMany`, and Prisma `@updatedAt` bumped `updatedAt` to now. Fixed in
   `duplicates.ts` — re-link via raw SQL so a merge isn't an "edit". Forward-only: meetings
   a *past* merge already bumped stay bumped (can't safely distinguish from real edits).
   (Ruled out: status-sweep scripts, editing a contact card — neither writes conversations.)

### What Was Completed (Session 10)

**Undo last delete — shipped & owner-verified on prod.** Plan: `.planning/UNDO-DELETE-PLAN.md`.
- Server-side **snapshot-and-replay**: new `DeletedSnapshot` table; each delete first captures
  everything it will destroy/mutate (recursive cascade rows, SetNull'd FKs, company JSON-array
  scrubs) atomically with the delete. Engine in `server/src/lib/undo.ts`; `GET/POST /api/undo`.
  Wired into all 14 top-level delete routes.
- **Persistent** client command: header **Undo** button + **Cmd/Ctrl+Z** (suppressed while
  typing), backed by the server so it survives navigation/reload (`client/src/components/undo-provider.tsx`).
  After undo, the routed content area remounts (key on `<main>` in `layout.tsx`) so the restored
  item reappears without a manual refresh.
- Attachment deletes no longer destroy the Vercel Blob (so they're restorable); backup wipe clears
  `DeletedSnapshot`. `DeletedSnapshot` table was created on Turso (owner ran the DDL).
- Owner tested contacts, meetings, actions, organizations, ideas — all restore correctly.

### Earlier (Session 8 / 9)

1. **LinkedIn Import Company Status Bugfix:** Modified `client/src/pages/contacts/contact-form.tsx` so that when a LinkedIn import creates a new company, it checks if the contact is currently working there (`isCurrent: true`) AND if the contact being imported is set to `CONNECTED`. If both are true, the new company's status defaults to `CONNECTED`; otherwise, it defaults to `NONE`. This fixes the bug where all newly imported companies defaulted to `RESEARCHING`.
2. **Organization Contacts Inline Edit:** Made the ecosystem and status badges for contacts listed on an Organization's detail page (`company-detail.tsx`) interactive, allowing inline updates via dropdowns without leaving the page.
3. **Company Status Sweep Safety:** Updated `server/scripts/sweep-company-status.js` to strictly convert `NONE` (blank) statuses to `CONNECTED` when an employed contact is connected, protecting other existing statuses (like `RESEARCHING` or `ENGAGED`) from being accidentally wiped out.

### Previous Session (Session 7)
1. **Company Status Sweep:** Created and executed a one-off script (`server/scripts/sweep-company-status.js`) to evaluate and update the Status of all Organizations. 
2. **Contact Cleanup:** Created and executed a one-off script (`server/scripts/delete-researching-recruiters.js`) that deletes all Contacts where Ecosystem = 'RECRUITER' AND Status is 'RESEARCHING' or 'NONE' (blank).

### What's Next
1. **[OWNER, light]** Run the organization status sweep script against the production Turso DB (requires exporting `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in the environment, then running `node scripts/sweep-company-status.js` from the `server` directory).
2. **[OWNER, light]** Confirm on prod that series create/join + the new sort/search behave as expected.
3. Plan of record returns to **`.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+)**, gated on D5–D9 — don't push on
   those until the owner raises them.

### Carry-over items (pre-dating, lower priority)
1. **[USER ACTION]** Set `SENTRY_DSN` / `VITE_SENTRY_DSN` in Vercel (hardening Task 17).
2. NCQA adaptation plan: Phase 3 (blocked D8/D9) / Phase 4 (D5/D6).
3. Stray empty `server/dev.db` / `server/test.db` (gitignored) safe to delete.
4. **Possible polish (owner hasn't requested):** `Conversation.updatedAt` only bumps on edits to the meeting row
   itself, not on isolated child-record edits (prep note / attachment). If "Recently updated" should float a
   meeting on those too, bump `conversation.updatedAt` in the `conversation-prepnotes` / `conversation-attachments`
   routes. Also: existing meetings' participant order was backfilled by rowid (insertion proxy) — re-saving a
   meeting's participants fixes any that look wrong.

### Open Bugs / Known Caveats
- **⚠ The committed Turso rw token in `server/.env` is STALE (hard 401).** Use the Turso web SQL console for DDL.
- **⚠ `prisma db push` local-path gotcha:** from `server/`, `db push` resolves `file:./dev.db` to the stray
  empty `server/dev.db`, not the populated `server/prisma/dev.db` the server opens. Use the dual-mode migration
  scripts (libsql `file:` URL) instead — they target `./prisma/dev.db` and work with the dev server running.
- Run `tsc -b` / full `vite build` (not just `npm run prepush`) before every push — it catches unused imports.
- Dev smoke: server 3001, client 5173. The local app has `APP_PASSWORD` unset → seed any non-empty
  `localStorage.searchbook_password` ('devlocal' works) to pass the login gate; the server middleware no-ops.
  Device-emulation `390x844` gives a true mobile viewport.

### Working branch
`main` — pushed and live.

---

### Suggested kickoff prompt for the next session

> Read `CLAUDE.md` / `AGENTS.md`, then this file. Last session polished the Meetings page (title-only search, widened org filter, reordered filters, collapsible cards). If the owner confirms those, plan of record returns to `.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+, gated D5–D9).
