import express from 'express';
import cors from 'cors';
import contactsRouter from './routes/contacts';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/contacts', contactsRouter);

app.listen(PORT, () => {
  console.log(`SearchBook API running on http://localhost:${PORT}`);
});

export default app;
