import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PASSWORD_STORAGE_KEY } from '@/lib/api'

/**
 * Shared-password login gate (Task 1). Shown when no password is stored, or
 * after a 401 clears it. Validates the entered password against the server's
 * gate via GET /api/auth/check before storing it, so a wrong password is
 * rejected instead of being saved and failing on every later request.
 */
export function LoginGate({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!password || loading) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/check', {
        headers: { 'x-app-password': password },
      })
      if (res.ok) {
        localStorage.setItem(PASSWORD_STORAGE_KEY, password)
        onSuccess()
      } else if (res.status === 401) {
        setError('Incorrect password. Please try again.')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>SearchBook</CardTitle>
          <CardDescription>Enter your password to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="app-password">Password</Label>
              <Input
                id="app-password"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) setError('')
                }}
                aria-invalid={!!error}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <Button type="submit" disabled={loading || !password} className="w-full">
              {loading ? 'Unlocking…' : 'Unlock'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
