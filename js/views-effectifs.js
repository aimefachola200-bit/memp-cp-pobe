/* République du Bénin — MEMP — Vues : effectifs des apprenants (fiche de recensement annuel)
   Niveaux : école (saisie), zone pédagogique et circonscription scolaire (consolidation automatique).
   Conception : Maître Aimé FACHE */
import { h, nowISO, toast, download, clean, confirmBox, promptBox, pickFile, readAsBuffer, currentSchoolYear, modal } from './util.js';
import { db } from './db.js';
import { dataTable, badge } from './ui.js';
import { scoped, inScope, addLog } from './data.js';
import { canEdit, canTransmit, canValidate } from './workflow.js';
import { readXlsx } from './xlsx.js';
import * as E from './effectifs-schema.js';
import * as X from './effectifs-export.js';
import { svgCourbe } from './effectifs-charts.js';

const pdfBlob = (b) => new Blob([b], { type: 'application/pdf' });
let LAST = null;   // sélection conservée entre la liste et la fiche

export async function render(id, ctx) { return id === 'effectif' ? editor(ctx) : overview(ctx); }

/* ---------------- Utilitaires ---------------- */
const nz = (x) => (x === null || x === undefined ? 0 : x);
const addN = (a, b) => (a === null && b === null ? null : nz(a) + nz(b));
const KEYS = ['G', 'F', 'T', 'eh', 'redoub', 'etr', 'orph', 'sansActe', 'grossesse', 'nouvAutre'];
const addM = (a, b) => { const o = {}; for (const k of KEYS) o[k] = addN(a?.[k] ?? null, b?.[k] ?? null); return o; };
const pct = (S, v) => E.completion(S, v);
const zoneLabel = (code, s) => (code ? `Zone ${s?.numZone || code}${s?.nomCs ? ' — CS ' + s.nomCs : ''}` : 'Sans zone');
const timeNow = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

async function createRecord(u, school, annee, fiches) {
  const rec = E.newRecord(school, annee, u), S = E.schemaOf(school.cycle);
  const pre = E.prefillFromFiches(S, fiches.filter(f => f.schoolId === school.id), annee);
  E.applyPrefill(rec, pre);
  if (pre.source) rec.history.push({ date: nowISO(), action: `Préremplissage depuis la ${pre.source}`, by: u.username });
  await db.put('effectifs', rec);
  await addLog(u, { action: 'Création fiche effectifs', target: `${school.nom} (${annee})`, refId: rec.id });
  return rec;
}
async function setStatut(u, rec, to, action, comment = '') {
  const from = rec.statut; rec.statut = to; rec.comment = comment; rec.updated = nowISO();
  (rec.history = rec.history || []).push({ date: nowISO(), action, by: u.username, role: u.role, from, to, comment });
  await db.put('effectifs', rec);
  await addLog(u, { action, target: `Effectifs — ${rec.schoolNom} (${rec.annee})`, from, to, comment, refId: rec.id });
}

/* ---------------- Liste + consolidation ---------------- */
const SCHOOL_COLS = [
  { k: 'nom', l: 'École', w: 220 }, { k: 'cycle', l: 'Cycle' }, { k: 'statutF', l: 'Fiche', render: (r) => (r.rec ? badge(r.rec.statut) : '—'), text: (r) => r.rec?.statut || '—' },
  { k: 'G', l: 'Garçons / M', num: true }, { k: 'F', l: 'Filles / F', num: true }, { k: 'T', l: 'Total', num: true }, { k: 'eh', l: 'Enfants handicapés', num: true },
  { k: 'redoub', l: 'Redoublants', num: true }, { k: 'etr', l: 'Étrangers', num: true }, { k: 'orph', l: 'Orphelins / vulnérables', num: true }, { k: 'sansActe', l: 'Sans acte de naissance', num: true },
  { k: 'comp', l: 'Rempli (%)', num: true },
];
const ZONE_COLS = [
  { k: 'nom', l: 'Zone pédagogique', w: 240 }, { k: 'nbEc', l: 'Écoles', num: true }, { k: 'nbFi', l: 'Fiches', num: true },
  { k: 'G', l: 'Garçons / M', num: true }, { k: 'F', l: 'Filles / F', num: true }, { k: 'T', l: 'Total', num: true }, { k: 'eh', l: 'Enfants handicapés', num: true },
  { k: 'redoub', l: 'Redoublants', num: true }, { k: 'etr', l: 'Étrangers', num: true }, { k: 'orph', l: 'Orphelins / vulnérables', num: true }, { k: 'sansActe', l: 'Sans acte de naissance', num: true },
];
const exportCols = (cols) => cols.map(c => ({ k: c.k === 'statutF' ? 'statutTxt' : c.k, l: c.l, num: c.num, w: c.num ? 1 : (c.k === 'nom' ? 3.2 : 1.4) }));

function schoolRow(s, rec) {
  const S = E.schemaOf(s.cycle), v = rec ? E.computeValues(S, rec.data) : {}, m = E.metrics(S, v);
  return { id: s.id, school: s, rec, nom: s.nom, cycle: s.cycle, statutTxt: rec?.statut || '—', ...m, comp: rec ? pct(S, v) : 0 };
}
function totalsOf(rows, keys) { const t = {}; for (const k of keys) t[k] = rows.reduce((a, r) => a + (typeof r[k] === 'number' ? r[k] : 0), 0); return t; }

async function overview(ctx) {
  const u = ctx.user;
  ctx.title('Effectifs des apprenants', 'Fiche de recensement annuel — par école, zone pédagogique et circonscription scolaire');
  const [schools, records, fiches] = await Promise.all([scoped('schools', u), scoped('effectifs', u), scoped('fiches', u)]);
  const years = [...new Set([...records.map(r => r.annee), currentSchoolYear()])].sort().reverse();
  const zones = new Map(), csList = new Map();
  for (const s of schools) {
    const z = s.codeZone || ''; if (!zones.has(z)) zones.set(z, { code: z, label: zoneLabel(z, s), schools: [] }); zones.get(z).schools.push(s);
    const c = s.codeCs || ''; if (!csList.has(c)) csList.set(c, { code: c, label: s.nomCs ? 'CS ' + s.nomCs : (c || 'Sans CS') });
  }
  const zoneArr = [...zones.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr', { numeric: true })), csArr = [...csList.values()];
  const st = LAST && years.includes(LAST.annee) ? LAST : { annee: years[0], level: 'ecole', zone: '', cs: '', statut: 'all' };
  if (!zones.has(st.zone)) st.zone = zoneArr[0]?.code ?? '';
  if (!csList.has(st.cs)) st.cs = csArr[0]?.code ?? '';
  if (u.role === 'CP' && st.level === 'cs') st.level = 'zone';
  const canWrite = u.role === 'CP' || u.role === 'ADMIN';
  const recMap = () => new Map(records.filter(r => r.annee === st.annee).map(r => [r.schoolId, r]));

  const sel = (k, opts, w = '230px') => h('select', { class: 'search', style: { maxWidth: w }, onchange: (e) => { st[k] = e.target.value; draw(); } }, opts.map(([v, l]) => h('option', { value: v, selected: st[k] === v }, l)));
  const levels = [['ecole', '\uE022 École'], ['zone', '\uE02C Zone'], ...(u.role !== 'CP' ? [['cs', '\uE023 Circonscription']] : [])];
  const seg = h('div', { class: 'seg' }, levels.map(([k, l]) => h('button', { class: 'btn sm' + (st.level === k ? ' primary' : ''), onclick: () => { st.level = k; draw(); } }, l)));
  const toolbar = h('div', { class: 'tbl-tools no-print' });
  const holder = h('div');
  ctx.el.append(toolbar, holder);

  let table = null, exportData = null;

  const stat = (n, l, c = '') => h('div', { class: 'stat ' + c }, h('b', n ?? '—'), h('span', l));

  function scopedRecords() {
    let list = records.filter(r => r.annee === st.annee && E.keepStatut(st.statut, r));
    if (st.level !== 'cs') list = list.filter(r => (r.codeZone || '') === st.zone);
    else list = list.filter(r => (r.codeCs || '') === st.cs);
    return list;
  }
  function consolData(list, level) {
    const agg = E.consolidate(list);
    let cols, rows;
    if (level === 'cs') {
      cols = ZONE_COLS; rows = [];
      const byZ = new Map(); list.forEach(r => { const z = r.codeZone || ''; if (!byZ.has(z)) byZ.set(z, []); byZ.get(z).push(r); });
      for (const z of zoneArr.filter(z => z.schools.some(s => (s.codeCs || '') === st.cs))) {
        const rs = byZ.get(z.code) || [], a = E.consolidate(rs), m = addM(E.metrics(E.SCHEMAS.EP, a.EP), E.metrics(E.SCHEMAS.EM, a.EM));
        rows.push({ id: z.code || 'sans-zone', nom: z.label, nbEc: z.schools.filter(s => (s.codeCs || '') === st.cs).length, nbFi: rs.length, ...m });
      }
    } else {
      cols = SCHOOL_COLS; rows = list.map(r => { const s = schools.find(x => x.id === r.schoolId) || { id: r.schoolId, nom: r.schoolNom, cycle: r.cycle }; return schoolRow(s, r); });
    }
    const totals = { nom: 'TOTAL', ...totalsOf(rows, [...KEYS, 'nbEc', 'nbFi']) };
    return { agg, cols, rows, totals, list };
  }

  function drawToolbar() {
    toolbar.replaceChildren(seg, sel('annee', years.map(y => [y, 'Année ' + y]), '200px'),
      ...(st.level !== 'cs' ? [sel('zone', zoneArr.map(z => [z.code, z.label]), '300px')] : (csArr.length > 1 ? [sel('cs', csArr.map(c => [c.code, c.label]))] : [])),
      ...(st.level !== 'ecole' ? [sel('statut', Object.entries(E.STATUT_FILTERS))] : []));
    seg.replaceChildren(...levels.map(([k, l]) => h('button', { class: 'btn sm' + (st.level === k ? ' primary' : ''), onclick: () => { st.level = k; draw(); } }, l)));
  }

  function draw() {
    LAST = st; drawToolbar(); holder.replaceChildren();
    if (st.level === 'ecole') {
      const rm = recMap(), list = (zones.get(st.zone)?.schools || []).map(s => schoolRow(s, rm.get(s.id)));
      const filled = list.filter(r => r.rec).length, T = list.reduce((a, r) => a + nz(r.T), 0);
      holder.append(h('div', { class: 'cards' }, stat(list.length, 'écoles dans la zone'), stat(filled, 'fiches d\'effectifs créées', filled < list.length ? 'y' : ''), stat(T.toLocaleString('fr-FR'), 'élèves recensés')));
      table = dataTable({ columns: SCHOOL_COLS, rows: list, getId: r => r.id, pageSize: 100, empty: 'Aucune école dans cette zone.', totals: { nom: 'TOTAL', ...Object.fromEntries(['G', 'F', 'T', 'eh', 'redoub', 'etr', 'orph', 'sansActe'].map(k => [k, list.reduce((a, r) => a + nz(r[k]), 0)])) },
        onOpen: (r) => openSchool(r.school) });
      holder.append(h('p', { class: 'sub' }, 'Double-cliquez sur une école pour ouvrir ou créer sa fiche d\'effectifs (remplie automatiquement depuis les fiches de collecte quand elles existent).'), table.el);
      exportData = consolData(zones.get(st.zone) ? records.filter(r => r.annee === st.annee && (r.codeZone || '') === st.zone) : [], 'zone');
      ctx.status(`${filled}/${list.length} fiche(s) d'effectifs — ${st.annee}`);
    } else {
      const data = consolData(scopedRecords(), st.level); exportData = data;
      const mt = addM(E.metrics(E.SCHEMAS.EP, data.agg.EP), E.metrics(E.SCHEMAS.EM, data.agg.EM));
      holder.append(h('div', { class: 'cards' }, stat(mt.T === null ? '—' : mt.T.toLocaleString('fr-FR'), 'élèves recensés'), stat(mt.G ?? '—', 'garçons / masculin'), stat(mt.F ?? '—', 'filles / féminin'),
        stat(mt.eh ?? '—', 'enfants handicapés', 'y'), stat(data.agg.nbEP + data.agg.nbEM, 'fiche(s) consolidée(s)')));
      table = dataTable({ columns: data.cols, rows: data.rows, getId: r => r.id, pageSize: 200, totals: data.totals, empty: 'Aucune fiche pour ces critères.' });
      holder.append(table.el);
      for (const S of [E.SCHEMAS.EP, E.SCHEMAS.EM]) {
        const nb = S.id === 'EP' ? data.agg.nbEP : data.agg.nbEM; if (!nb) continue;
        holder.append(h('h3', { style: { margin: '18px 0 6px' } }, `${S.label} — consolidation de ${nb} fiche(s)`), ...S.blocks.map(b => viewBlock(S, b, data.agg[S.id])), statsEl(S, data.agg[S.id], st.level === 'cs' ? (csList.get(st.cs)?.label || '') : (zones.get(st.zone)?.label || '')));
      }
      const ecolesPerim = schools.filter(x => (st.level === 'cs' ? (x.codeCs || '') === st.cs : (x.codeZone || '') === st.zone));
      const ms = E.matSections(ecolesPerim, records.filter(r => E.keepStatut(st.statut, r)), fiches, st.annee);
      if (ms.pub.ecoles || ms.prv.ecoles) holder.append(h('h3', { style: { margin: '18px 0 6px' } }, 'Écoles maternelles par section (SP, SG) — recensement, rentrée, fin d\'année'), ...matSectionsEl(ms));
      ctx.status(`${data.agg.nbEP + data.agg.nbEM} fiche(s) consolidée(s) — ${st.annee}`);
    }
    setActions();
  }

  async function openSchool(s) {
    let rec = await db.get('effectifs', E.effId(s.id, st.annee));
    if (!rec) {
      if (!canWrite) return toast("Aucune fiche d'effectifs pour cette école : seul le CP de la zone peut la créer.", 'warn');
      rec = await createRecord(u, s, st.annee, fiches); records.push(rec);
    }
    ctx.go('effectif/' + encodeURIComponent(rec.id));
  }
  async function initZone() {
    const rm = recMap(), todo = (zones.get(st.zone)?.schools || []).filter(s => !rm.has(s.id));
    if (!todo.length) return toast('Toutes les écoles de la zone ont déjà une fiche.', 'warn');
    if (!(await confirmBox(`Créer ${todo.length} fiche(s) d'effectifs pour l'année ${st.annee} ? Elles seront préremplies à partir des fiches de collecte quand elles existent.`, 'Créer'))) return;
    for (const s of todo) records.push(await createRecord(u, s, st.annee, fiches));
    toast(`${todo.length} fiche(s) créée(s).`); draw();
  }

  /* ----- exports ----- */
  const exportTitle = () => {
    const lvl = st.level === 'cs' ? 'CIRCONSCRIPTION SCOLAIRE' : 'ZONE PÉDAGOGIQUE';
    const lab = st.level === 'cs' ? (csList.get(st.cs)?.label || '') : (zones.get(st.zone)?.label || '');
    return { title: `EFFECTIFS DES APPRENANTS — ${lvl}`, subtitle: lab, name: clean(`Effectifs_${st.level === 'cs' ? 'CS' : 'zone'}_${lab}_${st.annee}`) };
  };
  async function exportExcel() {
    const t = exportTitle(), d = exportData; if (!d.list.length) return toast('Aucune fiche à exporter.', 'warn');
    download(await X.consolXlsx({ ...t, annee: st.annee, columns: exportCols(d.cols), rows: d.rows, totals: d.totals, agg: d.agg, records: d.list }), t.name + '.xlsx');
  }
  async function exportPdf() {
    const t = exportTitle(), d = exportData; if (!d.list.length) return toast('Aucune fiche à exporter.', 'warn');
    download(pdfBlob(await X.consolPdf({ ...t, annee: st.annee, columns: exportCols(d.cols), rows: d.rows, totals: d.totals, agg: d.agg, zone: schoolsZoneNum() })), t.name + '.pdf');
  }
  const schoolsZoneNum = () => (st.level === 'cs' ? '' : (zones.get(st.zone)?.schools[0]?.numZone || ''));
  async function templateExcel() {
    const rm = recMap(), list = (zones.get(st.zone)?.schools || []).map(s => ({ ...s, __data: rm.get(s.id)?.data || {} }));
    try { download(await X.templateXlsx({ schools: list, annee: st.annee }), clean(`Modele_saisie_effectifs_${zones.get(st.zone)?.label || 'zone'}_${st.annee}.xlsx`)); } catch (e) { toast(e.message, 'err'); }
  }
  async function importExcel() {
    const f = await pickFile('.xlsx'); if (!f) return;
    let sheets; try { sheets = await readXlsx(await readAsBuffer(f)); } catch (e) { return toast('Fichier Excel illisible : ' + e.message, 'err'); }
    const res = X.parseSaisie(sheets, schools);
    if (!res.updates.length) return showReport('Import impossible', res, false);
    const ok = await showReport('Import Excel — vérification', res, true); if (!ok) return;
    const rm = recMap(); let done = 0; const refus = [];
    for (const up of res.updates) {
      let rec = rm.get(up.school.id);
      if (!rec) { rec = await createRecord(u, up.school, st.annee, fiches); records.push(rec); }
      if (!canEdit(u, rec)) { refus.push(up.school.nom + ' (' + rec.statut + ')'); continue; }
      X.applyImport(rec, up); rec.updated = nowISO(); (rec.history = rec.history || []).push({ date: nowISO(), action: 'Import Excel', by: u.username });
      await db.put('effectifs', rec); done++;
    }
    await addLog(u, { action: 'Import Excel effectifs', target: `${done} école(s) — ${st.annee}` });
    toast(`${done} fiche(s) mise(s) à jour.` + (refus.length ? ` Non modifiées (verrouillées ou hors droits) : ${refus.join(', ')}.` : ''), refus.length ? 'warn' : 'ok', 6000);
    draw();
  }
  function setActions() {
    const isSchool = st.level === 'ecole';
    ctx.actions([
      { label: '\uE014 Ouvrir la fiche', kind: 'primary', show: isSchool, onClick: () => { const r = table.selected; if (!r) return toast('Sélectionnez une école dans la liste.', 'warn'); openSchool(r.school); } },
      { label: '\uE051 Créer les fiches de la zone', show: isSchool && canWrite, onClick: initZone },
      { label: '\uE009 Excel', onClick: exportExcel }, { label: '\uE009 PDF', onClick: exportPdf },
      { label: '\uE00B Importer Excel', show: canWrite, onClick: importExcel },
      { label: '\uE00D Modèle de saisie Excel', show: isSchool && canWrite, onClick: templateExcel },
      { label: '\uE008 Imprimer', onClick: () => window.print() },
    ]);
  }
  draw();
}

/** Rapport d'import : résout vrai si l'utilisateur confirme */
function showReport(title, res, confirmable) {
  return new Promise((resolve) => {
    const body = h('div', {},
      h('p', {}, h('b', `${res.updates.length} école(s) concernée(s), ${res.nbValues} valeur(s) lue(s), ${res.rejets.length} anomalie(s).`)),
      res.updates.length ? h('ul', {}, res.updates.slice(0, 12).map(x => h('li', `${x.school.nom} — ${x.n} valeur(s)`)), res.updates.length > 12 ? h('li', `… et ${res.updates.length - 12} autre(s)`) : null) : h('p', { class: 'sub' }, "Aucune donnée exploitable. Utilisez le « Modèle de saisie Excel » ou un export de cette application (feuilles « Saisie EP » / « Saisie EM »)."),
      res.rejets.length ? h('div', {}, h('b', 'Anomalies (ignorées) :'), h('ul', {}, res.rejets.slice(0, 15).map(x => h('li', { style: { color: 'var(--err)' } }, x)), res.rejets.length > 15 ? h('li', `… ${res.rejets.length - 15} autre(s)`) : null)) : null,
      confirmable ? h('p', {}, 'Les cases vides du fichier effacent la valeur correspondante. Les fiches transmises ou validées ne sont pas modifiées.') : null);
    modal({ title, body, wide: true, onClose: () => resolve(false), actions: confirmable ? [{ label: 'Annuler', onClick: () => resolve(false) }, { label: 'Appliquer l\'import', kind: 'primary', onClick: () => resolve(true) }] : [{ label: 'Fermer', onClick: () => resolve(false) }] });
  });
}

/* ---------------- Tableaux ---------------- */
function headEl(m) {
  const rows = Array.from({ length: m.headRows }, () => h('tr'));
  m.head.forEach(c => rows[c.r || 0].append(h('th', { colspan: c.s || 1, rowspan: c.rs || 1 }, c.t)));
  return h('thead', {}, rows);
}
/** Tableau en lecture seule (consolidation) */
function viewBlock(S, block, v) {
  const m = X.blockModel(S, block, v);
  const body = m.rows.map(row => {
    if (row[0].kind === 'group') return h('tr', { class: 'eff-grp' }, h('td', { colspan: m.ncols }, row[0].t));
    return h('tr', {}, row.map(c => h('td', { class: c.kind === 'label' ? 'eff-l' + (c.calc ? ' calc' : '') : c.kind === 'na' ? 'na' : c.kind === 'calc' ? 'calc num' : 'num' }, c.t)));
  });
  return h('div', { class: 'card eff-wrap' }, h('h4', {}, block.title), h('div', { class: 'tbl-wrap' }, h('table', { class: 'eff' }, headEl(m), h('tbody', {}, body))));
}


/** Synthèse par classe + courbes d'âge (garçons / filles, puis une courbe par classe) */
function statsEl(S, v, titre = '') {
  const rows = E.classSummary(S, v), tot = rows.reduce((a, r) => ({ G: a.G + r.G, F: a.F + r.F }), { G: 0, F: 0 });
  const unite = S.id === 'EP' ? 'classe' : 'section', a = X.serieSexe(S, v), b = X.serieClasses(S, v);
  const tbl = h('table', { class: 'eff' }, h('thead', {}, h('tr', {}, ['', S.sexName.G, S.sexName.F, 'Total', '% filles', 'Âge le plus fréquent'].map(t => h('th', t)))),
    h('tbody', {}, ...rows.map(r => h('tr', {}, h('td', { class: 'eff-l' }, r.label), h('td', {}, r.G), h('td', {}, r.F), h('td', { class: 'calc' }, r.T), h('td', {}, r.pF === null ? '' : r.pF + ' %'), h('td', {}, r.ageModal))),
      h('tr', { class: 'eff-grp' }, h('td', {}, 'TOTAL'), h('td', {}, tot.G), h('td', {}, tot.F), h('td', {}, tot.G + tot.F), h('td', {}, tot.G + tot.F ? Math.round(tot.F / (tot.G + tot.F) * 100) + ' %' : ''), h('td', {}))));
  const g1 = h('div', { class: 'card-courbe' }), g2 = h('div', { class: 'card-courbe' });
  const ages = ageTableEl(S, v);
  g1.innerHTML = svgCourbe({ titre: "Courbe d'âge selon le sexe", sousTitre: [S.label, titre].filter(Boolean).join(' — '), ...a });
  g2.innerHTML = svgCourbe({ titre: `Courbe d'âge par ${unite}`, sousTitre: [S.label, titre].filter(Boolean).join(' — '), ...b });
  return h('div', { class: 'card eff-wrap' }, h('h4', {}, `Synthèse par ${unite} et statistique par courbe d'âge`), h('div', { class: 'tbl-wrap' }, tbl), ages, g1, g2);
}
const f2 = (x) => (x === null || x === undefined ? '—' : x.toFixed(2).replace('.', ','));
const fp = (x) => (x === null || x === undefined ? '' : String(x).replace('.', ',') + ' %');
/** Catégories d'âge (moins de 5 ans … 16 ans et plus) par cours et par sexe : effectifs, pourcentages, âge moyen, écart type */
function ageTableEl(S, v) {
  const t = E.ageTable(S, v), SX = ['G', 'F', 'T'];
  if (t.vide) return h('p', { class: 'muted' }, "Catégories d'âge : aucune répartition par âge saisie.");
  const unite = S.id === 'EP' ? 'cours' : 'section';
  const lab = (c) => (c === E.ENS ? 'ENSEMBLE' : S.id === 'EM' ? ({ pet: 'Section des petits (SP)', gra: 'Section des grands (SG)' }[c] || E.colLabel(S, c)) : E.colLabel(S, c));
  const head = h('thead', {}, h('tr', {}, h('th', { rowspan: 2 }, "Catégorie d'âge"), ...t.cols.map(c => h('th', { colspan: 3 }, lab(c)))),
    h('tr', {}, ...t.cols.flatMap(() => SX.map(x => h('th', {}, x)))));
  const cel = (n, p, cl) => h('td', { class: 'num ' + (cl || '') }, n ? String(n) : '', n && p !== null ? h('small', { class: 'eff-pc' }, fp(p)) : null);
  const body = [
    ...t.lignes.map(r => h('tr', {}, h('td', { class: 'eff-l' }, r.l), ...t.cols.flatMap(c => SX.map(x => cel(r.cells[c][x][0], r.cells[c][x][1], x === 'T' || c === E.ENS ? 'calc' : ''))))),
    h('tr', { class: 'eff-stat' }, h('td', { class: 'eff-l' }, 'TOTAL'), ...t.cols.flatMap(c => SX.map(x => cel(t.tot[c][x], t.tot[c][x] ? 100 : null)))),
    h('tr', { class: 'eff-stat' }, h('td', { class: 'eff-l' }, 'Âge moyen (ans)'), ...t.cols.flatMap(c => SX.map(x => h('td', { class: 'num' }, f2(t.stats[c][x].moy))))),
    h('tr', { class: 'eff-stat' }, h('td', { class: 'eff-l' }, 'Écart type (ans)'), ...t.cols.flatMap(c => SX.map(x => h('td', { class: 'num' }, f2(t.stats[c][x].et))))),
  ];
  return h('div', {}, h('h4', { style: { marginTop: '14px' } }, `Catégories d'âge par sexe et par ${unite} : pourcentages, âge moyen et écart type`),
    h('div', { class: 'tbl-wrap' }, h('table', { class: 'eff eff-ages' }, head, h('tbody', {}, body))),
    h('p', { class: 'muted', style: { fontSize: '12px' } }, `Pourcentage : part de la catégorie d'âge dans l'effectif du ${unite} et du sexe (colonne). Âge moyen et écart type : ${E.NOTE_AGES[S.id]}.`));
}

/* ---------------- Fiche d'une école ---------------- */
async function editor(ctx) {
  const u = ctx.user, id = decodeURIComponent(ctx.args[0] || '');
  let rec = await db.get('effectifs', id);
  if (!rec || !inScope(u, rec)) {
    ctx.title('Fiche introuvable');
    ctx.el.append(h('div', { class: 'card' }, h('p', "Cette fiche d'effectifs est introuvable ou hors de votre périmètre."), h('button', { class: 'btn', onclick: () => ctx.go('effectifs') }, '← Retour à la liste')));
    return;
  }
  const S = E.schemaOf(rec.cycle), editable = canEdit(u, rec), fiches = (await scoped('fiches', u)).filter(f => f.schoolId === rec.schoolId);
  const school = await db.get('schools', rec.schoolId);
  if (school && editable) { const before = JSON.stringify(rec.ident); E.syncIdent(rec, school); if (before !== JSON.stringify(rec.ident)) await db.put('effectifs', rec); }
  ctx.title(`Effectifs — ${rec.schoolNom}`, `${S.label} · ${rec.annee} · fiche « ${rec.statut} »${editable ? '' : ' (lecture seule)'}`);

  let dirty = false, timer = null;
  const save = async () => { clearTimeout(timer); if (!editable) return; rec.updated = nowISO(); await db.put('effectifs', rec); dirty = false; ctx.status('Enregistré à ' + timeNow()); };
  const later = () => { dirty = true; ctx.status('Modification en cours…'); clearTimeout(timer); timer = setTimeout(save, 900); };

  const calcs = [], colInputs = new Map(), globalEls = {}, issuesBox = h('div'), statsBox = h('div');
  const refresh = () => {
    const v = E.computeValues(S, rec.data);
    for (const c of calcs) { const x = E.show(S, v, c.row, c.col, c.sex); c.el.textContent = x === null ? '' : x; }
    for (const sx of ['G', 'F', 'T']) { const x = E.show(S, v, 'tot', E.ENS, sx); globalEls[sx].textContent = x === null ? '—' : x.toLocaleString('fr-FR'); }
    globalEls.comp.textContent = E.completion(S, v) + ' %';
    statsBox.replaceChildren(statsEl(S, v, rec.schoolNom));
    const iss = E.validate(S, v), errs = iss.filter(i => i.lvl === 'err');
    issuesBox.replaceChildren(h('h4', {}, errs.length ? `\uE041 ${errs.length} erreur(s) de cohérence` : (iss.length ? `${iss.length} point(s) à vérifier` : '\uE003 Aucune incohérence détectée')),
      iss.length ? h('ul', {}, iss.slice(0, 40).map(i => h('li', { style: { color: i.lvl === 'err' ? 'var(--err)' : 'var(--warn)' } }, i.msg))) : null);
    return iss;
  };

  function blockEdit(block, bi) {
    const m = X.blockModel(S, block, E.computeValues(S, rec.data)), tbody = h('tbody');
    for (const grp of block.groups) {
      tbody.append(h('tr', { class: 'eff-grp' }, h('td', { colspan: m.ncols }, grp.title)));
      for (const rk of grp.rows) {
        const row = E.rowOf(S, rk), tr = h('tr', {}, h('td', { class: 'eff-l' + (row.calc ? ' calc' : '') }, row.l));
        for (const c of block.cols) for (const sx of ['G', 'F', 'T']) {
          if (!E.applies(S, row, c, sx)) { tr.append(h('td', { class: 'na' })); continue; }
          if (row.calc || c === E.ENS || sx === 'T') { const td = h('td', { class: 'calc num' }); calcs.push({ el: td, row: rk, col: c, sex: sx }); tr.append(td); continue; }
          const k = E.dataKey(rk, c, sx), cur = rec.data[k];
          const inp = h('input', { class: 'eff-in', type: 'number', min: 0, step: 1, inputmode: 'numeric', value: cur === undefined || cur === null ? '' : cur, readOnly: !editable, disabled: !editable,
            'aria-label': `${row.l.trim()} — ${E.colLabel(S, c)} — ${S.sexName[sx]}`,
            oninput: () => { const t = inp.value.trim(); if (t === '') delete rec.data[k]; else { const n = Math.max(0, Math.floor(Number(t))); if (!Number.isFinite(n)) return; rec.data[k] = n; } refresh(); later(); },
            onkeydown: (e) => { if (e.key !== 'Enter') return; e.preventDefault(); const arr = colInputs.get(ck), i = arr.indexOf(inp); (arr[i + 1] || arr[0]).focus(); } });
          const ck = `${bi}|${c}|${sx}`; if (!colInputs.has(ck)) colInputs.set(ck, []); colInputs.get(ck).push(inp);
          tr.append(h('td', {}, inp));
        }
        tbody.append(tr);
      }
    }
    return h('div', { class: 'card eff-wrap' }, h('h4', {}, block.title), h('div', { class: 'tbl-wrap' }, h('table', { class: 'eff' }, headEl(m), tbody)));
  }

  const stat = (l, el, c = '') => h('div', { class: 'stat ' + c }, el, h('span', l));
  globalEls.G = h('b', '—'); globalEls.F = h('b', '—'); globalEls.T = h('b', '—'); globalEls.comp = h('b', '0 %');
  const ident = X.identPairs(rec.ident);
  ctx.el.append(
    h('div', { class: 'card' }, h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } }, h('h3', {}, `${rec.schoolNom}`), badge(rec.statut)),
      rec.comment ? h('p', { style: { color: 'var(--warn)' } }, h('b', 'Observation du CCS : '), rec.comment) : null,
      h('div', { class: 'eff-ident' }, ident.map(([l, x]) => h('div', {}, h('small', l), h('b', String(x) || '—')))),
      h('p', { class: 'sub' }, "Identification remplie automatiquement depuis la fiche de l'école. " + (editable ? 'Les totaux et les contrôles se calculent en direct ; la saisie est enregistrée automatiquement.' : 'Cette fiche est verrouillée.'))),
    h('div', { class: 'cards' }, stat(S.sexName.G, globalEls.G), stat(S.sexName.F, globalEls.F), stat(S.globalTitle + ' — total', globalEls.T, 'y'), stat('Taux de remplissage', globalEls.comp)),
    ...S.blocks.map(blockEdit), statsBox, h('div', { class: 'card' }, issuesBox));
  refresh();

  /* ----- actions ----- */
  const base = clean(`Effectifs_${rec.schoolNom}_${rec.annee}`);
  async function prefillAgain() {
    const pre = E.prefillFromFiches(S, fiches, rec.annee);
    if (!pre.source) return toast("Aucune fiche de collecte de cette école pour l'année " + rec.annee + '.', 'warn');
    const force = await confirmBox(`Reprendre les effectifs par ${S.id === 'EP' ? 'classe' : 'section'} de la ${pre.source} ?\n« Confirmer » écrase les valeurs déjà saisies directement.`, 'Écraser et reprendre');
    const n = E.applyPrefill(rec, pre, force);
    (rec.history = rec.history || []).push({ date: nowISO(), action: `Reprise depuis la ${pre.source}`, by: u.username }); await save();
    toast(n ? `${n} valeur(s) reprise(s) depuis la ${pre.source}.` : 'Rien à reprendre : les valeurs sont déjà à jour.'); ctx.reload();
  }
  async function importOne() {
    const f = await pickFile('.xlsx'); if (!f) return;
    let sheets; try { sheets = await readXlsx(await readAsBuffer(f)); } catch (e) { return toast('Fichier Excel illisible : ' + e.message, 'err'); }
    const res = X.parseSaisie(sheets, [{ ...rec.ident, id: rec.schoolId, code: rec.schoolCode, nom: rec.schoolNom, cycle: rec.cycle }]);
    if (!(await showReport('Import Excel — ' + rec.schoolNom, res, res.updates.length > 0))) return;
    for (const up of res.updates) X.applyImport(rec, up);
    (rec.history = rec.history || []).push({ date: nowISO(), action: 'Import Excel', by: u.username }); await save(); toast('Import appliqué.'); ctx.reload();
  }
  async function transmit() {
    const iss = E.validate(S, E.computeValues(S, rec.data)), errs = iss.filter(i => i.lvl === 'err').length;
    if (errs && !(await confirmBox(`La fiche contient ${errs} erreur(s) de cohérence. Transmettre quand même au CCS ?`, 'Transmettre'))) return;
    await save(); await setStatut(u, rec, 'Transmise', 'Transmission au CCS (effectifs)'); toast('Fiche transmise. Exportez le paquet depuis « Transmission & sauvegarde ».'); ctx.reload();
  }
  async function validateRec() { const c = await promptBox('Validation', 'Commentaire (facultatif)'); if (c === null) return; await setStatut(u, rec, 'Validée', 'Validation CCS (effectifs)', c); toast('Fiche validée.'); ctx.reload(); }
  async function correction() { const c = await promptBox('Demande de correction', 'Indiquez les corrections attendues'); if (!c) { if (c === '') toast('Un motif est obligatoire.', 'err'); return; } await setStatut(u, rec, 'À corriger', 'Demande de correction (effectifs)', c); toast('Correction demandée.'); ctx.reload(); }
  async function unlock() { await setStatut(u, rec, 'Brouillon', 'Déverrouillage (admin)'); ctx.reload(); }
  async function clearAll() { if (!(await confirmBox('Vider toutes les valeurs de cette fiche ?', 'Vider', true))) return; rec.data = {}; await save(); ctx.reload(); }

  ctx.actions([
    { label: '← Liste', onClick: async () => { await save(); ctx.go('effectifs'); } },
    { label: '\uE007 Enregistrer', kind: 'primary', show: editable, onClick: async () => { await save(); toast('Fiche enregistrée.'); } },
    { label: '↻ Reprendre des fiches de collecte', show: editable, onClick: prefillAgain },
    { label: '\uE009 PDF', onClick: async () => { await save(); download(pdfBlob(await X.schoolPdf(rec)), base + '.pdf'); } },
    { label: '\uE009 Excel', onClick: async () => { await save(); download(await X.schoolXlsx(rec), base + '.xlsx'); } },
    { label: '\uE00B Importer Excel', show: editable, onClick: importOne },
    { label: '\uE04F Transmettre au CCS', kind: 'accent', show: canTransmit(u, rec), onClick: transmit },
    { label: '\uE004 Valider', kind: 'primary', show: canValidate(u, rec), onClick: validateRec },
    { label: '\uE037 Demander une correction', show: canValidate(u, rec), onClick: correction },
    { label: '\uE034 Déverrouiller', show: u.role === 'ADMIN' && rec.statut !== 'Brouillon', onClick: unlock },
    { label: '\uE005 Vider', kind: 'danger', show: editable, onClick: clearAll },
  ]);
  return async () => { clearTimeout(timer); if (dirty) await save(); };
}

/** Écoles maternelles par section (SP, SG), par sexe : recensement, rentrée et fin d'année, public puis privé à part. */
function matSectionsEl(ms) {
  const SX = ['G', 'F', 'T'], vg = (o, x) => (x === 'T' ? o.G + o.F : o[x]);
  const tete = (premiere) => h('thead', {}, h('tr', {}, h('th', { rowspan: 2 }, premiere), ...E.SECTIONS_M.map(([, l]) => h('th', { colspan: 3 }, l)), h('th', { colspan: 3 }, 'TOTAL')),
    h('tr', {}, ...[0, 1, 2].flatMap(() => SX.map(x => h('th', {}, x)))));
  const ligne = (lib, o, cl) => h('tr', { class: cl || '' }, h('td', { class: 'eff-l' }, lib),
    ...E.SECTIONS_M.flatMap(([c]) => SX.map(x => h('td', { class: 'num' + (x === 'T' ? ' calc' : '') }, vg(o[c], x)))),
    ...SX.map(x => h('td', { class: 'num calc' }, E.SECTIONS_M.reduce((a, [c]) => a + vg(o[c], x), 0))));
  const tab = (premiere, rows) => h('div', { class: 'tbl-wrap' }, h('table', { class: 'eff' }, tete(premiere), h('tbody', {}, rows)));
  const out = [];
  for (const [cle, lib, coul] of [['pub', 'publiques', 'var(--green-d)'], ['prv', 'privées (à part)', '#8e44ad']]) {
    const m = ms[cle]; if (!m.ecoles) continue;
    const S = E.SCHEMAS.EM;
    out.push(h('div', { class: 'card eff-wrap', style: { borderTop: '4px solid ' + coul } },
      h('h4', { style: { color: coul } }, `Écoles maternelles ${lib} : effectifs par section (SP, SG) — ${m.ecoles} école(s)`),
      h('h5', {}, `Fiche de recensement (${m.nbRec} fiche(s) d'effectifs)`), tab('', [ligne('Effectif (tableau 3)', m.rec, 'eff-stat')]),
      m.nbRec ? ageTableEl(S, m.v) : null,
      h('h5', { style: { marginTop: '14px' } }, `Rapport de rentrée — répartition des enfants par section (${m.nRent} fiche(s))`),
      tab('Rubrique', E.LIGNES_RENTREE_M.map(([k, l]) => ligne(l, m.rent[k], k === 'debut' ? 'eff-stat' : ''))),
      h('h5', { style: { marginTop: '14px' } }, `Fiche de fin d'année — répartition des enfants par section (${m.nFin} fiche(s))`),
      tab('Rubrique', E.LIGNES_FIN_M.map(([k, l]) => ligne(l, m.fin[k], k === 'fin' ? 'eff-stat' : '')))));
  }
  return out;
}
