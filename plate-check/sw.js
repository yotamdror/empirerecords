// Retired: the app is useless offline, and the cache could serve stale modules.
// Kept so browsers that registered the old worker clear its cache and drop it.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('plate-check-shell-')).map((key) => caches.delete(key))))
    .then(() => self.registration.unregister()));
});
