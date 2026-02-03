import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Action, ActionType, ActionPriority, Contact } from '@/lib/types'
import { ACTION_TYPE_OPTIONS, ACTION_PRIORITY_OPTIONS } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { toast } from 'sonner'
import { Check, Plus, AlertTriangle, CalendarDays, UserX } from 'lucide-react'

const typeColors: Record<ActionType, string> = {
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

const priorityColors: Record<ActionPriority, string> = {
  HIGH: 'bg-red-100 text-red-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  LOW: 'bg-slate-100 text-slate-600',
}

function getLabel(value: string, options: { value: string; label: string }[]) {
  return options.find((o) => o.value === value)?.label ?? value
}

function formatDateShort(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

const priorityOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }

function sortByPriority(a: Action, b: Action) {
  return (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9)
}

interface ActionRowProps {
  action: Action
  onToggle: (action: Action) => void
  showDate?: boolean
}

function ActionRow({ action, onToggle, showDate }: ActionRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50">
      <button
        onClick={() => onToggle(action)}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
          action.completed
            ? 'border-green-500 bg-green-500 text-white'
            : 'border-muted-foreground/30 hover:border-green-500'
        }`}
      >
        {action.completed && <Check className="h-3 w-3" />}
      </button>
      <Link
        to={`/actions/${action.id}`}
        className={`flex-1 text-sm font-medium hover:underline ${
          action.completed ? 'text-muted-foreground line-through' : ''
        }`}
      >
        {action.title}
      </Link>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={`text-xs ${typeColors[action.type as ActionType]}`}>
          {getLabel(action.type, ACTION_TYPE_OPTIONS)}
        </Badge>
        <Badge variant="outline" className={`text-xs ${priorityColors[action.priority as ActionPriority]}`}>
          {getLabel(action.priority, ACTION_PRIORITY_OPTIONS)}
        </Badge>
        {action.contact && (
          <Link
            to={`/contacts/${action.contact.id}`}
            className="text-xs text-muted-foreground hover:underline"
          >
            {action.contact.name}
          </Link>
        )}
        {showDate && action.dueDate && (
          <span className="text-xs text-muted-foreground">{formatDateShort(action.dueDate)}</span>
        )}
      </div>
    </div>
  )
}

export function DashboardPage() {
  const [allPending, setAllPending] = useState<Action[]>([])
  const [overdueActions, setOverdueActions] = useState<Action[]>([])
  const [nudgeContacts, setNudgeContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().split('T')[0]

  const fetchData = useCallback(async () => {
    try {
      const [pending, overdue, nudge] = await Promise.all([
        api.get<Action[]>('/actions?status=pending'),
        api.get<Action[]>('/actions?status=overdue'),
        api.get<Contact[]>('/contacts/without-actions'),
      ])
      setAllPending(pending)
      setOverdueActions(overdue)
      setNudgeContacts(nudge)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function toggleComplete(action: Action) {
    try {
      await api.patch<Action>(`/actions/${action.id}/complete`)
      fetchData()
      toast.success(action.completed ? 'Marked incomplete' : 'Marked complete')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update'
      toast.error(message)
    }
  }

  const todayActions = allPending
    .filter((a) => a.dueDate === today)
    .sort(sortByPriority)

  const upcomingActions = allPending
    .filter((a) => a.dueDate && a.dueDate > today)
    .sort((a, b) => {
      if (a.dueDate! !== b.dueDate!) return a.dueDate! < b.dueDate! ? -1 : 1
      return sortByPriority(a, b)
    })
    .slice(0, 10)

  const noDueDateActions = allPending
    .filter((a) => !a.dueDate)
    .sort(sortByPriority)

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>
        <Button asChild>
          <Link to="/actions/new">
            <Plus className="mr-2 h-4 w-4" />
            New Action
          </Link>
        </Button>
      </div>

      {/* Overdue Actions */}
      {overdueActions.length > 0 && (
        <Card className="border-red-200 bg-red-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="h-5 w-5" />
              Overdue ({overdueActions.length})
            </CardTitle>
            <CardDescription className="text-red-700/70">
              These actions are past their due date
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {overdueActions.sort(sortByPriority).map((action) => (
              <ActionRow
                key={action.id}
                action={action}
                onToggle={toggleComplete}
                showDate
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Today's Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Today ({todayActions.length})
          </CardTitle>
          <CardDescription>What you need to do today</CardDescription>
        </CardHeader>
        <CardContent>
          {todayActions.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No actions due today.{' '}
              <Link to="/actions/new" className="text-primary hover:underline">
                Create one
              </Link>
            </p>
          ) : (
            <div className="space-y-1">
              {todayActions.map((action) => (
                <ActionRow key={action.id} action={action} onToggle={toggleComplete} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming */}
      {upcomingActions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Upcoming</CardTitle>
            <CardDescription>Actions due in the next 7 days</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {upcomingActions.map((action) => (
              <ActionRow
                key={action.id}
                action={action}
                onToggle={toggleComplete}
                showDate
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* No Due Date */}
      {noDueDateActions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Unscheduled</CardTitle>
            <CardDescription>Actions without a due date</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {noDueDateActions.map((action) => (
              <ActionRow key={action.id} action={action} onToggle={toggleComplete} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Contacts without actions (nudge list) */}
      {nudgeContacts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <UserX className="h-5 w-5" />
              Needs Attention ({nudgeContacts.length})
            </CardTitle>
            <CardDescription>Contacts without a pending action</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {nudgeContacts.map((contact) => (
                <div key={contact.id} className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-muted/50">
                  <Link
                    to={`/contacts/${contact.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {contact.name}
                  </Link>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/actions/new?contactId=${contact.id}`}>
                      <Plus className="mr-1 h-3 w-3" />
                      Add Action
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
