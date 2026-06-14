# Next Session Prompt

This file is the handoff document for the next AI session (Claude Code **or** Gemini/Antigravity — the
protocol is agent-agnostic). It summarizes what was just accomplished, what to work on next, and open items.

### What Was Just Completed (2026-06-14, build session) — Task 3 shipped; 4 of 5 batch tasks done

Plan of record: `.planning/ACTIONS-IDEAS-POLISH-PLAN.md`. Tasks 1/2/4 shipped earlier on 2026-06-14;
**this session shipped Task 3**. Only **Task 5** (long-lived PrismaClient) remains in the batch.

- **Task 3 — Rework "Who owes it" into a people list (SCHEMA-TOUCHING).** Additive `Action.owedByMe`
  (bool, default 1) + `Action.owerContactIds` (JSON id array). `direction` is now a **derived server-side
  mirror** — `resolveOwers()` in [actions.ts](../server/src/routes/actions.ts) sets `direction =
  owedByMe && owers empty ? 'OWED_BY_ME' : 'WAITING_ON_THEM'`. **Important correction:** C1's prose said
  `OWED_TO_ME`, but the real enum value the dashboard/list/detail read is **`WAITING_ON_THEM`** — that's
  what's derived, so the "Waiting on others" card / `?filter=waiting` / badges are unchanged. The client
  form's old standalone "Who owes it" Select is replaced by a **collapsed disclosure**: removable
  default-on **Me** chip + contacts MultiCombobox + favorite-contact quick-add chips (Quick Log pattern);
  auto-expands in edit when non-default. Verified end-to-end against local SQLite (all derive cases + a
  full create/edit through the UI; the derived "Waiting on them" badge renders); `npm run prepush` +
  `tsc -b` green; smoke-tested desktop + 390px. **Turso DDL applied by the owner via the web dashboard
  SQL console** (see caveat below). Migration script committed for audit:
  [server/scripts/migrate-actions-owers.js](../server/scripts/migrate-actions-owers.js).

### What's Next — finish the batch (1 task remains), then back to NCQA

1. **Task 5 — Long-lived PrismaClient** (retire per-request `resetPrisma()` in
   [server/src/db.ts](../server/src/db.ts) + middleware in `app.ts`). **Its own focused session** —
   carries real serverless risk (the per-request pattern fixed a real stale-libsql-connection bug). Reuse
   one client; recreate only on a connection error (catch + one retry), keep the `Proxy` indirection.
   **Must verify against the live deploy after an idle period** (hit endpoints after the instance goes
   cold) before declaring done. Schema-free.
2. **After Task 5 ships, the standing plan of record returns to the NCQA adaptation plan**
   (`.planning/NCQA-ADAPTATION-PLAN.md`, Phase 3+) — gated on D5–D9. **Don't push on D5–D9 until the
   owner raises them.**

### Carry-over items (pre-dating, lower priority)
1. **[USER ACTION]** Set `SENTRY_DSN` / `VITE_SENTRY_DSN` in Vercel (hardening Task 17).
2. NCQA adaptation plan: Phase 3 (blocked D8/D9) / Phase 4 (D5/D6). Don't push on D5–D9 until raised.
3. #12 LinkedIn-on-mobile deferred (screenshot→gpt-4o-mini vision is the ready option if revisited).
4. Stray empty `server/dev.db` / `server/test.db` (gitignored) safe to delete — and note the gotcha below.

### Open Bugs / Known Caveats
- **⚠ The committed Turso rw token in `server/.env` is STALE** — it's structurally a valid no-expiry rw
  JWT but Turso rejects it with a hard **401** (rotated/revoked server-side; Vercel holds the live one).
  For the next schema task, either mint a **fresh** rw token from the Turso dashboard (Databases →
  searchbook-arobicsek → Create Token, no expiry) and paste it, or apply the DDL via the **Turso web
  dashboard SQL console** (what was done for Task 3). The Vercel CLI is installed but **not logged in**.
- **⚠ `prisma db push` local-path gotcha:** run from `server/`, `npx prisma db push` resolves
  `file:./dev.db` to the **stray empty `server/dev.db`**, NOT the populated `server/prisma/dev.db` that
  the running server opens (db.ts resolves relative to `__dirname` → `prisma/dev.db`). Net effect: db push
  reports "in sync" but the server still 500s with `column ... does not exist`. Fix: apply the DDL
  directly to `server/prisma/dev.db` (e.g. better-sqlite3 `ALTER TABLE`), or `db push --url
  file:./prisma/dev.db`.
- The `tsc -b` build (`noUnusedLocals`) remains the gate that catches unused imports the `typecheck`
  script misses — run it (not just `npm run prepush`) before every push.
- Dev smoke-testing note: orphaned dev processes pile up — this session found several leftover
  `concurrently`/`ts-node-dev`/`vite` instances holding ports 3001 + 5173–5176, and a locked
  chrome-devtools-mcp profile. Stop the stale project `node` processes (CommandLine matches `searchbook` +
  `vite|ts-node-dev|concurrently`) and the stale `chrome.exe` whose command line contains
  `chrome-devtools-mcp` (dedicated `.cache` profile, NOT the owner's daily Chrome) before starting fresh.
  Local app has no `APP_PASSWORD`, so the login gate accepts any password (pre-seed
  `localStorage.searchbook_password`).

### Working branch
`main`. This session: Task 3 commit (live on Vercel after push). Tasks 1/2/4 were `6588def` + `7723ffb`.

---

### Suggested kickoff prompt for the next session

> Read `CLAUDE.md` / `AGENTS.md`, then this file, then **`.planning/ACTIONS-IDEAS-POLISH-PLAN.md`** (Tasks
> 1/2/3/4 shipped 2026-06-14; **only Task 5 remains**). Do **Task 5 — long-lived PrismaClient** (retire
> per-request `resetPrisma()`): reuse one client, recreate only on a connection error (catch + one retry),
> keep the `Proxy` indirection. It's schema-free but carries real serverless risk — **verify against the
> live deploy after an idle/cold period** before declaring done. One atomic commit; `npm run prepush`
> **and** `tsc -b` + desktop/390px smoke before push; push to main is authorized. After Task 5, the
> standing plan of record returns to the NCQA adaptation plan (Phase 3+, gated on D5–D9 — don't push on
> those until the owner raises them). Standing owner action: set `SENTRY_DSN`/`VITE_SENTRY_DSN` in Vercel.
