/* République du Bénin — MEMP — Fiches de rapport de rentrée et de fin d'année (EP, EM) au modèle de GESCOL / SCOLARIS
   Les schémas de m_rapports.py (data/rapports.json, produit par tools/exporter-rapports.py) pilotent le formulaire,
   les totaux (T = G + F, ENSEMBLE, a + b), les contrôles de cohérence, le PDF (rempli / vierge) et l'Excel.
   Les valeurs sont gardées dans la fiche (fiche.valeurs, fiche.format = 'gescol') ; une copie au format des anciennes
   fiches (fiche.data, fiche.perso) est recalculée à chaque enregistrement pour les écrans qui les consolident
   (synthèse, effectifs, infrastructures, écoles, CEP, DOSP). Aucune dépendance DOM.
   Conception : Maître Aimé FACHE */
import { db } from './db.js';
import { norm } from './util.js';
import { calculerFiche } from './carriere.js';
import { schemaOf, computeValues, effId } from './effectifs-schema.js';

let _D = null;
export async function chargerRapports() {
  if (_D) return _D;
  _D = await (await fetch('data/rapports.json')).json();
  return _D;
}
export const KIND_DOC = { EP_RENTREE: 'rentree-ep', EP_FIN: 'fin-ep', EM_RENTREE: 'rentree-em', EM_FIN: 'fin-em' };
export const DOC_KIND = Object.fromEntries(Object.entries(KIND_DOC).map(([k, d]) => [d, k]));
export const NIV_EP = ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'];

/* ------------------------------------------------------------------ parcours du schéma (m_rapports) */
export const normaliser = (t) => norm(t);
export function entier(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/ /g, '');
  if (!s || s === '-') return null;
  return /^\d+([.,]0+)?$/.test(s) ? Math.trunc(parseFloat(s.replace(',', '.'))) : null;
}
export function calculsTableau(b) {
  const calc = {}, k = b.k, gs = b.groupes, sous = b.sous;
  for (const [lc] of b.lignes) for (const gr of gs) {
    if (sous) {
      const codes = sous.map(s => s[0]);
      for (const s of codes) {
        const cle = `${k}.${lc}.${gr.c}_${s}`;
        if (gr.total) calc[cle] = gs.filter(x => !x.total).map(x => `${k}.${lc}.${x.c}_${s}`);
        else if (s === 'T' && codes.includes('G') && codes.includes('F')) calc[cle] = [`${k}.${lc}.${gr.c}_G`, `${k}.${lc}.${gr.c}_F`];
      }
    } else {
      const cle = `${k}.${lc}.${gr.c}`;
      if (gr.somme) calc[cle] = gr.somme.map(x => `${k}.${lc}.${x}`);
      else if (gr.total) calc[cle] = gs.filter(x => !x.total).map(x => `${k}.${lc}.${x.c}`);
    }
  }
  return calc;
}
export function* clesTableau(b) {
  for (const [lc, llib] of b.lignes) for (const gr of b.groupes) {
    if (b.sous) for (const [s, slib] of b.sous) yield [`${b.k}.${lc}.${gr.c}_${s}`, `${llib} – ${gr.l} ${slib}`];
    else yield [`${b.k}.${lc}.${gr.c}`, `${llib} – ${gr.l}`];
  }
}
export function* clesStructure(b) {
  for (const n of NIV_EP) yield [`sp.simple.${n}`, `Structure : simple ${n}`];
  yield ['sp.simple.salles', 'Structure : simple – salles utilisées'];
  for (const [c, lib] of b.jumelees) yield [`sp.jumelee.${c}`, `Structure : jumelée ${lib}`];
  yield ['sp.jumelee.salles', 'Structure : jumelée – salles utilisées'];
  for (const n of NIV_EP) yield [`sp.multi.${n}`, `Structure : multigrade ${n}`];
  yield ['sp.multi.salles', 'Structure : multigrade – salles utilisées'];
}
const _calc = {};
export function tousCalculs(D, doc) {
  if (_calc[doc]) return _calc[doc];
  const c = {};
  for (const s of D.schemas[doc]) for (const b of s.blocs) if (b.t === 'tableau') Object.assign(c, calculsTableau(b));
  return (_calc[doc] = c);
}
export function bloc(D, doc, k) {
  for (const s of D.schemas[doc]) for (const b of s.blocs) if (b.k === k && b.t === 'tableau') return b;
  throw new Error('Bloc ' + k);
}
export const blocPersonnel = (D, doc) => { for (const s of D.schemas[doc]) for (const b of s.blocs) if (b.t === 'personnel') return b; return null; };
export function nbLignesPersonnel(D, doc, v) {
  const b = blocPersonnel(D, doc); let n = parseInt(String((v && v.pers_n) || 0), 10); if (!Number.isFinite(n)) n = 0;
  return Math.max(b.min, Math.min(D.pers_max, n));
}
export function champsEditables(D, doc, nPers, v) {
  const calc = tousCalculs(D, doc), out = [], vus = new Set();
  const add = (k, sp) => { if (!vus.has(k)) { vus.add(k); out.push([k, sp]); } };
  for (const s of D.schemas[doc]) for (const b of s.blocs) {
    if (b.t === 'champ' && b.type !== 'titre') add(b.k, b);
    else if (b.t === 'tableau') { for (const [k, lib] of clesTableau(b)) if (!(k in calc)) add(k, { k, lib, type: 'nombre' }); }
    else if (b.t === 'structure_ep') { for (const [k, lib] of clesStructure(b)) add(k, { k, lib, type: 'nombre' }); }
    else if (b.t === 'personnel') {
      const n = nPers ?? nbLignesPersonnel(D, doc, v || {});
      add('pers_n', { k: 'pers_n', lib: "Nombre de lignes de l'état nominatif", type: 'nombre' });
      for (let i = 1; i <= n; i++) for (const col of b.cols) { const k = `pers.${i}.${col.c}`; add(k, { ...col, k, lib: `Personnel, ligne ${i} – ${col.l}` }); }
    }
  }
  return out;
}
export function valeursCalculees(D, doc, v) {
  const calc = tousCalculs(D, doc), memo = {};
  const val = (k) => {
    if (k in memo) return memo[k];
    let r;
    if (k in calc) { const nums = calc[k].map(s => entier(val(s))).filter(n => n !== null); r = nums.length ? String(nums.reduce((a, b) => a + b, 0)) : ''; }
    else r = v[k] === null || v[k] === undefined ? '' : String(v[k]);
    return (memo[k] = r);
  };
  const out = { ...v };
  for (const k of Object.keys(calc)) out[k] = val(k);
  return out;
}
export function valeursCompletes(D, doc, finales) {
  const v = {};
  for (const [k] of champsEditables(D, doc, null, finales)) v[k] = '';
  for (const k of Object.keys(tousCalculs(D, doc))) v[k] = '';
  for (const [k, x] of Object.entries(finales || {})) v[k] = x === null || x === undefined ? '' : String(x);
  return valeursCalculees(D, doc, v);
}
export function lireDate(s) {
  s = String(s || '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s); if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})/.exec(s); if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{4})$/.exec(s); return m ? new Date(+m[1], 0, 1) : null;
}
const dateFr = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
/** [ok, valeur normalisée, message] */
export function validerValeur(spec, brut) {
  const t = spec.type || 'texte';
  if (brut === '-') return [true, '-', ''];
  if (brut.length > 300) return [false, null, 'texte trop long (300 caractères au plus)'];
  if (t === 'nombre') { const n = entier(brut); if (n === null || n > 1e6) return [false, null, `« ${brut} » n'est pas un nombre entier positif`]; return [true, String(n), '']; }
  if (t === 'pct') {
    const x = parseFloat(brut.replace(',', '.').replace('%', '').trim());
    if (!Number.isFinite(x) || !/^\s*\d+([.,]\d+)?\s*%?\s*$/.test(brut)) return [false, null, `« ${brut} » n'est pas un pourcentage`];
    if (x < 0 || x > 100) return [false, null, 'le pourcentage doit être compris entre 0 et 100'];
    return [true, Number.isInteger(x) ? String(x) : x.toFixed(1).replace('.', ','), ''];
  }
  if (t === 'annee') { if (!/^\d{4}$/.test(brut) || +brut < 1850 || +brut > new Date().getFullYear() + 1) return [false, null, `« ${brut} » n'est pas une année valide (4 chiffres)`]; return [true, brut, '']; }
  if (t === 'email') { if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(brut)) return [false, null, `« ${brut} » n'est pas une adresse e-mail valide`]; return [true, brut, '']; }
  if (t === 'date') { const d = lireDate(brut); if (!d) return [false, null, `« ${brut} » n'est pas une date (jj/mm/aaaa)`]; return [true, dateFr(d), '']; }
  if (t === 'choix') { for (const o of spec.options || []) if (normaliser(o) === normaliser(brut)) return [true, o, '']; return [false, null, 'valeur non prévue']; }
  if (t === 'cours') {
    const toks = brut.toUpperCase().split(/[\s,;/+-]+/).filter(Boolean), mauvais = toks.filter(x => !NIV_EP.includes(x));
    if (mauvais.length) return [false, null, `cours inconnu(s) : ${mauvais.join(', ')} (CI, CP, CE1, CE2, CM1, CM2)`];
    return [true, NIV_EP.filter(n => toks.includes(n)).join(', '), ''];
  }
  return [true, brut.replace(/\s+/g, ' '), ''];
}
export const coursDe = (v) => new Set(String(v || '').toUpperCase().split(/[\s,;/+-]+/).filter(Boolean));

/* ------------------------------------------------------------------ contrôles de cohérence (m_rapports.controles) */
export function controles(D, doc, v) {
  const info = D.docs[doc], ep = info.cycle === 'primaire', fin = info.moment === 'fin', out = [];
  const n = (k) => entier(v[k]);
  const cmpLe = (a, b, msg, niveau = 'danger') => { const x = n(a), y = n(b); if (x !== null && y !== null && x > y) out.push([niveau, msg.replace('{x}', x).replace('{y}', y)]); };
  const [ca, co] = ep ? ['classes_autorisees', 'classes_ouvertes'] : ['sections_autorisees', 'sections_ouvertes'];
  cmpLe(co, ca, 'Le nombre de ' + (ep ? 'classes' : 'sections') + ' ouvertes ({x}) dépasse le nombre autorisé ({y}).');
  cmpLe('salles_utilisees', 'salles_existantes', 'Salles de classe utilisées ({x}) supérieures aux salles existantes ({y}).', 'warning');
  for (const k of ['annee_creation', 'annee_extension']) { const a = n(k); if (a && a > new Date().getFullYear()) out.push(['danger', `L'année ${a} (${k.replace(/_/g, ' ')}) est dans le futur.`]); }
  if (n('annee_creation') && n('annee_extension') && n('annee_extension') < n('annee_creation')) out.push(['danger', "L'année d'extension est antérieure à l'année de création."]);
  if (normaliser(v.statut).includes('commun') && !v.initiative) out.push(['warning', "Statut communautaire : précisez l'initiative (rubrique 1.4)."]);
  if (ep) {
    if (v.cantine === 'NON' && v.cantine_fonctionne === 'OUI') out.push(['danger', 'Cantine : « NON » à la première question mais « a fonctionné : OUI ».']);
    if (v.cantine === 'OUI' && v.cantine_fonctionne === 'NON' && !v.cantine_raison) out.push(['warning', "La cantine n'a pas fonctionné : donnez la raison (rubrique 1.7)."]);
    const grp = [...NIV_EP, 'ENS'];
    if (fin) {
      for (const g of grp) for (const s of ['G', 'F', 'T']) {
        const k = (r) => `eff.${r}.${g}_${s}`;
        cmpLe(k('fin'), k('debut'), `${g} ${s} : effectif de fin d'année ({x}) supérieur au début ({y}).`);
        const fi = n(k('fin')), pr = n(k('promus')), re = n(k('red')), de = n(k('debut')), ab = n(k('aband'));
        if (fi !== null && pr !== null && re !== null && pr + re !== fi && g !== 'ENS') out.push(['warning', `${g} ${s} : promus (${pr}) + redoublants (${re}) ≠ effectif de fin d'année (${fi}).`]);
        if (de !== null && fi !== null && ab !== null && fi + ab > de) out.push(['danger', `${g} ${s} : fin d'année (${fi}) + abandons (${ab}) > début d'année (${de}).`]);
      }
    } else {
      for (const g of grp) for (const s of ['G', 'F', 'T']) for (const [r, lib] of [['red', 'redoublants'], ['transf', 'transférés'], ['sans_acte', 'sans acte de naissance'], ['handic', 'handicapés']])
        cmpLe(`eff.${r}.${g}_${s}`, `eff.nb.${g}_${s}`, `${g} ${s} : ${lib} ({x}) supérieurs au nombre d'élèves ({y}).`);
    }
    let totSp = NIV_EP.reduce((a, x) => a + (n(`sp.simple.${x}`) || 0) + (n(`sp.multi.${x}`) || 0), 0);
    totSp += Object.keys(v).filter(k => k.startsWith('sp.jumelee.') && !k.endsWith('salles')).reduce((a, k) => a + (n(k) || 0), 0);
    if (n(co) !== null && totSp && totSp !== n(co)) out.push(['warning', `Structure pédagogique : ${totSp} classe(s) décrite(s) pour ${n(co)} classe(s) ouverte(s).`]);
  } else {
    if (v.gestion === 'oui' && !['g_ape', 'g_ame', 'g_comite'].some(k => v[k] === 'oui') && !v.g_autres) out.push(['warning', 'Structure de gestion collégiale : cochez APE, AME, Comité de direction ou précisez.']);
    if (v.gestion === 'non' && ['g_ape', 'g_ame', 'g_comite'].some(k => v[k] === 'oui')) out.push(['danger', '« Pas de structure de gestion collégiale » mais une structure est cochée (2.7).']);
    if (v.cantine === 'oui' && !v.cantine_organisme) out.push(['warning', "Cantine fonctionnelle : précisez l'organisme de soutien (2.5)."]);
    for (const g of ['pet', 'gra', 'tot']) for (const s of ['F', 'G', 'T']) {
      cmpLe(`rep.besoin.${g}_${s}`, `rep.debut.${g}_${s}`, `Section ${g} ${s} : enfants à besoin spécifique ({x}) > effectif ({y}).`);
      if (fin) cmpLe(`rep.fin.${g}_${s}`, `rep.debut.${g}_${s}`, `Section ${g} ${s} : effectif de fin ({x}) > effectif de début ({y}).`);
    }
  }
  const ts = n('infra.salles.tot');
  if (ts !== null && n('salles_existantes') !== null && ts !== n('salles_existantes')) out.push(['warning', `Infrastructures : ${ts} salle(s) (a+b) pour ${n('salles_existantes')} salle(s) existante(s) déclarée(s).`]);
  const np = nbLignesPersonnel(D, doc, v), noms = [];
  for (let i = 1; i <= np; i++) if (![undefined, null, '', '-'].includes(v[`pers.${i}.nom`])) noms.push(i);
  const dirs = noms.filter(i => normaliser(v[`pers.${i}.fonction`]).startsWith('direct'));
  if (noms.length && dirs.length !== 1) out.push(['warning', `État nominatif : ${dirs.length} directeur(s)/directrice(s) indiqué(s) (1 attendu).`]);
  for (const i of noms) if (!['M', 'F'].includes(v[`pers.${i}.sexe`])) out.push(['warning', `État nominatif, ligne ${i} (${v[`pers.${i}.nom`]}) : sexe non renseigné.`]);
  return out;
}

/* ------------------------------------------------------------------ compatibilité avec les anciennes fiches de l'application
   Paires [clé GESCOL, clé ancienne (fiche.data)] ; le personnel est traité à part (fiche.perso). */
const CORR_CHAMPS = { nom_ecole: 'nom_ecole', annee_creation: 'annee_creation', ref_creation: 'ref_creation', annee_extension: 'annee_extension', ref_extension: 'ref_extension',
  statut: 'statut', initiative: 'initiative', cs: 'circonscription', zone: 'zone', up: 'up', departement: 'departement', commune: 'commune', arrondissement: 'arrondissement',
  village: 'localite', bp: 'bp', telephone: 'tel', email: 'email', fondateur: 'fondateur', directeur_nom: 'directeur', classes_autorisees: 'classes_aut', classes_ouvertes: 'classes_ouv',
  sections_autorisees: 'sections_aut', sections_ouvertes: 'sections_ouv', salles_existantes: 'salles_exist', salles_utilisees: 'salles_util', cantine: 'cantine',
  cantine_fonctionne: 'cantine_fonct', cantine_raison: 'cantine_raison', cantine_organisme: 'cantine_org', lavage: 'lavage', gestion: 'gestion_coll', g_autres: 'sg_autres',
  adresse_postale: 'adresse', contact_directeur: 'contact_dir', ext_autres: 'autres_ext', int_autres: 'autres_int' };
const OUI = (v) => (/^oui$/i.test(v || '') ? 'Oui' : /^non$/i.test(v || '') ? 'Non' : v);
export function correspondances(D, doc) {
  const ep = D.docs[doc].cycle === 'primaire', fin = D.docs[doc].moment === 'fin', P = [];
  if (ep) {
    const rows = fin ? { debut: 'debut', fin: 'fin', promus: 'promus', red: 'redoub', aband: 'aband' } : { nb: 'debut', red: 'redoub', transf: 'transf', sans_acte: 'sans_acte', handic: 'handi' };
    for (const [g, o] of Object.entries(rows)) for (const c of NIV_EP) for (const s of ['G', 'F']) P.push([`eff.${g}.${c}_${s}`, `eff.${o}.${c}.${s}`]);
    const jum = { CI_CP: 'CI', CP_CE1: 'CP', CE1_CE2: 'CE1', CE2_CM1: 'CE2', CM1_CM2: 'CM1' };
    for (const l of ['simple', 'multi']) { for (const c of NIV_EP) P.push([`sp.${l}.${c}`, `struct.${l}.${c}.n`]); P.push([`sp.${l}.salles`, `struct.${l}.salles.n`]); }
    for (const [j, c] of Object.entries(jum)) P.push([`sp.jumelee.${j}`, `struct.jumelee.${c}.n`]);
    P.push(['sp.jumelee.salles', 'struct.jumelee.salles.n']);
    for (const r of ['salles', 'bureau']) for (const [g, o] of [['def', 'a'], ['prov', 'b'], ['sans', 'sans']]) P.push([`infra.${r}.${g}`, `infra.${r}.g.${o}`]);
    for (const [r, o] of [['table_chaise', 'tc'], ['tb2', 'tb2'], ['tb3', 'tb3'], ['bureau', 'bm']]) for (const c of NIV_EP) P.push([`mob.${r}.${c}`, `mob.${o}.${c}.n`]);
    for (const [r, o] of [['fr', 'fr'], ['math', 'maths']]) for (const c of NIV_EP) P.push([`man.${r}.${c}`, `man.${o}.${c}.n`]);
    if (fin) for (const g of ['ag', 'ape', 'cm']) P.push([`gest.nb.${g}`, `fonct.n.${g}.n`]);
    for (const [r, o] of [['insc', 'insc'], ['pres', 'comp'], ['adm', 'adm']]) for (const s of ['G', 'F']) P.push([`cep.${r}.${s}`, `cep.${o}.cep.${s}`]);
  } else {
    const rows = fin ? { debut: 'debut', fin: 'fin', besoin: 'bes', aband: 'aband' } : { debut: 'debut', besoin: 'bes' };
    for (const [g, o] of Object.entries(rows)) for (const c of ['pet', 'gra']) for (const s of ['F', 'G']) P.push([`rep.${g}.${c}_${s}`, `eff.${o}.${c}.${s}`]);
    for (const l of ['simple', 'jumelee', 'multi']) for (const c of ['pet', 'gra', 'salles']) P.push([`sp.${l}.${c}`, `struct.${l}.${c}.n`]);
    for (const [g, o] of [['paeapem', 'paeapem'], ['guides', 'guides'], ['recueils', 'jeux'], ['autres', 'autres']]) P.push([`matped.nb.${g}`, `mat.n.${g}.n`]);
    for (const r of ['salles', 'bureau']) for (const [g, o] of [['def', 'a'], ['prov', 'b'], ['sans', 'sans'], ['cons', 'constr']]) P.push([`infra.${r}.${g}`, `infra.${r}.g.${o}`]);
    for (const [g, o] of [['bur_ens', 'bur'], ['ch_ens', 'chens'], ['armoires', 'arm'], ['tables_jeux', 'tjeux'], ['tablettes', 'tabl'], ['ch_enf', 'chenf'], ['tables_enf', 'tenf'], ['nattes', 'nattes'], ['autre1', 'autres']]) P.push([`mob.nb.${g}`, `mob.n.${g}.n`]);
    for (const [g, o] of [['tourniquet', 'tourn'], ['cage', 'cage'], ['escalier', 'escal'], ['toboggan', 'tobog'], ['bac', 'bac'], ['balancoire', 'balanc'], ['corde', 'corde'], ['tunnel', 'tunnel'], ['poutre', 'poutre'], ['filet', 'filet']]) P.push([`ext.nb.${g}`, `ext.n.${o}.n`]);
    for (const [g, o] of [['peinture', 'piste'], ['encastrement', 'encast'], ['puzzle', 'puzzle'], ['graphisme', 'graph'], ['chevalet', 'chev'], ['muraux', 'muraux'], ['presentoir', 'pres'], ['bricolage', 'brico']]) P.push([`int.nb.${g}`, `int.n.${o}.n`]);
    for (const g of ['ag', 'cm', 'ame', 'ape']) P.push([`gest.nb.${g}`, `fonct.n.${g}.n`]);
  }
  const ks = new Set(champsEditables(D, doc, 1).map(x => x[0]));
  for (const [g, o] of Object.entries(CORR_CHAMPS)) if (ks.has(g)) P.push([g, o]);
  return P;
}
const PERS_CORR = { mat: 'matricule', nom: 'nom', sexe: 'sexe', naiss: 'naiss', dacad: 'dip_ac', dprof: 'dip_pro', grade: 'grade', statut: 'statut', indice: 'indice', afp: 'anc_fp', adep: 'anc_dep',
  aecole: 'anc_ecole', form: 'form_date', fdate: 'form_date', fnature: 'form_nature', vinsp: 'v_insp', vcp: 'v_cp', vdir: 'v_dir', pup: 'part_up', qualite: 'qualite', section: 'section', obs: 'obs' };
/** Valeurs GESCOL → fiche.data et fiche.perso (format des anciennes fiches, pour les consolidations) */
export function versAncien(D, doc, v) {
  const data = {};
  for (const [g, o] of correspondances(D, doc)) { const x = v[g]; if (x !== undefined && x !== null && x !== '' && x !== '-') data[o] = ['cantine', 'cantine_fonctionne', 'lavage', 'gestion'].includes(g) ? OUI(x) : x; }
  if (v.g_ape === 'oui') data.sg_ape = true; if (v.g_ame === 'oui') data.sg_ame = true; if (v.g_comite === 'oui') data.sg_cd = true;
  if (v['cep.insc.G'] !== undefined && D.docs[doc].cycle === 'primaire') { /* déjà repris */ }
  const perso = [], n = nbLignesPersonnel(D, doc, v);
  for (let i = 1; i <= n; i++) {
    const p = {};
    for (const [g, o] of Object.entries(PERS_CORR)) { const x = v[`pers.${i}.${g}`]; if (x !== undefined && x !== '' && x !== '-') p[o] = x; }
    const f = v[`pers.${i}.fonction`] || '';
    p.fonction = /^direct/i.test(f) ? 'Directeur/trice' : (f ? 'Adjoint' : (i === 1 ? 'Directeur/trice' : 'Adjoint'));
    if (v[`pers.${i}.cours`]) p.cours = [...coursDe(v[`pers.${i}.cours`])].filter(c => NIV_EP.includes(c));
    if (p.statut === 'PRIVE') p.statut = 'PRIVE';
    if (p.nom) perso.push(p);
  }
  return { data, perso };
}
/** Ancienne fiche (fiche.data, fiche.perso) → valeurs GESCOL (ouverture d'une fiche d'avant la version 1.11) */
export function depuisAncien(D, doc, fiche) {
  const v = {}, d = fiche.data || {};
  for (const [g, o] of correspondances(D, doc)) {
    let x = d[o]; if (x === undefined || x === null || x === '') continue;
    if (['cantine', 'cantine_fonctionne'].includes(g) && D.docs[doc].cycle === 'primaire') x = /^o/i.test(x) ? 'OUI' : 'NON';
    else if (['cantine', 'lavage', 'gestion'].includes(g)) x = /^o/i.test(x) ? 'oui' : 'non';
    v[g] = String(x);
  }
  if (d.sg_ape) v.g_ape = 'oui'; if (d.sg_ame) v.g_ame = 'oui'; if (d.sg_cd) v.g_comite = 'oui';
  const perso = (fiche.perso || []).filter(p => (p.nom || '').trim());
  perso.forEach((p, k) => {
    const i = k + 1;
    for (const [g, o] of Object.entries(PERS_CORR)) if (p[o] !== undefined && p[o] !== '' && !(g === 'fdate' && D.docs[doc].cycle === 'primaire')) v[`pers.${i}.${g}`] = String(p[o]);
    v[`pers.${i}.fonction`] = /^direct/i.test(p.fonction || '') ? 'Directeur' : 'Adjoint';
    if (Array.isArray(p.cours) && p.cours.length) v[`pers.${i}.cours`] = p.cours.join(', ');
  });
  if (perso.length) v.pers_n = String(perso.length);
  const ks = new Set(champsEditables(D, doc, Math.max(perso.length, 1)).map(x => x[0]));
  for (const k of Object.keys(v)) if (!ks.has(k)) delete v[k];
  return v;
}

/* ------------------------------------------------------------------ valeurs automatiques (identité, personnel, effectifs) */
const REPORT_PREFIXES = ['annee_creation', 'ref_creation', 'annee_extension', 'ref_extension', 'initiative', 'arrondissement', 'village', 'fondateur', 'classes_autorisees',
  'sections_autorisees', 'salles_existantes', 'infra.', 'mob.', 'man.', 'matped', 'mob_autre', 'ext', 'int', 'lavage', 'gestion', 'g_', 'cantine_organisme', 'adresse_postale',
  'contact_directeur', 'cp_zone_num', 'cp_nom', 'rup_nom', 'chef_nom', 'bp', 'telephone', 'email', 'cantine'];
const annees = (v, ref) => { const d = lireDate(v); if (!d || d > ref) return ''; let n = ref.getFullYear() - d.getFullYear(); if (ref.getMonth() < d.getMonth() || (ref.getMonth() === d.getMonth() && ref.getDate() < d.getDate())) n--; return String(n); };
const STATUT_EP = (s) => (/priv/i.test(s || '') ? 'Privé' : /commun/i.test(s || '') ? 'Communautaire' : s ? 'Public' : '');
const STATUT_EM = (s) => (/priv/i.test(s || '') ? 'Privé' : /commun/i.test(s || '') ? 'Centre préscolaire communautaire' : s ? 'Public' : '');

/** {auto, origine} : valeurs proposées (en gris) pour une école, avant les corrections de la fiche */
export async function calculerAuto(D, doc, school, annee, user) {
  const s = school || {}, ep = D.docs[doc].cycle === 'primaire', fin = D.docs[doc].moment === 'fin', a = {}, origine = {};
  const pose = (k, v, o = 'fiche de l’école') => { if (v !== undefined && v !== null && String(v) !== '') { a[k] = String(v); origine[k] = o; } };
  pose('nom_ecole', s.nom); pose('statut', ep ? STATUT_EP(s.secteur) : STATUT_EM(s.secteur)); pose('cs', s.nomCs); pose('zone', s.numZone); pose('up', s.up);
  pose('departement', s.departement); pose('commune', s.commune); pose('arrondissement', s.arrondissement); pose('village', s.localite);
  pose('annee_creation', s.anneeCreation); pose('classes_autorisees', ep ? s.classesAutorisees : ''); pose('directeur_nom', s.directeur);
  if (ep) pose('telephone', s.contact); else pose('contact_directeur', s.contact);
  if (/^o/i.test(s.cantine || '')) pose('cantine', ep ? 'OUI' : 'oui');
  pose('chef_nom', user && user.role === 'CCS' ? `${user.nom || ''} ${user.prenoms || ''}`.trim() : '');
  // personnel enseignant de l'école (menus Personnel enseignant / Saisie manuelle)
  const ref = new Date(+String(annee).slice(0, 4), 11, 31);
  const agents = (await db.all('personnel')).filter(p => p.schoolId === s.id && /^(direct|adjoint|enseign|instit|educat)/.test(norm(p.fonction || ''))).map(p => calculerFiche(p));
  agents.sort((x, y) => (/^direct/i.test(y.fonction || '') - /^direct/i.test(x.fonction || '')) || `${x.nom}`.localeCompare(`${y.nom}`, 'fr'));
  agents.forEach((p, k) => {
    const i = k + 1, P = (c, v) => pose(`pers.${i}.${c}`, v, 'personnel enseignant');
    P('mat', p.matricule); P('nip', p.nip || p.npi); P('nom', `${p.nom || ''} ${p.prenoms || ''}`.trim()); P('sexe', /^f/i.test(p.sexe || '') ? 'F' : /^m/i.test(p.sexe || '') ? 'M' : '');
    const dn = lireDate(p.date_naissance); P('naiss', dn ? dn.getFullYear() : '');
    P('dacad', p.diplome_academique); P('dprof', p.cap === 'oui' ? 'CAP' : p.ceap === 'oui' ? 'CEAP' : (p.diplome_pro || '')); P('grade', p.grade);
    P('statut', p.statut === 'Privé' ? 'PRIVE' : p.statut === 'ACDPCTD' ? 'Autre' : p.statut); P('fonction', /^direct/i.test(p.fonction || '') ? (/trice/i.test(p.fonction) || p.sexe === 'F' ? 'Directrice' : 'Directeur') : 'Adjoint');
    P('indice', p.indice_reel); P('afp', annees(p.date_prise_service, ref)); P('adep', annees(p.date_service_dep, ref)); P('aecole', annees(p.date_service_ecole, ref));
    if (ep) { const cours = [...coursDe(p.cours_tenus)].filter(c => NIV_EP.includes(c)); P('cours', cours.join(', ')); P('form', p.date_derniere_formation ? (() => { const d = lireDate(p.date_derniere_formation); return d ? dateFr(d) : ''; })() : ''); }
    else { const sec = norm(p.cours_tenus || p.section || ''); P('section', /petit/.test(sec) && /grand/.test(sec) ? 'Petits et grands' : /petit/.test(sec) ? 'Petits' : /grand/.test(sec) ? 'Grands' : ''); P('qualite', p.qualite); }
    if (fin) { P('vinsp', p.visites_ccs); P('vcp', p.visites_cp); P('pup', p.participation_up); }
  });
  if (agents.length) pose('pers_n', String(Math.max(agents.length, blocPersonnel(D, doc).min)), 'personnel enseignant');
  const dir = agents.find(p => /^direct/i.test(p.fonction || ''));
  if (dir) { pose('directeur_nom', `${dir.nom || ''} ${dir.prenoms || ''}`.trim(), 'personnel enseignant'); pose('directeur_titre', /trice/i.test(dir.fonction) || dir.sexe === 'F' ? 'Directrice' : 'Directeur', 'personnel enseignant'); }
  if (a.directeur_nom) { pose('par_nom', a.directeur_nom, a.directeur_nom ? origine.directeur_nom : ''); pose('par_fonction', a.directeur_titre || 'Directeur', origine.directeur_nom); }
  // effectifs (menu « Effectifs des apprenants ») : nombre d'élèves en début d'année
  const er = await db.get('effectifs', effId(s.id, annee));
  if (er && er.data && Object.keys(er.data).length) {
    const S = schemaOf(s.cycle), v = computeValues(S, er.data);
    if (ep) for (const c of NIV_EP) for (const x of ['G', 'F']) { const n = v[`tot.${c}.${x}`]; if (n !== undefined) pose(`eff.${fin ? 'debut' : 'nb'}.${c}_${x}`, n, 'effectifs des apprenants'); }
    else for (const [c, g] of [['pet', 'pet'], ['gra', 'gra']]) for (const x of ['G', 'F']) { const n = v[`tot.${c}.${x}`]; if (n !== undefined) pose(`rep.debut.${g}_${x}`, n, 'effectifs des apprenants'); }
    if (!fin && ep) for (const c of NIV_EP) for (const x of ['G', 'F']) for (const [src, dst] of [['redoub', 'red'], ['sans_acte', 'sans_acte'], ['eh_tot', 'handic']]) { const n = v[`${src}.${c}.${x}`]; if (n !== undefined) pose(`eff.${dst}.${c}_${x}`, n, 'effectifs des apprenants'); }
    if (!ep) for (const c of ['pet', 'gra']) for (const x of ['G', 'F']) { const n = v[`eh_tot.${c}.${x}`]; if (n !== undefined) pose(`rep.besoin.${c}_${x}`, n, 'effectifs des apprenants'); }
  }
  // report des renseignements stables : fiche sœur de la même année, puis années précédentes
  const fiches = (await db.all('fiches')).filter(f => f.schoolId === s.id && f.format === 'gescol' && f.valeurs);
  const a0 = +String(annee).slice(0, 4), soeur = DOC_KIND[D.soeur[doc]], meme = DOC_KIND[doc];
  const srcs = [[soeur, annee, true]]; for (let k = 1; k <= 3; k++) { const an = `${a0 - k}-${a0 - k + 1}`; srcs.push([meme, an, false], [soeur, an, false]); }
  for (const [kind, an, memeAnnee] of srcs) {
    const f = fiches.find(x => x.kind === kind && x.annee === an); if (!f) continue;
    for (const [k, val] of Object.entries(f.valeurs)) {
      if (val === '' || val === null || k.startsWith('pers') || (a[k] !== undefined && a[k] !== '')) continue;
      if (!REPORT_PREFIXES.some(p => k.startsWith(p)) && !(memeAnnee && /^(infra|mob|man)\./.test(k))) continue;
      if (k.startsWith('cantine') && k !== 'cantine_organisme' && !memeAnnee) continue;
      a[k] = String(val); origine[k] = `${D.docs[KIND_DOC[kind]].court} ${an}`;
    }
  }
  const ks = new Set(champsEditables(D, doc, Math.max(agents.length, 1)).map(x => x[0]));
  for (const k of Object.keys(a)) if (!ks.has(k)) { delete a[k]; delete origine[k]; }
  return { auto: a, origine, ind: { personnel: agents.length } };
}

/** Contexte complet d'une fiche : valeurs auto, corrections, valeurs finales, contrôles */
export async function contexteFiche(D, fiche, school, user, { figer = false } = {}) {
  const doc = KIND_DOC[fiche.kind];
  const over = fiche.format === 'gescol' ? { ...(fiche.valeurs || {}) } : depuisAncien(D, doc, fiche);
  let auto, origine = {}, ind = {};
  if ((figer || !school) && fiche.instantane) { auto = { ...fiche.instantane }; for (const k of Object.keys(over)) delete auto[k]; }
  else if (!school) auto = {};
  else ({ auto, origine, ind } = await calculerAuto(D, doc, school, fiche.annee, user));
  const fusion = { ...auto, ...over };
  const finales = valeursCalculees(D, doc, fusion);
  return { doc, over, auto, origine, ind, fusion, finales, controles: controles(D, doc, finales), nPers: nbLignesPersonnel(D, doc, fusion) };
}
/** Enregistre les corrections dans la fiche et recalcule la copie au format ancien */
export function appliquer(D, fiche, over, auto) {
  const doc = KIND_DOC[fiche.kind];
  const finales = valeursCalculees(D, doc, { ...auto, ...over });
  const { data, perso } = versAncien(D, doc, finales);
  Object.assign(fiche, { format: 'gescol', valeurs: over, data, perso });
  return finales;
}

/** Taux de remplissage (cases saisissables renseignées, état nominatif compris pour 3 lignes) */
export function tauxRemplissage(D, doc, v) {
  let tot = 0, ok = 0;
  for (const [k] of champsEditables(D, doc, 0)) {
    if (k === 'pers_n' || /^(sig_dir|cachet|cp_|rup_|chef_|par_|date_remplissage|ref_|annee_extension|initiative|cantine_raison|fondateur|g_autres|.*_autres|.*_lib)/.test(k)) continue;
    tot++; if (v[k] !== undefined && v[k] !== null && v[k] !== '') ok++;
  }
  tot += 3; let n = 0; for (let i = 1; i <= D.pers_max; i++) if (v[`pers.${i}.nom`]) n++; ok += Math.min(3, n);
  return tot ? Math.round(ok / tot * 100) : 0;
}
/** Fige une fiche (valeurs calculées + copie au format ancien) avant transmission, sans l'ouvrir */
export async function figerFiche(fiche, user) {
  const D = await chargerRapports(), doc = KIND_DOC[fiche.kind]; if (!doc) return fiche;
  const school = await db.get('schools', fiche.schoolId), C = await contexteFiche(D, fiche, school, user);
  fiche.instantane = appliquer(D, fiche, C.over, C.auto); fiche.completion = tauxRemplissage(D, doc, fiche.instantane);
  return fiche;
}
/** Valeurs finales et origines d'une fiche (exports) */
export async function valeursFiche(fiche, user) {
  const D = await chargerRapports(), doc = KIND_DOC[fiche.kind], school = await db.get('schools', fiche.schoolId);
  const { isEditableStatut } = await import('./workflow.js');
  const C = await contexteFiche(D, fiche, school, user, { figer: !isEditableStatut(fiche.statut) });
  const origine = {};
  for (const k of Object.keys(C.finales)) origine[k] = k in C.over ? 'saisie manuelle' : (C.origine[k] ? `repris de ${C.origine[k]}` : 'Application CP');
  return { D, doc, finales: C.finales, origine, school };
}
