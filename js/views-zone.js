/* République du Bénin — MEMP — Zone déshéritée dans MEMP-CP / DOSP : agents des postes orange et rouge, prime de zone, liste par école.
   Noyau commun : js/zone-core.js (window.ZoneDesheritee). Données : réglage « zone_desheritee » (sauvegarde, transmission et restauration comme les autres réglages).
   Périmètre : CP = sa zone ; CCS et DOSP = la circonscription ; DDEMP = le département ; administrateur = tout.   Conception : Maître Aimé FACHOLA */
import { download, currentSchoolYear } from './util.js';
import { db } from './db.js';
import { scoped } from './data.js';
import { readXlsx } from './xlsx.js';

function csv(texte) {
  const l1 = texte.replace(/^﻿/, '').split(/\r?\n/)[0] || '', sep = (l1.match(/;/g) || []).length >= (l1.match(/,/g) || []).length ? ';' : ',';
  return texte.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map(l => l.split(sep).map(c => c.replace(/^"|"$/g, '').trim()));
}
export async function render(id, ctx) {
  const racine = document.createElement('div'); ctx.el.append(racine);
  if (!window.ZoneDesheritee) { racine.textContent = 'Module indisponible : rechargez l’application.'; return; }
  const u = ctx.user;
  ctx.title && ctx.title('Zone déshéritée', 'Agents des postes orange et rouge : prime de zone, rendement / gratification, banque — par école');
  const noms = (await scoped('schools', u)).map(s => s.nom).filter(Boolean);
  await window.ZoneDesheritee.monter(racine, {
    charger: async () => (await db.setting('zone_desheritee')) || null,
    enregistrer: async (e) => { await db.setting('zone_desheritee', e); },
    ecoles: () => noms,
    ecoleFixe: () => '',
    annee: () => currentSchoolYear(),
    peutEcrire: () => true,
    uid: () => (crypto.randomUUID ? crypto.randomUUID() : 'z' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
    entete: () => '<div style="text-align:center;font:bold 12px Arial">RÉPUBLIQUE DU BÉNIN<br>MINISTÈRE DES ENSEIGNEMENTS MATERNEL ET PRIMAIRE' + (u.nomCs ? '<br>CIRCONSCRIPTION SCOLAIRE DE ' + String(u.nomCs).toUpperCase() : '') + '</div>',
    xlsxEcrire: async (feuilles) => window.XlsxEcrire.classeur(feuilles),
    xlsxLire: async (f) => /\.(csv|txt)$/i.test(f.name) ? csv(await f.text()) : ((await readXlsx(await f.arrayBuffer())).map(x => x.rows).find(r => r && r.length) || []),
    telecharger: async (nom, blob) => download(blob, nom),
    imprimer: (titre, corps) => {
      const w = window.open('', '_blank'); if (!w) { alert('Autorisez l’ouverture de fenêtres pour imprimer.'); return; }
      w.document.write('<!doctype html><meta charset="utf-8"><title>' + titre + '</title><style>@page{size:A4 landscape;margin:10mm}body{font:12px Arial,sans-serif;margin:10px}</style>' + corps);
      w.document.close(); w.focus(); setTimeout(() => w.print(), 400);
    }
  });
  ctx.actions && ctx.actions([]);
}
