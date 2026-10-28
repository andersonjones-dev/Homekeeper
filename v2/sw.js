// Network-first service worker: always tries the latest files, falls back to cache when offline.
const CACHE = 'hk2-v2';
const CAL = 'hk2-cal'; // holds the calendar file the page just built, served as a real web address so iPhone offers "Add All"
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('hk2-') && k !== CACHE && k !== CAL).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.endsWith('/cal/homekeeper.ics')) {
    e.respondWith(caches.open(CAL).then((c) => c.match('cal/homekeeper.ics')).then((r) => r || new Response('No calendar file yet. Go back to HomeKeeper and tap Add to Calendar again.', { status: 404, headers: { 'Content-Type': 'text/plain' } })));
    return;
  }
  const ok = url.origin === location.origin || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!ok) return;
  e.respondWith(Promise.race([fetch(req), new Promise((_, no) => setTimeout(no, 3000))]).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); return res; })
    .catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))));
});
