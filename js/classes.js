/* Classes ouvertes : règle commune (outils/lots/spec-classes.md) — CS Pobè, Mon école, MEMP-CP, DOSP, MEMP-CP Pobè,
   ÉduGestion Pro / Master. Une classe = une salle et un maître : une classe jumelée (2 cours, ex. CI-CP) ou multigrade
   (3 cours ou plus, ex. CI-CE2-CM1) compte pour UNE classe. Classes ouvertes = simples + jumelées + multigrades.
   Les classes autorisées sont une donnée à part ; elles peuvent être inférieures aux classes ouvertes (écart affiché,
   aucune contrainte). Les ratios (élèves par classe, enseignants par classe, tables-bancs par classe, besoins…) se
   calculent sur les classes OUVERTES ; les effectifs restent par cours.
   Conception : Maître Aimé FACHOLA */
(function (global) {
  'use strict';
  if (global.ClassesOrg) return;
  const COURS_EP = ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'];
  const SECTIONS_EM = ['Petite section', 'Grande section'];
  const TYPES = [['simple', 'Simple'], ['jumelee', 'Jumelée'], ['multigrade', 'Multigrade']];
  const LIB_TYPE = { simple: 'Simple', jumelee: 'Jumelée', multigrade: 'Multigrade' };
  const ordre = (c) => { const i = COURS_EP.indexOf(c); return i >= 0 ? i : 10 + SECTIONS_EM.indexOf(c); };
  /** Normalise un cours (« ce 1 », « Ce1 » → « CE1 » ; « PS » → « Petite section ») */
  function cours(c) {
    const t = String(c == null ? '' : c).normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!t) return '';
    if (/^(PS|PETITESECTION|PETITS?)$/.test(t)) return 'Petite section';
    if (/^(GS|GRANDESECTION|GRANDS?)$/.test(t)) return 'Grande section';
    return COURS_EP.find(x => x === t) || '';
  }
  /** Cours d'une classe à partir d'un libellé (« CI-CP », « CI/CE2/CM1 », « CE1 + CE2 ») ou d'une liste */
  function coursDe(x) {
    const l = Array.isArray(x) ? x : String(x == null ? '' : x).split(/[\s,;/+\-–&]+|\bet\b/i);
    const out = []; l.map(cours).filter(Boolean).forEach(c => { if (!out.includes(c)) out.push(c); });
    return out.sort((a, b) => ordre(a) - ordre(b));
  }
  /** Type d'une classe d'après le nombre de cours (1 simple, 2 jumelée, 3 et plus multigrade) */
  const typeDe = (l) => { const n = coursDe(l).length; return n >= 3 ? 'multigrade' : n === 2 ? 'jumelee' : n === 1 ? 'simple' : ''; };
  const libelle = (cl) => coursDe(cl && cl.cours !== undefined ? cl.cours : cl).join('-');
  /** Comptage : classes = [{ cours: [...] } | 'CI-CP' | ['CI','CP']] → { simples, jumelees, multigrades, ouvertes, parCours } */
  function compter(classes) {
    const r = { simples: 0, jumelees: 0, multigrades: 0, ouvertes: 0, parCours: {} };
    (classes || []).forEach(cl => {
      const l = coursDe(cl && cl.cours !== undefined ? cl.cours : cl); if (!l.length) return;
      const t = typeDe(l); r[t === 'simple' ? 'simples' : t === 'jumelee' ? 'jumelees' : 'multigrades']++; r.ouvertes++;
      l.forEach(c => { r.parCours[c] = (r.parCours[c] || 0) + 1; });
    });
    return r;
  }
  /** Totaux déjà comptés (fiches, imports) : ouvertes = simples + jumelées + multigrades */
  function total(x) {
    const n = (v) => { const k = parseInt(v, 10); return Number.isFinite(k) && k > 0 ? k : 0; };
    const simples = n(x && (x.simples !== undefined ? x.simples : x.simple)), jumelees = n(x && (x.jumelees !== undefined ? x.jumelees : x.jumelee)),
      multigrades = n(x && (x.multigrades !== undefined ? x.multigrades : x.multi));
    return { simples, jumelees, multigrades, ouvertes: simples + jumelees + multigrades };
  }
  /** Classes déduites des attributions (un maître = une classe, avec les cours qu'il tient) */
  function depuisAttributions(attributions, cle) {
    const par = new Map();
    (attributions || []).forEach(a => { const k = cle ? cle(a) : (a.enseignantId || a.classeId); if (!k) return; const c = cours(a.cours || a.niveau || a.classe); if (!c) return;
      const l = par.get(k) || []; if (!l.includes(c)) l.push(c); par.set(k, l); });
    return [...par.values()].map(l => ({ cours: l.sort((a, b) => ordre(a) - ordre(b)), type: typeDe(l) }));
  }
  /** Écart avec les classes autorisées (information seulement, aucune contrainte) */
  function ecart(autorisees, ouvertes) {
    const a = parseInt(autorisees, 10), o = parseInt(ouvertes, 10) || 0;
    if (!Number.isFinite(a)) return { autorisees: null, ouvertes: o, ecart: null, etat: 'Autorisées non renseignées' };
    return { autorisees: a, ouvertes: o, ecart: o - a, etat: o > a ? 'Au-delà des classes autorisées (+' + (o - a) + ')' : o < a ? 'En deçà des classes autorisées (' + (o - a) + ')' : 'Conforme' };
  }
  /** Ratio sur les classes ouvertes (null si aucune classe) */
  const parClasse = (valeur, ouvertes, dec) => { const o = +ouvertes || 0; if (!o) return null; const k = Math.pow(10, dec === undefined ? 1 : dec); return Math.round(k * (+valeur || 0) / o) / k; };
  /** Contrôle de cohérence : un cours ne devrait figurer que dans une classe (simple avertissement) */
  function doublons(classes) {
    const vus = {}, d = [];
    (classes || []).forEach(cl => coursDe(cl && cl.cours !== undefined ? cl.cours : cl).forEach(c => { if (vus[c]) d.push(c); vus[c] = 1; }));
    return [...new Set(d)];
  }
  const ENTETES = ['Classes simples', 'Classes jumelées', 'Classes multigrades', 'Total classes ouvertes', 'Classes autorisées', 'Écart (ouvertes − autorisées)'];
  /** Ligne d'export : [simples, jumelées, multigrades, ouvertes, autorisées, écart] */
  function ligne(c, autorisees) { const e = ecart(autorisees, c.ouvertes); return [c.simples, c.jumelees, c.multigrades, c.ouvertes, e.autorisees === null ? '' : e.autorisees, e.ecart === null ? '' : e.ecart]; }
  global.ClassesOrg = { COURS_EP, SECTIONS_EM, TYPES, LIB_TYPE, ENTETES, cours, coursDe, typeDe, libelle, compter, total, depuisAttributions, ecart, parClasse, doublons, ligne };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.ClassesOrg;
})(typeof window !== 'undefined' ? window : globalThis);
