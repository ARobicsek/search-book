# SearchBook — Actions/Ideas Polish + Engineering Cleanup

**Created:** 2026-06-14 (for the **next** session)
**Status:** IN PROGRESS — **Tasks 1, 2, 4 SHIPPED 2026-06-14** (commits `6588def`, `7723ffb`).
**Tasks 3 & 5 remain** (both deliberately deferred — see below). After they ship, the standing plan
of record returns to `.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+, gated on D5–D9).

> **Deferral note (2026-06-14):** the build session had ~half a token budget. Tasks 1/2/4 (schema-free,
> self-contained) were completed and pushed. **Task 3 was NOT started on purpose** — it is the only
> schema-touching task, and a half-applied schema migration (code pushed without the Turso DDL, or vice
> versa) breaks prod, which is the exact "run out mid-task" risk the owner flagged. It is fully specified
> (C1 confirmed) and is the clean first pick next session. Task 5 was always its own session.
**Origin:** owner request (2026-06-14) — three small UX fixes for Actions/Ideas, plus two carried-over
engineering items (company near-duplicate LinkedIn variants; long-lived PrismaClient) pulled in here.

## House rules (same as every session)
- One **atomic commit per task** (GSD). `npm run prepush` **and** `tsc -b` (the client build catches unused
  imports `typecheck` misses) green before each push. Re-test **mobile 390px** for every UI change.
- Owner has standing permission to push to `main` (auto-deploys to Vercel).
- **Task 3 is schema-touching** → follow the Turso DDL procedure at the top of
  `.planning/NCQA-ADAPTATION-PLAN.md` (backup → local `db push` → DDL against Turso → only then push code).
  Tasks 1, 2, 4, 5 are **schema-free**.

## Decisions to confirm at session start
| # | Decision | Recommendation |
|---|----------|----------------|
| A1 | Formatting (Task 1) applies to the **description** fields of Actions & Ideas only (titles stay plain). | ✅ **CONFIRMED** — descriptions only |
| B1 | Progressive disclosure (Task 2) applies to **both** create *and* edit Action screens, or create only? | ✅ **CONFIRMED** — both |
| C1 | **"Who owes it" data model (Task 3)** — reuse the `direction` enum vs. add a real owers list (see Task 3). | ✅ **CONFIRMED** — additive `owedByMe` bool + `owerContactIds` JSON, keep `direction` *derived* |
| D1 | Company dedup (Task 4): real example pairs to tune against. | ✅ **RESOLVED + CONFIRMED** — 6 pairs; #6 Baylor = **low-confidence bucket** (owner chose to surface it) |

## Suggested ordering
1 (formatting — tiny, isolated) → 2 (disclosure — UI only) → 3 (who-owes-it — schema-touching, highest
value) → 4 (company dedup — needs examples) → 5 (PrismaClient — do last or as its own session; prod risk).

---

## Task 1 — Markdown formatting in Actions & Ideas (like meeting logs)
**Ask:** "Use formatting (H3, bold, etc.) in Actions and Ideas just as in meeting logs."
**Current state:**
- The reusable editor already exists: [MarkdownTextarea](../client/src/components/markdown-textarea.tsx)
  (H3/bold/italic/bullets/numbered toolbar + shortcuts + image paste/drag). Used in meeting logs.
- **Actions:** editor is a plain `<Textarea>` ([action-form.tsx:388-397](../client/src/pages/actions/action-form.tsx#L388)).
  **Display already renders markdown** via `ReactMarkdown` + `prep-note-markdown`
  ([action-detail.tsx:255-256](../client/src/pages/actions/action-detail.tsx#L255)) — so only the editor needs swapping.
- **Ideas:** editor is a plain `<Textarea>` ([idea-list.tsx:401-404](../client/src/pages/ideas/idea-list.tsx#L401));
  display is **raw text** ([idea-list.tsx:346-351](../client/src/pages/ideas/idea-list.tsx#L346)) — needs *both*
  the editor swap **and** a `ReactMarkdown`+`prep-note-markdown` render.
**Approach:** swap the two `description` `<Textarea>`s for `<MarkdownTextarea>`; wrap the Ideas description
display in `ReactMarkdown`. Verify image paste/drag works (uses `api.uploadFile`, already wired).
**Files:** action-form.tsx, idea-list.tsx (+ confirm action-detail needs no change).
**STATUS:** ✅ DONE 2026-06-14 (commit `6588def`). MarkdownTextarea swapped into both description editors;
Ideas display now renders ReactMarkdown + prep-note-markdown (verified: a `- ` bullet renders as •).
action-detail needed no change. Smoke-tested desktop + 390px. *(Combined with Task 2 in one commit —
shared file action-form.tsx — to conserve session budget.)*

## Task 2 — Progressive disclosure on the Action form
**Ask:** on the Action create screen, hide **Type**, **Priority**, and the **Related To** elements behind a
caret (the Meetings-log progressive-disclosure pattern). Keep Title, Description, Due Date visible.
**Pattern to mirror:** Quick Log "Who was there — collapsed by default" — a `showWho` `useState` + a button
toggling `ChevronDown`/`ChevronRight` ([quick-log-dialog.tsx:836-843](../client/src/components/quick-log-dialog.tsx#L836)).
**Current state:** Type ([action-form.tsx:399-413](../client/src/pages/actions/action-form.tsx#L399)) and Priority
([415-429](../client/src/pages/actions/action-form.tsx#L415)) sit in the always-visible "Action Info" card;
"Related To" (Contacts/Companies) is its own always-visible card
([510-541](../client/src/pages/actions/action-form.tsx#L510)). Both have sensible defaults (`OTHER`, `MEDIUM`)
so hiding is safe.
**Approach:** wrap Type+Priority and the Related-To content in collapsible sections (chevron toggles,
collapsed by default). Mind autosave in edit mode (collapsed fields must still submit). Apply per B1.
**Files:** [action-form.tsx](../client/src/pages/actions/action-form.tsx).
**STATUS:** ✅ DONE 2026-06-14 (commit `6588def`). Type+Priority folded behind a collapsed "More options"
caret (· indicator when non-default); "Related To" card is now a collapsed caret (count indicator).
Mirrors Quick Log's "Who was there". Applies to create **and** edit; collapsed fields stay in form state
so they auto-save/submit. Title/Description/Due Date stay visible. Smoke-tested desktop + 390px.

## Task 3 — Rework "Who owes it" into a people list (SCHEMA-TOUCHING)
**Ask:** "Who owes it" should **default to 'me'**, let me **remove 'me'** and **add 0…N contacts**, support
**favorites quick-add** (as elsewhere), and be **collapsed by default**.
**Current state:** "Who owes it" is a 2-value `direction` enum Select — `OWED_BY_ME` / `OWED_TO_ME`
([action-form.tsx:431-445](../client/src/pages/actions/action-form.tsx#L431)). `direction` powers the dashboard
"Waiting on others" card + `?filter=waiting` + analytics (NCQA Task 1.4). Favorite-contacts quick-add already
exists (`GET /contacts/favorites`, chip UI in Quick Log).
**Decision C1 — how to model owers:**
- **Recommended:** additive, low-risk DDL — add `Action.owedByMe` (boolean, default 1) + `Action.owerContactIds`
  (JSON array of contact ids, mirrors `Contact.additionalCompanyIds`). Both are safe single `ADD COLUMN`
  statements (no table rebuild). **Keep `direction` as a *derived* mirror** (`owedByMe && owerContactIds empty`
  → `OWED_BY_ME`; else `OWED_TO_ME`) so the dashboard/analytics keep working unchanged.
- Alternative (no schema): reuse `direction` + the existing related-contacts list — rejected: conflates
  "related to" with "who owes it," and can't represent "me **and** specific people."
**Approach (after C1):** new "Who owes it" disclosure (collapsed) with a removable **me** chip + a contacts
MultiCombobox + favorite-contact quick-add chips (reuse the Quick Log favorites pattern). On save, set
`owedByMe`/`owerContactIds` and derive `direction`. Backfill existing rows → `owedByMe` from current
`direction`. Update server `/actions` create+update to accept/persist the new fields.
**Files:** schema.prisma (+ Turso DDL), [server/src/routes/actions.ts](../server/src/routes/actions.ts),
[action-form.tsx](../client/src/pages/actions/action-form.tsx), [lib/types.ts](../client/src/lib/types.ts);
verify dashboard/analytics still read `direction`.
**STATUS:** NOT STARTED — **deferred to next session** (token budget; schema task = worst to leave
half-done). C1 confirmed (additive `owedByMe` + `owerContactIds`, `direction` derived).
**Safe sequencing to use next session (protects prod at every checkpoint):**
1. Back up (see NCQA plan top). 2. **Apply the Turso DDL FIRST** — both are additive `ADD COLUMN`, so
   prod stays compatible even before any code ships: `ALTER TABLE "Action" ADD COLUMN "owedByMe" BOOLEAN
   NOT NULL DEFAULT 1;` and `ALTER TABLE "Action" ADD COLUMN "owerContactIds" TEXT;` (JSON string array).
   Then backfill: `UPDATE "Action" SET "owedByMe" = 0 WHERE "direction" = 'OWED_TO_ME';`
   (the rw token in `server/.env` is commented out but present; JWT has no `exp` → expected valid).
3. Mirror in schema.prisma + local `db push` + `npx prisma generate`. 4. Server `/actions` create+update
   accept/persist the two fields and **derive** `direction = (owedByMe && owerContactIds empty) ?
   'OWED_BY_ME' : 'OWED_TO_ME'`. 5. Client: rework "Who owes it" into a collapsed people list (removable
   *me* chip default-on, contacts MultiCombobox, favorite-contact quick-add chips — reuse the Quick Log
   favorites pattern already in this file's Task 2 area). 6. Verify dashboard "Waiting on others" +
   `?filter=waiting` + analytics still read `direction`. 7. Smoke desktop+390px. **8. Push code LAST**
   (DDL already applied). Note: the form's "Who owes it" Select is currently still visible/standalone
   (Task 2 left it in place); this task replaces it and tucks it into a collapsed disclosure.

## Task 4 — Company near-duplicate scan: catch LinkedIn-style variants
**Ask:** the Duplicates page misses company near-dupes that differ by LinkedIn-style descriptor words.
**Current state:** [duplicates.ts:370](../server/src/routes/duplicates.ts#L370) (`GET /api/duplicates/companies`)
normalizes via [normalizeCompanyNameForDedupe](../server/src/routes/duplicates.ts#L361) — strips only **legal**
suffixes (`Inc/LLC/Corp/Ltd/Co/L.P.`) then Levenshtein > 0.85. Misses extra-token variants ("CVS" vs
"CVS Health", "Providence" vs "Providence Health & Services") and LinkedIn cruft (" | LinkedIn", region/size
descriptors) that push names below 0.85.
**Owner's real example pairs (the test set, 2026-06-14)** — each should surface on the Duplicates page:
| # | Pair | Pattern it exercises |
|---|------|----------------------|
| 1 | Arcadia / Arcadia **Institute** | appended descriptor token → token-subset |
| 2 | Centers for Medicare **&** Medicaid **Services** / Centers for Medicare **and** Medicaid | `&`↔`and` + dropped trailing "Services" |
| 3 | Boston Children's Hospital / Boston Children's Hospital **CHIP** | appended acronym + apostrophe → token-subset |
| 4 | Dana **Farber** Cancer Institute / Dana**-**Farber Cancer Institute | hyphen↔space (punctuation only) |
| 5 | Intermountain **Health** / Intermountain **Healthcare** | descriptor word variant ("Healthcare"→"Health"); ~0.83 sim today, just under 0.85 |
| 6 | Baylor Scott & White **Health** / Baylor Scott & White **Research Institute** | shared 4-token core, **divergent** tails ⚠ |

**Rules these imply (recommended, in order of safety):**
1. **Punctuation/symbol normalization** in `normalizeCompanyNameForDedupe`: lowercase, `&`→`and`, hyphen→space,
   strip apostrophes/diacritics, collapse whitespace. Catches #2 (`&`/`and`) and #4 (hyphen).
2. **Descriptor normalization / stripping**: fold a curated descriptor set (`Healthcare`→`Health`; strip trailing
   `Institute / Research / Services / System(s) / Center(s) / Hospital / Group / Foundation` + the existing legal
   suffixes) so the *core* name compares. Catches #5, and helps #1/#2/#3.
3. **Token-subset match** ported from the contact path ([duplicates.ts:66-74](../server/src/routes/duplicates.ts#L66)):
   if one name's tokens ⊆ the other's, flag it. Catches #1 and #3 (and, in your data, "University of Washington" ⊆
   "University of Washington, Seattle"). **Safe** — it does *not* match two names with divergent tails.
**⚠ The trap (#6):** Baylor "Health" vs "Research Institute" share a core but have *different* tails, so token-subset
won't catch it. The only thing that would is a looser **shared-prefix** rule — but that *also* fires on legitimately
**distinct** same-parent entities ("University of California, San Francisco" vs "…, Berkeley"; "Mass General Hospital"
vs "Mass General Brigham"), flooding the page with false positives. **Recommendation:** ship rules 1–3 (catch #1–#5)
and treat #6 as a *separate, lower-confidence* bucket (or out of scope for v1) rather than lowering the global
threshold. Confirm with owner whether the extra recall on #6 is worth the false-positive risk.
**First step next session:** run the *current* `/api/duplicates/companies` against prod data to see which of #1–#6
already match vs. miss — then add only the rules needed. The page is review-then-merge, so favor **recall**, but keep
#6-style shared-prefix matches clearly ranked as low-confidence.
**Files:** [server/src/routes/duplicates.ts](../server/src/routes/duplicates.ts) (isolated; no schema change).
**STATUS:** ✅ DONE 2026-06-14 (commit `7723ffb`). New `normalizeCompanyPunctuation` (&→and,
hyphen/slash/comma→space, drop apostrophes/diacritics/periods), `healthcare`→`health` fold + trailing
descriptor stripping in the core normalizer, token-subset match (punctuation-only form, reuses
`tokensMatch`), and a low-confidence shared-prefix bucket (≥3 non-stopword shared leading tokens,
score 0.5). **Verified against real local data: all 6 owner pairs surface** — #1/#2/#4/#5 "Same core
name" [1.0], #3 "One name contains the other" [0.9], #6 Baylor "Shared prefix — low confidence" [0.5];
FP guards (Mass General H./Brigham, UCSF/UC Berkeley, Baylor/College of Medicine) correctly excluded.

## Task 5 — Long-lived PrismaClient (retire per-request `resetPrisma()`)
**Ask:** stop rebuilding a `PrismaClient` + libsql adapter on every request in production.
**Current state:** [server/src/db.ts:32-48](../server/src/db.ts#L32) — middleware in `app.ts` calls
`resetPrisma()` per request (prod only), which runs `_client = createPrismaClient()`; a `Proxy` forwards
route code to the current client. Added deliberately to dodge **stale libsql HTTP connections** on warm
Vercel instances.
**Approach:** reuse one client; recreate only on an actual connection error (catch + one retry with a fresh
client), or rely on adapter pooling. Keep the `Proxy` indirection so route code is untouched.
**Risk (why it's last / maybe its own session):** the per-request pattern fixed a **real serverless bug**.
Naive reuse can reintroduce stale-connection 500s that surface only on Turso-on-Vercel, **not** local SQLite.
Must verify against the live deploy (hit endpoints after an idle period) before calling it done.
**Files:** [server/src/db.ts](../server/src/db.ts), middleware in [server/src/app.ts](../server/src/app.ts).
**STATUS:** Not started.

---

## Out of scope / not in this batch
- Sentry DSN activation (carry-over #1, **owner action** — set `SENTRY_DSN`/`VITE_SENTRY_DSN` in Vercel).
- NCQA Phase 3+ (gated on D5–D9).
