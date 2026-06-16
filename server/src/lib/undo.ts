// Undo via snapshot-and-replay.
//
// Deletes in this app are HARD deletes with DB-level cascade. A single delete fans
// out three ways, all of which undo must reverse:
//   1. Cascade deletes (onDelete: Cascade)  — child rows physically removed (recursive:
//      contact -> its anchored conversations -> their participants/notes/...).
//   2. SetNull scrubs   (onDelete: SetNull)  — referencing rows survive but lose the FK.
//   3. JSON-array scrubs (company only)      — the deleted company id is stripped out of
//      each contact's additionalCompanyIds / connectedCompanyIds (no FK models this).
//
// Just before a delete runs we capture everything it will destroy/mutate into a JSON
// payload stored in DeletedSnapshot. `restoreLatest` replays the most recent snapshot.
// The Prisma runtime model carries relations but NO onDelete info, so the cascade graph
// below is encoded by hand from schema.prisma.
import prisma from '../db';

// ─── Cascade / SetNull graph (keyed by Prisma delegate name) ────────────────

// A child relation whose rows are physically deleted when the parent is. `fk` is the
// column(s) pointing back to the parent; `recurse: true` means the child is itself a
// deletable entity whose own children must be captured (contact -> conversation).
type ChildRel = { model: string; fk: string | string[]; recurse?: boolean };
// A relation whose rows survive but have `fk` SetNull'd — capture ids to re-point on undo.
type RefRel = { model: string; fk: string };

const CASCADE: Record<string, ChildRel[]> = {
  contact: [
    { model: 'contactStatusHistory', fk: 'contactId' },
    { model: 'contactTag', fk: 'contactId' },
    { model: 'prepNote', fk: 'contactId' },
    { model: 'employmentHistory', fk: 'contactId' },
    { model: 'ideaContact', fk: 'contactId' },
    { model: 'actionContact', fk: 'contactId' },
    { model: 'conversationParticipant', fk: 'contactId' },
    { model: 'conversationContact', fk: 'contactId' },
    { model: 'relationship', fk: ['fromContactId', 'toContactId'] },
    { model: 'conversation', fk: 'contactId', recurse: true },
  ],
  company: [
    { model: 'companyStatusHistory', fk: 'companyId' },
    { model: 'companyTag', fk: 'companyId' },
    { model: 'companyActivity', fk: 'companyId' },
    { model: 'companyPrepNote', fk: 'companyId' },
    { model: 'conversationCompany', fk: 'companyId' },
    { model: 'conversationOrg', fk: 'companyId' },
    { model: 'ideaCompany', fk: 'companyId' },
    { model: 'actionCompany', fk: 'companyId' },
  ],
  conversation: [
    { model: 'conversationParticipant', fk: 'conversationId' },
    { model: 'conversationContact', fk: 'conversationId' },
    { model: 'conversationCompany', fk: 'conversationId' },
    { model: 'conversationOrg', fk: 'conversationId' },
    { model: 'conversationTag', fk: 'conversationId' },
    { model: 'conversationPrepNote', fk: 'conversationId' },
    { model: 'conversationAttachment', fk: 'conversationId' },
  ],
  action: [
    { model: 'actionContact', fk: 'actionId' },
    { model: 'actionCompany', fk: 'actionId' },
    { model: 'link', fk: 'actionId' },
  ],
  idea: [
    { model: 'ideaContact', fk: 'ideaId' },
    { model: 'ideaCompany', fk: 'ideaId' },
    { model: 'ideaTag', fk: 'ideaId' },
  ],
  // Leaves (no cascade children): prepNote, companyPrepNote, conversationPrepNote,
  // conversationAttachment, companyActivity, employmentHistory, link, relationship, series.
};

const SET_NULL: Record<string, RefRel[]> = {
  contact: [
    { model: 'action', fk: 'contactId' },
    { model: 'link', fk: 'contactId' },
    { model: 'contact', fk: 'referredById' }, // self-relation (Referrals)
  ],
  company: [
    { model: 'contact', fk: 'companyId' },
    { model: 'conversation', fk: 'companyId' },
    { model: 'action', fk: 'companyId' },
    { model: 'link', fk: 'companyId' },
    { model: 'employmentHistory', fk: 'companyId' },
  ],
  conversation: [{ model: 'action', fk: 'conversationId' }],
  series: [{ model: 'conversation', fk: 'seriesId' }],
};

// Composite primary keys (junction tables); everything else keys on `id`.
const PK_FIELDS: Record<string, string[]> = {
  contactTag: ['contactId', 'tagId'],
  companyTag: ['companyId', 'tagId'],
  conversationParticipant: ['conversationId', 'contactId'],
  conversationContact: ['conversationId', 'contactId'],
  conversationCompany: ['conversationId', 'companyId'],
  conversationOrg: ['conversationId', 'companyId'],
  conversationTag: ['conversationId', 'tagId'],
  actionContact: ['actionId', 'contactId'],
  actionCompany: ['actionId', 'companyId'],
  ideaContact: ['ideaId', 'contactId'],
  ideaCompany: ['ideaId', 'companyId'],
  ideaTag: ['ideaId', 'tagId'],
};
const pkFields = (model: string): string[] => PK_FIELDS[model] || ['id'];

// Insert order on restore: parents before children. A model's rank is the depth at
// which it can be safely inserted (all its FK targets already exist). Everything not
// listed is a leaf/junction → rank 4 (inserted last, after the entities it points at).
const RANK: Record<string, number> = {
  company: 0,
  series: 0,
  tag: 0,
  contact: 1,
  idea: 1,
  conversation: 2,
  action: 3,
};
const rank = (model: string): number => RANK[model] ?? 4;

// The only DateTime columns in the schema. JSON round-trips them to ISO strings; Prisma
// create wants Date objects, so revive these on restore.
const DATE_FIELDS = ['createdAt', 'updatedAt'];

function safeParseArray(value: string | null | undefined): any[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function reviveDates(row: any): any {
  const out = { ...row };
  for (const f of DATE_FIELDS) {
    if (typeof out[f] === 'string') out[f] = new Date(out[f]);
  }
  return out;
}

// ─── Capture ────────────────────────────────────────────────────────────────

type Insert = { model: string; row: any };
type FkRestore = { model: string; field: string; ids: number[]; value: number };
type JsonRestore = { id: number; field: string; companyId: number; addBack: any };

// Capture (within an open transaction) everything that deleting `entityType`/`id` will
// destroy or mutate, and write the DeletedSnapshot row. Does NOT delete the entity —
// the caller runs the actual (cascade) delete right after.
export async function captureDelete(
  tx: any,
  entityType: string,
  id: number,
  label: string,
): Promise<void> {
  const inserts: Insert[] = [];
  const fkRestores: FkRestore[] = [];
  const jsonRestores: JsonRestore[] = [];
  const seen = new Set<string>();

  const keyOf = (model: string, row: any) =>
    `${model}:${pkFields(model).map((f) => row[f]).join('/')}`;
  const push = (model: string, row: any): boolean => {
    const k = keyOf(model, row);
    if (seen.has(k)) return false;
    seen.add(k);
    inserts.push({ model, row });
    return true;
  };

  async function gather(model: string, rid: number): Promise<void> {
    for (const c of CASCADE[model] || []) {
      const where = Array.isArray(c.fk)
        ? { OR: c.fk.map((f) => ({ [f]: rid })) }
        : { [c.fk]: rid };
      const rows = await tx[c.model].findMany({ where });
      for (const r of rows) {
        const isNew = push(c.model, r);
        if (isNew && c.recurse) await gather(c.model, r.id);
      }
    }
    for (const ref of SET_NULL[model] || []) {
      const rows = await tx[ref.model].findMany({ where: { [ref.fk]: rid }, select: { id: true } });
      if (rows.length) {
        fkRestores.push({ model: ref.model, field: ref.fk, ids: rows.map((r: any) => r.id), value: rid });
      }
    }
  }

  const mainRow = await tx[entityType].findUnique({ where: { id } });
  if (!mainRow) throw new Error(`captureDelete: ${entityType} ${id} not found`);
  push(entityType, mainRow);
  await gather(entityType, id);

  // Company-only: the deleted id is hand-scrubbed out of contacts' JSON arrays
  // (see companies.ts). Record the removed entries so undo can re-add them.
  if (entityType === 'company') {
    const referencing = await tx.contact.findMany({
      where: {
        OR: [
          { additionalCompanyIds: { contains: `${id}` } },
          { connectedCompanyIds: { contains: `${id}` } },
        ],
      },
      select: { id: true, additionalCompanyIds: true, connectedCompanyIds: true },
    });
    for (const c of referencing) {
      const additional = safeParseArray(c.additionalCompanyIds);
      const addEntry = additional.find((it: any) =>
        (typeof it === 'object' && it ? it.id : it) === id,
      );
      if (addEntry !== undefined) {
        jsonRestores.push({ id: c.id, field: 'additionalCompanyIds', companyId: id, addBack: addEntry });
      }
      const connected = safeParseArray(c.connectedCompanyIds);
      if (connected.some((it: any) => it === id)) {
        jsonRestores.push({ id: c.id, field: 'connectedCompanyIds', companyId: id, addBack: id });
      }
    }
  }

  await tx.deletedSnapshot.create({
    data: { entityType, entityId: id, label, payload: JSON.stringify({ inserts, fkRestores, jsonRestores }) },
  });

  // Keep the stack bounded — prune everything past the most recent 25.
  const stale = await tx.deletedSnapshot.findMany({ orderBy: { id: 'desc' }, skip: 25, select: { id: true } });
  if (stale.length) {
    await tx.deletedSnapshot.deleteMany({ where: { id: { in: stale.map((s: any) => s.id) } } });
  }
}

// Convenience: capture + cascade-delete a top-level entity in one transaction.
// `extra` runs after capture, before the delete (used by the company route's JSON scrub).
export async function deleteWithSnapshot(
  entityType: string,
  id: number,
  label: string,
  extra?: (tx: any) => Promise<void>,
): Promise<void> {
  await prisma.$transaction(
    async (tx: any) => {
      await captureDelete(tx, entityType, id, label);
      if (extra) await extra(tx);
      await tx[entityType].delete({ where: { id } });
    },
    { timeout: 15000 },
  );
}

// ─── Restore ──────────────────────────────────────────────────────────────

export type UndoSummary = { id: number; entityType: string; entityId: number; label: string; createdAt: Date };
export type RestoreResult = { entityType: string; entityId: number; label: string };

export async function peekLatest(): Promise<UndoSummary | null> {
  const snap = await prisma.deletedSnapshot.findFirst({
    orderBy: { id: 'desc' },
    select: { id: true, entityType: true, entityId: true, label: true, createdAt: true },
  });
  return snap;
}

// Replay the most recent snapshot, then consume it. Returns null if nothing to undo.
// Throws on FK/unique errors (e.g. an id reused since the delete) — the transaction
// rolls back so the snapshot survives for a later retry.
export async function restoreLatest(): Promise<RestoreResult | null> {
  return prisma.$transaction(
    async (tx: any) => {
      const snap = await tx.deletedSnapshot.findFirst({ orderBy: { id: 'desc' } });
      if (!snap) return null;
      const payload = JSON.parse(snap.payload) as {
        inserts: Insert[];
        fkRestores: FkRestore[];
        jsonRestores: JsonRestore[];
      };

      // Parents before children (FK-safe), regardless of capture order.
      const ordered = [...payload.inserts].sort((a, b) => rank(a.model) - rank(b.model));
      for (const ins of ordered) {
        await tx[ins.model].create({ data: reviveDates(ins.row) });
      }

      // Re-point SetNull'd FKs — only where still null (don't clobber a later edit).
      for (const fr of payload.fkRestores || []) {
        await tx[fr.model].updateMany({
          where: { id: { in: fr.ids }, [fr.field]: null },
          data: { [fr.field]: fr.value },
        });
      }

      // Re-add the scrubbed company id to each contact's JSON array, if still missing.
      for (const jr of payload.jsonRestores || []) {
        const cur = await tx.contact.findUnique({ where: { id: jr.id }, select: { [jr.field]: true } });
        if (!cur) continue;
        const arr = safeParseArray((cur as any)[jr.field]);
        const present = arr.some((it: any) => (typeof it === 'object' && it ? it.id : it) === jr.companyId);
        if (!present) {
          arr.push(jr.addBack);
          await tx.contact.update({ where: { id: jr.id }, data: { [jr.field]: JSON.stringify(arr) } });
        }
      }

      await tx.deletedSnapshot.delete({ where: { id: snap.id } });
      return { entityType: snap.entityType, entityId: snap.entityId, label: snap.label };
    },
    { timeout: 15000 },
  );
}
