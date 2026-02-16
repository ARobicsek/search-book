import { useState } from 'react'
import { CalendarDays, ChevronDown, X } from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Action } from '@/lib/types'

interface ActionDateSelectProps {
  action: Action
  onUpdate?: () => void
  showLabel?: boolean
  className?: string
}

export function ActionDateSelect({ action, onUpdate, showLabel = true, className }: ActionDateSelectProps) {
  const [open, setOpen] = useState(false)

  // Format the current date for display
  const today = new Date().toLocaleDateString('en-CA')
  const isOverdue = action.dueDate && action.dueDate < today && !action.completed

  async function updateDate(newDate: string | null) {
    if (newDate === action.dueDate) {
      setOpen(false)
      return
    }

    try {
      await api.put(`/actions/${action.id}`, { dueDate: newDate })
      toast.success('Due date updated')
      onUpdate?.()
      setOpen(false)
    } catch (err) {
      toast.error('Failed to update due date')
    }
  }

  // Helper to calculate future dates
  const getPresetDate = (daysToAdd: number) => {
    const date = new Date()
    date.setDate(date.getDate() + daysToAdd)
    return date.toLocaleDateString('en-CA')
  }

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return 'No Date'

    // Check for Today/Tomorrow
    const date = new Date(dateStr + 'T00:00:00')
    const todayDate = new Date()
    todayDate.setHours(0, 0, 0, 0)

    const tomorrowDate = new Date(todayDate)
    tomorrowDate.setDate(tomorrowDate.getDate() + 1)

    if (date.getTime() === todayDate.getTime()) return 'Today'
    if (date.getTime() === tomorrowDate.getTime()) return 'Tomorrow'

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 px-2 text-xs font-normal justify-start",
            isOverdue ? "text-red-600 hover:text-red-700 hover:bg-red-50" : "text-muted-foreground",
            !action.dueDate && "text-muted-foreground/50",
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <CalendarDays className="mr-2 h-3.5 w-3.5" />
          <span className={cn("truncate", !showLabel && "sr-only")}>
            {action.dueDate ? formatDateDisplay(action.dueDate) : 'No Date'}
          </span>
          {showLabel && <ChevronDown className="ml-1 h-3 w-3 opacity-50" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="grid gap-1">
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-xs font-medium text-muted-foreground">Select Due Date</span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="justify-start font-normal"
            onClick={() => updateDate(getPresetDate(0))}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start font-normal"
            onClick={() => updateDate(getPresetDate(1))}
          >
            Tomorrow
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start font-normal"
            onClick={() => updateDate(getPresetDate(7))}
          >
            Next Week
          </Button>

          <div className="border-t my-1" />

          <div className="px-2 py-1.5">
            <span className="text-xs text-muted-foreground mb-1 block">Custom Date</span>
            <Input
              type="date"
              className="h-8 text-xs"
              value={action.dueDate || ''}
              onChange={(e) => updateDate(e.target.value)}
            />
          </div>

          {action.dueDate && (
            <>
              <div className="border-t my-1" />
              <Button
                variant="ghost"
                size="sm"
                className="justify-start text-muted-foreground hover:text-destructive font-normal"
                onClick={() => updateDate(null)}
              >
                <X className="mr-2 h-3.5 w-3.5" />
                Clear Date
              </Button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
