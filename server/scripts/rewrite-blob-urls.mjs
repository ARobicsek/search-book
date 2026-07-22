// Phase 4 — repoint every Vercel-Blob URL stored in Turso to a relative /photos/ · /files/ path.
//
// NETLIFY-MIGRATION-PLAN.md §6.3. Run ONCE during cutover, AFTER migrate-blobs-to-netlify.mjs
// has copied the bytes into Netlify Blobs. Rewrites `https://<HOST>/photos/x.jpg` → `/photos/x.jpg`
// (and `/files/`) across EVERY text column of EVERY table — so it also catches markdown-embedded
// images inside any notes column, not just the four known URL columns (Contact.photoUrl/photoFile,
// Company.photoFile, ConversationAttachment.url).
//
// ⚠ POINT OF NO RETURN: after this runs, photos render on Netlify (relative → served by
// routes/media.ts) and appear BROKEN on the Vercel deploy (Vercel prod doesn't serve /photos).
// Do not run it until the Phase 3 soak is green and you are going straight to cutover.
//
// Usage: $env:TURSO_DATABASE_URL='libsql://…'; $env:TURSO_AUTH_TOKEN='…'   (a FRESH token)
//        node server/scripts/rewrite-blob-urls.mjs <BLOB_HOST> [--undo]
//   BLOB_HOST is printed by migrate-blobs-to-netlify.mjs, e.g. abc123.public.blob.vercel-storage.com
//
// --undo naively re-prefixes every relative /photos/ · /files/ path back to https://<HOST>/… .
// It is the emergency rollback and is valid ONLY before the Vercel Blob store is deleted (Phase 6).

import { createClient } from '@libsql/client';

const host = process.argv[2];
const undo = process.argv.includes('--undo');
if (!host || host.startsWith('--')) {
  console.error('Pass the Vercel Blob host, e.g. abc123.public.blob.vercel-storage.com [--undo]');
  process.exit(1);
}
if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN (a FRESH token) first.');
  process.exit(1);
}
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const tables = (
  await db.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'`,
  )
).rows.map((r) => r.name);

let total = 0;
for (const t of tables) {
  const cols = (await db.execute(`PRAGMA table_info("${t}")`)).rows
    .filter((c) => /TEXT|CHAR|CLOB/i.test(String(c.type ?? 'TEXT')))
    .map((c) => c.name);
  for (const c of cols) {
    const r = undo
      ? await db.execute(
          `UPDATE "${t}" SET "${c}" = REPLACE(REPLACE("${c}", '/photos/', 'https://${host}/photos/'), '/files/', 'https://${host}/files/') ` +
            `WHERE "${c}" LIKE '%/photos/%' OR "${c}" LIKE '%/files/%'`,
        )
      : await db.execute(
          `UPDATE "${t}" SET "${c}" = REPLACE("${c}", 'https://${host}/', '/') WHERE "${c}" LIKE '%${host}%'`,
        );
    if (r.rowsAffected > 0) {
      console.log(`${undo ? 'undo ' : ''}${t}.${c}: ${r.rowsAffected} rows`);
      total += r.rowsAffected;
    }
  }
}
console.log(`\n${undo ? 'Reverted' : 'Rewrote'} ${total} row-update(s).`);

// Forward verification: nothing should still reference the Vercel Blob host.
if (!undo) {
  let remaining = 0;
  for (const t of tables) {
    const cols = (await db.execute(`PRAGMA table_info("${t}")`)).rows.map((c) => c.name);
    for (const c of cols) {
      const r = await db.execute(`SELECT COUNT(*) AS n FROM "${t}" WHERE "${c}" LIKE '%${host}%'`);
      const n = Number(r.rows[0].n);
      if (n > 0) {
        console.log(`⚠ REMAINING: ${t}.${c} = ${n}`);
        remaining += n;
      }
    }
  }
  console.log(
    remaining === 0
      ? 'Verified: no rows still reference the Vercel Blob host. ✅'
      : `⚠ ${remaining} reference(s) remain — the rewrite is INCOMPLETE (see lines above).`,
  );
}
