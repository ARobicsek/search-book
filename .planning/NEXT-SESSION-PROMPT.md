# Next Session Prompt

Rolling handoff for the next AI session (Claude Code **or** Gemini/Antigravity — protocol is
agent-agnostic, see `AGENTS.md`). Keep this file **lean**: a short "just completed", "what's next",
carry-overs, open bugs, and a kickoff prompt. Per-session detail goes in `SESSION-HISTORY.md`, not
here.

### What Was Just Completed — Clear button on all list-filter search boxes (2026-06-19)

One owner ask, **schema-free, pushed/live**. All standalone list-filter search boxes (magnifying
glass on the left) now afford a **one-click clear** (an "X" button on the right, shown only when the
box has text).

- **Where:** Ideas, Contacts, Companies, Actions list pages. Global Search (`search.tsx`) and the
  Meetings title filter (`meetings.tsx`) already had this — they were the source of the established
  pattern, which was simply replicated.
- **Pattern:** in the existing `relative` wrapper, after the `Input`, render
  `{value && (<button onClick={() => setValue('')} aria-label="Clear search" className="absolute right-0 top-0 flex h-9 w-9 …"><X/></button>)}`
  and add a conditional `pr-9` to the input so long text doesn't slide under the button.
- **Files:** `client/src/pages/ideas/idea-list.tsx`,
  `client/src/pages/contacts/contact-list.tsx`, `client/src/pages/companies/company-list.tsx`,
  `client/src/pages/actions/action-list.tsx` (added `X` to lucide imports in idea-list + action-list;
  the other two already imported it).
- **Out of scope (left as-is):** the combobox / command-palette typeahead inputs
  ("Search or type new name…") inside popovers — different UX (closing the popover resets them); not
  "search boxes like this one." Easy to extend later if wanted.

Verified end-to-end via chrome-devtools (desktop + 390px) on the Ideas page: typing reveals the X,
clicking it empties the box and restores the full list (3→1→3). `prepush` + full `vite build` green.

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

`main` — fully synced (remote == local) before this session at `74db62c`. This session adds one
schema-free commit (search-box clear buttons) pushed to `main`. **Nothing pending** — no Turso DDL
needed, no held commits.

---

### Suggested kickoff prompt for the next session

Durable version (works every session — it defers to the docs, which stay current):

> Start a SearchBook session: read `AGENTS.md` and follow its "Session start" steps, then summarize
> where we left off and what's next before doing anything.

Context for *this* upcoming session specifically: last session shipped one schema-free owner ask —
**one-click clear buttons on every list-filter search box** (Ideas/Contacts/Companies/Actions; global
Search + Meetings already had it). Nothing is left pending. Plan of record is
`.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+, gated on the "⏳ Waiting on owner" block,
D5/D6/D8/D9).
