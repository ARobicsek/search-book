import { Router, Request, Response } from 'express';
import prisma from '../db';
import {
  resyncConversationMentions,
  looseMentionToken,
  resolvedMentionToken,
} from '../lib/mentions';

const router = Router();

// Fields needed to render a meeting's display name + a note snippet in the
// Mentions review surfaces (mirrors the client's conversationDisplayName inputs).
const mentionMeetingSelect = {
  id: true,
  title: true,
  date: true,
  datePrecision: true,
  type: true,
  notes: true,
  nextSteps: true,
  attendeesDescription: true,
  updatedAt: true,
  // Prep notes can hold @-mentions too; needed to snippet a prep-note-only mention.
  prepNotes: { select: { content: true } },
  contact: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
  participants: {
    select: { contact: { select: { id: true, name: true } } },
    orderBy: { ordering: 'asc' as const },
    take: 1,
  },
  mentions: {
    select: {
      id: true,
      mentionedName: true,
      contactId: true,
      contact: { select: { id: true, name: true } },
    },
    orderBy: { id: 'asc' as const },
  },
};

// GET /api/mentions — meetings that contain at least one @-mention, newest first.
// Optional `contactId` filters to meetings where THAT contact was mentioned
// (drives the "Mentioned in meetings" card on a contact). Standard pagination envelope.
router.get('/', async (req: Request, res: Response) => {
  try {
    const { contactId, limit, offset } = req.query;
    const take = Math.min(parseInt(limit as string) || 50, 100);
    const skip = parseInt(offset as string) || 0;

    const mentionFilter = contactId
      ? { some: { contactId: parseInt(contactId as string) } }
      : { some: {} };
    const where = { mentions: mentionFilter };

    const [total, data] = await Promise.all([
      prisma.conversation.count({ where }),
      prisma.conversation.findMany({
        where,
        select: mentionMeetingSelect,
        orderBy: { date: 'desc' },
        take,
        skip,
      }),
    ]);

    res.json({
      data,
      pagination: { total, limit: take, offset: skip, hasMore: skip + data.length < total },
    });
  } catch (error) {
    console.error('Error fetching mentions:', error);
    res.status(500).json({ error: 'Failed to fetch mentions' });
  }
});

// POST /api/mentions/:id/create-contact — turn a loose mention (a name that isn't
// a contact yet) into a real contact: create the contact, rewrite the note token
// from loose → bound, and re-sync the meeting's mentions. Returns the new contact.
router.post('/:id/create-contact', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const mention = await prisma.conversationMention.findUnique({
      where: { id },
      include: { conversation: { select: { id: true, notes: true, nextSteps: true } } },
    });
    if (!mention) {
      res.status(404).json({ error: 'Mention not found' });
      return;
    }
    if (mention.contactId) {
      res.status(400).json({ error: 'This mention is already linked to a contact' });
      return;
    }

    const name = mention.mentionedName.trim();
    const conv = mention.conversation;

    const result = await prisma.$transaction(async (tx) => {
      // Minimal contact stub — the client form's usual defaults (matches what a
      // new contact created elsewhere gets; the owner fleshes it out later).
      const contact = await tx.contact.create({
        data: { name, ecosystem: 'NETWORK', status: 'NONE' },
        select: { id: true, name: true },
      });

      // Rewrite every loose token for this exact name → a bound token, wherever
      // it appears: notes, next steps, AND prep notes. Literal string replace
      // (split/join) avoids regex-escaping the name.
      const loose = looseMentionToken(name);
      const bound = resolvedMentionToken(name, contact.id);
      const rewrite = (t: string | null) => (t ? t.split(loose).join(bound) : t);

      await tx.conversation.update({
        where: { id: conv.id },
        data: { notes: rewrite(conv.notes), nextSteps: rewrite(conv.nextSteps) },
      });

      const preps = await tx.conversationPrepNote.findMany({
        where: { conversationId: conv.id },
        select: { id: true, content: true },
      });
      for (const p of preps) {
        if (p.content && p.content.includes(loose)) {
          await tx.conversationPrepNote.update({
            where: { id: p.id },
            data: { content: rewrite(p.content)! },
          });
        }
      }

      await resyncConversationMentions(tx, conv.id);

      return contact;
    });

    res.status(201).json({ contact: result, conversationId: conv.id });
  } catch (error) {
    console.error('Error creating contact from mention:', error);
    res.status(500).json({ error: 'Failed to create contact from mention' });
  }
});

export default router;
