/* République du Bénin — MEMP — « Pilotage et vie scolaire » (module commun js/pvs.js, catalogue js/pvs-modules.js)
   dans MEMP-CP / DOSP / MEMP-CP Pobè : sport scolaire, tableau de bord du pilotage (lot A).
   Entités, droits, cachets, visas : ceux des bureaux UASCEP (views-uascep.js). Données : réglage « pvs ».
   Pièces signées : registre des documents (store « pvs »), vérifiables dans « Vérifier un document ».
   Conception : Maître Aimé FACHOLA */
import { db } from './db.js';
import { scoped } from './data.js';
import { sha256, uid, nowISO } from './util.js';
import { getIdentity, qrPayload } from './sign.js';
import { qrDataURL } from './qr.js';
import { adaptateurUascep } from './views-uascep.js';
import { cepEcole } from './views-cep.js';
import * as INF from './views-infra.js';
import * as E from './effectifs-schema.js';

const I = (n) => (window.Icones ? window.Icones.code(n) + ' ' : '');
export const MODULES = { sport: 'sport', pilotage: 'pilotage', communication: 'communication', sante: 'sante', inspection: 'inspection', patrimoine: 'patrimoine', examens: 'examens' };
const TITRES = { sport: ['Sport scolaire', 'Licences, compétitions, calendrier, feuilles de match, classements, palmarès et qualifiés'],
  pilotage: ['Tableau de bord du pilotage', 'Indicateurs par école, UP, zone, circonscription et département'],
  communication: ['Communication et alertes', 'Notes de service, circulaires, convocations, accusés de réception, échéances, messages aux parents, agenda'],
  sante: ['Santé, cantine et inclusion', 'Visites médicales, infirmerie, cantine et stocks, besoins spécifiques, filles, décrochage'],
  inspection: ['Inspection et formation', 'Visites de classe (grille APC), recommandations, plans de formation, animations pédagogiques'],
  patrimoine: ['Patrimoine et matériel', 'Bâtiments, tables-bancs, manuels, matériel, besoins, dotations et PV de réception'],
  examens: ['Examens et concours', 'CEP : épreuves, centres, jurys, candidats, notes, délibération, résultats ; concours scolaires'] };

/** Pièce PVS signée : registre « docs » (store pvs), empreinte SHA-256 du contenu vérifiable */
export async function signerPvs(doc, u) {
  const idn = (await getIdentity()) || {};
  const hash = await sha256(window.PVS.canon(doc.contenu));
  const id = 'D' + uid().replace(/-/g, '').slice(0, 10).toUpperCase();
  const codeCp = idn.codeCp || u.codeCp || u.username;
  await db.put('docs', { id, ficheId: 'PVS', store: 'pvs', hash, date: nowISO(), cp: codeCp, by: u.username, label: doc.typeLib + ' — ' + (doc.resume.objet || doc.resume.entite || ''),
    pvs: { type: doc.type, module: doc.module, ref: doc.ref, resume: doc.resume } });
  const texte = qrPayload(id, hash, codeCp);
  return { numero: id, code: hash.slice(0, 16).toUpperCase(), qr: '<img src="' + qrDataURL(texte, 4, 2) + '" alt="Code QR de vérification" width="96" height="96">', texte,
    mention: 'Vérifiable dans l’application (menu « Vérifier un document ») : numéro ou code QR ; toute modification des données après la signature est signalée.' };
}
/** Vérification : l'empreinte est recalculée sur les données enregistrées */
export async function verifierPvs(d) {
  const etat = (await db.setting('pvs')) || {};
  const x = d.pvs || {};
  const now = await sha256(window.PVS.canon(window.PVS.contenuDocument(etat, x.type, x.ref || {})));
  return { same: now === d.hash, resume: x.resume || {} };
}

/** Indicateurs par école calculés depuis les données de l'application (effectifs, personnel, fiches, CEP) */
async function indicateurs(u, annee) {
  const [schools, effs, pers, fiches, reports] = await Promise.all([scoped('schools', u), scoped('effectifs', u), scoped('personnel', u), scoped('fiches', u), scoped('classReports', u)]);
  const out = {};
  for (const s of schools) {
    const v = {};
    const rec = effs.find(r => r.schoolId === s.id && r.annee === annee);
    if (rec) { const S = E.schemaOf(s.cycle), m = E.metrics(S, E.computeValues(S, rec.data || {})); if (m.G !== null) v.effG = m.G; if (m.F !== null) v.effF = m.F; if (m.redoub !== null && m.redoub !== undefined) v.redoublantsG = m.redoub; }
    const p = pers.filter(x => x.schoolId === s.id && !/retrait|décéd|decede/i.test(x.situation || ''));
    if (p.length) {
      v.enseignants = p.length; v.enseignantsF = p.filter(x => x.sexe === 'F').length;
      v.ensFE = p.filter(x => /^(FE|APE)$/i.test(x.statut || '')).length; v.ensContractuels = p.filter(x => /^(ACE|ACDPE)/i.test(x.statut || '')).length;
      v.ensCommunautaires = p.filter(x => /ACDPCTD|AME|communaut|volont/i.test(x.statut || '')).length; v.ensAutres = p.length - v.ensFE - v.ensContractuels - v.ensCommunautaires;
    }
    const kind = (s.cycle === 'Maternelle' ? 'EM' : 'EP') + '_RENTREE', f = fiches.find(x => x.schoolId === s.id && x.annee === annee && x.kind === kind);
    if (f) { const x = INF.indicateurs((() => { const a = INF.vide(); INF.ajouter(a, s, f); return a; })()); if (x.salles_tot) v.salles = x.util || x.salles_tot; if (x.places_ep) v.tablesBancs = Math.round(x.places_ep / 2); if (x.lavage[1]) v.pointEau = x.lavage[0] ? 'Oui' : 'Non'; }
    if (s.cycle !== 'Maternelle') {
      const ff = fiches.find(x => x.schoolId === s.id && x.annee === annee && x.kind === 'EP_FIN'), r = reports.find(x => x.schoolId === s.id && x.annee === annee && x.cours === 'CM2');
      const c = cepEcole(ff, r); if (c.source) { v.cepInscritsG = c.insc[0]; v.cepInscritsF = c.insc[1]; v.cepPresentsG = c.comp[0]; v.cepPresentsF = c.comp[1]; v.cepAdmisG = c.adm[0]; v.cepAdmisF = c.adm[1]; }
    }
    out[String(s.id)] = v;
  }
  return out;
}

export async function adaptateurPvs(u) {
  const base = await adaptateurUascep(u);
  return Object.assign({}, base, {
    app: 'MEMP-CP', sansTitre: true,
    charger: async () => (await db.setting('pvs')) || null,
    enregistrer: async (etat) => { await db.setting('pvs', etat); },
    signer: (doc) => signerPvs(doc, u),
    indicateurs: async (annee) => { const a = await indicateurs(u, annee); const { indicateursEcoles } = await import('./views-examen.js'); const eb = await indicateursEcoles(annee); Object.entries(eb).forEach(([k, v]) => { a[k] = Object.assign(a[k] || {}, v); }); return a; },
    uascep: () => ({ charger: base.charger, enregistrer: base.enregistrer }),
    memo: { get: (k) => { try { return localStorage.getItem('pvs.' + k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem('pvs.' + k, v); } catch (e) { /* indisponible */ } } },
    ouvrir: (route) => { location.hash = '#/' + route; },
    utilisateur: () => [u.prenoms, u.nom].filter(Boolean).join(' ') || u.username,
    liens: { patrimoine: [{ l: I('chantier') + 'Infrastructures et mobilier (fiches)', route: 'infra' }], examens: [{ l: I('livres') + 'Pédagogie : épreuves et corrigés', route: 'pedagogie/epreuves' }, { l: I('stade') + 'Examen blanc du CEP', route: 'examenblanc' }, { l: I('diplome') + 'CEP : candidats et réussite (fiches)', route: 'cep' }], inspection: [{ l: I('calendrier') + 'Activités pédagogiques', route: 'activites' }, { l: I('livres') + 'Pédagogie : fiches, guides et programmes', route: 'pedagogie/fiches' }],
      communication: [{ l: I('message') + 'Groupe WhatsApp des directeurs', route: 'whatsapp' }], sport: [{ l: I('insigne') + 'Bureaux UASCEP', route: 'uascep' }], pilotage: [{ l: I('stade') + 'Examen blanc du CEP', route: 'examenblanc' }, { l: I('eleve') + 'Effectifs des apprenants', route: 'effectifs' }, { l: I('diplome') + 'CEP : candidats et réussite', route: 'cep' }, { l: I('chantier') + 'Infrastructures et mobilier', route: 'infra' }] }
  });
}

export async function render(id, ctx) {
  const mod = MODULES[String(id).replace(/^pvs/, '').toLowerCase()] || 'sport';
  if (!window.PVS) { ctx.el.append(Object.assign(document.createElement('p'), { textContent: 'Module indisponible : rechargez l’application.' })); return; }
  ctx.title && ctx.title(...TITRES[mod]);
  const racine = document.createElement('div'); ctx.el.append(racine);
  await window.PVS.monter(racine, await adaptateurPvs(ctx.user), mod);
  ctx.actions && ctx.actions([]);
}
