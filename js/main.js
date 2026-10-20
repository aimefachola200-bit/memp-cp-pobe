/* République du Bénin — Ministère des Enseignements Maternel et Primaire (MEMP)
   Application CP — point d'entrée.   Conception : Maître Aimé FACHE — Tél. 01 96 51 03 33 */
import { h, $, toast, checkPassword, hashPassword, modal } from './util.js';
import { db } from './db.js';
import { APP, CREDIT, VARIANT } from './config.js';
const CLE_SESSION = 'memp-user-' + VARIANT.id;
import { session, seedIfEmpty, refreshDatalists, ROLES } from './data.js';
import { actionBar } from './ui.js';
import { connexionIntegree, retourEduGestion } from './integre.js';

/* ---------------- Œil « afficher / masquer » sur tous les champs de mot de passe ---------------- */
const OEIL_OUVERT = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const OEIL_FERME = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7c1.8 0 3.4-.5 4.7-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
function ajouterOeil(input) {
  if (input.dataset.oeil) return;
  input.dataset.oeil = '1';
  const boite = document.createElement('span');
  boite.className = 'mdp-boite';
  input.parentNode.insertBefore(boite, input);
  boite.appendChild(input);
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'mdp-oeil';
  const maj = () => {
    const visible = input.type === 'text';
    b.innerHTML = visible ? OEIL_FERME : OEIL_OUVERT;
    b.setAttribute('aria-label', visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    b.title = b.getAttribute('aria-label');
    b.setAttribute('aria-pressed', String(visible));
  };
  b.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    input.type = input.type === 'password' ? 'text' : 'password';
    maj(); input.focus();
  });
  boite.appendChild(b); maj();
}
function oeilPartout(racine) {
  if (racine.matches && racine.matches('input[type=password]')) ajouterOeil(racine);
  if (racine.querySelectorAll) racine.querySelectorAll('input[type=password]').forEach(ajouterOeil);
}
new MutationObserver((muts) => muts.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && oeilPartout(n))))
  .observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('DOMContentLoaded', () => oeilPartout(document));

const NAV = [
  { g: null, id: 'accueil', ic: '🏠', t: 'Tableau de bord' },
  { id: 'espacedosp', ic: '🗂️', t: 'Mon espace de travail DOSP', seul: 'dosp' },
  { id: 'espace', ic: '🧑‍🏫', t: 'Espace CP de zone', pasDosp: true },
  { id: 'synocp', ic: '📋', t: 'Tableau synoptique du CP', pasDosp: true },
  { id: 'synodosp', ic: '📋', t: 'Tableau synoptique de la DOSP', seul: 'dosp' },
  { g: 'Collecte', id: 'ecoles', ic: '🏫', t: 'Écoles' },
  { id: 'personnel', ic: '👩‍🏫', t: 'Personnel enseignant' },
  { id: 'carriere', ic: '📈', t: 'Gestion de carrière' },
  { id: 'recensement', ic: '🗂️', t: 'Fiches de recensement (EP, EM)' },
  { id: 'fiches', ic: '📝', t: 'Fiches de collecte' },
  { id: 'saisie', ic: '✍️', t: 'Saisie manuelle (sans Excel)' },
  { id: 'envois', ic: '📥', t: 'Réception et acheminement des fiches', seul: 'dosp' },
  { id: 'effectifs', ic: '👧', t: 'Effectifs des apprenants' },
  { id: 'infra', ic: '🏗️', t: 'Infrastructures et mobilier' },
  { id: 'ecolesstruct', ic: '🏫', t: 'Écoles : structure et équipements' },
  { id: 'cep', ic: '🎓', t: 'CEP : candidats et réussite' },
  { id: 'rapports', ic: '📊', t: "Rapports de fin d'année" },
  { id: 'synoptique', ic: '🗂️', t: 'Synthèse des fiches (consolidation)' },
  { g: 'Prévision et suivi-évaluation', id: 'prevision', ic: '🔮', t: "Prévisions de l'année suivante", seul: 'dosp' },
  { id: 'besoins', ic: '⚖️', t: 'Besoins et écarts (enseignants, salles, places)', seul: 'dosp' },
  { id: 'suivieval', ic: '📊', t: 'Suivi-évaluation (tableau de bord)', seul: 'dosp' },
  { id: 'capacites', ic: '🎓', t: 'Renforcement des capacités', seul: 'dosp' },
  { id: 'plandosp', ic: '🎯', t: "Attributions et plan d'action", seul: 'dosp' },
  { id: 'docsdosp', ic: '🧾', t: 'Documents officiels de la DOSP', seul: 'dosp' },
  { g: 'Pédagogie', id: 'activites', ic: '📅', t: 'Activités pédagogiques' },
  { id: 'bilans', ic: '📈', t: 'Bilans trimestriel / annuel' },
  { id: 'themes', ic: '🎯', t: 'Thèmes 2026-2027' },
  { id: 'planif', ic: '🗓️', t: 'Planification annuelle EM et EP' },
  { id: 'planification', ic: '📚', t: 'Planification CI → CM2 (projet)' },
  { id: 'emploi', ic: '🕘', t: 'Emplois du temps officiels' },
  { id: 'calendrier', ic: '🗓️', t: 'Calendrier scolaire officiel' },
  { id: 'reglement', ic: '⚖️', t: 'Règlement intérieur' },
  { id: 'documents', ic: '📄', t: 'Documents officiels' },
  { id: 'whatsapp', ic: '💬', t: 'Groupe WhatsApp des directeurs', roles: ['ADMIN', 'DDEMP', 'CCS', 'DOSP', 'CP'] },
  { g: 'Administration', id: 'referentiel', ic: '🌍', t: 'Référentiel national', roles: ['ADMIN', 'DDEMP', 'CCS', 'DOSP', 'CP'] },
  { id: 'identite', ic: '✍️', t: 'Identité numérique (signature)' },
  { id: 'transmission', ic: '🔄', t: 'Transmission & sauvegarde' },
  { id: 'verifier', ic: '✅', t: 'Vérifier un document' },
  { id: 'journal', ic: '📜', t: 'Journal des validations' },
  { id: 'utilisateurs', ic: '👥', t: 'Utilisateurs', roles: ['ADMIN'], horsIntegre: true },
  { id: 'parametres', ic: '⚙️', t: 'Paramètres & à propos' },
];
const ROUTES = { accueil: 'views-core', ecoles: 'views-core', fiches: 'views-core', rapports: 'views-reports', rapport: 'views-reports', bilans: 'views-bilan', bilan: 'views-bilan', fiche: 'fiche-ui', effectifs: 'views-effectifs', effectif: 'views-effectifs', infra: 'views-infra', ecolesstruct: 'views-ecoles', cep: 'views-cep',
  synoptique: 'views-more', activites: 'views-more', themes: 'views-more', planification: 'views-more', reglement: 'views-officiel', emploi: 'views-officiel', planif: 'views-officiel', espace: 'views-officiel', synocp: 'views-officiel', calendrier: 'views-officiel', personnel: 'views-officiel', carriere: 'views-officiel', documents: 'views-more', referentiel: 'views-more',
  saisie: 'views-saisie', recensement: 'views-recensement', recfiche: 'views-recensement', synodosp: 'views-synodosp', whatsapp: 'views-whatsapp', espacedosp: 'views-dosp', envois: 'views-dosp', prevision: 'views-dosp', besoins: 'views-dosp', suivieval: 'views-dosp', capacites: 'views-dosp', plandosp: 'views-dosp', docsdosp: 'views-dosp', identite: 'views-admin', transmission: 'views-admin', verifier: 'views-admin', journal: 'views-admin', utilisateurs: 'views-admin', parametres: 'views-admin' };

const app = $('#app');
let cleanup = null, deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; window.__installPrompt = e; document.dispatchEvent(new Event('installable')); });
window.addEventListener('appinstalled', () => { deferredPrompt = null; window.__installPrompt = null; toast('Application installée.'); });

function banner(cls = '') { return h('img', { class: 'emblem ' + cls, src: 'assets/embleme-memp.png', alt: 'République du Bénin — Ministère des Enseignements Maternel et Primaire', width: 1383, height: 140 }); }

/* ---------------- Connexion ---------------- */
function loginScreen() {
  const err = h('div', { class: 'err', role: 'alert', style: { color: 'var(--err)', minHeight: '1.2em', fontSize: '.85rem' } });
  const u = h('input', { class: 'input', id: 'lg-user', autocomplete: 'username', autocapitalize: 'none', required: true }), p = h('input', { class: 'input', id: 'lg-pass', type: 'password', autocomplete: 'current-password', required: true });
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    const users = await db.all('users'), rec = users.find(x => x.username.toLowerCase() === u.value.trim().toLowerCase() && x.actif !== false);
    if (!rec || !(await checkPassword(p.value, rec.pwd))) { err.textContent = 'Identifiant ou mot de passe incorrect.'; return; }
    session.user = rec; sessionStorage.setItem(CLE_SESSION, rec.id); start();
  } },
    h('label', { class: 'field' }, h('span', 'Identifiant'), u), h('label', { class: 'field' }, h('span', 'Mot de passe'), p), err,
    h('button', { class: 'btn primary', style: { width: '100%' }, type: 'submit' }, 'Se connecter'));
  app.replaceChildren(h('div', { class: 'login-wrap' }, h('div', { class: 'login-card' },
    h('div', { style: { background: '#fff', padding: '8px' } }, banner('')), h('div', { class: 'tricolor' }, h('i'), h('i'), h('i')),
    h('div', { class: 'login-body' }, h('h1', VARIANT.profil === 'dosp' ? 'Application DOSP — Organisation scolaire et prévision' : APP.full), VARIANT.titre ? h('p', { class: 'sub', style: { fontWeight: '700', color: 'var(--ink)', margin: '.1em 0 0' } }, VARIANT.titre) : null, h('p', { class: 'sub' }, 'Collecte, validation et suivi pédagogique — fonctionne sans connexion Internet.'), form,
      h('div', { class: 'hint' }, h('b', 'Premier démarrage : '), 'comptes initiaux ', ...VARIANT.comptes.flatMap(([u, p], i) => [i ? ', ' : '', h('code', `${u} / ${p}`)]), '. Changez les mots de passe dès la première connexion.'),
      h('p', { style: { textAlign: 'center', fontSize: '.8rem', color: 'var(--mute)', marginTop: '14px' } }, CREDIT, h('br'), `Version ${APP.version}`)))));
  u.focus();
}

/* Mode intégré à ÉduGestion : pas de connexion propre, on renvoie vers ÉduGestion */
function ecranIntegre(message) {
  app.replaceChildren(h('div', { class: 'login-wrap' }, h('div', { class: 'login-card' },
    h('div', { style: { background: '#fff', padding: '8px' } }, banner('')), h('div', { class: 'tricolor' }, h('i'), h('i'), h('i')),
    h('div', { class: 'login-body' }, h('h1', 'Espace CP, CCS et DDEMP'), h('p', { class: 'sub' }, message),
      h('a', { class: 'btn primary', style: { width: '100%', textAlign: 'center', display: 'block' }, href: retourEduGestion() }, '← Ouvrir ÉduGestion Pro'),
      h('p', { style: { textAlign: 'center', fontSize: '.8rem', color: 'var(--mute)', marginTop: '14px' } }, CREDIT, h('br'), `Version ${APP.version}`)))));
}

/* ---------------- Coque + routage ---------------- */
function shell() {
  const u = session.user;
  const nav = h('nav', { class: 'nav', 'aria-label': 'Menu principal' });
  NAV.forEach(n => {
    if (n.roles && !n.roles.includes(u.role)) return;
    if (n.horsIntegre && VARIANT.integre) return;
    // écrans de la DOSP : application DOSP, ou compte DOSP ouvert dans l'application CP
    const dosp = VARIANT.profil === 'dosp' || u.role === 'DOSP';
    if (n.seul === 'dosp' ? !dosp : (n.seul && n.seul !== VARIANT.profil)) return;
    if (n.pasDosp && dosp) return;
    if (n.g) nav.appendChild(h('div', { class: 'grp' }, n.g));
    nav.appendChild(h('button', { 'data-r': n.id, onclick: () => { location.hash = '#/' + n.id; document.body.classList.remove('nav-open'); } }, h('span', { class: 'ic' }, n.ic), n.id === 'espace' && u.role === 'CP' ? `Mon espace CP — zone ${u.numZone || ''}` : n.t));
  });
  const side = h('aside', { class: 'sidebar', id: 'sidebar' },
    h('div', { class: 'sb-head' }, h('img', { src: 'assets/armoiries.png', alt: 'Armoiries du Bénin' }), h('b', VARIANT.profil === 'dosp' ? 'APPLICATION DOSP' : 'APPLICATION CP'), h('span', 'MEMP — RÉPUBLIQUE DU BÉNIN')),
    nav,
    h('div', { class: 'sb-foot' }, h('span', { class: 'who' }, `👤 ${u.prenoms || ''} ${u.nom || u.username}`, h('br'), h('small', ROLES[u.role] + (u.codeZone ? ' · ' + u.codeZone : u.codeCs ? ' · ' + u.codeCs : ''))),
      VARIANT.integre ? h('a', { class: 'btn sm', href: retourEduGestion() }, '← Retour à ÉduGestion') : h('button', { class: 'btn sm', onclick: logout }, 'Se déconnecter'), h('div', { style: { fontSize: '.68rem', opacity: .8, marginTop: '8px' } }, CREDIT)));
  const main = h('div', { class: 'main' },
    h('header', { class: 'topbar' }, h('button', { class: 'icon-btn burger', 'aria-label': 'Menu', onclick: (e) => { e.stopPropagation(); document.body.classList.toggle('nav-open'); } }, '☰'), h('div', { class: 'grow' }, banner()), VARIANT.integre ? h('a', { class: 'btn sm no-print', href: retourEduGestion(), title: 'Revenir à ÉduGestion Pro', style: { whiteSpace: 'nowrap', marginLeft: '8px' } }, '← ÉduGestion') : null),
    h('div', { class: 'titlebar' }, h('h2', { id: 'v-title' }), h('span', { class: 'sub', id: 'v-sub' })),
    h('div', { class: 'actionbar', id: 'v-bar' }),
    h('section', { class: 'view', id: 'v-body' }),
    h('div', { class: 'statusbar', id: 'v-status' }, 'Prêt'));
  app.replaceChildren(h('div', { class: 'shell' }, side, main));
  // un toucher dans la page referme le menu (mais pas le bouton ☰ lui-même, qui l'ouvre)
  main.addEventListener('click', (e) => { if (!e.target.closest('.burger')) document.body.classList.remove('nav-open'); });
}

let routeSeq = 0;
async function route() {
  if (!session.user) return;
  const my = ++routeSeq;
  const [r, ...args] = (location.hash.replace(/^#\/?/, '') || 'accueil').split('/');
  const id = ROUTES[r] ? r : 'accueil';
  const entry = NAV.find(n => n.id === id);
  if (entry && entry.roles && !entry.roles.includes(session.user.role)) { toast('Accès non autorisé pour votre rôle.', 'err'); location.hash = '#/accueil'; return; }
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('on', b.dataset.r === (id === 'fiche' ? 'fiches' : id === 'rapport' ? 'rapports' : id === 'bilan' ? 'bilans' : id === 'effectif' ? 'effectifs' : id === 'recfiche' ? 'recensement' : id)));
  if (cleanup) { try { await cleanup(); } catch { /* ignore */ } cleanup = null; }
  const body = $('#v-body'), bar = $('#v-bar'), el = h('div'), nbar = h('div', { class: 'actionbar', id: 'v-bar' });
  const _app = el.append.bind(el); el.append = (...a) => _app(...a.flat().filter(x => x !== null && x !== undefined && x !== false));
  const live = () => my === routeSeq;
  const ctx = {
    user: session.user, el, bar: nbar, args, route: id,
    title: (t, sub = '') => { if (!live()) return; $('#v-title').textContent = t; $('#v-sub').textContent = sub; document.title = t + ' — ' + APP.name; },
    status: (m) => { if (live()) $('#v-status').textContent = m; },
    actions: (a) => actionBar(nbar, a), go: (hash) => { location.hash = '#/' + hash; }, refreshDatalists,
    reload: () => route(),
  };
  let fn = null;
  try {
    const mod = await import('./' + ROUTES[id] + '.js');
    fn = (await mod.render(id, ctx)) || null;
  } catch (e) {
    console.error(e);
    // fichiers d'une ancienne et d'une nouvelle version mélangés (mise à jour arrivée pendant l'utilisation) : on recharge une fois
    if (!sessionStorage.getItem('maj-recharge')) { sessionStorage.setItem('maj-recharge', '1'); toast('Mise à jour de l\'application — rechargement…'); setTimeout(() => location.reload(), 600); return; }
    el.replaceChildren(h('div', { class: 'card' }, h('h3', 'Erreur'), h('p', String(e && e.message || e)), h('button', { class: 'btn primary', onclick: () => location.reload() }, '↻ Recharger l\'application')));
  }
  sessionStorage.removeItem('maj-recharge');
  if (!live()) { if (fn) { try { await fn(); } catch { /* ignore */ } } return; }
  cleanup = fn; body.replaceChildren(el); bar.replaceWith(nbar); window.scrollTo(0, 0);
}

function logout() {
  if (VARIANT.integre) { location.href = retourEduGestion(); return; } sessionStorage.removeItem(CLE_SESSION); sessionStorage.removeItem(CLE_SESSION + '-vu'); session.user = null; loginScreen(); }

async function start() {
  await refreshDatalists();
  shell();
  const espaceDe = (u) => (u.role === 'CP' && VARIANT.profil !== 'dosp' ? '#/espace' : u.role === 'DOSP' ? '#/espacedosp' : '#/accueil');
  if (!location.hash || ((session.user.role === 'CP' || session.user.role === 'DOSP') && location.hash === '#/accueil' && !sessionStorage.getItem(CLE_SESSION + '-vu'))) history.replaceState(null, '', espaceDe(session.user));
  sessionStorage.setItem(CLE_SESSION + '-vu', '1');
  await route();
  if (session.user.mustChange) setTimeout(() => import('./views-admin.js').then(m => m.changePasswordDialog(session.user, true)), 400);
}
window.addEventListener('hashchange', route);

(async function boot() {
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch { /* ignore */ }
  try { await seedIfEmpty(); } catch (e) { app.textContent = 'Stockage local indisponible : ' + e.message; return; }
  if (VARIANT.integre) {
    let r;
    try { r = await connexionIntegree(); } catch (e) { r = { message: 'Lecture des données d’ÉduGestion impossible : ' + (e && e.message || e) }; }
    if (r.user) { session.user = r.user; sessionStorage.setItem(CLE_SESSION, r.user.id); return start(); }
    return ecranIntegre(r.message);
  }
  const id = sessionStorage.getItem(CLE_SESSION);
  if (id) { const rec = await db.get('users', id); if (rec && rec.actif !== false) { session.user = rec; return start(); } }
  loginScreen();
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // mise à jour vérifiée au démarrage, au retour sur l'application et toutes les 30 min (sans cache HTTP)
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    const verifier = () => reg.update().catch(() => {});
    verifier(); setInterval(verifier, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verifier(); });
  }).catch(() => {}));
  // nouvelle version installée pendant l'utilisation : rechargement pour repartir sur des fichiers cohérents
  let dejaControle = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!dejaControle) { dejaControle = true; return; }
    if (document.querySelector('.dialog')) { toast('Nouvelle version installée : elle sera active au prochain démarrage.'); return; }
    toast('Nouvelle version installée — rechargement…'); setTimeout(() => location.reload(), 800);
  });
}
export { logout };
