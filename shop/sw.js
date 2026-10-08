/* Service Worker für die Rare-Form-Web-App: Seite und Fotos werden gespeichert, damit der Shop auch offline startet.
   Bei einer neuen Version von Seite oder Fotos CACHE hochzählen. */
const CACHE = 'rare-form-v23';
const FILES = [
  './', './index.html', './manifest.webmanifest',
  './logo/mark.png',  './logo/wordmark.png', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  './fotos/rare-form-shirt.webp', './fotos/urban-artifacts-tee.webp', './fotos/urban-artifacts-baggy-denim.webp',
  './fotos/urban-artifacts-black-baggy-denim.webp', './fotos/urban-artifacts-belt.webp', './fotos/kette.webp', './fotos/rare-form-glasses.webp', './fotos/rare-form-longsleeve.webp', './fotos/texture-powder.webp', './fotos/rare-form-sweatpants.webp', './fotos/rare-form-shirt-black.webp', './fotos/urban-artifacts-tee-black.webp', './fotos/rare-form-longsleeve-black.webp',
];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // Seite: erst Netz (immer aktuell), sonst gespeicherte Kopie. Fotos/Icons: erst gespeichert, sonst Netz.
  const isPage = e.request.mode === 'navigate' || e.request.url.endsWith('.html');
  e.respondWith(isPage
    ? fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    : caches.match(e.request).then(r => r || fetch(e.request).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return res; })));
});
