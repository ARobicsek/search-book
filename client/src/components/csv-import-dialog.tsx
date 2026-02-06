import { useState, useCallback } from 'react'
import { api } from '@/lib/api'
import type { Contact } from '@/lib/types'
import { Button } from '@/components/ui/button'
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

// Valid ecosystem values
const ECOSYSTEM_MAP: Record<string, string> = {
  recruiter: 'RECRUITER',
  rolodex: 'ROLODEX',
  target: 'TARGET',
  influencer: 'INFLUENCER',
  academia: 'ACADEMIA',
  'intro source': 'INTRO_SOURCE',
  intro_source: 'INTRO_SOURCE',
}

// Valid status values
const STATUS_MAP: Record<string, string> = {
  new: 'NEW',
  researching: 'RESEARCHING',
  research: 'RESEARCHING',
  connected: 'CONNECTED',
  'awaiting response': 'AWAITING_RESPONSE',
  awaiting_response: 'AWAITING_RESPONSE',
  'follow up needed': 'FOLLOW_UP_NEEDED',
  follow_up_needed: 'FOLLOW_UP_NEEDED',
  'lead to pursue': 'LEAD_TO_PURSUE',
  lead_to_pursue: 'LEAD_TO_PURSUE',
  'warm lead': 'LEAD_TO_PURSUE', // backwards compatibility
  warm_lead: 'LEAD_TO_PURSUE', // backwards compatibility
  'on hold': 'ON_HOLD',
  on_hold: 'ON_HOLD',
  closed: 'CLOSED',
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

  const resetState = useCallback(() => {
    setStep('upload')
    setCsvData([])
    setHeaders([])
    setColumnMap({})
    setImportResults(null)
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
        contact.ecosystem = ECOSYSTEM_MAP[rawData.ecosystem.toLowerCase()] || 'ROLODEX'
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

  const hasNameMapping = Object.values(columnMap).includes('name') ||
    (Object.values(columnMap).includes('firstName') || Object.values(columnMap).includes('lastName'))

  async function handleImport() {
    if (!hasNameMapping) {
      toast.error('You must map a column to "Name" or "First Name"/"Last Name"')
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
        ecosystem: 'ROLODEX',
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
        contact.ecosystem = ECOSYSTEM_MAP[rawData.ecosystem.toLowerCase()] || 'ROLODEX'
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
                  <p className="text-sm text-muted-foreground mt-1">
                    {importResults.success} contacts imported successfully.
                    {importResults.errors.length > 0 && ` ${importResults.errors.length} rows failed.`}
                  </p>
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
                          <TableCell>{contact.ecosystem || 'ROLODEX'}</TableCell>
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
              <Button onClick={() => setStep('preview')} disabled={!hasNameMapping}>
                Preview
              </Button>
            </>
          )}
          {step === 'preview' && !importResults && (
            <>
              <Button variant="outline" onClick={() => setStep('map')}>
                Back
              </Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing ? 'Importing...' : `Import ${csvData.length} Contacts`}
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
