/* République du Bénin — MEMP — Génération de PDF (pdf-lib). Le bandeau officiel est imprimé en tête de CHAQUE page. */
import { fetchBytes, today } from './util.js';
import { qrMatrix } from './qr.js';
import { CREDIT } from './config.js';

let _banner;
export async function bannerBytes() { return _banner || (_banner = await fetchBytes('assets/embleme-memp.png')); }
let _arms;
export async function armsBytes() { return _arms || (_arms = await fetchBytes('assets/armoiries.png')); }

const A4 = { portrait: [595.28, 841.89], landscape: [841.89, 595.28] };
const GREEN = [0.043, 0.365, 0.231], LIGHT = [0.85, 0.92, 0.83], GREY = [0.95, 0.95, 0.95], LINE = [0.5, 0.5, 0.5];

export async function newPdf({ title = '', subject = '', footer = 'Application CP — MEMP Bénin', orientation = 'portrait' } = {}) {
  const P = globalThis.PDFLib;
  const doc = await P.PDFDocument.create();
  doc.setTitle(title); doc.setSubject(subject); doc.setAuthor('République du Bénin — Ministère des Enseignements Maternel et Primaire');
  doc.setCreator('Application CP — MEMP · '+CREDIT); doc.setProducer('Application CP — MEMP (pdf-lib)'); doc.setCreationDate(new Date());
  const font = await doc.embedFont(P.StandardFonts.Helvetica), bold = await doc.embedFont(P.StandardFonts.HelveticaBold);
  const banner = await doc.embedPng(await bannerBytes());
  return new Pdf(P, doc, font, bold, banner, footer, orientation);
}

class Pdf {
  constructor(P, doc, font, bold, banner, footer, orientation) {
    Object.assign(this, { P, doc, font, bold, banner, footerText: footer, orientation, M: 36 });
    this.chars = new Set(font.getCharacterSet());
    this.page = null; this.y = 0;
    this.addPage(orientation);
  }
  get W() { return this.page.getWidth(); }
  get H() { return this.page.getHeight(); }
  get cw() { return this.W - this.M * 2; }
  rgb(c) { return this.P.rgb(...c); }

  clean(s) {
    s = String(s ?? '').replace(/ /g, ' ').replace(/[‐-‑]/g, '-').replace(/→/g, '-').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/[✓✔]/g, 'x').replace(/\r/g, '');
    let o = '';
    for (const ch of s) { const cp = ch.codePointAt(0); o += (ch === '\n' || this.chars.has(cp)) ? ch : '?'; }
    return o;
  }
  addPage(orientation = this.orientation) {
    this.orientation = orientation;
    this.page = this.doc.addPage(A4[orientation]);
    const bw = this.W - this.M * 2, bh = bw * 140 / 1383;
    this.page.drawImage(this.banner, { x: this.M, y: this.H - this.M - bh + 6, width: bw, height: bh });
    this.y = this.H - this.M - bh - 8;
    return this.page;
  }
  ensure(h) { if (this.y - h < this.M + 30) this.addPage(); }
  space(n = 6) { this.y -= n; }
  width(t, size, b = false) { return (b ? this.bold : this.font).widthOfTextAtSize(this.clean(t), size); }
  wrap(text, size, maxW, b = false) {
    const out = [];
    for (const para of this.clean(text).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const t = line ? line + ' ' + word : word;
        if (this.width(t, size, b) <= maxW) { line = t; continue; }
        if (line) out.push(line);
        if (this.width(word, size, b) <= maxW) { line = word; continue; }
        let part = '';
        for (const ch of word) { if (this.width(part + ch, size, b) > maxW) { out.push(part); part = ch; } else part += ch; }
        line = part;
      }
      out.push(line);
    }
    return out.length ? out : [''];
  }
  text(t, { size = 9, bold = false, align = 'left', color = [0, 0, 0], x, w, gap = 2 } = {}) {
    const maxW = w || this.cw, x0 = x ?? this.M;
    for (const ln of this.wrap(t, size, maxW, bold)) {
      this.ensure(size + gap);
      const tw = this.width(ln, size, bold);
      const px = align === 'center' ? x0 + (maxW - tw) / 2 : align === 'right' ? x0 + maxW - tw : x0;
      this.page.drawText(ln, { x: px, y: this.y - size, size, font: bold ? this.bold : this.font, color: this.rgb(color) });
      this.y -= size + gap;
    }
  }
  heading(t, { size = 10 } = {}) {
    this.ensure(size + 16);
    this.space(4);
    this.page.drawRectangle({ x: this.M, y: this.y - size - 6, width: this.cw, height: size + 8, color: this.rgb(GREEN) });
    this.page.drawText(this.clean(t), { x: this.M + 6, y: this.y - size - 2, size, font: this.bold, color: this.rgb([1, 1, 1]) });
    this.y -= size + 12;
  }
  titleBox(lines, { size = 12 } = {}) {
    const hh = lines.length * (size + 4) + 10; this.ensure(hh + 6);
    this.page.drawRectangle({ x: this.M + 20, y: this.y - hh, width: this.cw - 40, height: hh, borderColor: this.rgb([0, 0, 0]), borderWidth: 1.2 });
    let yy = this.y - 6;
    lines.forEach((l, i) => {
      const s = i === 0 ? size : size - 2, b = i === 0, tw = this.width(l, s, b);
      this.page.drawText(this.clean(l), { x: this.M + 20 + (this.cw - 40 - tw) / 2, y: yy - s, size: s, font: b ? this.bold : this.font });
      yy -= s + 4;
    });
    this.y -= hh + 8;
  }

  /** Tableau. head: [{t, c, s, r, rs}] cellules d'en-tête positionnées (ligne r, colonne c, colspan s, rowspan rs). */
  table({ widths, headRows = 1, head, rows, size = 7.5, align = [], bold = [], fill = [], minH = 14, headSize }) {
    const n = widths.length, tot = widths.reduce((a, b) => a + b, 0), W = widths.map(w => w / tot * this.cw);
    const X = [this.M]; W.forEach(w => X.push(X[X.length - 1] + w));
    const pad = 2.5, hs = headSize || size, lh = (s) => s + 2;
    // en-tête
    const headLayout = () => {
      const cells = head.map(c => ({ ...c, lines: this.wrap(c.t, hs, X[(c.c || 0) + (c.s || 1)] - X[c.c || 0] - pad * 2, true) }));
      const rh = new Array(headRows).fill(minH);
      cells.forEach(c => { if (!(c.rs > 1)) rh[c.r || 0] = Math.max(rh[c.r || 0], c.lines.length * lh(hs) + pad * 2); });
      cells.forEach(c => { if (c.rs > 1) { let have = 0; for (let i = 0; i < c.rs; i++) have += rh[(c.r || 0) + i]; const need = c.lines.length * lh(hs) + pad * 2; if (need > have) rh[(c.r || 0) + c.rs - 1] += need - have; } });
      return { cells, rh, total: rh.reduce((a, b) => a + b, 0) };
    };
    const HL = head ? headLayout() : null;
    const drawHead = () => {
      let top = this.y; const rowTop = [top]; HL.rh.forEach(h => rowTop.push(rowTop[rowTop.length - 1] - h));
      HL.cells.forEach(c => {
        const r = c.r || 0, rs = c.rs || 1, x = X[c.c || 0], w = X[(c.c || 0) + (c.s || 1)] - x, yT = rowTop[r], hh = rowTop[r] - rowTop[r + rs];
        this.page.drawRectangle({ x, y: yT - hh, width: w, height: hh, color: this.rgb(LIGHT), borderColor: this.rgb(LINE), borderWidth: 0.5 });
        const bl = c.lines.length * lh(hs); let ty = yT - (hh - bl) / 2;
        c.lines.forEach(ln => { const tw = this.width(ln, hs, true); this.page.drawText(ln, { x: x + (w - tw) / 2, y: ty - hs, size: hs, font: this.bold }); ty -= lh(hs); });
      });
      this.y -= HL.total;
    };
    if (HL) { this.ensure(HL.total + minH); drawHead(); }
    const cellsOf = (row) => { let c = 0; return row.map(v => { const o = (v && typeof v === 'object' && 't' in v) ? v : { t: v }; const cell = { ...o, t: o.t ?? '', c, s: o.s || 1 }; c += cell.s; return cell; }); };
    for (const row of rows) {
      const cells = cellsOf(row).map(cl => ({ ...cl, w: X[cl.c + cl.s] - X[cl.c], b: cl.b ?? !!bold[cl.c], a: cl.a || align[cl.c], f: cl.f || fill[cl.c] }));
      cells.forEach(cl => { cl.lines = this.wrap(cl.t, size, cl.w - pad * 2, cl.b); });
      const rh = Math.max(minH, Math.max(...cells.map(cl => cl.lines.length)) * lh(size) + pad * 2);
      if (this.y - rh < this.M + 30) { this.addPage(); if (HL) drawHead(); }
      cells.forEach((cl) => {
        const x = X[cl.c];
        this.page.drawRectangle({ x, y: this.y - rh, width: cl.w, height: rh, borderColor: this.rgb(LINE), borderWidth: 0.5, color: cl.f ? this.rgb(cl.f) : undefined });
        const bl = cl.lines.length * lh(size); let ty = this.y - (rh - bl) / 2;
        cl.lines.forEach(ln => {
          const tw = this.width(ln, size, cl.b);
          const px = cl.a === 'center' ? x + (cl.w - tw) / 2 : cl.a === 'right' ? x + cl.w - tw - pad : x + pad;
          this.page.drawText(ln, { x: px, y: ty - size, size, font: cl.b ? this.bold : this.font }); ty -= lh(size);
        });
      });
      this.y -= rh;
    }
    this.space(6);
  }

  /** Bloc d'authentification : signature, cachet, QR code */
  async authBlock({ role = 'Le Conseiller Pédagogique', nom = '', signature, cachet, qrText, lines = [] }) {
    const h = 150; this.ensure(h + 14);
    const top = this.y, x0 = this.M;
    this.page.drawRectangle({ x: x0, y: top - h, width: this.cw, height: h, borderColor: this.rgb(GREEN), borderWidth: 1 });
    this.page.drawText(this.clean('AUTHENTIFICATION — ' + role), { x: x0 + 8, y: top - 14, size: 9, font: this.bold, color: this.rgb(GREEN) });
    if (nom) this.page.drawText(this.clean(nom), { x: x0 + 8, y: top - 26, size: 8.5, font: this.font });
    const place = async (data, x, w, hh) => { if (!data) return; const img = await this.doc.embedPng(data); const s = Math.min(w / img.width, hh / img.height); this.page.drawImage(img, { x, y: top - 32 - hh + (hh - img.height * s) / 2, width: img.width * s, height: img.height * s }); };
    await place(signature, x0 + 8, 130, 70);
    await place(cachet, x0 + 150, 170, 80);
    if (qrText) {
      const { size, modules } = qrMatrix(qrText, 'M'), q = 86, mod = q / (size + 2), qx = x0 + this.cw - q - 10, qy = top - 28 - q;
      this.page.drawRectangle({ x: qx, y: qy, width: q, height: q, color: this.rgb([1, 1, 1]) });
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (modules[y][x]) this.page.drawRectangle({ x: qx + (x + 1) * mod, y: qy + q - (y + 2) * mod, width: mod + 0.05, height: mod + 0.05, color: this.rgb([0, 0, 0]) });
    }
    let ly = top - h + 10 + lines.length * 9;
    lines.forEach(l => { this.page.drawText(this.clean(l), { x: x0 + 8, y: ly - 9, size: 7, font: this.font, color: this.rgb([0.25, 0.25, 0.25]) }); ly -= 9; });
    this.y -= h + 8;
  }

  async finish() {
    const pages = this.doc.getPages();
    pages.forEach((pg, i) => {
      const t = this.clean(`République du Bénin · MEMP · ${this.footerText} · Édité le ${new Date().toLocaleDateString('fr-FR')}`);
      pg.drawLine({ start: { x: this.M, y: this.M + 20 }, end: { x: pg.getWidth() - this.M, y: this.M + 20 }, thickness: 0.5, color: this.rgb(LINE) });
      pg.drawText(t, { x: this.M, y: this.M + 10, size: 7, font: this.font, color: this.rgb([0.35, 0.35, 0.35]) });
      pg.drawText(this.clean(CREDIT), { x: this.M, y: this.M, size: 6.5, font: this.bold, color: this.rgb(GREEN) });
      const pn = `Page ${i + 1}/${pages.length}`; pg.drawText(pn, { x: pg.getWidth() - this.M - this.font.widthOfTextAtSize(pn, 7), y: this.M + 10, size: 7, font: this.font });
    });
    return this.doc.save();
  }
}
export { GREEN, LIGHT, GREY };
