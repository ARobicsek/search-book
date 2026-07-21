# NETLIFY-MIGRATION-PLAN — migrate SearchBook off Vercel to Netlify

**STATUS: PLANNED — not started.** Written 2026-07-21 after live network testing proved that NCQA's
web proxy **blocks `*.run.app` (Google Cloud Run) but allows `*.netlify.app`**, while Vercel access
is granted only by exception and is being revoked. This **supersedes `VERCEL-EXIT-PLAN.md`** (Cloud
Run) as the migration target of record. Cloud Run is off the table *for this user* because its
default domain is unreachable at work.

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

---

## 3. Phase 1 — Code changes (additive, env-gated; Vercel + local unchanged)

> **LinkedIn decision from Phase 0.3: ______ (A / B / C).** Implement that path in 3.6.

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

---

## 4. Phase 2 — Netlify provisioning + first parallel deploy

Vercel stays the live app throughout. Netlify comes up **alongside** it, sharing the **same Turso DB**.

1. **Owner:** create the Netlify site from the GitHub repo, set the production branch to
   `claude/vercel-migration-plan-9d5ytl` (deploy the migration branch, not `main`, until cutover — so
   `main`/Vercel keeps shipping normally). Record the `*.netlify.app` URL.
2. **Env vars** (Netlify dashboard → Site settings → Environment): copy from Vercel —
   `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `APP_PASSWORD`, `CRON_SECRET`, `REMINDERS_CRON_SECRET`,
   `OPENAI_API_KEY` (unless fix A moved it client-side), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT`, `REMINDER_TZ`, `SENTRY_DSN` (if set). Set the storage gate (`STORAGE=netlify` or
   rely on `NETLIFY`). Set `CLIENT_URL=<netlify-url>`. **Do NOT set `BLOB_READ_WRITE_TOKEN`** (that
   would route Netlify to Vercel Blob).
3. Trigger deploy. 

### Phase 2 gate
- `curl <netlify-url>/api/health` → `{"status":"ok","db":"ok"}` (Turso reachable from Netlify).
- Browser: login works; contacts list loads; a contact detail renders. **Existing photos still render**
  (they're absolute Vercel-Blob URLs, untouched — good).
- Upload a **test** photo via Netlify → renders through the Blobs proxy (delete the test contact after).
- Settings → **Back up now** → appears in list, download works; confirm the JSON lands in Netlify Blobs.
- **Vercel app is still fully live and correct.**

**Rollback:** none needed — Vercel is untouched; Netlify is a parallel copy.

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

---

## 6. Phase 4 — Migrate binaries + rewrite DB URLs (point of no return)

⚠ After the URL rewrite, photos render on Netlify but appear **broken on Vercel**. Do this only after
Phase 3 is green, then proceed straight to cutover. Run at a quiet time.

1. **Safety net:** Settings → **Back up now** + download the full manual ZIP (includes binaries). Keep both.
2. **Copy every Vercel Blob object → Netlify Blobs** — script `server/scripts/migrate-blobs-to-netlify.mjs`
   (uses `@vercel/blob` `list()` to read + `@netlify/blobs` `getStore({ siteID, token })` to write;
   copies `photos/`, `files/`, **and** `backups/`). Idempotent. Record the Blob host it prints.
3. **Rewrite URLs in Turso** — script `server/scripts/rewrite-blob-urls.mjs <BLOB_HOST>` rewrites
   `https://<host>/photos/x` → `/photos/x` (and `/files/`) across **every text column of every table**
   (covers `Contact.photoUrl/photoFile`, `Company.photoFile`, `ConversationAttachment.url`, and
   markdown-embedded images in any notes column). Same script/approach as the Cloud Run plan §4.2,
   including the `--undo` emergency path and the "no ⚠ REMAINING" verification.

**Gate:** no `⚠ REMAINING`; on Netlify a contact photo, a meeting attachment, and a pasted-image note
all render.

**Rollback (emergency, only before deleting Vercel Blob):** `rewrite-blob-urls.mjs <HOST> --undo`.

---

## 7. Phase 5 — Cutover: crons, monitors, devices

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

## Appendix A — free-tier math & the cron/quota watch-item

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
