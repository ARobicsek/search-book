import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const shortcuts = [
  { keys: ['Ctrl', 'K'], description: 'Open command palette' },
  { keys: ['?'], description: 'Show keyboard shortcuts' },
  { keys: ['g', 'then', 'h'], description: 'Go to Dashboard' },
  { keys: ['g', 'then', 'c'], description: 'Go to Contacts' },
  { keys: ['g', 'then', 'o'], description: 'Go to Companies' },
  { keys: ['g', 'then', 'a'], description: 'Go to Actions' },
  { keys: ['g', 'then', 'l'], description: 'Go to Calendar' },
  { keys: ['g', 'then', 'i'], description: 'Go to Ideas' },
  { keys: ['g', 'then', 'n'], description: 'Go to Analytics' },
  { keys: ['g', 'then', 's'], description: 'Go to Settings' },
  { keys: ['Esc'], description: 'Close dialogs' },
]

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    let gPressed = false
    let gTimeout: ReturnType<typeof setTimeout>

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      if (isInput) return

      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        setOpen(true)
        return
      }

      if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
        gPressed = true
        clearTimeout(gTimeout)
        gTimeout = setTimeout(() => { gPressed = false }, 1000)
        return
      }

      if (gPressed) {
        gPressed = false
        clearTimeout(gTimeout)
        const routes: Record<string, string> = {
          h: '/',
          c: '/contacts',
          o: '/companies',
          a: '/actions',
          l: '/calendar',
          i: '/ideas',
          n: '/analytics',
          s: '/settings',
        }
        const route = routes[e.key]
        if (route) {
          e.preventDefault()
          navigate(route)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      clearTimeout(gTimeout)
    }
  }, [navigate])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {shortcuts.map((s) => (
            <div key={s.description} className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{s.description}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((key, i) =>
                  key === 'then' ? (
                    <span key={i} className="text-xs text-muted-foreground mx-0.5">then</span>
                  ) : (
                    <kbd
                      key={i}
                      className="px-2 py-1 text-xs font-mono font-semibold bg-muted border rounded"
                    >
                      {key}
                    </kbd>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
