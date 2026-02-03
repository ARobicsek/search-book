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
| Navigation | Collapsible left sidebar with icons + labels | 2026-02-02 |
| Table library | TanStack Table (with shadcn DataTable recipe) | 2026-02-02 |
| Form layout | Full-page forms with grouped/collapsible sections | 2026-02-02 |
| DB schema timing | All tables created upfront in Phase 1 | 2026-02-02 |
| Folder structure | client/ + server/ at root, root package.json with concurrently | 2026-02-02 |
| Delete behavior | Hard delete (no soft delete) | 2026-02-02 |
| Contact list columns | Name, Title, Company, Ecosystem, Status, Location, Updated (7 cols) | 2026-02-02 |
| Company detail page | Included in Phase 1 scope | 2026-02-02 |
| Dashboard | Daily view (home page), weekly stats deferred to Phase 5 | 2026-02-03 |
| Action list filter | Simple toggle bar (All/Pending/Completed/Overdue) | 2026-02-03 |
| Calendar library | FullCalendar (month + week views, MIT license) | 2026-02-03 |
| Command palette | shadcn Command component (cmdk-based), Ctrl+K hotkey | 2026-02-03 |
| Quick-add Note | Saves to Ideas table | 2026-02-03 |
| Nudge list location | Integrated directly into Dashboard | 2026-02-03 |

## Coach's Guidance Incorporated
- 6 ecosystem types from coaching framework
- Status values aligned with coaching terminology
- "Open Questions" field per contact
- Location/Region field
- "Contacts without a next action" nudge list
- Weekly activity dashboard (outreach by ecosystem)
- Prep sheet view for pre-call preparation
- Follow-up triggers: 7, 14, 30, 90 day intervals

## User Feedback (from testing)
| Feedback | Phase | Notes |
|----------|-------|-------|
| Contact reference fields (e.g. "Who connected us") need combobox: search existing + free-text | 3 | Applies to referredBy and any person-reference field |
| Photo upload needed in contact create/edit form, not just detail page | 3 | Drag-drop or file picker in form |
| Conversation logging is high priority — structured date, people/companies discussed as searchable+free-text fields | 3 | Core to "capture immediately after conversations" philosophy |
| Global search across all documentation (contacts, ideas, conversations) for person/company names | 4 | Cross-entity full-text search |

## Blockers
None currently.

## Session Log
| Date | What Happened |
|------|---------------|
| 2026-02-02 | Initial planning session. Defined architecture, data model, features, phases. Wrote PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md. |
| 2026-02-02 | Phase 1 discuss + plan complete. Decided: sidebar nav, TanStack Table, full-page grouped forms, all tables upfront, client/server monorepo, hard delete, 7-column contact list, company detail in Phase 1. 13-task plan approved. Starting execution. |
| 2026-02-03 | Phase 1 execution: completed T1-T6. Scaffolding, Prisma schema (all tables), Contact/Company CRUD APIs, Tailwind+shadcn/ui setup, app shell with sidebar nav, routing, API utility, shared types. T7-T13 remain. |
| 2026-02-03 | Phase 1 execution: completed T7-T13. Contact list (TanStack Table, 7 sortable columns, ecosystem/status badges), contact create/edit form (4 grouped sections, company dropdown+freetext, validation), contact detail page (all fields, edit/delete with confirmation, future-phase placeholders), company list (6 sortable columns, status badges), company create/edit form (grouped sections, validation), company detail page (info, linked contacts list, edit/delete), toast error handling on all API calls. **Phase 1 complete.** |
| 2026-02-03 | Phase 2 execution: completed all tasks (T1-T12). Action types/enums (ActionType, ActionPriority, Action, Idea interfaces). Action CRUD API with filters (status, contactId, companyId), complete toggle endpoint. 8 sample actions in seed data. Action list page (TanStack Table, filter toggle bar, complete checkbox, badges). Action form (3 sections, query param pre-fill). Action detail page (badges, complete toggle, edit/delete). Dashboard with daily view (overdue/today/upcoming/unscheduled actions, nudge list). Calendar with FullCalendar (month/week views, color-coded by priority). Contact/Company detail pages updated with real actions list. Command palette (Ctrl+K) with quick-add for contacts/actions/notes. Ideas API endpoint. Sidebar and routing updated. Removed old home.tsx. Fixed TypeScript issues with Express route params. **Phase 2 complete.** |
