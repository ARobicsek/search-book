import React, { useEffect, useState, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { api } from '@/lib/api'
import type {
  SearchResult,
  SearchMatch,
  SearchScope,
  SearchSort,
  ContactSearchResult,
  CompanySearchResult,
  MentionMeeting,
  MentionIndexEntry,
  Ecosystem,
  ContactStatus,
  CompanyStatus,
  Action,
  Tag,
} from '@/lib/types'
import { contactDisplayName, conversationDisplayName } from '@/lib/types'
import { meetingMentionSnippets, detectMentionQuery } from '@/lib/mentions'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { MultiCombobox } from '@/components/ui/combobox'
import { ActionDateSelect } from '@/components/action-date-select'
import { HighlightedText } from '@/components/highlighted-text'
import { MentionChip } from '@/components/mention-chip'
import { MentionableMarkdown } from '@/components/mentionable-markdown'
import { MeetingDetailDialog } from '@/components/meeting-detail-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search,
  Loader2,
  ChevronDown,
  ChevronUp,
  User,
  Building2,
  ListTodo,
  Lightbulb,
  MessageSquare,
  Users,
  CaseSensitive,
  ArrowRight,
  AtSign,
  X,
  Tag as TagIcon,
} from 'lucide-react'

const ecosystemColors: Record<Ecosystem, string> = {
  PAYER: 'bg-blue-100 text-blue-800',
  PROVIDER: 'bg-green-100 text-green-800',
  GOVERNMENT: 'bg-red-100 text-red-800',
  ACADEMIA: 'bg-rose-100 text-rose-800',
  HEALTH_TECH: 'bg-cyan-100 text-cyan-800',
  POLICY: 'bg-violet-100 text-violet-800',
  MEDIA: 'bg-pink-100 text-pink-800',
  FUNDER: 'bg-emerald-100 text-emerald-800',
  NCQA: 'bg-indigo-100 text-indigo-800',
  NETWORK: 'bg-purple-100 text-purple-800',
  RECRUITER: 'bg-amber-100 text-amber-800',
  CONSULTANT: 'bg-teal-100 text-teal-800',
}

const contactStatusColors: Record<ContactStatus, string> = {
  NONE: 'bg-slate-100 text-slate-400',
  RESEARCHING: 'bg-blue-100 text-blue-700',
  CONNECTED: 'bg-green-100 text-green-700',
  AWAITING_RESPONSE: 'bg-yellow-100 text-yellow-700',
  FOLLOW_UP_NEEDED: 'bg-orange-100 text-orange-700',
}

const companyStatusColors: Record<CompanyStatus, string> = {
  NONE: 'bg-slate-100 text-slate-400',
  RESEARCHING: 'bg-sky-100 text-sky-700',
  ENGAGED: 'bg-violet-100 text-violet-700',
  PARTNER: 'bg-indigo-100 text-indigo-700',
  CONNECTED: 'bg-emerald-100 text-emerald-700',
}

// ─── Scope / sort controls ──────────────────────────────────

const SCOPE_OPTIONS: { value: SearchScope; label: string }[] = [
  { value: 'people-profile', label: 'People — profile' },
  { value: 'people-notes', label: 'People — notes' },
  { value: 'useful', label: 'Useful for' },
  { value: 'orgs', label: 'Organizations' },
  { value: 'meetings', label: 'Meetings' },
  { value: 'mentions', label: '@-Mentions' },
  { value: 'actions', label: 'Actions' },
  { value: 'ideas', label: 'Ideas' },
]
const ALL_SCOPES = SCOPE_OPTIONS.map((s) => s.value)

const SORT_OPTIONS: { value: SearchSort; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'alpha', label: 'A → Z' },
  { value: 'recent-contact', label: 'Recently contacted' },
]

// Last-used scopes/sort/case become the default for next time
const PREFS_KEY = 'searchbook_search_prefs'

interface SearchPrefs {
  sort?: SearchSort
  caseSensitive?: boolean
}

function loadPrefs(): SearchPrefs {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')
  } catch {
    return {}
  }
}

function isScope(v: string): v is SearchScope {
  return (ALL_SCOPES as string[]).includes(v)
}

function isSort(v: string): v is SearchSort {
  return SORT_OPTIONS.some((o) => o.value === v)
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

// ─── Match highlighting ─────────────────────────────────────

/** The "why it matched" rows under each result card. */
function MatchEvidence({
  matches,
  terms,
  caseSensitive,
}: {
  matches?: SearchMatch[]
  terms: string[]
  caseSensitive: boolean
}) {
  if (!matches || matches.length === 0) return null
  return (
    <div className="mt-1.5 space-y-0.5">
      {matches.map((m, i) => {
        // Flag matches from the "Useful For" field so it's unmistakable why the
        // person surfaced: amber + a lightbulb (mirrors the contact-page marker).
        const isUseful = m.field === 'useful for'
        return (
          <p key={i} className={cn('text-xs', isUseful ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
            {isUseful && <Lightbulb className="mr-0.5 inline h-3 w-3 -translate-y-px text-amber-500" />}
            <span className={cn('font-medium', isUseful ? 'text-amber-700 dark:text-amber-400' : 'text-foreground/70')}>{m.field}:</span>{' '}
            <HighlightedText text={m.snippet} terms={terms} caseSensitive={caseSensitive} />
          </p>
        )
      })}
    </div>
  )
}

function ShowAllLink({ to, total, label }: { to: string; total: number; label: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
      Show all {total} {label} <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  )
}

/** A result's tags as clickable chips. Clicking one adds it to the search's tag
 * filter, so any card surfaces "show me everything else tagged this." */
function ResultTags({ tags, onTagClick }: { tags?: { id: number; name: string }[]; onTagClick: (id: number) => void }) {
  if (!tags || tags.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {tags.map((t) => (
        <button key={t.id} type="button" onClick={() => onTagClick(t.id)} title={`Filter by tag "${t.name}"`}>
          <Badge variant="outline" className="text-xs bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100">
            <TagIcon className="mr-1 h-3 w-3" />
            {t.name}
          </Badge>
        </button>
      ))}
    </div>
  )
}

type ContactRelated = NonNullable<ContactSearchResult['related']>
type CompanyRelated = NonNullable<CompanySearchResult['related']>
type RelatedData = ContactRelated | CompanyRelated

function countRelated(related?: ContactSearchResult['related'] | CompanySearchResult['related']): number {
  if (!related) return 0
  let count = 0
  if ('companies' in related) count += related.companies?.length || 0
  if ('contacts' in related) count += related.contacts?.length || 0
  count += related.actions?.length || 0
  count += related.ideas?.length || 0
  count += related.conversations?.length || 0
  return count
}

function totalResults(results: SearchResult): number {
  return (
    results.contacts.length +
    results.companies.length +
    results.actions.length +
    results.ideas.length +
    (results.conversations?.length || 0) +
    (results.mentions?.length || 0)
  )
}

interface EvidenceProps {
  terms: string[]
  caseSensitive: boolean
}

function MeetingSearchCard({ conv, ev, onOpen, onTagClick }: { conv: NonNullable<SearchResult['conversations']>[number]; ev: EvidenceProps; onOpen: (id: number) => void; onTagClick: (id: number) => void }) {
  return (
    <Card
      className="mb-2 cursor-pointer transition-colors hover:border-primary/40"
      onClick={(e) => {
        // Clicking anywhere on the card opens the expanded meeting view — but let
        // inner links/buttons (title, tag chips) do their own thing.
        if ((e.target as HTMLElement).closest('a,button')) return
        onOpen(conv.id)
      }}
    >
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpen(conv.id)}
            className="text-left font-medium hover:underline"
            title="View full meeting"
          >
            <HighlightedText text={conv.displayName} terms={ev.terms} caseSensitive={ev.caseSensitive} />
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          {conv.date}
          {conv.contact && ` | ${conv.contact.name}`}
          {conv.company && ` | ${conv.company.name}`}
          {conv.summary && ` — ${conv.summary}`}
        </p>
        <MatchEvidence matches={conv.matches} terms={ev.terms} caseSensitive={ev.caseSensitive} />
        <ResultTags tags={conv.tags} onTagClick={onTagClick} />
      </CardContent>
    </Card>
  )
}

/** The "@" picker: type "@" in the search box and this drops down the people and
 *  organizations that have actually BEEN @-mentioned, so you pick the exact spelling
 *  instead of guessing it. Sourced from the mention index, so every option has at
 *  least one hit and the count says how many. Loose names — mentioned but never made
 *  a contact — are offered too (dashed), since those are the ones you're least likely
 *  to spell right from memory. */
function MentionPicker({
  options,
  activeIndex,
  onPick,
  onHover,
}: {
  options: MentionIndexEntry[]
  activeIndex: number
  onPick: (entry: MentionIndexEntry) => void
  onHover: (i: number) => void
}) {
  return (
    <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md">
      {options.map((entry, i) => (
        <li key={entry.key}>
          <button
            type="button"
            // onMouseDown (not onClick) so it fires before the input's blur closes the list.
            onMouseDown={(e) => { e.preventDefault(); onPick(entry) }}
            onMouseEnter={() => onHover(i)}
            className={cn(
              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left',
              i === activeIndex ? 'bg-blue-50 text-blue-900' : 'hover:bg-muted'
            )}
          >
            {entry.kind === 'COMPANY' ? (
              <Building2 className="h-3.5 w-3.5 shrink-0 text-violet-500" />
            ) : (
              <User className="h-3.5 w-3.5 shrink-0 text-blue-500" />
            )}
            <span className="truncate font-medium">{entry.name}</span>
            {!entry.bound && (
              <span
                className="shrink-0 rounded border border-dashed border-amber-300 bg-amber-50 px-1 text-[10px] text-amber-700"
                title={entry.kind === 'COMPANY' ? 'Not an organization yet' : 'Not a contact yet'}
              >
                not in CRM
              </span>
            )}
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {entry.count} meeting{entry.count === 1 ? '' : 's'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** One "@-Mentions" hit: a meeting where someone matching the query was @-mentioned
 *  in the notes. Shows who (chips link out to the person/org; a loose name — not in
 *  the CRM yet — is dashed) and, below, the note text they were mentioned in, which
 *  is the whole point: a mention is only useful with the sentence around it.
 *  Only the mentions that MATCHED are chipped, not everyone else the meeting names. */
function MentionSearchCard({
  meeting,
  ev,
  onOpen,
  onTagClick,
}: {
  meeting: MentionMeeting
  ev: EvidenceProps
  onOpen: (id: number) => void
  onTagClick: (id: number) => void
}) {
  const snippets = meetingMentionSnippets(meeting)
  return (
    <Card
      className="mb-2 cursor-pointer transition-colors hover:border-primary/40"
      onClick={(e) => {
        // Clicking the card opens the meeting — but let the inner chips/links (which
        // navigate to the mentioned person or org) do their own thing.
        if ((e.target as HTMLElement).closest('a,button')) return
        onOpen(meeting.id)
      }}
    >
      <CardContent className="space-y-1.5 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpen(meeting.id)}
            className="text-left font-medium hover:underline"
            title="View full meeting"
          >
            <HighlightedText text={conversationDisplayName(meeting)} terms={ev.terms} caseSensitive={ev.caseSensitive} />
          </button>
          <span className="text-sm text-muted-foreground">{meeting.date}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <AtSign className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {meeting.mentions.map((m) => (
            <MentionChip key={m.id} mention={m} />
          ))}
        </div>

        {snippets.map((snippet, i) => (
          <div
            key={i}
            className="prep-note-markdown line-clamp-6 border-l-2 border-muted pl-3 text-sm text-muted-foreground"
          >
            <MentionableMarkdown highlightTerms={ev.terms} caseSensitive={ev.caseSensitive}>
              {snippet}
            </MentionableMarkdown>
          </div>
        ))}

        {/* Only when a picked @-mention was combined with query words: says which part
            of the meeting those words hit. */}
        <MatchEvidence matches={meeting.matches} terms={ev.terms} caseSensitive={ev.caseSensitive} />
        <ResultTags tags={meeting.tags} onTagClick={onTagClick} />
      </CardContent>
    </Card>
  )
}

function ActionSearchCard({
  action,
  ev,
  onUpdate,
}: {
  action: SearchResult['actions'][number]
  ev: EvidenceProps
  onUpdate: () => void
}) {
  return (
    <Card className="mb-2">
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <Link to={`/actions/${action.id}`} className="font-medium hover:underline">
            <HighlightedText text={action.title} terms={ev.terms} caseSensitive={ev.caseSensitive} />
          </Link>
          {action.completed && (
            <Badge variant="secondary" className="text-xs">Completed</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {action.type}
          {action.contact && ` | ${action.contact.name}`}
          {action.company && ` | ${action.company.name}`}
          {action.dueDate && (
            <span className="ml-2 inline-block align-middle" onClick={(e) => e.stopPropagation()}>
              <ActionDateSelect
                action={action as unknown as Action}
                onUpdate={onUpdate}
                className="-ml-2 h-8"
              />
            </span>
          )}
        </p>
        <MatchEvidence matches={action.matches} terms={ev.terms} caseSensitive={ev.caseSensitive} />
      </CardContent>
    </Card>
  )
}

function IdeaSearchCard({ idea, ev, onTagClick }: { idea: SearchResult['ideas'][number]; ev: EvidenceProps; onTagClick: (id: number) => void }) {
  return (
    <Card className="mb-2">
      <CardContent className="p-3">
        <Link to={`/ideas?id=${idea.id}`} className="font-medium hover:underline">
          <HighlightedText text={idea.title} terms={ev.terms} caseSensitive={ev.caseSensitive} />
        </Link>
        {idea.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{idea.description}</p>
        )}
        {(idea.contacts?.length || idea.companies?.length) ? (
          <p className="text-xs text-muted-foreground mt-1">
            {idea.contacts?.map((c) => c.name).join(', ')}
            {idea.contacts?.length && idea.companies?.length ? ' | ' : ''}
            {idea.companies?.map((c) => c.name).join(', ')}
          </p>
        ) : null}
        <MatchEvidence matches={idea.matches} terms={ev.terms} caseSensitive={ev.caseSensitive} />
        <ResultTags tags={idea.tags} onTagClick={onTagClick} />
      </CardContent>
    </Card>
  )
}

function ContactSearchCard({
  contact,
  ev,
  expanded,
  onToggle,
  related,
  relatedLoading,
  onTagClick,
}: {
  contact: ContactSearchResult
  ev: EvidenceProps
  expanded: boolean
  onToggle: () => void
  related?: ContactRelated
  relatedLoading?: boolean
  onTagClick: (id: number) => void
}) {
  return (
    <Card className="mb-3">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link
              to={`/contacts/${contact.id}`}
              className="font-medium hover:underline"
            >
              <HighlightedText text={contactDisplayName(contact)} terms={ev.terms} caseSensitive={ev.caseSensitive} />
            </Link>
            {contact.title && (
              <p className="text-sm text-muted-foreground truncate">
                <HighlightedText text={contact.title} terms={ev.terms} caseSensitive={ev.caseSensitive} />
                {contact.company && ` at ${contact.company.name}`}
              </p>
            )}
            {!contact.title && contact.company && (
              <p className="text-sm text-muted-foreground">{contact.company.name}</p>
            )}
            <div className="flex flex-wrap gap-1 mt-1">
              <Badge variant="outline" className={`text-xs ${ecosystemColors[contact.ecosystem as Ecosystem] || ''}`}>
                {contact.ecosystem.replace('_', ' ')}
              </Badge>
              <Badge variant="outline" className={`text-xs ${contactStatusColors[contact.status as ContactStatus] || ''}`}>
                {contact.status.replace(/_/g, ' ')}
              </Badge>
            </div>
            <MatchEvidence matches={contact.matches} terms={ev.terms} caseSensitive={ev.caseSensitive} />
            <ResultTags tags={contact.tags} onTagClick={onTagClick} />
          </div>
          <Button variant="ghost" size="sm" onClick={onToggle} className="shrink-0">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <span className="ml-1 text-xs">Related</span>
          </Button>
        </div>

        {expanded && (
          <div className="mt-4 border-t pt-4">
            {relatedLoading && !related ? (
              <div className="flex justify-center py-2">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : related && countRelated(related) > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {related.companies && related.companies.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> Companies
                    </h4>
                    <ul className="space-y-1">
                      {related.companies.map((c) => (
                        <li key={c.id} className="text-sm flex items-center gap-2">
                          <Link to={`/companies/${c.id}`} className="hover:underline">
                            {c.name}
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            ({c.relationship})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {related.contacts && related.contacts.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                      <Users className="h-3 w-3" /> Connected People
                    </h4>
                    <ul className="space-y-1">
                      {related.contacts.map((c) => (
                        <li key={c.id} className="text-sm flex items-center gap-2">
                          <Link to={`/contacts/${c.id}`} className="hover:underline">
                            {c.name}
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            ({c.relationship})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {related.actions && related.actions.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                      <ListTodo className="h-3 w-3" /> Pending Actions
                    </h4>
                    <ul className="space-y-1">
                      {related.actions.filter((a) => !a.completed).map((a) => (
                        <li key={a.id} className="text-sm">
                          <Link to={`/actions/${a.id}`} className="hover:underline">
                            {a.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {related.ideas && related.ideas.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                      <Lightbulb className="h-3 w-3" /> Ideas
                    </h4>
                    <ul className="space-y-1">
                      {related.ideas.map((idea) => (
                        <li key={idea.id} className="text-sm">
                          <Link to={`/ideas?id=${idea.id}`} className="hover:underline">
                            {idea.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {related.conversations && related.conversations.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> Recent Meetings
                    </h4>
                    <ul className="space-y-1">
                      {related.conversations.map((c) => (
                        <li key={c.id} className="text-sm">
                          <span className="text-muted-foreground">{c.date}</span>
                          {c.summary && ` - ${c.summary}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No related items</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CompanySearchCard({
  company,
  ev,
  expanded,
  onToggle,
  related,
  relatedLoading,
  onTagClick,
}: {
  company: CompanySearchResult
  ev: EvidenceProps
  expanded: boolean
  onToggle: () => void
  related?: CompanyRelated
  relatedLoading?: boolean
  onTagClick: (id: number) => void
}) {
  return (
    <Card className="mb-3">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link
              to={`/companies/${company.id}`}
              className="font-medium hover:underline"
            >
              <HighlightedText text={company.name} terms={ev.terms} caseSensitive={ev.caseSensitive} />
            </Link>
            {company.industry && (
              <p className="text-sm text-muted-foreground">{company.industry}</p>
            )}
            <div className="flex flex-wrap gap-1 mt-1">
              <Badge variant="outline" className={`text-xs ${companyStatusColors[company.status as CompanyStatus] || ''}`}>
                {company.status.replace(/_/g, ' ')}
              </Badge>
              {company._count && company._count.contacts > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {company._count.contacts} contacts
                </Badge>
              )}
            </div>
            <MatchEvidence matches={company.matches} terms={ev.terms} caseSensitive={ev.caseSensitive} />
            <ResultTags tags={company.tags} onTagClick={onTagClick} />
          </div>
          <Button variant="ghost" size="sm" onClick={onToggle} className="shrink-0">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <span className="ml-1 text-xs">Related</span>
          </Button>
        </div>

        {expanded && (
          <div className="mt-4 border-t pt-4">
            {relatedLoading && !related ? (
              <div className="flex justify-center py-2">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : related && countRelated(related) > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {related.contacts && related.contacts.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                      <User className="h-3 w-3" /> Contacts
                    </h4>
                    <ul className="space-y-1">
                      {related.contacts.map((c) => (
                        <li key={c.id} className="text-sm">
                          <Link to={`/contacts/${c.id}`} className="hover:underline">
                            {c.name}
                          </Link>
                          {c.title && (
                            <span className="text-xs text-muted-foreground ml-1">
                              - {c.title}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {related.actions && related.actions.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                      <ListTodo className="h-3 w-3" /> Pending Actions
                    </h4>
                    <ul className="space-y-1">
                      {related.actions.filter((a) => !a.completed).map((a) => (
                        <li key={a.id} className="text-sm">
                          <Link to={`/actions/${a.id}`} className="hover:underline">
                            {a.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {related.ideas && related.ideas.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                      <Lightbulb className="h-3 w-3" /> Ideas
                    </h4>
                    <ul className="space-y-1">
                      {related.ideas.map((idea) => (
                        <li key={idea.id} className="text-sm">
                          <Link to={`/ideas?id=${idea.id}`} className="hover:underline">
                            {idea.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {related.conversations && related.conversations.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> Discussions
                    </h4>
                    <ul className="space-y-1">
                      {related.conversations.map((c) => (
                        <li key={c.id} className="text-sm">
                          <span className="text-muted-foreground">{c.date}</span>
                          {' with '}{c.contactName}
                          {c.summary && ` - ${c.summary}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No related items</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryParam = searchParams.get('q') || ''

  // Initial scope/sort/case state: URL beats saved prefs beats defaults
  const prefs = loadPrefs()
  const urlScopes = (searchParams.get('scopes') || '').split(',').filter(isScope)
  const urlSort = searchParams.get('sort') || ''
  const urlTags = (searchParams.get('tags') || '')
    .split(',')
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0)

  const [query, setQuery] = useState(queryParam)
  // Always default to every scope on (incl. "Useful for"); a narrowed selection is
  // deliberately NOT remembered across visits, so search always starts broad. URL
  // scopes still win so shared/deep links keep their narrower selection.
  const [scopes, setScopes] = useState<SearchScope[]>(
    urlScopes.length > 0 ? urlScopes : ALL_SCOPES
  )
  const [sort, setSort] = useState<SearchSort>(
    isSort(urlSort) ? urlSort : (prefs.sort && isSort(prefs.sort) ? prefs.sort : 'relevance')
  )
  const [caseSensitive, setCaseSensitive] = useState<boolean>(
    searchParams.has('cs') ? searchParams.get('cs') === '1' : !!prefs.caseSensitive
  )
  // Tag filter (Tag ids). Searchable even with no text query — picking a tag
  // alone lists "everything tagged X". `allTags` powers the picker (and is how
  // you discover what tags exist).
  const [tagFilter, setTagFilter] = useState<number[]>(urlTags)
  const [allTags, setAllTags] = useState<Tag[]>([])

  // ── "@" mention filter ──
  // Pins the search to one person/org that was @-mentioned. Like the tag filter it's a
  // criterion in its own right (no text needed), and it's exact — an id, or a loose
  // name — rather than a text guess. `label` is empty when restored from a deep link;
  // the search response echoes the name back to fill it in.
  const [mentionFilter, setMentionFilter] = useState<{ key: string; label: string } | null>(
    searchParams.get('mention') ? { key: searchParams.get('mention')!, label: '' } : null
  )
  // The "@…" being typed in the search box right now (null = picker closed).
  const [mentionQuery, setMentionQuery] = useState<{ query: string; start: number } | null>(null)
  const [mentionOptions, setMentionOptions] = useState<MentionIndexEntry[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [results, setResults] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null)
  const [tab, setTab] = useState('all')
  // Meeting whose full contents are shown in the expanded detail dialog (null = closed).
  const [openMeetingId, setOpenMeetingId] = useState<number | null>(null)

  // Load the full tag list once for the filter picker.
  useEffect(() => {
    api.get<Tag[]>('/tags').then(setAllTags).catch(() => setAllTags([]))
  }, [])

  // Add a tag to the active filter (used by the clickable chips on result cards).
  const addTagFilter = useCallback((id: number) => {
    setTagFilter((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }, [])

  // Lazy "Related" panel: fetched per card on first expand, cached by `${type}-${id}`.
  const [relatedCache, setRelatedCache] = useState<Record<string, RelatedData>>({})
  const [relatedLoading, setRelatedLoading] = useState<Record<string, boolean>>({})
  const relatedCacheRef = React.useRef<Record<string, RelatedData>>({})
  const relatedInFlight = React.useRef<Set<string>>(new Set())

  const loadRelated = useCallback(async (type: 'contact' | 'company', id: number) => {
    const key = `${type}-${id}`
    if (relatedCacheRef.current[key] || relatedInFlight.current.has(key)) return
    relatedInFlight.current.add(key)
    setRelatedLoading((prev) => ({ ...prev, [key]: true }))
    try {
      const data = await api.get<{ related: RelatedData }>(`/search/related/${type}/${id}`)
      relatedCacheRef.current[key] = data.related
      setRelatedCache((prev) => ({ ...prev, [key]: data.related }))
    } catch {
      // leave uncached so a later collapse/expand retries
    } finally {
      relatedInFlight.current.delete(key)
      setRelatedLoading((prev) => ({ ...prev, [key]: false }))
    }
  }, [])

  const toggleEntity = useCallback((type: 'contact' | 'company', id: number) => {
    const key = `${type}-${id}`
    setExpandedEntity((cur) => {
      const next = cur === key ? null : key
      if (next) loadRelated(type, id)
      return next
    })
  }, [loadRelated])

  // ── "@" picker plumbing ──
  const mentionOpen = mentionQuery !== null
  const debouncedMentionQuery = useDebounce(mentionQuery?.query ?? '', 150)

  // Re-read the caret after every edit/move: "@" only triggers at a word boundary, and
  // the token ends as soon as the caret leaves it (detectMentionQuery owns those rules
  // — same ones the note editor's @ autocomplete uses).
  const syncMentionQuery = useCallback((el: HTMLInputElement | null) => {
    if (!el) return
    setMentionQuery(detectMentionQuery(el.value, el.selectionStart ?? el.value.length))
  }, [])

  useEffect(() => {
    if (!mentionOpen) {
      setMentionOptions([])
      return
    }
    let cancelled = false
    api
      .get<MentionIndexEntry[]>(`/mentions/index?q=${encodeURIComponent(debouncedMentionQuery)}&limit=8`)
      .then((data) => {
        if (cancelled) return
        setMentionOptions(data)
        setMentionIndex(0)
      })
      .catch(() => {
        if (!cancelled) setMentionOptions([])
      })
    return () => { cancelled = true }
  }, [mentionOpen, debouncedMentionQuery])

  // Picking replaces the typed "@…" with a filter chip: the text box goes back to being
  // plain words (which now narrow WHICH of that person's meetings), and the chip carries
  // the exact identity.
  const pickMention = useCallback((entry: MentionIndexEntry) => {
    const el = inputRef.current
    const start = mentionQuery?.start ?? 0
    const caret = el?.selectionStart ?? query.length
    const stripped = (query.slice(0, start) + query.slice(caret)).replace(/\s+/g, ' ').trim()
    setQuery(stripped)
    setMentionQuery(null)
    setMentionOptions([])
    setMentionFilter({ key: entry.key, label: entry.name })
    setTab('all')
  }, [mentionQuery, query])

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    // While the picker is open it owns the arrows / Enter / Tab / Esc.
    if (!mentionOpen || mentionOptions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setMentionIndex((i) => (i + 1) % mentionOptions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setMentionIndex((i) => (i - 1 + mentionOptions.length) % mentionOptions.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      pickMention(mentionOptions[mentionIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setMentionQuery(null)
    }
  }, [mentionOpen, mentionOptions, mentionIndex, pickMention])

  const debouncedQuery = useDebounce(query, 300)
  const allScopesOn = scopes.length === ALL_SCOPES.length

  // Track the latest search request to discard stale responses
  const currentSearchRef = React.useRef('')

  const doSearch = useCallback(async (searchTerm: string, scopeList: SearchScope[], sortMode: SearchSort, cs: boolean, tagList: number[], mentionKey: string | null) => {
    // A tag filter or a picked @-mention is enough to search on its own — no text required.
    if (searchTerm.length < 2 && tagList.length === 0 && !mentionKey) {
      currentSearchRef.current = ''
      setResults(null)
      setLoading(false)
      return
    }
    const params = new URLSearchParams({
      limit: '20',
      sort: sortMode,
    })
    if (searchTerm.length >= 2) params.set('q', searchTerm)
    if (tagList.length) params.set('tagIds', tagList.join(','))
    if (mentionKey) params.set('mention', mentionKey)
    // Related entities are now lazy-loaded per card via /search/related/:type/:id
    // (see loadRelated) — keeping them off the hot path is the ~20s search fix.
    if (scopeList.length < ALL_SCOPES.length) params.set('scopes', scopeList.join(','))
    if (cs) params.set('caseSensitive', 'true')
    const requestKey = params.toString()
    currentSearchRef.current = requestKey
    setLoading(true)
    try {
      const data = await api.get<SearchResult>(`/search?${requestKey}`)
      // Discard response if a newer search has since been started
      if (currentSearchRef.current === requestKey) {
        setResults(data)
      }
    } catch {
      if (currentSearchRef.current === requestKey) {
        setResults(null)
      }
    } finally {
      if (currentSearchRef.current === requestKey) {
        setLoading(false)
      }
    }
  }, [])

  // URL is shareable state; localStorage carries the defaults forward
  useEffect(() => {
    const next = new URLSearchParams()
    if (debouncedQuery) next.set('q', debouncedQuery)
    // A mention filter forces the mentions scope server-side, so the scope list would
    // be noise in the URL.
    if (!allScopesOn && !mentionFilter) next.set('scopes', scopes.join(','))
    if (mentionFilter) next.set('mention', mentionFilter.key)
    if (tagFilter.length) next.set('tags', tagFilter.join(','))
    if (sort !== 'relevance') next.set('sort', sort)
    if (caseSensitive) next.set('cs', '1')
    setSearchParams(next, { replace: true })
    localStorage.setItem(PREFS_KEY, JSON.stringify({ sort, caseSensitive }))
    doSearch(debouncedQuery, scopes, sort, caseSensitive, tagFilter, mentionFilter?.key ?? null)
  }, [debouncedQuery, scopes, sort, caseSensitive, tagFilter, mentionFilter, allScopesOn, setSearchParams, doSearch])

  // Load query from URL on mount
  useEffect(() => {
    if (queryParam && queryParam !== query) {
      setQuery(queryParam)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // One badge cycles: all → just-this → all-except-this → all → …
  //  • From the all-on default, a click ISOLATES to just that scope (search only it).
  //  • Clicking that same lone scope again INVERTS to everything except it.
  //  • Otherwise it's a plain add/remove on the current subset (keeping ≥1).
  // The "All" chip jumps straight back to everything.
  function toggleScope(scope: SearchScope) {
    setScopes((prev) => {
      if (prev.length === ALL_SCOPES.length) return [scope]
      if (prev.length === 1 && prev[0] === scope) {
        return ALL_SCOPES.filter((s) => s !== scope)
      }
      if (prev.includes(scope)) {
        return prev.length > 1 ? prev.filter((s) => s !== scope) : prev
      }
      return [...prev, scope]
    })
  }

  const refresh = useCallback(() => {
    doSearch(debouncedQuery, scopes, sort, caseSensitive, tagFilter, mentionFilter?.key ?? null)
  }, [doSearch, debouncedQuery, scopes, sort, caseSensitive, tagFilter, mentionFilter])

  const ev: EvidenceProps = {
    terms: results?.terms || (debouncedQuery ? [debouncedQuery] : []),
    caseSensitive,
  }

  const tagOptions = allTags.map((t) => ({ value: t.id.toString(), label: t.name }))
  // A search runs on a query, a tag, OR a picked @-mention; the empty-state copy keys off this.
  const hasCriteria = debouncedQuery.length >= 2 || tagFilter.length > 0 || !!mentionFilter

  // A picked @-mention makes this a mention search and nothing else (the server forces
  // it too — the other scopes can't answer "who was @-mentioned").
  const effectiveScopes: SearchScope[] = mentionFilter ? ['mentions'] : scopes
  const showPeople = effectiveScopes.includes('people-profile') || effectiveScopes.includes('people-notes') || effectiveScopes.includes('useful')
  const showOrgs = effectiveScopes.includes('orgs')
  const showMeetings = effectiveScopes.includes('meetings')
  const showMentions = effectiveScopes.includes('mentions')
  const showActions = effectiveScopes.includes('actions')
  const showIdeas = effectiveScopes.includes('ideas')

  // Label for the mention chip. Empty on a deep link until the response echoes the name.
  const mentionLabel = mentionFilter ? (mentionFilter.label || results?.mention?.name || '…') : ''

  const totals = results?.totals

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Search</h1>

      {/* Search input. Typing "@" opens the mention picker beneath it. */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); syncMentionQuery(e.currentTarget) }}
          onKeyDown={handleInputKeyDown}
          // Arrow/click moves the caret out of (or back into) an "@…" token without
          // changing the text, so the picker has to re-check on selection changes too.
          onKeyUp={(e) => syncMentionQuery(e.currentTarget)}
          onClick={(e) => syncMentionQuery(e.currentTarget)}
          // Delay so a click on an option lands before the list unmounts.
          onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
          placeholder='Search everything… (type @ for a mention, "quotes" for phrases)'
          className="pl-10 pr-12 h-12 text-lg"
          autoFocus
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        )}
        {mentionOpen && mentionOptions.length > 0 && (
          <MentionPicker
            options={mentionOptions}
            activeIndex={mentionIndex}
            onPick={pickMention}
            onHover={setMentionIndex}
          />
        )}
      </div>

      {/* Scope chips + sort + case sensitivity. A picked @-mention replaces the scope
          chips: the search is pinned to that person/org, and the words in the box now
          narrow WHICH of their meetings rather than searching for a name. */}
      <div className="flex flex-wrap items-center gap-2">
        {mentionFilter ? (
          <>
            <span className="text-xs text-muted-foreground">Meetings that @-mention</span>
            <Badge variant="outline" className="gap-1 border-blue-200 bg-blue-50 text-xs text-blue-800">
              <AtSign className="h-3 w-3" />
              {mentionLabel}
              <button
                type="button"
                onClick={() => setMentionFilter(null)}
                aria-label="Clear @-mention filter"
                title="Clear @-mention filter"
                className="ml-0.5 rounded hover:bg-blue-100"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
            <span className="text-xs text-muted-foreground">— add words to narrow to particular meetings</span>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setScopes([...ALL_SCOPES])}
              title="Search everything"
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                allScopesOn
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input bg-background text-muted-foreground hover:bg-muted'
              )}
            >
              All
            </button>
            {SCOPE_OPTIONS.map((s) => {
              const active = scopes.includes(s.value)
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => toggleScope(s.value)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background text-muted-foreground hover:bg-muted'
                  )}
                >
                  {s.label}
                </button>
              )
            })}
          </>
        )}
        <div className="flex items-center gap-2 sm:ml-auto">
          <button
            type="button"
            onClick={() => setCaseSensitive((v) => !v)}
            title={caseSensitive ? 'Match case: on' : 'Match case: off'}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md border transition-colors',
              caseSensitive
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-background text-muted-foreground hover:bg-muted'
            )}
          >
            <CaseSensitive className="h-4 w-4" />
          </button>
          <Select value={sort} onValueChange={(v) => setSort(v as SearchSort)}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tag filter — narrows ALL result types to records carrying a chosen tag.
          The picker doubles as the catalog of available tags. */}
      <div className="flex items-center gap-2">
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
          <TagIcon className="h-3.5 w-3.5" /> Tags
        </span>
        <div className="min-w-0 max-w-md flex-1">
          <MultiCombobox
            options={tagOptions}
            values={tagFilter.map(String)}
            onChange={(vals) => setTagFilter(vals.map(Number))}
            placeholder="Filter by tag…"
            searchPlaceholder="Find a tag…"
            emptyMessage="No tags yet"
          />
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* No query */}
      {!loading && !results && !hasCriteria && (
        <p className="text-center text-muted-foreground py-8">
          Enter at least 2 characters, pick a tag, or type <span className="font-mono">@</span> to find an @-mention
        </p>
      )}

      {/* No results */}
      {!loading && results && totalResults(results) === 0 && (
        <p className="text-center text-muted-foreground py-8">
          No {mentionFilter ? 'meetings' : 'results'} found
          {mentionFilter ? ` that @-mention ${mentionLabel}` : ''}
          {results.query ? ` for "${results.query}"` : ''}
          {tagFilter.length > 0 && ` with ${tagFilter.length === 1 ? 'this tag' : 'these tags'}`}
          {caseSensitive && ' (match case is on)'}
        </p>
      )}

      {/* Results */}
      {!loading && results && totalResults(results) > 0 && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="all">
              All ({totalResults(results)})
            </TabsTrigger>
            {showPeople && (
              <TabsTrigger value="contacts">
                <User className="mr-1 h-4 w-4" />
                People ({totals?.contacts ?? results.contacts.length})
              </TabsTrigger>
            )}
            {showOrgs && (
              <TabsTrigger value="companies">
                <Building2 className="mr-1 h-4 w-4" />
                Orgs ({totals?.companies ?? results.companies.length})
              </TabsTrigger>
            )}
            {showMeetings && (
              <TabsTrigger value="meetings">
                <MessageSquare className="mr-1 h-4 w-4" />
                Meetings ({totals?.conversations ?? results.conversations?.length ?? 0})
              </TabsTrigger>
            )}
            {showMentions && (
              <TabsTrigger value="mentions">
                <AtSign className="mr-1 h-4 w-4" />
                Mentions ({totals?.mentions ?? results.mentions?.length ?? 0})
              </TabsTrigger>
            )}
            {showActions && (
              <TabsTrigger value="actions">
                <ListTodo className="mr-1 h-4 w-4" />
                Actions ({totals?.actions ?? results.actions.length})
              </TabsTrigger>
            )}
            {showIdeas && (
              <TabsTrigger value="ideas">
                <Lightbulb className="mr-1 h-4 w-4" />
                Ideas ({totals?.ideas ?? results.ideas.length})
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="all" className="mt-4">
            {results.contacts.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <User className="h-5 w-5" /> People
                </h2>
                {results.contacts.slice(0, 5).map((contact) => (
                  <ContactSearchCard
                    key={contact.id}
                    contact={contact}
                    ev={ev}
                    expanded={expandedEntity === `contact-${contact.id}`}
                    related={relatedCache[`contact-${contact.id}`] as ContactRelated}
                    relatedLoading={!!relatedLoading[`contact-${contact.id}`]}
                    onToggle={() => toggleEntity('contact', contact.id)}
                    onTagClick={addTagFilter}
                  />
                ))}
                {results.contacts.length > 5 && (
                  <Button variant="link" className="px-0" onClick={() => setTab('contacts')}>
                    View all {totals?.contacts ?? results.contacts.length} people
                  </Button>
                )}
              </div>
            )}

            {results.companies.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Building2 className="h-5 w-5" /> Organizations
                </h2>
                {results.companies.slice(0, 5).map((company) => (
                  <CompanySearchCard
                    key={company.id}
                    company={company}
                    ev={ev}
                    expanded={expandedEntity === `company-${company.id}`}
                    related={relatedCache[`company-${company.id}`] as CompanyRelated}
                    relatedLoading={!!relatedLoading[`company-${company.id}`]}
                    onToggle={() => toggleEntity('company', company.id)}
                    onTagClick={addTagFilter}
                  />
                ))}
                {results.companies.length > 5 && (
                  <Button variant="link" className="px-0" onClick={() => setTab('companies')}>
                    View all {totals?.companies ?? results.companies.length} organizations
                  </Button>
                )}
              </div>
            )}

            {results.conversations && results.conversations.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" /> Meetings
                </h2>
                {results.conversations.slice(0, 5).map((conv) => (
                  <MeetingSearchCard key={conv.id} conv={conv} ev={ev} onOpen={setOpenMeetingId} onTagClick={addTagFilter} />
                ))}
                {(results.conversations.length > 5) && (
                  <Button variant="link" className="px-0" onClick={() => setTab('meetings')}>
                    View all {totals?.conversations ?? results.conversations.length} meetings
                  </Button>
                )}
              </div>
            )}

            {results.mentions && results.mentions.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <AtSign className="h-5 w-5" /> @-Mentions
                </h2>
                {results.mentions.slice(0, 5).map((meeting) => (
                  <MentionSearchCard key={meeting.id} meeting={meeting} ev={ev} onOpen={setOpenMeetingId} onTagClick={addTagFilter} />
                ))}
                {results.mentions.length > 5 && (
                  <Button variant="link" className="px-0" onClick={() => setTab('mentions')}>
                    View all {totals?.mentions ?? results.mentions.length} meetings with mentions
                  </Button>
                )}
              </div>
            )}

            {results.actions.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <ListTodo className="h-5 w-5" /> Actions
                </h2>
                {results.actions.slice(0, 5).map((action) => (
                  <ActionSearchCard key={action.id} action={action} ev={ev} onUpdate={refresh} />
                ))}
                {results.actions.length > 5 && (
                  <Button variant="link" className="px-0" onClick={() => setTab('actions')}>
                    View all {totals?.actions ?? results.actions.length} actions
                  </Button>
                )}
              </div>
            )}

            {results.ideas.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Lightbulb className="h-5 w-5" /> Ideas
                </h2>
                {results.ideas.slice(0, 5).map((idea) => (
                  <IdeaSearchCard key={idea.id} idea={idea} ev={ev} onTagClick={addTagFilter} />
                ))}
                {results.ideas.length > 5 && (
                  <Button variant="link" className="px-0" onClick={() => setTab('ideas')}>
                    View all {totals?.ideas ?? results.ideas.length} ideas
                  </Button>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="contacts" className="mt-4">
            {results.contacts.map((contact) => (
              <ContactSearchCard
                key={contact.id}
                contact={contact}
                ev={ev}
                expanded={expandedEntity === `contact-${contact.id}`}
                related={relatedCache[`contact-${contact.id}`] as ContactRelated}
                relatedLoading={!!relatedLoading[`contact-${contact.id}`]}
                onToggle={() => toggleEntity('contact', contact.id)}
                onTagClick={addTagFilter}
              />
            ))}
            {totals && totals.contacts > results.contacts.length && (
              <ShowAllLink
                to={`/contacts?search=${encodeURIComponent(results.query)}`}
                total={totals.contacts}
                label="in Contacts"
              />
            )}
          </TabsContent>

          <TabsContent value="companies" className="mt-4">
            {results.companies.map((company) => (
              <CompanySearchCard
                key={company.id}
                company={company}
                ev={ev}
                expanded={expandedEntity === `company-${company.id}`}
                related={relatedCache[`company-${company.id}`] as CompanyRelated}
                relatedLoading={!!relatedLoading[`company-${company.id}`]}
                onToggle={() => toggleEntity('company', company.id)}
                onTagClick={addTagFilter}
              />
            ))}
            {totals && totals.companies > results.companies.length && (
              <ShowAllLink
                to={`/companies?search=${encodeURIComponent(results.query)}`}
                total={totals.companies}
                label="in Organizations"
              />
            )}
          </TabsContent>

          <TabsContent value="meetings" className="mt-4">
            {results.conversations?.map((conv) => (
              <MeetingSearchCard key={conv.id} conv={conv} ev={ev} onOpen={setOpenMeetingId} onTagClick={addTagFilter} />
            ))}
            {totals && totals.conversations > (results.conversations?.length ?? 0) && (
              <ShowAllLink
                to={`/meetings?q=${encodeURIComponent(results.query)}`}
                total={totals.conversations}
                label="in Meetings"
              />
            )}
          </TabsContent>

          <TabsContent value="mentions" className="mt-4">
            {results.mentions?.map((meeting) => (
              <MentionSearchCard key={meeting.id} meeting={meeting} ev={ev} onOpen={setOpenMeetingId} onTagClick={addTagFilter} />
            ))}
            {totals && totals.mentions > (results.mentions?.length ?? 0) && (
              <p className="text-sm text-muted-foreground">
                Showing {results.mentions?.length ?? 0} of {totals.mentions} meetings with a matching @-mention — narrow the search to see the rest.
              </p>
            )}
          </TabsContent>

          <TabsContent value="actions" className="mt-4">
            {results.actions.map((action) => (
              <ActionSearchCard key={action.id} action={action} ev={ev} onUpdate={refresh} />
            ))}
            {totals && totals.actions > results.actions.length && (
              <p className="text-sm text-muted-foreground">
                Showing {results.actions.length} of {totals.actions} actions — narrow the search to see the rest.
              </p>
            )}
          </TabsContent>

          <TabsContent value="ideas" className="mt-4">
            {results.ideas.map((idea) => (
              <IdeaSearchCard key={idea.id} idea={idea} ev={ev} onTagClick={addTagFilter} />
            ))}
            {totals && totals.ideas > results.ideas.length && (
              <p className="text-sm text-muted-foreground">
                Showing {results.ideas.length} of {totals.ideas} ideas — narrow the search to see the rest.
              </p>
            )}
          </TabsContent>
        </Tabs>
      )}

      <MeetingDetailDialog
        conversationId={openMeetingId}
        terms={ev.terms}
        caseSensitive={ev.caseSensitive}
        onOpenChange={(open) => { if (!open) setOpenMeetingId(null) }}
      />
    </div>
  )
}
