import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import type { DatePrecision, MentionMeeting } from '@/lib/types'
import { CONVERSATION_TYPE_OPTIONS, conversationDisplayName } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MentionableMarkdown } from '@/components/mentionable-markdown'
import { MentionChip } from '@/components/mention-chip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { meetingMentionSnippets } from '@/lib/mentions'
import { toast } from 'sonner'
import { AtSign, Building2, ChevronDown, Link2, Loader2, Pencil, User, UserPlus, X } from 'lucide-react'

const PAGE_SIZE = 25

type NamedContact = { id: number; name: string; title?: string | null }
type NamedCompany = { id: number; name: string }

// Candidates for "Link to existing": every whitespace-separated token of the query
// must appear somewhere in the name. Deliberately looser than a substring match, so
// the near-miss this picker exists for actually surfaces — "Peterson Health" finds
// "Peterson Center on Healthcare" ("health" ⊂ "healthcare"), which a plain
// `includes` would miss entirely.
function tokenMatches<T extends { name: string }>(items: T[], query: string, limit: number): T[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []
  return items.filter((it) => {
    const name = it.name.toLowerCase()
    return tokens.every((t) => name.includes(t))
  }).slice(0, limit)
}

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

// Picker for "Link to existing" — bind a loose mention to a record that's already in
// the CRM, creating nothing. Rendered inline in the card rather than in a popover, so
// it never fights the dropdown it was opened from over focus.
function LinkExistingPicker({
  mentionedName,
  contacts,
  companies,
  onPick,
  onCancel,
}: {
  mentionedName: string
  contacts: NamedContact[]
  companies: NamedCompany[]
  onPick: (target: { contactId: number } | { companyId: number }) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState(mentionedName)
  const matchedContacts = tokenMatches(contacts, query, 5)
  const matchedCompanies = tokenMatches(companies, query, 5)
  const nothing = matchedContacts.length === 0 && matchedCompanies.length === 0

  return (
    <div className="mt-1 w-full max-w-md rounded-md border border-input bg-background p-2 shadow-sm">
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel()
          }}
          placeholder="Search contacts and organizations…"
          className="h-8 text-sm"
        />
        <Button variant="ghost" size="sm" className="h-8 px-1.5" onClick={onCancel} title="Cancel">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="mt-1.5 max-h-56 overflow-y-auto">
        {nothing ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            {query.trim() ? 'No matching contact or organization.' : 'Type to search.'}
          </p>
        ) : (
          <>
            {matchedContacts.map((c) => (
              <button
                key={`c${c.id}`}
                type="button"
                onClick={() => onPick({ contactId: c.id })}
                className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-blue-100 dark:hover:bg-blue-500/30"
              >
                <User className="h-3.5 w-3.5 shrink-0 text-blue-700" />
                <span className="truncate">{c.name}</span>
                {c.title && <span className="truncate text-xs text-muted-foreground">{c.title}</span>}
              </button>
            ))}
            {matchedCompanies.map((c) => (
              <button
                key={`o${c.id}`}
                type="button"
                onClick={() => onPick({ companyId: c.id })}
                className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-violet-100 dark:hover:bg-violet-500/30"
              >
                <Building2 className="h-3.5 w-3.5 shrink-0 text-violet-700" />
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// One meeting card in the Mentions list: who was @-mentioned (resolved contacts
// link out; loose names get a one-click "Create contact"), plus the note context.
function MentionMeetingCard({
  meeting,
  contacts,
  companies,
  onChanged,
}: {
  meeting: MentionMeeting
  contacts: NamedContact[]
  companies: NamedCompany[]
  onChanged: () => void
}) {
  // Mentions the owner has chosen to resolve. Hidden optimistically the instant a
  // "Create" is picked — the control shouldn't linger while the server round-trip
  // and list reload complete. Restored only if the create actually fails.
  const [resolvingIds, setResolvingIds] = useState<Set<number>>(new Set())
  // The one mention whose "Link to existing" picker is open, if any.
  const [linkingId, setLinkingId] = useState<number | null>(null)

  // The note context shown is the text *surrounding* the @-mentions (notes, next
  // steps, or prep notes), not the whole note.
  const snippets = meetingMentionSnippets(meeting)

  function hide(mentionId: number) {
    setResolvingIds((prev) => new Set(prev).add(mentionId))
  }
  function unhide(mentionId: number) {
    setResolvingIds((prev) => {
      const next = new Set(prev)
      next.delete(mentionId)
      return next
    })
  }

  // The server find-or-creates, so `linked` tells us which actually happened —
  // worth surfacing, since "Linked to existing" is the outcome that means a
  // duplicate was just avoided.
  async function createContact(mentionId: number) {
    hide(mentionId)
    try {
      const { contact, linked } = await api.post<{ contact: { id: number; name: string }; linked: boolean }>(
        `/mentions/${mentionId}/create-contact`,
        {},
      )
      toast.success(
        linked ? `Linked to existing contact “${contact.name}”` : `Created contact “${contact.name}”`,
      )
      onChanged()
    } catch (err) {
      unhide(mentionId)
      toast.error(err instanceof Error ? err.message : 'Failed to create contact')
    }
  }

  async function createCompany(mentionId: number) {
    hide(mentionId)
    try {
      const { company, linked } = await api.post<{ company: { id: number; name: string }; linked: boolean }>(
        `/mentions/${mentionId}/create-company`,
        {},
      )
      toast.success(
        linked
          ? `Linked to existing organization “${company.name}”`
          : `Created organization “${company.name}”`,
      )
      onChanged()
    } catch (err) {
      unhide(mentionId)
      toast.error(err instanceof Error ? err.message : 'Failed to create organization')
    }
  }

  async function linkMention(mentionId: number, target: { contactId: number } | { companyId: number }) {
    setLinkingId(null)
    hide(mentionId)
    try {
      const res = await api.post<{ contact?: { name: string }; company?: { name: string } }>(
        `/mentions/${mentionId}/link`,
        target,
      )
      toast.success(`Linked to “${res.contact?.name ?? res.company?.name}”`)
      onChanged()
    } catch (err) {
      unhide(mentionId)
      toast.error(err instanceof Error ? err.message : 'Failed to link mention')
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

        {/* Who / what was mentioned. Loose mentions (not in the CRM yet) get the
            one-click "Create" that is this page's reason for existing. The primary
            click follows the mention's kind (person vs org), but the caret always
            offers the other type — so a name first mis-tagged as an organization can
            be turned into a contact (and vice versa) without editing the note — plus
            "Link to existing", for when the record is already in the CRM under a
            different spelling and "Create" would only make a duplicate. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
          {meeting.mentions.map((m) => (
            <span key={m.id} className="inline-flex items-center gap-1">
              <MentionChip mention={m} />
              {!m.contact && !m.company && !resolvingIds.has(m.id) && (
                <div className="inline-flex items-center rounded-md border border-input">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 rounded-r-none px-1.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => (m.kind === 'COMPANY' ? createCompany(m.id) : createContact(m.id))}
                    title={
                      m.kind === 'COMPANY'
                        ? `Create an organization for ${m.mentionedName}`
                        : `Create a contact for ${m.mentionedName}`
                    }
                  >
                    {m.kind === 'COMPANY' ? (
                      <Building2 className="h-3 w-3" />
                    ) : (
                      <UserPlus className="h-3 w-3" />
                    )}
                    <span className="ml-1">Create</span>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 rounded-l-none border-l border-input px-0.5 text-muted-foreground hover:text-foreground"
                        title="Create as contact or organization, or link to an existing record"
                        aria-label={`Resolve ${m.mentionedName}`}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => createContact(m.id)}>
                        <UserPlus className="mr-2 h-3.5 w-3.5" />
                        Create as contact
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => createCompany(m.id)}>
                        <Building2 className="mr-2 h-3.5 w-3.5" />
                        Create as organization
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setLinkingId(m.id)}>
                        <Link2 className="mr-2 h-3.5 w-3.5" />
                        Link to existing…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </span>
          ))}
        </div>

        {/* Only one picker is open at a time, so it lives below the chip row rather
            than inside a chip — no reflow of the wrapped badges when it opens. */}
        {linkingId != null && (() => {
          const m = meeting.mentions.find((x) => x.id === linkingId)
          if (!m) return null
          return (
            <LinkExistingPicker
              mentionedName={m.mentionedName}
              contacts={contacts}
              companies={companies}
              onPick={(target) => linkMention(m.id, target)}
              onCancel={() => setLinkingId(null)}
            />
          )
        })()}

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
  // Name lists for the "Link to existing" picker. Fetched once, alongside the list —
  // a failure here only disables linking, so it stays silent rather than toasting.
  const [contacts, setContacts] = useState<NamedContact[]>([])
  const [companies, setCompanies] = useState<NamedCompany[]>([])

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

  useEffect(() => {
    api.get<NamedContact[]>('/contacts/names').then(setContacts).catch(() => {})
    api.get<NamedCompany[]>('/companies/names').then(setCompanies).catch(() => {})
  }, [])

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <AtSign className="h-6 w-6" /> Mentions
        </h1>
        <p className="text-sm text-muted-foreground">
          People and organizations you @-mentioned in meeting notes. Loose names (not in the CRM yet) can be
          created — or linked to an existing record — with one click.
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
              <MentionMeetingCard
                key={m.id}
                meeting={m}
                contacts={contacts}
                companies={companies}
                onChanged={() => load(0)}
              />
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
