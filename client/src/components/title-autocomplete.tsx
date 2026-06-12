import { useState } from 'react'
import { Input } from '@/components/ui/input'

/**
 * Free-text input with a suggestion dropdown of previously used meeting titles
 * (the series key — D4). Keeping spellings consistent is what makes the series
 * view work, so picking an existing title is one click/tap.
 */
export function TitleAutocomplete({
  value,
  onChange,
  titles,
  placeholder = 'Meeting title (e.g. Weekly VP meeting)',
  autoFocus = false,
  id,
}: {
  value: string
  onChange: (value: string) => void
  titles: string[]
  placeholder?: string
  autoFocus?: boolean
  id?: string
}) {
  const [focused, setFocused] = useState(false)

  const query = value.trim().toLowerCase()
  const matches = titles
    .filter((t) => {
      const lower = t.toLowerCase()
      return lower !== query && (!query || lower.includes(query))
    })
    .slice(0, 8)

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        // Delay so a click on a suggestion lands before the list unmounts
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
      />
      {focused && matches.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover shadow-md">
          {matches.map((t) => (
            <button
              type="button"
              key={t}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
              onMouseDown={(e) => {
                e.preventDefault()
                onChange(t)
                setFocused(false)
              }}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
