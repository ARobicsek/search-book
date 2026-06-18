import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Bold, Building2, Heading3, Italic, List, ListOrdered, UserPlus } from 'lucide-react'
import {
  detectMentionQuery,
  looseMentionToken,
  resolvedMentionToken,
  looseOrgMentionToken,
  resolvedOrgMentionToken,
} from '@/lib/mentions'

// Markdown-aware textarea for fast meeting-note typing:
// - toolbar: H3 / bold / italic / bullets / numbered list
// - shortcuts: Ctrl+B, Ctrl+I, Ctrl+Shift+8 (bullets), Ctrl+Shift+7 (numbered),
//   Ctrl+Alt+1/2/3 (# / ## / ### on the current line) — Google-Docs-style
// - Enter continues a bullet/numbered list; Enter on an empty item ends it
// - pasting OR dragging in an image uploads it and inserts ![…](url) (rendered by ReactMarkdown)
// - optional @-mentions: type "@" to flag a person inline (existing contact or a
//   "loose" name not yet in the CRM); reviewable later on the Mentions page

interface MentionContact {
  id: number
  name: string
  title?: string | null
}

interface MentionCompany {
  id: number
  name: string
}

interface MarkdownTextareaProps {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  className?: string
  autoFocus?: boolean
  onBlur?: () => void
  // When either list is provided, typing "@" opens a picker. People and
  // organizations are offered together, distinguished by icon.
  mentionContacts?: MentionContact[]
  mentionCompanies?: MentionCompany[]
}

// One row in the @ picker. `kind` selects the token written on insert.
type MentionItem = {
  kind: 'contact' | 'company' | 'loose-person' | 'loose-org'
  name: string
  id?: number
  title?: string | null
}

const LIST_PREFIX = /^(\s*)(- |\* |(\d+)\. )(.*)$/

// CSS properties copied into the mirror div used to locate the caret pixel
// position for anchoring the @-mention dropdown.
const MIRROR_PROPS = [
  'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontFamily',
  'lineHeight', 'letterSpacing', 'textTransform', 'wordSpacing', 'textIndent', 'tabSize',
] as const

// Pixel position of the caret within a textarea (mirror-div technique), relative
// to the textarea's box, with the current scroll applied.
function getCaretCoordinates(el: HTMLTextAreaElement, position: number) {
  const div = document.createElement('div')
  const computed = getComputedStyle(el)
  const style = div.style
  style.position = 'absolute'
  style.visibility = 'hidden'
  style.whiteSpace = 'pre-wrap'
  style.wordWrap = 'break-word'
  style.overflow = 'hidden'
  for (const prop of MIRROR_PROPS) {
    style[prop as any] = computed[prop as any]
  }
  div.textContent = el.value.slice(0, position)
  const span = document.createElement('span')
  span.textContent = el.value.slice(position) || '.'
  div.appendChild(span)
  document.body.appendChild(div)
  const top = span.offsetTop - el.scrollTop
  const left = span.offsetLeft - el.scrollLeft
  const height = parseInt(computed.lineHeight) || parseInt(computed.fontSize) || 16
  document.body.removeChild(div)
  return { top, left, height }
}

type MentionState = {
  start: number       // index of the triggering "@"
  query: string
  top: number
  left: number
}

export function MarkdownTextarea({
  id,
  value,
  onChange,
  placeholder,
  rows = 4,
  className,
  autoFocus,
  onBlur,
  mentionContacts,
  mentionCompanies,
}: MarkdownTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [uploading, setUploading] = useState(false)

  // ── @-mention autocomplete state ──
  const [mention, setMention] = useState<MentionState | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const mentionsEnabled = !!(mentionContacts || mentionCompanies)

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

  // Recompute the active mention from the live caret position.
  const refreshMention = useCallback(() => {
    if (!mentionsEnabled) return
    const el = ref.current
    if (!el) { setMention(null); return }
    const caret = el.selectionStart
    const found = detectMentionQuery(el.value, caret)
    if (!found) { setMention(null); return }
    const { top, left, height } = getCaretCoordinates(el, found.start)
    setMention({ start: found.start, query: found.query, top: top + height, left })
    setMentionIndex(0)
  }, [mentionsEnabled])

  // The suggestion list for the current query: matching people, then matching
  // organizations, then "loose" options to flag a name/org not in the CRM yet.
  const mentionItems = (() => {
    if (!mention) return [] as MentionItem[]
    const raw = mention.query.trim()
    const q = raw.toLowerCase()
    const contacts = (q
      ? (mentionContacts ?? []).filter((c) => c.name.toLowerCase().includes(q))
      : (mentionContacts ?? [])
    ).slice(0, 5).map((c): MentionItem => ({ kind: 'contact', name: c.name, id: c.id, title: c.title }))
    const companies = (q
      ? (mentionCompanies ?? []).filter((c) => c.name.toLowerCase().includes(q))
      : (mentionCompanies ?? [])
    ).slice(0, 3).map((c): MentionItem => ({ kind: 'company', name: c.name, id: c.id }))
    const items: MentionItem[] = [...contacts, ...companies]
    if (q) {
      const exactContact = (mentionContacts ?? []).some((c) => c.name.toLowerCase() === q)
      const exactCompany = (mentionCompanies ?? []).some((c) => c.name.toLowerCase() === q)
      if (mentionContacts && !exactContact) items.push({ kind: 'loose-person', name: raw })
      if (mentionCompanies && !exactCompany) items.push({ kind: 'loose-org', name: raw })
    }
    return items
  })()

  // Insert the chosen mention token in place of the "@query" the user typed.
  const insertMention = useCallback(
    (item: MentionItem) => {
      const el = ref.current
      if (!el || !mention) return
      const caret = el.selectionStart
      const token =
        item.kind === 'contact' && item.id
          ? resolvedMentionToken(item.name, item.id)
          : item.kind === 'company' && item.id
            ? resolvedOrgMentionToken(item.name, item.id)
            : item.kind === 'loose-org'
              ? looseOrgMentionToken(item.name)
              : looseMentionToken(item.name)
      const insert = token + ' '
      const next = value.slice(0, mention.start) + insert + value.slice(caret)
      setMention(null)
      apply(next, mention.start + insert.length)
    },
    [mention, value, apply]
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
      // While the @-mention dropdown is open, it owns the arrows / Enter / Tab / Esc.
      if (mention && mentionItems.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setMentionIndex((i) => (i + 1) % mentionItems.length)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setMentionIndex((i) => (i - 1 + mentionItems.length) % mentionItems.length)
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          insertMention(mentionItems[mentionIndex])
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setMention(null)
          return
        }
      }

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
    [mention, mentionItems, mentionIndex, insertMention, handleEnter, insertHeading, insertBullets, insertNumbered, wrapSelection]
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

  // Keep the mention dropdown in sync as the caret moves (clicks / arrows).
  useEffect(() => {
    if (!mention) return
    const el = ref.current
    if (!el) return
    const onSel = () => refreshMention()
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [mention, refreshMention])

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
      <div className="relative">
        <Textarea
          ref={ref}
          id={id}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            if (mentionsEnabled) requestAnimationFrame(refreshMention)
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onBlur={() => { setTimeout(() => setMention(null), 150); onBlur?.() }}
          placeholder={placeholder}
          rows={rows}
          className={className}
          autoFocus={autoFocus}
        />
        {mention && mentionItems.length > 0 && (
          <ul
            className="absolute z-50 max-h-56 w-72 overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md"
            style={{ top: mention.top, left: Math.min(mention.left, 220) }}
          >
            {mentionItems.map((item, i) => (
              <li key={`${item.kind}-${item.id ?? item.name}`}>
                <button
                  type="button"
                  // onMouseDown (not onClick) so it fires before the textarea blur closes the list
                  onMouseDown={(e) => { e.preventDefault(); insertMention(item) }}
                  onMouseEnter={() => setMentionIndex(i)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left ${i === mentionIndex ? 'bg-accent text-accent-foreground' : ''}`}
                >
                  {item.kind === 'loose-person' ? (
                    <>
                      <UserPlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span>Mention “{item.name}” <span className="text-muted-foreground">— new person</span></span>
                    </>
                  ) : item.kind === 'loose-org' ? (
                    <>
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span>Mention “{item.name}” <span className="text-muted-foreground">— new organization</span></span>
                    </>
                  ) : item.kind === 'company' ? (
                    <>
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{item.name}</div>
                        <div className="truncate text-xs text-muted-foreground">Organization</div>
                      </div>
                    </>
                  ) : (
                    <div className="min-w-0">
                      <div className="truncate font-medium">{item.name}</div>
                      {item.title && <div className="truncate text-xs text-muted-foreground">{item.title}</div>}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
