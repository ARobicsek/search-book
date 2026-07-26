#!/usr/bin/env node
// Restore the binaries (photos, meeting attachments, pasted screenshots) from a
// `searchbook-files.zip` back onto disk / into a blob store.
//
// WHY THIS EXISTS
// The JSON backup stores only *references* to binaries (Contact.photoUrl/photoFile,
// Company.photoFile, ConversationAttachment.url, and markdown `![](url)` embeds).
// The bytes live in `searchbook-files.zip`, named for their SOURCE RECORD
// ("Contact 42.png"), not for the URL the database points at. Until this script
// existed there was no way back: a restore could rebuild every row and still show
// 238 broken images, because nothing mapped ZIP entry → served path.
//
// The ZIP's `manifest.json` holds that mapping ({ file, source, url }), so this
// script replays it: each entry is written to `<dest>/photos/<basename-of-url>`
// or `<dest>/files/<basename-of-url>` — exactly the paths `express.static`
// (local dev) and routes/media.ts (Netlify Blobs, via `migrate-blobs-to-netlify`)
// serve.
//
// Pair it with `rewrite-blob-urls.mjs` when the URLs in the DB are absolute
// (https://<host>/photos/x) and the host is going away — that flips them to the
// relative `/photos/x` these files answer to.
//
// Usage:
//   node server/scripts/restore-binaries-from-zip.mjs --zip <searchbook-files.zip> \
//        --dest server/data [--overwrite] [--dry-run]
//
//   --zip <path>    the searchbook-files.zip from Settings → Create Backup   [required]
//   --dest <dir>    directory to receive photos/ and files/ subdirs          [required]
//   --overwrite     replace files that already exist (default: skip them)
//   --dry-run       report what would be written, write nothing
//
// Dependency-free on purpose: during a real recovery you may be running from a
// bare checkout with no node_modules installed.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// ── args ──────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[k] = true;
    else { out[k] = next; i++; }
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const die = (m) => { console.error(`\n✖ ${m}\n`); process.exit(1); };
if (!args.zip) die('--zip <searchbook-files.zip> is required');
if (!args.dest) die('--dest <dir> is required');

// ── minimal ZIP reader (STORED + DEFLATE; the export uses level 0 = STORED) ──
function readZip(buf) {
  // locate End Of Central Directory (may be followed by a comment)
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65535; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) die('not a ZIP file (no end-of-central-directory record)');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || off === 0xffffffff) die('ZIP64 archives are not supported by this reader');

  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) die(`corrupt central directory at entry ${n}`);
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const uncompSize = buf.readUInt32LE(off + 24);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);

    // the local header repeats the name/extra lengths — data starts after them
    if (buf.readUInt32LE(localOff) !== 0x04034b50) die(`corrupt local header for "${name}"`);
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);

    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else die(`"${name}" uses unsupported compression method ${method}`);
    if (data.length !== uncompSize) die(`"${name}" size mismatch (${data.length} vs ${uncompSize})`);

    entries.set(name, data);
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// ── map a stored URL to the path the app serves it from ───────────────────
// "https://host/photos/1770-476.png" → photos/1770-476.png
// "/photos/1770-476.png"             → photos/1770-476.png
function targetFor(url) {
  let p;
  try { p = /^https?:\/\//.test(url) ? new URL(url).pathname : url; }
  catch { return null; }
  const m = p.match(/\/(photos|files)\/([^/?#]+)$/);
  if (!m) return null;
  const name = decodeURIComponent(m[2]);
  // the served paths are flat and the names are generated (`${Date.now()}-${rand}.ext`);
  // refuse anything that could climb out of the destination directory
  if (name.includes('/') || name.includes('\\') || name === '.' || name === '..') return null;
  return { kind: m[1], name };
}

// ── run ───────────────────────────────────────────────────────────────────
const zipBuf = readFileSync(args.zip);
const entries = readZip(zipBuf);

const manifestRaw = entries.get('manifest.json');
if (!manifestRaw) die('the ZIP has no manifest.json — cannot map files back to their served paths');
const manifest = JSON.parse(manifestRaw.toString('utf8').replace(/^﻿/, ''));

console.log('\n═══ restore binaries from ZIP ═══');
console.log(`zip      : ${args.zip}`);
console.log(`dest     : ${path.resolve(args.dest)}`);
console.log(`manifest : ${manifest.files.length} entries, exported ${manifest.exportedAt}`);
if (args['dry-run']) console.log('mode     : DRY RUN — nothing will be written');

const stats = { written: 0, skipped: 0, unmapped: 0, missingBytes: 0, bytes: 0 };
const unmapped = [];

for (const kind of ['photos', 'files']) {
  const dir = path.join(args.dest, kind);
  if (!args['dry-run'] && !existsSync(dir)) mkdirSync(dir, { recursive: true });
}

for (const rec of manifest.files) {
  const bytes = entries.get(rec.file);
  if (!bytes) { stats.missingBytes++; console.log(`  ✖ no bytes in ZIP for "${rec.file}"`); continue; }

  const target = targetFor(rec.url);
  if (!target) { stats.unmapped++; unmapped.push(rec); continue; }

  const dest = path.join(args.dest, target.kind, target.name);
  if (existsSync(dest) && !args.overwrite) { stats.skipped++; continue; }
  if (!args['dry-run']) writeFileSync(dest, bytes);
  stats.written++;
  stats.bytes += bytes.length;
}

console.log(`\n  ${args['dry-run'] ? 'would write' : 'wrote'}   ${stats.written} file(s), ${(stats.bytes / 1048576).toFixed(1)} MB`);
if (stats.skipped) console.log(`  skipped   ${stats.skipped} (already present — pass --overwrite to replace)`);
if (stats.missingBytes) console.log(`  ✖ ${stats.missingBytes} manifest entries had no bytes in the ZIP`);
if (stats.unmapped) {
  console.log(`  ⚠ ${stats.unmapped} entr(y/ies) had a URL this script can't map to /photos/ or /files/:`);
  for (const r of unmapped.slice(0, 10)) console.log(`      ${r.source} → ${r.url}`);
  console.log('    (external avatars etc. — they were never served from this app and need no restore)');
}

const hardFail = stats.missingBytes > 0;
console.log(hardFail ? '\n✖ incomplete — see above\n' : '\n✓ binaries restored\n');
process.exit(hardFail ? 1 : 0);
