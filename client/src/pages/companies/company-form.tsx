import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Company } from '@/lib/types'
import { COMPANY_STATUS_OPTIONS } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'

type FormData = {
  name: string
  industry: string
  size: string
  website: string
  hqLocation: string
  status: string
  notes: string
}

const emptyForm: FormData = {
  name: '',
  industry: '',
  size: '',
  website: '',
  hqLocation: '',
  status: 'RESEARCHING',
  notes: '',
}

function companyToForm(company: Company): FormData {
  return {
    name: company.name,
    industry: company.industry ?? '',
    size: company.size ?? '',
    website: company.website ?? '',
    hqLocation: company.hqLocation ?? '',
    status: company.status,
    notes: company.notes ?? '',
  }
}

function formToPayload(form: FormData) {
  return {
    name: form.name.trim(),
    industry: form.industry.trim() || null,
    size: form.size.trim() || null,
    website: form.website.trim() || null,
    hqLocation: form.hqLocation.trim() || null,
    status: form.status,
    notes: form.notes.trim() || null,
  }
}

export function CompanyFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)

  const [form, setForm] = useState<FormData>(emptyForm)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (isEdit && id) {
      api
        .get<Company>(`/companies/${id}`)
        .then((company) => setForm(companyToForm(company)))
        .catch((err) => {
          toast.error(err.message)
          navigate('/companies')
        })
        .finally(() => setLoading(false))
    }
  }, [id, isEdit, navigate])

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Name is required'
    if (form.website && !form.website.startsWith('http'))
      errs.website = 'URL must start with http'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setSaving(true)
    try {
      const payload = formToPayload(form)
      if (isEdit) {
        await api.put(`/companies/${id}`, payload)
        toast.success('Company updated')
        navigate(`/companies/${id}`)
      } else {
        const created = await api.post<Company>('/companies', payload)
        toast.success('Company created')
        navigate(`/companies/${created.id}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save company')
    } finally {
      setSaving(false)
    }
  }

  function set(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }))
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">
          {isEdit ? 'Edit Company' : 'New Company'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Company Info */}
        <Card>
          <CardHeader>
            <CardTitle>Company Info</CardTitle>
            <CardDescription>Basic company details</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Company name"
                aria-invalid={!!errors.name}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                value={form.industry}
                onChange={(e) => set('industry', e.target.value)}
                placeholder="e.g. Technology, Finance"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="size">Size</Label>
              <Input
                id="size"
                value={form.size}
                onChange={(e) => set('size', e.target.value)}
                placeholder='e.g. 500-1000, Fortune 500'
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hqLocation">HQ Location</Label>
              <Input
                id="hqLocation"
                value={form.hqLocation}
                onChange={(e) => set('hqLocation', e.target.value)}
                placeholder="City, State"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v)}>
                <SelectTrigger id="status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPANY_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                value={form.website}
                onChange={(e) => set('website', e.target.value)}
                placeholder="https://example.com"
                aria-invalid={!!errors.website}
              />
              {errors.website && (
                <p className="text-sm text-destructive">{errors.website}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
            <CardDescription>Why this company is a target, relevant info</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Notes about this company"
              rows={5}
            />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Company'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
