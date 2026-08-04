# NETLIFY-MIGRATION-PLAN — migrate SearchBook off Vercel to Netlify

**STATUS: Phase 0 (spike) ✅ · Phase 1 (env-gated code) ✅ · Phase 2 (first parallel deploy) ✅ — the
app is LIVE on `ari-search-book.netlify.app` alongside Vercel, sharing the Turso DB, all on branch
`claude/netlify-migration-plan-8lim9k` (NOT `main` — Vercel stays the daily driver until Phase 5).
Six Netlify-runtime bugs found & fixed during bring-up (see Phase 2 RESULTS), plus five more during the
soak (#7–#11, §5). **Phase 3 is COMPLETE — gate GREEN as of 2026-07-26**: the whole §5 checklist is
owner-verified on desktop and iPhone, the one exception being push reminders, which Phase 3 structurally
*cannot* test (VAPID unset on Netlify by design → Phase 5) and which is an accepted carve-out rather than
an open bug. **Phases 4 AND 5 are COMPLETE (2026-07-26).** Phase 4: 307/307 blobs copied to Netlify Blobs,
all 218 DB rows rewritten to relative paths — so **images are broken on Vercel and it must not be used**.
Phase 5: both crons repointed to Netlify on cron-job.org (reminders cut to **every 5 minutes** — see
Appendix A R10), push verified end-to-end to the iPhone, 5 stale subscriptions deleted, and the branch
merged to `main`. **NEXT UP: Phase 6** (§8 — decommission Vercel, after a few normal days). ⚠ Two carry-overs:
**repoint Netlify's production branch to `main`**, and **do not delete the Vercel Blob store** while the
`--undo` rollback is still wanted.** Written
2026-07-21 after live network testing proved that NCQA's web proxy **blocks `*.run.app` (Google
Cloud Run) but allows `*.netlify.app`**, while Vercel access is granted only by exception and is
being revoked. This **supersedes `VERCEL-EXIT-PLAN.md`** (Cloud Run) as the migration target of
record. Cloud Run is off the table *for this user* because its default domain is unreachable at work.

**Two hard requirements from the owner (2026-07-21), baked into the phase order:**

1. **Zero-downtime parallel run.** The Vercel app must stay **fully usable** as the daily driver
   right up until Netlify is *proven* to work end-to-end. Every code change is additive and
   env-gated so the *same commit* deploys to Vercel (unchanged) **and** Netlify simultaneously.
   Nothing that breaks Vercel happens until the final cutover (Phase 4), and even that is reversible
   until the Vercel Blob store is deleted (Phase 6).
2. **Test the likely failure points before doing much work.** Phase 0 is a throwaway de-risk spike
   that empirically settles the three make-or-break unknowns *before* we port a single real route.
   If Phase 0 fails, we've spent an hour, not a week.

**Audience:** a future coding agent executing this with the owner available for the few
human-only steps (Netlify signup, dashboard clicks, reading env values, per-device PWA reinstall).

---

## 0. Decision record

### Why Netlify (empirical, 2026-07-21)

| Platform | Domain | Status at NCQA | Verdict |
|---|---|---|---|
| Vercel (today) | `searchbook-three.vercel.app` | Works **by exception only**; IT plans to block it | ❌ Being revoked |
| Cloud Run | `*.run.app` | **Blocked** (intercepted cert / HSTS hard-fail) | ❌ Unreachable at work |
| **Netlify** | `*.netlify.app` | **Works, no exception** (proven via `howzeverything.netlify.app`) | ✅ **Target** |

Decisive detail: `run.app` and `netlify.app` are **both** on the HSTS-preloaded `.app` TLD, yet one
is blocked and one isn't — so the block is a **vendor/category** decision (Cloud Run's domain is a
known abuse vector many proxies block by default), not a TLD or policy-wide thing. Netlify sits in an
allowed category today. **Residual risk:** "allowed today" ≠ "allowed forever." If IT is
systematically tightening, Netlify could be next. Mitigation options in Appendix B — but note the
migration itself is cheap to repeat, and the code changes here are host-portable (relative asset
paths, plain Express) so a *third* move would be far easier than this one.

### Architecture: what changes vs. what stays

| Concern | Today (Vercel) | Target (Netlify) |
|---|---|---|
| Frontend (static SPA) | Vercel CDN + `vite` | Netlify static publish (`client/dist`) + SPA redirect |
| API (Express) | `api/index.ts` wraps `server/src/app.ts` via `@vercel/node` | **One catch-all Function** wraps the *same* `app.ts` via `serverless-http`; redirect `/api/*` → function |
| Photos / attachments | Vercel Blob, **absolute public URLs** stored in DB | **Netlify Blobs** (private) + Express proxy routes, **relative** `/photos/…` `/files/…` paths |
| Auto-backup writes | Vercel Blob `backups/` | Netlify Blobs `backups/` + authenticated download proxy |
| Reminders cron (every min) | cron-job.org → `/api/cron/reminders` | **Unchanged** — cron-job.org just repoints to the Netlify URL |
| Daily backup cron (08:00 UTC) | `vercel.json` cron | cron-job.org job 2 (or Netlify Scheduled Function) |
| Database | Turso (libsql) | **Unchanged** — works identically |
| Web Push (VAPID) | env vars | **Unchanged** — env vars move |
| LinkedIn AI parse (OpenAI) | server-side, needs 15–25 s (Vercel `maxDuration: 30`) | ⚠ **The one hard problem** — see §0.1 and Phase 0.3 |

Note SearchBook is **already host-agnostic** in the ways that matter: the client calls a **relative**
`API_BASE = '/api'` (`client/src/lib/api.ts:1`), Turso is reached over plain HTTPS, and the backend is
a plain Express app. That's why this is a smaller migration than the Cloud Run plan was.

### 0.1 The one hard problem: the LinkedIn parse vs. Netlify's 10 s function cap

**Netlify's synchronous function timeout is 10 seconds on the free plan** (and still 10 s on the $9
Personal plan; 26 s only on Pro at $20/mo). **Background Functions (15 min) are Pro-only.**
([timeout](https://answers.netlify.com/t/increasing-timeout-from-10-seconds-to-26-seconds/163253),
[background = Pro](https://docs.netlify.com/build/functions/background-functions/))

The LinkedIn profile parse (`server/src/routes/linkedin.ts`, `gpt-4o-mini` via
`openai.chat.completions.create`) is explicitly exempted from the app's own 12 s timeout because "AI
model calls can take 15-25s" (`server/src/app.ts`). So on Netlify free it **will be killed at 10 s**.
Even Pro's 26 s is uncomfortably close to the 25 s worst case, so **paying doesn't reliably fix it.**

Every *other* endpoint finishes in well under 10 s (the app already enforces a 12 s ceiling on all
non-LinkedIn `/api` routes), so this is the **only** route with a timeout problem. Candidate fixes,
in recommended order — Phase 0.3 tests them before we commit:

- **(A, recommended) Move the OpenAI call browser-side.** The single user stores *their own*
  OpenAI key in `localStorage` (like the app password), and the browser calls `api.openai.com`
  directly (`new OpenAI({ apiKey, dangerouslyAllowBrowser: true })`). No Netlify function is in the
  path, so the 10 s cap is irrelevant, and it stays **free**. The key lives only in the owner's
  browser, never in the bundle or server. **New risk it introduces:** the browser must reach
  `api.openai.com` **from the work network** — which NCQA may block. Phase 0.3 tests exactly that.
- **(B) Keep it server-side but fit under 10 s.** Trim the prompt / cap output tokens / stream and
  stop early. Unreliable for full profiles (measured 15–25 s); treat as a fallback only.
- **(C) Accept graceful degradation.** In the CMO/NCQA era the app is stakeholder-management, not
  job-search, so LinkedIn import is a minor feature. Fallback: do LinkedIn imports from a personal
  device (off the work network), where option A works even if OpenAI is blocked at work.
- **(D) Netlify Pro ($20/mo, 26 s).** Breaks the "free" requirement and still risks the 25 s case.
  Last resort.

**This decision is the main output of Phase 0** — do not build the real migration until it's settled.

### What the owner must provide (agent cannot do these)

1. A **Netlify account** (free) and, for the migration script in Phase 4, a **Netlify personal
   access token** + the **site ID** (dashboard).
2. Access to the **Vercel dashboard** to read current env values (§2 checklist) and later decommission.
3. A **fresh Turso auth token** if the committed one is stale (it is — see CLAUDE.md).
4. Their **own OpenAI API key** (already exists as `OPENAI_API_KEY`) if we go with option A.
5. ~10 min/device post-cutover: reinstall the PWA, re-enter the password, re-enable push (origin
   changes, so all per-origin state resets).

---

## 1. Risk register — every likely failure point, and where it's tested

| # | Risk | Why it might fail | Tested in |
|---|---|---|---|
| R1 | **Netlify Function unreachable at NCQA** | Static netlify.app is proven, but the `/.netlify/functions/*` path could be categorized differently | Phase 0.1 |
| R2 | **LinkedIn parse > 10 s timeout** | Free cap is 10 s; parse needs 15–25 s (§0.1) | Phase 0.3 |
| R3 | **`api.openai.com` blocked at work** (only if fix A) | Orgs often block AI endpoints; browser-direct needs it reachable | Phase 0.3 |
| R4 | **Prisma engine won't bundle on Netlify** | esbuild drops the Rust query-engine binary → "could not locate the Query Engine" | Phase 0.2 |
| R5 | **Turso unreachable / slow from Netlify Lambda** | Different egress than Vercel; cold-start + libsql handshake | Phase 0.2 |
| R6 | **Netlify Blobs can't serve images** | Blobs have **no public URL** — every read needs a function proxy | Phase 0.4 |
| R7 | **Bundle too large / cold start too slow** | Lambda limits: 50 MB zipped / 250 MB unzipped; Prisma+deps are heavy | Phase 0.2/0.5 |
| R8 | **Response too large** | Lambda caps response at ~6 MB (big backup export) | Phase 0.5 |
| R9 | **Express path prefix mangled by the redirect** | `/api/*` → function rewrite may strip `/api`, breaking all route mounts | Phase 0.1 |
| R10 | **Free compute quota** | Every-minute cron ≈ 43k invocations/mo — may be a large slice of the free budget | Phase 0.5 + Appendix A |
| R11 | **Cron can't trigger the function** | Auth/URL/method mismatch | Phase 0.6 |

Sources for the platform limits: [Netlify functions overview](https://docs.netlify.com/build/functions/overview/),
[Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/),
[serving uploads via Blobs](https://developers.netlify.com/guides/user-generated-uploads-with-netlify-blobs/),
[Prisma → Netlify deploy](https://www.prisma.io/docs/orm/prisma-client/deployment/serverless/deploy-to-netlify),
[Prisma module bundlers](https://www.prisma.io/docs/orm/prisma-client/deployment/module-bundlers).

---

## 2. Phase 0 — De-risk spike (THROWAWAY; do this first, ~1–2 hrs)

Goal: settle R1–R11 with the **least possible code**, on a **separate throwaway Netlify site**, using
a **scratch Turso database** (or read-only against prod — never write). Nothing here is merged. If a
test fails and can't be worked around, **stop and report** — the migration is not viable as-is.

Setup: `mkdir netlify-spike/` outside the app (or a scratch repo). One `netlify.toml`, a few tiny
functions. `npm i -g netlify-cli`; `netlify login`; `netlify init` a new site (owner picks a name →
`searchbook-spike-xxxx.netlify.app`). Deploy with `netlify deploy --build --prod`.

### 0.1 Function reachability + path prefix (R1, R9)

A function that echoes the path Express would see:

```js
// netlify/functions/ping.js
exports.handler = async (event) => ({
  statusCode: 200,
  body: JSON.stringify({ ok: true, path: event.path, rawUrl: event.rawUrl }),
});
```

`netlify.toml`:
```toml
[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/ping/:splat"
  status = 200
```

- **On the owner's work laptop/browser**, open `https://<spike>.netlify.app/api/health` → expect the
  JSON. ✅ = R1 passes (functions reachable at work). ❌ block page → **STOP**, Netlify functions are
  filtered (unlikely given static works, but this is the whole ballgame — test it first).
- Inspect the returned `path` — decide whether Express (routes mounted at `/api/...`) will see the
  right prefix. If the rewrite strips `/api`, the real function (Phase 1) prepends it before handing
  to `serverless-http` (`event.path = '/api' + event.path`). Record the exact shape here.

### 0.2 Prisma + Turso from a function, engine-less (R4, R5, R7)

The current generator uses the **classic Rust engine** (`prisma.config.ts` → `engine: "classic"`;
CLAUDE.md notes a `query_engine-windows.dll.node`). The clean fix for serverless bundling is to
generate **engine-less** — Prisma 7 + the libSQL **driver adapter** can run with **no Rust binary**
(`engine: "client"`), which sidesteps R4/R7 entirely.

Spike test:
1. Copy `server/prisma/schema.prisma` + `server/src/db.ts` into the spike.
2. Set the client engine (test both `prisma.config.ts` `engine: "client"` and, if needed, the
   generator `engineType`/preview flag current for Prisma 7.5). `npx prisma generate`.
3. Function that runs one real query against a **scratch** Turso DB:
   ```js
   // netlify/functions/dbcount.js
   const prisma = require('./_db').default; // engine-less client + PrismaLibSql
   exports.handler = async () => {
     const n = await prisma.contact.count();
     return { statusCode: 200, body: JSON.stringify({ n }) };
   };
   ```
4. Deploy; hit `/.netlify/functions/dbcount`.
   - ✅ Returns a count → R4+R5 pass, engine-less works, bundling is trivial.
   - "could not locate the Query Engine" → engine-less didn't take. Fallback: keep the classic
     engine and bundle the **Linux** binary via `netlify.toml`:
     ```toml
     [functions]
       node_bundler = "esbuild"
       included_files = ["server/src/generated/prisma/*.node", "server/src/generated/prisma/schema.prisma"]
     ```
     and ensure `prisma generate` runs on Linux in the Netlify build. Re-test.
5. Note cold-start time from the function logs (informs R7). Confirm the built function zip is well
   under 50 MB (`netlify` build output prints sizes).

### 0.3 LinkedIn parse: timeout reality + the fix (R2, R3) — **the decision-maker**

Two measurements, both from the **work network**:

1. **Server-side reality:** a function that calls `gpt-4o-mini` with a representative (trimmed)
   profile, timing the call. Deploy, invoke, read the duration.
   - If it *consistently* finishes < ~8 s → option B is viable, keep it server-side. (Unlikely.)
   - If it exceeds 10 s / gets killed → confirmed R2, need option A/C.
2. **Browser-direct reachability (option A):** a one-page static test in the spike that does
   `new OpenAI({ apiKey, dangerouslyAllowBrowser: true }).chat.completions.create(...)` with a key
   the owner pastes into a field. Open it **on the work laptop**.
   - ✅ Returns a completion → option A works at NCQA. **This is the win** — free, no timeout.
   - ❌ CORS error / blocked / timeout → `api.openai.com` is blocked at work. Fall back to option C
     (LinkedIn import from a personal device) and document the limitation.

**Output:** a decision — A, B, or C — recorded at the top of Phase 1.

### 0.4 Netlify Blobs: write, read, serve, render (R6)

```js
// netlify/functions/media.js  — proxy read (Blobs have NO public URL)
const { getStore } = require('@netlify/blobs');
exports.handler = async (event) => {
  const name = event.path.split('/').pop();
  const store = getStore('media');
  const buf = await store.get(`photos/${name}`, { type: 'arrayBuffer' });
  if (!buf) return { statusCode: 404, body: 'not found' };
  return {
    statusCode: 200,
    headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' },
    body: Buffer.from(buf).toString('base64'),
    isBase64Encoded: true,
  };
};
```
- A tiny upload function `put`s a test image to Blobs; then load `/photos/<name>` in the browser
  (redirect `/photos/*` → `media`) → image renders. ✅ = R6 passes.
- Confirm it renders **on the work laptop** too.
- Confirm Netlify Blobs is usable on the **free** tier for this account.

### 0.5 Size + quota sanity (R7, R8, R10)

- **Response size:** note that the large full-backup path is **browser-direct** already
  (`client/src/lib/backup.ts` via `/api/backup/credentials`), so it bypasses the function — the 6 MB
  Lambda response cap only threatens `/api/backup/export` if the UI ever calls it for the full DB.
  Confirm the UI's "download" path and that no single function response exceeds ~5 MB.
- **Quota:** confirm the account's current **free compute budget** (Netlify has moved toward a
  credit model — verify the 2026 numbers) and check that ~43k/mo reminder pings + human traffic fit.
  If tight, the reminders cron can drop to every 2–3 min (Appendix A) at a small cost to reminder
  precision.

### 0.6 Cron trigger (R11)

From the owner's cron-job.org account, add a **test** job hitting
`https://<spike>.netlify.app/api/cron/reminders?key=<secret>` every minute against the spike; confirm
200s in Netlify function logs. (Keeps our existing external-cron approach; no dependency on Netlify's
scheduler.) Delete the test job after.

### Phase 0 gate

All of R1–R11 pass or have a confirmed workaround, **and** the §0.1 LinkedIn decision is made.
Tear down the spike site (or keep it parked). **Only then** proceed to Phase 1. If R1 or R4/R5 fail
with no workaround, Netlify is not viable — report and reconsider (Appendix B).

### ✅ Phase 0 RESULTS — EXECUTED & PASSED (2026-07-21)

Ran on a throwaway Netlify site (`ari-search-book.netlify.app`, scaffolding in `netlify-spike/`,
built from GitHub — no CLI), tested from the **NCQA work laptop**. **Gate is GREEN → Phase 1 is clear.**

| Risk | Result | Evidence |
|---|---|---|
| R1 reachable | ✅ PASS | `/api/health` returned JSON at work (no block page) |
| R9 path prefix | ✅ PASS | `incomingPath = "/api/health"` — **full `/api` prefix preserved**, so Express routes match with no rewrite fix. (Phase 1 uses `serverless-http` (classic `event.path`) — sanity-check the prefix there, but the redirect preserves the original path.) |
| R4/R5 Prisma + Turso | ✅ PASS | **engine-less** client (`engine:"client"`, no Rust binary) returned `contactCount: 509` in 838 ms against prod Turso |
| R6 Blobs | ✅ PASS | test image written → served via proxy → rendered at work |
| R7 cold start / bundle | ✅ PASS | sub-second query incl. cold start; `dbcount` graph bundles at **4.9 MB** via esbuild (≪ 50 MB) |
| R3 browser→OpenAI | ❌ **BLOCKED at work** (`Failed to fetch`) — **rules out option A** |
| R2 LinkedIn under 10 s | ✅ PASS → **option B** | The *function* reaches OpenAI fine (browser block is irrelevant server-side). A real 38k-char profile trims to ~8.8k and parses in **4.6–5.1 s** across 3 dense exec profiles — half the 10 s cap. The plan's feared 15–25 s doesn't occur because of the existing 30k-char trimming. |
| R8 response size | ✅ n/a | full-backup path is already browser-direct (`client/src/lib/backup.ts`), bypasses functions |
| R10 quota | ⏳ verify in Phase 2 | single-user; low-risk. Eyeball Netlify Usage & billing; drop reminders cron to 2–3 min if tight (Appendix A) |
| R11 cron trigger | ⏳ verify in Phase 2 | low-risk (functions proven reachable); `reminders.mjs` with secret gate is ready |

**Key surprise:** the Netlify **function egress reaches OpenAI even though the work browser cannot** —
so the fix is the *opposite* of the plan's guess: **not** browser-direct (A), but **keep it
server-side (B)**. And B needs **no prompt-tightening** — the existing route already fits under 10 s.

**LinkedIn decision (§0.1): → B (server-side, essentially unchanged). Option A is off the table
(OpenAI blocked at NCQA browser-side); C remains only as a graceful-degradation fallback.**

---

## 3. Phase 1 — Code changes (additive, env-gated; Vercel + local unchanged)

> **LinkedIn decision from Phase 0.3: → B (server-side, unchanged).** Implement that path in 3.6:
> keep the parse on the server (it fits under 10 s at ~5 s), no prompt-tightening needed, no
> browser-side move. Option A is ruled out (OpenAI blocked at the NCQA browser). See Phase 0 RESULTS.

Everything gates on a Netlify-only signal so the **same commit** still deploys to Vercel untouched.
Use `process.env.NETLIFY` (set automatically in the Netlify runtime) or an explicit
`STORAGE=netlify` env var as the gate. Local `npm start` behavior is unchanged (no gate set).

### 3.1 Storage abstraction — new `server/src/lib/storage.ts`
Wraps `@netlify/blobs` (`getStore('media')`) with `putObject/getObject/listObjects/deleteObjects`,
enabled when `netlifyBlobsEnabled()` (gate above). Bucket-equivalent is a private store; served only
through the proxy in 3.3. Install: `cd server && npm install @netlify/blobs serverless-http`.

### 3.2 Uploads — `server/src/routes/upload.ts`
Both POST handlers currently branch on `isProduction = !!process.env.BLOB_READ_WRITE_TOKEN`. Make each
a **three-way** branch, in order:
1. `netlifyBlobsEnabled()` → `putObject('photos/<suffix><ext>', buffer, mime)`, respond
   `{ path: '/photos/<suffix><ext>' }` (**relative** — matches local-dev format and the SW cache rule).
2. `BLOB_READ_WRITE_TOKEN` → existing Vercel Blob code, **untouched** (removed in Phase 6).
3. else → existing local-disk code, **untouched**.

### 3.3 Media proxy — new `server/src/routes/media.ts`
Express routes `GET /photos/:name` and `GET /files/:name` that stream from Netlify Blobs when the gate
is on (else 404). Mounted **outside** the `/api` password gate (mirrors today's public Blob URLs;
`<img>` can't send the password header). Filenames are `${Date.now()}-${rand}${ext}` — validate against
`/^[A-Za-z0-9._-]+$/`. Mount in `app.ts` after the dev-static block (~`server/src/app.ts:171`).

### 3.4 Auto-backups — `server/src/routes/backup.ts`
`GET /cron` and `GET /list`: add the `netlifyBlobsEnabled()` branch (write/list/prune `backups/` in the
`media` store or a dedicated `backups` store), keeping the Vercel branch. `/list` returns a **relative**
`url: '/api/backup/download/<name>'`. Add **`GET /download/:name`** (behind the `/api` password gate)
that streams the JSON from Blobs. (Same shape as the Cloud Run plan's §2.4.)

### 3.5 Backup download link — `client/src/pages/settings.tsx` + `client/src/lib/api.ts`
The Settings anchor `<a href={b.url}>` can't send `x-app-password` and Blobs are private. Add
`api.downloadBlob(path)` (authorized fetch → object URL) and, when `b.url` starts with `/api/`, render
a button that fetches + triggers download. Keep the plain-anchor branch for absolute URLs so **Vercel
still works** pre-cutover.

### 3.6 LinkedIn parse — implement the Phase 0 decision
- **If A:** add a Settings field to store the OpenAI key in `localStorage`; move the parse call into
  the client (`dangerouslyAllowBrowser: true`); keep the server route as a fallback for local/Vercel.
  Guard: never log the key; never send it to our server.
- **If B:** tighten the prompt/max_tokens server-side; verify < 8 s; leave routing as-is.
- **If C:** leave server-side; add a UI note that LinkedIn import needs a non-work network; ensure it
  fails gracefully (clear message, not a hung spinner) when the 10 s cap trips.

### 3.7 Function entry + config — new files
- **`netlify/functions/api.ts`** — wraps the existing app: `import serverless from 'serverless-http';
  import app from '../../server/src/app'; export const handler = serverless(app);` (+ the `/api` path
  prefix fix determined in 0.1).
- **`netlify.toml`** at repo root:
  ```toml
  [build]
    command = "npm run build:netlify"
    publish = "client/dist"
  [functions]
    node_bundler = "esbuild"
    # included_files only if Phase 0.2 needed the classic engine
  [[redirects]]
    from = "/api/*"
    to = "/.netlify/functions/api/:splat"
    status = 200
  [[redirects]]
    from = "/photos/*"
    to = "/.netlify/functions/api/:splat"
    status = 200
  [[redirects]]
    from = "/files/*"
    to = "/.netlify/functions/api/:splat"
    status = 200
  [[redirects]]
    from = "/*"
    to = "/index.html"
    status = 200
  ```
  (netlify.toml is **inert on Vercel** — Vercel ignores it — so this is parallel-run safe.)
- **`build:netlify`** in root `package.json`: install client+server deps, `prisma generate`
  (engine-less), `typecheck`, `check:backup`, build client, compile the function's TS. Mirror
  `build:vercel` but output the function too.

### 3.8 CORS — `server/src/app.ts`
`allowedOrigins` already honors `process.env.CLIENT_URL`; set that to the Netlify URL in Phase 2. No
code change required (add the netlify.app origin to the static list if convenient).

### 3.9 Phase 1 gate (all local — no Netlify needed yet)
1. `npm run prepush` passes (typecheck + backup-coverage).
2. `npm start` — local dev unchanged (disk uploads, photos render, LinkedIn parse works locally).
3. Prisma engine switch didn't break local (better-sqlite3 adapter still queries).
4. Commit to `claude/vercel-migration-plan-9d5ytl`. **Vercel auto-deploys and is unaffected** (all
   new code is dormant without the Netlify gate). Confirm the live Vercel app still works after deploy.

**Rollback:** revert the commit — every change is dormant without the gate.

### ✅ Phase 1 RESULTS — IMPLEMENTED (2026-07-22, branch `claude/netlify-migration-plan-8lim9k`)

All §3 code changes landed, additive and env-gated (`netlifyBlobsEnabled()` = `STORAGE=netlify`
or the runtime `NETLIFY` signal). LinkedIn = decision **B** → route left server-side, unchanged.

| § | Change | Files |
|---|---|---|
| 3.1 | Storage abstraction (`putObject/getObject/listObjects/listObjectsWithMeta/deleteObjects`, dynamic-imports `@netlify/blobs`) | `server/src/lib/storage.ts` (new) |
| 3.2 | Uploads three-way branch (Netlify Blobs → Vercel Blob → local disk); relative `/photos`·`/files` paths | `server/src/routes/upload.ts` |
| 3.3 | Media proxy `GET /photos/:name`·`/files/:name`, mounted at root outside the `/api` gate | `server/src/routes/media.ts` (new) + `server/src/app.ts` |
| 3.4 | Auto-backups Netlify branch on `/cron`+`/list`; new authed `GET /download/:name` | `server/src/routes/backup.ts` |
| 3.5 | `api.downloadBlob()` + Settings button for private `/api/...` backup URLs (anchor kept for Vercel) | `client/src/lib/api.ts`, `client/src/pages/settings.tsx` |
| 3.7 | Function entry (`serverless-http` wraps the same app) + `netlify.toml` + `build:netlify` | `netlify/functions/api.ts` (new), `netlify.toml` (new), `package.json` |
| 0.2 | Prisma switched to **engine-less** (`engine: "client"`) — no Rust binary to bundle | `server/prisma.config.ts` |

**Verified locally (Phase 1 gate):** `npm run typecheck` ✅, `npm run check:backup` ✅ (32 tables),
`npm run build --prefix client` ✅, engine-less `prisma generate` ✅, and a runtime smoke test of the
engine-less client against the **local better-sqlite3 adapter** (`SELECT 1` → `[{ok:1}]`) ✅ — so the
engine switch didn't break local. `@netlify/blobs` (server) + `serverless-http` (root) added;
`better-sqlite3`/`@prisma/adapter-better-sqlite3` externalized in `netlify.toml` (native, dev-only,
never runs on Netlify). Deps `npm install`ed but runtime upload/backup/media paths on Netlify are
first exercised in Phase 2 (owner-gated deploy).

**Deploy-branch note:** the actual working branch is `claude/netlify-migration-plan-8lim9k` (the
plan's older `claude/vercel-migration-plan-9d5ytl` references below mean this branch).

---

## 4. Phase 2 — Netlify provisioning + first parallel deploy

Vercel stays the live app throughout. Netlify comes up **alongside** it, sharing the **same Turso DB**.

1. **Owner:** create the Netlify site from the GitHub repo, set the production branch to
   `claude/vercel-migration-plan-9d5ytl` (deploy the migration branch, not `main`, until cutover — so
   `main`/Vercel keeps shipping normally). Record the `*.netlify.app` URL.
2. **Env vars** (Netlify dashboard → Site settings → Environment): copy from Vercel —
   `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `APP_PASSWORD`, `CRON_SECRET`, `REMINDERS_CRON_SECRET`,
   `OPENAI_API_KEY` (unless fix A moved it client-side), **`OUTLOOK_CALENDAR_ICS_URL`**,
   `APP_TIMEZONE` (optional; defaults `America/New_York`), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT`, `REMINDER_TZ`, `SENTRY_DSN` (if set). Set the storage gate (`STORAGE=netlify` or
   rely on `NETLIFY`). Set `CLIENT_URL=<netlify-url>`. **Do NOT set `BLOB_READ_WRITE_TOKEN`** (that
   would route Netlify to Vercel Blob).

   ⚠ **This list is the authority — do not rebuild it from `server/.env.example`.** The 2026-07-22
   soak surfaced "Outlook calendar not connected" on Netlify precisely because
   `OUTLOOK_CALENDAR_ICS_URL` was undocumented in `.env.example` and so never made the copy list.
   Both are now documented; if a *new* `process.env.*` read is added to the server, add it to both.
   Cross-check with: `rg -o 'process\.env\.[A-Z0-9_]+' server/src`.
3. Trigger deploy. 

### Phase 2 gate
- `curl <netlify-url>/api/health` → `{"status":"ok","db":"ok"}` (Turso reachable from Netlify).
- Browser: login works; contacts list loads; a contact detail renders. **Existing photos still render**
  (they're absolute Vercel-Blob URLs, untouched — good).
- Upload a **test** photo via Netlify → renders through the Blobs proxy (delete the test contact after).
- Settings → **Back up now** → appears in list, download works; confirm the JSON lands in Netlify Blobs.
- **Vercel app is still fully live and correct.**

**Rollback:** none needed — Vercel is untouched; Netlify is a parallel copy.

### ✅ Phase 2 RESULTS — DEPLOYED & PASSING (2026-07-22, `ari-search-book.netlify.app`)

Owner created the Netlify site (production branch = `claude/netlify-migration-plan-8lim9k`), set env
(`STORAGE=netlify`, `APP_PASSWORD`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `OPENAI_API_KEY`,
`CLIENT_URL`, `REMINDERS_CRON_SECRET`; **no** `BLOB_READ_WRITE_TOKEN`; VAPID + `CRON_SECRET` deferred
to Phase 5). Gate is **GREEN**: `/api/health` → `{"status":"ok","db":"ok"}`, auth gate 401s without
the password, SPA serves, Blobs media proxy reachable; owner confirmed in-browser login, contacts,
**photo upload + render**, paste, and the manual backup (JSON + notes.md + files.zip, correct sizes).

**Six Netlify-runtime bugs surfaced during first deploy and were fixed on the branch** (each was a
real-serverless / relative-path assumption Vercel never exercised):

| Symptom | Root cause | Fix |
|---|---|---|
| 502 `@prisma/client/runtime/client` missing | Function at repo root; Prisma/libSQL deps only in `server/node_modules`, and Netlify externalizes + resolves them from the function root | Hoist `@prisma/client`, `@prisma/adapter-libsql`, `@libsql/client` to root `package.json` |
| 502 `@libsql/linux-x64-gnu` missing | Native binding loaded via a dynamic require esbuild can't trace | Externalize `@libsql/client` + `@prisma/adapter-libsql` in `netlify.toml` |
| 502 `ENOENT mkdir /var/task/data/photos` | `upload.ts` created local dirs at import; Netlify FS is read-only | Guard the mkdir on `!isProduction && !netlifyBlobsEnabled()` |
| 500 on `/photos/*` | serverless-http uses the Lambda signature → Netlify Blobs context not auto-injected | `connectLambda(event)` in the function entry (shared `@netlify/blobs` instance via `lib/netlify-blobs-context.ts`) |
| Images served corrupted | serverless-http utf8-encodes responses unless told a type is binary | Pass a `binary` content-type allow-list to serverless-http |
| Photo uploads never displayed (toast OK) | `import.meta.env.DEV ? photoFile : null` hid relative `/photos` paths in prod (Vercel-era assumption) | Render relative paths in prod (`photo-upload.tsx`, `contact-detail.tsx`) |

**Open before/at later phases:** VAPID + cron unset on Netlify (Phase 5); soak upload-path caveat
(relative paths render on Netlify only — §5); >~4.5 MB photos vs the ~6 MB base64 response cap
(normal photos are far under); free compute quota (R10) not yet eyeballed.

---

## 5. Phase 3 — Parallel soak (owner uses both; Vercel remains daily driver)

Run both for a few days. **Keep doing real work on Vercel**; exercise Netlify as a shadow. Because the
DB is shared, records made on either appear on both.

⚠ **One caveat during the soak:** a photo/attachment uploaded *via Netlify* is stored with a **relative**
path in the shared DB, so it renders on Netlify but **not** on the Vercel deployment (Vercel prod
doesn't serve `/photos`), and vice-versa for Vercel uploads (absolute Blob URLs render everywhere).
So during the soak, either (a) keep uploads on Vercel (the daily driver), or (b) treat Netlify uploads
as disposable test data. All non-binary data is fully shared and safe. This resolves at cutover (Phase 4).

Work the full checklist (§5.5 of the Cloud Run plan applies verbatim) on the Netlify origin, desktop +
one mobile: login/401, contacts CRUD+filters, contact detail, photo/logo upload, meetings
(participants, orgs, attachment up/down, prep notes), actions (recurring → next occurrence + reminder),
**push reminder arrives**, LinkedIn import (per the Phase 0 decision), calendar ICS fetch, undo delete,
Settings backups (server + browser-direct), PWA install/offline/update. Watch `[TIMING]` logs.

**Gate:** every feature verified on Netlify from the work network; no regressions; timings normal.

### ⏳ Phase 3 — IN PROGRESS (soak running; branch `claude/netlify-migration-phase-3-tggjko`)

- **Deployment health re-verified from the internet (2026-07-22):** Netlify `/api/health` →
  `{"status":"ok","db":"ok"}` (function + Turso + engine-less Prisma all live), `/api/contacts` 401s
  without the password (auth gate intact); Vercel (daily driver) still healthy and untouched. The
  human/work-network parts of the §5 checklist (login, CRUD, photo upload+render, meetings, actions,
  push, LinkedIn, PWA on desktop+mobile) remain owner-driven and are the actual soak.
- **Phase 4 cutover scripts pre-written & syntax-checked (NOT run):**
  `server/scripts/migrate-blobs-to-netlify.mjs` and `server/scripts/rewrite-blob-urls.mjs` now exist
  so cutover is unblocked the moment the soak passes. Neither touches prod until the owner runs it in
  the Phase 4 window. The migrate script stamps each copied object with `{ contentType, size,
  uploadedAt }` metadata — parity with what the runtime reads (media proxy needs `contentType`; the
  backup list needs `size`/`uploadedAt`).
- **Soak bugs found & fixed on-branch (2026-07-22 – 07-23), deployed by fast-forwarding the build
  branch `claude/netlify-migration-plan-8lim9k` up to the phase-3 tip:**
  1. **Outlook import failed: "could not read the Outlook calendar feed" (Netlify runtime bug #8).**
     Microsoft returned **HTTP 500** to the `.ics` fetch (our route then 502s to the browser). *Not* a
     stale value / firewall block (that's 403) / timeout / throttle — the same URL works from Vercel and
     a 30-min wait didn't clear it. **Root cause: the malformed `User-Agent` `'Mozilla/5.0 SearchBook'`**
     — Microsoft's edge accepts it from Vercel's egress but bot-filters it (500) from Netlify's
     datacenter IP. Fixed with a real browser UA, plus a single 5xx retry and logging of Microsoft's
     `x-ms-diagnostics`/body on failure. **Owner confirmed the import works on Netlify after deploy.**
     (`baf26fc`, `server/src/lib/ics.ts`.) ⚠ This would have been a *real* outage post-cutover, not a
     shadow one — the soak caught it.
  2. **Rate limiting silently disabled (Netlify runtime bug #7).** Function logs showed
     `ERR_ERL_UNDEFINED_IP_ADDRESS`: `req.ip` is undefined under serverless-http (the Lambda event has no
     socket address, so `trust proxy` has nothing to read), so express-rate-limit keyed **every** request
     to one `undefined` bucket — removing the per-IP throttle that sits in front of the password gate.
     Requests still succeeded, so nothing looked broken. Fixed by resolving the client IP from
     `x-nf-client-connection-ip` (Netlify) / `x-forwarded-for` (Vercel) / `req.ip` (local). (`eabbef7`,
     `server/src/app.ts`.)
  3. **`OUTLOOK_CALENDAR_ICS_URL` (+ `APP_TIMEZONE`) missing from the env checklist.** Undocumented in
     `server/.env.example`, so Phase 2's "copy from Vercel" list never included them → "Outlook calendar
     not connected" on Netlify. Owner set `OUTLOOK_CALENDAR_ICS_URL`; both now documented and the Phase 2
     list marked authoritative (§4.2). (`8ad7fa6`.)
  4. **Global search intermittently timed out (Netlify runtime bug #9) — DEPLOYED 2026-07-23, awaiting
     owner live confirmation.** On the shadow app a fresh global search ("karen") timed out on the first
     try(ies) then worked on a manual retry; "Providence" was slow-but-worked; the same query on Vercel
     worked (slowly). **Root cause: Netlify free's hard 10 s function cap.** Global search is the one
     ordinary endpoint that can exceed it when the Lambda is cold/idle-thawed — its Turso connection is
     dead, so the search's multi-query fan-out fails its whole first wave and `db.ts` `runWithRetry`
     rebuilds the client and retries the wave (doubling the round-trips), occasionally past 10 s. Netlify
     then kills the function and returns a **502** — NOT the app's own retryable 504, which never fires
     (the 12 s app-timeout in `app.ts` loses the race to the 10 s cap). The client only auto-retried
     500/504/'timed out', so the 502 didn't self-heal → the user had to retry by hand. **Vercel's 30 s
     cap masks it** (its 12 s app-504 fires and the client retries → "slow but works"). Corroborated live:
     even a single-`SELECT 1` `/api/health` took ~3-4 s cold, so a 7-query fan-out + rebuild-retry easily
     tops 10 s. Two parallel-run-safe fixes (**Vercel/`main` behavior unchanged**), `05d1368`, deploy
     branch ff'd `baf26fc..05d1368`: **(client, `client/src/lib/api.ts`)** GET auto-retry now covers
     transient 5xx (500/502/503/504), so a cold 502 self-heals on the automatic retry against a now-warm
     instance (covers the search page + command palette); **(server, `server/src/app.ts`)** fire the
     app's own 504 at **9 s** when `process.env.NETLIFY` is set (the signal `storage.ts` already uses),
     beating the 10 s 502 and giving a clean message — 12 s stays on Vercel; warm requests (~1-3 s)
     unaffected. `prepush` + full `npm run build` green; verified deployed (new bundle `index-h7Ztfbze.js`
     carries the `502,503,504` retry marker; `/api/health` 200). ⚠ **The FIRST cold hit is still slow
     (~10-13 s: one killed attempt + a warm retry)** — the durable cure is a **keep-warm ping** (a free
     cron-job.org ping to `/api/health` every few min to keep the Lambda + Turso connection warm),
     deferred to Phase 5 cron; offered to owner, not yet wired. Owner has **not** yet confirmed the live
     self-heal (idle the app ~2 min, then search "karen" fresh → should render on its own, no manual retry).
     **→ CONFIRMED RESOLVED by the owner 2026-07-26.** ⚠ **RECURRED 2026-07-28 — see bug #12 (§8.5).**
     The self-heal above treated the symptom: it retried a request that was structurally too big for a
     10 s runtime. Two days of real use on the phone (where the retry also ran out of budget) brought it
     straight back. #12 splits the fan-out so each entity group is its own request; *that* is the fix, and
     this entry is only the mitigation that preceded it.
  5. **Clicking a meeting attachment opened the DASHBOARD instead of the file (Netlify runtime bug #10).**
     Uploading worked; the chip's link didn't. **Root cause: the PWA service worker's SPA
     navigate-fallback.** `vite-plugin-pwa` generates
     `new NavigationRoute(createHandlerBoundToURL("index.html"))` with **no denylist**, so *every*
     top-level navigation is answered with the precached app shell. An attachment link is a relative
     `/files/<name>` **navigation**, so the SW served `index.html`, React Router matched nothing, and
     `App.tsx`'s `<Route path="*" element={<Navigate to="/" replace />} />` redirected to the dashboard —
     the file was never requested. `<img src="/photos/…">` was unaffected (image requests aren't
     `mode: 'navigate'`), which is exactly why photos looked fine and only *attachments* broke.
     Fixed with `navigateFallbackDenylist: [/^\/api\//, /^\/photos\//, /^\/files\//]` in
     `client/vite.config.ts`; verified compiled into `dist/sw.js`. Pending attachment chips (uploaded but
     the DB row not yet created) were a plain `<span>` — now the same link. ⚠ **Needs the SW update to
     activate** (`registerType: 'prompt'` → accept the refresh prompt; on iOS fully close the PWA first).
     **Netlify-only in practice** — Vercel stores absolute cross-origin Blob URLs, which the SW never
     intercepts, and the dev-mode PWA uses `navigateFallbackAllowlist: [/^\/$/]` so only `/` falls back.
     Not a routing problem: `curl /files/x.jpeg` on Netlify correctly returns the media proxy's 404.

  6. **Opening an attachment in the installed PWA stranded the app (Netlify runtime bug #11).** Immediately
     after the #10 fix: attachments open correctly on Netlify desktop, but in the iPhone PWA the file opened
     with **no way back — the owner had to force-close the app.** Root cause is the *other* half of the same
     relative-path consequence: iOS standalone mode has **no browser chrome, no tab bar and no back
     button**, so a same-origin navigation replaces the app with the file. Fixing #10 (so the file actually
     loads) is what exposed this.
     ⚠ **The first attempt did not work and was replaced — record it so nobody retries it:** giving
     non-image attachments the **`download` attribute** in standalone mode. The theory was that iOS would
     raise its save sheet instead of navigating. **It ignores `download` there** — the owner re-tested and
     was trapped again on a PDF. `target="_blank"` is equally useless (standalone has no second tab to open
     into).
     **The rule that holds is NEVER NAVIGATE**, for *every* attachment type. Final shape:
     `client/src/lib/attachments.ts` marks each attachment link `data-attachment-view` +
     `data-attachment-kind`, and the app-wide overlay (`components/media-lightbox.tsx`, renamed from
     `note-image-lightbox.tsx` since it is no longer notes-only) intercepts the click on the capture phase:
     **images** render inline with the existing zoom (on every platform — it beats a bare browser tab), and
     **non-images** render an `<iframe>` preview plus an explicit **Save** button that hands the file to
     `navigator.share({ files })` — Web Share Level 2, the one route that reliably gets a file out of an
     iOS PWA — falling back to a blob-URL `<a download>` on desktop. Non-images are only intercepted
     **when `isStandalone()`**; in a browser tab they keep the plain new-tab behavior, which is better
     there and always has a way back. The `href` (and `download`) stay on the anchor as a no-JS fallback.
     Escape is deliberately over-provisioned — X, backdrop tap, Close button **and** Esc — because a PWA
     has neither an Esc key nor a back button.
     Also fixed a **latent bug in the overlay itself**: a Radix modal `Dialog` sets `pointer-events: none`
     on `<body>`, and the overlay renders outside the dialog at the app root, so it inherited the block and
     could only be dismissed with **Esc** — which the PWA cannot press. Added `pointer-events-auto`;
     **confirmed live in Chrome** (`body` computes `none`, the overlay computes `auto`, backdrop click
     closes it, and the Quick Log dialog is still open underneath).
     The two byte-identical attachment blocks in `meetings.tsx` and `meeting-detail-dialog.tsx` were
     extracted to `components/attachment-chips.tsx` so this behavior lives in one place.
     **Verified before deploy** (local dev, disposable image+PDF attachments on meeting 451, all test rows
     and files removed after; DB back to its baseline 1 attachment / 348 meetings): the branch matrix
     unit-checked across type × display-mode; the image overlay opens with a decoded 120×60 image and does
     not navigate; the same chip works from **inside** the Radix dialog; and with `display-mode: standalone`
     emulated, the PDF is intercepted (`kind=file`, no `target`) and opens the preview + Save card — checked
     at **390 px**.

#### Phase 3 gate scorecard (owner-verified from the work network unless noted)

| §5 checklist item | Status |
|---|---|
| Login / 401 → re-prompt | ✅ |
| Contacts list (filters, search, sort), contact detail | ✅ |
| Photo upload on a contact; company logo | ✅ |
| Meetings: create/edit, participants, orgs, prep notes, attachment **upload** | ✅ |
| Meetings: attachment **download/open** | ✅ desktop **and** iPhone PWA (bugs #10 + #11 fixed, owner-confirmed 2026-07-26) |
| Actions: create, recurring → next occurrence, ownership switch | ✅ |
| Reminder push arrives | ⛔ **cannot be tested in Phase 3** — VAPID unset on Netlify by design; first exercised at Phase 5. Structurally deferred; does **not** gate Phase 4 |
| LinkedIn import (decision B, server-side) | ✅ |
| Calendar / ICS fetch | ✅ (bug #8 fix confirmed live) |
| Undo delete | ✅ |
| Settings backups: manual backup **and restore** | ✅ (+ the full offline restore drill, 2026-07-26) |
| PWA install, mobile layout | ✅ iPhone |
| Global search timings normal / self-heal | ✅ (bug #9 confirmed resolved) — ⚠ but it **recurred on the phone 2026-07-28**; structurally fixed as bug #12 (§8.5). A green tick here meant "self-heals", not "fits the budget" |

### ✅ Phase 3 COMPLETE — gate GREEN (2026-07-26)

Every §5 checklist item above is owner-verified from the work network, desktop **and** iPhone. The single
exception is **reminder push**, which Phase 3 structurally *cannot* test — VAPID is deliberately unset on
Netlify until Phase 5, so a reminder set on Netlify is serviced by Vercel's cron. That is an **accepted
carve-out, not an open bug**, and it does not gate Phase 4; push gets its first real exercise at cutover
(§7 step 4), which is why that step includes an explicit end-to-end reminder test.

Ten Netlify-runtime bugs were found and fixed across bring-up and soak (#1–#6 in Phase 2 RESULTS, #7–#11
above). At least two — the Outlook `User-Agent` bot-filter (#8) and the attachment/service-worker pair
(#10, #11) — would have been **real outages after cutover** rather than shadow ones. The soak paid for itself.

**→ Phase 4 is clear to run.** It is the point of no return, and its own prerequisites are already
retired: both scripts are written, the URL rewrite has been rehearsed against a scratch DB, and a full
offline restore drill recovered 238/238 binaries. The only thing missing is the four credentials in §6.0.

#### Keep-warm ping — DEFERRED to Phase 5 by the owner (2026-07-26)

Cold `/api/health` measured **3.37 s on Netlify vs 0.38 s on Vercel** (2026-07-26), so the cold-start tax
behind bug #9 is real even after the self-heal. **The owner declined to wire a temporary keep-warm during
the soak**, on the correct reasoning that Phase 5 solves it anyway: repointing the every-minute reminders
cron to Netlify pings `/api/cron/reminders`, which warms the same function and the same libSQL connection.
So **no separate keep-warm job is needed at all** unless the free compute quota (R10) forces reminders down
to every 2–3 min — in which case add the job below at 5 min. Until Phase 5, expect the first hit after an
idle period to take ~3–13 s on Netlify; the bug #9 self-heal makes it slow rather than broken.

Config if it is ever wanted: **mechanism = cron-job.org** (already the project's cron,
already proven against Netlify per R11, observable execution history, and **1 invocation per tick** — a
Netlify Scheduled Function would cost 2, since the scheduler runs in a *separate* function that must then
HTTP-ping the `/api` one to warm it, and Netlify's docs emphasise `@hourly` as the shortest *named*
interval, which would be useless here).
**GET `https://ari-search-book.netlify.app/api/health` every 5 minutes**, no auth header —
`/api/health` is deliberately exempt from both the password gate (`app.ts:183`) and the rate limiter
(`app.ts:151`), and it runs `SELECT 1`, so it warms the Lambda **and** the libSQL connection (the thing
that actually caused #9). ~8,640 invocations/month.

---

## 6. Phase 4 — Migrate binaries + rewrite DB URLs (point of no return)

⚠ After the URL rewrite, photos render on Netlify but appear **broken on Vercel**. Do this only after
Phase 3 is green, then proceed straight to cutover. Run at a quiet time.

**STATUS (2026-07-26): ✅ COMPLETE — executed end to end. Point of no return crossed.**

| Step | Result |
|---|---|
| Preflight (all 3 credentials proven) | Vercel Blob 307 objects, single host `sv1nlcmvomldhzg3.public.blob.vercel-storage.com`; Netlify Blobs `media` write+delete OK; Turso reachable |
| Pre-rewrite survey (all 106 text columns) | 218 rows across `Contact.photoUrl` (198), `Conversation.notes` (18), `Action.description` (1), `ConversationAttachment.url` (1) — **matches the earlier rehearsal exactly** |
| §6.2 copy | **307/307 copied, 0 fetch errors** (photos + files + full `backups/` history) |
| Pre-rewrite gate | 235 distinct blob paths referenced by the DB, **all 235 confirmed present** in Netlify Blobs before rewriting |
| §6.3 rewrite | **218 rows rewritten**, `Verified: no rows still reference the Vercel Blob host ✅` |
| Gate (live fetch from `ari-search-book.netlify.app`) | contact photo 200 image/png · attachment 200 · note-embedded image 200 · action-embedded image 200 · missing object 404 |

Two notes for the record:
- `Action.description` also held an embedded image — the all-text-columns sweep was load-bearing, not
  belt-and-braces. The "four known URL columns" framing below (and in `CLAUDE.md`) was never accurate:
  the third one is **`Conversation.photoFile`**, not `Company.photoFile`, which has no such column.
- A `.msg` attachment serves as `application/octet-stream` (no entry in the script's `CT_BY_EXT` map).
  That is correct behaviour — it downloads rather than renders — so it was left alone.

Rollback is still available until the Vercel Blob store is deleted in Phase 6:
`node server/scripts/rewrite-blob-urls.mjs sv1nlcmvomldhzg3.public.blob.vercel-storage.com --undo`

### 6.0 Prerequisites the owner must supply (the agent cannot obtain these)

Set them as env vars in the shell that will run the scripts — **do not paste them into chat or commit them.**

| Var | Where to get it | Used by |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | Vercel dashboard → Storage → Blob | §6.2 (read the source objects) |
| `NETLIFY_SITE_ID` | Netlify → Site settings → General → Site ID | §6.2 (write target) |
| `NETLIFY_AUTH_TOKEN` | Netlify → User settings → Applications → new personal access token | §6.2 (write target) |
| `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | Turso dashboard — **must be a FRESH token** | §6.3 (the URL rewrite) |

⚠ The Turso rw token committed (commented) in `server/.env` is **stale and returns a hard 401** — see
`CLAUDE.md`. Assume it will not work and get a new one.

Also decide the **timing**: nothing should be uploaded between §6.2 and §6.3, so pick a quiet window.

**Scale check (as of the 2026-07-26 audit): 235 of 238 binaries are still absolute
`…vercel-storage.com` URLs**, so the live Netlify app currently depends on Vercel Blob for its images.
That dependency is exactly what this phase removes. **Do not let the Vercel Blob store be deleted before
§6.2 has copied the bytes** — deletion is sequenced into Phase 6 (§8 step 2) for that reason.

1. **Safety net:** Settings → **Back up now** + download the full manual ZIP (includes binaries). Keep both.
   The ZIP is now a *usable* safety net, not just a copy: **`server/scripts/restore-binaries-from-zip.mjs`**
   replays its `manifest.json` back into the served `/photos/` · `/files/` paths. (Until 2026-07-26 nothing
   mapped ZIP entries — named after the source record, "Contact 42.png" — to the URLs the DB references, so
   a restore could rebuild every row and still show every image broken.) **Drill executed 2026-07-26 against
   a real Netlify backup: 238/238 binaries recovered and served with the cloud unreachable** — see
   `RESTORE-TEST-RUNBOOK.md` Option C.
2. **Copy every Vercel Blob object → Netlify Blobs** — script `server/scripts/migrate-blobs-to-netlify.mjs`
   **(written, Phase 3)** — uses `@vercel/blob` `list()` to read + `@netlify/blobs`
   `getStore({ name: 'media', siteID, token })` to write; copies `photos/`, `files/`, **and** `backups/`,
   stamping each with `{ contentType, size, uploadedAt }` metadata for runtime parity. Idempotent (skips
   objects already present). Env: `BLOB_READ_WRITE_TOKEN`, `NETLIFY_SITE_ID`, `NETLIFY_AUTH_TOKEN`.
   Record the Blob host it prints at the end.
3. **Rewrite URLs in Turso** — script `server/scripts/rewrite-blob-urls.mjs <BLOB_HOST>` **(written,
   Phase 3)** rewrites
   `https://<host>/photos/x` → `/photos/x` (and `/files/`) across **every text column of every table**
   (covers `Contact.photoUrl/photoFile`, `Conversation.photoFile`, `ConversationAttachment.url`, and
   markdown-embedded images in any notes column). Same script/approach as the Cloud Run plan §4.2,
   including the `--undo` emergency path and the "no ⚠ REMAINING" verification.
  **Rehearse it first:** the script now takes `--db file:/abs/path/to/scratch.db`, so the identical rewrite
  can be dry-run against a restored scratch SQLite DB before it touches Turso. Done 2026-07-26 (218 rows
  rewritten, "no ⚠ REMAINING") — worth repeating on the day, since this step is the point of no return.

**Gate:** no `⚠ REMAINING`; on Netlify a contact photo, a meeting attachment, and a pasted-image note
all render.

**Rollback (emergency, only before deleting Vercel Blob):** `rewrite-blob-urls.mjs <HOST> --undo`.

---

## 7. Phase 5 — Cutover: crons, monitors, devices

**STATUS: ✅ COMPLETE (2026-07-26).** Phase 4's gate is owner-verified: contact photo, meeting attachment
and pasted-image note all render on Netlify, plus deduplicate and global search.

Phase 5 close-out:

| Step | Result |
|---|---|
| 1. `main` points at Netlify | ✅ branch merged to `main`. ⚠ **Netlify's production branch still needs repointing** from `claude/netlify-migration-plan-8lim9k` to `main` in the UI |
| 2. Crons | ✅ `searchbook-alert` (reminders, `*/5 * * * *`) + `searchbook-backup` (daily 04:00 ET, Bearer header) both live and returning 200. Vercel's cron-job.org reminders job disabled; the Vercel-native backup cron in `vercel.json` still runs until Phase 6 |
| 3. Uptime monitor | ✅ no separate monitor existed; the 5-min reminders job with failure/auto-disable notifications serves the role, and doubles as the keep-warm |
| 4. Push | ✅ verified end-to-end to the iPhone (cron → Netlify → APNs). Desktop accepted by FCM (201) but not displayed — Windows-side |
| 5. Stale subscriptions | ✅ #1–#5 deleted after re-probing each one live; #6/#7 confirmed alive and kept |

**Carry-overs into Phase 6:** repoint the Netlify production branch; keep the Vercel Blob store until the
`--undo` rollback is definitively not wanted; watch the credit meter (Appendix A R10).

### 7.0 Netlify env vars that are MISSING and must be added first

Audited against the live Netlify env list on 2026-07-26. Present: `APP_PASSWORD`, `OPENAI_API_KEY`,
`OUTLOOK_CALENDAR_ICS_URL`, `REMINDER_TZ`, `REMINDERS_CRON_SECRET`, `STORAGE`, `TURSO_AUTH_TOKEN`,
`TURSO_DATABASE_URL`. Missing:

| Var | Why it matters | Consequence if skipped |
|---|---|---|
| `CRON_SECRET` | `/api/backup/cron` checks **only** `CRON_SECRET` for the `Bearer` path (`routes/backup.ts:166`) — it does *not* fall back to `REMINDERS_CRON_SECRET` the way `routes/reminders.ts:28` does | ⚠ **The daily automatic backup 401s and silently stops.** The safety net goes quiet with no error surfaced anywhere |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `lib/push.ts:14` — without them `/api/push/public-key` returns null | Push toggle hides itself ("Push isn't configured on the server yet"); step 4 below cannot be tested |

**Generate fresh values — do NOT try to copy them from Vercel.** On Vercel all three are classed
**Sensitive**, which is write-only: unreadable in the dashboard *and* not returned by `vercel env pull`
(so `vercel link` is pointless here). Nothing is lost by regenerating:

- **VAPID** — push subscriptions are scoped to an **origin**. Every existing subscription belongs to
  `searchbook-three.vercel.app` and can never serve `ari-search-book.netlify.app` whatever keys are used;
  step 4 below re-subscribes from scratch regardless. Generate with
  `node -e "console.log(require('web-push').generateVAPIDKeys())"` (web-push is already a server dep).
  Vercel keeps its own old keys, so its push keeps working untouched during the transition.
- **CRON_SECRET** — just a shared secret between cron-job.org and the app, and step 2 below re-enters the
  cron config anyway. Generate 32 random bytes; use the same value in the backup job's `Bearer` header.

**Netlify functions read env at deploy time, so trigger a redeploy after adding them** — then verify
`/api/push/public-key` returns non-null and `/api/backup/cron` accepts the Bearer token.

`SENTRY_DSN` / `VITE_SENTRY_DSN` remain unset on both platforms — a pre-existing standing follow-up, not
a cutover regression.

### 7.0b ⚠ Do the phone BEFORE the reminders cron — the step order below is wrong

`routes/reminders.ts:85-87` stamps `lastNotifiedAt` **even when delivery fails** (deliberate — it
prevents a permanent retry storm). Push subscriptions are **per-origin**, so a subscription made on
`searchbook-three.vercel.app` can never receive a push from the Netlify origin. Therefore:

> Repointing the reminders cron to Netlify while no Netlify-origin subscription exists causes every
> reminder that comes due in that window to be **silently consumed and never delivered** — no error
> anywhere, the reminder simply never arrives.

So run **step 4 (device re-subscribe) before step 2 (crons)**. Done in that order on 2026-07-26 and the
hazard never materialised. The two crons also must not both run: they share one Turso DB, so whichever
fires first stamps `lastNotifiedAt` and the other finds nothing — disable the Vercel jobs, don't just
add Netlify ones.

**Verified 2026-07-26 (post-redeploy):**

| Check | Result |
|---|---|
| Env vars live | All three present, `context=all`, `functions` scope, values match byte-for-byte (read back via the Netlify API) |
| `/api/backup/cron` + Bearer | **200** `{ok:true, tables:32, pruned:1}` — a real backup written to Netlify Blobs. **5.1 s of the hard 10 s function timeout** ⚠ watch as the DB grows |
| `/api/cron/reminders?key=` | **200** `{ok:true, due:0, sent:0}` — consumed nothing |
| Both, wrong secret | **401** ✓ |
| VAPID | Owner enabled notifications on desktop + iPhone from the Netlify origin; new `PushSubscription` rows #6 (fcm) and #7 (apple) created. Rows #1–#5 are stale vercel.app subs, to be deleted in step 5 |
| **Push end-to-end** | ✅ **Reminders cron → Netlify → APNs → iPhone buzzed** (test action #444, `{"ok":true,"due":1,"sent":1}`), confirmed twice — once via the cron, once via a direct per-device send |

**Per-subscription push probe (2026-07-26)** — sending to each row individually separates server-side from
device-side failure:

| Rows | Result |
|---|---|
| #6 fcm (desktop), #7 apple (iPhone) — Netlify-era | **201 accepted** |
| #1 #4 #5 apple — vercel-era | 400 `VapidPkHashMismatch` |
| #2 fcm — vercel-era | 403 credentials do not correspond |
| #3 wns — vercel-era | 401 |

Two findings worth keeping:

- **The desktop never showed its notification even though FCM returned 201.** The push left SearchBook
  correctly, so any remaining fault is Windows/Chrome-side (browser not running, Focus Assist, OS
  notification settings). The iPhone — the device that matters for reminders — works.
- ⚠ **The five dead subscriptions will never be auto-pruned.** `reminders.ts:80` prunes only on `'gone'`
  (404/410), but these fail 400/401/403, so they persist forever and cost five failing HTTP calls on every
  single reminder inside a 10 s function budget. Manual deletion (step 5) is not optional housekeeping.

### 7.0c Final cron-job.org configuration (as built, 2026-07-26)

cron-job.org holds **both** SearchBook jobs. Note the backup job was **not** previously here — it was a
Vercel-native cron in `vercel.json` (`{"path":"/api/backup/cron","schedule":"0 8 * * *"}`), so there was
nothing to "repoint" and it had to be created from scratch. That Vercel cron keeps writing daily backups
to Vercel Blob until the project is deleted in Phase 6; harmless, and a useful extra net during the soak.

| | `searchbook-alert` | `searchbook-backup` |
|---|---|---|
| URL | `https://ari-search-book.netlify.app/api/cron/reminders?key=<REMINDERS_CRON_SECRET>` | `https://ari-search-book.netlify.app/api/backup/cron` |
| Auth | key in query string | header `Authorization: Bearer <CRON_SECRET>` — **not** "Requires HTTP authentication" (that's Basic auth) |
| Schedule | **every 5 minutes (`*/5 * * * *`)** — see Appendix A R10 | `0 4 * * *` in America/New_York = 08:00 UTC |
| Save responses in history | on | on |
| Notify on failure | on, after **5** | on, after **1** |
| Notify on recovery | on | on |
| Notify on auto-disable | **on** | **on** |
| Notify on TLS expiry | off (Netlify auto-renews) | off |

**Why the failure thresholds differ, and why auto-disable is the important one:** cron-job.org disables a
job after **25 consecutive failures**. For the minutely reminders job that is 25 minutes — but for the
daily backup it is **25 days**, so a threshold of 1 there is what stops a month of silent backup failure.
Conversely a threshold of 1 on the minutely job would email on every transient blip: Netlify cold starts
measured 3.4 s and the first hit after idle reaches 10–13 s, against `app.ts`'s own 9 s self-504.

⚠ **Gotcha that actually bit (2026-07-26):** repointing `searchbook-alert` by editing only the *hostname*
and keeping the old `?key=` left it 401ing every minute — Vercel's and Netlify's `REMINDERS_CRON_SECRET`
are different values (41 vs 40 chars). It fails **silently**: cron-job.org logs a failure, the app logs a
401, and no reminder is delivered. Replace the **entire URL**, then verify with a live request. The
`onDisable` notification is the backstop that would eventually have surfaced it.

**No keep-warm job is needed** — see §5's keep-warm note; the every-minute reminders cron warms the same
function and libSQL connection. No separate uptime monitor was found to repoint; the minutely job plus its
failure notifications serves that role.

1. **Point `main` at Netlify.** Merge the migration branch to `main` (or repoint the Netlify site's
   production branch to `main`). Decide whether Vercel should keep building from `main` during the
   final soak or be paused — safest is to leave Vercel building but **stop using it**.
2. **cron-job.org:** repoint the every-minute reminders job to `<netlify-url>/api/cron/reminders?key=…`;
   add/repoint the daily 08:00 UTC backup job to `<netlify-url>/api/backup/cron`
   (`Authorization: Bearer <CRON_SECRET>`). Verify 200s in Netlify logs.
3. **Uptime monitor:** repoint to `<netlify-url>/api/health`.
4. **Push:** on the phone, install the PWA from the Netlify origin, log in, enable notifications, test a
   reminder due now+3 min. Then delete stale old-origin rows from `PushSubscription` (Turso web console).
5. **Per-device ritual:** finish any in-progress edit drafts on the OLD app first (drafts are
   `localStorage`, per-origin) → uninstall old PWA → install from Netlify → password → re-enable push.

**Gate:** full §5.5-style checklist green on the Netlify origin, desktop + mobile, from the work network.

---

## 8. Phase 6 — Decommission Vercel + cleanup (after a few normal days)

1. Confirm `backups/` history is in Netlify Blobs.
2. **Vercel dashboard (owner):** delete the Blob store; delete the project (removes the GitHub
   auto-deploy + old URL).
3. **Repo cleanup (one commit):** delete `api/index.ts`, `vercel.json`; remove `@vercel/node` (root)
   and `@vercel/blob` (server); remove `build:vercel`; strip the Vercel-Blob branches from
   `upload.ts`/`backup.ts` and the absolute-URL anchor in `settings.tsx`; update `server/.env.example`.
   Keep `check:backup` in the build.
4. **Docs (same commit):** update `CLAUDE.md` (URLs, Deploy line → Netlify, storage = Netlify Blobs via
   proxy, function timeout note + LinkedIn decision), `AGENTS.md` (session-end deploy step), and move
   `VERCEL-EXIT-PLAN.md` + this plan to `.planning/archive/`.
5. Delete the temp env-values file.

---

## 8.5 Post-cutover runtime bugs (found while living on Netlify)

7. **Global search hung on the phone and then silently blanked (Netlify runtime bug #12) — FIXED &
   OWNER-CONFIRMED 2026-07-28, `1c6d7c1` on `main`.** This is **bug #9 again, at its root.** The
   2026-07-23 fix (client auto-retry on 502/503, app-level 504 at 9 s) made a cold search *self-heal*;
   it did not make the request fit. Two days into normal use the owner reported from an iPhone that
   global search spun for several seconds and then just stopped, while the **contacts and meetings page
   searches kept working**. Nothing in the search code had changed since 2026-07-21 (`c7df6f3`) — the
   move to a 10 s runtime is what pushed it over.
   **Root cause: `/api/search` was the one endpoint that answered a query by fanning out across all
   eight scopes in a SINGLE function invocation** — six multi-table queries, each with nested relation
   loads plus a COUNT. That fit Vercel's 30 s and not Netlify's hard 10 s. The page searches survived
   because each is one narrow query. It compounded with a **silent failure**: `search.tsx`'s
   `catch {}` turned every error into `results = null`, so there was no message and no retry — exactly
   the "spinner that stops" the owner saw.
   **Fix (client-only; the server already accepted `scopes`, so matching/ranking/totals are unchanged —
   verified that the union of the six responses equals what the combined request returned):**
   - The search page issues **one request per entity group** (`SEARCH_GROUPS` in `pages/search.tsx`):
     people / orgs / meetings / @-mentions / actions / ideas. Every group gets the full 9 s budget, they
     run in parallel across invocations instead of sharing one, and results **paint as they land**.
   - A group that fails is **named on screen with its reason and a Retry** that re-runs only that group.
     "No results found" is withheld while anything is in flight or has failed.
   - A superseded search **aborts** its in-flight requests (`api.get(path, { signal })` →
     `AbortedError`, never retried). Without it every debounced keystroke left six requests running.
   - The **URL-sync effect and the search effect were split**: `setSearchParams` is re-memoized on every
     URL change, so with both in one effect each search ran **twice** — harmless at one request, not at six.
   - The **command palette** now requests only the four groups it lists; it was pulling `meetings` and
     `mentions` — the two heaviest scopes — and discarding them.
   **Diagnosis aid this leaves behind:** each request now logs its own
   `[TIMING] search … scopes=meetings → Nms`, so the function logs say **which group** is slow instead of
   only reporting a total.
   **Verified** locally against a seeded DB at **390 px** in Chromium: all six groups render with correct
   per-tab totals; a forced 502 on one group shows the banner and Retry recovers it; forced 504s on all
   six report all six instead of blanking; a superseded search cancels its six requests; the @-mention
   pin still asks only the mentions group and resolves its chip; tag-only search and the empty-result
   copy still work. `prepush` + full `npm run build` green. ⚠ Could **not** measure production — this
   container's network policy blocks `ari-search-book.netlify.app` — so the root cause is read from the
   code, not from prod timings.
   **Residual:** if one group *alone* still exceeds 9 s on the real data (224+ meetings with long Copilot
   recaps make `meetings`/`mentions` the candidates), that group now fails **visibly with its name** rather
   than taking the search down. The keep-warm ping offered under bug #9 and declined is still the durable
   cure for cold-start slowness.

---

## Appendix A — free-tier math & the cron/quota watch-item

### R10 CLOSED — **MEASURED** on the live site 9 days after cutover (2026-08-04)

The estimate below was ~2× conservative. Real numbers, owner's dashboard (**Serverless Functions daily
usage**, Aug 1–4):

| Meter | Measured | Projected month | Share of limit |
|---|---|---|---|
| Compute | **0.42 GB-Hrs** over 3 full days + a half | **~3.9 GB-Hrs** (~39 credits) | **~13%** |
| Requests | **2.6 K** | **~35 K** | ~28% of the classic 125 K cap |
| (July, incl. the soak + agent testing) | 1.4 GB-Hrs / 8.5 K | — | — |

⚠ **The owner's plan does not display credits at all** — the dashboard meters **GB-Hrs and requests**
per-meter, with no credit pool shown. The credit model described below may be a different/newer plan tier
than the one this account is on. It didn't need resolving, because the measured figures sit far under
*either* reading of the limit. **Don't re-raise this as a scare item without a number.**

**Two structural findings that make the projection trustworthy:**

1. **Function memory is 512 MB** — the optimistic end of the range the estimate below couldn't pin down.
   Derivation: the cron floor is exactly 289 invocations/day (`searchbook-alert` at `*/5` = 288, plus the
   daily backup) × ~2.5 s = 0.2 h/day, which at 512 MB is ~0.10 GB-Hrs/day — matching the observed daily
   bars almost exactly.
2. **The cron is ~80% of the compute bill, and it is weekend-flat.** So weekday/weekend weighting barely
   moves compute (a naive 4-day average gave 11%; correcting for two weekend days and a half-elapsed
   Tuesday gave 13%). **Requests** are the usage-driven meter and moved much more under the same
   correction (16% → 28%) — that's the one to re-measure if usage patterns change.

⚠ **Don't project a rate from a naive average over a window containing weekends or a partial day.**
Reconstruct per-day first: subtract the known-constant cron floor, then split weekday vs weekend. The
day-of-week split here was ~1,200 app requests on a workday vs **~50** on a weekend day — a 24× spread,
and the weekend bars landing on the computed 289 floor is what validated the whole reconstruction.

**Stress test:** 31 consecutive days of the heaviest day ever observed (~0.24 GB-Hrs, late July — and
those peaks include agent testing, so they overstate real use) still comes to ~7.4 GB-Hrs, about a
quarter of the budget. There is no realistic usage pattern that approaches a limit.

**The one lever, if it ever matters, is still the cron cadence** (the 80%), not app usage. At ~13% there
is no reason to touch it — and lengthening it would cost cold starts, since ~0.2 s/request assumes a warm
function while a cold one is 3–13 s.

### R10 as ESTIMATED pre-cutover (2026-07-26) — kept for the reasoning; superseded by the measurement above

Netlify's 2026 model is **credit-based**, not invocation-based:

- **Free plan = 300 credits/month**, a *hard* limit — no overage billing
- **Compute = 10 credits per GB-hour** (memory allocated × execution time)
- At 100%: **every project in the team is PAUSED** and visitors get "Site not available" — not just the
  cron, the whole app
- Netlify emails + in-app notifies at **50% / 75% / 100%**
- Usage UI: **Team dashboard → Usage & billing → Account usage insights** (daily chart, per-meter)

**The measured arithmetic**, from `searchbook-alert`'s real execution history (2.3–3.4 s per call,
2026-07-26): 43,200 invocations × ~2.5 s ≈ **30 hours** of execution per month.

| Function memory | GB-hours | Credits | Share of the 300 free |
|---|---|---|---|
| 1 GB | 30 | 300 | **100%** |
| 512 MB | 15 | 150 | 50% |

Netlify's docs don't state the default function memory, so this is a range — but even the optimistic end
spends **half the monthly budget on the reminders cron alone**, before bandwidth, web requests, deploys,
or actually using the app. This was flagged as "may be a large slice of the free budget"; it is.

**Action:** check Usage & billing ~4 days after cutover. Budget is ~10 credits/day; if the Compute meter
trends above that, pull a lever before the 50% email.
→ **DONE 2026-08-04 (9 days after cutover): ~1.3 credit-equivalents/day, ~13% of a 300 budget. No lever
needed.** See the measured section at the top of this appendix.

### DECIDED (owner, 2026-07-26): reminders run **every 5 minutes** — `*/5 * * * *`

Applied to `searchbook-alert` the same evening. This resolves R10 rather than merely watching it:

| Cadence | Invocations/mo | ~Execution | Credits @1 GB | Share of 300 |
|---|---|---|---|---|
| every 1 min (as built) | 43,200 | 30 h | ~300 | 100% |
| **every 5 min (chosen)** | **8,640** | **6 h** | **~60** | **20%** |

Why 5 minutes rather than the waking-hours trick (`*/2 6-23 * * *`, ~62% cut) that was drafted first:

- **Deeper cut** (80% vs 62%) and it leaves real headroom for bandwidth, deploys and normal app use.
- **Still a keep-warm.** §5's keep-warm design specified exactly a 5-minute `/api/health` ping as
  sufficient to hold the Lambda + libSQL connection open, so the cold-start fix survives the change.
- **Simpler.** No hour-range or timezone edge cases around midnight, and the connection stays warm
  overnight rather than going cold every night and paying a 3–13 s cold start each morning.

Cost: a reminder due at 08:00 now arrives in 08:00–08:05. These are day-planning nudges, not alarms, so
the owner accepted that trade.

⚠ **Knock-on effect:** cron-job.org auto-disables after 25 *consecutive* failures. At 1-minute cadence
that backstop fired in ~25 min; at 5-minute cadence it takes **~2 hours**. That makes the explicit
"execution fails" notification more important than before, not less — set it to notify after **2**
failures (~10 min) rather than the 5 that suited the minutely job.

### Original Phase 0.5 note (superseded by the above)

The one number to verify (Phase 0.5): Netlify's **free compute quota** under its current (2026) model.
The every-minute reminders cron alone is **~43,200 invocations/month** (60×24×30) — historically a
large slice of Netlify free's function budget, and larger than on Vercel. Levers if it's tight:

- Drop the reminders cron to **every 2–3 min** (reminder fires within 2–3 min of due time instead of 1)
  — cuts cron invocations by 50–66%.
- The cron ping doubles as a keep-warm, so a slightly longer interval also means slightly more frequent
  cold starts — acceptable for a single user.

Storage (photos + attachments + ~30 daily JSON backups) is ≪ 1 GB — comfortably within free Blobs.
Turso is unchanged.

## Appendix B — open decisions / residual risks

- **Will Netlify stay allowed at NCQA?** Reduce this risk by (optionally) asking IT to confirm a
  personal web-hosting domain is acceptable *before* Phase 4, so we don't cut over twice. The blocking
  pattern (run.app blocked, netlify.app not) suggests category-based filtering, not vendor hunting —
  but IT is actively tightening, so a heads-up is prudent.
- **LinkedIn parse** (A/B/C) — decided in Phase 0.3.
- **Prisma engine-less vs. bundled Linux engine** — decided in Phase 0.2.
- **Deploy branch strategy** — recommend deploying the migration branch to the Netlify site and keeping
  `main`→Vercel live until Phase 7, to preserve the parallel-run guarantee.

## Appendix C — sources (verified 2026-07)

- Netlify function timeout 10 s (free), 26 s (Pro): https://answers.netlify.com/t/increasing-timeout-from-10-seconds-to-26-seconds/163253
- Background Functions (15 min, Pro): https://docs.netlify.com/build/functions/background-functions/
- Netlify Blobs (no public URL; free tier): https://docs.netlify.com/build/data-and-storage/netlify-blobs/ · https://developers.netlify.com/guides/user-generated-uploads-with-netlify-blobs/
- Prisma → Netlify (engine bundling): https://www.prisma.io/docs/orm/prisma-client/deployment/serverless/deploy-to-netlify · https://www.prisma.io/docs/orm/prisma-client/deployment/module-bundlers
- Netlify functions overview/limits: https://docs.netlify.com/build/functions/overview/
