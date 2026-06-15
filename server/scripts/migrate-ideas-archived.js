// One-shot Turso migration: UI batch — soft-archive for Ideas.
// Single additive ADD COLUMN (no table rebuild), no backfill needed: the DEFAULT 0
// makes every existing idea "active". Safe to re-run (guards on the existing column).
//
//   Idea.archived  BOOLEAN NOT NULL DEFAULT 0   (hidden from the default list/search)
//
// Backup: dumps the full Idea table to scripts/backups/ before the DDL.
// Usage: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/migrate-ideas-archived.js
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
    // ── 1. Backup the Idea table (the only table touched) ────────────────
    const all = await client.execute('SELECT * FROM "Idea"');
    const backupDir = path.join(__dirname, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `idea-backup-${stamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(all.rows, jsonSafe, 2));
    console.log(`Backup: wrote ${all.rows.length} Idea rows -> ${backupPath}`);

    // ── 2. Additive ADD COLUMN (guarded — SQLite has no ADD COLUMN IF NOT EXISTS) ──
    const info = await client.execute('PRAGMA table_info("Idea")');
    const cols = new Set(info.rows.map((r) => r.name));
    if (!cols.has('archived')) {
      await client.execute('ALTER TABLE "Idea" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT 0');
      console.log('OK: ADD COLUMN archived BOOLEAN NOT NULL DEFAULT 0');
    } else {
      console.log('SKIP: archived already exists');
    }

    // ── 3. Verify ────────────────────────────────────────────────────────
    const dist = await client.execute(
      `SELECT "archived", COUNT(*) AS c FROM "Idea" GROUP BY "archived" ORDER BY "archived"`
    );
    console.log('archived / count:');
    for (const r of dist.rows) console.log(`  archived=${r.archived}  ${r.c}`);
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
