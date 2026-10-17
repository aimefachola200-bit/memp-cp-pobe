/* République du Bénin — MEMP — Application CP — Service worker (mode hors ligne)
   Conception : Maître Aimé FACHE — Tél. 01 96 51 03 33 */
// Préfixe propre à chaque application (même domaine github.io pour l'application CP et ses jumelles)
const PREFIX = 'memp-cp-' + new URL(self.registration.scope).pathname.replace(/[^a-z0-9]+/gi, '-') + '-';
// Empreinte de la publication (écrite par tools/gen-assets.mjs) : sw.js change à chaque mise à jour, les appareils la reçoivent.
const BUILD = '409e7b60c1fa';
const CACHE = PREFIX + BUILD;   // une seule version servie à la fois : jamais de mélange ancien / nouveau

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const res = await fetch('sw-assets.json', { cache: 'no-store' });
    const { files } = await res.json();
    const cache = await caches.open(CACHE);
    await Promise.all(files.map(async (f) => { try { await cache.add(new Request(f, { cache: 'reload' })); } catch (e) { /* fichier optionnel manquant */ } }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.status === 200) cache.put(req, res.clone());
      return res;
    } catch (e) {
      if (req.mode === 'navigate') return (await cache.match('index.html')) || (await cache.match('./')) || Response.error();
      return Response.error();
    }
  })());
});
