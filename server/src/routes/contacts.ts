import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

// GET /api/contacts — list all contacts with optional date range filter and pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const { lastOutreachFrom, lastOutreachTo, includeNoOutreach, limit, offset } = req.query;
    const includeNone = includeNoOutreach !== 'false'; // default true

    // Pagination: default 50, max 200
    const take = Math.min(parseInt(limit as string) || 50, 200);
    const skip = parseInt(offset as string) || 0;

    // First get total count for pagination info
    const total = await prisma.contact.count();

    const contacts = await prisma.contact.findMany({
      include: {
        company: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take,
      skip,
    });

    // Map to add lastOutreachDate/Precision (skip for now to improve performance)
    let result = contacts.map((c) => ({
      ...c,
      lastOutreachDate: null as string | null,
      lastOutreachDatePrecision: null as string | null,
    }));

    // Apply flagged filter if param provided
    const { flagged } = req.query;
    if (flagged === 'true') {
      result = result.filter((c) => c.flagged);
    }

    // Apply date range filter if params provided
    if (lastOutreachFrom || lastOutreachTo) {
      result = result.filter((c) => {
        if (!c.lastOutreachDate) return includeNone;
        if (lastOutreachFrom && c.lastOutreachDate < (lastOutreachFrom as string)) return false;
        if (lastOutreachTo && c.lastOutreachDate > (lastOutreachTo as string)) return false;
        return true;
      });
    }

    // Return with pagination info
    res.json({
      data: result,
      pagination: { total, limit: take, offset: skip, hasMore: skip + result.length < total },
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// GET /api/contacts/names — lightweight list of just id/name for comboboxes
router.get('/names', async (_req: Request, res: Response) => {
  try {
    const contacts = await prisma.contact.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    res.json(contacts);
  } catch (error) {
    console.error('Error fetching contact names:', error);
    res.status(500).json({ error: 'Failed to fetch contact names' });
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
    const primaryEntry = validEntries[0];
    const additionalEntries = validEntries.slice(1);

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
function processFormData(data: Record<string, unknown>): Record<string, unknown> {
  return processCompanies(processEmails(data));
}

// POST /api/contacts — create
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, ...rest } = processFormData(req.body);
    if (!name || typeof name !== 'string' || (name as string).trim().length === 0) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    const contact = await prisma.contact.create({
      data: { name: (name as string).trim(), ...rest } as any,
      include: { company: { select: { id: true, name: true } } },
    });
    res.status(201).json(contact);
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(500).json({ error: 'Failed to create contact' });
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
    if (data.name !== undefined) {
      if (typeof data.name !== 'string' || data.name.trim().length === 0) {
        res.status(400).json({ error: 'Name cannot be empty' });
        return;
      }
      data.name = data.name.trim();
    }
    const contact = await prisma.contact.update({
      where: { id },
      data,
      include: { company: { select: { id: true, name: true } } },
    });
    res.json(contact);
  } catch (error) {
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

    const actions = await Promise.all(
      contactIds.map((contactId: number) =>
        prisma.action.create({
          data: {
            title: actionData.title,
            type: actionData.type || 'OTHER',
            priority: actionData.priority || 'MEDIUM',
            dueDate: actionData.dueDate || null,
            contactId,
          },
        })
      )
    );

    // Clear flags on the contacts
    await prisma.contact.updateMany({
      where: { id: { in: contactIds } },
      data: { flagged: false },
    });

    res.status(201).json({ created: actions.length });
  } catch (error) {
    console.error('Error creating batch actions:', error);
    res.status(500).json({ error: 'Failed to create batch actions' });
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
    await prisma.contact.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

export default router;
