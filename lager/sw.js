/* Service Worker der Rare-Form-Lager-App: Seite und Bilder werden gespeichert, damit die App auch offline startet.
   Bei einer neuen Version CACHE hochzählen. Schriften von Google werden nicht gespeichert (offline gilt dann die Systemschrift). */
const CACHE = 'rare-form-lager-v2';
const FILES = [
  './', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  './img/mark.png', './img/rf1-black.webp', './img/rf1-white.webp',
  './img/rf10-black.webp', './img/rf10-darkgrey.webp', './img/rf10-grey.webp',
  './img/rf11-x.webp', './img/rf12-black.webp', './img/rf12-grey.webp',
  './img/rf12-white.webp', './img/rf13-black.webp', './img/rf13-white.webp',
  './img/rf2-black.webp', './img/rf2-white.webp', './img/rf3-x.webp',
  './img/rf4-x.webp', './img/rf5-x.webp', './img/rf6-black.webp',
  './img/rf6-silver.webp', './img/rf7-x.webp', './img/rf8-black.webp',
  './img/rf8-white.webp', './img/rf9-x.webp'
];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // Seite: erst Netz (immer aktuell), sonst gespeicherte Kopie. Bilder/Icons: erst gespeichert, sonst Netz.
  const isPage = e.request.mode === 'navigate' || e.request.url.endsWith('.html');
  e.respondWith(isPage
    ? fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    : caches.match(e.request).then(r => r || fetch(e.request).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return res; })));
});
