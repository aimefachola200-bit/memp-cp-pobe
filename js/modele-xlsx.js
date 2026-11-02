/* Remplissage d'un modèle Excel officiel (EducMaster : élèves par classe, notes du primaire, agents) SANS le modifier :
   le classeur est une copie du modèle ; seules les cellules de données sont écrites (outils/lots/spec-educmaster.md).
   Polices, bordures, fusions, largeurs, noms et ordre des feuilles restent ceux du modèle. Chaînes dans la table partagée
   (sharedStrings), nombres en nombres, dates et identifiants en texte.

   ModeleXlsx.remplir(octets, { feuilles: { 'CI': { debut: 2, lignes: [['NOM', 'Prénoms', 'M', '04/03/2019', …]] } }, active: 'CI' })
     -> Promise<Blob>   (valeur : texte -> chaîne ; nombre -> nombre ; '' / null -> cellule laissée vide)
   ModeleXlsx.lire(octets) -> Promise<{ fichiers: { chemin: Uint8Array } }>   (pour les tests)
   ModeleXlsx.charger(url) -> Promise<ArrayBuffer>                              (modèle livré avec l'application) */
(function (global) {
  'use strict';
  const te = new TextEncoder(), td = new TextDecoder();
  const ech = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  /* ---------- zip (lecture : stocké ou deflate ; écriture : deflate si possible, sinon stocké) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u) => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  async function flux(u, Classe, mode) { const s = new Blob([u]).stream().pipeThrough(new Classe(mode)); return new Uint8Array(await new Response(s).arrayBuffer()); }
  async function dezipper(buf) {
    const u = new Uint8Array(buf), dv = new DataView(u.buffer, u.byteOffset, u.byteLength), out = {}, ordre = [];
    let e = u.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('Modèle Excel illisible');
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
    for (let i = 0; i < n; i++) {
      const meth = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const nom = td.decode(u.subarray(p + 46, p + 46 + nl));
      const lnl = dv.getUint16(off + 26, true), lxl = dv.getUint16(off + 28, true), d = u.subarray(off + 30 + lnl + lxl, off + 30 + lnl + lxl + csize);
      out[nom] = meth === 0 ? d.slice() : await flux(d, DecompressionStream, 'deflate-raw'); ordre.push(nom);
      p += 46 + nl + xl + cl;
    }
    return { fichiers: out, ordre };
  }
  async function zipper(fichiers, ordre) {
    const parts = [], central = []; let off = 0;
    const deflate = typeof CompressionStream !== 'undefined';
    for (const nom of ordre) {
      const data = fichiers[nom], nb = te.encode(nom), crc = crc32(data);
      const comp = deflate ? await flux(data, CompressionStream, 'deflate-raw') : data, meth = deflate ? 8 : 0;
      const h = new Uint8Array(30 + nb.length), v = new DataView(h.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, meth, true); v.setUint16(10, 0, true); v.setUint16(12, 0x21, true);
      v.setUint32(14, crc, true); v.setUint32(18, comp.length, true); v.setUint32(22, data.length, true); v.setUint16(26, nb.length, true); h.set(nb, 30);
      const c = new Uint8Array(46 + nb.length), w = new DataView(c.buffer);
      w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint16(8, 0x0800, true); w.setUint16(10, meth, true); w.setUint16(14, 0x21, true);
      w.setUint32(16, crc, true); w.setUint32(20, comp.length, true); w.setUint32(24, data.length, true); w.setUint16(28, nb.length, true); w.setUint32(42, off, true); c.set(nb, 46);
      parts.push(h, comp); central.push(c); off += h.length + comp.length;
    }
    const tc = central.reduce((s, c) => s + c.length, 0), fin = new Uint8Array(22), f = new DataView(fin.buffer);
    f.setUint32(0, 0x06054b50, true); f.setUint16(8, ordre.length, true); f.setUint16(10, ordre.length, true); f.setUint32(12, tc, true); f.setUint32(16, off, true);
    return new Blob([...parts, ...central, fin], { type: XLSX });
  }

  /* ---------- feuilles ---------- */
  const colNum = (ref) => { const m = /^([A-Z]+)/.exec(ref); let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
  const colLettre = (n) => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  function cheminsFeuilles(F) {
    const wb = td.decode(F['xl/workbook.xml']), rels = td.decode(F['xl/_rels/workbook.xml.rels']), cible = {};
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) { const id = /Id="([^"]+)"/.exec(m[0]), t = /Target="([^"]+)"/.exec(m[0]); if (id && t) cible[id[1]] = t[1].replace(/^\/?xl\//, '').replace(/^\//, ''); }
    return [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m, i) => ({ i, nom: (/name="([^"]*)"/.exec(m[0]) || [])[1].replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"'), chemin: 'xl/' + cible[(/r:id="([^"]+)"/.exec(m[0]) || [])[1]] }));
  }
  async function remplir(buf, o) {
    const { fichiers: F, ordre } = await dezipper(buf);
    const feuilles = cheminsFeuilles(F);
    // table des chaînes partagées
    let sst = F['xl/sharedStrings.xml'] ? td.decode(F['xl/sharedStrings.xml']) : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"></sst>';
    const existantes = [...sst.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => m[1].replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    const index = new Map(); existantes.forEach((s, i) => { if (!index.has(s)) index.set(s, i); });
    const nouvelles = []; let refs = 0;
    const chaine = (s) => { refs++; if (index.has(s)) return index.get(s); const k = existantes.length + nouvelles.length; index.set(s, k); nouvelles.push(s); return k; };
    // format « @ » (texte) demandé par la spécification pour certaines colonnes : style dérivé (même police, bordure…, numFmtId 49)
    let styles = F['xl/styles.xml'] ? td.decode(F['xl/styles.xml']) : null; const derives = {};
    const styleTexte = (base) => {
      if (!styles) return base; const k = base || '0'; if (derives[k]) return derives[k];
      const bloc = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles); if (!bloc) return base;
      const xfs = bloc[1].match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) || [];
      let xf = xfs[+k] || xfs[0] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
      if (/numFmtId="49"/.test(xf)) return (derives[k] = k);
      xf = xf.replace(/numFmtId="\d+"/, 'numFmtId="49"'); if (/applyNumberFormat="[^"]*"/.test(xf)) xf = xf.replace(/applyNumberFormat="[^"]*"/, 'applyNumberFormat="1"'); else xf = xf.replace(/^<xf\b/, '<xf applyNumberFormat="1"');
      const n = xfs.length; styles = styles.replace(bloc[0], bloc[0].replace(/<\/cellXfs>$/, xf + '</cellXfs>').replace(/(<cellXfs\b[^>]*count=")\d+(")/, '$1' + (n + 1) + '$2'));
      return (derives[k] = String(n));
    };
    for (const [nom, def] of Object.entries(o.feuilles || {})) {
      const f = feuilles.find(x => x.nom === nom); if (!f) throw new Error('Feuille « ' + nom + ' » absente du modèle');
      let x = td.decode(F[f.chemin]);
      const stCol = {}; const cols = /<cols>([\s\S]*?)<\/cols>/.exec(x);
      if (cols) for (const m of cols[1].matchAll(/<col\b[^>]*>/g)) { const mi = +(/min="(\d+)"/.exec(m[0]) || [])[1], ma = +(/max="(\d+)"/.exec(m[0]) || [])[1], s = (/style="(\d+)"/.exec(m[0]) || [])[1]; if (s && s !== '0') for (let c = mi; c <= ma; c++) stCol[c] = s; }
      const sd = /<sheetData\s*\/>|<sheetData>([\s\S]*?)<\/sheetData>/.exec(x);
      const rows = new Map(); (sd[1] || '').replace(/<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g, (r) => { rows.set(+(/\br="(\d+)"/.exec(r) || [])[1], r); return ''; });
      const styleCellule = (r, c) => { const t = rows.get(r); if (t) { const m = new RegExp('<c r="' + colLettre(c) + r + '"[^>]*?\\bs="(\\d+)"').exec(t); if (m) return m[1]; } return stCol[c] || null; };
      const debut = def.debut || 2; let derniere = 1, maxCol = 1;
      def.lignes.forEach((l, i) => {
        const r = debut + i, cells = [];
        l.forEach((v, j) => {
          const c = j + 1, s0 = styleCellule(r, c) || styleCellule(debut, c), s = (def.texte || []).includes(c) ? styleTexte(s0) : s0, sa = s ? ' s="' + s + '"' : '', ref = colLettre(c) + r;
          if (v === null || v === undefined || v === '') { if (s) cells.push('<c r="' + ref + '"' + sa + '/>'); return; }
          if (typeof v === 'number' && isFinite(v)) cells.push('<c r="' + ref + '"' + sa + '><v>' + v + '</v></c>');
          else cells.push('<c r="' + ref + '"' + sa + ' t="s"><v>' + chaine(String(v)) + '</v></c>');
          maxCol = Math.max(maxCol, c);
        });
        const t = rows.get(r), attrs = t ? (/^<row\b([^>]*?)\/?>/.exec(t)[1].replace(/\s*\bspans="[^"]*"/, '')) : ' r="' + r + '"';
        rows.set(r, '<row' + attrs + '>' + cells.join('') + '</row>'); derniere = r;
      });
      const corps = [...rows.keys()].sort((a, b) => a - b).map(k => rows.get(k)).join('');
      x = x.replace(sd[0], '<sheetData>' + corps + '</sheetData>');
      x = x.replace(/<dimension ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/, (m, a, b, c, d) => '<dimension ref="' + a + b + ':' + colLettre(Math.max(colNum(c), maxCol)) + Math.max(+d, derniere) + '"/>');
      F[f.chemin] = te.encode(x);
    }
    if (styles) F['xl/styles.xml'] = te.encode(styles);
    if (nouvelles.length || refs) {
      const ajout = nouvelles.map(s => '<si><t xml:space="preserve">' + ech(s) + '</t></si>').join('');
      sst = sst.replace(/<\/sst>\s*$/, ajout + '</sst>').replace(/uniqueCount="\d+"/, 'uniqueCount="' + (existantes.length + nouvelles.length) + '"')
        .replace(/\bcount="(\d+)"/, (m, n) => 'count="' + (+n + refs) + '"');
      F['xl/sharedStrings.xml'] = te.encode(sst);
      if (!ordre.includes('xl/sharedStrings.xml')) throw new Error('Modèle sans table de chaînes');
    }
    if (o.active) {   // feuille active : celle du cours choisi
      const f = feuilles.find(x => x.nom === o.active);
      if (f) {
        F['xl/workbook.xml'] = te.encode(td.decode(F['xl/workbook.xml']).replace(/activeTab="\d+"/, 'activeTab="' + f.i + '"').replace(/firstSheet="\d+"/, 'firstSheet="0"'));
        for (const g of feuilles) { let x = td.decode(F[g.chemin]); x = x.replace(/tabSelected="(true|false|1|0)"/, 'tabSelected="' + (g.i === f.i ? 'true' : 'false') + '"'); if (g.i === f.i && !/tabSelected=/.test(x)) x = x.replace(/<sheetView\b/, '<sheetView tabSelected="1"'); F[g.chemin] = te.encode(x); }
      }
    }
    return zipper(F, ordre);
  }
  /* ---------- modèles EducMaster (outils/lots/spec-educmaster.md) ---------- */
  const FEUILLE_COURS = { CI: 'CI', CP: 'CP', CE1: 'CE1', CE2: 'CE2', CM1: 'CM1', CM2: 'CM2', PETITS: 'Marternelle 1', EM1: 'Marternelle 1', MOYENS: 'Marternelle 1', 'MATERNELLE 1': 'Marternelle 1',
    GRANDS: 'Marternelle 2', EM2: 'Marternelle 2', 'MATERNELLE 2': 'Marternelle 2' };
  const feuilleCours = (c) => FEUILLE_COURS[String(c || '').toUpperCase()] || null;
  /** date enregistrée -> texte jj/mm/aaaa ; date incomplète (année seule…) écrite telle qu'enregistrée */
  const dateTexte = (d) => { const t = String(d || '').trim(); const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t); return m ? m[3] + '/' + m[2] + '/' + m[1] : t; };
  const sexeMF = (x) => (/^f/i.test(String(x || '')) ? 'F' : x ? 'M' : '');
  const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const MODELES = { classe: 'educmaster_modele_classe.xlsx', notes: 'educmaster_modele_notes_primaire.xlsx', agents: 'educmaster_modele_agents.xlsx' };
  const tri = (a, b) => txt(a.nom).localeCompare(txt(b.nom), 'fr') || txt(a.prenoms).localeCompare(txt(b.prenoms), 'fr');
  const EducMaster = {
    MODELES, feuilleCours, dateTexte, sexeMF,
    /** élèves d'UN cours -> modèle des élèves par classe : seule la feuille du cours est remplie et devient la feuille active */
    async eleves(base, cours, eleves) {
      const f = feuilleCours(cours); if (!f) throw new Error('Cours « ' + cours + ' » sans feuille dans le modèle EducMaster');
      const lignes = eleves.slice().sort(tri).map(e => [txt(e.nom), txt(e.prenoms), sexeMF(e.sexe), dateTexte(e.dateNaiss), txt(e.lieuNaiss), txt(e.tel), txt(e.nationalite) || 'Béninoise', txt(e.npi)]);
      return remplir(await charger(base + MODELES.classe), { feuilles: { [f]: { debut: 2, lignes, texte: [6, 8] } }, active: f });
    },
    /** notes d'une classe : parFeuille = { 'Évaluation sommative 1': [{ matricule, nom, prenoms, notes: [n|null × 9] }] } */
    async notes(base, parFeuille) {
      const feuilles = {};
      for (const [nom, l] of Object.entries(parFeuille)) feuilles[nom] = { debut: 3, texte: [1], lignes: l.slice().sort(tri).map(e => [txt(e.matricule), txt(e.nom), txt(e.prenoms)]
        .concat(...e.notes.map(n => (typeof n === 'number' && isFinite(n) ? [n, 20] : ['', ''])))) };
      return remplir(await charger(base + MODELES.notes), { feuilles });
    },
    /** agents en activité -> « Mes agents » */
    async agents(base, agents) {
      const lignes = agents.slice().sort(tri).map(a => [txt(a.matricule), txt(a.idAnpe), txt(a.nom), txt(a.prenoms), sexeMF(a.sexe), dateTexte(a.dateNaiss), txt(a.lieuNaiss),
        txt(a.nationalite) || 'Bénin', txt(a.tel), txt(a.email), txt(a.ifu), dateTexte(a.datePriseService)]);
      return remplir(await charger(base + MODELES.agents), { feuilles: { 'Mes agents': { debut: 2, lignes, texte: [1, 2, 9, 11] } } });
    }
  };
  async function charger(url) { const r = await fetch(url); if (!r.ok) throw new Error('Modèle EducMaster introuvable : ' + url); return r.arrayBuffer(); }
  global.ModeleXlsx = { remplir, charger, lire: dezipper, EducMaster };
})(typeof window !== 'undefined' ? window : globalThis);
