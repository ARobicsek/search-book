import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Contact, Action, ActionType, ActionPriority } from '@/lib/types'
import { ECOSYSTEM_OPTIONS, CONTACT_STATUS_OPTIONS, ACTION_TYPE_OPTIONS, ACTION_PRIORITY_OPTIONS } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { ArrowLeft, Pencil, Trash2, ExternalLink, Plus, Check } from 'lucide-react'

const actionTypeColors: Record<string, string> = {
  EMAIL: 'bg-blue-100 text-blue-800',
  CALL: 'bg-green-100 text-green-800',
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null
  return (
    <div className="space-y-1">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

export function ContactDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [contact, setContact] = useState<Contact | null>(null)
  const [actions, setActions] = useState<Action[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!id) return
    api
      .get<Contact>(`/contacts/${id}`)
      .then(setContact)
      .catch((err) => {
        toast.error(err.message)
        navigate('/contacts')
      })
      .finally(() => setLoading(false))

    api.get<Action[]>(`/actions?contactId=${id}`).then(setActions).catch(() => {})
  }, [id, navigate])

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

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  if (!contact) {
    return <div className="text-muted-foreground">Contact not found.</div>
  }

  const companyDisplay = contact.company
    ? contact.company.name
    : contact.companyName || null

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/contacts')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
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

      {/* Contact Details */}
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

      {/* Connections */}
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

      {/* Research */}
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

      {/* Placeholder sections for future phases */}
      <Card>
        <CardHeader>
          <CardTitle className="text-muted-foreground">Conversations</CardTitle>
          <CardDescription>Coming in Phase 3</CardDescription>
        </CardHeader>
      </Card>

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
                const overdue = !action.completed && action.dueDate && action.dueDate < new Date().toISOString().split('T')[0]
                return (
                  <div key={action.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50">
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
                      className={`flex-1 text-sm hover:underline ${action.completed ? 'text-muted-foreground line-through' : ''}`}
                    >
                      {action.title}
                    </Link>
                    <Badge variant="outline" className={`text-xs ${actionTypeColors[action.type]}`}>
                      {getLabel(action.type, ACTION_TYPE_OPTIONS)}
                    </Badge>
                    <Badge variant="outline" className={`text-xs ${actionPriorityColors[action.priority]}`}>
                      {getLabel(action.priority, ACTION_PRIORITY_OPTIONS)}
                    </Badge>
                    {action.dueDate && (
                      <span className={`text-xs ${overdue ? 'font-semibold text-red-600' : 'text-muted-foreground'}`}>
                        {new Date(action.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-muted-foreground">Relationships</CardTitle>
          <CardDescription>Coming in Phase 3</CardDescription>
        </CardHeader>
      </Card>

      {/* Timestamps */}
      <div className="flex gap-6 text-xs text-muted-foreground">
        <span>Created {formatDate(contact.createdAt)}</span>
        <span>Updated {formatDate(contact.updatedAt)}</span>
      </div>
    </div>
  )
}
