# Next Session Prompt

This file is the handoff document for the next AI session (Claude Code **or** Gemini/Antigravity — the protocol is agent-agnostic). It summarizes what was just accomplished, what to work on next, and any open items.

### What Was Just Completed (2026-06-13, planning session) — UX/Search/Meetings plan APPROVED, no code yet

This was a **planning-only** session. The owner brought a 13-item worklist; after a codebase read we
produced and the owner **approved** a build plan. **No code was written.** The plan of record for the next
build session is **`.planning/UX-SEARCH-MEETINGS-PLAN.md`** (Phases A → E, top-to-bottom).

Three decisions locked in this session:
- **Unify on the Quick Log dialog** as the one meeting editor app-wide (retire the contact-page inline editor; seed the originating contact as a Participant; add autosave; drop the "1:1 anchor" field). This is the root fix for "Log Meeting doesn't autosave," "two encounter types," and "scrap the 1:1 anchor."
- **LinkedIn import stays paste-text only** (no screenshot/AI-vision path this session).
- **Separate Meetings calendar** (meetings-only), distinct from the actions calendar.

Two diagnostic conclusions worth carrying:
- The ~20s search is **Turso round-trip count**, not data volume — `includeRelated=true` fans out ~150 queries. Fix is lazy-load-related + parallelize (Phase B3). **No FTS** needed at this scale.
- **No item in the plan needs a schema change** → no Turso DDL, lower risk.

### What's Next — implement `.planning/UX-SEARCH-MEETINGS-PLAN.md`

Build top-to-bottom, low-risk → high-risk, one atomic commit per chunk; `npm run prepush` + a client
build + a desktop/390px smoke test before each push (owner has standing permission to push to `main`):

1. **Phase A (quick wins):** A1 `Consultant` ecosystem · A2 clickable top-bar search · A3 one-tap clear on Search · A4 markdown formatting-before-typing.
2. **Phase B (search):** B1 participant takeaways surface the *person* card · B2 weighted Meetings free-text ranking (title > people > org/attendees > rest) · B3 lazy related + parallelize (the ~20s fix).
3. **Phase C (biggest):** unify on Quick Log — C1a autosave + drop 1:1 anchor + participant-first display; C1b retire the contact-page inline editor + seed participant.
4. **Phase D:** dedicated Meetings calendar (List|Calendar toggle on `/meetings`).
5. **Phase E:** relabel "Conversations" → "Meetings" in the UI (labels only).

Each task has its files, commit message, and a verification step in the plan doc.

### Carry-over items (pre-dating, lower priority)
1. **[USER ACTION]** Set `SENTRY_DSN` / `VITE_SENTRY_DSN` in Vercel (hardening Task 17).
2. **Prod search perf check** — superseded by Phase B3; after B3 ships, confirm the prod `[TIMING] search …` line is healthy.
3. NCQA adaptation plan (`.planning/NCQA-ADAPTATION-PLAN.md`): Phase 3 (blocked D8/D9) / Phase 4 (D5/D6). Don't push on D5–D9 until the owner raises them.
4. Desktop-only verifications parked from Phase 7.5 (photo-ZIP CORS vs prod; restore into scratch Turso DB).
5. Replace `resetPrisma()` per-request pattern with a long-lived PrismaClient.
6. Company near-duplicate scan (LinkedIn-variant suffixes).
7. #12 LinkedIn-on-mobile deferred (screenshot→gpt-4o-mini vision is the ready option if revisited).
8. Stray empty `server/dev.db` (gitignored) safe to delete.

### Open Bugs / Known Caveats
- No confirmed bugs. Reminder: the `Favorite` tag is a normal tag and appears in tag dropdowns (by design).
- After Phase C deletions, watch for unused-var build failures — the client **build** (`tsc -b`, `noUnusedLocals`) is stricter than the `typecheck` script.

### Working branch
`main`, clean and fully pushed (last code session 2026-06-12). This planning session added only `.planning/` docs — commit them (and CLAUDE.md status if desired) before starting the build.

---

### Suggested kickoff prompt for the next session

> Read `CLAUDE.md` / `AGENTS.md`, then `.planning/NEXT-SESSION-PROMPT.md` and the approved plan of
> record `.planning/UX-SEARCH-MEETINGS-PLAN.md`. We're implementing that plan top-to-bottom.
> Start with **Phase A** (A1 Consultant ecosystem → A2 clickable top-bar search → A3 one-tap clear on
> Search → A4 markdown-format-before-typing), one atomic commit per chunk. Before each push run
> `npm run prepush` **and** a client build, and smoke-test at desktop + 390px. Update each task's STATUS
> line in the plan doc as you go. No schema changes are expected anywhere in this plan — flag it
> immediately if you think one is needed. Pause after Phase A so I can eyeball it before we move to the
> search work (Phase B) and the bigger Quick Log unification (Phase C).
