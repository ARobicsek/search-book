// One-shot Turso migration: Phase 2 touch-ups (meeting prep notes + attachments).
// Additive CREATE TABLEs only — no existing rows are touched.
// Usage: set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN env vars, then `node scripts/migrate-turso-phase2-touchups.js`
const { createClient } = require('@libsql/client');

const DDL = [
  `CREATE TABLE IF NOT EXISTS "ConversationPrepNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "content" TEXT NOT NULL,
    "url" TEXT,
    "urlTitle" TEXT,
    "date" TEXT NOT NULL,
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "conversationId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationPrepNote_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "ConversationAttachment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "conversationId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationAttachment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
];

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    console.error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN first.');
    process.exit(1);
  }
  const client = createClient({ url, authToken });
  try {
    for (const sql of DDL) {
      await client.execute(sql);
      console.log('OK:', sql.slice(0, 60).replace(/\s+/g, ' ') + '...');
    }
    // Verify
    const rs = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ConversationPrepNote','ConversationAttachment') ORDER BY name"
    );
    console.log('Tables now present:', rs.rows.map((r) => r.name).join(', '));
    const count = await client.execute('SELECT COUNT(*) AS c FROM "Conversation"');
    console.log('Conversation rows (untouched):', count.rows[0].c);
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
