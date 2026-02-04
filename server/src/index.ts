import 'dotenv/config';
import express from 'express';
import cors from 'cors';
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

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve uploaded photos statically
app.use('/photos', express.static(path.join(process.cwd(), 'data', 'photos')));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

app.listen(PORT, () => {
  console.log(`SearchBook API running on http://localhost:${PORT}`);
});

export default app;
