# Next Session Prompt

This file serves as a handoff document for the next AI session. It summarizes what was just accomplished, what needs to be worked on next, and any open bugs or architectural context.

### What Was Just Completed

**LinkedIn Import — Full Career History (all 7 phases per [.planning/LINKEDIN-IMPORT-ENHANCEMENT-PLAN.md](.planning/LINKEDIN-IMPORT-ENHANCEMENT-PLAN.md))**

The LinkedIn import now captures every role from a profile's Experience section — current and past, including board seats and advisory positions — and writes them as real `Company` + `EmploymentHistory` rows so a company's detail page surfaces past employees as well as current ones.

- **Backend prompt** ([server/src/routes/linkedin.ts](server/src/routes/linkedin.ts)): Returns an `experience[]` array of `{company, title, isCurrent}`. Skips student roles and "Various"-style placeholders. Preserves nested same-company roles. Char cap raised 8000 → 15000. Top-level `company` derived server-side from the first current entry (back-compat).
- **Client normalize util** ([client/src/lib/normalize.ts](client/src/lib/normalize.ts)): Added `normalizeCompanyNameForDedupe` mirroring the server's suffix-stripping logic ("Inc.", "LLC", etc.) so LinkedIn-extracted names match existing DB rows.
- **Import dialog** ([client/src/components/linkedin-import-dialog.tsx](client/src/components/linkedin-import-dialog.tsx)): Preview step now shows a collapsible Experience checklist with Current/Past badges, a "✓ matched" indicator for companies already in the DB, and a header summary ("12 roles — 5 current, 7 past"). `onImport` is awaited so the dialog shows "Importing..." while the parent does async work.
- **Commit logic** ([client/src/pages/contacts/contact-form.tsx](client/src/pages/contacts/contact-form.tsx)): `onImport` resolves/creates Company rows in parallel (using the dedup normalizer), partitions roles into current vs past, appends current to `companyEntries`, and writes past roles to `EmploymentHistory` — immediately in edit mode, buffered in `pendingEmploymentHistory` state and flushed after `handleSubmit` creates the contact in create mode. Re-import dedupes against existing roles by `companyId + title` (case-insensitive).
- **Contact detail** ([client/src/pages/contacts/contact-detail.tsx](client/src/pages/contacts/contact-detail.tsx)): "Previous Companies" card renamed to "Past Companies". The existing date-range condition already hides the tail gracefully when both dates are null.
- **Company detail** ([server/src/routes/companies.ts](server/src/routes/companies.ts) + [client/src/pages/companies/company-detail.tsx](client/src/pages/companies/company-detail.tsx)): The `/companies/:id` endpoint now returns a `pastContacts` array sourced from `EmploymentHistory` and deduped against `employedContacts`. The UI renders a new "Past" subsection inside the Contacts card.

Manual QA: **Trevor's profile imported correctly** (American Rivers as current, Prep for Prep / Foundation Medicine as past, student role skipped). **Gaurav's profile did NOT import correctly** — see open bugs below.

### What's Next

1. **Debug the Gaurav LinkedIn import failure.** Trevor worked end-to-end but Gaurav's profile (see [Singal.txt](Singal.txt)) did not import as expected. Likely investigation paths:
   - Capture the raw `experience[]` JSON the AI returned for Gaurav (server log line: `[LinkedIn Parse] Extracted: ... (N roles)`).
   - Gaurav's profile has unusual structure: a "Various" entry (should be skipped per prompt rule), a Mass General Brigham "Innovation Growth Board" entry without a "Present" date but appears current, and **two nested roles at Harvard Medical School** (Attending Physician + Faculty/Board of Advisors) where the company name appears once at the top followed by a year-range header. The model may be mis-extracting the nested-role pattern.
   - Verify the prompt rule about nested roles ("emit each as its own entry sharing the same `company` name") fires correctly on this layout. May need to add a more concrete example to the prompt.
   - Check whether the `isCurrent` heuristic correctly identifies "Innovation Growth Board" (date range "2025 - Present").
2. **Stretch from the plan §2.2 / §7:** Consider adding `isBoardRole: Boolean @default(false)` to `EmploymentHistory` schema if the user finds the missing distinction painful in practice.
3. **Carry-over from previous session** (still pending):
   - Replace `resetPrisma()` hack in [server/src/app.ts](server/src/app.ts) with a long-lived PrismaClient pattern.
   - Expand `useAutoSave` hook to Prep Notes, Actions, and Company create form.
   - Manual data polish: scan company database for stragglers needing dedup.

### Open Bugs

- **Gaurav LinkedIn import does not work as expected.** Trevor's profile imports cleanly; Gaurav's does not. Symptom unspecified — needs reproduction next session with server logs to see the raw extracted `experience[]`. Strong suspect: the nested-roles-at-same-company pattern in Gaurav's Harvard Medical School block.
