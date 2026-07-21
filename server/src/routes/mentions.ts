import { Router, Request, Response } from 'express';
import prisma from '../db';
import {
  resyncConversationMentions,
  mentionMeetingSelect,
  looseMentionToken,
  resolvedMentionToken,
  looseOrgMentionToken,
  resolvedOrgMentionToken,
} from '../lib/mentions';

const router = Router();

// GET /api/mentions — meetings that contain at least one @-mention, newest first.
// Optional `contactId` filters to meetings where THAT contact was mentioned, and
// `companyId` to meetings where THAT organization was mentioned (these drive the
// "Mentioned in Meetings" cards on a contact / organization). Pagination envelope.
router.get('/', async (req: Request, res: Response) => {
  try {
    const { contactId, companyId, limit, offset } = req.query;
    const take = Math.min(parseInt(limit as string) || 50, 100);
    const skip = parseInt(offset as string) || 0;

    const mentionFilter = contactId
      ? { some: { contactId: parseInt(contactId as string) } }
      : companyId
        ? { some: { companyId: parseInt(companyId as string) } }
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

// GET /api/mentions/index?q=&limit= — the distinct people/organizations that have
// actually BEEN @-mentioned, each with the number of meetings it was mentioned in.
// This backs the "@" picker in global search: you can't type the exact spelling of a
// name if you can't see it, so the picker offers the real spellings — including loose
// names that were never made contacts — and every option is guaranteed to have a hit.
//
// Aggregated in JS rather than with groupBy/_count (the Turso adapter gotcha). Mention
// rows are already one-per-meeting-per-entity, so a row count IS a meeting count.
router.get('/index', async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    const rows = await prisma.conversationMention.findMany({
      where: q
        ? {
          OR: [
            { mentionedName: { contains: q } },
            { contact: { name: { contains: q } } },
            { contact: { preferredName: { contains: q } } },
            { company: { name: { contains: q } } },
          ],
        }
        : undefined,
      select: {
        kind: true,
        mentionedName: true,
        contactId: true,
        contact: { select: { id: true, name: true } },
        companyId: true,
        company: { select: { id: true, name: true } },
      },
      take: 500,
    });

    // One entry per distinct target. A mention bound to a CRM record is keyed by id
    // (so two people with the same name stay distinct, and a later rename doesn't
    // split the group); a loose mention is keyed by its lowercased name + kind.
    type Entry = { key: string; kind: string; name: string; bound: boolean; count: number };
    const byKey = new Map<string, Entry>();
    for (const row of rows) {
      let key: string;
      let name: string;
      if (row.contact) {
        key = `contact:${row.contact.id}`;
        name = row.contact.name;
      } else if (row.company) {
        key = `company:${row.company.id}`;
        name = row.company.name;
      } else {
        const loose = row.kind === 'COMPANY' ? 'org' : 'person';
        key = `${loose}:${row.mentionedName.trim().toLowerCase()}`;
        name = row.mentionedName.trim();
      }
      const existing = byKey.get(key);
      if (existing) existing.count += 1;
      else byKey.set(key, { key, kind: row.kind, name, bound: !!(row.contact || row.company), count: 1 });
    }

    // Most-mentioned first — with a bare "@" (no query) that makes the picker a
    // useful "who comes up most" list rather than an arbitrary slice.
    const data = [...byKey.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .slice(0, limit);

    res.json(data);
  } catch (error) {
    console.error('Error building mention index:', error);
    res.status(500).json({ error: 'Failed to load mentions' });
  }
});

// POST /api/mentions/:id/create-contact — turn a loose mention (a name that isn't
// in the CRM yet) into a real contact: create the contact, rewrite the note token
// from loose → bound, and re-sync the meeting's mentions. Returns the new contact.
//
// Works on a mention that was loosely tagged as *either* a person OR an organization
// — mis-picking "organization" for a person on a first-time @-mention is an easy slip,
// and this is the one-click recovery for it. Both loose token forms (`#mention` and
// `#org-mention`) are rewritten, so the note stops re-deriving the wrong kind on the
// next save.
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
    // A mention already bound to a real organization isn't a loose name — turning a
    // created org into a contact is a different, destructive operation, not this.
    if (mention.companyId) {
      res.status(400).json({ error: 'This mention is already linked to an organization' });
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

      // Rewrite every loose token for this exact name → a bound contact token,
      // wherever it appears: notes, next steps, AND prep notes. Rewrites BOTH the
      // person (`#mention`) and org (`#org-mention`) loose forms, so a name first
      // mis-tagged as an organization still resolves to the new contact. Literal
      // string replace (split/join) avoids regex-escaping the name.
      const loosePerson = looseMentionToken(name);
      const looseOrg = looseOrgMentionToken(name);
      const bound = resolvedMentionToken(name, contact.id);
      const rewrite = (t: string | null) =>
        t ? t.split(loosePerson).join(bound).split(looseOrg).join(bound) : t;

      await tx.conversation.update({
        where: { id: conv.id },
        data: { notes: rewrite(conv.notes), nextSteps: rewrite(conv.nextSteps) },
      });

      const preps = await tx.conversationPrepNote.findMany({
        where: { conversationId: conv.id },
        select: { id: true, content: true },
      });
      for (const p of preps) {
        if (p.content && (p.content.includes(loosePerson) || p.content.includes(looseOrg))) {
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

// POST /api/mentions/:id/create-company — the org counterpart of create-contact:
// turn a loose mention into a real organization, rewrite its tokens
// (loose → bound) across notes / next steps / prep notes, and re-sync.
//
// Symmetric with create-contact: accepts a loose mention tagged as either a person
// OR an organization, so a name first mis-tagged as a person can still be made into
// an org here. Both loose token forms are rewritten.
router.post('/:id/create-company', async (req: Request, res: Response) => {
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
    if (mention.companyId) {
      res.status(400).json({ error: 'This mention is already linked to an organization' });
      return;
    }
    // A mention already bound to a real contact isn't a loose name — turning a
    // created contact into an org is a different, destructive operation, not this.
    if (mention.contactId) {
      res.status(400).json({ error: 'This mention is already linked to a contact' });
      return;
    }

    const name = mention.mentionedName.trim();
    const conv = mention.conversation;

    const result = await prisma.$transaction(async (tx) => {
      // Minimal org stub — blank status (sentinel), filled out later by the owner.
      const company = await tx.company.create({
        data: { name, status: 'NONE' },
        select: { id: true, name: true },
      });

      // Rewrite BOTH loose forms (`#mention` and `#org-mention`) → a bound org token,
      // so a name first mis-tagged as a person still resolves to the new org.
      const loosePerson = looseMentionToken(name);
      const looseOrg = looseOrgMentionToken(name);
      const bound = resolvedOrgMentionToken(name, company.id);
      const rewrite = (t: string | null) =>
        t ? t.split(loosePerson).join(bound).split(looseOrg).join(bound) : t;

      await tx.conversation.update({
        where: { id: conv.id },
        data: { notes: rewrite(conv.notes), nextSteps: rewrite(conv.nextSteps) },
      });

      const preps = await tx.conversationPrepNote.findMany({
        where: { conversationId: conv.id },
        select: { id: true, content: true },
      });
      for (const p of preps) {
        if (p.content && (p.content.includes(loosePerson) || p.content.includes(looseOrg))) {
          await tx.conversationPrepNote.update({
            where: { id: p.id },
            data: { content: rewrite(p.content)! },
          });
        }
      }

      await resyncConversationMentions(tx, conv.id);

      return company;
    });

    res.status(201).json({ company: result, conversationId: conv.id });
  } catch (error) {
    console.error('Error creating organization from mention:', error);
    res.status(500).json({ error: 'Failed to create organization from mention' });
  }
});

export default router;
