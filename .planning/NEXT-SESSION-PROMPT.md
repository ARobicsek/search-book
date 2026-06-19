# Next Session Prompt

Rolling handoff for the next AI session (Claude Code **or** Gemini/Antigravity — protocol is
agent-agnostic, see `AGENTS.md`). Keep this file **lean**: a short "just completed", "what's next",
carry-overs, open bugs, and a kickoff prompt. Per-session detail goes in `SESSION-HISTORY.md`, not
here.

### What Was Just Completed — Fix: false "changed on another device" 409 blocking edits (2026-06-19)

One owner ask, **schema-free, pushed/live** (`5910384`). The owner couldn't edit an Organization
(CMS): every save fired the conflict toast and reverted the edit, with no concurrent editing
anywhere.

- **Root cause:** the optimistic-concurrency guard filtered `where: { id, updatedAt: <Date> }`.
  Prisma 7 stores `DateTime` as text `YYYY-MM-DDTHH:MM:SS.SSS+00:00` and binds that **same** form in
  equality filters — so the filter only ever matched rows Prisma itself last wrote. Rows whose
  `updatedAt` was last written by **backup-restore / bulk-import / raw-SQL** are stored as `...Z`
  (or `YYYY-MM-DD HH:MM:SS`) and could **never** satisfy the filter even at the identical instant →
  permanent bogus 409 on every save. A normal edit "heals" a row (rewrites `updatedAt` in Prisma's
  form), which is why most records were fine and only restore-touched ones (CMS) were stuck.
- **Fix:** replaced the DB-level filter in the contact/company/action PUT routes with an **app-code
  epoch-ms comparison** — new `assertNotStale(existing.updatedAt, expected)` in
  `server/src/concurrency.ts`, called inside the existing transaction against the row the route
  already fetched. Representation-independent; a genuine cross-device save (different instant) still
  trips a correct 409. **Server-only, no schema change, no Turso DDL, no data migration.**
- **Files:** `server/src/concurrency.ts` (helper + the gotcha write-up), `server/src/routes/`
  `companies.ts` / `contacts.ts` / `actions.ts`. Recorded the Prisma datetime-equality gotcha in
  CLAUDE.md ("Turso / Prisma Gotchas").

Verified by reproducing the guard against the **real libsql adapter** on a copy of `dev.db` (a real
`...Z`-stored row went 0-match → match after the fix) and **end-to-end over HTTP**: correct loaded
token → **200** (was 409); wrong token → **409**. `prepush` + full client+server build green.

### What's Next

1. Plan of record is **`.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+)**. Check the **"⏳ Waiting on
   owner"** block — **D5/D6/D8/D9**. Phase 3 (stakeholder intel) is gated on D8/D9; Phase 4 (Copilot
   AI ingest) on D5/D6. Don't push on those until the owner raises them.
2. **Option B (when wanted):** attendee auto-fill via Microsoft Graph or Power Automate — implement a
   second `CalendarProvider`; nothing downstream changes.
3. **@-mention follow-up (optional):** add a command-palette entry for the Mentions page. (Prep-note
   `@` and org `@` are now done.)

### Carry-over items (lower priority)

1. **[USER ACTION]** Set `SENTRY_DSN` / `VITE_SENTRY_DSN` in Vercel to activate error tracking.
2. NCQA adaptation plan: Phase 3 (blocked D8/D9) / Phase 4 (D5/D6).
3. Stray empty `server/dev.db` / `server/test.db` (gitignored) safe to delete locally.
4. **"Recently updated" merge-bump** fix is forward-only — meetings a *past* contact-merge already
   stamped stay near the top; a one-off reset would also wipe genuine edit timestamps, so confirm
   criteria first.
5. **`updatedAt` under-bumping:** `Conversation.updatedAt` only bumps on edits to the meeting
   row/junctions, not isolated child-record edits (prep note / attachment). Bump it in those routes
   if "Recently updated" should float a meeting on those too.
6. **Mixed `updatedAt`/`createdAt` text formats in the DB** (some rows `...Z`, some `...+00:00`, some
   `YYYY-MM-DD HH:MM:SS`) — left as-is; the concurrency guard no longer cares (compares in app code).
   But **don't add exact `DateTime` equality `where` filters** on those columns (range `gte`/`lt` is
   fine); see the CLAUDE.md gotcha. A one-off normalize-to-`+00:00` is possible later but unneeded.

### Open Bugs / Known Caveats

- **⚠ The committed Turso rw token in `server/.env` is STALE (hard 401).** Use the Turso web SQL
  console for DDL.
- **⚠ `prisma db push` local-path gotcha:** from `server/`, `db push` resolves `file:./dev.db` to
  the stray empty `server/dev.db`, not the populated `server/prisma/dev.db` the server opens. Use a
  dual-mode libsql `file:` migration script (pattern preserved in `server/scripts/archive/`) instead.
- Run `tsc -b` / full `vite build` (not just `npm run prepush`) before every push — it catches
  unused imports the typecheck misses.
- Dev smoke: server 3001, client 5173. The local app has `APP_PASSWORD` unset → seed any non-empty
  `localStorage.searchbook_password` ('devlocal' works) to pass the login gate. Device-emulation
  `390x844` gives a true mobile viewport.

### Working branch

`main` — synced before this session at `f50d4b4`. This session adds one schema-free fix commit
(concurrency-guard false-409, `5910384`) pushed to `main`, plus this docs follow-up.
**Nothing pending** — no Turso DDL needed, no held commits.

---

### Suggested kickoff prompt for the next session

Durable version (works every session — it defers to the docs, which stay current):

> Start a SearchBook session: read `AGENTS.md` and follow its "Session start" steps, then summarize
> where we left off and what's next before doing anything.

Context for *this* upcoming session specifically: last session shipped one schema-free bugfix —
**eliminated false "changed on another device" 409s** that were blocking edits of records last
written by restore/import (the optimistic-concurrency guard now compares `updatedAt` in app code,
not via a DB datetime-equality filter; gotcha recorded in CLAUDE.md). Nothing is left pending. Plan
of record is `.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+, gated on the "⏳ Waiting on owner" block,
D5/D6/D8/D9).
