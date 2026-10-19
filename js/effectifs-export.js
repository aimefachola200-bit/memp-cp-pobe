/* République du Bénin — MEMP — Effectifs des apprenants : exports PDF / Excel et import Excel.
   Le même modèle de tableau alimente le PDF et l'Excel ; les feuilles « Saisie EP » / « Saisie EM » servent à l'import et à l'export réimportable. */
import { newPdf, bannerBytes, GREY, LIGHT } from './pdf.js';
import { XlsxBook } from './xlsx.js';
import { norm } from './util.js';
import { SEXES, ENS, SCHEMAS, schemaOf, rowOf, rowCols, colLabel, applies, dataKey, computeValues, show, inputRows, ageSeries, classSummary } from './effectifs-schema.js';
import { COULEURS, PALETTE } from './effectifs-charts.js';

const NA = [0.9, 0.9, 0.9];
const SX3 = ['G', 'F', 'T'];

/* ---------------- Modèle de tableau (commun PDF / Excel) ---------------- */
export function blockModel(S, block, v) {
  const cols = block.cols, ncols = 1 + cols.length * 3;
  const head = [{ t: '', c: 0, s: 1, r: 0, rs: 2 }];
  cols.forEach((c, i) => {
    head.push({ t: colLabel(S, c), c: 1 + i * 3, s: 3, r: 0, rs: 1 });
    SX3.forEach((sx, j) => head.push({ t: sx === 'T' ? 'T' : S.sexLabel[sx], c: 1 + i * 3 + j, s: 1, r: 1, rs: 1 }));
  });
  const rows = [];
  for (const grp of block.groups) {
    rows.push([{ kind: 'group', t: grp.title, s: ncols }]);
    for (const rk of grp.rows) {
      const row = rowOf(S, rk), isCalc = !!row.calc, cells = [{ kind: 'label', t: row.l, calc: isCalc }];
      for (const c of cols) for (const sx of SX3) {
        if (!applies(S, row, c, sx)) { cells.push({ kind: 'na', t: '' }); continue; }
        const val = show(S, v, rk, c, sx);
        cells.push({ kind: (isCalc || c === ENS || sx === 'T') ? 'calc' : 'val', t: val === null ? '' : val });
      }
      rows.push(cells);
    }
  }
  return { title: block.title, head, headRows: 2, ncols, rows, widths: cols.length === 1 ? [8, 1, 1, 1] : [3.6, ...new Array(cols.length * 3).fill(1)] };
}

export function drawModel(pdf, m) {
  const many = m.ncols > 14;
  const rows = m.rows.map(r => r.map(c => {
    if (c.kind === 'group') return { t: c.t, s: c.s, b: true, f: LIGHT };
    if (c.kind === 'label') return { t: c.t, b: c.calc, f: c.calc ? GREY : undefined };
    if (c.kind === 'na') return { t: '', f: NA };
    return { t: String(c.t), a: 'center', b: c.kind === 'calc', f: c.kind === 'calc' ? GREY : undefined };
  }));
  pdf.heading(m.title);
  pdf.table({ widths: m.widths, headRows: m.headRows, head: m.head, rows, size: many ? 6.3 : 7.5, headSize: many ? 6.3 : 7.2, minH: 12 });
}

export function writeModel(ws, r, m) {
  ws.set(r, 0, m.title, 'bold'); r++;
  m.head.forEach(c => {
    ws.set(r + (c.r || 0), c.c, c.t, 'th');
    for (let rr = 0; rr < (c.rs || 1); rr++) for (let cc = 0; cc < (c.s || 1); cc++) if (rr || cc) ws.set(r + (c.r || 0) + rr, c.c + cc, '', 'th');
    ws.merge(r + (c.r || 0), c.c, r + (c.r || 0) + (c.rs || 1) - 1, c.c + (c.s || 1) - 1);
  });
  r += m.headRows;
  for (const row of m.rows) {
    row.forEach((c, i) => {
      if (c.kind === 'group') { for (let k = 0; k < c.s; k++) ws.set(r, k, k === 0 ? c.t : '', 'section'); }
      else ws.set(r, i, c.t, c.kind === 'label' ? 'label' : c.kind === 'calc' ? 'calc' : c.kind === 'na' ? 'calc' : 'tdn');
    });
    r++;
  }
  return r + 1;
}

/* ---------------- Statistiques par classe et courbes d'âge ---------------- */
const hex = (c) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
const joli = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
/** Courbe tracée directement dans le PDF (lignes, points, axes, légende) */
export function drawChart(pdf, { titre, labels, series, h = 190 }) {
  pdf.ensure(h + 12);
  const P = pdf.page, f = pdf.font, b = pdf.bold, xL = pdf.M + 46, xR = pdf.M + pdf.cw - 10, yT = pdf.y - 26, yB = pdf.y - h + 46, ih = yT - yB;
  const top = joli(Math.max(1, ...series.flatMap(s => s.values))), X = (i) => xL + (labels.length < 2 ? (xR - xL) / 2 : i * (xR - xL) / (labels.length - 1)), Y = (v) => yB + (v / top) * ih;
  const t = pdf.clean(titre); P.drawText(t, { x: pdf.M + (pdf.cw - b.widthOfTextAtSize(t, 9.5)) / 2, y: pdf.y - 11, size: 9.5, font: b });
  for (let k = 0; k <= 5; k++) { const v = top * k / 5, yy = Y(v), lab = String(Math.round(v)); P.drawLine({ start: { x: xL, y: yy }, end: { x: xR, y: yy }, thickness: 0.4, color: pdf.rgb([0.82, 0.86, 0.9]) }); P.drawText(lab, { x: xL - 5 - f.widthOfTextAtSize(lab, 6.5), y: yy - 2.3, size: 6.5, font: f }); }
  P.drawLine({ start: { x: xL, y: yB }, end: { x: xR, y: yB }, thickness: 0.8, color: pdf.rgb([0.5, 0.55, 0.6]) });
  labels.forEach((l, i) => { const lab = pdf.clean(l), tw = f.widthOfTextAtSize(lab, 6.3); P.drawText(lab, { x: X(i) - tw / 2, y: yB - 10, size: 6.3, font: f }); });
  series.forEach((se) => {
    const col = pdf.rgb(hex(se.color));
    for (let i = 1; i < se.values.length; i++) P.drawLine({ start: { x: X(i - 1), y: Y(se.values[i - 1]) }, end: { x: X(i), y: Y(se.values[i]) }, thickness: 1.6, color: col, ...(se.tirets ? { dashArray: [4, 3] } : {}) });
    se.values.forEach((v, i) => P.drawCircle({ x: X(i), y: Y(v), size: 1.9, color: col }));
  });
  let lx = xL; const ly = pdf.y - h + 12;
  series.forEach((se) => { P.drawRectangle({ x: lx, y: ly, width: 12, height: 3.5, color: pdf.rgb(hex(se.color)) }); const nm = pdf.clean(se.nom); P.drawText(nm, { x: lx + 16, y: ly - 1, size: 7, font: f }); lx += 30 + f.widthOfTextAtSize(nm, 7); });
  pdf.y -= h + 6;
}
const serieSexe = (S, v) => { const a = ageSeries(S, v); return { labels: a.labels, series: [{ nom: S.sexName.G, color: COULEURS.G, values: a.G }, { nom: S.sexName.F, color: COULEURS.F, values: a.F }, { nom: 'Ensemble', color: COULEURS.T, values: a.T, tirets: true }] }; };
const serieClasses = (S, v) => ({ labels: ageSeries(S, v).labels, series: S.ensCols.map((c, i) => ({ nom: colLabel(S, c), color: PALETTE[i % PALETTE.length], values: ageSeries(S, v, c).T })) });
export { serieSexe, serieClasses };
function summaryModel(S, v) {
  const rows = classSummary(S, v), tot = rows.reduce((a, r) => ({ G: a.G + r.G, F: a.F + r.F }), { G: 0, F: 0 });
  return { head: ['', S.sexName.G, S.sexName.F, 'Total', '% filles', 'Âge le plus fréquent'], rows: [...rows.map(r => [r.label, r.G, r.F, r.T, r.pF === null ? '' : r.pF + ' %', r.ageModal]), ['TOTAL', tot.G, tot.F, tot.G + tot.F, tot.G + tot.F ? Math.round(tot.F / (tot.G + tot.F) * 100) + ' %' : '', '']] };
}
function drawStats(pdf, S, v, titre = '') {
  const m = summaryModel(S, v);
  pdf.heading(`Synthèse par ${S.id === 'EP' ? 'classe' : 'section'}${titre ? ' — ' + titre : ''}`);
  pdf.table({ widths: [2.2, 1, 1, 1, 1, 1.8], headRows: 1, head: m.head.map((t, i) => ({ t, c: i, s: 1, r: 0, rs: 1 })), size: 8, minH: 13,
    rows: m.rows.map((r, k) => r.map((x, i) => ({ t: String(x), a: i ? 'center' : undefined, b: k === m.rows.length - 1, f: k === m.rows.length - 1 ? GREY : undefined }))) });
  pdf.space(4); pdf.heading("Statistique par courbe d'âge");
  const a = serieSexe(S, v), b = serieClasses(S, v);
  drawChart(pdf, { titre: `Courbe d'âge selon le sexe — ${S.label}`, ...a }); drawChart(pdf, { titre: `Courbe d'âge par ${S.id === 'EP' ? 'classe' : 'section'} (garçons + filles)`, ...b });
}
function writeStats(ws, r, S, v) {
  const m = summaryModel(S, v); ws.set(r, 0, `Synthèse par ${S.id === 'EP' ? 'classe' : 'section'} — ${S.label}`, 'bold'); r++;
  m.head.forEach((t, i) => ws.set(r, i, t, 'th')); r++;
  m.rows.forEach((row, k) => { row.forEach((x, i) => ws.set(r, i, typeof x === 'number' ? x : x, k === m.rows.length - 1 ? 'total' : (i ? 'tdn' : 'label'))); r++; });
  r++; const a = ageSeries(S, v); ws.set(r, 0, `Courbe d'âge — ${S.label} (effectifs par âge)`, 'bold'); r++;
  ws.set(r, 0, 'Âge', 'th'); a.labels.forEach((l, i) => ws.set(r, 1 + i, l, 'th')); r++;
  [['G', S.sexName.G], ['F', S.sexName.F], ['T', 'Ensemble']].forEach(([k, l]) => { ws.set(r, 0, l, 'label'); a[k].forEach((x, i) => ws.set(r, 1 + i, x, 'tdn')); r++; });
  return r + 1;
}

/* ---------------- Identification ---------------- */
const IDENT = [['École', 'nom'], ['Code école', 'code'], ['Statut / secteur', 'secteur'], ["Type d'école", 'type'], ['Département', 'departement'], ['Commune', 'commune'],
  ['Arrondissement', 'arrondissement'], ['Village ou quartier de ville', 'localite'], ['Circonscription scolaire', 'nomCs'], ['Zone pédagogique n°', 'numZone'], ['Unité pédagogique', 'up'], ['Directeur/trice', 'directeur']];
export const identPairs = (id = {}) => IDENT.map(([l, k]) => [l, id[k] ?? '']);
function identRows(id) {
  const lab = (t) => ({ t, b: true, f: GREY }), p = identPairs(id), rows = [];
  for (let i = 0; i < p.length; i += 2) rows.push([lab(p[i][0]), { t: String(p[i][1]) }, lab(p[i + 1][0]), { t: String(p[i + 1][1]) }]);
  return rows;
}
function sigTable(pdf, zone) {
  const h = (t) => ({ t, b: true, f: GREY, a: 'center' }), sub = { t: '(Date - signature - Nom et prénoms)', a: 'center' };
  pdf.ensure(110);
  pdf.table({ widths: [1, 1, 1, 1], size: 7.5, minH: 14, rows: [
    [h('Établi par le/la Directeur/trice'), h("Contrôlé par le Responsable d'Unité Pédagogique"), h('Contrôlé par le CP de la zone n° ' + (zone || '…')), h('Visa du Chef de la Circonscription Scolaire')],
    ['\n\n\n\n\n', '\n\n\n\n\n', '\n\n\n\n\n', '\n\n\n\n\n'], [sub, sub, sub, sub]] });
}
const fmt = (x) => (x === null || x === undefined ? '' : x);

/* ---------------- PDF : fiche d'une école ---------------- */
export async function schoolPdf(rec) {
  const S = schemaOf(rec.cycle), v = computeValues(S, rec.data), id = rec.ident || {};
  const pdf = await newPdf({ title: `${S.titre} — ${rec.schoolNom} ${rec.annee}`, subject: 'Effectifs des apprenants', footer: `Effectifs ${S.court} · ${rec.schoolNom} · ${rec.annee}`, orientation: S.id === 'EP' ? 'landscape' : 'portrait' });
  pdf.text(S.direction, { bold: true, align: 'center', size: 10 }); pdf.space(2);
  pdf.titleBox([S.titre, S.sousTitre, `ANNÉE SCOLAIRE : ${rec.annee}`]);
  pdf.text(`École : ${rec.schoolNom}${rec.schoolCode ? ' (' + rec.schoolCode + ')' : ''}  ·  Statut de la fiche : ${rec.statut || 'Brouillon'}`, { size: 8.5, align: 'center' });
  pdf.heading("1. Identification et localisation de l'établissement");
  pdf.table({ widths: [2.3, 2.2, 2.3, 2.2], size: 8, rows: identRows(id) });
  pdf.heading(S.globalTitle);
  pdf.table({ widths: [1, 1, 1], headRows: 1, head: [S.sexName.G, S.sexName.F, 'Total'].map((t, i) => ({ t, c: i, s: 1, r: 0, rs: 1 })), size: 9, minH: 16,
    rows: [SX3.map(sx => ({ t: String(fmt(show(S, v, 'tot', ENS, sx))), a: 'center', b: true }))] });
  for (const b of S.blocks) drawModel(pdf, blockModel(S, b, v));
  pdf.space(4); drawStats(pdf, S, v);
  pdf.space(6); sigTable(pdf, id.numZone);
  return pdf.finish();
}

/* ---------------- PDF : consolidation zone / CS ---------------- */
export async function consolPdf({ title, subtitle = '', annee, columns, rows, totals, agg, zone = '' }) {
  const pdf = await newPdf({ title, subject: 'Effectifs des apprenants — consolidation', footer: title, orientation: 'landscape' });
  pdf.text('RÉPUBLIQUE DU BÉNIN — MINISTÈRE DES ENSEIGNEMENTS MATERNEL ET PRIMAIRE', { bold: true, align: 'center', size: 9 }); pdf.space(2);
  pdf.titleBox([title, ...(subtitle ? [subtitle] : []), `ANNÉE SCOLAIRE : ${annee}`]);
  pdf.heading('Récapitulatif');
  const body = rows.map(o => columns.map(c => ({ t: String(fmt(o[c.k])), a: c.num ? 'center' : undefined })));
  if (totals) body.push(columns.map(c => ({ t: String(fmt(totals[c.k])), b: true, f: GREY, a: c.num ? 'center' : undefined })));
  pdf.table({ widths: columns.map(c => c.w || 1), headRows: 1, head: columns.map((c, i) => ({ t: c.l, c: i, s: 1, r: 0, rs: 1 })), rows: body, size: 7, headSize: 6.8, minH: 13 });
  for (const S of [SCHEMAS.EP, SCHEMAS.EM]) {
    const nb = S.id === 'EP' ? agg.nbEP : agg.nbEM; if (!nb) continue;
    pdf.addPage('landscape');
    pdf.text(`${S.label} — consolidation de ${nb} fiche(s)`, { bold: true, size: 10 });
    for (const b of S.blocks) drawModel(pdf, blockModel(S, b, agg[S.id]));
    pdf.space(4); drawStats(pdf, S, agg[S.id]);
  }
  pdf.space(6); sigTable(pdf, zone);
  return pdf.finish();
}

/* ---------------- Excel : feuilles ---------------- */
function writeList(ws, r, columns, rows, totals) {
  columns.forEach((c, i) => { ws.set(r, i, c.l, 'th'); ws.width(i, c.xw || Math.max(10, Math.min(40, (c.w || 1) * 10))); });
  ws.height(r, 32); r++;
  rows.forEach(o => { columns.forEach((c, i) => { const x = o[c.k]; ws.set(r, i, typeof x === 'number' ? x : (x ?? ''), c.num ? 'tdn' : 'td'); }); r++; });
  if (totals) { columns.forEach((c, i) => ws.set(r, i, typeof totals[c.k] === 'number' ? totals[c.k] : (totals[c.k] ?? ''), 'total')); r++; }
  return r + 1;
}

export const SAISIE_NOTE = "Saisissez uniquement des nombres entiers dans les colonnes G (garçons / masculin) et F (filles / féminin). Ne modifiez ni l'en-tête ni les colonnes A à D. Les totaux sont calculés par l'application. Cases grisées : sans objet.";
const saisieHeader = (S) => ['Code_ecole', 'Ecole', 'Cle', 'Rubrique', ...S.saisieCols.flatMap(c => SEXES.map(s => `${c}_${s}`))];

/** Feuille « Saisie EP/EM » : une ligne par école et par rubrique à saisir (réimportable) */
function writeSaisie(wb, S, items, banner) {
  const ws = wb.sheet('Saisie ' + S.id); let r = ws.banner(banner, 820);
  ws.set(r, 0, `Saisie des effectifs — ${S.label}`, 'title'); r++;
  ws.set(r, 0, SAISIE_NOTE, 'note'); ws.merge(r, 0, r, 9); ws.height(r, 40); r++; r++;
  const head = saisieHeader(S); head.forEach((t, i) => ws.set(r, i, t, 'th')); ws.height(r, 22);
  [14, 34, 12, 46].forEach((w, i) => ws.width(i, w)); for (let i = 4; i < head.length; i++) ws.width(i, 9);
  const hr = r; r++;
  for (const it of items) {
    for (const row of inputRows(S)) {
      ws.set(r, 0, it.code || '', 'td'); ws.set(r, 1, it.nom, 'td'); ws.set(r, 2, row.k, 'td'); ws.set(r, 3, row.l.trim(), 'td');
      S.saisieCols.forEach((c, ci) => SEXES.forEach((s, si) => {
        const col = 4 + ci * 2 + si;
        if (!applies(S, row, c, s)) { ws.set(r, col, '', 'calc'); return; }
        const x = it.data?.[dataKey(row.k, c, s)];
        const n = x === undefined || x === '' || x === null ? '' : Number(x);
        ws.set(r, col, Number.isFinite(n) ? n : '', 'tdn');
      }));
      r++;
    }
  }
  ws.freeze(hr + 1, 4);
  return hr;
}
const saisieItems = (records) => records.map(r => ({ code: r.schoolCode || r.ident?.code || '', nom: r.schoolNom, cycle: r.cycle, data: r.data }));

/** Excel d'une école : fiche mise en forme + feuille de saisie réimportable */
export async function schoolXlsx(rec) {
  const S = schemaOf(rec.cycle), v = computeValues(S, rec.data), banner = await bannerBytes(), wb = new XlsxBook();
  const ws = wb.sheet('Fiche effectifs'); let r = ws.banner(banner);
  ws.width(0, 46); for (let c = 1; c <= 22; c++) ws.width(c, 8);
  ws.set(r, 0, S.direction, 'bold'); r++; ws.set(r, 0, S.titre, 'title'); r++; ws.set(r, 0, S.sousTitre, 'bold'); r++;
  ws.set(r, 0, `ANNÉE SCOLAIRE : ${rec.annee}  ·  École : ${rec.schoolNom}  ·  Statut de la fiche : ${rec.statut || 'Brouillon'}`, 'bold'); r += 2;
  ws.set(r, 0, "1. Identification et localisation de l'établissement", 'section'); for (let c = 1; c <= 6; c++) ws.set(r, c, '', 'section'); r++;
  for (const [l, x] of identPairs(rec.ident)) { ws.set(r, 0, l, 'label'); ws.set(r, 1, String(x), 'td'); ws.merge(r, 1, r, 6); for (let c = 2; c <= 6; c++) ws.set(r, c, '', 'td'); r++; }
  r++;
  ws.set(r, 0, S.globalTitle, 'section'); for (let c = 1; c <= 3; c++) ws.set(r, c, '', 'section'); r++;
  ws.set(r, 1, S.sexName.G, 'th'); ws.set(r, 2, S.sexName.F, 'th'); ws.set(r, 3, 'Total', 'th'); r++;
  ws.set(r, 0, 'Effectif total', 'label'); SX3.forEach((sx, i) => { const x = show(S, v, 'tot', ENS, sx); ws.set(r, 1 + i, x === null ? '' : x, 'total'); }); r += 2;
  for (const b of S.blocks) r = writeModel(ws, r, blockModel(S, b, v));
  r = writeStats(ws, r, S, v);
  writeSaisie(wb, S, saisieItems([rec]), banner);
  return wb.toBlob();
}

/** Excel de consolidation (zone ou CS) + feuilles de saisie réimportables pour toutes les fiches du périmètre */
export async function consolXlsx({ title, subtitle = '', annee, columns, rows, totals, agg, records }) {
  const banner = await bannerBytes(), wb = new XlsxBook(), ws = wb.sheet('Récapitulatif'); let r = ws.banner(banner, 820);
  ws.set(r, 0, title, 'title'); r++; ws.set(r, 0, [subtitle, `Année scolaire ${annee}`].filter(Boolean).join(' — '), 'note'); r += 2;
  writeList(ws, r, columns, rows, totals); ws.freeze(r + 1, 1);
  for (const S of [SCHEMAS.EP, SCHEMAS.EM]) {
    const nb = S.id === 'EP' ? agg.nbEP : agg.nbEM; if (!nb) continue;
    const w2 = wb.sheet('Consolidé ' + S.id); let q = w2.banner(banner, 820);
    w2.width(0, 46); for (let c = 1; c <= 22; c++) w2.width(c, 8);
    w2.set(q, 0, `${S.label} — consolidation de ${nb} fiche(s) — ${annee}`, 'title'); q += 2;
    for (const b of S.blocks) q = writeModel(w2, q, blockModel(S, b, agg[S.id]));
    q = writeStats(w2, q, S, agg[S.id]);
  }
  for (const S of [SCHEMAS.EP, SCHEMAS.EM]) { const list = records.filter(x => schemaOf(x.cycle).id === S.id); if (list.length) writeSaisie(wb, S, saisieItems(list), banner); }
  return wb.toBlob();
}

/** Modèle vide : une ligne par école de la liste (écoles sans fiche incluses) */
export async function templateXlsx({ schools, annee, title }) {
  const banner = await bannerBytes(), wb = new XlsxBook(); let n = 0;
  for (const S of [SCHEMAS.EP, SCHEMAS.EM]) {
    const list = schools.filter(s => schemaOf(s.cycle).id === S.id); if (!list.length) continue;
    writeSaisie(wb, S, list.map(s => ({ code: s.code || '', nom: s.nom, cycle: s.cycle, data: s.__data || {} })), banner); n++;
  }
  if (!n) throw new Error('Aucune école dans le périmètre choisi.');
  void annee; void title;
  return wb.toBlob();
}

/* ---------------- Import Excel ---------------- */
/** Lit les feuilles « Saisie EP » / « Saisie EM ». schools = écoles du périmètre. Renvoie les mises à jour par école et les rejets. */
export function parseSaisie(sheets, schools) {
  const rejets = [], updates = new Map(), byCode = new Map(), byName = new Map(); let nbValues = 0, feuilles = 0;
  for (const s of schools) { if (s.code) byCode.set(norm(s.code), s); byName.set(norm(s.nom) + '|' + s.cycle, s); }
  for (const sh of sheets) {
    const nm = norm(sh.name), S = nm === 'saisie ep' ? SCHEMAS.EP : nm === 'saisie em' ? SCHEMAS.EM : null; if (!S) continue;
    const hi = sh.rows.findIndex(row => row && norm(row[0]) === 'code ecole');
    if (hi < 0) { rejets.push(`Feuille « ${sh.name} » : en-tête « Code_ecole » introuvable.`); continue; }
    const head = sh.rows[hi], colMap = [], keyI = head.findIndex(t => norm(t) === 'cle');
    head.forEach((t, i) => { const m = /^([A-Za-z0-9]+)_(G|F)$/.exec(String(t).trim()); if (m && S.saisieCols.includes(m[1])) colMap.push({ i, col: m[1], sex: m[2] }); });
    if (keyI < 0 || !colMap.length) { rejets.push(`Feuille « ${sh.name} » : colonnes « Cle » ou G/F introuvables.`); continue; }
    feuilles++;
    for (let r = hi + 1; r < sh.rows.length; r++) {
      const row = sh.rows[r]; if (!row || !row.some(x => String(x ?? '').trim() !== '')) continue;
      const key = String(row[keyI] ?? '').trim(), def = rowOf(S, key), tag = `${sh.name}, ligne ${r + 1}`;
      if (!def || !def.input) { rejets.push(`${tag} : rubrique inconnue « ${key} ».`); continue; }
      const school = (row[0] && byCode.get(norm(row[0]))) || byName.get(norm(row[1]) + '|' + S.cycle);
      if (!school) { rejets.push(`${tag} : école « ${row[1] || row[0] || '?'} » introuvable dans votre périmètre (${S.label.toLowerCase()}).`); continue; }
      let u = updates.get(school.id); if (!u) { u = { school, data: {}, clear: new Set(), n: 0 }; updates.set(school.id, u); }
      for (const { i, col, sex } of colMap) {
        const txt = String(row[i] ?? '').trim();
        if (!applies(S, def, col, sex) || !rowCols(S, def).includes(col)) { if (txt !== '') rejets.push(`${tag} : la case ${col}_${sex} n'existe pas pour « ${def.l.trim()} ».`); continue; }
        const k = dataKey(key, col, sex);
        if (txt === '') { u.clear.add(k); continue; }
        const n = Number(txt.replace(/\s/g, '').replace(',', '.'));
        if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) { rejets.push(`${tag} : valeur « ${txt} » invalide (${def.l.trim()}, ${col}_${sex}) — entier positif attendu.`); continue; }
        u.data[k] = n; u.n++; nbValues++;
      }
    }
  }
  return { updates: [...updates.values()], rejets, nbValues, feuilles };
}
/** Applique une mise à jour d'import à une fiche */
export function applyImport(rec, u) {
  for (const k of u.clear) delete rec.data[k];
  Object.assign(rec.data, u.data);
  return rec;
}
