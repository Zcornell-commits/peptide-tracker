/* Peptide Tracker service worker — offline app shell, self-healing cache.
   Bump CACHE on every deploy; that is the whole update mechanism. */
const CACHE = 'peptide-shell-v32';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './fonts/InterVariable.woff2',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never intercept cross-origin (e.g. the Claude API) — let it hit the network untouched.
  if (url.origin !== location.origin) return;

  // Navigations: network-first so a redeploy is never permanently masked, fall back to cached shell offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          // Only cache a clean, non-redirected, OK shell. Caching a redirect (GitHub Pages
          // normalises './' to the subpath) or an error body would blank the offline launch.
          if (res && res.ok && !res.redirected && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Other assets: cache-first, then network; write back so the shell self-heals after eviction.
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});

// Background push from the reminder Worker → show a notification (iOS requires a visible one).
self.addEventListener('push', e => {
  let msg = '\u{1F48A} time for your peptides';
  try { if (e.data) { const t = e.data.text(); if (t) msg = t; } } catch (_) {}
  e.waitUntil(self.registration.showNotification('Peptide Tracker', {
    body: msg,
    tag: 'peptide-reminder',
    renotify: true,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: './' }
  }));
});

// Focus/open the app when a notification is tapped.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
