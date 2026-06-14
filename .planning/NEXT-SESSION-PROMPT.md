# Next Session Prompt

This file is the handoff document for the next AI session (Claude Code **or** Gemini/Antigravity — the protocol is agent-agnostic). It summarizes what was just accomplished, what to work on next, and any open items.

### What Was Just Completed (2026-06-14, build session) — owner's 5-item follow-up list SHIPPED

Plan of record: `.planning/CALENDAR-FAVORITES-BACKUP-PLAN.md`. All 5 items done; one atomic commit
per chunk, each `npm run prepush` + `tsc -b` green and smoke-tested desktop + 390px, pushed to
`main`. **No schema changes anywhere.** Open decisions were confirmed with the owner up front.

- **Item 3 — Favorite organizations** (`80911ff`). Schema-free mirror of favorite contacts:
  reserved `Favorite` `CompanyTag` + `GET /companies/favorites` / `PATCH /companies/:id/favorite`
  (copied the contacts impl; `/favorites` declared before `/:id`). Star toggle + amber quick-add
  chips in **Quick Log "Organizations"** ([quick-log-dialog.tsx](../client/src/components/quick-log-dialog.tsx))
  and **Ideas "Related Companies"** ([idea-list.tsx](../client/src/pages/ideas/idea-list.tsx)).
  Owner scope: **those two surfaces only.** Verified API round-trip + in-browser (desktop/390px).
- **Items 1 & 2 — Calendar polish** (`85ab6ec`, both in `MeetingsCalendar`,
  [meetings.tsx](../client/src/pages/meetings.tsx)). **(1)** Owner chose **expand the day cell
  inline** over a popover: `dayMaxEvents={false}` so a busy day renders *every* meeting inline and
  the row grows (`height="auto"`); no filtering — calendar still shows all meetings by date.
  **(2)** Hover tooltip via `eventDidMount` `el.title` = first participant + summary (data already
  in the `/meetings` range fetch — no API change); de-dupes the 1:1 case to summary-only.
  Calendar-only. Verified with a 10-meeting test day (created + deleted): all inline on desktop
  grid + mobile list, tooltips correct, event click still opens the editor.
- **Item 4 — Backup-coverage audit** (`c5c18b5`). All **27** Prisma models confirmed in both
  backup paths. Fixed two real gaps + the stale labels: **(a)** the manual ZIP bundled photos
  only — `photo-backup.ts` now bundles photos **+ `ConversationAttachment` files + markdown-embedded
  screenshots** (`collectBinaryRefs`/`buildBinariesZip`; download renamed `searchbook-photos.zip`
  → **`searchbook-files.zip`**); **(b)** local-disk dev backup/restore now also copies `data/files`;
  **(c)** `/cron` returns a `tables` count derived from the export (no more hardcoded `24`).
  Deliverable: **`.planning/BACKUP-COVERAGE-AUDIT.md`** (model × path matrix + binary classes).
  Verified: collector unit test (3 classes + URL dedup) + real data (11 binaries fetched, **Blob
  CORS from browser now confirmed working**).
- **Item 5 — Restore test** (`7d67dc5` harness; executed this session). **✅ DONE — real prod→scratch
  run PASSED.** `server/scripts/restore-test.mjs` bootstraps a scratch schema (DDL replay), restores
  a backup JSON FK-ordered (mirrors the production `importViaTurso` path), and verifies per-table
  counts + relationships + binary reachability. Prod-safe: requires `--confirm`, refuses if
  `--target == --forbid-url`, only writes the target. **Real run** (owner supplied scratch Turso creds
  + the `2026-06-14T18-36-42` prod backup): **27/27 tables match exactly (2,604 rows)**, relationship
  spot-checks resolve, **15/15 sampled Blob URLs reachable** (of 69), exit 0; prod untouched
  (`--forbid-url` = real prod URL). Owner deleted the scratch DB afterward. Runbook (now marked
  EXECUTED): **`.planning/RESTORE-TEST-RUNBOOK.md`**.
- **Backup completeness + usability proof** (`3df6184`, this session). Closed the two questions the
  restore test left implicit. **(a)** Read-only `count(*)` diff of the backup vs **live prod**
  (`server/scripts/prod-count-diff.mjs`): **all 27 tables identical, delta 0, 2,604 rows** — the
  backup is an exact copy of prod. **(b)** Restored the backup into local SQLite and **booted the
  app on it** (`server/scripts/app-smoke.mjs` + rendered Dashboard/Contacts/Analytics/contact-detail):
  every heavy endpoint 200, all charts populated. Both scripts are read-only/local-only and kept as
  reusable tools. (The expired prod token in `server/.env` was *not* updated; the owner declined to
  rotate the read-only token used for the diff — acceptable, read-only + password-gated app.)

### What's Next

The owner's 5-item follow-up list is now **fully closed** (restore test executed + PASSED; backup
proven == prod). The owner has queued a new batch for next session.

1. **NEXT SESSION plan of record = `.planning/ACTIONS-IDEAS-POLISH-PLAN.md`** (owner-requested
   2026-06-14). Five tasks: (1) markdown formatting in Actions & Ideas, (2) progressive disclosure on
   the Action form (Type/Priority/Related-To behind carets), (3) **rework "Who owes it"** into a
   people-list (default *me*, removable, +0…N contacts, favorites quick-add, collapsed) — **schema-
   touching, needs Turso DDL**, (4) company near-dup LinkedIn variants, (5) long-lived PrismaClient.
   **Confirm decisions A1/B1/C1/D1 at the top of that plan first** (D1 = owner supplies example
   company pairs). Suggested order + file pointers are in the plan.
2. **After that batch ships, the standing plan of record returns to the NCQA adaptation plan**
   (`.planning/NCQA-ADAPTATION-PLAN.md`, Phase 3+) — gated on decisions D5–D9. **Don't push on
   D5–D9 until the owner raises them.**

### Carry-over items (pre-dating, lower priority)
1. **[USER ACTION]** Set `SENTRY_DSN` / `VITE_SENTRY_DSN` in Vercel (hardening Task 17).
2. **Prod search perf** — owner signed off on live Phase B (B3); treat as closed unless it regresses.
3. NCQA adaptation plan: Phase 3 (blocked D8/D9) / Phase 4 (D5/D6). Don't push on D5–D9 until raised.
4. ~~Restore into scratch Turso DB~~ → **DONE** (Item 5 executed + PASSED 2026-06-14; runbook marked EXECUTED).
5. Replace `resetPrisma()` per-request pattern with a long-lived PrismaClient. → **scheduled** as Task 5 in `ACTIONS-IDEAS-POLISH-PLAN.md`.
6. Company near-duplicate scan (LinkedIn-variant suffixes). → **scheduled** as Task 4 in `ACTIONS-IDEAS-POLISH-PLAN.md`.
7. #12 LinkedIn-on-mobile deferred (screenshot→gpt-4o-mini vision is the ready option if revisited).
8. Stray empty `server/dev.db` / `server/test.db` (gitignored) safe to delete.

### Open Bugs / Known Caveats
- No confirmed bugs. The `Favorite` tag (contacts **and** now companies) is a normal tag and
  appears in tag dropdowns by design; it is covered by backups (a `ContactTag` / `CompanyTag` row).
- **Meetings calendar:** now shows **all** of a day's meetings inline (`dayMaxEvents={false}`),
  so a very heavy day makes that week's row tall — acceptable per owner; revisit only if it bothers.
  Still fetches ≤100 meetings per visible range and applies no list filters (navigates by date).
- **Backup binaries:** the daily **cron deliberately excludes binaries** (keeps cloud backups
  small). A full restore therefore needs the manual `searchbook-files.zip` for photos/attachments.
  Binary *restore* is manual (DB rows keep the same Blob URLs, so they resolve without re-upload;
  re-upload only needed if Blob itself is lost). See BACKUP-COVERAGE-AUDIT.md.
- **Quick Log autosave:** selecting an *existing* org/participant (numeric id) triggers an autosave
  POST that creates the meeting — expected (free-text new entries still persist only on Done).
- The `tsc -b` build (`noUnusedLocals`) remains the gate that catches unused imports the
  `typecheck` script misses — run it (not just `npm run prepush`) before every push.

### Working branch
`main`, clean and fully pushed. Prior session: `80911ff` (fav orgs), `85ab6ec` (calendar),
`c5c18b5` (backup audit), `7d67dc5` (restore harness). This session: `c47eff6` (record restore-test
PASSED) + `3df6184` (prove backup == prod via count diff + app-boot verification, w/ reusable
scripts). All live on Vercel.

---

### Suggested kickoff prompt for the next session

> Read `CLAUDE.md` / `AGENTS.md`, then this file, then **`.planning/ACTIONS-IDEAS-POLISH-PLAN.md`** —
> that batch plan is the **plan of record for this session** (the prior 5-item list and the restore
> test are fully done). Five tasks, suggested order in the plan: (1) markdown formatting in Actions &
> Ideas (swap in the existing `MarkdownTextarea`; Ideas also needs a `ReactMarkdown` display), (2)
> progressive disclosure on the Action form (mirror Quick Log's "Who was there" chevron — hide
> Type/Priority/Related-To), (3) **rework "Who owes it"** into a people list (default *me*, removable,
> +0…N contacts, favorite-contact quick-add, collapsed) — **this one is schema-touching: run the Turso
> DDL before pushing code** (procedure atop the NCQA plan), (4) extend company near-dup detection for
> LinkedIn-style name variants, (5) retire per-request `resetPrisma()` for a long-lived PrismaClient
> (prod-verify before declaring done; consider its own session).
>
> **Before building, confirm decisions A1/B1/C1/D1** at the top of the batch plan — most importantly
> ask the owner for **2–3 real company pairs** that should be flagged as duplicates but aren't (D1),
> and confirm the "Who owes it" model (C1: recommended = additive `owedByMe` bool + `owerContactIds`
> JSON, with `direction` kept as a derived mirror so the dashboard/analytics are unaffected).
>
> One atomic commit per task; `npm run prepush` **and** `tsc -b` + desktop/390px smoke test before each
> push. After the batch ships, the standing plan of record returns to the **NCQA adaptation plan**
> (Phase 3+, gated on D5–D9 — don't push on those until raised). Standing owner action still open:
> set `SENTRY_DSN`/`VITE_SENTRY_DSN` in Vercel (carry-over #1).
