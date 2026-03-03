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
      orderBy: [{ ordering: 'asc' }, { date: 'desc' }],
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

    // Auto-assign ordering: put new note at the end
    const maxOrdering = await prisma.prepNote.aggregate({
      where: { contactId: contactId },
      _max: { ordering: true },
    });
    const nextOrdering = (maxOrdering._max.ordering ?? -1) + 1;

    const prepNote = await prisma.prepNote.create({
      data: {
        content: content.trim(),
        url: url?.trim() || null,
        urlTitle: urlTitle?.trim() || null,
        date: date,
        ordering: nextOrdering,
        contactId: contactId,
      },
    });
    res.status(201).json(prepNote);
  } catch (error) {
    console.error('Error creating prep note:', error);
    res.status(500).json({ error: 'Failed to create prep note' });
  }
});

// POST /api/prepnotes/import-dossier — import all notes from a company dossier
router.post('/import-dossier', async (req: Request, res: Response) => {
  try {
    const { contactId, companyId } = req.body;
    if (!contactId || !companyId) {
      res.status(400).json({ error: 'contactId and companyId are required' });
      return;
    }

    // Get company notes
    const companyNotes = await prisma.companyPrepNote.findMany({
      where: { companyId },
      orderBy: { ordering: 'asc' },
    });

    if (companyNotes.length === 0) {
      res.json({ count: 0 });
      return;
    }

    // Get current max ordering for contact prep notes
    const maxOrdering = await prisma.prepNote.aggregate({
      where: { contactId },
      _max: { ordering: true },
    });
    let nextOrdering = (maxOrdering._max.ordering ?? -1) + 1;

    // Create new prep notes
    const creates = companyNotes.map(cn => {
      const ord = nextOrdering++;
      return prisma.prepNote.create({
        data: {
          content: cn.content,
          url: cn.url,
          urlTitle: cn.urlTitle,
          date: cn.date,
          ordering: ord,
          contactId,
        }
      });
    });

    await prisma.$transaction(creates);

    res.json({ count: creates.length });
  } catch (error) {
    console.error('Error importing dossier:', error);
    res.status(500).json({ error: 'Failed to import dossier' });
  }
});

// POST /api/prepnotes/reorder — reorder notes
router.post('/reorder', async (req: Request, res: Response) => {
  try {
    const { noteIds } = req.body;
    if (!Array.isArray(noteIds) || noteIds.length === 0) {
      res.status(400).json({ error: 'noteIds array is required' });
      return;
    }

    // Update ordering for each note based on array position
    await Promise.all(
      noteIds.map((id: number, index: number) =>
        prisma.prepNote.update({
          where: { id },
          data: { ordering: index },
        })
      )
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering prep notes:', error);
    res.status(500).json({ error: 'Failed to reorder prep notes' });
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
