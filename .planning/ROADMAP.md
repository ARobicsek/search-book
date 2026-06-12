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
| 7 | iPhone PWA Access | ✅ Complete | Vercel deployment, Turso cloud DB, mobile access |
| 8 | Document Search | ⛔ Superseded | Replaced by NCQA Adaptation Plan Task 6.2 (semantic search over meeting notes) |
| 9 | NCQA Adaptation | 🔄 Active | App becomes the CMO stakeholder-management system — **see `.planning/NCQA-ADAPTATION-PLAN.md` (plan of record)** |

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

---

## Phase 7: iPhone PWA Access

### Goals
- Deploy to Vercel for access from anywhere
- Migrate database to Turso (SQLite-compatible cloud DB)
- Enable PWA installation on iPhone
- Mobile-friendly access

### Acceptance Criteria
- [x] Vercel configuration created (single serverless function)
- [x] iOS PWA meta tags added
- [x] Turso adapter configured in Prisma
- [x] Photo storage code updated for Vercel Blob
- [x] Create Turso database and get credentials
- [x] Deploy to Vercel with environment variables
- [x] Test PWA installation on iPhone

---

## Phase 7.5: Security & Backup Hardening (Ops)

### Goals
- Close the "anyone with the URL" hole on the public deployment
- Make data durable: automated cloud backups + a trustworthy restore
- Back up the actual photo files, not just their references

### Acceptance Criteria
- [x] Shared-password gate over all `/api` routes (`x-app-password`), fail-closed in prod
- [x] Remove debug/credential leaks; harden error output
- [x] `/health` endpoint verifies DB connectivity (for uptime monitoring)
- [x] Automated daily backup to Vercel Blob (`/api/backup/cron`, 08:00 UTC, retain newest 30, CRON_SECRET-gated)
- [x] Settings UI lists and downloads automatic backups
- [x] Export/import covers all 23 tables (was missing 5 history/junction tables)
- [x] Restore verified via isolated round-trip — byte-identical across all 23 tables (local SQLite)
- [x] Fix `updatedAt` bump on restore (raw-SQL self-reference relink)
- [x] Manual backup bundles actual photo files into `searchbook-photos.zip` (+ manifest)
- [ ] **(Deferred — desktop)** End-to-end photo-ZIP test on the deployed app (confirm no CORS skips fetching Blob URLs)
- [ ] **(Deferred — desktop)** Restore into a scratch Turso DB to prove the production browser-direct transport (`importViaTurso`), not just local SQLite

---

## Phase 9: NCQA Adaptation (Active)

The owner is now Chief Medical Officer of NCQA. The full phased plan — taxonomy retheme, meetings overhaul (groups, fuzzy attendance, multi-subject), stakeholder stance/leverage tracking, AI ingest of Copilot recaps, Outlook daily briefing — lives in **`.planning/NCQA-ADAPTATION-PLAN.md`**, which is the active plan of record. This roadmap is retained for historical phase criteria.

---

## Phase 8: Document Search (Superseded — see NCQA Adaptation Plan Task 6.2)

### Goals
- Full-text search across linked Google Drive documents
- Leverage Google Drive API to read document contents
- Surface relevant information from research notes, PDFs, and other documents

### Acceptance Criteria
- [ ] Google Drive API integration for reading document contents
- [ ] Index linked documents for full-text search
- [ ] Search results show document snippets with context
- [ ] Can search across all linked documents from contacts, companies, and actions
- [ ] Results link back to the original document in Google Drive
