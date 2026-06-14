# Next Session Prompt

This file is the handoff document for the next AI session (Claude Code **or** Gemini/Antigravity — the protocol is agent-agnostic). It summarizes what was just accomplished, what to work on next, and any open items.

### What Was Just Completed (2026-06-13, build session) — Phase B SHIPPED

Implemented **Phase B** of the plan of record `.planning/UX-SEARCH-MEETINGS-PLAN.md`
(search correctness + perf), one atomic commit per chunk, verified at desktop + 390px,
pushed to `main` (auto-deploys to Vercel). **No schema changes** (as predicted).

- **B1 — Participant takeaways surface the *person* card** (`128b36d`). A per-participant
  `ConversationParticipant.note` ("Meeting takeaway") now matches the **contact**, not only
  the meeting. Edits in `server/src/routes/search.ts`: clause in `contactClausesFor`
  (peopleNotes scope), `participantInConversations: { select: { note }, take: 50 }` in the
  contact select, and a `'meeting takeaway'` field (weight 1) in `collectContactFields`.
  Verified via the live server with a temp participant note (local DB had 0): the token
  returned the person's card **and** the meeting; test row removed.
- **B2 — Weighted free-text ranking in Meetings search** (`87a1fc6`). `server/src/routes/meetings.ts`:
  the `q` box now covers **every** meeting field (mirrors search's `conversationClausesFor`,
  incl. discussed people/orgs via a new `meetingRankInclude`) and ranks by max-weight
  **title=4 > anchor/participant names=3 > anchor/addl org names + attendees desc=2 > rest=1**,
  then date desc (fetch 300 → score → slice). Verified: title > attendees > notes/participant
  ordering via a controlled token; in-browser, q="health" surfaced a meeting matched *only* via
  a discussed org (new coverage).
- **B3 — Search perf, lazy related + parallelize** (`3c7ce1c`). `server/src/routes/search.ts`:
  `includeRelated` defaults **false**; new `GET /api/search/related/:type/:id`; per-term company
  lookups + the 5 entity finds run in `Promise.all`; the `additionalCompanyIds` findUnique loop
  collapsed to one findMany. `client/src/pages/search.tsx`: stop sending `includeRelated`; the
  count badge → a lazy **"Related"** expander (fetches on first open, caches by `${type}-${id}`,
  spinner / "No related items"). Local `[TIMING]` q="health" warm **91ms → 31ms** from dropping
  the fan-out (local SQLite has no network latency; the real ~20s→~1–2s win is the **~200→~12
  round-trip** reduction, to confirm in prod). Verified desktop + 390px; lazy panel populates;
  no console errors.

`npm run prepush` green for every commit; strict client build (`tsc -b && vite build`) green for B3.

### Pause point — owner eyeballs search before Phase C

The owner asked to **pause after Phase B** to eyeball search behavior before the big Quick Log
unification. **Action for the owner:** try the live Search + Meetings search; confirm the prod
`[TIMING] search …` line for a broad query (e.g. "analytics"/"health") dropped from ~20s toward
~1–2s (this is also carry-over #2). Resume Phase C only after that thumbs-up.

### What's Next — Phase C of `.planning/UX-SEARCH-MEETINGS-PLAN.md` (biggest, highest-risk)

Unify on the **Quick Log** dialog as the single meeting editor:
1. **C1a — Quick Log: autosave + drop the 1:1 anchor + participant-first display**
   (`feat(meetings): Quick Log autosave + drop 1:1 anchor + participant-first display`). Drop the
   "Contact (1:1 anchor)" Combobox (stop sending `contactId` for new + edit → legacy anchors
   untouched); debounced autosave (POST-once-then-PUT, `lastSavedSnapshot` to skip no-ops,
   save-status indicator, Cancel→Close, small "Delete this meeting"); participant-first display
   fallback in the meetings card **and** search `displayName`.
2. **C1b — Retire the contact-page inline editor; seed the participant**
   (`feat(meetings): contact page logs via Quick Log (seeded participant)`). Extend
   `useQuickLog().open` to accept a prefill (`{ participant, title }`); `ConversationsTab` →
   "Log Meeting" button opening Quick Log seeded with that contact; edit → `openEdit(id)`; keep
   the read-only list; remove the dead inline form + its `useAutoSave` + draft localStorage.
   **Read the full `ConversationsTab` (~L1179–end of `contact-detail.tsx`) before cutting.**

Then **Phase D** (meetings calendar: List|Calendar toggle, FullCalendar, click→`openEdit`),
**Phase E** (relabel "Conversations"→"Meetings", UI strings only — keep model/API/types/events).

Process reminders: one atomic commit per chunk; `npm run prepush` **and** a client build
(`tsc -b` is stricter than the typecheck script) + a desktop/390px smoke test before each push;
update each task's STATUS line in the plan doc; owner has standing permission to push to `main`.
**No schema changes are expected anywhere in this plan — flag immediately if you think one is needed.**
Phase C deletes code → watch for unused-var **build** failures (`noUnusedLocals`, stricter than `typecheck`).

### Carry-over items (pre-dating, lower priority)
1. **[USER ACTION]** Set `SENTRY_DSN` / `VITE_SENTRY_DSN` in Vercel (hardening Task 17).
2. **Prod search perf check** — now that B3 is live, confirm the prod `[TIMING] search …` line is
   healthy for a broad query (local SQLite can't reproduce the ~20s; the fix is a round-trip-count
   reduction that only shows against Turso).
3. NCQA adaptation plan (`.planning/NCQA-ADAPTATION-PLAN.md`): Phase 3 (blocked D8/D9) / Phase 4 (D5/D6). Don't push on D5–D9 until the owner raises them.
4. Desktop-only verifications parked from Phase 7.5 (photo-ZIP CORS vs prod; restore into scratch Turso DB).
5. Replace `resetPrisma()` per-request pattern with a long-lived PrismaClient.
6. Company near-duplicate scan (LinkedIn-variant suffixes).
7. #12 LinkedIn-on-mobile deferred (screenshot→gpt-4o-mini vision is the ready option if revisited).
8. Stray empty `server/dev.db` / `server/test.db` (gitignored) safe to delete.

### Open Bugs / Known Caveats
- No confirmed bugs. Reminder: the `Favorite` tag is a normal tag and appears in tag dropdowns (by design).
- **B2 cap:** the `q`-ranking path fetches at most 300 matching meetings before ranking/paginating,
  so `total` is bounded at 300 (implausible to hit for a single user; mirrors the series-title path).
- **B3 tradeoff (accepted):** the per-card related **count badge** is gone (it required the eager
  fetch) → plain "Related" expander; the count appears only after expanding, which triggers one
  brief single-entity fetch.
- After Phase C deletions, watch for unused-var build failures — the client **build** (`tsc -b`,
  `noUnusedLocals`) is stricter than the `typecheck` script.

### Working branch
`main`, clean and fully pushed. Phase B (B1 `128b36d`, B2 `87a1fc6`, B3 `3c7ce1c`) + this handoff are live.

---

### Suggested kickoff prompt for the next session

> Read `CLAUDE.md` / `AGENTS.md`, then `.planning/NEXT-SESSION-PROMPT.md` and the plan of record
> `.planning/UX-SEARCH-MEETINGS-PLAN.md`. Phases A and B are shipped and live. Confirm the owner is
> happy with search behavior (incl. the prod `[TIMING]` perf check), then implement **Phase C**
> top-to-bottom: C1a (Quick Log autosave + drop 1:1 anchor + participant-first display) → C1b (retire
> the contact-page inline editor, seed the participant). One atomic commit per chunk; before each push
> run `npm run prepush` **and** a client build, and smoke-test at desktop + 390px. Update each task's
> STATUS line in the plan doc. No schema changes are expected — flag immediately if you think one is
> needed. Watch for unused-var build failures from the Phase C deletions.
