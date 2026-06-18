# SearchBook — NCQA Adaptation Plan

**Created:** 2026-06-12
**Status:** **Phases 1 & 2 COMPLETE + deployed (2026-06-12).** Phase 1 (retheme/quick wins, Tasks 1.1–1.4) and Phase 2 (meetings overhaul, Tasks 2.1–2.5) are all ✅ shipped to `main` with Turso DDL applied. **Next unstarted work is Phase 3+** (stakeholder intelligence, AI ingest, Outlook briefing), all gated on the remaining open decisions **D5–D9** — don't push on those until the owner raises them. D1–D4 were resolved 2026-06-12; per D4 there is **no Groups feature** (recurring meetings = autocompleted **titles** / "meeting series").
**Why this exists:** The owner is starting as Chief Medical Officer of NCQA. SearchBook moves from job-search networking CRM to an **executive stakeholder-management system**: mapping who's aligned with two agendas (modernizing healthcare quality measurement; bringing measurement into the AI age), tracking how each person can help (speaking, publishing, funding, amplification, collaboration, advising, intros), and surviving a heavy meeting load with reliable capture and compound follow-ups.

This document is the **plan of record**. Any AI agent (Claude Code or Gemini/Antigravity) picking up work starts here after reading `CLAUDE.md` and `.planning/NEXT-SESSION-PROMPT.md`.

---

## How to use this document

- Work **top to bottom** within a phase; phases are ordered by value-per-effort, but later phases don't strictly block on earlier ones (dependencies are flagged per task).
- One **atomic commit per task** (GSD convention). Each task lists a suggested commit message.
- After each task: `npm run prepush` (typecheck), and test locally with `npm start` where noted. Re-test mobile (390px iPhone PWA) for any UI change.
- Update the task's **STATUS** line when done (date + commit hash + any deviations). Update `.planning/NEXT-SESSION-PROMPT.md` at session end.
- Tasks flagged **[USER ACTION]** need the owner to do something (sign off on a list, set an env var, check NCQA IT policy). Pause and ask.
- **The user has granted standing permission to commit and push to `main`** so changes auto-deploy to Vercel for testing. Still: typecheck + local smoke test before pushing, and never push a schema change to `main` before the corresponding Turso DDL has been applied (see migration procedure below).

### Schema-migration procedure (applies to every task that touches `schema.prisma`)

Prisma `db push` only migrates **local SQLite**. Production Turso needs DDL run directly (per CLAUDE.md):

1. Take a fresh backup (Settings → Create Backup; confirm the daily Blob backup also exists).
2. Update `server/prisma/schema.prisma`; run `npx prisma generate`; `db push` against local SQLite; test locally.
3. Write the equivalent DDL and run it against Turso via a libsql script (temporarily uncomment Turso creds in `server/.env`, re-comment after).
4. Only then push the code to `main`.
- Plain `ADD COLUMN` / `CREATE TABLE` are safe single statements.
- **Dropping NOT NULL (Task 2.1, `Conversation.contactId`) requires a SQLite table rebuild**: create `conversations_new` with the new shape → `INSERT INTO ... SELECT` → drop old → rename → recreate indexes, inside one transaction. Backup first; verify row counts after.

---

## ⏳ Waiting on owner (blocks Phase 3+)

These are the open items gated on info/decisions only the owner can provide — Phase 3 and later
can't proceed without them. Raise them at session start; don't push on this work until then.

| # | Waiting on | Proposal on the table | Needed for |
|---|------------|----------------------|------------|
| D5 | One real (sanitized) **MS Copilot meeting recap** pasted in, to tune the extraction prompt | — | Task 4.2 |
| D6 | `ANTHROPIC_API_KEY` set in Vercel + `server/.env` **[USER ACTION]** | — | Task 4.1 |
| D8 | Auth upgrade choice: Cloudflare Access in front of the domain vs. high-entropy rotating token | Recommend Cloudflare Access (free tier) | Task 3.1 |
| D9 | Comfort/policy check: candid stance notes about named industry figures will live in this personal app — confirm that's acceptable under NCQA policy **[USER ACTION]** | — | Phase 3 |

**Already decided (2026-06-12):**
- **D7 (RESOLVED 2026-06-17):** NCQA M365 **can** publish an ICS calendar feed, and it's rich (subject/date/time/recurrence) — **but Microsoft strips attendees** from published ICS (0 of 847 events carried any). So the **ICS "skeleton" import shipped** (Phase 5, below); attendee auto-fill is deferred to **Option B** (Microsoft Graph / Power Automate) behind a `CalendarProvider` interface — not urgent per the owner. The paste-an-agenda fallback (Task 5.4) is unneeded for transport.
- Keep SearchBook (vs. switching to a commercial CRM); adapt in place, same database. **No archiving** of job-search-era contacts.
- Note-taker is **MS Copilot** (Teams recaps will be pasted in); calendar is **Outlook**.
- **D1 (ecosystems):** adopt the new list (Task 1.1) **plus keep `RECRUITER`**; bulk-remap `ROLODEX`→`NETWORK`, `TARGET`→`NETWORK`; eliminate all other legacy values (`INFLUENCER`, `INTRO_SOURCE` also remapped to `NETWORK` — implementer's interpretation of "eliminate remaining legacy categories"; user may spot-reclassify e.g. influencers into `POLICY`/`MEDIA` afterward).
- **D2 (contact statuses):** only `RESEARCHING`, `CONNECTED`, `AWAITING_RESPONSE`, `FOLLOW_UP_NEEDED`, **plus a blank/None option**. All other current values remap to None.
- **D3 (company statuses):** only `RESEARCHING`, `ENGAGED` (was `IN_DISCUSSIONS`), `PARTNER` (was `ACTIVE_TARGET`), `CONNECTED`, plus blank/None.
- **D4 (recurring meetings): no Groups feature.** ~~Recurring meetings are identified by their **title**~~ — **REVISED 2026-06-15:** recurring meetings now use a dedicated **`Series` entity** (`Series` table + `Conversation.seriesId`, `onDelete: SetNull`). Series is **opt-in** (mark a meeting as a series; later meetings join it from a picker — no exact-title retyping). The `series` chip shows only for meetings actually in a series; clicking it opens the series view (`/meetings?seriesId=…`). Existing titles shared by ≥2 meetings were auto-grouped into series by the migration. Phases 4/5 prefill can map the recap/Outlook subject to an existing series. Groups still deferred to the Phase 6 backlog.
- Meetings model: multiple subjects handled via markdown topic headings + conversation tags, **not** per-topic DB segments (rejected as over-engineering for a single user).
- Single optional company anchor on a conversation (not multi-org anchors); multi-org meetings use description/named participants.
- Status fields use a `'NONE'` **sentinel value rendered as blank** instead of making the columns nullable — identical UX, avoids a risky SQLite table rebuild of the central `Contact`/`Company` tables.

---

# PHASE 1 — Retheme & quick wins

*Goal: the app speaks NCQA instead of job-search, and follow-ups distinguish "I owe them" from "they owe me." Small, contained changes; ship within a session.*

## Task 1.1 — NCQA ecosystem taxonomy (DECIDED — D1)

**Problem:** `Contact.ecosystem` values (`RECRUITER, ROLODEX, TARGET, INFLUENCER, ACADEMIA, INTRO_SOURCE`) encode a job hunt.

**Final list (D1):**

| Value | Label | Notes |
|-------|-------|-------|
| `PAYER` | Payer / Health Plan | |
| `PROVIDER` | Provider / Health System | |
| `GOVERNMENT` | Government (CMS, ONC, states) | |
| `ACADEMIA` | Academia | value already exists — carries over untouched |
| `HEALTH_TECH` | Health Tech / Vendor | |
| `POLICY` | Policy / Association / Think Tank | |
| `MEDIA` | Media / Press | |
| `FUNDER` | Funder / Philanthropy | |
| `NCQA` | NCQA Internal | |
| `NETWORK` | General Network | absorbs the legacy buckets |
| `RECRUITER` | Recruiter | kept per D1 (exec recruiters stay relevant) |

**Data migration (Turso, after backup — note PascalCase table names, no `@@map` in schema):**
```sql
UPDATE "Contact" SET ecosystem='NETWORK'
WHERE ecosystem IN ('ROLODEX','TARGET','INFLUENCER','INTRO_SOURCE');
```
`RECRUITER` and `ACADEMIA` rows untouched. (`INFLUENCER`/`INTRO_SOURCE`→`NETWORK` is the implementer's reading of "eliminate remaining legacy categories" — user may spot-reclassify into `POLICY`/`MEDIA` afterward.) Run the same UPDATE against local SQLite dev data.

**Code changes:**
- `client/src/lib/types.ts` — replace `Ecosystem` union + `ECOSYSTEM_OPTIONS` with the final list.
- Server input allow-list in `server/src/routes/contacts.ts` — final list only.
- Schema DDL default stays `'RECRUITER'` (changing it needs a table rebuild — not worth it); instead the **client form defaults to `NETWORK`** and always sends `ecosystem` explicitly.
- Contact list/filter UI + analytics ecosystem breakdown use the new list; render any unknown stragglers as their raw value (defensive, in case a row is missed).

**Acceptance:** no contact left on an eliminated value after migration; filters/analytics show the new list; new-contact form defaults to General Network.
**Commit:** `feat(taxonomy): NCQA ecosystems + legacy remap`
**STATUS:** ✅ Code complete 2026-06-12 (commit `08568e0`, Tasks 1.1–1.3 in one atomic commit — same files, same migration moment). Typecheck + client build pass. Turso migration run + verified 2026-06-12; deployed to main.

## Task 1.2 — Contact statuses (DECIDED — D2)

**Final list (D2):** `RESEARCHING`, `CONNECTED`, `AWAITING_RESPONSE`, `FOLLOW_UP_NEEDED`, plus a **blank/None** option. All other values eliminated.

**Implementation of "None": sentinel value `'NONE'`, rendered as blank ("—").** Making the column truly nullable would require a SQLite table rebuild of `Contact` (the central table) on Turso; the sentinel needs zero DDL. Client/server treat `'NONE'` as "no status" (no badge rendered; filterable as "No status").

**Data migration (Turso, after backup):**
```sql
UPDATE "Contact" SET status='NONE'
WHERE status IN ('NEW','LEAD_TO_PURSUE','ON_HOLD','CLOSED');
```
`ContactStatusHistory` rows are left verbatim (history is history).

**Code changes:** `types.ts` options (4 + None), server allow-list, status badge/filter components render None as blank, analytics status chart includes a "No status" bucket. New-contact form default stays `CONNECTED` (long-standing UX preference — most people are added right after meeting them); schema DDL default `'NEW'` untouched (client always sends status explicitly).
**Acceptance:** only the 4 statuses + blank selectable; no contact stranded on an eliminated value; clearing a status works.
**Commit:** `feat(taxonomy): trimmed contact statuses + blank option`
**STATUS:** ✅ Code complete 2026-06-12 (in `08568e0`). Conversation auto-bump now `NONE`→`CONNECTED`; LinkedIn-draft default `NONE`. Turso migration run + verified 2026-06-12; deployed to main.

## Task 1.3 — Company statuses + relabel "Companies" → "Organizations" (DECIDED — D3)

**Final list (D3):** `RESEARCHING`, `ENGAGED` (was `IN_DISCUSSIONS`), `PARTNER` (was `ACTIVE_TARGET`), `CONNECTED`, plus blank/None (same `'NONE'` sentinel pattern as Task 1.2).

**Data migration (Turso, after backup):**
```sql
UPDATE "Company" SET status='ENGAGED' WHERE status='IN_DISCUSSIONS';
UPDATE "Company" SET status='PARTNER' WHERE status='ACTIVE_TARGET';
UPDATE "Company" SET status='NONE'    WHERE status IN ('ON_HOLD','CLOSED','AWAITING_RESPONSE');
```
(`AWAITING_RESPONSE` existed as a company status in the client UI even though the schema comment omitted it — included in the eliminate set.)
`CompanyStatusHistory` left verbatim.

Also: UI-only relabel of nav/headers from "Companies" to "Organizations" (routes, API, schema keep `companies` — pure label change, zero migration).
**Commit:** `feat(taxonomy): organization statuses + relabel companies nav`
**STATUS:** ✅ Code complete 2026-06-12 (in `08568e0`). Analytics "In Discussions" metrics → "Engaged" (JSON keys kept for API stability). Turso migration run + verified 2026-06-12; deployed to main.

## Task 1.4 — Action direction: "I owe them" vs. "waiting on them"

**Problem:** Actions only model the owner's to-dos. At CMO meeting volume, half the follow-up burden is things *other people* promised.

**Changes:**
- Schema: `Action.direction String @default("OWED_BY_ME")` // `OWED_BY_ME`, `WAITING_ON_THEM`. Turso: `ALTER TABLE "Action" ADD COLUMN direction TEXT NOT NULL DEFAULT 'OWED_BY_ME'` (per migration procedure).
- Action form: a two-option toggle ("My task" / "Waiting on them"), default My task.
- Actions page: a **Waiting For** section/filter; overdue logic identical (an overdue WAITING_ON_THEM = time to nudge).
- Dashboard: small "Waiting on others" card (count + top 3 oldest).
- Server allow-list: accept `direction` on create/update.

**Acceptance:** can log "Sarah to send the digital-measures deck by Fri"; it appears under Waiting For; going overdue highlights it; completing works as normal.
**Commit:** `feat(actions): direction field + Waiting For view`
**STATUS:** ✅ Code complete 2026-06-12 (commit `71cd9b0`). Also: `?filter=waiting` deep link, dashboard "Waiting on others" card, recurring copy. Turso DDL run + verified 2026-06-12 (all 223 actions OWED_BY_ME); deployed to main.

---

# PHASE 2 — Meetings overhaul (multi-person, multi-subject, fuzzy attendance)

*Goal: any real-world meeting can be logged in 30 seconds at minimum fidelity, or in full detail, without contorting the data model.*

### Design (worked through 2026-06-12; **revised same day per D4 — titles, not Groups**)

**Scenarios this must support:**
- **S1** — classic 1:1 (legacy behavior, must keep working unchanged).
- **S2** — *"Weekly VP meeting"*: recurring meeting named after the calendar event, 5 topics, a couple of per-person observations, 3 follow-ups. Later: "show me all notes from Weekly VP meetings."
- **S3** — *"met a bunch of people from Arcadia, two names worth recording"*: org-anchored, fuzzy headcount, 2 named participants (created as contacts), the rest just described.
- **S4** — minimal log: title + date + one-liner. Must take <30 seconds.
- **S5** — conference panel / large event: type EVENT, free-text audience description, maybe 2–3 named people.

**Model — a Conversation becomes a Meeting record with a title plus four independent "who" facets, all optional, at least one required:**

1. `title` (**new**, nullable) — **the primary identity for non-1:1 meetings and the series key.** Lowest-effort path (D4): type the calendar event's name once; thereafter **autocomplete from previously used titles** keeps the series consistent ("Weekly VP meeting", not three spelling variants). Phase 5 prefills it from the Outlook event subject and Phase 4 from the Copilot recap header — at which point the effort drops to zero typing.
2. `contactId` (existing, becomes **nullable**) — the 1:1 anchor; kept for back-compat and the common 1:1 case.
3. `companyId` (**new**, nullable) — org anchor ("with Arcadia"). One org max. (Distinct from `ConversationCompany`, which stays "companies *discussed*.")
4. **Named participants** (existing `ConversationParticipant`) — individuals worth recording, now with an optional per-person `note` ("skeptical of digital-first HEDIS"; "offered intro to Moy at CMS"). These notes surface on the contact's detail page as a "meeting takeaways" timeline — this is where stakeholder intelligence (Phase 3) gets its raw material.
5. `attendeesDescription` (**new**, free text) — the fuzz: "~10 Arcadia folks incl. analytics team", "all my direct reports", "panel audience ≈100".

**Finding meetings by name (the D4 requirement).** Today the user finds a 1:1 by searching the person; the equivalent for recurring meetings must work by title:
- Global search (`/search`) covers conversation `title` (+ summary/notes).
- The Meetings page has a title filter with the same autocomplete.
- **Series view:** clicking a meeting's title anywhere shows all meetings sharing that title (case-insensitive match), newest first — chronological notes for "Weekly VP meeting" in two taps.

Display name resolves `title → contact name → company → attendees description`.

**Groups: NOT built** (D4). A named-contact-set feature is deferred to the Phase 6 backlog; title-series covers the recurring-meeting need without the user maintaining membership lists.

**Multiple subjects:** one `notes` field, structured with markdown `### Topic` headings (already rendered via ReactMarkdown), **plus** conversation-level tags (new `ConversationTag` junction reusing the existing `Tag` entity) for filtering ("everything tagged `digital-measures`"). Actions created from the meeting link to the relevant *subset* of people via the existing `ActionContact` junction. Rejected alternative: per-topic child records with their own notes/actions — more clicks per meeting, no real query win for a single user.

**Validation rule:** a conversation needs ≥1 of {title, anchor contact, company, named participant, attendeesDescription}. Title alone is a valid meeting ("Weekly VP meeting", no individuals recorded).

## Task 2.1 — Schema: meeting facets

- `Conversation`: `contactId` → optional (**table rebuild on Turso** — see migration procedure), add `title String?`, `companyId Int?` (FK → Company, `onDelete: SetNull`), `attendeesDescription String?`.
- `ConversationParticipant`: add `note String?` (plain `ADD COLUMN`).
- New: `ConversationTag` (composite PK, FK → existing `Tag`).
- Server: extend conversation create/update allow-lists + junction writes (transactional, following the existing participants pattern in `server/src/routes/conversations.ts`); enforce the ≥1-who validation server-side.
- New lightweight endpoint `GET /api/conversations/titles` → distinct non-null titles (for autocomplete; follows the `/companies/names` precedent).
- **Backup/restore must keep working:** add `ConversationTag` to the export/import table lists (server export AND browser-direct Turso path) + restore ordering.

**Commit:** `feat(meetings): titles, org anchor, fuzzy attendees, participant notes, conversation tags`
**STATUS:** ✅ Code complete 2026-06-12 (commit `1b618e9`). Local SQLite migrated via `db push` (22 conversations preserved). Deviations: contactId FK keeps `onDelete: Cascade` (legacy delete behavior unchanged; new-style meetings usually have no anchor so they're unaffected); PUT junctions are replaced only when the key is present in the body; PUT never changes the anchor unless `contactId` is explicitly sent; `/conversations?contactId=` now also matches named participants. ⚠️ Turso table rebuild pending — do NOT push to main before it runs.

## Task 2.2 — Quick Log + full meeting editor

- **Quick Log dialog** (command palette + a prominent button): **title with autocomplete** (default focus), date (default today), type, optional one-line summary/notes, optional who-pickers (contact/org/participants) and attendees description. Title+date+save = S4 in <30 seconds.
- **Full editor**: extends the existing conversation dialog with title (autocomplete), org anchor, attendees description, per-participant note inputs (inline next to each participant chip), conversation tags. Keep the prep-notes two-column layout.
- Conversation cards show resolved display name + org chip + description.

**Commit:** `feat(meetings): quick log dialog + full meeting editor`
**STATUS:** ✅ Code complete 2026-06-12 (commit `b91376a`). Quick Log opens from a header button (all pages), the command palette, and the Meetings page; who-pickers sit behind a collapsed "Who was there" disclosure. New shared `TitleAutocomplete` component. Verified in-browser. **Redesigned 2026-06-15 (`cb5d604`): "promote the big 3"** — Participants/Notes/Follow-up actions are always visible; secondary fields moved into 3 labeled disclosures (Organizations & attendees · Summary & next steps · Tags, prep notes & attachments). Added a **Series picker** (pick existing / create inline) wired into autosave.

## Task 2.3 — Global Meetings page, series view, search coverage

- New route `/meetings`: paginated list of all conversations (no longer reachable only via a contact), filters: **title (autocomplete)**, organization, tag, type, date range, free text. Server endpoint follows the existing list-endpoint conventions (explicit `select`, no `_count`, pagination envelope).
- **Series view:** meeting titles are links → `/meetings?title=…` (case-insensitive exact match), newest first.
- Global search (`server/src/routes/search.ts` + `/search` page): include conversation titles in matching and render meeting hits.

**Commit:** `feat(meetings): global meetings page + title series view + search coverage`
**STATUS:** ✅ Code complete 2026-06-12 (commit `b507f0e`). Implemented as a dedicated `GET /api/meetings` route (pagination envelope; series title matched case-insensitively exact; extra `id` param for single-meeting deep links from search). Meetings nav item added to the sidebar. Verified in-browser incl. series view. **Reworked 2026-06-15 (`ccdafdf`/`cb5d604`/`7e6e8a0`):** series view now driven by the real `Series` entity (`?seriesId=`), Title filter → **Series** dropdown, **Sort** dropdown (default recently-updated), series **rename/delete** on the header, card title = first participant entered (new `ConversationParticipant.ordering`), person-name search.

## Task 2.4 — Contact takeaways + org meetings

- Contact detail: "Meeting takeaways" — the per-participant notes from every meeting they attended, newest first.
- Company detail: meetings anchored to that org.

**Commit:** `feat(meetings): per-contact takeaways timeline + org meeting list`
**STATUS:** ✅ Code complete 2026-06-12 (commit `df9eb8a`). Takeaways card on the contact Overview tab; org meetings card on the company Overview tab (5 most recent + view-all link). Verified in-browser.

## Task 2.5 — Phase 2 touch-ups (user-requested 2026-06-12, third session)

Edit/delete affordances on `/meetings` (Quick Log dialog became the canonical create+edit meeting editor); **meeting-level prep notes** (`ConversationPrepNote`, incl. advance notes via future-dated meetings); **attachments** (`ConversationAttachment` + generic `POST /api/upload/file`, Vercel Blob `files/` prefix in prod, 4MB cap); **markdown speed toolbar/shortcuts/list-auto-continue/paste-screenshot** (`MarkdownTextarea`, wired into meeting + conversation + prep-note editors). Both backup paths now cover 26 tables (`_meta.version` 4).
**Commit:** `feat(meetings): edit/delete affordances + meeting prep notes, attachments, markdown speed toolbar`
**STATUS:** ✅ DEPLOYED 2026-06-12 (commits `e099388`…`d718ffa`). Turso CREATE TABLEs run by the user in the console; verified locally in-browser; live deploy + health confirmed. (One Vercel build failure fixed in `d718ffa` — note the client **build** runs `tsc -b` with `noUnusedLocals`, stricter than the `typecheck` script.)

> **Related new plan:** `.planning/archive/SEARCH-UPGRADE-PLAN.md` (user-requested global search overhaul — scoped, full-coverage, sortable; precedes/complements Task 6.2 semantic search).

---

# PHASE 3 — Stakeholder intelligence

*Goal: "show me high-influence people who support the AI agenda and can get me on stages" is one filter away.*

## Task 3.1 — Auth hardening (do BEFORE candid stance data accumulates)

Per D8/D9. Recommended: **Cloudflare Access** (free ≤50 users) in front of the domain — real identity (Google login), zero app-code changes, the shared-password gate stays as a second layer. Alternative if Cloudflare is unwanted: rotate `APP_PASSWORD` to a high-entropy secret + document quarterly rotation. Also **[USER ACTION]** D9: confirm NCQA policy comfort.
**Commit:** (mostly infra; commit any config/docs) `docs(security): auth hardening for stakeholder-sensitive data`
**STATUS:** Not started. Blocked on D8/D9.

## Task 3.2 — Initiatives + per-contact stance

- New `Initiative` (`id`, `name`, `description?`, `status @default("ACTIVE")`). Seed: **"Modernize quality measurement"**, **"AI in quality measurement"**. New initiatives are rows, not schema changes.
- New `ContactInitiative` (`contactId`, `initiativeId`, `stance`, `notes?`, `updatedAt`). Stances: `CHAMPION`, `SUPPORTIVE`, `NEUTRAL`, `SKEPTICAL`, `OPPOSED`, `UNKNOWN`.
- Contact detail: stance editor (one row per initiative, stance pills + rationale text); stance chips on the contact card/list.
- Add tables to backup/restore lists.

**Commit:** `feat(stakeholders): initiatives + per-contact stance tracking`
**STATUS:** Not started.

## Task 3.3 — Leverage + influence on Contact

- `Contact.leverage String?` — JSON array (multi-select): `SPEAKING`, `PUBLISHING`, `AMPLIFICATION`, `ACADEMIC_COLLAB`, `ADVISING`, `FUNDING`, `FUNDER_INTRO`, `NETWORK_ACCESS`, `POLICY_INFLUENCE`. (JSON-array-on-contact follows the `additionalEmails` precedent; parse with `safeParseArray`.)
- `Contact.influence String @default("UNKNOWN")` — `HIGH`, `MEDIUM`, `LOW`, `UNKNOWN`.
- Edit form: leverage as toggleable chips; influence as a small select.
- Turso: two `ADD COLUMN`s.

**Commit:** `feat(stakeholders): leverage capabilities + influence rating`
**STATUS:** Not started.

## Task 3.4 — Stakeholder filters & map

- Contacts list: server-side filters for `initiative+stance`, `leverage`, `influence` (extend the existing filter-param pattern in `/contacts`).
- Analytics (or a new view): **stance × influence matrix** per initiative — the political map. Counts clickable through to filtered lists.

**Commit:** `feat(stakeholders): stance/leverage/influence filters + stakeholder matrix`
**STATUS:** Not started. Depends on 3.2/3.3.

---

# PHASE 4 — AI meeting ingest (paste a Copilot recap, get a structured record)

*Goal: kill the data-entry tax. Paste an MS Copilot recap (or any raw notes) → reviewed, structured Conversation + Actions + stance signals.*

### Design

- **Never writes directly.** The AI produces a *draft*; a review screen lets the user fix attendee matches and discard noise; commit uses the normal CRUD endpoints. (LLM extraction is good but not trusted blind.)
- **Pipeline:** `POST /api/ai/ingest-meeting { rawText }` → server assembles matching context (contact names+ids+org, **known meeting titles** for series matching, initiative names — reuse the lightweight names/titles endpoints) → one Claude API call with a JSON-schema'd tool → returns draft:
  `{ title (matched to an existing series title when close), date, type, summary, notesMarkdown (### topic headings), attendees: [{ name, matchedContactId | null, note? }], companyGuess?, attendeesDescription?, actions: [{ title, direction, dueDate?, ownerContactId? }], peopleDiscussed, companiesDiscussed, stanceSignals: [{ contactId, initiative, signal, quote }] }`
- **Copilot specifics:** Teams recaps have stable sections (meeting title/date/attendees, AI-notes bullets grouped by topic, "Follow-up tasks" with named owners). Prompt maps *task owner = me* → `OWED_BY_ME`, *owner = someone else* → `WAITING_ON_THEM`. Tune against a real sample (D5). Must degrade gracefully on arbitrary raw notes.
- **Constraints:** Vercel 30s / client 28s timeout → default to a fast model (`claude-haiku-4-5-20251001`; model id in an env var `AI_INGEST_MODEL` so it can be upgraded without a deploy), cap input ~20k chars with a clear truncation warning, cap output tokens. Rate-limit the route (e.g., 60/hr, same `express-rate-limit` pattern). **[USER ACTION]** D6: `ANTHROPIC_API_KEY`.

## Task 4.1 — Server: `/api/ai/ingest-meeting`
New `server/src/routes/ai.ts` per the design (Anthropic SDK, tool-forced JSON output, name-matching context, rate limit, env-gated — clean 503 with a helpful message if the key is unset).
**Commit:** `feat(ai): meeting-ingest extraction endpoint`
**STATUS:** Not started. Blocked on D6.

## Task 4.2 — Client: paste-and-review flow
"Ingest notes" entry point (Meetings page + command palette): paste box → loading → **review screen**: editable title/date/summary/notes; attendee rows with match-confirm comboboxes ("Sarah Chen → matched contact #182 ✓ / create new / drop to description"); action rows with direction + due date; stance-signal rows (accept → upserts `ContactInitiative` with the quote appended to notes). Commit button executes via existing endpoints (conversation + junctions + actions), shows what was created with links. Tune prompt against the real Copilot sample (D5).
**Commit:** `feat(ai): paste-Copilot-recap review & commit flow`
**STATUS:** Not started. Depends on 4.1, Phase 2 (meeting facets must exist to file things into), and Phase 3 for stance signals (degrade: hide stance rows if Phase 3 isn't deployed).

---

# PHASE 5 — Outlook calendar + daily briefing

*Goal: open the app in the morning and see today's meetings, each with who's in the room, their stance, last conversation, and prep notes.*

## Task 5.0 — Outlook ICS import (✅ SHIPPED 2026-06-17, commit `bb49185`)
The owner's first-priority slice of Phase 5: **pre-load meetings from the published ICS feed as future-dated records** so metadata (subject/date/time/recurrence) is never re-typed and they jump straight to notes. "Import from Outlook" dialog on `/meetings` (range presets, day-grouped, pre-selects not-yet-imported, **skip-only idempotent** re-import keyed on `calendarUid`+`date`). New `server/src/lib/ics.ts` (`IcsCalendarProvider` — fetch + 15-min cache + `ical-expander` recurrence expansion + Windows-TZID→`APP_TIMEZONE`) behind a `CalendarProvider` interface; `GET /api/calendar/events` + `POST /api/calendar/import` (`server/src/routes/calendar.ts`); additive `Conversation.calendarUid` + `startTime` (Turso DDL applied 2026-06-17). Attendees are **not** auto-filled (published ICS strips them — see D7); `startTime` shows on cards + is editable in Quick Log. **✅ `OUTLOOK_CALENDAR_ICS_URL` set in Vercel (Production) 2026-06-18 — the import is live.** Diagnostic: `server/scripts/probe-ics.mjs`. Option B (Graph/Power-Automate attendee auto-fill) drops in behind the same interface when wanted.

### Design (daily-briefing tasks below remain for later)

- **v1 transport: published ICS feed** (Outlook → Settings → Calendar → Shared calendars → Publish). No OAuth, no app registration — the most likely thing to survive NCQA IT (D7). `ICS_FEED_URL` is a **server-side env secret** (it grants read access to the whole calendar; never ship it to the client).
- **Known limitation:** Microsoft refreshes published ICS feeds lazily (can lag hours). Acceptable for a *daily* briefing; if it proves too stale, the escalation path is Microsoft Graph delegated auth (heavier; admin consent likely required) — decide then, not now.
- **Fallback if publishing is blocked (D7):** Task 5.4 paste-an-agenda — copy the day's schedule text from Outlook, AI-parse it into briefing entries. Worse, but works under any IT regime.

## Task 5.1 — Server: ICS fetch + parse
`GET /api/calendar/day?date=YYYY-MM-DD` → fetch the feed, parse, expand recurrences for that date, return `{ start, end, subject, attendees: [{name, email}] }[]`. Cache in-memory for ~15 min (serverless = best-effort cache; fine). Match attendee emails against `Contact.email` + `additionalEmails` → attach `contactId`s.
**STATUS:** ✅ Largely delivered by **Task 5.0** — `server/src/lib/ics.ts` does the fetch/cache/expand/TZID work and `GET /api/calendar/events?from=&to=` returns events for a range (env var is `OUTLOOK_CALENDAR_ICS_URL`, not `ICS_FEED_URL`). **Attendee email→contact matching is NOT done** (published ICS has no attendees — D7); revisit under Option B (Graph). A per-day `/day` shape can wrap the range endpoint if the briefing (5.2) wants it.

## Task 5.2 — Daily Briefing view
New `/briefing` (and make it the natural morning landing alongside the dashboard): each meeting → matched attendees (photo, title, org, influence/stance chips), last meeting summary + takeaway note, open questions, prep notes due today (reuse `PrepNote` by date — already exists), open Waiting-For items per attendee. Buttons per meeting: **Prep** (jump to prep notes) and **Log** (pre-filled Quick Log / Ingest with **title = event subject**, date, attendees — this is what makes D4's "name the conversation after the calendar event" zero-effort).
**Commit:** `feat(briefing): daily briefing view joining calendar, prep, stance, history`
**STATUS:** Not started. Depends on 5.1, Phases 2–3.

## Task 5.3 — Post-meeting nudge
Briefing shows yesterday's/today's past meetings that have **no logged conversation** — the "you met them, capture it" loop-closer.
**Commit:** `feat(briefing): unlogged-meeting nudges`
**STATUS:** Not started. Depends on 5.1–5.2.

## Task 5.4 — (Fallback) paste-an-agenda
Only if D7 fails: textarea on `/briefing` → AI parse (reuse Phase 4 plumbing) → same briefing rendering.
**STATUS:** Contingent on D7.

---

# PHASE 6 — Network leverage & intelligence extras (backlog, pull forward on demand)

- **6.1 Intro paths:** "Who can introduce me to X?" — BFS over `Relationship` + referral edges + shared employment/org. Surface on contact detail ("paths to this person").
- **6.2 Semantic search over meeting notes:** embeddings in Turso (libsql vector columns) over conversation notes/summaries; answers "who mentioned FHIR-based measure calculation?" **Supersedes ROADMAP Phase 8** (Google Drive doc search) — meeting notes now live in-app, which was most of Phase 8's motivation; revisit Drive search only if a real need persists.
- **6.3 Weekly digest:** in-app panel (no email infra): who you met, what you committed to, what you're owed, allies gone quiet (no touch in N weeks, by influence tier).
- **6.4 Speaking/publishing pipeline:** if leverage tracking proves out, a light view of open opportunities (talk invitations, paper collabs) — possibly just a saved Ideas/Tags convention rather than new schema. Decide later.
- **6.5 Groups (deferred from Phase 2 per D4):** named contact sets ("My VPs") with membership, linkable to meetings. Only build if title-series proves insufficient — e.g., if the user wants "every meeting any of my VPs attended" or stance-by-group rollups.

**STATUS:** Backlog — sequence after Phases 1–5 or pull forward by user request.

---

## What we are deliberately NOT doing

- **No multi-user / sharing** — single-user assumptions run deep (auth, autosave, backup) and that's the right size.
- **No Microsoft Graph OAuth in v1** — ICS first; Graph only if staleness hurts (see Phase 5 design).
- **No per-topic conversation child records** — markdown headings + tags (see Phase 2 design).
- **No Groups feature up front (D4)** — recurring meetings are identified by repeated, autocompleted titles; named participants are the historical attendance record when it matters. Groups live in the Phase 6 backlog.
- **No nullable-status table rebuilds** — `'NONE'` sentinel rendered as blank (Tasks 1.2/1.3).
- **No automatic Copilot/Teams API pull** — paste is the v1 contract; revisit once D5/D7 reveal what NCQA IT allows.
- **No bulk remap of legacy ecosystems** (except `LEAD_TO_PURSUE`→`ACTIVE_ALLY` status, pending D2) — additive taxonomy, reclassify as you go.

## Risk register

| Risk | Mitigation |
|------|-----------|
| `contactId` nullable rebuild corrupts conversations table | Backup immediately before; transaction; verify counts; PITR (2-week window) as last resort |
| New tables silently missing from backup/restore | Every schema task explicitly updates both export paths + restore ordering (Tasks 2.1, 3.2) |
| AI extraction hallucinates matches/actions | Review-before-commit screen is mandatory; AI never writes directly |
| 30s Vercel timeout on AI calls | Fast model default, input/output caps, model id env-swappable |
| NCQA IT blocks ICS publishing | Fallback Task 5.4 (paste agenda); decide Graph later |
| Sensitive stance notes in a personal cloud app | Task 3.1 ordered *before* stance data accumulates; D9 policy check |
| Published ICS staleness | Accepted for daily granularity; escalation path documented |
