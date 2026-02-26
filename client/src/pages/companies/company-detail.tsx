import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { api } from '@/lib/api'
import type { Company, Contact, Action, LinkRecord, CompanyStatus, CompanyActivity, CompanyActivityType } from '@/lib/types'
import { COMPANY_STATUS_OPTIONS, ECOSYSTEM_OPTIONS, CONTACT_STATUS_OPTIONS, ACTION_TYPE_OPTIONS, ACTION_PRIORITY_OPTIONS, COMPANY_ACTIVITY_TYPE_OPTIONS } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ActionDateSelect } from '@/components/action-date-select'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Pencil, Trash2, ExternalLink, Plus, Check, Loader2, ChevronUp } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Combobox } from '@/components/ui/combobox'

const actionTypeColors: Record<string, string> = {
  EMAIL: 'bg-blue-100 text-blue-800',
  CALL: 'bg-green-100 text-green-800',
  MEET: 'bg-teal-100 text-teal-800',
  READ: 'bg-purple-100 text-purple-800',
  WRITE: 'bg-indigo-100 text-indigo-800',
  RESEARCH: 'bg-amber-100 text-amber-800',
  FOLLOW_UP: 'bg-orange-100 text-orange-800',
  INTRO: 'bg-cyan-100 text-cyan-800',
  APPLIED: 'bg-emerald-100 text-emerald-800',
  OTHER: 'bg-slate-100 text-slate-700',
}

const actionPriorityColors: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  LOW: 'bg-slate-100 text-slate-600',
}

const companyStatusColors: Record<string, string> = {
  RESEARCHING: 'bg-sky-100 text-sky-700',
  ACTIVE_TARGET: 'bg-indigo-100 text-indigo-700',
  IN_DISCUSSIONS: 'bg-violet-100 text-violet-700',
  CONNECTED: 'bg-emerald-100 text-emerald-700',
  ON_HOLD: 'bg-gray-100 text-gray-500',
  CLOSED: 'bg-red-100 text-red-700',
}

const contactStatusColors: Record<string, string> = {
  NEW: 'bg-slate-100 text-slate-700',
  RESEARCHING: 'bg-blue-100 text-blue-700',
  CONNECTED: 'bg-green-100 text-green-700',
  AWAITING_RESPONSE: 'bg-yellow-100 text-yellow-700',
  FOLLOW_UP_NEEDED: 'bg-orange-100 text-orange-700',
  LEAD_TO_PURSUE: 'bg-pink-100 text-pink-700',
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

// Extend Company to include joined relations from the new API
type CompanyWithRelations = Company & {
  employedContacts?: Contact[];
  connectedContacts?: Contact[];
}

export function CompanyDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [company, setCompany] = useState<CompanyWithRelations | null>(null)
  const [actions, setActions] = useState<Action[]>([])
  const [links, setLinks] = useState<LinkRecord[]>([])
  const [activities, setActivities] = useState<CompanyActivity[]>([])
  const [allContacts, setAllContacts] = useState<{ id: number; name: string }[]>([])
  const [selectedContact, setSelectedContact] = useState('')
  const [linkingContact, setLinkingContact] = useState(false)
  const [loading, setLoading] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [newLinkTitle, setNewLinkTitle] = useState('')
  const [showActivityForm, setShowActivityForm] = useState(false)
  const [activityForm, setActivityForm] = useState({ date: new Date().toLocaleDateString('en-CA'), type: 'OTHER' as CompanyActivityType, title: '', notes: '' })
  const [savingActivity, setSavingActivity] = useState(false)

  function loadLinks() {
    if (id) {
      api.get<LinkRecord[]>(`/links?companyId=${id}`).then(setLinks).catch(() => { })
    }
  }

  function loadCompany() {
    if (!id) return;
    api.get<CompanyWithRelations>(`/companies/${id}`)
      .then(setCompany)
      .catch((err) => {
        toast.error(err.message)
        navigate('/companies')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!id) return
    loadCompany();

    api.get<Action[]>(`/actions?companyId=${id}`).then(setActions).catch(() => { })
    api.get<CompanyActivity[]>(`/company-activities?companyId=${id}`).then(setActivities).catch(() => { })
    api.get<{ id: number; name: string }[]>('/contacts/names').then(setAllContacts).catch(() => { })
    loadLinks()
  }, [id, navigate])

  async function toggleActionComplete(action: Action) {
    try {
      const result = await api.patch<{ action: Action; nextAction: Action | null }>(`/actions/${action.id}/complete`)
      const updated = await api.get<Action[]>(`/actions?companyId=${id}`)
      setActions(updated)
      toast.success(action.completed ? 'Marked incomplete' : 'Marked complete')
      if (result.nextAction?.dueDate) {
        toast.info(`Next occurrence created for ${result.nextAction.dueDate}`)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update'
      toast.error(message)
    }
  }

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

  async function handleUpdate(value: string) {
    if (!company) return
    const originalStatus = company.status

    // Optimistic update
    setCompany((prev) => (prev ? { ...prev, status: value as CompanyStatus } : null))

    try {
      await api.put(`/companies/${id}`, { status: value })
      toast.success('Updated')
    } catch (err: unknown) {
      // Revert on failure
      setCompany((prev) => (prev ? { ...prev, status: originalStatus } : null))
      const message = err instanceof Error ? err.message : 'Failed to update'
      toast.error(message)
    }
  }

  async function addLink() {
    if (!newLinkUrl.trim()) return
    try {
      await api.post('/links', {
        url: newLinkUrl.trim(),
        title: newLinkTitle.trim() || newLinkUrl.trim(),
        companyId: parseInt(id!),
      })
      setNewLinkUrl('')
      setNewLinkTitle('')
      loadLinks()
      toast.success('Link added')
    } catch {
      toast.error('Failed to add link')
    }
  }

  async function saveActivity() {
    if (!activityForm.title.trim()) return
    setSavingActivity(true)
    try {
      await api.post('/company-activities', {
        companyId: parseInt(id!),
        date: activityForm.date,
        type: activityForm.type,
        title: activityForm.title.trim(),
        notes: activityForm.notes.trim() || null,
      })
      const updated = await api.get<CompanyActivity[]>(`/company-activities?companyId=${id}`)
      setActivities(updated)
      setActivityForm({ date: new Date().toLocaleDateString('en-CA'), type: 'OTHER', title: '', notes: '' })
      setShowActivityForm(false)
      toast.success('Activity logged')
    } catch {
      toast.error('Failed to log activity')
    } finally {
      setSavingActivity(false)
    }
  }

  async function deleteActivity(activityId: number) {
    try {
      await api.delete(`/company-activities/${activityId}`)
      setActivities((prev) => prev.filter((a) => a.id !== activityId))
      toast.success('Activity removed')
    } catch {
      toast.error('Failed to remove activity')
    }
  }

  async function deleteLink(linkId: number) {
    try {
      await api.delete(`/links/${linkId}`)
      loadLinks()
      toast.success('Link removed')
    } catch {
      toast.error('Failed to remove link')
    }
  }

  async function handleAddContact(type: 'EMPLOYED' | 'CONNECTED') {
    if (!selectedContact) return;
    setLinkingContact(true);

    // Check if selectedContact is an ID (existing) or text (new)
    const isExisting = allContacts.some(c => c.id.toString() === selectedContact);

    const payload = isExisting
      ? { contactId: parseInt(selectedContact), type }
      : { contactName: selectedContact, type };

    try {
      await api.post(`/companies/${id}/contacts`, payload);
      toast.success(`Contact linked as ${type.toLowerCase()}`);
      setSelectedContact('');
      loadCompany();
      // Also refresh the contacts list so the new contact is available in the dropdown immediately
      const updatedNames = await api.get<{ id: number; name: string }[]>('/contacts/names');
      setAllContacts(updatedNames);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to link contact');
    } finally {
      setLinkingContact(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  }

  if (!company) {
    return <div className="text-muted-foreground">Company not found.</div>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 sm:items-center sm:gap-4">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate('/companies')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{company.name}</h1>
            {company.industry && (
              <p className="text-sm text-muted-foreground">{company.industry}</p>
            )}
            <div className="mt-2">
              <DropdownMenu>
                <DropdownMenuTrigger className="focus:outline-none">
                  <Badge variant="outline" className={`${companyStatusColors[company.status]} hover:bg-opacity-80 cursor-pointer transition-colors`}>
                    {getLabel(company.status, COMPANY_STATUS_OPTIONS)}
                  </Badge>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Change Status</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup
                    value={company.status}
                    onValueChange={(val) => handleUpdate(val)}
                  >
                    {COMPANY_STATUS_OPTIONS.map((option) => (
                      <DropdownMenuRadioItem key={option.value} value={option.value}>
                        <Badge variant="outline" className={`mr-2 ${companyStatusColors[option.value]}`}>
                          {option.label}
                        </Badge>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" asChild className="flex-1 sm:flex-initial">
            <Link to={`/companies/${company.id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Link>
          </Button>
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1 sm:flex-initial">
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
            <div className="text-sm prep-note-markdown"><ReactMarkdown>{company.notes}</ReactMarkdown></div>
          </CardContent>
        </Card>
      )}

      {/* Activity Log */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            Activity Log{' '}
            {activities.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({activities.length})
              </span>
            )}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowActivityForm(!showActivityForm)}
          >
            {showActivityForm ? (
              <><ChevronUp className="mr-1 h-3 w-3" /> Cancel</>
            ) : (
              <><Plus className="mr-1 h-3 w-3" /> Log Activity</>
            )}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {showActivityForm && (
            <div className="rounded-md border p-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="activity-date">Date</Label>
                  <Input
                    id="activity-date"
                    type="date"
                    value={activityForm.date}
                    onChange={(e) => setActivityForm((f) => ({ ...f, date: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="activity-type">Type</Label>
                  <Select
                    value={activityForm.type}
                    onValueChange={(val) => setActivityForm((f) => ({ ...f, type: val as CompanyActivityType }))}
                  >
                    <SelectTrigger id="activity-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPANY_ACTIVITY_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="activity-title">Title</Label>
                <Input
                  id="activity-title"
                  value={activityForm.title}
                  onChange={(e) => setActivityForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder='e.g. "Applied to Senior PM role"'
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="activity-notes">Notes (optional, supports markdown)</Label>
                <Textarea
                  id="activity-notes"
                  value={activityForm.notes}
                  onChange={(e) => setActivityForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Additional details..."
                  rows={3}
                />
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={saveActivity} disabled={!activityForm.title.trim() || savingActivity}>
                  {savingActivity ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          )}

          {activities.length === 0 && !showActivityForm ? (
            <p className="text-sm text-muted-foreground">No activities logged yet.</p>
          ) : (
            <div className="space-y-3">
              {activities.map((activity) => (
                <div key={activity.id} className="group flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`text-xs ${actionTypeColors[activity.type] || 'bg-slate-100 text-slate-700'}`}>
                        {COMPANY_ACTIVITY_TYPE_OPTIONS.find((o) => o.value === activity.type)?.label ?? activity.type}
                      </Badge>
                      <span className="text-sm font-medium">{activity.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(activity.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    {activity.notes && (
                      <div className="mt-1 text-sm text-muted-foreground prep-note-markdown">
                        <ReactMarkdown>{activity.notes}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => deleteActivity(activity.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Links */}
      <Card>
        <CardHeader>
          <CardTitle>Links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {links.length > 0 && (
            <ul className="space-y-2">
              {links.map((link) => (
                <li key={link.id} className="flex items-center justify-between gap-2">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline truncate"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    {link.title}
                  </a>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => deleteLink(link.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 items-end">
            <div className="flex-1 grid gap-2 sm:grid-cols-2">
              <Input
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                placeholder="URL (Google Drive, webpage, etc.)"
                onKeyDown={(e) => e.key === 'Enter' && addLink()}
              />
              <Input
                value={newLinkTitle}
                onChange={(e) => setNewLinkTitle(e.target.value)}
                placeholder="Label (optional)"
                onKeyDown={(e) => e.key === 'Enter' && addLink()}
              />
            </div>
            <Button size="sm" onClick={addLink} disabled={!newLinkUrl.trim()}>
              <Plus className="mr-1 h-3 w-3" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

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
        <CardContent className="space-y-6">
          {/* Add Contact Section */}
          <div className="flex gap-2 items-start">
            <div className="flex-1">
              <Combobox
                options={allContacts.map((c) => ({
                  value: c.id.toString(),
                  label: c.name,
                }))}
                value={selectedContact}
                onChange={(val) => setSelectedContact(val)}
                placeholder="Search to add or type new name..."
                allowFreeText={true}
                disabled={linkingContact}
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAddContact('EMPLOYED')}
                disabled={!selectedContact || linkingContact}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add as Employed
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAddContact('CONNECTED')}
                disabled={!selectedContact || linkingContact}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add as Connected
              </Button>
            </div>
          </div>

          <Separator />

          {/* Employed Contacts */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Employed</h3>
            {company.employedContacts && company.employedContacts.length > 0 ? (
              <div className="space-y-3">
                {company.employedContacts.map((c) => (
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
              <p className="text-sm text-muted-foreground">No employed contacts listed.</p>
            )}
          </div>

          <Separator />

          {/* Connected Contacts */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Connected</h3>
            {company.connectedContacts && company.connectedContacts.length > 0 ? (
              <div className="space-y-3">
                {company.connectedContacts.map((c) => (
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
              <p className="text-sm text-muted-foreground">No connected contacts listed.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Actions</CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/actions/new?companyId=${company.id}`}>
              <Plus className="mr-1 h-3 w-3" />
              New Action
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {actions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No actions yet.</p>
          ) : (
            <div className="space-y-2">
              {actions.map((action) => {
                return (
                  <div key={action.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50">
                    <button
                      onClick={() => toggleActionComplete(action)}
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${action.completed
                        ? 'border-green-500 bg-green-500 text-white'
                        : 'border-muted-foreground/30 hover:border-green-500'
                        }`}
                    >
                      {action.completed && <Check className="h-2.5 w-2.5" />}
                    </button>
                    <Link
                      to={`/actions/${action.id}`}
                      className={`flex-1 text-sm hover:underline ${action.completed ? 'text-muted-foreground line-through' : ''}`}
                    >
                      {action.title}
                    </Link>
                    <Badge variant="outline" className={`text-xs ${actionTypeColors[action.type]}`}>
                      {getLabel(action.type, ACTION_TYPE_OPTIONS)}
                    </Badge>
                    <Badge variant="outline" className={`text-xs ${actionPriorityColors[action.priority]}`}>
                      {getLabel(action.priority, ACTION_PRIORITY_OPTIONS)}
                    </Badge>
                    <div onClick={(e) => e.stopPropagation()}>
                      <ActionDateSelect
                        action={action}
                        onUpdate={() => {
                          api.get<Action[]>(`/actions?companyId=${action.companyId || ''}`).then((res) => setActions(res)).catch(() => { })
                        }}
                        className="-ml-2 h-8"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
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
