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
    const findReq = await client.execute(`
      SELECT id, name, ecosystem, status 
      FROM "Contact" 
      WHERE ecosystem = 'RECRUITER' AND status IN ('RESEARCHING', 'NONE')
    `);
    
    console.log(`Found ${findReq.rows.length} contacts matching the criteria.`);
    if (findReq.rows.length > 0) {
      const deleteReq = await client.execute(`
        DELETE FROM "Contact"
        WHERE ecosystem = 'RECRUITER' AND status IN ('RESEARCHING', 'NONE')
      `);
      console.log(`Successfully deleted ${deleteReq.rowsAffected} contacts.`);
    }
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error('Delete script failed:', err);
  process.exit(1);
});
