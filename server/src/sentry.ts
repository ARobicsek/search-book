// Task 17: Sentry error tracking for the Express server.
//
// Opt-in: only initializes when SENTRY_DSN is set (production via Vercel env var),
// so local dev and test stay a no-op. This module is imported for its side effect
// at the very top of app.ts — BEFORE express/http load — so Sentry can
// auto-instrument them.
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    // Error tracking only — no performance traces (keeps us well inside the free tier).
    tracesSampleRate: 0,
  });
}

export const sentryEnabled = Boolean(dsn);
export { Sentry };
