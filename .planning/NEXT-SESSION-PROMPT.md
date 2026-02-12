# Next Session Prompt

## Project Context
**SearchBook** is a local-first personal CRM for job seekers. It tracks contacts, companies, actions, and conversations with a focus on "Get Shit Done" methodology.
- **Goal:** Manage networking ecosystems, log conversations, and automate follow-ups.
- **Tech Stack:** React (Vite), Express, SQLite (local) / Turso (prod), Prisma, Tailwind/shadcn.
- **Current State:** Phase 7 (iPhone PWA Access) is complete but in stabilization. App is deployed to Vercel.

## Current Status & recent changes
We are stabilizing the "Multiple Companies" feature and addressing production bugs.
- **Fixed:** Single past company status logic (server-side).
- **Fixed:** Multiple past companies race condition (client-side `contact-form.tsx`).
- **Fix Pushed:** New company creation disappearing (client-side `contact-form.tsx` partial auto-save fix).
    - **Status:** User reported a `vercel build` deployment error/log during this push. We need to verify if the deployment actually failed or succeeded.

## Active Bugs / New Issues
1.  **People Discussed Creation Bug:**
    - **Report:** "When I add a brand new person in People Discussed [in Log Conversation], it is also NOT creating a contact for that person."
    - **Hypothesis:** The `MultiCombobox` in `ConversationDialog` likely sends names of new items, but the `POST /conversations` endpoint expects `contactsDiscussed` to be an array of *existing* IDs (`number[]`). The client likely needs to create these contacts *before* submitting the conversation, or the API needs to accept names and create them.

2.  **Deployment Error:**
    - User reported an error during the `vercel build` process after the last push (Fix New Company Creation).
    - Need to start by verifying if the build actually failed or if it was a non-fatal warning.

## Immediate Next Steps (Session Request)
1.  **Verify Deployment:** Check Vercel logs or ask user to retry deployment of the "New Company Creation" fix from the previous session.
2.  **Verify New Company Fix:** Once deployed, confirm adding a NEW company to an existing contact works in production.
3.  **Fix People Discussed:**
    - Inspect `ConversationDialog.tsx` to see how it handles new "People Discussed" entries.
    - Implement auto-creation of contacts for new names (similar to how `ActionForm` or `ContactForm` might handle it).

## Roadmap (Upcoming)
- **Phase 8 (Planned):** Document Search (Full-text search across linked Google Drive documents).
