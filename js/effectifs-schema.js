/* République du Bénin — MEMP — Effectifs des apprenants
   Modèle repris des fiches de recensement annuel 2025-2026 :
   · Écoles primaires : rubrique 7 « Effectifs des apprenants » (7.1 global, 7.2 nouveaux inscrits au CI, 7.3 répartition par âge, genre et année d'étude)
   · Écoles maternelles : rubrique 3 « Répartition des enfants par section et par âge »
   Calculs, contrôles de cohérence, préremplissage depuis les fiches et consolidation (zone, CS). Aucune dépendance DOM. */
import { hasNum, num, nowISO, uid } from './util.js';
import { gridValue, sectionsFor } from './schema.js';

export const SEXES = ['G', 'F'];
export const ENS = 'ENS';
const CLS = ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'];
const R = (k, l, x = {}) => ({ k, l, ...x });

/* ---------------- Écoles primaires ---------------- */
const AGES_EP = [['m5', 'Moins de 5 ans'], ['5', '5 ans'], ['6', '6 ans'], ['7', '7 ans'], ['8', '8 ans'], ['9', '9 ans'], ['10', '10 ans'],
  ['11', '11 ans'], ['12', '12 ans'], ['13', '13 ans'], ['14', '14 ans'], ['15', '15 ans'], ['16p', '16 ans et plus']];
const NI_AGES = [['m45', 'Moins de 4 ans et demi'], ['45', '4 ans et demi'], ['5', '5 ans'], ['6', '6 ans'], ['7', '7 ans'], ['8', '8 ans'], ['9p', '9 ans et plus']];

const EP = {
  id: 'EP', cycle: 'Primaire', court: 'EP', label: 'Écoles primaires',
  direction: "DIRECTION DE L'ENSEIGNEMENT PRIMAIRE",
  titre: 'FICHE DE RECENSEMENT ANNUEL DES ÉCOLES PRIMAIRES', sousTitre: 'EFFECTIFS DES APPRENANTS (rubrique 7)',
  globalTitle: '7.1 Effectif global', sexName: { G: 'Garçons', F: 'Filles' }, sexLabel: { G: 'G', F: 'F' },
  cols: CLS.map(c => ({ k: c, l: c })), ensCols: CLS, saisieCols: CLS,
  rows: [
    ...NI_AGES.map(([a, l]) => R('ni.' + a, l, { cols: ['CI'], input: true })),
    R('ni_tot', 'Total des nouveaux inscrits au CI', { cols: ['CI'], calc: 'sum:' + NI_AGES.map(([a]) => 'ni.' + a).join(',') }),
    R('ni_mat', "Nouveaux inscrits au CI ayant suivi l'enseignement maternel (tous âges confondus)", { cols: ['CI'], input: true }),
    R('ni_mat6', '  dont ayant 6 ans', { cols: ['CI'], input: true }),
    ...AGES_EP.map(([a, l]) => R('age.' + a, l, { input: true, sec: 'age' })),
    R('tot', 'TOTAL (effectif par classe)', { calc: 'ageSum' }),
    R('dir', "Effectif par classe — saisie directe (si la répartition par âge n'est pas disponible)", { input: true }),
    R('redoub', 'Total des redoublants', { input: true }),
    R('red6', 'Redoublants ayant 6 ans', { input: true }),
    R('red11', 'Redoublants ayant 11 ans', { input: true }),
    R('etr', 'Dont étrangers (enfants non Béninois)', { input: true }),
    R('orph_h', 'Orphelins handicapés', { input: true }),
    R('orph_nh', 'Orphelins non handicapés', { input: true }),
    R('vuln', 'Autres enfants vulnérables', { input: true }),
    R('eh_mot', 'Handicap moteur', { input: true }),
    R('eh_vis', 'Handicap visuel', { input: true }),
    R('eh_aud', 'Handicap auditif', { input: true }),
    R('eh_int', 'Handicap intellectuel', { input: true }),
    R('eh_tot', 'Total des enfants handicapés', { calc: 'sum:eh_mot,eh_vis,eh_aud,eh_int' }),
    R('sans_acte', 'Élèves sans acte de naissance', { input: true }),
    R('nouv_autre', "Nouveaux élèves venus d'une autre école", { input: true }),
    R('grossesse', 'Cas de grossesse', { input: true, sexOnly: 'F' }),
  ],
  blocks: [
    { id: 'ni', title: "7.2 Nouveaux inscrits au CI (selon le genre et par âge)", cols: ['CI'], groups: [
      { title: 'i. Répartition selon le genre et par âge', rows: [...NI_AGES.map(([a]) => 'ni.' + a), 'ni_tot'] },
      { title: "ii. Nouveaux inscrits au CI ayant suivi l'enseignement maternel", rows: ['ni_mat', 'ni_mat6'] }] },
    { id: 'mat', title: "7.3 Répartition des élèves par âge, selon le genre et par année d'étude", cols: [...CLS, ENS], groups: [
      { title: 'Répartition par âge', rows: [...AGES_EP.map(([a]) => 'age.' + a), 'tot'] },
      { title: "Effectif par classe — saisie directe (à utiliser seulement si la répartition par âge n'est pas disponible)", rows: ['dir'] },
      { title: 'Dont redoublants', rows: ['redoub', 'red6', 'red11'] },
      { title: 'Dont étrangers', rows: ['etr'] },
      { title: 'Dont orphelins ou enfants vulnérables', rows: ['orph_h', 'orph_nh', 'vuln'] },
      { title: 'Dont enfants handicapés (par type de handicap)', rows: ['eh_mot', 'eh_vis', 'eh_aud', 'eh_int', 'eh_tot'] },
      { title: 'Autres informations', rows: ['sans_acte', 'nouv_autre', 'grossesse'] }] },
  ],
};

/* ---------------- Écoles maternelles ---------------- */
const AGES_EM = [['m2', 'Moins de 2 ans 1/2'], ['2', '2 ans 1/2 à 3 ans'], ['3', '3 ans'], ['4', '4 ans'], ['5', '5 ans'], ['p5', 'Plus de 5 ans']];
const EM = {
  id: 'EM', cycle: 'Maternelle', court: 'EM', label: 'Écoles maternelles',
  direction: "DIRECTION DE L'ENSEIGNEMENT MATERNEL",
  titre: 'FICHE DE RECENSEMENT ANNUEL DES ÉCOLES MATERNELLES', sousTitre: 'RÉPARTITION DES ENFANTS PAR SECTION ET PAR ÂGE (rubrique 3)',
  globalTitle: 'Effectif global', sexName: { G: 'Masculin', F: 'Féminin' }, sexLabel: { G: 'M', F: 'F' },
  cols: [{ k: 'pet', l: 'Section des petits' }, { k: 'gra', l: 'Section des grands' }, { k: 'eh', l: 'Dont enfants handicapés' }], ensCols: ['pet', 'gra'], saisieCols: ['pet', 'gra', 'eh'],
  rows: [
    ...AGES_EM.map(([a, l]) => R('age.' + a, l, { input: true, sec: 'age', cols: ['pet', 'gra', 'eh'] })),
    R('tot', 'TOTAL', { calc: 'ageSum', cols: ['pet', 'gra', 'eh'] }),
    R('dir', "Effectif par section — saisie directe (si la répartition par âge n'est pas disponible)", { input: true, cols: ['pet', 'gra'] }),
    R('orph_h', 'Orphelins handicapés', { input: true, cols: ['pet', 'gra'] }),
    R('orph_nh', 'Orphelins non handicapés', { input: true, cols: ['pet', 'gra'] }),
    R('vuln', 'Autres enfants vulnérables', { input: true, cols: ['pet', 'gra'] }),
    R('eh_mot', 'Handicap moteur', { input: true, cols: ['pet', 'gra'] }),
    R('eh_vis', 'Handicap visuel', { input: true, cols: ['pet', 'gra'] }),
    R('eh_int', 'Handicap intellectuel', { input: true, cols: ['pet', 'gra'] }),
    R('eh_aud', 'Handicap auditif', { input: true, cols: ['pet', 'gra'] }),
    R('eh_aut', 'Autres handicaps', { input: true, cols: ['pet', 'gra'] }),
    R('eh_tot', 'Total des enfants handicapés', { calc: 'sum:eh_mot,eh_vis,eh_int,eh_aud,eh_aut', cols: ['pet', 'gra'] }),
  ],
  blocks: [
    { id: 'rep', title: '3. Répartition des enfants par section et par âge', cols: ['pet', 'gra', ENS, 'eh'], groups: [
      { title: 'Répartition par âge', rows: [...AGES_EM.map(([a]) => 'age.' + a), 'tot'] },
      { title: "Effectif par section — saisie directe (à utiliser seulement si la répartition par âge n'est pas disponible)", rows: ['dir'] },
      { title: 'Dont orphelins ou enfants vulnérables', rows: ['orph_h', 'orph_nh', 'vuln'] },
      { title: 'Dont enfants handicapés (par type de handicap)', rows: ['eh_mot', 'eh_vis', 'eh_int', 'eh_aud', 'eh_aut', 'eh_tot'] }] },
  ],
};

export const SCHEMAS = { EP, EM };
export const schemaOf = (cycle) => (cycle === 'Maternelle' ? EM : EP);
export const rowOf = (S, k) => S.rows.find(r => r.k === k);
export const colLabel = (S, c) => (c === ENS ? 'ENSEMBLE' : (S.cols.find(x => x.k === c) || { l: c }).l);
export const rowCols = (S, row) => row.cols || S.cols.map(c => c.k);
export const inputRows = (S) => S.rows.filter(r => r.input);
/** La case (ligne, colonne, sexe) existe-t-elle dans la fiche ? */
export function applies(S, row, colK, sexK = null) {
  const cols = colK === ENS ? S.ensCols.filter(c => rowCols(S, row).includes(c)) : (rowCols(S, row).includes(colK) ? [colK] : []);
  if (!cols.length) return false;
  if (row.sexOnly && sexK && sexK !== 'T' && sexK !== row.sexOnly) return false;
  return true;
}
export const dataKey = (r, c, s) => `${r}.${c}.${s}`;

/* ---------------- Calculs ---------------- */
const raw = (d, r, c, s) => { const x = d[dataKey(r, c, s)]; return hasNum(x) ? Math.max(0, Math.round(num(x))) : null; };
function rowCell(S, d, row, col, sex) {
  if (row.calc === 'ageSum') {
    let any = false, t = 0;
    for (const a of S.rows) if (a.sec === 'age' && rowCols(S, a).includes(col)) { const v = raw(d, a.k, col, sex); if (v !== null) { any = true; t += v; } }
    if (any) return t;
    return rowCols(S, rowOf(S, 'dir')).includes(col) ? raw(d, 'dir', col, sex) : null;
  }
  if (row.calc && row.calc.startsWith('sum:')) {
    let any = false, t = 0;
    for (const k of row.calc.slice(4).split(',')) { const v = raw(d, k, col, sex); if (v !== null) { any = true; t += v; } }
    return any ? t : null;
  }
  return raw(d, row.k, col, sex);
}
/** Valeurs calculées de toutes les cases réelles (hors ENSEMBLE et T) : { 'ligne.col.sexe': nombre } */
export function computeValues(S, d) {
  const v = {};
  for (const row of S.rows) for (const col of rowCols(S, row)) for (const sex of SEXES) {
    if (row.sexOnly && row.sexOnly !== sex) continue;
    const x = rowCell(S, d || {}, row, col, sex);
    if (x !== null) v[dataKey(row.k, col, sex)] = x;
  }
  return v;
}
export function sumValues(list) {
  const out = {};
  for (const v of list) for (const [k, x] of Object.entries(v)) out[k] = (out[k] || 0) + x;
  return out;
}
/** Valeur affichée : colonne réelle ou ENS, sexe G, F ou T. null = non renseigné. */
export function show(S, v, rowK, colK, sexK) {
  const row = rowOf(S, rowK); if (!row) return null;
  const cols = colK === ENS ? S.ensCols : [colK], sexes = sexK === 'T' ? SEXES : [sexK];
  let any = false, t = 0;
  for (const c of cols) for (const s of sexes) { const x = v[dataKey(rowK, c, s)]; if (x !== undefined) { any = true; t += x; } }
  return any ? t : null;
}
export const orphans = (S, v, sex = 'T') => {
  let any = false, t = 0;
  for (const k of ['orph_h', 'orph_nh', 'vuln']) { const x = show(S, v, k, ENS, sex); if (x !== null) { any = true; t += x; } }
  return any ? t : null;
};
/** Indicateurs de synthèse d'une fiche ou d'un ensemble consolidé */
export function metrics(S, v) {
  const sh = (r, s = 'T') => (rowOf(S, r) ? show(S, v, r, ENS, s) : null);
  return {
    G: sh('tot', 'G'), F: sh('tot', 'F'), T: sh('tot', 'T'),
    eh: sh('eh_tot') ?? show(S, v, 'tot', 'eh', 'T'),
    redoub: sh('redoub'), etr: sh('etr'), orph: orphans(S, v), sansActe: sh('sans_acte'), nouvAutre: sh('nouv_autre'), grossesse: sh('grossesse', 'F'),
    niCI: sh('ni_tot'),
  };
}
/** Taux de remplissage : cases « total par classe/section × sexe » renseignées */
export function completion(S, v) {
  const cols = S.ensCols; let n = 0, ok = 0;
  for (const c of cols) for (const s of SEXES) { n++; if (v[dataKey('tot', c, s)] !== undefined) ok++; }
  return n ? Math.round(ok / n * 100) : 0;
}
export const hasData = (d) => Object.values(d || {}).some(x => hasNum(x));

/* ---------------- Contrôles de cohérence ---------------- */
export function validate(S, v) {
  const issues = [], g = (r, c, s) => v[dataKey(r, c, s)];
  const sx = (s) => S.sexName[s].toLowerCase();
  const le = (cols, rowK, refK, lvl = 'err') => {
    const row = rowOf(S, rowK), ref = rowOf(S, refK); if (!row || !ref) return;
    for (const c of cols) for (const s of SEXES) {
      const a = g(rowK, c, s), b = g(refK, c, s);
      if (a !== undefined && a > (b ?? 0)) issues.push({ lvl, msg: `${colLabel(S, c)} (${sx(s)}) : « ${row.l.trim()} » (${a}) dépasse « ${ref.l.trim()} » (${b ?? 0}).` });
    }
  };
  const base = S.ensCols;
  if (S.id === 'EP') {
    ['redoub', 'etr', 'eh_tot', 'sans_acte', 'nouv_autre'].forEach(k => le(base, k, 'tot'));
    le(base, 'red6', 'redoub'); le(base, 'red11', 'redoub');
    for (const c of base) for (const s of SEXES) {
      const o = ['orph_h', 'orph_nh', 'vuln'].reduce((a, k) => a + (g(k, c, s) ?? 0), 0), t = g('tot', c, s);
      if (o > 0 && o > (t ?? 0)) issues.push({ lvl: 'err', msg: `${colLabel(S, c)} (${sx(s)}) : orphelins et enfants vulnérables (${o}) supérieurs à l'effectif (${t ?? 0}).` });
    }
    for (const c of base) { const a = g('grossesse', c, 'F'), t = g('tot', c, 'F'); if (a !== undefined && a > (t ?? 0)) issues.push({ lvl: 'err', msg: `${c} : cas de grossesse (${a}) supérieurs à l'effectif des filles (${t ?? 0}).` }); }
    le(['CI'], 'ni_tot', 'tot', 'warn'); le(['CI'], 'ni_mat', 'ni_tot'); le(['CI'], 'ni_mat6', 'ni_mat');
    for (const s of SEXES) { const a = g('ni_mat', 'CI', s), b = g('ni_tot', 'CI', s); if (a !== undefined && b === undefined) issues.push({ lvl: 'warn', msg: `7.2 : renseignez la répartition par âge des nouveaux inscrits au CI (${sx(s)}).` }); }
  } else {
    le(base, 'eh_tot', 'tot');
    for (const c of base) for (const s of SEXES) {
      const o = ['orph_h', 'orph_nh', 'vuln'].reduce((a, k) => a + (g(k, c, s) ?? 0), 0), t = g('tot', c, s);
      if (o > 0 && o > (t ?? 0)) issues.push({ lvl: 'err', msg: `${colLabel(S, c)} (${sx(s)}) : orphelins et enfants vulnérables (${o}) supérieurs à l'effectif (${t ?? 0}).` });
    }
    for (const s of SEXES) {
      const a = show(S, v, 'tot', 'eh', s), b = show(S, v, 'eh_tot', ENS, s);
      if (a !== null && b !== null && a !== b) issues.push({ lvl: 'warn', msg: `Enfants handicapés (${sx(s)}) : ${a} dans la colonne « Dont enfants handicapés » mais ${b} dans le détail par type de handicap.` });
      const eh = show(S, v, 'tot', 'eh', s), t = show(S, v, 'tot', ENS, s);
      if (eh !== null && eh > (t ?? 0)) issues.push({ lvl: 'err', msg: `Enfants handicapés (${sx(s)}) : ${eh} supérieurs à l'effectif (${t ?? 0}).` });
    }
  }
  for (const c of base) for (const s of SEXES) {
    const d = g('dir', c, s), t = g('tot', c, s);
    if (d !== undefined && t !== undefined && d !== t && agesFilled(S, v, c, s)) issues.push({ lvl: 'warn', msg: `${colLabel(S, c)} (${sx(s)}) : l'effectif saisi directement (${d}) diffère de la somme des âges (${t}) ; la somme des âges est retenue.` });
  }
  const m = metrics(S, v);
  if (m.T === null) issues.push({ lvl: 'warn', msg: "Effectif non renseigné : saisissez la répartition par âge (ou l'effectif par " + (S.id === 'EP' ? 'classe' : 'section') + ')' });
  else {
    for (const c of base) for (const s of SEXES) if (v[dataKey('tot', c, s)] === undefined) { issues.push({ lvl: 'warn', msg: `${colLabel(S, c)} (${sx(s)}) : effectif non renseigné.` }); }
  }
  return issues;
}
function agesFilled(S, v, c, s) { return S.rows.some(a => a.sec === 'age' && rowCols(S, a).includes(c) && v[dataKey(a.k, c, s)] !== undefined); }

/* ---------------- Fiche (enregistrement) ---------------- */
export const effId = (schoolId, annee) => `eff-${schoolId}-${annee}`;
export const identOf = (s) => ({ nom: s.nom || '', code: s.code || '', secteur: s.secteur || '', type: s.type || '', departement: s.departement || '', commune: s.commune || '', arrondissement: s.arrondissement || '',
  localite: s.localite || '', nomCs: s.nomCs || '', numZone: s.numZone || '', up: s.up || '', directeur: s.directeur || '', contact: s.contact || '' });
export function newRecord(school, annee, user) {
  const t = nowISO();
  return { id: effId(school.id, annee), kind: 'EFF', annee, schoolId: school.id, schoolCode: school.code || '', schoolNom: school.nom, cycle: school.cycle,
    codeZone: school.codeZone || '', codeCs: school.codeCs || '', departement: school.departement || '', nomCs: school.nomCs || '', numZone: school.numZone || '',
    ident: identOf(school), data: {}, statut: 'Brouillon', comment: '', history: [{ date: t, action: 'Création', by: user?.username || '' }], created: t, updated: t };
}
/** Met à jour l'identité d'une fiche à partir de la fiche école (remplissage automatique) */
export function syncIdent(rec, school) {
  Object.assign(rec, { schoolCode: school.code || '', schoolNom: school.nom, cycle: school.cycle, codeZone: school.codeZone || rec.codeZone, codeCs: school.codeCs || rec.codeCs,
    departement: school.departement || '', nomCs: school.nomCs || '', numZone: school.numZone || '', ident: identOf(school) });
  return rec;
}

/** Effectifs par classe/section tirés des fiches de collecte de l'école (début d'année) : { 'dir.CI.G': n, … } */
export function prefillFromFiches(S, fiches, annee) {
  const out = {}, mine = fiches.filter(f => f.annee === annee);
  if (S.id === 'EP') {
    // fiche de rentrée primaire en priorité (effectifs de début d'année), sinon fiche de fin d'année
    const f = mine.find(x => x.kind === 'EP_RENTREE') || mine.find(x => x.kind === 'EP_FIN'); if (!f) return { data: out, source: null };
    const grid = sectionsFor(f.kind).find(s => s.id === 'eff');
    for (const c of CLS) for (const s of SEXES) { const x = gridValue(f.data, grid, 'debut', c, s); if (x !== null) out[dataKey('dir', c, s)] = x; }
    return { data: out, source: `${f.kind === 'EP_RENTREE' ? 'fiche de rentrée primaire' : "fiche de fin d'année primaire"} (${f.statut || 'Brouillon'})` };
  }
  const f = mine.find(x => x.kind === 'EM_RENTREE') || mine.find(x => x.kind === 'EM_FIN'); if (!f) return { data: out, source: null };
  const grid = sectionsFor(f.kind).find(s => s.id === 'eff');
  for (const [g, col] of [['pet', 'pet'], ['gra', 'gra']]) for (const s of SEXES) { const x = gridValue(f.data, grid, 'debut', g, s); if (x !== null) out[dataKey('dir', col, s)] = x; }
  return { data: out, source: f.kind === 'EM_RENTREE' ? 'fiche de rentrée maternelle' : "fiche de fin d'année maternelle" };
}
/** Applique un préremplissage sans écraser ce que l'utilisateur a déjà saisi (sauf force) */
export function applyPrefill(rec, pre, force = false) {
  let n = 0;
  for (const [k, x] of Object.entries(pre.data)) if (force || !hasNum(rec.data[k])) { if (String(rec.data[k]) !== String(x)) n++; rec.data[k] = x; }
  return n;
}
export const STATUT_FILTERS = { all: 'Toutes les fiches', sent: 'Transmises et validées', valid: 'Validées uniquement' };
export const keepStatut = (f, rec) => f === 'all' || (f === 'sent' ? (rec.statut === 'Transmise' || rec.statut === 'Validée') : rec.statut === 'Validée');

/** Regroupe des fiches par cycle et calcule les valeurs consolidées { EP: v, EM: v, nbEP, nbEM } */
export function consolidate(records) {
  const by = { EP: [], EM: [] };
  for (const r of records) { const S = schemaOf(r.cycle); by[S.id].push(computeValues(S, r.data)); }
  return { EP: sumValues(by.EP), EM: sumValues(by.EM), nbEP: by.EP.length, nbEM: by.EM.length };
}
export const uidEff = uid;

/* ---------------- Statistiques par âge et par classe ---------------- */
const court = (l) => l.replace('Moins de 5 ans', '< 5 ans').replace('16 ans et plus', '16 ans +');
/** Courbe d'âge : effectifs par âge et par sexe, toutes classes (col = null) ou une classe/section */
export function ageSeries(S, v, col = null) {
  const rows = S.rows.filter(r => r.sec === 'age'), cols = col ? [col] : S.ensCols, out = { labels: rows.map(r => court(r.l)), G: [], F: [], T: [] };
  for (const r of rows) {
    let g = 0, f = 0;
    for (const c of cols) { if (!rowCols(S, r).includes(c)) continue; g += v[dataKey(r.k, c, 'G')] || 0; f += v[dataKey(r.k, c, 'F')] || 0; }
    out.G.push(g); out.F.push(f); out.T.push(g + f);
  }
  return out;
}
/* Âge retenu pour l'âge moyen et l'écart type (primaire) : « moins de 5 ans » = 4 ans, « 16 ans et plus » = 16 ans. */
const AGE_NUM_EP = { m5: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, 11: 11, 12: 12, 13: 13, 14: 14, 15: 15, '16p': 16 };
const nAge = (S, v, r, col, sex) => {
  const cols = col === ENS || !col ? S.ensCols : [col];
  let t = 0; for (const c of cols) { if (!rowCols(S, r).includes(c)) continue; t += sex === 'T' ? (v[dataKey(r.k, c, 'G')] || 0) + (v[dataKey(r.k, c, 'F')] || 0) : (v[dataKey(r.k, c, sex)] || 0); }
  return t;
};
/** Âge moyen et écart type (de la population) d'un cours (ou ENS) et d'un sexe ('G', 'F', 'T') : { n, moy, et } — primaire. */
export function ageStats(S, v, col, sex) {
  const rows = S.rows.filter(r => r.sec === 'age'); let n = 0, sm = 0;
  for (const r of rows) { const a = AGE_NUM_EP[r.k.slice(4)]; if (a === undefined) continue; const x = nAge(S, v, r, col, sex); n += x; sm += x * a; }
  if (!n) return { n: 0, moy: null, et: null };
  const moy = sm / n; let q = 0;
  for (const r of rows) { const a = AGE_NUM_EP[r.k.slice(4)]; if (a === undefined) continue; q += nAge(S, v, r, col, sex) * (a - moy) ** 2; }
  return { n, moy, et: Math.sqrt(q / n) };
}
/** Tableau des catégories d'âge (moins de 5 ans … 16 ans et plus) par cours et par sexe, avec pourcentages de la colonne,
    âge moyen et écart type : { cols, lignes:[{ l, cells:{ col: { G:[n,%], F:[n,%], T:[n,%] } } }], tot, stats } */
export function ageTable(S, v) {
  const rows = S.rows.filter(r => r.sec === 'age'), cols = [...S.ensCols, ENS], SX = ['G', 'F', 'T'], tot = {}, stats = {};
  for (const c of cols) { tot[c] = {}; stats[c] = {}; for (const x of SX) { tot[c][x] = rows.reduce((a, r) => a + nAge(S, v, r, c, x), 0); stats[c][x] = ageStats(S, v, c, x); } }
  const lignes = rows.map(r => ({ l: r.l, cells: Object.fromEntries(cols.map(c => [c, Object.fromEntries(SX.map(x => { const n = nAge(S, v, r, c, x); return [x, [n, tot[c][x] ? Math.round(n / tot[c][x] * 1000) / 10 : null]]; }))])) }));
  return { cols, lignes, tot, stats, vide: !tot[ENS].T };
}
/** Synthèse par classe (EP) ou par section (EM) : garçons, filles, total, part des filles, âge le plus fréquent */
export function classSummary(S, v) {
  return S.ensCols.map(c => {
    const G = v[dataKey('tot', c, 'G')] ?? 0, F = v[dataKey('tot', c, 'F')] ?? 0, s = ageSeries(S, v, c), pic = Math.max(0, ...s.T);
    return { col: c, label: colLabel(S, c), G, F, T: G + F, pF: G + F ? Math.round(F / (G + F) * 100) : null, ageModal: pic > 0 ? s.labels[s.T.indexOf(pic)] : '—' };
  });
}
