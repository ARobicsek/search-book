import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

// GET /api/employment-history — list with required contactId filter
router.get('/', async (req: Request, res: Response) => {
  try {
    const { contactId } = req.query;
    if (!contactId) {
      res.status(400).json({ error: 'contactId is required' });
      return;
    }

    const history = await prisma.employmentHistory.findMany({
      where: { contactId: parseInt(contactId as string) },
      include: {
        company: { select: { id: true, name: true } },
      },
      orderBy: { endDate: 'desc' }, // Most recent first (null endDates = current)
    });
    res.json(history);
  } catch (error) {
    console.error('Error fetching employment history:', error);
    res.status(500).json({ error: 'Failed to fetch employment history' });
  }
});

// POST /api/employment-history — create
router.post('/', async (req: Request, res: Response) => {
  try {
    const { contactId, companyId, companyName, title, startDate, endDate } = req.body;
    if (!contactId) {
      res.status(400).json({ error: 'contactId is required' });
      return;
    }
    if (!companyId && !companyName) {
      res.status(400).json({ error: 'companyId or companyName is required' });
      return;
    }

    const history = await prisma.employmentHistory.create({
      data: {
        contactId,
        companyId: companyId || null,
        companyName: companyName?.trim() || null,
        title: title?.trim() || null,
        startDate: startDate?.trim() || null,
        endDate: endDate?.trim() || null,
      },
      include: {
        company: { select: { id: true, name: true } },
      },
    });
    res.status(201).json(history);
  } catch (error) {
    console.error('Error creating employment history:', error);
    res.status(500).json({ error: 'Failed to create employment history' });
  }
});

// PUT /api/employment-history/:id — update
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { companyId, companyName, title, startDate, endDate } = req.body;
    const existing = await prisma.employmentHistory.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Employment history not found' });
      return;
    }

    const history = await prisma.employmentHistory.update({
      where: { id },
      data: {
        companyId: companyId !== undefined ? (companyId || null) : existing.companyId,
        companyName: companyName !== undefined ? (companyName?.trim() || null) : existing.companyName,
        title: title !== undefined ? (title?.trim() || null) : existing.title,
        startDate: startDate !== undefined ? (startDate?.trim() || null) : existing.startDate,
        endDate: endDate !== undefined ? (endDate?.trim() || null) : existing.endDate,
      },
      include: {
        company: { select: { id: true, name: true } },
      },
    });
    res.json(history);
  } catch (error) {
    console.error('Error updating employment history:', error);
    res.status(500).json({ error: 'Failed to update employment history' });
  }
});

// DELETE /api/employment-history/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.employmentHistory.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Employment history not found' });
      return;
    }
    await prisma.employmentHistory.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting employment history:', error);
    res.status(500).json({ error: 'Failed to delete employment history' });
  }
});

export default router;
