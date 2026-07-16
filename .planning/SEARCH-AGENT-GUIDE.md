# SearchBook — Search Agent Guide

**Read this first.** It tells a search / synthesis agent **which exported file to use**
and **how the recommended file is structured**. SearchBook is a single-user executive
stakeholder / networking CRM; the owner logs meetings, people, and organizations and then
points an LLM agent at an export to answer questions like *"identify every organizational
dysfunction I've documented in meetings"* or *"what has Sarah Shih told me about HEDIS?"*.

---

## 1. Which file to use

A manual backup downloads **three files**. Pick by task:

| File | What it is | Use it for |
|------|-----------|------------|
| **`searchbook-notes-<timestamp>.md`** | Human-readable markdown: **all prose content** — meetings, people (incl. dossier prep notes), organizations, and ideas — every ID resolved to a name, notes as real multi-line text. | **Search, reading, and synthesis. The correct file for any question about what was said, discussed, noted, or ideated.** |
| `searchbook-backup-<timestamp>.json` | Faithful database dump (every table, every column, foreign-key IDs, exact encodings). | **Structured / metadata queries only:** exact timestamps, counts, IDs, status-history transitions, precise relational joins. See `BACKUP-SCHEMA.md`. |
| `searchbook-files.zip` | The actual binary bytes — contact/company photos, meeting attachments (decks, PDFs), and pasted screenshots — plus a `manifest.json`. | Only when a question needs the *contents of an image or attachment*. The markdown marks these spots with `[image]`. |

### Routing rule

- **Prose, themes, who-said-what, what-do-I-know-about-X, ideas, prep notes → `notes.md`.**
  The markdown is the **complete prose corpus**: every meeting, person, org, and idea the owner
  has written about is in it. A question like *"legal risks I've noted in meetings or ideas"* or
  *"everyone at CMS I've discussed AI with"* is answerable **entirely from this one file** — no
  need to open the JSON, and no risk of silently missing a whole content type.
- **Exact numbers, dates, history, counts, IDs → `backup.json`.** Reach for it only when the
  answer is a precise structured fact ("how many meetings in Q2", "when did this contact become
  CLIENT", exact `updatedAt` values) rather than prose.
- **Image / attachment contents → `searchbook-files.zip`.**

Default to the `.md`. It is ~4× smaller than the JSON, greppable line by line, and every record
is self-contained. You should not need to combine files for a normal search or synthesis task.

---

## 2. Structure of the markdown file

The document opens with a title, a one-paragraph orientation, and a stats line:

```
# SearchBook export for search / synthesis
...
Generated 2026-07-16T19:15:30.197Z · 324 meetings · 485 people · 794 organizations · 25 ideas.
```

The `Generated` timestamp is the **snapshot time** — everything is as of that instant.

Then four top-level sections, in order: **`## Meetings`**, **`## People`**, **`## Organizations`**,
**`## Ideas`**.

### 2.1 `## Meetings` — newest first (the primary record)

Each meeting is one `###` block. Order is **most recent first**. Shape:

```
### 2026-07-16 09:30 — Meet and Greet Julie Seibert and Ari Robicsek
Type: MEETING · Series: QMRG VP/AVP Huddle · With: NCQA · Tags: strategy

**Attendees:**

- Julie Seibert — skeptical of digital-first HEDIS
- Ari Robicsek

**People discussed:** Sarah Shih, Caroline Blaum
**Orgs discussed:** The Joint Commission (TJC), CARF International

**Summary:**

<summary prose, if any>

**Notes:**

<the full meeting note, as real multi-line markdown>

**Next steps:**

<next-steps prose>

**Prep note:**

<pre-meeting prep, if any>

**Actions:**

- [done] Send Julie the measures deck (due 2026-07-18) — include the MIDS summary
- Follow up on CCBHC accreditation question
```

Field notes:

- **Heading date** honors the meeting's precision: a full `YYYY-MM-DD HH:MM` for a normal
  meeting, or a coarser `2026-07 (month)` / `2026 (year)` when only the month/year is known.
- The **meta line** (`Type · Series · With · Tags`) omits any part that's absent. `With:` is
  the organization(s) the meeting was *with*; `Org:` appears instead when only a single anchor
  org is set. This is distinct from **`Orgs discussed:`** (organizations merely talked about).
- **`**Attendees:**`** lists each participant, and the text after `—` is **that person's
  individual takeaway** from the meeting (e.g. their stance, what they said). When a meeting
  has no structured participants, you'll instead see a free-text `**Attendees:** <description>`.
- **`**Notes:**`** is the single source of truth for what happened. Treat it as primary; the
  summary and per-attendee lines are secondary.

### 2.2 `## People` — alphabetical, every contact

Each contact is one `###` block (all contacts appear, even sparse ones):

```
### Aaron Baum
*VP Analytics & Economics · Waymark*
Ecosystem: NETWORK · Status: CONNECTED · Location: Greater Boston · Referred by: Michael Rubin · Also affiliated: Mount Sinai

**Notes:**

<free-text profile notes>

**Personal details:**   <...>
**Useful for:**         <...>
**Open questions:**     <...>

**Prep notes:**

(2026-07-01) <free-text research/prep prose about this person, one block per note>

**Career history:**

- VP Analytics & Economics, Waymark (2022–present)
- Assistant Professor, Mount Sinai (2016–2022)

**Relationships:**

- KNOWS: Michael Rubin — former colleague

**Open actions:**

- Intro Aaron to the measurement team (due 2026-07-20)
```

Any block whose underlying field is empty is simply omitted. `Prep notes` are the owner's
free-text dossier prep on that person (each prefixed with its date). `Career history` comes from
the contact's employment records; `Relationships` are explicit person-to-person links.

### 2.3 `## Organizations` — alphabetical, content-bearing orgs only

Only organizations with an industry, website, HQ, notes, or prep notes appear here (an org that
exists solely as someone's employer is named wherever it's referenced but doesn't get its own
block):

```
### National Committee for Quality Assurance (NCQA)
Industry: Healthcare · HQ: Washington, DC · Status: CLIENT · Web: ncqa.org

**Notes:**

<org-level notes>

**Prep notes:**

(2026-06-20) <free-text research/prep prose about this org>
```

### 2.4 `## Ideas` — active first, then archived

Standalone ideas the owner has jotted (strategy notes, opportunities, product ideas). Active
ideas come first; **archived ones are included and labeled `(archived)` in the heading** — treat
them as parked/older, not current priorities. Each block:

```
### Measure decision-making quality under AI
Tags: Commercial opportunity · People: Sarah Shih · Orgs: National Committee for Quality Assurance (NCQA)

<the idea's description, as prose>
```

`Tags`, `People`, and `Orgs` are the idea's linked entities (resolved to names); any that are
absent are omitted. An idea with only a title (no description or links) shows just its heading —
the title itself is the content.

---

## 3. Conventions the agent must know

- **All IDs are resolved to names.** The same person or org is written the **same way
  everywhere**, so you can grep a name (e.g. `Sarah Shih`) to find every meeting they attended,
  every meeting where they were discussed, and their own profile block.
- **`@Name`** inside note text marks an **explicit @-mention** — someone or some org the owner
  deliberately called out while writing that note. It's a stronger signal than a name that
  merely appears in prose. (People and orgs both get `@`.)
- **`[image]`** (or `[image: caption]`) marks a **pasted screenshot or embedded image**. The
  bytes are **not** in this file — they're in `searchbook-files.zip` (see its `manifest.json`).
  If a question hinges on an image's contents, go to the ZIP.
- **The owner writes in terse shorthand** — abbreviations (`Q` = quality, `BH` = behavioral
  health, `HEDIS`, `CCBHC`, org acronyms), arrows (`-->`), and clipped sentences are normal.
  Interpret in context; don't treat shorthand or missing punctuation as errors, and don't
  invent facts to fill gaps.
- **Meetings are newest-first; dates live in the headings.** Use them to reason about
  chronology and change over time.

## 4. How to answer common questions

- **Thematic synthesis** ("organizational dysfunctions", "recurring risks", "legal exposure"):
  scan the `**Notes:**`, `**Summary:**`, and `**Next steps:**` bodies under `## Meetings`, the
  `**Notes:**` and `**Prep notes:**` under `## People`/`## Organizations`, **and the descriptions
  under `## Ideas`**. A theme can live in any of them — cover all four sections before concluding
  you've found everything. Quote the heading (meeting date + title, or person/org/idea name) as
  your citation.
- **"…in meetings and/or ideas/notes"**: everything is in this one file — search `## Meetings`
  bodies and `## Ideas` descriptions (and prep notes) together. Do **not** assume a content type
  is missing and fall back to another file; if it's prose, it's here.
- **Everything about one person**: grep their name. Their `## People` block is the profile;
  their name under `**Attendees:**` or `**People discussed:**` in `## Meetings` gives the
  interaction history, the `—` takeaway lines capture what they specifically said, and `## Ideas`
  shows ideas they're linked to.
- **What one person said about another**: find meetings where the speaker is an attendee, then
  read that meeting's notes and the speaker's takeaway line.
- **Time-bounded questions**: filter by the dates in meeting headings before reading bodies.

## 5. Caveats

- This file is a **read/search artifact, not a restore source** — never treat it as the backup
  of record. The JSON is the backup.
- It's a **snapshot** as of the `Generated` timestamp; later edits aren't reflected until the
  next export.
- Fields intentionally omitted for signal (internal IDs, created/updated timestamps, photo
  URLs, calendar UIDs). If you truly need one, use the JSON — its schema is documented in
  [`BACKUP-SCHEMA.md`](./BACKUP-SCHEMA.md).
