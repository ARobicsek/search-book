// One-shot migration: Contact.preferredName ("Goes by / pronunciation").
//
// Adds the column (additive, single ADD COLUMN — no table rebuild) and back-fills it
// by extracting the parenthetical out of names stored as "First (Spoken) Last":
//
//   "Benjamin (Ben) Glicksberg"   ->  name "Benjamin Glicksberg"   + preferredName "Ben"
//   "Vivek (Viv-ACHE) Garg"       ->  name "Vivek Garg"            + preferredName "Viv-ACHE"
//   "Stephen (Steve) J. Watt"     ->  name "Stephen J. Watt"       + preferredName "Steve"
//
// Only the FIRST parenthetical is extracted; a row already carrying a preferredName is
// left untouched (idempotent). DRY-RUN by default — pass `--apply` to write.
//
// Dual-mode:
//   • Local dev:  node scripts/migrate-contact-preferred-name.js            (preview)
//                 node scripts/migrate-contact-preferred-name.js --apply    (write)
//   • Turso prod: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/migrate-contact-preferred-name.js --apply
//
// Take a backup first (Settings → Create Backup) before running with --apply on prod.
const { createClient } = require('@libsql/client');

// Split "First (Spoken) Last" → { name, spoken }, or null when there's no usable
// parenthetical. Collapses the gap left by the removed "(...)" and trims.
function parseName(raw) {
  const m = /^(.*?)\s*\(([^)]+)\)\s*(.*)$/.exec(raw || '');
  if (!m) return null;
  const spoken = m[2].trim();
  const cleaned = `${m[1]} ${m[3]}`.replace(/\s+/g, ' ').trim();
  if (!spoken || !cleaned) return null;
  return { name: cleaned, spoken, multiParen: cleaned.includes('(') };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const turso = process.env.TURSO_DATABASE_URL;
  const config = turso
    ? { url: turso, authToken: process.env.TURSO_AUTH_TOKEN }
    : { url: 'file:./prisma/dev.db' };
  console.log(`Target: ${turso ? 'Turso (production)' : config.url}`);
  console.log(apply ? 'Mode:   APPLY (writing changes)\n' : 'Mode:   DRY-RUN (no changes — pass --apply to write)\n');

  const client = createClient(config);
  try {
    // 1) Column (SQLite has no ADD COLUMN IF NOT EXISTS — guard on PRAGMA).
    const info = await client.execute('PRAGMA table_info("Contact")');
    const hasCol = info.rows.some((r) => r.name === 'preferredName');
    if (!hasCol) {
      if (apply) {
        await client.execute('ALTER TABLE "Contact" ADD COLUMN "preferredName" TEXT');
        console.log('OK: ADD COLUMN preferredName TEXT');
      } else {
        console.log('WOULD: ADD COLUMN preferredName TEXT');
      }
    } else {
      console.log('SKIP: column preferredName already exists');
    }

    // 2) Back-fill. Read every contact; only touch rows with a parseable
    //    parenthetical AND no existing preferredName.
    const all = await client.execute(
      hasCol
        ? 'SELECT id, name, preferredName FROM "Contact"'
        : 'SELECT id, name, NULL AS preferredName FROM "Contact"'
    );
    const changes = [];
    for (const row of all.rows) {
      const existing = (row.preferredName == null ? '' : String(row.preferredName)).trim();
      if (existing) continue; // never overwrite a curated value
      const parsed = parseName(String(row.name));
      if (parsed) changes.push({ id: row.id, oldName: String(row.name), ...parsed });
    }

    console.log(`\n${changes.length} contact(s) to convert:\n`);
    for (const c of changes) {
      console.log(`  #${c.id}  "${c.oldName}"  ->  name "${c.name}"  +  goes-by "${c.spoken}"${c.multiParen ? '   ⚠ extra "(" remains — review' : ''}`);
    }

    if (!changes.length) {
      console.log('\nNothing to back-fill.');
      return;
    }

    if (!apply) {
      console.log('\nDRY-RUN — re-run with --apply to write these changes.');
      return;
    }

    // 3) Write atomically.
    const stmts = changes.map((c) => ({
      sql: 'UPDATE "Contact" SET name = ?, preferredName = ? WHERE id = ?',
      args: [c.name, c.spoken, c.id],
    }));
    await client.batch(stmts, 'write');
    console.log(`\nApplied ${stmts.length} update(s).`);
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
