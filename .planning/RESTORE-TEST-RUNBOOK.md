# Prod → Scratch Restore Test — Runbook (Item 5)

**Goal:** prove a production backup can be **fully** restored — every table, relationship, and
binary — into a *throwaway* database, **without ever touching live data.**
**Decision (owner):** restore into a **scratch Turso DB** (closest to prod) — not local SQLite.
**Pairs with:** [BACKUP-COVERAGE-AUDIT.md](BACKUP-COVERAGE-AUDIT.md) (Item 4) — this test proves it.

The harness is built and **dry-run-validated locally** (file→file: 27/27 tables matched, 544 rows,
binaries 11/11 reachable). What remains needs two things only the owner can supply:
a **scratch Turso DB** (create via the web dashboard — the CLI needs WSL) and the **prod backup
material** (downloaded from the live app, which is behind the password gate).

---

## What you need
1. **Prod backup material** — from the live app → Settings → **Create Backup**:
   - `searchbook-backup-<stamp>.json` (full DB, all 27 tables)
   - `searchbook-files.zip` (photos + meeting attachments + pasted screenshots — the binaries)
2. **A scratch Turso DB** — Turso dashboard → create a new DB (e.g. `searchbook-scratch`).
   Copy its **URL** (`libsql://searchbook-scratch-<org>.turso.io`) and an **auth token**.
3. **Your prod Turso URL** — so the harness can refuse to touch it (`--forbid-url`).

> ⚠️ The scratch DB will be **wiped and overwritten**. Use a brand-new DB you can delete after.

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
