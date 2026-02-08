// Local development server entry point
import app from './app';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`SearchBook API running on http://localhost:${PORT}`);
});

export default app;
