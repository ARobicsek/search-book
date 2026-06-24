import { useEffect, useState } from 'react'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  isPushSupported,
  isPushConfigured,
  isPushEnabled,
  enablePush,
  disablePush,
  notificationPermission,
} from '@/lib/push'

// Settings card to turn Web Push action reminders on/off for THIS device. Each browser/
// device is its own subscription, so the owner enables it once per device they want alerts on.
export function NotificationsCard() {
  const [supported] = useState(isPushSupported())
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supported) return
    ;(async () => {
      setConfigured(await isPushConfigured())
      setEnabled(await isPushEnabled())
    })()
  }, [supported])

  const blocked = supported && notificationPermission() === 'denied'

  async function handleEnable() {
    setBusy(true)
    try {
      await enablePush()
      setEnabled(true)
      toast.success('Notifications enabled on this device')
    } catch (err: any) {
      toast.error(err?.message || 'Could not enable notifications')
    } finally {
      setBusy(false)
    }
  }

  async function handleDisable() {
    setBusy(true)
    try {
      await disablePush()
      setEnabled(false)
      toast.success('Notifications disabled on this device')
    } catch (err: any) {
      toast.error(err?.message || 'Could not disable notifications')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          Get a push notification when an action with a reminder comes due. Reminders are opt-in
          per action (the bell on a due date) — enable them on each device you want alerts on.
          Times use US Eastern time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!supported ? (
          <p className="text-sm text-muted-foreground">
            This browser doesn’t support push notifications. On iPhone/iPad, install SearchBook to
            your Home Screen first, then enable notifications from the installed app.
          </p>
        ) : configured === false ? (
          <p className="text-sm text-muted-foreground">
            Push isn’t configured on the server yet (missing VAPID keys). Once configured, you can
            enable notifications here.
          </p>
        ) : blocked && !enabled ? (
          <p className="text-sm text-muted-foreground">
            Notifications are blocked for this site. Allow them in your browser’s site settings,
            then reload and try again.
          </p>
        ) : enabled ? (
          <Button variant="outline" onClick={handleDisable} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BellOff className="mr-2 h-4 w-4" />}
            Disable on this device
          </Button>
        ) : (
          <Button onClick={handleEnable} disabled={busy || configured === null}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
            Enable on this device
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
