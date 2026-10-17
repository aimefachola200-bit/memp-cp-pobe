/* République du Bénin — MEMP — Vues : tableau de bord, écoles, fiches de collecte
   Conception : Maître Aimé FACHE */
import { h, uid, nowISO, toast, modal, confirmBox, pickFile, readAsBuffer, readAsText, download, norm, currentSchoolYear, fmtDate, today, clean } from './util.js';
import { db } from './db.js';
import { dataTable, formDialog, badge } from './ui.js';
import { inScope, scoped, addLog, ficheOf, schoolLabel, ROLES } from './data.js';
import { SECTEURS, TYPES_ECOLE, zoneCode } from './refdata.js';
import { FICHE_TYPES, STATUTS_FICHE, prefill, sectionsFor } from './schema.js';
import { listToXlsx, listToPdf } from './export.js';
import { XlsxBook, readXlsx, parseCsv } from './xlsx.js';
import { bannerBytes } from './pdf.js';
import { canEdit, canTransmit, canValidate, completion, transmit, validate, requestCorrection, unlock, exportFiche } from './workflow.js';

export async function render(id, ctx) {
  return ({ accueil, ecoles, fiches })[id](ctx);
}

/* ================= TABLEAU DE BORD ================= */
async function accueil(ctx) {
  const u = ctx.user;
  ctx.title('Tableau de bord', `${ROLES[u.role]}${u.nomCs ? ' — CS ' + u.nomCs : ''}${u.numZone ? ' — Zone ' + u.numZone : ''}`);
  const [schools, fiches, acts, reports] = await Promise.all([scoped('schools', u), scoped('fiches', u), scoped('activities', u), scoped('classReports', u)]);
  const by = (s) => fiches.filter(f => f.statut === s).length;
  const themes = await (await fetch('data/themes.json')).json();
  const next = [...themes.up_maternelle.map(t => ({ ...t, niv: 'Maternelle' })), ...themes.up_primaire.map(t => ({ ...t, niv: 'Primaire' }))].filter(t => t.date >= today()).sort((a, b) => a.date.localeCompare(b.date));
  const nextDate = next[0]?.date, nextOnes = next.filter(t => t.date === nextDate);
  const upcoming = acts.filter(a => a.date >= today() && a.statut !== 'Réalisée').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  const stat = (n, l, c = '', go) => h('div', { class: 'stat ' + c, style: { cursor: go ? 'pointer' : null }, onclick: go ? () => ctx.go(go) : null }, h('b', n), h('span', l));
  const installBtn = h('button', { class: 'btn accent hidden', onclick: async () => { const p = window.__installPrompt; if (!p) return; p.prompt(); await p.userChoice; } }, '⬇ Installer l\'application sur cet appareil');
  const showInstall = () => installBtn.classList.toggle('hidden', !window.__installPrompt);
  document.addEventListener('installable', showInstall); showInstall();
  ctx.el.append(
    h('div', { class: 'cards' }, stat(schools.length, 'écoles dans votre périmètre', '', 'ecoles'), stat(fiches.length, 'fiches de collecte', '', 'fiches'),
      stat(by('Brouillon') + by('À corriger'), 'à compléter / corriger', 'y', 'fiches'), stat(by('Transmise'), 'en attente de validation CCS', 'y', 'fiches'), stat(by('Validée'), 'fiches validées', '', 'fiches'), stat(reports.length, "rapports de fin d'année", '', 'rapports')),
    nextOnes.length ? h('div', { class: 'card' }, h('h3', '🎯 Prochaine unité pédagogique'), h('p', h('b', fmtDate(nextDate))), ...nextOnes.map(t => h('p', `${t.niv} — ${t.theme}`)), h('button', { class: 'btn sm', onclick: () => ctx.go('themes') }, 'Voir le planning')) : null,
    h('div', { class: 'card' }, h('h3', '📅 Activités à venir'), upcoming.length ? h('ul', upcoming.map(a => h('li', `${fmtDate(a.date)} — ${a.type} : ${a.theme || a.lieu || ''}`))) : h('p', { class: 'sub' }, 'Aucune activité programmée.'), h('button', { class: 'btn sm', onclick: () => ctx.go('activites') }, 'Gérer les activités')),
    h('div', { class: 'card' }, h('h3', 'Circuit de collecte'), h('ol', h('li', 'Le CP enregistre les écoles de sa zone puis génère les fiches de l\'année.'), h('li', 'Les fiches sont remplies (calculs automatiques), puis transmises au CCS.'), h('li', 'Le CCS valide ou demande une correction ; le CP corrige et retransmet.'), h('li', 'Les fiches validées alimentent le tableau synoptique et peuvent être signées (signature, cachet, QR).'))),
    installBtn);
  ctx.status('Prêt — données stockées sur cet appareil (hors ligne).');
}

/* ================= ÉCOLES ================= */
const SCHOOL_FIELDS = (user) => {
  const lock = user.role === 'CP';
  return [
    { k: 'code', l: 'Code école', t: 'text', w: 'half' }, { k: 'nom', l: "Nom de l'école", t: 'text', req: true, w: 'half' },
    { k: 'cycle', l: 'Cycle', t: 'select', options: ['Maternelle', 'Primaire'], req: true, w: 'half' }, { k: 'secteur', l: 'Statut / secteur', t: 'select', options: SECTEURS, w: 'half' },
    { k: 'type', l: "Type d'école", t: 'select', options: TYPES_ECOLE, w: 'half' }, { k: 'directeur', l: 'Directeur/trice', t: 'text', w: 'half' },
    { k: 'contact', l: 'Contact', t: 'text', w: 'half' }, { k: 'departement', l: 'Département', t: 'text', list: 'dl-departement', w: 'half', ro: lock },
    { k: 'codeCs', l: 'Code CS', t: 'text', list: 'dl-cscode', w: 'half', ro: lock }, { k: 'nomCs', l: 'Circonscription scolaire', t: 'text', list: 'dl-cs', w: 'half', ro: lock },
    { k: 'numZone', l: 'N° zone pédagogique', t: 'number', w: 'half', ro: lock }, { k: 'codeZone', l: 'Code zone (auto)', t: 'text', w: 'half', ro: lock },
    { k: 'commune', l: 'Commune', t: 'text', list: 'dl-commune', w: 'half' }, { k: 'arrondissement', l: 'Arrondissement', t: 'text', list: 'dl-arrondissement', w: 'half' },
    { k: 'localite', l: 'Village / quartier', t: 'text', list: 'dl-localite', w: 'half' }, { k: 'up', l: 'Unité pédagogique', t: 'text', list: 'dl-up', w: 'half' },
  ];
};
const schoolDefaults = (u) => u.role === 'CP' || u.role === 'CCS' ? { departement: u.departement || '', codeCs: u.codeCs || '', nomCs: u.nomCs || '', numZone: u.numZone || '', codeZone: u.codeZone || '' } : {};
function normSchool(s) { s.codeZone = s.codeZone || zoneCode(s.codeCs, s.numZone); return s; }

const ALIASES = { code: ['code', 'code ecole', 'code de l ecole'], nom: ['nom', 'nom ecole', 'nom de l ecole', 'ecole', 'etablissement'], cycle: ['cycle', 'niveau'], secteur: ['secteur', 'statut'], type: ['type', 'type ecole'], departement: ['departement'], codeCs: ['code cs', 'code circonscription'], nomCs: ['cs', 'nom cs', 'circonscription', 'circonscription scolaire'], numZone: ['zone', 'numero zone', 'n zone', 'zone pedagogique', 'num zone'], codeZone: ['code zone'], commune: ['commune'], arrondissement: ['arrondissement'], localite: ['localite', 'village', 'quartier', 'village ou quartier', 'village quartier'], up: ['up', 'unite pedagogique'], directeur: ['directeur', 'directeur trice'], contact: ['contact', 'telephone', 'tel'] };
function mapRows(rows, aliases) {
  let hi = rows.findIndex(r => r.filter(c => String(c).trim()).length >= 2); if (hi < 0) return [];
  const head = rows[hi].map(c => norm(c)), idx = {};
  for (const [k, al] of Object.entries(aliases)) { const i = head.findIndex(x => al.includes(x)); if (i >= 0) idx[k] = i; }
  return rows.slice(hi + 1).filter(r => r.some(c => String(c).trim())).map(r => Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, String(r[i] ?? '').trim()])));
}
async function readTable(file) {
  if (/\.csv$|\.txt$/i.test(file.name)) return [{ name: 'csv', rows: parseCsv(await readAsText(file)) }];
  return readXlsx(await readAsBuffer(file));
}

async function ecoles(ctx) {
  const u = ctx.user;
  ctx.title('Écoles', u.role === 'CP' ? `Zone ${u.numZone || ''} — ${u.nomCs || ''}` : 'Gestion des écoles');
  const COLS = [{ k: 'code', l: 'Code', w: 80 }, { k: 'nom', l: 'École', w: 200 }, { k: 'cycle', l: 'Cycle' }, { k: 'secteur', l: 'Secteur' }, { k: 'type', l: 'Type' }, { k: 'departement', l: 'Département' }, { k: 'nomCs', l: 'CS' }, { k: 'numZone', l: 'Zone', num: true }, { k: 'commune', l: 'Commune' }, { k: 'arrondissement', l: 'Arrondissement' }, { k: 'localite', l: 'Village / quartier' }, { k: 'up', l: 'UP' }, { k: 'nbf', l: 'Fiches', num: true }];
  const zonesRef = (await db.all('ref')).filter(r => r.type === 'zone');
  const libZone = (c) => { const z = zonesRef.find(x => x.code === c); return z ? (z.nom || `Zone ${z.numero}`) : (c ? 'Zone ' + c.split('-ZP').pop() : 'Sans zone'); };
  let onglet = (await db.setting('ecoles-onglet')) || 'tout', toutes = [];
  const tabs = h('div', { class: 'tabs no-print' });
  const load = async () => {
    const [s, f] = await Promise.all([scoped('schools', u), scoped('fiches', u)]);
    toutes = s.map(x => ({ ...x, nbf: f.filter(y => y.schoolId === x.id).length })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    const zs = [...new Set(toutes.map(x => x.codeZone || ''))].sort();
    if (onglet !== 'tout' && !zs.includes(onglet)) onglet = 'tout';
    tabs.replaceChildren(...(zs.length > 1 || (zs.length === 1 && zs[0]) ? [['tout', 'Toutes les zones'], ...zs.map(z => [z, libZone(z)])] : []).map(([k, l]) =>
      h('button', { class: 'tab' + (k === onglet ? ' on' : ''), onclick: () => { onglet = k; db.setting('ecoles-onglet', k); reload(); } }, `${l} (${k === 'tout' ? toutes.length : toutes.filter(x => (x.codeZone || '') === k).length})`)));
    return onglet === 'tout' ? toutes : toutes.filter(x => (x.codeZone || '') === onglet);
  };
  const t = dataTable({ columns: COLS, rows: await load(), onOpen: () => edit(), empty: 'Aucune école. Cliquez sur « Ajouter » ou « Importer Excel ».' });
  ctx.el.append(tabs, t.el);
  const reload = async () => { t.setRows(await load()); await ctx.refreshDatalists(); ctx.status(`${t.rows.length} école(s)`); };
  const sel = () => { const s = t.selected; if (!s) toast('Sélectionnez une école dans le tableau.', 'warn'); return s; };
  async function add() {
    const modele = onglet !== 'tout' ? toutes.find(x => (x.codeZone || '') === onglet) : null;
    const v = await formDialog({ title: 'Ajouter une école', fields: SCHOOL_FIELDS(u), values: { cycle: 'Primaire', secteur: 'Public', type: 'Classique', ...schoolDefaults(u), ...(modele ? { departement: modele.departement, codeCs: modele.codeCs, nomCs: modele.nomCs, numZone: modele.numZone, codeZone: modele.codeZone, commune: modele.commune, arrondissement: modele.arrondissement } : {}) }, wide: true });
    if (!v) return; normSchool(v); v.id = uid(); v.created = nowISO();
    await db.put('schools', v); await addLog(u, { action: 'Ajout école', target: v.nom }); toast('École ajoutée.'); reload();
  }
  async function edit() {
    const s = sel(); if (!s) return; const { nbf, ...rec } = s;
    const v = await formDialog({ title: "Modifier l'école", fields: SCHOOL_FIELDS(u), values: rec, wide: true }); if (!v) return;
    normSchool(v); await db.put('schools', v);
    const ag = (await db.all('personnel')).filter(x => x.schoolId === v.id);
    if (ag.length) await db.putMany('personnel', ag.map(x => ({ ...x, ecole: v.nom, codeZone: v.codeZone || '', numZone: v.numZone || '', codeCs: v.codeCs || '' })));
    toast('École modifiée.'); reload();
  }
  async function del() {
    const s = sel(); if (!s) return;
    if (!(await confirmBox(`Supprimer « ${s.nom} » ? Ses fiches et rapports seront aussi supprimés (son personnel est conservé, sans école).`, 'Supprimer', true))) return;
    const fs = (await db.all('fiches')).filter(f => f.schoolId === s.id), rs = (await db.all('classReports')).filter(f => f.schoolId === s.id);
    await db.delMany('fiches', fs.map(f => f.id)); await db.delMany('classReports', rs.map(f => f.id)); await db.del('schools', s.id);
    const ag = (await db.all('personnel')).filter(x => x.schoolId === s.id);
    if (ag.length) await db.putMany('personnel', ag.map(x => ({ ...x, schoolId: '', obs: [x.obs, `Ancienne école : ${s.nom} (supprimée)`].filter(Boolean).join(' — ') })));
    await addLog(u, { action: 'Suppression école', target: s.nom }); toast('École supprimée.'); reload();
  }
  async function genFiches() {
    const schools = await scoped('schools', u); if (!schools.length) return toast("Ajoutez d'abord des écoles.", 'warn');
    const y = new Date().getFullYear(), years = [currentSchoolYear(), `${y - 1}-${y}`, `${y}-${y + 1}`, `${y + 1}-${y + 2}`].filter((a, i, r) => r.indexOf(a) === i);
    const sc = schools.filter(s => !t.selected || s.id === t.selected.id);
    const v = await formDialog({ title: 'Générer les fiches de collecte', okLabel: 'Générer', fields: [
      { k: 'annee', l: 'Année scolaire', t: 'select', options: years, req: true }, { k: 'em1', l: 'EM — Fiche de rapport de rentrée', t: 'check' }, { k: 'em2', l: "EM — Fiche de fin d'année", t: 'check' }, { k: 'epr', l: 'EP — Fiche de rapport de rentrée', t: 'check' }, { k: 'ep', l: "EP — Fiche de fin d'année", t: 'check' },
      { k: 'only', l: t.selected ? `Seulement pour « ${t.selected.nom} »` : 'Pour toutes les écoles du périmètre', t: 'check', ro: false }], values: { annee: currentSchoolYear(), em1: true, em2: true, epr: true, ep: true, only: !!t.selected } });
    if (!v) return;
    const targets = v.only && t.selected ? [t.selected] : schools, exist = await db.all('fiches'); let n = 0; const add = [];
    for (const s of targets) {
      const kinds = s.cycle === 'Maternelle' ? [v.em1 && 'EM_RENTREE', v.em2 && 'EM_FIN'] : [v.epr && 'EP_RENTREE', v.ep && 'EP_FIN'];
      for (const k of kinds.filter(Boolean)) {
        if (exist.some(f => f.schoolId === s.id && f.kind === k && f.annee === v.annee)) continue;
        const perso = []; const ps = sectionsFor(k).find(x => x.type === 'personnel'); for (let i = 0; i < ps.minRows; i++) perso.push({ fonction: i === 0 ? ps.firstFonction : ps.otherFonction });
        add.push(ficheOf(k, s, v.annee, prefill(k, s), perso)); n++;
      }
    }
    await db.putMany('fiches', add); await addLog(u, { action: 'Génération de fiches', target: `${n} fiche(s) — ${v.annee}` });
    toast(n ? `${n} fiche(s) générée(s).` : 'Aucune nouvelle fiche à générer.'); reload();
  }
  async function importXlsx() {
    const f = await pickFile('.xlsx,.csv,.txt'); if (!f) return;
    try {
      const sheets = await readTable(f), rows = mapRows(sheets[0].rows, ALIASES).filter(r => r.nom);
      if (!rows.length) return toast("Aucune école reconnue : vérifiez les en-têtes (utilisez le modèle d'import).", 'err');
      const exist = await db.all('schools'); let add = 0, upd = 0; const out = [];
      for (const r of rows) {
        const s = { ...schoolDefaults(u), ...Object.fromEntries(Object.entries(r).filter(([, v]) => v !== '')) };
        if (u.role === 'CP') Object.assign(s, schoolDefaults(u));
        s.cycle = /mat/i.test(s.cycle || s.nom || '') ? 'Maternelle' : 'Primaire'; normSchool(s);
        const old = exist.find(x => (s.code && x.code === s.code) || (!s.code && norm(x.nom) === norm(s.nom) && x.codeZone === s.codeZone));
        if (old) { Object.assign(old, s); out.push(old); upd++; } else { s.id = uid(); s.created = nowISO(); out.push(s); add++; }
      }
      await db.putMany('schools', out); await addLog(u, { action: 'Import écoles', target: `${add} ajout(s), ${upd} mise(s) à jour` });
      toast(`Import terminé : ${add} ajout(s), ${upd} mise(s) à jour.`); reload();
    } catch (e) { toast('Import impossible : ' + e.message, 'err'); }
  }
  async function template() {
    const wb = new XlsxBook(), ws = wb.sheet("Modèle d'import"); let r = ws.banner(await bannerBytes(), 820);
    ws.set(r, 0, "MODÈLE D'IMPORT DES ÉCOLES — ne pas modifier la ligne d'en-têtes", 'title'); r += 2;
    const heads = ['Code école', "Nom de l'école", 'Cycle (Maternelle/Primaire)', 'Secteur', 'Type', 'Département', 'Code CS', 'Circonscription scolaire', 'Zone pédagogique (n°)', 'Commune', 'Arrondissement', 'Village ou quartier', 'Unité pédagogique', 'Directeur', 'Contact'];
    heads.forEach((x, i) => { ws.set(r, i, x, 'th'); ws.width(i, 22); }); ws.height(r, 32);
    ['EP001', 'EPP Akiza', 'Primaire', 'Public', 'Classique', 'ZOU', 'CS118', 'ZOGBODOMEY', '1', 'ZOGBODOMEY', 'AKIZA', 'Akiza', 'UP Akiza', '', ''].forEach((x, i) => ws.set(r + 1, i, x, 'td'));
    download(await wb.toBlob(), 'Modele_import_ecoles.xlsx');
  }
  const exportRows = async () => (await load());
  const exCols = COLS.filter(c => c.k !== 'nbf');
  ctx.actions([
    { label: '➕ Ajouter', kind: 'primary', onClick: add }, { label: '✏️ Modifier', onClick: edit }, { label: '🗑 Supprimer', onClick: del },
    { label: '📝 Générer les fiches', kind: 'accent', onClick: genFiches }, { label: '⬆ Importer Excel/CSV', onClick: importXlsx }, { label: '📄 Modèle d\'import', onClick: template },
    { label: '⬇ Excel', onClick: async () => download(await listToXlsx({ title: 'LISTE DES ÉCOLES', subtitle: `Édité le ${new Date().toLocaleDateString('fr-FR')}`, columns: exCols, rows: t.visible }), 'Ecoles.xlsx') },
    { label: '⬇ PDF', onClick: async () => download(new Blob([await listToPdf({ title: 'LISTE DES ÉCOLES', columns: exCols, rows: t.visible })], { type: 'application/pdf' }), 'Ecoles.pdf') },
  ]);
  ctx.status(`${t.rows.length} école(s)`);
}

/* ================= FICHES DE COLLECTE ================= */
async function fiches(ctx) {
  const u = ctx.user; ctx.title('Fiches de collecte', 'Fiches de rentrée et de fin d\'année (EM, EP)');
  const filt = { annee: '', kind: '', statut: '' };
  const mk = (k, label, opts) => h('select', { class: 'search', style: { maxWidth: '190px' }, 'aria-label': label, onchange: (e) => { filt[k] = e.target.value; refresh(); } }, h('option', { value: '' }, label), opts.map(o => h('option', { value: o.v ?? o }, o.l ?? o)));
  const selA = mk('annee', 'Toutes années', []), selK = mk('kind', 'Tous types', Object.entries(FICHE_TYPES).map(([v, x]) => ({ v, l: x.court }))), selS = mk('statut', 'Tous statuts', STATUTS_FICHE);
  const COLS = [{ k: 'schoolNom', l: 'École', w: 200 }, { k: 'type', l: 'Type de fiche', text: r => FICHE_TYPES[r.kind].label, w: 220 }, { k: 'annee', l: 'Année' }, { k: 'statut', l: 'Statut', render: r => badge(r.statut) }, { k: 'pct', l: 'Rempli', num: true, text: r => completion(r) + ' %' }, { k: 'codeZone', l: 'Zone' }, { k: 'updated', l: 'Mise à jour', text: r => new Date(r.updated).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) }, { k: 'comment', l: 'Commentaire CCS' }];
  const t = dataTable({ columns: COLS, rows: [], onOpen: (r) => open(r), tools: [selA, selK, selS], empty: 'Aucune fiche. Ajoutez des écoles puis « Générer les fiches ».' });
  ctx.el.append(t.el);
  let all = [];
  async function refresh() {
    all = await scoped('fiches', u);
    const years = [...new Set(all.map(f => f.annee))].sort().reverse();
    if (selA.options.length - 1 !== years.length) { const cur = selA.value; selA.replaceChildren(h('option', { value: '' }, 'Toutes années'), ...years.map(y => h('option', { value: y }, y))); selA.value = cur; }
    t.setRows(all.filter(f => (!filt.annee || f.annee === filt.annee) && (!filt.kind || f.kind === filt.kind) && (!filt.statut || f.statut === filt.statut)).sort((a, b) => b.updated.localeCompare(a.updated)));
    ctx.status(`${t.rows.length} fiche(s) affichée(s) sur ${all.length}`);
  }
  const sel = () => { const s = t.selected; if (!s) toast('Sélectionnez une fiche dans le tableau.', 'warn'); return s; };
  const open = (r) => { const s = r || sel(); if (s) ctx.go('fiche/' + s.id); };
  const act = (fn) => async () => { const s = sel(); if (!s) return; try { if (await fn(s)) await refresh(); } catch (e) { console.error(e); toast(e.message, 'err'); } };
  ctx.actions([
    { label: '📂 Ouvrir', kind: 'primary', onClick: () => open() },
    { label: '📤 Transmettre au CCS', show: u.role !== 'CCS', onClick: act(s => transmit(u, s)) },
    { label: '✅ Valider', show: u.role !== 'CP', kind: 'accent', onClick: act(s => validate(u, s)) },
    { label: '↩ Demander correction', show: u.role !== 'CP', onClick: act(s => requestCorrection(u, s)) },
    { label: '🔓 Déverrouiller', show: u.role === 'ADMIN', onClick: act(s => unlock(u, s)) },
    { label: '⬇ PDF', onClick: act(s => exportFiche(s, 'pdf').then(() => false)) },
    { label: '🖋 PDF signé', onClick: act(s => exportFiche(s, 'pdf', { signed: true }).then(() => false)) },
    { label: '⬇ Excel', onClick: act(s => exportFiche(s, 'xlsx').then(() => false)) },
    { label: '🗑 Supprimer', show: u.role !== 'CCS', onClick: act(async s => { if (!canEdit(u, s)) { toast('Suppression non autorisée (fiche transmise ou validée).', 'err'); return false; } if (!(await confirmBox('Supprimer cette fiche ?', 'Supprimer', true))) return false; await db.del('fiches', s.id); await addLog(u, { action: 'Suppression fiche', target: s.schoolNom + ' ' + s.annee }); return true; }) },
  ]);
  await refresh();
}
