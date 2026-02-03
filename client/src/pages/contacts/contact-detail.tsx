import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { api } from '@/lib/api'
import type {
  Contact,
  Action,
  Conversation,
  Relationship,
  ConversationType,
  DatePrecision,
  RelationshipType,
  ActionType,
  ActionPriority,
} from '@/lib/types'
import {
  ECOSYSTEM_OPTIONS,
  CONTACT_STATUS_OPTIONS,
  ACTION_TYPE_OPTIONS,
  ACTION_PRIORITY_OPTIONS,
  CONVERSATION_TYPE_OPTIONS,
  DATE_PRECISION_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
} from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Card,
  CardContent,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { MultiCombobox, type ComboboxOption } from '@/components/ui/combobox'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Pencil,
  Trash2,
  ExternalLink,
  Plus,
  Check,
  MessageSquare,
  Users,
  FileText,
  User,
} from 'lucide-react'

// ─── Color maps ─────────────────────────────────────────────

const actionTypeColors: Record<string, string> = {
  EMAIL: 'bg-blue-100 text-blue-800',
  CALL: 'bg-green-100 text-green-800',
  MEET: 'bg-teal-100 text-teal-800',
  READ: 'bg-purple-100 text-purple-800',
  WRITE: 'bg-indigo-100 text-indigo-800',
  RESEARCH: 'bg-amber-100 text-amber-800',
  FOLLOW_UP: 'bg-orange-100 text-orange-800',
  INTRO: 'bg-cyan-100 text-cyan-800',
  OTHER: 'bg-slate-100 text-slate-700',
}

const actionPriorityColors: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  LOW: 'bg-slate-100 text-slate-600',
}

const ecosystemColors: Record<string, string> = {
  RECRUITER: 'bg-blue-100 text-blue-800',
  ROLODEX: 'bg-purple-100 text-purple-800',
  TARGET: 'bg-green-100 text-green-800',
  INFLUENCER: 'bg-amber-100 text-amber-800',
  ACADEMIA: 'bg-rose-100 text-rose-800',
  INTRO_SOURCE: 'bg-cyan-100 text-cyan-800',
}

const statusColors: Record<string, string> = {
  NEW: 'bg-slate-100 text-slate-700',
  CONNECTED: 'bg-green-100 text-green-700',
  AWAITING_RESPONSE: 'bg-yellow-100 text-yellow-700',
  FOLLOW_UP_NEEDED: 'bg-orange-100 text-orange-700',
  WARM_LEAD: 'bg-emerald-100 text-emerald-700',
  ON_HOLD: 'bg-gray-100 text-gray-500',
  CLOSED: 'bg-red-100 text-red-700',
}

const conversationTypeColors: Record<string, string> = {
  CALL: 'bg-green-100 text-green-800',
  VIDEO_CALL: 'bg-teal-100 text-teal-800',
  EMAIL: 'bg-blue-100 text-blue-800',
  MEETING: 'bg-purple-100 text-purple-800',
  LINKEDIN: 'bg-sky-100 text-sky-800',
  COFFEE: 'bg-amber-100 text-amber-800',
  EVENT: 'bg-rose-100 text-rose-800',
  OTHER: 'bg-slate-100 text-slate-700',
}

const relationshipTypeColors: Record<string, string> = {
  REFERRED_BY: 'bg-green-100 text-green-800',
  WORKS_WITH: 'bg-blue-100 text-blue-800',
  KNOWS: 'bg-purple-100 text-purple-800',
  INTRODUCED_BY: 'bg-amber-100 text-amber-800',
  REPORTS_TO: 'bg-rose-100 text-rose-800',
}

function getLabel(value: string, options: { value: string; label: string }[]) {
  return options.find((o) => o.value === value)?.label ?? value
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatConversationDate(dateStr: string, precision: DatePrecision) {
  const d = new Date(dateStr + 'T00:00:00')
  switch (precision) {
    case 'DAY':
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    case 'MONTH':
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    case 'QUARTER': {
      const q = Math.ceil((d.getMonth() + 1) / 3)
      return `Q${q} ${d.getFullYear()}`
    }
    case 'YEAR':
      return d.getFullYear().toString()
    default:
      return dateStr
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null
  return (
    <div className="space-y-1">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────

export function ContactDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [contact, setContact] = useState<Contact | null>(null)
  const [actions, setActions] = useState<Action[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [allContacts, setAllContacts] = useState<{ id: number; name: string }[]>([])
  const [allCompanies, setAllCompanies] = useState<{ id: number; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const loadData = useCallback(() => {
    if (!id) return
    api.get<Contact>(`/contacts/${id}`)
      .then(setContact)
      .catch((err) => {
        toast.error(err.message)
        navigate('/contacts')
      })
      .finally(() => setLoading(false))

    api.get<Action[]>(`/actions?contactId=${id}`).then(setActions).catch(() => {})
    api.get<Conversation[]>(`/conversations?contactId=${id}`).then(setConversations).catch(() => {})
    api.get<Relationship[]>(`/relationships?contactId=${id}`).then(setRelationships).catch(() => {})
  }, [id, navigate])

  useEffect(() => {
    loadData()
    // Load contacts and companies for comboboxes in dialogs
    api.get<{ id: number; name: string }[]>('/contacts').then(
      (data) => setAllContacts(data.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })))
    ).catch(() => {})
    api.get<{ id: number; name: string }[]>('/companies').then(
      (data) => setAllCompanies(data.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })))
    ).catch(() => {})
  }, [loadData])

  async function toggleActionComplete(action: Action) {
    try {
      await api.patch<Action>(`/actions/${action.id}/complete`)
      const updated = await api.get<Action[]>(`/actions?contactId=${id}`)
      setActions(updated)
      toast.success(action.completed ? 'Marked incomplete' : 'Marked complete')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update'
      toast.error(message)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.delete(`/contacts/${id}`)
      toast.success('Contact deleted')
      navigate('/contacts')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <div className="text-muted-foreground">Loading...</div>
  if (!contact) return <div className="text-muted-foreground">Contact not found.</div>

  const companyDisplay = contact.company
    ? contact.company.name
    : contact.companyName || null

  const contactOptions: ComboboxOption[] = allContacts
    .filter((c) => c.id !== contact.id)
    .map((c) => ({ value: c.id.toString(), label: c.name }))

  const companyOptions: ComboboxOption[] = allCompanies.map((c) => ({
    value: c.id.toString(),
    label: c.name,
  }))

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/contacts')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              {(contact.photoFile || contact.photoUrl) && (
                <img
                  src={contact.photoFile || contact.photoUrl || ''}
                  alt={contact.name}
                  className="h-20 w-20 rounded-lg object-cover border"
                />
              )}
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{contact.name}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {contact.title && (
                    <span className="text-sm text-muted-foreground">{contact.title}</span>
                  )}
                  {contact.title && companyDisplay && (
                    <span className="text-sm text-muted-foreground">at</span>
                  )}
                  {contact.company ? (
                    <Link
                      to={`/companies/${contact.company.id}`}
                      className="text-sm text-primary hover:underline"
                    >
                      {contact.company.name}
                    </Link>
                  ) : companyDisplay ? (
                    <span className="text-sm text-muted-foreground">{companyDisplay}</span>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <Badge variant="outline" className={ecosystemColors[contact.ecosystem]}>
                {getLabel(contact.ecosystem, ECOSYSTEM_OPTIONS)}
              </Badge>
              <Badge variant="outline" className={statusColors[contact.status]}>
                {getLabel(contact.status, CONTACT_STATUS_OPTIONS)}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/contacts/${contact.id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Contact</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete <strong>{contact.name}</strong>? This
                  action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">
            <User className="mr-1 h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="conversations">
            <MessageSquare className="mr-1 h-4 w-4" />
            Conversations
            {conversations.length > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">({conversations.length})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="relationships">
            <Users className="mr-1 h-4 w-4" />
            Relationships
            {relationships.length > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">({relationships.length})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="prep">
            <FileText className="mr-1 h-4 w-4" />
            Prep Sheet
          </TabsTrigger>
        </TabsList>

        {/* ─── Overview Tab ─────────────────────────────── */}
        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Email">
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className="text-primary hover:underline">
                      {contact.email}
                    </a>
                  )}
                </Field>
                <Field label="Phone">{contact.phone}</Field>
                <Field label="LinkedIn">
                  {contact.linkedinUrl && (
                    <a
                      href={contact.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Profile
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </Field>
                <Field label="Location">{contact.location}</Field>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Connections</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4">
                <Field label="How Connected">{contact.howConnected}</Field>
                <Field label="Referred By">
                  {contact.referredBy && (
                    <Link
                      to={`/contacts/${contact.referredBy.id}`}
                      className="text-primary hover:underline"
                    >
                      {contact.referredBy.name}
                    </Link>
                  )}
                </Field>
                {contact.referrals && contact.referrals.length > 0 && (
                  <Field label="Referrals">
                    <div className="flex flex-wrap gap-2">
                      {contact.referrals.map((r) => (
                        <Link
                          key={r.id}
                          to={`/contacts/${r.id}`}
                          className="text-primary hover:underline"
                        >
                          {r.name}
                        </Link>
                      ))}
                    </div>
                  </Field>
                )}
                <Field label="Mutual Connections">{contact.mutualConnections}</Field>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Research</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4">
                <Field label="Where Found">{contact.whereFound}</Field>
                <Field label="Open Questions">
                  {contact.openQuestions && (
                    <p className="whitespace-pre-wrap">{contact.openQuestions}</p>
                  )}
                </Field>
                <Field label="Notes">
                  {contact.notes && (
                    <p className="whitespace-pre-wrap">{contact.notes}</p>
                  )}
                </Field>
              </dl>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Actions</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/actions/new?contactId=${contact.id}`}>
                  <Plus className="mr-1 h-3 w-3" />
                  New Action
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {actions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No actions yet.</p>
              ) : (
                <div className="space-y-2">
                  {actions.map((action) => {
                    const overdue =
                      !action.completed &&
                      action.dueDate &&
                      action.dueDate < new Date().toISOString().split('T')[0]
                    return (
                      <div
                        key={action.id}
                        className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
                      >
                        <button
                          onClick={() => toggleActionComplete(action)}
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                            action.completed
                              ? 'border-green-500 bg-green-500 text-white'
                              : 'border-muted-foreground/30 hover:border-green-500'
                          }`}
                        >
                          {action.completed && <Check className="h-2.5 w-2.5" />}
                        </button>
                        <Link
                          to={`/actions/${action.id}`}
                          className={`flex-1 text-sm hover:underline ${
                            action.completed ? 'text-muted-foreground line-through' : ''
                          }`}
                        >
                          {action.title}
                        </Link>
                        <Badge
                          variant="outline"
                          className={`text-xs ${actionTypeColors[action.type]}`}
                        >
                          {getLabel(action.type, ACTION_TYPE_OPTIONS)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-xs ${actionPriorityColors[action.priority]}`}
                        >
                          {getLabel(action.priority, ACTION_PRIORITY_OPTIONS)}
                        </Badge>
                        {action.dueDate && (
                          <span
                            className={`text-xs ${
                              overdue
                                ? 'font-semibold text-red-600'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {new Date(action.dueDate + 'T00:00:00').toLocaleDateString(
                              'en-US',
                              { month: 'short', day: 'numeric' }
                            )}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Conversations Tab ─────────────────────────── */}
        <TabsContent value="conversations" className="space-y-4">
          <ConversationsTab
            contactId={contact.id}
            conversations={conversations}
            contactOptions={contactOptions}
            companyOptions={companyOptions}
            onRefresh={loadData}
          />
        </TabsContent>

        {/* ─── Relationships Tab ─────────────────────────── */}
        <TabsContent value="relationships" className="space-y-4">
          <RelationshipsTab
            contactId={contact.id}
            contactName={contact.name}
            relationships={relationships}
            contactOptions={contactOptions}
            onRefresh={loadData}
          />
        </TabsContent>

        {/* ─── Prep Sheet Tab ─────────────────────────── */}
        <TabsContent value="prep" className="space-y-4">
          <PrepSheetTab
            contact={contact}
            conversations={conversations}
            relationships={relationships}
            actions={actions}
          />
        </TabsContent>
      </Tabs>

      {/* Timestamps */}
      <div className="flex gap-6 text-xs text-muted-foreground">
        <span>Created {formatDate(contact.createdAt)}</span>
        <span>Updated {formatDate(contact.updatedAt)}</span>
      </div>
    </div>
  )
}

// ─── Conversations Tab component ────────────────────────────

function ConversationsTab({
  contactId,
  conversations,
  contactOptions,
  companyOptions,
  onRefresh,
}: {
  contactId: number
  conversations: Conversation[]
  contactOptions: ComboboxOption[]
  companyOptions: ComboboxOption[]
  onRefresh: () => void
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const emptyForm = {
    date: new Date().toISOString().split('T')[0],
    datePrecision: 'DAY' as DatePrecision,
    type: 'OTHER' as ConversationType,
    summary: '',
    notes: '',
    nextSteps: '',
    contactsDiscussed: [] as string[],
    companiesDiscussed: [] as string[],
    // Follow-up action fields
    actionTitle: '',
    actionType: 'FOLLOW_UP' as ActionType,
    actionDueDate: '',
    actionPriority: 'MEDIUM' as ActionPriority,
  }

  const [form, setForm] = useState(emptyForm)

  function openNew() {
    setEditId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(conv: Conversation) {
    setEditId(conv.id)
    setForm({
      date: conv.date,
      datePrecision: conv.datePrecision as DatePrecision,
      type: conv.type as ConversationType,
      summary: conv.summary || '',
      notes: conv.notes || '',
      nextSteps: conv.nextSteps || '',
      contactsDiscussed: conv.contactsDiscussed.map((cd) => cd.contact.id.toString()),
      companiesDiscussed: conv.companiesDiscussed.map((cd) => cd.company.id.toString()),
      actionTitle: '',
      actionType: 'FOLLOW_UP',
      actionDueDate: '',
      actionPriority: 'MEDIUM',
    })
    setDialogOpen(true)
  }

  async function handleSubmit() {
    if (!form.date) {
      toast.error('Date is required')
      return
    }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        contactId,
        date: form.date,
        datePrecision: form.datePrecision,
        type: form.type,
        summary: form.summary.trim() || null,
        notes: form.notes.trim() || null,
        nextSteps: form.nextSteps.trim() || null,
        contactsDiscussed: form.contactsDiscussed.map(Number),
        companiesDiscussed: form.companiesDiscussed.map(Number),
      }
      if (!editId && form.actionTitle.trim()) {
        payload.createAction = {
          title: form.actionTitle.trim(),
          type: form.actionType,
          dueDate: form.actionDueDate || null,
          priority: form.actionPriority,
        }
      }

      if (editId) {
        await api.put(`/conversations/${editId}`, payload)
        toast.success('Conversation updated')
      } else {
        await api.post('/conversations', payload)
        toast.success('Conversation logged')
      }
      setDialogOpen(false)
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save conversation')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      await api.delete(`/conversations/${deleteId}`)
      toast.success('Conversation deleted')
      setDeleteId(null)
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  function set<K extends keyof typeof emptyForm>(key: K, val: (typeof emptyForm)[K]) {
    setForm((prev) => ({ ...prev, [key]: val }))
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Conversations</h2>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1 h-3 w-3" />
          Log Conversation
        </Button>
      </div>

      {conversations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No conversations logged yet.</p>
      ) : (
        <div className="space-y-3">
          {conversations.map((conv) => (
            <Card key={conv.id} className="cursor-pointer hover:bg-muted/30" onClick={() => openEdit(conv)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-xs ${conversationTypeColors[conv.type]}`}>
                        {getLabel(conv.type, CONVERSATION_TYPE_OPTIONS)}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {formatConversationDate(conv.date, conv.datePrecision as DatePrecision)}
                      </span>
                    </div>
                    {conv.summary && (
                      <p className="text-sm font-medium">{conv.summary}</p>
                    )}
                    {conv.notes && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{conv.notes}</p>
                    )}
                    {conv.nextSteps && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Next:</span> {conv.nextSteps}
                      </p>
                    )}
                    {(conv.contactsDiscussed.length > 0 || conv.companiesDiscussed.length > 0) && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {conv.contactsDiscussed.map((cd) => (
                          <Badge key={cd.contact.id} variant="outline" className="text-xs">
                            {cd.contact.name}
                          </Badge>
                        ))}
                        {conv.companiesDiscussed.map((cd) => (
                          <Badge key={cd.company.id} variant="outline" className="text-xs bg-slate-50">
                            {cd.company.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {conv.actions && conv.actions.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {conv.actions.map((a) => (
                          <span key={a.id} className={`text-xs ${a.completed ? 'line-through text-muted-foreground' : 'text-primary'}`}>
                            {a.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteId(conv.id)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Conversation form dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Conversation' : 'Log Conversation'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => set('date', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Precision</Label>
                <Select value={form.datePrecision} onValueChange={(v) => set('datePrecision', v as DatePrecision)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DATE_PRECISION_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => set('type', v as ConversationType)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONVERSATION_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Summary</Label>
              <Input
                value={form.summary}
                onChange={(e) => set('summary', e.target.value)}
                placeholder="Brief summary of the conversation"
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Detailed notes..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Next Steps</Label>
              <Textarea
                value={form.nextSteps}
                onChange={(e) => set('nextSteps', e.target.value)}
                placeholder="What to do next..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>People Discussed</Label>
              <MultiCombobox
                options={contactOptions}
                values={form.contactsDiscussed}
                onChange={(v) => set('contactsDiscussed', v)}
                placeholder="Select contacts..."
                searchPlaceholder="Search contacts..."
              />
            </div>

            <div className="space-y-2">
              <Label>Companies Discussed</Label>
              <MultiCombobox
                options={companyOptions}
                values={form.companiesDiscussed}
                onChange={(v) => set('companiesDiscussed', v)}
                placeholder="Select companies..."
                searchPlaceholder="Search companies..."
              />
            </div>

            {/* Follow-up action (only on create) */}
            {!editId && (
              <>
                <Separator />
                <p className="text-sm font-medium text-muted-foreground">Create Follow-Up Action (optional)</p>
                <div className="space-y-2">
                  <Label>Action Title</Label>
                  <Input
                    value={form.actionTitle}
                    onChange={(e) => set('actionTitle', e.target.value)}
                    placeholder="e.g. Send follow-up email"
                  />
                </div>
                {form.actionTitle && (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select value={form.actionType} onValueChange={(v) => set('actionType', v as ActionType)}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ACTION_TYPE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Due Date</Label>
                      <Input
                        type="date"
                        value={form.actionDueDate}
                        onChange={(e) => set('actionDueDate', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select value={form.actionPriority} onValueChange={(v) => set('actionPriority', v as ActionPriority)}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ACTION_PRIORITY_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? 'Saving...' : editId ? 'Update' : 'Log Conversation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Conversation</DialogTitle>
            <DialogDescription>
              This will permanently delete this conversation log. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Relationships Tab component ────────────────────────────

function RelationshipsTab({
  contactId,
  contactName,
  relationships,
  contactOptions,
  onRefresh,
}: {
  contactId: number
  contactName: string
  relationships: Relationship[]
  contactOptions: ComboboxOption[]
  onRefresh: () => void
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const emptyForm = {
    otherContactId: '',
    type: 'KNOWS' as RelationshipType,
    direction: 'from' as 'from' | 'to',
    notes: '',
  }

  const [form, setForm] = useState(emptyForm)

  function openNew() {
    setForm(emptyForm)
    setDialogOpen(true)
  }

  async function handleSubmit() {
    if (!form.otherContactId) {
      toast.error('Please select a contact')
      return
    }
    setSaving(true)
    try {
      const fromId = form.direction === 'from' ? contactId : parseInt(form.otherContactId)
      const toId = form.direction === 'from' ? parseInt(form.otherContactId) : contactId

      await api.post('/relationships', {
        fromContactId: fromId,
        toContactId: toId,
        type: form.type,
        notes: form.notes.trim() || null,
      })
      toast.success('Relationship added')
      setDialogOpen(false)
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save relationship')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      await api.delete(`/relationships/${deleteId}`)
      toast.success('Relationship removed')
      setDeleteId(null)
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  function describeRelationship(rel: Relationship) {
    const isFrom = rel.fromContactId === contactId
    const otherName = isFrom ? rel.toContact.name : rel.fromContact.name

    switch (rel.type) {
      case 'REFERRED_BY':
        return isFrom ? `was referred by ${otherName}` : `referred ${otherName}`
      case 'INTRODUCED_BY':
        return isFrom ? `was introduced by ${otherName}` : `introduced ${otherName}`
      case 'REPORTS_TO':
        return isFrom ? `reports to ${otherName}` : `${otherName} reports to them`
      default:
        return `${getLabel(rel.type, RELATIONSHIP_TYPE_OPTIONS).toLowerCase()} ${otherName}`
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Relationships</h2>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1 h-3 w-3" />
          Add Relationship
        </Button>
      </div>

      {relationships.length === 0 ? (
        <p className="text-sm text-muted-foreground">No relationships recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {relationships.map((rel) => {
            const isFrom = rel.fromContactId === contactId
            const otherId = isFrom ? rel.toContactId : rel.fromContactId
            const otherName = isFrom ? rel.toContact.name : rel.fromContact.name
            return (
              <Card key={rel.id}>
                <CardContent className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-xs ${relationshipTypeColors[rel.type]}`}>
                      {getLabel(rel.type, RELATIONSHIP_TYPE_OPTIONS)}
                    </Badge>
                    <span className="text-sm">
                      {contactName} {describeRelationship(rel)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/contacts/${otherId}`}>{otherName}</Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setDeleteId(rel.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Add relationship dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Relationship</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Relationship Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v as RelationshipType }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Direction</Label>
              <Select value={form.direction} onValueChange={(v) => setForm((p) => ({ ...p, direction: v as 'from' | 'to' }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="from">{contactName} → Other</SelectItem>
                  <SelectItem value="to">Other → {contactName}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {form.direction === 'from'
                  ? `${contactName} ${getLabel(form.type, RELATIONSHIP_TYPE_OPTIONS).toLowerCase()} the selected contact`
                  : `The selected contact ${getLabel(form.type, RELATIONSHIP_TYPE_OPTIONS).toLowerCase()} ${contactName}`}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Contact</Label>
              <Select value={form.otherContactId} onValueChange={(v) => setForm((p) => ({ ...p, otherContactId: v }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select a contact" /></SelectTrigger>
                <SelectContent>
                  {contactOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Optional notes about this relationship"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? 'Saving...' : 'Add Relationship'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Relationship</DialogTitle>
            <DialogDescription>
              This will permanently remove this relationship record. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Prep Sheet Tab component ───────────────────────────────

function PrepSheetTab({
  contact,
  conversations,
  relationships,
  actions,
}: {
  contact: Contact
  conversations: Conversation[]
  relationships: Relationship[]
  actions: Action[]
}) {
  const lastConversation = conversations.length > 0 ? conversations[0] : null
  const pendingActions = actions.filter((a) => !a.completed)

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Prep Sheet</h2>
      <p className="text-sm text-muted-foreground">
        Quick reference for preparing before a conversation with {contact.name}.
      </p>

      {/* Last Conversation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Last Conversation</CardTitle>
        </CardHeader>
        <CardContent>
          {lastConversation ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-xs ${conversationTypeColors[lastConversation.type]}`}>
                  {getLabel(lastConversation.type, CONVERSATION_TYPE_OPTIONS)}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {formatConversationDate(lastConversation.date, lastConversation.datePrecision as DatePrecision)}
                </span>
              </div>
              {lastConversation.summary && (
                <p className="text-sm font-medium">{lastConversation.summary}</p>
              )}
              {lastConversation.notes && (
                <p className="text-sm whitespace-pre-wrap">{lastConversation.notes}</p>
              )}
              {lastConversation.nextSteps && (
                <div className="rounded-md bg-muted/50 p-2">
                  <p className="text-sm">
                    <span className="font-medium">Next steps: </span>
                    {lastConversation.nextSteps}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No conversations logged yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Open Questions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Open Questions</CardTitle>
        </CardHeader>
        <CardContent>
          {contact.openQuestions ? (
            <p className="text-sm whitespace-pre-wrap">{contact.openQuestions}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No open questions recorded.</p>
          )}
        </CardContent>
      </Card>

      {/* Pending Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending Actions</CardTitle>
        </CardHeader>
        <CardContent>
          {pendingActions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending actions.</p>
          ) : (
            <ul className="space-y-1">
              {pendingActions.map((action) => (
                <li key={action.id} className="flex items-center gap-2 text-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  <Link to={`/actions/${action.id}`} className="hover:underline flex-1">
                    {action.title}
                  </Link>
                  {action.dueDate && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(action.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Relationships */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Relationships</CardTitle>
        </CardHeader>
        <CardContent>
          {relationships.length === 0 ? (
            <p className="text-sm text-muted-foreground">No relationships recorded.</p>
          ) : (
            <ul className="space-y-1">
              {relationships.map((rel) => {
                const isFrom = rel.fromContactId === contact.id
                const otherName = isFrom ? rel.toContact.name : rel.fromContact.name
                const otherId = isFrom ? rel.toContactId : rel.fromContactId
                return (
                  <li key={rel.id} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className={`text-xs ${relationshipTypeColors[rel.type]}`}>
                      {getLabel(rel.type, RELATIONSHIP_TYPE_OPTIONS)}
                    </Badge>
                    <Link to={`/contacts/${otherId}`} className="hover:underline">
                      {otherName}
                    </Link>
                    {rel.notes && (
                      <span className="text-xs text-muted-foreground">— {rel.notes}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Key Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Key Info</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            {contact.title && (
              <Field label="Title">{contact.title}</Field>
            )}
            {(contact.company || contact.companyName) && (
              <Field label="Company">
                {contact.company ? (
                  <Link to={`/companies/${contact.company.id}`} className="text-primary hover:underline">
                    {contact.company.name}
                  </Link>
                ) : contact.companyName}
              </Field>
            )}
            {contact.howConnected && (
              <Field label="How Connected">{contact.howConnected}</Field>
            )}
            {contact.referredBy && (
              <Field label="Referred By">
                <Link to={`/contacts/${contact.referredBy.id}`} className="text-primary hover:underline">
                  {contact.referredBy.name}
                </Link>
              </Field>
            )}
            {contact.notes && (
              <Field label="Notes">
                <p className="whitespace-pre-wrap">{contact.notes}</p>
              </Field>
            )}
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
