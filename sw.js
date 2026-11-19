/* PAWCARE Service Worker：オフライン表示用。HTML/JS/CSSはネットワーク優先で常に最新を取得する */
const CACHE = 'pawcare-v1.11.1';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/vendor/qrcode.js',
  './js/data.js',
  './js/care.js',
  './js/avatar.js',
  './js/app/00-core.js',
  './js/app/01-home.js',
  './js/app/02-logs.js',
  './js/app/03-pets.js',
  './js/app/04-interview.js',
  './js/app/05-emergency.js',
  './js/app/06-settings.js',
  './js/app/07-reminders.js',
  './js/app/08-share.js',
  './js/app/09-nutrition.js',
  './js/app/10-quickstats.js',
  './js/app/11-card.js',
  './js/app/12-ingest.js',
  './js/app/13-visits.js',
  './js/app/14-handoff.js',
  './js/app/15-book.js',
  './js/app/16-game.js',
  './js/app/17-plans.js',
  './js/app/18-main.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pawcare-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  /* ネットワーク優先：公開中の最新版を表示し、圏外のときだけキャッシュを使う */
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
