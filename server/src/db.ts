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

// One long-lived client, reused across requests.
//
// We previously rebuilt the client + libsql adapter on EVERY request (resetPrisma
// called by middleware in app.ts) to dodge stale libsql HTTP connections on warm
// Vercel instances — a real bug, but a heavy fix (a full client construction per
// request). Instead we now keep a single client and rebuild it only when a query
// actually fails with a connection/transport error, retrying that query once
// against the fresh client (see runWithRetry). Route code is untouched: the Proxy
// at the bottom routes every query through the retry path.
let _client: PrismaClient = createPrismaClient();

// True when an error means the underlying connection is unusable (stale/closed
// libsql HTTP connection on a warm serverless instance, network reset, etc.), as
// opposed to a normal query rejection (unique constraint, FK, validation). We must
// NOT rebuild-and-retry on the latter: the query reached the database, and
// retrying a write that already landed would double-apply it.
function isConnectionError(err: any): boolean {
  if (!err) return false;

  const code: unknown = err.code;
  if (typeof code === 'string') {
    // Prisma "known request" errors (P2xxx) reached the DB and were rejected on
    // their merits — never a transport problem.
    if (code.startsWith('P2')) return false;
    // Prisma connection / initialization error codes.
    if (['P1001', 'P1002', 'P1008', 'P1017'].includes(code)) return true;
  }

  const name: string = err.name || '';
  if (name === 'PrismaClientInitializationError') return true;
  if (name === 'PrismaClientRustPanicError') return true;

  // Transport-level signals surfaced by the libsql adapter / undici fetch layer.
  // Lean toward recall: for a single-user app an unnecessary rebuild+retry is
  // cheap, while a missed one resurfaces the stale-connection 500s this guards.
  const msg = `${err.message || ''} ${err.cause?.message || ''}`.toLowerCase();
  return /econnreset|socket hang up|epipe|etimedout|enotfound|eai_again|und_err|fetch failed|other side closed|terminated|stream closed|stream has been closed|stream was reset|stream reset|hrana|connection closed|connection reset|connection refused|connection lost|connection error|connection timed out|network error|websocket/.test(
    msg,
  );
}

// Run a Prisma operation against the current client. On a connection/transport
// error, rebuild the client once and retry the operation exactly once against the
// fresh client (the `invoke` callback receives the client to use). Concurrent
// failures — e.g. a Promise.all all hitting the same stale connection — rebuild
// the client only once: later failures reuse whatever fresh client the first made.
async function runWithRetry<T>(invoke: (client: PrismaClient) => PromiseLike<T>): Promise<T> {
  const client = _client;
  try {
    return await invoke(client);
  } catch (err) {
    if (!isConnectionError(err)) throw err;
    if (_client === client) {
      console.warn(
        '[db] connection error — rebuilding Prisma client and retrying once:',
        (err as any)?.message,
      );
      _client = createPrismaClient();
    }
    return await invoke(_client);
  }
}

// Client-level methods that issue queries directly (raw SQL + interactive
// transactions). Model delegate methods (prisma.contact.findMany, …) are wrapped
// separately via wrapDelegate. Everything else on the client (lifecycle methods
// like $connect/$disconnect/$on, internals, symbols) passes straight through.
const RETRYABLE_CLIENT_METHODS = new Set([
  '$queryRaw',
  '$queryRawUnsafe',
  '$executeRaw',
  '$executeRawUnsafe',
  '$transaction',
]);

// Wrap a model delegate (prisma.contact, prisma.company, …) so each of its
// methods runs through runWithRetry. Non-function members pass through unchanged.
function wrapDelegate(modelProp: string): unknown {
  return new Proxy(
    {},
    {
      get(_t, methodProp: string | symbol) {
        const original = (_client as any)[modelProp][methodProp];
        if (typeof original !== 'function') return original;
        return (...args: any[]) =>
          runWithRetry((client) => (client as any)[modelProp][methodProp](...args));
      },
    },
  );
}

// Proxy delegates to the current _client so route code stays unchanged, while
// transparently adding rebuild-on-connection-error retry around every query.
const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    if (typeof prop !== 'string') {
      return (_client as any)[prop];
    }

    // Raw queries + interactive transactions: wrap the call itself with retry.
    if (RETRYABLE_CLIENT_METHODS.has(prop)) {
      return (...args: any[]) => runWithRetry((client) => (client as any)[prop](...args));
    }

    const value = (_client as any)[prop];

    // Model delegates are the plain-object, non-$ members whose methods execute
    // queries — wrap them so their calls retry too. Functions ($connect, $on, …),
    // primitives, and internals (_-prefixed) pass through unchanged.
    if (value && typeof value === 'object' && !prop.startsWith('$') && !prop.startsWith('_')) {
      return wrapDelegate(prop);
    }

    return value;
  },
});

export default prisma;
