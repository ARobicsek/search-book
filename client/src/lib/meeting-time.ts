// Eastern wall-clock helpers for meetings. A meeting's `date` / `startTime` / `endTime`
// are stored as Eastern wall clock (not instants), so anything compared against them —
// "now", or a note's UTC `updatedAt` — has to be projected into the same zone first.
// Pure Intl, no deps, works in the PWA. Shared by the meetings list and the Mentions
// review feed, which order and flag meetings by exactly the same rules.

// (An HH:MM → "2:30 PM" label is `formatStartTime` in ./utils — this module is only
// about locating a meeting in time, not rendering it.)

const EASTERN_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
})

/** An instant as Eastern wall clock, in the same shapes a meeting stores its date and
 *  start time — so the two compare with plain string comparisons. */
export type WallClock = { date: string; hhmm: string }

export function easternParts(d: Date): WallClock {
  const p: Record<string, string> = {}
  for (const part of EASTERN_FMT.formatToParts(d)) p[part.type] = part.value
  const hour = p.hour === '24' ? '00' : p.hour // some engines emit '24' at midnight
  return { date: `${p.year}-${p.month}-${p.day}`, hhmm: `${hour}:${p.minute}` }
}

// Current Eastern "today" (YYYY-MM-DD) + "now" (HH:MM, 24h). The upcoming/now rules key
// off Eastern regardless of the browser's zone (handles DST automatically).
export function easternNowParts(): WallClock {
  return easternParts(new Date())
}

// A stored timestamp (`updatedAt`, `createdAt`) as Eastern wall clock, or null when it's
// missing or unparseable. ⚠ Rows written outside Prisma's typed path (backup restore,
// bulk import, raw SQL) hold "YYYY-MM-DD HH:MM:SS" with no zone marker, which JS would
// read as LOCAL time and misplace by the UTC offset — those are normalized to UTC first.
// Same mixed-format data that broke the optimistic-concurrency guard (see CLAUDE.md).
export function easternPartsOfTimestamp(value: string | null | undefined): WallClock | null {
  if (!value) return null
  const zoneless =
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value) && !/(Z|[+-]\d{2}:?\d{2})$/.test(value)
  const d = new Date(zoneless ? value.replace(' ', 'T') + 'Z' : value)
  return Number.isNaN(d.getTime()) ? null : easternParts(d)
}

// How long a timed meeting is assumed to run when no end time was recorded — older
// records, and anything logged by hand without one. Meetings imported from Outlook
// carry a real endTime (the ICS DTEND), so they don't rely on this.
export const ASSUMED_MEETING_MINUTES = 60

// Add minutes to an HH:MM wall clock, clamped to the end of the day (a meeting can't
// run past midnight on its own single stored date).
export function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + minutes
  if (!Number.isFinite(total)) return hhmm
  if (total >= 24 * 60) return '23:59'
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** The only fields the "now" rule reads — structural so both a full Conversation and a
 *  MentionMeeting satisfy it. */
export type TimedMeeting = { date: string; startTime?: string | null; endTime?: string | null }

// A meeting is happening RIGHT NOW when it's today, its start time has passed, and it
// hasn't ended — the recorded endTime, or start + ASSUMED_MEETING_MINUTES when none was
// recorded. An untimed meeting can never qualify: with no clock time there's nothing to
// be in the middle of. Mutually exclusive with "upcoming" by construction (that rule
// requires startTime > now).
export function isHappeningNow(meeting: TimedMeeting, today: string, hhmm: string): boolean {
  if (meeting.date !== today || !meeting.startTime) return false
  const end =
    meeting.endTime && meeting.endTime > meeting.startTime
      ? meeting.endTime
      : addMinutes(meeting.startTime, ASSUMED_MEETING_MINUTES)
  return meeting.startTime <= hhmm && hhmm < end
}
