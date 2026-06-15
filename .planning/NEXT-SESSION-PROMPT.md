# Next Session Prompt

This file is the handoff document for the next AI session (Claude Code **or** Gemini/Antigravity — the
protocol is agent-agnostic). It summarizes what was just accomplished, what to work on next, and open items.

### What Was Just Completed (2026-06-15 session 3)

1. **LinkedIn Import Explanation:**
   - Investigated an issue where the LinkedIn import failed to find 'Experience' data.
   - Identified that the failure is due to LinkedIn's **lazy loading**. The user needs to scroll down the profile page to force the sections to render before copying the text.

2. **Actions & Meetings Polish:**
   - **Meeting Link in Actions:** The "Meeting #ID" text in the Action Detail view is now a clickable hyperlink (`/meetings?id=ID`) to quickly navigate back to the associated meeting.
   - **Contact Auto-linking in Quick Log:** Follow-up actions created from the Meeting Log dialog now automatically carry over the meeting's participants (`participantIds`) and organizations (`orgValues`) into the action's standard `contactIds`/`companyIds`. Because these are properly populated upon creation, the newly created actions will display the contacts natively in the "Contact" column on the Actions List view.

**Verification:** prepush (`tsc` client+server) + full `vite build` green throughout. 

### What's Next
1. **[OWNER, light]** Confirm on prod that the Ideas archive lozenges work (carried from last session).
2. Standing plan of record returns to **`.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+)**, gated on D5–D9 —
   don't push on those until the owner raises them.

### Carry-over items (pre-dating, lower priority)
1. **[USER ACTION]** Set `SENTRY_DSN` / `VITE_SENTRY_DSN` in Vercel (hardening Task 17).
2. NCQA adaptation plan: Phase 3 (blocked D8/D9) / Phase 4 (D5/D6).
3. Stray empty `server/dev.db` / `server/test.db` (gitignored) safe to delete.

### Open Bugs / Known Caveats
- **⚠ The committed Turso rw token in `server/.env` is STALE (hard 401).** Use the Turso web SQL console or
  mint a fresh no-expiry rw token for the `IdeaTag` migration.
- **⚠ `prisma db push` local-path gotcha:** from `server/`, `db push` resolves `file:./dev.db` to the stray
  empty `server/dev.db`, not the populated `server/prisma/dev.db` the server opens (db.ts resolves relative
  to `server/prisma/`). This session the `IdeaTag` table was applied to `prisma/dev.db` via the dual-mode
  migration script (libsql `file:` URL) — worked fine even with the dev server running.
- Run `tsc -b` / full `vite build` (not just `npm run prepush`) before every push — it catches unused imports.
- Dev smoke: a dev stack was already running this session (server 3001, client 5173). The local app has no
  `APP_PASSWORD` — pre-seed `localStorage.searchbook_password`. Device-emulation `390x844x3,mobile` gives a
  true 390px viewport.

### Working branch
`main` — **everything pushed and live.** Working tree clean, nothing pending.

---

### Suggested kickoff prompt for the next session

> Read `CLAUDE.md` / `AGENTS.md`, then this file. The Actions & Meetings UI/data flow improvements (meeting hyperlinks and contact auto-linking from Quick Log) have been shipped. The plan of record returns to `.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+, gated D5–D9). Standing owner action: set `SENTRY_DSN`/`VITE_SENTRY_DSN` in Vercel.
