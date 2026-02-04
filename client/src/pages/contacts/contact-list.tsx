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
  flexRender,
} from '@tanstack/react-table'
import { ArrowUpDown, Plus, Search, X, Download, Upload, Calendar } from 'lucide-react'
import { CsvImportDialog } from '@/components/csv-import-dialog'
import { api } from '@/lib/api'
import type { Contact, Ecosystem, ContactStatus } from '@/lib/types'
import { ECOSYSTEM_OPTIONS, CONTACT_STATUS_OPTIONS } from '@/lib/types'
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

function getCompanyDisplay(contact: Contact): string {
  if (contact.company) return contact.company.name
  if (contact.companyName) return contact.companyName
  return ''
}

const columns: ColumnDef<Contact>[] = [
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
    cell: ({ getValue }) => {
      const value = getValue() as string | null
      return (
        <span className="text-muted-foreground">{value ? formatDate(value) : '—'}</span>
      )
    },
  },
]

export function ContactListPage() {
  const navigate = useNavigate()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [ecosystemFilter, setEcosystemFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [lastOutreachFrom, setLastOutreachFrom] = useState<string>('')
  const [lastOutreachTo, setLastOutreachTo] = useState<string>('')
  const [includeNoOutreach, setIncludeNoOutreach] = useState(true)
  const [importDialogOpen, setImportDialogOpen] = useState(false)

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

  // Apply ecosystem and status filters
  const filteredData = useMemo(() => {
    let data = contacts
    if (ecosystemFilter !== 'all') {
      data = data.filter((c) => c.ecosystem === ecosystemFilter)
    }
    if (statusFilter !== 'all') {
      data = data.filter((c) => c.status === statusFilter)
    }
    return data
  }, [contacts, ecosystemFilter, statusFilter])

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const search = filterValue.toLowerCase()
      const contact = row.original
      // Search across multiple fields
      return (
        contact.name.toLowerCase().includes(search) ||
        (contact.title?.toLowerCase().includes(search) ?? false) ||
        (contact.company?.name.toLowerCase().includes(search) ?? false) ||
        (contact.companyName?.toLowerCase().includes(search) ?? false) ||
        (contact.location?.toLowerCase().includes(search) ?? false) ||
        (contact.notes?.toLowerCase().includes(search) ?? false) ||
        (contact.openQuestions?.toLowerCase().includes(search) ?? false) ||
        (contact.roleDescription?.toLowerCase().includes(search) ?? false)
      )
    },
  })

  const hasDateFilter = lastOutreachFrom || lastOutreachTo
  const hasFilters = globalFilter || ecosystemFilter !== 'all' || statusFilter !== 'all' || hasDateFilter

  function clearFilters() {
    setGlobalFilter('')
    setEcosystemFilter('all')
    setStatusFilter('all')
    setLastOutreachFrom('')
    setLastOutreachTo('')
    setIncludeNoOutreach(true)
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? '' : `${table.getFilteredRowModel().rows.length} of ${contacts.length} contact${contacts.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          <Button variant="outline" onClick={exportToCsv}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button asChild>
            <Link to="/contacts/new">
              <Plus className="mr-2 h-4 w-4" />
              New Contact
            </Link>
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, title, company, notes..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={ecosystemFilter} onValueChange={setEcosystemFilter}>
          <SelectTrigger className="w-[150px]">
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
          <SelectTrigger className="w-[150px]">
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
            <Button variant="outline" className={hasDateFilter ? 'border-primary' : ''}>
              <Calendar className="mr-2 h-4 w-4" />
              {hasDateFilter
                ? `${lastOutreachFrom || '...'} to ${lastOutreachTo || '...'}`
                : 'Last Outreach'}
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
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

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
    </div>
  )
}
