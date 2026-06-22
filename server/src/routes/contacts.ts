import { Router, Request, Response } from 'express';
import prisma from '../db';
import { deleteWithSnapshot } from '../lib/undo';
import { StaleWriteError, parseExpectedUpdatedAt, CONFLICT_MESSAGE, assertNotStale } from '../concurrency';
import { currentEmployerCompanyIds, promoteCompaniesToConnected } from '../company-status';

const router = Router();

// GET /api/contacts — list all contacts with optional filters and pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const { lastOutreachFrom, lastOutreachTo, includeNoOutreach, limit, offset, ecosystem, status, search, sortBy, sortDir } = req.query;
    const includeNone = includeNoOutreach !== 'false'; // default true

    // Pagination: default 50, max 200
    const take = Math.min(parseInt(limit as string) || 50, 200);
    const skip = parseInt(offset as string) || 0;

    // Build where clause for server-side filtering
    const { flagged, useful } = req.query;
    const where: Record<string, unknown> = {};
    if (ecosystem && ecosystem !== 'all') {
      where.ecosystem = ecosystem;
    }
    if (status && status !== 'all') {
      where.status = status;
    }
    if (flagged === 'true') {
      where.flagged = true;
    }
    // "Useful people" filter: anyone with non-empty usefulFor notes. Uses an AND
    // array so it composes with the search OR below (top-level keys are ANDed).
    if (useful === 'true') {
      where.AND = [
        { usefulFor: { not: null } },
        { usefulFor: { not: '' } },
      ];
    }
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = search.trim();
      where.OR = [
        { name: { contains: searchTerm } },
        { title: { contains: searchTerm } },
        { company: { name: { contains: searchTerm } } },
        { companyName: { contains: searchTerm } },
        { location: { contains: searchTerm } },
        { usefulFor: { contains: searchTerm } },
      ];
    }

    const sortDescending = sortDir !== 'asc'; // default desc
    const sortByLastOutreach = sortBy === 'lastOutreachDate';

    let prismaOrderBy: any = undefined;
    if (!sortByLastOutreach && sortBy) {
      const dir = sortDescending ? 'desc' : 'asc';
      if (sortBy === 'name') prismaOrderBy = { name: dir };
      else if (sortBy === 'title') prismaOrderBy = { title: dir };
      else if (sortBy === 'ecosystem') prismaOrderBy = { ecosystem: dir };
      else if (sortBy === 'status') prismaOrderBy = { status: dir };
      else if (sortBy === 'location') prismaOrderBy = { location: dir };
      else if (sortBy === 'updatedAt') prismaOrderBy = { updatedAt: dir };
      else if (sortBy === 'company') prismaOrderBy = { companyName: dir };
      else prismaOrderBy = { updatedAt: 'desc' };
    } else if (!sortByLastOutreach) {
      prismaOrderBy = { updatedAt: 'desc' };
    }

    // When sorting by lastOutreachDate, we need to fetch all contacts first,
    // compute lastOutreachDate, sort, then paginate
    const contacts = await prisma.contact.findMany({
      where,
      select: {
        id: true,
        name: true,
        title: true,
        companyId: true,
        companyName: true,
        company: { select: { id: true, name: true } },
        ecosystem: true,
        status: true,
        location: true,
        flagged: true,
        usefulFor: true,
        photoUrl: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: sortByLastOutreach ? undefined : prismaOrderBy,
      take: sortByLastOutreach ? undefined : take,
      skip: sortByLastOutreach ? undefined : skip,
    });

    // Get last outreach dates for contacts
    const contactIds = contacts.map((c) => c.id);
    const lastOutreachMap = new Map<number, { date: string; precision: string }>();

    if (contactIds.length > 0) {
      const conversations = await prisma.conversation.findMany({
        where: { contactId: { in: contactIds } },
        select: { contactId: true, date: true, datePrecision: true },
      });

      for (const conv of conversations) {
        if (conv.contactId === null) continue; // contactId is nullable; the where-in filter guarantees non-null here
        const existing = lastOutreachMap.get(conv.contactId);
        if (!existing || conv.date > existing.date) {
          lastOutreachMap.set(conv.contactId, {
            date: conv.date,
            precision: conv.datePrecision,
          });
        }
      }
    }

    // Map to add lastOutreachDate/Precision
    let result = contacts.map((c) => {
      const outreach = lastOutreachMap.get(c.id);
      return {
        ...c,
        lastOutreachDate: outreach?.date ?? null,
        lastOutreachDatePrecision: outreach?.precision ?? null,
      };
    });

    // Apply date range filter if params provided (done post-query since it uses lastOutreachDate)
    if (lastOutreachFrom || lastOutreachTo) {
      result = result.filter((c) => {
        if (!c.lastOutreachDate) return includeNone;
        if (lastOutreachFrom && c.lastOutreachDate < (lastOutreachFrom as string)) return false;
        if (lastOutreachTo && c.lastOutreachDate > (lastOutreachTo as string)) return false;
        return true;
      });
    }

    // Sort by lastOutreachDate if requested, then paginate
    if (sortByLastOutreach) {
      result.sort((a, b) => {
        if (!a.lastOutreachDate && !b.lastOutreachDate) return 0;
        if (!a.lastOutreachDate) return 1; // nulls last
        if (!b.lastOutreachDate) return -1;
        return sortDescending
          ? b.lastOutreachDate.localeCompare(a.lastOutreachDate)
          : a.lastOutreachDate.localeCompare(b.lastOutreachDate);
      });
      const total = result.length;
      result = result.slice(skip, skip + take);
      res.json({
        data: result,
        pagination: { total, limit: take, offset: skip, hasMore: skip + result.length < total },
      });
    } else {
      const total = await prisma.contact.count({ where });
      res.json({
        data: result,
        pagination: { total, limit: take, offset: skip, hasMore: skip + result.length < total },
      });
    }
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts', details: error instanceof Error ? error.message : String(error) });
  }
});

// GET /api/contacts/names — lightweight list for comboboxes. Also carries title +
// primary employer so meeting dialogs can show a hover tooltip on participant chips
// (extra fields are ignored by the plain {value,label} combobox consumers).
router.get('/names', async (_req: Request, res: Response) => {
  try {
    const contacts = await prisma.contact.findMany({
      select: { id: true, name: true, title: true, company: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(contacts);
  } catch (error) {
    console.error('Error fetching contact names:', error);
    res.status(500).json({ error: 'Failed to fetch contact names' });
  }
});

// Favorites are stored as a reserved "Favorite" tag via the existing ContactTag
// junction — no schema change, synced across devices, covered by backups.
const FAVORITE_TAG_NAME = 'Favorite';

// GET /api/contacts/favorites — id/name of favorite contacts (quick-add in meeting dialogs)
router.get('/favorites', async (_req: Request, res: Response) => {
  try {
    const contacts = await prisma.contact.findMany({
      where: { tags: { some: { tag: { name: FAVORITE_TAG_NAME } } } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    res.json(contacts);
  } catch (error) {
    console.error('Error fetching favorite contacts:', error);
    res.status(500).json({ error: 'Failed to fetch favorite contacts' });
  }
});

// PATCH /api/contacts/:id/favorite — body { favorite: boolean }
router.patch('/:id/favorite', async (req: Request, res: Response) => {
  try {
    const contactId = parseInt(req.params.id as string);
    const favorite = req.body.favorite === true;
    let tag = await prisma.tag.findUnique({ where: { name: FAVORITE_TAG_NAME } });
    if (!tag) {
      if (!favorite) {
        res.json({ id: contactId, favorite: false });
        return;
      }
      tag = await prisma.tag.create({ data: { name: FAVORITE_TAG_NAME } });
    }
    if (favorite) {
      await prisma.contactTag.upsert({
        where: { contactId_tagId: { contactId, tagId: tag.id } },
        create: { contactId, tagId: tag.id },
        update: {},
      });
    } else {
      await prisma.contactTag.deleteMany({ where: { contactId, tagId: tag.id } });
    }
    res.json({ id: contactId, favorite });
  } catch (error) {
    console.error('Error toggling favorite:', error);
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

// GET /api/contacts/without-actions — contacts with no pending actions
router.get('/without-actions', async (_req: Request, res: Response) => {
  try {
    const contacts = await prisma.contact.findMany({
      where: {
        actions: {
          none: { completed: false },
        },
      },
      include: { company: { select: { id: true, name: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(contacts);
  } catch (error) {
    console.error('Error fetching contacts without actions:', error);
    res.status(500).json({ error: 'Failed to fetch contacts without actions' });
  }
});

// GET /api/contacts/:id — single contact with details
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const contact = await prisma.contact.findUnique({
      where: { id: parseInt(req.params.id as string) },
      include: {
        company: true,
        referredBy: { select: { id: true, name: true } },
        referrals: { select: { id: true, name: true } },
        employmentHistory: {
          include: { company: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }
    res.json(contact);
  } catch (error) {
    console.error('Error fetching contact:', error);
    res.status(500).json({ error: 'Failed to fetch contact' });
  }
});

// Helper: convert emails array to email + additionalEmails fields
function processEmails(data: Record<string, unknown>): Record<string, unknown> {
  if ('emails' in data && Array.isArray(data.emails)) {
    const emails = (data.emails as string[]).filter((e) => e.trim());
    const { emails: _, ...rest } = data;
    return {
      ...rest,
      email: emails[0] || null,
      additionalEmails: emails.length > 1 ? JSON.stringify(emails.slice(1)) : null,
    };
  }
  return data;
}

// Helper: convert companyEntries array to companyId + additionalCompanyIds fields
// Supports new format: [{id: 1, isCurrent: true}] and legacy format: [1, 2, 3]
function processCompanies(data: Record<string, unknown>): Record<string, unknown> {
  // New format: companyEntries with isCurrent flag
  if ('companyEntries' in data && Array.isArray(data.companyEntries)) {
    const entries = data.companyEntries as { id: number; isCurrent: boolean }[];
    const validEntries = entries.filter((e) => typeof e.id === 'number' && e.id > 0);
    const { companyEntries: _, ...rest } = data;

    // First entry is the primary companyId
    // Logic fix: Find the first "Current" company to be the primary companyId.
    // If all are "Past", then companyId should be null.
    const primaryEntryIndex = validEntries.findIndex((e) => e.isCurrent !== false);

    let primaryEntry: { id: number; isCurrent: boolean } | undefined;
    let additionalEntries: { id: number; isCurrent: boolean }[] = [];

    if (primaryEntryIndex >= 0) {
      primaryEntry = validEntries[primaryEntryIndex];
      // All others are additional
      additionalEntries = validEntries.filter((_, idx) => idx !== primaryEntryIndex);
    } else {
      // No current company found (all are past)
      primaryEntry = undefined;
      additionalEntries = validEntries;
    }

    return {
      ...rest,
      companyId: primaryEntry?.id || null,
      additionalCompanyIds: additionalEntries.length > 0
        ? JSON.stringify(additionalEntries.map((e) => ({ id: e.id, isCurrent: e.isCurrent })))
        : null,
    };
  }

  // Legacy format: companyIds as plain array of numbers
  if ('companyIds' in data && Array.isArray(data.companyIds)) {
    const companyIds = (data.companyIds as number[]).filter((id) => typeof id === 'number' && id > 0);
    const { companyIds: _, ...rest } = data;
    return {
      ...rest,
      companyId: companyIds[0] || null,
      additionalCompanyIds: companyIds.length > 1 ? JSON.stringify(companyIds.slice(1)) : null,
    };
  }
  return data;
}

// Combined helper
export function processFormData(data: Record<string, unknown>): Record<string, unknown> {
  return processCompanies(processEmails(data));
}

// Merge a new email into a contact WITHOUT clobbering: if the contact has no primary
// email the incoming one becomes primary; otherwise it's appended to additionalEmails
// (and skipped entirely if the address is already on file, primary or additional).
// Returns the partial update payload, or null when there is nothing to change.
function buildEmailMerge(
  contact: { email: string | null; additionalEmails: string | null },
  newEmail: string,
): Record<string, unknown> | null {
  const incoming = newEmail.trim();
  if (!incoming) return null;
  const primary = (contact.email || '').trim();
  if (!primary) {
    return { email: incoming };
  }
  let additionals: string[] = [];
  if (contact.additionalEmails) {
    try {
      const parsed = JSON.parse(contact.additionalEmails);
      if (Array.isArray(parsed)) additionals = parsed.filter((e): e is string => typeof e === 'string');
    } catch {
      // malformed JSON — treat as no additional emails
    }
  }
  const onFile = [primary, ...additionals].map((e) => e.trim().toLowerCase());
  if (onFile.includes(incoming.toLowerCase())) {
    return null; // already on file — nothing to add
  }
  return { additionalEmails: JSON.stringify([...additionals, incoming]) };
}

// POST /api/contacts — create
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, ...rest } = processFormData(req.body);
    if (!name || typeof name !== 'string' || (name as string).trim().length === 0) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    // Task 12: create the contact and its initial status-history row atomically.
    const contact = await prisma.$transaction(async (tx) => {
      const created = await tx.contact.create({
        data: { name: (name as string).trim(), ...rest } as any,
        include: { company: { select: { id: true, name: true } } },
      });
      await tx.contactStatusHistory.create({
        data: {
          contactId: created.id,
          oldStatus: null,
          newStatus: created.status,
        },
      });
      // A contact created already-connected promotes their current employer(s) to CONNECTED.
      if (created.status === 'CONNECTED') {
        await promoteCompaniesToConnected(tx, currentEmployerCompanyIds(created));
      }
      return created;
    });

    res.status(201).json(contact);
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// POST /api/contacts/import-match — bulk CSV import with name-based de-duplication.
//  • A row whose name matches exactly one existing contact (case-insensitive) only has its
//    email merged in (primary if empty, else additionalEmails) — NOTHING else on that
//    contact is touched (ecosystem, status, etc. are never clobbered).
//  • A row that matches nothing is created as a new contact (default ecosystem NETWORK)
//    when createUnmatched is true; otherwise it is skipped.
//  • A row that matches MORE THAN ONE contact is ambiguous → skipped and reported.
//  • dryRun classifies every row (the import preview) without writing anything.
router.post('/import-match', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as {
      rows?: Array<Record<string, string>>;
      createUnmatched?: boolean;
      dryRun?: boolean;
    };
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const createUnmatched = body.createUnmatched !== false; // default true
    const dryRun = body.dryRun === true;

    if (rows.length === 0) {
      res.status(400).json({ error: 'No rows to import' });
      return;
    }

    // Build a case-insensitive name index of existing contacts (only the fields we need —
    // no _count, no large text fields).
    type IndexedContact = { id: number; name: string; email: string | null; additionalEmails: string | null };
    const existing = await prisma.contact.findMany({
      select: { id: true, name: true, email: true, additionalEmails: true },
    });
    const byName = new Map<string, IndexedContact[]>();
    for (const c of existing) {
      const key = c.name.trim().toLowerCase();
      const arr = byName.get(key);
      if (arr) arr.push(c);
      else byName.set(key, [c]);
    }

    const result = {
      updated: 0,
      created: 0,
      ambiguous: [] as { row: number; name: string; count: number }[],
      errors: [] as { row: number; message: string }[],
      preview: [] as {
        row: number;
        name: string;
        action: 'update' | 'create' | 'ambiguous' | 'skip';
        matchedName?: string;
      }[],
    };

    // Company find-or-create cache, only consulted for newly-created rows.
    const companyCache = new Map<string, number>();
    let allCompanies: { id: number; name: string }[] | null = null;
    async function resolveCompany(rawName: string): Promise<number | null> {
      const key = rawName.trim().toLowerCase();
      if (!key) return null;
      const cached = companyCache.get(key);
      if (cached) return cached;
      if (!allCompanies) {
        allCompanies = await prisma.company.findMany({ select: { id: true, name: true } });
      }
      const found = allCompanies.find((c) => c.name.trim().toLowerCase() === key);
      if (found) {
        companyCache.set(key, found.id);
        return found.id;
      }
      const createdCo = await prisma.company.create({
        data: { name: rawName.trim(), status: 'RESEARCHING' },
        select: { id: true },
      });
      allCompanies.push({ id: createdCo.id, name: rawName.trim() });
      companyCache.set(key, createdCo.id);
      return createdCo.id;
    }

    const SIMPLE_FIELDS = [
      'title', 'roleDescription', 'phone', 'linkedinUrl', 'location',
      'howConnected', 'mutualConnections', 'whereFound', 'openQuestions',
      'notes', 'personalDetails',
    ];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const rowNum = i + 2; // +2: the header is row 1 in the source CSV
      const name = (row.name || '').trim();
      if (!name) {
        result.errors.push({ row: rowNum, message: 'Missing name' });
        result.preview.push({ row: rowNum, name: '', action: 'skip' });
        continue;
      }
      const matches = byName.get(name.toLowerCase()) || [];

      // Ambiguous — more than one contact shares this name.
      if (matches.length > 1) {
        result.ambiguous.push({ row: rowNum, name, count: matches.length });
        result.preview.push({ row: rowNum, name, action: 'ambiguous' });
        continue;
      }

      // Exactly one match — merge the email only; never touch any other field.
      if (matches.length === 1) {
        const match = matches[0];
        const newEmail = (row.email || '').trim();
        const merge = newEmail ? buildEmailMerge(match, newEmail) : null;
        result.preview.push({
          row: rowNum,
          name,
          action: merge ? 'update' : 'skip',
          matchedName: match.name,
        });
        if (dryRun || !merge) continue;
        try {
          await prisma.contact.update({ where: { id: match.id }, data: merge });
          result.updated++;
        } catch (err) {
          result.errors.push({ row: rowNum, message: err instanceof Error ? err.message : 'Update failed' });
        }
        continue;
      }

      // No match.
      if (!createUnmatched) {
        result.preview.push({ row: rowNum, name, action: 'skip' });
        continue;
      }
      result.preview.push({ row: rowNum, name, action: 'create' });
      if (dryRun) continue;
      try {
        const companyName = (row.companyName || '').trim();
        const companyId = companyName ? await resolveCompany(companyName) : null;

        const data: Record<string, unknown> = {
          name,
          ecosystem: (row.ecosystem || '').trim() || 'NETWORK',
          status: (row.status || '').trim() || 'CONNECTED',
        };
        const email = (row.email || '').trim();
        if (email) data.email = email;
        for (const f of SIMPLE_FIELDS) {
          const v = (row[f] || '').trim();
          if (v) data[f] = v;
        }
        if (companyId) data.companyId = companyId;
        else if (companyName) data.companyName = companyName;

        const createdContact = await prisma.$transaction(async (tx) => {
          const created = await tx.contact.create({ data: data as any });
          await tx.contactStatusHistory.create({
            data: { contactId: created.id, oldStatus: null, newStatus: created.status },
          });
          if (created.status === 'CONNECTED') {
            await promoteCompaniesToConnected(tx, currentEmployerCompanyIds(created));
          }
          return created;
        });

        const linkUrl = (row.linkUrl || '').trim();
        if (linkUrl) {
          try {
            await prisma.link.create({ data: { url: linkUrl, title: linkUrl, contactId: createdContact.id } });
          } catch {
            // link is best-effort — the contact was still created
          }
        }

        // Index the new contact so a later duplicate row in the same file matches it.
        byName.set(name.toLowerCase(), [{
          id: createdContact.id,
          name: createdContact.name,
          email: createdContact.email,
          additionalEmails: createdContact.additionalEmails,
        }]);
        result.created++;
      } catch (err) {
        result.errors.push({ row: rowNum, message: err instanceof Error ? err.message : 'Create failed' });
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Error in import-match:', error);
    res.status(500).json({ error: 'Failed to import contacts' });
  }
});

// PUT /api/contacts/:id — update
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.contact.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }
    const data = processFormData(req.body) as any;
    // Task 8: optimistic-concurrency guard (only when the client sends _expectedUpdatedAt).
    const expectedUpdatedAt = parseExpectedUpdatedAt(data._expectedUpdatedAt);
    delete data._expectedUpdatedAt;
    if (data.name !== undefined) {
      if (typeof data.name !== 'string' || data.name.trim().length === 0) {
        res.status(400).json({ error: 'Name cannot be empty' });
        return;
      }
      data.name = data.name.trim();
    }
    // Task 12: update the contact and record any status change atomically.
    const contact = await prisma.$transaction(async (tx) => {
      assertNotStale(existing.updatedAt, expectedUpdatedAt);
      await tx.contact.update({ where: { id }, data });
      if (data.status && data.status !== existing.status) {
        await tx.contactStatusHistory.create({
          data: {
            contactId: id,
            oldStatus: existing.status,
            newStatus: data.status,
          },
        });
      }
      const updated = await tx.contact.findUnique({
        where: { id },
        include: { company: { select: { id: true, name: true } } },
      });
      // Newly getting connected to this contact promotes their current employer(s)
      // to CONNECTED (reads post-update company fields in case they changed too).
      if (data.status === 'CONNECTED' && existing.status !== 'CONNECTED' && updated) {
        await promoteCompaniesToConnected(tx, currentEmployerCompanyIds(updated));
      }
      return updated;
    });

    res.json(contact);
  } catch (error) {
    if (error instanceof StaleWriteError) {
      res.status(409).json({ error: CONFLICT_MESSAGE });
      return;
    }
    console.error('Error updating contact:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// PATCH /api/contacts/:id/flag — toggle flagged status
router.patch('/:id/flag', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.contact.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }
    const contact = await prisma.contact.update({
      where: { id },
      data: { flagged: !existing.flagged },
      include: { company: { select: { id: true, name: true } } },
    });
    res.json(contact);
  } catch (error) {
    console.error('Error toggling contact flag:', error);
    res.status(500).json({ error: 'Failed to toggle contact flag' });
  }
});

// POST /api/contacts/batch-action — create one action per contact
router.post('/batch-action', async (req: Request, res: Response) => {
  try {
    const { contactIds, actionData } = req.body;
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      res.status(400).json({ error: 'contactIds must be a non-empty array' });
      return;
    }
    if (!actionData || !actionData.title) {
      res.status(400).json({ error: 'actionData with title is required' });
      return;
    }

    // Task 12: create one action per contact and clear their flags atomically.
    const created = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (const contactId of contactIds as number[]) {
        await tx.action.create({
          data: {
            title: actionData.title,
            type: actionData.type || 'OTHER',
            priority: actionData.priority || 'MEDIUM',
            dueDate: actionData.dueDate || null,
            contactId,
          },
        });
        count++;
      }
      // Clear flags on the contacts
      await tx.contact.updateMany({
        where: { id: { in: contactIds } },
        data: { flagged: false },
      });
      return count;
    });

    res.status(201).json({ created });
  } catch (error) {
    console.error('Error creating batch actions:', error);
    res.status(500).json({ error: 'Failed to create batch actions' });
  }
});

// GET /api/contacts/:id/delete-impact — counts of records a delete will also destroy.
// Task 13: surfaced in the delete-confirm dialog so the user knows the blast radius.
router.get('/:id/delete-impact', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const [conversations, prepNotes, relationshipsFrom, relationshipsTo, employmentHistory] =
      await Promise.all([
        prisma.conversation.count({ where: { contactId: id } }),
        prisma.prepNote.count({ where: { contactId: id } }),
        prisma.relationship.count({ where: { fromContactId: id } }),
        prisma.relationship.count({ where: { toContactId: id } }),
        prisma.employmentHistory.count({ where: { contactId: id } }),
      ]);
    res.json({
      conversations,
      prepNotes,
      relationships: relationshipsFrom + relationshipsTo,
      employmentHistory,
    });
  } catch (error) {
    console.error('Error computing contact delete impact:', error);
    res.status(500).json({ error: 'Failed to compute delete impact' });
  }
});

// DELETE /api/contacts/:id — hard delete
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.contact.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }
    await deleteWithSnapshot('contact', id, `Contact: ${existing.name}`);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

export default router;
