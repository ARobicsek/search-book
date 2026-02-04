import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Action, Contact, Company } from '@/lib/types'
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { toast } from 'sonner'
import { ArrowLeft , Loader2 } from 'lucide-react'

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
  const [contacts, setContacts] = useState<Contact[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    api.get<Contact[]>('/contacts').then(setContacts).catch(() => toast.error('Failed to load contacts'))
    api.get<Company[]>('/companies').then(setCompanies).catch(() => toast.error('Failed to load companies'))

    if (isEdit && id) {
      api
        .get<Action>(`/actions/${id}`)
        .then((action) => setForm(actionToForm(action)))
        .catch((err) => {
          toast.error(err.message)
          navigate('/actions')
        })
        .finally(() => setLoading(false))
    }
  }, [id, isEdit, navigate])

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!form.title.trim()) errs.title = 'Title is required'
    if (form.recurring && form.recurringIntervalDays) {
      const days = parseInt(form.recurringIntervalDays)
      if (isNaN(days) || days < 1) errs.recurringIntervalDays = 'Must be a positive number'
    }
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
        await api.put(`/actions/${id}`, payload)
        toast.success('Action updated')
        navigate(`/actions/${id}`)
      } else {
        const created = await api.post<Action>('/actions', payload)
        toast.success('Action created')
        navigate(`/actions/${created.id}`)
      }
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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">
          {isEdit ? 'Edit Action' : 'New Action'}
        </h1>
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

        {/* Links */}
        <Card>
          <CardHeader>
            <CardTitle>Links</CardTitle>
            <CardDescription>Connect to a contact or company</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contactId">Contact</Label>
              <Select
                value={form.contactId || '_none'}
                onValueChange={(v) => set('contactId', v === '_none' ? '' : v)}
              >
                <SelectTrigger id="contactId" className="w-full">
                  <SelectValue placeholder="Select a contact" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Action'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
