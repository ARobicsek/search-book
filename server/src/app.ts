// Express app configuration (shared between local dev and Vercel serverless)
import 'dotenv/config';
// Task 17: must load before express/http so Sentry can instrument them (no-op
// unless SENTRY_DSN is set).
import { Sentry, sentryEnabled } from './sentry';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import prisma, { resetPrisma } from './db';
import path from 'path';
import contactsRouter from './routes/contacts';
import companiesRouter from './routes/companies';
import actionsRouter from './routes/actions';
import ideasRouter from './routes/ideas';
import uploadRouter from './routes/upload';
import conversationsRouter from './routes/conversations';
import relationshipsRouter from './routes/relationships';
import linksRouter from './routes/links';
import prepnotesRouter from './routes/prepnotes';
import companyPrepNotesRouter from './routes/company-prepnotes';
import employmentHistoryRouter from './routes/employmenthistory';
import tagsRouter from './routes/tags';
import analyticsRouter from './routes/analytics';
import backupRouter from './routes/backup';
import duplicatesRouter from './routes/duplicates';
import searchRouter from './routes/search';
import companyActivitiesRouter from './routes/company-activities';
import linkedinRouter from './routes/linkedin';

const app = express();

// Behind Vercel's proxy: trust the first hop so express-rate-limit keys on the
// real client IP (X-Forwarded-For) rather than the proxy's.
app.set('trust proxy', 1);

// CORS configuration — Task 24: restrict to the exact prod domain + localhost.
// The app is served same-origin (client and /api share one Vercel domain), so
// same-origin and no-origin requests (the PWA, curl, the uptime monitor, cron)
// don't need a permissive allow-list. The old `*.vercel.app` wildcard let any
// Vercel-hosted site call the API cross-origin; that's now removed.
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3001',
  'https://searchbook-three.vercel.app',
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '',
  process.env.CLIENT_URL || '',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (same-origin fetches, mobile/PWA, curl,
    // the uptime monitor, Vercel cron).
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // In development, allow any origin for convenience.
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'x-app-password']
}));

// Task 16: a small global body limit closes a memory-DoS vector. Backup restores
// (full-DB JSON) legitimately need a large body, so they get their own larger
// parser mounted first — body-parser sets req._body and the global one then skips.
app.use('/api/backup', express.json({ limit: '50mb' }));
app.use(express.json({ limit: '2mb' }));

// Request timing middleware — logs to Vercel function logs
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    // Only log API routes and anything that takes > 100ms
    if (req.path.startsWith('/api') || duration > 100) {
      console.log(`[TIMING] ${req.method} ${req.path} — ${duration}ms (${res.statusCode})`);
    }
  });
  next();
});

// Per-request fresh Prisma client in production (Turso).
// Prevents stale HTTP connections in serverless environments.
app.use('/api', (_req, _res, next) => {
  resetPrisma();
  next();
});

// Request-level timeout — 12s so client gets two attempts within Vercel's 30s limit
// LinkedIn parse is exempt: AI model calls can take 15-25s
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/linkedin')) return next();
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      console.error(`[TIMEOUT] ${req.method} ${req.path} exceeded 12s`);
      res.status(504).json({ error: 'Request timed out. Please try again.' });
    }
  }, 12000);
  res.on('finish', () => clearTimeout(timeout));
  res.on('close', () => clearTimeout(timeout));
  next();
});

// ---- Rate limiting (Task 16) ----
// Sits before the auth gate so it also throttles password brute-forcing. The
// in-memory store is per-serverless-instance (resets on cold start) — imperfect
// on Vercel, but ample friction against abuse for a single-user app.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  limit: 1000,              // per IP — high enough that heavy real browsing (each
                            // page fires ~10 requests) never trips it, low enough
                            // to throttle scraping / password brute-forcing.
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health', // never throttle the uptime monitor
});
app.use('/api', generalLimiter);

// Stricter cap on the LinkedIn parse route — it calls the OpenAI API, so abuse
// costs real money. Mounted on the full path; req.path here is relative to it.
const linkedinLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/linkedin', linkedinLimiter);

// ---- Shared-password auth gate over all /api routes ----
// Single-user app: one shared password closes the "anyone with the URL" hole.
// NOT high-security (the client bundle is public, the password lives in localStorage),
// but the right cost/benefit for a single-user CRM. Pairs with rate limiting (Task 16).
function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Fail closed in production if the password isn't configured.
if (process.env.NODE_ENV === 'production' && !process.env.APP_PASSWORD) {
  throw new Error('APP_PASSWORD must be set in production');
}

app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();        // open for uptime monitor (Task 5)
  if (req.path === '/backup/cron') return next();   // CRON_SECRET-gated instead (Task 4)
  const expected = process.env.APP_PASSWORD;
  if (!expected) return next();                     // dev convenience when unset
  const provided = req.header('x-app-password') || '';
  if (timingSafeEqualStr(provided, expected)) return next();
  return res.status(401).json({ error: 'Unauthorized' });
});

// Serve uploaded photos statically (for local dev - Vercel will use Blob storage)
if (process.env.NODE_ENV !== 'production') {
  app.use('/photos', express.static(path.join(process.cwd(), 'data', 'photos')));
}

// Health check — verifies DB connectivity so the uptime monitor catches
// Turso outages, not just whether the web server is up. Returns no secrets.
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'down' });
  }
});

// Auth check — sits behind the gate above, so the login screen can validate a
// password: correct header → 200, wrong/missing → 401 (returned by the gate).
app.get('/api/auth/check', (_req, res) => {
  res.json({ ok: true });
});

// Routes
app.use('/api/contacts', contactsRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/actions', actionsRouter);
app.use('/api/ideas', ideasRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/relationships', relationshipsRouter);
app.use('/api/links', linksRouter);
app.use('/api/prepnotes', prepnotesRouter);
app.use('/api/company-prepnotes', companyPrepNotesRouter);
app.use('/api/employment-history', employmentHistoryRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/backup', backupRouter);
app.use('/api/duplicates', duplicatesRouter);
app.use('/api/search', searchRouter);
app.use('/api/company-activities', companyActivitiesRouter);
app.use('/api/linkedin', linkedinRouter);

// Task 17: Sentry must capture errors after the routes are mounted. Most route
// handlers catch their own errors, so this primarily reports uncaught throws.
if (sentryEnabled) {
  Sentry.setupExpressErrorHandler(app);
}

export default app;
