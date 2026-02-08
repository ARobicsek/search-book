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

function escapeSQL(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') return String(value)
  const str = String(value).replace(/'/g, "''")
  return `'${str}'`
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
      // 1. Fetch table schemas (single fast query)
      const tables = await api.get<{ name: string; sql: string }[]>('/backup/schema')

      // 2. Fetch each table's data individually (avoids Vercel 30s timeout)
      const tableData: { name: string; sql: string; rows: Record<string, unknown>[] }[] = []
      for (const table of tables) {
        const rows = await api.get<Record<string, unknown>[]>(`/backup/data/${table.name}`)
        tableData.push({ ...table, rows })
      }

      // 3. Assemble SQL dump client-side
      let sql = '-- SearchBook Database Backup\n'
      sql += `-- Created: ${new Date().toISOString()}\n`
      sql += '-- Usage: sqlite3 searchbook.db < this-file.sql\n\n'
      sql += 'PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n\n'

      for (const table of tableData) {
        sql += `-- Table: ${table.name}\n`
        sql += `DROP TABLE IF EXISTS "${table.name}";\n`
        sql += `${table.sql};\n\n`

        for (const row of table.rows) {
          const cols = Object.keys(row)
          const vals = cols.map((c) => escapeSQL(row[c]))
          sql += `INSERT INTO "${table.name}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${vals.join(', ')});\n`
        }
        if (table.rows.length > 0) sql += '\n'
      }

      sql += 'COMMIT;\nPRAGMA foreign_keys=ON;\n'

      // 4. Trigger browser download
      const blob = new Blob([sql], { type: 'application/sql' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `searchbook-backup-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.sql`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Backup downloaded')
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
            Download a SQL backup of your entire database. Can be imported into a local SQLite database if needed.
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
