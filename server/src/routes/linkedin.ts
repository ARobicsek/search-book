import { Router, Request, Response } from 'express';
import OpenAI from 'openai';

const router = Router();

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
- "company": Their current primary company/organization. Look for the company name that appears near the top of the profile (after location, before education). If they list multiple, pick the most prominent current one.
- "location": Geographic location (e.g. "Greater Boston" or "New York, New York, United States")
- "about": The complete "About" section text (their bio/summary). This appears after a line that just says "About". Include the full text, not truncated. Stop before "Top skills" or "Activity" or "Featured" sections.
- "skills": Top skills as a comma-separated string (appears after "Top skills" header)

Rules:
- Return ONLY a valid JSON object, no markdown formatting, no code fences.
- If a field is not found in the text, omit it from the response entirely.
- The profile text typically starts with LinkedIn navigation noise ("Home", "My Network", "Jobs", etc.) — skip all of that.
- The person's name and headline usually appear twice near the top — once in a header area and once in the detail area. They are the same person.
- Ignore "· 1st", "· 2nd", "· 3rd" connection indicators.
- Ignore everything after "Activity" or "More profiles for you" sections — that's posts, suggestions, and footer.
- Do NOT invent or hallucinate data that isn't in the provided text.`;

    const userMessage = profileUrl
      ? `LinkedIn Profile URL: ${profileUrl}\n\nProfile text:\n${text.slice(0, 8000)}`
      : `Profile text:\n${text.slice(0, 8000)}`;

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
    let parsed: Record<string, string>;
    try {
      const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('[LinkedIn Parse] Failed to parse AI response:', content);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to parse AI response. Please try again.' });
      return;
    }

    // Add the profile URL if provided
    if (profileUrl && !parsed.linkedinUrl) {
      parsed.linkedinUrl = profileUrl;
    }

    console.log('[LinkedIn Parse] Extracted:', Object.keys(parsed).join(', '));
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
