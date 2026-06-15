# Next Session Prompt

This file is the handoff document for the next AI session (Claude Code **or** Gemini/Antigravity — the
protocol is agent-agnostic). It summarizes what was just accomplished, what to work on next, and open items.

### What Was Just Completed (2026-06-15) — Four owner asks across two areas (all schema-free, PUSHED)

All shipped to `main` (remote = `7f450c6`) and live on Vercel. Two doc commits along the way
(`b886353`, `5929045`).

**Ideas + Contacts (`5314aad`, `dacdeaa`):**
- **`5314aad` fix(ideas) — screenshots no longer stretch collapsed Idea cards.** Pasted
  screenshots (markdown images) were rendering full-size inside collapsed cards, ballooning height
  (a 2-shot card grew ~300px → ~960px). Collapsed cards now hide images (`[&_img]:hidden`) on top of
  the existing 4-line text clamp and show a small "N screenshots — click to view" hint; expanding
  still shows the full markdown with full-size images. [client/src/pages/ideas/idea-list.tsx]
- **`dacdeaa` feat(contacts) — connecting a contact promotes their employer org to Connected.**
  When a contact becomes CONNECTED (created connected, status changed via `PUT /contacts/:id`, or
  linked as EMPLOYED via `POST /companies/:id/contacts`), the org(s) they **currently** work at flip
  to company status CONNECTED. Guard: only promotes from NONE/RESEARCHING — never downgrades
  ENGAGED/PARTNER/CONNECTED; past employers (`isCurrent=false`) skipped; records a
  `CompanyStatusHistory` row. New shared helper [server/src/company-status.ts] (no schema change).

**Quick Log meeting dialog (`4ea562c`, `7f450c6`) — all in [client/src/components/quick-log-dialog.tsx]:**
- **`4ea562c` feat(meetings) — Summary collapsed + autosaving, editable prep notes.** (1) Summary is
  now behind a caret (like "Who was there"/"Actions…"), auto-expanded in edit mode if a summary
  exists. (2) Prep notes autosave as you type — the composer POSTs the draft on the first pause then
  PUTs further edits (no "Add prep note" click); "+ New note" starts a fresh one; saves are serialized
  and flushed on blur + on Done (no lost keystrokes, never double-creates). (3) Saved prep notes are
  inline-editable. Added an optional `onBlur` to `MarkdownTextarea`. The side-by-side prep panel is now
  **desktop-only** (new `useIsDesktop` matchMedia hook); on mobile the prep list+composer render
  full-width in the form (the "Actions, prep…" section auto-expands in edit mode when notes exist).
- **`7f450c6` fix(meetings) — formatted prep notes + resize-drag no longer closes the dialog.**
  (1) Saved prep notes now render **formatted markdown** by default; click the body or the pencil to
  edit in place (raw md textarea, still autosaving), ✓/blur to return. Pencil uses
  mousedown-preventDefault so the toggle doesn't race the blur. (2) Dragging the prep/form divider was
  **closing the dialog** — root cause: react-resizable-panels' native pointerdown handler pre-empts
  Radix's "inside" marker, so Radix mis-read the handle as an *outside* interaction (`content.contains
  (handle)` is true, yet it dismissed on pointerdown). Fixed with an `onInteractOutside` guard that
  ignores interactions originating in `[data-slot="resizable-handle"]` / `resizable-panel-group`
  (genuine backdrop clicks still close it).

**Verification:** Contacts/company logic API-tested e2e on local SQLite (promote RESEARCHING→CONNECTED;
PARTNER not downgraded; create-as-connected promotes; current employer promoted, past one not). Ideas
fix in-browser desktop + true 390px mobile (collapsed 306px w/ images hidden + "2 screenshots" hint;
expanded 958px). Quick Log verified in-browser: Summary caret reveals; prep note autosaved with no
"Add" click; editing a note PUTs (no dup); "New note" commits + fresh composer POSTs a 2nd; Done
flushes without dup; edit-mode reopen loads notes editable; mobile 390px single-column (notes 266px
vs cramped ~110px before); formatted render (UL/LI/STRONG/H3) with pencil↔textarea toggle; **real CDP
mouse drag** of the divider keeps the dialog open and resizes the panel. All test data deleted after.
`npm run prepush` + `tsc -b` (client + server) + full `vite build` green throughout.

### What Was Completed (2026-06-14) — Minor UI Improvements batch (9 tasks)

Plan `.planning/UI-IMPROVEMENTS-PLAN.md` — **all 9 tasks built + verified** (desktop + true 390px mobile via
device emulation). Four commits:

- **`2b88669` (Tasks 1, 3, 5) — Calendars, schema-free, PUSHED.** Actions page now has a **List/Calendar
  view toggle** (`?view=calendar`), mirroring Meetings; the standalone **Calendar left-bar item + `/calendar`
  route are gone** (`/calendar` redirects to `/actions?view=calendar`). `calendar.tsx`'s page became a reusable
  `<ActionsCalendar>` embedded in the Actions page. Waiting-on-someone actions show a **⏳ title prefix + a
  native "Waiting on: <names>" hover tooltip** (owerContactIds → `/contacts/names`). Both the Meetings **and**
  Actions calendars now **blank FullCalendar's mobile "all-day" label** (`allDayText=""`).
- **`18f7b69` (Tasks 2, 4) — Actions form, schema-free, PUSHED.** "Who owes it" → **"Who owns it"** (+ chip/
  placeholder/helper + the dashboard waiting-card copy); internal `owedByMe`/`OWED_BY_ME`/`WAITING_ON_THEM`
  unchanged. Added a **star-toggle next to each selected ower** to mark/unmark them a favorite in-context
  (`PATCH /contacts/:id/favorite`), mirroring the company star-toggle in Ideas.
- **`88ef0a6` (Task 9, Quick Log) — schema-free, PUSHED.** Quick Log dialog is **drag-resizable on desktop**.
- **`cce0f78` (Tasks 6, 7, 8, 9-Idea) — Ideas, SCHEMA-TOUCHING, PUSHED (after the owner applied the DDL).**
  Idea cards **click-to-expand** (full markdown + pasted screenshots, no editor); **Ideas-scoped search** gains
  sort (Relevance/Newest/Oldest/A→Z) + match-case + multi-term AND + `HighlightedText`; **soft-archive**
  (`Idea.archived`) with Active/Archived/All lozenges + per-card Archive/Unarchive (archived hidden by default,
  searchable only when opted in); Idea dialog **drag-resizable** like Quick Log.

**Verification:** local SQLite end-to-end for archive (PATCH preserves contact/company junctions; `?archived=
only|all` filters correct) + full browser pass (expand, search+highlight, resize dialog → 760px reflow,
calendar ⏳ tooltip "Waiting on: Sarah E. Saxton", mobile 390px on Ideas/Actions/Meetings calendars). `prepush`
+ `tsc -b` + full `vite build` green. Test action + test favorite created during verification were **deleted/
reverted** (data restored).

### Turso DDL — APPLIED ✅ (2026-06-14)

The owner ran `ALTER TABLE "Idea" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT 0;` in the Turso console;
`cce0f78` + the docs commits were then pushed (remote `main` = `16ceb9f`). Vercel redeployed; `/api/health`
is `200 db:ok`. (Backfill wasn't needed — DEFAULT 0 makes every existing idea "active." Migration script kept
for audit: `server/scripts/migrate-ideas-archived.js`.) **One light verification left for the owner:** load the
prod Ideas page and confirm the Active/Archived/All lozenges work — the agent can't auth to prod to check the
`Idea.archived` query directly, and the column-missing case would otherwise 500 the Ideas list.

### What's Next
1. **[OWNER, light]** On prod, open Ideas → confirm the lozenges + archive/unarchive work (the only check the
   agent couldn't run, since prod needs the app password).
2. Standing plan of record returns to **`.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+)**, gated on D5–D9 —
   don't push on those until the owner raises them.

### Carry-over items (pre-dating, lower priority)
1. **[USER ACTION]** Set `SENTRY_DSN` / `VITE_SENTRY_DSN` in Vercel (hardening Task 17) to activate error tracking.
2. NCQA adaptation plan: Phase 3 (blocked D8/D9) / Phase 4 (D5/D6).
3. #12 LinkedIn-on-mobile deferred (screenshot→gpt-4o-mini vision is the ready option if revisited).
4. Stray empty `server/dev.db` / `server/test.db` (gitignored) safe to delete.

### Open Bugs / Known Caveats
- **⚠ The committed Turso rw token in `server/.env` is STALE (hard 401).** For the archive DDL, use the **Turso
  web dashboard SQL console** (or mint a fresh no-expiry rw token). Vercel CLI installed but not logged in.
- **⚠ `prisma db push` local-path gotcha:** from `server/`, `db push` resolves `file:./dev.db` to the **stray
  empty `server/dev.db`**, not the populated `server/prisma/dev.db` the server opens. This session the archive
  column was applied directly to `server/prisma/dev.db` via better-sqlite3 (correct path).
- Run `tsc -b` (not just `npm run prepush`) before every push — it catches unused imports `typecheck` misses.
- Dev smoke-testing: a stale dev server + a locked `chrome-devtools-mcp` chrome profile were both cleared this
  session (stop the project `node` processes matching `searchbook` + `vite|ts-node-dev|concurrently`, and the
  `chrome.exe` whose command line contains `chrome-devtools-mcp`, before starting fresh). Local app has no
  `APP_PASSWORD` — pre-seed `localStorage.searchbook_password`. The device-emulation trick (`emulate
  390x844x3,mobile`) gives a true 390px viewport (the OS floors `resize_page` at ~500px).

### Working branch
`main` — **all pushed, remote `main` = `7f450c6`, live on Vercel.** This session shipped four schema-free
feature/fix commits — `5314aad` (Ideas screenshot fix), `dacdeaa` (connect→company-status), `4ea562c`
(Quick Log: Summary caret + autosaving/editable prep notes), `7f450c6` (formatted prep notes +
resize-drag fix) — plus doc commits. The prior UI batch (`2b88669`, `18f7b69`, `88ef0a6`, `cce0f78`)
remains live. Working tree clean.

---

### Suggested kickoff prompt for the next session

> Read `CLAUDE.md` / `AGENTS.md`, then this file. The Minor UI Improvements batch (9 tasks) is **complete and
> fully shipped** — all 5 commits are on `main` (`16ceb9f`) and live on Vercel, including the Ideas/archive
> commit (`Idea.archived` Turso DDL was applied 2026-06-14). The only loose end is a light owner check that the
> Ideas archive lozenges work on prod. The standing plan of record is now back to
> `.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+, gated D5–D9 — don't push on those until I raise them).
> Standing owner action still open: set `SENTRY_DSN`/`VITE_SENTRY_DSN` in Vercel.
