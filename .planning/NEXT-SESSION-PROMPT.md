# SearchBook — Next Session Starting Prompt

Copy and paste everything below the line into Claude Code to start the next session.

---

## Prompt

I'm building **SearchBook**, a lightweight local CRM for managing my executive job search networking.

**Before doing anything, read these files:**
- `.planning/STATE.md` — Session history and decisions
- `.planning/ROADMAP.md` — Phase 5 & 6 acceptance criteria

**GSD methodology.** Atomic commits per task.

---

## Phase 5: COMPLETE

### What was done this session:
- **Feedback fixes** — PWA manifest error (devOptions), company default status CONNECTED, idea dialog outside-click protection, prep notes date label simplified, Open Questions removed from contact card, missing checkbox component installed
- **Recurring action automation** — Completing a recurring action auto-creates next occurrence (dueDate + intervalDays), respects recurringEndDate, toast on all 5 completion call sites
- **Contact flagging + batch action** — Flag column on contacts table, "Flagged" filter, batch action toolbar ("Create Action for Flagged" dialog with title/type/priority/dueDate), flags auto-clear after creation
- **Action history log** — "Completed Date" column visible on Completed filter, server-side sort by completedDate

## Phase 6: NOT STARTED

### Acceptance Criteria (from ROADMAP.md):
- [ ] One-click backup of DB + photos to specified folder
- [ ] Can restore from backup
- [ ] Loading states and error handling throughout
- [ ] Keyboard shortcuts documented in-app
- [ ] Duplicate detection or cleanup tool

---

## Feedback to address before Phase 6:
1. **Default conversation type to Video Call** — In Log Conversation dialog, the type dropdown should default to `VIDEO_CALL` instead of whatever the current default is
2. **MultiCombobox: individual item removal** — Currently only "Clear All" works. Need per-item X button to remove individual selections (contacts/companies discussed, etc.)
3. **Ideas: link people and companies** — Add MultiCombobox fields for contacts and companies in the Ideas dialog (similar to conversation log). Requires schema changes (IdeaContact, IdeaCompany junction tables or contactIds/companyIds fields)
4. **Side-by-side Prep Notes + Log Conversation** — When logging a conversation on a contact's page, the user needs to see their Prep Notes at the same time. Options: split view, expandable sidebar, or show prep notes inline in the conversation dialog

---

## Running the App:
```bash
npm start
```
- **Client**: http://localhost:5173
- **Server**: http://localhost:3001

### Note:
Run `cd server && npx prisma generate` if you see Prisma client errors.

---

**Start with the 4 feedback items above, then proceed to Phase 6.**
