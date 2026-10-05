/*
 * The Vault's push service worker. Notifications only: no caching, no
 * offline mode (CLAUDE.md H6). Cloud Functions send data-only FCM web pushes
 * ({ title, body, tab }); this shows them and opens the right tab on tap.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  // FCM wraps data-only messages as { data: {...} }; accept a bare object too.
  const data = payload.data || payload.notification || payload;
  const title = data.title || 'The Vault';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: `vault-${data.tab || 'dashboard'}`,
      data: { tab: data.tab || 'dashboard' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const tab = (event.notification.data && event.notification.data.tab) || 'dashboard';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        open.postMessage({ type: 'vault-open-tab', tab });
        return open.focus();
      }
      return self.clients.openWindow(`/?tab=${encodeURIComponent(tab)}`);
    })(),
  );
});
