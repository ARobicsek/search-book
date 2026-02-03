# SearchBook — Next Session Starting Prompt

Copy and paste everything below the line into Claude Code to start the next session.

---

## Prompt

I'm building **SearchBook**, a lightweight local CRM for managing my executive job search networking. The full project plan is documented in the `.planning/` directory of this repo (https://github.com/ARobicsek/search-book).

**Before doing anything, read these files to load context:**
- `.planning/PROJECT.md` — Vision, tech stack, success criteria
- `.planning/REQUIREMENTS.md` — Complete data model, features by phase, UI views
- `.planning/ROADMAP.md` — 6-phase roadmap with acceptance criteria
- `.planning/STATE.md` — All architectural decisions and session history

**We are using the GSD (Get Shit Done) methodology.** Planning docs live in `.planning/`. Work is done in phases. Each phase follows: discuss → plan → execute → verify → complete. Atomic commits per task.

**Phases 1 and 2 are complete. We are ready to start Phase 3: Conversations & Relationships.**

### What's been built so far:

**Phase 1 (Foundation)**:
- Project scaffolding (Vite + React + Express + Prisma + SQLite)
- Full database schema (all tables)
- Contact CRUD with all fields and ecosystem types
- Company CRUD as separate entity
- Contact/Company list views (TanStack Table, sortable columns, badges)
- Contact/Company detail pages
- App shell with collapsible sidebar navigation

**Phase 2 (Actions & Calendar)**:
- Action CRUD API with filters (status, contactId, companyId) and complete toggle
- Action types (ActionType, ActionPriority) and Idea types
- Action list page with filter toggle bar (All/Pending/Completed/Overdue)
- Action create/edit form with query param pre-fill
- Action detail page with complete toggle
- Dashboard (daily view) with overdue/today/upcoming actions and nudge list
- Calendar page with FullCalendar (month/week views, color-coded)
- Contact/Company detail pages updated with real actions lists
- Command palette (Ctrl+K) for quick-add contacts/actions/notes
- Ideas API (POST only) for quick-add notes

### User Feedback from Testing (Priority for Phase 3+):

1. **Contact reference fields need combobox pattern** — Fields like "Who connected us" (referredBy) should support both free-text entry AND searching/selecting existing contacts. This applies to any field that references people.

2. **Photo upload in contact forms** — Need ability to drag-drop/upload images directly in the contact create/edit form, not just on detail pages.

3. **Conversation logging is high priority** — Must capture conversation content quickly with:
   - Structured date field
   - People discussed (searchable list + free-text for new names)
   - Companies discussed (searchable list + free-text for new companies)
   - This is core to the "capture info immediately after conversations" philosophy

4. **Global search across all documentation** — Eventually need to search across contact cards, ideas, conversations, etc. for any person or company name. (Phase 4 scope)

### Phase 3 Goals (from ROADMAP.md):
- Log conversations with flexible dating (day, month, or quarter precision)
- Create follow-up actions from conversations
- Track relationships between contacts (referred_by, knows, etc.)
- Photo support (drag-drop upload + URL)
- Pre-call prep sheet view

### Phase 3 Acceptance Criteria:
- [ ] Can log conversations with day, month, or quarter precision dates
- [ ] Can create follow-up actions directly from conversation "next steps"
- [ ] Can record relationships (referred_by, knows, etc.)
- [ ] Can drag-drop JPG/PNG photos onto contact profile
- [ ] Can paste photo URLs
- [ ] Contact detail shows full history (conversations, actions, relationships)
- [ ] Prep sheet view shows last conversation, open questions, relationships at a glance

### Running the app:
```bash
npm start
```
- **Client (UI)**: http://localhost:5173 — Use this to interact with the app
- **Server (API)**: http://localhost:3001 — JSON API only, not a webpage

**Please start by discussing the Phase 3 approach and creating a task breakdown plan. Pay special attention to the user feedback items above — they represent real usage needs.**
