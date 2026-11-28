/* ÉduGestion Pro Master — pilotage des évaluations et vie du personnel.
   Synthèse de la classe au national, examen blanc en centre, présence des agents. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, R = EG.Rules, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const charger = E.charger, editer = E.editer, indexer = E.indexer,
    inscriptionsEnrichies = E.inscriptionsEnrichies, entete = E.entete;

  const session = () => EG.session;
  const ecoleCourante = () => EG.session.ecole_id || null;
  const anneeCourante = () => EG.session.annee_id || null;
  const grille = (enfants, classe) => el('div', { class: 'grille ' + (classe || '') }, enfants);
  const nomEleve = e => e ? (e.nom || '').toUpperCase() + ' ' + (e.prenoms || '') : '—';
  const iso = d => d.toISOString().slice(0, 10);

  function sousSection(titre, contenu, action) {
    return el('section', { class: 'carte' }, [
      el('div', { class: 'ligne-entre' }, [el('h3', { class: 'carte-titre', text: titre }), action || null]),
      contenu
    ]);
  }

  /* Les neuf épreuves officielles. La dictée est une épreuve à part entière,
     distincte de la communication écrite. La maîtrise s'apprécie sur ce total :
     six épreuves sur neuf, ou six sur huit lorsque l'EPS est dispensée. */
  const EPREUVES = [
    { code: 'DICT', nom: 'Dictée', matieres: ['DICT'] },
    { code: 'COMM_ECR', nom: 'Communication écrite', matieres: ['COMM_ECR'] },
    { code: 'COMP_ECR', nom: 'Compréhension de l’écrit', matieres: ['COMP_ECR'] },
    { code: 'MATH', nom: 'Mathématiques', matieres: ['MATH'] },
    { code: 'ES', nom: 'Éducation sociale', matieres: ['ESC'] },
    { code: 'EST', nom: 'Éducation scientifique et technologique', matieres: ['EST'] },
    { code: 'EA_PLAST', nom: 'EA Plastique', matieres: ['EA_PLAST'] },
    { code: 'EA_VIV', nom: 'EA Vivant', matieres: ['EA_VIV'] },
    { code: 'EPS', nom: 'Éducation physique et sportive', matieres: ['EPS'] }
  ];
  const MAITRISES_REQUISES = 6;
  EG.EPREUVES = EPREUVES;

  function appreciation(taux) {
    if (taux === null || taux === undefined) return 'Non évalué';
    if (taux >= 90) return 'Très satisfaisant';
    if (taux >= 75) return 'Satisfaisant';
    if (taux >= 60) return 'Acceptable';
    if (taux >= 40) return 'Préoccupant';
    return 'À renforcer';
  }

  function tonAppreciation(taux) {
    if (taux === null || taux === undefined) return 'neutre';
    if (taux >= 75) return 'ok';
    if (taux >= 60) return 'info';
    if (taux >= 40) return 'attention';
    return 'danger';
  }

  function ecartType(valeurs) {
    if (valeurs.length < 2) return 0;
    const m = valeurs.reduce((s, v) => s + v, 0) / valeurs.length;
    return Math.round(Math.sqrt(valeurs.reduce((s, v) => s + (v - m) * (v - m), 0) / valeurs.length) * 100) / 100;
  }

  /* =======================================================================
     PANNEAU DE SYNTHÈSE DES ÉVALUATIONS
     ======================================================================= */

  Routeur.definir('synthese-evaluations', function (racine) {
    racine.appendChild(entete('Synthèse des évaluations',
      'De la classe au national : qui a composé, qui maîtrise, où faut-il renforcer.',
      [el('button', { class: 'btn btn-fantome', text: 'Synthèse officielle', onclick: () => Routeur.aller('synthese-officielle') }),
       el('button', { class: 'btn btn-fantome', text: 'Saisir les notes', onclick: () => Routeur.aller('evaluations') })]));
    const filtres = el('div', { class: 'barre-filtres' });
    const zone = el('div');
    racine.appendChild(filtres); racine.appendChild(zone);

    let niveauAgregation = 'CLASSE', evalId = '', portee = '';

    Promise.all([
      charger('evaluations', { annee_scolaire_id: anneeCourante() }),
      DB.all('territoires'), DB.all('ecoles')
    ]).then(([evals, territoires, ecoles]) => {
      if (!evals.length) {
        zone.appendChild(U.vide('Aucune évaluation n’est ouverte pour cette année.'));
        return;
      }
      const tri = evals.sort((a, b) => (a.numero - b.numero) || a.niveau.localeCompare(b.niveau));
      const numeros = [...new Set(tri.map(e => e.numero))].sort((a, b) => a - b);

      filtres.appendChild(U.selecteur('Évaluation',
        numeros.map(n => ({ value: String(n), label: 'Évaluation n° ' + n })),
        String(numeros[0]), v => { evalId = v; dessiner(); }, { vide: false }));
      evalId = String(numeros[0]);

      filtres.appendChild(U.selecteur('Agrégation', [
        { value: 'CLASSE', label: 'Par classe' },
        { value: 'COURS', label: 'Par cours' },
        { value: 'ECOLE', label: 'Par école' },
        { value: 'ZONE', label: 'Par zone pédagogique' },
        { value: 'CIRCONSCRIPTION', label: 'Par circonscription' },
        { value: 'DEPARTEMENT', label: 'Par département' },
        { value: 'NATIONAL', label: 'National' }
      ], niveauAgregation, v => { niveauAgregation = v; dessiner(); }, { vide: false }));

      dessiner();
    });

    function dessiner() {
      zone.textContent = '';
      Promise.all([
        DB.where('evaluations', { annee_scolaire_id: anneeCourante() }),
        DB.all('notes'), DB.all('matieres'), DB.all('classes'),
        DB.all('ecoles'), DB.all('territoires'), DB.all('eleves'),
        DB.where('inscriptions_eleves', { annee_scolaire_id: anneeCourante() })
      ]).then(([evals, notes, matieres, classes, ecoles, territoires, eleves, inscriptions]) => {
        const numero = Number(evalId);
        const evalsRetenues = evals.filter(e => e.numero === numero
          && (!ecoleCourante() || e.ecole_id === ecoleCourante()));
        if (!evalsRetenues.length) { zone.appendChild(U.vide('Aucune évaluation n° ' + numero + ' dans votre périmètre.')); return; }

        const idsEval = {}; evalsRetenues.forEach(e => { idsEval[e.id] = e; });
        const ie = indexer(eleves), ic = indexer(classes), iec = indexer(ecoles), it = indexer(territoires);
        const parCodeMatiere = {}; matieres.forEach(m => { parCodeMatiere[m.code] = m.id; });
        const matiereVersEpreuve = {};
        EPREUVES.forEach(ep => ep.matieres.forEach(code => {
          if (parCodeMatiere[code]) matiereVersEpreuve[parCodeMatiere[code]] = ep.code;
        }));

        const insParId = {};
        inscriptions.filter(i => !ecoleCourante() || i.ecole_id === ecoleCourante())
          .forEach(i => { insParId[i.id] = i; });

        /* Regroupement des notes par candidat, puis par épreuve. */
        const parCandidat = {};
        notes.filter(n => idsEval[n.evaluation_id] && insParId[n.inscription_id]).forEach(n => {
          const c = parCandidat[n.inscription_id] = parCandidat[n.inscription_id] || { epreuves: {} };
          const ep = matiereVersEpreuve[n.matiere_id];
          if (!ep || typeof n.note !== 'number') return;
          const e = c.epreuves[ep] = c.epreuves[ep] || { somme: 0, n: 0 };
          e.somme += n.note; e.n++;
        });

        /** Clé et libellé du regroupement demandé, pour une inscription donnée. */
        function groupe(ins) {
          const ecole = iec[ins.ecole_id];
          if (niveauAgregation === 'CLASSE') {
            const cl = ic[ins.classe_id];
            return { cle: ins.classe_id || ins.niveau, libelle: cl ? (cl.libelle || cl.code) : ins.niveau };
          }
          if (niveauAgregation === 'COURS') return { cle: ins.niveau, libelle: ins.niveau };
          if (niveauAgregation === 'ECOLE') return { cle: ins.ecole_id, libelle: ecole ? ecole.nom : '—' };
          if (niveauAgregation === 'NATIONAL') return { cle: 'BJ', libelle: 'Ensemble du périmètre' };
          let t = null;
          if (niveauAgregation === 'ZONE') t = ecole ? (it[ecole.zone_id] || it[ecole.up_id]) : null;
          else {
            t = ecole ? it[ecole.territoire_id] : null;
            if (niveauAgregation === 'DEPARTEMENT') {
              while (t && t.type !== 'DEPARTEMENT' && t.parent_id) t = it[t.parent_id];
            }
          }
          return { cle: t ? t.id : 'sans', libelle: t ? t.nom : 'Non rattaché' };
        }

        /* Agrégation */
        const cubes = {};
        Object.keys(insParId).forEach(id => {
          const ins = insParId[id];
          const evalDeLEcole = evalsRetenues.some(e => e.ecole_id === ins.ecole_id && e.niveau === ins.niveau);
          if (!evalDeLEcole) return;
          const g = groupe(ins);
          const c = cubes[g.cle] = cubes[g.cle] || {
            libelle: g.libelle, inscritsG: 0, inscritsF: 0, composeG: 0, composeF: 0,
            moyennes: [], moyennesG: [], moyennesF: [], reussisG: 0, reussisF: 0,
            maitrisePartielle: 0, maitriseMinimale: 0, epreuves: {}
          };
          const fille = ie[ins.eleve_id] && ie[ins.eleve_id].sexe === 'F';
          if (fille) c.inscritsF++; else c.inscritsG++;

          const candidat = parCandidat[id];
          if (!candidat) return;
          const notesEpreuves = EPREUVES.map(ep => {
            const e = candidat.epreuves[ep.code];
            return e && e.n ? Math.round(e.somme / e.n * 100) / 100 : null;
          });
          const notees = notesEpreuves.filter(n => n !== null);
          if (!notees.length) return;

          if (fille) c.composeF++; else c.composeG++;
          const moyenne = Math.round(notees.reduce((s, n) => s + n, 0) / notees.length * 100) / 100;
          const maitrises = notees.filter(n => n >= 10).length;
          c.moyennes.push(moyenne);
          (fille ? c.moyennesF : c.moyennesG).push(moyenne);
          /* Maîtrise minimale : six épreuves au moins. Partielle : de trois à cinq. */
          if (maitrises >= MAITRISES_REQUISES) { c.maitriseMinimale++; if (fille) c.reussisF++; else c.reussisG++; }
          else if (maitrises >= 3) c.maitrisePartielle++;

          EPREUVES.forEach((ep, k) => {
            const note = notesEpreuves[k];
            const s = c.epreuves[ep.code] = c.epreuves[ep.code]
              || { composants: 0, maitrises: 0, somme: 0, meilleure: null, plusFaible: null,
                   meilleurNom: '', faibleNom: '', reussisG: 0, reussisF: 0, composeG: 0, composeF: 0 };
            if (note === null) return;
            s.composants++; s.somme += note;
            if (fille) s.composeF++; else s.composeG++;
            if (note >= 10) { s.maitrises++; if (fille) s.reussisF++; else s.reussisG++; }
            const nom = nomEleve(ie[ins.eleve_id]);
            if (s.meilleure === null || note > s.meilleure) { s.meilleure = note; s.meilleurNom = nom; }
            if (s.plusFaible === null || note < s.plusFaible) { s.plusFaible = note; s.faibleNom = nom; }
          });
        });

        const lignes = Object.keys(cubes).map(k => {
          const c = cubes[k];
          const inscrits = c.inscritsG + c.inscritsF;
          const compose = c.composeG + c.composeF;
          const reussis = c.reussisG + c.reussisF;
          return Object.assign({ cle: k }, c, {
            inscrits, compose, absents: inscrits - compose, reussis,
            taux: compose ? Math.round(reussis / compose * 1000) / 10 : null,
            moyenne: c.moyennes.length
              ? Math.round(c.moyennes.reduce((s, m) => s + m, 0) / c.moyennes.length * 100) / 100 : null,
            ecartType: ecartType(c.moyennes)
          });
        }).sort((a, b) => (b.taux || 0) - (a.taux || 0));

        if (!lignes.length) { zone.appendChild(U.vide('Aucune note saisie pour cette évaluation.')); return; }

        /* --- Totaux --- */
        const total = lignes.reduce((acc, l) => ({
          inscritsG: acc.inscritsG + l.inscritsG, inscritsF: acc.inscritsF + l.inscritsF,
          composeG: acc.composeG + l.composeG, composeF: acc.composeF + l.composeF,
          reussisG: acc.reussisG + l.reussisG, reussisF: acc.reussisF + l.reussisF,
          partielle: acc.partielle + l.maitrisePartielle, minimale: acc.minimale + l.maitriseMinimale,
          moyennes: acc.moyennes.concat(l.moyennes),
          moyennesG: acc.moyennesG.concat(l.moyennesG), moyennesF: acc.moyennesF.concat(l.moyennesF)
        }), { inscritsG: 0, inscritsF: 0, composeG: 0, composeF: 0, reussisG: 0, reussisF: 0,
              partielle: 0, minimale: 0, moyennes: [], moyennesG: [], moyennesF: [] });

        const inscrits = total.inscritsG + total.inscritsF;
        const compose = total.composeG + total.composeF;
        const reussis = total.reussisG + total.reussisF;
        const tauxGlobal = compose ? Math.round(reussis / compose * 1000) / 10 : null;
        const moyenneGlobale = total.moyennes.length
          ? Math.round(total.moyennes.reduce((s, m) => s + m, 0) / total.moyennes.length * 100) / 100 : null;

        zone.appendChild(grille([
          U.stat(U.nombre(inscrits), 'Inscrits'),
          U.stat(U.nombre(compose), 'Ont composé'),
          U.stat(U.nombre(inscrits - compose), 'Absents', inscrits - compose ? 'attention' : ''),
          U.stat(tauxGlobal === null ? '—' : tauxGlobal + ' %', 'Réussite', tauxGlobal !== null && tauxGlobal < 60 ? 'attention' : ''),
          U.stat(moyenneGlobale === null ? '—' : moyenneGlobale.toFixed(2), 'Moyenne'),
          U.stat(ecartType(total.moyennes).toFixed(2), 'Écart-type')
        ], 'grille-stats'));

        /* --- Tableau par regroupement --- */
        zone.appendChild(sousSection('Résultats ' + libelleAgregation(), U.tableau([
          { titre: libelleColonne(), valeur: l => l.libelle },
          { titre: 'Inscrits (G/F)', valeur: l => l.inscrits + ' (' + l.inscritsG + '/' + l.inscritsF + ')' },
          { titre: 'Ont composé', valeur: l => l.compose },
          { titre: 'Maîtrise minimale', valeur: l => l.maitriseMinimale },
          { titre: 'Maîtrise partielle', valeur: l => l.maitrisePartielle },
          { titre: 'Moyenne', valeur: l => l.moyenne === null ? '—' : l.moyenne.toFixed(2) },
          { titre: 'Réussite', valeur: l => l.taux === null ? '—' : U.badge(l.taux + ' %', tonAppreciation(l.taux)) }
        ], lignes, { messageVide: 'Aucun résultat.' })));

        /* --- Analyse quantitative --- */
        const quantitative = [
          { indicateur: 'Élèves inscrits', valeur: inscrits,
            lecture: inscrits + ' élève(s) étaient attendus à l’évaluation n° ' + numero + '.' },
          { indicateur: 'Élèves ayant composé', valeur: compose,
            lecture: compose + ' ont effectivement composé, soit '
              + (inscrits ? Math.round(compose / inscrits * 100) : 0) + ' % des inscrits.' },
          { indicateur: 'Élèves absents', valeur: inscrits - compose,
            lecture: (inscrits - compose) + ' absence(s) — autant de résultats manquants pour le suivi.' },
          { indicateur: 'Maîtrise minimale atteinte', valeur: total.minimale,
            lecture: total.minimale + ' élève(s) maîtrisent au moins six épreuves sur neuf.' },
          { indicateur: 'Maîtrise partielle', valeur: total.partielle,
            lecture: total.partielle + ' élève(s) sont entre trois et cinq maîtrises : un soutien ciblé les fait basculer.' },
          { indicateur: 'Taux de réussite', valeur: (tauxGlobal === null ? '—' : tauxGlobal + ' %'),
            lecture: tauxGlobal === null ? 'Pas encore calculable.' : 'Taux de réussite global : ' + tauxGlobal + ' %.' },
          { indicateur: 'Taux d’échec', valeur: (tauxGlobal === null ? '—' : (Math.round((100 - tauxGlobal) * 10) / 10) + ' %'),
            lecture: tauxGlobal === null ? '—' : (Math.round((100 - tauxGlobal) * 10) / 10) + ' % des composants n’atteignent pas le seuil.' },
          { indicateur: 'Moyenne', valeur: moyenneGlobale === null ? '—' : moyenneGlobale.toFixed(2),
            lecture: moyenneGlobale === null ? '—' : 'Moyenne générale : ' + moyenneGlobale.toFixed(2) + '/20.' },
          { indicateur: 'Écart-type', valeur: ecartType(total.moyennes).toFixed(2),
            lecture: ecartType(total.moyennes) > 4
              ? 'Écart-type élevé : la classe est très hétérogène.'
              : 'Écart-type modéré : les résultats sont resserrés.' }
        ];
        zone.appendChild(sousSection('Analyse quantitative', U.tableau([
          { titre: 'Indicateur', valeur: q => q.indicateur },
          { titre: 'Valeur', valeur: q => String(q.valeur) },
          { titre: 'Lecture', valeur: q => q.lecture }
        ], quantitative)));

        /* --- Analyse qualitative --- */
        const qualitative = lignes.map(l => ({
          libelle: l.libelle, taux: l.taux,
          appreciation: appreciation(l.taux),
          commentaire: l.taux === null ? 'Aucune note exploitable.'
            : (l.taux >= 75 ? 'Les acquis sont consolidés ; maintenir le rythme.'
              : l.taux >= 60 ? 'Les bases sont là ; cibler les élèves en maîtrise partielle.'
                : l.taux >= 40 ? 'Résultats fragiles ; un plan de remédiation s’impose.'
                  : 'Situation critique ; reprendre les apprentissages fondamentaux.')
        }));
        zone.appendChild(sousSection('Analyse qualitative', U.tableau([
          { titre: libelleColonne(), valeur: q => q.libelle },
          { titre: 'Réussite', valeur: q => q.taux === null ? '—' : q.taux + ' %' },
          { titre: 'Appréciation', valeur: q => U.badge(q.appreciation, tonAppreciation(q.taux)) },
          { titre: 'Ce que cela appelle', valeur: q => q.commentaire }
        ], qualitative)));

        /* --- Écarts entre filles et garçons --- */
        const moyG = total.moyennesG.length
          ? total.moyennesG.reduce((s, m) => s + m, 0) / total.moyennesG.length : null;
        const moyF = total.moyennesF.length
          ? total.moyennesF.reduce((s, m) => s + m, 0) / total.moyennesF.length : null;
        const tauxG = total.composeG ? Math.round(total.reussisG / total.composeG * 1000) / 10 : null;
        const tauxF = total.composeF ? Math.round(total.reussisF / total.composeF * 1000) / 10 : null;
        const genre = [
          { i: 'Inscrits', g: total.inscritsG, f: total.inscritsF },
          { i: 'Ont composé', g: total.composeG, f: total.composeF },
          { i: 'Taux de réussite', g: tauxG === null ? null : tauxG, f: tauxF === null ? null : tauxF, pourcent: true },
          { i: 'Moyenne', g: moyG === null ? null : Math.round(moyG * 100) / 100, f: moyF === null ? null : Math.round(moyF * 100) / 100 }
        ].map(x => Object.assign(x, {
          ecart: (x.g === null || x.f === null) ? null : Math.round((x.f - x.g) * 100) / 100
        }));
        zone.appendChild(sousSection('Écarts entre filles et garçons', el('div', {}, [
          U.tableau([
            { titre: 'Indicateur', valeur: x => x.i },
            { titre: 'Garçons', valeur: x => x.g === null ? '—' : x.g + (x.pourcent ? ' %' : '') },
            { titre: 'Filles', valeur: x => x.f === null ? '—' : x.f + (x.pourcent ? ' %' : '') },
            { titre: 'Écart F − G', valeur: x => x.ecart === null ? '—'
              : U.badge((x.ecart > 0 ? '+' : '') + x.ecart + (x.pourcent ? ' pts' : ''),
                Math.abs(x.ecart) < 0.5 ? 'ok' : (x.ecart < 0 ? 'attention' : 'info')) }
          ], genre),
          el('p', { class: 'muet petit', text: (tauxF !== null && tauxG !== null)
            ? (Math.abs(tauxF - tauxG) < 5
              ? 'Filles et garçons réussissent dans les mêmes proportions.'
              : (tauxF < tauxG ? 'Les filles réussissent moins bien : à examiner avec l’équipe.'
                : 'Les garçons réussissent moins bien : à examiner avec l’équipe.'))
            : 'Pas assez de résultats pour comparer.' })
        ])));

        /* --- Épreuves fortes et faibles --- */
        const parEpreuve = EPREUVES.map(ep => {
          const cumul = lignes.reduce((acc, l) => {
            const s = l.epreuves[ep.code];
            if (!s) return acc;
            return {
              composants: acc.composants + s.composants, maitrises: acc.maitrises + s.maitrises,
              somme: acc.somme + s.somme,
              reussisG: acc.reussisG + s.reussisG, reussisF: acc.reussisF + s.reussisF,
              composeG: acc.composeG + s.composeG, composeF: acc.composeF + s.composeF,
              meilleure: (acc.meilleure === null || (s.meilleure !== null && s.meilleure > acc.meilleure))
                ? s.meilleure : acc.meilleure,
              meilleurNom: (acc.meilleure === null || (s.meilleure !== null && s.meilleure > acc.meilleure))
                ? s.meilleurNom : acc.meilleurNom,
              plusFaible: (acc.plusFaible === null || (s.plusFaible !== null && s.plusFaible < acc.plusFaible))
                ? s.plusFaible : acc.plusFaible,
              faibleNom: (acc.plusFaible === null || (s.plusFaible !== null && s.plusFaible < acc.plusFaible))
                ? s.faibleNom : acc.faibleNom
            };
          }, { composants: 0, maitrises: 0, somme: 0, reussisG: 0, reussisF: 0, composeG: 0, composeF: 0,
               meilleure: null, meilleurNom: '', plusFaible: null, faibleNom: '' });
          return Object.assign({ epreuve: ep.nom }, cumul, {
            moyenne: cumul.composants ? Math.round(cumul.somme / cumul.composants * 100) / 100 : null,
            taux: cumul.composants ? Math.round(cumul.maitrises / cumul.composants * 1000) / 10 : null,
            tauxG: cumul.composeG ? Math.round(cumul.reussisG / cumul.composeG * 1000) / 10 : null,
            tauxF: cumul.composeF ? Math.round(cumul.reussisF / cumul.composeF * 1000) / 10 : null
          });
        }).filter(x => x.composants > 0);

        const triees = parEpreuve.slice().sort((a, b) => (b.taux || 0) - (a.taux || 0));
        if (triees.length) {
          zone.appendChild(sousSection('Épreuves fortes et faibles', el('div', {}, [
            el('p', { class: 'muet', text: 'Épreuve la mieux réussie : ' + triees[0].epreuve
              + ' (' + triees[0].taux + ' %). La plus faible : ' + triees[triees.length - 1].epreuve
              + ' (' + triees[triees.length - 1].taux + ' %).' }),
            U.tableau([
              { titre: 'Épreuve', valeur: x => x.epreuve },
              { titre: 'Ont composé', valeur: x => x.composants },
              { titre: 'Atteignent le seuil', valeur: x => x.maitrises },
              { titre: 'Moyenne', valeur: x => x.moyenne === null ? '—' : x.moyenne.toFixed(2) },
              { titre: 'Réussite', valeur: x => U.badge(x.taux + ' %', tonAppreciation(x.taux)) },
              { titre: 'G / F', valeur: x => (x.tauxG === null ? '—' : x.tauxG + ' %') + ' / ' + (x.tauxF === null ? '—' : x.tauxF + ' %') },
              { titre: 'Meilleure note', valeur: x => x.meilleure === null ? '—' : x.meilleure + ' — ' + x.meilleurNom },
              { titre: 'Plus faible', valeur: x => x.plusFaible === null ? '—' : x.plusFaible + ' — ' + x.faibleNom }
            ], parEpreuve)
          ])));
        }

        zone.appendChild(el('div', { class: 'barre-actions' }, [
          el('button', { class: 'btn btn-primaire', text: 'Éditer la synthèse',
            onclick: () => editerSynthese(numero, lignes, quantitative, qualitative, genre, parEpreuve) }),
          el('button', { class: 'btn btn-fantome', text: 'Télécharger en Excel',
            onclick: () => exporterSynthese(numero, lignes, quantitative, qualitative, genre, parEpreuve) })
        ]));
      });
    }

    function libelleAgregation() {
      return { CLASSE: 'par classe', COURS: 'par cours', ECOLE: 'par école', ZONE: 'par zone pédagogique',
        CIRCONSCRIPTION: 'par circonscription', DEPARTEMENT: 'par département',
        NATIONAL: 'sur l’ensemble du périmètre' }[niveauAgregation];
    }
    function libelleColonne() {
      return { CLASSE: 'Classe', COURS: 'Cours', ECOLE: 'École', ZONE: 'Zone pédagogique',
        CIRCONSCRIPTION: 'Circonscription', DEPARTEMENT: 'Département', NATIONAL: 'Périmètre' }[niveauAgregation];
    }

    function editerSynthese(numero, lignes, quantitative, qualitative, genre, parEpreuve) {
      const t = (entetes, corps) => '<table class="sco"><thead><tr>' + entetes.map(h => '<th>' + h + '</th>').join('')
        + '</tr></thead><tbody>' + corps + '</tbody></table>';
      EG.genererDocument('SYNTHESE_EVAL', 'Synthèse de l’évaluation n° ' + numero,
        EG.DocsSco.titre('Synthèse de l’évaluation n° ' + numero, (session().ecole_nom ? session().ecole_nom + ' — ' : '') + 'Année scolaire ' + session().annee_code
          + ' — agrégation ' + libelleAgregation())
        + '<h3 class="sco">Résultats</h3>'
        + t([libelleColonne(), 'Inscrits', 'Ont composé', 'Maîtrise minimale', 'Maîtrise partielle', 'Moyenne', 'Réussite'],
          lignes.map(l => '<tr><td>' + EG.Docs.echapper(l.libelle) + '</td><td>' + l.inscrits + '</td><td>'
            + l.compose + '</td><td>' + l.maitriseMinimale + '</td><td>' + l.maitrisePartielle + '</td><td>'
            + (l.moyenne === null ? '—' : l.moyenne.toFixed(2)) + '</td><td>'
            + (l.taux === null ? '—' : l.taux + ' %') + '</td></tr>').join(''))
        + '<h3 class="sco">Analyse quantitative</h3>'
        + t(['Indicateur', 'Valeur', 'Lecture'], quantitative.map(q =>
          '<tr><td>' + q.indicateur + '</td><td>' + q.valeur + '</td><td>' + EG.Docs.echapper(q.lecture) + '</td></tr>').join(''))
        + '<h3 class="sco">Analyse qualitative</h3>'
        + t([libelleColonne(), 'Réussite', 'Appréciation', 'Ce que cela appelle'], qualitative.map(q =>
          '<tr><td>' + EG.Docs.echapper(q.libelle) + '</td><td>' + (q.taux === null ? '—' : q.taux + ' %')
          + '</td><td>' + q.appreciation + '</td><td>' + q.commentaire + '</td></tr>').join(''))
        + '<h3 class="sco">Écarts entre filles et garçons</h3>'
        + t(['Indicateur', 'Garçons', 'Filles', 'Écart F − G'], genre.map(x =>
          '<tr><td>' + x.i + '</td><td>' + (x.g === null ? '—' : x.g) + '</td><td>'
          + (x.f === null ? '—' : x.f) + '</td><td>' + (x.ecart === null ? '—' : x.ecart) + '</td></tr>').join(''))
        + '<h3 class="sco">Épreuves fortes et faibles</h3>'
        + t(['Épreuve', 'Ont composé', 'Atteignent le seuil', 'Moyenne', 'Réussite'], parEpreuve.map(x =>
          '<tr><td>' + x.epreuve + '</td><td>' + x.composants + '</td><td>' + x.maitrises + '</td><td>'
          + (x.moyenne === null ? '—' : x.moyenne.toFixed(2)) + '</td><td>' + x.taux + ' %</td></tr>').join('')), { paysage: true });
    }

    function exporterSynthese(numero, lignes, quantitative, qualitative, genre, parEpreuve) {
      const blob = EG.Tableur.construire([
        { nom: 'Synthèse', lignes: [[libelleColonne(), 'Inscrits G', 'Inscrits F', 'Inscrits total',
          'Ont composé G', 'Ont composé F', 'Ont composé total', 'Maîtrise partielle', 'Maîtrise minimale',
          'Moyenne', '% réussite']].concat(lignes.map(l => [l.libelle, l.inscritsG, l.inscritsF, l.inscrits,
            l.composeG, l.composeF, l.compose, l.maitrisePartielle, l.maitriseMinimale,
            l.moyenne === null ? '' : l.moyenne, l.taux === null ? '' : l.taux])) },
        { nom: 'Analyse quantitative', lignes: [['Indicateur', 'Valeur', 'Lecture']]
          .concat(quantitative.map(q => [q.indicateur, q.valeur, q.lecture])) },
        { nom: 'Analyse qualitative', lignes: [[libelleColonne(), 'Taux de réussite', 'Appréciation', 'Ce que cela appelle']]
          .concat(qualitative.map(q => [q.libelle, q.taux === null ? '' : q.taux, q.appreciation, q.commentaire])) },
        { nom: 'Écarts de genre', lignes: [['Indicateur', 'Garçons', 'Filles', 'Écart F-G']]
          .concat(genre.map(x => [x.i, x.g, x.f, x.ecart])) },
        { nom: 'Épreuves', lignes: [['Épreuve', 'Ont composé', 'Atteignent le seuil', 'Moyenne', '% réussite', '% G', '% F']]
          .concat(parEpreuve.map(x => [x.epreuve, x.composants, x.maitrises, x.moyenne, x.taux, x.tauxG, x.tauxF])) }
      ]);
      const nom = 'synthese-evaluation-' + numero + '.xlsx';
      const a = el('a', { href: URL.createObjectURL(blob), download: nom });
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      U.toast('Classeur « ' + nom + ' » téléchargé');
    }
  });

  /* =======================================================================
     EXAMEN BLANC EN CENTRE DE CIRCONSCRIPTION
     ======================================================================= */

  Routeur.definir('cep-blanc-centre', function (racine) {
    racine.appendChild(entete('Examen blanc en centre',
      'Plusieurs écoles composent ensemble : saisie des neuf épreuves, classement et relevé de centre.',
      EG.peutEcrire() ? [el('button', {
        class: 'btn btn-primaire', text: 'Nouveau centre', onclick: () => creerCentre()
      })] : null));
    const filtres = el('div', { class: 'barre-filtres' });
    const zone = el('div');
    racine.appendChild(filtres); racine.appendChild(zone);
    let centreId = '';

    charger('centres_examen', { annee_scolaire_id: anneeCourante() }).then(centres => {
      if (!centres.length) {
        zone.appendChild(U.vide('Aucun centre d’examen blanc n’est ouvert pour cette année.',
          EG.peutEcrire() ? el('button', { class: 'btn btn-primaire', text: 'Ouvrir un centre', onclick: creerCentre }) : null));
        return;
      }
      centreId = centres[0].id;
      filtres.appendChild(U.selecteur('Centre', centres.map(c => ({
        value: c.id, label: c.nom + ' — épreuve ' + (c.numero || 1)
      })), centreId, v => { centreId = v; dessiner(); }, { vide: false }));
      dessiner();
    });

    function creerCentre() {
      DB.all('territoires').then(territoires => {
        editer('centres_examen', {
          annee_scolaire_id: anneeCourante(), numero: 1, statut: 'PREPARATION',
          date_composition: iso(new Date()),
          chef_centre: (session().user.nom || '') + ' ' + (session().user.prenoms || '')
        }, () => Routeur.aller('cep-blanc-centre'));
      });
    }

    function dessiner() {
      zone.textContent = '';
      Promise.all([
        DB.get('centres_examen', centreId),
        DB.where('compositions_centre', { centre_id: centreId }),
        inscriptionsEnrichies({ niveau: 'CM2', statuts: ['ACTIF', 'SORTIE_PRIMAIRE_CEP'] }),
        DB.all('ecoles'), DB.all('territoires')
      ]).then(([centre, compositions, candidats, ecoles, territoires]) => {
        if (!centre) { zone.appendChild(U.vide('Centre introuvable.')); return; }
        const iec = indexer(ecoles), it = indexer(territoires);
        const parIns = {}; compositions.forEach(c => { parIns[c.inscription_id] = c; });
        const verrouille = ['VALIDE', 'VERROUILLE'].indexOf(centre.statut) >= 0;

        zone.appendChild(el('div', { class: 'ligne-entre' }, [
          el('div', {}, [
            el('h3', { text: centre.nom }),
            el('p', { class: 'muet petit', text: 'Chef de centre : ' + (centre.chef_centre || '—')
              + ' • composition du ' + U.dateCourte(centre.date_composition)
              + ' • ' + ((it[centre.territoire_id] || {}).nom || 'circonscription non précisée') })
          ]),
          U.statut(centre.statut)
        ]));

        if (!candidats.length) { zone.appendChild(U.vide('Aucun candidat de CM2 dans votre périmètre.')); return; }

        /* Grille de saisie : une colonne par épreuve officielle. */
        const table = el('table', { class: 'tableau grille-notes' });
        table.appendChild(el('thead', {}, el('tr', {},
          [el('th', { class: 'colle', text: 'N° / Candidat' }), el('th', { text: 'École' })]
            .concat(EPREUVES.map(ep => el('th', { text: ep.code, title: ep.nom })))
            .concat([el('th', { text: 'Total' }), el('th', { text: 'Moy.' }),
              el('th', { text: 'Maîtr.' }), el('th', { text: 'Abs.' })]))));
        const tb = el('tbody');
        const controles = {};

        candidats.forEach((cand, k) => {
          const enregistree = parIns[cand.id] || {};
          const notes = enregistree.notes || {};
          const tr = el('tr');
          tr.appendChild(el('th', { class: 'colle', text: (k + 1) + '. ' + cand._nom }));
          tr.appendChild(el('td', { text: (iec[cand.ecole_id] || {}).nom || '—' }));

          const cellTotal = el('td', { class: 'cel-calc' });
          const cellMoy = el('td', { class: 'cel-calc' });
          const cellMai = el('td', { class: 'cel-calc' });
          const absent = el('input', { type: 'checkbox', 'aria-label': 'Absent' });
          absent.checked = !!enregistree.absent;

          const champs = {};
          const recalcule = () => {
            const valeurs = EPREUVES.map(ep => {
              const v = champs[ep.code].value;
              return v === '' ? null : Number(v);
            }).filter(v => v !== null && !isNaN(v));
            const total = valeurs.reduce((s, v) => s + v, 0);
            const moy = valeurs.length ? total / valeurs.length : null;
            const mai = valeurs.filter(v => v >= 10).length;
            cellTotal.textContent = valeurs.length ? total.toFixed(2) : '—';
            cellMoy.textContent = moy === null ? '—' : moy.toFixed(2);
            cellMoy.className = 'cel-calc ' + (moy !== null && moy < 10 ? 'sous-seuil' : '');
            cellMai.textContent = mai + '/' + valeurs.length;
            cellMai.className = 'cel-calc ' + (mai >= 6 ? '' : 'sous-seuil');
          };

          EPREUVES.forEach(ep => {
            const inp = el('input', {
              type: 'number', min: 0, max: 20, step: '0.25', class: 'cel-note',
              'aria-label': cand._nom + ' — ' + ep.nom,
              value: typeof notes[ep.code] === 'number' ? notes[ep.code] : ''
            });
            if (verrouille) inp.disabled = true;
            inp.addEventListener('input', recalcule);
            champs[ep.code] = inp;
            tr.appendChild(el('td', {}, inp));
          });
          if (verrouille) absent.disabled = true;
          tr.appendChild(cellTotal); tr.appendChild(cellMoy); tr.appendChild(cellMai);
          tr.appendChild(el('td', {}, absent));
          tb.appendChild(tr);
          controles[cand.id] = { champs, absent, enregistree, cand };
          setTimeout(recalcule, 0);
        });
        table.appendChild(tb);
        zone.appendChild(el('div', { class: 'tableau-enveloppe defilant' }, table));

        const actions = [];
        if (!verrouille && EG.peutEcrire()) {
          actions.push(el('button', {
            class: 'btn btn-primaire', text: 'Enregistrer et classer', onclick: () => {
              const rows = candidats.map((cand, k) => {
                const c = controles[cand.id];
                const notes = {};
                let total = 0, comptees = 0, maitrises = 0;
                EPREUVES.forEach(ep => {
                  const v = c.champs[ep.code].value;
                  if (v === '') return;
                  const n = Number(v);
                  if (isNaN(n) || n < 0 || n > 20) return;
                  notes[ep.code] = n; total += n; comptees++;
                  if (n >= 10) maitrises++;
                });
                return Object.assign({}, c.enregistree, {
                  centre_id: centreId, inscription_id: cand.id, ecole_id: cand.ecole_id,
                  numero_ordre: k + 1, notes: notes,
                  total: comptees ? Math.round(total * 100) / 100 : null,
                  moyenne: comptees ? Math.round(total / comptees * 100) / 100 : null,
                  maitrises: maitrises, absent: c.absent.checked
                });
              });
              /* Le classement se fait sur la moyenne, à l'échelle du centre entier. */
              const classables = rows.filter(r => r.moyenne !== null && !r.absent)
                .sort((a, b) => b.moyenne - a.moyenne);
              classables.forEach((r, i) => { r.rang = i + 1; });
              rows.filter(r => classables.indexOf(r) < 0).forEach(r => { r.rang = null; });

              DB.putBatch('compositions_centre', rows)
                .then(() => DB.audit('EXAMEN_BLANC_CENTRE', 'centres_examen', centreId,
                  { candidats: rows.length, classes: classables.length }))
                .then(() => { U.toast(rows.length + ' composition(s) enregistrée(s)'); dessiner(); EG.majSynchro(); });
            }
          }));
          actions.push(el('button', {
            class: 'btn btn-fantome', text: centre.statut === 'VALIDE' ? 'Verrouiller' : 'Valider le centre',
            onclick: () => {
              const suivant = centre.statut === 'VALIDE' ? 'VERROUILLE' : 'VALIDE';
              DB.put('centres_examen', Object.assign({}, centre, { statut: suivant }))
                .then(() => { U.toast('Centre ' + U.libelle(suivant).toLowerCase()); dessiner(); EG.majSynchro(); });
            }
          }));
        }
        actions.push(el('button', { class: 'btn btn-fantome', text: 'Modifier le centre',
          onclick: () => editer('centres_examen', centre, dessiner) }));
        actions.push(el('button', { class: 'btn btn-fantome', text: 'Éditer le relevé de centre',
          onclick: () => releveCentre(centre, compositions, candidats, iec, it) }));
        actions.push(el('button', { class: 'btn btn-fantome', text: 'Télécharger en Excel',
          onclick: () => exporterCentre(centre, compositions, candidats, iec, it) }));
        zone.appendChild(el('div', { class: 'barre-actions' }, actions));

        /* Résultats classés */
        const classes = compositions.filter(c => c.rang).sort((a, b) => a.rang - b.rang);
        if (classes.length) {
          const parIns2 = indexer(candidats);
          const reussis = classes.filter(c => (c.maitrises || 0) >= MAITRISES_REQUISES).length;
          zone.appendChild(sousSection('Classement du centre', el('div', {}, [
            grille([
              U.stat(U.nombre(classes.length), 'Ont composé'),
              U.stat(U.nombre(reussis), 'Six maîtrises ou plus'),
              U.stat(Math.round(reussis / classes.length * 100) + ' %', 'Réussite simulée',
                reussis / classes.length < 0.5 ? 'attention' : '')
            ], 'grille-stats'),
            U.tableau([
              { titre: 'Rang', valeur: c => c.rang },
              { titre: 'Candidat', valeur: c => (parIns2[c.inscription_id] || {})._nom || '—' },
              { titre: 'École', valeur: c => (iec[c.ecole_id] || {}).nom || '—' },
              { titre: 'Total', valeur: c => c.total === null ? '—' : c.total.toFixed(2) },
              { titre: 'Moyenne', valeur: c => c.moyenne === null ? '—' : c.moyenne.toFixed(2) },
              { titre: 'Maîtrises', valeur: c => U.badge(c.maitrises + '/' + EPREUVES.length, c.maitrises >= 6 ? 'ok' : 'danger') }
            ], classes)
          ])));
        }
      });
    }

    function enTeteCentre(centre, it) {
      const circo = (it[centre.territoire_id] || {}).nom || '';
      return '<table><tbody><tr><td>Circonscription</td><th>' + EG.Docs.echapper(circo)
        + '</th><td>Commune</td><th>' + EG.Docs.echapper(centre.commune || '—') + '</th></tr>'
        + '<tr><td>Centre de composition</td><th>' + EG.Docs.echapper(centre.nom)
        + '</th><td>Année scolaire</td><th>' + session().annee_code + '</th></tr>'
        + '<tr><td>Chef de centre</td><th>' + EG.Docs.echapper(centre.chef_centre || '—')
        + '</th><td>Date de composition</td><th>' + U.dateCourte(centre.date_composition) + '</th></tr>'
        + '</tbody></table>';
    }

    function releveCentre(centre, compositions, candidats, iec, it) {
      const parIns = indexer(candidats);
      const triees = compositions.slice().sort((a, b) => (a.rang || 999) - (b.rang || 999));
      const corps = triees.map((c, k) => {
        const cand = parIns[c.inscription_id] || {};
        const notes = c.notes || {};
        return '<tr><td>' + (k + 1) + '</td><td>' + EG.Docs.echapper(cand._nom || '—') + '</td><td>'
          + ((cand._eleve || {}).sexe || '') + '</td><td>' + EG.Docs.echapper((iec[c.ecole_id] || {}).nom || '—') + '</td>'
          + EPREUVES.map(ep => '<td>' + (typeof notes[ep.code] === 'number' ? notes[ep.code] : '') + '</td>').join('')
          + '<td>' + (c.total === null || c.total === undefined ? '' : c.total)
          + '</td><td>' + (c.moyenne === null || c.moyenne === undefined ? '' : c.moyenne)
          + '</td><td>' + (c.maitrises === null || c.maitrises === undefined ? '' : c.maitrises)
          + '</td><td>' + (c.rang || '') + '</td></tr>';
      }).join('');
      EG.genererDocument('RELEVE_CENTRE', 'Relevé de centre — ' + centre.nom,
        '<h2>Examen blanc du CEP — relevé de centre</h2>' + enTeteCentre(centre, it)
        + '<table><thead><tr><th>N° ordre</th><th>Noms et prénoms</th><th>Sexe</th><th>École de provenance</th>'
        + EPREUVES.map(ep => '<th>' + ep.nom + '</th>').join('')
        + '<th>Total</th><th>Moyenne</th><th>Maîtrises</th><th>Rang</th></tr></thead><tbody>'
        + (corps || '<tr><td colspan="16">Aucune composition enregistrée</td></tr>') + '</tbody></table>');
    }

    function exporterCentre(centre, compositions, candidats, iec, it) {
      const parIns = indexer(candidats);
      const triees = compositions.slice().sort((a, b) => (a.rang || 999) - (b.rang || 999));
      const lignes = [['N° ordre', 'Noms et Prénoms', 'Sexe', 'École de provenance']
        .concat(EPREUVES.map(ep => ep.nom))
        .concat(['Total', 'Moyenne', 'Nombre maîtrise', 'Rang'])];
      triees.forEach((c, k) => {
        const cand = parIns[c.inscription_id] || {};
        const notes = c.notes || {};
        lignes.push([k + 1, cand._nom || '', (cand._eleve || {}).sexe || '',
          (iec[c.ecole_id] || {}).nom || '']
          .concat(EPREUVES.map(ep => typeof notes[ep.code] === 'number' ? notes[ep.code] : ''))
          .concat([c.total, c.moyenne, c.maitrises, c.rang]));
      });
      const blob = EG.Tableur.construire([
        { nom: 'CEP Blanc - Centre', lignes: [
          ['Circonscription', (it[centre.territoire_id] || {}).nom || '', 'Commune', centre.commune || ''],
          ['Centre', centre.nom, 'Chef de centre', centre.chef_centre || ''],
          ['Année scolaire', session().annee_code, 'Date de composition', centre.date_composition || ''],
          []
        ].concat(lignes) }
      ]);
      const nom = 'cep-blanc-centre.xlsx';
      const a = el('a', { href: URL.createObjectURL(blob), download: nom });
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      U.toast('Classeur « ' + nom + ' » téléchargé');
    }
  });

  /* =======================================================================
     PRÉSENCE DU PERSONNEL
     ======================================================================= */

  const STATUTS_AGENT = [
    ['PRESENT', 'P'], ['ABSENT', 'A'], ['RETARD', 'R'],
    ['MISSION', 'M'], ['CONGE', 'C'], ['FORMATION', 'F'], ['MALADIE', 'S']
  ];

  Routeur.definir('presences-personnel', function (racine) {
    racine.appendChild(entete('Présence du personnel',
      'Pointage quotidien des agents, puis relevé mensuel à joindre au rapport.',
      [el('button', { class: 'btn btn-fantome', text: 'Présences des élèves', onclick: () => Routeur.aller('presences') })]));
    const filtres = el('div', { class: 'barre-filtres' });
    const zone = el('div');
    racine.appendChild(filtres); racine.appendChild(zone);
    let date = iso(new Date()), vue = 'JOUR';

    filtres.appendChild(U.selecteur('Vue', [
      { value: 'JOUR', label: 'Pointage du jour' },
      { value: 'MOIS', label: 'Relevé mensuel' },
      { value: 'ANNEE', label: 'Bilan annuel' }
    ], vue, v => { vue = v; dessiner(); }, { vide: false }));
    filtres.appendChild(el('label', { class: 'filtre' }, [
      el('span', { text: 'Date' }),
      el('input', { type: 'date', value: date, onchange: e => { date = e.target.value; dessiner(); } })
    ]));

    function dessiner() {
      zone.textContent = '';
      Promise.all([charger('personnels'), DB.all('presences_personnel')]).then(([agents, releves]) => {
        const actifs = agents.filter(a => a.actif !== false)
          .sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr'));
        if (!actifs.length) { zone.appendChild(U.vide('Aucun agent enregistré dans votre périmètre.')); return; }
        const idsAgents = indexer(actifs);
        const miens = releves.filter(r => idsAgents[r.personnel_id]);

        if (vue === 'JOUR') return pointage(actifs, miens);
        return bilan(actifs, miens, vue === 'MOIS');
      });
    }
    dessiner();

    function pointage(agents, releves) {
      const duJour = {};
      releves.filter(r => r.date_jour === date).forEach(r => { duJour[r.personnel_id] = r; });
      const etat = {};
      agents.forEach(a => { etat[a.id] = duJour[a.id] ? duJour[a.id].statut : 'PRESENT'; });

      const compteur = el('p', { class: 'muet' });
      function majCompteur() {
        const v = agents.map(a => etat[a.id]);
        compteur.textContent = v.filter(s => s === 'PRESENT').length + ' présents · '
          + v.filter(s => s === 'ABSENT').length + ' absents · '
          + v.filter(s => ['MISSION', 'CONGE', 'FORMATION', 'MALADIE'].indexOf(s) >= 0).length + ' en position régulière';
      }

      const liste = el('div', { class: 'appel' });
      agents.forEach(a => {
        const ligne = el('div', { class: 'appel-ligne' });
        ligne.appendChild(el('div', { class: 'appel-nom' }, [
          el('strong', { text: (a.nom || '').toUpperCase() + ' ' + (a.prenoms || '') }),
          el('span', { class: 'muet petit', text: U.libelle(a.fonction) + (a.matricule ? ' • ' + a.matricule : '') })
        ]));
        const boutons = el('div', { class: 'segment segment-large' });
        STATUTS_AGENT.forEach(([v, lbl]) => {
          const b = el('button', {
            class: 'segment-btn' + (etat[a.id] === v ? ' actif ' + v.toLowerCase() : ''),
            text: lbl, title: U.libelle(v), 'aria-label': U.libelle(v)
          });
          b.addEventListener('click', () => {
            etat[a.id] = v;
            Array.prototype.forEach.call(boutons.children, (x, k) => {
              x.className = 'segment-btn' + (etat[a.id] === STATUTS_AGENT[k][0] ? ' actif ' + STATUTS_AGENT[k][0].toLowerCase() : '');
            });
            majCompteur();
          });
          boutons.appendChild(b);
        });
        ligne.appendChild(boutons);
        liste.appendChild(ligne);
      });
      majCompteur();

      zone.appendChild(el('div', { class: 'ligne-entre' }, [
        el('h3', { text: 'Pointage du ' + U.dateFR(date) }), compteur
      ]));
      zone.appendChild(el('p', { class: 'muet petit', text: 'P présent · A absent · R retard · M mission · C congé · F formation · S maladie' }));
      zone.appendChild(liste);

      if (EG.peutEcrire()) zone.appendChild(el('div', { class: 'barre-actions' }, [
        el('button', {
          class: 'btn btn-primaire', text: 'Enregistrer le pointage', onclick: () => {
            const rows = agents.map(a => Object.assign(duJour[a.id] || {}, {
              personnel_id: a.id, ecole_id: a.ecole_id || ecoleCourante(),
              date_jour: date, statut: etat[a.id]
            }));
            DB.putBatch('presences_personnel', rows)
              .then(() => DB.audit('POINTAGE_PERSONNEL', 'presences_personnel', null, { date, agents: rows.length }))
              .then(() => { U.toast('Pointage enregistré pour ' + rows.length + ' agent(s)'); dessiner(); EG.majSynchro(); });
          }
        })
      ]));
    }

    function bilan(agents, releves, mensuel) {
      const prefixe = mensuel ? date.slice(0, 7) : null;
      const retenus = mensuel ? releves.filter(r => r.date_jour.slice(0, 7) === prefixe) : releves;
      if (!retenus.length) {
        zone.appendChild(U.vide(mensuel
          ? 'Aucun pointage enregistré sur ce mois.'
          : 'Aucun pointage enregistré pour l’instant.'));
        return;
      }

      const parAgent = {};
      retenus.forEach(r => {
        const s = parAgent[r.personnel_id] = parAgent[r.personnel_id]
          || { total: 0, present: 0, absent: 0, retard: 0, regulier: 0 };
        s.total++;
        if (r.statut === 'PRESENT') s.present++;
        else if (r.statut === 'ABSENT') s.absent++;
        else if (r.statut === 'RETARD') { s.retard++; s.present++; }
        else s.regulier++;
      });

      const lignes = agents.map(a => Object.assign({ agent: a },
        parAgent[a.id] || { total: 0, present: 0, absent: 0, retard: 0, regulier: 0 }))
        .map(l => Object.assign(l, {
          taux: l.total ? Math.round(l.present / l.total * 1000) / 10 : null
        }))
        .filter(l => l.total > 0)
        .sort((a, b) => (a.taux || 0) - (b.taux || 0));

      const jours = [...new Set(retenus.map(r => r.date_jour))].length;
      const totalPresences = lignes.reduce((s, l) => s + l.present, 0);
      const totalJournees = lignes.reduce((s, l) => s + l.total, 0);

      zone.appendChild(grille([
        U.stat(U.nombre(jours), 'Jours pointés'),
        U.stat(U.nombre(lignes.length), 'Agents suivis'),
        U.stat(totalJournees ? Math.round(totalPresences / totalJournees * 100) + ' %' : '—', 'Taux de présence',
          totalJournees && totalPresences / totalJournees < 0.9 ? 'attention' : ''),
        U.stat(U.nombre(lignes.reduce((s, l) => s + l.absent, 0)), 'Absences')
      ], 'grille-stats'));

      zone.appendChild(sousSection(mensuel ? 'Relevé du mois' : 'Bilan annuel', U.tableau([
        { titre: 'Agent', valeur: l => (l.agent.nom || '').toUpperCase() + ' ' + (l.agent.prenoms || '') },
        { titre: 'Matricule', valeur: l => l.agent.matricule || '—' },
        { titre: 'Jours pointés', valeur: l => l.total },
        { titre: 'Présences', valeur: l => l.present },
        { titre: 'Absences', valeur: l => l.absent },
        { titre: 'Retards', valeur: l => l.retard },
        { titre: 'Position régulière', valeur: l => l.regulier },
        { titre: 'Taux', valeur: l => l.taux === null ? '—'
          : U.badge(l.taux + ' %', l.taux >= 95 ? 'ok' : (l.taux >= 85 ? 'attention' : 'danger')) }
      ], lignes)));

      zone.appendChild(el('div', { class: 'barre-actions' }, [
        el('button', {
          class: 'btn btn-fantome', text: 'Éditer le relevé', onclick: () => {
            EG.genererDocument('RELEVE_PERSONNEL',
              'Relevé de présence du personnel — ' + (mensuel ? U.dateFR(date).replace(/^\d+ /, '') : session().annee_code),
              '<h2>Relevé de présence du personnel</h2>'
              + '<p>' + EG.Docs.echapper(session().ecole_nom) + ' — '
              + (mensuel ? 'mois de ' + U.dateFR(date).replace(/^\d+ /, '') : 'année scolaire ' + session().annee_code)
              + ' — ' + jours + ' jour(s) pointé(s)</p>'
              + '<table><thead><tr><th>Agent</th><th>Matricule</th><th>Jours</th><th>Présences</th>'
              + '<th>Absences</th><th>Retards</th><th>Position régulière</th><th>Taux</th></tr></thead><tbody>'
              + lignes.map(l => '<tr><td>' + EG.Docs.echapper((l.agent.nom || '').toUpperCase() + ' ' + (l.agent.prenoms || ''))
                + '</td><td>' + EG.Docs.echapper(l.agent.matricule || '—') + '</td><td>' + l.total + '</td><td>'
                + l.present + '</td><td>' + l.absent + '</td><td>' + l.retard + '</td><td>' + l.regulier
                + '</td><td>' + (l.taux === null ? '—' : l.taux + ' %') + '</td></tr>').join('')
              + '</tbody></table>');
          }
        })
      ]));
    }
  });

  /* =======================================================================
     ÉDITION DU CERTIFICAT DE SCOLARITÉ ET DE LA FICHE D'ÉVALUATION
     ======================================================================= */

  /** Contexte administratif : commune, circonscription, département. */
  function contexteEcole(ecole) {
    return DB.all('territoires').then(territoires => {
      const it = indexer(territoires);
      const circo = ecole ? it[ecole.territoire_id] : null;
      let departement = circo ? it[circo.parent_id] : null;
      while (departement && departement.type !== 'DEPARTEMENT' && departement.parent_id) {
        departement = it[departement.parent_id];
      }
      return {
        commune: (ecole && ecole.commune) || (circo ? circo.nom : ''),
        circonscription: circo ? circo.nom : '',
        departement: departement ? departement.nom : ''
      };
    });
  }

  const APPRECIATIONS = ['Très bien', 'Bien', 'Assez bien', 'Passable', 'Insuffisante'];

  /** Certificat officiel à souche : les appréciations sont saisies avant édition. */
  function editerCertificat(inscriptionId) {
    Promise.all([
      inscriptionsEnrichies({ statuts: ['ACTIF', 'SORTIE_PRIMAIRE_CEP'] }),
      DB.get('ecoles', ecoleCourante())
    ]).then(([ins, ecole]) => {
      if (!ins.length) { U.toast('Aucun élève inscrit', 'attention'); return; }
      return contexteEcole(ecole).then(contexte => {
        const sel = el('select', {}, ins.map(i =>
          el('option', { value: i.id, text: i._nom + ' — ' + i.niveau })));
        if (inscriptionId) sel.value = inscriptionId;

        const champ = (etiquette, options) => {
          const s = el('select', {}, options.map(o => el('option', { value: o, text: o })));
          return { noeud: el('label', { class: 'filtre' }, [el('span', { text: etiquette }), s]), controle: s };
        };
        const assiduite = champ('Assiduité', APPRECIATIONS);
        const conduite = champ('Conduite', APPRECIATIONS);
        const travail = champ('Travail', APPRECIATIONS);
        const observations = el('textarea', { rows: 2, placeholder: 'Observations particulières' });
        const numero = el('input', { type: 'text', value: 'CS-' + new Date().getFullYear() + '-' });

        U.modal('Certificat de scolarité', el('div', { class: 'formulaire' }, [
          el('div', { class: 'champ' }, [el('label', { text: 'Élève' }), sel]),
          el('div', { class: 'champ' }, [el('label', { text: 'Numéro du certificat' }), numero]),
          el('div', { class: 'barre-filtres' }, [assiduite.noeud, conduite.noeud, travail.noeud]),
          el('div', { class: 'champ' }, [el('label', { text: 'Observations particulières' }), observations]),
          el('p', { class: 'muet petit', text: 'Un certificat par feuille A4, aux insignes du ministère. Le NIP et le matricule EDUCMaster y figurent, ainsi que votre signature et le cachet de l’école.' })
        ]), fermer => [
          el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
          el('button', {
            class: 'btn btn-primaire', text: 'Éditer le certificat', onclick: () => {
              const i = ins.filter(x => x.id === sel.value)[0];
              fermer();
              EG.genererDocument('CERT_SCOLARITE', 'Certificat de scolarité — ' + i._nom,
                EG.Docs.certificatScolarite(i._eleve || {}, i, ecole, session().annee_code,
                  numero.value, contexte, {
                    assiduite: assiduite.controle.value, conduite: conduite.controle.value,
                    travail: travail.controle.value, observations: observations.value
                  }, session().user),
                { classe_id: i.classe_id });
            }
          })
        ]);
      });
    });
  }
  EG.editerCertificat = editerCertificat;

  /** Fiche d'évaluation de l'agent : saisie des onze critères, deux niveaux de notation. */
  function editerFicheAgent(personnelId) {
    Promise.all([
      charger('personnels'), DB.get('ecoles', ecoleCourante()),
      DB.where('evaluations_personnel', { annee_scolaire_id: anneeCourante() })
    ]).then(([agents, ecole, evaluations]) => {
      const actifs = agents.filter(a => a.actif !== false);
      if (!actifs.length) { U.toast('Aucun agent enregistré', 'attention'); return; }
      return contexteEcole(ecole).then(contexte => {
        const sel = el('select', {}, actifs.map(a =>
          el('option', { value: a.id, text: (a.nom || '').toUpperCase() + ' ' + (a.prenoms || '') })));
        if (personnelId) sel.value = personnelId;

        const parAgent = {}; evaluations.forEach(e => { parAgent[e.personnel_id] = e; });
        const controles = { hierarchique: {}, comite: {} };

        function grilleNotes(niveau, notes) {
          const table = el('table', { class: 'tableau' });
          table.appendChild(el('thead', {}, el('tr', {},
            ['Groupe', 'Critère', 'Note'].map(t => el('th', { text: t })))));
          const tb = el('tbody');
          EG.Docs.CRITERES_EVALUATION.forEach(g => {
            g.criteres.forEach((c, i) => {
              const inp = el('input', {
                type: 'number', min: 0, max: c.bareme, step: '0.25', class: 'cel-note',
                'aria-label': c.nom, value: (notes && notes[c.code] !== undefined) ? notes[c.code] : ''
              });
              controles[niveau][c.code] = { inp, bareme: c.bareme, groupe: g.groupe };
              const tr = el('tr');
              if (i === 0) {
                const th = el('th', { text: g.groupe + ' (' + g.total + ')' });
                th.rowSpan = g.criteres.length;
                tr.appendChild(th);
              }
              tr.appendChild(el('td', { text: c.nom }));
              tr.appendChild(el('td', {}, [inp, el('span', { class: 'muet petit', text: ' / ' + c.bareme })]));
              tb.appendChild(tr);
            });
          });
          table.appendChild(tb);
          return el('div', { class: 'tableau-enveloppe' }, table);
        }

        const evaluationCourante = parAgent[sel.value] || {};
        const debut = el('input', { type: 'date', value: evaluationCourante.periode_debut || '' });
        const fin = el('input', { type: 'date', value: evaluationCourante.periode_fin || '' });
        const objectifs = el('textarea', { rows: 2, placeholder: 'Un objectif par ligne' });
        const resultats = el('textarea', { rows: 2, placeholder: 'Un résultat par ligne' });
        const contraintes = el('textarea', { rows: 2, placeholder: 'Contraintes rencontrées' });
        objectifs.value = evaluationCourante.objectifs || '';
        resultats.value = evaluationCourante.resultats || '';
        contraintes.value = evaluationCourante.contraintes || '';

        const corps = el('div', { class: 'formulaire' }, [
          el('div', { class: 'champ' }, [el('label', { text: 'Agent' }), sel]),
          el('div', { class: 'barre-filtres' }, [
            el('label', { class: 'filtre' }, [el('span', { text: 'Période du' }), debut]),
            el('label', { class: 'filtre' }, [el('span', { text: 'au' }), fin])
          ]),
          el('div', { class: 'champ' }, [el('label', { text: '3.1 — Rappel des objectifs' }), objectifs]),
          el('div', { class: 'champ' }, [el('label', { text: '3.2 — Résultats de la période' }), resultats]),
          el('div', { class: 'champ' }, [el('label', { text: '3.3 — Contraintes et difficultés' }), contraintes]),
          el('h4', { text: '3.4 — Note du supérieur hiérarchique' }),
          grilleNotes('hierarchique', evaluationCourante.notes_hierarchique),
          el('h4', { text: '3.5 — Note du comité de direction' }),
          grilleNotes('comite', evaluationCourante.notes_comite)
        ]);

        U.modal('Fiche d’évaluation de l’agent', corps, fermer => [
          el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
          el('button', {
            class: 'btn btn-primaire', text: 'Enregistrer et éditer', onclick: () => {
              const agent = actifs.filter(a => a.id === sel.value)[0];
              const lire = niveau => {
                const notes = {}; let total = 0;
                const parGroupe = {};
                Object.keys(controles[niveau]).forEach(code => {
                  const c = controles[niveau][code];
                  const v = c.inp.value;
                  if (v === '') return;
                  const n = Math.min(c.bareme, Math.max(0, Number(v)));
                  notes[code] = n; total += n;
                  parGroupe[c.groupe] = (parGroupe[c.groupe] || 0) + n;
                });
                Object.keys(parGroupe).forEach(g => {
                  notes['_' + g] = Math.round(parGroupe[g] * 100) / 100;
                });
                notes._total = Math.round(total * 100) / 100;
                notes._classe = EG.Docs.classePerformance(notes._total);
                return notes;
              };
              const notesSup = lire('hierarchique');
              const notesComite = lire('comite');
              const enregistrement = Object.assign({}, parAgent[agent.id] || {}, {
                personnel_id: agent.id, annee_scolaire_id: anneeCourante(),
                periode_debut: debut.value || null, periode_fin: fin.value || null,
                objectifs: objectifs.value, resultats: resultats.value, contraintes: contraintes.value,
                notes_hierarchique: notesSup, notes_comite: notesComite,
                note_hierarchique: notesSup._total, note_proposee: notesSup._total,
                note_finale: notesComite._total || notesSup._total,
                statut: 'SOUMISE'
              });
              DB.put('evaluations_personnel', enregistrement)
                .then(e => DB.audit('EVALUATION_AGENT', 'evaluations_personnel', e.id,
                  { agent: agent.nom, note: e.note_finale }).then(() => e))
                .then(e => {
                  fermer(); U.toast('Évaluation enregistrée — ' + EG.Docs.classePerformance(e.note_finale));
                  EG.majSynchro();
                  EG.genererDocument('FICHE_EVAL_AGENT',
                    'Fiche d’évaluation — ' + (agent.nom || '') + ' ' + (agent.prenoms || ''),
                    EG.Docs.ficheEvaluationAgent(agent, e, ecole, contexte));
                });
            }
          })
        ]);
      });
    });
  }
  EG.editerFicheAgent = editerFicheAgent;

  /* =======================================================================
     ATTRIBUTION DES CLASSES AUX ENSEIGNANTS
     ======================================================================= */

  Routeur.definir('attribution-classes', function (racine) {
    racine.appendChild(entete('Attribution des classes',
      'Chaque classe a un titulaire. Son nom et sa signature figurent au pied des documents de son cours.'));
    const zone = el('div');
    racine.appendChild(zone);

    function dessiner() {
      zone.textContent = '';
      Promise.all([
        DB.where('classes', { annee_scolaire_id: anneeCourante() }),
        charger('personnels'),
        DB.where('inscriptions_eleves', { annee_scolaire_id: anneeCourante(), statut: 'ACTIF' })
      ]).then(([classes, agents, inscriptions]) => {
        const dispo = classes.filter(c => !ecoleCourante() || c.ecole_id === ecoleCourante())
          .sort((a, b) => EG.NIVEAUX.indexOf(a.niveau) - EG.NIVEAUX.indexOf(b.niveau));
        if (!dispo.length) { zone.appendChild(U.vide('Aucune classe ouverte cette année.')); return; }
        /* Une classe est tenue par un enseignant (ou le directeur) : ni le conseiller
           pédagogique, ni le personnel administratif n'y figurent. */
        const enseignants = agents.filter(a => a.actif !== false
          && (!a.fonction || a.fonction === 'ENSEIGNANT' || a.fonction === 'DIRECTEUR'));
        const ia = indexer(agents);
        const effectifs = {};
        inscriptions.forEach(i => { if (i.classe_id) effectifs[i.classe_id] = (effectifs[i.classe_id] || 0) + 1; });

        const sansTitulaire = dispo.filter(c => !c.titulaire_id).length;
        /* Un même enseignant sur deux classes : possible en multigrade, mais à voir. */
        const compteur = {};
        dispo.forEach(c => { if (c.titulaire_id) compteur[c.titulaire_id] = (compteur[c.titulaire_id] || 0) + 1; });
        const doubles = Object.keys(compteur).filter(k => compteur[k] > 1);

        zone.appendChild(grille([
          U.stat(U.nombre(dispo.length), 'Classes'),
          U.stat(U.nombre(dispo.length - sansTitulaire), 'Avec titulaire'),
          U.stat(U.nombre(sansTitulaire), 'Sans titulaire', sansTitulaire ? 'attention' : ''),
          U.stat(U.nombre(enseignants.length), 'Enseignants en poste')
        ], 'grille-stats'));

        if (doubles.length) {
          zone.appendChild(U.carte('À vérifier', el('ul', { class: 'liste-points alerte' },
            doubles.map(k => el('li', {
              text: ((ia[k] || {}).nom || '') + ' ' + ((ia[k] || {}).prenoms || '')
                + ' est titulaire de ' + compteur[k] + ' classes.'
            })))));
        }

        const controles = {};
        const table = el('table', { class: 'tableau' });
        table.appendChild(el('thead', {}, el('tr', {},
          ['Classe', 'Niveau', 'Effectif', 'Enseignant titulaire'].map(t => el('th', { text: t })))));
        const tb = el('tbody');
        dispo.forEach(c => {
          const sel = el('select', { 'aria-label': 'Titulaire de ' + (c.libelle || c.code) },
            [el('option', { value: '', text: '— Non attribuée —' })]
              .concat(enseignants.concat(c.titulaire_id && !enseignants.some(a => a.id === c.titulaire_id) && ia[c.titulaire_id]
                ? [ia[c.titulaire_id]] : []).map(a => {
                const o = el('option', { value: a.id,
                  text: (a.nom || '').toUpperCase() + ' ' + (a.prenoms || '') });
                if (c.titulaire_id === a.id) o.selected = true;
                return o;
              })));
          if (!EG.peutEcrire()) sel.disabled = true;
          controles[c.id] = { sel, classe: c };
          tb.appendChild(el('tr', {}, [
            el('th', { text: c.libelle || c.code }),
            el('td', { text: c.niveau }),
            el('td', { text: U.nombre(effectifs[c.id] || 0) }),
            el('td', {}, sel)
          ]));
        });
        table.appendChild(tb);
        zone.appendChild(el('div', { class: 'tableau-enveloppe' }, table));

        if (EG.peutEcrire()) {
          zone.appendChild(el('div', { class: 'barre-actions' }, [
            el('button', {
              class: 'btn btn-primaire', text: 'Enregistrer les attributions', onclick: () => {
                const aujourdhui = iso(new Date());
                const rows = [], affectations = [];
                Object.keys(controles).forEach(id => {
                  const { sel, classe } = controles[id];
                  const nouveau = sel.value || null;
                  if (nouveau === (classe.titulaire_id || null)) return;
                  rows.push(Object.assign({}, classe, { titulaire_id: nouveau }));
                  if (nouveau) affectations.push({
                    personnel_id: nouveau, ecole_id: classe.ecole_id, classe_id: classe.id,
                    fonction: 'Titulaire de classe', date_debut: aujourdhui
                  });
                });
                if (!rows.length) { U.toast('Aucun changement'); return; }
                DB.putBatch('classes', rows)
                  .then(() => affectations.length ? DB.putBatch('affectations_personnel', affectations) : null)
                  .then(() => DB.audit('ATTRIBUTION_CLASSES', 'classes', null, { modifiees: rows.length }))
                  .then(() => { U.toast(rows.length + ' attribution(s) enregistrée(s)'); dessiner(); EG.majSynchro(); });
              }
            }),
            el('button', {
              class: 'btn btn-fantome', text: 'Éditer la répartition', onclick: () => {
                EG.genererDocument('REPARTITION_CLASSES', 'Répartition des classes — ' + session().annee_code,
                  '<h2>Répartition des classes</h2><p>' + EG.Docs.echapper(session().ecole_nom)
                  + ' — année scolaire ' + session().annee_code + '</p>'
                  + '<table><thead><tr><th>Classe</th><th>Niveau</th><th>Effectif</th>'
                  + '<th>Enseignant titulaire</th><th>Matricule</th><th>Émargement</th></tr></thead><tbody>'
                  + dispo.map(c => {
                    const a = ia[c.titulaire_id];
                    return '<tr><td>' + EG.Docs.echapper(c.libelle || c.code) + '</td><td>' + c.niveau
                      + '</td><td>' + (effectifs[c.id] || 0) + '</td><td>'
                      + EG.Docs.echapper(a ? ((a.nom || '').toUpperCase() + ' ' + (a.prenoms || '')) : '—')
                      + '</td><td>' + EG.Docs.echapper((a && a.matricule) || '—') + '</td><td></td></tr>';
                  }).join('') + '</tbody></table>');
              }
            })
          ]));
        }
      });
    }
    dessiner();
  });
})(window);
