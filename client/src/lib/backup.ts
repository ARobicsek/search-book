import { createClient, type Client, type Transaction } from '@libsql/client/web';

/** All tables in the backup, ordered parent-first for inserts. */
const TABLES_PARENT_FIRST = [
  'Company', 'Contact', 'Tag', 'Idea',
  'EmploymentHistory', 'Conversation', 'Action',
  'ContactTag', 'CompanyTag',
  'ConversationContact', 'ConversationCompany',
  'ActionContact', 'ActionCompany',
  'IdeaContact', 'IdeaCompany',
  'Link', 'PrepNote', 'Relationship',
  // Task 3: leaf children of Company/Contact/Conversation — safe to append
  // (parents already appear earlier, so inserts stay FK-safe; reverse handles deletes)
  'CompanyActivity', 'CompanyPrepNote',
  'ContactStatusHistory', 'CompanyStatusHistory',
  'ConversationParticipant',
  // NCQA Task 2.1: conversation tags (parents Conversation + Tag appear earlier)
  'ConversationTag',
] as const;

/** Reverse order for deletes (children first). */
const TABLES_CHILD_FIRST = [...TABLES_PARENT_FIRST].reverse();

export interface BackupProgress {
  phase: 'export' | 'delete' | 'import';
  table: string;
  index: number;
  total: number;
}

interface TursoCredentials {
  url: string;
  authToken: string;
}

async function fetchCredentials(): Promise<TursoCredentials | null> {
  try {
    const res = await fetch('/api/backup/credentials');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function rowToObject(columns: string[], row: Record<string, unknown>): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const col of columns) {
    const val = row[col];
    obj[col] = typeof val === 'bigint' ? Number(val) : val;
  }
  return obj;
}

/** Read every table into a backup-shaped object. Shared by export + safety export. */
async function readAllTables(
  client: Client,
  onProgress?: (progress: BackupProgress) => void
): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {
    _meta: { exportedAt: new Date().toISOString(), version: 3 },
  };

  for (let i = 0; i < TABLES_PARENT_FIRST.length; i++) {
    const table = TABLES_PARENT_FIRST[i];
    try {
      const rs = await client.execute(`SELECT * FROM "${table}"`);
      const rows = rs.rows.map((row) => rowToObject(rs.columns, row as unknown as Record<string, unknown>));
      data[table] = rows;
    } catch (err) {
      console.error(`Failed to export ${table}:`, err);
      data[table] = [];
    }
    onProgress?.({ phase: 'export', table, index: i, total: TABLES_PARENT_FIRST.length });
  }

  return data;
}

/**
 * Export all data from Turso directly via browser.
 * Returns null if Turso credentials are not available (local dev).
 */
export async function exportViaTurso(
  onProgress?: (progress: BackupProgress) => void
): Promise<Record<string, unknown> | null> {
  const creds = await fetchCredentials();
  if (!creds) return null;

  const client: Client = createClient({
    url: creds.url,
    authToken: creds.authToken,
  });

  try {
    return await readAllTables(client, onProgress);
  } finally {
    client.close();
  }
}

/**
 * Task 7: before a destructive restore, dump the CURRENT database state to a file the
 * user keeps locally. If the restore is interrupted or wrong, this file can be re-imported
 * to undo it. Throws (aborting the restore) if the snapshot can't be taken — we never wipe
 * without first securing a recovery copy.
 */
async function downloadPreRestoreSafetyExport(client: Client): Promise<void> {
  let json: string;
  try {
    const data = await readAllTables(client);
    json = JSON.stringify(data, null, 2);
  } catch (err) {
    throw new Error(
      'Pre-restore safety snapshot failed — restore aborted to protect your existing data. ' +
        ((err as Error)?.message ?? '')
    );
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `searchbook-pre-restore-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Import backup data into Turso directly via browser.
 * Returns null if Turso credentials are not available (local dev).
 */
export async function importViaTurso(
  data: Record<string, unknown>,
  onProgress?: (progress: BackupProgress) => void
): Promise<boolean | null> {
  const creds = await fetchCredentials();
  if (!creds) return null;

  const client: Client = createClient({
    url: creds.url,
    authToken: creds.authToken,
  });

  try {
    // Task 7: secure a recovery copy of the current data before touching anything.
    await downloadPreRestoreSafetyExport(client);

    // Task 7: wipe + reinsert inside a single interactive transaction so an interruption
    // (network drop, phone sleep, token expiry) rolls back to the original data rather
    // than leaving a half-wiped database.
    const tx = await client.transaction('write');
    try {
      // Delete phase: children first
      for (let i = 0; i < TABLES_CHILD_FIRST.length; i++) {
        const table = TABLES_CHILD_FIRST[i];
        // Clear self-references on Contact before deleting
        if (table === 'Contact') {
          await tx.execute('UPDATE "Contact" SET "referredById" = NULL');
        }
        await tx.execute(`DELETE FROM "${table}"`);
        onProgress?.({ phase: 'delete', table, index: i, total: TABLES_CHILD_FIRST.length });
      }

      // Insert phase: parents first
      for (let i = 0; i < TABLES_PARENT_FIRST.length; i++) {
        const table = TABLES_PARENT_FIRST[i];
        const rows = data[table] as Record<string, unknown>[] | undefined;

        if (rows?.length) {
          if (table === 'Contact') {
            // Insert contacts without self-references first, then restore them
            await insertRows(tx, table, rows.map((r) => ({ ...r, referredById: null })));
            const withRefs = rows.filter((r) => r.referredById != null);
            for (const row of withRefs) {
              await tx.execute({
                sql: `UPDATE "Contact" SET "referredById" = ? WHERE "id" = ?`,
                args: [row.referredById as number, row.id as number],
              });
            }
          } else {
            await insertRows(tx, table, rows);
          }
        }

        onProgress?.({ phase: 'import', table, index: i, total: TABLES_PARENT_FIRST.length });
      }

      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }

    return true;
  } finally {
    client.close();
  }
}

/** Batch-insert rows into a table within a transaction. Chunks to avoid oversized requests. */
async function insertRows(tx: Transaction, table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;

  const columns = Object.keys(rows[0]);
  const placeholders = columns.map(() => '?').join(', ');
  const quotedCols = columns.map((c) => `"${c}"`).join(', ');
  const sql = `INSERT INTO "${table}" (${quotedCols}) VALUES (${placeholders})`;

  // Batch in chunks of 50 to avoid oversized requests
  const CHUNK_SIZE = 50;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    await tx.batch(
      chunk.map((row) => ({
        sql,
        args: columns.map((col) => {
          const val = row[col];
          if (val === undefined || val === null) return null;
          if (typeof val === 'boolean') return val ? 1 : 0;
          return val as string | number;
        }),
      }))
    );
  }
}
