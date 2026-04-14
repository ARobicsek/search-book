## What Was Completed Last Session

### UI & Autosave Enhancements (2026-04-14)

1. **Prep Note Local Drafts**: Implemented local draft autosaving for the "Add Prep Note" form on the `ContactDetailPage`.
   - Drafts auto-save to `localStorage` (1s debounce).
   - Added native `<SaveStatusIndicator>` (`Saving...`/`Saved`) to the form to match app-wide visual heuristics.
   - Form now auto-expands on mount if an unfinished draft exists for that specific contact.
   - Drafts are seamlessly preserved across tab closures and navigations, and cleared upon successful note creation or explicit cancellation.
2. **Contact Form Layout**: Moved the global 'Notes' field out of the "Research" collapsible section into an always-visible top-level card for better accessibility.

### LinkedIn Profile Import Feature (2026-04-12)

Added an AI-assisted "Import from LinkedIn" feature to the New Contact form. Users copy all visible text from a LinkedIn profile page, paste it into a dialog, and an OpenAI o4-mini call on the server extracts structured contact fields.

**New files:**
- `server/src/routes/linkedin.ts` — `POST /api/linkedin/parse` endpoint
- `client/src/components/linkedin-import-dialog.tsx` — Two-step dialog

**Modified files:**
- `server/src/app.ts` — Registered `/api/linkedin` route; exempted it from 12s server timeout
- `client/src/pages/contacts/contact-form.tsx` — Import button and dialog integration
- `client/src/pages/contacts/contact-list.tsx` — Reordered header buttons

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
