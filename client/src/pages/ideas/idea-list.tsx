import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Idea, Contact, Company, Tag } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MarkdownTextarea } from '@/components/markdown-textarea'
import ReactMarkdown from 'react-markdown'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MultiCombobox } from '@/components/ui/combobox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { HighlightedText } from '@/components/highlighted-text'
import { highlightRehype } from '@/lib/highlight-markdown'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Lightbulb, Search, Loader2, RotateCcw, Star, CaseSensitive, Archive, ArchiveRestore, Image as ImageIcon, List as ListIcon, LayoutGrid, X } from 'lucide-react'
import type { SaveStatus } from '@/hooks/use-auto-save'
import { SaveStatusIndicator } from '@/components/save-status'
import { cn } from '@/lib/utils'

// Archive lozenge filter — archived ideas are hidden by default and only loaded
// (so only searchable) when the user opts into "Archived" or "All".
type ArchiveFilter = 'active' | 'archived' | 'all'
const ARCHIVE_FILTERS: { value: ArchiveFilter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
]

// Ideas-only search/sort (scoped to Ideas — never the global multi-entity search).
type IdeaSort = 'relevance' | 'newest' | 'oldest' | 'alpha'
const IDEA_SORT_OPTIONS: { value: IdeaSort; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'alpha', label: 'A → Z' },
]

// Returns a relevance score for an idea against all search terms (AND across
// terms), or -1 if any term is missing. Title hits weigh most, then tags, then
// related people/orgs, then the description body.
function ideaMatchScore(idea: Idea, terms: string[], caseSensitive: boolean): number {
  const norm = (s: string) => (caseSensitive ? s : s.toLowerCase())
  const title = norm(idea.title)
  const tags = norm((idea.tagLinks?.map((t) => t.tag.name) || []).join(' '))
  const names = norm([
    ...(idea.contacts?.map((ic) => ic.contact.name) || []),
    ...(idea.companies?.map((ic) => ic.company.name) || []),
  ].join(' '))
  const desc = norm(idea.description || '')
  let score = 0
  for (const raw of terms) {
    const term = norm(raw)
    const inTitle = title.includes(term)
    const inTags = tags.includes(term)
    const inNames = names.includes(term)
    const inDesc = desc.includes(term)
    if (!inTitle && !inTags && !inNames && !inDesc) return -1
    score += (inTitle ? 4 : 0) + (inTags ? 3 : 0) + (inNames ? 2 : 0) + (inDesc ? 1 : 0)
  }
  return score
}

type IdeaForm = {
  title: string
  description: string
  tagValues: string[]   // tag ids (strings) or free-text new tag names
  contactValues: string[]
  companyValues: string[]
}

const emptyForm: IdeaForm = {
  title: '',
  description: '',
  tagValues: [],
  contactValues: [],
  companyValues: [],
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function IdeaListPage() {
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<IdeaSort>('relevance')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>('active')
  // Card (default) vs. compact List view; persisted so the choice sticks.
  const [view, setView] = useState<'card' | 'list'>(
    () => (localStorage.getItem('ideas_view') === 'list' ? 'list' : 'card')
  )
  useEffect(() => { localStorage.setItem('ideas_view', view) }, [view])
  // Click-to-expand: collapsed cards/rows clamp the description to 4 lines; expanded
  // shows the full markdown (incl. pasted screenshots) without opening the editor.
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [highlightedId, setHighlightedId] = useState<number | null>(null)

  // Deep-link: /ideas?id=123 expands + scrolls to that idea.
  const [searchParams, setSearchParams] = useSearchParams()
  const highlightIdParam = searchParams.get('id')
  const highlightId = useRef<number | null>(highlightIdParam ? parseInt(highlightIdParam, 10) || null : null)
  // Once ideas load, expand the deep-linked idea and scroll to it.
  useEffect(() => {
    const hId = highlightId.current
    if (!hId || loading || ideas.length === 0) return
    // If the idea is archived but we're viewing active-only, widen the filter.
    const found = ideas.find((i) => i.id === hId)
    if (!found) {
      if (archiveFilter === 'active') {
        setArchiveFilter('all') // triggers a reload
        return
      }
      return // truly not found
    }
    highlightId.current = null // consume — only auto-expand once
    
    // Auto-expand the deep-linked idea
    setExpandedId(hId)
    setHighlightedId(hId)
    
    // Clear the ?id= param so refreshing doesn't re-trigger
    setSearchParams((prev) => { prev.delete('id'); return prev }, { replace: true })
    // Scroll after React renders the expanded card
    requestAnimationFrame(() => {
      document.getElementById(`idea-${hId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideas, loading, archiveFilter, setSearchParams])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [allContacts, setAllContacts] = useState<{ id: number; name: string }[]>([])
  const [allCompanies, setAllCompanies] = useState<{ id: number; name: string }[]>([])
  // App-wide tags (shared with contacts/companies/meetings) for autocomplete
  const [allTags, setAllTags] = useState<{ id: number; name: string }[]>([])
  // Favorite orgs (reserved "Favorite" CompanyTag) for one-click add
  const [companyFavorites, setCompanyFavorites] = useState<{ id: number; name: string }[]>([])

  const [form, setForm] = useState<IdeaForm>(emptyForm)
  // The form as last loaded/finalized — drives the dirty/Revert affordance.
  const [originalForm, setOriginalForm] = useState<IdeaForm>(emptyForm)

  // ── Autosave (mirrors the meeting Quick Log) ──────────────────
  // `savedId` is the live idea id: = editId in edit mode, or the id minted by the
  // first create POST in "New Idea" mode. Everything routes through one serialized
  // save chain so a debounced autosave can never double-create or PUT before POST.
  const [savedId, setSavedId] = useState<number | null>(null)
  const savedIdRef = useRef<number | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const lastSnapshotRef = useRef<string | null>(null)        // JSON of the last autosaved body (skips no-ops)
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())
  const savedFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recordExists = savedId !== null

  const loadIdeas = useCallback(() => {
    setLoading(true)
    const qs = archiveFilter === 'active' ? '' : archiveFilter === 'archived' ? '?archived=only' : '?archived=all'
    api
      .get<Idea[]>(`/ideas${qs}`)
      .then(setIdeas)
      .catch((err) => toast.error(err.message || 'Failed to load ideas'))
      .finally(() => setLoading(false))
  }, [archiveFilter])

  useEffect(() => {
    loadIdeas()
  }, [loadIdeas])

  useEffect(() => {
    api.get<{ id: number; name: string }[]>('/contacts/names').then(
      (data) => setAllContacts(data)
    ).catch(() => {})
    api.get<Company[]>('/companies').then((data) =>
      setAllCompanies(data.map((c) => ({ id: c.id, name: c.name })))
    ).catch(() => {})
    api.get<{ id: number; name: string }[]>('/companies/favorites').then(
      setCompanyFavorites
    ).catch(() => {})
    api.get<Tag[]>('/tags').then(
      (data) => setAllTags(data.map((t) => ({ id: t.id, name: t.name })))
    ).catch(() => {})
  }, [])

  async function toggleArchive(idea: Idea) {
    try {
      await api.patch(`/ideas/${idea.id}/archive`, { archived: !idea.archived })
      toast.success(idea.archived ? 'Idea unarchived' : 'Idea archived')
      loadIdeas()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update idea')
    }
  }

  const searchTerms = search.trim().split(/\s+/).filter(Boolean)
  const filteredIdeas = ideas
    .map((idea) => ({ idea, score: searchTerms.length ? ideaMatchScore(idea, searchTerms, caseSensitive) : 0 }))
    .filter((x) => searchTerms.length === 0 || x.score >= 0)
    .sort((a, b) => {
      const newest = (x: typeof a) => new Date(x.idea.createdAt).getTime()
      switch (sort) {
        case 'relevance':
          // Best match first; fall back to newest within equal scores / no query.
          if (searchTerms.length && b.score !== a.score) return b.score - a.score
          return newest(b) - newest(a)
        case 'newest':
          return newest(b) - newest(a)
        case 'oldest':
          return newest(a) - newest(b)
        case 'alpha':
          return a.idea.title.localeCompare(b.idea.title)
      }
    })
    .map((x) => x.idea)

  // Highlight matched terms in plain-text fields (title/tags/related names)…
  const hl = (text: string) =>
    searchTerms.length
      ? <HighlightedText text={text} terms={searchTerms} caseSensitive={caseSensitive} />
      : text

  // …and inside the rendered markdown description (rehype plugin wraps matches in
  // <mark>), so search terms are highlighted anywhere in the card.
  const descRehype = searchTerms.length ? [highlightRehype(searchTerms, caseSensitive)] : undefined

  // Reset the shared autosave bookkeeping each time the dialog opens. `id` is the
  // existing record (edit mode) or null (a new idea, created by the first autosave).
  function resetAutosave(id: number | null, seedSnapshot: string | null) {
    setSavedId(id)
    savedIdRef.current = id
    setSaveStatus('idle')
    lastSnapshotRef.current = seedSnapshot
    saveChainRef.current = Promise.resolve()
  }

  function openNew() {
    setEditId(null)
    setForm(emptyForm)
    setOriginalForm(emptyForm)
    resetAutosave(null, null)
    setDialogOpen(true)
  }

  function openEdit(idea: Idea) {
    setEditId(idea.id)
    const loadedForm: IdeaForm = {
      title: idea.title,
      description: idea.description || '',
      tagValues: idea.tagLinks?.map((t) => t.tag.id.toString()) || [],
      contactValues: idea.contacts?.map((ic) => ic.contact.id.toString()) || [],
      companyValues: idea.companies?.map((ic) => ic.company.id.toString()) || [],
    }
    setForm(loadedForm)
    setOriginalForm(loadedForm)
    // Seed the snapshot from the loaded record so opening an edit doesn't fire an
    // immediate no-op PUT.
    resetAutosave(idea.id, autosaveSnapshot(loadedForm))
    setDialogOpen(true)
  }

  const companyNameOf = (val: string) =>
    allCompanies.find((c) => c.id.toString() === val)?.name || val

  const quickAddCompanyFavorites = companyFavorites.filter(
    (f) => !form.companyValues.includes(f.id.toString())
  )

  async function toggleCompanyFavorite(companyIdNum: number, name: string) {
    const isFav = companyFavorites.some((f) => f.id === companyIdNum)
    // Optimistic update; revert on failure
    setCompanyFavorites((prev) =>
      isFav
        ? prev.filter((f) => f.id !== companyIdNum)
        : [...prev, { id: companyIdNum, name }].sort((a, b) => a.name.localeCompare(b.name))
    )
    try {
      await api.patch(`/companies/${companyIdNum}/favorite`, { favorite: !isFav })
    } catch {
      toast.error('Failed to update favorite')
      api.get<{ id: number; name: string }[]>('/companies/favorites').then(setCompanyFavorites).catch(() => {})
    }
  }

  // Resolve tag combobox values (ids or free-text names) into Tag ids, creating
  // any new ones. Unlike contacts/companies, tags ARE created during autosave —
  // building a reusable, shared tag vocabulary is the whole point. Idempotent:
  // checks the loaded tag list by name before POSTing, so a debounce won't dup.
  const resolveTagIds = useCallback(async (values: string[]): Promise<number[]> => {
    const ids: number[] = []
    for (const val of values) {
      if (/^\d+$/.test(val)) { ids.push(parseInt(val)); continue }
      const name = val.trim()
      if (!name) continue
      const existing = allTags.find((t) => t.name.toLowerCase() === name.toLowerCase())
      if (existing) { ids.push(existing.id); continue }
      try {
        const created = await api.post<Tag>('/tags', { name })
        ids.push(created.id)
        setAllTags((prev) => (prev.some((t) => t.id === created.id) ? prev : [...prev, { id: created.id, name: created.name }]))
      } catch {
        // 409 race or failure: re-fetch and match by name
        const all = await api.get<Tag[]>('/tags').catch(() => [] as Tag[])
        const found = all.find((t) => t.name.toLowerCase() === name.toLowerCase())
        if (found) ids.push(found.id)
      }
    }
    return ids
  }, [allTags])

  // Existing (already-saved) contact/company ids in the combobox values. Free-text
  // names (non-numeric) are NOT autosaved — they're resolved into real records only
  // on finalize (Done), exactly like the meeting Quick Log.
  function existingIds(values: string[]): number[] {
    return values.filter((v) => /^\d+$/.test(v)).map(Number)
  }

  // The autosave body: scalars + already-resolved ids. Tags ARE created here
  // (resolveTagIds) — building a shared tag vocabulary is the point — so they ride
  // autosave; new contacts/companies do not.
  function buildAutosaveBody(data: IdeaForm, tagIds: number[]) {
    return {
      title: data.title.trim(),
      description: data.description.trim() || null,
      contactIds: existingIds(data.contactValues),
      companyIds: existingIds(data.companyValues),
      tagIds,
    }
  }

  // A cheap signature of everything autosave persists — skips redundant saves and
  // seeds the edit snapshot. Uses raw tagValues (resolved lazily) so a new tag name
  // still registers as a change.
  function autosaveSnapshot(data: IdeaForm): string {
    return JSON.stringify({
      title: data.title.trim(),
      description: data.description.trim(),
      contactIds: existingIds(data.contactValues),
      companyIds: existingIds(data.companyValues),
      tagValues: data.tagValues,
    })
  }

  // Serialize every save so the first POST sets the id before any later PUT runs —
  // never two POSTs, never a PUT before the POST.
  function enqueueSave(fn: () => Promise<void>): Promise<void> {
    const next = saveChainRef.current.then(fn, fn)
    saveChainRef.current = next
    return next
  }

  function flashSaved() {
    setSaveStatus('saved')
    if (savedFlashRef.current) clearTimeout(savedFlashRef.current)
    savedFlashRef.current = setTimeout(() => setSaveStatus('idle'), 2500)
  }

  // POST on first save (minting the id), PUT thereafter. Re-checks the snapshot at
  // run time so a queued save that's been superseded is a no-op.
  async function persistAutosave(data: IdeaForm, snapshot: string) {
    if (snapshot === lastSnapshotRef.current) return
    setSaveStatus('saving')
    try {
      const tagIds = await resolveTagIds(data.tagValues)
      const body = buildAutosaveBody(data, tagIds)
      const isCreate = savedIdRef.current === null
      if (isCreate) {
        const created = await api.post<Idea>('/ideas', body)
        savedIdRef.current = created.id
        setSavedId(created.id)
      } else {
        await api.put(`/ideas/${savedIdRef.current}`, body)
      }
      lastSnapshotRef.current = snapshot
      flashSaved()
      // Surface a brand-new idea in the list behind the dialog (later PUTs don't
      // need a reload — the card refreshes on close).
      if (isCreate) loadIdeas()
    } catch {
      setSaveStatus('error')
    }
  }

  // Debounced autosave (~1.5s after the last edit). Requires a title (the only
  // required field) so an empty "New Idea" never auto-creates.
  useEffect(() => {
    if (!dialogOpen) return
    if (!form.title.trim()) return
    const snapshot = autosaveSnapshot(form)
    if (snapshot === lastSnapshotRef.current) return
    const timer = setTimeout(() => {
      void enqueueSave(() => persistAutosave(form, snapshot))
    }, 1500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, form])

  useEffect(() => () => { if (savedFlashRef.current) clearTimeout(savedFlashRef.current) }, [])

  // Dirty = the form differs from its loaded/finalized state (drives Revert).
  const isDirty = JSON.stringify(form) !== JSON.stringify(originalForm)

  // Revert the form to its loaded state and persist that, so the server matches the UI.
  function revertForm() {
    setForm(originalForm)
    if (savedIdRef.current !== null) {
      void enqueueSave(() => persistAutosave(originalForm, autosaveSnapshot(originalForm)))
    }
  }

  // Finalize ("Done" / "Create"): resolves free-text contacts/companies into real
  // records, persists the full payload, then closes. Routed through the save chain
  // so it can't race an in-flight autosave; reuses the autosaved id when present.
  async function handleSubmit() {
    if (!form.title.trim()) {
      toast.error('Title is required')
      return
    }
    setSaving(true)
    setSaveStatus('saving')
    try {
      await enqueueSave(async () => {
        // Resolve contact values — create new contacts for free-text names.
        const contactIds: number[] = []
        for (const val of form.contactValues) {
          const existingContact = allContacts.find((c) => c.id.toString() === val)
          if (existingContact) {
            contactIds.push(existingContact.id)
          } else if (val.trim()) {
            try {
              const newContact = await api.post<Contact>('/contacts', {
                name: val.trim(),
                status: 'CONNECTED',
                ecosystem: 'NETWORK',
              })
              contactIds.push(newContact.id)
              setAllContacts((prev) => [...prev, { id: newContact.id, name: newContact.name }])
            } catch {
              // Skip if creation fails
            }
          }
        }

        // Resolve company values — create new companies for free-text names.
        const companyIds: number[] = []
        for (const val of form.companyValues) {
          const existingCompany = allCompanies.find((c) => c.id.toString() === val)
          if (existingCompany) {
            companyIds.push(existingCompany.id)
          } else if (val.trim()) {
            try {
              // Resolve server-side (consults prior merge decisions) rather than a
              // bare create, so a name already merged into another org attaches to
              // the existing one instead of creating a fresh duplicate.
              const resolved = await api.post<Company & { created: boolean }>('/companies/resolve', {
                name: val.trim(),
                status: 'CONNECTED',
              })
              companyIds.push(resolved.id)
              setAllCompanies((prev) => (prev.some((c) => c.id === resolved.id) ? prev : [...prev, { id: resolved.id, name: resolved.name }]))
            } catch {
              // Skip if creation fails
            }
          }
        }

        const tagIds = await resolveTagIds(form.tagValues)

        const payload = {
          title: form.title.trim(),
          description: form.description.trim() || null,
          contactIds,
          companyIds,
          tagIds,
        }
        if (savedIdRef.current !== null) {
          await api.put(`/ideas/${savedIdRef.current}`, payload)
        } else {
          const created = await api.post<Idea>('/ideas', payload)
          savedIdRef.current = created.id
          setSavedId(created.id)
        }
        // Mark the finalized state as saved so a trailing autosave is a no-op.
        lastSnapshotRef.current = autosaveSnapshot(form)
      })
      toast.success(editId !== null || recordExists ? 'Idea saved' : 'Idea created')
      setDialogOpen(false)
      loadIdeas()
    } catch (err) {
      setSaveStatus('error')
      toast.error(err instanceof Error ? err.message : 'Failed to save idea')
    } finally {
      setSaving(false)
    }
  }

  // Discard the in-editor idea entirely (an autosaved new idea, or an existing one).
  async function discardCurrentIdea() {
    if (savedIdRef.current === null) return
    if (!window.confirm('Delete this idea? This cannot be undone.')) return
    setDeleting(true)
    try {
      await api.delete(`/ideas/${savedIdRef.current}`)
      toast.success('Idea deleted')
      setDialogOpen(false)
      loadIdeas()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  // Closing via Cancel / X / Escape keeps whatever autosave already persisted;
  // refresh the list so the card reflects the latest autosaved state.
  function handleDialogOpenChange(next: boolean) {
    if (!next) loadIdeas()
    setDialogOpen(next)
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      await api.delete(`/ideas/${deleteId}`)
      toast.success('Idea deleted')
      setDeleteId(null)
      loadIdeas()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  // Shared bits between the card and list views ─────────────────
  const renderIdeaActions = (idea: Idea) => (
    <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 sm:h-7 sm:w-7"
        title={idea.archived ? 'Unarchive' : 'Archive'}
        onClick={() => toggleArchive(idea)}
      >
        {idea.archived
          ? <ArchiveRestore className="h-4 w-4 sm:h-3 sm:w-3" />
          : <Archive className="h-4 w-4 sm:h-3 sm:w-3" />}
      </Button>
      <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-7 sm:w-7" title="Edit" onClick={() => openEdit(idea)}>
        <Pencil className="h-4 w-4 sm:h-3 sm:w-3" />
      </Button>
      <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-7 sm:w-7" title="Delete" onClick={() => setDeleteId(idea.id)}>
        <Trash2 className="h-4 w-4 sm:h-3 sm:w-3" />
      </Button>
    </div>
  )

  const renderTagChips = (idea: Idea) =>
    idea.tagLinks?.length
      ? idea.tagLinks.map((t) => (
          <span key={t.tag.id} className="inline-block rounded bg-muted px-1.5 py-0.5 text-xs">
            {hl(t.tag.name)}
          </span>
        ))
      : null

  const renderRelatedChips = (idea: Idea) => (
    <>
      {idea.contacts?.map((ic) => (
        <span key={`c-${ic.contact.id}`} className="inline-block rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200">
          {hl(ic.contact.name)}
        </span>
      ))}
      {idea.companies?.map((ic) => (
        <span key={`co-${ic.company.id}`} className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200">
          {hl(ic.company.name)}
        </span>
      ))}
    </>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ideas</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? '' : `${filteredIdeas.length} of ${ideas.length} idea${ideas.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5">
            <Button
              variant={view === 'card' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 gap-1 px-2"
              onClick={() => setView('card')}
              title="Card view"
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Cards</span>
            </Button>
            <Button
              variant={view === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 gap-1 px-2"
              onClick={() => setView('list')}
              title="List view"
            >
              <ListIcon className="h-4 w-4" />
              <span className="hidden sm:inline">List</span>
            </Button>
          </div>
          <Button onClick={openNew} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            New Idea
          </Button>
        </div>
      </div>

      {/* Search + sort + match-case (Ideas only) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search ideas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`pl-8 ${search ? 'pr-9' : ''}`}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <button
            type="button"
            onClick={() => setCaseSensitive((v) => !v)}
            title={caseSensitive ? 'Match case: on' : 'Match case: off'}
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors',
              caseSensitive
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-background text-muted-foreground hover:bg-muted'
            )}
          >
            <CaseSensitive className="h-4 w-4" />
          </button>
          <Select value={sort} onValueChange={(v) => setSort(v as IdeaSort)}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IDEA_SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Archive lozenges — archived ideas only appear when opted into here */}
      <div className="flex flex-wrap items-center gap-2">
        {ARCHIVE_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setArchiveFilter(f.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              archiveFilter === f.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-background text-muted-foreground hover:bg-muted'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Ideas grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filteredIdeas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Lightbulb className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              {ideas.length === 0 ? 'No ideas yet.' : 'No matching ideas.'}
            </p>
            {ideas.length === 0 && (
              <Button variant="outline" className="mt-4" onClick={openNew}>
                Add your first idea
              </Button>
            )}
          </CardContent>
        </Card>
      ) : view === 'list' ? (
        /* Compact list view — dense rows; click a row to expand its description */
        <div className="overflow-hidden rounded-md border">
          {filteredIdeas.map((idea, idx) => {
            const expanded = expandedId === idea.id
            const imageCount = (idea.description?.match(/!\[[^\]]*\]\(/g) || []).length
            return (
              <div
                key={idea.id}
                id={`idea-${idea.id}`}
                className={cn(
                  'cursor-pointer px-3 py-2 transition-colors hover:bg-muted/40',
                  idx > 0 && 'border-t',
                  idea.archived && 'opacity-70',
                  highlightedId === idea.id && 'bg-primary/5'
                )}
                onClick={() => {
                  setExpandedId(expanded ? null : idea.id)
                  if (highlightedId) setHighlightedId(null)
                }}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium leading-tight">{hl(idea.title)}</span>
                      {renderTagChips(idea)}
                    </div>
                    {(idea.contacts?.length || idea.companies?.length) ? (
                      <div className="mt-1 flex flex-wrap gap-1">{renderRelatedChips(idea)}</div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden whitespace-nowrap text-xs text-muted-foreground sm:inline">
                      {formatDate(idea.createdAt)}
                    </span>
                    {renderIdeaActions(idea)}
                  </div>
                </div>
                {expanded ? (
                  <div className="mt-2 border-t pt-2" onClick={(e) => e.stopPropagation()}>
                    {idea.description ? (
                      <div className="prep-note-markdown text-sm text-muted-foreground">
                        <ReactMarkdown rehypePlugins={descRehype}>{idea.description}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm italic text-muted-foreground/50">No description</p>
                    )}
                  </div>
                ) : imageCount > 0 ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground/70">
                    <ImageIcon className="h-3 w-3 shrink-0" />
                    {imageCount} screenshot{imageCount !== 1 ? 's' : ''} — click to view
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredIdeas.map((idea) => {
            const expanded = expandedId === idea.id
            // Count pasted screenshots / markdown images so a collapsed card can
            // hint at them without letting them stretch its height.
            const imageCount = (idea.description?.match(/!\[[^\]]*\]\(/g) || []).length
            return (
            <Card
              key={idea.id}
              id={`idea-${idea.id}`}
              className={cn(
                'flex cursor-pointer flex-col gap-2 py-3 transition-colors hover:border-primary/40',
                idea.archived && 'opacity-70',
                highlightedId === idea.id && 'border-primary shadow-sm'
              )}
              onClick={() => {
                setExpandedId(expanded ? null : idea.id)
                if (highlightedId) setHighlightedId(null)
              }}
            >
              <CardHeader className="gap-1 pb-0">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-tight">{hl(idea.title)}</CardTitle>
                  {renderIdeaActions(idea)}
                </div>
                {idea.tagLinks && idea.tagLinks.length > 0 && (
                  <CardDescription className="flex flex-wrap gap-1 text-xs">
                    {renderTagChips(idea)}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex-1">
                {idea.description ? (
                  // Collapsed: clamp text to 4 lines AND hide images so screenshots
                  // never stretch the card. Expanded shows the full markdown + images.
                  <div className={cn('prep-note-markdown text-sm text-muted-foreground', !expanded && 'line-clamp-4 [&_img]:hidden')}>
                    <ReactMarkdown rehypePlugins={descRehype}>{idea.description}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground/50 italic">No description</p>
                )}
                {!expanded && imageCount > 0 && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground/70">
                    <ImageIcon className="h-3 w-3 shrink-0" />
                    {imageCount} screenshot{imageCount !== 1 ? 's' : ''} — click to view
                  </p>
                )}
                {((idea.contacts && idea.contacts.length > 0) || (idea.companies && idea.companies.length > 0)) && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {renderRelatedChips(idea)}
                  </div>
                )}
              </CardContent>
              <div className="px-6">
                <p className="text-xs text-muted-foreground">{formatDate(idea.createdAt)}</p>
              </div>
            </Card>
            )
          })}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        {/* Desktop: drag the bottom-right corner to widen/narrow this free-text dialog. */}
        <DialogContent
          className="sm:w-[28rem] sm:min-w-[22rem] sm:max-w-[92vw] sm:max-h-[85vh] sm:resize sm:overflow-auto"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <div className="flex items-center justify-between gap-3 pr-6">
              <DialogTitle>{editId ? 'Edit Idea' : 'New Idea'}</DialogTitle>
              <SaveStatusIndicator status={saveStatus} />
            </div>
            <DialogDescription>
              {editId ? 'Update your idea — changes autosave.' : 'Capture a thought — it autosaves as you type.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="What's the idea?"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <MarkdownTextarea
                id="description"
                value={form.description}
                onChange={(v) => setForm((p) => ({ ...p, description: v }))}
                placeholder="More details..."
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              <MultiCombobox
                options={allTags.map((t) => ({ value: t.id.toString(), label: t.name }))}
                values={form.tagValues}
                onChange={(vals) => setForm((p) => ({ ...p, tagValues: vals }))}
                placeholder="Search or type a tag..."
                searchPlaceholder="Search or type a new tag..."
                allowFreeText={true}
              />
            </div>
            <div className="space-y-2">
              <Label>Related Contacts</Label>
              <MultiCombobox
                options={allContacts.map((c) => ({ value: c.id.toString(), label: c.name }))}
                values={form.contactValues}
                onChange={(vals) => setForm((p) => ({ ...p, contactValues: vals }))}
                placeholder="Search or type new name..."
                searchPlaceholder="Search contacts..."
                allowFreeText={true}
              />
            </div>
            <div className="space-y-2">
              <Label>Related Companies</Label>
              {quickAddCompanyFavorites.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {quickAddCompanyFavorites.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() =>
                        setForm((p) => ({ ...p, companyValues: [...p.companyValues, f.id.toString()] }))
                      }
                      className="flex items-center gap-1 rounded-full border bg-amber-50 px-2 py-0.5 text-xs text-amber-900 hover:bg-amber-100"
                      title="Add to related companies"
                    >
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {f.name}
                      <Plus className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              )}
              <MultiCombobox
                options={allCompanies.map((c) => ({ value: c.id.toString(), label: c.name }))}
                values={form.companyValues}
                onChange={(vals) => setForm((p) => ({ ...p, companyValues: vals }))}
                placeholder="Search or type new name..."
                searchPlaceholder="Search companies..."
                allowFreeText={true}
              />
              {form.companyValues.map((val) => {
                const isExisting = /^\d+$/.test(val)
                if (!isExisting) return null
                const isFav = companyFavorites.some((f) => f.id === Number(val))
                return (
                  <div key={val} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleCompanyFavorite(Number(val), companyNameOf(val))}
                      className="shrink-0"
                      title={isFav ? 'Remove from favorites' : 'Mark as favorite (quick-add elsewhere)'}
                    >
                      <Star
                        className={cn(
                          'h-3.5 w-3.5',
                          isFav ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground hover:text-amber-400'
                        )}
                      />
                    </button>
                    <span className="truncate text-xs text-muted-foreground" title={companyNameOf(val)}>
                      {companyNameOf(val)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {recordExists ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:mr-auto"
                onClick={discardCurrentIdea}
                disabled={deleting || saving}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Delete this idea
              </Button>
            ) : (
              <span className="hidden sm:block" />
            )}
            <div className="flex justify-end gap-2">
              {editId !== null && isDirty && (
                <Button variant="outline" onClick={revertForm}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Revert
                </Button>
              )}
              <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>
                {recordExists ? 'Close' : 'Cancel'}
              </Button>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? 'Saving…' : recordExists ? 'Done' : 'Create'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Idea</DialogTitle>
            <DialogDescription>
              This will permanently delete this idea. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
