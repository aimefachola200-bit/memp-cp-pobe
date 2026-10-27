/* République du Bénin — MEMP — Vue : infrastructures et mobilier consolidés (fiches de rentrée et de fin d'année)
   Par zone pédagogique (une ligne par école) ou par circonscription (une ligne par zone), secteur public et privé à part :
   salles de classe par nature, salles existantes / utilisées, élèves par salle, lavage des mains, mobilier du primaire
   (places assises, déficit), mobilier de la maternelle, manuels par élève. Courbes et Excel.
   Conception : Maître Aimé FACHE */
import { h, download, clean, currentSchoolYear } from './util.js';
import { htmlVersXlsx } from './xlsx.js';
import { bannerBytes } from './pdf.js';
import { scoped } from './data.js';
import { sectionsFor, gridValue } from './schema.js';
import * as E from './effectifs-schema.js';
import { svgCourbe, PALETTE } from './effectifs-charts.js';

const CLASSES = ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'];
export const SALLES = [['a', 'Matériaux définitifs'], ['b', 'Matériaux provisoires'], ['sans', 'Sans mur et sans toit'], ['constr', 'En construction']];
export const MOB_EP = [['tc', 'Tables + chaises (1 place)'], ['tb2', 'Table-bancs 2 places'], ['tb3', 'Table-bancs 3 places et +'], ['bm', 'Bureaux du maître']];
export const MOB_EM = [['tenf', 'Tables pour enfants'], ['chenf', 'Chaises pour enfants'], ['nattes', 'Nattes'], ['tjeux', 'Tables de jeux'], ['tabl', 'Tablettes'], ['bur', 'Bureaux enseignants'], ['arm', 'Armoires / placards']];
export const MANUELS = [['fr', 'Manuels de français'], ['maths', 'Manuels de maths']];
const SOURCES = { RENTREE: 'Rapport de rentrée', FIN: "Fiche de fin d'année" };
let LAST = null;

const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };
const ratio = (a, b, d = 1) => (b ? Math.round(a / b * 10 ** d) / 10 ** d : null);
const f1 = (v, d = 1) => (v === null || v === undefined ? '—' : v.toFixed(d).replace('.', ','));
const pc = (v) => (v === null || v === undefined ? '—' : f1(v) + ' %');

export function vide() {
  return { ecoles: 0, ep: 0, em: 0, fiches: 0, eleves_ep: 0, eleves_em: 0, salles: Object.fromEntries(SALLES.map(([k]) => [k, 0])), exist: 0, util: 0,
    lavage: [0, 0], mob_ep: Object.fromEntries(MOB_EP.map(([k]) => [k, 0])), mob_em: Object.fromEntries(MOB_EM.map(([k]) => [k, 0])), man: { fr: 0, maths: 0 } };
}
/** Ajoute une école (et sa fiche de rentrée / fin d'année, s'il y en a une) à un agrégat. */
export function ajouter(x, school, fiche) {
  const em = school.cycle === 'Maternelle';
  x.ecoles++; x[em ? 'em' : 'ep']++;
  if (!fiche) return;
  x.fiches++;
  const S = sectionsFor(fiche.kind), g = (id) => S.find(s => s.id === id), d = fiche.data || {};
  const gv = (id, r, gr, c) => { const grid = g(id); return grid ? num(gridValue(d, grid, r, gr, c)) : 0; };
  for (const [k] of SALLES) x.salles[k] += gv('infra', 'salles', 'g', k);
  x.exist += num(d.salles_exist); x.util += num(d.salles_util);
  const lav = String(d.lavage || '').toLowerCase(); if (lav) { x.lavage[1]++; if (lav === 'oui') x.lavage[0]++; }
  const eff = g('eff');
  if (em) {
    for (const [k] of MOB_EM) x.mob_em[k] += gv('mob', 'n', k, 'n');
    for (const sx of ['G', 'F']) for (const c of ['pet', 'gra']) x.eleves_em += num(gridValue(d, eff, 'debut', c, sx));
  } else {
    for (const [k] of MOB_EP) for (const c of CLASSES) x.mob_ep[k] += gv('mob', k, c, 'n');
    for (const [k] of MANUELS) for (const c of CLASSES) x.man[k] += gv('man', k, c, 'n');
    for (const sx of ['G', 'F']) for (const c of CLASSES) x.eleves_ep += num(gridValue(d, eff, 'debut', c, sx));
  }
}
export function indicateurs(x) {
  const s = x.salles; x.salles_tot = s.a + s.b + s.sans; x.p_def = ratio(100 * s.a, x.salles_tot);
  x.eleves = x.eleves_ep + x.eleves_em; x.el_salle = ratio(x.eleves, x.util || x.salles_tot);
  const m = x.mob_ep; x.places_ep = m.tc + 2 * m.tb2 + 3 * m.tb3; x.deficit_ep = Math.max(0, x.eleves_ep - x.places_ep); x.el_place_ep = ratio(x.eleves_ep, x.places_ep, 2);
  x.places_em = x.mob_em.chenf; x.deficit_em = Math.max(0, x.eleves_em - x.places_em); x.el_place_em = ratio(x.eleves_em, x.places_em, 2);
  x.man_el = { fr: ratio(x.man.fr, x.eleves_ep, 2), maths: ratio(x.man.maths, x.eleves_ep, 2) };
  x.p_lavage = ratio(100 * x.lavage[0], x.lavage[1]);
  return x;
}

export async function render(id, ctx) {
  const u = ctx.user;
  ctx.title('Infrastructures et mobilier', "Consolidation des fiches de rentrée et de fin d'année — par école, zone pédagogique et circonscription");
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
  let dernier = null;

  const sel = (k, opts, w = '230px') => h('select', { class: 'search', style: { maxWidth: w }, onchange: (e) => { st[k] = e.target.value; draw(); } }, opts.map(([v, l]) => h('option', { value: v, selected: st[k] === v }, l)));
  function calcul() {
    const ecs = schools.filter(s => (st.level === 'cs' ? (s.codeCs || '') === st.cs : (s.codeZone || '') === st.zone));
    const kinds = { Maternelle: 'EM_' + st.source, Primaire: 'EP_' + st.source };
    const grp = new Map(), tot = { nom: 'TOTAL', pub: vide(), prv: vide() };
    for (const s of ecs.sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr'))) {
      const k = st.level === 'cs' ? (zones.get(s.codeZone || '')?.label || 'Sans zone') : s.nom;
      if (!grp.has(k)) grp.set(k, { nom: k, pub: vide(), prv: vide() });
      const f = fiches.find(x => x.schoolId === s.id && x.annee === st.annee && x.kind === kinds[s.cycle] && E.keepStatut(st.statut, x));
      const sec = E.estPrive(s) ? 'prv' : 'pub';
      ajouter(grp.get(k)[sec], s, f); ajouter(tot[sec], s, f);
    }
    const g = [...grp.values()]; for (const x of [...g, tot]) { indicateurs(x.pub); indicateurs(x.prv); }
    return { grp: g, tot, lib: st.level === 'cs' ? 'Zone pédagogique' : 'École' };
  }
  function table(c, s, titre, ent, cells, filtre) {
    const rows = [...c.grp, c.tot].filter(g => g[s].ecoles && (!filtre || filtre(g[s])));
    if (!rows.length) return null;
    return h('div', { class: 'card eff-wrap' }, h('h4', {}, titre), h('div', { class: 'tbl-wrap' }, h('table', { class: 'eff' },
      h('thead', {}, h('tr', {}, h('th', {}, c.lib), ...ent.map(t => h('th', {}, t)))),
      h('tbody', {}, rows.map(g => h('tr', { class: g === c.tot ? 'eff-stat' : '' }, h('td', { class: 'eff-l' }, g.nom), ...cells(g[s]).map(([v, cl]) => h('td', { class: 'num ' + (cl || '') }, String(v)))))))));
  }
  const courbe = (titre, labels, series) => { const d = h('div', { class: 'card-courbe' }); d.innerHTML = svgCourbe({ titre, labels, series: series.map(x => ({ ...x, values: x.values.map(v => v ?? 0) })) }); return d; };
  function secteur(c, s) {
    const g = c.grp.filter(x => x[s].ecoles), labels = g.map(x => x.nom), out = [];
    out.push(table(c, s, '1. Salles de classe', [...SALLES.map(([, l]) => l), 'Total (hors construction)', 'Existantes', 'Utilisées', '% définitifs', 'Élèves', 'Élèves par salle', 'Lavage des mains (%)'],
      (x) => [...SALLES.map(([k]) => [x.salles[k]]), [x.salles_tot, 'calc'], [x.exist], [x.util], [pc(x.p_def), 'calc'], [x.eleves], [f1(x.el_salle), 'calc'], [pc(x.p_lavage), 'calc']]));
    if (labels.length) out.push(courbe('Salles de classe', labels, [{ nom: 'Définitifs', color: PALETTE[2], values: g.map(x => x[s].salles.a) },
      { nom: 'Provisoires', color: PALETTE[3], values: g.map(x => x[s].salles.b) }, { nom: 'Sans mur ni toit', color: PALETTE[1], values: g.map(x => x[s].salles.sans) }]));
    out.push(table(c, s, '2. Mobilier du primaire et places assises', [...MOB_EP.map(([, l]) => l), 'Places assises', 'Élèves', 'Déficit de places', 'Élèves par place'],
      (x) => [...MOB_EP.map(([k]) => [x.mob_ep[k]]), [x.places_ep, 'calc'], [x.eleves_ep], [x.deficit_ep, 'calc'], [f1(x.el_place_ep, 2), 'calc']], (x) => x.ep));
    if (g.some(x => x[s].ep)) out.push(courbe('Places assises (primaire)', labels, [{ nom: 'Élèves', color: PALETTE[0], values: g.map(x => x[s].eleves_ep) },
      { nom: 'Places assises', color: PALETTE[2], values: g.map(x => x[s].places_ep) }, { nom: 'Déficit', color: PALETTE[1], values: g.map(x => x[s].deficit_ep) }]));
    out.push(table(c, s, '3. Mobilier de la maternelle', [...MOB_EM.map(([, l]) => l), 'Enfants', 'Déficit de chaises', 'Enfants par chaise'],
      (x) => [...MOB_EM.map(([k]) => [x.mob_em[k]]), [x.eleves_em], [x.deficit_em, 'calc'], [f1(x.el_place_em, 2), 'calc']], (x) => x.em));
    out.push(table(c, s, '4. Manuels du primaire', [...MANUELS.map(([, l]) => l), 'Élèves', ...MANUELS.map(([, l]) => l + ' par élève')],
      (x) => [...MANUELS.map(([k]) => [x.man[k]]), [x.eleves_ep], ...MANUELS.map(([k]) => [f1(x.man_el[k], 2), 'calc'])], (x) => x.ep));
    return out.filter(Boolean);
  }
  function draw() {
    LAST = st;
    toolbar.replaceChildren(
      ...(u.role !== 'CP' ? [h('div', { class: 'seg' }, [['zone', '\uE02C Zone (par école)'], ['cs', '\uE023 Circonscription (par zone)']].map(([k, l]) => h('button', { class: 'btn sm' + (st.level === k ? ' primary' : ''), onclick: () => { st.level = k; draw(); } }, l)))] : []),
      sel('source', Object.entries(SOURCES), '220px'), sel('annee', years.map(y => [y, 'Année ' + y]), '170px'),
      st.level === 'cs' ? sel('cs', csArr.map(c => [c.code, c.label])) : sel('zone', zoneArr.map(z => [z.code, z.label]), '300px'),
      sel('statut', Object.entries(E.STATUT_FILTERS)),
      h('button', { class: 'btn sm', onclick: exporter }, '\uE009 Excel'), h('button', { class: 'btn sm', onclick: () => window.print() }, '\uE008 Imprimer'));
    const c = calcul(); dernier = c;
    holder.replaceChildren(h('p', { class: 'sub' }, `${SOURCES[st.source]} — places assises = tables + chaises × 1 + table-bancs 2 places × 2 + table-bancs 3 places et plus × 3 ; déficit = élèves (début d'année) − places assises.`));
    for (const [s, lib, coul] of [['pub', 'Secteur public', 'var(--green-d)'], ['prv', 'Secteur privé (à part)', '#8e44ad']]) {
      const t = c.tot[s]; if (!t.ecoles) continue;
      holder.append(h('h3', { style: { margin: '18px 0 6px', color: coul } }, `${lib} — ${t.fiches}/${t.ecoles} fiche(s) · ${t.salles_tot} salle(s) · ${t.places_ep} places assises (déficit ${t.deficit_ep})`), ...secteur(c, s));
    }
    ctx.status(`${c.tot.pub.fiches + c.tot.prv.fiches} fiche(s) consolidée(s) — ${st.annee}`);
  }
  async function exporter() {
    if (!dernier) return;
    const tabs = [...holder.querySelectorAll('table')].map(t => t.outerHTML).join('<br>');
    const html = `<html><head><meta charset="utf-8"><style>table{border-collapse:collapse;font-family:Arial;font-size:10pt}td,th{border:1px solid #444;padding:3px 6px}th{background:#006633;color:#fff}</style></head><body><h3>Infrastructures et mobilier — ${SOURCES[st.source]} — ${st.annee}</h3>${tabs}</body></html>`;
    htmlVersXlsx(html, 'Tableau', await bannerBytes().catch(() => null)).then(b => download(b, clean('Infrastructures_mobilier_' + st.annee) + '.xlsx'));
  }
  draw();
}
