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
