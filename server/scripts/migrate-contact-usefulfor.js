// One-shot migration: add Contact.usefulFor (the "Useful people" feature).
//
// Dual-mode:
//   • Turso (prod): set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN, then run.
//   • Local dev:    run with no env — defaults to the libsql file URL the dev server
//                   opens (./prisma/dev.db). Safe to run with the dev server up.
//
// Purely additive (single ADD COLUMN, no table rebuild). The NULL default leaves
// every existing contact a non-"useful" person, so no backfill is needed and no
// data is touched (no backup taken). Guarded on the existing column → idempotent.
//
//   Contact.usefulFor  TEXT   (what this person could help with in future)
//
//   Usage (local):  node scripts/migrate-contact-usefulfor.js
//   Usage (Turso):  TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/migrate-contact-usefulfor.js
const { createClient } = require('@libsql/client');

async function main() {
  const turso = process.env.TURSO_DATABASE_URL;
  const config = turso
    ? { url: turso, authToken: process.env.TURSO_AUTH_TOKEN }
    : { url: 'file:./prisma/dev.db' };
  console.log(`Target: ${turso ? 'Turso (production)' : config.url}`);

  const client = createClient(config);
  try {
    // SQLite has no ADD COLUMN IF NOT EXISTS — guard on PRAGMA table_info.
    const info = await client.execute('PRAGMA table_info("Contact")');
    const cols = new Set(info.rows.map((r) => r.name));
    if (!cols.has('usefulFor')) {
      await client.execute('ALTER TABLE "Contact" ADD COLUMN "usefulFor" TEXT');
      console.log('OK: ADD COLUMN usefulFor TEXT');
    } else {
      console.log('SKIP: usefulFor already exists');
    }

    const verify = await client.execute('PRAGMA table_info("Contact")');
    const has = verify.rows.some((r) => r.name === 'usefulFor');
    console.log(has ? 'Verified: Contact.usefulFor present.' : 'ERROR: column missing after migration.');
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
