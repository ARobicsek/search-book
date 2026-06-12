import { Router, Request, Response } from 'express';
import prisma from '../db';
import { StaleWriteError, parseExpectedUpdatedAt, CONFLICT_MESSAGE } from '../concurrency';

const router = Router();

// Task 18: explicit allow-list of client-writable Company fields. Prevents
// mass-assignment — only these are copied from req.body into Prisma (never id,
// createdAt, updatedAt, or unknown keys). `status` drives status-history logic.
const COMPANY_WRITABLE_FIELDS = [
  'name', 'industry', 'size', 'website', 'hqLocation', 'notes', 'status',
] as const;

function pickWritable<T extends readonly string[]>(
  body: Record<string, unknown>,
  fields: T,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of fields) {
    if (key in body) out[key] = body[key];
  }
  return out;
}

// Task 20: parse a JSON-array string defensively. Malformed JSON (e.g. a row
// hand-edited or corrupted) must not 500 the request — fall back to [].
function safeParseArray(value: string | null | undefined): any[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// GET /api/companies/names — lightweight list of just id/name (no _count subquery)
router.get('/names', async (_req: Request, res: Response) => {
  try {
    const companies = await prisma.company.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    res.json(companies);
  } catch (error) {
    console.error('Error fetching company names:', error);
    res.status(500).json({ error: 'Failed to fetch company names' });
  }
});

// GET /api/companies — list for table view
router.get('/', async (_req: Request, res: Response) => {
  try {
    const companies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        industry: true,
        size: true,
        hqLocation: true,
        status: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(companies);
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// GET /api/companies/:id — single company with linked contacts
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const companyId = parseInt(req.params.id as string);
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    // Find contacts linked to this company
    // Either primary companyId, or in additionalCompanyIds, or in connectedCompanyIds
    const allContacts = await prisma.contact.findMany({
      where: {
        OR: [
          { companyId: companyId },
          { additionalCompanyIds: { contains: `"${companyId}"` } }, // Simple substring match works for JSON arrays of objects/strings in SQLite
          { additionalCompanyIds: { contains: `${companyId}` } },   // legacy format fallback
          { connectedCompanyIds: { contains: `${companyId}` } },    // Simple substring match for array of numbers
        ]
      },
      select: {
        id: true,
        name: true,
        title: true,
        ecosystem: true,
        status: true,
        companyId: true,
        additionalCompanyIds: true,
        connectedCompanyIds: true,
      }
    });

    // We can confidently split these into Employed vs Connected
    const employedContacts: typeof allContacts = [];
    const connectedContacts: typeof allContacts = [];

    for (const c of allContacts) {
      let isEmployed = false;
      let isConnected = false;

      if (c.companyId === companyId) {
        isEmployed = true;
      } else if (c.additionalCompanyIds) {
        try {
          const parsed = JSON.parse(c.additionalCompanyIds);
          if (Array.isArray(parsed) && parsed.some(item =>
            (typeof item === 'object' && item.id === companyId) ||
            (item === companyId)
          )) {
            isEmployed = true;
          }
        } catch { /* ignore parse error */ }
      }

      if (c.connectedCompanyIds) {
        try {
          const parsed = JSON.parse(c.connectedCompanyIds);
          if (Array.isArray(parsed) && parsed.includes(companyId)) {
            isConnected = true;
          }
        } catch { /* ignore parse error */ }
      }

      if (isEmployed) employedContacts.push(c);
      if (isConnected) connectedContacts.push(c);
    }

    // Past contacts — anyone with an EmploymentHistory row pointing at this
    // company. We exclude anyone already in `employedContacts` so a contact
    // who is currently employed AND has a past role at the same company
    // doesn't double-list (they'll appear under "Employed").
    const employedIds = new Set(employedContacts.map(c => c.id));
    const employmentHistoryRows = await prisma.employmentHistory.findMany({
      where: { companyId: companyId },
      select: {
        title: true,
        contact: {
          select: { id: true, name: true, title: true, ecosystem: true, status: true },
        },
      },
    });
    const pastContactsMap = new Map<number, {
      id: number;
      name: string;
      title: string | null;
      ecosystem: string;
      status: string;
      pastTitle: string | null;
    }>();
    for (const row of employmentHistoryRows) {
      if (!row.contact) continue;
      if (employedIds.has(row.contact.id)) continue;
      // De-dupe contacts who appear in multiple history rows for the same company
      // (e.g. nested roles at Harvard). Keep the first encountered title for display.
      if (!pastContactsMap.has(row.contact.id)) {
        pastContactsMap.set(row.contact.id, {
          ...row.contact,
          pastTitle: row.title ?? null,
        });
      }
    }
    const pastContacts = Array.from(pastContactsMap.values());

    res.json({
      ...company,
      contacts: employedContacts,
      employedContacts,
      connectedContacts,
      pastContacts,
    });
  } catch (error) {
    console.error('Error fetching company:', error);
    res.status(500).json({ error: 'Failed to fetch company' });
  }
});

// POST /api/companies — create
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, ...rest } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    // Task 12: create the company and its initial status-history row atomically.
    const company = await prisma.$transaction(async (tx) => {
      const created = await tx.company.create({
        data: { name: name.trim(), ...rest },
      });
      await tx.companyStatusHistory.create({
        data: {
          companyId: created.id,
          oldStatus: null,
          newStatus: created.status,
        },
      });
      return created;
    });

    res.status(201).json(company);
  } catch (error) {
    console.error('Error creating company:', error);
    res.status(500).json({ error: 'Failed to create company' });
  }
});

// POST /api/companies/:id/contacts — Add a contact to a company
router.post('/:id/contacts', async (req: Request, res: Response) => {
  try {
    const companyId = parseInt(req.params.id as string);
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    const { contactId, contactName, type } = req.body;
    if (!type || !['EMPLOYED', 'CONNECTED'].includes(type)) {
      res.status(400).json({ error: 'Valid type (EMPLOYED or CONNECTED) is required' });
      return;
    }

    let targetContactId = contactId;

    // If a new name is provided instead of an ID, create the contact first
    if (!targetContactId && contactName) {
      if (typeof contactName !== 'string' || contactName.trim().length === 0) {
        res.status(400).json({ error: 'Valid contactName is required when contactId is not provided' });
        return;
      }
      const newContact = await prisma.contact.create({
        data: {
          name: contactName.trim(),
          status: 'CONNECTED',
          ecosystem: 'NETWORK'
        }
      });
      targetContactId = newContact.id;
    } else if (!targetContactId) {
      res.status(400).json({ error: 'Either contactId or contactName is required' });
      return;
    }

    // Fetch the existing contact
    const contact = await prisma.contact.findUnique({ where: { id: parseInt(targetContactId) } });
    if (!contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    // Prepare update data based on relationship type
    const updateData: any = {};

    if (type === 'EMPLOYED') {
      // Logic for adding to employment
      if (!contact.companyId) {
        // If entirely empty, set as primary
        updateData.companyId = companyId;
      } else {
        // Otherwise append to additionalCompanyIds securely
        const currentAdditional = safeParseArray(contact.additionalCompanyIds);

        // Ensure we don't duplicate
        const isAlreadyEmployed = contact.companyId === companyId ||
          (currentAdditional.some((c: any) =>
            (typeof c === 'object' && c.id === companyId) || c === companyId
          ));

        if (!isAlreadyEmployed) {
          currentAdditional.push({ id: companyId, isCurrent: true });
          updateData.additionalCompanyIds = JSON.stringify(currentAdditional);
        }
      }
    } else if (type === 'CONNECTED') {
      // Logic for adding to connected array
      const currentConnected = safeParseArray(contact.connectedCompanyIds);

      if (!currentConnected.includes(companyId)) {
        currentConnected.push(companyId);
        updateData.connectedCompanyIds = JSON.stringify(currentConnected);
      }
    }

    // Apply the update if we mutated anything
    if (Object.keys(updateData).length > 0) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: updateData
      });
    }

    res.status(200).json({ success: true, contactId: contact.id });
  } catch (error) {
    console.error('Error linking contact to company:', error);
    res.status(500).json({ error: 'Failed to link contact to company' });
  }
});

// PUT /api/companies/:id — update
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }
    if (req.body.name !== undefined) {
      if (typeof req.body.name !== 'string' || req.body.name.trim().length === 0) {
        res.status(400).json({ error: 'Name cannot be empty' });
        return;
      }
      req.body.name = req.body.name.trim();
    }
    // Task 8: optimistic-concurrency guard (only when the client sends _expectedUpdatedAt).
    const expectedUpdatedAt = parseExpectedUpdatedAt(req.body._expectedUpdatedAt);
    // Task 18: copy only allow-listed fields — ignore id/createdAt/updatedAt/unknowns.
    const data = pickWritable(req.body, COMPANY_WRITABLE_FIELDS);
    // Task 12: update the company and record any status change atomically.
    const company = await prisma.$transaction(async (tx) => {
      if (expectedUpdatedAt) {
        const guard = await tx.company.updateMany({
          where: { id, updatedAt: expectedUpdatedAt },
          data,
        });
        if (guard.count === 0) throw new StaleWriteError();
      } else {
        await tx.company.update({ where: { id }, data });
      }
      if (typeof data.status === 'string' && data.status !== existing.status) {
        await tx.companyStatusHistory.create({
          data: {
            companyId: id,
            oldStatus: existing.status,
            newStatus: data.status,
          },
        });
      }
      return tx.company.findUnique({ where: { id } });
    });

    res.json(company);
  } catch (error) {
    if (error instanceof StaleWriteError) {
      res.status(409).json({ error: CONFLICT_MESSAGE });
      return;
    }
    console.error('Error updating company:', error);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

// GET /api/companies/:id/delete-impact — counts of records a delete will affect.
// Task 13: surfaced in the delete-confirm dialog. Company prep notes (dossiers) and
// activities are cascade-deleted; employed contacts are unlinked (not deleted).
router.get('/:id/delete-impact', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const [prepNotes, activities, employedContacts] = await Promise.all([
      prisma.companyPrepNote.count({ where: { companyId: id } }),
      prisma.companyActivity.count({ where: { companyId: id } }),
      prisma.contact.count({ where: { companyId: id } }),
    ]);
    res.json({ prepNotes, activities, employedContacts });
  } catch (error) {
    console.error('Error computing company delete impact:', error);
    res.status(500).json({ error: 'Failed to compute delete impact' });
  }
});

// DELETE /api/companies/:id — hard delete
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    // Task 21: the primary `companyId` FK is SetNull'd by the DB on delete, but
    // references inside the JSON-array columns (additionalCompanyIds with
    // {id,isCurrent} objects or legacy numbers; connectedCompanyIds with numbers)
    // have no FK and would be left dangling. Scrub them, then delete, atomically.
    await prisma.$transaction(async (tx) => {
      const referencing = await tx.contact.findMany({
        where: {
          OR: [
            { additionalCompanyIds: { contains: `${id}` } },
            { connectedCompanyIds: { contains: `${id}` } },
          ],
        },
        select: { id: true, additionalCompanyIds: true, connectedCompanyIds: true },
      });

      for (const c of referencing) {
        const update: { additionalCompanyIds?: string | null; connectedCompanyIds?: string | null } = {};

        const additional = safeParseArray(c.additionalCompanyIds);
        const filteredAdditional = additional.filter((item: any) =>
          typeof item === 'object' ? item?.id !== id : item !== id
        );
        if (filteredAdditional.length !== additional.length) {
          update.additionalCompanyIds = filteredAdditional.length > 0 ? JSON.stringify(filteredAdditional) : null;
        }

        const connected = safeParseArray(c.connectedCompanyIds);
        const filteredConnected = connected.filter((item: any) => item !== id);
        if (filteredConnected.length !== connected.length) {
          update.connectedCompanyIds = filteredConnected.length > 0 ? JSON.stringify(filteredConnected) : null;
        }

        if (Object.keys(update).length > 0) {
          await tx.contact.update({ where: { id: c.id }, data: update });
        }
      }

      await tx.company.delete({ where: { id } });
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting company:', error);
    res.status(500).json({ error: 'Failed to delete company' });
  }
});

export default router;
