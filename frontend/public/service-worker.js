/*
 * Cloud-only service-worker tombstone.
 *
 * Older ERP releases registered a cache-first worker at this URL. Deleting the
 * source file is not enough: an already-installed worker can continue serving
 * stale HTML and JavaScript indefinitely. Keep this small replacement at the
 * same URL until every client has upgraded so the browser can retire the old
 * worker and purge its caches.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    await self.clients.claim();
    await self.registration.unregister();

    const windows = await self.clients.matchAll({ type: 'window' });
    await Promise.all(windows.map((windowClient) => windowClient.navigate(windowClient.url)));
  })());
});
