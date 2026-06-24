/* Web Push handlers, imported into the generated Workbox service worker via
 * vite-plugin-pwa's workbox.importScripts. Kept as a plain JS file (not bundled)
 * so it runs untouched in the service-worker global scope.
 *
 * The reminders cron (/api/cron/reminders) sends a JSON payload:
 *   { title, body, url, actionId }
 */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { title: 'Action reminder', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Action reminder';
  const options = {
    body: data.body || '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: data.actionId ? `action-${data.actionId}` : undefined,
    data: { url: data.url || '/actions' },
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/actions';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Focus an existing window if one is open, navigating it to the action.
      for (const client of allClients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(targetUrl);
            } catch (_e) {
              /* cross-origin or detached — ignore */
            }
          }
          return;
        }
      }
      // Otherwise open a fresh window.
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
