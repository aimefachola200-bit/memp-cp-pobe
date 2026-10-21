/* République du Bénin — MEMP — Fiches de recensement annuel (écoles primaires, écoles maternelles inclusives)
   Même modèle que GESCOL / SCOLARIS (éditions publique et autonome) : les schémas déclaratifs de m_recensement.py
   (data/recensement.json, produit par tools/exporter-recensement.py) pilotent le formulaire (onglet « Remplir »),
   les calculs (totaux G + F = T, lignes et colonnes de total), les contrôles de cohérence, le PDF rempli, le PDF
   vierge et l'export / import Excel (feuille « Données (import) »).
   Convention : une valeur vide = valeur CALCULÉE (identité de l'école, personnel, effectifs) ; une valeur saisie
   = correction. Aucune dépendance DOM. Conception : Maître Aimé FACHE */
import { db } from './db.js';
import { norm, uid, nowISO } from './util.js';
import { calculerFiche } from './carriere.js';
import { schemaOf, computeValues, effId } from './effectifs-schema.js';

let _data = null;
export async function chargerSchemas() {
  if (_data) return _data;
  const r = await fetch('data/recensement.json');
  _data = await r.json();
  return _data;
}
export const OUINON = ['Oui', 'Non'];
export const NIV = ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'];
export const TYPES = { primaire: 'École primaire (EP)', maternelle: 'École maternelle inclusive (EM)' };
const NUM_CHAMP = ['nb', 'mt'], NUM_CELL = ['n', 'd', 'an'];
export const typeEcole = (s) => (s && s.cycle === 'Maternelle' ? 'maternelle' : 'primaire');
export const recId = (schoolId, typ, annee) => `rec-${schoolId}-${typ}-${annee}`;

/* ------------------------------------------------------------------ parcours du schéma */
export const sections = (schema) => schema.sections.filter(s => s.items);
function* aplatir(it) { if (it.i === 'C2') { for (const x of [...it.g, ...it.d]) yield* aplatir(x); } else yield it; }
export function* elements(schema) { for (const s of sections(schema)) for (const it of s.items) for (const x of aplatir(it)) yield [s, x]; }
export function champsSimples(schema) {
  const out = schema.admin.map(f => [null, null, f]);
  for (const [s, it] of elements(schema)) if (it.i === 'L' || it.i === 'G') for (const ch of it.champs) if (ch && typeof ch === 'object') out.push([s, it, ch]);
  return out;
}
export const tableaux = (schema) => [...elements(schema)].filter(([, it]) => it.i === 'T');
export const feuilles = (cols) => cols.flatMap(c => (c.sub ? feuilles(c.sub) : [c]));
export const profondeur = (cols) => Math.max(...cols.map(c => (c.sub ? 1 + profondeur(c.sub) : 1)));
export function chemins(cols, parent = '') {
  const out = {};
  for (const c of cols) { const nom = parent ? `${parent} › ${c.lib}` : c.lib; if (c.sub) Object.assign(out, chemins(c.sub, nom)); else out[c.k] = nom; }
  return out;
}
const R = (k, lib) => ({ k, lib, groupe: null, total: null, grise: [], fusion: null, span: {}, st: '' });
export function lignesTableau(t, n) {
  if (!t.dyn) return t.rows;
  return Array.from({ length: Math.max(t.dyn.min, n || 0) }, (_, i) => R(String(i + 1), String(i + 1)));
}
/** Cellules d'en-tête [ligne, colonne, nb lignes, nb colonnes, libellé, vertical] */
export function enteteCellules(cols, depth) {
  const out = [];
  const placer = (noeuds, niveau, col) => {
    for (const n of noeuds) {
      if (n.sub) { const larg = feuilles(n.sub).length; out.push([niveau, col, 1, larg, n.lib, false]); placer(n.sub, niveau + 1, col); col += larg; }
      else { out.push([niveau, col, depth - niveau, 1, n.lib, !!n.v]); col += 1; }
    }
    return col;
  };
  placer(cols, 0, 0);
  return out;
}
export function libelleChamp(s, it, ch) {
  const parts = it ? [it.num || '', it.texte || ''] : [];
  if (ch.lib) parts.push(ch.lib);
  const txt = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().replace(/^[\s:]+|[\s:]+$/g, '');
  return txt || ch.k;
}
export function nombre(v) {
  if (v === null || v === undefined || Array.isArray(v) || typeof v === 'object' || typeof v === 'boolean') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/[\s  ]/g, '').replace(',', '.');
  if (!s || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  return parseFloat(s);
}
export function fmt(x) {
  if (x === null || x === undefined) return '';
  x = +x; if (Number.isInteger(x)) return String(x);
  return x.toFixed(2).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
}
export function milliers(v) { const x = nombre(v); if (x === null) return String(v ?? ''); return String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
export const vide = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);

/* ------------------------------------------------------------------ index des clés */
const _idx = {};
export function index(schema) {
  if (_idx[schema.type]) return _idx[schema.type];
  const ix = { simples: {}, cellules: {}, dyn: {}, tables: {} };
  for (const [s, it, ch] of champsSimples(schema)) ix.simples[ch.k] = [s, it, ch];
  for (const [s, t] of tableaux(schema)) {
    const leaves = Object.fromEntries(feuilles(t.cols).map(c => [c.k, c]));
    ix.tables[t.k] = [s, t];
    if (t.dyn) { ix.dyn[t.k] = [s, t, leaves]; continue; }
    for (const r of t.rows) for (const [ck, c] of Object.entries(leaves)) ix.cellules[`${t.k}.${r.k}.${ck}`] = [s, t, r, c];
  }
  ix.definition = (k) => {
    if (ix.simples[k]) return ['champ', ix.simples[k][2]];
    if (ix.cellules[k]) return ['cellule', ix.cellules[k][3]];
    const m = /^([a-z0-9]+)\.(\d{1,2})\.([a-z0-9_]+)$/.exec(k);
    if (m && ix.dyn[m[1]] && +m[2] >= 1 && +m[2] <= 60 && ix.dyn[m[1]][2][m[3]]) return ['cellule', ix.dyn[m[1]][2][m[3]]];
    return [null, null];
  };
  return (_idx[schema.type] = ix);
}
export function libelleCle(schema, k) {
  const ix = index(schema);
  if (ix.simples[k]) { const [s, it, ch] = ix.simples[k]; const lib = libelleChamp(s, it, ch); return s && !(it && it.num) ? `Rubrique ${s.num} – ${lib}` : lib; }
  const p = k.split('.');
  if (p.length === 3 && ix.tables[p[0]]) {
    const [s, t] = ix.tables[p[0]];
    let rl;
    if (t.dyn) rl = `ligne ${p[1]}`;
    else { const r = t.rows.find(x => x.k === p[1]); rl = (r && r.groupe ? r.groupe + ' › ' : '') + (r ? r.lib : p[1]); }
    return `Rubrique ${s.num} – ${rl} / ${chemins(t.cols)[p[2]] || p[2]}`;
  }
  return k;
}

/* ------------------------------------------------------------------ validation (formulaire, Excel) */
export function validerSaisies(schema, brut) {
  const ix = index(schema), propres = {}, erreurs = []; let inconnues = 0;
  for (let [k, v] of Object.entries(brut || {})) {
    const [kind, d] = ix.definition(k);
    if (!kind) { inconnues++; continue; }
    const t = d.t, multi = kind === 'champ' && t === 'ch' && d.multi;
    if (Array.isArray(v)) { if (multi) { const s = new Set(v.map(String)); propres[k] = d.opts.filter(o => s.has(o)); continue; } v = v.length ? v[v.length - 1] : ''; }
    if (typeof v === 'boolean') v = v ? '1' : '0';
    v = v === null || v === undefined ? '' : (typeof v === 'number' ? fmt(v) : String(v)).trim().slice(0, 400);
    if (v === '') continue;
    const lib = libelleCle(schema, k);
    if ((kind === 'champ' && NUM_CHAMP.includes(t) && k !== 'nom') || (kind === 'cellule' && NUM_CELL.includes(t))) {   // « nom » : une lettre par case
      const x = nombre(v);
      if (x === null || x < 0) { erreurs.push(`${lib} : « ${v} » n'est pas un nombre positif.`); continue; }
      if ((t === 'an' || k.endsWith('_an')) && !(x >= 1900 && x <= 2100 && Number.isInteger(x))) { erreurs.push(`${lib} : année invalide « ${v} ».`); continue; }
      if ((['n', 'an', 'mt'].includes(t) || (t === 'nb' && !d.dec)) && !Number.isInteger(x)) { erreurs.push(`${lib} : un nombre entier est attendu (« ${v} »).`); continue; }
      if (x > 1e12) { erreurs.push(`${lib} : valeur trop grande.`); continue; }
      v = fmt(x);
    } else if (multi) { const l = v.split(';').map(x => x.trim()); v = d.opts.filter(o => l.includes(o)); }
    else if (kind === 'champ' && t === 'ch') { if (!d.opts.includes(v)) { erreurs.push(`${lib} : choix invalide « ${v} ».`); continue; } }
    else if (kind === 'champ' && t === 'on') { v = { oui: 'Oui', non: 'Non' }[v.toLowerCase()] || v; if (!OUINON.includes(v)) { erreurs.push(`${lib} : répondre Oui ou Non.`); continue; } }
    else if ((kind === 'champ' && t === 'case') || (kind === 'cellule' && t === 'c')) v = ['1', 'x', 'oui', 'true', 'on'].includes(v.toLowerCase()) ? '1' : '0';
    propres[k] = v;
  }
  return { propres, erreurs, inconnues };
}

/* ------------------------------------------------------------------ évaluation */
export function nbLignesDyn(schema, saisies, auto) {
  const out = {};
  for (const [, t] of tableaux(schema)) {
    if (!t.dyn) continue;
    let n = 0; const re = new RegExp('^' + t.k + '\\.(\\d+)\\.');
    for (const src of [saisies, auto]) for (const [k, v] of Object.entries(src || {})) { const m = re.exec(k); if (m && !vide(v) && v !== '0') n = Math.max(n, +m[1]); }
    out[t.k] = Math.max(t.dyn.min, Math.min(n, 60));
  }
  return out;
}
export function completerAuto(schema, auto, dyn) {
  for (const [, t] of tableaux(schema)) {
    const d = t.dyn;
    if (d && d.fonction) for (let i = 1; i <= (dyn[t.k] || d.min); i++) { const k = `${t.k}.${i}.${d.fonction}`; if (!(k in auto)) auto[k] = i === 1 ? d.premier : d.autres; }
  }
}
/** { eff, calc, orig, alertes } — eff : valeur retenue ; calc : valeur calculée ; orig : 'saisie' | 'calculée' | '' */
export function evaluer(schema, saisies, auto, dyn) {
  const eff = {}, calc = {}, orig = {}, alertes = [];
  const saisie = (k) => { if (!(k in saisies)) return null; const v = saisies[k]; if (Array.isArray(v)) return v; const s = String(v).trim(); return s || null; };
  const retenir = (k, c, estcase = false, lib = null, somme = false) => {
    calc[k] = c; const v = saisie(k);
    if (v !== null) {
      eff[k] = estcase ? (v === '0' ? '' : '1') : v; orig[k] = 'saisie';
      if (somme && !vide(c) && nombre(v) !== null && nombre(v) !== nombre(c)) alertes.push(`${lib} : valeur saisie ${v} différente du total calculé ${c}.`);
    } else { eff[k] = c; orig[k] = !vide(c) ? 'calculée' : ''; }
  };
  const sommeDe = (cles) => { const xs = cles.map(x => nombre(eff[x])); return xs.some(x => x !== null) ? fmt(xs.reduce((a, x) => a + (x || 0), 0)) : ''; };
  const simples = champsSimples(schema);
  for (const passe of [false, true]) for (const [s, it, ch] of simples) {
    if (!!ch.somme !== passe) continue;
    let c;
    if (passe) c = sommeDe(ch.somme);
    else { c = auto[ch.k] ?? ''; if (ch.t === 'ch' && ch.multi && !Array.isArray(c)) c = c ? [c] : []; }
    retenir(ch.k, c, ch.t === 'case', libelleChamp(s, it, ch), passe);
  }
  for (const [s, t] of tableaux(schema)) {
    const rows = lignesTableau(t, dyn[t.k]), leaves = feuilles(t.cols), noms = chemins(t.cols);
    for (const r of [...rows.filter(r => !r.total), ...rows.filter(r => r.total)]) for (const c of leaves) {
      const k = `${t.k}.${r.k}.${c.k}`;
      if ((r.grise || []).includes(c.k) || (r.fusion && r.fusion[0].includes(c.k))) { eff[k] = calc[k] = orig[k] = ''; continue; }
      const lib = `Rubrique ${s.num} – ${r.groupe ? r.groupe + ' › ' : ''}${r.lib} / ${noms[c.k]}`;
      if (r.total && NUM_CELL.includes(c.t)) retenir(k, sommeDe(r.total.map(x => `${t.k}.${x}.${c.k}`)), false, lib, true);
      else if (c.somme) retenir(k, sommeDe(c.somme.map(p => `${t.k}.${r.k}.${p}`)), false, lib, true);
      else retenir(k, auto[k] ?? '', c.t === 'c', lib);
    }
  }
  return { eff, calc, orig, alertes };
}
export function controles(schema, eff, alertesSomme) {
  const out = [...alertesSomme], ix = index(schema), typ = schema.type;
  for (const [k, v] of Object.entries(eff)) {
    if (vide(v)) continue;
    const [kind, d] = ix.definition(k);
    if (kind && k !== 'nom' && ((kind === 'champ' && NUM_CHAMP.includes(d.t)) || (kind === 'cellule' && NUM_CELL.includes(d.t))) && nombre(v) === null) out.push(`${libelleCle(schema, k)} : « ${v} » n'est pas un nombre.`);
  }
  const n = (k) => nombre(eff[k]);
  const egal = (a, b, msg) => { if (n(a) !== null && n(b) !== null && n(a) !== n(b)) out.push(`${msg} (${fmt(n(a))} ≠ ${fmt(n(b))}).`); };
  if (typ === 'primaire') {
    egal('eff_m', 't73.tot.ens_g', '7.1 Masculin différent du Total ENSEMBLE G du 7.3');
    egal('eff_f', 't73.tot.ens_f', '7.1 Féminin différent du Total ENSEMBLE F du 7.3');
    egal('eff_t', 't73.tot.ens_t', '7.1 Total différent du Total ENSEMBLE T du 7.3');
    if (n('t72.tot.t') !== null && n('t73.tot.ci_t') !== null && n('t72.tot.t') > n('t73.tot.ci_t'))
      out.push(`7.2 : les nouveaux inscrits au CI (${fmt(n('t72.tot.t'))}) dépassent l'effectif total du CI au 7.3 (${fmt(n('t73.tot.ci_t'))}).`);
    const route = ['r_bitume', 'r_piste', 'r_4x4', 'r_2roues', 'r_pieds'].map(n);
    if (n('d_cs') !== null && route.some(x => x !== null)) { const tot = route.reduce((a, x) => a + (x || 0), 0); if (Math.abs(tot - n('d_cs')) > 0.05) out.push(`2.2 : la somme des distances selon l'état de la route (${fmt(tot)} km) doit être égale à la distance au bureau de la CS du 2.1 iv (${fmt(n('d_cs'))} km).`); }
    const sal = ['simples', 'jumeles', 'multi'].map(r => n(`t314.${r}.salles`));
    if (n('salles_utilisees') !== null && sal.some(x => x !== null)) { const tot = sal.reduce((a, x) => a + (x || 0), 0); if (tot !== n('salles_utilisees')) out.push(`3.14 / 3.15 : le nombre de salles de classes utilisées de la structure pédagogique (${fmt(tot)}) doit être le même que celui du 3.15 iv (${fmt(n('salles_utilisees'))}).`); }
    for (const niv of [...NIV.map(x => x.toLowerCase()), 'ens']) for (const sx of ['g', 'f', 't']) { const tot = n(`t73.tot.${niv}_${sx}`); if (tot !== null && (n(`t73.red.${niv}_${sx}`) || 0) > tot) out.push(`7.3 : plus de redoublants que d'élèves (${niv.toUpperCase()} ${sx.toUpperCase()}).`); }
  } else {
    egal('t21.enfants.m', 't3.tot.ens_g', '2.1 Enfants M différent du Total Ensemble Masculin de la rubrique 3');
    egal('t21.enfants.f', 't3.tot.ens_f', '2.1 Enfants F différent du Total Ensemble Féminin de la rubrique 3');
    egal('t21.enfants.t', 't3.tot.ens_t', '2.1 Enfants T différent du Total Ensemble de la rubrique 3');
    egal('t21.enfants.ph_t', 't3.tot.eh_t', '2.1 Enfants PH différent du Total « Dont enfants handicapés » (3)');
  }
  return [...new Set(out)];
}
export function valeursVierges(schema) {
  const eff = {}, dyn = {};
  for (const [, t] of tableaux(schema)) if (t.dyn) { dyn[t.k] = t.dyn.min; if (t.dyn.fonction) for (let i = 1; i <= t.dyn.min; i++) eff[`${t.k}.${i}.${t.dyn.fonction}`] = i === 1 ? t.dyn.premier : t.dyn.autres; }
  return { eff, dyn };
}

/* ------------------------------------------------------------------ remplissage automatique (données de l'application) */
const dateRef = (annee) => { const a = +String(annee).slice(0, 4); return new Date(a + 1, 11, 31); };   // 31 décembre de la seconde année
const enDate = (v) => { const s = String(v || ''); const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s) || null; if (m) return new Date(+m[1], +m[2] - 1, +m[3]); const f = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); return f ? new Date(+f[3], +f[2] - 1, +f[1]) : null; };
const anneesDepuis = (v, ref) => { const d = enDate(v); if (!d) return ''; let n = ref.getFullYear() - d.getFullYear(); if (ref.getMonth() < d.getMonth() || (ref.getMonth() === d.getMonth() && ref.getDate() < d.getDate())) n--; return n >= 0 ? String(n) : ''; };
const dateFr = (v) => { const d = enDate(v); return d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : String(v || ''); };
const STATUTS = { public: 'Public', 'prive laic': 'Privé Laïc', prive: 'Privé Laïc', 'prive confessionnel': 'Privé Confessionnel', confessionnel: 'Privé Confessionnel', communautaire: 'Communautaire' };
const RE_ENS = /enseign|instit|direct|ma[iî]tre|adjoint|[ée]ducat|titulaire|professeur/i;
const ouiNon = (v) => (/^oui$/i.test(v || '') ? 'Oui' : /^non$/i.test(v || '') ? 'Non' : '');

/** Valeurs calculées pour une école : identité, équipements, personnel (état nominatif), effectifs. */
export async function calculs(schema, school, annee) {
  const auto = {}, infos = [], typ = schema.type, s = school || {};
  const pose = (k, v) => { if (!vide(v)) auto[k] = v; };
  pose('nom', (s.nom || '').toUpperCase()); pose('code_ecole', s.code); pose('cs', s.nomCs); pose('up', s.up); pose('departement', s.departement);
  pose('commune', s.commune); pose('arrondissement', s.arrondissement); pose('village', s.localite); pose('telephone', s.contact); pose('rempli_par', s.directeur);
  pose('statut', STATUTS[norm(s.secteur)] || ''); if (/^[1-6]$/.test(String(s.numZone || ''))) pose('zone', String(s.numZone));
  pose('type_ens', /inclus/i.test(s.type || '') ? 'Inclusif' : /sp[ée]cial/i.test(s.type || '') ? 'Spécialisé' : s.type ? 'Classique' : '');
  pose('electricite', ouiNon(s.electricite)); pose('cloture', ouiNon(s.cloture)); pose('latrines', ouiNon(s.latrines));
  pose(typ === 'primaire' ? 'point_eau' : 'eau', ouiNon(s.eau));
  if (typ === 'maternelle') pose('rempli_fonction', /trice/i.test(s.directeur_titre || '') ? 'Directrice' : 'Directeur');
  const d = new Date(); auto.date_remplissage = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  // personnel de l'école (menus « Personnel enseignant », « Saisie manuelle »)
  const ref = dateRef(annee);
  const agents = (await db.all('personnel')).filter(p => p.schoolId === s.id).map(p => calculerFiche(p));
  const ens = [], sout = [];
  for (const p of agents) {
    const sexe = String(p.sexe || '').toUpperCase().slice(0, 1), nomc = `${p.nom || ''} ${p.prenoms || ''}`.trim();
    const base = { nom: nomc, sx_m: sexe === 'M' ? '1' : '', sx_f: sexe === 'F' ? '1' : '', mat: String(p.matricule || ''), nip: String(p.nip || '') };
    if (p.handicap) base[/^o/i.test(p.handicap) ? 'ph_o' : 'ph_n'] = '1';
    if (RE_ENS.test(p.fonction || '')) {
      const dir = /direct/i.test(p.fonction || '');
      const row = { ...base, naiss: /^\d{4}/.test(p.date_naissance || '') ? p.date_naissance.slice(0, 4) : (enDate(p.date_naissance)?.getFullYear() || '').toString(),
        dip_a: p.diplome_academique || '', dip_p: p.cap === 'oui' ? 'CAP' : p.ceap === 'oui' ? 'CEAP' : (p.diplome_pro || ''), grade: p.grade || '',
        statut: p.statut === 'ACDPCTD' ? 'AME' : p.statut === 'Privé' ? 'PRIVE' : (p.statut || ''), fonction: dir ? 'Directeur' : 'Adjoint', indice: String(p.indice_reel || '') };
      if (typ === 'primaire') {
        const cours = String(p.cours_tenus || '').toUpperCase();
        for (const n of NIV) if (new RegExp('(^|[^A-Z0-9])' + n + '([^0-9]|$)').test(cours)) row['c_' + n.toLowerCase()] = '1';
        Object.assign(row, { anc_fp: anneesDepuis(p.date_prise_service, ref), anc_dep: anneesDepuis(p.date_service_dep, ref), anc_ec: anneesDepuis(p.date_service_ecole, ref),
          formation: p.date_derniere_formation ? dateFr(p.date_derniere_formation) : '', vis_i: String(p.visites_ccs || ''), vis_cp: String(p.visites_cp || ''), up_pct: String(p.participation_up || '') });
      } else {
        const sec = norm(p.cours_tenus || p.section || '');
        Object.assign(row, { s_pe: /petit/.test(sec) ? '1' : '', s_gr: /grand/.test(sec) ? '1' : '', qualite: p.qualite || '', anc: anneesDepuis(p.date_prise_service, ref),
          vis_i: String(p.visites_ccs || ''), vis_cp: String(p.visites_cp || ''), vis_pct: String(p.participation_up || '') });
      }
      ens.push([!dir, nomc, row]);
    } else sout.push({ ...base, fonction: p.fonction || '', statut: p.statut || '', age: anneesDepuis(p.date_naissance, ref) });
  }
  ens.sort((a, b) => (a[0] - b[0]) || a[1].localeCompare(b[1], 'fr'));
  const lst = ens.map(x => x[2]);
  if (s.directeur && !lst.some(r => r.fonction === 'Directeur')) lst.unshift({ nom: s.directeur, fonction: 'Directeur' });
  const [tp, ts] = typ === 'primaire' ? ['t8', 't10'] : ['t6', 't7'];
  for (const [tab, l] of [[tp, lst.slice(0, 60)], [ts, sout.slice(0, 60)]]) l.forEach((row, i) => { for (const [ck, v] of Object.entries(row)) if (!vide(v)) auto[`${tab}.${i + 1}.${ck}`] = v; });
  if (typ === 'maternelle' && sout.some(r => r.sx_m || r.sx_f)) { auto['t21.soutien.m'] = fmt(sout.filter(r => r.sx_m).length); auto['t21.soutien.f'] = fmt(sout.filter(r => r.sx_f).length); }
  if (!agents.length) infos.push("Aucun agent enregistré pour cette école : l'état nominatif est à saisir (ou à compléter dans « Saisie manuelle »).");
  // effectifs (menu « Effectifs des apprenants » : rubrique 7 EP / rubrique 3 EM)
  const er = await db.get('effectifs', effId(s.id, annee));
  if (er && er.data && Object.keys(er.data).length) {
    const S = schemaOf(s.cycle), v = computeValues(S, er.data), sx = { G: 'g', F: 'f' };
    const get = (r, c, x) => v[`${r}.${c}.${x}`];
    if (typ === 'primaire') {
      const AG = { m5: 'a4', 16: 'a16', '16p': 'a16' }, ROWS = { redoub: 'red', red6: 'red6', red11: 'red11', etr: 'etr', orph_h: 'orph_h', orph_nh: 'orph_nh', eh_mot: 'hm', eh_vis: 'hv', eh_aud: 'ha', eh_int: 'hi', sans_acte: 'sans_acte', nouv_autre: 'venus', grossesse: 'gross' };
      for (const row of S.rows) {
        const cible = row.sec === 'age' ? (AG[row.k.slice(4)] || 'a' + row.k.slice(4)) : ROWS[row.k];
        if (!cible) continue;
        for (const c of NIV) for (const x of ['G', 'F']) { const n = get(row.k, c, x); if (n !== undefined) auto[`t73.${cible}.${c.toLowerCase()}_${sx[x]}`] = fmt(n); }
      }
      for (const c of NIV) for (const x of ['G', 'F']) { const o = ['orph_h', 'orph_nh', 'vuln'].map(r => get(r, c, x)).filter(n => n !== undefined); if (o.length) auto[`t73.ov.${c.toLowerCase()}_${sx[x]}`] = fmt(o.reduce((a, b) => a + b, 0)); }
      const NI = { m45: 'm45', 45: 'a45', 5: 'a5', 6: 'a6', 7: 'a7', 8: 'a8', '9p': 'a9' };
      for (const [a, cible] of Object.entries(NI)) for (const x of ['G', 'F']) { const n = get('ni.' + a, 'CI', x); if (n !== undefined) auto[`t72.${cible}.${sx[x]}`] = fmt(n); }
      for (const x of ['G', 'F']) { const n = get('ni_mat', 'CI', x); if (n !== undefined) auto[`t72b.n.${sx[x]}`] = fmt(n); }
      for (const x of ['G', 'F']) { const t = NIV.map(c => get('tot', c, x)).filter(n => n !== undefined); if (t.length) auto[x === 'G' ? 'eff_m' : 'eff_f'] = fmt(t.reduce((a, b) => a + b, 0)); }
    } else {
      const AG = { m2: 'm25', 2: 'a25', 3: 'a3', 4: 'a4', 5: 'a5', p5: 'p5' }, ROWS = { orph_h: 'orph_h', orph_nh: 'orph_nh', eh_mot: 'hm', eh_vis: 'hv', eh_aud: 'ha', eh_int: 'hi', eh_aut: 'hx' }, COL = { pet: 'pe', gra: 'gr', eh: 'eh' };
      for (const row of S.rows) {
        const cible = row.sec === 'age' ? AG[row.k.slice(4)] : ROWS[row.k];
        if (!cible) continue;
        for (const c of ['pet', 'gra', 'eh']) for (const x of ['G', 'F']) { const n = get(row.k, c, x); if (n !== undefined) auto[`t3.${cible}.${COL[c]}_${sx[x]}`] = fmt(n); }
      }
      for (const c of ['pet', 'gra']) for (const x of ['G', 'F']) { const o = ['orph_h', 'orph_nh', 'vuln'].map(r => get(r, c, x)).filter(n => n !== undefined); if (o.length) auto[`t3.ov.${COL[c]}_${sx[x]}`] = fmt(o.reduce((a, b) => a + b, 0)); }
      for (const x of ['G', 'F']) { const t = ['pet', 'gra'].map(c => get('tot', c, x)).filter(n => n !== undefined); if (t.length) auto[`t21.enfants.${x === 'G' ? 'm' : 'f'}`] = fmt(t.reduce((a, b) => a + b, 0)); }
    }
    infos.push('Effectifs repris du menu « Effectifs des apprenants » (' + annee + ').');
  } else infos.push(`Effectifs : aucune fiche « Effectifs des apprenants » pour ${annee} — à saisir ici ou dans ce menu.`);
  const ix = index(schema);
  for (const k of Object.keys(auto)) if (!ix.definition(k)[0]) delete auto[k];
  return { auto, infos };
}

/* ------------------------------------------------------------------ stockage (magasin « recensements ») */
export async function lire(school, typ, annee) { return (await db.get('recensements', recId(school.id, typ, annee))) || null; }
export async function ecrire(school, typ, annee, saisies, user) {
  const old = await lire(school, typ, annee);
  const rec = { ...(old || { id: recId(school.id, typ, annee), created: nowISO() }), typ, annee, schoolId: school.id, schoolNom: school.nom, codeZone: school.codeZone || '', codeCs: school.codeCs || '',
    departement: school.departement || '', valeurs: saisies, par: user ? `${user.prenoms || ''} ${user.nom || user.username || ''}`.trim() : '', maj: nowISO() };
  await db.put('recensements', rec);
  return rec;
}
/** Contexte complet de la fiche d'une école : schéma, saisies, calculs, valeurs effectives, contrôles. */
export async function contexte(school, typ, annee) {
  const D = await chargerSchemas(), schema = D.schemas[typ];
  const rec = await lire(school, typ, annee), saisies = (rec && rec.valeurs) || {};
  const { auto, infos } = await calculs(schema, school, annee);
  const dyn = nbLignesDyn(schema, saisies, auto);
  completerAuto(schema, auto, dyn);
  const { eff, calc, orig, alertes } = evaluer(schema, saisies, auto, dyn);
  const ctrl = controles(schema, eff, alertes);
  const vals = Object.values(eff);
  return { D, schema, typ, annee, school, rec, saisies, auto, infos, dyn, eff, calc, orig, ctrl,
    nSaisis: Object.values(orig).filter(v => v === 'saisie').length, nCalcules: Object.values(orig).filter(v => v === 'calculée').length,
    nRempli: vals.filter(v => !vide(v)).length, nTotal: vals.length };
}
export { uid };
