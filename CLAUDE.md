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
- **NEVER use `include: { _count: { select: { field: true } } }`** — generates a correlated subquery that hangs the Prisma-libsql adapter on Turso. Use `.length` client-side or raw SQL instead.
- **List endpoints MUST use explicit `select`** — The `@libsql/client@0.5.6` HTTP transport hangs when returning ~170+ rows with all columns (response size limit). All list endpoints must exclude large text fields (`notes`, `description`, `personalDetails`, etc.). Safe threshold: ~200 rows × 7-8 small fields. Upgrading to Prisma 7 + `@libsql/client@0.17.0` would likely fix this.
- **Per-request fresh PrismaClient** — `db.ts` exports `resetPrisma()` called by middleware in `app.ts`. Creates a fresh PrismaClient+adapter per request in production to prevent stale HTTP keep-alive connections in serverless.
- **Turso CLI requires WSL on Windows** — use web dashboard instead
- **@libsql/client versions**: Server uses 0.5.6 (Prisma adapter compat), Client uses 0.17.0 (browser-direct via `/web` export)
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
- **Company Activity Log**: `CompanyActivity` model for company-level event tracking
- **Status history**: `ContactStatusHistory` and `CompanyStatusHistory` for analytics transitions

## Current Status

Phases 1-7 complete. Phase 8 (Document Search) planned. See `.planning/ROADMAP.md` for details.

## Session Management

When starting a new session, read `.planning/NEXT-SESSION-PROMPT.md` for:
- What was done last session
- What to work on next
- Any open bugs

For deeper context, `.planning/STATE.md` has active decisions and recent session history.
Full historical session log is in `.planning/SESSION-HISTORY.md` (rarely needed).
