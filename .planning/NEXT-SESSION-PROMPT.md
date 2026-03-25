## What Was Completed Last Session

### Prisma 6→7 Upgrade (2026-03-24)

Successfully upgraded the entire Prisma stack and eliminated the libsql response size workarounds.

**Packages upgraded:**
- `prisma`: 6.3.1 → 7.5.0
- `@prisma/client`: 6.3.1 → 7.5.0
- `@prisma/adapter-libsql`: 6.3.1 → 7.5.0
- `@libsql/client`: 0.5.6 → 0.17.2
- Added `@prisma/adapter-better-sqlite3@7.5.0` (devDependency, local dev only)

**Breaking changes handled:**
- `PrismaLibSQL` → `PrismaLibSql` (casing change in adapter export)
- `PrismaClient()` now requires an adapter argument (no more implicit datasource)
- `datasource.url` removed from `schema.prisma` → moved to `prisma.config.ts`
- Local SQLite now uses `PrismaBetterSqlite3` adapter (dynamic import to avoid native module on Vercel)

**Workarounds cleaned up:**
- Removed conditional `isFiltered` select in actions route — all queries now use full `include`
- Removed outdated libsql comments from contacts.ts and companies.ts
- Kept `resetPrisma()` per-request pattern (still good serverless hygiene)
- Kept explicit `select` on list endpoints (good practice, not a workaround)

**Production verified:**
- 171 actions returned with full includes — no hangs
- All endpoints responding normally

---

## Work for Next Session

### 1. Optional: Test removing `resetPrisma()` per-request pattern

The per-request fresh PrismaClient was added for `@libsql/client@0.5.6` stale connections. With 0.17.2, it may no longer be needed. To test:
1. Comment out the `resetPrisma()` middleware call in `app.ts` (line ~73)
2. Deploy and monitor for any connection failures
3. If stable, simplify `db.ts` to remove the Proxy pattern

### 2. Phase 8: Document Search
See `.planning/ROADMAP.md` for details.

---

## Open Bugs

None currently. All production endpoints stable.

## Current State of Resilience Layers
- Per-request fresh PrismaClient in production (in `app.ts` middleware via `resetPrisma()`)
- Server timeout: 12s (in `app.ts` middleware)
- Client timeout: 28s (in `client/src/lib/api.ts`)
- Client auto-retry: GET requests retry once on 504, 500, or timeout
- List endpoints use explicit `select` for performance (not a workaround)
