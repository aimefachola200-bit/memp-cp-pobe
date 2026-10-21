/* République du Bénin — MEMP — Vue : écoles, structure pédagogique et équipements (consolidation)
   Par zone pédagogique (une ligne par école) ou par circonscription (une ligne par zone), secteur public et privé à part :
   écoles, classes / sections autorisées et ouvertes, salles, classes simples, jumelées et multigrades (fiches de rentrée
   ou de fin d'année), moyennes et écarts types, cantine, lavage des mains, gestion collégiale (fiches), eau potable et
   sa source (dont puits), électricité et sa source, latrines, clôture (fiche de l'école). Graphiques au choix, Excel.
   Conception : Maître Aimé FACHE */
import { h, download, clean, currentSchoolYear } from './util.js';
import { scoped } from './data.js';
import { sectionsFor, gridValue } from './schema.js';
import * as E from './effectifs-schema.js';
import { svgCourbe, PALETTE } from './effectifs-charts.js';

const CLASSES = ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'];
export const STRUCT = [['simple', 'Simples'], ['jumelee', 'Jumelées'], ['multi', 'Multigrades']];
export const EAU = [['SONEB', 'SONEB'], ['Forage', 'Forage'], ["Adduction d'eau villageoise", 'Adduction villageoise'], ['Puits', 'Puits'], ['Citerne', 'Citerne'], ['Autre', 'Autre']];
export const ELEC = [['SBEE', 'SBEE'], ['Groupe électrogène', 'Groupe électrogène'], ['Énergie solaire', 'Énergie solaire'], ['Autre', 'Autre']];
export const EQUIP = [['eau', 'Eau potable', 'ecole'], ['electricite', 'Électricité', 'ecole'], ['latrines', 'Latrines', 'ecole'], ['cloture', 'Clôture', 'ecole'],
  ['cantine', 'Cantine', 'fiche'], ['lavage', 'Lavage des mains', 'fiche'], ['gestion_coll', 'Gestion collégiale', 'fiche']];
const SOURCES = { RENTREE: 'Rapport de rentrée', FIN: "Fiche de fin d'année" };
let LAST = null;

const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };
const oui = (v) => { const s = String(v ?? '').trim().toLowerCase(); return s === 'oui' ? true : s === 'non' ? false : null; };
const f2 = (v, d = 2) => (v === null || v === undefined ? '—' : (Math.round(v * 10 ** d) / 10 ** d).toString().replace('.', ','));
const pc = (v) => (v === null || v === undefined ? '—' : f2(v, 1) + ' %');
export function moyEcart(vals) {
  if (!vals.length) return { n: 0, moy: null, et: null, min: null, max: null };
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  return { n: vals.length, moy: m, et: Math.sqrt(vals.reduce((a, v) => a + (v - m) ** 2, 0) / vals.length), min: Math.min(...vals), max: Math.max(...vals) };
}
export function vide() {
  return { ecoles: 0, ep: 0, em: 0, fiches: 0, aut: 0, ouv: 0, sexist: 0, sutil: 0, struct: { simple: 0, jumelee: 0, multi: 0 },
    equip: Object.fromEntries(EQUIP.map(([k]) => [k, [0, 0]])), eau: Object.fromEntries(EAU.map(([k]) => [k, 0])), elec: Object.fromEntries(ELEC.map(([k]) => [k, 0])),
    _classes: [], _eleves: [], _taille: [] };
}
/** Structure pédagogique d'une fiche : primaire (simple : somme des cours ; jumelée / multigrade : salles utilisées,
    à défaut la moitié des cours jumelés / le plus grand nombre par cours) ; maternelle (sections petits + grands). */
export function structureFiche(fiche) {
  const S = sectionsFor(fiche.kind), grid = S.find(s => s.id === 'struct'), d = fiche.data || {}, st = { simple: 0, jumelee: 0, multi: 0 };
  if (!grid) return st;
  const g = (r, c) => num(gridValue(d, grid, r, c, 'n'));
  const em = fiche.kind.startsWith('EM');
  for (const [r] of STRUCT) {
    const cours = em ? ['pet', 'gra'].map(c => g(r, c)) : CLASSES.map(c => g(r, c)), salles = g(r, 'salles');
    const somme = cours.reduce((a, b) => a + b, 0);
    st[r] = r === 'simple' ? somme : (salles || (r === 'jumelee' && !em ? Math.ceil(somme / 2) : Math.max(0, ...cours)));
  }
  return st;
}
export function ajouter(x, school, fiche) {
  const em = school.cycle === 'Maternelle';
  x.ecoles++; x[em ? 'em' : 'ep']++;
  for (const [k, , src] of EQUIP) if (src === 'ecole') { const v = oui(school[k]); if (v !== null) { x.equip[k][1]++; if (v) x.equip[k][0]++; } }
  if (school.eauSource && x.eau[school.eauSource] !== undefined) x.eau[school.eauSource]++;
  if (school.elecSource && x.elec[school.elecSource] !== undefined) x.elec[school.elecSource]++;
  if (!fiche) return;
  x.fiches++;
  const d = fiche.data || {}, S = sectionsFor(fiche.kind), eff = S.find(s => s.id === 'eff');
  const aut = num(em ? d.sections_aut : d.classes_aut), ouv = num(em ? d.sections_ouv : d.classes_ouv);
  x.aut += aut; x.ouv += ouv; x.sexist += num(d.salles_exist); x.sutil += num(d.salles_util);
  const st = structureFiche(fiche); for (const k in st) x.struct[k] += st[k];
  const nc = ouv || (st.simple + st.jumelee + st.multi); if (nc) x._classes.push(nc);
  let tot = 0;
  for (const c of em ? ['pet', 'gra'] : CLASSES) {
    const v = ['G', 'F'].reduce((a, sx) => a + num(gridValue(d, eff, 'debut', c, sx)), 0);
    if (v) { x._taille.push(v); tot += v; }
  }
  if (tot) x._eleves.push(tot);
  for (const [k, , src] of EQUIP) if (src === 'fiche') { const v = oui(d[k]); if (v !== null) { x.equip[k][1]++; if (v) x.equip[k][0]++; } }
}
export function indicateurs(x) {
  const p = (a, b) => (b ? Math.round(1000 * a / b) / 10 : null);
  x.struct_tot = x.struct.simple + x.struct.jumelee + x.struct.multi; x.p_jum = p(x.struct.jumelee, x.struct_tot); x.p_multi = p(x.struct.multi, x.struct_tot);
  x.taux_ouv = p(x.ouv, x.aut);
  x.p_equip = Object.fromEntries(EQUIP.map(([k]) => [k, p(x.equip[k][0], x.equip[k][1])]));
  x.stats = { classes: moyEcart(x._classes), eleves: moyEcart(x._eleves), taille: moyEcart(x._taille) };
  return x;
}

export async function render(id, ctx) {
  const u = ctx.user;
  ctx.title('Écoles : structure et équipements', "Nombre d'écoles, classes, structure pédagogique, moyennes et écarts types, eau, électricité et autres équipements");
  const [schools, fiches] = await Promise.all([scoped('schools', u), scoped('fiches', u)]);
  const years = [...new Set([...fiches.map(f => f.annee).filter(Boolean), currentSchoolYear()])].sort().reverse();
  const zones = new Map(), csList = new Map();
  for (const s of schools) {
    const z = s.codeZone || ''; if (!zones.has(z)) zones.set(z, { code: z, label: z ? `Zone ${s.numZone || z}${s.nomCs ? ' — CS ' + s.nomCs : ''}` : 'Sans zone' });
    const c = s.codeCs || ''; if (!csList.has(c)) csList.set(c, { code: c, label: s.nomCs ? 'CS ' + s.nomCs : (c || 'Sans CS') });
  }
  const zoneArr = [...zones.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr', { numeric: true })), csArr = [...csList.values()];
  const st = LAST && years.includes(LAST.annee) ? LAST : { annee: years[0], level: u.role === 'CP' ? 'zone' : 'cs', zone: zoneArr[0]?.code ?? '', cs: csArr[0]?.code ?? '', source: 'RENTREE', statut: 'all' };
  const toolbar = h('div', { class: 'tbl-tools no-print' }), holder = h('div');
  ctx.el.append(toolbar, holder);
  const sel = (k, opts, w = '230px') => h('select', { class: 'search', style: { maxWidth: w }, onchange: (e) => { st[k] = e.target.value; draw(); } }, opts.map(([v, l]) => h('option', { value: v, selected: st[k] === v }, l)));
  function calcul() {
    const ecs = schools.filter(s => (st.level === 'cs' ? (s.codeCs || '') === st.cs : (s.codeZone || '') === st.zone));
    const grp = new Map(), tot = { nom: 'TOTAL', pub: vide(), prv: vide() };
    for (const s of ecs.sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr'))) {
      const k = st.level === 'cs' ? (zones.get(s.codeZone || '')?.label || 'Sans zone') : s.nom;
      if (!grp.has(k)) grp.set(k, { nom: k, pub: vide(), prv: vide() });
      const kind = (s.cycle === 'Maternelle' ? 'EM_' : 'EP_') + st.source;
      const f = fiches.find(x => x.schoolId === s.id && x.annee === st.annee && x.kind === kind && E.keepStatut(st.statut, x));
      const sec = E.estPrive(s) ? 'prv' : 'pub';
      ajouter(grp.get(k)[sec], s, f); ajouter(tot[sec], s, f);
    }
    const g = [...grp.values()]; for (const x of [...g, tot]) { indicateurs(x.pub); indicateurs(x.prv); }
    return { grp: g, tot, lib: st.level === 'cs' ? 'Zone pédagogique' : 'École' };
  }
  function table(c, s, titre, head, cells) {
    const rows = [...c.grp, c.tot].filter(g => g[s].ecoles);
    return h('div', { class: 'card eff-wrap' }, h('h4', {}, titre), h('div', { class: 'tbl-wrap' }, h('table', { class: 'eff' }, h('thead', {}, head),
      h('tbody', {}, rows.map(g => h('tr', { class: g === c.tot ? 'eff-stat' : '' }, h('td', { class: 'eff-l' }, g.nom), ...cells(g[s]).map(([v, cl]) => h('td', { class: 'num ' + (cl || '') }, String(v)))))))));
  }
  const tete = (c, cols) => h('tr', {}, h('th', {}, c.lib), ...cols.map(t => h('th', {}, t)));
  const tete2 = (c, grp, sous) => [h('tr', {}, h('th', { rowspan: 2 }, c.lib), ...grp.map(t => h('th', { colspan: sous.length }, t))), h('tr', {}, ...grp.flatMap(() => sous.map(t => h('th', {}, t))))];
  const courbe = (titre, labels, series) => { const d = h('div', { class: 'card-courbe' }); d.innerHTML = labels.length ? svgCourbe({ titre, labels, series: series.map(x => ({ ...x, values: x.values.map(v => v ?? 0) })) }) : ''; return d; };
  function secteur(c, s) {
    const g = c.grp.filter(x => x[s].ecoles), labels = g.map(x => x.nom);
    return [
      table(c, s, '1. Écoles, classes et salles', tete(c, ['Primaires', 'Maternelles', 'Total', 'Fiches', 'Classes / sections autorisées', 'Ouvertes', "Taux d'ouverture", 'Salles existantes', 'Salles utilisées']),
        (x) => [[x.ep], [x.em], [x.ecoles, 'calc'], [x.fiches], [x.aut], [x.ouv], [pc(x.taux_ouv), 'calc'], [x.sexist], [x.sutil]]),
      courbe('Écoles et classes', labels, [{ nom: 'Écoles', color: PALETTE[0], values: g.map(x => x[s].ecoles) }, { nom: 'Autorisées', color: PALETTE[4], values: g.map(x => x[s].aut) }, { nom: 'Ouvertes', color: PALETTE[2], values: g.map(x => x[s].ouv) }]),
      table(c, s, '2. Structure pédagogique', tete(c, [...STRUCT.map(([, l]) => l), 'Total', '% jumelées', '% multigrades']),
        (x) => [...STRUCT.map(([k]) => [x.struct[k]]), [x.struct_tot, 'calc'], [pc(x.p_jum), 'calc'], [pc(x.p_multi), 'calc']]),
      courbe('Structure pédagogique', labels, STRUCT.map(([k, l], i) => ({ nom: l, color: PALETTE[i], values: g.map(x => x[s].struct[k]) }))),
      table(c, s, '3. Moyennes et écarts types', tete2(c, ['Classes par école', 'Élèves par école', 'Élèves par classe'], ['Moyenne', 'Écart type', 'Min', 'Max']),
        (x) => ['classes', 'eleves', 'taille'].flatMap(k => { const m = x.stats[k]; return [[f2(m.moy), 'calc'], [f2(m.et), 'calc'], [m.min ?? '—'], [m.max ?? '—']]; })),
      courbe('Moyennes et écarts types', labels, [{ nom: 'Élèves par classe – moyenne', color: PALETTE[0], values: g.map(x => x[s].stats.taille.moy) },
        { nom: 'Élèves par classe – écart type', color: PALETTE[1], values: g.map(x => x[s].stats.taille.et) }, { nom: 'Classes par école – moyenne', color: PALETTE[2], values: g.map(x => x[s].stats.classes.moy) }]),
      table(c, s, '4. Équipements (écoles qui en disposent / écoles ayant répondu)', tete2(c, EQUIP.map(([, l]) => l), ['Écoles', '%']),
        (x) => EQUIP.flatMap(([k]) => [[`${x.equip[k][0]}/${x.equip[k][1]}`], [pc(x.p_equip[k]), 'calc']])),
      courbe('Équipements (% des écoles)', labels, EQUIP.map(([k, l], i) => ({ nom: l, color: PALETTE[i % PALETTE.length], values: g.map(x => x[s].p_equip[k]) }))),
      table(c, s, "5. Sources d'eau potable et d'électricité (nombre d'écoles)", tete(c, [...EAU.map(([, l]) => 'Eau : ' + l), ...ELEC.map(([, l]) => 'Élec. : ' + l)]),
        (x) => [...EAU.map(([k]) => [x.eau[k], k === 'Puits' ? 'calc' : '']), ...ELEC.map(([k]) => [x.elec[k]])]),
      courbe("Sources d'eau (nombre d'écoles)", labels, EAU.map(([k, l], i) => ({ nom: l, color: PALETTE[i], values: g.map(x => x[s].eau[k]) }))),
    ];
  }
  function draw() {
    LAST = st;
    toolbar.replaceChildren(
      ...(u.role !== 'CP' ? [h('div', { class: 'seg' }, [['zone', '📍 Zone (par école)'], ['cs', '🏛 Circonscription (par zone)']].map(([k, l]) => h('button', { class: 'btn sm' + (st.level === k ? ' primary' : ''), onclick: () => { st.level = k; draw(); } }, l)))] : []),
      sel('source', Object.entries(SOURCES), '220px'), sel('annee', years.map(y => [y, 'Année ' + y]), '170px'),
      st.level === 'cs' ? sel('cs', csArr.map(c => [c.code, c.label])) : sel('zone', zoneArr.map(z => [z.code, z.label]), '300px'),
      sel('statut', Object.entries(E.STATUT_FILTERS)),
      h('button', { class: 'btn sm', onclick: exporter }, '⬇ Excel'), h('button', { class: 'btn sm', onclick: () => window.print() }, '🖨 Imprimer'));
    const c = calcul();
    holder.replaceChildren(h('p', { class: 'sub' }, `${SOURCES[st.source]} (classes, salles, structure, élèves, cantine, lavage des mains, gestion) et fiche de chaque école (eau et sa source, électricité et sa source, latrines, clôture : à renseigner dans « Écoles »). Écart type de la population.`));
    for (const [s, lib, coul] of [['pub', 'Secteur public', 'var(--green-d)'], ['prv', 'Secteur privé (à part)', '#8e44ad']]) {
      const t = c.tot[s]; if (!t.ecoles) continue;
      holder.append(h('h3', { style: { margin: '18px 0 6px', color: coul } }, `${lib} — ${t.ecoles} école(s) · ${t.ouv} classe(s) ouverte(s) · ${t.struct.multi} multigrade(s) · ${t.eau.Puits} école(s) avec puits`), ...secteur(c, s));
    }
    ctx.status(`${c.tot.pub.fiches + c.tot.prv.fiches} fiche(s) — ${st.annee}`);
  }
  function exporter() {
    const tabs = [...holder.querySelectorAll('h3, h4, table')].map(t => t.outerHTML).join('');
    const html = `<html><head><meta charset="utf-8"><style>table{border-collapse:collapse;font-family:Arial;font-size:10pt}td,th{border:1px solid #444;padding:3px 6px}th{background:#006633;color:#fff}</style></head><body><h3>Écoles : structure et équipements — ${SOURCES[st.source]} — ${st.annee}</h3>${tabs}</body></html>`;
    download(new Blob(['﻿' + html], { type: 'application/vnd.ms-excel' }), clean('Ecoles_structure_' + st.annee) + '.xls');
  }
  draw();
}
