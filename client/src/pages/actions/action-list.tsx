import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type ColumnDef,
  type SortingState,
  type FilterFn,
  type VisibilityState,
  flexRender,
} from '@tanstack/react-table'
import { ArrowUpDown, Plus, Check, Search } from 'lucide-react'
import { ActionDateSelect } from '@/components/action-date-select'
import { useIsMobile } from '@/hooks/use-mobile'
import { api } from '@/lib/api'
import type { Action, ActionType, ActionPriority } from '@/lib/types'
import { ACTION_TYPE_OPTIONS, ACTION_PRIORITY_OPTIONS } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'

type FilterStatus = 'all' | 'pending' | 'completed' | 'overdue'

const typeColors: Record<ActionType, string> = {
  EMAIL: 'bg-blue-100 text-blue-800',
  CALL: 'bg-green-100 text-green-800',
  MEET: 'bg-teal-100 text-teal-800',
  READ: 'bg-purple-100 text-purple-800',
  WRITE: 'bg-indigo-100 text-indigo-800',
  RESEARCH: 'bg-amber-100 text-amber-800',
  FOLLOW_UP: 'bg-orange-100 text-orange-800',
  INTRO: 'bg-cyan-100 text-cyan-800',
  OTHER: 'bg-slate-100 text-slate-700',
}

const priorityColors: Record<ActionPriority, string> = {
  HIGH: 'bg-red-100 text-red-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  LOW: 'bg-slate-100 text-slate-600',
}

function getLabel(value: string, options: { value: string; label: string }[]) {
  return options.find((o) => o.value === value)?.label ?? value
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function isOverdue(action: Action): boolean {
  if (action.completed || !action.dueDate) return false
  const today = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local timezone
  return action.dueDate < today
}

// Global filter function for searching across multiple fields
const globalFilterFn: FilterFn<Action> = (row, _columnId, filterValue: string) => {
  const search = filterValue.toLowerCase()
  const action = row.original

  // Search across title, description, contact names, company names
  const contactNames = action.actionContacts?.map((ac) => ac.contact.name) ?? []
  if (action.contact?.name) contactNames.push(action.contact.name)
  const companyNames = action.actionCompanies?.map((ac) => ac.company.name) ?? []
  if (action.company?.name) companyNames.push(action.company.name)

  const searchFields = [
    action.title,
    action.description,
    ...contactNames,
    ...companyNames,
  ]

  return searchFields.some((field) => field?.toLowerCase().includes(search))
}

export function ActionListPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [actions, setActions] = useState<Action[]>([])
  const [loading, setLoading] = useState(true)
  const [sorting, setSorting] = useState<SortingState>([])
  const [filter, setFilter] = useState<FilterStatus>('pending')
  const [globalFilter, setGlobalFilter] = useState('')
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  const fetchActions = useCallback(() => {
    const params = new URLSearchParams()
    if (filter !== 'all') params.set('status', filter)
    if (filter === 'completed') params.set('sortBy', 'completedDate')
    const qs = params.toString() ? `?${params}` : ''
    api
      .get<Action[]>(`/actions${qs}`)
      .then(setActions)
      .catch((err) => toast.error(err.message || 'Failed to load actions'))
      .finally(() => setLoading(false))
  }, [filter])

  useEffect(() => {
    setLoading(true)
    fetchActions()
  }, [fetchActions])

  const toggleComplete = async (e: React.MouseEvent, action: Action) => {
    e.stopPropagation()
    try {
      const result = await api.patch<{ action: Action; nextAction: Action | null }>(`/actions/${action.id}/complete`)
      fetchActions()
      toast.success(action.completed ? 'Marked incomplete' : 'Marked complete')
      if (result.nextAction?.dueDate) {
        toast.info(`Next occurrence created for ${result.nextAction.dueDate}`)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update action'
      toast.error(message)
    }
  }

  const columns: ColumnDef<Action>[] = [
    {
      id: 'complete',
      header: () => <span className="sr-only">Complete</span>,
      cell: ({ row }) => (
        <button
          onClick={(e) => toggleComplete(e, row.original)}
          className={`flex h-11 w-11 sm:h-5 sm:w-5 items-center justify-center rounded-lg sm:rounded border transition-colors ${row.original.completed
            ? 'border-green-500 bg-green-500 text-white'
            : 'border-muted-foreground/30 hover:border-green-500'
            }`}
        >
          {row.original.completed && <Check className="h-5 w-5 sm:h-3 sm:w-3" />}
        </button>
      ),
      size: 40,
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
      cell: ({ row }) => (
        <Link
          to={`/actions/${row.original.id}`}
          className={`font-medium hover:underline ${row.original.completed ? 'text-muted-foreground line-through' : 'text-foreground'
            }`}
        >
          {row.original.title}
        </Link>
      ),
    },
    {
      accessorKey: 'type',
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="-ml-4"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Type
          <ArrowUpDown className="ml-1 h-4 w-4" />
        </Button>
      ),
      cell: ({ getValue }) => {
        const value = getValue() as ActionType
        return (
          <Badge variant="outline" className={typeColors[value]}>
            {getLabel(value, ACTION_TYPE_OPTIONS)}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'dueDate',
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="-ml-4"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Due Date
          <ArrowUpDown className="ml-1 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ActionDateSelect
            action={row.original}
            onUpdate={fetchActions}
            className="-ml-2 h-8"
          />
        </div>
      ),
    },
    {
      accessorKey: 'priority',
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="-ml-4"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Priority
          <ArrowUpDown className="ml-1 h-4 w-4" />
        </Button>
      ),
      cell: ({ getValue }) => {
        const value = getValue() as ActionPriority
        return (
          <Badge variant="outline" className={priorityColors[value]}>
            {getLabel(value, ACTION_PRIORITY_OPTIONS)}
          </Badge>
        )
      },
    },
    {
      id: 'contact',
      accessorFn: (row) => {
        const names = row.actionContacts?.map((ac) => ac.contact.name) ?? []
        if (!names.length && row.contact?.name) names.push(row.contact.name)
        return names.join(', ')
      },
      header: ({ column }) => (
        <Button
          variant="ghost"
          className="-ml-4"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Contact
          <ArrowUpDown className="ml-1 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const contacts = row.original.actionContacts?.length
          ? row.original.actionContacts.map((ac) => ac.contact)
          : row.original.contact ? [row.original.contact] : []
        if (!contacts.length) return <span className="text-muted-foreground">—</span>
        return (
          <div className="flex flex-wrap gap-x-1">
            {contacts.map((c, i) => (
              <Link
                key={c.id}
                to={`/contacts/${c.id}`}
                className="hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {c.name}{i < contacts.length - 1 ? ',' : ''}
              </Link>
            ))}
          </div>
        )
      },
    },
    {
      id: 'company',
      accessorFn: (row) => {
        const names = row.actionCompanies?.map((ac) => ac.company.name) ?? []
        if (!names.length && row.company?.name) names.push(row.company.name)
        return names.join(', ')
      },
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
        const companies = row.original.actionCompanies?.length
          ? row.original.actionCompanies.map((ac) => ac.company)
          : row.original.company ? [row.original.company] : []
        if (!companies.length) return <span className="text-muted-foreground">—</span>
        return (
          <div className="flex flex-wrap gap-x-1">
            {companies.map((c, i) => (
              <Link
                key={c.id}
                to={`/companies/${c.id}`}
                className="hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {c.name}{i < companies.length - 1 ? ',' : ''}
              </Link>
            ))}
          </div>
        )
      },
    },
    ...(filter === 'completed'
      ? [
        {
          accessorKey: 'completedDate' as const,
          header: ({ column }: { column: { toggleSorting: (asc: boolean) => void; getIsSorted: () => string | false } }) => (
            <Button
              variant="ghost"
              className="-ml-4"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            >
              Completed
              <ArrowUpDown className="ml-1 h-4 w-4" />
            </Button>
          ),
          cell: ({ getValue }: { getValue: () => unknown }) => (
            <span className="text-muted-foreground">{formatDate(getValue() as string)}</span>
          ),
        } as ColumnDef<Action>,
      ]
      : []),
  ]

  // Hide columns on mobile for better readability
  useEffect(() => {
    setColumnVisibility({
      priority: !isMobile,
      company: !isMobile,
      dueDate: !isMobile,
      completedDate: !isMobile,
    })
  }, [isMobile])

  const table = useReactTable({
    data: actions,
    columns,
    state: { sorting, globalFilter, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const filterButtons: { value: FilterStatus; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'completed', label: 'Completed' },
    { value: 'overdue', label: 'Overdue' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Actions</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? '' : `${actions.length} action${actions.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Button asChild size="sm" className="w-full sm:w-auto">
          <Link to="/actions/new">
            <Plus className="mr-2 h-4 w-4" />
            New Action
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-wrap sm:flex-row sm:items-center">
        <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search actions..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex gap-1 rounded-lg border p-1 overflow-x-auto">
          {filterButtons.map((fb) => (
            <Button
              key={fb.value}
              variant={filter === fb.value ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter(fb.value)}
              className="shrink-0"
            >
              {fb.label}
            </Button>
          ))}
        </div>
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
                  No actions found.{' '}
                  <Link to="/actions/new" className="text-primary hover:underline">
                    Create your first action
                  </Link>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/actions/${row.original.id}`)}
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
