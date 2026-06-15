// Shared rule: when you "get connected" to a contact (their status becomes
// CONNECTED), the org(s) they currently work at should reflect that we now have
// a relationship there — i.e. the company's status becomes CONNECTED too.
//
// Guard against downgrades: only promote companies that haven't yet entered a
// relationship stage (NONE / RESEARCHING). A company already ENGAGED, PARTNER,
// or CONNECTED is left untouched.

// Loose structural type so this works with both the long-lived PrismaClient
// proxy and a `$transaction` client (their generated types are heavily
// overloaded — `any` args keep the call sites friction-free).
type CompanyStatusDb = {
  company: {
    findMany(args: any): Promise<{ id: number; status: string }[]>;
    update(args: any): Promise<unknown>;
  };
  companyStatusHistory: {
    create(args: any): Promise<unknown>;
  };
};

const PROMOTABLE_COMPANY_STATUSES = new Set(['NONE', 'RESEARCHING']);

function safeParseArray(value: string | null | undefined): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// The companies a contact *currently works at*: the primary employer plus any
// additional companies not explicitly marked past (`isCurrent === false`).
export function currentEmployerCompanyIds(contact: {
  companyId: number | null;
  additionalCompanyIds: string | null;
}): number[] {
  const ids = new Set<number>();
  if (contact.companyId) ids.add(contact.companyId);
  for (const entry of safeParseArray(contact.additionalCompanyIds)) {
    if (typeof entry === 'number') {
      ids.add(entry);
    } else if (entry && typeof entry === 'object') {
      const e = entry as { id?: unknown; isCurrent?: unknown };
      if (typeof e.id === 'number' && e.isCurrent !== false) ids.add(e.id);
    }
  }
  return [...ids];
}

// Promote the given companies to CONNECTED (recording status history), skipping
// any already in a relationship stage so we never downgrade. No-op for [].
export async function promoteCompaniesToConnected(
  db: CompanyStatusDb,
  companyIds: number[],
): Promise<void> {
  if (companyIds.length === 0) return;
  const companies = await db.company.findMany({
    where: { id: { in: companyIds } },
    select: { id: true, status: true },
  });
  for (const c of companies) {
    if (!PROMOTABLE_COMPANY_STATUSES.has(c.status)) continue;
    await db.company.update({ where: { id: c.id }, data: { status: 'CONNECTED' } });
    await db.companyStatusHistory.create({
      data: { companyId: c.id, oldStatus: c.status, newStatus: 'CONNECTED' },
    });
  }
}
