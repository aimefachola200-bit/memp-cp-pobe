/* République du Bénin — MEMP — Accès aux données, rôles, journal, listes de suggestions
   Conception : Maître Aimé FACHE */
import { db } from './db.js';
import { h, uid, nowISO, hashPassword, norm } from './util.js';
import { DEPARTEMENTS } from './refdata.js';
import { VARIANT } from './config.js';

export const ROLES = { ADMIN: 'Administrateur', CP: 'Conseiller Pédagogique', CCS: 'Chef de Circonscription Scolaire' };
export const session = { user: null };

/** Périmètre : ADMIN = tout ; CCS = sa circonscription ; CP = sa zone pédagogique */
export function inScope(user, rec) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role === 'CCS') return !!user.codeCs && (rec.codeCs === user.codeCs || (rec.codeZone || '').startsWith(user.codeCs + '-'));
  if (user.role === 'CP') return !!user.codeZone && rec.codeZone === user.codeZone;
  return false;
}
export const scoped = async (store, user) => (await db.all(store)).filter(r => inScope(user, r));

export async function addLog(user, { action, target, from = '', to = '', comment = '', refId = '' }) {
  await db.put('logs', { id: uid(), date: nowISO(), user: user?.username || '-', role: user?.role || '-', action, target, from, to, comment, refId });
}

export async function seedIfEmpty() {
  if (VARIANT.seed) return seedVariant();
  if (!(await db.count('users'))) {
    const mk = async (u, pw, extra) => ({ id: uid(), username: u, pwd: await hashPassword(pw), actif: true, mustChange: true, created: nowISO(), ...extra });
    await db.putMany('users', [
      await mk('admin', 'admin123', { role: 'ADMIN', nom: 'ADMIN', prenoms: 'Système' }),
      await mk('cp', 'cp123', { role: 'CP', nom: 'DOSSOU', prenoms: 'Paul', codeCp: 'CP-0001', departement: 'ZOU', codeCs: 'CS118', nomCs: 'ZOGBODOMEY', numZone: '1', codeZone: 'CS118-ZP01' }),
      await mk('ccs', 'ccs123', { role: 'CCS', nom: 'HOUNTON', prenoms: 'Marie', departement: 'ZOU', codeCs: 'CS118', nomCs: 'ZOGBODOMEY' }),
    ]);
  }
  if (!(await db.all('ref')).some(r => r.type === 'departement')) {
    await db.putMany('ref', DEPARTEMENTS.map(([code, nom, nbCs, nbZones]) => ({ id: 'dep-' + code, type: 'departement', code, nom, nbCs, nbZones })));
  }
}

/** Application jumelle d'une circonscription : comptes, référentiel, écoles et personnel de départ (premier lancement). */
async function seedVariant() {
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
    await db.putMany('personnel', S.personnel.map(x => ({ ...x, created: nowISO() })));
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

export const schoolLabel = (s) => `${s.nom}${s.code ? ' (' + s.code + ')' : ''}`;
export function ficheOf(kind, school, annee, data, perso) {
  return { id: uid(), kind, annee, schoolId: school.id, schoolCode: school.code || '', schoolNom: school.nom, cycle: school.cycle, codeZone: school.codeZone || '', codeCs: school.codeCs || '', departement: school.departement || '',
    data, perso, statut: 'Brouillon', comment: '', history: [{ date: nowISO(), action: 'Création', by: session.user?.username || '' }], created: nowISO(), updated: nowISO() };
}
export { norm };
