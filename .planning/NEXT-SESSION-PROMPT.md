# Next Session Prompt

This file is the handoff document for the next AI session (Claude Code **or** Gemini/Antigravity — the protocol is agent-agnostic). It summarizes what was just accomplished, what to work on next, and any open items.

### What Was Just Completed (2026-06-14, build session) — Phase D + Phase E SHIPPED → UX plan DONE

Plan of record: `.planning/UX-SEARCH-MEETINGS-PLAN.md`. One atomic commit per phase, verified at
desktop + 390px with chrome-devtools, pushed to `main` (auto-deploys to Vercel). **No schema changes.**
With these two, **Phases A–E of the UX-Search-Meetings plan are all complete** — that plan is now fully shipped.

- **Phase D — Meetings calendar** (`a0db408`). Added a **List | Calendar** segmented toggle to the
  Meetings header (`?view=calendar` in the URL; icon-only `<sm`; hidden + forced to list in the
  series/`title` view). New `MeetingsCalendar` component in
  [client/src/pages/meetings.tsx](client/src/pages/meetings.tsx) renders FullCalendar
  (dayGrid+list+interaction), fetching **only the visible range** via `/api/meetings?from=&to=&limit=100`
  on FullCalendar's `datesSet` (initial + every nav), keeping the range in a ref to refetch on the
  `searchbook:meeting-logged` event. Each meeting → an all-day event titled via the shared
  `conversationDisplayName` (extended to the participant-first fallback so 1:1s show the person) and
  colored by `type` via a new **hex** map `meetingTypeCalendarColors` (FullCalendar needs CSS colors,
  not the Tailwind `conversationTypeColors` class strings). Event click → `quickLog.openEdit(id)`, so
  future-dated meetings double as a prep queue. **Mobile** defaults to `listMonth` (desktop
  `dayGridMonth`) via a one-frame `ready` mount gate (since `useIsMobile` resolves false→true after
  mount and FullCalendar reads `initialView` once — calendar.tsx dodges this via its fetch-loading
  spinner). Filters hidden in calendar view. Verified: events land on the correct dates (cross-checked
  vs. the API — no off-by-one), participant-first names + per-type colors, `+N more` overflow, event
  click opens the right meeting, mobile mounts in list view grouped by date, toggle both ways, console clean.
- **Phase E — Terminology "Meetings" everywhere** (`fe75cf8`). Relabeled **only rendered strings**
  from "Conversation(s)" → "Meeting(s)": contact-detail (tab label `Conversations`→**Meetings**, kept
  `value="conversations"` tab id; delete-impact `conversation log(s)`; Prep Sheet "before a **meeting**
  with", **Last Meeting**, "No **meetings** logged yet.", "upcoming **meetings**", prep-notes
  placeholder), action-detail (Field label + `Meeting #id` fallback), analytics (**Meetings by Type**
  chart), search (**Recent Meetings**), duplicates (4 merge-dialog strings). Left untouched: the
  `Conversation` model/TS types, `/conversations` API paths, `searchbook:*` event names,
  `draft_*conversation*` localStorage keys, and all variable/prop names. Already correct (no change):
  command-palette group `heading="Meetings"`, company-detail's `Meetings (N)` card, the Quick Log dialog
  title, search tab. Verified in-browser: contact tabs read `Overview / Meetings (1) / Relationships /
  Prep Sheet`; a DOM scan finds **zero** visible "conversation" text.

`npm run prepush` **and** the strict client build (`tsc -b`) green for both commits; console clean.

### What's Next — owner's 5-item follow-up list (new plan of record)

The UX-Search-Meetings worklist is **done**. The owner gave 5 follow-ups to tackle next, captured (with
recon already done) in a new plan doc: **`.planning/CALENDAR-FAVORITES-BACKUP-PLAN.md`**. Read its
"How to use" + the items, then confirm/refine scope with the owner before building (a few open
decisions are flagged inline). The 5 items:

1. **Calendar day-overflow** — handle ~10 meetings/day (FullCalendar already shows "+N more"; verify the
   built-in popover's event clicks open the editor; maybe raise `dayMaxEvents` / wire day-number → day list). Client-only.
2. **Calendar hover tooltip** — hovering a meeting shows the first participant + summary (native
   `el.title` via `eventDidMount`; `/api/meetings` already returns both — no API change). Client-only.
3. **Favorite organizations** — mirror contact favorites for orgs in the org-entry comboboxes (meeting
   log, ideas). **Schema-free**: reserved `Favorite` tag via the existing `CompanyTag` junction; add
   `GET /companies/favorites` + `PATCH /companies/:id/favorite` (copy the contacts impl).
4. **Backup-coverage audit** — recon found **all 27 Prisma models are already in both backup paths**
   (browser-direct `TABLES_PARENT_FIRST` + server `buildExport`), `SELECT *`/`findMany` so column-complete.
   Remaining: fix stale "24-table" labels in the server route; **verify binary files** — the manual ZIP/local-disk
   backup bundles `photos/` but maybe **not** `files/` (`ConversationAttachment` binaries) — close that gap.
5. **Prod→dev restore test** — download all prod backup material (DB JSON + binaries) and fully restore into a
   **scratch** Turso DB (never overwrite live); verify per-table row counts, relationships, and that photo +
   **attachment** binaries resolve. Run **after** item 4. (Relates to carry-over #4.)

Suggested order: 3 → 1 & 2 (same file) → 4 then 5. The longer-term **NCQA adaptation plan**
(`.planning/NCQA-ADAPTATION-PLAN.md`) stays the standing plan of record after these (its tasks are
gated on decisions D1–D9 and some are schema-touching — confirm scope with the owner; don't push on D5–D9
until they raise them).

Process reminders: one atomic commit per chunk; `npm run prepush` **and** a client build
(`tsc -b` is stricter than the `typecheck` script — it catches unused locals/imports) + a
desktop/390px smoke test before each push; update each task's STATUS line in the plan doc; owner has
standing permission to push to `main`. Items 1–3 are schema-free; flag immediately if anything seems to
need a schema change (Turso DDL must land before pushing schema code).

### Carry-over items (pre-dating, lower priority)
1. **[USER ACTION]** Set `SENTRY_DSN` / `VITE_SENTRY_DSN` in Vercel (hardening Task 17).
2. **Prod search perf** — owner signed off on live Phase B (B3); treat as closed unless it regresses.
3. NCQA adaptation plan: Phase 3 (blocked D8/D9) / Phase 4 (D5/D6). Don't push on D5–D9 until the owner raises them.
4. Desktop-only verifications parked from Phase 7.5 (photo-ZIP CORS vs prod; restore into scratch Turso DB).
5. Replace `resetPrisma()` per-request pattern with a long-lived PrismaClient.
6. Company near-duplicate scan (LinkedIn-variant suffixes).
7. #12 LinkedIn-on-mobile deferred (screenshot→gpt-4o-mini vision is the ready option if revisited).
8. Stray empty `server/dev.db` / `server/test.db` (gitignored) safe to delete.

### Open Bugs / Known Caveats
- No confirmed bugs. The `Favorite` tag is a normal tag and appears in tag dropdowns (by design).
- **Meetings calendar:** fetches up to 100 meetings per visible range (plenty for a month for a single
  user); applies no list filters (it navigates by date); `datesSet`'s exclusive `endStr` is a harmless
  one-day over-fetch (FullCalendar clips rendering). Calendar view is suppressed in the series/`title` view.
- **Quick Log autosave design:** free-text new people/orgs/tags and follow-up actions persist **only on
  "Done"** (numeric-only keystroke autosave avoids duplicate-create on PUT). Core writeup always protected.
- **Orphaned localStorage (harmless):** the retired inline editor's `draft_conversation_*` /
  `draft_edit_conversation_*` keys are no longer read or written.
- **B2 cap:** the meetings `q`-ranking path fetches ≤300 meetings before ranking.
- The `tsc -b` build (`noUnusedLocals`) remains the gate that catches unused imports the `typecheck` script misses.

### Working branch
`main`, clean and fully pushed. Phase D (`a0db408`), Phase E (`fe75cf8`) + this handoff are live.

---

### Suggested kickoff prompt for the next session

> Read `CLAUDE.md` / `AGENTS.md`, then `.planning/NEXT-SESSION-PROMPT.md` and the new plan of record
> `.planning/CALENDAR-FAVORITES-BACKUP-PLAN.md` (the UX-Search-Meetings plan is fully shipped). Work the
> owner's 5 follow-ups — calendar day-overflow, calendar hover tooltip (first participant + summary),
> favorite **organizations** (schema-free, mirror contact favorites via `CompanyTag`), a backup-coverage
> audit (all 27 tables already covered — verify binary/attachment bundling + fix the stale "24-table"
> labels), and a prod→dev full-restore test into a scratch DB. Suggested order 3 → 1 & 2 → 4 then 5;
> confirm/refine scope and the open decisions with me first. One atomic commit per chunk; before each push
> run `npm run prepush` **and** a client build (`tsc -b`), and smoke-test desktop + 390px. Items 1–3 are
> schema-free — flag immediately if anything needs a schema change.
