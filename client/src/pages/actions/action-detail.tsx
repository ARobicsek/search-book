import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Action, LinkRecord } from '@/lib/types'
import { ACTION_TYPE_OPTIONS, ACTION_PRIORITY_OPTIONS } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { ArrowLeft, Pencil, Trash2, Check, Circle, Loader2, ExternalLink } from 'lucide-react'

const typeColors: Record<string, string> = {
  EMAIL: 'bg-blue-100 text-blue-800',
  CALL: 'bg-green-100 text-green-800',
  READ: 'bg-purple-100 text-purple-800',
  WRITE: 'bg-indigo-100 text-indigo-800',
  RESEARCH: 'bg-amber-100 text-amber-800',
  FOLLOW_UP: 'bg-orange-100 text-orange-800',
  INTRO: 'bg-cyan-100 text-cyan-800',
  OTHER: 'bg-slate-100 text-slate-700',
}

const priorityColors: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  LOW: 'bg-slate-100 text-slate-600',
}

function getLabel(value: string, options: { value: string; label: string }[]) {
  return options.find((o) => o.value === value)?.label ?? value
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTimestamp(dateStr: string) {
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

function isOverdue(action: Action): boolean {
  if (action.completed || !action.dueDate) return false
  const today = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local timezone
  return action.dueDate < today
}

export function ActionDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [action, setAction] = useState<Action | null>(null)
  const [links, setLinks] = useState<LinkRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([
      api.get<Action>(`/actions/${id}`),
      api.get<LinkRecord[]>(`/links?actionId=${id}`),
    ])
      .then(([actionData, linksData]) => {
        setAction(actionData)
        setLinks(linksData)
      })
      .catch((err) => {
        toast.error(err.message)
        navigate('/actions')
      })
      .finally(() => setLoading(false))
  }, [id, navigate])

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.delete(`/actions/${id}`)
      toast.success('Action deleted')
      navigate('/actions')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  async function handleToggleComplete() {
    setToggling(true)
    try {
      const result = await api.patch<{ action: Action; nextAction: Action | null }>(`/actions/${id}/complete`)
      setAction(result.action)
      toast.success(result.action.completed ? 'Marked complete' : 'Marked incomplete')
      if (result.nextAction?.dueDate) {
        toast.info(`Next occurrence created for ${result.nextAction.dueDate}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setToggling(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  }

  if (!action) {
    return <div className="text-muted-foreground">Action not found.</div>
  }

  const overdue = isOverdue(action)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 sm:items-center sm:gap-4">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate('/actions')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className={`text-2xl font-bold tracking-tight ${action.completed ? 'line-through text-muted-foreground' : ''}`}>
              {action.title}
            </h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline" className={typeColors[action.type]}>
                {getLabel(action.type, ACTION_TYPE_OPTIONS)}
              </Badge>
              <Badge variant="outline" className={priorityColors[action.priority]}>
                {getLabel(action.priority, ACTION_PRIORITY_OPTIONS)}
              </Badge>
              {action.completed ? (
                <Badge variant="outline" className="bg-green-100 text-green-800">
                  Completed
                </Badge>
              ) : overdue ? (
                <Badge variant="outline" className="bg-red-100 text-red-800">
                  Overdue
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-blue-100 text-blue-800">
                  Pending
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleComplete}
            disabled={toggling}
            className="flex-1 sm:flex-initial"
          >
            {action.completed ? (
              <>
                <Circle className="mr-2 h-4 w-4" />
                Incomplete
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Complete
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" asChild className="flex-1 sm:flex-initial">
            <Link to={`/actions/${action.id}/edit`}>
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
                <DialogTitle>Delete Action</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete <strong>{action.title}</strong>? This
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

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Description">
              {action.description && (
                <p className="whitespace-pre-wrap">{action.description}</p>
              )}
            </Field>
            <Field label="Due Date">
              {action.dueDate && (
                <span className={overdue ? 'font-semibold text-red-600' : ''}>
                  {formatDate(action.dueDate)}
                </span>
              )}
            </Field>
            {action.completed && action.completedDate && (
              <Field label="Completed Date">
                {formatDate(action.completedDate)}
              </Field>
            )}
            {action.recurring && (
              <>
                <Field label="Recurring">
                  Every {action.recurringIntervalDays} day{action.recurringIntervalDays !== 1 ? 's' : ''}
                </Field>
                {action.recurringEndDate && (
                  <Field label="Recurrence Ends">
                    {formatDate(action.recurringEndDate)}
                  </Field>
                )}
              </>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Related To */}
      <Card>
        <CardHeader>
          <CardTitle>Related To</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label={action.actionContacts && action.actionContacts.length > 1 ? 'Contacts' : 'Contact'}>
              {(() => {
                const contacts = action.actionContacts?.length
                  ? action.actionContacts.map((ac) => ac.contact)
                  : action.contact ? [action.contact] : []
                return contacts.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {contacts.map((c) => (
                      <Link
                        key={c.id}
                        to={`/contacts/${c.id}`}
                        className="text-primary hover:underline"
                      >
                        {c.name}{contacts.indexOf(c) < contacts.length - 1 ? ',' : ''}
                      </Link>
                    ))}
                  </div>
                ) : null
              })()}
            </Field>
            <Field label={action.actionCompanies && action.actionCompanies.length > 1 ? 'Companies' : 'Company'}>
              {(() => {
                const companies = action.actionCompanies?.length
                  ? action.actionCompanies.map((ac) => ac.company)
                  : action.company ? [action.company] : []
                return companies.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {companies.map((c) => (
                      <Link
                        key={c.id}
                        to={`/companies/${c.id}`}
                        className="text-primary hover:underline"
                      >
                        {c.name}{companies.indexOf(c) < companies.length - 1 ? ',' : ''}
                      </Link>
                    ))}
                  </div>
                ) : null
              })()}
            </Field>
            <Field label="Conversation">
              {action.conversation && (
                <span className="text-muted-foreground">
                  {action.conversation.summary ?? `Conversation #${action.conversationId}`}
                </span>
              )}
            </Field>
          </dl>
        </CardContent>
      </Card>

      {/* Document Links */}
      {links.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Document Links</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {links.map((link) => (
                <li key={link.id}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {link.title}
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Timestamps */}
      <div className="flex gap-6 text-xs text-muted-foreground">
        <span>Created {formatTimestamp(action.createdAt)}</span>
        <span>Updated {formatTimestamp(action.updatedAt)}</span>
      </div>
    </div>
  )
}
