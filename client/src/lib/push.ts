// Client-side Web Push enable/disable.
//
// Reminders are opt-in: nothing here runs until the user flips a "Remind me" toggle or the
// Settings "Enable notifications" button — both user gestures, as the Notification permission
// prompt requires. Subscriptions are stored server-side (one row per device) and fanned out
// by the free external cron that pokes /api/cron/reminders.
import { api } from './api'

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

// VAPID public key (base64url) → Uint8Array for applicationServerKey.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  // Back it with a concrete ArrayBuffer so the type satisfies BufferSource (applicationServerKey).
  const output = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

let cachedPublicKey: string | null | undefined

async function getPublicKey(): Promise<string | null> {
  if (cachedPublicKey !== undefined) return cachedPublicKey ?? null
  try {
    const { publicKey } = await api.get<{ publicKey: string | null }>('/push/public-key')
    cachedPublicKey = publicKey
    return publicKey
  } catch {
    cachedPublicKey = null
    return null
  }
}

// Whether push is configured on the server (VAPID keys present). Lets the UI hide the toggle.
export async function isPushConfigured(): Promise<boolean> {
  return (await getPublicKey()) !== null
}

// True when this device currently has an active push subscription.
export async function isPushEnabled(): Promise<boolean> {
  if (!isPushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return !!sub
  } catch {
    return false
  }
}

// Request permission + subscribe + register with the server. Returns true on success.
// Throws with a user-facing message when permission is denied or push is unconfigured.
export async function enablePush(): Promise<boolean> {
  if (!isPushSupported()) throw new Error('Notifications are not supported on this device/browser.')

  const publicKey = await getPublicKey()
  if (!publicKey) throw new Error('Push notifications are not configured on the server yet.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked. Enable them in your browser/site settings.'
        : 'Notification permission was not granted.',
    )
  }

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
  }

  const json = sub.toJSON()
  await api.post('/push/subscribe', {
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
  })
  return true
}

// Unsubscribe this device and tell the server to drop it.
export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  try {
    await sub.unsubscribe()
  } finally {
    await api.post('/push/unsubscribe', { endpoint })
  }
}

// Ensure a subscription exists when the user enables a reminder. Best-effort: returns false
// (without throwing) if push is unconfigured/unsupported, so toggling "Remind me" still
// saves the action — the reminder just won't reach this device until notifications are on.
export async function ensurePushForReminder(): Promise<boolean> {
  if (!isPushSupported()) return false
  if (!(await isPushConfigured())) return false
  if (await isPushEnabled()) return true
  try {
    return await enablePush()
  } catch {
    // Permission denied / subscribe failed: the reminder still saves; the caller hints
    // the user to enable notifications in Settings. Don't block the save on this.
    return false
  }
}
