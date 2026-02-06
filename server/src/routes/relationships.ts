import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

const relationshipIncludes = {
  fromContact: { select: { id: true, name: true } },
  toContact: { select: { id: true, name: true } },
};

// GET /api/relationships — list with optional contactId filter
// Returns relationships where the contact is either fromContact or toContact
router.get('/', async (req: Request, res: Response) => {
  try {
    const { contactId } = req.query;
    let where: Record<string, unknown> = {};

    if (contactId) {
      const cId = parseInt(contactId as string);
      where = {
        OR: [{ fromContactId: cId }, { toContactId: cId }],
      };
    }

    const relationships = await prisma.relationship.findMany({
      where,
      include: relationshipIncludes,
      orderBy: { id: 'desc' },
    });
    res.json(relationships);
  } catch (error) {
    console.error('Error fetching relationships:', error);
    res.status(500).json({ error: 'Failed to fetch relationships' });
  }
});

// GET /api/relationships/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const relationship = await prisma.relationship.findUnique({
      where: { id: parseInt(req.params.id as string) },
      include: relationshipIncludes,
    });
    if (!relationship) {
      res.status(404).json({ error: 'Relationship not found' });
      return;
    }
    res.json(relationship);
  } catch (error) {
    console.error('Error fetching relationship:', error);
    res.status(500).json({ error: 'Failed to fetch relationship' });
  }
});

// POST /api/relationships — create
router.post('/', async (req: Request, res: Response) => {
  try {
    const { fromContactId, toContactId, type, notes } = req.body;

    if (!fromContactId || !toContactId || !type) {
      res.status(400).json({ error: 'fromContactId, toContactId, and type are required' });
      return;
    }

    if (fromContactId === toContactId) {
      res.status(400).json({ error: 'Cannot create a relationship with the same contact' });
      return;
    }

    const relationship = await prisma.relationship.create({
      data: {
        fromContactId,
        toContactId,
        type,
        notes: notes || null,
      },
      include: relationshipIncludes,
    });
    res.status(201).json(relationship);
  } catch (error) {
    console.error('Error creating relationship:', error);
    res.status(500).json({ error: 'Failed to create relationship' });
  }
});

// PUT /api/relationships/:id — update
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.relationship.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Relationship not found' });
      return;
    }

    const relationship = await prisma.relationship.update({
      where: { id },
      data: req.body,
      include: relationshipIncludes,
    });
    res.json(relationship);
  } catch (error) {
    console.error('Error updating relationship:', error);
    res.status(500).json({ error: 'Failed to update relationship' });
  }
});

// DELETE /api/relationships/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.relationship.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Relationship not found' });
      return;
    }
    await prisma.relationship.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting relationship:', error);
    res.status(500).json({ error: 'Failed to delete relationship' });
  }
});

export default router;
