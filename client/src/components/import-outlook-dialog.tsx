import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, Check, Loader2, Repeat } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
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
  isAllDay: boolean
  isRecurring: boolean
  alreadyImported: boolean
}

type Preset = 'today' | 'week' | 'next7' | 'custom'

const RANGE_KEY = 'outlook_import_range'
const keyOf = (e: { uid: string; date: string }) => `${e.uid}|${e.date}`

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
  if (preset === 'week') {
    const dow = (today.getDay() + 6) % 7 // 0 = Monday
    const mon = new Date(today)
    mon.setDate(today.getDate() - dow)
    const sun = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    return { from: ymd(mon), to: ymd(sun) }
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
  const [preset, setPreset] = useState<Preset>('next7')
  const [range, setRange] = useState(() => presetRange('next7'))
  const [events, setEvents] = useState<EventRow[]>([])
  const [timezone, setTimezone] = useState<string>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [notConfigured, setNotConfigured] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Restore the last-used range when the dialog opens (it's a many-times-a-day tool).
  useEffect(() => {
    if (!open) return
    try {
      const saved = JSON.parse(localStorage.getItem(RANGE_KEY) || 'null')
      if (saved?.preset === 'custom' && saved.from && saved.to) {
        setPreset('custom')
        setRange({ from: saved.from, to: saved.to })
      } else if (saved?.preset) {
        setPreset(saved.preset)
        setRange(presetRange(saved.preset))
      }
    } catch {
      /* ignore */
    }
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

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setNotConfigured(false)
    try {
      const res = await api.get<{ events: EventRow[]; timezone: string }>(
        `/calendar/events?from=${range.from}&to=${range.to}`,
      )
      setEvents(res.events)
      setTimezone(res.timezone)
      // Default selection = everything not yet imported (the common path is open → Import).
      setSelected(new Set(res.events.filter((e) => !e.alreadyImported).map(keyOf)))
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) {
        setNotConfigured(true)
        setEvents([])
      } else {
        setError(e instanceof Error ? e.message : 'Failed to load calendar')
        setEvents([])
      }
    } finally {
      setLoading(false)
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

  const importable = useMemo(() => events.filter((e) => !e.alreadyImported), [events])
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
      const res = await api.post<{ created: number; skipped: number }>('/calendar/import', { selections })
      if (res.created > 0) {
        toast.success(`Imported ${res.created} meeting${res.created === 1 ? '' : 's'}`, {
          description: res.skipped ? `${res.skipped} already imported, skipped` : undefined,
        })
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
            later. Re-importing never overwrites meetings you've already edited.
          </DialogDescription>
        </DialogHeader>

        {/* Range presets */}
        <div className="flex flex-wrap items-center gap-1.5 border-b p-3">
          {([
            ['today', 'Today'],
            ['week', 'This week'],
            ['next7', 'Next 7 days'],
          ] as const).map(([p, label]) => (
            <Button
              key={p}
              size="sm"
              variant={preset === p ? 'secondary' : 'ghost'}
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
                    return (
                      <label
                        key={k}
                        className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 ${
                          e.alreadyImported ? 'opacity-55' : 'hover:bg-muted/60'
                        }`}
                      >
                        <Checkbox
                          checked={e.alreadyImported || selected.has(k)}
                          disabled={e.alreadyImported}
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
                        {e.alreadyImported && (
                          <span className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
                            <Check className="h-3.5 w-3.5" /> Imported
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
          <Button onClick={doImport} disabled={importing || selectedCount === 0}>
            {importing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Import{selectedCount > 0 ? ` ${selectedCount}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
