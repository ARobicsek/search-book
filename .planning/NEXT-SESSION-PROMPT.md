# Next Session Prompt

This file serves as a handoff document for the next AI session. It summarizes what was just accomplished, what needs to be worked on next, and any open bugs or architectural context.

### What Was Just Completed

**Production Hardening Plan — Phase 0 done; Phase 1 mostly done.** See `.planning/PRODUCTION-HARDENING-PLAN.md` (now committed) for the full task list and per-task STATUS lines.

- **Phase 0 (Tasks 1–6):** complete and deployed (password gate, debug/credential leak removal, all-23-table backup, daily Vercel Blob backup, DB-health endpoint, recovery runbook). Outstanding **[USER ACTION]s**: set up UptimeRobot on `/api/health`, rotate the Turso token, confirm the Turso PITR window, adopt the weekly off-platform backup habit.
- **Phase 1 — done & pushed to main (typecheck-clean):**
  - **Task 19** (`daa7fc5`) — tags list no longer uses the `_count` include that hangs Turso; uses `groupBy`.
  - **Task 14** (`6ad6f11`) — `build:vercel` runs prisma generate → full typecheck → build, so type errors now fail the deploy.
  - **Task 11** (`1326423`) — React `ErrorBoundary` around `<App/>` with a reload fallback.
  - **Task 7** (`e59e456`) — atomic restore: browser-direct path downloads a pre-restore safety snapshot then runs wipe+reinsert in a libsql interactive transaction; server `/import` wrapped in `$transaction`.
  - **Task 12** (`5e65697`) — multi-write endpoints (conversations, contacts/companies + StatusHistory, batch-action, prepnotes) wrapped in transactions.
  - **Task 13** (`b5dcfd0`) — delete-confirm dialogs now show cascade impact counts via new `/…/:id/delete-impact` endpoints.
  - **Task 9** (`279d949`) — `useAutoSaveGuard`: flush pending auto-save on unmount (covers back/Cancel/sidebar nav) + `beforeunload` guard. (`useBlocker` avoided — app uses classic `BrowserRouter`.)
  - **Task 10** (`cc5a139`) — `useEditDraft`: edit-mode localStorage drafts with restore-on-reload + bounded auto-retry of failed idempotent saves.
- **Task 8** (`e29f580`, merged via PR #1) — optimistic concurrency (409 on stale `_expectedUpdatedAt`) on Contact/Company/Action saves. Server uses an atomic compare-and-set (updateMany guard; row-claim for actions); client advances its expected `updatedAt` after every save and reloads on 409 (the unsaved edit survives as a Task 10 draft). **Verified on the Vercel preview:** two-tab conflict produced the 409 + reload; single-tab repeated editing produced no false conflicts.

**Phase 1 is now COMPLETE.** Phase 2 (Tasks 15–18, 20–25) remains as lower-urgency hardening. Outstanding [USER ACTION]s: UptimeRobot on `/api/health`, and confirming the Turso PITR window. (Turso token rotation is already done.)

---

#### Earlier context — Backup & Security Hardening (ROADMAP "Phase 7.5")

This phase (across several sessions) added: a shared-password gate over all `/api` routes, removal of debug/credential leaks, an automated **daily backup to Vercel Blob** (`/api/backup/cron`, 08:00 UTC, newest 30 retained), a DB-connectivity `/health` check, and a fix to include all 23 tables in export/import. The final session focused on **trusting restore** and **backing up photo files**:

1. **Verified restore works (DB).** Ran an isolated, production-safe round-trip against a throwaway local SQLite DB — seeded all 23 tables (including the FK-tricky cases: self-referential `Contact.referredById`, every junction table, status-history tables), then export → import → export. Result: **byte-identical across all 23 tables**, and restore is **idempotent** (safe to run twice).
2. **Fixed an `updatedAt` bump on restore** (`ec777d4`). The server-side `/backup/import` relinked self-references via `prisma.contact.update()`, which tripped Prisma's `@updatedAt`. Switched to raw SQL, matching the browser-direct Turso path. This is what made the round-trip byte-identical.
3. **Photo files now backed up** (`3875990`). The JSON backup only ever stored photo *references* (`photoUrl`/`photoFile`). The manual **"Create Backup"** button now *also* fetches the actual image **bytes** from those URLs (Vercel Blob in prod, `/photos/` locally) and downloads a single `searchbook-photos.zip` with a `manifest.json`. New module: [client/src/lib/photo-backup.ts](client/src/lib/photo-backup.ts), wired into [client/src/pages/settings.tsx](client/src/pages/settings.tsx). Uses `fflate` (store-only). **Intentionally NOT in the daily cron** — keeps Turso and cloud backups small; the user stores the ZIP locally and overwrites it each time. Unreachable/CORS-blocked URLs are skipped and reported, never fatal. Verified bytes round-trip intact via an HTTP-served test.

### What's Next — Phase 8: Document Search

The next planned phase is **Phase 8: Document Search** (see ROADMAP.md). Confirm scope with the user at session start, but the goal is full-text search across linked Google Drive documents:
- Google Drive API integration to read document contents
- Index linked documents for full-text search
- Search results show document snippets with context
- Search across all linked documents from contacts, companies, and actions
- Results link back to the original document in Google Drive

### Deferred — DESKTOP-ONLY verification (a later phase, when the user is at their desktop)

These two were explicitly parked until the user is at their desktop. **Do not attempt remotely** — they need a real Turso DB / browser environment:

1. **End-to-end photo-ZIP test on the deployed app.** Run "Create Backup" against production and confirm the photos actually download (watch the toast: any "skipped" count points to a **CORS issue** fetching Vercel Blob URLs from the browser — the fallback would be to route the fetch through a small server proxy). This is the one unverified part of the photo feature.
2. **Restore into a scratch Turso database.** The restore round-trip was proven against local SQLite, which exercises the same format/ordering logic but **not** the production browser-direct Turso transport (`importViaTurso`). To fully close this: create a throwaway DB in the Turso web dashboard, point a test/import at it (or hand the creds to the agent to run a libsql script), and confirm a full restore. This makes restore trustworthy end-to-end including the Turso path.

### Other Carry-over Items (pending from prior sessions, lower priority)

1. **Replace `resetPrisma()` hack** in [server/src/app.ts](server/src/app.ts) with a long-lived PrismaClient pattern. Fresh client+adapter per request in production avoids stale Turso HTTP connections — works but wasteful.
2. **Expand `useAutoSave`** coverage to Prep Notes, Actions, and the Company create form.
3. **Company database polish**: scan for near-duplicate companies that should be merged (LinkedIn-variant suffix handling).
4. **Stretch (LinkedIn plan §2.2 / §7)**: consider `isBoardRole: Boolean @default(false)` on `EmploymentHistory` if the board-vs-employee distinction gets painful.
5. **Consistency tweak (optional)**: the edit form doesn't render existing `EmploymentHistory` rows (the new-contact "Past Roles" section does).

### Open Bugs / Known Caveats

- **No confirmed bugs.** One caveat: the photo-ZIP feature depends on the browser being able to `fetch()` Vercel Blob URLs — unverified against the live store (see Deferred #1).
- **Photo binaries are only in the manual ZIP**, not the daily cloud backup. DB restore re-links photo URLs, and the Blob `photos/` objects persist (retention only prunes `backups/`), but there is no automated offsite copy of the image bytes. By design.

### Working branch

`claude/sweet-planck-plokJ` — both final-session commits (`ec777d4`, `3875990`) are pushed there. Not yet merged to `main`.
