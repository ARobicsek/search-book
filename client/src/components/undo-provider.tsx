import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { fetchUndoState, performUndo, type UndoState } from '@/lib/undo'

// Where to send the user after restoring a top-level entity (so they can confirm it's
// back). Child records (prep notes, links, …) have no standalone page → toast only.
const DETAIL_PATH: Record<string, (id: number) => string> = {
  contact: (id) => `/contacts/${id}`,
  company: (id) => `/companies/${id}`,
  action: (id) => `/actions/${id}`,
  conversation: () => `/meetings`,
}

type UndoContextValue = {
  state: UndoState
  undo: () => Promise<void>
  refresh: () => void
}

const UndoContext = createContext<UndoContextValue | null>(null)

export function useUndo(): UndoContextValue {
  const ctx = useContext(UndoContext)
  if (!ctx) throw new Error('useUndo must be used within an UndoProvider')
  return ctx
}

export function UndoProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [state, setState] = useState<UndoState>({ canUndo: false })
  const busyRef = useRef(false)
  // Mirror of state for the keydown handler, which is bound once (stale-closure pattern).
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const refresh = useCallback(() => {
    fetchUndoState()
      .then(setState)
      .catch(() => {
        /* non-fatal — just leave the affordance as-is */
      })
  }, [])

  // Refresh on mount and whenever a delete or undo changes the server-side stack.
  useEffect(() => {
    refresh()
    const onChange = () => refresh()
    window.addEventListener('searchbook:deleted', onChange)
    window.addEventListener('searchbook:undone', onChange)
    return () => {
      window.removeEventListener('searchbook:deleted', onChange)
      window.removeEventListener('searchbook:undone', onChange)
    }
  }, [refresh])

  const undo = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    try {
      const result = await performUndo()
      const detail = DETAIL_PATH[result.entityType]
      toast.success(`Restored: ${result.label}`, {
        action: detail
          ? { label: 'View', onClick: () => navigate(detail(result.entityId)) }
          : undefined,
      })
      window.dispatchEvent(new CustomEvent('searchbook:undone'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to undo')
      refresh() // e.g. 404 "nothing to undo" — re-sync so the button hides
    } finally {
      busyRef.current = false
    }
  }, [navigate, refresh])

  // Cmd/Ctrl+Z anywhere — except while editing text (let the browser undo typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isUndoChord =
        (e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey
      if (!isUndoChord) return
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (!stateRef.current.canUndo) return
      e.preventDefault()
      void undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo])

  return <UndoContext.Provider value={{ state, undo, refresh }}>{children}</UndoContext.Provider>
}

// Persistent header affordance — only rendered when there's a delete to undo.
// Uses the Radix Tooltip (not a native `title`) so the label re-reads on every open;
// the button element never remounts, and browsers cache the native tooltip text per
// element, which would otherwise freeze it at an earlier delete's label.
export function UndoButton() {
  const { state, undo } = useUndo()
  if (!state.canUndo) return null
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void undo()}
          aria-label={`Undo last delete${state.label ? `: ${state.label}` : ''}`}
        >
          <Undo2 className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Undo</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{`Undo delete${state.label ? ` — ${state.label}` : ''}`}</TooltipContent>
    </Tooltip>
  )
}
