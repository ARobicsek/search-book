// Express app configuration (shared between local dev and Vercel serverless)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
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

const app = express();

// CORS configuration - allow requests from Vercel domains and localhost
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3001',
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '',
  process.env.CLIENT_URL || '',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow any Vercel deployment URL
    if (origin.includes('.vercel.app') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // In development, allow any origin
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));

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
// The @libsql/client@0.5.6 reuses HTTP keep-alive connections that go stale
// in serverless, causing queries to hang. Fresh client = fresh connection.
app.use('/api', (_req, _res, next) => {
  resetPrisma();
  next();
});

// Request-level timeout — 12s so client gets two attempts within Vercel's 30s limit
app.use('/api', (req, res, next) => {
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

// Serve uploaded photos statically (for local dev - Vercel will use Blob storage)
if (process.env.NODE_ENV !== 'production') {
  app.use('/photos', express.static(path.join(process.cwd(), 'data', 'photos')));
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Debug endpoint to test database connection
app.get('/api/debug', async (_req, res) => {
  const url = process.env.TURSO_DATABASE_URL || '';
  const urlPreview = url ? `${url.substring(0, 20)}...${url.substring(url.length - 10)}` : 'not set';
  try {
    const count = await prisma.contact.count();
    res.json({
      status: 'ok',
      tursoUrlPreview: urlPreview,
      tursoUrlLength: url.length,
      tursoToken: process.env.TURSO_AUTH_TOKEN ? 'set' : 'not set',
      contactCount: count,
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      tursoUrlPreview: urlPreview,
      tursoUrlLength: url.length,
      tursoUrlStartsWith: url.substring(0, 10),
      tursoToken: process.env.TURSO_AUTH_TOKEN ? 'set' : 'not set',
    });
  }
});

// Debug endpoint to diagnose database timing
app.get('/api/debug/companies', async (_req, res) => {
  const results: Record<string, any> = {};

  // Test 1: Raw SQL count
  try {
    const start1 = Date.now();
    const rawCount = await prisma.$queryRawUnsafe('SELECT COUNT(*) as cnt FROM Company');
    results.rawSqlCount = { ms: Date.now() - start1, result: rawCount };
  } catch (e: any) {
    results.rawSqlCount = { error: e.message };
  }

  // Test 2: Prisma count
  try {
    const start2 = Date.now();
    const prismaCount = await prisma.company.count();
    results.prismaCount = { ms: Date.now() - start2, result: prismaCount };
  } catch (e: any) {
    results.prismaCount = { error: e.message };
  }

  // Test 3: Prisma findMany (just names)
  try {
    const start3 = Date.now();
    const names = await prisma.company.findMany({ select: { id: true, name: true } });
    results.prismaFindNames = { ms: Date.now() - start3, count: names.length };
  } catch (e: any) {
    results.prismaFindNames = { error: e.message };
  }

  // NOTE: _count include removed — generates correlated subquery that hangs on Turso

  res.json(results);
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

export default app;
