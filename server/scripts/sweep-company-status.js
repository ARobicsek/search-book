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
    const companiesReq = await client.execute('SELECT id, status FROM "Company"');
    const companies = companiesReq.rows;

    const contactsReq = await client.execute('SELECT id, status, companyId, additionalCompanyIds FROM "Contact"');
    const contacts = contactsReq.rows;

    const connectedCompanyIds = new Set();

    for (const contact of contacts) {
      if (contact.status === 'CONNECTED') {
        if (contact.companyId) {
          connectedCompanyIds.add(Number(contact.companyId));
        }
        if (contact.additionalCompanyIds) {
          try {
            const arr = JSON.parse(contact.additionalCompanyIds);
            for (const item of arr) {
              if (item && item.id && item.isCurrent) {
                connectedCompanyIds.add(Number(item.id));
              }
            }
          } catch (e) {
            console.error('Failed to parse additionalCompanyIds for contact', contact.id, e);
          }
        }
      }
    }

    const updates = [];
    for (const company of companies) {
      const id = Number(company.id);
      const currentStatus = String(company.status);
      
      if (currentStatus === 'NONE' && connectedCompanyIds.has(id)) {
        updates.push({
          sql: 'UPDATE "Company" SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
          args: ['CONNECTED', id]
        });
      }
    }

    console.log(`Found ${updates.length} companies to update.`);
    
    if (updates.length > 0) {
      await client.batch(updates);
      console.log('Updates applied successfully.');
    }
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error('Sweep failed:', err);
  process.exit(1);
});
