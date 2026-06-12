# SearchBook — NCQA Adaptation Plan

**Created:** 2026-06-12
**Status:** Phase 1 not started. Taxonomy proposals below need user sign-off before Task 1.1 (see "Decisions needed from the user").
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

## Decisions needed from the user (collect at next session start)

| # | Decision | Proposal on the table | Needed for |
|---|----------|----------------------|------------|
| D1 | Final **ecosystem** list + handling of legacy values | See Task 1.1 (additive approach, legacy values stay valid) | Task 1.1 |
| D2 | Final **contact status** list | See Task 1.2 (keep most, swap `LEAD_TO_PURSUE`, add `DORMANT`) | Task 1.2 |
| D3 | Final **company status** list | See Task 1.3 | Task 1.3 |
| D4 | Seed **Groups** (e.g., "My VPs", standing committees) | Collect 3–6 names | Task 2.4 |
| D5 | One real (sanitized) **MS Copilot meeting recap** pasted in, to tune the extraction prompt | — | Task 4.2 |
| D6 | `ANTHROPIC_API_KEY` set in Vercel + `server/.env` **[USER ACTION]** | — | Task 4.1 |
| D7 | Can NCQA's M365 publish an **ICS calendar link**? (Outlook → Settings → Calendar → Shared calendars → Publish) **[USER ACTION]** | If blocked, fall back to paste-an-agenda (Task 5.4) | Phase 5 |
| D8 | Auth upgrade choice: Cloudflare Access in front of the domain vs. high-entropy rotating token | Recommend Cloudflare Access (free tier) | Task 3.1 |
| D9 | Comfort/policy check: candid stance notes about named industry figures will live in this personal app — confirm that's acceptable under NCQA policy **[USER ACTION]** | — | Phase 3 |

**Already decided (2026-06-12):**
- Keep SearchBook (vs. switching to a commercial CRM); adapt in place, same database. **No archiving** of job-search-era contacts — legacy data stays live and gets reclassified opportunistically.
- Note-taker is **MS Copilot** (Teams recaps will be pasted in); calendar is **Outlook**.
- Meetings model: group references are *current-membership references, not snapshots*; multiple subjects handled via markdown topic headings + conversation tags, **not** per-topic DB segments (rejected as over-engineering for a single user).
- Single optional company anchor on a conversation (not multi-org anchors); multi-org meetings use groups/description/named participants.

---

# PHASE 1 — Retheme & quick wins

*Goal: the app speaks NCQA instead of job-search, and follow-ups distinguish "I owe them" from "they owe me." Small, contained changes; ship within a session.*

## Task 1.1 — NCQA ecosystem taxonomy (additive)

**Problem:** `Contact.ecosystem` values (`RECRUITER, ROLODEX, TARGET, INFLUENCER, ACADEMIA, INTRO_SOURCE`) encode a job hunt.

**Approach — additive, no bulk migration.** A one-shot mapping would miscategorize (e.g., `TARGET` contacts are now a mix of payers, vendors, and academics). Instead: add the new values, keep legacy values valid, render legacy ones in a visually distinct "Legacy" group in dropdowns/filters, and reclassify contacts as they come up. No data is touched at migration time.

**Proposed new list (pending D1):**

| Value | Label |
|-------|-------|
| `PAYER` | Payer / Health Plan |
| `PROVIDER` | Provider / Health System |
| `GOVERNMENT` | Government (CMS, ONC, states) |
| `ACADEMIA` | Academia *(value already exists — carries over untouched)* |
| `HEALTH_TECH` | Health Tech / Vendor |
| `POLICY` | Policy / Association / Think Tank |
| `MEDIA` | Media / Press |
| `FUNDER` | Funder / Philanthropy |
| `NCQA` | NCQA Internal |
| `NETWORK` | General Network |

**Changes:**
- `client/src/lib/types.ts` — extend `Ecosystem` union + `ECOSYSTEM_OPTIONS` (new list first, then a legacy group: `RECRUITER`, `ROLODEX`, `TARGET`, `INFLUENCER`, `INTRO_SOURCE` labeled e.g. "Recruiter (legacy)").
- Server input allow-lists (the Task 18-style validation in `server/src/routes/contacts.ts`) — accept new + legacy values.
- Contact list/filter UI + analytics ecosystem breakdown: render both groups.
- No schema change (`ecosystem` is a plain string).

**Acceptance:** can assign new ecosystems; legacy contacts display correctly; filters work for both; analytics doesn't break on mixed values.
**Commit:** `feat(taxonomy): NCQA ecosystem values alongside legacy ones`
**STATUS:** Not started. Blocked on D1.

## Task 1.2 — Contact status lifecycle

**Problem:** Statuses are a job-search funnel. Most actually transfer fine; only a couple are wrong.

**Proposed (pending D2):** keep `NEW`, `RESEARCHING`, `CONNECTED`, `AWAITING_RESPONSE`, `FOLLOW_UP_NEEDED`, `ON_HOLD`, `CLOSED` (operationally still right); **replace** `LEAD_TO_PURSUE` with `ACTIVE_ALLY` (label "Active Ally / Collaborator"); **add** `DORMANT` (label "Dormant — worth reviving"). Existing `LEAD_TO_PURSUE` rows get a one-line UPDATE to `ACTIVE_ALLY` (this one *is* a safe bulk map — confirm with user).

**Changes:** `types.ts` options, server allow-list, status-history display, analytics status chart, Turso `UPDATE contacts SET status='ACTIVE_ALLY' WHERE status='LEAD_TO_PURSUE'` (+ same in `contact_status_history.newStatus/oldStatus` — or leave history verbatim; recommend leaving history untouched and only mapping live status; note the decision).
**Acceptance:** all statuses selectable; no contact stranded on a value the UI can't render.
**Commit:** `feat(taxonomy): relationship-lifecycle contact statuses`
**STATUS:** Not started. Blocked on D2.

## Task 1.3 — Company status + relabel "Companies" → "Organizations"

**Proposed (pending D3):** `RESEARCHING`, `ENGAGED` (was `IN_DISCUSSIONS`), `PARTNER` (was `ACTIVE_TARGET`), `CONNECTED`, `ON_HOLD`, `CLOSED`. UI-only relabel of the nav/headers from "Companies" to "Organizations" (route paths, API, and schema keep `companies` — pure label change, zero migration).
**Commit:** `feat(taxonomy): organization statuses + relabel companies nav`
**STATUS:** Not started. Blocked on D3.

## Task 1.4 — Action direction: "I owe them" vs. "waiting on them"

**Problem:** Actions only model the owner's to-dos. At CMO meeting volume, half the follow-up burden is things *other people* promised.

**Changes:**
- Schema: `Action.direction String @default("OWED_BY_ME")` // `OWED_BY_ME`, `WAITING_ON_THEM`. Turso: `ALTER TABLE actions ADD COLUMN direction TEXT NOT NULL DEFAULT 'OWED_BY_ME'` (per migration procedure).
- Action form: a two-option toggle ("My task" / "Waiting on them"), default My task.
- Actions page: a **Waiting For** section/filter; overdue logic identical (an overdue WAITING_ON_THEM = time to nudge).
- Dashboard: small "Waiting on others" card (count + top 3 oldest).
- Server allow-list: accept `direction` on create/update.

**Acceptance:** can log "Sarah to send the digital-measures deck by Fri"; it appears under Waiting For; going overdue highlights it; completing works as normal.
**Commit:** `feat(actions): direction field + Waiting For view`
**STATUS:** Not started. No blockers — can be done before D1–D3 land.

---

# PHASE 2 — Meetings overhaul (multi-person, multi-subject, fuzzy attendance)

*Goal: any real-world meeting can be logged in 30 seconds at minimum fidelity, or in full detail, without contorting the data model.*

### Design (worked through 2026-06-12)

**Scenarios this must support:**
- **S1** — classic 1:1 (legacy behavior, must keep working unchanged).
- **S2** — *weekly VP check-in*: recurring group, 5 topics, a couple of per-person observations, 3 follow-ups.
- **S3** — *"met a bunch of people from Arcadia, two names worth recording"*: org-anchored, fuzzy headcount, 2 named participants (created as contacts), the rest just described.
- **S4** — *"I met with my VPs"* minimal log: group + date + one-liner. Must take <30 seconds.
- **S5** — conference panel / large event: type EVENT, free-text audience description, maybe 2–3 named people.

**Model — a Conversation becomes a Meeting record with five independent "who" facets, all optional, at least one required:**

1. `contactId` (existing, becomes **nullable**) — the 1:1 anchor; kept for back-compat and the common 1:1 case.
2. `companyId` (**new**, nullable) — org anchor ("with Arcadia"). One org max; multi-org meetings use facets 3–5. (Distinct from `ConversationCompany`, which stays "companies *discussed*.")
3. **Groups** (new `Group` / `GroupContact` / `ConversationGroup`) — named recurring sets ("My VPs", "Measurement Modernization Workgroup"). A group link means *this group met*; membership is a **live reference, not a snapshot** — if exact attendance matters, also name participants. Groups double as a filter dimension ("all VP check-ins this quarter").
4. **Named participants** (existing `ConversationParticipant`) — individuals worth recording, now with an optional per-person `note` ("skeptical of digital-first HEDIS"; "offered intro to Moy at CMS"). These notes surface on the contact's detail page as a "meeting takeaways" timeline — this is where stakeholder intelligence (Phase 3) gets its raw material.
5. `attendeesDescription` (**new**, free text) — the fuzz: "~10 Arcadia folks incl. analytics team", "all my direct reports", "panel audience ≈100".

Plus: `title` (**new**, nullable — "Weekly VP check-in"; display name resolves `title → contact → group(s) → company → description`).

**Multiple subjects:** one `notes` field, structured with markdown `### Topic` headings (already rendered via ReactMarkdown), **plus** conversation-level tags (new `ConversationTag` junction reusing the existing `Tag` entity) for filtering ("everything tagged `digital-measures`"). Actions created from the meeting link to the relevant *subset* of people via the existing `ActionContact` junction. Rejected alternative: per-topic child records with their own notes/actions — more clicks per meeting, no real query win for a single user.

**Validation rule:** a conversation needs ≥1 of {anchor contact, company, group, named participant, attendeesDescription}.

## Task 2.1 — Schema: meeting facets

- `Conversation`: `contactId` → optional (**table rebuild on Turso** — see migration procedure), add `title String?`, `companyId Int?` (FK → Company, `onDelete: SetNull`), `attendeesDescription String?`.
- New: `Group` (`id`, `name @unique`, `description?`), `GroupContact` (composite PK), `ConversationGroup` (composite PK).
- `ConversationParticipant`: add `note String?` (plain `ADD COLUMN`).
- New: `ConversationTag` (composite PK, FK → existing `Tag`).
- Server: extend conversation create/update allow-lists + the new junction writes (transactional, following the existing participants pattern in `server/src/routes/conversations.ts`); enforce the ≥1-who validation server-side.
- **Backup/restore must keep working:** add the new tables to the export/import table list (the all-23-tables lesson from the hardening plan — it's now 26+ tables; update both server export and browser-direct Turso path + the restore ordering for FKs).

**Commit:** `feat(meetings): schema for groups, org anchor, fuzzy attendees, participant notes, conversation tags`
**STATUS:** Not started. ⚠️ Largest migration in the plan (contactId nullable rebuild). Backup first.

## Task 2.2 — Groups CRUD

Settings-adjacent "Groups" management (list, create, rename, edit members via the existing contact combobox pattern, delete with impact count). Seed the user's groups (D4).
**Commit:** `feat(meetings): groups CRUD`
**STATUS:** Not started. Depends on 2.1.

## Task 2.3 — Quick Log + full meeting editor

- **Quick Log dialog** (open from command palette + a prominent button): date (default today), type, then *one* "who" picker that searches contacts, groups, and orgs together, a one-line summary, optional attendees description. Save. That's S4 in <30 seconds.
- **Full editor**: extends the existing conversation dialog with title, group multi-select, org anchor, attendees description, per-participant note inputs (inline next to each participant chip), conversation tags. Keep the prep-notes two-column layout.
- Display name resolution per the design; conversation cards show group/org chips + description.

**Commit:** `feat(meetings): quick log dialog + full meeting editor`
**STATUS:** Not started. Depends on 2.1 (+2.2 for group pickers).

## Task 2.4 — Global Meetings page + contact takeaways

- New route `/meetings`: paginated list of all conversations (no longer reachable only via a contact), filters: group, organization, tag, type, date range, free text. Server endpoint follows the existing list-endpoint conventions (explicit `select`, no `_count`, pagination envelope).
- Contact detail: "Meeting takeaways" — the per-participant notes from every meeting they attended, newest first.
- Company detail: meetings anchored to that org.

**Commit:** `feat(meetings): global meetings page + per-contact takeaways timeline`
**STATUS:** Not started. Depends on 2.1.

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
- **Pipeline:** `POST /api/ai/ingest-meeting { rawText }` → server assembles matching context (contact names+ids+org, group names, initiative names — reuse the lightweight names endpoints) → one Claude API call with a JSON-schema'd tool → returns draft:
  `{ title, date, type, summary, notesMarkdown (### topic headings), attendees: [{ name, matchedContactId | null, note? }], groupGuess?, companyGuess?, attendeesDescription?, actions: [{ title, direction, dueDate?, ownerContactId? }], peopleDiscussed, companiesDiscussed, stanceSignals: [{ contactId, initiative, signal, quote }] }`
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

### Design

- **v1 transport: published ICS feed** (Outlook → Settings → Calendar → Shared calendars → Publish). No OAuth, no app registration — the most likely thing to survive NCQA IT (D7). `ICS_FEED_URL` is a **server-side env secret** (it grants read access to the whole calendar; never ship it to the client).
- **Known limitation:** Microsoft refreshes published ICS feeds lazily (can lag hours). Acceptable for a *daily* briefing; if it proves too stale, the escalation path is Microsoft Graph delegated auth (heavier; admin consent likely required) — decide then, not now.
- **Fallback if publishing is blocked (D7):** Task 5.4 paste-an-agenda — copy the day's schedule text from Outlook, AI-parse it into briefing entries. Worse, but works under any IT regime.

## Task 5.1 — Server: ICS fetch + parse
`GET /api/calendar/day?date=YYYY-MM-DD` → fetch `ICS_FEED_URL`, parse (`node-ical`), expand recurrences for that date, return `{ start, end, subject, attendees: [{name, email}] }[]`. Cache in-memory for ~15 min (serverless = best-effort cache; fine). Match attendee emails against `Contact.email` + `additionalEmails` → attach `contactId`s.
**Commit:** `feat(calendar): Outlook ICS feed endpoint with contact matching`
**STATUS:** Not started. Blocked on D7.

## Task 5.2 — Daily Briefing view
New `/briefing` (and make it the natural morning landing alongside the dashboard): each meeting → matched attendees (photo, title, org, influence/stance chips), last meeting summary + takeaway note, open questions, prep notes due today (reuse `PrepNote` by date — already exists), open Waiting-For items per attendee. Buttons per meeting: **Prep** (jump to prep notes) and **Log** (pre-filled Quick Log / Ingest with date+attendees).
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

**STATUS:** Backlog — sequence after Phases 1–5 or pull forward by user request.

---

## What we are deliberately NOT doing

- **No multi-user / sharing** — single-user assumptions run deep (auth, autosave, backup) and that's the right size.
- **No Microsoft Graph OAuth in v1** — ICS first; Graph only if staleness hurts (see Phase 5 design).
- **No per-topic conversation child records** — markdown headings + tags (see Phase 2 design).
- **No group-membership snapshots** — named participants are the historical record when it matters.
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
