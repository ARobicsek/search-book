# SearchBook — State & Decisions

## Key Decisions Made

| Decision | Choice | Date |
|----------|--------|------|
| Interface | Browser-based local web app | 2026-02-02 |
| Tech stack | React+Vite, Express, SQLite/Prisma, shadcn/ui, FullCalendar | 2026-02-02 |
| Data storage | Local SQLite DB, backup to Google Drive | 2026-02-02 |
| Calendar | Standalone in-app (no Google Calendar sync) | 2026-02-02 |
| Companies | Separate entity (not a contact type) | 2026-02-02 |
| Categories | 6 fixed ecosystems + custom freeform tags | 2026-02-02 |
| Contact statuses | NEW, RESEARCHING, CONNECTED, AWAITING_RESPONSE, FOLLOW_UP_NEEDED, LEAD_TO_PURSUE, ON_HOLD, CLOSED | 2026-02-06 |
| Photos | Drag-drop upload (JPG/PNG) + URL paste | 2026-02-02 |
| Date flexibility | Support day, month, or quarter precision for historical entries | 2026-02-02 |
| Recurring tasks | Supported with configurable intervals | 2026-02-02 |
| Data entry | Quick-add palette + structured forms + CSV bulk import | 2026-02-02 |
| Search | By name, role, company, date of contact, keywords, ecosystem, status | 2026-02-02 |
| Navigation | Collapsible left sidebar with icons + labels | 2026-02-02 |
| Table library | TanStack Table (with shadcn DataTable recipe) | 2026-02-02 |
| Dashboard | Daily view (home page), weekly stats in Analytics | 2026-02-03 |
| Deployment | Vercel + Turso cloud DB for iPhone PWA access | 2026-02-05 |
| API auth | Single shared-password gate over all `/api` routes (single-user app) | 2026-06-03 |
| Cloud backup | Automated daily DB export to Vercel Blob (`/api/backup/cron`, 08:00 UTC, keep newest 30) | 2026-06-03 |
| Photo backup | Actual photo *files* bundled into the **manual** backup ZIP only (not the daily cron, to keep Turso/cloud backups small); automatic layer is best-effort by design (Task 25) | 2026-06-03 |
| API caching | `/api/` is `NetworkOnly` in the service worker — never cache API responses (prevents stale data overwriting newer via auto-save) | 2026-06-04 |
| PWA updates | `registerType: 'prompt'` so the user is offered new bundles (not silent `autoUpdate`) | 2026-06-04 |
| Rate limiting | `express-rate-limit`: 1000/15min on `/api` (before auth gate; skips `/health`), 40/hr on `/api/linkedin`; body limit 50mb→2mb (backup routes keep 50mb) | 2026-06-04 |
| Error tracking | Opt-in Sentry (`@sentry/node` + `@sentry/react`), no-op until `SENTRY_DSN`/`VITE_SENTRY_DSN` set; wired into the React ErrorBoundary | 2026-06-04 |
| CORS | Exact allow-list (localhost + prod domain), no `*.vercel.app` wildcard; header-auth is the real gate | 2026-06-04 |
| App mission | Adapt SearchBook (vs. replace) into NCQA CMO stakeholder-management system; plan of record = `.planning/NCQA-ADAPTATION-PLAN.md` | 2026-06-12 |
| Legacy data | No archiving; legacy ecosystem values stay valid (additive taxonomy), reclassify opportunistically | 2026-06-12 |
| Meetings model | Conversation = meeting with title + 4 optional "who" facets (contact anchor, org anchor, named participants w/ per-person notes, free-text attendees description; ≥1 of title/facets required); multi-subject via markdown `### Topic` headings + conversation tags, NOT per-topic child records | 2026-06-12 |
| Recurring meetings (D4) | **No Groups feature** — series identified by repeated, autocompleted `title` matching the Outlook event name; series view + title search; Groups deferred to backlog | 2026-06-12 |
| Taxonomy (D1–D3) | Ecosystems: new NCQA list + keep RECRUITER; ROLODEX/TARGET/INFLUENCER/INTRO_SOURCE→NETWORK. Contact statuses: RESEARCHING/CONNECTED/AWAITING_RESPONSE/FOLLOW_UP_NEEDED + blank. Company: RESEARCHING/ENGAGED/PARTNER/CONNECTED + blank. Blank = `'NONE'` sentinel (no table rebuild) | 2026-06-12 |
| Meeting capture | Paste MS Copilot recaps → Claude API extraction → mandatory review screen → normal CRUD (AI never writes directly) | 2026-06-12 |
| Calendar | Outlook via published ICS feed (server-side secret env var), v1; Graph OAuth only if ICS staleness hurts | 2026-06-12 |
| Git workflow | Owner granted standing permission to commit/push directly to `main` (prepush typecheck first; Turso DDL before schema code) | 2026-06-12 |
| Meeting prep notes & attachments | Per-conversation tables (`ConversationPrepNote`, `ConversationAttachment`); advance prep = future-dated meeting + prep notes; attachments ≤4MB via server pass-through (Vercel Blob `files/` prefix in prod, `server/data/files/` in dev); binaries excluded from daily DB backup (photo precedent) | 2026-06-12 |
| Meeting editor | Quick Log dialog is the canonical create+edit meeting editor app-wide (`useQuickLog().openEdit(id)`); contact-detail keeps its legacy embedded editor for now | 2026-06-12 |
| Restore test (Item 5) | ✅ Executed & PASSED: real prod backup restored into a scratch Turso DB via `server/scripts/restore-test.mjs` — 27/27 tables (2,604 rows), 15/15 sampled Blob URLs reachable, prod untouched. Backup→restore round-trip is now empirically proven; re-run the runbook against future backups if the schema/backup format changes | 2026-06-14 |
| Markdown speed input | Shared `MarkdownTextarea` (toolbar + Ctrl+B/I, Ctrl+Shift+8/7, Ctrl+Alt+1-3, Enter list auto-continue, paste-screenshot→upload→`![](url)`) instead of a rich-text editor | 2026-06-12 |
| Search upgrade | Plan of record `.planning/SEARCH-UPGRADE-PLAN.md`: full-field coverage, scope groups (People-profile / People-notes / Orgs / Meetings / Actions / Ideas), multi-term AND, 4 sorts, match snippets; plain `LIKE`, no FTS5 at current scale | 2026-06-12 |
| Case-sensitive search | `caseSensitive=true` param (user ask, default off): DB fetches the insensitive `LIKE` superset, JS verifies exact case during snippet computation; totals in cs-mode are the verified count of the fetched superset | 2026-06-12 |
| Favorite contacts | Stored as a reserved `Favorite` tag via the existing `ContactTag` junction (no schema change, synced, in backups); `GET /contacts/favorites` + `PATCH /contacts/:id/favorite`; UI = star toggle + quick-add chips in the Quick Log participants block | 2026-06-12 |
| Multi-org meetings | New `ConversationOrg` junction = orgs the meeting was WITH (anchor `companyId` stays primary, same pattern as `Contact.additionalCompanyIds`); distinct from `ConversationCompany` (orgs *discussed*). Org filter + search match both | 2026-06-12 |
| Meeting editor unification | **One editor: the Quick Log dialog**, app-wide. Retire the contact-page inline `ConversationsTab` editor; logging from a contact opens Quick Log seeded with that person as a Participant; drop the "1:1 anchor" field; add autosave (create-then-PUT). Plan: `.planning/UX-SEARCH-MEETINGS-PLAN.md` Phase C | 2026-06-13 |
| Search perf | ~20s search is Turso round-trip count (≈150 from `includeRelated` fan-out + sequential top-level finds), not data volume. Fix = lazy-load related on expand + `Promise.all` the independent queries. **No FTS** at this scale (text scan isn't the bottleneck) | 2026-06-13 |
| Search perf (shipped, Phase B3) | `GET /api/search` `includeRelated` now defaults **false**; per-card related loads lazily via `GET /api/search/related/:type/:id` (client caches by `${type}-${id}`); top-level finds + per-term company lookups run in `Promise.all`. Per-entity related count badge is gone (was the reason to fan out) → plain "Related" expander | 2026-06-13 |
| Meetings free-text ranking (shipped, Phase B2) | `/api/meetings?q=` covers every meeting field (mirrors search's `conversationClausesFor`) and ranks by max-weight: **title=4 > anchor/participant names=3 > anchor/addl org names + attendees desc=2 > everything else=1**, then date desc; fetch-300-then-slice JS pagination (same shape as the series-title path) | 2026-06-13 |
| LinkedIn import | Stays **paste-text only** (no screenshot/AI-vision path) — owner deferred mobile import 2026-06-13 | 2026-06-13 |
| Meetings calendar | **Separate meetings-only calendar** (List\|Calendar toggle on `/meetings`), distinct from the actions calendar; click an event → open in Quick Log; future-dated meetings = advance prep | 2026-06-13 |
| Meeting editor unification (shipped, Phase C) | Contact-page inline editor **retired**; Quick Log is the **sole** meeting editor. `useQuickLog().open({ participant?, title? })` seeds a contact as a Participant; "Who was there" auto-expands. **Autosave** = numeric-only body (scalars + already-resolved participants/orgs/tags) via POST-once-then-PUT through a serialized save chain; **never** sends `contactId` (preserves legacy anchors) or `createActions` (a PUT re-creates those). Free-text names + follow-up actions persist only on the explicit **"Done"** finalize; prep/attachments persist live once the record exists. A "meaningful content" gate stops a pre-seeded participant alone from auto-creating an empty meeting. The "1:1 anchor" field is gone — people via Participants only. Display fallback adds first-participant before attendees | 2026-06-14 |
| Meetings free-text highlight (shipped, Phase B4) | The Meetings `q` filter highlights matches in plain-text fields (display name, summary, attendees desc, next steps, participant/org/tag badges) via a shared `HighlightedText` ([client/src/components/highlighted-text.tsx](client/src/components/highlighted-text.tsx)) reused by Search; `notes`/prep markdown bodies stay un-highlighted (no `<mark>` into raw markdown) | 2026-06-14 |
| Meetings calendar (shipped, Phase D) | List\|Calendar toggle on `/meetings` (`?view=calendar`); meetings-only `MeetingsCalendar` (FullCalendar dayGrid+list) fetches **only the visible range** via `/api/meetings?from=&to=&limit=100` on `datesSet`, refetches on `searchbook:meeting-logged`. All-day events titled by `conversationDisplayName` (now participant-first), colored by type via a **hex** map (FullCalendar needs CSS colors, not Tailwind classes). Event click → `quickLog.openEdit(id)`. Mobile defaults to list view via a one-frame `ready` mount gate (so FullCalendar reads the resolved `useIsMobile` for `initialView`). Filters hidden in calendar view; series/`title` view forces list | 2026-06-14 |
| Terminology "Meetings" (shipped, Phase E) | User-facing "Conversation(s)" relabeled to "Meeting(s)" app-wide (contact tabs/Prep Sheet/delete copy, action detail, analytics chart, search heading, merge dialogs). **UI strings only** — `Conversation` model/types, `/conversations` API, event names, and `draft_*conversation*` localStorage keys unchanged (mirrors the Companies→Organizations relabel) | 2026-06-14 |

## User Feedback Summary

40 feedback items addressed across 5 sessions. Key patterns:
- Combobox with search + inline create for all entity reference fields
- Progressive disclosure for less-used fields (collapsible sections)
- Modal should NOT close on outside click (data loss prevention)
- Default conversation type: VIDEO_CALL, default contact status: CONNECTED
- Multiple emails and companies per contact
- Prep notes visible in conversation logging dialog (two-column layout)
- Markdown rendering for notes fields across all entities

See SESSION-HISTORY.md for the full feedback tables if needed.

## Blockers

None currently.

## Recent Session Log

For full history, see SESSION-HISTORY.md.

| Date | What Happened |
|------|---------------|
| 2026-06-13 | **Phase A of UX/Search/Meetings plan built + deployed** (commits `fe0c457` A1, `dcf2adc` A2+A3, `8f1e1f9` A4, `72aa6bf` docs, `ab3efea` A2 follow-up fix). A1 Consultant ecosystem (client-only — **no server ecosystem allow-list exists**; `ecosystem` is a plain passthrough TEXT column with no validation, so the plan's "add to server allow-list" step was a no-op); A2 clickable top-bar Search button; A3 one-tap clear on Search + Meetings search; A4 markdown format-before-typing (empty-line `prefixLines` no-op fixed). **No schema changes** (as the plan predicted). Follow-up fix: A2 button first wired to `useCommandPalette().open` (small cmdk modal, felt broken) → rewired to `navigate('/search')` to match **Ctrl+K**, which navigates to the full `/search` page (NOT a palette). Verified desktop + 390px via chrome-devtools. **Next: Phase B** (search correctness + ~20s perf fix). |
| 2026-06-13 | **Planning session — UX/Search/Meetings plan approved, no code.** Owner brought a 13-item worklist; produced + got sign-off on `.planning/UX-SEARCH-MEETINGS-PLAN.md` (Phases A–E: quick wins, search fixes/perf, Quick Log unification, meetings calendar, terminology). 3 decisions locked (unify on Quick Log; LinkedIn paste-only; separate meetings calendar). Diagnosis: 20s search = Turso query count not data volume (lazy-related + parallelize, no FTS); no schema changes needed anywhere in the plan. Next: implement Phase A first. |
| 2026-06-12 | **Phase 2 touch-ups built + deployed** (third session, commits `e099388`…`d718ffa`). Edit/delete on `/meetings` (Quick Log dialog → canonical editor with edit mode); meeting prep notes (`ConversationPrepNote`); attachments (`ConversationAttachment` + `POST /api/upload/file`); `MarkdownTextarea` speed-typing component; backup paths → 26 tables, version 4. User ran the 2 additive CREATE TABLEs in the Turso console. One Vercel build failure (unused var caught by `tsc -b` but not `tsc --noEmit` — client build is stricter than typecheck) fixed in `d718ffa`. **Search upgrade plan written** (`.planning/SEARCH-UPGRADE-PLAN.md`) — next build target. Gotcha: `npx prisma db push` resolves `file:./dev.db` against CWD, runtime against `server/prisma/` — push with `$env:DATABASE_URL='file:./prisma/dev.db'`; stray empty `server/dev.db` left behind, safe to delete. |
| 2026-06-12 | **Phase 1 built + deployed.** Taxonomy retheme (`08568e0`) + action direction/Waiting For (`71cd9b0`) on `main`; user ran the Turso migration in the web console (legacy ecosystem/status remaps + `Action.direction` column), verified clean. Discovered during impl: company `AWAITING_RESPONSE` status existed only client-side — added to eliminate set. Turso table names are PascalCase model names (`"Contact"`). |
| 2026-06-12 | **NCQA Adaptation Plan created** (`.planning/NCQA-ADAPTATION-PLAN.md`, plan of record): 6 phases — taxonomy retheme, meetings overhaul (Groups/fuzzy attendance/multi-subject), stakeholder stance+leverage, Copilot-recap AI ingest, Outlook ICS daily briefing, backlog extras. Session docs made agent-agnostic (root `AGENTS.md`, updated Gemini start/end prompts, CLAUDE.md). Decisions D1–D9 pending user sign-off. |
| 2026-02-28 | Conversation Participants — separate junction from "discussed", analytics drilldown updated. |
| 2026-03-04 | Log Conversation fixes — default date stale closure, modal width expansion, resizable panels (35/65 split). |
| 2026-03-05 | Timeout investigation — attempted unified endpoint, broke useAutoSave, reverted. |
| 2026-03-05 | **Timeout Root Cause & Fix.** Prisma `_count` subquery caused cascading Vercel timeouts. Stripped `_count`, added `/companies/names`, staggered loading, fetchWithRetry, non-blocking warmup. |
| 2026-03-24 | Multi-word search filtering, resilience layers (SW timeout fix, server timeout, client retry, warmup). |
| 2026-03-24 | **Query optimizations** — lighter action includes, analytics SQL aggregations, removed `_count` debug endpoint. Server timeout 25s→12s. Client retry on 500. |
| 2026-03-24 | **Turso reliability FIXED.** Root cause: `@libsql/client@0.5.6` HTTP transport hangs on large responses (170+ rows × all columns). Fix: (1) per-request fresh PrismaClient via `resetPrisma()` middleware, (2) explicit `select` on all list endpoints excluding large text fields. All endpoints now <300ms. |
| 2026-03-24 | **Prisma 6→7 upgrade.** `@libsql/client` 0.5.6→0.17.2. Adapter-based architecture (PrismaLibSql for Turso, PrismaBetterSqlite3 for local dev). Removed conditional select workaround in actions route. 171 actions now returned with full includes in production — no more response size limits. |
| 2026-06-03 | **Security hardening.** Shared-password gate over all `/api` routes (`x-app-password`), removed debug/credential leaks, hardened error output. `/health` now verifies DB connectivity. |
| 2026-06-03 | **Automated cloud backup.** Daily `/api/backup/cron` → Vercel Blob (`backups/` prefix, newest 30 kept), CRON_SECRET-gated. Settings UI lists/downloads them. Fixed export/import to cover all 23 tables (5 history/junction tables were missing). |
| 2026-06-03 | **Restore verified + `updatedAt` fix.** Isolated round-trip (seed all 23 tables → export → import → export) is now byte-identical. Fixed `/backup/import` to relink `Contact.referredById` via raw SQL so it no longer trips `@updatedAt`. NOTE: proven against local SQLite, not yet the production Turso transport (deferred to a desktop session). |
| 2026-06-03 | **Photo files in manual backup.** New `client/src/lib/photo-backup.ts` fetches actual image bytes and downloads `searchbook-photos.zip` (+ manifest) from "Create Backup". Uses `fflate`. Not in the daily cron. CORS against live Blob unverified (desktop test deferred). |
| 2026-06-03 | **Production Hardening Plan — Phase 1 complete** (Tasks 7–14, 19). Atomic restore, optimistic concurrency (409 on stale saves), autosave flush-on-nav + edit drafts + bounded retry, React error boundary, multi-write transactions, delete-impact counts, typecheck deploy gate, tags `_count`→`groupBy` Turso-hang fix. All on `main`. |
| 2026-06-04 | **Production Hardening Plan — Phase 2 complete** (Tasks 15–18, 20–25), merged to `main`. PWA `/api/` `NetworkOnly` + `prompt` updates; `express-rate-limit` + 2mb body limit; input allow-listing on company/relationship update; `safeParseArray` JSON-parse guards; dangling JSON-array ref scrub on company delete; CORS tightened to exact origins; opt-in Sentry (server + client) wired into the ErrorBoundary. Task 25 (photo backup) resolved by decision — best-effort, already covered by the manual photo-ZIP. Remaining user-action: set Sentry DSNs in Vercel to activate. |
| 2026-06-14 | **Favorite organizations** (`80911ff`). Mirror of favorite contacts, schema-free: reserved `Favorite` `CompanyTag` + `GET /companies/favorites` / `PATCH /companies/:id/favorite`. Star toggle + amber quick-add chips in Quick Log "Organizations" and Ideas "Related Companies" (owner scope: those two only). |
| 2026-06-14 | **Calendar polish** (`85ab6ec`). Meetings calendar (`MeetingsCalendar`): owner chose `dayMaxEvents={false}` so a day shows ALL its meetings inline (cell grows; no "+N more"; no filtering). Hover tooltip via `eventDidMount` `el.title` = first participant + summary (de-dupes the 1:1 case to summary-only). Calendar-only. |
| 2026-06-14 | **Backup binary coverage fixed** (`c5c18b5`). Manual ZIP now bundles ALL binaries, not just photos: `photo-backup.ts` → `collectBinaryRefs`/`buildBinariesZip` adds `ConversationAttachment` files + markdown-embedded `![](url)` screenshots; download renamed `searchbook-photos.zip` → `searchbook-files.zip`. Local-disk dev backup/restore now also copies `data/files`. `/cron` `tables` count derived from export (no more stale "24"). All 27 models confirmed in both backup paths. Matrix: `.planning/BACKUP-COVERAGE-AUDIT.md`. **Supersedes the 2026-06-03 "23 tables" / "photos only" rows.** Blob CORS from browser now CONFIRMED working (was unverified). |
| 2026-06-14 | **Restore-test harness** (`7d67dc5`). `server/scripts/restore-test.mjs` — schema bootstrap + FK-ordered restore (mirrors `importViaTurso`) + verify counts/relationships/binaries; prod-safe (`--confirm`, `--forbid-url`). Dry-run validated locally (27/27 tables, 544 rows). Real prod→scratch-Turso run is owner-gated (needs a scratch DB + prod backup download). Runbook: `.planning/RESTORE-TEST-RUNBOOK.md`. Closes carry-over "restore into scratch Turso DB" once owner runs it. |
