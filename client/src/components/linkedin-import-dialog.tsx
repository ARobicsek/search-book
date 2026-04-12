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

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (data: LinkedInParsedData) => void
}

export function LinkedInImportDialog({ open, onOpenChange, onImport }: Props) {
  const [step, setStep] = useState<'input' | 'preview'>('input')
  const [text, setText] = useState('')
  const [profileUrl, setProfileUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [parsed, setParsed] = useState<LinkedInParsedData | null>(null)

  function reset() {
    setStep('input')
    setText('')
    setProfileUrl('')
    setParsed(null)
    setLoading(false)
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
    if (parsed) {
      // Add profileUrl to parsed data if user entered it and it wasn't already set
      if (profileUrl.trim() && !parsed.linkedinUrl) {
        parsed.linkedinUrl = profileUrl.trim()
      }
      onImport(parsed)
      handleClose(false)
      toast.success('LinkedIn data imported into form')
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
            {step === 'input'
              ? 'Copy all visible text from a LinkedIn profile page and paste it below.'
              : 'Review the extracted data, then click "Use This Data" to populate the form.'}
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
      </DialogContent>
    </Dialog>
  )
}
