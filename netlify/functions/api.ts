// Netlify Function entry (NETLIFY-MIGRATION-PLAN.md §3.7).
//
// Wraps the SAME Express app that Vercel (api/index.ts) and local dev use, via
// serverless-http. The netlify.toml redirects /api/*, /photos/*, and /files/* here
// (status 200 rewrite), and Phase 0.1 confirmed the original path is preserved
// (event.path = "/api/health"), so Express's /api-mounted routes and the root-level
// media proxy both match with no prefix surgery.
import serverless from 'serverless-http';
import app from '../../server/src/app';

export const handler = serverless(app);
