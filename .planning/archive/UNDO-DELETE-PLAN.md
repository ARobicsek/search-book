# Undo Last Delete — Implementation Plan

**Status: SHIPPED & owner-verified on prod (2026-06-16).** Turso DDL applied, pushed to
`main` (commit `dd405b7`), and the refresh-on-undo polish (content remount) added after.
Owner confirmed restore works for contacts, meetings, actions, organizations, ideas.

Goal: a **persistent** "undo last delete" command that reverses the most recent delete
(contact, organization, meeting, action, prep note, link, relationship, idea, etc.) and
stays available until the next delete (survives navigation and reload).

## Approach (decided)

Server-side **snapshot-and-replay**. Hard-delete semantics are kept. Just before a delete
runs, capture everything it will destroy or mutate into a JSON payload stored in a new
`DeletedSnapshot` table. `POST /api/undo` replays the most recent snapshot; the snapshots
form a small stack (undo pops the top, revealing the prior one). Rejected soft-delete
(would touch every read query) and client-deferred-delete (fragile on PWA).

A single delete fans out three ways, all reversed on undo:
1. **Cascade deletes** (`onDelete: Cascade`) — child rows physically removed (recursive:
   contact → its anchored conversations → their participants/notes/...).
2. **SetNull scrubs** (`onDelete: SetNull`) — referencing rows survive but lose the FK;
   capture (model, ids, field, oldValue) before delete, re-set on undo (guarded: only if
   still null).
3. **JSON-array scrubs** — `companies.ts` strips the deleted company id out of every
   contact's `additionalCompanyIds` / `connectedCompanyIds`; capture + re-add on undo.

The Prisma runtime data model carries relations but **no `onDelete` info**, so the
cascade/SetNull graph is encoded explicitly in `server/src/lib/undo.ts` (small, reviewable).

## Owner decisions (2026-06-16)

- **Blobs:** stop deleting Vercel Blob binaries on delete (keep them so undo restores) —
  `conversation-attachments.ts` no longer calls blob `del()`. (Photos were never deleted.)
- **Turso DDL:** owner runs `CREATE TABLE DeletedSnapshot` in the Turso web SQL console
  (committed rw token is stale).
- **Backup:** clear `DeletedSnapshot` in the backup wipe/restore transaction.
- **Persistence:** a persistent header command + `Cmd/Ctrl+Z` (guarded against editable
  focus), not just a toast. Backed by `GET /api/undo` so it survives reload.
- **Scope of v1:** full coverage incl. recursive contact/company (deferred to my judgment).

## Tasks

- [x] `DeletedSnapshot` model in `schema.prisma`; `prisma generate`.
- [x] `server/src/lib/undo.ts` — CASCADE/SET_NULL/PK/RANK maps, `captureDelete`,
      `deleteWithSnapshot`, `restoreLatest`, `peekLatest`.
- [x] `server/src/routes/undo.ts` — `GET /api/undo` (peek), `POST /api/undo` (restore);
      mounted in `app.ts`.
- [x] Wired `captureDelete`/`deleteWithSnapshot` into every top-level delete route:
      contacts, companies, conversations, actions, prepnotes, company-prepnotes,
      conversation-prepnotes, conversation-attachments, company-activities,
      employmenthistory, links, relationships, ideas, series.
- [x] `conversation-attachments.ts`: dropped blob deletion. `backup.ts`: wipes DeletedSnapshot.
- [x] `server/scripts/migrate-deleted-snapshot.js` — dual-mode `CREATE TABLE` (local + Turso);
      applied to local `./prisma/dev.db`.
- [x] Client: `api.delete` dispatches `searchbook:deleted`; `UndoProvider` (fetches peek,
      binds Cmd/Ctrl+Z, calls POST); header Undo button; success/“View” toast.
- [x] `npm run prepush` (client+server typecheck) + full `vite build` + server `tsc` — all green.
- [x] Smoke-tested on :3001 (17/17 assertions): recursive cascade restore (contact→meeting→prep),
      `action.contactId` SetNull restore, company JSON-array scrub + re-add, empty-stack 404.
- [x] **OWNER:** verified on prod — contacts, meetings, actions, organizations, ideas all restore.
- [x] Refresh-on-undo: `layout.tsx` remounts the routed content (`key` on `<main>`, bumped by the
      `searchbook:undone` event) so the restored item appears without a manual page refresh.

## Deploy checklist

1. Apply the `CREATE TABLE DeletedSnapshot` DDL to Turso (web console) **before** pushing.
2. Apply the same DDL to local `./prisma/dev.db` via the migration script (dev server can stay up).
3. `prisma generate`, build, push.

## Known caveats

- Direct attachment delete previously destroyed the blob; now it doesn't (orphaned blobs
  on a *non-undone* delete are harmless, matching the existing "binaries aren't backed up"
  precedent).
- ID reuse: undo inserts with explicit ids; a collision (id reused by a new row between
  delete and undo) aborts the undo with a 409 rather than corrupting data.
- Tag CRUD (`/tags`) deletes are out of scope for v1 (minor; tag-removal is a different flow).
