// Calendar import — provider abstraction.
//
// The import endpoint, dedup, and UI all consume `CalendarEvent[]` and never know
// where the events came from. v1 ships ONE provider, `IcsCalendarProvider`, which
// reads an Outlook "published calendar" ICS feed. A future Microsoft Graph / Power
// Automate source (Option B — attendee auto-fill) just implements `CalendarProvider`
// with the same shape; nothing downstream changes.
//
// Published Outlook ICS feeds strip attendees (Microsoft privacy design), so the ICS
// provider always returns `attendees: []`. Subject + date/time + recurrence are intact.

import IcalExpander from 'ical-expander';

export interface CalendarAttendee {
  name: string | null;
  email: string | null;
}

export interface CalendarEvent {
  uid: string;
  subject: string | null;
  start: Date; // absolute instant
  end: Date;
  date: string; // YYYY-MM-DD in the app timezone — the stored Conversation.date
  startTime: string | null; // HH:MM in the app timezone (null for all-day)
  isAllDay: boolean;
  isRecurring: boolean;
  attendees: CalendarAttendee[];
}

export interface CalendarProvider {
  isConfigured(): boolean;
  /** Events whose start falls within [fromISO, toISO). */
  getEvents(fromISO: string, toISO: string): Promise<CalendarEvent[]>;
}

export function getAppTimezone(): string {
  return process.env.APP_TIMEZONE || 'America/New_York';
}

// Wall-clock date+time of an absolute instant in the given IANA timezone.
function localParts(d: Date, tz: string): { date: string; time: string } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(d)) p[part.type] = part.value;
  const hour = p.hour === '24' ? '00' : p.hour; // some engines emit '24' for midnight
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}` };
}

// For all-day events the wall-clock date is authoritative (no tz shift) — read the
// ICAL.Time fields directly so a midnight-UTC instant can't roll to the prior day.
function allDayDate(t: any): string {
  const mm = String(t.month).padStart(2, '0');
  const dd = String(t.day).padStart(2, '0');
  return `${t.year}-${mm}-${dd}`;
}

function toCalendarEvent(
  uid: string,
  summary: unknown,
  start: any, // ICAL.Time
  end: any, // ICAL.Time | undefined
  isRecurring: boolean,
  tz: string,
): CalendarEvent {
  const isAllDay = !!start?.isDate;
  const startJs: Date = start.toJSDate();
  const endJs: Date = end ? end.toJSDate() : startJs;
  let date: string;
  let startTime: string | null;
  if (isAllDay) {
    date = allDayDate(start);
    startTime = null;
  } else {
    const lp = localParts(startJs, tz);
    date = lp.date;
    startTime = lp.time;
  }
  const subject = typeof summary === 'string' && summary.trim() ? summary.trim() : null;
  return { uid, subject, start: startJs, end: endJs, date, startTime, isAllDay, isRecurring, attendees: [] };
}

// ---- ICS feed fetch with a short in-memory cache ----
// Serverless = best-effort cache (per warm instance), but it spares Microsoft a
// refetch every time the user nudges the date range in the import dialog.
const FEED_TTL_MS = 15 * 60 * 1000;
let feedCache: { url: string; text: string; at: number } | null = null;

async function fetchIcs(url: string): Promise<string> {
  if (feedCache && feedCache.url === url && Date.now() - feedCache.at < FEED_TTL_MS) {
    return feedCache.text;
  }
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 SearchBook', Accept: 'text/calendar,*/*' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Calendar feed fetch failed: HTTP ${res.status}`);
  const text = await res.text();
  if (!/BEGIN:VCALENDAR/.test(text)) {
    throw new Error('Calendar feed did not return ICS data (got HTML/login?)');
  }
  feedCache = { url, text, at: Date.now() };
  return text;
}

class IcsCalendarProvider implements CalendarProvider {
  isConfigured(): boolean {
    return !!process.env.OUTLOOK_CALENDAR_ICS_URL;
  }

  async getEvents(fromISO: string, toISO: string): Promise<CalendarEvent[]> {
    const url = process.env.OUTLOOK_CALENDAR_ICS_URL;
    if (!url) throw new Error('OUTLOOK_CALENDAR_ICS_URL is not set');
    const ics = await fetchIcs(url);
    const tz = getAppTimezone();

    const expander = new IcalExpander({ ics, maxIterations: 5000 });
    const after = new Date(fromISO);
    const before = new Date(toISO);
    const { events, occurrences } = expander.between(after, before);

    const raw: CalendarEvent[] = [];
    for (const e of events) {
      raw.push(toCalendarEvent(e.uid, e.summary, e.startDate, e.endDate, false, tz));
    }
    for (const o of occurrences) {
      raw.push(toCalendarEvent(o.item.uid, o.item.summary, o.startDate, o.endDate, true, tz));
    }
    raw.sort((a, b) => a.start.getTime() - b.start.getTime());

    // Collapse to one row per (uid, date) — the import dedup key. ical-expander can
    // surface a recurring event's master in `events` AND the same occurrence in
    // `occurrences`; Conversation storage is keyed by (calendarUid, date) anyway, so
    // two rows for the same key are never independently importable.
    const byKey = new Map<string, CalendarEvent>();
    for (const e of raw) {
      const k = `${e.uid}|${e.date}`;
      const prev = byKey.get(k);
      if (!prev) {
        byKey.set(k, e);
        continue;
      }
      prev.isRecurring = prev.isRecurring || e.isRecurring;
      // Prefer a timed entry over an all-day duplicate of the same meeting.
      if (prev.isAllDay && !e.isAllDay) {
        prev.isAllDay = false;
        prev.startTime = e.startTime;
        prev.start = e.start;
        prev.end = e.end;
      }
    }
    return [...byKey.values()];
  }
}

export const icsProvider: CalendarProvider = new IcsCalendarProvider();
