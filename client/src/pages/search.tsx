import React, { useEffect, useState, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { api } from '@/lib/api'
import type { SearchResult, ContactSearchResult, CompanySearchResult, Ecosystem, ContactStatus, CompanyStatus } from '@/lib/types'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ActionDateSelect } from '@/components/action-date-select'

const ecosystemColors: Record<Ecosystem, string> = {
  RECRUITER: 'bg-blue-100 text-blue-800',
  ROLODEX: 'bg-purple-100 text-purple-800',
  TARGET: 'bg-green-100 text-green-800',
  INFLUENCER: 'bg-amber-100 text-amber-800',
  ACADEMIA: 'bg-rose-100 text-rose-800',
  INTRO_SOURCE: 'bg-cyan-100 text-cyan-800',
}

const contactStatusColors: Record<ContactStatus, string> = {
  NEW: 'bg-slate-100 text-slate-700',
  RESEARCHING: 'bg-blue-100 text-blue-700',
  CONNECTED: 'bg-green-100 text-green-700',
  AWAITING_RESPONSE: 'bg-yellow-100 text-yellow-700',
  FOLLOW_UP_NEEDED: 'bg-orange-100 text-orange-700',
  LEAD_TO_PURSUE: 'bg-pink-100 text-pink-700',
  ON_HOLD: 'bg-gray-100 text-gray-500',
  CLOSED: 'bg-red-100 text-red-700',
}

const companyStatusColors: Record<CompanyStatus, string> = {
  RESEARCHING: 'bg-sky-100 text-sky-700',
  ACTIVE_TARGET: 'bg-indigo-100 text-indigo-700',
  IN_DISCUSSIONS: 'bg-violet-100 text-violet-700',
  CONNECTED: 'bg-emerald-100 text-emerald-700',
  ON_HOLD: 'bg-gray-100 text-gray-500',
  CLOSED: 'bg-red-100 text-red-700',
}
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
} from 'lucide-react'

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
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
    results.ideas.length
  )
}

function ContactSearchCard({
  contact,
  expanded,
  onToggle,
}: {
  contact: ContactSearchResult
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
              {contact.name}
            </Link>
            {contact.title && (
              <p className="text-sm text-muted-foreground truncate">
                {contact.title}
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
  expanded,
  onToggle,
}: {
  company: CompanySearchResult
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
              {company.name}
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
  const [query, setQuery] = useState(queryParam)
  const [results, setResults] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null)

  const debouncedQuery = useDebounce(query, 300)

  // Track the latest search term to discard stale responses
  const currentSearchRef = React.useRef('')

  const doSearch = useCallback(async (searchTerm: string) => {
    if (searchTerm.length < 2) {
      currentSearchRef.current = ''
      setResults(null)
      setLoading(false)
      return
    }
    currentSearchRef.current = searchTerm
    setLoading(true)
    try {
      const data = await api.get<SearchResult>(
        `/search?q=${encodeURIComponent(searchTerm)}&limit=20&includeRelated=true`
      )
      // Discard response if a newer search has since been started
      if (currentSearchRef.current === searchTerm) {
        setResults(data)
      }
    } catch {
      if (currentSearchRef.current === searchTerm) {
        setResults(null)
      }
    } finally {
      if (currentSearchRef.current === searchTerm) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    // Update URL when debounced query changes
    if (debouncedQuery) {
      setSearchParams({ q: debouncedQuery })
    } else {
      setSearchParams({})
    }
    doSearch(debouncedQuery)
  }, [debouncedQuery, setSearchParams, doSearch])

  // Load from URL on mount
  useEffect(() => {
    if (queryParam && queryParam !== query) {
      setQuery(queryParam)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Search</h1>

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search contacts, companies, actions, ideas..."
          className="pl-10 h-12 text-lg"
          autoFocus
        />
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
        </p>
      )}

      {/* Results */}
      {!loading && results && totalResults(results) > 0 && (
        <Tabs defaultValue="all">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="all">
              All ({totalResults(results)})
            </TabsTrigger>
            <TabsTrigger value="contacts">
              <User className="mr-1 h-4 w-4" />
              Contacts ({results.contacts.length})
            </TabsTrigger>
            <TabsTrigger value="companies">
              <Building2 className="mr-1 h-4 w-4" />
              Companies ({results.companies.length})
            </TabsTrigger>
            <TabsTrigger value="actions">
              <ListTodo className="mr-1 h-4 w-4" />
              Actions ({results.actions.length})
            </TabsTrigger>
            <TabsTrigger value="ideas">
              <Lightbulb className="mr-1 h-4 w-4" />
              Ideas ({results.ideas.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4">
            {results.contacts.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <User className="h-5 w-5" /> Contacts
                </h2>
                {results.contacts.slice(0, 5).map((contact) => (
                  <ContactSearchCard
                    key={contact.id}
                    contact={contact}
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
                  <Button
                    variant="link"
                    className="px-0"
                    onClick={() => {
                      const tabs = document.querySelector('[data-state="inactive"][value="contacts"]') as HTMLElement
                      tabs?.click()
                    }}
                  >
                    View all {results.contacts.length} contacts
                  </Button>
                )}
              </div>
            )}

            {results.companies.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Building2 className="h-5 w-5" /> Companies
                </h2>
                {results.companies.slice(0, 5).map((company) => (
                  <CompanySearchCard
                    key={company.id}
                    company={company}
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
                  <Button
                    variant="link"
                    className="px-0"
                    onClick={() => {
                      const tabs = document.querySelector('[data-state="inactive"][value="companies"]') as HTMLElement
                      tabs?.click()
                    }}
                  >
                    View all {results.companies.length} companies
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
                  <Card key={action.id} className="mb-2">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/actions/${action.id}`}
                          className="font-medium hover:underline"
                        >
                          {action.title}
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
                          <div className="inline-block align-middle ml-2" onClick={(e) => e.stopPropagation()}>
                            <ActionDateSelect
                              action={action}
                              onUpdate={() => doSearch(currentSearchRef.current)}
                              className="-ml-2 h-8"
                            />
                          </div>
                        )}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {results.ideas.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Lightbulb className="h-5 w-5" /> Ideas
                </h2>
                {results.ideas.slice(0, 5).map((idea) => (
                  <Card key={idea.id} className="mb-2">
                    <CardContent className="p-3">
                      <p className="font-medium">{idea.title}</p>
                      {idea.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {idea.description}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="contacts" className="mt-4">
            {results.contacts.map((contact) => (
              <ContactSearchCard
                key={contact.id}
                contact={contact}
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
          </TabsContent>

          <TabsContent value="companies" className="mt-4">
            {results.companies.map((company) => (
              <CompanySearchCard
                key={company.id}
                company={company}
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
          </TabsContent>

          <TabsContent value="actions" className="mt-4">
            {results.actions.map((action) => (
              <Card key={action.id} className="mb-2">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/actions/${action.id}`}
                      className="font-medium hover:underline"
                    >
                      {action.title}
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
                      <div className="inline-block align-middle ml-2" onClick={(e) => e.stopPropagation()}>
                        <ActionDateSelect
                          action={action}
                          onUpdate={() => doSearch(currentSearchRef.current)}
                          className="-ml-2 h-8"
                        />
                      </div>
                    )}
                  </p>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="ideas" className="mt-4">
            {results.ideas.map((idea) => (
              <Card key={idea.id} className="mb-2">
                <CardContent className="p-3">
                  <p className="font-medium">{idea.title}</p>
                  {idea.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {idea.description}
                    </p>
                  )}
                  {(idea.contacts?.length || idea.companies?.length) && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {idea.contacts?.map((c) => c.name).join(', ')}
                      {idea.contacts?.length && idea.companies?.length ? ' | ' : ''}
                      {idea.companies?.map((c) => c.name).join(', ')}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
