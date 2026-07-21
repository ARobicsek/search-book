// 0.2 — Prisma + Turso from a function, engine-less (R4, R5, R7).
// Runs one READ-ONLY query. Safe to point at the prod Turso DB (count only, never writes)
// or a scratch DB. Reachable at /.netlify/functions/dbcount
import prisma from "./_db.mjs";

export default async () => {
  const started = Date.now();
  try {
    const n = await prisma.contact.count();
    return Response.json({
      ok: true,
      contactCount: n,
      queryMs: Date.now() - started,
      note: "R4+R5 pass if this returns a count. Check cold-start time in the function logs (R7).",
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: String(err?.message || err),
        hint: '"could not locate the Query Engine" => engine-less did not take; fall back to bundling the Linux engine (plan §0.2 step 4).',
      },
      { status: 500 },
    );
  }
};
