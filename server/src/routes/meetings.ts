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
  },
  tags: { include: { tag: { select: { id: true, name: true } } } },
  prepNotes: { orderBy: [{ ordering: 'asc' as const }, { date: 'desc' as const }] },
  attachments: true,
};

// GET /api/meetings — paginated list of all conversations with filters.
// Filters: title (series view: case-insensitive exact), companyId, tagId, type,
// from/to (date range), q (free text), id (single-meeting deep link from search).
// Returns the standard pagination envelope.
router.get('/', async (req: Request, res: Response) => {
  try {
    const { title, companyId, tagId, type, from, to, q, id, limit, offset } = req.query;

    const take = Math.min(parseInt(limit as string) || 20, 100);
    const skip = parseInt(offset as string) || 0;

    const AND: Record<string, unknown>[] = [];
    if (id) AND.push({ id: parseInt(id as string) });
    if (type && type !== 'all') AND.push({ type });
    if (companyId) AND.push({ companyId: parseInt(companyId as string) });
    if (tagId) AND.push({ tags: { some: { tagId: parseInt(tagId as string) } } });
    if (from) AND.push({ date: { gte: from as string } });
    if (to) AND.push({ date: { lte: to as string } });
    if (q && typeof q === 'string' && q.trim()) {
      const term = q.trim();
      AND.push({
        OR: [
          { title: { contains: term } },
          { summary: { contains: term } },
          { notes: { contains: term } },
          { attendeesDescription: { contains: term } },
          { contact: { name: { contains: term } } },
          { company: { name: { contains: term } } },
          { participants: { some: { contact: { name: { contains: term } } } } },
        ],
      });
    }

    // Series filter: SQLite `contains` is case-insensitive; narrow in the DB,
    // then enforce exact (case-insensitive) match in JS. A single series is
    // small, so JS pagination is fine on this path.
    const seriesTitle = typeof title === 'string' && title.trim() ? title.trim() : null;
    if (seriesTitle) AND.push({ title: { contains: seriesTitle } });

    const where = AND.length ? { AND } : {};

    if (seriesTitle) {
      const rows = await prisma.conversation.findMany({
        where,
        include: meetingListInclude,
        orderBy: { date: 'desc' },
      });
      const exact = rows.filter(
        (r) => (r.title || '').trim().toLowerCase() === seriesTitle.toLowerCase()
      );
      const total = exact.length;
      const data = exact.slice(skip, skip + take);
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
    console.error('Error fetching meetings:', error);
    res.status(500).json({ error: 'Failed to fetch meetings' });
  }
});

export default router;
