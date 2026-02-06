import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { Idea, Contact, Company } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Lightbulb, Search, Loader2, RotateCcw } from 'lucide-react'
import { useAutoSave } from '@/hooks/use-auto-save'
import { SaveStatusIndicator } from '@/components/save-status'

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
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [allContacts, setAllContacts] = useState<{ id: number; name: string }[]>([])
  const [allCompanies, setAllCompanies] = useState<{ id: number; name: string }[]>([])

  const [form, setForm] = useState<IdeaForm>(emptyForm)
  const [originalForm, setOriginalForm] = useState<IdeaForm | null>(null)

  function loadIdeas() {
    api
      .get<Idea[]>('/ideas')
      .then(setIdeas)
      .catch((err) => toast.error(err.message || 'Failed to load ideas'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadIdeas()
    api.get<{ data: Contact[] } | Contact[]>('/contacts?limit=200').then((res) => {
      const data = Array.isArray(res) ? res : res.data
      setAllContacts(data.map((c) => ({ id: c.id, name: c.name })))
    }).catch(() => {})
    api.get<Company[]>('/companies').then((data) =>
      setAllCompanies(data.map((c) => ({ id: c.id, name: c.name })))
    ).catch(() => {})
  }, [])

  const filteredIdeas = ideas.filter((idea) => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      idea.title.toLowerCase().includes(s) ||
      (idea.description?.toLowerCase().includes(s) ?? false) ||
      (idea.tags?.toLowerCase().includes(s) ?? false)
    )
  })

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
              ecosystem: 'ROLODEX',
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

      {/* Search */}
      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search ideas..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
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
          {filteredIdeas.map((idea) => (
            <Card key={idea.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-tight">{idea.title}</CardTitle>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 sm:h-7 sm:w-7"
                      onClick={() => openEdit(idea)}
                    >
                      <Pencil className="h-4 w-4 sm:h-3 sm:w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 sm:h-7 sm:w-7"
                      onClick={() => setDeleteId(idea.id)}
                    >
                      <Trash2 className="h-4 w-4 sm:h-3 sm:w-3" />
                    </Button>
                  </div>
                </div>
                {idea.tags && (
                  <CardDescription className="text-xs">
                    {idea.tags.split(',').map((t) => t.trim()).filter(Boolean).map((tag, i) => (
                      <span key={i} className="inline-block bg-muted rounded px-1.5 py-0.5 mr-1 mb-1">
                        {tag}
                      </span>
                    ))}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex-1">
                {idea.description ? (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
                    {idea.description}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground/50 italic">No description</p>
                )}
                {((idea.contacts && idea.contacts.length > 0) || (idea.companies && idea.companies.length > 0)) && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {idea.contacts?.map((ic) => (
                      <span key={`c-${ic.contact.id}`} className="inline-block bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded px-1.5 py-0.5 text-xs">
                        {ic.contact.name}
                      </span>
                    ))}
                    {idea.companies?.map((ic) => (
                      <span key={`co-${ic.company.id}`} className="inline-block bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 rounded px-1.5 py-0.5 text-xs">
                        {ic.company.name}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
              <div className="px-6 pb-4">
                <p className="text-xs text-muted-foreground">{formatDate(idea.createdAt)}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
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
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
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
              <MultiCombobox
                options={allCompanies.map((c) => ({ value: c.id.toString(), label: c.name }))}
                values={form.companyValues}
                onChange={(vals) => setForm((p) => ({ ...p, companyValues: vals }))}
                placeholder="Search or type new name..."
                searchPlaceholder="Search companies..."
                allowFreeText={true}
              />
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
