// Phase 4 — copy every Vercel Blob object into Netlify Blobs (photos/, files/, backups/).
//
// NETLIFY-MIGRATION-PLAN.md §6.2. Run ONCE during the Phase 4 cutover window, AFTER the
// Phase 3 soak is green (and after a fresh safety backup, §6.1). Idempotent: re-running
// skips objects already present in Netlify Blobs, so a partial/interrupted run resumes safely.
//
// Env required:
//   BLOB_READ_WRITE_TOKEN   Vercel Blob token   (Vercel dashboard → Storage → Blob → .env)
//   NETLIFY_SITE_ID         Netlify site ID     (Netlify → Site settings → General → Site ID)
//   NETLIFY_AUTH_TOKEN      Netlify PAT         (Netlify → User settings → Applications → new token)
//
// Usage (PowerShell):
//   $env:BLOB_READ_WRITE_TOKEN='vercel_blob_rw_…'
//   $env:NETLIFY_SITE_ID='…'; $env:NETLIFY_AUTH_TOKEN='nfp_…'
//   node server/scripts/migrate-blobs-to-netlify.mjs
//
// It copies photos/, files/ AND backups/ (backup history preserved) and — crucially —
// stamps each object with the { contentType, size, uploadedAt } metadata the Netlify runtime
// relies on: the media proxy (server/src/lib/storage.ts getObject) reads contentType to set
// the right response header, and the backup list (routes/backup.ts) reads size + uploadedAt.
// At the end it prints every Vercel Blob HOST it saw — feed that host to rewrite-blob-urls.mjs
// (§6.3) to repoint the DB's stored URLs to relative paths.

import { list } from '@vercel/blob';
import { getStore } from '@netlify/blobs';

const siteID = process.env.NETLIFY_SITE_ID;
const token = process.env.NETLIFY_AUTH_TOKEN;
if (!process.env.BLOB_READ_WRITE_TOKEN || !siteID || !token) {
  console.error('Set BLOB_READ_WRITE_TOKEN, NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN first.');
  process.exit(1);
}

// The runtime store is getStore('media') (server/src/lib/storage.ts). Outside the Netlify
// runtime the Blobs context isn't auto-injected, so pass siteID + token explicitly.
const store = getStore({ name: 'media', siteID, token });

// Extension → content-type fallback, used only when the Blob response omits/genericises the header.
const CT_BY_EXT = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf',
  '.json': 'application/json', '.txt': 'text/plain', '.csv': 'text/csv',
  '.md': 'text/markdown', '.eml': 'message/rfc822', '.zip': 'application/zip',
  '.doc': 'application/msword', '.xls': 'application/vnd.ms-excel',
};
function ctFor(pathname, headerCt) {
  if (headerCt && headerCt !== 'application/octet-stream') return headerCt;
  const dot = pathname.lastIndexOf('.');
  const ext = dot >= 0 ? pathname.slice(dot).toLowerCase() : '';
  return CT_BY_EXT[ext] || headerCt || 'application/octet-stream';
}

let cursor;
let seen = 0;
let copied = 0;
let skipped = 0;
const hosts = new Set();

do {
  const page = await list({ cursor, limit: 500 });
  for (const b of page.blobs) {
    seen++;
    hosts.add(new URL(b.url).host);

    // Idempotent: skip anything already in Netlify Blobs (getMetadata is cheap, no body fetch).
    const existing = await store.getMetadata(b.pathname);
    if (existing) {
      skipped++;
      continue;
    }

    const resp = await fetch(b.downloadUrl || b.url);
    if (!resp.ok) {
      console.error(`  ! fetch ${resp.status} for ${b.pathname} — skipping`);
      continue;
    }
    const bytes = await resp.arrayBuffer();
    const contentType = ctFor(b.pathname, resp.headers.get('content-type'));
    const uploadedAt =
      b.uploadedAt instanceof Date ? b.uploadedAt.toISOString() : String(b.uploadedAt ?? '');

    await store.set(b.pathname, bytes, {
      metadata: { contentType, size: b.size, uploadedAt },
    });
    copied++;
    console.log(`${copied}: ${b.pathname} (${b.size} bytes, ${contentType})`);
  }
  cursor = page.cursor;
} while (cursor);

console.log(`\nDone. ${seen} objects seen — ${copied} copied, ${skipped} already present.`);
console.log('Vercel Blob host(s) seen (pass to rewrite-blob-urls.mjs):', [...hosts]);
