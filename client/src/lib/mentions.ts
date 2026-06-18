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
