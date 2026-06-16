# LinkedIn Import Enhancement — Full Career History

**Status:** Planning — not yet implemented
**Date:** 2026-04-21 (revised per user feedback)
**Goal:** Extend the LinkedIn import to capture every company a contact has been associated with — current and past, including board seats and advisory roles — so searching a company surfaces contacts who are there now **or were there before**.

---

## 1. Motivation

**What works today:** Pasting a LinkedIn profile extracts name, title, one current company, location, about, skills.

**What's missing from the two sample profiles:**

| Sample | Roles we miss today |
|---|---|
| **Trevor Price** (`trevor`) | His board seat at **American Rivers** (current), his past Board of Trustees at **Prep for Prep**, and ~15 other roles — Oxeon, Hopscotch Health, Eleanor Health, Docent Health, Town Hall Ventures, Tuck, etc. |
| **Gaurav Singal** (`Singal.txt`) | His Chief Data Officer stint at **Foundation Medicine** (past), his Innovation Growth Board seat at Mass General Brigham (current), Harvard Medical School (current, two nested roles), RotatingRoom (current). |

**Value:**
- Richer context for outreach prep.
- The Company detail page surfaces contacts tied to that company **including past employees**. ("Who do I know who ever worked at Foundation Medicine?" returns Gaurav.)

---

## 2. Design Decisions (revised per user feedback)

These decisions reflect the conversation and simplify substantially from the original draft:

### 2.1 Don't capture dates for past roles

Only the fact of a role and whether it's **current** or **past** matters. Every existing date-handling field (`startDate`, `endDate`) is left null. We keep the field on `EmploymentHistory` because the schema already has it and the UI already tolerates nulls; we simply don't populate it.

### 2.2 No `roleType` or `employmentType` fields

Treat board seats, advisory roles, volunteer positions, and regular jobs as the same thing — "a role at a company." No schema change for role categorization.

**Optional tag-board-positions variant:** if it turns out to be trivially easy, we could add a single `isBoardRole: Boolean @default(false)` on `EmploymentHistory` plus a small UI badge. Filed as a **stretch** item, not part of the core plan. Decision point flagged in §7.

### 2.3 Always resolve to a real `Company` row

Every role — current or past — maps to a real `Company` record (matched via `normalizeCompanyNameForDedupe` from the dedup engine built last session, or created fresh). **No `companyName` text fallback** for LinkedIn-imported roles. This ensures search "who was at Foundation Medicine?" works cleanly via the foreign-key relationship.

### 2.4 Skip student roles entirely

"Graduate Student", "Student" → filtered out during AI extraction. Not imported.

### 2.5 Skip roles without an identifiable company

If the LinkedIn entry lists the company as "Various" (or anything similar that isn't a real organization name), skip that role entirely.

### 2.6 Re-import behavior: add-only, never overwrite

If the contact already has roles recorded, re-importing **only adds missing roles** and silently dedupes the rest. No existing role is modified or deleted by the import. Dedup key: `companyId + title` (case-insensitive, trimmed).

### 2.7 Primary-company heuristic

When the contact has multiple current roles (Trevor has 5+), `Contact.companyId` = the **first non-student current role** from LinkedIn's order (LinkedIn orders by prominence/recency). Other current roles go into `additionalCompanyIds` with `isCurrent: true`.

---

## 3. Data Model — Where Each Role Lives

No schema change is required for the core plan. The existing tables cover everything:

| Kind of role | Where it's stored | Why |
|---|---|---|
| **Primary current** (one per contact) | `Contact.companyId` + `Contact.title` (user's current headline) | Already works this way |
| **Other current roles** | `Contact.additionalCompanyIds` JSON → `[{id, isCurrent: true}]` | Already exists; already surfaces the contact on the Company detail page via the substring query in [companies.ts:55-90](server/src/routes/companies.ts#L55-L90) |
| **Past roles** | `EmploymentHistory` rows with `contactId`, `companyId`, `title`; `startDate`/`endDate` left null | Foreign-key relation so the Company detail page can query "who used to work here?" via `prisma.employmentHistory.findMany({ where: { companyId } })` |

**Why past roles go into `EmploymentHistory` and not `additionalCompanyIds` with `isCurrent: false`:**
- `EmploymentHistory` preserves the **title** of the past role (e.g., "Chief Data Officer at Foundation Medicine"), which is useful context the user will actually want to see on the contact-detail page.
- `EmploymentHistory` has a real foreign-key relation to `Company`, making "past contacts of Company X" a clean Prisma query rather than a JSON substring match.
- The contact-detail page already has a "Previous Companies" card rendering `EmploymentHistory` — zero UI refactor on that surface.

**Why current-but-not-primary roles go into `additionalCompanyIds` and not `EmploymentHistory`:**
- The contact form already has UI for multi-current-company editing keyed to `additionalCompanyIds`.
- The Company detail page already surfaces those contacts via the existing substring-match query.
- Reusing the established pattern avoids a refactor of the form and contact-list filters.

**Optional (stretch): `isBoardRole` on `EmploymentHistory`.** If added, it only applies to past roles stored there. For current board seats, we'd either live without the flag or mirror it into the `additionalCompanyIds` JSON shape (`{id, isCurrent: true, isBoardRole: true}`). Deferred — see §7.

---

## 4. AI Prompt Changes ([server/src/routes/linkedin.ts](server/src/routes/linkedin.ts))

### 4.1 New output shape (minimal)

```json
{
  "name": "…",
  "title": "…",
  "company": "…",          // primary current company, derived server-side (back-compat)
  "location": "…",
  "about": "…",
  "skills": "…",
  "linkedinUrl": "…",
  "experience": [
    { "company": "American Rivers", "title": "Member Board of Directors", "isCurrent": true },
    { "company": "Oxeon", "title": "Chairman & Founder", "isCurrent": true },
    { "company": "Prep for Prep", "title": "Board of Trustees", "isCurrent": false },
    { "company": "Foundation Medicine", "title": "Chief Data Officer", "isCurrent": false }
  ]
}
```

Each experience entry is just `{ company, title, isCurrent }`. No dates, no role type.

### 4.2 Prompt rules to add

- Extract **every** role from the Experience section as an entry in `experience`.
- **Skip** if title contains "Student" / "Graduate Student" / "Undergraduate" / similar.
- **Skip** if company is "Various" or any obvious placeholder (not a real organization name).
- **`isCurrent: true`** if the role's date range ends in "Present" (or has no end date); otherwise `false`.
- **Nested roles** at the same company: emit each as its own entry sharing the same `company` name (Gaurav's Harvard Medical School case → two entries, both with `company: "Harvard Medical School"`).
- Preserve LinkedIn's top-to-bottom order (important for the primary-company heuristic).
- Everything from the existing prompt about ignoring navigation / activity / footer still applies.

### 4.3 Derive top-level `company` server-side

After the model returns the JSON, the server picks the first `isCurrent: true` entry as the flat `company` field (back-compat for the existing contact-form merge logic). If there are no current entries, omit the field.

### 4.4 Token budget

Current cap is 8000 chars (truncation in [linkedin.ts:48-49](server/src/routes/linkedin.ts#L48-L49)). Trevor's profile has ~6000 chars of Experience alone. Raise to **15000 chars** so full career history is visible to the model.

---

## 5. Import Flow (server recommendation: parse-only, client writes)

Per the user's agreement with §5 Option A in the original plan: the server stays parse-only, the client orchestrates writes. No new `/linkedin/apply` endpoint.

### 5.1 Client-side sequence when user clicks "Use This Data"

For each entry in `experience`:

1. **Resolve or create a Company row**:
   - Normalize company name with `normalizeCompanyNameForDedupe`.
   - Search existing companies for an exact-normalized match.
   - If found → use that `companyId`.
   - If not found → `POST /companies` to create a new one (defaults: `status: RESEARCHING`). Use the returned `id`.

2. **Partition into current vs. past**:
   - `isCurrent: true` → add `{ id, isCurrent: true }` to the contact's `companyEntries` form state.
   - `isCurrent: false` → queue up for `POST /employment-history` with `{ contactId, companyId, title }` (dates null).

3. **Set primary company**: first current, non-student entry in LinkedIn order. Already happens automatically via the existing `companyEntries` logic — the first entry becomes `Contact.companyId` on save.

4. **Re-import dedup** (§2.6):
   - Before creating an `EmploymentHistory` row, check the contact's existing history; skip if a row already exists with the same `companyId` and a case-insensitive `title` match.
   - Before adding to `companyEntries`, check if the same `companyId` is already present; skip if so (this already happens today).
   - Never update or delete an existing row.

### 5.2 Ordering / failure handling

- Company creations happen in parallel (independent) — one `Promise.all` over the experience list.
- EmploymentHistory inserts can also be parallelized after all Company IDs are resolved.
- On any individual failure, log to console + toast and continue with the rest. The contact save itself happens last (the form's usual auto-save path). The user can always re-import to retry failures.

---

## 6. UI Changes

### 6.1 Import dialog ([linkedin-import-dialog.tsx](client/src/components/linkedin-import-dialog.tsx))

**Preview step** — add an "Experience" section below the existing fields:

- Collapsible list of parsed roles.
- Each row shows: `{title} at {company}` + a small "Current" or "Past" tag.
- Each row has a checkbox (default checked) so the user can uncheck any role they don't want imported.
- Header summary: "Experience (12 roles — 5 current, 7 past)".
- If a matching company already exists in the DB, show a small "✓ matched" indicator so the user knows no duplicate will be created.

### 6.2 Contact detail page ([contact-detail.tsx](client/src/pages/contacts/contact-detail.tsx))

**Existing "Previous Companies" card** — keep as-is structurally. It already renders `EmploymentHistory` with title + company + (date range if present). With the new import, the dates will be absent (we're not capturing them), so the card should gracefully hide the `"(startDate — endDate)"` tail when both are null. That requires a one-line conditional tweak at [contact-detail.tsx:774-778](client/src/pages/contacts/contact-detail.tsx#L774-L778).

Rename card title from "Previous Companies" → **"Past Companies"** for clarity (trivial).

### 6.3 Company detail page

Should already surface both current contacts (via `Contact.companyId` + `additionalCompanyIds` substring match in [companies.ts:55-90](server/src/routes/companies.ts#L55-L90)) and past contacts (via the `employmentHistory` relation). Needs a QA pass to confirm the past-contact path actually renders — if the current company detail page only shows current contacts, we'll need to add a "Past contacts" section that queries `EmploymentHistory` by `companyId`.

### 6.4 Contact form

**No changes required for v1.** Form-based editing of past roles is deferred; the user can delete a past role individually by hitting `DELETE /employment-history/:id` manually if needed. If the UX feels missing once we're using the feature, add an "Edit past roles" section in a follow-up.

---

## 7. Phased Implementation

Atomic commits per phase, GSD-style.

| Phase | Scope | Risk |
|---|---|---|
| **1. Backend — parse** | Update OpenAI prompt to return `experience[]`. Raise char cap to 15000. Derive top-level `company` from first current entry. | Low (prompt iteration needed) |
| **2. Types** | Add `experience` to `LinkedInParsedData` in [linkedin-import-dialog.tsx](client/src/components/linkedin-import-dialog.tsx). No other schema or type changes. | Low |
| **3. Preview UI** | Extend the import dialog's preview step with the experience checklist. Show "✓ matched" where company resolves to existing DB row. | Medium (UI polish) |
| **4. Commit logic** | On "Use This Data", run: resolve-or-create Companies → partition current/past → update `companyEntries` for current → create `EmploymentHistory` for past → dedup against existing history. | Medium (ordering, partial failures) |
| **5. Detail page tweak** | Hide date-range tail when startDate/endDate both null; rename card "Past Companies". | Low |
| **6. QA — Company detail** | Verify the Company detail page surfaces past contacts. If not, add a "Past Contacts" section driven by `EmploymentHistory`. | Unknown until verified |
| **7. QA — end-to-end** | Import Trevor → confirm American Rivers becomes a Company with Trevor shown as a current contact, Prep for Prep becomes a Company with Trevor as a past contact, student role is skipped. Import Gaurav → Foundation Medicine as past contact with "Chief Data Officer" title. Re-import same profile → no duplicates, no overwrites. Mobile (390px). | — |
| **Stretch (optional)** | Add `isBoardRole: Boolean` to `EmploymentHistory` schema; AI extracts a simple board flag; UI shows a "Board" badge on past roles. Only if trivially easy once Phases 1–7 are in. | Low if scoped tightly |

---

## 8. Files That Will Change

| File | Change |
|---|---|
| [server/src/routes/linkedin.ts](server/src/routes/linkedin.ts) | Prompt rewrite; derive top-level `company` from `experience`; raise char cap |
| [client/src/components/linkedin-import-dialog.tsx](client/src/components/linkedin-import-dialog.tsx) | Add `experience` to type; preview-step experience list with checkboxes |
| [client/src/pages/contacts/contact-form.tsx](client/src/pages/contacts/contact-form.tsx) | `onImport` resolves/creates Companies, partitions current/past, writes `companyEntries` and `EmploymentHistory` |
| [client/src/pages/contacts/contact-detail.tsx](client/src/pages/contacts/contact-detail.tsx) | Hide date-range tail when null; rename card |
| [client/src/pages/companies/company-detail.tsx](client/src/pages/companies/company-detail.tsx) *(if needed)* | Add "Past Contacts" section from `EmploymentHistory` — pending Phase 6 verification |

No database schema migration required for the core plan. The **stretch** `isBoardRole` field would be the only schema change and is optional.

---

## 9. Risks & Mitigations

- **LLM misses a past role or mislabels current/past.** Mitigation: user-visible preview checklist lets them uncheck/untick before commit; re-importing only adds, never overwrites.
- **Company-duplicate creation.** Mitigation: reuse `normalizeCompanyNameForDedupe` from the dedup engine before creating a new Company.
- **Vercel 30s timeout during bulk import.** Trevor's profile could trigger ~15 Company creates + ~10 EmploymentHistory inserts. Each is sub-second, but serialized they could approach the timeout. Mitigation: `Promise.all` to parallelize independent writes.
- **Company detail page doesn't show past contacts yet.** Unknown until Phase 6. If missing, we add a small section. Not a blocker for the import itself.
- **"Harvard Medical School" nested roles produce two EmploymentHistory rows** with the same `companyId` but different titles (Attending Physician + Faculty). That's correct behavior — the user sees two distinct past/current roles in the timeline.

---

## 10. Ready to implement

All earlier open questions are resolved. The only remaining decision is whether to include the **stretch `isBoardRole` tag** (§2.2, §7) — which I'd recommend deciding after Phase 7 QA, when we can judge how often we wish we had it.

Suggested starting commit: **Phase 1 (backend prompt)**.
