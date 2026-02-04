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

## User Feedback Session 2 (Phase 3 testing)
| # | Feedback | Resolution |
|---|----------|------------|
| 1 | Photo not displaying; circle too small | Added /photos Vite proxy; changed to 20x20 rounded-lg rectangle |
| 2 | Auto-set status to CONNECTED on conversation log | Conversations API auto-updates NEW→CONNECTED |
| 3 | Desktop icon to launch app | Created SearchBook.vbs + .bat launcher, desktop shortcut |
| 4 | Search+add-new for people/companies discussed | MultiCombobox allowFreeText=true; auto-creates contacts/companies on submit |
| 5 | Multiple actions per conversation | createActions[] array support; UI with add/remove action rows |
| 6 | 'Meet' action type | Added MEET to ActionType |
| 7 | Links in prep sheet and conversation log | Links CRUD API, links section in PrepSheet, links field in conversation dialog |
| 8 | 'Video Call' conversation type | Added VIDEO_CALL to ConversationType |
| 9 | Company search+create combobox | Company field is now Combobox with allowFreeText; auto-creates company on save |
| 10 | Default status = CONNECTED | Changed emptyForm default from NEW to CONNECTED |
| 11 | Progressive disclosure for less-used fields | Collapsible sections for Phone/LinkedIn, How Connected, Research |
| 12 | Personal details free text field | Added personalDetails to Contact model with collapsible section |
| 13 | Remove Needs Attention from Dashboard | Removed nudge list section entirely |

## User Feedback Session 3 (Phase 3 testing continued)
| # | Feedback | Resolution |
|---|----------|------------|
| 14 | Change Chrome tab title to SearchBook | Updated index.html title |
| 15 | Modal shouldn't close on outside click | Added onInteractOutside handler to DialogContent for conversation/relationship dialogs |
| 16 | Add new contacts from 'who connected us' field | Enabled allowFreeText on referredBy Combobox; auto-creates contact on save |
| 17 | Show next step due date on card | Added due date display to action items in conversation cards |
| 18 | Prep sheet needs text notes + doc links | Combined with #24 → PrepNote model with dated entries |
| 19 | Save button at top of contact form | Added save/cancel buttons in header row alongside title |
| 20 | Track company history (X→Y) | Added EmploymentHistory model; "Move to history" button in contact form |
| 21 | Role description field | Added roleDescription field to Contact model; textarea in form, display in detail/prep sheet |
| 22 | Alphabetical sort in comboboxes | Added .sort() to filteredOptions in Combobox and MultiCombobox |
| 23 | Timezone bug (tomorrow shows as today) | Changed toISOString().split('T')[0] to toLocaleDateString('en-CA') for local timezone |
| 24 | Dated prep elements | Created PrepNote model (content, url, urlTitle, date); Prep Notes section in PrepSheet tab |
| 25 | Cloud backup | Noted for Phase 6 (Google Drive backup already in roadmap) |

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
| 2026-02-03 | Phase 3 started: Conversations & Relationships. Completed T1-T5 of 13 tasks. T1: Added ConversationContact and ConversationCompany junction tables to Prisma schema (db push applied). T2: Added Conversation, Relationship types and enums to client types.ts. T3: Created photo upload backend (multer, /api/upload endpoint, static serving at /photos). T4: Added uploadFile method to API utility. T5: Created reusable Combobox and MultiCombobox components (shadcn popover + command). Also installed shadcn tabs component. **Phase 3 in progress (5/13 tasks complete).** |
| 2026-02-03 | Phase 3 feedback fixes: All 13 user feedback items addressed. Photo display fix (proxy + sizing), auto-status CONNECTED, desktop launcher, search+add-new for contacts/companies in conversation log, multiple actions per conversation, Meet action type, Video Call conversation type, links in prep sheet + conversation log, company combobox with auto-create, default status CONNECTED, progressive disclosure (collapsible sections), personal details field, removed Needs Attention from dashboard. Links CRUD API created. Collapsible component installed. **Phase 3 feedback complete.** |
| 2026-02-03 | Phase 3 completed T6-T13. T6: PhotoUpload UI component (drag-drop, click-to-browse, URL paste, preview with remove). T7: Conversations API (CRUD with junction tables for contactsDiscussed/companiesDiscussed, optional follow-up action creation). T8: Relationships API (CRUD, bidirectional contactId filter). T9: Contact detail page refactored to tabs (Overview, Conversations, Relationships, Prep Sheet). T10: Conversation UI (card list + dialog form with date precision, type, summary, notes, nextSteps, multi-select contacts/companies discussed, optional follow-up action). T11: Relationship UI (card list + dialog form with type, direction, contact select, notes). T12: Contact form updated with PhotoUpload component and referredBy Combobox. T13: Prep Sheet tab (last conversation, open questions, pending actions, relationships, key info). Both client and server pass TypeScript checks. **Phase 3 complete.** |
| 2026-02-03 | Phase 3 feedback round 2: All 12 user feedback items (#14-25) addressed. Chrome tab title fixed. Modal outside-click prevented. ReferredBy field now allows adding new contacts. Action due dates shown on cards. Save button added at top of contact form. RoleDescription field added to Contact. Combobox options sorted alphabetically. Timezone bug fixed (local vs UTC). PrepNote model created for dated prep elements with text/links. EmploymentHistory model created for tracking company changes. Item #25 (cloud backup) noted for Phase 6. **Phase 3 feedback round 2 complete.** |
