// Web Push helpers — VAPID config + a small send wrapper.
//
// Cost note: Web Push itself is free (browser push services + VAPID). The only moving
// part this app adds is an external free 1-minute cron that pokes /api/cron/reminders;
// see .planning for setup. Nothing here depends on a paid Vercel Cron.
import webpush from 'web-push';

// Lazily configured so importing this module never throws when VAPID env is absent
// (e.g. local dev without reminders). configureVapid() returns false when unset.
let configured = false;

export function configureVapid(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  const subject = process.env.VAPID_SUBJECT || 'mailto:ari.robicsek@gmail.com';
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Result of a single send: 'ok' delivered, 'gone' the subscription is dead (404/410)
// and should be pruned, 'error' a transient failure (left in place to retry next run).
export type PushSendResult = 'ok' | 'gone' | 'error';

export async function sendPush(target: PushTarget, payload: unknown): Promise<PushSendResult> {
  if (!configureVapid()) return 'error';
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
    );
    return 'ok';
  } catch (err: any) {
    const status = err?.statusCode;
    if (status === 404 || status === 410) return 'gone';
    console.error('[push] send failed', status, err?.body || err?.message);
    return 'error';
  }
}

// ── Timezone-correct due-instant computation ────────────────────────────────
// Actions store wall-clock strings (dueDate "YYYY-MM-DD", optional dueTime "HH:MM")
// in the owner's timezone (REMINDER_TZ, default America/New_York). The cron runs in
// UTC on Vercel, so we convert the wall-clock moment to a real UTC instant to decide
// whether the reminder is due. When notify is on but no time was set, default 09:00.

export const DEFAULT_REMINDER_TIME = '09:00';

export function reminderTimeZone(): string {
  return process.env.REMINDER_TZ || 'America/New_York';
}

// Interpret `dateStr`+`timeStr` as wall-clock time in `timeZone`; return the UTC Date.
// DST-correct: derives the zone's UTC offset for that specific instant via Intl.
export function zonedWallTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  const utcGuess = Date.UTC(y, (mo || 1) - 1, d || 1, h || 0, mi || 0);
  const guessDate = new Date(utcGuess);
  // How that same instant reads in the target zone vs UTC → the zone's offset.
  const asTz = new Date(guessDate.toLocaleString('en-US', { timeZone }));
  const asUtc = new Date(guessDate.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offset = asUtc.getTime() - asTz.getTime();
  return new Date(utcGuess + offset);
}

// The UTC instant an action's reminder should fire, or null if it has no due date.
export function reminderDueInstant(action: { dueDate: string | null; dueTime: string | null }): Date | null {
  if (!action.dueDate) return null;
  const time = action.dueTime || DEFAULT_REMINDER_TIME;
  return zonedWallTimeToUtc(action.dueDate, time, reminderTimeZone());
}
