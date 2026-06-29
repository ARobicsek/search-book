import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import type { DatesSetArg, EventClickArg } from '@fullcalendar/core'
import { api } from '@/lib/api'
import type { Conversation, DatePrecision, Tag } from '@/lib/types'
import { CONVERSATION_TYPE_OPTIONS, conversationDisplayName } from '@/lib/types'
import { useIsMobile } from '@/hooks/use-mobile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { HighlightedText } from '@/components/highlighted-text'
import { MentionableMarkdown } from '@/components/mentionable-markdown'
import { PersonTooltip } from '@/components/person-tooltip'
import { useQuickLog } from '@/components/quick-log-dialog'
import { toast } from 'sonner'
import {
  Building2, CalendarClock, CalendarDays, ChevronDown, ChevronUp, FileText, Layers, List, Loader2,
  MessageSquarePlus, Paperclip, Pencil, Tag as TagIcon, Trash2, X,
} from 'lucide-react'
import { formatStartTime } from '@/lib/utils'
import { ImportOutlookDialog } from '@/components/import-outlook-dialog'

const conversationTypeColors: Record<string, string> = {
  CALL: 'bg-green-100 text-green-800',
  VIDEO_CALL: 'bg-teal-100 text-teal-800',
  EMAIL: 'bg-blue-100 text-blue-800',
  MEETING: 'bg-purple-100 text-purple-800',
  LINKEDIN: 'bg-sky-100 text-sky-800',
  COFFEE: 'bg-amber-100 text-amber-800',
  EVENT: 'bg-rose-100 text-rose-800',
  OTHER: 'bg-slate-100 text-slate-700',
}

// Concrete hex colors for calendar events, mirroring the Tailwind
// `conversationTypeColors` badge palette (FullCalendar needs CSS colors, not
// class names). bg = the *-100 fill, text = the *-700/800 foreground.
const meetingTypeCalendarColors: Record<string, { bg: string; text: string }> = {
  CALL: { bg: '#dcfce7', text: '#166534' },        // green
  VIDEO_CALL: { bg: '#ccfbf1', text: '#115e59' },  // teal
  EMAIL: { bg: '#dbeafe', text: '#1e40af' },        // blue
  MEETING: { bg: '#f3e8ff', text: '#6b21a8' },      // purple
  LINKEDIN: { bg: '#e0f2fe', text: '#075985' },     // sky
  COFFEE: { bg: '#fef3c7', text: '#92400e' },       // amber
  EVENT: { bg: '#ffe4e6', text: '#9f1239' },        // rose
  OTHER: { bg: '#f1f5f9', text: '#334155' },        // slate
}

function formatConversationDate(dateStr: string, precision: DatePrecision) {
  const d = new Date(dateStr + 'T00:00:00')
  switch (precision) {
    case 'DAY':
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    case 'MONTH':
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    case 'QUARTER': {
      const q = Math.ceil((d.getMonth() + 1) / 3)
      return `Q${q} ${d.getFullYear()}`
    }
    case 'YEAR':
      return d.getFullYear().toString()
    default:
      return dateStr
  }
}

function getLabel(value: string, options: { value: string; label: string }[]) {
  return options.find((o) => o.value === value)?.label ?? value
}

// Current Eastern-time "today" (YYYY-MM-DD) + "now" (HH:MM, 24h), in the same shapes
// as a meeting's stored date/startTime so they compare with plain string comparisons.
// Meeting dates/start times are stored in the app's Eastern timezone and the upcoming
// rule keys off 5 PM ET, so anchor to America/New_York regardless of the browser's
// zone (handles DST automatically). Works in the PWA — pure Intl, no deps.
function easternNowParts() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const p: Record<string, string> = {}
  for (const part of fmt.formatToParts(new Date())) p[part.type] = part.value
  const hour = p.hour === '24' ? '00' : p.hour // some engines emit '24' at midnight
  return { today: `${p.year}-${p.month}-${p.day}`, hhmm: `${hour}:${p.minute}` }
}

// End-of-business cutoff for untimed meetings dated today (5 PM Eastern).
const END_OF_BUSINESS = '17:00'

// A meeting is "upcoming" if either:
//  (a) its date/time is in the future — a future date, or today with a start time
//      still ahead of now; or
//  (b) it's today, has no start time, the current time is before end of business
//      (5 PM ET), AND nothing has been written up yet (no summary / notes / next
//      steps — prep notes don't count, since they're written *before* the meeting).
function isUpcomingMeeting(conv: Conversation, today: string, hhmm: string): boolean {
  if (conv.date > today) return true
  if (conv.date < today) return false
  // Same day:
  if (conv.startTime) return conv.startTime > hhmm
  const documented = !!(conv.summary?.trim() || conv.notes?.trim() || conv.nextSteps?.trim())
  return hhmm < END_OF_BUSINESS && !documented
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

const PAGE_SIZE = 20

// Meetings-only calendar (distinct from the actions calendar). Fetches just the
// visible range on each navigation/view change via FullCalendar's `datesSet`,
// renders each meeting as an all-day event colored by type, and opens the Quick
// Log editor on click (so future-dated meetings double as a prep queue).
function MeetingsCalendar() {
  const quickLog = useQuickLog()
  const isMobile = useIsMobile()
  const [meetings, setMeetings] = useState<Conversation[]>([])
  const rangeRef = useRef<{ from: string; to: string } | null>(null)
  // useIsMobile resolves false→true on its mount effect, but FullCalendar reads
  // `initialView` once on mount — so defer the first FullCalendar mount by a
  // frame (same render as the resolved isMobile) to honor the mobile list default.
  const [ready, setReady] = useState(false)
  useEffect(() => { setReady(true) }, [])

  const fetchRange = useCallback(async (from: string, to: string) => {
    try {
      const res = await api.get<{ data: Conversation[] }>(
        `/meetings?from=${from}&to=${to}&limit=100`
      )
      setMeetings(res.data)
    } catch {
      setMeetings([])
    }
  }, [])

  // Fires on initial render and every navigation/view change. startStr/endStr
  // bound the visible grid (endStr is exclusive — a harmless one-day over-fetch).
  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    const from = arg.startStr.slice(0, 10)
    const to = arg.endStr.slice(0, 10)
    rangeRef.current = { from, to }
    fetchRange(from, to)
  }, [fetchRange])

  // Refresh the current range when a meeting is logged/edited via Quick Log.
  useEffect(() => {
    const onLogged = () => {
      if (rangeRef.current) fetchRange(rangeRef.current.from, rangeRef.current.to)
    }
    window.addEventListener('searchbook:meeting-logged', onLogged)
    return () => window.removeEventListener('searchbook:meeting-logged', onLogged)
  }, [fetchRange])

  const events = meetings.map((m) => {
    const c = meetingTypeCalendarColors[m.type] || meetingTypeCalendarColors.OTHER
    const title = conversationDisplayName(m)
    const firstParticipant = m.participants?.[0]?.contact.name
    // Hover tooltip: the first connected participant + the summary. De-dupe the
    // participant when the title already IS that name (1:1 fallback) so it isn't
    // "Name — Name"; lead with summary in that case.
    const tooltip = [
      firstParticipant && firstParticipant !== title ? firstParticipant : null,
      m.summary,
    ].filter(Boolean).join(' — ')
    return {
      id: m.id.toString(),
      title,
      date: m.date,
      allDay: true,
      backgroundColor: c.bg,
      borderColor: c.bg,
      textColor: c.text,
      extendedProps: { tooltip },
    }
  })

  function handleEventClick(info: EventClickArg) {
    quickLog.openEdit(parseInt(info.event.id))
  }

  if (!ready) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="rounded-md border bg-background p-2 sm:p-4">
      <FullCalendar
        plugins={[dayGridPlugin, listPlugin, interactionPlugin]}
        initialView={isMobile ? 'listMonth' : 'dayGridMonth'}
        headerToolbar={isMobile ? {
          left: 'prev,next',
          center: 'title',
          right: 'listMonth,dayGridMonth',
        } : {
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth',
        }}
        events={events}
        eventClick={handleEventClick}
        datesSet={handleDatesSet}
        // Meetings are all-day events; blank FullCalendar's "all-day" time-column
        // label in the mobile list view (owner saw it as "full day") so undated-time
        // meetings simply show no time rather than a misleading label.
        allDayText=""
        eventDidMount={(info) => {
          // Native hover tooltip: first participant + summary (a11y-safe, zero deps).
          const tip = info.event.extendedProps.tooltip as string | undefined
          if (tip) info.el.title = tip
        }}
        height="auto"
        // Show every meeting in a day inline (the cell/row grows with height="auto")
        // rather than capping with a "+N more" link — owner wants all visible.
        dayMaxEvents={false}
        noEventsText="No meetings in this range"
      />
    </div>
  )
}

// Inline date editor for a meeting card — change a meeting's date straight from
// the list (mirrors the inline contact-status / action-due-date controls) without
// opening the full editor. Picking a concrete day also normalizes precision to
// DAY so the readout stays coherent. Saves via a partial PUT (date only).
function MeetingDateSelect({ conv, onUpdate }: { conv: Conversation; onUpdate: () => void }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const getPreset = (daysToAdd: number) => {
    const d = new Date()
    d.setDate(d.getDate() + daysToAdd)
    return d.toLocaleDateString('en-CA')
  }

  async function updateDate(newDate: string) {
    if (!newDate || (newDate === conv.date && conv.datePrecision === 'DAY')) {
      setOpen(false)
      return
    }
    setSaving(true)
    try {
      await api.put(`/conversations/${conv.id}`, { date: newDate, datePrecision: 'DAY' })
      toast.success('Meeting date updated')
      onUpdate()
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update date')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="-mx-1 inline-flex items-center gap-1 rounded px-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Change date"
        >
          <CalendarDays className="h-3.5 w-3.5" />
          {formatConversationDate(conv.date, conv.datePrecision as DatePrecision)}
          {conv.startTime && ` · ${formatStartTime(conv.startTime)}`}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="grid gap-1">
          <span className="px-2 pb-1 text-xs font-medium text-muted-foreground">Change meeting date</span>
          <Button variant="ghost" size="sm" className="justify-start font-normal" disabled={saving} onClick={() => updateDate(getPreset(0))}>
            Today
          </Button>
          <Button variant="ghost" size="sm" className="justify-start font-normal" disabled={saving} onClick={() => updateDate(getPreset(-1))}>
            Yesterday
          </Button>
          <div className="my-1 border-t" />
          <div className="px-2 py-1.5">
            <span className="mb-1 block text-xs text-muted-foreground">Custom date</span>
            <Input
              type="date"
              className="h-8 text-xs"
              value={conv.date}
              disabled={saving}
              onChange={(e) => updateDate(e.target.value)}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Collapsed meeting cards are clamped to roughly this content height (~2 inches)
// so the list scans compactly; clicking a clamped card (or "Show more") expands it.
const COLLAPSED_MAX_PX = 168

// A single meeting card. Renders compact by default — if its content overflows the
// collapsed height it clamps with a fade and a "Show more" toggle, and a click
// anywhere on the (clamped) card expands it. Clicks on links/buttons inside are
// left to do their own thing (they never toggle the card).
function MeetingCard({
  conv,
  qTerm,
  upcoming,
  onEdit,
  onDelete,
  onSeriesClick,
  onTagClick,
  onUpdate,
}: {
  conv: Conversation
  qTerm: string
  upcoming: boolean
  onEdit: () => void
  onDelete: () => void
  onSeriesClick: (seriesId: number) => void
  onTagClick: (tagId: number) => void
  onUpdate: () => void
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  // The inner content div is never clamped (the clamp lives on the wrapper), so its
  // measured height is always the full content height — compare it to the collapsed
  // cap. ResizeObserver re-checks when late content (images, markdown) changes height.
  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return
    const check = () => setOverflowing(el.offsetHeight > COLLAPSED_MAX_PX + 8)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Highlight the search term wherever it can match a card: the heading (title /
  // display name), the series chip, and participant names — mirroring the server's
  // q match (title + participants + series) in meetings.ts.
  const hl = (text: string) =>
    qTerm ? <HighlightedText text={text} terms={[qTerm]} caseSensitive={false} /> : text

  const clamped = !expanded && overflowing

  return (
    <Card className={upcoming ? 'border-l-4 border-l-sky-500' : undefined}>
      <CardContent
        className={`p-4 ${clamped ? 'cursor-pointer' : ''}`}
        onClick={(e) => {
          // Only a click on the empty/clamped card body expands it — never collapse
          // on click (use the toggle), and never hijack a link/button click.
          if (expanded || !overflowing) return
          if ((e.target as HTMLElement).closest('a,button')) return
          setExpanded(true)
        }}
      >
        <div
          className="relative"
          style={clamped ? { maxHeight: COLLAPSED_MAX_PX, overflow: 'hidden' } : undefined}
        >
          <div ref={contentRef} className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`text-xs ${conversationTypeColors[conv.type]}`}>
                {getLabel(conv.type, CONVERSATION_TYPE_OPTIONS)}
              </Badge>
              <MeetingDateSelect conv={conv} onUpdate={onUpdate} />
              {upcoming && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
                  title="This meeting is in the future"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                  Upcoming
                </span>
              )}
              <div className="ml-auto flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  title="Edit meeting"
                  onClick={onEdit}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  title="Delete meeting"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {/* Heading opens the Edit dialog. Displayed text falls back:
                title → first participant → contact → company → description.
                A "series" chip appears only for meetings in a series and
                opens the grouped series view. Contact/company/participant
                remain reachable via the badge chips below. */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="text-left text-sm font-semibold text-primary hover:underline"
                onClick={onEdit}
                title="Edit meeting"
              >
                {hl(conversationDisplayName(conv))}
              </button>
              {conv.series && (
                <button
                  type="button"
                  onClick={() => onSeriesClick(conv.series!.id)}
                  className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs text-violet-800 hover:bg-violet-100"
                  title="View all meetings in this series"
                >
                  <Layers className="h-3 w-3" />
                  {hl(conv.series.name)}
                </button>
              )}
            </div>
            {conv.summary && <p className="text-sm font-medium">{conv.summary}</p>}
            {conv.attendeesDescription && conv.title && (
              <p className="text-xs italic text-muted-foreground">{conv.attendeesDescription}</p>
            )}
            {conv.prepNotes && conv.prepNotes.length > 0 && (
              <div className="rounded-md bg-amber-50/60 p-2">
                <p className="mb-1 flex items-center gap-1 text-xs font-medium text-amber-900">
                  <FileText className="h-3 w-3" /> Prep notes
                </p>
                {conv.prepNotes.map((note) => (
                  <div key={note.id} className="prep-note-markdown text-sm text-muted-foreground">
                    <MentionableMarkdown>{note.content}</MentionableMarkdown>
                  </div>
                ))}
              </div>
            )}
            {conv.notes && (
              <div className="prep-note-markdown text-sm text-muted-foreground">
                <MentionableMarkdown>{conv.notes}</MentionableMarkdown>
              </div>
            )}
            {conv.attachments && conv.attachments.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {conv.attachments.map((att) =>
                  (att.mimeType || '').startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(att.url) ? (
                    <a key={att.id} href={att.url} target="_blank" rel="noreferrer" title={att.name}>
                      <img
                        src={att.url}
                        alt={att.name}
                        className="h-16 w-16 rounded-md border object-cover hover:opacity-80"
                      />
                    </a>
                  ) : (
                    <a
                      key={att.id}
                      href={att.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 text-xs text-primary hover:underline"
                      title={att.name}
                    >
                      <Paperclip className="h-3 w-3" />
                      <span className="max-w-40 truncate">{att.name}</span>
                    </a>
                  )
                )}
              </div>
            )}
            {conv.nextSteps && (
              <div className="text-sm text-muted-foreground">
                <span className="text-xs font-medium">Next steps:</span>
                <div className="prep-note-markdown">
                  <MentionableMarkdown>{conv.nextSteps}</MentionableMarkdown>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-1 pt-1">
              {conv.contact && (
                <Link to={`/contacts/${conv.contact.id}`}>
                  <Badge variant="outline" className="text-xs hover:bg-muted">
                    {conv.contact.name}
                  </Badge>
                </Link>
              )}
              {conv.company && (
                <Link to={`/companies/${conv.company.id}`}>
                  <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100">
                    <Building2 className="mr-1 h-3 w-3" />
                    {conv.company.name}
                  </Badge>
                </Link>
              )}
              {conv.orgs?.map((o) => (
                <Link key={o.company.id} to={`/companies/${o.company.id}`}>
                  <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100">
                    <Building2 className="mr-1 h-3 w-3" />
                    {o.company.name}
                  </Badge>
                </Link>
              ))}
              {conv.participants?.map((p) => (
                <PersonTooltip
                  key={p.contact.id}
                  pronunciation={p.contact.preferredName}
                  title={p.contact.title}
                  employer={p.contact.company?.name}
                  note={p.note}
                >
                  <Link to={`/contacts/${p.contact.id}`}>
                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100">
                      {hl(p.contact.name)}
                    </Badge>
                  </Link>
                </PersonTooltip>
              ))}
              {conv.tags?.map((t) => (
                <button key={t.tag.id} type="button" onClick={() => onTagClick(t.tag.id)}>
                  <Badge variant="outline" className="text-xs bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100">
                    <TagIcon className="mr-1 h-3 w-3" />
                    {t.tag.name}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
          {clamped && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-card to-transparent" />
          )}
        </div>
        {overflowing && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
            className="mt-2 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </CardContent>
    </Card>
  )
}

// Manage all meeting series in one place: rename or delete. Reachable from the
// "Manage" link by the Series filter — the per-series rename/delete buttons in the
// series-view header are easy to miss, so this surfaces the same actions for every
// series (and lets you tidy ones you're not currently viewing).
function ManageSeriesDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: (deletedId?: number) => void
}) {
  type SeriesRow = { id: number; name: string; count: number; lastDate: string | null }
  const [list, setList] = useState<SeriesRow[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.get<SeriesRow[]>('/series')
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!open) return
    setEditingId(null)
    setConfirmDeleteId(null)
    load()
  }, [open, load])

  async function saveRename(id: number) {
    const name = editValue.trim()
    if (!name) return
    setBusy(true)
    try {
      await api.put(`/series/${id}`, { name })
      toast.success('Series renamed')
      setEditingId(null)
      load()
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to rename series')
    } finally {
      setBusy(false)
    }
  }

  async function doDelete(id: number) {
    setBusy(true)
    try {
      await api.delete(`/series/${id}`)
      toast.success('Series deleted — its meetings were kept')
      setConfirmDeleteId(null)
      load()
      onChanged(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete series')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage series</DialogTitle>
          <DialogDescription>
            Rename or delete meeting series. Deleting a series keeps its meetings — they
            just leave the series.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : list.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No series yet. Create one from the Series field when logging a meeting.
          </p>
        ) : (
          <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
            {list.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-md border p-2">
                {editingId === s.id ? (
                  <>
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveRename(s.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      autoFocus
                      className="h-8"
                    />
                    <Button size="sm" onClick={() => saveRename(s.id)} disabled={busy || !editValue.trim()}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </>
                ) : confirmDeleteId === s.id ? (
                  <>
                    <span className="flex-1 truncate text-sm">
                      Delete <span className="font-medium">{s.name}</span>?
                    </span>
                    <Button size="sm" variant="destructive" onClick={() => doDelete(s.id)} disabled={busy}>
                      Delete
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Layers className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.count} meeting{s.count === 1 ? '' : 's'}
                        {s.lastDate ? ` · last ${s.lastDate}` : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      title="Rename series"
                      onClick={() => { setEditingId(s.id); setEditValue(s.name); setConfirmDeleteId(null) }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      title="Delete series"
                      onClick={() => { setConfirmDeleteId(s.id); setEditingId(null) }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MeetingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const quickLog = useQuickLog()

  // URL is the source of truth for filters, so series links
  // (/meetings?seriesId=…) and search deep links (?id=…) work everywhere.
  const seriesFilter = searchParams.get('seriesId') || ''
  const companyFilter = searchParams.get('companyId') || ''
  const tagFilter = searchParams.get('tagId') || ''
  const typeFilter = searchParams.get('type') || 'all'
  const fromFilter = searchParams.get('from') || ''
  const toFilter = searchParams.get('to') || ''
  const qFilter = searchParams.get('q') || ''
  const idFilter = searchParams.get('id') || ''
  // Default sort: most-recently-updated first (owner preference).
  const sortBy = searchParams.get('sortBy') || 'updatedAt'
  const sortDir = searchParams.get('sortDir') || 'desc'
  // "Hide upcoming" toggle — drops not-yet-happened meetings (server-side, so counts
  // and pagination stay correct). Persisted in the URL like the other filters.
  const hideUpcoming = searchParams.get('hideUpcoming') === '1'
  // Series view (seriesFilter) is inherently a chronological list, so the
  // calendar toggle is hidden there and the view is forced back to list.
  const view = !seriesFilter && searchParams.get('view') === 'calendar' ? 'calendar' : 'list'

  const [meetings, setMeetings] = useState<Conversation[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  // Series rename / delete (only reachable from the series view header)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [deleteSeriesOpen, setDeleteSeriesOpen] = useState(false)
  const [deletingSeries, setDeletingSeries] = useState(false)
  // "Manage series" dialog — rename/delete any series (discoverable entry by the filter)
  const [manageSeriesOpen, setManageSeriesOpen] = useState(false)
  // "Import from Outlook" dialog — pre-load meetings from the published ICS calendar
  const [importOpen, setImportOpen] = useState(false)

  // Free-text input is debounced before it hits the URL/server
  const [qInput, setQInput] = useState(qFilter)
  const debouncedQ = useDebounce(qInput, 300)

  // Lookup data for the filter row
  const [seriesOptions, setSeriesOptions] = useState<ComboboxOption[]>([])
  const [companyOptions, setCompanyOptions] = useState<ComboboxOption[]>([])
  const [tagOptions, setTagOptions] = useState<ComboboxOption[]>([])

  // Series options refresh on every meeting save too, so a series created in the
  // Quick Log dialog is immediately named in the filter + series-view heading.
  const loadSeries = useCallback(() => {
    api.get<{ id: number; name: string }[]>('/series')
      .then((data) => setSeriesOptions(data.map((s) => ({ value: s.id.toString(), label: s.name }))))
      .catch(() => { })
  }, [])

  useEffect(() => {
    loadSeries()
    api.get<{ id: number; name: string }[]>('/companies/names')
      .then((data) => setCompanyOptions(data.map((c) => ({ value: c.id.toString(), label: c.name }))))
      .catch(() => { })
    api.get<Tag[]>('/tags')
      .then((data) => setTagOptions(data.map((t) => ({ value: t.id.toString(), label: t.name }))))
      .catch(() => { })
  }, [loadSeries])

  function setParam(key: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    }, { replace: true })
  }

  useEffect(() => {
    if (debouncedQ !== qFilter) setParam('q', debouncedQ)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ])

  const buildQuery = useCallback((offset: number) => {
    const params = new URLSearchParams()
    if (seriesFilter) params.set('seriesId', seriesFilter)
    if (companyFilter) params.set('companyId', companyFilter)
    if (tagFilter) params.set('tagId', tagFilter)
    if (typeFilter && typeFilter !== 'all') params.set('type', typeFilter)
    if (fromFilter) params.set('from', fromFilter)
    if (toFilter) params.set('to', toFilter)
    if (qFilter) params.set('q', qFilter)
    if (idFilter) params.set('id', idFilter)
    // Hiding upcoming meetings needs the client's Eastern wall clock so the server
    // applies the same cutoff as the "Upcoming" badge.
    if (hideUpcoming) {
      const { today, hhmm } = easternNowParts()
      params.set('hideUpcoming', '1')
      params.set('today', today)
      params.set('now', hhmm)
    }
    params.set('sortBy', sortBy)
    params.set('sortDir', sortDir)
    params.set('limit', PAGE_SIZE.toString())
    params.set('offset', offset.toString())
    return params.toString()
  }, [seriesFilter, companyFilter, tagFilter, typeFilter, fromFilter, toFilter, qFilter, idFilter, hideUpcoming, sortBy, sortDir])

  const loadMeetings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ data: Conversation[]; pagination: { total: number; hasMore: boolean } }>(
        `/meetings?${buildQuery(0)}`
      )
      setMeetings(res.data)
      setTotal(res.pagination.total)
      setHasMore(res.pagination.hasMore)
    } catch {
      setMeetings([])
      setTotal(0)
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }, [buildQuery])

  useEffect(() => {
    loadMeetings()
  }, [loadMeetings])

  // Refresh when the Quick Log dialog saves a meeting (incl. any newly-created
  // series, so the filter + series-view heading can name it).
  useEffect(() => {
    const onLogged = () => { loadMeetings(); loadSeries() }
    window.addEventListener('searchbook:meeting-logged', onLogged)
    return () => window.removeEventListener('searchbook:meeting-logged', onLogged)
  }, [loadMeetings, loadSeries])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const res = await api.get<{ data: Conversation[]; pagination: { total: number; hasMore: boolean } }>(
        `/meetings?${buildQuery(meetings.length)}`
      )
      setMeetings((prev) => [...prev, ...res.data])
      setTotal(res.pagination.total)
      setHasMore(res.pagination.hasMore)
    } catch { /* keep what we have */ } finally {
      setLoadingMore(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      await api.delete(`/conversations/${deleteId}`)
      toast.success('Meeting deleted')
      setDeleteId(null)
      loadMeetings()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete meeting')
    } finally {
      setDeleting(false)
    }
  }

  async function handleRenameSeries() {
    const name = renameValue.trim()
    if (!name || !seriesFilter) return
    setRenaming(true)
    try {
      await api.put(`/series/${seriesFilter}`, { name })
      toast.success('Series renamed')
      setRenameOpen(false)
      loadSeries()
      loadMeetings()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to rename series')
    } finally {
      setRenaming(false)
    }
  }

  async function handleDeleteSeries() {
    if (!seriesFilter) return
    setDeletingSeries(true)
    try {
      await api.delete(`/series/${seriesFilter}`)
      toast.success('Series deleted — its meetings were kept')
      setDeleteSeriesOpen(false)
      loadSeries()
      setParam('seriesId', '') // back to all meetings
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete series')
    } finally {
      setDeletingSeries(false)
    }
  }

  const hasFilters = !!(seriesFilter || companyFilter || tagFilter || (typeFilter && typeFilter !== 'all') || fromFilter || toFilter || qFilter || idFilter)

  const seriesName = seriesOptions.find((o) => o.value === seriesFilter)?.label || 'Series'

  // Sort is encoded as "field:dir"; update both URL params in one write.
  const sortValue = `${sortBy}:${sortDir}`
  function setSort(value: string) {
    const [field, dir] = value.split(':')
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('sortBy', field)
      next.set('sortDir', dir)
      return next
    }, { replace: true })
  }

  function clearFilters() {
    setQInput('')
    setSearchParams({}, { replace: true })
  }

  // The search box matches the meeting title only (see server route), so the
  // term is highlighted only in the card heading — handled inside MeetingCard.
  const qTerm = qFilter.trim()

  // "Now" snapshot (Eastern) for flagging upcoming meetings — computed once per render
  // so all cards agree on the same instant (and refreshes on every reload/navigation).
  const { today: todayStr, hhmm: nowHHMM } = easternNowParts()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-1">
            <h1 className="text-2xl font-bold tracking-tight">
              {seriesFilter ? seriesName : 'Meetings'}
            </h1>
            {seriesFilter && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  title="Rename series"
                  onClick={() => { setRenameValue(seriesName); setRenameOpen(true) }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  title="Delete series"
                  onClick={() => setDeleteSeriesOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
          {seriesFilter && (
            <p className="text-sm text-muted-foreground">
              All meetings in this series, newest first
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view === 'list' && (
            <Select value={sortValue} onValueChange={setSort}>
              <SelectTrigger className="h-8 w-[170px]" title="Sort meetings">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date:desc">Date (newest)</SelectItem>
                <SelectItem value="date:asc">Date (oldest)</SelectItem>
                <SelectItem value="updatedAt:desc">Recently updated</SelectItem>
                <SelectItem value="createdAt:desc">Recently logged</SelectItem>
              </SelectContent>
            </Select>
          )}
          {view === 'list' && (
            <label
              className="flex h-8 cursor-pointer select-none items-center gap-1.5 rounded-md border px-2 text-sm text-muted-foreground"
              title="Hide meetings that haven't happened yet"
            >
              <Switch
                checked={hideUpcoming}
                onCheckedChange={(c) => setParam('hideUpcoming', c ? '1' : '')}
                aria-label="Hide upcoming meetings"
              />
              Hide upcoming
            </label>
          )}
          {!seriesFilter && (
            <div className="inline-flex rounded-md border p-0.5">
              <Button
                variant={view === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 gap-1 px-2"
                onClick={() => setParam('view', '')}
              >
                <List className="h-4 w-4" />
                <span className="hidden sm:inline">List</span>
              </Button>
              <Button
                variant={view === 'calendar' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 gap-1 px-2"
                onClick={() => setParam('view', 'calendar')}
              >
                <CalendarDays className="h-4 w-4" />
                <span className="hidden sm:inline">Calendar</span>
              </Button>
            </div>
          )}
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <CalendarClock className="mr-1 h-4 w-4" />
            <span className="hidden sm:inline">Import from </span>Outlook
          </Button>
          <Button onClick={() => quickLog.open()}>
            <MessageSquarePlus className="mr-1 h-4 w-4" />
            Log Meeting
          </Button>
        </div>
      </div>

      {view === 'calendar' ? (
        <MeetingsCalendar />
      ) : (
      <>
      {/* Filters — most-used (Search) sits top-left; least-used (Type) bottom-left. */}
      <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Search</Label>
          <div className="relative">
            <Input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search meeting titles…"
              className={qInput ? 'pr-10' : undefined}
            />
            {qInput && (
              <button
                type="button"
                onClick={() => setQInput('')}
                aria-label="Clear search text"
                className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Series</Label>
            <button
              type="button"
              onClick={() => setManageSeriesOpen(true)}
              className="text-xs text-primary hover:underline"
            >
              Manage
            </button>
          </div>
          <Combobox
            options={seriesOptions}
            value={seriesFilter}
            onChange={(v) => setParam('seriesId', v)}
            placeholder="Any series"
            searchPlaceholder="Search series..."
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Organization</Label>
          <Combobox
            options={companyOptions}
            value={companyFilter}
            onChange={(v) => setParam('companyId', v)}
            placeholder="Any organization"
            searchPlaceholder="Search organizations..."
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={typeFilter} onValueChange={(v) => setParam('type', v === 'all' ? '' : v)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {CONVERSATION_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tag</Label>
          <Combobox
            options={tagOptions}
            value={tagFilter}
            onChange={(v) => setParam('tagId', v)}
            placeholder="Any tag"
            searchPlaceholder="Search tags..."
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Date range</Label>
          <div className="flex items-center gap-2">
            <Input type="date" value={fromFilter} onChange={(e) => setParam('from', e.target.value)} />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" value={toFilter} onChange={(e) => setParam('to', e.target.value)} />
          </div>
        </div>
        {hasFilters && (
          <div className="flex items-end">
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="mr-1 h-3 w-3" />
              Clear filters
            </Button>
          </div>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : meetings.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {hasFilters ? 'No meetings match these filters.' : 'No meetings logged yet.'}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {total} meeting{total === 1 ? '' : 's'}
          </p>
          <div className="space-y-3">
            {meetings.map((conv) => (
              <MeetingCard
                key={conv.id}
                conv={conv}
                qTerm={qTerm}
                upcoming={isUpcomingMeeting(conv, todayStr, nowHHMM)}
                onEdit={() => quickLog.openEdit(conv.id)}
                onDelete={() => setDeleteId(conv.id)}
                onSeriesClick={(id) => setParam('seriesId', id.toString())}
                onTagClick={(id) => setParam('tagId', id.toString())}
                onUpdate={loadMeetings}
              />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading...' : `Show more (${meetings.length} of ${total})`}
              </Button>
            </div>
          )}
        </>
      )}
      </>
      )}

      {/* Delete confirmation */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this meeting?</DialogTitle>
            <DialogDescription>
              This permanently removes the meeting record, its prep notes, attachments,
              and participant takeaways. Linked actions are kept (unlinked).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename series */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename series</DialogTitle>
            <DialogDescription>
              The new name applies to every meeting in this series.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="rename-series" className="text-xs">Series name</Label>
            <Input
              id="rename-series"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSeries() }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button onClick={handleRenameSeries} disabled={renaming || !renameValue.trim()}>
              {renaming ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete series */}
      <Dialog open={deleteSeriesOpen} onOpenChange={setDeleteSeriesOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this series?</DialogTitle>
            <DialogDescription>
              The {total} meeting{total === 1 ? '' : 's'} in this series {total === 1 ? 'is' : 'are'} kept —
              they just leave the series. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteSeriesOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteSeries} disabled={deletingSeries}>
              {deletingSeries ? 'Deleting...' : 'Delete series'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage series (rename / delete any series) */}
      <ManageSeriesDialog
        open={manageSeriesOpen}
        onOpenChange={setManageSeriesOpen}
        onChanged={(deletedId) => {
          // If the series currently being viewed was deleted, drop the filter so the
          // list doesn't sit empty on a now-missing series.
          if (deletedId != null && String(deletedId) === seriesFilter) setParam('seriesId', '')
          loadSeries()
          loadMeetings()
        }}
      />

      {/* Import meetings from the published Outlook ICS calendar */}
      <ImportOutlookDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  )
}
