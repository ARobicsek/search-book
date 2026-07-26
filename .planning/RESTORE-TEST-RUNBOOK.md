# Prod → Scratch Restore Test — Runbook (Item 5)

> ✅ **RE-EXECUTED 2026-07-26 against a NETLIFY-generated backup — PASSED, including binaries.**
> Material: `searchbook-backup-2026-07-26T06-24-43.json` + `searchbook-files.zip` (238 binaries,
> 32.5 MB) + `searchbook-notes-…md`, all downloaded from https://ari-search-book.netlify.app.
> Restored into a **scratch local SQLite DB** (`server/prisma/restore-test-scratch.db`) — the
> owner's `dev.db`, `server/data/photos/`, `.env` and Turso were never touched.
>
> | Check | Result |
> |---|---|
> | Artifact audit (tables / columns / FK orphans / ZIP integrity) | 32/32 models, 0 missing columns, 0 orphans across 47 FK edges, 0 zero-byte ZIP entries |
> | Restore via `/api/backup/import` (dev Prisma path) | 200 in 0.9 s |
> | Restore via `restore-test.mjs` (mirrors browser-direct `importViaTurso`) | 32/32 tables, 5,844 rows |
> | **Round-trip diff** (re-export vs source, DateTime/bool normalised) | **62,309 field values, 0 differences** |
> | Binaries recovered from the ZIP alone | 238/238 written to disk, 238/238 served over HTTP |
> | App booted on the restored data | contacts 544 · companies 877 · meetings 348 · actions 406 · mentions 61 · analytics charts · photos + embedded screenshots render · 0 console errors |
>
> **Two defects found and fixed in the same session** (commit below):
> 1. **This harness was silently stale.** `restore-test.mjs` still listed the 27 Vercel-era tables
>    while the backup format is v7/32, so it skipped `Series`, `IdeaTag`, `ConversationMention`,
>    `DismissedDuplicate`, `DuplicateMergeRule` (364 rows) — and still printed a green "27/27 match".
>    `check-backup-coverage.mjs` now cross-checks this file as a 5th enumeration.
> 2. **There was no way to restore the binaries.** The ZIP names entries after the *source record*
>    ("Contact 42.png"), not the URL the DB points at, and nothing mapped one to the other — a
>    restore could rebuild every row and still show 238 broken images. New:
>    `server/scripts/restore-binaries-from-zip.mjs` (§Binary recovery below).
>
> ⚠ **Cutover-relevant:** 235 of the 238 binaries are still stored as absolute
> `sv1nlcmvomldhzg3.public.blob.vercel-storage.com` URLs — Phase 4 (migrate blobs + rewrite URLs)
> has not run yet, as planned. Until it does, the live Netlify app depends on Vercel Blob staying
> alive. The ZIP is a complete offline copy, so this is recoverable either way, but **do not delete
> the Vercel Blob store before Phase 4 completes.**

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

---

## Option C — full offline recovery (the "everything is gone" drill)

Options A and B leave the binaries where they are and let the restored rows keep pointing at the
cloud. That is fine for a round-trip test but does **not** prove you could rebuild from the three
downloaded files alone. This is the drill that does — executed 2026-07-26, passed.

```bash
# 1. scratch DB with the current schema (NEVER dev.db — see the CLAUDE.md CLI-path warning)
cd server && npx prisma db push --url "file:C:/dev/personal/searchbook/server/prisma/restore-test-scratch.db"

# 2. boot the app against it, on a port that isn't your normal dev server
DATABASE_URL="file:./restore-test-scratch.db" PORT=3001 npx ts-node-dev --respawn --transpile-only src/index.ts

# 3. restore the rows through the real endpoint
curl -X POST http://localhost:3001/api/backup/import -H "Content-Type: application/json" \
     --data-binary "@/path/to/searchbook-backup-<stamp>.json"

# 4. restore the BYTES from the ZIP (maps manifest.json url → the served /photos//files/ path)
node server/scripts/restore-binaries-from-zip.mjs \
     --zip "/path/to/searchbook-files.zip" --dest server/data     # --dry-run to preview

# 5. repoint absolute cloud URLs at the local copies (same script as the Phase 4 cutover step,
#    rehearsed against a file: DB instead of Turso)
node server/scripts/rewrite-blob-urls.mjs <BLOB_HOST> \
     --db "file:C:/dev/personal/searchbook/server/prisma/restore-test-scratch.db"

# 6. smoke it
node server/scripts/app-smoke.mjs
```

> Step 5 is only needed when the stored URLs are **absolute** and that host is gone. `rewrite-blob-urls.mjs`
> was written for the Netlify cutover and currently lives on the migration branch only — on `main` it
> arrives with the cutover merge, so until then either cherry-pick it or run the equivalent
> `UPDATE … SET col = REPLACE(col, 'https://<host>/', '/')` over each text column by hand. Steps 1–4 and 6
> need nothing from the migration branch.

**PASS criteria:** step 5 ends with "no rows still reference the Vercel Blob host ✅", `app-smoke`
is all ✓ (including the photo fetch), and the app renders contact photos, meeting attachments and
pasted screenshots with the cloud unreachable.

### Binary recovery — why step 4 needs a script
The JSON holds only *references*; the bytes are in the ZIP, named after the **source record**
("Contact 42.png"), not the URL. The ZIP's `manifest.json` carries the `{file, source, url}`
mapping, and `restore-binaries-from-zip.mjs` replays it into `<dest>/photos/<basename-of-url>`.
It is dependency-free (its own ZIP reader) so it runs from a bare checkout with no `npm install`.
For a Netlify restore, push the same files into Blobs with `migrate-blobs-to-netlify.mjs` instead.

### Cleanup after Option C
- `rm server/prisma/restore-test-scratch.db`
- Remove the restored binaries from `server/data/photos` · `data/files` (diff against a listing you
  take **before** step 4 — the restore is additive and your dev photos live in the same folder).

---

## Cleanup
- Delete the scratch Turso DB from the dashboard.
- If you used Option B, confirm `server/.env` Turso creds are commented out again.

## Notes
- **Options A/B don't re-upload binaries**: restored rows keep the same cloud URLs, which are shared
  with prod, so photos resolve without any binary work. That tests the round trip, not disaster
  recovery — for "the blob store is gone", use **Option C** above.
- The harness refuses to run if `--target` equals `--forbid-url`, requires `--confirm` to write,
  and only ever writes to the `--target` you pass. It never reads prod creds.
