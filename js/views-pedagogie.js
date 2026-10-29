/* République du Bénin — MEMP — Module « Pédagogie » (moteur commun js/pedagogie.js) dans MEMP-CP / DOSP / MEMP-CP Pobè
   (et l'espace CP d'ÉduGestion) : programmes, guides, progressions annuelles, fiches de préparation, résumés, épreuves
   avec corrigés et planification jour / semaine / mois, du CI au CM2 (contenus de SCOLARIS, data/pedagogie/).
   Lecture pour tous ; le CP, le CCS, la DDEMP, la DOSP et l'administrateur ajoutent des notes (réglage « pedagogieNotes »).
   Les sujets d'une période peuvent être retenus pour l'examen blanc du CEP (réglage « examenBlancSujets »).
   Conception : Maître Aimé FACHOLA */
import { db } from './db.js';
import { adaptateurUascep } from './views-uascep.js';
import { inScope } from './data.js';

const ANNOTENT = ['ADMIN', 'CP', 'CCS', 'DDEMP', 'DOSP'];

export async function adaptateurPedagogie(u) {
  let entete = null;
  try { entete = (await adaptateurUascep(u)).entete; } catch (e) { entete = null; }
  // un encadreur dont toutes les écoles sont des maternelles (CP de la maternelle) arrive sur les contenus de la maternelle
  let coursParDefaut;
  try { const ecs = (await db.all('schools')).filter(s => inScope(u, s)); if (ecs.length && ecs.every(s => s.cycle === 'Maternelle')) coursParDefaut = 'MAT'; } catch (e) { coursParDefaut = undefined; }
  return {
    app: 'MEMP-CP', base: 'data/pedagogie/', hautFixe: 'var(--hdr, 0px)', coursParDefaut,
    peutAnnoter: ANNOTENT.includes(u.role), auteur: [u.prenoms, u.nom].filter(Boolean).join(' ') || u.username,
    notes: { charger: async () => (await db.setting('pedagogieNotes')) || {}, enregistrer: (o) => db.setting('pedagogieNotes', o) },
    entete,
    memo: { get: (k) => { try { return localStorage.getItem('ped.' + k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem('ped.' + k, v); } catch (e) { /* indisponible */ } } },
    liens: [{ l: 'Planification des activités (CP)', route: 'planningcp', icone: 'calendrier' }, { l: 'Visites de classe (grille APC)', route: 'pvsinspection', icone: 'inspection' },
      { l: 'Examen blanc du CEP', route: 'examenblanc', icone: 'stade' }, { l: 'Examens et concours', route: 'pvsexamens', icone: 'examen' }],
    ouvrir: (route) => { location.hash = '#/' + route; },
    examenBlanc: { lire: async () => (await db.setting('examenBlancSujets')) || null, retenir: (s) => db.setting('examenBlancSujets', s) }
  };
}

export async function render(id, ctx) {
  ctx.title && ctx.title('Pédagogie', 'Programmes, guides, progressions, fiches, résumés, épreuves et planification, de la maternelle au CM2');
  if (!window.Pedagogie) { ctx.el.append(Object.assign(document.createElement('p'), { textContent: 'Module indisponible : rechargez l’application.' })); return; }
  const racine = document.createElement('div'); ctx.el.append(racine);
  await window.Pedagogie.monter(racine, await adaptateurPedagogie(ctx.user), { onglet: ctx.args && ctx.args[0], cours: ctx.args && ctx.args[1] });
  ctx.actions && ctx.actions([]);
}
