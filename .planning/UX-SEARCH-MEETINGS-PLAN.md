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
- **STATUS:** Done (2026-06-13). Desktop top-bar hint → outline `Button` ("Search" + Ctrl+K adornment) wired to `useCommandPalette().open`; mobile icon button unchanged. Verified desktop (opens palette) + 390px (button hidden, icon button remains).

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
- **STATUS:** Not started.

**B2 — Weighted free-text ranking in Meetings search (#5).** Commit: `feat(meetings): weighted free-text ranking + full-field coverage`
- Today's `q` box in [server/src/routes/meetings.ts](server/src/routes/meetings.ts) is a flat OR over a few fields, sorted by date only (literal answer to "what does Search text do?").
- Expand `q` coverage to all meeting fields (mirror `conversationClausesFor` in search.ts: title, summary, notes, nextSteps, attendeesDescription, contact/company/orgs names, participant names + notes, tags, prep notes, discussed people/orgs).
- When `q` present: fetch a capped superset (`take: 300` of the filtered set), score in JS, sort by score desc then date desc, paginate the ranked array (same fetch-all-then-slice shape as the series-title path). Priority: **title=4 > people in the meeting (participants/anchor names)=3 > org names + attendees description=2 > everything else=1** (no single "the contact" in the unified model → all named people score 3).
- **STATUS:** Not started.

**B3 — Search performance: lazy related + parallelize (#9).** Commit: `perf(search): lazy related entities + parallel queries`
- Server [server/src/routes/search.ts](server/src/routes/search.ts):
  - Add `GET /api/search/related/:type/:id` (`type`=`contact|company`) reusing `getContactRelated`/`getCompanyRelated`.
  - In `GET /api/search`, default `includeRelated` to **false** (drop the eager fan-out from the hot path).
  - `Promise.all` the independent top-level work (per-term company lookups, the 5 entity `findMany`s, the 5 `count`s) — they run sequentially today.
  - Collapse the `additionalCompanyIds` `findUnique`-per-company loop in `getContactRelated` into one `findMany`.
- Client [client/src/pages/search.tsx](client/src/pages/search.tsx): stop sending `includeRelated=true`; replace the precomputed related-count badge with a "Related ▸" expander that lazy-fetches via the new endpoint on first open and caches by `type-id`.
- **Tradeoff (accepted):** the per-card related **count badge** goes away (it required fetching related up front) → plain "Related ▸" expander, count after open; expanding incurs one brief single-entity fetch. *Not* doing FTS (text scan isn't the bottleneck at this scale) or result caching (stale-data risk, single user). Revisit FTS only when `LIKE` scans themselves dominate the `[TIMING]` line.
- Expected: hot-path ~150 queries → ~15, parallel → ~1–2s. Verify via the existing `[TIMING] search …` log line.
- **STATUS:** Not started.

---

## Phase C — Unify on the Quick Log meeting editor (#3, #4, #7) — largest change

**C1a — Quick Log: autosave + drop the 1:1 anchor + participant-first display.** Commit: `feat(meetings): Quick Log autosave + drop 1:1 anchor + participant-first display`
- [client/src/components/quick-log-dialog.tsx](client/src/components/quick-log-dialog.tsx):
  - **Drop the "Contact (1:1 anchor)" Combobox** (~L617-625); stop sending `contactId` for new meetings. Edit mode also does **not** send `contactId` → legacy anchors preserved untouched (PUT "never changes the anchor unless `contactId` is explicitly sent"). People are managed solely via **Participants**.
  - **Autosave** (debounced ~1.5s): build the same payload as `handleSave`; if the meeting doesn't exist yet and is valid (date always set + at least one of title/participant/notes/summary), **POST once** to create + capture id; thereafter **PUT**. Track a `lastSavedSnapshot` to skip no-op saves. Once the record exists, persist staged prep notes/attachments/actions live. Show a save-status indicator (reuse the visual from [client/src/components/save-status.tsx](client/src/components/save-status.tsx)). Footer "Cancel" → "Close/Done" once autosaved; add a small "Delete this meeting" to discard an unwanted autosaved record. Implement a focused autosave effect in the dialog (don't bend `useAutoSave`, which early-returns when `originalData` is null).
  - **Participant-first display fallback** so a participant-only 1:1 still shows the person's name: resolution becomes `title → anchor contact → company → first participant → attendeesDescription → 'Meeting'` in the meetings card ([client/src/pages/meetings.tsx:352](client/src/pages/meetings.tsx#L352)) and search `displayName` ([server/src/routes/search.ts:633](server/src/routes/search.ts#L633)). `/api/meetings` + search selects already include participants.
- **STATUS:** Not started.

**C1b — Retire the contact-page inline editor; seed the participant.** Commit: `feat(meetings): contact page logs via Quick Log (seeded participant)`
- Extend `useQuickLog().open` to accept an optional prefill: `open(opts?: { participant?: { id:number; name:string }; title?: string })` → seed `participantIds=[id]`, ensure that contact is in `contactOptions` (chip renders), expand "Who was there."
- [client/src/pages/contacts/contact-detail.tsx](client/src/pages/contacts/contact-detail.tsx) `ConversationsTab`: replace the inline create/edit form with a **"Log Meeting"** button → `quickLog.open({ participant:{ id:contact.id, name:contact.name } })`; **edit** existing → `quickLog.openEdit(id)`; keep the meetings **list** (read-only + edit/delete). Refresh on the `searchbook:meeting-logged` window event. Remove the dead inline-form state, its `useAutoSave`, and the new-conversation draft-localStorage wiring. (Read the full `ConversationsTab`, ~L1179–end, before cutting.)
- **STATUS:** Not started.

---

## Phase D — Dedicated Meetings calendar (#8)

Commit: `feat(meetings): meetings calendar view`
- Add a **List | Calendar** toggle to the Meetings page header ([client/src/pages/meetings.tsx](client/src/pages/meetings.tsx)); meetings-only (separate from the actions calendar at [client/src/pages/calendar.tsx](client/src/pages/calendar.tsx)).
- FullCalendar (already a dep; pattern in calendar.tsx). Fetch the visible range via `/api/meetings?from=&to=&limit=` (high limit for a month). Each meeting → all-day event titled by display name, colored by `type` (reuse `conversationTypeColors`). Click → `quickLog.openEdit(id)`. Future-dated meetings appear naturally → advance prep. Mobile defaults to list view (mirror calendar.tsx `isMobile`).
- **STATUS:** Not started.

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
