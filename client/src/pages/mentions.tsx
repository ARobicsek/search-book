import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import type { ConversationMention, DatePrecision, MentionMeeting, NoteMentionSource } from '@/lib/types'
import { CONVERSATION_TYPE_OPTIONS, contactDisplayName, conversationDisplayName } from '@/lib/types'
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
import { meetingMentionSnippets, mentionFeed, noteMentionSnippets } from '@/lib/mentions'
import { easternNowParts, easternPartsOfTimestamp, isHappeningNow } from '@/lib/meeting-time'
import { useClockTick } from '@/hooks/use-clock-tick'
import { formatStartTime } from '@/lib/utils'
import { toast } from 'sonner'
import { AtSign, Building2, ChevronDown, Lightbulb, Link2, Loader2, Pencil, User, UserPlus, X } from 'lucide-react'

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

// When a contact note / idea was last logged, rendered like a meeting's date so the
// mixed feed's ordering is legible on the cards. Eastern, for the same reason the feed
// sorts in Eastern: it's the clock the meetings beside it are dated in.
function formatLoggedAt(updatedAt: string | null): string {
  const when = easternPartsOfTimestamp(updatedAt)
  if (!when) return ''
  return `${formatMeetingDate(when.date, 'DAY')} · ${formatStartTime(when.hhmm)}`
}

function typeLabel(value: string) {
  return CONVERSATION_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value
}

// What the one merged list is counting. `total` is every meeting with mentions (the
// server's count, not just the loaded page); note sources are never paginated, so their
// number is exact.
function countLabel(total: number, notes: number): string {
  const parts: string[] = []
  if (total > 0) parts.push(`${total} meeting${total === 1 ? '' : 's'}`)
  if (notes > 0) {
    parts.push(`${notes} contact note${notes === 1 ? '' : 's'} / idea${notes === 1 ? '' : 's'}`)
  }
  return `${parts.join(' and ')} with mentions, newest first`
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

// The chip row shared by every card on this page: one MentionChip per mention, with the
// one-click Create / Link controls beside each LOOSE one. `basePath` is what makes it
// reusable across the two mention indexes — '/mentions' for a meeting's mentions,
// '/mentions/note' for a contact-note's or idea's, whose routes mirror them exactly.
function MentionResolveRow({
  mentions,
  basePath,
  contacts,
  companies,
  onChanged,
}: {
  mentions: ConversationMention[]
  basePath: '/mentions' | '/mentions/note'
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
        `${basePath}/${mentionId}/create-contact`,
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
        `${basePath}/${mentionId}/create-company`,
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
        `${basePath}/${mentionId}/link`,
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
    <>
      {/* Who / what was mentioned. Loose mentions (not in the CRM yet) get the
          one-click "Create" that is this page's reason for existing. The primary
          click follows the mention's kind (person vs org), but the caret always
          offers the other type — so a name first mis-tagged as an organization can
          be turned into a contact (and vice versa) without editing the note — plus
          "Link to existing", for when the record is already in the CRM under a
          different spelling and "Create" would only make a duplicate. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
        {mentions.map((m) => (
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
        const m = mentions.find((x) => x.id === linkingId)
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
    </>
  )
}

// The note context around the @-mentions — the text they were written in, not the whole
// note. A mention only means something with its sentence.
function MentionSnippets({ snippets }: { snippets: string[] }) {
  return (
    <>
      {snippets.map((snippet, i) => (
        <div key={i} className="prep-note-markdown line-clamp-6 border-l-2 border-muted pl-3 text-sm text-muted-foreground">
          <MentionableMarkdown>{snippet}</MentionableMarkdown>
        </div>
      ))}
    </>
  )
}

// One meeting card: which meeting, who was @-mentioned in it, and the note context.
// A meeting in progress gets the meetings list's green left border and pulsing "Now"
// marker — identical rule (lib/meeting-time), so the two pages can never disagree.
function MentionMeetingCard({
  meeting,
  happeningNow,
  contacts,
  companies,
  onChanged,
}: {
  meeting: MentionMeeting
  happeningNow: boolean
  contacts: NamedContact[]
  companies: NamedCompany[]
  onChanged: () => void
}) {
  return (
    <Card className={happeningNow ? 'border-l-4 border-l-emerald-500' : undefined}>
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-xs">{typeLabel(meeting.type)}</Badge>
          <span className="text-sm text-muted-foreground">
            {formatMeetingDate(meeting.date, meeting.datePrecision)}
            {meeting.startTime && ` · ${formatStartTime(meeting.startTime)}`}
          </span>
          {happeningNow && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
              title={
                meeting.endTime
                  ? 'This meeting is happening now'
                  : 'Started recently — no end time recorded, so an hour is assumed'
              }
            >
              {/* A live marker should look live: the dot pulses. */}
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              Now
            </span>
          )}
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

        <MentionResolveRow
          mentions={meeting.mentions}
          basePath="/mentions"
          contacts={contacts}
          companies={companies}
          onChanged={onChanged}
        />

        <MentionSnippets snippets={meetingMentionSnippets(meeting)} />
      </CardContent>
    </Card>
  )
}

// One contact-notes / idea card. Same body as a meeting card — the resolve controls and
// the note context are shared — differing only in the header that says WHERE the
// mention was written and where "open" goes.
function NoteMentionCard({
  source,
  contacts,
  companies,
  onChanged,
}: {
  source: NoteMentionSource
  contacts: NamedContact[]
  companies: NamedCompany[]
  onChanged: () => void
}) {
  const isContact = source.sourceType === 'CONTACT'
  // A contact's notes are edited on its form; ideas are edited inline on the Ideas page,
  // which opens the matching card via ?id=.
  const href = isContact ? `/contacts/${source.sourceId}` : `/ideas?id=${source.sourceId}`
  const loggedAt = formatLoggedAt(source.updatedAt)

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {isContact ? (
              <><User className="mr-1 h-3 w-3" />Contact notes</>
            ) : (
              <><Lightbulb className="mr-1 h-3 w-3" />Idea</>
            )}
          </Badge>
          {/* The date this was last written — sitting where a meeting's date sits,
              because it's what places this card in the shared ordering. Omitted, rather
              than left blank, when there's no usable timestamp: an empty span would
              still eat a gap in this flex row. */}
          {loggedAt && (
            <span className="text-sm text-muted-foreground" title="Last updated">
              {loggedAt}
            </span>
          )}
          <Link to={href} className="text-sm font-semibold text-primary hover:underline">
            {isContact ? contactDisplayName({ name: source.label, preferredName: source.preferredName }) : source.label}
          </Link>
          <Link
            to={href}
            className="ml-auto text-muted-foreground hover:text-foreground"
            title={isContact ? 'Open the contact' : 'Open in Ideas'}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Link>
        </div>

        <MentionResolveRow
          mentions={source.mentions}
          basePath="/mentions/note"
          contacts={contacts}
          companies={companies}
          onChanged={onChanged}
        />

        <MentionSnippets snippets={noteMentionSnippets(source)} />
      </CardContent>
    </Card>
  )
}

export function MentionsPage() {
  const [meetings, setMeetings] = useState<MentionMeeting[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  // The other mention index: contact notes and idea descriptions. Fetched separately
  // and NOT paginated — one source record holds one mention-bearing field, so these
  // come in tens where meetings come in hundreds (see GET /mentions/notes).
  const [noteSources, setNoteSources] = useState<NoteMentionSource[]>([])
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

  const loadNotes = useCallback(async () => {
    try {
      const res = await api.get<{ data: NoteMentionSource[] }>('/mentions/notes')
      setNoteSources(res.data)
    } catch {
      toast.error('Failed to load mentions in contact notes and ideas')
    }
  }, [])

  // Any resolution rewrites the token in ONE source, but a loose name is usually
  // written in several places — so both lists reload, or a name just created would
  // still offer "Create" on its other cards.
  const reloadAll = useCallback(() => {
    void load(0)
    void loadNotes()
  }, [load, loadNotes])

  useEffect(() => {
    reloadAll()
  }, [reloadAll])

  useEffect(() => {
    api.get<NamedContact[]>('/contacts/names').then(setContacts).catch(() => {})
    api.get<NamedCompany[]>('/companies/names').then(setCompanies).catch(() => {})
  }, [])

  // One reverse-chronological stream. Every note source is already loaded while meetings
  // arrive a page at a time, so "Load more" adds items that mostly land at the bottom but
  // can interleave with the older notes tail — the list stays correctly ordered at every
  // point, which is the property that matters.
  const feed = useMemo(() => mentionFeed(meetings, noteSources), [meetings, noteSources])

  // "Now" snapshot (Eastern), computed once per render so every card agrees on the same
  // instant; the tick re-renders on a timer so the marker turns itself on and off.
  useClockTick()
  const { date: todayStr, hhmm: nowHHMM } = easternNowParts()

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <AtSign className="h-6 w-6" /> Mentions
        </h1>
        <p className="text-sm text-muted-foreground">
          People and organizations you @-mentioned in meeting notes, contact notes and ideas. Loose names (not in
          the CRM yet) can be created — or linked to an existing record — with one click.
        </p>
      </div>

      {loading && meetings.length === 0 && noteSources.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : meetings.length === 0 && noteSources.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No mentions yet. While writing a meeting note, a contact’s notes or an idea, type{' '}
            <span className="font-mono">@</span> to flag someone who comes up — they’ll show up here.
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{countLabel(total, noteSources.length)}</p>
          <div className="space-y-3">
            {feed.map((item) =>
              item.type === 'MEETING' ? (
                <MentionMeetingCard
                  key={item.key}
                  meeting={item.meeting}
                  happeningNow={isHappeningNow(item.meeting, todayStr, nowHHMM)}
                  contacts={contacts}
                  companies={companies}
                  onChanged={reloadAll}
                />
              ) : (
                <NoteMentionCard
                  key={item.key}
                  source={item.source}
                  contacts={contacts}
                  companies={companies}
                  onChanged={reloadAll}
                />
              ),
            )}
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
