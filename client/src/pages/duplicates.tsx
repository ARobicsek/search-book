import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
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
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { Users, Loader2, RefreshCw, GitMerge } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DuplicateContact {
  id: number
  name: string
  email: string | null
  phone: string | null
  title: string | null
  linkedinUrl: string | null
  ecosystem: string
  status: string
  location: string | null
  howConnected: string | null
  personalDetails: string | null
  roleDescription: string | null
  notes: string | null
  photoFile: string | null
  photoUrl: string | null
  company: { id: number; name: string } | null
}

interface DuplicatePair {
  contact1: DuplicateContact
  contact2: DuplicateContact
  score: number
  reasons: string[]
}

type FieldSelection = 1 | 2

interface MergeState {
  pair: DuplicatePair
  keepId: number
  fieldSelections: Record<string, FieldSelection>
}

// Fields that can be selected during merge
const MERGEABLE_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'title', label: 'Title' },
  { key: 'linkedinUrl', label: 'LinkedIn' },
  { key: 'ecosystem', label: 'Ecosystem' },
  { key: 'status', label: 'Status' },
  { key: 'location', label: 'Location' },
  { key: 'howConnected', label: 'How Connected' },
  { key: 'personalDetails', label: 'Personal Details' },
  { key: 'roleDescription', label: 'Role Description' },
  { key: 'notes', label: 'Notes' },
] as const

export function DuplicatesPage() {
  const [duplicates, setDuplicates] = useState<DuplicatePair[]>([])
  const [loading, setLoading] = useState(true)
  const [merging, setMerging] = useState(false)
  const [mergeState, setMergeState] = useState<MergeState | null>(null)

  function loadDuplicates() {
    setLoading(true)
    api
      .get<DuplicatePair[]>('/duplicates')
      .then(setDuplicates)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to scan'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadDuplicates()
  }, [])

  function openMergeDialog(pair: DuplicatePair, keepId: number) {
    // Initialize field selections - default to keeping values from the "keep" contact
    const isKeepingContact1 = keepId === pair.contact1.id
    const defaultSelection: FieldSelection = isKeepingContact1 ? 1 : 2

    const fieldSelections: Record<string, FieldSelection> = {}
    for (const field of MERGEABLE_FIELDS) {
      fieldSelections[field.key] = defaultSelection
    }

    setMergeState({ pair, keepId, fieldSelections })
  }

  function setFieldSelection(field: string, selection: FieldSelection) {
    if (!mergeState) return
    setMergeState({
      ...mergeState,
      fieldSelections: { ...mergeState.fieldSelections, [field]: selection },
    })
  }

  async function handleMerge() {
    if (!mergeState) return
    setMerging(true)

    const removeId = mergeState.keepId === mergeState.pair.contact1.id
      ? mergeState.pair.contact2.id
      : mergeState.pair.contact1.id
    const keepName = mergeState.keepId === mergeState.pair.contact1.id
      ? mergeState.pair.contact1.name
      : mergeState.pair.contact2.name
    const removeName = mergeState.keepId === mergeState.pair.contact1.id
      ? mergeState.pair.contact2.name
      : mergeState.pair.contact1.name

    try {
      await api.post('/duplicates/merge', {
        keepId: mergeState.keepId,
        removeId,
        fieldSelections: mergeState.fieldSelections,
      })
      toast.success(`Merged "${removeName}" into "${keepName}"`)
      setMergeState(null)
      loadDuplicates()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to merge')
    } finally {
      setMerging(false)
    }
  }

  function getFieldValue(contact: DuplicateContact, field: string): string {
    const value = contact[field as keyof DuplicateContact]
    if (value === null || value === undefined) return '(empty)'
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str
    return str.slice(0, maxLen - 3) + '...'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Duplicate Contacts</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? 'Scanning...' : `${duplicates.length} potential duplicate${duplicates.length !== 1 ? 's' : ''} found`}
          </p>
        </div>
        <Button variant="outline" onClick={loadDuplicates} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Rescan
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : duplicates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No duplicates found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {duplicates.map((dup, idx) => (
            <Card key={idx}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Potential Match</CardTitle>
                  <div className="flex gap-1">
                    {dup.reasons.map((reason, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {reason}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Contact 1 */}
                  <div className="rounded-md border p-3 space-y-1">
                    <p className="font-medium">{dup.contact1.name}</p>
                    {dup.contact1.title && (
                      <p className="text-sm text-muted-foreground">{dup.contact1.title}</p>
                    )}
                    {dup.contact1.company && (
                      <p className="text-sm text-muted-foreground">{dup.contact1.company.name}</p>
                    )}
                    {dup.contact1.email && (
                      <p className="text-xs text-muted-foreground">{dup.contact1.email}</p>
                    )}
                    <Link
                      to={`/contacts/${dup.contact1.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      View profile
                    </Link>
                  </div>

                  {/* Contact 2 */}
                  <div className="rounded-md border p-3 space-y-1">
                    <p className="font-medium">{dup.contact2.name}</p>
                    {dup.contact2.title && (
                      <p className="text-sm text-muted-foreground">{dup.contact2.title}</p>
                    )}
                    {dup.contact2.company && (
                      <p className="text-sm text-muted-foreground">{dup.contact2.company.name}</p>
                    )}
                    {dup.contact2.email && (
                      <p className="text-xs text-muted-foreground">{dup.contact2.email}</p>
                    )}
                    <Link
                      to={`/contacts/${dup.contact2.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      View profile
                    </Link>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openMergeDialog(dup, dup.contact1.id)}
                  >
                    <GitMerge className="mr-2 h-4 w-4" />
                    Merge (keep {truncate(dup.contact1.name, 15)})
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openMergeDialog(dup, dup.contact2.id)}
                  >
                    <GitMerge className="mr-2 h-4 w-4" />
                    Merge (keep {truncate(dup.contact2.name, 15)})
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Field Selection Merge Dialog */}
      <Dialog open={mergeState !== null} onOpenChange={(open) => !open && setMergeState(null)}>
        <DialogContent className="sm:max-w-2xl" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Merge Contacts</DialogTitle>
            <DialogDescription>
              Select which value to keep for each field. All conversations, actions, relationships,
              and other data will be combined into the kept contact.
            </DialogDescription>
          </DialogHeader>

          {mergeState && (
            <ScrollArea className="max-h-[60vh] pr-4">
              <div className="space-y-4">
                {MERGEABLE_FIELDS.map(({ key, label }) => {
                  const val1 = getFieldValue(mergeState.pair.contact1, key)
                  const val2 = getFieldValue(mergeState.pair.contact2, key)
                  const bothEmpty = val1 === '(empty)' && val2 === '(empty)'
                  const sameValue = val1 === val2

                  if (bothEmpty) return null

                  return (
                    <div key={key} className="space-y-2">
                      <Label className="text-sm font-medium">{label}</Label>
                      {sameValue ? (
                        <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-2">
                          {val1}
                        </div>
                      ) : (
                        <RadioGroup
                          value={String(mergeState.fieldSelections[key])}
                          onValueChange={(v) => setFieldSelection(key, parseInt(v) as FieldSelection)}
                          className="grid grid-cols-2 gap-2"
                        >
                          <Label
                            htmlFor={`${key}-1`}
                            className={cn(
                              "flex items-start gap-2 rounded-md border p-3 cursor-pointer transition-colors",
                              mergeState.fieldSelections[key] === 1
                                ? "border-primary bg-primary/5"
                                : "border-muted hover:border-muted-foreground/50"
                            )}
                          >
                            <RadioGroupItem value="1" id={`${key}-1`} className="mt-0.5" />
                            <span className="text-sm break-words">{val1}</span>
                          </Label>
                          <Label
                            htmlFor={`${key}-2`}
                            className={cn(
                              "flex items-start gap-2 rounded-md border p-3 cursor-pointer transition-colors",
                              mergeState.fieldSelections[key] === 2
                                ? "border-primary bg-primary/5"
                                : "border-muted hover:border-muted-foreground/50"
                            )}
                          >
                            <RadioGroupItem value="2" id={`${key}-2`} className="mt-0.5" />
                            <span className="text-sm break-words">{val2}</span>
                          </Label>
                        </RadioGroup>
                      )}
                    </div>
                  )
                })}

                <div className="border-t pt-4 mt-4">
                  <p className="text-sm text-muted-foreground">
                    <strong>Automatically combined:</strong> Company associations, conversations,
                    actions, relationships, links, prep notes, and tags from both contacts.
                  </p>
                </div>
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setMergeState(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleMerge} disabled={merging}>
              {merging ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Merging...
                </>
              ) : (
                'Merge Contacts'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
