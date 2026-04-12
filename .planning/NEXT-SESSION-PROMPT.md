## What Was Completed Last Session

### LinkedIn Profile Import Feature (2026-04-12)

Added an AI-assisted "Import from LinkedIn" feature to the New Contact form. Users copy all visible text from a LinkedIn profile page, paste it into a dialog, and an OpenAI o4-mini call on the server extracts structured contact fields.

**New files:**
- `server/src/routes/linkedin.ts` — `POST /api/linkedin/parse` endpoint. Sends pasted text to OpenAI o4-mini, returns structured JSON (name, title, company, location, about, skills)
- `client/src/components/linkedin-import-dialog.tsx` — Two-step dialog: paste input → preview extracted fields → populate form

**Modified files:**
- `server/src/app.ts` — Registered `/api/linkedin` route; exempted it from 12s server timeout (AI calls take 15-25s)
- `client/src/pages/contacts/contact-form.tsx` — Added "Import from LinkedIn" button (create mode only), wired dialog to populate form fields, auto-opens relevant collapsible sections
- `client/src/pages/contacts/contact-list.tsx` — Reordered header buttons (New Contact first); added max-width + truncation on Title column to prevent long headlines from breaking layout
- `server/.env.example` — Documented `OPENAI_API_KEY`
- `server/package.json` — Added `openai` dependency

**Field mapping:** name → name, headline → title, company → companyEntries, location → location, about → notes, URL → linkedinUrl

**Environment setup:**
- `OPENAI_API_KEY` added to local `server/.env` and Vercel Environment Variables
- Cost: ~$0.005–$0.01 per import (o4-mini)

**Production verified:** Tested with three real LinkedIn profiles (Rudish, Engelhard, Singal) in both dev and prod.

---

## Work for Next Session

### 1. Optional: Test removing `resetPrisma()` per-request pattern

The per-request fresh PrismaClient was added for `@libsql/client@0.5.6` stale connections. With 0.17.2, it may no longer be needed. To test:
1. Comment out the `resetPrisma()` middleware call in `app.ts` (line ~73)
2. Deploy and monitor for any connection failures
3. If stable, simplify `db.ts` to remove the Proxy pattern

### 2. Phase 8: Document Search
See `.planning/ROADMAP.md` for details.

### 3. LinkedIn Import Enhancements (optional)
- Could switch from o4-mini to gpt-4o-mini for faster (2-3s vs 15-20s) extraction if quality is acceptable
- Could add support for importing into existing contacts (edit mode), not just new contacts
- Could extract employment history entries from the Experience section

---

## Open Bugs

None currently. All production endpoints stable.

## Current State of Resilience Layers
- Per-request fresh PrismaClient in production (in `app.ts` middleware via `resetPrisma()`)
- Server timeout: 12s for all routes EXCEPT `/api/linkedin` (exempt — AI calls need 15-25s)
- Client timeout: 28s (in `client/src/lib/api.ts`)
- Client auto-retry: GET requests retry once on 504, 500, or timeout
- List endpoints use explicit `select` for performance (not a workaround)

## Key Environment Variables
- `OPENAI_API_KEY` — Required for LinkedIn import. Set in `server/.env` (local) and Vercel Environment Variables (prod). Must be synced manually.
- `VAPID_PUBLIC_KEY` (Server) / `VITE_VAPID_PUBLIC_KEY` (Client) — Must be manually synchronized in Vercel Environment Variables.
