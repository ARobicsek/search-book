# Next Session Prompt

This file is the handoff document for the next AI session (Claude Code **or** Gemini/Antigravity — the protocol is agent-agnostic). It summarizes what was just accomplished, what to work on next, and any open items.

### What Was Just Completed (2026-06-13, build session) — Phase A SHIPPED

Implemented **Phase A** of the plan of record `.planning/UX-SEARCH-MEETINGS-PLAN.md`, one atomic
commit per chunk, verified at desktop + 390px, pushed to `main` (auto-deploys to Vercel):

- **A1 — Consultant ecosystem** (`fe0c457`). Added `CONSULTANT` to the `Ecosystem` union +
  `ECOSYSTEM_OPTIONS` (label "Consultant"), all four `ecosystemColors` maps (`bg-teal-100 text-teal-800`),
  and the CSV-import synonym map. **Plan correction:** there is **no server ecosystem allow-list** — the
  `ecosystem` column is a plain passthrough TEXT field with no server-side validation, so A1 was
  client-only. (No schema change, consistent with the plan's "code-only" note.)
- **A2 — Clickable top-bar search** (`dcf2adc`, fixed by `ab3efea`). Desktop top bar now has a real
  **Search** button (with a `Ctrl+K` adornment). **Important behavior:** Ctrl+K **navigates to the full
  `/search` page** (see `command-palette.tsx` ~L62) — it does NOT open the small cmdk command palette.
  The button was first (wrongly) wired to the palette and felt broken; it now does `navigate('/search')`
  to match Ctrl+K and the existing mobile search icon.
- **A3 — One-tap clear** (`dcf2adc`). X clear button on the Search input (touch-sized) and the Meetings
  "Search text" input, shown only when the field is non-empty.
- **A4 — Markdown format-before-typing** (`8f1e1f9`). Fixed `prefixLines` in `markdown-textarea.tsx`:
  an empty/whitespace-only line now **adds** the heading/list prefix and parks the caret right after it
  (previously it read as "already prefixed" and toggled to a no-op).

No schema changes anywhere in Phase A (as predicted). `npm run prepush` + strict client build
(`tsc -b && vite build`) green for every commit.

### What's Next — Phase B of `.planning/UX-SEARCH-MEETINGS-PLAN.md` (search correctness + perf)

Owner asked to pause after Phase A to eyeball it. Resume with **Phase B**, top-to-bottom:

1. **B1 — Participant takeaways surface the *person* card** (`fix(search): participant takeaways surface the person`).
   Per-participant `ConversationParticipant.note` currently matches only as a *meeting* hit; make it also
   match the **contact**. Edits in `server/src/routes/search.ts`: add the clause to `contactClausesFor`
   (peopleNotes), add `participantInConversations: { select: { note }, take: 50 }` to the contact
   `findMany` select (~L218), and push each note as a field labelled `'meeting takeaway'` (weight 1) in
   `collectContactFields`.
2. **B2 — Weighted free-text ranking in Meetings search** (`feat(meetings): weighted free-text ranking + full-field coverage`).
   Expand the `q` box coverage to all meeting fields; when `q` present, fetch a capped superset
   (`take: 300`), score in JS (title=4 > named people=3 > org names + attendees desc=2 > rest=1), sort,
   paginate the ranked array.
3. **B3 — Search perf, the ~20s fix** (`perf(search): lazy related entities + parallel queries`).
   Add `GET /api/search/related/:type/:id`; default `includeRelated` to **false** in `GET /api/search`;
   `Promise.all` the independent top-level queries; collapse the `additionalCompanyIds` per-company
   `findUnique` loop into one `findMany`. Client: stop sending `includeRelated=true`, replace the
   related-count badge with a lazy "Related ▸" expander. Verify via the `[TIMING] search …` log line.

Each task has files, commit message, and a verification step in the plan doc. Then **Phase C** (biggest —
unify on Quick Log: autosave + drop 1:1 anchor + retire the contact-page inline editor), **Phase D**
(meetings calendar), **Phase E** (relabel "Conversations" → "Meetings", UI only).

Process reminders: one atomic commit per chunk; `npm run prepush` **and** a client build (`tsc -b` is
stricter than the typecheck script) + a desktop/390px smoke test before each push; update each task's
STATUS line in the plan doc; owner has standing permission to push to `main`. **No schema changes are
expected anywhere in this plan — flag immediately if you think one is needed.**

### Carry-over items (pre-dating, lower priority)
1. **[USER ACTION]** Set `SENTRY_DSN` / `VITE_SENTRY_DSN` in Vercel (hardening Task 17).
2. **Prod search perf check** — after B3 ships, confirm the prod `[TIMING] search …` line is healthy.
3. NCQA adaptation plan (`.planning/NCQA-ADAPTATION-PLAN.md`): Phase 3 (blocked D8/D9) / Phase 4 (D5/D6). Don't push on D5–D9 until the owner raises them.
4. Desktop-only verifications parked from Phase 7.5 (photo-ZIP CORS vs prod; restore into scratch Turso DB).
5. Replace `resetPrisma()` per-request pattern with a long-lived PrismaClient.
6. Company near-duplicate scan (LinkedIn-variant suffixes).
7. #12 LinkedIn-on-mobile deferred (screenshot→gpt-4o-mini vision is the ready option if revisited).
8. Stray empty `server/dev.db` (gitignored) safe to delete.

### Open Bugs / Known Caveats
- No confirmed bugs. Reminder: the `Favorite` tag is a normal tag and appears in tag dropdowns (by design).
- After Phase C deletions, watch for unused-var build failures — the client **build** (`tsc -b`,
  `noUnusedLocals`) is stricter than the `typecheck` script.
- Phase B touches `server/src/routes/search.ts` and `meetings.ts` — run the **server** typecheck too
  (`npm run prepush` covers both client and server).

### Working branch
`main`, clean and fully pushed. Phase A + the A2 follow-up fix are live (last commit `ab3efea`).

---

### Suggested kickoff prompt for the next session

> Read `CLAUDE.md` / `AGENTS.md`, then `.planning/NEXT-SESSION-PROMPT.md` and the plan of record
> `.planning/UX-SEARCH-MEETINGS-PLAN.md`. Phase A is shipped and live. Implement **Phase B** top-to-bottom:
> B1 (participant takeaways surface the person card) → B2 (weighted Meetings free-text ranking) → B3 (lazy
> related + parallelize, the ~20s search fix). One atomic commit per chunk; before each push run
> `npm run prepush` **and** a client build, and smoke-test at desktop + 390px. For B3, capture the
> `[TIMING] search …` log line before/after to confirm the speedup. Update each task's STATUS line in the
> plan doc. No schema changes are expected — flag immediately if you think one is needed. Pause after
> Phase B so I can eyeball the search behavior before the big Quick Log unification (Phase C).
