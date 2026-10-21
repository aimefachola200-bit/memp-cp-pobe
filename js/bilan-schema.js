/* République du Bénin — MEMP — Bilan trimestriel / annuel des activités pédagogiques (niveau Zone et niveau CS)
   Canevas inspiré du bilan trimestriel du CS fourni par le Ministère, enrichi : calculs automatiques, consolidation,
   analyses pré-rédigées, annexes photographiques.   Conception : Maître Aimé FACHE — Tél. 01 96 51 03 33 */
import { hasNum, num, norm } from './util.js';

export const PERIODES = { T1: 'Trimestre 1 (Septembre-Octobre-Novembre-Décembre)', T2: 'Trimestre 2 (Janvier-Février-Mars)', T3: 'Trimestre 3 (Avril-Mai-Juin-Juillet)', ANNUEL: 'Bilan annuel' };
export const PERIODES_COURT = { T1: 'Trimestre 1', T2: 'Trimestre 2', T3: 'Trimestre 3', ANNUEL: 'Annuel' };
export const COURS = ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'];
export const TOTAL = '__TOTAL__';
export const NIVEAUX = { ZONE: 'Niveau zone pédagogique (CP)', CS: 'Niveau circonscription scolaire (CCS)' };

/* ---------- colonnes ---------- */
const I = (k) => ({ k });
const C = (k, f) => ({ k, f });
const P = (k, f) => ({ k, f, pct: true });
const n = (v) => (hasNum(v) ? num(v) : null);
export const add = (...a) => { let s = null; for (const x of a) if (x !== null && x !== undefined) s = (s ?? 0) + x; return s; };
export const pct = (a, b) => (a === null || b === null || b === 0 || a === undefined || b === undefined ? null : Math.round(a / b * 10000) / 100);

const trio = (id, title, sub) => ({
  id, rows: 'actors', title,
  cols: [I('p_em'), I('p_ep'), C('p_t', g => add(g('p_em'), g('p_ep'))), I('r_em'), I('r_ep'), C('r_t', g => add(g('r_em'), g('r_ep'))), P('pct', g => pct(g('r_t'), g('p_t')))],
  head: [[{ t: 'ACTEURS (C/CS + CP)', rs: 2 }, { t: 'Programmées', s: 3 }, { t: 'Réalisées', s: 3 }, { t: '% de réalisation', rs: 2 }], [{ t: 'EM' }, { t: 'EP' }, { t: 'Total' }, { t: 'EM' }, { t: 'EP' }, { t: 'Total' }]], sub,
});
const evalTable = (i) => ({
  id: 'ev' + i, rows: 'cours', title: `5. Résultats de l'évaluation d'étape N°${i} — point de l'évaluation`,
  cols: [I('ins_g'), I('ins_f'), C('ins_t', g => add(g('ins_g'), g('ins_f'))), I('cmp_g'), I('cmp_f'), C('cmp_t', g => add(g('cmp_g'), g('cmp_f'))),
    I('par_g'), I('par_f'), C('par_t', g => add(g('par_g'), g('par_f'))), I('min_g'), I('min_f'), C('min_t', g => add(g('min_g'), g('min_f'))),
    P('pr_g', g => pct(g('min_g'), g('cmp_g'))), P('pr_f', g => pct(g('min_f'), g('cmp_f'))), P('pr_t', g => pct(g('min_t'), g('cmp_t'))), I('rf_m'), I('rf_f')],
  head: [[{ t: 'COURS', rs: 2 }, { t: 'INSCRITS', s: 3 }, { t: 'ONT COMPOSÉ', s: 3 }, { t: "Maîtrise partielle / n'ont pas atteint le seuil de réussite", s: 3 }, { t: 'Maîtrise minimale / ont atteint le seuil de réussite', s: 3 }, { t: 'POURCENTAGE DE RÉUSSITE', s: 3 }, { t: 'À RENFORCER', s: 2 }],
    [{ t: 'G' }, { t: 'F' }, { t: 'T' }, { t: 'G' }, { t: 'F' }, { t: 'T' }, { t: 'G' }, { t: 'F' }, { t: 'T' }, { t: 'G' }, { t: 'F' }, { t: 'T' }, { t: 'G' }, { t: 'F' }, { t: 'T' }, { t: 'Maths' }, { t: 'Français' }]],
});

export const TABLES = {
  t1: { id: 't1', rows: 'actors', title: "1. Données statistiques sur le réseau d'animation pédagogique",
    cols: [I('em_e'), I('em_s'), I('ep_e'), I('ep_c'), C('te', g => add(g('em_e'), g('ep_e'))), C('tc', g => add(g('em_s'), g('ep_c'))),
      I('emh'), I('emf'), C('emt', g => add(g('emh'), g('emf'))), I('eph'), I('epf'), C('ept', g => add(g('eph'), g('epf'))), C('th', g => add(g('emh'), g('eph'))), C('tf', g => add(g('emf'), g('epf'))), C('tt', g => add(g('emt'), g('ept'))),
      I('up_ep'), I('up_em'), C('up_t', g => add(g('up_ep'), g('up_em')))],
    head: [[{ t: "ACTEURS DU RÉSEAU D'ANIMATION PÉDAGOGIQUE (C/CS et CP)", rs: 3 }, { t: "TAILLE PHYSIQUE DU RÉSEAU — NOMBRE D'ÉCOLES ET DE CLASSES/SECTIONS", s: 6 }, { t: 'EFFECTIF DES ENSEIGNANTS', s: 9 }, { t: "NOMBRE D'UNITÉS PÉDAGOGIQUES (UP)", s: 3, rs: 2 }],
      [{ t: 'Écoles maternelles', s: 2 }, { t: 'Écoles primaires', s: 2 }, { t: 'TOTAL', s: 2 }, { t: 'Écoles maternelles', s: 3 }, { t: 'Écoles primaires', s: 3 }, { t: 'TOTAL EM + EP', s: 3 }],
      [{ t: 'Écoles' }, { t: 'Sections' }, { t: 'Écoles' }, { t: 'Classes' }, { t: 'Écoles' }, { t: 'Classes' }, { t: 'H' }, { t: 'F' }, { t: 'Total' }, { t: 'H' }, { t: 'F' }, { t: 'Total' }, { t: 'H' }, { t: 'F' }, { t: 'Total' }, { t: 'EP' }, { t: 'EM' }, { t: 'T' }]] },
  t21: trio('t21', '2.1 Visites / inspections de classes'),
  t22: trio('t22', "2.2 Visites d'écoles"),
  t23: trio('t23', '2.3 Suivis / encadrements de directeurs (D/EP, D/EM)'),
  t24: { id: 't24', rows: 'actors', title: "2.4 Séances d'unité pédagogique (UP)", cols: [I('prog'), I('prep'), I('real'), P('pct', g => pct(g('real'), g('prog')))], head: [[{ t: 'ACTEURS (C/CS + CP)' }, { t: 'Programmées' }, { t: 'Préparées' }, { t: 'Réalisées' }, { t: '% de réalisation' }]] },
  t25: { id: 't25', rows: 'actors', title: '2.5 Formations groupées / conférences pédagogiques', cols: [I('prog'), I('real'), P('pct', g => pct(g('real'), g('prog')))], head: [[{ t: 'ACTEURS (C/CS + CP)' }, { t: 'Programmées' }, { t: 'Réalisées' }, { t: '% de réalisation' }]] },
  t31: { id: 't31', rows: 'actors', title: '3.1 Concertations', cols: [I('prog'), I('real'), P('pct', g => pct(g('real'), g('prog')))], head: [[{ t: 'ACTEURS (C/CS + CP)' }, { t: 'Programmées' }, { t: 'Réalisées' }, { t: '% de réalisation' }]] },
  t4: { id: 't4', rows: 'actors', title: '4. Résultats / impact — taux de couverture des activités pédagogiques',
    cols: [C('c1r_em', (g, x) => x('t21', 'r_em')), C('c1r_t', (g, x) => x('t21', 'r_t')), P('c1p_em', (g, x) => pct(x('t21', 'r_em'), x('t1', 'em_s'))), P('c1p_t', (g, x) => pct(x('t21', 'r_t'), x('t1', 'tc'))),
      C('c2r_em', (g, x) => x('t22', 'r_em')), C('c2r_t', (g, x) => x('t22', 'r_t')), P('c2p_em', (g, x) => pct(x('t22', 'r_em'), x('t1', 'em_e'))), P('c2p_t', (g, x) => pct(x('t22', 'r_t'), x('t1', 'te'))),
      C('c3r_em', (g, x) => x('t23', 'r_em')), C('c3r_t', (g, x) => x('t23', 'r_t')), P('c3p_em', (g, x) => pct(x('t23', 'r_em'), x('t1', 'em_e'))), P('c3p_t', (g, x) => pct(x('t23', 'r_t'), x('t1', 'te'))),
      P('c4p', (g, x) => pct(x('t24', 'real'), x('t24', 'prog'))), I('c5b'), P('c5p', (g, x) => pct(g('c5b'), x('t1', 'tt')))],
    head: [[{ t: 'ACTEURS (CCS + CP)', rs: 2 }, { t: '4.1 Visites / inspections de classes', s: 4 }, { t: "4.2 Visites d'école", s: 4 }, { t: '4.3 Suivis / encadrements D/EP - D/EM', s: 4 }, { t: '4.4 UP tenues', s: 1 }, { t: '4.5 Formations groupées / conférences', s: 2 }],
      [{ t: 'Réalisé EM' }, { t: 'Réalisé EM+EP' }, { t: '% EM' }, { t: '% EM+EP' }, { t: 'Réalisé EM' }, { t: 'Réalisé EM+EP' }, { t: '% EM' }, { t: '% EM+EP' }, { t: 'Réalisé EM' }, { t: 'Réalisé EM+EP' }, { t: '% EM' }, { t: '% EM+EP' }, { t: '% couverture' }, { t: 'Bénéficiaires' }, { t: '% couverture' }]],
    notes: ["Formules : visites de classes = réalisées ÷ nombre de classes/sections du réseau ; visites d'école et suivis = réalisés ÷ nombre d'écoles ; UP tenues = réalisées ÷ programmées ; formations = bénéficiaires ÷ effectif des enseignants."] },
  ev1: evalTable(1), ev2: evalTable(2), ev3: evalTable(3),
};
export const ACTIVITY_TABLES = ['t21', 't22', 't23', 't24', 't25', 't31'];
export const SUM_KEYS = { t21: ['p_em', 'p_ep', 'r_em', 'r_ep'], t22: ['p_em', 'p_ep', 'r_em', 'r_ep'], t23: ['p_em', 'p_ep', 'r_em', 'r_ep'], t24: ['prog', 'prep', 'real'], t25: ['prog', 'real'], t31: ['prog', 'real'], t4: ['c5b'] };
export const inputKeys = (tid) => TABLES[tid].cols.filter(c => !c.f).map(c => c.k);

export const rowsOf = (b, spec) => spec.rows === 'cours' ? COURS.map(k => ({ k, l: k })) : b.actors;
export const totalLabel = (b) => b.niveau === 'CS' ? 'TOTAL CS' : 'TOTAL ZONE';
export const showTotal = (b, spec) => spec.rows === 'cours' || b.actors.length > 1;

/** Valeur d'une cellule (saisie ou calculée) ; null si vide */
export function cellValue(b, tid, row, col) {
  const spec = TABLES[tid], c = spec.cols.find(x => x.k === col);
  const g = (k) => cellValue(b, tid, row, k), x = (t2, k) => cellValue(b, t2, row, k);
  if (c.f) return c.f(g, x);
  if (row === TOTAL) { let s = null; for (const r of rowsOf(b, spec)) s = add(s, cellValue(b, tid, r.k, col)); return s; }
  return n(b.data[`${tid}.${row}.${col}`]);
}
export const fmtCell = (v, c) => (v === null || v === undefined ? '' : c && c.pct ? String(v).replace('.', ',') + ' %' : String(v));

/** En-tête à cellules positionnées {t,c,r,s,rs} à partir de lignes d'en-tête (gère rowspan/colspan) */
export function layoutHead(rows) {
  const occ = [], out = [];
  rows.forEach((row, r) => {
    occ[r] = occ[r] || []; let c = 0;
    row.forEach(cell => {
      while (occ[r][c]) c++;
      const s = cell.s || 1, rs = cell.rs || 1; out.push({ t: cell.t, c, r, s, rs });
      for (let i = 0; i < rs; i++) { occ[r + i] = occ[r + i] || []; for (let j = 0; j < s; j++) occ[r + i][c + j] = true; }
      c += s;
    });
  });
  return { cells: out, headRows: rows.length, ncols: Math.max(...out.map(o => o.c + o.s)) };
}

/* ---------- création / consolidation ---------- */
export function newBilan({ niveau, periode, annee, user, zones = 3, zoneNum }) {
  const actors = niveau === 'CS' ? [{ k: 'ccs', l: 'C/CS' }, ...Array.from({ length: zones }, (_, i) => ({ k: 'z' + (i + 1), l: `CP Zone ${i + 1}` }))] : [{ k: 'cp', l: `CP Zone ${zoneNum || user.numZone || ''}`.trim() }];
  return { niveau, periode, annee, actors, data: {}, lists: { autres: [], problemes: [] },
    textes: { quant: '', qual: '', genre: '', champs: '', up: '', conclusion: '', commentaires: '', perspectives: '' },
    entete: { departement: user.departement || '', nomCs: user.nomCs || '', numZone: niveau === 'ZONE' ? (zoneNum || user.numZone || '') : '', auteur: `${user.prenoms || ''} ${user.nom || ''}`.trim(), titreAuteur: niveau === 'CS' ? 'Le Chef de Circonscription Scolaire' : 'Le Conseiller Pédagogique', dateVisite: '', dateBilan: '', lieu: '' },
    codeCs: user.codeCs || '', codeZone: niveau === 'ZONE' ? (user.codeZone || '') : '', departement: user.departement || '', statut: 'Brouillon' };
}
const mergeProblems = (acc, list) => {
  for (const p of list || []) { if (!(p.designation || '').trim()) continue; const k = norm(p.designation), o = acc.find(x => norm(x.designation) === k);
    if (o) { o.ampleur = String(Math.max(num(o.ampleur), num(p.ampleur)) || ''); if (p.obs && !(o.obs || '').includes(p.obs)) o.obs = ((o.obs || '') + ' / ' + p.obs).replace(/^ \/ /, ''); } else acc.push({ ...p }); }
  return acc;
};
const sortProblems = (l) => l.sort((a, b) => num(b.ampleur) - num(a.ampleur));

/** Bilan annuel = consolidation des trimestres (activités cumulées, statistiques du dernier trimestre renseigné) */
export function consolidateAnnual(target, tris) {
  tris = tris.filter(t => t.periode !== 'ANNUEL').sort((a, b) => a.periode.localeCompare(b.periode));
  const keysOf = new Set(tris.flatMap(t => t.actors.map(a => a.k)));
  if (!target.actors.length || target.actors.every(a => !keysOf.has(a.k))) target.actors = tris.length ? JSON.parse(JSON.stringify(tris[tris.length - 1].actors)) : target.actors;
  const d = target.data;
  for (const tid of Object.keys(SUM_KEYS)) for (const a of target.actors) for (const k of SUM_KEYS[tid]) {
    let s = null; for (const t of tris) s = add(s, n(t.data[`${tid}.${a.k}.${k}`])); if (s !== null) d[`${tid}.${a.k}.${k}`] = String(s); else delete d[`${tid}.${a.k}.${k}`];
  }
  const last = [...tris].reverse().find(t => Object.keys(t.data).some(k => k.startsWith('t1.')));
  if (last) { for (const a of target.actors) for (const k of inputKeys('t1')) { const v = last.data[`t1.${a.k}.${k}`]; if (v !== undefined && v !== '') d[`t1.${a.k}.${k}`] = v; else delete d[`t1.${a.k}.${k}`]; } }
  for (const t of tris) { const i = t.periode.slice(1); for (const k of Object.keys(t.data)) if (k.startsWith('ev' + i + '.')) d[k] = t.data[k]; }
  target.lists = { autres: tris.flatMap(t => (t.lists.autres || []).map(x => ({ ...x, periode: x.periode }))), problemes: sortProblems(tris.reduce((acc, t) => mergeProblems(acc, t.lists.problemes), [])) };
  return target;
}
/** Bilan CS = consolidation des bilans de zone (une ligne par CP) */
export function consolidateCS(target, zones) {
  zones = zones.filter(z => z.niveau === 'ZONE');
  const ccs = target.actors.find(a => a.k === 'ccs') || { k: 'ccs', l: 'C/CS' };
  const acts = [ccs]; for (const z of zones.sort((a, b) => String(a.entete.numZone).localeCompare(String(b.entete.numZone), 'fr', { numeric: true }))) acts.push({ k: 'z' + (z.entete.numZone || acts.length), l: `CP Zone ${z.entete.numZone || acts.length}` });
  target.actors = acts; const d = target.data;
  for (const z of zones) { const ak = 'z' + (z.entete.numZone || acts.findIndex(a => a.l.endsWith(String(z.entete.numZone))));
    for (const tid of Object.keys(TABLES)) if (TABLES[tid].rows === 'actors') for (const k of inputKeys(tid)) { const v = z.data[`${tid}.${z.actors[0].k}.${k}`]; if (v !== undefined && v !== '') d[`${tid}.${ak}.${k}`] = v; } }
  for (const i of [1, 2, 3]) for (const c of COURS) for (const k of inputKeys('ev' + i)) { let s = null; for (const z of zones) s = add(s, n(z.data[`ev${i}.${c}.${k}`])); if (s !== null) d[`ev${i}.${c}.${k}`] = String(s); }
  target.lists = { autres: zones.flatMap(z => (z.lists.autres || []).map(x => ({ ...x, lieu: `[Zone ${z.entete.numZone}] ${x.lieu || ''}`.trim() }))), problemes: sortProblems(zones.reduce((acc, z) => mergeProblems(acc, z.lists.problemes), [])) };
  return target;
}

/* ---------- analyses pré-rédigées (à relire et ajuster par l'auteur) ---------- */
const f1 = (v) => v === null || v === undefined ? '…' : String(v).replace('.', ',');
export function draftAnalysis(b) {
  const T = (t, k) => cellValue(b, t, TOTAL, k), out = {};
  const eid = b.periode === 'T2' ? 'ev2' : b.periode === 'T3' ? 'ev3' : 'ev1';
  const ev = (k) => T(eid, k);
  if (ev('ins_t') !== null) {
    out.quant = `L'effectif total des élèves inscrits pour l'évaluation s'élève à ${f1(ev('ins_t'))} apprenants. ${f1(ev('cmp_t'))} élèves ont effectivement composé (Garçons : ${f1(ev('cmp_g'))} ; Filles : ${f1(ev('cmp_f'))}). En termes de performance, ${f1(ev('min_t'))} apprenants ont atteint la maîtrise minimale, soit un taux global de réussite de ${f1(ev('pr_t'))} % (Garçons : ${f1(ev('pr_g'))} % ; Filles : ${f1(ev('pr_f'))} %).`;
    const g = ev('pr_g'), fl = ev('pr_f');
    out.genre = g === null || fl === null ? '' : Math.abs(g - fl) < 1 ? `Les performances des filles (${f1(fl)} %) et des garçons (${f1(g)} %) sont quasi équivalentes.` : `Dans l'ensemble, les ${fl > g ? 'filles' : 'garçons'} sont ${Math.abs(g - fl) < 5 ? 'légèrement ' : ''}plus performant(e)s que les ${fl > g ? 'garçons' : 'filles'} (${f1(fl > g ? fl : g)} % contre ${f1(fl > g ? g : fl)} %).`;
    const rows = COURS.map(c => ({ c, v: cellValue(b, eid, c, 'pr_t') })).filter(r => r.v !== null).sort((a, b2) => a.v - b2.v);
    out.qual = `Le taux de réussite est de ${f1(ev('pr_t'))} %. ${rows.length ? `Les résultats les plus faibles sont observés au ${rows[0].c} (${f1(rows[0].v)} %) et les meilleurs au ${rows[rows.length - 1].c} (${f1(rows[rows.length - 1].v)} %). ` : ''}${ev('rf_f') !== null || ev('rf_m') !== null ? `Au total, ${f1(ev('rf_f'))} apprenants sont à renforcer en Français et ${f1(ev('rf_m'))} en Mathématiques.` : ''}`.trim();
  }
  const lines = [];
  for (const [t, lab] of [['t21', 'visites/inspections de classes'], ['t22', "visites d'écoles"], ['t23', 'suivis/encadrements de directeurs'], ['t24', "séances d'UP"], ['t25', 'formations groupées/conférences pédagogiques'], ['t31', 'concertations']]) {
    const p = T(t, t === 't24' || t === 't25' || t === 't31' ? 'pct' : 'pct'); if (p !== null) lines.push(`${lab} : ${f1(p)} % de réalisation${p < 70 ? ' (insuffisant, à rattraper)' : ''}`);
  }
  out.commentaires = lines.length ? `Taux de réalisation des activités programmées — ${lines.join(' ; ')}.` : '';
  out.conclusion = ev('pr_t') !== null ? (ev('pr_t') >= 60 ? 'En général, les résultats sont satisfaisants. Toutefois, un effort pédagogique supplémentaire est nécessaire afin de renforcer durablement les compétences de base des apprenants.' : 'Les résultats sont en deçà des attentes. Un renforcement des capacités des enseignants et un suivi rapproché des classes sont nécessaires.') : '';
  return out;
}

/** Contrôles de cohérence affichés avant transmission */
export function checks(b) {
  const w = [];
  for (const t of ['t21', 't22', 't23']) { const r = cellValue(b, t, TOTAL, 'r_t'), p = cellValue(b, t, TOTAL, 'p_t'); if (r !== null && p !== null && r > p) w.push(`${TABLES[t].title} : le nombre de réalisées (${r}) dépasse le programmé (${p}).`); }
  for (const e of ['ev1', 'ev2', 'ev3']) for (const c of COURS) { const i = cellValue(b, e, c, 'ins_t'), m = cellValue(b, e, c, 'cmp_t'), a = cellValue(b, e, c, 'min_t'); if (i !== null && m !== null && m > i) w.push(`Évaluation ${e.slice(2)} — ${c} : « ont composé » > « inscrits ».`); if (m !== null && a !== null && a > m) w.push(`Évaluation ${e.slice(2)} — ${c} : « ont atteint le seuil » > « ont composé ».`); }
  return w;
}
export const bilanLabel = (b) => `${b.niveau === 'CS' ? 'Bilan CS' : 'Bilan zone'} — ${PERIODES_COURT[b.periode]} ${b.annee}`;
