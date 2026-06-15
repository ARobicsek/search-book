import { useEffect, useState, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg } from '@fullcalendar/core'
import { api } from '@/lib/api'
import type { Action } from '@/lib/types'
import { toast } from 'sonner'
import { useIsMobile } from '@/hooks/use-mobile'

function getEventColor(action: Action): string {
  if (action.completed) return '#86efac' // green-300
  const today = new Date().toLocaleDateString('en-CA')
  if (action.dueDate && action.dueDate < today) return '#fca5a5' // red-300
  if (action.priority === 'HIGH') return '#f87171' // red-400
  if (action.priority === 'MEDIUM') return '#fbbf24' // amber-400
  return '#94a3b8' // slate-400
}

function getTextColor(action: Action): string {
  if (action.completed) return '#166534' // green-800
  const today = new Date().toLocaleDateString('en-CA')
  if (action.dueDate && action.dueDate < today) return '#991b1b' // red-800
  if (action.priority === 'HIGH') return '#7f1d1d'
  if (action.priority === 'MEDIUM') return '#78350f'
  return '#1e293b'
}

// Names of the people an action is waiting on (owerContactIds → contact names),
// for the "waiting on" hover tooltip. Unknown ids degrade to "#id".
function owerNames(action: Action, names: Map<number, string>): string[] {
  if (!action.owerContactIds) return []
  try {
    const ids = JSON.parse(action.owerContactIds)
    return Array.isArray(ids) ? ids.map((id: number) => names.get(id) || `#${id}`) : []
  } catch {
    return []
  }
}

// The Actions calendar, embedded as the "Calendar" view of the Actions page
// (mirrors how MeetingsCalendar lives inside the Meetings page). All actions with
// a due date render as all-day events; waiting-on-someone actions get a ⏳ prefix
// and a "Waiting on: …" hover tooltip.
export function ActionsCalendar() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [actions, setActions] = useState<Action[]>([])
  const [contactNames, setContactNames] = useState<Map<number, string>>(new Map())
  const [loading, setLoading] = useState(true)
  // useIsMobile resolves false→true on its mount effect, but FullCalendar reads
  // `initialView` once on mount — defer the first mount a frame so the mobile
  // list default is honored (same trick as MeetingsCalendar).
  const [ready, setReady] = useState(false)
  useEffect(() => { setReady(true) }, [])

  const fetchActions = useCallback(async () => {
    try {
      const data = await api.get<Action[]>('/actions')
      setActions(data)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load actions'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchActions()
    // Names to resolve owerContactIds → people for the "waiting on" tooltip.
    api.get<{ id: number; name: string }[]>('/contacts/names')
      .then((data) => setContactNames(new Map(data.map((c) => [c.id, c.name]))))
      .catch(() => { })
  }, [fetchActions])

  const events = actions
    .filter((a) => a.dueDate)
    .map((a) => {
      const waiting = a.direction === 'WAITING_ON_THEM'
      const owers = waiting ? owerNames(a, contactNames) : []
      // Native hover tooltip naming who I'm waiting on (a11y-safe, zero deps —
      // same technique as MeetingsCalendar).
      const tooltip = waiting
        ? owers.length ? `Waiting on: ${owers.join(', ')}` : 'Waiting on someone else'
        : ''
      return {
        id: a.id.toString(),
        // ⏳ prefix flags "waiting on someone else" in both month and list views
        // without overriding the priority/overdue color.
        title: waiting ? `⏳ ${a.title}` : a.title,
        date: a.dueDate!,
        allDay: true,
        backgroundColor: getEventColor(a),
        borderColor: getEventColor(a),
        textColor: getTextColor(a),
        classNames: a.completed ? ['line-through', 'opacity-60'] : [],
        extendedProps: { tooltip },
      }
    })

  function handleEventClick(info: EventClickArg) {
    navigate(`/actions/${info.event.id}`)
  }

  if (loading || !ready) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="rounded-md border bg-background p-2 sm:p-4">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        initialView={isMobile ? 'listWeek' : 'dayGridMonth'}
        headerToolbar={isMobile ? {
          left: 'prev,next',
          center: 'title',
          right: 'listWeek,dayGridMonth',
        } : {
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek',
        }}
        events={events}
        eventClick={handleEventClick}
        // Actions are all-day; blank FullCalendar's "all-day" label in the mobile
        // list view (consistent with the Meetings calendar) so it reads cleaner.
        allDayText=""
        eventDidMount={(info) => {
          const tip = info.event.extendedProps.tooltip as string | undefined
          if (tip) info.el.title = tip
        }}
        height="auto"
        dayMaxEvents={isMobile ? 2 : 4}
        nowIndicator
      />
    </div>
  )
}
