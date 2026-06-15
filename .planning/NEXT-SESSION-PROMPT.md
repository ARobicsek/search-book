# Next Session Prompt

This file is the handoff document for the next AI session (Claude Code **or** Gemini/Antigravity — the
protocol is agent-agnostic). It summarizes what was just accomplished, what to work on next, and open items.

### ✅ Idea-tags schema is LIVE (owner applied the Turso DDL + pushed, 2026-06-15)

The `CREATE TABLE "IdeaTag"` + comma-tag backfill were applied to Turso via the web SQL console, and
`c3f18dd` (Idea tags → app-wide Tag) was pushed. **All 9 asks are now live on Vercel.** Follow-up fix
`bd1fbb7` hides the reserved `Favorite` tag (the internal favorites mechanism) from `GET /tags` so it no
longer leaks into the tag pickers (Ideas/Meetings/Quick Log/contact-detail); the owner also deleted the
leftover `dog` tag via the Turso console. Nothing is pending from this session.

### What Was Just Completed (2026-06-15 session 2) — 9 owner asks across Ideas + Meetings

Plan: `.planning/IDEAS-MEETINGS-POLISH-PLAN.md`. Owner answered two design questions at start:
**(a) Idea tags → share the app-wide Tag vocabulary** (schema-touching); **(b) meeting title click → Edit
dialog, keep a small "series" chip.**

**Tasks 1–7 — shipped to `main` (`f0c5f37`), live on Vercel, browser-verified (desktop + 390px):**
- **Ideas card trim** (`c6c63dc`) — cut the default `gap-6 py-6` Card spacing to `gap-2 py-3`.
- **Ideas List view** (`6945bff`) — Card/List toggle (persisted `ideas_view`); dense click-to-expand rows;
  shared render helpers for actions/tag/related chips.
- **Ideas description highlight** (`c6fbb31`) — new self-contained rehype plugin
  [client/src/lib/highlight-markdown.ts](../client/src/lib/highlight-markdown.ts) wraps matches in `<mark>`
  inside the rendered markdown body (skips code/pre). *(Verified: 3 marks on "benchmark".)*
- **Meetings Next Steps → markdown** (`ff81036`) — `MarkdownTextarea` editor + `ReactMarkdown` render in the
  meetings list and the Quick Log series-context panel.
- **Meetings actions rework** (`175dac7`, asks #5/#6/#7) — Quick Log "Follow-up actions" rows now **autosave
  as real Actions** (POST `/actions` with `conversationId`, then debounced PUT; dedup via a synchronous
  `savedActionsRef` so a debounce+finalize can't double-create; remove deletes the Action); a compact
  **"Who owns it"** picker per row (`owedByMe` + `owerContactIds`); the **"Add action"** button is now the
  solid primary (white-on-dark). The conversation create/update no longer sends `createActions`.
- **Meetings title → Edit** (`f0c5f37`, ask #9) — the list heading opens `quickLog.openEdit`; a small
  **"series"** chip preserves the grouped series view; the anchor-contact chip now shows for any
  contact-anchored meeting so navigation isn't lost.

**Task 8 — Idea tags → app-wide Tag (`c3f18dd`, SCHEMA, committed locally, NOT pushed):** new `IdeaTag`
junction; server includes `tagLinks` + accepts `tagIds`; Idea dialog tag input is a free-text `MultiCombobox`
fed by `GET /tags` (`resolveTagIds` creates new tags on save, idempotent by name); card/list render tag chips
from `tagLinks`; search scores tags from `tagLinks`. Migration script `migrate-ideas-tags-to-junction.js`
(dual-mode local/Turso) creates the table + backfills the legacy `Idea.tags` strings.

**Verification:** prepush (`tsc` client+server) + full `vite build` green throughout. Server contracts
API-tested on local SQLite (action autosave: `conversationId` link + derived `direction`; idea tags:
create/link/unlink/cleanup; both test datasets deleted). Browser-verified desktop + true 390px: Ideas
card trim, List view, description `<mark>` highlight; Meetings title-button (`description="Edit meeting"`),
Next-steps markdown block, Quick Log add-action → owner picker → **autosave confirmed** (action 240 →
`conversationId`, `owedByMe`, `direction`); Idea Tags combobox free-text create → chip displays → tag joins
the shared `/tags` vocab. All test data removed.

### What's Next
1. **[OWNER, light]** Confirm on prod that the Ideas archive lozenges work (carried from last session).
2. Standing plan of record returns to **`.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+)**, gated on D5–D9 —
   don't push on those until the owner raises them.

### Carry-over items (pre-dating, lower priority)
1. **[USER ACTION]** Set `SENTRY_DSN` / `VITE_SENTRY_DSN` in Vercel (hardening Task 17).
2. NCQA adaptation plan: Phase 3 (blocked D8/D9) / Phase 4 (D5/D6).
3. Stray empty `server/dev.db` / `server/test.db` (gitignored) safe to delete.

### Open Bugs / Known Caveats
- **⚠ The committed Turso rw token in `server/.env` is STALE (hard 401).** Use the Turso web SQL console or
  mint a fresh no-expiry rw token for the `IdeaTag` migration.
- **⚠ `prisma db push` local-path gotcha:** from `server/`, `db push` resolves `file:./dev.db` to the stray
  empty `server/dev.db`, not the populated `server/prisma/dev.db` the server opens (db.ts resolves relative
  to `server/prisma/`). This session the `IdeaTag` table was applied to `prisma/dev.db` via the dual-mode
  migration script (libsql `file:` URL) — worked fine even with the dev server running.
- Run `tsc -b` / full `vite build` (not just `npm run prepush`) before every push — it catches unused imports.
- Dev smoke: a dev stack was already running this session (server 3001, client 5173). The local app has no
  `APP_PASSWORD` — pre-seed `localStorage.searchbook_password`. Device-emulation `390x844x3,mobile` gives a
  true 390px viewport.

### Working branch
`main` — **everything pushed and live.** All 9 asks shipped; the Idea-tags schema (`c3f18dd`) went out
after the owner applied the Turso `IdeaTag` DDL; `bd1fbb7` hid the reserved `Favorite` tag from the
pickers; `dog` tag removed. Working tree clean, nothing pending.

---

### Suggested kickoff prompt for the next session

> Read `CLAUDE.md` / `AGENTS.md`, then this file. The Ideas & Meetings polish batch (9 asks) is built and
> verified. Tasks 1–7 are pushed and live (`f0c5f37`). **One local commit `c3f18dd` (Idea tags → app-wide
> Tag table) is unpushed and must not be pushed until the Turso `CREATE TABLE "IdeaTag"` is applied** — run
> `server/scripts/migrate-ideas-tags-to-junction.js` with a fresh Turso token (or paste the DDL in the web
> console + run the script for the backfill), then `git push`. After that, the plan of record returns to
> `.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+, gated D5–D9). Standing owner action: set
> `SENTRY_DSN`/`VITE_SENTRY_DSN` in Vercel.
