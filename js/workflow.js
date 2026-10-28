/* République du Bénin — MEMP — Circuit de validation (CP → CCS) et exports signés
   Conception : Maître Aimé FACHOLA */
import { db } from './db.js';
import { nowISO, toast, download, clean, promptBox, confirmBox, hasNum } from './util.js';
import { inScope, addLog, session } from './data.js';
import { sectionsFor, FICHE_TYPES, gridValue } from './schema.js';
import { ficheToPdf, ficheToXlsx, reportToPdf, reportToXlsx } from './export.js';
import { getIdentity, makeCachet, ficheHash, reportHash, registerSigned, qrPayload } from './sign.js';
import { KIND_DOC, valeursFiche, figerFiche } from './rapports.js';
import { dataUrlToBytes } from './util.js';

export const isEditableStatut = (s) => s === 'Brouillon' || s === 'À corriger' || !s;
export function canEdit(user, rec) {
  if (user.role === 'ADMIN') return true;
  // le CCS peut aussi remplir lui-même une fiche (saisie manuelle, école sans CP ou fiche reçue sur papier)
  if (user.role === 'CP' || user.role === 'DOSP' || user.role === 'CCS') return inScope(user, rec) && isEditableStatut(rec.statut);
  return false;
}
export const canTransmit = (user, rec) => (user.role === 'CP' || user.role === 'DOSP' || user.role === 'CCS' || user.role === 'ADMIN') && isEditableStatut(rec.statut) && inScope(user, rec);
export const canValidate = (user, rec) => (user.role === 'CCS' || user.role === 'DOSP' || user.role === 'ADMIN') && rec.statut === 'Transmise' && inScope(user, rec);

/** Taux de remplissage d'une fiche (champs + grilles + personnel), pour information */
export function completion(f) {
  if (f.format === 'gescol' && typeof f.completion === 'number') return f.completion;
  let tot = 0, filled = 0;
  for (const s of sectionsFor(f.kind)) {
    if (s.type === 'fields') for (const x of s.fields) { tot++; const v = f.data[x.k]; if (x.t === 'check' ? v : (v !== undefined && v !== '' && v !== null)) filled++; }
    else if (s.type === 'grid') for (const r of s.rows) for (const g of s.groups) for (const c of g.cols) { if ((g.calc === 'groups') || c.calc) continue; tot++; if (hasNum(f.data[`${s.id}.${r.k}.${g.k}.${c.k}`])) filled++; }
    else if (s.type === 'personnel') { tot += 3; const n = (f.perso || []).filter(p => (p.nom || '').trim()).length; filled += Math.min(3, n); }
  }
  return tot ? Math.round(filled / tot * 100) : 0;
}

export async function changeStatut(user, rec, store, to, action, comment = '') {
  const from = rec.statut;
  rec.statut = to; rec.comment = comment || ''; rec.updated = nowISO();
  (rec.history = rec.history || []).push({ date: nowISO(), action, by: user.username, role: user.role, from, to, comment });
  await db.put(store, rec);
  await addLog(user, { action, target: store === 'bilans' ? `Bilan ${rec.niveau === 'CS' ? 'CS' : 'zone'} ${rec.periode} (${rec.annee})` : store === 'fiches' ? `${FICHE_TYPES[rec.kind].court} — ${rec.schoolNom} (${rec.annee})` : `Rapport ${rec.cours} — ${rec.schoolNom} (${rec.annee})`, from, to, comment, refId: rec.id });
}

export async function transmit(user, rec, store = 'fiches') {
  if (!canTransmit(user, rec)) { toast('Transmission non autorisée.', 'err'); return false; }
  if (store === 'fiches') { const c = completion(rec); if (c < 50 && !(await confirmBox(`La fiche n'est remplie qu'à ${c} %. Transmettre quand même au CCS ?`, 'Transmettre'))) return false; }
  if (store === 'fiches' && KIND_DOC[rec.kind] && !rec.instantane) await figerFiche(rec, user);
  await changeStatut(user, rec, store, 'Transmise', 'Transmission au CCS');
  toast('Fiche transmise. Exportez le paquet depuis « Transmission & sauvegarde » pour l\'envoyer au CCS.'); return true;
}
export async function validate(user, rec, store = 'fiches') {
  if (!canValidate(user, rec)) { toast('Validation non autorisée.', 'err'); return false; }
  const c = await promptBox('Validation', 'Commentaire (facultatif)'); if (c === null) return false;
  await changeStatut(user, rec, store, 'Validée', 'Validation CCS', c); toast('Fiche validée.'); return true;
}
export async function requestCorrection(user, rec, store = 'fiches') {
  if (!canValidate(user, rec)) { toast('Action non autorisée.', 'err'); return false; }
  const c = await promptBox('Demande de correction', 'Indiquez les corrections attendues'); if (!c) { c === '' && toast('Un motif est obligatoire.', 'err'); return false; }
  await changeStatut(user, rec, store, 'À corriger', 'Demande de correction', c); toast('Correction demandée.'); return true;
}
export async function unlock(user, rec, store = 'fiches') {
  if (user.role !== 'ADMIN') return false;
  await changeStatut(user, rec, store, 'Brouillon', 'Déverrouillage (admin)'); return true;
}

/* ---------- exports ---------- */
export async function exportFiche(rec, fmt, { signed = false, vierge = false, user = session.user } = {}) {
  if (KIND_DOC[rec.kind]) return exportRapport(rec, fmt, { signed, vierge, user });
  const base = clean(`${FICHE_TYPES[rec.kind].court}_${rec.schoolNom}_${rec.annee}`);
  if (fmt === 'xlsx') { download(await ficheToXlsx(rec), base + '.xlsx'); return; }
  let sg = null;
  if (signed) sg = await buildSignature(user, 'fiches', rec, await ficheHash(rec), `${FICHE_TYPES[rec.kind].court} — ${rec.schoolNom}`); if (signed && !sg) return;
  download(new Blob([await ficheToPdf(rec, { signed: sg })], { type: 'application/pdf' }), base + (signed ? '_SIGNE' : '') + '.pdf');
}
export async function exportReport(rec, fmt, { signed = false, user = session.user } = {}) {
  const base = clean(`Rapport_fin_annee_${rec.schoolNom}_${rec.cours}_${rec.annee}`);
  if (fmt === 'xlsx') { download(await reportToXlsx(rec), base + '.xlsx'); return; }
  let sg = null;
  if (signed) sg = await buildSignature(user, 'classReports', rec, await reportHash(rec), `Rapport ${rec.cours} — ${rec.schoolNom}`); if (signed && !sg) return;
  download(new Blob([await reportToPdf(rec, { signed: sg })], { type: 'application/pdf' }), base + (signed ? '_SIGNE' : '') + '.pdf');
}
async function buildSignature(user, store, rec, hash, label) {
  const idn = await getIdentity();
  if (!idn || !idn.signature) { toast('Enregistrez d\'abord votre signature dans « Identité numérique CP ».', 'err'); location.hash = '#/identite'; return null; }
  const reg = await registerSigned({ ficheId: rec.id, store, hash, user: { ...user, codeCp: idn.codeCp || user.codeCp }, label });
  return { docId: reg.id, hash, codeCp: idn.codeCp, nom: `${idn.prenoms || ''} ${idn.nom || ''}`.trim(), date: reg.date, signature: idn.signature, cachet: await makeCachet(idn) };
}

/** Fiches de rapport de rentrée / fin d'année (modèle GESCOL / SCOLARIS) : PDF rempli, vierge, signé ; Excel */
async function exportRapport(rec, fmt, { signed, vierge, user }) {
  const { D, doc, finales, origine } = await valeursFiche(rec, user), info = D.docs[doc];
  const base = clean(`${info.court}_${vierge ? 'vierge' : rec.schoolNom + '_' + rec.annee}`);
  if (fmt === 'xlsx') { const { excelRapport } = await import('./rapports-xlsx.js'); download(await excelRapport(D, doc, rec.annee, finales, origine), base + '.xlsx'); return; }
  const { pdfRapport } = await import('./rapports-pdf.js');
  let signe = null;
  if (signed && !vierge) {
    const sg = await buildSignature(user, 'fiches', rec, await ficheHash(rec), `${info.court} — ${rec.schoolNom}`); if (!sg) return;
    signe = { role: 'Le Conseiller Pédagogique', nom: sg.nom, signature: sg.signature && dataUrlToBytes(sg.signature), cachet: sg.cachet && dataUrlToBytes(sg.cachet), qrText: qrPayload(sg.docId, sg.hash, sg.codeCp),
      lignes: [`${info.fiche} · ${rec.schoolNom} · ${rec.annee} · statut : ${rec.statut || 'Brouillon'}`, `Document n° ${sg.docId} · Empreinte SHA-256 : ${sg.hash.slice(0, 32)}…`,
        `Signé numériquement le ${new Date(sg.date).toLocaleString('fr-FR')} · Vérifiable dans l'Application CP (menu « Vérifier un document »).`] };
  }
  const bytes = await pdfRapport(D, doc, rec.annee, vierge ? {} : finales, { vierge, signe });
  download(new Blob([bytes], { type: 'application/pdf' }), base + (signe ? '_SIGNE' : '') + '.pdf');
}
