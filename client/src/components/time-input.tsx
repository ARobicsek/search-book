import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatActionTime, parseTimeInput } from '@/lib/action-time'

interface TimeInputProps {
  // Canonical "HH:MM" 24h value, or '' for no time.
  value: string
  // Called with a canonical "HH:MM" value, or '' to clear. Only fires on a
  // successful parse that changes the value.
  onChange: (value: string) => void
  disabled?: boolean
  id?: string
  className?: string
  placeholder?: string
}

// A forgiving free-text time field (replaces the native <input type="time">,
// whose segmented picker rejects partial entries like "9a"). The user types
// loose input — "9", "9a", "2:30p", "1400" — and on blur/Enter we parse it into
// a canonical "HH:MM", displaying it back in a friendly "9:00 AM" form.
export function TimeInput({ value, onChange, disabled, id, className, placeholder }: TimeInputProps) {
  const [text, setText] = useState(() => formatActionTime(value))
  const [editing, setEditing] = useState(false)
  const [invalid, setInvalid] = useState(false)

  // Keep the display in sync with the canonical value while not actively editing
  // (the value can change from outside, e.g. after a save refetch).
  useEffect(() => {
    if (!editing) setText(formatActionTime(value))
  }, [value, editing])

  function commit() {
    setEditing(false)
    const parsed = parseTimeInput(text)
    if (parsed === null) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setText(formatActionTime(parsed))
    if (parsed !== value) onChange(parsed)
  }

  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder ?? 'e.g. 9a or 2:30 PM'}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      className={cn(invalid && 'border-destructive focus-visible:ring-destructive', className)}
      value={text}
      onFocus={() => setEditing(true)}
      onChange={(e) => {
        setText(e.target.value)
        if (invalid) setInvalid(false)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}
