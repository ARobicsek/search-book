# Next Session Prompt

Rolling handoff for the next AI session (Claude Code **or** Gemini/Antigravity — protocol is
agent-agnostic, see `AGENTS.md`). Keep this file **lean**: a short "just completed", "what's next",
carry-overs, open bugs, and a kickoff prompt. Per-session detail goes in `SESSION-HISTORY.md`, not
here.

### What Was Just Completed — repo cleanup & session-doc reorg

Housekeeping session (no app/schema changes). Tidied the tree and re-organized the planning/session
docs:

- **Orphaned files removed/relocated:** deleted `server/repro_output.json`; moved the orphaned
  server-root one-offs (`debug_dashboard.ts`, `update_industries*.ts`, `verify_updates.ts`,
  `turso_migrate.js`) and ~13 already-applied migration/cleanup scripts into
  **`server/scripts/archive/`**. Top-level `server/scripts/` now holds only the reusable tools
  (`restore-test.mjs`, `prod-count-diff.mjs`, `app-smoke.mjs`, `count-rows.js`,
  `sweep-company-status.js`).
- **`.planning/` archived** the ~10 shipped/superseded `*-PLAN.md` docs into `.planning/archive/`;
  added `.planning/README.md` (doc index).
- **Session protocol single-sourced in `AGENTS.md`** — `CLAUDE.md`'s Session Management section and
  the two `Gemini_session_*.md` files are now thin pointers to it.
- **Decisions ledger split:** the full ~90-row ledger + per-session log now live in
  `SESSION-HISTORY.md`; `STATE.md` keeps only the in-force subset.
- **Front-door docs refreshed:** root `README.md`, `docs/architecture.md`, `docs/scriptReferences.md`.

### What's Next

1. Plan of record returns to **`.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+)**, gated on decisions
   **D5–D9** — don't push on those until the owner raises them.

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

> Read `AGENTS.md`, then `CLAUDE.md`, then this file. Last session was repo/doc housekeeping (scripts
> + plans archived, session protocol single-sourced in `AGENTS.md`, decisions ledger split into
> `STATE.md` (current) + `SESSION-HISTORY.md` (full), front-door docs refreshed) — no app changes.
> Plan of record is `.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+, gated on decisions D5–D9 — don't
> push on those until the owner raises them).
