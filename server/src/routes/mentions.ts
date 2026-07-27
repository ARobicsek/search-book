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
import { resolveExistingCompanyByName } from './duplicates';

const router = Router();

// Loose structural type for the `$transaction` client (its generated type is
// heavily overloaded — same reason lib/mentions.ts hand-rolls MentionDb).
type BindTx = {
  conversation: { update(args: any): Promise<unknown> };
  conversationPrepNote: {
    findMany(args: any): Promise<{ id: number; content: string | null }[]>;
    update(args: any): Promise<unknown>;
  };
} & Parameters<typeof resyncConversationMentions>[0];

// Point every loose token for `name` — BOTH the person (`#mention`) and org
// (`#org-mention`) forms, so a name first mis-tagged as the wrong kind still
// resolves — at a real record, then re-derive the meeting's mention index from the
// new text. Covers notes, next steps AND prep notes. Literal string replace
// (split/join) avoids regex-escaping the name.
//
// The token's display text is left exactly as typed: the prose keeps the owner's
// wording while MentionChip renders the linked record's canonical name. That matters
// when linking to an existing record whose name differs from what was written
// ("Peterson Health" in the note → "Peterson Center on Healthcare" on the chip).
async function bindLooseTokens(
  tx: BindTx,
  conv: { id: number; notes: string | null; nextSteps: string | null },
  name: string,
  boundToken: string,
): Promise<void> {
  const loosePerson = looseMentionToken(name);
  const looseOrg = looseOrgMentionToken(name);
  const rewrite = (t: string | null) =>
    t ? t.split(loosePerson).join(boundToken).split(looseOrg).join(boundToken) : t;

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
}

// The contact counterpart of resolveExistingCompanyByName: an EXISTING contact whose
// name matches exactly (case-insensitively), or null. Prisma's `equals` is
// case-sensitive on SQLite while LIKE is not, so the candidate set is fetched with
// `contains` and the exact comparison is redone in JS (the pattern used throughout
// this codebase — see lib/mentions.ts mentionMatchesTarget).
async function resolveExistingContactByName(
  name: string,
): Promise<{ id: number; name: string } | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  const candidates = await prisma.contact.findMany({
    where: { name: { contains: trimmed } },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });
  return candidates.find((c) => c.name.trim().toLowerCase() === key) ?? null;
}

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

// POST /api/mentions/:id/create-contact — resolve a loose mention (a name that isn't
// bound to a CRM record yet) to a real contact: rewrite the note token from loose →
// bound and re-sync the meeting's mentions. Returns the contact and whether it was
// created or linked.
//
// ⚠ Find-or-create, NOT create. A loose token is inert text — nothing retro-binds it
// when a matching record appears later, so the mention stays "loose" and this button
// stays offered even once the contact exists. Creating blind here is what produced two
// duplicate organizations (see the create-company note below), so an exact
// (case-insensitive) name match binds to the existing contact instead.
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
    const existing = await resolveExistingContactByName(name);

    const result = await prisma.$transaction(async (tx) => {
      // Minimal contact stub — the client form's usual defaults (matches what a
      // new contact created elsewhere gets; the owner fleshes it out later).
      const contact =
        existing ??
        (await tx.contact.create({
          data: { name, ecosystem: 'NETWORK', status: 'NONE' },
          select: { id: true, name: true },
        }));

      await bindLooseTokens(tx, conv, name, resolvedMentionToken(name, contact.id));
      return contact;
    });

    res.status(201).json({ contact: result, linked: !!existing, conversationId: conv.id });
  } catch (error) {
    console.error('Error creating contact from mention:', error);
    res.status(500).json({ error: 'Failed to create contact from mention' });
  }
});

// POST /api/mentions/:id/create-company — the org counterpart of create-contact:
// resolve a loose mention to a real organization, rewrite its tokens
// (loose → bound) across notes / next steps / prep notes, and re-sync.
//
// ⚠ Find-or-create, NOT create. This used to call company.create blind, which is how
// "Peterson Center on Healthcare" and "Battelle" each ended up with two rows: the org
// was created the normal way *after* the note was written, the note's token stayed
// loose, and clicking "Create" here minted a second one. It now goes through
// resolveExistingCompanyByName — the same find-or-create used by POST
// /companies/resolve, which also honors prior merge decisions, so a name already
// merged away resolves to its surviving org rather than reappearing.
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
    const existing = await resolveExistingCompanyByName(name);

    const result = await prisma.$transaction(async (tx) => {
      // Minimal org stub — blank status (sentinel), filled out later by the owner.
      const company =
        existing ??
        (await tx.company.create({
          data: { name, status: 'NONE' },
          select: { id: true, name: true },
        }));

      await bindLooseTokens(tx, conv, name, resolvedOrgMentionToken(name, company.id));
      return company;
    });

    res.status(201).json({ company: result, linked: !!existing, conversationId: conv.id });
  } catch (error) {
    console.error('Error creating organization from mention:', error);
    res.status(500).json({ error: 'Failed to create organization from mention' });
  }
});

// POST /api/mentions/:id/link — bind a loose mention to an EXISTING record the owner
// picks: body `{ contactId }` or `{ companyId }` (exactly one). Creates nothing.
//
// The create-* routes above only auto-bind on an *exact* name match, which leaves the
// common near-miss unserved: a note says "@Peterson Health" and the org is filed as
// "Peterson Center on Healthcare". Without this, the only affordance was "Create" —
// i.e. the duplicate-producing path. The note's wording is preserved; only the token's
// target changes.
router.post('/:id/link', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { contactId, companyId } = req.body as { contactId?: unknown; companyId?: unknown };
    const wantContact = Number.isInteger(contactId) && (contactId as number) > 0;
    const wantCompany = Number.isInteger(companyId) && (companyId as number) > 0;
    if (wantContact === wantCompany) {
      res.status(400).json({ error: 'Provide exactly one of contactId or companyId' });
      return;
    }

    const mention = await prisma.conversationMention.findUnique({
      where: { id },
      include: { conversation: { select: { id: true, notes: true, nextSteps: true } } },
    });
    if (!mention) {
      res.status(404).json({ error: 'Mention not found' });
      return;
    }
    // Only a loose mention can be linked. A bound one is already pointing at a record;
    // re-pointing it is an edit of the note, not this one-click resolution.
    if (mention.contactId || mention.companyId) {
      res.status(400).json({ error: 'This mention is already linked to a record' });
      return;
    }

    const name = mention.mentionedName.trim();
    const conv = mention.conversation;

    const target = wantContact
      ? await prisma.contact.findUnique({ where: { id: contactId as number }, select: { id: true, name: true } })
      : await prisma.company.findUnique({ where: { id: companyId as number }, select: { id: true, name: true } });
    if (!target) {
      res.status(404).json({ error: wantContact ? 'Contact not found' : 'Organization not found' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      const bound = wantContact
        ? resolvedMentionToken(name, target.id)
        : resolvedOrgMentionToken(name, target.id);
      await bindLooseTokens(tx, conv, name, bound);
    });

    res.json(
      wantContact
        ? { contact: target, linked: true, conversationId: conv.id }
        : { company: target, linked: true, conversationId: conv.id },
    );
  } catch (error) {
    console.error('Error linking mention:', error);
    res.status(500).json({ error: 'Failed to link mention' });
  }
});

export default router;
