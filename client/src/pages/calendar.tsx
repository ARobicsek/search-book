import { useEffect, useState, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg } from '@fullcalendar/core'
import { api } from '@/lib/api'
import type { Action } from '@/lib/types'
import { toast } from 'sonner'

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

export function CalendarPage() {
  const navigate = useNavigate()
  const [actions, setActions] = useState<Action[]>([])
  const [loading, setLoading] = useState(true)

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
  }, [fetchActions])

  const events = actions
    .filter((a) => a.dueDate)
    .map((a) => ({
      id: a.id.toString(),
      title: a.title,
      date: a.dueDate!,
      allDay: true,
      backgroundColor: getEventColor(a),
      borderColor: getEventColor(a),
      textColor: getTextColor(a),
      classNames: a.completed ? ['line-through', 'opacity-60'] : [],
      extendedProps: { action: a },
    }))

  function handleEventClick(info: EventClickArg) {
    navigate(`/actions/${info.event.id}`)
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
      <div className="rounded-md border bg-background p-4">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek',
          }}
          events={events}
          eventClick={handleEventClick}
          height="auto"
          dayMaxEvents={4}
          nowIndicator
        />
      </div>
    </div>
  )
}
