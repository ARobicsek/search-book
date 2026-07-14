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

### Data Model Notes
- **Multi-select actions**: `ActionContact`/`ActionCompany` junction tables. Legacy single `contactId`/`companyId` preserved for backward compat
- **Multiple companies per contact**: `additionalCompanyIds` JSON array with `{id, isCurrent}` objects
- **Multiple emails**: `additionalEmails` JSON field with dynamic inputs
- **Conversation participants vs discussed**: `ConversationParticipant` junction for attendees, `ConversationContact` for people mentioned
- **Multi-org meetings**: `ConversationOrg` junction = orgs the meeting was WITH (anchor `companyId` stays the primary org); `ConversationCompany` = orgs *discussed*
- **Favorite contacts**: reserved `Favorite` tag via `ContactTag` (no dedicated column); `GET /contacts/favorites`, `PATCH /contacts/:id/favorite`
- **@-mentions are DERIVED from note text**: `[@Name](/contacts/7)` / `(#mention)` tokens in a meeting's notes/nextSteps/prep notes are re-parsed into `ConversationMention` on every save (`server/src/lib/mentions.ts`). The note text is the single source of truth — never write mention rows directly.
- **@-mention search** (`/api/search`): the `mentions` scope queries that index (who was *called out* with `@`), NOT note prose. All terms must match ONE mention row, so "Anne Smith" can't match a meeting that separately mentions "Anne Jones" and "Bob Smith". `?mention=<key>` pins the search to one target — `contact:440` / `company:5` (bound, id-based, survives renames) or `person:<name>` / `org:<name>` (loose — a name never made a contact). A pinned target **forces the mentions scope** (the other scopes can't answer "who was @-mentioned", and with no terms they'd match every record); query words then narrow the *meeting's* text. The `@` picker in global search is fed by `GET /api/mentions/index` (distinct mentioned entities + meeting counts). ⚠ A **loose** target must match by name, and Prisma's `equals` is case-sensitive on SQLite, so its clause uses `contains` — which over-matches a longer name ("Anne Marie Smith" is a substring of "Anne Marie Smithson"). Rows **and counts** are therefore re-verified in app code (`mentionMatchesTarget`).
- **Meeting start/end times**: `Conversation.startTime` + `endTime` (local `HH:MM`; date-only meetings leave both null). Filled automatically by the Outlook import from the ICS `DTSTART`/`DTEND`, editable in Quick Log. `endTime` is what makes the meetings list's green **"Now"** marker exact; when it's null the UI assumes a 60-min duration (`ASSUMED_MEETING_MINUTES` in `meetings.tsx`) — which is why a meeting imported **before `endTime` shipped (2026-07-13)** stayed green past its real end. Re-import repairs those: `POST /calendar/import` is still never-overwrite for an already-imported `(calendarUid, date)`, with one additive exception — it fills a **blank** start/end from the feed (`missingTimes` in `routes/calendar.ts`, only when the feed's start still matches the stored one, so a moved meeting can't get an end that precedes its start). The picker flags such meetings `needsTimeFix` and shows an amber **"Add times"** badge instead of graying them out. An event crossing midnight stores `endTime: null` (a single-day record can't hold an end that reads as earlier than its start). The list re-renders on a 30s tick (`useClockTick`) so "Now" turns itself on and off.
- **Company Activity Log**: `CompanyActivity` model for company-level event tracking
- **Status history**: `ContactStatusHistory` and `CompanyStatusHistory` for analytics transitions
- **Action reminders**: optional `Action.dueTime` ("HH:MM" local; `dueDate` stays date-only), opt-in `Action.notify` (independent of time; default time 08:00 weekdays / 10:00 weekends `REMINDER_TZ`=America/New_York; Time field is a forgiving free-text input `client/src/components/time-input.tsx` — "9a"→9:00 AM, bare hour assumes :00), `Action.lastNotifiedAt` (cron fires once; editing date/time/notify re-arms it). `PushSubscription` table = one Web Push subscription per device (excluded from backup). Free VAPID Web Push fanned out by `/api/cron/reminders` (gated by `REMINDERS_CRON_SECRET`, falls back to `CRON_SECRET`), poked every minute by a **free external cron** (cron-job.org) — no paid Vercel Cron. SW push handlers in `client/public/push-sw.js` (imported into the Workbox SW via `importScripts`). Full runbook: `.planning/ACTION-REMINDERS.md`
- **Recurring actions**: `Action.recurring` + `recurringIntervalDays` (every N days) + optional `recurringEndDate`, OR `recurringWeekdaysOnly` (bool) = **every weekday Mon–Fri, skipping Sat/Sun** (interval is ignored in that mode — Fri→Mon isn't a fixed day count). Next occurrence is auto-created on **completion** (`PATCH /actions/:id/complete`), carrying the schedule **and** the reminder (`dueTime`/`notify`) forward; `lastNotifiedAt` is left null so the cron arms a fresh reminder for the new occurrence. UI: the action form's "Recurring action" block has a **Repeat** selector (Every N days / Every weekday); interval input hides in weekday mode.

## Current Status

**The app is being adapted for the owner's new role as Chief Medical Officer of NCQA** — from job-search CRM to executive stakeholder-management system. The active **plan of record is `.planning/NCQA-ADAPTATION-PLAN.md`** (taxonomy retheme, multi-person/multi-subject meetings via autocompleted title "series" — **no Groups**, per D4 — stakeholder stance/leverage tracking, AI ingest of MS Copilot meeting recaps, Outlook-calendar daily briefing). **Phases 1 & 2 are complete and deployed (2026-06-12); Phase 3+ is next**, gated on decisions D5–D9 (don't push on those until the owner raises them).

Historical: ROADMAP Phases 1–7 + 7.5 (security/backup hardening) + Production Hardening Plan Phases 0–2 are complete. Old ROADMAP Phase 8 (Google Drive document search) is superseded by the adaptation plan's Task 6.2 (semantic search over meeting notes). Standing follow-up: set `SENTRY_DSN`/`VITE_SENTRY_DSN` in Vercel to activate error tracking.

**The owner has granted standing permission to commit/push directly to `main`** (auto-deploys to Vercel for testing). Run `npm run prepush` first; never push schema-touching code before the Turso DDL is applied (procedure at the top of the adaptation plan).

## Session Management

The session protocol is **single-sourced in root `AGENTS.md`** (agent-agnostic — Claude Code and
Gemini/Antigravity both follow it). Read `AGENTS.md` at session start/end for the exact read order,
end-of-session steps, and non-negotiables. `.planning/README.md` maps every planning doc.
