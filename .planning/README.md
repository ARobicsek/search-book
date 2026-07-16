# `.planning/` — what's in here

This folder holds SearchBook's planning, session, and reference docs. Start a session by
reading **`AGENTS.md`** (repo root) — it's the canonical session protocol and points you here.

## Active

| File | Purpose |
|------|---------|
| [NCQA-ADAPTATION-PLAN.md](NCQA-ADAPTATION-PLAN.md) | **Plan of record.** The NCQA CMO stakeholder-management adaptation (Phases 1–2 shipped; Phase 3+ gated on decisions D5–D9). |
| [VERCEL-EXIT-PLAN.md](VERCEL-EXIT-PLAN.md) | **Contingency (not started).** If IT forces a move off Vercel: full migration plan to Google Cloud Run + GCS + Cloud Scheduler (keep Turso). Execute only on the owner's say-so. |

## Session system (read/update every session)

| File | Purpose |
|------|---------|
| [NEXT-SESSION-PROMPT.md](NEXT-SESSION-PROMPT.md) | Rolling handoff — what was just done, what's next, open bugs, kickoff prompt. |
| [STATE.md](STATE.md) | Currently-in-force decisions, blockers, user-feedback summary. |
| [SESSION-HISTORY.md](SESSION-HISTORY.md) | Full historical decision ledger + per-session log (rarely needed in a normal session). |

## Reference / runbooks (durable, not session-specific)

| File | Purpose |
|------|---------|
| [SEARCH-AGENT-GUIDE.md](SEARCH-AGENT-GUIDE.md) | For an LLM search/synthesis agent: which export file to use (the `searchbook-notes-*.md` markdown) and how it's structured. Hand this to the agent. |
| [BACKUP-SCHEMA.md](BACKUP-SCHEMA.md) | Schema of the JSON backup for an agent that needs exact structured fields (fallback to the markdown above). |
| [BACKUP-COVERAGE-AUDIT.md](BACKUP-COVERAGE-AUDIT.md) | Proof the daily-cron + manual backups capture every table and binary. |
| [RESTORE-TEST-RUNBOOK.md](RESTORE-TEST-RUNBOOK.md) | How to restore a prod backup into a scratch Turso DB and verify it (executed + passed). |
| [HOW-IT-WORKS.md](HOW-IT-WORKS.md) | Plain-language tour of the stack/patterns for a non-engineer reader. |
| [PROJECT.md](PROJECT.md) | Original project vision (job-search CRM era — predates the NCQA pivot; kept for context). |
| [REQUIREMENTS.md](REQUIREMENTS.md) | Original data-model / requirements doc (same era as PROJECT.md). |

## `archive/`

Shipped or superseded plan docs, kept for historical reference (full git history preserved).
Nothing here is active work. As of this writing: ROADMAP, PRODUCTION-HARDENING-PLAN,
SEARCH-UPGRADE-PLAN, UX-SEARCH-MEETINGS-PLAN, CALENDAR-FAVORITES-BACKUP-PLAN,
ACTIONS-IDEAS-POLISH-PLAN, UI-IMPROVEMENTS-PLAN, IDEAS-MEETINGS-POLISH-PLAN, UNDO-DELETE-PLAN,
LINKEDIN-IMPORT-ENHANCEMENT-PLAN.
