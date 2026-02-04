import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

// GET /api/analytics/overview
// Returns summary counts
router.get('/overview', async (_req: Request, res: Response) => {
  try {
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

    const [contactsCount, companiesCount, pendingActionsCount, overdueActionsCount] =
      await Promise.all([
        prisma.contact.count(),
        prisma.company.count(),
        prisma.action.count({ where: { completed: false } }),
        prisma.action.count({
          where: { completed: false, dueDate: { lt: today } },
        }),
      ]);

    res.json({
      contactsCount,
      companiesCount,
      pendingActionsCount,
      overdueActionsCount,
    });
  } catch (error) {
    console.error('Error fetching analytics overview:', error);
    res.status(500).json({ error: 'Failed to fetch analytics overview' });
  }
});

// GET /api/analytics/contacts-over-time?period=week|month
// Returns contacts created by day
router.get('/contacts-over-time', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || 'month';
    const daysBack = period === 'week' ? 7 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const contacts = await prisma.contact.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
    const grouped = new Map<string, number>();
    for (const c of contacts) {
      const date = c.createdAt.toLocaleDateString('en-CA');
      grouped.set(date, (grouped.get(date) || 0) + 1);
    }

    // Fill in missing dates
    const result = [];
    for (let i = daysBack; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = d.toLocaleDateString('en-CA');
      result.push({ date, count: grouped.get(date) || 0 });
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching contacts over time:', error);
    res.status(500).json({ error: 'Failed to fetch contacts over time' });
  }
});

// GET /api/analytics/conversations-over-time?period=week|month
// Returns conversations logged by day
router.get('/conversations-over-time', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || 'month';
    const daysBack = period === 'week' ? 7 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const startDateStr = startDate.toLocaleDateString('en-CA');

    const conversations = await prisma.conversation.findMany({
      where: { date: { gte: startDateStr } },
      select: { date: true },
      orderBy: { date: 'asc' },
    });

    // Group by date
    const grouped = new Map<string, number>();
    for (const c of conversations) {
      grouped.set(c.date, (grouped.get(c.date) || 0) + 1);
    }

    // Fill in missing dates
    const result = [];
    for (let i = daysBack; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = d.toLocaleDateString('en-CA');
      result.push({ date, count: grouped.get(date) || 0 });
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching conversations over time:', error);
    res.status(500).json({ error: 'Failed to fetch conversations over time' });
  }
});

// GET /api/analytics/by-ecosystem
// Returns contact count by ecosystem
router.get('/by-ecosystem', async (_req: Request, res: Response) => {
  try {
    const grouped = await prisma.contact.groupBy({
      by: ['ecosystem'],
      _count: true,
    });

    const result = grouped.map((g) => ({
      ecosystem: g.ecosystem,
      count: g._count,
    }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching contacts by ecosystem:', error);
    res.status(500).json({ error: 'Failed to fetch contacts by ecosystem' });
  }
});

// GET /api/analytics/by-status
// Returns contact count by status
router.get('/by-status', async (_req: Request, res: Response) => {
  try {
    const grouped = await prisma.contact.groupBy({
      by: ['status'],
      _count: true,
    });

    const result = grouped.map((g) => ({
      status: g.status,
      count: g._count,
    }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching contacts by status:', error);
    res.status(500).json({ error: 'Failed to fetch contacts by status' });
  }
});

// GET /api/analytics/actions-completed?period=week|month
// Returns completed actions over time
router.get('/actions-completed', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || 'month';
    const daysBack = period === 'week' ? 7 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const startDateStr = startDate.toLocaleDateString('en-CA');

    const actions = await prisma.action.findMany({
      where: {
        completed: true,
        completedDate: { gte: startDateStr },
      },
      select: { completedDate: true },
      orderBy: { completedDate: 'asc' },
    });

    // Group by date
    const grouped = new Map<string, number>();
    for (const a of actions) {
      if (a.completedDate) {
        grouped.set(a.completedDate, (grouped.get(a.completedDate) || 0) + 1);
      }
    }

    // Fill in missing dates
    const result = [];
    for (let i = daysBack; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = d.toLocaleDateString('en-CA');
      result.push({ date, count: grouped.get(date) || 0 });
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching actions completed:', error);
    res.status(500).json({ error: 'Failed to fetch actions completed' });
  }
});

export default router;
