import { useRef, useState } from 'react'
import { api } from '@/lib/api'
import { exportViaTurso, importViaTurso, type BackupProgress } from '@/lib/backup'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
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
import { toast } from 'sonner'
import { Download, Upload, Loader2, FolderOpen, X } from 'lucide-react'

export function SettingsPage() {
  const [backingUp, setBackingUp] = useState(false)
  const [backupProgress, setBackupProgress] = useState<BackupProgress | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreProgress, setRestoreProgress] = useState<BackupProgress | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [showSaveReminder, setShowSaveReminder] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleBackup() {
    setBackingUp(true)
    setBackupProgress(null)
    try {
      // Try browser-direct Turso export first
      let data = await exportViaTurso((p) => setBackupProgress(p))

      // Fallback to server-side export (local dev)
      if (data === null) {
        data = await api.get<Record<string, unknown>>('/backup/export')
      }

      // Save to project backups/ folder (works locally, silently fails in production)
      api.post('/backup/save-local', data).catch(() => {})

      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `searchbook-backup-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Backup downloaded')
      setShowSaveReminder(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Backup failed')
    } finally {
      setBackingUp(false)
      setBackupProgress(null)
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    setConfirmOpen(true)
    // Reset input so the same file can be re-selected
    e.target.value = ''
  }

  async function handleRestore() {
    if (!pendingFile) return
    setRestoring(true)
    setRestoreProgress(null)
    setConfirmOpen(false)
    try {
      const text = await pendingFile.text()
      const data = JSON.parse(text)

      if (!data._meta) {
        throw new Error('Invalid backup file: missing _meta field')
      }

      // Try browser-direct Turso import first
      const result = await importViaTurso(data, (p) => setRestoreProgress(p))

      // Fallback to server-side import (local dev)
      if (result === null) {
        await api.post('/backup/import', data)
      }

      toast.success('Restore completed. Reloading...')
      setTimeout(() => window.location.reload(), 1500)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restore failed')
      setRestoring(false)
      setRestoreProgress(null)
    }
  }

  function formatProgress(progress: BackupProgress | null, defaultText: string): string {
    if (!progress) return defaultText
    const { phase, table, index, total } = progress
    const label = phase === 'delete' ? 'Clearing' : phase === 'import' ? 'Restoring' : 'Exporting'
    return `${label} ${table} (${index + 1}/${total})...`
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
            Download a full backup of your database as JSON.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleBackup} disabled={backingUp || restoring}>
            {backingUp ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {formatProgress(backupProgress, 'Starting backup...')}
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

      {showSaveReminder && (
        <div className="relative rounded-lg border border-amber-300 bg-amber-50 p-4">
          <button
            onClick={() => setShowSaveReminder(false)}
            className="absolute right-2 top-2 rounded p-1 text-amber-600 hover:bg-amber-100"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-3 pr-6">
            <FolderOpen className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-900">
                Copy backup to project folder
              </p>
              <p className="mt-1 text-sm text-amber-800">
                Move the downloaded JSON file from your Downloads folder into{' '}
                <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
                  SearchBook/backups/
                </code>{' '}
                to keep a local copy with your project.
              </p>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Restore from Backup</CardTitle>
          <CardDescription>
            Upload a backup JSON file to replace all current data. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            variant="destructive"
            onClick={() => fileInputRef.current?.click()}
            disabled={backingUp || restoring}
          >
            {restoring ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {formatProgress(restoreProgress, 'Starting restore...')}
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Restore from JSON File
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Restore confirmation */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore from Backup</DialogTitle>
            <DialogDescription>
              This will delete all current data and replace it with the contents of{' '}
              <strong>{pendingFile?.name}</strong>. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRestore}>
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
