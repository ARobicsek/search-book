import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

const actionIncludes = {
  contact: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
  conversation: { select: { id: true, summary: true } },
  actionContacts: {
    include: { contact: { select: { id: true, name: true } } },
  },
  actionCompanies: {
    include: { company: { select: { id: true, name: true } } },
  },
};

// GET /api/actions — list all actions with optional filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, contactId, companyId, sortBy, today: clientToday } = req.query;
    // Use client's today if provided (fixes timezone issues in production)
    const today = (clientToday as string) || new Date().toLocaleDateString('en-CA');

    // Build where clause from query params
    const where: Record<string, unknown> = {};

    if (contactId) {
      const cId = parseInt(contactId as string);
      where.OR = [
        { contactId: cId },
        { actionContacts: { some: { contactId: cId } } },
      ];
    }
    if (companyId) {
      const coId = parseInt(companyId as string);
      // If we already have OR from contactId, wrap in AND
      if (where.OR) {
        where.AND = [
          { OR: where.OR as unknown[] },
          {
            OR: [
              { companyId: coId },
              { actionCompanies: { some: { companyId: coId } } },
            ]
          },
        ];
        delete where.OR;
      } else {
        where.OR = [
          { companyId: coId },
          { actionCompanies: { some: { companyId: coId } } },
        ];
      }
    }

    if (status === 'pending') {
      where.completed = false;
    } else if (status === 'completed') {
      where.completed = true;
    } else if (status === 'overdue') {
      where.completed = false;
      where.dueDate = { lt: today };
    }

    const orderBy = sortBy === 'completedDate'
      ? [{ completedDate: 'desc' as const }, { priority: 'asc' as const }]
      : [{ dueDate: 'asc' as const }, { priority: 'asc' as const }];

    const actions = await prisma.action.findMany({
      where,
      include: actionIncludes,
      orderBy,
    });
    res.json(actions);
  } catch (error) {
    console.error('Error fetching actions:', error);
    res.status(500).json({ error: 'Failed to fetch actions' });
  }
});

// GET /api/actions/:id — single action with details
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const action = await prisma.action.findUnique({
      where: { id: parseInt(req.params.id as string) },
      include: actionIncludes,
    });
    if (!action) {
      res.status(404).json({ error: 'Action not found' });
      return;
    }
    res.json(action);
  } catch (error) {
    console.error('Error fetching action:', error);
    res.status(500).json({ error: 'Failed to fetch action' });
  }
});

// POST /api/actions — create
router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, contactIds, companyIds, ...rest } = req.body;
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }
    const action = await prisma.action.create({
      data: {
        title: title.trim(),
        ...rest,
        actionContacts: contactIds?.length
          ? { create: (contactIds as number[]).map((cId) => ({ contactId: cId })) }
          : undefined,
        actionCompanies: companyIds?.length
          ? { create: (companyIds as number[]).map((cId) => ({ companyId: cId })) }
          : undefined,
      },
      include: actionIncludes,
    });
    res.status(201).json(action);
  } catch (error) {
    console.error('Error creating action:', error);
    res.status(500).json({ error: 'Failed to create action' });
  }
});

// PUT /api/actions/:id — update
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.action.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Action not found' });
      return;
    }
    if (req.body.title !== undefined) {
      if (typeof req.body.title !== 'string' || req.body.title.trim().length === 0) {
        res.status(400).json({ error: 'Title cannot be empty' });
        return;
      }
      req.body.title = req.body.title.trim();
    }

    const { contactIds, companyIds, ...rest } = req.body;

    // If contactIds or companyIds provided, update junction tables
    const junctionUpdates: Record<string, unknown> = {};
    if (contactIds !== undefined) {
      junctionUpdates.actionContacts = {
        deleteMany: {},
        create: (contactIds as number[]).map((cId: number) => ({ contactId: cId })),
      };
    }
    if (companyIds !== undefined) {
      junctionUpdates.actionCompanies = {
        deleteMany: {},
        create: (companyIds as number[]).map((cId: number) => ({ companyId: cId })),
      };
    }

    const action = await prisma.action.update({
      where: { id },
      data: { ...rest, ...junctionUpdates },
      include: actionIncludes,
    });
    res.json(action);
  } catch (error) {
    console.error('Error updating action:', error);
    res.status(500).json({ error: 'Failed to update action' });
  }
});

// PATCH /api/actions/:id/complete — toggle completion
router.patch('/:id/complete', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.action.findUnique({
      where: { id },
      include: { actionContacts: true, actionCompanies: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'Action not found' });
      return;
    }
    const completed = !existing.completed;
    const completedDate = completed ? new Date().toLocaleDateString('en-CA') : null;
    const action = await prisma.action.update({
      where: { id },
      data: { completed, completedDate },
      include: actionIncludes,
    });

    // If completing a recurring action, auto-create next occurrence
    let nextAction = null;
    if (completed && existing.recurring && existing.recurringIntervalDays) {
      const baseDate = existing.dueDate
        ? new Date(existing.dueDate + 'T00:00:00')
        : new Date();
      baseDate.setDate(baseDate.getDate() + existing.recurringIntervalDays);
      const nextDueDate = baseDate.toLocaleDateString('en-CA');

      // Only create if before end date (or no end date)
      const shouldCreate = !existing.recurringEndDate || nextDueDate <= existing.recurringEndDate;

      if (shouldCreate) {
        nextAction = await prisma.action.create({
          data: {
            title: existing.title,
            description: existing.description,
            type: existing.type,
            priority: existing.priority,
            dueDate: nextDueDate,
            contactId: existing.contactId,
            companyId: existing.companyId,
            recurring: true,
            recurringIntervalDays: existing.recurringIntervalDays,
            recurringEndDate: existing.recurringEndDate,
            // Copy junction table entries to next occurrence
            actionContacts: existing.actionContacts.length
              ? { create: existing.actionContacts.map((ac) => ({ contactId: ac.contactId })) }
              : undefined,
            actionCompanies: existing.actionCompanies.length
              ? { create: existing.actionCompanies.map((ac) => ({ companyId: ac.companyId })) }
              : undefined,
          },
          include: actionIncludes,
        });
      }
    }

    res.json({ action, nextAction });
  } catch (error) {
    console.error('Error toggling action completion:', error);
    res.status(500).json({ error: 'Failed to toggle action completion' });
  }
});

// DELETE /api/actions/:id — hard delete
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.action.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Action not found' });
      return;
    }
    await prisma.action.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting action:', error);
    res.status(500).json({ error: 'Failed to delete action' });
  }
});

export default router;
