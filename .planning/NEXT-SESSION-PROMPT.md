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

## Start Here: User Feedback

I tested the latest changes (Phase 3 feedback fixes). Here is my feedback — address all items before moving on to Phase 4:

**[PASTE YOUR FEEDBACK HERE]**

---

## Phase 3: COMPLETE (all 13 feedback items addressed)

Key changes in Phase 3 feedback round:
- Photo display fixed (Vite proxy for `/photos` + larger rounded-rect image)
- Auto-status NEW→CONNECTED on conversation logging
- Desktop launcher (`SearchBook.vbs` + desktop shortcut)
- Search+add-new for contacts/companies discussed (MultiCombobox `allowFreeText`)
- Multiple follow-up actions per conversation
- Meet action type, Video Call conversation type
- Links CRUD (prep sheet + conversation log)
- Company combobox with auto-create in contact form
- Default status CONNECTED for new contacts
- Progressive disclosure (collapsible sections) for contact form fields
- Personal details free text field added to Contact model
- Removed Needs Attention from Dashboard
- Links API at `/api/links`

Key files changed:
- `server/src/routes/links.ts` — Links CRUD API (new)
- `server/src/routes/conversations.ts` — Multi-action + links + auto-status
- `client/src/pages/contacts/contact-form.tsx` — Company combobox, progressive disclosure, personal details
- `client/src/pages/contacts/contact-detail.tsx` — Links in prep sheet, multi-action conversation form, search+add-new
- `client/vite.config.ts` — Added `/photos` proxy
- `server/prisma/schema.prisma` — Added `personalDetails` field
- `client/src/lib/types.ts` — Added MEET, VIDEO_CALL, LinkRecord, personalDetails

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

**Fix feedback items first, then start Phase 4.**
