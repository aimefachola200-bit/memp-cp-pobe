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
export const ficheHash = (f) => sha256(canonical({ kind: f.kind, annee: f.annee, ecole: f.schoolCode, data: f.data, perso: f.perso }));
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
export async function makeCachet(idn, date = new Date()) {
  const W = 640, H = 300, c = h('canvas', { width: W, height: H }), g = c.getContext('2d');
  const col = '#1b3a8a';
  g.fillStyle = 'rgba(255,255,255,0)'; g.clearRect(0, 0, W, H);
  g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(6, 6, W - 12, H - 12); g.lineWidth = 2; g.strokeRect(16, 16, W - 32, H - 32);
  try { const a = await loadImg('assets/armoiries.png'); const s = 62 / a.height; g.drawImage(a, 30, 28, a.width * s, a.height * s); g.globalAlpha = 1; } catch { /* image facultative */ }
  g.fillStyle = col; g.textAlign = 'center';
  const lines = [
    ['RÉPUBLIQUE DU BÉNIN', 'bold 26px Arial'],
    ['MINISTÈRE DES ENSEIGNEMENTS MATERNEL ET PRIMAIRE', 'bold 16px Arial'],
    [`CIRCONSCRIPTION SCOLAIRE DE ${(idn.nomCs || '…').toUpperCase()}`, 'bold 18px Arial'],
    [`Zone pédagogique n° ${idn.numZone || '…'}${idn.departement ? ' — ' + idn.departement : ''}`, '17px Arial'],
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
