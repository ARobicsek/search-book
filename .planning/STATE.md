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
