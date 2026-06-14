# SearchBook — Actions/Ideas Polish + Engineering Cleanup

**Created:** 2026-06-14 (for the **next** session)
**Status:** PLANNED — not started. This is the **plan of record for the next session's batch.**
After it ships, the standing plan of record returns to `.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+,
gated on D5–D9).
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
| A1 | Formatting (Task 1) applies to the **description** fields of Actions & Ideas only (titles stay plain). | Yes — descriptions only |
| B1 | Progressive disclosure (Task 2) applies to **both** create *and* edit Action screens, or create only? | Both, for consistency |
| C1 | **"Who owes it" data model (Task 3)** — reuse the `direction` enum vs. add a real owers list (see Task 3). | Additive columns: `owedByMe` bool + `owerContactIds` JSON, keep `direction` *derived* for the dashboard |
| D1 | Company dedup (Task 4): owner provides **2–3 real example company pairs** that *should* be flagged as dupes but currently aren't. | Needed to pin the variant patterns |

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
**STATUS:** Not started.

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
**STATUS:** Not started.

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
**STATUS:** Not started. **Schema migration required — run Turso DDL before pushing code.**

## Task 4 — Company near-duplicate scan: catch LinkedIn-style variants
**Ask:** the Duplicates page misses company near-dupes that differ by LinkedIn-style descriptor words.
**Current state:** [duplicates.ts:370](../server/src/routes/duplicates.ts#L370) (`GET /api/duplicates/companies`)
normalizes via [normalizeCompanyNameForDedupe](../server/src/routes/duplicates.ts#L361) — strips only **legal**
suffixes (`Inc/LLC/Corp/Ltd/Co/L.P.`) then Levenshtein > 0.85. Misses extra-token variants ("CVS" vs
"CVS Health", "Providence" vs "Providence Health & Services") and LinkedIn cruft (" | LinkedIn", region/size
descriptors) that push names below 0.85.
**Approach (after D1 examples):** extend normalization (strip LinkedIn descriptors/trailing cruft) and/or add a
**token-subset** rule like the contact dedup already uses
([duplicates.ts:66-74](../server/src/routes/duplicates.ts#L66)), so "X" ⊆ "X Health" matches. Tune against the
owner's real example pairs; keep the merge flow unchanged.
**Files:** [server/src/routes/duplicates.ts](../server/src/routes/duplicates.ts) (isolated; no schema change).
**STATUS:** Not started. **Blocked on D1** (example pairs).

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
