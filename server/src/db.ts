import path from 'path';
import { PrismaClient } from './generated/prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

// Resolve DATABASE_URL relative to server/prisma/ (where the schema lives)
// to match Prisma 6 behavior, since the adapter resolves relative to CWD.
function resolveLocalDbUrl(): string {
  const raw = process.env.DATABASE_URL || 'file:./dev.db';
  const filePath = raw.replace(/^file:/, '');
  const absolute = path.resolve(__dirname, '..', 'prisma', filePath);
  return `file:${absolute}`;
}

// Create a fresh Prisma client (with Turso adapter in production, SQLite adapter locally)
function createPrismaClient(): PrismaClient {
  if (process.env.TURSO_DATABASE_URL) {
    const adapter = new PrismaLibSql({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    return new PrismaClient({ adapter });
  }
  // Dynamic require: better-sqlite3 is a native module only available in dev
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
  const adapter = new PrismaBetterSqlite3({
    url: resolveLocalDbUrl(),
  });
  return new PrismaClient({ adapter });
}

// In local dev (SQLite), reuse a single client.
// In production (Turso), create a fresh client per request to avoid stale HTTP connections.
let _client: PrismaClient = createPrismaClient();

/** Call before each request in production to get a fresh Turso connection. */
export function resetPrisma(): void {
  if (process.env.TURSO_DATABASE_URL) {
    _client = createPrismaClient();
  }
}

// Proxy delegates to the current _client, so route code stays unchanged
const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    return (_client as any)[prop];
  },
});

export default prisma;
