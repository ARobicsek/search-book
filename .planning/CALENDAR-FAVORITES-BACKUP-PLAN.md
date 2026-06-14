# SearchBook — Calendar Polish, Favorite Orgs, Backup Integrity & Restore Test

**Created:** 2026-06-14 (planning seed — owner's 5-item follow-up list after the UX-Search-Meetings plan shipped)
**Status:** Drafted with recon findings; **not yet approved/implemented**. Refine + confirm scope with the owner at the start of the next session.
**Relationship to other plans:** Standalone follow-up worklist. The NCQA adaptation plan (`.planning/NCQA-ADAPTATION-PLAN.md`) remains the longer-term plan of record; the owner wants these 5 items first.

## How to use this document
- Work **top to bottom**; one **atomic commit per chunk** (GSD). After each: `npm run prepush` **and** a client build
  (`tsc -b` is stricter than the `typecheck` script), then a desktop + 390px smoke test. Update the chunk's **STATUS** line.
- **Schema impact:** Items 1, 2, 5 = none. Item 3 = **none** (favorites = reserved `Favorite` tag via the existing
  `CompanyTag` junction, mirroring contacts — no Turso DDL). Item 4 = likely small code fixes only (no schema). **Flag immediately if any task seems to need a schema change** (Turso DDL procedure at the top of the adaptation plan).

---

## Item 1 — Calendar: handle many meetings in one day (#cal-overflow)
**Ask:** "How will the calendar handle ~10 meetings in a day? They won't fit — maybe expand a given date."

**What we have:** [client/src/pages/meetings.tsx](client/src/pages/meetings.tsx) `MeetingsCalendar` sets
`dayMaxEvents={isMobile ? 2 : 4}`. FullCalendar already renders a **"+N more"** link when a day exceeds that cap
(seen live: Feb 4 showed "+1 more"). FullCalendar's default `moreLinkClick` is **`'popover'`** — clicking "+N more"
opens a day popover listing *all* that day's events.

**Proposed approach (cheapest first):**
- Set `moreLinkClick="popover"` explicitly and **verify event clicks inside the popover** still call
  `quickLog.openEdit(id)` (the popover re-renders events; confirm the `eventClick` handler fires there).
- Optionally raise `dayMaxEvents` (e.g. desktop 4→6) and/or add a `dayMaxEventRows` tweak so cells stay tidy.
- Optional nicety: make clicking the **day-number** (`dateClick`/`navLinks`) jump to that day — either FullCalendar's
  `navLinks` (day → `timeGridDay`/`listDay`) or navigate to the list view filtered to that date
  (`/meetings?from=YYYY-MM-DD&to=YYYY-MM-DD`, list view honors `from`/`to`).
- **Open decision:** built-in popover only (recommended) vs. also wiring day-number → filtered list/day view.

**Files:** [client/src/pages/meetings.tsx](client/src/pages/meetings.tsx) (`MeetingsCalendar`). Client-only.
**STATUS:** Not started.

## Item 2 — Calendar: hover a meeting shows first participant + summary (#cal-tooltip)
**Ask:** "When I hover over a meeting title, also show the first connected participant and the summary."

**What we have:** The calendar event title is the participant-first `conversationDisplayName`. The `/api/meetings`
range fetch already returns `summary` and `participants` (via `meetingListInclude`) — **no API change needed**.

**Proposed approach:**
- Put `summary` + first participant name into each event's `extendedProps`, then in `eventDidMount` set a native
  tooltip: `info.el.title = [firstParticipant, summary].filter(Boolean).join(' — ')` (or multi-line). Cheap, a11y-safe,
  zero deps. (Richer hovercard via a tooltip lib is a possible follow-up, but native `title` matches the ask.)
- Note: when the event title *is* already the first participant (participant-only 1:1), de-dupe so the tooltip isn't
  "Name — Name"; lead with summary in that case.
- **Decide:** does the owner also want this hover on the **list/series cards** and the dashboard, or calendar-only?
  (Ask reads as calendar-specific — the screenshot was the calendar.)

**Files:** [client/src/pages/meetings.tsx](client/src/pages/meetings.tsx) (`MeetingsCalendar` events + `eventDidMount`). Client-only.
**STATUS:** Not started.

## Item 3 — Favorite organizations, like favorite contacts (#fav-orgs)
**Ask:** "In places where I enter organization names (meeting log, ideas), let me 'favorite' orgs like I can with contacts."

**What we have (contacts precedent — schema-free):** [server/src/routes/contacts.ts:152](server/src/routes/contacts.ts#L152)
— favorites = a reserved **`Favorite`** tag (`FAVORITE_TAG_NAME`) via the existing `ContactTag` junction;
`GET /api/contacts/favorites` (id/name list) + `PATCH /api/contacts/:id/favorite` (body `{favorite:boolean}`); UI = star
toggle + quick-add chips in the Quick Log participants block. **Companies already have a `CompanyTag` junction**
([server/prisma/schema.prisma:155](server/prisma/schema.prisma#L155)), so the identical pattern is **schema-free**.

**Proposed approach (mirror contacts exactly):**
- Server [server/src/routes/companies.ts](server/src/routes/companies.ts): add `GET /companies/favorites` +
  `PATCH /companies/:id/favorite` using the reserved `Favorite` tag via `CompanyTag` (copy the contacts impl).
- Client: surface favorite-org **star toggle** + **quick-add chips** in the org-entry comboboxes:
  - Quick Log **Organizations** field ([client/src/components/quick-log-dialog.tsx](client/src/components/quick-log-dialog.tsx)).
  - Ideas org field ([client/src/pages/ideas.tsx] — confirm exact file/field) and anywhere else orgs are picked
    (grep the org `Combobox`/`MultiCombobox` usages; e.g. contact-edit additional-companies, meetings filter — confirm
    scope with owner; the ask names meeting log + ideas).
- Reuse the contact star/chip components where possible (factor a shared `FavoriteStar` / quick-add-chips bit if it
  reduces dup).
- **Note:** like the contact `Favorite` tag, the org `Favorite` tag will appear in company tag dropdowns by design.
  It is already covered by backups (it's a `CompanyTag` row — see Item 4: `CompanyTag` is in the table list).

**Files:** server companies route; quick-log-dialog; ideas page; shared favorite UI. **No schema change.**
**STATUS:** Not started.

## Item 4 — Audit: does automated + manual backup capture ALL data? (#backup-audit)
**Ask:** "After several feature-adding sessions, confirm both the automated and manual save capture everything."

**Recon already done (2026-06-14):**
- **DB table coverage = COMPLETE.** All **27** Prisma models (`grep '^model ' schema.prisma`) appear in **both**
  backup paths:
  - Browser-direct Turso ZIP: `TABLES_PARENT_FIRST` in [client/src/lib/backup.ts](client/src/lib/backup.ts) (27 tables, `SELECT *`).
  - Server JSON export/cron: `buildExport` `findMany` list in [server/src/routes/backup.ts:24](server/src/routes/backup.ts#L24) (27 models).
  - `SELECT *` / `findMany` ⇒ **column-complete** automatically, incl. JSON fields (`additionalCompanyIds`,
    `additionalEmails`, etc.). Recently-added models (`ConversationOrg`, `ConversationPrepNote`,
    `ConversationAttachment`, `ConversationParticipant`, `ConversationTag`, `CompanyActivity`, status-history tables)
    are all present.
- **So the table list is NOT the risk.** The remaining risks to verify/fix next session:
  1. **Stale "24" labels** in the server route: comment says "24-table" and the `/cron` response returns
     `tables: 24` ([server/src/routes/backup.ts:134,169](server/src/routes/backup.ts#L169)) though it's now 27 —
     cosmetic, but fix so the count is trustworthy.
  2. **Binary files (the real gap to check).** DB backups store URLs/paths, not blobs. Verify the **manual** backup
     bundles binaries for **both** photos **and** `ConversationAttachment` files (+ any prep-note image uploads),
     not just contact/meeting **photos**. The local-disk dev backup copies `data/photos` but appears **not** to copy
     `data/files` ([server/src/routes/backup.ts:251-254](server/src/routes/backup.ts#L251)); the restore likewise only
     restores `photos` (L311-318). Confirm whether the prod **manual ZIP** flow (Settings "download backup", which
     bundles photos per the STATE decision) includes the `files/` (attachment) binaries — and add them if missing.
     The **daily cron deliberately excludes binaries** (by design, to keep Turso/Blob backups small) — that's fine,
     but it means a full restore needs the manual ZIP for binaries.
  3. **`_meta.version`** is 5 ([backup.ts:65](client/src/lib/backup.ts#L65)); confirm restore tolerates older versions
     or document the floor.
- **Deliverable:** a short written coverage matrix (model → in cron? in browser ZIP? binaries bundled?) + fix the
  "24" labels + close any binary-bundling gap. Pairs with Item 5 (the restore test *proves* the audit).

**Files:** [server/src/routes/backup.ts](server/src/routes/backup.ts), [client/src/lib/backup.ts](client/src/lib/backup.ts),
upload/attachment routes ([server/src/routes/upload.ts](server/src/routes/upload.ts),
[server/src/routes/conversation-attachments.ts](server/src/routes/conversation-attachments.ts)), Settings backup UI. **No schema change expected.**
**STATUS:** Not started.

## Item 5 — End-to-end test: download prod backup, fully restore in dev (#restore-test)
**Ask:** "Plan a test: download all prod save material, then verify we can fully restore it in dev."

**Proposed procedure (do AFTER Item 4 so we know what 'all material' is):**
1. **From prod:** use the Settings backup to pull (a) the full DB JSON (all 27 tables) and (b) the binary bundle
   (photos + attachment files). Capture row counts per table from prod for comparison.
2. **In dev / a scratch DB:** restore into a **throwaway** target — either a scratch Turso DB or local SQLite —
   **never** overwrite live data. (Carry-over #4 already parks "restore into scratch Turso DB".) The browser-direct
   `importViaTurso` takes a pre-restore safety snapshot first ([backup.ts:112](client/src/lib/backup.ts#L112)) and wipes
   + reinserts in one transaction, FK-ordered.
3. **Verify completeness:** per-table row counts match prod; spot-check relationships (a meeting with participants +
   orgs + tags + prep notes + attachments; a contact with `additionalCompanyIds`; status history); confirm photo and
   **attachment** binaries resolve (open an image, open a file attachment) — this is the real test of the Item-4
   binary gap.
4. **Document** the exact steps + any data that did NOT round-trip → feeds back into Item 4 fixes.
- **Decide with owner:** scratch **Turso** DB (closest to prod, needs a temp DB + creds) vs. **local SQLite** (faster,
  but Turso-specific quirks won't surface). Recommend a scratch Turso DB for fidelity.

**Files:** Settings backup/restore UI, [client/src/lib/backup.ts](client/src/lib/backup.ts). Mostly procedure + verification; minimal/no code.
**STATUS:** Not started.

---

## Suggested ordering
3 (favorite orgs — self-contained feature) → 1 & 2 (calendar polish, same file) → **4 then 5** (audit before the restore
test, since 5 validates 4). Items are largely independent; reorder freely with the owner.
