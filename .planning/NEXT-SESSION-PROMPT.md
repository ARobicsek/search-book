# Next Session Prompt

Rolling handoff for the next AI session (Claude Code **or** Gemini/Antigravity — protocol is
agent-agnostic, see `AGENTS.md`). Keep this file **lean**: a short "just completed", "what's next",
carry-overs, open bugs, and a kickoff prompt. Per-session detail goes in `SESSION-HISTORY.md`, not
here.

### What Was Just Completed — Ideas autosave + nested bullets (2026-06-19)

Two owner asks, **both schema-free, pushed/live**. Org @-mentions from the prior session
(`cd2bfdc` + docs `70a6fe1`) are also confirmed **pushed & live** — the earlier "held for DDL"
carry-over is closed (DDL was applied; remote == local before this session).

1. **Autosave for new Ideas — meeting-log parity.** Ideas already autosaved when *editing*; a **new**
   idea only saved on "Create". Brought it to Quick-Log parity: the idea dialog now uses the same
   bespoke serialized save chain (`enqueueSave` + `savedIdRef` + snapshot dedup) — typing a title
   POSTs the idea, later edits PUT, free-text contacts/companies resolve only on finalize ("Done"),
   tags still create eagerly. Footer mirrors meetings (Delete this idea / Close / Done + Revert when
   dirty); header shows the Saved/Saving indicator in both modes. Replaced the `useAutoSave` hook
   usage in `idea-list.tsx` (edit-mode behavior preserved; create-mode added). Files:
   `client/src/pages/ideas/idea-list.tsx`.
2. **Second-level bullets (Tab to nest).** Shared `MarkdownTextarea` now indents/outdents list
   items with **Tab / Shift+Tab** (2 spaces per level → CommonMark sub-lists; off a list line Tab
   keeps default focus-move). Enter on an empty *nested* item outdents one level (Word-style), then
   ends the list. New nested-list CSS in `index.css` gives distinct markers per level
   (disc → circle → square; ordered → lower-alpha → lower-roman). Applies everywhere the editor is
   used (Ideas, contact notes, prep notes, meeting notes/next-steps). Files:
   `client/src/components/markdown-textarea.tsx`, `client/src/index.css`.

Verified end-to-end via chrome-devtools (desktop + 390px): new-idea autosave (status flips to
"Saved", count 3→4, footer transitions), `- a / Tab / - b / Tab / - c` produced correct 2/4-space
nesting and rendered disc/circle/square; test idea deleted afterward. `prepush` + full `vite build`
green.

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

`main` — fully synced (remote == local) before this session at `70a6fe1`. This session adds two
schema-free commits (Ideas autosave; nested bullets) pushed to `main`. **Nothing pending** — no
Turso DDL needed, no held commits.

---

### Suggested kickoff prompt for the next session

Durable version (works every session — it defers to the docs, which stay current):

> Start a SearchBook session: read `AGENTS.md` and follow its "Session start" steps, then summarize
> where we left off and what's next before doing anything.

Context for *this* upcoming session specifically: last session shipped two schema-free owner asks —
**autosave for new Ideas** (meeting-log parity: type a title and it persists; "Done" finalizes
free-text) and **second-level bullets** (Tab/Shift+Tab to nest in any markdown note editor). Nothing
is left pending. Plan of record is `.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+, gated on the
"⏳ Waiting on owner" block, D5/D6/D8/D9).
