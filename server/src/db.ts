import { PrismaClient } from './generated/prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';

// Create Prisma client with Turso adapter in production, or plain SQLite locally
function createPrismaClient() {
  // Use Turso in production (when TURSO_DATABASE_URL is set)
  if (process.env.TURSO_DATABASE_URL) {
    const adapter = new PrismaLibSQL({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    return new PrismaClient({ adapter });
  }

  // Use local SQLite in development
  return new PrismaClient();
}

const prisma = createPrismaClient();

export default prisma;
