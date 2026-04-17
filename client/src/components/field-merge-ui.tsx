import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'

export type FieldSelection = 1 | 2 | 'both'

export type FieldMergeItem = {
  key: string
  label: string
  val1: string
  val2: string
  allowBoth: boolean
}

export interface FieldMergeUIProps {
  fields: FieldMergeItem[]
  selections: Record<string, FieldSelection>
  onChange: (key: string, selection: FieldSelection) => void
  disabled?: boolean
}

export function FieldMergeUI({ fields, selections, onChange, disabled }: FieldMergeUIProps) {
  return (
    <div className="space-y-4">
      {fields.map(({ key, label, val1, val2, allowBoth }) => {
        const bothEmpty = val1 === '(empty)' && val2 === '(empty)'
        const sameValue = val1 === val2
        const showKeepBoth = allowBoth && !sameValue && val1 !== '(empty)' && val2 !== '(empty)'

        if (bothEmpty) return null

        return (
          <div key={key} className="space-y-2">
            <Label className="text-sm font-medium">{label}</Label>
            {sameValue ? (
              <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-2">
                {val1}
              </div>
            ) : (
              <RadioGroup
                value={String(selections[key])}
                onValueChange={(v) => onChange(key, v === 'both' ? 'both' : (parseInt(v) as FieldSelection))}
                className={cn("grid gap-2", showKeepBoth ? "grid-cols-3" : "grid-cols-2")}
                disabled={disabled}
              >
                <Label
                  htmlFor={`${key}-1`}
                  className={cn(
                    "flex items-start gap-2 rounded-md border p-3 cursor-pointer transition-colors",
                    selections[key] === 1
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-muted-foreground/50",
                    disabled && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <RadioGroupItem value="1" id={`${key}-1`} className="mt-0.5" />
                  <span className="text-sm break-words whitespace-pre-wrap">{val1}</span>
                </Label>
                <Label
                  htmlFor={`${key}-2`}
                  className={cn(
                    "flex items-start gap-2 rounded-md border p-3 cursor-pointer transition-colors",
                    selections[key] === 2
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-muted-foreground/50",
                    disabled && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <RadioGroupItem value="2" id={`${key}-2`} className="mt-0.5" />
                  <span className="text-sm break-words whitespace-pre-wrap">{val2}</span>
                </Label>
                {showKeepBoth && (
                  <Label
                    htmlFor={`${key}-both`}
                    className={cn(
                      "flex items-start gap-2 rounded-md border p-3 cursor-pointer transition-colors",
                      selections[key] === 'both'
                        ? "border-primary bg-primary/5"
                        : "border-muted hover:border-muted-foreground/50",
                      disabled && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <RadioGroupItem value="both" id={`${key}-both`} className="mt-0.5" />
                    <span className="text-sm break-words font-medium">Keep Both</span>
                  </Label>
                )}
              </RadioGroup>
            )}
          </div>
        )
      })}
    </div>
  )
}
