// Engine-less Prisma client + libSQL driver adapter — the exact production shape from
// server/src/db.ts, minus the retry Proxy (not needed to prove connectivity).
// Extensionless: the Prisma 7 `prisma-client` generator emits TS source (client.ts).
// Netlify's esbuild bundler resolves this to client.ts and compiles the whole graph.
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const adapter = new PrismaLibSql({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const prisma = new PrismaClient({ adapter });
export default prisma;
