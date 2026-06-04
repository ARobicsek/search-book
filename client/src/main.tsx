import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Task 17: initialize Sentry (no-op unless VITE_SENTRY_DSN is set) before the app renders.
import '@/lib/sentry'
import App from './App.tsx'
import { ErrorBoundary } from '@/components/error-boundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
