# Next Session Prompt

Rolling handoff for the next AI session (Claude Code **or** Gemini/Antigravity — protocol is
agent-agnostic, see `AGENTS.md`). Keep this file **lean**: a short "just completed", "what's next",
carry-overs, open bugs, and a kickoff prompt. Per-session detail goes in `SESSION-HISTORY.md`, not
here.

### What Was Just Completed — Meeting-participant UX (2026-06-29)

Five owner asks for the Quick Log / meeting editor, **schema-free**, pushed to `main` (`ce9f306`; lockfile chore `c0abed3`).
1. **Create-on-add:** adding a participant (typed-in free text or pasted) now **creates the Contact immediately** (`handleParticipantsChange` POSTs `/contacts`, swaps free-text→id in place) instead of deferring to "Done" — it has an id at once.
2. **Click-through:** participant names in the editor are now **links to `/contacts/:id`** (flush + close the dialog on the way); meetings-list pills already linked.
3. **Contacts default sort** ("most-recently-updated on top") was **already correct** — verified live (create-via-API lands on top, then deleted; net-zero). No code change.
4. **Auto-cleanup:** a contact created via the participant field that's **removed again before gaining other info is deleted** (`autoCreatedParticipantsRef` per dialog session; `ConversationParticipant` is onDelete Cascade; matched/pre-existing contacts never tracked).
5. **Bulk paste:** paste an Outlook recipient list (`Name <email>; Name <email>; bare name`) into the Participants field → new **`POST /api/contacts/resolve-participants`** matches each by email (primary/`additionalEmails`, case-insensitive) → exact name → else creates (CONNECTED/NETWORK). `MultiCombobox` gained opt-in `onBulkPaste` (intercepts only `;`/newline/`<email>`-shaped pastes); ids merged deduped, new ones tracked for auto-cleanup, toast summarizes "added / already in contacts / new". Verified the endpoint live (create, in-paste dedup, name-match, case-insensitive email-match) with all test rows deleted after. Typecheck (client+server) + full client `vite build` + `prepush` backup guard green.

Known small edge: a **name-only** paste written "Last, First" with no email won't match a "First Last" contact → creates a new one (emails sidestep it).

### What Was Just Completed — Contact company-sort and Idea deep-links (2026-06-28)

Owner reported two UX bugs, both fixed and pushed to `main`.
1. **Contact Sorting by Company:** The Contacts list `sortBy === 'company'` was broken because the display company is dynamically resolved (`company.name ?? companyName`). Fixed in `server/src/routes/contacts.ts` by checking if the sort is 'company', and if so, fetching all unpaginated matching contacts, computing the display name in JS (unified lowercase comparison, pushing empties to the end), and then paginating the sorted array.
2. **Idea Deep-Linking from Global Search:** Clicking an idea in `/search` just took the user to the `/ideas` homepage. Added support for `/ideas?id=N` deep-linking. Updated `search.tsx` and `command-palette.tsx` to link with the param. In `idea-list.tsx`, read the param on mount, auto-expand the target idea, and scroll it into view. Added a temporary visual highlight (`ring-2 ring-primary` or similar via Tailwind `highlightedId` state) so it's obvious which card was targeted even if the description is short. Fixed a bug where `useRef` was incorrectly passed a lazy initializer function.



### What Was Just Completed — Backup coverage fix: `Series` + `IdeaTag` were missing (2026-06-25)

Owner asked to confirm backups (automated **and** manual) still fully restore everything after the
recent additions. Audited all **32 Prisma models** against both backup enumerations — the server
`buildExport` (cron→Vercel Blob + `/export`) **and** the browser-direct Turso `TABLES_PARENT_FIRST`
(plus the matching `/import` + `importViaTurso` restore orderings). They covered only **28 of 30**
user-data tables. **Two tables shipped after the list was last touched and were silently omitted:**
- **`Series`** (recurring-meeting series; `Conversation.seriesId → Series.id`). A restore into a fresh
  DB lost all series names and left conversations with a dangling `seriesId` → under FK enforcement
  that **aborts the entire restore transaction**.
- **`IdeaTag`** (tags-on-ideas junction). Ideas silently lost their non-legacy tag links on restore.

Fix (`2dcd3b8`, **schema-free** — both tables already exist in Turso, no DDL): added both to the
browser-direct list (`Series` before `Conversation` so inserts stay FK-safe + the reverse deletes it
after; `IdeaTag` after Idea+Tag), to the server export, and to the `/import` delete+insert ordering;
bumped backup `_meta.version` 6→7 in both paths. Also added `notify`/`owedByMe`/`archived` to
`/import`'s `BOOLEAN_FIELDS` (booleans added since) so a browser-export → local-dev import doesn't
trip Prisma validation. **`PushSubscription`** (device keys) + **`DeletedSnapshot`** (undo stack) are
confirmed *deliberately* excluded as ephemeral. Verified against local SQLite: all 30 user tables
accounted for, 0 unaccounted-for. Typecheck (client+server) + full client `vite build` green.

> **Standing invariant (now auto-enforced):** any **new Prisma model** that holds user content MUST be
> added to **both** backup paths (`server/src/routes/backup.ts` export + `/import`; `client/src/lib/backup.ts`
> `TABLES_PARENT_FIRST`) — parent-before-child for inserts. Only `PushSubscription` + `DeletedSnapshot`
> are exempt. **A guard now enforces this:** `server/scripts/check-backup-coverage.mjs` (in `npm run prepush`
> **and** the Vercel `build:vercel`) parses the schema + all three enumerations and **fails the build** if a
> model is uncovered — so this can no longer be silently forgotten. Add new models to the backup, or to the
> guard's `EXEMPT` set.

### Previously Completed — Time-of-day auto-enables "Remind me" (2026-06-24)

Tiny owner ask, **schema-free, pushed to `main`.** Picking a time of day on an action now defaults
its **"Remind me"** reminder to **ON** — implemented in both editing surfaces: the inline
`ActionDateSelect` popover (`updateTime`) and the full action form's time `<Input>`. Auto-enables only
when `notify` is currently off (won't fight a deliberate later toggle-off within the same edit), and
runs the same `ensurePushForReminder()` device-subscribe + Settings-fallback toast as the manual bell.
Toggle-off still works; clearing the date still drops time+notify. Runbook note added to
`.planning/ACTION-REMINDERS.md`. Typecheck (client+server) + full client `vite build` green.


### What's Next

1. **No carried-over primary task** (this was a maintenance/backup-integrity session). *Optional*
   leftovers still open from the prior merge bug-fix session: **(a)** re-attach the merged
   **"Seth Glickman"** to the meeting he lost (the pre-fix merge cascade-deleted his participant link)
   — reopen that meeting → add him; the picker now refreshes so he's selectable. **(b)** a one-off
   **audit/repair of *earlier* contact merges** that may have similarly lost
   `ConversationParticipant`/`ActionContact` links or orphaned `ConversationMention`s — not run
   (forward-fix only). Action reminders are feature-complete + live; opt-in extensions (snooze,
   reminders for no-due-date actions, a Settings "test notification" button) stay unbuilt until asked.
2. Plan of record is **`.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+)**. Check the **"⏳ Waiting on
   owner"** block — **D5/D6/D8/D9**. Phase 3 (stakeholder intel) is gated on D8/D9; Phase 4 (Copilot
   AI ingest) on D5/D6. Don't push on those until the owner raises them.
3. **Option B (when wanted):** attendee auto-fill via Microsoft Graph or Power Automate — implement a
   second `CalendarProvider`; nothing downstream changes.
4. **@-mention follow-up (optional):** add a command-palette entry for the Mentions page. (Prep-note
   `@` and org `@` are now done.)

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
6. **Mixed `updatedAt`/`createdAt` text formats in the DB** (some rows `...Z`, some `...+00:00`, some
   `YYYY-MM-DD HH:MM:SS`) — left as-is; the concurrency guard no longer cares (compares in app code).
   But **don't add exact `DateTime` equality `where` filters** on those columns (range `gte`/`lt` is
   fine); see the CLAUDE.md gotcha. A one-off normalize-to-`+00:00` is possible later but unneeded.

### Open Bugs / Known Caveats

- **Non-issue (closed): "perpetual browser busy-spinner" was NOT the app.** Owner reported a
  never-stopping loading cursor after the tags-in-search work; suspected a Turso query hang. Ruled
  out: local dev reproduces nothing (`readyState: complete`, zero pending/looping requests; SW is
  active in dev too). Owner then isolated it — the spinner tracks with **VS Code being open** and
  **persists with the browser fully closed** (Task Manager-confirmed). So it's a local VS Code /
  agent-harness artifact (debug-driven Chrome / MCP / extension activity), **not SearchBook and not
  the search change**. No code change. Don't re-chase this as an app bug.
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

`main` — meeting-participant UX (`ce9f306`: create-on-add, click-through, bulk paste, auto-cleanup)
+ lockfile chore (`c0abed3`) + this session's docs are **pushed**. **Schema-free** — no Turso DDL
outstanding, no held commits. Server + client typecheck + full client `vite build` + `prepush`
backup guard green.

---

### Suggested kickoff prompt for the next session

Durable version (works every session — it defers to the docs, which stay current):

> Start a SearchBook session: read `AGENTS.md` and follow its "Session start" steps, then summarize
> where we left off and what's next before doing anything.

Context for *this* upcoming session specifically: last session was a **bug-fix session** triggered by a
contact-merge mishap. Two schema-free fixes shipped to `main`: **(1)** the **contact merge** now
re-points `ConversationParticipant` + `ActionContact` + `ConversationMention` to the kept contact before
deleting the loser (it previously lost those via onDelete Cascade/SetNull — destroying a meeting's only
participant + its fallback title) — `95cd537`; **(2)** the **Quick Log / meeting dialog** now **flushes
unsaved work on close** (×/Esc/Cancel = keep, not discard; incl. brand-new free-text participants
autosave skips) and **refetches contact/org/tag lookups on every open** (were cached per session, hiding
mid-session-created/merged contacts from the pickers + `@`-autocomplete) — `8cbc7ee`. *Optional* leftover:
re-attach the lost "Seth Glickman" participant to his meeting, and/or audit earlier merges for the same
loss. (Action time-of-day + Web Push reminders shipped the **same day** in a parallel session — `9825a3a`,
SCHEMA, live; runbook `.planning/ACTION-REMINDERS.md`.) Plan of record is
`.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+, gated on the "⏳ Waiting on owner" block, D5/D6/D8/D9).
Nothing is pending (no Turso DDL, no held commits).
