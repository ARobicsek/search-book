import { useCallback, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Bold, Heading3, Italic, List, ListOrdered } from 'lucide-react'

// Markdown-aware textarea for fast meeting-note typing:
// - toolbar: H3 / bold / italic / bullets / numbered list
// - shortcuts: Ctrl+B, Ctrl+I, Ctrl+Shift+8 (bullets), Ctrl+Shift+7 (numbered),
//   Ctrl+Alt+1/2/3 (# / ## / ### on the current line) — Google-Docs-style
// - Enter continues a bullet/numbered list; Enter on an empty item ends it
// - pasting OR dragging in an image uploads it and inserts ![…](url) (rendered by ReactMarkdown)

interface MarkdownTextareaProps {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  className?: string
  autoFocus?: boolean
  onBlur?: () => void
}

const LIST_PREFIX = /^(\s*)(- |\* |(\d+)\. )(.*)$/

export function MarkdownTextarea({
  id,
  value,
  onChange,
  placeholder,
  rows = 4,
  className,
  autoFocus,
  onBlur,
}: MarkdownTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [uploading, setUploading] = useState(false)

  // Apply a new value and restore the cursor after React re-renders
  const apply = useCallback(
    (next: string, selStart: number, selEnd?: number) => {
      onChange(next)
      requestAnimationFrame(() => {
        const el = ref.current
        if (!el) return
        el.focus()
        el.setSelectionRange(selStart, selEnd ?? selStart)
      })
    },
    [onChange]
  )

  // Wrap the selection (or insert markers around the caret) with e.g. **…**
  const wrapSelection = useCallback(
    (marker: string) => {
      const el = ref.current
      if (!el) return
      const { selectionStart: start, selectionEnd: end } = el
      const selected = value.slice(start, end)
      const next = value.slice(0, start) + marker + selected + marker + value.slice(end)
      if (selected) {
        apply(next, start, end + marker.length * 2)
      } else {
        apply(next, start + marker.length)
      }
    },
    [value, apply]
  )

  // Toggle a prefix on every line in the selection (headings, list markers)
  const prefixLines = useCallback(
    (makePrefix: (index: number) => string, stripPattern: RegExp) => {
      const el = ref.current
      if (!el) return
      const { selectionStart: start, selectionEnd: end } = el
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      const lineEndIdx = value.indexOf('\n', end)
      const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx
      const block = value.slice(lineStart, lineEnd)
      const lines = block.split('\n')
      // Empty / whitespace-only selection: always ADD the prefix and park the
      // caret right after it, so formatting can be applied *before* typing
      // (otherwise an empty line reads as "already prefixed" and toggles to a no-op).
      if (!lines.some((l) => l.trim())) {
        const prefix = makePrefix(0)
        const next = value.slice(0, lineStart) + prefix + value.slice(lineEnd)
        apply(next, lineStart + prefix.length)
        return
      }
      const allPrefixed = lines.every((l) => stripPattern.test(l) || !l.trim())
      const nextLines = lines.map((l, i) => {
        if (allPrefixed) return l.replace(stripPattern, '')
        const stripped = l.replace(stripPattern, '')
        return l.trim() ? makePrefix(i) + stripped : l
      })
      const nextBlock = nextLines.join('\n')
      const next = value.slice(0, lineStart) + nextBlock + value.slice(lineEnd)
      apply(next, lineStart, lineStart + nextBlock.length)
    },
    [value, apply]
  )

  const insertHeading = useCallback(
    (level: number) => {
      const hashes = '#'.repeat(level) + ' '
      prefixLines(() => hashes, /^#{1,6} /)
    },
    [prefixLines]
  )

  const insertBullets = useCallback(() => {
    prefixLines(() => '- ', /^(\s*)(- |\* |\d+\. )/)
  }, [prefixLines])

  const insertNumbered = useCallback(() => {
    prefixLines((i) => `${i + 1}. `, /^(\s*)(- |\* |\d+\. )/)
  }, [prefixLines])

  // Enter inside a list item continues the list; Enter on an empty item ends it
  const handleEnter = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      const el = ref.current
      if (!el) return false
      const { selectionStart: start, selectionEnd: end } = el
      if (start !== end) return false
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      const line = value.slice(lineStart, start)
      const m = line.match(LIST_PREFIX)
      if (!m) return false
      e.preventDefault()
      const [, indent, marker, num, rest] = m
      if (!rest.trim()) {
        // Empty item: end the list by stripping the marker
        const next = value.slice(0, lineStart) + value.slice(start)
        apply(next, lineStart)
        return true
      }
      const nextMarker = num ? `${parseInt(num) + 1}. ` : marker
      const insert = '\n' + indent + nextMarker
      const next = value.slice(0, start) + insert + value.slice(start)
      apply(next, start + insert.length)
      return true
    },
    [value, apply]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
        handleEnter(e)
        return
      }
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      if (e.altKey && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault()
        insertHeading(Number(e.key))
        return
      }
      if (e.shiftKey && e.key === '8') {
        e.preventDefault()
        insertBullets()
        return
      }
      if (e.shiftKey && e.key === '7') {
        e.preventDefault()
        insertNumbered()
        return
      }
      if (!e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        wrapSelection('**')
        return
      }
      if (!e.shiftKey && !e.altKey && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        wrapSelection('*')
      }
    },
    [handleEnter, insertHeading, insertBullets, insertNumbered, wrapSelection]
  )

  // Upload one or more image files and insert their markdown at the caret.
  // Shared by paste and drag-and-drop. Builds the combined markdown first, then
  // inserts once, to avoid races when several files are dropped at the same time.
  const insertImages = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      const el = ref.current
      const pos = el ? el.selectionStart : value.length
      setUploading(true)
      try {
        const mds: string[] = []
        for (const file of files) {
          const result = await api.uploadFile(file)
          mds.push(`![screenshot](${result.path})`)
        }
        const md = mds.join('\n')
        const current = ref.current?.value ?? value
        const next = current.slice(0, pos) + md + current.slice(pos)
        apply(next, pos + md.length)
        toast.success(files.length > 1 ? `${files.length} images added` : 'Screenshot added')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Image upload failed')
      } finally {
        setUploading(false)
      }
    },
    [value, apply]
  )

  // Paste a screenshot → upload → insert markdown image at the caret
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'))
      const file = item?.getAsFile()
      if (!file) return
      e.preventDefault()
      void insertImages([file])
    },
    [insertImages]
  )

  // Drag an image file in from Explorer/Finder → upload → insert at the caret.
  // dragOver must preventDefault for the drop to fire at all.
  const handleDragOver = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
    if (Array.from(e.dataTransfer.items).some((i) => i.kind === 'file')) e.preventDefault()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLTextAreaElement>) => {
      const all = Array.from(e.dataTransfer.files)
      if (all.length === 0) return // plain text drag — let the textarea handle it
      const images = all.filter((f) => f.type.startsWith('image/'))
      e.preventDefault()
      if (images.length === 0) {
        toast.message('Only images embed in notes — use “Actions, prep, tags & attachments” for other files')
        return
      }
      void insertImages(images)
    },
    [insertImages]
  )

  const tools: { icon: React.ReactNode; title: string; onClick: () => void }[] = [
    { icon: <Heading3 className="h-3.5 w-3.5" />, title: 'Heading (Ctrl+Alt+3)', onClick: () => insertHeading(3) },
    { icon: <Bold className="h-3.5 w-3.5" />, title: 'Bold (Ctrl+B)', onClick: () => wrapSelection('**') },
    { icon: <Italic className="h-3.5 w-3.5" />, title: 'Italic (Ctrl+I)', onClick: () => wrapSelection('*') },
    { icon: <List className="h-3.5 w-3.5" />, title: 'Bullet list (Ctrl+Shift+8)', onClick: insertBullets },
    { icon: <ListOrdered className="h-3.5 w-3.5" />, title: 'Numbered list (Ctrl+Shift+7)', onClick: insertNumbered },
  ]

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-0.5">
        {tools.map((t) => (
          <button
            key={t.title}
            type="button"
            title={t.title}
            tabIndex={-1}
            // onMouseDown+preventDefault keeps focus (and the selection) in the textarea
            onMouseDown={(e) => {
              e.preventDefault()
              t.onClick()
            }}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {t.icon}
          </button>
        ))}
        {uploading && <span className="ml-2 text-xs text-muted-foreground">Uploading image…</span>}
      </div>
      <Textarea
        ref={ref}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={rows}
        className={className}
        autoFocus={autoFocus}
      />
    </div>
  )
}
