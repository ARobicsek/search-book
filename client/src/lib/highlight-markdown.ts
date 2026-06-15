// A self-contained rehype plugin that wraps search-term matches in <mark> inside
// rendered markdown — so highlighting reaches the description body, not just the
// plain-text title/tags (HighlightedText handles those). No external deps: it walks
// the HAST tree manually and skips code/pre so code samples aren't mangled.

// Minimal HAST node shape (enough for our walk; react-markdown produces these).
interface HNode {
  type: string
  tagName?: string
  value?: string
  children?: HNode[]
  properties?: Record<string, unknown>
}

// Don't highlight inside these elements (code stays verbatim).
const SKIP_TAGS = new Set(['code', 'pre', 'script', 'style'])

const MARK_CLASS = ['rounded', 'bg-yellow-200', 'px-0.5', 'text-foreground']

// Split one text value into alternating text / <mark> nodes for the matched ranges
// (merged so overlapping terms don't double-wrap). Mirrors HighlightedText's logic.
function splitText(value: string, terms: string[], caseSensitive: boolean): HNode[] {
  const hay = caseSensitive ? value : value.toLowerCase()
  const ranges: [number, number][] = []
  for (const term of terms) {
    const needle = caseSensitive ? term : term.toLowerCase()
    if (!needle) continue
    let idx = hay.indexOf(needle)
    while (idx !== -1) {
      ranges.push([idx, idx + needle.length])
      idx = hay.indexOf(needle, idx + needle.length)
    }
  }
  if (ranges.length === 0) return [{ type: 'text', value }]

  ranges.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([r[0], r[1]])
  }

  const out: HNode[] = []
  let pos = 0
  for (const [start, end] of merged) {
    if (start > pos) out.push({ type: 'text', value: value.slice(pos, start) })
    out.push({
      type: 'element',
      tagName: 'mark',
      properties: { className: MARK_CLASS },
      children: [{ type: 'text', value: value.slice(start, end) }],
    })
    pos = end
  }
  if (pos < value.length) out.push({ type: 'text', value: value.slice(pos) })
  return out
}

function transform(nodes: HNode[], terms: string[], caseSensitive: boolean): HNode[] {
  const out: HNode[] = []
  for (const node of nodes) {
    if (node.type === 'text' && typeof node.value === 'string') {
      out.push(...splitText(node.value, terms, caseSensitive))
    } else {
      if (node.children && !SKIP_TAGS.has(node.tagName ?? '')) {
        node.children = transform(node.children, terms, caseSensitive)
      }
      out.push(node)
    }
  }
  return out
}

/** rehype plugin: wraps `terms` occurrences in <mark>. Returns a no-op when empty. */
export function highlightRehype(terms: string[], caseSensitive: boolean) {
  const active = terms.filter(Boolean)
  return () => (tree: HNode) => {
    if (active.length === 0 || !tree.children) return
    tree.children = transform(tree.children, active, caseSensitive)
  }
}
