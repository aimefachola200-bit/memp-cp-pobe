/* République du Bénin — MEMP — Exports du bilan des activités pédagogiques (PDF, Excel, JSON, relecture Excel).
   Tous les fichiers portent le bandeau officiel. Conception : Maître Aimé FACHOLA — Tél. +229 01 96 51 03 33 */
import { newPdf, bannerBytes, GREY } from './pdf.js';
import { XlsxBook, readXlsx } from './xlsx.js';
import { dataUrlToBytes, bytesToB64, fetchBytes, nowISO } from './util.js';
import { qrPayload, canonical } from './sign.js';
import { APP, CREDIT, CREDIT_DOC } from './config.js';
import { TABLES, TOTAL, PERIODES, rowsOf, totalLabel, showTotal, cellValue, fmtCell, layoutHead, newBilan } from './bilan-schema.js';
import { db } from './db.js';

export const SECTIONS = [
  ['t1'], ['t21', 't22', 't23', 't24', 't25'], ['t31'], ['t4'], ['ev1', 'ev2', 'ev3'],
];
const evVisible = (b, id) => b.periode === 'ANNUEL' || id === 'ev' + b.periode.slice(1);
export const tablesToShow = (b) => SECTIONS.flat().filter(id => !id.startsWith('ev') || evVisible(b, id));
const title = (b) => b.niveau === 'CS' ? `BILAN ${b.periode === 'ANNUEL' ? 'ANNUEL' : 'TRIMESTRIEL'} DES ACTIVITÉS PÉDAGOGIQUES — NIVEAU CIRCONSCRIPTION SCOLAIRE` : `BILAN ${b.periode === 'ANNUEL' ? 'ANNUEL' : 'TRIMESTRIEL'} DES ACTIVITÉS PÉDAGOGIQUES — NIVEAU ZONE PÉDAGOGIQUE`;
const dfr = (d) => d ? new Date(d + 'T12:00').toLocaleDateString('fr-FR') : '…… / …… / ……';
export const bilanFile = (b) => `Bilan_${b.niveau === 'CS' ? 'CS' : 'Zone'}_${b.periode}_${(b.entete.nomCs || b.entete.numZone || 'MEMP').toString().replace(/[^\w-]+/g, '_')}_${b.annee}`;

function tableRows(b, tid) {
  const spec = TABLES[tid], rows = rowsOf(b, spec);
  const line = (r, lab, tot) => [{ t: lab, b: true, f: tot ? [1, 0.95, 0.8] : GREY }, ...spec.cols.map(c => ({ t: fmtCell(cellValue(b, tid, r, c.k), c), a: 'center', b: tot || !!c.f, f: tot ? [1, 0.95, 0.8] : c.f ? [0.96, 0.96, 0.96] : undefined }))];
  const out = rows.map(r => line(r.k, r.l, false)); if (showTotal(b, spec)) out.push(line(TOTAL, totalLabel(b), true));
  return out;
}
function headFor(spec, firstW) {
  const L = layoutHead(spec.head), ncols = spec.cols.length + 1;
  return { head: L.cells, headRows: L.headRows, widths: [firstW, ...Array(ncols - 1).fill(1)] };   // largeurs relatives : 1ère colonne = firstW × une colonne de données
}

export async function bilanToPdf(b, { photos = [], signed = null } = {}) {
  const pdf = await newPdf({ title: bilanLabelFull(b), subject: PERIODES[b.periode], footer: `${b.niveau === 'CS' ? 'Bilan CS' : 'Bilan zone'} · ${b.periode} · ${b.annee}`, orientation: 'landscape' });
  const e = b.entete;
  pdf.text(`DIRECTION DÉPARTEMENTALE DES ENSEIGNEMENTS MATERNEL ET PRIMAIRE ${(e.departement || b.departement || '').toUpperCase()}`, { align: 'center', bold: true, size: 9 });
  pdf.text(`CIRCONSCRIPTION SCOLAIRE DE ${(e.nomCs || '……………').toUpperCase()}${b.niveau === 'ZONE' ? '  ·  ZONE PÉDAGOGIQUE N° ' + (e.numZone || '……') : ''}`, { align: 'center', size: 9 });
  pdf.space(2); pdf.titleBox([title(b), `${PERIODES[b.periode].toUpperCase()}  ·  ANNÉE SCOLAIRE : ${b.annee}`], { size: 11 });
  pdf.text(`Date des visites / période : ${e.dateVisite || '………'}   ·   Fait à ${e.lieu || '……………'}, le ${dfr(e.dateBilan)}   ·   Statut : ${b.statut || 'Brouillon'}`, { size: 8, align: 'center' });
  const heads = { t1: '1. DONNÉES STATISTIQUES SUR LE RÉSEAU D\'ANIMATION PÉDAGOGIQUE', t21: '2. ACTIVITÉS MENÉES', t31: '3. CONCERTATIONS ET AUTRES ACTIVITÉS', t4: '4. RÉSULTATS / IMPACT — TAUX DE COUVERTURE', ev1: '5. RÉSULTATS DES ÉVALUATIONS D\'ÉTAPE' };
  for (const tid of tablesToShow(b)) {
    const spec = TABLES[tid]; if (heads[tid]) pdf.heading(heads[tid]);
    pdf.text(spec.title, { bold: true, size: 8.5 });
    const wide = spec.cols.length > 10, hf = headFor(spec, wide ? 1.9 : 2.6);
    pdf.table({ widths: hf.widths, head: hf.head, headRows: hf.headRows, rows: tableRows(b, tid), size: wide ? 6.3 : 7.5, headSize: wide ? 5.6 : 7, minH: 12, align: ['left', ...spec.cols.map(() => 'center')] });
    for (const nt of spec.notes || []) pdf.text(nt, { size: 7, color: [0.3, 0.3, 0.3] });
    if (tid === 't31') {
      pdf.text('3.2 Autres activités menées dans la période', { bold: true, size: 8.5 });
      const L = (b.lists.autres || []).filter(x => x.designation || x.lieu);
      pdf.table({ widths: [26, 150, 110, 260, 90], headRows: 1, head: ['N°', 'Lieu', 'Période', 'Désignation de l\'activité', 'Participants'].map((t, i) => ({ t, c: i })), rows: (L.length ? L : [{}]).map((x, i) => [String(i + 1), x.lieu || '', x.periode || '', x.designation || '', x.participants || '']), size: 7.5, align: ['center'] });
    }
  }
  pdf.heading('6. ANALYSES');
  for (const [k, l] of [['quant', '6.1 Analyse quantitative'], ['qual', '6.2 Analyse qualitative'], ['genre', '6.3 Performances selon le genre'], ['champs', '6.4 Performances selon les disciplines'], ['up', '6.5 Apport des unités pédagogiques'], ['conclusion', '6.6 Conclusion']]) if ((b.textes[k] || '').trim()) { pdf.text(l, { bold: true, size: 8.5 }); pdf.text(b.textes[k], { size: 8.5 }); pdf.space(3); }
  pdf.heading('7. DIFFICULTÉS MAJEURES, COMMENTAIRES ET PERSPECTIVES');
  const P = (b.lists.problemes || []).filter(x => x.designation);
  pdf.table({ widths: [34, 250, 60, 260], headRows: 1, head: ['Ordre', 'Désignation du problème', 'Ampleur (%)', 'Observations / solutions'].map((t, i) => ({ t, c: i })), rows: (P.length ? P : [{}]).map((x, i) => [String(i + 1), x.designation || '', x.ampleur || '', x.obs || '']), size: 7.5, align: ['center', 'left', 'center', 'left'] });
  for (const [k, l] of [['commentaires', 'Commentaires'], ['perspectives', 'Perspectives et recommandations']]) if ((b.textes[k] || '').trim()) { pdf.text(l, { bold: true, size: 8.5 }); pdf.text(b.textes[k], { size: 8.5 }); pdf.space(3); }
  pdf.ensure(110); pdf.text(`Fait à ${e.lieu || '……………'}, le ${dfr(e.dateBilan)}`, { align: 'right', size: 8.5 });
  pdf.table({ widths: [1, 1], size: 8, rows: [[{ t: e.titreAuteur || 'Le Conseiller Pédagogique', b: true, f: GREY, a: 'center' }, { t: b.niveau === 'CS' ? 'Le Directeur Départemental (visa)' : 'Le Chef de la Circonscription Scolaire (visa)', b: true, f: GREY, a: 'center' }], [{ t: '\n\n\n\n' + (e.auteur || ''), a: 'center' }, '\n\n\n\n']] });
  if (signed) await pdf.authBlock({ role: e.titreAuteur || 'Le Conseiller Pédagogique', nom: signed.nom, signature: signed.signature && dataUrlToBytes(signed.signature), cachet: signed.cachet && dataUrlToBytes(signed.cachet), qrText: qrPayload(signed.docId, signed.hash, signed.codeCp), lines: [`Document n° ${signed.docId} · Empreinte SHA-256 : ${signed.hash.slice(0, 32)}…`] });
  if (photos.length) {
    pdf.addPage('landscape'); pdf.heading('ANNEXE — PREUVES PHOTOGRAPHIQUES'); const cw = (pdf.cw - 10) / 2, ih = 190;
    for (let i = 0; i < photos.length; i += 2) {
      pdf.ensure(ih + 30); const top = pdf.y;
      for (let j = 0; j < 2 && photos[i + j]; j++) { const p = photos[i + j], img = await pdf.doc.embedJpg(dataUrlToBytes(p.data)), s = Math.min(cw / img.width, ih / img.height), x = pdf.M + j * (cw + 10);
        pdf.page.drawRectangle({ x, y: top - ih - 14, width: cw, height: ih + 14, borderColor: pdf.rgb([0.6, 0.6, 0.6]), borderWidth: 0.5 });
        pdf.page.drawImage(img, { x: x + (cw - img.width * s) / 2, y: top - ih + (ih - img.height * s) / 2 - 2, width: img.width * s, height: img.height * s });
        pdf.page.drawText(pdf.clean(`Photo ${i + j + 1} · ${(p.legende || '').slice(0, 90)} · ${new Date(p.date).toLocaleDateString('fr-FR')}`), { x: x + 4, y: top - ih - 10, size: 7, font: pdf.font }); }
      pdf.y = top - ih - 24;
    }
  }
  return pdf.finish();
}
export const bilanLabelFull = (b) => `${b.niveau === 'CS' ? 'Bilan CS' : 'Bilan zone'} — ${PERIODES[b.periode]} — ${b.annee}`;

export async function bilanToXlsx(b) {
  const wb = new XlsxBook(), ws = wb.sheet('Bilan'), ban = await bannerBytes(), e = b.entete; let r = ws.banner(ban, 900);
  ws.width(0, 28); for (let i = 1; i < 20; i++) ws.width(i, 9.5);
  ws.set(r, 0, `${(APP.republique)} — ${APP.ministere}`, 'bold'); r++;
  ws.set(r, 0, `DIRECTION DÉPARTEMENTALE ${(e.departement || b.departement || '').toUpperCase()} · CIRCONSCRIPTION SCOLAIRE DE ${(e.nomCs || '').toUpperCase()}${b.niveau === 'ZONE' ? ' · ZONE N° ' + (e.numZone || '') : ''}`, 'bold'); r++;
  ws.set(r, 0, title(b), 'title'); r++; ws.set(r, 0, `${PERIODES[b.periode]} · Année scolaire ${b.annee} · Fait à ${e.lieu || ''} le ${dfr(e.dateBilan)}`, 'note'); r += 2;
  for (const tid of tablesToShow(b)) {
    const spec = TABLES[tid], L = layoutHead(spec.head), nc = spec.cols.length + 1;
    ws.set(r, 0, spec.title, 'section'); for (let c = 1; c < nc; c++) ws.set(r, c, '', 'section'); r++;
    L.cells.forEach(cl => { for (let i = 0; i < cl.rs; i++) for (let j = 0; j < cl.s; j++) ws.set(r + cl.r + i, cl.c + j, i || j ? '' : cl.t, 'th'); ws.merge(r + cl.r, cl.c, r + cl.r + cl.rs - 1, cl.c + cl.s - 1); });
    for (let i = 0; i < L.headRows; i++) ws.height(r + i, i === 0 ? 30 : 36); r += L.headRows;
    for (const row of tableRows(b, tid)) {
      row.forEach((cell, i) => { const tot = cell.f && cell.f[2] < 0.9; const v = cell.t; const isNum = i > 0 && v !== '' && /^-?\d+([.,]\d+)?( %)?$/.test(v); ws.set(r, i, isNum && !v.includes('%') ? Number(v.replace(',', '.')) : v, i === 0 ? 'label' : tot ? 'total' : spec.cols[i - 1].f ? 'calc' : 'tdn'); }); r++;
    }
    r++;
    if (tid === 't31') {
      ws.set(r, 0, '3.2 Autres activités menées', 'section'); for (let c = 1; c < 6; c++) ws.set(r, c, '', 'section'); r++;
      ['N°', 'Lieu', 'Période', 'Désignation', '', 'Participants'].forEach((t, i) => ws.set(r, i, t, 'th')); ws.merge(r, 3, r, 4); r++;
      for (const [i, x] of (b.lists.autres || []).entries()) { ws.set(r, 0, i + 1, 'tdc'); ws.set(r, 1, x.lieu || '', 'td'); ws.set(r, 2, x.periode || '', 'td'); ws.set(r, 3, x.designation || '', 'td'); ws.set(r, 4, '', 'td'); ws.merge(r, 3, r, 4); ws.set(r, 5, x.participants || '', 'td'); r++; } r++;
    }
  }
  ws.set(r, 0, '6. ANALYSES', 'section'); for (let c = 1; c < 12; c++) ws.set(r, c, '', 'section'); r++;
  for (const [k, l] of [['quant', 'Analyse quantitative'], ['qual', 'Analyse qualitative'], ['genre', 'Genre'], ['champs', 'Disciplines'], ['up', 'Unités pédagogiques'], ['conclusion', 'Conclusion'], ['commentaires', 'Commentaires'], ['perspectives', 'Perspectives']]) { ws.set(r, 0, l, 'label'); ws.set(r, 1, b.textes[k] || '', 'td'); ws.merge(r, 1, r, 12); ws.height(r, Math.max(18, Math.ceil((b.textes[k] || '').length / 110) * 14)); r++; }
  r++; ws.set(r, 0, '7. DIFFICULTÉS MAJEURES', 'section'); for (let c = 1; c < 6; c++) ws.set(r, c, '', 'section'); r++;
  ['Ordre', 'Désignation', '', 'Ampleur (%)', 'Observations'].forEach((t, i) => ws.set(r, i, t, 'th')); ws.merge(r, 1, r, 2); r++;
  (b.lists.problemes || []).forEach((x, i) => { ws.set(r, 0, i + 1, 'tdc'); ws.set(r, 1, x.designation || '', 'td'); ws.set(r, 2, '', 'td'); ws.merge(r, 1, r, 2); ws.set(r, 3, x.ampleur || '', 'tdc'); ws.set(r, 4, x.obs || '', 'td'); r++; });
  r += 2; ws.set(r, 0, CREDIT_DOC, 'note');
  /* feuille de données (permet de recharger le fichier) */
  const dd = wb.sheet('Données'); let q = dd.banner(ban, 700);
  dd.width(0, 36); dd.width(1, 90); dd.set(q, 0, 'MEMP-BILAN', 'bold'); dd.set(q, 1, 'Ne pas modifier cette feuille : elle permet de recharger ce fichier dans l\'Application CP.', 'note'); q++;
  const put = (k, v) => { dd.set(q, 0, k, 'td'); dd.set(q, 1, v, 'td'); q++; };
  put('meta', JSON.stringify({ niveau: b.niveau, periode: b.periode, annee: b.annee, actors: b.actors, codeCs: b.codeCs, codeZone: b.codeZone, departement: b.departement, statut: b.statut }));
  put('entete', JSON.stringify(b.entete)); put('textes', JSON.stringify(b.textes)); put('lists', JSON.stringify(b.lists));
  for (const [k, v] of Object.entries(b.data)) if (v !== '' && v !== null) put('d.' + k, String(v));
  return wb.toBlob();
}

export async function bilanFromXlsx(buf, user) {
  const sheets = await readXlsx(buf), s = sheets.find(x => x.name === 'Données'); if (!s) throw new Error("Ce fichier Excel n'a pas été produit par l'Application CP (feuille « Données » absente).");
  const m = {}, data = {};
  for (const row of s.rows) { const k = row && row[0]; if (!k) continue; if (k.startsWith('d.')) data[k.slice(2)] = String(row[1] ?? ''); else m[k] = row[1]; }
  if (!m.meta) throw new Error('Données du bilan introuvables.');
  const meta = JSON.parse(m.meta), b = newBilan({ niveau: meta.niveau, periode: meta.periode, annee: meta.annee, user: user || {}, zones: 0 });
  Object.assign(b, { actors: meta.actors, codeCs: meta.codeCs, codeZone: meta.codeZone, departement: meta.departement, data }); b.entete = { ...b.entete, ...JSON.parse(m.entete || '{}') }; b.textes = { ...b.textes, ...JSON.parse(m.textes || '{}') }; b.lists = { autres: [], problemes: [], ...JSON.parse(m.lists || '{}') };
  return b;
}

/** Fichier JSON (sauvegarde / échange) : bilan + photos, avec armoiries et crédit */
export async function bilanToJson(b, photos) {
  return new Blob([JSON.stringify({ format: 'MEMP-BILAN', version: 1, republique: APP.republique, ministere: APP.ministere, concepteur: CREDIT, embleme: bytesToB64(await fetchBytes('assets/armoiries.png')), date: nowISO(), bilan: b, photos })], { type: 'application/json' });
}
export function bilanFromJson(text) {
  const o = JSON.parse(text); if (o.format !== 'MEMP-BILAN' || !o.bilan) throw new Error("Ce fichier n'est pas un bilan de l'Application CP.");
  return { bilan: o.bilan, photos: o.photos || [] };
}
