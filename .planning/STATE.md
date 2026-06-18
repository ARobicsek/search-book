# SearchBook — Active State & Decisions

The **current, in-force** decisions and project state. For the full historical decision ledger
(~90 rows, including superseded iterations) and the per-session log, see
[SESSION-HISTORY.md](SESSION-HISTORY.md). Session protocol → `AGENTS.md`; tech stack / gotchas →
`CLAUDE.md`; doc map → [README.md](README.md).

> **Maintenance:** keep this table to decisions that describe how the app works (or is intended to
> work) **now**. When you make a durable decision, add it here **and** to the full ledger in
> `SESSION-HISTORY.md`. When a decision is superseded, drop it from here (it stays in the ledger).

## Current Decisions (in force)

| Decision | Choice | Date |
|----------|--------|------|
| App mission | Adapt SearchBook (vs. replace) into NCQA CMO stakeholder-management system; plan of record = `NCQA-ADAPTATION-PLAN.md` | 2026-06-12 |
| Git workflow | Owner granted standing permission to commit/push directly to `main` (run `npm run prepush` first; Turso DDL before any schema-touching code) | 2026-06-12 |
| Legacy data | No archiving; legacy ecosystem values stay valid (additive taxonomy), reclassify opportunistically | 2026-06-12 |
| Taxonomy (D1–D3) | Ecosystems: NCQA list + keep RECRUITER; ROLODEX/TARGET/INFLUENCER/INTRO_SOURCE→NETWORK. Contact statuses: RESEARCHING/CONNECTED/AWAITING_RESPONSE/FOLLOW_UP_NEEDED + blank. Company: RESEARCHING/ENGAGED/PARTNER/CONNECTED + blank. Blank = `'NONE'` sentinel (no table rebuild) | 2026-06-12 |
| Meetings model | Conversation = meeting with title + 4 optional "who" facets (contact anchor, org anchor, named participants w/ per-person notes, free-text attendees description; ≥1 of title/facets required); multi-subject via markdown `### Topic` headings + tags, NOT per-topic child records | 2026-06-12 |
| Recurring meetings (D4) | Dedicated **opt-in `Series` entity** (`Series` table + `Conversation.seriesId`); mark a meeting as a series, later meetings join from a picker; `series` chip shows only for meetings in a series. **No Groups feature** (deferred to backlog) | 2026-06-15 |
| Meeting editor | The **Quick Log dialog is the sole canonical create+edit meeting editor** app-wide (`useQuickLog().open/openEdit`); contact-page inline editor retired. Autosave = POST-once-then-PUT; free-text names + follow-up actions persist on "Done"; prep/attachments persist live | 2026-06-14 |
| Meeting prep notes & attachments | Per-conversation tables (`ConversationPrepNote`, `ConversationAttachment`); advance prep = future-dated meeting + prep notes; attachments ≤4MB via server pass-through (Vercel Blob `files/` prod, `server/data/files/` dev); binaries excluded from daily DB backup | 2026-06-12 |
| Meeting capture (planned) | Paste MS Copilot recaps → Claude API extraction → mandatory review screen → normal CRUD (AI never writes directly) | 2026-06-12 |
| Calendars | Meetings + Actions each have a **List\|Calendar toggle** (`?view=calendar`); standalone Calendar page retired (`/calendar` → `/actions?view=calendar`). Outlook briefing (planned) = published ICS feed, Graph OAuth only if ICS staleness hurts | 2026-06-14 |
| Outlook meeting import (D7) | Pre-load meetings from the **published Outlook ICS feed** as future-dated records (subject/date/`startTime`/recurrence). **Published ICS strips attendees** → added manually; attendee auto-fill (Graph/Power-Automate) deferred to Option B behind a `CalendarProvider` interface. Additive `Conversation.calendarUid` + `startTime`; **skip-only idempotent** import keyed `calendarUid`+`date`; `GET /api/calendar/events` + `POST /api/calendar/import`; env `OUTLOOK_CALENDAR_ICS_URL` (server-side); expansion via `ical-expander`. "Import from Outlook" dialog on `/meetings` | 2026-06-17 |
| Multi-org meetings | `ConversationOrg` junction = orgs the meeting was WITH (anchor `companyId` stays primary); distinct from `ConversationCompany` (orgs *discussed*). Org filter also matches meetings whose anchor/participant currently works at the org | 2026-06-16 |
| Favorites | Contacts + orgs starred via a reserved `Favorite` tag (`ContactTag`/`CompanyTag`, no schema change); `GET /…/favorites`, `PATCH /…/:id/favorite`. `GET /tags` excludes the reserved tag so it never appears in pickers | 2026-06-15 |
| "Useful people" (useful-for) | Additive `Contact.usefulFor` free text = what this person could help with; **non-empty ⇒ a useful person** (single source of truth, not a tag). Contacts-list **Useful** filter (`?useful=true`); own dedicated `useful` scope in global search; merge unions `usefulFor` from both sides | 2026-06-16 |
| Actions "who owns it" | Additive `Action.owedByMe` (bool) + `Action.owerContactIds` (JSON); `direction` enum derived server-side (`owedByMe && no owers ? OWED_BY_ME : WAITING_ON_THEM`). UI wording: "owns/owned" (display only; schema unchanged) | 2026-06-14 |
| Idea tags + archive | Idea tags **share the app-wide `Tag` vocabulary** via `IdeaTag` junction (legacy `Idea.tags` string kept/backfilled). Soft-archive via `Idea.archived`; dedicated `PATCH /api/ideas/:id/archive` (avoids the PUT junction-rebuild) | 2026-06-15 |
| Connect → company status | Making a contact CONNECTED auto-promotes their **current** employer(s) to company status CONNECTED — only from NONE/RESEARCHING (never downgrades ENGAGED/PARTNER), past employers skipped; writes `CompanyStatusHistory`. Helper `server/src/company-status.ts` | 2026-06-15 |
| Search | Plan `archive/SEARCH-UPGRADE-PLAN.md`: full-field coverage, scope groups, multi-term AND, 4 sorts, match snippets; plain `LIKE`, **no FTS5** at this scale. `GET /api/search` lazy-loads related per-card. Scope badges default all-on each visit (selection not persisted; sort + match-case are) | 2026-06-16 |
| Markdown speed input | Shared `MarkdownTextarea` (toolbar + Ctrl shortcuts, list auto-continue, paste-screenshot→upload→`![](url)`) instead of a rich-text editor; rendered via `ReactMarkdown`/`prep-note-markdown`. Highlight inside rendered markdown via the `highlight-markdown.ts` rehype plugin | 2026-06-15 |
| Undo last delete | Server-side **snapshot-and-replay** (`DeletedSnapshot` + `server/src/lib/undo.ts`): each delete captures cascade rows + SetNull'd FKs + JSON-array scrubs atomically; `POST /api/undo` replays the most recent (stack pruned to 25). Header Undo button + Cmd/Ctrl+Z, `GET /api/undo`-backed | 2026-06-16 |
| Backup proven complete | Backup is an empirically-verified full copy of prod: prod↔backup `count(*)` diff = 0 across all 27 tables; restored into scratch Turso (27/27 tables, 2,604 rows) + booted the app on it. Reusable scripts in `server/scripts/` (`restore-test.mjs`, `prod-count-diff.mjs`, `app-smoke.mjs`) | 2026-06-14 |
| Production hardening / infra | In force (detail in `CLAUDE.md` "Critical Technical Notes" + the full ledger): shared-password `/api` gate; daily Vercel-Blob backup cron (keep 30); `/api/` `NetworkOnly` SW + `prompt` PWA updates; `express-rate-limit` + 2mb body cap; exact-origin CORS; opt-in Sentry (DSNs unset); **long-lived PrismaClient** with retry-once-on-connection-error (replaced per-request `resetPrisma`) | 2026-06-04 / 2026-06-14 |

## Blockers

None currently.

## User Feedback Summary

40+ feedback items addressed across sessions. Key patterns:
- Combobox with search + inline create for all entity reference fields
- Progressive disclosure for less-used fields (collapsible sections)
- Modal should NOT close on outside click (data-loss prevention)
- Multiple emails and companies per contact
- Prep notes visible in the meeting-logging dialog
- Markdown rendering for notes fields across all entities

The full per-session feedback tables live in [SESSION-HISTORY.md](SESSION-HISTORY.md).
