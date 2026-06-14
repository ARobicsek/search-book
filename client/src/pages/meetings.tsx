import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Conversation, DatePrecision, Tag } from '@/lib/types'
import { CONVERSATION_TYPE_OPTIONS } from '@/lib/types'
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
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TitleAutocomplete } from '@/components/title-autocomplete'
import { HighlightedText } from '@/components/highlighted-text'
import { useQuickLog } from '@/components/quick-log-dialog'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import {
  Building2, FileText, Loader2, MessageSquarePlus, Paperclip, Pencil,
  Tag as TagIcon, Trash2, X,
} from 'lucide-react'

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

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

const PAGE_SIZE = 20

export function MeetingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const quickLog = useQuickLog()

  // URL is the source of truth for filters, so series links
  // (/meetings?title=…) and search deep links (?id=…) work everywhere.
  const titleFilter = searchParams.get('title') || ''
  const companyFilter = searchParams.get('companyId') || ''
  const tagFilter = searchParams.get('tagId') || ''
  const typeFilter = searchParams.get('type') || 'all'
  const fromFilter = searchParams.get('from') || ''
  const toFilter = searchParams.get('to') || ''
  const qFilter = searchParams.get('q') || ''
  const idFilter = searchParams.get('id') || ''

  const [meetings, setMeetings] = useState<Conversation[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Free-text input is debounced before it hits the URL/server
  const [qInput, setQInput] = useState(qFilter)
  const debouncedQ = useDebounce(qInput, 300)

  // Lookup data for the filter row
  const [knownTitles, setKnownTitles] = useState<string[]>([])
  const [companyOptions, setCompanyOptions] = useState<ComboboxOption[]>([])
  const [tagOptions, setTagOptions] = useState<ComboboxOption[]>([])

  useEffect(() => {
    api.get<string[]>('/conversations/titles').then(setKnownTitles).catch(() => { })
    api.get<{ id: number; name: string }[]>('/companies/names')
      .then((data) => setCompanyOptions(data.map((c) => ({ value: c.id.toString(), label: c.name }))))
      .catch(() => { })
    api.get<Tag[]>('/tags')
      .then((data) => setTagOptions(data.map((t) => ({ value: t.id.toString(), label: t.name }))))
      .catch(() => { })
  }, [])

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
    if (titleFilter) params.set('title', titleFilter)
    if (companyFilter) params.set('companyId', companyFilter)
    if (tagFilter) params.set('tagId', tagFilter)
    if (typeFilter && typeFilter !== 'all') params.set('type', typeFilter)
    if (fromFilter) params.set('from', fromFilter)
    if (toFilter) params.set('to', toFilter)
    if (qFilter) params.set('q', qFilter)
    if (idFilter) params.set('id', idFilter)
    params.set('limit', PAGE_SIZE.toString())
    params.set('offset', offset.toString())
    return params.toString()
  }, [titleFilter, companyFilter, tagFilter, typeFilter, fromFilter, toFilter, qFilter, idFilter])

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

  // Refresh when the Quick Log dialog saves a meeting
  useEffect(() => {
    const onLogged = () => loadMeetings()
    window.addEventListener('searchbook:meeting-logged', onLogged)
    return () => window.removeEventListener('searchbook:meeting-logged', onLogged)
  }, [loadMeetings])

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

  const hasFilters = !!(titleFilter || companyFilter || tagFilter || (typeFilter && typeFilter !== 'all') || fromFilter || toFilter || qFilter || idFilter)

  function clearFilters() {
    setQInput('')
    setSearchParams({}, { replace: true })
  }

  // When the free-text filter is active, wrap matches in <mark> in the
  // plain-text fields (markdown notes are left un-highlighted). The server
  // trims `q` to a single case-insensitive term, so we mirror that here.
  const qTerm = qFilter.trim()
  const hl = (text: string) =>
    qTerm ? <HighlightedText text={text} terms={[qTerm]} caseSensitive={false} /> : text

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {titleFilter ? titleFilter : 'Meetings'}
          </h1>
          {titleFilter && (
            <p className="text-sm text-muted-foreground">
              All meetings in this series, newest first
            </p>
          )}
        </div>
        <Button onClick={() => quickLog.open()}>
          <MessageSquarePlus className="mr-1 h-4 w-4" />
          Log Meeting
        </Button>
      </div>

      {/* Filters */}
      <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Title (series)</Label>
          <TitleAutocomplete
            value={titleFilter}
            onChange={(v) => setParam('title', v)}
            titles={knownTitles}
            placeholder="Filter by meeting title..."
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
          <Label className="text-xs">Date range</Label>
          <div className="flex items-center gap-2">
            <Input type="date" value={fromFilter} onChange={(e) => setParam('from', e.target.value)} />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" value={toFilter} onChange={(e) => setParam('to', e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Search text</Label>
          <div className="relative">
            <Input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search notes, names..."
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
              <Card key={conv.id}>
                <CardContent className="p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-xs ${conversationTypeColors[conv.type]}`}>
                        {getLabel(conv.type, CONVERSATION_TYPE_OPTIONS)}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {formatConversationDate(conv.date, conv.datePrecision as DatePrecision)}
                      </span>
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title="Edit meeting"
                          onClick={() => quickLog.openEdit(conv.id)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title="Delete meeting"
                          onClick={() => setDeleteId(conv.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {/* Display name: title (→ series view) → contact → company → first participant → description */}
                    {conv.title ? (
                      <button
                        type="button"
                        className="text-left text-sm font-semibold text-primary hover:underline"
                        onClick={() => setParam('title', conv.title!)}
                      >
                        {hl(conv.title)}
                      </button>
                    ) : conv.contact ? (
                      <Link to={`/contacts/${conv.contact.id}`} className="block text-sm font-semibold hover:underline">
                        {hl(conv.contact.name)}
                      </Link>
                    ) : conv.company ? (
                      <Link to={`/companies/${conv.company.id}`} className="block text-sm font-semibold hover:underline">
                        {hl(conv.company.name)}
                      </Link>
                    ) : conv.participants && conv.participants.length > 0 ? (
                      <Link to={`/contacts/${conv.participants[0].contact.id}`} className="block text-sm font-semibold hover:underline">
                        {hl(conv.participants[0].contact.name)}
                      </Link>
                    ) : (
                      <p className="text-sm font-semibold">{conv.attendeesDescription ? hl(conv.attendeesDescription) : 'Meeting'}</p>
                    )}
                    {conv.summary && <p className="text-sm font-medium">{hl(conv.summary)}</p>}
                    {conv.attendeesDescription && conv.title && (
                      <p className="text-xs italic text-muted-foreground">{hl(conv.attendeesDescription)}</p>
                    )}
                    {conv.prepNotes && conv.prepNotes.length > 0 && (
                      <div className="rounded-md bg-amber-50/60 p-2">
                        <p className="mb-1 flex items-center gap-1 text-xs font-medium text-amber-900">
                          <FileText className="h-3 w-3" /> Prep notes
                        </p>
                        {conv.prepNotes.map((note) => (
                          <div key={note.id} className="prep-note-markdown text-sm text-muted-foreground">
                            <ReactMarkdown>{note.content}</ReactMarkdown>
                          </div>
                        ))}
                      </div>
                    )}
                    {conv.notes && (
                      <div className="prep-note-markdown text-sm text-muted-foreground">
                        <ReactMarkdown>{conv.notes}</ReactMarkdown>
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
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Next:</span> {hl(conv.nextSteps)}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {conv.contact && conv.title && (
                        <Link to={`/contacts/${conv.contact.id}`}>
                          <Badge variant="outline" className="text-xs hover:bg-muted">
                            {hl(conv.contact.name)}
                          </Badge>
                        </Link>
                      )}
                      {conv.company && (
                        <Link to={`/companies/${conv.company.id}`}>
                          <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100">
                            <Building2 className="mr-1 h-3 w-3" />
                            {hl(conv.company.name)}
                          </Badge>
                        </Link>
                      )}
                      {conv.orgs?.map((o) => (
                        <Link key={o.company.id} to={`/companies/${o.company.id}`}>
                          <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100">
                            <Building2 className="mr-1 h-3 w-3" />
                            {hl(o.company.name)}
                          </Badge>
                        </Link>
                      ))}
                      {conv.participants?.map((p) => (
                        <Link key={p.contact.id} to={`/contacts/${p.contact.id}`}>
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100" title={p.note || undefined}>
                            {hl(p.contact.name)}
                          </Badge>
                        </Link>
                      ))}
                      {conv.tags?.map((t) => (
                        <button key={t.tag.id} type="button" onClick={() => setParam('tagId', t.tag.id.toString())}>
                          <Badge variant="outline" className="text-xs bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100">
                            <TagIcon className="mr-1 h-3 w-3" />
                            {hl(t.tag.name)}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
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
    </div>
  )
}
