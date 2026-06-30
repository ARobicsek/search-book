# Action reminders — time-of-day + Web Push

Adds an **optional** time-of-day to actions and **opt-in** push notifications, at **zero added
cost** (free VAPID Web Push + a free external 1-minute cron; no paid Vercel Cron). Designed so the
default pattern of use — no times, no alerts — is completely unchanged: an action with no time and
`notify = false` behaves exactly as before.

## What shipped (code)

- **Schema** (`Action`): `dueTime String?` ("HH:MM", local), `notify Boolean @default(false)`,
  `lastNotifiedAt String?` (cron sets it so a reminder fires once). New table `PushSubscription`
  (one row per browser/device). `dueDate` stays date-only — untouched, so all existing string
  comparisons/sorting keep working.
- **Server**: `routes/push.ts` (public-key / subscribe / unsubscribe), `routes/reminders.ts`
  (`/api/cron/reminders`, CRON_SECRET-gated, sends due reminders), `lib/push.ts` (VAPID + timezone
  math). Action create/update validate `dueTime` and re-arm `lastNotifiedAt` when the schedule
  changes.
- **Client**: time input + "Remind me" bell in `action-date-select.tsx` and `action-form.tsx`;
  time/bell shown in lists/detail; `lib/push.ts` (subscribe flow); Settings → Notifications card;
  `public/push-sw.js` (push + notificationclick) imported into the Workbox SW. **Picking a time of
  day auto-enables `notify`** (only when it's currently off; subscribes the device to push) — the
  reminder can still be toggled back off afterward.
- **Dashboard**: today's **timed** actions sort to the top by time; once a timed action's moment
  passes it moves into the **Overdue** card.

## Delivery model

Real Web Push (works on desktop with the browser running, and on installed PWAs incl. iOS 16.4+
home-screen installs). A free external cron pokes `/api/cron/reminders` every minute; that endpoint
finds actions whose due moment (dueDate + dueTime, default **08:00 weekdays / 10:00 weekends
America/New_York** when `notify` is on but no time) has passed and haven't been notified, and fans a
push out to every subscription.

## One-time setup to turn it on (owner)

Reminders stay dormant until these are done — deploying the code alone changes nothing.

1. **Turso DDL** (apply BEFORE merging schema code to `main`; procedure per CLAUDE.md — temporarily
   uncomment Turso creds, run via libsql):
   ```sql
   ALTER TABLE "Action" ADD COLUMN "dueTime" TEXT;
   ALTER TABLE "Action" ADD COLUMN "notify" INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE "Action" ADD COLUMN "lastNotifiedAt" TEXT;
   CREATE TABLE "PushSubscription" (
     "id" INTEGER PRIMARY KEY AUTOINCREMENT,
     "endpoint" TEXT NOT NULL,
     "p256dh" TEXT NOT NULL,
     "auth" TEXT NOT NULL,
     "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
   );
   CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
   ```
2. **Generate VAPID keys**: `npx web-push generate-vapid-keys`
3. **Vercel env vars**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
   (`mailto:ari.robicsek@gmail.com`), `REMINDER_TZ` (`America/New_York`), and
   `REMINDERS_CRON_SECRET` (a long random string you choose; keep it NON-sensitive so you can
   read it for the cron URL). The endpoint falls back to `CRON_SECRET` if this is unset, but the
   existing backup `CRON_SECRET` is marked Sensitive in Vercel and can't be read back — hence the
   dedicated, readable secret.
4. **External cron** (free): on cron-job.org create a job hitting
   `https://searchbook-three.vercel.app/api/cron/reminders?key=<REMINDERS_CRON_SECRET>` every 1
   minute (GET is fine). UptimeRobot's 5-minute monitor is an acceptable lower-precision fallback.
5. **Per device**: open Settings → Notifications → "Enable on this device" (grants permission +
   subscribes). iPhone/iPad: install to Home Screen first, then enable from the installed app.

## Notes / decisions

- **Time and alert are independent** (per owner): you can set a time with no alert, or an alert with
  no explicit time (→ default reminder time, see below).
- **Default reminder time**: 08:00 (weekdays) / 10:00 (weekends, Sat/Sun) America/New_York, based on
  the due date's weekday, when `notify` is on and no `dueTime` is set.
- **Time entry**: the Time field is a forgiving free-text input (`client/src/components/time-input.tsx`),
  not the native `<input type="time">`. A bare hour assumes :00 minutes and `a`/`p` set AM/PM —
  e.g. "9a" → 9:00 AM, "2:30p" → 2:30 PM, "1400" → 2:00 PM.
- **Re-arming**: editing an action's date, time, or notify flag clears `lastNotifiedAt`, so a
  rescheduled reminder fires again.
- **Cost**: nothing here uses paid Vercel Cron or new managed services. Web Push + VAPID are free;
  the cron is an external free pinger.
- **`PushSubscription` is intentionally excluded from the DB backup** — device subscriptions are
  ephemeral and re-created by enabling notifications per device.
