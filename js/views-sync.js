/* République du Bénin — MEMP — « Synchronisation entre niveaux » (MEMP-CP, DOSP, MEMP-CP Pobè, espace CP d'ÉduGestion).
   Protocole commun memp-sync v1 (/home/claude/outils/sync/spec.md) : moteurs js/ed25519.js, js/sync-client.js, js/sync-commun.js.
   CP (zone) → CCS / DOSP (circonscription) → DDEMP : bureaux et vie UASCEP, registres partagés (sport, examens, patrimoine,
   communication, pilotage), versions d'épreuves / fiches / résumés, et le paquet de transmission des fiches (Transmission & sauvegarde).
   Conception : Maître Aimé FACHOLA */
import { db } from './db.js';
import { scoped, session } from './data.js';
import { APP, VARIANT } from './config.js';
import { makePackage, importPackage } from './views-admin.js';

const NIVEAU = { CP: 'ZONE', CCS: 'CS', DOSP: 'CS', DDEMP: 'DDEMP', ADMIN: 'DDEMP' };
let client = null, clientDe = '';

async function ecolesConnues(u) { try { return await scoped('schools', u); } catch (e) { return db.all('schools'); } }
function identite(u) {
  const niveau = NIVEAU[u.role] || 'ZONE';
  if (niveau === 'ZONE') return { niveau, code: u.codeZone || u.username, nom: 'Zone pédagogique ' + (u.numZone || u.codeZone || ''), cs: u.nomCs || u.codeCs || '', departement: u.departement || '' };
  if (niveau === 'CS') return { niveau, code: u.codeCs || u.username, nom: 'Circonscription scolaire ' + (u.nomCs || u.codeCs || ''), cs: u.nomCs || u.codeCs || '', departement: u.departement || '' };
  return { niveau, code: u.departement || u.username, nom: 'DDEMP ' + (u.departement || ''), departement: u.departement || '' };
}
/** Client de synchronisation du compte connecté (un par compte : périmètre et niveau changent avec lui) */
export async function syncClient(u) {
  u = u || session.user;
  if (client && clientDe === u.id) return client;
  let ecoles = await ecolesConnues(u);
  const norm = window.SyncCommun.norm;
  const commun = window.SyncCommun.creer({
    uascep: { charger: async () => (await db.setting('uascep')) || { bureaux: [], membres: [] }, enregistrer: (e) => db.setting('uascep', e) },
    pvs: { charger: async () => (await db.setting('pvs')) || {}, enregistrer: (e) => db.setting('pvs', e) },
    pedagogie: { charger: async () => (await db.setting('pedagogieNotes')) || {}, enregistrer: (e) => db.setting('pedagogieNotes', e) },
    ecoleCode: (id) => { const s = ecoles.find(x => String(x.id) === String(id)); return s ? { code: s.code || '', nom: s.nom } : null; },
    ecoleLocale: (code, nom, parNom) => { const s = (!parNom && ecoles.find(x => x.code && norm(x.code) === norm(code))) || ecoles.find(x => norm(x.nom) === norm(parNom ? code : nom)); return s ? s.id : null; }
  });
  const statuts = u.role === 'CP' ? ['Transmise'] : ['Validée'];
  client = window.SyncClient.installer({
    application: 'MEMP-CP', base: 'MEMP-CP-' + (VARIANT.base || VARIANT.id || 'cp') + '-' + u.username, version: APP.version, edition: VARIANT.id || 'cp', titre: APP.name, couleur: '#0b5d3b',
    identite: async () => identite(u),
    objets: async () => { ecoles = await ecolesConnues(u); return commun.objets(); },
    appliquer: (o) => commun.appliquer(o), debut: () => commun.debut(), fin: () => commun.fin(),
    transmission: async () => { const r = await makePackage(u, statuts); const n = r.fiches.length + r.reports.length + (r.pkg.payload.bilans || []).length + (r.pkg.payload.effectifs || []).length; return n ? r.pkg : null; },
    recevoirTransmission: async (t) => { const r = await importPackage(u, JSON.stringify(t)); return 'fiches : ' + r.stat.nouv + ' nouvelle(s), ' + r.stat.maj + ' mise(s) à jour'; },
    estHub: () => ['CCS', 'DOSP', 'DDEMP', 'ADMIN'].includes(u.role)
  });
  clientDe = u.id;
  return client;
}

export async function render(id, ctx) {
  ctx.title && ctx.title('Synchronisation entre niveaux', 'Zone → circonscription → département : envois signés par fichier ou par Internet, hors ligne d’abord');
  if (!window.SyncClient || !window.SyncCommun || !window.Ed25519) { ctx.el.append(Object.assign(document.createElement('p'), { textContent: 'Module indisponible : rechargez l’application.' })); return; }
  const zone = document.createElement('div'); ctx.el.append(zone);
  const c = await syncClient(session.user);
  await c.page(zone);
}
