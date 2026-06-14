#!/usr/bin/env node
// Restore-test harness (CALENDAR-FAVORITES-BACKUP-PLAN Item 5).
//
// Restores a SearchBook backup JSON into a *scratch* libsql/Turso (or local
// file:) database and verifies completeness: per-table row counts, key
// relationships, and (optionally) that photo/attachment binaries resolve.
//
// It NEVER touches production: it only writes to the --target you pass, refuses
// to run without --confirm, and aborts if --target matches --forbid-url.
//
// Mirrors the production restore path (client/src/lib/backup.ts importViaTurso):
// FK-ordered wipe (children first) + insert (parents first), Contact self-refs
// applied last, booleans coerced to 0/1.
//
// Usage:
//   node server/scripts/restore-test.mjs \
//     --json  <prod-backup.json> \
//     --target "libsql://scratch-xxx.turso.io"  --token "<scratch authToken>" \
//     --schema-from "file:./server/prisma/dev.db" \   # bootstrap empty scratch DB
//     --check-binaries \
//     --forbid-url "libsql://<your-prod>.turso.io" \
//     --confirm
//
//   # Local dry-run (no Turso needed):
//   node server/scripts/restore-test.mjs --json export.json \
//     --target "file:./scratch-test.db" --schema-from "file:./server/prisma/dev.db" --confirm
//
// Args:
//   --json <path>          backup JSON (the searchbook-backup-*.json you downloaded)   [required]
//   --target <url>         file:... or libsql://...  (WIPED + restored)                [required]
//   --token <token>        auth token for a remote libsql/Turso target
//   --schema-from <url>    file:.../libsql... to copy the schema (DDL) from first
//   --forbid-url <url>     abort if --target matches this (pass your prod URL)
//   --check-binaries       HEAD-sample photo/attachment URLs and report reachability
//   --confirm              required to actually write (otherwise dry-prints the plan)

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createClient } = require('@libsql/client');

// ── arg parsing ───────────────────────────────────────────────
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));

function die(msg) { console.error(`\n✖ ${msg}\n`); process.exit(1); }

if (!args.json) die('--json <backup.json> is required');
if (!args.target) die('--target <file:...|libsql://...> is required');
if (args['forbid-url'] && args.target === args['forbid-url']) {
  die(`--target equals --forbid-url (${args.target}). Refusing to touch it.`);
}
const isRemote = !String(args.target).startsWith('file:');
const token = args.token || process.env.TURSO_AUTH_TOKEN;
if (isRemote && !token) die('remote --target needs --token (or TURSO_AUTH_TOKEN)');

// FK-safe table order (parents first); reverse for deletes. Mirrors
// client/src/lib/backup.ts TABLES_PARENT_FIRST.
const TABLES_PARENT_FIRST = [
  'Company', 'Contact', 'Tag', 'Idea',
  'EmploymentHistory', 'Conversation', 'Action',
  'ContactTag', 'CompanyTag',
  'ConversationContact', 'ConversationCompany',
  'ActionContact', 'ActionCompany',
  'IdeaContact', 'IdeaCompany',
  'Link', 'PrepNote', 'Relationship',
  'CompanyActivity', 'CompanyPrepNote',
  'ContactStatusHistory', 'CompanyStatusHistory',
  'ConversationParticipant',
  'ConversationTag',
  'ConversationPrepNote', 'ConversationAttachment',
  'ConversationOrg',
];
const TABLES_CHILD_FIRST = [...TABLES_PARENT_FIRST].reverse();

// ── load backup ───────────────────────────────────────────────
let data;
try { data = JSON.parse(readFileSync(args.json, 'utf-8').replace(/^﻿/, '')); }
catch (e) { die(`could not read/parse --json: ${e.message}`); }
if (!data._meta) die('backup JSON has no _meta — not a SearchBook export');

const jsonCounts = {};
for (const t of TABLES_PARENT_FIRST) jsonCounts[t] = Array.isArray(data[t]) ? data[t].length : 0;
const jsonTotal = Object.values(jsonCounts).reduce((a, b) => a + b, 0);

console.log('\n═══ SearchBook restore-test ═══');
console.log(`source JSON : ${args.json}  (exportedAt ${data._meta.exportedAt}, v${data._meta.version})`);
console.log(`target      : ${args.target}${isRemote ? '  [REMOTE — will be WIPED]' : '  [local file]'}`);
console.log(`schema-from : ${args['schema-from'] || '(none — target must already have the schema)'}`);
console.log(`rows in JSON: ${jsonTotal} across ${TABLES_PARENT_FIRST.length} tables`);

if (!args.confirm) {
  console.log('\n(dry run — pass --confirm to actually bootstrap/wipe/restore)\n');
  process.exit(0);
}

const dst = createClient(isRemote ? { url: args.target, authToken: token } : { url: args.target });

// ── 1. optional schema bootstrap ──────────────────────────────
async function bootstrapSchema() {
  const from = args['schema-from'];
  if (!from) return;
  const srcCfg = String(from).startsWith('file:') ? { url: from } : { url: from, authToken: token };
  const src = createClient(srcCfg);
  const rs = await src.execute(
    "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL " +
    "AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'"
  );
  // tables first, then everything else (indexes/triggers/views)
  const order = { table: 0, index: 1, trigger: 2, view: 3 };
  const stmts = rs.rows
    .map((r) => ({ type: r.type, name: r.name, sql: r.sql }))
    .sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9));
  let n = 0;
  for (const s of stmts) {
    try { await dst.execute(s.sql); n++; }
    catch (e) { console.warn(`  · skip ${s.type} ${s.name}: ${e.message}`); }
  }
  src.close();
  console.log(`\n[schema] replayed ${n}/${stmts.length} DDL statements from ${from}`);
}

// ── 2. wipe + restore (single write transaction) ──────────────
function coerce(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}
async function restore() {
  const tx = await dst.transaction('write');
  try {
    for (const table of TABLES_CHILD_FIRST) {
      if (table === 'Contact') await tx.execute('UPDATE "Contact" SET "referredById" = NULL');
      await tx.execute(`DELETE FROM "${table}"`);
    }
    for (const table of TABLES_PARENT_FIRST) {
      const rows = Array.isArray(data[table]) ? data[table] : [];
      if (!rows.length) continue;
      if (table === 'Contact') {
        await insertRows(tx, table, rows.map((r) => ({ ...r, referredById: null })));
        for (const r of rows) {
          if (r.referredById != null) {
            await tx.execute({ sql: 'UPDATE "Contact" SET "referredById" = ? WHERE "id" = ?', args: [r.referredById, r.id] });
          }
        }
      } else {
        await insertRows(tx, table, rows);
      }
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    die(`restore failed (rolled back): ${e.message}`);
  }
  console.log('[restore] wipe + insert committed');
}
async function insertRows(tx, table, rows) {
  const columns = Object.keys(rows[0]);
  const quoted = columns.map((c) => `"${c}"`).join(', ');
  const ph = columns.map(() => '?').join(', ');
  const sql = `INSERT INTO "${table}" (${quoted}) VALUES (${ph})`;
  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await tx.batch(chunk.map((row) => ({ sql, args: columns.map((c) => coerce(row[c])) })));
  }
}

// ── 3. verify ─────────────────────────────────────────────────
async function verify() {
  console.log('\n─── per-table row counts (target vs JSON) ───');
  let ok = 0, bad = 0;
  for (const t of TABLES_PARENT_FIRST) {
    let n = 0;
    try { n = Number((await dst.execute(`SELECT count(*) AS n FROM "${t}"`)).rows[0].n); }
    catch (e) { console.log(`  ✖ ${t}: query failed — ${e.message}`); bad++; continue; }
    const want = jsonCounts[t];
    const mark = n === want ? '✓' : '✖';
    if (n === want) ok++; else bad++;
    console.log(`  ${mark} ${t.padEnd(26)} ${String(n).padStart(5)} / ${want}`);
  }
  console.log(`\n  ${ok}/${TABLES_PARENT_FIRST.length} tables match exactly` + (bad ? `, ${bad} MISMATCH` : ''));

  // relationship spot-checks
  console.log('\n─── relationship spot-checks ───');
  await spot('a meeting with participants', async () => {
    const p = (await dst.execute('SELECT "conversationId" AS id FROM "ConversationParticipant" LIMIT 1')).rows[0];
    if (!p) return 'no ConversationParticipant rows (skipped)';
    const id = p.id;
    const q = async (t) => Number((await dst.execute({ sql: `SELECT count(*) AS n FROM "${t}" WHERE "conversationId" = ?`, args: [id] })).rows[0].n);
    const conv = (await dst.execute({ sql: 'SELECT "title","date" FROM "Conversation" WHERE "id" = ?', args: [id] })).rows[0];
    if (!conv) return `Conversation ${id} MISSING for participant`;
    return `Conversation ${id} "${conv.title ?? conv.date}" → participants=${await q('ConversationParticipant')} orgs=${await q('ConversationOrg')} tags=${await q('ConversationTag')} prep=${await q('ConversationPrepNote')} attach=${await q('ConversationAttachment')}`;
  });
  await spot('a contact with additionalCompanyIds', async () => {
    const r = (await dst.execute(`SELECT "id","additionalCompanyIds" FROM "Contact" WHERE "additionalCompanyIds" IS NOT NULL AND "additionalCompanyIds" NOT IN ('','[]') LIMIT 1`)).rows[0];
    return r ? `Contact ${r.id} → ${r.additionalCompanyIds}` : 'none present (skipped)';
  });
  await spot('status history present', async () => {
    const c = Number((await dst.execute('SELECT count(*) AS n FROM "ContactStatusHistory"')).rows[0].n);
    const co = Number((await dst.execute('SELECT count(*) AS n FROM "CompanyStatusHistory"')).rows[0].n);
    return `ContactStatusHistory=${c}, CompanyStatusHistory=${co}`;
  });

  if (args['check-binaries']) await checkBinaries();
  return bad === 0;
}
async function spot(label, fn) {
  try { console.log(`  • ${label}: ${await fn()}`); }
  catch (e) { console.log(`  ✖ ${label}: ${e.message}`); }
}

// ── 4. optional binary reachability ───────────────────────────
async function checkBinaries() {
  console.log('\n─── binary reachability (sample) ───');
  const urls = new Set();
  const addAbs = (u) => { if (typeof u === 'string' && /^https?:\/\//.test(u.trim())) urls.add(u.trim()); };
  for (const r of (data.Contact ?? [])) { addAbs(r.photoUrl); addAbs(r.photoFile); }
  for (const r of (data.Company ?? [])) addAbs(r.photoFile);
  for (const r of (data.ConversationAttachment ?? [])) addAbs(r.url);
  const md = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)/g;
  for (const t of TABLES_PARENT_FIRST) for (const row of (data[t] ?? [])) {
    for (const v of Object.values(row)) {
      if (typeof v !== 'string' || !v.includes('](')) continue;
      let m; md.lastIndex = 0; while ((m = md.exec(v)) !== null) addAbs(m[1]);
    }
  }
  const list = [...urls];
  if (!list.length) { console.log('  (no absolute http binary URLs in backup — local /photos//files/ paths only; skipped)'); return; }
  const sample = list.slice(0, 15);
  let okN = 0;
  await Promise.all(sample.map(async (u) => {
    try { const r = await fetch(u, { method: 'GET' }); if (r.ok) okN++; else console.log(`  ✖ ${r.status} ${u.slice(0, 70)}`); }
    catch (e) { console.log(`  ✖ ERR ${u.slice(0, 70)} — ${e.message}`); }
  }));
  console.log(`  ${okN}/${sample.length} sampled URLs reachable (of ${list.length} total absolute URLs)`);
}

// ── run ───────────────────────────────────────────────────────
(async () => {
  await bootstrapSchema();
  await restore();
  const allOk = await verify();
  dst.close();
  console.log(allOk ? '\n✓ restore test PASSED (all table counts match)\n' : '\n✖ restore test had mismatches — see above\n');
  process.exit(allOk ? 0 : 1);
})().catch((e) => die(e.stack || e.message));
