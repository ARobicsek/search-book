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
      actions, ideas, ideaContacts, ideaCompanies, links, prepNotes, relationships,
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
    await prisma.action.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.employmentHistory.deleteMany();
    await prisma.idea.deleteMany();
    await prisma.tag.deleteMany();
    // Clear self-references before deleting contacts
    await prisma.contact.updateMany({ data: { referredById: null } });
    await prisma.contact.deleteMany();
    await prisma.company.deleteMany();

    // Insert in parent-first order
    if (data.Company?.length) await prisma.company.createMany({ data: data.Company });
    if (data.Contact?.length) {
      // Insert contacts without self-references first
      const contactsWithoutRefs = data.Contact.map((c: Record<string, unknown>) => ({ ...c, referredById: null }));
      await prisma.contact.createMany({ data: contactsWithoutRefs });
      // Restore self-references
      for (const c of data.Contact) {
        if (c.referredById) {
          await prisma.contact.update({ where: { id: c.id as number }, data: { referredById: c.referredById as number } });
        }
      }
    }
    if (data.Tag?.length) await prisma.tag.createMany({ data: data.Tag });
    if (data.Idea?.length) await prisma.idea.createMany({ data: data.Idea });
    if (data.EmploymentHistory?.length) await prisma.employmentHistory.createMany({ data: data.EmploymentHistory });
    if (data.Conversation?.length) await prisma.conversation.createMany({ data: data.Conversation });
    if (data.Action?.length) await prisma.action.createMany({ data: data.Action });
    if (data.ContactTag?.length) await prisma.contactTag.createMany({ data: data.ContactTag });
    if (data.CompanyTag?.length) await prisma.companyTag.createMany({ data: data.CompanyTag });
    if (data.ConversationContact?.length) await prisma.conversationContact.createMany({ data: data.ConversationContact });
    if (data.ConversationCompany?.length) await prisma.conversationCompany.createMany({ data: data.ConversationCompany });
    if (data.IdeaContact?.length) await prisma.ideaContact.createMany({ data: data.IdeaContact });
    if (data.IdeaCompany?.length) await prisma.ideaCompany.createMany({ data: data.IdeaCompany });
    if (data.Link?.length) await prisma.link.createMany({ data: data.Link });
    if (data.PrepNote?.length) await prisma.prepNote.createMany({ data: data.PrepNote });
    if (data.Relationship?.length) await prisma.relationship.createMany({ data: data.Relationship });

    res.json({ message: 'Import completed successfully' });
  } catch (error) {
    console.error('Backup import error:', error);
    res.status(500).json({ error: 'Failed to import backup' });
  }
});

export default router;
