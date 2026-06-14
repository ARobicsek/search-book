# Backup Coverage Audit (Item 4)

**Date:** 2026-06-14
**Scope:** Confirm the automated (daily cron) and manual (Settings "Create Backup") flows
capture **all** data — every DB table *and* every binary file.
**Verdict:** ✅ Complete after this session's fixes. All 27 Prisma models are in both backup
paths; the manual binary ZIP now bundles photos **+ meeting attachments + pasted screenshots**
(previously photos only). Daily cron remains DB-only **by design**.

## The two backup paths
| Path | Trigger | Contents | Binaries? |
|------|---------|----------|-----------|
| **Daily cron → Vercel Blob** | `GET /api/backup/cron` (Vercel cron or "Back up now") | Full DB JSON, all tables, kept ×30 | **No** (by design — keeps cloud backups small) |
| **Manual download** | Settings → "Create Backup" | `searchbook-backup-*.json` (full DB) **+** `searchbook-files.zip` (binaries) | **Yes** |
| Server JSON export | `GET /api/backup/export` | Full DB JSON (Prisma `findMany`) | No |
| Browser-direct Turso | `exportViaTurso` / `importViaTurso` | Full DB via `SELECT *` (prod restore path) | No (DB only) |
| Local-disk dev snapshot | `POST /api/backup` (+ `/restore`) | `dev.db` + `data/photos` + `data/files` | Yes (local files) |

DB exports use `SELECT *` (browser) / `findMany` (server) ⇒ **column-complete automatically**,
incl. JSON columns (`additionalCompanyIds`, `additionalEmails`, …).

## DB table coverage — all 27 models in BOTH paths
Cron/export = `buildExport()` in [server/src/routes/backup.ts](../server/src/routes/backup.ts);
Browser ZIP = `TABLES_PARENT_FIRST` in [client/src/lib/backup.ts](../client/src/lib/backup.ts).

| # | Model | Cron/JSON export | Browser-direct ZIP | Restore (import) |
|---|-------|:---:|:---:|:---:|
| 1 | Contact | ✅ | ✅ | ✅ |
| 2 | Company | ✅ | ✅ | ✅ |
| 3 | CompanyActivity | ✅ | ✅ | ✅ |
| 4 | ContactStatusHistory | ✅ | ✅ | ✅ |
| 5 | CompanyStatusHistory | ✅ | ✅ | ✅ |
| 6 | EmploymentHistory | ✅ | ✅ | ✅ |
| 7 | Tag | ✅ | ✅ | ✅ |
| 8 | ContactTag | ✅ | ✅ | ✅ |
| 9 | CompanyTag | ✅ | ✅ | ✅ |
| 10 | Conversation | ✅ | ✅ | ✅ |
| 11 | ConversationPrepNote | ✅ | ✅ | ✅ |
| 12 | ConversationAttachment | ✅ | ✅ | ✅ |
| 13 | ConversationParticipant | ✅ | ✅ | ✅ |
| 14 | ConversationTag | ✅ | ✅ | ✅ |
| 15 | ConversationContact | ✅ | ✅ | ✅ |
| 16 | ConversationOrg | ✅ | ✅ | ✅ |
| 17 | ConversationCompany | ✅ | ✅ | ✅ |
| 18 | Action | ✅ | ✅ | ✅ |
| 19 | ActionContact | ✅ | ✅ | ✅ |
| 20 | ActionCompany | ✅ | ✅ | ✅ |
| 21 | Idea | ✅ | ✅ | ✅ |
| 22 | IdeaContact | ✅ | ✅ | ✅ |
| 23 | IdeaCompany | ✅ | ✅ | ✅ |
| 24 | Link | ✅ | ✅ | ✅ |
| 25 | PrepNote | ✅ | ✅ | ✅ |
| 26 | CompanyPrepNote | ✅ | ✅ | ✅ |
| 27 | Relationship | ✅ | ✅ | ✅ |

(Count cross-checked against `grep '^model ' schema.prisma` = 27.)

## Binary file coverage
DB rows store **references** (URLs/paths), not bytes. The binaries live in Vercel Blob
(prod) or `data/photos` · `data/files` (dev). Three classes exist:

| Binary class | Stored as | In manual `searchbook-files.zip`? |
|--------------|-----------|:---:|
| Contact / Company photos | `Contact.photoUrl`, `Contact.photoFile`, `Company.photoFile` | ✅ (already) |
| Meeting attachments (decks, PDFs, …) | `ConversationAttachment.url` (Blob `files/` · `/files/…`) | ✅ **fixed this session** |
| Pasted screenshots in notes/prep | markdown `![alt](url)` inside any text field | ✅ **fixed this session** |

`collectBinaryRefs` ([client/src/lib/photo-backup.ts](../client/src/lib/photo-backup.ts)) now
gathers all three (deduped by URL); `buildBinariesZip` fetches the bytes and packs them with a
`manifest.json`. Unfetchable refs (404 / CORS) are **skipped and reported**, never fatal.

## Fixes applied this session (commit: backup audit)
1. **Stale "24-table" labels** → the `/cron` comment now says "all tables"; the `/cron` JSON
   response returns `tables: <derived count>` (computed from the export, so it can never go
   stale) instead of the hardcoded `24`.
2. **Manual ZIP binary gap** → `photo-backup.ts` generalized from photos-only to **all binaries**
   (photos + `ConversationAttachment` files + markdown-embedded screenshots). Download renamed
   `searchbook-photos.zip` → `searchbook-files.zip`; Settings copy/toast updated.
3. **Local-disk dev backup gap** → `POST /api/backup` and `/restore` now copy/restore **both**
   `data/photos` and `data/files` (was photos only).

## Verified
- `collectBinaryRefs` unit test (synthetic data, all 3 classes + dedup): **9 refs** from a
  10-ref dataset (1 correctly deduped). ✓
- `buildBinariesZip` against **real local data**: 11 photo binaries (Vercel Blob URLs) fetched,
  0 skipped, 2.6 MB ZIP built — confirms Blob CORS works from the browser. ✓
- `tsc -b` (client) + `tsc --noEmit` (server) green.

## Notes / residual
- `_meta.version` is **5** in both export paths; the restore (`importViaTurso` / `/import`) keys
  off model names, not the version number, so older versioned files import fine as long as the
  table shapes match. Floor: any export with the current column set.
- Daily cron **excludes** binaries on purpose. A *full* restore therefore needs the manual
  `searchbook-files.zip` for binaries — see the restore test (Item 5).
- Binary restore is **manual** (re-upload from the ZIP, or the local-disk `/restore` for dev).
  There is no automated "re-push binaries to Blob" flow — acceptable for a single user; the
  manifest maps every file back to its record.
