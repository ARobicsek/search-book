# Next Session Prompt

Rolling handoff for the next AI session (Claude Code **or** Gemini/Antigravity — protocol is
agent-agnostic, see `AGENTS.md`). Keep this file **lean**: a short "just completed", "what's next",
carry-overs, open bugs, and a kickoff prompt. Per-session detail goes in `SESSION-HISTORY.md`, not
here.

### What Was Just Completed — Enhancements session (2026-06-18)

Four enhancement requests. **Three are pushed/live** (schema-free); the **fourth (@-mentions) is
committed locally but NOT pushed** — it adds a table and needs the Turso DDL applied first (see
"⚠ MUST DO before pushing" below).

1. **LinkedIn import — prefer current job title over headline** (`6923f4f`, pushed). The contact's
   Title was being filled from the LinkedIn *headline* ("Healthcare Strategy and Process Redesign
   Leader"). Now it prefers the current Experience role's title ("AVP analysis and evaluation"),
   keeping the headline only as a backup. Server post-processing in `routes/linkedin.ts`; preview
   shows a "Headline (backup)" line.
2. **Participant hover tooltips** (`aa7a8e5`, pushed). Hovering a participant on a meeting card or in
   the meeting editor shows their title + current employer (and, on cards, the per-meeting note). New
   `PersonTooltip`; `/meetings` + `/contacts/names` carry `title` + primary `company.name`. Verified
   desktop + 390px.
3. **Doc: marked `OUTLOOK_CALENDAR_ICS_URL` done** (`b1826f9`, pushed) — owner set it in Vercel.
4. **@-mentions in meeting notes + review surfaces** (`e006895`, **LOCAL ONLY — DO NOT PUSH until
   Turso DDL is applied**). Type `@` in notes/next-steps to flag a third person (existing contact or
   a "loose" name not yet a contact); review on a new `/mentions` page and a "Mentioned in Meetings"
   card on each contact. New `ConversationMention` table; mentions derived from note tokens on every
   conversation save; loose mentions get a one-click "Create contact". Backup/restore both paths
   updated (export version 6). Verified end-to-end via chrome-devtools; test data cleaned from local
   dev DB. **Design decisions in `STATE.md`.**

### ⚠ MUST DO before pushing the @-mention commit (`e006895`)

Run this DDL against **Turso (prod)** via the web SQL console (the committed rw token is stale), then
`git push`:

```sql
CREATE TABLE "ConversationMention" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "conversationId" INTEGER NOT NULL,
    "contactId" INTEGER,
    "mentionedName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationMention_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConversationMention_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ConversationMention_conversationId_idx" ON "ConversationMention"("conversationId");
CREATE INDEX "ConversationMention_contactId_idx" ON "ConversationMention"("contactId");
```
Pushing before the table exists will 500 every meeting save (the save re-syncs mentions).

### What's Next

1. **Apply the DDL above, then push `e006895`** (+ this docs commit) to ship @-mentions.
2. Plan of record is **`.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+)**. Check the **"⏳ Waiting on
   owner"** block — **D5/D6/D8/D9**. Phase 3 (stakeholder intel) is gated on D8/D9; Phase 4 (Copilot
   AI ingest) on D5/D6. Don't push on those until the owner raises them.
3. **Option B (when wanted):** attendee auto-fill via Microsoft Graph or Power Automate — implement a
   second `CalendarProvider`; nothing downstream changes.
4. **@-mention follow-ups (optional):** enable @ in meeting *prep notes* too (currently only
   notes + next-steps sync); add a command-palette entry for the Mentions page.

### Carry-over items (lower priority)

1. **[USER ACTION]** Set `SENTRY_DSN` / `VITE_SENTRY_DSN` in Vercel to activate error tracking.
2. NCQA adaptation plan: Phase 3 (blocked D8/D9) / Phase 4 (D5/D6).
3. Stray empty `server/dev.db` / `server/test.db` (gitignored) safe to delete locally.
4. **"Recently updated" merge-bump** fix is forward-only — meetings a *past* contact-merge already
   stamped stay near the top; a one-off reset would also wipe genuine edit timestamps, so confirm
   criteria first.
5. **`updatedAt` under-bumping:** `Conversation.updatedAt` only bumps on edits to the meeting
   row/junctions, not isolated child-record edits (prep note / attachment). Bump it in those routes
   if "Recently updated" should float a meeting on those too.

### Open Bugs / Known Caveats

- **⚠ The committed Turso rw token in `server/.env` is STALE (hard 401).** Use the Turso web SQL
  console for DDL.
- **⚠ `prisma db push` local-path gotcha:** from `server/`, `db push` resolves `file:./dev.db` to
  the stray empty `server/dev.db`, not the populated `server/prisma/dev.db` the server opens. Use a
  dual-mode libsql `file:` migration script (pattern preserved in `server/scripts/archive/`) instead.
- Run `tsc -b` / full `vite build` (not just `npm run prepush`) before every push — it catches
  unused imports the typecheck misses.
- Dev smoke: server 3001, client 5173. The local app has `APP_PASSWORD` unset → seed any non-empty
  `localStorage.searchbook_password` ('devlocal' works) to pass the login gate. Device-emulation
  `390x844` gives a true mobile viewport.

### Working branch

`main` — commits `6923f4f`, `aa7a8e5`, `b1826f9` pushed/live. **`e006895` (@-mentions) + the
session-end docs commit are committed locally but UNPUSHED**, gated on the Turso DDL above. Apply the
DDL, then `git push`.

---

### Suggested kickoff prompt for the next session

Durable version (works every session — it defers to the docs, which stay current):

> Start a SearchBook session: read `AGENTS.md` and follow its "Session start" steps, then summarize
> where we left off and what's next before doing anything.

Context for *this* upcoming session specifically: last session shipped three enhancements (LinkedIn
title preference, participant hover tooltips, Outlook-env doc) and built a fourth — **@-mentions in
meeting notes** — which is committed locally (`e006895`) but **unpushed pending the Turso DDL** (see
"⚠ MUST DO before pushing"). The very first task: apply that DDL, then push. Plan of record is
`.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+, gated on the "⏳ Waiting on owner" block, D5/D6/D8/D9).
