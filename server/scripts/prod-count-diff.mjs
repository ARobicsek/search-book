#!/usr/bin/env node
// READ-ONLY prod vs backup row-count diff.
//
// Proves a downloaded backup JSON is a complete copy of production by running
// SELECT count(*) per table against live prod and diffing against the JSON.
// It ONLY issues count(*) SELECTs — never writes, never deletes.
//
// Usage:
//   node server/scripts/prod-count-diff.mjs \
//     --json "C:/path/to/searchbook-backup-*.json" \
//     --url  "libsql://<prod>.turso.io" \
//     --token "<prod read token>"

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createClient } = require('@libsql/client');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
function die(m) { console.error(`\n✖ ${m}\n`); process.exit(1); }
if (!args.json) die('--json is required');
if (!args.url) die('--url is required');
if (!args.token) die('--token is required');

const TABLES = [
  'Company', 'Contact', 'Tag', 'Idea', 'EmploymentHistory', 'Conversation', 'Action',
  'ContactTag', 'CompanyTag', 'ConversationContact', 'ConversationCompany',
  'ActionContact', 'ActionCompany', 'IdeaContact', 'IdeaCompany', 'Link', 'PrepNote',
  'Relationship', 'CompanyActivity', 'CompanyPrepNote', 'ContactStatusHistory',
  'CompanyStatusHistory', 'ConversationParticipant', 'ConversationTag',
  'ConversationPrepNote', 'ConversationAttachment', 'ConversationOrg',
];

const data = JSON.parse(readFileSync(args.json, 'utf-8').replace(/^﻿/, ''));
if (!data._meta) die('not a SearchBook export (no _meta)');

const db = createClient({ url: args.url, authToken: args.token });

console.log('\n═══ prod vs backup count diff (READ-ONLY) ═══');
console.log(`backup : ${args.json}  (exportedAt ${data._meta.exportedAt})`);
console.log(`prod   : ${args.url}\n`);
console.log('  ' + 'table'.padEnd(26) + 'prod'.padStart(7) + 'backup'.padStart(8) + '   delta  note');

let backupTotal = 0, prodTotal = 0, missing = 0, grew = 0;
for (const t of TABLES) {
  const backup = Array.isArray(data[t]) ? data[t].length : 0;
  let prod;
  try { prod = Number((await db.execute(`SELECT count(*) AS n FROM "${t}"`)).rows[0].n); }
  catch (e) { console.log(`  ✖ ${t.padEnd(26)} query failed: ${e.message}`); missing++; continue; }
  backupTotal += backup; prodTotal += prod;
  const delta = prod - backup; // prod grown since backup => positive, expected
  let note = '';
  if (delta === 0) note = 'exact';
  else if (delta > 0) { note = `prod +${delta} since backup`; grew++; }
  else { note = `⚠ backup has ${-delta} MORE than prod`; }
  const mark = delta < 0 ? '⚠' : '✓';
  console.log(`  ${mark} ${t.padEnd(26)}${String(prod).padStart(5)}${String(backup).padStart(8)}${String(delta).padStart(8)}  ${note}`);
}
db.close();

console.log(`\n  totals: prod=${prodTotal}  backup=${backupTotal}  (delta ${prodTotal - backupTotal})`);
console.log(
  `\n  Interpretation: the backup is COMPLETE if no table shows prod ≫ backup.\n` +
  `  prod ≥ backup is expected (app used since the backup was taken: ${grew} table(s) grew).`
);
