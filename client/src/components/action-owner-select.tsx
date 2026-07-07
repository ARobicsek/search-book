import { useState } from 'react'
import { Hourglass, Undo2, X } from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import type { Action } from '@/lib/types'

// One shared fetch of /contacts/names (relevance-ranked) across every row's popover —
// the dashboard renders one ActionOwnerSelect per action and they'd all fetch on open.
let contactNamesPromise: Promise<{ id: number; name: string }[]> | null = null
function getContactNames() {
  if (!contactNamesPromise) {
    contactNamesPromise = api
      .get<{ id: number; name: string }[]>('/contacts/names')
      .catch((err) => {
        contactNamesPromise = null // let a later open retry
        throw err
      })
  }
  return contactNamesPromise
}

// Parse the stored owerContactIds JSON ("[3,7]") → number[] (mirrors the server helper).
function parseOwerIds(json: string | null): number[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.map((x) => parseInt(String(x))).filter((n) => !Number.isNaN(n)) : []
  } catch {
    return []
  }
}

interface ActionOwnerSelectProps {
  action: Action
  onUpdate?: () => void
  className?: string
}

// Quick ownership switch for an action row: hand it off ("I did my part — now I'm
// waiting on them") or take it back, without opening the full action form. Saves
// owedByMe + owerContactIds; the server derives `direction` from the pair.
export function ActionOwnerSelect({ action, onUpdate, className }: ActionOwnerSelectProps) {
  const [open, setOpen] = useState(false)
  const [contacts, setContacts] = useState<{ id: number; name: string }[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  const waiting = action.direction === 'WAITING_ON_THEM'
  const owers = action.owers ?? []
  const owerIds = parseOwerIds(action.owerContactIds)

  // The action's linked contact(s) — the most likely hand-off target ("Reach out to
  // John re X" → John), surfaced as one-click picks.
  const linked = (
    action.actionContacts?.length
      ? action.actionContacts.map((ac) => ac.contact)
      : action.contact
        ? [action.contact]
        : []
  ).filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i && !owerIds.includes(c.id))

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next && !contacts) {
      getContactNames()
        .then(setContacts)
        .catch(() => setLoadFailed(true))
    }
  }

  // Always send BOTH fields: the server defaults owedByMe to true when it's omitted.
  async function save(owedByMe: boolean, ids: number[], message: string) {
    try {
      await api.put(`/actions/${action.id}`, { owedByMe, owerContactIds: ids })
      toast.success(message)
      onUpdate?.()
      setOpen(false)
    } catch {
      toast.error('Failed to update ownership')
    }
  }

  const searchList = (onPick: (c: { id: number; name: string }) => void, placeholder: string) => (
    <Command className="rounded-md border">
      <CommandInput placeholder={placeholder} className="h-8 text-xs" />
      <CommandList className="max-h-36">
        <CommandEmpty className="py-3 text-xs text-muted-foreground">
          {loadFailed ? 'Failed to load contacts' : contacts ? 'No match' : 'Loading contacts…'}
        </CommandEmpty>
        {(contacts ?? [])
          .filter((c) => !owerIds.includes(c.id))
          .map((c) => (
            <CommandItem key={c.id} value={`${c.name} ${c.id}`} onSelect={() => onPick(c)} className="text-xs">
              {c.name}
            </CommandItem>
          ))}
      </CommandList>
    </Command>
  )

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-8 px-2 text-xs font-normal justify-start',
            waiting ? 'text-fuchsia-700 hover:text-fuchsia-800 hover:bg-fuchsia-50' : 'text-muted-foreground/70',
            className
          )}
          onClick={(e) => e.stopPropagation()}
          title={
            waiting
              ? `Waiting on ${owers.length ? owers.map((o) => o.name).join(', ') : 'someone else'} — click to change`
              : 'Hand off — mark as waiting on someone else'
          }
        >
          <Hourglass className="h-3.5 w-3.5" />
          {/* Named owers already appear on the row; label the unnamed case so it isn't invisible */}
          {waiting && !owers.length ? (
            <span className="ml-1">Waiting</span>
          ) : (
            <span className="sr-only">{waiting ? 'Change ownership' : 'Hand off'}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start" onClick={(e) => e.stopPropagation()}>
        {waiting ? (
          <div className="grid gap-1">
            <span className="px-2 pb-1 text-xs font-medium text-muted-foreground">Waiting on</span>
            <div className="flex flex-wrap gap-1 px-2 pb-1">
              {action.owedByMe && (
                <span className="flex items-center gap-1 rounded-full border bg-primary/10 px-2 py-0.5 text-xs">
                  Me
                  <button
                    type="button"
                    onClick={() => save(false, owerIds, 'Updated who owes it')}
                    className="text-muted-foreground hover:text-foreground"
                    title="Remove me"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {owers.length === 0 && !action.owedByMe && (
                <span className="rounded-full border bg-fuchsia-50 px-2 py-0.5 text-xs text-fuchsia-800">
                  Someone (unnamed)
                </span>
              )}
              {owers.map((o) => (
                <span key={o.id} className="flex items-center gap-1 rounded-full border bg-fuchsia-50 px-2 py-0.5 text-xs text-fuchsia-900">
                  {o.name}
                  <button
                    type="button"
                    onClick={() => {
                      const rest = owerIds.filter((id) => id !== o.id)
                      const backToMe = action.owedByMe && rest.length === 0
                      save(action.owedByMe, rest, backToMe ? 'You own this again' : 'Updated who owes it')
                    }}
                    className="text-muted-foreground hover:text-foreground"
                    title={`Remove ${o.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            {searchList((c) => save(action.owedByMe, [...owerIds, c.id], `Now waiting on ${c.name}`), 'Add a person…')}
            <div className="border-t my-1" />
            <Button
              variant="ghost"
              size="sm"
              className="justify-start font-normal"
              onClick={() => save(true, [], 'Back in your court — you own it')}
            >
              <Undo2 className="mr-2 h-3.5 w-3.5" />
              Take it back — I own it
            </Button>
          </div>
        ) : (
          <div className="grid gap-1">
            <span className="px-2 pb-1 text-xs font-medium text-muted-foreground">
              Hand off — now waiting on…
            </span>
            {linked.map((c) => (
              <Button
                key={c.id}
                variant="ghost"
                size="sm"
                className="justify-start font-normal"
                onClick={() => save(false, [c.id], `Now waiting on ${c.name}`)}
              >
                <Hourglass className="mr-2 h-3.5 w-3.5 text-fuchsia-600" />
                {c.name}
              </Button>
            ))}
            {searchList((c) => save(false, [c.id], `Now waiting on ${c.name}`), 'Search contacts…')}
            <div className="border-t my-1" />
            <Button
              variant="ghost"
              size="sm"
              className="justify-start font-normal text-muted-foreground"
              onClick={() => save(false, [], 'Marked as waiting on someone else')}
            >
              <Hourglass className="mr-2 h-3.5 w-3.5" />
              Someone else — no name
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
