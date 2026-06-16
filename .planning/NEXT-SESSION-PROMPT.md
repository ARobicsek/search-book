# Next Session Prompt

This file is the handoff document for the next AI session (Claude Code **or** Gemini/Antigravity — the
protocol is agent-agnostic). It summarizes what was just accomplished, what to work on next, and open items.

### What Was Just Completed (2026-06-15 session 5 — Meetings overhaul)

1. **Real `Series` entity (revises D4).** New `Series` table + `Conversation.seriesId` (`onDelete: SetNull`).
   Series is now **opt-in**: mark a meeting as a series (or join an existing one) via a **Series picker** in
   the Quick Log dialog — pick an existing series or type a new name to create it inline (no exact-title
   retyping). The `series` chip on a meeting card now shows **only** for meetings actually in a series and opens
   the series view (`/meetings?seriesId=…`). New `/api/series` route (list with count/lastDate, find-or-create
   POST, rename PUT, delete). Existing titles shared by ≥2 meetings were auto-grouped into series by the migration.
2. **Sort + `updatedAt`.** Added `Conversation.updatedAt` (`@updatedAt`). `/api/meetings` accepts
   `sortBy` (`date`|`updatedAt`|`createdAt`) + `sortDir`; a **Sort dropdown** on the Meetings page offers
   Date (newest/oldest), Recently updated, Recently logged.
3. **Card title + search.** `conversationDisplayName` precedence is now
   `title → first participant → contact → company → attendeesDescription` (first participant outranks the legacy
   anchor). The Meetings **Search** box (relabeled "Search title, people, notes…") already ranks title/participant
   matches, so typing a person's name surfaces their untitled meeting (verified).
4. **Quick Log redesign ("promote the big 3").** Participants, Notes, and Follow-up actions are always visible;
   everything secondary is reorganized into 3 labeled disclosures: **Organizations & attendees** ·
   **Summary & next steps** · **Tags, prep notes & attachments**. The Title filter became a **Series** dropdown.

**Verification:** `npm run prepush` (tsc client+server) + full `vite build` green. Verified in-browser on
desktop **and** 390px mobile: series create→join→chip→series view, sort, person-name search, first-participant
title, and the redesigned dialog (autosave + actions + participant all persist). Test data cleaned up.

**⚠ Turso DDL:** the `Conversation` schema changed, so production DDL **must be applied before the code deploys.**
The owner ran it in the Turso web SQL console this session (SQL is in `server/scripts/migrate-conversation-series.js`
as a runnable dual-mode script, and was provided inline). Local dev DB already migrated (225 rows backfilled).

### What's Next
1. **[OWNER, light]** Confirm on prod that series create/join + the new sort/search behave as expected.
2. Plan of record returns to **`.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+)**, gated on D5–D9 — don't push on
   those until the owner raises them.

### Carry-over items (pre-dating, lower priority)
1. **[USER ACTION]** Set `SENTRY_DSN` / `VITE_SENTRY_DSN` in Vercel (hardening Task 17).
2. NCQA adaptation plan: Phase 3 (blocked D8/D9) / Phase 4 (D5/D6).
3. Stray empty `server/dev.db` / `server/test.db` (gitignored) safe to delete.

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
`main` — pushed and live **after** the owner applied the Turso DDL.

---

### Suggested kickoff prompt for the next session

> Read `CLAUDE.md` / `AGENTS.md`, then this file. The Meetings area got a real Series entity (opt-in, picker +
> chip + series view), `updatedAt`-based sorting, first-participant card titles, person-name search, and a
> redesigned Quick Log (participants/notes/actions promoted; secondary fields in 3 labeled groups). Plan of
> record returns to `.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+, gated D5–D9).
