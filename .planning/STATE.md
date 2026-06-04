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
