import { useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useImageUpload } from '@/hooks/use-image-upload'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Camera, ImageIcon, Link as LinkIcon, Loader2, Trash2, Upload } from 'lucide-react'

// Two letters from the first + last word ("Michael Avotins" → "MA"), so a contact
// with no photo still gets an avatar that reads as deliberate rather than missing —
// and therefore as something you can click.
function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0]![0]!
  const last = words.length > 1 ? words[words.length - 1]![0]! : ''
  return (first + last).toUpperCase()
}

const SIZES = {
  sm: { tile: 'h-7 w-7 rounded-md', text: 'text-[10px]', icon: 'h-3 w-3' },
  lg: { tile: 'h-20 w-20 rounded-lg', text: 'text-xl', icon: 'h-5 w-5' },
} as const

interface ContactPhotoTileProps {
  contactId: number
  name: string
  /** Current photo: `photoUrl || photoFile || null`. */
  photo: string | null
  /** Called with the saved photo (or null) so the caller can update its own copy. */
  onChange: (photo: string | null) => void
  size?: keyof typeof SIZES
  /**
   * Accept a page-level Ctrl+V even while the popover is closed. Only for a tile
   * that is the page's single photo target (the contact card header) — and the
   * caller should gate it on the contact having NO photo yet, so a stray paste can
   * never silently replace one.
   */
  pagePaste?: boolean
  className?: string
}

/**
 * The contact's avatar, doubling as an inline photo editor: drop an image straight
 * onto it, or click for browse / paste / URL. Saves immediately via
 * `PATCH /contacts/:id/photo` — the point is adding a photo from the contact card or
 * from a meeting's participant row WITHOUT opening the edit form.
 */
export function ContactPhotoTile({
  contactId,
  name,
  photo,
  onChange,
  size = 'sm',
  pagePaste = false,
  className,
}: ContactPhotoTileProps) {
  const [open, setOpen] = useState(false)
  const [urlMode, setUrlMode] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [saving, setSaving] = useState(false)
  const s = SIZES[size]

  async function save(next: string) {
    setSaving(true)
    try {
      const res = await api.patch<{ photoUrl: string | null; photoFile: string | null }>(
        `/contacts/${contactId}/photo`,
        { photo: next }
      )
      onChange(res.photoUrl || res.photoFile || null)
      toast.success(next ? `Photo added to ${name}` : `Photo removed from ${name}`)
      setOpen(false)
      setUrlMode(false)
      setUrlInput('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save photo')
    } finally {
      setSaving(false)
    }
  }

  // Paste is live while the popover is open (it's then the only such target), plus
  // page-wide when the caller opts in — see `pagePaste`.
  const { uploading, dragOver, dropzone, browse, fileInputProps } = useImageUpload({
    onUploaded: save,
    pasteEnabled: open || pagePaste,
  })
  const busy = uploading || saving

  function submitUrl() {
    const url = urlInput.trim()
    if (!url) return
    if (!url.startsWith('http')) {
      toast.error('URL must start with http')
      return
    }
    void save(url)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) {
          setUrlMode(false)
          setUrlInput('')
        }
      }}
    >
      <PopoverTrigger asChild>
        {/* The tile itself is a drop target, so dragging a photo in doesn't need the
            popover at all — one gesture, no dialogs. */}
        <button
          type="button"
          {...dropzone}
          title={photo ? `Change ${name}'s photo` : `Add a photo for ${name}`}
          aria-label={photo ? `Change ${name}'s photo` : `Add a photo for ${name}`}
          className={cn(
            'group relative shrink-0 overflow-hidden border bg-muted text-muted-foreground transition-colors',
            s.tile,
            dragOver && 'border-primary ring-2 ring-primary/40',
            !photo && 'border-dashed',
            className
          )}
        >
          {photo ? (
            <img src={photo} alt={name} className="h-full w-full object-cover" />
          ) : (
            <span className={cn('flex h-full w-full items-center justify-center font-medium', s.text)}>
              {initialsOf(name)}
            </span>
          )}
          {/* Hover/focus overlay — the camera is the affordance; on touch the tap
              just opens the popover. */}
          <span
            className={cn(
              'absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
              busy && 'opacity-100'
            )}
          >
            {busy ? <Loader2 className={cn(s.icon, 'animate-spin')} /> : <Camera className={s.icon} />}
          </span>
        </button>
      </PopoverTrigger>
      <input {...fileInputProps} />
      <PopoverContent className="w-72 space-y-2 p-3" align="start">
        <p className="text-sm font-medium">{photo ? `Change photo — ${name}` : `Add photo — ${name}`}</p>
        <div
          {...dropzone}
          onClick={browse}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed p-4 text-center transition-colors',
            dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          )}
        >
          {busy ? (
            <p className="text-sm text-muted-foreground">Uploading…</p>
          ) : (
            <>
              <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">
                Drag, drop, or press Ctrl+V — or click to browse
              </p>
            </>
          )}
        </div>
        {urlMode ? (
          <div className="flex gap-1">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/photo.jpg"
              className="h-8 text-sm"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), submitUrl())}
            />
            <Button type="button" size="sm" onClick={submitUrl} disabled={busy}>
              Set
            </Button>
          </div>
        ) : (
          <div className="flex gap-1">
            <Button type="button" variant="outline" size="sm" onClick={browse} disabled={busy}>
              <Upload className="mr-1 h-3 w-3" />
              Upload
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setUrlMode(true)} disabled={busy}>
              <LinkIcon className="mr-1 h-3 w-3" />
              URL
            </Button>
            {photo && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => void save('')}
                disabled={busy}
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Remove
              </Button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
