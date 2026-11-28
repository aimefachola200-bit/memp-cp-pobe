/* ÉduGestion Pro — règles métier officielles (MEMP).
   Toutes les décisions passent par ce module : une seule source de vérité. */
(function (global) {
  'use strict';
  const EG = global.EG;

  const VERSION_REGLES = 'MEMP-2026.1';

  /* Niveaux à passage automatique (maternelle) */
  const PASSAGE_AUTO = ['EM1', 'EM2', 'PETITS', 'MOYENS', 'GRANDS'];
  /* Niveaux jugés sur la moyenne générale ≥ 10 */
  const REGLE_MOYENNE = ['CI', 'CE1', 'CM1'];
  /* Niveaux jugés sur 2/3 de maîtrises */
  const REGLE_MAITRISES = ['CP', 'CE2', 'CM2'];

  const R = {
    VERSION_REGLES,
    PASSAGE_AUTO, REGLE_MOYENNE, REGLE_MAITRISES,

    estMaitrise(note) { return typeof note === 'number' && note >= 10; },

    /** Points de perfectionnement accordés selon la note obtenue. */
    perfectionnement(note) {
      if (typeof note !== 'number') return 0;
      if (note >= 18) return 2;
      if (note >= 15) return 1.5;
      if (note >= 10) return 1;
      return 0;
    },

    /** Moyenne pondérée sur une liste [{note, coefficient}], notes nulles ignorées. */
    moyenne(lignes) {
      let somme = 0, coefs = 0;
      lignes.forEach(l => {
        if (typeof l.note !== 'number' || isNaN(l.note)) return;
        const c = l.coefficient || 1;
        somme += l.note * c; coefs += c;
      });
      return coefs ? Math.round((somme / coefs) * 100) / 100 : null;
    },

    /** Nombre de matières maîtrisées et total noté. */
    maitrises(lignes) {
      const notees = lignes.filter(l => typeof l.note === 'number' && !isNaN(l.note));
      return { maitrisees: notees.filter(l => l.note >= 10).length, notees: notees.length };
    },

    mention(moy) {
      if (moy === null || moy === undefined) return '—';
      if (moy >= 18) return 'Excellent';
      if (moy >= 16) return 'Très bien';
      if (moy >= 14) return 'Bien';
      if (moy >= 12) return 'Assez bien';
      if (moy >= 10) return 'Passable';
      return 'Insuffisant';
    },

    /**
     * Décision de fin d'année.
     * Le CEP officiel admis est prioritaire : il vaut sortie du primaire.
     * ctx = { niveau, moyenne, maitrisees, notees, cep: {statut, admis} }
     */
    decision(ctx) {
      const niveau = ctx.niveau;
      if (niveau === 'CM2' && ctx.cep && ctx.cep.statut === 'OFFICIEL' && ctx.cep.admis === true) {
        return {
          decision: 'SORTIE_PRIMAIRE',
          motif: 'CEP officiel admis',
          force_par_cep: true,
          regle_version: VERSION_REGLES
        };
      }
      if (PASSAGE_AUTO.indexOf(niveau) >= 0) {
        return { decision: 'PASSAGE', motif: 'Passage automatique (maternelle)', force_par_cep: false, regle_version: VERSION_REGLES };
      }
      if (REGLE_MOYENNE.indexOf(niveau) >= 0) {
        const ok = typeof ctx.moyenne === 'number' && ctx.moyenne >= 10;
        return {
          decision: ok ? 'PASSAGE' : 'REDOUBLEMENT',
          motif: 'Moyenne ' + (ctx.moyenne === null || ctx.moyenne === undefined ? '—' : ctx.moyenne) + '/20 (seuil 10)',
          force_par_cep: false, regle_version: VERSION_REGLES
        };
      }
      if (REGLE_MAITRISES.indexOf(niveau) >= 0) {
        const requis = Math.ceil((ctx.notees || 0) * 2 / 3);
        const ok = (ctx.maitrisees || 0) >= requis && (ctx.notees || 0) > 0;
        return {
          decision: ok ? 'PASSAGE' : 'REDOUBLEMENT',
          motif: (ctx.maitrisees || 0) + ' maîtrise(s) sur ' + (ctx.notees || 0) + ' — ' + requis + ' requise(s)',
          force_par_cep: false, regle_version: VERSION_REGLES
        };
      }
      return { decision: null, motif: 'Niveau non couvert', force_par_cep: false, regle_version: VERSION_REGLES };
    },

    /**
     * Examen blanc CM2 : 6 maîtrises sur 9 matières, 6 sur 8 si l'EPS est dispensée.
     * lignes = [{note, dispense, matiere}]
     */
    examenBlanc(lignes) {
      const retenues = lignes.filter(l => !l.dispense);
      const total = retenues.length;
      const maitrisees = retenues.filter(l => typeof l.note === 'number' && l.note >= 10).length;
      const requis = 6;
      const moy = R.moyenne(retenues);
      return {
        total, maitrisees, requis,
        reussi: maitrisees >= requis,
        moyenne: moy,
        detail: maitrisees + '/' + total + ' maîtrises (' + requis + ' requises)'
      };
    },

    /** Âge de départ à la retraite selon la catégorie. */
    ageRetraite(categorie, regles) {
      const cat = (categorie || '').toUpperCase();
      if (regles && regles.length) {
        const r = regles.filter(x => x.actif !== false && x.categorie === cat)[0];
        if (r) return r.age_retraite;
      }
      if (cat.charAt(0) === 'A') return 60;
      if (cat === 'B1') return 58;
      if (cat === 'C1') return 55;
      return 60;
    },

    /** Prévision de retraite : date, années et mois restants. */
    previsionRetraite(agent, regles, aujourdhui) {
      if (!agent || !agent.date_naissance) return null;
      const age = R.ageRetraite(agent.categorie, regles);
      const dn = new Date(agent.date_naissance);
      if (isNaN(dn.getTime())) return null;
      const date = new Date(dn.getFullYear() + age, dn.getMonth(), dn.getDate());
      const ref = aujourdhui ? new Date(aujourdhui) : new Date();
      let mois = (date.getFullYear() - ref.getFullYear()) * 12 + (date.getMonth() - ref.getMonth());
      if (date.getDate() < ref.getDate()) mois -= 1;
      return {
        age_retraite: age,
        date_retraite: date.toISOString().slice(0, 10),
        mois_restants: mois,
        annees_restantes: Math.floor(mois / 12),
        mois_complementaires: ((mois % 12) + 12) % 12,
        echue: mois <= 0,
        age_actuel: R.age(agent.date_naissance, ref)
      };
    },

    age(dateNaissance, ref) {
      if (!dateNaissance) return null;
      const d = new Date(dateNaissance);
      if (isNaN(d.getTime())) return null;
      const r = ref ? new Date(ref) : new Date();
      let a = r.getFullYear() - d.getFullYear();
      const m = r.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && r.getDate() < d.getDate())) a--;
      return a;
    },

    /**
     * Score de risque de décrochage, 0-100, explicable.
     * Le handicap n'est jamais un facteur de risque : il déclenche un suivi
     * d'accompagnement, pas une alerte de décrochage.
     */
    scoreRisque(donnees, ponderations) {
      const p = Object.assign({
        absenteisme: 40, resultats: 25, redoublement: 15, retards: 10, cantine: 10
      }, ponderations || {});
      const facteurs = [];
      let score = 0;

      const tauxAbs = donnees.taux_absence || 0; // 0..1
      if (tauxAbs > 0) {
        const pts = Math.min(p.absenteisme, Math.round(tauxAbs * 100 / 30 * p.absenteisme));
        if (pts > 0) { score += pts; facteurs.push({ facteur: 'Absentéisme', valeur: Math.round(tauxAbs * 100) + ' % d\'absences', points: pts }); }
      }
      if (typeof donnees.moyenne === 'number') {
        if (donnees.moyenne < 10) {
          const pts = Math.round(p.resultats * Math.min(1, (10 - donnees.moyenne) / 5));
          score += pts; facteurs.push({ facteur: 'Résultats scolaires', valeur: 'Moyenne ' + donnees.moyenne + '/20', points: pts });
        }
      }
      if (donnees.redoublant) { score += p.redoublement; facteurs.push({ facteur: 'Redoublement', valeur: 'Élève redoublant', points: p.redoublement }); }
      if ((donnees.retards || 0) >= 5) { score += p.retards; facteurs.push({ facteur: 'Retards répétés', valeur: donnees.retards + ' retards', points: p.retards }); }
      if (donnees.cantine_irreguliere) { score += p.cantine; facteurs.push({ facteur: 'Fréquentation de la cantine', valeur: 'Participation irrégulière', points: p.cantine }); }

      score = Math.max(0, Math.min(100, Math.round(score)));
      let niveau = 'FAIBLE';
      if (score >= 75) niveau = 'CRITIQUE';
      else if (score >= 50) niveau = 'ELEVE';
      else if (score >= 25) niveau = 'MOYEN';
      return { score, niveau, facteurs };
    },

    /** Capacité d'accueil théorique à partir du mobilier (2 places par table-banc). */
    capaciteMobilier(inventaire) {
      let places = 0;
      inventaire.forEach(l => {
        const bons = typeof l.bon_etat === 'number' ? l.bon_etat : (l.quantite || 0);
        if (l.type_mobilier === 'TABLE_BANC') places += bons * 2;
        else if (l.type_mobilier === 'CHAISE' || l.type_mobilier === 'NATTE') places += bons;
      });
      return places;
    },

    /** Taux de complétion d'un formulaire de recensement. */
    completion(valeurs, champsAttendus) {
      if (!champsAttendus) return 0;
      const remplis = valeurs.filter(v => v.valeur !== null && v.valeur !== undefined && v.valeur !== '').length;
      return Math.min(100, Math.round(remplis / champsAttendus * 100));
    }
  };

  EG.Rules = R;
})(window);
