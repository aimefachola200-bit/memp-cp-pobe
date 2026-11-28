/* ===== Écriture de classeurs Excel (.xlsx) standard — commun à SCOLARIS, GESCOL, ÉduGestion, MEMP-CP, CS Pobè =====
   Pourquoi : les textes écrits en « chaînes en ligne » (inlineStr) ou les pages HTML renommées « .xls » s'ouvrent
   vides (rubriques et noms absents, seuls les nombres) dans beaucoup de lecteurs Android (WPS, Polaris, aperçu du
   téléphone) et ne passent pas à l'importation (EducMaster…). Ici : table des chaînes partagées (sharedStrings),
   feuille de styles, en-têtes en gras, largeurs de colonnes, propriétés du document — comme Excel et openpyxl.
   XlsxEcrire.classeur(feuilles) -> Blob ; feuilles = [{ nom, lignes: [[valeur | {v, s:'h'|'t'|'b'}], …], entete?: n }]
   XlsxEcrire.depuisHtml(html) -> lignes (titres h1-h4 / p et tableaux, en-têtes <th> repérés, fusions respectées)
   Conception : Maître Aimé FACHOLA */
(function (global) {
  'use strict';
  if (global.XlsxEcrire) return;
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u) => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const enc = new TextEncoder();
  function zip(fichiers) {   // [{ nom, contenu: string }] -> Uint8Array (méthode « stockée », lue par tous les lecteurs)
    const parts = [], centre = []; let pos = 0;
    const d = new Date(), heure = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), jour = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of fichiers) {
      const nom = enc.encode(f.nom), data = enc.encode(f.contenu), crc = crc32(data);
      const loc = new DataView(new ArrayBuffer(30));
      loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true); loc.setUint16(8, 0, true);
      loc.setUint16(10, heure, true); loc.setUint16(12, jour, true); loc.setUint32(14, crc, true);
      loc.setUint32(18, data.length, true); loc.setUint32(22, data.length, true); loc.setUint16(26, nom.length, true); loc.setUint16(28, 0, true);
      parts.push(new Uint8Array(loc.buffer), nom, data);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true);
      cen.setUint16(12, heure, true); cen.setUint16(14, jour, true); cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true);
      cen.setUint16(28, nom.length, true); cen.setUint32(42, pos, true);
      centre.push(new Uint8Array(cen.buffer), nom);
      pos += 30 + nom.length + data.length;
    }
    const tailleCentre = centre.reduce((s, p) => s + p.length, 0), fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, fichiers.length, true); fin.setUint16(10, fichiers.length, true);
    fin.setUint32(12, tailleCentre, true); fin.setUint32(16, pos, true);
    const tout = [...parts, ...centre, new Uint8Array(fin.buffer)], out = new Uint8Array(tout.reduce((s, p) => s + p.length, 0));
    let o = 0; for (const p of tout) { out.set(p, o); o += p.length; }
    return out;
  }
  const esc = (s) => String(s).replace(/[\uE000-\uE0FF]\s?/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colonne = (n) => { let s = ''; n += 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  const brut = (c) => (c && typeof c === 'object' && !(c instanceof Date) && 'v' in c) ? c.v : c;
  const vide = (v) => v === null || v === undefined || v === '';
  /** Nombre « sûr » : un texte comme 0123 (matricule, téléphone) reste du texte. */
  function nombre(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    const t = v.trim();
    if (!/^-?(0|[1-9]\d{0,10})([.,]\d+)?$/.test(t)) return null;
    return Number(t.replace(',', '.'));
  }
  /** Ligne d'en-tête probable : au moins 2 cellules, toutes des textes non numériques. */
  function ressembleEntete(l) {
    const pleins = (l || []).map(brut).filter(v => !vide(v));
    return pleins.length >= 2 && pleins.every(v => typeof v === 'string' && nombre(v) === null);
  }
  const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
    + '<font><b/><sz val="12"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
    + '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/><bgColor indexed="64"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF4FA"/><bgColor indexed="64"/></patternFill></fill></fills>'
    + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
    + '<border><left style="thin"><color rgb="FF98A2B3"/></left><right style="thin"><color rgb="FF98A2B3"/></right><top style="thin"><color rgb="FF98A2B3"/></top><bottom style="thin"><color rgb="FF98A2B3"/></bottom><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/></cellXfs>'
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const STYLE = { t: 2, h: 1, c: 3, b: 4 };

  function classeur(feuilles) {
    const chaines = [], index = new Map();
    const sst = (s) => { s = String(s); if (!index.has(s)) { index.set(s, chaines.length); chaines.push(s); } return index.get(s); };
    let total = 0;
    const noms = [], vus = new Set();
    const xmlFeuilles = (feuilles.length ? feuilles : [{ nom: 'Feuille1', lignes: [] }]).map((f, k) => {
      let nom = String(f.nom || ('Feuille' + (k + 1))).replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || ('Feuille' + (k + 1));
      while (vus.has(nom.toLowerCase())) nom = nom.slice(0, 28) + ' ' + (k + 1);
      vus.add(nom.toLowerCase()); noms.push(nom);
      const lignes = (f.lignes || []).map(l => Array.isArray(l) ? l : [l]);
      // ligne d'en-tête : indiquée, sinon la première qui ressemble à des rubriques
      let he = Number.isInteger(f.entete) ? f.entete : lignes.findIndex(ressembleEntete);
      const largeurs = [];
      let maxCol = 0;
      // colonnes d'identifiants (matricule, EducMaster, téléphone, code…) : toujours du texte, zéros de tête conservés
      const TXT = /matricule|educ ?master|t[ée]l[ée]phone|\bt[ée]l\b|contact|code|identifiant|\bnpi\b|\bifu\b|acte de naissance|n° ?(acte|cni|carte|table|piece|pièce)|num[ée]ro (de |d')?(table|matricule|t[ée]l)/i;
      const colTexte = new Set();
      const colDate = new Set();
      if (he >= 0) (lignes[he] || []).forEach((c, j) => { const t = String(brut(c) || ''); if (TXT.test(t)) colTexte.add(j); if (/date|n[ée]\(?e?\)? le/i.test(t)) colDate.add(j); });
      const rows = lignes.map((l, i) => {
        const marques = l.some(c => c && typeof c === 'object' && 's' in c);
        const cells = l.map((c, j) => {
          let v = brut(c);
          if (vide(v)) return '';
          if (colDate.has(j) && i > he && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) v = v.slice(8, 10) + '/' + v.slice(5, 7) + '/' + v.slice(0, 4);   // date à la française
          const nPleins = l.filter(x => !vide(brut(x))).length;
          let s;
          if (c && typeof c === 'object' && 's' in c) s = STYLE[c.s] || 0;
          else if (i === he) s = 1;
          else if (nPleins === 1 && (he < 0 || i < he)) s = 2;
          else if (he >= 0 && i > he) s = (ressembleEntete(l) && (lignes[i - 1] || []).every(x => vide(brut(x)))) ? 1 : 3;   // second tableau après une ligne vide
          else s = 0;
          const ref = colonne(j) + (i + 1), st = s ? ` s="${s}"` : '';
          maxCol = Math.max(maxCol, j + 1);
          const texte = v instanceof Date ? v.toLocaleDateString('fr-FR') : String(v);
          if (s !== 1 && s !== 2) largeurs[j] = Math.max(largeurs[j] || 0, Math.min(texte.split('\n').reduce((m, x) => Math.max(m, x.length), 0), 60));
          else if (s === 1) largeurs[j] = Math.max(largeurs[j] || 0, Math.min(texte.length, 30));
          const n = nombre(v);
          if (n !== null && !colTexte.has(j) && !(c && typeof c === 'object' && c.texte)) return `<c r="${ref}"${st}><v>${n}</v></c>`;
          total++;
          return `<c r="${ref}"${st} t="s"><v>${sst(texte)}</v></c>`;
        }).join('');
        return `<row r="${i + 1}">${cells}</row>`;
      }).join('');
      const cols = largeurs.length ? '<cols>' + largeurs.map((w, j) => `<col min="${j + 1}" max="${j + 1}" width="${Math.max(8, (w || 6) + 2)}" customWidth="1"/>`).join('') + '</cols>' : '';
      const dim = maxCol && lignes.length ? `A1:${colonne(maxCol - 1)}${lignes.length}` : 'A1';
      const gel = he >= 0 && f.figer !== false ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${he + 1}" topLeftCell="A${he + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
      const fusions = (f.fusions || []).length ? `<mergeCells count="${f.fusions.length}">${f.fusions.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + `<dimension ref="${dim}"/>${gel}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rows}</sheetData>${fusions}`
        + '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>';
    });
    const n = xmlFeuilles.length, maintenant = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const fichiers = [
      { nom: '[Content_Types].xml', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + xmlFeuilles.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
        + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>' },
      { nom: '_rels/.rels', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
        + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>' },
      { nom: 'docProps/core.xml', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
        + `<dc:creator>MEMP Bénin</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${maintenant}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${maintenant}</dcterms:modified></cp:coreProperties>` },
      { nom: 'docProps/app.xml', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Excel</Application></Properties>' },
      { nom: 'xl/workbook.xml', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + '<bookViews><workbookView/></bookViews><sheets>' + noms.map((nm, i) => `<sheet name="${esc(nm)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>' },
      { nom: 'xl/_rels/workbook.xml.rels', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + xmlFeuilles.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
        + `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
        + `<Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>` },
      { nom: 'xl/styles.xml', contenu: STYLES },
      ...xmlFeuilles.map((x, i) => ({ nom: `xl/worksheets/sheet${i + 1}.xml`, contenu: x }))
    ];
    fichiers.push({ nom: 'xl/sharedStrings.xml', contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${total}" uniqueCount="${chaines.length}">`
      + chaines.map(s => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('') + '</sst>' });
    return new Blob([zip(fichiers)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /** Page HTML (titres + tableaux) -> lignes du classeur, cellules <th> marquées en-tête, fusions (colspan) respectées. */
  function depuisHtml(html) {
    const doc = new DOMParser().parseFromString(String(html).replace(/^﻿/, ''), 'text/html');
    doc.querySelectorAll('script,style,svg,button,.no-print,.gchoix').forEach(x => x.remove());
    const lignes = [], texte = (n) => (n.innerText !== undefined && n.innerText !== '' ? n.innerText : n.textContent || '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
    const visiter = (n) => {
      for (const c of n.children) {
        const t = c.tagName;
        if (t === 'TABLE') {
          const occ = [];   // cellules occupées par des rowspan
          [...c.rows].forEach((tr, ri) => {
            const l = [], o = occ[ri] || []; let j = 0;
            for (const td of tr.cells) {
              while (o[j]) { l[j] = ''; j++; }
              const cs = Math.max(1, +td.colSpan || 1), rs = Math.max(1, +td.rowSpan || 1), v = texte(td);
              l[j] = td.tagName === 'TH' || td.closest('thead') ? { v, s: 'h' } : (tr.classList.contains('tot') || td.classList.contains('tot') ? { v, s: 'b' } : { v, s: 'c' });
              for (let k = 1; k < cs; k++) l[j + k] = td.tagName === 'TH' ? { v: '', s: 'h' } : '';
              for (let r = 1; r < rs; r++) { occ[ri + r] = occ[ri + r] || []; for (let k = 0; k < cs; k++) occ[ri + r][j + k] = 1; }
              j += cs;
            }
            lignes.push(l);
          });
          lignes.push([]);
        } else if (/^H[1-6]$/.test(t) || t === 'P' || t === 'CAPTION') { const v = texte(c); if (v) lignes.push([{ v, s: 't' }]); }
        else visiter(c);
      }
    };
    visiter(doc.body);
    while (lignes.length && !lignes[lignes.length - 1].length) lignes.pop();
    return lignes;
  }
  /** Raccourci : une page HTML « Excel » devient un vrai classeur .xlsx. */
  const depuisHtmlBlob = (html, nomFeuille) => classeur([{ nom: nomFeuille || 'Tableau', lignes: depuisHtml(html), entete: -1, figer: false }]);
  /** Texte CSV (; ou ,) -> lignes. */
  function lireCSV(texte) {
    texte = String(texte).replace(/^﻿/, '');
    const l1 = texte.split('\n')[0], sep = (l1.match(/;/g) || []).length >= (l1.match(/,/g) || []).length ? ';' : ',';
    const lignes = []; let ligne = [], champ = '', q = false;
    for (let i = 0; i < texte.length; i++) {
      const c = texte[i];
      if (q) { if (c === '"' && texte[i + 1] === '"') { champ += '"'; i++; } else if (c === '"') q = false; else champ += c; }
      else if (c === '"') q = true; else if (c === sep) { ligne.push(champ); champ = ''; }
      else if (c === '\n') { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ''; } else if (c !== '\r') champ += c;
    }
    if (champ !== '' || ligne.length) { ligne.push(champ); lignes.push(ligne); }
    return lignes.map(l => l.every(x => x === '') ? [] : l);
  }
  global.XlsxEcrire = { classeur, depuisHtml, depuisHtmlBlob, lireCSV, nombre };
})(typeof window !== 'undefined' ? window : globalThis);
