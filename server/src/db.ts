import { PrismaClient } from './generated/prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';

// Custom fetch with 15s timeout — prevents Turso connections from hanging indefinitely
function fetchWithTimeout(input: any, init?: any): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

// Create Prisma client with Turso adapter in production, or plain SQLite locally
function createPrismaClient() {
  // Use Turso in production (when TURSO_DATABASE_URL is set)
  if (process.env.TURSO_DATABASE_URL) {
    const adapter = new PrismaLibSQL({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
      fetch: fetchWithTimeout,
    });
    return new PrismaClient({ adapter });
  }

  // Use local SQLite in development
  return new PrismaClient();
}

const prisma = createPrismaClient();

export default prisma;
