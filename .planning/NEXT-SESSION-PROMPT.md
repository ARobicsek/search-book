I'm building **SearchBook**, a lightweight local CRM for managing my executive job search networking.

**Before doing anything, read these files:**
- `.planning/STATE.md` — Session history and decisions
- `.planning/ROADMAP.md` — All phases and acceptance criteria

**GSD methodology.** Atomic commits per task.

---

## What Was Completed Last Session

### Fixing Contact Draft Bugs
1. **TS2345 Type Error Fix** — Replaced forced dummy draft mock typing `unknown as Contact` with a complete fallback representation of the `Contact` object supplying defaults up front matching the TS schema.
2. **TS2339 Type Error Fix** — Vercel raised typescript errors for the frontend-only property `isDraft`. Wrapped iterators accessing it inside `Contact & { isDraft?: boolean, draftId?: string }` assertions.
3. **Runtime 404 Error Fix** — Intercepted standard contact navigation rules to check `if(original.isDraft)`. The handler skips calling the database via the negative mocked ID array marker, effectively dodging a 404 response. Form pushes user directly to `/contacts/new?draftId=` instead.
4. **Duplicate Draft Creation Bug Fix** — Squashed a React race condition that inadvertently triggered the `useEffect` auto-save logic as the `contact-form.tsx` began navigation and removed `localStorage` entries for `draft_new_contact_...` IDs. The form fields are now cleared pre-navigation (`setForm(emptyForm)`) eliminating unintended "Resume Draft" duplicates surfacing on the list index after creating a contact.

---

## Running Locally
```bash
npm start
```
- **Client**: http://localhost:5173
- **Server**: http://localhost:3001

**Important:** `server/.env` must have Turso credentials **commented out** for local development:
```
# TURSO_DATABASE_URL="libsql://..."
# TURSO_AUTH_TOKEN="..."
```
If these are uncommented, the app will try to connect to Turso cloud DB and hang indefinitely.

If Prisma errors: `cd server && npx prisma generate`

## Work for Next Session

In our next session, we need to fix the following issues with the Multiple Contact Drafts feature on the Contact List page:

1. **TypeScript Build Error in Vercel:**
`contact-list.tsx(452,31): error TS2345: Argument of type ... is not assignable to parameter of type 'Contact & { isDraft: boolean; draftId: string; }'`
The `unknown as Contact` type assertion added to the dummy draft row is still causing TS to complain about missing properties (`roleDescription`, `company`, `additionalCompanyIds`, `additionalEmails`, etc). The dummy draft object needs to satisfy the exact shape expected, or the column definitions need to be more permissive.

2. **Runtime 404 Error:**
```
api/contacts/-1771954038738:1  Failed to load resource: the server responded with a status of 404 ()
GET https://searchbook-three.vercel.app/api/contacts/-1771954050672 404 (Not Found)
```
The dummy draft objects are generating negative IDs, and the row or a cell component is attempting to fetch data from the API `/api/contacts/:id` using these negative dummy IDs, causing a 404 error. The components rendering the row need to bypass any API calls for `isDraft` rows.

---

## Production Deployment

**Auto-deploys on push to main** — Vercel is connected to GitHub.

**Before pushing, always run:**
```bash
npm run prepush
```
This catches TypeScript errors and missing files before they break the Vercel build.

Then push:
```bash
git push
```

To set environment variables (use printf to avoid newlines):
```bash
printf 'value' | vercel env add VAR_NAME production
```

---

## Technical Notes

1. **Turso CLI on Windows requires WSL** — Use web dashboard instead
2. **@libsql/client versions** — Server: 0.5.6 (downgraded for Prisma adapter compatibility). Client: 0.17.0 (browser-direct via `/web` export)
3. **Vercel env vars** — Use `printf` not heredoc to avoid trailing newlines that break URLs/tokens
4. **build:vercel script** — Must install client and server dependencies before build
5. **Photos in production** — Only Vercel Blob URLs work; local `/photos/` paths are dev-only
6. **Overdue timezone** — Server accepts `today` query param from client to fix timezone issues
7. **Auto-save pattern** — `useAutoSave` hook in `client/src/hooks/use-auto-save.ts` handles debounced saves
8. **Contacts pagination** — Server returns `{ data: [...], pagination: { total, limit, offset, hasMore } }`
9. **Server-side filters** — `/contacts` accepts `ecosystem`, `status`, `flagged`, `search` query params
10. **Server-side sorting** — `/contacts` accepts `sortBy=lastOutreachDate` + `sortDir=asc|desc` for cross-page sort
11. **Duplicate detection** — Normalizes names (strips middle initials, suffixes) before Levenshtein; inverted-index candidate generation (name tokens + email); OR logic (similar name OR same email); slim DB query; merge dialog lazy-loads full details on demand
12. **Client timeout** — `TIMEOUT_MS = 30000` in `client/src/lib/api.ts`; Vercel `maxDuration: 30` in `vercel.json`
13. **Vercel 30s timeout** — Hobby plan max. Browser-direct Turso access bypasses this for backup/restore.
14. **Browser-direct Turso** — `@libsql/client/web` in client connects to Turso over HTTPS. The `/web` export auto-converts `libsql://` URLs to `https://`. Used for backup export and restore to avoid Vercel timeout.
15. **Backup security** — Turso auth token is exposed to browser via `/api/backup/credentials`. Acceptable for personal single-user app. Can create read-only token later for hardening.
16. **Express body limit** — Increased to 50MB (`express.json({ limit: '50mb' })` in `app.ts`) for backup import payloads.
17. **Backup date formats** — Turso returns dates as Unix ms timestamps, ISO strings, or raw SQLite strings. `toDate()` in `backup.ts` handles all three.
18. **Production backup workflow** — JSON downloads to browser; user manually copies to `SearchBook/backups/` (amber UI reminder). Save-local endpoint only works in local dev (Vercel has read-only filesystem).
19. **Turso schema migrations** — Prisma `db push` only works against local SQLite. For Turso production, run DDL directly: temporarily uncomment Turso creds in `server/.env`, use `node -e "require('dotenv').config(); const { createClient } = require('@libsql/client'); ..."` to execute CREATE TABLE statements, then re-comment creds.
20. **Multi-select actions** — Actions support 0-N contacts and companies via `ActionContact`/`ActionCompany` junction tables. Legacy single `contactId`/`companyId` fields preserved for backward compatibility. All views (form, detail, list) fall back to legacy fields when junction tables are empty.
21. **Company Activity Log** — `CompanyActivity` model for company-level action log. Types: APPLIED, EMAIL, CALL, MEETING, RESEARCH, FOLLOW_UP, OTHER. CRUD at `/api/company-activities`. Turso table created via direct libsql client.
22. **Edit mode drafts** — localStorage key: `draft_edit_conversation_${conversationId}`. New conversation drafts use `draft_conversation_${contactId}`. `editDrafts: Set<number>` state in `ConversationsTab` tracks which conversations have a pending edit draft; syncs from localStorage inside `useEffect([conversations])`. `editIdRef` and `formRef` refs prevent stale closures in `onOpenChange`.
23. **Radix UI onOpenChange** — fires for 'x' button and Escape key, but NOT for programmatic `setDialogOpen(false)`. This is critical for the edit draft save-on-close logic.
24. **Stale closure pattern** — When Radix UI (or any library) fires callbacks that need current React state, use `useRef` + a no-dep `useEffect` to sync refs after every render, then read from refs inside the callback. Never rely solely on closure-captured state in event handlers that Radix controls.
