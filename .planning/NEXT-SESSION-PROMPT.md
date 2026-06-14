# Next Session Prompt

This file is the handoff document for the next AI session (Claude Code **or** Gemini/Antigravity — the
protocol is agent-agnostic). It summarizes what was just accomplished, what to work on next, and open items.

### What Was Just Completed (2026-06-14, build session) — Actions/Ideas polish batch: 3 of 5 tasks shipped

Plan of record: `.planning/ACTIONS-IDEAS-POLISH-PLAN.md`. Decisions A1/B1/C1 confirmed with owner up
front; D1 was already resolved (and the #6 Baylor handling confirmed = **low-confidence bucket**). Session
had ~half a token budget, so the work was deliberately scoped: **ship the 3 schema-free tasks; do NOT
start the schema-touching one in a constrained budget** (a half-applied migration breaks prod).

- **Task 1 — Markdown formatting in Actions & Ideas** (`6588def`). Swapped the description `<Textarea>`
  for the existing `MarkdownTextarea` in the Action form and the Idea create/edit dialog; Ideas card
  display now renders `ReactMarkdown` + `prep-note-markdown` (Actions detail already did). Descriptions
  only (A1). Verified in-browser: a typed `- ` bullet renders as •.
- **Task 2 — Progressive disclosure on the Action form** (`6588def`, same commit — shared file
  `action-form.tsx`, combined to conserve budget). Type+Priority folded behind a collapsed "More options"
  caret (· indicator when non-default); "Related To" is now a collapsed caret (count indicator). Mirrors
  Quick Log's "Who was there". Create **and** edit (B1); collapsed fields stay in form state so they
  auto-save/submit. Smoke-tested desktop + 390px.
- **Task 4 — Company near-dup LinkedIn variants** (`7723ffb`). Reworked
  [duplicates.ts](../server/src/routes/duplicates.ts) `normalizeCompanyNameForDedupe` + matching:
  punctuation normalize (&→and, hyphen/comma→space, drop apostrophes/diacritics/periods), `healthcare`→
  `health` fold + trailing-descriptor stripping, token-subset match, and a **low-confidence shared-prefix
  bucket** (score 0.5) for #6 Baylor. **Verified against real local data — all 6 owner pairs surface**,
  tiered correctly; FP guards (Mass General H./Brigham, UCSF/UC Berkeley) excluded. Server-only, no schema.

All three commits: `npm run prepush` + `tsc -b` green, smoke-tested, pushed to `main` (live on Vercel).

### What's Next — finish the batch (2 tasks remain), then back to NCQA

1. **Task 3 — Rework "Who owes it" into a people list (SCHEMA-TOUCHING).** This is the clean first pick.
   C1 is confirmed: additive `Action.owedByMe` (bool, default 1) + `Action.owerContactIds` (JSON), with
   `direction` kept **derived**. **The plan now has an explicit DDL-FIRST safe sequencing** (apply the two
   additive `ADD COLUMN`s + the backfill to Turso *before* writing/pushing code, so prod is safe at every
   checkpoint) — follow it. See Task 3 STATUS in `ACTIONS-IDEAS-POLISH-PLAN.md`. The rw Turso token in
   `server/.env` is commented but present (JWT has no `exp` → expected valid); uncomment per the NCQA-plan
   DDL procedure. NOTE: Task 2 left the old "Who owes it" `direction` Select visible/standalone on the
   form — Task 3 replaces it and tucks it into a collapsed disclosure.
2. **Task 5 — Long-lived PrismaClient** (retire per-request `resetPrisma()`). Last / its own session;
   carries real serverless risk — must verify against the live deploy after an idle period before done.
3. **After the batch ships, the standing plan of record returns to the NCQA adaptation plan**
   (`.planning/NCQA-ADAPTATION-PLAN.md`, Phase 3+) — gated on D5–D9. **Don't push on D5–D9 until the
   owner raises them.**

### Carry-over items (pre-dating, lower priority)
1. **[USER ACTION]** Set `SENTRY_DSN` / `VITE_SENTRY_DSN` in Vercel (hardening Task 17).
2. NCQA adaptation plan: Phase 3 (blocked D8/D9) / Phase 4 (D5/D6). Don't push on D5–D9 until raised.
3. #12 LinkedIn-on-mobile deferred (screenshot→gpt-4o-mini vision is the ready option if revisited).
4. Stray empty `server/dev.db` / `server/test.db` (gitignored) safe to delete.

### Open Bugs / Known Caveats
- No confirmed bugs. **Transient UI state:** after Task 2, the Action form's old "Who owes it" `direction`
  Select sits as a lone visible field in the Action Info card — intentional; Task 3 removes/relocates it.
- Company dedup is review-then-merge: the new low-confidence shared-prefix bucket (score 0.5, "review")
  can surface distinct same-parent entities with a long shared prefix (e.g. UC San Francisco vs UC San
  Diego) — by design (owner chose recall for Baylor). High-confidence matches sort first.
- The `tsc -b` build (`noUnusedLocals`) remains the gate that catches unused imports the `typecheck`
  script misses — run it (not just `npm run prepush`) before every push.
- Dev smoke-testing note: the chrome-devtools-mcp automation profile can get orphaned/locked; if a
  navigate/list_pages call errors with "browser is already running", stop the stale `chrome.exe`
  processes whose command line contains `chrome-devtools-mcp` (they use the dedicated `.cache` profile,
  NOT the owner's daily Chrome). Local app has no `APP_PASSWORD`, so the login gate accepts any password
  (pre-seed `localStorage.searchbook_password`).

### Working branch
`main`, clean and fully pushed. This session: `6588def` (Tasks 1+2), `7723ffb` (Task 4). Both live on Vercel.

---

### Suggested kickoff prompt for the next session

> Read `CLAUDE.md` / `AGENTS.md`, then this file, then **`.planning/ACTIONS-IDEAS-POLISH-PLAN.md`** (still
> the plan of record — Tasks 1/2/4 shipped 2026-06-14; **Tasks 3 & 5 remain**). Start with **Task 3
> (rework "Who owes it" into a people list)** — it's SCHEMA-TOUCHING and C1 is already confirmed (additive
> `owedByMe` + `owerContactIds`, `direction` derived). **Follow the DDL-FIRST safe sequencing in the
> Task 3 STATUS block** — apply the two additive `ADD COLUMN`s + backfill to Turso *before* writing/pushing
> code, so prod stays safe if you run low. Then Task 5 (long-lived PrismaClient — its own session, verify
> live). One atomic commit per task; `npm run prepush` **and** `tsc -b` + desktop/390px smoke test before
> each push. After the batch, the standing plan of record returns to the NCQA adaptation plan (Phase 3+,
> gated on D5–D9 — don't push on those until the owner raises them). Standing owner action: set
> `SENTRY_DSN`/`VITE_SENTRY_DSN` in Vercel.
