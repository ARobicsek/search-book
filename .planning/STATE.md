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
| Contact statuses | NEW, CONNECTED, AWAITING_RESPONSE, FOLLOW_UP_NEEDED, WARM_LEAD, ON_HOLD, CLOSED | 2026-02-02 |
| Photos | Drag-drop upload (JPG/PNG) + URL paste | 2026-02-02 |
| Date flexibility | Support day, month, or quarter precision for historical entries | 2026-02-02 |
| Recurring tasks | Supported with configurable intervals | 2026-02-02 |
| Relationships | Record now, graph visualization later | 2026-02-02 |
| Data entry | Quick-add palette + structured forms + CSV bulk import | 2026-02-02 |
| Search | By name, role, company, date of contact, keywords, ecosystem, status | 2026-02-02 |
| Methodology | GSD (Get Shit Done) framework | 2026-02-02 |
| OS | Windows | 2026-02-02 |
| Google Drive | User will install Drive for Desktop; backup to synced folder | 2026-02-02 |

## Coach's Guidance Incorporated
- 6 ecosystem types from coaching framework
- Status values aligned with coaching terminology
- "Open Questions" field per contact
- Location/Region field
- "Contacts without a next action" nudge list
- Weekly activity dashboard (outreach by ecosystem)
- Prep sheet view for pre-call preparation
- Follow-up triggers: 7, 14, 30, 90 day intervals

## Blockers
None currently.

## Session Log
| Date | What Happened |
|------|---------------|
| 2026-02-02 | Initial planning session. Defined architecture, data model, features, phases. Wrote PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md. |
