import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Conversation, DatePrecision } from '@/lib/types'
import { conversationDisplayName, CONVERSATION_TYPE_OPTIONS } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { HighlightedText } from '@/components/highlighted-text'
import { MentionableMarkdown } from '@/components/mentionable-markdown'
import { useQuickLog } from '@/components/quick-log-dialog'
import {
  Loader2,
  FileText,
  Building2,
  Paperclip,
  Tag as TagIcon,
  Pencil,
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

/**
 * An expanded, read-only view of a meeting shown when a meeting search result is
 * clicked. Fetches the full record (`/conversations/:id`) — the search response
 * only carries snippets — and renders its notes, prep notes, next steps and
 * related people/orgs with the search `terms` highlighted throughout.
 */
export function MeetingDetailDialog({
  conversationId,
  terms,
  caseSensitive,
  onOpenChange,
}: {
  conversationId: number | null
  terms: string[]
  caseSensitive: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [conv, setConv] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const quickLog = useQuickLog()

  useEffect(() => {
    if (conversationId == null) return
    let cancelled = false
    setConv(null)
    setError(null)
    setLoading(true)
    api
      .get<Conversation>(`/conversations/${conversationId}`)
      .then((data) => {
        if (!cancelled) setConv(data)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this meeting.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [conversationId])

  const hl = (text: string) => (
    <HighlightedText text={text} terms={terms} caseSensitive={caseSensitive} />
  )

  return (
    <Dialog open={conversationId != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-8 text-left">
            {conv ? hl(conversationDisplayName(conv)) : 'Meeting'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Full meeting details with your search terms highlighted.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading meeting…
          </div>
        )}

        {error && !loading && (
          <p className="py-6 text-sm text-destructive">{error}</p>
        )}

        {conv && !loading && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline" className={`text-xs ${conversationTypeColors[conv.type] ?? ''}`}>
                {getLabel(conv.type, CONVERSATION_TYPE_OPTIONS)}
              </Badge>
              <span>{formatConversationDate(conv.date, conv.datePrecision)}</span>
              {conv.series && (
                <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs text-violet-800">
                  {hl(conv.series.name)}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  // Close this read-only view and open the canonical meeting editor
                  // for THIS meeting (Quick Log dialog, available app-wide).
                  onOpenChange(false)
                  quickLog.openEdit(conv.id)
                }}
                className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
                title="Edit this meeting"
              >
                <Pencil className="h-3 w-3" /> Edit meeting
              </button>
            </div>

            {conv.summary && <p className="text-sm font-medium">{hl(conv.summary)}</p>}

            {conv.attendeesDescription && (
              <p className="text-xs italic text-muted-foreground">
                {hl(conv.attendeesDescription)}
              </p>
            )}

            {conv.prepNotes && conv.prepNotes.length > 0 && (
              <div className="rounded-md bg-amber-50/60 p-3">
                <p className="mb-1 flex items-center gap-1 text-xs font-medium text-amber-900">
                  <FileText className="h-3 w-3" /> Prep notes
                </p>
                {conv.prepNotes.map((note) => (
                  <div key={note.id} className="prep-note-markdown text-sm text-muted-foreground">
                    <MentionableMarkdown highlightTerms={terms} caseSensitive={caseSensitive}>
                      {note.content}
                    </MentionableMarkdown>
                  </div>
                ))}
              </div>
            )}

            {conv.notes && (
              <div>
                <p className="mb-1 text-xs font-medium text-foreground/70">Notes</p>
                <div className="prep-note-markdown text-sm text-muted-foreground">
                  <MentionableMarkdown highlightTerms={terms} caseSensitive={caseSensitive}>
                    {conv.notes}
                  </MentionableMarkdown>
                </div>
              </div>
            )}

            {conv.nextSteps && (
              <div>
                <p className="mb-1 text-xs font-medium text-foreground/70">Next steps</p>
                <div className="prep-note-markdown text-sm text-muted-foreground">
                  <MentionableMarkdown highlightTerms={terms} caseSensitive={caseSensitive}>
                    {conv.nextSteps}
                  </MentionableMarkdown>
                </div>
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

            {(conv.contact ||
              conv.company ||
              (conv.orgs && conv.orgs.length > 0) ||
              (conv.participants && conv.participants.length > 0) ||
              (conv.tags && conv.tags.length > 0)) && (
              <div className="flex flex-wrap gap-1 border-t pt-3">
                {conv.contact && (
                  <Link to={`/contacts/${conv.contact.id}`}>
                    <Badge variant="outline" className="text-xs hover:bg-muted">
                      {conv.contact.name}
                    </Badge>
                  </Link>
                )}
                {conv.company && (
                  <Link to={`/companies/${conv.company.id}`}>
                    <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-xs text-indigo-800 hover:bg-indigo-100">
                      <Building2 className="mr-1 h-3 w-3" />
                      {conv.company.name}
                    </Badge>
                  </Link>
                )}
                {conv.orgs?.map((o) => (
                  <Link key={o.company.id} to={`/companies/${o.company.id}`}>
                    <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-xs text-indigo-800 hover:bg-indigo-100">
                      <Building2 className="mr-1 h-3 w-3" />
                      {o.company.name}
                    </Badge>
                  </Link>
                ))}
                {conv.participants?.map((p) => (
                  <Link key={p.contact.id} to={`/contacts/${p.contact.id}`}>
                    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-xs text-blue-800 hover:bg-blue-100">
                      {hl(p.contact.name)}
                    </Badge>
                  </Link>
                ))}
                {conv.tags?.map((t) => (
                  <Badge key={t.tag.id} variant="outline" className="border-violet-200 bg-violet-50 text-xs text-violet-800">
                    <TagIcon className="mr-1 h-3 w-3" />
                    {t.tag.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
