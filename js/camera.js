/* République du Bénin — MEMP — Appareil photo (caméra frontale ou arrière) pour joindre des preuves photographiques.
   Conception : Maître Aimé FACHE — Tél. 01 96 51 03 33 */
import { h, modal, toast } from './util.js';

/* v1.10.10 — avant / arrière : appareil choisi d'après son nom (front / back, avant / arrière…), sinon le suivant :
   certains téléphones ignorent « facingMode » et rouvraient toujours la même caméra. */
async function camerasVideo() { try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput'); } catch (e) { return []; } }
function choisirCamera(cams, face, actuel) {
  if (!cams || cams.length < 2) return null;
  const re = face === 'user' ? /front|avant|user|selfie|facing front/i : /back|arri[eè]re|rear|environment|facing back/i;
  const parNom = cams.filter(c => re.test(c.label || ''));
  const autre = parNom.find(c => c.deviceId !== actuel) || parNom[0];
  if (autre) return autre.deviceId;
  const i = cams.findIndex(c => c.deviceId === actuel);
  return cams[(i + 1) % cams.length].deviceId;
}
async function ouvrirFlux(face, appareil) {
  const base = { width: { ideal: 1920 }, height: { ideal: 1080 } };
  const essais = appareil ? [{ deviceId: { exact: appareil } }] : [];
  essais.push({ facingMode: { exact: face } }, { facingMode: { ideal: face } }, {});
  let err = null;
  for (const v of essais) {
    try { return await navigator.mediaDevices.getUserMedia({ video: Object.assign({}, v, base), audio: false }); } catch (e) { err = e; if (e.name === 'NotAllowedError' || e.name === 'SecurityError') throw e; }
  }
  throw err;
}

const MAX = 1280;
/** Réduit une image (File/Blob/canvas source) à 1280 px max, JPEG 0,8 → dataURL */
export async function shrink(src, { mirror = false } = {}) {
  let w, hgt, draw;
  if (src instanceof Blob) { const bmp = await createImageBitmap(src).catch(() => null); if (bmp) { w = bmp.width; hgt = bmp.height; draw = (g, W, H) => g.drawImage(bmp, 0, 0, W, H); } else { const url = URL.createObjectURL(src); const im = await new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = url; }); w = im.naturalWidth; hgt = im.naturalHeight; draw = (g, W, H) => g.drawImage(im, 0, 0, W, H); } }
  else { w = src.videoWidth || src.width; hgt = src.videoHeight || src.height; draw = (g, W, H) => g.drawImage(src, 0, 0, W, H); }
  const k = Math.min(1, MAX / Math.max(w, hgt)), W = Math.round(w * k), H = Math.round(hgt * k);
  const c = h('canvas', { width: W, height: H }), g = c.getContext('2d');
  if (mirror) { g.translate(W, 0); g.scale(-1, 1); }
  draw(g, W, H); return c.toDataURL('image/jpeg', 0.8);
}

/** Sélection d'une photo depuis la galerie ou l'appareil natif (secours si getUserMedia indisponible) */
export function pickPhoto(captureAttr) {
  return new Promise((res) => {
    const i = h('input', { type: 'file', accept: 'image/*', ...(captureAttr ? { capture: captureAttr } : {}), multiple: !captureAttr, style: { display: 'none' } });
    i.onchange = async () => { const out = []; for (const f of i.files) { try { out.push({ data: await shrink(f), facing: captureAttr === 'user' ? 'user' : captureAttr ? 'environment' : 'galerie' }); } catch { toast('Image illisible : ' + f.name, 'err'); } } i.remove(); res(out); };
    document.body.appendChild(i); i.click();
  });
}

/** Ouvre l'appareil photo ; onCapture(dataUrl, facing) est appelé à chaque prise de vue. Bascule avant/arrière. */
export function openCamera({ onCapture, title = 'Appareil photo' } = {}) {
  let stream = null, facing = 'environment', count = 0, busy = false;
  const video = h('video', { autoplay: true, playsinline: true, muted: true, class: 'cam-video' });
  const info = h('div', { class: 'cam-info' }, 'Démarrage de la caméra…');
  const shots = h('div', { class: 'cam-shots' });
  const stop = () => { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } };
  let appareil = '';
  async function start() {
    stop(); info.textContent = 'Démarrage de la caméra…';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { info.textContent = "Caméra indisponible dans ce navigateur (HTTPS requis). Utilisez « Photo native » ou « Galerie »."; return; }
    try {
      stream = await ouvrirFlux(facing, appareil);
      const tr = stream.getVideoTracks()[0], rg = tr && tr.getSettings ? tr.getSettings() : {}; appareil = rg.deviceId || appareil;
      video.srcObject = stream; await video.play().catch(() => {});
      const st = stream.getVideoTracks()[0].getSettings ? stream.getVideoTracks()[0].getSettings() : {};
      if (st.facingMode) facing = st.facingMode === 'user' ? 'user' : 'environment';
      video.classList.toggle('mirror', facing === 'user');
      info.textContent = facing === 'user' ? 'Caméra avant (selfie)' : 'Caméra arrière';
    } catch (e) { info.textContent = e.name === 'NotAllowedError' ? "Accès à la caméra refusé : autorisez-le dans les réglages du navigateur." : e.name === 'NotFoundError' ? 'Aucune caméra détectée sur cet appareil.' : 'Caméra inaccessible : ' + e.message; }
  }
  const flip = async () => { facing = facing === 'user' ? 'environment' : 'user'; appareil = choisirCamera(await camerasVideo(), facing, appareil) || ''; start(); };
  const snap = async () => {
    if (!stream || busy || !video.videoWidth) return toast("La caméra n'est pas prête.", 'warn');
    busy = true;
    try { const data = await shrink(video, { mirror: facing === 'user' }); count++; shots.append(h('img', { src: data, alt: 'Photo ' + count })); info.textContent = `${count} photo(s) prise(s) · ${facing === 'user' ? 'caméra avant' : 'caméra arrière'}`; await onCapture(data, facing); }
    finally { busy = false; }
  };
  const m = modal({ title, wide: true, onClose: stop, body: h('div', { class: 'cam' }, h('div', { class: 'cam-stage' }, video), info,
    h('div', { class: 'cam-bar' },
      h('button', { class: 'btn', onclick: flip, title: 'Basculer caméra avant / arrière' }, '🔄 Avant ⇄ Arrière'),
      h('button', { class: 'btn primary cam-snap', onclick: snap }, '📸 Prendre la photo'),
      h('button', { class: 'btn', onclick: async () => { for (const p of await pickPhoto(facing === 'user' ? 'user' : 'environment')) { count++; await onCapture(p.data, p.facing); } } }, '📱 Photo native'),
      h('button', { class: 'btn', onclick: async () => { for (const p of await pickPhoto()) { count++; shots.append(h('img', { src: p.data, alt: '' })); await onCapture(p.data, 'galerie'); } } }, '🖼 Galerie')), shots),
    actions: [{ label: 'Terminer', kind: 'primary' }] });
  start(); return m;
}
