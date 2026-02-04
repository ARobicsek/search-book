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
import { toast } from 'sonner'
import { Users, Loader2, RefreshCw } from 'lucide-react'

interface DuplicateContact {
  id: number
  name: string
  email: string | null
  title: string | null
  linkedinUrl: string | null
  company: { id: number; name: string } | null
}

interface DuplicatePair {
  contact1: DuplicateContact
  contact2: DuplicateContact
  score: number
  reasons: string[]
}

export function DuplicatesPage() {
  const [duplicates, setDuplicates] = useState<DuplicatePair[]>([])
  const [loading, setLoading] = useState(true)
  const [merging, setMerging] = useState(false)
  const [confirmMerge, setConfirmMerge] = useState<{
    keepId: number
    removeId: number
    keepName: string
    removeName: string
  } | null>(null)

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

  async function handleMerge() {
    if (!confirmMerge) return
    setMerging(true)
    try {
      await api.post('/duplicates/merge', {
        keepId: confirmMerge.keepId,
        removeId: confirmMerge.removeId,
      })
      toast.success(`Merged "${confirmMerge.removeName}" into "${confirmMerge.keepName}"`)
      setConfirmMerge(null)
      loadDuplicates()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to merge')
    } finally {
      setMerging(false)
    }
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

                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setConfirmMerge({
                        keepId: dup.contact1.id,
                        removeId: dup.contact2.id,
                        keepName: dup.contact1.name,
                        removeName: dup.contact2.name,
                      })
                    }
                  >
                    Keep "{dup.contact1.name}"
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setConfirmMerge({
                        keepId: dup.contact2.id,
                        removeId: dup.contact1.id,
                        keepName: dup.contact2.name,
                        removeName: dup.contact1.name,
                      })
                    }
                  >
                    Keep "{dup.contact2.name}"
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Merge confirmation */}
      <Dialog open={confirmMerge !== null} onOpenChange={(open) => !open && setConfirmMerge(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Contacts</DialogTitle>
            <DialogDescription>
              All conversations, actions, relationships, and other data from "{confirmMerge?.removeName}" will be
              moved to "{confirmMerge?.keepName}". Then "{confirmMerge?.removeName}" will be deleted.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmMerge(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleMerge} disabled={merging}>
              {merging ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Merging...
                </>
              ) : (
                'Merge'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
