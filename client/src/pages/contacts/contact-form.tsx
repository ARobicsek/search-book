import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Contact, Company } from '@/lib/types'
import { ECOSYSTEM_OPTIONS, CONTACT_STATUS_OPTIONS } from '@/lib/types'
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
  title: string
  companyId: string // "" or numeric string
  companyName: string
  ecosystem: string
  status: string
  email: string
  phone: string
  linkedinUrl: string
  location: string
  howConnected: string
  mutualConnections: string
  whereFound: string
  openQuestions: string
  notes: string
}

const emptyForm: FormData = {
  name: '',
  title: '',
  companyId: '',
  companyName: '',
  ecosystem: 'ROLODEX',
  status: 'NEW',
  email: '',
  phone: '',
  linkedinUrl: '',
  location: '',
  howConnected: '',
  mutualConnections: '',
  whereFound: '',
  openQuestions: '',
  notes: '',
}

function contactToForm(contact: Contact): FormData {
  return {
    name: contact.name,
    title: contact.title ?? '',
    companyId: contact.companyId?.toString() ?? '',
    companyName: contact.companyName ?? '',
    ecosystem: contact.ecosystem,
    status: contact.status,
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    linkedinUrl: contact.linkedinUrl ?? '',
    location: contact.location ?? '',
    howConnected: contact.howConnected ?? '',
    mutualConnections: contact.mutualConnections ?? '',
    whereFound: contact.whereFound ?? '',
    openQuestions: contact.openQuestions ?? '',
    notes: contact.notes ?? '',
  }
}

function formToPayload(form: FormData) {
  return {
    name: form.name.trim(),
    title: form.title.trim() || null,
    companyId: form.companyId ? parseInt(form.companyId) : null,
    companyName: !form.companyId ? (form.companyName.trim() || null) : null,
    ecosystem: form.ecosystem,
    status: form.status,
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    linkedinUrl: form.linkedinUrl.trim() || null,
    location: form.location.trim() || null,
    howConnected: form.howConnected.trim() || null,
    mutualConnections: form.mutualConnections.trim() || null,
    whereFound: form.whereFound.trim() || null,
    openQuestions: form.openQuestions.trim() || null,
    notes: form.notes.trim() || null,
  }
}

export function ContactFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)

  const [form, setForm] = useState<FormData>(emptyForm)
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    api.get<Company[]>('/companies').then(setCompanies).catch(() => toast.error('Failed to load companies'))

    if (isEdit && id) {
      api
        .get<Contact>(`/contacts/${id}`)
        .then((contact) => setForm(contactToForm(contact)))
        .catch((err) => {
          toast.error(err.message)
          navigate('/contacts')
        })
        .finally(() => setLoading(false))
    }
  }, [id, isEdit, navigate])

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Name is required'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errs.email = 'Invalid email format'
    if (form.linkedinUrl && !form.linkedinUrl.startsWith('http'))
      errs.linkedinUrl = 'URL must start with http'
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
        await api.put(`/contacts/${id}`, payload)
        toast.success('Contact updated')
        navigate(`/contacts/${id}`)
      } else {
        const created = await api.post<Contact>('/contacts', payload)
        toast.success('Contact created')
        navigate(`/contacts/${created.id}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save contact')
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
          {isEdit ? 'Edit Contact' : 'New Contact'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Info</CardTitle>
            <CardDescription>Name, role, and classification</CardDescription>
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
                placeholder="Full name"
                aria-invalid={!!errors.name}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Title / Role</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="e.g. VP of Engineering"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={form.location}
                onChange={(e) => set('location', e.target.value)}
                placeholder="City / Region"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ecosystem">Ecosystem</Label>
              <Select value={form.ecosystem} onValueChange={(v) => set('ecosystem', v)}>
                <SelectTrigger id="ecosystem" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ECOSYSTEM_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v)}>
                <SelectTrigger id="status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Contact Details */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Details</CardTitle>
            <CardDescription>How to reach this person</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="email@example.com"
                aria-invalid={!!errors.email}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
              <Input
                id="linkedinUrl"
                value={form.linkedinUrl}
                onChange={(e) => set('linkedinUrl', e.target.value)}
                placeholder="https://linkedin.com/in/..."
                aria-invalid={!!errors.linkedinUrl}
              />
              {errors.linkedinUrl && (
                <p className="text-sm text-destructive">{errors.linkedinUrl}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Connections */}
        <Card>
          <CardHeader>
            <CardTitle>Connections</CardTitle>
            <CardDescription>Company and how you know them</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="companyId">Company</Label>
              <Select
                value={form.companyId || '_none'}
                onValueChange={(v) => set('companyId', v === '_none' ? '' : v)}
              >
                <SelectTrigger id="companyId" className="w-full">
                  <SelectValue placeholder="Select a company" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="companyName">
                Company (freetext){' '}
                <span className="text-xs text-muted-foreground">if not in list</span>
              </Label>
              <Input
                id="companyName"
                value={form.companyName}
                onChange={(e) => set('companyName', e.target.value)}
                placeholder="Company name"
                disabled={!!form.companyId}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="howConnected">How Connected</Label>
              <Input
                id="howConnected"
                value={form.howConnected}
                onChange={(e) => set('howConnected', e.target.value)}
                placeholder="How you know them or who introduced you"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="mutualConnections">Mutual Connections</Label>
              <Textarea
                id="mutualConnections"
                value={form.mutualConnections}
                onChange={(e) => set('mutualConnections', e.target.value)}
                placeholder="Who you know in common"
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Research */}
        <Card>
          <CardHeader>
            <CardTitle>Research</CardTitle>
            <CardDescription>What you know and want to learn</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="whereFound">Where Found</Label>
              <Textarea
                id="whereFound"
                value={form.whereFound}
                onChange={(e) => set('whereFound', e.target.value)}
                placeholder="Where you've seen their work"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="openQuestions">Open Questions</Label>
              <Textarea
                id="openQuestions"
                value={form.openQuestions}
                onChange={(e) => set('openQuestions', e.target.value)}
                placeholder="Things you still need to learn about/from them"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="General personalized research notes"
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Contact'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
