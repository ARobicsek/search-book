import React from 'react'

/** Render text with every term occurrence wrapped in <mark>. */
export function HighlightedText({
  text,
  terms,
  caseSensitive,
}: {
  text: string
  terms: string[]
  caseSensitive: boolean
}) {
  const ranges: [number, number][] = []
  const hay = caseSensitive ? text : text.toLowerCase()
  for (const term of terms) {
    const needle = caseSensitive ? term : term.toLowerCase()
    if (!needle) continue
    let idx = hay.indexOf(needle)
    while (idx !== -1) {
      ranges.push([idx, idx + needle.length])
      idx = hay.indexOf(needle, idx + needle.length)
    }
  }
  if (ranges.length === 0) return <>{text}</>

  ranges.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([r[0], r[1]])
  }

  const parts: React.ReactNode[] = []
  let pos = 0
  merged.forEach(([start, end], i) => {
    if (start > pos) parts.push(text.slice(pos, start))
    parts.push(
      <mark key={i} className="rounded bg-yellow-200 px-0.5 text-foreground">
        {text.slice(start, end)}
      </mark>
    )
    pos = end
  })
  if (pos < text.length) parts.push(text.slice(pos))
  return <>{parts}</>
}
