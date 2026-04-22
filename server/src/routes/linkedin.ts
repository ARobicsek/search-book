import { Router, Request, Response } from 'express';
import OpenAI from 'openai';

const router = Router();

// LinkedIn pastes often contain a huge Activity/Featured-posts block between About and
// Experience — hundreds of lines of posts that confuse the model and waste API time even when
// they fit in the context window. We always drop that block: keep the header (name, headline,
// location, About) and, if the user copied the Experience section, append it through just
// before the "More profiles for you" footer. If Experience wasn't copied, we still strip the
// Activity block so the model sees a clean header.
function extractRelevantLinkedInSections(text: string, maxChars: number): string {
  const expMatch = text.match(/\n\s*Experience\s*\n/);
  const activityMarker = text.match(/\n\s*(Featured|Activity)\s*\n/);
  const activityIdx = activityMarker && activityMarker.index !== undefined ? activityMarker.index : -1;
  const expIdx = expMatch && expMatch.index !== undefined ? expMatch.index : -1;

  // Case 1: no Activity block to strip — either a short profile (Trevor-style) or a paste with
  // no noise between header and Experience. Pass through (clipping only if oversized).
  if (activityIdx < 0 || (expIdx >= 0 && activityIdx >= expIdx)) {
    return text.length <= maxChars ? text : text.slice(0, maxChars);
  }

  // Case 2: Activity block exists. Header = everything up to the Activity marker.
  const header = text.slice(0, activityIdx);
  const separator = '\n\n[Activity and Featured sections omitted]\n\n';

  // Case 2a: Experience section is in the paste — append it through the footer.
  if (expIdx >= 0) {
    const footerMatch = text.slice(expIdx).match(/\n\s*More profiles for you\s*\n/);
    const tailEnd = footerMatch && footerMatch.index !== undefined ? expIdx + footerMatch.index : text.length;
    const availableForTail = Math.max(0, maxChars - header.length - separator.length);
    const tail = text.slice(expIdx, expIdx + Math.min(tailEnd - expIdx, availableForTail));
    return header + separator + tail;
  }

  // Case 2b: No Experience section was copied. Return just the cleaned header — the model
  // will extract name / headline / about / location, and we'll flag the missing Experience
  // section to the user so they can re-paste.
  return header.length <= maxChars ? header : header.slice(0, maxChars);
}

// POST /api/linkedin/parse — extract structured contact data from pasted LinkedIn text
router.post('/parse', async (req: Request, res: Response) => {
  try {
    const { text, profileUrl } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length < 20) {
      res.status(400).json({ error: 'Please paste more text from the LinkedIn profile.' });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(501).json({
        error: 'OpenAI API key not configured. Add OPENAI_API_KEY to your server .env file.',
      });
      return;
    }

    const openai = new OpenAI({ apiKey });

    const systemPrompt = `You are a data extraction assistant. The user will paste raw text copied from a LinkedIn profile page. This text contains a LOT of noise — LinkedIn navigation elements, activity/posts, sidebar suggestions, footer links, etc. Focus only on the profile owner's core information.

Extract the following fields and return them as a JSON object. Only include fields you can confidently extract — omit any field you're unsure about.

Fields to extract:
- "name": Full name. Remove credential suffixes (MD, MBA, MHA, PhD, etc.) from the name itself.
- "title": Their headline — the descriptive line right below their name (e.g. "Repeat Founder | Healthcare Tech Executive | Healthcare AI Ops"). Use the FULL headline text, not just the first part.
- "location": Geographic location (e.g. "Greater Boston" or "New York, New York, United States")
- "about": The complete "About" section text (their bio/summary). This appears after a line that just says "About". Include the full text, not truncated. Stop before "Top skills" or "Activity" or "Featured" sections.
- "skills": Top skills as a comma-separated string (appears after "Top skills" header)
- "experience": An ARRAY of every role in the Experience section. Each entry is an object with three keys:
    - "company": the organization name exactly as shown on LinkedIn (no suffix changes, no rewriting)
    - "title": the role title (e.g. "Chief Data Officer", "Member Board of Directors", "Co-Founder")
    - "isCurrent": true if the role's date range ends in "Present" or has no end date; false otherwise

Rules for the experience array:
- Include EVERY role from the Experience section, current AND past, board seats AND advisory roles AND volunteer positions AND regular jobs — they are all "roles at a company."
- SKIP any role whose title contains "Student", "Graduate Student", "Undergraduate", "MS Candidate", "PhD Candidate", or similar pure-student descriptors.
- SKIP any entry whose company is "Various", "Self-Employed", "Freelance", "Independent", or any other clearly non-organizational placeholder. Real organization names only.
- A single company may host multiple nested roles (e.g. Harvard Medical School with both "Attending Physician" and "Faculty and Member of the Board of Advisors"). Emit each nested role as its own entry, all sharing the same "company" name.
- Preserve LinkedIn's top-to-bottom order — order matters for downstream processing.
- Do NOT include date strings in the entries. Just the boolean isCurrent.

General rules:
- Return ONLY a valid JSON object, no markdown formatting, no code fences.
- If a field is not found in the text, omit it from the response entirely.
- The profile text typically starts with LinkedIn navigation noise ("Home", "My Network", "Jobs", etc.) — skip all of that.
- The person's name and headline usually appear twice near the top — once in a header area and once in the detail area. They are the same person.
- Ignore "· 1st", "· 2nd", "· 3rd" connection indicators.
- Ignore everything after "More profiles for you", "People you may know", or footer sections — that's suggestions, posts, and chrome. The Experience section itself is the only source of truth for roles.
- Do NOT invent or hallucinate data that isn't in the provided text.`;

    const processedText = extractRelevantLinkedInSections(text, 30000);
    const pasteHasExperienceSection = /\n\s*Experience\s*\n/.test(text);
    console.log(
      `[LinkedIn Parse] Input ${text.length} chars, sent ${processedText.length} chars, experienceSection:${pasteHasExperienceSection}`,
    );

    const userMessage = profileUrl
      ? `LinkedIn Profile URL: ${profileUrl}\n\nProfile text:\n${processedText}`
      : `Profile text:\n${processedText}`;

    const response = await openai.chat.completions.create({
      model: 'o4-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      if (!res.headersSent) res.status(500).json({ error: 'No response from AI model.' });
      return;
    }

    // Parse the JSON response — strip markdown fences if the model adds them
    let parsed: Record<string, any>;
    try {
      const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('[LinkedIn Parse] Failed to parse AI response:', content);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to parse AI response. Please try again.' });
      return;
    }

    // Sanitize experience[] — keep only well-formed entries with non-empty company + title.
    // Then derive the top-level `company` field (back-compat) from the first current entry.
    if (Array.isArray(parsed.experience)) {
      parsed.experience = parsed.experience
        .filter((e: any) => e && typeof e.company === 'string' && typeof e.title === 'string' && e.company.trim() && e.title.trim())
        .map((e: any) => ({
          company: e.company.trim(),
          title: e.title.trim(),
          isCurrent: e.isCurrent === true,
        }));
      const firstCurrent = parsed.experience.find((e: any) => e.isCurrent);
      if (firstCurrent && !parsed.company) {
        parsed.company = firstCurrent.company;
      }
    } else {
      parsed.experience = [];
    }

    // Add the profile URL if provided
    if (profileUrl && !parsed.linkedinUrl) {
      parsed.linkedinUrl = profileUrl;
    }

    // If the paste didn't include the Experience section header, tell the user so they can
    // re-copy. This is a very common mistake: LinkedIn's Experience list is collapsed behind
    // a "Show all N experiences" button and not included in Ctrl+A unless expanded.
    if (!pasteHasExperienceSection) {
      parsed.warning =
        "No Experience section was found in your paste. On LinkedIn, scroll down and click \"Show all experiences\" to expand the list, then Select All and copy again.";
    }

    console.log('[LinkedIn Parse] Extracted:', Object.keys(parsed).join(', '), `(${parsed.experience.length} roles)`);
    if (!res.headersSent) res.json(parsed);
  } catch (error: any) {
    console.error('[LinkedIn Parse] Error:', error.message);

    if (res.headersSent) return;

    // Handle specific OpenAI errors
    if (error.status === 401) {
      res.status(401).json({ error: 'Invalid OpenAI API key. Check your OPENAI_API_KEY.' });
      return;
    }
    if (error.status === 429) {
      res.status(429).json({ error: 'OpenAI rate limit reached. Please wait a moment and try again.' });
      return;
    }

    res.status(500).json({ error: 'Failed to parse LinkedIn profile. ' + (error.message || '') });
  }
});

export default router;
