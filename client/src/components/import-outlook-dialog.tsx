import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Ban, CalendarClock, Check, Clock, Loader2, Repeat } from 'lucide-react'
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
  /** A calendar block that isn't a meeting — lunch, travel, Outlook's private placeholder
   *  (`server/src/lib/calendar-filter.ts`). Hidden behind a disclosure, never selected by
   *  default, but tickable by hand in case a rule over-matched a real meeting. */
  excluded: boolean
}

type Preset = 'today' | 'tomorrow' | 'week' | 'next7' | 'custom'

const PRESETS = [
  ['today', 'Today'],
  ['tomorrow', 'Tomorrow'],
  ['week', 'This week'],
  ['next7', 'Next 7 days'],
] as const

const keyOf = (e: { uid: string; date: string }) => `${e.uid}|${e.date}`

// Worth sending to the server: a meeting to create, or one to repair the times of.
const isActionable = (e: EventRow) => !e.excluded && (!e.alreadyImported || e.needsTimeFix)

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
  // No range is chosen until the owner picks one, so the dialog opens without fetching
  // anything. It deliberately does NOT remember the last range: it used to persist that in
  // localStorage, which meant opening the dialog immediately fired a search for whatever
  // was imported last — the wrong days, at a cost of one slow ICS fetch, every single time.
  const [preset, setPreset] = useState<Preset | null>(null)
  const [range, setRange] = useState({ from: '', to: '' })
  const [events, setEvents] = useState<EventRow[]>([])
  const [showExcluded, setShowExcluded] = useState(false)
  const [timezone, setTimezone] = useState<string>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importCount, setImportCount] = useState(0)
  const [notConfigured, setNotConfigured] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Identifies the newest load. Changing the range twice in quick succession leaves two
  // fetches racing, and the ICS fetch is slow enough that they routinely land out of order —
  // an older one must not paint its events, its error, or clear the spinner over the range
  // the user is actually looking at. `finally` still runs after the early returns, so the
  // guard has to be in there too.
  const reqSeq = useRef(0)
  const inFlight = useRef<AbortController | null>(null)

  // Every open starts blank — nothing remembered, nothing fetched. Resetting on BOTH edges
  // of `open` means a reopen can't flash the previous session's list for a frame before the
  // reset lands. Writing an empty range is what holds the load effect below: it only fires
  // once both dates are set, so opening the dialog issues no request at all.
  useEffect(() => {
    reqSeq.current++ // orphan any in-flight response so it can't paint into the blank state
    inFlight.current?.abort()
    setPreset(null)
    setRange((r) => (!r.from && !r.to ? r : { from: '', to: '' }))
    setEvents([])
    setSelected(new Set())
    setShowExcluded(false)
    setLoading(false)
    setError(null)
    setNotConfigured(false)
  }, [open])

  const choosePreset = (p: Exclude<Preset, 'custom'>) => {
    setPreset(p)
    setRange(presetRange(p))
  }

  const setCustom = (patch: Partial<{ from: string; to: string }>) => {
    setPreset('custom')
    setRange((r) => ({ ...r, ...patch }))
  }

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
      // whose times we can now fill in (the common path is pick a range → Import).
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

  const rangeReady = !!range.from && !!range.to && range.from <= range.to
  const rangeBackwards = !!range.from && !!range.to && range.from > range.to

  useEffect(() => {
    if (open && rangeReady) {
      load()
      return
    }
    // No range to search (dialog just opened, or a date input was cleared / left backwards):
    // withdraw anything in flight so its results can't land under a range nobody asked for,
    // and don't leave the spinner running for a request nobody is waiting on.
    reqSeq.current++
    inFlight.current?.abort()
    setLoading(false)
  }, [open, rangeReady, load])

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
  const excludedCount = useMemo(() => events.filter((e) => e.excluded).length, [events])

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(selectableKeys))

  const grouped = useMemo(() => {
    const map = new Map<string, EventRow[]>()
    for (const e of events) {
      if (e.excluded && !showExcluded) continue
      if (!map.has(e.date)) map.set(e.date, [])
      map.get(e.date)!.push(e)
    }
    return [...map.entries()]
  }, [events, showExcluded])

  const doImport = async () => {
    const selections = events.filter((e) => selected.has(keyOf(e))).map((e) => ({ uid: e.uid, date: e.date }))
    if (selections.length === 0) return
    setImportCount(selections.length)
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
      // The work is done — close instead of re-listing the range with everything now greyed
      // out as "Imported". The toast carries the outcome, and a second pass is a click away
      // (and cheap, since re-opening starts blank rather than re-fetching this range).
      onOpenChange(false)
    } catch (e) {
      // Stay open on failure: the selection is still on screen to retry.
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
              disabled={importing}
              onClick={() => choosePreset(p)}
            >
              {label}
            </Button>
          ))}
          <div className="flex items-center gap-1">
            <Input
              type="date"
              value={range.from}
              max={range.to || undefined}
              disabled={importing}
              onChange={(e) => setCustom({ from: e.target.value })}
              className="h-7 w-[8.5rem] text-xs"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <Input
              type="date"
              value={range.to}
              min={range.from || undefined}
              disabled={importing}
              onChange={(e) => setCustom({ to: e.target.value })}
              className="h-7 w-[8.5rem] text-xs"
            />
          </div>
        </div>

        {/* Body */}
        <div className="min-h-[12rem] flex-1 overflow-y-auto p-3">
          {importing ? (
            // Creating N meetings means an ICS re-fetch plus a write transaction — several
            // seconds on a cold function. Say what's happening rather than leaving the list
            // sitting there looking untouched with only a small spinner in the button.
            <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-sm font-medium">
                Importing {importCount} meeting{importCount === 1 ? '' : 's'}…
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Re-reading the calendar and creating the meetings. This can take a few seconds.
              </p>
            </div>
          ) : loading ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 pb-1 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Reading your Outlook calendar…
              </div>
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
          ) : rangeBackwards ? (
            <div className="flex h-full items-center justify-center py-10 text-center text-sm text-muted-foreground">
              The end date is before the start date.
            </div>
          ) : !rangeReady ? (
            // The idle state the dialog now opens in: nothing is fetched until a range exists.
            <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
              <CalendarClock className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Pick a date range</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Choose one of the presets above, or set both dates, to see what's on your calendar.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {grouped.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                  No meetings in this range.
                </div>
              ) : (
                grouped.map(([date, rows]) => (
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
                            locked || e.excluded ? 'opacity-55' : 'hover:bg-muted/60'
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
                          {e.excluded && !locked && (
                            <span
                              className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground"
                              title="Skipped automatically — lunch, travel and private blocks aren't meetings. Tick it to import it anyway."
                            >
                              <Ban className="h-3.5 w-3.5" /> Skipped
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
                ))
              )}
              {excludedCount > 0 && (
                // A rule can over-match a real meeting ("Hotel Industry Roundtable"), so the
                // skipped blocks stay reachable instead of silently vanishing from the list.
                <div className="border-t pt-2 text-xs text-muted-foreground">
                  {showExcluded
                    ? `Showing ${excludedCount} lunch/travel/private block${excludedCount === 1 ? '' : 's'} — tick one to import it anyway. `
                    : `${excludedCount} lunch/travel/private block${excludedCount === 1 ? '' : 's'} skipped. `}
                  <button
                    type="button"
                    onClick={() => setShowExcluded((v) => !v)}
                    className="text-primary hover:underline"
                  >
                    {showExcluded ? 'Hide' : 'Show'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t p-3 sm:justify-between">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {importable.length > 0 && !importing && (
              <button type="button" onClick={toggleAll} className="text-primary hover:underline">
                {allSelected ? 'Select none' : 'Select all'}
              </button>
            )}
            {timezone && rangeReady && <span className="hidden sm:inline">Times in {timezone}</span>}
          </div>
          {/* Stable min-width (fits up to "Import 188") so the right-anchored button's left edge
              never jumps as the count label changes — that edge movement leaves a ghost/"doubled"
              paint on iOS Safari (the artifact the owner hit after select/select-none). */}
          <Button onClick={doImport} disabled={importing || selectedCount === 0} className="min-w-[7.5rem]">
            {importing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            {importing ? 'Importing…' : `Import${selectedCount > 0 ? ` ${selectedCount}` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
