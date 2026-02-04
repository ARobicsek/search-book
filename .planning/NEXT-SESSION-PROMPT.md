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

I tested the latest changes (Phase 3 feedback round 2). Here is my feedback — address all items before moving on to Phase 4:

1. **Chrome tab still shows wrong name** — Even after stopping and restarting dev server, tab shows something other than "SearchBook". May be a caching issue or the change didn't take effect. Investigate and fix.

2. **Conversation notes field too small** — Would be nice to document conversations with more space. The small Notes field in the conversation modal isn't enough for detailed notes. Consider a larger modal, expandable textarea, or dedicated conversation detail page.

3. **Error when updating contacts** — Getting 500 error on `/api/contacts/:id`. Console shows:
   - `workbox Router is responding to: /`
   - `Failed to load resource: the server responded with a status of 500 (Internal Server Error)` on `/api/contacts/9`
   - Various PWA/manifest errors (may be unrelated)

   Debug the contacts PUT endpoint to find the issue.

4. **"How Connected" placeholder** — Should only say "How did you get connected?" (currently may have different text)

5. **Mutual Connections should work like Referred By** — Should be a combobox allowing search and add-new, not just a free text field.

---

## Phase 3: COMPLETE (feedback rounds 1 & 2 addressed)

### Feedback Round 2 Changes (items #14-25):
- Chrome tab title → "SearchBook" (index.html)
- Modal outside-click prevention (conversation/relationship dialogs)
- ReferredBy field now allows adding new contacts
- Action due dates shown on conversation cards
- Save button at top of contact form
- Role description field added to Contact
- Combobox options sorted alphabetically
- Timezone bug fixed (local vs UTC)
- PrepNote model for dated prep elements (text + links)
- EmploymentHistory model for tracking company changes

### Key New Features:
- **PrepNote** — Add dated prep notes with content, optional URL/title for upcoming conversations
- **EmploymentHistory** — Track company changes with "Move to history" button

### Key Files Changed (Round 2):
- `server/prisma/schema.prisma` — Added PrepNote, EmploymentHistory, roleDescription
- `server/src/routes/prepnotes.ts` — PrepNote CRUD (new)
- `server/src/routes/employmenthistory.ts` — EmploymentHistory CRUD (new)
- `client/src/pages/contacts/contact-form.tsx` — Save button top, referredBy free text, employment history UI
- `client/src/pages/contacts/contact-detail.tsx` — PrepNotes in prep sheet, employment history display, action due dates
- `client/src/components/ui/combobox.tsx` — Alphabetical sorting
- Multiple files — Timezone fix (toLocaleDateString)

## Phase 4: Search, Import & Tags — NOT STARTED

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

**Fix feedback items first, then start Phase 4.**
