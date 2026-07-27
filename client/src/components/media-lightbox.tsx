import { useEffect, useState } from 'react'
import { Download, Paperclip, Share2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

// A single app-wide viewer overlay, mounted once at the app root. It listens on the
// capture phase and handles three cases, all with no per-site wiring:
//
//  1. Any <img> inside a .prep-note-markdown container — pasted screenshots render
//     small (capped by .prep-note-markdown img in index.css) and their text is often
//     unreadable, so clicking one opens it full-screen with a toggle to view it at
//     actual size (scrollable) so fine print is legible. Covers every note render
//     site (meeting notes, next steps, prep notes, contact notes, mention snippets).
//  2. An image attachment link (`data-attachment-view` + `data-attachment-kind="image"`).
//  3. A NON-image attachment link (PDF/deck/doc), which renders an inline preview
//     plus explicit Save/Close actions.
//
// Why 2 and 3 exist: attachments are served from a RELATIVE /files/<name> path, so
// opening one is a same-origin navigation. An installed iOS PWA has no browser
// chrome, no tab bar and no back button, so that navigation replaces the app with
// the file and the only escape is to force-quit. `target="_blank"` doesn't help
// (standalone has no second tab to open into) and neither does the `download`
// attribute (iOS ignores it here — tried it, still trapped). The only rule that
// holds is NEVER NAVIGATE: show the file in an overlay the app owns, so closing it
// always returns the user exactly where they were.
//
// Escape is deliberately over-provisioned, because a PWA has no Esc key and no
// browser back button: the X, a tap on the backdrop, a Close button AND Esc all work.

type Viewing =
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'file'; src: string; name: string }

// TS's DOM lib declares canShare/share as always present, so a truthiness check is
// a compile error — but older Safari really does lack them, so the runtime guard is
// still needed. `typeof` gets both.
const CAN_SHARE_FILES =
  typeof navigator !== 'undefined' &&
  typeof navigator.canShare === 'function' &&
  typeof navigator.share === 'function'

// Hand the file to the OS instead of navigating to it. Web Share (Level 2) is the
// reliable route on iOS — it opens the native sheet (Save to Files, open in another
// app) without leaving the PWA. Falls back to a blob-URL <a download>, which is what
// desktop browsers want anyway.
async function saveFile(src: string, name: string) {
  try {
    const res = await fetch(src)
    if (!res.ok) throw new Error(String(res.status))
    const blob = await res.blob()
    const file = new File([blob], name, { type: blob.type || 'application/octet-stream' })
    if (CAN_SHARE_FILES && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name })
      return
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  } catch (err) {
    // A cancelled share sheet rejects with AbortError — that's not a failure.
    if (err instanceof DOMException && err.name === 'AbortError') return
    toast.error('Could not save the file')
  }
}

export function MediaLightbox() {
  const [viewing, setViewing] = useState<Viewing | null>(null)
  const [actualSize, setActualSize] = useState(false)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // Let modified clicks (open-in-new-tab etc.) through untouched.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (!target) return

      // Attachment links first: the anchor may WRAP the <img> (thumbnail chips), so
      // the event target can be either the anchor or the image inside it.
      const link = target.closest('a[data-attachment-view]') as HTMLAnchorElement | null
      if (link) {
        const name = link.getAttribute('data-attachment-view') || link.title || 'attachment'
        e.preventDefault()
        e.stopPropagation()
        setActualSize(false)
        setViewing(
          link.getAttribute('data-attachment-kind') === 'image'
            ? { kind: 'image', src: link.href, alt: name }
            : { kind: 'file', src: link.href, name }
        )
        return
      }

      if (target.tagName !== 'IMG') return
      if (!target.closest('.prep-note-markdown')) return
      const img = target as HTMLImageElement
      e.preventDefault()
      e.stopPropagation()
      setActualSize(false)
      setViewing({ kind: 'image', src: img.currentSrc || img.src, alt: img.alt || '' })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  useEffect(() => {
    if (!viewing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewing(null)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [viewing])

  if (!viewing) return null

  return (
    <div
      // pointer-events-auto: a Radix modal Dialog sets `pointer-events: none` on
      // <body> while open, and this overlay renders OUTSIDE that dialog (at the app
      // root), so it would inherit the block and refuse clicks — leaving Esc as the
      // only way out. Attachments are opened from inside dialogs (Quick Log, meeting
      // detail) and a PWA has no Esc key, so it must opt back in.
      className="pointer-events-auto fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/85 p-4"
      onClick={() => setViewing(null)}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute right-3 top-3 flex items-center gap-2">
        {viewing.kind === 'image' && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setActualSize((a) => !a) }}
            className="rounded-md bg-white/10 p-2 text-white hover:bg-white/20"
            title={actualSize ? 'Fit to screen' : 'Actual size'}
          >
            {actualSize ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setViewing(null) }}
          className="rounded-md bg-white/10 p-2 text-white hover:bg-white/20"
          title="Close (Esc)"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {viewing.kind === 'image' ? (
        <>
          <div className="max-h-full max-w-full overflow-auto" onClick={(e) => e.stopPropagation()}>
            <img
              src={viewing.src}
              alt={viewing.alt}
              onClick={() => setActualSize((a) => !a)}
              className={
                actualSize
                  ? 'max-w-none cursor-zoom-out rounded-md'
                  : 'max-h-[88vh] max-w-[92vw] cursor-zoom-in rounded-md object-contain'
              }
            />
          </div>
          <p className="pointer-events-none mt-3 text-xs text-white/60">
            Click image to {actualSize ? 'fit to screen' : 'zoom to actual size'} · Esc to close
          </p>
        </>
      ) : (
        <div
          className="flex max-h-full w-full max-w-3xl flex-col gap-3 rounded-lg bg-background p-4 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 pr-16 text-sm font-medium">
            <Paperclip className="h-4 w-4 shrink-0" />
            <span className="truncate">{viewing.name}</span>
          </div>
          {/* The /files/ prefix is on the SW's navigateFallbackDenylist, so this
              iframe load — itself a 'navigate'-mode request — reaches the media
              proxy instead of being answered with the app shell. */}
          <iframe
            src={viewing.src}
            title={viewing.name}
            className="h-[65vh] w-full rounded-md border bg-white"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => saveFile(viewing.src, viewing.name)}>
              {CAN_SHARE_FILES
                ? <Share2 className="mr-1 h-4 w-4" />
                : <Download className="mr-1 h-4 w-4" />}
              Save
            </Button>
            <Button type="button" variant="outline" onClick={() => setViewing(null)}>
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
