// One-shot migration: real Series entity for recurring meetings (D4 revised).
//
// Additive only — CREATE TABLE "Series" + two ADD COLUMNs on "Conversation"
// (seriesId FK, updatedAt). No table rebuild. Then auto-groups existing "real"
// series: any title shared by >=2 conversations becomes a Series and those rows
// get linked. One-off titled meetings stay seriesId = NULL (no series chip).
//
// Idempotent: guards every ADD COLUMN on PRAGMA table_info, backfills updatedAt
// only where NULL, and only links conversations that aren't linked yet.
//
// Dual-mode:
//   • Local SQLite (default):  node scripts/migrate-conversation-series.js
//       uses DATABASE_URL or file:./prisma/dev.db
//   • Turso (production):      TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... \
//       node scripts/migrate-conversation-series.js
const { createClient } = require('@libsql/client');

const SERIES_DDL = `CREATE TABLE IF NOT EXISTS "Series" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

async function columns(client, table) {
  const info = await client.execute(`PRAGMA table_info("${table}")`);
  return new Set(info.rows.map((r) => r.name));
}

async function main() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  const localUrl = process.env.DATABASE_URL || 'file:./prisma/dev.db';
  const client = tursoUrl
    ? createClient({ url: tursoUrl, authToken })
    : createClient({ url: localUrl });
  console.log('Target:', tursoUrl ? 'TURSO (production)' : localUrl);

  try {
    // 1. Series table (idempotent)
    await client.execute(SERIES_DDL);
    console.log('OK: Series table ensured');

    // 2. Conversation.seriesId — nullable FK, default NULL (SQLite allows the
    //    REFERENCES clause on ADD COLUMN as long as the default is NULL).
    const convCols = await columns(client, 'Conversation');
    if (!convCols.has('seriesId')) {
      await client.execute(
        'ALTER TABLE "Conversation" ADD COLUMN "seriesId" INTEGER REFERENCES "Series"("id") ON DELETE SET NULL'
      );
      console.log('OK: ADD COLUMN Conversation.seriesId');
    } else {
      console.log('SKIP: Conversation.seriesId already exists');
    }

    // 3. Conversation.updatedAt — nullable at the DB level (ALTER can't add a
    //    NOT NULL column without a constant default); backfill from createdAt so
    //    no existing row is null. Prisma's @updatedAt sets it on every write after.
    if (!convCols.has('updatedAt')) {
      await client.execute('ALTER TABLE "Conversation" ADD COLUMN "updatedAt" DATETIME');
      console.log('OK: ADD COLUMN Conversation.updatedAt');
    } else {
      console.log('SKIP: Conversation.updatedAt already exists');
    }
    const backfill = await client.execute(
      'UPDATE "Conversation" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL'
    );
    console.log(`Backfill: updatedAt set on ${backfill.rowsAffected} row(s)`);

    // 4. Auto-group real series: every title shared by >=2 still-unlinked
    //    conversations becomes a Series (named with its most-recent spelling).
    const groups = await client.execute(`
      SELECT lower(trim(title)) AS k, COUNT(*) AS c
      FROM "Conversation"
      WHERE title IS NOT NULL AND trim(title) <> '' AND seriesId IS NULL
      GROUP BY lower(trim(title))
      HAVING COUNT(*) >= 2
    `);
    let seriesCreated = 0;
    let linked = 0;
    for (const g of groups.rows) {
      const key = String(g.k);
      // Most-recent spelling of this title (date desc, then newest row first).
      const spell = await client.execute({
        sql: `SELECT trim(title) AS name FROM "Conversation"
              WHERE lower(trim(title)) = ? ORDER BY date DESC, id DESC LIMIT 1`,
        args: [key],
      });
      const name = String(spell.rows[0].name);

      // Reuse an existing Series of the same name (case-insensitive) if present.
      let found = await client.execute({
        sql: `SELECT id FROM "Series" WHERE lower(name) = ? LIMIT 1`,
        args: [key],
      });
      let seriesId;
      if (found.rows.length) {
        seriesId = Number(found.rows[0].id);
      } else {
        const ins = await client.execute({ sql: `INSERT INTO "Series" (name) VALUES (?)`, args: [name] });
        seriesId = Number(ins.lastInsertRowid);
        seriesCreated++;
      }

      const res = await client.execute({
        sql: `UPDATE "Conversation" SET seriesId = ?
              WHERE lower(trim(title)) = ? AND seriesId IS NULL`,
        args: [seriesId, key],
      });
      linked += Number(res.rowsAffected);
    }
    console.log(`Auto-group: +${seriesCreated} series, linked ${linked} conversation(s)`);

    const totalSeries = await client.execute(`SELECT COUNT(*) AS c FROM "Series"`);
    console.log('Total Series rows now:', Number(totalSeries.rows[0].c));
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
