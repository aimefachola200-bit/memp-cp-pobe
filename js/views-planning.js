/* République du Bénin — MEMP — Planification des activités du conseiller pédagogique (mensuelle, trimestrielle, annuelle)
   Présentée comme la planification des écoles : jours × plages horaires, sur l'année scolaire 2026-2027 (calendrier officiel :
   trimestres, congés, jours fériés ; dates des unités pédagogiques, conférences et formations groupées). Remplie à la main,
   enregistrée pour chaque CP, téléchargeable (PDF, Excel, version vierge) et imprimable.
   Conception : Maître Aimé FACHE */
import { h, toast, modal, confirmBox, download, clean, nowISO, norm } from './util.js';
import { db } from './db.js';
import { fieldEl } from './ui.js';
import { scoped, inScope, addLog } from './data.js';
import { XlsxBook } from './xlsx.js';
import { newPdf, bannerBytes } from './pdf.js';

export async function render(id, ctx) { return planning(ctx); }

const ANNEE = '2026-2027';
const TYPES = ['Visite de classe', 'Unité pédagogique', 'Formation groupée', 'Conférence pédagogique', 'Réunion', 'Suivi', 'Encadrement', 'Inspection', 'Autre'];
const ABR = { 'Visite de classe': 'VC', 'Unité pédagogique': 'UP', 'Formation groupée': 'FG', 'Conférence pédagogique': 'CF', 'Réunion': 'RÉU', 'Suivi': 'SUI', 'Encadrement': 'ENC', 'Inspection': 'INS', 'Autre': 'AUT' };
const PLAGES_DEFAUT = ['07h30 – 09h30', '10h00 – 12h00', '15h00 – 17h00'];
const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_ANNEE = [[2026, 9], [2026, 10], [2026, 11], [2026, 12], [2027, 1], [2027, 2], [2027, 3], [2027, 4], [2027, 5], [2027, 6]];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fr = (s) => s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
const libMois = ([y, m]) => `${MOIS[m - 1]} ${y}`;
const pdfBlob = (b) => new Blob([b], { type: 'application/pdf' });

/* ---------- calendrier officiel ---------- */
async function calendrier() {
  const [O, T] = await Promise.all([fetch('data/officiel.json').then(r => r.json()), fetch('data/themes.json').then(r => r.json())]);
  const L = ((O.calendrier || {})[ANNEE] || {}).lignes || [];
  const trimestres = L.filter(l => l.type === 'trimestre').map((l, i) => ({ n: i + 1, libelle: l.libelle, debut: l.debut, fin: l.fin }));
  const fermetures = L.filter(l => ['conges', 'vacances', 'ferie', 'pre_rentree'].includes(l.type)).map(l => {
    const apres = /après les cours/i.test(l.precision || '') && l.type !== 'ferie';   // le premier jour est encore un jour de classe
    return { libelle: l.libelle, type: l.type, debut: l.debut, fin: l.fin, apres };
  });
  const evenements = {};   // date -> [libellés officiels]
  const ajout = (d, t) => { if (/^\d{4}-\d{2}-\d{2}$/.test(d || '')) (evenements[d] = evenements[d] || []).push(t); };
  (T.up_primaire || []).forEach(x => ajout(x.date, `UP primaire n°${x.n} : ${x.theme}`));
  (T.up_maternelle || []).forEach(x => ajout(x.date, `UP maternelle n°${x.n} : ${x.theme}`));
  for (const k of ['conferences', 'formations']) for (const x of (T[k] || [])) for (const d of [x.date, x.date_em, x.date_ep].filter(Boolean)) ajout(d, `${k === 'conferences' ? 'Conférence pédagogique' : 'Formation groupée'} : ${x.theme || ''}`);
  const fermeture = (d) => fermetures.find(f => (f.apres ? d > f.debut : d >= f.debut) && d <= f.fin) || null;
  const trimestreDe = (d) => trimestres.find(t => d >= t.debut && d <= t.fin) || null;
  return { trimestres, fermeture, trimestreDe, evenements };
}
function joursDuMois(y, m) {
  const out = [], d = new Date(y, m - 1, 1);
  while (d.getMonth() === m - 1) { const j = d.getDay(); if (j >= 1 && j <= 5) out.push(iso(d)); d.setDate(d.getDate() + 1); }
  return out;
}
const lundiDe = (s) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const plus = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };

async function planning(ctx) {
  const u = ctx.user;
  ctx.title('Planification des activités du CP', `Année scolaire ${ANNEE} — mensuelle, trimestrielle et annuelle (jours, plages horaires, activités, écoles)`);
  const C = await calendrier();
  // CP dont on affiche la planification : soi-même (CP) ; le CCS, la DDEMP ou l'administrateur choisissent un CP
  const cps = u.role === 'CP' ? [u] : (await db.all('users')).filter(x => x.role === 'CP' && x.actif !== false && (u.role === 'ADMIN' || inScope(u, x) || (x.codeCs && x.codeCs === u.codeCs))).sort((a, b) => (a.numZone || '').localeCompare(b.numZone || '', 'fr', { numeric: true }));
  let cp = u.role === 'CP' ? u : (cps.find(x => x.username === (localStorage.getItem('planning-cp') || '')) || cps[0] || u);
  let vue = (await db.setting('planning-vue')) || 'mois', moisI = Math.max(0, MOIS_ANNEE.findIndex(([y, m]) => { const n = new Date(); return n.getFullYear() === y && n.getMonth() + 1 === m; })), trim = 1;
  const cle = () => `planningcp:${cp.username}:${ANNEE}`;
  let P = null, modifie = false;
  const charger = async () => { P = (await db.setting(cle())) || { plages: [...PLAGES_DEFAUT], cellules: {}, jours: {} }; P.plages = P.plages && P.plages.length ? P.plages : [...PLAGES_DEFAUT]; P.cellules = P.cellules || {}; P.jours = P.jours || {}; modifie = false; };
  const enregistrer = async (silence) => { P.maj = nowISO(); P.par = u.username; await db.setting(cle(), P); modifie = false; if (!silence) toast('Planification enregistrée.'); };
  const ecoles = (await scoped('schools', u)).filter(s => u.role !== 'CP' || s.codeZone === u.codeZone || !u.codeZone).map(s => s.nom).sort((a, b) => a.localeCompare(b, 'fr'));
  const dlId = 'dl-planning-ecoles';
  if (!document.getElementById(dlId)) document.body.append(h('datalist', { id: dlId }, ecoles.map(n => h('option', { value: n }))));

  const choixCp = h('div'), tabs = h('div', { class: 'tabs no-print' }), sous = h('div', { class: 'tabs no-print' }), holder = h('div');
  ctx.el.append(choixCp, tabs, sous, holder);
  await charger();

  const texteCellule = (c) => c ? [c.type ? (ABR[c.type] ? ABR[c.type] + ' — ' : '') + c.type : '', c.ecole, c.objet, c.obs ? '(' + c.obs + ')' : ''].filter(Boolean).join(' · ') : '';
  const enTete = () => { const n = `${cp.prenoms || ''} ${cp.nom || cp.username}`.trim(); return n + (cp.numZone && !/zone/i.test(n) ? ` — Zone pédagogique ${cp.numZone}` : ''); };

  async function editer(d, i) {
    const k = d + '|' + i, c = { ...(P.cellules[k] || {}) };
    const body = h('div', { class: 'grid12' },
      h('p', { class: 'notes c12' }, `${JOURS[new Date(d + 'T12:00:00').getDay()]} ${fr(d)} — ${P.plages[i]}`, ...(C.evenements[d] || []).map(e => h('span', { class: 'badge Transmise', style: { marginLeft: '6px' } }, e.slice(0, 70)))),
      fieldEl({ k: 'type', l: "Type d'activité", t: 'select', options: TYPES, w: 'half' }, c.type || '', (kk, v) => { c.type = v; }),
      fieldEl({ k: 'ecole', l: 'École concernée / lieu', t: 'text', list: dlId, w: 'half' }, c.ecole || '', (kk, v) => { c.ecole = v; }),
      fieldEl({ k: 'objet', l: 'Activité / objet (thème, classe visitée…)', t: 'text' }, c.objet || '', (kk, v) => { c.objet = v; }),
      fieldEl({ k: 'obs', l: 'Observations', t: 'text' }, c.obs || '', (kk, v) => { c.obs = v; }));
    modal({ title: '\uE017 Activité du CP', body, actions: [
      { label: '\uE005 Vider', onClick: async () => { delete P.cellules[k]; await enregistrer(true); draw(); } },
      { label: 'Annuler' },
      { label: 'Enregistrer', kind: 'primary', onClick: async () => { if (c.type || c.ecole || c.objet || c.obs) P.cellules[k] = c; else delete P.cellules[k]; await enregistrer(true); draw(); } }] });
  }

  /* ---------- vue mensuelle : jours × plages horaires ---------- */
  const lignesMois = (mi) => { const [y, m] = MOIS_ANNEE[mi]; return joursDuMois(y, m).map(d => ({ d, ferme: C.fermeture(d), evts: C.evenements[d] || [], t: C.trimestreDe(d) })); };
  function vueMois() {
    const L = lignesMois(moisI);
    sous.replaceChildren(...MOIS_ANNEE.map((ym, i) => h('button', { class: 'tab' + (i === moisI ? ' on' : ''), onclick: () => { moisI = i; draw(); } }, libMois(ym).replace(/ 20(\d\d)$/, " '$1"))));
    const nAct = L.reduce((s, l) => s + P.plages.filter((_, i) => P.cellules[l.d + '|' + i]).length, 0);
    return h('div', { class: 'card' }, h('h3', { class: 'fixe' }, `Planification mensuelle — ${libMois(MOIS_ANNEE[moisI])} — ${enTete()}`),
      h('p', { class: 'notes' }, 'Touchez une case pour y inscrire une activité (type, école, objet, observations). Les jours de congé et les fériés du calendrier officiel sont grisés ; les dates des UP, conférences et formations groupées sont rappelées.'),
      h('div', { class: 'fixe-wrap' }, h('table', { class: 'g fixe1 planning' }, h('thead', h('tr', h('th', 'Jour'), ...P.plages.map(p => h('th', p)), h('th', 'Événements officiels / observations du jour'))),
        h('tbody', L.map(l => h('tr', { class: l.ferme ? 'pl-ferme' : '' }, h('td', { class: 'lab' }, h('b', JOURS[new Date(l.d + 'T12:00:00').getDay()]), ' ', fr(l.d).slice(0, 5)),
          ...(l.ferme ? [h('td', { colspan: P.plages.length, class: 'pl-conge' }, l.ferme.libelle)] : P.plages.map((_, i) => { const c = P.cellules[l.d + '|' + i];
            return h('td', { class: 'pl-cel' + (c ? ' pl-' + norm(c.type || 'autre').replace(/ /g, '-') : ''), tabindex: 0, role: 'button', 'aria-label': `${fr(l.d)} ${P.plages[i]}`, onclick: () => editer(l.d, i), onkeydown: (e) => { if (e.key === 'Enter') editer(l.d, i); } }, c ? texteCellule(c) : h('span', { class: 'pl-vide' }, '+')); })),
          h('td', { class: 'pl-evt' }, ...l.evts.map(e => h('div', { class: 'badge Transmise pl-badge' }, e)), h('input', { class: 'pl-obs', placeholder: 'Observation du jour', 'aria-label': 'Observation du jour ' + fr(l.d), value: P.jours[l.d] || '', onchange: async (e) => { if (e.target.value) P.jours[l.d] = e.target.value; else delete P.jours[l.d]; await enregistrer(true); } }))))))),
      h('p', { class: 'notes' }, `${nAct} activité(s) planifiée(s) ce mois-ci.`));
  }
  /* ---------- vue trimestrielle : semaines × jours ---------- */
  const activitesDuJour = (d) => P.plages.map((p, i) => P.cellules[d + '|' + i] ? `${p} : ${texteCellule(P.cellules[d + '|' + i])}` : '').filter(Boolean);
  const semainesTrim = (n) => {
    const t = C.trimestres.find(x => x.n === n); if (!t) return [];
    const out = []; for (let l = lundiDe(t.debut); l <= t.fin; l = plus(l, 7)) out.push({ lundi: l, jours: [0, 1, 2, 3, 4].map(k => plus(l, k)) });
    return out;
  };
  function vueTrim() {
    sous.replaceChildren(...C.trimestres.map(t => h('button', { class: 'tab' + (t.n === trim ? ' on' : ''), onclick: () => { trim = t.n; draw(); } }, `${t.libelle} (${fr(t.debut).slice(0, 5)} → ${fr(t.fin).slice(0, 5)})`)));
    const S = semainesTrim(trim), t = C.trimestres.find(x => x.n === trim);
    return h('div', { class: 'card' }, h('h3', { class: 'fixe' }, `Planification trimestrielle — ${t ? t.libelle : ''} — ${enTete()}`),
      h('p', { class: 'notes' }, 'Vue de synthèse des activités inscrites dans la planification mensuelle ; touchez un jour pour l’ouvrir dans son mois.'),
      h('div', { class: 'fixe-wrap' }, h('table', { class: 'g fixe1 planning trim' }, h('thead', h('tr', h('th', 'Semaine'), ...['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'].map(j => h('th', j)), h('th', 'Nombre'))),
        h('tbody', S.map((s, i) => { let n = 0; return h('tr', h('td', { class: 'lab' }, h('b', `S${i + 1}`), h('br'), `${fr(s.jours[0]).slice(0, 5)} – ${fr(s.jours[4]).slice(0, 5)}`),
          ...s.jours.map(d => { const f = C.fermeture(d), a = activitesDuJour(d); n += a.length; const mi = MOIS_ANNEE.findIndex(([y, m]) => +d.slice(0, 4) === y && +d.slice(5, 7) === m);
            return h('td', { class: 'pl-sem' + (f || (t && (d < t.debut || d > t.fin)) ? ' pl-conge' : ''), onclick: () => { if (mi >= 0) { moisI = mi; vue = 'mois'; draw(); } } }, f ? f.libelle : (t && (d < t.debut || d > t.fin)) ? '—' : [...(C.evenements[d] || []).map(e => h('div', { class: 'badge Transmise pl-badge' }, e.slice(0, 60))), ...a.map(x => h('div', { class: 'pl-ligne' }, x))]); }),
          h('td', { class: 'calc' }, String(n))); })))));
  }
  /* ---------- vue annuelle : mois × types d'activités ---------- */
  const comptesMois = (mi) => { const o = Object.fromEntries(TYPES.map(t => [t, 0])); let tot = 0; lignesMois(mi).forEach(l => P.plages.forEach((_, i) => { const c = P.cellules[l.d + '|' + i]; if (c) { o[c.type || 'Autre'] = (o[c.type || 'Autre'] || 0) + 1; tot++; } })); return { o, tot }; };
  const officielsMois = (mi) => { const [y, m] = MOIS_ANNEE[mi], p = `${y}-${String(m).padStart(2, '0')}`; return Object.entries(C.evenements).filter(([d]) => d.startsWith(p)).sort().map(([d, l]) => `${fr(d).slice(0, 5)} : ${l.join(' ; ')}`); };
  function vueAnnee() {
    sous.replaceChildren();
    const R = MOIS_ANNEE.map((ym, i) => ({ ym, i, ...comptesMois(i), off: officielsMois(i) }));
    const tot = Object.fromEntries(TYPES.map(t => [t, R.reduce((s, r) => s + r.o[t], 0)]));
    return h('div', { class: 'card' }, h('h3', { class: 'fixe' }, `Planification annuelle ${ANNEE} — ${enTete()}`),
      h('div', { class: 'fixe-wrap' }, h('table', { class: 'g fixe1 planning an' }, h('thead', h('tr', h('th', 'Mois'), h('th', 'Trimestre'), ...TYPES.map(t => h('th', { title: t }, ABR[t])), h('th', 'Total'), h('th', 'Rendez-vous officiels (UP, conférences, formations)'))),
        h('tbody', R.map(r => h('tr', { onclick: () => { moisI = r.i; vue = 'mois'; draw(); }, style: { cursor: 'pointer' } }, h('td', { class: 'lab' }, libMois(r.ym)), h('td', { class: 'calc' }, String((C.trimestreDe(`${r.ym[0]}-${String(r.ym[1]).padStart(2, '0')}-15`) || {}).n || '—')),
          ...TYPES.map(t => h('td', { class: 'calc' }, r.o[t] ? String(r.o[t]) : '')), h('td', { class: 'calc' }, String(r.tot)), h('td', { class: 'pl-evt' }, r.off.join(' · ')))),
          h('tr', { class: 'tot' }, h('td', { class: 'lab' }, 'Année'), h('td', ''), ...TYPES.map(t => h('td', { class: 'calc' }, String(tot[t]))), h('td', { class: 'calc' }, String(R.reduce((s, r) => s + r.tot, 0))), h('td', ''))))),
      h('p', { class: 'notes' }, 'Légende : ' + TYPES.map(t => `${ABR[t]} = ${t}`).join(' · ')));
  }

  async function draw() {
    if (u.role !== 'CP') choixCp.replaceChildren(cps.length ? h('label', { class: 'field', style: { maxWidth: '420px' } }, h('span', 'Conseiller pédagogique'),
      h('select', { class: 'input', onchange: async (e) => { if (modifie) await enregistrer(true); cp = cps.find(x => x.username === e.target.value) || cp; try { localStorage.setItem('planning-cp', cp.username); } catch { /* */ } await charger(); draw(); } },
        cps.map(x => h('option', { value: x.username, selected: x.username === cp.username }, `${x.prenoms || ''} ${x.nom || ''} (${x.username})${x.numZone ? ' — zone ' + x.numZone : ''}`)))) : h('p', { class: 'notes' }, 'Aucun compte CP : la planification ci-dessous est celle de votre compte.'));
    tabs.replaceChildren(...[['mois', '\uE017 Mensuelle'], ['trim', '\uE011 Trimestrielle'], ['annee', '\uE017 Annuelle']].map(([k, l]) => h('button', { class: 'tab' + (k === vue ? ' on' : ''), onclick: () => { vue = k; db.setting('planning-vue', k); draw(); } }, l)));
    holder.replaceChildren(vue === 'mois' ? vueMois() : vue === 'trim' ? vueTrim() : vueAnnee());
    const n = Object.keys(P.cellules).length;
    ctx.status(`${enTete()} — ${n} activité(s) planifiée(s) sur l'année${P.maj ? ' · enregistrée le ' + new Date(P.maj).toLocaleString('fr-FR') : ''}`);
    ctx.actions([
      { label: '\uE01B Plages horaires', onClick: plages },
      { label: '\uE00B Reprendre les activités pédagogiques', title: 'Inscrit dans les cases vides les activités déjà enregistrées dans « Activités pédagogiques »', onClick: reprendre },
      { label: '\uE009 PDF', kind: 'primary', onClick: () => exporter('pdf', false) }, { label: '\uE009 Excel', onClick: () => exporter('xlsx', false) },
      { label: '\uE009 Vierge (PDF)', title: 'Grille vierge à remplir à la main', onClick: () => exporter('pdf', true) }, { label: '\uE009 Vierge (Excel)', onClick: () => exporter('xlsx', true) },
      { label: '\uE008 Imprimer', onClick: () => window.print() },
      { label: '\uE031 Fiches et guides des enseignants', title: 'Module Pédagogie : programmes, fiches, résumés, épreuves, planification des classes', onClick: () => { location.hash = '#/pedagogie'; } },
      { label: '\uE058 Réinitialiser', title: "Efface toute la planification de l'année de ce CP", onClick: async () => { if (!(await confirmBox(`Effacer toute la planification ${ANNEE} de ${enTete()} ?`, 'Effacer', true))) return; P = { plages: P.plages, cellules: {}, jours: {} }; await enregistrer(); await addLog(u, { action: 'Planification CP réinitialisée', target: cp.username }); draw(); } }]);
  }
  function plages() {
    const ta = h('textarea', { class: 'input', rows: 6, 'aria-label': 'Plages horaires, une par ligne' }, P.plages.join('\n'));
    modal({ title: '\uE01B Plages horaires', body: h('div', h('p', { class: 'notes' }, 'Une plage par ligne (1 à 6), par exemple « 07h30 – 09h30 ». Les activités déjà inscrites restent dans la même colonne.'), ta),
      actions: [{ label: 'Valeurs par défaut', onClick: () => { ta.value = PLAGES_DEFAUT.join('\n'); return false; } }, { label: 'Annuler' }, { label: 'Enregistrer', kind: 'primary', onClick: async () => {
        const l = ta.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 6); if (!l.length) { toast('Indiquez au moins une plage.', 'warn'); return false; }
        P.plages = l; await enregistrer(); draw(); } }] });
  }
  async function reprendre() {
    const acts = (await scoped('activities', cp.role === 'CP' ? cp : u)).filter(a => a.date && a.date >= '2026-09-01' && a.date <= '2027-07-31');
    if (!acts.length) return toast('Aucune activité pédagogique enregistrée pour cette année.', 'warn');
    let n = 0, sans = 0;
    for (const a of acts.sort((x, y) => x.date.localeCompare(y.date))) {
      const d = a.date.slice(0, 10), dj = new Date(d + 'T12:00:00').getDay(); if (dj === 0 || dj === 6 || C.fermeture(d)) { sans++; continue; }
      const deja = P.plages.some((_, i) => { const c = P.cellules[d + '|' + i]; return c && c.ref === a.id; }); if (deja) continue;
      const i = P.plages.findIndex((_, k) => !P.cellules[d + '|' + k]); if (i < 0) { sans++; continue; }
      P.cellules[d + '|' + i] = { type: TYPES.includes(a.type) ? a.type : 'Autre', ecole: a.lieu || '', objet: a.theme || a.type || '', obs: a.obs || '', ref: a.id }; n++;
    }
    await enregistrer(true); toast(`${n} activité(s) reprise(s) dans la planification${sans ? ` — ${sans} non placée(s) (jour sans classe ou plages pleines)` : ''}.`, 'ok', 6000); draw();
  }

  /* ---------- exports ---------- */
  async function exporter(fmt, vierge) {
    const v = vierge ? (vue === 'annee' ? 'annee' : vue) : vue;
    const titre = v === 'mois' ? `PLANIFICATION MENSUELLE DES ACTIVITÉS DU CP — ${libMois(MOIS_ANNEE[moisI]).toUpperCase()}` : v === 'trim' ? `PLANIFICATION TRIMESTRIELLE DES ACTIVITÉS DU CP — ${(C.trimestres.find(x => x.n === trim) || {}).libelle || ''}`.toUpperCase() : `PLANIFICATION ANNUELLE DES ACTIVITÉS DU CP — ${ANNEE}`;
    const sousT = [vierge ? 'Conseiller pédagogique : ……………………………… Zone : ……' : enTete(), cp.nomCs || u.nomCs ? 'Circonscription scolaire de ' + (cp.nomCs || u.nomCs) : '', `Année scolaire ${ANNEE}`].filter(Boolean).join(' — ');
    let head, rows, widths;
    if (v === 'mois') {
      head = ['Jour', ...P.plages, 'Événements officiels / observations']; widths = [70, ...P.plages.map(() => 170), 150];
      rows = lignesMois(moisI).map(l => [`${JOURS[new Date(l.d + 'T12:00:00').getDay()]} ${fr(l.d)}`, ...(l.ferme ? [l.ferme.libelle, ...P.plages.slice(1).map(() => '')] : P.plages.map((_, i) => vierge ? '' : texteCellule(P.cellules[l.d + '|' + i]))), [...l.evts, vierge ? '' : (P.jours[l.d] || '')].filter(Boolean).join(' ; ')]);
    } else if (v === 'trim') {
      const t = C.trimestres.find(x => x.n === trim);
      head = ['Semaine', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']; widths = [70, 140, 140, 140, 140, 140];
      rows = semainesTrim(trim).map((s, i) => [`S${i + 1} (${fr(s.jours[0]).slice(0, 5)} – ${fr(s.jours[4]).slice(0, 5)})`, ...s.jours.map(d => { const f = C.fermeture(d); if (f) return f.libelle; if (t && (d < t.debut || d > t.fin)) return '—'; return [...(C.evenements[d] || []), ...(vierge ? [] : activitesDuJour(d))].join('\n'); })]);
    } else {
      head = ['Mois', 'Trim.', ...TYPES.map(t => ABR[t]), 'Total', 'Rendez-vous officiels']; widths = [70, 30, ...TYPES.map(() => 28), 34, 230];
      rows = MOIS_ANNEE.map((ym, i) => { const c = comptesMois(i); return [libMois(ym), String((C.trimestreDe(`${ym[0]}-${String(ym[1]).padStart(2, '0')}-15`) || {}).n || ''), ...TYPES.map(t => vierge ? '' : (c.o[t] ? String(c.o[t]) : '')), vierge ? '' : String(c.tot), officielsMois(i).join(' ; ')]; });
    }
    const nomF = clean(`Planification_CP_${v === 'mois' ? libMois(MOIS_ANNEE[moisI]) : v === 'trim' ? 'T' + trim : ANNEE}${vierge ? '_vierge' : '_' + cp.username}`).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (fmt === 'pdf') {
      const pdf = await newPdf({ title: titre, footer: 'Planification des activités du CP', orientation: 'landscape' });
      pdf.text('RÉPUBLIQUE DU BÉNIN — MINISTÈRE DES ENSEIGNEMENTS MATERNEL ET PRIMAIRE', { bold: true, align: 'center', size: 9 });
      pdf.space(2); pdf.titleBox([titre, sousT], { size: 11 });
      pdf.table({ widths, head: head.map((x, i) => ({ t: x, c: i, r: 0 })), rows: rows.map(r => r.map((x, i) => i === 0 ? { t: x, b: true } : x)), size: v === 'annee' ? 7.5 : 7, minH: vierge && v !== 'annee' ? 26 : 14, align: head.map((_, i) => v === 'annee' && i > 0 && i < head.length - 1 ? 'center' : 'left') });
      if (v === 'annee') { pdf.space(6); pdf.text('Légende : ' + TYPES.map(t => `${ABR[t]} = ${t}`).join(' · '), { size: 7.5 }); }
      pdf.space(14); pdf.text(`Fait à …………………………, le ……………………        Le Conseiller pédagogique : ${vierge ? '………………………………' : enTete()}`, { size: 9 });
      download(pdfBlob(await pdf.finish()), nomF + '.pdf');
    } else {
      const wb = new XlsxBook(), ws = wb.sheet(v === 'mois' ? libMois(MOIS_ANNEE[moisI]) : v === 'trim' ? 'Trimestre ' + trim : 'Année ' + ANNEE); let r = ws.banner(await bannerBytes(), 820);
      ws.set(r, 0, titre, 'title'); r++; ws.set(r, 0, sousT, 'note'); r += 2;
      head.forEach((x, i) => { ws.set(r, i, x, 'th'); ws.width(i, Math.max(7, Math.round(widths[i] / 5))); }); ws.height(r, 30); const h0 = r; r++;
      rows.forEach(l => { l.forEach((x, i) => ws.set(r, i, v === 'annee' && i > 1 && i < l.length - 1 && x !== '' ? +x : x, i === 0 ? 'label' : 'td')); if (vierge && v !== 'annee') ws.height(r, 34); r++; });
      if (v === 'annee') { r++; ws.set(r, 0, 'Légende : ' + TYPES.map(t => `${ABR[t]} = ${t}`).join(' · '), 'note'); }
      ws.freeze(h0 + 1, 1);
      download(await wb.toBlob(), nomF + '.xlsx');
    }
    await addLog(u, { action: 'Planification CP téléchargée', target: nomF });
  }

  await draw();
}
