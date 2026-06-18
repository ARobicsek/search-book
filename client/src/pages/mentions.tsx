import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import type { DatePrecision, MentionMeeting } from '@/lib/types'
import { CONVERSATION_TYPE_OPTIONS, conversationDisplayName } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MentionableMarkdown } from '@/components/mentionable-markdown'
import { mentionSnippet } from '@/lib/mentions'
import { toast } from 'sonner'
import { AtSign, Loader2, Pencil, UserPlus } from 'lucide-react'

const PAGE_SIZE = 25

function formatMeetingDate(dateStr: string, precision: DatePrecision) {
  const d = new Date(dateStr + 'T00:00:00')
  switch (precision) {
    case 'MONTH':
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    case 'QUARTER':
      return `Q${Math.ceil((d.getMonth() + 1) / 3)} ${d.getFullYear()}`
    case 'YEAR':
      return d.getFullYear().toString()
    default:
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
}

function typeLabel(value: string) {
  return CONVERSATION_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value
}

// One meeting card in the Mentions list: who was @-mentioned (resolved contacts
// link out; loose names get a one-click "Create contact"), plus the note context.
function MentionMeetingCard({ meeting, onChanged }: { meeting: MentionMeeting; onChanged: () => void }) {
  const [creatingId, setCreatingId] = useState<number | null>(null)

  // The note context shown is the text *surrounding* each @-mention (notes or
  // next steps), not the whole note — deduped when two mentions share a window.
  const snippets = (() => {
    const out: string[] = []
    const seen = new Set<string>()
    for (const m of meeting.mentions) {
      const matcher = m.contactId != null ? { contactId: m.contactId } : { name: m.mentionedName }
      const snippet = mentionSnippet(meeting.notes, matcher) ?? mentionSnippet(meeting.nextSteps, matcher)
      if (snippet && !seen.has(snippet)) {
        seen.add(snippet)
        out.push(snippet)
      }
    }
    return out
  })()

  async function createContact(mentionId: number) {
    setCreatingId(mentionId)
    try {
      const { contact } = await api.post<{ contact: { id: number; name: string } }>(
        `/mentions/${mentionId}/create-contact`,
        {},
      )
      toast.success(`Created contact “${contact.name}”`)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create contact')
    } finally {
      setCreatingId(null)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-xs">{typeLabel(meeting.type)}</Badge>
          <span className="text-sm text-muted-foreground">
            {formatMeetingDate(meeting.date, meeting.datePrecision)}
          </span>
          <Link
            to={`/meetings?id=${meeting.id}`}
            className="text-sm font-semibold text-primary hover:underline"
          >
            {conversationDisplayName(meeting)}
          </Link>
          <Link
            to={`/meetings?id=${meeting.id}`}
            className="ml-auto text-muted-foreground hover:text-foreground"
            title="Open in Meetings"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Who was mentioned */}
        <div className="flex flex-wrap items-center gap-1.5">
          <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
          {meeting.mentions.map((m) =>
            m.contact ? (
              <Link key={m.id} to={`/contacts/${m.contact.id}`}>
                <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100 text-xs">
                  {m.contact.name}
                </Badge>
              </Link>
            ) : (
              <span key={m.id} className="inline-flex items-center gap-1">
                <Badge
                  variant="outline"
                  className="border-dashed border-amber-300 bg-amber-50 text-amber-800 text-xs"
                  title="Not a contact yet"
                >
                  {m.mentionedName}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                  disabled={creatingId === m.id}
                  onClick={() => createContact(m.id)}
                  title={`Create a contact for ${m.mentionedName}`}
                >
                  {creatingId === m.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <UserPlus className="h-3 w-3" />
                  )}
                  <span className="ml-1">Create</span>
                </Button>
              </span>
            ),
          )}
        </div>

        {/* Note context — the text surrounding each @-mention */}
        {snippets.map((snippet, i) => (
          <div key={i} className="prep-note-markdown line-clamp-6 border-l-2 border-muted pl-3 text-sm text-muted-foreground">
            <MentionableMarkdown>{snippet}</MentionableMarkdown>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function MentionsPage() {
  const [meetings, setMeetings] = useState<MentionMeeting[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  const load = useCallback(async (offset: number) => {
    setLoading(true)
    try {
      const res = await api.get<{ data: MentionMeeting[]; pagination: { total: number; hasMore: boolean } }>(
        `/mentions?limit=${PAGE_SIZE}&offset=${offset}`,
      )
      setMeetings((prev) => (offset === 0 ? res.data : [...prev, ...res.data]))
      setTotal(res.pagination.total)
      setHasMore(res.pagination.hasMore)
    } catch {
      toast.error('Failed to load mentions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(0)
  }, [load])

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <AtSign className="h-6 w-6" /> Mentions
        </h1>
        <p className="text-sm text-muted-foreground">
          People you @-mentioned in meeting notes. Loose names (not yet contacts) can be created with one click.
        </p>
      </div>

      {loading && meetings.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : meetings.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No mentions yet. While taking meeting notes, type <span className="font-mono">@</span> to flag someone the
            other person brings up — they’ll show up here.
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{total} meeting{total === 1 ? '' : 's'} with mentions</p>
          <div className="space-y-3">
            {meetings.map((m) => (
              <MentionMeetingCard key={m.id} meeting={m} onChanged={() => load(0)} />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => load(meetings.length)} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
