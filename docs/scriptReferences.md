# Script References

This document lists the available scripts for development, building, and maintenance of the SearchBook application.

## Root Directory (`/package.json`)

These scripts orchestrate operations across both client and server or handle project-wide tasks.

| Script | Description |
| :--- | :--- |
| `npm start` | **Primary dev command.** Runs `npm run dev` (see below). |
| `npm run dev` | Starts both the client and server in development mode concurrently. |
| `npm run build` | Builds both the client and server for production. |
| `npm run build:vercel` | **Deployment command.** Installs dependencies, generates Prisma client, and builds the client for Vercel deployment. |
| `npm run typecheck` | Runs TypeScript type checking for both client and server. |
| `npm run prepush` | Runs type checks and verifies integrity before pushing code. |
| `npm run db:migrate` | Runs database migrations (wraps `prisma migrate dev` in the server directory). |
| `npm run db:seed` | Seeds the database with initial data (wraps `prisma db seed` in the server directory). |
| `npm run db:studio` | Opens Prisma Studio to view/edit data (wraps `prisma studio` in the server directory). |

## Client Directory (`/client/package.json`)

These scripts are specific to the React frontend.

| Script | Description |
| :--- | :--- |
| `npm run dev` | Starts the Vite development server. |
| `npm run build` | Compiles the React application using `tsc` and `vite build`. |
| `npm run typecheck` | Runs TypeScript type checking (`tsc --noEmit`). |
| `npm run lint` | Runs ESLint to check for code style issues. |
| `npm run preview` | Previews the built production version of the client locally. |

## Server Directory (`/server/package.json`)

These scripts are specific to the Express backend.

| Script | Description |
| :--- | :--- |
| `npm run dev` | Starts the server with `ts-node-dev` for hot reloading. |
| `npm run build` | Compiles the TypeScript server code to JavaScript. |
| `npm run typecheck` | Runs TypeScript type checking (`tsc --noEmit`). |
| `npm run start` | Runs the compiled server (`dist/index.js`). |

## Utility Scripts (`/server/scripts/`)

Only **reusable verification / maintenance** tools live at the top of `server/scripts/`. Spent
one-off migrations and already-applied cleanups are kept under **`server/scripts/archive/`** for
historical reference (don't re-run them).

### Reusable tools (top level)

| Script | Description |
| :--- | :--- |
| `restore-test.mjs` | Restore a prod backup into a scratch Turso DB and verify table counts / relationships / binaries. Prod-safe (`--confirm`, `--forbid-url`). See `.planning/RESTORE-TEST-RUNBOOK.md`. |
| `prod-count-diff.mjs` | Read-only `count(*)` diff between prod and a backup across all tables (backup-completeness proof). |
| `app-smoke.mjs` | Restore a backup into local SQLite and boot the app against it. |
| `count-rows.js` | Count rows per table (quick debugging/verification). |
| `sweep-company-status.js` | Maintenance: promote a Company to `CONNECTED` when a `CONNECTED` contact currently works there (only from blank/`NONE`). Idempotent; re-runnable. |

### `archive/` (applied — do not re-run)

Already-applied schema migrations (`migrate-*.js` / `migrate-*.ts`, `migrate_turso.js`,
`migrate-to-turso.ts`, `migrate-turso-phase2-touchups.js`), one-off data dumps/cleanups
(`export-sql.js`, `delete-researching-recruiters.js`), and retired debug/data scripts
(`debug_dashboard.ts`, `update_industries*.ts`, `verify_updates.ts`, `turso_migrate.js`). Each
documents how a past schema/data change was made; the dual-mode libsql `file:` pattern in these is
the template for future Turso migrations.

## Database Management Reference

The project uses Prisma for database management. Common commands (mostly run via root scripts):

*   **Generate Client:** `npx prisma generate` (Updates the type definitions based on schema)
*   **Migration:** `npx prisma migrate dev` (Applies schema changes to the database)
*   **Studio:** `npx prisma studio` (GUI for the database)
