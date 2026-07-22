// Media proxy for Netlify Blobs (NETLIFY-MIGRATION-PLAN.md §3.3).
//
// Netlify Blobs have no public URL, so uploaded images/attachments are streamed
// through this function. Mounted at the ROOT (not /api) so it sits OUTSIDE the
// shared-password gate — an <img>/<a> tag can't send the x-app-password header,
// exactly as today's public Vercel Blob URLs are unauthenticated.
//
// Dormant unless the Netlify gate is on (404 otherwise); in local dev the
// express.static handlers in app.ts serve /photos and /files first.
import { Router, Request, Response } from 'express';
import { netlifyBlobsEnabled, getObject } from '../lib/storage';

const router = Router();

// Filenames are `${Date.now()}-${rand}${ext}` — reject anything else so a crafted
// key can't traverse the store.
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

async function serve(prefix: 'photos' | 'files', req: Request, res: Response) {
  if (!netlifyBlobsEnabled()) {
    res.status(404).end();
    return;
  }
  const name = String(req.params.name);
  if (!SAFE_NAME.test(name)) {
    res.status(400).json({ error: 'bad name' });
    return;
  }
  try {
    const obj = await getObject(`${prefix}/${name}`);
    if (!obj) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', obj.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(obj.data);
  } catch (error: any) {
    console.error('[media] read error:', error?.message || error);
    res.status(500).end();
  }
}

router.get('/photos/:name', (req, res) => serve('photos', req, res));
router.get('/files/:name', (req, res) => serve('files', req, res));

export default router;
