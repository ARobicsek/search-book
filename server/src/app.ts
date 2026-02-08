// Express app configuration (shared between local dev and Vercel serverless)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import prisma from './db';
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
import employmentHistoryRouter from './routes/employmenthistory';
import tagsRouter from './routes/tags';
import analyticsRouter from './routes/analytics';
import backupRouter from './routes/backup';
import duplicatesRouter from './routes/duplicates';
import searchRouter from './routes/search';

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
app.use('/api/employment-history', employmentHistoryRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/backup', backupRouter);
app.use('/api/duplicates', duplicatesRouter);
app.use('/api/search', searchRouter);

export default app;
