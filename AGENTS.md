# Agent Instructions (all AI coding agents: Gemini/Antigravity, Claude Code, etc.)

This project uses a shared, agent-agnostic session protocol.

**Session start — read in order:**
1. `CLAUDE.md` (project root) — tech stack, conventions, critical gotchas. Despite the filename, it applies to **all** agents.
2. `.planning/NEXT-SESSION-PROMPT.md` — what happened last session, what's next.
3. `.planning/NCQA-ADAPTATION-PLAN.md` — the active plan of record (read "How to use this document" + the phase being worked).

**Session end:**
1. Update STATUS lines for tasks you touched in the active plan.
2. Update `.planning/NEXT-SESSION-PROMPT.md` (completed / next / open bugs).
3. Record durable decisions in `.planning/STATE.md`.
4. `npm run prepush`, then commit and push (pushing to `main` is authorized by the owner).

**Non-negotiables** (details in CLAUDE.md): atomic commit per task; never use Prisma `_count` selects (hangs on Turso); schema changes need manual DDL against Turso before pushing code to `main` (procedure at the top of the adaptation plan); re-test mobile (390px) for UI changes.
