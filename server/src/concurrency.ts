/**
 * Task 8 (optimistic concurrency): thrown inside a transaction when a guarded write finds
 * the row's `updatedAt` no longer matches the client's expected value — i.e. another device
 * or tab saved in the meantime. Route handlers catch this and respond 409 Conflict.
 */
export class StaleWriteError extends Error {
  constructor() {
    super('Stale write: record was modified by another client');
    this.name = 'StaleWriteError';
  }
}

/** Parse an `_expectedUpdatedAt` value from a request body into a Date, or null if absent. */
export function parseExpectedUpdatedAt(value: unknown): Date | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const CONFLICT_MESSAGE =
  'This record was changed on another device. Reload to get the latest version.';

/**
 * Optimistic-concurrency check done in application code — NOT via a DB-level
 * `where: { id, updatedAt: <Date> }` filter.
 *
 * Why the DB filter was wrong: Prisma 7 stores DateTime in its own canonical text form
 * (`YYYY-MM-DDTHH:MM:SS.SSS+00:00`) and binds that SAME form in equality filters, so
 * `where: { updatedAt }` only ever matches rows Prisma itself last wrote. Rows whose
 * `updatedAt` was last written by the backup-restore / bulk-import / raw-SQL paths are
 * stored as `...Z` (or `YYYY-MM-DD HH:MM:SS`) and can NEVER satisfy that filter — so the
 * guard fired on every save, producing a permanent bogus 409 ("changed on another
 * device") for any record last touched by one of those paths (e.g. a company restored
 * from backup). A normal edit "healed" the row by rewriting `updatedAt` in Prisma's form,
 * which is why most records were fine and only a few were stuck.
 *
 * Comparing the parsed Date's epoch milliseconds sidesteps the stored-text representation
 * entirely: `current` is the Date Prisma already parsed for this row, and `expected` is
 * parsed (via the same path) from the value the client loaded — so an unchanged row always
 * matches, while a genuine cross-device save (different instant) still trips the guard.
 */
export function assertNotStale(current: Date | null | undefined, expected: Date | null): void {
  if (!expected) return; // client sent no token → guard disabled for this write
  if (!current || current.getTime() !== expected.getTime()) throw new StaleWriteError();
}
