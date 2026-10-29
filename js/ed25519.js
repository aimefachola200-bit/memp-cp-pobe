/* Ed25519 (RFC 8032) — signature des paquets de synchronisation, applications JS (MEMP-CP, DOSP, MEMP-CP Pobè, CS Pobè,
   Mon école, ÉduGestion). Utilise WebCrypto « Ed25519 » quand le navigateur le connaît (clés non exportables… exportées ici en
   brut pour être gardées par l'application), sinon cette implémentation en JavaScript (BigInt), compatible octet pour octet.
   API (promesses) : Ed25519.genererCles() → { prive: hex(32), public: hex(32) } ; Ed25519.signer(priveHex, octets) → hex(64) ;
   Ed25519.verifier(publicHex, octets, signatureHex) → booléen ; Ed25519.publicDe(priveHex) → hex.
   Conception : Maître Aimé FACHOLA */
(function (global) {
  'use strict';
  if (global.Ed25519) return;
  const P = 2n ** 255n - 19n, L = 2n ** 252n + 27742317777372353535851937790883648493n;
  const D = 37095705934669439343138083508754565189542113879843219016388785533085940283555n;
  const I = 19681161376707505956807079304988542015446066515923890162744021073123829784752n;   // racine de -1
  const Gx = 15112221349535400772501151409588531511454012693041857206046113283949847762202n;
  const Gy = 46316835694926478169428394003475163141307993866256225615783033603165251855960n;
  const mod = (a, m = P) => { const r = a % m; return r >= 0n ? r : r + m; };
  function pow(b, e, m = P) { let r = 1n; b = mod(b, m); while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; }
  const inv = (a) => pow(a, P - 2n);
  /* points en coordonnées étendues (X, Y, Z, T) */
  const ZERO = [0n, 1n, 1n, 0n], G = [Gx, Gy, 1n, mod(Gx * Gy)];
  function add(p, q) {
    const [X1, Y1, Z1, T1] = p, [X2, Y2, Z2, T2] = q;
    const A = mod((Y1 - X1) * (Y2 - X2)), B = mod((Y1 + X1) * (Y2 + X2)), C = mod(T1 * 2n * D * T2), Dd = mod(Z1 * 2n * Z2);
    const E = B - A, F = Dd - C, Gg = Dd + C, H = B + A;
    return [mod(E * F), mod(Gg * H), mod(F * Gg), mod(E * H)];
  }
  function mul(p, n) { let r = ZERO, q = p; while (n > 0n) { if (n & 1n) r = add(r, q); q = add(q, q); n >>= 1n; } return r; }
  function encode(p) {
    const zi = inv(p[2]), x = mod(p[0] * zi), y = mod(p[1] * zi);
    const b = leBytes(y, 32); if (x & 1n) b[31] |= 0x80; return b;
  }
  function decode(b) {
    if (b.length !== 32) return null;
    const c = b.slice(); const signe = (c[31] & 0x80) !== 0; c[31] &= 0x7f;
    const y = leNum(c); if (y >= P) return null;
    const y2 = y * y % P, u = mod(y2 - 1n), v = mod(D * y2 + 1n);
    let x = mod(u * pow(v, 3n) * pow(u * pow(v, 7n), (P - 5n) / 8n));
    const vx2 = mod(v * x * x);
    if (vx2 === mod(-u)) x = mod(x * I); else if (vx2 !== u) return null;
    if (x === 0n && signe) return null;
    if ((x & 1n) !== (signe ? 1n : 0n)) x = mod(-x);
    return [x, y, 1n, mod(x * y)];
  }
  function leBytes(n, len) { const b = new Uint8Array(len); for (let i = 0; i < len; i++) { b[i] = Number(n & 255n); n >>= 8n; } return b; }
  function leNum(b) { let n = 0n; for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]); return n; }
  const hex = (b) => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  const deHex = (h) => { const s = String(h || ''); if (!/^([0-9a-f]{2})*$/i.test(s)) throw new Error('hexadécimal invalide'); const b = new Uint8Array(s.length / 2); for (let i = 0; i < b.length; i++) b[i] = parseInt(s.substr(i * 2, 2), 16); return b; };
  const concat = (...l) => { const n = l.reduce((s, x) => s + x.length, 0), o = new Uint8Array(n); let k = 0; l.forEach(x => { o.set(x, k); k += x.length; }); return o; };
  const sub = () => (global.crypto && global.crypto.subtle) || null;
  async function sha512(b) {
    if (sub()) return new Uint8Array(await sub().digest('SHA-512', b));
    return sha512js(b);
  }
  /* SHA-512 en JavaScript (repli sans WebCrypto) */
  const K512 = ['428a2f98d728ae22', '7137449123ef65cd', 'b5c0fbcfec4d3b2f', 'e9b5dba58189dbbc', '3956c25bf348b538', '59f111f1b605d019', '923f82a4af194f9b', 'ab1c5ed5da6d8118',
    'd807aa98a3030242', '12835b0145706fbe', '243185be4ee4b28c', '550c7dc3d5ffb4e2', '72be5d74f27b896f', '80deb1fe3b1696b1', '9bdc06a725c71235', 'c19bf174cf692694', 'e49b69c19ef14ad2',
    'efbe4786384f25e3', '0fc19dc68b8cd5b5', '240ca1cc77ac9c65', '2de92c6f592b0275', '4a7484aa6ea6e483', '5cb0a9dcbd41fbd4', '76f988da831153b5', '983e5152ee66dfab', 'a831c66d2db43210',
    'b00327c898fb213f', 'bf597fc7beef0ee4', 'c6e00bf33da88fc2', 'd5a79147930aa725', '06ca6351e003826f', '142929670a0e6e70', '27b70a8546d22ffc', '2e1b21385c26c926', '4d2c6dfc5ac42aed',
    '53380d139d95b3df', '650a73548baf63de', '766a0abb3c77b2a8', '81c2c92e47edaee6', '92722c851482353b', 'a2bfe8a14cf10364', 'a81a664bbc423001', 'c24b8b70d0f89791', 'c76c51a30654be30',
    'd192e819d6ef5218', 'd69906245565a910', 'f40e35855771202a', '106aa07032bbd1b8', '19a4c116b8d2d0c8', '1e376c085141ab53', '2748774cdf8eeb99', '34b0bcb5e19b48a8', '391c0cb3c5c95a63',
    '4ed8aa4ae3418acb', '5b9cca4f7763e373', '682e6ff3d6b2b8a3', '748f82ee5defb2fc', '78a5636f43172f60', '84c87814a1f0ab72', '8cc702081a6439ec', '90befffa23631e28', 'a4506cebde82bde9',
    'bef9a3f7b2c67915', 'c67178f2e372532b', 'ca273eceea26619c', 'd186b8c721c0c207', 'eada7dd6cde0eb1e', 'f57d4f7fee6ed178', '06f067aa72176fba', '0a637dc5a2c898a6', '113f9804bef90dae',
    '1b710b35131c471b', '28db77f523047d84', '32caab7b40c72493', '3c9ebe0a15c9bebc', '431d67c49c100d4c', '4cc5d4becb3e42b6', '597f299cfc657e2a', '5fcb6fab3ad6faec', '6c44198c4a475817'].map(x => BigInt('0x' + x));
  function sha512js(msg) {
    const M = 2n ** 64n - 1n, rotr = (x, n) => ((x >> n) | (x << (64n - n))) & M;
    let h = ['6a09e667f3bcc908', 'bb67ae8584caa73b', '3c6ef372fe94f82b', 'a54ff53a5f1d36f1', '510e527fade682d1', '9b05688c2b3e6c1f', '1f83d9abfb41bd6b', '5be0cd19137e2179'].map(x => BigInt('0x' + x));
    const l = msg.length, nb = Math.ceil((l + 17) / 128) * 128, b = new Uint8Array(nb); b.set(msg); b[l] = 0x80;
    let bits = BigInt(l) * 8n; for (let i = 0; i < 16; i++) { b[nb - 1 - i] = Number(bits & 255n); bits >>= 8n; }
    for (let o = 0; o < nb; o += 128) {
      const w = new Array(80);
      for (let t = 0; t < 16; t++) { let x = 0n; for (let k = 0; k < 8; k++) x = (x << 8n) | BigInt(b[o + t * 8 + k]); w[t] = x; }
      for (let t = 16; t < 80; t++) { const s0 = rotr(w[t - 15], 1n) ^ rotr(w[t - 15], 8n) ^ (w[t - 15] >> 7n), s1 = rotr(w[t - 2], 19n) ^ rotr(w[t - 2], 61n) ^ (w[t - 2] >> 6n); w[t] = (w[t - 16] + s0 + w[t - 7] + s1) & M; }
      let [a, bb, c, d, e, f, g, hh] = h;
      for (let t = 0; t < 80; t++) {
        const S1 = rotr(e, 14n) ^ rotr(e, 18n) ^ rotr(e, 41n), ch = (e & f) ^ (~e & M & g), t1 = (hh + S1 + ch + K512[t] + w[t]) & M;
        const S0 = rotr(a, 28n) ^ rotr(a, 34n) ^ rotr(a, 39n), maj = (a & bb) ^ (a & c) ^ (bb & c), t2 = (S0 + maj) & M;
        hh = g; g = f; f = e; e = (d + t1) & M; d = c; c = bb; bb = a; a = (t1 + t2) & M;
      }
      h = h.map((x, i) => (x + [a, bb, c, d, e, f, g, hh][i]) & M);
    }
    const out = new Uint8Array(64); h.forEach((x, i) => { for (let k = 7; k >= 0; k--) { out[i * 8 + k] = Number(x & 255n); x >>= 8n; } }); return out;
  }
  async function etendre(prive) {
    const hh = await sha512(prive), a = hh.slice(0, 32); a[0] &= 248; a[31] &= 127; a[31] |= 64;
    return { s: leNum(a), prefixe: hh.slice(32) };
  }
  async function publicDe(priveHex) { const { s } = await etendre(deHex(priveHex)); return hex(encode(mul(G, s))); }
  async function signerJs(priveHex, m) {
    const prive = deHex(priveHex), { s, prefixe } = await etendre(prive), A = encode(mul(G, s));
    const r = mod(leNum(await sha512(concat(prefixe, m))), L), R = encode(mul(G, r));
    const k = mod(leNum(await sha512(concat(R, A, m))), L), S = mod(r + k * s, L);
    return hex(concat(R, leBytes(S, 32)));
  }
  async function verifierJs(publicHex, m, sigHex) {
    let pub, sig; try { pub = deHex(publicHex); sig = deHex(sigHex); } catch (e) { return false; }
    if (pub.length !== 32 || sig.length !== 64) return false;
    const A = decode(pub), R = decode(sig.slice(0, 32)), S = leNum(sig.slice(32)); if (!A || !R || S >= L) return false;
    const k = mod(leNum(await sha512(concat(sig.slice(0, 32), pub, m))), L);
    const gauche = encode(mul(G, S)), droite = encode(add(R, mul(A, k)));
    return hex(gauche) === hex(droite);
  }
  /* WebCrypto natif quand il existe (plus rapide) ; clés gardées en brut (PKCS8 → 32 octets) */
  let natif = null;
  async function aNatif() {
    if (natif !== null) return natif;
    try { const s = sub(); if (!s) return (natif = false); await s.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']); natif = true; } catch (e) { natif = false; }
    return natif;
  }
  const PKCS8_ENTETE = deHex('302e020100300506032b657004220420');
  async function genererCles() {
    const prive = new Uint8Array(32); (global.crypto || {}).getRandomValues ? global.crypto.getRandomValues(prive) : prive.forEach((_, i) => { prive[i] = Math.floor(Math.random() * 256); });
    return { prive: hex(prive), public: await publicDe(hex(prive)) };
  }
  async function signer(priveHex, octets) {
    const m = octets instanceof Uint8Array ? octets : new TextEncoder().encode(String(octets));
    if (await aNatif()) {
      try { const k = await sub().importKey('pkcs8', concat(PKCS8_ENTETE, deHex(priveHex)), { name: 'Ed25519' }, false, ['sign']); return hex(new Uint8Array(await sub().sign({ name: 'Ed25519' }, k, m))); } catch (e) { /* repli JavaScript */ }
    }
    return signerJs(priveHex, m);
  }
  async function verifier(publicHex, octets, sigHex) {
    const m = octets instanceof Uint8Array ? octets : new TextEncoder().encode(String(octets));
    if (await aNatif()) {
      try { const k = await sub().importKey('raw', deHex(publicHex), { name: 'Ed25519' }, false, ['verify']); return await sub().verify({ name: 'Ed25519' }, k, deHex(sigHex), m); } catch (e) { /* repli JavaScript */ }
    }
    return verifierJs(publicHex, m, sigHex);
  }
  global.Ed25519 = { genererCles, signer, verifier, publicDe, _js: { signerJs, verifierJs, sha512js }, hex, deHex };
})(typeof window !== 'undefined' ? window : globalThis);
