const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const db = new Database(path.join(__dirname, '../prisma/dev.db'));

// Tables in dependency order
const TABLES = [
  'Tag',
  'Company',
  'Contact',
  'EmploymentHistory',
  'ContactTag',
  'CompanyTag',
  'Conversation',
  'ConversationContact',
  'ConversationCompany',
  'Action',
  'Idea',
  'IdeaContact',
  'IdeaCompany',
  'Link',
  'PrepNote',
  'Relationship',
];

let sql = '-- SearchBook Data Export\n\n';

for (const table of TABLES) {
  const rows = db.prepare(`SELECT * FROM ${table}`).all();
  if (rows.length === 0) continue;

  sql += `-- ${table}: ${rows.length} rows\n`;

  for (const row of rows) {
    const columns = Object.keys(row);
    const values = columns.map(col => {
      const val = row[col];
      if (val === null) return 'NULL';
      if (typeof val === 'string') {
        return `'${val.replace(/'/g, "''")}'`;
      }
      return val;
    });
    sql += `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
  }
  sql += '\n';
}

// Update sequences
try {
  const seqRows = db.prepare(`SELECT * FROM sqlite_sequence`).all();
  if (seqRows.length > 0) {
    sql += '-- Update sequences\n';
    for (const row of seqRows) {
      sql += `INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('${row.name}', ${row.seq});\n`;
    }
  }
} catch (e) {
  // No sequences
}

fs.writeFileSync(path.join(__dirname, '../data_export.sql'), sql);
console.log('Exported to server/data_export.sql');
console.log(`Total SQL statements: ${sql.split('\n').filter(l => l.startsWith('INSERT')).length}`);

db.close();
