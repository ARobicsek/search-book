import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { Idea } from '@/lib/types'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Lightbulb, Search } from 'lucide-react'

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

  const [form, setForm] = useState({
    title: '',
    description: '',
    tags: '',
  })

  function loadIdeas() {
    api
      .get<Idea[]>('/ideas')
      .then(setIdeas)
      .catch((err) => toast.error(err.message || 'Failed to load ideas'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadIdeas()
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
    setForm({ title: '', description: '', tags: '' })
    setDialogOpen(true)
  }

  function openEdit(idea: Idea) {
    setEditId(idea.id)
    setForm({
      title: idea.title,
      description: idea.description || '',
      tags: idea.tags || '',
    })
    setDialogOpen(true)
  }

  async function handleSubmit() {
    if (!form.title.trim()) {
      toast.error('Title is required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        tags: form.tags.trim() || null,
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ideas</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? '' : `${filteredIdeas.length} of ${ideas.length} idea${ideas.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          New Idea
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
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
        <p className="text-muted-foreground">Loading...</p>
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
                      className="h-7 w-7"
                      onClick={() => openEdit(idea)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setDeleteId(idea.id)}
                    >
                      <Trash2 className="h-3 w-3" />
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Idea' : 'New Idea'}</DialogTitle>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? 'Saving...' : editId ? 'Update' : 'Create'}
            </Button>
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
