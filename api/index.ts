// Vercel serverless function handler
// This file imports the Express app and exports it for Vercel

import type { VercelRequest, VercelResponse } from '@vercel/node';

let app: any;
let initError: Error | null = null;

try {
  app = require('../server/src/app').default;
} catch (e) {
  initError = e as Error;
  console.error('Failed to load app:', e);
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (initError) {
    // Don't leak internals (message/stack) to clients in production.
    const isProd = process.env.NODE_ENV === 'production';
    return res.status(500).json({
      error: 'Server initialization failed',
      ...(isProd ? {} : { message: initError.message, stack: initError.stack }),
    });
  }

  // Forward the request to the Express app
  return app(req, res);
}
