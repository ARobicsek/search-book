## What Was Completed Last Session

### Fixed Turso Connection Reliability (2026-03-24)

**Root cause found and fixed.** The `@libsql/client@0.5.6` HTTP transport has TWO issues:
1. **Stale HTTP keep-alive connections** in Vercel serverless — fixed by creating a fresh PrismaClient per request via `resetPrisma()` middleware.
2. **Response size limit** — the HTTP transport hangs when returning 170+ rows with all columns. As data grew past a threshold, list queries started exceeding the transport's capacity.

**Fixes applied (workarounds, to be removed after Prisma 7 upgrade):**
- `server/src/db.ts` — Proxy-based PrismaClient with `resetPrisma()` that creates a fresh client per request in production. Local dev (SQLite) still uses singleton.
- `server/src/app.ts` — Replaced warmup middleware with `resetPrisma()` call before each API request.
- `server/src/routes/companies.ts` — Added explicit `select` (7 fields) to list endpoint, excluding `notes` and `website`.
- `server/src/routes/contacts.ts` — Added explicit `select` (13 fields) to list endpoint, excluding `notes`, `openQuestions`, `personalDetails`, `roleDescription`, etc.
- `server/src/routes/actions.ts` — Conditional select: unfiltered queries (calendar) return 8 essential fields only; filtered queries (dashboard, detail pages) return full data with relation includes.

### Production Performance After Fix
| Endpoint | Time |
|----------|------|
| Contacts (50 rows) | 285ms |
| Companies (206 rows, 7 fields) | 159ms |
| Actions all (171 rows, 8 fields) | 124ms |
| Actions pending (25 rows, full) | 204ms |
| Analytics overview | 288ms |
| Company names | 126ms |

---

## Work for Next Session

### 1. PRIORITY: Upgrade Prisma 6 → 7 + libsql client 0.5.6 → 0.17.0

This upgrade eliminates the root cause of the response size limit that required all the workarounds above.

**What to upgrade:**
- `prisma` (dev): `^6.3.1` → `^7.x`
- `@prisma/client`: `^6.3.1` → `^7.x`
- `@prisma/adapter-libsql`: `^6.3.1` → `^7.x`
- `@libsql/client`: `^0.5.6` → `^0.17.0`

**Key concerns:**
- Prisma 7 has breaking changes — check the [Prisma 7 upgrade guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7)
- The generated client import path may change (`./generated/prisma/client` → check)
- The `PrismaLibSQL` adapter constructor API may differ
- `@libsql/client@0.17.0` is already used in the browser-direct backup module (`client/src/lib/turso-backup.ts`) — so we know it works with Turso
- After upgrade, verify locally then deploy and test ALL endpoints

**After successful upgrade, clean up workarounds:**
- `db.ts`: The `resetPrisma()` per-request pattern may no longer be needed (test without it)
- `companies.ts`, `contacts.ts`, `actions.ts`: The explicit `select` constraints can be relaxed (test with full findMany)
- CLAUDE.md: Update the libsql response size warning

### 2. Phase 8: Document Search (if time permits)
See `.planning/ROADMAP.md` for details.

---

## Open Bugs

None currently. All production timeouts resolved.

## Current State of Resilience Layers
- Per-request fresh PrismaClient in production (in `app.ts` middleware via `resetPrisma()`)
- Server timeout: 12s (in `app.ts` middleware)
- Client timeout: 28s (in `client/src/lib/api.ts`)
- Client auto-retry: GET requests retry once on 504, 500, or timeout
- All list endpoints use explicit `select` to stay under libsql response size limit
