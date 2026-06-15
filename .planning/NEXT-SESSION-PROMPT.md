# Next Session Prompt

This file is the handoff document for the next AI session (Claude Code **or** Gemini/Antigravity — the
protocol is agent-agnostic). It summarizes what was just accomplished, what to work on next, and open items.

### What Was Just Completed (2026-06-14) — Minor UI Improvements batch (9 tasks)

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
`main` — **all pushed, remote `main` = `16ceb9f`, live on Vercel.** This session shipped `2b88669`, `18f7b69`,
`88ef0a6` (schema-free) and, after the owner applied the Turso DDL, `cce0f78` (Ideas/archive) + the docs commits.
Working tree clean.

---

### Suggested kickoff prompt for the next session

> Read `CLAUDE.md` / `AGENTS.md`, then this file. The Minor UI Improvements batch (9 tasks) is **complete and
> fully shipped** — all 5 commits are on `main` (`16ceb9f`) and live on Vercel, including the Ideas/archive
> commit (`Idea.archived` Turso DDL was applied 2026-06-14). The only loose end is a light owner check that the
> Ideas archive lozenges work on prod. The standing plan of record is now back to
> `.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+, gated D5–D9 — don't push on those until I raise them).
> Standing owner action still open: set `SENTRY_DSN`/`VITE_SENTRY_DSN` in Vercel.
