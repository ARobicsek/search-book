import { useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Loader2, Linkedin, Check, ChevronDown, RotateCcw, Sparkles } from 'lucide-react'
import { normalizeCompanyNameForDedupe } from '@/lib/normalize'

export type LinkedInExperienceEntry = {
  company: string
  title: string
  isCurrent: boolean
}

export type LinkedInParsedData = {
  name?: string
  title?: string
  company?: string
  location?: string
  about?: string
  linkedinUrl?: string
  skills?: string
  experience?: LinkedInExperienceEntry[]
  warning?: string
}

export type LinkedInImportExistingData = {
  name?: string
  title?: string
  location?: string
  notes?: string
  linkedinUrl?: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Returning a promise lets the parent perform async work (e.g. creating
  // Company rows + EmploymentHistory rows for the experience[] payload) before
  // the dialog closes and the success toast fires.
  onImport: (data: LinkedInParsedData) => void | Promise<void>
  existingData?: LinkedInImportExistingData
  /**
   * Optional list of all known companies in the DB. Used to display a "✓ matched"
   * indicator next to imported experience entries whose company already exists,
   * so the user knows no duplicate Company will be created on commit.
   */
  knownCompanies?: { id: number; name: string }[]
}

import { FieldMergeUI, type FieldMergeItem, type FieldSelection } from '@/components/field-merge-ui'

export function LinkedInImportDialog({ open, onOpenChange, onImport, existingData, knownCompanies }: Props) {
  const [step, setStep] = useState<'input' | 'preview' | 'merge'>('input')
  const [text, setText] = useState('')
  const [profileUrl, setProfileUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [parsed, setParsed] = useState<LinkedInParsedData | null>(null)

  // One boolean per experience entry, keyed by index. Default: all checked.
  const [experienceSelected, setExperienceSelected] = useState<boolean[]>([])
  const [experienceOpen, setExperienceOpen] = useState(true)
  const [importing, setImporting] = useState(false)

  const [mergeFields, setMergeFields] = useState<FieldMergeItem[]>([])
  const [mergeSelections, setMergeSelections] = useState<Record<string, FieldSelection>>({})

  // Pre-compute which experience entries map to an existing Company so we can
  // render a "matched" badge in the preview without re-normalizing on every render.
  const knownCompanyIndex = useMemo(() => {
    const map = new Map<string, { id: number; name: string }>()
    for (const c of knownCompanies ?? []) {
      map.set(normalizeCompanyNameForDedupe(c.name), c)
    }
    return map
  }, [knownCompanies])

  function reset() {
    setStep('input')
    setText('')
    setProfileUrl('')
    setParsed(null)
    setLoading(false)
    setExperienceSelected([])
    setExperienceOpen(true)
    setMergeFields([])
    setMergeSelections({})
  }

  function handleClose(isOpen: boolean) {
    if (!isOpen) reset()
    onOpenChange(isOpen)
  }

  async function handleExtract() {
    if (text.trim().length < 20) {
      toast.error('Please paste more text from the LinkedIn profile.')
      return
    }

    setLoading(true)
    try {
      const result = await api.post<LinkedInParsedData>('/linkedin/parse', {
        text: text.trim(),
        profileUrl: profileUrl.trim() || undefined,
      })
      setParsed(result)
      setExperienceSelected((result.experience ?? []).map(() => true))
      setStep('preview')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to parse LinkedIn profile')
    } finally {
      setLoading(false)
    }
  }

  async function handleUseData() {
    if (!parsed) return
    const finalParsed = { ...parsed }
    if (profileUrl.trim() && !finalParsed.linkedinUrl) {
      finalParsed.linkedinUrl = profileUrl.trim()
    }
    // Apply user's per-row checkbox choices to the experience array.
    if (parsed.experience && parsed.experience.length > 0) {
      finalParsed.experience = parsed.experience.filter((_, i) => experienceSelected[i])
    }

    if (existingData) {
      const conflicts: FieldMergeItem[] = []
      const selections: Record<string, FieldSelection> = {}

      const checkField = (key: keyof LinkedInImportExistingData, label: string, parsedKey: keyof LinkedInParsedData = key as any, allowBoth = false) => {
        const val1 = existingData[key]?.trim() || ''
        const val2Raw = finalParsed[parsedKey]
        const val2 = typeof val2Raw === 'string' ? val2Raw.trim() : ''

        if (!val2) return // Nothing to import
        if (!val1) return // Nothing to conflict with
        if (val1 === val2) return // No conflict

        conflicts.push({
          key,
          label,
          val1,
          val2,
          allowBoth
        })
        selections[key] = 1 // default to existing data
      }

      checkField('name', 'Name')
      checkField('title', 'Title')
      checkField('location', 'Location')
      checkField('linkedinUrl', 'LinkedIn URL', 'linkedinUrl')
      checkField('notes', 'Notes / About', 'about', true)

      if (conflicts.length > 0) {
        setMergeFields(conflicts)
        setMergeSelections(selections)
        setParsed(finalParsed)
        setStep('merge')
        return
      }
    }

    setImporting(true)
    try {
      await onImport(finalParsed)
      handleClose(false)
      toast.success('LinkedIn data imported into form')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply LinkedIn data')
    } finally {
      setImporting(false)
    }
  }

  async function handleCompleteMerge() {
    if (!parsed) return

    const mergedData = { ...parsed }

    mergeFields.forEach((conflict) => {
      const sel = mergeSelections[conflict.key]
      if (sel === 1) {
        delete mergedData[conflict.key === 'notes' ? 'about' : conflict.key as keyof LinkedInParsedData]
      } else if (sel === 'both' && conflict.key === 'notes') {
        mergedData.about = `${existingData!.notes}\n\n---\nLinkedIn About:\n${parsed.about}`
      }
    })

    setImporting(true)
    try {
      await onImport(mergedData)
      handleClose(false)
      toast.success('LinkedIn data imported into form')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply LinkedIn data')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Linkedin className="h-5 w-5 text-[#0a66c2]" />
            Import from LinkedIn
          </DialogTitle>
          <DialogDescription>
            {step === 'input' && 'Copy all visible text from a LinkedIn profile page and paste it below.'}
            {step === 'preview' && 'Review the extracted data, then click "Use This Data" to populate the form.'}
            {step === 'merge' && 'Resolve conflicts between the imported data and your existing data.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'input' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="linkedin-url">LinkedIn URL (optional)</Label>
              <Input
                id="linkedin-url"
                value={profileUrl}
                onChange={(e) => setProfileUrl(e.target.value)}
                placeholder="https://linkedin.com/in/..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="linkedin-text">
                Profile Text <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="linkedin-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={"Go to the LinkedIn profile in your browser, select all the text on the page (Ctrl+A / Cmd+A), copy it (Ctrl+C / Cmd+C), then paste it here (Ctrl+V / Cmd+V)."}
                rows={12}
                className="font-mono text-xs leading-relaxed"
              />
              <p className="text-xs text-muted-foreground">
                {text.length > 0
                  ? `${text.length.toLocaleString()} characters pasted`
                  : 'Tip: Don\'t worry about copying extra text — the AI will extract the relevant fields.'}
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button onClick={handleExtract} disabled={loading || text.trim().length < 20}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Extract Data
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && parsed && (
          <div className="space-y-4">
            {parsed.warning && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <strong className="font-semibold">Heads up:</strong> {parsed.warning}
              </div>
            )}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              {parsed.name && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</span>
                  <p className="text-sm font-semibold mt-0.5">{parsed.name}</p>
                </div>
              )}
              {parsed.title && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Title / Headline</span>
                  <p className="text-sm mt-0.5">{parsed.title}</p>
                </div>
              )}
              {parsed.company && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Company</span>
                  <p className="text-sm mt-0.5">{parsed.company}</p>
                </div>
              )}
              {parsed.location && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Location</span>
                  <p className="text-sm mt-0.5">{parsed.location}</p>
                </div>
              )}
              {(parsed.linkedinUrl || profileUrl) && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">LinkedIn URL</span>
                  <p className="text-sm mt-0.5 text-primary truncate">
                    {parsed.linkedinUrl || profileUrl}
                  </p>
                </div>
              )}
              {parsed.about && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">About</span>
                  <p className="text-sm mt-0.5 whitespace-pre-line line-clamp-6">{parsed.about}</p>
                </div>
              )}
              {parsed.skills && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Top Skills</span>
                  <p className="text-sm mt-0.5">{parsed.skills}</p>
                </div>
              )}

              {parsed.experience && parsed.experience.length > 0 && (() => {
                const total = parsed.experience.length
                const currentCount = parsed.experience.filter(e => e.isCurrent).length
                const pastCount = total - currentCount
                const selectedCount = experienceSelected.filter(Boolean).length
                return (
                  <Collapsible open={experienceOpen} onOpenChange={setExperienceOpen}>
                    <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Experience ({total} {total === 1 ? 'role' : 'roles'} — {currentCount} current, {pastCount} past
                        {selectedCount !== total ? `; ${selectedCount} selected` : ''})
                      </span>
                      <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${experienceOpen ? 'rotate-180' : ''}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 space-y-1.5">
                      {parsed.experience.map((entry, i) => {
                        const matched = knownCompanyIndex.get(normalizeCompanyNameForDedupe(entry.company))
                        return (
                          <label
                            key={i}
                            className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60 cursor-pointer"
                          >
                            <Checkbox
                              checked={experienceSelected[i] ?? true}
                              onCheckedChange={(checked) => {
                                setExperienceSelected(prev => {
                                  const next = [...prev]
                                  next[i] = checked === true
                                  return next
                                })
                              }}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0 text-sm">
                              <span className="font-medium">{entry.title}</span>
                              <span className="text-muted-foreground"> at </span>
                              <span>{entry.company}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Badge
                                variant="outline"
                                className={`text-[10px] py-0 px-1.5 ${entry.isCurrent ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                              >
                                {entry.isCurrent ? 'Current' : 'Past'}
                              </Badge>
                              {matched && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700" title={`Matched to existing company: ${matched.name}`}>
                                  <Check className="h-3 w-3" />
                                  matched
                                </span>
                              )}
                            </div>
                          </label>
                        )
                      })}
                    </CollapsibleContent>
                  </Collapsible>
                )
              })()}

              {!parsed.name && !parsed.title && !parsed.company && (!parsed.experience || parsed.experience.length === 0) && (
                <p className="text-sm text-muted-foreground italic">
                  No data could be extracted. Try pasting more text from the profile.
                </p>
              )}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" size="sm" onClick={() => { setStep('input'); setParsed(null) }} disabled={importing}>
                <RotateCcw className="mr-2 h-3 w-3" />
                Try Again
              </Button>
              <Button onClick={handleUseData} disabled={!parsed.name || importing}>
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Use This Data
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {step === 'merge' && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="grid grid-cols-[auto_1fr_1fr] gap-4 mb-2 px-3">
                <div />
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current Data</div>
                <div className="text-xs font-semibold text-primary uppercase tracking-wider">LinkedIn Import</div>
              </div>
              <FieldMergeUI 
                fields={mergeFields} 
                selections={mergeSelections} 
                onChange={(key, val) => setMergeSelections(prev => ({...prev, [key]: val}))} 
              />
            </div>
            <div className="flex justify-between">
              <Button variant="outline" size="sm" onClick={() => setStep('preview')} disabled={importing}>
                <RotateCcw className="mr-2 h-3 w-3" />
                Back to Preview
              </Button>
              <Button onClick={handleCompleteMerge} disabled={importing}>
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Confirm & Import
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
