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
  Ecosystem,
  ContactStatus,
  CompanyStatus,
  Action,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ActionDateSelect } from '@/components/action-date-select'
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
  { value: 'orgs', label: 'Organizations' },
  { value: 'meetings', label: 'Meetings' },
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
  scopes?: SearchScope[]
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

/** Render text with every term occurrence wrapped in <mark>. */
function HighlightedText({
  text,
  terms,
  caseSensitive,
}: {
  text: string
  terms: string[]
  caseSensitive: boolean
}) {
  const ranges: [number, number][] = []
  const hay = caseSensitive ? text : text.toLowerCase()
  for (const term of terms) {
    const needle = caseSensitive ? term : term.toLowerCase()
    if (!needle) continue
    let idx = hay.indexOf(needle)
    while (idx !== -1) {
      ranges.push([idx, idx + needle.length])
      idx = hay.indexOf(needle, idx + needle.length)
    }
  }
  if (ranges.length === 0) return <>{text}</>

  ranges.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([r[0], r[1]])
  }

  const parts: React.ReactNode[] = []
  let pos = 0
  merged.forEach(([start, end], i) => {
    if (start > pos) parts.push(text.slice(pos, start))
    parts.push(
      <mark key={i} className="rounded bg-yellow-200 px-0.5 text-foreground">
        {text.slice(start, end)}
      </mark>
    )
    pos = end
  })
  if (pos < text.length) parts.push(text.slice(pos))
  return <>{parts}</>
}

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
      {matches.map((m, i) => (
        <p key={i} className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground/70">{m.field}:</span>{' '}
          <HighlightedText text={m.snippet} terms={terms} caseSensitive={caseSensitive} />
        </p>
      ))}
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
    (results.conversations?.length || 0)
  )
}

interface EvidenceProps {
  terms: string[]
  caseSensitive: boolean
}

function MeetingSearchCard({ conv, ev }: { conv: NonNullable<SearchResult['conversations']>[number]; ev: EvidenceProps }) {
  return (
    <Card className="mb-2">
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <Link
            to={conv.title ? `/meetings?title=${encodeURIComponent(conv.title)}` : `/meetings?id=${conv.id}`}
            className="font-medium hover:underline"
          >
            <HighlightedText text={conv.displayName} terms={ev.terms} caseSensitive={ev.caseSensitive} />
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          {conv.date}
          {conv.contact && ` | ${conv.contact.name}`}
          {conv.company && ` | ${conv.company.name}`}
          {conv.summary && ` — ${conv.summary}`}
        </p>
        <MatchEvidence matches={conv.matches} terms={ev.terms} caseSensitive={ev.caseSensitive} />
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

function IdeaSearchCard({ idea, ev }: { idea: SearchResult['ideas'][number]; ev: EvidenceProps }) {
  return (
    <Card className="mb-2">
      <CardContent className="p-3">
        <p className="font-medium">
          <HighlightedText text={idea.title} terms={ev.terms} caseSensitive={ev.caseSensitive} />
        </p>
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
      </CardContent>
    </Card>
  )
}

function ContactSearchCard({
  contact,
  ev,
  expanded,
  onToggle,
}: {
  contact: ContactSearchResult
  ev: EvidenceProps
  expanded: boolean
  onToggle: () => void
}) {
  const relatedCount = countRelated(contact.related)

  return (
    <Card className="mb-3">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link
              to={`/contacts/${contact.id}`}
              className="font-medium hover:underline"
            >
              <HighlightedText text={contact.name} terms={ev.terms} caseSensitive={ev.caseSensitive} />
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
          </div>
          {relatedCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onToggle} className="shrink-0">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span className="ml-1 text-xs">{relatedCount}</span>
            </Button>
          )}
        </div>

        {expanded && contact.related && (
          <div className="mt-4 grid gap-4 md:grid-cols-2 border-t pt-4">
            {contact.related.companies && contact.related.companies.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> Companies
                </h4>
                <ul className="space-y-1">
                  {contact.related.companies.map((c) => (
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

            {contact.related.contacts && contact.related.contacts.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                  <Users className="h-3 w-3" /> Connected People
                </h4>
                <ul className="space-y-1">
                  {contact.related.contacts.map((c) => (
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

            {contact.related.actions && contact.related.actions.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                  <ListTodo className="h-3 w-3" /> Pending Actions
                </h4>
                <ul className="space-y-1">
                  {contact.related.actions.filter((a) => !a.completed).map((a) => (
                    <li key={a.id} className="text-sm">
                      <Link to={`/actions/${a.id}`} className="hover:underline">
                        {a.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {contact.related.ideas && contact.related.ideas.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                  <Lightbulb className="h-3 w-3" /> Ideas
                </h4>
                <ul className="space-y-1">
                  {contact.related.ideas.map((idea) => (
                    <li key={idea.id} className="text-sm">
                      {idea.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {contact.related.conversations && contact.related.conversations.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" /> Recent Conversations
                </h4>
                <ul className="space-y-1">
                  {contact.related.conversations.map((c) => (
                    <li key={c.id} className="text-sm">
                      <span className="text-muted-foreground">{c.date}</span>
                      {c.summary && ` - ${c.summary}`}
                    </li>
                  ))}
                </ul>
              </div>
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
}: {
  company: CompanySearchResult
  ev: EvidenceProps
  expanded: boolean
  onToggle: () => void
}) {
  const relatedCount = countRelated(company.related)

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
          </div>
          {relatedCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onToggle} className="shrink-0">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span className="ml-1 text-xs">{relatedCount}</span>
            </Button>
          )}
        </div>

        {expanded && company.related && (
          <div className="mt-4 grid gap-4 md:grid-cols-2 border-t pt-4">
            {company.related.contacts && company.related.contacts.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                  <User className="h-3 w-3" /> Contacts
                </h4>
                <ul className="space-y-1">
                  {company.related.contacts.map((c) => (
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

            {company.related.actions && company.related.actions.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                  <ListTodo className="h-3 w-3" /> Pending Actions
                </h4>
                <ul className="space-y-1">
                  {company.related.actions.filter((a) => !a.completed).map((a) => (
                    <li key={a.id} className="text-sm">
                      <Link to={`/actions/${a.id}`} className="hover:underline">
                        {a.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {company.related.ideas && company.related.ideas.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                  <Lightbulb className="h-3 w-3" /> Ideas
                </h4>
                <ul className="space-y-1">
                  {company.related.ideas.map((idea) => (
                    <li key={idea.id} className="text-sm">
                      {idea.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {company.related.conversations && company.related.conversations.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" /> Discussions
                </h4>
                <ul className="space-y-1">
                  {company.related.conversations.map((c) => (
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

  const [query, setQuery] = useState(queryParam)
  const [scopes, setScopes] = useState<SearchScope[]>(
    urlScopes.length > 0 ? urlScopes : (prefs.scopes?.filter(isScope).length ? prefs.scopes.filter(isScope) : ALL_SCOPES)
  )
  const [sort, setSort] = useState<SearchSort>(
    isSort(urlSort) ? urlSort : (prefs.sort && isSort(prefs.sort) ? prefs.sort : 'relevance')
  )
  const [caseSensitive, setCaseSensitive] = useState<boolean>(
    searchParams.has('cs') ? searchParams.get('cs') === '1' : !!prefs.caseSensitive
  )
  const [results, setResults] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null)
  const [tab, setTab] = useState('all')

  const debouncedQuery = useDebounce(query, 300)
  const allScopesOn = scopes.length === ALL_SCOPES.length

  // Track the latest search request to discard stale responses
  const currentSearchRef = React.useRef('')

  const doSearch = useCallback(async (searchTerm: string, scopeList: SearchScope[], sortMode: SearchSort, cs: boolean) => {
    if (searchTerm.length < 2) {
      currentSearchRef.current = ''
      setResults(null)
      setLoading(false)
      return
    }
    const params = new URLSearchParams({
      q: searchTerm,
      limit: '20',
      includeRelated: 'true',
      sort: sortMode,
    })
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
    if (!allScopesOn) next.set('scopes', scopes.join(','))
    if (sort !== 'relevance') next.set('sort', sort)
    if (caseSensitive) next.set('cs', '1')
    setSearchParams(next, { replace: true })
    localStorage.setItem(PREFS_KEY, JSON.stringify({ scopes, sort, caseSensitive }))
    doSearch(debouncedQuery, scopes, sort, caseSensitive)
  }, [debouncedQuery, scopes, sort, caseSensitive, allScopesOn, setSearchParams, doSearch])

  // Load query from URL on mount
  useEffect(() => {
    if (queryParam && queryParam !== query) {
      setQuery(queryParam)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleScope(scope: SearchScope) {
    setScopes((prev) => {
      if (prev.includes(scope)) {
        // Keep at least one scope active
        return prev.length > 1 ? prev.filter((s) => s !== scope) : prev
      }
      return [...prev, scope]
    })
  }

  const refresh = useCallback(() => {
    doSearch(debouncedQuery, scopes, sort, caseSensitive)
  }, [doSearch, debouncedQuery, scopes, sort, caseSensitive])

  const ev: EvidenceProps = {
    terms: results?.terms || (debouncedQuery ? [debouncedQuery] : []),
    caseSensitive,
  }

  const showPeople = scopes.includes('people-profile') || scopes.includes('people-notes')
  const showOrgs = scopes.includes('orgs')
  const showMeetings = scopes.includes('meetings')
  const showActions = scopes.includes('actions')
  const showIdeas = scopes.includes('ideas')

  const totals = results?.totals

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Search</h1>

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Search everything... (use "quotes" for phrases)'
          className="pl-10 h-12 text-lg"
          autoFocus
        />
      </div>

      {/* Scope chips + sort + case sensitivity */}
      <div className="flex flex-wrap items-center gap-2">
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

      {/* Loading state */}
      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* No query */}
      {!loading && !results && debouncedQuery.length < 2 && (
        <p className="text-center text-muted-foreground py-8">
          Enter at least 2 characters to search
        </p>
      )}

      {/* No results */}
      {!loading && results && totalResults(results) === 0 && (
        <p className="text-center text-muted-foreground py-8">
          No results found for "{results.query}"
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
                    onToggle={() =>
                      setExpandedEntity(
                        expandedEntity === `contact-${contact.id}`
                          ? null
                          : `contact-${contact.id}`
                      )
                    }
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
                    onToggle={() =>
                      setExpandedEntity(
                        expandedEntity === `company-${company.id}`
                          ? null
                          : `company-${company.id}`
                      )
                    }
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
                  <MeetingSearchCard key={conv.id} conv={conv} ev={ev} />
                ))}
                {(results.conversations.length > 5) && (
                  <Button variant="link" className="px-0" onClick={() => setTab('meetings')}>
                    View all {totals?.conversations ?? results.conversations.length} meetings
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
                  <IdeaSearchCard key={idea.id} idea={idea} ev={ev} />
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
                onToggle={() =>
                  setExpandedEntity(
                    expandedEntity === `contact-${contact.id}`
                      ? null
                      : `contact-${contact.id}`
                  )
                }
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
                onToggle={() =>
                  setExpandedEntity(
                    expandedEntity === `company-${company.id}`
                      ? null
                      : `company-${company.id}`
                  )
                }
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
              <MeetingSearchCard key={conv.id} conv={conv} ev={ev} />
            ))}
            {totals && totals.conversations > (results.conversations?.length ?? 0) && (
              <ShowAllLink
                to={`/meetings?q=${encodeURIComponent(results.query)}`}
                total={totals.conversations}
                label="in Meetings"
              />
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
              <IdeaSearchCard key={idea.id} idea={idea} ev={ev} />
            ))}
            {totals && totals.ideas > results.ideas.length && (
              <p className="text-sm text-muted-foreground">
                Showing {results.ideas.length} of {totals.ideas} ideas — narrow the search to see the rest.
              </p>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
