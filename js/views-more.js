/* République du Bénin — MEMP — Vues : synoptique, activités, thèmes, planification, règlement, documents, référentiel
   Conception : Maître Aimé FACHE */
import { h, uid, nowISO, toast, modal, confirmBox, pickFile, readAsBuffer, readAsText, download, norm, currentSchoolYear, fmtDate, today, promptBox } from './util.js';
import { db } from './db.js';
import { dataTable, formDialog, badge } from './ui.js';
import { scoped, addLog, session } from './data.js';
import { FICHE_TYPES, gridValue, sectionsFor } from './schema.js';
import { REF_TYPES, zoneCode } from './refdata.js';
import { listToXlsx, listToPdf } from './export.js';
import { XlsxBook, readXlsx, parseCsv } from './xlsx.js';
import { bannerBytes } from './pdf.js';

export async function render(id, ctx) { return ({ synoptique, activites, themes, planification, reglement, documents, referentiel })[id](ctx); }
const pdfBlob = (b) => new Blob([b], { type: 'application/pdf' });

/* ================= SYNOPTIQUE ================= */
const V = (f, g, r, k, c) => { const s = sectionsFor(f.kind).find(x => x.id === g); return gridValue(f.data, s, r, k, c) ?? 0; };
const persoN = (f, sx) => (f.perso || []).filter(p => (p.nom || '').trim() && (!sx || p.sexe === sx)).length;
const METRICS = {
  EM_RENTREE: [['nb', 'Fiches', f => 1], ['dF', 'Début F', f => V(f, 'eff', 'debut', 'tot', 'F')], ['dG', 'Début G', f => V(f, 'eff', 'debut', 'tot', 'G')], ['dT', 'Début T', f => V(f, 'eff', 'debut', 'tot', 'T')], ['bes', 'Besoins spécifiques', f => V(f, 'eff', 'bes', 'tot', 'T')], ['sec', 'Sections ouvertes', f => +f.data.sections_ouv || 0], ['sal', 'Salles utilisées', f => +f.data.salles_util || 0], ['cant', 'Cantines', f => f.data.cantine === 'Oui' ? 1 : 0], ['lav', 'Lavage mains', f => f.data.lavage === 'Oui' ? 1 : 0], ['pT', 'Personnel', f => persoN(f)], ['pF', 'dont F', f => persoN(f, 'F')]],
  EM_FIN: [['nb', 'Fiches', f => 1], ['dT', 'Début T', f => V(f, 'eff', 'debut', 'tot', 'T')], ['fF', 'Fin F', f => V(f, 'eff', 'fin', 'tot', 'F')], ['fG', 'Fin G', f => V(f, 'eff', 'fin', 'tot', 'G')], ['fT', 'Fin T', f => V(f, 'eff', 'fin', 'tot', 'T')], ['ab', 'Abandons', f => V(f, 'eff', 'aband', 'tot', 'T')], ['bes', 'Besoins spécifiques', f => V(f, 'eff', 'bes', 'tot', 'T')], ['sec', 'Sections ouvertes', f => +f.data.sections_ouv || 0], ['sal', 'Salles utilisées', f => +f.data.salles_util || 0], ['pT', 'Personnel', f => persoN(f)], ['pF', 'dont F', f => persoN(f, 'F')]],
  EP_RENTREE: [['nb', 'Fiches', f => 1], ['dG', 'Élèves G', f => V(f, 'eff', 'debut', 'ens', 'G')], ['dF', 'Élèves F', f => V(f, 'eff', 'debut', 'ens', 'F')], ['dT', 'Élèves T', f => V(f, 'eff', 'debut', 'ens', 'T')], ['re', 'Redoublants', f => V(f, 'eff', 'redoub', 'ens', 'T')], ['tr', 'Transférés', f => V(f, 'eff', 'transf', 'ens', 'T')], ['sa', 'Sans acte de naissance', f => V(f, 'eff', 'sans_acte', 'ens', 'T')], ['ha', 'Handicapés', f => V(f, 'eff', 'handi', 'ens', 'T')], ['cl', 'Classes ouvertes', f => +f.data.classes_ouv || 0], ['sal', 'Salles utilisées', f => +f.data.salles_util || 0], ['cant', 'Cantines', f => f.data.cantine === 'Oui' ? 1 : 0], ['lav', 'Lavage mains', f => f.data.lavage === 'Oui' ? 1 : 0], ['pT', 'Enseignants', f => persoN(f)], ['pF', 'dont F', f => persoN(f, 'F')]],
  EP_FIN: [['nb', 'Fiches', f => 1], ['dG', 'Début G', f => V(f, 'eff', 'debut', 'ens', 'G')], ['dF', 'Début F', f => V(f, 'eff', 'debut', 'ens', 'F')], ['dT', 'Début T', f => V(f, 'eff', 'debut', 'ens', 'T')], ['fG', 'Fin G', f => V(f, 'eff', 'fin', 'ens', 'G')], ['fF', 'Fin F', f => V(f, 'eff', 'fin', 'ens', 'F')], ['fT', 'Fin T', f => V(f, 'eff', 'fin', 'ens', 'T')], ['pr', 'Promus', f => V(f, 'eff', 'promus', 'ens', 'T')], ['re', 'Redoublants', f => V(f, 'eff', 'redoub', 'ens', 'T')], ['ab', 'Abandons', f => V(f, 'eff', 'aband', 'ens', 'T')], ['cl', 'Classes ouvertes', f => +f.data.classes_ouv || 0], ['sal', 'Salles utilisées', f => +f.data.salles_util || 0], ['pT', 'Enseignants', f => persoN(f)], ['pF', 'dont F', f => persoN(f, 'F')]],
};
const LEVELS = { ecole: ['École', f => f.schoolNom], zone: ['Zone pédagogique', f => f.codeZone || '—'], cs: ['Circonscription scolaire', f => f.codeCs || '—'], dep: ['Département', f => f.departement || '—'] };

async function synoptique(ctx) {
  const u = ctx.user; ctx.title('Synthèse des fiches (consolidation)', 'Consolidation automatique des fiches par école, zone, circonscription ou département — le tableau synoptique du CP est dans son propre menu');
  const all = await scoped('fiches', u), years = [...new Set(all.map(f => f.annee))].sort().reverse();
  const st = { annee: years[0] || currentSchoolYear(), kind: 'EP_FIN', level: 'ecole', only: 'all' };
  const sel = (k, opts) => h('select', { class: 'search', style: { maxWidth: '220px' }, onchange: (e) => { st[k] = e.target.value; draw(); } }, opts.map(([v, l]) => h('option', { value: v, selected: st[k] === v }, l)));
  const tools = [sel('annee', (years.length ? years : [st.annee]).map(y => [y, y])), sel('kind', Object.entries(FICHE_TYPES).map(([k, v]) => [k, v.court])), sel('level', Object.entries(LEVELS).map(([k, v]) => [k, 'Par ' + v[0].toLowerCase()])), sel('only', [['all', 'Toutes les fiches'], ['ok', 'Fiches validées seulement']])];
  const holder = h('div'); ctx.el.append(h('div', { class: 'tbl-tools no-print' }, ...tools), holder);
  let cols = [], rows = [], totals = {};
  function draw() {
    const M = METRICS[st.kind], fs = all.filter(f => f.annee === st.annee && f.kind === st.kind && (st.only === 'all' || f.statut === 'Validée'));
    cols = [{ k: 'ent', l: LEVELS[st.level][0], w: 200 }, ...M.map(([k, l]) => ({ k, l, num: true }))];
    const g = new Map();
    fs.forEach(f => { const key = LEVELS[st.level][1](f); const o = g.get(key) || { ent: key }; M.forEach(([k, , fn]) => { o[k] = (o[k] || 0) + (fn(f) || 0); }); g.set(key, o); });
    rows = [...g.values()].sort((a, b) => a.ent.localeCompare(b.ent, 'fr'));
    totals = { ent: 'TOTAL' }; M.forEach(([k]) => { totals[k] = rows.reduce((a, r) => a + (r[k] || 0), 0); });
    const t = dataTable({ columns: cols, rows, getId: r => r.ent, totals, pageSize: 200, empty: 'Aucune fiche pour ces critères.' }); holder.replaceChildren(t.el);
    ctx.status(`${fs.length} fiche(s) consolidée(s) — ${FICHE_TYPES[st.kind].label} — ${st.annee}`);
  }
  draw();
  const title = () => `TABLEAU SYNOPTIQUE — ${FICHE_TYPES[st.kind].label} — ${st.annee}`;
  ctx.actions([
    { label: '⬇ Excel', kind: 'primary', onClick: async () => download(await listToXlsx({ title: title(), subtitle: `Niveau : ${LEVELS[st.level][0]}`, columns: cols, rows, sheet: 'Synoptique' }), 'Tableau_synoptique.xlsx') },
    { label: '⬇ PDF', onClick: async () => download(pdfBlob(await listToPdf({ title: title(), subtitle: `Niveau : ${LEVELS[st.level][0]}`, columns: cols, rows, totals })), 'Tableau_synoptique.pdf') },
    { label: '🖨 Imprimer', onClick: () => window.print() }]);
}

/* ================= ACTIVITÉS ================= */
const ACT_TYPES = ['Unité pédagogique', 'Conférence pédagogique', 'Formation groupée', 'Visite de classe', 'Inspection', 'Réunion', 'Autre'];
export async function addActivity(u, a) { await db.put('activities', { id: uid(), statut: 'Prévue', codeZone: u.codeZone || '', codeCs: u.codeCs || '', created: nowISO(), ...a }); }
async function activites(ctx) {
  const u = ctx.user; ctx.title('Activités pédagogiques', 'Planification et suivi des activités du CP');
  const F = [{ k: 'date', l: 'Date', t: 'date', req: true, w: 'half' }, { k: 'type', l: 'Type', t: 'select', options: ACT_TYPES, req: true, w: 'half' }, { k: 'theme', l: 'Thème / objet', t: 'text', w: 'c12' }, { k: 'lieu', l: 'École / lieu', t: 'text', w: 'half' }, { k: 'participants', l: 'Participants (nombre)', t: 'number', w: 'half' }, { k: 'statut', l: 'Statut', t: 'select', options: ['Prévue', 'Réalisée', 'Reportée'], w: 'half' }, { k: 'obs', l: 'Observations', t: 'textarea' }];
  const COLS = [{ k: 'date', l: 'Date', text: r => fmtDate(r.date), w: 170 }, { k: 'type', l: 'Type' }, { k: 'theme', l: 'Thème / objet', w: 260 }, { k: 'lieu', l: 'École / lieu' }, { k: 'participants', l: 'Participants', num: true }, { k: 'statut', l: 'Statut', render: r => badge(r.statut) }, { k: 'obs', l: 'Observations' }];
  const load = async () => (await scoped('activities', u)).sort((a, b) => b.date.localeCompare(a.date));
  const t = dataTable({ columns: COLS, rows: await load(), onOpen: () => edit() }); ctx.el.append(t.el);
  const reload = async () => t.setRows(await load()), sel = () => { const s = t.selected; if (!s) toast('Sélectionnez une activité.', 'warn'); return s; };
  async function add() { const v = await formDialog({ title: 'Nouvelle activité', fields: F, values: { date: today(), statut: 'Prévue', type: 'Visite de classe' } }); if (!v) return; await addActivity(u, v); reload(); }
  async function edit() { const s = sel(); if (!s) return; const v = await formDialog({ title: "Modifier l'activité", fields: F, values: s }); if (!v) return; await db.put('activities', v); reload(); }
  ctx.actions([{ label: '➕ Ajouter', kind: 'primary', onClick: add }, { label: '✏️ Modifier', onClick: edit },
    { label: '✔ Marquer réalisée', onClick: async () => { const s = sel(); if (!s) return; s.statut = 'Réalisée'; await db.put('activities', s); reload(); } },
    { label: '🗑 Supprimer', onClick: async () => { const s = sel(); if (s && await confirmBox('Supprimer cette activité ?', 'Supprimer', true)) { await db.del('activities', s.id); reload(); } } },
    { label: '⬇ Excel', onClick: async () => download(await listToXlsx({ title: 'ACTIVITÉS PÉDAGOGIQUES', columns: COLS.map(c => ({ ...c, w: c.w })), rows: t.visible.map(r => ({ ...r, date: fmtDate(r.date) })) }), 'Activites.xlsx') },
    { label: '⬇ PDF', onClick: async () => download(pdfBlob(await listToPdf({ title: 'ACTIVITÉS PÉDAGOGIQUES', columns: COLS, rows: t.visible.map(r => ({ ...r, date: fmtDate(r.date) })) })), 'Activites.pdf') }]);
}

/* ================= THÈMES 2026-2027 ================= */
async function themes(ctx) {
  const u = ctx.user; ctx.title('Thèmes 2026-2027', 'Planning d\'exécution des thèmes d\'unité pédagogique, conférences et formations groupées');
  const D = await (await fetch('data/themes.json')).json(), done = new Map((await db.all('themesDone')).map(x => [x.id, x]));
  const LISTS = { up_maternelle: ['UP — Maternelle', 'UP maternelle'], up_primaire: ['UP — Primaire', 'UP primaire'], conferences: ['Conférences pédagogiques', 'Conférence pédagogique'], formations: ['Formations groupées', 'Formation groupée'] };
  let cur = 'up_primaire'; const tabs = h('div', { class: 'tabs no-print' }), holder = h('div');
  ctx.el.append(tabs, h('p', { class: 'notes' }, D.nb), holder);
  const key = (n) => `${cur}-${n}`;
  function draw() {
    tabs.replaceChildren(...Object.entries(LISTS).map(([k, [l]]) => h('button', { class: 'tab' + (k === cur ? ' on' : ''), onclick: () => { cur = k; draw(); } }, l)));
    const rows = D[cur].map(t => ({ ...t, id: key(t.n), fait: done.has(key(t.n)) ? 'Réalisé' : '', dateTxt: t.date === 'PM' ? 'À programmer' : fmtDate(t.date), late: t.date !== 'PM' && t.date < today() && !done.has(key(t.n)) }));
    const COLS = [{ k: 'n', l: 'N°', num: true }, { k: 'theme', l: 'Thème', w: 340 }, { k: 'dateTxt', l: 'Date', w: 170, text: r => r.dateTxt }, { k: 'obs', l: 'Obs.' }, { k: 'fait', l: 'Suivi', render: r => r.fait ? badge('Réalisée') : (r.late ? h('span', { class: 'badge corriger' }, 'En retard') : '') }];
    const t = dataTable({ columns: COLS, rows, pageSize: 100, onOpen: (r) => detail(r) }); holder.replaceChildren(t.el);
    const sel = () => { const s = t.selected; if (!s) toast('Sélectionnez un thème.', 'warn'); return s; };
    ctx.actions([
      { label: '🔎 Axes de réflexion', onClick: () => { const s = sel(); s && detail(s); } },
      { label: '📅 Programmer dans mes activités', kind: 'primary', onClick: async () => { const s = sel(); if (!s) return; let d = s.date; if (d === 'PM') { d = await promptBox('Date de l\'activité', 'Date', today(), 'date'); if (!d) return; } await addActivity(u, { date: d, type: LISTS[cur][1].startsWith('UP') ? 'Unité pédagogique' : LISTS[cur][1], theme: s.theme }); toast('Activité ajoutée à votre planning.'); } },
      { label: '✔ Marquer réalisé / annuler', onClick: async () => { const s = sel(); if (!s) return; if (done.has(s.id)) { await db.del('themesDone', s.id); done.delete(s.id); } else { const r = { id: s.id, date: nowISO(), by: u.username }; await db.put('themesDone', r); done.set(s.id, r); } draw(); } },
      { label: '⬇ Excel', onClick: async () => download(await listToXlsx({ title: `PLANNING — ${LISTS[cur][0].toUpperCase()} — ${D.annee}`, subtitle: D.source, columns: [{ k: 'n', l: 'N°', w: 30 }, { k: 'theme', l: 'Thèmes', w: 300 }, { k: 'axes', l: 'Axes de réflexion / contenus', w: 300, xw: 70 }, { k: 'dateTxt', l: 'Date', w: 110 }, { k: 'obs', l: 'Observations', w: 90 }], rows: rows.map(r => ({ ...r, axes: r.axes.map(a => '- ' + a).join('\n') })) }), 'Planning_themes.xlsx') },
      { label: '⬇ PDF', onClick: async () => download(pdfBlob(await listToPdf({ title: `PLANNING — ${LISTS[cur][0].toUpperCase()} — ${D.annee}`, subtitle: D.source, columns: [{ k: 'n', l: 'N°', w: 24 }, { k: 'theme', l: 'Thèmes', w: 250 }, { k: 'axes', l: 'Axes de réflexion / contenus', w: 300 }, { k: 'dateTxt', l: 'Date', w: 100 }, { k: 'obs', l: 'Observations', w: 90 }], rows: rows.map(r => ({ ...r, axes: r.axes.map(a => '- ' + a).join('\n') })) })), 'Planning_themes.pdf') },
    ]);
  }
  function detail(r) { modal({ title: `${LISTS[cur][0]} — thème ${r.n}`, body: h('div', h('h3', r.theme), h('p', h('b', 'Date : '), r.dateTxt, r.obs ? ' — ' + r.obs : ''), r.axes.length ? h('div', h('b', 'Axes de réflexion indicatifs'), h('ul', r.axes.map(a => h('li', a)))) : h('p', { class: 'sub' }, 'Pas de contenu indicatif pour cette séance.')), actions: [{ label: 'Fermer', kind: 'primary' }] }); }
  draw(); ctx.status(D.source);
}

/* ================= PLANIFICATION CI → CM2 ================= */
async function planification(ctx) {
  ctx.title('Planification CI → CM2', "Projet de planification des objets d'apprentissage à l'école primaire (réalisation : ABOGOUNRIN O. Frédéric)");
  const pages = await (await fetch('data/planification.json')).json();
  let cls = '', q = ''; const res = h('div');
  const pill = (c, l) => h('button', { class: 'tab' + (cls === c ? ' on' : ''), onclick: () => { cls = c; draw(); } }, l);
  const tabs = h('div', { class: 'tabs' }), inp = h('input', { class: 'search', type: 'search', placeholder: 'Rechercher un mot, une discipline, une semaine… (ex. : dictée, semaine 12, fractions)', oninput: (e) => { q = norm(e.target.value); draw(); } });
  ctx.el.append(h('div', { class: 'tbl-tools' }, inp), tabs, res);
  function open(p) {
    const txt = p.x;
    modal({ title: `${p.c} — page ${p.p}`, wide: true, body: h('div', h('p', { class: 'notes' }, 'Texte extrait du document ; la mise en tableau d\'origine est aplatie.'), h('div', { class: 'pre' }, txt)),
      actions: [{ label: '📋 Copier', onClick: () => { navigator.clipboard && navigator.clipboard.writeText(txt).then(() => toast('Texte copié.')); return false; }, keepOpen: true }, { label: 'Fermer', kind: 'primary' }] });
  }
  function draw() {
    tabs.replaceChildren(pill('', 'Toutes'), ...['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'].map(c => pill(c, c)));
    let a = pages.filter(p => !cls || p.c === cls); if (q) { const ws = q.split(' ').filter(Boolean); a = a.filter(p => { const n = norm(p.x); return ws.every(w => n.includes(w)); }); }
    const shown = a.slice(0, 60);
    res.replaceChildren(h('p', { class: 'sub' }, `${a.length} page(s) trouvée(s)${a.length > 60 ? ' — affichage des 60 premières' : ''}`), ...shown.map(p => {
      const n = norm(p.x), w = q.split(' ').filter(Boolean)[0], i = w ? n.indexOf(w) : 0, snip = p.x.replace(/\n/g, ' ').slice(Math.max(0, i - 60), Math.max(0, i - 60) + 220);
      return h('div', { class: 'result', onclick: () => open(p) }, h('b', `${p.c} · page ${p.p}`), ' — ', p.t, h('br'), h('small', snip + '…'));
    }));
  }
  draw(); ctx.status('Document de référence intégré — consultable hors ligne.');
}

/* ================= RÈGLEMENT INTÉRIEUR ================= */
async function reglement(ctx) {
  ctx.title('Règlement intérieur', 'Règlement intérieur des écoles primaires (révisé) — document officiel numérisé');
  const N = 8; let i = 1; const img = h('img', { class: 'reg-img', alt: '' }), lab = h('b');
  const go = (k) => { i = Math.min(N, Math.max(1, k)); img.src = `data/reglement/page-${i}.jpg`; img.alt = `Règlement intérieur, page ${i}`; lab.textContent = `Page ${i} / ${N}`; };
  ctx.el.append(h('div', { class: 'tbl-tools no-print' }, h('button', { class: 'btn', onclick: () => go(i - 1) }, '◀'), lab, h('button', { class: 'btn', onclick: () => go(i + 1) }, '▶'), h('a', { class: 'btn', href: `data/reglement/page-1.jpg`, target: '_blank', rel: 'noopener', onclick: (e) => { e.currentTarget.href = img.src; } }, '🔍 Ouvrir en grand')), h('div', { style: { textAlign: 'center' } }, img));
  go(1); ctx.actions([{ label: '🖨 Imprimer la page', onClick: () => window.print() }]);
}

/* ================= DOCUMENTS OFFICIELS ================= */
async function documents(ctx) {
  ctx.title('Documents officiels', 'Fiches, canevas, guides et textes du Ministère — consultables hors ligne');
  const all = await (await fetch('data/documents.json')).json(), D = all.documents;
  const carte = (d) => h('div', { class: 'card' }, h('h3', (d.format === 'Excel' ? '📊 ' : '📄 ') + d.titre), h('p', d.description), h('p', { class: 'sub' }, `${d.cycle}${d.pages ? ` · ${d.pages} pages` : ''} · ${d.format || 'PDF'}`),
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, d.format === 'Excel' ? null : h('a', { class: 'btn primary', href: d.fichier, target: '_blank', rel: 'noopener' }, '👁 Ouvrir'),
      h('a', { class: 'btn' + (d.format === 'Excel' ? ' primary' : ''), href: d.fichier, download: d.fichier.split('/').pop() }, '⬇ Télécharger')));
  ctx.el.append(
    h('h2', { class: 'sec-h' }, 'Textes officiels intégrés à l\'application'),
    h('div', { class: 'doc-grille' }, (all.integres || []).map(d => h('button', { class: 'card doc-lien', onclick: () => ctx.go(d.route) }, h('h3', '📘 ' + d.titre), h('p', d.description)))),
    ...[...new Set(D.map(d => d.groupe || 'Fiches et canevas'))].flatMap(g => [h('h2', { class: 'sec-h' }, g), ...D.filter(d => (d.groupe || 'Fiches et canevas') === g).map(carte)]),
    h('p', { class: 'notes' }, 'Pour ajouter un document : déposez le fichier dans le dossier « docs » du dépôt et ajoutez une entrée dans data/documents.json.'));
  ctx.status(`${D.length} fichier(s) · ${(all.integres || []).length} texte(s) intégré(s)`);
}

/* ================= RÉFÉRENTIEL ================= */
async function referentiel(ctx) {
  const u = ctx.user, canEditRef = u.role !== 'CP'; ctx.title('Référentiel national', 'Départements, circonscriptions scolaires, zones pédagogiques, communes, arrondissements, villages et UP');
  let cur = 'departement'; const tabs = h('div', { class: 'tabs' }), holder = h('div'); ctx.el.append(tabs, holder);
  const fieldsOf = (type) => REF_TYPES[type].fields.map(([k, l, t, req, list]) => ({ k, l, t, req, list, w: 'half' }));
  let tbl;
  async function draw() {
    tabs.replaceChildren(...Object.entries(REF_TYPES).map(([k, v]) => h('button', { class: 'tab' + (k === cur ? ' on' : ''), onclick: () => { cur = k; draw(); } }, v.label)));
    const rows = (await db.all('ref')).filter(r => r.type === cur).sort((a, b) => String(a.code || a.nom).localeCompare(String(b.code || b.nom), 'fr', { numeric: true }));
    const cols = REF_TYPES[cur].fields.map(([k, l, t]) => ({ k, l, num: t === 'number' }));
    tbl = dataTable({ columns: cols, rows, onOpen: () => edit(), pageSize: 100, empty: canEditRef ? 'Aucune entrée. Ajoutez-en ou importez un fichier Excel/CSV.' : 'Aucune entrée.' }); holder.replaceChildren(tbl.el);
    ctx.status(`${rows.length} ${REF_TYPES[cur].label.toLowerCase()}`);
  }
  const sel = () => { const s = tbl.selected; if (!s) toast('Sélectionnez une ligne.', 'warn'); return s; };
  async function add() { const v = await formDialog({ title: 'Ajouter — ' + REF_TYPES[cur].label, fields: fieldsOf(cur) }); if (!v) return; await db.put('ref', { id: uid(), type: cur, ...v }); await ctx.refreshDatalists(); draw(); }
  async function edit() { const s = sel(); if (!s) return; const v = await formDialog({ title: 'Modifier', fields: fieldsOf(cur), values: s }); if (!v) return; await db.put('ref', v); await ctx.refreshDatalists(); draw(); }
  async function del() { const s = sel(); if (!s || !(await confirmBox('Supprimer cette entrée ?', 'Supprimer', true))) return; await db.del('ref', s.id); await ctx.refreshDatalists(); draw(); }
  async function imp() {
    const f = await pickFile('.xlsx,.csv,.txt'); if (!f) return;
    try {
      const sheets = /\.(csv|txt)$/i.test(f.name) ? [{ rows: parseCsv(await readAsText(f)) }] : await readXlsx(await readAsBuffer(f)), rows = sheets[0].rows;
      const hi = rows.findIndex(r => r.filter(c => String(c).trim()).length >= 1), head = rows[hi].map(norm), spec = REF_TYPES[cur].fields, idx = spec.map(([k, l]) => head.findIndex(x => x === norm(k) || x === norm(l) || (norm(l).startsWith(x) && x.length > 2)));
      const exist = (await db.all('ref')).filter(r => r.type === cur), out = []; let n = 0;
      for (const r of rows.slice(hi + 1)) {
        if (!r.some(c => String(c).trim())) continue; const o = { type: cur }; spec.forEach(([k], j) => { if (idx[j] >= 0) o[k] = String(r[idx[j]] ?? '').trim(); });
        const kk = o.code || o.nom; if (!kk) continue; const old = exist.find(x => (x.code || x.nom) === kk && (cur !== 'localite' && cur !== 'up' || x.nom === o.nom)); out.push(old ? Object.assign(old, o) : { id: uid(), ...o }); n++;
      }
      await db.putMany('ref', out); await ctx.refreshDatalists(); toast(`${n} ligne(s) importée(s).`); draw();
    } catch (e) { toast('Import impossible : ' + e.message, 'err'); }
  }
  async function genZones() {
    const cs = (await db.all('ref')).filter(r => r.type === 'cs'); if (!cs.length) return toast("Ajoutez d'abord des circonscriptions scolaires.", 'warn');
    const v = await formDialog({ title: 'Générer les zones pédagogiques', okLabel: 'Générer', fields: [{ k: 'cs', l: 'Circonscription scolaire', t: 'select', options: cs.map(c => ({ v: c.code, l: `${c.code} — ${c.nom}` })), req: true }, { k: 'n', l: 'Nombre de zones', t: 'number', req: true }] }); if (!v) return;
    const exist = (await db.all('ref')).filter(r => r.type === 'zone'), out = []; for (let i = 1; i <= +v.n; i++) { const code = zoneCode(v.cs, i); if (!exist.some(z => z.code === code)) out.push({ id: uid(), type: 'zone', code, numero: String(i), cs: v.cs, nom: `Zone pédagogique ${i}` }); }
    await db.putMany('ref', out); await ctx.refreshDatalists(); toast(`${out.length} zone(s) créée(s).`); cur = 'zone'; draw();
  }
  async function tpl() {
    const wb = new XlsxBook(), ws = wb.sheet('Modèle'); let r = ws.banner(await bannerBytes(), 820); ws.set(r, 0, 'MODÈLE D\'IMPORT — ' + REF_TYPES[cur].label.toUpperCase(), 'title'); r += 2;
    REF_TYPES[cur].fields.forEach(([k, l], i) => { ws.set(r, i, l, 'th'); ws.width(i, 28); }); download(await wb.toBlob(), `Modele_${cur}.xlsx`);
  }
  ctx.actions([
    { label: '➕ Ajouter', kind: 'primary', show: canEditRef, onClick: add }, { label: '✏️ Modifier', show: canEditRef, onClick: edit }, { label: '🗑 Supprimer', show: canEditRef, onClick: del },
    { label: '⬆ Importer Excel/CSV', show: canEditRef, onClick: imp }, { label: '📄 Modèle', show: canEditRef, onClick: tpl }, { label: '⚙ Générer les zones d\'une CS', kind: 'accent', show: canEditRef, onClick: genZones },
    { label: '⬇ Excel', onClick: async () => download(await listToXlsx({ title: 'RÉFÉRENTIEL — ' + REF_TYPES[cur].label.toUpperCase(), columns: REF_TYPES[cur].fields.map(([k, l]) => ({ k, l, w: 120 })), rows: tbl.visible }), `Referentiel_${cur}.xlsx`) }]);
  await draw();
}
