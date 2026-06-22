# Next Session Prompt

Rolling handoff for the next AI session (Claude Code **or** Gemini/Antigravity — protocol is
agent-agnostic, see `AGENTS.md`). Keep this file **lean**: a short "just completed", "what's next",
carry-overs, open bugs, and a kickoff prompt. Per-session detail goes in `SESSION-HISTORY.md`, not
here.

### What Was Just Completed — CSV import "Reports To" relationships (2026-06-22)

One owner ask, **schema-free, verified live, pushed to `main`**. Extends last session's enrich import.

**Problem:** owner had a 2-column org-chart CSV (`Name`, `Reports To (1-up)` — e.g. `qmrg_1up_reporting.csv`)
and wanted the enrich import to turn the manager column into a **`REPORTS_TO` relationship** between
contacts.

**Built — `reportsTo` support on the existing `POST /api/contacts/import-match`:**
- Each row may now carry a **`reportsTo`** (manager name); the call also carries a **`defaultEcosystem`**.
  After each subject is matched/created, the manager is resolved via the same case-insensitive name
  index (match existing, else **create a bare contact**, indexed so repeats de-dup) and a **`REPORTS_TO`
  relationship** is created `subject → manager` (matches the `[from] reports to [to]` UI direction).
  - **Idempotent** — pre-loads all existing `REPORTS_TO` pairs + a per-run set; never duplicates.
  - Blank / **"Not found"** / self-reference → **no relationship**.
  - Ambiguous manager (name matches >1 existing) → skipped + reported.
  - **`dryRun`** predicts everything via negative **synthetic ids** (one code path, no writes) so the
    preview shows relationships-to-create + the new-manager names.
- Dialog (`client/src/components/csv-import-dialog.tsx`): a **"Reports To (manager)"** field mapping
  (+ header aliases incl. `reports to (1-up)`); **mapping a Reports-To column auto-routes through the
  match endpoint** so subjects + managers de-dup (no duplicates); a new **"Ecosystem for new contacts"**
  picker (default General Network — set NCQA Internal for internal org charts); the preview adds a
  relationship/new-manager summary that **surfaces name-form near-dups** ("Josie Granner" vs
  "Josephine (Josie) Granner"); apply toast + button label include relationship counts.

Verified end-to-end: server via a throwaway script (dry-run on the real 60-row `qmrg_1up_reporting.csv`
= **57 relationships** [= 60 − 3 "Not found"], 14 managers created, 0 ambiguous, 0 errors; real-write
test asserted direction + ecosystem + idempotent re-run + not-found/self skips, then cleaned up its 2
test contacts + relationship); full browser flow (chrome-devtools, desktop + 390px) — auto-mapped,
ecosystem→NCQA Internal, preview "57 rel / 14 new managers"; closed without applying so the dev DB was
untouched. `prepush` + full client build green. **Schema-free** (`Relationship`/`REPORTS_TO` already
existed → no Turso DDL).

**Owner note (data hygiene) — ✅ RESOLVED 2026-06-22:** the import matches names **exactly**
(case-insensitive), so short/long forms are treated as different people. The production dry-run
flagged near-duplicate **manager** names that would have created spurious new contacts (e.g.
"Vivek Garg" vs existing "Vivek (Viv-ACHE) Garg"; "Keirsha (KEER-shuh) Thompson" vs existing
"...Tompson"; plus "Josie Granner" vs "Josephine (Josie) Granner"). **The owner normalized those
manager cells in the CSV so they resolve to the existing contacts** — no spurious new-manager dupes.
(General reminder for future imports: this is inherent to exact-name matching; normalize name forms
in the CSV up front, or merge dupes afterward.)

### What's Next

1. **★ PRIMARY (owner ask, 2026-06-22): any-field enrich import — "fill blanks only."** Today the
   match-by-name path only enriches existing contacts with **email** (+ the new reports-to
   relationship); every other mapped column is ignored for matched contacts (the no-clobber rule).
   Extend it so a CSV can fill **any** mapped field on an existing contact — **but only when that
   field is currently empty; never overwrite curated data** (owner decision via AskUserQuestion:
   *fill blanks only* — NOT per-column toggles, NOT a global overwrite mode, for v1).
   - **Server** (`POST /api/contacts/import-match`, the `matches.length === 1` branch in
     `server/src/routes/contacts.ts`): replace the email-only merge with a **fill-blanks patch
     builder** — for each mapped scalar field present in the row AND empty/null on the matched
     contact, include it. Email keeps its existing additive merge (`buildEmailMerge` → primary if
     empty else `additionalEmails`, deduped) — unchanged. Apply to the free-text/scalar set
     (`title, roleDescription, phone, linkedinUrl, location, howConnected, mutualConnections,
     whereFound, openQuestions, notes, personalDetails`). Patch empty → action `skip`; non-empty →
     `update`. **Still never touches a non-empty field.**
   - **Sub-decisions to settle next session (recommended defaults in parens):** company —
     fill `companyId` only when the contact has **no** current employer, via `resolveCompany`
     (don't append a 2nd employer in v1); `ecosystem`/`status` — **exclude** from fill (create-time
     only; no real "blank" for ecosystem, and `status` blank = the `NONE` sentinel); `notes`/
     `personalDetails` — **fill-only**, not append (append could be a later option).
   - **Preview/UX:** the client already maps every field and `buildRowData` already sends them all,
     so the work is mostly server + dry-run reporting. Improve the dry-run to report **which/how
     many fields would be filled** (e.g. relabel "Add email to existing" → "Enrich existing (fill
     blanks)" and show a blank-fields-filled count, ideally a small per-row/field breakdown). Keep
     the 3-card shape; reports-to summary stays.
   - **Schema-free** (same endpoint, additive logic). Verify like this session: throwaway server
     script (fill-a-blank, leave-non-blank-untouched, idempotent re-run) + chrome-devtools desktop
     + 390px; clean up test rows; `prepush` + full client build.
2. Plan of record is **`.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+)**. Check the **"⏳ Waiting on
   owner"** block — **D5/D6/D8/D9**. Phase 3 (stakeholder intel) is gated on D8/D9; Phase 4 (Copilot
   AI ingest) on D5/D6. Don't push on those until the owner raises them.
3. **Option B (when wanted):** attendee auto-fill via Microsoft Graph or Power Automate — implement a
   second `CalendarProvider`; nothing downstream changes.
4. **@-mention follow-up (optional):** add a command-palette entry for the Mentions page. (Prep-note
   `@` and org `@` are now done.)

### Carry-over items (lower priority)

1. **[USER ACTION]** Set `SENTRY_DSN` / `VITE_SENTRY_DSN` in Vercel to activate error tracking.
2. NCQA adaptation plan: Phase 3 (blocked D8/D9) / Phase 4 (D5/D6).
3. Stray empty `server/dev.db` / `server/test.db` (gitignored) safe to delete locally.
4. **"Recently updated" merge-bump** fix is forward-only — meetings a *past* contact-merge already
   stamped stay near the top; a one-off reset would also wipe genuine edit timestamps, so confirm
   criteria first.
5. **`updatedAt` under-bumping:** `Conversation.updatedAt` only bumps on edits to the meeting
   row/junctions, not isolated child-record edits (prep note / attachment). Bump it in those routes
   if "Recently updated" should float a meeting on those too.
6. **Mixed `updatedAt`/`createdAt` text formats in the DB** (some rows `...Z`, some `...+00:00`, some
   `YYYY-MM-DD HH:MM:SS`) — left as-is; the concurrency guard no longer cares (compares in app code).
   But **don't add exact `DateTime` equality `where` filters** on those columns (range `gte`/`lt` is
   fine); see the CLAUDE.md gotcha. A one-off normalize-to-`+00:00` is possible later but unneeded.

### Open Bugs / Known Caveats

- **Non-issue (closed): "perpetual browser busy-spinner" was NOT the app.** Owner reported a
  never-stopping loading cursor after the tags-in-search work; suspected a Turso query hang. Ruled
  out: local dev reproduces nothing (`readyState: complete`, zero pending/looping requests; SW is
  active in dev too). Owner then isolated it — the spinner tracks with **VS Code being open** and
  **persists with the browser fully closed** (Task Manager-confirmed). So it's a local VS Code /
  agent-harness artifact (debug-driven Chrome / MCP / extension activity), **not SearchBook and not
  the search change**. No code change. Don't re-chase this as an app bug.
- **⚠ The committed Turso rw token in `server/.env` is STALE (hard 401).** Use the Turso web SQL
  console for DDL.
- **⚠ `prisma db push` local-path gotcha:** from `server/`, `db push` resolves `file:./dev.db` to
  the stray empty `server/dev.db`, not the populated `server/prisma/dev.db` the server opens. Use a
  dual-mode libsql `file:` migration script (pattern preserved in `server/scripts/archive/`) instead.
- Run `tsc -b` / full `vite build` (not just `npm run prepush`) before every push — it catches
  unused imports the typecheck misses.
- Dev smoke: server 3001, client 5173. The local app has `APP_PASSWORD` unset → seed any non-empty
  `localStorage.searchbook_password` ('devlocal' works) to pass the login gate. Device-emulation
  `390x844` gives a true mobile viewport.

### Working branch

`main` — this session adds one schema-free commit pushed to `main`: CSV import "Reports To"
relationships (extends the enrich import). **Nothing pending** — no Turso DDL needed, no held commits.

---

### Suggested kickoff prompt for the next session

Durable version (works every session — it defers to the docs, which stay current):

> Start a SearchBook session: read `AGENTS.md` and follow its "Session start" steps, then summarize
> where we left off and what's next before doing anything.

Context for *this* upcoming session specifically: last session shipped one schema-free owner ask —
**CSV import "Reports To" relationships**: the enrich import (`POST /api/contacts/import-match`) now
accepts a per-row `reportsTo` (manager name) and turns it into a `REPORTS_TO` relationship
`subject → manager`, resolving/creating both contacts by name (idempotent; blank/"Not found"/self →
no relationship; ambiguous manager skipped). The dialog gained a "Reports To (manager)" mapping (which
auto-routes through the match endpoint) and an "Ecosystem for new contacts" picker. Nothing is left
pending (no Turso DDL, no held commits).

**The agreed primary task for next session** (see "What's Next" #1): extend the same enrich import so
a CSV can fill **any** mapped field on an existing contact — **fill blanks only, never overwrite**
(owner decision) — not just email + the reports-to relationship. Schema-free; design + sub-decisions
are spelled out in "What's Next." Plan of record otherwise stays `.planning/NCQA-ADAPTATION-PLAN.md`
(Phase 3+, gated on the "⏳ Waiting on owner" block, D5/D6/D8/D9).
