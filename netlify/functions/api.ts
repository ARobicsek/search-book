// Netlify Function entry (NETLIFY-MIGRATION-PLAN.md §3.7).
//
// Wraps the SAME Express app that Vercel (api/index.ts) and local dev use, via
// serverless-http. The netlify.toml redirects /api/*, /photos/*, and /files/* here
// (status 200 rewrite), and Phase 0.1 confirmed the original path is preserved
// (event.path = "/api/health"), so Express's /api-mounted routes and the root-level
// media proxy both match with no prefix surgery.
//
// serverless-http uses the AWS Lambda handler signature, so Netlify Blobs can't
// auto-inject its context (that only happens for the modern function format).
// connectLambda(event) wires the Blobs context from the Lambda event before the app
// runs any getStore() (media proxy, uploads, backups). Imported through the server's
// re-export so it shares the same @netlify/blobs module instance as storage.ts.
import serverless from 'serverless-http';
import { connectLambda } from '../../server/src/lib/netlify-blobs-context';
import app from '../../server/src/app';

// serverless-http treats a response as binary (base64-encoded, so Netlify passes the
// bytes through intact) only for content-types matching this list — otherwise it
// utf8-encodes the body and corrupts binary data. Without it, the media proxy served
// mangled images/attachments (upload succeeded, but the photo wouldn't render). Text
// and JSON stay utf8 (leaner responses). Globs: '*' → '.*' in serverless-http.
const BINARY_CONTENT_TYPES = [
  'image/*',
  'application/pdf',
  'application/zip',
  'application/octet-stream',
  'application/msword',
  'application/vnd.*', // office openxml (docx/xlsx/pptx), ms-outlook (.msg), etc.
  'font/*',
  'audio/*',
  'video/*',
];

const wrapped = serverless(app, { binary: BINARY_CONTENT_TYPES });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handler = (event: any, context: any) => {
  connectLambda(event);
  return wrapped(event, context);
};
