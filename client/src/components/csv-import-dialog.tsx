import { useState, useCallback } from 'react'
import { api } from '@/lib/api'
import type { Contact } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { Upload, FileSpreadsheet, AlertCircle } from 'lucide-react'

// Fields that can be imported
const IMPORTABLE_FIELDS = [
  { value: 'skip', label: '— Skip —' },
  { value: 'name', label: 'Name (Full)' },
  { value: 'firstName', label: 'First Name' },
  { value: 'lastName', label: 'Last Name' },
  { value: 'title', label: 'Title' },
  { value: 'roleDescription', label: 'Role Description' },
  { value: 'companyName', label: 'Company' },
  { value: 'ecosystem', label: 'Ecosystem' },
  { value: 'status', label: 'Status' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'linkedinUrl', label: 'LinkedIn URL' },
  { value: 'location', label: 'Location' },
  { value: 'linkUrl', label: 'Link URL' },
  { value: 'howConnected', label: 'How Connected' },
  { value: 'mutualConnections', label: 'Mutual Connections' },
  { value: 'whereFound', label: 'Where Found' },
  { value: 'openQuestions', label: 'Open Questions' },
  { value: 'notes', label: 'Notes' },
  { value: 'personalDetails', label: 'Personal Details' },
]

// Column header aliases for auto-mapping
const HEADER_ALIASES: Record<string, string> = {
  // Name variations
  'name': 'name',
  'full name': 'name',
  'contact name': 'name',
  'first name': 'firstName',
  'firstname': 'firstName',
  'first': 'firstName',
  'last name': 'lastName',
  'lastname': 'lastName',
  'last': 'lastName',
  // Company
  'company': 'companyName',
  'company name': 'companyName',
  'organization': 'companyName',
  // Contact info
  'email': 'email',
  'email address': 'email',
  'phone': 'phone',
  'phone number': 'phone',
  'mobile': 'mobile',
  'mobile phone': 'mobile',
  'cell': 'mobile',
  'cell phone': 'mobile',
  // LinkedIn
  'linkedin': 'linkedinUrl',
  'linkedin url': 'linkedinUrl',
  'linkedin profile': 'linkedinUrl',
  'linkedinurl': 'linkedinUrl',
  // Location
  'location': 'location',
  'city': 'location',
  'address': 'location',
  // Other
  'title': 'title',
  'job title': 'title',
  'role': 'title',
  'position': 'title',
  'status': 'status',
  'link': 'linkUrl',
  'link url': 'linkUrl',
  'website': 'linkUrl',
  'url': 'linkUrl',
  'notes': 'notes',
  'ecosystem': 'ecosystem',
}

// Valid ecosystem values (legacy job-search terms map into the NCQA taxonomy)
const ECOSYSTEM_MAP: Record<string, string> = {
  payer: 'PAYER',
  'health plan': 'PAYER',
  provider: 'PROVIDER',
  'health system': 'PROVIDER',
  government: 'GOVERNMENT',
  academia: 'ACADEMIA',
  'health tech': 'HEALTH_TECH',
  health_tech: 'HEALTH_TECH',
  vendor: 'HEALTH_TECH',
  policy: 'POLICY',
  media: 'MEDIA',
  press: 'MEDIA',
  funder: 'FUNDER',
  ncqa: 'NCQA',
  network: 'NETWORK',
  recruiter: 'RECRUITER',
  consultant: 'CONSULTANT',
  // legacy terms
  rolodex: 'NETWORK',
  target: 'NETWORK',
  influencer: 'NETWORK',
  'intro source': 'NETWORK',
  intro_source: 'NETWORK',
}

// Valid status values (eliminated legacy statuses map to NONE = blank)
const STATUS_MAP: Record<string, string> = {
  researching: 'RESEARCHING',
  research: 'RESEARCHING',
  connected: 'CONNECTED',
  'awaiting response': 'AWAITING_RESPONSE',
  awaiting_response: 'AWAITING_RESPONSE',
  'follow up needed': 'FOLLOW_UP_NEEDED',
  follow_up_needed: 'FOLLOW_UP_NEEDED',
  // legacy terms
  new: 'NONE',
  'lead to pursue': 'NONE',
  lead_to_pursue: 'NONE',
  'warm lead': 'NONE',
  warm_lead: 'NONE',
  'on hold': 'NONE',
  on_hold: 'NONE',
  closed: 'NONE',
}

// Result of the server-side name-matching import (POST /contacts/import-match).
type ImportMatchAction = 'update' | 'create' | 'ambiguous' | 'skip'
interface ImportMatchResult {
  updated: number
  created: number
  ambiguous: { row: number; name: string; count: number }[]
  errors: { row: number; message: string }[]
  preview: { row: number; name: string; action: ImportMatchAction; matchedName?: string }[]
}

interface CsvImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportComplete: () => void
}

export function CsvImportDialog({
  open,
  onOpenChange,
  onImportComplete,
}: CsvImportDialogProps) {
  const [step, setStep] = useState<'upload' | 'map' | 'preview'>('upload')
  const [csvData, setCsvData] = useState<string[][]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [columnMap, setColumnMap] = useState<Record<number, string>>({})
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState<{ success: number; errors: string[] } | null>(null)
  // Enrichment mode: match CSV rows to existing contacts by name and merge (don't duplicate).
  const [updateExisting, setUpdateExisting] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [dryRun, setDryRun] = useState<ImportMatchResult | null>(null)
  const [matchResult, setMatchResult] = useState<ImportMatchResult | null>(null)

  const resetState = useCallback(() => {
    setStep('upload')
    setCsvData([])
    setHeaders([])
    setColumnMap({})
    setImportResults(null)
    setUpdateExisting(false)
    setAnalyzing(false)
    setDryRun(null)
    setMatchResult(null)
  }, [])

  function handleClose() {
    resetState()
    onOpenChange(false)
  }

  function parseCSV(text: string): string[][] {
    const rows: string[][] = []
    let currentRow: string[] = []
    let currentCell = ''
    let inQuotes = false

    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      const nextChar = text[i + 1]

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          currentCell += '"'
          i++ // Skip next quote
        } else if (char === '"') {
          inQuotes = false
        } else {
          currentCell += char
        }
      } else {
        if (char === '"') {
          inQuotes = true
        } else if (char === ',') {
          currentRow.push(currentCell.trim())
          currentCell = ''
        } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
          currentRow.push(currentCell.trim())
          if (currentRow.some((c) => c)) rows.push(currentRow)
          currentRow = []
          currentCell = ''
          if (char === '\r') i++ // Skip \n in \r\n
        } else if (char !== '\r') {
          currentCell += char
        }
      }
    }

    // Handle last cell/row
    currentRow.push(currentCell.trim())
    if (currentRow.some((c) => c)) rows.push(currentRow)

    return rows
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const rows = parseCSV(text)
      if (rows.length < 2) {
        toast.error('CSV must have at least a header row and one data row')
        return
      }

      const headerRow = rows[0]
      const dataRows = rows.slice(1)

      setHeaders(headerRow)
      setCsvData(dataRows)

      // Auto-map columns based on header names using aliases
      const autoMap: Record<number, string> = {}
      headerRow.forEach((header, idx) => {
        const h = header.toLowerCase().trim()
        // First check aliases
        if (HEADER_ALIASES[h]) {
          autoMap[idx] = HEADER_ALIASES[h]
          return
        }
        // Then try matching against field values/labels
        const match = IMPORTABLE_FIELDS.find((f) => {
          const fieldName = f.value.toLowerCase()
          const labelName = f.label.toLowerCase().replace(' (full)', '')
          return (
            h === fieldName ||
            h === labelName ||
            h.includes(fieldName) ||
            fieldName.includes(h)
          )
        })
        if (match && match.value !== 'skip') {
          autoMap[idx] = match.value
        }
      })
      setColumnMap(autoMap)
      setStep('map')
    }
    reader.readAsText(file)
  }

  function handleMapChange(columnIndex: number, fieldValue: string) {
    setColumnMap((prev) => {
      const next = { ...prev }
      if (fieldValue === 'skip') {
        delete next[columnIndex]
      } else {
        next[columnIndex] = fieldValue
      }
      return next
    })
  }

  function getPreviewData(): Partial<Contact>[] {
    return csvData.slice(0, 5).map((row) => {
      const rawData: Record<string, string> = {}
      Object.entries(columnMap).forEach(([colIdx, field]) => {
        const value = row[parseInt(colIdx)] ?? ''
        if (value) {
          rawData[field] = value
        }
      })

      const contact: Record<string, string> = {}

      // Handle name: combine firstName + lastName if no full name
      if (rawData.name) {
        contact.name = rawData.name
      } else if (rawData.firstName || rawData.lastName) {
        const parts = [rawData.firstName, rawData.lastName].filter(Boolean)
        contact.name = parts.join(' ')
      }

      // Handle ecosystem and status
      if (rawData.ecosystem) {
        contact.ecosystem = ECOSYSTEM_MAP[rawData.ecosystem.toLowerCase()] || 'NETWORK'
      }
      if (rawData.status) {
        contact.status = STATUS_MAP[rawData.status.toLowerCase()] || 'CONNECTED'
      }

      // Copy other fields
      if (rawData.title) contact.title = rawData.title
      if (rawData.companyName) contact.companyName = rawData.companyName
      if (rawData.linkedinUrl) contact.linkedinUrl = rawData.linkedinUrl
      if (rawData.email) contact.email = rawData.email

      return contact as Partial<Contact>
    })
  }

  // Build the mapped, server-ready row object for the enrichment endpoint. Only includes
  // fields actually present in the CSV (the server applies defaults for created contacts).
  function buildRowData(row: string[]): Record<string, string> {
    const rawData: Record<string, string> = {}
    Object.entries(columnMap).forEach(([colIdx, field]) => {
      const value = row[parseInt(colIdx)]?.trim() ?? ''
      if (value) rawData[field] = value
    })

    const out: Record<string, string> = {}
    if (rawData.name) {
      out.name = rawData.name
    } else if (rawData.firstName || rawData.lastName) {
      out.name = [rawData.firstName, rawData.lastName].filter(Boolean).join(' ')
    }
    if (rawData.phone && rawData.mobile) out.phone = `${rawData.phone} / ${rawData.mobile}`
    else if (rawData.phone) out.phone = rawData.phone
    else if (rawData.mobile) out.phone = rawData.mobile
    if (rawData.ecosystem) out.ecosystem = ECOSYSTEM_MAP[rawData.ecosystem.toLowerCase()] || 'NETWORK'
    if (rawData.status) out.status = STATUS_MAP[rawData.status.toLowerCase()] || 'CONNECTED'

    const passthrough = [
      'title', 'roleDescription', 'email', 'companyName', 'linkedinUrl', 'location',
      'howConnected', 'mutualConnections', 'whereFound', 'openQuestions', 'notes',
      'personalDetails', 'linkUrl',
    ]
    for (const f of passthrough) {
      if (rawData[f]) out[f] = rawData[f]
    }
    return out
  }

  // Moving from "map" → "preview": in enrichment mode, ask the server to classify every
  // row (a dry run that writes nothing) so the preview shows real update/create/skip counts.
  async function handleGoToPreview() {
    if (updateExisting) {
      setAnalyzing(true)
      try {
        const rows = csvData.map(buildRowData)
        const res = await api.post<ImportMatchResult>('/contacts/import-match', {
          rows,
          createUnmatched: true,
          dryRun: true,
        })
        setDryRun(res)
      } catch {
        toast.error('Could not analyze the import. Is the server running?')
        setAnalyzing(false)
        return
      }
      setAnalyzing(false)
    }
    setStep('preview')
  }

  const hasNameMapping = Object.values(columnMap).includes('name') ||
    (Object.values(columnMap).includes('firstName') || Object.values(columnMap).includes('lastName'))

  async function handleImport() {
    if (!hasNameMapping) {
      toast.error('You must map a column to "Name" or "First Name"/"Last Name"')
      return
    }

    // Enrichment mode: hand the whole batch to the server, which matches by name,
    // merges emails into existing contacts (no clobbering), and creates the rest.
    if (updateExisting) {
      setImporting(true)
      try {
        const rows = csvData.map(buildRowData)
        const res = await api.post<ImportMatchResult>('/contacts/import-match', {
          rows,
          createUnmatched: true,
          dryRun: false,
        })
        setMatchResult(res)
        setImportResults({
          success: res.updated + res.created,
          errors: res.errors.map((e) => `Row ${e.row}: ${e.message}`),
        })
        if (res.updated + res.created > 0) {
          toast.success(`Updated ${res.updated}, created ${res.created}`)
          onImportComplete()
        } else {
          toast.info('No contacts were added or changed')
        }
      } catch {
        toast.error('Import failed. Is the server running?')
      }
      setImporting(false)
      return
    }

    setImporting(true)
    const results = { success: 0, errors: [] as string[] }

    // Cache for company lookups/creations to avoid duplicates
    const companyCache: Record<string, number> = {}

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i]
      const rawData: Record<string, string> = {}

      // First pass: collect all raw values
      Object.entries(columnMap).forEach(([colIdx, field]) => {
        const value = row[parseInt(colIdx)]?.trim() ?? ''
        if (value) {
          rawData[field] = value
        }
      })

      // Build the contact object
      const contact: Record<string, string | number | null> = {
        ecosystem: 'NETWORK',
        status: 'CONNECTED',
      }

      // Handle name: combine firstName + lastName if no full name
      if (rawData.name) {
        contact.name = rawData.name
      } else if (rawData.firstName || rawData.lastName) {
        const parts = [rawData.firstName, rawData.lastName].filter(Boolean)
        contact.name = parts.join(' ')
      }

      if (!contact.name) {
        results.errors.push(`Row ${i + 2}: Missing name`)
        continue
      }

      // Handle phone: combine phone and mobile
      if (rawData.phone && rawData.mobile) {
        contact.phone = `${rawData.phone} / ${rawData.mobile}`
      } else if (rawData.phone) {
        contact.phone = rawData.phone
      } else if (rawData.mobile) {
        contact.phone = rawData.mobile
      }

      // Handle ecosystem and status
      if (rawData.ecosystem) {
        contact.ecosystem = ECOSYSTEM_MAP[rawData.ecosystem.toLowerCase()] || 'NETWORK'
      }
      if (rawData.status) {
        contact.status = STATUS_MAP[rawData.status.toLowerCase()] || 'CONNECTED'
      }

      // Copy simple fields
      if (rawData.title) contact.title = rawData.title
      if (rawData.roleDescription) contact.roleDescription = rawData.roleDescription
      if (rawData.email) contact.email = rawData.email
      if (rawData.linkedinUrl) contact.linkedinUrl = rawData.linkedinUrl
      if (rawData.location) contact.location = rawData.location
      if (rawData.howConnected) contact.howConnected = rawData.howConnected
      if (rawData.mutualConnections) contact.mutualConnections = rawData.mutualConnections
      if (rawData.whereFound) contact.whereFound = rawData.whereFound
      if (rawData.openQuestions) contact.openQuestions = rawData.openQuestions
      if (rawData.notes) contact.notes = rawData.notes
      if (rawData.personalDetails) contact.personalDetails = rawData.personalDetails

      // Handle company: look up or create
      if (rawData.companyName) {
        const companyNameLower = rawData.companyName.toLowerCase()
        if (companyCache[companyNameLower]) {
          contact.companyId = companyCache[companyNameLower]
        } else {
          try {
            // Try to find existing company
            const companies = await api.get<{ id: number; name: string }[]>('/companies')
            const existing = companies.find(
              (c) => c.name.toLowerCase() === companyNameLower
            )
            if (existing) {
              companyCache[companyNameLower] = existing.id
              contact.companyId = existing.id
            } else {
              // Create new company
              const newCompany = await api.post<{ id: number }>('/companies', {
                name: rawData.companyName,
                status: 'RESEARCHING',
              })
              companyCache[companyNameLower] = newCompany.id
              contact.companyId = newCompany.id
            }
          } catch {
            // Fall back to just storing the name
            contact.companyName = rawData.companyName
          }
        }
      }

      try {
        const createdContact = await api.post<{ id: number }>('/contacts', contact)

        // Create link if provided
        if (rawData.linkUrl) {
          try {
            await api.post('/links', {
              url: rawData.linkUrl,
              title: rawData.linkUrl,
              contactId: createdContact.id,
            })
          } catch {
            // Link creation failed, but contact was created
          }
        }

        results.success++
      } catch (err) {
        results.errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'Failed to import'}`)
      }
    }

    setImportResults(results)
    setImporting(false)

    if (results.success > 0) {
      toast.success(`Imported ${results.success} contacts`)
      onImportComplete()
    }
    if (results.errors.length > 0) {
      toast.error(`${results.errors.length} rows failed`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Contacts from CSV</DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Upload a CSV file with contact information.'}
            {step === 'map' && 'Map CSV columns to contact fields.'}
            {step === 'preview' && 'Review and confirm the import.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4 py-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                Upload a CSV file with contact data
              </p>
              <Label htmlFor="csv-upload" className="cursor-pointer">
                <Input
                  id="csv-upload"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Button variant="outline" className="mt-4" asChild>
                  <span>
                    <Upload className="mr-2 h-4 w-4" />
                    Choose File
                  </span>
                </Button>
              </Label>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Expected format: CSV with headers in the first row.</p>
              <p>Required field: Name</p>
              <p>Optional fields: Title, Company, Email, Phone, LinkedIn, Location, etc.</p>
            </div>
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Found {csvData.length} rows. Map each column to a contact field:
            </p>
            <div className="border rounded-md max-h-[300px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">CSV Column</TableHead>
                    <TableHead className="w-[200px]">Map To Field</TableHead>
                    <TableHead>Sample Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {headers.map((header, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{header || `Column ${idx + 1}`}</TableCell>
                      <TableCell>
                        <Select
                          value={columnMap[idx] || 'skip'}
                          onValueChange={(v) => handleMapChange(idx, v)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {IMPORTABLE_FIELDS.map((f) => (
                              <SelectItem key={f.value} value={f.value}>
                                {f.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-muted-foreground truncate max-w-[200px]">
                        {csvData[0]?.[idx] || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-start gap-3 rounded-md border p-3">
              <Checkbox
                id="update-existing"
                checked={updateExisting}
                onCheckedChange={(v) => setUpdateExisting(v === true)}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <Label htmlFor="update-existing" className="cursor-pointer">
                  Update existing contacts (match by name)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Adds the email to a contact that already exists (matched by name), instead of
                  creating a duplicate — without changing any of their other details. Names not
                  found are added as new contacts (General Network).
                </p>
              </div>
            </div>
            {!hasNameMapping && (
              <div className="flex items-center gap-2 text-amber-600 text-sm">
                <AlertCircle className="h-4 w-4" />
                You must map a column to "Name" or "First Name"/"Last Name" to continue.
              </div>
            )}
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4 py-4">
            {importResults ? (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="font-medium">Import Complete</p>
                  {matchResult ? (
                    <p className="text-sm text-muted-foreground mt-1">
                      {matchResult.updated} existing contact{matchResult.updated === 1 ? '' : 's'} updated,
                      {' '}{matchResult.created} created.
                      {matchResult.ambiguous.length > 0 &&
                        ` ${matchResult.ambiguous.length} skipped (duplicate name in your contacts).`}
                      {matchResult.errors.length > 0 && ` ${matchResult.errors.length} rows failed.`}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">
                      {importResults.success} contacts imported successfully.
                      {importResults.errors.length > 0 && ` ${importResults.errors.length} rows failed.`}
                    </p>
                  )}
                </div>
                {importResults.errors.length > 0 && (
                  <div className="border rounded-md p-3 max-h-[200px] overflow-auto">
                    <p className="text-sm font-medium text-destructive mb-2">Errors:</p>
                    <ul className="text-xs space-y-1">
                      {importResults.errors.slice(0, 20).map((err, i) => (
                        <li key={i} className="text-muted-foreground">{err}</li>
                      ))}
                      {importResults.errors.length > 20 && (
                        <li className="text-muted-foreground">
                          ...and {importResults.errors.length - 20} more
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            ) : updateExisting && dryRun ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Matched {csvData.length} rows against your existing contacts:
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-md border p-3 text-center">
                    <div className="text-2xl font-semibold">
                      {dryRun.preview.filter((p) => p.action === 'update').length}
                    </div>
                    <div className="text-xs text-muted-foreground">Add email to existing</div>
                  </div>
                  <div className="rounded-md border p-3 text-center">
                    <div className="text-2xl font-semibold">
                      {dryRun.preview.filter((p) => p.action === 'create').length}
                    </div>
                    <div className="text-xs text-muted-foreground">Create new</div>
                  </div>
                  <div className="rounded-md border p-3 text-center">
                    <div className="text-2xl font-semibold">
                      {dryRun.preview.filter((p) => p.action === 'skip').length}
                    </div>
                    <div className="text-xs text-muted-foreground">No change / skipped</div>
                  </div>
                </div>
                {dryRun.ambiguous.length > 0 && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-700">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">
                        {dryRun.ambiguous.length} name{dryRun.ambiguous.length === 1 ? '' : 's'} skipped (more than one
                        contact has that name — resolve by hand):
                      </p>
                      <p className="text-xs mt-1">
                        {dryRun.ambiguous.map((a) => a.name).join(', ')}
                      </p>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Existing contacts keep their ecosystem, status, and every other field — only the
                  email is added.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Preview of first {Math.min(5, csvData.length)} contacts to import:
                </p>
                <div className="border rounded-md max-h-[300px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Ecosystem</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getPreviewData().map((contact, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{contact.name || '—'}</TableCell>
                          <TableCell>{contact.title || '—'}</TableCell>
                          <TableCell>{contact.companyName || '—'}</TableCell>
                          <TableCell>{contact.ecosystem || 'NETWORK'}</TableCell>
                          <TableCell>{contact.status || 'CONNECTED'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-sm text-muted-foreground">
                  Ready to import {csvData.length} contacts.
                </p>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'upload' && (
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}
          {step === 'map' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button onClick={handleGoToPreview} disabled={!hasNameMapping || analyzing}>
                {analyzing ? 'Analyzing…' : 'Preview'}
              </Button>
            </>
          )}
          {step === 'preview' && !importResults && (
            <>
              <Button variant="outline" onClick={() => setStep('map')}>
                Back
              </Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing
                  ? 'Importing...'
                  : updateExisting && dryRun
                    ? `Apply (${dryRun.preview.filter((p) => p.action === 'update').length} update, ${dryRun.preview.filter((p) => p.action === 'create').length} new)`
                    : `Import ${csvData.length} Contacts`}
              </Button>
            </>
          )}
          {step === 'preview' && importResults && (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
