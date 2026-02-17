# SearchBook Architecture

## Overview

SearchBook is a lightweight CRM designed for executive job search networking. It is a monorepo application consisting of a React frontend and an Express backend, designed to be deployed on Vercel.

## Tech Stack

### Client (`/client`)
- **Framework:** [React](https://react.dev/) with [Vite](https://vitejs.dev/)
- **Language:** TypeScript
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **UI Components:** [Radix UI](https://www.radix-ui.com/) via [shadcn/ui](https://ui.shadcn.com/)
- **Routing:** [React Router](https://reactrouter.com/)
- **State Management:** React Hooks and local state
- **Icons:** [Lucide React](https://lucide.dev/)

### Server (`/server`)
- **Runtime:** Node.js
- **Framework:** [Express](https://expressjs.com/)
- **ORM:** [Prisma](https://www.prisma.io/)
- **Database:** SQLite (local development) / LibSQL (production/edge)
- **Language:** TypeScript

## Project Structure

```
SearchBook/
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utilities and API client
│   │   ├── pages/          # Page components (routed)
│   │   └── App.tsx         # Main entry point and routing config
│   └── package.json
├── server/                 # Backend Express application
│   ├── prisma/             # Database schema and seed data
│   │   ├── schema.prisma   # Data model definition
│   │   └── seed.ts         # Initial data population script
│   ├── src/
│   │   ├── routes/         # API route handlers (business logic here)
│   │   ├── app.ts          # Express app configuration
│   │   └── index.ts        # Server entry point
│   └── package.json
├── docs/                   # Documentation
└── package.json            # Root configuration (concurrently scripts)
```

## Data Flow

1.  **User Interaction:** The user interacts with the React frontend.
2.  **API Request:** The frontend makes HTTP requests using a wrapper around `fetch` (located in `client/src/lib/api.ts`).
    *   Requests are sent to relative paths like `/api/contacts`.
    *   In development, these are proxied or handled via CORS to the server port (usually 3001).
    *   In production (Vercel), these are serverless function invocations.
3.  **Route Handling:** The Express server receives the request. The application logic is primarily contained within the route files in `server/src/routes/`.
    *   There is no separate "controller" directory; route handlers contain the business logic.
4.  **Database Access:** Route handlers use the Prisma Client (`server/src/db.ts`) to query the database.
5.  **Response:** Data is returned as JSON to the frontend.

## Key Data Models (`server/prisma/schema.prisma`)

*   **Contact:** The core entity. Represents a person in the network.
*   **Company:** Represents an organization. Contacts are linked to companies.
*   **Action:** Represents a task or to-do item (e.g., "Email Sarah"). Can be linked to a Contact, Company, or Conversation.
*   **Conversation:** Records an interaction (call, meeting, email) with a Contact.
*   **Idea:** A scrapbook for thoughts or potential strategies.
*   **PrepNote:** Notes specifically for preparing for interactions with a Contact.

## Development Workflow

The project is designed to be run locally using a single command from the root directory:

```bash
npm run dev
```

This uses `concurrently` to start both the Vite development server (client) and the Express server (backend) in parallel.

*   **Client URL:** http://localhost:5173
*   **Server URL:** http://localhost:3001

## Deployment

The application is configured for deployment on Vercel.
*   The `client` is deployed as a static site.
*   The `server` is deployed as Serverless Functions.
*   `server/src/app.ts` is the shared configuration used by both the local server and the Vercel entry point.
