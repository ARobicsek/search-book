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

**Phase 1: Foundation is complete.** We need to start **Phase 2: Actions & Calendar** using the GSD flow (discuss → plan → execute → verify → complete).

### What's been built (Phase 1 — all complete):
- **T1**: Project scaffolding — `client/` (Vite+React+TS), `server/` (Express+TS), root `package.json` with `concurrently`, `npm start` works
- **T2**: Prisma schema — all tables created (Contact, Company, Tag, ContactTag, CompanyTag, Conversation, Action, Idea, Link, Relationship), SQLite DB with seed data (3 companies, 5 contacts)
- **T3**: Contact CRUD API — `GET/POST/PUT/DELETE /api/contacts` with company include, validation
- **T4**: Company CRUD API — `GET/POST/PUT/DELETE /api/companies` with contact count/list, validation
- **T5**: Tailwind CSS v4 + shadcn/ui — all components installed (button, input, select, table, card, sidebar, dialog, badge, dropdown-menu, separator, textarea, label, sonner, skeleton, tooltip, sheet, breadcrumb), TanStack Table + React Router installed, `@/` path alias configured, Vite proxy `/api` → `localhost:3001`
- **T6**: App shell — collapsible sidebar (Contacts, Companies active; Dashboard, Calendar, Actions, Ideas as "Coming Soon"), layout with `<Outlet/>`, React Router routes, home page, API utility (`src/lib/api.ts`), shared types (`src/lib/types.ts` with all enums and interfaces)
- **T7**: Contact list view — TanStack Table with 7 sortable columns (Name, Title, Company, Ecosystem, Status, Location, Updated), ecosystem/status color badges, row-click navigation, "New Contact" button, empty state
- **T8**: Contact create/edit form — full-page form with 4 grouped sections (Basic Info, Contact Details, Connections, Research), company dropdown+freetext, name/email/URL validation, dual-mode create/edit
- **T9**: Contact detail page — all fields in sections, company link, referral links, edit/delete with confirmation dialog, placeholder sections for Conversations/Actions/Relationships
- **T10**: Company list view — TanStack Table with 6 sortable columns (Name, Industry, Size, HQ Location, Status, Updated), status badges, row navigation, "New Company" button
- **T11**: Company create/edit form — grouped sections (Company Info, Notes), name/URL validation, dual-mode create/edit
- **T12**: Company detail page — company info, notes, linked contacts list with ecosystem/status badges, edit/delete with confirmation
- **T13**: Wiring + polish — all route placeholders replaced, toast error handling on all API calls, loading states, empty states

### Key file locations:
- `client/src/App.tsx` — Router with all routes wired to real components
- `client/src/pages/contacts/` — `contact-list.tsx`, `contact-form.tsx`, `contact-detail.tsx`
- `client/src/pages/companies/` — `company-list.tsx`, `company-form.tsx`, `company-detail.tsx`
- `client/src/lib/api.ts` — API utility (get/post/put/delete)
- `client/src/lib/types.ts` — All shared types and enum option arrays
- `server/src/routes/contacts.ts` — Contact CRUD API
- `server/src/routes/companies.ts` — Company CRUD API
- `server/prisma/schema.prisma` — Full database schema (all tables already exist)

### Phase 2 scope (from ROADMAP.md):
- Action CRUD with all fields (title, description, type, dueDate, priority, completed, links to contact/company/conversation, recurring support)
- Daily view: "What do I need to do today" — shows today's due actions
- Calendar month/week view (FullCalendar) showing actions by due date
- Quick-add command palette (Ctrl+K) for contacts, actions, notes
- Link actions to contacts and conversations
- "Contacts without a next action" nudge list
- Action completion (mark done, records completedDate)
- Overdue actions highlighting

### Key architectural decisions (already made):
- Sidebar navigation (collapsible) — will need to enable Dashboard, Calendar, Actions links
- TanStack Table for lists
- Full-page grouped-section forms
- Hard delete (no soft delete)
- Action table already exists in Prisma schema

**Please start Phase 2 with the discuss phase.** Review the Phase 2 scope, the existing Action schema in Prisma, and propose a task breakdown. We'll discuss, then plan, then execute.
