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

**We are starting Phase 1: Foundation.** This phase covers:
- Project scaffolding: React + Vite + TypeScript frontend, Express + TypeScript backend, SQLite via Prisma ORM, shadcn/ui components
- Full database schema (Contacts, Companies, Tags, Conversations, Actions, Ideas, Links, Relationships)
- Contact CRUD with all fields (6 ecosystem types, 7 statuses, open questions, location, photo fields, etc.)
- Company CRUD as a separate entity (industry, size, HQ, status, notes)
- Contact list view with sortable table
- Company list view
- Contact detail page showing all fields and linked company
- Basic app shell with navigation
- Single `npm start` to launch frontend + backend concurrently

**Please begin the GSD discuss phase for Phase 1.** Review the planning docs, identify any gray areas or implementation decisions we need to make (e.g., exact UI layout, sidebar vs top nav, table library choice, form layout, etc.), and ask me targeted questions before creating the detailed task plan.
