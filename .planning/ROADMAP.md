# SearchBook — Roadmap

## Phase Overview

| Phase | Name | Status | Description |
|-------|------|--------|-------------|
| 1 | Foundation | ✅ Complete | Project setup, DB schema, Contact & Company CRUD, basic UI shell |
| 2 | Actions & Calendar | ✅ Complete | Action system, daily view, calendar, quick-add palette, nudge list |
| 3 | Conversations & Relationships | ✅ Complete | Conversation logging, relationships, drag-drop photos, prep sheet |
| 4 | Search, Import & Tags | ✅ Complete | Global search, date-range search, CSV import/export, tags, ideas, links |
| 5 | Recurring Tasks & Dashboard | ✅ Complete | Recurring actions, contact flagging, weekly activity dashboard, PWA |
| 6 | Backup & Polish | ✅ Complete | Google Drive backup, UX polish, keyboard shortcuts, data cleanup |

---

## Phase 1: Foundation

### Goals
- Working local app: `npm start` opens browser with SearchBook
- Full database schema in place (all tables)
- Contact CRUD with all fields and ecosystem types
- Company CRUD as separate entity
- Contact list view (table with columns)
- Company list view
- Contact detail page
- Basic navigation (sidebar or top nav)

### Acceptance Criteria
- [x] `npm start` launches both backend (Express) and frontend (React)
- [x] Can create, view, edit, delete a contact with all fields
- [x] Can create, view, edit, delete a company
- [x] Can link a contact to a company
- [x] Contact list displays all contacts in a sortable table
- [x] Contact detail page shows all fields
- [x] Navigation between views works

---

## Phase 2: Actions & Calendar

### Goals
- Full action/task management system
- Daily view showing "what to do today"
- Calendar with month and week views
- Quick-add command palette
- Nudge system for contacts without next actions

### Acceptance Criteria
- [x] Can create actions with due dates, types, priorities
- [x] Can link actions to contacts and companies
- [x] Daily view shows today's actions sorted by priority
- [x] Calendar shows actions on their due dates
- [x] Ctrl+K opens quick-add palette for contacts, actions, notes
- [x] Can mark actions complete (records completion date)
- [x] Overdue actions are visually highlighted
- [x] "Contacts without a next action" list is visible

---

## Phase 3: Conversations & Relationships

### Goals
- Log conversations with flexible dating
- Create follow-up actions from conversations
- Track relationships between contacts
- Photo support (drag-drop upload + URL)
- Pre-call prep sheet view

### Acceptance Criteria
- [x] Can log conversations with day, month, or quarter precision dates
- [x] Can create follow-up actions directly from conversation "next steps"
- [x] Can record relationships (referred_by, knows, etc.)
- [x] Can drag-drop JPG/PNG photos onto contact profile
- [x] Can paste photo URLs
- [x] Contact detail shows full history (conversations, actions, relationships)
- [x] Prep sheet view shows last conversation, open questions, relationships at a glance

---

## Phase 4: Search, Import & Tags

### Goals
- Powerful search across all data
- CSV import with field mapping
- Tag system for contacts and companies
- Ideas scratchpad
- Links management

### Acceptance Criteria
- [x] Can search contacts/companies by name, role, company, keywords, ecosystem, status
- [x] Can filter by date range of last outreach
- [x] Can import contacts from CSV with column mapping
- [x] Can export contacts to CSV
- [x] Can create, assign, and filter by tags
- [x] Ideas CRUD works
- [x] Links CRUD works, linked to contacts/companies (done in Phase 3 feedback)

---

## Phase 5: Recurring Tasks & Dashboard

### Goals
- Recurring action automation
- Contact flagging for batch action
- Weekly activity dashboard
- PWA support (offline-first, installable)
- Analytics dashboard

### Acceptance Criteria
- [x] Completing a recurring action auto-creates the next occurrence
- [x] Can flag multiple contacts for action by a specific date
- [x] Dashboard shows: outreach by ecosystem, completed vs due, overdue count, contacts needing attention
- [x] Action history log shows all completed actions with dates
- [x] PWA: Offline-first with service worker caching
- [x] PWA: Installable with manifest
- [x] Analytics: Contacts added over time chart
- [x] Analytics: Conversations logged over time chart
- [x] Analytics: Distribution by ecosystem and status

---

## Phase 6: Backup & Polish

### Goals
- Database backup to Google Drive folder
- UX improvements
- Documentation

### Acceptance Criteria
- [x] One-click backup of DB + photos to specified folder
- [x] Can restore from backup
- [x] Loading states and error handling throughout
- [x] Keyboard shortcuts documented in-app
- [x] Duplicate detection or cleanup tool
