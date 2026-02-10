import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import prisma from '../db';

const router = Router();

// GET /api/backup/credentials — return Turso credentials for browser-direct backup/restore
router.get('/credentials', (_req: Request, res: Response) => {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    res.status(404).json({ error: 'Turso credentials not configured' });
    return;
  }

  res.json({ url, authToken });
});

// GET /api/backup/export — returns all data as JSON using Prisma findMany (proven with Turso)
router.get('/export', async (_req: Request, res: Response) => {
  try {
    const [
      contacts, companies, employmentHistory, tags, contactTags, companyTags,
      conversations, conversationContacts, conversationCompanies,
      actions, actionContacts, actionCompanies,
      ideas, ideaContacts, ideaCompanies, links, prepNotes, relationships,
    ] = await Promise.all([
      prisma.contact.findMany(),
      prisma.company.findMany(),
      prisma.employmentHistory.findMany(),
      prisma.tag.findMany(),
      prisma.contactTag.findMany(),
      prisma.companyTag.findMany(),
      prisma.conversation.findMany(),
      prisma.conversationContact.findMany(),
      prisma.conversationCompany.findMany(),
      prisma.action.findMany(),
      prisma.actionContact.findMany(),
      prisma.actionCompany.findMany(),
      prisma.idea.findMany(),
      prisma.ideaContact.findMany(),
      prisma.ideaCompany.findMany(),
      prisma.link.findMany(),
      prisma.prepNote.findMany(),
      prisma.relationship.findMany(),
    ]);

    const data = {
      _meta: { exportedAt: new Date().toISOString(), version: 1 },
      Contact: contacts,
      Company: companies,
      EmploymentHistory: employmentHistory,
      Tag: tags,
      ContactTag: contactTags,
      CompanyTag: companyTags,
      Conversation: conversations,
      ConversationContact: conversationContacts,
      ConversationCompany: conversationCompanies,
      Action: actions,
      ActionContact: actionContacts,
      ActionCompany: actionCompanies,
      Idea: ideas,
      IdeaContact: ideaContacts,
      IdeaCompany: ideaCompanies,
      Link: links,
      PrepNote: prepNotes,
      Relationship: relationships,
    };

    // Handle BigInt serialization (Prisma/libsql may return BigInt for integers)
    const json = JSON.stringify(data, (_, v) => typeof v === 'bigint' ? Number(v) : v, 2);
    res.setHeader('Content-Type', 'application/json');
    res.send(json);
  } catch (error) {
    console.error('Backup export error:', error);
    res.status(500).json({ error: 'Failed to export data' });
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

// POST /api/backup/save-local — save backup JSON to project backups/ folder
router.post('/save-local', (req: Request, res: Response) => {
  try {
    // Find project root (directory containing both server/ and client/)
    const candidates = [
      path.resolve(__dirname, '..', '..', '..'),  // from server/src/routes/
      process.cwd(),                                // if cwd is project root
      path.resolve(process.cwd(), '..'),            // if cwd is server/
    ];
    const projectRoot = candidates.find(dir =>
      fs.existsSync(path.join(dir, 'server')) && fs.existsSync(path.join(dir, 'client'))
    ) || candidates[0];
    console.log('[save-local] projectRoot:', projectRoot);

    const backupsDir = path.join(projectRoot, 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    const filename = `searchbook-backup-${timestamp}.json`;
    const filePath = path.join(backupsDir, filename);

    const json = JSON.stringify(req.body, null, 2);
    fs.writeFileSync(filePath, json, 'utf-8');

    res.json({ message: 'Backup saved locally', filename, path: filePath });
  } catch (error) {
    console.error('Save local error:', error);
    res.status(500).json({ error: 'Failed to save backup locally' });
  }
});

// Transform raw backup records for Prisma compatibility.
// Browser-direct Turso export returns dates in multiple formats:
// - Unix timestamps (milliseconds): 1770157191736
// - ISO strings with timezone: "2026-02-06T16:18:17.954+00:00"
// - Raw SQLite strings: "2026-02-08 15:39:27"
// Booleans come as integers (0/1) instead of true/false.
const DATETIME_FIELDS = new Set(['createdAt', 'updatedAt']);
const BOOLEAN_FIELDS = new Set(['flagged', 'completed', 'recurring']);

function toDate(value: unknown): Date {
  if (typeof value === 'number') return new Date(value);
  const s = String(value);
  if (s.includes('T')) return new Date(s);
  return new Date(s.replace(' ', 'T') + 'Z');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformRecords(records: Record<string, unknown>[]): any[] {
  return records.map((record) => {
    const out: Record<string, unknown> = { ...record };
    for (const key of Object.keys(out)) {
      if (DATETIME_FIELDS.has(key) && out[key] != null) {
        out[key] = toDate(out[key]);
      }
      if (BOOLEAN_FIELDS.has(key)) {
        out[key] = out[key] === true || out[key] === 1;
      }
    }
    return out;
  });
}

// POST /api/backup/import — restore from a JSON backup (local dev fallback)
router.post('/import', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    if (!data || !data._meta) {
      res.status(400).json({ error: 'Invalid backup format: missing _meta' });
      return;
    }

    // Delete all data in child-first order (FK safety)
    await prisma.conversationContact.deleteMany();
    await prisma.conversationCompany.deleteMany();
    await prisma.contactTag.deleteMany();
    await prisma.companyTag.deleteMany();
    await prisma.ideaContact.deleteMany();
    await prisma.ideaCompany.deleteMany();
    await prisma.link.deleteMany();
    await prisma.prepNote.deleteMany();
    await prisma.relationship.deleteMany();
    await prisma.actionContact.deleteMany();
    await prisma.actionCompany.deleteMany();
    await prisma.action.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.employmentHistory.deleteMany();
    await prisma.idea.deleteMany();
    await prisma.tag.deleteMany();
    // Clear self-references before deleting contacts
    await prisma.contact.updateMany({ data: { referredById: null } });
    await prisma.contact.deleteMany();
    await prisma.company.deleteMany();

    // Insert in parent-first order (transformRecords handles date/boolean conversion)
    if (data.Company?.length) await prisma.company.createMany({ data: transformRecords(data.Company) });
    if (data.Contact?.length) {
      // Insert contacts without self-references first
      const contacts = transformRecords(data.Contact).map((c: any) => ({ ...c, referredById: null }));
      await prisma.contact.createMany({ data: contacts });
      // Restore self-references
      for (const c of data.Contact) {
        if (c.referredById) {
          await prisma.contact.update({ where: { id: c.id as number }, data: { referredById: c.referredById as number } });
        }
      }
    }
    if (data.Tag?.length) await prisma.tag.createMany({ data: transformRecords(data.Tag) });
    if (data.Idea?.length) await prisma.idea.createMany({ data: transformRecords(data.Idea) });
    if (data.EmploymentHistory?.length) await prisma.employmentHistory.createMany({ data: transformRecords(data.EmploymentHistory) });
    if (data.Conversation?.length) await prisma.conversation.createMany({ data: transformRecords(data.Conversation) });
    if (data.Action?.length) await prisma.action.createMany({ data: transformRecords(data.Action) });
    if (data.ActionContact?.length) await prisma.actionContact.createMany({ data: transformRecords(data.ActionContact) });
    if (data.ActionCompany?.length) await prisma.actionCompany.createMany({ data: transformRecords(data.ActionCompany) });
    if (data.ContactTag?.length) await prisma.contactTag.createMany({ data: transformRecords(data.ContactTag) });
    if (data.CompanyTag?.length) await prisma.companyTag.createMany({ data: transformRecords(data.CompanyTag) });
    if (data.ConversationContact?.length) await prisma.conversationContact.createMany({ data: transformRecords(data.ConversationContact) });
    if (data.ConversationCompany?.length) await prisma.conversationCompany.createMany({ data: transformRecords(data.ConversationCompany) });
    if (data.IdeaContact?.length) await prisma.ideaContact.createMany({ data: transformRecords(data.IdeaContact) });
    if (data.IdeaCompany?.length) await prisma.ideaCompany.createMany({ data: transformRecords(data.IdeaCompany) });
    if (data.Link?.length) await prisma.link.createMany({ data: transformRecords(data.Link) });
    if (data.PrepNote?.length) await prisma.prepNote.createMany({ data: transformRecords(data.PrepNote) });
    if (data.Relationship?.length) await prisma.relationship.createMany({ data: transformRecords(data.Relationship) });

    res.json({ message: 'Import completed successfully' });
  } catch (error: any) {
    console.error('Backup import error:', error?.message || error);
    res.status(500).json({ error: `Failed to import backup: ${error?.message || 'unknown error'}` });
  }
});

export default router;
