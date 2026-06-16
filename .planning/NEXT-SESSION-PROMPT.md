# Next Session Prompt

This file is the handoff document for the next AI session (Claude Code **or** Gemini/Antigravity — the
protocol is agent-agnostic). It summarizes what was just accomplished, what to work on next, and open items.

### What Was Just Completed (Session 7)

1. **Company Status Sweep:** Created and executed a one-off script (`server/scripts/sweep-company-status.js`) to evaluate and update the Status of all Organizations. The rule applied: if a Company is already 'CONNECTED' OR if there is a 'CONNECTED' Contact currently working there (via `companyId` or `additionalCompanyIds` with `isCurrent: true`), the Company becomes 'CONNECTED'; otherwise it becomes 'NONE' (blank/dash). This was run successfully against the local SQLite db (updated 370 companies). **To run it on production**, the owner needs to execute it with their fresh Turso credentials.
2. **Contact Cleanup:** Created and executed a one-off script (`server/scripts/delete-researching-recruiters.js`) that deletes all Contacts where Ecosystem = 'RECRUITER' AND Status is 'RESEARCHING' or 'NONE' (blank). This was run successfully against the local SQLite db (deleted 107 contacts). **To run it on production**, the owner needs to execute it with their fresh Turso credentials.

### Previous Session (Session 6)
- **LinkedIn Import Bugfix**
- **Sidebar Reordering**
- **Global Column Sorting**
- **Contact Edit Form Layout**
- **Card title + participant order + search**
- **Quick Log redesign ("promote the big 3")**
- **Series rename/delete**

**Verification:** `npm run prepush` (tsc client+server) passed for the new script.

### What's Next
1. **[OWNER, light]** Run the new data cleanup scripts against the production Turso DB (requires exporting `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in the environment, then running `node server/scripts/sweep-company-status.js` and `node server/scripts/delete-researching-recruiters.js`).
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

> Read `CLAUDE.md` / `AGENTS.md`, then this file. A one-off company status sweep script was created. Plan of record returns to `.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+, gated D5–D9).
