import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

// GET /api/contacts — list all contacts
router.get('/', async (_req: Request, res: Response) => {
  try {
    const contacts = await prisma.contact.findMany({
      include: { company: { select: { id: true, name: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(contacts);
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// GET /api/contacts/without-actions — contacts with no pending actions
router.get('/without-actions', async (_req: Request, res: Response) => {
  try {
    const contacts = await prisma.contact.findMany({
      where: {
        actions: {
          none: { completed: false },
        },
      },
      include: { company: { select: { id: true, name: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(contacts);
  } catch (error) {
    console.error('Error fetching contacts without actions:', error);
    res.status(500).json({ error: 'Failed to fetch contacts without actions' });
  }
});

// GET /api/contacts/:id — single contact with details
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const contact = await prisma.contact.findUnique({
      where: { id: parseInt(req.params.id as string) },
      include: {
        company: true,
        referredBy: { select: { id: true, name: true } },
        referrals: { select: { id: true, name: true } },
      },
    });
    if (!contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }
    res.json(contact);
  } catch (error) {
    console.error('Error fetching contact:', error);
    res.status(500).json({ error: 'Failed to fetch contact' });
  }
});

// POST /api/contacts — create
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, ...rest } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    const contact = await prisma.contact.create({
      data: { name: name.trim(), ...rest },
      include: { company: { select: { id: true, name: true } } },
    });
    res.status(201).json(contact);
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// PUT /api/contacts/:id — update
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.contact.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }
    if (req.body.name !== undefined) {
      if (typeof req.body.name !== 'string' || req.body.name.trim().length === 0) {
        res.status(400).json({ error: 'Name cannot be empty' });
        return;
      }
      req.body.name = req.body.name.trim();
    }
    const contact = await prisma.contact.update({
      where: { id },
      data: req.body,
      include: { company: { select: { id: true, name: true } } },
    });
    res.json(contact);
  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// DELETE /api/contacts/:id — hard delete
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.contact.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }
    await prisma.contact.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

export default router;
