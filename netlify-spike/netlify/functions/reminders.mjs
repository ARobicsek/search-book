// 0.6 — Cron trigger (R11). cron-job.org hits
//   https://<spike>.netlify.app/api/cron/reminders?key=<secret>
// every minute; confirm 200s in the Netlify function logs. Mirrors the real cron's
// secret gate (?key= or Authorization: Bearer) without doing any real fan-out.
export default async (req) => {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const secret = process.env.REMINDERS_CRON_SECRET || process.env.CRON_SECRET;

  if (secret && key !== secret && bearer !== secret) {
    return Response.json({ ok: false, error: "bad cron secret" }, { status: 401 });
  }
  console.log(`[spike-cron] reminders ping at ${new Date().toISOString()}`);
  return Response.json({ ok: true, firedAt: new Date().toISOString() });
};
