# SearchBook Architecture

> **`CLAUDE.md` (repo root) is the source of truth** for conventions, critical gotchas, and current
> status. This file is a higher-level orientation; when the two disagree, trust `CLAUDE.md`.

## Overview

SearchBook is a single-user, browser-based personal CRM — a monorepo of a React frontend and an
Express backend, deployed on Vercel with a Turso (libsql) cloud DB. Originally built for executive
job-search networking, it is being adapted into an **executive stakeholder-management system** for
the owner's NCQA CMO role (see `.planning/NCQA-ADAPTATION-PLAN.md`).

## Tech Stack

### Client (`/client`)
- **Framework:** [React](https://react.dev/) with [Vite](https://vitejs.dev/)
- **Language:** TypeScript
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **UI Components:** [Radix UI](https://www.radix-ui.com/) via [shadcn/ui](https://ui.shadcn.com/)
- **Routing:** [React Router](https://reactrouter.com/)
- **State Management:** React Hooks and local state
- **Icons:** [Lucide React](https://lucide.dev/)

### Server (`/server`)
- **Runtime:** Node.js
- **Framework:** [Express](https://expressjs.com/)
- **ORM:** [Prisma 7](https://www.prisma.io/) — **adapter-based** (no `url` in the schema
  datasource). `PrismaLibSql` for Turso in production, `PrismaBetterSqlite3` for local SQLite.
  Connection config lives in `prisma.config.ts` (CLI) and `src/db.ts` (runtime).
- **Database:** SQLite (local development, `server/prisma/dev.db`) / Turso libsql (production).
- **Language:** TypeScript

> **Key DB gotchas** (full list in `CLAUDE.md`): never use Prisma `_count` selects (they hang the
> libsql adapter on Turso); `db.ts` keeps one long-lived client and retries once on a connection
> error; list endpoints use explicit `select` to exclude large text fields. Schema changes need
> manual Turso DDL via the web SQL console before pushing schema-touching code.

## Project Structure

```
SearchBook/
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utilities and API client
│   │   ├── pages/          # Page components (routed)
│   │   └── App.tsx         # Main entry point and routing config
│   └── package.json
├── server/                 # Backend Express application
│   ├── prisma/             # Database schema and seed data
│   │   ├── schema.prisma   # Data model definition
│   │   └── seed.ts         # Initial data population script
│   ├── src/
│   │   ├── routes/         # API route handlers (business logic here)
│   │   ├── app.ts          # Express app configuration
│   │   └── index.ts        # Server entry point
│   └── package.json
├── docs/                   # Documentation
└── package.json            # Root configuration (concurrently scripts)
```

## Data Flow

1.  **User Interaction:** The user interacts with the React frontend.
2.  **API Request:** The frontend makes HTTP requests using a wrapper around `fetch` (located in `client/src/lib/api.ts`).
    *   Requests are sent to relative paths like `/api/contacts`.
    *   In development, these are proxied or handled via CORS to the server port (usually 3001).
    *   In production (Vercel), these are serverless function invocations.
3.  **Route Handling:** The Express server receives the request. The application logic is primarily contained within the route files in `server/src/routes/`.
    *   There is no separate "controller" directory; route handlers contain the business logic.
4.  **Database Access:** Route handlers use the Prisma Client (`server/src/db.ts`) to query the database.
5.  **Response:** Data is returned as JSON to the frontend.

## Key Data Models (`server/prisma/schema.prisma`)

*   **Contact:** A person in the network. Multiple emails/companies per contact; `usefulFor` free
    text marks "useful people". Favorites are a reserved `Favorite` tag (no dedicated column).
*   **Company:** An organization (labelled "Organization" in the UI). Contacts link via employment.
*   **Action:** A task/to-do. Multi-target via `ActionContact`/`ActionCompany` junctions; ownership
    via `owedByMe` + `owerContactIds` (the `direction` enum is derived server-side).
*   **Conversation:** A meeting (labelled "Meeting" in the UI). "Who" facets via
    `ConversationParticipant` (attendees, with per-person notes) and `ConversationOrg` (orgs met
    with), plus `ConversationContact`/`ConversationCompany` for people/orgs *discussed*. Optional
    `Series` grouping (`seriesId`). Prep + files via `ConversationPrepNote` / `ConversationAttachment`.
*   **Idea:** A scrapbook for thoughts/strategies; tags share the app-wide `Tag` vocab (`IdeaTag`);
    soft-archivable.
*   **DeletedSnapshot:** Backs the server-side undo-last-delete (snapshot-and-replay).
*   **Status history:** `ContactStatusHistory` / `CompanyStatusHistory` for analytics transitions.

The UI relabels `Conversation`→"Meeting" and `Company`→"Organization" as **display strings only** —
the model names, `/conversations` + `/companies` API routes, and event names are unchanged.

## Development Workflow

The project is designed to be run locally using a single command from the root directory:

```bash
npm run dev
```

This uses `concurrently` to start both the Vite development server (client) and the Express server (backend) in parallel.

*   **Client URL:** http://localhost:5173
*   **Server URL:** http://localhost:3001

## Deployment

The application is configured for deployment on Vercel.
*   The `client` is deployed as a static site.
*   The `server` is deployed as Serverless Functions.
*   `server/src/app.ts` is the shared configuration used by both the local server and the Vercel entry point.
