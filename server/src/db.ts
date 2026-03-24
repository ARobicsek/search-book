import { PrismaClient } from './generated/prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';

// Create a fresh Prisma client (with Turso adapter in production, plain SQLite locally)
function createPrismaClient(): PrismaClient {
  if (process.env.TURSO_DATABASE_URL) {
    const adapter = new PrismaLibSQL({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    return new PrismaClient({ adapter });
  }
  return new PrismaClient();
}

// In local dev (SQLite), reuse a single client.
// In production (Turso), create a fresh client per request to avoid stale HTTP connections.
// The @libsql/client@0.5.6 reuses HTTP keep-alive connections that go stale in serverless,
// causing all queries after the first to hang indefinitely.
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
