# Next Session Prompt

This file serves as a handoff document for the next AI session. It summarizes what was just accomplished, what needs to be worked on next, and any open bugs or architectural context.

### What Was Just Completed

**LinkedIn Import — Profile payload preprocessing + missing-Experience diagnostics**

Fixed two import failures from the prior session (Sendak and Singal returning 0 roles) and added a user-facing warning when the paste is missing the Experience section.

- **Root cause of Singal failure** (fixed): the raw paste was 23,807 chars but the `Experience` section started at char 16,365 — past the old 15,000-char `text.slice(0, 15000)` cap in [server/src/routes/linkedin.ts](server/src/routes/linkedin.ts). The slice threw away every role before the model ever saw it.
- **Root cause of Sendak failure** (fixed): even with a larger cap the paste contained ~560 lines of Activity/Featured posts between About and Experience. The model got buried under that noise (24s+ round trips, close to the 28s client timeout) and sometimes returned an empty `experience[]`.
- **New preprocessor** ([server/src/routes/linkedin.ts:12-41](server/src/routes/linkedin.ts#L12-L41)): `extractRelevantLinkedInSections` always drops the Activity/Featured block. It keeps the header (name, headline, location, About) up to the first `\nFeatured\n` or `\nActivity\n` marker, then — if `\nExperience\n` is present — appends from Experience through just before `More profiles for you`. Short profiles with no Activity block (Trevor-style) pass through unchanged. Cap raised to 30,000 chars as a safety net.
  - Sendak full .txt: 29,777 → 7,695 chars
  - Singal full .txt: 23,807 → 7,636 chars
  - Engelhard full .txt: 27,674 → 12,266 chars
  - Trevor full .txt: 7,991 → 7,991 chars (unchanged)
- **"Experience section missing" warning**: when the paste doesn't contain a `Experience` header (a very common mistake because LinkedIn collapses Experience behind a "Show all N experiences" button that Ctrl+A doesn't expand), the server attaches a `warning` field to the response ([server/src/routes/linkedin.ts:117-121](server/src/routes/linkedin.ts#L117-L121)) and the dialog renders it as an amber banner above the preview ([client/src/components/linkedin-import-dialog.tsx:290-294](client/src/components/linkedin-import-dialog.tsx#L290-L294)). Added `warning?: string` to `LinkedInParsedData`.
- **Dev-only log** in the parse route shows input/output char counts and whether the Experience section was detected in the paste — useful for future triage.

Manual QA: Sendak now imports cleanly with all 5 roles (3 current + 2 past at Duke Institute for Health Innovation) surfaced in the preview dialog, with the "matched" indicator firing on every one.

### What's Next

1. **Bug: past roles don't appear in the contact detail UI.** After importing Sendak, the import dialog preview correctly shows all 5 roles — 3 current + 2 past Duke roles ("Population Health & Data Science Lead", "Clinical Informatics Analyst"). The 3 current roles appear in the `Companies` section of the contact edit form. The 2 past roles do not appear anywhere visible in the contact detail page. Need to investigate:
   - Are past roles actually being written to `EmploymentHistory` rows? (Check commit logic in [client/src/pages/contacts/contact-form.tsx](client/src/pages/contacts/contact-form.tsx) — look for the `pendingEmploymentHistory` flush path for create mode and the immediate POST path for edit mode.)
   - If they are written, is the "Past Companies" card on [client/src/pages/contacts/contact-detail.tsx](client/src/pages/contacts/contact-detail.tsx) rendering them? The previous session renamed "Previous Companies" → "Past Companies"; verify the card actually shows up when EmploymentHistory rows exist.
   - Check the network tab during a fresh import to confirm the `POST /employment-history` calls are firing with the expected `{contactId, companyId, title, startDate: null, endDate: null}` payloads.
2. **Carry-over from previous session** (still pending):
   - Replace `resetPrisma()` hack in [server/src/app.ts](server/src/app.ts) with a long-lived PrismaClient pattern.
   - Expand `useAutoSave` hook to Prep Notes, Actions, and Company create form.
   - Manual data polish: scan company database for stragglers needing dedup.
   - Stretch from the LinkedIn plan §2.2 / §7: consider adding `isBoardRole: Boolean @default(false)` to `EmploymentHistory` schema if the missing distinction becomes painful in practice.

### Open Bugs

- **Past roles from LinkedIn import don't render in the contact detail UI.** Import dialog preview shows them (current + past), and the current ones populate the Companies section of the form, but the past ones appear to vanish. Most likely one of: (a) the commit logic in the contact form isn't writing `EmploymentHistory` rows, (b) it is writing them but contact-detail isn't fetching/rendering the "Past Companies" card, or (c) a schema/endpoint mismatch. See investigation checklist in "What's Next" item 1.
