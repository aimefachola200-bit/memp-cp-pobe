/* République du Bénin — MEMP — Application CP — Mode intégré à ÉduGestion Pro
   Conception : Maître Aimé FACHOLA — Tél. +229 01 96 51 03 33

   Quand l'application CP est livrée DANS ÉduGestion Pro (dossier memp-cp/), elle n'a pas de comptes à elle :
   - la personne connectée à ÉduGestion (CP, chef de circonscription, DDEMP, administration) y entre directement,
     avec le même périmètre (zone, circonscription, département, tout le pays) ;
   - les écoles et le personnel de ce périmètre sont repris d'ÉduGestion à chaque ouverture (ÉduGestion reste la
     référence pour l'identité des écoles et des agents ; ce qui n'existe que dans l'application CP est conservé).
   La lecture se fait dans la base locale d'ÉduGestion (même appareil, même adresse), en lecture seule. */
import { db } from './db.js';
import { VARIANT } from './config.js';
import { nowISO } from './util.js';
import { zoneCode } from './refdata.js';

const majus = (s) => String(s || '').trim().toUpperCase();
const sansAccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Ouvre la base d'ÉduGestion sans jamais la créer ni la modifier (null si absente). */
function ouvrirBase(nom) {
  return new Promise((res) => {
    let r;
    try { r = indexedDB.open(nom); } catch { res(null); return; }
    r.onupgradeneeded = (e) => { try { e.target.transaction.abort(); } catch { /* ignore */ } };
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(null);
    r.onblocked = () => res(null);
  });
}
function lire(base, store, cle) {
  return new Promise((res) => {
    if (!base.objectStoreNames.contains(store)) { res(cle === undefined ? [] : null); return; }
    const t = base.transaction(store, 'readonly'), os = t.objectStore(store);
    const r = cle === undefined ? os.getAll() : os.get(cle);
    r.onsuccess = () => res(r.result ?? (cle === undefined ? [] : null));
    r.onerror = () => res(cle === undefined ? [] : null);
  });
}

export const retourEduGestion = () => (VARIANT.integre && VARIANT.integre.retour) || '../index.html';

/** Code CS de l'application CP (CS118) à partir du code d'ÉduGestion (CS-118). */
export function codeCsDe(t) {
  if (!t) return '';
  const m = /(\d+)/.exec(t.code || '');
  return m ? 'CS' + String(+m[1]).padStart(3, '0') : 'CS-' + String(t.id || '').slice(0, 8).toUpperCase();
}
/** Numéro de zone : du code d'ÉduGestion (ZP-118-3), à défaut du nom (« … — Zone 3 »). */
export function numZoneDe(z) {
  if (!z) return '';
  const m = /^ZP-\d+-(\d+)$/i.exec(z.code || '') || /zone\s*(?:p[ée]dagogique)?\s*(?:n[°o]\s*)?(\d+)/i.exec(z.nom || '');
  return m ? String(+m[1]) : '';
}
const CYCLES = { MATERNELLE: 'Maternelle', PRIMAIRE: 'Primaire', MIXTE: 'Primaire' };
const SECTEURS = { PUBLIQUE: 'Public', PRIVEE: 'Privé laïc', COMMUNAUTAIRE: 'Communautaire' };
const FONCTIONS = { DIRECTEUR: 'Directeur / directrice', ENSEIGNANT: 'Adjoint(e)', CONSEILLER_PEDAGOGIQUE: 'Conseiller pédagogique', CS: 'Chef de circonscription scolaire', ADMINISTRATIF: 'Secrétaire' };

function categorieAgent(p, ecole) {
  const s = sansAccent(`${p.statut_code || ''} ${p.qualite || ''} ${p.emploi || ''}`).toUpperCase();
  if (/ACDPCTD|(^|[^A-Z])A\.?M\.?E\.?([^A-Z]|$)/.test(s)) return 'ACDPCTD';
  if (/ACDPE/.test(s)) return 'ACDPE';
  if (/(^|[^A-Z])FE([^A-Z]|$)|FONCTIONNAIRE/.test(s)) return 'FE';
  if (/(^|[^A-Z])ACE([^A-Z]|$)/.test(s)) return 'ACE';
  if (ecole && ecole.statut === 'PRIVEE') return 'Privé';
  return p.statut_code ? 'Autre' : '';
}

/** Rôle et périmètre de l'application CP pour un compte d'ÉduGestion (null si le rôle n'y a pas accès). */
export function profilPour(user, index) {
  const t = user.territoire_id ? index.get(user.territoire_id) : null;
  const anc = (id, type) => { let x = index.get(id), n = 0; while (x && n++ < 12) { if (x.type === type) return x; x = index.get(x.parent_id); } return null; };
  const dep = t ? anc(t.id, 'DEPARTEMENT') : null, cs = t ? anc(t.id, 'CIRCONSCRIPTION') : null;
  const base = { nom: user.nom || '', prenoms: user.prenoms || '', telephone: user.telephone || '', departement: dep ? majus(dep.nom) : '' };
  switch (user.role) {
    case 'ADMIN_MEMP': case 'ADMIN_TECHNIQUE': return { ...base, role: 'ADMIN' };
    case 'DDEMP': {
      if (!dep) return null;
      const csCodes = [...index.values()].filter(x => x.type === 'CIRCONSCRIPTION' && anc(x.id, 'DEPARTEMENT') === dep).map(codeCsDe);
      return { ...base, role: 'DDEMP', csCodes };
    }
    case 'CS': return cs ? { ...base, role: 'CCS', codeCs: codeCsDe(cs), nomCs: majus(cs.nom) } : null;
    case 'CONSEILLER_PEDAGOGIQUE': {
      if (!t || t.type !== 'ZONE_PEDAGOGIQUE' || !cs) return null;
      const codeCs = codeCsDe(cs), numZone = numZoneDe(t) || '1';
      return { ...base, role: 'CP', codeCs, nomCs: majus(cs.nom), numZone, codeZone: zoneCode(codeCs, numZone), codeCp: 'CP-' + majus(user.identifiant || '').slice(0, 20) };
    }
    default: return null;
  }
}

/** École de l'application CP correspondant à une école d'ÉduGestion. */
export function ecolePour(e, index) {
  const anc = (id, type) => { let x = index.get(id), n = 0; while (x && n++ < 12) { if (x.type === type) return x; x = index.get(x.parent_id); } return null; };
  const cs = e.territoire_id ? index.get(e.territoire_id) : (e.zone_id ? anc(e.zone_id, 'CIRCONSCRIPTION') : null);
  const z = e.zone_id ? index.get(e.zone_id) : null, up = e.up_id ? index.get(e.up_id) : null;
  const dep = e.departement_id ? index.get(e.departement_id) : (cs ? anc(cs.id, 'DEPARTEMENT') : null);
  const codeCs = codeCsDe(cs), numZone = numZoneDe(z);
  const nom = (id) => (id && index.get(id) ? index.get(id).nom : '');
  return {
    id: 'eg-' + e.id, egId: e.id, source: 'edugestion',
    code: e.code_ecole || '', nom: e.nom || '', cycle: CYCLES[e.cycle] || 'Primaire', secteur: SECTEURS[e.statut] || 'Public',
    departement: dep ? majus(dep.nom) : '', codeCs, nomCs: cs ? majus(cs.nom) : '', numZone, codeZone: zoneCode(codeCs, numZone),
    commune: majus(e.commune || nom(e.commune_id)), arrondissement: majus(e.arrondissement || nom(e.arrondissement_id)),
    localite: e.village_quartier || nom(e.village_quartier_id) || '', up: up ? up.nom : '',
    directeur: e.directeur_nom || '', contact: e.directeur_telephone || e.telephone || '',
  };
}

/**
 * Connexion unique : rend { user } (compte de l'application CP créé ou mis à jour d'après ÉduGestion)
 * ou { message } quand personne n'est connecté à ÉduGestion ou que le rôle n'a pas accès.
 */
export async function connexionIntegree() {
  // la base indiquée par ÉduGestion à l'ouverture de l'espace ; à défaut, celles de la variante (sur github.io, où plusieurs
  // applications partagent la même adresse, seulement la première, pour ne jamais lire la base d'une autre application)
  const prevues = (VARIANT.integre && VARIANT.integre.bases) || [];
  const egDb = sessionStorage.getItem('eg-db');
  const noms = egDb ? [egDb] : (location.hostname.endsWith('github.io') ? prevues.slice(0, 1) : prevues);
  let base = null;
  for (const n of [...new Set(noms)]) { base = await ouvrirBase(n); if (base && base.objectStoreNames.contains('users')) break; if (base) base.close(); base = null; }
  if (!base) return { message: 'Ouvrez d’abord ÉduGestion Pro et connectez-vous : l’espace CP s’ouvre ensuite depuis son menu.' };
  try {
    const meta = await lire(base, 'meta', 'session_utilisateur');
    const eg = meta && meta.valeur ? await lire(base, 'users', meta.valeur) : null;
    if (!eg || eg.actif === false) return { message: 'Aucun compte n’est connecté à ÉduGestion Pro sur cet appareil. Connectez-vous, puis rouvrez l’espace CP.' };
    const terr = await lire(base, 'territoires'), index = new Map(terr.map(t => [t.id, t]));
    const profil = profilPour(eg, index);
    if (!profil) return { message: 'L’espace CP (fiches officielles, effectifs, infrastructures, CEP, rapports) est réservé aux conseillers pédagogiques, aux chefs de circonscription, aux directions départementales et à l’administration. Votre compte ÉduGestion n’y a pas accès, ou son territoire n’est pas renseigné.' };
    const id = 'eg-' + eg.id, ancien = await db.get('users', id);
    const user = { ...(ancien || {}), ...profil, id, username: eg.identifiant || id, pwd: '', actif: true, mustChange: false, source: 'edugestion', created: (ancien && ancien.created) || nowISO(), maj: nowISO() };
    if (user.role !== 'DDEMP') delete user.csCodes;
    await db.put('users', user);
    await synchroniser(base, index, user);
    return { user };
  } finally { base.close(); }
}

/** Reprend les écoles et le personnel d'ÉduGestion compris dans le périmètre du compte. */
async function synchroniser(base, index, user) {
  const { inScope } = await import('./data.js');
  const [ecolesEG, persoEG] = await Promise.all([lire(base, 'ecoles'), lire(base, 'personnels')]);
  const existantes = new Map((await db.all('schools')).map(s => [s.id, s]));
  const ecoles = [], parEg = new Map();
  for (const e of ecolesEG) {
    if (e.actif === false) continue;
    const s = ecolePour(e, index);
    if (!inScope(user, s)) continue;
    const fusion = { ...(existantes.get(s.id) || { created: nowISO() }), ...s };
    ecoles.push(fusion); parEg.set(e.id, { s: fusion, e });
  }
  if (ecoles.length) await db.putMany('schools', ecoles);
  // circonscriptions et zones pédagogiques de ces écoles, pour les onglets « par zone » et l'espace CP
  const refs = new Map((await db.all('ref')).map(r => [r.type + ':' + r.code, r])), nouveaux = [];
  for (const s of ecoles) {
    if (s.codeCs && !refs.has('cs:' + s.codeCs)) { const r = { id: 'eg-cs-' + s.codeCs, type: 'cs', code: s.codeCs, nom: s.nomCs, departement: s.departement }; refs.set('cs:' + s.codeCs, r); nouveaux.push(r); }
    if (s.codeZone && !refs.has('zone:' + s.codeZone)) {
      const z = index.get(parEg.get(s.egId)?.e.zone_id);
      const r = { id: 'eg-zone-' + s.codeZone, type: 'zone', code: s.codeZone, numero: +s.numZone, cs: s.codeCs, nom: z ? z.nom : `Zone ${s.numZone}` };
      refs.set('zone:' + s.codeZone, r); nouveaux.push(r);
    }
  }
  if (nouveaux.length) await db.putMany('ref', nouveaux);
  const persExist = new Map((await db.all('personnel')).map(p => [p.id, p]));
  const agents = [];
  for (const p of persoEG) {
    if (p.actif === false || !parEg.has(p.ecole_id)) continue;
    const { s, e } = parEg.get(p.ecole_id), id = 'eg-' + p.id;
    agents.push({
      ...(persExist.get(id) || { created: nowISO() }), id, egId: p.id, source: 'edugestion',
      nom: majus(p.nom), prenoms: p.prenoms || '', sexe: p.sexe === 'F' ? 'F' : p.sexe === 'M' ? 'M' : '', date_naissance: p.date_naissance || '', lieu_naissance: p.lieu_naissance || '',
      matricule: p.matricule || '', nip: p.nip || '', telephone: p.telephone || '', fonction: FONCTIONS[p.fonction] || 'Autre', statut: categorieAgent(p, e),
      grade: p.grade || '', indice_reel: p.indice_reel ?? '', date_prise_service: p.date_premiere_prise_service || '', date_service_ecole: p.date_arrivee_poste || '',
      schoolId: s.id, ecole: s.nom, codeZone: s.codeZone, numZone: s.numZone, codeCs: s.codeCs, arrondissement: s.arrondissement, departement: s.departement,
    });
  }
  if (agents.length) await db.putMany('personnel', agents);
  await db.setting('integre-synchro', { date: nowISO(), ecoles: ecoles.length, agents: agents.length });
}
