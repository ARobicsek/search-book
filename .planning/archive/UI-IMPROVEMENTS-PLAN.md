# SearchBook — Minor UI Improvements Batch

**Created:** 2026-06-14 (this session)
**Status:** ✅ COMPLETE & SHIPPED — all 9 tasks built + verified (desktop + 390px) and **pushed/live on Vercel**
(remote `main` = `16ceb9f`). Commits: `2b88669` (1,3,5), `18f7b69` (2,4), `88ef0a6` (9 Quick Log), `cce0f78`
(6,7,8,9 Ideas — **schema-touching**). The Turso `ALTER TABLE "Idea" ADD COLUMN "archived"` was **applied by the
owner 2026-06-14**, after which the Ideas commit + docs were pushed. The standing plan of record returns to
`.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+, gated D5–D9) after this batch.
**Origin:** owner request (2026-06-14) — 10 small UX fixes across Ideas, Actions, Meetings, and a global
free-text affordance.

## House rules (same as every session)
- One **atomic commit per task** (GSD). `npm run prepush` **and** `tsc -b` (the client build catches unused
  imports `typecheck` misses) green before each push. Re-test **desktop + mobile 390px** for every UI change.
- Owner has standing permission to push to `main` (auto-deploys to Vercel).
- **Task 8 (archive ideas) is the only schema-touching task** → follow the Turso DDL procedure at the top of
  `.planning/NCQA-ADAPTATION-PLAN.md` (backup → local `db push` to `prisma/dev.db` → DDL against Turso → only
  then push code). All other tasks are **schema-free**. ⚠ committed `server/.env` rw token is **stale (401)** —
  the owner applies the `ADD COLUMN` via the **Turso web dashboard SQL console** (as in Task 3 last session).
- **Prefer reuse:** `MarkdownTextarea`, `HighlightedText`, the favorite-chip quick-add, the Meetings
  list/calendar view-toggle pattern, the Actions filter-button group. No new heavy components.

## Decisions (CONFIRMED 2026-06-14)
| # | Decision | Resolution |
|---|----------|-----------|
| Q1 | **Resizable free-text (Task 9)** — textareas vs whole dialog window? | ✅ **Resizable DIALOG WINDOWS** — drag-resize the Idea + Quick Log dialogs on desktop; the textarea reflows to fill |
| Q2 | **Archive ideas (Task 8)** is schema-touching. Build now or defer? | ✅ **Build this session** — owner runs the one `ADD COLUMN` in the Turso console before client ships |
| Q3 | **Favorites-as-owers (Task 4)** — add the *designate* (star-toggle) half? | ✅ **Yes — add the star-toggle** so favorites can be created in-context, not just selected |

## Suggested ordering
1 (Meetings all-day label — trivial) → 2 (owned-by wording — trivial) → 3 (calendar waiting tooltip) →
4 (favorites-as-owers) → 6 (expandable idea cards) → 7 (ideas full search) → 5 (merge Actions+Calendar —
navigation change) → 9 (resizable boxes) → **8 (archive — schema, do deliberately with the DDL step)**.

---

## Task 1 — Meetings calendar: blank, not "all-day/full day", on mobile (MEETINGS)
**Ask:** on mobile, meetings without a time show "full day" in the meetings calendar; it should be blank.
**Current state:** every meeting event is `allDay: true` ([meetings.tsx:160](../client/src/pages/meetings.tsx#L160));
in the mobile `listMonth` view FullCalendar renders its `allDayText` ("all-day") in the time column.
**Approach:** pass `allDayText=""` (and/or `displayEventTime={false}`) to the `MeetingsCalendar` `<FullCalendar>`
([meetings.tsx:182](../client/src/pages/meetings.tsx#L182)). Verify the list **and** dayGrid views still read fine.
**Files:** [meetings.tsx](../client/src/pages/meetings.tsx). **Schema-free.**
**STATUS:** ✅ DONE (commit `2b88669`). allDayText="" on the Meetings calendar; verified mobile list shows no label.

## Task 2 — "owned by" instead of "owed by" (ACTIONS)
**Ask:** prefer the word "owned" to "owed" throughout Actions.
**Current state:** UI strings "Who owes it" / "add to who owes it" / "you're waiting on" live in the Action form
([action-form.tsx:488-540](../client/src/pages/actions/action-form.tsx#L488)); the "Waiting" badge text is in
[action-list.tsx:190](../client/src/pages/actions/action-list.tsx#L190). **Display strings only** — the schema
field `owedByMe` / enum `OWED_BY_ME` / `WAITING_ON_THEM` stay as-is (internal; dashboard/analytics read them).
**Approach:** retitle the disclosure "Who owns it" (or "Owned by"), update helper/chip/tooltip copy to "owns it".
Leave the data model and the user-facing "Waiting" badge wording unchanged unless owner wants that reworded too.
**Files:** [action-form.tsx](../client/src/pages/actions/action-form.tsx) (grep for "owe"). **Schema-free.**
**STATUS:** ✅ DONE (commit `18f7b69`). "Who owns it" + chip/placeholder/helper + dashboard waiting-card copy; fields/enum unchanged. Verified.

## Task 3 — Actions calendar: show "waiting on someone", tooltip says WHO (ACTIONS)
**Ask:** in the Actions calendar, a "waiting on someone else" action should look distinct, and its tooltip should
name **who** I'm waiting on.
**Current state:** the standalone Actions calendar ([calendar.tsx](../client/src/pages/calendar.tsx)) colors events
by priority/overdue/done only; no waiting marker, no tooltip. The `/actions` list it fetches **already returns**
`direction` + `owerContactIds` (JSON id array) — `actionListIncludes` uses `include`, so scalars come through.
**Approach:** (a) mark `direction === 'WAITING_ON_THEM'` events visually (e.g. a ⏳ prefix in the title and/or a
distinct fuchsia color, mirroring the list's "Waiting" badge); (b) fetch `/contacts/names` once, map
`owerContactIds` → names, set a native `el.title` tooltip via `eventDidMount` ("Waiting on: Jane, Bob") — same
zero-dep tooltip technique as `MeetingsCalendar` ([meetings.tsx:197](../client/src/pages/meetings.tsx#L197)).
Lands in whatever hosts the calendar (after Task 5, that's the Actions page calendar view).
**Files:** [calendar.tsx](../client/src/pages/calendar.tsx) (or the merged Actions calendar view). **Schema-free.**
**STATUS:** ✅ DONE (commit `2b88669`). ⏳ title prefix + native "Waiting on: <names>" tooltip (owerContactIds → /contacts/names). Verified live on the embedded calendar.

## Task 4 — Designate & select favorite contacts as owers (ACTIONS)
**Ask:** be able to designate and select favorite contacts as the people who need to do something.
**Current state:** the "Who owes it" disclosure already has favorite-contact **quick-add chips** + a contacts
MultiCombobox ([action-form.tsx:493-543](../client/src/pages/actions/action-form.tsx#L493)) — the *select* half
shipped in Task 3. There's **no way to designate** (mark a contact favorite) from here.
**Approach:** add a star-toggle next to each selected ower (mirrors `toggleCompanyFavorite` in
[idea-list.tsx:132](../client/src/pages/ideas/idea-list.tsx#L132)) calling `PATCH /contacts/:id/favorite`;
keep the local `favorites` list in sync so quick-add chips update live. (Pending Q3 confirmation this is the ask.)
**Files:** [action-form.tsx](../client/src/pages/actions/action-form.tsx). **Schema-free** (`/contacts/:id/favorite`
+ `/contacts/favorites` already exist).
**STATUS:** ✅ DONE (commit `18f7b69`). Star-toggle next to each selected ower → PATCH /contacts/:id/favorite, favorites kept in sync. Verified (star fills amber; persists).

## Task 5 — Merge the Actions calendar into the Actions page (ACTIONS)
**Ask:** like Meetings, give Actions a **List view + Calendar view** toggle; stop showing "Calendar" as its own
left-bar item.
**Current state:** Actions list ([action-list.tsx](../client/src/pages/actions/action-list.tsx)) and the Actions
calendar ([calendar.tsx](../client/src/pages/calendar.tsx)) are separate pages with separate sidebar entries
([app-sidebar.tsx:20-21](../client/src/components/app-sidebar.tsx#L20)). Meetings already does exactly this toggle
([meetings.tsx:371-402](../client/src/pages/meetings.tsx#L371)) using a `?view=calendar` URL param.
**Approach:** lift the calendar into the Actions page as a `view=calendar` toggle (reuse the Meetings
List/Calendar button group). Extract the FullCalendar block from `calendar.tsx` into a `<ActionsCalendar>` (or
import it). Remove the **Calendar** nav item + its `/calendar` route; redirect `/calendar` → `/actions?view=calendar`
for old bookmarks/PWA shortcuts. Carries Task 3's waiting tooltip.
**Files:** [action-list.tsx](../client/src/pages/actions/action-list.tsx), [calendar.tsx](../client/src/pages/calendar.tsx),
[app-sidebar.tsx](../client/src/components/app-sidebar.tsx), [App.tsx](../client/src/App.tsx). **Schema-free.**
**STATUS:** ✅ DONE (commit `2b88669`). List/Calendar toggle on Actions via ?view=calendar; <ActionsCalendar> extracted; Calendar nav + /calendar route removed (redirects to /actions?view=calendar). Verified desktop + 390px.

## Task 6 — Expandable idea cards (full text + screenshots, no edit screen) (IDEAS)
**Ask:** clicking an idea card should expand it to show the full idea (incl. screenshots) without opening edit.
**Current state:** cards clamp the description to 4 lines (`line-clamp-4`,
[idea-list.tsx:348](../client/src/pages/ideas/idea-list.tsx#L348)) and clicking does nothing (only the pencil/trash
buttons act). "Screenshots" = images pasted into the markdown description (MarkdownTextarea inserts
`![](url)`); they render via the existing `ReactMarkdown` + `prep-note-markdown`, but are clipped by the clamp.
**Approach:** make the card body click-to-expand (toggle `expandedId`): expanded → drop `line-clamp-4` so the full
markdown (incl. images) shows; collapsed → keep the 4-line preview. `stopPropagation` on the pencil/trash buttons
and on links so they don't toggle. Keep it inline (no new dialog).
**Files:** [idea-list.tsx](../client/src/pages/ideas/idea-list.tsx). **Schema-free.**
**STATUS:** ✅ DONE (commit `cce0f78`). Click-to-expand drops line-clamp-4; full markdown + screenshots render; edit/delete/archive stopPropagation. Verified (BCG long idea expands).

## Task 7 — Full search in Ideas: sorting + highlight, Ideas only (IDEAS)
**Ask:** a full search in Ideas with the same power as the global search (incl. sorting) but scoped to Ideas only.
**Current state:** Ideas has a plain client-side substring filter over title/description/tags
([idea-list.tsx:94-102](../client/src/pages/ideas/idea-list.tsx#L94)) — no sort, no match highlight. The global
[search page](../client/src/pages/search.tsx) has the rich UX (sort dropdown, case-sensitivity, `HighlightedText`).
**Approach:** enrich the in-place Ideas search (all ideas are already loaded client-side, so this stays client-only):
add a sort `<Select>` (Relevance/Newest/Oldest/A→Z — reuse the search page's option labels), optional match-case
toggle, and wrap title/description/tag matches in `HighlightedText`. No server change; do **not** route through the
global multi-scope search (owner wants Ideas-only).
**Files:** [idea-list.tsx](../client/src/pages/ideas/idea-list.tsx). **Schema-free.**
**STATUS:** ✅ DONE (commit `cce0f78`). Sort (Relevance/Newest/Oldest/A→Z) + match-case + multi-term AND over title/tags/related/desc + HighlightedText on plain-text fields. Verified (search filters + highlights).

## Task 8 — Archive ideas (hide from default search; lozenge to reveal) (IDEAS) — SCHEMA-TOUCHING
**Ask:** archive old ideas without deleting; archived stay searchable only when the user opts in via clickable
lozenges near the top of the search screen.
**Current state:** no archive concept; `/ideas` returns everything; route spreads `...rest`/`...data` so a new
scalar flows through create/update with no handler change ([ideas.ts:56,103](../server/src/routes/ideas.ts#L56)).
**Decision (Q2):** additive `Idea.archived Boolean @default(false)` — one safe `ADD COLUMN`, no table rebuild.
(Alternative `archivedAt DateTime?` gives an archive date but isn't needed for the ask — reject for simplicity.)
**Approach:**
- **Schema/DDL:** add `archived` to `schema.prisma`; apply to `prisma/dev.db` locally (mind the `db push` stray-db
  gotcha — apply directly to `server/prisma/dev.db`); owner runs `ALTER TABLE "Idea" ADD COLUMN "archived" BOOLEAN
  NOT NULL DEFAULT 0;` in the Turso console **before** the client code ships.
- **Server:** `GET /api/ideas?archived=…` filter (default: exclude archived); accept `archived` on PUT (already via
  `...data`). A migration script committed for audit (mirrors `migrate-actions-owers.js`).
- **Client:** an Archive/Unarchive action on each card; lozenge filter near the top — **Active** (default) /
  **Archived** / **All** (mirror the Actions filter-button group). Archived cards visually muted.
**Files:** [schema.prisma](../server/prisma/schema.prisma), [ideas.ts](../server/src/routes/ideas.ts),
[idea-list.tsx](../client/src/pages/ideas/idea-list.tsx), `lib/types.ts`, a migrate script. **SCHEMA-TOUCHING.**
**STATUS:** ✅ DONE & SHIPPED (commit `cce0f78`). Idea.archived added; GET ?archived filter (default active); dedicated PATCH /:id/archive (no junction wipe); Active/Archived/All lozenges + per-card archive. Verified end-to-end on local SQLite + UI. **Turso `ALTER TABLE "Idea" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT 0` applied by the owner 2026-06-14; commit pushed; `/api/health` 200 db:ok post-deploy.** (Light owner check left: confirm the lozenges on the prod Ideas page.)

## Task 9 — Resizable free-text boxes on desktop (IN GENERAL)
**Ask:** on desktop, an affordance to widen/narrow the free-text boxes (ideas, actions, meeting notes).
**Current state:** the shared `Textarea` has `field-sizing-content` (auto-grow) but no user resize handle
([textarea.tsx:10](../client/src/components/ui/textarea.tsx#L10)); `MarkdownTextarea` passes `className` straight
through ([markdown-textarea.tsx:284](../client/src/components/markdown-textarea.tsx#L284)).
**Decision (Q1):** **resizable DIALOG WINDOWS** — drag-resize the Idea + Quick Log dialogs on desktop; the
textarea reflows to fill the wider/taller box.
**Approach:** add `sm:resize sm:overflow-auto` (plus a sensible `sm:min-w`/`max-w`/`min-h`) to the `DialogContent`
of the free-text dialogs so a native bottom-right drag handle appears on desktop only (mobile untouched). The Idea
dialog currently fixes width at `sm:max-w-md` ([idea-list.tsx:379](../client/src/pages/ideas/idea-list.tsx#L379));
Quick Log's `DialogContent` similarly. Verify the inner content scrolls and the textarea grows with the dialog.
**Files:** [idea-list.tsx](../client/src/pages/ideas/idea-list.tsx),
[quick-log-dialog.tsx](../client/src/components/quick-log-dialog.tsx) (+ confirm no others). **Schema-free.**
**STATUS:** ✅ DONE (commits `88ef0a6` Quick Log + `cce0f78` Idea dialog). sm:resize + overflow-auto + min/max on both DialogContents; desktop-only. Verified (Idea dialog widened to 760px, content reflows; mobile unaffected).

---

## Out of scope / not in this batch
- Sentry DSN activation (owner action — set `SENTRY_DSN`/`VITE_SENTRY_DSN` in Vercel).
- NCQA Phase 3+ (gated on D5–D9).
- Reworking the user-facing "Waiting" badge wording (Task 2 keeps it unless owner asks).
