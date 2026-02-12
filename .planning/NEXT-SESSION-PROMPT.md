# Next Session Prompt

## Context
We are stabilizing the "Multiple Companies" feature.
- **Fixed:** Single past company status logic (server-side).
- **Fixed:** Multiple past companies race condition (client-side `contact-form.tsx`).
- **Fix Pushed:** New company creation disappearing (client-side `contact-form.tsx` partial auto-save fix).
    - **Status:** User reported a `vercel build` deployment error/log during this push. We need to verify if the deployment actually failed or succeeded.

## New Issues
1.  **People Discussed Creation Bug:**
    - **Report:** "When I add a brand new person in People Discussed [in Log Conversation], it is also NOT creating a contact for that person."
    - **Hypothesis:** The `MultiCombobox` in `ConversationDialog` likely sends names of new items, but the `POST /conversations` endpoint expects `contactsDiscussed` to be an array of *existing* IDs (`number[]`). The client likely needs to create these contacts *before* submitting the conversation, or the API needs to accept names and create them.

## Next Steps
1.  **Verify Deployment:** Check Vercel logs or ask user to retry deployment of the "New Company Creation" fix.
2.  **Verify New Company Fix:** Once deployed, confirm adding a NEW company to an existing contact works.
3.  **Fix People Discussed:**
    - Inspect `ConversationDialog.tsx` to see how it handles new "People Discussed" entries.
    - Implement auto-creation of contacts for new names (similar to how `ActionForm` or `ContactForm` might handle it).
