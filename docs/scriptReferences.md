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

Additional scripts found in the `server/scripts` directory for specific tasks.

| Script | Location | Description |
| :--- | :--- | :--- |
| `count-rows.js` | `server/scripts/count-rows.js` | Utility to count rows in database tables (likely for debugging/verification). |
| `export-sql.js` | `server/scripts/export-sql.js` | Utility to export database content to SQL format. |
| `migrate-to-turso.ts` | `server/scripts/migrate-to-turso.ts` | Script to handle data migration to Turso (production DB). |
| `migrate_turso.js` | `server/scripts/migrate_turso.js` | JavaScript version or helper for the Turso migration. |

## Database Management Reference

The project uses Prisma for database management. Common commands (mostly run via root scripts):

*   **Generate Client:** `npx prisma generate` (Updates the type definitions based on schema)
*   **Migration:** `npx prisma migrate dev` (Applies schema changes to the database)
*   **Studio:** `npx prisma studio` (GUI for the database)
