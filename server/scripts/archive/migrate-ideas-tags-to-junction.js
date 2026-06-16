// One-shot migration: Idea tags → app-wide Tag table (Ideas & Meetings polish, #3).
//
// Additive only — a single CREATE TABLE "IdeaTag" (a junction, like ContactTag),
// no ALTER of existing tables. The legacy `Idea.tags` TEXT column is kept (unused
// after this) so there's no table rebuild. Then backfills the comma-separated
// `Idea.tags` strings into Tag (findOrCreate by unique name) + IdeaTag rows.
// Idempotent: CREATE TABLE IF NOT EXISTS + INSERT OR IGNORE throughout.
//
// Dual-mode:
//   • Local SQLite (default):  node scripts/migrate-ideas-tags-to-junction.js
//       uses DATABASE_URL or file:./prisma/dev.db
//   • Turso (production):      TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... \
//       node scripts/migrate-ideas-tags-to-junction.js
const { createClient } = require('@libsql/client');

const IDEATAG_DDL = `CREATE TABLE IF NOT EXISTS "IdeaTag" (
    "ideaId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    PRIMARY KEY ("ideaId", "tagId"),
    CONSTRAINT "IdeaTag_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IdeaTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`;

async function main() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  const localUrl = process.env.DATABASE_URL || 'file:./prisma/dev.db';
  const client = tursoUrl
    ? createClient({ url: tursoUrl, authToken })
    : createClient({ url: localUrl });
  console.log('Target:', tursoUrl ? 'TURSO (production)' : localUrl);

  try {
    // 1. Create the junction table (idempotent)
    await client.execute(IDEATAG_DDL);
    console.log('OK: IdeaTag table ensured');

    // 2. Backfill the legacy comma-separated strings into Tag + IdeaTag
    const ideas = await client.execute(
      `SELECT id, tags FROM "Idea" WHERE tags IS NOT NULL AND trim(tags) <> ''`
    );
    let links = 0;
    for (const row of ideas.rows) {
      const names = [...new Set(
        String(row.tags).split(',').map((s) => s.trim()).filter(Boolean)
      )];
      for (const name of names) {
        await client.execute({ sql: `INSERT OR IGNORE INTO "Tag" (name) VALUES (?)`, args: [name] });
        const got = await client.execute({ sql: `SELECT id FROM "Tag" WHERE name = ?`, args: [name] });
        const tagId = Number(got.rows[0].id);
        const res = await client.execute({
          sql: `INSERT OR IGNORE INTO "IdeaTag" ("ideaId","tagId") VALUES (?,?)`,
          args: [Number(row.id), tagId],
        });
        if (res.rowsAffected) links++;
      }
    }
    console.log(`Backfill: ${ideas.rows.length} tagged idea(s) processed; +${links} IdeaTag link(s)`);

    const total = await client.execute(`SELECT COUNT(*) AS c FROM "IdeaTag"`);
    console.log('Total IdeaTag rows now:', Number(total.rows[0].c));
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
