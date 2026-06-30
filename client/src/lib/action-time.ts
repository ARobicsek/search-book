// Helpers for the optional time-of-day on actions. dueTime is "HH:MM" 24h (local), or null.

// "09:30" → "9:30 AM", "14:00" → "2:00 PM". Returns '' for null/invalid.
export function formatActionTime(dueTime: string | null | undefined): string {
  if (!dueTime || !/^\d{2}:\d{2}$/.test(dueTime)) return ''
  const [h, m] = dueTime.split(':').map(Number)
  const period = h < 12 ? 'AM' : 'PM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

// Sort key for ordering today's timed actions: minutes since midnight. Untimed → Infinity
// so they sort after all timed ones.
export function dueTimeMinutes(dueTime: string | null | undefined): number {
  if (!dueTime || !/^\d{2}:\d{2}$/.test(dueTime)) return Number.POSITIVE_INFINITY
  const [h, m] = dueTime.split(':').map(Number)
  return h * 60 + m
}

// Whether an action with a date+time is now past its due moment (local clock).
// Date-only actions (no dueTime) are never "time overdue" — they use the existing
// date-string comparison elsewhere.
export function isTimeOverdue(dueDate: string | null, dueTime: string | null): boolean {
  if (!dueDate || !dueTime || !/^\d{2}:\d{2}$/.test(dueTime)) return false
  const due = new Date(`${dueDate}T${dueTime}:00`)
  return due.getTime() <= Date.now()
}

// Default reminder time when notify is on but no explicit dueTime was set:
// 8:00 AM on weekdays, 10:00 AM on weekends (Sat/Sun), based on the due date's
// weekday. Mirrors the server's `defaultReminderTime` in server/src/lib/push.ts.
export function defaultReminderTime(dueDate: string | null | undefined): string {
  const day = dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)
    ? new Date(`${dueDate}T00:00:00`).getDay()
    : new Date().getDay()
  return day === 0 || day === 6 ? '10:00' : '08:00'
}

// Parse a free-form time string into canonical "HH:MM" 24h. Returns '' for an
// empty string (meaning "no time"), or null when the input can't be understood.
// Forgiving by design: a bare hour assumes :00 minutes, and the AM/PM marker can
// be a single "a"/"p". Examples:
//   "9" → "09:00", "9a" → "09:00", "9p"/"9 pm" → "21:00", "2:30p" → "14:30",
//   "930pm" → "21:30", "1400" → "14:00", "12a" → "00:00", "12p" → "12:00".
export function parseTimeInput(raw: string): string | null {
  const s = raw.trim().toLowerCase()
  if (!s) return ''

  // Pull a trailing AM/PM marker ("a", "p", "am", "pm", with optional dots).
  let meridiem: 'am' | 'pm' | null = null
  let core = s
  const merMatch = s.match(/([ap])\.?m?\.?$/)
  if (merMatch) {
    meridiem = merMatch[1] === 'a' ? 'am' : 'pm'
    core = s.slice(0, merMatch.index).trim()
  }

  // Extract hour + optional minute from what's left.
  let hour: number
  let minute: number
  const colon = core.match(/^(\d{1,2})[:.](\d{1,2})$/)
  if (colon) {
    hour = parseInt(colon[1], 10)
    minute = parseInt(colon[2], 10)
  } else if (/^\d+$/.test(core)) {
    if (core.length <= 2) {
      hour = parseInt(core, 10)
      minute = 0
    } else if (core.length === 3) {
      hour = parseInt(core.slice(0, 1), 10)
      minute = parseInt(core.slice(1), 10)
    } else if (core.length === 4) {
      hour = parseInt(core.slice(0, 2), 10)
      minute = parseInt(core.slice(2), 10)
    } else {
      return null
    }
  } else {
    return null
  }

  if (Number.isNaN(hour) || Number.isNaN(minute) || minute > 59) return null

  if (meridiem) {
    if (hour < 1 || hour > 12) return null
    if (meridiem === 'am') hour = hour === 12 ? 0 : hour
    else hour = hour === 12 ? 12 : hour + 12
  }
  if (hour > 23) return null

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}
