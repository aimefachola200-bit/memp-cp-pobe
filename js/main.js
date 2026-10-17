/* République du Bénin — Ministère des Enseignements Maternel et Primaire (MEMP)
   Application CP — point d'entrée.   Conception : Maître Aimé FACHE — Tél. 01 96 51 03 33 */
import { h, $, toast, checkPassword, hashPassword, modal } from './util.js';
import { db } from './db.js';
import { APP, CREDIT, VARIANT } from './config.js';
const CLE_SESSION = 'memp-user-' + VARIANT.id;
import { session, seedIfEmpty, refreshDatalists, ROLES } from './data.js';
import { actionBar } from './ui.js';

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
  { g: 'Collecte', id: 'ecoles', ic: '🏫', t: 'Écoles' },
  { id: 'personnel', ic: '👩‍🏫', t: 'Personnel enseignant' },
  { id: 'fiches', ic: '📝', t: 'Fiches de collecte' },
  { id: 'rapports', ic: '📊', t: "Rapports de fin d'année" },
  { id: 'synoptique', ic: '🗂️', t: 'Tableau synoptique' },
  { g: 'Pédagogie', id: 'activites', ic: '📅', t: 'Activités pédagogiques' },
  { id: 'bilans', ic: '📈', t: 'Bilans trimestriel / annuel' },
  { id: 'themes', ic: '🎯', t: 'Thèmes 2026-2027' },
  { id: 'planification', ic: '📚', t: 'Planification CI → CM2' },
  { id: 'emploi', ic: '🕘', t: 'Emplois du temps officiels' },
  { id: 'calendrier', ic: '🗓️', t: 'Calendrier scolaire officiel' },
  { id: 'reglement', ic: '⚖️', t: 'Règlement intérieur' },
  { id: 'documents', ic: '📄', t: 'Documents officiels' },
  { g: 'Administration', id: 'referentiel', ic: '🌍', t: 'Référentiel national', roles: ['ADMIN', 'CCS', 'CP'] },
  { id: 'identite', ic: '✍️', t: 'Identité numérique (signature)' },
  { id: 'transmission', ic: '🔄', t: 'Transmission & sauvegarde' },
  { id: 'verifier', ic: '✅', t: 'Vérifier un document' },
  { id: 'journal', ic: '📜', t: 'Journal des validations' },
  { id: 'utilisateurs', ic: '👥', t: 'Utilisateurs', roles: ['ADMIN'] },
  { id: 'parametres', ic: '⚙️', t: 'Paramètres & à propos' },
];
const ROUTES = { accueil: 'views-core', ecoles: 'views-core', fiches: 'views-core', rapports: 'views-reports', rapport: 'views-reports', bilans: 'views-bilan', bilan: 'views-bilan', fiche: 'fiche-ui',
  synoptique: 'views-more', activites: 'views-more', themes: 'views-more', planification: 'views-more', reglement: 'views-officiel', emploi: 'views-officiel', calendrier: 'views-officiel', personnel: 'views-officiel', documents: 'views-more', referentiel: 'views-more',
  identite: 'views-admin', transmission: 'views-admin', verifier: 'views-admin', journal: 'views-admin', utilisateurs: 'views-admin', parametres: 'views-admin' };

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
    h('div', { class: 'login-body' }, h('h1', APP.full), VARIANT.titre ? h('p', { class: 'sub', style: { fontWeight: '700', color: 'var(--ink)', margin: '.1em 0 0' } }, VARIANT.titre) : null, h('p', { class: 'sub' }, 'Collecte, validation et suivi pédagogique — fonctionne sans connexion Internet.'), form,
      h('div', { class: 'hint' }, h('b', 'Premier démarrage : '), 'comptes initiaux ', ...VARIANT.comptes.flatMap(([u, p], i) => [i ? ', ' : '', h('code', `${u} / ${p}`)]), '. Changez les mots de passe dès la première connexion.'),
      h('p', { style: { textAlign: 'center', fontSize: '.8rem', color: 'var(--mute)', marginTop: '14px' } }, CREDIT, h('br'), `Version ${APP.version}`)))));
  u.focus();
}

/* ---------------- Coque + routage ---------------- */
function shell() {
  const u = session.user;
  const nav = h('nav', { class: 'nav', 'aria-label': 'Menu principal' });
  NAV.forEach(n => {
    if (n.roles && !n.roles.includes(u.role)) return;
    if (n.g) nav.appendChild(h('div', { class: 'grp' }, n.g));
    nav.appendChild(h('button', { 'data-r': n.id, onclick: () => { location.hash = '#/' + n.id; document.body.classList.remove('nav-open'); } }, h('span', { class: 'ic' }, n.ic), n.t));
  });
  const side = h('aside', { class: 'sidebar', id: 'sidebar' },
    h('div', { class: 'sb-head' }, h('img', { src: 'assets/armoiries.png', alt: 'Armoiries du Bénin' }), h('b', 'APPLICATION CP'), h('span', 'MEMP — RÉPUBLIQUE DU BÉNIN')),
    nav,
    h('div', { class: 'sb-foot' }, h('span', { class: 'who' }, `👤 ${u.prenoms || ''} ${u.nom || u.username}`, h('br'), h('small', ROLES[u.role] + (u.codeZone ? ' · ' + u.codeZone : u.codeCs ? ' · ' + u.codeCs : ''))),
      h('button', { class: 'btn sm', onclick: logout }, 'Se déconnecter'), h('div', { style: { fontSize: '.68rem', opacity: .8, marginTop: '8px' } }, CREDIT)));
  const main = h('div', { class: 'main' },
    h('header', { class: 'topbar' }, h('button', { class: 'icon-btn burger', 'aria-label': 'Menu', onclick: () => document.body.classList.toggle('nav-open') }, '☰'), h('div', { class: 'grow' }, banner())),
    h('div', { class: 'titlebar' }, h('h2', { id: 'v-title' }), h('span', { class: 'sub', id: 'v-sub' })),
    h('div', { class: 'actionbar', id: 'v-bar' }),
    h('section', { class: 'view', id: 'v-body' }),
    h('div', { class: 'statusbar', id: 'v-status' }, 'Prêt'));
  app.replaceChildren(h('div', { class: 'shell' }, side, main));
  main.addEventListener('click', () => document.body.classList.remove('nav-open'));
}

let routeSeq = 0;
async function route() {
  if (!session.user) return;
  const my = ++routeSeq;
  const [r, ...args] = (location.hash.replace(/^#\/?/, '') || 'accueil').split('/');
  const id = ROUTES[r] ? r : 'accueil';
  const entry = NAV.find(n => n.id === id);
  if (entry && entry.roles && !entry.roles.includes(session.user.role)) { toast('Accès non autorisé pour votre rôle.', 'err'); location.hash = '#/accueil'; return; }
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('on', b.dataset.r === (id === 'fiche' ? 'fiches' : id === 'rapport' ? 'rapports' : id === 'bilan' ? 'bilans' : id)));
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
    console.error(e); el.replaceChildren(h('div', { class: 'card' }, h('h3', 'Erreur'), h('p', String(e && e.message || e))));
  }
  if (!live()) { if (fn) { try { await fn(); } catch { /* ignore */ } } return; }
  cleanup = fn; body.replaceChildren(el); bar.replaceWith(nbar); window.scrollTo(0, 0);
}

function logout() { sessionStorage.removeItem(CLE_SESSION); session.user = null; loginScreen(); }

async function start() {
  await refreshDatalists();
  shell();
  if (!location.hash) history.replaceState(null, '', '#/accueil');
  await route();
  if (session.user.mustChange) setTimeout(() => import('./views-admin.js').then(m => m.changePasswordDialog(session.user, true)), 400);
}
window.addEventListener('hashchange', route);

(async function boot() {
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch { /* ignore */ }
  try { await seedIfEmpty(); } catch (e) { app.textContent = 'Stockage local indisponible : ' + e.message; return; }
  const id = sessionStorage.getItem(CLE_SESSION);
  if (id) { const rec = await db.get('users', id); if (rec && rec.actif !== false) { session.user = rec; return start(); } }
  loginScreen();
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
export { logout };
