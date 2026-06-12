import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type {
  ActionPriority,
  ActionType,
  Conversation,
  ConversationAttachment,
  ConversationPrepNote,
  ConversationType,
  Tag,
} from '@/lib/types'
import {
  ACTION_PRIORITY_OPTIONS,
  ACTION_TYPE_OPTIONS,
  CONVERSATION_TYPE_OPTIONS,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { Combobox, MultiCombobox, type ComboboxOption } from '@/components/ui/combobox'
import { TitleAutocomplete } from '@/components/title-autocomplete'
import { MarkdownTextarea } from '@/components/markdown-textarea'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import {
  Check, ChevronDown, ChevronRight, FileText, ListTodo, Loader2, Paperclip,
  Plus, Star, Trash2, X,
} from 'lucide-react'

// Context so the command palette, header button, and Meetings page can all
// open the same dialog (mirrors the CommandPaletteProvider pattern).
// `open()` = quick log a new meeting; `openEdit(id)` = full edit of an existing one.
const QuickLogContext = createContext<{ open: () => void; openEdit: (id: number) => void }>({
  open: () => { },
  openEdit: () => { },
})

export function useQuickLog() {
  return useContext(QuickLogContext)
}

export function QuickLogProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)

  const open = useCallback(() => {
    setEditId(null)
    setIsOpen(true)
  }, [])
  const openEdit = useCallback((id: number) => {
    setEditId(id)
    setIsOpen(true)
  }, [])

  return (
    <QuickLogContext.Provider value={{ open, openEdit }}>
      {children}
      <QuickLogDialog open={isOpen} onOpenChange={setIsOpen} editId={editId} />
    </QuickLogContext.Provider>
  )
}

// A prep note staged locally while creating a meeting (no conversationId yet)
interface PendingPrepNote {
  content: string
  date: string
}

// An attachment staged locally while creating a meeting (file already uploaded)
interface PendingAttachment {
  url: string
  name: string
  mimeType: string
  size: number
}

// A follow-up action staged locally; created via createActions on save
interface PendingAction {
  title: string
  type: ActionType
  dueDate: string
  priority: ActionPriority
}

const emptyPendingAction: PendingAction = {
  title: '',
  type: 'FOLLOW_UP',
  dueDate: '',
  priority: 'MEDIUM',
}

function formatPrepDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function QuickLogDialog({
  open,
  onOpenChange,
  editId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editId: number | null
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [type, setType] = useState<ConversationType>('MEETING')
  const [summary, setSummary] = useState('')
  const [notes, setNotes] = useState('')
  const [nextSteps, setNextSteps] = useState('')
  const [contactId, setContactId] = useState('')
  // Orgs the meeting was with: first becomes the anchor companyId, the rest go
  // to the ConversationOrg junction. Values are ids or free-text new names.
  const [orgValues, setOrgValues] = useState<string[]>([])
  const [participantIds, setParticipantIds] = useState<string[]>([])
  const [participantNotes, setParticipantNotes] = useState<Record<string, string>>({})
  const [attendeesDescription, setAttendeesDescription] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [showWho, setShowWho] = useState(false)
  const [showExtras, setShowExtras] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingEdit, setLoadingEdit] = useState(false)

  // Prep notes & attachments. In edit mode these are live records; in create
  // mode they're staged locally and persisted right after the meeting is created.
  const [prepNotes, setPrepNotes] = useState<ConversationPrepNote[]>([])
  const [pendingPrepNotes, setPendingPrepNotes] = useState<PendingPrepNote[]>([])
  const [newPrepContent, setNewPrepContent] = useState('')
  const [attachments, setAttachments] = useState<ConversationAttachment[]>([])
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Follow-up actions: existing (edit mode, read-only links) + staged new ones
  const [existingActions, setExistingActions] = useState<NonNullable<Conversation['actions']>>([])
  const [newActions, setNewActions] = useState<PendingAction[]>([])

  // Favorite contacts (reserved "Favorite" tag) for one-click participant add
  const [favorites, setFavorites] = useState<{ id: number; name: string }[]>([])

  // Most recent earlier meeting in the same series (title match) — shown in the
  // left panel for context while writing up a recurring meeting.
  const [seriesContext, setSeriesContext] = useState<Conversation | null>(null)

  // Lookup data, fetched lazily on first open
  const [titles, setTitles] = useState<string[]>([])
  const [contactOptions, setContactOptions] = useState<ComboboxOption[]>([])
  const [companyOptions, setCompanyOptions] = useState<ComboboxOption[]>([])
  const [tagOptions, setTagOptions] = useState<ComboboxOption[]>([])
  const [lookupsLoaded, setLookupsLoaded] = useState(false)

  const isEdit = editId !== null

  useEffect(() => {
    if (!open) return
    // Reset to a fresh minimal log each time (S4: title + date + save in <30s)
    setTitle('')
    setDate(new Date().toLocaleDateString('en-CA'))
    setType('MEETING')
    setSummary('')
    setNotes('')
    setNextSteps('')
    setContactId('')
    setOrgValues([])
    setParticipantIds([])
    setParticipantNotes({})
    setAttendeesDescription('')
    setTagIds([])
    setShowWho(false)
    setShowExtras(false)
    setPrepNotes([])
    setPendingPrepNotes([])
    setNewPrepContent('')
    setAttachments([])
    setPendingAttachments([])
    setExistingActions([])
    setNewActions([])
    setSeriesContext(null)

    api.get<string[]>('/conversations/titles').then(setTitles).catch(() => { })
    api.get<{ id: number; name: string }[]>('/contacts/favorites').then(setFavorites).catch(() => { })
    if (!lookupsLoaded) {
      api.get<{ id: number; name: string }[]>('/contacts/names')
        .then((data) => setContactOptions(data.map((c) => ({ value: c.id.toString(), label: c.name }))))
        .catch(() => { })
      api.get<{ id: number; name: string }[]>('/companies/names')
        .then((data) => setCompanyOptions(data.map((c) => ({ value: c.id.toString(), label: c.name }))))
        .catch(() => { })
      api.get<Tag[]>('/tags')
        .then((data) => setTagOptions(data.map((t) => ({ value: t.id.toString(), label: t.name }))))
        .catch(() => { })
      setLookupsLoaded(true)
    }

    // Edit mode: load the full meeting and prefill everything
    if (editId !== null) {
      setLoadingEdit(true)
      api.get<Conversation>(`/conversations/${editId}`)
        .then((conv) => {
          setTitle(conv.title || '')
          setDate(conv.date)
          setType(conv.type as ConversationType)
          setSummary(conv.summary || '')
          setNotes(conv.notes || '')
          setNextSteps(conv.nextSteps || '')
          setContactId(conv.contactId?.toString() || '')
          const orgVals = [
            ...(conv.companyId ? [conv.companyId.toString()] : []),
            ...(conv.orgs || []).map((o) => o.company.id.toString()),
          ]
          setOrgValues([...new Set(orgVals)])
          setParticipantIds(conv.participants?.map((p) => p.contact.id.toString()) || [])
          const pNotes: Record<string, string> = {}
          for (const p of conv.participants || []) {
            if (p.note) pNotes[p.contact.id.toString()] = p.note
          }
          setParticipantNotes(pNotes)
          setAttendeesDescription(conv.attendeesDescription || '')
          setTagIds(conv.tags?.map((t) => t.tag.id.toString()) || [])
          setPrepNotes(conv.prepNotes || [])
          setAttachments(conv.attachments || [])
          setExistingActions(conv.actions || [])
          // Expand sections that already have content
          setShowWho(!!(conv.contactId || conv.companyId || conv.orgs?.length || conv.participants?.length || conv.attendeesDescription))
          setShowExtras(!!(conv.nextSteps || conv.tags?.length || conv.actions?.length || conv.attachments?.length))
        })
        .catch(() => {
          toast.error('Failed to load meeting')
          onOpenChange(false)
        })
        .finally(() => setLoadingEdit(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId, lookupsLoaded])

  // Fetch the previous meeting in the series once the title matches a known
  // series (debounced — the title is free text while typing).
  useEffect(() => {
    if (!open) return
    const t = title.trim()
    if (!t || !titles.some((k) => k.toLowerCase() === t.toLowerCase())) {
      setSeriesContext(null)
      return
    }
    const timer = setTimeout(() => {
      api.get<{ data: Conversation[] }>(`/meetings?title=${encodeURIComponent(t)}&limit=5`)
        .then((res) => {
          const previous = res.data.find(
            (m) => m.id !== editId && (!date || m.date <= date)
          )
          setSeriesContext(previous || null)
        })
        .catch(() => setSeriesContext(null))
    }, 400)
    return () => clearTimeout(timer)
  }, [title, titles, open, editId, date])

  // Resolve free-text combobox entries into real records (same pattern as the full editor)
  async function resolveWho() {
    const resolvedOrgIds: number[] = []
    for (const val of orgValues) {
      if (/^\d+$/.test(val)) {
        resolvedOrgIds.push(Number(val))
      } else {
        const created = await api.post<{ id: number }>('/companies', { name: val })
        resolvedOrgIds.push(created.id)
      }
    }
    const participants: { contactId: number; note: string | null }[] = []
    for (const val of participantIds) {
      const note = participantNotes[val]?.trim() || null
      if (/^\d+$/.test(val)) {
        participants.push({ contactId: Number(val), note })
      } else {
        const created = await api.post<{ id: number }>('/contacts', {
          name: val,
          status: 'CONNECTED',
          ecosystem: 'NETWORK',
        })
        participants.push({ contactId: created.id, note })
      }
    }
    const resolvedTagIds: number[] = []
    for (const val of tagIds) {
      if (/^\d+$/.test(val)) {
        resolvedTagIds.push(Number(val))
        continue
      }
      try {
        const newTag = await api.post<{ id: number }>('/tags', { name: val })
        resolvedTagIds.push(newTag.id)
      } catch {
        const all = await api.get<Tag[]>('/tags').catch(() => [] as Tag[])
        const found = all.find((t) => t.name.toLowerCase() === val.toLowerCase())
        if (found) resolvedTagIds.push(found.id)
        else toast.error(`Failed to create tag "${val}"`)
      }
    }
    return { resolvedOrgIds, participants, resolvedTagIds }
  }

  async function handleSave() {
    if (!date) {
      toast.error('Date is required')
      return
    }
    if (!title.trim() && !contactId && orgValues.length === 0 && participantIds.length === 0 && !attendeesDescription.trim()) {
      toast.error('Add a title (or someone who was there)')
      return
    }
    setSaving(true)
    try {
      const { resolvedOrgIds, participants, resolvedTagIds } = await resolveWho()

      const payload = {
        title: title.trim() || null,
        date,
        type,
        summary: summary.trim() || null,
        notes: notes.trim() || null,
        nextSteps: nextSteps.trim() || null,
        contactId: contactId && /^\d+$/.test(contactId) ? Number(contactId) : null,
        // First org anchors companyId (backward compat); the rest are junction rows
        companyId: resolvedOrgIds[0] ?? null,
        orgIds: resolvedOrgIds.slice(1),
        participants,
        attendeesDescription: attendeesDescription.trim() || null,
        tagIds: resolvedTagIds,
        createActions: newActions
          .filter((a) => a.title.trim())
          .map((a) => ({
            title: a.title.trim(),
            type: a.type,
            dueDate: a.dueDate || null,
            priority: a.priority,
          })),
      }

      let conversationId = editId
      if (isEdit) {
        await api.put(`/conversations/${editId}`, payload)
      } else {
        const created = await api.post<{ id: number }>('/conversations', payload)
        conversationId = created.id
      }

      // Persist staged prep notes / attachments (create mode; in edit mode they
      // were saved live as they were added)
      const stagedPrep = [...pendingPrepNotes]
      if (newPrepContent.trim()) stagedPrep.push({ content: newPrepContent.trim(), date })
      for (const note of stagedPrep) {
        await api.post('/conversation-prepnotes', {
          conversationId,
          content: note.content,
          date: note.date,
        })
      }
      for (const att of pendingAttachments) {
        await api.post('/conversation-attachments', { conversationId, ...att })
      }

      toast.success(isEdit ? 'Meeting updated' : 'Meeting logged')
      // Pages that list meetings (e.g. /meetings) listen for this to refresh
      window.dispatchEvent(new CustomEvent('searchbook:meeting-logged'))
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save meeting')
    } finally {
      setSaving(false)
    }
  }

  // ── Prep notes ────────────────────────────────────────────
  async function addPrepNote() {
    const content = newPrepContent.trim()
    if (!content) return
    if (isEdit) {
      try {
        const created = await api.post<ConversationPrepNote>('/conversation-prepnotes', {
          conversationId: editId,
          content,
          date: new Date().toLocaleDateString('en-CA'),
        })
        setPrepNotes((prev) => [...prev, created])
        setNewPrepContent('')
      } catch {
        toast.error('Failed to add prep note')
      }
    } else {
      setPendingPrepNotes((prev) => [...prev, { content, date: new Date().toLocaleDateString('en-CA') }])
      setNewPrepContent('')
    }
  }

  async function deletePrepNote(id: number) {
    try {
      await api.delete(`/conversation-prepnotes/${id}`)
      setPrepNotes((prev) => prev.filter((n) => n.id !== id))
    } catch {
      toast.error('Failed to delete prep note')
    }
  }

  // ── Favorites ─────────────────────────────────────────────
  async function toggleFavorite(contactIdNum: number, name: string) {
    const isFav = favorites.some((f) => f.id === contactIdNum)
    // Optimistic update; revert on failure
    setFavorites((prev) =>
      isFav
        ? prev.filter((f) => f.id !== contactIdNum)
        : [...prev, { id: contactIdNum, name }].sort((a, b) => a.name.localeCompare(b.name))
    )
    try {
      await api.patch(`/contacts/${contactIdNum}/favorite`, { favorite: !isFav })
    } catch {
      toast.error('Failed to update favorite')
      api.get<{ id: number; name: string }[]>('/contacts/favorites').then(setFavorites).catch(() => { })
    }
  }

  // ── Attachments ───────────────────────────────────────────
  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    for (const file of files) {
      if (file.size > 4 * 1024 * 1024) {
        toast.error(`${file.name}: files must be under 4MB`)
        continue
      }
      setUploadingFile(true)
      try {
        const uploaded = await api.uploadGenericFile(file)
        const meta = {
          url: uploaded.path,
          name: uploaded.name,
          mimeType: uploaded.mimeType,
          size: uploaded.size,
        }
        if (isEdit) {
          const created = await api.post<ConversationAttachment>('/conversation-attachments', {
            conversationId: editId,
            ...meta,
          })
          setAttachments((prev) => [...prev, created])
        } else {
          setPendingAttachments((prev) => [...prev, meta])
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Failed to upload ${file.name}`)
      } finally {
        setUploadingFile(false)
      }
    }
  }

  async function deleteAttachment(id: number) {
    try {
      await api.delete(`/conversation-attachments/${id}`)
      setAttachments((prev) => prev.filter((a) => a.id !== id))
    } catch {
      toast.error('Failed to remove attachment')
    }
  }

  // ── Follow-up actions ─────────────────────────────────────
  function updateNewAction(index: number, patch: Partial<PendingAction>) {
    setNewActions((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)))
  }

  const participantNameOf = (val: string) =>
    contactOptions.find((o) => o.value === val)?.label || val

  const quickAddFavorites = favorites.filter(
    (f) => !participantIds.includes(f.id.toString())
  )

  // Prep info shown in the left panel: the meeting's own prep notes (live or
  // staged) plus the previous meeting in the same series.
  const showPanel = prepNotes.length > 0 || pendingPrepNotes.length > 0 || !!seriesContext

  // Prep notes list + composer. Rendered in the left panel when it's visible,
  // otherwise inside the "Prep, tags & attachments" section.
  const prepNotesBlock = (
    <div className="space-y-2">
      {prepNotes.map((note) => (
        <div key={note.id} className="flex items-start gap-2 rounded-md bg-yellow-50 p-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{formatPrepDate(note.date)}</p>
            <div className="prep-note-markdown text-sm">
              <ReactMarkdown>{note.content}</ReactMarkdown>
            </div>
          </div>
          <button
            type="button"
            onClick={() => deletePrepNote(note.id)}
            className="text-muted-foreground hover:text-destructive"
            title="Delete prep note"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {pendingPrepNotes.map((note, i) => (
        <div key={i} className="flex items-start gap-2 rounded-md bg-yellow-50 p-2">
          <div className="prep-note-markdown min-w-0 flex-1 text-sm">
            <ReactMarkdown>{note.content}</ReactMarkdown>
          </div>
          <button
            type="button"
            onClick={() => setPendingPrepNotes((prev) => prev.filter((_, j) => j !== i))}
            className="text-muted-foreground hover:text-destructive"
            title="Remove prep note"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <MarkdownTextarea
        value={newPrepContent}
        onChange={setNewPrepContent}
        placeholder="Things to raise, questions to ask..."
        rows={2}
      />
      {newPrepContent.trim() && (
        <Button type="button" variant="outline" size="sm" onClick={addPrepNote}>
          Add prep note
        </Button>
      )}
    </div>
  )

  const formBody = (
    <div className="grid gap-4">
      <div className="space-y-2">
        <Label htmlFor="ql-title">Title</Label>
        <TitleAutocomplete
          id="ql-title"
          value={title}
          onChange={setTitle}
          titles={titles}
          autoFocus={!isEdit}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ql-date">Date</Label>
          <Input id="ql-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as ConversationType)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CONVERSATION_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="ql-summary">Summary</Label>
        <Input
          id="ql-summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="One-liner (optional)"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ql-notes">Notes</Label>
        <MarkdownTextarea
          id="ql-notes"
          value={notes}
          onChange={setNotes}
          placeholder="Optional — use ### headings for topics; paste screenshots directly"
          rows={isEdit ? 6 : 3}
        />
      </div>

      {/* Who was there — collapsed by default to keep the fast path fast */}
      <button
        type="button"
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        onClick={() => setShowWho((v) => !v)}
      >
        {showWho ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Who was there
        {(contactId || orgValues.length > 0 || participantIds.length > 0 || attendeesDescription) && (
          <span className="text-xs text-primary">·</span>
        )}
      </button>
      {showWho && (
        <div className="grid gap-4 rounded-md border p-3">
          <div className="space-y-2">
            <Label>Contact (1:1 anchor)</Label>
            <Combobox
              options={contactOptions}
              value={contactId}
              onChange={(v) => setContactId(v)}
              placeholder="Link to one contact..."
              searchPlaceholder="Search contacts..."
            />
          </div>
          <div className="space-y-2">
            <Label>Participants</Label>
            {quickAddFavorites.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {quickAddFavorites.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setParticipantIds((prev) => [...prev, f.id.toString()])}
                    className="flex items-center gap-1 rounded-full border bg-amber-50 px-2 py-0.5 text-xs text-amber-900 hover:bg-amber-100"
                    title="Add to participants"
                  >
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    {f.name}
                    <Plus className="h-3 w-3" />
                  </button>
                ))}
              </div>
            )}
            <MultiCombobox
              options={contactOptions}
              values={participantIds}
              onChange={setParticipantIds}
              placeholder="Named people in the meeting..."
              searchPlaceholder="Search or type new name..."
              allowFreeText={true}
            />
            {participantIds.map((val) => {
              const isExisting = /^\d+$/.test(val)
              const isFav = isExisting && favorites.some((f) => f.id === Number(val))
              return (
                <div key={val} className="flex items-center gap-2">
                  {isExisting ? (
                    <button
                      type="button"
                      onClick={() => toggleFavorite(Number(val), participantNameOf(val))}
                      className="shrink-0"
                      title={isFav ? 'Remove from favorites' : 'Mark as favorite (quick-add in future meetings)'}
                    >
                      <Star
                        className={cn(
                          'h-3.5 w-3.5',
                          isFav ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground hover:text-amber-400'
                        )}
                      />
                    </button>
                  ) : (
                    <span className="w-3.5 shrink-0" />
                  )}
                  <span className="w-28 shrink-0 truncate text-xs text-muted-foreground" title={participantNameOf(val)}>
                    {participantNameOf(val)}
                  </span>
                  <Input
                    value={participantNotes[val] || ''}
                    onChange={(e) =>
                      setParticipantNotes((prev) => ({ ...prev, [val]: e.target.value }))
                    }
                    placeholder="Takeaway about this person (optional)"
                    className="h-8 text-sm"
                  />
                </div>
              )
            })}
          </div>
          <div className="space-y-2">
            <Label>Organizations</Label>
            <MultiCombobox
              options={companyOptions}
              values={orgValues}
              onChange={setOrgValues}
              placeholder="With which orgs..."
              searchPlaceholder="Search or type new name..."
              allowFreeText={true}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ql-attendees">Attendees description</Label>
            <Input
              id="ql-attendees"
              value={attendeesDescription}
              onChange={(e) => setAttendeesDescription(e.target.value)}
              placeholder='e.g. "~10 Arcadia folks incl. analytics team"'
            />
          </div>
        </div>
      )}

      {/* Next steps / tags / actions / prep notes / attachments */}
      <button
        type="button"
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        onClick={() => setShowExtras((v) => !v)}
      >
        {showExtras ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Actions, prep, tags &amp; attachments
        {(nextSteps || tagIds.length > 0 || prepNotes.length > 0 || pendingPrepNotes.length > 0 ||
          existingActions.length > 0 || newActions.length > 0 ||
          attachments.length > 0 || pendingAttachments.length > 0) && (
            <span className="text-xs text-primary">·</span>
          )}
      </button>
      {showExtras && (
        <div className="grid gap-4 rounded-md border p-3">
          <div className="space-y-2">
            <Label htmlFor="ql-nextsteps">Next steps</Label>
            <Input
              id="ql-nextsteps"
              value={nextSteps}
              onChange={(e) => setNextSteps(e.target.value)}
              placeholder="What happens next (optional)"
            />
          </div>

          {/* Follow-up actions — created against this meeting (and its anchor
              contact, if any) when the meeting is saved */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1">
                <ListTodo className="h-3.5 w-3.5" /> Follow-up actions
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setNewActions((prev) => [...prev, { ...emptyPendingAction }])}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add action
              </Button>
            </div>
            {existingActions.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-sm">
                <span className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                  a.completed ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
                )}>
                  {a.completed && <Check className="h-2.5 w-2.5" />}
                </span>
                <Link
                  to={`/actions/${a.id}`}
                  className={cn('hover:underline', a.completed ? 'text-muted-foreground line-through' : 'text-primary')}
                  onClick={() => onOpenChange(false)}
                >
                  {a.title}
                </Link>
                {a.dueDate && <span className="text-xs text-muted-foreground">{a.dueDate}</span>}
              </div>
            ))}
            {newActions.map((a, i) => (
              <div key={i} className="space-y-2 rounded-md border p-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={a.title}
                    onChange={(e) => updateNewAction(i, { title: e.target.value })}
                    placeholder="e.g. Send follow-up email"
                    className="h-8 text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => setNewActions((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {a.title.trim() && (
                  <div className="grid grid-cols-3 gap-2">
                    <Select value={a.type} onValueChange={(v) => updateNewAction(i, { type: v as ActionType })}>
                      <SelectTrigger className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ACTION_TYPE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="date"
                      value={a.dueDate}
                      onChange={(e) => updateNewAction(i, { dueDate: e.target.value })}
                      className="h-8 text-xs"
                    />
                    <Select value={a.priority} onValueChange={(v) => updateNewAction(i, { priority: v as ActionPriority })}>
                      <SelectTrigger className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ACTION_PRIORITY_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <MultiCombobox
              options={tagOptions}
              values={tagIds}
              onChange={setTagIds}
              placeholder="Tag topics (e.g. digital-measures)..."
              searchPlaceholder="Search or type new tag..."
              allowFreeText={true}
            />
          </div>

          {/* Prep notes live in the left panel once any exist; the composer sits
              here only until then */}
          {!showPanel && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" /> Prep notes
              </Label>
              {prepNotesBlock}
            </div>
          )}

          {/* Attachments — screenshots, decks, PDFs (≤4MB each) */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <Paperclip className="h-3.5 w-3.5" /> Attachments
            </Label>
            <div className="flex flex-wrap gap-2">
              {attachments.map((att) => (
                <span key={att.id} className="flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 text-xs">
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noreferrer"
                    className="max-w-40 truncate text-primary hover:underline"
                    title={att.name}
                  >
                    {att.name}
                  </a>
                  <button
                    type="button"
                    onClick={() => deleteAttachment(att.id)}
                    className="text-muted-foreground hover:text-destructive"
                    title="Remove attachment"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {pendingAttachments.map((att, i) => (
                <span key={`p-${i}`} className="flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 text-xs">
                  <span className="max-w-40 truncate" title={att.name}>{att.name}</span>
                  <button
                    type="button"
                    onClick={() => setPendingAttachments((prev) => prev.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive"
                    title="Remove attachment"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadingFile}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="mr-1 h-3 w-3" />
              {uploadingFile ? 'Uploading...' : 'Add files'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.json,.eml,.msg,.zip"
              onChange={handleFileSelected}
              className="hidden"
            />
          </div>
        </div>
      )}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-h-[90vh] w-[95vw] overflow-y-auto', showPanel ? 'sm:max-w-5xl' : 'sm:max-w-xl')}>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Meeting' : 'Quick Log Meeting'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update any detail of this meeting.'
              : 'Title + date is enough — add people or notes if you have a minute.'}
          </DialogDescription>
        </DialogHeader>
        {loadingEdit ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : showPanel ? (
          // Fixed height so the prep panel stays visible while the form scrolls
          <ResizablePanelGroup orientation="horizontal" className="h-[68vh]">
            <ResizablePanel defaultSize={35} minSize={20} className="pr-4 border-r mr-2">
              <div className="h-full space-y-3 overflow-y-auto pr-1">
                <h3 className="flex items-center gap-1 text-sm font-semibold">
                  <FileText className="h-3.5 w-3.5" /> Prep Notes
                </h3>
                {prepNotesBlock}
                {seriesContext && (
                  <div className="border-t pt-3">
                    <h4 className="mb-2 text-xs font-semibold">Last Meeting in Series</h4>
                    <div className="space-y-1 rounded-md bg-muted/30 p-2">
                      <p className="text-xs text-muted-foreground">{seriesContext.date}</p>
                      {seriesContext.summary && (
                        <p className="text-xs font-medium">{seriesContext.summary}</p>
                      )}
                      {seriesContext.notes && (
                        <div className="prep-note-markdown max-h-48 overflow-y-auto text-xs text-muted-foreground">
                          <ReactMarkdown>{seriesContext.notes}</ReactMarkdown>
                        </div>
                      )}
                      {seriesContext.nextSteps && (
                        <p className="text-xs text-muted-foreground">Next: {seriesContext.nextSteps}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={65} minSize={30} className="pl-4">
              <div className="h-full overflow-y-auto pb-4 pr-2">{formBody}</div>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          formBody
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || loadingEdit}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Log Meeting'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
