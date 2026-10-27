/* République du Bénin — MEMP — Accès aux données, rôles, journal, listes de suggestions
   Conception : Maître Aimé FACHE */
import { db } from './db.js';
import { h, uid, nowISO, hashPassword, norm } from './util.js';
import { DEPARTEMENTS } from './refdata.js';
import { VARIANT } from './config.js';

export const ROLES = { ADMIN: 'Administrateur', CP: 'Conseiller Pédagogique', CCS: 'Chef de Circonscription Scolaire', DDEMP: 'Direction départementale (DDEMP)', DOSP: "Chef de la Division de l'Organisation Scolaire et de la Prévision (DOSP)" };
const sansAccentMaj = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
export const session = { user: null };

/** Périmètre : ADMIN = tout ; DDEMP = son département (consultation) ; CCS = sa circonscription ; CP = sa zone pédagogique */
export function inScope(user, rec) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role === 'DDEMP') return (!!rec.codeCs && (user.csCodes || []).includes(rec.codeCs)) || (!!user.departement && sansAccentMaj(rec.departement) === sansAccentMaj(user.departement));
  if (user.role === 'DOSP') return !!user.codeCs && (rec.codeCs === user.codeCs || (rec.codeZone || '').startsWith(user.codeCs + '-'));
  if (user.role === 'CCS') return !!user.codeCs && (rec.codeCs === user.codeCs || (rec.codeZone || '').startsWith(user.codeCs + '-'));
  if (user.role === 'CP') return !!user.codeZone && rec.codeZone === user.codeZone;
  return false;
}
/** Enregistrements du périmètre. Les écoles « ne fonctionnant plus » (rubrique ne_fonctionne_plus) et leurs fiches, effectifs,
    recensements et rapports sortent des listes, de la génération des fiches et des totaux ; { inactives: true } les garde. */
const STORES_ECOLE = ['fiches', 'effectifs', 'recensements', 'classReports'];
export async function scoped(store, user, { inactives = false } = {}) {
  const rows = (await db.all(store)).filter(r => inScope(user, r));
  if (inactives || (store !== 'schools' && !STORES_ECOLE.includes(store))) return rows;
  if (store === 'schools') return rows.filter(s => s.rubrique !== 'ne_fonctionne_plus');
  const fermees = new Set((await db.all('schools')).filter(s => s.rubrique === 'ne_fonctionne_plus').map(s => s.id));
  return fermees.size ? rows.filter(r => !fermees.has(r.schoolId)) : rows;
}

export async function addLog(user, { action, target, from = '', to = '', comment = '', refId = '' }) {
  await db.put('logs', { id: uid(), date: nowISO(), user: user?.username || '-', role: user?.role || '-', action, target, from, to, comment, refId });
}

/** Zone de chaque agent = zone d'appartenance de son école ; sans école (ou école sans zone), la zone attribuée à l'agent.
    Appelée à chaque démarrage : un agent suit automatiquement son école quand la zone de l'école change. */
export async function synchroZonesPersonnel() {
  const ecoles = new Map((await db.all('schools')).map(x => [x.id, x]));
  const maj = [];
  for (const p of await db.all('personnel')) {
    const e = p.schoolId && ecoles.get(p.schoolId);
    if (e && e.codeZone && (p.codeZone !== e.codeZone || String(p.numZone || '') !== String(e.numZone || ''))) maj.push({ ...p, codeZone: e.codeZone, numZone: e.numZone || '', arrondissement: p.arrondissement || e.arrondissement || '' });
  }
  if (maj.length) await db.putMany('personnel', maj);
  return maj.length;
}

export async function seedIfEmpty() {
  try { await seedIfEmpty0(); } finally { try { await synchroZonesPersonnel(); } catch (e) { console.warn('Zones du personnel', e); } }
}
async function seedIfEmpty0() {
  if (VARIANT.seed) {
    await seedVariant();
    // zones, unités pédagogiques, effectifs et personnel de la circonscription (bloc « officiel ») : cases vides, une fois
    try { const { migrerOfficiel } = await import('./officiel-cs.js'); await migrerOfficiel(); } catch (e) { console.warn('Données de la CS', e); }
    return;
  }
  // intégrée à ÉduGestion : les comptes viennent d'ÉduGestion, aucun compte de démonstration
  if (!VARIANT.integre && !(await db.count('users'))) {
    const mk = async (u, pw, extra) => ({ id: uid(), username: u, pwd: await hashPassword(pw), actif: true, mustChange: true, created: nowISO(), ...extra });
    await db.putMany('users', [
      await mk('admin', 'admin123', { role: 'ADMIN', nom: 'ADMINISTRATEUR', prenoms: '' }),
      await mk('cp', 'cp123', { role: 'CP', nom: 'CONSEILLER PÉDAGOGIQUE', prenoms: '', codeCp: 'CP-0001', departement: 'ZOU', codeCs: 'CS118', nomCs: 'ZOGBODOMEY', numZone: '1', codeZone: 'CS118-ZP01' }),
      await mk('ccs', 'ccs123', { role: 'CCS', nom: 'CHEF DE CIRCONSCRIPTION', prenoms: '', departement: 'ZOU', codeCs: 'CS118', nomCs: 'ZOGBODOMEY' }),
      ...(VARIANT.profil === 'dosp' ? [await mk('dosp', 'dosp123', { role: 'DOSP', nom: 'CHEF DE LA DOSP', prenoms: '', departement: 'PLATEAU', codeCs: 'CSPOBE', nomCs: 'POBE' })] : []),
    ]);
  }
  // comptes de départ des versions précédentes : noms de personnes fictives remplacés par la fonction (une fois)
  if (!(await db.setting('comptes-fictifs-retires'))) {
    const FICTIFS = { cp: ['DOSSOU', 'Paul', 'CONSEILLER PÉDAGOGIQUE'], ccs: ['HOUNTON', 'Marie', 'CHEF DE CIRCONSCRIPTION'], dosp: ['AGOSSOU', 'Rémi', 'CHEF DE LA DOSP'], admin: ['ADMIN', 'Système', 'ADMINISTRATEUR'] };
    const maj = (await db.all('users')).filter(x => FICTIFS[x.username] && x.nom === FICTIFS[x.username][0] && x.prenoms === FICTIFS[x.username][1]).map(x => ({ ...x, nom: FICTIFS[x.username][2], prenoms: '' }));
    if (maj.length) await db.putMany('users', maj);
    await db.setting('comptes-fictifs-retires', true);
  }
  if (!(await db.all('ref')).some(r => r.type === 'departement')) {
    await db.putMany('ref', DEPARTEMENTS.map(([code, nom, nbCs, nbZones]) => ({ id: 'dep-' + code, type: 'departement', code, nom, nbCs, nbZones })));
  }
}

/** Application jumelle d'une circonscription : comptes, référentiel, écoles et personnel de départ (premier lancement). */
async function seedVariant() {
  // CS Pobè, première publication (17/10/2026) : 5 zones calquées sur les arrondissements → 3 zones pédagogiques à renseigner
  const refs = await db.all('ref');
  if (VARIANT.id === 'pobe' && refs.some(r => r.type === 'zone' && r.code === 'CSPOBE-ZP05')) {
    const S = await (await fetch(VARIANT.seed)).json();
    await db.delMany('ref', refs.filter(r => r.type === 'zone').map(r => r.id));
    await db.putMany('ref', S.ref.filter(r => r.type === 'zone').map(r => ({ id: uid(), ...r })));
    const arr = new Map(S.schools.map(x => [x.id, x.arrondissement]));
    await db.putMany('schools', (await db.all('schools')).map(x => (/^CSPOBE-ZP0[1-5]$/.test(x.codeZone || '') ? { ...x, numZone: '', codeZone: '' } : x)));
    await db.putMany('personnel', (await db.all('personnel')).map(x => ({ ...x, numZone: '', codeZone: '', arrondissement: arr.get(x.schoolId) || x.arrondissement || '' })));
    const anciens = (await db.all('users')).filter(x => /^cp\.(ahoyeye|igana|issaba|pobe|towe)$/.test(x.username));
    await db.delMany('users', anciens.map(x => x.id));
    const cps = [];
    for (const c of S.comptes.filter(c => c.profil.role === 'CP')) if (!(await db.all('users')).some(x => x.username === c.username)) cps.push({ id: uid(), username: c.username, pwd: await hashPassword(c.mdp), actif: true, mustChange: true, created: nowISO(), ...c.profil });
    await db.putMany('users', cps);
  }
  // DOSP : rattachement à la CS Pobè (référentiel, comptes de départ) des installations sans école, une seule fois
  if (VARIANT.profil === 'dosp' && !(await db.setting('dosp-pobe'))) {
    const S = await (await fetch(VARIANT.seed)).json(), cs = S.ref.find(r => r.type === 'cs');
    if (!(await db.count('schools'))) {
      const refs = await db.all('ref');
      const manque = S.ref.filter(r => !refs.some(x => x.type === r.type && (x.code || x.nom) === (r.code || r.nom)));
      if (refs.some(r => r.type === 'departement')) await db.putMany('ref', manque.map(r => ({ id: uid(), ...r })));
      const comptes = new Map(S.comptes.map(c => [c.username, c.profil]));
      const maj = (await db.all('users')).filter(x => comptes.has(x.username) && x.role !== 'ADMIN' && cs && x.codeCs !== cs.code)
        .map(x => { const p = { ...comptes.get(x.username) }; delete p.nom; delete p.prenoms; return { ...x, ...p }; });
      if (maj.length) await db.putMany('users', maj);
    }
    await db.setting('dosp-pobe', nowISO());
  }
  const besoin = !(await db.count('users')) || !(await db.all('ref')).some(r => r.type === 'departement')
    || (!(await db.count('schools')) && !(await db.setting('seed-ecoles'))) || (!(await db.count('personnel')) && !(await db.setting('seed-personnel')));
  if (!besoin) return;
  const S = await (await fetch(VARIANT.seed)).json();
  if (!(await db.all('ref')).some(r => r.type === 'departement')) {
    await db.putMany('ref', DEPARTEMENTS.map(([code, nom, nbCs, nbZones]) => ({ id: 'dep-' + code, type: 'departement', code, nom, nbCs, nbZones })));
    await db.putMany('ref', S.ref.map(r => ({ id: uid(), ...r })));
  }
  if (!(await db.count('users'))) {
    const out = [];
    for (const c of S.comptes) out.push({ id: uid(), username: c.username, pwd: await hashPassword(c.mdp), actif: true, mustChange: true, created: nowISO(), ...c.profil });
    await db.putMany('users', out);
  }
  if (!(await db.count('schools')) && !(await db.setting('seed-ecoles'))) {
    await db.putMany('schools', S.schools.map(x => ({ ...x, created: nowISO() })));
    await db.setting('seed-ecoles', nowISO());
  }
  if (!(await db.count('personnel')) && !(await db.setting('seed-personnel'))) {
    await db.putMany('personnel', (S.personnel || []).map(x => ({ ...x, created: nowISO() })));
    await db.setting('seed-personnel', nowISO());
  }
}

/** Listes de suggestions (datalist) alimentées par le référentiel et les écoles */
export async function refreshDatalists() {
  const ref = await db.all('ref'), schools = await db.all('schools');
  const holder = document.getElementById('dl-holder'); if (!holder) return;
  const uniq = (a) => [...new Set(a.filter(Boolean))].sort((x, y) => x.localeCompare(y, 'fr'));
  const lists = {
    'dl-departement': uniq([...ref.filter(r => r.type === 'departement').map(r => r.nom), ...schools.map(s => s.departement)]),
    'dl-commune': uniq([...ref.filter(r => r.type === 'commune').map(r => r.nom), ...schools.map(s => s.commune)]),
    'dl-arrondissement': uniq([...ref.filter(r => r.type === 'arrondissement').map(r => r.nom), ...schools.map(s => s.arrondissement)]),
    'dl-localite': uniq([...ref.filter(r => r.type === 'localite').map(r => r.nom), ...schools.map(s => s.localite)]),
    'dl-cs': uniq([...ref.filter(r => r.type === 'cs').map(r => r.nom), ...schools.map(s => s.nomCs)]),
    'dl-cscode': uniq(ref.filter(r => r.type === 'cs').map(r => r.code)),
    'dl-zonecode': uniq(ref.filter(r => r.type === 'zone').map(r => r.code)),
    'dl-up': uniq([...ref.filter(r => r.type === 'up').map(r => r.nom), ...schools.map(s => s.up)]),
  };
  holder.replaceChildren(...Object.entries(lists).map(([id, vals]) => h('datalist', { id }, vals.map(v => h('option', { value: v })))));
}

/* ---------- Regroupement des écoles et du personnel ----------
   « zone » : par zone pédagogique ; une école dont la zone n'est pas encore renseignée reste dans son arrondissement
   et passe dans sa zone dès que celle-ci est saisie. « arr » : par arrondissement (vue de la circonscription). */
export const modeGroupeDefaut = (u) => u.role === 'CP' ? 'zone' : 'arr';
export function cleGroupe(rec, mode) {
  if (mode === 'arr') return rec.arrondissement ? 'a:' + rec.arrondissement : rec.codeZone ? 'z:' + rec.codeZone : 'cs';
  return rec.codeZone ? 'z:' + rec.codeZone : rec.arrondissement ? 'a:' + rec.arrondissement : 'cs';
}
export function libGroupe(k, zonesRef, mode, libCs = 'Circonscription') {
  if (k === 'cs') return libCs;
  if (k.startsWith('z:')) { const c = k.slice(2), z = zonesRef.find(x => x.code === c); return z ? (z.nom || `Zone ${z.numero}`) : 'Zone ' + c.split('-ZP').pop(); }
  return mode === 'arr' ? k.slice(2) : `${k.slice(2)} (zone non renseignée)`;
}
export const ordreGroupe = (a, b) => (a[0] === 'c') - (b[0] === 'c') || (a[0] === 'a') - (b[0] === 'a') || a.localeCompare(b, 'fr', { numeric: true });

export const schoolLabel = (s) => `${s.nom}${s.code ? ' (' + s.code + ')' : ''}`;
export function ficheOf(kind, school, annee, data, perso) {
  return { id: uid(), kind, annee, schoolId: school.id, schoolCode: school.code || '', schoolNom: school.nom, cycle: school.cycle, codeZone: school.codeZone || '', codeCs: school.codeCs || '', departement: school.departement || '',
    data, perso, ...(/_(RENTREE|FIN)$/.test(kind) ? { format: 'gescol', valeurs: {} } : {}), statut: 'Brouillon', comment: '', history: [{ date: nowISO(), action: 'Création', by: session.user?.username || '' }], created: nowISO(), updated: nowISO() };
}
export { norm };
