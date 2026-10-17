/* République du Bénin — MEMP — Application CP — Service worker (mode hors ligne)
   Conception : Maître Aimé FACHE — Tél. 01 96 51 03 33 */
// Préfixe propre à chaque application (même domaine github.io pour l'application CP et ses jumelles)
const PREFIX = 'memp-cp-' + new URL(self.registration.scope).pathname.replace(/[^a-z0-9]+/gi, '-') + '-';
// Empreinte de la publication (écrite par tools/gen-assets.mjs) : sw.js change à chaque mise à jour, les appareils la reçoivent.
const BUILD = 'd5d404112a29';
let VERSION = 'dev';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const res = await fetch('sw-assets.json', { cache: 'no-store' });
    const { version, files } = await res.json();
    VERSION = version;
    const cache = await caches.open(PREFIX + version);
    await Promise.all(files.map(async (f) => { try { await cache.add(new Request(f, { cache: 'reload' })); } catch (e) { /* fichier optionnel manquant */ } }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const { version } = await (await fetch('sw-assets.json', { cache: 'no-store' }).catch(() => null))?.json().catch(() => ({})) || {};
    for (const k of await caches.keys()) if (k.startsWith(PREFIX) && (!version || k !== PREFIX + version)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.status === 200) { const keys = await caches.keys(); const k = keys.find(x => x.startsWith(PREFIX)); if (k) (await caches.open(k)).put(req, res.clone()); }
      return res;
    } catch (e) {
      if (req.mode === 'navigate') return (await caches.match('index.html')) || (await caches.match('./')) || Response.error();
      return Response.error();
    }
  })());
});
