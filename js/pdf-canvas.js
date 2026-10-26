/* République du Bénin — MEMP — « canvas » à la reportlab sur pdf-lib (rendus des fiches officielles de GESCOL / SCOLARIS)
   Largeurs sans crénage (comme reportlab stringWidth), polices standard PDF, cercles, pointillés, texte tourné.
   Conception : Maître Aimé FACHE */
export const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const NOIR = [0, 0, 0];
/* ------------------------------------------------------------------ « canvas » à la reportlab sur pdf-lib */
export class Canvas {
  constructor(P, doc, polices) {
    Object.assign(this, { P, doc, F: polices, page: null, st: this.etatInitial(), pile: [] });
    this.jeux = Object.fromEntries(Object.entries(polices).map(([k, f]) => [k, new Set(f.getCharacterSet())]));
  }
  etatInitial() { return { fill: NOIR, stroke: NOIR, lw: 1, dash: null, font: 'Helvetica', size: 12, alpha: 1, cap: 0 }; }
  nouvellePage(w, h) { this.page = this.doc.addPage([w, h]); this.st = this.etatInitial(); this.pile = []; }
  saveState() { this.pile.push({ ...this.st }); }
  restoreState() { this.st = this.pile.pop() || this.etatInitial(); }
  setFillColor(c) { this.st.fill = c; } setStrokeColor(c) { this.st.stroke = c; } setLineWidth(w) { this.st.lw = w; }
  setDash(a, b) { this.st.dash = a === undefined ? null : (Array.isArray(a) ? a : [a, b]); } setLineCap(c) { this.st.cap = c; } setFont(f, s) { this.st.font = f; this.st.size = s; } setFillAlpha(a) { this.st.alpha = a; }
  rgb(c) { return this.P.rgb(...c); }
  texte(t, f) {
    const s = String(t ?? '').replace(/[  ]/g, ' ').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≠/g, '<>').replace(/[‐‑]/g, '-').replace(/[\r\t]/g, ' ');
    const jeu = this.jeux[f]; let o = '';
    for (const ch of s) o += jeu.has(ch.codePointAt(0)) ? ch : (ch.normalize('NFD')[0] && jeu.has(ch.normalize('NFD').codePointAt(0)) ? ch.normalize('NFD')[0] : '?');
    return o;
  }
  /** Largeur sans crénage (comme reportlab stringWidth et comme le texte est réellement dessiné) */
  sw(t, f = this.st.font, s = this.st.size) {
    const cache = this.lc || (this.lc = {}), m = cache[f] || (cache[f] = new Map()); let w = 0;
    for (const ch of this.texte(t, f)) { let x = m.get(ch); if (x === undefined) { x = this.F[f].widthOfTextAtSize(ch, 1000); m.set(ch, x); } w += x; }
    return w * s / 1000;
  }
  drawString(x, y, t, opt = {}) {
    const f = this.st.font, s = this.texte(t, f); if (!s) return;
    this.page.drawText(s, { x, y, size: this.st.size, font: this.F[f], color: this.rgb(this.st.fill), opacity: this.st.alpha, ...(opt.rotate ? { rotate: this.P.degrees(opt.rotate) } : {}) });
  }
  drawCentredString(x, y, t) { this.drawString(x - this.sw(t) / 2, y, t); }
  drawRightString(x, y, t) { this.drawString(x - this.sw(t), y, t); }
  rect(x, y, w, h, fill = 0, stroke = 1) {
    if (!fill && !stroke) return;
    this.page.drawRectangle({ x, y, width: w, height: h, ...(fill ? { color: this.rgb(this.st.fill), opacity: this.st.alpha } : {}),
      ...(stroke ? { borderColor: this.rgb(this.st.stroke), borderWidth: this.st.lw, ...(this.st.dash ? { borderDashArray: this.st.dash } : {}) } : { borderWidth: 0 }) });
  }
  line(x1, y1, x2, y2) { this.page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: this.st.lw, color: this.rgb(this.st.stroke), ...(this.st.dash ? { dashArray: this.st.dash } : {}), ...(this.st.cap ? { lineCap: this.st.cap === 1 ? this.P.LineCapStyle.Round : this.P.LineCapStyle.Projecting } : {}) }); }
  circle(x, y, r, stroke = 1, fill = 0) {
    this.page.drawCircle({ x, y, size: r, ...(fill ? { color: this.rgb(this.st.fill) } : {}), ...(stroke ? { borderColor: this.rgb(this.st.stroke), borderWidth: this.st.lw } : { borderWidth: 0 }) });
  }
  /** Texte centré tourné de 90° (lecture de bas en haut), centre (cx, cy) de la ligne de base */
  drawCentredString90(cx, cy, t) { const w = this.sw(t); this.drawString(cx, cy - w / 2, t, { rotate: 90 }); }
  drawImage(img, x, y, w, h) { this.page.drawImage(img, { x, y, width: w, height: h }); }
}
/** Découpe d'un texte en lignes (reportlab simpleSplit) */
export function decouper(c, txt, f, s, w) {
  const out = [];
  for (const l of String(txt ?? '').split('\n')) {
    const mots = l.split(/\s+/).filter(Boolean), esp = c.sw(' ', f, s); let O = [], lw = -esp;
    for (const m of mots) { const lt = c.sw(m, f, s); if (lw + esp + lt <= w || !O.length) { O.push(m); lw += esp + lt; } else { out.push(O.join(' ')); O = [m]; lw = lt; } }
    if (O.length) out.push(O.join(' '));
    if (!mots.length) out.push('');
  }
  return out;
}
