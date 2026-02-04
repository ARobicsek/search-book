# SearchBook — Next Session Starting Prompt

Copy and paste everything below the line into Claude Code to start the next session.

---

## Prompt

I'm building **SearchBook**, a lightweight local CRM for managing my executive job search networking.

**Before doing anything, read these files:**
- `.planning/STATE.md` — Session history and decisions
- `.planning/ROADMAP.md` — Phase 3 & 4 acceptance criteria

**GSD methodology.** Atomic commits per task.

---

## Phase 3: COMPLETE (all feedback rounds addressed)

### Feedback Round 3 Changes (items #26-30):
- Chrome tab title — verified correct, browser cache issue (hard refresh with Ctrl+Shift+R)
- Conversation notes field — increased to 6 rows, dialog widened to sm:max-w-xl
- 500 error on PUT /api/contacts/:id — fixed referredByName payload issue
- "How Connected" placeholder — changed to "How did you get connected?"
- Mutual Connections — converted to MultiCombobox with allowFreeText

### Key Files Changed (Round 3):
- `client/src/pages/contacts/contact-form.tsx` — Mutual Connections combobox, placeholder fix, referredByName fix
- `client/src/pages/contacts/contact-detail.tsx` — Larger notes field (rows=6), wider dialog (max-w-xl)

## Phase 4: Search, Import & Tags — READY TO START

### Acceptance Criteria:
- [ ] Can search contacts/companies by name, role, company, keywords, ecosystem, status
- [ ] Can filter by date range of last outreach
- [ ] Can import contacts from CSV with column mapping
- [ ] Can export contacts to CSV
- [ ] Can create, assign, and filter by tags
- [ ] Ideas CRUD works (API exists, needs UI)
- [x] Links CRUD works (done in feedback round 1)

---

## Running the App:
```bash
npm start
```
- **Client**: http://localhost:5173
- **Server**: http://localhost:3001
- **Desktop shortcut**: Double-click SearchBook on Desktop

### Note:
Run `cd server && npx prisma generate` if you see Prisma client errors (file may be locked if server is running).

**Start Phase 4 implementation.**
