# SearchBook → Netlify · Phase 0 de-risk spike (THROWAWAY)

This directory is a **self-contained throwaway** used to settle risks **R1–R11** from
[`.planning/NETLIFY-MIGRATION-PLAN.md`](../.planning/NETLIFY-MIGRATION-PLAN.md) **before** any
real migration code is written. Nothing here is part of the app. Delete it after Phase 0.

**The whole point is empirical testing from the owner's NCQA work network.** An agent scaffolded
everything below; the remaining steps are human-only (Netlify account, deploy, clicking test URLs
**on the work laptop**, pasting the OpenAI key).

---

## What was built (ready to deploy)

| Test | Risk | File | How to run |
|---|---|---|---|
| Function reachable + path prefix | R1, R9 | `netlify/functions/ping.mjs` | open `/api/health` |
| Prisma engine-less + Turso | R4, R5, R7 | `netlify/functions/dbcount.mjs`, `_db.mjs`, `prisma.config.ts` (`engine:"client"`) | open `/.netlify/functions/dbcount` |
| LinkedIn parse timing (server) | R2 | `netlify/functions/linkedin-time.mjs` | open `/.netlify/functions/linkedin-time` |
| Browser-direct OpenAI reachable | R3 | `public/index.html` (R3 card) | paste key, click button |
| Netlify Blobs write→serve→render | R6 | `netlify/functions/blob-put.mjs` + `media.mjs` | buttons on the page |
| Cron trigger | R11 | `netlify/functions/reminders.mjs` | cron-job.org test job |
| Response size / quota | R8, R10 | (inspection only — see step 7) | — |

The static hub `public/index.html` links every test — **open it on the work laptop and go top to bottom.**

---

## Owner steps (one time, ~1–2 hrs total)

### 1. Prereqs
```bash
npm i -g netlify-cli
netlify login
```

### 2. From THIS directory, create a throwaway site
```bash
cd netlify-spike
npm install
netlify init          # create a NEW site, e.g. searchbook-spike-xxxx
```

### 3. Set env vars (Netlify dashboard → Site settings → Environment variables)
Copy from the Vercel dashboard — see `.env.example`. Minimum:
`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `OPENAI_API_KEY`, `REMINDERS_CRON_SECRET`.
> Turso may point at **prod** — `dbcount` only runs `COUNT(*)`, never writes.

### 4. Deploy
```bash
netlify deploy --build --prod
```
Record the URL: `https://<spike>.netlify.app`.

### 5. Run the tests **on the work laptop**
Open `https://<spike>.netlify.app/` and work through each card. Pass criteria:

- **R1/R9** — `/api/health` returns JSON (not a block page). Record `incomingPath`
  (tells us whether the real function must re-prepend `/api`, plan §3.7).
- **R4/R5/R7** — `dbcount` returns `{ ok:true, contactCount:N }`. Check cold-start in
  `netlify logs:function dbcount`. Zip size printed at deploy should be ≪ 50 MB.
  - ❌ *"could not locate the Query Engine"* → engine-less didn't take. **Fallback:** drop
    `engine:"client"`, keep the classic engine, and bundle the Linux binary via
    `[functions] included_files = ["generated/prisma/*.node", ...]`, ensuring `prisma generate`
    runs on Linux in the build. Re-deploy, re-test.
- **R2** — `linkedin-time` returns `durationSec`. **This is the decision-maker:**
  < ~8 s ⇒ option B may be viable; a 502 / >10 s ⇒ R2 confirmed → use option A or C.
- **R3** — paste the OpenAI key in the R3 card, click the button.
  ✅ a completion ⇒ **option A works at NCQA** (free, no timeout — the win).
  ❌ CORS/blocked/timeout ⇒ `api.openai.com` blocked at work → **option C**.
- **R6** — click *Write test image*, then *Load* → the 1×1 image renders. ✅ = Blobs serve
  through the proxy at work. Confirm Blobs is on the account's **free** tier.

### 6. R11 — cron trigger
In cron-job.org, add a **test** job hitting
`https://<spike>.netlify.app/api/cron/reminders?key=<REMINDERS_CRON_SECRET>` every minute.
Confirm 200s in `netlify logs:function reminders`. **Delete the job after.**

### 7. R8 / R10 — size + quota (inspection, no deploy)
- **R8 (response size):** the big full-backup path is already **browser-direct**
  (`client/src/lib/backup.ts`), so it bypasses functions. Just confirm no single function
  response would exceed ~5 MB (Lambda cap ~6 MB).
- **R10 (quota):** check the account's current **free compute budget** and that ~43k/mo
  reminder pings + human traffic fit. If tight, drop the reminders cron to every 2–3 min
  (plan Appendix A).

---

## Phase 0 gate → record the outcome

Fill this in and paste it back so Phase 1 can start:

```
R1 reachable ......... PASS / FAIL   incomingPath = __________
R2 server timing ..... ____ sec
R3 browser OpenAI .... PASS (option A) / FAIL (option C)
R4/R5 Prisma+Turso ... PASS / FAIL (engine-less | needed Linux-binary fallback)
R6 Blobs render ...... PASS / FAIL
R7 cold start / zip .. ____ ms / ____ MB
R8 response size ..... OK
R10 quota ............ OK / tighten cron
R11 cron 200s ........ PASS / FAIL

>>> LinkedIn decision (plan §0.1): A / B / C  = __________
```

### Teardown
`netlify sites:delete <spike>` (or park it), delete the cron-job.org test job, then
`rm -rf netlify-spike/` once Phase 1 begins.
