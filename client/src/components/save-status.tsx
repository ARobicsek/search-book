import { Loader2, Check, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SaveStatus } from '@/hooks/use-auto-save'

interface SaveStatusIndicatorProps {
  status: SaveStatus
  className?: string
}

export function SaveStatusIndicator({ status, className }: SaveStatusIndicatorProps) {
  if (status === 'idle') {
    return null
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 text-sm transition-opacity duration-300',
        status === 'saving' && 'text-muted-foreground',
        status === 'saved' && 'text-green-600',
        status === 'error' && 'text-destructive',
        className
      )}
    >
      {status === 'saving' && (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Saving...</span>
        </>
      )}
      {status === 'saved' && (
        <>
          <Check className="h-4 w-4" />
          <span>Saved</span>
        </>
      )}
      {status === 'error' && (
        <>
          <AlertCircle className="h-4 w-4" />
          <span>Save failed</span>
        </>
      )}
    </div>
  )
}
