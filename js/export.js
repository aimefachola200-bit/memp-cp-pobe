/* République du Bénin — MEMP — Exports PDF et Excel (fiches, rapports, tableaux).
   Tous les fichiers produits portent le bandeau officiel du Ministère. */
import { sectionsFor, FICHE_TYPES, gridHead, gridValue, fmtVal, persoValue, CLASSES, isCalc } from './schema.js';
import { newPdf, armsBytes, bannerBytes, GREY } from './pdf.js';
import { XlsxBook } from './xlsx.js';
import { dataUrlToBytes, num } from './util.js';
import { qrPayload } from './sign.js';
import { db } from './db.js';
const ecoleDe = async (id) => { try { return id ? await db.get('schools', id) : null; } catch (e) { return null; } };

const yn = (v) => (v === true || v === 'true' || v === 1) ? 'Oui' : (v === false || v === undefined || v === '' ? '' : String(v));
const fieldText = (fld, data) => fld.t === 'check' ? (data[fld.k] ? 'Oui' : 'Non') : fmtVal(data[fld.k]);

/* ---- lignes clé/valeur : regroupe deux champs « demi-largeur » par ligne ---- */
function kvRows(fields, data) {
  const rows = []; let i = 0;
  while (i < fields.length) {
    const a = fields[i], b = fields[i + 1];
    const lab = (f) => ({ t: f.l, b: true, f: GREY });
    if (a.w && b && b.w) { rows.push([lab(a), { t: fieldText(a, data) }, lab(b), { t: fieldText(b, data) }]); i += 2; }
    else { rows.push([lab(a), { t: fieldText(a, data), s: 3 }]); i += 1; }
  }
  return rows;
}

function sigTable(pdf, fiche) {
  const h = (t) => ({ t, b: true, f: GREY, a: 'center' });
  pdf.ensure(120);
  pdf.table({ widths: [1, 1, 1, 1], size: 7.5, minH: 14, rows: [
    [h('Établi par le/la Directeur/trice'), h("Contrôlé par le Responsable de l'Unité Pédagogique"), h('Contrôlé par le CP de la zone n° ' + (fiche.data.zone || '…')), h('Le Chef de la Circonscription Scolaire')],
    ['\n\n\n\n\n', '\n\n\n\n\n', '\n\n\n\n\n', '\n\n\n\n\n'],
    [{ t: '(Date - signature - Nom et prénoms)', a: 'center' }, { t: '(Date - signature - Nom et prénoms)', a: 'center' }, { t: '(Date - signature - Nom et prénoms)', a: 'center' }, { t: '(Date - signature - Nom et prénoms)', a: 'center' }],
  ] });
}

export async function ficheToPdf(fiche, { signed = null } = {}) {
  const T = FICHE_TYPES[fiche.kind], sections = sectionsFor(fiche.kind);
  const pdf = await newPdf({ title: `${T.titre} — ${fiche.schoolNom} ${fiche.annee}`, subject: T.label, footer: `${T.court} · ${fiche.schoolNom} · ${fiche.annee}` });
  pdf.text(T.direction, { bold: true, align: 'center', size: 10 }); pdf.space(2);
  pdf.titleBox([T.titre, `ANNÉE SCOLAIRE : ${fiche.annee}`]);
  pdf.text(`École : ${fiche.schoolNom}${fiche.schoolCode ? ' (' + fiche.schoolCode + ')' : ''}  ·  Statut de la fiche : ${fiche.statut || 'Brouillon'}`, { size: 8.5, align: 'center' });
  await pdf.blocEcole(await ecoleDe(fiche.schoolId));
  for (const s of sections) {
    if (s.type === 'fields') {
      pdf.heading(s.title);
      pdf.table({ widths: [2.3, 2.2, 2.3, 2.2], size: 8, rows: kvRows(s.fields, fiche.data) });
      (s.notes || []).forEach(n => pdf.text(n, { size: 7 }));
    } else if (s.type === 'grid') {
      pdf.heading(s.title);
      const hd = gridHead(s), many = hd.ncols > 11;
      const rows = s.rows.map(r => [{ t: r.l, b: true, f: GREY }, ...hd.flat.map(({ g, c }) => {
        const v = gridValue(fiche.data, s, r.k, g, c); return { t: fmtVal(v), a: 'center', f: isCalc(s, g, c) ? GREY : undefined, b: isCalc(s, g, c) };
      })]);
      pdf.table({ widths: [many ? 2.2 : 2.6, ...new Array(hd.ncols - 1).fill(1)], headRows: hd.headRows, head: hd.cells, rows, size: many ? 6.8 : 8, headSize: many ? 6.2 : 7.2 });
      if (s.extra) pdf.table({ widths: [2.3, 6.7], size: 8, rows: s.extra.map(f => [{ t: f.l, b: true, f: GREY }, { t: fieldText(f, fiche.data) }]) });
    } else if (s.type === 'personnel') {
      pdf.addPage('landscape');
      pdf.heading(s.title);
      const cols = [{ k: '#', l: 'N°', w: 40 }, ...s.cols];
      const widths = cols.map(c => c.w || 62), tot = widths.reduce((a, b) => a + b, 0);
      const rows = (fiche.perso || []).map((p, i) => [String(i + 1).padStart(2, '0'), ...s.cols.map(c => persoValue(p[c.k]))]);
      while (rows.length < s.minRows) rows.push([String(rows.length + 1).padStart(2, '0'), ...s.cols.map(() => '')]);
      const sz = tot > 1300 ? 5.6 : 6.4;
      pdf.table({ widths, headRows: 1, head: cols.map((c, i) => ({ t: c.l, c: i, s: 1, r: 0, rs: 1 })), rows, size: sz, headSize: sz - 0.2, minH: 13 });
      (s.notes || []).forEach(n => pdf.text(n, { size: 7 }));
      pdf.space(6);
    }
  }
  sigTable(pdf, fiche);
  if (signed) await pdf.authBlock({ role: 'Le Conseiller Pédagogique', nom: signed.nom, signature: signed.signature && dataUrlToBytes(signed.signature), cachet: signed.cachet && dataUrlToBytes(signed.cachet), qrText: qrPayload(signed.docId, signed.hash, signed.codeCp),
    lines: [`Document n° ${signed.docId} · Empreinte SHA-256 : ${signed.hash.slice(0, 32)}…`, `Signé numériquement le ${new Date(signed.date).toLocaleString('fr-FR')} · Vérifiable dans l'Application CP (menu « Vérifier un document »).`] });
  return pdf.finish();
}

/* ---------------- Excel : fiche ---------------- */
export async function ficheToXlsx(fiche) {
  const T = FICHE_TYPES[fiche.kind], sections = sectionsFor(fiche.kind), banner = await bannerBytes();
  const wb = new XlsxBook();
  const ws = wb.sheet('Fiche'); let r = ws.banner(banner);
  ws.width(0, 40); for (let c = 1; c <= 12; c++) ws.width(c, 14);
  ws.set(r, 0, T.direction, 'bold'); r++;
  ws.set(r, 0, T.titre, 'title'); r++;
  ws.set(r, 0, `ANNÉE SCOLAIRE : ${fiche.annee}  ·  École : ${fiche.schoolNom}  ·  Statut : ${fiche.statut || 'Brouillon'}`, 'bold'); r += 2;
  for (const s of sections) {
    if (s.type === 'personnel') continue;
    ws.set(r, 0, s.title, 'section'); for (let c = 1; c <= 8; c++) ws.set(r, c, '', 'section'); r++;
    if (s.type === 'fields') {
      for (const f of s.fields) { ws.set(r, 0, f.l, 'label'); ws.set(r, 1, f.t === 'number' && fmtVal(fiche.data[f.k]) !== '' ? num(fiche.data[f.k]) : fieldText(f, fiche.data), 'td'); ws.merge(r, 1, r, 4); for (let c = 2; c <= 4; c++) ws.set(r, c, '', 'td'); r++; }
      (s.notes || []).forEach(n => { ws.set(r, 0, n, 'note'); r++; });
    } else {
      const hd = gridHead(s);
      hd.cells.forEach(c => { ws.set(r + (c.r || 0), c.c, c.t, 'th'); for (let rr = 0; rr < (c.rs || 1); rr++) for (let cc = 0; cc < (c.s || 1); cc++) if (rr || cc) ws.set(r + (c.r || 0) + rr, c.c + cc, '', 'th'); ws.merge(r + (c.r || 0), c.c, r + (c.r || 0) + (c.rs || 1) - 1, c.c + (c.s || 1) - 1); });
      r += hd.headRows;
      for (const row of s.rows) {
        ws.set(r, 0, row.l, 'label');
        hd.flat.forEach(({ g, c }, i) => { const v = gridValue(fiche.data, s, row.k, g, c); ws.set(r, i + 1, v === null ? '' : v, isCalc(s, g, c) ? 'calc' : 'tdn'); });
        r++;
      }
      (s.extra || []).forEach(f => { ws.set(r, 0, f.l, 'label'); ws.set(r, 1, fieldText(f, fiche.data), 'td'); ws.merge(r, 1, r, 6); r++; });
    }
    r++;
  }
  const ps = sections.find(s => s.type === 'personnel');
  if (ps) {
    const w2 = wb.sheet('Personnel'); let q = w2.banner(banner, 900);
    w2.set(q, 0, ps.title, 'title'); q += 2;
    const cols = [{ l: 'N°' }, ...ps.cols];
    cols.forEach((c, i) => { w2.set(q, i, c.l, 'th'); w2.width(i, i === 0 ? 5 : Math.max(10, Math.round((c.w || 80) / 6.5))); });
    w2.height(q, 42); q++;
    const list = [...(fiche.perso || [])]; while (list.length < ps.minRows) list.push({});
    list.forEach((p, i) => { w2.set(q, 0, i + 1, 'tdc'); ps.cols.forEach((c, j) => { const v = persoValue(p[c.k]); w2.set(q, j + 1, c.t === 'number' && v !== '' && !isNaN(num(v)) ? num(v) : v, 'td'); }); q++; });
    q++; (ps.notes || []).forEach(n => { w2.set(q, 0, n, 'note'); q++; });
    w2.freeze(q - list.length - ps.notes.length - 3, 3);
  }
  return wb.toBlob();
}

/* ---------------- Listes génériques ---------------- */
export async function listToXlsx({ title, subtitle = '', columns, rows, sheet = 'Liste' }) {
  const wb = new XlsxBook(), ws = wb.sheet(sheet); let r = ws.banner(await bannerBytes(), 820);
  ws.set(r, 0, title, 'title'); r++; if (subtitle) { ws.set(r, 0, subtitle, 'note'); r++; } r++;
  columns.forEach((c, i) => { ws.set(r, i, c.l, 'th'); ws.width(i, c.xw || Math.max(10, Math.min(40, (c.w || 90) / 6))); });
  ws.height(r, 30); const head = r; r++;
  rows.forEach(o => { columns.forEach((c, i) => { const v = o[c.k]; ws.set(r, i, typeof v === 'number' ? v : (c.num && v !== '' && v != null && !isNaN(num(v)) ? num(v) : (v ?? '')), c.num ? 'tdn' : 'td'); }); r++; });
  ws.freeze(head + 1, 0);
  return wb.toBlob();
}
export async function listToPdf({ title, subtitle = '', columns, rows, orientation = 'landscape', totals = null }) {
  const pdf = await newPdf({ title, footer: title, orientation });
  pdf.text('RÉPUBLIQUE DU BÉNIN — MINISTÈRE DES ENSEIGNEMENTS MATERNEL ET PRIMAIRE', { bold: true, align: 'center', size: 9 });
  pdf.space(2); pdf.titleBox([title, ...(subtitle ? [subtitle] : [])], { size: 12 });
  const body = rows.map(o => columns.map(c => fmtVal(o[c.k])));
  if (totals) body.push(columns.map(c => ({ t: fmtVal(totals[c.k]), b: true, f: GREY })));
  pdf.table({ widths: columns.map(c => c.w || 80), head: columns.map((c, i) => ({ t: c.l, c: i, s: 1, r: 0, rs: 1 })), headRows: 1, rows: body, size: columns.length > 12 ? 6 : 7.5, align: columns.map(c => c.num ? 'center' : 'left') });
  return pdf.finish();
}

/* ---------------- Rapport de fin d'année (par classe) ---------------- */
export const DECISIONS = ['Admis', 'Redouble', 'Abandon'];
export function reportStats(rows) {
  const z = () => ({ G: 0, F: 0, T: 0 });
  const S = { inscrits: z(), compose: z(), seuil: z(), pasSeuil: z(), abandon: z() };
  const add = (o, sx) => { if (sx === 'G') o.G++; else if (sx === 'F') o.F++; o.T++; };
  rows.filter(r => (r.nom || '').trim()).forEach(r => {
    add(S.inscrits, r.sexe);
    if (r.decision === 'Admis') { add(S.compose, r.sexe); add(S.seuil, r.sexe); }
    else if (r.decision === 'Redouble') { add(S.compose, r.sexe); add(S.pasSeuil, r.sexe); }
    else if (r.decision === 'Abandon') add(S.abandon, r.sexe);
  });
  const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 : null;
  S.pctReussite = { G: pct(S.seuil.G, S.compose.G), F: pct(S.seuil.F, S.compose.F), T: pct(S.seuil.T, S.compose.T) };
  S.pctEchec = { G: pct(S.pasSeuil.G, S.compose.G), F: pct(S.pasSeuil.F, S.compose.F), T: pct(S.pasSeuil.T, S.compose.T) };
  return S;
}
const statRows = (S) => [['Inscrits', S.inscrits], ['Ont composé', S.compose], ['Ont atteint le seuil de réussite', S.seuil], ["N'ont pas atteint le seuil de réussite", S.pasSeuil], ['Abandons', S.abandon], ['Pourcentage de réussite (%)', S.pctReussite], ["Pourcentage d'échec (%)", S.pctEchec]];

export async function reportToPdf(rep, { signed = null } = {}) {
  const pdf = await newPdf({ title: `Rapport de fin d'année — ${rep.schoolNom} ${rep.cours}`, footer: `Rapport de fin d'année · ${rep.schoolNom} · ${rep.cours} · ${rep.annee}`, orientation: 'portrait' });
  pdf.text(`DIRECTION DÉPARTEMENTALE DES ENSEIGNEMENTS MATERNEL ET PRIMAIRE ${(rep.departement || '').toUpperCase()}`, { align: 'center', bold: true, size: 8.5 });
  pdf.text(`CIRCONSCRIPTION SCOLAIRE DE ${(rep.nomCs || '').toUpperCase()}  ·  ÉCOLE PRIMAIRE ${(rep.schoolNom || '').toUpperCase()}`, { align: 'center', size: 8.5 });
  await pdf.blocEcole(await ecoleDe(rep.schoolId));
  pdf.space(2); pdf.titleBox(["RAPPORT DE FIN D'ANNÉE", `ANNÉE SCOLAIRE : ${rep.annee}  ·  COURS : ${rep.cours}`]);
  const rows = (rep.rows || []).filter(r => (r.nom || '').trim()).map((r, i) => [String(i + 1), r.nom, r.sexe || '', ...[0, 1, 2, 3, 4].map(k => (r.ev && r.ev[k]) ? 'x' : ''), String((r.ev || []).filter(Boolean).length), r.decision || '', r.obs || '']);
  pdf.table({ widths: [22, 140, 26, 28, 28, 28, 28, 28, 40, 56, 80], align: ['center', 'left', 'center', 'center', 'center', 'center', 'center', 'center', 'center', 'center', 'left'],
    headRows: 2, head: [{ t: 'N°', c: 0, rs: 2 }, { t: 'Nom & prénoms des apprenants', c: 1, rs: 2 }, { t: 'Sexe', c: 2, rs: 2 }, { t: 'Bilan des évaluations (seuil atteint)', c: 3, s: 5, r: 0 },
      ...['1ère', '2ème', '3ème', '4ème', '5ème'].map((t, i) => ({ t, c: 3 + i, r: 1 })), { t: "Nombre d'éval. où le seuil est atteint", c: 8, rs: 2 }, { t: 'Décision', c: 9, rs: 2 }, { t: 'Observations', c: 10, rs: 2 }],
    rows, size: 7.5, headSize: 6.8 });
  const S = reportStats(rep.rows || []);
  pdf.heading('STATISTIQUES');
  pdf.table({ widths: [3, 1, 1, 1], headRows: 1, head: [{ t: 'Effectif', c: 0 }, { t: 'Garçons', c: 1 }, { t: 'Filles', c: 2 }, { t: 'Total', c: 3 }], align: ['left', 'center', 'center', 'center'],
    rows: statRows(S).map(([l, o]) => [{ t: l, b: true, f: GREY }, fmtVal(o.G), fmtVal(o.F), fmtVal(o.T)]), size: 8 });
  pdf.text(`Fait à ${rep.lieu || '……………………'}, le ${rep.dateRapport ? new Date(rep.dateRapport + 'T12:00').toLocaleDateString('fr-FR') : '…… / …… / ……'}`, { align: 'right', size: 8.5 });
  pdf.space(4);
  pdf.table({ widths: [1, 1], size: 8, rows: [[{ t: 'Le/La Directeur/trice', b: true, f: GREY, a: 'center' }, { t: 'Le/La Titulaire', b: true, f: GREY, a: 'center' }], ['\n\n\n\n', '\n\n\n\n']] });
  if (signed) await pdf.authBlock({ role: 'Le Conseiller Pédagogique', nom: signed.nom, signature: signed.signature && dataUrlToBytes(signed.signature), cachet: signed.cachet && dataUrlToBytes(signed.cachet), qrText: qrPayload(signed.docId, signed.hash, signed.codeCp),
    lines: [`Document n° ${signed.docId} · Empreinte SHA-256 : ${signed.hash.slice(0, 32)}…`] });
  return pdf.finish();
}
export async function reportToXlsx(rep) {
  const wb = new XlsxBook(), ws = wb.sheet('Rapport'); let r = ws.banner(await bannerBytes(), 820);
  [32, 40, 8, 6, 6, 6, 6, 6, 12, 14, 30].forEach((w, i) => ws.width(i, w));
  ws.set(r, 0, `RAPPORT DE FIN D'ANNÉE — ${rep.schoolNom} — ${rep.cours} — ${rep.annee}`, 'title'); r++;
  ws.set(r, 0, `Circonscription scolaire de ${rep.nomCs || ''} · ${rep.departement || ''}`, 'note'); r += 2;
  ['N°', 'Nom & prénoms', 'Sexe', '1ère', '2ème', '3ème', '4ème', '5ème', 'Nb seuil atteint', 'Décision', 'Observations'].forEach((t, i) => ws.set(r, i, t, 'th')); ws.height(r, 30); r++;
  (rep.rows || []).filter(x => (x.nom || '').trim()).forEach((x, i) => { ws.set(r, 0, i + 1, 'tdc'); ws.set(r, 1, x.nom, 'td'); ws.set(r, 2, x.sexe || '', 'tdc'); for (let k = 0; k < 5; k++) ws.set(r, 3 + k, x.ev && x.ev[k] ? 1 : 0, 'tdn'); ws.set(r, 8, (x.ev || []).filter(Boolean).length, 'calc'); ws.set(r, 9, x.decision || '', 'tdc'); ws.set(r, 10, x.obs || '', 'td'); r++; });
  r++; ws.set(r, 1, 'STATISTIQUES', 'section'); ['Garçons', 'Filles', 'Total'].forEach((t, i) => ws.set(r, 2 + i, t, 'section')); r++;
  statRows(reportStats(rep.rows || [])).forEach(([l, o]) => { ws.set(r, 1, l, 'label'); ['G', 'F', 'T'].forEach((k, i) => ws.set(r, 2 + i, o[k] ?? '', 'calc')); r++; });
  return wb.toBlob();
}
