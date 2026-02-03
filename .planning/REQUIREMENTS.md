# SearchBook — Requirements

## Data Model

### Contacts
| Field | Type | Notes |
|-------|------|-------|
| id | int (PK) | Auto-increment |
| name | string | Required |
| title | string | Job title / role |
| companyId | FK → Company | Optional link to company entity |
| companyName | string | Freetext fallback if company not in DB |
| ecosystem | enum | RECRUITER, ROLODEX, TARGET, INFLUENCER, ACADEMIA, INTRO_SOURCE |
| email | string | Optional |
| phone | string | Optional |
| linkedinUrl | string | Optional |
| location | string | City / Region |
| photoUrl | string | URL to external photo (e.g. LinkedIn) |
| photoFile | string | Path to locally uploaded photo |
| status | enum | NEW, CONNECTED, AWAITING_RESPONSE, FOLLOW_UP_NEEDED, WARM_LEAD, ON_HOLD, CLOSED |
| howConnected | string | How you know them or who introduced you |
| referredById | FK → Contact | Self-referential: who connected you |
| mutualConnections | text | Who you know in common |
| whereFound | text | Where you've seen their work |
| openQuestions | text | Things you still need to learn about/from them |
| notes | text | General personalized research notes |
| createdAt | datetime | Auto |
| updatedAt | datetime | Auto |

### Companies
| Field | Type | Notes |
|-------|------|-------|
| id | int (PK) | Auto-increment |
| name | string | Required |
| industry | string | Optional |
| size | string | e.g. "500-1000", "Fortune 500" |
| website | string | Optional |
| hqLocation | string | Optional |
| notes | text | Why this company is a target, relevant info |
| status | enum | RESEARCHING, ACTIVE_TARGET, CONNECTED, ON_HOLD, CLOSED |
| createdAt | datetime | Auto |
| updatedAt | datetime | Auto |

### Tags (many-to-many with Contacts and Companies)
| Field | Type |
|-------|------|
| id | int (PK) |
| name | string (unique) |

Junction tables: `ContactTag`, `CompanyTag`

### Conversations
| Field | Type | Notes |
|-------|------|-------|
| id | int (PK) | Auto-increment |
| contactId | FK → Contact | Required |
| date | string | Flexible: "2026-01-15" or "2026-01" or "2025-Q4" |
| datePrecision | enum | DAY, MONTH, QUARTER, YEAR — controls display |
| type | enum | CALL, EMAIL, MEETING, LINKEDIN, COFFEE, EVENT, OTHER |
| summary | text | Brief description of what was discussed |
| notes | text | Detailed notes |
| nextSteps | text | What was agreed for follow-up |
| photoFile | string | Optional photo from meeting |
| createdAt | datetime | Auto |

### Actions
| Field | Type | Notes |
|-------|------|-------|
| id | int (PK) | Auto-increment |
| title | string | Required — what to do |
| description | text | Optional details |
| type | enum | EMAIL, CALL, READ, WRITE, RESEARCH, FOLLOW_UP, INTRO, OTHER |
| dueDate | date | When it's due |
| completed | boolean | Default false |
| completedDate | date | When it was done (nullable) |
| contactId | FK → Contact | Optional — linked to a person |
| companyId | FK → Company | Optional — linked to a company |
| conversationId | FK → Conversation | Optional — spawned from a conversation |
| priority | enum | HIGH, MEDIUM, LOW |
| recurring | boolean | Default false |
| recurringIntervalDays | int | e.g. 7, 14, 30, 90 |
| recurringEndDate | date | Optional end date for recurrence |
| createdAt | datetime | Auto |
| updatedAt | datetime | Auto |

### Ideas
| Field | Type | Notes |
|-------|------|-------|
| id | int (PK) | Auto-increment |
| title | string | Required |
| description | text | Details |
| tags | string | Comma-separated or via junction table |
| createdAt | datetime | Auto |

### Links
| Field | Type | Notes |
|-------|------|-------|
| id | int (PK) | Auto-increment |
| url | string | Web URL or Google Drive link |
| title | string | Display name |
| description | text | Optional context |
| contactId | FK → Contact | Optional |
| companyId | FK → Company | Optional |
| createdAt | datetime | Auto |

### Relationships (junction table for contact-to-contact)
| Field | Type | Notes |
|-------|------|-------|
| id | int (PK) | Auto-increment |
| fromContactId | FK → Contact | |
| toContactId | FK → Contact | |
| type | enum | REFERRED_BY, WORKS_WITH, KNOWS, INTRODUCED_BY, REPORTS_TO |
| notes | text | Optional context |

---

## Features — Phase Allocation

### Phase 1: Foundation
- Project scaffolding (Vite + React + Express + Prisma + SQLite)
- Database schema creation (all tables above)
- Contact CRUD (create, read, update, delete) with all fields
- Company CRUD with all fields
- Contact list view with basic table display
- Company list view
- Contact detail page (shows all fields, linked company, notes)
- Single `npm start` to launch everything

### Phase 2: Actions & Calendar
- Action CRUD with all fields
- Daily view: "What do I need to do today" — shows today's due actions
- Calendar month view (FullCalendar) showing actions by due date
- Week view in calendar
- Quick-add command palette (Ctrl+K or similar hotkey)
  - Quick add a contact
  - Quick add an action
  - Quick add a note/idea
- Link actions to contacts and conversations
- "Contacts without a next action" nudge list
- Action completion (mark done, records completedDate)
- Overdue actions highlighting

### Phase 3: Conversations & Relationships
- Conversation CRUD with flexible date entry (day, month, or quarter precision)
- Conversation logging tied to contacts
- Ability to create follow-up actions directly from a conversation's "next steps"
- Relationship tracking between contacts (referred_by, knows, etc.)
- Contact detail page enhanced: shows conversations, actions, relationships, links
- "Prep sheet" view: optimized pre-call review showing last conversation, open questions, relationship history
- Drag-and-drop photo upload for contacts (JPG/PNG)
- Photo URL support (paste a link)
- Meeting photo upload on conversations

### Phase 4: Search, Import & Tags
- Global search across contacts and companies (by name, role, company, keywords, ecosystem, status)
- Date-range search (find contacts by date of last outreach)
- Tag management (create, edit, delete tags)
- Tag contacts and companies
- Filter contacts by ecosystem, status, tags, company
- CSV bulk import for contacts (with field mapping UI)
- CSV export
- Ideas/notes scratchpad (CRUD for Ideas entity)
- Links management (CRUD, linked to contacts/companies)

### Phase 5: Recurring Tasks & Weekly Dashboard
- Recurring action support (auto-creates next instance when completed)
- Configurable intervals: 7, 14, 30, 90 days or custom
- Flag contacts for action by a date ("contact X, Y, Z by Friday")
- Weekly activity dashboard:
  - Outreach this week by ecosystem
  - Actions completed vs. due
  - Overdue follow-ups count
  - Contacts with no next step count
- Action history log (completed actions with dates)

### Phase 6: Backup & Polish
- Google Drive backup (export DB + photos to a Drive-synced folder)
- Backup restore
- Setup instructions for Google Drive for Desktop
- UX polish pass (loading states, error handling, responsive layout)
- Keyboard shortcuts documentation
- Data cleanup tools (find duplicates, archive old contacts)

---

## UI Views Summary

1. **Dashboard** — Weekly activity summary, overdue actions, contacts needing attention
2. **Contacts List** — Filterable/searchable table of all contacts
3. **Contact Detail** — Full profile with conversations, actions, relationships, links, prep sheet
4. **Companies List** — Filterable table of target companies
5. **Company Detail** — Company info + linked contacts + notes + links
6. **Calendar** — Month/week/day views of actions
7. **Daily View** — Today's actions, organized by priority and type
8. **Actions List** — All actions, filterable by status, type, contact, date
9. **Ideas** — Scratchpad for freeform ideas
10. **Search** — Global search results page
11. **Quick-Add** — Modal/palette triggered by keyboard shortcut

---

## CSV Import Format
The import should accept at minimum:
| Column | Maps To |
|--------|---------|
| Name | name |
| Title | title |
| Company | companyName |
| Ecosystem | ecosystem |
| Email | email |
| Phone | phone |
| LinkedIn | linkedinUrl |
| Location | location |
| How Connected | howConnected |
| Status | status |
| Notes | notes |

Unrecognized columns should be offered as tag values or ignored.
