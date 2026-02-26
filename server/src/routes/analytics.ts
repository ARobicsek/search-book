import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

function getDatesInRange(start: string, end: string) {
  const dates = [];
  const curr = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  while (curr <= last) {
    dates.push(curr.toLocaleDateString('en-CA'));
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

// GET /api/analytics/overview
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const today = new Date().toLocaleDateString('en-CA');
    const startDateStr = (req.query.startDate as string) || today;
    const endDateStr = (req.query.endDate as string) || today;
    const startDate = new Date(startDateStr + 'T00:00:00');
    const endDate = new Date(endDateStr + 'T23:59:59.999');

    const [
      totalContacts,
      totalCompanies,
      pendingActionsCount,
      overdueActionsCount,
      completedActionsCount,
      allContacts,
      allCompanies,
      allCompletedActions,
      inDiscussionsCompaniesCount,
    ] = await Promise.all([
      prisma.contact.count(),
      prisma.company.count(),
      prisma.action.count({ where: { completed: false } }),
      prisma.action.count({ where: { completed: false, dueDate: { lt: today } } }),
      prisma.action.count({
        where: { completed: true, completedDate: { gte: startDateStr, lte: endDateStr } },
      }),
      prisma.contact.findMany({ select: { createdAt: true } }),
      prisma.company.findMany({ select: { createdAt: true } }),
      prisma.action.findMany({
        where: { completed: true, completedDate: { gte: startDateStr, lte: endDateStr } },
        select: { completedDate: true },
      }),
      prisma.company.count({ where: { status: 'IN_DISCUSSIONS' } }),
    ]);

    const dates = getDatesInRange(startDateStr, endDateStr);

    const sparklines = {
      contacts: [] as { date: string; count: number }[],
      companies: [] as { date: string; count: number }[],
      completedActions: [] as { date: string; count: number }[],
    };

    let runningContacts = allContacts.filter((c) => c.createdAt < startDate).length;
    let runningCompanies = allCompanies.filter((c) => c.createdAt < startDate).length;
    let runningCompleted = 0;

    const contactsByDate = new Map<string, number>();
    for (const c of allContacts) {
      const d = c.createdAt.toLocaleDateString('en-CA');
      contactsByDate.set(d, (contactsByDate.get(d) || 0) + 1);
    }

    const companiesByDate = new Map<string, number>();
    for (const c of allCompanies) {
      const d = c.createdAt.toLocaleDateString('en-CA');
      companiesByDate.set(d, (companiesByDate.get(d) || 0) + 1);
    }

    const completedByDate = new Map<string, number>();
    for (const a of allCompletedActions) {
      if (a.completedDate) {
        completedByDate.set(a.completedDate, (completedByDate.get(a.completedDate) || 0) + 1);
      }
    }

    for (const d of dates) {
      runningContacts += contactsByDate.get(d) || 0;
      runningCompanies += companiesByDate.get(d) || 0;
      runningCompleted += completedByDate.get(d) || 0;

      sparklines.contacts.push({ date: d, count: runningContacts });
      sparklines.companies.push({ date: d, count: runningCompanies });
      sparklines.completedActions.push({ date: d, count: runningCompleted });
    }

    res.json({
      contactsCount: totalContacts,
      companiesCount: totalCompanies,
      pendingActionsCount,
      overdueActionsCount,
      completedActionsCount,
      inDiscussionsCompaniesCount,
      sparklines,
    });
  } catch (error) {
    console.error('Error fetching analytics overview:', error);
    res.status(500).json({ error: 'Failed to fetch analytics overview' });
  }
});

router.get('/contacts-metrics', async (req: Request, res: Response) => {
  try {
    const startDateStr = (req.query.startDate as string);
    const endDateStr = (req.query.endDate as string);
    const startDate = new Date(startDateStr + 'T00:00:00');
    const endDate = new Date(endDateStr + 'T23:59:59.999');

    const [contacts, statusHists, convEmail, convLinkedIn, convCall] = await Promise.all([
      prisma.contact.findMany({
        where: { createdAt: { gte: startDate, lte: endDate } },
        select: { createdAt: true },
      }),
      prisma.contactStatusHistory.findMany({
        where: { createdAt: { gte: startDate, lte: endDate }, oldStatus: 'AWAITING_RESPONSE', newStatus: 'CONNECTED' },
        select: { createdAt: true },
      }),
      prisma.$queryRaw<{ date: string, count: number }[]>`
        SELECT date, COUNT(DISTINCT contactId) as count
        FROM (
          SELECT contactId, MIN(date) as date
          FROM Conversation
          WHERE type = 'EMAIL'
          GROUP BY contactId
        ) t
        WHERE date >= ${startDateStr} AND date <= ${endDateStr}
        GROUP BY date
      `,
      prisma.$queryRaw<{ date: string, count: number }[]>`
        SELECT date, COUNT(DISTINCT contactId) as count
        FROM (
          SELECT contactId, MIN(date) as date
          FROM Conversation
          WHERE type = 'LINKEDIN'
          GROUP BY contactId
        ) t
        WHERE date >= ${startDateStr} AND date <= ${endDateStr}
        GROUP BY date
      `,
      prisma.$queryRaw<{ date: string, count: number }[]>`
        SELECT date, COUNT(DISTINCT contactId) as count
        FROM (
          SELECT contactId, MIN(date) as date
          FROM Conversation
          WHERE type IN ('CALL', 'VIDEO_CALL', 'MEETING', 'COFFEE')
          GROUP BY contactId
        ) t
        WHERE date >= ${startDateStr} AND date <= ${endDateStr}
        GROUP BY date
      `
    ]);

    const dates = getDatesInRange(startDateStr, endDateStr);
    const result = dates.map(date => ({
      date,
      added: 0,
      awaitingToConnected: 0,
      firstEmail: 0,
      firstLinkedIn: 0,
      firstCallOrMeeting: 0,
    }));

    const resultByDate = new Map(result.map(r => [r.date, r]));

    for (const c of contacts) {
      const d = c.createdAt.toLocaleDateString('en-CA');
      if (resultByDate.has(d)) resultByDate.get(d)!.added++;
    }
    for (const h of statusHists) {
      const d = h.createdAt.toLocaleDateString('en-CA');
      if (resultByDate.has(d)) resultByDate.get(d)!.awaitingToConnected++;
    }
    for (const c of convEmail) {
      if (resultByDate.has(c.date)) resultByDate.get(c.date)!.firstEmail += Number(c.count);
    }
    for (const c of convLinkedIn) {
      if (resultByDate.has(c.date)) resultByDate.get(c.date)!.firstLinkedIn += Number(c.count);
    }
    for (const c of convCall) {
      if (resultByDate.has(c.date)) resultByDate.get(c.date)!.firstCallOrMeeting += Number(c.count);
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching contacts metrics:', error);
    res.status(500).json({ error: 'Failed to fetch contacts metrics' });
  }
});

router.get('/conversations-metrics', async (req: Request, res: Response) => {
  try {
    const startDateStr = (req.query.startDate as string);
    const endDateStr = (req.query.endDate as string);

    const conversations = await prisma.conversation.findMany({
      where: { date: { gte: startDateStr, lte: endDateStr } },
      select: { date: true, type: true },
    });

    const dates = getDatesInRange(startDateStr, endDateStr);
    const result = dates.map(date => ({ date, EMAIL: 0, CALL: 0, VIDEO_CALL: 0, MEETING: 0, COFFEE: 0, LINKEDIN: 0, EVENT: 0, OTHER: 0 }));
    const resultByDate = new Map(result.map(r => [r.date, r]));

    for (const c of conversations) {
      if (resultByDate.has(c.date)) {
        const row = resultByDate.get(c.date)!;
        let type = c.type as keyof typeof row;
        if (!(type in row)) type = 'OTHER' as keyof typeof row;
        (row[type] as number)++;
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching conversations metrics:', error);
    res.status(500).json({ error: 'Failed to fetch conversations metrics' });
  }
});

router.get('/companies-metrics', async (req: Request, res: Response) => {
  try {
    const startDateStr = (req.query.startDate as string);
    const endDateStr = (req.query.endDate as string);
    const startDate = new Date(startDateStr + 'T00:00:00');
    const endDate = new Date(endDateStr + 'T23:59:59.999');

    const [companies, statusHists] = await Promise.all([
      prisma.company.findMany({
        where: { createdAt: { gte: startDate, lte: endDate } },
        select: { createdAt: true },
      }),
      prisma.companyStatusHistory.findMany({
        where: { createdAt: { gte: startDate, lte: endDate }, newStatus: 'IN_DISCUSSIONS' },
        select: { createdAt: true },
      }),
    ]);

    const dates = getDatesInRange(startDateStr, endDateStr);
    const result = dates.map(date => ({ date, added: 0, toInDiscussions: 0 }));
    const resultByDate = new Map(result.map(r => [r.date, r]));

    for (const c of companies) {
      const d = c.createdAt.toLocaleDateString('en-CA');
      if (resultByDate.has(d)) resultByDate.get(d)!.added++;
    }
    for (const h of statusHists) {
      const d = h.createdAt.toLocaleDateString('en-CA');
      if (resultByDate.has(d)) resultByDate.get(d)!.toInDiscussions++;
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching companies metrics:', error);
    res.status(500).json({ error: 'Failed to fetch companies metrics' });
  }
});

router.get('/actions-metrics', async (req: Request, res: Response) => {
  try {
    const startDateStr = (req.query.startDate as string);
    const endDateStr = (req.query.endDate as string);

    const actions = await prisma.action.findMany({
      where: { completed: true, completedDate: { gte: startDateStr, lte: endDateStr } },
      select: { completedDate: true },
    });

    const dates = getDatesInRange(startDateStr, endDateStr);
    const result = dates.map(date => ({ date, completed: 0 }));
    const resultByDate = new Map(result.map(r => [r.date, r]));

    for (const a of actions) {
      if (a.completedDate && resultByDate.has(a.completedDate)) {
        resultByDate.get(a.completedDate)!.completed++;
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching actions metrics:', error);
    res.status(500).json({ error: 'Failed to fetch actions metrics' });
  }
});

router.get('/drilldown/contact-transitions', async (req: Request, res: Response) => {
  try {
    const dateStr = req.query.date as string;
    const oldStatus = req.query.oldStatus as string;
    const newStatus = req.query.newStatus as string;

    if (!dateStr || !oldStatus || !newStatus) {
      return res.status(400).json({ error: 'Missing required query parameters' });
    }

    const startDate = new Date(dateStr + 'T00:00:00');
    const endDate = new Date(dateStr + 'T23:59:59.999');

    const historyRecords = await prisma.contactStatusHistory.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        oldStatus,
        newStatus,
      },
      include: {
        contact: {
          select: {
            id: true,
            name: true,
            title: true,
          }
        }
      }
    });

    const contacts = historyRecords.map(h => h.contact);
    res.json(contacts);
  } catch (error) {
    console.error('Error fetching contact drilldown data:', error);
    res.status(500).json({ error: 'Failed to fetch drilldown data' });
  }
});

router.get('/drilldown/contacts', async (req: Request, res: Response) => {
  try {
    const dateStr = req.query.date as string;
    const metric = req.query.metric as string;

    if (!dateStr || !metric) {
      return res.status(400).json({ error: 'Missing required query parameters' });
    }

    const startDate = new Date(dateStr + 'T00:00:00');
    const endDate = new Date(dateStr + 'T23:59:59.999');

    if (metric === 'added') {
      const contacts = await prisma.contact.findMany({
        where: { createdAt: { gte: startDate, lte: endDate } },
        select: { id: true, name: true, title: true }
      });
      return res.json(contacts);
    }

    let contacts;
    if (metric === 'firstEmail') {
      contacts = await prisma.$queryRaw<any[]>`
        SELECT c.id, c.name, c.title
        FROM Contact c
        JOIN (
          SELECT contactId, MIN(date) as first_date
          FROM Conversation
          WHERE type = 'EMAIL'
          GROUP BY contactId
        ) t ON c.id = t.contactId
        WHERE t.first_date = ${dateStr}
      `;
    } else if (metric === 'firstLinkedIn') {
      contacts = await prisma.$queryRaw<any[]>`
        SELECT c.id, c.name, c.title
        FROM Contact c
        JOIN (
          SELECT contactId, MIN(date) as first_date
          FROM Conversation
          WHERE type = 'LINKEDIN'
          GROUP BY contactId
        ) t ON c.id = t.contactId
        WHERE t.first_date = ${dateStr}
      `;
    } else if (metric === 'firstCallOrMeeting') {
      contacts = await prisma.$queryRaw<any[]>`
        SELECT c.id, c.name, c.title
        FROM Contact c
        JOIN (
          SELECT contactId, MIN(date) as first_date
          FROM Conversation
          WHERE type IN ('CALL', 'VIDEO_CALL', 'MEETING', 'COFFEE')
          GROUP BY contactId
        ) t ON c.id = t.contactId
        WHERE t.first_date = ${dateStr}
      `;
    } else {
      return res.status(400).json({ error: 'Invalid metric' });
    }

    res.json(contacts);
  } catch (error) {
    console.error('Error fetching contacts drilldown data:', error);
    res.status(500).json({ error: 'Failed to fetch contacts drilldown data' });
  }
});

router.get('/drilldown/conversations', async (req: Request, res: Response) => {
  try {
    const dateStr = req.query.date as string;
    const type = req.query.type as string;

    if (!dateStr || !type) {
      return res.status(400).json({ error: 'Missing required query parameters' });
    }

    const conversations = await prisma.conversation.findMany({
      where: { date: dateStr, type },
      include: {
        contact: { select: { name: true } },
        contactsDiscussed: {
          include: { contact: { select: { name: true } } }
        }
      }
    });

    res.json(conversations);
  } catch (error) {
    console.error('Error fetching conversations drilldown data:', error);
    res.status(500).json({ error: 'Failed to fetch conversations drilldown data' });
  }
});

router.get('/drilldown/companies', async (req: Request, res: Response) => {
  try {
    const dateStr = req.query.date as string;
    const metric = req.query.metric as string;

    if (!dateStr || !metric) {
      return res.status(400).json({ error: 'Missing required query parameters' });
    }

    const startDate = new Date(dateStr + 'T00:00:00');
    const endDate = new Date(dateStr + 'T23:59:59.999');

    if (metric === 'added') {
      const companies = await prisma.company.findMany({
        where: { createdAt: { gte: startDate, lte: endDate } },
        select: { id: true, name: true, website: true, status: true }
      });
      return res.json(companies);
    } else if (metric === 'toInDiscussions') {
      const historyRecords = await prisma.companyStatusHistory.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          newStatus: 'IN_DISCUSSIONS',
        },
        include: {
          company: {
            select: { id: true, name: true, website: true, status: true }
          }
        }
      });
      const companies = historyRecords.map(h => h.company);
      return res.json(companies);
    }

    res.status(400).json({ error: 'Invalid metric' });
  } catch (error) {
    console.error('Error fetching companies drilldown data:', error);
    res.status(500).json({ error: 'Failed to fetch companies drilldown data' });
  }
});

router.get('/drilldown/actions', async (req: Request, res: Response) => {
  try {
    const dateStr = req.query.date as string;

    if (!dateStr) {
      return res.status(400).json({ error: 'Missing required query parameters' });
    }

    const actions = await prisma.action.findMany({
      where: { completed: true, completedDate: dateStr },
      select: { id: true, title: true, priority: true }
    });

    res.json(actions);
  } catch (error) {
    console.error('Error fetching actions drilldown data:', error);
    res.status(500).json({ error: 'Failed to fetch actions drilldown data' });
  }
});

export default router;
