/* ÉduGestion Pro Master — service worker : l'application démarre sans réseau. */
const PREFIXE = 'edugestion-master-v';
const CACHE = PREFIXE + '8.2.3';
const PORTEE = new URL(self.registration.scope).pathname;
const RESSOURCES = [
  './', './index.html', './verification.html', './manifest.webmanifest', './css/app.css',
  './js/schema.js', './js/db.js', './js/rules.js', './js/tableur.js', './js/referentiel-cs.js', './js/seed.js',
  './js/choix.js', './data/referentiel_villages.json', './js/ui.js', './js/qr.js', './js/docs-styles.js', './js/docs-socle.js', './js/docs-modeles.js', './js/sortie.js', './js/geo-ref.js', './js/docs-scolaris.js', './js/screens.js', './js/screens2.js', './js/screens3.js', './js/screens4.js', './js/screens5.js', './js/screens6.js', './js/screens7.js', './js/screens8.js', './js/screens9.js', './js/screens10.js', './js/screens11.js', './js/screens12.js', './js/screens13.js', './js/screens14.js', './js/screens15.js', './js/screens16.js', './js/screens17.js', './js/screens18.js', './js/screens19.js', './js/screens20.js', './js/screens21.js', './js/screens22.js', './js/screens23.js', './js/screens24.js',
  './js/screens25.js', './js/screens26.js', './js/screens27.js', './js/screens28.js', './js/screens29.js', './js/screens30.js', './js/icones.js', './js/docs-pedagogiques.js', './js/uascep.js', './js/uascep-eg.js', './js/pvs-modules.js', './js/pvs.js', './js/pvs-eg.js', './js/documents-officiels.js', './js/logo-ecole.js', './js/guide.js', './js/guide-contenu.js', './js/pedagogie.js', './js/doc-export.js', './js/classes.js', './js/classes-eg.js', './js/listes-classe.js', './js/listes-eg.js', './js/modele-xlsx.js', './assets/educmaster/educmaster_modele_classe.xlsx', './assets/educmaster/educmaster_modele_notes_primaire.xlsx', './assets/educmaster/educmaster_modele_agents.xlsx', './js/pedagogie-eg.js', './js/secondaire.js', './js/bulletins-sec.js', './js/maitre-semaine.js', './js/registres-sec.js', './js/ecole-registres.js', './js/zone-core.js', './js/zone-eg.js', './js/declarations-paiement.js', './js/educmaster-modeles.js', './js/graphiques.js', './js/divisions-donnees.js', './js/divisions.js', './js/signatures.js', './js/espace-memp-cp.js', './js/camera.js', './js/securite.js', './js/sauvegarde-auto.js', './js/ed25519.js', './js/sync-client.js', './js/sync-commun.js', './js/sync-eg.js', './js/motdepasse.js', './js/app.js',
  './donnees/paquet-pobe.js', './donnees/paquet-adja-ouere.js', './donnees/paquet-ifangni.js', './donnees/paquet-ketou-1.js', './donnees/paquet-ketou-2.js', './donnees/paquet-sakete.js',
  './assets/entete-memp.jpg', './assets/embleme-memp.png', './assets/armoiries-benin.png', './icons/favicon.ico', './icons/icon-180.png', './icons/icon-192.png',
  './icons/icon-512.png', './icons/icon-maskable-192.png', './icons/icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(RESSOURCES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    /* Seulement les anciennes versions de CETTE application : d'autres applications (espace CP, MEMP-CP,
       CS Pobè…) peuvent avoir leurs caches à la même adresse. */
    .then(cles => Promise.all(cles.filter(k => k.startsWith(PREFIXE) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  /* L'espace CP intégré a son propre service worker (dossier memp-cp/). */
  if (url.pathname.indexOf(PORTEE + 'memp-cp/') === 0) return;
  /* Signaux techniques (ex. « /__vivant » de l'application Windows) : jamais mis en cache. */
  if (url.pathname.indexOf('/__') === 0) return;
  e.respondWith(
    caches.match(e.request).then(reponse => reponse || fetch(e.request)
      .then(r => {
        if (r.ok && r.status === 200) {
          const copie = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copie));
        }
        return r;
      })
      .catch(() => caches.match('./index.html')))
  );
});
