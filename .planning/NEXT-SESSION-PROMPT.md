## What Was Completed Last Session

### LinkedIn Import Enhancements & Deduplication (2026-04-17)

1. **Importing into Existing Contacts**: Upgraded the "Import from LinkedIn" workflow so users can now import data into contacts that ALREADY exist in the CRM, not just new creations.
2. **Generic Manual Merge UI**: Extracted the side-by-side radio selector component (`<FieldMergeUI>`) from the `duplicates.tsx` page so it can be used generically across the entire application. 
3. **LinkedIn Conflict Resolution**: The `<FieldMergeUI>` was elegantly wedged directly into the `LinkedInImportDialog` as a new Step 3: if a user clicks "Use This Data" and the parsed data conflicts with any data currently on their screen, the UI now safely halts and forces the user to manually cherry-pick their preferred form values.
   - Defaults to "Current Data" to prevent any possibility of accidental overrides. 
   - Text "Notes" fields receive a "Keep Both" option. 
4. **Company Deduplication Security**: Fixed a sweeping foundational API bug where raw string company names appended from scripts natively bypassed database ID validations during the `autoSave` and `handleSubmit` flows (which unintentionally spawned identical copycat company records). Replaced with robust `.toLowerCase().trim()` lookups that convert dynamically parsed strings to core DB IDs seamlessly.

Relevant Files: `client/src/components/field-merge-ui.tsx`, `client/src/pages/duplicates.tsx`, `client/src/components/linkedin-import-dialog.tsx`, `client/src/pages/contacts/contact-form.tsx`

---

## Work for Next Session

### 1. Company Deduplication Engine
Currently, there is a dedicated engine (`client/src/pages/duplicates.tsx`) that intelligently detects and gracefully merges Duplicate Contacts natively in the UI. 
The user has requested that this precise tooling be expanded to target **Companies** next. The current duplicate tool only scans for duplicate contact members. In the next session, we need to either expand `/pages/duplicates` or create a new dedicated engine that efficiently detects and merges fragmented company records (e.g. 6 database entries representing "NCQA" into a single source truth).

### 2. Phase 8: Document Search
See `.planning/ROADMAP.md` for details.

### 3. Optional: Test removing `resetPrisma()` per-request pattern
The per-request fresh PrismaClient was added for `@libsql/client@0.5.6` stale connections. With 0.17.2, it may no longer be needed. To test:
1. Comment out the `resetPrisma()` middleware call in `app.ts` (line ~73)
2. Deploy and monitor for any connection failures
3. If stable, simplify `db.ts` to remove the Proxy pattern

---

## Open Bugs

None currently known. Deduplication scripts and strict Vercel deployment bugs have been resolved and typechecked cleanly. 

## Current State of Resilience Layers
- Per-request fresh PrismaClient in production (in `app.ts` middleware via `resetPrisma()`)
- Server timeout: 12s for all routes EXCEPT `/api/linkedin` (exempt — AI calls need 15-25s)
- Client timeout: 28s (in `client/src/lib/api.ts`)
- Client auto-retry: GET requests retry once on 504, 500, or timeout
- List endpoints use explicit `select` for performance (not a workaround)

## Key Environment Variables
- `OPENAI_API_KEY` — Required for LinkedIn import. Set in `server/.env` (local) and Vercel Environment Variables (prod). Must be synced manually.
- `VAPID_PUBLIC_KEY` (Server) / `VITE_VAPID_PUBLIC_KEY` (Client) — Must be manually synchronized in Vercel Environment Variables.
