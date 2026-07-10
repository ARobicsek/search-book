# VERCEL-EXIT-PLAN — migrate SearchBook off Vercel to Google Cloud Run

**STATUS: CONTINGENCY — not started.** This is a just-in-case plan, written 2026-07-09 in response
to NCQA IT's discomfort with Vercel. Do **not** execute it unless the owner says "run the Vercel
exit plan" (or IT forces the issue). Until then Vercel remains the deployment target and nothing
in this document changes how sessions work.

**Audience:** a future coding agent (possibly a less capable model) executing this with the owner
available for the handful of steps only a human can do (billing, dashboard clicks). Every phase has
exact commands, complete code snippets, a verification gate, and a rollback note. Do the phases in
order; do not skip verification gates.

---

## 0. Decision record — why Google Cloud Run

### Requirements (from the owner, 2026-07-09)

1. **Free** — no recurring cost.
2. **Single user, no growth** — capacity is irrelevant; reliability and latency are not.
3. **Immediate performance for everything** — no user-facing cold starts, no throttled CPUs.
4. **IT-acceptable** — the driver is that NCQA IT views Vercel as an "AI system" risk. The
   replacement should be a boring, enterprise-recognized vendor. (Factual note for that
   conversation: Vercel is a hosting/CDN company, not an AI system; the only AI component in
   SearchBook is an optional OpenAI API call for LinkedIn profile parsing, which is independent of
   where the app is hosted and would be unchanged by this migration.)
5. **Executable by a weaker model** — minimize code rewrites; prefer mechanical swaps.

### The chosen target

| Concern | Today (Vercel) | Target (Google Cloud) |
|---|---|---|
| API + static frontend | Vercel serverless fn + CDN | **Cloud Run** (one container: Express serves `/api` **and** `client/dist`) |
| Photos / attachments / auto-backups | Vercel Blob (public URLs) | **Google Cloud Storage** (private bucket, proxied through Express) |
| Reminders cron (every minute) | cron-job.org → `/api/cron/reminders` | **Cloud Scheduler** job 1 (doubles as keep-warm ping) |
| Daily backup cron (08:00 UTC) | Vercel Cron (`vercel.json`) | **Cloud Scheduler** job 2 |
| Database | Turso (libsql over HTTPS) | **Unchanged** — Turso works identically from Cloud Run |
| Web Push | VAPID keys in env | **Unchanged** — keys move as env vars |
| LinkedIn AI parse / Outlook ICS | OpenAI API / ICS fetch from fn | **Unchanged** — plain outbound HTTPS |

Why this wins on the requirements:

- **Free, verified 2026-07**: Cloud Run's always-free tier is 2M requests + 180,000 vCPU-seconds +
  360,000 GiB-seconds/month in US regions ([pricing](https://cloud.google.com/run/pricing)); Cloud
  Scheduler gives **3 free jobs per billing account** ([pricing](https://cloud.google.com/scheduler/pricing))
  — we need exactly 2; Cloud Storage always-free is 5 GB + 5k class-A / 50k class-B ops/month
  ([free tier](https://cloud.google.com/free)). Our math (appendix A) uses <5% of every quota.
- **Immediate performance**: the every-minute reminders cron pings the service 24/7, so with
  request-based billing an instance stays warm indefinitely at ~$0 (idle non-min instances aren't
  billed; instances stay up 15 min past the last request —
  [billing settings](https://docs.cloud.google.com/run/docs/configuring/billing-settings)). Unlike
  Vercel/Lambda, a warm Cloud Run instance is a **full 1 vCPU** long-lived Node process — the
  Express/Prisma stack runs exactly like `npm start` does locally. Cold starts (~2–5 s) only after
  deploys or platform recycles, and the next minute's ping absorbs them, not the owner.
- **Minimal code delta**: the backend *already is* a plain Express server (`server/src/index.ts`).
  No serverless adapter, no framework port. The only code changes are: swap `@vercel/blob` for
  `@google-cloud/storage` behind an env-gated branch, add two small proxy routes, and serve
  `client/dist` statically in production.
- **IT optics**: Google Cloud is a standard enterprise platform (SOC 2 / ISO 27001 / HIPAA-eligible
  services), with no "AI hosting" branding problem.

### Alternatives rejected (verified 2026-07)

| Option | Why not |
|---|---|
| **Cloudflare Workers** (runner-up) | Truly zero cold starts and no credit card, but the free plan caps CPU at **10 ms/request** ([limits](https://developers.cloudflare.com/workers/platform/limits/)) — Express + Prisma's JS query pipeline commonly needs 10–20 ms, so heavy endpoints (contact detail, analytics, backup export) risk hard `Worker exceeded CPU` failures, not just slowness. Also requires porting: `web-push` (Node crypto) and `multer` don't run as-is, bundle-size limits, R2 needs a card anyway. Too many sharp edges for a weaker model. Reconsider only if Google billing is unacceptable. |
| **Render (free)** | Spins down after 15 min idle; **30–60 s cold starts** ([docs](https://render.com/docs/free)), and warm instances are 0.1 vCPU. Fails "immediate performance". |
| **Fly.io** | Free tier discontinued for new users (2024); minimum ~$2–5/mo ([community](https://community.fly.io/t/free-tier-is-dead/20651)). |
| **Netlify / other Vercel-alikes** | Same "AI-adjacent modern host" perception problem with IT; free functions have 10 s timeouts (LinkedIn parse needs 15–25 s). |
| **Azure free tiers** | Best IT optics for a Microsoft shop, but there is no free always-warm compute: App Service F1 sleeps + 60 CPU-min/day quota; Container Apps' free grant can't keep a min-replica warm 24/7. |
| **Oracle Cloud Always Free VM** | Genuinely free and fast, but an unmanaged internet-exposed VM the owner must patch forever — *worse* IT optics than Vercel, and sysadmin work beyond a "hands-off" plan. |
| **Self-host at home + tunnel** | Free but fragile (machine reboots = outage) and puts org-related data on home infrastructure — the thing IT hates most. |

### What the owner must provide (agent cannot do these)

1. A Google account for the project, with a **billing account (credit card on file)**. Expected
   spend: **$0/month** (appendix A), enforced by guardrails in Phase 2 (`--max-instances 1`,
   $1 budget alert). The card is a Google signup requirement, not a payment.
2. Access to the **Vercel dashboard** to read current production env-var values (Phase 1 checklist)
   and later to decommission.
3. A **fresh Turso auth token** (dashboard → database → tokens). ⚠ The commented token in
   `server/.env` is stale/401 (see CLAUDE.md).
4. Post-cutover: ~10 minutes per device to re-install the PWA, re-enter the password, and re-enable
   push notifications (origin changes, so all of these reset).

---

## 1. Current Vercel coupling (complete inventory, audited 2026-07-09)

| Touchpoint | Where | Migration action |
|---|---|---|
| Serverless entry wrapper | `api/index.ts` (+ `@vercel/node` dev-dep in root `package.json`) | Delete in Phase 6; Cloud Run uses `server/src/index.ts` |
| Build/routing/cron config | `vercel.json` (rewrites `/api/*` → fn, SPA fallback, **daily backup cron 08:00 UTC**, 30 s `maxDuration`) | Rewrites → Express static+SPA; cron → Cloud Scheduler |
| `build:vercel` script | root `package.json` | Superseded by Dockerfile |
| Photo/file uploads | `server/src/routes/upload.ts` — `@vercel/blob put()`, gated on `BLOB_READ_WRITE_TOKEN`; returns absolute public Blob URLs | Phase 1: add GCS branch gated on `GCS_BUCKET`, return relative `/photos/...`, `/files/...` |
| Auto-backup write/list/prune | `server/src/routes/backup.ts` — `/cron` writes JSON to Blob `backups/`, `/list` lists Blob | Phase 1: GCS branch + authenticated download proxy |
| Backup download links | `client/src/pages/settings.tsx` (~line 283, `<a href={b.url}>`) | Phase 1: authorized fetch + object-URL download (bucket is private) |
| Blob URLs **stored in the DB** | `Contact.photoUrl`, `Contact.photoFile`, `Company.photoFile`, `ConversationAttachment.url`, plus markdown-embedded image URLs in any text column (see `client/src/lib/photo-backup.ts` `collectBinaryRefs`) | Phase 4: copy objects to GCS + SQL `REPLACE` rewrite to relative paths |
| Static file serving in dev only | `server/src/app.ts` gates `/photos`, `/files` on `NODE_ENV !== 'production'` | Phase 1: production GCS proxy routes |
| CORS allow-list | `server/src/app.ts` (`VERCEL_URL`, `searchbook-three.vercel.app`, honors `CLIENT_URL`) | Set `CLIENT_URL` env to the run.app URL |
| Env vars | Vercel dashboard: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `APP_PASSWORD`, `CRON_SECRET`, `REMINDERS_CRON_SECRET`, `BLOB_READ_WRITE_TOKEN`, `OPENAI_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `REMINDER_TZ`, `SENTRY_DSN` (maybe unset), `CLIENT_URL` (maybe unset) | Copy values in Phase 1 checklist; set on Cloud Run in Phase 2 |
| External cron (reminders) | cron-job.org → `GET /api/cron/reminders?key=<REMINDERS_CRON_SECRET>` every minute | Cloud Scheduler job; disable cron-job.org in Phase 5 |
| Uptime monitor | external, hits `/api/health` | Repoint in Phase 5 |
| PWA / push origin | service worker, push subscriptions, `localStorage` (password + edit drafts) are all **per-origin** | Phase 5 cutover ritual |

Portable as-is (no action): Prisma 7 + `@prisma/adapter-libsql` → Turso; browser-direct backup
(`client/src/lib/backup.ts` gets creds from `/api/backup/credentials`); `web-push`; rate limiting;
the 12 s request timeout in `app.ts` (keep — it's good hygiene anywhere); Sentry.

One platform-specific trap: the generated Prisma client at `server/src/generated/prisma/` contains
a **native engine binary** (`query_engine-windows.dll.node` on the owner's machine). The Docker
build must run `npx prisma generate` on Linux and copy the resulting non-TS artifacts next to the
compiled JS (handled in the Dockerfile below).

---

## 2. Phase 1 — code changes (all testable locally, Vercel keeps working)

Everything in this phase is additive and gated on new env vars, so the same commit deploys to
Vercel unchanged (safe parallel-run). Local dev behavior (`npm start`) is also unchanged.

### 2.1 Storage abstraction — new file `server/src/lib/storage.ts`

```ts
// Object storage for production media + backups.
// GCS-backed when GCS_BUCKET is set (Cloud Run); Vercel Blob handled separately
// in the routes until decommission. Bucket is PRIVATE — objects are served
// through the Express proxy routes, never by public URL.
import { Storage } from '@google-cloud/storage';

let _storage: Storage | null = null;

export function gcsEnabled(): boolean {
  return !!process.env.GCS_BUCKET;
}

function bucket() {
  if (!_storage) _storage = new Storage(); // uses Cloud Run's ambient service account, or GOOGLE_APPLICATION_CREDENTIALS locally
  return _storage.bucket(process.env.GCS_BUCKET!);
}

export async function putObject(name: string, data: Buffer | string, contentType: string): Promise<void> {
  await bucket().file(name).save(data, { contentType, resumable: false });
}

export function objectReadStream(name: string) {
  return bucket().file(name).createReadStream();
}

export async function objectExists(name: string): Promise<boolean> {
  const [exists] = await bucket().file(name).exists();
  return exists;
}

export async function listObjects(prefix: string): Promise<{ name: string; size: number; uploadedAt: string }[]> {
  const [files] = await bucket().getFiles({ prefix });
  return files.map((f) => ({
    name: f.name,
    size: Number(f.metadata.size ?? 0),
    uploadedAt: String(f.metadata.timeCreated ?? ''),
  }));
}

export async function deleteObjects(names: string[]): Promise<void> {
  await Promise.all(names.map((n) => bucket().file(n).delete({ ignoreNotFound: true })));
}
```

Install the dependency: `cd server && npm install @google-cloud/storage`.

### 2.2 Uploads — `server/src/routes/upload.ts`

Both POST handlers currently branch on `isProduction = !!process.env.BLOB_READ_WRITE_TOKEN`.
Change each to a three-way branch, checked in this order:

1. **`gcsEnabled()`** → use the existing `memoryUpload` / `memoryFileUpload` multer, then:
   ```ts
   const filename = `photos/${uniqueSuffix}${ext}`;            // or `files/...` in /file
   await putObject(filename, req.file.buffer, req.file.mimetype);
   res.json({ path: `/${filename}` });                          // relative: '/photos/169...-42.jpg'
   ```
   (in `/file` also return `name`, `mimeType`, `size` as today).
2. `BLOB_READ_WRITE_TOKEN` set → existing Vercel Blob code, untouched (deleted in Phase 6).
3. else → existing local-disk code, untouched.

Relative paths are the key simplification: they match the local-dev format, the service worker's
`/photos/` CacheFirst rule (`client/vite.config.ts`), and survive any future host move.

### 2.3 Media proxy — new file `server/src/routes/media.ts`

```ts
// Serve GCS-stored photos/attachments on the same /photos/... /files/... paths
// local dev uses. Mounted OUTSIDE the /api password gate because <img> tags
// can't send headers — same exposure as today's public Vercel Blob URLs
// (unguessable timestamp+random filenames), minus the public bucket listing.
import { Router, Request, Response } from 'express';
import { gcsEnabled, objectExists, objectReadStream } from '../lib/storage';

const router = Router();

const SAFE_NAME = /^[A-Za-z0-9._-]+$/; // filenames are `${Date.now()}-${rand}${ext}` — no slashes

function serve(prefix: 'photos' | 'files') {
  return async (req: Request, res: Response) => {
    if (!gcsEnabled()) { res.status(404).end(); return; }
    const name = req.params.name;
    if (!SAFE_NAME.test(name)) { res.status(400).end(); return; }
    const object = `${prefix}/${name}`;
    if (!(await objectExists(object))) { res.status(404).end(); return; }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // names are unique-per-upload
    objectReadStream(object)
      .on('error', () => { if (!res.headersSent) res.status(500).end(); })
      .pipe(res);
  };
}

router.get('/photos/:name', serve('photos'));
router.get('/files/:name', serve('files'));

export default router;
```

Mount it in `server/src/app.ts` right after the existing dev-only static block (~line 171):

```ts
import mediaRouter from './routes/media';
// ...
app.use(mediaRouter); // GCS-backed /photos + /files in production (no-op unless GCS_BUCKET)
```

### 2.4 Auto-backups — `server/src/routes/backup.ts`

- **`GET /cron`**: replace the `BLOB_READ_WRITE_TOKEN` guard with: if `gcsEnabled()` use
  `putObject(name, json, 'application/json')`, `listObjects('backups/')`, sort by `uploadedAt`
  desc, `deleteObjects(...)` beyond `BACKUP_RETENTION`; else if Blob token set, keep existing Blob
  code; else the existing "skipped (local dev)" response.
- **`GET /list`**: same three-way gate. In the GCS branch return
  `{ name, url: '/api/backup/download/' + name-without-prefix, size, uploadedAt }` — a **relative
  API URL**, not a storage URL.
- **New `GET /download/:name`** (sits behind the global password gate automatically since it's
  under `/api/backup`):
  ```ts
  router.get('/download/:name', async (req: Request, res: Response) => {
    if (!gcsEnabled()) { res.status(404).json({ error: 'Not available' }); return; }
    const name = req.params.name;
    if (!/^[A-Za-z0-9._-]+\.json$/.test(name)) { res.status(400).json({ error: 'Bad name' }); return; }
    if (!(await objectExists(`backups/${name}`))) { res.status(404).json({ error: 'Not found' }); return; }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    objectReadStream(`backups/${name}`).pipe(res);
  });
  ```

### 2.5 Backup download link — `client/src/pages/settings.tsx` + `client/src/lib/api.ts`

The Settings list renders `<a href={b.url}>` (~line 283). A plain anchor can't send the
`x-app-password` header, and the GCS bucket is private, so switch to an authorized fetch:

- Add to the `api` object in `client/src/lib/api.ts`:
  ```ts
  downloadBlob(path: string): Promise<Blob> {
    return fetchWithTimeout(`${API_BASE}${path.replace(/^\/api/, '')}`)
      .then((r) => { if (!r.ok) throw new ApiError(r.status, 'Download failed'); return r.blob(); });
  },
  ```
- In `settings.tsx`, when `b.url` starts with `/api/` render a button instead of the anchor:
  ```tsx
  onClick={async () => {
    const blob = await api.downloadBlob(b.url);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = b.name;
    a.click();
    URL.revokeObjectURL(a.href);
  }}
  ```
  Keep the anchor path for absolute URLs so the Vercel deployment still works pre-cutover.

### 2.6 Serve the frontend from Express — `server/src/index.ts`

Replace the file's body with:

```ts
// Server entry point — local dev AND Cloud Run production.
import path from 'path';
import fs from 'fs';
import express from 'express';
import app from './app';

// In the container, CLIENT_DIST=/app/client/dist. Serve the built SPA + fallback.
const clientDist = process.env.CLIENT_DIST;
if (clientDist && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { maxAge: '1h', index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/photos') || req.path.startsWith('/files')) {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001; // Cloud Run injects PORT=8080

app.listen(PORT, () => {
  console.log(`SearchBook API running on http://localhost:${PORT}`);
});

export default app;
```

Notes: `index: false` + explicit fallback keeps `index.html` from being cached for an hour
(Workbox handles asset caching; index.html must revalidate so PWA updates are offered). Vite
hashes JS/CSS filenames, so `maxAge: '1h'` on assets is safe.

### 2.7 Dockerfile — new file at repo root

```dockerfile
# ---- client build ----
FROM node:22-slim AS client-build
WORKDIR /app
COPY client/package*.json client/
RUN cd client && npm ci
COPY client client
RUN cd client && npm run build          # tsc -b && vite build → client/dist

# ---- server build ----
FROM node:22-slim AS server-build
WORKDIR /app
COPY server/package*.json server/
RUN cd server && npm ci
COPY server server
# Generate the Prisma client on Linux (engine binary is platform-specific)
RUN cd server && DATABASE_URL=file:./dev.db npx prisma generate
RUN cd server && npm run build          # tsc → server/dist
# Compiled JS lands in dist/generated/prisma, but non-TS engine artifacts don't — copy them.
RUN cd server && find src/generated -type f ! -name '*.ts' -exec sh -c 'mkdir -p "dist/generated/prisma" && cp "$1" "dist/generated/prisma/"' _ {} \;
# Production-only node_modules for the final image
RUN cd server && npm ci --omit=dev

# ---- runtime ----
FROM node:22-slim
ENV NODE_ENV=production
ENV CLIENT_DIST=/app/client/dist
WORKDIR /app
COPY --from=server-build /app/server/node_modules server/node_modules
COPY --from=server-build /app/server/dist server/dist
COPY --from=server-build /app/server/package.json server/package.json
COPY --from=client-build /app/client/dist client/dist
EXPOSE 8080
CMD ["node", "server/dist/index.js"]
```

⚠ Two things to verify while building (expected wrinkles, fix as found):

- `npm ci --omit=dev` prunes `prisma` (CLI) and `better-sqlite3` — fine: `db.ts` only requires the
  better-sqlite3 adapter when `TURSO_DATABASE_URL` is **unset**, and it's always set in prod.
- If `node server/dist/index.js` fails with a missing Prisma engine/module, inspect what
  `prisma generate` emitted under `src/generated/prisma/` on Linux (it may be `.so.node`, `.wasm`,
  or `.json` files, possibly in subdirectories) and adjust the copy step to preserve subpaths:
  `cd src/generated && find . -type f ! -name '*.ts' | while read f; do mkdir -p "../../dist/generated/$(dirname "$f")"; cp "$f" "../../dist/generated/$f"; done`

### 2.8 `.dockerignore` — new file at repo root

```
node_modules
*/node_modules
client/dist
server/dist
server/data
server/backups
server/prisma/dev.db*
.git
.planning
docs
api
.env
*/.env
```

### 2.9 Phase 1 verification gate (all local, no GCP needed)

1. `npm run prepush` passes.
2. `npm start` — local dev works exactly as before (uploads to disk, photos render).
3. Build-and-run production shape locally against local SQLite is **not** possible (prod requires
   Turso), so verify the container with a scratch Turso DB or defer the runtime check to Phase 3's
   deploy; but at minimum `docker build -t searchbook .` must succeed on the owner's machine
   (Docker Desktop) or via Cloud Build in Phase 3.
4. Commit (do not push schema changes — there are none in this plan; the DB schema is untouched).

**Rollback:** all changes are dormant without `GCS_BUCKET`; reverting the commit fully restores
status quo.

---

## 3. Phase 2 — GCP provisioning (owner does 3.1; agent can do the rest via gcloud)

### 3.1 Owner, in the browser

1. Create/choose a Google account; at https://console.cloud.google.com create project
   `searchbook-prod` (note the **project ID**, e.g. `searchbook-prod-123456`).
2. Attach a billing account (card required; spend stays $0).
3. Billing → Budgets & alerts → create a **$1 budget** with email alerts at 50/90/100%.
4. Install the gcloud CLI (https://cloud.google.com/sdk/docs/install — Windows installer) and run
   `gcloud auth login`, `gcloud config set project <PROJECT_ID>`.

### 3.2 Enable services + bucket (agent)

```powershell
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com storage.googleapis.com cloudscheduler.googleapis.com
# Bucket name must be globally unique — adjust and record it:
gcloud storage buckets create gs://searchbook-media-<something-unique> --location=us-east1 --uniform-bucket-level-access
```

Do **not** grant any public access to the bucket. Grant the Cloud Run runtime service account
object access (default compute SA unless you create a dedicated one):

```powershell
gcloud projects describe <PROJECT_ID> --format="value(projectNumber)"   # → PROJECT_NUMBER
gcloud storage buckets add-iam-policy-binding gs://<BUCKET> --member="serviceAccount:<PROJECT_NUMBER>-compute@developer.gserviceaccount.com" --role="roles/storage.objectAdmin"
```

### 3.3 Collect env values (owner reads from Vercel dashboard → Project → Settings → Environment Variables)

`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` (or mint a fresh token in Turso dashboard),
`APP_PASSWORD`, `CRON_SECRET`, `REMINDERS_CRON_SECRET` (if set), `OPENAI_API_KEY`,
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `REMINDER_TZ`, `SENTRY_DSN` (if set).
Also copy `BLOB_READ_WRITE_TOKEN` — needed once for the Phase 4 object migration.
Store them temporarily in a local file **outside the repo** (e.g. `%USERPROFILE%\searchbook-env.txt`), delete after Phase 5.

### 3.4 First deploy

Write the env vars to a YAML file outside the repo (`%USERPROFILE%\searchbook-env.yaml`) to avoid
comma-escaping pain:

```yaml
TURSO_DATABASE_URL: "libsql://…"
TURSO_AUTH_TOKEN: "…"
APP_PASSWORD: "…"
CRON_SECRET: "…"
REMINDERS_CRON_SECRET: "…"
OPENAI_API_KEY: "…"
VAPID_PUBLIC_KEY: "…"
VAPID_PRIVATE_KEY: "…"
VAPID_SUBJECT: "mailto:…"
REMINDER_TZ: "America/New_York"
GCS_BUCKET: "<BUCKET>"
```

```powershell
gcloud run deploy searchbook --source . --region us-east1 --allow-unauthenticated --max-instances 1 --memory 512Mi --cpu 1 --env-vars-file "$env:USERPROFILE\searchbook-env.yaml"
```

`--source .` triggers Cloud Build, which uses the repo Dockerfile. Note the service URL it prints
(e.g. `https://searchbook-xxxxxxxx-uc.a.run.app`) — call it `<RUN_URL>` below. Then set the CORS
belt-and-braces var:

```powershell
gcloud run services update searchbook --region us-east1 --update-env-vars CLIENT_URL=<RUN_URL>
```

Add a deploy script to root `package.json` for future sessions:
`"deploy:gcp": "gcloud run deploy searchbook --source . --region us-east1"`
(env vars persist across deploys unless explicitly changed). Optional later: a Cloud Build GitHub
trigger for push-to-deploy parity; manual deploys are the bulletproof default.

### 3.5 Phase 2/3 verification gate

- `curl <RUN_URL>/api/health` → `{"status":"ok","db":"ok",…}` (proves Turso connectivity).
- Open `<RUN_URL>` in a browser → login screen → password works → contacts list loads.
- Upload a **test photo** on a test contact via the new origin → photo renders (proves GCS write +
  proxy read). Delete the test contact after.
- In Settings, hit **Back up now** → succeeds; `gcloud storage ls gs://<BUCKET>/backups/` shows the
  JSON; the Settings list shows it and its download button works.
- Existing photos are still Vercel Blob URLs at this point and must **still render** (they're
  absolute URLs; untouched until Phase 4).

**Rollback:** none needed — nothing user-facing has changed; Vercel is still the live app.

---

## 4. Phase 4 — migrate stored binaries + rewrite DB URLs

⚠ **This is the point of no return for the old deployment**: after the URL rewrite, photos render
on Cloud Run but appear broken on the Vercel deployment (its prod build doesn't serve `/photos`).
Do this only after the Phase 3 gate passes, and immediately proceed to Phase 5. Run it at a quiet
time (evening/weekend).

### 4.0 Safety net first

Run **Back up now** and also download a full manual backup ZIP (Settings) — the ZIP includes
binaries (`client/src/lib/photo-backup.ts`). Keep both locally.

### 4.1 Copy every Blob object to GCS — new script `server/scripts/migrate-blobs-to-gcs.mjs`

Run locally (needs `BLOB_READ_WRITE_TOKEN`, `GCS_BUCKET`, and
`gcloud auth application-default login` for ambient GCS creds):

```js
// Usage (PowerShell):
//   $env:BLOB_READ_WRITE_TOKEN='…'; $env:GCS_BUCKET='<BUCKET>'
//   node server/scripts/migrate-blobs-to-gcs.mjs
import { list } from '@vercel/blob';
import { Storage } from '@google-cloud/storage';

const bucket = new Storage().bucket(process.env.GCS_BUCKET);
let cursor, copied = 0, hosts = new Set();
do {
  const page = await list({ cursor, limit: 500 });
  for (const b of page.blobs) {
    hosts.add(new URL(b.url).host);
    const [exists] = await bucket.file(b.pathname).exists();
    if (!exists) {
      const bytes = Buffer.from(await (await fetch(b.url)).arrayBuffer());
      await bucket.file(b.pathname).save(bytes, { resumable: false });
    }
    copied++;
    console.log(`${copied}: ${b.pathname} (${b.size} bytes)`);
  }
  cursor = page.cursor;
} while (cursor);
console.log('Blob hosts seen (needed for the URL rewrite):', [...hosts]);
```

This copies `photos/`, `files/`, **and** `backups/` (backup history preserved). Idempotent — safe
to re-run. Record the printed host (e.g. `abc123xyz.public.blob.vercel-storage.com`).

### 4.2 Rewrite URLs in Turso — new script `server/scripts/rewrite-blob-urls.mjs`

Rewrites `https://<HOST>/photos/x.jpg` → `/photos/x.jpg` in **every text column of every table**
(covers the four known columns *and* markdown-embedded images in any notes field). Run with the
**live** Turso creds (fresh token):

```js
// Usage: $env:TURSO_DATABASE_URL='libsql://…'; $env:TURSO_AUTH_TOKEN='…'
//        node server/scripts/rewrite-blob-urls.mjs <BLOB_HOST> [--undo]
import { createClient } from '@libsql/client';

const host = process.argv[2];
const undo = process.argv.includes('--undo');
if (!host) { console.error('Pass the blob host, e.g. abc123.public.blob.vercel-storage.com'); process.exit(1); }
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

const from = undo ? '/' : `https://${host}/`;
const to   = undo ? `https://${host}/` : '/';
// --undo naively re-prefixes ALL relative /photos//files/ paths — only for emergency rollback
const needle = undo ? `'/photos/','/files/'` : null;

const tables = (await db.execute(
  `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'`
)).rows.map((r) => r.name);

for (const t of tables) {
  const cols = (await db.execute(`PRAGMA table_info("${t}")`)).rows
    .filter((c) => /TEXT|CHAR|CLOB/i.test(String(c.type ?? 'TEXT')))
    .map((c) => c.name);
  for (const c of cols) {
    const r = undo
      ? await db.execute(`UPDATE "${t}" SET "${c}" = REPLACE(REPLACE("${c}", '/photos/', 'https://${host}/photos/'), '/files/', 'https://${host}/files/') WHERE "${c}" LIKE '%/photos/%' OR "${c}" LIKE '%/files/%'`)
      : await db.execute(`UPDATE "${t}" SET "${c}" = REPLACE("${c}", '${from}', '${to}') WHERE "${c}" LIKE '%${host}%'`);
    if (r.rowsAffected > 0) console.log(`${t}.${c}: ${r.rowsAffected} rows`);
  }
}

// Verify: nothing left pointing at the blob host
for (const t of tables) {
  const cols = (await db.execute(`PRAGMA table_info("${t}")`)).rows.map((c) => c.name);
  for (const c of cols) {
    const r = await db.execute(`SELECT COUNT(*) AS n FROM "${t}" WHERE "${c}" LIKE '%${host}%'`);
    if (Number(r.rows[0].n) > 0) console.log(`⚠ REMAINING: ${t}.${c} = ${r.rows[0].n}`);
  }
}
console.log('Done. Any ⚠ REMAINING lines above mean the rewrite is incomplete.');
```

### 4.3 Phase 4 verification gate

- Script printed no `⚠ REMAINING` lines.
- On `<RUN_URL>`: contact photos render, a meeting attachment downloads, a note with a pasted
  image shows it (spot-check one of each).

**Rollback (emergency only):** `node server/scripts/rewrite-blob-urls.mjs <HOST> --undo`, which
re-points everything at Vercel Blob (do this only before the Blob store is deleted).

---

## 5. Phase 5 — cutover: crons, monitors, devices

### 5.1 Cloud Scheduler jobs (agent)

```powershell
# Job 1: reminders, every minute — ALSO the keep-warm ping. Uses the ?key= auth the route supports.
gcloud scheduler jobs create http searchbook-reminders --location=us-east1 --schedule="* * * * *" --uri="<RUN_URL>/api/cron/reminders?key=<REMINDERS_CRON_SECRET>" --http-method=GET --attempt-deadline=60s

# Job 2: daily backup at 08:00 UTC (matches the old vercel.json cron).
gcloud scheduler jobs create http searchbook-backup --location=us-east1 --schedule="0 8 * * *" --time-zone="Etc/UTC" --uri="<RUN_URL>/api/backup/cron" --http-method=GET --headers="Authorization=Bearer <CRON_SECRET>" --attempt-deadline=120s
```

Verify: `gcloud scheduler jobs run searchbook-reminders --location=us-east1` → then
`gcloud run services logs read searchbook --region=us-east1 --limit=20` shows a 200 on
`/api/cron/reminders`. Same for `searchbook-backup` (expect a new `backups/` object in GCS).

### 5.2 Push notification test

On the owner's phone (before decommissioning anything): open `<RUN_URL>`, install the PWA
(Add to Home Screen), log in, Settings → enable notifications. Create a test action due
now +3 minutes with notify on → notification should arrive within ~1 minute of due time.
Then clean up stale old-origin subscriptions in the Turso web SQL console:
`DELETE FROM PushSubscription WHERE createdAt < '<today's date>';` (or simply delete rows whose id
predates the new subscriptions; there is one row per device).

### 5.3 External services

- **cron-job.org**: disable/delete the every-minute reminders job (owner account).
- **Uptime monitor** (UptimeRobot or similar; hits `/api/health`): repoint to
  `<RUN_URL>/api/health`.
- **Sentry** (if `SENTRY_DSN` was ever set): nothing to change server-side; if the client DSN
  `VITE_SENTRY_DSN` is used it's baked at build time — set it as a Docker build arg only if the
  owner asks.

### 5.4 Per-device ritual (owner)

On each device: complete/save any in-progress edit drafts on the OLD app first (drafts live in
`localStorage`, which does not move across origins) → uninstall the old PWA → install from
`<RUN_URL>` → enter password → re-enable notifications (5.2 already did the phone).

### 5.5 Full cutover verification checklist

Work through on the new origin, desktop + one mobile (390 px):

- [ ] Login; wrong password → 401 → re-prompt
- [ ] Contacts list (filters, search, sort, pagination), contact detail (photo, phase-2 data)
- [ ] Photo upload on a contact; company logo upload
- [ ] Meetings: create/edit, participants, orgs, attachment upload **and** download, prep notes
- [ ] Actions: create (defaults to due today), complete a recurring action → next occurrence
      created with reminder carried; ownership quick-switch
- [ ] Reminder push arrives (5.2)
- [ ] LinkedIn import (OpenAI call, 15–25 s — no timeout on Cloud Run)
- [ ] Calendar/daily-briefing ICS fetch
- [ ] Undo delete
- [ ] Settings: Back up now → appears in list → download works; **browser-direct full backup**
      (uses `/api/backup/credentials` + Turso from the browser — unaffected but verify);
      manual ZIP backup with binaries
- [ ] PWA installed, offline shell loads, update prompt appears on next deploy
- [ ] `[TIMING]` logs in `gcloud run services logs read` look normal (<500 ms typical)

---

## 6. Phase 6 — decommission Vercel + cleanup

Only after 5.5 is fully green and the owner has used the new app for **a few normal days**:

1. **Copy-check backups**: confirm `gs://<BUCKET>/backups/` has the recent history (4.1 copied it).
2. **Vercel dashboard (owner)**: delete the Blob store; delete the `searchbook` project (this also
   removes the GitHub auto-deploy integration and the old URL); delete the stale rw token note.
3. **Repo cleanup** (agent, one commit):
   - Delete `api/index.ts`, `vercel.json`; remove `@vercel/node` (root) and `@vercel/blob`
     (server) deps; remove `build:vercel` script.
   - Remove the Vercel Blob branches from `upload.ts` and `backup.ts` (keep GCS + local-dev
     branches); remove the absolute-URL anchor branch in `settings.tsx`.
   - `server/.env.example`: replace Blob/Vercel lines with `GCS_BUCKET`.
   - Keep `check-backup-coverage.mjs` in `prepush` (the "Vercel build" wording in docs changes to
     "Docker build" — optionally add `npm run check:backup` to the Dockerfile before `tsc`).
4. **Docs** (same commit): update `CLAUDE.md` (Quick Reference URLs, "Deploy" line → `npm run
   deploy:gcp`, Vercel notes section → Cloud Run section: 512 Mi / max-instances 1 / logs command,
   photos = GCS via proxy), `AGENTS.md` (session-end step 4 "auto-deploys to Vercel" → "deploy with
   npm run deploy:gcp"), `.planning/NEXT-SESSION-PROMPT.md`, and move this plan to
   `.planning/archive/`.
5. Delete the temporary env-values file from 3.3.

---

## Appendix A — free-tier math (single user, verified 2026-07)

| Resource | Free/month | Projected use | Headroom |
|---|---|---|---|
| Cloud Run requests | 2,000,000 | ~44k reminder pings (60×24×31) + ~9k monitor pings + a few k human requests ≈ **60k** | 33× |
| Cloud Run vCPU-seconds | 180,000 | pings ~5 ms CPU each, billed in 100 ms slices ≈ 5,300; human traffic ≈ 2,000 | 25× |
| Cloud Run GiB-seconds | 360,000 | ≈ half the vCPU-s at 512 Mi | 90× |
| Cloud Scheduler jobs | 3 per billing account | 2 | 1 spare |
| GCS storage | 5 GB | photos + attachments + 30 daily JSON backups ≪ 1 GB | >5× |
| GCS class-B ops (reads) | 50,000 | photo loads are SW-cached 30 days client-side | large |
| Network egress (NA) | 1 GiB | photos (cached) + occasional backup downloads | large |
| Turso (unchanged) | 5 GB / 500M row-reads ([pricing](https://turso.tech/pricing)) | current usage | large |

Guardrails even so: `--max-instances 1` (a runaway can never scale), $1 budget alert, and the
existing rate limiter. Worst realistic overage: a few cents.

## Appendix B — sources

- Cloud Run pricing/free tier: https://cloud.google.com/run/pricing
- Cloud Run billing settings (request-based billing, idle instances): https://docs.cloud.google.com/run/docs/configuring/billing-settings
- Cloud Scheduler pricing (3 free jobs): https://cloud.google.com/scheduler/pricing
- Google Cloud always-free list (GCS 5 GB, etc.): https://cloud.google.com/free
- Cloudflare Workers limits (10 ms CPU on free): https://developers.cloudflare.com/workers/platform/limits/
- Render free tier (15-min spin-down): https://render.com/docs/free
- Fly.io free tier discontinued: https://community.fly.io/t/free-tier-is-dead/20651
- Turso pricing: https://turso.tech/pricing
