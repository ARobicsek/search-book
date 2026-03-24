## What Was Completed Last Session

### Query Optimizations (2026-03-24)
1. **Actions list endpoint** — Created `actionListIncludes` (lighter includes, skips `conversation` and nested `company` lookups). The list endpoint (`GET /api/actions`) now uses this; detail endpoint (`GET /api/actions/:id`) still uses full includes.
2. **Analytics overview** — Replaced full table scans (`findMany` all contacts/companies) with SQL `GROUP BY` aggregations and `count()` queries. Was O(total records), now O(records in date range).
3. **Removed dangerous `_count` debug endpoint** — The `GET /api/debug/companies` had a `_count` include that hangs on Turso. Removed that test case.
4. **Client retry on 500** — `api.ts` now also retries GET requests on 500 errors (previously only 504/timeout).
5. **Server timeout reduced 25s→12s** — Gives the client two retry attempts within Vercel's 30s window instead of one.
6. **Warmup wait reduced 8s→4s** — Don't block real requests waiting too long for warmup.
7. **Client timeout reduced 30s→28s** — Allows room for initial request (12s) + retry (12s) + overhead.

### Failed Experiment: Custom fetch with AbortController
Tried adding a `fetchWithTimeout` wrapper to the `PrismaLibSQL` config's `fetch` option. This broke the libsql client initialization entirely (immediate 500 errors on all endpoints). Reverted. The `@libsql/client@0.5.6` + `@prisma/adapter-libsql@6.19.2` combination doesn't work with a custom fetch function.

---

## Work for Next Session

**1. CRITICAL: Fix Turso Connection Reliability**
Pages still intermittently fail to load. The problem is NOT query complexity — queries complete in 200-400ms when they connect. The problem is **intermittent Turso connection failures** where the HTTP request to Turso hangs indefinitely.

Evidence from Vercel logs (2026-03-24 16:05):
- `/api/contacts` returned 200 in 368ms and 433ms
- `/api/companies` timed out at 12s **at the exact same timestamp**
- After initial success, ALL subsequent requests timed out for minutes
- Turso status page shows 100% uptime — the issue is subtle (not a full outage)

**Root cause hypothesis:** The Prisma-libsql adapter holds a connection that goes stale, OR Turso's free tier has connection/rate limits, OR there's a Vercel-to-Turso network path issue.

**Next steps to investigate (in priority order):**

a. **Check Turso free tier limits** — Look at Turso dashboard for connection counts, rate limits, or throttling. The free Starter plan may have limits we're hitting.

b. **Check Vercel function region vs Turso DB region** — If the serverless function runs in a different region than the Turso DB, every query has high latency. Turso DB region can be checked in the Turso dashboard. Vercel function region is set in `vercel.json` (defaults to iad1/Washington DC).

c. **Upgrade Prisma + adapter to v7** — `@prisma/adapter-libsql@7.5.0` requires `@libsql/client@^0.17.0` which has much better HTTP handling. This is a significant upgrade (Prisma 6→7) but may solve the connection issues.

d. **Alternative: bypass Prisma for read queries** — Use raw `@libsql/client` directly for simple list/detail queries (contacts, companies). Keep Prisma for writes and complex operations. This eliminates the adapter layer as a potential bottleneck.

e. **Vercel cron job to keep function warm** — Add a `vercel.json` cron that hits `/api/health` every 5 minutes to prevent cold starts. (Only helps if the issue is cold-start related.)

f. **Connection pooling / recreation** — If the adapter holds a stale connection, try recreating the Prisma client when queries fail. Export a function from `db.ts` that creates a fresh client.

**2. Address Unmatched Companies (Optional)**
Consider fuzzy matching or manual alias lookups for the 112 missing recruiting companies.

**3. Phase 8: Document Search**
See `.planning/ROADMAP.md` for details.

---

## Open Bugs

**Intermittent production timeouts (CRITICAL)** — Turso connections intermittently hang, causing 504 timeouts across all pages. Queries are fast (200-400ms) when they connect. The connection itself is the bottleneck. Resilience layers (12s server timeout, client auto-retry on 504/500) partially mitigate but don't fix the root cause. Turso status page shows no outage — this appears to be a connection-level or rate-limiting issue.

## Current State of Resilience Layers
- Server timeout: 12s (in `app.ts` middleware)
- Client timeout: 28s (in `client/src/lib/api.ts`)
- Client auto-retry: GET requests retry once on 504, 500, or timeout
- DB warmup: `SELECT 1` on module load, waits up to 4s
- PWA service worker: no networkTimeout (removed previously)
