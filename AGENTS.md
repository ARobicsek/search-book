# Agent Instructions (all AI coding agents: Claude Code, Gemini/Antigravity, etc.)

This is the **single source of truth** for SearchBook's session protocol. It is agent-agnostic —
despite the `CLAUDE.md` filename, every AI agent follows the same flow. `CLAUDE.md` and the
`.planning/Gemini_session_*.md` files point here.

## Session start — read in order

1. **`CLAUDE.md`** (repo root) — tech stack, conventions, critical gotchas, current status.
   Applies to **all** agents, not just Claude.
2. **`.planning/NEXT-SESSION-PROMPT.md`** — what happened last session, what's next, open bugs.
3. **`.planning/NCQA-ADAPTATION-PLAN.md`** — the active plan of record. Read its "How to use this
   document" section + the phase being worked.

Only if you need deeper context: **`.planning/STATE.md`** (current decisions/blockers) and
**`.planning/SESSION-HISTORY.md`** (full historical ledger). See `.planning/README.md` for a map
of every doc.

## Session end

1. Update the **STATUS line** of every task you touched in `.planning/NCQA-ADAPTATION-PLAN.md`
   (date, commit hash, any deviations).
2. Update **`.planning/NEXT-SESSION-PROMPT.md`** — completed / next / open bugs.
3. If you made a durable decision (schema shape, taxonomy, rejected alternative), add a row to the
   decisions table in **`.planning/STATE.md`**, and add a one-line entry to the session log in
   **`.planning/SESSION-HISTORY.md`**.
4. `npm run prepush`, then **commit and push to `main`** (pushing is authorized by the owner;
   auto-deploys to Vercel).

## Non-negotiables (details in `CLAUDE.md`)

- **One atomic commit per task** (GSD methodology).
- **Never use Prisma `_count` selects** — they hang the libsql adapter on Turso. Use `.length`
  client-side or raw SQL.
- **Schema changes need manual Turso DDL before pushing schema-touching code to `main`** — follow
  the procedure at the top of `.planning/NCQA-ADAPTATION-PLAN.md`. (The committed `server/.env` rw
  token is stale — apply DDL via the Turso web SQL console.)
- **Every new user-content Prisma model must be added to both backup paths** (server
  `routes/backup.ts` export + `/import`; client `lib/backup.ts` `TABLES_PARENT_FIRST`) — or to the
  `EXEMPT` set if ephemeral. The `check-backup-coverage.mjs` guard (in `prepush` + the Vercel build)
  fails the build otherwise. Details in `CLAUDE.md`.
- **Re-test mobile (390px)** for any UI change, plus desktop.
- Run a full `vite build` / `tsc -b` (not just `npm run prepush`) before pushing — it catches
  unused imports the typecheck misses.

## Where things live (doc map)

| Doc | Role |
|-----|------|
| `AGENTS.md` (this file) | The session protocol — start/end steps, non-negotiables. |
| `CLAUDE.md` | Canonical technical reference: stack, conventions, gotchas, current status. |
| `.planning/NCQA-ADAPTATION-PLAN.md` | Active plan of record (roadmap + per-task status). |
| `.planning/NEXT-SESSION-PROMPT.md` | Rolling session-to-session handoff. |
| `.planning/STATE.md` | Currently-in-force decisions + blockers. |
| `.planning/SESSION-HISTORY.md` | Full historical decision ledger + session log. |
| `.planning/README.md` | Index of everything in `.planning/` (incl. `archive/`). |
| `server/scripts/` | Reusable verification/maintenance tools (spent migrations in `archive/`). |
