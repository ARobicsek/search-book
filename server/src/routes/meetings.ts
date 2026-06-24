import { Router, Request, Response } from 'express';
import prisma from '../db';
import { currentEmployerCompanyIds } from '../company-status';

const router = Router();

// Slim include set for list cards (no actions/contactsDiscussed/companiesDiscussed —
// those stay on the contact-page view). Notes ARE included: the series view exists
// to read chronological notes, and pagination bounds the payload.
const meetingListInclude = {
  contact: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
  participants: {
    // preferredName + title + primary employer power the hover tooltip on participant chips.
    include: {
      contact: {
        select: { id: true, name: true, preferredName: true, title: true, company: { select: { name: true } } },
      },
    },
    orderBy: { ordering: 'asc' as const },
  },
  orgs: { include: { company: { select: { id: true, name: true } } } },
  tags: { include: { tag: { select: { id: true, name: true } } } },
  series: { select: { id: true, name: true } },
  prepNotes: { orderBy: [{ ordering: 'asc' as const }, { date: 'desc' as const }] },
  attachments: true,
};

// Sort whitelist for the list. Maps the client's sortBy to a real column.
const SORT_FIELDS = new Set(['date', 'updatedAt', 'createdAt']);

// Org filter, widened: a meeting matches `companyId` when the company is the
// meeting's anchor/additional org OR when the meeting's anchor contact / any named
// participant CURRENTLY works there. The "currently works there" set can't be
// queried precisely against the contacts' JSON `additionalCompanyIds`, so we
// prefilter candidates with a cheap substring match and confirm each with the
// shared `currentEmployerCompanyIds` rule. Single-user dataset → sub-second; if a
// future dataset made this slow we'd drop the employee expansion, not page it.
async function meetingOrgClauses(companyId: number): Promise<Record<string, unknown>[]> {
  const clauses: Record<string, unknown>[] = [
    { companyId },                     // anchor org
    { orgs: { some: { companyId } } }, // additional orgs the meeting was WITH
  ];
  const candidates = await prisma.contact.findMany({
    where: {
      OR: [
        { companyId },
        { additionalCompanyIds: { contains: `${companyId}` } },
      ],
    },
    select: { id: true, companyId: true, additionalCompanyIds: true },
  });
  const employeeIds = candidates
    .filter((c) => currentEmployerCompanyIds(c).includes(companyId))
    .map((c) => c.id);
  if (employeeIds.length) {
    clauses.push({ contactId: { in: employeeIds } });                              // anchor contact (1:1 legacy)
    clauses.push({ participants: { some: { contactId: { in: employeeIds } } } });  // named participant
  }
  return clauses;
}

// GET /api/meetings — paginated list of all conversations with filters.
// Filters: seriesId (series view), title (contains, legacy), companyId (org field
// OR a current employee of that org attended), tagId, type, from/to (date range),
// q (title / participant name / series name contains — people/orgs/tags have their own filters), id
// (single-meeting deep link). Sort: sortBy (date|updatedAt|createdAt) + sortDir
// (asc|desc), default date desc. Returns the standard pagination envelope.
router.get('/', async (req: Request, res: Response) => {
  try {
    const { title, seriesId, companyId, tagId, type, from, to, q, id, sortBy, sortDir, limit, offset } = req.query;

    const take = Math.min(parseInt(limit as string) || 20, 100);
    const skip = parseInt(offset as string) || 0;

    const AND: Record<string, unknown>[] = [];
    if (id) AND.push({ id: parseInt(id as string) });
    if (seriesId) AND.push({ seriesId: parseInt(seriesId as string) });
    if (type && type !== 'all') AND.push({ type });
    if (companyId) AND.push({ OR: await meetingOrgClauses(parseInt(companyId as string)) });
    if (tagId) AND.push({ tags: { some: { tagId: parseInt(tagId as string) } } });
    if (from) AND.push({ date: { gte: from as string } });
    if (to) AND.push({ date: { lte: to as string } });

    // Free-text search matches the meeting's TITLE, any named PARTICIPANT, and its
    // SERIES name (owner ask). For UNTITLED meetings it also matches the rest of the
    // name shown in the title's place (anchor contact → org → attendees text,
    // mirroring the client's conversationDisplayName), so the heading stays findable.
    // Notes/summaries/tags stay out — they have their own filters above.
    const qTerm = typeof q === 'string' && q.trim() ? q.trim() : null;
    if (qTerm) {
      AND.push({
        OR: [
          { title: { contains: qTerm } },
          { participants: { some: { contact: { name: { contains: qTerm } } } } },
          { series: { name: { contains: qTerm } } },
          {
            AND: [
              { OR: [{ title: null }, { title: '' }] },
              {
                OR: [
                  { contact: { name: { contains: qTerm } } },
                  { company: { name: { contains: qTerm } } },
                  { attendeesDescription: { contains: qTerm } },
                ],
              },
            ],
          },
        ],
      });
    }

    // Legacy `title` filter (kept for back-compat deep links): plain contains.
    // The series view now uses the `seriesId` param above.
    if (typeof title === 'string' && title.trim()) AND.push({ title: { contains: title.trim() } });

    const where = AND.length ? { AND } : {};

    // Resolve the sort order (default: meeting date, newest first).
    const sortField = SORT_FIELDS.has(sortBy as string) ? (sortBy as string) : 'date';
    const dir = sortDir === 'asc' ? 'asc' : 'desc';
    const orderBy = { [sortField]: dir } as Record<string, 'asc' | 'desc'>;

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
