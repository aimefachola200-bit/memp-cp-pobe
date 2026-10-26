/* République du Bénin — MEMP — PDF des fiches de rapport de rentrée et de fin d'année (EP, EM), remplies ou vierges
   Transposition fidèle du rendu de GESCOL / SCOLARIS (m_rapports.Rendu, reportlab) sur pdf-lib : en-tête MEMP, bandes
   tricolores, pointillés, cases /…/…/, ronds et cases à cocher, tableaux du modèle, état nominatif en paysage (12, 10
   ou 9 lignes par page), notes et visas. Valeurs écrites à l'encre bleue, comme au stylo.
   Conception : Maître Aimé FACHE */
import { fetchBytes } from './util.js';
import { Canvas, decouper, hex } from './pdf-canvas.js';
import { APP } from './config.js';
import { normaliser, nbLignesPersonnel, blocPersonnel, coursDe, bloc as blocDe, NIV_EP } from './rapports.js';

const mm = 72 / 25.4;
const A4 = [595.2755905511812, 841.8897637795277], A4P = [A4[1], A4[0]];
const NOIR = [0, 0, 0], BLEU = hex('#0B3A8C');

class Rendu {
  constructor(c, D, doc, v, vierge, serif, entete, img) {
    Object.assign(this, { c, D, doc, v: v || {}, vierge, ent: entete || {}, img });
    this.synth = !!this.ent.synthese;
    this.F = serif ? 'Times-Roman' : 'Helvetica'; this.FB = serif ? 'Times-Bold' : 'Helvetica-Bold';
    this.FI = serif ? 'Times-Italic' : 'Helvetica-Oblique'; this.FBI = serif ? 'Times-BoldItalic' : 'Helvetica-BoldOblique';
    this.FV = 'Helvetica';
  }
  get W() { return this.c.page.getWidth(); }
  get PH() { return this.c.page.getHeight(); }
  Y(t) { return this.PH - t; }
  page(taille) {
    this.c.nouvellePage(...taille);
    const c = this.c; c.saveState(); c.setFillColor(hex('#667085')); c.setFont('Helvetica-Oblique', 6.5); c.drawCentredString(this.W / 2, 3.2 * mm, `Conception : ${APP.concepteur}`); c.restoreState();
  }
  val(k) { if (this.vierge) return ''; const x = this.v[k]; if (x && typeof x === 'object') return ''; return x === null || x === undefined ? '' : String(x); }
  choix(k, option) {
    if (this.vierge) return false; const x = this.v[k];
    if (x && typeof x === 'object') return parseInt(x[option] || 0, 10) || 0;
    return x !== undefined && x !== null && x !== '' ? normaliser(x) === normaliser(option) : false;
  }
  compte(xFin, y, n, size = 8) {
    if (typeof n === 'boolean' || !this.synth) return xFin;
    const c = this.c, s = String(n); c.setFillColor(BLEU); c.setFont('Helvetica-Bold', size); c.drawString(xFin + 1.5, this.Y(y), s); c.setFillColor(NOIR);
    return xFin + 1.5 + c.sw(s, 'Helvetica-Bold', size);
  }
  t(x, y, s, size = 11, font = null, { centre = false, droite = false } = {}) {
    const c = this.c, f = font || this.F; c.setFont(f, size); c.setFillColor(NOIR);
    if (centre) { c.drawCentredString(x, this.Y(y), s); return x + c.sw(s, f, size) / 2; }
    if (droite) { c.drawRightString(x, this.Y(y), s); return x; }
    c.drawString(x, this.Y(y), s); return x + c.sw(s, f, size);
  }
  souligne(x, y, s, size, font = null) {
    const x2 = this.t(x, y, s, size, font || this.FB); this.c.setLineWidth(0.7); this.c.line(x, this.Y(y) - 1.6, x2, this.Y(y) - 1.6); return x2;
  }
  valeur(x1, x2, y, s, size = 10, centre = false) {
    if (!s) return;
    const c = this.c, larg = Math.max(8, x2 - x1); let taille = size;
    while (taille > 5.5 && c.sw(s, this.FV, taille) > larg) taille -= 0.25;
    c.setFillColor(BLEU);
    if (c.sw(s, this.FV, taille) <= larg) {
      c.setFont(this.FV, taille);
      if (centre) c.drawCentredString((x1 + x2) / 2, this.Y(y) + 1, s); else c.drawString(x1, this.Y(y) + 1, s);
    } else {
      let lignes = decouperLong(c, s, this.FV, 5.5, larg); taille = 5.5;
      if (lignes.length > 3) { taille = Math.max(3.5, 5.5 * 3 / lignes.length); lignes = decouperLong(c, s, this.FV, taille, larg); }
      c.setFont(this.FV, taille);
      const h = taille + 0.4, y0 = this.Y(y) + 1 + h * (lignes.length - 1) / 2;
      lignes.forEach((l, i) => c.drawString(x1, y0 - i * h, l));
    }
    c.setFillColor(NOIR);
  }
  points(x1, x2, y) {
    if (x2 - x1 < 3) return;
    const c = this.c; c.saveState(); c.setLineWidth(0.9); c.setLineCap(1); c.setDash([0.05, 2.3]); c.setStrokeColor(hex('#333333'));
    c.line(x1, this.Y(y) - 0.5, x2, this.Y(y) - 0.5); c.restoreState();
  }
  champ(x, y, lib, k, x2, size = 11, font = null, vsize = null) {
    const xd = lib ? this.t(x, y, lib, size, font) + 2 : x;
    this.points(xd, x2, y); this.valeur(xd + 2, x2 - 1, y, this.val(k), vsize || size - 0.5); return x2;
  }
  casesSlash(x, y, n, larg, k, size = 11, texte = null) {
    let s = texte === null ? this.val(k) : texte;
    const c = this.c, wSl = c.sw('/', this.F, size); let xs = x;
    for (let i = 0; i < n; i++) { this.t(xs, y, '/', size); this.points(xs + wSl + 1, xs + wSl + larg - 1, y); xs += wSl + larg; }
    this.t(xs, y, '/', size);
    const fin = xs + wSl;
    if (s && n > 1 && /^\d+$/.test(s) && s.length < n) s = s.padStart(n, '0');
    if (s) {
      if (s.length === n && n > 1) [...s].forEach((ch, i) => { const a = x + i * (wSl + larg) + wSl; this.valeur(a, a + larg, y - 1, ch, size, true); });
      else this.valeur(x + wSl, fin - wSl, y - 1, s, size, true);
    }
    return fin;
  }
  casesTrait(x, y, larg, k = null, size = 10, coche = null) {
    const c = this.c; this.t(x, y, '/', size);
    const w = c.sw('/', this.F, size); c.setLineWidth(0.6); c.line(x + w + 0.5, this.Y(y) - 1, x + w + larg, this.Y(y) - 1);
    this.t(x + w + larg + 0.5, y, '/', size);
    if (coche !== null) {
      if (this.synth && typeof coche !== 'boolean') { if (!this.vierge) this.valeur(x + w, x + w + larg, y - 1, String(coche), size, true); }
      else if (coche && !this.vierge) this.valeur(x + w, x + w + larg, y - 1, 'X', size, true);
    } else if (k) this.valeur(x + w, x + w + larg, y - 1, this.val(k), size, true);
    return x + 2 * w + larg + 1;
  }
  rond(x, y, r, plein) {
    const c = this.c; c.setLineWidth(0.7); c.setStrokeColor(NOIR); c.circle(x + r, this.Y(y) + r * 0.65, r, 1, 0);
    if (plein && !this.vierge) { c.setFillColor(BLEU); c.circle(x + r, this.Y(y) + r * 0.65, r * 0.55, 0, 1); c.setFillColor(NOIR); }
    return this.compte(x + 2 * r, y, plein);
  }
  carre(cx, cy, s, coche) {
    const c = this.c, x = cx - s / 2, y = this.Y(cy) - s / 2;
    c.setLineWidth(0.6); c.setStrokeColor(NOIR); c.rect(x, y, s, s, 0, 1);
    c.setLineWidth(1.1); c.line(x + s + 0.6, y - 0.6, x + s + 0.6, y + s - 0.8); c.line(x + 0.8, y - 0.6, x + s + 0.6, y - 0.6);
    if (coche && !this.vierge) { c.setStrokeColor(BLEU); c.setLineWidth(1); c.line(x + 1.2, y + 1.2, x + s - 1.2, y + s - 1.2); c.line(x + 1.2, y + s - 1.2, x + s - 1.2, y + 1.2); c.setStrokeColor(NOIR); }
  }
  anneeBoites(cx, cy, s) {
    const c = this.c, w = 7.5, x0 = cx - 2 * w, y = this.Y(cy) - 3;
    c.setLineWidth(0.5); c.line(x0, y, x0 + 4 * w, y);
    for (let i = 0; i < 5; i++) c.line(x0 + i * w, y, x0 + i * w, y + 5);
    if (s && s.length === 4 && !this.vierge) { c.setFillColor(BLEU); c.setFont(this.FV, 7.5); [...s].forEach((ch, i) => c.drawCentredString(x0 + i * w + w / 2, y + 1, ch)); c.setFillColor(NOIR); }
    else if (s && !this.vierge) this.valeur(x0, x0 + 4 * w, cy - 1.5, s, 7, true);
  }
  /** cellules : [ligne, col, nb_lignes, nb_cols, texte, options] ; xs / ys = bornes (ys depuis le haut) */
  grille(xs, ys, cellules, lw = 0.6) {
    const c = this.c; c.setStrokeColor(NOIR);
    for (const [r, k, rs, cs, txt, o] of cellules) {
      const x1 = xs[k], x2 = xs[k + cs], y1 = ys[r], y2 = ys[r + rs];
      if (!o.sans_bord) { c.setLineWidth(o.lw ?? lw); c.rect(x1, this.Y(y2), x2 - x1, y2 - y1, 0, 1); }
      if (txt === null || txt === undefined || txt === '') continue;
      let size = o.size ?? 8;
      if (o.val) { if (!this.vierge) this.valeur(x1 + 1.5, x2 - 1.5, (y1 + y2) / 2 + size * 0.35, txt, size, (o.align || 'c') === 'c'); continue; }
      const font = o.font || this.F;
      if (o.rot) {
        c.setFont(font, size); c.setFillColor(NOIR);
        const lignes = decouper(c, txt, font, size, (y2 - y1) - 3), h = size + 1;
        const tx = (x1 + x2) / 2 + (h * (lignes.length - 1) / 2) - size * 0.33, ty = this.Y((y1 + y2) / 2);
        lignes.forEach((l, i) => c.drawCentredString90(tx + i * h, ty, l));
        continue;
      }
      const larg = x2 - x1 - 3, mots = txt.split(/\s+/).filter(Boolean);
      while (size > 4.5 && Math.max(...(mots.length ? mots : ['']).map(w => c.sw(w, font, size))) > larg) size -= 0.25;
      let lignes = [];
      for (const part of txt.split('\n')) { const l = decouper(c, part, font, size, larg); lignes = lignes.concat(l.length ? l : ['']); }
      const h = size * 1.15;
      let ytop = (y1 + y2) / 2 - h * lignes.length / 2 + size * 0.85;
      if (o.haut) ytop = y1 + size + 1.5;
      c.setFont(font, size); c.setFillColor(NOIR);
      lignes.forEach((l, i) => { const yy = this.Y(ytop + i * h); if (o.align === 'l') c.drawString(x1 + 2.5, yy, l); else c.drawCentredString((x1 + x2) / 2, yy, l); });
    }
  }
}
/** simpleSplit de reportlab (les mots trop longs restent entiers sur leur ligne) */
const decouperLong = (c, s, f, t, w) => decouper(c, s, f, t, w);

/* ------------------------------------------------------------------ en-tête et pieds */
function entete(R, doc, style) {
  const c = R.c, info = R.D.docs[doc], scan = style === 'scan', em = info.cycle === 'maternelle';
  const yb = scan && !em ? 60 : (scan ? 41 : (!em ? 20 : 25)), xb = scan && !em ? 225 : (scan ? 190 : 205);
  ['#1B8E3E', '#F4D21F', '#D52B1E'].forEach((coul, i) => { c.setFillColor(hex(coul)); c.rect(xb + i * 50, R.Y(yb), scan ? 48 : 52, 3, 1, 0); });
  c.setFillColor(NOIR);
  const y0 = scan ? (em ? 55 : 80) : (em ? 40 : 30);
  blocMemp(R, !em ? 46 : 30, R.Y(y0 - 2), 54);
  const xr = !em ? 405 : 390;
  ['01 BP 10 Porto-Novo', 'Tél:+229 20 21 52 22', 'Fax: +229 20 21 52 22', 'E-mail: mempmatprim@gmail.com'].forEach((l, i) => R.t(xr, y0 + 10 + i * 10, l, 7.5, 'Helvetica-Bold'));
  let y = y0 + 62;
  if (R.ent.titre) { R.t(553, y + (scan && em ? 8 : 10), String(R.ent.titre).slice(0, 60), 8.5, 'Helvetica-Bold', { droite: true }); }
  if (R.ent.mention) R.t(553, y + (scan && em ? 17 : 19), String(R.ent.mention).slice(0, 110), 6.5, 'Helvetica-Oblique', { droite: true });
  if (scan && em) {
    R.t(260, y + 8, info.direction, 8.5, 'Helvetica-BoldOblique', { centre: true });
    y += 20; c.setLineWidth(1); c.rect(67, R.Y(y + 36), 394, 36, 0, 1);
    R.t(264, y + 23, info.fiche, 11.5, 'Helvetica-BoldOblique', { centre: true });
    return y + 44;
  }
  R.t(scan ? 60 : 43, y + 10, info.direction, scan ? 9.5 : 10, !scan ? R.FB : 'Helvetica');
  R.t(scan ? 175 : 205, y + 21, scan ? '---------' : '-------------', 8, R.F);
  y += 30; c.setLineWidth(1.1);
  if (scan) { c.rect(68, R.Y(y + 44), 477, 44, 0, 1); R.t(306, y + 27, info.fiche, 12, 'Helvetica-BoldOblique', { centre: true }); y += 44; }
  else { const [x1, x2] = !em ? [69, 513] : [55, 499]; c.rect(x1, R.Y(y + 28), x2 - x1, 28, 0, 1); R.t((x1 + x2) / 2, y + 19, info.fiche, 13.5, 'Times-BoldItalic', { centre: true }); y += 28; }
  return y;
}
function blocMemp(R, x, yHaut, hauteur) {
  const c = R.c;
  if (R.img) { const r = R.img.width / R.img.height; c.drawImage(R.img, x, yHaut - hauteur, hauteur * r, hauteur); return hauteur * r; }
  c.saveState(); c.setFillColor(hex('#333333')); c.setFont('Helvetica-Bold', hauteur / 7.5);
  ['MINISTÈRE', 'DES ENSEIGNEMENTS', 'MATERNEL ET PRIMAIRE', '', 'RÉPUBLIQUE DU BÉNIN'].forEach((t, i) => c.drawString(x, yHaut - (i + 1) * hauteur / 5.6, t));
  c.restoreState(); return hauteur * 2.4;
}
const anneeTxt = (a) => String(a).split('-');
function pied(R, n, doc, paysage = false) {
  const info = R.D.docs[doc], W = R.W;
  if (info.moment === 'rentree' && info.cycle === 'maternelle') {
    if (n < 3) { R.t(W / 2 - 5, R.PH - 26, `Page ${n}`, 8.5, 'Helvetica', { centre: true }); R.t(W - 20, R.PH - 20, 'FICHE RAPPORT  RENTREE EM', 8, 'Helvetica', { droite: true }); }
    else R.t(W / 2, R.PH - 20, 'FICHE RAPPORT RENTREE EM (Suite et fin)', 8, 'Helvetica', { centre: true });
    return;
  }
  if (info.cycle === 'maternelle') { R.t(W - 50, R.PH - (R.PH > 700 ? 26 : 38), `Page ${n}`, 11, 'Times-Bold', { droite: true }); return; }
  R.t(W / 2, R.PH - (!paysage ? 26 : 24), `Page ${n}`, info.moment === 'fin' ? 10 : 9, R.F, { centre: true });
}

/* ------------------------------------------------------------------ EP : page 1 */
function page1EP(R, doc, annee) {
  const fin = R.D.docs[doc].moment === 'fin';
  let y = entete(R, doc, fin ? 'times' : 'scan'), x;
  const [X0, X1] = fin ? [43, 553] : [41, 555], fs = fin ? 11.2 : 10.2, pas = fin ? 21.6 : 19.2, [a1, a2] = anneeTxt(annee);
  if (fin) {
    y += 40;
    x = R.t(200, y, 'ANNEE SCOLAIRE : ', 12, R.FB); x = R.t(x, y, '20', 11.5); R.points(x, x + 16, y); R.valeur(x, x + 16, y, R.vierge ? '' : (a1 || '').slice(2), 11);
    x = R.t(x + 17, y, ' – 20', 11.5); R.points(x, x + 18, y); R.valeur(x, x + 18, y, R.vierge ? '' : (a2 || '').slice(2), 11);
    y += 22; x = R.t(X0, y, '1. ', 11.5, R.FB); R.souligne(x, y, "IDENTIFICATION ET LOCALISATION DE L'ECOLE", 11.5);
  } else {
    y += 20; x = R.t(180, y, 'ANNEE SCOLAIRE ', 11.5, 'Helvetica-BoldOblique'); R.champ(x, y, '', '', 380);
    if (!R.vierge) R.valeur(x + 3, 380, y, String(annee).replace('-', ' – '), 11);
    y += 28; R.t(X0, y, "1. IDENTIFICATION ET LOCALISATION DE L'ECOLE", 10.5, 'Helvetica-Bold');
  }
  y += pas; R.champ(X0, y, "1.1 Nom de l'école : ", 'nom_ecole', X1, fs);
  y += pas; x = R.t(X0, y, '1.2 Année de création : ', fs); x = R.casesSlash(x, y, 4, 18, 'annee_creation', fs); R.champ(x + 14, y, 'Référence : ', 'ref_creation', X1, fs);
  y += pas; x = R.t(X0, y, "1.3 Année d'extension : ", fs); x = R.casesSlash(x, y, 4, 18, 'annee_extension', fs); R.champ(x + 14, y, 'Référence : ', 'ref_extension', X1, fs);
  y += pas; x = R.t(X0, y, '1.4 Statut :  Public', fs); x = R.rond(x + 4, y, 4.5, R.choix('statut', 'Public'));
  x = R.t(x + 12, y, 'Privé', fs); x = R.rond(x + 4, y, 4.5, R.choix('statut', 'Privé'));
  x = R.t(x + 14, y, 'Communautaire', fs); x = R.rond(x + 4, y, 4.5, R.choix('statut', 'Communautaire'));
  R.champ(x + 6, y, "Si communautaire, précisez l'initiative : ", 'initiative', X1, fs - (fin ? 0.8 : 0.6));
  y += pas; R.t(X0, y, "1.5 Localisation dans le réseau d'Animation Pédagogique :", fs);
  y += pas; R.champ(X0, y, 'i- Circonscription scolaire : ', 'cs', X1, fs);
  y += pas; R.champ(X0, y, 'ii- Zone pédagogique : ', 'zone', 318, fs); R.champ(322, y, 'iii- Unité pédagogique : ', 'up', X1, fs);
  y += pas; R.t(X0, y, "1.6 Localisation dans l'administration territoriale :", fs);
  y += pas; R.champ(X0, y, 'i- Département : ', 'departement', 288, fs); R.champ(294, y, 'ii- Commune : ', 'commune', X1, fs);
  y += pas; R.champ(X0, y, 'iii- Arrondissement : ', 'arrondissement', 296, fs); R.champ(300, y, 'iv- Village ou quartier de ville : ', 'village', X1, fs);
  y += pas; x = R.t(X0, y, '1.8 Adresse :', fs); R.champ(x + 14, y, 'Boîte Postale : ', 'bp', 278, fs); R.champ(284, y, 'Téléphone : ', 'telephone', X1, fs);
  y += pas; R.champ(X0, y, fin ? 'E-mail : ' : 'e-mail : ', 'email', X1 - 10, fs);
  y += pas;
  if (fin) { x = R.t(X0, y, '2. ', 11.5, R.FB); R.souligne(x, y, 'INFORMATIONS GENERALES', 11.5); } else R.t(X0 + 2, y, '2. INFORMATIONS GENERALES', 10.5, 'Helvetica-Bold');
  y += pas; x = R.t(X0, y, '2.1 Nom et prénoms du Fondateur/Fondatrice', fs); x = R.t(x + 1, y - 4, '1', 6.5); R.champ(x + 2, y, ' : ', 'fondateur', X1, fs);
  y += pas; x = R.t(X0, y, '2.2 Nom et prénoms du Direct', fs); R.points(x + 1, x + 42, y);
  const tit = R.val('directeur_titre'); if (tit) R.valeur(x + 1, x + 42, y, tit === 'Directrice' ? 'rice' : 'eur', fs);
  R.champ(x + 44, y, ' : ', 'directeur_nom', X1, fs);
  y += pas; x = R.t(X0, y, '2.3 Nombre de classes autorisées : ', fs); R.casesSlash(x, y, 2, 17, 'classes_autorisees', fs);
  x = R.t(fin ? 310 : 284, y, 'Nombre de classes ouvertes : ', fs); R.casesSlash(x, y, 2, 17, 'classes_ouvertes', fs);
  y += pas; x = R.t(X0 + (fin ? 3 : 26), y, 'Nombre de salles de classe existantes : ', fs); R.casesSlash(x, y, 2, 17, 'salles_existantes', fs);
  x = R.t(fin ? 310 : 328, y, 'Nombre de salles de classe utilisées : ', fs); R.casesSlash(x, y, 2, 17, 'salles_utilisees', fs);
  y += pas; x = R.t(X0, y, "1.7 L'école dispose t'elle d'une cantine ?   OUI", fs); x = R.rond(x + 12, y, 5, R.choix('cantine', 'OUI'));
  x = R.t(x + 18, y, 'NON', fs); R.rond(x + 10, y, 5, R.choix('cantine', 'NON'));
  y += pas; x = R.t(X0, y, 'Si Oui, a-t-elle fonctionné ?   OUI', fs); x = R.rond(x + 3, y, 5, R.choix('cantine_fonctionne', 'OUI'));
  x = R.t(x + 8, y, 'NON', fs); R.rond(x + 3, y, 5, R.choix('cantine_fonctionne', 'NON'));
  y += pas; R.champ(X0, y, 'Si Non, donnez la raison ', 'cantine_raison', X1 - 30, fs);
  y += pas; R.t(X0, y, '2.4  Structure pédagogique', fs);
  const cols = fin ? [158, 201, 247, 294, 340, 388] : [170, 228, 285, 339, 390, 442], xsSal = fin ? 470 : 505;
  y += pas * 0.9;
  NIV_EP.forEach((n, i) => R.t(cols[i], y, n, fs, null, { centre: true }));
  R.t(xsSal + 30, y - 6, 'Nombre de salles', fs - 0.5, null, { centre: true }); R.t(xsSal + 30, y + 6, 'utilisées', fs - 0.5, null, { centre: true });
  const jum = fin ? [['CI_CP', 0, 1], ['CP_CE1', 1, 2], ['CE1_CE2', 2, 3], ['CE2_CM1', 3, 4], ['CM1_CM2', 4, 5]] : [['CI_CP', 0, 1], ['CE1_CE2', 2, 3], ['CM1_CM2', 4, 5]];
  for (const [lig, lib] of [['simple', 'Simple'], ['jumelee', 'Jumelée'], ['multi', 'Multigrade']]) {
    y += pas; R.t(X0 + (fin ? 0 : 38), y, lib, fs);
    if (lig === 'jumelee') for (const [code, a, b] of jum) R.casesSlash((cols[a] + cols[b]) / 2 - 9, y, 1, 11, `sp.jumelee.${code}`, fs);
    else NIV_EP.forEach((n, i) => R.casesSlash(cols[i] - 14, y, 1, 21, `sp.${lig}.${n}`, fs));
    R.casesSlash(xsSal + 2, y, 2, 21, `sp.${lig}.salles`, fs);
  }
  y += pas * 1.2; R.t(X0, y, '(1) Uniquement pour le privé.', !fin ? 7.5 : 8.5);
  pied(R, 1, doc);
}

/* ------------------------------------------------------------------ tableaux à partir du schéma */
function cellulesTableau(R, b, { libCol = true, enteteOpts = null, corpsOpts = null, lignesLibs = null, coinVide = true } = {}) {
  const eo = { size: 8.5, ...(enteteOpts || {}) }, co = { size: 8.5, ...(corpsOpts || {}) }, sous = b.sous, cells = [];
  const off = libCol ? 1 : 0, nh = sous ? 2 : 1;
  if (libCol && coinVide) cells.push([0, 0, nh, 1, '', { sans_bord: true }]);
  let j = off;
  for (const gr of b.groupes) {
    if (sous) { cells.push([0, j, 1, sous.length, gr.l, eo]); for (const [, slib] of sous) { cells.push([1, j, 1, 1, slib, eo]); j++; } }
    else { cells.push([0, j, 1, 1, gr.l, eo]); j++; }
  }
  b.lignes.forEach(([lc, llib], i) => {
    const r = nh + i;
    if (libCol) cells.push([r, 0, 1, 1, (lignesLibs || {})[lc] ?? llib, { ...co, align: 'l' }]);
    j = off;
    for (const gr of b.groupes) for (const s of (sous ? sous.map(x => x[0]) : [null])) {
      cells.push([r, j, 1, 1, R.val(`${b.k}.${lc}.${gr.c}` + (s ? `_${s}` : '')), { val: true, size: 8.5 }]); j++;
    }
  });
  return cells;
}
const bornes = (debut, largeurs) => { const xs = [debut]; for (const w of largeurs) xs.push(xs[xs.length - 1] + w); return xs; };
const rep = (n, x) => Array(n).fill(x);

function page2EP(R, doc) {
  const fin = R.D.docs[doc].moment === 'fin', T = fin ? R.FB : 'Helvetica-Bold', hs = fin ? 11.5 : 11;
  const titre = (y, num, lib, x = null) => { x = x ?? (fin ? 43 : 24); if (fin) { const xx = R.t(x, y, num + ' ', hs, T); R.souligne(xx, y, lib, hs, T); } else R.t(x, y, `${num} ${lib}`, hs, T); };
  let b = blocDe(R.D, doc, 'eff'), xs, ys, cells;
  if (fin) {
    titre(49, '3.', 'EFFECTIF DES ELEVES PAR SEXE ET PAR CLASSE');
    xs = bornes(26, [79, ...rep(21, 474 / 21)]); ys = [65, 86, 107, 138, 169, 190, 211, 232];
    cells = cellulesTableau(R, b, { enteteOpts: { size: 9, font: R.FB }, corpsOpts: { size: 8.2 }, lignesLibs: { debut: 'Nombre d’élèves\nen début d’année', fin: "Nombre d'élèves\nfin d'année" } });
  } else {
    titre(62, '3.', 'EFFECTIF DES ELEVES PAR SEXE ET PAR CLASSE');
    xs = bornes(30, [89, ...rep(21, 460 / 21)]); ys = [83, 97, 113, 148, 183, 218, 253, 288];
    cells = cellulesTableau(R, b, { enteteOpts: { size: 7.5 }, corpsOpts: { size: 7.5 } }).map(cl => (cl[0] === 1 ? [cl[0], cl[1], 1, 1, cl[4], { size: 7.5, align: 'l' }] : cl));
  }
  R.grille(xs, ys, cells);
  b = blocDe(R.D, doc, 'infra');
  if (fin) { titre(247, '4.', 'INFRASTRUCTURES'); xs = [48, 133, 253, 384, 504, 563]; ys = [274, 301, 328, 355]; cells = cellulesTableau(R, b, { enteteOpts: { size: 9.5 }, corpsOpts: { size: 9.5 } }); }
  else { titre(312, '4.', 'INFRASTRUCTURES'); xs = [30, 119, 250, 384, 515, 580]; ys = [332, 357, 382, 409]; cells = cellulesTableau(R, b, { enteteOpts: { size: 8.8 }, corpsOpts: { size: 8.8 } }); }
  cells = cells.map(([r, k, rs, cs, t, o]) => [r, k, rs, cs, t, k === 0 && r > 0 ? { ...o, align: 'c' } : o]);
  R.grille(xs, ys, cells);
  for (const [k, num, lib, yt, ys_] of [['mob', '5.', 'MOBILIER', fin ? 384 : 434, fin ? [397, 435, 468, 502, 535, 569] : [446, 468, 499, 531, 563, 597]],
    ['man', '6.', 'MANUELS :', fin ? 582 : 615, fin ? [589, 613, 645, 678] : [631, 653, 684, 716]]]) {
    b = blocDe(R.D, doc, k);
    if (fin) {
      titre(yt, num, lib.replace(' :', ''));
      if (lib.endsWith(':')) R.t(43 + R.c.sw('6. MANUELS', R.FB, hs) + 1, yt, ' :', hs, R.FB);
      xs = [42, 138, 191, 248, 312, 369, 425, 482, 558];
      cells = cellulesTableau(R, b, { enteteOpts: { size: 8.5, font: R.FB, haut: true }, corpsOpts: { size: 8.5 } });
    } else { titre(yt, num, lib); xs = bornes(30, [89, ...rep(7, 65.8)]); cells = cellulesTableau(R, b, { enteteOpts: { size: 8.5 }, corpsOpts: { size: 8.5 } }); }
    R.grille(xs, ys_, cells);
  }
  if (fin) {
    b = blocDe(R.D, doc, 'gest'); titre(691, '7.', 'FONCTIONNEMENT DES STRUCTURES DE GESTION');
    R.grille([42, 138, 262, 404, 546], [699, 723, 755], cellulesTableau(R, b, { enteteOpts: { size: 8.5 }, corpsOpts: { size: 8.5 } }));
  }
  pied(R, 2, doc);
}

/* ------------------------------------------------------------------ EM : pages 1 et 2 */
function page1EM(R, doc, annee) {
  const fin = R.D.docs[doc].moment === 'fin';
  let y = entete(R, doc, fin ? 'times' : 'scan'), x, X0, X1, fs, pas;
  if (fin) {
    [X0, X1, fs, pas] = [29, 540, 11, 17.7]; const [a1, a2] = anneeTxt(annee);
    y += 25;
    x = R.t(203, y, 'ANNEE SCOLAIRE : ', 12, R.FB); x = R.t(x, y, '20', 11.5); R.points(x, x + 16, y); R.valeur(x, x + 16, y, R.vierge ? '' : (a1 || '').slice(2), 11);
    x = R.t(x + 17, y, ' – 20', 11.5); R.points(x, x + 18, y); R.valeur(x, x + 18, y, R.vierge ? '' : (a2 || '').slice(2), 11);
    y += 22; x = R.t(X0, y, '1. ', 11.5, R.FB); R.souligne(x, y, "IDENTIFICATION ET LOCALISATION DE L'ECOLE", 11.5);
  } else {
    [X0, X1, fs, pas] = [56, 540, 8.8, 16.8];
    y += 12; R.t(57, y, 'I.', 10, 'Helvetica-Bold'); R.souligne(83, y, "IDENTIFICATION ET LOCALISATION DE L'ECOLE", 10, 'Helvetica-Bold');
  }
  y += pas; R.champ(X0, y, "1.1 Nom de l'école " + (fin ? ': ' : ''), 'nom_ecole', X1, fs);
  y += pas;
  for (const [num, lib, ka, kr] of [['1.2', 'Année de création', 'annee_creation', 'ref_creation'], ['1.3', 'Année dernière extension', 'annee_extension', 'ref_extension']]) {
    x = R.t(X0, y, `${num}  ${lib}  `, fs); x = R.casesSlash(x, y, 4, fin ? 16 : 14, ka, fs); R.champ(x + 8, y, 'Référence', kr, X1, fs); y += pas;
  }
  x = R.t(X0, y, '1.4  Statut : Public', fs); x = R.casesTrait(x + 14, y, 26, null, fs, R.choix('statut', 'Public'));
  x = R.t(x + 20, y, 'Privé', fs); R.casesTrait(x + 14, y, 26, null, fs, R.choix('statut', 'Privé'));
  y += pas; x = R.t(X0 + 25, y, 'Centre Préscolaire Communautaire', fs); x = R.casesTrait(x + 8, y, 22, null, fs, R.choix('statut', 'Centre préscolaire communautaire'));
  R.champ(x + 30, y, "Si Communautaire, préciser l'initiative ", 'initiative', X1, fs);
  y += pas;
  const ordre = [['departement', 'Département'], ['commune', 'Commune'], ['arrondissement', 'Arrondissement'], ['cs', 'Circonscription scolaire'], ['zone', 'Zone pédagogique'],
    ['up', 'Unité pédagogique'], ['village', 'Village  ou quartier de ville'], ['adresse_postale', 'Adresse postale'], ['contact_directeur', 'Contact du Directeur/Directrice']];
  ordre.forEach(([k, lib], i) => { R.champ(X0, y, `1.${i + 5}  ${lib} `, k, X1, fs); y += pas; });
  if (fin) { R.t(X0, y, 'II.', 11.5, R.FB); R.souligne(75, y, 'INFORMATIONS GENERALES', 11.5); }
  else { R.t(55, y, 'II.', 10, 'Helvetica-Bold'); R.souligne(78, y, 'INFORMATIONS GENERALES', 10, 'Helvetica-Bold'); }
  y += pas; R.champ(X0, y, '2.1 Nom et prénoms du fondateur/fondatrice (pour les EM privées)', 'fondateur', X1, fs);
  y += pas; R.champ(X0, y, '2.2  Nom et prénoms du Directeur/Directrice', 'directeur_nom', X1, fs);
  const tit = R.val('directeur_titre');
  if (tit === 'Directeur' || tit === 'Directrice') {
    const xa = X0 + R.c.sw('2.2  Nom et prénoms du ', R.F, fs), mot = tit, xm = tit === 'Directeur' ? xa : xa + R.c.sw('Directeur/', R.F, fs);
    R.c.setStrokeColor(BLEU); R.c.setLineWidth(0.9); R.c.line(xm, R.Y(y) - 2, xm + R.c.sw(mot, R.F, fs), R.Y(y) - 2); R.c.setStrokeColor(NOIR);
  }
  y += pas; x = R.t(X0, y, '2.3  Nombre de sections autorisées', fs); R.casesTrait(x + 10, y, 26, 'sections_autorisees', fs);
  x = R.t(262, y, 'Nombre de sections ouvertes', fs); R.casesTrait(x + 12, y, 26, 'sections_ouvertes', fs);
  y += pas; x = R.t(X0, y, '2.4  Nombre de salles de classe  existantes', fs); R.casesTrait(x + 8, y, 26, 'salles_existantes', fs);
  x = R.t(fin ? 290 : 280, y, 'Nombre de salles de classe utilisées', fs); R.casesTrait(x + 10, y, 26, 'salles_utilisees', fs);
  y += pas; const fs2 = fs - (fin ? 1.3 : 0.2);
  x = R.t(X0, y, '2.5  L’école dispose-t-elle d’une cantine fonctionnelle : oui ', fs2); x = R.casesTrait(x + 1, y, 22, null, fs2, R.choix('cantine', 'oui'));
  x = R.t(x + 8, y, 'non ', fs2); x = R.casesTrait(x + 1, y, 22, null, fs2, R.choix('cantine', 'non'));
  R.champ(x + 6, y, 'Si oui précisez l’organisme de soutien ', 'cantine_organisme', X1 + 4, fs2);
  y += pas; x = R.t(X0, y, '2.6  L’école dispose-t-elle d’un dispositif de lavage de main fonctionnel : oui ', fs); x = R.casesTrait(x + 1, y, 24, null, fs, R.choix('lavage', 'oui'));
  x = R.t(x + 12, y, 'non ', fs); R.casesTrait(x + 1, y, 24, null, fs, R.choix('lavage', 'non'));
  y += pas; x = R.t(X0, y, '2.7  L’école dispose-t-elle d’une structure de gestion collégiale : oui ', fs2); x = R.casesTrait(x + 1, y, 20, null, fs2, R.choix('gestion', 'oui'));
  x = R.t(x + 8, y, 'non ', fs2); x = R.casesTrait(x + 1, y, 20, null, fs2, R.choix('gestion', 'non')); R.t(x + 2, y, ' si oui cocher la case correspondante', fs2);
  y += pas; x = R.t(fin ? X0 + 22 : 63, y, 'APE ', fs); x = R.casesTrait(x + (fin ? 2 : 26), y, 24, null, fs, R.choix('g_ape', 'oui'));
  x = R.t(x + 24, y, 'AME ', fs); x = R.casesTrait(x + (fin ? 2 : 30), y, 24, null, fs, R.choix('g_ame', 'oui'));
  x = R.t(x + 24, y, 'Comité de direction ', fs); x = R.casesTrait(x + (fin ? 6 : 14), y, 24, null, fs, R.choix('g_comite', 'oui'));
  R.champ(x + 24, y, 'Autres à préciser ', 'g_autres', X1, fs);
  y += pas + (fin ? 0 : 8);
  let xs, ys, libs = null;
  if (fin) {
    R.t(X0, y, 'III.', 11.5, R.FB); R.souligne(75, y, 'REPARTITION DES ENFANTS PAR SECTION', 11.5);
    xs = [29, 178, 220, 263, 306, 348, 391, 433, 475, 511, 553]; ys = [y + 20, y + 43, y + 62, y + 83, y + 104, y + 125, y + 153];
  } else {
    R.t(28, y, 'III', 10, 'Helvetica-Bold'); R.souligne(43, y, 'REPARTITION DES ENFANTS PAR SECTION', 10, 'Helvetica-Bold');
    xs = [60, 111, 162, 218, 262, 312, 361, 411, 451, 507, 558]; ys = [y + 17, y + 31, y + 43, y + 76, y + 114];
    libs = { debut: 'Effectif au\ndébut de\nl’année', besoin: 'Dont enfants\nà besoin\nspécifique' };
  }
  const cells = cellulesTableau(R, blocDe(R.D, doc, 'rep'), { enteteOpts: { size: fin ? 9.5 : 8.5 }, corpsOpts: { size: fin ? 9.5 : 8.3 }, lignesLibs: libs })
    .map(([r, k, rs, cs, t, o]) => [r, k, rs, cs, t, k === 0 ? { ...o, align: 'c' } : o]);
  R.grille(xs, ys, cells);
  pied(R, 1, doc);
}
function page2EM(R, doc) {
  const fin = R.D.docs[doc].moment === 'fin', hs = fin ? 11.5 : 10, TB = fin ? R.FB : 'Helvetica-Bold', fs = fin ? 9.5 : 8.3;
  const titre = (y, num, lib, xnum, xlib, suite = '') => { R.t(xnum, y, num, hs, TB); const x = R.souligne(xlib, y, lib, hs, TB); if (suite) R.t(x, y, suite, hs, fin ? TB : 'Helvetica'); };
  const tab = (k, xs, ys, libs = null, coin = true) => R.grille(xs, ys, cellulesTableau(R, blocDe(R.D, doc, k), { enteteOpts: { size: fs }, corpsOpts: { size: fs }, lignesLibs: libs, coinVide: coin }));
  const MAT = [['paeapem', "Programmes d'activités\n(PAEAPEM)"], ['guides', 'Guides pédagogiques'], ['recueils', fin ? 'Recueils de jeux' : 'Recueils de\njeux']];
  if (fin) {
    titre(35, 'IV.', 'STRUCTURE PEDAGOGIQUE', 61, 107); tab('sp', [29, 165, 282, 395, 514], [54, 82, 100, 118, 136]);
    titre(154, 'V.', 'MATERIEL PEDAGOGIQUE', 53, 95);
    tabAutres(R, doc, 'matped', [29, 135, 248, 355, 447, 546], [172, 192, 210, 229], fs, MAT, [['autres', 'matped_autres_lib']]);
    titre(247, 'VI.', 'INFRASTRUCTURE', 53, 83); tab('infra', [29, 128, 220, 326, 419, 496, 567], [266, 296, 312, 332], null, false);
    titre(352, 'VII.', 'MOBILIER (mentionner chaque fois le nombre correspondant)', 29, 75);
    tabAutres(R, doc, 'mob', [29, 72, 130, 187, 239, 288, 336, 385, 435, 479, 524, 567], [371, 408, 423, 439], fs, null, [['autre1', 'mob_autre1_lib'], ['autre2', 'mob_autre2_lib']]);
    titre(458, 'VIII.', 'EQUIPEMENTS EXTERIEURS (mentionner chaque fois le nombre correspondant)', 29, 83);
    tab('ext', [29, 74, 130, 175, 222, 274, 319, 373, 425, 467, 524, 574], [478, 513, 531]); R.champ(29, 551, 'Autres à préciser ', 'ext_autres', 560, 11);
    titre(564, 'IX.', 'EQUIPEMENTS INTERIEURS (cocher la case correspondant)', 29, 71);
    tab('int', [29, 89, 155, 225, 285, 342, 398, 455, 515, 574], [582, 634, 659]); R.champ(29, 678, 'Autres à préciser ', 'int_autres', 560, 11);
    titre(692, 'X.', 'FONCTIONNEMENT DES STRUCTURES DE GESTION', 29, 42); tab('gest', [29, 114, 213, 319, 454, 574], [710, 753, 776]);
  } else {
    titre(41, 'IV.', 'STRUCTURE PEDAGOGIQUE', 58, 86); tab('sp', [119, 227, 320, 419, 516], [60, 82, 95, 108, 127]);
    titre(140, 'V.', 'MATERIEL PEDAGOGIQUE', 56, 82);
    tabAutres(R, doc, 'matped', [168, 268, 368, 459, 514, 565], [161, 181, 181, 200], fs, MAT, [['autres', 'matped_autres_lib']], true);
    R.t(55, 211, 'VI. INFRASTRUCTURE', hs, TB); R.t(55 + R.c.sw('VI. INFRASTRUCTURE ', TB, hs), 211, '( écrire le nombre)', hs - 0.5);
    tab('infra', [13, 117, 224, 316, 416, 513, 564], [227, 257, 277, 296]);
    titre(306, 'VII.', 'MOBILIER (mentionner chaque fois le nombre correspondant)', 53, 82);
    tabAutres(R, doc, 'mob', [12, 62, 114, 166, 222, 265, 314, 365, 414, 455, 510, 563], [322, 362, 375, 392], fs, null, [['autre1', 'mob_autre1_lib'], ['autre2', 'mob_autre2_lib']]);
    titre(404, 'VIII.', 'EQUIPEMENTS EXTERIEURS ', 52, 84, '(mentionner chaque fois le nombre correspondant)');
    tab('ext', [11, 61, 113, 163, 220, 263, 313, 362, 412, 454, 509, 561], [418, 447, 469]); R.champ(27, 481, 'Autres à préciser ', 'ext_autres', 472, 8.5);
    titre(492, 'IX.', 'EQUIPEMENTS INTERIEURS (cocher la case correspondant)', 50, 76);
    tab('int', [59, 110, 162, 262, 311, 361, 410, 451, 507, 559], [510, 557, 578]); R.champ(25, 593, 'Autres à préciser ', 'int_autres', 478, 8.5);
    R.t(48, 610, 'X.', hs, TB); R.souligne(57, 610, 'FONCTIONNEMENT DES STRUCTURES DE GESTION', hs, TB);
    R.grille([6, 108, 216, 359, 450, 556], [626, 664, 691], cellulesTableau(R, blocDe(R.D, doc, 'gest'), { enteteOpts: { size: 8.3, font: 'Helvetica-Bold' }, corpsOpts: { size: 8.3 } }));
  }
  pied(R, 2, doc);
}
function tabAutres(R, doc, k, xs, ys, fs, libsHaut, autres, simpleAutres = false) {
  const b = blocDe(R.D, doc, k), cols = b.groupes.map(g => g.c), libs = Object.fromEntries(libsHaut || b.groupes.map(g => [g.c, g.l]));
  const A = Object.fromEntries(autres), nAut = autres.length;
  const cells = [[0, 0, ys[1] !== ys[2] ? 3 : 2, 1, '', { sans_bord: true }]];
  let j = 1;
  for (const c of cols) { if (c in A) continue; cells.push([0, j, 2, 1, libs[c] || '', { size: fs }]); j++; }
  if (simpleAutres) cells.push([0, j, 2, 1, 'Autres', { size: fs }]);
  else { cells.push([0, j, 1, nAut, 'Autres (à préciser)', { size: fs, font: nAut ? R.FI : R.F }]); autres.forEach(([, klib], i) => cells.push([1, j + i, 1, 1, R.val(klib), { val: true, size: fs - 1 }])); }
  cells.push([2, 0, 1, 1, 'Nombre', { size: fs, align: 'l' }]);
  [...cols.filter(c => !(c in A)), ...autres.map(x => x[0])].forEach((c, i) => {
    let txt = R.val(`${k}.nb.${c}`);
    if (simpleAutres && c in A) { const lib = R.val(A[c]); txt = txt && lib ? `${txt} (${lib})` : (txt || lib); }
    cells.push([2, 1 + i, 1, 1, txt, { val: true, size: fs }]);
  });
  R.grille(xs, ys, cells);
}

/* ------------------------------------------------------------------ état nominatif (paysage) */
function pagesPersonnel(R, doc, nPage0, apresDerniere) {
  const info = R.D.docs[doc], ep = info.cycle === 'primaire', fin = info.moment === 'fin';
  const mini = blocPersonnel(R.D, doc).min, n = R.vierge ? mini : nbLignesPersonnel(R.D, doc, R.v);
  const L = R.D.cols_pdf[doc], plates = L.flatMap(([, cols]) => cols);
  const [X0, X1] = ep ? [22, 805] : [29, 815], tot = plates.reduce((a, c) => a + c[2], 0), ech = (X1 - X0) / tot, xs = [X0];
  for (const c of plates) xs.push(xs[xs.length - 1] + c[2] * ech);
  const serif = fin, lignesPage = mini, pages = Math.max(1, Math.ceil(n / lignesPage));
  const idx = Object.fromEntries(plates.map((c, i) => [c[0], i])), notes = R.D.notes_personnel[doc];
  for (let p = 0; p < pages; p++) {
    R.page(A4P);
    const ttl = ep ? 'ETAT NOMINATIF DU PERSONNEL ENSEIGNANT' : 'ETAT  NOMINATIF  DU  PERSONNEL  ENSEIGNANT', num = ep ? '7.' : 'XI.';
    if (fin || !ep) { const x = R.t(ep ? 91 : 79, 35, num + ' ', 12, serif ? 'Times-Bold' : 'Helvetica-Bold'); R.souligne(x, 35, ttl, 12, serif ? 'Times-Bold' : 'Helvetica-Bold'); }
    else R.t(60, 35, `${num} ${ttl}`, 12, 'Helvetica-Bold');
    if (p) R.t(X1, 35, `(suite – page ${p + 1}/${pages})`, 8, R.F, { droite: true });
    const [hg, hs] = !ep ? [47, 66] : [41, 57], y0 = !ep ? 50 : 72, rh = !ep ? 20 : 18, nb = Math.min(lignesPage, n - p * lignesPage);
    const ys = [y0, y0 + hg, y0 + hg + hs, ...Array.from({ length: nb }, (_, i) => y0 + hg + hs + rh * (i + 1))];
    const cells = [], fs = serif ? 8.5 : 8; let j = 0;
    for (const [grp, cols] of L) {
      if (grp) { cells.push([0, j, 1, cols.length, grp, { size: fs + (!ep ? 1 : 0.5) }]); for (const c of cols) { cells.push([1, j, 1, 1, c[1], { size: fs - 0.5, rot: c[3] }]); j++; } }
      else { const c = cols[0]; cells.push([0, j, 2, 1, c[1], { size: fs + (c[0] === 'nom' ? 1 : 0), rot: c[3] }]); j++; }
    }
    R.grille(xs, ys, cells);
    for (let r = 0; r < nb; r++) {
      const i = p * lignesPage + r + 1, yt = ys[2 + r], yb = ys[3 + r];
      R.grille(xs, [yt, yb], plates.map((_, k) => [0, k, 1, 1, '', {}]));
      const ym = (yt + yb) / 2, pre = `pers.${i}.`;
      R.t(!fin || !ep ? (xs[0] + xs[1]) / 2 : xs[0] + 3, ym + 3.5, ep && fin ? String(i).padStart(2, '0') : String(i), serif ? 10 : 9, R.F, { centre: !(fin && ep) });
      const sexe = R.val(pre + 'sexe');
      for (const code of ['sexe_M', 'sexe_F']) { const k = idx[code]; R.carre((xs[k] + xs[k + 1]) / 2, ym - 1, 6.5, sexe === code.slice(-1)); }
      let k = idx.naiss; R.anneeBoites((xs[k] + xs[k + 1]) / 2, ym + 2, R.val(pre + 'naiss'));
      if (ep) { const cours = coursDe(R.val(pre + 'cours')); for (const nv of NIV_EP) { k = idx[`c_${nv}`]; R.carre((xs[k] + xs[k + 1]) / 2, ym - 1, 6.5, cours.has(nv)); } }
      else { const sec = R.val(pre + 'section'); for (const [code, cle] of [['s_pet', 'Petits'], ['s_gra', 'Grands']]) { k = idx[code]; R.carre((xs[k] + xs[k + 1]) / 2, ym - 1, 6.5, sec.includes(cle)); } }
      let fct = R.val(pre + 'fonction'); k = idx.fonction;
      if (!fct && (R.vierge || !R.val(pre + 'nom'))) {
        fct = i === 1 ? (ep ? 'Direct….' : 'Directeur/\nDirectrice') : 'Adjoint';
        if (!ep && i === 1) { R.t((xs[k] + xs[k + 1]) / 2, ym - 1, 'Directeur/', 7, R.F, { centre: true }); R.t((xs[k] + xs[k + 1]) / 2, ym + 6, 'Directrice', 7, R.F, { centre: true }); }
        else R.t((xs[k] + xs[k + 1]) / 2, ym + 3.5, fct, serif ? 9 : 8, R.F, { centre: true });
      } else R.valeur(xs[k] + 1, xs[k + 1] - 1, ym + 3, fct, 8, true);
      for (const code of ['mat', 'nip', 'nom', 'dacad', 'dprof', 'grade', 'statut', 'qualite', 'indice', 'afp', 'adep', 'aecole', 'form', 'fdate', 'fnature', 'obs', 'vinsp', 'vcp', 'vdir', 'pup']) {
        if (!(code in idx)) continue;
        k = idx[code]; let s = R.val(pre + code);
        if (code === 'pup' && s && s !== '-') s += ' %';
        R.valeur(xs[k] + 1.5, xs[k + 1] - 1.5, ym + 3, s, 8, code !== 'nom');
      }
    }
    const yn = ys[ys.length - 1] + (!ep ? 14 : 16);
    notes.forEach((nt, i) => R.t(!ep ? 47 : (fin ? 50 : 30), yn + i * 11.3, nt, serif ? 8.3 : 7.6, R.F));
    if (p === pages - 1) { visasPersonnel(R, doc, yn + notes.length * 11.3); if (apresDerniere) apresDerniere(R, yn + notes.length * 11.3); }
    piedPersonnel(R, doc, nPage0 + p);
  }
}
function visasPersonnel(R, doc, y) {
  const info = R.D.docs[doc], ep = info.cycle === 'primaire', fin = info.moment === 'fin', serif = fin, F = R.F, fs = serif ? 9.2 : 8.5, W = R.W, xg = 50;
  const ys = [y + 20, y + 35, y + 50, y + 66];
  R.champ(xg, ys[0], 'Date de remplissage :  ', 'date_remplissage', xg + 230, fs);
  R.champ(xg, ys[1], 'Par Madame / Monsieur ', 'par_nom', xg + 225, fs);
  R.champ(xg, ys[2], 'Fonction : ', 'par_fonction', xg + 230, fs);
  const x = R.t(xg - 3, ys[3], 'Signature : ', fs, F); R.points(x, x + 70, ys[3]);
  R.xSignature = x; R.ysVisas = ys;
  const blocVisa = (cx, yy, l1, l2, knom = null, gras = false, taille = null) => {
    R.t(cx, yy, l1, taille || fs, gras && serif ? 'Times-Bold' : (gras ? 'Helvetica-Bold' : F), { centre: true });
    if (l2) R.t(cx, yy + 11, l2, fs - (!gras ? 0.5 : 1), F, { centre: true });
    if (knom) { const s = R.val(knom); if (s) R.valeur(cx - 90, cx + 90, yy + 48, s, 8.5, true); }
  };
  const numCp = R.val('cp_zone_num');
  if (R.synth) { blocVisa(W - 230, ys[0] - 4, R.ent.visa || 'Le Responsable de la juridiction', '(Signature- Nom et Prénoms- Date)', 'par_nom'); return; }
  if (fin) {
    blocVisa(W - 102, y - 30, "Contrôlé par le Responsable de l'Unité", 'Pédagogique', 'rup_nom');
    blocVisa(W / 2 + 60, ys[1] - 2, 'Le Chef de la Circonscription Scolaire', '(Signature- Nom et Prénoms- Date)', 'chef_nom');
    blocVisa(ep ? 216 : 225, ys[3] + 28, `Contrôlé par le Conseiller Pédagogique de Zone n° ${numCp || '…….'}`, '(Signature- Nom et Prénoms- Date)', 'cp_nom');
  } else if (ep) {
    blocVisa(620, ys[0] - 4, "Contrôlé par le Responsable de l'Unité Pédagogique", '(Signature- Nom et Prénoms- Date)', 'rup_nom');
    blocVisa(230, ys[3] + 30, `Contrôlé par le Conseiller Pédagogique de Zone n° ${numCp || '…'}`, '(Signature- Nom et Prénoms- Date)', 'cp_nom');
    blocVisa(620, ys[3] + 30, 'Le Chef de la Circonscription Scolaire', '(Signature- Nom et Prénoms- Date)', 'chef_nom');
  } else {
    blocVisa(620, ys[0] - 4, "Contrôlé par le Responsable d'Unité Pédagogique", '(Date- signature - Nom et Prénoms )', 'rup_nom');
    blocVisa(230, ys[3] + 28, `Contrôlé par le Conseiller Pédagogique de la zone n° ${numCp || '…………'}`, '(Date- signature - Nom et Prénoms )', 'cp_nom', true);
    blocVisa(620, ys[3] + 30, 'Le Chef de la Circonscription Scolaire', '(Date- signature - Nom et Prénoms )', 'chef_nom', true, 12);
  }
}
function piedPersonnel(R, doc, n) {
  const info = R.D.docs[doc];
  if (info.cycle === 'maternelle' && info.moment === 'rentree') { pied(R, 3, doc); return; }
  if (info.cycle === 'maternelle') R.t(R.W - 50, R.PH - 38, `Page ${n}`, 11, 'Times-Bold', { droite: true });
  else R.t(R.W / 2, R.PH - 24, `Page ${n}`, 10, R.F, { centre: true });
}

/* ------------------------------------------------------------------ API */
const _ENTETE = [['ecole', 'nom_ecole'], ['nom', 'nom_ecole'], ['cs', 'cs'], ['departement', 'departement'], ['zone', 'zone'], ['up', 'up'], ['commune', 'commune'],
  ['arrondissement', 'arrondissement'], ['localite', 'village'], ['directeur', 'directeur_nom'], ['directeur_nom', 'directeur_nom'], ['directeur_titre', 'directeur_titre'],
  ['telephone', 'telephone'], ['email', 'email']];
let _img;
/** Octets du PDF du document (même forme que GESCOL / SCOLARIS). v : valeurs finales (calculées).
    signe : {role, nom, signature, cachet (octets PNG/JPEG), qrText, lignes: [texte]} — page d'authentification ajoutée après le modèle. */
export async function pdfRapport(D, doc, annee, v, { vierge = false, entete = {}, signe = null } = {}) {
  const P = globalThis.PDFLib, pdf = await P.PDFDocument.create(), S = P.StandardFonts;
  const polices = {};
  for (const [k, s] of [['Helvetica', 'Helvetica'], ['Helvetica-Bold', 'HelveticaBold'], ['Helvetica-Oblique', 'HelveticaOblique'], ['Helvetica-BoldOblique', 'HelveticaBoldOblique'],
    ['Times-Roman', 'TimesRoman'], ['Times-Bold', 'TimesRomanBold'], ['Times-Italic', 'TimesRomanItalic'], ['Times-BoldItalic', 'TimesRomanBoldItalic']]) polices[k] = await pdf.embedFont(S[s]);
  if (_img === undefined) { try { _img = await fetchBytes('assets/memp-recensement.png'); } catch (e) { _img = null; } }
  const img = _img ? await pdf.embedPng(_img) : null;
  const e = { hors_ecole: true, ...(entete || {}) }, vals = { ...(v || {}) };
  if (!e.synthese) {
    for (const [src, k] of _ENTETE) if (e[src] !== undefined && e[src] !== null && e[src] !== '' && (vals[k] === undefined || vals[k] === null || vals[k] === '')) vals[k] = String(e[src]);
    if (vals.directeur_titre && !vals.par_fonction) vals.par_fonction = vals.directeur_titre;
    if (vals.directeur_nom && !vals.par_nom) vals.par_nom = vals.directeur_nom;
  }
  if (vierge) { delete e.titre; delete e.synthese; }
  const info = D.docs[doc], c = new Canvas(P, pdf, polices), R = new Rendu(c, D, doc, vals, vierge, info.moment === 'fin', e, img);
  if (info.cycle === 'primaire') { R.page(A4); page1EP(R, doc, annee); R.page(A4); page2EP(R, doc); }
  else { R.page(A4); page1EM(R, doc, annee); R.page(A4); page2EM(R, doc); }
  pagesPersonnel(R, doc, 3);
  if (signe && !vierge) await pageAuthentification(R, pdf, signe, info);
  pdf.setTitle(`${e.titre ? e.titre + ' – ' : ''}${info.titre} ${annee}`); pdf.setAuthor(APP.concepteur); pdf.setCreator(APP.full || APP.name);
  return pdf.save();
}
/** Page d'authentification (fiche signée numériquement) : signature, cachet, code QR et empreinte, après le modèle officiel */
async function pageAuthentification(R, pdf, signe, info) {
  R.page(A4);
  const c = R.c, VERT = hex('#0B5D3B'), x0 = 40, w = R.W - 80, top = 70, hBox = 190;
  R.t(R.W / 2, 50, `${info.fiche} — AUTHENTIFICATION`, 10.5, 'Helvetica-Bold', { centre: true });
  c.setStrokeColor(VERT); c.setLineWidth(1); c.rect(x0, R.Y(top + hBox), w, hBox, 0, 1); c.setStrokeColor(NOIR);
  c.setFillColor(VERT); c.setFont('Helvetica-Bold', 9.5); c.drawString(x0 + 10, R.Y(top + 18), `AUTHENTIFICATION — ${signe.role || 'Le Conseiller Pédagogique'}`); c.setFillColor(NOIR);
  if (signe.nom) R.t(x0 + 10, top + 32, signe.nom, 9, 'Helvetica');
  const place = async (b, x, ww, hh) => {
    if (!b) return; let im; try { im = await pdf.embedPng(b); } catch (e) { try { im = await pdf.embedJpg(b); } catch (e2) { return; } }
    const k = Math.min(ww / im.width, hh / im.height); c.drawImage(im, x, R.Y(top + 40 + hh) + (hh - im.height * k) / 2, im.width * k, im.height * k);
  };
  await place(signe.signature, x0 + 10, 150, 80); await place(signe.cachet, x0 + 180, 170, 90);
  if (signe.qrText) {
    const { qrMatrix } = await import('./qr.js'), { size, modules } = qrMatrix(signe.qrText, 'M'), q = 100, m = q / (size + 2), qx = x0 + w - q - 12, qy = R.Y(top + 30 + q);
    c.setFillColor([1, 1, 1]); c.rect(qx, qy, q, q, 1, 0); c.setFillColor(NOIR);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (modules[y][x]) c.rect(qx + (x + 1) * m, qy + q - (y + 2) * m, m + 0.05, m + 0.05, 1, 0);
  }
  (signe.lignes || []).forEach((l, i) => { c.setFillColor(hex('#404040')); c.setFont('Helvetica', 7.5); c.drawString(x0 + 10, R.Y(top + hBox - 14 - ((signe.lignes.length - 1 - i) * 10)), l); });
  c.setFillColor(NOIR);
}
