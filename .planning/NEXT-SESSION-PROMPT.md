# Next Session Prompt

Rolling handoff for the next AI session (Claude Code **or** Gemini/Antigravity — protocol is
agent-agnostic, see `AGENTS.md`). Keep this file **lean**: a short "just completed", "what's next",
carry-overs, open bugs, and a kickoff prompt. Per-session detail goes in `SESSION-HISTORY.md`, not
here.

### What Was Just Completed — Dashboard action ownership quick-switch + waiting-items sink (2026-07-07)

Two owner asks for the dashboard actions workflow plus a same-session follow-up ask, **schema-free,
client-only**, two feature commits to `main` (`e2f5a63` dashboard, `ab13a09` /actions list page).
Owner's scenario: he does his part of "Reach out to John re X" → the ball is now in
John's court → he wants to flip ownership in a couple of clicks from the dashboard, and wants untimed
"waiting on someone else" items kept at the **bottom** of the Overdue/Today lists.

1. **New `ActionOwnerSelect`** (`client/src/components/action-owner-select.tsx`, mirrors the inline
   `ActionDateSelect` pattern): an hourglass popover on every dashboard action row. **No schema change**
   — it drives the existing Task-3 ownership model (`owedByMe` + `owerContactIds`; server derives
   `direction`). Owned rows get a hover-revealed trigger (always visible on mobile) → one-click
   hand-off to the action's **linked contact(s)** (2 clicks for the canonical case), a ranked contact
   search, or **"Someone else — no name"** (unnamed waiting — the owner usually can't tell the system
   who). Waiting rows get an always-visible fuchsia trigger (+ a visible "Waiting" label when there's
   no named ower on the row) → removable chips, add-person search, one-click **"Take it back"**.
   ⚠ Gotcha honored: the PUT always sends **both** `owedByMe` and `owerContactIds` — the server's
   `resolveOwers` defaults `owedByMe` to true when omitted, so sending one field alone corrupts the other.
2. **`waitingSink` sort key** in `dashboard.tsx`: untimed `WAITING_ON_THEM` items sort to the bottom of
   **Today** and **Overdue**; timed items keep their clock position; within the sunk group the existing
   date/priority order applies. (Sorting is dashboard-only; the `/actions` list keeps its own sortable
   columns.)
3. **Also on the `/actions` list page** (owner follow-up ask, same session): a slim "Ownership" column
   after Due Date on desktop (icon-only trigger — `hideLabel` prop keeps it from duplicating the list's
   existing "Waiting" title-badge), and on mobile the trigger sits inline next to the date select under
   the title (column hidden via `columnVisibility`, matching the other mobile-hidden columns).

Verified live (Chrome DevTools MCP) desktop + 390px mobile: linked-contact hand-off, unnamed hand-off
(a HIGH item visibly sank below a MEDIUM), take-back, search + Enter keyboard pick, both lists
re-sorting, console clean; all test actions deleted after. `prepush` + full client `vite build` green.
**Env fix along the way:** local `server/prisma/dev.db` had drifted ~4 sessions behind the schema
(missing `dueTime`/`notify`/`lastNotifiedAt`/`recurringWeekdaysOnly`) so every Action read/write 500'd
locally — synced additively via `npx prisma db push --url "file:C:/dev/personal/searchbook/server/prisma/dev.db"`
(Prisma 7's `--url` flag sidesteps the stray-`server/dev.db` CWD gotcha below).

### What Was Just Completed — Meeting-log dialog: wider + Ctrl-click a name keeps the log open (2026-07-06)

Two small owner asks for the Quick Log / meeting editor (`client/src/components/quick-log-dialog.tsx`),
**schema-free, client-only**, one commit to `main` (`f1bb55d`).

1. **Wider default width.** The non-prep-panel `DialogContent` width `sm:w-[36rem]` → **`sm:w-[52rem]`**
   (matching the Ideas dialog, per the owner's "like Ideas"). Panel mode (prep notes / series context
   showing) is unchanged at the wider `sm:w-[64rem]`; still drag-resizable + `sm:max-w-[95vw]`-capped.
2. **Ctrl-click a participant name keeps the log open.** The name `<Link to={/contacts/:id}>` used to call
   `handleDialogOpenChange(false)` on *every* click, so a Ctrl/Cmd-click opened the contact in a new tab
   **and** closed the log. The owner wants to open a person's tab to document about them *while continuing*
   to document in the log. The `onClick` now returns early on a modified/non-left click (`e.metaKey ||
   e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0`) — react-router already skips client-nav on a
   modified click, so the browser opens the card in a new tab and the dialog stays open; a plain left-click
   still navigates in place and flushes+closes as before.

`prepush` (client+server typecheck + 32-table backup guard) + full client `vite build` green. **Mobile
unaffected** — the width change is at the `sm:` breakpoint (≥640px; mobile stays `w-[95vw]`) and the
modifier-key guard is a no-op for touch (plain click). Committed straight to `main`.

### What Was Just Completed — Meeting search results expand into a full read-only detail view with highlighting (2026-07-04)

Owner ask: clicking a **meeting** result in global search should show its **full contents + prep notes with the
search term(s) highlighted**, not navigate away to the `/meetings` list. **Schema-free, client-only**, two
commits straight to `main` (`182885e` → `28fb55a`); owner confirmed both live.

1. **New `MeetingDetailDialog`** (`client/src/components/meeting-detail-dialog.tsx`): clicking a meeting search
   card (title or card body) opens a read-only dialog that **fetches the full record** (`GET /conversations/:id`
   — the `/api/search` response only carries 60-char match snippets) and renders summary, **notes**, **next
   steps**, **prep notes**, attachments, and related people/orgs/tags chips. Search terms are highlighted
   throughout — plain text (title/summary/participants) via `HighlightedText`, and *inside the rendered markdown*
   (notes/prep/next-steps) via the existing `highlightRehype` rehype plugin.
2. **`MentionableMarkdown` gained optional `highlightTerms`/`caseSensitive` props** — applies `highlightRehype`
   when present (keeps the `@`-mention chips), mirroring the Ideas-list highlight pattern. `MeetingSearchCard` in
   `search.tsx` now opens the dialog (one page-level instance via `openMeetingId`; both "All" + "Meetings" tabs)
   instead of `<Link>`-ing out.
3. **"Edit meeting" button** (`28fb55a`): the first cut linked to `/meetings?id=`/`?title=` (which just filtered
   the list) — replaced with a button that closes the detail view and opens the **canonical Quick Log editor for
   THAT meeting** via the app-wide `useQuickLog().openEdit(id)` (search page renders inside `QuickLogProvider`), no
   navigation.

`prepush` (client+server typecheck + 32-table backup guard) + full client `vite build` green; **verified live
in-browser** (Chrome DevTools MCP) desktop **and** 390px mobile — dialog opens, term highlighted in rendered
notes, Edit → editor loads the right meeting; no console errors. **Command-palette meeting hits still navigate
to the list** (out of scope; raise if wanted). Prep-note highlight path is byte-identical to the verified notes
path but the local DB has no prep notes to exercise it live.

### What Was Just Completed — Owner UX polish batch + recurring-action reminder fix + weekday-only recurrence (2026-07-03)

A batch of small owner-facing tweaks plus two action-recurrence fixes. Five commits on `main`
(`6646c88` → `8035c08` → `02c29b8` → `876d3fc` → `63cc211`); owner asked for each live.

1. **Dashboard pills decluttered** (schema-free): the action **priority** pill shows only when `HIGH`
   (Medium/Low were near-universal noise); the **type** pill is hidden when type is `OTHER`; and the
   title + remaining pills/markers now sit on **one wrapping row** (pills to the *right* of the name,
   wrapping under only when the title can't share the line) instead of a line below.
2. **Idea editor opens wider** (schema-free): the Edit/New Idea dialog default `sm:w-[28rem]` → `sm:w-[52rem]`
   (still drag-resizable, capped `92vw`).
3. **Darker form-field outlines** (schema-free): light-mode `--input` `oklch(0.922)` → `oklch(0.84)` (kept
   just below `--border`) — the near-white outline was hard to see, notably in **Edge** on the meeting-log
   documentation boxes. Done at the token so it covers Input/Textarea/Select everywhere; also gave
   `Combobox`/`MultiCombobox` triggers explicit `border-input` (they fell back to the lighter `--border`) so
   the participant / org / series / tag pickers match.
4. **Reminder carries onto recurring occurrences** (schema-free, `876d3fc`): the next-occurrence creation in
   `PATCH /actions/:id/complete` copied schedule/priority/contacts but **dropped `dueTime` + `notify`**, so a
   recurring action lost its reminder after the first fire. Both now carry forward; `lastNotifiedAt` left null
   so the cron arms a fresh reminder for the new occurrence.
5. **Weekday-only recurrence** (**SCHEMA**, `63cc211`): new additive `Action.recurringWeekdaysOnly` bool — when
   set, the next occurrence advances to the next weekday, skipping Sat/Sun (Fri→Mon), which a fixed day interval
   can't express. Form "Recurring action" block gained a **Repeat** selector (Every N days / Every weekday
   (Mon–Fri)); interval input hides in weekday mode; detail view + backup boolean-coercion updated; the flag is
   carried onto recurrences too. **Turso DDL applied by the owner** (`ALTER TABLE "Action" ADD COLUMN
   "recurringWeekdaysOnly" BOOLEAN NOT NULL DEFAULT false`) via the **web SQL console** — the committed
   `server/.env` rw token is **stale (hard 401)**, so the "uncomment creds + run a libsql script" path no longer
   works; use the web console or a fresh token. Chose a clean column over a sentinel-in-`recurringIntervalDays`
   (owner picked "add a proper field" via AskUserQuestion).

`prepush` (client+server typecheck + 32-table backup guard) green on every commit. Mobile (390px) not
separately re-tested — the dashboard row is a flex-wrap of existing chips; the rest are a dialog width, a
border-color token, and a form selector.

### What Was Just Completed — Picker relevance ranking + toolbar-less markdown in contact docs + Edge highlight fix (2026-07-02 s5)

Three bundled owner enhancement asks, **schema-free**, committed straight to `main` (`3391b43`, then `18a698f`); owner confirmed live.
1. **Relevance-ranked people/org pickers.** The meeting **Participants** picker and the **@-mention** autocomplete now float the most-likely target first. `GET /api/contacts/names` + `/companies/names` return a numeric `rank` (rows pre-sorted by it), computed in app code from cheap parallel `groupBy` counts (Turso-safe, **not** the `_count` include). **Primary factor is engagement** — `min(meetings,40)*50 + min(@mentions,40)*30` (contact meetings = anchored `Conversation.contactId` + `ConversationParticipant`; @mentions = `ConversationMention`) — so among five "Sarah"s at NCQA the one you actually meet/@-mention most wins. Smaller boosts: NCQA ecosystem +150, has-a-written-profile +50 (ids-only presence query — no big-text transfer). Companies rank on meetings + @mentions + people-on-file. Client: `ComboboxOption.rank`; `Combobox`/`MultiCombobox` + the mention list sort **word-prefix-first** ("sar"→Sarah before Ce·sar), then rank, then alpha. **Owner explicitly chose engagement-primary over the initial NCQA-dominant (+1000) weighting** — if NCQA colleagues you haven't met feel too buried, raise the +150 boost.
2. **Toolbar-less markdown in contact documentation boxes.** New `hideToolbar` prop on `MarkdownTextarea` keeps every shortcut (Ctrl+B/I, bullets, Tab-to-nest, list continuation, image paste) without the toolbar. **Role Description, Useful For, Personal Details** switched to it; their contact-detail read views now render markdown (`personalDetails` was plain text before).
3. **@-mention keyboard highlight fixed (Edge).** Arrow/Enter/Tab selection already existed, but the highlighted row used `bg-accent` (`oklch 0.97`, ~3% contrast on white) — barely visible in Chrome, **invisible in Edge**. Swapped to an explicit blue matching the mention-chip theme + `scrollIntoView` so the active row stays visible on a long list.

`prepush` (client+server typecheck + 32-table backup guard) + full client `vite build` green; both ranking endpoints smoke-tested live against local SQLite (curl) — `rank` on every row, sorted desc, the new `ConversationMention` `groupBy` doesn't hang. **No Turso DDL.** Mobile not separately re-tested (dropdown highlight + picker ordering + form-field editor swaps; no layout change).

### What Was Just Completed — Meeting-notes scroll-bar flicker fixed (2026-07-02 s4)

Owner reported that while typing meeting notes with SearchBook at **half-monitor width** (Teams in the
other half), the right-edge scroll bar kept **appearing and disappearing**. **Root cause:** the notes
`MarkdownTextarea` auto-grows (`field-sizing-content`) inside an `overflow-y-auto` scroll container; when
it grows past the container a scroll bar appears → on classic (non-overlay) Windows scroll bars that eats
~15px of width → the narrower column **rewraps** the text → textarea height changes by a line → content can
drop back under the scroll threshold → bar hides → width restored → rewraps back → grows → oscillation =
flicker. Worse at half-width because a narrow column sits right on word-wrap boundaries. **Fix**
(`client/src/components/quick-log-dialog.tsx`, `033673e`): added `[scrollbar-gutter:stable]` to the two
scroll containers wrapping the notes field — the `DialogContent` (non-panel mode) and the desktop
right-panel form scroll `div` (panel mode) — so the gutter is permanently reserved, the scroll bar toggling
no longer changes content width, and the loop can't start. **Schema-free, client-only** (two-line Tailwind
className edit). Client `tsc` + `check:backup` (32 tables) green; server `tsc` couldn't run (no server
`node_modules` in this container — pre-existing env limitation, unrelated errors only), Vercel's
`build:vercel` is the real gate. Developed on `claude/meeting-notes-scroll-flicker-9lopxu`, fast-forwarded
into `main` (`dd07481..033673e`) at owner's request; owner confirmed it looks good. Mobile unchanged.

### What Was Just Completed — Reuse a series' prep notes in the next meeting (2026-07-02 s3)

Owner ask: when logging a meeting **in a series**, the desktop "Last Meeting in Series" panel already
shows the prior meeting's notes — now it also surfaces that meeting's **prep notes** with a **"Copy to
prep notes"** button that duplicates their *content* into the new meeting as fresh, editable prep notes,
so you can rapidly populate + tweak them. It's a **one-way content copy** — the prior meeting's own
prep-note records are never touched. In create mode the copies stage as `pendingPrepNotes` (persisted on
finalize like any staged note); in edit mode they `POST` to `/conversation-prepnotes` on the current
meeting. Dated **today** (prep for the new meeting). **Schema-free, client-only** — all in
`client/src/components/quick-log-dialog.tsx` (the `/meetings` list `include` already returned `prepNotes`,
so the series-context object already carried them). Three commits, pushed to `main` (`ef46ee0` → `5c66d4e`
→ `d0fcadb`).

Two follow-up refinements in the same session: **(1, `5c66d4e`)** once copied, the source prep-notes box
**hides itself** (the copies live editable at the top of the panel), freeing room for the notes box.
**(2, `d0fcadb`)** the first cut keyed that hide on session-only state, so the box **reappeared on reopen**
after copy+save — fixed by basing visibility on a **durable** signal (`meetingHasPrepNotes` = does THIS
meeting already have prep notes of its own, saved or staged), so it stays hidden across save + reopen and
re-appears only if you clear all of this meeting's prep notes. **Desktop-only** (the series-context panel
is `useIsDesktop`-gated — mobile has no side panel; unchanged). `prepush` (typecheck + 32-table backup
guard) + full client `vite build` green.

### What Was Just Completed — Duplicate auto-merge, two rounds: recorded rules that never fired, then a fallback that never even looked (2026-07-02)

Owner reported (via a GitHub task) that after the 2026-06-29 persistence session, dupes kept
recurring instead of auto-merging. Two rounds, both verified with a local server against real SQLite
(curl), not just by re-reading code — worked around two container issues along the way:
Prisma/better-sqlite3 binary downloads need `NODE_USE_ENV_PROXY=1` (see `/root/.ccr/README.md`), and
the documented `db push`-from-`server/`-writes-the-wrong-`dev.db` gotcha.

**Round 1:** both merge endpoints only wrote `DuplicateMergeRule` `if (removedKey !== keptKey)` — but
those keys are the *normalized core name*, and the single most common duplicate shape (two names whose
core normalizes identically — exact dupes, or a legal-suffix variant like "Acme Health System" vs
"...Inc") always has equal keys, so the rule silently never got recorded for that bucket. Fixed to
always record (including the self-mapped case, keeping the lower id); also fixed the recorded `keptKey`
going stale when a merge's field-selection chose the removed side's name. Separately, the client's
`handleDismiss` fired the dismiss POST without awaiting it and swallowed any failure — fixed to match
`handleMerge`'s await-and-toast pattern.

**Round 2 (owner tested live, still not working):** repro was merging "NCQA" into "National Committee
for Quality Assurance (NCQA)", then creating a contact with org "NCQA" — expected it to resolve to the
full name; didn't. Two more gaps: **(a)** the round-1 fix only ever checked merge rules for pairs the
*heuristic* similarity scan also flagged — and "NCQA" shares no token/similarity with the spelled-out
name, so it's never even a candidate (confirmed: scanning the two returned `pairs: []`). Fixed by
extracting `applyMergeRules()` — an independent first pass over *all* entities (grouped by normalized
key) that applies every rule regardless of similarity, before the heuristic scan runs, removing what it
merges so the heuristic pass never re-sees it. **(b)** nothing consulted merge history at
company-*creation* time, so typing "NCQA" recreated the duplicate immediately regardless. Added
`resolveExistingCompanyByName()` (exact match → merge-rule redirect → null) + `POST
/api/companies/resolve`, wired into **6 places** that each had their own bare "look up locally, else
create" logic: contact-form (+ its LinkedIn-import path), CSV import (both the server `contacts.ts`
helper *and* a separate, previously-unfixed client-side `csv-import-dialog.tsx` path), actions, ideas,
and the Quick Log meeting-org resolver. Left the standalone "Add Company" page and the org-`@`-mention
"Create organization" button untouched — both are deliberate "make a new one" actions, unlike the other
sites' implicit resolution.

Verified end-to-end: the exact NCQA repro now resolves immediately (`created:false`, no duplicate,
contact attaches to the right org); regression-checked the same-key case, a dissimilar-name case for
contacts too, heuristic-similarity pairs still surfacing for review, and dismiss-then-rescan — all pass.
Client+server typecheck, `prepush` (32-table guard), full client `vite build`, server `tsc` all green.
**Schema-free.** Full write-up: `SESSION-HISTORY.md` 2026-07-02 (both entries). Pushed to `main` both
rounds (owner asked directly in round 1; kept `claude/org-merge-dedup-issues-ddtn2r` in sync too).

### What Was Just Completed — Meeting-log polish: caret stays in view + new actions on top (2026-06-30 s2)

Two small owner asks for the Quick Log / meeting editor, **schema-free, client-only**, merged + pushed
to `main` (`a34f6aa`). Owner confirmed both live.
1. **Caret no longer hides below the fold.** The note `MarkdownTextarea` auto-grows
   (`field-sizing-content`) so it never scrolls internally — it extends past the bottom of the dialog's
   scroll container, and the browser doesn't scroll that ancestor to follow the caret, so a line typed
   after Enter at the bottom went out of view. New `scrollCaretIntoView` (reuses the existing mirror-div
   `getCaretCoordinates`) finds the nearest scrollable ancestor and nudges its `scrollTop` (16px margin)
   when the caret is past an edge. Wired into the textarea `onChange` (plain typing/Enter) **and** into
   `apply`'s rAF (programmatic edits: list continuation, @-mention insert, pasted/dropped images).
2. **"Add action" prepends.** `addAction` in `quick-log-dialog.tsx` now does `[makePendingAction(),
   ...prev]` so the new composer row lands at the top, right under the button where it's easy to find.
   Saving is key-based (`reconcileActions` dedups by row key), so row order is purely cosmetic.

**Verification caveat:** `npm run prepush` halts on the **pre-existing** tsconfig `baseUrl` deprecation
(TS5101 — newer TS in this container, present on the untouched tree too); confirmed the two edited files
type-check clean via `tsc --ignoreDeprecations 6.0` (exit 0). Client-only, no schema/backup impact.
Mobile (390px) not visually re-tested — a scroll nudge + a list-order flip, no layout change.

### What Was Just Completed — Action reminders: weekday/weekend default time + forgiving time entry (2026-06-30)

Two owner asks for the action **Time (optional)** field, **schema-free**, pushed to `main` (`4a42849`).
1. **Default reminder time is now 8:00 AM weekdays / 10:00 AM weekends** (was a flat 09:00), chosen by
   the due **date's weekday**. New `defaultReminderTime(dueDate)` lives in **both** the server
   (`server/src/lib/push.ts`, used by the cron's `reminderDueInstant` — replaced `DEFAULT_REMINDER_TIME`)
   and the client (`client/src/lib/action-time.ts`, drives the "Remind me (defaults to …)" hint, which
   now shows the right time for the picked date). Weekday read via `getUTCDay()` on the `YYYY-MM-DD` parts
   (calendar weekday is tz-independent). **Note:** this changes existing reminders that rely on the
   implicit time (notify on, no `dueTime`) from 9 → 8/10 — intended.
2. **Forgiving free-text time input** (fixes the screenshot bug where the native `<input type="time">`
   rejected partial entries like "9a" with a "Please enter a valid value" popup). New
   `client/src/components/time-input.tsx` (`TimeInput`) replaces the native time input on both action
   surfaces (the full action form **and** the inline `ActionDateSelect` popover). Backed by
   `parseTimeInput` in `action-time.ts`: a bare hour assumes **:00** minutes and an `a`/`p` suffix sets
   AM/PM — "9"→9:00 AM, "9a"→9:00 AM, "2:30p"→2:30 PM, "1400"→2:00 PM, "12a"→12:00 AM; blanks clear;
   unparseable input flags the field (red border) instead of a browser popup. Shows the value back in
   friendly "9:00 AM" form on blur. The meeting-log start-time field (`quick-log-dialog.tsx`) was left on
   the native input — out of scope (this was an actions ask).

Client typecheck (with the pre-existing tsconfig `baseUrl` deprecation bypassed — newer TS in the fresh
container) and the backup-coverage guard both green; the server `tsc` couldn't run (npm registry
`ECONNRESET` in this container blocked installing server deps), but the server edit is pure date
arithmetic with **no new imports** — verified its logic + the parser with a standalone Node test (25
cases incl. weekend/weekday boundaries and invalid input, all pass). Vercel build is the real gate.
**Mobile (390px) NOT visually re-tested** — it's a single text input swap.

### What Was Just Completed — Meetings list: time-aware sort + "Upcoming" flag + "Hide upcoming" toggle (2026-06-29 s3)

Three **schema-free** owner asks for the `/meetings` **list** view, each pushed to `main` on its own commit.
1. **Time-aware Date sort** (`131a503`): sorting by date now breaks ties on `startTime` so same-day
   meetings order by time of day — server `orderBy: [{date},{startTime}]`. SQLite/libsql ranks a NULL
   `startTime` as smallest (first asc / last desc) → untimed meetings behave as start-of-day, no `nulls`
   clause needed. (`startTime` is zero-padded "HH:MM", so string ordering is correct.)
2. **"Upcoming" indicator** (`131a503`, rule refined in `bbdaccd`): future meetings get a sky
   left-border + an "Upcoming" pill (dot **and** label → not color-only, PWA-safe). `isUpcomingMeeting` =
   future date, OR today with a `startTime` still ahead of now, OR today & untimed & before **5 PM ET**
   & nothing written up yet (`summary`/`notes`/`nextSteps`; **prep notes excluded**, they're pre-meeting).
   "Now" is computed in **America/New_York** (`easternNowParts`, DST-aware) since meeting dates/times are
   stored ET — not the browser zone.
3. **"Hide upcoming" toggle** (`070a651`): a Switch by the sort control (added the missing shadcn
   `client/src/components/ui/switch.tsx`; unified `radix-ui` pkg was already installed), persisted
   `?hideUpcoming=1`, list-view only. Filtering is **server-side** so the paged `total`/`hasMore` stay
   correct — the client sends its ET `today`+`now`; the server's `notUpcomingClause` is the **exact
   complement** of `isUpcomingMeeting` (traced all four buckets), so it hides precisely the flagged set.
   Skips the filter if `today`/`now` are missing/malformed (no server clock guess).

Client+server typecheck, `prepush` (backup guard — 32 tables), and full client `vite build` + server `tsc`
all green. **Mobile (390px) NOT visually re-tested this session** — the changes are a border accent, a small
pill, and a header Switch (controls row made `flex-wrap` so it wraps on narrow screens); no dialog/layout
changes, so low-risk, but eyeball it if convenient.

### What Was Just Completed — Duplicate dismissals + auto-merge now persist (2026-06-29 s2)

Owner reported that **dismissed duplicate matches kept coming back** (on a return visit / another
device), and asked for two new behaviors: a once-dismissed pair should **stay dismissed when it
recurs via a fresh import**, and **"combine ABC-D into ABC" should auto-apply to future imports** of
either name. **SCHEMA** (2 new tables, Turso **DDL applied by owner**), pushed to `main`.

- **Root cause:** dismissals lived only in browser `localStorage`, keyed by **row id** → never synced
  across devices, never matched a reimport's new ids.
- **Fix:** new **`DismissedDuplicate`** (`type`,`nameKey1`,`nameKey2`) + **`DuplicateMergeRule`**
  (`type`,`removedKey`,`keptKey`) tables, **keyed by normalized name** (so decisions survive a
  reimport). `POST /api/duplicates/[companies/]dismiss` persists dismissals; the merge endpoints
  record a merge rule. The scan (`GET /api/duplicates[/companies]`) now returns `{ pairs,
  autoMergedCount }`: a pair matching a **merge rule auto-merges** (reimported "ABC-D" folds into
  "ABC" via the extracted `runContactMerge`/`runCompanyMerge`); a pair matching a **dismissal is
  hidden**; client toasts auto-merges.
- **Precedence (important):** **merge rules outrank dismissals** — the scan checks rules *before*
  dismissals, and a merge **deletes any stale dismissal** for the pair (intent "ignore"→"combine").
  (The first cut had this backwards and would have *hidden* reimported pairs instead of merging them;
  caught in self-review and fixed.)
- Both tables added to **both backup paths** (guard now sees **32** tables); also fixed two earlier
  build breakers (literal Unicode in regex → `\uXXXX`; a statement stranded outside its function).
- **Known design choices (surfaced to owner, not yet built):** auto-merge fires **lazily on
  Duplicates-page load** (no separate import-time hook); **merge rules are permanent with no
  review/revoke UI**. Revisit if the owner wants either.

### What Was Just Completed — Meeting-participant UX (2026-06-29)

Five owner asks for the Quick Log / meeting editor, **schema-free**, pushed to `main` (`ce9f306`; lockfile chore `c0abed3`).
1. **Create-on-add:** adding a participant (typed-in free text or pasted) now **creates the Contact immediately** (`handleParticipantsChange` POSTs `/contacts`, swaps free-text→id in place) instead of deferring to "Done" — it has an id at once.
2. **Click-through:** participant names in the editor are now **links to `/contacts/:id`** (flush + close the dialog on the way); meetings-list pills already linked.
3. **Contacts default sort** ("most-recently-updated on top") was **already correct** — verified live (create-via-API lands on top, then deleted; net-zero). No code change.
4. **Auto-cleanup:** a contact created via the participant field that's **removed again before gaining other info is deleted** (`autoCreatedParticipantsRef` per dialog session; `ConversationParticipant` is onDelete Cascade; matched/pre-existing contacts never tracked).
5. **Bulk paste:** paste an Outlook recipient list (`Name <email>; Name <email>; bare name`) into the Participants field → new **`POST /api/contacts/resolve-participants`** matches each by email (primary/`additionalEmails`, case-insensitive) → exact name → else creates (CONNECTED/NETWORK). `MultiCombobox` gained opt-in `onBulkPaste` (intercepts only `;`/newline/`<email>`-shaped pastes); ids merged deduped, new ones tracked for auto-cleanup, toast summarizes "added / already in contacts / new". Verified the endpoint live (create, in-paste dedup, name-match, case-insensitive email-match) with all test rows deleted after. Typecheck (client+server) + full client `vite build` + `prepush` backup guard green.

Known small edge: a **name-only** paste written "Last, First" with no email won't match a "First Last" contact → creates a new one (emails sidestep it).

### What Was Just Completed — Contact company-sort and Idea deep-links (2026-06-28)

Owner reported two UX bugs, both fixed and pushed to `main`.
1. **Contact Sorting by Company:** The Contacts list `sortBy === 'company'` was broken because the display company is dynamically resolved (`company.name ?? companyName`). Fixed in `server/src/routes/contacts.ts` by checking if the sort is 'company', and if so, fetching all unpaginated matching contacts, computing the display name in JS (unified lowercase comparison, pushing empties to the end), and then paginating the sorted array.
2. **Idea Deep-Linking from Global Search:** Clicking an idea in `/search` just took the user to the `/ideas` homepage. Added support for `/ideas?id=N` deep-linking. Updated `search.tsx` and `command-palette.tsx` to link with the param. In `idea-list.tsx`, read the param on mount, auto-expand the target idea, and scroll it into view. Added a temporary visual highlight (`ring-2 ring-primary` or similar via Tailwind `highlightedId` state) so it's obvious which card was targeted even if the description is short. Fixed a bug where `useRef` was incorrectly passed a lazy initializer function.



### What Was Just Completed — Backup coverage fix: `Series` + `IdeaTag` were missing (2026-06-25)

Owner asked to confirm backups (automated **and** manual) still fully restore everything after the
recent additions. Audited all **32 Prisma models** against both backup enumerations — the server
`buildExport` (cron→Vercel Blob + `/export`) **and** the browser-direct Turso `TABLES_PARENT_FIRST`
(plus the matching `/import` + `importViaTurso` restore orderings). They covered only **28 of 30**
user-data tables. **Two tables shipped after the list was last touched and were silently omitted:**
- **`Series`** (recurring-meeting series; `Conversation.seriesId → Series.id`). A restore into a fresh
  DB lost all series names and left conversations with a dangling `seriesId` → under FK enforcement
  that **aborts the entire restore transaction**.
- **`IdeaTag`** (tags-on-ideas junction). Ideas silently lost their non-legacy tag links on restore.

Fix (`2dcd3b8`, **schema-free** — both tables already exist in Turso, no DDL): added both to the
browser-direct list (`Series` before `Conversation` so inserts stay FK-safe + the reverse deletes it
after; `IdeaTag` after Idea+Tag), to the server export, and to the `/import` delete+insert ordering;
bumped backup `_meta.version` 6→7 in both paths. Also added `notify`/`owedByMe`/`archived` to
`/import`'s `BOOLEAN_FIELDS` (booleans added since) so a browser-export → local-dev import doesn't
trip Prisma validation. **`PushSubscription`** (device keys) + **`DeletedSnapshot`** (undo stack) are
confirmed *deliberately* excluded as ephemeral. Verified against local SQLite: all 30 user tables
accounted for, 0 unaccounted-for. Typecheck (client+server) + full client `vite build` green.

> **Standing invariant (now auto-enforced):** any **new Prisma model** that holds user content MUST be
> added to **both** backup paths (`server/src/routes/backup.ts` export + `/import`; `client/src/lib/backup.ts`
> `TABLES_PARENT_FIRST`) — parent-before-child for inserts. Only `PushSubscription` + `DeletedSnapshot`
> are exempt. **A guard now enforces this:** `server/scripts/check-backup-coverage.mjs` (in `npm run prepush`
> **and** the Vercel `build:vercel`) parses the schema + all three enumerations and **fails the build** if a
> model is uncovered — so this can no longer be silently forgotten. Add new models to the backup, or to the
> guard's `EXEMPT` set.

### Previously Completed — Time-of-day auto-enables "Remind me" (2026-06-24)

Tiny owner ask, **schema-free, pushed to `main`.** Picking a time of day on an action now defaults
its **"Remind me"** reminder to **ON** — implemented in both editing surfaces: the inline
`ActionDateSelect` popover (`updateTime`) and the full action form's time `<Input>`. Auto-enables only
when `notify` is currently off (won't fight a deliberate later toggle-off within the same edit), and
runs the same `ensurePushForReminder()` device-subscribe + Settings-fallback toast as the manual bell.
Toggle-off still works; clearing the date still drops time+notify. Runbook note added to
`.planning/ACTION-REMINDERS.md`. Typecheck (client+server) + full client `vite build` green.


### What's Next

1. **No carried-over primary task** — the just-completed session was itself a bug-fix session (duplicate
   auto-merge, see above), not a continuation of plan work. *Long-standing optional* leftovers, still
   open from a much older (2026-06-24) merge bug-fix session: **(a)** re-attach the merged
   **"Seth Glickman"** to the meeting he lost (the pre-fix merge cascade-deleted his participant link)
   — reopen that meeting → add him; the picker now refreshes so he's selectable. **(b)** a one-off
   **audit/repair of *earlier* contact merges** that may have similarly lost
   `ConversationParticipant`/`ActionContact` links or orphaned `ConversationMention`s — not run
   (forward-fix only). Action reminders are feature-complete + live; opt-in extensions (snooze,
   reminders for no-due-date actions, a Settings "test notification" button) stay unbuilt until asked.
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
  the stray empty `server/dev.db`, not the populated `server/prisma/dev.db` the server opens.
  **Verified fix (2026-07-07):** pass the file explicitly —
  `npx prisma db push --url "file:C:/dev/personal/searchbook/server/prisma/dev.db"` (Prisma 7 flag) —
  which synced the drifted local DB additively with no data loss. The dual-mode libsql migration
  script pattern (`server/scripts/archive/`) remains the fallback.
- Run `tsc -b` / full `vite build` (not just `npm run prepush`) before every push — it catches
  unused imports the typecheck misses.
- Dev smoke: server 3001, client 5173. The local app has `APP_PASSWORD` unset → seed any non-empty
  `localStorage.searchbook_password` ('devlocal' works) to pass the login gate. Device-emulation
  `390x844` gives a true mobile viewport.

### Working branch

`main` tip is **`ab13a09`** — the **2026-07-07** action ownership quick-switch session
(**schema-free, client-only, no Turso DDL, no held commits**): `e2f5a63` (new
`client/src/components/action-owner-select.tsx` popover on dashboard rows + `dashboard.tsx`
waiting-sink sort) → `f70886c` (docs) → `ab13a09` (same popover on the `/actions` list page —
desktop "Ownership" column + mobile inline trigger — with its docs folded in). Before it:
**`f1bb55d`** — the **2026-07-06** meeting-log dialog polish (wider default `sm:w-[52rem]` +
Ctrl-click a participant name keeps the log open; **schema-free, client-only, no Turso DDL, no held
commits**). Before it: the **2026-07-04** docs/handoff commit on top of **`28fb55a`** — the meeting-search
read-only detail view + its "Edit meeting" fix (`182885e` feat → `28fb55a` edit-button; schema-free,
client-only, no Turso DDL). Before it, the tip was the **2026-07-03** docs/handoff commit on top of
**`63cc211`** — the weekday-only-recurrence feature (**SCHEMA**: `Action.recurringWeekdaysOnly`; **Turso DDL
applied by owner**). That closed the
2026-07-03 batch: `6646c88` (dashboard priority-pill/idea-width/input-outline) → `8035c08` (pills inline
+ combobox outlines) → `02c29b8` (hide `OTHER` type pill) → `876d3fc` (carry reminder onto recurrences,
schema-free) → `63cc211` (weekday recurrence). All pushed straight to `main`; the schema commit was held
until the owner confirmed the DDL. **⚠ No held commits / no outstanding DDL now** (the column exists in
Turso). Before this batch, `main` tip was **`18a698f`** — the s5 picker-ranking / toolbar-less-markdown /
Edge-highlight work above (`3391b43` the three features + `18a698f` the Edge highlight fix; both
client+server, **schema-free, no Turso DDL**, committed straight to `main`). Before it, a docs commit
(`abbe88e`, s4 handoff) on top of
**`033673e`** — the meeting-notes scroll-bar-flicker fix (`[scrollbar-gutter:stable]`, client-only,
schema-free; developed on `claude/meeting-notes-scroll-flicker-9lopxu`, fast-forwarded in).
Before it: the series prep-notes reuse feature (3 commits `ef46ee0` →
`5c66d4e` → `d0fcadb`), on top of two docs commits (`5a39094` handoff refresh, `3ddb4b0` backup-schema
reference) and the two duplicate-auto-merge fixes (round 1 `4112a85`, round 2 `2109fac`, on top of prior
tip `d712012`). The prep-notes work was committed straight to `main` (schema-free, owner's standing
permission). The duplicate-merge rounds were developed on the task-assigned branch
`claude/org-merge-dedup-issues-ddtn2r`, fast-forwarded into `main` at the owner's request both rounds;
that branch is kept in sync (identical history to `main`) — fine to delete or ignore. **Schema-free**,
no Turso DDL outstanding, no held commits.

**Known gaps left deliberately out of scope this session** (surfaced while fixing the above, not bugs
in what shipped): **(a)** the creation-time merge-rule check (`resolveExistingCompanyByName` /
`POST /companies/resolve`) only exists for **companies** — an analogous "merge two contacts, then create
a new contact whose name was the removed one" would still create a fresh duplicate contact immediately
(it *would* still get auto-merged on the next Duplicates-page visit, since the scan-level
`applyMergeRules` fix covers contacts symmetrically — this gap is creation-time only). Build the contact
equivalent if the owner hits this. **(b)** The standalone **"Add Company"** page and the org `@`-mention
**"Create organization"** button still don't consult merge rules — left alone on purpose since those are
deliberate "make a new company" actions, not implicit name resolution; revisit if that assumption proves
wrong in practice.

Prior to that, `main` had: meeting-log polish **(caret-stays-in-view + new-actions-on-top)** (`a34f6aa`,
client-only), action reminders weekday/weekend default time + forgiving time entry (`4a42849`), meetings-list
time-aware sort + Upcoming flag + Hide-upcoming toggle (`070a651`), meeting-participant UX (`ce9f306`).

---

### Suggested kickoff prompt for the next session

Durable version (works every session — it defers to the docs, which stay current):

> Start a SearchBook session: read `AGENTS.md` and follow its "Session start" steps, then summarize
> where we left off and what's next before doing anything.

Context for *this* upcoming session specifically: the most recent session (**2026-07-07**) was
**owner UX asks** for the actions workflow — a new inline **ownership quick-switch popover**
(`ActionOwnerSelect`: hand an action off to a linked contact / searched contact / "someone — no name",
or take it back, all in 1–2 clicks, driving the existing `owedByMe`/`owerContactIds` model — no schema
change) on **both the dashboard rows and the `/actions` list page**, and **untimed "waiting on someone
else" items now sink to the bottom of the dashboard Today + Overdue lists**. Schema-free, client-only,
live on `main` (`e2f5a63` → `ab13a09`); verified in-browser desktop + 390px mobile; nothing pending.
Also fixed the drifted local `server/prisma/dev.db` via `prisma db push --url` (see caveats). Top
"What Was Just Completed" entry above; `SESSION-HISTORY.md` 2026-07-07. Before it (**2026-07-06**):
two small **owner UX asks** for the Quick Log / meeting editor — the dialog's **default width** widened to
`sm:w-[52rem]` (matching Ideas), and **Ctrl/Cmd-clicking a participant name** now opens that contact in a new
browser tab **without closing the meeting log** (so you can document about the person while continuing to
document the meeting); a plain click still navigates + closes as before. Schema-free, client-only, live on
`main` (tip `f1bb55d`); nothing pending. Top "What Was Just Completed" entry above; `SESSION-HISTORY.md`
2026-07-06. Before it (**2026-07-04**) was a single **owner UX ask** — meeting results in **global search**
now open a **read-only expanded detail view** (full notes + prep notes + next steps + related chips, fetched
via `GET /conversations/:id`) with the **search term(s) highlighted** inside the rendered markdown, and an
**"Edit meeting"** button that opens the canonical Quick Log editor for that specific meeting
(`useQuickLog().openEdit`). Schema-free, client-only (`182885e`→`28fb55a`); `SESSION-HISTORY.md` 2026-07-04.
Before it (**2026-07-03**) was a batch of
small **owner UX asks** plus two action-recurrence fixes — dashboard pill declutter (HIGH-only priority,
hide `OTHER` type, pills inline to the right of the name), wider idea dialog, darker form-field/combobox
outlines (Edge visibility), **reminder now carried onto recurring occurrences** (was silently dropped after
the first fire), and **weekday-only recurrence** (new `Action.recurringWeekdaysOnly` — the one **schema**
change; Turso DDL applied by owner). Top "What Was Just Completed" entry above; `SESSION-HISTORY.md`
2026-07-03. Live on `main` (tip = a docs commit on `63cc211`), **nothing pending, no outstanding DDL.**
Before it (2026-07-02 s5): a bundle of three small owner UX enhancements — relevance-ranked
participant/@-mention pickers (engagement-primary), toolbar-less markdown in the contact documentation
boxes, and an Edge @-mention-highlight visibility fix (schema-free, `18a698f`). Earlier the same day: an s4
scroll-flicker fix, an s3 series-prep-notes
feature, and a two-round **bug-fix session** (via a GitHub task) chasing
the duplicate-org auto-merge feature — full detail in its "What Was Just Completed" entry above and
`SESSION-HISTORY.md` 2026-07-02 (both entries). Short version: round 1 found
merge rules silently never got recorded when two names shared a normalized core key (the single most
common real-world dup shape); round 2 (owner tested live, still broken) found the Duplicates-page
fallback never even *considered* a rule unless the heuristic similarity scan also flagged the pair as a
candidate — so an acronym merged into its spelled-out name ("NCQA" → "National Committee for Quality
Assurance (NCQA)") was invisible to the whole system — and that nothing consulted merge history at
company-creation time at all, across **6** different client call sites. Both schema-free, both live on
`main` (tip `2109fac`). Two known, deliberately-scoped-out gaps are noted in "Working branch" above — check
those before assuming a related report is a new bug. Plan of record is `.planning/NCQA-ADAPTATION-PLAN.md`
(Phase 3+, gated on the "⏳ Waiting on owner" block, D5/D6/D8/D9) — untouched this session.
Nothing is pending (no Turso DDL, no held commits).
