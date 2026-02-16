import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type {
  Contact,
  Action,
  Conversation,
  Relationship,
  LinkRecord,
  PrepNote,
  EmploymentHistory,
  Tag,
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
  parseContactEmails,
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
import { Combobox, MultiCombobox, type ComboboxOption } from '@/components/ui/combobox'
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
  X,
  Tag as TagIcon,
  Loader2,
  RotateCcw,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"
import { useAutoSave } from '@/hooks/use-auto-save'
import { SaveStatusIndicator } from '@/components/save-status'
import ReactMarkdown from 'react-markdown'

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
  RESEARCHING: 'bg-blue-100 text-blue-700',
  CONNECTED: 'bg-green-100 text-green-700',
  AWAITING_RESPONSE: 'bg-yellow-100 text-yellow-700',
  FOLLOW_UP_NEEDED: 'bg-orange-100 text-orange-700',
  LEAD_TO_PURSUE: 'bg-pink-100 text-pink-700',
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

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  if (!children) return null
  return (
    <div className={`space-y-1 ${className || ''}`}>
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
  const [links, setLinks] = useState<LinkRecord[]>([])
  const [prepNotes, setPrepNotes] = useState<PrepNote[]>([])
  const [employmentHistory, setEmploymentHistory] = useState<EmploymentHistory[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [allContacts, setAllContacts] = useState<{ id: number; name: string }[]>([])
  const [allCompanies, setAllCompanies] = useState<{ id: number; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [newLinkTitle, setNewLinkTitle] = useState('')

  function loadLinks() {
    if (id) {
      api.get<LinkRecord[]>(`/links?contactId=${id}`).then(setLinks).catch(() => { })
    }
  }

  async function addLink() {
    if (!newLinkUrl.trim()) return
    try {
      await api.post('/links', {
        url: newLinkUrl.trim(),
        title: newLinkTitle.trim() || newLinkUrl.trim(),
        contactId: parseInt(id!),
      })
      loadLinks()
      setNewLinkUrl('')
      setNewLinkTitle('')
      toast.success('Link added')
    } catch {
      toast.error('Failed to add link')
    }
  }

  async function deleteLink(linkId: number) {
    try {
      await api.delete(`/links/${linkId}`)
      loadLinks()
      toast.success('Link removed')
    } catch {
      toast.error('Failed to remove link')
    }
  }

  const loadData = useCallback(() => {
    if (!id) return
    api.get<Contact>(`/contacts/${id}`)
      .then(setContact)
      .catch((err) => {
        toast.error(err.message)
        navigate('/contacts')
      })
      .finally(() => setLoading(false))

    api.get<Action[]>(`/actions?contactId=${id}`).then(setActions).catch(() => { })
    api.get<Conversation[]>(`/conversations?contactId=${id}`).then(setConversations).catch(() => { })
    api.get<Relationship[]>(`/relationships?contactId=${id}`).then(setRelationships).catch(() => { })
    api.get<LinkRecord[]>(`/links?contactId=${id}`).then(setLinks).catch(() => { })
    api.get<PrepNote[]>(`/prepnotes?contactId=${id}`).then(setPrepNotes).catch(() => { })
    api.get<EmploymentHistory[]>(`/employment-history?contactId=${id}`).then(setEmploymentHistory).catch(() => { })
    api.get<Tag[]>(`/tags/contact/${id}`).then(setTags).catch(() => { })
  }, [id, navigate])

  useEffect(() => {
    loadData()
    // Load contacts and companies for comboboxes in dialogs
    api.get<{ id: number; name: string }[]>('/contacts/names').then(
      (data) => setAllContacts(data)
    ).catch(() => { })
    api.get<{ id: number; name: string }[]>('/companies').then(
      (data) => setAllCompanies(data.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })))
    ).catch(() => { })
    api.get<Tag[]>('/tags').then(setAllTags).catch(() => { })
  }, [loadData])

  async function toggleActionComplete(action: Action) {
    try {
      const result = await api.patch<{ action: Action; nextAction: Action | null }>(`/actions/${action.id}/complete`)
      const updated = await api.get<Action[]>(`/actions?contactId=${id}`)
      setActions(updated)
      toast.success(action.completed ? 'Marked incomplete' : 'Marked complete')
      if (result.nextAction?.dueDate) {
        toast.info(`Next occurrence created for ${result.nextAction.dueDate}`)
      }
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

  async function handleUpdate(field: 'ecosystem' | 'status', value: string) {
    if (!contact) return
    const originalValue = contact[field]

    // Optimistic update
    setContact((prev) => (prev ? { ...prev, [field]: value as any } : null))

    try {
      await api.put(`/contacts/${id}`, { [field]: value })
      toast.success('Updated')
    } catch (err: unknown) {
      // Revert on failure
      setContact((prev) => (prev ? { ...prev, [field]: originalValue } : null))
      const message = err instanceof Error ? err.message : 'Failed to update'
      toast.error(message)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 sm:items-center sm:gap-4">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate('/contacts')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              {(() => {
                // In production, only http URLs work. Local /photos/ paths only work in dev.
                const photoSrc = contact.photoUrl ||
                  (import.meta.env.DEV ? contact.photoFile : null)
                return photoSrc ? (
                  <img
                    src={photoSrc}
                    alt={contact.name}
                    className="h-20 w-20 rounded-lg object-cover border"
                  />
                ) : null
              })()}
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
                  {/* Show additional current companies only */}
                  {contact.additionalCompanyIds && (() => {
                    try {
                      const parsed = JSON.parse(contact.additionalCompanyIds);
                      // Handle both formats: new [{id, isCurrent}] and legacy [1, 2, 3]
                      const currentCompanyIds: number[] = [];
                      if (Array.isArray(parsed)) {
                        for (const item of parsed) {
                          if (typeof item === 'object' && item !== null && 'id' in item) {
                            // New format: only show current companies
                            if (item.isCurrent !== false) {
                              currentCompanyIds.push(item.id);
                            }
                          } else {
                            // Legacy format: assume all are current
                            currentCompanyIds.push(item);
                          }
                        }
                      }
                      return currentCompanyIds.map((companyId) => {
                        const company = allCompanies.find((c) => c.id === companyId);
                        return (
                          <span key={companyId} className="text-sm text-muted-foreground">
                            {companyDisplay ? ' | ' : 'at '}
                            {company ? (
                              <Link to={`/companies/${companyId}`} className="text-primary hover:underline">
                                {company.name}
                              </Link>
                            ) : (
                              `Company #${companyId}`
                            )}
                          </span>
                        );
                      });
                    } catch {
                      return null;
                    }
                  })()}
                </div>
                {/* Show past companies */}
                {contact.additionalCompanyIds && (() => {
                  try {
                    const parsed = JSON.parse(contact.additionalCompanyIds);
                    const pastCompanyIds: number[] = [];
                    if (Array.isArray(parsed)) {
                      for (const item of parsed) {
                        if (typeof item === 'object' && item !== null && 'id' in item && item.isCurrent === false) {
                          pastCompanyIds.push(item.id);
                        }
                      }
                    }
                    if (pastCompanyIds.length === 0) return null;
                    return (
                      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground italic">
                        <span>formerly</span>
                        {pastCompanyIds.map((companyId, idx) => {
                          const company = allCompanies.find((c) => c.id === companyId);
                          return (
                            <span key={companyId}>
                              {idx > 0 && ', '}
                              {company ? (
                                <Link to={`/companies/${companyId}`} className="text-primary/70 hover:underline">
                                  {company.name}
                                </Link>
                              ) : (
                                `Company #${companyId}`
                              )}
                            </span>
                          );
                        })}
                      </div>
                    );
                  } catch {
                    return null;
                  }
                })()}
                {contact.roleDescription && (
                  <p className="mt-1 text-sm text-muted-foreground">{contact.roleDescription}</p>
                )}
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger className="focus:outline-none">
                  <Badge variant="outline" className={`${ecosystemColors[contact.ecosystem]} hover:bg-opacity-80 cursor-pointer transition-colors`}>
                    {getLabel(contact.ecosystem, ECOSYSTEM_OPTIONS)}
                  </Badge>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Change Ecosystem</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup
                    value={contact.ecosystem}
                    onValueChange={(val) => handleUpdate('ecosystem', val)}
                  >
                    {ECOSYSTEM_OPTIONS.map((option) => (
                      <DropdownMenuRadioItem key={option.value} value={option.value}>
                        <Badge variant="outline" className={`mr-2 ${ecosystemColors[option.value]}`}>
                          {option.label}
                        </Badge>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger className="focus:outline-none">
                  <Badge variant="outline" className={`${statusColors[contact.status]} hover:bg-opacity-80 cursor-pointer transition-colors`}>
                    {getLabel(contact.status, CONTACT_STATUS_OPTIONS)}
                  </Badge>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Change Status</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup
                    value={contact.status}
                    onValueChange={(val) => handleUpdate('status', val)}
                  >
                    {CONTACT_STATUS_OPTIONS.map((option) => (
                      <DropdownMenuRadioItem key={option.value} value={option.value}>
                        <Badge variant="outline" className={`mr-2 ${statusColors[option.value]}`}>
                          {option.label}
                        </Badge>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" asChild className="flex-1 sm:flex-initial">
            <Link to={`/contacts/${contact.id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1 sm:flex-initial">
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
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview" className="shrink-0">
            <User className="mr-1 h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="conversations" className="shrink-0">
            <MessageSquare className="mr-1 h-4 w-4" />
            Conversations
            {conversations.length > 0 && (
              <>
                <span className="ml-1 text-xs text-muted-foreground">({conversations.length})</span>
                <span className="ml-1 h-2 w-2 rounded-full bg-green-500 inline-block" />
              </>
            )}
          </TabsTrigger>
          <TabsTrigger value="relationships" className="shrink-0">
            <Users className="mr-1 h-4 w-4" />
            Relationships
            {relationships.length > 0 && (
              <>
                <span className="ml-1 text-xs text-muted-foreground">({relationships.length})</span>
                <span className="ml-1 h-2 w-2 rounded-full bg-green-500 inline-block" />
              </>
            )}
          </TabsTrigger>
          <TabsTrigger value="prep" className="shrink-0">
            <FileText className="mr-1 h-4 w-4" />
            Prep Sheet
            {prepNotes.length > 0 && (
              <span className="ml-1 h-2 w-2 rounded-full bg-green-500 inline-block" />
            )}
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
                  {parseContactEmails(contact).map((email, i) => (
                    <div key={i}>
                      <a href={`mailto:${email}`} className="text-primary hover:underline">
                        {email}
                      </a>
                    </div>
                  ))}
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
                <Field label="Notes">
                  {contact.notes && (
                    <div className="prep-note-markdown"><ReactMarkdown>{contact.notes}</ReactMarkdown></div>
                  )}
                </Field>
              </dl>
            </CardContent>
          </Card>

          {contact.personalDetails && (
            <Card>
              <CardHeader>
                <CardTitle>Personal Details</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{contact.personalDetails}</p>
              </CardContent>
            </Card>
          )}

          {/* Previous Companies */}
          {employmentHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Previous Companies</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {employmentHistory.map((eh) => (
                    <li key={eh.id} className="flex items-center gap-2 text-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
                      {eh.title && <span>{eh.title}</span>}
                      {eh.title && (eh.company || eh.companyName) && <span className="text-muted-foreground">at</span>}
                      {eh.company ? (
                        <Link to={`/companies/${eh.company.id}`} className="text-primary hover:underline">
                          {eh.company.name}
                        </Link>
                      ) : eh.companyName ? (
                        <span>{eh.companyName}</span>
                      ) : null}
                      {(eh.startDate || eh.endDate) && (
                        <span className="text-xs text-muted-foreground">
                          ({eh.startDate || '?'} — {eh.endDate || 'present'})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Links */}
          <Card>
            <CardHeader>
              <CardTitle>Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {links.length > 0 && (
                <ul className="space-y-2">
                  {links.map((link) => (
                    <li key={link.id} className="flex items-center justify-between gap-2">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline truncate"
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        {link.title}
                      </a>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => deleteLink(link.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2 items-end">
                <div className="flex-1 grid gap-2 sm:grid-cols-2">
                  <Input
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    placeholder="URL (Google Drive, webpage, etc.)"
                    onKeyDown={(e) => e.key === 'Enter' && addLink()}
                  />
                  <Input
                    value={newLinkTitle}
                    onChange={(e) => setNewLinkTitle(e.target.value)}
                    placeholder="Label (optional)"
                    onKeyDown={(e) => e.key === 'Enter' && addLink()}
                  />
                </div>
                <Button size="sm" onClick={addLink} disabled={!newLinkUrl.trim()}>
                  <Plus className="mr-1 h-3 w-3" />
                  Add
                </Button>
              </div>
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
                      action.dueDate < new Date().toLocaleDateString('en-CA')
                    return (
                      <div
                        key={action.id}
                        className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
                      >
                        <button
                          onClick={() => toggleActionComplete(action)}
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${action.completed
                            ? 'border-green-500 bg-green-500 text-white'
                            : 'border-muted-foreground/30 hover:border-green-500'
                            }`}
                        >
                          {action.completed && <Check className="h-2.5 w-2.5" />}
                        </button>
                        <Link
                          to={`/actions/${action.id}`}
                          className={`flex-1 text-sm hover:underline ${action.completed ? 'text-muted-foreground line-through' : ''
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
                            className={`text-xs ${overdue
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

          {/* Tags */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TagIcon className="h-4 w-4" />
                Tags
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge key={tag.id} variant="secondary" className="gap-1 pr-1">
                    {tag.name}
                    <button
                      onClick={async () => {
                        try {
                          await api.delete(`/tags/${tag.id}/contacts/${contact.id}`)
                          setTags((prev) => prev.filter((t) => t.id !== tag.id))
                          toast.success('Tag removed')
                        } catch {
                          toast.error('Failed to remove tag')
                        }
                      }}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {allTags.filter((t) => !tags.some((ct) => ct.id === t.id)).length > 0 && (
                  <select
                    className="text-xs border rounded px-2 py-1 bg-background"
                    value=""
                    onChange={async (e) => {
                      const tagId = parseInt(e.target.value)
                      if (!tagId) return
                      try {
                        await api.post(`/tags/${tagId}/contacts/${contact.id}`)
                        const tag = allTags.find((t) => t.id === tagId)
                        if (tag) setTags((prev) => [...prev, tag])
                        toast.success('Tag added')
                      } catch {
                        toast.error('Failed to add tag')
                      }
                    }}
                  >
                    <option value="">+ Add tag</option>
                    {allTags
                      .filter((t) => !tags.some((ct) => ct.id === t.id))
                      .map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                  </select>
                )}
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 text-xs">
                      <Plus className="mr-1 h-3 w-3" />
                      New Tag
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-xs">
                    <DialogHeader>
                      <DialogTitle>Create Tag</DialogTitle>
                    </DialogHeader>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault()
                        const form = e.target as HTMLFormElement
                        const input = form.elements.namedItem('tagName') as HTMLInputElement
                        const name = input.value.trim()
                        if (!name) return
                        try {
                          const newTag = await api.post<Tag>('/tags', { name })
                          setAllTags((prev) => [...prev, newTag].sort((a, b) => a.name.localeCompare(b.name)))
                          await api.post(`/tags/${newTag.id}/contacts/${contact.id}`)
                          setTags((prev) => [...prev, newTag])
                          input.value = ''
                          toast.success('Tag created and added')
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : 'Failed to create tag')
                        }
                      }}
                      className="space-y-4"
                    >
                      <Input name="tagName" placeholder="Tag name" autoFocus />
                      <DialogFooter>
                        <Button type="submit" size="sm">Create & Add</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
              {tags.length === 0 && allTags.length === 0 && (
                <p className="text-sm text-muted-foreground">No tags yet. Create one to get started.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Conversations Tab ─────────────────────────── */}
        <TabsContent value="conversations" className="space-y-4">
          <ConversationsTab
            contactId={contact.id}
            conversations={conversations}
            prepNotes={prepNotes}
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
            links={links}
            prepNotes={prepNotes}
            onRefresh={loadData}
          />
        </TabsContent>
      </Tabs>

      {/* Timestamps */}
      <div className="flex gap-6 text-xs text-muted-foreground">
        <span>Created {formatDate(contact.createdAt)}</span>
        <span>Updated {formatDate(contact.updatedAt)}</span>
      </div>
    </div >
  )
}

// ─── Conversations Tab component ────────────────────────────

interface ActionFormEntry {
  title: string
  type: ActionType
  dueDate: string
  priority: ActionPriority
}

const emptyAction: ActionFormEntry = {
  title: '',
  type: 'FOLLOW_UP',
  dueDate: '',
  priority: 'MEDIUM',
}

interface LinkEntry {
  url: string
  title: string
}

function ConversationsTab({
  contactId,
  conversations,
  prepNotes,
  contactOptions,
  companyOptions,
  onRefresh,
}: {
  contactId: number
  conversations: Conversation[]
  prepNotes: PrepNote[]
  contactOptions: ComboboxOption[]
  companyOptions: ComboboxOption[]
  onRefresh: () => void
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Local copies of options that can grow when new entries are added
  const [localContactOptions, setLocalContactOptions] = useState(contactOptions)
  const [localCompanyOptions, setLocalCompanyOptions] = useState(companyOptions)

  // Keep local options in sync with parent
  useEffect(() => {
    setLocalContactOptions(contactOptions)
    setLocalCompanyOptions(companyOptions)
  }, [contactOptions, companyOptions])

  type ConversationForm = {
    date: string
    datePrecision: DatePrecision
    type: ConversationType
    summary: string
    notes: string
    nextSteps: string
    contactsDiscussed: string[]
    companiesDiscussed: string[]
    actions: ActionFormEntry[]
    links: LinkEntry[]
  }

  // Draft auto-save for NEW conversations
  const draftKey = `draft_conversation_${contactId}`

  const emptyForm: ConversationForm = {
    date: new Date().toLocaleDateString('en-CA'),
    datePrecision: 'DAY',
    type: 'VIDEO_CALL',
    summary: '',
    notes: '',
    nextSteps: '',
    contactsDiscussed: [],
    companiesDiscussed: [],
    actions: [{ ...emptyAction }],
    links: [],
  }

  const [form, setForm] = useState<ConversationForm>(emptyForm)
  const [originalForm, setOriginalForm] = useState<ConversationForm | null>(null)
  const [hasDraft, setHasDraft] = useState(false)

  // Check for existing draft on mount and when dialog closes
  useEffect(() => {
    if (!dialogOpen) {
      const saved = localStorage.getItem(draftKey)
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          // Check if it has any meaningful content
          const hasContent = parsed.summary || parsed.notes || parsed.nextSteps ||
            parsed.contactsDiscussed.length > 0 || parsed.companiesDiscussed.length > 0 ||
            parsed.actions.some((a: any) => a.title) || parsed.links.length > 0
          setHasDraft(!!hasContent)
        } catch {
          setHasDraft(false)
        }
      } else {
        setHasDraft(false)
      }
    }
  }, [dialogOpen, draftKey])

  function openNew() {
    setEditId(null)

    // Restore draft immediately to prevent "save empty" race condition
    const saved = localStorage.getItem(draftKey)
    if (saved) {
      try {
        setForm(JSON.parse(saved))
      } catch {
        setForm(emptyForm)
      }
    } else {
      setForm(emptyForm)
    }

    setOriginalForm(null)
    setLocalContactOptions(contactOptions)
    setLocalCompanyOptions(companyOptions)
    setDialogOpen(true)
  }

  function openEdit(conv: Conversation) {
    setEditId(conv.id)
    setLocalContactOptions(contactOptions)
    setLocalCompanyOptions(companyOptions)
    const loadedForm: ConversationForm = {
      date: conv.date,
      datePrecision: conv.datePrecision as DatePrecision,
      type: conv.type as ConversationType,
      summary: conv.summary || '',
      notes: conv.notes || '',
      nextSteps: conv.nextSteps || '',
      contactsDiscussed: conv.contactsDiscussed.map((cd) => cd.contact.id.toString()),
      companiesDiscussed: conv.companiesDiscussed.map((cd) => cd.company.id.toString()),
      actions: [{ ...emptyAction }],
      links: [],
    }
    setForm(loadedForm)
    setOriginalForm(loadedForm)
    setDialogOpen(true)
  }

  // Auto-save handler - only saves core fields with existing IDs (not new actions/links/entries)
  const handleAutoSave = useCallback(async (data: ConversationForm) => {
    if (!editId) return

    // Only include existing contact/company IDs (numeric strings only)
    const existingContactIds = data.contactsDiscussed
      .filter((val) => /^\d+$/.test(val))
      .map(Number)
    const existingCompanyIds = data.companiesDiscussed
      .filter((val) => /^\d+$/.test(val))
      .map(Number)

    const payload = {
      contactId,
      date: data.date,
      datePrecision: data.datePrecision,
      type: data.type,
      summary: data.summary.trim() || null,
      notes: data.notes.trim() || null,
      nextSteps: data.nextSteps.trim() || null,
      contactsDiscussed: existingContactIds,
      companiesDiscussed: existingCompanyIds,
      // Note: actions and links are NOT auto-saved - they save on explicit submit
    }
    await api.put(`/conversations/${editId}`, payload)
  }, [editId, contactId])


  // Save immediately on any change (synchronous)
  useEffect(() => {
    if (editId === null && dialogOpen) {
      localStorage.setItem(draftKey, JSON.stringify(form))
    }
  }, [form, editId, dialogOpen, draftKey])

  // Clear draft on successful submit (handled in handleSubmit)

  const autoSave = useAutoSave({
    data: form,
    originalData: originalForm,
    onSave: handleAutoSave,
    validate: (data) => data.date.length > 0,
    debounceMs: 2000, // Longer debounce for complex form
    enabled: editId !== null,
    onRevert: setForm,
  })

  async function resolveNewEntries() {
    // Create contacts for any free-text entries (non-numeric IDs)
    const resolvedContacts: string[] = []
    for (const val of form.contactsDiscussed) {
      if (/^\d+$/.test(val)) {
        resolvedContacts.push(val)
      } else {
        // Create new contact
        try {
          const newContact = await api.post<{ id: number; name: string }>('/contacts', {
            name: val,
            status: 'CONNECTED',
            ecosystem: 'ROLODEX',
          })
          resolvedContacts.push(newContact.id.toString())
        } catch {
          toast.error(`Failed to create contact "${val}"`)
        }
      }
    }

    // Create companies for any free-text entries
    const resolvedCompanies: string[] = []
    for (const val of form.companiesDiscussed) {
      if (/^\d+$/.test(val)) {
        resolvedCompanies.push(val)
      } else {
        try {
          const newCompany = await api.post<{ id: number; name: string }>('/companies', {
            name: val,
          })
          resolvedCompanies.push(newCompany.id.toString())
        } catch {
          toast.error(`Failed to create company "${val}"`)
        }
      }
    }

    return { resolvedContacts, resolvedCompanies }
  }

  async function handleSubmit() {
    if (!form.date) {
      toast.error('Date is required')
      return
    }
    setSaving(true)
    try {
      const { resolvedContacts, resolvedCompanies } = await resolveNewEntries()

      const payload: Record<string, unknown> = {
        contactId,
        date: form.date,
        datePrecision: form.datePrecision,
        type: form.type,
        summary: form.summary.trim() || null,
        notes: form.notes.trim() || null,
        nextSteps: form.nextSteps.trim() || null,
        contactsDiscussed: resolvedContacts.map(Number),
        companiesDiscussed: resolvedCompanies.map(Number),
      }

      // Multiple actions support (works for both create and edit)
      const validActions = form.actions.filter((a) => a.title.trim())
      if (validActions.length > 0) {
        payload.createActions = validActions.map((a) => ({
          title: a.title.trim(),
          type: a.type,
          dueDate: a.dueDate || null,
          priority: a.priority,
        }))
      }

      // Links
      const validLinks = form.links.filter((l) => l.url.trim())
      if (validLinks.length > 0) {
        payload.links = validLinks
      }

      if (editId) {
        await api.put(`/conversations/${editId}`, payload)
        toast.success('Conversation updated')
      } else {
        await api.post('/conversations', payload)
        toast.success('Conversation logged')
      }
      setDialogOpen(false)
      // Clear draft on success
      if (!editId) {
        localStorage.removeItem(`draft_conversation_${contactId}`)
      }
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

  function updateAction(index: number, field: keyof ActionFormEntry, value: string) {
    setForm((prev) => {
      const actions = [...prev.actions]
      actions[index] = { ...actions[index], [field]: value }
      return { ...prev, actions }
    })
  }

  function addAction() {
    setForm((prev) => ({ ...prev, actions: [...prev.actions, { ...emptyAction }] }))
  }

  function removeAction(index: number) {
    setForm((prev) => ({
      ...prev,
      actions: prev.actions.filter((_, i) => i !== index),
    }))
  }

  function addLink() {
    setForm((prev) => ({ ...prev, links: [...prev.links, { url: '', title: '' }] }))
  }

  function updateLink(index: number, field: keyof LinkEntry, value: string) {
    setForm((prev) => {
      const links = [...prev.links]
      links[index] = { ...links[index], [field]: value }
      return { ...prev, links }
    })
  }

  function removeLink(index: number) {
    setForm((prev) => ({
      ...prev,
      links: prev.links.filter((_, i) => i !== index),
    }))
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Conversations</h2>
        <Button size="sm" onClick={openNew} className={hasDraft ? "bg-amber-100 text-amber-900 hover:bg-amber-200 border-amber-200 border" : ""}>
          {hasDraft ? (
            <>
              <Pencil className="mr-1 h-3 w-3" />
              Resume Draft
            </>
          ) : (
            <>
              <Plus className="mr-1 h-3 w-3" />
              Log Conversation
            </>
          )}
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
                      <div className="text-sm text-muted-foreground line-clamp-2 prep-note-markdown"><ReactMarkdown>{conv.notes}</ReactMarkdown></div>
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
                      <div className="flex flex-col gap-1 pt-1">
                        {conv.actions.map((a) => (
                          <div key={a.id} className={`text-xs flex items-center gap-2 ${a.completed ? 'line-through text-muted-foreground' : ''}`}>
                            <span className={a.completed ? '' : 'text-primary'}>{a.title}</span>
                            {a.dueDate && (
                              <span className="text-muted-foreground">
                                (due {new Date(a.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
                              </span>
                            )}
                          </div>
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
        <DialogContent className={cn('max-h-[85vh] overflow-y-auto', !editId && prepNotes.length > 0 ? 'sm:max-w-5xl' : 'sm:max-w-xl')} onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>{editId ? 'Edit Conversation' : 'Log Conversation'}</DialogTitle>
              <div className="flex items-center gap-2">
                {!editId && (form.summary || form.notes || form.nextSteps) && (
                  <span className="text-xs text-muted-foreground animate-in fade-in duration-500">
                    Draft saved
                  </span>
                )}
                {editId && <SaveStatusIndicator status={autoSave.status} />}
              </div>
            </div>
          </DialogHeader>
          <div className={cn(!editId && prepNotes.length > 0 ? 'grid grid-cols-1 md:grid-cols-[1fr_1.5fr] gap-6' : '')}>
            {/* Prep Notes panel (only when creating, and notes exist) */}
            {!editId && prepNotes.length > 0 && (
              <div className="space-y-3 md:border-r md:pr-4">
                <h3 className="text-sm font-semibold">Prep Notes</h3>
                <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                  {prepNotes.map((note) => (
                    <div key={note.id} className="rounded-md bg-yellow-50 p-3 space-y-1">
                      <p className="text-xs text-muted-foreground">
                        {new Date(note.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                      <div className="text-sm prep-note-markdown">
                        <ReactMarkdown>{note.content}</ReactMarkdown>
                      </div>
                      {note.url && (
                        <a href={note.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                          {note.urlTitle || note.url}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
                {conversations.length > 0 && (
                  <div className="pt-3 border-t">
                    <h4 className="text-xs font-semibold mb-2">Last Conversation</h4>
                    <div className="rounded-md bg-muted/30 p-2 space-y-1">
                      <p className="text-xs text-muted-foreground">
                        {formatConversationDate(conversations[0].date, conversations[0].datePrecision as DatePrecision)}
                      </p>
                      {conversations[0].summary && (
                        <p className="text-xs font-medium">{conversations[0].summary}</p>
                      )}
                      {conversations[0].nextSteps && (
                        <p className="text-xs text-muted-foreground">Next: {conversations[0].nextSteps}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Conversation form */}
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
                  rows={6}
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
                  options={localContactOptions}
                  values={form.contactsDiscussed}
                  onChange={(v) => set('contactsDiscussed', v)}
                  placeholder="Search or type new name..."
                  searchPlaceholder="Search contacts..."
                  allowFreeText={true}
                />
              </div>

              <div className="space-y-2">
                <Label>Companies Discussed</Label>
                <MultiCombobox
                  options={localCompanyOptions}
                  values={form.companiesDiscussed}
                  onChange={(v) => set('companiesDiscussed', v)}
                  placeholder="Search or type new name..."
                  searchPlaceholder="Search companies..."
                  allowFreeText={true}
                />
              </div>

              {/* Links */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Links</Label>
                  <Button type="button" variant="ghost" size="sm" onClick={addLink}>
                    <Plus className="mr-1 h-3 w-3" />
                    Add Link
                  </Button>
                </div>
                {form.links.map((link, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <div className="flex-1 grid gap-2 sm:grid-cols-2">
                      <Input
                        value={link.url}
                        onChange={(e) => updateLink(i, 'url', e.target.value)}
                        placeholder="URL (e.g. https://drive.google.com/...)"
                      />
                      <Input
                        value={link.title}
                        onChange={(e) => updateLink(i, 'title', e.target.value)}
                        placeholder="Label (optional)"
                      />
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removeLink(i)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Follow-up actions (create and edit) */}
              <Separator />
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{editId ? 'Add Actions' : 'Follow-Up Actions'}</p>
                <Button type="button" variant="ghost" size="sm" onClick={addAction}>
                  <Plus className="mr-1 h-3 w-3" />
                  Add Action
                </Button>
              </div>
              {form.actions.map((action, i) => (
                <div key={i} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Action {i + 1}</Label>
                    {form.actions.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeAction(i)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <Input
                    value={action.title}
                    onChange={(e) => updateAction(i, 'title', e.target.value)}
                    placeholder="e.g. Send follow-up email"
                  />
                  {action.title && (
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Select value={action.type} onValueChange={(v) => updateAction(i, 'type', v)}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ACTION_TYPE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="date"
                        value={action.dueDate}
                        onChange={(e) => updateAction(i, 'dueDate', e.target.value)}
                      />
                      <Select value={action.priority} onValueChange={(v) => updateAction(i, 'priority', v)}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
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
                <Button variant="outline" onClick={() => {
                  setDialogOpen(false)
                  localStorage.removeItem(draftKey)
                  setHasDraft(false)
                  setForm(emptyForm)
                }}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={saving}>
                  {saving ? 'Saving...' : 'Log Conversation'}
                </Button>
              </>
            )}
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
  const [newContactName, setNewContactName] = useState('')

  function openNew() {
    setForm(emptyForm)
    setNewContactName('')
    setDialogOpen(true)
  }

  async function handleSubmit() {
    let otherContactId = form.otherContactId

    // If user typed a new contact name, create it first
    if (!otherContactId && newContactName) {
      setSaving(true)
      try {
        const newContact = await api.post<{ id: number; name: string }>('/contacts', {
          name: newContactName,
          status: 'CONNECTED',
          ecosystem: 'ROLODEX',
        })
        otherContactId = newContact.id.toString()
      } catch {
        toast.error('Failed to create new contact')
        setSaving(false)
        return
      }
    }

    if (!otherContactId) {
      toast.error('Please select a contact')
      return
    }
    setSaving(true)
    try {
      const fromId = form.direction === 'from' ? contactId : parseInt(otherContactId)
      const toId = form.direction === 'from' ? parseInt(otherContactId) : contactId

      await api.post('/relationships', {
        fromContactId: fromId,
        toContactId: toId,
        type: form.type,
        notes: form.notes.trim() || null,
      })
      toast.success('Relationship added')
      setDialogOpen(false)
      setNewContactName('')
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
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
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
              <Combobox
                options={contactOptions}
                value={form.otherContactId || newContactName}
                onChange={(val, isNew) => {
                  if (isNew) {
                    setForm((p) => ({ ...p, otherContactId: '' }))
                    setNewContactName(val)
                  } else {
                    setForm((p) => ({ ...p, otherContactId: val }))
                    setNewContactName('')
                  }
                }}
                placeholder="Search or type new name..."
                searchPlaceholder="Search contacts..."
                allowFreeText={true}
              />
              {newContactName && !form.otherContactId && (
                <p className="text-xs text-muted-foreground">
                  A new contact will be created automatically.
                </p>
              )}
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
  links,
  prepNotes,
  onRefresh,
}: {
  contact: Contact
  conversations: Conversation[]
  relationships: Relationship[]
  actions: Action[]
  links: LinkRecord[]
  prepNotes: PrepNote[]
  onRefresh: () => void
}) {
  const lastConversation = conversations.length > 0 ? conversations[0] : null
  const pendingActions = actions.filter((a) => !a.completed)
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [newLinkTitle, setNewLinkTitle] = useState('')

  // Prep note form state
  const [showAddPrepForm, setShowAddPrepForm] = useState(false)
  const [newPrepDate, setNewPrepDate] = useState(new Date().toLocaleDateString('en-CA'))
  const [newPrepContent, setNewPrepContent] = useState('')
  const [newPrepUrl, setNewPrepUrl] = useState('')
  const [newPrepUrlTitle, setNewPrepUrlTitle] = useState('')

  // Inline edit state
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  function startEditNote(note: PrepNote) {
    setEditingNoteId(note.id)
    setEditContent(note.content)
  }

  function cancelEditNote() {
    setEditingNoteId(null)
    setEditContent('')
  }

  async function saveEditNote(noteId: number) {
    if (!editContent.trim()) return
    setEditSaving(true)
    try {
      await api.put(`/prepnotes/${noteId}`, { content: editContent.trim() })
      setEditingNoteId(null)
      setEditContent('')
      onRefresh()
      toast.success('Prep note updated')
    } catch {
      toast.error('Failed to update prep note')
    } finally {
      setEditSaving(false)
    }
  }

  async function movePrepNote(index: number, direction: 'up' | 'down') {
    const newNotes = [...prepNotes]
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= newNotes.length) return
      ;[newNotes[index], newNotes[swapIndex]] = [newNotes[swapIndex], newNotes[index]]
    try {
      await api.post('/prepnotes/reorder', { noteIds: newNotes.map(n => n.id) })
      onRefresh()
    } catch {
      toast.error('Failed to reorder prep notes')
    }
  }

  async function addLink() {
    if (!newLinkUrl.trim()) return
    try {
      await api.post('/links', {
        url: newLinkUrl.trim(),
        title: newLinkTitle.trim() || newLinkUrl.trim(),
        contactId: contact.id,
      })
      setNewLinkUrl('')
      setNewLinkTitle('')
      onRefresh()
      toast.success('Link added')
    } catch {
      toast.error('Failed to add link')
    }
  }

  async function deleteLink(linkId: number) {
    try {
      await api.delete(`/links/${linkId}`)
      onRefresh()
      toast.success('Link removed')
    } catch {
      toast.error('Failed to remove link')
    }
  }

  async function addPrepNote() {
    if (!newPrepContent.trim()) return
    try {
      await api.post('/prepnotes', {
        content: newPrepContent.trim(),
        url: newPrepUrl.trim() || null,
        urlTitle: newPrepUrlTitle.trim() || null,
        date: newPrepDate,
        contactId: contact.id,
      })
      setNewPrepContent('')
      setNewPrepUrl('')
      setNewPrepUrlTitle('')
      setNewPrepDate(new Date().toLocaleDateString('en-CA'))
      setShowAddPrepForm(false)
      onRefresh()
      toast.success('Prep note added')
    } catch {
      toast.error('Failed to add prep note')
    }
  }

  async function deletePrepNote(noteId: number) {
    try {
      await api.delete(`/prepnotes/${noteId}`)
      onRefresh()
      toast.success('Prep note removed')
    } catch {
      toast.error('Failed to remove prep note')
    }
  }

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
                <div className="text-sm prep-note-markdown"><ReactMarkdown>{lastConversation.notes}</ReactMarkdown></div>
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

      {/* Prep Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prep Notes</CardTitle>
          <p className="text-xs text-muted-foreground">
            Add thoughts, ideas, and links for upcoming conversations. Each note is dated so you can track prep over time.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing prep notes */}
          {prepNotes.length > 0 && (
            <div className="space-y-3">
              {prepNotes.map((note, idx) => (
                <div key={note.id} className="rounded-md border p-3 space-y-2 bg-yellow-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {new Date(note.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </Badge>
                      </div>
                      {editingNoteId === note.id ? (
                        <div className="space-y-2">
                          <Textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            rows={5}
                            className="text-sm"
                            placeholder="Use **bold**, *italic*, and - bullet points"
                          />
                          <p className="text-xs text-muted-foreground">Supports **bold**, *italic*, and - bullet points</p>
                          <div className="flex gap-1">
                            <Button size="sm" variant="default" onClick={() => saveEditNote(note.id)} disabled={editSaving || !editContent.trim()}>
                              <Check className="mr-1 h-3 w-3" />
                              {editSaving ? 'Saving...' : 'Save'}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={cancelEditNote}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm prep-note-markdown">
                          <ReactMarkdown>{note.content}</ReactMarkdown>
                        </div>
                      )}
                      {note.url && editingNoteId !== note.id && (
                        <a
                          href={note.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          {note.urlTitle || note.url}
                        </a>
                      )}
                    </div>
                    {editingNoteId !== note.id && (
                      <div className="flex flex-col items-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => movePrepNote(idx, 'up')} disabled={idx === 0}>
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => movePrepNote(idx, 'down')} disabled={idx === prepNotes.length - 1}>
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => startEditNote(note)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => deletePrepNote(note.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Add new prep note */}
          {!showAddPrepForm ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddPrepForm(true)}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add Prep Note
            </Button>
          ) : (
            <div className="space-y-3 rounded-md border p-3 bg-muted/30">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Date</Label>
                  <Input
                    type="date"
                    value={newPrepDate}
                    onChange={(e) => setNewPrepDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes / Thoughts</Label>
                <Textarea
                  value={newPrepContent}
                  onChange={(e) => setNewPrepContent(e.target.value)}
                  placeholder="Ideas for conversation, talking points, questions to ask..."
                  rows={3}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Link URL (optional)</Label>
                  <Input
                    value={newPrepUrl}
                    onChange={(e) => setNewPrepUrl(e.target.value)}
                    placeholder="https://docs.google.com/..."
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Link Label (optional)</Label>
                  <Input
                    value={newPrepUrlTitle}
                    onChange={(e) => setNewPrepUrlTitle(e.target.value)}
                    placeholder="My notes doc"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={addPrepNote} disabled={!newPrepContent.trim()}>
                  <Plus className="mr-1 h-3 w-3" />
                  Add Prep Note
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAddPrepForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Links (legacy, kept for existing data) */}
      {links.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2">
              {links.map((link) => (
                <li key={link.id} className="flex items-center justify-between gap-2">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline truncate"
                  >
                    {link.title}
                  </a>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => deleteLink(link.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 items-end">
              <div className="flex-1 grid gap-2 sm:grid-cols-2">
                <Input
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  placeholder="URL (Google Drive, webpage, etc.)"
                  onKeyDown={(e) => e.key === 'Enter' && addLink()}
                />
                <Input
                  value={newLinkTitle}
                  onChange={(e) => setNewLinkTitle(e.target.value)}
                  placeholder="Label (optional)"
                  onKeyDown={(e) => e.key === 'Enter' && addLink()}
                />
              </div>
              <Button size="sm" onClick={addLink} disabled={!newLinkUrl.trim()}>
                <Plus className="mr-1 h-3 w-3" />
                Add
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
            {contact.roleDescription && (
              <Field label="Role Description" className="sm:col-span-2">{contact.roleDescription}</Field>
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
                <div className="prep-note-markdown"><ReactMarkdown>{contact.notes}</ReactMarkdown></div>
              </Field>
            )}
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
