/* République du Bénin — MEMP — Courbes d'âge (SVG), sans dépendance */
export const COULEURS = { G: '#0369a1', F: '#be185d', T: '#006633' };
export const PALETTE = ['#0369a1', '#be185d', '#15803d', '#b45309', '#6d28d9', '#0f766e'];
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const joli = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };

/** series : [{ nom, color, values, tirets? }] ; labels : abscisses */
export function svgCourbe({ titre, sousTitre = '', labels, series, w = 780, h = 330 }) {
  const m = { l: 64, r: 24, t: sousTitre ? 46 : 34, b: 76 }, iw = w - m.l - m.r, ih = h - m.t - m.b;
  const top = joli(Math.max(1, ...series.flatMap(s => s.values))), x = (i) => m.l + (labels.length < 2 ? iw / 2 : i * iw / (labels.length - 1)), y = (v) => m.t + ih - (v / top) * ih;
  let s = `<svg class="courbe" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${esc(titre)}" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica, Arial, sans-serif">`;
  s += `<text x="${w / 2}" y="18" text-anchor="middle" font-size="14" font-weight="700" fill="#1e293b">${esc(titre)}</text>`;
  if (sousTitre) s += `<text x="${w / 2}" y="34" text-anchor="middle" font-size="11" fill="#64748b">${esc(sousTitre)}</text>`;
  for (let k = 0; k <= 5; k++) { const v = top * k / 5, yy = y(v); s += `<line x1="${m.l}" y1="${yy}" x2="${w - m.r}" y2="${yy}" stroke="#d7dee6"/><text x="${m.l - 6}" y="${yy + 4}" text-anchor="end" font-size="11" fill="#475569">${Math.round(v).toLocaleString('fr-FR')}</text>`; }
  labels.forEach((l, i) => { s += `<text transform="translate(${x(i)} ${h - m.b + 16}) rotate(-35)" text-anchor="end" font-size="11" fill="#475569">${esc(l)}</text>`; });
  s += `<line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${m.t + ih}" stroke="#94a3b8"/><line x1="${m.l}" y1="${m.t + ih}" x2="${w - m.r}" y2="${m.t + ih}" stroke="#94a3b8"/>`;
  for (const se of series) {
    s += `<polyline fill="none" stroke="${se.color}" stroke-width="2.4" ${se.tirets ? 'stroke-dasharray="6 4"' : ''} stroke-linejoin="round" points="${se.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>`;
    se.values.forEach((v, i) => { s += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.4" fill="${se.color}"><title>${esc(se.nom)} — ${esc(labels[i])} : ${v}</title></circle>`; });
  }
  let lx = m.l; const ly = h - 10;
  for (const se of series) { s += `<rect x="${lx}" y="${ly - 9}" width="14" height="4" fill="${se.color}"/><text x="${lx + 19}" y="${ly - 3}" font-size="11" fill="#1e293b">${esc(se.nom)}</text>`; lx += 30 + se.nom.length * 6.4; }
  return s + '</svg>';
}
