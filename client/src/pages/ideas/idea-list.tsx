import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { Idea, Contact, Company } from '@/lib/types'
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
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Lightbulb, Search, Loader2, RotateCcw, Star, CaseSensitive, Archive, ArchiveRestore, Image as ImageIcon } from 'lucide-react'
import { useAutoSave } from '@/hooks/use-auto-save'
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
  const tags = norm(idea.tags || '')
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
  tags: string
  contactValues: string[]
  companyValues: string[]
}

const emptyForm: IdeaForm = {
  title: '',
  description: '',
  tags: '',
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
  // Click-to-expand: collapsed cards clamp the description to 4 lines; expanded
  // shows the full markdown (incl. pasted screenshots) without opening the editor.
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [allContacts, setAllContacts] = useState<{ id: number; name: string }[]>([])
  const [allCompanies, setAllCompanies] = useState<{ id: number; name: string }[]>([])
  // Favorite orgs (reserved "Favorite" CompanyTag) for one-click add
  const [companyFavorites, setCompanyFavorites] = useState<{ id: number; name: string }[]>([])

  const [form, setForm] = useState<IdeaForm>(emptyForm)
  const [originalForm, setOriginalForm] = useState<IdeaForm | null>(null)

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

  // Highlight matched terms in plain-text fields (title/tags/related names); the
  // markdown description is left un-highlighted (same precedent as Meetings).
  const hl = (text: string) =>
    searchTerms.length
      ? <HighlightedText text={text} terms={searchTerms} caseSensitive={caseSensitive} />
      : text

  function openNew() {
    setEditId(null)
    setForm(emptyForm)
    setOriginalForm(null)
    setDialogOpen(true)
  }

  function openEdit(idea: Idea) {
    setEditId(idea.id)
    const loadedForm: IdeaForm = {
      title: idea.title,
      description: idea.description || '',
      tags: idea.tags || '',
      contactValues: idea.contacts?.map((ic) => ic.contact.id.toString()) || [],
      companyValues: idea.companies?.map((ic) => ic.company.id.toString()) || [],
    }
    setForm(loadedForm)
    setOriginalForm(loadedForm)
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

  // Auto-save handler - only saves existing contacts/companies (not new entries)
  const handleAutoSave = useCallback(async (data: IdeaForm) => {
    if (!editId) return

    // Only include existing contact/company IDs (not new names)
    const existingContactIds = data.contactValues
      .filter((val) => allContacts.some((c) => c.id.toString() === val))
      .map((val) => parseInt(val))
    const existingCompanyIds = data.companyValues
      .filter((val) => allCompanies.some((c) => c.id.toString() === val))
      .map((val) => parseInt(val))

    const payload = {
      title: data.title.trim(),
      description: data.description.trim() || null,
      tags: data.tags.trim() || null,
      contactIds: existingContactIds,
      companyIds: existingCompanyIds,
    }
    await api.put(`/ideas/${editId}`, payload)
  }, [editId, allContacts, allCompanies])

  const autoSave = useAutoSave({
    data: form,
    originalData: originalForm,
    onSave: handleAutoSave,
    validate: (data) => data.title.trim().length > 0,
    enabled: editId !== null,
    onRevert: setForm,
  })

  async function handleSubmit() {
    if (!form.title.trim()) {
      toast.error('Title is required')
      return
    }
    setSaving(true)
    try {
      // Process contact values - create new contacts if needed
      const contactIds: number[] = []
      for (const val of form.contactValues) {
        const existingContact = allContacts.find((c) => c.id.toString() === val)
        if (existingContact) {
          contactIds.push(existingContact.id)
        } else if (val.trim()) {
          // Create new contact
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

      // Process company values - create new companies if needed
      const companyIds: number[] = []
      for (const val of form.companyValues) {
        const existingCompany = allCompanies.find((c) => c.id.toString() === val)
        if (existingCompany) {
          companyIds.push(existingCompany.id)
        } else if (val.trim()) {
          // Create new company
          try {
            const newCompany = await api.post<Company>('/companies', {
              name: val.trim(),
              status: 'CONNECTED',
            })
            companyIds.push(newCompany.id)
            setAllCompanies((prev) => [...prev, { id: newCompany.id, name: newCompany.name }])
          } catch {
            // Skip if creation fails
          }
        }
      }

      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        tags: form.tags.trim() || null,
        contactIds,
        companyIds,
      }
      if (editId) {
        await api.put(`/ideas/${editId}`, payload)
        toast.success('Idea updated')
      } else {
        await api.post('/ideas', payload)
        toast.success('Idea created')
      }
      setDialogOpen(false)
      loadIdeas()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save idea')
    } finally {
      setSaving(false)
    }
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ideas</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? '' : `${filteredIdeas.length} of ${ideas.length} idea${ideas.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Button onClick={openNew} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          New Idea
        </Button>
      </div>

      {/* Search + sort + match-case (Ideas only) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search ideas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
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
              className={cn(
                'flex cursor-pointer flex-col transition-colors hover:border-primary/40',
                idea.archived && 'opacity-70'
              )}
              onClick={() => setExpandedId(expanded ? null : idea.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-tight">{hl(idea.title)}</CardTitle>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 sm:h-7 sm:w-7"
                      title={idea.archived ? 'Unarchive' : 'Archive'}
                      onClick={(e) => { e.stopPropagation(); toggleArchive(idea) }}
                    >
                      {idea.archived
                        ? <ArchiveRestore className="h-4 w-4 sm:h-3 sm:w-3" />
                        : <Archive className="h-4 w-4 sm:h-3 sm:w-3" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 sm:h-7 sm:w-7"
                      title="Edit"
                      onClick={(e) => { e.stopPropagation(); openEdit(idea) }}
                    >
                      <Pencil className="h-4 w-4 sm:h-3 sm:w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 sm:h-7 sm:w-7"
                      title="Delete"
                      onClick={(e) => { e.stopPropagation(); setDeleteId(idea.id) }}
                    >
                      <Trash2 className="h-4 w-4 sm:h-3 sm:w-3" />
                    </Button>
                  </div>
                </div>
                {idea.tags && (
                  <CardDescription className="text-xs">
                    {idea.tags.split(',').map((t) => t.trim()).filter(Boolean).map((tag, i) => (
                      <span key={i} className="inline-block bg-muted rounded px-1.5 py-0.5 mr-1 mb-1">
                        {hl(tag)}
                      </span>
                    ))}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex-1">
                {idea.description ? (
                  // Collapsed: clamp text to 4 lines AND hide images so screenshots
                  // never stretch the card. Expanded shows the full markdown + images.
                  <div className={cn('prep-note-markdown text-sm text-muted-foreground', !expanded && 'line-clamp-4 [&_img]:hidden')}>
                    <ReactMarkdown>{idea.description}</ReactMarkdown>
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
                  <div className="flex flex-wrap gap-1 mt-2">
                    {idea.contacts?.map((ic) => (
                      <span key={`c-${ic.contact.id}`} className="inline-block bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded px-1.5 py-0.5 text-xs">
                        {hl(ic.contact.name)}
                      </span>
                    ))}
                    {idea.companies?.map((ic) => (
                      <span key={`co-${ic.company.id}`} className="inline-block bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 rounded px-1.5 py-0.5 text-xs">
                        {hl(ic.company.name)}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
              <div className="px-6 pb-4">
                <p className="text-xs text-muted-foreground">{formatDate(idea.createdAt)}</p>
              </div>
            </Card>
            )
          })}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        {/* Desktop: drag the bottom-right corner to widen/narrow this free-text dialog. */}
        <DialogContent
          className="sm:w-[28rem] sm:min-w-[22rem] sm:max-w-[92vw] sm:max-h-[85vh] sm:resize sm:overflow-auto"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>{editId ? 'Edit Idea' : 'New Idea'}</DialogTitle>
              {editId && <SaveStatusIndicator status={autoSave.status} />}
            </div>
            <DialogDescription>
              {editId ? 'Update your idea.' : 'Capture a thought, inspiration, or note.'}
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
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                value={form.tags}
                onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
                placeholder="Comma-separated tags (e.g. networking, research)"
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
          <DialogFooter>
            {editId ? (
              <>
                {autoSave.isDirty && (
                  <Button variant="outline" onClick={autoSave.revert}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Revert
                  </Button>
                )}
                <Button onClick={() => setDialogOpen(false)}>Done</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={saving}>
                  {saving ? 'Saving...' : 'Create'}
                </Button>
              </>
            )}
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
