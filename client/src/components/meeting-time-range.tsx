import { TimeInput } from '@/components/time-input'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

// Compact start/end time entry for a meeting, tuned for the fewest keystrokes.
// Most meetings start on the hour or half hour and run 30 / 45 / 60 minutes, so:
//   • Start uses the forgiving free-text TimeInput ("9" → 9:00, "930" → 9:30,
//     "2p" → 2:00 PM) — the same one used for action reminders.
//   • End is normally set with a single tap on a duration chip (computed from the
//     start); no end time is ever typed in the common case.
//   • The End field stays editable for the rare custom length. A typed end that
//     lands at/before the start is bumped 12h ("start 1:00, end 2" → 2:00 PM), so
//     the end is always after the start.

const DURATIONS = [30, 45, 60] as const
const DAY = 24 * 60

function toMinutes(hhmm: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
function fromMinutes(mins: number): string {
  const wrapped = ((mins % DAY) + DAY) % DAY
  const h = Math.floor(wrapped / 60)
  const m = wrapped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
function label(mins: number): string {
  return mins === 60 ? '1h' : `${mins}m`
}

interface MeetingTimeRangeProps {
  // Canonical "HH:MM" 24h values, or '' for none.
  startTime: string
  endTime: string
  onChange: (startTime: string, endTime: string) => void
  startId?: string
}

export function MeetingTimeRange({ startTime, endTime, onChange, startId }: MeetingTimeRangeProps) {
  const startMin = toMinutes(startTime)
  const endMin = toMinutes(endTime)
  // Which duration chip (if any) matches the current start→end span, so it reads
  // as selected. Only a same-day, positive span counts.
  const activeDuration =
    startMin != null && endMin != null && endMin > startMin ? endMin - startMin : null

  function handleStart(next: string) {
    const nm = toMinutes(next)
    // Shifting the start keeps the chosen length: re-type the start and the end
    // follows, so you never re-pick the duration. Clearing the start clears both.
    if (nm != null && activeDuration != null) {
      onChange(next, fromMinutes(nm + activeDuration))
    } else if (next === '') {
      onChange('', '')
    } else {
      onChange(next, endTime)
    }
  }

  function handleEnd(next: string) {
    const nm = toMinutes(next)
    // Keep the end after the start: an ambiguous earlier time gets a 12h bump
    // (start 13:00, typed "2" → 02:00 → 14:00) when that lands later the same day.
    if (nm != null && startMin != null && nm <= startMin) {
      const bumped = nm + 12 * 60
      if (bumped < DAY && bumped > startMin) {
        onChange(startTime, fromMinutes(bumped))
        return
      }
    }
    onChange(startTime, next)
  }

  function pickDuration(mins: number) {
    if (startMin == null) return
    // Tapping the active chip again toggles the end off (blank end = duration-only
    // meetings and the "assumed 60 min" fallback still work).
    if (activeDuration === mins) onChange(startTime, '')
    else onChange(startTime, fromMinutes(startMin + mins))
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <div className="flex items-center gap-1">
        <TimeInput
          id={startId}
          value={startTime}
          onChange={handleStart}
          placeholder="Start"
          className="h-8 w-[5.5rem]"
        />
        <span className="text-muted-foreground">–</span>
        <TimeInput
          value={endTime}
          onChange={handleEnd}
          placeholder="End"
          className="h-8 w-[5.5rem]"
        />
      </div>
      <div className="flex items-center gap-1">
        {DURATIONS.map((d) => (
          <Button
            key={d}
            type="button"
            variant={activeDuration === d ? 'secondary' : 'outline'}
            size="sm"
            className="h-8 px-2 text-xs font-normal"
            disabled={startMin == null}
            title={startMin == null ? 'Enter a start time first' : `End ${d} min after start`}
            onClick={() => pickDuration(d)}
          >
            {label(d)}
          </Button>
        ))}
        {(startTime || endTime) && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            title="Clear times"
            aria-label="Clear times"
            onClick={() => onChange('', '')}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
