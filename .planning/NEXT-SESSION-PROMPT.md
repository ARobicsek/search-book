# Next Session Prompt

Rolling handoff for the next AI session (Claude Code **or** Gemini/Antigravity — protocol is
agent-agnostic, see `AGENTS.md`). Keep this file **lean**: a short "just completed", "what's next",
carry-overs, open bugs, and a kickoff prompt. Per-session detail goes in `SESSION-HISTORY.md`, not
here.

### What Was Just Completed — Netlify Phase 3 soak: global-search timeout self-heal (bug #9) (2026-07-23)

Owner soaking the Netlify shadow app hit an **intermittent global-search timeout**: a fresh "karen"
search timed out (twice), then worked on a manual retry; "Providence" was slow-but-worked; the same
search on Vercel worked (slowly). **Root cause = Netlify free's hard 10 s function cap.** Cold/idle-thawed,
the search's multi-query fan-out fails its first wave (dead Turso connection), `db.ts` `runWithRetry`
rebuilds + retries the whole wave (double the round-trips), and occasionally exceeds 10 s → Netlify kills
the function → **502** — NOT the app's own retryable 504, which never fires (the 12 s app-timeout loses
to the 10 s cap). The client only auto-retried 500/504/'timed out', so a 502 didn't self-heal. Vercel's
30 s cap masks it (its 12 s app-504 fires → client retries → "slow but works").

Two parallel-run-safe fixes (**Vercel/`main` untouched**), `05d1368`, deploy branch ff'd `baf26fc..05d1368`:
- **client** (`api.ts`): GET auto-retry now covers transient 5xx (500/502/503/504) → the cold 502
  self-heals on the automatic retry against a now-warm instance. Covers search + command palette.
- **server** (`app.ts`): fire the app's own 504 at **9 s** when `process.env.NETLIFY` is set (beats the
  10 s 502, clean message); 12 s stays on Vercel. Warm requests (~1-3 s) unaffected.

`prepush` + full `npm run build` green. Verified deployed (new bundle `index-h7Ztfbze.js` carries the
`502,503,504` retry marker; `/api/health` 200). ⚠ **NOT yet owner-confirmed live** — to confirm: idle the
app ~2 min, then search "karen" fresh → should render on its own, no manual retry. **First cold hit is
still slow (~10-13 s: killed attempt + warm retry)** — the durable cure is a **keep-warm ping** (free
cron-job.org → `/api/health` every few min), deferred to Phase 5 cron; offered to owner, not yet wired.
Docs pushed to **both** the phase-3 branch and `main` (docs only — no migration code on `main`).

### What Was Just Completed — Netlify migration Phase 3 soak: 3 bugs found & fixed live (2026-07-22 s2)

Owner soaking the Netlify shadow app (`ari-search-book.netlify.app`) surfaced three issues; all fixed
on the migration branches and **deployed** (fast-forwarded the build branch
`claude/netlify-migration-plan-8lim9k` up to the phase-3 tip `baf26fc`). **Vercel/`main` untouched.**

1. **Outlook import → HTTP 500 from Microsoft (Netlify bug #8), NOW WORKING.** Root cause = the
   malformed `User-Agent` `'Mozilla/5.0 SearchBook'` — accepted from Vercel's egress, bot-filtered (500)
   from Netlify's datacenter IP. Fixed with a real browser UA + one 5xx retry + logging Microsoft's
   `x-ms-diagnostics`/body on failure. **Owner confirmed the import works on Netlify.** (`baf26fc`,
   `server/src/lib/ics.ts`.) Would have been a *real* outage post-cutover — the soak caught it.
2. **Rate limiting silently disabled (Netlify bug #7).** `req.ip` undefined under serverless-http →
   `ERR_ERL_UNDEFINED_IP_ADDRESS`, every request keyed to one `undefined` bucket (no per-IP throttle in
   front of the password gate). Fixed to resolve IP from `x-nf-client-connection-ip`/`x-forwarded-for`/
   `req.ip`. (`eabbef7`, `server/src/app.ts`.)
3. **`OUTLOOK_CALENDAR_ICS_URL` + `APP_TIMEZONE` were undocumented** in `server/.env.example`, so the
   Phase 2 env checklist omitted them → "Outlook calendar not connected". Owner set the var; both now
   documented and the plan's Phase 2 list marked authoritative. (`8ad7fa6`.)

**Soak still in progress** — reminders on Netlify are expected to be serviced by Vercel's cron (VAPID
unset on Netlify by design until Phase 5), so a reminder set on Netlify fires from the Vercel origin;
that is correct, not a bug. Full Phase 3 detail in `NETLIFY-MIGRATION-PLAN.md` §5 (Phase 3 IN PROGRESS).

### What Was Just Completed — Netlify migration Phases 1 & 2: code + first parallel deploy, LIVE on Netlify (2026-07-22)

Executed **NETLIFY-MIGRATION-PLAN.md** Phase 1 (additive, env-gated code) **and** Phase 2 (owner
provisioned the Netlify site + first parallel deploy). The app now runs on
**`ari-search-book.netlify.app`** from the NCQA work network, **in parallel with Vercel**, sharing
the same Turso DB. Owner drove the browser checks: login, contacts, **photo upload + render**, paste,
manual backup (3 files) all work.

⚠ **ALL migration work is on branch `claude/netlify-migration-plan-8lim9k`, NOT `main`.** This is
deliberate — the parallel-run guarantee keeps **`main` → Vercel** as the untouched daily driver until
cutover (Phase 5). **Do not merge to `main` yet.** The Netlify site's production branch is set to
this branch. (Every code change is env-gated on `netlifyBlobsEnabled()` = `STORAGE=netlify` or the
runtime `NETLIFY` signal, so the same commits are dormant on Vercel/local anyway.)

- **Phase 1 (§3):** storage abstraction over Netlify Blobs (`server/src/lib/storage.ts`), three-way
  upload branch (Netlify Blobs → Vercel Blob → local disk, relative `/photos`·`/files` paths), media
  proxy (`routes/media.ts`, mounted outside the `/api` gate), backup `/cron`+`/list` Netlify branches
  + authed `GET /backup/download/:name`, client `api.downloadBlob()` + Settings button, the
  serverless-http function entry (`netlify/functions/api.ts`) + `netlify.toml` + `build:netlify`, and
  **Prisma switched to the engine-less client** (`engine: "client"`, no Rust binary to bundle).
- **Phase 2 env (owner set in Netlify dashboard):** `STORAGE=netlify`, `APP_PASSWORD` (= the login
  password), `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `OPENAI_API_KEY`, `CLIENT_URL`,
  `REMINDERS_CRON_SECRET`. **No `BLOB_READ_WRITE_TOKEN`** (that would route to Vercel Blob). **VAPID_\*
  + `CRON_SECRET` deferred to Phase 5** (push UI auto-hides when VAPID absent; cron isn't wired yet).

**Six Netlify-runtime bugs found live during bring-up and fixed (all on the branch):**
1. 502 `Cannot find module '@prisma/client/runtime/client'` → **hoist `@prisma/client` +
   `@prisma/adapter-libsql` + `@libsql/client` to the ROOT `package.json`** (the function is at repo
   root but those deps lived only in `server/node_modules`; Netlify externalizes them and resolves
   from the function root).
2. 502 `Cannot find module '@libsql/linux-x64-gnu'` → **externalize `@libsql/client` +
   `@prisma/adapter-libsql`** in `netlify.toml` (native binding loaded via a dynamic require esbuild
   can't trace; external = Netlify ships it whole).
3. 502 `ENOENT mkdir '/var/task/data/photos'` → **guard the local upload-dir `mkdir`** on
   `!isProduction && !netlifyBlobsEnabled()` (Netlify FS is read-only; it crashed at import).
4. 500 on `/photos/*` → **`connectLambda(event)`** in the function entry (serverless-http uses the AWS
   Lambda signature, so Netlify Blobs doesn't auto-inject its context). Re-exported via
   `server/src/lib/netlify-blobs-context.ts` so it shares the one `@netlify/blobs` module instance.
5. Images served corrupted → **serverless-http `binary` content-type allow-list** (it utf8-encodes
   responses by default, mangling binary).
6. Photos never displayed (upload toast OK) → **render relative `/photos` paths in production**
   (`photo-upload.tsx`, `contact-detail.tsx`) — the old `import.meta.env.DEV ? photoFile : null` guard
   (a Vercel-era assumption) hid Netlify's relative paths so the `<img>` was never even requested.

**What's next — Phase 3 (parallel soak):** owner uses both a few days, **Vercel stays the daily
driver**; exercise Netlify as a shadow (full §5 checklist, desktop + mobile, from work). Then Phase 4
(migrate Vercel-Blob binaries → Netlify Blobs + rewrite DB URLs to relative — point of no return),
Phase 5 (cutover: crons, VAPID push, per-device PWA reinstall), Phase 6 (decommission Vercel).

**Carry-overs / open items:**
- **Soak caveat:** a photo uploaded *via Netlify* stores a **relative** path, so it renders on Netlify
  but **not** on the Vercel app (and Vercel uploads' absolute URLs render on both). Keep real uploads
  on Vercel during the soak, or treat Netlify uploads as disposable. Resolves at Phase 4.
- **VAPID + cron are unset on Netlify** → push reminders + the daily backup cron don't fire there yet
  (Phase 5). Turso is shared, so data is safe.
- **>~4.5 MB photos** may exceed Netlify's ~6 MB Lambda response cap once base64-inflated (normal
  contact photos are far under this; noted, not blocking).
- **Free compute quota (R10)** unverified — eyeball Netlify Usage; drop reminders cron to 2–3 min if
  tight (Appendix A) once cron is wired in Phase 5.

**Kickoff for next migration session:** "continue the Netlify migration — Phase 3 soak" (work on
branch `claude/netlify-migration-plan-8lim9k`; site `ari-search-book.netlify.app`). For unrelated
owner asks, that work still goes to `main`/Vercel as usual — only the migration lives on the branch.

### What Was Just Completed — @-mention mis-classification recovery + search count-skip speedup (2026-07-21)

Two owner asks, **schema-free**, **three commits to `main`** (`121278d`, `f745a15`, `c7df6f3`). Owner
confirmed both live (the Create control hides on click; search dropped from ~5.5s → ~1.3–1.6s).

**1. A first-time @-mention accidentally tagged as an org can now be made a contact (and vice versa)**
(`121278d`, `f745a15`). When you `@`-mention a new name and slip on "organization" instead of "person",
the note gets a `[@Name](#org-mention)` token → a **loose org mention** whose only recovery was a "Create"
button that made an *org*. Two-part fix:
- **Server** (`server/src/routes/mentions.ts`): `create-contact` / `create-company` now accept a loose
  mention of **either** kind and rewrite **both** loose token forms (`#mention` *and* `#org-mention`) →
  the bound token, so the note stops re-deriving the wrong kind on the next save. Each still rejects a
  mention already bound to a real record (converting a *created* org↔contact is a different, destructive
  op, left out of scope). *(Note: `create-contact` had only ever rewritten `#mention`, so calling it on an
  org-mention would have silently made an orphan contact — this closes that.)*
- **Client** (`client/src/pages/mentions.tsx`): the loose "Create" is now a **split button** — primary
  click keeps the one-click default for the common (correct) case; a caret opens "Create as contact" /
  "Create as organization" for either type. Follow-up: the control now **hides optimistically the instant
  a type is chosen** (was lingering with a spinner through the round-trip + reload), restored only on error.

**2. Global search sped up ~4× by skipping redundant COUNT queries** (`c7df6f3`, `server/src/routes/search.ts`).
- **Owner reported search felt slow; asked if a recent change caused it. It did not** — this session's work
  never touched search; the only recent change to the search path was the **2026-07-13** `@`-mentions-in-search
  feature. **Confirmed with the owner's Vercel `[TIMING]` logs** rather than guessing: my first hypothesis
  (the `mentions` scope's heavy fetch) was **wrong** — with vs. without the mentions scope was only ~250–580ms
  of a ~5,500ms search.
- **Real cause (from the logs):** a 2-result search (`"barbara"` → 2 contacts, 1 company) *still* took ~5.3s,
  so cost is **fixed overhead, not result volume**. Each of ~7 scopes ran a `findMany` **and** a full `count()`
  (complex `OR` with relation sub-queries) as a second sequential wave over Turso — ~14 round-trips regardless
  of matches. (Plus general cold-start/Turso-warmth variance — same "evan" query ran 1.5s cold vs 3.6s warm —
  which is infra, not code.)
- **Fix:** in the `totals` block, **skip a scope's `count()` when its page came back short** (< `take`) — a
  short page already *is* the whole result set, so its total is the fetched length. A narrow search (the common
  case) now runs **zero** count queries. **Pure speedup, zero behavior change**: when `take` didn't truncate,
  the fetched length equals what `count()` would return (mentions uses the JS-verified length, matching
  `countMentionMeetings()` for the loose-`@`-target case). Deliberately did **not** speculatively overlap counts
  with fetches — once short pages skip, that would only waste queries on the narrow searches we're speeding up.
- **Result confirmed in prod logs:** `/api/search` for "barbara"/"bar" went from ~5,082–5,964ms → **~1,303–1,556ms**.
- **Next lever if ever wanted:** trim the eager relation loads in the result fetches (`prepNotes` take 20,
  `participantInConversations` take 50) — not needed at ~1.3s warm.

`prepush` + **full `npm run build`** green. **No Turso DDL** (client + server code only, no schema change).
Browser not driven from the container (no local server/DB stack); the mention change is standard shadcn
`DropdownMenu`, and the search change was **verified against production** via the owner's `[TIMING]` logs
(before/after). Not part of any NCQA-adaptation-plan task, so no task STATUS line to update.

### What Was Just Completed — LinkedIn "About" gets its own field (out of Notes) (2026-07-20)

Owner ask: the LinkedIn import dropped the profile's **About** text into `notes`, colliding with the
notes he writes about people. **SCHEMA** (owner applied the Turso DDL, confirmed, before the push),
**one commit to `main`**.

- **New additive `Contact.linkedinAbout`** (`ALTER TABLE "Contact" ADD COLUMN "linkedinAbout" TEXT`).
  The import now routes the parsed `about` there (`contact-form.tsx` `onImport`), leaving `notes` alone.
- **"About (LinkedIn)" section shows only when populated** (i.e. only after an import): a read-only card
  on the contact detail (`contact-detail.tsx`) and an editable/clearable box on the contact form. Rendered
  as **verbatim pre-wrapped plain text** (not `ReactMarkdown`) so stray `*`/`#`/`-` in LinkedIn copy aren't
  mangled.
- **Import dialog field-merge** for About now compares against a prior `linkedinAbout` (not `notes`),
  labeled "About (LinkedIn)" (`linkedin-import-dialog.tsx`). Also added an "About (LinkedIn)" block to the
  **LLM markdown export** (`llm-export.ts`) so the text stays available to the search agent (it used to ride
  inside notes).
- **Forward-only** — existing contacts whose About already sits in `notes` are **not** migrated (owner
  declined a backfill). Backup unchanged (both paths pass all columns; `Contact` already covered).
- ⚠ **Full-build-catches-what-prepush-misses, again:** making `Contact.linkedinAbout` a **required** field
  in the client type broke an `as Contact` object-literal cast in `contact-list.tsx` (draft rows) — clean
  under `prepush`'s `tsc --noEmit`, **failed** `tsc -b`/`vite build`. Fixed by adding the field to that
  literal. Reaffirms the AGENTS.md "run a full `npm run build` before pushing" rule.

`prepush` + **full `npm run build`** green. **Browser not driven** — this is a data-shaping change and a live
import needs an OpenAI key; the UI is standard Card/Textarea mirroring the adjacent Notes/Useful-For cards.
Eyeball 390px on the new card if convenient (it's a labeled card + pre-wrapped text, same as its neighbors).

### What Was Just Completed — LLM search-agent markdown export (third manual-backup file) + agent guide (2026-07-16 s2)

Owner uses an LLM agent to search/synthesize his notes (e.g. "every org dysfunction I've
documented", "everyone at CMS I've discussed AI with") and worried the JSON backup was growing
too fast to stay useful. **Schema-free, client-only; three commits to `main`** (`6291115`→`4de4be6`
re-signed, `46e5aaf`, `b2dfede`).

- **Diagnosis first (not a bug):** compared the owner's 6/16 vs 7/16 backups — 0.83MB→2.04MB, but a
  third is just `JSON.stringify(…, null, 2)` pretty-printing, and ~half the real growth is a **one-time
  NCQA network-onboarding wave** (170 contacts / 309 companies / 514 employment rows), not a run rate.
  No pathology (no dup rows, no base64 in text). The real problem was **shape, not size**: the JSON is a
  hostile agent target (notes are single escaped lines, attendees are bare integer IDs).
- **New third download** from the manual backup (`settings.tsx` `handleBackup`, beside the JSON + the
  binaries ZIP): **`searchbook-notes-<stamp>.md`**, built client-side from the same in-memory export by
  new **`client/src/lib/llm-export.ts`** (`buildLlmExport`). A markdown **prose corpus** for the agent:
  **Meetings** (newest-first; per-attendee takeaway lines), **People** (profiles + dossier prep notes),
  **Organizations**, **Ideas** (archived included + labeled `(archived)`). Every contact/company/tag/series
  ID resolved to a name; note markup cleaned (`[@Name](/contacts/7)`→`@Name`, `![screenshot](blob-url)`→
  `[image]`). ~550KB vs the 2MB JSON, greppable line-by-line, self-contained records. Not a restore source.
- **Content coverage matters:** first cut shipped only Meetings/People/Orgs; owner's "…or ideas?" probe
  caught that **Ideas + contact/company prep notes** (~59KB of prose) were silently dropped. Folded all
  three in so the `.md` is the **complete** prose corpus — the fix removes a *silent cross-file miss*
  (an agent asked "legal risks in meetings or ideas" would otherwise answer from meetings alone).
- **Guide for the agent:** new **`.planning/SEARCH-AGENT-GUIDE.md`** — routing rule (prose/themes/ideas/
  notes → `.md`; exact numbers/dates/history → JSON; image contents → ZIP), the `.md` structure/schema,
  conventions (`@Name`, `[image]`, per-attendee takeaways, owner shorthand), and how to answer common
  queries. Cross-linked from `BACKUP-SCHEMA.md` (JSON schema, now marked the fallback) + indexed in
  `.planning/README.md`. **Source of truth for the `.md` format is `llm-export.ts`** — keep the guide in
  sync with it on any format change.
- **Left as an option (not built):** the two CMS company records ("…(CMS)" with 11 people + a bare
  duplicate) are a data-hygiene merge worth doing so a "CMS" grep can't miss anyone; and the export could
  later feed the adaptation plan's **Task 6.2 (semantic search over meeting notes)** rather than staying a
  grep target.

`client tsc` + `check:backup` (32 tables) + **full `npm run build`** green. Verified by transpiling
`llm-export.ts` and running it against the owner's real 7/16 backup (25 ideas incl. 2 archived, 24
prep-note blocks, 0 residual blob URLs). Commits are **SSH-signed** (a stop-hook flagged the first as
Unverified → amended `--reset-author` to sign, force-with-lease'd `main`). Browser not driven (the export
is a pure data transform, exercised directly against real data).

### What Was Just Completed — Owner UX batch: participant sort, on-screen Add-Action button, faster meeting-time entry, post-create nav (2026-07-16)

Four small owner asks, **all schema-free + client-only**, each developed on
`claude/meeting-imports-action-button-h0vtu9` and merged `--no-ff` into `main`. Owner confirmed the
meeting-time redesign live ("works great").

1. **Bulk-pasted meeting participants now sort ascending by first name** (`1fc9cec`→`e22d39d`). Pasting
   an Outlook recipient list into the Quick Log Participants field used to keep whatever order the paste
   supplied; the merged id list is now sorted by first name in `handleBulkPasteParticipants`, resolving
   each name from `contactOptions` + the `/contacts/resolve-participants` results.
2. **"New Action" button no longer scrolls off-screen** on Actions + Dashboard (same commit). Root cause
   was **horizontal** overflow: `SidebarInset` (flex child of the sidebar row) lacked `min-w-0`, so a wide
   table forced the whole content column past the viewport and the right-aligned header/action buttons off
   the right edge. Fixed with `<SidebarInset className="min-w-0">` in `layout.tsx` — wide tables now scroll
   in their own `overflow-x-auto` box (the shadcn `Table` already provides one). Fixes every wide page.
3. **Faster meeting start/end entry** (`c5881ee`→`0391e97`). New **`MeetingTimeRange`**
   (`client/src/components/meeting-time-range.tsx`) replaces the two native `<input type="time">` fields.
   Start = the forgiving free-text `TimeInput` from action reminders (`"9"`→9:00, `"930"`→9:30, `"2p"`→2:00
   PM); End = one tap on a **30m/45m/1h duration chip** computed from the start (chips disabled until a
   start exists, highlight the matching span, tap-active-to-clear). End stays editable; a typed end
   at/before the start is bumped 12h so it's always after the start; changing the start preserves the chosen
   duration. Also added `startTime`/`endTime` to the Quick Log **autosave deps** (a time-only edit didn't
   save before).
4. **After creating a new action, return to the `/actions` list** instead of the new action's detail page
   (`action-form.tsx`, `18fe989`→`7a40f24`); editing still returns to the detail page.

`client tsc` + `check:backup` (32 tables) green on each; server `tsc` green after a one-time
`npm install` + `prisma generate` in the fresh container; the duration/12h-bump math was unit-checked in
Node. **Browser not driven this session** (no local server/DB stack up) — the components are
self-contained and the owner is testing on the live deploy; eyeball 390px on the meeting-time chips if a
narrow phone wraps them oddly.

### What Was Just Completed — @-mention search (scope + `@` picker) + green "happening NOW" meetings (2026-07-13)

Two owner asks. **Two feature commits to `main`** (`29047b8` schema-free, `861a3f7` **SCHEMA** — owner applied the
Turso DDL and confirmed live before the push). Owner confirmed both working.

**1. Find every @-mention of a person/org from global search** (`29047b8`, schema-free).
- **Root gap:** search reached mentions only *by accident* — matching the raw markdown token inside `notes`, which
  produced snippets full of `[@Ann](/contacts/7)` and could not distinguish "she was **called out** with `@`" from
  "her name appears in a sentence". The `ConversationMention` index already existed (derived from note text on every
  save); nothing queried it from search.
- **New `mentions` scope** on `/api/search`: a hit is a **meeting**, carrying **only the mentions that matched**, plus
  the note text around them. **All terms must land on ONE mention row** — a `some`-per-term would let "Anne Smith"
  match a meeting that separately mentions "Anne Jones" and "Bob Smith" (seeded that decoy; it correctly does not match).
  Matches on the name **as typed** AND the linked record's **current** name, so a renamed contact stays findable.
- **Owner follow-up mid-session** ("should I use the at-symbol? the dropdown would help me find the exact spelling") →
  **typing `@` in the search box opens a picker**, fed by new **`GET /api/mentions/index`** (distinct mentioned entities
  + meeting counts; aggregated in JS, no `groupBy`/`_count` per the Turso gotcha). **Sourced from the mention index, not
  the contact list** — so every option has ≥1 hit and **loose names** (mentioned but never made contacts — exactly the
  ones you can't spell from memory) appear, marked "not in CRM". Picking strips the typed `@…` and pins a chip:
  `?mention=contact:440|company:5` (bound, id-based → survives renames) or `person:<name>|org:<name>` (loose).
  A pinned target **forces the mentions scope server-side**; words typed after it narrow the **meeting's text**.
- ⚠ **Loose targets match by name, and Prisma `equals` is case-sensitive on SQLite** → the clause uses `contains`, which
  **over-matches a longer name** ("Anne Marie Smith" ⊂ "Anne Marie Smithson"). Rows **and counts** are re-verified in app
  code (`mentionMatchesTarget`) — seeded a `Smithson` decoy; returns 3, not 4.
- Also: mention tokens **humanized** (`@Ann`, not raw markdown) in meeting search snippets; the Mentions review page
  refactored onto the now-shared `MentionChip` + `meetingMentionSnippets`.
- **Known rough edge (left as-is, owner told):** typing `@anne mar` and *ignoring* the dropdown searches that text
  literally and finds noise. The guided path (pick from the list) clears it. Offer to make an unpicked `@…` match
  nothing if it annoys him.

**2. Meetings happening RIGHT NOW get a green border** (`861a3f7`, **SCHEMA**).
- Owner wanted a new colour for in-progress meetings — but **the app couldn't answer the question**: `Conversation`
  stored only `startTime`, and "happening now" requires knowing when a meeting **ENDS**. Surfaced the gap + two options
  (assume a fixed duration vs. store a real end time); **owner chose the real end time**.
- **`Conversation.endTime`** (local `HH:MM`). The **ICS parser was already computing the `DTEND` instant and discarding
  it** — so Outlook-imported meetings now carry exact end times for free. Quick Log gained an end-time field beside the
  start; the list shows the range ("7:12 PM–8:12 PM").
- In-progress → **emerald left border + pulsing "Now" pill**, taking precedence over sky-blue "Upcoming" (mutually
  exclusive by construction — "upcoming" already requires `startTime > now`). **Null `endTime` → assumed 60 min**
  (`ASSUMED_MEETING_MINUTES`), tooltip admits the guess. An **untimed** meeting can never be "now". ICS events crossing
  midnight store `endTime: null` (a single-day record can't hold an end earlier than its start).
- The list re-renders on a **30s tick** (`useClockTick`) — a "right now" marker that only updates on reload isn't one.
- **Turso DDL applied by owner:** `ALTER TABLE Conversation ADD COLUMN endTime TEXT;` Backup unchanged (both paths are
  column-agnostic: `findMany()` / `SELECT *`); the meetings list uses `include:` not `select:`, so `endTime` rides along.

`prepush` + **full `npm run build`** green. Both features driven live in-browser (Chrome DevTools MCP against local
SQLite) with seeded data + deliberate decoys; **all test data deleted** (local DB back to its original 224 meetings /
0 mentions). "Now" proven against the **real clock**: a meeting seeded to end 60s out **went dark on its own on an
untouched page** while one running until 8:12 stayed lit. **390px re-tested** on all three surfaces — caught a cosmetic
regression (two time inputs at `6.75rem` clipped the AM/PM) and restored them to `7.5rem`.

**⚠ Local-DB gotcha re-hit a THIRD time** (`db push` from `server/` wrote `endTime` to the stray `server/dev.db`, not the
runtime's `server/prisma/dev.db` → every write 500'd with "column endTime does not exist"). **Now promoted into
`CLAUDE.md`** (auto-loaded every session; this handoff file is not) with the `--url` fix inline. If you are about to run
any Prisma CLI command against the local DB, read that note first.

**Heads-up for whoever picks this up:** the local `dev.db` has **0 meetings with a `startTime`** and none from the Outlook
import, so **"Now" cannot light up locally** — seed a timed meeting to see it. If production looks the same, the marker
stays quiet until meetings actually carry clock times (which mainly happens via the Outlook import). Already-imported
meetings keep `endTime = NULL` (import is skip-only by design, so notes survive re-import) and use the 60-min fallback —
**a backfill of end times for existing imported meetings is an open option the owner has not asked for yet.**

### What Was Just Completed — Ideas now show created **and** last-updated (2026-07-10 s2)

One owner UX ask: on the Ideas list/cards, easily see **both** when an idea was created and when it
was last edited. **SCHEMA** (owner applied the Turso DDL), one feature commit to `main` (`83c6a8a`).

- **Root gap:** the `Idea` model only ever tracked `createdAt` — there was no update timestamp at all.
  Added `Idea.updatedAt DateTime? @updatedAt` (**nullable** on purpose, unlike the non-null variant on
  Contact/Company/Conversation, so the column drops onto the already-populated table via a plain
  additive `ALTER` — no rebuild). Prisma auto-maintains it on every create/update, so the existing PUT
  + archive PATCH already bump it with **zero route changes**.
- **UI (`client/src/pages/ideas/idea-list.tsx`):** new shared `renderTimestamps()` (used by both card
  and list views) shows **"Created {date}"** always, appending a dimmed/italic **"· Updated {date}"**
  **only when the edit lands on a different local calendar day** — same-day tweaks would just repeat the
  date, so they stay clean and noise-free. A **hover tooltip always carries both exact timestamps with
  the time**, so both are available at a glance or precisely on hover. Each date is atomic
  (`whitespace-nowrap`) with a wrap allowed *between* the two, so a 390px card can't overflow; the list
  view passes an outer nowrap to stay one line on desktop (its date column is `hidden sm:inline` as before).
- **Turso DDL applied by owner** via the web SQL console:
  `ALTER TABLE "Idea" ADD COLUMN "updatedAt" DATETIME;` then
  `UPDATE "Idea" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;` (backfills existing ideas so
  they read "created-only" until their next real edit). Pushed only after confirmation.
- **Backup unchanged** — `Idea` round-trips full records in both paths (no field list to touch); the
  new column rides along automatically. Client type gained `updatedAt?: string | null`.
- **Behavioral note:** archiving/unarchiving an idea also bumps `updatedAt` (it's a `.update()`). Left
  as-is (defensible); flagged to owner — make the archive PATCH preserve the timestamp if that's unwanted.

`prepush` (client+server typecheck + 32-table backup guard) + full `npm run build` (client vite + server
tsc) green. **Local-DB gotcha re-hit** (again): `prisma db execute` from `server/` wrote the column to the
stray `server/dev.db`, not the runtime's `server/prisma/dev.db` (→ 500s once the client regenerated), fixed
by ALTERing the correct file directly via better-sqlite3. **Browser not driven** (chrome-devtools MCP
couldn't attach — the profile's Chrome was already in use); instead verified the endpoint returns
`updatedAt` (curl) and unit-checked the created-vs-updated render branches (incl. the UTC/local-day
boundary) in Node against `America/New_York`. Mobile handled by construction (wrap-between-dates); eyeball
390px if convenient.

### What Was Just Completed — Meeting links (real feature) + series-as-title (+ series-only save) + blue picker highlight + dropped title suggestions (2026-07-10)

Four owner UX asks for the meeting log — **four commits to `main`**, three schema-free + one **SCHEMA** (owner applied the Turso DDL). Order matters: the "links" ask was reshaped mid-session from an inline button into a real feature.

1. **Meetings now carry document Links** (`d0ea327`, **SCHEMA**). A real **Links** feature (URL + optional title) using the **shared `Link` model** (the same one on contacts/companies/actions), managed in the Quick Log **"Tags, prep notes, attachments & links"** section and shown as clickable chips there, in the meeting detail dialog, and on `/meetings` cards. New `Link.conversationId` + `Conversation.links` (`onDelete: Cascade`); `/api/links` filters by `conversationId`; both meeting includes (`conversationIncludes` + `meetingListInclude`) return `links`. **`undo.ts` cascade-capture gained `link`→`conversation`** so deleting a meeting cascade-removes its links **and Undo restores them** — verified end-to-end in-browser incl. the delete-cascade + undo round-trip (link + meeting come back with original ids); all test data cleaned up. Add = live `POST`/`DELETE` once the meeting record exists, staged + flushed on finalize before that, unadded draft URL flushed on close. **Backup unchanged** (`Link` already round-trips; `Conversation` restores before `Link` in both paths). **Owner applied the Turso DDL** via the web SQL console — `ALTER TABLE "Link" ADD COLUMN "conversationId" INTEGER REFERENCES "Conversation"("id") ON DELETE CASCADE` — and I pushed only after confirmation. *(A same-session first cut — an inline markdown Insert-link toolbar button on `MarkdownTextarea` — was **reverted** for this per the owner's "move it to the tags/prep/attachments section".)*
2. **Series name stands in for the title** (`407e22c` display + `059618b` save; schema-free). `conversationDisplayName` falls back to the **series name** when a meeting has no title (title → series → participant → contact → org → attendees), **and** a set series now **satisfies the save "≥1 who/what" gate** on both server (`hasWho()`) and client (`autosaveValid`/`hasMeaningfulContent`/finalize). `059618b` fixes the owner's follow-up report — a **series-only meeting** (series + date, no title/participant) now saves with **no "Add a title" toast** (curl-verified POST with only `seriesId`+date → 201; UI Done closes cleanly). An untitled series meeting shows the series name in both the card heading and the series chip — owner OK'd the duplication.
3. **Blue combobox dropdown highlight** (`407e22c`, schema-free). The active row in every `Combobox`/`MultiCombobox` (participants, orgs, tags, series…) highlights **light blue** (`bg-blue-100`/`text-blue-900` + dark variant) with `cursor-pointer`, matching the notes `@`-mention picker — replaced the near-white `bg-accent` that was ~invisible in Edge. Command palette untouched.
4. **Dropped the meeting Title suggestions dropdown** (`407e22c`, schema-free). The Title field is a plain `Input` now — `title-autocomplete.tsx` deleted, `/conversations/titles` fetch removed from the dialog.

`prepush` (client+server typecheck + 32-table backup guard) green on every commit; blue-highlight, series-only save, and the full link add→cascade→undo flow driven live (Chrome DevTools MCP against local SQLite). **Local-DB gotcha re-hit:** `prisma db push` from `server/` wrote the new column to the stray `server/dev.db`, but the runtime opens `server/prisma/dev.db` (db.ts resolves `file:./dev.db` relative to `prisma/`) → 500s until re-pushed with `DATABASE_URL="file:./prisma/dev.db"` (same fix as the `--url` note in the caveats). **Mobile (390px) not separately re-tested** — the Links block is a labeled input row + chips inside the existing collapsible section; eyeball if convenient.

### What Was Just Completed — Vercel-exit contingency plan (2026-07-09, docs-only)

NCQA IT is unhappy the app is hosted on Vercel (they perceive it as an "AI system" risk). The owner
asked for the best **free** alternative (single user, immediate performance required) and a
just-in-case migration plan detailed enough for a less powerful model to execute later.
**Docs-only session — zero code changes, nothing deployed; Vercel remains the live target.**

- **Decision: Google Cloud Run + Google Cloud Storage + Cloud Scheduler, keeping Turso.** The
  backend already runs as a plain Express server, so the port is mechanical (blob-storage swap,
  static serving, Dockerfile); the every-minute reminders cron doubles as a free keep-warm ping
  (request-based billing doesn't charge idle instances), so no user-facing cold starts. Free-tier
  math uses <5% of every quota. Runner-up Cloudflare Workers rejected mainly for the free plan's
  **10 ms CPU cap** (hard-failure risk for Express+Prisma) + web-push/multer porting; Render free
  rejected for 30–60 s cold starts; Fly's free tier is dead; Oracle VM = unmanaged patching burden.
- **New doc: `.planning/VERCEL-EXIT-PLAN.md`** — 6 phases with exact commands, complete code
  snippets (storage abstraction, GCS media proxy, backup download proxy, Dockerfile, blob-copy +
  DB URL-rewrite scripts with `--undo`), verification gates, rollback notes, and the short list of
  owner-only steps (Google billing account, Vercel env values, fresh Turso token, per-device PWA +
  push re-enrollment). Phase-1 code changes are env-gated so the same commit would still deploy to
  Vercel unchanged (safe parallel-run).
- **Do NOT start executing it unless the owner explicitly says so.** If IT pressure escalates, the
  kickoff is: "run the Vercel exit plan" → follow the plan's phases in order.

### What Was Just Completed — Meetings "Upcoming only" filter + new actions default to due today (2026-07-07 s2)

Two owner asks, **schema-free**, two feature commits straight to `main`.

1. **Meetings list: "Upcoming only" mode.** The list-view "Hide upcoming" Switch is now a three-way
   Select next to the sort control — **All meetings / Hide upcoming / Upcoming only** — persisted as
   `?when=past|upcoming` (absent = all); legacy `?hideUpcoming=1` links still read as "past", and
   picking any mode deletes the legacy param so it can't override. Server (`routes/meetings.ts`): new
   `onlyUpcoming=1` param pushes `{ NOT: notUpcomingClause(today, now) }` — the literal Prisma negation
   of the hide-mode clause, so the two modes are **exact complements** of the "Upcoming" badge rule
   (same client-sent ET `today`/`now`; filter skipped if either is missing/malformed; `hideUpcoming`
   wins if both sent). Verified against local SQLite via curl: all(224) = past(221) + upcoming(3) with a
   backdated `today`, partition stays exact at the same-day/EOB boundaries (now=12:00 vs 18:00).
2. **New actions default to due *today*** (creation day, local `en-CA` date) on **all three** creation
   surfaces: the New Action page (`action-form.tsx` — edit mode untouched; form is replaced on load),
   the command-palette quick-add (`command-palette.tsx`, incl. `resetForms`), and the Quick Log
   follow-up composer (`makePendingAction` in `quick-log-dialog.tsx` — untitled rows are still ignored
   by `actionsDirty`/`reconcileActions`, so the default alone never creates anything). The first two
   got a ghost **X "Clear due date" button** beside the date input (clearing also inertizes
   time/notify via the existing `dueDate ? … : null` payload logic); the composer's 3-col row has no
   room for an X — its native date-picker Clear covers it.

`prepush` (client+server typecheck + 32-table backup guard) + full client `vite build` green. Browser
verification not possible this session (chrome-devtools MCP couldn't attach — profile already in use);
server filter verified via curl as above, UI changes are same-pattern swaps of adjacent controls.
**Mobile note:** the meetings header Select replaces a same-size Switch in an already-wrapping flex row;
the due-date X buttons are in single-column forms — eyeball 390px if convenient.

### What Was Just Completed — Dashboard action ownership quick-switch + waiting-items sink (2026-07-07)

Two owner asks for the dashboard actions workflow plus a same-session follow-up ask, **schema-free,
client-only**, two feature commits to `main` (`e2f5a63` dashboard, `ab13a09` /actions list page).
Owner's scenario: he does his part of "Reach out to John re X" → the ball is now in
John's court → he wants to flip ownership in a couple of clicks from the dashboard, and wants untimed
"waiting on someone else" items kept at the **bottom** of the Overdue/Today lists.

1. **New `ActionOwnerSelect`** (`client/src/components/action-owner-select.tsx`, mirrors the inline
   `ActionDateSelect` pattern): an hourglass popover on every dashboard action row. **No schema change**
   — it drives the existing Task-3 ownership model (`owedByMe` + `owerContactIds`; server derives
   `direction`). Owned rows get a hover-revealed trigger (always visible on mobile) → one-click
   hand-off to the action's **linked contact(s)** (2 clicks for the canonical case), a ranked contact
   search, or **"Someone else — no name"** (unnamed waiting — the owner usually can't tell the system
   who). Waiting rows get an always-visible fuchsia trigger (+ a visible "Waiting" label when there's
   no named ower on the row) → removable chips, add-person search, one-click **"Take it back"**.
   ⚠ Gotcha honored: the PUT always sends **both** `owedByMe` and `owerContactIds` — the server's
   `resolveOwers` defaults `owedByMe` to true when omitted, so sending one field alone corrupts the other.
2. **`waitingSink` sort key** in `dashboard.tsx`: untimed `WAITING_ON_THEM` items sort to the bottom of
   **Today** and **Overdue**; timed items keep their clock position; within the sunk group the existing
   date/priority order applies. (Sorting is dashboard-only; the `/actions` list keeps its own sortable
   columns.)
3. **Also on the `/actions` list page** (owner follow-up ask, same session): a slim "Ownership" column
   after Due Date on desktop (icon-only trigger — `hideLabel` prop keeps it from duplicating the list's
   existing "Waiting" title-badge), and on mobile the trigger sits inline next to the date select under
   the title (column hidden via `columnVisibility`, matching the other mobile-hidden columns).

Verified live (Chrome DevTools MCP) desktop + 390px mobile: linked-contact hand-off, unnamed hand-off
(a HIGH item visibly sank below a MEDIUM), take-back, search + Enter keyboard pick, both lists
re-sorting, console clean; all test actions deleted after. `prepush` + full client `vite build` green.
**Env fix along the way:** local `server/prisma/dev.db` had drifted ~4 sessions behind the schema
(missing `dueTime`/`notify`/`lastNotifiedAt`/`recurringWeekdaysOnly`) so every Action read/write 500'd
locally — synced additively via `npx prisma db push --url "file:C:/dev/personal/searchbook/server/prisma/dev.db"`
(Prisma 7's `--url` flag sidesteps the stray-`server/dev.db` CWD gotcha below).

### What Was Just Completed — Meeting-log dialog: wider + Ctrl-click a name keeps the log open (2026-07-06)

Two small owner asks for the Quick Log / meeting editor (`client/src/components/quick-log-dialog.tsx`),
**schema-free, client-only**, one commit to `main` (`f1bb55d`).

1. **Wider default width.** The non-prep-panel `DialogContent` width `sm:w-[36rem]` → **`sm:w-[52rem]`**
   (matching the Ideas dialog, per the owner's "like Ideas"). Panel mode (prep notes / series context
   showing) is unchanged at the wider `sm:w-[64rem]`; still drag-resizable + `sm:max-w-[95vw]`-capped.
2. **Ctrl-click a participant name keeps the log open.** The name `<Link to={/contacts/:id}>` used to call
   `handleDialogOpenChange(false)` on *every* click, so a Ctrl/Cmd-click opened the contact in a new tab
   **and** closed the log. The owner wants to open a person's tab to document about them *while continuing*
   to document in the log. The `onClick` now returns early on a modified/non-left click (`e.metaKey ||
   e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0`) — react-router already skips client-nav on a
   modified click, so the browser opens the card in a new tab and the dialog stays open; a plain left-click
   still navigates in place and flushes+closes as before.

`prepush` (client+server typecheck + 32-table backup guard) + full client `vite build` green. **Mobile
unaffected** — the width change is at the `sm:` breakpoint (≥640px; mobile stays `w-[95vw]`) and the
modifier-key guard is a no-op for touch (plain click). Committed straight to `main`.

### What Was Just Completed — Meeting search results expand into a full read-only detail view with highlighting (2026-07-04)

Owner ask: clicking a **meeting** result in global search should show its **full contents + prep notes with the
search term(s) highlighted**, not navigate away to the `/meetings` list. **Schema-free, client-only**, two
commits straight to `main` (`182885e` → `28fb55a`); owner confirmed both live.

1. **New `MeetingDetailDialog`** (`client/src/components/meeting-detail-dialog.tsx`): clicking a meeting search
   card (title or card body) opens a read-only dialog that **fetches the full record** (`GET /conversations/:id`
   — the `/api/search` response only carries 60-char match snippets) and renders summary, **notes**, **next
   steps**, **prep notes**, attachments, and related people/orgs/tags chips. Search terms are highlighted
   throughout — plain text (title/summary/participants) via `HighlightedText`, and *inside the rendered markdown*
   (notes/prep/next-steps) via the existing `highlightRehype` rehype plugin.
2. **`MentionableMarkdown` gained optional `highlightTerms`/`caseSensitive` props** — applies `highlightRehype`
   when present (keeps the `@`-mention chips), mirroring the Ideas-list highlight pattern. `MeetingSearchCard` in
   `search.tsx` now opens the dialog (one page-level instance via `openMeetingId`; both "All" + "Meetings" tabs)
   instead of `<Link>`-ing out.
3. **"Edit meeting" button** (`28fb55a`): the first cut linked to `/meetings?id=`/`?title=` (which just filtered
   the list) — replaced with a button that closes the detail view and opens the **canonical Quick Log editor for
   THAT meeting** via the app-wide `useQuickLog().openEdit(id)` (search page renders inside `QuickLogProvider`), no
   navigation.

`prepush` (client+server typecheck + 32-table backup guard) + full client `vite build` green; **verified live
in-browser** (Chrome DevTools MCP) desktop **and** 390px mobile — dialog opens, term highlighted in rendered
notes, Edit → editor loads the right meeting; no console errors. **Command-palette meeting hits still navigate
to the list** (out of scope; raise if wanted). Prep-note highlight path is byte-identical to the verified notes
path but the local DB has no prep notes to exercise it live.

### What Was Just Completed — Owner UX polish batch + recurring-action reminder fix + weekday-only recurrence (2026-07-03)

A batch of small owner-facing tweaks plus two action-recurrence fixes. Five commits on `main`
(`6646c88` → `8035c08` → `02c29b8` → `876d3fc` → `63cc211`); owner asked for each live.

1. **Dashboard pills decluttered** (schema-free): the action **priority** pill shows only when `HIGH`
   (Medium/Low were near-universal noise); the **type** pill is hidden when type is `OTHER`; and the
   title + remaining pills/markers now sit on **one wrapping row** (pills to the *right* of the name,
   wrapping under only when the title can't share the line) instead of a line below.
2. **Idea editor opens wider** (schema-free): the Edit/New Idea dialog default `sm:w-[28rem]` → `sm:w-[52rem]`
   (still drag-resizable, capped `92vw`).
3. **Darker form-field outlines** (schema-free): light-mode `--input` `oklch(0.922)` → `oklch(0.84)` (kept
   just below `--border`) — the near-white outline was hard to see, notably in **Edge** on the meeting-log
   documentation boxes. Done at the token so it covers Input/Textarea/Select everywhere; also gave
   `Combobox`/`MultiCombobox` triggers explicit `border-input` (they fell back to the lighter `--border`) so
   the participant / org / series / tag pickers match.
4. **Reminder carries onto recurring occurrences** (schema-free, `876d3fc`): the next-occurrence creation in
   `PATCH /actions/:id/complete` copied schedule/priority/contacts but **dropped `dueTime` + `notify`**, so a
   recurring action lost its reminder after the first fire. Both now carry forward; `lastNotifiedAt` left null
   so the cron arms a fresh reminder for the new occurrence.
5. **Weekday-only recurrence** (**SCHEMA**, `63cc211`): new additive `Action.recurringWeekdaysOnly` bool — when
   set, the next occurrence advances to the next weekday, skipping Sat/Sun (Fri→Mon), which a fixed day interval
   can't express. Form "Recurring action" block gained a **Repeat** selector (Every N days / Every weekday
   (Mon–Fri)); interval input hides in weekday mode; detail view + backup boolean-coercion updated; the flag is
   carried onto recurrences too. **Turso DDL applied by the owner** (`ALTER TABLE "Action" ADD COLUMN
   "recurringWeekdaysOnly" BOOLEAN NOT NULL DEFAULT false`) via the **web SQL console** — the committed
   `server/.env` rw token is **stale (hard 401)**, so the "uncomment creds + run a libsql script" path no longer
   works; use the web console or a fresh token. Chose a clean column over a sentinel-in-`recurringIntervalDays`
   (owner picked "add a proper field" via AskUserQuestion).

`prepush` (client+server typecheck + 32-table backup guard) green on every commit. Mobile (390px) not
separately re-tested — the dashboard row is a flex-wrap of existing chips; the rest are a dialog width, a
border-color token, and a form selector.

### What Was Just Completed — Picker relevance ranking + toolbar-less markdown in contact docs + Edge highlight fix (2026-07-02 s5)

Three bundled owner enhancement asks, **schema-free**, committed straight to `main` (`3391b43`, then `18a698f`); owner confirmed live.
1. **Relevance-ranked people/org pickers.** The meeting **Participants** picker and the **@-mention** autocomplete now float the most-likely target first. `GET /api/contacts/names` + `/companies/names` return a numeric `rank` (rows pre-sorted by it), computed in app code from cheap parallel `groupBy` counts (Turso-safe, **not** the `_count` include). **Primary factor is engagement** — `min(meetings,40)*50 + min(@mentions,40)*30` (contact meetings = anchored `Conversation.contactId` + `ConversationParticipant`; @mentions = `ConversationMention`) — so among five "Sarah"s at NCQA the one you actually meet/@-mention most wins. Smaller boosts: NCQA ecosystem +150, has-a-written-profile +50 (ids-only presence query — no big-text transfer). Companies rank on meetings + @mentions + people-on-file. Client: `ComboboxOption.rank`; `Combobox`/`MultiCombobox` + the mention list sort **word-prefix-first** ("sar"→Sarah before Ce·sar), then rank, then alpha. **Owner explicitly chose engagement-primary over the initial NCQA-dominant (+1000) weighting** — if NCQA colleagues you haven't met feel too buried, raise the +150 boost.
2. **Toolbar-less markdown in contact documentation boxes.** New `hideToolbar` prop on `MarkdownTextarea` keeps every shortcut (Ctrl+B/I, bullets, Tab-to-nest, list continuation, image paste) without the toolbar. **Role Description, Useful For, Personal Details** switched to it; their contact-detail read views now render markdown (`personalDetails` was plain text before).
3. **@-mention keyboard highlight fixed (Edge).** Arrow/Enter/Tab selection already existed, but the highlighted row used `bg-accent` (`oklch 0.97`, ~3% contrast on white) — barely visible in Chrome, **invisible in Edge**. Swapped to an explicit blue matching the mention-chip theme + `scrollIntoView` so the active row stays visible on a long list.

`prepush` (client+server typecheck + 32-table backup guard) + full client `vite build` green; both ranking endpoints smoke-tested live against local SQLite (curl) — `rank` on every row, sorted desc, the new `ConversationMention` `groupBy` doesn't hang. **No Turso DDL.** Mobile not separately re-tested (dropdown highlight + picker ordering + form-field editor swaps; no layout change).

### What Was Just Completed — Meeting-notes scroll-bar flicker fixed (2026-07-02 s4)

Owner reported that while typing meeting notes with SearchBook at **half-monitor width** (Teams in the
other half), the right-edge scroll bar kept **appearing and disappearing**. **Root cause:** the notes
`MarkdownTextarea` auto-grows (`field-sizing-content`) inside an `overflow-y-auto` scroll container; when
it grows past the container a scroll bar appears → on classic (non-overlay) Windows scroll bars that eats
~15px of width → the narrower column **rewraps** the text → textarea height changes by a line → content can
drop back under the scroll threshold → bar hides → width restored → rewraps back → grows → oscillation =
flicker. Worse at half-width because a narrow column sits right on word-wrap boundaries. **Fix**
(`client/src/components/quick-log-dialog.tsx`, `033673e`): added `[scrollbar-gutter:stable]` to the two
scroll containers wrapping the notes field — the `DialogContent` (non-panel mode) and the desktop
right-panel form scroll `div` (panel mode) — so the gutter is permanently reserved, the scroll bar toggling
no longer changes content width, and the loop can't start. **Schema-free, client-only** (two-line Tailwind
className edit). Client `tsc` + `check:backup` (32 tables) green; server `tsc` couldn't run (no server
`node_modules` in this container — pre-existing env limitation, unrelated errors only), Vercel's
`build:vercel` is the real gate. Developed on `claude/meeting-notes-scroll-flicker-9lopxu`, fast-forwarded
into `main` (`dd07481..033673e`) at owner's request; owner confirmed it looks good. Mobile unchanged.

### What Was Just Completed — Reuse a series' prep notes in the next meeting (2026-07-02 s3)

Owner ask: when logging a meeting **in a series**, the desktop "Last Meeting in Series" panel already
shows the prior meeting's notes — now it also surfaces that meeting's **prep notes** with a **"Copy to
prep notes"** button that duplicates their *content* into the new meeting as fresh, editable prep notes,
so you can rapidly populate + tweak them. It's a **one-way content copy** — the prior meeting's own
prep-note records are never touched. In create mode the copies stage as `pendingPrepNotes` (persisted on
finalize like any staged note); in edit mode they `POST` to `/conversation-prepnotes` on the current
meeting. Dated **today** (prep for the new meeting). **Schema-free, client-only** — all in
`client/src/components/quick-log-dialog.tsx` (the `/meetings` list `include` already returned `prepNotes`,
so the series-context object already carried them). Three commits, pushed to `main` (`ef46ee0` → `5c66d4e`
→ `d0fcadb`).

Two follow-up refinements in the same session: **(1, `5c66d4e`)** once copied, the source prep-notes box
**hides itself** (the copies live editable at the top of the panel), freeing room for the notes box.
**(2, `d0fcadb`)** the first cut keyed that hide on session-only state, so the box **reappeared on reopen**
after copy+save — fixed by basing visibility on a **durable** signal (`meetingHasPrepNotes` = does THIS
meeting already have prep notes of its own, saved or staged), so it stays hidden across save + reopen and
re-appears only if you clear all of this meeting's prep notes. **Desktop-only** (the series-context panel
is `useIsDesktop`-gated — mobile has no side panel; unchanged). `prepush` (typecheck + 32-table backup
guard) + full client `vite build` green.

### What Was Just Completed — Duplicate auto-merge, two rounds: recorded rules that never fired, then a fallback that never even looked (2026-07-02)

Owner reported (via a GitHub task) that after the 2026-06-29 persistence session, dupes kept
recurring instead of auto-merging. Two rounds, both verified with a local server against real SQLite
(curl), not just by re-reading code — worked around two container issues along the way:
Prisma/better-sqlite3 binary downloads need `NODE_USE_ENV_PROXY=1` (see `/root/.ccr/README.md`), and
the documented `db push`-from-`server/`-writes-the-wrong-`dev.db` gotcha.

**Round 1:** both merge endpoints only wrote `DuplicateMergeRule` `if (removedKey !== keptKey)` — but
those keys are the *normalized core name*, and the single most common duplicate shape (two names whose
core normalizes identically — exact dupes, or a legal-suffix variant like "Acme Health System" vs
"...Inc") always has equal keys, so the rule silently never got recorded for that bucket. Fixed to
always record (including the self-mapped case, keeping the lower id); also fixed the recorded `keptKey`
going stale when a merge's field-selection chose the removed side's name. Separately, the client's
`handleDismiss` fired the dismiss POST without awaiting it and swallowed any failure — fixed to match
`handleMerge`'s await-and-toast pattern.

**Round 2 (owner tested live, still not working):** repro was merging "NCQA" into "National Committee
for Quality Assurance (NCQA)", then creating a contact with org "NCQA" — expected it to resolve to the
full name; didn't. Two more gaps: **(a)** the round-1 fix only ever checked merge rules for pairs the
*heuristic* similarity scan also flagged — and "NCQA" shares no token/similarity with the spelled-out
name, so it's never even a candidate (confirmed: scanning the two returned `pairs: []`). Fixed by
extracting `applyMergeRules()` — an independent first pass over *all* entities (grouped by normalized
key) that applies every rule regardless of similarity, before the heuristic scan runs, removing what it
merges so the heuristic pass never re-sees it. **(b)** nothing consulted merge history at
company-*creation* time, so typing "NCQA" recreated the duplicate immediately regardless. Added
`resolveExistingCompanyByName()` (exact match → merge-rule redirect → null) + `POST
/api/companies/resolve`, wired into **6 places** that each had their own bare "look up locally, else
create" logic: contact-form (+ its LinkedIn-import path), CSV import (both the server `contacts.ts`
helper *and* a separate, previously-unfixed client-side `csv-import-dialog.tsx` path), actions, ideas,
and the Quick Log meeting-org resolver. Left the standalone "Add Company" page and the org-`@`-mention
"Create organization" button untouched — both are deliberate "make a new one" actions, unlike the other
sites' implicit resolution.

Verified end-to-end: the exact NCQA repro now resolves immediately (`created:false`, no duplicate,
contact attaches to the right org); regression-checked the same-key case, a dissimilar-name case for
contacts too, heuristic-similarity pairs still surfacing for review, and dismiss-then-rescan — all pass.
Client+server typecheck, `prepush` (32-table guard), full client `vite build`, server `tsc` all green.
**Schema-free.** Full write-up: `SESSION-HISTORY.md` 2026-07-02 (both entries). Pushed to `main` both
rounds (owner asked directly in round 1; kept `claude/org-merge-dedup-issues-ddtn2r` in sync too).

### What Was Just Completed — Meeting-log polish: caret stays in view + new actions on top (2026-06-30 s2)

Two small owner asks for the Quick Log / meeting editor, **schema-free, client-only**, merged + pushed
to `main` (`a34f6aa`). Owner confirmed both live.
1. **Caret no longer hides below the fold.** The note `MarkdownTextarea` auto-grows
   (`field-sizing-content`) so it never scrolls internally — it extends past the bottom of the dialog's
   scroll container, and the browser doesn't scroll that ancestor to follow the caret, so a line typed
   after Enter at the bottom went out of view. New `scrollCaretIntoView` (reuses the existing mirror-div
   `getCaretCoordinates`) finds the nearest scrollable ancestor and nudges its `scrollTop` (16px margin)
   when the caret is past an edge. Wired into the textarea `onChange` (plain typing/Enter) **and** into
   `apply`'s rAF (programmatic edits: list continuation, @-mention insert, pasted/dropped images).
2. **"Add action" prepends.** `addAction` in `quick-log-dialog.tsx` now does `[makePendingAction(),
   ...prev]` so the new composer row lands at the top, right under the button where it's easy to find.
   Saving is key-based (`reconcileActions` dedups by row key), so row order is purely cosmetic.

**Verification caveat:** `npm run prepush` halts on the **pre-existing** tsconfig `baseUrl` deprecation
(TS5101 — newer TS in this container, present on the untouched tree too); confirmed the two edited files
type-check clean via `tsc --ignoreDeprecations 6.0` (exit 0). Client-only, no schema/backup impact.
Mobile (390px) not visually re-tested — a scroll nudge + a list-order flip, no layout change.

### What Was Just Completed — Action reminders: weekday/weekend default time + forgiving time entry (2026-06-30)

Two owner asks for the action **Time (optional)** field, **schema-free**, pushed to `main` (`4a42849`).
1. **Default reminder time is now 8:00 AM weekdays / 10:00 AM weekends** (was a flat 09:00), chosen by
   the due **date's weekday**. New `defaultReminderTime(dueDate)` lives in **both** the server
   (`server/src/lib/push.ts`, used by the cron's `reminderDueInstant` — replaced `DEFAULT_REMINDER_TIME`)
   and the client (`client/src/lib/action-time.ts`, drives the "Remind me (defaults to …)" hint, which
   now shows the right time for the picked date). Weekday read via `getUTCDay()` on the `YYYY-MM-DD` parts
   (calendar weekday is tz-independent). **Note:** this changes existing reminders that rely on the
   implicit time (notify on, no `dueTime`) from 9 → 8/10 — intended.
2. **Forgiving free-text time input** (fixes the screenshot bug where the native `<input type="time">`
   rejected partial entries like "9a" with a "Please enter a valid value" popup). New
   `client/src/components/time-input.tsx` (`TimeInput`) replaces the native time input on both action
   surfaces (the full action form **and** the inline `ActionDateSelect` popover). Backed by
   `parseTimeInput` in `action-time.ts`: a bare hour assumes **:00** minutes and an `a`/`p` suffix sets
   AM/PM — "9"→9:00 AM, "9a"→9:00 AM, "2:30p"→2:30 PM, "1400"→2:00 PM, "12a"→12:00 AM; blanks clear;
   unparseable input flags the field (red border) instead of a browser popup. Shows the value back in
   friendly "9:00 AM" form on blur. The meeting-log start-time field (`quick-log-dialog.tsx`) was left on
   the native input — out of scope (this was an actions ask).

Client typecheck (with the pre-existing tsconfig `baseUrl` deprecation bypassed — newer TS in the fresh
container) and the backup-coverage guard both green; the server `tsc` couldn't run (npm registry
`ECONNRESET` in this container blocked installing server deps), but the server edit is pure date
arithmetic with **no new imports** — verified its logic + the parser with a standalone Node test (25
cases incl. weekend/weekday boundaries and invalid input, all pass). Vercel build is the real gate.
**Mobile (390px) NOT visually re-tested** — it's a single text input swap.

### What Was Just Completed — Meetings list: time-aware sort + "Upcoming" flag + "Hide upcoming" toggle (2026-06-29 s3)

Three **schema-free** owner asks for the `/meetings` **list** view, each pushed to `main` on its own commit.
1. **Time-aware Date sort** (`131a503`): sorting by date now breaks ties on `startTime` so same-day
   meetings order by time of day — server `orderBy: [{date},{startTime}]`. SQLite/libsql ranks a NULL
   `startTime` as smallest (first asc / last desc) → untimed meetings behave as start-of-day, no `nulls`
   clause needed. (`startTime` is zero-padded "HH:MM", so string ordering is correct.)
2. **"Upcoming" indicator** (`131a503`, rule refined in `bbdaccd`): future meetings get a sky
   left-border + an "Upcoming" pill (dot **and** label → not color-only, PWA-safe). `isUpcomingMeeting` =
   future date, OR today with a `startTime` still ahead of now, OR today & untimed & before **5 PM ET**
   & nothing written up yet (`summary`/`notes`/`nextSteps`; **prep notes excluded**, they're pre-meeting).
   "Now" is computed in **America/New_York** (`easternNowParts`, DST-aware) since meeting dates/times are
   stored ET — not the browser zone.
3. **"Hide upcoming" toggle** (`070a651`): a Switch by the sort control (added the missing shadcn
   `client/src/components/ui/switch.tsx`; unified `radix-ui` pkg was already installed), persisted
   `?hideUpcoming=1`, list-view only. Filtering is **server-side** so the paged `total`/`hasMore` stay
   correct — the client sends its ET `today`+`now`; the server's `notUpcomingClause` is the **exact
   complement** of `isUpcomingMeeting` (traced all four buckets), so it hides precisely the flagged set.
   Skips the filter if `today`/`now` are missing/malformed (no server clock guess).

Client+server typecheck, `prepush` (backup guard — 32 tables), and full client `vite build` + server `tsc`
all green. **Mobile (390px) NOT visually re-tested this session** — the changes are a border accent, a small
pill, and a header Switch (controls row made `flex-wrap` so it wraps on narrow screens); no dialog/layout
changes, so low-risk, but eyeball it if convenient.

### What Was Just Completed — Duplicate dismissals + auto-merge now persist (2026-06-29 s2)

Owner reported that **dismissed duplicate matches kept coming back** (on a return visit / another
device), and asked for two new behaviors: a once-dismissed pair should **stay dismissed when it
recurs via a fresh import**, and **"combine ABC-D into ABC" should auto-apply to future imports** of
either name. **SCHEMA** (2 new tables, Turso **DDL applied by owner**), pushed to `main`.

- **Root cause:** dismissals lived only in browser `localStorage`, keyed by **row id** → never synced
  across devices, never matched a reimport's new ids.
- **Fix:** new **`DismissedDuplicate`** (`type`,`nameKey1`,`nameKey2`) + **`DuplicateMergeRule`**
  (`type`,`removedKey`,`keptKey`) tables, **keyed by normalized name** (so decisions survive a
  reimport). `POST /api/duplicates/[companies/]dismiss` persists dismissals; the merge endpoints
  record a merge rule. The scan (`GET /api/duplicates[/companies]`) now returns `{ pairs,
  autoMergedCount }`: a pair matching a **merge rule auto-merges** (reimported "ABC-D" folds into
  "ABC" via the extracted `runContactMerge`/`runCompanyMerge`); a pair matching a **dismissal is
  hidden**; client toasts auto-merges.
- **Precedence (important):** **merge rules outrank dismissals** — the scan checks rules *before*
  dismissals, and a merge **deletes any stale dismissal** for the pair (intent "ignore"→"combine").
  (The first cut had this backwards and would have *hidden* reimported pairs instead of merging them;
  caught in self-review and fixed.)
- Both tables added to **both backup paths** (guard now sees **32** tables); also fixed two earlier
  build breakers (literal Unicode in regex → `\uXXXX`; a statement stranded outside its function).
- **Known design choices (surfaced to owner, not yet built):** auto-merge fires **lazily on
  Duplicates-page load** (no separate import-time hook); **merge rules are permanent with no
  review/revoke UI**. Revisit if the owner wants either.

### What Was Just Completed — Meeting-participant UX (2026-06-29)

Five owner asks for the Quick Log / meeting editor, **schema-free**, pushed to `main` (`ce9f306`; lockfile chore `c0abed3`).
1. **Create-on-add:** adding a participant (typed-in free text or pasted) now **creates the Contact immediately** (`handleParticipantsChange` POSTs `/contacts`, swaps free-text→id in place) instead of deferring to "Done" — it has an id at once.
2. **Click-through:** participant names in the editor are now **links to `/contacts/:id`** (flush + close the dialog on the way); meetings-list pills already linked.
3. **Contacts default sort** ("most-recently-updated on top") was **already correct** — verified live (create-via-API lands on top, then deleted; net-zero). No code change.
4. **Auto-cleanup:** a contact created via the participant field that's **removed again before gaining other info is deleted** (`autoCreatedParticipantsRef` per dialog session; `ConversationParticipant` is onDelete Cascade; matched/pre-existing contacts never tracked).
5. **Bulk paste:** paste an Outlook recipient list (`Name <email>; Name <email>; bare name`) into the Participants field → new **`POST /api/contacts/resolve-participants`** matches each by email (primary/`additionalEmails`, case-insensitive) → exact name → else creates (CONNECTED/NETWORK). `MultiCombobox` gained opt-in `onBulkPaste` (intercepts only `;`/newline/`<email>`-shaped pastes); ids merged deduped, new ones tracked for auto-cleanup, toast summarizes "added / already in contacts / new". Verified the endpoint live (create, in-paste dedup, name-match, case-insensitive email-match) with all test rows deleted after. Typecheck (client+server) + full client `vite build` + `prepush` backup guard green.

Known small edge: a **name-only** paste written "Last, First" with no email won't match a "First Last" contact → creates a new one (emails sidestep it).

### What Was Just Completed — Contact company-sort and Idea deep-links (2026-06-28)

Owner reported two UX bugs, both fixed and pushed to `main`.
1. **Contact Sorting by Company:** The Contacts list `sortBy === 'company'` was broken because the display company is dynamically resolved (`company.name ?? companyName`). Fixed in `server/src/routes/contacts.ts` by checking if the sort is 'company', and if so, fetching all unpaginated matching contacts, computing the display name in JS (unified lowercase comparison, pushing empties to the end), and then paginating the sorted array.
2. **Idea Deep-Linking from Global Search:** Clicking an idea in `/search` just took the user to the `/ideas` homepage. Added support for `/ideas?id=N` deep-linking. Updated `search.tsx` and `command-palette.tsx` to link with the param. In `idea-list.tsx`, read the param on mount, auto-expand the target idea, and scroll it into view. Added a temporary visual highlight (`ring-2 ring-primary` or similar via Tailwind `highlightedId` state) so it's obvious which card was targeted even if the description is short. Fixed a bug where `useRef` was incorrectly passed a lazy initializer function.



### What Was Just Completed — Backup coverage fix: `Series` + `IdeaTag` were missing (2026-06-25)

Owner asked to confirm backups (automated **and** manual) still fully restore everything after the
recent additions. Audited all **32 Prisma models** against both backup enumerations — the server
`buildExport` (cron→Vercel Blob + `/export`) **and** the browser-direct Turso `TABLES_PARENT_FIRST`
(plus the matching `/import` + `importViaTurso` restore orderings). They covered only **28 of 30**
user-data tables. **Two tables shipped after the list was last touched and were silently omitted:**
- **`Series`** (recurring-meeting series; `Conversation.seriesId → Series.id`). A restore into a fresh
  DB lost all series names and left conversations with a dangling `seriesId` → under FK enforcement
  that **aborts the entire restore transaction**.
- **`IdeaTag`** (tags-on-ideas junction). Ideas silently lost their non-legacy tag links on restore.

Fix (`2dcd3b8`, **schema-free** — both tables already exist in Turso, no DDL): added both to the
browser-direct list (`Series` before `Conversation` so inserts stay FK-safe + the reverse deletes it
after; `IdeaTag` after Idea+Tag), to the server export, and to the `/import` delete+insert ordering;
bumped backup `_meta.version` 6→7 in both paths. Also added `notify`/`owedByMe`/`archived` to
`/import`'s `BOOLEAN_FIELDS` (booleans added since) so a browser-export → local-dev import doesn't
trip Prisma validation. **`PushSubscription`** (device keys) + **`DeletedSnapshot`** (undo stack) are
confirmed *deliberately* excluded as ephemeral. Verified against local SQLite: all 30 user tables
accounted for, 0 unaccounted-for. Typecheck (client+server) + full client `vite build` green.

> **Standing invariant (now auto-enforced):** any **new Prisma model** that holds user content MUST be
> added to **both** backup paths (`server/src/routes/backup.ts` export + `/import`; `client/src/lib/backup.ts`
> `TABLES_PARENT_FIRST`) — parent-before-child for inserts. Only `PushSubscription` + `DeletedSnapshot`
> are exempt. **A guard now enforces this:** `server/scripts/check-backup-coverage.mjs` (in `npm run prepush`
> **and** the Vercel `build:vercel`) parses the schema + all three enumerations and **fails the build** if a
> model is uncovered — so this can no longer be silently forgotten. Add new models to the backup, or to the
> guard's `EXEMPT` set.

### Previously Completed — Time-of-day auto-enables "Remind me" (2026-06-24)

Tiny owner ask, **schema-free, pushed to `main`.** Picking a time of day on an action now defaults
its **"Remind me"** reminder to **ON** — implemented in both editing surfaces: the inline
`ActionDateSelect` popover (`updateTime`) and the full action form's time `<Input>`. Auto-enables only
when `notify` is currently off (won't fight a deliberate later toggle-off within the same edit), and
runs the same `ensurePushForReminder()` device-subscribe + Settings-fallback toast as the manual bell.
Toggle-off still works; clearing the date still drops time+notify. Runbook note added to
`.planning/ACTION-REMINDERS.md`. Typecheck (client+server) + full client `vite build` green.


### What's Next

1. **No carried-over primary task** — the just-completed session was itself a bug-fix session (duplicate
   auto-merge, see above), not a continuation of plan work. *Long-standing optional* leftovers, still
   open from a much older (2026-06-24) merge bug-fix session: **(a)** re-attach the merged
   **"Seth Glickman"** to the meeting he lost (the pre-fix merge cascade-deleted his participant link)
   — reopen that meeting → add him; the picker now refreshes so he's selectable. **(b)** a one-off
   **audit/repair of *earlier* contact merges** that may have similarly lost
   `ConversationParticipant`/`ActionContact` links or orphaned `ConversationMention`s — not run
   (forward-fix only). Action reminders are feature-complete + live; opt-in extensions (snooze,
   reminders for no-due-date actions, a Settings "test notification" button) stay unbuilt until asked.
2. Plan of record is **`.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+)**. Check the **"⏳ Waiting on
   owner"** block — **D5/D6/D8/D9**. Phase 3 (stakeholder intel) is gated on D8/D9; Phase 4 (Copilot
   AI ingest) on D5/D6. Don't push on those until the owner raises them.
3. **Option B (when wanted):** attendee auto-fill via Microsoft Graph or Power Automate — implement a
   second `CalendarProvider`; nothing downstream changes.
4. **@-mention follow-up (optional):** add a command-palette entry for the Mentions page. (Prep-note
   `@` and org `@` are now done.)

### Carry-over items (lower priority)

1. **[USER ACTION]** Set `SENTRY_DSN` / `VITE_SENTRY_DSN` in Vercel to activate error tracking.
2. NCQA adaptation plan: Phase 3 (blocked D8/D9) / Phase 4 (D5/D6).
3. Stray empty `server/dev.db` / `server/test.db` (gitignored) safe to delete locally.
4. **"Recently updated" merge-bump** fix is forward-only — meetings a *past* contact-merge already
   stamped stay near the top; a one-off reset would also wipe genuine edit timestamps, so confirm
   criteria first.
5. **`updatedAt` under-bumping:** `Conversation.updatedAt` only bumps on edits to the meeting
   row/junctions, not isolated child-record edits (prep note / attachment). Bump it in those routes
   if "Recently updated" should float a meeting on those too.
6. **Mixed `updatedAt`/`createdAt` text formats in the DB** (some rows `...Z`, some `...+00:00`, some
   `YYYY-MM-DD HH:MM:SS`) — left as-is; the concurrency guard no longer cares (compares in app code).
   But **don't add exact `DateTime` equality `where` filters** on those columns (range `gte`/`lt` is
   fine); see the CLAUDE.md gotcha. A one-off normalize-to-`+00:00` is possible later but unneeded.

### Open Bugs / Known Caveats

- **Non-issue (closed): "perpetual browser busy-spinner" was NOT the app.** Owner reported a
  never-stopping loading cursor after the tags-in-search work; suspected a Turso query hang. Ruled
  out: local dev reproduces nothing (`readyState: complete`, zero pending/looping requests; SW is
  active in dev too). Owner then isolated it — the spinner tracks with **VS Code being open** and
  **persists with the browser fully closed** (Task Manager-confirmed). So it's a local VS Code /
  agent-harness artifact (debug-driven Chrome / MCP / extension activity), **not SearchBook and not
  the search change**. No code change. Don't re-chase this as an app bug.
- **⚠ The committed Turso rw token in `server/.env` is STALE (hard 401).** Use the Turso web SQL
  console for DDL.
- **⚠ `prisma db push` local-path gotcha — NOW ALSO IN `CLAUDE.md`** (promoted 2026-07-13 after a
  **third** consecutive session lost time to it; `CLAUDE.md` is auto-loaded every session, this file
  is not). From `server/`, `db push`/`db execute` resolves `file:./dev.db` to the stray empty
  `server/dev.db`, not the populated `server/prisma/dev.db` the server opens — it reports "in sync"
  and changes nothing the app reads, then every query 500s with *"column X does not exist"*.
  **Verified fix:** pass the file explicitly —
  `npx prisma db push --url "file:C:/dev/personal/searchbook/server/prisma/dev.db"` (Prisma 7 flag).
  Delete any `server/dev.db` that appears; it is never the real database. The dual-mode libsql
  migration script pattern (`server/scripts/archive/`) remains the fallback.
- **Meetings "Now" marker can't light up locally:** the local `dev.db` has **0 meetings with a
  `startTime`** (and none from the Outlook import), so seed a timed meeting to exercise it. Existing
  *imported* meetings in production have `endTime = NULL` (the import is skip-only by design) and fall
  back to the assumed 60-min duration — **a backfill of end times for them is an open option the owner
  has not requested.**
- **Unpicked `@…` in global search is searched as literal text** (finds noise). The guided path —
  picking from the `@` dropdown — clears it. Owner told; offer to make an unpicked `@…` match nothing
  if it becomes annoying.
- Run `tsc -b` / full `vite build` (not just `npm run prepush`) before every push — it catches
  unused imports the typecheck misses.
- Dev smoke: server 3001, client 5173. The local app has `APP_PASSWORD` unset → seed any non-empty
  `localStorage.searchbook_password` ('devlocal' works) to pass the login gate. Device-emulation
  `390x844` gives a true mobile viewport.

### Working branch

`main` tip is the **2026-07-10 s2** session: **`83c6a8a`** — Ideas now show **created + last-updated**
(new nullable `Idea.updatedAt @updatedAt`, the one **SCHEMA** change; **Turso DDL applied by owner**;
list/card footer shows "Created … · Updated …" only on a different-day edit, both exact times in the
tooltip) — plus this docs commit. **⚠ No held commits; the Turso DDL is already applied** (`Idea.updatedAt`
exists in Turso). Before it, the **2026-07-10** session (`059618b`): meeting-log **document links**
(a real `Link`-model feature — the one **SCHEMA** change this session: `Link.conversationId` + FK
cascade; **Turso DDL applied by owner**), **series name as the meeting title** plus a fix so a
**series-only meeting saves**, a **blue combobox dropdown highlight**, and the removed **Title
suggestions dropdown**. Commits `407e22c` (batch 1: highlight + series-display + drop-suggestions +
a since-reverted inline link button) → `d0ea327` (links reshaped into the shared `Link` model +
undo cascade) → `059618b` (series-only save fix). See the top "What Was Just Completed" entry.
**⚠ No held commits; the schema change's Turso DDL is already applied** (`Link.conversationId`
column exists in Turso). Before it, the **2026-07-07 s2** session (**schema-free, no Turso DDL, no held
commits**): a meetings-page **"Upcoming only" filter** (the Hide-upcoming Switch became a three-way
All / Hide upcoming / Upcoming only Select; server gained the complementary `onlyUpcoming` param) and
**new actions defaulting to due today** with a clearable X (New Action form, command palette, Quick Log
follow-up composer). Before it:
**`ab13a09`** — the **2026-07-07** action ownership quick-switch session
(**schema-free, client-only, no Turso DDL, no held commits**): `e2f5a63` (new
`client/src/components/action-owner-select.tsx` popover on dashboard rows + `dashboard.tsx`
waiting-sink sort) → `f70886c` (docs) → `ab13a09` (same popover on the `/actions` list page —
desktop "Ownership" column + mobile inline trigger — with its docs folded in). Before it:
**`f1bb55d`** — the **2026-07-06** meeting-log dialog polish (wider default `sm:w-[52rem]` +
Ctrl-click a participant name keeps the log open; **schema-free, client-only, no Turso DDL, no held
commits**). Before it: the **2026-07-04** docs/handoff commit on top of **`28fb55a`** — the meeting-search
read-only detail view + its "Edit meeting" fix (`182885e` feat → `28fb55a` edit-button; schema-free,
client-only, no Turso DDL). Before it, the tip was the **2026-07-03** docs/handoff commit on top of
**`63cc211`** — the weekday-only-recurrence feature (**SCHEMA**: `Action.recurringWeekdaysOnly`; **Turso DDL
applied by owner**). That closed the
2026-07-03 batch: `6646c88` (dashboard priority-pill/idea-width/input-outline) → `8035c08` (pills inline
+ combobox outlines) → `02c29b8` (hide `OTHER` type pill) → `876d3fc` (carry reminder onto recurrences,
schema-free) → `63cc211` (weekday recurrence). All pushed straight to `main`; the schema commit was held
until the owner confirmed the DDL. **⚠ No held commits / no outstanding DDL now** (the column exists in
Turso). Before this batch, `main` tip was **`18a698f`** — the s5 picker-ranking / toolbar-less-markdown /
Edge-highlight work above (`3391b43` the three features + `18a698f` the Edge highlight fix; both
client+server, **schema-free, no Turso DDL**, committed straight to `main`). Before it, a docs commit
(`abbe88e`, s4 handoff) on top of
**`033673e`** — the meeting-notes scroll-bar-flicker fix (`[scrollbar-gutter:stable]`, client-only,
schema-free; developed on `claude/meeting-notes-scroll-flicker-9lopxu`, fast-forwarded in).
Before it: the series prep-notes reuse feature (3 commits `ef46ee0` →
`5c66d4e` → `d0fcadb`), on top of two docs commits (`5a39094` handoff refresh, `3ddb4b0` backup-schema
reference) and the two duplicate-auto-merge fixes (round 1 `4112a85`, round 2 `2109fac`, on top of prior
tip `d712012`). The prep-notes work was committed straight to `main` (schema-free, owner's standing
permission). The duplicate-merge rounds were developed on the task-assigned branch
`claude/org-merge-dedup-issues-ddtn2r`, fast-forwarded into `main` at the owner's request both rounds;
that branch is kept in sync (identical history to `main`) — fine to delete or ignore. **Schema-free**,
no Turso DDL outstanding, no held commits.

**Known gaps left deliberately out of scope this session** (surfaced while fixing the above, not bugs
in what shipped): **(a)** the creation-time merge-rule check (`resolveExistingCompanyByName` /
`POST /companies/resolve`) only exists for **companies** — an analogous "merge two contacts, then create
a new contact whose name was the removed one" would still create a fresh duplicate contact immediately
(it *would* still get auto-merged on the next Duplicates-page visit, since the scan-level
`applyMergeRules` fix covers contacts symmetrically — this gap is creation-time only). Build the contact
equivalent if the owner hits this. **(b)** The standalone **"Add Company"** page and the org `@`-mention
**"Create organization"** button still don't consult merge rules — left alone on purpose since those are
deliberate "make a new company" actions, not implicit name resolution; revisit if that assumption proves
wrong in practice.

Prior to that, `main` had: meeting-log polish **(caret-stays-in-view + new-actions-on-top)** (`a34f6aa`,
client-only), action reminders weekday/weekend default time + forgiving time entry (`4a42849`), meetings-list
time-aware sort + Upcoming flag + Hide-upcoming toggle (`070a651`), meeting-participant UX (`ce9f306`).

---

### Suggested kickoff prompt for the next session

Durable version (works every session — it defers to the docs, which stay current):

> Start a SearchBook session: read `AGENTS.md` and follow its "Session start" steps, then summarize
> where we left off and what's next before doing anything.

Context for *this* upcoming session specifically: the most recent session (**2026-07-10 s2**) was a
single **owner UX ask** — the Ideas list/cards now show **both created and last-updated** dates. It
added the missing `Idea.updatedAt` (nullable `@updatedAt`, the one **SCHEMA** change — **Turso DDL
applied by owner**) and a shared `renderTimestamps()` that shows "Created {date}" always plus a dimmed
"· Updated {date}" only on a different-day edit, with both exact timestamps in the hover tooltip
(`83c6a8a`). Nothing pending. Before it, the **2026-07-10** session was four
**owner UX asks** for the meeting log — a real **document-Links feature** on meetings (shared `Link`
model; `Link.conversationId` + FK cascade — the one SCHEMA change, **Turso DDL applied by owner**;
managed in the Quick Log "Tags, prep notes, attachments & links" section, chips in the detail dialog
+ list cards, undo-cascade wired); **series name as the meeting title** with a fix so a **series-only
meeting saves** (server `hasWho` + client validation now count `seriesId`); a **blue combobox
dropdown highlight** (matches the `@`-mention picker, replaces the Edge-invisible `bg-accent`); and
**removing the meeting Title suggestions dropdown**. Four commits (`407e22c` → `d0ea327` → `059618b`
+ docs); the link add→cascade→undo flow, blue highlight, and series-only save were driven live in
Chrome DevTools MCP. **Nothing pending — no held commits, the Turso DDL is applied.** Before it
(**2026-07-07 s2**) was two owner UX asks — the `/meetings` list "Upcoming only" filter (three-way
Select, `?when=` param, server `onlyUpcoming` = exact NOT of the hide clause) and **every new action
defaults to due today** (all three creation surfaces; ghost-X clear on form + palette). Before it (**2026-07-07**):
**owner UX asks** for the actions workflow — a new inline **ownership quick-switch popover**
(`ActionOwnerSelect`: hand an action off to a linked contact / searched contact / "someone — no name",
or take it back, all in 1–2 clicks, driving the existing `owedByMe`/`owerContactIds` model — no schema
change) on **both the dashboard rows and the `/actions` list page**, and **untimed "waiting on someone
else" items now sink to the bottom of the dashboard Today + Overdue lists**. Schema-free, client-only,
live on `main` (`e2f5a63` → `ab13a09`); verified in-browser desktop + 390px mobile; nothing pending.
Also fixed the drifted local `server/prisma/dev.db` via `prisma db push --url` (see caveats). Top
"What Was Just Completed" entry above; `SESSION-HISTORY.md` 2026-07-07. Before it (**2026-07-06**):
two small **owner UX asks** for the Quick Log / meeting editor — the dialog's **default width** widened to
`sm:w-[52rem]` (matching Ideas), and **Ctrl/Cmd-clicking a participant name** now opens that contact in a new
browser tab **without closing the meeting log** (so you can document about the person while continuing to
document the meeting); a plain click still navigates + closes as before. Schema-free, client-only, live on
`main` (tip `f1bb55d`); nothing pending. Top "What Was Just Completed" entry above; `SESSION-HISTORY.md`
2026-07-06. Before it (**2026-07-04**) was a single **owner UX ask** — meeting results in **global search**
now open a **read-only expanded detail view** (full notes + prep notes + next steps + related chips, fetched
via `GET /conversations/:id`) with the **search term(s) highlighted** inside the rendered markdown, and an
**"Edit meeting"** button that opens the canonical Quick Log editor for that specific meeting
(`useQuickLog().openEdit`). Schema-free, client-only (`182885e`→`28fb55a`); `SESSION-HISTORY.md` 2026-07-04.
Before it (**2026-07-03**) was a batch of
small **owner UX asks** plus two action-recurrence fixes — dashboard pill declutter (HIGH-only priority,
hide `OTHER` type, pills inline to the right of the name), wider idea dialog, darker form-field/combobox
outlines (Edge visibility), **reminder now carried onto recurring occurrences** (was silently dropped after
the first fire), and **weekday-only recurrence** (new `Action.recurringWeekdaysOnly` — the one **schema**
change; Turso DDL applied by owner). Top "What Was Just Completed" entry above; `SESSION-HISTORY.md`
2026-07-03. Live on `main` (tip = a docs commit on `63cc211`), **nothing pending, no outstanding DDL.**
Before it (2026-07-02 s5): a bundle of three small owner UX enhancements — relevance-ranked
participant/@-mention pickers (engagement-primary), toolbar-less markdown in the contact documentation
boxes, and an Edge @-mention-highlight visibility fix (schema-free, `18a698f`). Earlier the same day: an s4
scroll-flicker fix, an s3 series-prep-notes
feature, and a two-round **bug-fix session** (via a GitHub task) chasing
the duplicate-org auto-merge feature — full detail in its "What Was Just Completed" entry above and
`SESSION-HISTORY.md` 2026-07-02 (both entries). Short version: round 1 found
merge rules silently never got recorded when two names shared a normalized core key (the single most
common real-world dup shape); round 2 (owner tested live, still broken) found the Duplicates-page
fallback never even *considered* a rule unless the heuristic similarity scan also flagged the pair as a
candidate — so an acronym merged into its spelled-out name ("NCQA" → "National Committee for Quality
Assurance (NCQA)") was invisible to the whole system — and that nothing consulted merge history at
company-creation time at all, across **6** different client call sites. Both schema-free, both live on
`main` (tip `2109fac`). Two known, deliberately-scoped-out gaps are noted in "Working branch" above — check
those before assuming a related report is a new bug. Plan of record is `.planning/NCQA-ADAPTATION-PLAN.md`
(Phase 3+, gated on the "⏳ Waiting on owner" block, D5/D6/D8/D9) — untouched this session.
Nothing is pending (no Turso DDL, no held commits).
