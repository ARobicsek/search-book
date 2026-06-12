# Next Session Prompt

This file is the handoff document for the next AI session (Claude Code **or** Gemini/Antigravity — the protocol is agent-agnostic). It summarizes what was just accomplished, what to work on next, and any open items.

### What Was Just Completed (2026-06-12)

**NCQA Adaptation Plan created** — `.planning/NCQA-ADAPTATION-PLAN.md` is now the **plan of record**. The owner is starting as Chief Medical Officer of NCQA; SearchBook is being adapted from job-search CRM to executive stakeholder-management system. The plan covers:

- **Phase 1** — NCQA taxonomy retheme (ecosystems/statuses, additive — no bulk migration) + action `direction` field (Waiting-For tracking).
- **Phase 2** — Meetings overhaul: optional contact anchor, org anchor, **Groups** ("My VPs"), fuzzy `attendeesDescription`, per-participant notes, conversation tags, Quick Log (<30s), global `/meetings` page. The multi-person/multi-subject design is fully worked out in the plan's Phase 2 design section.
- **Phase 3** — Stakeholder intelligence: Initiatives + per-contact stance, leverage multi-select, influence rating, stance×influence matrix. Auth hardening (Task 3.1) ordered *before* candid stance data accumulates.
- **Phase 4** — AI ingest: paste an **MS Copilot** meeting recap → Claude API extraction → review screen → structured Conversation + Actions + stance signals. AI never writes directly.
- **Phase 5** — **Outlook** calendar via published ICS feed + Daily Briefing view + unlogged-meeting nudges.
- **Phase 6** — Backlog: intro paths, semantic search (supersedes old ROADMAP Phase 8), weekly digest.

Session-management docs were updated to make the protocol explicitly agent-agnostic (this file + `Gemini_session_start.md`/`Gemini_session_end.md` + new root `AGENTS.md`).

**Standing permission:** the user has authorized committing/pushing directly to `main` (auto-deploys to Vercel) so they can test. Typecheck + local smoke test first; never push schema-touching code before the Turso DDL is applied (procedure at the top of the adaptation plan).

### What's Next — Phase 1 of the NCQA Adaptation Plan

1. **First: collect decisions D1–D3** from the user (final ecosystem & status lists — proposals are in the plan, they just need sign-off). The full decision checklist (D1–D9) is at the top of `NCQA-ADAPTATION-PLAN.md`.
2. **Task 1.4 (action direction / Waiting-For) has no blockers** — it can be built immediately, even before D1–D3 are answered.
3. Then Tasks 1.1–1.3 (taxonomy), then Phase 2 (meetings overhaul — note Task 2.1 contains the plan's riskiest migration: making `Conversation.contactId` nullable requires a SQLite table rebuild on Turso; backup first).

### Carry-over items (pre-dating the adaptation plan, lower priority)

1. **[USER ACTION]** Set `SENTRY_DSN` / `VITE_SENTRY_DSN` in Vercel to activate error tracking (hardening Task 17; dormant until then).
2. Two **desktop-only verifications** parked from Phase 7.5: live photo-ZIP CORS check against prod; restore into a scratch Turso DB. Do not attempt remotely.
3. Replace `resetPrisma()` per-request pattern with a long-lived PrismaClient (works, but wasteful).
4. Expand `useAutoSave` to Prep Notes, Actions, Company create form.
5. Company near-duplicate scan (LinkedIn-variant suffixes).

### Open Bugs / Known Caveats

- No confirmed bugs. Photo-ZIP browser fetch against live Vercel Blob remains unverified (desktop-only item above).
- Photo binaries are only in the manual backup ZIP, not the daily cloud backup (by design).

### Working branch

Work happens on `main` (standing user permission, see above) or short-lived branches fast-forwarded into it. Last state: plan + session-doc updates committed to `main`.
