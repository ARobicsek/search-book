import { Router, Request, Response } from 'express';
import prisma from '../db';
import { deleteWithSnapshot } from '../lib/undo';

const router = Router();

// Attachment metadata rows for meetings (screenshots, decks, PDFs). The file
// itself is uploaded first via POST /api/upload/file, which returns the URL
// stored here. Binaries follow the photo precedent: not in the daily DB backup.

// GET /api/conversation-attachments?conversationId=N
router.get('/', async (req: Request, res: Response) => {
    try {
        const { conversationId } = req.query;
        if (!conversationId) {
            res.status(400).json({ error: 'conversationId is required' });
            return;
        }
        const attachments = await prisma.conversationAttachment.findMany({
            where: { conversationId: parseInt(conversationId as string) },
            orderBy: { createdAt: 'asc' },
        });
        res.json(attachments);
    } catch (error) {
        console.error('Error fetching attachments:', error);
        res.status(500).json({ error: 'Failed to fetch attachments' });
    }
});

// POST /api/conversation-attachments — register an uploaded file on a meeting
router.post('/', async (req: Request, res: Response) => {
    try {
        const { conversationId, url, name, mimeType, size } = req.body;
        if (!conversationId || !url || !name) {
            res.status(400).json({ error: 'conversationId, url, and name are required' });
            return;
        }
        const attachment = await prisma.conversationAttachment.create({
            data: {
                conversationId: Number(conversationId),
                url: String(url),
                name: String(name),
                mimeType: mimeType ? String(mimeType) : null,
                size: size ? Number(size) : null,
            },
        });
        res.status(201).json(attachment);
    } catch (error) {
        console.error('Error creating attachment:', error);
        res.status(500).json({ error: 'Failed to create attachment' });
    }
});

// DELETE /api/conversation-attachments/:id — removes the DB row. The underlying
// binary is intentionally LEFT in Blob storage so the delete is undoable (orphaned
// binaries are harmless and are already excluded from the DB backup).
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        const existing = await prisma.conversationAttachment.findUnique({ where: { id } });
        if (!existing) {
            res.status(404).json({ error: 'Attachment not found' });
            return;
        }
        await deleteWithSnapshot('conversationAttachment', id, `Attachment: ${existing.name}`);
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting attachment:', error);
        res.status(500).json({ error: 'Failed to delete attachment' });
    }
});

export default router;
