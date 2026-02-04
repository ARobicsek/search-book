import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Contact, Company, EmploymentHistory } from '@/lib/types'
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Combobox, MultiCombobox, type ComboboxOption } from '@/components/ui/combobox'
import { PhotoUpload } from '@/components/photo-upload'
import { toast } from 'sonner'
import { ArrowLeft, ChevronDown, Plus, Trash2 } from 'lucide-react'

type FormData = {
  name: string
  title: string
  roleDescription: string
  companyId: string // "" or numeric string
  companyName: string
  ecosystem: string
  status: string
  email: string
  phone: string
  linkedinUrl: string
  location: string
  photoFile: string
  photoUrl: string
  referredById: string // "" or numeric string
  referredByName: string // freetext for new referrer
  howConnected: string
  mutualConnections: string[] // array of contact names
  whereFound: string
  openQuestions: string
  notes: string
  personalDetails: string
}

const emptyForm: FormData = {
  name: '',
  title: '',
  roleDescription: '',
  companyId: '',
  companyName: '',
  ecosystem: 'ROLODEX',
  status: 'CONNECTED',
  email: '',
  phone: '',
  linkedinUrl: '',
  location: '',
  photoFile: '',
  photoUrl: '',
  referredById: '',
  referredByName: '',
  howConnected: '',
  mutualConnections: [],
  whereFound: '',
  openQuestions: '',
  notes: '',
  personalDetails: '',
}

function contactToForm(contact: Contact): FormData {
  // Parse mutualConnections string into array (comma-separated)
  const mutualConnectionsArr = contact.mutualConnections
    ? contact.mutualConnections.split(',').map((s) => s.trim()).filter(Boolean)
    : []

  return {
    name: contact.name,
    title: contact.title ?? '',
    roleDescription: contact.roleDescription ?? '',
    companyId: contact.companyId?.toString() ?? '',
    companyName: contact.companyName ?? '',
    ecosystem: contact.ecosystem,
    status: contact.status,
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    linkedinUrl: contact.linkedinUrl ?? '',
    location: contact.location ?? '',
    photoFile: contact.photoFile ?? '',
    photoUrl: contact.photoUrl ?? '',
    referredById: contact.referredById?.toString() ?? '',
    referredByName: '',
    howConnected: contact.howConnected ?? '',
    mutualConnections: mutualConnectionsArr,
    whereFound: contact.whereFound ?? '',
    openQuestions: contact.openQuestions ?? '',
    notes: contact.notes ?? '',
    personalDetails: contact.personalDetails ?? '',
  }
}

function formToPayload(form: FormData) {
  // Join mutualConnections array into comma-separated string
  const mutualConnectionsStr = form.mutualConnections.length > 0
    ? form.mutualConnections.join(', ')
    : null

  return {
    name: form.name.trim(),
    title: form.title.trim() || null,
    roleDescription: form.roleDescription.trim() || null,
    companyId: form.companyId ? parseInt(form.companyId) : null,
    companyName: !form.companyId ? (form.companyName.trim() || null) : null,
    ecosystem: form.ecosystem,
    status: form.status,
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    linkedinUrl: form.linkedinUrl.trim() || null,
    location: form.location.trim() || null,
    photoFile: form.photoFile || null,
    photoUrl: form.photoUrl || null,
    referredById: form.referredById ? parseInt(form.referredById) : null,
    referredByName: !form.referredById ? (form.referredByName.trim() || null) : null,
    howConnected: form.howConnected.trim() || null,
    mutualConnections: mutualConnectionsStr,
    whereFound: form.whereFound.trim() || null,
    openQuestions: form.openQuestions.trim() || null,
    notes: form.notes.trim() || null,
    personalDetails: form.personalDetails.trim() || null,
  }
}

export function ContactFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)

  const [form, setForm] = useState<FormData>(emptyForm)
  const [companies, setCompanies] = useState<Company[]>([])
  const [allContacts, setAllContacts] = useState<{ id: number; name: string }[]>([])
  const [employmentHistory, setEmploymentHistory] = useState<EmploymentHistory[]>([])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Progressive disclosure: auto-open if fields have data
  const hasContactDetails = !!(form.phone || form.linkedinUrl)
  const hasConnectionDetails = !!(form.howConnected || form.mutualConnections.length > 0)
  const hasResearch = !!(form.whereFound || form.openQuestions || form.notes)
  const hasPersonalDetails = !!form.personalDetails

  const [contactDetailsOpen, setContactDetailsOpen] = useState(hasContactDetails)
  const [connectionDetailsOpen, setConnectionDetailsOpen] = useState(hasConnectionDetails)
  const [researchOpen, setResearchOpen] = useState(hasResearch)
  const [personalDetailsOpen, setPersonalDetailsOpen] = useState(hasPersonalDetails)

  useEffect(() => {
    api.get<Company[]>('/companies').then(setCompanies).catch(() => toast.error('Failed to load companies'))
    api.get<Contact[]>('/contacts').then(
      (data) => setAllContacts(data.map((c) => ({ id: c.id, name: c.name })))
    ).catch(() => {})

    if (isEdit && id) {
      api
        .get<Contact>(`/contacts/${id}`)
        .then((contact) => {
          const f = contactToForm(contact)
          setForm(f)
          // Open sections that have data
          if (f.phone || f.linkedinUrl) setContactDetailsOpen(true)
          if (f.howConnected || f.mutualConnections.length > 0) setConnectionDetailsOpen(true)
          if (f.whereFound || f.openQuestions || f.notes) setResearchOpen(true)
          if (f.personalDetails) setPersonalDetailsOpen(true)
        })
        .catch((err) => {
          toast.error(err.message)
          navigate('/contacts')
        })
        .finally(() => setLoading(false))

      // Fetch employment history
      api.get<EmploymentHistory[]>(`/employment-history?contactId=${id}`).then(setEmploymentHistory).catch(() => {})
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

      // If user typed a new company name (not from dropdown), auto-create the company
      if (!payload.companyId && payload.companyName) {
        try {
          const newCompany = await api.post<Company>('/companies', { name: payload.companyName, status: 'CONNECTED' })
          payload.companyId = newCompany.id
          payload.companyName = null
        } catch {
          // If company creation fails, still save the contact with freetext company name
        }
      }

      // If user typed a new referrer name (not from dropdown), auto-create the contact
      if (!payload.referredById && (payload as { referredByName?: string | null }).referredByName) {
        try {
          const newReferrer = await api.post<Contact>('/contacts', {
            name: (payload as { referredByName?: string | null }).referredByName,
            status: 'CONNECTED',
            ecosystem: 'ROLODEX',
          })
          payload.referredById = newReferrer.id
        } catch {
          // If referrer creation fails, just proceed without the link
        }
      }
      // Always remove referredByName from payload since Contact model doesn't have this field
      delete (payload as { referredByName?: string | null }).referredByName

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

  // Company combobox options: search existing + type new
  const companyOptions: ComboboxOption[] = companies.map((c) => ({
    value: c.id.toString(),
    label: c.name,
  }))

  // Filter out self from referredBy options
  const currentId = id ? parseInt(id) : null
  const referredByOptions: ComboboxOption[] = allContacts
    .filter((c) => c.id !== currentId)
    .map((c) => ({ value: c.id.toString(), label: c.name }))

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            {isEdit ? 'Edit Contact' : 'New Contact'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" form="contact-form" disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Contact'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </div>

      <form id="contact-form" onSubmit={handleSubmit} className="space-y-6">
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

            <div className="sm:col-span-2">
              <PhotoUpload
                value={form.photoFile || form.photoUrl}
                onChange={(val) => {
                  if (val.startsWith('http')) {
                    setForm((prev) => ({ ...prev, photoUrl: val, photoFile: '' }))
                  } else {
                    setForm((prev) => ({ ...prev, photoFile: val, photoUrl: '' }))
                  }
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="e.g. VP of Engineering"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="roleDescription">Role Description</Label>
              <Textarea
                id="roleDescription"
                value={form.roleDescription}
                onChange={(e) => set('roleDescription', e.target.value)}
                placeholder="Describe their responsibilities, team size, focus areas..."
                rows={2}
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
              <Label>Company</Label>
              <Combobox
                options={companyOptions}
                value={form.companyId || form.companyName}
                onChange={(val, isNew) => {
                  if (isNew) {
                    // User typed a new company name
                    setForm((prev) => ({ ...prev, companyId: '', companyName: val }))
                  } else {
                    // User selected an existing company
                    setForm((prev) => ({ ...prev, companyId: val, companyName: '' }))
                  }
                }}
                placeholder="Search or type new company..."
                searchPlaceholder="Search companies..."
                allowFreeText={true}
              />
              {form.companyName && !form.companyId && (
                <p className="text-xs text-muted-foreground">
                  A new company card will be created automatically.
                </p>
              )}
            </div>

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

            <div className="space-y-2 sm:col-span-2">
              <Label>Referred By</Label>
              <Combobox
                options={referredByOptions}
                value={form.referredById || form.referredByName}
                onChange={(val, isNew) => {
                  if (isNew) {
                    setForm((prev) => ({ ...prev, referredById: '', referredByName: val }))
                  } else {
                    setForm((prev) => ({ ...prev, referredById: val, referredByName: '' }))
                  }
                }}
                placeholder="Search or type new name..."
                searchPlaceholder="Search contacts..."
                allowFreeText={true}
              />
            </div>
          </CardContent>
        </Card>

        {/* Contact Details — Progressive Disclosure */}
        <Collapsible open={contactDetailsOpen} onOpenChange={setContactDetailsOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Phone & LinkedIn</CardTitle>
                    <CardDescription>Additional contact methods</CardDescription>
                  </div>
                  <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${contactDetailsOpen ? 'rotate-180' : ''}`} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => set('phone', e.target.value)}
                    placeholder="(555) 123-4567"
                  />
                </div>

                <div className="space-y-2">
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
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* How Connected — Progressive Disclosure */}
        <Collapsible open={connectionDetailsOpen} onOpenChange={setConnectionDetailsOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>How Connected</CardTitle>
                    <CardDescription>Connection details and mutual contacts</CardDescription>
                  </div>
                  <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${connectionDetailsOpen ? 'rotate-180' : ''}`} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="howConnected">How Connected</Label>
                  <Input
                    id="howConnected"
                    value={form.howConnected}
                    onChange={(e) => set('howConnected', e.target.value)}
                    placeholder="How did you get connected?"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Mutual Connections</Label>
                  <MultiCombobox
                    options={allContacts.map((c) => ({ value: c.name, label: c.name }))}
                    values={form.mutualConnections}
                    onChange={(vals) => setForm((prev) => ({ ...prev, mutualConnections: vals }))}
                    placeholder="Search or type name..."
                    searchPlaceholder="Search contacts..."
                    allowFreeText={true}
                  />
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Research — Progressive Disclosure */}
        <Collapsible open={researchOpen} onOpenChange={setResearchOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Research</CardTitle>
                    <CardDescription>What you know and want to learn</CardDescription>
                  </div>
                  <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${researchOpen ? 'rotate-180' : ''}`} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
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
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Personal Details — Progressive Disclosure */}
        <Collapsible open={personalDetailsOpen} onOpenChange={setPersonalDetailsOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Personal Details</CardTitle>
                    <CardDescription>Family, hobbies, personal info</CardDescription>
                  </div>
                  <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${personalDetailsOpen ? 'rotate-180' : ''}`} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="personalDetails">Personal Details</Label>
                  <Textarea
                    id="personalDetails"
                    value={form.personalDetails}
                    onChange={(e) => set('personalDetails', e.target.value)}
                    placeholder="Kids ages, hobbies, interests, birthdays, etc."
                    rows={4}
                  />
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Previous Companies — only show when editing */}
        {isEdit && (
          <Card>
            <CardHeader>
              <CardTitle>Previous Companies</CardTitle>
              <CardDescription>Track company history as they change jobs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Existing history entries */}
              {employmentHistory.length > 0 && (
                <ul className="space-y-2">
                  {employmentHistory.map((eh) => (
                    <li key={eh.id} className="flex items-center justify-between gap-2 text-sm border rounded-md p-2">
                      <div>
                        {eh.title && <span className="font-medium">{eh.title}</span>}
                        {eh.title && (eh.company || eh.companyName) && <span className="text-muted-foreground"> at </span>}
                        <span>{eh.company?.name || eh.companyName}</span>
                        {(eh.startDate || eh.endDate) && (
                          <span className="text-xs text-muted-foreground ml-2">
                            ({eh.startDate || '?'} — {eh.endDate || 'present'})
                          </span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={async () => {
                          try {
                            await api.delete(`/employment-history/${eh.id}`)
                            setEmploymentHistory((prev) => prev.filter((e) => e.id !== eh.id))
                            toast.success('History entry removed')
                          } catch {
                            toast.error('Failed to remove history entry')
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Move current company to history */}
              {(form.companyId || form.companyName) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const endDate = prompt('End date (YYYY-MM or YYYY):', new Date().toISOString().slice(0, 7))
                    if (endDate === null) return

                    try {
                      const newHistory = await api.post<EmploymentHistory>('/employment-history', {
                        contactId: parseInt(id!),
                        companyId: form.companyId ? parseInt(form.companyId) : null,
                        companyName: form.companyName || null,
                        title: form.title || null,
                        endDate: endDate || null,
                      })
                      setEmploymentHistory((prev) => [newHistory, ...prev])
                      setForm((prev) => ({ ...prev, companyId: '', companyName: '', title: '' }))
                      toast.success('Moved to history. Now set the new company.')
                    } catch {
                      toast.error('Failed to move company to history')
                    }
                  }}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Move current company to history
                </Button>
              )}

              {employmentHistory.length === 0 && !form.companyId && !form.companyName && (
                <p className="text-sm text-muted-foreground">No previous companies recorded.</p>
              )}
            </CardContent>
          </Card>
        )}

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
