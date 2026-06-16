import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

// Slim include set for list cards (no actions/contactsDiscussed/companiesDiscussed —
// those stay on the contact-page view). Notes ARE included: the series view exists
// to read chronological notes, and pagination bounds the payload.
const meetingListInclude = {
  contact: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
  participants: {
    include: { contact: { select: { id: true, name: true } } },
    orderBy: { ordering: 'asc' as const },
  },
  orgs: { include: { company: { select: { id: true, name: true } } } },
  tags: { include: { tag: { select: { id: true, name: true } } } },
  series: { select: { id: true, name: true } },
  prepNotes: { orderBy: [{ ordering: 'asc' as const }, { date: 'desc' as const }] },
  attachments: true,
};

// Free-text ranking needs the discussed people/orgs too, so a meeting that
// matched only via a discussed name scores (instead of silently ranking 0).
const meetingRankInclude = {
  ...meetingListInclude,
  contactsDiscussed: { include: { contact: { select: { id: true, name: true } } } },
  companiesDiscussed: { include: { company: { select: { id: true, name: true } } } },
};

// Free-text (`q`) coverage: every meeting field, mirroring search.ts'
// conversationClausesFor so the Meetings box and global Search agree.
function meetingMatchClauses(term: string): Record<string, unknown>[] {
  return [
    { title: { contains: term } },
    { summary: { contains: term } },
    { notes: { contains: term } },
    { nextSteps: { contains: term } },
    { attendeesDescription: { contains: term } },
    { tags: { some: { tag: { name: { contains: term } } } } },
    { prepNotes: { some: { content: { contains: term } } } },
    { attachments: { some: { name: { contains: term } } } },
    { contact: { name: { contains: term } } },
    { company: { name: { contains: term } } },
    { orgs: { some: { company: { name: { contains: term } } } } },
    { participants: { some: { contact: { name: { contains: term } } } } },
    { participants: { some: { note: { contains: term } } } },
    { contactsDiscussed: { some: { contact: { name: { contains: term } } } } },
    { companiesDiscussed: { some: { company: { name: { contains: term } } } } },
  ];
}

// Relevance weight for a meeting against a free-text term (case-insensitive,
// matching SQLite LIKE). Highest matching field wins:
//   title=4 > people in the meeting=3 > org names + attendees desc=2 > rest=1.
function scoreMeeting(conv: any, termLower: string): number {
  let score = 0;
  const has = (v: string | null | undefined) => !!v && v.toLowerCase().includes(termLower);
  const bump = (n: number) => { if (n > score) score = n; };

  if (has(conv.title)) bump(4);
  // People in the meeting (anchor contact + participants)
  if (has(conv.contact?.name)) bump(3);
  for (const p of conv.participants || []) if (has(p.contact?.name)) bump(3);
  // Org names + attendees description
  if (has(conv.company?.name)) bump(2);
  for (const o of conv.orgs || []) if (has(o.company?.name)) bump(2);
  if (has(conv.attendeesDescription)) bump(2);
  // Everything else
  if (has(conv.summary)) bump(1);
  if (has(conv.notes)) bump(1);
  if (has(conv.nextSteps)) bump(1);
  for (const t of conv.tags || []) if (has(t.tag?.name)) bump(1);
  for (const pn of conv.prepNotes || []) if (has(pn.content)) bump(1);
  for (const a of conv.attachments || []) if (has(a.name)) bump(1);
  for (const p of conv.participants || []) if (has(p.note)) bump(1);
  for (const cd of conv.contactsDiscussed || []) if (has(cd.contact?.name)) bump(1);
  for (const cc of conv.companiesDiscussed || []) if (has(cc.company?.name)) bump(1);

  return score;
}

// Cap for the free-text ranking path: fetch a superset, rank in JS, then
// paginate the ranked array (same fetch-all-then-slice shape as series view).
const RANK_FETCH_CAP = 300;

// Sort whitelist for the default list path (the `q` ranking path keeps its own
// score-then-date order). Maps the client's sortBy to a real column.
const SORT_FIELDS = new Set(['date', 'updatedAt', 'createdAt']);

// GET /api/meetings — paginated list of all conversations with filters.
// Filters: seriesId (series view), title (contains, legacy), companyId, tagId,
// type, from/to (date range), q (weighted free text), id (single-meeting deep
// link). Sort: sortBy (date|updatedAt|createdAt) + sortDir (asc|desc), default
// date desc. Returns the standard pagination envelope.
router.get('/', async (req: Request, res: Response) => {
  try {
    const { title, seriesId, companyId, tagId, type, from, to, q, id, sortBy, sortDir, limit, offset } = req.query;

    const take = Math.min(parseInt(limit as string) || 20, 100);
    const skip = parseInt(offset as string) || 0;

    const AND: Record<string, unknown>[] = [];
    if (id) AND.push({ id: parseInt(id as string) });
    if (seriesId) AND.push({ seriesId: parseInt(seriesId as string) });
    if (type && type !== 'all') AND.push({ type });
    if (companyId) {
      // Match the anchor org OR any additional org on the meeting
      const cId = parseInt(companyId as string);
      AND.push({ OR: [{ companyId: cId }, { orgs: { some: { companyId: cId } } }] });
    }
    if (tagId) AND.push({ tags: { some: { tagId: parseInt(tagId as string) } } });
    if (from) AND.push({ date: { gte: from as string } });
    if (to) AND.push({ date: { lte: to as string } });

    const qTerm = typeof q === 'string' && q.trim() ? q.trim() : null;
    if (qTerm) AND.push({ OR: meetingMatchClauses(qTerm) });

    // Legacy `title` filter (kept for back-compat deep links): plain contains.
    // The series view now uses the `seriesId` param above.
    if (typeof title === 'string' && title.trim()) AND.push({ title: { contains: title.trim() } });

    const where = AND.length ? { AND } : {};

    // Resolve the sort order (default: meeting date, newest first).
    const sortField = SORT_FIELDS.has(sortBy as string) ? (sortBy as string) : 'date';
    const dir = sortDir === 'asc' ? 'asc' : 'desc';
    const orderBy = { [sortField]: dir } as Record<string, 'asc' | 'desc'>;

    // Weighted free-text path: fetch a capped superset of the filtered set,
    // score each meeting, then sort by score desc, date desc and paginate.
    if (qTerm) {
      const rows = await prisma.conversation.findMany({
        where,
        include: meetingRankInclude,
        orderBy: { date: 'desc' },
        take: RANK_FETCH_CAP,
      });
      const termLower = qTerm.toLowerCase();
      const ranked = rows
        .map((r) => ({ r, score: scoreMeeting(r, termLower) }))
        .sort((a, b) => b.score - a.score || (b.r.date || '').localeCompare(a.r.date || ''))
        .map((x) => x.r);
      const total = ranked.length;
      const data = ranked.slice(skip, skip + take);
      res.json({
        data,
        pagination: { total, limit: take, offset: skip, hasMore: skip + data.length < total },
      });
      return;
    }

    const [total, data] = await Promise.all([
      prisma.conversation.count({ where }),
      prisma.conversation.findMany({
        where,
        include: meetingListInclude,
        orderBy,
        take,
        skip,
      }),
    ]);

    res.json({
      data,
      pagination: { total, limit: take, offset: skip, hasMore: skip + data.length < total },
    });
  } catch (error) {
    console.error('Error fetching meetings:', error);
    res.status(500).json({ error: 'Failed to fetch meetings' });
  }
});

export default router;
