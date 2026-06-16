// One-shot Turso migration: Task 3 (Actions/Ideas polish) — "Who owes it" people list.
// Additive ADD COLUMNs only (no table rebuild) + a backfill of the new owedByMe flag
// from the existing `direction` enum. Safe to re-run (guards on existing columns).
//
//   Action.owedByMe        BOOLEAN NOT NULL DEFAULT 1   (am *I* on the hook?)
//   Action.owerContactIds  TEXT                         (JSON array of contact ids who owe it)
//
// `direction` stays a DERIVED mirror (owedByMe && owers empty ? OWED_BY_ME : WAITING_ON_THEM)
// so the dashboard "Waiting on others" card / ?filter=waiting / badges keep working unchanged.
//
// Backup: dumps the full Action table to scripts/backups/ before any DDL.
// Usage: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/migrate-actions-owers.js
const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

const jsonSafe = (_k, v) => (typeof v === 'bigint' ? Number(v) : v);

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    console.error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN first.');
    process.exit(1);
  }
  const client = createClient({ url, authToken });
  try {
    // ── 1. Backup the Action table (the only table touched) ──────────────
    const all = await client.execute('SELECT * FROM "Action"');
    const backupDir = path.join(__dirname, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `action-backup-${stamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(all.rows, jsonSafe, 2));
    console.log(`Backup: wrote ${all.rows.length} Action rows -> ${backupPath}`);

    // ── 2. Additive ADD COLUMNs (guarded — SQLite has no ADD COLUMN IF NOT EXISTS) ──
    const info = await client.execute('PRAGMA table_info("Action")');
    const cols = new Set(info.rows.map((r) => r.name));

    if (!cols.has('owedByMe')) {
      await client.execute('ALTER TABLE "Action" ADD COLUMN "owedByMe" BOOLEAN NOT NULL DEFAULT 1');
      console.log('OK: ADD COLUMN owedByMe BOOLEAN NOT NULL DEFAULT 1');
    } else {
      console.log('SKIP: owedByMe already exists');
    }
    if (!cols.has('owerContactIds')) {
      await client.execute('ALTER TABLE "Action" ADD COLUMN "owerContactIds" TEXT');
      console.log('OK: ADD COLUMN owerContactIds TEXT');
    } else {
      console.log('SKIP: owerContactIds already exists');
    }

    // ── 3. Backfill owedByMe from the legacy direction enum ──────────────
    // Existing "waiting on them" actions become owedByMe=0 (the new default 1 already
    // covers OWED_BY_ME rows). owerContactIds stays null — we have no per-action ower
    // history, and a null list + owedByMe=0 still derives WAITING_ON_THEM unchanged.
    const upd = await client.execute(
      `UPDATE "Action" SET "owedByMe" = 0 WHERE "direction" = 'WAITING_ON_THEM'`
    );
    console.log(`Backfill: set owedByMe=0 on ${upd.rowsAffected} WAITING_ON_THEM rows`);

    // ── 4. Verify the new flag and the legacy enum stay consistent ───────
    const dist = await client.execute(
      `SELECT "direction", "owedByMe", COUNT(*) AS c
       FROM "Action" GROUP BY "direction", "owedByMe" ORDER BY "direction", "owedByMe"`
    );
    console.log('direction / owedByMe / count:');
    for (const r of dist.rows) console.log(`  ${r.direction}  owedByMe=${r.owedByMe}  ${r.c}`);

    // Any OWED_BY_ME row must have owedByMe=1; any WAITING_ON_THEM must have owedByMe=0.
    const bad = await client.execute(
      `SELECT COUNT(*) AS c FROM "Action"
       WHERE ("direction" = 'OWED_BY_ME' AND "owedByMe" <> 1)
          OR ("direction" = 'WAITING_ON_THEM' AND "owedByMe" <> 0)`
    );
    console.log(`Inconsistent rows (should be 0): ${bad.rows[0].c}`);
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
