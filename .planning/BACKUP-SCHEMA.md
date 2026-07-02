# SearchBook Backup File Schema

A reference for an agent that searches SearchBook data out of the JSON backup files
(e.g. "tell me everything I know about Vivek Garg", "what did Tricia Elliott tell me
about Sarah Shih"). SearchBook is a single-user executive networking / stakeholder CRM.

---

## 1. File shape

A backup is **one JSON object**. Each key is a table name whose value is an **array of
row objects**, plus a `_meta` header:

```json
{
  "_meta": { "exportedAt": "2026-07-02T14:03:11.482Z", "version": 7 },
  "Contact": [ { "id": 1, "name": "Vivek Garg", ... }, ... ],
  "Company": [ ... ],
  "Conversation": [ ... ],
  ...
}
```

- **`_meta.exportedAt`** — ISO timestamp of when the backup was taken.
- **`_meta.version`** — schema version (currently `7`).
- Every other top-level key is a table (see §4). A table key may be **missing or an empty
  array** if there are no rows — always guard for that.
- There is **no nesting**: relationships are expressed by integer foreign-key columns and
  by junction (join) tables, exactly like a relational DB. The agent joins them itself.

### Two producers, same shape, different value encodings
The identical structure is produced by two code paths, but **primitive values are encoded
differently** and you must normalize:

| Value kind | Server export (`/api/backup/export`) | Browser-direct Turso export (the usual production backup) |
|---|---|---|
| Booleans (`flagged`, `completed`, `notify`, `owedByMe`, `recurring`, `archived`) | `true` / `false` | **`1` / `0`** (integers) |
| `createdAt` / `updatedAt` | ISO string `"2026-02-06T16:18:17.954+00:00"` | may be an ISO string, a **Unix ms integer** (`1770157191736`), or a raw SQLite string `"2026-02-08 15:39:27"` |
| Missing/absent value | `null` | `null` |

**Normalization rules for the agent:**
- Treat a boolean field as true if the value is `true` **or** `1`.
- To parse a timestamp: if it's a number → `new Date(n)`; if it contains `"T"` → parse as
  ISO; otherwise it's `"YYYY-MM-DD HH:MM:SS"` → replace the space with `T` and append `Z`.
- Date-only fields (`dueDate`, `date`, `startDate`, etc.) are plain strings — see §3.

---

## 2. Entity map (the "who/what" model)

The three primary entities and how they connect:

- **Contact** — a person. The hub of most searches.
- **Company** — an organization (a.k.a. "org").
- **Conversation** — a **meeting / interaction record** (call, email, meeting, coffee, etc.).

Everything else hangs off these: **Actions** (to-dos), **Ideas**, **Links**, **PrepNotes**
(prep/dossier snippets), **Tags**, **EmploymentHistory**, **Relationships** (person↔person),
and status-history/activity logs.

### The critical modeling nuance: a Conversation has FOUR independent "who" facets
This is what makes "what did X tell me about Y" answerable. A single meeting can involve:

1. **Anchor contact** — `Conversation.contactId` (the legacy 1:1 case; the "primary" person).
2. **Participants** — people who attended → **`ConversationParticipant`** junction. Each row
   can carry a per-person `note` (the takeaway from that attendee) and an `ordering`.
3. **Contacts discussed** — people *talked about* but not present → **`ConversationContact`**.
4. **@-Mentions** — people/orgs referenced inline in the note text → **`ConversationMention`**
   (may point to a real contact/company, or be a "loose" name not yet in the CRM).

Analogously for orgs: `Conversation.companyId` (primary org the meeting was *with*),
**`ConversationOrg`** (additional orgs the meeting was with), and **`ConversationCompany`**
(orgs *discussed*).

> **"What did Tricia tell me about Sarah?"** → Find Conversations where Tricia is the anchor
> (`contactId`) or a Participant (`ConversationParticipant.contactId`), AND Sarah appears as
> a discussed contact (`ConversationContact`), a participant, or a mention
> (`ConversationMention`) — then read that meeting's `summary`, `notes`, `nextSteps`, and
> Tricia's participant `note`.

---

## 3. Conventions used across tables

- **Primary key**: every table has an integer `id` (except pure junction tables, which use a
  composite key of the two foreign keys — see §4).
- **Foreign keys**: columns ending in `Id` (e.g. `companyId`, `contactId`, `conversationId`,
  `seriesId`, `referredById`) reference the `id` of the named table. Nullable FKs mean the
  link is optional.
- **Enum fields are plain strings.** Known value sets are listed per field in §4. Treat them
  case-sensitively as stored (all UPPER_SNAKE_CASE), but be tolerant — the app has evolved.
- **Date-only strings** (`date`, `dueDate`, `completedDate`, `startDate`, `endDate`,
  `recurringEndDate`, `lastNotifiedAt`): usually `"YYYY-MM-DD"`. `startDate`/`endDate` in
  employment may be just `"YYYY-MM"` or `"YYYY"`. `endDate = null` on employment = current job.
- **Time-of-day strings**: `Action.dueTime` and `Conversation.startTime` are `"HH:MM"` 24h
  local time (or `null`).
- **JSON-encoded string columns** — these hold JSON **as a string**, so `JSON.parse` them:
  - `Contact.additionalCompanyIds` → e.g. `"[2, 5, 7]"` (IDs of additional current companies).
    *(Note: comment in code says objects `{id,isCurrent}` but the schema stores an ID array —
    expect either an array of ints or an array of `{id,isCurrent}` objects; handle both.)*
  - `Contact.connectedCompanyIds` → `"[2, 5, 7]"` (connected companies).
  - `Contact.additionalEmails` → `'["a@x.com","b@y.com"]'`.
  - `Action.owerContactIds` → `"[3, 9]"` (contact IDs who owe the action).
  - `Idea.tags` → legacy comma-separated string (superseded by the `IdeaTag` junction).
- **Free-text / markdown fields** (the richest search targets): `Contact.notes`,
  `personalDetails`, `openQuestions`, `usefulFor`, `roleDescription`, `howConnected`,
  `mutualConnections`, `whereFound`; `Company.notes`; `Conversation.summary`, `notes`,
  `nextSteps`; `Action.description`; `PrepNote.content` / `CompanyPrepNote.content` /
  `ConversationPrepNote.content`; `CompanyActivity.notes`; `Relationship.notes`.

---

## 4. Tables

Legend: **PK** = primary key, **FK→X** = foreign key to table X, `?` = nullable/optional.
Junction tables have a composite PK of their two FKs and represent many-to-many links.

### Contact — a person
| Field | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `name` | string | Formal name (kept clean for joins/exports). |
| `preferredName` | string? | How to address/pronounce; UI shows `name (preferredName)`. |
| `title` | string? | Job title. |
| `roleDescription` | string? | |
| `companyId` | int? FK→Company | Primary current company. |
| `companyName` | string? | Denormalized/free-text company name (fallback when no `companyId`). |
| `additionalCompanyIds` | JSON string? | Other current companies (array of IDs). |
| `connectedCompanyIds` | JSON string? | Connected companies (array of IDs). |
| `ecosystem` | string enum | `PAYER, PROVIDER, GOVERNMENT, ACADEMIA, HEALTH_TECH, POLICY, MEDIA, FUNDER, NCQA, NETWORK, RECRUITER`. |
| `email` | string? | Primary email. |
| `additionalEmails` | JSON string? | Array of extra emails. |
| `phone` | string? | |
| `linkedinUrl` | string? | |
| `location` | string? | |
| `photoUrl` / `photoFile` | string? | Image reference (binary not in JSON backup). |
| `status` | string enum | `NONE (blank), NEW, RESEARCHING, CONNECTED, AWAITING_RESPONSE, FOLLOW_UP_NEEDED`. |
| `howConnected` | string? | |
| `referredById` | int? FK→Contact | Self-reference: who referred this person. |
| `mutualConnections` | string? | |
| `whereFound` | string? | |
| `openQuestions` | string? | Free text. |
| `notes` | string? | **Main notes (markdown).** |
| `personalDetails` | string? | Free text (family, interests, etc.). |
| `usefulFor` | string? | What this person could help NCQA with; non-empty = a "useful person". |
| `flagged` | bool | |
| `createdAt` / `updatedAt` | datetime | See §1 encoding. |

### Company — an organization
| Field | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `name` | string | |
| `industry` | string? | |
| `size` | string? | |
| `website` | string? | |
| `hqLocation` | string? | |
| `notes` | string? | markdown |
| `status` | string enum | `NONE (blank), RESEARCHING, ENGAGED, PARTNER, CONNECTED`. |
| `createdAt` / `updatedAt` | datetime | |

### Conversation — a meeting / interaction (see §2 for the 4 "who" facets)
| Field | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `contactId` | int? FK→Contact | Anchor person (legacy 1:1 case). |
| `title` | string? | Meeting title / series key ("Weekly VP meeting"). |
| `companyId` | int? FK→Company | Primary org the meeting was *with*. |
| `attendeesDescription` | string? | Free-text attendee list (when not modeled as participants). |
| `date` | string | Meeting date, `"YYYY-MM-DD"` (precision varies, see next). |
| `datePrecision` | string enum | `DAY, MONTH, QUARTER, YEAR`. |
| `type` | string enum | `CALL, EMAIL, MEETING, LINKEDIN, COFFEE, EVENT, OTHER`. |
| `summary` | string? | **Short summary.** |
| `notes` | string? | **Full meeting notes (markdown). Prime search target.** Contains `@[Name](…)` mention tokens. |
| `nextSteps` | string? | |
| `startTime` | string? | `"HH:MM"` local. |
| `photoFile` | string? | |
| `calendarUid` | string? | Outlook ICS UID (for import dedup). |
| `seriesId` | int? FK→Series | Recurring-meeting series. |
| `createdAt` / `updatedAt` | datetime | |

### Series — a recurring-meeting series
`id` PK, `name` string, `createdAt`. Parent of `Conversation.seriesId`.

### ConversationParticipant — junction: people who ATTENDED a meeting
Composite PK (`conversationId`, `contactId`). FK→Conversation, FK→Contact.
- `note` string? — **per-attendee takeaway** (e.g. "skeptical of digital-first HEDIS").
- `ordering` int — attendee order in the meeting.

### ConversationContact — junction: people DISCUSSED (mentioned as topic) in a meeting
Composite PK (`conversationId`, `contactId`).

### ConversationMention — people/orgs @-mentioned inline in a meeting's notes
| Field | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `conversationId` | int FK→Conversation | |
| `kind` | string enum | `CONTACT` or `COMPANY`. |
| `contactId` | int? FK→Contact | Set if it points to a known contact. |
| `companyId` | int? FK→Company | Set if it points to a known org. |
| `mentionedName` | string | The typed display name (always present; the only value for a "loose" mention where both IDs are null). |
| `createdAt` | datetime | |
> Derived from the note text on every save; the note text is the source of truth.

### ConversationOrg — junction: additional orgs the meeting was WITH
Composite PK (`conversationId`, `companyId`). (Beyond the anchor `Conversation.companyId`.)

### ConversationCompany — junction: orgs DISCUSSED in a meeting
Composite PK (`conversationId`, `companyId`).

### ConversationTag — junction: tags on a meeting
Composite PK (`conversationId`, `tagId`).

### ConversationPrepNote — prep note attached to a specific meeting
`id` PK, `content` (markdown), `url?`, `urlTitle?`, `date` (`YYYY-MM-DD`), `ordering`,
`conversationId` FK→Conversation, `createdAt`.

### ConversationAttachment — file attached to a meeting
`id` PK, `conversationId` FK, `url`, `name` (filename), `mimeType?`, `size?` (bytes),
`createdAt`. *(The binary itself is NOT in the JSON backup — only this metadata row.)*

### Action — a to-do / follow-up task
| Field | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `title` | string | |
| `description` | string? | markdown |
| `type` | string enum | `EMAIL, CALL, READ, WRITE, RESEARCH, FOLLOW_UP, INTRO, OTHER`. |
| `dueDate` | string? | `"YYYY-MM-DD"`. |
| `dueTime` | string? | `"HH:MM"` local. |
| `notify` | bool | Opt-in reminder. |
| `lastNotifiedAt` | string? | ISO timestamp reminder last fired. |
| `completed` | bool | |
| `completedDate` | string? | |
| `contactId` | int? FK→Contact | Legacy single link (see also `ActionContact`). |
| `companyId` | int? FK→Company | Legacy single link (see also `ActionCompany`). |
| `conversationId` | int? FK→Conversation | |
| `priority` | string enum | `HIGH, MEDIUM, LOW`. |
| `direction` | string enum | `OWED_BY_ME, WAITING_ON_THEM` (derived mirror of below). |
| `owedByMe` | bool | Am I on the hook? |
| `owerContactIds` | JSON string? | Contact IDs who owe it. |
| `recurring` | bool | |
| `recurringIntervalDays` | int? | |
| `recurringEndDate` | string? | |
| `createdAt` / `updatedAt` | datetime | |

### ActionContact / ActionCompany — junctions: multi-link actions to people/orgs
`ActionContact`: PK (`actionId`, `contactId`). `ActionCompany`: PK (`actionId`, `companyId`).
> An action's associated people = union of the legacy `Action.contactId` **and** `ActionContact` rows.

### Idea — a captured idea
`id` PK, `title`, `description?` (markdown), `tags?` (legacy CSV string), `archived` bool,
`createdAt`. Linked to people/orgs/tags via the junctions below.

### IdeaContact / IdeaCompany / IdeaTag — junctions off Idea
`IdeaContact`: PK (`ideaId`, `contactId`). `IdeaCompany`: PK (`ideaId`, `companyId`).
`IdeaTag`: PK (`ideaId`, `tagId`).

### Tag + junctions — shared free-form labels
- **Tag**: `id` PK, `name` (unique string). The reserved name **`Favorite`** marks favorite
  contacts (via `ContactTag`) — there is no dedicated favorite column.
- **ContactTag**: PK (`contactId`, `tagId`).
- **CompanyTag**: PK (`companyId`, `tagId`).
- (Meeting tags = `ConversationTag`; idea tags = `IdeaTag`.)
> To resolve a tag on any entity: join the junction row's `tagId` to `Tag.id` → `Tag.name`.

### EmploymentHistory — a person's past/current role
`id` PK, `contactId` FK→Contact, `companyId?` FK→Company, `companyName?` (fallback text),
`title?`, `startDate?` (`YYYY-MM`/`YYYY`), `endDate?` (`null` = current), `createdAt`.

### Relationship — a person↔person edge
`id` PK, `fromContactId` FK→Contact, `toContactId` FK→Contact,
`type` string enum (`REFERRED_BY, WORKS_WITH, KNOWS, INTRODUCED_BY, REPORTS_TO`),
`notes?`. Directed edge (from → to).
> Note: `Contact.referredById` is a *separate* self-reference for "who referred me to them".

### Link — a URL attached to a contact/company/action
`id` PK, `url`, `title`, `description?`, `contactId?`, `companyId?`, `actionId?`, `createdAt`.

### PrepNote — prep snippet for a contact
`id` PK, `content` (markdown), `url?`, `urlTitle?`, `date` (`YYYY-MM-DD`), `ordering`,
`contactId` FK→Contact, `createdAt`.

### CompanyPrepNote — research dossier snippet for a company
Same shape as PrepNote but `companyId` FK→Company instead of `contactId`.

### CompanyActivity — company-level event log
`id` PK, `companyId` FK→Company, `date` (`YYYY-MM-DD`),
`type` enum (`APPLIED, EMAIL, CALL, MEETING, RESEARCH, FOLLOW_UP, OTHER`),
`title`, `notes?` (markdown), `createdAt`.

### ContactStatusHistory / CompanyStatusHistory — status-transition logs (analytics)
`id` PK, (`contactId` | `companyId`) FK, `oldStatus?`, `newStatus`, `createdAt`.

### DismissedDuplicate / DuplicateMergeRule — dedup bookkeeping (rarely useful for search)
Duplicate-management preferences keyed by normalized names. Present in the backup but
almost never relevant to a "what do I know about X" query — safe to ignore.

---

## 5. Tables NOT in the backup
Deliberately excluded (so don't expect them): **`PushSubscription`** (per-device Web-Push
keys) and **`DeletedSnapshot`** (the undo stack). Both are ephemeral, not user content.
Also, **binary files** (contact/company photos, meeting attachments) are not in the JSON —
only their path/URL/metadata references (`photoFile`, `photoUrl`, `ConversationAttachment`).

---

## 6. Worked query recipes

**"Everything I know about Vivek Garg":**
1. Find `Contact` where `name` (or `preferredName`) matches "Vivek Garg" → get `contactId`.
2. Read the contact's own fields (notes, personalDetails, title, usefulFor, status, ecosystem…).
3. Resolve company: `companyId` → `Company`; plus `additionalCompanyIds`/`connectedCompanyIds`
   (parse JSON) → `Company` rows; plus `EmploymentHistory` where `contactId` matches.
4. Tags: `ContactTag` where `contactId` matches → `Tag.name`.
5. Meetings involving him: `Conversation` where `contactId` = his, **union**
   `ConversationParticipant`, `ConversationContact`, and `ConversationMention` rows with his
   `contactId`. Read each meeting's `summary`/`notes`/`nextSteps` (+ his participant `note`).
6. Actions: `Action.contactId` = his, union `ActionContact`, union `owerContactIds` (parse JSON).
7. Ideas: `IdeaContact`. Links: `Link.contactId`. Prep: `PrepNote.contactId`.
8. Relationships: `Relationship` where `fromContactId`/`toContactId` = his; plus `referredById`
   chains in `Contact`.

**"What did Tricia Elliott tell me about Sarah Shih":**
1. Resolve both contact IDs by name.
2. Find Conversations where Tricia is anchor (`contactId`) or a Participant.
3. Intersect with Conversations where Sarah appears (Participant / `ConversationContact` /
   `ConversationMention`).
4. Return each matching meeting's `date`, `summary`, `notes`, `nextSteps`, and Tricia's
   `ConversationParticipant.note`. Also scan Tricia-meeting `notes` text for Sarah's name /
   `@[Sarah Shih]` mention tokens even if no structured link exists.

**General name-matching tips:** names live in `Contact.name`; a person may also be referenced
by free text in `companyName`, `attendeesDescription`, note bodies, or as a loose
`ConversationMention.mentionedName` with null IDs. For robust recall, match both the
structured `contactId` links **and** substring-search the free-text/markdown fields.
