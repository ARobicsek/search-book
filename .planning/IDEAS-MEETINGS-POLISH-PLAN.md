# SearchBook — Ideas & Meetings Polish (2026-06-15 session 2)

**Created:** 2026-06-15
**Origin:** owner request — 4 Ideas asks + 5 Meetings asks.
**Status:** IN PROGRESS.

## Owner decisions (asked at session start)
- **Idea tags (#3):** **Share app-wide tags** — Idea tags move to the real `Tag` table
  (junction `IdeaTag`), so the vocabulary is shared with Meetings/Contacts. → **schema-touching.**
- **Title click (#9):** Clicking a meeting title opens the **Edit dialog**; keep series
  reachable via a **small "series" chip** for grouped/recurring titles.

## House rules (same as every session)
- One atomic commit per task (GSD). `npm run prepush` **and** `tsc -b` (client build catches
  unused imports) green before each push. Re-test **mobile 390px** for UI changes.
- Owner has standing permission to push schema-free work to `main` (auto-deploys to Vercel).
- **Task 8 (Idea tags) is schema-touching** → follow the Turso DDL procedure: local `db push`
  against `prisma/dev.db`, then `CREATE TABLE "IdeaTag"` against Turso (web console — committed
  rw token is stale), then push code. Do schema-free tasks first.

## Tasks (ordering = lowest-risk first, schema task last)

### Task 1 — Ideas: trim card vertical whitespace (#2, schema-free)
Cards have a separate header (pb-2), content (flex-1), and a px-6 pb-4 date footer → lots of
vertical air. Tighten paddings; fold the date into the content footer row.
**File:** client/src/pages/ideas/idea-list.tsx
**STATUS:** pending

### Task 2 — Ideas: compact List view toggle (#1, schema-free)
Add a List/Card toggle (mirror Meetings' `?view=` pattern). List = dense rows: title, tag
chips, related-people/org chips, date, edit/archive/delete. Click row to expand description.
**File:** client/src/pages/ideas/idea-list.tsx
**STATUS:** pending

### Task 3 — Ideas: highlight search terms in the description body (#4, schema-free)
Today `hl()` highlights title/tags/related names but the markdown description is un-highlighted.
Add a rehype-style pass that wraps matched terms in `<mark>` inside the rendered markdown
(text nodes only — never inside code/links/urls).
**File:** client/src/pages/ideas/idea-list.tsx (+ small helper)
**STATUS:** pending

### Task 4 — Meetings: Next Steps as multi-line markdown editor (#8, schema-free)
`nextSteps` is a single-line `<Input>`. Swap for `<MarkdownTextarea>` (same toolbar as Notes).
Render `nextSteps` as ReactMarkdown wherever displayed (meetings list "Next:" line + series
context panel). `nextSteps` is already `String?` — no schema change.
**Files:** quick-log-dialog.tsx, meetings.tsx
**STATUS:** pending

### Task 5 — Meetings: prominent "Add action" button (#7, schema-free)
Ghost button → solid (default/primary variant, white text on the app's dark primary).
**File:** quick-log-dialog.tsx
**STATUS:** pending

### Task 6 — Meetings: autosave logged actions + per-action owner picker (#5 + #6, schema-free)
Today new actions stage in `newActions` and only persist on "Done" via the conversation's
`createActions`; they have no owner field. Rework so each action row, once the meeting record
exists, is a live Action (`POST /actions` with `conversationId`, then debounced `PUT`), and add
a compact "Who owns it" control (`owedByMe` + `owerContactIds`) per row — reusing the Actions
form pattern. Before the meeting exists, stage locally and flush on first meeting autosave.
Drop the `createActions` finalize path for these (avoid double-create); keep it only as a
fallback flush for any still-unsaved staged rows.
**Files:** quick-log-dialog.tsx (+ verify `/actions` accepts `conversationId` via `...rest` — it does)
**STATUS:** pending

### Task 7 — Meetings: click title → Edit dialog + keep series chip (#9, schema-free)
List title currently links to the series view. Make the title open `quickLog.openEdit(conv.id)`;
add a small "series" chip (only when `conv.title`) that navigates to `?title=`.
**File:** meetings.tsx
**STATUS:** pending

### Task 8 — Ideas: tags → app-wide Tag table + autocomplete (#3, SCHEMA-TOUCHING)
Add `IdeaTag` junction (`@@id([ideaId, tagId])`), `Tag.ideas IdeaTag[]`, `Idea.tags2`? No —
keep `Idea.tags` String column (vestigial, additive-only migration = just `CREATE TABLE
"IdeaTag"`). Server: include tags on idea GET/list, accept `tagIds` on create/update (resolve
free-text → Tag via findOrCreate). Client: Idea dialog tag input → MultiCombobox(allowFreeText)
fed by `GET /tags`; card+list render tag chips. Backfill existing comma `Idea.tags` → IdeaTag.
**Files:** schema.prisma, server/src/routes/ideas.ts, client idea-list.tsx, lib/types.ts,
migration script + Turso DDL.
**STATUS:** pending — gated on owner applying `CREATE TABLE "IdeaTag"` to Turso.

## Verification
- prepush + tsc -b + vite build green per task.
- Browser smoke (desktop + 390px) for the UI-heavy ones (list view, highlight, autosave actions).
