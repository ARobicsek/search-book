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

**We are in the GSD execute phase for Phase 1: Foundation.** Tasks T1–T6 are complete. We need to continue execution starting at **T7**.

### What's been completed (T1–T6):
- **T1**: Project scaffolding — `client/` (Vite+React+TS), `server/` (Express+TS), root `package.json` with `concurrently`, `npm start` works
- **T2**: Prisma schema — all tables created (Contact, Company, Tag, ContactTag, CompanyTag, Conversation, Action, Idea, Link, Relationship), SQLite DB with seed data (3 companies, 5 contacts)
- **T3**: Contact CRUD API — `GET/POST/PUT/DELETE /api/contacts` with company include, validation
- **T4**: Company CRUD API — `GET/POST/PUT/DELETE /api/companies` with contact count/list, validation
- **T5**: Tailwind CSS v4 + shadcn/ui — all components installed (button, input, select, table, card, sidebar, dialog, badge, dropdown-menu, separator, textarea, label, sonner, skeleton, tooltip, sheet, breadcrumb), TanStack Table + React Router installed, `@/` path alias configured, Vite proxy `/api` → `localhost:3001`
- **T6**: App shell — collapsible sidebar (Contacts, Companies active; Dashboard, Calendar, Actions, Ideas as "Coming Soon"), layout with `<Outlet/>`, React Router routes for all CRUD views (placeholders), home page, API utility (`src/lib/api.ts`), shared types (`src/lib/types.ts` with all enums and interfaces)

### What remains (T7–T13):
- **T7**: Contact list view — TanStack Table with 7 columns (Name, Title, Company, Ecosystem, Status, Location, Updated), column sorting, row links to detail, ecosystem/status badges, "New Contact" button
- **T8**: Contact create/edit form — full-page form with grouped sections (Basic Info, Contact Details, Connections, Research), company dropdown+freetext, form validation
- **T9**: Contact detail page — all fields in sections, company link, edit/delete buttons with confirmation dialog, placeholder sections for future Conversations/Actions/Relationships
- **T10**: Company list view — TanStack Table (Name, Industry, Size, HQ Location, Status, Updated), sorting, row links, "New Company" button
- **T11**: Company create/edit form — grouped sections, validation
- **T12**: Company detail page — company info, linked contacts list, edit/delete
- **T13**: Wiring + polish — error handling (toast notifications), loading states (skeleton/spinner), empty states

### Key architectural decisions (already made):
- Sidebar navigation (collapsible)
- TanStack Table for lists
- Full-page grouped-section forms
- Hard delete (no soft delete)
- Contact list: 7 columns (Name, Title, Company, Ecosystem, Status, Location, Updated)
- Company detail page included in Phase 1

**Please continue executing from T7.** Pick up where we left off — build the contact list view page with TanStack Table. No need to re-discuss or re-plan; all decisions are locked in.
