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

### What's Next — back to the NCQA adaptation plan (owner to confirm scope)

The UX-Search-Meetings worklist is **done**. The standing **plan of record reverts to
`.planning/NCQA-ADAPTATION-PLAN.md`** (taxonomy retheme, AI ingest of Copilot recaps, Outlook ICS
daily briefing, semantic search over meeting notes). **Before starting NCQA work:**
- Re-read the NCQA plan's "How to use this document" + the phase you'll work. **Several tasks are gated
  on decisions D1–D9** at the top of that plan, and the owner asked **not to push on D5–D9 until they
  raise them** (carry-over #3). So **confirm with the owner which NCQA phase/tasks to start** rather than
  assuming Phase 1.
- **Schema-touching tasks need Turso DDL applied first** (procedure at the top of the adaptation plan) —
  the UX plan was deliberately schema-free, NCQA tasks are not. Never push schema-touching code to `main`
  before the Turso DDL is live.

Process reminders: one atomic commit per chunk; `npm run prepush` **and** a client build
(`tsc -b` is stricter than the `typecheck` script — it catches unused locals/imports) + a
desktop/390px smoke test before each push; update each task's STATUS line in the plan doc; owner has
standing permission to push to `main`.

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

> Read `CLAUDE.md` / `AGENTS.md`, then `.planning/NEXT-SESSION-PROMPT.md`. The UX-Search-Meetings plan
> (`.planning/UX-SEARCH-MEETINGS-PLAN.md`) is **fully shipped (Phases A–E)**. The plan of record now
> reverts to `.planning/NCQA-ADAPTATION-PLAN.md` — read its "How to use this document" section. Several
> NCQA tasks are gated on decisions D1–D9 and some are schema-touching (Turso DDL must be applied before
> pushing schema code), and the owner asked not to push on D5–D9 until they raise them — so **confirm
> with the owner which NCQA phase/tasks to start**. One atomic commit per chunk; before each push run
> `npm run prepush` **and** a client build (`tsc -b`), and smoke-test desktop + 390px.
