import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Download, Upload, Loader2 } from 'lucide-react'

interface Backup {
  name: string
  created: string
}

export function SettingsPage() {
  const [backingUp, setBackingUp] = useState(false)
  const [backups, setBackups] = useState<Backup[]>([])
  const [selectedBackup, setSelectedBackup] = useState('')
  const [restoring, setRestoring] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  function loadBackups() {
    api.get<Backup[]>('/backup').then(setBackups).catch(() => {})
  }

  useEffect(() => {
    loadBackups()
  }, [])

  async function handleBackup() {
    setBackingUp(true)
    try {
      const result = await api.post<{ message: string; name: string; path: string }>('/backup', {})
      toast.success(`Backup created: ${result.name}`)
      loadBackups()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Backup failed')
    } finally {
      setBackingUp(false)
    }
  }

  async function handleRestore() {
    if (!selectedBackup) return
    setRestoring(true)
    try {
      await api.post('/backup/restore', { backupName: selectedBackup })
      toast.success('Restore completed. Reloading page...')
      setConfirmOpen(false)
      setTimeout(() => window.location.reload(), 2000)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restore failed')
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your SearchBook data</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create Backup</CardTitle>
          <CardDescription>
            Back up your database and photos. Backups are saved in the server's backups folder.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleBackup} disabled={backingUp}>
            {backingUp ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating backup...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Create Backup
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Restore from Backup</CardTitle>
          <CardDescription>
            Replace your current data with a previous backup. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {backups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No backups available.</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Select Backup</Label>
                <Select value={selectedBackup} onValueChange={setSelectedBackup}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a backup..." />
                  </SelectTrigger>
                  <SelectContent>
                    {backups.map((b) => (
                      <SelectItem key={b.name} value={b.name}>
                        {b.name} — {new Date(b.created).toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="destructive"
                disabled={!selectedBackup || restoring}
                onClick={() => setConfirmOpen(true)}
              >
                <Upload className="mr-2 h-4 w-4" />
                Restore Backup
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Restore confirmation */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Backup</DialogTitle>
            <DialogDescription>
              This will replace your current database and photos with the selected backup.
              This action cannot be undone. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRestore} disabled={restoring}>
              {restoring ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Restoring...
                </>
              ) : (
                'Restore'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
