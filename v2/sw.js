/*
 * HomeKeeper: offline support + update bar.
 * ---------------------------------------------------------------
 * IMPORTANT: change VERSION every time you publish a change on GitHub.
 * Phones then download the new version in the background and show
 * "A new version of HomeKeeper is ready" with an Update button (update.js).
 * Nothing changes until Update is tapped, so it never interrupts anyone.
 *
 * The app always opens from the saved copy, so it works with no internet.
 */
const VERSION = 'hk2-v4';
const PREFIX = 'hk2-';   // only caches starting with this are ever deleted: other apps share this storage
const LIB = 'hk2-lib';         // fonts and libraries from other sites, kept between versions
const KEEP = ["hk2-cal"];
const CORE = [
  './',
  'index.html',
  'update.js',
  'config.js',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/calendar.js',
  'js/delight.js',
  'js/extras-screens.js',
  'js/extras.js',
  'js/notify.js',
  'js/parser.js',
  'js/photos.js',
  'js/planner-screens.js',
  'js/planner.js',
  'js/qr.js',
  'js/screens.js',
  'js/store.js',
  'js/sync.js',
  'js/themes.js',
  'js/ui.js',
  'js/util.js',
  'js/voice.js',
  'js/cloud.js',
  '../icon-192.png',
  '../icon-512.png',
  '../apple-touch-icon.png'
];
const LIB_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const LIB_PRELOAD = [];
const NETWORK_FIRST = [];   // small settings files: try the latest for 3 seconds, else the saved copy
const SKIP_PATHS = [];         // parts of the site that belong to another app

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => Promise.all(CORE.map((u) =>
        // cache: 'reload' skips the browser's own cache, so we always save the newly published files
        fetch(new Request(u, { cache: 'reload' })).then((r) => {
          if (!r.ok) throw new Error('Could not save ' + u + ' (' + r.status + ')');
          return c.put(u, r);
        }))))
      .then(() => caches.open(LIB))
      .then((c) => Promise.all(LIB_PRELOAD.map((u) =>
        c.match(u).then((hit) => hit || fetch(u, { mode: 'no-cors' }).then((r) => c.put(u, r))).catch(() => {}))))
  );
  // No skipWaiting() here: the new version waits until Update is tapped.
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith(PREFIX) && k !== VERSION && k !== LIB && KEEP.indexOf(k) < 0)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function saveTo(cacheName, key, res) {
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone();
    caches.open(cacheName).then((c) => c.put(key, copy)).catch(() => {});
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // The calendar file the page just built, served at a real web address so iPhone offers "Add All".
  if (url.origin === location.origin && url.pathname.endsWith('/cal/homekeeper.ics')) {
    e.respondWith(caches.open('hk2-cal').then((c) => c.match('cal/homekeeper.ics')).then((r) => r ||
      new Response('No calendar file yet. Go back to HomeKeeper and tap Add to Calendar again.', { status: 404, headers: { 'Content-Type': 'text/plain' } })));
    return;
  }

  if (url.origin === location.origin) {
    if (SKIP_PATHS.some((p) => url.pathname.indexOf(p) >= 0)) return;

    if (NETWORK_FIRST.some((f) => url.pathname.endsWith('/' + f))) {
      e.respondWith(
        Promise.race([fetch(req), new Promise((_, no) => setTimeout(no, 3000))])
          .then((res) => saveTo(VERSION, req, res))
          .catch(() => caches.open(VERSION).then((c) => c.match(req, { ignoreSearch: true })).then((hit) => hit || fetch(req)))
      );
      return;
    }

    // The app page and its files: the saved copy of THIS version first (never mix versions).
    const key = req.mode === 'navigate' ? 'index.html' : req;
    e.respondWith(
      caches.open(VERSION)
        .then((c) => c.match(key, { ignoreSearch: true }))
        .then((hit) => hit || fetch(req).then((res) => saveTo(VERSION, key, res)))
        .catch(() => req.mode === 'navigate'
          ? caches.open(VERSION).then((c) => c.match('index.html'))
          : Response.error())
    );
    return;
  }

  if (LIB_HOSTS.indexOf(url.hostname) >= 0) {
    e.respondWith(
      caches.open(LIB).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => saveTo(LIB, req, res))))
    );
  }
  // Anything else (sync, notifications, databases) always goes straight to the network.
});
