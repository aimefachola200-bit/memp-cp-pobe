/* République du Bénin — MEMP — Vue : CEP, candidats et réussite selon les rubriques des fiches
   Source : fiche de fin d'année du primaire, rubrique « Résultats au CEP » (inscrits, ont composé, admis par sexe, dont
   enfants handicapés) ; à défaut, rapport de fin d'année du CM2 (décisions des apprenants). Par zone pédagogique (une
   ligne par école) ou par circonscription (une ligne par zone), secteur public et privé à part : effectifs par sexe et
   pourcentages, parité filles / garçons, taux de présence, taux de réussite par sexe, écart filles − garçons, moyenne et
   écart type des taux des écoles. Graphiques au choix, Excel.
   Conception : Maître Aimé FACHE */
import { h, download, clean, currentSchoolYear } from './util.js';
import { htmlVersXlsx } from './xlsx.js';
import { bannerBytes } from './pdf.js';
import { scoped } from './data.js';
import { sectionsFor, gridValue } from './schema.js';
import { reportStats } from './export.js';
import * as E from './effectifs-schema.js';
import { svgCourbe, PALETTE } from './effectifs-charts.js';

let LAST = null;
const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };
const tx = (a, b) => (b ? Math.round(1000 * a / b) / 10 : null);
const f2 = (v, d = 2) => (v === null || v === undefined ? '—' : (Math.round(v * 10 ** d) / 10 ** d).toString().replace('.', ','));
const pc = (v) => (v === null || v === undefined ? '—' : f2(v, 1) + ' %');

/** CEP d'une école : depuis la fiche de fin d'année (rubrique CEP), sinon le rapport du CM2. */
export function cepEcole(fiche, rapportCM2) {
  const r = { source: null, insc: [0, 0], comp: [0, 0], adm: [0, 0], eh: { insc: 0, adm: 0 } };
  if (fiche) {
    const grid = sectionsFor(fiche.kind).find(s => s.id === 'cep'), d = fiche.data || {};
    if (grid) {
      for (const [k] of [['insc'], ['comp'], ['adm']]) r[k] = [num(gridValue(d, grid, k, 'cep', 'G')), num(gridValue(d, grid, k, 'cep', 'F'))];
      r.eh = { insc: num(gridValue(d, grid, 'insc', 'eh', 'T')) || num(gridValue(d, grid, 'insc', 'eh', 'G')) + num(gridValue(d, grid, 'insc', 'eh', 'F')),
        adm: num(gridValue(d, grid, 'adm', 'eh', 'T')) || num(gridValue(d, grid, 'adm', 'eh', 'G')) + num(gridValue(d, grid, 'adm', 'eh', 'F')) };
      if ([...r.insc, ...r.comp, ...r.adm].some(Boolean)) { r.source = 'fiche'; return r; }
    }
  }
  if (rapportCM2) {
    const S = reportStats(rapportCM2.rows || []);
    if (S.inscrits.T) { r.insc = [S.inscrits.G, S.inscrits.F]; r.comp = [S.compose.G, S.compose.F]; r.adm = [S.seuil.G, S.seuil.F]; r.source = 'cm2'; }
  }
  return r;
}
export function vide() { return { ecoles: 0, fiches: 0, insc: [0, 0], comp: [0, 0], adm: [0, 0], eh: { insc: 0, adm: 0 }, _t: [], _g: [], _f: [] }; }
export function ajouter(x, c) {
  x.ecoles++; if (!c.source) return; x.fiches++;
  for (const k of ['insc', 'comp', 'adm']) { x[k][0] += c[k][0]; x[k][1] += c[k][1]; }
  x.eh.insc += c.eh.insc; x.eh.adm += c.eh.adm;
  const base = c.comp[0] + c.comp[1] ? c.comp : c.insc;
  if (c.adm[0] + c.adm[1] || c.comp[0] + c.comp[1]) {
    if (base[0] + base[1]) x._t.push(100 * (c.adm[0] + c.adm[1]) / (base[0] + base[1]));
    if (base[0]) x._g.push(100 * c.adm[0] / base[0]);
    if (base[1]) x._f.push(100 * c.adm[1] / base[1]);
  }
}
function disp(v) {
  if (!v.length) return { n: 0, moy: null, et: null, min: null, max: null, cent: 0, sous50: 0 };
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return { n: v.length, moy: m, et: Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length), min: Math.min(...v), max: Math.max(...v), cent: v.filter(t => t >= 99.95).length, sous50: v.filter(t => t < 50).length };
}
export function indicateurs(x) {
  const T = (a) => [a[0], a[1], a[0] + a[1]];
  x.r = { insc: T(x.insc), comp: T(x.comp), adm: T(x.adm) };
  const base = x.r.comp[2] ? x.r.comp : x.r.insc;
  x.p_g = tx(x.insc[0], x.r.insc[2]); x.p_f = tx(x.insc[1], x.r.insc[2]); x.parite = x.insc[0] ? Math.round(100 * x.insc[1] / x.insc[0]) / 100 : null;
  x.presence = x.r.comp[2] ? [0, 1, 2].map(j => tx(x.r.comp[j], x.r.insc[j])) : [null, null, null];
  x.reussite = x.r.adm[2] || x.r.comp[2] ? [0, 1, 2].map(j => tx(x.r.adm[j], base[j])) : [null, null, null];
  x.ecart = x.reussite[0] !== null && x.reussite[1] !== null ? Math.round(10 * (x.reussite[1] - x.reussite[0])) / 10 : null;
  x.disp = { T: disp(x._t), G: disp(x._g), F: disp(x._f) };
  return x;
}

export async function render(id, ctx) {
  const u = ctx.user;
  ctx.title('CEP : candidats et réussite', "Selon la rubrique « Résultats au CEP » de la fiche de fin d'année (à défaut, le rapport du CM2)");
  const [schools, fiches, reports] = await Promise.all([scoped('schools', u), scoped('fiches', u), scoped('classReports', u)]);
  const ep = schools.filter(s => s.cycle === 'Primaire');
  const years = [...new Set([...fiches.map(f => f.annee).filter(Boolean), ...reports.map(r => r.annee).filter(Boolean), currentSchoolYear()])].sort().reverse();
  const zones = new Map(), csList = new Map();
  for (const s of ep) {
    const z = s.codeZone || ''; if (!zones.has(z)) zones.set(z, { code: z, label: z ? `Zone ${s.numZone || z}${s.nomCs ? ' — CS ' + s.nomCs : ''}` : 'Sans zone' });
    const c = s.codeCs || ''; if (!csList.has(c)) csList.set(c, { code: c, label: s.nomCs ? 'CS ' + s.nomCs : (c || 'Sans CS') });
  }
  const zoneArr = [...zones.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr', { numeric: true })), csArr = [...csList.values()];
  const st = LAST && years.includes(LAST.annee) ? LAST : { annee: years[0], level: u.role === 'CP' ? 'zone' : 'cs', zone: zoneArr[0]?.code ?? '', cs: csArr[0]?.code ?? '', statut: 'all' };
  const toolbar = h('div', { class: 'tbl-tools no-print' }), holder = h('div');
  ctx.el.append(toolbar, holder);
  const sel = (k, opts, w = '230px') => h('select', { class: 'search', style: { maxWidth: w }, onchange: (e) => { st[k] = e.target.value; draw(); } }, opts.map(([v, l]) => h('option', { value: v, selected: st[k] === v }, l)));
  function calcul() {
    const ecs = ep.filter(s => (st.level === 'cs' ? (s.codeCs || '') === st.cs : (s.codeZone || '') === st.zone));
    const grp = new Map(), tot = { nom: 'TOTAL', pub: vide(), prv: vide() };
    for (const s of ecs.sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr'))) {
      const k = st.level === 'cs' ? (zones.get(s.codeZone || '')?.label || 'Sans zone') : s.nom;
      if (!grp.has(k)) grp.set(k, { nom: k, pub: vide(), prv: vide() });
      const f = fiches.find(x => x.schoolId === s.id && x.annee === st.annee && x.kind === 'EP_FIN' && E.keepStatut(st.statut, x));
      const r = reports.find(x => x.schoolId === s.id && x.annee === st.annee && x.cours === 'CM2' && E.keepStatut(st.statut, x));
      const c = cepEcole(f, r), sec = E.estPrive(s) ? 'prv' : 'pub';
      ajouter(grp.get(k)[sec], c); ajouter(tot[sec], c);
    }
    const g = [...grp.values()]; for (const x of [...g, tot]) { indicateurs(x.pub); indicateurs(x.prv); }
    return { grp: g, tot, lib: st.level === 'cs' ? 'Zone pédagogique' : 'École' };
  }
  function table(c, s, titre, head, cells) {
    const rows = [...c.grp, c.tot].filter(g => g[s].ecoles);
    return h('div', { class: 'card eff-wrap' }, h('h4', {}, titre), h('div', { class: 'tbl-wrap' }, h('table', { class: 'eff' }, h('thead', {}, head),
      h('tbody', {}, rows.map(g => h('tr', { class: g === c.tot ? 'eff-stat' : '' }, h('td', { class: 'eff-l' }, g.nom), ...cells(g[s]).map(([v, cl]) => h('td', { class: 'num ' + (cl || '') }, String(v)))))))));
  }
  const tete2 = (c, grp) => [h('tr', {}, h('th', { rowspan: 2 }, c.lib), ...grp.map(([t, sous]) => (sous ? h('th', { colspan: sous.length }, t) : h('th', { rowspan: 2 }, t)))),
    h('tr', {}, ...grp.filter(([, sous]) => sous).flatMap(([, sous]) => sous.map(t => h('th', {}, t))))];
  const GFT = ['G', 'F', 'T'];
  const courbe = (titre, labels, series) => { const d = h('div', { class: 'card-courbe' }); d.innerHTML = labels.length ? svgCourbe({ titre, labels, series: series.map(x => ({ ...x, values: x.values.map(v => v ?? 0) })) }) : ''; return d; };
  function secteur(c, s) {
    const g = c.grp.filter(x => x[s].ecoles), labels = g.map(x => x.nom);
    return [
      table(c, s, '1. Candidats au CEP : effectifs par sexe et pourcentages', tete2(c, [['Écoles'], ['Inscrits', GFT], ['Répartition', ['% G', '% F', 'Parité F/G']], ['Ont composé', GFT], ['Taux de présence', GFT]]),
        (x) => [[`${x.fiches}/${x.ecoles}`], ...x.r.insc.map(v => [v]), [pc(x.p_g), 'calc'], [pc(x.p_f), 'calc'], [f2(x.parite), 'calc'], ...x.r.comp.map(v => [v]), ...x.presence.map(v => [pc(v), 'calc'])]),
      courbe('Candidats au CEP', labels, [{ nom: 'Garçons', color: PALETTE[0], values: g.map(x => x[s].insc[0]) }, { nom: 'Filles', color: PALETTE[1], values: g.map(x => x[s].insc[1]) },
        { nom: 'Ont composé', color: PALETTE[4], values: g.map(x => x[s].r.comp[2]) }]),
      table(c, s, '2. Réussite au CEP', tete2(c, [['Admis', GFT], ['Taux de réussite', GFT], ['Écart F − G (points)'], ['Dont enfants handicapés', ['Inscrits', 'Admis']]]),
        (x) => [...x.r.adm.map(v => [v]), ...x.reussite.map(v => [pc(v), 'calc']), [f2(x.ecart, 1)], [x.eh.insc], [x.eh.adm]]),
      courbe('Taux de réussite au CEP (%)', labels, [{ nom: 'Garçons', color: PALETTE[0], values: g.map(x => x[s].reussite[0]) },
        { nom: 'Filles', color: PALETTE[1], values: g.map(x => x[s].reussite[1]) }, { nom: 'Ensemble', color: PALETTE[2], values: g.map(x => x[s].reussite[2]) }]),
      table(c, s, '3. Dispersion des taux de réussite des écoles', tete2(c, [['Ensemble', ['Moyenne', 'Écart type', 'Min', 'Max']], ['Garçons', ['Moyenne', 'Écart type']], ['Filles', ['Moyenne', 'Écart type']], ['Écoles à 100 %'], ['Écoles sous 50 %']]),
        (x) => [[pc(x.disp.T.moy), 'calc'], [f2(x.disp.T.et, 1), 'calc'], [pc(x.disp.T.min)], [pc(x.disp.T.max)], [pc(x.disp.G.moy), 'calc'], [f2(x.disp.G.et, 1)], [pc(x.disp.F.moy), 'calc'], [f2(x.disp.F.et, 1)], [x.disp.T.cent], [x.disp.T.sous50]]),
      courbe('Moyenne et écart type des taux des écoles', labels, [{ nom: 'Moyenne (%)', color: PALETTE[2], values: g.map(x => x[s].disp.T.moy) }, { nom: 'Écart type', color: PALETTE[4], values: g.map(x => x[s].disp.T.et) }]),
    ];
  }
  function draw() {
    LAST = st;
    toolbar.replaceChildren(
      ...(u.role !== 'CP' ? [h('div', { class: 'seg' }, [['zone', '📍 Zone (par école)'], ['cs', '🏛 Circonscription (par zone)']].map(([k, l]) => h('button', { class: 'btn sm' + (st.level === k ? ' primary' : ''), onclick: () => { st.level = k; draw(); } }, l)))] : []),
      sel('annee', years.map(y => [y, 'Année ' + y]), '170px'), st.level === 'cs' ? sel('cs', csArr.map(c => [c.code, c.label])) : sel('zone', zoneArr.map(z => [z.code, z.label]), '300px'),
      sel('statut', Object.entries(E.STATUT_FILTERS)), h('button', { class: 'btn sm', onclick: exporter }, '⬇ Excel'), h('button', { class: 'btn sm', onclick: () => window.print() }, '🖨 Imprimer'));
    const c = calcul();
    holder.replaceChildren(h('p', { class: 'sub' }, "Rubrique « Résultats au CEP » de la fiche de fin d'année (inscrits, ont composé, admis par sexe, dont enfants handicapés) ; à défaut, rapport de fin d'année du CM2. Taux de réussite = admis ÷ ont composé ; parité F/G = filles ÷ garçons ; écart type de la population."));
    for (const [s, lib, coul] of [['pub', 'Secteur public', 'var(--green-d)'], ['prv', 'Secteur privé (à part)', '#8e44ad']]) {
      const t = c.tot[s]; if (!t.ecoles) continue;
      holder.append(h('h3', { style: { margin: '18px 0 6px', color: coul } }, `${lib} — ${t.r.insc[2]} inscrits (${t.insc[0]} G · ${t.insc[1]} F) · ${t.r.adm[2]} admis · réussite ${pc(t.reussite[2])}`), ...secteur(c, s));
    }
    ctx.status(`${c.tot.pub.fiches + c.tot.prv.fiches} école(s) renseignée(s) — ${st.annee}`);
  }
  async function exporter() {
    const tabs = [...holder.querySelectorAll('h3, h4, table')].map(t => t.outerHTML).join('');
    htmlVersXlsx('<html><head><meta charset="utf-8"><style>table{border-collapse:collapse;font-family:Arial;font-size:10pt}td,th{border:1px solid #444;padding:3px 6px}th{background:#006633;color:#fff}</style></head><body><h3>CEP : candidats et réussite — ' + st.annee + '</h3>' + tabs + '</body></html>', 'Tableau', await bannerBytes().catch(() => null)).then(b => download(b, clean('CEP_' + st.annee) + '.xlsx'));
  }
  draw();
}
