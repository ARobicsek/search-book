# SearchBook

Personal CRM for executive job search networking. Single-user, browser-based. Deployed as PWA on Vercel with Turso cloud DB.

## Quick Reference

- **Live**: https://searchbook-three.vercel.app
- **Local client**: http://localhost:5173
- **Local server**: http://localhost:3001
- **Start locally**: `npm start`
- **Pre-push check**: `npm run prepush`
- **Deploy**: Auto on `git push` to main (Vercel connected to GitHub)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + TypeScript |
| UI | shadcn/ui (Tailwind CSS) |
| Backend | Express.js + TypeScript |
| DB (local) | SQLite via Prisma ORM |
| DB (prod) | Turso (libsql) via Prisma adapter |
| Photos (local) | `server/data/photos/` |
| Photos (prod) | Vercel Blob |
| PWA | vite-plugin-pwa |

## Project Structure

```
client/           # React frontend (Vite)
  src/
    components/   # Reusable UI components
    hooks/        # Custom hooks (useAutoSave, etc.)
    lib/          # API utility, helpers
    pages/        # Route pages
server/           # Express backend
  src/
    routes/       # API route handlers
    app.ts        # Express app (exportable)
    index.ts      # Local dev server entry
    db.ts         # Prisma client factory (SQLite or Turso)
  prisma/
    schema.prisma # Database schema
api/index.ts      # Vercel serverless entry point
.planning/        # Project docs (roadmap, state, requirements)
```

## Conventions

- **GSD methodology** with atomic commits per task
- **Auto-save pattern**: `useAutoSave` hook with debounced saves (1.5-2s)
- **Pagination**: Server returns `{ data: [...], pagination: { total, limit, offset, hasMore } }`
- **Server-side filters**: `/contacts` accepts `ecosystem`, `status`, `flagged`, `search`, `sortBy`, `sortDir`
- **Backup**: Browser-direct Turso queries (bypasses Vercel 30s timeout)
- **Toast notifications**: Use `sonner` (not react-hot-toast)
- **Markdown rendering**: Use `ReactMarkdown` with `prep-note-markdown` CSS class

## Critical Technical Notes

### Local Development
- `server/.env` must have Turso credentials **commented out** — otherwise the app hangs trying to connect to cloud DB
- If Prisma errors: `cd server && npx prisma generate`

### Turso / Prisma Gotchas
- **Prisma 7 adapter-based architecture** — All database connections require explicit adapters: `PrismaLibSql` for Turso (production), `PrismaBetterSqlite3` for local SQLite (dev-only, dynamic import). No more `url` in schema datasource — connection config is in `prisma.config.ts` (CLI) and `db.ts` (runtime).
- **NEVER use `include: { _count: { select: { field: true } } }`** — generates a correlated subquery that hangs the Prisma-libsql adapter on Turso. Use `.length` client-side or raw SQL instead.
- **List endpoints use explicit `select`** — Good practice to exclude large text fields (`notes`, `personalDetails`, etc.) from list views for performance.
- **Long-lived PrismaClient + retry-on-connection-error** — `db.ts` keeps ONE client, reused across requests. A `Proxy` routes every query through `runWithRetry`, which rebuilds the client and retries once only on a connection/transport error (stale libsql HTTP connection on a warm Vercel instance, ECONNRESET, "fetch failed", etc.) — never on a normal query rejection (P2xxx). Replaced the old per-request `resetPrisma()` middleware (rebuilt the client+adapter on every request), which was a heavy fix for the same stale-connection bug.
- **Turso CLI requires WSL on Windows** — use web dashboard instead
- **@libsql/client versions**: Server uses 0.17.2 (via `@prisma/adapter-libsql`), Client uses 0.17.0 (browser-direct via `/web` export for backup)
- **Schema migrations for Turso**: Prisma `db push` only works against local SQLite. For production, run DDL directly via libsql client (temporarily uncomment Turso creds in `.env`)

### Vercel Deployment
- **30s timeout** (Hobby plan) — design endpoints to be fast
- **Env vars**: Use `printf 'value' | vercel env add VAR_NAME production` (not heredoc — avoids trailing newlines)
- **build:vercel script**: Must install both client and server deps before build
- **Read-only filesystem** — save-local backup endpoint only works in local dev
- **Photos**: Only Vercel Blob URLs work in production; local `/photos/` paths are dev-only

### UI Patterns
- **Overdue timezone**: Server accepts `today` query param from client for timezone-correct overdue calculation
- **Client timeout**: `TIMEOUT_MS = 28000` in `client/src/lib/api.ts`
- **Stale closure pattern**: When Radix UI fires callbacks needing current React state, use `useRef` + no-dep `useEffect` to sync refs, then read from refs in callbacks
- **Radix onOpenChange**: Fires for 'x' and Escape, but NOT for programmatic `setDialogOpen(false)`
- **Edit mode drafts**: localStorage keys `draft_edit_conversation_${id}` and `draft_conversation_${contactId}`
- **Contact detail loading**: Staggered — Phase 1 (core contact) then Phase 2 (secondary data) to avoid thundering herd
- **fetchWithRetry**: Used for secondary lookups (tags, companies, names) — retries once after 2s on failure

### Data Model Notes
- **Multi-select actions**: `ActionContact`/`ActionCompany` junction tables. Legacy single `contactId`/`companyId` preserved for backward compat
- **Multiple companies per contact**: `additionalCompanyIds` JSON array with `{id, isCurrent}` objects
- **Multiple emails**: `additionalEmails` JSON field with dynamic inputs
- **Conversation participants vs discussed**: `ConversationParticipant` junction for attendees, `ConversationContact` for people mentioned
- **Multi-org meetings**: `ConversationOrg` junction = orgs the meeting was WITH (anchor `companyId` stays the primary org); `ConversationCompany` = orgs *discussed*
- **Favorite contacts**: reserved `Favorite` tag via `ContactTag` (no dedicated column); `GET /contacts/favorites`, `PATCH /contacts/:id/favorite`
- **Company Activity Log**: `CompanyActivity` model for company-level event tracking
- **Status history**: `ContactStatusHistory` and `CompanyStatusHistory` for analytics transitions

## Current Status

**The app is being adapted for the owner's new role as Chief Medical Officer of NCQA** — from job-search CRM to executive stakeholder-management system. The active **plan of record is `.planning/NCQA-ADAPTATION-PLAN.md`** (taxonomy retheme, multi-person/multi-subject meetings via autocompleted title "series" — **no Groups**, per D4 — stakeholder stance/leverage tracking, AI ingest of MS Copilot meeting recaps, Outlook-calendar daily briefing). **Phases 1 & 2 are complete and deployed (2026-06-12); Phase 3+ is next**, gated on decisions D5–D9 (don't push on those until the owner raises them).

Historical: ROADMAP Phases 1–7 + 7.5 (security/backup hardening) + Production Hardening Plan Phases 0–2 are complete. Old ROADMAP Phase 8 (Google Drive document search) is superseded by the adaptation plan's Task 6.2 (semantic search over meeting notes). Standing follow-up: set `SENTRY_DSN`/`VITE_SENTRY_DSN` in Vercel to activate error tracking.

**The owner has granted standing permission to commit/push directly to `main`** (auto-deploys to Vercel for testing). Run `npm run prepush` first; never push schema-touching code before the Turso DDL is applied (procedure at the top of the adaptation plan).

## Session Management

The session protocol is **single-sourced in root `AGENTS.md`** (agent-agnostic — Claude Code and
Gemini/Antigravity both follow it). Read `AGENTS.md` at session start/end for the exact read order,
end-of-session steps, and non-negotiables. `.planning/README.md` maps every planning doc.
