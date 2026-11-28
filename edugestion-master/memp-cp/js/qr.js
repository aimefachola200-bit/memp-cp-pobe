/* République du Bénin — MEMP — Générateur de QR code (mode octets, correction L/M, versions 1-40).
   Algorithme standard ISO/IEC 18004 — implémentation autonome, sans dépendance. */

const ECC_PER_BLOCK = { L: [-1,7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
                        M: [-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28] };
const NUM_BLOCKS = { L: [-1,1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
                     M: [-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49] };
const FMT = { L: 1, M: 0 };

const rawModules = (v) => {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) { const a = Math.floor(v / 7) + 2; r -= (25 * a - 10) * a - 55; if (v >= 7) r -= 36; }
  return r;
};
const dataCodewords = (v, e) => Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[e][v] * NUM_BLOCKS[e][v];
const gmul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z; };
function rsDivisor(deg) {
  const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1;
  for (let i = 0; i < deg; i++) { for (let j = 0; j < deg; j++) { r[j] = gmul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; } root = gmul(root, 2); }
  return r;
}
function rsRemainder(data, div) {
  const r = div.map(() => 0);
  for (const b of data) { const fct = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gmul(c, fct); }); }
  return r;
}
const bit = (x, i) => ((x >>> i) & 1) !== 0;

function alignPositions(v) {
  if (v === 1) return [];
  const n = Math.floor(v / 7) + 2, size = v * 4 + 17;
  const step = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
  const res = [6];
  for (let pos = size - 7; res.length < n; pos -= step) res.splice(1, 0, pos);
  return res;
}

function addEcc(data, v, e) {
  const nb = NUM_BLOCKS[e][v], el = ECC_PER_BLOCK[e][v], raw = Math.floor(rawModules(v) / 8);
  const nShort = nb - (raw % nb), shortLen = Math.floor(raw / nb);
  const blocks = [], div = rsDivisor(el);
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - el + (i < nShort ? 0 : 1)); k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < nShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const out = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - el || j >= nShort) out.push(b[i]); });
  return out;
}

export function qrMatrix(text, ecc = 'M') {
  const bytes = [...new TextEncoder().encode(text)];
  let ver = 0, e = ecc;
  for (let v = 1; v <= 40; v++) {
    const cap = dataCodewords(v, e) * 8, need = 4 + (v <= 9 ? 8 : 16) + bytes.length * 8;
    if (need <= cap) { ver = v; break; }
  }
  if (!ver && e === 'M') { e = 'L'; for (let v = 1; v <= 40; v++) if (4 + (v <= 9 ? 8 : 16) + bytes.length * 8 <= dataCodewords(v, e) * 8) { ver = v; break; } }
  if (!ver) throw new Error('Texte trop long pour un QR code');
  const bits = [];
  const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  push(4, 4); push(bytes.length, ver <= 9 ? 8 : 16); bytes.forEach(b => push(b, 8));
  const cap = dataCodewords(ver, e) * 8;
  push(0, Math.min(4, cap - bits.length)); push(0, (8 - bits.length % 8) % 8);
  for (let p = 0xec; bits.length < cap; p ^= 0xec ^ 0x11) push(p, 8);
  const data = []; for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }
  const all = addEcc(data, ver, e);

  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const setFn = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy; if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, d !== 2 && d !== 4); } };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const ap = alignPositions(ver), na = ap.length;
  for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const drawFormat = (mask) => {
    const d = (FMT[e] << 3) | mask; let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const b = ((d << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) setFn(8, i, bit(b, i));
    setFn(8, 7, bit(b, 6)); setFn(8, 8, bit(b, 7)); setFn(7, 8, bit(b, 8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(b, i));
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(b, i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(b, i));
    setFn(8, size - 8, true);
  };
  drawFormat(0);
  if (ver >= 7) {
    let rem = ver; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const b = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) { const c = bit(b, i), a = size - 11 + (i % 3), q = Math.floor(i / 3); setFn(a, q, c); setFn(q, a, c); }
  }
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!fn[y][x] && k < all.length * 8) { mod[y][x] = bit(all[k >>> 3], 7 - (k & 7)); k++; }
    }
  }
  const applyMask = (m) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let inv;
      switch (m) {
        case 0: inv = (x + y) % 2 === 0; break; case 1: inv = y % 2 === 0; break; case 2: inv = x % 3 === 0; break; case 3: inv = (x + y) % 3 === 0; break;
        case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break; case 5: inv = (x * y) % 2 + (x * y) % 3 === 0; break;
        case 6: inv = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break; default: inv = ((x + y) % 2 + (x * y) % 3) % 2 === 0;
      }
      if (!fn[y][x] && inv) mod[y][x] = !mod[y][x];
    }
  };
  const penalty = () => {
    let p = 0;
    const lineScore = (get) => {
      let s = 0;
      for (let a = 0; a < size; a++) {
        let run = 1;
        for (let b = 1; b < size; b++) { if (get(a, b) === get(a, b - 1)) { run++; if (b === size - 1 && run >= 5) s += run - 2; } else { if (run >= 5) s += run - 2; run = 1; } }
        for (let b = 0; b + 11 <= size; b++) {
          const w = []; for (let t = 0; t < 11; t++) w.push(get(a, b + t) ? 1 : 0);
          const st = w.join('');
          if (st === '10111010000' || st === '00001011101') s += 40;
        }
      }
      return s;
    };
    p += lineScore((a, b) => mod[a][b]) + lineScore((a, b) => mod[b][a]);
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3; }
    let dark = 0; for (const r of mod) for (const c of r) if (c) dark++;
    p += (Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1) * 10;
    return p;
  };
  let best = 0, bestP = Infinity;
  for (let m = 0; m < 8; m++) { applyMask(m); drawFormat(m); const p = penalty(); if (p < bestP) { best = m; bestP = p; } applyMask(m); }
  applyMask(best); drawFormat(best);
  return { size, modules: mod, version: ver };
}

/** PNG (data URL) du QR code, pour l'affichage et l'incrustation */
export function qrDataURL(text, scale = 6, margin = 4, ecc = 'M') {
  const { size, modules } = qrMatrix(text, ecc);
  const px = (size + margin * 2) * scale;
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, px, px); g.fillStyle = '#000';
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (modules[y][x]) g.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale);
  return c.toDataURL('image/png');
}
