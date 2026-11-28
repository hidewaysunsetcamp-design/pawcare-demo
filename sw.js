/* PAWCARE Service Worker：オフライン表示用。HTML/JS/CSSはネットワーク優先で常に最新を取得する */
const CACHE = 'pawcare-v1.18.0';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/vendor/qrcode.js',
  './js/data.js',
  './js/care.js',
  './js/avatar.js',
  './js/motion.js',
  './img/avatars/dog.webp',
  './img/avatars/cat.webp',
  './img/avatars/rabbit.webp',
  './img/avatars/hamster.webp',
  './img/avatars/bird.webp',
  './img/avatars/reptile.webp',
  './img/avatars/fish.webp',
  './img/avatars/squirrel.webp',
  './img/avatars/insect.webp',
  './img/avatars/other.webp',
  './img/avatars/v_dog_hat.webp',
  './img/avatars/v_cat_black.webp',
  './img/avatars/v_rabbit_book.webp',
  './img/avatars/v_bird_blue.webp',
  './img/avatars/v_fish_crown.webp',
  './js/app.js',
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
