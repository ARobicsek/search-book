# SearchBook — Roadmap

## Phase Overview

| Phase | Name | Status | Description |
|-------|------|--------|-------------|
| 1 | Foundation | ✅ Complete | Project setup, DB schema, Contact & Company CRUD, basic UI shell |
| 2 | Actions & Calendar | 🔲 Not Started | Action system, daily view, calendar, quick-add palette, nudge list |
| 3 | Conversations & Relationships | 🔲 Not Started | Conversation logging, relationships, drag-drop photos, prep sheet |
| 4 | Search, Import & Tags | 🔲 Not Started | Global search, date-range search, CSV import/export, tags, ideas, links |
| 5 | Recurring Tasks & Dashboard | 🔲 Not Started | Recurring actions, contact flagging, weekly activity dashboard |
| 6 | Backup & Polish | 🔲 Not Started | Google Drive backup, UX polish, keyboard shortcuts, data cleanup |

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
- [ ] Can create actions with due dates, types, priorities
- [ ] Can link actions to contacts and companies
- [ ] Daily view shows today's actions sorted by priority
- [ ] Calendar shows actions on their due dates
- [ ] Ctrl+K opens quick-add palette for contacts, actions, notes
- [ ] Can mark actions complete (records completion date)
- [ ] Overdue actions are visually highlighted
- [ ] "Contacts without a next action" list is visible

---

## Phase 3: Conversations & Relationships

### Goals
- Log conversations with flexible dating
- Create follow-up actions from conversations
- Track relationships between contacts
- Photo support (drag-drop upload + URL)
- Pre-call prep sheet view

### Acceptance Criteria
- [ ] Can log conversations with day, month, or quarter precision dates
- [ ] Can create follow-up actions directly from conversation "next steps"
- [ ] Can record relationships (referred_by, knows, etc.)
- [ ] Can drag-drop JPG/PNG photos onto contact profile
- [ ] Can paste photo URLs
- [ ] Contact detail shows full history (conversations, actions, relationships)
- [ ] Prep sheet view shows last conversation, open questions, relationships at a glance

---

## Phase 4: Search, Import & Tags

### Goals
- Powerful search across all data
- CSV import with field mapping
- Tag system for contacts and companies
- Ideas scratchpad
- Links management

### Acceptance Criteria
- [ ] Can search contacts/companies by name, role, company, keywords, ecosystem, status
- [ ] Can filter by date range of last outreach
- [ ] Can import contacts from CSV with column mapping
- [ ] Can export contacts to CSV
- [ ] Can create, assign, and filter by tags
- [ ] Ideas CRUD works
- [ ] Links CRUD works, linked to contacts/companies

---

## Phase 5: Recurring Tasks & Dashboard

### Goals
- Recurring action automation
- Contact flagging for batch action
- Weekly activity dashboard

### Acceptance Criteria
- [ ] Completing a recurring action auto-creates the next occurrence
- [ ] Can flag multiple contacts for action by a specific date
- [ ] Dashboard shows: outreach by ecosystem, completed vs due, overdue count, contacts needing attention
- [ ] Action history log shows all completed actions with dates

---

## Phase 6: Backup & Polish

### Goals
- Database backup to Google Drive folder
- UX improvements
- Documentation

### Acceptance Criteria
- [ ] One-click backup of DB + photos to specified folder
- [ ] Can restore from backup
- [ ] Loading states and error handling throughout
- [ ] Keyboard shortcuts documented in-app
- [ ] Duplicate detection or cleanup tool
