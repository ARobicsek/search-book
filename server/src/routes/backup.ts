import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import prisma from '../db';

const router = Router();


// GET /api/backup/schema — returns table names + CREATE TABLE DDL (single fast query)
router.get('/schema', async (_req: Request, res: Response) => {
  try {
    const tables = await prisma.$queryRawUnsafe<{ name: string; sql: string }[]>(
      `SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE '_prisma%' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    );
    res.json(tables);
  } catch (error) {
    console.error('Backup schema error:', error);
    res.status(500).json({ error: 'Failed to fetch schema' });
  }
});

// GET /api/backup/data/:tableName — returns all rows from a single table
router.get('/data/:tableName', async (req: Request, res: Response) => {
  try {
    // Whitelist: only allow names returned by sqlite_master to prevent injection
    const tables = await prisma.$queryRawUnsafe<{ name: string }[]>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_prisma%' AND name NOT LIKE 'sqlite_%'`
    );
    const allowed = tables.map((t) => t.name);
    const tableName = req.params.tableName as string;
    if (!allowed.includes(tableName)) {
      res.status(400).json({ error: 'Invalid table name' });
      return;
    }
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM "${tableName}"`
    );
    res.json(rows);
  } catch (error) {
    console.error('Backup data error:', error);
    res.status(500).json({ error: 'Failed to fetch table data' });
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
