import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { ConversationType } from '@/lib/types'
import { CONVERSATION_TYPE_OPTIONS } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Combobox, MultiCombobox, type ComboboxOption } from '@/components/ui/combobox'
import { TitleAutocomplete } from '@/components/title-autocomplete'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight } from 'lucide-react'

// Context so the command palette, header button, and Meetings page can all
// open the same Quick Log dialog (mirrors the CommandPaletteProvider pattern).
const QuickLogContext = createContext<{ open: () => void }>({ open: () => { } })

export function useQuickLog() {
  return useContext(QuickLogContext)
}

export function QuickLogProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const open = useCallback(() => setIsOpen(true), [])

  return (
    <QuickLogContext.Provider value={{ open }}>
      {children}
      <QuickLogDialog open={isOpen} onOpenChange={setIsOpen} />
    </QuickLogContext.Provider>
  )
}

function QuickLogDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [type, setType] = useState<ConversationType>('MEETING')
  const [summary, setSummary] = useState('')
  const [notes, setNotes] = useState('')
  const [contactId, setContactId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [participantIds, setParticipantIds] = useState<string[]>([])
  const [attendeesDescription, setAttendeesDescription] = useState('')
  const [showWho, setShowWho] = useState(false)
  const [saving, setSaving] = useState(false)

  // Lookup data, fetched lazily on first open
  const [titles, setTitles] = useState<string[]>([])
  const [contactOptions, setContactOptions] = useState<ComboboxOption[]>([])
  const [companyOptions, setCompanyOptions] = useState<ComboboxOption[]>([])
  const [lookupsLoaded, setLookupsLoaded] = useState(false)

  useEffect(() => {
    if (!open) return
    // Reset to a fresh minimal log each time (S4: title + date + save in <30s)
    setTitle('')
    setDate(new Date().toLocaleDateString('en-CA'))
    setType('MEETING')
    setSummary('')
    setNotes('')
    setContactId('')
    setCompanyId('')
    setParticipantIds([])
    setAttendeesDescription('')
    setShowWho(false)

    api.get<string[]>('/conversations/titles').then(setTitles).catch(() => { })
    if (!lookupsLoaded) {
      api.get<{ id: number; name: string }[]>('/contacts/names')
        .then((data) => setContactOptions(data.map((c) => ({ value: c.id.toString(), label: c.name }))))
        .catch(() => { })
      api.get<{ id: number; name: string }[]>('/companies/names')
        .then((data) => setCompanyOptions(data.map((c) => ({ value: c.id.toString(), label: c.name }))))
        .catch(() => { })
      setLookupsLoaded(true)
    }
  }, [open, lookupsLoaded])

  async function handleSave() {
    if (!date) {
      toast.error('Date is required')
      return
    }
    if (!title.trim() && !contactId && !companyId && participantIds.length === 0 && !attendeesDescription.trim()) {
      toast.error('Add a title (or someone who was there)')
      return
    }
    setSaving(true)
    try {
      // Resolve free-text entries into real records (same pattern as the full editor)
      let resolvedCompanyId: number | null = null
      if (companyId) {
        if (/^\d+$/.test(companyId)) {
          resolvedCompanyId = Number(companyId)
        } else {
          const created = await api.post<{ id: number }>('/companies', { name: companyId })
          resolvedCompanyId = created.id
        }
      }
      const participants: { contactId: number }[] = []
      for (const val of participantIds) {
        if (/^\d+$/.test(val)) {
          participants.push({ contactId: Number(val) })
        } else {
          const created = await api.post<{ id: number }>('/contacts', {
            name: val,
            status: 'CONNECTED',
            ecosystem: 'NETWORK',
          })
          participants.push({ contactId: created.id })
        }
      }

      await api.post('/conversations', {
        title: title.trim() || null,
        date,
        type,
        summary: summary.trim() || null,
        notes: notes.trim() || null,
        contactId: contactId ? Number(contactId) : null,
        companyId: resolvedCompanyId,
        participants,
        attendeesDescription: attendeesDescription.trim() || null,
      })
      toast.success('Meeting logged')
      // Pages that list meetings (e.g. /meetings) listen for this to refresh
      window.dispatchEvent(new CustomEvent('searchbook:meeting-logged'))
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to log meeting')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[95vw] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Quick Log Meeting</DialogTitle>
          <DialogDescription>
            Title + date is enough — add people or notes if you have a minute.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="ql-title">Title</Label>
            <TitleAutocomplete
              id="ql-title"
              value={title}
              onChange={setTitle}
              titles={titles}
              autoFocus
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ql-date">Date</Label>
              <Input id="ql-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ConversationType)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONVERSATION_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ql-summary">Summary</Label>
            <Input
              id="ql-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="One-liner (optional)"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ql-notes">Notes</Label>
            <Textarea
              id="ql-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional — use ### headings for topics"
              rows={3}
            />
          </div>

          {/* Who was there — collapsed by default to keep the fast path fast */}
          <button
            type="button"
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setShowWho((v) => !v)}
          >
            {showWho ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Who was there
            {(contactId || companyId || participantIds.length > 0 || attendeesDescription) && (
              <span className="text-xs text-primary">·</span>
            )}
          </button>
          {showWho && (
            <div className="grid gap-4 rounded-md border p-3">
              <div className="space-y-2">
                <Label>Contact (1:1 anchor)</Label>
                <Combobox
                  options={contactOptions}
                  value={contactId}
                  onChange={(v) => setContactId(v)}
                  placeholder="Link to one contact..."
                  searchPlaceholder="Search contacts..."
                />
              </div>
              <div className="space-y-2">
                <Label>Participants</Label>
                <MultiCombobox
                  options={contactOptions}
                  values={participantIds}
                  onChange={setParticipantIds}
                  placeholder="Named people in the meeting..."
                  searchPlaceholder="Search or type new name..."
                  allowFreeText={true}
                />
              </div>
              <div className="space-y-2">
                <Label>Organization</Label>
                <Combobox
                  options={companyOptions}
                  value={companyId}
                  onChange={(v) => setCompanyId(v)}
                  placeholder="With which org..."
                  searchPlaceholder="Search or type new name..."
                  allowFreeText={true}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ql-attendees">Attendees description</Label>
                <Input
                  id="ql-attendees"
                  value={attendeesDescription}
                  onChange={(e) => setAttendeesDescription(e.target.value)}
                  placeholder='e.g. "~10 Arcadia folks incl. analytics team"'
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Log Meeting'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
