import { useEffect, useState } from 'react'
import { X, ZoomIn, ZoomOut } from 'lucide-react'

// A single app-wide lightbox for images embedded in notes. Pasted screenshots
// render small (capped by .prep-note-markdown img in index.css) and their text
// is often unreadable; clicking one opens it here full-screen, with a toggle to
// view it at actual size (scrollable) so fine print is legible.
//
// Mounted once at the app root. It listens (capture phase) for clicks on any
// <img> inside a .prep-note-markdown container — so every note render site
// (meeting notes, next steps, prep notes, contact notes, mention snippets) gets
// zoom for free, with no per-site wiring — and stops the click before any
// parent handler (e.g. click-to-edit) sees it.
export function NoteImageLightbox() {
  const [image, setImage] = useState<{ src: string; alt: string } | null>(null)
  const [actualSize, setActualSize] = useState(false)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (!target || target.tagName !== 'IMG') return
      if (!target.closest('.prep-note-markdown')) return
      const img = target as HTMLImageElement
      e.preventDefault()
      e.stopPropagation()
      setActualSize(false)
      setImage({ src: img.currentSrc || img.src, alt: img.alt || '' })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  useEffect(() => {
    if (!image) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImage(null)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [image])

  if (!image) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/85 p-4"
      onClick={() => setImage(null)}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute right-3 top-3 flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setActualSize((a) => !a) }}
          className="rounded-md bg-white/10 p-2 text-white hover:bg-white/20"
          title={actualSize ? 'Fit to screen' : 'Actual size'}
        >
          {actualSize ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setImage(null) }}
          className="rounded-md bg-white/10 p-2 text-white hover:bg-white/20"
          title="Close (Esc)"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="max-h-full max-w-full overflow-auto" onClick={(e) => e.stopPropagation()}>
        <img
          src={image.src}
          alt={image.alt}
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
    </div>
  )
}
