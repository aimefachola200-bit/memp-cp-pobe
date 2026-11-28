/* ÉduGestion Pro Master — classes ouvertes (règle commune outils/lots/spec-classes.md, aide js/classes.js) : une classe jumelée
   (2 cours) ou multigrade (3 cours et plus) compte pour UNE classe ; ouvertes = simples + jumelées + multigrades.
   Les fiches « Classes » sont tenues par cours : les cours d'une même classe physique sont regroupés par le champ
   « Classe jumelée / multigrade » (ex. « CI-CP »), à défaut par l'enseignant titulaire commun.
   Les classes autorisées restent une donnée à part (écart affiché, jamais bloquant) ; les ratios utilisent les ouvertes.
   Conception : Maître Aimé FACHOLA */
(function (global) {
  'use strict';
  const EG = global.EG = global.EG || {};
  const O = () => global.ClassesOrg;
  const num = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : 0; };
  const renseigne = (v) => v !== null && v !== undefined && v !== '';
  /** Classes physiques à partir des fiches « Classes » d'une école (actives) */
  function organisation(classes) {
    const groupes = new Map();
    (classes || []).filter(c => c && c.actif !== false && c.niveau).forEach(c => {
      const reg = O().coursDe(c.regroupement || '');
      const cle = reg.length > 1 ? 'R:' + reg.join('-') : (c.titulaire_id ? 'T:' + c.titulaire_id : 'C:' + c.id);
      const l = groupes.get(cle) || []; const n = O().cours(c.niveau); if (n && !l.includes(n)) l.push(n); groupes.set(cle, l);
    });
    return [...groupes.values()].filter(l => l.length).map(l => ({ cours: O().coursDe(l), type: O().typeDe(l) }));
  }
  /** { simples, jumelees, multigrades, ouvertes, autorisees, ecart, etat, source, classes } d'une école pour l'année */
  function ecole(e, classes, stat) {
    e = e || {};
    let c, source, liste = [];
    const recs = (classes || []).filter(x => x && x.actif !== false);
    if (recs.length) { liste = organisation(recs); c = O().compter(liste); source = 'classes de l’école'; }
    else if (renseigne(e.classes_simples) || renseigne(e.classes_jumelees) || renseigne(e.classes_multigrades)) {
      c = O().total({ simples: e.classes_simples, jumelees: e.classes_jumelees, multigrades: e.classes_multigrades }); source = 'fiche de l’école';
    } else if (num(e.classes_existantes)) { c = O().total({ simples: e.classes_existantes }); source = 'fiche de l’école (sans détail)'; }
    else c = { simples: 0, jumelees: 0, multigrades: 0, ouvertes: 0 };
    const autRaw = stat && renseigne(stat.classes_autorisees) ? stat.classes_autorisees : e.classes_autorisees;
    const ec = O().ecart(renseigne(autRaw) ? autRaw : NaN, c.ouvertes);
    return Object.assign({}, c, { autorisees: ec.autorisees, ecart: ec.ecart, etat: ec.etat, source: source || '', classes: liste });
  }
  /** Nombre de classes pour les ratios : ouvertes, à défaut (statistiques importées sans détail) les autorisées, signalées */
  function pourRatios(x) { return x.ouvertes ? { n: x.ouvertes, note: '' } : (x.autorisees ? { n: x.autorisees, note: 'classes autorisées (classes ouvertes non renseignées)' } : { n: 0, note: '' }); }
  const libelle = (x) => x.ouvertes + (x.jumelees || x.multigrades ? ' (' + [x.simples ? x.simples + ' simple(s)' : '', x.jumelees ? x.jumelees + ' jumelée(s)' : '', x.multigrades ? x.multigrades + ' multigrade(s)' : ''].filter(Boolean).join(', ') + ')' : '');
  EG.Classes = { organisation, ecole, pourRatios, libelle };
  if (typeof module !== 'undefined' && module.exports) module.exports = EG.Classes;
})(typeof window !== 'undefined' ? window : globalThis);
