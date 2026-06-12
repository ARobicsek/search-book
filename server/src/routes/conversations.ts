import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

const conversationIncludes = {
  contact: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
  participants: {
    include: { contact: { select: { id: true, name: true } } },
  },
  contactsDiscussed: {
    include: { contact: { select: { id: true, name: true } } },
  },
  companiesDiscussed: {
    include: { company: { select: { id: true, name: true } } },
  },
  orgs: {
    include: { company: { select: { id: true, name: true } } },
  },
  tags: { include: { tag: { select: { id: true, name: true } } } },
  actions: { select: { id: true, title: true, completed: true, dueDate: true } },
  prepNotes: { orderBy: [{ ordering: 'asc' as const }, { date: 'desc' as const }] },
  attachments: true,
};

// Participant input: new shape { contactId, note? }[] via `participants`, or the
// legacy `participantIds: number[]`. Normalized to the new shape.
type ParticipantInput = { contactId: number; note?: string | null };

function normalizeParticipants(body: Record<string, unknown>): ParticipantInput[] | undefined {
  if (Array.isArray(body.participants)) {
    return (body.participants as ParticipantInput[])
      .filter((p) => p && typeof p.contactId === 'number')
      .map((p) => ({ contactId: p.contactId, note: p.note?.toString().trim() || null }));
  }
  if (Array.isArray(body.participantIds)) {
    return (body.participantIds as number[]).map((contactId) => ({ contactId, note: null }));
  }
  return undefined;
}

// A meeting needs at least one "who" facet: title, anchor contact, org anchor,
// a named participant, or a free-text attendees description.
function hasWho(state: {
  contactId: number | null;
  title: string | null;
  companyId: number | null;
  attendeesDescription: string | null;
  participantCount: number;
}): boolean {
  return !!(
    state.contactId ||
    state.title?.trim() ||
    state.companyId ||
    state.attendeesDescription?.trim() ||
    state.participantCount > 0
  );
}

const WHO_REQUIRED_MESSAGE =
  'A meeting needs at least one of: title, contact, organization, participants, or attendees description';

// GET /api/conversations/titles — distinct meeting titles for autocomplete
// (series key, D4). Most-recently-used first; case-insensitive de-dupe.
// NOTE: must be registered before '/:id'.
router.get('/titles', async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.conversation.findMany({
      where: { title: { not: null } },
      select: { title: true },
      orderBy: { date: 'desc' },
    });
    const seen = new Set<string>();
    const titles: string[] = [];
    for (const row of rows) {
      const t = (row.title || '').trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        titles.push(t);
      }
    }
    res.json(titles);
  } catch (error) {
    console.error('Error fetching conversation titles:', error);
    res.status(500).json({ error: 'Failed to fetch conversation titles' });
  }
});

// GET /api/conversations — list with optional contactId filter.
// contactId matches the anchor contact OR a named participant, so multi-person
// meetings show up on every attendee's page.
router.get('/', async (req: Request, res: Response) => {
  try {
    const { contactId } = req.query;
    const where: Record<string, unknown> = {};
    if (contactId) {
      const cId = parseInt(contactId as string);
      where.OR = [
        { contactId: cId },
        { participants: { some: { contactId: cId } } },
      ];
    }

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
      title,
      companyId,
      attendeesDescription,
      date,
      datePrecision,
      type,
      summary,
      notes,
      nextSteps,
      links,
      photoFile,
      contactsDiscussed,   // number[] of contact IDs
      companiesDiscussed,  // number[] of company IDs
      orgIds,              // number[] of ADDITIONAL org IDs (first org is companyId)
      tagIds,              // number[] of tag IDs
      createAction,        // optional single action (legacy): { title, type, dueDate, priority }
      createActions,       // optional array of actions: { title, type, dueDate, priority }[]
      linkActionIds,       // optional array of existing action IDs to link to this conversation
    } = req.body;

    if (!date) {
      res.status(400).json({ error: 'date is required' });
      return;
    }

    const participants = normalizeParticipants(req.body) ?? [];
    const anchorContactId = contactId ? Number(contactId) : null;
    const anchorCompanyId = companyId ? Number(companyId) : null;

    if (
      !hasWho({
        contactId: anchorContactId,
        title: title ?? null,
        companyId: anchorCompanyId,
        attendeesDescription: attendeesDescription ?? null,
        participantCount: participants.length,
      })
    ) {
      res.status(400).json({ error: WHO_REQUIRED_MESSAGE });
      return;
    }

    // Task 12: create the conversation and all its follow-ups (actions, link-ups, status
    // flip, links, contact bump) in one transaction so a partial failure can't leave a
    // logged call without its follow-up tasks.
    const conversation = await prisma.$transaction(async (tx) => {
      const created = await tx.conversation.create({
        data: {
          contactId: anchorContactId,
          title: title?.trim() || null,
          companyId: anchorCompanyId,
          attendeesDescription: attendeesDescription?.trim() || null,
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
          participants: participants.length
            ? {
              create: participants.map((p) => ({
                contactId: p.contactId,
                note: p.note || null,
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
          orgs: orgIds?.length
            ? {
              create: (orgIds as number[])
                .filter((cId) => cId !== anchorCompanyId)
                .map((cId) => ({ companyId: cId })),
            }
            : undefined,
          tags: tagIds?.length
            ? {
              create: (tagIds as number[]).map((tId) => ({
                tagId: tId,
              })),
            }
            : undefined,
        },
        include: conversationIncludes,
      });

      // Create multiple follow-up actions
      const actionsToCreate = createActions?.filter((a: { title: string }) => a.title?.trim()) || [];
      // Legacy support: single createAction
      if (createAction?.title?.trim()) {
        actionsToCreate.push(createAction);
      }

      for (const action of actionsToCreate) {
        await tx.action.create({
          data: {
            title: action.title.trim(),
            type: action.type || 'FOLLOW_UP',
            dueDate: action.dueDate || null,
            priority: action.priority || 'MEDIUM',
            contactId: anchorContactId,
            conversationId: created.id,
          },
        });
      }

      if (linkActionIds?.length) {
        await tx.action.updateMany({
          where: { id: { in: linkActionIds as number[] } },
          data: { conversationId: created.id },
        });
      }

      if (anchorContactId) {
        // Auto-update contact status to CONNECTED if currently blank
        const relatedContact = await tx.contact.findUnique({
          where: { id: anchorContactId },
          select: { status: true },
        });
        if (relatedContact && relatedContact.status === 'NONE') {
          await tx.contact.update({ where: { id: anchorContactId }, data: { status: 'CONNECTED' } });
        }
      }

      // Save links if provided
      if (links?.length) {
        for (const link of links as { url: string; title: string }[]) {
          if (link.url?.trim()) {
            await tx.link.create({
              data: {
                url: link.url.trim(),
                title: link.title?.trim() || link.url.trim(),
                contactId: anchorContactId,
              },
            });
          }
        }
      }

      // Update Contact.updatedAt to bubble up in "Recent Activity" sort
      if (anchorContactId) {
        await tx.contact.update({
          where: { id: anchorContactId },
          data: { updatedAt: new Date() },
        });
      }

      return created;
    });

    // Re-fetch to include the actions
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

// Task 18 pattern: explicit allow-list of client-writable Conversation columns.
const CONVERSATION_WRITABLE_FIELDS = [
  'contactId', 'title', 'companyId', 'attendeesDescription',
  'date', 'datePrecision', 'type', 'summary', 'notes', 'nextSteps', 'photoFile',
] as const;

// PUT /api/conversations/:id — update
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.conversation.findUnique({
      where: { id },
      include: { participants: { select: { contactId: true } } },
    });
    if (!existing) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const {
      contactsDiscussed,
      companiesDiscussed,
      orgIds,
      tagIds,
      createAction,
      createActions,
      linkActionIds,
    } = req.body;

    const participants = normalizeParticipants(req.body);

    // Only allow-listed scalar columns; normalize empty strings to null on the
    // optional "who" facets so clearing a field actually clears it.
    const data: Record<string, unknown> = {};
    for (const key of CONVERSATION_WRITABLE_FIELDS) {
      if (key in req.body) data[key] = req.body[key];
    }
    if ('contactId' in data) data.contactId = data.contactId ? Number(data.contactId) : null;
    if ('companyId' in data) data.companyId = data.companyId ? Number(data.companyId) : null;
    if ('title' in data) data.title = (data.title as string | null)?.toString().trim() || null;
    if ('attendeesDescription' in data) {
      data.attendeesDescription = (data.attendeesDescription as string | null)?.toString().trim() || null;
    }

    // Enforce the ≥1-who rule against the post-update state.
    const finalState = {
      contactId: ('contactId' in data ? data.contactId : existing.contactId) as number | null,
      title: ('title' in data ? data.title : existing.title) as string | null,
      companyId: ('companyId' in data ? data.companyId : existing.companyId) as number | null,
      attendeesDescription: ('attendeesDescription' in data
        ? data.attendeesDescription
        : existing.attendeesDescription) as string | null,
      participantCount: participants !== undefined ? participants.length : existing.participants.length,
    };
    if (!hasWho(finalState)) {
      res.status(400).json({ error: WHO_REQUIRED_MESSAGE });
      return;
    }

    // Task 12: update conversation, replace junctions, and create follow-ups all in one
    // transaction so an update can't half-apply (junctions replaced but follow-ups lost).
    await prisma.$transaction(async (tx) => {
      // Replace junctions only when the corresponding key is present in the body,
      // so partial updates can't silently wipe them.
      if (contactsDiscussed !== undefined) {
        await tx.conversationContact.deleteMany({ where: { conversationId: id } });
      }
      if (companiesDiscussed !== undefined) {
        await tx.conversationCompany.deleteMany({ where: { conversationId: id } });
      }
      if (orgIds !== undefined) {
        await tx.conversationOrg.deleteMany({ where: { conversationId: id } });
      }
      if (participants !== undefined) {
        await tx.conversationParticipant.deleteMany({ where: { conversationId: id } });
      }
      if (tagIds !== undefined) {
        await tx.conversationTag.deleteMany({ where: { conversationId: id } });
      }

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
          participants: participants?.length
            ? {
              create: participants.map((p) => ({
                contactId: p.contactId,
                note: p.note || null,
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
          orgs: orgIds?.length
            ? {
              create: (orgIds as number[])
                .filter((cId: number) => cId !== finalState.companyId)
                .map((cId: number) => ({ companyId: cId })),
            }
            : undefined,
          tags: tagIds?.length
            ? {
              create: (tagIds as number[]).map((tId: number) => ({
                tagId: tId,
              })),
            }
            : undefined,
        },
      });

      // Create follow-up actions if provided
      const actionsToCreate = createActions?.filter((a: { title: string }) => a.title?.trim()) || [];
      if (createAction?.title?.trim()) {
        actionsToCreate.push(createAction);
      }

      const actionAnchorId = finalState.contactId;
      for (const action of actionsToCreate) {
        await tx.action.create({
          data: {
            title: action.title.trim(),
            type: action.type || 'FOLLOW_UP',
            dueDate: action.dueDate || null,
            priority: action.priority || 'MEDIUM',
            contactId: actionAnchorId,
            conversationId: id,
          },
        });
      }

      if (linkActionIds?.length) {
        await tx.action.updateMany({
          where: { id: { in: linkActionIds as number[] } },
          data: { conversationId: id },
        });
      }

      // Update Contact.updatedAt on the anchor contact (old and new if re-anchored)
      const bumpIds = new Set<number>();
      if (existing.contactId) bumpIds.add(existing.contactId);
      if (finalState.contactId) bumpIds.add(finalState.contactId);
      for (const cId of bumpIds) {
        await tx.contact.update({
          where: { id: cId },
          data: { updatedAt: new Date() },
        });
      }
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

    // Update Contact.updatedAt on the anchor contact, if any
    if (existing.contactId) {
      await prisma.contact.update({
        where: { id: existing.contactId },
        data: { updatedAt: new Date() },
      });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

export default router;
