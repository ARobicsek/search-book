import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

const actionIncludes = {
  contact: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
  conversation: { select: { id: true, summary: true } },
};

// GET /api/actions — list all actions with optional filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, contactId, companyId } = req.query;
    const today = new Date().toISOString().split('T')[0];

    // Build where clause from query params
    const where: Record<string, unknown> = {};

    if (contactId) where.contactId = parseInt(contactId as string);
    if (companyId) where.companyId = parseInt(companyId as string);

    if (status === 'pending') {
      where.completed = false;
    } else if (status === 'completed') {
      where.completed = true;
    } else if (status === 'overdue') {
      where.completed = false;
      where.dueDate = { lt: today };
    }

    const actions = await prisma.action.findMany({
      where,
      include: actionIncludes,
      orderBy: [{ dueDate: 'asc' }, { priority: 'asc' }],
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
    const { title, ...rest } = req.body;
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }
    const action = await prisma.action.create({
      data: { title: title.trim(), ...rest },
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
    const action = await prisma.action.update({
      where: { id },
      data: req.body,
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
    const existing = await prisma.action.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Action not found' });
      return;
    }
    const completed = !existing.completed;
    const completedDate = completed ? new Date().toISOString().split('T')[0] : null;
    const action = await prisma.action.update({
      where: { id },
      data: { completed, completedDate },
      include: actionIncludes,
    });
    res.json(action);
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
