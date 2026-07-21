// 0.3(1) — Server-side LinkedIn parse timing (R2) — the decision-maker.
//
// Two modes:
//   GET  -> times a tiny built-in sample (quick smoke test).
//   POST { text } -> times a REAL pasted profile using the exact prompt + text-trimming
//                    the production route uses (server/src/routes/linkedin.ts), so the
//                    number is representative of a real import against Netlify's 10 s cap.
//
// R2 verdict: server reaches OpenAI (proven), so the ONLY question is whether a full
// profile finishes under ~9 s. < ~9 s reliably => option B viable. > 10 s => option C.
import OpenAI from "openai";

const SAMPLE_PROFILE = `Jane Doe
Chief Medical Officer | Value-Based Care | Digital Health Executive
Greater Boston
About
Physician executive with 20 years across payer and provider organizations.
Experience
Chief Medical Officer — Acme Health Plan (Present)
SVP, Clinical Strategy — BigPayer Inc (2018 - 2023)`;

// ── verbatim from server/src/routes/linkedin.ts (kept in sync for fidelity) ──
function extractRelevantLinkedInSections(text, maxChars) {
  const expMatch = text.match(/\n\s*Experience\s*\n/);
  const activityMarker = text.match(/\n\s*(Featured|Activity)\s*\n/);
  const activityIdx = activityMarker && activityMarker.index !== undefined ? activityMarker.index : -1;
  const expIdx = expMatch && expMatch.index !== undefined ? expMatch.index : -1;
  if (activityIdx < 0 || (expIdx >= 0 && activityIdx >= expIdx)) {
    return text.length <= maxChars ? text : text.slice(0, maxChars);
  }
  const header = text.slice(0, activityIdx);
  const separator = "\n\n[Activity and Featured sections omitted]\n\n";
  if (expIdx >= 0) {
    const footerMatch = text.slice(expIdx).match(/\n\s*More profiles for you\s*\n/);
    const tailEnd = footerMatch && footerMatch.index !== undefined ? expIdx + footerMatch.index : text.length;
    const availableForTail = Math.max(0, maxChars - header.length - separator.length);
    const tail = text.slice(expIdx, expIdx + Math.min(tailEnd - expIdx, availableForTail));
    return header + separator + tail;
  }
  return header.length <= maxChars ? header : header.slice(0, maxChars);
}

const SYSTEM_PROMPT = `You are a data extraction assistant. The user will paste raw text copied from a LinkedIn profile page. This text contains a LOT of noise. Focus only on the profile owner's core information.

Extract these fields and return them as a JSON object. Only include fields you can confidently extract.
- "name": Full name (remove credential suffixes like MD, MBA, PhD).
- "title": Their headline (the descriptive line under their name). Use the FULL headline.
- "location": Geographic location.
- "about": The complete "About" section text. Stop before "Top skills"/"Activity"/"Featured".
- "skills": Top skills as a comma-separated string.
- "experience": An ARRAY of every role, each {company, title, isCurrent}. Include current AND past, board/advisory/volunteer. SKIP student roles and placeholder companies (Various/Self-Employed/Freelance/Independent). Preserve top-to-bottom order. Do NOT include date strings.

Rules: Return ONLY a valid JSON object, no code fences. Omit fields not found. Skip nav noise, connection indicators, and everything after "More profiles for you". Do NOT hallucinate.`;

async function timeParse(text) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const processedText = extractRelevantLinkedInSections(text, 30000);
  const started = Date.now();
  const r = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Profile text:\n${processedText}` },
    ],
  });
  const ms = Date.now() - started;
  return {
    ok: true,
    inputChars: text.length,
    sentChars: processedText.length,
    durationMs: ms,
    durationSec: +(ms / 1000).toFixed(1),
    verdict:
      ms < 9000
        ? "under ~9s: option B (keep server-side) is viable"
        : "over ~9s: too close to / past the 10s cap -> option C (import off the work network)",
    sample: r.choices[0]?.message?.content?.slice(0, 160),
  };
}

export default async (req) => {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ ok: false, error: "OPENAI_API_KEY not set in Netlify env" }, { status: 501 });
  }
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const text = typeof body.text === "string" ? body.text : "";
      if (text.trim().length < 100) {
        return Response.json({ ok: false, error: "Paste a full profile (>=100 chars) to get a real timing." }, { status: 400 });
      }
      return Response.json(await timeParse(text));
    }
    return Response.json(await timeParse(SAMPLE_PROFILE)); // GET = tiny smoke test
  } catch (err) {
    return Response.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
};
