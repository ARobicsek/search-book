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
