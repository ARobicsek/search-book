# Next Session Prompt

Rolling handoff for the next AI session (Claude Code **or** Gemini/Antigravity — protocol is
agent-agnostic, see `AGENTS.md`). Keep this file **lean**: a short "just completed", "what's next",
carry-overs, open bugs, and a kickoff prompt. Per-session detail goes in `SESSION-HISTORY.md`, not
here.

### What Was Just Completed — Time-of-day auto-enables "Remind me" (2026-06-24)

Tiny owner ask, **schema-free, pushed to `main`.** Picking a time of day on an action now defaults
its **"Remind me"** reminder to **ON** — implemented in both editing surfaces: the inline
`ActionDateSelect` popover (`updateTime`) and the full action form's time `<Input>`. Auto-enables only
when `notify` is currently off (won't fight a deliberate later toggle-off within the same edit), and
runs the same `ensurePushForReminder()` device-subscribe + Settings-fallback toast as the manual bell.
Toggle-off still works; clearing the date still drops time+notify. Runbook note added to
`.planning/ACTION-REMINDERS.md`. Typecheck (client+server) + full client `vite build` green.

### Previously Completed — Contact-merge data-loss + meeting-dialog autosave/lookup fixes (2026-06-24)

Owner bug report, **3 bugs diagnosed, 2 fixed, schema-free, pushed to `main` (`95cd537` merge +
`8cbc7ee` dialog).** Trigger: the owner merged two just-created "Seth Glickman" contacts and found the
merged Seth had vanished from a meeting he attended, the meeting's title (which falls back to its first
participant) went blank, and he couldn't be re-added as a participant even though he was in Contacts —
plus an earlier write-up dismissed via the dialog "×" had silently not saved.

**Fixed:**
- **Merge silently destroyed data** (`95cd537`, `server/src/routes/duplicates.ts`): the contact merge
  re-pointed the anchor/actions/links/prep-notes/relationships/employment but **never handled three
  Contact relations**, so deleting the duplicate lost data via their onDelete — `ConversationParticipant`
  (Cascade → a meeting whose only participant was the removed contact lost it *and* its fallback title),
  `ActionContact` (Cascade → multi-select action ownership; only legacy `Action.contactId` was migrated),
  `ConversationMention` (SetNull → orphaned to null). Now re-points all three to the kept contact before
  the delete, composite-PK dedupe (takeaway note carried onto the kept participant row when empty); for
  mentions it **rewrites the `(/contacts/<id>)` token** in notes/next-steps/prep-notes via raw SQL (so
  the save-time re-derive sticks + no `Conversation.updatedAt` bump) then rebuilds the mention index per
  affected meeting. **Invariant: any new Contact relation must be added to the merge.**
- **Dialog close discarded work + stale lookups** (`8cbc7ee`, `client/src/components/quick-log-dialog.tsx`):
  closing via ×/Esc/Cancel/click-outside never flushed the pending ~1.5s autosave (timer canceled on
  close) and free-text names are excluded from the autosave body → a new participant + notes typed and
  dismissed before autosave fired was lost. Now **flushes on close** (shared `finalizeMeeting({ silent })`
  + `hasUnsavedWork()`; resolves free-text names like an explicit Done; closing = keep, not discard).
  Also the contact/org/tag lookups were **cached once per session** (dialog mounted permanently at app
  root) → a contact created/merged mid-session was invisible to the pickers + `@`-autocomplete; removed
  the `lookupsLoaded` gate so they **refetch on every open**.

**No fix needed (#4 in the diagnosis):** the `@`-mention the owner thought was missing was a loose
mention of a third party that *did* index fine — false alarm (owner had trouble finding it). Merge never
touches loose mentions anyway.

> **Also shipped 2026-06-24 (parallel/prior session):** action **time-of-day + opt-in Web Push reminders**
> (`9825a3a` + dedicated-secret fix; SCHEMA; deployed + verified firing live in prod). Additive
> `Action.dueTime`/`notify`/`lastNotifiedAt` + `PushSubscription`; `dueDate` stays date-only; time/alert
> independent (alert w/o time → 09:00 ET); $0 via free VAPID + free 1-min external cron
> (`/api/cron/reminders`, `REMINDERS_CRON_SECRET`). Full runbook: **`.planning/ACTION-REMINDERS.md`**.

**Two red herrings diagnosed during setup (note for future):** (1) pasting the cron URL in the *normal*
browser shows the SPA shell because the **PWA service worker intercepts the address-bar navigation** —
test endpoints in an **Incognito** window. (2) Early `401`s were **pre-deploy / pre-env-var** — Vercel only
injects a newly-added env var into builds created **after** it's added, so **Redeploy** after adding env vars.

### What's Next

1. **No carried-over primary task** (this was a bug-fix session). Two *optional* follow-ups from it:
   **(a)** re-attach the merged **"Seth Glickman"** to the meeting he lost (the pre-fix merge cascade-deleted
   his participant link) — reopen that meeting → add him; the picker now refreshes so he's selectable.
   **(b)** a one-off **audit/repair of *earlier* contact merges** that may have similarly lost
   `ConversationParticipant`/`ActionContact` links or orphaned `ConversationMention`s — not run (forward-fix
   only). Action reminders (prior session) are feature-complete + live; opt-in extensions (snooze,
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

`main` — contact-merge data-loss fix (`95cd537`) + meeting-dialog autosave/lookup fix (`8cbc7ee`) +
this session's docs are **pushed**. **Schema-free** — no Turso DDL outstanding, no held commits. (Both
fixes were rebased onto the parallel reminders session and re-verified post-rebase; server + client
typecheck + full client `vite build` green.)

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
