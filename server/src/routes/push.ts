import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

// GET /api/push/public-key — the VAPID public key the browser needs to subscribe.
// Returns { publicKey: null } when push isn't configured so the client can hide the UI.
router.get('/public-key', (_req: Request, res: Response) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

// POST /api/push/subscribe — upsert a browser/device subscription (idempotent by endpoint).
// Body: a serialized PushSubscription { endpoint, keys: { p256dh, auth } }.
router.post('/subscribe', async (req: Request, res: Response) => {
  try {
    const { endpoint, keys } = req.body || {};
    const p256dh = keys?.p256dh;
    const auth = keys?.auth;
    if (typeof endpoint !== 'string' || !p256dh || !auth) {
      res.status(400).json({ error: 'Invalid subscription' });
      return;
    }
    const sub = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh, auth },
      create: { endpoint, p256dh, auth },
    });
    res.status(201).json({ id: sub.id });
  } catch (error) {
    console.error('Error saving push subscription:', error);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

// POST /api/push/unsubscribe — remove a subscription by endpoint (idempotent).
router.post('/unsubscribe', async (req: Request, res: Response) => {
  try {
    const { endpoint } = req.body || {};
    if (typeof endpoint !== 'string') {
      res.status(400).json({ error: 'endpoint required' });
      return;
    }
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Error removing push subscription:', error);
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

export default router;
