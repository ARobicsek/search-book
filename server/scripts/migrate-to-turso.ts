import { createClient } from '@libsql/client';
import Database from 'better-sqlite3';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in .env');
  process.exit(1);
}

// Tables in dependency order (foreign keys) - parents first
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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function migrate() {
  console.log('Connecting to local SQLite...');
  const localDb = new Database(path.join(__dirname, '../prisma/dev.db'));

  console.log('Connecting to Turso...');
  const turso = createClient({
    url: TURSO_URL!,
    authToken: TURSO_TOKEN,
  });

  // Migrate data using batch transactions
  console.log('\n--- Migrating data ---');
  for (const table of TABLES) {
    try {
      const rows = localDb.prepare(`SELECT * FROM ${table}`).all() as Record<string, any>[];

      if (rows.length === 0) {
        console.log(`  ${table}: 0 rows (skipped)`);
        continue;
      }

      // Get column names from first row
      const columns = Object.keys(rows[0]);

      // Build batch insert statements
      const statements = rows.map(row => {
        const values = columns.map(col => row[col]);
        return {
          sql: `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
          args: values,
        };
      });

      // Execute in a batch/transaction
      await turso.batch(statements, 'write');
      console.log(`✓ ${table}: ${rows.length} rows`);

      await sleep(500); // Longer delay between tables
    } catch (e: any) {
      console.error(`✗ ${table}: ${e.message}`);
    }
  }

  // Update sequences (autoincrement)
  console.log('\n--- Updating sequences ---');
  try {
    const seqRows = localDb.prepare(`SELECT * FROM sqlite_sequence`).all() as { name: string; seq: number }[];
    if (seqRows.length > 0) {
      const seqStatements = seqRows.map(row => ({
        sql: `INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES (?, ?)`,
        args: [row.name, row.seq],
      }));
      await turso.batch(seqStatements, 'write');
      console.log(`✓ Updated ${seqRows.length} sequences`);
    }
  } catch (e: any) {
    console.log(`  Sequences: ${e.message}`);
  }

  localDb.close();
  console.log('\n✅ Migration complete!');
}

migrate().catch(console.error);
