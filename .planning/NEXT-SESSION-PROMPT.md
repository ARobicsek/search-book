# Next Session Prompt

Rolling handoff for the next AI session (Claude Code **or** Gemini/Antigravity — protocol is
agent-agnostic, see `AGENTS.md`). Keep this file **lean**: a short "just completed", "what's next",
carry-overs, open bugs, and a kickoff prompt. Per-session detail goes in `SESSION-HISTORY.md`, not
here.

### What Was Just Completed — Action cards show who you're waiting on ✅ SHIPPED

Bugfix (commit `b1f6bc5`, pushed/live, **schema-free → no Turso DDL**). When an action is owned by
someone else (`WAITING_ON_THEM`), the compact action displays were showing the "Related To" contact
instead of the **ower** — e.g. an action related to Kara but owed by Scott showed "Kara". Now they
show the ower, with a fuchsia "waiting on" hourglass cue. Root cause: the API returned only ower
**ids**, never names, so the UI had nothing to render.

- **Server** (`server/src/routes/actions.ts`): `attachOwers()` resolves `owerContactIds` (a JSON
  column, not a relation) → `[{id,name}]` in one batched query (no N+1, no `_count`), attached as
  `owers` on every action read/write response.
- **Client**: shared `actionDisplayPeople()` (`client/src/lib/types.ts`) picks owers when present,
  else related contact(s) — wired into the dashboard `ActionRow`, the Actions list "Contact" column
  (incl. sort + global search). The calendar already handled owers. Detail page now also surfaces a
  "Waiting on" field beside "Related To".
- Verified all surfaces + the owed-by-me inverse via chrome-devtools (desktop + 390px); test action +
  its undo snapshot cleared from the local dev DB; `prepush` + full `vite build` green.

**Prior session (Outlook → SearchBook meeting import, `bb49185`) still has one open [USER ACTION]:**
set `OUTLOOK_CALENDAR_ICS_URL` in Vercel (see What's Next #1). Full detail in `SESSION-HISTORY.md`.

### What's Next

1. **[USER ACTION] finish prod wiring for the import:** set **`OUTLOOK_CALENDAR_ICS_URL`** in Vercel
   (Production env) so the import works live (until then the dialog shows "Outlook calendar not
   connected"). Optional `APP_TIMEZONE` (defaults `America/New_York`).
2. Plan of record is **`.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+)**. Check the **"⏳ Waiting on
   owner"** block — now **D5/D6/D8/D9** (D7 resolved this session). Phase 3 (stakeholder intel) is
   gated on D8/D9; Phase 4 (Copilot AI ingest) on D5/D6. Don't push on those until the owner raises them.
3. **Option B (when wanted):** attendee auto-fill via Microsoft Graph or Power Automate — implement a
   second `CalendarProvider`; nothing downstream changes. Power Automate may avoid the Azure
   app-registration/admin-consent friction (worth a feasibility check first).

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

`main` — pushed and live.

---

### Suggested kickoff prompt for the next session

Durable version (works every session — it defers to the docs, which stay current):

> Start a SearchBook session: read `AGENTS.md` and follow its "Session start" steps, then summarize
> where we left off and what's next before doing anything.

Context for *this* upcoming session specifically: last session was a small schema-free **Actions
bugfix** — compact action cards now show the person you're waiting on (the ower), not the "Related
To" contact (`b1f6bc5`). The standing loose end is still **[USER ACTION] set
`OUTLOOK_CALENDAR_ICS_URL` in Vercel** for the Outlook import to work live (What's Next #1). Plan of
record is `.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+, gated on the "⏳ Waiting on owner" block,
now D5/D6/D8/D9).
