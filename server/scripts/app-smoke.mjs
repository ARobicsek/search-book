// Hits the local server's heavy read endpoints against whatever is in dev.db
// and prints status + a representative field, to prove the app functions on the
// restored data. Read-only.
const BASE = 'http://localhost:3001/api';

async function hit(path) {
  try {
    const r = await fetch(BASE + path);
    const txt = await r.text();
    let body; try { body = JSON.parse(txt); } catch { body = txt; }
    return { status: r.status, body };
  } catch (e) { return { status: 'ERR', body: e.message }; }
}
const total = (b) => (b && b.pagination ? b.pagination.total : (Array.isArray(b) ? b.length : '?'));
const line = (mark, label, detail) => console.log(`  ${mark} ${label.padEnd(34)} ${detail}`);

console.log('\n═══ app smoke against restored dev.db ═══');

// list endpoints (the heaviest Prisma reads)
for (const [label, path] of [
  ['Contacts list', '/contacts?limit=3'],
  ['Companies list', '/companies?limit=3'],
  ['Conversations list', '/conversations?limit=3'],
  ['Actions list', '/actions?limit=3'],
  ['Ideas list', '/ideas?limit=3'],
  ['Tags', '/tags'],
  ['Analytics', '/analytics'],
]) {
  const { status, body } = await hit(path);
  const ok = status === 200;
  line(ok ? '✓' : '✖', label, ok ? `200  total=${total(body)}` : `${status}  ${JSON.stringify(body).slice(0,120)}`);
}

// detail endpoints (relationship-heavy serialization)
const contacts = (await hit('/contacts?limit=1')).body;
const cid = contacts?.data?.[0]?.id;
if (cid) {
  const { status, body } = await hit(`/contacts/${cid}`);
  line(status === 200 ? '✓' : '✖', `Contact detail #${cid}`, status === 200 ? `200  name="${body.name ?? body.firstName ?? ''}" companies=${(body.additionalCompanyIds||'').length>2?'yes':'-'}` : status);
}
const conv = await hit('/conversations/100');
line(conv.status === 200 ? '✓' : '✖', 'Conversation detail #100', conv.status === 200 ? `200  title="${conv.body.title ?? conv.body.date ?? ''}" participants=${(conv.body.participants||[]).length}` : conv.status);

// search (its own code path)
const search = await hit('/search?q=a&limit=3');
line(search.status === 200 ? '✓' : '✖', 'Search q="a"', search.status === 200 ? `200  results present` : search.status);

console.log('');
