import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  flexRender,
} from '@tanstack/react-table'
import { ArrowUpDown, Plus, Check } from 'lucide-react'
import { api } from '@/lib/api'
import type { Action, ActionType, ActionPriority } from '@/lib/types'
import { ACTION_TYPE_OPTIONS, ACTION_PRIORITY_OPTIONS } from '@/lib/types'
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

type FilterStatus = 'all' | 'pending' | 'completed' | 'overdue'

const typeColors: Record<ActionType, string> = {
  EMAIL: 'bg-blue-100 text-blue-800',
  CALL: 'bg-green-100 text-green-800',
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
  const today = new Date().toISOString().split('T')[0]
  return action.dueDate < today
}

export function ActionListPage() {
  const navigate = useNavigate()
  const [actions, setActions] = useState<Action[]>([])
  const [loading, setLoading] = useState(true)
  const [sorting, setSorting] = useState<SortingState>([])
  const [filter, setFilter] = useState<FilterStatus>('pending')

  const fetchActions = useCallback(() => {
    const params = filter !== 'all' ? `?status=${filter}` : ''
    api
      .get<Action[]>(`/actions${params}`)
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
      await api.patch<Action>(`/actions/${action.id}/complete`)
      fetchActions()
      toast.success(action.completed ? 'Marked incomplete' : 'Marked complete')
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
          className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
            row.original.completed
              ? 'border-green-500 bg-green-500 text-white'
              : 'border-muted-foreground/30 hover:border-green-500'
          }`}
        >
          {row.original.completed && <Check className="h-3 w-3" />}
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
          className={`font-medium hover:underline ${
            row.original.completed ? 'text-muted-foreground line-through' : 'text-foreground'
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
      cell: ({ row }) => {
        const overdue = isOverdue(row.original)
        return (
          <span className={overdue ? 'font-semibold text-red-600' : 'text-muted-foreground'}>
            {formatDate(row.original.dueDate)}
          </span>
        )
      },
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
      accessorFn: (row) => row.contact?.name ?? '',
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
        const contact = row.original.contact
        if (!contact) return <span className="text-muted-foreground">—</span>
        return (
          <Link
            to={`/contacts/${contact.id}`}
            className="hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {contact.name}
          </Link>
        )
      },
    },
    {
      id: 'company',
      accessorFn: (row) => row.company?.name ?? '',
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
        const company = row.original.company
        if (!company) return <span className="text-muted-foreground">—</span>
        return (
          <Link
            to={`/companies/${company.id}`}
            className="hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {company.name}
          </Link>
        )
      },
    },
  ]

  const table = useReactTable({
    data: actions,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const filterButtons: { value: FilterStatus; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'completed', label: 'Completed' },
    { value: 'overdue', label: 'Overdue' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Actions</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? '' : `${actions.length} action${actions.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Button asChild>
          <Link to="/actions/new">
            <Plus className="mr-2 h-4 w-4" />
            New Action
          </Link>
        </Button>
      </div>

      <div className="flex gap-1 rounded-lg border p-1">
        {filterButtons.map((fb) => (
          <Button
            key={fb.value}
            variant={filter === fb.value ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setFilter(fb.value)}
          >
            {fb.label}
          </Button>
        ))}
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
