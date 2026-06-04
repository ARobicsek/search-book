# Next Session Prompt

This file serves as a handoff document for the next AI session. It summarizes what was just accomplished, what needs to be worked on next, and any open bugs or architectural context.

### What Was Just Completed

**Production Hardening Plan — ALL phases (0, 1, 2) COMPLETE.** See `.planning/PRODUCTION-HARDENING-PLAN.md` for the full task list and per-task STATUS lines.

- **Phase 0 (Tasks 1–6):** complete and deployed (password gate, debug/credential leak removal, all-23-table backup, daily Vercel Blob backup, DB-health endpoint, recovery runbook). All user-actions done: Turso token rotated; UptimeRobot live on `/api/health` (5-min, alerting); Turso PITR window confirmed = up to 2 weeks (Free plan). Standing habit: weekly off-platform backup download.
- **Phase 1 (Tasks 7–14, 19):** complete on `main` — atomic restore, optimistic concurrency (409 on stale saves, verified on a Vercel preview), autosave flush-on-nav + edit drafts + bounded retry, React error boundary, multi-write transactions, delete-impact counts, typecheck deploy gate, tags `_count`→`groupBy` Turso-hang fix.
- **Phase 2 (Tasks 15–18, 20–25) — done this session (2026-06-04), merged to `main`; one atomic commit each, typecheck + client build clean:**
  - **Task 15** (`c433bfa`) — PWA `/api/` caching `NetworkFirst`→`NetworkOnly`; API responses never cached (kills the stale-overwrite-on-autosave vector).
  - **Task 22** (`853a99c`) — `registerType` `autoUpdate`→`prompt`; the existing `PWAUpdatePrompt` now offers new bundles instead of old ones lingering.
  - **Task 23** (`b05d674`) — `loadData` resets the prior contact's secondary arrays + re-enters loading before fetching (no cross-contact data flash).
  - **Task 20** (`46d3b30`) — `safeParseArray` guards the unguarded `JSON.parse`s in `POST /companies/:id/contacts` (malformed JSON no longer 500s).
  - **Task 21** (`70f56ee`) — company delete scrubs the deleted id from contacts' `additionalCompanyIds`/`connectedCompanyIds` JSON arrays, in one transaction.
  - **Task 18** (`60e4686`) — input allow-listing: `PUT /companies/:id` (`name,industry,size,website,hqLocation,notes,status`) and `PUT /relationships/:id` (`type,notes`) copy only known fields (no mass-assignment).
  - **Task 24** (`120195d`) — CORS tightened: dropped `*.vercel.app` wildcard, exact allow-list (localhost + prod domain); header-auth remains the real gate.
  - **Task 16** (`565f0dd`) — `express-rate-limit` (1000/15min on `/api` before the auth gate, skips `/health`; 40/hr on `/api/linkedin`), body limit 50mb→2mb (backup routes keep a 50mb parser), `trust proxy` set.
  - **Task 17** (`89ec4a6`) — opt-in Sentry (`@sentry/node` + `@sentry/react`), wired into the `ErrorBoundary`; no-op until DSNs are set.
  - **Task 25** — resolved by decision+documentation: photos are best-effort for the automatic layer; bytes are already backed up off-platform via the manual photo-ZIP. A cron-side zip would add no independence (same Blob store) and risk the 30s timeout. See the plan's Task 25 STATUS for the full rationale.

**Remaining [USER ACTION] to activate Task 17 (non-blocking):** create a free Sentry project and set `SENTRY_DSN` (Vercel prod) + `VITE_SENTRY_DSN` (Vercel prod, build-time → needs a redeploy). Until then error tracking is dormant; the console + error boundary still work.

All Phase 2 work is on `main` (fast-forwarded from `claude/bold-ride-OjoVC`, tip `3da9982`; this doc-sync commit follows).

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

`claude/bold-ride-OjoVC` — Phase 2 (10 commits) developed here and fast-forwarded to `main` (tip `3da9982`). Nothing pending un-merged.
