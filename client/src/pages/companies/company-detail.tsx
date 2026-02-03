import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Company } from '@/lib/types'
import { COMPANY_STATUS_OPTIONS, ECOSYSTEM_OPTIONS, CONTACT_STATUS_OPTIONS } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { ArrowLeft, Pencil, Trash2, ExternalLink } from 'lucide-react'

const companyStatusColors: Record<string, string> = {
  RESEARCHING: 'bg-blue-100 text-blue-700',
  ACTIVE_TARGET: 'bg-green-100 text-green-700',
  CONNECTED: 'bg-emerald-100 text-emerald-700',
  ON_HOLD: 'bg-gray-100 text-gray-500',
  CLOSED: 'bg-red-100 text-red-700',
}

const contactStatusColors: Record<string, string> = {
  NEW: 'bg-slate-100 text-slate-700',
  CONNECTED: 'bg-green-100 text-green-700',
  AWAITING_RESPONSE: 'bg-yellow-100 text-yellow-700',
  FOLLOW_UP_NEEDED: 'bg-orange-100 text-orange-700',
  WARM_LEAD: 'bg-emerald-100 text-emerald-700',
  ON_HOLD: 'bg-gray-100 text-gray-500',
  CLOSED: 'bg-red-100 text-red-700',
}

const ecosystemColors: Record<string, string> = {
  RECRUITER: 'bg-blue-100 text-blue-800',
  ROLODEX: 'bg-purple-100 text-purple-800',
  TARGET: 'bg-green-100 text-green-800',
  INFLUENCER: 'bg-amber-100 text-amber-800',
  ACADEMIA: 'bg-rose-100 text-rose-800',
  INTRO_SOURCE: 'bg-cyan-100 text-cyan-800',
}

function getLabel(value: string, options: { value: string; label: string }[]) {
  return options.find((o) => o.value === value)?.label ?? value
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null
  return (
    <div className="space-y-1">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

export function CompanyDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!id) return
    api
      .get<Company>(`/companies/${id}`)
      .then(setCompany)
      .catch((err) => {
        toast.error(err.message)
        navigate('/companies')
      })
      .finally(() => setLoading(false))
  }, [id, navigate])

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.delete(`/companies/${id}`)
      toast.success('Company deleted')
      navigate('/companies')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  if (!company) {
    return <div className="text-muted-foreground">Company not found.</div>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/companies')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{company.name}</h1>
            {company.industry && (
              <p className="text-sm text-muted-foreground">{company.industry}</p>
            )}
            <div className="mt-2">
              <Badge variant="outline" className={companyStatusColors[company.status]}>
                {getLabel(company.status, COMPANY_STATUS_OPTIONS)}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/companies/${company.id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Company</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete <strong>{company.name}</strong>? This
                  action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Separator />

      {/* Company Details */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Size">{company.size}</Field>
            <Field label="HQ Location">{company.hqLocation}</Field>
            <Field label="Website">
              {company.website && (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  {company.website}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </Field>
          </dl>
        </CardContent>
      </Card>

      {/* Notes */}
      {company.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{company.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Linked Contacts */}
      <Card>
        <CardHeader>
          <CardTitle>
            Contacts{' '}
            {company.contacts && (
              <span className="text-sm font-normal text-muted-foreground">
                ({company.contacts.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {company.contacts && company.contacts.length > 0 ? (
            <div className="space-y-3">
              {company.contacts.map((c) => (
                <div key={c.id} className="flex items-center justify-between">
                  <div>
                    <Link
                      to={`/contacts/${c.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {c.name}
                    </Link>
                    {c.title && (
                      <span className="ml-2 text-sm text-muted-foreground">{c.title}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className={ecosystemColors[c.ecosystem]}>
                      {getLabel(c.ecosystem, ECOSYSTEM_OPTIONS)}
                    </Badge>
                    <Badge variant="outline" className={contactStatusColors[c.status]}>
                      {getLabel(c.status, CONTACT_STATUS_OPTIONS)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No contacts linked to this company.</p>
          )}
        </CardContent>
      </Card>

      {/* Timestamps */}
      <div className="flex gap-6 text-xs text-muted-foreground">
        <span>Created {formatDate(company.createdAt)}</span>
        <span>Updated {formatDate(company.updatedAt)}</span>
      </div>
    </div>
  )
}
