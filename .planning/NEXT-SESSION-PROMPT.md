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

### What's Next

The owner's 5-item follow-up list is now **fully closed** (Item 5's real restore test executed +
PASSED this session). No outstanding owner-gated work remains from that plan.

1. **Standing plan of record returns to the NCQA adaptation plan**
   (`.planning/NCQA-ADAPTATION-PLAN.md`) — its tasks are gated on decisions D1–D9 and several are
   schema-touching. **Don't push on D5–D9 until the owner raises them.** Confirm scope before building.

### Carry-over items (pre-dating, lower priority)
1. **[USER ACTION]** Set `SENTRY_DSN` / `VITE_SENTRY_DSN` in Vercel (hardening Task 17).
2. **Prod search perf** — owner signed off on live Phase B (B3); treat as closed unless it regresses.
3. NCQA adaptation plan: Phase 3 (blocked D8/D9) / Phase 4 (D5/D6). Don't push on D5–D9 until raised.
4. ~~Restore into scratch Turso DB~~ → **DONE** (Item 5 executed + PASSED 2026-06-14; runbook marked EXECUTED).
5. Replace `resetPrisma()` per-request pattern with a long-lived PrismaClient.
6. Company near-duplicate scan (LinkedIn-variant suffixes).
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
`c5c18b5` (backup audit), `7d67dc5` (restore harness). This session: executed the real restore
test (PASSED) — docs-only commit recording the result. All live on Vercel.

---

### Suggested kickoff prompt for the next session

> Read `CLAUDE.md` / `AGENTS.md`, then `.planning/NEXT-SESSION-PROMPT.md`. The owner's 5-item
> follow-up list (calendar, favorite orgs, backup audit, restore test) is **fully closed** — the
> real restore test executed + PASSED (27/27 tables, prod untouched). The standing plan of record
> is now the **NCQA adaptation plan** (`.planning/NCQA-ADAPTATION-PLAN.md`) — confirm scope/decisions
> D1–D9 with the owner before building; don't push on D5–D9 until they raise them. One atomic commit
> per chunk; `npm run prepush` **and** `tsc -b` + desktop/390px smoke test before each push.
