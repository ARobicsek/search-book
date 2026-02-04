import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

// GET /api/tags — list all tags
router.get('/', async (_req: Request, res: Response) => {
  try {
    const tags = await prisma.tag.findMany({
      include: {
        _count: { select: { contacts: true, companies: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json(tags);
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// POST /api/tags — create a tag
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    const tag = await prisma.tag.create({
      data: { name: name.trim() },
    });
    res.status(201).json(tag);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2002') {
      res.status(409).json({ error: 'Tag already exists' });
      return;
    }
    console.error('Error creating tag:', error);
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

// DELETE /api/tags/:id — delete a tag
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    await prisma.tag.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting tag:', error);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// POST /api/tags/:id/contacts/:contactId — add tag to contact
router.post('/:id/contacts/:contactId', async (req: Request, res: Response) => {
  try {
    const tagId = parseInt(req.params.id as string);
    const contactId = parseInt(req.params.contactId as string);
    await prisma.contactTag.create({
      data: { tagId, contactId },
    });
    res.status(201).json({ success: true });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2002') {
      // Already exists, that's fine
      res.json({ success: true });
      return;
    }
    console.error('Error adding tag to contact:', error);
    res.status(500).json({ error: 'Failed to add tag' });
  }
});

// DELETE /api/tags/:id/contacts/:contactId — remove tag from contact
router.delete('/:id/contacts/:contactId', async (req: Request, res: Response) => {
  try {
    const tagId = parseInt(req.params.id as string);
    const contactId = parseInt(req.params.contactId as string);
    await prisma.contactTag.delete({
      where: { contactId_tagId: { tagId, contactId } },
    });
    res.status(204).send();
  } catch (error) {
    console.error('Error removing tag from contact:', error);
    res.status(500).json({ error: 'Failed to remove tag' });
  }
});

// GET /api/contacts/:contactId/tags — get tags for a contact
router.get('/contact/:contactId', async (req: Request, res: Response) => {
  try {
    const contactId = parseInt(req.params.contactId as string);
    const contactTags = await prisma.contactTag.findMany({
      where: { contactId },
      include: { tag: true },
    });
    res.json(contactTags.map((ct) => ct.tag));
  } catch (error) {
    console.error('Error fetching contact tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// PUT /api/contacts/:contactId/tags — set all tags for a contact (replace)
router.put('/contact/:contactId', async (req: Request, res: Response) => {
  try {
    const contactId = parseInt(req.params.contactId as string);
    const { tagIds } = req.body as { tagIds: number[] };

    // Delete existing tags for this contact
    await prisma.contactTag.deleteMany({ where: { contactId } });

    // Add new tags
    if (tagIds && tagIds.length > 0) {
      await prisma.contactTag.createMany({
        data: tagIds.map((tagId) => ({ contactId, tagId })),
      });
    }

    // Return updated tags
    const contactTags = await prisma.contactTag.findMany({
      where: { contactId },
      include: { tag: true },
    });
    res.json(contactTags.map((ct) => ct.tag));
  } catch (error) {
    console.error('Error setting contact tags:', error);
    res.status(500).json({ error: 'Failed to set tags' });
  }
});

export default router;
