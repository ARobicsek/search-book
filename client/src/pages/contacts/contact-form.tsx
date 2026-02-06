import { useEffect, useState, useCallback } from 'react'
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Combobox, MultiCombobox, type ComboboxOption } from '@/components/ui/combobox'
import { PhotoUpload } from '@/components/photo-upload'
import { toast } from 'sonner'
import { ArrowLeft, ChevronDown, Plus, Trash2, Loader2, RotateCcw } from 'lucide-react'
import { useAutoSave } from '@/hooks/use-auto-save'
import { SaveStatusIndicator } from '@/components/save-status'

type CompanyEntry = {
  value: string // company ID (numeric string) or new name
  isCurrent: boolean
}

type FormData = {
  name: string
  title: string
  roleDescription: string
  companyEntries: CompanyEntry[] // array of company entries with current/past indicator
  ecosystem: string
  status: string
  emails: string[]
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
  companyEntries: [],
  ecosystem: 'ROLODEX',
  status: 'CONNECTED',
  emails: [''],
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

  // Parse company entries - supports both old format [1,2,3] and new format [{id:1, isCurrent:true}]
  const companyEntries: CompanyEntry[] = []
  if (contact.companyId) {
    companyEntries.push({ value: contact.companyId.toString(), isCurrent: true })
  }
  if (contact.additionalCompanyIds) {
    try {
      const additional = JSON.parse(contact.additionalCompanyIds)
      if (Array.isArray(additional)) {
        for (const item of additional) {
          if (typeof item === 'object' && item !== null && 'id' in item) {
            // New format: {id: number, isCurrent: boolean}
            companyEntries.push({ value: String(item.id), isCurrent: item.isCurrent ?? true })
          } else {
            // Old format: just a number
            companyEntries.push({ value: String(item), isCurrent: true })
          }
        }
      }
    } catch { /* ignore */ }
  }

  return {
    name: contact.name,
    title: contact.title ?? '',
    roleDescription: contact.roleDescription ?? '',
    companyEntries,
    ecosystem: contact.ecosystem,
    status: contact.status,
    emails: (() => {
      const all: string[] = [];
      if (contact.email) all.push(contact.email);
      if (contact.additionalEmails) {
        try {
          const additional = JSON.parse(contact.additionalEmails);
          if (Array.isArray(additional)) all.push(...additional);
        } catch { /* ignore */ }
      }
      return all.length > 0 ? all : [''];
    })(),
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

function formToPayload(form: FormData, companyEntries: { id: number; isCurrent: boolean }[]) {
  // Join mutualConnections array into comma-separated string
  const mutualConnectionsStr = form.mutualConnections.length > 0
    ? form.mutualConnections.join(', ')
    : null

  return {
    name: form.name.trim(),
    title: form.title.trim() || null,
    roleDescription: form.roleDescription.trim() || null,
    companyEntries, // Array of {id, isCurrent} - server will process
    ecosystem: form.ecosystem,
    status: form.status,
    emails: form.emails.map((e) => e.trim()).filter(Boolean),
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
  const [originalForm, setOriginalForm] = useState<FormData | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [allContacts, setAllContacts] = useState<{ id: number; name: string }[]>([])
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
    api.get<{ id: number; name: string }[]>('/contacts/names').then(
      (data) => setAllContacts(data)
    ).catch(() => {})

    if (isEdit && id) {
      api
        .get<Contact>(`/contacts/${id}`)
        .then((contact) => {
          const f = contactToForm(contact)
          setForm(f)
          setOriginalForm(f)
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
    }
  }, [id, isEdit, navigate])

  function validate(data: FormData = form): boolean {
    const errs: Record<string, string> = {}
    if (!data.name.trim()) errs.name = 'Name is required'
    const invalidEmail = data.emails.find((e) => e.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()))
    if (invalidEmail) errs.email = `Invalid email format: ${invalidEmail}`
    if (data.linkedinUrl && !data.linkedinUrl.startsWith('http'))
      errs.linkedinUrl = 'URL must start with http'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // Auto-save handler for edit mode - only saves existing company IDs, not new names
  const handleAutoSave = useCallback(async (data: FormData) => {
    // Only include company entries that are existing IDs (not new company names)
    const existingCompanyEntries = data.companyEntries
      .filter(entry => companies.some(c => c.id.toString() === entry.value))
      .map(entry => ({ id: parseInt(entry.value), isCurrent: entry.isCurrent }))

    const payload = formToPayload(data, existingCompanyEntries)
    // Remove referredByName for auto-save (don't auto-create)
    delete (payload as { referredByName?: string | null }).referredByName

    await api.put(`/contacts/${id}`, payload)
  }, [id, companies])

  // Use auto-save hook (only in edit mode)
  const autoSave = useAutoSave({
    data: form,
    originalData: originalForm,
    onSave: handleAutoSave,
    validate: (data) => validate(data),
    enabled: isEdit,
    onRevert: setForm,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setSaving(true)
    try {
      // Resolve company entries to IDs (creating new companies for new names)
      const companyEntries: { id: number; isCurrent: boolean }[] = []
      for (const entry of form.companyEntries) {
        const existingCompany = companies.find((c) => c.id.toString() === entry.value)
        if (existingCompany) {
          companyEntries.push({ id: existingCompany.id, isCurrent: entry.isCurrent })
        } else if (entry.value.trim()) {
          // Create new company
          try {
            const newCompany = await api.post<Company>('/companies', { name: entry.value.trim(), status: 'CONNECTED' })
            companyEntries.push({ id: newCompany.id, isCurrent: entry.isCurrent })
            setCompanies((prev) => [...prev, newCompany])
          } catch {
            // Skip if creation fails
          }
        }
      }

      const payload = formToPayload(form, companyEntries)

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

      // Auto-create contacts for mutual connections that don't exist
      for (const name of form.mutualConnections) {
        const trimmedName = name.trim()
        if (!trimmedName) continue
        const exists = allContacts.some(
          (c) => c.name.toLowerCase() === trimmedName.toLowerCase()
        )
        if (!exists) {
          try {
            const newContact = await api.post<Contact>('/contacts', {
              name: trimmedName,
              status: 'CONNECTED',
              ecosystem: 'ROLODEX',
            })
            setAllContacts((prev) => [...prev, { id: newContact.id, name: newContact.name }])
          } catch {
            // If creation fails, just proceed - the name is still stored in mutualConnections string
          }
        }
      }

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
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            {isEdit ? 'Edit Contact' : 'New Contact'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {isEdit ? (
            <>
              <SaveStatusIndicator status={autoSave.status} />
              {autoSave.isDirty && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={autoSave.revert}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Revert
                </Button>
              )}
              <Button
                type="button"
                onClick={() => navigate(`/contacts/${id}`)}
                className="flex-1 sm:flex-initial"
              >
                Done
              </Button>
            </>
          ) : (
            <>
              <Button type="submit" form="contact-form" disabled={saving} className="flex-1 sm:flex-initial">
                {saving ? 'Saving...' : 'Create Contact'}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate(-1)} className="flex-1 sm:flex-initial">
                Cancel
              </Button>
            </>
          )}
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
                value={form.photoUrl || form.photoFile}
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

            <div className="space-y-2 sm:col-span-2">
              <Label>Companies</Label>
              <div className="space-y-2">
                {form.companyEntries.length === 0 ? (
                  <Combobox
                    options={companyOptions}
                    value=""
                    onChange={(val) => {
                      if (val) {
                        setForm((prev) => ({ ...prev, companyEntries: [{ value: val, isCurrent: true }] }))
                      }
                    }}
                    placeholder="Search or type new company..."
                    searchPlaceholder="Search companies..."
                    allowFreeText={true}
                  />
                ) : (
                  form.companyEntries.map((entry, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <Combobox
                          options={companyOptions}
                          value={entry.value}
                          onChange={(val) => {
                            const newEntries = [...form.companyEntries]
                            if (val) {
                              newEntries[i] = { ...newEntries[i], value: val }
                            } else {
                              newEntries.splice(i, 1)
                            }
                            setForm((prev) => ({ ...prev, companyEntries: newEntries }))
                          }}
                          placeholder="Search or type new company..."
                          searchPlaceholder="Search companies..."
                          allowFreeText={true}
                        />
                      </div>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!entry.isCurrent}
                          onChange={(e) => {
                            const newEntries = [...form.companyEntries]
                            newEntries[i] = { ...newEntries[i], isCurrent: !e.target.checked }
                            setForm((prev) => ({ ...prev, companyEntries: newEntries }))
                          }}
                          className="h-3.5 w-3.5 rounded border-gray-300"
                        />
                        Past
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-8 w-8"
                        onClick={() => {
                          setForm((prev) => ({
                            ...prev,
                            companyEntries: prev.companyEntries.filter((_, idx) => idx !== i),
                          }))
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))
                )}
                {form.companyEntries.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setForm((prev) => ({ ...prev, companyEntries: [...prev.companyEntries, { value: '', isCurrent: true }] }))}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add Another Company
                  </Button>
                )}
                {form.companyEntries.some((e) => e.value && !companies.some((c) => c.id.toString() === e.value)) && (
                  <p className="text-xs text-muted-foreground">
                    New companies will be created when you click Done.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Emails</Label>
              <div className="space-y-2">
                {form.emails.map((email, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        const newEmails = [...form.emails]
                        newEmails[i] = e.target.value
                        setForm((prev) => ({ ...prev, emails: newEmails }))
                      }}
                      placeholder="email@example.com"
                    />
                    {form.emails.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => {
                          setForm((prev) => ({
                            ...prev,
                            emails: prev.emails.filter((_, idx) => idx !== i),
                          }))
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setForm((prev) => ({ ...prev, emails: [...prev.emails, ''] }))}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add Email
                </Button>
              </div>
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

        {/* Bottom actions only for create mode */}
        {!isEdit && (
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Create Contact'}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              Cancel
            </Button>
          </div>
        )}
      </form>
    </div>
  )
}
