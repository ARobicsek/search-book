import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, Check, Clock, Loader2, Repeat } from 'lucide-react'
import { AbortedError, api, ApiError } from '@/lib/api'
import { formatStartTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

type EventRow = {
  uid: string
  subject: string | null
  date: string
  startTime: string | null
  endTime: string | null
  isAllDay: boolean
  isRecurring: boolean
  alreadyImported: boolean
  /** Already imported, but the stored meeting is missing a start/end time the calendar has —
   *  meetings imported before end times existed have no end, so "happening now" has to guess
   *  an hour for them. Re-importing fills the blank in (and nothing else). */
  needsTimeFix: boolean
}

type Preset = 'today' | 'tomorrow' | 'week' | 'next7' | 'custom'

const PRESETS = [
  ['today', 'Today'],
  ['tomorrow', 'Tomorrow'],
  ['week', 'This week'],
  ['next7', 'Next 7 days'],
] as const

const DEFAULT_PRESET: Exclude<Preset, 'custom'> = 'next7'

const RANGE_KEY = 'outlook_import_range'
const keyOf = (e: { uid: string; date: string }) => `${e.uid}|${e.date}`

// Worth sending to the server: a meeting to create, or one to repair the times of.
const isActionable = (e: EventRow) => !e.alreadyImported || e.needsTimeFix

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function presetRange(preset: Exclude<Preset, 'custom'>): { from: string; to: string } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (preset === 'today') return { from: ymd(today), to: ymd(today) }
  if (preset === 'tomorrow') {
    const t = new Date(today)
    t.setDate(today.getDate() + 1)
    return { from: ymd(t), to: ymd(t) }
  }
  if (preset === 'week') {
    /* "The rest of this week": today through the coming Saturday (weeks run
     * Sunday–Saturday, US convention). It deliberately never reaches into the
     * past — every preset here is forward-looking, and the custom date inputs
     * are how you'd reach backwards.
     *
     * The previous version anchored to Monday, so on a SUNDAY it returned the
     * Monday six days ago through today — a range entirely in the past, which
     * imported nothing. Sunday is the case to check when changing this:
     *   Sun (getDay 0) -> today..+6   Wed (3) -> today..+3   Sat (6) -> today only */
    const sat = new Date(today)
    sat.setDate(today.getDate() + (6 - today.getDay()))
    return { from: ymd(today), to: ymd(sat) }
  }
  const end = new Date(today) // next7
  end.setDate(today.getDate() + 6)
  return { from: ymd(today), to: ymd(end) }
}

/** The last-used range, already resolved to concrete dates. A stored preset is
 *  RE-resolved against today every time this is read, so a tab left open overnight
 *  can't reopen showing yesterday's "Today". */
function readSavedRange(): { preset: Preset; from: string; to: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(RANGE_KEY) || 'null')
    if (saved?.preset === 'custom' && saved.from && saved.to) {
      return { preset: 'custom', from: saved.from, to: saved.to }
    }
    const known = PRESETS.find(([p]) => p === saved?.preset)
    if (known) return { preset: known[0], ...presetRange(known[0]) }
  } catch {
    /* ignore */
  }
  return { preset: DEFAULT_PRESET, ...presetRange(DEFAULT_PRESET) }
}

function dayHeader(dateStr: string): string {
  return parseYmd(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function ImportOutlookDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  // Seeded from localStorage on the FIRST render — NOT in an effect afterwards. This
  // dialog is mounted for the page's whole life, so when the restore was an on-open
  // effect the first render still held the `next7` default, and the load effect below
  // (same commit, state updates not yet applied) fired a request for it. Opening the
  // dialog therefore always ran two overlapping fetches, and the wrong range painted
  // first: the owner picked "Today" and watched it show 7 days, then tomorrow, then
  // today — three responses with nothing deciding which one was still wanted.
  const [preset, setPreset] = useState<Preset>(() => readSavedRange().preset)
  const [range, setRange] = useState(() => {
    const { from, to } = readSavedRange()
    return { from, to }
  })
  const [events, setEvents] = useState<EventRow[]>([])
  const [timezone, setTimezone] = useState<string>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [notConfigured, setNotConfigured] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-resolve on open so a stored preset keeps following the calendar. Handing back
  // the SAME range object when nothing moved is what keeps this from re-triggering the
  // load effect below — the common case (open, unchanged range) must stay one request.
  useEffect(() => {
    if (!open) return
    const next = readSavedRange()
    setPreset(next.preset)
    setRange((r) => (r.from === next.from && r.to === next.to ? r : { from: next.from, to: next.to }))
  }, [open])

  const choosePreset = (p: Exclude<Preset, 'custom'>) => {
    setPreset(p)
    setRange(presetRange(p))
    localStorage.setItem(RANGE_KEY, JSON.stringify({ preset: p }))
  }

  const setCustom = (patch: Partial<{ from: string; to: string }>) => {
    setPreset('custom')
    setRange((r) => {
      const next = { ...r, ...patch }
      localStorage.setItem(RANGE_KEY, JSON.stringify({ preset: 'custom', ...next }))
      return next
    })
  }

  // Identifies the newest load. Changing the range twice in quick succession (opening
  // the dialog, then picking a preset) leaves two fetches racing, and the ICS fetch is
  // slow enough that they routinely land out of order — an older one must not paint its
  // events, its error, or clear the spinner over the range the user is actually looking
  // at. `finally` still runs after the early returns, so the guard has to be in there too.
  const reqSeq = useRef(0)
  const inFlight = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    inFlight.current?.abort() // the superseded request's work is wasted; don't finish it
    const controller = new AbortController()
    inFlight.current = controller
    const seq = ++reqSeq.current
    const isCurrent = () => seq === reqSeq.current
    setLoading(true)
    setError(null)
    setNotConfigured(false)
    try {
      const res = await api.get<{ events: EventRow[]; timezone: string }>(
        `/calendar/events?from=${range.from}&to=${range.to}`,
        { signal: controller.signal },
      )
      if (!isCurrent()) return
      setEvents(res.events)
      setTimezone(res.timezone)
      // Default selection = everything actionable — not yet imported, plus anything imported
      // whose times we can now fill in (the common path is open → Import).
      setSelected(new Set(res.events.filter(isActionable).map(keyOf)))
    } catch (e) {
      // An abort means we withdrew the request, not that the calendar failed.
      if (!isCurrent() || e instanceof AbortedError) return
      if (e instanceof ApiError && e.status === 503) {
        setNotConfigured(true)
        setEvents([])
      } else {
        setError(e instanceof Error ? e.message : 'Failed to load calendar')
        setEvents([])
      }
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [range.from, range.to])

  useEffect(() => {
    if (open && range.from && range.to && range.from <= range.to) load()
  }, [open, range.from, range.to, load])

  const toggle = (k: string) =>
    setSelected((s) => {
      const next = new Set(s)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })

  const importable = useMemo(() => events.filter(isActionable), [events])
  const selectableKeys = useMemo(() => importable.map(keyOf), [importable])
  const allSelected = selectableKeys.length > 0 && selectableKeys.every((k) => selected.has(k))
  const selectedCount = selected.size

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(selectableKeys))

  const grouped = useMemo(() => {
    const map = new Map<string, EventRow[]>()
    for (const e of events) {
      if (!map.has(e.date)) map.set(e.date, [])
      map.get(e.date)!.push(e)
    }
    return [...map.entries()]
  }, [events])

  const doImport = async () => {
    const selections = events.filter((e) => selected.has(keyOf(e))).map((e) => ({ uid: e.uid, date: e.date }))
    if (selections.length === 0) return
    setImporting(true)
    try {
      const res = await api.post<{ created: number; updated: number; skipped: number }>(
        '/calendar/import',
        { selections },
      )
      const fixed = res.updated ? `filled in times for ${res.updated}` : ''
      if (res.created > 0) {
        toast.success(`Imported ${res.created} meeting${res.created === 1 ? '' : 's'}`, {
          description: [fixed, res.skipped ? `${res.skipped} already imported` : ''].filter(Boolean).join(' · ') || undefined,
        })
        window.dispatchEvent(new CustomEvent('searchbook:meeting-logged'))
      } else if (res.updated > 0) {
        toast.success(`Filled in times for ${res.updated} meeting${res.updated === 1 ? '' : 's'}`)
        window.dispatchEvent(new CustomEvent('searchbook:meeting-logged'))
      } else {
        toast.info('Nothing new to import', {
          description: res.skipped ? `${res.skipped} already imported` : undefined,
        })
      }
      await load() // reflect the new "already imported" state; dialog stays open for a second pass
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="space-y-1 border-b p-4">
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            Import from Outlook
          </DialogTitle>
          <DialogDescription>
            Pre-load meetings from your calendar — subject, date and time. Add attendees and notes
            later. Re-importing never overwrites meetings you've already edited; it only fills in
            times they're missing.
          </DialogDescription>
        </DialogHeader>

        {/* Range presets */}
        <div className="flex flex-wrap items-center gap-1.5 border-b p-3">
          {PRESETS.map(([p, label]) => (
            <Button
              key={p}
              size="sm"
              // `secondary` here was near-invisible: it is oklch(0.97) against an
              // oklch(1) dialog, a 3% lightness difference that some displays lose
              // entirely. The view-switchers that use secondary/ghost sit inside a
              // bordered container which carries the grouping; these don't, so the
              // selected state has to carry it alone. `default`/`outline` matches
              // how contact-list marks an active filter, which is what these are.
              variant={preset === p ? 'default' : 'outline'}
              className="h-7"
              onClick={() => choosePreset(p)}
            >
              {label}
            </Button>
          ))}
          <div className="flex items-center gap-1">
            <Input
              type="date"
              value={range.from}
              max={range.to}
              onChange={(e) => setCustom({ from: e.target.value })}
              className="h-7 w-[8.5rem] text-xs"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <Input
              type="date"
              value={range.to}
              min={range.from}
              onChange={(e) => setCustom({ to: e.target.value })}
              className="h-7 w-[8.5rem] text-xs"
            />
          </div>
        </div>

        {/* Body */}
        <div className="min-h-[12rem] flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : notConfigured ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
              <CalendarClock className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Outlook calendar not connected</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Set <code className="rounded bg-muted px-1">OUTLOOK_CALENDAR_ICS_URL</code> to your
                published Outlook calendar (.ics) link to enable importing.
              </p>
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button size="sm" variant="outline" onClick={load}>
                Try again
              </Button>
            </div>
          ) : events.length === 0 ? (
            <div className="flex h-full items-center justify-center py-10 text-sm text-muted-foreground">
              No meetings in this range.
            </div>
          ) : (
            <div className="space-y-3">
              {grouped.map(([date, rows]) => (
                <div key={date} className="space-y-1">
                  <div className="sticky top-0 bg-background py-0.5 text-xs font-semibold text-muted-foreground">
                    {dayHeader(date)}
                  </div>
                  {rows.map((e) => {
                    const k = keyOf(e)
                    const locked = e.alreadyImported && !e.needsTimeFix
                    return (
                      <label
                        key={k}
                        className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 ${
                          locked ? 'opacity-55' : 'hover:bg-muted/60'
                        }`}
                      >
                        <Checkbox
                          checked={locked || selected.has(k)}
                          disabled={locked}
                          onCheckedChange={() => toggle(k)}
                        />
                        <span className="w-16 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                          {e.isAllDay || !e.startTime ? 'All day' : formatStartTime(e.startTime)}
                        </span>
                        <span className="flex-1 truncate text-sm">
                          {e.subject || <span className="italic text-muted-foreground">(no subject)</span>}
                        </span>
                        {e.isRecurring && (
                          <Repeat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Recurring" />
                        )}
                        {locked && (
                          <span className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
                            <Check className="h-3.5 w-3.5" /> Imported
                          </span>
                        )}
                        {e.needsTimeFix && (
                          <span
                            className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-amber-600"
                            title="Already imported, but without its times — re-import to fill them in (nothing else is touched)"
                          >
                            <Clock className="h-3.5 w-3.5" /> Add times
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t p-3 sm:justify-between">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {importable.length > 0 && (
              <button type="button" onClick={toggleAll} className="text-primary hover:underline">
                {allSelected ? 'Select none' : 'Select all'}
              </button>
            )}
            {timezone && <span className="hidden sm:inline">Times in {timezone}</span>}
          </div>
          {/* Stable min-width (fits up to "Import 188") so the right-anchored button's left edge
              never jumps as the count label changes — that edge movement leaves a ghost/"doubled"
              paint on iOS Safari (the artifact the owner hit after select/select-none). */}
          <Button onClick={doImport} disabled={importing || selectedCount === 0} className="min-w-[7.5rem]">
            {importing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Import{selectedCount > 0 ? ` ${selectedCount}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
