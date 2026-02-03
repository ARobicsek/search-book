# SearchBook — Project Vision

## What Is This?
SearchBook is a lightweight, locally-run personal CRM for managing an executive job search. It tracks contacts across multiple networking ecosystems, logs conversations, manages follow-up actions, and provides daily/weekly views of what needs to be done.

## Who Is It For?
A single user (the job seeker) running the app locally on Windows. No multi-user, no cloud hosting, no authentication needed.

## Core Philosophy
- **Simple and usable** — complexity kills consistency (per coaching guidance)
- **Action-oriented** — every contact should have a next step; the system nudges you when they don't
- **Real-time updates** — quick-add interface so you can capture info immediately after conversations
- **Relationship-centric** — tracks who referred whom, mutual connections, conversation history
- **Searchable** — find anyone by name, company, role, date of contact, keywords, ecosystem, status

## Tech Stack
| Layer | Choice |
|-------|--------|
| Frontend | React + Vite + TypeScript |
| UI Components | shadcn/ui (Tailwind CSS) |
| Backend | Express.js + TypeScript |
| Database | SQLite via Prisma ORM |
| Calendar | FullCalendar (React) |
| Photo Storage | Local filesystem (data/photos/) |
| Launch | Single `npm start` (concurrently runs frontend + backend) |

## Non-Goals
- No email sending or messaging integration (user handles all outreach manually)
- No cloud deployment (runs on localhost only)
- No authentication/login (single-user local app)
- No mobile app (browser on desktop only)

## Success Criteria
The app is successful when the user can:
1. Add and search contacts quickly across all ecosystems
2. See a daily view of "what do I need to do today"
3. Log conversations and automatically create follow-up actions from them
4. Prepare for calls by reviewing a contact's full history at a glance
5. Track weekly networking cadence (outreach by ecosystem)
6. Import existing contacts from CSV
7. Back up the database to Google Drive
