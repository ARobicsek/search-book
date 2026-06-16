import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

// Meeting series (D4 revised): a real entity meetings opt into, replacing the
// old "series == identical title string" convention. Mirrors tags.ts shape.

// GET /api/series — list series with meeting count + most-recent meeting date,
// newest-active first. Avoids `include: { _count }` (hangs on Turso, see
// CLAUDE.md): pulls each series' conversation dates and reduces in JS. Series
// are few, so this is cheap.
router.get('/', async (_req: Request, res: Response) => {
  try {
    const series = await prisma.series.findMany({
      include: { conversations: { select: { date: true } } },
    });
    const result = series
      .map((s) => {
        const lastDate = s.conversations.reduce<string | null>(
          (max, c) => (!max || (c.date || '') > max ? c.date : max),
          null
        );
        return { id: s.id, name: s.name, count: s.conversations.length, lastDate };
      })
      .sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || '') || a.name.localeCompare(b.name));
    res.json(result);
  } catch (error) {
    console.error('Error fetching series:', error);
    res.status(500).json({ error: 'Failed to fetch series' });
  }
});

// POST /api/series — find-or-create by case-insensitive name (so picking
// "+ New series" twice with the same name reuses the existing one).
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    const trimmed = name.trim();
    const existing = await prisma.series.findFirst({
      where: { name: { equals: trimmed } },
    });
    // SQLite `equals` is case-insensitive for ASCII, so this also catches
    // different-cased duplicates.
    if (existing) {
      res.json({ id: existing.id, name: existing.name });
      return;
    }
    const created = await prisma.series.create({ data: { name: trimmed } });
    res.status(201).json({ id: created.id, name: created.name });
  } catch (error) {
    console.error('Error creating series:', error);
    res.status(500).json({ error: 'Failed to create series' });
  }
});

// PUT /api/series/:id — rename
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    const updated = await prisma.series.update({
      where: { id },
      data: { name: name.trim() },
    });
    res.json({ id: updated.id, name: updated.name });
  } catch (error) {
    console.error('Error renaming series:', error);
    res.status(500).json({ error: 'Failed to rename series' });
  }
});

// DELETE /api/series/:id — removes the series; member meetings keep their data,
// just lose the link (Conversation.seriesId → SetNull via the FK).
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    await prisma.series.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting series:', error);
    res.status(500).json({ error: 'Failed to delete series' });
  }
});

export default router;
