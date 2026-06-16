// One-shot migration: ConversationParticipant.ordering — preserves the order
// participants were entered so the displayed meeting title (when untitled) is the
// FIRST participant entered, not whatever index order the DB returns.
//
// Additive ADD COLUMN (guarded), then backfills existing rows to a stable 0-based
// sequence within each conversation by rowid (≈ original insertion order).
//
// Dual-mode:
//   • Local SQLite (default):  node scripts/migrate-participant-ordering.js
//   • Turso (production):      TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... \
//       node scripts/migrate-participant-ordering.js
const { createClient } = require('@libsql/client');

async function main() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  const localUrl = process.env.DATABASE_URL || 'file:./prisma/dev.db';
  const client = tursoUrl
    ? createClient({ url: tursoUrl, authToken })
    : createClient({ url: localUrl });
  console.log('Target:', tursoUrl ? 'TURSO (production)' : localUrl);

  try {
    const info = await client.execute('PRAGMA table_info("ConversationParticipant")');
    const cols = new Set(info.rows.map((r) => r.name));
    if (!cols.has('ordering')) {
      await client.execute(
        'ALTER TABLE "ConversationParticipant" ADD COLUMN "ordering" INTEGER NOT NULL DEFAULT 0'
      );
      console.log('OK: ADD COLUMN ConversationParticipant.ordering');
    } else {
      console.log('SKIP: ConversationParticipant.ordering already exists');
    }

    // Backfill: 0-based sequence within each conversation, ordered by rowid
    // (insertion order). Idempotent — re-running recomputes the same values.
    const res = await client.execute(`
      UPDATE "ConversationParticipant"
      SET "ordering" = (
        SELECT COUNT(*) FROM "ConversationParticipant" cp2
        WHERE cp2."conversationId" = "ConversationParticipant"."conversationId"
          AND cp2.rowid < "ConversationParticipant".rowid
      )
    `);
    console.log(`Backfill: ordering set on ${res.rowsAffected} participant row(s)`);
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
