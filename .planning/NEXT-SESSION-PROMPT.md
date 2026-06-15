# Next Session Prompt

This file is the handoff document for the next AI session (Claude Code **or** Gemini/Antigravity — the
protocol is agent-agnostic). It summarizes what was just accomplished, what to work on next, and open items.

### What Was Just Completed (2026-06-14) — Task 5 shipped; Actions/Ideas Polish batch COMPLETE

Plan `.planning/ACTIONS-IDEAS-POLISH-PLAN.md` is now **fully done (all 5 tasks)**. This session shipped the
last one:

- **Task 5 — Long-lived PrismaClient (commit `7551da2`, schema-free).** Retired the per-request
  `resetPrisma()` middleware in [app.ts](../server/src/app.ts) (the 2026-03-24 stale-connection fix that
  rebuilt the `PrismaClient` + libsql adapter on **every** `/api` request). [db.ts](../server/src/db.ts) now
  keeps **one** long-lived `_client` and rebuilds it **only on an actual connection/transport error**,
  retrying that one query **once** against the fresh client (`runWithRetry`). `isConnectionError` matches
  Prisma `P1xxx` + transport signals (`ECONNRESET`/`fetch failed`/`stream closed`/`socket hang up`/`und_err`/…)
  but **never** `P2xxx` known-request errors — so a write that already reached the DB is never double-applied.
  Concurrent failures (a `Promise.all` hitting one stale connection) rebuild the client only once (guarded by
  `_client === client`). The `Proxy` indirection is **kept and deepened** so route code is untouched: raw
  queries + `$transaction` wrap the call itself; model delegates (`prisma.contact.findMany`, …) wrap each
  method — safe because all 15 `$transaction` usages are the **callback form** (lazy `PrismaPromise`
  semantics preserved; array form is unused anywhere). The CLAUDE.md "Per-request fresh PrismaClient" note
  was updated to describe the new pattern.
- **Verification:** local SQLite smoke (delegate / `$queryRaw` / `$queryRaw`-in-`Promise.all` /
  `$transaction` create→delete — all 200) **and**, because the stale-connection bug only reproduces on
  Turso-on-Vercel, a **live-deploy idle test**: `/api/health` (which runs `$queryRaw` through the Turso
  adapter) probed across **two idle cycles (6 min + 9 min)** — **10/10 post-idle probes `200 db:ok`, zero
  5xx**; the first probe after each idle ran ~0.4s (transparent reconnect) then settled to ~0.12s. The stale
  connection is now handled invisibly instead of surfacing the old 500. `prepush` + `tsc -b` + vite build green.

### What's Next — standing plan of record returns to the NCQA adaptation plan

The Actions/Ideas Polish batch is finished. **Resume `.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+).**
Phase 3 is gated on D8/D9 and Phase 4 on D5/D6 — **don't push on D5–D9 until the owner raises them.**

### Carry-over items (pre-dating, lower priority)
1. **[USER ACTION]** Set `SENTRY_DSN` / `VITE_SENTRY_DSN` in Vercel (hardening Task 17) to activate error tracking.
2. NCQA adaptation plan: Phase 3 (blocked D8/D9) / Phase 4 (D5/D6). Don't push on D5–D9 until raised.
3. #12 LinkedIn-on-mobile deferred (screenshot→gpt-4o-mini vision is the ready option if revisited).
4. Stray empty `server/dev.db` / `server/test.db` (gitignored) safe to delete — see the `prisma db push` gotcha below.

### Open Bugs / Known Caveats
- **⚠ The committed Turso rw token in `server/.env` is STALE** — structurally a valid no-expiry rw JWT but
  Turso rejects it with a hard **401** (rotated/revoked server-side; Vercel holds the live one). For any
  future **schema** task, either mint a **fresh** rw token from the Turso dashboard (Databases →
  searchbook-arobicsek → Create Token, no expiry) or apply DDL via the **Turso web dashboard SQL console**.
  The Vercel CLI is installed but **not logged in**. *(Task 5 was schema-free, so this didn't bite this session.)*
- **⚠ `prisma db push` local-path gotcha:** run from `server/`, `npx prisma db push` resolves `file:./dev.db`
  to the **stray empty `server/dev.db`**, NOT the populated `server/prisma/dev.db` the server actually opens
  (db.ts resolves relative to `__dirname` → `prisma/dev.db`). Net: db push reports "in sync" but the server
  still 500s with `column ... does not exist`. Fix: apply DDL directly to `server/prisma/dev.db`, or
  `db push --url file:./prisma/dev.db`.
- The `tsc -b` build (`noUnusedLocals`) remains the gate that catches unused imports the `typecheck` script
  misses — run it (not just `npm run prepush`) before every push.
- Dev smoke-testing note: orphaned dev processes pile up (`concurrently`/`ts-node-dev`/`vite` on 3001 +
  5173–5176, plus a locked chrome-devtools-mcp profile). Stop the stale project `node` processes
  (CommandLine matches `searchbook` + `vite|ts-node-dev|concurrently`) and the stale `chrome.exe` whose
  command line contains `chrome-devtools-mcp` before starting fresh. Local app has no `APP_PASSWORD`, so the
  login gate accepts any password (pre-seed `localStorage.searchbook_password`). **Note:** `ts-node-dev
  --respawn` *does* reload on save — this session it respawned with the edited `db.ts` automatically.

### Working branch
`main`. This session: Task 5 code commit `7551da2` (live on Vercel) + a docs commit for these planning updates.

---

### Suggested kickoff prompt for the next session

> Read `CLAUDE.md` / `AGENTS.md`, then this file, then **`.planning/NCQA-ADAPTATION-PLAN.md`** — the
> standing plan of record is back to it now that the Actions/Ideas Polish batch is **complete** (all 5
> tasks shipped, incl. Task 5 long-lived PrismaClient verified live). Work **Phase 3+**, but Phase 3 is
> gated on D8/D9 and Phase 4 on D5/D6 — **don't push on D5–D9 until I raise them.** House rules unchanged:
> atomic commit per task; `npm run prepush` **and** `tsc -b` + desktop/390px smoke before push; schema
> changes need the Turso DDL applied first (committed `server/.env` token is stale — mint a fresh one or use
> the dashboard SQL console). Standing owner action: set `SENTRY_DSN`/`VITE_SENTRY_DSN` in Vercel.
