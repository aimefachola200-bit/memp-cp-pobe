/* République du Bénin — MEMP — Répartition public / privé des chiffres de la circonscription
   Pour tout tableau de chiffres : EP publiques, EM publiques, total public ; EP privées, EM privées, total privé ;
   synthèse EP (public + privé), EM (public + privé) et total général de la circonscription scolaire. Regroupements par
   secteur, par zone pédagogique, par arrondissement ou détail par école (avec sous-totaux), exports PDF et Excel de même
   structure. Sources : fiche de l'école, personnel enseignant, effectifs des apprenants, fiches de rentrée et de fin
   d'année (modèle GESCOL), rapports du CM2 pour le CEP. Conception : Maître Aimé FACHE */
import { h, download, clean, norm, currentSchoolYear } from './util.js';
import { db } from './db.js';
import { scoped, cleGroupe, libGroupe, ordreGroupe } from './data.js';
import { listToPdf, listToXlsx } from './export.js';
import * as E from './effectifs-schema.js';

export const estPrive = (s) => /priv/i.test(String(s?.secteur || ''));
export const estEM = (s) => s?.cycle === 'Maternelle';
const ENSEIGNANT = /^(direct|adjoint|enseign|instit|educat)/;

/* ---------------- colonnes disponibles ---------------- */
export const COLONNES = {
  ecoles: { l: 'Écoles' },
  ens_H: { l: 'Enseignants H' }, ens_F: { l: 'Enseignants F' }, ens_T: { l: 'Enseignants T' },
  ens_FE: { l: 'Enseignants FE' }, ens_ACDPE: { l: 'Enseignants ACDPE' }, ens_AME: { l: 'Enseignants AME' }, ens_AUT: { l: 'Enseignants autres' },
  el_G: { l: 'Élèves G' }, el_F: { l: 'Élèves F' }, el_T: { l: 'Élèves T' },
  classes: { l: 'Classes / sections ouvertes' }, salles: { l: 'Salles existantes' },
  red_T: { l: 'Redoublants' }, eh_T: { l: 'Élèves handicapés' },
  cep_insc_G: { l: 'CEP inscrits G' }, cep_insc_F: { l: 'CEP inscrits F' }, cep_insc_T: { l: 'CEP inscrits T' },
  cep_pres_G: { l: 'CEP présents G' }, cep_pres_F: { l: 'CEP présents F' }, cep_pres_T: { l: 'CEP présents T' },
  cep_adm_G: { l: 'CEP admis G' }, cep_adm_F: { l: 'CEP admis F' }, cep_adm_T: { l: 'CEP admis T' },
  cep_taux: { l: 'Taux de réussite (%)', ratio: ['cep_adm_T', 'cep_pres_T'] },
};
export const PRESET = {
  general: ['ecoles', 'ens_H', 'ens_F', 'ens_T', 'el_G', 'el_F', 'el_T', 'classes', 'salles'],
  effectifs: ['ecoles', 'el_G', 'el_F', 'el_T', 'red_T', 'eh_T'],
  personnel: ['ecoles', 'ens_H', 'ens_F', 'ens_T', 'ens_FE', 'ens_ACDPE', 'ens_AME', 'ens_AUT'],
  cep: ['ecoles', 'cep_insc_G', 'cep_insc_F', 'cep_insc_T', 'cep_pres_G', 'cep_pres_F', 'cep_pres_T', 'cep_adm_G', 'cep_adm_F', 'cep_adm_T', 'cep_taux'],
};
const n0 = (x) => { const n = parseInt(String(x ?? '').replace(/\s/g, ''), 10); return Number.isFinite(n) ? n : 0; };
const ficheDe = (fiches, s, annee, kind) => fiches.find(f => f.schoolId === s.id && f.annee === annee && f.kind === kind);
const vals = (f) => (f ? { ...(f.instantane || {}), ...(f.format === 'gescol' ? f.valeurs || {} : {}) } : {});

/** Chiffres par école pour une année : Map schoolId → {colonne: nombre} */
export async function chiffresEcoles(u, annee, schools) {
  const [personnel, effectifs, fiches, reports] = await Promise.all([scoped('personnel', u), scoped('effectifs', u), scoped('fiches', u), scoped('classReports', u)]);
  const out = new Map();
  for (const s of schools) {
    const em = estEM(s), x = { ecoles: 1, ens_H: 0, ens_F: 0, ens_T: 0, el_G: 0, el_F: 0, el_T: 0, classes: 0, salles: 0, red_T: 0, eh_T: 0 };
    Object.assign(x, { ens_FE: 0, ens_ACDPE: 0, ens_AME: 0, ens_AUT: 0 });
    for (const p of personnel) if (p.schoolId === s.id && ENSEIGNANT.test(norm(p.fonction || ''))) {
      x.ens_T++; if (/^f/i.test(p.sexe || '')) x.ens_F++; else if (/^m/i.test(p.sexe || '')) x.ens_H++;
      const st = p.statut === 'FE' ? 'FE' : p.statut === 'ACDPE' ? 'ACDPE' : /AME|ACDPCTD/.test(p.statut || '') ? 'AME' : 'AUT'; x['ens_' + st]++;
    }
    // aucun agent enregistré pour l'école : nombres du fichier de la circonscription (personnel par statut, sans le sexe)
    if (!x.ens_T && s.personnelFichier) { const pf = s.personnelFichier; Object.assign(x, { ens_FE: pf.FE || 0, ens_ACDPE: pf.ACDPE || 0, ens_AME: pf.AME || 0, ens_AUT: pf.Autres || 0 }); x.ens_T = pf.total ?? (x.ens_FE + x.ens_ACDPE + x.ens_AME + x.ens_AUT); }
    const rec = effectifs.find(r => r.schoolId === s.id && r.annee === annee);
    const fr = ficheDe(fiches, s, annee, em ? 'EM_RENTREE' : 'EP_RENTREE'), ff = ficheDe(fiches, s, annee, em ? 'EM_FIN' : 'EP_FIN'), vr = vals(fr), vf = vals(ff);
    let m = null;
    if (rec && E.hasData(rec.data)) { const S = E.schemaOf(s.cycle); m = E.metrics(S, E.computeValues(S, rec.data)); }
    if (m && m.T !== null) { x.el_G = m.G || 0; x.el_F = m.F || 0; x.el_T = m.T || 0; x.red_T = m.redoub || 0; x.eh_T = m.eh || 0; }
    else if (em) { x.el_G = n0(vr['rep.debut.tot_G']); x.el_F = n0(vr['rep.debut.tot_F']); x.el_T = x.el_G + x.el_F; x.eh_T = n0(vr['rep.besoin.tot_T']); }
    else { x.el_G = n0(vr['eff.nb.ENS_G']); x.el_F = n0(vr['eff.nb.ENS_F']); x.el_T = x.el_G + x.el_F; x.red_T = n0(vr['eff.red.ENS_T']); x.eh_T = n0(vr['eff.handic.ENS_T']); }
    x.classes = n0(vr[em ? 'sections_ouvertes' : 'classes_ouvertes']) || n0((fr?.data || {})[em ? 'sections_ouv' : 'classes_ouv']);
    x.salles = n0(vr.salles_existantes) || n0((fr?.data || {}).salles_exist);
    for (const [r, o] of [['insc', 'insc'], ['pres', 'pres'], ['adm', 'adm']]) for (const g of ['G', 'F']) x[`cep_${o}_${g}`] = 0;
    if (!em) {
      if (ff && (vf['cep.insc.G'] || vf['cep.insc.F'] || vf['cep.pres.G'] || vf['cep.adm.G'])) for (const r of ['insc', 'pres', 'adm']) for (const g of ['G', 'F']) x[`cep_${r}_${g}`] = n0(vf[`cep.${r}.${g}`]);
      else {
        const d = ff?.data || {}; for (const [r, o] of [['insc', 'insc'], ['comp', 'pres'], ['adm', 'adm']]) for (const g of ['G', 'F']) x[`cep_${o}_${g}`] = n0(d[`cep.${r}.cep.${g}`]);
        if (!x.cep_insc_G && !x.cep_insc_F) {
          const rp = reports.find(z => z.schoolId === s.id && z.annee === annee && z.cours === 'CM2');
          if (rp) { const { reportStats } = await import('./export.js'), S = reportStats(rp.rows || []); x.cep_insc_G = S.inscrits.G; x.cep_insc_F = S.inscrits.F; x.cep_pres_G = S.compose.G; x.cep_pres_F = S.compose.F; x.cep_adm_G = S.seuil.G; x.cep_adm_F = S.seuil.F; }
        }
      }
    }
    for (const r of ['insc', 'pres', 'adm']) x[`cep_${r}_T`] = x[`cep_${r}_G`] + x[`cep_${r}_F`];
    out.set(s.id, x);
  }
  return out;
}

/* ---------------- agrégation ---------------- */
const LIGNES = [['EP_pub', 'EP publiques'], ['EM_pub', 'EM publiques'], ['pub', 'Total public'], ['EP_prv', 'EP privées'], ['EM_prv', 'EM privées'], ['prv', 'Total privé']];
const SYNTH = [['EP', 'EP (publiques + privées)'], ['EM', 'EM (publiques + privées)'], ['tot', 'TOTAL GÉNÉRAL']];
function cles(s) { const c = estEM(s) ? 'EM' : 'EP', p = estPrive(s) ? 'prv' : 'pub'; return [`${c}_${p}`, p, c, 'tot']; }
function agreger(schools, chiffres, cols) {
  const A = {};
  for (const s of schools) { const x = chiffres.get(s.id) || {}; for (const k of cles(s)) { const a = A[k] || (A[k] = {}); for (const c of cols) if (!COLONNES[c].ratio) a[c] = (a[c] || 0) + (x[c] || 0); } }
  for (const a of Object.values(A)) ratios(a, cols);
  return A;
}
function ratios(a, cols) { for (const c of cols) { const r = COLONNES[c].ratio; if (r) a[c] = a[r[1]] ? Math.round(1000 * (a[r[0]] || 0) / a[r[1]]) / 10 : ''; } return a; }
const ligne = (cols, groupe, lib, a, style) => ({ groupe, lib, _s: style, ...Object.fromEntries(cols.map(c => [c, a ? a[c] ?? 0 : 0])) });

/** Lignes du tableau selon le mode : secteur | zone | arr | ecole (détail par école avec sous-totaux par zone ou arrondissement) */
export function lignesSecteurs(schools, chiffres, cols, mode, zonesRef, sousMode = 'zone', libCs = 'Circonscription') {
  const rows = [], blocLignes = (groupe, A, total) => {
    for (const [k, l] of LIGNES) if (A[k] || k === 'pub' || k === 'prv') rows.push(ligne(cols, groupe, l, A[k], k.length === 3 ? 'st' : ''));
    if (total) rows.push(ligne(cols, groupe, total, A.tot, 'tot'));
  };
  if (mode === 'zone' || mode === 'arr' || mode === 'ecole') {
    const gm = mode === 'ecole' ? sousMode : mode;
    const groupes = [...new Set(schools.map(s => cleGroupe(s, gm)))].sort(ordreGroupe);
    for (const g of groupes) {
      const lib = libGroupe(g, zonesRef, gm, 'Sans zone ni arrondissement'), ss = schools.filter(s => cleGroupe(s, gm) === g).sort((a, b) => (estPrive(a) - estPrive(b)) || (estEM(a) - estEM(b)) || a.nom.localeCompare(b.nom, 'fr'));
      if (mode === 'ecole') for (const s of ss) rows.push(ligne(cols, lib, `${s.nom} (${estEM(s) ? 'EM' : 'EP'} ${estPrive(s) ? 'privée' : 'publique'})`, ratios({ ...(chiffres.get(s.id) || {}) }, cols), ''));
      blocLignes(lib, agreger(ss, chiffres, cols), `Total ${lib}`);
    }
  }
  const A = agreger(schools, chiffres, cols);
  blocLignes(libCs, A, null);
  for (const [k, l] of SYNTH) rows.push(ligne(cols, libCs, l, A[k], k === 'tot' ? 'tot' : 'st'));
  return rows;
}

/* ---------------- composant ---------------- */
const MODES = [['secteur', 'Public / privé'], ['zone', 'Par zone pédagogique'], ['arr', 'Par arrondissement'], ['ecole', 'Par école']];
/** Carte « répartition public / privé » : titre, colonnes (liste ou nom de PRESET), année (sélecteur si absente) */
export async function blocSecteurs(u, { titre = 'Répartition public / privé', colonnes = 'general', annee = null, ecoles = null, note = '' } = {}) {
  const cols = Array.isArray(colonnes) ? colonnes : PRESET[colonnes];
  const schools = ecoles || await scoped('schools', u), zonesRef = (await db.all('ref')).filter(r => r.type === 'zone');
  const libCs = u.nomCs ? `CS ${u.nomCs}` : 'Circonscription';
  let mode = 'secteur', sous = 'zone'; try { mode = localStorage.getItem('sect-mode') || 'secteur'; sous = localStorage.getItem('sect-sous') || 'zone'; } catch (e) { /* stockage indisponible */ }
  const annees = [...new Set([currentSchoolYear(), ...(await scoped('fiches', u)).map(f => f.annee), ...(await scoped('effectifs', u)).map(r => r.annee)])].filter(Boolean).sort().reverse();
  let an = annee || annees[0], chiffres = await chiffresEcoles(u, an, schools);
  const card = h('div', { class: 'card sect-card' }), corps = h('div');
  const colsTable = [{ k: 'groupe', l: 'Regroupement', w: 110 }, { k: 'lib', l: 'Catégorie', w: 170 }, ...cols.map(c => ({ k: c, l: COLONNES[c].l, num: true, w: 58 }))];
  const sousTitre = () => `${libCs} — année scolaire ${an} — ${MODES.find(m => m[0] === mode)[1]}${mode === 'ecole' ? ` (sous-totaux ${sous === 'arr' ? 'par arrondissement' : 'par zone pédagogique'})` : ''}`;
  function dessiner() {
    const rows = lignesSecteurs(schools, chiffres, cols, mode, zonesRef, sous, libCs);
    let prec = '';
    corps.replaceChildren(h('div', { class: 'gridwrap' }, h('table', { class: 'g sect' },
      h('thead', h('tr', colsTable.map(c => h('th', c.l)))),
      h('tbody', rows.map(r => { const g = r.groupe !== prec ? r.groupe : ''; prec = r.groupe; return h('tr', { class: r._s === 'tot' ? 'sect-tot' : r._s === 'st' ? 'sect-st' : '' }, h('td', { class: 'lab' }, g), h('td', r.lib), cols.map(c => h('td', { class: 'num', style: { textAlign: 'center' } }, String(r[c] ?? '')))); })))),
    ...(note ? [h('p', { class: 'notes' }, note)] : []));
    return rows;
  }
  const btn = (l, f) => h('button', { class: 'btn sm', onclick: f }, l);
  const outils = h('div', { class: 'tbl-tools no-print', style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } });
  function barre() {
    outils.replaceChildren(...[
      ...MODES.map(([k, l]) => h('button', { class: 'btn sm' + (k === mode ? ' primary' : ''), onclick: () => { mode = k; try { localStorage.setItem('sect-mode', k); } catch (e) { /* */ } barre(); dessiner(); } }, l)),
      mode === 'ecole' ? h('select', { class: 'search', style: { maxWidth: '230px' }, 'aria-label': 'Sous-totaux', onchange: (e) => { sous = e.target.value; try { localStorage.setItem('sect-sous', sous); } catch (er) { /* */ } dessiner(); } },
        [['zone', 'Sous-totaux par zone'], ['arr', 'Sous-totaux par arrondissement']].map(([v, l]) => h('option', { value: v, selected: v === sous }, l))) : null,
      annee ? null : h('select', { class: 'search', style: { maxWidth: '170px' }, 'aria-label': 'Année scolaire', onchange: async (e) => { an = e.target.value; chiffres = await chiffresEcoles(u, an, schools); dessiner(); } }, annees.map(a => h('option', { value: a, selected: a === an }, a))),
      btn('⬇ PDF', async () => { const rows = dessiner(); download(new Blob([await listToPdf({ title: titre, subtitle: sousTitre(), columns: colsTable, rows: rows.map(r => ({ ...r, lib: r._s ? r.lib.toUpperCase() : r.lib })) })], { type: 'application/pdf' }), clean(titre + '_' + an) + '.pdf'); }),
      btn('⬇ Excel', async () => { const rows = dessiner(); download(await listToXlsx({ title: titre, subtitle: sousTitre(), columns: colsTable, rows, sheet: 'Public-privé' }), clean(titre + '_' + an) + '.xlsx'); })].filter(Boolean));
  }
  barre(); dessiner();
  card.append(h('h3', titre), outils, corps);
  return card;
}
