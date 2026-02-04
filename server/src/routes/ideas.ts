import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

const ideaIncludes = {
  contacts: {
    include: { contact: { select: { id: true, name: true } } },
  },
  companies: {
    include: { company: { select: { id: true, name: true } } },
  },
};

// GET /api/ideas — list all ideas
router.get('/', async (_req: Request, res: Response) => {
  try {
    const ideas = await prisma.idea.findMany({
      orderBy: { createdAt: 'desc' },
      include: ideaIncludes,
    });
    res.json(ideas);
  } catch (error) {
    console.error('Error fetching ideas:', error);
    res.status(500).json({ error: 'Failed to fetch ideas' });
  }
});

// GET /api/ideas/:id — single idea
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const idea = await prisma.idea.findUnique({
      where: { id: parseInt(req.params.id as string) },
      include: ideaIncludes,
    });
    if (!idea) {
      res.status(404).json({ error: 'Idea not found' });
      return;
    }
    res.json(idea);
  } catch (error) {
    console.error('Error fetching idea:', error);
    res.status(500).json({ error: 'Failed to fetch idea' });
  }
});

// POST /api/ideas — create a quick note/idea
router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, contactIds, companyIds, ...rest } = req.body;
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }
    const idea = await prisma.idea.create({
      data: {
        title: title.trim(),
        ...rest,
        contacts: contactIds?.length
          ? { create: (contactIds as number[]).map((cId) => ({ contactId: cId })) }
          : undefined,
        companies: companyIds?.length
          ? { create: (companyIds as number[]).map((cId) => ({ companyId: cId })) }
          : undefined,
      },
      include: ideaIncludes,
    });
    res.status(201).json(idea);
  } catch (error) {
    console.error('Error creating idea:', error);
    res.status(500).json({ error: 'Failed to create idea' });
  }
});

// PUT /api/ideas/:id — update idea
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.idea.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Idea not found' });
      return;
    }

    const { contactIds, companyIds, ...data } = req.body;

    if (data.title !== undefined) {
      if (typeof data.title !== 'string' || data.title.trim().length === 0) {
        res.status(400).json({ error: 'Title cannot be empty' });
        return;
      }
      data.title = data.title.trim();
    }

    await prisma.$transaction(async (tx) => {
      // Replace junction records
      await tx.ideaContact.deleteMany({ where: { ideaId: id } });
      await tx.ideaCompany.deleteMany({ where: { ideaId: id } });

      await tx.idea.update({
        where: { id },
        data: {
          ...data,
          contacts: contactIds?.length
            ? { create: (contactIds as number[]).map((cId: number) => ({ contactId: cId })) }
            : undefined,
          companies: companyIds?.length
            ? { create: (companyIds as number[]).map((cId: number) => ({ companyId: cId })) }
            : undefined,
        },
      });
    });

    const idea = await prisma.idea.findUnique({
      where: { id },
      include: ideaIncludes,
    });
    res.json(idea);
  } catch (error) {
    console.error('Error updating idea:', error);
    res.status(500).json({ error: 'Failed to update idea' });
  }
});

// DELETE /api/ideas/:id — delete idea
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    await prisma.idea.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting idea:', error);
    res.status(500).json({ error: 'Failed to delete idea' });
  }
});

export default router;
