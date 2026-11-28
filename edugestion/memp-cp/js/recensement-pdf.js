/* République du Bénin — MEMP — PDF des fiches de recensement annuel (rempli ou vierge)
   Transposition fidèle du rendu de GESCOL / SCOLARIS (m_recensement.RenduFiche, reportlab) sur pdf-lib : mêmes pages,
   mêmes bandes de rubriques, mêmes cases l__l__l, cases à cocher, pointillés, cadres FCFA, mêmes tableaux (en-têtes
   fusionnés, textes verticaux, cellules grisées), filigrane « ANNÉE SCOLAIRE », pied de page « Page n / N »,
   signatures et visas, guide de remplissage. Valeurs inscrites à l'encre bleue, comme au stylo.
   Conception : Maître Aimé FACHOLA */
import { fetchBytes } from './util.js';
import { Canvas, decouper } from './pdf-canvas.js';
import { APP } from './config.js';
import { feuilles, profondeur, lignesTableau, enteteCellules, milliers, OUINON, valeursVierges, nbLignesDyn } from './recensement.js';

const mm = 72 / 25.4;
const A4 = [595.2755905511812, 841.8897637795277];
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const NOIR = [0, 0, 0], BLANC = [1, 1, 1], ENCRE = hex('#0B3D91'), GRISE = hex('#948A85');

function dessinerCase(c, x, y, cote, coche) {
  c.saveState(); c.setStrokeColor(NOIR); c.setLineWidth(0.6); c.rect(x, y, cote, cote);
  if (coche) { c.setStrokeColor(ENCRE); c.setLineWidth(1.1); c.line(x + 0.5, y + 0.5, x + cote - 0.5, y + cote - 0.5); c.line(x + 0.5, y + cote - 0.5, x + cote - 0.5, y + 0.5); }
  c.restoreState();
}

/* ------------------------------------------------------------------ cellules de tableau (flowables) */
class Para {   // Paragraph reportlab : retour à la ligne, alignement, couleur
  constructor(c, txt, { font = 'Helvetica', size, leading, align = 'left', color = NOIR }) { Object.assign(this, { c, txt: String(txt ?? '').replace(/\s+/g, ' ').trim(), font, size, leading, align, color }); }
  wrap(w) {
    this.w = w;
    // comme reportlab (splitLongWords) : un mot plus large que la cellule est coupé à la lettre
    const c = this.c, mots = [];
    for (const m of this.txt ? this.txt.split(' ') : []) {
      if (c.sw(m, this.font, this.size) <= w) { mots.push(m); continue; }
      let cur = '';
      for (const ch of m) { if (cur && c.sw(cur + ch, this.font, this.size) > w) { mots.push(cur); cur = ch; } else cur += ch; }
      if (cur) mots.push(cur);
    }
    this.lignes = mots.length ? decouper(c, mots.join(' '), this.font, this.size, w) : [];
    this.h = this.lignes.length * this.leading; return [w, this.h];
  }
  draw(x, y) {
    const c = this.c; c.saveState(); c.setFillColor(this.color); c.setFont(this.font, this.size);
    let yy = y + this.h - this.size;
    for (const l of this.lignes) {
      const lw = c.sw(l);
      c.drawString(this.align === 'center' ? x + (this.w - lw) / 2 : x, yy, l);
      yy -= this.leading;
    }
    c.restoreState();
  }
}
class Vert {   // texte vertical (en-têtes de colonnes étroites)
  constructor(c, txt, taille = 6, maxh = 46 * mm, gras = false) {
    this.c = c; this.font = gras ? 'Helvetica-Bold' : 'Helvetica'; this.taille = taille;
    this.lignes = decouper(c, String(txt), this.font, taille, maxh); if (!this.lignes.length) this.lignes = [''];
    this.lead = taille + 1.2;
    this.hh = Math.max(...this.lignes.map(x => c.sw(x, this.font, taille))) + 3; this.ww = this.lignes.length * this.lead + 1;
  }
  wrap() { return [this.ww, this.hh]; }
  draw(x, y) { const c = this.c; c.saveState(); c.setFont(this.font, this.taille); c.setFillColor(NOIR); this.lignes.forEach((t, i) => c.drawString(x + (i + 1) * this.lead - 1.6, y + 1.5, t, { rotate: 90 })); c.restoreState(); }
}
class CaseF { constructor(c, coche, cote = 2.6 * mm) { Object.assign(this, { c, coche, cote }); } wrap() { return [this.cote, this.cote]; } draw(x, y) { dessinerCase(this.c, x, y, this.cote, this.coche); } }

/* ------------------------------------------------------------------ tableau (reportlab Table : grille, fusions, hauteurs, découpage) */
class Tableau {
  constructor(c, data, colW, rowH, spans, styles, repeat) {
    Object.assign(this, { c, data, colW, rowH, spans, styles, repeat });   // styles : {fond: Map 'r,c' → couleur, valign: Map, align: Map}
    this.nr = data.length; this.nc = colW.length;
    this.colPos = [0]; for (const w of colW) this.colPos.push(this.colPos[this.colPos.length - 1] + w);
    this.width = this.colPos[this.nc];
    this.occ = new Map(); this.orig = new Map(); this.occRang = new Set();   // occRang : cellules couvertes par une fusion de LIGNES
    for (const [c0, r0, c1, r1] of spans) {
      this.orig.set(r0 + ',' + c0, [c0, r0, c1, r1]);
      for (let r = r0; r <= r1; r++) for (let cc = c0; cc <= c1; cc++) { if (r !== r0 || cc !== c0) this.occ.set(r + ',' + cc, true); if (r0 !== r1) this.occRang.add(r + ',' + cc); }
    }
    this.calc();
  }
  calc() {
    const H = this.rowH.slice(), spanCons = new Map(), PAD = 2;
    for (let i = 0; i < this.nr; i++) {
      if (H[i] !== null && H[i] !== undefined) continue;
      let h = 0;
      for (let j = 0; j < this.nc; j++) {
        const sp = this.orig.get(i + ',' + j);
        // comme reportlab : cellule masquée par une fusion de lignes ignorée ; masquée par une fusion de colonnes seulement,
        // elle compte comme un texte vide (une ligne de 12 pt)
        if (this.occ.has(i + ',' + j) && (this.occRang.has(i + ',' + j) || sp)) continue;
        if (!sp && this.occRang.has(i + ',' + j)) continue;
        const v = this.occ.has(i + ',' + j) ? '' : this.data[i][j];
        let t;
        if (v && typeof v === 'object') { const w = sp ? this.colPos[sp[2] + 1] - this.colPos[sp[0]] : this.colW[j]; t = v.wrap(w - 2.4)[1]; }
        else t = 12 * Math.max(1, String(v ?? '').split('\n').length);
        t += PAD;
        if (sp && sp[1] !== sp[3]) { const key = sp[1] + ',' + sp[3]; spanCons.set(key, Math.max(spanCons.get(key) || 0, t)); t = 0; }
        if (t > h) h = t;
      }
      H[i] = h;
    }
    const M = {};
    for (const [key, v0] of [...spanCons.entries()].sort((a, b) => b[1] - a[1])) {
      const [x0, x1] = key.split(',').map(Number); let v = v0;
      const t = Array.from({ length: x1 - x0 + 1 }, (_, k) => H[x0 + k] + (M[x0 + k] || 0)).reduce((a, b) => a + b, 0);
      if (t >= v - 1e-6) continue;
      const X = []; for (let x = x0; x <= x1; x++) if (this.rowH[x] === null || this.rowH[x] === undefined) X.push(x);
      if (!X.length) continue;
      v = (v - t) / X.length; for (const x of X) M[x] = (M[x] || 0) + v;
    }
    for (const [x, v] of Object.entries(M)) H[x] += v;
    this.H = H; this.height = H.reduce((a, b) => a + b, 0);
    return this.height;
  }
  /** Découpe en deux à la hauteur disponible (lignes d'en-tête répétées) ; [] si impossible */
  split(avail) {
    let cum = 0, n = 0;
    const libre = (k) => ![...this.orig.values()].some(([, r0, , r1]) => r0 < k && r1 >= k);
    for (let i = 0; i < this.nr; i++) { cum += this.H[i]; if (cum > avail) break; if (i + 1 > this.repeat && libre(i + 1)) n = i + 1; }
    if (n <= this.repeat || n >= this.nr) return [];
    const part = (rows) => {
      const map = new Map(rows.map((r, k) => [r, k]));
      const sp = []; for (const [c0, r0, c1, r1] of this.orig.values()) if (map.has(r0) && map.has(r1)) sp.push([c0, map.get(r0), c1, map.get(r1)]);
      const st = { fond: new Map(), valign: new Map(), align: new Map() };
      for (const nom of ['fond', 'valign', 'align']) for (const [k, v] of this.styles[nom]) { const [r, cc] = k.split(',').map(Number); if (map.has(r)) st[nom].set(map.get(r) + ',' + cc, v); }
      return new Tableau(this.c, rows.map(r => this.data[r]), this.colW, rows.map(r => this.rowH[r]), sp, st, this.repeat);
    };
    const tete = Array.from({ length: this.repeat }, (_, k) => k);
    return [part(Array.from({ length: n }, (_, k) => k)), part([...tete, ...Array.from({ length: this.nr - n }, (_, k) => n + k)])];
  }
  drawOn(x, y) {
    const c = this.c, top = y + this.height, rowY = [top]; for (const h of this.H) rowY.push(rowY[rowY.length - 1] - h);
    const geo = (i, j) => { const sp = this.orig.get(i + ',' + j); const c1 = sp ? sp[2] : j, r1 = sp ? sp[3] : i; return { x: x + this.colPos[j], w: this.colPos[c1 + 1] - this.colPos[j], y: rowY[r1 + 1], h: rowY[i] - rowY[r1 + 1] }; };
    for (const [k, col] of this.styles.fond) { const [i, j] = k.split(',').map(Number); if (this.occ.has(k)) continue; const g = geo(i, j); c.saveState(); c.setFillColor(col); c.rect(g.x, g.y, g.w, g.h, 1, 0); c.restoreState(); }
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) {
      const v = this.data[i][j]; if (this.occ.has(i + ',' + j) || !v || typeof v !== 'object') continue;
      const g = geo(i, j), [w, h] = v.wrap(g.w - 2.4), va = this.styles.valign.get(i + ',' + j) || 'middle', al = this.styles.align.get(i + ',' + j) || 'center';
      const yb = va === 'bottom' ? g.y + 1 : g.y + (g.h + 1 - 1 - h) / 2;
      const xb = al === 'left' ? g.x + 1.2 : g.x + (g.w - w) / 2;
      v.draw(xb, yb);
    }
    c.saveState(); c.setStrokeColor(NOIR); c.setLineWidth(0.5);
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) { if (this.occ.has(i + ',' + j)) continue; const g = geo(i, j); c.rect(g.x, g.y, g.w, g.h); }
    c.restoreState();
  }
}

/* ------------------------------------------------------------------ rendu de la fiche (RenduFiche) */
class Rendu {
  constructor(c, imgMemp, schema, eff, dyn, annee, total, ent) {
    Object.assign(this, { c, imgMemp, s: schema, v: eff, dyn, annee, total, ent: ent || {} });
    this.page = 0; this.pagesFiche = 0; this.cadre = null; this.mode = 'fiche'; this.paysage = false;
    this.primaire = schema.type === 'primaire'; this.coul = hex(this.primaire ? '#FFFF99' : '#FFD966');
    this.LH = 4.35 * mm; this.TAILLE = 8.3;
  }
  nouvellePage(paysage = false, mode = null) {
    const rouvrir = this.cadre !== null && mode === null;
    if (this.page) { this.fermerCadre(); this.pied(); this.concepteur(); }
    if (mode) this.mode = mode;
    this.page++; if (this.mode === 'fiche') this.pagesFiche = this.page;
    this.paysage = paysage;
    const [w, h] = paysage ? [A4[1], A4[0]] : A4;
    this.c.nouvellePage(w, h); this.W = w; this.Hp = h;
    this.m = 11 * mm; this.x0 = this.m; this.x1 = this.W - this.m; this.y = this.Hp - 11 * mm; this.bas = 17 * mm;
    if (this.mode === 'fiche') this.filigrane();
    if (rouvrir) this.cadre = this.y;
  }
  concepteur() { const c = this.c; c.saveState(); c.setFillColor(hex('#667085')); c.setFont('Helvetica-Oblique', 6.5); c.drawCentredString(this.W / 2, 3.2 * mm, `Conception : ${APP.concepteur}`); c.restoreState(); }
  filigrane() {
    const c = this.c; c.saveState(); c.setFillColor(hex('#C8C8C8')); c.setFillAlpha(0.35); c.setFont('Helvetica', 54);
    const a = (this.paysage ? 30 : 57) * Math.PI / 180, cx = this.W / 2, cy = this.Hp / 2;
    for (const [t, dy] of [['ANNEE SCOLAIRE', 18], [this.annee, -42]]) {
      const w = c.sw(t), px = -w / 2, py = dy;
      c.drawString(cx + px * Math.cos(a) - py * Math.sin(a), cy + px * Math.sin(a) + py * Math.cos(a), t, { rotate: a * 180 / Math.PI });
    }
    c.restoreState();
  }
  pied() {
    const c = this.c; c.saveState(); c.setFillColor(NOIR);
    if (this.mode === 'fiche') {
      const y = 9 * mm; c.setFont('Helvetica', 9); c.drawString(this.x0 + 14 * mm, y, this.s.pied);
      c.setFont('Helvetica-Bold', 9.5); c.drawCentredString(this.W / 2 + 18 * mm, y, `Année scolaire ${this.annee}`);
      c.setFont('Helvetica', 9); c.drawRightString(this.x1 - 8 * mm, y, `Page ${this.page} / ${this.total || '…'}`);
    } else {
      const n = this.page - this.pagesFiche; c.setFont('Helvetica', 8); c.rect(this.x1 - 12 * mm, 9 * mm, 8 * mm, 5 * mm); c.drawCentredString(this.x1 - 8 * mm, 10.5 * mm, String(n));
    }
    c.restoreState();
  }
  place(h) { if (this.y - h < this.bas) this.nouvellePage(this.paysage); }
  fermerCadre() { if (this.cadre !== null) { this.y -= 1 * mm; this.c.setLineWidth(0.8); this.c.setStrokeColor(NOIR); this.c.rect(this.x0, this.y, this.x1 - this.x0, this.cadre - this.y); this.cadre = null; } }
  blocMemp(x, yHaut, hauteur) {
    if (this.imgMemp) { const r = this.imgMemp.width / this.imgMemp.height; this.c.drawImage(this.imgMemp, x, yHaut - hauteur, hauteur * r, hauteur); return hauteur * r; }
    const c = this.c; c.saveState(); c.setFillColor(hex('#333333')); c.setFont('Helvetica-Bold', hauteur / 7.5);
    ['MINISTÈRE', 'DES ENSEIGNEMENTS', 'MATERNEL ET PRIMAIRE', '', 'RÉPUBLIQUE DU BÉNIN'].forEach((t, i) => c.drawString(x, yHaut - (i + 1) * hauteur / 5.6, t));
    c.restoreState(); return hauteur * 2.4;
  }
  entete() {
    const c = this.c, x0 = this.x0, x1 = this.x1; let y = this.y;
    this.blocMemp(x0, y - 0.5 * mm, 19.5 * mm);
    c.saveState(); c.setFillColor(hex('#333333')); c.setFont('Helvetica-Bold', 6.8);
    ['01 BP 10 Porto-Novo', 'Tél:+229 20 21 52 22', 'Fax: +229 20 21 52 22', 'E-mail: mempmatprim@gmail.com'].forEach((t, i) => c.drawString(x1 - 58 * mm, y - 4 * mm - i * 3 * mm, t));
    c.restoreState();
    y -= 24 * mm; const hb = 18 * mm;
    c.saveState(); c.setFillColor(hex('#FFFF33')); c.setStrokeColor(NOIR); c.setLineWidth(1); c.rect(x0 + 2 * mm, y - hb, 82 * mm, hb, 1, 1);
    c.setFillColor(NOIR); c.setFont('Helvetica-Bold', 7.8); c.drawString(x0 + 4 * mm, y - 4.5 * mm, "RESERVER A L'ADMINISTRATION");
    c.setFont('Helvetica', 7.8); let yy = y - 9 * mm;
    for (const f of this.s.admin) {
      c.setFillColor(NOIR); c.drawString(x0 + 4 * mm, yy, `${f.lib} :`);
      c.setFillColor(ENCRE); c.drawString(x0 + 6 * mm + c.sw(`${f.lib} :`, 'Helvetica', 7.8), yy, String(this.v[f.k] ?? '').slice(0, 40)); yy -= 4 * mm;
    }
    c.setFillColor(NOIR); c.rect(x1 - 85 * mm, y - hb, 85 * mm, hb, 1, 0);
    c.setFillColor(BLANC);
    if (this.primaire) { c.setFont('Helvetica-Bold', 9); c.drawCentredString(x1 - 42.5 * mm, y - 7.5 * mm, 'FICHE DE RECENSEMENT ANNUEL'); c.drawCentredString(x1 - 42.5 * mm, y - 12 * mm, 'DES ECOLES PRIMAIRES'); }
    else { c.setFont('Helvetica-Bold', 6.9); c.drawCentredString(x1 - 42.5 * mm, y - 10 * mm, this.s.titre); }
    c.restoreState();
    y -= hb + 7 * mm;
    if (this.ent.titre) { c.setFont('Helvetica-Bold', 10.5); c.setFillColor(ENCRE); c.drawString(x0 + 2 * mm, y, String(this.ent.titre).slice(0, 70)); c.setFillColor(NOIR); }
    else { c.setFont('Helvetica-Oblique', 8); c.setFillColor(NOIR); c.drawString(x0 + 2 * mm, y, '(Merci de bien vouloir remplir cette fiche au crayon)'); }
    if (this.ent.mention) { c.setFont('Helvetica-Oblique', 7); c.setFillColor(hex('#555555')); c.drawString(x0 + 2 * mm, y - 3.6 * mm, String(this.ent.mention).slice(0, 150)); c.setFillColor(NOIR); }
    const [a, b] = this.annee.split('-'); c.setFont('Times-Roman', 19); c.setFillColor(NOIR); c.drawRightString(x1 - 3 * mm, y - 1, `Année Scolaire ${a} - ${b}`);
    this.y = y - 4 * mm;
  }
  bande(num, titre) {
    const h = 5.2 * mm; this.fermerCadre(); this.place(h + 3 * this.LH);
    const c = this.c; c.saveState(); c.setFillColor(this.coul); c.setStrokeColor(NOIR); c.setLineWidth(0.8); c.rect(this.x0, this.y - h, this.x1 - this.x0, h, 1, 1);
    c.setFillColor(NOIR); c.setFont('Helvetica-Bold', 8.6); c.drawString(this.x0 + 24 * mm, this.y - h + 1.6 * mm, `${num}. ${titre}`); c.restoreState();
    this.y -= h + 0.8 * mm; this.cadre = this.y + 0.8 * mm;
  }
  police(st) { return [st.includes('b') ? 'Helvetica-Bold' : (st.includes('i') ? 'Helvetica-Oblique' : 'Helvetica'), st.includes('p') ? 6.8 : this.TAILLE]; }
  mots(txt, f) { return String(txt).split(/\s+/).filter(Boolean).map(m => [['t', m + ' ', f[0], f[1]]]); }
  groupes(it) {
    const f = this.police(it.st || ''); let out = it.texte ? this.mots(it.texte, f) : [];
    for (const ch of it.champs) {
      if (typeof ch === 'string') { out.push([['sp', 2 * mm]]); out = out.concat(this.mots(ch, this.police(ch.length > 30 ? 'p' : ''))); continue; }
      out.push([['sp', 2.5 * mm]]); out = out.concat(this.groupesChamp(ch, f));
    }
    return out;
  }
  groupesChamp(ch, f) {
    const v = this.v[ch.k] ?? '', t = ch.t; let out = [];
    const lib = ch.lib && t !== 'case' ? this.mots(ch.lib, f) : [];
    if (t === 'on') { const labs = ch.maj ? ['OUI', 'NON'] : OUINON; OUINON.forEach((o, i) => out.push([['t', labs[i], f[0], f[1]], ['sp', 1.2 * mm], ['case', v === o], ['sp', 5 * mm]])); }
    else if (t === 'ch') { const ch2 = Array.isArray(v) ? v : [v]; for (const o of ch.opts) out.push([['t', o, f[0], f[1]], ['sp', 1.2 * mm], ['case', ch2.includes(o)], ['sp', 4 * mm]]); }
    else if (t === 'case') out.push([['t', ch.lib, f[0], f[1]], ['sp', 1.5 * mm], ['case', v === '1']]);
    else if (t === 'nb') { out = [...lib, [['boites', ch.n, ch.dec, v, ch.k === 'nom']]]; if (ch.unite) out[out.length - 1].push(['sp', 1 * mm], ['t', ch.unite, f[0], f[1]]); }
    else if (t === 'tx') out = [...lib, [['pts', ch.w * mm, v]]];
    else if (t === 'mt') out = [...lib, [['mt', v]]];
    return out;
  }
  largeur(seg) {
    const k = seg[0], c = this.c;
    if (k === 'pts' && seg.length > 3) return seg[3];
    if (k === 't') return c.sw(seg[1], seg[2], seg[3]);
    if (k === 'sp') return seg[1];
    if (k === 'case') return 2.7 * mm;
    if (k === 'boites') { const [, n, dec, val, texte] = seg; if (texte) return 4.2 * mm * n; const ip = String(val ?? '').replace('.', ',').split(',')[0]; return 4 * mm * (Math.max(n, ip.length) + dec) + (dec ? 2 * mm : 0); }
    if (k === 'pts') return Math.max(seg[1], c.sw(String(seg[2] ?? ''), 'Helvetica', 8) + 3 * mm);
    if (k === 'mt') return 52 * mm;
    return 0;
  }
  dessinerSeg(seg, x, y) {
    const c = this.c, k = seg[0];
    if (k === 't') { c.setFillColor(NOIR); c.setFont(seg[2], seg[3]); c.drawString(x, y, seg[1]); }
    else if (k === 'case') dessinerCase(c, x, y - 0.4 * mm, 2.6 * mm, seg[1]);
    else if (k === 'boites') this.boites(x, y, seg[1], seg[2], seg[3], seg[4]);
    else if (k === 'pts') {
      const w = this.largeur(seg); c.saveState(); c.setStrokeColor(NOIR); c.setDash(0.6, 1.4); c.setLineWidth(0.5); c.line(x, y - 0.8, x + w, y - 0.8); c.restoreState();
      if (seg[2]) { c.setFillColor(ENCRE); c.setFont('Helvetica', 8); c.drawString(x + 1.2 * mm, y + 0.2, String(seg[2])); }
    } else if (k === 'mt') {
      c.saveState(); c.setStrokeColor(NOIR); c.setLineWidth(0.6); c.rect(x, y - 1.4 * mm, 50 * mm, 4.5 * mm); c.setFillColor(NOIR); c.setFont('Helvetica-Bold', 8); c.drawRightString(x + 48.5 * mm, y, 'FCFA');
      if (seg[1] !== '' && seg[1] !== undefined) { c.setFillColor(ENCRE); c.setFont('Helvetica-Bold', 8.5); c.drawRightString(x + 36 * mm, y, milliers(seg[1])); }
      c.restoreState();
    }
  }
  boites(x, y, n, dec, val, texte) {
    const c = this.c; val = String(val ?? ''); c.saveState(); c.setStrokeColor(NOIR); c.setLineWidth(0.6);
    let bw, cars, dp = '';
    if (texte) { bw = 4.2 * mm; n = Math.max(n, val.length); if (val.length > 27) bw = 4.2 * mm * 27 / val.length; cars = [...val.toUpperCase()]; }
    else { bw = 4 * mm; const s = val.replace('.', ','), i = s.indexOf(','); const ip = i >= 0 ? s.slice(0, i) : s; dp = i >= 0 ? s.slice(i + 1) : ''; n = Math.max(n, ip.length); cars = [...Array(n - ip.length).fill(''), ...ip]; }
    c.line(x, y - 0.8, x + n * bw, y - 0.8);
    for (let i = 0; i <= n; i++) c.line(x + i * bw, y - 0.8, x + i * bw, y + 2.4 * mm);
    c.setFillColor(ENCRE); c.setFont('Helvetica-Bold', bw > 3 * mm ? 8 : 6.5);
    cars.forEach((ch, i) => { if (String(ch).trim()) c.drawCentredString(x + (i + 0.5) * bw, y + 0.2, ch); });
    if (!texte && dec) {
      let xd = x + n * bw; c.setFillColor(NOIR); c.setFont('Helvetica-Bold', 9); c.drawString(xd + 0.4 * mm, y, ','); xd += 2 * mm;
      c.line(xd, y - 0.8, xd + dec * bw, y - 0.8); for (let i = 0; i <= dec; i++) c.line(xd + i * bw, y - 0.8, xd + i * bw, y + 2.4 * mm);
      c.setFillColor(ENCRE); c.setFont('Helvetica-Bold', 8); [...dp.slice(0, dec)].forEach((ch, i) => c.drawCentredString(xd + (i + 0.5) * bw, y + 0.2, ch));
    }
    c.restoreState();
  }
  ligne(it, x0, x1) {
    const xt = x0 + 14 * mm + (it.ind || 0) * mm; this.place(this.LH);
    let y = this.y - this.LH + 1.3 * mm; const ytop = this.y, c = this.c;
    if (it.num) { c.setFont('Helvetica', this.TAILLE); c.setFillColor(NOIR); c.drawString(x0 + 3 * mm, y, it.num); }
    let x = xt;
    for (const grp of this.groupes(it)) {
      const w = grp.reduce((a, s) => a + this.largeur(s), 0);
      if (x + w > x1 - 1 * mm && x > xt + 1) { this.y -= this.LH; this.place(this.LH); y = this.y - this.LH + 1.3 * mm; x = xt + 3 * mm; }
      for (let seg of grp) {
        if (seg[0] === 'mt') x = Math.max(x, x1 - 62 * mm);
        if (seg[0] === 'pts' && x + this.largeur(seg) > x1 - 2 * mm) { const wcap = Math.max(x1 - 2 * mm - x, 10 * mm); seg = ['pts', wcap, seg[2], wcap]; }
        this.dessinerSeg(seg, x, y); x += this.largeur(seg);
      }
    }
    this.y -= this.LH;
    for (const ch of it.champs) {
      if (ch && typeof ch === 'object' && ch.t === 'tx' && (ch.lignes || 1) > 1) {
        const reste = String(this.v[ch.k] ?? '') ? decouper(c, String(this.v[ch.k]), 'Helvetica', 8, x1 - xt - 6 * mm) : [];
        for (let i = 0; i < Math.max(ch.lignes, reste.length); i++) {
          this.place(this.LH); const yy = this.y - this.LH + 1.3 * mm;
          c.saveState(); c.setStrokeColor(NOIR); c.setDash(0.6, 1.4); c.setLineWidth(0.5); c.line(xt, yy - 0.8, x1 - 6 * mm, yy - 0.8); c.restoreState();
          if (i < reste.length) { c.setFillColor(ENCRE); c.setFont('Helvetica', 8); c.drawString(xt + 1 * mm, yy + 0.2, reste[i]); }
          this.y -= this.LH;
        }
      }
    }
    if (it.st === 'cadre') { c.setLineWidth(0.6); c.setStrokeColor(NOIR); c.rect(xt - 1.5 * mm, this.y + 0.4 * mm, x1 - xt - 3 * mm, ytop - this.y - 0.8 * mm); }
  }
  para(it, x0, x1) {
    const f = this.police(it.st || ''), xt = x0 + 14 * mm + (it.ind || 0) * mm;
    for (const txt of decouper(this.c, it.texte, f[0], f[1], x1 - xt - 2 * mm)) {
      this.place(this.LH); this.c.setFont(...f); this.c.setFillColor(NOIR); this.c.drawString(xt, this.y - this.LH + 1.3 * mm, txt);
      this.y -= this.LH * ((it.st || '').includes('p') ? 0.85 : 1);
    }
  }
  grille(it, x0, x1) {
    const xt = x0 + 14 * mm + (it.ind || 0) * mm, lc = (x1 - xt) / it.ncol, ch = it.champs;
    for (let i = 0; i < ch.length; i += it.ncol) {
      this.place(this.LH); const y = this.y - this.LH + 1.3 * mm;
      ch.slice(i, i + it.ncol).forEach((c2, j) => {
        const xc = xt + j * lc; this.c.setFont('Helvetica', this.TAILLE); this.c.setFillColor(NOIR); this.c.drawString(xc, y, c2.lib);
        const seg = ['boites', c2.n, c2.dec, this.v[c2.k] ?? '', false];
        this.boites(xc + lc - this.largeur(seg) - 4 * mm, y, c2.n, c2.dec, this.v[c2.k] ?? '', false);
      });
      this.y -= this.LH;
    }
  }
  table(t, larg) {
    const c = this.c, leaves = feuilles(t.cols), depth = profondeur(t.cols), rows = lignesTableau(t, this.dyn[t.k]);
    const nlab = rows.some(r => r.groupe) ? 2 : 1, nc = nlab + leaves.length, T_ = t.taille;
    const P = (txt, st) => new Para(c, txt, st);
    const stH = { size: T_, leading: T_ + 1.2, align: 'center' }, stL = { size: T_, leading: T_ + 1.2 }, stLB = { ...stL, font: 'Helvetica-Bold' };
    const stV = { font: 'Helvetica-Bold', size: T_ + 0.5, leading: T_ + 1.6, align: 'center', color: ENCRE }, stVT = { ...stV, font: 'Helvetica', align: 'left', size: T_ };
    const labw = nlab === 2 ? [5 * mm, t.label_w * mm] : [t.label_w * mm];
    const dispo = larg - labw.reduce((a, b) => a + b, 0), fixes = leaves.reduce((a, x) => a + (x.w ? x.w * mm : 0), 0), libres = leaves.filter(x => !x.w);
    let ws;
    if (libres.length) { const each = Math.max((dispo - fixes) / libres.length, 4 * mm); ws = leaves.map(x => (x.w ? x.w * mm : each)); }
    else ws = leaves.map(x => x.w * mm * dispo / fixes);
    const data = Array.from({ length: depth + rows.length }, () => Array(nc).fill(''));
    const spans = [], st = { fond: new Map(), valign: new Map(), align: new Map() };
    for (const [r, cc, rs, cs, lib, vert] of enteteCellules(t.cols, depth)) {
      data[r][nlab + cc] = vert ? new Vert(c, lib, T_) : P(lib, stH);
      if (rs > 1 || cs > 1) spans.push([nlab + cc, r, nlab + cc + cs - 1, r + rs - 1]);
      if (vert) st.valign.set(r + ',' + (nlab + cc), 'bottom');
    }
    data[0][0] = t.coin ? (t.label_v ? new Vert(c, t.coin, T_) : P(t.coin, stH)) : '';
    if (nlab > 1 || depth > 1) spans.push([0, 0, nlab - 1, depth - 1]);
    for (let i = 0; i < rows.length;) {
      const r = rows[i];
      if (r.groupe) { let j = i; while (j + 1 < rows.length && rows[j + 1].groupe === r.groupe) j++; data[depth + i][0] = new Vert(c, r.groupe, T_ - 0.5, (j - i + 1) * 5 * mm); spans.push([0, depth + i, 0, depth + j]); i = j + 1; }
      else i++;
    }
    rows.forEach((r, i) => {
      const ri = depth + i, lab = P(r.lib, r.st === 'b' ? stLB : stL);
      if (r.groupe) data[ri][1] = lab; else { data[ri][0] = lab; if (nlab === 2) spans.push([0, ri, 1, ri]); }
      const fus = r.fusion, span = r.span || {}, grise = r.grise || [];
      if (fus) { const cf = leaves.map((x, j) => (fus[0].includes(x.k) ? j : -1)).filter(j => j >= 0); data[ri][nlab + cf[0]] = P(fus[1], r.st === 'b' ? stLB : stH); spans.push([nlab + cf[0], ri, nlab + cf[cf.length - 1], ri]); }
      leaves.forEach((col, j) => {
        const cj = nlab + j;
        if (fus && fus[0].includes(col.k)) return;
        if (grise.includes(col.k) && !leaves.some((x, m) => (span[x.k] || 1) > 1 && j >= m && j < m + span[x.k])) { st.fond.set(ri + ',' + cj, GRISE); return; }
        if (leaves.some((x, m) => j >= m + 1 && j < m + (span[x.k] || 1))) return;
        if ((span[col.k] || 1) > 1) spans.push([cj, ri, cj + span[col.k] - 1, ri]);
        const val = this.v[`${t.k}.${r.k}.${col.k}`] ?? '';
        if (col.t === 'c') data[ri][cj] = new CaseF(c, val === '1', 2.4 * mm);
        else if (val !== '') {
          let s2 = col.t === 't' ? stVT : stV;
          const dispoC = ws[j] * (span[col.k] || 1) - 2.6, mot = Math.max(0, ...String(val).split(/\s+/).map(m => c.sw(m, s2.font, s2.size)));
          if (mot > dispoC && dispoC > 0) { const sz = Math.max(4.2, s2.size * dispoC / mot); s2 = { ...s2, size: sz, leading: Math.max(5, s2.size * dispoC / mot + 1.2) }; }
          data[ri][cj] = P(String(val), s2);
        }
      });
      for (let j = 0; j < nlab; j++) st.align.set(ri + ',' + j, 'left');
    });
    const hl = t.h_ligne ? t.h_ligne * mm : null;
    return new Tableau(c, data, [...labw, ...ws], [...Array(depth).fill(null), ...Array(rows.length).fill(hl)], spans, st, depth);
  }
  tableau(t, x0, x1) {
    let larg = t.largeur ? t.largeur * mm : (x1 - x0 - 4 * mm - (t.ind || 0) * mm); larg = Math.min(larg, x1 - x0 - 4 * mm);
    const x = x0 + 2 * mm + (t.ind || 0) * mm; let tab = this.table(t, larg); const h = tab.height;
    if (this.y - h - 1 * mm < this.bas) {
      if (h < this.Hp - 30 * mm && this.y < this.Hp - 60 * mm) this.nouvellePage(this.paysage);
      else {
        let premier = true;
        while (tab) {
          const parts = tab.split(this.y - this.bas - 1 * mm);
          const mo = parts.length ? parts[0] : tab;
          if (!premier && !parts.length && this.y - mo.height - 1 * mm < this.bas) { /* reste trop haut : dessiné tel quel */ }
          mo.drawOn(x, this.y - mo.height - 0.5 * mm); this.y -= mo.height + 1.5 * mm;
          tab = parts.length ? parts[1] : null; premier = false;
          if (tab) { this.nouvellePage(this.paysage); if (this.y - tab.height - 1 * mm >= this.bas) { tab.drawOn(x, this.y - tab.height - 0.5 * mm); this.y -= tab.height + 1.5 * mm; tab = null; } }
        }
        return;
      }
    }
    tab.drawOn(x, this.y - h - 0.5 * mm); this.y -= h + 1.8 * mm;
  }
  signatures(kind) {
    const c = this.c;
    if (kind === 'primaire') {
      const h = 30 * mm; this.place(h + 6 * mm); c.setFont('Helvetica', 9); c.setFillColor(NOIR); c.drawCentredString(this.W / 2, this.y - 3.5 * mm, 'Signatures et Visas'); this.y -= 5 * mm;
      const titres = [['Directeur'], ['RUP'], ['Conseiller Pédagogique'], ['Chef de la', 'Circonscription Scolaire']], larg = (this.x1 - this.x0) / 4;
      c.setLineWidth(0.6); c.setStrokeColor(NOIR);
      titres.forEach((tt, i) => { const x = this.x0 + i * larg; c.rect(x, this.y - h, larg, h); tt.forEach((t, j) => c.drawCentredString(x + larg / 2, this.y - 4 * mm - j * 3.8 * mm, t)); });
      this.y -= h;
    } else {
      const xt = this.x0 + 28 * mm; this.place(6 * this.LH); c.setFont('Helvetica', this.TAILLE); c.setFillColor(NOIR); c.drawString(xt, this.y - 3 * mm, 'Signature : ' + '.'.repeat(90)); this.y -= 8 * mm;
      for (const [titre, sous] of [["Contrôlé par le Responsable d'Unité Pédagogique", '(Signature - Nom et Prénoms - date)'], ['Contrôlé par le Conseiller Pédagogique', '(Signature - Nom et Prénoms - date)'], ['Visa du chef de la Circonscription scolaire', '(Signature- Nom et Prénoms - date)']]) {
        this.place(26 * mm); c.setFont('Helvetica', this.TAILLE); c.drawString(xt, this.y - 3 * mm, titre); c.drawString(xt, this.y - 8 * mm, sous); this.y -= 26 * mm;
      }
    }
  }
  items(items, x0, x1) {
    for (const it of items) {
      const k = it.i;
      if (k === 'L') this.ligne(it, x0, x1); else if (k === 'P') this.para(it, x0, x1); else if (k === 'G') this.grille(it, x0, x1); else if (k === 'T') this.tableau(it, x0, x1);
      else if (k === 'SAUT') this.nouvellePage(it.paysage); else if (k === 'SIG') this.signatures(it.kind); else if (k === 'ESP') this.y -= it.h * mm;
      else if (k === 'C2') {
        const xm = x0 + (x1 - x0) * it.ratio, h = Math.max(this.hauteur(it.g, x0, xm), this.hauteur(it.d, xm, x1));
        this.place(h); const y0 = this.y;
        this.items(it.g, x0, xm); const yg = this.y; this.y = y0;
        this.items(it.d, xm - 10 * mm, x1); this.y = Math.min(yg, this.y);
      }
    }
  }
  hauteur(items, x0, x1) {
    let h = 0;
    for (const it of items) {
      if (it.i === 'T') { const larg = Math.min(it.largeur ? it.largeur * mm : (x1 - x0), x1 - x0 - 4 * mm); h += this.table(it, larg).height + 2 * mm; }
      else h += this.LH * (it.i === 'L' && (it.champs || []).length > 2 ? 2 : 1);
    }
    return h;
  }
  dessiner(guide) {
    this.nouvellePage(false); this.entete();
    for (const s of this.s.sections) {
      if (s.i === 'SAUT') { this.fermerCadre(); this.nouvellePage(s.paysage); continue; }
      this.bande(s.num, s.titre); this.items(s.items, this.x0, this.x1); this.fermerCadre(); this.y -= 1.5 * mm;
    }
    if (guide && this.primaire && this.guideTexte) this.guide();
    this.pied(); this.concepteur();
  }
  /* guide de remplissage : paragraphes justifiés (gras, souligné, exposant) */
  guide() {
    this.nouvellePage(false, 'guide');
    const c = this.c, bx = this.x0 + 28 * mm, bw = this.x1 - this.x0 - 56 * mm, bh = 17 * mm;
    c.setStrokeColor(NOIR); c.setLineWidth(2.2); c.rect(bx, this.y - bh, bw, bh); c.setLineWidth(0.6); c.rect(bx + 1.2 * mm, this.y - bh + 1.2 * mm, bw - 2.4 * mm, bh - 2.4 * mm);
    c.setFont('Helvetica', 13); c.setFillColor(NOIR); c.drawCentredString(bx + bw / 2, this.y - 7 * mm, 'Guide de remplissage de la fiche de recensement'); c.drawCentredString(bx + bw / 2, this.y - 13 * mm, 'annuel des Ecoles Primaires (EP)');
    this.y -= bh + 8 * mm;
    const ST = { p: { b: false, size: 10, lead: 14, just: true, after: 5, before: 0, ind: 0 }, s: { b: true, size: 10, lead: 14, before: 4, after: 3, ind: 0 }, h: { b: true, size: 10, lead: 14, before: 6, after: 6, ind: 10, u: true },
      h0: { b: true, size: 10, lead: 14, after: 6, before: 0, ind: 0, u: true }, n: { b: false, size: 8, lead: 10, before: 8, after: 0, ind: 0 } };
    const fx0 = this.x0 + 8 * mm + 6, fw = this.x1 - this.x0 - 16 * mm - 12;
    let haut = true, apres = 0; this.y -= 6;
    for (const [typ, txt] of this.guideTexte) {
      const s = ST[typ];
      // fragments : {t, b, sup}
      const frags = []; let b = s.b, sup = false;
      for (const part of String(txt).split(/(<\/?b>|<\/?super>)/)) {
        if (part === '<b>') b = true; else if (part === '</b>') b = s.b; else if (part === '<super>') sup = true; else if (part === '</super>') sup = false;
        else if (part) for (const m of part.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').split(/(\s+)/)) if (m) frags.push({ t: m, b, sup, esp: /^\s+$/.test(m) });
      }
      const fontOf = (f) => (f.b ? 'Helvetica-Bold' : 'Helvetica'), sizeOf = (f) => (f.sup ? s.size * 0.6 : s.size);
      const largeurMot = (mot) => mot.reduce((a, f) => a + c.sw(f.t, fontOf(f), sizeOf(f)), 0);
      const motsL = []; let cur = [];
      for (const f of frags) { if (f.esp) { if (cur.length) motsL.push(cur); cur = []; } else cur.push(f); }
      if (cur.length) motsL.push(cur);
      const W = fw - s.ind, esp = c.sw(' ', 'Helvetica', s.size), lignes = []; let L = [], lw = 0;
      for (const m of motsL) { const w = largeurMot(m); if (L.length && lw + esp + w > W) { lignes.push([L, lw]); L = [m]; lw = w; } else { lw += (L.length ? esp : 0) + w; L.push(m); } }
      if (L.length) lignes.push([L, lw]);
      if (!haut) this.y -= Math.max(s.before - apres, 0);   // reportlab : espace avant fusionné avec l'espace après précédent
      lignes.forEach(([mots, lwid], i) => {
        if (this.y - s.lead < this.bas + 6) { this.nouvellePage(false); this.y -= 6; }
        const yb = this.y - s.size; let x = fx0 + s.ind;
        const derniere = i === lignes.length - 1, gap = s.just && !derniere && mots.length > 1 ? (W - lwid) / (mots.length - 1) + esp : esp;
        for (const m of mots) {
          const x0m = x;
          for (const f of m) { c.setFont(fontOf(f), sizeOf(f)); c.setFillColor(NOIR); c.drawString(x, f.sup ? yb + s.size * 0.4 : yb, f.t); x += c.sw(f.t, fontOf(f), sizeOf(f)); }
          if (s.u) { c.setStrokeColor(NOIR); c.setLineWidth(0.5); c.line(x0m, yb - 1.5, x + (m === mots[mots.length - 1] ? 0 : gap), yb - 1.5); }
          x += gap;
        }
        this.y -= s.lead;
      });
      this.y -= s.after; apres = s.after; haut = false;
    }
  }
}

/* ------------------------------------------------------------------ API */
let _img;
async function polices(P, doc) {
  const S = P.StandardFonts;
  return { Helvetica: await doc.embedFont(S.Helvetica), 'Helvetica-Bold': await doc.embedFont(S.HelveticaBold), 'Helvetica-Oblique': await doc.embedFont(S.HelveticaOblique), 'Times-Roman': await doc.embedFont(S.TimesRoman) };
}
/** Octets du PDF de la fiche. vierge : fiche à remplir à la main ; sinon eff (valeurs effectives) et dyn. */
export async function pdfFiche(D, typ, { eff, dyn, annee, vierge = false, guide = true, entete = {} }) {
  const P = globalThis.PDFLib, schema = D.schemas[typ];
  if (vierge) ({ eff, dyn } = valeursVierges(schema));
  else if (!dyn) dyn = nbLignesDyn(schema, eff, {});
  if (!_img) { try { _img = await fetchBytes('assets/memp-recensement.png'); } catch (e) { _img = null; } }
  let total = null;
  for (const passe of [1, 2]) {
    const doc = await P.PDFDocument.create();
    const c = new Canvas(P, doc, await polices(P, doc)), img = _img ? await doc.embedPng(_img) : null;
    const r = new Rendu(c, img, schema, eff || {}, dyn || {}, annee, total, entete);
    r.guideTexte = D.guide;
    r.dessiner(passe === 2 && guide);
    if (passe === 1) { total = r.pagesFiche; continue; }
    doc.setTitle(`${schema.titre_court} – ${annee}`); doc.setAuthor(APP.concepteur); doc.setCreator(APP.full);
    return doc.save();
  }
}
