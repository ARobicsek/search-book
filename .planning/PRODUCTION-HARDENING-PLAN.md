# SearchBook — Production Hardening Plan

**Created:** 2026-06-02
**Status:** **Phase 0 complete (2026-06-03).** Tasks 1–5 built, deployed to prod, and verified. Task 6 runbook written below; remaining user actions: (a) set up UptimeRobot on `/api/health`, (b) confirm Turso PITR window, (c) adopt weekly off-platform backup habit. **Phase 1 IN PROGRESS (2026-06-03).** Task 19 has been relocated from Phase 2 into Phase 1 (highest-value/lowest-effort Turso-stability fix). See `.planning/NEXT-SESSION-PROMPT.md` for the live handoff.
**Why this exists:** The owner was hired as Chief Medical Officer at NCQA and will rely on SearchBook for heavy professional networking. The app must move from "personal tool" to "near-100% uptime, never lose data." A full review (4 subagents: security, data-integrity, backup/DR, frontend resilience) produced the findings below. The app works functionally — every item here is about operational armor, not features.

---

## How to use this document

- Work **top to bottom**. Phase 0 is the line between "personal toy" and "safe to rely on." Do not skip ahead.
- One **atomic commit per task** (GSD convention). Each task lists a suggested commit message.
- After each task, run `npm run prepush` (typecheck) and, where noted, test locally with `npm start`.
- Several tasks need **manual user actions** (Turso dashboard, Vercel env vars, signing up for a monitor). These are flagged **[USER ACTION]** and the AI should pause and ask the user to do them.
- **Test data-loss-related changes locally first** (local SQLite) before touching production/Turso.
- Mobile (390px iPhone PWA) must be re-tested for any UI change.

### Critical sequencing safety rules
1. **Do not lock yourself out.** When adding the auth gate (Task 1), ship the client password prompt in the *same* change, and keep `/api/health` open. Test locally before pushing.
2. **Rotate the Turso token only AFTER the auth gate is confirmed working in production** (Task 2 ordering). Sequence: deploy gate → confirm app works → rotate token in Turso → update Vercel env → redeploy → confirm again.
3. **Always create a fresh backup immediately before testing the restore path.**

---

## Environment variables to add

| Var | Where | Purpose | Task |
|-----|-------|---------|------|
| `APP_PASSWORD` | Vercel (production) + `server/.env` (local, optional) | Shared password gate for all `/api` routes | 1 |
| `CRON_SECRET` | Vercel (production) | Authenticates Vercel Cron → backup endpoint | 4 |
| (existing) `TURSO_AUTH_TOKEN` | Vercel | **Rotate** to a fresh long-lived, single-DB-scoped token | 2 |
| (existing) `BLOB_READ_WRITE_TOKEN` | Vercel | Already set (photos). Reused for backup-to-Blob | 4 |

> Use `printf 'value' | vercel env add VAR_NAME production` (no heredoc — avoids trailing newlines), per CLAUDE.md.

---

# PHASE 0 — Do before relying on the app (the "don't get hurt" tier)

Goal of Phase 0: after these tasks, nobody can read/steal/destroy the data without the password, backups are complete and automatic, and you'll be alerted within minutes if anything breaks.

---

## Task 1 — Add a shared-password gate over all `/api` routes  ⚠️ CRITICAL

**Problem:** There is no authentication. Every `/api` route is public on the internet ([server/src/app.ts](../server/src/app.ts)). Anyone with the URL can read/edit/delete all data.

**Threat model & decision:** This is a single-user app. A **single shared password** (not OAuth) is the proportionate fix — it closes the "anyone with the URL" hole and, combined with rate limiting (Task 16), prevents brute-force and scraping. It is *not* high-security (the client bundle is public and the password lives in `localStorage`), but it is the right cost/benefit for one user's networking CRM. If stronger auth is ever needed, the follow-up is Cloudflare Access (free up to 50 users) in front of the domain, or a real auth provider.

**Server changes — [server/src/app.ts](../server/src/app.ts):**
- Add an auth middleware mounted on `/api`, placed **after** the body parser and **before** the routes, but with explicit exemptions:
  - Exempt `GET /api/health` (uptime monitor must reach it).
  - Exempt the cron backup endpoint (Task 4) — it uses `CRON_SECRET` instead.
- Logic:
  ```ts
  import crypto from 'crypto';

  function timingSafeEqualStr(a: string, b: string): boolean {
    const ab = Buffer.from(a); const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  }

  // Fail closed in production if the password isn't configured.
  if (process.env.NODE_ENV === 'production' && !process.env.APP_PASSWORD) {
    throw new Error('APP_PASSWORD must be set in production');
  }

  app.use('/api', (req, res, next) => {
    if (req.path === '/health') return next();                 // open for monitor
    if (req.path === '/backup/cron') return next();            // cron-secret gated (Task 4)
    const expected = process.env.APP_PASSWORD;
    if (!expected) return next();                              // dev convenience when unset
    const provided = req.header('x-app-password') || '';
    if (timingSafeEqualStr(provided, expected)) return next();
    return res.status(401).json({ error: 'Unauthorized' });
  });
  ```
- Add `x-app-password` to CORS allowed headers: in the `cors({...})` config add `allowedHeaders: ['Content-Type', 'x-app-password']`.

**Client changes:**
- [client/src/lib/api.ts](../client/src/lib/api.ts): attach the password header to every request. Read from `localStorage.getItem('searchbook_password')`. Add it in `fetchWithTimeout` for all verbs (including `uploadFile`).
  ```ts
  const headers = { ...(options.headers || {}) };
  const pw = localStorage.getItem('searchbook_password');
  if (pw) (headers as any)['x-app-password'] = pw;
  ```
- On any `401` response in `handleResponse`, clear the stored password and trigger the login prompt (e.g. dispatch a custom event or set a module-level callback) so the user is re-prompted.
- Add a minimal **login gate** in [client/src/App.tsx](../client/src/App.tsx): if no password in `localStorage`, render a simple password screen (one input + "Unlock"). On submit, store it and call `GET /api/health` *with the header* via a new tiny `GET /api/auth/check` (returns 200 if the header matches, 401 otherwise) to validate before storing. Add that route:
  - [server/src/app.ts](../server/src/app.ts): `app.get('/api/auth/check', (req,res) => res.json({ ok: true }))` — it sits *behind* the gate, so a wrong password yields 401 and the client rejects it.

**Local dev:** leave `APP_PASSWORD` unset in `server/.env` to skip the gate while developing (the middleware no-ops when unset), OR set it to a known value to test the full flow. Production must have it set (enforced by the startup throw).

**Testing:**
- Local with `APP_PASSWORD` set: `curl localhost:3001/api/contacts` → 401; with `-H "x-app-password: <pw>"` → 200. `GET /api/health` → 200 without header.
- Client: clearing `localStorage` shows the login screen; correct password unlocks; wrong password is rejected.
- Mobile: confirm the login screen renders at 390px.

**Acceptance:** All `/api` routes except `/health` and `/backup/cron` return 401 without the correct header. The app prompts for and remembers the password. Health check still open.

**[USER ACTION]** Choose a strong password; set it in Vercel: `printf 'YOUR_PASSWORD' | vercel env add APP_PASSWORD production`. Set the same locally if testing.

**Commit:** `feat(security): add shared-password gate over all API routes`

**STATUS: ✅ DONE (commit 01fbb12).**

---

## Task 2 — Remove public credential/debug leaks & rotate the Turso token  ⚠️ CRITICAL

**Problem:**
- `GET /api/backup/credentials` ([server/src/routes/backup.ts:9-19](../server/src/routes/backup.ts)) returns the live Turso URL + auth token to anyone.
- `GET /api/debug` and `GET /api/debug/companies` ([server/src/app.ts:104-162](../server/src/app.ts)) leak the Turso URL prefix/length and token status.

**Changes:**
1. **Delete `/api/debug` and `/api/debug/companies` entirely** from `app.ts` (pure recon leakage, no production value). Their only useful behavior — a real DB connectivity check — moves into the health endpoint (Task 5).
2. **`/api/backup/credentials`:** it is now automatically protected by the Task 1 gate (it lives under `/api`). Keep it (the browser-direct restore in Task 7 still needs it) but add a clarifying comment that it is auth-gated and must never be exempted. Residual risk: the token is exposed to the *authenticated* browser session during backup/restore — acceptable for single-user; documented.
   - Optional hardening: only serve it for `POST` with a confirmation flag, or move backup fully server-side later. Not required for Phase 0.
3. **Tighten error responses:** [api/index.ts:18-22](../api/index.ts) returns `initError.stack` to the client — gate that behind `NODE_ENV !== 'production'`.

**[USER ACTION] — token rotation (do AFTER Task 1 is live in prod and verified):**
- In the Turso dashboard, create a **new, long-lived token scoped to this single database** (Turso supports per-DB tokens).
- `printf 'NEW_TOKEN' | vercel env add TURSO_AUTH_TOKEN production` (remove the old value first).
- Redeploy; confirm `/api/health` (with DB check) is green and the app loads data.
- Write the rotation steps into the Recovery Runbook (bottom of this doc).

**Testing:** `curl https://<prod>/api/debug` → 404. `curl https://<prod>/api/backup/credentials` (no header) → 401.

**Acceptance:** No unauthenticated endpoint returns any secret or DB metadata. Old token invalidated; app works on the new token.

**Commit:** `feat(security): remove debug/credential leaks and harden error output`

**STATUS: ✅ DONE in code (commit 1461df3). [USER ACTION] token rotation is manual.**

---

## Task 3 — Make backups cover all 23 tables  ⚠️ CRITICAL

**Problem:** Backups capture only 18 of 23 tables. These 5 are **silently never backed up** (verified):
`ContactStatusHistory`, `CompanyStatusHistory`, `CompanyActivity`, `CompanyPrepNote`, `ConversationParticipant`.
Of these, `CompanyPrepNote` (company research dossiers) and `CompanyActivity` (company activity log) and `ConversationParticipant` (meeting attendees) are real user-authored content that would be **lost forever** on any restore.

**Changes — three places must agree:**

1. **[client/src/lib/backup.ts](../client/src/lib/backup.ts)** — `TABLES_PARENT_FIRST`: append the 5 tables. All their parents (`Contact`, `Company`, `Conversation`) already appear earlier, so appending is FK-safe for inserts; `TABLES_CHILD_FIRST` (the reverse) is correct for deletes.
   ```ts
   const TABLES_PARENT_FIRST = [
     'Company', 'Contact', 'Tag', 'Idea',
     'EmploymentHistory', 'Conversation', 'Action',
     'ContactTag', 'CompanyTag',
     'ConversationContact', 'ConversationCompany',
     'ActionContact', 'ActionCompany',
     'IdeaContact', 'IdeaCompany',
     'Link', 'PrepNote', 'Relationship',
     // NEW (all children of Company/Contact/Conversation, safe to append):
     'CompanyActivity', 'CompanyPrepNote',
     'ContactStatusHistory', 'CompanyStatusHistory',
     'ConversationParticipant',
   ] as const;
   ```
2. **[server/src/routes/backup.ts](../server/src/routes/backup.ts)** `/export`: add `findMany` for the 5 models and include them in the `data` object.
3. **[server/src/routes/backup.ts](../server/src/routes/backup.ts)** `/import`: add `deleteMany` (child-first) and `createMany` (parent-first) for the 5; confirm `createdAt` is in `DATETIME_FIELDS` (it already is — covers the status-history and activity/prepnote `createdAt`). `ConversationParticipant` has no datetime/boolean fields. No new boolean fields.

**Note on `_meta.version`:** bump to `2` so future code can tell new (complete) backups from old (partial) ones.

**Testing (local SQLite, safe):**
- Seed a couple of `CompanyPrepNote`, `CompanyActivity`, and a `ConversationParticipant` row.
- Export → confirm all 23 keys present and the 5 new ones have rows.
- Import the just-exported file into a fresh local DB → row counts for **all 23 tables** match the source. (Use `npx prisma studio` or a quick count query.)

**Acceptance:** A round-trip backup→restore preserves all 23 tables with matching row counts. `_meta.version` is 2.

**Commit:** `fix(backup): include all 23 tables in export/import (was missing 5)`

**STATUS: ✅ DONE (commit 0f1bc8e).**

---

## Task 4 — Automated daily backup to Vercel Blob  ⚠️ CRITICAL (biggest build item)

**Problem:** Backups are 100% manual, irregular (a ~3-week gap occurred Apr 29 → Jun 1), and saved only to the local OneDrive folder (`/backup/save-local` silently fails in prod — Vercel FS is read-only). Nothing runs automatically.

**Design:** A scheduled server endpoint exports all 23 tables and writes the JSON to **Vercel Blob** (writable in prod; already used for photos — see [server/src/routes/upload.ts:78-89](../server/src/routes/upload.ts)).

**Changes:**
1. **New endpoint** `GET /api/backup/cron` in [server/src/routes/backup.ts](../server/src/routes/backup.ts):
   - Auth: accept EITHER Vercel's cron bearer (`Authorization: Bearer ${process.env.CRON_SECRET}`) OR the app password header (for manual trigger). Reject otherwise. (This endpoint is exempted from the global gate in Task 1, so it must self-authenticate.)
   - Reuse the same 23-table export logic as `/export` (extract into a shared `async function buildExport()` to avoid duplication).
   - Write to Blob:
     ```ts
     const { put, list, del } = await import('@vercel/blob');
     const name = `backups/searchbook-backup-${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}.json`;
     await put(name, JSON.stringify(data), { access: 'public', contentType: 'application/json', addRandomSuffix: false });
     ```
   - **Retention/prune:** `list({ prefix: 'backups/' })`, sort by date, `del()` all but the newest ~30.
   - Return `{ ok: true, name, tables: 23 }`.
2. **Schedule** in [vercel.json](../vercel.json): add
   ```json
   "crons": [{ "path": "/api/backup/cron", "schedule": "0 8 * * *" }]
   ```
   (Hobby plan: daily cron is allowed; it may fire within an hour of the scheduled time — fine for backups.)
3. **Surface backups in Settings** ([client/src/pages/settings.tsx](../client/src/pages/settings.tsx)): add a "Recent automatic backups" list that calls a new `GET /api/backup/list` (returns Blob backups via `list({ prefix:'backups/' })`, newest first) with download links. Also add a "Back up now" button that POSTs to the cron endpoint with the app password.

> **Blob caveat (note for the user):** Vercel Blob is durable but lives in the *same Vercel account* as the app — it is not a fully independent copy. Keep the weekly off-platform copy (Task 6 / runbook): once a week, click "Create Backup" on a computer so a JSON lands in the OneDrive-synced `backups/` folder. Two independent mechanisms = real resilience.

**Testing:**
- Locally you can't write to Blob without `BLOB_READ_WRITE_TOKEN`; unit-test `buildExport()` returns 23 tables, and test the cron auth check (wrong secret → 401).
- After deploy: manually `curl -H "Authorization: Bearer $CRON_SECRET" https://<prod>/api/backup/cron` → confirm a file appears in Blob and in the Settings list.

**Acceptance:** A daily cron writes a complete 23-table JSON to Blob; old backups beyond ~30 are pruned; the user can see and download them from Settings.

**[USER ACTION]** `printf 'RANDOM_LONG_SECRET' | vercel env add CRON_SECRET production`. Confirm the cron appears in the Vercel dashboard after deploy.

**Commit:** `feat(backup): automated daily backup to Vercel Blob with retention`

**STATUS: ✅ DONE (commit ebdb3dc).**

---

## Task 5 — Uptime + DB-health monitoring  ⚠️ CRITICAL

**Problem:** No monitoring or alerting. `/api/health` exists but nothing watches it, and it doesn't even check the DB. If the app or Turso goes down, the user finds out only by chance.

**Changes:**
1. **Upgrade `/api/health`** ([server/src/app.ts:99-101](../server/src/app.ts)) to do a fast DB read and return 200/503 with NO secrets:
   ```ts
   app.get('/api/health', async (_req, res) => {
     try {
       await prisma.$queryRaw`SELECT 1`;
       res.json({ status: 'ok', db: 'ok', timestamp: new Date().toISOString() });
     } catch {
       res.status(503).json({ status: 'error', db: 'down' });
     }
   });
   ```
   Keep it exempt from the auth gate (Task 1) so the monitor can reach it. It returns only ok/down — safe.

**[USER ACTION] — external monitor (free, ~10 min):**
- Sign up for **UptimeRobot** or **BetterStack/Better Uptime** (free tier).
- Add an HTTP monitor on `https://<prod>/api/health`, interval 5 min, alert on non-200.
- Set alert channels: email + phone/push.
- Optional: add **Sentry** (free) to the Express app and React app for error tracking (mark as Task 17, Phase 2).

**Acceptance:** Hitting `/api/health` reflects real DB status; an external monitor pings every 5 min and will alert the user's phone/email on failure.

**Commit:** `feat(ops): health endpoint now verifies DB connectivity`

**STATUS: ✅ DONE in code (commit 65e1caf). [USER ACTION] external monitor still to be set up.**

---

## Task 6 — Verify Turso's own backups & write the recovery runbook  ⚠️ CRITICAL (mostly user action)

**Problem:** Turso is the single source of truth. Its built-in point-in-time-restore (PITR) is the fastest safety net, but it's unverified. And there is no written disaster-recovery procedure — a non-technical user under stress could get stuck (notably: the JSON restore does NOT create tables; the schema must exist first).

**[USER ACTION]:**
- Log into the Turso dashboard. Confirm: (a) the current plan's PITR window (free tier historically ~24h), (b) that it's enabled, (c) whether database branching is available. Note the findings in the runbook.
- Decide if the PITR window is sufficient; if not, consider upgrading the Turso plan.

**AI action:** Write/verify the **Recovery Runbook** at the bottom of this doc with exact, tested steps (create DB → apply schema DDL → set env → restore JSON → verify counts). Test the schema-DDL step against a scratch Turso DB if feasible.

**Acceptance:** The user knows their Turso restore window, and a written runbook exists that a stressed non-technical user could follow.

**Commit:** `docs(ops): add disaster-recovery runbook and Turso backup notes`

**STATUS: ✅ Runbook written (below). [USER ACTION] UptimeRobot + Turso PITR confirmation + weekly off-platform habit still pending.**

---

# PHASE 1 — Soon (the "stop silent data loss" tier)

## Task 7 — Make restore/import atomic  ⚠️ HIGH

**Problem:** Both restore paths wipe-then-reinsert with **no transaction**. An interrupted restore (network drop, phone sleep, token expiry) leaves a **partially-wiped DB**, recoverable only from the file being restored.
- Browser-direct: [client/src/lib/backup.ts:103-143](../client/src/lib/backup.ts) — deletes all tables, then inserts in 50-row batches; the overall sequence is not atomic.
- Server: [server/src/routes/backup.ts:282-331](../server/src/routes/backup.ts) — ~20 `deleteMany()` then `createMany()`, no `$transaction`.

**Changes:**
- **Browser-direct:** wrap the whole delete+insert in a libsql interactive transaction:
  ```ts
  const tx = await client.transaction('write');
  try { /* deletes + inserts via tx.execute / tx.batch-equivalent */ await tx.commit(); }
  catch (e) { await tx.rollback(); throw e; }
  ```
  (libsql supports `client.transaction('write')` over HTTP. Verify batch semantics within the tx; if not supported, fall back to: auto-export current state first and offer one-click rollback on failure.)
- **Server `/import`:** wrap the body in `prisma.$transaction(async (tx) => { ... })`. Watch the 30s Vercel limit for large datasets; if it's a concern, keep large restores to the browser-direct path or local dev.
- **Safety net regardless:** before any restore, automatically run an export and keep it in memory / offer it as a download, so a failed restore can be undone.

**Acceptance:** A restore interrupted mid-way leaves the original data intact (rolled back), not half-wiped.

**Commit:** `fix(backup): make restore atomic (transaction + pre-restore safety export)`

---

## Task 8 — Optimistic concurrency to stop silent cross-device overwrites  ⚠️ HIGH

**Problem:** The client auto-saves the **entire** record object on a 1.5s debounce ([client/src/hooks/use-auto-save.ts](../client/src/hooks/use-auto-save.ts)); the server blindly `update`s ([server/src/routes/contacts.ts:309](../server/src/routes/contacts.ts), [server/src/routes/companies.ts:303](../server/src/routes/companies.ts)). Editing the same contact on desktop and iPhone (or two tabs) → the later save overwrites the earlier with **no warning**. Highest-frequency everyday loss vector.

**Changes (scope: `Contact`, `Company`, `Action` — they have `updatedAt`):**
- Client loads and remembers the record's `updatedAt`. On auto-save PUT, include it (e.g. `{ ...data, _expectedUpdatedAt }`).
- Server: `const r = await prisma.contact.updateMany({ where: { id, updatedAt: new Date(expected) }, data });` — if `r.count === 0`, return `409 Conflict`.
- Client: on 409, show a clear toast ("This record was changed on another device — reloading the latest version") and reload, rather than silently clobbering.
- **`Conversation` has no `updatedAt`** — out of scope here; note as a follow-up (would need a schema column + Turso DDL).

**Acceptance:** A stale save returns 409 and the user is told + reloaded; no silent overwrite.

**Commit:** `feat(data): optimistic concurrency on contact/company/action saves`

---

## Task 9 — Flush pending saves on navigation + unsaved-changes guard  ⚠️ HIGH

**Problem:** The auto-save unmount cleanup only *cancels* the pending debounced save ([use-auto-save.ts:140-145](../client/src/hooks/use-auto-save.ts)); back/Cancel/sidebar nav call `navigate()` directly ([client/src/pages/contacts/contact-form.tsx:553](../client/src/pages/contacts/contact-form.tsx), [company-form.tsx:161](../client/src/pages/companies/company-form.tsx)). Typing a note and tapping "back" within ~1.5s **drops the edit**. There is no `beforeunload`/route-blocker guard anywhere.

**Changes:**
- Add an unmount flush in each auto-saved form: `useEffect(() => () => { autoSaveRef.current?.save(); }, [])` (use a ref to the current `save` to avoid stale closure).
- Have back/Cancel handlers `await autoSave.save()` before `navigate()`.
- Add a `beforeunload` handler when `isDirty || status==='saving'||'error'`.
- Add react-router v7 `useBlocker` (available — `react-router-dom ^7.13.0`) to warn on in-app navigation while dirty.

**Acceptance:** Navigating away mid-edit flushes the save (or warns); no silent loss of typed text.

**Commit:** `fix(autosave): flush pending saves on navigation + unsaved-changes guard`

---

## Task 10 — Persist edit-mode drafts + bounded retry on failed saves  ⚠️ HIGH

**Problem:** Edit forms keep text only in React memory — only the *new-contact* form has localStorage drafts ([contact-form.tsx:318-346](../client/src/pages/contacts/contact-form.tsx), guarded by `!isEdit`). And failed writes are never retried ([client/src/lib/api.ts:47-60](../client/src/lib/api.ts) — only GETs retry). A missed error toast on a flaky phone = lost note.

**Changes:**
- Mirror the new-contact draft mechanism for edit mode: write `draft_edit_contact_${id}` (and the company equivalent) on change; clear on confirmed save; on mount, if a draft exists and is newer than the server `updatedAt`, offer to restore it.
- In `use-auto-save.ts`, on `status==='error'`, persist the dirty object to a localStorage draft AND schedule a bounded retry (1–2 attempts, few seconds apart). Only auto-retry **idempotent** PUT/PATCH (auto-save uses PUT — safe). Do NOT blindly retry POST (risk of double-create).

**Acceptance:** A failed save leaves a recoverable draft; transient failures self-heal via retry; reload offers to restore unsaved edits.

**Commit:** `feat(autosave): edit-mode drafts + bounded retry on write failures`

---

## Task 11 — Add a React error boundary  ⚠️ HIGH

**Problem:** No error boundary ([client/src/App.tsx](../client/src/App.tsx), [client/src/main.tsx](../client/src/main.tsx)). One render-time throw (e.g. an unexpected data shape in the 3000-line [contact-detail.tsx](../client/src/pages/contacts/contact-detail.tsx)) white-screens the whole app and loses in-progress edits.

**Changes:** Add an `ErrorBoundary` component wrapping the route `<Outlet/>` (or the whole router) with a "Something went wrong — Reload" fallback that doesn't nuke the URL. Optionally report to Sentry (Task 17).

**Acceptance:** A thrown render shows a recover UI, not a blank screen.

**Commit:** `feat(resilience): add React error boundary with reload fallback`

---

## Task 12 — Wrap remaining multi-write operations in transactions  ⚠️ HIGH/MED

**Problem:** Only ~5 of ~30 write endpoints use `$transaction`. Multi-step writes can partially fail, leaving inconsistent data:
- Conversation create + follow-up actions/links/status flip ([server/src/routes/conversations.ts:83-178](../server/src/routes/conversations.ts)) — partial on failure (logs a call but loses the follow-up tasks).
- Contact/Company create + initial `StatusHistory`, and status-change history on update ([contacts.ts:271-324](../server/src/routes/contacts.ts), [companies.ts:169-317](../server/src/routes/companies.ts)).
- `prepnotes.ts:95-109` builds eager promises passed to `$transaction([...])` — not truly atomic; convert to the callback form.

**Changes:** Wrap each sequence in `prisma.$transaction(async (tx) => { ... })`. Keep transactions short to respect the 30s/12s timeouts.

**Acceptance:** Each multi-write either fully succeeds or fully rolls back.

**Commit:** `fix(data): wrap multi-write operations in transactions`

---

## Task 13 — Safer deletes: show impact, consider soft-delete  ⚠️ HIGH

**Problem:** Deleting a contact hard-deletes and cascades to conversations, prep notes, relationships, employment history, junctions ([contacts.ts:395](../server/src/routes/contacts.ts) + schema cascades) — unrecoverable, behind a generic confirm. Same for company delete ([companies.ts:327](../server/src/routes/companies.ts)).

**Changes (Phase 1 — minimal):** Before delete, fetch and display counts in the confirm dialog ("This will also delete 12 conversations, 5 prep notes, 3 relationships").
**Follow-up (later, larger):** soft-delete (`deletedAt` column) so deletes are recoverable — requires schema change + Turso DDL + query filters; track separately.

**Acceptance:** The delete confirm tells the user exactly what else will be destroyed.

**Commit:** `feat(safety): show cascade impact counts before delete`

---

## Task 14 — Safer deploys (type gate + preview workflow)  ⚠️ HIGH

**Problem:** Vercel auto-deploys every push to `main` with no test/type gate ([package.json](../package.json), no CI). The only check (`prepush`) is voluntary/local. A bad commit ships straight to the only instance. Repo has zero tests.

**Changes:**
- Make the production build fail on type errors: in `build:vercel`, run `npm run typecheck` (client + server) **before** the build so a type error blocks the deploy.
- **[USER ACTION] workflow change:** stop committing directly to `main`. Work on a branch → Vercel builds a **preview URL** automatically → verify → merge to `main`. Learn where Vercel's one-click **Instant Rollback** is.
- (Optional, later) Add a tiny GitHub Actions CI that runs `npm run typecheck` on PRs.

**Acceptance:** A type error blocks the production build; a documented branch→preview→merge flow exists.

**Commit:** `chore(ci): gate production build on typecheck`

---

## Task 19 — Fix `tags` `_count` hang risk  ⚠️ HIGH  *(relocated from Phase 2 → Phase 1, 2026-06-03)*

**Problem:** [server/src/routes/tags.ts:13](../server/src/routes/tags.ts) uses the `include: { _count }` pattern CLAUDE.md explicitly warns hangs on the Turso/libsql adapter (it generates a correlated subquery). This is a **latent production stability bug** — not just hardening — which is why it has been promoted into Phase 1. Replace with client-side `.length` or a `groupBy`/raw query.

**Changes:**
- Replace the `include: { _count: { select: { contacts: true, companies: true } } }` on the `tag.findMany` list query with a non-correlated approach: either fetch the join-table rows and count client-side (`.length`), or use `prisma.contactTag.groupBy` / `prisma.companyTag.groupBy` by `tagId` and merge the counts onto the tags.
- Keep the response shape identical (each tag still reports its contact/company counts) so the client needs no change.

**Testing (local SQLite):** `GET /api/tags` returns the same shape with correct counts; confirm no `_count`/`include` correlated-subquery remains in `tags.ts`.

**Acceptance:** `tags.ts` no longer uses the `include: { _count }` pattern; `/api/tags` returns identical data and does not risk hanging the Turso adapter.

**Commit:** `fix(tags): replace _count include with groupBy to avoid Turso adapter hang`

---

# PHASE 2 — Hardening (lower urgency, still worth doing)

Brief — each is a small, self-contained task. Detail can be expanded when reached.

- **Task 15 — PWA stale-data risk.** `NetworkFirst` 1-day API cache ([client/vite.config.ts:44-55](../client/vite.config.ts)) can feed stale data to auto-save on flaky connections, overwriting newer server values. Exclude mutable record GETs from caching (or `NetworkOnly` for `/api/`), or shorten `maxAgeSeconds` and show an "offline — showing cached data" banner.
- **Task 16 — Rate limiting + smaller body limit.** Add `express-rate-limit` (global cap) and lower `express.json({ limit })` from `50mb` → ~`2mb` ([app.ts:56](../server/src/app.ts)). Closes brute-force of the password gate, scraping, OpenAI-cost abuse via `/api/linkedin`, and memory-DoS.
- **Task 17 — Error tracking (Sentry).** Add Sentry free tier to Express + React; wire into the error boundary (Task 11).
- **Task 18 — Input allow-listing.** Several write routes spread raw `req.body` into Prisma ([companies.ts:305](../server/src/routes/companies.ts), [relationships.ts:98](../server/src/routes/relationships.ts), others). Destructure only known fields to prevent mass-assignment.
- **Task 20 — Guard unguarded `JSON.parse`.** [companies.ts:244,261](../server/src/routes/companies.ts) parse `additionalCompanyIds`/`connectedCompanyIds` with no try/catch — malformed JSON 500s the request. Wrap with a `[]` default, matching the pattern used elsewhere.
- **Task 21 — Scrub JSON-array refs on company delete.** Deleting a company leaves dangling IDs in contacts' `additionalCompanyIds`/`connectedCompanyIds` (no FK on JSON strings). Reuse the merge-logic scrub on delete.
- **Task 22 — PWA update prompt.** `registerType: 'autoUpdate'` ([vite.config.ts:12](../client/vite.config.ts)) contradicts the existing update-prompt component — old bundles linger after deploys. Switch to `prompt` so [pwa-update-prompt.tsx](../client/src/components/pwa-update-prompt.tsx) works, or force reload on new SW.
- **Task 23 — Reset secondary data on contact switch.** [contact-detail.tsx:267-308](../client/src/pages/contacts/contact-detail.tsx) shows the previous contact's conversations/notes briefly when navigating between contacts. Clear secondary arrays at the top of `loadData` (or key the page on `id`).
- **Task 24 — Tighten CORS.** [app.ts:36-54](../server/src/app.ts) allows any `*.vercel.app` origin and all no-origin requests. After header-auth (Task 1), restrict to the exact prod domain + localhost.
- **Task 25 — Photo backup (optional).** Backups store only photo URLs, not bytes (images live in Vercel Blob). Lower value than text. Option: have the daily cron also snapshot/zip Blob photos periodically, or accept photos as best-effort and document it.

> **Note (2026-06-03):** Task 19 was relocated from this phase into Phase 1 (above) because the `_count` include is a live Turso-adapter hang risk, not merely a hardening nicety. Phase 2 task IDs are otherwise unchanged.

---

# Recovery Runbook

**Environment facts (verified 2026-06-03):**
- Turso: org `arobicsek` (Free plan), database `searchbook`, URL `libsql://searchbook-arobicsek.aws-us-east-2.turso.io`. Dashboard: app.turso.tech.
- Turso dashboard offers (database page): **"Download SQLite File"** (full snapshot), Branches → **"Create From Point-in-Time"** (PITR) and **"Create From Now"**, and **Configuration → "Invalidate All Tokens"** (see token rotation below).
- Vercel project `searchbook` (team `aris-projects-b1e40d05`). Prod domain `searchbook-three.vercel.app`.
- Vercel Blob backups are at `https://sv1nlcmvomldhzg3.public.blob.vercel-storage.com/backups/searchbook-backup-<ts>.json` (public URL, same store as photos).

**Fastest recovery — Turso PITR (use first if the DB is corrupted, not lost):**
- Turso dashboard → `searchbook` → Branches → **Create From Point-in-Time** → pick a timestamp before the corruption → this creates a new DB branch with that state. Point Vercel `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` at it (or promote), redeploy, verify `/api/health`. (Confirm the available PITR window in the dashboard — free tier historically ~24h.)

**Full rebuild from JSON backup (if the database is lost entirely):**
1. Create a fresh Turso database in the dashboard.
2. **Apply the schema first** — the JSON restore only INSERTs rows; it does NOT create tables. Run the DDL from [server/prisma/schema.prisma](../server/prisma/schema.prisma) against the new DB (Turso CLI needs WSL on Windows, so use the web dashboard SQL console or a small libsql script).
3. Create a token (Connect → **Create Token**, Expires **Never**, **Read & Write**), set `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` in Vercel (Production), redeploy.
4. Get the newest backup JSON — either the public Blob URL above, the Settings → "Automatic backups" list, or the OneDrive `backups/` folder.
5. Settings → **Restore from JSON File** → select the newest `searchbook-backup-*.json` (must be `_meta.version: 2` = complete, all 23 tables). NOTE (Task 7 done 2026-06-03): restore is now atomic and auto-creates a pre-restore safety export, but still don't interrupt it unnecessarily.
6. Verify via `/api/health` (`db:ok`) and spot-check counts in the app.
7. **Photos:** resolve only if Vercel Blob still exists. If Blob was lost, photos are unrecoverable (see Task 25).

**Turso token rotation procedure (Task 2; GOTCHA — Turso has no per-token delete):**
The dashboard **"Invalidate All Tokens"** (Configuration section) rotates the database keypair and kills **every** existing token at once, including any just created. So rotation is: (1) **Invalidate All Tokens**; (2) immediately **Create Token** (Connect section; Expires=Never, Read & Write) and copy it; (3) paste into Vercel `TURSO_AUTH_TOKEN` (Production) and Save; (4) redeploy (env changes need a redeploy to take effect); (5) verify data loads. Expect a ~2–3 min DB outage between steps 1 and 4 — unavoidable, fine for a single user.

**What you lose:** anything entered after the latest backup. With daily automated backups (Task 4), that window is ≤ 24h instead of weeks.

**Backup layers (target state after Phase 0):**
- **Layer 1 — Turso PITR:** ~24h "oops" recovery (verify in Task 6).
- **Layer 2 — Daily JSON → Vercel Blob:** automatic, complete, ~30-backup history (Task 4).
- **Layer 3 — Weekly manual download → OneDrive:** independent, off-platform backstop (survives loss of the Vercel/Turso account). Click "Create Backup" on a computer weekly.

---

# Quick reference — files this plan touches

| Area | Files |
|------|-------|
| Auth gate | [server/src/app.ts](../server/src/app.ts), [client/src/lib/api.ts](../client/src/lib/api.ts), [client/src/App.tsx](../client/src/App.tsx) |
| Secret leaks | [server/src/app.ts](../server/src/app.ts), [server/src/routes/backup.ts](../server/src/routes/backup.ts), [api/index.ts](../api/index.ts) |
| Backup coverage/automation | [server/src/routes/backup.ts](../server/src/routes/backup.ts), [client/src/lib/backup.ts](../client/src/lib/backup.ts), [client/src/pages/settings.tsx](../client/src/pages/settings.tsx), [vercel.json](../vercel.json) |
| Health/monitoring | [server/src/app.ts](../server/src/app.ts) |
| Concurrency/transactions | [server/src/routes/contacts.ts](../server/src/routes/contacts.ts), [companies.ts](../server/src/routes/companies.ts), [conversations.ts](../server/src/routes/conversations.ts), [prepnotes.ts](../server/src/routes/prepnotes.ts), [client/src/hooks/use-auto-save.ts](../client/src/hooks/use-auto-save.ts) |
| Tags Turso fix | [server/src/routes/tags.ts](../server/src/routes/tags.ts) |
| Frontend resilience | [client/src/pages/contacts/contact-form.tsx](../client/src/pages/contacts/contact-form.tsx), [companies/company-form.tsx](../client/src/pages/companies/company-form.tsx), [contact-detail.tsx](../client/src/pages/contacts/contact-detail.tsx), [App.tsx](../client/src/App.tsx), [main.tsx](../client/src/main.tsx), [vite.config.ts](../client/vite.config.ts) |

**Estimated effort:** Phase 0 ≈ 1–2 focused days. Phase 1 ≈ 1–2 days. Phase 2 ≈ as time allows.
