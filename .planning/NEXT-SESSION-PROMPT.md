# SearchBook — Next Session Starting Prompt

Copy and paste everything below the line into Claude Code to start the next session.

---

## Prompt

I'm building **SearchBook**, a lightweight local CRM for managing my executive job search networking.

**Before doing anything, read these files:**
- `.planning/STATE.md` — Session history and decisions
- `.planning/ROADMAP.md` — All phases and acceptance criteria

**GSD methodology.** Atomic commits per task.

---

## Phase 6: COMPLETE

### What was done this session:
- **Feedback fixes** — Default conversation type VIDEO_CALL, MultiCombobox per-item badge removal, Ideas linked to contacts/companies (junction tables + MultiCombobox), prep notes shown alongside conversation dialog (two-column layout), multiple emails per contact (additionalEmails JSON field + dynamic inputs), multiple companies via EmploymentHistory
- **Backup & Restore** — One-click backup (DB + photos + WAL files to server/backups/), restore from backup with confirmation dialog, Settings page with sidebar link
- **Loading states** — Loader2 spinners on all 10 pages (replaced "Loading..." text)
- **Keyboard shortcuts** — Help dialog on `?` key, `g+key` navigation shortcuts (h/c/o/a/l/i/n/s)
- **Duplicate detection** — Levenshtein name similarity + email/LinkedIn matching, merge tool transfers all relations then deletes

## Phase 7: iPhone PWA Access

### Goal:
Make SearchBook accessible as a PWA on iPhone while running on the home Windows PC.

### Key considerations:
- App already has PWA support (vite-plugin-pwa, manifest, service worker)
- Currently runs on localhost:5173 (client) and localhost:3001 (server)
- iPhone needs to reach the PC over LAN — requires binding to `0.0.0.0` instead of `localhost`
- HTTPS is required for PWA install on iOS (service workers won't register over plain HTTP on non-localhost)
- Options: self-signed cert (requires trust on iPhone), ngrok/tunneling, or mkcert for local CA
- Need to handle CORS for LAN IP access
- Consider: responsive design audit for mobile viewport

### Tasks to plan:
1. **LAN network access** — Bind Vite dev server + Express to `0.0.0.0`, update CORS
2. **HTTPS setup** — mkcert or self-signed cert for local dev, configure Vite + Express for HTTPS
3. **PWA manifest updates** — Ensure icons, start_url, scope work for LAN IP access
4. **Mobile responsive audit** — Check all pages render well on iPhone viewport (sidebar collapse, tables scroll, dialogs fit)
5. **iOS-specific PWA tweaks** — apple-touch-icon, status bar meta tags, standalone display mode testing

---

## Running the App:
```bash
npm start
```
- **Client**: http://localhost:5173
- **Server**: http://localhost:3001

### Note:
Run `cd server && npx prisma generate` if you see Prisma client errors.

---

**Plan and implement Phase 7: iPhone PWA access.**
