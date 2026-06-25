#!/usr/bin/env node
/**
 * Backup-coverage guard. Fails the build if any Prisma model that holds user
 * content is missing from the backup/restore code. Wired into `npm run prepush`
 * and `build:vercel`, so a schema addition can't ship without the backup keeping up.
 *
 * It cross-checks FOUR independent enumerations and asserts they all agree:
 *   1. Every `model X` in server/prisma/schema.prisma            (the source of truth)
 *   2. `prisma.X.findMany()` calls in server backup `buildExport` (server export → Blob/file)
 *   3. `tx.X.createMany()` calls in server backup `/import`       (server restore inserts)
 *   4. `TABLES_PARENT_FIRST` in client/src/lib/backup.ts          (browser-direct export AND restore)
 *
 * EXEMPT (below) lists the models intentionally left OUT of backups because they
 * are ephemeral, not user content. Adding a new ephemeral model? Add it here — that
 * is the one conscious decision this guard forces. Everything else must be backed up.
 *
 * Why a guard instead of a checklist: the backup table lists were silently missed
 * twice (Series, IdeaTag) when new features shipped. A checklist relies on memory;
 * this fails loudly at prepush/deploy time instead.
 *
 * Run directly: node server/scripts/check-backup-coverage.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

// Models deliberately NOT backed up (device-ephemeral / regenerable, not user data).
const EXEMPT = new Set(['PushSubscription', 'DeletedSnapshot']);

const SCHEMA = path.join(repoRoot, 'server', 'prisma', 'schema.prisma');
const SERVER_BACKUP = path.join(repoRoot, 'server', 'src', 'routes', 'backup.ts');
const CLIENT_BACKUP = path.join(repoRoot, 'client', 'src', 'lib', 'backup.ts');

function read(file) {
  if (!fs.existsSync(file)) {
    console.error(`✗ backup-coverage: expected file not found: ${path.relative(repoRoot, file)}`);
    process.exit(1);
  }
  return fs.readFileSync(file, 'utf8');
}

// Prisma delegate names are the model name with a lowercased first letter
// (Contact → contact, IdeaTag → ideaTag). Reverse that to get the model name.
const toModel = (delegate) => delegate.charAt(0).toUpperCase() + delegate.slice(1);

function matchAll(text, re, group = 1) {
  return [...text.matchAll(re)].map((m) => m[group]);
}

// 1. Models declared in the schema.
const schemaModels = new Set(matchAll(read(SCHEMA), /^\s*model\s+(\w+)\s*\{/gm));

// 2 + 3. Server export (findMany in buildExport) and restore inserts (createMany in /import).
const serverSrc = read(SERVER_BACKUP);
const serverExport = new Set(matchAll(serverSrc, /prisma\.(\w+)\.findMany\(\)/g).map(toModel));
const serverImport = new Set(matchAll(serverSrc, /tx\.(\w+)\.createMany/g).map(toModel));

// 4. Client browser-direct list (used for BOTH export and restore in production).
const clientSrc = read(CLIENT_BACKUP);
const arrayBlock = clientSrc.match(/const TABLES_PARENT_FIRST = \[([\s\S]*?)\]/);
if (!arrayBlock) {
  console.error('✗ backup-coverage: could not find TABLES_PARENT_FIRST in client/src/lib/backup.ts');
  process.exit(1);
}
const clientTables = new Set(matchAll(arrayBlock[1], /'(\w+)'/g));

// Sanity: the regexes must actually have matched something, or a refactor renamed
// the patterns out from under this guard (which would otherwise pass vacuously).
for (const [label, set] of [['schema models', schemaModels], ['server export findMany', serverExport], ['server import createMany', serverImport], ['client TABLES_PARENT_FIRST', clientTables]]) {
  if (set.size === 0) {
    console.error(`✗ backup-coverage: parsed 0 ${label} — the file shape changed; update this guard.`);
    process.exit(1);
  }
}

// Expected backup set = every schema model except the exempt ones.
const expected = [...schemaModels].filter((m) => !EXEMPT.has(m)).sort();

const problems = [];
const diff = (label, set) => {
  const missing = expected.filter((m) => !set.has(m));
  const extra = [...set].filter((m) => !schemaModels.has(m));
  const exemptButPresent = [...set].filter((m) => EXEMPT.has(m));
  if (missing.length) problems.push(`  ${label}: MISSING ${missing.join(', ')}`);
  if (extra.length) problems.push(`  ${label}: references unknown model(s) ${extra.join(', ')}`);
  if (exemptButPresent.length) problems.push(`  ${label}: includes exempt model(s) ${exemptButPresent.join(', ')} (remove, or remove from EXEMPT in this script)`);
};

diff('server export (buildExport findMany)', serverExport);
diff('server restore (/import createMany)', serverImport);
diff('client TABLES_PARENT_FIRST', clientTables);

// Also flag any exempt model that no longer exists (stale EXEMPT entry).
const staleExempt = [...EXEMPT].filter((m) => !schemaModels.has(m));
if (staleExempt.length) problems.push(`  EXEMPT list: stale entr(y/ies) not in schema: ${staleExempt.join(', ')}`);

if (problems.length) {
  console.error('\n✗ Backup coverage check FAILED — a Prisma model is not fully covered by backup/restore.\n');
  console.error(problems.join('\n'));
  console.error('\nFix: add the model to ALL THREE of —');
  console.error('  • server/src/routes/backup.ts  buildExport (findMany + the returned object)');
  console.error('  • server/src/routes/backup.ts  /import     (deleteMany + createMany, parent-before-child)');
  console.error('  • client/src/lib/backup.ts     TABLES_PARENT_FIRST (parent before child)');
  console.error('— OR, if it is ephemeral and must NOT be backed up, add it to EXEMPT in this script.\n');
  process.exit(1);
}

console.log(`✓ Backup coverage OK — all ${expected.length} user-data tables present in both backup paths (export + restore); ${EXEMPT.size} exempt (${[...EXEMPT].join(', ')}).`);
