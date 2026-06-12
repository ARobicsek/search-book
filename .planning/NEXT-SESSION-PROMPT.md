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

**Later the same day (2026-06-12), the user resolved D1–D4** and the plan was updated in place: final ecosystem list (new list + keep `RECRUITER`; `ROLODEX`/`TARGET`/`INFLUENCER`/`INTRO_SOURCE` → `NETWORK`), trimmed statuses with a blank/`'NONE'`-sentinel option (contacts: 4 values; companies: 4 values with `ENGAGED`/`PARTNER` renames), and — the big one — **Phase 2 redesigned around title-based meeting series instead of Groups** (D4: the user wants to name conversations after calendar event names with minimal effort and find them by title later).

**Standing permission:** the user has authorized committing/pushing directly to `main` (auto-deploys to Vercel) so they can test. Typecheck + local smoke test first; never push schema-touching code before the Turso DDL is applied (procedure at the top of the adaptation plan).

### What's Next — Phase 2: Meetings overhaul

**Phase 1 is COMPLETE and DEPLOYED (2026-06-12).** Commits `08568e0` (taxonomy: NCQA ecosystems, trimmed statuses with `'NONE'` blank sentinel, Organizations relabel) and `71cd9b0` (action `direction` + Waiting For view + dashboard card) are on `main`; the Turso data migration (legacy remaps + `ALTER TABLE "Action" ADD COLUMN direction`) was run by the user in the Turso console and verified clean (only valid values remain; all 223 actions `OWED_BY_ME`).

Next: **Phase 2 (Tasks 2.1–2.4)** per the plan — title-based meeting series (autocomplete), optional contact anchor, org anchor, `attendeesDescription`, per-participant notes, `ConversationTag`, Quick Log dialog, global `/meetings` page.

⚠️ **Task 2.1 contains the plan's riskiest migration**: making `Conversation.contactId` nullable requires a SQLite **table rebuild** on Turso (create new table → copy → drop → rename, in one transaction). Fresh backup immediately before; verify row counts after. The proven workflow from Phase 1: build + typecheck + client-build everything locally and commit to the session branch, hand the user exact SQL for the Turso web console (PascalCase table names, e.g. `"Conversation"`), wait for verification output, only then push to `main`.

Also remember (Phase 1 lesson): new tables/columns must be added to **both** backup paths (server export in `server/src/routes/backup.ts` AND browser-direct list in `client/src/lib/backup.ts` `TABLES_PARENT_FIRST`) — `ConversationTag` will need this.

Remaining open decisions: **D5–D9** (Copilot recap sample, `ANTHROPIC_API_KEY`, Outlook ICS availability, auth choice, NCQA policy check) — needed for Phases 3–5, not Phase 2.

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
