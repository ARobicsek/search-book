## What Was Completed Last Session

### Fixed Turso Connection Reliability (2026-03-24)

**Root cause found and fixed.** The `@libsql/client@0.5.6` HTTP transport has TWO issues:
1. **Stale HTTP keep-alive connections** in Vercel serverless — fixed by creating a fresh PrismaClient per request via `resetPrisma()` middleware.
2. **Response size limit** — the HTTP transport hangs when returning 170+ rows with all columns. This is the actual reason the app broke: as data grew past a threshold, list queries started exceeding the transport's capacity.

**Fixes applied:**
- `server/src/db.ts` — Proxy-based PrismaClient with `resetPrisma()` that creates a fresh client per request in production. Local dev (SQLite) still uses singleton.
- `server/src/app.ts` — Replaced warmup middleware with `resetPrisma()` call before each API request.
- `server/src/routes/companies.ts` — Added explicit `select` (7 fields) to list endpoint, excluding `notes` and `website`.
- `server/src/routes/contacts.ts` — Added explicit `select` (13 fields) to list endpoint, excluding `notes`, `openQuestions`, `personalDetails`, `roleDescription`, etc.
- `server/src/routes/actions.ts` — Conditional select: unfiltered queries (calendar) return 8 essential fields only; filtered queries (dashboard, detail pages) return full data with relation includes.

**Key finding (add to CLAUDE.md):** The `@libsql/client@0.5.6` HTTP transport hangs when result set exceeds ~200 rows × 10 columns. All list endpoints MUST use explicit `select` to limit response size. This is a hard limit of the library version — upgrading to `@libsql/client@0.17.0` (requires Prisma 7) would likely fix this.

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

**1. Update CLAUDE.md with libsql response size constraint**
Add the discovery about `@libsql/client@0.5.6` response size limits. Any new list endpoint must use explicit `select` to stay under the threshold.

**2. Phase 8: Document Search**
See `.planning/ROADMAP.md` for details.

**3. Consider Prisma 7 upgrade (optional)**
`@prisma/adapter-libsql@7.5.0` + `@libsql/client@0.17.0` would likely eliminate the response size issue entirely. Significant upgrade but worth evaluating.

---

## Open Bugs

None currently. All production timeouts resolved.

## Current State of Resilience Layers
- Per-request fresh PrismaClient in production (in `app.ts` middleware via `resetPrisma()`)
- Server timeout: 12s (in `app.ts` middleware)
- Client timeout: 28s (in `client/src/lib/api.ts`)
- Client auto-retry: GET requests retry once on 504, 500, or timeout
- All list endpoints use explicit `select` to stay under libsql response size limit
