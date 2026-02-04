# SearchBook — Next Session Starting Prompt

Copy and paste everything below the line into Claude Code to start the next session.

---

## Prompt

I'm building **SearchBook**, a lightweight local CRM for managing my executive job search networking.

**Before doing anything, read these files:**
- `.planning/STATE.md` — Session history and decisions
- `.planning/ROADMAP.md` — Phase 4 & 5 acceptance criteria

**GSD methodology.** Atomic commits per task.

---

## Phase 4: MOSTLY COMPLETE

### What was done this session:
- **Search/Filter** — Global search on contacts/companies list (name, title, notes, etc.), ecosystem/status filter dropdowns, clear button
- **CSV Export** — Downloads filtered contacts as CSV with all fields
- **CSV Import** — 3-step wizard (upload → column mapping → preview), auto-maps columns, normalizes ecosystem/status values
- **Tags System** — Tags API (CRUD), assign tags to contacts, badge UI on contact detail with add/remove
- **Ideas UI** — Full CRUD (list page with cards, create/edit/delete dialogs, search), added to sidebar

### Key Files Added:
- `client/src/components/csv-import-dialog.tsx` — Import wizard
- `client/src/pages/ideas/idea-list.tsx` — Ideas page
- `server/src/routes/tags.ts` — Tags API

### Remaining Phase 4 item:
- [ ] Date range filter for last outreach (optional, could defer to Phase 5)

## Phase 5: NOT STARTED

### Acceptance Criteria (from ROADMAP.md):
- [ ] Offline-first with service worker caching
- [ ] Mobile-responsive design
- [ ] Installable PWA with manifest
- [ ] Basic analytics dashboard (contacts added over time, conversations logged, etc.)

---

## Running the App:
```bash
npm start
```
- **Client**: http://localhost:5173
- **Server**: http://localhost:3001

### Note:
Run `cd server && npx prisma generate` if you see Prisma client errors.

**Decide: finish date range filter OR start Phase 5.**
