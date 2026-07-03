import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import prisma from '../db';

const router = Router();

// Number of automatic backups to retain in Vercel Blob.
const BACKUP_RETENTION = 30;

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Prisma/libsql may return BigInt for integers — coerce for JSON.
function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? Number(value) : value;
}

// Build the full 30-table export object. Shared by /export and /cron.
// (PushSubscription = per-device push keys and DeletedSnapshot = undo stack are
// deliberately omitted — both are ephemeral, not user content.)
// INVARIANT: every user-content model must appear here, in /import below, and in the
// client's TABLES_PARENT_FIRST. Enforced by server/scripts/check-backup-coverage.mjs
// (runs in `npm run prepush` + the Vercel build) — it fails the build on any gap.
async function buildExport() {
  const [
    contacts, companies, employmentHistory, tags, contactTags, companyTags,
    conversations, conversationContacts, conversationCompanies,
    actions, actionContacts, actionCompanies,
    ideas, ideaContacts, ideaCompanies, links, prepNotes, relationships,
    contactStatusHistory, companyStatusHistory, companyActivities,
    companyPrepNotes, conversationParticipants, conversationTags,
    conversationPrepNotes, conversationAttachments, conversationOrgs,
    conversationMentions, series, ideaTags,
    dismissedDuplicates, duplicateMergeRules,
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
    prisma.contactStatusHistory.findMany(),
    prisma.companyStatusHistory.findMany(),
    prisma.companyActivity.findMany(),
    prisma.companyPrepNote.findMany(),
    prisma.conversationParticipant.findMany(),
    prisma.conversationTag.findMany(),
    prisma.conversationPrepNote.findMany(),
    prisma.conversationAttachment.findMany(),
    prisma.conversationOrg.findMany(),
    prisma.conversationMention.findMany(),
    prisma.series.findMany(),
    prisma.ideaTag.findMany(),
    prisma.dismissedDuplicate.findMany(),
    prisma.duplicateMergeRule.findMany(),
  ]);

  return {
    _meta: { exportedAt: new Date().toISOString(), version: 7 },
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
    // Task 3: previously-missing tables (real user content + history)
    ContactStatusHistory: contactStatusHistory,
    CompanyStatusHistory: companyStatusHistory,
    CompanyActivity: companyActivities,
    CompanyPrepNote: companyPrepNotes,
    ConversationParticipant: conversationParticipants,
    // Task 2.1 (NCQA plan): conversation tags
    ConversationTag: conversationTags,
    // Phase 2 touch-ups: meeting prep notes + attachments
    ConversationPrepNote: conversationPrepNotes,
    ConversationAttachment: conversationAttachments,
    // Multi-org meetings: orgs the meeting was with (beyond the anchor companyId)
    ConversationOrg: conversationOrgs,
    // @-mentions of people inside meeting notes (derived index over the note text)
    ConversationMention: conversationMentions,
    // Recurring-meeting series (parent of Conversation.seriesId)
    Series: series,
    // Tags-on-ideas junction (shares the app-wide Tag entity)
    IdeaTag: ideaTags,
    // Duplicate-management preferences
    DismissedDuplicate: dismissedDuplicates,
    DuplicateMergeRule: duplicateMergeRules,
  };
}

// GET /api/backup/credentials — return Turso credentials for browser-direct backup/restore.
// SECURITY: this returns the live Turso URL + auth token, so it MUST stay behind the
// shared-password gate (server/src/app.ts). Never add it to the gate's exemption list.
// Residual risk: the token is exposed to the authenticated browser session during
// backup/restore — acceptable for this single-user app; documented in the hardening plan.
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
    const data = await buildExport();
    const json = JSON.stringify(data, bigintReplacer, 2);
    res.setHeader('Content-Type', 'application/json');
    res.send(json);
  } catch (error) {
    console.error('Backup export error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// GET /api/backup/cron — automated daily backup to Vercel Blob.
// EXEMPT from the global password gate (server/src/app.ts), so it self-authenticates:
// accepts either Vercel cron's `Authorization: Bearer ${CRON_SECRET}` OR the app password
// header (for the "Back up now" button). Writes the full DB export (all tables) to Blob and
// prunes to the newest BACKUP_RETENTION files. (Binaries are excluded by design — see the
// manual ZIP in Settings for photos/attachments.)
router.get('/cron', async (req: Request, res: Response) => {
  const cronSecret = process.env.CRON_SECRET;
  const appPassword = process.env.APP_PASSWORD;
  const authHeader = req.header('authorization') || '';
  const cronOk = !!cronSecret && timingSafeEqualStr(authHeader, `Bearer ${cronSecret}`);
  const pwOk = !!appPassword && timingSafeEqualStr(req.header('x-app-password') || '', appPassword);
  if (!cronOk && !pwOk) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Blob is only available where BLOB_READ_WRITE_TOKEN is set (production).
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    res.json({ ok: false, skipped: true, reason: 'Blob storage not configured (local dev)' });
    return;
  }

  try {
    const { put, list, del } = await import('@vercel/blob');
    const data = await buildExport();
    const json = JSON.stringify(data, bigintReplacer);
    // Derive the table count from the export so it can never go stale.
    const tableCount = Object.keys(data).filter((k) => k !== '_meta').length;

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const name = `backups/searchbook-backup-${stamp}.json`;
    await put(name, json, { access: 'public', contentType: 'application/json', addRandomSuffix: false });

    // Prune: keep only the newest BACKUP_RETENTION backups.
    const { blobs } = await list({ prefix: 'backups/' });
    const sorted = blobs.sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
    const toDelete = sorted.slice(BACKUP_RETENTION);
    if (toDelete.length) await del(toDelete.map((b) => b.url));

    res.json({ ok: true, name, tables: tableCount, pruned: toDelete.length });
  } catch (error: any) {
    console.error('Cron backup error:', error?.message || error);
    res.status(500).json({ error: 'Failed to write backup to Blob' });
  }
});

// GET /api/backup/list — list automatic backups in Blob (newest first), for Settings UI.
// Behind the global password gate. Returns [] in local dev (no Blob).
router.get('/list', async (_req: Request, res: Response) => {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    res.json([]);
    return;
  }
  try {
    const { list } = await import('@vercel/blob');
    const { blobs } = await list({ prefix: 'backups/' });
    const result = blobs
      .map((b) => ({
        name: b.pathname.replace(/^backups\//, ''),
        url: b.downloadUrl || b.url,
        size: b.size,
        uploadedAt: b.uploadedAt,
      }))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    res.json(result);
  } catch (error: any) {
    console.error('Backup list error:', error?.message || error);
    res.status(500).json({ error: 'Failed to list backups' });
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

    // Copy binary directories: photos (contact/company images) and files
    // (meeting attachments). Both hold bytes the DB JSON only references by path.
    for (const sub of ['photos', 'files']) {
      const srcDir = path.join(process.cwd(), 'data', sub);
      if (fs.existsSync(srcDir)) {
        fs.cpSync(srcDir, path.join(backupDir, sub), { recursive: true });
      }
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

    // Restore binary directories: photos + files (meeting attachments)
    for (const sub of ['photos', 'files']) {
      const srcDir = path.join(backupDir, sub);
      const destDir = path.join(process.cwd(), 'data', sub);
      if (fs.existsSync(srcDir)) {
        if (fs.existsSync(destDir)) {
          fs.rmSync(destDir, { recursive: true });
        }
        fs.cpSync(srcDir, destDir, { recursive: true });
      }
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
const BOOLEAN_FIELDS = new Set(['flagged', 'completed', 'recurring', 'recurringWeekdaysOnly', 'notify', 'owedByMe', 'archived']);

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

    // Task 7: wrap the entire wipe + reinsert in a transaction so an interrupted or failing
    // restore rolls back to the original data instead of leaving a half-wiped database.
    // (This is the local-dev fallback path; the production restore is browser-direct.)
    await prisma.$transaction(async (tx) => {
      // Delete all data in child-first order (FK safety)
      // Task 3: leaf children — delete before their parents (Contact/Company/Conversation)
      await tx.contactStatusHistory.deleteMany();
      await tx.companyStatusHistory.deleteMany();
      await tx.companyActivity.deleteMany();
      await tx.companyPrepNote.deleteMany();
      await tx.conversationParticipant.deleteMany();
      await tx.conversationContact.deleteMany();
      await tx.conversationCompany.deleteMany();
      await tx.conversationTag.deleteMany();
      await tx.conversationPrepNote.deleteMany();
      await tx.conversationAttachment.deleteMany();
      await tx.conversationOrg.deleteMany();
      await tx.conversationMention.deleteMany();
      await tx.contactTag.deleteMany();
      await tx.companyTag.deleteMany();
      await tx.ideaContact.deleteMany();
      await tx.ideaCompany.deleteMany();
      await tx.ideaTag.deleteMany();
      await tx.link.deleteMany();
      await tx.prepNote.deleteMany();
      await tx.relationship.deleteMany();
      await tx.actionContact.deleteMany();
      await tx.actionCompany.deleteMany();
      await tx.action.deleteMany();
      await tx.conversation.deleteMany();
      // Series is a parent of Conversation.seriesId — delete it AFTER conversations.
      await tx.series.deleteMany();
      await tx.employmentHistory.deleteMany();
      await tx.idea.deleteMany();
      await tx.tag.deleteMany();
      // Clear self-references before deleting contacts
      await tx.contact.updateMany({ data: { referredById: null } });
      await tx.contact.deleteMany();
      await tx.company.deleteMany();
      // Undo snapshots reference rows that no longer exist after a wipe — clear them.
      await tx.deletedSnapshot.deleteMany();
      // Duplicate management preferences (no FK deps)
      await tx.dismissedDuplicate.deleteMany();
      await tx.duplicateMergeRule.deleteMany();

      // Insert in parent-first order (transformRecords handles date/boolean conversion)
      if (data.Company?.length) await tx.company.createMany({ data: transformRecords(data.Company) });
      if (data.Contact?.length) {
        // Insert contacts without self-references first
        const contacts = transformRecords(data.Contact).map((c: any) => ({ ...c, referredById: null }));
        await tx.contact.createMany({ data: contacts });
        // Restore self-references via raw SQL so Prisma's @updatedAt does NOT fire —
        // otherwise every referred contact gets a fresh updatedAt on each restore.
        // (The browser-direct Turso path already uses raw UPDATE for the same reason.)
        for (const c of data.Contact) {
          if (c.referredById) {
            await tx.$executeRaw`UPDATE "Contact" SET "referredById" = ${c.referredById as number} WHERE "id" = ${c.id as number}`;
          }
        }
      }
      if (data.Tag?.length) await tx.tag.createMany({ data: transformRecords(data.Tag) });
      if (data.Idea?.length) await tx.idea.createMany({ data: transformRecords(data.Idea) });
      if (data.EmploymentHistory?.length) await tx.employmentHistory.createMany({ data: transformRecords(data.EmploymentHistory) });
      // Series must be inserted before Conversation (Conversation.seriesId → Series.id)
      if (data.Series?.length) await tx.series.createMany({ data: transformRecords(data.Series) });
      if (data.Conversation?.length) await tx.conversation.createMany({ data: transformRecords(data.Conversation) });
      if (data.Action?.length) await tx.action.createMany({ data: transformRecords(data.Action) });
      if (data.ActionContact?.length) await tx.actionContact.createMany({ data: transformRecords(data.ActionContact) });
      if (data.ActionCompany?.length) await tx.actionCompany.createMany({ data: transformRecords(data.ActionCompany) });
      if (data.ContactTag?.length) await tx.contactTag.createMany({ data: transformRecords(data.ContactTag) });
      if (data.CompanyTag?.length) await tx.companyTag.createMany({ data: transformRecords(data.CompanyTag) });
      if (data.ConversationContact?.length) await tx.conversationContact.createMany({ data: transformRecords(data.ConversationContact) });
      if (data.ConversationCompany?.length) await tx.conversationCompany.createMany({ data: transformRecords(data.ConversationCompany) });
      if (data.IdeaContact?.length) await tx.ideaContact.createMany({ data: transformRecords(data.IdeaContact) });
      if (data.IdeaCompany?.length) await tx.ideaCompany.createMany({ data: transformRecords(data.IdeaCompany) });
      // Tags-on-ideas junction (parents Idea + Tag already inserted)
      if (data.IdeaTag?.length) await tx.ideaTag.createMany({ data: transformRecords(data.IdeaTag) });
      if (data.Link?.length) await tx.link.createMany({ data: transformRecords(data.Link) });
      if (data.PrepNote?.length) await tx.prepNote.createMany({ data: transformRecords(data.PrepNote) });
      if (data.Relationship?.length) await tx.relationship.createMany({ data: transformRecords(data.Relationship) });
      // Task 3: previously-missing tables (parents already inserted above)
      if (data.ContactStatusHistory?.length) await tx.contactStatusHistory.createMany({ data: transformRecords(data.ContactStatusHistory) });
      if (data.CompanyStatusHistory?.length) await tx.companyStatusHistory.createMany({ data: transformRecords(data.CompanyStatusHistory) });
      if (data.CompanyActivity?.length) await tx.companyActivity.createMany({ data: transformRecords(data.CompanyActivity) });
      if (data.CompanyPrepNote?.length) await tx.companyPrepNote.createMany({ data: transformRecords(data.CompanyPrepNote) });
      if (data.ConversationParticipant?.length) await tx.conversationParticipant.createMany({ data: transformRecords(data.ConversationParticipant) });
      // Task 2.1 (NCQA plan): conversation tags (parents Conversation + Tag already inserted)
      if (data.ConversationTag?.length) await tx.conversationTag.createMany({ data: transformRecords(data.ConversationTag) });
      // Phase 2 touch-ups: meeting prep notes + attachments (parent Conversation already inserted)
      if (data.ConversationPrepNote?.length) await tx.conversationPrepNote.createMany({ data: transformRecords(data.ConversationPrepNote) });
      if (data.ConversationAttachment?.length) await tx.conversationAttachment.createMany({ data: transformRecords(data.ConversationAttachment) });
      // Multi-org meetings (parents Conversation + Company already inserted)
      if (data.ConversationOrg?.length) await tx.conversationOrg.createMany({ data: transformRecords(data.ConversationOrg) });
      // @-mentions (parents Conversation + Contact already inserted)
      if (data.ConversationMention?.length) await tx.conversationMention.createMany({ data: transformRecords(data.ConversationMention) });
      // Duplicate management preferences (no FK deps — safe to insert anytime)
      if (data.DismissedDuplicate?.length) await tx.dismissedDuplicate.createMany({ data: transformRecords(data.DismissedDuplicate) });
      if (data.DuplicateMergeRule?.length) await tx.duplicateMergeRule.createMany({ data: transformRecords(data.DuplicateMergeRule) });
    });

    res.json({ message: 'Import completed successfully' });
  } catch (error: any) {
    console.error('Backup import error:', error?.message || error);
    res.status(500).json({ error: `Failed to import backup: ${error?.message || 'unknown error'}` });
  }
});

export default router;
