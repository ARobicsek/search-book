import { useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Loader2, Linkedin, Check, RotateCcw, Sparkles } from 'lucide-react'

export type LinkedInParsedData = {
  name?: string
  title?: string
  company?: string
  location?: string
  about?: string
  linkedinUrl?: string
  skills?: string
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
  onImport: (data: LinkedInParsedData) => void
  existingData?: LinkedInImportExistingData
}

import { FieldMergeUI, type FieldMergeItem, type FieldSelection } from '@/components/field-merge-ui'

export function LinkedInImportDialog({ open, onOpenChange, onImport, existingData }: Props) {
  const [step, setStep] = useState<'input' | 'preview' | 'merge'>('input')
  const [text, setText] = useState('')
  const [profileUrl, setProfileUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [parsed, setParsed] = useState<LinkedInParsedData | null>(null)
  
  const [mergeFields, setMergeFields] = useState<FieldMergeItem[]>([])
  const [mergeSelections, setMergeSelections] = useState<Record<string, FieldSelection>>({})

  function reset() {
    setStep('input')
    setText('')
    setProfileUrl('')
    setParsed(null)
    setLoading(false)
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
      setStep('preview')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to parse LinkedIn profile')
    } finally {
      setLoading(false)
    }
  }

  function handleUseData() {
    if (!parsed) return
    const finalParsed = { ...parsed }
    if (profileUrl.trim() && !finalParsed.linkedinUrl) {
      finalParsed.linkedinUrl = profileUrl.trim()
    }

    if (existingData) {
      const conflicts: FieldMergeItem[] = []
      const selections: Record<string, FieldSelection> = {}

      const checkField = (key: keyof LinkedInImportExistingData, label: string, parsedKey: keyof LinkedInParsedData = key as any, allowBoth = false) => {
        const val1 = existingData[key]?.trim() || ''
        const val2 = finalParsed[parsedKey]?.trim() || ''
        
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
        selections[key] = 2 // default to imported
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

    onImport(finalParsed)
    handleClose(false)
    toast.success('LinkedIn data imported into form')
  }

  function handleCompleteMerge() {
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

    onImport(mergedData)
    handleClose(false)
    toast.success('LinkedIn data imported into form')
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

              {!parsed.name && !parsed.title && !parsed.company && (
                <p className="text-sm text-muted-foreground italic">
                  No data could be extracted. Try pasting more text from the profile.
                </p>
              )}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" size="sm" onClick={() => { setStep('input'); setParsed(null) }}>
                <RotateCcw className="mr-2 h-3 w-3" />
                Try Again
              </Button>
              <Button onClick={handleUseData} disabled={!parsed.name}>
                <Check className="mr-2 h-4 w-4" />
                Use This Data
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
              <Button variant="outline" size="sm" onClick={() => setStep('preview')}>
                <RotateCcw className="mr-2 h-3 w-3" />
                Back to Preview
              </Button>
              <Button onClick={handleCompleteMerge}>
                <Check className="mr-2 h-4 w-4" />
                Confirm & Import
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
