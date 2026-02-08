import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import prisma from '../db';

const router = Router();

function escapeSQL(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) return `'${value.toISOString()}'`;
  const str = String(value).replace(/'/g, "''");
  return `'${str}'`;
}

// GET /api/backup/download — download full database dump as SQL file
router.get('/download', async (_req: Request, res: Response) => {
  try {
    // Get all table schemas from sqlite_master (works with both SQLite and Turso/libsql)
    const tables = await prisma.$queryRawUnsafe<{ name: string; sql: string }[]>(
      `SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE '_prisma%' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    );

    // Fetch all table data in parallel to avoid sequential Turso round-trips
    const tableData = await Promise.all(
      tables.map(async (table) => ({
        ...table,
        rows: await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT * FROM "${table.name}"`
        ),
      }))
    );

    let output = '-- SearchBook Database Backup\n';
    output += `-- Created: ${new Date().toISOString()}\n`;
    output += '-- Usage: sqlite3 searchbook.db < this-file.sql\n\n';
    output += 'PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n\n';

    for (const table of tableData) {
      output += `-- Table: ${table.name}\n`;
      output += `DROP TABLE IF EXISTS "${table.name}";\n`;
      output += `${table.sql};\n\n`;

      for (const row of table.rows) {
        const cols = Object.keys(row);
        const vals = cols.map((c) => escapeSQL(row[c]));
        output += `INSERT INTO "${table.name}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${vals.join(', ')});\n`;
      }
      if (table.rows.length > 0) output += '\n';
    }

    output += 'COMMIT;\nPRAGMA foreign_keys=ON;\n';

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="searchbook-backup-${ts}.sql"`);
    res.send(output);
  } catch (error) {
    console.error('Backup download error:', error);
    res.status(500).json({ error: 'Failed to generate backup' });
  }
});

// GET /api/backup — list available backups
router.get('/', async (_req: Request, res: Response) => {
  try {
    const backupsDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupsDir)) {
      res.json([]);
      return;
    }

    const backups = fs
      .readdirSync(backupsDir)
      .filter((name) => name.startsWith('backup-'))
      .map((name) => {
        const stat = fs.statSync(path.join(backupsDir, name));
        return { name, created: stat.mtime.toISOString() };
      })
      .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());

    res.json(backups);
  } catch (error) {
    console.error('Error listing backups:', error);
    res.status(500).json({ error: 'Failed to list backups' });
  }
});

// POST /api/backup — create a backup
router.post('/', async (_req: Request, res: Response) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupsDir = path.join(process.cwd(), 'backups');
    const backupDir = path.join(backupsDir, `backup-${timestamp}`);

    fs.mkdirSync(backupDir, { recursive: true });

    // Copy SQLite database
    const dbPath = path.join(process.cwd(), 'prisma', 'dev.db');
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, path.join(backupDir, 'dev.db'));
    }

    // Copy WAL and SHM files if they exist (SQLite journal files)
    const walPath = dbPath + '-wal';
    const shmPath = dbPath + '-shm';
    if (fs.existsSync(walPath)) {
      fs.copyFileSync(walPath, path.join(backupDir, 'dev.db-wal'));
    }
    if (fs.existsSync(shmPath)) {
      fs.copyFileSync(shmPath, path.join(backupDir, 'dev.db-shm'));
    }

    // Copy photos directory
    const photosDir = path.join(process.cwd(), 'data', 'photos');
    if (fs.existsSync(photosDir)) {
      fs.cpSync(photosDir, path.join(backupDir, 'photos'), { recursive: true });
    }

    res.json({
      message: 'Backup created successfully',
      name: `backup-${timestamp}`,
      path: backupDir,
    });
  } catch (error) {
    console.error('Backup error:', error);
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

// POST /api/backup/restore — restore from a backup
router.post('/restore', async (req: Request, res: Response) => {
  try {
    const { backupName } = req.body;
    if (!backupName || typeof backupName !== 'string') {
      res.status(400).json({ error: 'backupName is required' });
      return;
    }

    // Sanitize path to prevent directory traversal
    const sanitized = path.basename(backupName);
    const backupDir = path.join(process.cwd(), 'backups', sanitized);

    if (!fs.existsSync(backupDir)) {
      res.status(404).json({ error: 'Backup not found' });
      return;
    }

    // Restore database
    const dbBackupPath = path.join(backupDir, 'dev.db');
    const dbPath = path.join(process.cwd(), 'prisma', 'dev.db');
    if (fs.existsSync(dbBackupPath)) {
      fs.copyFileSync(dbBackupPath, dbPath);
    }

    // Restore WAL/SHM if they exist in backup
    const walBackup = path.join(backupDir, 'dev.db-wal');
    const shmBackup = path.join(backupDir, 'dev.db-shm');
    const walPath = dbPath + '-wal';
    const shmPath = dbPath + '-shm';

    if (fs.existsSync(walBackup)) {
      fs.copyFileSync(walBackup, walPath);
    } else if (fs.existsSync(walPath)) {
      fs.unlinkSync(walPath);
    }

    if (fs.existsSync(shmBackup)) {
      fs.copyFileSync(shmBackup, shmPath);
    } else if (fs.existsSync(shmPath)) {
      fs.unlinkSync(shmPath);
    }

    // Restore photos
    const photosBackupDir = path.join(backupDir, 'photos');
    const photosDir = path.join(process.cwd(), 'data', 'photos');
    if (fs.existsSync(photosBackupDir)) {
      if (fs.existsSync(photosDir)) {
        fs.rmSync(photosDir, { recursive: true });
      }
      fs.cpSync(photosBackupDir, photosDir, { recursive: true });
    }

    res.json({ message: 'Restore completed successfully. Please restart the server.' });
  } catch (error) {
    console.error('Restore error:', error);
    res.status(500).json({ error: 'Failed to restore backup' });
  }
});

export default router;
