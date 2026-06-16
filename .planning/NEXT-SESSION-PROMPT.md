# Next Session Prompt

This file is the handoff document for the next AI session (Claude Code **or** Gemini/Antigravity — the
protocol is agent-agnostic). It summarizes what was just accomplished, what to work on next, and open items.

### What Was Just Completed (Session 6)

1. **Sidebar Reordering:** Moved "Organizations" below "Actions" in the left-hand navigation panel (`app-sidebar.tsx`).
2. **Global Column Sorting:** Fixed TanStack table column sorting on the Contacts page so that it sorts the entire database rather than just the currently loaded page of 50. Implemented by setting `manualSorting: true` in the table configuration and extending `/api/contacts` to support dynamic server-side `ORDER BY` for all sortable columns, maintaining performance ("not very slow" requirement). The other list pages (Organizations, Actions, Ideas) were audited and confirmed to already be sorting their full datasets seamlessly because they load their data non-paginated (fast and instant). Meetings already uses a server-backed dropdown sort.
3. **Contact Edit Form Layout:** Reordered fields on the Contact Edit screen (`contact-form.tsx`): moved Companies & Past Roles below the Photo, moved Location below Emails, and extracted Ecosystem and Status into their own dedicated "Classification" card.
3. **Card title + participant order + search.** `conversationDisplayName` precedence is now
   `title → first participant → contact → company → attendeesDescription` (first participant outranks the legacy
   anchor). "First participant" needed a real order: added **`ConversationParticipant.ordering`** (set from the
   submitted array index; `orderBy` in the includes) because participants were returned in `contactId` order, not
   entry order. Legacy rows backfilled by per-conversation rowid. The Meetings **Search** box (relabeled "Search
   title, people, notes…") ranks title/participant matches, so a person's name surfaces their untitled meeting.
4. **Quick Log redesign ("promote the big 3").** Participants, Notes, and Follow-up actions are always visible;
   everything secondary is reorganized into 3 labeled disclosures: **Organizations & attendees** ·
   **Summary & next steps** · **Tags, prep notes & attachments**. The Title filter became a **Series** dropdown.
5. **Series rename/delete.** Pencil + trash on the series-view header (`PUT`/`DELETE /api/series/:id`); deleting
   keeps the meetings (`seriesId`→NULL) and returns to the full list.

**Verification:** `npm run prepush` (tsc client+server) + full `vite build` green. Verified in-browser on
desktop **and** 390px mobile: series create→join→chip→series view→rename/delete, default + manual sort,
person-name search, first-participant title (scrambled-order test), and the redesigned dialog (autosave +
actions + participant all persist). Test data cleaned up.

**⚠ Turso DDL (TWO migrations applied by the owner this session, before each push):**
1. `server/scripts/migrate-conversation-series.js` — `Series` table + `Conversation.seriesId`/`updatedAt` (+ backfill + auto-group).
2. `server/scripts/migrate-participant-ordering.js` — `ConversationParticipant.ordering` (+ rowid backfill).
Both are runnable dual-mode scripts; the SQL was also provided inline in the console. Local dev DB already migrated.
**Reminder for next schema change:** apply the Turso DDL via the web SQL console *before* pushing (committed
`server/.env` rw token is stale/401).

### What's Next
1. **[OWNER, light]** Confirm on prod that series create/join + the new sort/search behave as expected.
2. Plan of record returns to **`.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+)**, gated on D5–D9 — don't push on
   those until the owner raises them.

### Carry-over items (pre-dating, lower priority)
1. **[USER ACTION]** Set `SENTRY_DSN` / `VITE_SENTRY_DSN` in Vercel (hardening Task 17).
2. NCQA adaptation plan: Phase 3 (blocked D8/D9) / Phase 4 (D5/D6).
3. Stray empty `server/dev.db` / `server/test.db` (gitignored) safe to delete.
4. **Possible polish (owner hasn't requested):** `Conversation.updatedAt` only bumps on edits to the meeting row
   itself, not on isolated child-record edits (prep note / attachment). If "Recently updated" should float a
   meeting on those too, bump `conversation.updatedAt` in the `conversation-prepnotes` / `conversation-attachments`
   routes. Also: existing meetings' participant order was backfilled by rowid (insertion proxy) — re-saving a
   meeting's participants fixes any that look wrong.

### Open Bugs / Known Caveats
- **⚠ The committed Turso rw token in `server/.env` is STALE (hard 401).** Use the Turso web SQL console for DDL.
- **⚠ `prisma db push` local-path gotcha:** from `server/`, `db push` resolves `file:./dev.db` to the stray
  empty `server/dev.db`, not the populated `server/prisma/dev.db` the server opens. Use the dual-mode migration
  scripts (libsql `file:` URL) instead — they target `./prisma/dev.db` and work with the dev server running.
- Run `tsc -b` / full `vite build` (not just `npm run prepush`) before every push — it catches unused imports.
- Dev smoke: server 3001, client 5173. The local app has `APP_PASSWORD` unset → seed any non-empty
  `localStorage.searchbook_password` ('devlocal' works) to pass the login gate; the server middleware no-ops.
  Device-emulation `390x844` gives a true mobile viewport.

### Working branch
`main` — pushed and live **after** the owner applied the Turso DDL.

---

### Suggested kickoff prompt for the next session

> Read `CLAUDE.md` / `AGENTS.md`, then this file. Organizations was moved below Actions in the sidebar. Contacts column sorting was updated to correctly sort the entire list server-side. The Contact Edit form layout was reorganized. Plan of record returns to `.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+, gated D5–D9).
