// Client-side helpers for @-mentions in meeting notes. The token format must
// match the server parser (server/src/lib/mentions.ts):
//   [@Display Name](/contacts/123)  → resolved person mention (bound to a contact)
//   [@Org Name](/companies/45)      → resolved org mention (bound to a company)
//   [@Display Name](#mention)       → loose person mention (a name not yet a contact)
//   [@Org Name](#org-mention)       → loose org mention (an org not yet a company)

export function looseMentionToken(name: string): string {
  return `[@${name}](#mention)`
}

export function resolvedMentionToken(name: string, contactId: number): string {
  return `[@${name}](/contacts/${contactId})`
}

export function looseOrgMentionToken(name: string): string {
  return `[@${name}](#org-mention)`
}

export function resolvedOrgMentionToken(name: string, companyId: number): string {
  return `[@${name}](/companies/${companyId})`
}

// Matches any @-mention token. Group 1 = display name, group 2 = href, group 3 =
// contactId, group 4 = companyId. Mirrors MENTION_RE in server/src/lib/mentions.ts.
const MENTION_RE = /\[@([^\]\n]+)\]\((\/contacts\/(\d+)|\/companies\/(\d+)|#mention|#org-mention)\)/g

// Identifies the @-mention a snippet should be centered on: a bound contact or
// company (by id), or a loose name (case-insensitive, optionally constrained to
// a kind so a loose person and loose org of the same name don't collide).
export type MentionMatcher = {
  contactId?: number | null
  companyId?: number | null
  name?: string
  kind?: 'CONTACT' | 'COMPANY'
}

type TokenRef = { name: string; contactId: number | null; companyId: number | null; kind: 'CONTACT' | 'COMPANY' }

function tokenRef(m: RegExpExecArray): TokenRef {
  const contactId = m[3] ? Number(m[3]) : null
  const companyId = m[4] ? Number(m[4]) : null
  const kind = companyId != null || m[2] === '#org-mention' ? 'COMPANY' : 'CONTACT'
  return { name: m[1].trim(), contactId, companyId, kind }
}

function matches(matcher: MentionMatcher, tok: TokenRef): boolean {
  if (matcher.contactId != null) return tok.contactId === matcher.contactId
  if (matcher.companyId != null) return tok.companyId === matcher.companyId
  if (matcher.name != null) {
    return (
      tok.contactId == null &&
      tok.companyId == null &&
      (matcher.kind == null || tok.kind === matcher.kind) &&
      tok.name.toLowerCase() === matcher.name.trim().toLowerCase()
    )
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
    if (matches(matcher, tokenRef(m))) {
      hit = { start: m.index, end: m.index + m[0].length }
      break
    }
  }
  if (!hit) return null

  const ranges = protectedRanges(text)
  const window = cleanWindow(text, hit, radius, ranges)
  return sliceWindow(text, window)
}

// Expand a mention hit to a ±radius window, snapped to clean boundaries.
function cleanWindow(
  text: string,
  hit: { start: number; end: number },
  radius: number,
  ranges: Array<[number, number]>,
): [number, number] {
  return [
    cleanLeft(text, Math.max(0, hit.start - radius), ranges),
    cleanRight(text, Math.min(text.length, hit.end + radius), ranges),
  ]
}

function sliceWindow(text: string, [start, end]: [number, number]): string {
  let snippet = text.slice(start, end).trim()
  if (start > 0) snippet = '… ' + snippet
  if (end < text.length) snippet = snippet + ' …'
  return snippet
}

// Snippets covering EVERY matching mention in `text`, with overlapping windows
// merged so clustered mentions (e.g. several names in one sentence) collapse into
// one block instead of N near-duplicates. Used by the Mentions review list.
export function mentionSnippets(
  text: string | null | undefined,
  matchers: MentionMatcher[],
  radius = 140,
): string[] {
  if (!text) return []
  const ranges = protectedRanges(text)
  const windows: Array<[number, number]> = []
  for (const matcher of matchers) {
    MENTION_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = MENTION_RE.exec(text)) !== null) {
      if (matches(matcher, tokenRef(m))) {
        windows.push(cleanWindow(text, { start: m.index, end: m.index + m[0].length }, radius, ranges))
      }
    }
  }
  if (windows.length === 0) return []
  // Merge overlapping / touching windows.
  windows.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = [windows[0]]
  for (let i = 1; i < windows.length; i++) {
    const last = merged[merged.length - 1]
    if (windows[i][0] <= last[1]) last[1] = Math.max(last[1], windows[i][1])
    else merged.push(windows[i])
  }
  return merged.map((w) => sliceWindow(text, w))
}

// The note context around a meeting's @-mentions: every snippet in its notes, next
// steps and prep notes that surrounds one of `mentions`, de-duplicated. The Mentions
// review page and the search page's "@-Mentions" group both show exactly this — a
// mention only means something with the sentence it was written in.
export function meetingMentionSnippets(meeting: {
  notes: string | null
  nextSteps: string | null
  prepNotes: { content: string }[]
  mentions: { kind: 'CONTACT' | 'COMPANY'; mentionedName: string; contactId: number | null; companyId: number | null }[]
}): string[] {
  const matchers: MentionMatcher[] = meeting.mentions.map((m) =>
    m.contactId != null
      ? { contactId: m.contactId }
      : m.companyId != null
        ? { companyId: m.companyId }
        : { name: m.mentionedName, kind: m.kind },
  )
  const out: string[] = []
  const seen = new Set<string>()
  for (const text of [meeting.notes, meeting.nextSteps, ...meeting.prepNotes.map((p) => p.content)]) {
    for (const snippet of mentionSnippets(text, matchers)) {
      if (!seen.has(snippet)) {
        seen.add(snippet)
        out.push(snippet)
      }
    }
  }
  return out
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
