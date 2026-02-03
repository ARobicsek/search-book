import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

// POST /api/ideas — create a quick note/idea
router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, ...rest } = req.body;
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }
    const idea = await prisma.idea.create({
      data: { title: title.trim(), ...rest },
    });
    res.status(201).json(idea);
  } catch (error) {
    console.error('Error creating idea:', error);
    res.status(500).json({ error: 'Failed to create idea' });
  }
});

export default router;
