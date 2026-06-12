# Next Session Prompt

This file is the handoff document for the next AI session (Claude Code **or** Gemini/Antigravity — the protocol is agent-agnostic). It summarizes what was just accomplished, what to work on next, and any open items.

### What Was Just Completed (2026-06-12, second session)

**Phase 2 of the NCQA adaptation plan (Meetings overhaul, Tasks 2.1–2.4) is COMPLETE and DEPLOYED.** `.planning/NCQA-ADAPTATION-PLAN.md` remains the plan of record (read its "How to use this document" section first). Commits, all on `main` via branch `ncqa-phase2`:

- `1b618e9` — **Task 2.1**: `Conversation.contactId` nullable + `title`/`companyId`/`attendeesDescription` columns, `ConversationParticipant.note`, new `ConversationTag` junction, ≥1-who validation server-side, `GET /api/conversations/titles` (MRU autocomplete), `?contactId=` also matches named participants, PUT allow-list + junctions replaced only when sent, both backup paths cover `ConversationTag` (24 tables, `_meta.version` 3).
- `b91376a` — **Task 2.2**: Quick Log dialog (header button on every page + command palette entry; title autocomplete autofocused; who-pickers behind a collapsed disclosure) + full editor gains title/org/attendees/per-participant-notes/tags. New shared `TitleAutocomplete` component. Edits never send `contactId` (can't re-anchor a meeting from an attendee's page).
- `b507f0e` — **Task 2.3**: new `GET /api/meetings` (pagination envelope; filters title/org/tag/type/date-range/free-text/id; series title matched case-insensitively exact), `/meetings` page (URL-as-state so series links are shareable), Meetings sidebar item, global search + command palette now match and render meetings.
- `df9eb8a` — **Task 2.4**: "Meeting Takeaways" card on contact Overview (per-participant notes across attended meetings, newest first); "Meetings" card on company Overview (anchored meetings + view-all link).

**Turso migration (the plan's riskiest — `Conversation` table rebuild) was run by the user in the Turso console and verified clean**: row counts identical before/after (226 conversations / 11 participants / 31 contacts-discussed / 70 companies-discussed / 82 linked actions / max id 240), schema checks all passed. Note for future console scripts: the Turso/Drizzle Studio console auto-commits **each statement** — `BEGIN`/`COMMIT` lines error with "no transaction is active" (harmless, but omit them next time; per-statement auto-commit is the actual behavior).

Everything was verified in-browser locally before deploy (quick log → series view → takeaways → editor prefill → org meetings card). Deployment to Vercel verified live.

**Standing permission:** the user has authorized committing/pushing directly to `main` (auto-deploys to Vercel). Typecheck + local smoke test first; never push schema-touching code before the Turso DDL is applied (procedure at the top of the adaptation plan).

### What's Next — Phase 3 (Stakeholder intelligence) or Phase 4 (AI ingest)

Per the plan, next up is **Phase 3** (initiatives + stance, leverage, influence, stakeholder matrix) — but **Task 3.1 (auth hardening) is ordered first and is blocked on decisions D8/D9**. **Phase 4** (paste-a-Copilot-recap ingest) is blocked on **D5/D6**. So the session should start by collecting from the user whichever of **D5–D9** they're ready to resolve:

- **D5**: one real (sanitized) MS Copilot meeting recap to tune the extraction prompt (Task 4.2).
- **D6**: `ANTHROPIC_API_KEY` set in Vercel + `server/.env` (Task 4.1).
- **D7**: can NCQA M365 publish an ICS calendar link? (Phase 5).
- **D8**: auth upgrade — Cloudflare Access (recommended) vs. high-entropy rotating token (Task 3.1).
- **D9**: NCQA policy comfort check for candid stance notes (Phase 3).

Phase 3 Tasks 3.2/3.3 (Initiative/ContactInitiative tables, leverage/influence columns) are buildable without D8/D9 resolved, but per the plan auth hardening should land **before stance data accumulates** — don't ship stance UI ahead of 3.1 without asking.

Remember (Phase 1+2 lesson): every new table/column goes into **both** backup paths (server `buildExport`/import in `server/src/routes/backup.ts` AND `TABLES_PARENT_FIRST` in `client/src/lib/backup.ts`) — Phase 3 adds `Initiative` + `ContactInitiative`.

### Carry-over items (pre-dating the adaptation plan, lower priority)

1. **[USER ACTION]** Set `SENTRY_DSN` / `VITE_SENTRY_DSN` in Vercel to activate error tracking (hardening Task 17; dormant until then).
2. Two **desktop-only verifications** parked from Phase 7.5: live photo-ZIP CORS check against prod; restore into a scratch Turso DB. Do not attempt remotely.
3. Replace `resetPrisma()` per-request pattern with a long-lived PrismaClient (works, but wasteful).
4. Expand `useAutoSave` to Prep Notes, Actions, Company create form.
5. Company near-duplicate scan (LinkedIn-variant suffixes).

### Open Bugs / Known Caveats

- No confirmed bugs. Photo-ZIP browser fetch against live Vercel Blob remains unverified (desktop-only item above).
- Photo binaries are only in the manual backup ZIP, not the daily cloud backup (by design).
- The meetings list (`GET /api/meetings`) includes `notes` in list payloads by design (the series view exists to read chronological notes); pagination (20/page, cap 100) bounds the payload.

### Working branch

Work happens on `main` (standing user permission, see above) or short-lived branches fast-forwarded into it. Last state: `ncqa-phase2` fast-forwarded into `main` and pushed; Phase 2 live.
