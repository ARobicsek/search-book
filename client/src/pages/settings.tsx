import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { exportViaTurso, importViaTurso, type BackupProgress } from '@/lib/backup'
import { buildBinariesZip } from '@/lib/photo-backup'
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
import { Download, Upload, Loader2, FolderOpen, X, Cloud } from 'lucide-react'

interface AutoBackup {
  name: string
  url: string
  size: number
  uploadedAt: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatBackupDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// How many automatic backups to show before the "Show all" expander.
const VISIBLE_BACKUPS = 5

export function SettingsPage() {
  const [backingUp, setBackingUp] = useState(false)
  const [backupProgress, setBackupProgress] = useState<BackupProgress | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreProgress, setRestoreProgress] = useState<BackupProgress | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [showSaveReminder, setShowSaveReminder] = useState(false)
  const [autoBackups, setAutoBackups] = useState<AutoBackup[]>([])
  const [loadingBackups, setLoadingBackups] = useState(true)
  const [backingUpNow, setBackingUpNow] = useState(false)
  const [showAllBackups, setShowAllBackups] = useState(false)
  const [photoProgress, setPhotoProgress] = useState<{ done: number; total: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function loadBackups() {
    setLoadingBackups(true)
    try {
      setAutoBackups(await api.get<AutoBackup[]>('/backup/list'))
    } catch {
      // non-fatal — list just stays empty
    } finally {
      setLoadingBackups(false)
    }
  }

  useEffect(() => {
    loadBackups()
  }, [])

  async function handleBackupNow() {
    setBackingUpNow(true)
    try {
      const res = await api.get<{ ok: boolean; reason?: string }>('/backup/cron')
      if (res.ok) {
        toast.success('Backup saved to cloud storage')
        await loadBackups()
      } else {
        toast.message(res.reason || 'Automatic backups are only available in production')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Backup failed')
    } finally {
      setBackingUpNow(false)
    }
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

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
      downloadBlob(
        new Blob([json], { type: 'application/json' }),
        `searchbook-backup-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.json`,
      )
      toast.success('Backup downloaded')
      setShowSaveReminder(true)

      // Bundle the actual binary files (photos, meeting attachments, pasted
      // screenshots) into a single ZIP you keep locally and overwrite each time
      // (kept out of the daily cloud backup on purpose).
      setBackupProgress(null)
      setPhotoProgress({ done: 0, total: 0 })
      const binaries = await buildBinariesZip(data, (done, total) =>
        setPhotoProgress({ done, total }),
      )
      if (binaries.zip) {
        // cast: fflate returns Uint8Array<ArrayBufferLike>, which the DOM lib's
        // BlobPart type (ArrayBufferView<ArrayBuffer>) rejects; safe at runtime.
        downloadBlob(
          new Blob([binaries.zip as unknown as BlobPart], { type: 'application/zip' }),
          'searchbook-files.zip',
        )
        const mb = (binaries.bytes / 1_048_576).toFixed(1)
        const skipped = binaries.skipped ? `, ${binaries.skipped} skipped` : ''
        toast.success(`Files backed up: ${binaries.saved} files (${mb} MB)${skipped}`)
      } else {
        toast.message('No files to back up')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Backup failed')
    } finally {
      setBackingUp(false)
      setBackupProgress(null)
      setPhotoProgress(null)
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
            Downloads a full backup of your database as JSON, plus a{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">searchbook-files.zip</code>{' '}
            of the actual binary files (photos, meeting attachments, and pasted
            screenshots). Keep both locally and overwrite the ZIP each time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleBackup} disabled={backingUp || restoring}>
            {backingUp ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {photoProgress
                  ? `Backing up files (${photoProgress.done}/${photoProgress.total})...`
                  : formatProgress(backupProgress, 'Starting backup...')}
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
          <CardTitle>Automatic backups</CardTitle>
          <CardDescription>
            A complete backup is saved to secure cloud storage automatically every day. The 30
            most recent are kept and available to download here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" onClick={handleBackupNow} disabled={backingUpNow}>
            {backingUpNow ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Backing up...
              </>
            ) : (
              <>
                <Cloud className="mr-2 h-4 w-4" />
                Back up now
              </>
            )}
          </Button>

          {loadingBackups ? (
            <p className="text-sm text-muted-foreground">Loading backups...</p>
          ) : autoBackups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No automatic backups yet. They appear here once the app is deployed and the daily
              backup has run (or after you use “Back up now”).
            </p>
          ) : (
            <>
              <ul className="divide-y rounded-md border">
                {(showAllBackups ? autoBackups : autoBackups.slice(0, VISIBLE_BACKUPS)).map((b) => (
                  <li
                    key={b.name}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{formatBackupDate(b.uploadedAt)}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(b.size)}</p>
                    </div>
                    <a
                      href={b.url}
                      className="shrink-0 text-primary hover:underline"
                      download
                    >
                      Download
                    </a>
                  </li>
                ))}
              </ul>
              {autoBackups.length > VISIBLE_BACKUPS && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => setShowAllBackups((v) => !v)}
                >
                  {showAllBackups ? 'Show fewer' : `Show all ${autoBackups.length}`}
                </Button>
              )}
            </>
          )}
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
