import { useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { ECOSYSTEM_OPTIONS, type Contact } from '@/lib/types'
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
  { value: 'reportsTo', label: 'Reports To (manager)' },
]

// Column header aliases for auto-mapping. Keys are written naturally; they're matched
// case- and punctuation-insensitively via normalizeHeader (so "Reports To (1-up)",
// "reports_to", "REPORTS TO" all hit the "reports to 1 up" / "reports to" entries).
const HEADER_ALIASES: Record<string, string> = {
  // Name
  'name': 'name', 'full name': 'name', 'fullname': 'name', 'contact name': 'name',
  'contact': 'name', 'person': 'name', 'person name': 'name', 'display name': 'name',
  'first name': 'firstName', 'firstname': 'firstName', 'first': 'firstName',
  'given name': 'firstName', 'forename': 'firstName', 'fname': 'firstName',
  'last name': 'lastName', 'lastname': 'lastName', 'last': 'lastName',
  'surname': 'lastName', 'family name': 'lastName', 'lname': 'lastName',
  // Company / employer
  'company': 'companyName', 'company name': 'companyName', 'organization': 'companyName',
  'organisation': 'companyName', 'org': 'companyName', 'org name': 'companyName',
  'organization name': 'companyName', 'employer': 'companyName', 'current employer': 'companyName',
  'current company': 'companyName', 'workplace': 'companyName', 'firm': 'companyName',
  'business': 'companyName', 'account': 'companyName', 'account name': 'companyName',
  // Title / role
  'title': 'title', 'job title': 'title', 'role': 'title', 'position': 'title',
  'job': 'title', 'designation': 'title', 'current title': 'title', 'current role': 'title',
  'job role': 'title', 'current position': 'title',
  // Role description
  'role description': 'roleDescription', 'role desc': 'roleDescription',
  'role details': 'roleDescription', 'role summary': 'roleDescription',
  'responsibilities': 'roleDescription', 'description': 'roleDescription', 'desc': 'roleDescription',
  'job description': 'roleDescription', 'about': 'roleDescription', 'bio': 'roleDescription',
  'biography': 'roleDescription', 'professional summary': 'roleDescription',
  'profile summary': 'roleDescription', 'what they do': 'roleDescription',
  // Ecosystem
  'ecosystem': 'ecosystem', 'category': 'ecosystem', 'segment': 'ecosystem',
  'sector': 'ecosystem', 'vertical': 'ecosystem', 'classification': 'ecosystem',
  'contact type': 'ecosystem', 'ecosystem category': 'ecosystem',
  // Status
  'status': 'status', 'stage': 'status', 'contact status': 'status',
  'relationship status': 'status', 'lead status': 'status', 'pipeline stage': 'status',
  // Email
  'email': 'email', 'email address': 'email', 'e mail': 'email', 'e mail address': 'email',
  'mail': 'email', 'work email': 'email', 'business email': 'email', 'primary email': 'email',
  'personal email': 'email', 'contact email': 'email', 'email 1': 'email',
  // Phone / mobile
  'phone': 'phone', 'phone number': 'phone', 'telephone': 'phone', 'tel': 'phone',
  'work phone': 'phone', 'office phone': 'phone', 'business phone': 'phone',
  'direct line': 'phone', 'landline': 'phone', 'contact number': 'phone', 'phone 1': 'phone',
  'mobile': 'mobile', 'mobile phone': 'mobile', 'cell': 'mobile', 'cell phone': 'mobile',
  'cellphone': 'mobile', 'mobile number': 'mobile', 'cell number': 'mobile', 'personal phone': 'mobile',
  // LinkedIn
  'linkedin': 'linkedinUrl', 'linkedin url': 'linkedinUrl', 'linkedin profile': 'linkedinUrl',
  'linkedinurl': 'linkedinUrl', 'linkedin link': 'linkedinUrl', 'linkedin address': 'linkedinUrl',
  'li': 'linkedinUrl', 'profile url': 'linkedinUrl', 'linkedin com': 'linkedinUrl',
  // Location
  'location': 'location', 'city': 'location', 'address': 'location', 'region': 'location',
  'geography': 'location', 'geo': 'location', 'based in': 'location', 'based': 'location',
  'town': 'location', 'state': 'location', 'country': 'location', 'area': 'location',
  'metro': 'location', 'market': 'location', 'locale': 'location', 'city state': 'location',
  // Link / website
  'link': 'linkUrl', 'link url': 'linkUrl', 'website': 'linkUrl', 'web site': 'linkUrl',
  'website url': 'linkUrl', 'url': 'linkUrl', 'web': 'linkUrl', 'homepage': 'linkUrl',
  'home page': 'linkUrl', 'site': 'linkUrl', 'web address': 'linkUrl', 'personal website': 'linkUrl',
  'company website': 'linkUrl',
  // How connected
  'how connected': 'howConnected', 'how we connected': 'howConnected', 'how we met': 'howConnected',
  'how known': 'howConnected', 'how we know them': 'howConnected', 'how do we know them': 'howConnected',
  'connection context': 'howConnected', 'source of connection': 'howConnected',
  'introduced by': 'howConnected', 'introduction': 'howConnected', 'how introduced': 'howConnected',
  'relationship context': 'howConnected',
  // Mutual connections
  'mutual connections': 'mutualConnections', 'mutual connection': 'mutualConnections',
  'mutual': 'mutualConnections', 'mutuals': 'mutualConnections', 'mutual contacts': 'mutualConnections',
  'connections': 'mutualConnections', 'connection': 'mutualConnections',
  'connecting people': 'mutualConnections', 'connecting person': 'mutualConnections',
  'shared connections': 'mutualConnections', 'common connections': 'mutualConnections',
  'connections in common': 'mutualConnections', 'people in common': 'mutualConnections',
  'mutual friends': 'mutualConnections', 'connectors': 'mutualConnections',
  // Where found
  'where found': 'whereFound', 'where did you find': 'whereFound', 'where did we find': 'whereFound',
  'found via': 'whereFound', 'found through': 'whereFound', 'found at': 'whereFound',
  'found on': 'whereFound', 'source': 'whereFound', 'lead source': 'whereFound',
  'referral source': 'whereFound', 'sourced from': 'whereFound', 'discovered': 'whereFound',
  'origin': 'whereFound', 'where met': 'whereFound',
  // Open questions
  'open questions': 'openQuestions', 'open question': 'openQuestions', 'questions': 'openQuestions',
  'question': 'openQuestions', 'follow up questions': 'openQuestions', 'questions to ask': 'openQuestions',
  'to ask': 'openQuestions', 'things to ask': 'openQuestions', 'open items': 'openQuestions',
  'outstanding questions': 'openQuestions',
  // Personal details
  'personal details': 'personalDetails', 'personal': 'personalDetails', 'personal notes': 'personalDetails',
  'personal info': 'personalDetails', 'personal information': 'personalDetails', 'family': 'personalDetails',
  'family details': 'personalDetails', 'hobbies': 'personalDetails', 'interests': 'personalDetails',
  'personal background': 'personalDetails', 'personal life': 'personalDetails',
  // Notes
  'notes': 'notes', 'note': 'notes', 'comments': 'notes', 'comment': 'notes', 'remarks': 'notes',
  'remark': 'notes', 'details': 'notes', 'detail': 'notes', 'additional notes': 'notes',
  'additional info': 'notes', 'additional information': 'notes', 'misc': 'notes', 'memo': 'notes',
  'general notes': 'notes', 'observations': 'notes', 'free text': 'notes',
  // Reports-To relationship (the manager's name)
  'reports to': 'reportsTo', 'reports to 1 up': 'reportsTo', 'reports to 1up': 'reportsTo',
  'reportsto': 'reportsTo', 'reports to manager': 'reportsTo', 'reporting to': 'reportsTo',
  'reports into': 'reportsTo', 'manager': 'reportsTo', 'manager name': 'reportsTo',
  'direct manager': 'reportsTo', 'reporting manager': 'reportsTo', 'line manager': 'reportsTo',
  'supervisor': 'reportsTo', 'boss': 'reportsTo', '1 up': 'reportsTo',
}

// Normalize a CSV header so matching ignores case, punctuation and separators:
// "Reports To (1-up)" -> "reports to 1 up", "E-mail Address" -> "e mail address".
function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// Alias keys pre-normalized once, so lookups are a single normalized comparison.
const NORMALIZED_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries(HEADER_ALIASES).map(([k, v]) => [normalizeHeader(k), v]),
)

// Single-word field names too generic to safely infer from a substring (e.g. "name"
// appears in "Company Name"); these only map via an explicit alias or exact match.
const GENERIC_FIELD_WORDS = new Set(['name'])

// Pick the best field for a CSV header: explicit alias → exact value/label → a
// conservative fuzzy fallback that only commits when exactly ONE field qualifies
// (so ambiguous headers stay unmapped rather than mis-assigned). Returns '' for no match.
function autoMapField(header: string): string {
  const norm = normalizeHeader(header)
  if (!norm) return ''
  if (NORMALIZED_ALIASES[norm]) return NORMALIZED_ALIASES[norm]

  const words = new Set(norm.split(' '))
  const candidates = new Set<string>()
  for (const f of IMPORTABLE_FIELDS) {
    if (f.value === 'skip') continue
    for (const target of [normalizeHeader(f.value), normalizeHeader(f.label)]) {
      if (!target) continue
      if (norm === target) return f.value // exact value/label match wins outright
      const targetWords = target.split(' ')
      if (targetWords.length > 1) {
        // all words of a multi-word field name present, e.g. "role description" in
        // "current role description"
        if (targetWords.every((w) => words.has(w))) candidates.add(f.value)
      } else if (target.length > 3 && words.has(target) && !GENERIC_FIELD_WORDS.has(target)) {
        // a distinctive single-word field name present as a whole word, e.g. "phone"
        // in "office phone number"
        candidates.add(f.value)
      }
    }
  }
  return candidates.size === 1 ? [...candidates][0] : ''
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
  fieldsFilled: number
  fieldsFilledByName: Record<string, number>
  relationshipsCreated: number
  managersCreated: number
  managersCreatedNames: string[]
  relationshipsSkipped: { row: number; manager: string; reason: string }[]
  ambiguous: { row: number; name: string; count: number }[]
  errors: { row: number; message: string }[]
  preview: { row: number; name: string; action: ImportMatchAction; matchedName?: string; filled?: number }[]
}

// Friendly labels for the fill-blanks per-field breakdown in the dry-run preview.
const FILL_FIELD_LABEL: Record<string, string> = {
  title: 'Title',
  roleDescription: 'Role',
  phone: 'Phone',
  linkedinUrl: 'LinkedIn',
  location: 'Location',
  howConnected: 'How connected',
  mutualConnections: 'Mutual connections',
  whereFound: 'Where found',
  openQuestions: 'Open questions',
  notes: 'Notes',
  personalDetails: 'Personal details',
  company: 'Company',
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
  // Ecosystem assigned to any contacts this import creates (default General Network).
  const [newEcosystem, setNewEcosystem] = useState<string>('NETWORK')
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
    setNewEcosystem('NETWORK')
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

      // Auto-map columns by header name (aliases → exact → conservative fuzzy). Don't
      // map two columns to the same field — keep the first so a later generic header
      // (e.g. a second "Notes") doesn't clobber an earlier confident match.
      const autoMap: Record<number, string> = {}
      const usedFields = new Set<string>()
      headerRow.forEach((header, idx) => {
        const field = autoMapField(header)
        if (field && !usedFields.has(field)) {
          autoMap[idx] = field
          usedFields.add(field)
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
      'reportsTo', // not a Contact field — the server turns it into a REPORTS_TO relationship
    ]
    for (const f of passthrough) {
      if (rawData[f]) out[f] = rawData[f]
    }
    return out
  }

  // Moving from "map" → "preview": when using the match endpoint, ask the server to classify
  // every row (a dry run that writes nothing) so the preview shows real update/create/skip
  // counts plus how many reporting relationships and manager-contacts will be created.
  async function handleGoToPreview() {
    if (useMatchEndpoint) {
      setAnalyzing(true)
      try {
        const rows = csvData.map(buildRowData)
        const res = await api.post<ImportMatchResult>('/contacts/import-match', {
          rows,
          createUnmatched: true,
          dryRun: true,
          defaultEcosystem: newEcosystem,
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
  // A mapped "Reports To" column means we must de-duplicate by name (so the manager and
  // subject resolve to existing contacts, not duplicates) → always use the match endpoint.
  const hasReportsTo = Object.values(columnMap).includes('reportsTo')
  const useMatchEndpoint = updateExisting || hasReportsTo

  async function handleImport() {
    if (!hasNameMapping) {
      toast.error('You must map a column to "Name" or "First Name"/"Last Name"')
      return
    }

    // Match-by-name mode: hand the whole batch to the server, which matches by name,
    // merges emails into existing contacts (no clobbering), creates the rest, and (when a
    // "Reports To" column is mapped) wires up REPORTS_TO relationships.
    if (useMatchEndpoint) {
      setImporting(true)
      try {
        const rows = csvData.map(buildRowData)
        const res = await api.post<ImportMatchResult>('/contacts/import-match', {
          rows,
          createUnmatched: true,
          dryRun: false,
          defaultEcosystem: newEcosystem,
        })
        setMatchResult(res)
        const totalCreated = res.created + res.managersCreated
        const changed = res.updated + totalCreated + res.relationshipsCreated
        setImportResults({
          success: changed,
          errors: res.errors.map((e) => `Row ${e.row}: ${e.message}`),
        })
        if (changed > 0) {
          const parts = [`Enriched ${res.updated}`, `created ${totalCreated}`]
          if (res.fieldsFilled > 0) parts.push(`${res.fieldsFilled} blank field${res.fieldsFilled === 1 ? '' : 's'} filled`)
          if (res.relationshipsCreated > 0) parts.push(`${res.relationshipsCreated} relationship${res.relationshipsCreated === 1 ? '' : 's'}`)
          toast.success(parts.join(', '))
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
                  Enriches a contact that already exists (matched by name) instead of creating a
                  duplicate — fills in any <strong>blank</strong> fields (email, title, phone, etc.)
                  from the CSV but <strong>never overwrites</strong> details they already have.
                  Ecosystem and status are left unchanged. Names not found are added as new contacts.
                </p>
              </div>
            </div>
            {hasReportsTo && (
              <div className="flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <p className="font-medium">Reporting relationships will be imported.</p>
                  <p className="text-xs">
                    Each person will be linked with a "Reports To" relationship to their manager.
                    Names are matched to existing contacts (no duplicates); managers not yet on file
                    are added as new contacts. "Not found" or blank means no manager.
                  </p>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="new-ecosystem" className="cursor-pointer">Ecosystem for new contacts</Label>
                <p className="text-xs text-muted-foreground">
                  Applied to any contacts this import creates. Existing contacts are never changed.
                </p>
              </div>
              <Select value={newEcosystem} onValueChange={setNewEcosystem}>
                <SelectTrigger id="new-ecosystem" className="w-[180px] shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ECOSYSTEM_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                      {matchResult.updated} existing contact{matchResult.updated === 1 ? '' : 's'} enriched,
                      {' '}{matchResult.created + matchResult.managersCreated} created.
                      {matchResult.fieldsFilled > 0 &&
                        ` ${matchResult.fieldsFilled} blank field${matchResult.fieldsFilled === 1 ? '' : 's'} filled.`}
                      {matchResult.relationshipsCreated > 0 &&
                        ` ${matchResult.relationshipsCreated} reporting relationship${matchResult.relationshipsCreated === 1 ? '' : 's'} added.`}
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
            ) : useMatchEndpoint && dryRun ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Matched {csvData.length} rows against your existing contacts:
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-md border p-3 text-center">
                    <div className="text-2xl font-semibold">
                      {dryRun.preview.filter((p) => p.action === 'update').length}
                    </div>
                    <div className="text-xs text-muted-foreground">Enrich existing (fill blanks)</div>
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
                {dryRun.fieldsFilled > 0 && (
                  <div className="rounded-md border p-3 text-sm">
                    <p className="font-medium">
                      {dryRun.fieldsFilled} blank field{dryRun.fieldsFilled === 1 ? '' : 's'} will be filled
                      {' '}across {dryRun.preview.filter((p) => (p.filled ?? 0) > 0).length} contact
                      {dryRun.preview.filter((p) => (p.filled ?? 0) > 0).length === 1 ? '' : 's'}.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {Object.entries(dryRun.fieldsFilledByName)
                        .sort((a, b) => b[1] - a[1])
                        .map(([f, n]) => `${FILL_FIELD_LABEL[f] || f} ×${n}`)
                        .join(', ')}
                    </p>
                  </div>
                )}
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
                {hasReportsTo && (
                  <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                    <p className="font-medium">
                      {dryRun.relationshipsCreated} reporting relationship{dryRun.relationshipsCreated === 1 ? '' : 's'} will be created.
                    </p>
                    {dryRun.managersCreated > 0 && (
                      <p className="text-xs">
                        Includes {dryRun.managersCreated} new manager contact{dryRun.managersCreated === 1 ? '' : 's'} (named only in "Reports To"):{' '}
                        {dryRun.managersCreatedNames.join(', ')}
                      </p>
                    )}
                    {dryRun.relationshipsSkipped.length > 0 && (
                      <p className="text-xs">
                        {dryRun.relationshipsSkipped.length} relationship{dryRun.relationshipsSkipped.length === 1 ? '' : 's'} skipped
                        (ambiguous or self-referential manager):{' '}
                        {dryRun.relationshipsSkipped.map((s) => s.manager).join(', ')}
                      </p>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Existing contacts are enriched by filling <strong>blank</strong> fields only —
                  data they already have is never overwritten, and ecosystem and status are never
                  changed.
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
                  : useMatchEndpoint && dryRun
                    ? `Apply (${dryRun.preview.filter((p) => p.action === 'update').length} enrich, ${dryRun.preview.filter((p) => p.action === 'create').length} new${dryRun.relationshipsCreated > 0 ? `, ${dryRun.relationshipsCreated} rel` : ''})`
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
