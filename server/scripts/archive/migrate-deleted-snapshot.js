// One-shot migration: create the DeletedSnapshot table (undo-last-delete feature).
//
// Dual-mode:
//   • Turso (prod): set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN, then run.
//   • Local dev:    run with no env — defaults to the libsql file URL the dev server
//                   opens (./prisma/dev.db). Safe to run with the dev server up.
//
// Purely additive (CREATE TABLE IF NOT EXISTS) — no existing data is touched, so no
// backup is taken. Idempotent.
//
//   Usage (local):  node scripts/migrate-deleted-snapshot.js
//   Usage (Turso):  TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/migrate-deleted-snapshot.js
const { createClient } = require('@libsql/client');

const DDL = `
CREATE TABLE IF NOT EXISTS "DeletedSnapshot" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "entityType" TEXT NOT NULL,
  "entityId" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

async function main() {
  const turso = process.env.TURSO_DATABASE_URL;
  const config = turso
    ? { url: turso, authToken: process.env.TURSO_AUTH_TOKEN }
    : { url: 'file:./prisma/dev.db' };
  console.log(`Target: ${turso ? 'Turso (production)' : config.url}`);

  const client = createClient(config);
  try {
    await client.execute(DDL);
    const info = await client.execute('PRAGMA table_info("DeletedSnapshot")');
    console.log('OK: DeletedSnapshot table present. Columns:');
    for (const r of info.rows) console.log(`  ${r.name} ${r.type}`);
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
