import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { api } from '@/lib/api'
import type { Contact, Company, Action, Idea } from '@/lib/types'
import { toast } from 'sonner'
import { BookUser, Building2, ListTodo, Plus, Lightbulb, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ACTION_TYPE_OPTIONS, ACTION_PRIORITY_OPTIONS, ECOSYSTEM_OPTIONS } from '@/lib/types'

type Mode = 'search' | 'add-contact' | 'add-action' | 'add-note'

export function CommandPalette() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('search')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [companies, setCompanies] = useState<Company[]>([])

  // Quick-add form states
  const [contactName, setContactName] = useState('')
  const [contactEcosystem, setContactEcosystem] = useState('ROLODEX')
  const [actionTitle, setActionTitle] = useState('')
  const [actionType, setActionType] = useState('OTHER')
  const [actionPriority, setActionPriority] = useState('MEDIUM')
  const [actionDueDate, setActionDueDate] = useState('')
  const [noteTitle, setNoteTitle] = useState('')
  const [noteDescription, setNoteDescription] = useState('')

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const fetchData = useCallback(async () => {
    try {
      const [c, co] = await Promise.all([
        api.get<Contact[]>('/contacts'),
        api.get<Company[]>('/companies'),
      ])
      setContacts(c)
      setCompanies(co)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    if (open) {
      fetchData()
      setMode('search')
      resetForms()
    }
  }, [open, fetchData])

  function resetForms() {
    setContactName('')
    setContactEcosystem('ROLODEX')
    setActionTitle('')
    setActionType('OTHER')
    setActionPriority('MEDIUM')
    setActionDueDate('')
    setNoteTitle('')
    setNoteDescription('')
  }

  function close() {
    setOpen(false)
    setMode('search')
    resetForms()
  }

  async function handleAddContact() {
    if (!contactName.trim()) return
    setSaving(true)
    try {
      const created = await api.post<Contact>('/contacts', {
        name: contactName.trim(),
        ecosystem: contactEcosystem,
      })
      toast.success(`Created contact: ${created.name}`)
      close()
      navigate(`/contacts/${created.id}`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create contact'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddAction() {
    if (!actionTitle.trim()) return
    setSaving(true)
    try {
      const created = await api.post<Action>('/actions', {
        title: actionTitle.trim(),
        type: actionType,
        priority: actionPriority,
        dueDate: actionDueDate || null,
      })
      toast.success(`Created action: ${created.title}`)
      close()
      navigate(`/actions/${created.id}`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create action'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddNote() {
    if (!noteTitle.trim()) return
    setSaving(true)
    try {
      await api.post<Idea>('/ideas', {
        title: noteTitle.trim(),
        description: noteDescription.trim() || null,
      })
      toast.success(`Note saved: ${noteTitle.trim()}`)
      close()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save note'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  if (mode === 'add-contact') {
    return (
      <CommandDialog open={open} onOpenChange={setOpen}>
        <div className="p-4 space-y-4">
          <h3 className="text-lg font-semibold">Quick Add Contact</h3>
          <div className="space-y-2">
            <Label htmlFor="q-name">Name</Label>
            <Input
              id="q-name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Full name"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAddContact()}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="q-ecosystem">Ecosystem</Label>
            <Select value={contactEcosystem} onValueChange={setContactEcosystem}>
              <SelectTrigger id="q-ecosystem" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ECOSYSTEM_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAddContact} disabled={saving || !contactName.trim()}>
              {saving ? 'Creating...' : 'Create Contact'}
            </Button>
            <Button variant="outline" onClick={() => setMode('search')}>Back</Button>
          </div>
        </div>
      </CommandDialog>
    )
  }

  if (mode === 'add-action') {
    return (
      <CommandDialog open={open} onOpenChange={setOpen}>
        <div className="p-4 space-y-4">
          <h3 className="text-lg font-semibold">Quick Add Action</h3>
          <div className="space-y-2">
            <Label htmlFor="q-title">Title</Label>
            <Input
              id="q-title"
              value={actionTitle}
              onChange={(e) => setActionTitle(e.target.value)}
              placeholder="What needs to be done?"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAddAction()}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={actionType} onValueChange={setActionType}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTION_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={actionPriority} onValueChange={setActionPriority}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTION_PRIORITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="q-due">Due Date</Label>
            <Input
              id="q-due"
              type="date"
              value={actionDueDate}
              onChange={(e) => setActionDueDate(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAddAction} disabled={saving || !actionTitle.trim()}>
              {saving ? 'Creating...' : 'Create Action'}
            </Button>
            <Button variant="outline" onClick={() => setMode('search')}>Back</Button>
          </div>
        </div>
      </CommandDialog>
    )
  }

  if (mode === 'add-note') {
    return (
      <CommandDialog open={open} onOpenChange={setOpen}>
        <div className="p-4 space-y-4">
          <h3 className="text-lg font-semibold">Quick Add Note</h3>
          <div className="space-y-2">
            <Label htmlFor="q-note-title">Title</Label>
            <Input
              id="q-note-title"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Note title"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAddNote()}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="q-note-desc">Description</Label>
            <Textarea
              id="q-note-desc"
              value={noteDescription}
              onChange={(e) => setNoteDescription(e.target.value)}
              placeholder="Details..."
              rows={3}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAddNote} disabled={saving || !noteTitle.trim()}>
              {saving ? 'Saving...' : 'Save Note'}
            </Button>
            <Button variant="outline" onClick={() => setMode('search')}>Back</Button>
          </div>
        </div>
      </CommandDialog>
    )
  }

  // Default: search mode
  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search contacts, companies, or create new..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Quick Add">
          <CommandItem onSelect={() => setMode('add-contact')}>
            <Plus className="mr-2 h-4 w-4" />
            <span>New Contact</span>
          </CommandItem>
          <CommandItem onSelect={() => setMode('add-action')}>
            <Plus className="mr-2 h-4 w-4" />
            <span>New Action</span>
          </CommandItem>
          <CommandItem onSelect={() => setMode('add-note')}>
            <Lightbulb className="mr-2 h-4 w-4" />
            <span>New Note / Idea</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => { close(); navigate('/') }}>
            <Search className="mr-2 h-4 w-4" />
            <span>Dashboard</span>
          </CommandItem>
          <CommandItem onSelect={() => { close(); navigate('/actions') }}>
            <ListTodo className="mr-2 h-4 w-4" />
            <span>All Actions</span>
          </CommandItem>
          <CommandItem onSelect={() => { close(); navigate('/calendar') }}>
            <Search className="mr-2 h-4 w-4" />
            <span>Calendar</span>
          </CommandItem>
        </CommandGroup>

        {contacts.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Contacts">
              {contacts.map((c) => (
                <CommandItem key={`contact-${c.id}`} onSelect={() => { close(); navigate(`/contacts/${c.id}`) }}>
                  <BookUser className="mr-2 h-4 w-4" />
                  <span>{c.name}</span>
                  {c.title && <span className="ml-2 text-xs text-muted-foreground">{c.title}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {companies.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Companies">
              {companies.map((c) => (
                <CommandItem key={`company-${c.id}`} onSelect={() => { close(); navigate(`/companies/${c.id}`) }}>
                  <Building2 className="mr-2 h-4 w-4" />
                  <span>{c.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
