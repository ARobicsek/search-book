import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

const conversationIncludes = {
  contact: { select: { id: true, name: true } },
  contactsDiscussed: {
    include: { contact: { select: { id: true, name: true } } },
  },
  companiesDiscussed: {
    include: { company: { select: { id: true, name: true } } },
  },
  actions: { select: { id: true, title: true, completed: true } },
};

// GET /api/conversations — list with optional contactId filter
router.get('/', async (req: Request, res: Response) => {
  try {
    const { contactId } = req.query;
    const where: Record<string, unknown> = {};
    if (contactId) where.contactId = parseInt(contactId as string);

    const conversations = await prisma.conversation.findMany({
      where,
      include: conversationIncludes,
      orderBy: { date: 'desc' },
    });
    res.json(conversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// GET /api/conversations/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: parseInt(req.params.id as string) },
      include: conversationIncludes,
    });
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    res.json(conversation);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// POST /api/conversations — create conversation with optional action creation
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      contactId,
      date,
      datePrecision,
      type,
      summary,
      notes,
      nextSteps,
      photoFile,
      contactsDiscussed,   // number[] of contact IDs
      companiesDiscussed,  // number[] of company IDs
      createAction,        // optional: { title, type, dueDate, priority }
    } = req.body;

    if (!contactId || !date) {
      res.status(400).json({ error: 'contactId and date are required' });
      return;
    }

    const conversation = await prisma.conversation.create({
      data: {
        contactId,
        date,
        datePrecision: datePrecision || 'DAY',
        type: type || 'OTHER',
        summary: summary || null,
        notes: notes || null,
        nextSteps: nextSteps || null,
        photoFile: photoFile || null,
        contactsDiscussed: contactsDiscussed?.length
          ? {
              create: (contactsDiscussed as number[]).map((cId) => ({
                contactId: cId,
              })),
            }
          : undefined,
        companiesDiscussed: companiesDiscussed?.length
          ? {
              create: (companiesDiscussed as number[]).map((cId) => ({
                companyId: cId,
              })),
            }
          : undefined,
      },
      include: conversationIncludes,
    });

    // Optionally create a follow-up action linked to this conversation
    if (createAction?.title) {
      await prisma.action.create({
        data: {
          title: createAction.title,
          type: createAction.type || 'FOLLOW_UP',
          dueDate: createAction.dueDate || null,
          priority: createAction.priority || 'MEDIUM',
          contactId,
          conversationId: conversation.id,
        },
      });
    }

    // Auto-update contact status to CONNECTED if currently NEW
    const relatedContact = await prisma.contact.findUnique({ where: { id: contactId }, select: { status: true } });
    if (relatedContact && relatedContact.status === 'NEW') {
      await prisma.contact.update({ where: { id: contactId }, data: { status: 'CONNECTED' } });
    }

    // Re-fetch to include the action
    const result = await prisma.conversation.findUnique({
      where: { id: conversation.id },
      include: conversationIncludes,
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// PUT /api/conversations/:id — update
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.conversation.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const {
      contactsDiscussed,
      companiesDiscussed,
      createAction,
      ...data
    } = req.body;

    // Update conversation and replace junction records
    await prisma.$transaction(async (tx) => {
      // Delete existing junctions
      await tx.conversationContact.deleteMany({ where: { conversationId: id } });
      await tx.conversationCompany.deleteMany({ where: { conversationId: id } });

      // Update conversation
      await tx.conversation.update({
        where: { id },
        data: {
          ...data,
          contactsDiscussed: contactsDiscussed?.length
            ? {
                create: (contactsDiscussed as number[]).map((cId: number) => ({
                  contactId: cId,
                })),
              }
            : undefined,
          companiesDiscussed: companiesDiscussed?.length
            ? {
                create: (companiesDiscussed as number[]).map((cId: number) => ({
                  companyId: cId,
                })),
              }
            : undefined,
        },
      });
    });

    const result = await prisma.conversation.findUnique({
      where: { id },
      include: conversationIncludes,
    });
    res.json(result);
  } catch (error) {
    console.error('Error updating conversation:', error);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

// DELETE /api/conversations/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.conversation.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    await prisma.conversation.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

export default router;
