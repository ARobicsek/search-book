import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { Users, Building2, Loader2, RefreshCw, GitMerge } from 'lucide-react'

import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { FieldMergeUI, type FieldSelection } from '@/components/field-merge-ui'

// --- SHARED UTILS --- 
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 3) + '...'
}

// ----------------------------------------------------
// CONTACT DUPLICATES TAB
// ----------------------------------------------------

interface DuplicateContactSummary {
  id: number
  name: string
  email: string | null
  title: string | null
  company: { id: number; name: string } | null
}

interface DuplicatePair {
  contact1: DuplicateContactSummary
  contact2: DuplicateContactSummary
  score: number
  reasons: string[]
}

interface DuplicateContact {
  id: number
  name: string
  email: string | null
  additionalEmails: string | null
  phone: string | null
  title: string | null
  linkedinUrl: string | null
  ecosystem: string
  status: string
  location: string | null
  howConnected: string | null
  personalDetails: string | null
  roleDescription: string | null
  notes: string | null
  photoFile: string | null
  photoUrl: string | null
  mutualConnections: string | null
  whereFound: string | null
  openQuestions: string | null
  flagged: boolean
  company: { id: number; name: string } | null
}

interface MergeState {
  contact1: DuplicateContact
  contact2: DuplicateContact
  keepId: number
  fieldSelections: Record<string, FieldSelection>
}

const MULTI_VALUE_FIELDS = ['email', 'phone'] as const
const MERGEABLE_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'title', label: 'Title' },
  { key: 'linkedinUrl', label: 'LinkedIn' },
  { key: 'ecosystem', label: 'Ecosystem' },
  { key: 'status', label: 'Status' },
  { key: 'location', label: 'Location' },
  { key: 'howConnected', label: 'How Connected' },
  { key: 'personalDetails', label: 'Personal Details' },
  { key: 'roleDescription', label: 'Role Description' },
  { key: 'notes', label: 'Notes' },
  { key: 'mutualConnections', label: 'Mutual Connections' },
  { key: 'whereFound', label: 'Where Found' },
  { key: 'openQuestions', label: 'Open Questions' },
  { key: 'photoUrl', label: 'Photo URL' },
  { key: 'photoFile', label: 'Photo File' },
  { key: 'flagged', label: 'Flagged' },
] as const

function ContactsTab() {
  const [duplicates, setDuplicates] = useState<DuplicatePair[]>([])
  const [loading, setLoading] = useState(true)
  const [merging, setMerging] = useState(false)
  const [mergeState, setMergeState] = useState<MergeState | null>(null)

  const [contactOptions, setContactOptions] = useState<ComboboxOption[]>([])
  const [manualContact1, setManualContact1] = useState('')
  const [manualContact2, setManualContact2] = useState('')
  const [loadingManualMerge, setLoadingManualMerge] = useState(false)
  const [loadingMergeDetails, setLoadingMergeDetails] = useState(false)

  const loadDuplicates = useCallback(() => {
    setLoading(true)
    api
      .get<DuplicatePair[]>('/duplicates')
      .then(setDuplicates)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to scan'))
      .finally(() => setLoading(false))
  }, [])

  const loadContactNames = useCallback(() => {
    api.get<{ id: number; name: string }[]>('/contacts/names')
      .then((names) => setContactOptions(names.map(c => ({ value: String(c.id), label: c.name }))))
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadDuplicates()
    loadContactNames()
  }, [loadDuplicates, loadContactNames])

  async function openManualMerge(keepId: number) {
    const id1 = parseInt(manualContact1)
    const id2 = parseInt(manualContact2)
    if (!id1 || !id2 || id1 === id2) return

    setLoadingManualMerge(true)
    try {
      await openMergeDialog(id1, id2, keepId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load contacts')
    } finally {
      setLoadingManualMerge(false)
    }
  }

  async function openMergeDialog(id1: number, id2: number, keepId: number) {
    setLoadingMergeDetails(true)
    try {
      const [c1, c2] = await Promise.all([
        api.get<DuplicateContact>(`/contacts/${id1}`),
        api.get<DuplicateContact>(`/contacts/${id2}`),
      ])
      const [contact1, contact2] = c1.id < c2.id ? [c1, c2] : [c2, c1]

      const isKeepingContact1 = keepId === contact1.id
      const defaultSelection: FieldSelection = isKeepingContact1 ? 1 : 2

      const fieldSelections: Record<string, FieldSelection> = {}
      for (const field of MERGEABLE_FIELDS) {
        fieldSelections[field.key] = defaultSelection
      }

      setMergeState({ contact1, contact2, keepId, fieldSelections })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load contact details')
    } finally {
      setLoadingMergeDetails(false)
    }
  }

  function setFieldSelection(field: string, selection: FieldSelection) {
    if (!mergeState) return
    setMergeState({
      ...mergeState,
      fieldSelections: { ...mergeState.fieldSelections, [field]: selection },
    })
  }

  async function handleMerge() {
    if (!mergeState) return
    setMerging(true)

    const removeId = mergeState.keepId === mergeState.contact1.id ? mergeState.contact2.id : mergeState.contact1.id
    const keepName = mergeState.keepId === mergeState.contact1.id ? mergeState.contact1.name : mergeState.contact2.name
    const removeName = mergeState.keepId === mergeState.contact1.id ? mergeState.contact2.name : mergeState.contact1.name

    try {
      await api.post('/duplicates/merge', {
        keepId: mergeState.keepId,
        removeId,
        fieldSelections: mergeState.fieldSelections,
      })
      toast.success(`Merged "${removeName}" into "${keepName}"`)
      setMergeState(null)
      setManualContact1('')
      setManualContact2('')
      loadDuplicates()
      loadContactNames()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to merge')
    } finally {
      setMerging(false)
    }
  }

  function getFieldValue(contact: DuplicateContact, field: string): string {
    const value = contact[field as keyof DuplicateContact]
    if (value === null || value === undefined) return '(empty)'
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  function getAllEmails(contact: DuplicateContact): string[] {
    const emails: string[] = []
    if (contact.email) emails.push(contact.email)
    if (contact.additionalEmails) {
      try {
        const additional = JSON.parse(contact.additionalEmails) as string[]
        emails.push(...additional)
      } catch {}
    }
    return emails
  }

  function getEmailDisplay(contact: DuplicateContact): string {
    const emails = getAllEmails(contact)
    if (emails.length === 0) return '(empty)'
    return emails.join(', ')
  }

  function isMultiValueField(field: string): boolean {
    return MULTI_VALUE_FIELDS.includes(field as typeof MULTI_VALUE_FIELDS[number])
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {loading ? 'Scanning...' : `${duplicates.length} potential duplicate${duplicates.length !== 1 ? 's' : ''} found`}
          </p>
        </div>
        <Button variant="outline" onClick={loadDuplicates} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Rescan
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Manual Merge</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Select two contacts to combine (e.g. when names differ but it's the same person).
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Contact 1</Label>
              <Combobox
                options={contactOptions.filter(o => o.value !== manualContact2)}
                value={manualContact1}
                onChange={(v) => setManualContact1(v)}
                placeholder="Select contact..."
                searchPlaceholder="Search contacts..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Contact 2</Label>
              <Combobox
                options={contactOptions.filter(o => o.value !== manualContact1)}
                value={manualContact2}
                onChange={(v) => setManualContact2(v)}
                placeholder="Select contact..."
                searchPlaceholder="Search contacts..."
              />
            </div>
          </div>
          {manualContact1 && manualContact2 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => openManualMerge(parseInt(manualContact1))}
                disabled={loadingManualMerge}
              >
                {loadingManualMerge ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitMerge className="mr-2 h-4 w-4" />}
                Keep {contactOptions.find(o => o.value === manualContact1)?.label}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openManualMerge(parseInt(manualContact2))}
                disabled={loadingManualMerge}
              >
                {loadingManualMerge ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitMerge className="mr-2 h-4 w-4" />}
                Keep {contactOptions.find(o => o.value === manualContact2)?.label}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : duplicates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No duplicates found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {duplicates.map((dup, idx) => (
            <Card key={idx}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Potential Match</CardTitle>
                  <div className="flex gap-1">
                    {dup.reasons.map((reason, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {reason}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-md border p-3 space-y-1">
                    <p className="font-medium">{dup.contact1.name}</p>
                    {dup.contact1.title && <p className="text-sm text-muted-foreground">{dup.contact1.title}</p>}
                    {dup.contact1.company && <p className="text-sm text-muted-foreground">{dup.contact1.company.name}</p>}
                    {dup.contact1.email && <p className="text-xs text-muted-foreground">{dup.contact1.email}</p>}
                    <Link to={`/contacts/${dup.contact1.id}`} className="text-xs text-primary hover:underline">View profile</Link>
                  </div>
                  <div className="rounded-md border p-3 space-y-1">
                    <p className="font-medium">{dup.contact2.name}</p>
                    {dup.contact2.title && <p className="text-sm text-muted-foreground">{dup.contact2.title}</p>}
                    {dup.contact2.company && <p className="text-sm text-muted-foreground">{dup.contact2.company.name}</p>}
                    {dup.contact2.email && <p className="text-xs text-muted-foreground">{dup.contact2.email}</p>}
                    <Link to={`/contacts/${dup.contact2.id}`} className="text-xs text-primary hover:underline">View profile</Link>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={loadingMergeDetails} onClick={() => openMergeDialog(dup.contact1.id, dup.contact2.id, dup.contact1.id)}>
                    {loadingMergeDetails ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitMerge className="mr-2 h-4 w-4" />}
                    Merge (keep {truncate(dup.contact1.name, 15)})
                  </Button>
                  <Button size="sm" variant="outline" disabled={loadingMergeDetails} onClick={() => openMergeDialog(dup.contact1.id, dup.contact2.id, dup.contact2.id)}>
                    {loadingMergeDetails ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitMerge className="mr-2 h-4 w-4" />}
                    Merge (keep {truncate(dup.contact2.name, 15)})
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={mergeState !== null} onOpenChange={(open) => !open && setMergeState(null)}>
        <DialogContent className="sm:max-w-2xl" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Merge Contacts</DialogTitle>
            <DialogDescription>
              Select which value to keep for each field. All conversations, actions, relationships,
              and other data will be combined into the kept contact.
            </DialogDescription>
          </DialogHeader>
          {mergeState && (
            <ScrollArea className="max-h-[60vh] pr-4">
              <div className="space-y-4">
                <FieldMergeUI
                  fields={MERGEABLE_FIELDS.map(({ key, label }) => {
                    const isEmail = key === 'email'
                    return {
                      key,
                      label,
                      val1: isEmail ? getEmailDisplay(mergeState.contact1) : getFieldValue(mergeState.contact1, key),
                      val2: isEmail ? getEmailDisplay(mergeState.contact2) : getFieldValue(mergeState.contact2, key),
                      allowBoth: isMultiValueField(key)
                    }
                  })}
                  selections={mergeState.fieldSelections}
                  onChange={(key, val) => setFieldSelection(key, val)}
                />
                <div className="border-t pt-4 mt-4">
                  <p className="text-sm text-muted-foreground">
                    <strong>Automatically combined:</strong> Company associations, conversations,
                    actions, relationships, links, prep notes, and tags from both contacts.
                  </p>
                </div>
              </div>
            </ScrollArea>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setMergeState(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleMerge} disabled={merging}>
              {merging ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Merging...</> : 'Merge Contacts'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


// ----------------------------------------------------
// COMPANY DUPLICATES TAB
// ----------------------------------------------------

interface DuplicateCompanySummary {
  id: number
  name: string
  industry: string | null
  size: string | null
  status: string
}

interface DuplicateCompanyPair {
  company1: DuplicateCompanySummary
  company2: DuplicateCompanySummary
  score: number
  reasons: string[]
}

interface DuplicateCompany {
  id: number
  name: string
  industry: string | null
  size: string | null
  website: string | null
  hqLocation: string | null
  status: string
  notes: string | null
}

interface CompanyMergeState {
  company1: DuplicateCompany
  company2: DuplicateCompany
  keepId: number
  fieldSelections: Record<string, FieldSelection>
}

const COMPANY_MERGEABLE_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'industry', label: 'Industry' },
  { key: 'size', label: 'Size' },
  { key: 'website', label: 'Website' },
  { key: 'hqLocation', label: 'HQ Location' },
  { key: 'status', label: 'Status' },
  { key: 'notes', label: 'Notes' },
] as const

const COMPANY_MULTI_VALUE_FIELDS = ['notes'] as const

function CompaniesTab() {
  const [duplicates, setDuplicates] = useState<DuplicateCompanyPair[]>([])
  const [loading, setLoading] = useState(true)
  const [merging, setMerging] = useState(false)
  const [mergeState, setMergeState] = useState<CompanyMergeState | null>(null)

  const [companyOptions, setCompanyOptions] = useState<ComboboxOption[]>([])
  const [manualCompany1, setManualCompany1] = useState('')
  const [manualCompany2, setManualCompany2] = useState('')
  const [loadingManualMerge, setLoadingManualMerge] = useState(false)
  const [loadingMergeDetails, setLoadingMergeDetails] = useState(false)

  const loadDuplicates = useCallback(() => {
    setLoading(true)
    api
      .get<DuplicateCompanyPair[]>('/duplicates/companies')
      .then(setDuplicates)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to scan companies'))
      .finally(() => setLoading(false))
  }, [])

  const loadCompanyNames = useCallback(() => {
    api.get<{ id: number; name: string }[]>('/companies/names')
      .then((names) => setCompanyOptions(names.map(c => ({ value: String(c.id), label: c.name }))))
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadDuplicates()
    loadCompanyNames()
  }, [loadDuplicates, loadCompanyNames])

  async function openManualMerge(keepId: number) {
    const id1 = parseInt(manualCompany1)
    const id2 = parseInt(manualCompany2)
    if (!id1 || !id2 || id1 === id2) return

    setLoadingManualMerge(true)
    try {
      await openMergeDialog(id1, id2, keepId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load companies')
    } finally {
      setLoadingManualMerge(false)
    }
  }

  async function openMergeDialog(id1: number, id2: number, keepId: number) {
    setLoadingMergeDetails(true)
    try {
      const [c1, c2] = await Promise.all([
        api.get<DuplicateCompany>(`/companies/${id1}`),
        api.get<DuplicateCompany>(`/companies/${id2}`),
      ])
      const [company1, company2] = c1.id < c2.id ? [c1, c2] : [c2, c1]

      const isKeepingCompany1 = keepId === company1.id
      const defaultSelection: FieldSelection = isKeepingCompany1 ? 1 : 2

      const fieldSelections: Record<string, FieldSelection> = {}
      for (const field of COMPANY_MERGEABLE_FIELDS) {
        fieldSelections[field.key] = defaultSelection
      }

      setMergeState({ company1, company2, keepId, fieldSelections })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load company details')
    } finally {
      setLoadingMergeDetails(false)
    }
  }

  function setFieldSelection(field: string, selection: FieldSelection) {
    if (!mergeState) return
    setMergeState({
      ...mergeState,
      fieldSelections: { ...mergeState.fieldSelections, [field]: selection },
    })
  }

  async function handleMerge() {
    if (!mergeState) return
    setMerging(true)

    const removeId = mergeState.keepId === mergeState.company1.id ? mergeState.company2.id : mergeState.company1.id
    const keepName = mergeState.keepId === mergeState.company1.id ? mergeState.company1.name : mergeState.company2.name
    const removeName = mergeState.keepId === mergeState.company1.id ? mergeState.company2.name : mergeState.company1.name

    try {
      await api.post('/duplicates/companies/merge', {
        keepId: mergeState.keepId,
        removeId,
        fieldSelections: mergeState.fieldSelections,
      })
      toast.success(`Merged "${removeName}" into "${keepName}"`)
      setMergeState(null)
      setManualCompany1('')
      setManualCompany2('')
      loadDuplicates()
      loadCompanyNames()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to merge')
    } finally {
      setMerging(false)
    }
  }

  function getFieldValue(company: DuplicateCompany, field: string): string {
    const value = company[field as keyof DuplicateCompany]
    if (value === null || value === undefined) return '(empty)'
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    return String(value)
  }

  function isMultiValueField(field: string): boolean {
    return COMPANY_MULTI_VALUE_FIELDS.includes(field as typeof COMPANY_MULTI_VALUE_FIELDS[number])
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {loading ? 'Scanning...' : `${duplicates.length} potential duplicate${duplicates.length !== 1 ? 's' : ''} found`}
          </p>
        </div>
        <Button variant="outline" onClick={loadDuplicates} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Rescan
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Manual Merge</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
             Select two companies to combine.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Company 1</Label>
              <Combobox
                options={companyOptions.filter(o => o.value !== manualCompany2)}
                value={manualCompany1}
                onChange={(v) => setManualCompany1(v)}
                placeholder="Select company..."
                searchPlaceholder="Search companies..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Company 2</Label>
              <Combobox
                options={companyOptions.filter(o => o.value !== manualCompany1)}
                value={manualCompany2}
                onChange={(v) => setManualCompany2(v)}
                placeholder="Select company..."
                searchPlaceholder="Search companies..."
              />
            </div>
          </div>
          {manualCompany1 && manualCompany2 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => openManualMerge(parseInt(manualCompany1))} disabled={loadingManualMerge}>
                {loadingManualMerge ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitMerge className="mr-2 h-4 w-4" />}
                Keep {companyOptions.find(o => o.value === manualCompany1)?.label}
              </Button>
              <Button size="sm" variant="outline" onClick={() => openManualMerge(parseInt(manualCompany2))} disabled={loadingManualMerge}>
                {loadingManualMerge ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitMerge className="mr-2 h-4 w-4" />}
                Keep {companyOptions.find(o => o.value === manualCompany2)?.label}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : duplicates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No duplicates found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {duplicates.map((dup, idx) => (
            <Card key={idx}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Potential Match</CardTitle>
                  <div className="flex gap-1">
                    {dup.reasons.map((reason, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {reason}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-md border p-3 space-y-1">
                    <p className="font-medium">{dup.company1.name}</p>
                    {dup.company1.industry && <p className="text-sm text-muted-foreground">{dup.company1.industry}</p>}
                    {dup.company1.size && <p className="text-xs text-muted-foreground">{dup.company1.size}</p>}
                    <Link to={`/companies/${dup.company1.id}`} className="text-xs text-primary hover:underline">View company</Link>
                  </div>
                  <div className="rounded-md border p-3 space-y-1">
                    <p className="font-medium">{dup.company2.name}</p>
                    {dup.company2.industry && <p className="text-sm text-muted-foreground">{dup.company2.industry}</p>}
                    {dup.company2.size && <p className="text-xs text-muted-foreground">{dup.company2.size}</p>}
                    <Link to={`/companies/${dup.company2.id}`} className="text-xs text-primary hover:underline">View company</Link>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={loadingMergeDetails} onClick={() => openMergeDialog(dup.company1.id, dup.company2.id, dup.company1.id)}>
                    {loadingMergeDetails ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitMerge className="mr-2 h-4 w-4" />}
                    Merge (keep {truncate(dup.company1.name, 15)})
                  </Button>
                  <Button size="sm" variant="outline" disabled={loadingMergeDetails} onClick={() => openMergeDialog(dup.company1.id, dup.company2.id, dup.company2.id)}>
                    {loadingMergeDetails ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitMerge className="mr-2 h-4 w-4" />}
                    Merge (keep {truncate(dup.company2.name, 15)})
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={mergeState !== null} onOpenChange={(open) => !open && setMergeState(null)}>
        <DialogContent className="sm:max-w-2xl" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Merge Companies</DialogTitle>
            <DialogDescription>
              Select which value to keep for each field. All contacts, conversations, actions, and prep notes
              will be combined into the kept company.
            </DialogDescription>
          </DialogHeader>
          {mergeState && (
            <ScrollArea className="max-h-[60vh] pr-4">
              <div className="space-y-4">
                <FieldMergeUI
                  fields={COMPANY_MERGEABLE_FIELDS.map(({ key, label }) => {
                    return {
                      key,
                      label,
                      val1: getFieldValue(mergeState.company1, key),
                      val2: getFieldValue(mergeState.company2, key),
                      allowBoth: isMultiValueField(key)
                    }
                  })}
                  selections={mergeState.fieldSelections}
                  onChange={(key, val) => setFieldSelection(key, val)}
                />
                <div className="border-t pt-4 mt-4">
                  <p className="text-sm text-muted-foreground">
                    <strong>Automatically combined:</strong> Contacts, Conversations, Actions, Tags, Links, Prep Notes, Activities, and Employment History from both companies.
                  </p>
                </div>
              </div>
            </ScrollArea>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setMergeState(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleMerge} disabled={merging}>
              {merging ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Merging...</> : 'Merge Companies'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ----------------------------------------------------
// MAIN PAGE EXPORT
// ----------------------------------------------------

export function DuplicatesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Duplicate Detection</h1>

      <Tabs defaultValue="contacts" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="contacts" className="gap-2">
            <Users className="h-4 w-4" />
            Contacts
          </TabsTrigger>
          <TabsTrigger value="companies" className="gap-2">
            <Building2 className="h-4 w-4" />
            Companies
          </TabsTrigger>
        </TabsList>
        <TabsContent value="contacts">
          <ContactsTab />
        </TabsContent>
        <TabsContent value="companies">
          <CompaniesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
