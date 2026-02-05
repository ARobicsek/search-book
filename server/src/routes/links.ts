import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

// GET /api/links — list with optional contactId, companyId, or actionId filter
router.get('/', async (req: Request, res: Response) => {
  try {
    const { contactId, companyId, actionId } = req.query;
    const where: Record<string, unknown> = {};
    if (contactId) where.contactId = parseInt(contactId as string);
    if (companyId) where.companyId = parseInt(companyId as string);
    if (actionId) where.actionId = parseInt(actionId as string);

    const links = await prisma.link.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    res.json(links);
  } catch (error) {
    console.error('Error fetching links:', error);
    res.status(500).json({ error: 'Failed to fetch links' });
  }
});

// POST /api/links — create
router.post('/', async (req: Request, res: Response) => {
  try {
    const { url, title, description, contactId, companyId, actionId } = req.body;
    if (!url || typeof url !== 'string' || !url.trim()) {
      res.status(400).json({ error: 'URL is required' });
      return;
    }
    const link = await prisma.link.create({
      data: {
        url: url.trim(),
        title: title?.trim() || url.trim(),
        description: description?.trim() || null,
        contactId: contactId || null,
        companyId: companyId || null,
        actionId: actionId || null,
      },
    });
    res.status(201).json(link);
  } catch (error) {
    console.error('Error creating link:', error);
    res.status(500).json({ error: 'Failed to create link' });
  }
});

// DELETE /api/links/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.link.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Link not found' });
      return;
    }
    await prisma.link.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting link:', error);
    res.status(500).json({ error: 'Failed to delete link' });
  }
});

export default router;
