// Run this script to add actionId column to Link table in Turso
// Usage: set TURSO_AUTH_TOKEN=your_token_here && node scripts/migrate_turso.js

const { createClient } = require('@libsql/client');

const db = createClient({
  url: 'libsql://searchbook-arobicsek.aws-us-east-2.turso.io',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function migrate() {
  if (!process.env.TURSO_AUTH_TOKEN) {
    console.error('Error: TURSO_AUTH_TOKEN environment variable is required');
    console.error('Usage: set TURSO_AUTH_TOKEN=your_token && node scripts/migrate_turso.js');
    process.exit(1);
  }

  console.log('Connecting to Turso...');

  try {
    // Check current schema
    const tableInfo = await db.execute("PRAGMA table_info(Link)");
    console.log('Current Link table columns:', tableInfo.rows.map(r => r.name));

    const hasActionId = tableInfo.rows.some(r => r.name === 'actionId');

    if (hasActionId) {
      console.log('actionId column already exists. No migration needed.');
      return;
    }

    console.log('Adding actionId column...');
    await db.execute(`
      ALTER TABLE Link ADD COLUMN actionId INTEGER REFERENCES Action(id) ON DELETE CASCADE
    `);

    console.log('Migration complete!');

    // Verify
    const newTableInfo = await db.execute("PRAGMA table_info(Link)");
    console.log('Updated Link table columns:', newTableInfo.rows.map(r => r.name));

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
