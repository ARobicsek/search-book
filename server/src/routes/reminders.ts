import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../db';
import { sendPush, reminderDueInstant } from '../lib/push';

const router = Router();

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// POST|GET /api/cron/reminders — fan out Web Push for every action whose reminder is now due.
//
// EXEMPT from the global password gate (server/src/app.ts), so it self-authenticates:
// accepts `Authorization: Bearer ${CRON_SECRET}` OR `?key=${CRON_SECRET}` (so a free
// external cron like cron-job.org can call it with a query param) OR the app password.
//
// "Due" = notify on, not completed, never notified, and the action's wall-clock due
// moment (dueDate + dueTime, defaulting to 09:00 in REMINDER_TZ) has passed. Sends once
// per action (sets lastNotifiedAt), and prunes any push subscription the service reports
// as gone (404/410).
async function handler(req: Request, res: Response) {
  // Dedicated secret for the reminders cron, so it never has to share (or expose) the
  // backup's CRON_SECRET. Falls back to CRON_SECRET if a dedicated one isn't set.
  const cronSecret = process.env.REMINDERS_CRON_SECRET || process.env.CRON_SECRET;
  const appPassword = process.env.APP_PASSWORD;
  const authHeader = req.header('authorization') || '';
  const queryKey = typeof req.query.key === 'string' ? req.query.key : '';
  const cronOk =
    !!cronSecret &&
    (timingSafeEqualStr(authHeader, `Bearer ${cronSecret}`) || timingSafeEqualStr(queryKey, cronSecret));
  const pwOk = !!appPassword && timingSafeEqualStr(req.header('x-app-password') || '', appPassword);
  if (!cronOk && !pwOk) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const now = Date.now();

    // Candidate actions: opt-in reminder, still open, not yet notified, has a date.
    const candidates = await prisma.action.findMany({
      where: {
        notify: true,
        completed: false,
        lastNotifiedAt: null,
        dueDate: { not: null },
      },
      select: { id: true, title: true, dueDate: true, dueTime: true },
    });

    const due = candidates.filter((a) => {
      const instant = reminderDueInstant(a);
      return instant !== null && instant.getTime() <= now;
    });

    if (due.length === 0) {
      res.json({ ok: true, due: 0, sent: 0 });
      return;
    }

    const subs = await prisma.pushSubscription.findMany();
    const nowIso = new Date(now).toISOString();
    let sent = 0;
    const goneEndpoints = new Set<string>();

    for (const action of due) {
      const payload = {
        title: 'Action reminder',
        body: action.title,
        url: `/actions/${action.id}`,
        actionId: action.id,
      };
      const results = await Promise.all(
        subs.map(async (s) => {
          const result = await sendPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, payload);
          if (result === 'gone') goneEndpoints.add(s.endpoint);
          return result;
        }),
      );
      if (results.some((r) => r === 'ok')) sent++;
      // Mark notified regardless: with no live subscription there's nobody to reach, and
      // we don't want a permanent retry storm. (Re-enabling a device won't replay history.)
      await prisma.action.update({ where: { id: action.id }, data: { lastNotifiedAt: nowIso } });
    }

    if (goneEndpoints.size > 0) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: [...goneEndpoints] } } });
    }

    res.json({ ok: true, due: due.length, sent, pruned: goneEndpoints.size });
  } catch (error) {
    console.error('Error processing reminders:', error);
    res.status(500).json({ error: 'Failed to process reminders' });
  }
}

router.get('/reminders', handler);
router.post('/reminders', handler);

export default router;
