// Client-side helpers for @-mentions in meeting notes. The token format must
// match the server parser (server/src/lib/mentions.ts):
//   [@Display Name](/contacts/123)  → resolved mention (bound to a contact)
//   [@Display Name](#mention)       → loose mention (a name not yet a contact)

export function looseMentionToken(name: string): string {
  return `[@${name}](#mention)`
}

export function resolvedMentionToken(name: string, contactId: number): string {
  return `[@${name}](/contacts/${contactId})`
}

// Matches any @-mention token. Group 1 = display name, group 3 = contactId (when
// bound to a contact). Mirrors MENTION_RE in server/src/lib/mentions.ts.
const MENTION_RE = /\[@([^\]\n]+)\]\((\/contacts\/(\d+)|#mention)\)/g

// Identifies the @-mention a snippet should be centered on: a bound contact
// (by id) or a loose name (case-insensitive).
export type MentionMatcher = { contactId?: number | null; name?: string }

function matches(matcher: MentionMatcher, tokenContactId: number | null, tokenName: string): boolean {
  if (matcher.contactId != null) return tokenContactId === matcher.contactId
  if (matcher.name != null) {
    return tokenContactId == null && tokenName.toLowerCase() === matcher.name.trim().toLowerCase()
  }
  return false
}

// Markdown link/image tokens (incl. mention tokens, whose display text can hold
// spaces) — protected so a snippet window never cuts through the middle of one.
const LINK_OR_IMAGE_RE = /!?\[[^\]\n]*\]\([^)\n]*\)/g

function protectedRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  LINK_OR_IMAGE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = LINK_OR_IMAGE_RE.exec(text)) !== null) ranges.push([m.index, m.index + m[0].length])
  return ranges
}

function rangeAt(idx: number, ranges: Array<[number, number]>): [number, number] | null {
  for (const r of ranges) if (idx > r[0] && idx < r[1]) return r
  return null
}

// Snap a left/right window edge to a clean boundary: never inside a token, and
// at a whitespace boundary so we don't show a half word.
function cleanLeft(text: string, idx: number, ranges: Array<[number, number]>): number {
  const r = rangeAt(idx, ranges)
  if (r) idx = r[0]
  while (idx > 0 && !/\s/.test(text[idx - 1]) && !rangeAt(idx - 1, ranges)) idx--
  return idx
}

function cleanRight(text: string, idx: number, ranges: Array<[number, number]>): number {
  const r = rangeAt(idx, ranges)
  if (r) idx = r[1]
  while (idx < text.length && !/\s/.test(text[idx]) && !rangeAt(idx, ranges)) idx++
  return idx
}

// Extract the slice of `text` surrounding the first @-mention matching `matcher`,
// roughly ±`radius` characters, snapped to word/token boundaries with ellipses.
// The mention token itself is preserved so it still renders as a chip. Returns
// null when the text holds no matching mention.
export function mentionSnippet(
  text: string | null | undefined,
  matcher: MentionMatcher,
  radius = 140,
): string | null {
  if (!text) return null
  MENTION_RE.lastIndex = 0
  let m: RegExpExecArray | null
  let hit: { start: number; end: number } | null = null
  while ((m = MENTION_RE.exec(text)) !== null) {
    const tokenContactId = m[3] ? Number(m[3]) : null
    if (matches(matcher, tokenContactId, m[1].trim())) {
      hit = { start: m.index, end: m.index + m[0].length }
      break
    }
  }
  if (!hit) return null

  const ranges = protectedRanges(text)
  const start = cleanLeft(text, Math.max(0, hit.start - radius), ranges)
  const end = cleanRight(text, Math.min(text.length, hit.end + radius), ranges)
  let snippet = text.slice(start, end).trim()
  if (start > 0) snippet = '… ' + snippet
  if (end < text.length) snippet = snippet + ' …'
  return snippet
}

// Characters allowed inside the in-progress "@query" (names: letters incl.
// accents, digits, spaces, and . ' -). Anything else ends the mention.
const QUERY_CHAR = /[\p{L}\p{N} .'’-]/u

// Detect an active @-mention being typed at `caret`. Returns the query text and
// the index of the triggering "@", or null when the caret isn't in a mention.
// Triggers only when "@" starts a word (preceded by start-of-text or whitespace),
// so emails like "ari@gmail" don't fire.
export function detectMentionQuery(
  value: string,
  caret: number,
): { query: string; start: number } | null {
  let i = caret - 1
  while (i >= 0) {
    const ch = value[i]
    if (ch === '@') {
      const prev = i > 0 ? value[i - 1] : ''
      if (prev === '' || /\s/.test(prev)) {
        const query = value.slice(i + 1, caret)
        if (query.length > 60) return null
        return { query, start: i }
      }
      return null
    }
    if (ch === '\n' || !QUERY_CHAR.test(ch)) return null
    i--
  }
  return null
}
