import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Action, Contact, Company, LinkRecord } from '@/lib/types'
import { ACTION_TYPE_OPTIONS, ACTION_PRIORITY_OPTIONS } from '@/lib/types'
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
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Plus, Trash2, RotateCcw } from 'lucide-react'
import { useAutoSave } from '@/hooks/use-auto-save'
import { SaveStatusIndicator } from '@/components/save-status'

interface LinkEntry {
  url: string
  title: string
}

type FormData = {
  title: string
  description: string
  type: string
  priority: string
  dueDate: string
  contactId: string
  companyId: string
  recurring: boolean
  recurringIntervalDays: string
  recurringEndDate: string
  links: LinkEntry[]
}

const emptyForm: FormData = {
  title: '',
  description: '',
  type: 'OTHER',
  priority: 'MEDIUM',
  dueDate: '',
  contactId: '',
  companyId: '',
  recurring: false,
  recurringIntervalDays: '',
  recurringEndDate: '',
  links: [],
}

function actionToForm(action: Action): FormData {
  return {
    title: action.title,
    description: action.description ?? '',
    type: action.type,
    priority: action.priority,
    dueDate: action.dueDate ?? '',
    contactId: action.contactId?.toString() ?? '',
    companyId: action.companyId?.toString() ?? '',
    recurring: action.recurring,
    recurringIntervalDays: action.recurringIntervalDays?.toString() ?? '',
    recurringEndDate: action.recurringEndDate ?? '',
    links: [], // Will be loaded separately
  }
}

function formToPayload(form: FormData) {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    type: form.type,
    priority: form.priority,
    dueDate: form.dueDate || null,
    contactId: form.contactId ? parseInt(form.contactId) : null,
    companyId: form.companyId ? parseInt(form.companyId) : null,
    recurring: form.recurring,
    recurringIntervalDays: form.recurring && form.recurringIntervalDays
      ? parseInt(form.recurringIntervalDays)
      : null,
    recurringEndDate: form.recurring && form.recurringEndDate
      ? form.recurringEndDate
      : null,
  }
}

export function ActionFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const isEdit = Boolean(id)

  const [form, setForm] = useState<FormData>(() => {
    const initial = { ...emptyForm }
    const qContactId = searchParams.get('contactId')
    const qCompanyId = searchParams.get('companyId')
    if (qContactId) initial.contactId = qContactId
    if (qCompanyId) initial.companyId = qCompanyId
    return initial
  })
  const [originalForm, setOriginalForm] = useState<FormData | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [newContactName, setNewContactName] = useState('')
  const [newCompanyName, setNewCompanyName] = useState('')

  // Options for comboboxes
  const contactOptions: ComboboxOption[] = contacts.map((c) => ({
    value: c.id.toString(),
    label: c.name,
  }))
  const companyOptions: ComboboxOption[] = companies.map((c) => ({
    value: c.id.toString(),
    label: c.name,
  }))

  // Track existing link IDs for deletion tracking
  const [existingLinkIds, setExistingLinkIds] = useState<number[]>([])

  useEffect(() => {
    api.get<{ data: Contact[] } | Contact[]>('/contacts?limit=200').then((res) => {
      setContacts(Array.isArray(res) ? res : res.data)
    }).catch(() => toast.error('Failed to load contacts'))
    api.get<Company[]>('/companies').then(setCompanies).catch(() => toast.error('Failed to load companies'))

    if (isEdit && id) {
      Promise.all([
        api.get<Action>(`/actions/${id}`),
        api.get<LinkRecord[]>(`/links?actionId=${id}`),
      ])
        .then(([action, links]) => {
          const formData = {
            ...actionToForm(action),
            links: links.map((l) => ({ url: l.url, title: l.title })),
          }
          setForm(formData)
          setOriginalForm(formData)
          setExistingLinkIds(links.map((l) => l.id))
        })
        .catch((err) => {
          toast.error(err.message)
          navigate('/actions')
        })
        .finally(() => setLoading(false))
    }
  }, [id, isEdit, navigate])

  function validate(data: FormData = form): boolean {
    const errs: Record<string, string> = {}
    if (!data.title.trim()) errs.title = 'Title is required'
    if (data.recurring && data.recurringIntervalDays) {
      const days = parseInt(data.recurringIntervalDays)
      if (isNaN(days) || days < 1) errs.recurringIntervalDays = 'Must be a positive number'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // Auto-save handler for edit mode - saves action fields only, not links
  const handleAutoSave = useCallback(async (data: FormData) => {
    const payload = formToPayload(data)
    await api.put(`/actions/${id}`, payload)
    // Note: Links are not auto-saved - they'll save when user clicks Done
  }, [id])

  // Use auto-save hook (only in edit mode)
  const autoSave = useAutoSave({
    data: form,
    originalData: originalForm,
    onSave: handleAutoSave,
    validate: (data) => validate(data),
    enabled: isEdit,
    onRevert: setForm,
  })

  // Link helpers
  function addLink() {
    setForm((prev) => ({ ...prev, links: [...prev.links, { url: '', title: '' }] }))
  }

  function updateLink(index: number, field: keyof LinkEntry, value: string) {
    setForm((prev) => {
      const links = [...prev.links]
      links[index] = { ...links[index], [field]: value }
      return { ...prev, links }
    })
  }

  function removeLink(index: number) {
    setForm((prev) => ({
      ...prev,
      links: prev.links.filter((_, i) => i !== index),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setSaving(true)
    try {
      const payload = formToPayload(form)

      // Auto-create contact if user typed a new name
      if (!payload.contactId && newContactName) {
        try {
          const newContact = await api.post<Contact>('/contacts', {
            name: newContactName,
            status: 'CONNECTED',
            ecosystem: 'ROLODEX',
          })
          payload.contactId = newContact.id
        } catch {
          // If creation fails, proceed without link
        }
      }

      // Auto-create company if user typed a new name
      if (!payload.companyId && newCompanyName) {
        try {
          const newCompany = await api.post<Company>('/companies', {
            name: newCompanyName,
            status: 'CONNECTED',
          })
          payload.companyId = newCompany.id
        } catch {
          // If creation fails, proceed without link
        }
      }

      let actionId: number

      if (isEdit) {
        await api.put(`/actions/${id}`, payload)
        actionId = parseInt(id!)
        // Delete old links
        for (const linkId of existingLinkIds) {
          await api.delete(`/links/${linkId}`).catch(() => {})
        }
      } else {
        const created = await api.post<Action>('/actions', payload)
        actionId = created.id
      }

      // Create new links
      for (const link of form.links) {
        if (link.url.trim()) {
          await api.post('/links', {
            url: link.url.trim(),
            title: link.title.trim() || link.url.trim(),
            actionId,
          }).catch(() => {})
        }
      }

      toast.success(isEdit ? 'Action updated' : 'Action created')
      navigate(`/actions/${actionId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save action')
    } finally {
      setSaving(false)
    }
  }

  function set(field: keyof FormData, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (typeof value === 'string' && errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }))
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            {isEdit ? 'Edit Action' : 'New Action'}
          </h1>
        </div>
        {isEdit && (
          <div className="flex items-center gap-2">
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
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Action Info */}
        <Card>
          <CardHeader>
            <CardTitle>Action Info</CardTitle>
            <CardDescription>What needs to be done</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="e.g. Follow up with Sarah"
                aria-invalid={!!errors.title}
              />
              {errors.title && (
                <p className="text-sm text-destructive">{errors.title}</p>
              )}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Additional details..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select value={form.type} onValueChange={(v) => set('type', v)}>
                <SelectTrigger id="type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => set('priority', v)}>
                <SelectTrigger id="priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_PRIORITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Scheduling */}
        <Card>
          <CardHeader>
            <CardTitle>Scheduling</CardTitle>
            <CardDescription>When it's due and recurrence</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={form.dueDate}
                onChange={(e) => set('dueDate', e.target.value)}
              />
            </div>

            <div className="flex items-end space-x-2 pb-0.5">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.recurring}
                  onChange={(e) => set('recurring', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Recurring action
              </label>
            </div>

            {form.recurring && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="recurringIntervalDays">Repeat every (days)</Label>
                  <Input
                    id="recurringIntervalDays"
                    type="number"
                    min="1"
                    value={form.recurringIntervalDays}
                    onChange={(e) => set('recurringIntervalDays', e.target.value)}
                    placeholder="e.g. 7, 14, 30"
                    aria-invalid={!!errors.recurringIntervalDays}
                  />
                  {errors.recurringIntervalDays && (
                    <p className="text-sm text-destructive">{errors.recurringIntervalDays}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="recurringEndDate">Recurrence End Date</Label>
                  <Input
                    id="recurringEndDate"
                    type="date"
                    value={form.recurringEndDate}
                    onChange={(e) => set('recurringEndDate', e.target.value)}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Related To */}
        <Card>
          <CardHeader>
            <CardTitle>Related To</CardTitle>
            <CardDescription>Connect to a contact or company</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contactId">Contact</Label>
              <Combobox
                options={contactOptions}
                value={form.contactId || newContactName}
                onChange={(val, isNew) => {
                  if (isNew) {
                    setForm((prev) => ({ ...prev, contactId: '' }))
                    setNewContactName(val)
                  } else {
                    setForm((prev) => ({ ...prev, contactId: val }))
                    setNewContactName('')
                  }
                }}
                placeholder="Search or type new name..."
                searchPlaceholder="Search contacts..."
                allowFreeText={true}
              />
              {newContactName && !form.contactId && (
                <p className="text-xs text-muted-foreground">
                  A new contact will be created when you click Done.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="companyId">Company</Label>
              <Combobox
                options={companyOptions}
                value={form.companyId || newCompanyName}
                onChange={(val, isNew) => {
                  if (isNew) {
                    setForm((prev) => ({ ...prev, companyId: '' }))
                    setNewCompanyName(val)
                  } else {
                    setForm((prev) => ({ ...prev, companyId: val }))
                    setNewCompanyName('')
                  }
                }}
                placeholder="Search or type new name..."
                searchPlaceholder="Search companies..."
                allowFreeText={true}
              />
              {newCompanyName && !form.companyId && (
                <p className="text-xs text-muted-foreground">
                  A new company will be created when you click Done.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Document Links */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Document Links</CardTitle>
                <CardDescription>Attach relevant documents or URLs</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addLink}>
                <Plus className="mr-1 h-3 w-3" />
                Add Link
              </Button>
            </div>
          </CardHeader>
          {form.links.length > 0 && (
            <CardContent className="space-y-3">
              {form.links.map((link, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 grid gap-2 sm:grid-cols-2">
                    <Input
                      value={link.url}
                      onChange={(e) => updateLink(i, 'url', e.target.value)}
                      placeholder="URL (e.g. https://drive.google.com/...)"
                    />
                    <Input
                      value={link.title}
                      onChange={(e) => updateLink(i, 'title', e.target.value)}
                      placeholder="Label (optional)"
                    />
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removeLink(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          )}
        </Card>

        {/* Submit */}
        <div className="flex items-center gap-3">
          {isEdit ? (
            <Button
              type="button"
              onClick={() => {
                // Trigger full save with link management before navigating
                handleSubmit({ preventDefault: () => {} } as React.FormEvent)
              }}
              disabled={saving}
              className="flex-1 sm:flex-initial"
            >
              {saving ? 'Saving...' : 'Done'}
            </Button>
          ) : (
            <Button type="submit" disabled={saving} className="flex-1 sm:flex-initial">
              {saving ? 'Saving...' : 'Create Action'}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => navigate(-1)} className="flex-1 sm:flex-initial">
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
