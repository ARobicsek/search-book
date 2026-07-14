import { Router, Request, Response } from 'express';
import prisma from '../db';
import { icsProvider, getAppTimezone, CalendarEvent } from '../lib/ics';

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SPAN_DAYS = 60;
const NOT_CONFIGURED = { error: 'Calendar not configured. Set OUTLOOK_CALENDAR_ICS_URL.' };

function isValidDate(s: unknown): s is string {
  return typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

// Pad the absolute fetch window by a day on each side so timezone boundaries can't
// drop a same-day event; the caller filters back to the exact local-date range.
function paddedWindow(from: string, to: string): { afterISO: string; beforeISO: string } {
  const after = new Date(`${from}T00:00:00Z`);
  after.setUTCDate(after.getUTCDate() - 1);
  const before = new Date(`${to}T00:00:00Z`);
  before.setUTCDate(before.getUTCDate() + 2);
  return { afterISO: after.toISOString(), beforeISO: before.toISOString() };
}

const keyOf = (uid: string, date: string) => `${uid}|${date}`;

type StoredTimes = { startTime: string | null; endTime: string | null };

// Times the feed knows that an already-imported meeting doesn't hold yet — returns null
// when there's nothing to fill. `endTime` was added to the schema on 2026-07-13, so every
// meeting imported before then has a null end and the "happening now" marker has to guess
// a duration for it. Re-import repairs that; it only ever fills blanks, never overwrites.
// The feed's end is only trusted when it belongs to the start we already hold — a meeting
// moved after import would otherwise get an end that reads as earlier than its start.
function missingTimes(row: StoredTimes, ev: CalendarEvent): { startTime?: string; endTime?: string } | null {
  const patch: { startTime?: string; endTime?: string } = {};
  if (!row.startTime && ev.startTime) patch.startTime = ev.startTime;
  const start = row.startTime ?? ev.startTime;
  if (!row.endTime && ev.endTime && start && ev.startTime === start && ev.endTime > start) {
    patch.endTime = ev.endTime;
  }
  return Object.keys(patch).length ? patch : null;
}

// GET /api/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns the events in the window, each annotated with `alreadyImported` and — for those
// already imported — `needsTimeFix` when the feed carries times the stored meeting lacks.
router.get('/events', async (req: Request, res: Response) => {
  if (!icsProvider.isConfigured()) {
    res.status(503).json(NOT_CONFIGURED);
    return;
  }
  const { from, to } = req.query;
  if (!isValidDate(from) || !isValidDate(to)) {
    res.status(400).json({ error: 'from and to must be YYYY-MM-DD' });
    return;
  }
  if (from > to) {
    res.status(400).json({ error: 'from must be on or before to' });
    return;
  }
  const spanDays = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (spanDays > MAX_SPAN_DAYS) {
    res.status(400).json({ error: `Range too large (max ${MAX_SPAN_DAYS} days)` });
    return;
  }

  try {
    const { afterISO, beforeISO } = paddedWindow(from, to);
    const all = await icsProvider.getEvents(afterISO, beforeISO);
    const events = all.filter((e) => e.date >= from && e.date <= to);

    const uids = [...new Set(events.map((e) => e.uid))];
    const existing = uids.length
      ? await prisma.conversation.findMany({
          where: { calendarUid: { in: uids } },
          select: { calendarUid: true, date: true, startTime: true, endTime: true },
        })
      : [];
    const existingMap = new Map(existing.map((r) => [keyOf(r.calendarUid as string, r.date), r]));

    const annotated = events.map((e) => {
      const row = existingMap.get(keyOf(e.uid, e.date));
      return {
        uid: e.uid,
        subject: e.subject,
        date: e.date,
        startTime: e.startTime,
        endTime: e.endTime,
        isAllDay: e.isAllDay,
        isRecurring: e.isRecurring,
        alreadyImported: !!row,
        needsTimeFix: !!row && !!missingTimes(row, e),
      };
    });

    res.json({ events: annotated, timezone: getAppTimezone() });
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    res.status(502).json({ error: 'Could not read the Outlook calendar feed. Try again shortly.' });
  }
});

// POST /api/calendar/import  body: { selections: [{ uid, date }] }
// Creates future-dated meeting records from the owner's selection. Server re-expands
// the feed and creates from its own trusted data (not client-supplied fields).
// Idempotent: a (calendarUid, date) that already exists is never overwritten, so notes and
// attendees the owner added survive a re-import. The one exception is additive — a stored
// meeting missing a start/end time the feed knows gets that blank filled (see missingTimes).
router.post('/import', async (req: Request, res: Response) => {
  if (!icsProvider.isConfigured()) {
    res.status(503).json(NOT_CONFIGURED);
    return;
  }
  const raw = (req.body?.selections ?? []) as Array<{ uid?: unknown; date?: unknown }>;
  if (!Array.isArray(raw) || raw.length === 0) {
    res.status(400).json({ error: 'selections must be a non-empty array' });
    return;
  }
  const selections = raw
    .filter((s) => typeof s?.uid === 'string' && isValidDate(s?.date))
    .map((s) => ({ uid: s.uid as string, date: s.date as string }));
  if (selections.length === 0) {
    res.status(400).json({ error: 'No valid { uid, date } selections' });
    return;
  }

  try {
    // Re-expand only the window the selections span (padded), and index by uid|date.
    const dates = selections.map((s) => s.date).sort();
    const { afterISO, beforeISO } = paddedWindow(dates[0], dates[dates.length - 1]);
    const feed = await icsProvider.getEvents(afterISO, beforeISO);
    const feedMap = new Map<string, CalendarEvent>();
    for (const e of feed) feedMap.set(keyOf(e.uid, e.date), e);

    // What's already imported (re-import creates nothing for these — at most it fills in
    // a start/end time the stored record never got).
    const uids = [...new Set(selections.map((s) => s.uid))];
    const existing = await prisma.conversation.findMany({
      where: { calendarUid: { in: uids } },
      select: { id: true, calendarUid: true, date: true, startTime: true, endTime: true },
    });
    const existingMap = new Map(existing.map((r) => [keyOf(r.calendarUid as string, r.date), r]));

    const items: Array<{
      uid: string;
      date: string;
      status: 'created' | 'updated' | 'skipped';
      reason?: string;
      id?: number;
    }> = [];
    const toCreate: CalendarEvent[] = [];
    const toUpdate: Array<{ id: number; uid: string; date: string; data: { startTime?: string; endTime?: string } }> = [];
    const seen = new Set<string>();
    for (const sel of selections) {
      const k = keyOf(sel.uid, sel.date);
      if (seen.has(k)) continue; // de-dupe within the request
      seen.add(k);
      const ev = feedMap.get(k);
      const row = existingMap.get(k);
      if (row) {
        const data = ev ? missingTimes(row, ev) : null;
        if (data) toUpdate.push({ id: row.id, uid: sel.uid, date: sel.date, data });
        else items.push({ uid: sel.uid, date: sel.date, status: 'skipped', reason: 'already_imported' });
        continue;
      }
      if (!ev) {
        items.push({ uid: sel.uid, date: sel.date, status: 'skipped', reason: 'not_in_feed' });
        continue;
      }
      toCreate.push(ev);
    }

    if (toCreate.length || toUpdate.length) {
      await prisma.$transaction(async (tx) => {
        for (const ev of toCreate) {
          const created = await tx.conversation.create({
            data: {
              title: ev.subject,
              date: ev.date,
              startTime: ev.startTime,
              endTime: ev.endTime,
              datePrecision: 'DAY',
              type: 'MEETING',
              calendarUid: ev.uid,
            },
            select: { id: true },
          });
          items.push({ uid: ev.uid, date: ev.date, status: 'created', id: created.id });
        }
        for (const u of toUpdate) {
          await tx.conversation.update({ where: { id: u.id }, data: u.data, select: { id: true } });
          items.push({ uid: u.uid, date: u.date, status: 'updated', id: u.id });
        }
      });
    }

    const created = items.filter((i) => i.status === 'created').length;
    const updated = items.filter((i) => i.status === 'updated').length;
    const skipped = items.filter((i) => i.status === 'skipped').length;
    res.status(201).json({ created, updated, skipped, items });
  } catch (error) {
    console.error('Error importing calendar events:', error);
    res.status(502).json({ error: 'Could not import from the Outlook calendar feed. Try again shortly.' });
  }
});

export default router;
