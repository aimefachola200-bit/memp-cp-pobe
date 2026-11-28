/* MEMP-CP / DOSP — « Listes de classe » : l'application ne tient pas de listes nominatives d'élèves ; l'accès rapide donne,
   pour un cours (CI … CM2, sections des petits et des grands), la liste des écoles du périmètre avec leurs effectifs
   (garçons, filles, total, redoublants) d'après les fiches d'effectifs. Lecture seule, moteur commun js/listes-classe.js. */
import { h, currentSchoolYear } from './util.js';
import { scoped } from './data.js';
import * as E from './effectifs-schema.js';
import { XlsxBook } from './xlsx.js';
import { APP } from './config.js';

const COURS = ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2', 'Petits', 'Grands'], COL_EM = { Petits: 'pet', Grands: 'gra' };
const COLONNES = [['n', 'N°'], ['nom', 'École'], ['zone', 'Zone'], ['secteur', 'Secteur'], ['G', 'Garçons'], ['F', 'Filles'], ['T', 'Total'], ['red', 'Dont redoublants'], ['maj', 'Mise à jour de la fiche']];

export async function render(id, ctx) {
  const u = ctx.user;
  ctx.title('Listes de classe', 'Effectifs par cours et par école (fiches d’effectifs) — lecture seule');
  await import('./listes-classe.js');
  const [schools, records] = await Promise.all([scoped('schools', u), scoped('effectifs', u)]);
  const annees = [...new Set(records.map(r => r.annee))].sort().reverse();
  const annee = annees.includes(currentSchoolYear()) ? currentSchoolYear() : (annees[0] || currentSchoolYear());
  const rec = new Map(records.filter(r => r.annee === annee).map(r => [r.schoolId, r]));
  const lignes = [];
  for (const s of schools) {
    const r = rec.get(s.id); if (!r) continue;
    const S = E.schemaOf(s.cycle), v = E.computeValues(S, r.data || {}), mat = S.id === 'EM';
    for (const c of COURS) {
      const col = mat ? COL_EM[c] : (COL_EM[c] ? null : c); if (!col) continue;
      const G = E.show(S, v, 'tot', col, 'G'), F = E.show(S, v, 'tot', col, 'F');
      if (G === null && F === null) continue;
      lignes.push({ id: r.id + ':' + c, recId: r.id, nom: s.nom, zone: s.numZone ? 'Zone ' + s.numZone : (s.codeZone || ''), secteur: s.secteur || '', cours: c,
        G: G || 0, F: F || 0, T: (G || 0) + (F || 0), red: mat ? '' : (E.show(S, v, 'redoub', col, 'T') ?? ''), maj: r.updated ? new Date(r.updated).toLocaleDateString('fr-FR') : '' });
    }
  }
  const zone = h('div'); ctx.el.append(zone);
  const A = {
    app: 'MEMP-CP', annee: () => annee, colonnes: COLONNES,
    ecoles: async () => [],
    cours: async () => COURS.filter(c => lignes.some(l => l.cours === c)).concat(lignes.length ? [] : ['CI']),
    charger: async () => ({ classes: [], eleves: lignes }),
    ouvrir: (id, x) => ctx.go('effectif/' + encodeURIComponent(x.recId)),
    entete: async () => `<div style="text-align:center;font-size:10pt;line-height:1.35"><b>${APP.republique}</b><br>${APP.ministere || ''}<br>${u.nomCs ? 'Circonscription scolaire de ' + u.nomCs : ''}${u.codeZone ? ' — ' + u.codeZone : ''}</div>`,
    excel: async (nom, feuilles) => {
      const b = new XlsxBook();
      for (const f of feuilles) { const ws = b.sheet(f.nom); f.lignes.forEach((l, r) => l.forEach((x, c) => ws.set(r, c, x, r === (f.entete || 0) - 1 ? 'th' : r < (f.entete || 0) - 1 ? 'note' : 'td'))); }
      const blob = await b.toBlob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom + '.xlsx'; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    }
  };
  if (!lignes.length) zone.append(h('p', { class: 'hint' }, `Aucune fiche d’effectifs pour ${annee} dans votre périmètre : les listes se remplissent avec les effectifs des écoles (« Effectifs des apprenants »).`));
  await window.ListesClasse.monter(zone, A);
}
