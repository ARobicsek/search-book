import { Loader2, Check, AlertCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SaveStatus } from '@/hooks/use-auto-save'

interface SaveStatusIndicatorProps {
  status: SaveStatus
  className?: string
}

const VARIANTS: Record<Exclude<SaveStatus, 'idle'>, { tone: string; Icon: LucideIcon; label: string }> = {
  saving: { tone: 'text-muted-foreground', Icon: Loader2, label: 'Saving...' },
  saved: { tone: 'text-green-600', Icon: Check, label: 'Saved' },
  error: { tone: 'text-destructive', Icon: AlertCircle, label: 'Save failed' },
}

const KEYS = Object.keys(VARIANTS) as Array<keyof typeof VARIANTS>

/**
 * All three states are stacked in a single grid cell and cross-faded, so the
 * indicator occupies the SAME box in every state — including idle.
 *
 * It used to return null when idle. Mounting/unmounting it grew its row by 2px
 * on each autosave flash (the icon's 20px line box vs. a `leading-none` dialog
 * title's 18px), which nudged the whole dialog body down and back every ~1.5s
 * while typing — the "Saved" jitter.
 */
export function SaveStatusIndicator({ status, className }: SaveStatusIndicatorProps) {
  return (
    <div className={cn('grid w-fit text-sm', className)} aria-live="polite">
      {KEYS.map((key) => {
        const { tone, Icon, label } = VARIANTS[key]
        const active = status === key
        return (
          <div
            key={key}
            aria-hidden={!active}
            className={cn(
              // Same cell for every state → the box is as wide/tall as the
              // longest label, whichever one is showing.
              'col-start-1 row-start-1 flex items-center gap-1.5 transition-opacity duration-300',
              tone,
              active ? 'opacity-100' : 'opacity-0'
            )}
          >
            <Icon className={cn('h-4 w-4', key === 'saving' && active && 'animate-spin')} />
            <span>{label}</span>
          </div>
        )
      })}
    </div>
  )
}
