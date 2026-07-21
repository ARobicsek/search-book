// 0.1 — Function reachability + path prefix (R1, R9).
// Reachable at /api/<anything> via the netlify.toml redirect. Echoes the path so we can
// decide whether serverless-http will see "/api/..." or a stripped prefix (informs the
// event.path fix in the real function, plan §3.7).
export default async (req) => {
  const url = new URL(req.url);
  return Response.json({
    ok: true,
    // What the real Express app would need to route on:
    incomingPath: url.pathname, // e.g. "/api/health" or "/health" after rewrite — RECORD THIS
    search: url.search,
    rawUrl: req.url,
    method: req.method,
    note: "R1 passes if you can see this JSON from the WORK laptop. Record incomingPath for §3.7.",
  });
};
