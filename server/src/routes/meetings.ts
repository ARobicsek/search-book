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
  links: { orderBy: { createdAt: 'asc' as const } },
};

// Sort whitelist for the list. Maps the client's sortBy to a real column.
const SORT_FIELDS = new Set(['date', 'updatedAt', 'createdAt']);

// End-of-business cutoff (Eastern) for today's untimed meetings — kept in sync with
// the client's isUpcomingMeeting rule.
const END_OF_BUSINESS = '17:00';

// Mirror of the client's `isUpcomingMeeting`, as a where-fragment that KEEPS only
// meetings that are NOT upcoming — used directly by the "hide upcoming" mode, and
// negated (Prisma NOT) by the "upcoming only" mode so the two are exact complements.
// `today` (YYYY-MM-DD) and `now` (HH:MM) are the client's Eastern wall clock; meeting
// dates and start times are stored in ET, so the cutoff is correct regardless of the
// server's timezone. Upcoming = a future date, OR today with a start time still
// ahead of now, OR today & untimed & before 5 PM ET & nothing written up yet; this
// returns the complement of that set.
function notUpcomingClause(today: string, now: string): Record<string, unknown> {
  // "Documented" = at least one of summary / notes / next steps is a non-empty
  // string (prep notes are pre-meeting, so they don't count).
  const documented = {
    NOT: {
      AND: [
        { OR: [{ summary: null }, { summary: '' }] },
        { OR: [{ notes: null }, { notes: '' }] },
        { OR: [{ nextSteps: null }, { nextSteps: '' }] },
      ],
    },
  };
  const keep: Record<string, unknown>[] = [
    { date: { lt: today } },                                 // past dates
    { AND: [{ date: today }, { startTime: { lte: now } }] }, // today, timed, already started
    // Today & untimed: not upcoming once past end of business, or if already written up.
    now < END_OF_BUSINESS
      ? { AND: [{ date: today }, { startTime: null }, documented] }
      : { AND: [{ date: today }, { startTime: null }] },
  ];
  return { OR: keep };
}

// How long a timed meeting is assumed to run when no end time was recorded — mirrors the
// client's ASSUMED_MEETING_MINUTES (client/src/lib/meeting-time.ts).
const ASSUMED_MEETING_MINUTES = 60;

// Add minutes to an "HH:MM" wall clock, clamped to the end of the day (a single-day
// record can't hold an end that reads as earlier than its start).
function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  if (!Number.isFinite(total)) return hhmm;
  if (total >= 24 * 60) return '23:59';
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Mirror of the client's `isHappeningNow`: a timed meeting is in progress when its start
// has passed and it hasn't ended — the recorded endTime, or start + ASSUMED_MEETING_MINUTES
// when none was recorded (or when a stored end reads as earlier than the start, which a
// midnight-crossing import leaves behind). Kept as an app-code check rather than a
// where-clause because that assumed-end arithmetic doesn't translate to a column
// comparison; the caller narrows the rows to one day's started meetings first, so the
// set it runs over is tiny. Keep in sync with the client rule — that's the one the
// green "Now" marker reads.
function isHappeningNow(meeting: { startTime: string | null; endTime: string | null }, now: string): boolean {
  if (!meeting.startTime) return false;
  const end =
    meeting.endTime && meeting.endTime > meeting.startTime
      ? meeting.endTime
      : addMinutes(meeting.startTime, ASSUMED_MEETING_MINUTES);
  return meeting.startTime <= now && now < end;
}

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
// (single-meeting deep link), hideUpcoming (drop not-yet-happened meetings) /
// onlyUpcoming (keep ONLY them; both need the client's ET today+now, hideUpcoming
// wins if both are sent). Sort: sortBy (date|updatedAt|createdAt) + sortDir
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

    // Past/upcoming scoping: hideUpcoming drops meetings that haven't happened yet,
    // onlyUpcoming keeps ONLY those (the NOT of the same clause, so the two modes
    // partition the list exactly). The client sends its Eastern-time `today`
    // (YYYY-MM-DD) + `now` (HH:MM); skip the filter if either is missing/malformed
    // rather than guessing the wrong clock server-side.
    const hideUpcoming = req.query.hideUpcoming === '1' || req.query.hideUpcoming === 'true';
    const onlyUpcoming = req.query.onlyUpcoming === '1' || req.query.onlyUpcoming === 'true';
    const todayParam = typeof req.query.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.today) ? req.query.today : null;
    const nowParam = typeof req.query.now === 'string' && /^\d{2}:\d{2}$/.test(req.query.now) ? req.query.now : null;
    if (todayParam && nowParam) {
      if (hideUpcoming) AND.push(notUpcomingClause(todayParam, nowParam));
      else if (onlyUpcoming) AND.push({ NOT: notUpcomingClause(todayParam, nowParam) });
    }

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

    // Resolve the sort order (default: meeting date, newest first). When sorting by
    // meeting date, break ties with startTime so same-day meetings order by time of
    // day. startTime is a zero-padded "HH:MM" string (sorts correctly); SQLite ranks
    // NULL as the smallest value (first when asc, last when desc), so untimed meetings
    // behave like start-of-day — a stable, intuitive position within the day.
    const sortField = SORT_FIELDS.has(sortBy as string) ? (sortBy as string) : 'date';
    const dir: 'asc' | 'desc' = sortDir === 'asc' ? 'asc' : 'desc';
    const orderBy: Record<string, 'asc' | 'desc'>[] =
      sortField === 'date' ? [{ date: dir }, { startTime: dir }] : [{ [sortField]: dir }];

    // A meeting happening RIGHT NOW is pinned to the very top, ahead of the sort (owner
    // ask, 2026-08-06). Under date-desc it would otherwise sit below every future meeting
    // AND every later meeting today — far enough down to be unfindable mid-meeting, which
    // is exactly when it's wanted. This is done server-side because the client only holds
    // the pages it has loaded, and the in-progress meeting can fall on any of them.
    // Candidates = today's already-started timed meetings that pass the SAME filters (so a
    // series view / "Upcoming only" still bounds the pin — an in-progress meeting isn't
    // upcoming, so that mode correctly pins nothing); each is then confirmed with the full
    // end-time rule. Skipped entirely when the client didn't send its Eastern wall clock.
    const pinned =
      todayParam && nowParam
        ? (
          await prisma.conversation.findMany({
            where: {
              AND: [...AND, { date: todayParam }, { startTime: { not: null } }, { startTime: { lte: nowParam } }],
            },
            include: meetingListInclude,
            orderBy,
          })
        ).filter((m) => isHappeningNow(m, nowParam))
        : [];

    // Pinned rows occupy the first slots of the overall result, so the requested page
    // window is split between them and the rest of the list — which excludes them, so a
    // pinned meeting can't also appear in its date position. `total` still counts every
    // matching meeting, so the "N meetings" readout and hasMore are unaffected.
    const pinnedIds = pinned.map((m) => m.id);
    const restWhere = pinnedIds.length ? { AND: [...AND, { id: { notIn: pinnedIds } }] } : where;
    const pinnedPage = pinned.slice(skip, skip + take);
    const restTake = take - pinnedPage.length;

    const [total, rest] = await Promise.all([
      prisma.conversation.count({ where }),
      restTake > 0
        ? prisma.conversation.findMany({
          where: restWhere,
          include: meetingListInclude,
          orderBy,
          take: restTake,
          skip: Math.max(0, skip - pinnedIds.length),
        })
        : Promise.resolve([]),
    ]);

    const data = [...pinnedPage, ...rest];

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
