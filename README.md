# SearchBook

Personal CRM, single-user and browser-based, deployed as a PWA on Vercel with a Turso cloud DB.

Originally built for executive job-search networking, SearchBook is now being adapted into an
**executive stakeholder-management system** for the owner's role as Chief Medical Officer of NCQA —
mapping who's aligned with which agendas, tracking how each person can help, and surviving a heavy
meeting load with reliable capture and follow-ups.

- **Live:** https://searchbook-three.vercel.app
- **Stack:** React + Vite + TypeScript (client) · Express + TypeScript (server) · Prisma 7 ORM ·
  SQLite locally / Turso (libsql) in prod · shadcn/ui (Tailwind) · vite-plugin-pwa

## Quick start

```bash
npm start          # runs client (http://localhost:5173) + server (http://localhost:3001)
npm run prepush    # typecheck client + server before pushing
```

> Local dev requires the Turso credentials in `server/.env` to be **commented out** — otherwise the
> app hangs trying to reach the cloud DB. If Prisma errors, run `cd server && npx prisma generate`.

Deploys happen automatically on `git push` to `main` (Vercel is connected to GitHub).

## Where to read next

| For… | Read |
|------|------|
| Tech stack, conventions, critical gotchas, current status | [`CLAUDE.md`](CLAUDE.md) |
| The session workflow (any AI agent) | [`AGENTS.md`](AGENTS.md) |
| Active roadmap / plan of record | [`.planning/NCQA-ADAPTATION-PLAN.md`](.planning/NCQA-ADAPTATION-PLAN.md) |
| Index of all planning/session docs | [`.planning/README.md`](.planning/README.md) |
| Architecture overview | [`docs/architecture.md`](docs/architecture.md) |
| Scripts reference | [`docs/scriptReferences.md`](docs/scriptReferences.md) |

## Project layout

```
client/        # React frontend (Vite)
server/        # Express backend (Prisma; routes in src/routes/)
  scripts/     # reusable verification/maintenance tools (spent migrations in scripts/archive/)
api/index.ts   # Vercel serverless entry point
docs/          # architecture + scripts reference
.planning/     # roadmap, session docs, decisions (archived plans in .planning/archive/)
```
