import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

// GET /api/company-prepnotes — list with required companyId filter
router.get('/', async (req: Request, res: Response) => {
    try {
        const { companyId } = req.query;
        if (!companyId) {
            res.status(400).json({ error: 'companyId is required' });
            return;
        }

        const prepNotes = await prisma.companyPrepNote.findMany({
            where: { companyId: parseInt(companyId as string) },
            orderBy: [{ ordering: 'asc' }, { date: 'desc' }],
        });
        res.json(prepNotes);
    } catch (error) {
        console.error('Error fetching company prep notes:', error);
        res.status(500).json({ error: 'Failed to fetch company prep notes' });
    }
});

// POST /api/company-prepnotes — create
router.post('/', async (req: Request, res: Response) => {
    try {
        const { content, url, urlTitle, date, companyId } = req.body;
        if (!content || typeof content !== 'string' || !content.trim()) {
            res.status(400).json({ error: 'Content is required' });
            return;
        }
        if (!companyId) {
            res.status(400).json({ error: 'companyId is required' });
            return;
        }
        if (!date) {
            res.status(400).json({ error: 'Date is required' });
            return;
        }

        // Auto-assign ordering: put new note at the end
        const maxOrdering = await prisma.companyPrepNote.aggregate({
            where: { companyId: companyId },
            _max: { ordering: true },
        });
        const nextOrdering = (maxOrdering._max.ordering ?? -1) + 1;

        const prepNote = await prisma.companyPrepNote.create({
            data: {
                content: content.trim(),
                url: url?.trim() || null,
                urlTitle: urlTitle?.trim() || null,
                date: date,
                ordering: nextOrdering,
                companyId: companyId,
            },
        });
        res.status(201).json(prepNote);
    } catch (error) {
        console.error('Error creating company prep note:', error);
        res.status(500).json({ error: 'Failed to create company prep note' });
    }
});

// POST /api/company-prepnotes/reorder — reorder notes
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
                prisma.companyPrepNote.update({
                    where: { id },
                    data: { ordering: index },
                })
            )
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error reordering company prep notes:', error);
        res.status(500).json({ error: 'Failed to reorder company prep notes' });
    }
});

// PUT /api/company-prepnotes/:id — update
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        const { content, url, urlTitle, date } = req.body;
        const existing = await prisma.companyPrepNote.findUnique({ where: { id } });
        if (!existing) {
            res.status(404).json({ error: 'Company prep note not found' });
            return;
        }
        const prepNote = await prisma.companyPrepNote.update({
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
        console.error('Error updating company prep note:', error);
        res.status(500).json({ error: 'Failed to update company prep note' });
    }
});

// DELETE /api/company-prepnotes/:id
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        const existing = await prisma.companyPrepNote.findUnique({ where: { id } });
        if (!existing) {
            res.status(404).json({ error: 'Company prep note not found' });
            return;
        }
        await prisma.companyPrepNote.delete({ where: { id } });
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting company prep note:', error);
        res.status(500).json({ error: 'Failed to delete company prep note' });
    }
});

export default router;
