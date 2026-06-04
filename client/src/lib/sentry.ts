// Task 17: Sentry error tracking for the React client.
//
// Opt-in: only initializes when VITE_SENTRY_DSN is set, so local dev stays a
// no-op. captureException is re-exported so the ErrorBoundary can report
// render-time crashes; it's a safe no-op when Sentry isn't initialized.
import * as Sentry from '@sentry/react'

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined

export const sentryEnabled = Boolean(dsn)

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Error tracking only — no performance/session-replay sampling.
    tracesSampleRate: 0,
  })
}

export { Sentry }
