# Next Session Prompt

This file is the handoff document for the next AI session (Claude Code **or** Gemini/Antigravity — the
protocol is agent-agnostic). It summarizes what was just accomplished, what to work on next, and open items.

### What Was Just Completed (2026-06-15 session 4)

1. **Contact UI Polish:**
   - **Form:** Removed the "Referred By" and "Research" sections from the UI to streamline data entry, while keeping the data fields intact for legacy preservation. Reordered the "How Connected" section to appear after "Personal Details".
   - **Detail View:** Conditionally hid the "Connections" card when empty to save vertical space. Moved the "Personal Details" card up, immediately below "Notes". Moved the "Actions" section to appear ABOVE the "Links" section.

2. **Action Creation Flow:**
   - When creating a new action from a contact's detail page (`/actions/new?contactId=X`), the form now defaults to "Me" as the owner but automatically injects that contact as a quick-add chip so you can easily assign the action to them with one click. The "Who owns it" section also auto-expands so it's immediately visible. This contextual quick-add chip is styled distinctly (no star, neutral colors) from actual favorite contacts to avoid confusion.

**Verification:** prepush (`tsc` client+server) + full `vite build` green throughout. All code pushed to `main`. 

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

> Read `CLAUDE.md` / `AGENTS.md`, then this file. The Contacts UI and Action creation flows have been streamlined and polished. The plan of record returns to `.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+, gated D5–D9). Standing owner action: set `SENTRY_DSN`/`VITE_SENTRY_DSN` in Vercel.
