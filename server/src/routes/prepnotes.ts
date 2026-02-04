import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

// GET /api/prepnotes — list with required contactId filter
router.get('/', async (req: Request, res: Response) => {
  try {
    const { contactId } = req.query;
    if (!contactId) {
      res.status(400).json({ error: 'contactId is required' });
      return;
    }

    const prepNotes = await prisma.prepNote.findMany({
      where: { contactId: parseInt(contactId as string) },
      orderBy: { date: 'desc' },
    });
    res.json(prepNotes);
  } catch (error) {
    console.error('Error fetching prep notes:', error);
    res.status(500).json({ error: 'Failed to fetch prep notes' });
  }
});

// POST /api/prepnotes — create
router.post('/', async (req: Request, res: Response) => {
  try {
    const { content, url, urlTitle, date, contactId } = req.body;
    if (!content || typeof content !== 'string' || !content.trim()) {
      res.status(400).json({ error: 'Content is required' });
      return;
    }
    if (!contactId) {
      res.status(400).json({ error: 'contactId is required' });
      return;
    }
    if (!date) {
      res.status(400).json({ error: 'Date is required' });
      return;
    }
    const prepNote = await prisma.prepNote.create({
      data: {
        content: content.trim(),
        url: url?.trim() || null,
        urlTitle: urlTitle?.trim() || null,
        date: date,
        contactId: contactId,
      },
    });
    res.status(201).json(prepNote);
  } catch (error) {
    console.error('Error creating prep note:', error);
    res.status(500).json({ error: 'Failed to create prep note' });
  }
});

// PUT /api/prepnotes/:id — update
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { content, url, urlTitle, date } = req.body;
    const existing = await prisma.prepNote.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Prep note not found' });
      return;
    }
    const prepNote = await prisma.prepNote.update({
      where: { id },
      data: {
        content: content?.trim() ?? existing.content,
        url: url !== undefined ? (url?.trim() || null) : existing.url,
        urlTitle: urlTitle !== undefined ? (urlTitle?.trim() || null) : existing.urlTitle,
        date: date ?? existing.date,
      },
    });
    res.json(prepNote);
  } catch (error) {
    console.error('Error updating prep note:', error);
    res.status(500).json({ error: 'Failed to update prep note' });
  }
});

// DELETE /api/prepnotes/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.prepNote.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Prep note not found' });
      return;
    }
    await prisma.prepNote.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting prep note:', error);
    res.status(500).json({ error: 'Failed to delete prep note' });
  }
});

export default router;
