import { Router, Request, Response } from 'express';
import prisma from '../db';
import { deleteWithSnapshot } from '../lib/undo';

const router = Router();

// Meeting-level prep notes (incl. notes made in advance of a meeting logged
// with a future date). Mirrors company-prepnotes.ts.

// GET /api/conversation-prepnotes — list with required conversationId filter
router.get('/', async (req: Request, res: Response) => {
    try {
        const { conversationId } = req.query;
        if (!conversationId) {
            res.status(400).json({ error: 'conversationId is required' });
            return;
        }

        const prepNotes = await prisma.conversationPrepNote.findMany({
            where: { conversationId: parseInt(conversationId as string) },
            orderBy: [{ ordering: 'asc' }, { date: 'desc' }],
        });
        res.json(prepNotes);
    } catch (error) {
        console.error('Error fetching meeting prep notes:', error);
        res.status(500).json({ error: 'Failed to fetch meeting prep notes' });
    }
});

// POST /api/conversation-prepnotes — create
router.post('/', async (req: Request, res: Response) => {
    try {
        const { content, url, urlTitle, date, conversationId } = req.body;
        if (!content || typeof content !== 'string' || !content.trim()) {
            res.status(400).json({ error: 'Content is required' });
            return;
        }
        if (!conversationId) {
            res.status(400).json({ error: 'conversationId is required' });
            return;
        }
        if (!date) {
            res.status(400).json({ error: 'Date is required' });
            return;
        }

        // Auto-assign ordering: put new note at the end
        const maxOrdering = await prisma.conversationPrepNote.aggregate({
            where: { conversationId: conversationId },
            _max: { ordering: true },
        });
        const nextOrdering = (maxOrdering._max.ordering ?? -1) + 1;

        const prepNote = await prisma.conversationPrepNote.create({
            data: {
                content: content.trim(),
                url: url?.trim() || null,
                urlTitle: urlTitle?.trim() || null,
                date: date,
                ordering: nextOrdering,
                conversationId: conversationId,
            },
        });
        res.status(201).json(prepNote);
    } catch (error) {
        console.error('Error creating meeting prep note:', error);
        res.status(500).json({ error: 'Failed to create meeting prep note' });
    }
});

// POST /api/conversation-prepnotes/reorder — reorder notes
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
                prisma.conversationPrepNote.update({
                    where: { id },
                    data: { ordering: index },
                })
            )
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error reordering meeting prep notes:', error);
        res.status(500).json({ error: 'Failed to reorder meeting prep notes' });
    }
});

// PUT /api/conversation-prepnotes/:id — update
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        const { content, url, urlTitle, date } = req.body;
        const existing = await prisma.conversationPrepNote.findUnique({ where: { id } });
        if (!existing) {
            res.status(404).json({ error: 'Meeting prep note not found' });
            return;
        }
        const prepNote = await prisma.conversationPrepNote.update({
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
        console.error('Error updating meeting prep note:', error);
        res.status(500).json({ error: 'Failed to update meeting prep note' });
    }
});

// DELETE /api/conversation-prepnotes/:id
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        const existing = await prisma.conversationPrepNote.findUnique({ where: { id } });
        if (!existing) {
            res.status(404).json({ error: 'Meeting prep note not found' });
            return;
        }
        await deleteWithSnapshot('conversationPrepNote', id, 'Prep note');
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting meeting prep note:', error);
        res.status(500).json({ error: 'Failed to delete meeting prep note' });
    }
});

export default router;
