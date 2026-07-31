# SearchBook

Personal CRM for executive job search networking. Single-user, browser-based. Deployed as PWA on Vercel with Turso cloud DB.

## Quick Reference

- **Live**: https://searchbook-three.vercel.app
- **Local client**: http://localhost:5173
- **Local server**: http://localhost:3001
- **Start locally**: `npm start`
- **Pre-push check**: `npm run prepush`
- **Deploy**: Auto on `git push` to main (Vercel connected to GitHub)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + TypeScript |
| UI | shadcn/ui (Tailwind CSS) |
| Backend | Express.js + TypeScript |
| DB (local) | SQLite via Prisma ORM |
| DB (prod) | Turso (libsql) via Prisma adapter |
| Photos (local) | `server/data/photos/` |
| Photos (prod) | Vercel Blob |
| PWA | vite-plugin-pwa |

## Project Structure

```
client/           # React frontend (Vite)
  src/
    components/   # Reusable UI components
    hooks/        # Custom hooks (useAutoSave, etc.)
    lib/          # API utility, helpers
    pages/        # Route pages
server/           # Express backend
  src/
    routes/       # API route handlers
    app.ts        # Express app (exportable)
    index.ts      # Local dev server entry
    db.ts         # Prisma client factory (SQLite or Turso)
  prisma/
    schema.prisma # Database schema
api/index.ts      # Vercel serverless entry point
.planning/        # Project docs (roadmap, state, requirements)
```

## Conventions

- **GSD methodology** with atomic commits per task
- **Auto-save pattern**: `useAutoSave` hook with debounced saves (1.5-2s)
- **Pagination**: Server returns `{ data: [...], pagination: { total, limit, offset, hasMore } }`
- **Server-side filters**: `/contacts` accepts `ecosystem`, `status`, `flagged`, `search`, `sortBy`, `sortDir`
- **Backup**: Browser-direct Turso queries (bypasses Vercel 30s timeout). **Every user-content Prisma model must be in both backup paths** (server `routes/backup.ts` export + `/import`; client `lib/backup.ts` `TABLES_PARENT_FIRST`); only `PushSubscription`/`DeletedSnapshot` are exempt (ephemeral). A guard (`server/scripts/check-backup-coverage.mjs`, run by `prepush` + the Vercel build) **fails the build** if a model is missing — add new models to the backup, or to the guard's `EXEMPT` set.
- **Toast notifications**: Use `sonner` (not react-hot-toast)
- **Markdown rendering**: Use `ReactMarkdown` with `prep-note-markdown` CSS class

## Critical Technical Notes

### Local Development
- `server/.env` must have Turso credentials **commented out** — otherwise the app hangs trying to connect to cloud DB
- If Prisma errors: `cd server && npx prisma generate`
- ⚠ **The local DB is `server/prisma/dev.db` — but the Prisma CLI doesn't agree.** `DATABASE_URL="file:./dev.db"` is resolved by the **runtime** (`db.ts`) relative to `server/prisma/`, and by the **CLI** relative to its CWD. So `npx prisma db push` / `db execute` from `server/` silently writes to a stray, empty **`server/dev.db`**, reports "in sync", and changes nothing the app reads — then every query 500s with *"column X does not exist"*. **This has bitten three sessions in a row (2026-07-07, -07-10, -07-13).** Always target the file explicitly:
  ```
  cd server && npx prisma db push --url "file:C:/dev/personal/searchbook/server/prisma/dev.db"
  ```
  Delete any `server/dev.db` that appears — it is never the real database. (Verify with `PRAGMA table_info(Conversation)` against `server/prisma/dev.db`, which should hold ~224 meetings.)

### Turso / Prisma Gotchas
- **Prisma 7 adapter-based architecture** — All database connections require explicit adapters: `PrismaLibSql` for Turso (production), `PrismaBetterSqlite3` for local SQLite (dev-only, dynamic import). No more `url` in schema datasource — connection config is in `prisma.config.ts` (CLI) and `db.ts` (runtime).
- **NEVER use `include: { _count: { select: { field: true } } }`** — generates a correlated subquery that hangs the Prisma-libsql adapter on Turso. Use `.length` client-side or raw SQL instead.
- **DON'T filter `DateTime` by exact equality (`where: { updatedAt: someDate }`) for a value that may have been written outside Prisma's typed path.** Prisma 7 stores DateTime as text `YYYY-MM-DDTHH:MM:SS.SSS+00:00` and binds that SAME form in equality filters, but backup-restore / bulk-import / raw-SQL writes store `...Z` (or `YYYY-MM-DD HH:MM:SS`). The filter then matches 0 rows even though the instant is identical. This broke the optimistic-concurrency guard (false 409 "changed on another device" on every save of a restored record) until `5910384` switched it to an app-code epoch-ms comparison (`assertNotStale` in `concurrency.ts`) against the already-fetched row. The same mixed-format data still lives in the DB, so prefer comparing parsed `Date.getTime()` in JS over DB-level datetime equality anywhere it matters.
- **List endpoints use explicit `select`** — Good practice to exclude large text fields (`notes`, `personalDetails`, etc.) from list views for performance.
- **Long-lived PrismaClient + retry-on-connection-error** — `db.ts` keeps ONE client, reused across requests. A `Proxy` routes every query through `runWithRetry`, which rebuilds the client and retries once only on a connection/transport error (stale libsql HTTP connection on a warm Vercel instance, ECONNRESET, "fetch failed", etc.) — never on a normal query rejection (P2xxx). Replaced the old per-request `resetPrisma()` middleware (rebuilt the client+adapter on every request), which was a heavy fix for the same stale-connection bug.
- **Turso CLI requires WSL on Windows** — use web dashboard instead
- **@libsql/client versions**: Server uses 0.17.2 (via `@prisma/adapter-libsql`), Client uses 0.17.0 (browser-direct via `/web` export for backup)
- **Schema migrations for Turso**: Prisma `db push` only works against local SQLite. For production, run the DDL directly. ⚠ **The Turso rw token committed (commented) in `server/.env` is STALE — it returns a hard 401.** So the "uncomment the creds and run a libsql script" path no longer works as-is: apply DDL via the **Turso web SQL console** (dashboard) instead, or get a fresh token from the owner first. Keep the DDL additive/non-destructive (`ALTER TABLE … ADD COLUMN … DEFAULT …`) and apply it **before** pushing any schema-touching code (the app breaks otherwise). Also mirrored in `AGENTS.md` non-negotiables + `NEXT-SESSION-PROMPT.md` open bugs.

### Vercel Deployment
- **30s timeout** (Hobby plan) — design endpoints to be fast
- **Env vars**: Use `printf 'value' | vercel env add VAR_NAME production` (not heredoc — avoids trailing newlines)
- **build:vercel script**: Must install both client and server deps before build
- **Read-only filesystem** — save-local backup endpoint only works in local dev
- **Photos**: Only Vercel Blob URLs work in production; local `/photos/` paths are dev-only

### UI Patterns
- **Overdue timezone**: Server accepts `today` query param from client for timezone-correct overdue calculation
- **Client timeout**: `TIMEOUT_MS = 28000` in `client/src/lib/api.ts`
- **Stale closure pattern**: When Radix UI fires callbacks needing current React state, use `useRef` + no-dep `useEffect` to sync refs, then read from refs in callbacks
- **Radix onOpenChange**: Fires for 'x' and Escape, but NOT for programmatic `setDialogOpen(false)`
- **Edit mode drafts**: localStorage keys `draft_edit_conversation_${id}` and `draft_conversation_${contactId}`
- **Contact detail loading**: Staggered — Phase 1 (core contact) then Phase 2 (secondary data) to avoid thundering herd
- **fetchWithRetry**: Used for secondary lookups (tags, companies, names) — retries once after 2s on failure
- **Transient status indicators reserve their box** — `SaveStatusIndicator` (`components/save-status.tsx`) stacks its `saving`/`saved`/`error` states in **one grid cell** (`col-start-1 row-start-1`) and cross-fades them, so it occupies the same space when idle. It used to return `null` when idle; mounting/unmounting it grew its row 18px→20px (its `text-sm` line box vs. a `leading-none` `DialogTitle`) on every autosave flash, stepping the whole Quick Log dialog down 2px and back every ~1.5s while typing. Any new come-and-go indicator in a row of other content must do the same. **Measure this class of bug** (`getBoundingClientRect()` sampled across a real state cycle) rather than eyeballing the CSS — 2px is invisible in a diff and unmissable on screen.
- **Global search fans out ONE REQUEST PER ENTITY GROUP** (`SEARCH_GROUPS` in `pages/search.tsx`): people / orgs / meetings / @-mentions / actions / ideas. A single all-scopes request ran six multi-table query waves inside one function invocation, which fit Vercel's 30s but **not Netlify's hard 10s** (`app.ts` fires its own 504 at 9s) — on the phone the spinner spun and the page silently blanked, while the *contacts* and *meetings* page searches (one narrow query each) kept working. Each group now gets the full 9s budget, they run in parallel across invocations, results paint as they land, and a group that fails is **named on screen with a Retry** instead of being swallowed. Two rules that go with it: (1) the URL-sync effect and the search effect must stay **separate** — `setSearchParams` is re-memoized on every URL change, so combining them fires every search twice (6 wasted invocations, not 1); (2) a superseded search **aborts** its in-flight requests via `api.get(path, { signal })`, which rejects with `AbortedError` and is never retried. The server is unchanged — it already accepted `scopes`, and the per-group `[TIMING] search … scopes=meetings → Nms` lines in the Netlify logs now say which group is slow.
- **Restore persisted UI state in the `useState` initializer, and make a superseded fetch abort** — `components/import-outlook-dialog.tsx`. The Outlook import picker restored its last-used date range in an **on-open effect**, but the dialog is mounted for the page's whole life, so the first render still held the `next7` default and the load effect — *same commit, state updates not yet applied* — fetched **that** range before the restore landed. Every open ran two overlapping `/calendar/events` requests, and nothing decided which response was still wanted: picking "Today" painted 7 days, then tomorrow, then today; and when the stale wide request happened to be the slowest it **won**, leaving a week of meetings on screen with Today selected and `07/31 → 07/31` in the date inputs — importing from there would have created the wrong meetings, so this class of bug is not merely cosmetic. Two rules: (1) read `localStorage` in the **`useState` initializer** — an on-open effect may only *re-resolve* presets against today's date (so a tab left open overnight can't reopen on yesterday's "Today") and must hand back the **same object** when nothing moved, or it re-triggers the fetch; (2) `load()` stamps a **sequence number** and aborts the previous `AbortController`, so a superseded response can't set events, report an error, or clear the spinner — `finally` runs after an early `return`, so the guard belongs in there too. Same discipline as global search above. ⚠ **Measure a symptom whose appearance depends on timing** — which response wins is a race, so this was reproduced with a **latency-controlled `fetch` stub** and counted (pre-fix 3 requests / 4 paints, and the wrong final state when the stale one was slowest; post-fix one request per user action, one paint, correct in both orderings) rather than reasoned about.

- **A destructive action must never be a `CommandItem`** — cmdk auto-highlights the **first row** in the
  list and Enter activates it. `MultiCombobox`'s "Clear all" was rendered first *and* deliberately exempt
  from the search filter, so typing a name that matched nothing (i.e. **adding someone new** — the single
  most common thing the participant picker is for) left "Clear all" as the highlighted row: one Enter
  silently dropped every participant already on the meeting, with no confirmation and no undo. Clearing
  now lives in a **footer below `CommandList`** (`CLEAR_FOOTER` in `ui/combobox.tsx`) — outside the list, so
  it is not a cmdk item and no keystroke aimed at the list can reach it — and the multi-select one **asks
  first** (`Clear all` → `Remove all N? Clear / Cancel`, disarmed whenever the popover closes). The footer
  doubles as an "N selected" readout. Same for the single `Combobox`'s "Clear selection". **Any new
  clear/delete/reset affordance in a combobox belongs in the footer, not the list.**
- **A photo can be added without opening the edit form** — `components/contact-photo-tile.tsx`. The
  contact's avatar *is* the editor: drop an image straight on it, or click for browse / paste / URL, and it
  saves immediately via the narrow **`PATCH /contacts/:id/photo`** (deliberately not the `PUT`, which runs
  the whole form payload through `processFormData` — a photo-only caller would have to send, and risk
  clobbering, every other field). Mounted at `size="lg"` in the contact-card header (where a contact with
  no photo previously rendered *nothing* — now an initials tile, which is what makes it discoverable) and
  at `size="sm"` on each **Quick Log participant row**, so a person added during a meeting gets a face
  without leaving the log (`/contacts/names` carries `photoUrl`/`photoFile` for this). Upload mechanics are
  shared with the form's `<PhotoUpload>` via **`hooks/use-image-upload.ts`**. ⚠ **Clipboard paste needs
  exactly one enabled target at a time** — the listener is on `document`, so two mounted instances both
  consume the same paste. Hence `pasteEnabled` is `open || pagePaste`: a tile only listens while its
  popover is open, and the page-wide variant is opt-in *and* gated on the contact having **no photo yet**
  (`pagePaste={!photoSrc}`), so a stray screenshot paste can never silently replace an existing photo. The
  hook keeps the existing guard that ignores pastes aimed at `input`/`textarea`/`contenteditable`.

### Data Model Notes
- **Multi-select actions**: `ActionContact`/`ActionCompany` junction tables. Legacy single `contactId`/`companyId` preserved for backward compat
- **Multiple companies per contact**: `additionalCompanyIds` JSON array with `{id, isCurrent}` objects
- **Multiple emails**: `additionalEmails` JSON field with dynamic inputs
- **Conversation participants vs discussed**: `ConversationParticipant` junction for attendees, `ConversationContact` for people mentioned
- **Multi-org meetings**: `ConversationOrg` junction = orgs the meeting was WITH (anchor `companyId` stays the primary org); `ConversationCompany` = orgs *discussed*
- **Favorite contacts**: reserved `Favorite` tag via `ContactTag` (no dedicated column); `GET /contacts/favorites`, `PATCH /contacts/:id/favorite`
- **@-mentions are DERIVED from note text**: `[@Name](/contacts/7)` / `(#mention)` tokens in a meeting's notes/nextSteps/prep notes are re-parsed into `ConversationMention` on every save (`server/src/lib/mentions.ts`). The note text is the single source of truth — never write mention rows directly.
- **Resolving a loose mention is find-or-**create**, and merges must rewrite its token.** A loose token (`#mention` / `#org-mention`) is inert text: nothing retro-binds it when a matching record is created later, so the Mentions page keeps offering "Create" for a name that already exists. `POST /mentions/:id/create-company` used to call `company.create` blind, which is how *Peterson Center on Healthcare* and *Battelle* each ended up with two rows (the fingerprint: the duplicate has **no `CompanyStatusHistory`** — only `POST /companies` and `/companies/resolve` write one). Both create-* routes now go through `resolveExistingCompanyByName` / `resolveExistingContactByName` and return `linked: true` when they bind instead of create; `POST /mentions/:id/link` binds to a record the owner picks (for near-misses like note "Peterson Health" → org "Peterson Center on Healthcare" — the prose wording is preserved, only the token target changes). ⚠ Symmetrically, **any merge that deletes a record must rewrite `(/companies/N)` / `(/contacts/N)` in note text and re-sync** (`runCompanyMerge`/`runContactMerge` in `routes/duplicates.ts`): `ConversationMention.companyId` is `onDelete: SetNull`, so skipping it leaves a dead link in the prose that degrades back to a *loose* mention on the next save — re-offering "Create" and re-minting the duplicate just merged away.
- **@-mention search** (`/api/search`): the `mentions` scope queries that index (who was *called out* with `@`), NOT note prose. All terms must match ONE mention row, so "Anne Smith" can't match a meeting that separately mentions "Anne Jones" and "Bob Smith". `?mention=<key>` pins the search to one target — `contact:440` / `company:5` (bound, id-based, survives renames) or `person:<name>` / `org:<name>` (loose — a name never made a contact). A pinned target **forces the mentions scope** (the other scopes can't answer "who was @-mentioned", and with no terms they'd match every record); query words then narrow the *meeting's* text. The `@` picker in global search is fed by `GET /api/mentions/index` (distinct mentioned entities + meeting counts). ⚠ A **loose** target must match by name, and Prisma's `equals` is case-sensitive on SQLite, so its clause uses `contains` — which over-matches a longer name ("Anne Marie Smith" is a substring of "Anne Marie Smithson"). Rows **and counts** are therefore re-verified in app code (`mentionMatchesTarget`).
- **Meeting start/end times**: `Conversation.startTime` + `endTime` (local `HH:MM`; date-only meetings leave both null). Filled automatically by the Outlook import from the ICS `DTSTART`/`DTEND`, editable in Quick Log. `endTime` is what makes the meetings list's green **"Now"** marker exact; when it's null the UI assumes a 60-min duration (`ASSUMED_MEETING_MINUTES` in `meetings.tsx`) — which is why a meeting imported **before `endTime` shipped (2026-07-13)** stayed green past its real end. Re-import repairs those: `POST /calendar/import` is still never-overwrite for an already-imported `(calendarUid, date)`, with one additive exception — it fills a **blank** start/end from the feed (`missingTimes` in `routes/calendar.ts`, only when the feed's start still matches the stored one, so a moved meeting can't get an end that precedes its start). The picker flags such meetings `needsTimeFix` and shows an amber **"Add times"** badge instead of graying them out. An event crossing midnight stores `endTime: null` (a single-day record can't hold an end that reads as earlier than its start). The list re-renders on a 30s tick (`useClockTick`) so "Now" turns itself on and off.
- **Company Activity Log**: `CompanyActivity` model for company-level event tracking
- **Status history**: `ContactStatusHistory` and `CompanyStatusHistory` for analytics transitions
- **Action reminders**: optional `Action.dueTime` ("HH:MM" local; `dueDate` stays date-only), opt-in `Action.notify` (independent of time; default time 08:00 weekdays / 10:00 weekends `REMINDER_TZ`=America/New_York; Time field is a forgiving free-text input `client/src/components/time-input.tsx` — "9a"→9:00 AM, bare hour assumes :00), `Action.lastNotifiedAt` (cron fires once; editing date/time/notify re-arms it). `PushSubscription` table = one Web Push subscription per device (excluded from backup). Free VAPID Web Push fanned out by `/api/cron/reminders` (gated by `REMINDERS_CRON_SECRET`, falls back to `CRON_SECRET`), poked every minute by a **free external cron** (cron-job.org) — no paid Vercel Cron. SW push handlers in `client/public/push-sw.js` (imported into the Workbox SW via `importScripts`). Full runbook: `.planning/ACTION-REMINDERS.md`
- **Recurring actions**: `Action.recurring` + `recurringIntervalDays` (every N days) + optional `recurringEndDate`, OR `recurringWeekdaysOnly` (bool) = **every weekday Mon–Fri, skipping Sat/Sun** (interval is ignored in that mode — Fri→Mon isn't a fixed day count). Next occurrence is auto-created on **completion** (`PATCH /actions/:id/complete`), carrying the schedule **and** the reminder (`dueTime`/`notify`) forward; `lastNotifiedAt` is left null so the cron arms a fresh reminder for the new occurrence. UI: the action form's "Recurring action" block has a **Repeat** selector (Every N days / Every weekday); interval input hides in weekday mode.

## ⚠ Migration in flight: Vercel → Netlify

**NCQA IT is revoking Vercel access**, so the app is being migrated to Netlify. The plan of record is
**`.planning/NETLIFY-MIGRATION-PLAN.md`** (it supersedes `VERCEL-EXIT-PLAN.md`, whose Cloud Run target is
dead — `*.run.app` is blocked at NCQA while `*.netlify.app` is not).

- ⚠ **`ari-search-book.netlify.app` is now the app to use — Vercel's images are BROKEN.** Phase 4 ran
  on 2026-07-26: all 307 blobs were copied into Netlify Blobs and the DB's 218 absolute URLs were
  rewritten to relative `/photos/`·`/files/` paths, which only Netlify serves. Vercel still runs and its
  text data is live and shared (same Turso DB), but do not treat it as the daily driver any more.
- **`main` is the source of truth AND what deploys** — the migration branch was merged in on 2026-07-26,
  and **Netlify's production branch is confirmed pointed at `main`** (verified 2026-07-27 by a push to
  `main` reaching the live site). A plain `git push origin main` is the deploy. Everything stays env-gated
  on `netlifyBlobsEnabled()` (`STORAGE=netlify` or the runtime `NETLIFY` signal), so the same commits
  remain dormant on Vercel/local.
- **Phases 0–5 are complete (2026-07-26). Phase 6 (decommission Vercel) is next**, after a few normal days.
- **Crons now run on cron-job.org against Netlify**: `searchbook-alert` = reminders, **every 5 minutes**
  (`*/5 * * * *` — not every minute; see the plan's Appendix A: Netlify's free tier is 300 credits/month
  and the minutely cadence would have consumed roughly all of it, which **pauses every project** rather
  than throttling). `searchbook-backup` = daily 04:00 ET, and it authenticates with an
  `Authorization: Bearer $CRON_SECRET` **header**, so it cannot be tested from a browser address bar.
  The daily backup also still runs as a Vercel-native cron in `vercel.json` until that project is deleted.
- **Push works on the phone; the Windows desktop silently doesn't.** FCM returns 201 for the desktop
  subscription, so the fault is Windows/Chrome-side, not SearchBook's. Push subscriptions are **per-origin**
  — a subscription made on the Vercel origin can never receive from Netlify, and `reminders.ts` stamps
  `lastNotifiedAt` **even when delivery fails**, so re-subscribe a device *before* pointing any cron at a
  new origin or the reminders in that window are silently eaten.
- **Rollback window is still open until Phase 6 deletes the Vercel Blob store**:
  `node server/scripts/rewrite-blob-urls.mjs sv1nlcmvomldhzg3.public.blob.vercel-storage.com --undo`
  puts the absolute URLs back. Do not delete that store until you are sure.
- Netlify's function timeout is a hard **10 s** (vs Vercel's 30 s), which is why `app.ts` fires its own 504 at
  9 s under `NETLIFY` and the client auto-retries transient 5xx. Design endpoints accordingly — and note that
  auto-retry only helps a request that *fits* the budget: global search didn't, and had to be **split into one
  request per entity group** (see "Global search fans out ONE REQUEST PER ENTITY GROUP" under UI Patterns; the
  full record is bug #12 in `NETLIFY-MIGRATION-PLAN.md` §8.5). **A request that needs more than ~9 s of work
  must be decomposed, not retried.**

## Current Status

**The app is being adapted for the owner's new role as Chief Medical Officer of NCQA** — from job-search CRM to executive stakeholder-management system. The active **plan of record is `.planning/NCQA-ADAPTATION-PLAN.md`** (taxonomy retheme, multi-person/multi-subject meetings via autocompleted title "series" — **no Groups**, per D4 — stakeholder stance/leverage tracking, AI ingest of MS Copilot meeting recaps, Outlook-calendar daily briefing). **Phases 1 & 2 are complete and deployed (2026-06-12); Phase 3+ is next**, gated on decisions D5–D9 (don't push on those until the owner raises them).

Historical: ROADMAP Phases 1–7 + 7.5 (security/backup hardening) + Production Hardening Plan Phases 0–2 are complete. Old ROADMAP Phase 8 (Google Drive document search) is superseded by the adaptation plan's Task 6.2 (semantic search over meeting notes). Standing follow-up: set `SENTRY_DSN`/`VITE_SENTRY_DSN` in Vercel to activate error tracking.

**The owner has granted standing permission to commit/push directly to `main`** (auto-deploys to Vercel for testing). Run `npm run prepush` first; never push schema-touching code before the Turso DDL is applied (procedure at the top of the adaptation plan).

## Session Management

The session protocol is **single-sourced in root `AGENTS.md`** (agent-agnostic — Claude Code and
Gemini/Antigravity both follow it). Read `AGENTS.md` at session start/end for the exact read order,
end-of-session steps, and non-negotiables. `.planning/README.md` maps every planning doc.
