# SearchBook — Next Session Starting Prompt

Copy and paste everything below the line into Claude Code to start the next session.

---

## Prompt

I'm building **SearchBook**, a lightweight local CRM for managing my executive job search networking.

**Before doing anything, read these files:**
- `.planning/STATE.md` — Session history and decisions
- `.planning/ROADMAP.md` — Phase 4 acceptance criteria

**GSD methodology.** Atomic commits per task.

---

## Start Here: Phase 4 or User Feedback

**[PASTE YOUR FEEDBACK HERE, OR SAY "Start Phase 4"]**

---

## Phase 3: COMPLETE (all feedback addressed)

Key changes in Phase 3 feedback round:
- Photo display fixed (Vite proxy + larger rounded-rect image)
- Auto-status CONNECTED on conversation logging
- Desktop launcher (SearchBook.vbs, desktop shortcut)
- Search+add-new for contacts/companies discussed (MultiCombobox allowFreeText)
- Multiple follow-up actions per conversation
- Meet action type, Video Call conversation type
- Links CRUD (prep sheet + conversation log)
- Company combobox with auto-create in contact form
- Default status CONNECTED
- Progressive disclosure (collapsible sections) for contact form
- Personal details field added to Contact
- Removed Needs Attention from Dashboard

Key files:
- `server/src/routes/links.ts` — Links CRUD API
- `server/src/routes/conversations.ts` — Multi-action + links support
- `client/src/pages/contacts/contact-form.tsx` — Company combobox, progressive disclosure, personal details
- `client/src/pages/contacts/contact-detail.tsx` — Links in prep sheet, multi-action conversation form, search+add-new

## Phase 4: Search, Import & Tags — NOT STARTED

### Acceptance Criteria:
- [ ] Can search contacts/companies by name, role, company, keywords, ecosystem, status
- [ ] Can filter by date range of last outreach
- [ ] Can import contacts from CSV with column mapping
- [ ] Can export contacts to CSV
- [ ] Can create, assign, and filter by tags
- [ ] Ideas CRUD works (API exists, needs UI)
- [x] Links CRUD works (done in feedback round)

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
