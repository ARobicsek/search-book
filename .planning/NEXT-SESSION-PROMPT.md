## What Was Completed Last Session

### Resilience Against Turso Instability (2026-03-24)
1. Diagnosed intermittent timeouts on production (Dashboard, Contacts, Companies, Analytics).
2. Root cause: Turso DB service instability (confirmed via status.turso.tech — multiple recent outages).
3. Fixed PWA service worker `networkTimeoutSeconds: 10` in `vite.config.ts` — was silently killing API requests before the client's 30s timeout could handle them.
4. Added server-side 25s request timeout middleware in `app.ts` — returns clean 504 before Vercel's 30s hard kill.
5. Added warmup retry logic in `app.ts` — retries `SELECT 1` once on failure, waits up to 8s.
6. Added client-side auto-retry for GET requests on timeout/504 in `api.ts`.

### Enhanced Global Filtering for Lists (2026-03-24, earlier session)
1. Updated `action-list.tsx`, `company-list.tsx`, and `contact-list.tsx` to use robust multi-word match logic for their global filters.

---

## Work for Next Session

**1. Continue Turso Timeout Investigation**
The resilience changes help but pages still struggle to load when Turso is unstable. Next steps:
- Check https://status.turso.tech — if Turso's issues have resolved but timeouts persist, dig deeper.
- Consider upgrading `@libsql/client` from 0.5.6 to latest — newer versions may have better timeout/retry handling.
- Consider adding per-query timeouts via `Promise.race` in route handlers for critical endpoints.
- Evaluate whether Turso's free tier has connection/rate limits that could explain the behavior.

**2. Address Unmatched Companies (Optional)**
Consider fuzzy matching or manual alias lookups for the 112 missing recruiting companies.

**3. Phase 8: Document Search**
See `.planning/ROADMAP.md` for details.

---

## Open Bugs

**Intermittent production timeouts** — Pages sometimes fail to load due to Turso DB instability. Resilience layers (auto-retry, server timeout) partially mitigate but don't fully resolve. Monitor Turso status; if their service stabilizes and the issue persists, further investigation needed.
