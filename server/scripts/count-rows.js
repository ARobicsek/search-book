const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../prisma/dev.db'));

const tables = ['Contact', 'Company', 'Action', 'Conversation', 'Tag', 'Idea', 'Link', 'Relationship'];
tables.forEach(t => {
  try {
    const row = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get();
    console.log(`${t}: ${row.c} rows`);
  } catch(e) {
    console.log(`${t}: error - ${e.message}`);
  }
});
db.close();
