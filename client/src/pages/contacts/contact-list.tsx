import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  flexRender,
} from '@tanstack/react-table'
import { useIsMobile } from '@/hooks/use-mobile'
import { ArrowUpDown, Plus, Search, X, Download, Upload, Calendar, Flag } from 'lucide-react'
import { CsvImportDialog } from '@/components/csv-import-dialog'
import { api } from '@/lib/api'
import type { Contact, Ecosystem, ContactStatus, DatePrecision } from '@/lib/types'
import { ECOSYSTEM_OPTIONS, CONTACT_STATUS_OPTIONS, ACTION_TYPE_OPTIONS, ACTION_PRIORITY_OPTIONS } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const ecosystemColors: Record<Ecosystem, string> = {
  RECRUITER: 'bg-blue-100 text-blue-800',
  ROLODEX: 'bg-purple-100 text-purple-800',
  TARGET: 'bg-green-100 text-green-800',
  INFLUENCER: 'bg-amber-100 text-amber-800',
  ACADEMIA: 'bg-rose-100 text-rose-800',
  INTRO_SOURCE: 'bg-cyan-100 text-cyan-800',
}

const statusColors: Record<ContactStatus, string> = {
  NEW: 'bg-slate-100 text-slate-700',
  CONNECTED: 'bg-green-100 text-green-700',
  AWAITING_RESPONSE: 'bg-yellow-100 text-yellow-700',
  FOLLOW_UP_NEEDED: 'bg-orange-100 text-orange-700',
  WARM_LEAD: 'bg-emerald-100 text-emerald-700',
  ON_HOLD: 'bg-gray-100 text-gray-500',
  CLOSED: 'bg-red-100 text-red-700',
}

function getLabel(value: string, options: { value: string; label: string }[]) {
  return options.find((o) => o.value === value)?.label ?? value
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateWithPrecision(dateStr: string, precision: DatePrecision | null | undefined) {
  const d = new Date(dateStr + 'T00:00:00')
  switch (precision) {
    case 'DAY':
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    case 'MONTH':
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    case 'QUARTER': {
      const q = Math.ceil((d.getMonth() + 1) / 3)
      return `Q${q} ${d.getFullYear()}`
    }
    case 'YEAR':
      return d.getFullYear().toString()
    default:
      // Fallback to DAY format if precision not specified
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
}

function getCompanyDisplay(contact: Contact): string {
  if (contact.company) return contact.company.name
  if (contact.companyName) return contact.companyName
  return ''
}

// Get all company IDs (including past) from additionalCompanyIds
function getAllCompanyIds(contact: Contact): number[] {
  const ids: number[] = []
  if (contact.additionalCompanyIds) {
    try {
      const parsed = JSON.parse(contact.additionalCompanyIds)
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === 'object' && item !== null && 'id' in item) {
            ids.push(item.id)
          } else if (typeof item === 'number') {
            ids.push(item)
          }
        }
      }
    } catch { /* ignore */ }
  }
  return ids
}

function buildColumns(onToggleFlag: (contact: Contact) => void): ColumnDef<Contact>[] {
  return [
  {
    id: 'flag',
    header: () => <Flag className="h-4 w-4 text-muted-foreground" />,
    cell: ({ row }) => (
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleFlag(row.original)
        }}
        className="flex items-center justify-center"
      >
        <Flag
          className={`h-4 w-4 ${
            row.original.flagged
              ? 'fill-amber-500 text-amber-500'
              : 'text-muted-foreground/30 hover:text-amber-400'
          }`}
        />
      </button>
    ),
    size: 40,
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <Button
        variant="ghost"
        className="-ml-4"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Name
        <ArrowUpDown className="ml-1 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <Link
        to={`/contacts/${row.original.id}`}
        className="font-medium text-foreground hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: 'title',
    header: ({ column }) => (
      <Button
        variant="ghost"
        className="-ml-4"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Title
        <ArrowUpDown className="ml-1 h-4 w-4" />
      </Button>
    ),
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{(getValue() as string) ?? '—'}</span>
    ),
  },
  {
    id: 'company',
    accessorFn: (row) => getCompanyDisplay(row),
    header: ({ column }) => (
      <Button
        variant="ghost"
        className="-ml-4"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Company
        <ArrowUpDown className="ml-1 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const contact = row.original
      if (contact.company) {
        return (
          <Link
            to={`/companies/${contact.company.id}`}
            className="hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {contact.company.name}
          </Link>
        )
      }
      return <span className="text-muted-foreground">{contact.companyName ?? '—'}</span>
    },
  },
  {
    accessorKey: 'ecosystem',
    header: ({ column }) => (
      <Button
        variant="ghost"
        className="-ml-4"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Ecosystem
        <ArrowUpDown className="ml-1 h-4 w-4" />
      </Button>
    ),
    cell: ({ getValue }) => {
      const value = getValue() as Ecosystem
      return (
        <Badge variant="outline" className={ecosystemColors[value]}>
          {getLabel(value, ECOSYSTEM_OPTIONS)}
        </Badge>
      )
    },
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <Button
        variant="ghost"
        className="-ml-4"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Status
        <ArrowUpDown className="ml-1 h-4 w-4" />
      </Button>
    ),
    cell: ({ getValue }) => {
      const value = getValue() as ContactStatus
      return (
        <Badge variant="outline" className={statusColors[value]}>
          {getLabel(value, CONTACT_STATUS_OPTIONS)}
        </Badge>
      )
    },
  },
  {
    accessorKey: 'location',
    header: ({ column }) => (
      <Button
        variant="ghost"
        className="-ml-4"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Location
        <ArrowUpDown className="ml-1 h-4 w-4" />
      </Button>
    ),
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{(getValue() as string) ?? '—'}</span>
    ),
  },
  {
    accessorKey: 'updatedAt',
    header: ({ column }) => (
      <Button
        variant="ghost"
        className="-ml-4"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Updated
        <ArrowUpDown className="ml-1 h-4 w-4" />
      </Button>
    ),
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{formatDate(getValue() as string)}</span>
    ),
  },
  {
    accessorKey: 'lastOutreachDate',
    header: ({ column }) => (
      <Button
        variant="ghost"
        className="-ml-4"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Last Outreach
        <ArrowUpDown className="ml-1 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const date = row.original.lastOutreachDate
      const precision = row.original.lastOutreachDatePrecision
      return (
        <span className="text-muted-foreground">
          {date ? formatDateWithPrecision(date, precision) : '—'}
        </span>
      )
    },
  },
]
}

export function ContactListPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [allCompanies, setAllCompanies] = useState<{ id: number; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'updatedAt', desc: true }])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [globalFilter, setGlobalFilter] = useState('')
  const [ecosystemFilter, setEcosystemFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [lastOutreachFrom, setLastOutreachFrom] = useState<string>('')
  const [lastOutreachTo, setLastOutreachTo] = useState<string>('')
  const [includeNoOutreach, setIncludeNoOutreach] = useState(true)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false)
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)
  const [batchForm, setBatchForm] = useState({
    title: '',
    type: 'FOLLOW_UP',
    priority: 'MEDIUM',
    dueDate: '',
  })
  const [batchSaving, setBatchSaving] = useState(false)

  // Load companies once for searching additional company names
  useEffect(() => {
    api.get<{ id: number; name: string }[]>('/companies')
      .then(setAllCompanies)
      .catch(() => {})
  }, [])

  async function toggleFlag(contact: Contact) {
    try {
      await api.patch(`/contacts/${contact.id}/flag`)
      setContacts((prev) =>
        prev.map((c) => (c.id === contact.id ? { ...c, flagged: !c.flagged } : c))
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to toggle flag'
      toast.error(message)
    }
  }

  async function clearAllFlags() {
    const flaggedContacts = contacts.filter((c) => c.flagged)
    try {
      await Promise.all(flaggedContacts.map((c) => api.patch(`/contacts/${c.id}/flag`)))
      setContacts((prev) => prev.map((c) => ({ ...c, flagged: false })))
      setShowFlaggedOnly(false)
      toast.success('Flags cleared')
    } catch {
      toast.error('Failed to clear flags')
    }
  }

  async function handleBatchAction() {
    const flaggedIds = contacts.filter((c) => c.flagged).map((c) => c.id)
    if (flaggedIds.length === 0) return
    setBatchSaving(true)
    try {
      await api.post('/contacts/batch-action', {
        contactIds: flaggedIds,
        actionData: batchForm,
      })
      toast.success(`Created ${flaggedIds.length} action${flaggedIds.length > 1 ? 's' : ''}`)
      setContacts((prev) => prev.map((c) => ({ ...c, flagged: false })))
      setBatchDialogOpen(false)
      setBatchForm({ title: '', type: 'FOLLOW_UP', priority: 'MEDIUM', dueDate: '' })
      setShowFlaggedOnly(false)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create batch actions'
      toast.error(message)
    } finally {
      setBatchSaving(false)
    }
  }

  const columns = useMemo(() => buildColumns(toggleFlag), [contacts])

  function loadContacts() {
    const params = new URLSearchParams()
    if (lastOutreachFrom) params.set('lastOutreachFrom', lastOutreachFrom)
    if (lastOutreachTo) params.set('lastOutreachTo', lastOutreachTo)
    if (!includeNoOutreach) params.set('includeNoOutreach', 'false')

    const url = params.toString() ? `/contacts?${params}` : '/contacts'
    api
      .get<Contact[]>(url)
      .then(setContacts)
      .catch((err) => toast.error(err.message || 'Failed to load contacts'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadContacts()
  }, [lastOutreachFrom, lastOutreachTo, includeNoOutreach])

  // Apply ecosystem, status, and flagged filters
  const filteredData = useMemo(() => {
    let data = contacts
    if (ecosystemFilter !== 'all') {
      data = data.filter((c) => c.ecosystem === ecosystemFilter)
    }
    if (statusFilter !== 'all') {
      data = data.filter((c) => c.status === statusFilter)
    }
    if (showFlaggedOnly) {
      data = data.filter((c) => c.flagged)
    }
    return data
  }, [contacts, ecosystemFilter, statusFilter, showFlaggedOnly])

  const flaggedCount = contacts.filter((c) => c.flagged).length

  // Hide columns on mobile for better readability
  useEffect(() => {
    setColumnVisibility({
      title: !isMobile,
      ecosystem: !isMobile,
      location: !isMobile,
      updatedAt: !isMobile,
      lastOutreachDate: !isMobile,
    })
  }, [isMobile])

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnFilters, globalFilter, columnVisibility },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const search = filterValue.toLowerCase()
      const contact = row.original
      // Get additional company names (including past companies)
      const additionalCompanyIds = getAllCompanyIds(contact)
      const additionalCompanyNames = additionalCompanyIds
        .map((id) => allCompanies.find((c) => c.id === id)?.name ?? '')
        .filter(Boolean)
      // Search across multiple fields
      return (
        contact.name.toLowerCase().includes(search) ||
        (contact.title?.toLowerCase().includes(search) ?? false) ||
        (contact.company?.name.toLowerCase().includes(search) ?? false) ||
        (contact.companyName?.toLowerCase().includes(search) ?? false) ||
        additionalCompanyNames.some((name) => name.toLowerCase().includes(search)) ||
        (contact.location?.toLowerCase().includes(search) ?? false) ||
        (contact.notes?.toLowerCase().includes(search) ?? false) ||
        (contact.openQuestions?.toLowerCase().includes(search) ?? false) ||
        (contact.roleDescription?.toLowerCase().includes(search) ?? false)
      )
    },
  })

  const hasDateFilter = lastOutreachFrom || lastOutreachTo
  const hasFilters = globalFilter || ecosystemFilter !== 'all' || statusFilter !== 'all' || hasDateFilter || showFlaggedOnly

  function clearFilters() {
    setGlobalFilter('')
    setEcosystemFilter('all')
    setStatusFilter('all')
    setLastOutreachFrom('')
    setLastOutreachTo('')
    setIncludeNoOutreach(true)
    setShowFlaggedOnly(false)
  }

  function exportToCsv() {
    const rows = table.getFilteredRowModel().rows.map((row) => row.original)
    if (rows.length === 0) {
      toast.error('No contacts to export')
      return
    }

    // CSV headers
    const headers = [
      'Name',
      'Title',
      'Role Description',
      'Company',
      'Ecosystem',
      'Status',
      'Email',
      'Phone',
      'LinkedIn',
      'Location',
      'How Connected',
      'Mutual Connections',
      'Where Found',
      'Open Questions',
      'Notes',
      'Personal Details',
      'Created',
      'Updated',
    ]

    // CSV rows
    const csvRows = rows.map((c) => [
      c.name,
      c.title ?? '',
      c.roleDescription ?? '',
      c.company?.name ?? c.companyName ?? '',
      getLabel(c.ecosystem, ECOSYSTEM_OPTIONS),
      getLabel(c.status, CONTACT_STATUS_OPTIONS),
      c.email ?? '',
      c.phone ?? '',
      c.linkedinUrl ?? '',
      c.location ?? '',
      c.howConnected ?? '',
      c.mutualConnections ?? '',
      c.whereFound ?? '',
      c.openQuestions ?? '',
      c.notes ?? '',
      c.personalDetails ?? '',
      new Date(c.createdAt).toLocaleDateString(),
      new Date(c.updatedAt).toLocaleDateString(),
    ])

    // Escape CSV values
    const escapeCell = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`
      }
      return val
    }

    const csvContent = [
      headers.join(','),
      ...csvRows.map((row) => row.map(escapeCell).join(',')),
    ].join('\n')

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `contacts-${new Date().toLocaleDateString('en-CA')}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${rows.length} contacts`)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? '' : `${table.getFilteredRowModel().rows.length} of ${contacts.length} contact${contacts.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)} className="flex-1 sm:flex-initial">
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          <Button variant="outline" size="sm" onClick={exportToCsv} className="flex-1 sm:flex-initial">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button asChild size="sm" className="flex-1 sm:flex-initial">
            <Link to="/contacts/new">
              <Plus className="mr-2 h-4 w-4" />
              New Contact
            </Link>
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 sm:flex-wrap sm:flex-row sm:items-center">
        <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, title, company..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={ecosystemFilter} onValueChange={setEcosystemFilter}>
            <SelectTrigger className="w-full min-w-[120px] sm:w-[150px]">
              <SelectValue placeholder="Ecosystem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Ecosystems</SelectItem>
              {ECOSYSTEM_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full min-w-[120px] sm:w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {CONTACT_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={`flex-1 sm:flex-initial ${hasDateFilter ? 'border-primary' : ''}`}>
                <Calendar className="mr-2 h-4 w-4" />
                <span className="truncate">
                  {hasDateFilter
                    ? `${lastOutreachFrom || '...'} - ${lastOutreachTo || '...'}`
                    : 'Outreach'}
                </span>
              </Button>
            </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="from-date">From</Label>
                <Input
                  id="from-date"
                  type="date"
                  value={lastOutreachFrom}
                  onChange={(e) => setLastOutreachFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="to-date">To</Label>
                <Input
                  id="to-date"
                  type="date"
                  value={lastOutreachTo}
                  onChange={(e) => setLastOutreachTo(e.target.value)}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-no-outreach"
                  checked={includeNoOutreach}
                  onCheckedChange={(checked) => setIncludeNoOutreach(checked === true)}
                />
                <Label htmlFor="include-no-outreach" className="text-sm font-normal">
                  Include never contacted
                </Label>
              </div>
              {hasDateFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setLastOutreachFrom('')
                    setLastOutreachTo('')
                  }}
                >
                  Clear dates
                </Button>
              )}
            </div>
          </PopoverContent>
          </Popover>
          <Button
            variant={showFlaggedOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowFlaggedOnly(!showFlaggedOnly)}
            className="flex-1 sm:flex-initial"
          >
            <Flag className="mr-2 h-4 w-4" />
            Flagged{flaggedCount > 0 ? ` (${flaggedCount})` : ''}
          </Button>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="mr-1 h-4 w-4" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Batch action toolbar */}
      {flaggedCount > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 sm:flex-row sm:items-center sm:gap-3 sm:px-4">
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 shrink-0 fill-amber-500 text-amber-500" />
            <span className="text-sm font-medium">
              {flaggedCount} contact{flaggedCount !== 1 ? 's' : ''} flagged
            </span>
          </div>
          <div className="flex flex-1 gap-2 sm:justify-end">
            <Button size="sm" variant="outline" onClick={clearAllFlags} className="flex-1 sm:flex-initial">
              Clear Flags
            </Button>
            <Button size="sm" onClick={() => setBatchDialogOpen(true)} className="flex-1 sm:flex-initial">
              Create Action
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No contacts yet.{' '}
                  <Link to="/contacts/new" className="text-primary hover:underline">
                    Add your first contact
                  </Link>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/contacts/${row.original.id}`)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CsvImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportComplete={loadContacts}
      />

      {/* Batch action dialog */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Create Action for {flaggedCount} Contact{flaggedCount !== 1 ? 's' : ''}</DialogTitle>
            <DialogDescription>
              This will create one action per flagged contact.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="batch-title">Title *</Label>
              <Input
                id="batch-title"
                value={batchForm.title}
                onChange={(e) => setBatchForm({ ...batchForm, title: e.target.value })}
                placeholder="e.g. Follow up"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={batchForm.type}
                  onValueChange={(v) => setBatchForm({ ...batchForm, type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={batchForm.priority}
                  onValueChange={(v) => setBatchForm({ ...batchForm, priority: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_PRIORITY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="batch-due">Due Date</Label>
              <Input
                id="batch-due"
                type="date"
                value={batchForm.dueDate}
                onChange={(e) => setBatchForm({ ...batchForm, dueDate: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBatchAction} disabled={batchSaving || !batchForm.title.trim()}>
              {batchSaving ? 'Creating...' : `Create ${flaggedCount} Action${flaggedCount !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
