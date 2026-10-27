/* République du Bénin — Ministère des Enseignements Maternel et Primaire (MEMP)
   Application CP — point d'entrée.   Conception : Maître Aimé FACHE — Tél. 01 96 51 03 33 */
import { h, $, toast, checkPassword, hashPassword, modal, currentSchoolYear } from './util.js';
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
  { g: null, id: 'accueil', ic: '\uE000', t: 'Tableau de bord' },
  { id: 'espacedosp', ic: '\uE011', t: 'Mon espace de travail DOSP', seul: 'dosp' },
  { id: 'espace', ic: '\uE01E', t: 'Espace CP de zone', pasDosp: true },
  { id: 'synocp', ic: '\uE00F', t: 'Tableau synoptique du CP', pasDosp: true },
  { id: 'zonesup', ic: '\uE042', t: 'Zones pédagogiques et UP' },
  { id: 'uascep', ic: '\uE047', t: 'Bureaux UASCEP', roles: ['ADMIN', 'DDEMP', 'CCS', 'DOSP', 'CP'] },
  { g: 'Vie scolaire, sport et pilotage', id: 'pvssport', ic: '\uE04D', t: 'Sport scolaire' },
  { id: 'pvspilotage', ic: '\uE015', t: 'Tableau de bord du pilotage' },
  { id: 'pvscommunication', ic: '\uE050', t: 'Communication et alertes' },
  { id: 'pvssante', ic: '\uE07F', t: 'Santé, cantine et inclusion' },
  { id: 'synodosp', ic: '\uE00F', t: 'Tableau synoptique de la DOSP', seul: 'dosp' },
  { g: 'Collecte', id: 'ecoles', ic: '\uE022', t: 'Écoles' },
  { id: 'personnel', ic: '\uE01E', t: 'Personnel enseignant' },
  { id: 'carriere', ic: '\uE016', t: 'Gestion de carrière' },
  { id: 'recensement', ic: '\uE011', t: 'Fiches de recensement (EP, EM)' },
  { id: 'fiches', ic: '\uE00E', t: 'Fiches de collecte' },
  { id: 'saisie', ic: '\uE029', t: 'Saisie manuelle (sans Excel)' },
  { id: 'envois', ic: '\uE00B', t: 'Réception et acheminement des fiches', seul: 'dosp' },
  { id: 'effectifs', ic: '\uE01F', t: 'Effectifs des apprenants' },
  { id: 'infra', ic: '\uE026', t: 'Infrastructures et mobilier' },
  { id: 'ecolesstruct', ic: '\uE022', t: 'Écoles : structure et équipements' },
  { id: 'cep', ic: '\uE020', t: 'CEP : candidats et réussite' },
  { id: 'synoptique', ic: '\uE011', t: 'Synthèse des fiches (consolidation)' },
  { g: 'Prévision et suivi-évaluation', id: 'prevision', ic: '\uE07A', t: "Prévisions de l'année suivante", seul: 'dosp' },
  { id: 'besoins', ic: '\uE03F', t: 'Besoins et écarts (enseignants, salles, places)', seul: 'dosp' },
  { id: 'suivieval', ic: '\uE015', t: 'Suivi-évaluation (tableau de bord)', seul: 'dosp' },
  { id: 'capacites', ic: '\uE020', t: 'Renforcement des capacités', seul: 'dosp' },
  { id: 'plandosp', ic: '\uE02E', t: "Attributions et plan d'action", seul: 'dosp' },
  { id: 'docsdosp', ic: '\uE04B', t: 'Documents officiels de la DOSP', seul: 'dosp' },
  { g: 'Pédagogie', id: 'activites', ic: '\uE017', t: 'Activités pédagogiques' },
  { id: 'planningcp', ic: '\uE017', t: 'Planification des activités (CP)', pasDosp: true },
  { id: 'bilans', ic: '\uE016', t: 'Bilans trimestriel / annuel' },
  { id: 'themes', ic: '\uE02E', t: 'Thèmes 2026-2027' },
  { id: 'planif', ic: '\uE017', t: 'Planification annuelle EM et EP' },
  { id: 'planification', ic: '\uE031', t: 'Planification CI → CM2 (projet)' },
  { id: 'emploi', ic: '\uE018', t: 'Emplois du temps officiels' },
  { id: 'calendrier', ic: '\uE017', t: 'Calendrier scolaire officiel' },
  { id: 'reglement', ic: '\uE03F', t: 'Règlement intérieur' },
  { id: 'documents', ic: '\uE00D', t: 'Documents officiels' },
  { id: 'whatsapp', ic: '\uE035', t: 'Groupe WhatsApp des directeurs', roles: ['ADMIN', 'DDEMP', 'CCS', 'DOSP', 'CP'] },
  { g: 'Administration', id: 'referentiel', ic: '\uE049', t: 'Référentiel national', roles: ['ADMIN', 'DDEMP', 'CCS', 'DOSP', 'CP'] },
  { id: 'identite', ic: '\uE029', t: 'Identité numérique (signature)' },
  { id: 'transmission', ic: '\uE058', t: 'Transmission & sauvegarde' },
  { id: 'verifier', ic: '\uE004', t: 'Vérifier un document' },
  { id: 'journal', ic: '\uE02F', t: 'Journal des validations' },
  { id: 'utilisateurs', ic: '\uE01C', t: 'Utilisateurs', roles: ['ADMIN'], horsIntegre: true },
  { id: 'parametres', ic: '\uE051', t: 'Paramètres & à propos' },
];
const ROUTES = { zonesup: 'views-zonesup', uascep: 'views-uascep', pvssport: 'views-pvs', pvspilotage: 'views-pvs', pvscommunication: 'views-pvs', pvssante: 'views-pvs', accueil: 'views-core', ecoles: 'views-core', fiches: 'views-core', bilans: 'views-bilan', bilan: 'views-bilan', fiche: 'fiche-ui', effectifs: 'views-effectifs', effectif: 'views-effectifs', infra: 'views-infra', ecolesstruct: 'views-ecoles', cep: 'views-cep',
  synoptique: 'views-more', activites: 'views-more', planningcp: 'views-planning', themes: 'views-more', planification: 'views-more', reglement: 'views-officiel', emploi: 'views-officiel', planif: 'views-officiel', espace: 'views-officiel', synocp: 'views-officiel', calendrier: 'views-officiel', personnel: 'views-officiel', carriere: 'views-officiel', documents: 'views-more', referentiel: 'views-more',
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
    h('button', { class: 'btn primary', style: { width: '100%' }, type: 'submit' }, 'Se connecter'),
    h('p', { style: { textAlign: 'right', margin: '8px 0 0' } }, h('a', { href: '#', onclick: (e) => { e.preventDefault(); import('./motdepasse.js').then(m => m.dialogueOubli(u.value.trim())); } }, '\uE032 Mot de passe oublié ?')));
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
    h('div', { class: 'sb-foot' }, h('span', { class: 'who' }, `\uE01D ${u.prenoms || ''} ${u.nom || u.username}`, h('br'), h('small', ROLES[u.role] + (u.codeZone ? ' · ' + u.codeZone : u.codeCs ? ' · ' + u.codeCs : ''))),
      VARIANT.integre ? h('a', { class: 'btn sm', href: retourEduGestion() }, '← Retour à ÉduGestion') : h('button', { class: 'btn sm', onclick: logout }, 'Se déconnecter'), h('div', { style: { fontSize: '.68rem', opacity: .8, marginTop: '8px' } }, CREDIT)));
  const main = h('div', { class: 'main' },
    h('header', { class: 'topbar' }, h('button', { class: 'icon-btn burger', 'aria-label': 'Menu', onclick: (e) => { e.stopPropagation(); document.body.classList.toggle('nav-open'); } }, '\uE03E'), h('div', { class: 'grow bh-titre' }, h('strong', VARIANT.profil === 'dosp' ? 'Application DOSP' : APP.name), h('small', `${ROLES[u.role] || ''}${u.codeCs ? ' · ' + u.codeCs : ''} · ${currentSchoolYear()}`)), h('span', { class: 'bh-user' }, `${u.prenoms || ''} ${u.nom || u.username}`.trim()), VARIANT.integre ? h('a', { class: 'btn sm no-print', href: retourEduGestion(), title: 'Revenir à ÉduGestion Pro', style: { whiteSpace: 'nowrap', marginLeft: '8px' } }, '← ÉduGestion') : null),
    h('div', { class: 'titlebar' }, h('button', { class: 'btn sm no-print btn-retour', type: 'button', title: 'Revenir à la page précédente', 'aria-label': 'Revenir à la page précédente', onclick: retourArriere }, '← Retour'), h('h2', { id: 'v-title' }), h('span', { class: 'sub', id: 'v-sub' })),
    h('div', { class: 'actionbar', id: 'v-bar' }),
    h('section', { class: 'view', id: 'v-body' }),
    h('div', { class: 'statusbar', id: 'v-status' }, 'Prêt'));
  app.replaceChildren(h('div', { class: 'shell' }, side, main));
  // un toucher dans la page referme le menu (mais pas le bouton \uE03E lui-même, qui l'ouvre)
  main.addEventListener('click', (e) => { if (!e.target.closest('.burger')) document.body.classList.remove('nav-open'); });
}

const CEP_SECT = { titre: 'Candidats présentés au CEP dans la circonscription, par sexe (inscrits, présents, admis)', colonnes: 'cep', note: 'Source : fiche de fin d’année des EP (rubrique CEP), à défaut le rapport du CM2. Modes « Par zone », « Par arrondissement » et « Par école » : sous-totaux public / privé.' };
const GEN_SECT = { titre: 'Chiffres de la circonscription : public / privé', colonnes: 'general' };
const SECTEURS = { accueil: [GEN_SECT], ecoles: [GEN_SECT], ecolesstruct: [GEN_SECT], infra: [GEN_SECT], synoptique: [GEN_SECT], synodosp: [GEN_SECT, CEP_SECT], synocp: [GEN_SECT], zonesup: [GEN_SECT],
  effectifs: [{ titre: 'Effectifs des apprenants : public / privé', colonnes: 'effectifs' }], personnel: [{ titre: 'Personnel enseignant par sexe : public / privé', colonnes: 'personnel' }],
  suivieval: [GEN_SECT, CEP_SECT], besoins: [GEN_SECT], prevision: [GEN_SECT], cep: [CEP_SECT], espacedosp: [GEN_SECT] };
let routeSeq = 0;
/* Bouton « ← Retour » : écran précédent de l'application (historique), sinon le tableau de bord */
let pagesVues = 0;
function retourArriere() {
  if (pagesVues > 1) { pagesVues -= 2; history.back(); }
  else location.hash = '#/accueil';
}
async function route() {
  if (!session.user) return;
  pagesVues++;
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
    // répartition public / privé (EP, EM, total public, total privé, synthèse, total de la circonscription) sous les écrans de chiffres
    const SECT = SECTEURS[id];
    if (SECT && live() && !(id === 'effectifs' && args.length)) {
      const { blocSecteurs } = await import('./secteurs.js');
      for (const o of SECT) el.append(await blocSecteurs(session.user, o));
    }
  } catch (e) {
    console.error(e);
    // fichiers d'une ancienne et d'une nouvelle version mélangés (mise à jour arrivée pendant l'utilisation) : on recharge une fois
    if (!sessionStorage.getItem('maj-recharge')) { sessionStorage.setItem('maj-recharge', '1'); toast('Mise à jour de l\'application — rechargement…'); setTimeout(() => location.reload(), 600); return; }
    el.replaceChildren(h('div', { class: 'card' }, h('h3', 'Erreur'), h('p', String(e && e.message || e)), h('button', { class: 'btn primary', onclick: () => location.reload() }, '↻ Recharger l\'application')));
  }
  sessionStorage.removeItem('maj-recharge');
  if (!live()) { if (fn) { try { await fn(); } catch { /* ignore */ } } return; }
  cleanup = fn; body.replaceChildren(el); bar.replaceWith(nbar); window.scrollTo(0, 0);
  mesurerEntetes();
}

/* En-têtes fixes : hauteur réelle de la barre du haut et de la barre d'actions (elle passe sur plusieurs lignes sur téléphone) */
let _obs = null;
function mesurerEntetes() {
  const top = document.querySelector('.topbar'), bar = document.getElementById('v-bar');
  const maj = () => {
    const ht = top ? top.getBoundingClientRect().height : 56, hb = bar && bar.childElementCount ? bar.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty('--hbar', Math.round(ht) + 'px');
    document.documentElement.style.setProperty('--hdr', Math.round(ht + hb) + 'px');
  };
  maj();
  if (window.ResizeObserver) { if (_obs) _obs.disconnect(); _obs = new ResizeObserver(maj); if (top) _obs.observe(top); if (bar) _obs.observe(bar); }
}
addEventListener('resize', () => mesurerEntetes());
import('./entetes.js').catch(() => { /* en-têtes flottants indisponibles : tableaux normaux */ });

function logout() {
  if (VARIANT.integre) { location.href = retourEduGestion(); return; } sessionStorage.removeItem(CLE_SESSION); sessionStorage.removeItem(CLE_SESSION + '-vu'); session.user = null; loginScreen(); }

async function start() {
  // référentiel des villages (js/choix.js) : département / commune par défaut des formulaires qui n'en ont pas
  const u0 = session.user || {};
  window.CHOIX_GEO_DEFAUT = /pobe/i.test(VARIANT.seed || VARIANT.id || '') ? { departement: 'Plateau', commune: 'Pobè' }
    : { departement: u0.departement || '', commune: u0.commune || '' };
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
