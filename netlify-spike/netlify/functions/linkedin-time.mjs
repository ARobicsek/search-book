// 0.3(1) — Server-side LinkedIn parse timing (R2) — the decision-maker.
// Calls gpt-4o-mini with a representative profile and times it. Netlify free kills the
// function at 10 s, so this measures whether the server-side path is viable at all.
//   - consistently < ~8 s  => option B (keep server-side) is on the table
//   - > 10 s / 502 timeout  => R2 confirmed; go option A (browser-direct, test on index.html) or C
// Reachable at /.netlify/functions/linkedin-time  (uses OPENAI_API_KEY env var)
import OpenAI from "openai";

// A representative, trimmed profile — enough tokens to be realistic without being huge.
const SAMPLE_PROFILE = `Jane Doe
Chief Medical Officer | Value-Based Care | Digital Health Executive
Greater Boston
About
Physician executive with 20 years across payer and provider organizations. Led clinical
strategy, quality (HEDIS/Stars), and care-model redesign for national health plans.
Board member and advisor to several digital-health startups.
Experience
Chief Medical Officer — Acme Health Plan (Present)
SVP, Clinical Strategy — BigPayer Inc (2018 - 2023)
Attending Physician — Metro Hospital (2010 - 2018)
Board Member — HealthTech Startup (Present)`;

const SYSTEM_PROMPT =
  'Extract name, title, location, about, and an experience[] array ({company,title,isCurrent}) ' +
  "from the pasted LinkedIn text. Return ONLY a JSON object, no code fences.";

export default async () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, error: "OPENAI_API_KEY not set in Netlify env" }, { status: 501 });
  }
  const openai = new OpenAI({ apiKey });
  const started = Date.now();
  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Profile text:\n${SAMPLE_PROFILE}` },
      ],
    });
    const ms = Date.now() - started;
    return Response.json({
      ok: true,
      durationMs: ms,
      durationSec: +(ms / 1000).toFixed(1),
      verdict: ms < 8000 ? "under-8s: option B possibly viable" : "slow: prefer option A (browser-direct) or C",
      sample: r.choices[0]?.message?.content?.slice(0, 200),
    });
  } catch (err) {
    return Response.json(
      { ok: false, durationMs: Date.now() - started, error: String(err?.message || err) },
      { status: 500 },
    );
  }
};
