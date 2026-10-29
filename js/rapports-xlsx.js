/* République du Bénin — MEMP — Excel des fiches de rapport de rentrée et de fin d'année (même structure que GESCOL /
   SCOLARIS m_rapports.generer_excel) : feuille « Rapport » (rubriques, champs, tableaux, structure pédagogique,
   état nominatif) et feuille « Données » (Clé, Libellé, Valeur, Origine), qui sert aussi à l'import.
   Conception : Maître Aimé FACHOLA */
import { XlsxBook, readXlsx } from './xlsx.js';
import { entier, champsEditables, clesTableau, tousCalculs, nbLignesPersonnel, validerValeur, NIV_EP } from './rapports.js';

export async function excelRapport(D, doc, annee, v, origine = {}) {
  const info = D.docs[doc], wb = new XlsxBook(), ws = wb.sheet('Rapport');
  let r = 0, largeur = 4;
  ws.set(r++, 0, 'MINISTÈRE DES ENSEIGNEMENTS MATERNEL ET PRIMAIRE – RÉPUBLIQUE DU BENIN', 'bold');
  ws.set(r++, 0, info.direction, 'bold');
  ws.set(r++, 0, info.fiche, 'title');
  ws.set(r, 0, `ANNEE SCOLAIRE : ${annee}`, 'bold'); r += 2;
  const nb = (val) => { const n = entier(val); return n !== null && String(n) === String(val) ? n : (val ?? ''); };
  for (const s of D.schemas[doc]) {
    ws.set(r++, 0, s.titre.toUpperCase(), 'section');
    for (const b of s.blocs) {
      if (b.t === 'champ') {
        if (b.type === 'titre') { ws.set(r++, 0, b.lib_titre, 'note'); continue; }
        ws.set(r, 0, b.num || ''); ws.set(r, 1, b.lib); ws.set(r, 2, v[b.k] ?? '', 'bold'); r++;
      } else if (b.t === 'tableau') {
        const sous = b.sous, ncol = b.groupes.reduce((a) => a + (sous ? sous.length : 1), 0);
        largeur = Math.max(largeur, ncol + 1);
        let j = 1;
        for (const gr of b.groupes) {
          const n = sous ? sous.length : 1;
          ws.set(r, j, gr.l, 'th'); for (let jj = j + 1; jj < j + n; jj++) ws.set(r, jj, '', 'th');
          if (n > 1) ws.merge(r, j, r, j + n - 1);
          if (sous) sous.forEach(([, sl], i) => ws.set(r + 1, j + i, sl, 'th'));
          j += n;
        }
        r += sous ? 2 : 1;
        for (const [lc, llib] of b.lignes) {
          ws.set(r, 0, llib, 'td'); j = 1;
          for (const gr of b.groupes) for (const sc of (sous ? sous.map(x => x[0]) : [null])) { ws.set(r, j, nb(v[`${b.k}.${lc}.${gr.c}` + (sc ? `_${sc}` : '')]), 'tdc'); j++; }
          r++;
        }
      } else if (b.t === 'structure_ep') {
        ws.set(r++, 0, b.titre, 'note');
        [...NIV_EP, 'Nombre de salles utilisées'].forEach((h, j) => ws.set(r, j + 1, h, 'th')); r++;
        const jum = Object.fromEntries(b.jumelees);
        for (const [lig, lib] of [['simple', 'Simple'], ['jumelee', 'Jumelée'], ['multi', 'Multigrade']]) {
          ws.set(r, 0, lib, 'td');
          if (lig === 'jumelee') { ws.set(r, 1, Object.keys(jum).filter(c => v[`sp.jumelee.${c}`]).map(c => `${jum[c]} : ${v[`sp.jumelee.${c}`]}`).join('; ')); ws.merge(r, 1, r, 6); }
          else NIV_EP.forEach((n, j) => ws.set(r, j + 1, v[`sp.${lig}.${n}`] ?? '', 'td'));
          ws.set(r, 7, v[`sp.${lig}.salles`] ?? '', 'td'); r++;
        }
      } else if (b.t === 'personnel') {
        const n = nbLignesPersonnel(D, doc, v), cols = b.cols;
        largeur = Math.max(largeur, cols.length + 1);
        ws.set(r, 0, "N° d'ordre", 'td'); cols.forEach((col, j) => ws.set(r, j + 1, col.l, 'th')); r++;
        for (let i = 1; i <= n; i++) { ws.set(r, 0, i, 'td'); cols.forEach((col, j) => ws.set(r, j + 1, v[`pers.${i}.${col.c}`] ?? '', 'td')); r++; }
      }
    }
    r++;
  }
  ws.width(0, 34).width(1, 34).width(2, 22);
  for (let j = 3; j < largeur + 2; j++) ws.width(j, 11);
  const wd = wb.sheet('Données');
  ['Clé', 'Libellé', 'Valeur', 'Origine'].forEach((h, j) => wd.set(0, j, h, 'section'));
  const calc = tousCalculs(D, doc), libs = new Map(champsEditables(D, doc, null, v).map(([k, sp]) => [k, sp.lib]));
  for (const s of D.schemas[doc]) for (const b of s.blocs) if (b.t === 'tableau') for (const [k, lib] of clesTableau(b)) if (!libs.has(k)) libs.set(k, lib);
  r = 1;
  for (const [k, lib] of libs) { wd.set(r, 0, k); wd.set(r, 1, lib); wd.set(r, 2, v[k] ?? ''); wd.set(r, 3, k in calc ? 'calcul (somme)' : (origine[k] || '')); r++; }
  wd.width(0, 24).width(1, 60).width(2, 30).width(3, 22).freeze(1);
  return wb.toBlob();
}

/** Import d'un Excel produit par l'application, GESCOL ou SCOLARIS (feuille « Données » : Clé, Libellé, Valeur).
    Retourne {valeurs, erreurs, n} : seules les cases saisissables sont reprises (les totaux sont recalculés). */
export async function importerExcel(D, doc, buffer) {
  const sheets = await readXlsx(buffer), s = sheets.find(x => x.name === 'Données');
  if (!s) throw new Error("Ce fichier Excel ne contient pas la feuille « Données » (export d'une fiche de rapport).");
  const lignes = s.rows.slice(1).filter(l => l && l[0]);
  const nPers = Math.max(1, ...lignes.map(l => /^pers\.(\d+)\./.exec(String(l[0]))).filter(Boolean).map(m => +m[1]));
  const specs = new Map(champsEditables(D, doc, Math.min(D.pers_max, nPers)));
  const valeurs = {}, erreurs = []; let n = 0;
  for (const [k, , brut] of lignes) {
    const sp = specs.get(String(k).trim()); if (!sp) continue;
    const x = String(brut ?? '').trim(); if (x === '') continue;
    const [ok, val, msg] = validerValeur(sp, x);
    if (!ok) { erreurs.push(`${sp.lib} : ${msg}`); continue; }
    valeurs[sp.k || k] = val; n++;
  }
  return { valeurs, erreurs, n };
}
