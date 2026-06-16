# Next Session Prompt

This file is the handoff document for the next AI session (Claude Code **or** Gemini/Antigravity — the
protocol is agent-agnostic). It summarizes what was just accomplished, what to work on next, and open items.

### What Was Just Completed (Session 8 / 9)

1. **LinkedIn Import Company Status Bugfix:** Modified `client/src/pages/contacts/contact-form.tsx` so that when a LinkedIn import creates a new company, it checks if the contact is currently working there (`isCurrent: true`) AND if the contact being imported is set to `CONNECTED`. If both are true, the new company's status defaults to `CONNECTED`; otherwise, it defaults to `NONE`. This fixes the bug where all newly imported companies defaulted to `RESEARCHING`.
2. **Organization Contacts Inline Edit:** Made the ecosystem and status badges for contacts listed on an Organization's detail page (`company-detail.tsx`) interactive, allowing inline updates via dropdowns without leaving the page.
3. **Company Status Sweep Safety:** Updated `server/scripts/sweep-company-status.js` to strictly convert `NONE` (blank) statuses to `CONNECTED` when an employed contact is connected, protecting other existing statuses (like `RESEARCHING` or `ENGAGED`) from being accidentally wiped out.

### Previous Session (Session 7)
1. **Company Status Sweep:** Created and executed a one-off script (`server/scripts/sweep-company-status.js`) to evaluate and update the Status of all Organizations. 
2. **Contact Cleanup:** Created and executed a one-off script (`server/scripts/delete-researching-recruiters.js`) that deletes all Contacts where Ecosystem = 'RECRUITER' AND Status is 'RESEARCHING' or 'NONE' (blank).

### What's Next
0. **[OWNER, REQUIRED before pushing] Undo-last-delete feature is code-complete + locally
   verified but UNPUSHED.** Plan: `.planning/UNDO-DELETE-PLAN.md`. It adds a `DeletedSnapshot`
   table — **pushing before the table exists on Turso will 500 every delete in production.**
   Deploy order: (a) run `CREATE TABLE DeletedSnapshot` on Turso via the web SQL console — DDL
   is in `server/scripts/migrate-deleted-snapshot.js`; (b) `git push`. Then browser-test the
   header **Undo** button + `Cmd/Ctrl+Z` (desktop + mobile 390px).
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

> Read `CLAUDE.md` / `AGENTS.md`, then this file. The LinkedIn import company status bug was fixed. Plan of record returns to `.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+, gated D5–D9).
