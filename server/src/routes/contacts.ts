import { Router, Request, Response } from 'express';
import prisma from '../db';
import { deleteWithSnapshot } from '../lib/undo';
import { StaleWriteError, parseExpectedUpdatedAt, CONFLICT_MESSAGE, assertNotStale } from '../concurrency';
import { currentEmployerCompanyIds, promoteCompaniesToConnected } from '../company-status';
import { resolveExistingCompanyByName } from './duplicates';

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
        { preferredName: { contains: searchTerm } },
        { title: { contains: searchTerm } },
        { company: { name: { contains: searchTerm } } },
        { companyName: { contains: searchTerm } },
        { location: { contains: searchTerm } },
        { usefulFor: { contains: searchTerm } },
      ];
    }

    const sortDescending = sortDir !== 'asc'; // default desc
    const sortByLastOutreach = sortBy === 'lastOutreachDate';
    // Company sort needs post-query sorting because the display name is
    // coalesce(company.name, companyName) — spanning a relation + a text field.
    const sortByCompany = sortBy === 'company';
    // Any sort that requires post-query computation must fetch all rows first.
    const postQuerySort = sortByLastOutreach || sortByCompany;

    let prismaOrderBy: any = undefined;
    if (!postQuerySort && sortBy) {
      const dir = sortDescending ? 'desc' : 'asc';
      if (sortBy === 'name') prismaOrderBy = { name: dir };
      else if (sortBy === 'title') prismaOrderBy = { title: dir };
      else if (sortBy === 'ecosystem') prismaOrderBy = { ecosystem: dir };
      else if (sortBy === 'status') prismaOrderBy = { status: dir };
      else if (sortBy === 'location') prismaOrderBy = { location: dir };
      else if (sortBy === 'updatedAt') prismaOrderBy = { updatedAt: dir };
      else prismaOrderBy = { updatedAt: 'desc' };
    } else if (!postQuerySort) {
      prismaOrderBy = { updatedAt: 'desc' };
    }

    // When sorting by lastOutreachDate or company, we need to fetch all contacts
    // first, compute the derived value, sort, then paginate
    const contacts = await prisma.contact.findMany({
      where,
      select: {
        id: true,
        name: true,
        preferredName: true,
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
      orderBy: postQuerySort ? undefined : prismaOrderBy,
      take: postQuerySort ? undefined : take,
      skip: postQuerySort ? undefined : skip,
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
    }

    // Sort by effective company display name: coalesce(company.name, companyName)
    if (sortByCompany) {
      result.sort((a, b) => {
        const aName = (a.company?.name || a.companyName || '').toLowerCase();
        const bName = (b.company?.name || b.companyName || '').toLowerCase();
        // Empties sort last regardless of direction
        if (!aName && !bName) return 0;
        if (!aName) return 1;
        if (!bName) return -1;
        return sortDescending
          ? bName.localeCompare(aName)
          : aName.localeCompare(bName);
      });
    }

    if (postQuerySort) {
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
      select: { id: true, name: true, preferredName: true, title: true, company: { select: { name: true } } },
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

// POST /api/contacts/resolve-participants — bulk-resolve a pasted recipient list
// (e.g. "Tricia Elliott <telliott@x.org>; Sarah Shih <sshih@x.org>; …") into contact
// ids for the meeting participant picker. Each entry is matched to an existing contact
// by email (primary OR additionalEmails, case-insensitive) then by exact name
// (case-insensitive); unmatched entries are created (status CONNECTED, ecosystem
// NETWORK, email saved). Returns one row per input, in order, each carrying the
// resolved { id, name, preferredName, title, company, created }. `created: true` flags
// the brand-new contacts so the client can auto-clean them up if they're removed again.
router.post('/resolve-participants', async (req: Request, res: Response) => {
  try {
    const raw = Array.isArray(req.body?.people) ? req.body.people : [];
    const people = raw
      .map((p: any) => ({
        name: typeof p?.name === 'string' ? p.name.trim() : '',
        email: typeof p?.email === 'string' ? p.email.trim() : '',
      }))
      .filter((p: { name: string; email: string }) => p.name || p.email);
    if (people.length === 0) {
      res.status(400).json({ error: 'No participants to resolve' });
      return;
    }

    // Single-user app — load a lightweight id/name/email index once and match in memory.
    const all = await prisma.contact.findMany({
      select: {
        id: true, name: true, preferredName: true, title: true,
        email: true, additionalEmails: true,
        company: { select: { id: true, name: true } },
      },
    });
    type Cand = (typeof all)[number];
    const byEmail = new Map<string, Cand>();
    const byName = new Map<string, Cand>();
    const indexContact = (c: Cand) => {
      if (c.email) {
        const k = c.email.trim().toLowerCase();
        if (k && !byEmail.has(k)) byEmail.set(k, c);
      }
      if (c.additionalEmails) {
        try {
          const extra = JSON.parse(c.additionalEmails);
          if (Array.isArray(extra)) {
            for (const e of extra) {
              if (typeof e === 'string' && e.trim()) {
                const k = e.trim().toLowerCase();
                if (!byEmail.has(k)) byEmail.set(k, c);
              }
            }
          }
        } catch { /* ignore malformed additionalEmails JSON */ }
      }
      const nk = c.name.trim().toLowerCase();
      if (nk && !byName.has(nk)) byName.set(nk, c);
    };
    for (const c of all) indexContact(c);

    const shape = (c: Cand, created: boolean) => ({
      id: c.id,
      name: c.name,
      preferredName: c.preferredName ?? null,
      title: c.title ?? null,
      company: c.company ? { id: c.company.id, name: c.company.name } : null,
      created,
    });

    const results: ReturnType<typeof shape>[] = [];
    for (const p of people) {
      const emailKey = p.email.toLowerCase();
      const nameKey = p.name.toLowerCase();
      let match: Cand | undefined;
      if (emailKey) match = byEmail.get(emailKey);
      if (!match && nameKey) match = byName.get(nameKey);
      if (match) {
        results.push(shape(match, false));
        continue;
      }
      // No match — create. Derive a name from the email local-part if only an email
      // was pasted (so the contact isn't nameless).
      const newName = (p.name || (p.email ? p.email.split('@')[0] : '')).trim();
      if (!newName) continue; // nothing usable
      const createdContact = await prisma.$transaction(async (tx) => {
        const c = await tx.contact.create({
          data: { name: newName, email: p.email || null, status: 'CONNECTED', ecosystem: 'NETWORK' } as any,
          select: {
            id: true, name: true, preferredName: true, title: true,
            email: true, additionalEmails: true,
            company: { select: { id: true, name: true } },
          },
        });
        await tx.contactStatusHistory.create({
          data: { contactId: c.id, oldStatus: null, newStatus: 'CONNECTED' },
        });
        return c;
      });
      indexContact(createdContact as Cand); // a duplicate later in the same paste now matches
      results.push(shape(createdContact as Cand, true));
    }

    res.json({ results });
  } catch (error) {
    console.error('Error resolving participants:', error);
    res.status(500).json({ error: 'Failed to resolve participants' });
  }
});

// POST /api/contacts/import-match — bulk CSV import with name-based de-duplication.
//  • A row whose name matches exactly one existing contact (case-insensitive) ENRICHES that
//    contact "fill blanks only": its email is merged additively (primary if empty, else
//    additionalEmails) AND any mapped scalar field that is currently empty on the contact is
//    filled from the row. A field that already has a value is NEVER overwritten. ecosystem and
//    status are excluded entirely (create-time only). Company fills `companyId` only when the
//    contact has no current employer (no 2nd-employer append in v1).
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
      defaultEcosystem?: string;
    };
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const createUnmatched = body.createUnmatched !== false; // default true
    const dryRun = body.dryRun === true;
    // Ecosystem assigned to contacts created by this import (managers + unmatched rows).
    // Backwards-compatible default NETWORK; the dialog lets the user pick (e.g. NCQA Internal).
    const VALID_ECOSYSTEMS = new Set(['PAYER', 'PROVIDER', 'GOVERNMENT', 'ACADEMIA', 'HEALTH_TECH', 'POLICY', 'MEDIA', 'FUNDER', 'NCQA', 'NETWORK', 'RECRUITER', 'CONSULTANT']);
    const defaultEcosystem = VALID_ECOSYSTEMS.has((body.defaultEcosystem || '').trim())
      ? (body.defaultEcosystem as string).trim()
      : 'NETWORK';

    if (rows.length === 0) {
      res.status(400).json({ error: 'No rows to import' });
      return;
    }

    // Build a case-insensitive name index of existing contacts. Fill-blanks enrich needs the
    // current value of every field we might fill, so the index carries them all (incl. the large
    // notes/personalDetails text). That's acceptable here — this is a one-shot single-user import,
    // not a hot list endpoint — but still no _count (hangs the libsql adapter). The fill fields
    // are optional on the type so the synthetic/bare-contact index entries below stay terse.
    type IndexedContact = {
      id: number; name: string;
      email: string | null; additionalEmails: string | null;
      status?: string;
      companyId?: number | null; additionalCompanyIds?: string | null;
      title?: string | null; roleDescription?: string | null; phone?: string | null;
      linkedinUrl?: string | null; location?: string | null; howConnected?: string | null;
      mutualConnections?: string | null; whereFound?: string | null; openQuestions?: string | null;
      notes?: string | null; personalDetails?: string | null;
    };
    const existing = await prisma.contact.findMany({
      select: {
        id: true, name: true, status: true, email: true, additionalEmails: true,
        companyId: true, additionalCompanyIds: true,
        title: true, roleDescription: true, phone: true, linkedinUrl: true, location: true,
        howConnected: true, mutualConnections: true, whereFound: true, openQuestions: true,
        notes: true, personalDetails: true,
      },
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
      // Fill-blanks enrich reporting: total blank fields filled across all matched contacts,
      // plus a per-field breakdown (e.g. { title: 3, phone: 2 }) for the preview.
      fieldsFilled: 0,
      fieldsFilledByName: {} as Record<string, number>,
      // "Reports To" relationship import (optional — only when rows carry a reportsTo value).
      relationshipsCreated: 0,
      managersCreated: 0,           // contacts created solely because they were named as a manager
      managersCreatedNames: [] as string[],
      relationshipsSkipped: [] as { row: number; manager: string; reason: string }[],
      ambiguous: [] as { row: number; name: string; count: number }[],
      errors: [] as { row: number; message: string }[],
      preview: [] as {
        row: number;
        name: string;
        action: 'update' | 'create' | 'ambiguous' | 'skip';
        matchedName?: string;
        filled?: number;            // # of blank fields this row would fill on the matched contact
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
      // Before creating a fresh company, check whether this exact name was already
      // identified — via a prior merge — as a duplicate of an existing company (e.g.
      // a CSV row says "NCQA" after "NCQA" was merged into "National Committee for
      // Quality Assurance (NCQA)"); reuse that company instead of recreating the dup.
      const redirect = await resolveExistingCompanyByName(rawName, allCompanies);
      if (redirect) {
        companyCache.set(key, redirect.id);
        return redirect.id;
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

    // Fill-blanks patch: for each mapped scalar field present (non-empty) in the row AND
    // empty/null on the matched contact, include it. Never overwrites a non-empty field
    // (the no-clobber rule). Returns the patch plus the list of field names that were filled.
    // (Email is handled separately — additive merge — and company separately too.)
    function buildFillBlanksPatch(
      contact: IndexedContact,
      row: Record<string, string>,
    ): { patch: Record<string, unknown>; filled: string[] } {
      const patch: Record<string, unknown> = {};
      const filled: string[] = [];
      for (const f of SIMPLE_FIELDS) {
        const incoming = (row[f] || '').trim();
        if (!incoming) continue;
        const current = (((contact as Record<string, unknown>)[f] as string | null | undefined) ?? '')
          .toString()
          .trim();
        if (current) continue; // already has a value — never clobber curated data
        patch[f] = incoming;
        filled.push(f);
      }
      return { patch, filled };
    }

    // ─── "Reports To" relationship support ──────────────────────────────────
    // Each row may carry a `reportsTo` (the manager's name). We resolve the
    // manager by the same case-insensitive name index, creating a bare contact
    // when absent, then create a REPORTS_TO relationship (subject → manager).
    // Idempotent: existing REPORTS_TO pairs are never duplicated. dryRun assigns
    // negative synthetic ids so create-then-reference works in one code path.
    const wantsReportsTo = rows.some(
      (r) => (r?.reportsTo || '').trim() && (r.reportsTo as string).trim().toLowerCase() !== 'not found',
    );
    const reportsToPairs = new Set<string>(); // `${fromId}:${toId}` for existing/created REPORTS_TO edges
    if (wantsReportsTo) {
      const rels = await prisma.relationship.findMany({
        where: { type: 'REPORTS_TO' },
        select: { fromContactId: true, toContactId: true },
      });
      for (const r of rels) reportsToPairs.add(`${r.fromContactId}:${r.toContactId}`);
    }
    let syntheticSeq = -1; // dry-run placeholder ids for would-be-created contacts

    async function createBareContact(name: string): Promise<number> {
      const created = await prisma.$transaction(async (tx) => {
        const c = await tx.contact.create({
          data: { name, ecosystem: defaultEcosystem, status: 'CONNECTED' } as any,
        });
        await tx.contactStatusHistory.create({
          data: { contactId: c.id, oldStatus: null, newStatus: c.status },
        });
        return c;
      });
      byName.set(name.toLowerCase(), [{ id: created.id, name: created.name, email: created.email, additionalEmails: created.additionalEmails }]);
      return created.id;
    }

    async function processReportsTo(rowNum: number, subjectId: number, subjectKey: string, reportsToRaw: string | undefined) {
      const mgrName = (reportsToRaw || '').trim();
      if (!mgrName || mgrName.toLowerCase() === 'not found') return;
      if (mgrName.toLowerCase() === subjectKey) {
        result.relationshipsSkipped.push({ row: rowNum, manager: mgrName, reason: 'self' });
        return;
      }
      const mgrKey = mgrName.toLowerCase();
      const m = byName.get(mgrKey) || [];
      let managerId: number;
      if (m.length > 1) {
        result.relationshipsSkipped.push({ row: rowNum, manager: mgrName, reason: 'ambiguous' });
        return;
      }
      if (m.length === 1) {
        managerId = m[0].id;
      } else {
        // Manager isn't a contact yet.
        if (!createUnmatched) {
          result.relationshipsSkipped.push({ row: rowNum, manager: mgrName, reason: 'not-created' });
          return;
        }
        if (dryRun) {
          managerId = syntheticSeq--;
          byName.set(mgrKey, [{ id: managerId, name: mgrName, email: null, additionalEmails: null }]);
        } else {
          try {
            managerId = await createBareContact(mgrName);
          } catch (err) {
            result.errors.push({ row: rowNum, message: `Manager "${mgrName}": ${err instanceof Error ? err.message : 'create failed'}` });
            return;
          }
        }
        result.managersCreated++;
        result.managersCreatedNames.push(mgrName);
      }
      const pairKey = `${subjectId}:${managerId}`;
      if (reportsToPairs.has(pairKey)) return; // already exists, or created earlier in this run
      reportsToPairs.add(pairKey);
      if (!dryRun) {
        try {
          await prisma.relationship.create({ data: { fromContactId: subjectId, toContactId: managerId, type: 'REPORTS_TO' } });
        } catch (err) {
          result.errors.push({ row: rowNum, message: `Relationship → "${mgrName}": ${err instanceof Error ? err.message : 'create failed'}` });
          return;
        }
      }
      result.relationshipsCreated++;
    }

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

      // Exactly one match — ENRICH "fill blanks only": additive email merge + fill any blank
      // scalar field + fill company when there's no current employer. Curated (non-empty)
      // fields are never overwritten; ecosystem/status are never touched.
      if (matches.length === 1) {
        const match = matches[0];
        const newEmail = (row.email || '').trim();
        const emailMerge = newEmail ? buildEmailMerge(match, newEmail) : null;
        const { patch, filled } = buildFillBlanksPatch(match, row);

        // Company: fill companyId only when the contact has no current employer.
        const companyName = (row.companyName || '').trim();
        const canFillCompany = !!companyName && currentEmployerCompanyIds({
          companyId: match.companyId ?? null,
          additionalCompanyIds: match.additionalCompanyIds ?? null,
        }).length === 0;
        if (canFillCompany) filled.push('company');

        const willChange = !!emailMerge || filled.length > 0;
        result.preview.push({
          row: rowNum,
          name,
          action: willChange ? 'update' : 'skip',
          matchedName: match.name,
          filled: filled.length,
        });
        if (filled.length > 0) {
          result.fieldsFilled += filled.length;
          for (const f of filled) result.fieldsFilledByName[f] = (result.fieldsFilledByName[f] || 0) + 1;
        }

        if (willChange && !dryRun) {
          try {
            let filledCompanyId: number | null = null;
            if (canFillCompany) {
              filledCompanyId = await resolveCompany(companyName);
              if (filledCompanyId) patch.companyId = filledCompanyId;
            }
            const data: Record<string, unknown> = { ...patch, ...(emailMerge || {}) };
            if (Object.keys(data).length > 0) {
              await prisma.$transaction(async (tx) => {
                await tx.contact.update({ where: { id: match.id }, data });
                // Associating an employer with an already-connected contact promotes that
                // company to CONNECTED too (same rule as create; guarded against downgrades).
                if (filledCompanyId && match.status === 'CONNECTED') {
                  await promoteCompaniesToConnected(tx, [filledCompanyId]);
                }
              });
              result.updated++;
            }
          } catch (err) {
            result.errors.push({ row: rowNum, message: err instanceof Error ? err.message : 'Update failed' });
          }
        }
        // A matched contact can still gain a reporting relationship (this never
        // touches the contact's own fields — it only adds a Relationship row).
        await processReportsTo(rowNum, match.id, name.toLowerCase(), row.reportsTo);
        continue;
      }

      // No match.
      if (!createUnmatched) {
        result.preview.push({ row: rowNum, name, action: 'skip' });
        continue;
      }
      result.preview.push({ row: rowNum, name, action: 'create' });

      let subjectId: number;
      if (dryRun) {
        // Predict the create without writing; index a synthetic id so later rows
        // referencing this name (as a duplicate or as a manager) resolve to it.
        subjectId = syntheticSeq--;
        byName.set(name.toLowerCase(), [{ id: subjectId, name, email: null, additionalEmails: null }]);
      } else {
        try {
          const companyName = (row.companyName || '').trim();
          const companyId = companyName ? await resolveCompany(companyName) : null;

          const data: Record<string, unknown> = {
            name,
            ecosystem: (row.ecosystem || '').trim() || defaultEcosystem,
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
          subjectId = createdContact.id;
        } catch (err) {
          result.errors.push({ row: rowNum, message: err instanceof Error ? err.message : 'Create failed' });
          continue;
        }
      }

      await processReportsTo(rowNum, subjectId, name.toLowerCase(), row.reportsTo);
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
