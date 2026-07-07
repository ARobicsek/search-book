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
import { PersonTooltip } from '@/components/person-tooltip'
import { MarkdownTextarea } from '@/components/markdown-textarea'
import { SaveStatusIndicator } from '@/components/save-status'
import type { SaveStatus } from '@/hooks/use-auto-save'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { MentionableMarkdown } from '@/components/mentionable-markdown'
import {
  Check, ChevronDown, ChevronRight, Copy, FileText, ListTodo, Loader2, Paperclip,
  Pencil, Plus, Star, Trash2, X,
} from 'lucide-react'

// Optional prefill when opening a new meeting from a contact/company context —
// e.g. the contact page seeds the originating person as a Participant.
export interface QuickLogPrefill {
  participant?: { id: number; name: string }
  title?: string
}

// Context so the command palette, header button, and Meetings page can all
// open the same dialog (mirrors the CommandPaletteProvider pattern).
// `open()` = quick log a new meeting; `openEdit(id)` = full edit of an existing one.
const QuickLogContext = createContext<{ open: (prefill?: QuickLogPrefill) => void; openEdit: (id: number) => void }>({
  open: () => { },
  openEdit: () => { },
})

export function useQuickLog() {
  return useContext(QuickLogContext)
}

export function QuickLogProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [prefill, setPrefill] = useState<QuickLogPrefill | null>(null)

  const open = useCallback((opts?: QuickLogPrefill) => {
    setEditId(null)
    setPrefill(opts ?? null)
    setIsOpen(true)
  }, [])
  const openEdit = useCallback((id: number) => {
    setEditId(id)
    setPrefill(null)
    setIsOpen(true)
  }, [])

  return (
    <QuickLogContext.Provider value={{ open, openEdit }}>
      {children}
      <QuickLogDialog open={isOpen} onOpenChange={setIsOpen} editId={editId} prefill={prefill} />
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

// A follow-up action in the composer. Once the meeting record exists it
// autosaves as a real Action (POST → captures id, then debounced PUT), just
// like prep notes; before that it stays staged and is flushed on finalize.
// `key` is a stable local id (array index is unsafe across async saves); the
// persisted id + last-saved snapshot live in `savedActionsRef` (a synchronous
// ref) so two chained reconciles can't double-create.
interface PendingAction {
  key: number
  title: string
  type: ActionType
  dueDate: string
  priority: ActionPriority
  owedByMe: boolean        // the removable "Me" owner chip (mirrors the Actions form)
  owerIds: string[]        // contact ids who own it (waiting-on)
}

let pendingActionKeySeq = 0
function makePendingAction(): PendingAction {
  return {
    key: ++pendingActionKeySeq,
    title: '',
    type: 'FOLLOW_UP',
    // New actions default to due today (owner preference); the date input's native
    // picker has a Clear for making it undated (no room for an X in the 3-col row).
    dueDate: new Date().toLocaleDateString('en-CA'),
    priority: 'MEDIUM',
    owedByMe: true,
    owerIds: [],
  }
}

// The autosave body for one action (also the snapshot key). owerContactIds is the
// numeric id array the /actions route expects (resolveOwers derives `direction`).
function actionBody(a: PendingAction) {
  const oIds = a.owerIds.filter((v) => /^\d+$/.test(v)).map(Number)
  
  return {
    title: a.title.trim(),
    type: a.type,
    dueDate: a.dueDate || null,
    priority: a.priority,
    owedByMe: a.owedByMe,
    owerContactIds: oIds,
    contactIds: oIds,
    companyIds: [],
  }
}

function formatPrepDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// The side-by-side prep panel only makes sense on >= sm screens; on mobile the
// prep notes render full-width inside the form instead of a cramped 35% column.
function useIsDesktop() {
  const query = '(min-width: 640px)'
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.matchMedia(query).matches : true
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setIsDesktop(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isDesktop
}

// A saved prep note. Shows rendered markdown by default (so formatting is
// visible); click the body or the pencil to edit it in place. Edits autosave
// (debounced PUT) and flush on blur / when you click Done. Saves are serialized
// so a debounce + blur can't race.
function EditablePrepNote({
  note,
  onDelete,
  mentionContacts,
  mentionCompanies,
}: {
  note: ConversationPrepNote
  onDelete: () => void
  mentionContacts?: { id: number; name: string; title?: string | null }[]
  mentionCompanies?: { id: number; name: string }[]
}) {
  const [content, setContent] = useState(note.content)
  const [editing, setEditing] = useState(false)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const savedRef = useRef(note.content)
  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chainRef = useRef<Promise<void>>(Promise.resolve())

  // Re-sync if the underlying note changes identity (e.g. meeting reloaded).
  useEffect(() => {
    setContent(note.content)
    savedRef.current = note.content
  }, [note.id, note.content])

  const flush = useCallback(() => {
    const trimmed = content.trim()
    if (!trimmed || content === savedRef.current) return
    chainRef.current = chainRef.current.then(async () => {
      if (content === savedRef.current) return
      setStatus('saving')
      try {
        await api.put(`/conversation-prepnotes/${note.id}`, { content: trimmed })
        savedRef.current = content
        setStatus('saved')
        if (flashRef.current) clearTimeout(flashRef.current)
        flashRef.current = setTimeout(() => setStatus('idle'), 2000)
      } catch {
        setStatus('error')
      }
    })
  }, [content, note.id])

  // Debounced autosave ~1.2s after the last edit (only while editing).
  useEffect(() => {
    if (!editing || content === savedRef.current || !content.trim()) return
    const t = setTimeout(flush, 1200)
    return () => clearTimeout(t)
  }, [content, editing, flush])

  useEffect(() => () => { if (flashRef.current) clearTimeout(flashRef.current) }, [])

  return (
    <div className="space-y-1 rounded-md bg-yellow-50 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{formatPrepDate(note.date)}</p>
        <div className="flex items-center gap-2">
          <SaveStatusIndicator status={status} className="text-xs" />
          <button
            type="button"
            // Keep textarea focus on mousedown so the click toggles cleanly (no blur race).
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { if (editing) { flush(); setEditing(false) } else { setEditing(true) } }}
            className="text-muted-foreground hover:text-foreground"
            title={editing ? 'Done editing' : 'Edit prep note'}
          >
            {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
            title="Delete prep note"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {editing ? (
        <MarkdownTextarea
          value={content}
          onChange={setContent}
          onBlur={() => { flush(); setEditing(false) }}
          placeholder="Things to raise, questions to ask... (type @ to mention)"
          rows={3}
          autoFocus
          mentionContacts={mentionContacts}
          mentionCompanies={mentionCompanies}
        />
      ) : (
        <div
          className="prep-note-markdown cursor-text text-sm"
          onClick={(e) => { if (!(e.target as HTMLElement).closest('a')) setEditing(true) }}
          title="Click to edit"
        >
          {content.trim()
            ? <MentionableMarkdown>{content}</MentionableMarkdown>
            : <span className="italic text-muted-foreground/60">Empty note — click to edit</span>}
        </div>
      )}
    </div>
  )
}

function QuickLogDialog({
  open,
  onOpenChange,
  editId,
  prefill,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editId: number | null
  prefill: QuickLogPrefill | null
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('') // optional HH:MM (set by Outlook import; editable here)
  const [type, setType] = useState<ConversationType>('MEETING')
  const [summary, setSummary] = useState('')
  const [notes, setNotes] = useState('')
  const [nextSteps, setNextSteps] = useState('')
  // Orgs the meeting was with: first becomes the anchor companyId, the rest go
  // to the ConversationOrg junction. Values are ids or free-text new names.
  const [orgValues, setOrgValues] = useState<string[]>([])
  const [participantIds, setParticipantIds] = useState<string[]>([])
  const [participantNotes, setParticipantNotes] = useState<Record<string, string>>({})
  const [attendeesDescription, setAttendeesDescription] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])
  // Series this meeting belongs to ('' = none; numeric string = series id) +
  // the picker's options. Selecting an existing series sets the id; typing a new
  // name creates one immediately so the id is always numeric for autosave.
  const [seriesId, setSeriesId] = useState('')
  const [seriesOptions, setSeriesOptions] = useState<{ id: number; name: string }[]>([])
  // Secondary disclosure groups (the big-3 — participants/notes/actions — are
  // always visible; everything else is tucked into these labeled sections).
  const [showContext, setShowContext] = useState(false)        // organizations & attendees
  const [showSummaryNotes, setShowSummaryNotes] = useState(false) // summary & next steps
  const [showTagsPrep, setShowTagsPrep] = useState(false)      // tags, prep notes & attachments
  const [saving, setSaving] = useState(false)
  const [loadingEdit, setLoadingEdit] = useState(false)

  // Autosave: the live conversation id (= editId in edit mode, or the id created
  // by the first autosave POST in create mode). `savedIdRef` mirrors it for
  // synchronous reads inside the serialized save chain.
  const [savedId, setSavedId] = useState<number | null>(null)
  const savedIdRef = useRef<number | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const lastSnapshotRef = useRef<string | null>(null)   // JSON of the last autosaved body (skips no-ops)
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())  // serializes autosave + finalize
  const savedFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Participants present the moment the dialog opened (e.g. one seeded from a
  // contact page). A seeded participant alone must NOT auto-create a meeting —
  // we wait for real content first.
  const seededParticipantCountRef = useRef(0)
  // Free-text participant names currently being turned into real Contact records
  // (see handleParticipantsChange) — guards against a second onChange double-creating
  // the same name before the first POST resolves.
  const creatingParticipantsRef = useRef<Set<string>>(new Set())
  // Contact ids we created *in this dialog session* by adding them as a participant
  // (typed-in or pasted). If one is removed again before it's gained any other info,
  // it was an accidental/abandoned add and is deleted (auto-cleanup).
  const autoCreatedParticipantsRef = useRef<Set<number>>(new Set())
  const recordExists = savedId !== null

  // Prep notes & attachments. In edit mode these are live records; in create
  // mode they're staged locally and persisted right after the meeting is created.
  const [prepNotes, setPrepNotes] = useState<ConversationPrepNote[]>([])
  const [pendingPrepNotes, setPendingPrepNotes] = useState<PendingPrepNote[]>([])
  const [newPrepContent, setNewPrepContent] = useState('')
  // The in-progress (draft) prep note autosaves once the meeting record exists:
  // first keystroke-batch POSTs it, later ones PUT. `Ref`s back the save logic so
  // a debounce + blur + finalize can't double-create. `draftStatus` drives a small
  // Saving/Saved indicator under the composer.
  const [draftStatus, setDraftStatus] = useState<SaveStatus>('idle')
  const newPrepNoteIdRef = useRef<number | null>(null)
  const newPrepSavedRef = useRef('')
  const draftFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prepSaveChainRef = useRef<Promise<void>>(Promise.resolve())
  const [attachments, setAttachments] = useState<ConversationAttachment[]>([])
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Follow-up actions: existing (edit mode, read-only links) + composer rows that
  // autosave as real Actions once the meeting record exists.
  const [existingActions, setExistingActions] = useState<NonNullable<Conversation['actions']>>([])
  const [newActions, setNewActions] = useState<PendingAction[]>([])
  const newActionsRef = useRef<PendingAction[]>([])     // current rows for the serialized save chain
  // Synchronous source of truth for which rows are persisted (id) + their last
  // saved body (snapshot), keyed by row `key`. Updated inside the save chain so a
  // debounce + finalize reconcile can never POST the same row twice.
  const savedActionsRef = useRef<Map<number, { id: number; snapshot: string }>>(new Map())
  const actionSaveChainRef = useRef<Promise<void>>(Promise.resolve())
  const [actionsSaveStatus, setActionsSaveStatus] = useState<SaveStatus>('idle')
  const actionsFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => { newActionsRef.current = newActions }, [newActions])

  // Is any composer row new or edited since its last save? (consults the ref)
  function actionsDirty(rows: PendingAction[]) {
    return rows.some((a) => {
      if (!a.title.trim()) return false
      const saved = savedActionsRef.current.get(a.key)
      return !saved || saved.snapshot !== JSON.stringify(actionBody(a))
    })
  }

  // Favorite contacts (reserved "Favorite" tag) for one-click participant add
  const [favorites, setFavorites] = useState<{ id: number; name: string }[]>([])
  // Favorite orgs (reserved "Favorite" CompanyTag) for one-click org add
  const [companyFavorites, setCompanyFavorites] = useState<{ id: number; name: string }[]>([])

  // Most recent earlier meeting in the same series (title match) — shown in the
  // left panel for context while writing up a recurring meeting.
  const [seriesContext, setSeriesContext] = useState<Conversation | null>(null)

  // Lookup data, fetched lazily on first open
  const [titles, setTitles] = useState<string[]>([])
  const [contactOptions, setContactOptions] = useState<ComboboxOption[]>([])
  // Per-contact pronunciation + title + employer for the participant-chip hover tooltip, keyed by id string.
  const [contactMeta, setContactMeta] = useState<Map<string, { pronunciation?: string | null; title?: string | null; employer?: string | null }>>(new Map())
  // Flat contact + company lists powering the notes "@mention" autocomplete.
  const [mentionContacts, setMentionContacts] = useState<{ id: number; name: string; title?: string | null }[]>([])
  const [mentionCompanies, setMentionCompanies] = useState<{ id: number; name: string }[]>([])
  const [companyOptions, setCompanyOptions] = useState<ComboboxOption[]>([])
  const [tagOptions, setTagOptions] = useState<ComboboxOption[]>([])

  const isEdit = editId !== null
  const isDesktop = useIsDesktop()

  useEffect(() => {
    if (!open) return
    // Reset to a fresh minimal log each time (S4: title + date + save in <30s)
    setTitle('')
    setDate(new Date().toLocaleDateString('en-CA'))
    setStartTime('')
    setType('MEETING')
    setSummary('')
    setNotes('')
    setNextSteps('')
    setOrgValues([])
    setParticipantIds([])
    setParticipantNotes({})
    setAttendeesDescription('')
    setTagIds([])
    setSeriesId('')
    setShowContext(false)
    setShowSummaryNotes(false)
    setShowTagsPrep(false)
    setPrepNotes([])
    setPendingPrepNotes([])
    setNewPrepContent('')
    setDraftStatus('idle')
    newPrepNoteIdRef.current = null
    newPrepSavedRef.current = ''
    prepSaveChainRef.current = Promise.resolve()
    setAttachments([])
    setPendingAttachments([])
    setExistingActions([])
    setNewActions([])
    newActionsRef.current = []
    savedActionsRef.current = new Map()
    actionSaveChainRef.current = Promise.resolve()
    setActionsSaveStatus('idle')
    setSeriesContext(null)

    // Autosave bookkeeping. In edit mode the record already exists (= editId);
    // in create mode it's created by the first valid autosave POST.
    setSavedId(editId)
    savedIdRef.current = editId
    setSaveStatus('idle')
    lastSnapshotRef.current = null
    saveChainRef.current = Promise.resolve()
    seededParticipantCountRef.current = editId === null && prefill?.participant ? 1 : 0
    creatingParticipantsRef.current = new Set()
    autoCreatedParticipantsRef.current = new Set()

    // Prefill a new meeting opened from a contact/company context (e.g. the
    // contact page seeds the originating person as a Participant).
    if (editId === null && prefill) {
      if (prefill.title) setTitle(prefill.title)
      if (prefill.participant) {
        const pid = prefill.participant.id.toString()
        const name = prefill.participant.name
        setParticipantIds([pid])
        setContactOptions((prev) =>
          prev.some((o) => o.value === pid) ? prev : [{ value: pid, label: name }, ...prev]
        )
      }
    }

    api.get<string[]>('/conversations/titles').then(setTitles).catch(() => { })
    api.get<{ id: number; name: string }[]>('/series').then(setSeriesOptions).catch(() => { })
    api.get<{ id: number; name: string }[]>('/contacts/favorites').then(setFavorites).catch(() => { })
    api.get<{ id: number; name: string }[]>('/companies/favorites').then(setCompanyFavorites).catch(() => { })
    // Refetch the contact/company/tag lookups on every open. The dialog is mounted
    // permanently at app root, so caching these (the old `lookupsLoaded` gate) left a
    // contact created or merged earlier this session invisible to the participant /
    // org pickers and the @-mention autocomplete until a full page reload.
    // Names come back pre-sorted by relevance (rank), which the mention picker uses
    // directly and the participant/org comboboxes re-sort by (rank → prefix → alpha).
    api.get<{ id: number; name: string; preferredName?: string | null; title?: string | null; company?: { name: string } | null; rank?: number }[]>('/contacts/names')
      .then((data) => {
        setContactOptions(data.map((c) => ({ value: c.id.toString(), label: c.name, rank: c.rank })))
        setContactMeta(new Map(data.map((c) => [c.id.toString(), { pronunciation: c.preferredName, title: c.title, employer: c.company?.name }])))
        setMentionContacts(data.map((c) => ({ id: c.id, name: c.name, title: c.title })))
      })
      .catch(() => { })
    api.get<{ id: number; name: string; rank?: number }[]>('/companies/names')
      .then((data) => {
        setCompanyOptions(data.map((c) => ({ value: c.id.toString(), label: c.name, rank: c.rank })))
        setMentionCompanies(data.map((c) => ({ id: c.id, name: c.name })))
      })
      .catch(() => { })
    api.get<Tag[]>('/tags')
      .then((data) => setTagOptions(data.map((t) => ({ value: t.id.toString(), label: t.name }))))
      .catch(() => { })

    // Edit mode: load the full meeting and prefill everything
    if (editId !== null) {
      setLoadingEdit(true)
      api.get<Conversation>(`/conversations/${editId}`)
        .then((conv) => {
          setTitle(conv.title || '')
          setDate(conv.date)
          setStartTime(conv.startTime || '')
          setType(conv.type as ConversationType)
          setSummary(conv.summary || '')
          setNotes(conv.notes || '')
          setNextSteps(conv.nextSteps || '')
          const orgIds = [...new Set([
            ...(conv.companyId ? [conv.companyId] : []),
            ...(conv.orgs || []).map((o) => o.company.id),
          ])]
          setOrgValues(orgIds.map((id) => id.toString()))
          setParticipantIds(conv.participants?.map((p) => p.contact.id.toString()) || [])
          const pNotes: Record<string, string> = {}
          for (const p of conv.participants || []) {
            if (p.note) pNotes[p.contact.id.toString()] = p.note
          }
          setParticipantNotes(pNotes)
          setAttendeesDescription(conv.attendeesDescription || '')
          setTagIds(conv.tags?.map((t) => t.tag.id.toString()) || [])
          setSeriesId(conv.seriesId ? conv.seriesId.toString() : '')
          if (conv.series) {
            setSeriesOptions((prev) =>
              prev.some((s) => s.id === conv.series!.id) ? prev : [...prev, conv.series!]
            )
          }
          setPrepNotes(conv.prepNotes || [])
          setAttachments(conv.attachments || [])
          setExistingActions(conv.actions || [])
          // Expand sections that already have content. The 1:1 anchor field is
          // gone, but a legacy anchor (conv.companyId/contactId) still means
          // there's "who" context worth showing.
          // Auto-expand secondary sections that already carry content. The big-3
          // (participants/notes/actions) are always visible, so only the org/
          // attendees, summary/next-steps, and tags/prep/attachments groups gate.
          setShowContext(!!(conv.companyId || conv.orgs?.length || conv.attendeesDescription))
          setShowSummaryNotes(!!(conv.summary || conv.nextSteps))
          // Prep notes live inside this section on mobile (no side panel), so
          // auto-expand it there when the meeting already has prep notes.
          setShowTagsPrep(!!(conv.tags?.length || conv.attachments?.length || (conv.prepNotes?.length && !isDesktop)))
          // Seed the autosave snapshot from the loaded record so opening an edit
          // doesn't trigger an immediate no-op PUT. Mirrors buildAutosaveBody().
          lastSnapshotRef.current = JSON.stringify({
            title: conv.title?.trim() || null,
            date: conv.date,
            startTime: conv.startTime?.trim() || null,
            type: conv.type,
            summary: conv.summary?.trim() || null,
            notes: conv.notes?.trim() || null,
            nextSteps: conv.nextSteps?.trim() || null,
            attendeesDescription: conv.attendeesDescription?.trim() || null,
            seriesId: conv.seriesId ?? null,
            companyId: orgIds[0] ?? null,
            orgIds: orgIds.slice(1),
            participants: (conv.participants || []).map((p) => ({ contactId: p.contact.id, note: p.note?.trim() || null })),
            tagIds: (conv.tags || []).map((t) => t.tag.id),
          })
        })
        .catch(() => {
          toast.error('Failed to load meeting')
          onOpenChange(false)
        })
        .finally(() => setLoadingEdit(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId])

  // Fetch the previous meeting in the same series (by seriesId) for the left
  // panel's "Last meeting in series" context (debounced).
  useEffect(() => {
    if (!open || !seriesId) {
      setSeriesContext(null)
      return
    }
    const timer = setTimeout(() => {
      api.get<{ data: Conversation[] }>(`/meetings?seriesId=${seriesId}&limit=5`)
        .then((res) => {
          const previous = res.data.find(
            (m) => m.id !== editId && (!date || m.date <= date)
          )
          setSeriesContext(previous || null)
        })
        .catch(() => setSeriesContext(null))
    }, 300)
    return () => clearTimeout(timer)
  }, [seriesId, open, editId, date])

  // ── Autosave ──────────────────────────────────────────────
  // The autosave body carries only the scalar fields + the *numeric* (already
  // resolved) participants/orgs/tags. It deliberately omits `contactId` (never
  // re-anchor a legacy meeting) and `createActions` / free-text entities (a PUT
  // would re-create those on every keystroke). Free-text names and actions are
  // persisted by the explicit "Done" finalize instead.
  function buildAutosaveBody() {
    const numericOrgIds = orgValues.filter((v) => /^\d+$/.test(v)).map(Number)
    const participants = participantIds
      .filter((v) => /^\d+$/.test(v))
      .map((v) => ({ contactId: Number(v), note: participantNotes[v]?.trim() || null }))
    const numericTagIds = tagIds.filter((v) => /^\d+$/.test(v)).map(Number)
    return {
      title: title.trim() || null,
      date,
      startTime: startTime.trim() || null,
      type,
      summary: summary.trim() || null,
      notes: notes.trim() || null,
      nextSteps: nextSteps.trim() || null,
      attendeesDescription: attendeesDescription.trim() || null,
      seriesId: seriesId ? Number(seriesId) : null,
      companyId: numericOrgIds[0] ?? null,
      orgIds: numericOrgIds.slice(1),
      participants,
      tagIds: numericTagIds,
    }
  }

  // Server `hasWho` accepts a meeting only with a title / org / participant /
  // attendees description — notes or summary alone are not enough to POST.
  function autosaveValid(body: ReturnType<typeof buildAutosaveBody>) {
    return !!(
      body.date &&
      (body.title || body.companyId !== null || body.orgIds.length > 0 ||
        body.participants.length > 0 || body.attendeesDescription)
    )
  }

  // Before the record exists, require real content so merely opening "Log
  // Meeting" from a contact (which pre-seeds a participant) doesn't auto-create
  // an empty meeting. A participant beyond the seeded one also counts.
  function hasMeaningfulContent(body: ReturnType<typeof buildAutosaveBody>) {
    return !!(
      body.title || body.summary || body.notes || body.nextSteps ||
      body.attendeesDescription || body.companyId !== null || body.orgIds.length > 0 ||
      body.participants.length > seededParticipantCountRef.current
    )
  }

  // Serialize every save (autosave + finalize) so the first POST sets the id
  // before any later PUT runs — never two POSTs, never a PUT before the POST.
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

  async function persistAutosave(body: ReturnType<typeof buildAutosaveBody>, snapshot: string) {
    setSaveStatus('saving')
    try {
      if (savedIdRef.current === null) {
        const created = await api.post<{ id: number }>('/conversations', body)
        savedIdRef.current = created.id
        setSavedId(created.id)
        // A brand-new meeting should show up in the lists behind the dialog.
        window.dispatchEvent(new CustomEvent('searchbook:meeting-logged'))
      } else {
        await api.put(`/conversations/${savedIdRef.current}`, body)
      }
      lastSnapshotRef.current = snapshot
      flashSaved()
    } catch {
      setSaveStatus('error')
    }
  }

  // Debounced autosave: fires ~1.5s after the last edit to a savable field.
  useEffect(() => {
    if (!open || loadingEdit) return
    const body = buildAutosaveBody()
    if (!autosaveValid(body)) return
    // Don't auto-create a meeting that's empty but for a pre-seeded participant.
    if (savedIdRef.current === null && !hasMeaningfulContent(body)) return
    const snapshot = JSON.stringify(body)
    if (snapshot === lastSnapshotRef.current) return
    const timer = setTimeout(() => {
      void enqueueSave(() => persistAutosave(body, snapshot))
    }, 1500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loadingEdit, title, date, type, summary, notes, nextSteps,
    attendeesDescription, seriesId, orgValues, participantIds, participantNotes, tagIds])

  useEffect(() => () => { if (savedFlashRef.current) clearTimeout(savedFlashRef.current) }, [])
  useEffect(() => () => { if (draftFlashRef.current) clearTimeout(draftFlashRef.current) }, [])
  useEffect(() => () => { if (actionsFlashRef.current) clearTimeout(actionsFlashRef.current) }, [])

  // Debounced autosave for the in-progress prep note (~1.2s after the last edit).
  // Only fires once the meeting record exists; before that the draft is preserved
  // locally and persisted on finalize.
  useEffect(() => {
    if (!open || loadingEdit || savedId === null) return
    if (!newPrepContent.trim() || newPrepContent === newPrepSavedRef.current) return
    const snapshot = newPrepContent
    const timer = setTimeout(() => { void enqueuePrepSave(() => saveDraftPrepNote(snapshot)) }, 1200)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loadingEdit, newPrepContent, savedId])

  // Debounced autosave for follow-up actions (~1.2s). Like prep notes, only fires
  // once the meeting record exists; before that the rows stage and finalize flushes
  // them. Skips when nothing is new/changed.
  useEffect(() => {
    if (!open || loadingEdit || savedId === null) return
    if (!actionsDirty(newActions)) return
    const timer = setTimeout(() => { void enqueueActionSave(() => reconcileActions(savedId)) }, 1200)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loadingEdit, newActions, savedId])

  // Resolve free-text combobox entries into real records (same pattern as the full editor)
  async function resolveWho() {
    const resolvedOrgIds: number[] = []
    for (const val of orgValues) {
      if (/^\d+$/.test(val)) {
        resolvedOrgIds.push(Number(val))
      } else {
        // Resolve server-side (exact match, then a prior merge-rule redirect,
        // else create) so e.g. typing "NCQA" attaches the existing "National
        // Committee for Quality Assurance (NCQA)" instead of a fresh duplicate.
        const resolved = await api.post<{ id: number }>('/companies/resolve', { name: val })
        resolvedOrgIds.push(resolved.id)
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

  // Delete a contact we auto-created in this picker once it's removed again with no
  // other info attached (its only footprint was this meeting's participant row, which
  // cascade-deletes). Best-effort — a failure just leaves the contact in place.
  async function cleanupAutoCreatedContact(id: number) {
    try {
      await api.delete(`/contacts/${id}`)
    } catch {
      return
    }
    const idStr = id.toString()
    setContactOptions((prev) => prev.filter((o) => o.value !== idStr))
    setContactMeta((prev) => {
      if (!prev.has(idStr)) return prev
      const next = new Map(prev)
      next.delete(idStr)
      return next
    })
    setMentionContacts((prev) => prev.filter((c) => c.id !== id))
    setParticipantNotes((prev) => {
      if (!(idStr in prev)) return prev
      const next = { ...prev }
      delete next[idStr]
      return next
    })
  }

  // Participant picker onChange. Two jobs:
  //  • Removal cleanup — any contact we auto-created here (tracked) that's now removed
  //    is deleted (it never gained info beyond this meeting; see cleanupAutoCreatedContact).
  //  • New typed name → a real Contact immediately, so it has an id the moment it's added:
  //    clickable to its card, included in autosave, never lost. The free-text value is
  //    swapped for the new id in place (carrying over any takeaway note). If creation
  //    fails the free-text value is left as-is and resolveWho() still creates it on finalize.
  async function handleParticipantsChange(newValues: string[]) {
    // Auto-cleanup contacts we created here that are being removed now.
    for (const v of participantIds) {
      if (newValues.includes(v)) continue
      const idNum = Number(v)
      if (/^\d+$/.test(v) && autoCreatedParticipantsRef.current.has(idNum)) {
        autoCreatedParticipantsRef.current.delete(idNum)
        void cleanupAutoCreatedContact(idNum)
      }
    }
    // Reflect the selection (incl. the just-typed name) right away.
    setParticipantIds(newValues)
    for (const val of newValues) {
      if (/^\d+$/.test(val)) continue
      if (creatingParticipantsRef.current.has(val)) continue
      creatingParticipantsRef.current.add(val)
      try {
        const created = await api.post<{
          id: number
          name: string
          preferredName?: string | null
          title?: string | null
          company?: { name: string } | null
        }>('/contacts', { name: val, status: 'CONNECTED', ecosystem: 'NETWORK' })
        const idStr = created.id.toString()
        autoCreatedParticipantsRef.current.add(created.id)
        // Swap free-text → new id everywhere it's referenced.
        setParticipantIds((prev) => prev.map((v) => (v === val ? idStr : v)))
        setContactOptions((prev) =>
          prev.some((o) => o.value === idStr) ? prev : [{ value: idStr, label: created.name }, ...prev]
        )
        setContactMeta((prev) => {
          const next = new Map(prev)
          next.set(idStr, { pronunciation: created.preferredName, title: created.title, employer: created.company?.name })
          return next
        })
        setMentionContacts((prev) =>
          prev.some((c) => c.id === created.id) ? prev : [...prev, { id: created.id, name: created.name, title: created.title }]
        )
        // Carry over a takeaway note typed against the free-text key.
        setParticipantNotes((prev) => {
          if (!(val in prev)) return prev
          const next = { ...prev }
          next[idStr] = next[val]
          delete next[val]
          return next
        })
        toast.success(`Created contact "${created.name}"`)
      } catch {
        toast.error(`Couldn't create contact "${val}" yet — it'll be saved when you finish`)
      } finally {
        creatingParticipantsRef.current.delete(val)
      }
    }
  }

  // Bulk-add participants from a pasted recipient list (e.g. copied out of Outlook):
  //   "Tricia Elliott <telliott@ncqa.org>; Sarah Shih <sshih@ncqa.org>; Kathryn Connor"
  // Each entry is resolved server-side to an existing contact (by email then name) or a
  // newly-created one; the ids are merged into the participant list (deduped). Brand-new
  // contacts are tracked so they auto-clean up if removed (same as a typed-in add).
  function parsePastedPeople(text: string): { name: string; email: string }[] {
    return text
      .split(/[;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        // "Name <email>" or "Name (email)"
        const tagged = entry.match(/^(.*?)[<(]\s*([^>)\s]+@[^>)\s]+)\s*[>)]?\s*$/)
        if (tagged) {
          return { name: tagged[1].replace(/["']/g, '').trim(), email: tagged[2].trim() }
        }
        // bare email
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry)) {
          return { name: '', email: entry }
        }
        // bare name
        return { name: entry.replace(/["']/g, '').trim(), email: '' }
      })
      .filter((p) => p.name || p.email)
  }

  async function handleBulkPasteParticipants(text: string) {
    const people = parsePastedPeople(text)
    if (people.length === 0) return
    const toastId = toast.loading(`Adding ${people.length} participant${people.length === 1 ? '' : 's'}…`)
    try {
      const { results } = await api.post<{
        results: {
          id: number
          name: string
          preferredName?: string | null
          title?: string | null
          company?: { id: number; name: string } | null
          created: boolean
        }[]
      }>('/contacts/resolve-participants', { people })
      if (results.length === 0) {
        toast.error('Could not read any participants from that paste', { id: toastId })
        return
      }
      setParticipantIds((prev) => {
        const next = [...prev]
        for (const r of results) {
          const idStr = r.id.toString()
          if (!next.includes(idStr)) next.push(idStr)
        }
        return next
      })
      setContactOptions((prev) => {
        const map = new Map(prev.map((o) => [o.value, o]))
        for (const r of results) map.set(r.id.toString(), { value: r.id.toString(), label: r.name })
        return Array.from(map.values())
      })
      setContactMeta((prev) => {
        const next = new Map(prev)
        for (const r of results) {
          next.set(r.id.toString(), { pronunciation: r.preferredName, title: r.title, employer: r.company?.name })
        }
        return next
      })
      setMentionContacts((prev) => {
        const seen = new Set(prev.map((c) => c.id))
        const add = results.filter((r) => !seen.has(r.id)).map((r) => ({ id: r.id, name: r.name, title: r.title }))
        return add.length ? [...prev, ...add] : prev
      })
      for (const r of results) if (r.created) autoCreatedParticipantsRef.current.add(r.id)
      const createdCount = results.filter((r) => r.created).length
      const matchedCount = results.length - createdCount
      const parts = [`Added ${results.length} participant${results.length === 1 ? '' : 's'}`]
      if (matchedCount) parts.push(`${matchedCount} already in contacts`)
      if (createdCount) parts.push(`${createdCount} new`)
      toast.success(parts.join(' · '), { id: toastId })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add participants', { id: toastId })
    }
  }

  // Finalize ("Done"): resolves free-text names into real records, persists the
  // full payload (incl. follow-up actions), flushes any staged prep notes /
  // attachments, then closes. Runs through the same save chain as autosave so it
  // can't race the first POST. Never sends `contactId` → legacy anchors untouched.
  // Resolve free-text names and persist the full meeting (incl. follow-up actions,
  // staged prep notes & attachments). Shared by the explicit Done/Log Meeting button
  // and the silent flush-on-close. Returns true if it persisted; `silent` suppresses
  // the validation/success toasts (a flush must never block dismissing the dialog).
  async function finalizeMeeting({ silent }: { silent: boolean }): Promise<boolean> {
    if (!date) {
      if (!silent) toast.error('Date is required')
      return false
    }
    if (!title.trim() && orgValues.length === 0 && participantIds.length === 0 && !attendeesDescription.trim()) {
      if (!silent) toast.error('Add a title (or someone who was there)')
      return false
    }
    setSaving(true)
    setSaveStatus('saving')
    try {
      await enqueueSave(async () => {
        const { resolvedOrgIds, participants, resolvedTagIds } = await resolveWho()

        const payload = {
          title: title.trim() || null,
          date,
          type,
          summary: summary.trim() || null,
          notes: notes.trim() || null,
          nextSteps: nextSteps.trim() || null,
          // First org anchors companyId (backward compat); the rest are junction rows
          companyId: resolvedOrgIds[0] ?? null,
          orgIds: resolvedOrgIds.slice(1),
          participants,
          attendeesDescription: attendeesDescription.trim() || null,
          seriesId: seriesId ? Number(seriesId) : null,
          tagIds: resolvedTagIds,
          // Follow-up actions are no longer created here — they autosave as real
          // Actions as you type (see reconcileActions). Any rows still unsaved
          // (e.g. added before the meeting existed) are flushed just below.
        }

        let conversationId = savedIdRef.current
        if (conversationId !== null) {
          await api.put(`/conversations/${conversationId}`, payload)
        } else {
          const created = await api.post<{ id: number }>('/conversations', payload)
          conversationId = created.id
          savedIdRef.current = created.id
          setSavedId(created.id)
        }
        // Mark the finalized state as saved so a trailing autosave is a no-op.
        lastSnapshotRef.current = JSON.stringify(buildAutosaveBody())

        // Flush follow-up actions: create any unsaved rows + push pending edits.
        // Chained on the action save queue so it can't race an in-flight autosave.
        await enqueueActionSave(() => reconcileActions(conversationId!))

        // Persist prep notes. Staged ones (added before the record existed) are
        // created now; the in-progress draft is flushed once — PUT if it already
        // autosaved live (has an id), otherwise POST. Draining the prep save chain
        // first ensures any in-flight live save has set the id (no double-create).
        for (const note of pendingPrepNotes) {
          await api.post('/conversation-prepnotes', {
            conversationId,
            content: note.content,
            date: note.date,
          })
        }
        await prepSaveChainRef.current
        const draft = newPrepContent.trim()
        if (draft) {
          if (newPrepNoteIdRef.current !== null) {
            await api.put(`/conversation-prepnotes/${newPrepNoteIdRef.current}`, { content: draft })
          } else {
            await api.post('/conversation-prepnotes', { conversationId, content: draft, date })
          }
        }
        for (const att of pendingAttachments) {
          await api.post('/conversation-attachments', { conversationId, ...att })
        }
      })

      if (!silent) toast.success(isEdit ? 'Meeting updated' : 'Meeting logged')
      // Pages that list meetings (e.g. /meetings) listen for this to refresh
      window.dispatchEvent(new CustomEvent('searchbook:meeting-logged'))
      return true
    } catch (err) {
      setSaveStatus('error')
      if (!silent) toast.error(err instanceof Error ? err.message : 'Failed to save meeting')
      throw err
    } finally {
      setSaving(false)
    }
  }

  // Explicit save button (Done / Log Meeting / Save Changes): finalize, then close.
  async function handleSave() {
    try {
      if (await finalizeMeeting({ silent: false })) onOpenChange(false)
    } catch {
      /* finalizeMeeting already surfaced the error toast */
    }
  }

  // Discard the autosaved (or edited) meeting entirely.
  async function handleDeleteMeeting() {
    if (savedIdRef.current === null) return
    if (!window.confirm('Delete this meeting? This cannot be undone.')) return
    setSaving(true)
    try {
      await api.delete(`/conversations/${savedIdRef.current}`)
      toast.success('Meeting deleted')
      window.dispatchEvent(new CustomEvent('searchbook:meeting-logged'))
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete meeting')
    } finally {
      setSaving(false)
    }
  }

  // Is there anything not yet persisted? Drives the flush-on-close: a dirty autosave
  // snapshot (scalar/numeric fields), free-text names autosave deliberately skips,
  // staged prep notes / attachments, an in-progress draft note, or unsaved actions.
  function hasUnsavedWork(): boolean {
    if (JSON.stringify(buildAutosaveBody()) !== lastSnapshotRef.current) return true
    if (
      participantIds.some((v) => !/^\d+$/.test(v)) ||
      orgValues.some((v) => !/^\d+$/.test(v)) ||
      tagIds.some((v) => !/^\d+$/.test(v))
    ) return true
    if (pendingPrepNotes.length > 0 || pendingAttachments.length > 0) return true
    if (newPrepContent.trim()) return true
    if (actionsDirty(newActions)) return true
    return false
  }

  // Closing via Cancel / X / Escape / click-outside keeps your work — it is NOT a
  // discard (that's the separate Delete button). Flush any unsaved content first
  // (incl. free-text names, which autosave skips, and content typed inside the
  // debounce window) so nothing is lost; hold the dialog open until it resolves.
  function handleDialogOpenChange(next: boolean) {
    if (next) {
      onOpenChange(true)
      return
    }
    if (hasUnsavedWork()) {
      void (async () => {
        try {
          await finalizeMeeting({ silent: true })
        } catch {
          toast.error('Some changes may not have saved')
        } finally {
          onOpenChange(false)
        }
      })()
      return
    }
    if (savedIdRef.current !== null) {
      window.dispatchEvent(new CustomEvent('searchbook:meeting-logged'))
    }
    onOpenChange(false)
  }

  // ── Prep notes ────────────────────────────────────────────
  // Serialize draft saves so a debounce + blur + finalize can't double-create.
  function enqueuePrepSave(fn: () => Promise<void>): Promise<void> {
    const next = prepSaveChainRef.current.then(fn, fn)
    prepSaveChainRef.current = next
    return next
  }

  // Autosave the in-progress draft note: POST on first save (capturing its id in
  // a ref), PUT thereafter. No-op until the meeting record exists — staged drafts
  // are persisted by finalize instead.
  async function saveDraftPrepNote(rawContent: string) {
    const convId = savedIdRef.current
    const content = rawContent.trim()
    if (convId === null || !content) return
    if (rawContent === newPrepSavedRef.current) return
    setDraftStatus('saving')
    try {
      if (newPrepNoteIdRef.current === null) {
        const created = await api.post<ConversationPrepNote>('/conversation-prepnotes', {
          conversationId: convId,
          content,
          date: new Date().toLocaleDateString('en-CA'),
        })
        newPrepNoteIdRef.current = created.id
      } else {
        await api.put(`/conversation-prepnotes/${newPrepNoteIdRef.current}`, { content })
      }
      newPrepSavedRef.current = rawContent
      setDraftStatus('saved')
      if (draftFlashRef.current) clearTimeout(draftFlashRef.current)
      draftFlashRef.current = setTimeout(() => setDraftStatus('idle'), 2000)
    } catch {
      setDraftStatus('error')
    }
  }

  async function reloadPrepNotes() {
    const convId = savedIdRef.current
    if (convId === null) return
    try {
      const notes = await api.get<ConversationPrepNote[]>(`/conversation-prepnotes?conversationId=${convId}`)
      setPrepNotes(notes)
    } catch {
      /* keep optimistic state on failure */
    }
  }

  // "New note": commit the current draft and clear the composer for the next one.
  // Live record → ensure it's saved, then pull the canonical list; otherwise stage.
  async function commitDraftPrepNote() {
    const content = newPrepContent.trim()
    if (!content) return
    if (savedIdRef.current !== null) {
      await enqueuePrepSave(() => saveDraftPrepNote(newPrepContent))
      await reloadPrepNotes()
    } else {
      setPendingPrepNotes((prev) => [...prev, { content, date: new Date().toLocaleDateString('en-CA') }])
    }
    setNewPrepContent('')
    newPrepNoteIdRef.current = null
    newPrepSavedRef.current = ''
    setDraftStatus('idle')
  }

  function updatePendingPrepNote(index: number, content: string) {
    setPendingPrepNotes((prev) => prev.map((n, i) => (i === index ? { ...n, content } : n)))
  }

  async function deletePrepNote(id: number) {
    try {
      await api.delete(`/conversation-prepnotes/${id}`)
      setPrepNotes((prev) => prev.filter((n) => n.id !== id))
    } catch {
      toast.error('Failed to delete prep note')
    }
  }

  // Copy the previous series meeting's prep notes into THIS meeting as fresh,
  // editable prep notes. This is a one-way duplicate of the content — it never
  // touches the prior meeting's own prep-note records. In create mode the copies
  // stage as pending notes (persisted on finalize like any staged prep note); once
  // the record exists (edit mode, or after autosave) they're POSTed as real notes.
  // Dated today, since they represent prep for the new meeting, not the old one.
  async function copyPrepNotesFromSeries() {
    const source = seriesContext
    const sourceNotes = source?.prepNotes
    if (!source || !sourceNotes || sourceNotes.length === 0) return
    const today = new Date().toLocaleDateString('en-CA')
    if (savedIdRef.current !== null) {
      try {
        for (const n of sourceNotes) {
          await api.post('/conversation-prepnotes', {
            conversationId: savedIdRef.current,
            content: n.content,
            date: today,
          })
        }
        await reloadPrepNotes()
      } catch {
        toast.error('Failed to copy prep notes')
        return
      }
    } else {
      setPendingPrepNotes((prev) => [
        ...prev,
        ...sourceNotes.map((n) => ({ content: n.content, date: today })),
      ])
    }
    // Make sure the prep section is open so the copied notes are visible (matters on
    // mobile / when the panel isn't shown). Once the meeting has prep notes of its
    // own, the source box hides itself (see its render condition) — durably, so it
    // stays hidden after save + reopen.
    setShowTagsPrep(true)
    toast.success(
      `Copied ${sourceNotes.length} prep note${sourceNotes.length === 1 ? '' : 's'} from the last meeting`
    )
  }

  // ── Follow-up actions ─────────────────────────────────────
  // Serialize action saves so a debounce + finalize can't double-create.
  function enqueueActionSave(fn: () => Promise<void>): Promise<void> {
    const next = actionSaveChainRef.current.then(fn, fn)
    actionSaveChainRef.current = next
    return next
  }

  function flashActionsSaved() {
    setActionsSaveStatus('saved')
    if (actionsFlashRef.current) clearTimeout(actionsFlashRef.current)
    actionsFlashRef.current = setTimeout(() => setActionsSaveStatus('idle'), 2000)
  }

  // Persist every composer row that has a title: POST new ones, PUT changed ones.
  // Reads current rows from newActionsRef; uses savedActionsRef (updated
  // synchronously after each write) as the dedup authority so chained reconciles
  // never double-create.
  async function reconcileActions(convId: number) {
    const rows = newActionsRef.current
    if (!actionsDirty(rows)) return
    setActionsSaveStatus('saving')
    try {
      for (const a of rows) {
        if (!a.title.trim()) continue
        const body = actionBody(a)
        const snap = JSON.stringify(body)
        const saved = savedActionsRef.current.get(a.key)
        if (!saved) {
          const created = await api.post<{ id: number }>('/actions', { ...body, conversationId: convId })
          savedActionsRef.current.set(a.key, { id: created.id, snapshot: snap })
        } else if (saved.snapshot !== snap) {
          await api.put(`/actions/${saved.id}`, body)
          savedActionsRef.current.set(a.key, { id: saved.id, snapshot: snap })
        }
      }
      flashActionsSaved()
    } catch {
      setActionsSaveStatus('error')
    }
  }

  function addAction() {
    // Prepend so the freshly-added composer row appears at the top of the list,
    // right under the "Add action" button where it's easy to find and fill in.
    // Saving is key-based (reconcileActions dedups by row key), so order is cosmetic.
    setNewActions((prev) => [makePendingAction(), ...prev])
  }

  function updateAction(key: number, patch: Partial<PendingAction>) {
    setNewActions((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)))
  }

  // Remove a composer row; delete the underlying Action too if it was persisted.
  async function removeAction(key: number) {
    setNewActions((prev) => prev.filter((a) => a.key !== key))
    const saved = savedActionsRef.current.get(key)
    savedActionsRef.current.delete(key)
    if (saved) {
      try {
        await api.delete(`/actions/${saved.id}`)
      } catch {
        toast.error('Failed to delete action')
      }
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
      api.get<{ id: number; name: string }[]>('/companies/favorites').then(setCompanyFavorites).catch(() => { })
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
        if (savedIdRef.current !== null) {
          const created = await api.post<ConversationAttachment>('/conversation-attachments', {
            conversationId: savedIdRef.current,
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

  // ── Series picker ─────────────────────────────────────────
  // '' clears; an existing id selects; a typed name (isNew) creates the series
  // immediately so seriesId is always numeric and rides the normal autosave body.
  async function handleSeriesChange(value: string, isNew: boolean) {
    if (!value) {
      setSeriesId('')
      return
    }
    if (!isNew) {
      setSeriesId(value)
      return
    }
    try {
      const created = await api.post<{ id: number; name: string }>('/series', { name: value })
      setSeriesOptions((prev) => (prev.some((s) => s.id === created.id) ? prev : [...prev, created]))
      setSeriesId(created.id.toString())
    } catch {
      toast.error('Failed to create series')
    }
  }

  const participantNameOf = (val: string) =>
    contactOptions.find((o) => o.value === val)?.label || val

  const companyNameOf = (val: string) =>
    companyOptions.find((o) => o.value === val)?.label || val

  const quickAddFavorites = favorites.filter(
    (f) => !participantIds.includes(f.id.toString())
  )

  const quickAddCompanyFavorites = companyFavorites.filter(
    (f) => !orgValues.includes(f.id.toString())
  )

  // Prep info shown in the left panel: the meeting's own prep notes (live or
  // staged) plus the previous meeting in the same series. The side panel is
  // desktop-only — on mobile the same prep block renders inline in the form.
  // The left prep panel opens whenever prep context exists OR the user expands the
  // "Tags, prep notes & attachments" section — so clicking that caret reveals the
  // prep-note bar on desktop right away (not only after a note is saved + reopened).
  const showPanel = prepNotes.length > 0 || pendingPrepNotes.length > 0 || !!seriesContext || showTagsPrep
  const usePanel = showPanel && isDesktop

  // Does this meeting already have prep notes of its own (saved or staged)? Copying
  // the last meeting's prep notes populates these, so this durably hides the
  // "Copy to prep notes" source box — including after save + reopen.
  const meetingHasPrepNotes = prepNotes.length > 0 || pendingPrepNotes.length > 0

  // Prep notes list + composer. Rendered in the left panel when it's visible,
  // otherwise inside the "Prep, tags & attachments" section. Saved notes are
  // inline-editable and autosave; the composer autosaves the in-progress draft.
  const prepNotesBlock = (
    <div className="space-y-2">
      {prepNotes.map((note) => (
        <EditablePrepNote key={note.id} note={note} onDelete={() => deletePrepNote(note.id)} mentionContacts={mentionContacts} mentionCompanies={mentionCompanies} />
      ))}
      {pendingPrepNotes.map((note, i) => (
        <div key={`pending-${i}`} className="space-y-1 rounded-md bg-yellow-50 p-2">
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setPendingPrepNotes((prev) => prev.filter((_, j) => j !== i))}
              className="text-muted-foreground hover:text-destructive"
              title="Remove prep note"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <MarkdownTextarea
            value={note.content}
            onChange={(v) => updatePendingPrepNote(i, v)}
            placeholder="Things to raise, questions to ask... (type @ to mention)"
            rows={2}
            mentionContacts={mentionContacts}
            mentionCompanies={mentionCompanies}
          />
        </div>
      ))}
      <div className="space-y-1">
        <MarkdownTextarea
          value={newPrepContent}
          onChange={setNewPrepContent}
          onBlur={() => { void enqueuePrepSave(() => saveDraftPrepNote(newPrepContent)) }}
          placeholder="Things to raise, questions to ask... (type @ to mention, autosaves)"
          rows={2}
          mentionContacts={mentionContacts}
          mentionCompanies={mentionCompanies}
        />
        {newPrepContent.trim() && (
          <div className="flex items-center justify-between">
            <SaveStatusIndicator status={draftStatus} className="text-xs" />
            <Button type="button" variant="outline" size="sm" onClick={commitDraftPrepNote}>
              <Plus className="mr-1 h-3 w-3" />
              New note
            </Button>
          </div>
        )}
      </div>
    </div>
  )

  const formBody = (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
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
        <div className="space-y-2">
          <Label htmlFor="ql-series">Series</Label>
          <Combobox
            options={seriesOptions.map((s) => ({ value: s.id.toString(), label: s.name }))}
            value={seriesId}
            onChange={handleSeriesChange}
            allowFreeText
            placeholder="No series"
            searchPlaceholder="Find or create a series…"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ql-date">Date &amp; time</Label>
          <div className="flex gap-2">
            <Input id="ql-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="flex-1" />
            <div className="flex items-center gap-1">
              <Input
                aria-label="Start time"
                title="Start time (optional)"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-[7.5rem]"
              />
              {/* Explicit clear — the native time input's clear control is hard to
                  find (and absent on mobile); this reliably blanks the time, which
                  autosaves as startTime: null. */}
              {startTime && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                  title="Clear start time"
                  aria-label="Clear start time"
                  onClick={() => setStartTime('')}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
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
      {/* ── Participants — primary; always visible ── */}
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
          onChange={handleParticipantsChange}
          optionMeta={contactMeta}
          placeholder="Named people in the meeting..."
          searchPlaceholder="Search, type a new name, or paste a list…"
          allowFreeText={true}
          onBulkPaste={handleBulkPasteParticipants}
        />
        <p className="text-xs text-muted-foreground">
          Tip: paste a list like <span className="font-mono">Name &lt;email&gt;; Name &lt;email&gt;</span> to add everyone at once — matched to existing contacts, creating any that are new.
        </p>
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
              <PersonTooltip
                name={participantNameOf(val)}
                pronunciation={contactMeta.get(val)?.pronunciation}
                title={contactMeta.get(val)?.title}
                employer={contactMeta.get(val)?.employer}
              >
                {isExisting ? (
                  // Jump to the contact's card (works for people just created on add,
                  // since they now have an id). Flush + close the dialog on the way.
                  <Link
                    to={`/contacts/${val}`}
                    // Ctrl/Cmd/Shift/Alt/middle-click opens the card in a NEW tab
                    // (browser default; react-router skips client-nav on a modified
                    // click) — keep the meeting log open so you can keep documenting
                    // there. A plain left-click navigates in place, so flush + close.
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                      handleDialogOpenChange(false)
                    }}
                    className="w-28 shrink-0 truncate text-xs text-primary hover:underline"
                    title={`Open ${participantNameOf(val)}'s card`}
                  >
                    {participantNameOf(val)}
                  </Link>
                ) : (
                  <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">
                    {participantNameOf(val)}
                  </span>
                )}
              </PersonTooltip>
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

      {/* ── Notes — primary; always visible ── */}
      <div className="space-y-2">
        <Label htmlFor="ql-notes">Notes</Label>
        <MarkdownTextarea
          id="ql-notes"
          value={notes}
          onChange={setNotes}
          placeholder="Optional — use ### headings for topics; @ to mention a person or org; paste screenshots directly"
          rows={isEdit ? 10 : 6}
          mentionContacts={mentionContacts}
          mentionCompanies={mentionCompanies}
        />
      </div>

      {/* ── Actions — primary; always visible ──
          Each composer row autosaves as a real Action once the meeting record
          exists (POST then debounced PUT), with a per-row "who owns it" picker. */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1">
            <ListTodo className="h-3.5 w-3.5" /> Follow-up actions
          </Label>
          <div className="flex items-center gap-2">
            <SaveStatusIndicator status={actionsSaveStatus} className="text-xs" />
            <Button type="button" size="sm" onClick={addAction}>
              <Plus className="mr-1 h-3 w-3" />
              Add action
            </Button>
          </div>
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
        {newActions.map((a) => {
          const quickAddOwers = favorites.filter((f) => !a.owerIds.includes(f.id.toString()))
          return (
          <div key={a.key} className="space-y-2 rounded-md border p-2">
            <div className="flex items-center gap-2">
              <Input
                value={a.title}
                onChange={(e) => updateAction(a.key, { title: e.target.value })}
                placeholder="e.g. Send follow-up email"
                className="h-8 text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => removeAction(a.key)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            {a.title.trim() && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <Select value={a.type} onValueChange={(v) => updateAction(a.key, { type: v as ActionType })}>
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
                    onChange={(e) => updateAction(a.key, { dueDate: e.target.value })}
                    className="h-8 text-xs"
                  />
                  <Select value={a.priority} onValueChange={(v) => updateAction(a.key, { priority: v as ActionPriority })}>
                    <SelectTrigger className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACTION_PRIORITY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Who owns it — defaults to Me; remove Me and/or add people you're waiting on */}
                <div className="space-y-1.5 rounded-md bg-muted/30 p-2">
                  <span className="text-xs font-medium text-muted-foreground">Who owns it</span>
                  <div className="flex flex-wrap gap-1">
                    {a.owedByMe ? (
                      <span className="flex items-center gap-1 rounded-full border bg-primary/10 px-2 py-0.5 text-xs text-foreground">
                        Me
                        <button
                          type="button"
                          onClick={() => updateAction(a.key, { owedByMe: false })}
                          className="text-muted-foreground hover:text-foreground"
                          title="Remove me"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => updateAction(a.key, { owedByMe: true })}
                        className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
                        title="Add me back"
                      >
                        <Plus className="h-3 w-3" />
                        Me
                      </button>
                    )}
                    {quickAddOwers.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => updateAction(a.key, { owerIds: [...a.owerIds, f.id.toString()] })}
                        className="flex items-center gap-1 rounded-full border bg-amber-50 px-2 py-0.5 text-xs text-amber-900 hover:bg-amber-100"
                        title="Add to who owns it"
                      >
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {f.name}
                        <Plus className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                  <MultiCombobox
                    options={contactOptions}
                    values={a.owerIds}
                    onChange={(vals) => updateAction(a.key, { owerIds: vals })}
                    placeholder="Add people who own it..."
                    searchPlaceholder="Search contacts..."
                  />
                </div>
              </>
            )}
          </div>
          )
        })}
      </div>

      {/* ── Secondary, organized into labeled disclosures ── */}

      {/* Organizations & attendees */}
      <button
        type="button"
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        onClick={() => setShowContext((v) => !v)}
      >
        {showContext ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Organizations &amp; attendees
        {(orgValues.length > 0 || attendeesDescription) && (
          <span className="text-xs text-primary">·</span>
        )}
      </button>
      {showContext && (
        <div className="grid gap-4 rounded-md border p-3">
          <div className="space-y-2">
            <Label>Organizations</Label>
            {quickAddCompanyFavorites.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {quickAddCompanyFavorites.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setOrgValues((prev) => [...prev, f.id.toString()])}
                    className="flex items-center gap-1 rounded-full border bg-amber-50 px-2 py-0.5 text-xs text-amber-900 hover:bg-amber-100"
                    title="Add to organizations"
                  >
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    {f.name}
                    <Plus className="h-3 w-3" />
                  </button>
                ))}
              </div>
            )}
            <MultiCombobox
              options={companyOptions}
              values={orgValues}
              onChange={setOrgValues}
              placeholder="With which orgs..."
              searchPlaceholder="Search or type new name..."
              allowFreeText={true}
            />
            {orgValues.map((val) => {
              const isExisting = /^\d+$/.test(val)
              if (!isExisting) return null
              const isFav = companyFavorites.some((f) => f.id === Number(val))
              return (
                <div key={val} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleCompanyFavorite(Number(val), companyNameOf(val))}
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
                  <span className="truncate text-xs text-muted-foreground" title={companyNameOf(val)}>
                    {companyNameOf(val)}
                  </span>
                </div>
              )
            })}
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

      {/* Summary & next steps */}
      <button
        type="button"
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        onClick={() => setShowSummaryNotes((v) => !v)}
      >
        {showSummaryNotes ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Summary &amp; next steps
        {(summary || nextSteps) && (
          <span className="text-xs text-primary">·</span>
        )}
      </button>
      {showSummaryNotes && (
        <div className="grid gap-4 rounded-md border p-3">
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
            <Label htmlFor="ql-nextsteps">Next steps</Label>
            <MarkdownTextarea
              id="ql-nextsteps"
              value={nextSteps}
              onChange={setNextSteps}
              placeholder="What happens next — use ### headings, bold, lists; @ to mention a person or org…"
              rows={3}
              mentionContacts={mentionContacts}
              mentionCompanies={mentionCompanies}
            />
          </div>
        </div>
      )}

      {/* Tags, prep notes & attachments */}
      <button
        type="button"
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        onClick={() => setShowTagsPrep((v) => !v)}
      >
        {showTagsPrep ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Tags, prep notes &amp; attachments
        {(tagIds.length > 0 || prepNotes.length > 0 || pendingPrepNotes.length > 0 ||
          attachments.length > 0 || pendingAttachments.length > 0) && (
            <span className="text-xs text-primary">·</span>
          )}
      </button>
      {showTagsPrep && (
        <div className="grid gap-4 rounded-md border p-3">
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

          {/* Prep notes live in the desktop left panel once any exist; otherwise
              (and always on mobile) the list + composer sit here in the form */}
          {!usePanel && (
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
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      {/* Desktop: drag the bottom-right corner to widen/narrow this free-text dialog. */}
      <DialogContent
        className={cn('max-h-[90vh] w-[95vw] overflow-y-auto [scrollbar-gutter:stable] sm:resize sm:overflow-auto sm:min-w-[24rem] sm:max-h-[90vh] sm:max-w-[95vw]', usePanel ? 'sm:w-[64rem]' : 'sm:w-[52rem]')}
        // Dragging the prep/form resize handle fires a pointer-down that Radix
        // mis-reads as an outside interaction (react-resizable-panels' native
        // handler pre-empts Radix's "inside" marker) — keep the dialog open for it.
        onInteractOutside={(e) => {
          const t = e.detail.originalEvent.target as HTMLElement | null
          if (t?.closest?.('[data-slot="resizable-handle"],[data-slot="resizable-panel-group"]')) {
            e.preventDefault()
          }
        }}
      >
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <DialogTitle>{isEdit ? 'Edit Meeting' : 'Quick Log Meeting'}</DialogTitle>
            <SaveStatusIndicator status={saveStatus} />
          </div>
          <DialogDescription>
            {isEdit
              ? 'Update any detail of this meeting.'
              : 'Title + date is enough — it autosaves as you type.'}
          </DialogDescription>
        </DialogHeader>
        {loadingEdit ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : usePanel ? (
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
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium">Next: </span>
                          <div className="prep-note-markdown inline">
                            <ReactMarkdown>{seriesContext.nextSteps}</ReactMarkdown>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Offer the last meeting's prep notes only while THIS meeting has
                        none of its own. Copying them (or writing any) populates the
                        panel above and hides this source box — durably, so it stays
                        gone after save + reopen, freeing room for the notes box. */}
                    {seriesContext.prepNotes && seriesContext.prepNotes.length > 0 &&
                      !meetingHasPrepNotes && (
                      <div className="mt-2 space-y-1 rounded-md bg-yellow-50/60 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1 text-xs font-medium text-amber-900">
                            <FileText className="h-3 w-3" /> Prep notes
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 px-2 text-xs"
                            onClick={copyPrepNotesFromSeries}
                            title="Copy these prep notes into this meeting to reuse and edit — the last meeting's record is unchanged"
                          >
                            <Copy className="h-3 w-3" />
                            Copy to prep notes
                          </Button>
                        </div>
                        {seriesContext.prepNotes.map((n) => (
                          <div
                            key={n.id}
                            className="prep-note-markdown max-h-32 overflow-y-auto text-xs text-muted-foreground"
                          >
                            <ReactMarkdown>{n.content}</ReactMarkdown>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={65} minSize={30} className="pl-4">
              <div className="h-full overflow-y-auto [scrollbar-gutter:stable] pb-4 pr-2">{formBody}</div>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          formBody
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          {recordExists ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:mr-auto"
              onClick={handleDeleteMeeting}
              disabled={saving}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Delete this meeting
            </Button>
          ) : (
            <span className="hidden sm:block" />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>
              {recordExists ? 'Close' : 'Cancel'}
            </Button>
            <Button onClick={handleSave} disabled={saving || loadingEdit}>
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : recordExists ? 'Done' : 'Log Meeting'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
