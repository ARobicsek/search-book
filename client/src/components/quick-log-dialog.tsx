import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type {
  Conversation,
  ConversationAttachment,
  ConversationPrepNote,
  ConversationType,
  Tag,
} from '@/lib/types'
import { CONVERSATION_TYPE_OPTIONS } from '@/lib/types'
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
import { Combobox, MultiCombobox, type ComboboxOption } from '@/components/ui/combobox'
import { TitleAutocomplete } from '@/components/title-autocomplete'
import { MarkdownTextarea } from '@/components/markdown-textarea'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import { ChevronDown, ChevronRight, FileText, Loader2, Paperclip, Trash2, X } from 'lucide-react'

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

function isImage(att: { mimeType?: string | null; url: string }) {
  return (att.mimeType || '').startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(att.url)
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
  const [companyId, setCompanyId] = useState('')
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
    setCompanyId('')
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

    api.get<string[]>('/conversations/titles').then(setTitles).catch(() => { })
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
          setCompanyId(conv.companyId?.toString() || '')
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
          // Expand sections that already have content
          setShowWho(!!(conv.contactId || conv.companyId || conv.participants?.length || conv.attendeesDescription))
          setShowExtras(!!(conv.nextSteps || conv.tags?.length || conv.prepNotes?.length || conv.attachments?.length))
        })
        .catch(() => {
          toast.error('Failed to load meeting')
          onOpenChange(false)
        })
        .finally(() => setLoadingEdit(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId, lookupsLoaded])

  // Resolve free-text combobox entries into real records (same pattern as the full editor)
  async function resolveWho() {
    let resolvedCompanyId: number | null = null
    if (companyId) {
      if (/^\d+$/.test(companyId)) {
        resolvedCompanyId = Number(companyId)
      } else {
        const created = await api.post<{ id: number }>('/companies', { name: companyId })
        resolvedCompanyId = created.id
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
    return { resolvedCompanyId, participants, resolvedTagIds }
  }

  async function handleSave() {
    if (!date) {
      toast.error('Date is required')
      return
    }
    if (!title.trim() && !contactId && !companyId && participantIds.length === 0 && !attendeesDescription.trim()) {
      toast.error('Add a title (or someone who was there)')
      return
    }
    setSaving(true)
    try {
      const { resolvedCompanyId, participants, resolvedTagIds } = await resolveWho()

      const payload = {
        title: title.trim() || null,
        date,
        type,
        summary: summary.trim() || null,
        notes: notes.trim() || null,
        nextSteps: nextSteps.trim() || null,
        contactId: contactId && /^\d+$/.test(contactId) ? Number(contactId) : null,
        companyId: resolvedCompanyId,
        participants,
        attendeesDescription: attendeesDescription.trim() || null,
        tagIds: resolvedTagIds,
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

  const participantNameOf = (val: string) =>
    contactOptions.find((o) => o.value === val)?.label || val

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[95vw] overflow-y-auto sm:max-w-xl">
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
        ) : (
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
              {(contactId || companyId || participantIds.length > 0 || attendeesDescription) && (
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
                  <MultiCombobox
                    options={contactOptions}
                    values={participantIds}
                    onChange={setParticipantIds}
                    placeholder="Named people in the meeting..."
                    searchPlaceholder="Search or type new name..."
                    allowFreeText={true}
                  />
                  {participantIds.map((val) => (
                    <div key={val} className="flex items-center gap-2">
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
                  ))}
                </div>
                <div className="space-y-2">
                  <Label>Organization</Label>
                  <Combobox
                    options={companyOptions}
                    value={companyId}
                    onChange={(v) => setCompanyId(v)}
                    placeholder="With which org..."
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

            {/* Next steps / tags / prep notes / attachments */}
            <button
              type="button"
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setShowExtras((v) => !v)}
            >
              {showExtras ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Prep, tags &amp; attachments
              {(nextSteps || tagIds.length > 0 || prepNotes.length > 0 || pendingPrepNotes.length > 0 ||
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

                {/* Prep notes — written in advance (log the meeting with a future
                    date) or any time before/after */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" /> Prep notes
                  </Label>
                  {prepNotes.map((note) => (
                    <div key={note.id} className="flex items-start gap-2 rounded-md bg-muted/50 p-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">{note.date}</p>
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
                    <div key={i} className="flex items-start gap-2 rounded-md bg-muted/50 p-2">
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
