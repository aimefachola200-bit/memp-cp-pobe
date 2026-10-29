/* République du Bénin — MEMP — Identité numérique du CP : signature manuscrite, cachet, QR, empreinte des documents */
import { h, sha256, uid, nowISO, dataUrlToBytes } from './util.js';
import { db } from './db.js';

export const getIdentity = async () => (await db.setting('cpIdentity')) || null;
export const saveIdentity = (i) => db.setting('cpIdentity', i);

/** Représentation canonique (clés triées) pour calculer une empreinte stable */
export function canonical(o) {
  if (Array.isArray(o)) return '[' + o.map(canonical).join(',') + ']';
  if (o && typeof o === 'object') return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
  return JSON.stringify(o ?? null);
}
export const ficheHash = (f) => sha256(canonical({ kind: f.kind, annee: f.annee, ecole: f.schoolCode, data: f.data, perso: f.perso, ...(f.format === 'gescol' ? { valeurs: f.valeurs || {} } : {}) }));
export const reportHash = (r) => sha256(canonical({ annee: r.annee, ecole: r.schoolCode, cours: r.cours, rows: r.rows }));

export const bilanHash = (b) => sha256(canonical({ niveau: b.niveau, periode: b.periode, annee: b.annee, cs: b.codeCs, zone: b.codeZone, actors: b.actors, data: b.data, lists: b.lists, textes: b.textes, entete: b.entete }));
export const qrPayload = (docId, hash, codeCp) => `MEMP-BJ|1|${docId}|${hash.slice(0, 32)}|${codeCp || '-'}`;

/** Enregistre un document signé dans le registre local (vérifiable ensuite) */
export async function registerSigned({ ficheId, store = 'fiches', hash, user, label }) {
  const id = 'D' + uid().replace(/-/g, '').slice(0, 10).toUpperCase();
  const rec = { id, ficheId, store, hash, date: nowISO(), cp: user.codeCp || user.username, by: user.username, label };
  await db.put('docs', rec);
  return rec;
}

function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }

/** Cachet numérique rectangulaire (PNG dataURL) */
/* ---------- Cachet rond (même dessin que SCOLARIS / GESCOL : texte en arc \uE05D texte en arc \uE05D, texte central) ---------- */
export const COULEURS_CACHET = { bleu: '#1E3A8A', rouge: '#B91C1C' };
export function cachetParDefaut(idn) {
  const cs = (idn.nomCs || '').toUpperCase(), ccs = /circonscription/i.test(idn.titre || ''), dd = /d[ée]partement/i.test(idn.titre || '');
  if (/organisation scolaire|dosp/i.test(idn.titre || '')) return { sup: 'RÉPUBLIQUE DU BÉNIN - MEMP', inf: cs ? `CIRCONSCRIPTION SCOLAIRE DE ${cs}` : 'CIRCONSCRIPTION SCOLAIRE', centre: 'LE CHEF|DE LA DOSP' };
  if (dd) return { sup: 'RÉPUBLIQUE DU BÉNIN - MEMP', inf: idn.departement ? `DDEMP ${idn.departement.toUpperCase()}` : 'DIRECTION DÉPARTEMENTALE', centre: 'LE DIRECTEUR|DÉPARTEMENTAL' };
  return { sup: 'RÉPUBLIQUE DU BÉNIN - MEMP', inf: cs ? `CIRCONSCRIPTION SCOLAIRE DE ${cs}` : (idn.departement ? `DDEMP ${idn.departement.toUpperCase()}` : 'DIRECTION DÉPARTEMENTALE'),
    centre: ccs ? 'CHEF DE LA|CIRCONSCRIPTION|SCOLAIRE' : `CONSEILLER|PÉDAGOGIQUE${idn.numZone ? '|ZONE ' + idn.numZone : ''}` };
}
export function makeCachetRond(idn, taille = 420) {
  const d = cachetParDefaut(idn), sup = (idn.cachetSup || d.sup).toUpperCase(), inf = (idn.cachetInf || d.inf).toUpperCase(), centre = (idn.cachetCentre || d.centre).toUpperCase();
  const col = COULEURS_CACHET[idn.cachetCouleur] || COULEURS_CACHET.bleu;
  const c = h('canvas', { width: taille, height: taille }), g = c.getContext('2d'), r = taille / 2, rt = r * 0.74, fs0 = r * 0.17;
  g.clearRect(0, 0, taille, taille); g.strokeStyle = col; g.fillStyle = col; g.globalAlpha = 0.92;
  const cercle = (rr, lw) => { g.lineWidth = lw; g.beginPath(); g.arc(r, r, rr, 0, Math.PI * 2); g.stroke(); };
  cercle(r - 4, taille * 0.018); cercle(r * 0.9, taille * 0.005); cercle(r * 0.56, taille * 0.008);
  const arc = (texte, haut) => {
    if (!texte) return;
    let fs = fs0; g.font = `bold ${fs}px Arial, Helvetica, sans-serif`;
    let larg = [...texte].map(ch => g.measureText(ch).width + fs * 0.08), total = larg.reduce((a, b) => a + b, 0) / rt * 180 / Math.PI;
    if (total > 150) { const f = 150 / total; fs *= f; larg = larg.map(w => w * f); total = 150; g.font = `bold ${fs}px Arial, Helvetica, sans-serif`; }
    let cumul = 0; g.textAlign = 'center'; g.textBaseline = 'middle';
    [...texte].forEach((ch, i) => {
      const pas = larg[i] / rt * 180 / Math.PI, milieu = cumul + pas / 2; cumul += pas;
      const a = haut ? 90 + total / 2 - milieu : 270 - total / 2 + milieu, rad = a * Math.PI / 180;
      const x = r + rt * Math.cos(rad), y = r - rt * Math.sin(rad), rot = (haut ? 90 - a : 270 - a) * Math.PI / 180;
      g.save(); g.translate(x, y); g.rotate(rot); g.fillText(ch, 0, 0); g.restore();
    });
  };
  arc(sup, true); arc(inf, false);
  const etoile = (x, y, rr) => { g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, q = k % 2 ? rr * 0.42 : rr; g.lineTo(x + q * Math.cos(a), y + q * Math.sin(a)); } g.closePath(); g.fill(); };
  etoile(r + rt, r, fs0 * 0.55); etoile(r - rt, r, fs0 * 0.55);
  const lignes = centre.split('|').map(x => x.trim()).filter(Boolean);
  if (lignes.length) {
    let fc = r * 0.2; g.font = `bold ${fc}px Arial, Helvetica, sans-serif`;
    const maxW = r * 1.0, w = Math.max(...lignes.map(l => g.measureText(l).width)); if (w > maxW) fc *= maxW / w;
    fc = Math.min(fc, (r * 1.0) / (lignes.length * 1.2)); g.font = `bold ${fc}px Arial, Helvetica, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const y0 = r - (lignes.length - 1) * fc * 0.6; lignes.forEach((l, k) => g.fillText(l, r, y0 + k * fc * 1.2));
  }
  return c.toDataURL('image/png');
}
/** Cachet apposé sur les documents : rond par défaut (comme SCOLARIS / GESCOL), rectangulaire au choix */
export async function makeCachet(idn, date = new Date()) {
  return (idn.cachetType || 'rond') === 'rond' ? makeCachetRond(idn) : makeCachetRect(idn, date);
}
export async function makeCachetRect(idn, date = new Date()) {
  const W = 640, H = 300, c = h('canvas', { width: W, height: H }), g = c.getContext('2d');
  const col = '#1b3a8a';
  g.fillStyle = 'rgba(255,255,255,0)'; g.clearRect(0, 0, W, H);
  g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(6, 6, W - 12, H - 12); g.lineWidth = 2; g.strokeRect(16, 16, W - 32, H - 32);
  try { const a = await loadImg('assets/armoiries.png'); const s = 62 / a.height; g.drawImage(a, 30, 28, a.width * s, a.height * s); g.globalAlpha = 1; } catch { /* image facultative */ }
  g.fillStyle = col; g.textAlign = 'center';
  const lines = [
    ['RÉPUBLIQUE DU BÉNIN', 'bold 26px Arial'],
    ['MINISTÈRE DES ENSEIGNEMENTS MATERNEL ET PRIMAIRE', 'bold 16px Arial'],
    ...(/d[ée]partement/i.test(idn.titre || '')
      ? [[`DIRECTION DÉPARTEMENTALE DES EMP${idn.departement ? ' — ' + idn.departement.toUpperCase() : ''}`, 'bold 18px Arial'], ['', '17px Arial']]
      : [[`CIRCONSCRIPTION SCOLAIRE DE ${(idn.nomCs || '…').toUpperCase()}`, 'bold 18px Arial'],
        [/organisation scolaire/i.test(idn.titre || '') ? "Division de l'Organisation Scolaire et de la Prévision" : /circonscription/i.test(idn.titre || '') ? (idn.departement ? 'Département : ' + idn.departement : '') : `Zone pédagogique n° ${idn.numZone || '…'}${idn.departement ? ' — ' + idn.departement : ''}`, '17px Arial']]),
    [idn.titre || 'Le Conseiller Pédagogique', 'italic 17px Arial'],
    [`${idn.prenoms || ''} ${(idn.nom || '').toUpperCase()}`.trim(), 'bold 22px Arial'],
    [date.toLocaleDateString('fr-FR') + (idn.codeCp ? '  ·  ' + idn.codeCp : ''), '15px Arial'],
  ];
  let y = 58;
  lines.forEach(([t, f], i) => { g.font = f; g.fillText(t, i < 2 ? W / 2 + 75 : W / 2, y, i < 2 ? W - 210 : W - 70); y += i === 0 ? 30 : i === 1 ? 32 : 34; });
  return c.toDataURL('image/png');
}

/** Zone de dessin de la signature manuscrite (souris, tactile, stylet) */
export function signaturePad(initial) {
  const cv = h('canvas', { width: 600, height: 220, class: 'sig-canvas' });
  const g = cv.getContext('2d'); g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#0a2a6b';
  let drawing = false, dirty = false, last = null;
  if (initial) loadImg(initial).then(i => { g.drawImage(i, 0, 0, cv.width, cv.height); }).catch(() => {});
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', (e) => { drawing = true; last = pos(e); cv.setPointerCapture(e.pointerId); g.beginPath(); g.arc(last.x, last.y, 1.2, 0, 7); g.fillStyle = '#0a2a6b'; g.fill(); dirty = true; });
  cv.addEventListener('pointermove', (e) => { if (!drawing) return; const p = pos(e); g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke(); last = p; });
  const up = () => { drawing = false; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  return {
    el: cv,
    clear() { g.clearRect(0, 0, cv.width, cv.height); dirty = false; },
    get dirty() { return dirty; },
    toDataURL() { return cv.toDataURL('image/png'); },
  };
}
export { dataUrlToBytes };
