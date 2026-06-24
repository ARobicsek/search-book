# Next Session Prompt

Rolling handoff for the next AI session (Claude Code **or** Gemini/Antigravity — protocol is
agent-agnostic, see `AGENTS.md`). Keep this file **lean**: a short "just completed", "what's next",
carry-overs, open bugs, and a kickoff prompt. Per-session detail goes in `SESSION-HISTORY.md`, not
here.

### What Was Just Completed — Action time-of-day + opt-in Web Push reminders (2026-06-24)

Owner ask, **SCHEMA, deployed to `main` (`9825a3a` + a dedicated-secret follow-up) and verified
firing live in production.** Actions can now optionally carry a **time of day** and an **opt-in
reminder** that fires a **desktop/PWA push notification** — at **zero added cost**, and **without
disturbing** the dominant "no times, no alerts" pattern (an action with no time and `notify=false`
behaves exactly as before).

**Built (additive — `dueDate` stays date-only):**
- **Schema:** `Action.dueTime` ("HH:MM" local), `Action.notify` (default false), `Action.lastNotifiedAt`;
  new `PushSubscription` table (one row/device). Owner-decided (AskUserQuestion): **time and alert are
  independent** — a time can exist with no alert; an alert with no explicit time → **09:00 America/New_York**.
- **Server:** `lib/push.ts` (VAPID + DST-correct `zonedWallTimeToUtc`), `routes/push.ts`
  (public-key/subscribe/unsubscribe), `routes/reminders.ts` (`GET/POST /api/cron/reminders`, secret-gated,
  exempt from the `/api` password gate). The cron converts each due action's wall-clock moment in
  `REMINDER_TZ` to a real instant, pushes to every subscription, sets `lastNotifiedAt` **once**, prunes
  dead (404/410) subs. Editing date/time/notify **re-arms** (`lastNotifiedAt`→null). `web-push` dep.
- **Client:** time input + "Remind me" bell in `action-date-select.tsx` and the action form; time/bell
  shown in lists & detail; **Settings → Notifications** card to enable/disable push per device;
  `public/push-sw.js` (`push` + `notificationclick`) imported into the Workbox SW via **`importScripts`**
  (kept `generateSW` — existing `/api` NetworkOnly + `/photos` CacheFirst caching untouched).
- **Dashboard** (owner follow-up): today's **timed** actions sort to the **top** by time, and a timed
  action **shifts into the Overdue card** once its moment passes.

**Cost = $0:** free VAPID Web Push + a **free external 1-minute cron** (cron-job.org) — no paid Vercel Cron.

**Setup (done by owner, verified):** Turso DDL applied (3 ADD COLUMN + `PushSubscription`); Vercel env
`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`/`REMINDER_TZ` + a **dedicated `REMINDERS_CRON_SECRET`**
(the backup `CRON_SECRET` is marked **Sensitive**/unreadable in Vercel so can't be reused in the cron URL;
`reminders.ts` falls back to `CRON_SECRET`); cron-job.org pointed at `/api/cron/reminders?key=…` every 1 min.
**Live reminder fired successfully** on phone (home-screen PWA) + desktop. Full runbook:
**`.planning/ACTION-REMINDERS.md`**.

**Two red herrings diagnosed during setup (note for future):** (1) pasting the cron URL in the *normal*
browser shows the SPA shell because the **PWA service worker intercepts the address-bar navigation** —
test endpoints in an **Incognito** window. (2) Early `401`s were **pre-deploy / pre-env-var** — Vercel only
injects a newly-added env var into builds created **after** it's added, so **Redeploy** after adding env vars.

### What's Next

1. **No carried-over primary task.** Action reminders are feature-complete + live for v1. Possible
   *opt-in* extensions if the owner asks: a snooze/"remind again" control; reminders for actions with
   **no due date**; surfacing the reminder time/bell in more places (e.g. calendar view); a per-device
   "test notification" button in Settings. None built until requested.
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

`main` — action time-of-day + Web Push reminders (`9825a3a` merge + dedicated-secret follow-up) +
docs are **pushed**. Turso DDL applied by the owner; Vercel env vars set; external cron live; a real
reminder fired in prod. **Nothing pending** — no held commits, no DDL outstanding. (Feature branch
`claude/actions-time-notifications-i013g7` is merged and can be deleted.)

---

### Suggested kickoff prompt for the next session

Durable version (works every session — it defers to the docs, which stay current):

> Start a SearchBook session: read `AGENTS.md` and follow its "Session start" steps, then summarize
> where we left off and what's next before doing anything.

Context for *this* upcoming session specifically: last session shipped **optional time-of-day +
opt-in Web Push reminders for actions** (`9825a3a` + a dedicated-secret follow-up; SCHEMA; deployed +
verified firing live in prod). Additive `Action.dueTime`/`notify`/`lastNotifiedAt` + a
`PushSubscription` table; `dueDate` stays date-only so nothing about existing behavior changes — an
action with no time and `notify=false` is unchanged. **Time and alert are independent** (alert w/o a
time → 09:00 America/New_York). Delivery is **free Web Push** (VAPID) triggered by a **free external
1-minute cron** (cron-job.org) hitting `/api/cron/reminders` (gated by a dedicated readable
`REMINDERS_CRON_SECRET`, falling back to `CRON_SECRET`). UI: time input + "Remind me" bell in the date
popover & action form, time/bell in lists/detail, Settings→Notifications per-device enable; SW push
handlers in `public/push-sw.js`. Dashboard sorts today's timed actions to the top by time and shifts
them to Overdue once past. **Setup is complete** (Turso DDL, Vercel env, external cron) — see
`.planning/ACTION-REMINDERS.md`. **No carried-over task.** Plan of record is
`.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+, gated on the "⏳ Waiting on owner" block, D5/D6/D8/D9).
Nothing is pending (no Turso DDL, no held commits).
