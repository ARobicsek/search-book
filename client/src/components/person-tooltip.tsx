import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// Hover card for a person chip in meeting views: shows how to say/call them
// (preferredName — "Ben", "Viv-ACHE"), their job title, and current employer (plus
// an optional name header and per-meeting takeaway note). Used on meeting cards and
// in the meeting editor's participant rows / combobox pills. The pronunciation takes
// the header slot when present (the full name is already on the hovered chip, so it's
// not repeated). Renders the child unchanged when there's nothing to show, so callers
// can wrap unconditionally.
export function PersonTooltip({
  name,
  pronunciation,
  title,
  employer,
  note,
  children,
}: {
  name?: string | null
  pronunciation?: string | null
  title?: string | null
  employer?: string | null
  note?: string | null
  children: React.ReactNode
}) {
  const roleLine = [title, employer].filter(Boolean).join(' · ')
  const spoken = pronunciation?.trim()
  if (!name && !spoken && !roleLine && !note) return <>{children}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-xs space-y-0.5">
        {spoken
          ? <div className="font-semibold">🗣 {spoken}</div>
          : name && <div className="font-semibold">{name}</div>}
        {roleLine && <div className="text-background/90">{roleLine}</div>}
        {note && (
          <div className="mt-0.5 whitespace-pre-line border-t border-background/20 pt-0.5 text-background/80">
            {note}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
