import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

// GET /api/companies — list all
router.get('/', async (_req: Request, res: Response) => {
  try {
    const companies = await prisma.company.findMany({
      include: { _count: { select: { contacts: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(companies);
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// GET /api/companies/:id — single company with linked contacts
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: parseInt(req.params.id as string) },
      include: {
        contacts: {
          select: {
            id: true,
            name: true,
            title: true,
            ecosystem: true,
            status: true,
          },
        },
      },
    });
    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }
    res.json(company);
  } catch (error) {
    console.error('Error fetching company:', error);
    res.status(500).json({ error: 'Failed to fetch company' });
  }
});

// POST /api/companies — create
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, ...rest } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    const company = await prisma.company.create({
      data: { name: name.trim(), ...rest },
    });
    res.status(201).json(company);
  } catch (error) {
    console.error('Error creating company:', error);
    res.status(500).json({ error: 'Failed to create company' });
  }
});

// PUT /api/companies/:id — update
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }
    if (req.body.name !== undefined) {
      if (typeof req.body.name !== 'string' || req.body.name.trim().length === 0) {
        res.status(400).json({ error: 'Name cannot be empty' });
        return;
      }
      req.body.name = req.body.name.trim();
    }
    const company = await prisma.company.update({
      where: { id },
      data: req.body,
    });
    res.json(company);
  } catch (error) {
    console.error('Error updating company:', error);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

// DELETE /api/companies/:id — hard delete
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }
    await prisma.company.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting company:', error);
    res.status(500).json({ error: 'Failed to delete company' });
  }
});

export default router;
