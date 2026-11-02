/* République du Bénin — Ministère des Enseignements Maternel et Primaire (MEMP)
   Application CP — utilitaires */

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/** Mini constructeur DOM : h('div', {class:'x', onclick:fn}, 'texte', autreNoeud) */
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs !== null && attrs !== undefined && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'readOnly' || k === 'hidden') el[k] = !!v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
export const nowISO = () => new Date().toISOString();
export const today = () => new Date().toISOString().slice(0, 10);
export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}
export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + (String(iso).length === 10 ? 'T12:00:00' : ''));
  return isNaN(d) ? String(iso) : d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}
export const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
export const hasNum = (v) => v !== '' && v !== null && v !== undefined && isFinite(parseFloat(String(v).replace(',', '.')));
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const slug = (s, n = 24) => norm(s).replace(/ /g, '-').slice(0, n);
export const clean = (s) => String(s ?? 'document').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_');

export function currentSchoolYear(d = new Date()) {
  const y = d.getFullYear(), m = d.getMonth() + 1;
  return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

/* ---------- SHA-256 (WebCrypto avec repli pur JS) ---------- */
function sha256js(bytes) {
  const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const l = bytes.length, nb = ((l + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(nb); m.set(bytes); m[l] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(nb - 8, Math.floor((l * 8) / 4294967296)); dv.setUint32(nb - 4, (l * 8) >>> 0);
  const w = new Uint32Array(64);
  const rr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < nb; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rr(w[i-15],7) ^ rr(w[i-15],18) ^ (w[i-15] >>> 3), s1 = rr(w[i-2],17) ^ rr(w[i-2],19) ^ (w[i-2] >>> 10);
      w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0;
    }
    let [a,b,c,d,e,f,g,hh] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rr(e,6) ^ rr(e,11) ^ rr(e,25), ch = (e & f) ^ (~e & g), t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rr(a,2) ^ rr(a,13) ^ rr(a,22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0]+=a; H[1]+=b; H[2]+=c; H[3]+=d; H[4]+=e; H[5]+=f; H[6]+=g; H[7]+=hh;
  }
  return [...H].map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
export async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  if (globalThis.crypto && crypto.subtle) {
    try {
      const d = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
    } catch { /* repli */ }
  }
  return sha256js(bytes);
}
export const sha256Sync = (text) => sha256js(new TextEncoder().encode(text));

export async function hashPassword(pw, salt) {
  salt = salt || uid();
  if (globalThis.crypto && crypto.subtle) {
    try {
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 }, key, 256);
      return { salt, algo: 'pbkdf2', hash: [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('') };
    } catch { /* repli */ }
  }
  let x = salt + pw; for (let i = 0; i < 1500; i++) x = sha256Sync(x + salt);
  return { salt, algo: 'sha256x', hash: x };
}
export async function checkPassword(pw, rec) {
  const r = await hashPassword(pw, rec.salt);
  if (r.algo !== rec.algo) {            // compte créé avec un autre moteur : on recalcule avec le même
    if (rec.algo === 'sha256x') { let x = rec.salt + pw; for (let i = 0; i < 1500; i++) x = sha256Sync(x + rec.salt); return x === rec.hash; }
    return false;
  }
  return r.hash === rec.hash;
}

/* ---------- fichiers ---------- */
export function download(data, name, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export function pickFile(accept) {
  return new Promise((res) => {
    const i = h('input', { type: 'file', accept, style: { display: 'none' } });
    i.addEventListener('change', () => { res(i.files[0] || null); i.remove(); });
    i.addEventListener('cancel', () => { res(null); i.remove(); });
    document.body.appendChild(i); i.click();
  });
}
export const readAsText = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(f); });
export const readAsBuffer = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsArrayBuffer(f); });
export async function fetchBytes(url) { const r = await fetch(url); if (!r.ok) throw new Error('Ressource introuvable : ' + url); return new Uint8Array(await r.arrayBuffer()); }
export function bytesToB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
export function b64ToBytes(b64) { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
export function dataUrlToBytes(du) { return b64ToBytes(du.split(',')[1]); }

/* ---------- toasts / modales ---------- */
export function toast(msg, kind = 'ok', ms = 3500) {
  let box = $('#toasts');
  if (!box) { box = h('div', { id: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(box); }
  const t = h('div', { class: 'toast ' + kind }, msg);
  box.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function modal({ title, body, actions = [], wide = false, onClose }) {
  const close = () => { ov.remove(); document.removeEventListener('keydown', esc); onClose && onClose(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const ov = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === ov) close(); } },
    h('div', { class: 'dialog' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'dialog-head' }, h('h3', title), h('button', { class: 'icon-btn', title: 'Fermer', onclick: close }, '✕')),
      h('div', { class: 'dialog-body' }, body),
      h('div', { class: 'dialog-foot' }, actions.map(a => h('button', {
        class: 'btn ' + (a.kind || ''), onclick: async (e) => {
          const r = a.onClick ? await a.onClick(e, close) : undefined;
          if (r !== false && !a.keepOpen) close();
        }
      }, a.label)))));
  document.body.appendChild(ov);
  document.addEventListener('keydown', esc);
  const f = ov.querySelector('input,select,textarea'); f && f.focus();
  return { close, el: ov };
}
export const confirmBox = (msg, okLabel = 'Confirmer', danger = false) => new Promise((res) => {
  modal({ title: 'Confirmation', body: h('p', msg), onClose: () => res(false),
    actions: [{ label: 'Annuler', onClick: () => res(false) }, { label: okLabel, kind: danger ? 'danger' : 'primary', onClick: () => res(true) }] });
});
export const promptBox = (title, label, value = '', type = 'text') => new Promise((res) => {
  const i = h('input', { type, value, class: 'input' });
  modal({ title, body: h('label', { class: 'field' }, h('span', label), i), onClose: () => res(null),
    actions: [{ label: 'Annuler', onClick: () => res(null) }, { label: 'OK', kind: 'primary', onClick: () => res(i.value) }] });
});
