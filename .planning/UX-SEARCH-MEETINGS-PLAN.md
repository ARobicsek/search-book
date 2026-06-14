# SearchBook — UX Polish, Search Fixes/Perf, Meeting-Editor Unification, Meetings Calendar

**Created:** 2026-06-13 (planning session — approved, **not yet implemented**)
**Status:** Plan approved by owner. No code written yet. Implement top-to-bottom (Phase A → E).
**Plan of record for:** the owner's 13-item worklist from 2026-06-13. (The NCQA adaptation plan,
`.planning/NCQA-ADAPTATION-PLAN.md`, remains the plan of record for Phases 3–5 NCQA work; this doc
is the active build target first.)

## How to use this document
- Work **top to bottom**; phases are ordered low-risk → high-risk. One **atomic commit per chunk** (GSD).
- After each chunk: `npm run prepush` (typecheck) **and** a client build (`tsc -b` is stricter than the
  typecheck script — it has broken Vercel builds before via `noUnusedLocals`), then a local smoke test at
  **desktop and 390px**. Update the chunk's **STATUS** line. Owner has standing permission to push to `main`.
- **No schema changes in this plan** → no Turso DDL required. (`ecosystem`/`status` are plain TEXT columns;
  adding an allowed value is code-only.)

## Decisions (owner, 2026-06-13)
- **D-A. Unify on the Quick Log dialog** as the single meeting editor app-wide; retire the contact-page
  inline editor; seed the originating contact as a Participant; add autosave; drop the "1:1 anchor" field.
- **D-B. LinkedIn import stays paste-text only** this session (no screenshot/AI-vision path). #12 dropped.
  (Future option if revisited: screenshot → existing gpt-4o-mini vision extraction — needs no new key.)
- **D-C. Separate Meetings calendar** (meetings-only), distinct from the actions calendar.

## Worklist → phase map (traceability)
| # | Ask | Phase |
|---|-----|-------|
| 1 | Clickable search icon in top bar (not "Ctrl+K" text) | A2 |
| 2 | Searching a participant takeaway ("French") should return the person's card, not just the meeting | B1 |
| 3 | "Log Meeting" should autosave like opening a meeting from a contact does | C1a |
| 4 | Call conversations "meetings" everywhere (one encounter type) | E |
| 5 | Define/rank what the Meetings "Search text" box does (title > contact > others > rest) | B2 |
| 6 | Apply markdown formatting (H3/bold/list) **before** typing, not only after selecting | A4 |
| 7 | Drop Quick Log's "Contact (1:1 anchor)"; seed Participants from the originating contact | C1a/C1b |
| 8 | Calendar of meetings by date (prep ahead, click to log/see prep) | D |
| 9 | Search is slow (~20s for "analytics") — will it scale? | B3 |
| 10 | Add `Consultant` as an Ecosystem | A1 |
| 11 | Mobile: one tap to clear Search | A3 |
| 12 | LinkedIn import on mobile / easier pull | **dropped (D-B)** |
| 13 | Meetings "Search text" should highlight matches (like main Search) — added 2026-06-14 | B4 |

## Key code facts (from the planning read)
- **Two meeting editors today:** app-wide Quick Log ([client/src/components/quick-log-dialog.tsx](client/src/components/quick-log-dialog.tsx), saves only on button — *no autosave*) vs. the contact-page inline `ConversationsTab` ([client/src/pages/contacts/contact-detail.tsx](client/src/pages/contacts/contact-detail.tsx), which autosaves drafts via [client/src/hooks/use-auto-save.ts](client/src/hooks/use-auto-save.ts)). This split is the root of #3/#4/#7.
- **~20s search = Turso round-trip count, not data volume.** `includeRelated=true` (always sent) fans out to ~150 queries (`getContactRelated` ≈6/contact, `getCompanyRelated` ≈4/company, up to 20 each); the top-level entity finds also run sequentially. No FTS needed at this scale.
- LinkedIn parse uses **OpenAI gpt-4o-mini** ([server/src/routes/linkedin.ts](server/src/routes/linkedin.ts)).
- APIs: `useCommandPalette().open()` ([client/src/components/command-palette.tsx:33](client/src/components/command-palette.tsx#L33)); `useQuickLog().open()` / `.openEdit(id)` ([client/src/components/quick-log-dialog.tsx:55](client/src/components/quick-log-dialog.tsx#L55)).
- Participant note relation on Contact = `participantInConversations` ([server/prisma/schema.prisma:53](server/prisma/schema.prisma#L53)).

---

## Phase A — Quick wins (low risk, independent)

**A1 — Add `Consultant` ecosystem (#10).** Commit: `feat(taxonomy): add Consultant ecosystem`
- [client/src/lib/types.ts](client/src/lib/types.ts): add `'CONSULTANT'` to the `Ecosystem` union and a `{ value:'CONSULTANT', label:'Consultant' }` entry in `ECOSYSTEM_OPTIONS`.
- Server ecosystem allow-list in [server/src/routes/contacts.ts](server/src/routes/contacts.ts) — add `'CONSULTANT'`.
- Color maps: add `CONSULTANT` to `ecosystemColors` in [client/src/pages/search.tsx:45](client/src/pages/search.tsx#L45) and sibling maps (grep `ecosystemColors` across `client/src`). `|| ''` fallbacks make any missed spot degrade gracefully.
- **STATUS:** Done (2026-06-13). Client-only: added `CONSULTANT` to the `Ecosystem` union + `ECOSYSTEM_OPTIONS` (label "Consultant"), all four `ecosystemColors` maps (`bg-teal-100 text-teal-800`), and the CSV-import synonym map. **No server allow-list exists** — `ecosystem` is a plain passthrough TEXT column with no validation, so no server change was needed (plan's assumption corrected). Verified: option renders in the new-contact ecosystem dropdown.

**A2 — Clickable search in the top bar (#1).** Commit: `feat(ui): clickable top-bar search + mobile clear`
- [client/src/components/layout.tsx:52-57](client/src/components/layout.tsx#L52): replace the non-clickable `Ctrl + K` hint with a clickable desktop search **Button** (Search icon + "Search", kbd hint as adornment) → `useCommandPalette().open()`. Keep the existing mobile search button.
- **STATUS:** Done (2026-06-13). Desktop top-bar hint → outline `Button` ("Search" + Ctrl+K adornment); mobile icon button unchanged. **Follow-up fix (same day):** initially wired to `useCommandPalette().open` (small cmdk modal, felt broken/no results); rewired to `navigate('/search')` so it lands on the full Search page — matching **Ctrl+K** (which navigates to `/search`, not the palette) and the existing mobile search icon. Verified desktop (lands on /search) + 390px (button hidden, icon button remains).

**A3 — One-tap clear on Search (#11).** (same commit as A2)
- [client/src/pages/search.tsx](client/src/pages/search.tsx) input (~L712): absolute-right **X** clear button shown when `query` non-empty → `setQuery('')`; touch-sized hit area on mobile. Add the same to the Meetings "Search text" input ([client/src/pages/meetings.tsx:287](client/src/pages/meetings.tsx#L287)).
- **STATUS:** Done (2026-06-13). Search input: `pr-12` + absolute `h-10 w-10` X button (touch-sized) shown when `query`. Meetings "Search text": wrapped in relative div with `h-9 w-9` X button shown when `qInput`. Verified clear works on Search (desktop + 390px) and Meetings.

**A4 — Apply markdown formatting *before* typing (#6).** Commit: `feat(notes): apply markdown format before typing`
- [client/src/components/markdown-textarea.tsx](client/src/components/markdown-textarea.tsx). Bold/italic already wrap the caret and work button-first. Bug is **headings/lists on an empty line**: `prefixLines`' `allPrefixed` treats an empty line as already-prefixed (`!l.trim()`→true) → strips → no-op. Fix so an empty/whitespace-only selection **always adds** the prefix and parks the caret right after it.
- **STATUS:** Done (2026-06-13). Added an early branch in `prefixLines`: when no selected line has content (`!lines.some(l => l.trim())`), insert `makePrefix(0)` and park the caret right after it. Verified: caret on empty Notes → click H3 → `### ` inserted, caret at col 4, typing "Agenda" → `### Agenda`.

---

## Phase B — Search correctness + performance

**B1 — Participant takeaway notes surface the *person* card (#2).** Commit: `fix(search): participant takeaways surface the person`
- Root cause: per-participant note lives on `ConversationParticipant.note`, matching only as a *meeting* hit; the contact has no matching field. These notes already render on the contact page as "Meeting takeaways," so they should match the person.
- [server/src/routes/search.ts](server/src/routes/search.ts):
  - `contactClausesFor` (under `peopleNotes`): add `{ participantInConversations: { some: { note: { contains: term } } } }`.
  - Contact `findMany` select (~L218): add `participantInConversations: { select: { note: true }, take: 50 }`.
  - `collectContactFields` (under `peopleNotes`): push each participant note as a field, label `'meeting takeaway'`, weight 1.
- **STATUS:** Done (2026-06-13, commit `128b36d`). All three edits applied as planned: clause under `peopleNotes`, `participantInConversations: { select: { note }, take: 50 }` in the contact select, and the `'meeting takeaway'` field push. Verified end-to-end via the live local server with a temporary participant note (token `zzqxtoken` on conv 24 / contact 7, since the local DB has 0 participant notes): searching the token returned **the person's card** (match field `meeting takeaway`) *and* the meeting (match field `takeaway`). Test row removed. Server-only; `npm run prepush` green.

**B2 — Weighted free-text ranking in Meetings search (#5).** Commit: `feat(meetings): weighted free-text ranking + full-field coverage`
- Today's `q` box in [server/src/routes/meetings.ts](server/src/routes/meetings.ts) is a flat OR over a few fields, sorted by date only (literal answer to "what does Search text do?").
- Expand `q` coverage to all meeting fields (mirror `conversationClausesFor` in search.ts: title, summary, notes, nextSteps, attendeesDescription, contact/company/orgs names, participant names + notes, tags, prep notes, discussed people/orgs).
- When `q` present: fetch a capped superset (`take: 300` of the filtered set), score in JS, sort by score desc then date desc, paginate the ranked array (same fetch-all-then-slice shape as the series-title path). Priority: **title=4 > people in the meeting (participants/anchor names)=3 > org names + attendees description=2 > everything else=1** (no single "the contact" in the unified model → all named people score 3).
- **STATUS:** Done (2026-06-13, commit `87a1fc6`). Added `meetingMatchClauses` (full-field OR mirroring `conversationClausesFor`), `meetingRankInclude` (adds discussed people/orgs so a discussed-only match still scores), `scoreMeeting` (max-weight: title 4 / anchor+participant names 3 / anchor+addl org names + attendees 2 / everything else 1), and a `q`-ranking path (take 300 → score → sort by score then date → slice). `total` = ranked length (mirrors series path; >300 matches is implausible for a single user). Verified via API with a controlled token across empty slots: order came out **title(4) > attendees(2) > {participant-note, notes}(1, date-tiebroken)**; test data reset to NULL. Also verified in-browser at 390px (q="health" → 4 meetings, incl. Josh Kellar matched only via discussed org "Intermountain Health" — new coverage). Server-only; `npm run prepush` green.

**B3 — Search performance: lazy related + parallelize (#9).** Commit: `perf(search): lazy related entities + parallel queries`
- Server [server/src/routes/search.ts](server/src/routes/search.ts):
  - Add `GET /api/search/related/:type/:id` (`type`=`contact|company`) reusing `getContactRelated`/`getCompanyRelated`.
  - In `GET /api/search`, default `includeRelated` to **false** (drop the eager fan-out from the hot path).
  - `Promise.all` the independent top-level work (per-term company lookups, the 5 entity `findMany`s, the 5 `count`s) — they run sequentially today.
  - Collapse the `additionalCompanyIds` `findUnique`-per-company loop in `getContactRelated` into one `findMany`.
- Client [client/src/pages/search.tsx](client/src/pages/search.tsx): stop sending `includeRelated=true`; replace the precomputed related-count badge with a "Related ▸" expander that lazy-fetches via the new endpoint on first open and caches by `type-id`.
- **Tradeoff (accepted):** the per-card related **count badge** goes away (it required fetching related up front) → plain "Related ▸" expander, count after open; expanding incurs one brief single-entity fetch. *Not* doing FTS (text scan isn't the bottleneck at this scale) or result caching (stale-data risk, single user). Revisit FTS only when `LIKE` scans themselves dominate the `[TIMING]` line.
- Expected: hot-path ~150 queries → ~15, parallel → ~1–2s. Verify via the existing `[TIMING] search …` log line.
- **STATUS:** Done (2026-06-13, commit `3c7ce1c`). Server: `includeRelated` now defaults to **false**; added `GET /search/related/:type/:id` (reuses `getContactRelated`/`getCompanyRelated`); the per-term company lookups and the 5 entity `findMany`s now run via `Promise.all` (the 5 counts already did); the `additionalCompanyIds` per-company `findUnique` loop collapsed into one `findMany`. Client: stops sending `includeRelated`; the count badge → a plain **"Related"** expander that lazy-fetches on first open and caches by `${type}-${id}` (spinner while loading, "No related items" when empty); refs (`relatedCacheRef`/`relatedInFlight`) guard against duplicate fetches. **Local [TIMING]** `q="health"` (19 contacts + 20 companies): warm **91ms → 31ms** purely from dropping the fan-out, *identical* result counts — local SQLite has no network latency so it can't reproduce the ~20s; the real win is **~200 round-trips → ~12** which on Turso is the ~20s→~1–2s drop (**confirm in prod** — see carry-over #2). Verified desktop + 390px: results render, lazy Related panel populates on expand (Ed Stout → Diversified Search Group / Jacob Kupietzky / 1 conversation), no console errors. `npm run prepush` **and** strict client build (`tsc -b && vite build`) green.

**B4 — Highlight matching text in Meetings "Search text" results (owner ask, 2026-06-14).** Commit: `feat(meetings): highlight free-text matches in results`
- Goal: when the Meetings `q` filter is active, wrap matches in `<mark>` in the result cards, mirroring the main Search page's highlighting.
- **Extract `HighlightedText`** out of [client/src/pages/search.tsx](client/src/pages/search.tsx) into a shared component (e.g. `client/src/components/highlighted-text.tsx`) and import it in **both** search.tsx and [client/src/pages/meetings.tsx](client/src/pages/meetings.tsx) — don't duplicate the merge-overlapping-ranges logic. (Search keeps using it unchanged; this is a pure move + re-import.)
- In meetings.tsx, highlight the **plain-text** fields when `qFilter` is non-empty: the display name (title / contact / company / attendees fallback), `summary`, `attendeesDescription`, `nextSteps`, and the participant / org / tag badge names. Pass `terms={[qFilter]}` and `caseSensitive={false}` — the Meetings `q` is a single trimmed term, case-insensitive, no quotes/multi-term parsing (so don't reuse search's `parseTerms`).
- **Markdown caveat (decide deliberately):** `notes` and prep notes render via `ReactMarkdown` (`prep-note-markdown`). Do **not** inject `<mark>` into the raw markdown string (ReactMarkdown will escape/format it). Recommended default = **leave the markdown body un-highlighted** (matches the main Search, which highlights snippets/plain fields, not full markdown). Only if the owner wants notes highlighted too, do it via a `rehype` plugin over the rendered tree — heavier, separate follow-up.
- Verify desktop + 390px: a `q` search highlights titles/summaries/names; markdown notes still render normally; clearing `q` removes all highlights.
- **STATUS:** Done (2026-06-14). Extracted `HighlightedText` into [client/src/components/highlighted-text.tsx](client/src/components/highlighted-text.tsx) (pure move of the merge-overlapping-ranges logic); `search.tsx` now imports it (unchanged behavior). In `meetings.tsx`, a local `hl(text)` helper wraps matches via `<HighlightedText terms={[qTerm]} caseSensitive={false}/>` when `qFilter` is set (else returns the raw string); `qTerm = qFilter.trim()` mirrors the server's `q.trim()`. Highlighted fields: display name (title/contact/company/attendees fallback), `summary`, italic `attendeesDescription`, `nextSteps`, and the contact/company/org/participant/tag badge names. `notes`/prep notes (ReactMarkdown) left un-highlighted per the markdown caveat. Verified via DOM `<mark>` inspection at desktop + 390px: q="amy" → 2 marks (display-name link + summary, 0 in `.prep-note-markdown`); q="CALEB" → display-name link + nextSteps (case-insensitive); clearing q → 0 marks. Badge highlighting uses the same `hl()` path but local data had no tags/participants/orgs to exercise it live. `npm run prepush` + strict client build (`tsc -b && vite build`) green.

---

## Phase C — Unify on the Quick Log meeting editor (#3, #4, #7) — largest change

**C1a — Quick Log: autosave + drop the 1:1 anchor + participant-first display.** Commit: `feat(meetings): Quick Log autosave + drop 1:1 anchor + participant-first display`
- [client/src/components/quick-log-dialog.tsx](client/src/components/quick-log-dialog.tsx):
  - **Drop the "Contact (1:1 anchor)" Combobox** (~L617-625); stop sending `contactId` for new meetings. Edit mode also does **not** send `contactId` → legacy anchors preserved untouched (PUT "never changes the anchor unless `contactId` is explicitly sent"). People are managed solely via **Participants**.
  - **Autosave** (debounced ~1.5s): build the same payload as `handleSave`; if the meeting doesn't exist yet and is valid (date always set + at least one of title/participant/notes/summary), **POST once** to create + capture id; thereafter **PUT**. Track a `lastSavedSnapshot` to skip no-op saves. Once the record exists, persist staged prep notes/attachments/actions live. Show a save-status indicator (reuse the visual from [client/src/components/save-status.tsx](client/src/components/save-status.tsx)). Footer "Cancel" → "Close/Done" once autosaved; add a small "Delete this meeting" to discard an unwanted autosaved record. Implement a focused autosave effect in the dialog (don't bend `useAutoSave`, which early-returns when `originalData` is null).
  - **Participant-first display fallback** so a participant-only 1:1 still shows the person's name: resolution becomes `title → anchor contact → company → first participant → attendeesDescription → 'Meeting'` in the meetings card ([client/src/pages/meetings.tsx:352](client/src/pages/meetings.tsx#L352)) and search `displayName` ([server/src/routes/search.ts:633](server/src/routes/search.ts#L633)). `/api/meetings` + search selects already include participants.
- **STATUS:** Done (2026-06-14). Dropped the "Contact (1:1 anchor)" Combobox + all `contactId` state; people are managed only via Participants. **Autosave:** a focused debounced (1.5s) effect builds a numeric-only body (scalars + already-resolved participants/orgs/tags; **never** `contactId` or `createActions` — a PUT would re-anchor / re-create those), gated on a server-acceptable "who" (title/org/participant/attendees, since notes/summary alone fail server `hasWho`). **POST-once-then-PUT** via `savedIdRef` + a serialized `saveChainRef` (one POST, no PUT-before-POST); `lastSnapshotRef` skips no-op saves and is seeded from the loaded record in edit mode. Free-text names + follow-up actions are resolved/persisted only by the explicit **"Done"** finalize (`handleSave`, routed through the same chain, also never sends `contactId`). Prep notes/attachments persist live once `savedIdRef` is set, else stage→flush on finalize. Header shows `SaveStatusIndicator`; footer is `[Cancel][Log Meeting]` pre-save, `[Delete this meeting][Close][Done]` post-save; X/Cancel keeps the autosaved record and fires `searchbook:meeting-logged`. **Participant-first display** added to the meetings card + search `displayName`. Verified desktop + 390px: title autosaves (`POST 201`), 2nd edit `PUT`s same id (no dup), Done finalizes (22→23, single row), participant-only meeting shows the person's name in card **and** search (`displayName:"Ziad Obermeyer"`); mobile footer stacks; no console errors. `npm run prepush` + strict client build green.

**C1b — Retire the contact-page inline editor; seed the participant.** Commit: `feat(meetings): contact page logs via Quick Log (seeded participant)`
- Extend `useQuickLog().open` to accept an optional prefill: `open(opts?: { participant?: { id:number; name:string }; title?: string })` → seed `participantIds=[id]`, ensure that contact is in `contactOptions` (chip renders), expand "Who was there."
- [client/src/pages/contacts/contact-detail.tsx](client/src/pages/contacts/contact-detail.tsx) `ConversationsTab`: replace the inline create/edit form with a **"Log Meeting"** button → `quickLog.open({ participant:{ id:contact.id, name:contact.name } })`; **edit** existing → `quickLog.openEdit(id)`; keep the meetings **list** (read-only + edit/delete). Refresh on the `searchbook:meeting-logged` window event. Remove the dead inline-form state, its `useAutoSave`, and the new-conversation draft-localStorage wiring. (Read the full `ConversationsTab`, ~L1179–end, before cutting.)
- **STATUS:** Done (2026-06-14). Extended `useQuickLog().open` to accept `{ participant?, title? }`; the provider passes a `prefill` to the dialog, which (new mode) seeds `participantIds=[id]`, merges the contact into `contactOptions` so the chip labels immediately, and expands "Who was there." `ConversationsTab` rewritten to a lean read-only list: header "Log Meeting" button → `quickLog.open({ participant:{ id, name } })` (needs the new `contactName` prop), each card → `quickLog.openEdit(conv.id)`, delete dialog kept (copy → "Delete this meeting?"), and it refreshes on the `searchbook:meeting-logged` event. Deleted ~1.3k lines: the whole inline create/edit Dialog, `useAutoSave`/draft-localStorage wiring, `editDrafts`, `resolveNewEntries`/`handleSubmit`/inline-action/link handlers, and the `ActionFormEntry`/`ConversationForm` types; pruned the now-unused props (`prepNotes`/`contactOptions`/`companyOptions`/`tagOptions`) + imports (`cn`, `useAutoSave`, `TitleAutocomplete`, `MultiCombobox`, Resizable*, several types/option lists) — caught by `tsc -b`/`noUnusedLocals` (stricter than `typecheck`, which passed). Also fixed `quickLog.open` call sites in `layout.tsx` + `meetings.tsx` (`() => open()`, since `open` now takes an arg). **Added a "meaningful content" gate to the autosave** so a pre-seeded participant alone never auto-creates a meeting (`seededParticipantCountRef`): opening "Log Meeting" from a contact and waiting creates nothing; typing a title/notes (or adding a 2nd who) triggers the first POST. Verified desktop + 390px: contact tab is a read-only list; "Log Meeting" opens Quick Log with the person seeded as a Participant (Who-was-there expanded); idle seed → no POST (total stays 22); typing → `POST`; Done → list refreshes (count 1→2) via the event; clicking a card → "Edit Meeting" loads it; legacy meetings still display. `npm run prepush` + strict client build green; console clean.

---

## Phase D — Dedicated Meetings calendar (#8)

Commit: `feat(meetings): meetings calendar view`
- Add a **List | Calendar** toggle to the Meetings page header ([client/src/pages/meetings.tsx](client/src/pages/meetings.tsx)); meetings-only (separate from the actions calendar at [client/src/pages/calendar.tsx](client/src/pages/calendar.tsx)).
- FullCalendar (already a dep; pattern in calendar.tsx). Fetch the visible range via `/api/meetings?from=&to=&limit=` (high limit for a month). Each meeting → all-day event titled by display name, colored by `type` (reuse `conversationTypeColors`). Click → `quickLog.openEdit(id)`. Future-dated meetings appear naturally → advance prep. Mobile defaults to list view (mirror calendar.tsx `isMobile`).
- **STATUS:** Done (2026-06-14). Added a **List | Calendar** segmented toggle to the Meetings header (`?view=calendar` in the URL; icon-only `<sm`; hidden + forced to list in series/`title` view). New `MeetingsCalendar` component in [meetings.tsx](client/src/pages/meetings.tsx) renders FullCalendar (dayGrid+list+interaction), fetching **only the visible range** via `/api/meetings?from=&to=&limit=100` on FullCalendar's `datesSet` (initial + every nav), keeping the range in a ref to refetch on the `searchbook:meeting-logged` event. Each meeting → all-day event titled via the shared `conversationDisplayName` (extended to the participant-first fallback so 1:1s show the person) and colored by `type` via a new **hex** map `meetingTypeCalendarColors` (FullCalendar needs CSS colors, not the Tailwind `conversationTypeColors` class strings — values mirror the *-100/*-700-800 badge palette). Event click → `quickLog.openEdit(id)`. **Mobile** defaults to `listMonth` (desktop `dayGridMonth`); since `useIsMobile` resolves false→true after mount and FullCalendar reads `initialView` once, a one-frame `ready` gate defers the first mount to the render where `isMobile` is resolved (calendar.tsx dodges this via its fetch-loading spinner). Filters hidden in calendar view (calendar navigates by date). Verified desktop + 390px via chrome-devtools: events land on the correct dates (cross-checked against the API), participant-first names + per-type colors render (CALL→green, VIDEO_CALL→teal, EVENT→rose, OTHER→slate, …), `+N more` overflow, event click opens the right meeting in Edit Meeting, mobile mounts in list view grouped by date, toggle switches both ways, console clean. `npm run prepush` + strict client build (`tsc -b && vite build`) green.

---

## Phase E — Terminology: "Meetings" everywhere (#4)

Commit: `refactor(ui): call conversations "meetings" throughout`
- **UI labels only** — keep the `Conversation` model, `/conversations` API, `Conversation` TS types, event names, and `draft_*conversation*` localStorage keys (mirrors the "Companies → Organizations" label-only relabel).
- Grep user-facing `Conversation`/`conversations` strings in `client/src` → Meeting(s): contact-page tab label + count, remaining "Log Conversation" copy, the delete-impact "conversation log(s)" text ([client/src/pages/contacts/contact-detail.tsx:650](client/src/pages/contacts/contact-detail.tsx#L650)), command-palette entries, headings. (Much of the contact page is handled in Phase C.)
- **STATUS:** Not started.

---

## Verification (end-to-end)
Local `npm start`; drive with chrome-devtools MCP at **desktop and 390px**:
- A1: new-contact form lists Consultant; filter/badge render it.
- A2/A3: top-bar search icon opens the palette; X clears the search box on mobile.
- A4: caret on an empty line → click H3/bullet/numbered → prefix inserted, typing flows in.
- B1: log a meeting with participant "Bill", note "he likes French fries"; search **French** → Bill's *person* card appears (plus the meeting).
- B2: meetings `q` search ranks a title hit above a notes-only hit; covers participant names/notes.
- B3: watch `[TIMING] search …` — broad query (e.g. "analytics") drops from ~20s toward ~1–2s; related panel still loads on expand.
- C: log a meeting from a contact page → Quick Log opens with that person pre-added as a Participant; typing autosaves (status indicator; record exists after close); 1:1 card shows the person's name; legacy anchored meetings still display/edit correctly.
- D: Meetings → Calendar shows logged + future meetings; click → opens the editor.
- E: no user-facing "Conversation" wording remains.

## Out of scope
- **#12 LinkedIn on mobile** — no change this session (D-B).
