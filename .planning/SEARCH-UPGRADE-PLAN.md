# SearchBook — Search Upgrade Plan

**Created:** 2026-06-12
**Status:** PLANNED — not started. Companion to `NCQA-ADAPTATION-PLAN.md` (this work was requested directly by the owner; it complements, and partially front-runs, the adaptation plan's Task 6.2 semantic search).
**Goal:** one search box that can find a term ("AI", "Boston", "CMS") across **everything** SearchBook stores, with user control over **where** to look and **how to sort** what comes back.

---

## What exists today (baseline)

`GET /api/search?q=` (server/src/routes/search.ts) + `/search` page (client/src/pages/search.tsx, tabbed: All / Contacts / Companies / Actions / Ideas / Meetings).

Current field coverage — and the gaps:

| Entity | Searched today | NOT searched today (gaps) |
|--------|---------------|---------------------------|
| Contact | name, title, email, notes, roleDescription, location, mutualConnections, companyName, company.name, employment history names, additional/connected company IDs | **personalDetails**, howConnected, openQuestions, whereFound, phone, linkedinUrl, additionalEmails, **tags** |
| Company | name, industry, hqLocation, notes | website, size, **tags**, **CompanyActivity titles/notes**, **CompanyPrepNote content** |
| Conversation | title, summary, notes, attendeesDescription | **nextSteps**, **participant takeaway notes**, **tags**, **prep notes (new ConversationPrepNote)**, **attachment names**, participant/contact/company names |
| Action | title, description, linked contact/company names | — (good) |
| Idea | title, description, tags | — (good) |
| PrepNote (contact) | nothing | content |
| Relationship | nothing | notes |

Other limitations: single-term substring only (no multi-word AND), fixed sort (updatedAt desc), no indication of *which field* matched, fixed `take` per entity with no paging.

---

## Design decisions (proposed defaults — confirm or adjust at build time)

1. **Keep LIKE/`contains`, skip FTS5 for now.** The dataset is a few hundred contacts / a few hundred meetings; SQLite `LIKE` over that is milliseconds. FTS5 on Turso is a real option later (and pairs with adaptation-plan Task 6.2's semantic search) but adds shadow-table DDL + sync triggers — not worth it at this scale. Revisit if search latency exceeds ~1s or row counts hit ~10k.
2. **Multi-term = AND.** `boston cms` matches records where **every** term appears in *some* searched field (terms may match different fields of the same record). Quoted phrases (`"digital measures"`) match exactly. This mirrors how every inbox search works.
3. **Scopes are user-selectable groups, not raw fields.** Checkbox groups (all on by default):
   - **People — profile** (name, title, role, emails, phone, location, linkedin, howConnected, whereFound, company names, employment history, tags)
   - **People — notes** (notes, personalDetails, openQuestions, mutualConnections, contact prep notes)
   - **Organizations** (name, industry, website, HQ, notes, tags, activity log, org prep notes)
   - **Meetings** (title, summary, **notes**, nextSteps, attendees description, participant takeaways, meeting prep notes, attachment names, tags, participant/anchor names)
   - **Actions** (title, description, linked names)
   - **Ideas** (title, description, tags)

   Splitting People into profile vs notes is the key user ask ("details about people" vs "content of conversations"): it lets "Boston" find *people in Boston* without drowning in every meeting note that mentions Boston.
4. **Sorting** — global control, applied per result group:
   - **Relevance** (default): name/title-field match > tag match > other-field match; ties broken by recency (updatedAt / meeting date). Computed in JS after fetch (result sets are small) — no SQL scoring needed.
   - **Newest / Oldest** (updatedAt for people/orgs, date for meetings, dueDate for actions)
   - **A → Z** (name/title)
   - **Most recently contacted** (people only: latest conversation date — already available via contact list endpoint conventions)
5. **Show the evidence.** Each hit displays *why* it matched: field name + a ~120-char snippet around the first match, with the term highlighted (`<mark>`). Without this, expanding coverage to big text fields makes results feel random. Snippets computed server-side (it has the full text; list payloads stay small).
6. **Pagination per group**: keep `take` defaults (10–20) but return `total` per entity and add a "show all N" link per group that deep-links to the entity's own list page with its server-side filter (`/contacts?search=…`, `/meetings?q=…`) — reuses existing filtered list endpoints instead of building a second paginated search API.

## Out of scope (deliberately)

- Semantic / embedding search — that's adaptation-plan Task 6.2, post-AI-ingest.
- Searching inside attachment file *contents* (PDF text etc.) — names only.
- Fuzzy/typo matching. (SQLite LIKE is case-insensitive for ASCII; that's enough.)

---

## Task S.1 — Server: coverage + scopes + evidence

`GET /api/search` gains params: `scopes` (csv of `people-profile,people-notes,orgs,meetings,actions,ideas`; absent = all), `sort` (`relevance|newest|oldest|alpha|recent-contact`), and multi-term parsing (split on whitespace, respect quoted phrases).

- Build per-entity `AND [ OR-across-fields ]` Prisma where-clauses from the term list, with each scope contributing its field set (the gap fields from the table above all get added).
- Tag matches via `tags: { some: { tag: { name: { contains: term } } } }` junctions (Contact/Company/Conversation).
- Contact/company/meeting prep notes + CompanyActivity matched via `some: { content/title/notes: ... }` relations on the parent — hits surface as their **parent** entity with the snippet pointing at the note (no separate "prep notes" result type to keep the UI simple).
- After fetch: compute `matches: [{ field, snippet }]` per record (first 2–3 matching fields), compute relevance rank, apply `sort`, return per-group `total`.
- **Perf guardrails** (CLAUDE.md): no `_count` includes; explicit `select` everywhere; cap each entity query with `take`; the whole handler must stay well under the 12s request timeout — measure against prod-size data with `[TIMING]` logs.

**Commit:** `feat(search): full-field coverage, scope filters, multi-term AND, match snippets`

## Task S.2 — Client: scope picker, sort, highlighted snippets

`/search` page:

- Scope checkboxes (chips) above the results, persisted in the URL (`?q=…&scopes=…&sort=…` — shareable, consistent with /meetings URL-as-state) and in localStorage as the default for next time.
- Sort dropdown (the 4 options above).
- Result cards render the `matches` snippets with `<mark>` highlighting (new tiny `HighlightedSnippet` component; escape HTML, highlight all terms).
- Tab counts reflect scoped results; groups whose scope is off are hidden entirely.
- "Show all N →" per group deep-links to the entity list page with the equivalent filter.
- Command-palette quick search keeps using the same endpoint with default scopes (no UI change there).

**Commit:** `feat(search): scope picker, sort control, highlighted match evidence`

## Task S.3 — Mobile + perf pass

- 390px layout for the chips/sort row (wrap, not overflow).
- Verify against production data volume (226+ conversations): time the full all-scopes query in prod logs; if any single entity query is slow, trim its field list or add `take` earlier.
- Debounce stays 300ms; minimum term length stays 2.

**Commit:** `fix(search): mobile layout + prod perf validation`

## Acceptance (user's own examples)

- "AI" with all scopes → contacts with AI in role/notes, orgs with AI in name/notes, meetings whose notes/tags mention AI — each hit showing where it matched.
- "Boston" with only **People — profile** → people located in/working in Boston; no meeting-note noise.
- "CMS" with only **Meetings** → every meeting whose notes/takeaways/prep notes mention CMS, sortable newest-first.
- Multi-term "Moy CMS" → records mentioning both, in any fields.

## Estimate

S.1 is the bulk (~a session); S.2 + S.3 together a second session. No schema changes, no Turso DDL, no backup-path changes — server+client code only, safe to ship incrementally.
