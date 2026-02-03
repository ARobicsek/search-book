import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  flexRender,
} from '@tanstack/react-table'
import { ArrowUpDown, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import type { Company, CompanyStatus } from '@/lib/types'
import { COMPANY_STATUS_OPTIONS } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'

const statusColors: Record<CompanyStatus, string> = {
  RESEARCHING: 'bg-blue-100 text-blue-700',
  ACTIVE_TARGET: 'bg-green-100 text-green-700',
  CONNECTED: 'bg-emerald-100 text-emerald-700',
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

const columns: ColumnDef<Company>[] = [
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
        to={`/companies/${row.original.id}`}
        className="font-medium text-foreground hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: 'industry',
    header: ({ column }) => (
      <Button
        variant="ghost"
        className="-ml-4"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Industry
        <ArrowUpDown className="ml-1 h-4 w-4" />
      </Button>
    ),
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{(getValue() as string) ?? '—'}</span>
    ),
  },
  {
    accessorKey: 'size',
    header: ({ column }) => (
      <Button
        variant="ghost"
        className="-ml-4"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Size
        <ArrowUpDown className="ml-1 h-4 w-4" />
      </Button>
    ),
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{(getValue() as string) ?? '—'}</span>
    ),
  },
  {
    accessorKey: 'hqLocation',
    header: ({ column }) => (
      <Button
        variant="ghost"
        className="-ml-4"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        HQ Location
        <ArrowUpDown className="ml-1 h-4 w-4" />
      </Button>
    ),
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{(getValue() as string) ?? '—'}</span>
    ),
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
      const value = getValue() as CompanyStatus
      return (
        <Badge variant="outline" className={statusColors[value]}>
          {getLabel(value, COMPANY_STATUS_OPTIONS)}
        </Badge>
      )
    },
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
]

export function CompanyListPage() {
  const navigate = useNavigate()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [sorting, setSorting] = useState<SortingState>([])

  useEffect(() => {
    api
      .get<Company[]>('/companies')
      .then(setCompanies)
      .catch((err) => toast.error(err.message || 'Failed to load companies'))
      .finally(() => setLoading(false))
  }, [])

  const table = useReactTable({
    data: companies,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Companies</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? '' : `${companies.length} compan${companies.length !== 1 ? 'ies' : 'y'}`}
          </p>
        </div>
        <Button asChild>
          <Link to="/companies/new">
            <Plus className="mr-2 h-4 w-4" />
            New Company
          </Link>
        </Button>
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
                  No companies yet.{' '}
                  <Link to="/companies/new" className="text-primary hover:underline">
                    Add your first company
                  </Link>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/companies/${row.original.id}`)}
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
    </div>
  )
}
