# Prod → Scratch Restore Test — Runbook (Item 5)

> ✅ **EXECUTED 2026-06-14 — PASSED.** Real prod backup (`searchbook-backup-2026-06-14T18-36-42.json`)
> restored into a scratch Turso DB (`searchbook-scratch`) via Option A: **27/27 tables match exactly
> (2,604 rows)**, relationship spot-checks resolve, **15/15 sampled Blob URLs reachable** (of 69),
> exit 0. Prod untouched (`--forbid-url` = real prod URL). Scratch DB deleted afterward. This runbook
> is retained for re-running the test against future backups.
>
> Two companion checks the same day made the proof airtight: a **read-only prod↔backup `count(*)`
> diff** (`server/scripts/prod-count-diff.mjs`) showed **all 27 tables identical to prod, delta 0**;
> and the backup was restored into a local SQLite DB and the **app was booted on it**
> (`server/scripts/app-smoke.mjs` + rendered pages) — every page/chart worked. See BACKUP-COVERAGE-AUDIT.md.

**Goal:** prove a production backup can be **fully** restored — every table, relationship, and
binary — into a *throwaway* database, **without ever touching live data.**
**Decision (owner):** restore into a **scratch Turso DB** (closest to prod) — not local SQLite.
**Pairs with:** [BACKUP-COVERAGE-AUDIT.md](BACKUP-COVERAGE-AUDIT.md) (Item 4) — this test proves it.

The harness is built and **dry-run-validated locally** (file→file: 27/27 tables matched, 544 rows,
binaries 11/11 reachable). What remains needs two things only the owner can supply:
a **scratch Turso DB** (create via the web dashboard — the CLI needs WSL) and the **prod backup
material** (downloaded from the live app, which is behind the password gate).

---

## TL;DR — who does what
- **You (owner), ~5 min, once:** do the 3 prerequisite steps below (download the prod backup,
  create a scratch Turso DB, grab your prod URL), then paste the scratch URL + token to the agent.
- **The agent:** runs one command, reads back the PASS/FAIL report, then you delete the scratch DB.

You do **not** need to touch any code or run the command yourself — just gather the 3 inputs.

---

## Owner prerequisites (gather these 3 inputs, then hand to the agent)

### 1. Download the prod backup material
On the live app **https://searchbook-three.vercel.app** → **Settings** → **Create Backup**.
Two files download to your computer — note where they land (e.g. `Downloads/`):
- `searchbook-backup-<stamp>.json`  — the full database (all 27 tables)
- `searchbook-files.zip`            — the binaries (photos + meeting attachments + pasted screenshots)

### 2. Create a throwaway ("scratch") Turso database
In the **Turso dashboard** (https://app.turso.tech — the CLI needs WSL, so use the website):
1. **Create Database** → name it `searchbook-scratch` → pick the same region as prod → Create.
2. Open the new DB → copy its **URL** — it looks like `libsql://searchbook-scratch-<org>.turso.io`.
3. **Create Token** (read & write) → copy the **auth token** (a long string).
> ⚠️ This DB gets **wiped and overwritten** by the test. That's fine — it's brand-new and you
> delete it at the end. Never reuse your prod DB here.

### 3. Find your prod Turso URL (a safety guard)
In the Turso dashboard, open your **production** DB and copy its `libsql://…` URL. The harness
**aborts** if the target ever equals this, so the test can't touch prod by mistake.

### Hand-off to the agent
Paste these to the agent next session:
- path to the downloaded `searchbook-backup-<stamp>.json`
- the **scratch** DB URL + auth token (from step 2)
- your **prod** DB URL (from step 3, for `--forbid-url`)

That's everything. The agent runs Option A below and reports the result.

---

## Option A — one command (recommended)
`server/scripts/restore-test.mjs` bootstraps the scratch schema from your local dev DB, restores
the prod JSON FK-ordered (mirrors the production `importViaTurso` path), and verifies counts,
relationships, and binary reachability.

```bash
# from repo root
node server/scripts/restore-test.mjs \
  --json   "C:/path/to/searchbook-backup-<stamp>.json" \
  --target "libsql://searchbook-scratch-<org>.turso.io" \
  --token  "<scratch auth token>" \
  --schema-from "file:./server/prisma/dev.db" \
  --forbid-url "libsql://<your-PROD-db>.turso.io" \
  --check-binaries \
  --confirm
```

- Run **without `--confirm` first** — it prints the plan (source, target, row totals) so you can
  eyeball the target before anything is written.
- `--schema-from "file:./server/prisma/dev.db"` copies the current schema (DDL) into the empty
  scratch DB. Make sure your local dev DB is on the latest schema first
  (`cd server && npx prisma db push`). If the scratch DB already has the schema, omit this flag.
- `--check-binaries` GETs a sample of the photo/attachment URLs in the backup. Because the DB
  rows keep the **same Vercel Blob URLs**, restored photos/attachments resolve straight from
  Blob — no re-upload needed. (The `searchbook-files.zip` is your offline copy for the case where
  Blob itself is lost.)

**PASS criteria:** "27/27 tables match exactly", spot-checks resolve (a meeting with its
participants/orgs/tags/prep/attachments; a contact with `additionalCompanyIds`; status history),
and the binary sample is reachable. Exit code 0 = pass.

## Option B — browser-direct (reuses the exact prod restore UI)
If you'd rather exercise the real Settings → Restore button against the scratch DB:
1. Bootstrap the scratch schema (Option A's `--schema-from` step, or apply your prod DDL).
2. In `server/.env`, temporarily set `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` to the **scratch**
   DB (so `/api/backup/credentials` points the browser-direct restore at the scratch DB).
3. `npm start`, open Settings → **Restore from Backup**, upload the prod JSON. It takes a
   pre-restore safety snapshot, then wipes + restores the scratch DB in one transaction.
4. Verify in the app: counts on each page; open a contact photo and a meeting attachment.
5. **Revert `server/.env`** (re-comment the Turso creds) so local dev points back at SQLite.

---

## Manual verification (either option)
- [ ] Per-table counts match prod (Option A automates this; Option B: compare page counts).
- [ ] Open a meeting that has participants + orgs + tags + a prep note + an attachment — all present.
- [ ] Open a contact with multiple companies (`additionalCompanyIds`) — extra orgs show.
- [ ] A contact **photo** renders (Blob URL resolves).
- [ ] A meeting **file attachment** opens (Blob URL resolves).
- [ ] Status history present (analytics transitions).

## Cleanup
- Delete the scratch Turso DB from the dashboard.
- If you used Option B, confirm `server/.env` Turso creds are commented out again.

## Notes
- **Binaries don't need re-uploading** for the test: DB rows reference Blob URLs, which are public
  and shared with prod. To test true *disaster recovery* (Blob lost), you'd re-upload from
  `searchbook-files.zip` and rewrite the URLs — out of scope for this round-trip test.
- The harness refuses to run if `--target` equals `--forbid-url`, requires `--confirm` to write,
  and only ever writes to the `--target` you pass. It never reads prod creds.
