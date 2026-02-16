import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

// GET /api/company-activities?companyId=N
router.get('/', async (req: Request, res: Response) => {
    try {
        const { companyId } = req.query;
        if (!companyId) {
            res.status(400).json({ error: 'companyId is required' });
            return;
        }

        const activities = await prisma.companyActivity.findMany({
            where: { companyId: parseInt(companyId as string) },
            orderBy: { date: 'desc' },
        });
        res.json(activities);
    } catch (error) {
        console.error('Error fetching company activities:', error);
        res.status(500).json({ error: 'Failed to fetch company activities' });
    }
});

// POST /api/company-activities
router.post('/', async (req: Request, res: Response) => {
    try {
        const { companyId, date, type, title, notes } = req.body;
        if (!companyId || !date || !title?.trim()) {
            res.status(400).json({ error: 'companyId, date, and title are required' });
            return;
        }

        const activity = await prisma.companyActivity.create({
            data: {
                companyId,
                date,
                type: type || 'OTHER',
                title: title.trim(),
                notes: notes?.trim() || null,
            },
        });

        // Update Company.updatedAt
        await prisma.company.update({
            where: { id: companyId },
            data: { updatedAt: new Date() },
        });

        res.status(201).json(activity);
    } catch (error) {
        console.error('Error creating company activity:', error);
        res.status(500).json({ error: 'Failed to create company activity' });
    }
});

// PUT /api/company-activities/:id
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        const existing = await prisma.companyActivity.findUnique({ where: { id } });
        if (!existing) {
            res.status(404).json({ error: 'Activity not found' });
            return;
        }

        const { date, type, title, notes } = req.body;
        const activity = await prisma.companyActivity.update({
            where: { id },
            data: {
                date: date ?? existing.date,
                type: type ?? existing.type,
                title: title?.trim() ?? existing.title,
                notes: notes !== undefined ? (notes?.trim() || null) : existing.notes,
            },
        });
        res.json(activity);
    } catch (error) {
        console.error('Error updating company activity:', error);
        res.status(500).json({ error: 'Failed to update company activity' });
    }
});

// DELETE /api/company-activities/:id
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        const existing = await prisma.companyActivity.findUnique({ where: { id } });
        if (!existing) {
            res.status(404).json({ error: 'Activity not found' });
            return;
        }
        await prisma.companyActivity.delete({ where: { id } });
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting company activity:', error);
        res.status(500).json({ error: 'Failed to delete company activity' });
    }
});

export default router;
