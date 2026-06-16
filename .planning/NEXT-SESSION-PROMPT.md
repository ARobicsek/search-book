# Next Session Prompt

This file is the handoff document for the next AI session (Claude Code **or** Gemini/Antigravity — the
protocol is agent-agnostic). It summarizes what was just accomplished, what to work on next, and open items.

### What Was Just Completed (Session 13) — owner-requested UI polish (5 items) — ✅ SHIPPED

All client-only (no schema changes, so no Turso DDL needed). `npm run prepush` (client+server typecheck)
passes; verified end-to-end in the running app via chrome-devtools. Committed atomically + pushed to `main`.

1. **Contact card — paste images into the photo box** (`photo-upload.tsx`). A page-level `paste` listener
   uploads a clipboard image while the drop zone is showing (no photo set yet). It ignores pastes whose
   target is an `input`/`textarea`/`[contenteditable]` so it never hijacks the notes editor. Hint text now
   reads "Drag, drop, or paste an image — or click to browse". (`<PhotoUpload>` has a single instance —
   contact form — so the document listener can't collide.)
2. **Contact card — markdown toolbar + paste/drag in the Notes box** (`contact-form.tsx`). The plain
   `Textarea` for Notes was swapped for the shared `MarkdownTextarea` (H3/bold/italic/lists toolbar +
   Ctrl shortcuts + paste/drag screenshots). The contact **detail** page already renders notes via
   `ReactMarkdown`, so formatting displays correctly. (Only Notes — other contact textareas left plain.)
3. **Meetings — prep-note bar opens on the caret** (`quick-log-dialog.tsx`). Added `showTagsPrep` to the
   `showPanel` condition, so expanding the desktop "Tags, prep notes & attachments" section opens the left
   **Prep Notes** bar right away (previously it only appeared after a note was saved + the dialog reopened).
   Prep notes render in the left bar; the section keeps Tags + Attachments. Mobile unchanged.
4. **Global Search — faster scope narrowing + all-on default** (`search.tsx`). Badges **default to all-on
   every visit** (scope selection no longer persisted; sort + case still are). Added an **"All" reset chip**.
   New click model: from all-on, **one click isolates** to that scope; a **second click on that lone scope
   inverts** to everything-except-it; otherwise plain add/remove (≥1 kept). URL `?scopes=` still wins so
   shared/deep links keep a narrower selection. ("Useful for" is one of the always-on scopes.)
5. **Series — discoverable Manage dialog** (`meetings.tsx`). `/api/series` rename/delete already existed but
   was only reachable via easy-to-miss icons in the series-view header. Added a **"Manage" link beside the
   Series filter** opening `ManageSeriesDialog` (every series w/ meeting count + last date, inline rename,
   delete-with-confirm). Deleting the currently-viewed series clears the filter. The header icons stay.
6. **New Organization status defaults to blank** (`company-form.tsx`) — `emptyForm.status` `RESEARCHING` → `NONE` ("—").
7. **Meetings search now also matches participant + series name** (`meetings.ts`, follow-up ask). The `?q=`
   filter matches TITLE + any named PARTICIPANT + SERIES name for all meetings (the participant/series
   clauses were lifted out of the untitled-only gate); untitled meetings still also match anchor
   contact/org/attendees. Verified via API (a meeting surfaced by its series name when its title didn't
   contain the query). Highlight stays heading-only.

### What's Next
1. Plan of record returns to **`.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+)**, gated on decisions D5–D9 —
   don't push on those until the owner raises them.
2. **[OWNER, light]** Run the organization status sweep script against production Turso (carry-over): export
   `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`, then `node scripts/sweep-company-status.js` from `server/`.

### Carry-over items (pre-dating, lower priority)
1. **[USER ACTION]** Set `SENTRY_DSN` / `VITE_SENTRY_DSN` in Vercel (hardening Task 17).
2. NCQA adaptation plan: Phase 3 (blocked D8/D9) / Phase 4 (D5/D6).
3. Stray empty `server/dev.db` / `server/test.db` (gitignored) safe to delete.
4. **"Recently updated" merge-bump** fix (S11) is forward-only — meetings a *past* contact-merge already
   stamped stay near the top; a one-off reset would also wipe genuine edit timestamps, so confirm criteria first.
5. **`updatedAt` under-bumping**: `Conversation.updatedAt` only bumps on edits to the meeting row/junctions,
   not isolated child-record edits (prep note / attachment). Bump it in those routes if "Recently updated"
   should float a meeting on those too.

### Open Bugs / Known Caveats
- **⚠ The committed Turso rw token in `server/.env` is STALE (hard 401).** Use the Turso web SQL console for DDL.
- **⚠ `prisma db push` local-path gotcha:** from `server/`, `db push` resolves `file:./dev.db` to the stray
  empty `server/dev.db`, not the populated `server/prisma/dev.db` the server opens. Use the dual-mode migration
  scripts (libsql `file:` URL) instead — they target `./prisma/dev.db` and work with the dev server running.
- Run `tsc -b` / full `vite build` (not just `npm run prepush`) before every push — it catches unused imports.
- Dev smoke: server 3001, client 5173. The local app has `APP_PASSWORD` unset → seed any non-empty
  `localStorage.searchbook_password` ('devlocal' works) to pass the login gate; the server middleware no-ops.
  Device-emulation `390x844` gives a true mobile viewport.

### Working branch
`main` — pushed and live.

---

### Suggested kickoff prompt for the next session

> Read `CLAUDE.md` / `AGENTS.md`, then this file. Session 13 shipped five owner-requested UI polish items
> (contact photo-paste + markdown Notes box; Quick Log prep bar opening on the tags/prep/attachments caret;
> Search default-all scopes with click-to-isolate / double-click-to-invert + an "All" chip; a discoverable
> "Manage series" dialog; new-org status defaults to blank) — all client-only, verified, pushed, live. Plan
> of record returns to `.planning/NCQA-ADAPTATION-PLAN.md` (Phase 3+, gated D5–D9 — don't push on those until
> the owner raises them).
