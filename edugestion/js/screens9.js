/* ÉduGestion Pro — synthèse officielle de l'évaluation.
   Le document qui remonte à la DDEMP : en-tête d'identification complet, tableau
   par matière, participation et réussite au seuil, puis les quatre sections
   d'analyse. Il se calcule à la classe, à l'école ou à l'unité pédagogique. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const indexer = E.indexer, entete = E.entete;

  const session = () => EG.session;
  const ecoleCourante = () => EG.session.ecole_id || null;
  const anneeCourante = () => EG.session.annee_id || null;
  const grille = (enfants, classe) => el('div', { class: 'grille ' + (classe || '') }, enfants);
  const pc = v => v === null || v === undefined ? '—' : v + ' %';

  /* Une matière est acquise à partir de 10 sur 20. */
  const SEUIL_MAITRISE = 10;

  /** Appréciation officielle attachée à un taux de réussite. */
  function appreciation(taux) {
    if (taux === null || taux === undefined) return 'Non communiqué';
    if (taux >= 90) return 'Très satisfaisant';
    if (taux >= 75) return 'Satisfaisant';
    if (taux >= 60) return 'Acceptable';
    if (taux >= 40) return 'Préoccupant';
    return 'À renforcer';
  }
  function ton(taux) {
    if (taux === null || taux === undefined) return 'neutre';
    if (taux >= 75) return 'ok';
    if (taux >= 60) return 'info';
    if (taux >= 40) return 'attention';
    return 'danger';
  }

  Routeur.definir('synthese-officielle', function (racine) {
    racine.appendChild(entete('Synthèse officielle de l’évaluation',
      'Le document destiné à la circonscription et à la direction départementale.',
      [el('button', { class: 'btn btn-fantome', text: 'Panneau de pilotage', onclick: () => Routeur.aller('synthese-evaluations') })]));
    const filtres = el('div', { class: 'barre-filtres' });
    const zone = el('div');
    racine.appendChild(filtres); racine.appendChild(zone);

    let numero = '', niveauSynthese = 'ECOLE', typeEval = '', classeId = '';

    DB.where('evaluations', { annee_scolaire_id: anneeCourante() }).then(evals => {
      const miennes = evals.filter(e => !ecoleCourante() || e.ecole_id === ecoleCourante());
      if (!miennes.length) { zone.appendChild(U.vide('Aucune évaluation ouverte cette année.')); return; }
      const numeros = [...new Set(miennes.map(e => e.numero))].sort((a, b) => a - b);
      numero = String(numeros[0]);

      filtres.appendChild(U.selecteur('Évaluation',
        numeros.map(n => ({ value: String(n), label: 'Évaluation n° ' + n })),
        numero, v => { numero = v; dessiner(); }, { vide: false }));
      filtres.appendChild(U.selecteur('Niveau de synthèse', [
        { value: 'CLASSE', label: 'Par classe' },
        { value: 'ECOLE', label: 'École' },
        { value: 'UP', label: 'Unité pédagogique' }
      ], niveauSynthese, v => { niveauSynthese = v; dessiner(); }, { vide: false }));
      filtres.appendChild(U.selecteur('Type', [
        { value: '', label: 'Selon l’évaluation' },
        { value: 'FORMATIVE', label: 'Formative' },
        { value: 'SOMMATIVE', label: 'Sommative' },
        { value: 'CERTIFICATIVE', label: 'Certificative' }
      ], typeEval, v => { typeEval = v; dessiner(); }, { vide: false }));
      dessiner();
    });

    function dessiner() {
      zone.textContent = '';
      Promise.all([
        DB.where('evaluations', { annee_scolaire_id: anneeCourante() }),
        DB.all('notes'), DB.all('matieres'), DB.all('classes'), DB.all('ecoles'),
        DB.all('territoires'), DB.all('eleves'), DB.all('personnels'),
        DB.where('inscriptions_eleves', { annee_scolaire_id: anneeCourante() })
      ]).then(([evals, notes, matieres, classes, ecoles, territoires, eleves, agents, inscriptions]) => {
        const rapport = construire({
          evals, notes, matieres, classes, ecoles, territoires, eleves, agents, inscriptions
        });
        if (!rapport) { zone.appendChild(U.vide('Aucune note exploitable pour cette évaluation.')); return; }
        afficher(rapport);
      });
    }

    /* ---------------------------------------------------------------- */

    function construire(d) {
      const n = Number(numero);
      const iec = indexer(d.ecoles), it = indexer(d.territoires),
        ic = indexer(d.classes), ie = indexer(d.eleves), ia = indexer(d.agents);

      const evalsRetenues = d.evals.filter(e => e.numero === n
        && (!ecoleCourante() || e.ecole_id === ecoleCourante()));
      if (!evalsRetenues.length) return null;

      /* Périmètre : l'école, ou toutes les écoles de la même unité pédagogique. */
      const ecole = iec[ecoleCourante()] || d.ecoles[0];
      const ecolesRetenues = niveauSynthese === 'UP' && ecole
        ? d.ecoles.filter(x => x.up_id && x.up_id === ecole.up_id)
        : (ecole ? [ecole] : d.ecoles);
      const idsEcoles = {}; ecolesRetenues.forEach(x => { idsEcoles[x.id] = true; });

      const idsEval = {}; evalsRetenues.forEach(e => { idsEval[e.id] = e; });
      const ins = d.inscriptions.filter(i => idsEcoles[i.ecole_id]
        && evalsRetenues.some(e => e.ecole_id === i.ecole_id && e.niveau === i.niveau));
      if (!ins.length) return null;
      const insParId = indexer(ins);

      /* Notes par élève et par matière. */
      const parEleve = {};
      d.notes.filter(x => idsEval[x.evaluation_id] && insParId[x.inscription_id]).forEach(x => {
        if (typeof x.note !== 'number') return;
        const c = parEleve[x.inscription_id] = parEleve[x.inscription_id] || {};
        c[x.matiere_id] = x.note;
      });

      /* Matières réellement évaluées, dans l'ordre du référentiel. */
      const utilisees = {};
      Object.keys(parEleve).forEach(k => Object.keys(parEleve[k]).forEach(m => { utilisees[m] = true; }));
      const matieres = d.matieres.filter(m => utilisees[m.id])
        .sort((a, b) => (a.ordre || 99) - (b.ordre || 99) || a.code.localeCompare(b.code));
      if (!matieres.length) return null;

      const fille = i => ie[i.eleve_id] && ie[i.eleve_id].sexe === 'F';
      const compte = { inscritsG: 0, inscritsF: 0, composeG: 0, composeF: 0 };
      ins.forEach(i => {
        if (fille(i)) compte.inscritsF++; else compte.inscritsG++;
        if (parEleve[i.id]) { if (fille(i)) compte.composeF++; else compte.composeG++; }
      });

      /* Le seuil d'acquisition d'une matière : 10 sur 20. */
      const requisEnsemble = Math.min(6, matieres.length);
      const auSeuil = {};
      ins.forEach(i => {
        const notes = parEleve[i.id];
        if (!notes) return;
        const acquises = matieres.filter(m => typeof notes[m.id] === 'number'
          && notes[m.id] >= SEUIL_MAITRISE).length;
        auSeuil[i.id] = acquises >= requisEnsemble;
      });

      /* --- Une ligne par matière --- */
      const lignesMatieres = matieres.map(m => {
        let inscritsG = 0, inscritsF = 0, composeG = 0, composeF = 0;
        let partielle = 0, minimale = 0, aRenforcer = 0;
        ins.forEach(i => {
          const f = fille(i);
          if (f) inscritsF++; else inscritsG++;
          const notes = parEleve[i.id];
          if (!notes || typeof notes[m.id] !== 'number') return;
          if (f) composeF++; else composeG++;
          const note = notes[m.id];
          /* Maîtrise partielle : la matière est acquise, à partir de 10 sur 20.
             Maîtrise minimale : la matière est acquise ET l'élève atteint le
             seuil d'ensemble, six matières sur neuf. */
          if (note >= SEUIL_MAITRISE) { partielle++; if (auSeuil[i.id]) minimale++; }
          else aRenforcer++;
        });
        const compose = composeG + composeF;
        return {
          matiere: m.libelle || m.code, code: m.code,
          inscritsG, inscritsF, inscrits: inscritsG + inscritsF,
          composeG, composeF, compose,
          partielle, minimale, aRenforcer,
          taux: compose ? Math.round(minimale / compose * 1000) / 10 : null
        };
      });

      /* --- Ensemble : la maîtrise au seuil, six matières sur neuf --- */
      const requis = requisEnsemble;
      let seuilG = 0, seuilF = 0, partielleEns = 0, aRenforcerEns = 0;
      ins.forEach(i => {
        const notes = parEleve[i.id];
        if (!notes) return;
        const acquises = matieres.filter(m => typeof notes[m.id] === 'number'
          && notes[m.id] >= SEUIL_MAITRISE).length;
        if (auSeuil[i.id]) { if (fille(i)) seuilF++; else seuilG++; }
        else if (acquises >= 3) partielleEns++;
        else aRenforcerEns++;
      });
      const compose = compte.composeG + compte.composeF;
      const seuil = seuilG + seuilF;
      const ensemble = {
        matiere: 'Ensemble', code: 'ENS',
        inscritsG: compte.inscritsG, inscritsF: compte.inscritsF,
        inscrits: compte.inscritsG + compte.inscritsF,
        composeG: compte.composeG, composeF: compte.composeF, compose,
        partielle: partielleEns, minimale: seuil, aRenforcer: aRenforcerEns,
        taux: compose ? Math.round(seuil / compose * 1000) / 10 : null
      };

      /* --- Par cours, pour l'analyse quantitative --- */
      const parCours = {};
      ins.forEach(i => {
        const c = parCours[i.niveau] = parCours[i.niveau]
          || { niveau: i.niveau, inscrits: 0, compose: 0, seuil: 0, seuilG: 0, seuilF: 0, composeG: 0, composeF: 0 };
        c.inscrits++;
        const notes = parEleve[i.id];
        if (!notes) return;
        c.compose++;
        if (fille(i)) c.composeF++; else c.composeG++;
        if (auSeuil[i.id]) { c.seuil++; if (fille(i)) c.seuilF++; else c.seuilG++; }
      });
      const cours = EG.NIVEAUX.filter(nv => parCours[nv]).map(nv => {
        const c = parCours[nv];
        return Object.assign(c, {
          taux: c.compose ? Math.round(c.seuil / c.compose * 1000) / 10 : null,
          tauxG: c.composeG ? Math.round(c.seuilG / c.composeG * 1000) / 10 : null,
          tauxF: c.composeF ? Math.round(c.seuilF / c.composeF * 1000) / 10 : null
        });
      });

      /* --- Identification --- */
      const circo = ecole ? it[ecole.territoire_id] : null;
      let departement = circo ? it[circo.parent_id] : null;
      while (departement && departement.type !== 'DEPARTEMENT' && departement.parent_id) {
        departement = it[departement.parent_id];
      }
      const classesConcernees = d.classes.filter(c => idsEcoles[c.ecole_id]
        && evalsRetenues.some(e => e.niveau === c.niveau && e.ecole_id === c.ecole_id));
      const titulaires = [...new Set(classesConcernees.map(c => c.titulaire_id).filter(Boolean))]
        .map(id => ia[id]).filter(Boolean)
        .map(a => (a.nom || '').toUpperCase() + ' ' + (a.prenoms || ''));

      const type = typeEval || evalsRetenues[0].type_evaluation || 'SOMMATIVE';

      return {
        numero: n, type,
        identification: {
          zone: ecole && it[ecole.zone_id] ? it[ecole.zone_id].nom : '—',
          up: ecole && it[ecole.up_id] ? it[ecole.up_id].nom : '—',
          ecole: niveauSynthese === 'UP'
            ? ecolesRetenues.length + ' école(s) de l’unité pédagogique'
            : (ecole ? ecole.nom : '—'),
          cs: circo ? String(circo.nom).replace(/^CS\s+/i, '') : '—',
          ddemp: departement ? departement.nom : '—',
          annee: session().annee_code,
          directeur: (ecole && ecole.directeur_nom) || '—',
          ccs: (circo && circo.responsable) || '—',
          titulaire: titulaires.length ? titulaires.join(', ') : '—',
          classes: classesConcernees.length,
          ecoles: ecolesRetenues.length
        },
        lignesMatieres, ensemble, cours, requis,
        seuilG, seuilF,
        tauxG: compte.composeG ? Math.round(seuilG / compte.composeG * 1000) / 10 : null,
        tauxF: compte.composeF ? Math.round(seuilF / compte.composeF * 1000) / 10 : null
      };
    }

    /* ---------------------------------------------------------------- */

    function libellePerimetre() {
      return niveauSynthese === 'UP' ? 'l’unité pédagogique'
        : (niveauSynthese === 'CLASSE' ? 'la classe' : 'l’école');
    }

    /** Les quatre commentaires, rédigés à partir des chiffres calculés. */
    function textes(r) {
      const e = r.ensemble;
      const detail = r.cours.map(c => c.niveau + ' : ' + c.inscrits + ' inscrit(s) pour un taux de '
        + pc(c.taux)).join(' ; ');

      const quantitative = 'Au titre de l’évaluation n° ' + r.numero + ', ' + libellePerimetre()
        + ' a enregistré un effectif total de ' + e.inscrits + ' inscrit(s), dont '
        + e.inscritsG + ' garçon(s) et ' + e.inscritsF + ' fille(s). Sur cet effectif, '
        + e.compose + ' élève(s) ont effectivement composé. Le nombre d’élèves ayant atteint la '
        + 'maîtrise minimale s’établit à ' + e.minimale + ' élève(s), soit un taux de réussite global de '
        + pc(e.taux) + '. Dans le détail — ' + (detail || 'aucun cours renseigné') + '.';

      const qualitative = 'Sur le plan qualitatif, l’appréciation globale de ' + libellePerimetre()
        + ' est « ' + appreciation(e.taux) + ' ». Dans le détail, '
        + (r.cours.length
          ? r.cours.map(c => c.niveau + ' est qualifié de « ' + appreciation(c.taux) + ' »').join(', ')
          : 'aucun cours n’est renseigné')
        + '. Ces appréciations reflètent le niveau de maîtrise atteint par les élèves par rapport aux '
        + 'seuils fixés pour l’évaluation ' + U.libelle(r.type).toLowerCase() + '.';

      const avanceG = r.cours.filter(c => c.tauxG !== null && c.tauxF !== null && c.tauxG > c.tauxF + 2);
      const avanceF = r.cours.filter(c => c.tauxG !== null && c.tauxF !== null && c.tauxF > c.tauxG + 2);
      const genre = (r.tauxG === null || r.tauxF === null)
        ? 'L’analyse des écarts de genre ne peut être établie : les données sont insuffisantes pour '
          + 'comparer les résultats des garçons et ceux des filles.'
        : 'L’analyse des écarts de genre révèle qu’au niveau global de ' + libellePerimetre()
          + ', les garçons atteignent ' + pc(r.tauxG) + ' de réussite contre ' + pc(r.tauxF)
          + ' pour les filles, soit un écart de '
          + (Math.round(Math.abs(r.tauxF - r.tauxG) * 10) / 10) + ' point(s). Par classe, les garçons sont '
          + 'en avance ' + (avanceG.length ? 'en ' + avanceG.map(c => c.niveau).join(', ') : 'dans aucune classe')
          + ' ; les filles sont en avance '
          + (avanceF.length ? 'en ' + avanceF.map(c => c.niveau).join(', ') : 'dans aucune classe') + '.';

      const faibles = r.cours.filter(c => c.taux !== null && c.taux < 60).map(c => c.niveau);
      const conclusion = 'En conclusion, l’évaluation ' + U.libelle(r.type).toLowerCase() + ' de '
        + libellePerimetre() + ' révèle un taux de réussite global de ' + pc(e.taux)
        + ', soit une appréciation « ' + appreciation(e.taux) + ' ». Sur ' + e.inscrits
        + ' élève(s) inscrit(s), ' + e.minimale + ' ont atteint la maîtrise minimale. '
        + (e.taux !== null && e.taux >= 75
          ? 'Ces résultats invitent à consolider les acquis et à maintenir l’effort engagé.'
          : 'Ces résultats appellent à renforcer les stratégies pédagogiques afin d’améliorer les '
            + 'performances lors des prochaines évaluations.')
        + ' Une attention particulière devra être accordée à la réduction des écarts'
        + (faibles.length ? ' et aux cours les plus en difficulté (' + faibles.join(', ') + ')' : '')
        + '.';

      return { quantitative, qualitative, genre, conclusion };
    }

    function afficher(r) {
      const id = r.identification;
      const e = r.ensemble;
      const t = textes(r);

      /* --- En-tête d'identification --- */
      const paires = [
        ['Zone pédagogique', id.zone], ['Unité pédagogique', id.up],
        ['École', id.ecole], ['Circonscription scolaire', id.cs],
        ['DDEMP', id.ddemp], ['Année scolaire', id.annee],
        ['Le Directeur', id.directeur], ['Le CCS', id.ccs],
        ['Le Titulaire', id.titulaire],
        ['Type d’évaluation', U.libelle(r.type)],
        ['Nombre de classes', id.classes],
        [niveauSynthese === 'UP' ? 'Écoles de l’UP' : 'Évaluation', niveauSynthese === 'UP' ? id.ecoles : ('n° ' + r.numero)]
      ];
      zone.appendChild(U.carte('Identification', el('table', { class: 'tableau tableau-identite' },
        el('tbody', {}, paires.map(([k, v]) =>
          el('tr', {}, [el('td', { text: k }), el('th', { text: String(v) })]))))));

      zone.appendChild(grille([
        U.stat(U.nombre(e.inscrits), 'Inscrits (' + e.inscritsG + ' G / ' + e.inscritsF + ' F)'),
        U.stat(U.nombre(e.compose), 'Ont composé'),
        U.stat(U.nombre(e.minimale), 'Ont atteint le seuil'),
        U.stat(pc(e.taux), 'Taux de réussite', ton(e.taux) === 'danger' || ton(e.taux) === 'attention' ? 'attention' : '')
      ], 'grille-stats'));

      /* --- Tableau par matière --- */
      const colonnes = [
        { titre: 'Matière', valeur: l => l.matiere },
        { titre: 'Inscrits G', valeur: l => l.inscritsG },
        { titre: 'Inscrits F', valeur: l => l.inscritsF },
        { titre: 'Inscrits', valeur: l => l.inscrits },
        { titre: 'Composé G', valeur: l => l.composeG },
        { titre: 'Composé F', valeur: l => l.composeF },
        { titre: 'Ont composé', valeur: l => l.compose },
        { titre: 'Maîtrise partielle', valeur: l => l.partielle },
        { titre: 'Maîtrise minimale', valeur: l => l.minimale },
        { titre: '% réussite', valeur: l => l.taux === null ? '—' : U.badge(pc(l.taux), ton(l.taux)) },
        { titre: 'À renforcer', valeur: l => l.aRenforcer }
      ];
      zone.appendChild(U.carte('Résultats par matière',
        U.tableau(colonnes, r.lignesMatieres.concat([r.ensemble]))));

      /* --- Participation et réussite au seuil --- */
      zone.appendChild(U.carte('Participation et réussite au seuil', el('div', {}, [
        el('p', { class: 'muet petit', text: 'Une matière est acquise à partir de '
          + SEUIL_MAITRISE + ' sur 20 : c’est la maîtrise partielle. La maîtrise minimale ajoute '
          + 'la condition d’ensemble — ' + r.requis + ' matières acquises sur '
          + r.lignesMatieres.length + '.' }),
        U.tableau([
          { titre: 'Indicateur', valeur: x => x.i },
          { titre: 'Garçons', valeur: x => x.g },
          { titre: 'Filles', valeur: x => x.f },
          { titre: 'Total', valeur: x => x.t }
        ], [
          { i: 'Inscrits', g: e.inscritsG, f: e.inscritsF, t: e.inscrits },
          { i: 'Ont composé', g: e.composeG, f: e.composeF, t: e.compose },
          { i: 'Ont atteint le seuil', g: r.seuilG, f: r.seuilF, t: e.minimale },
          { i: 'Taux de réussite', g: pc(r.tauxG), f: pc(r.tauxF), t: pc(e.taux) }
        ])
      ])));

      /* --- Section 1 --- */
      zone.appendChild(U.carte('Section 1 — Analyse quantitative', el('div', {}, [
        U.tableau([
          { titre: 'Indicateur', valeur: x => x.i }
        ].concat(r.cours.map(c => ({ titre: c.niveau, valeur: x => x[c.niveau] }))), [
          Object.assign({ i: 'Inscrits' }, ligneParCours(r, c => c.inscrits)),
          Object.assign({ i: 'Ayant atteint le seuil' }, ligneParCours(r, c => c.seuil)),
          Object.assign({ i: 'Taux de réussite' }, ligneParCours(r, c => pc(c.taux)))
        ]),
        el('p', { class: 'texte-analyse', text: t.quantitative })
      ])));

      /* --- Section 2 --- */
      zone.appendChild(U.carte('Section 2 — Analyse qualitative', el('div', {}, [
        U.tableau([
          { titre: 'Cours', valeur: x => x.niveau },
          { titre: 'Taux de réussite', valeur: x => pc(x.taux) },
          { titre: 'Appréciation', valeur: x => U.badge(appreciation(x.taux), ton(x.taux)) }
        ], r.cours.concat([{ niveau: 'Ensemble', taux: e.taux }])),
        el('p', { class: 'texte-analyse', text: t.qualitative })
      ])));

      /* --- Section 3 --- */
      zone.appendChild(U.carte('Section 3 — Analyse des écarts de genre', el('div', {}, [
        U.tableau([
          { titre: 'Cours', valeur: x => x.niveau },
          { titre: 'Garçons', valeur: x => pc(x.tauxG) },
          { titre: 'Filles', valeur: x => pc(x.tauxF) },
          { titre: 'Écart F − G', valeur: x => (x.tauxG === null || x.tauxF === null) ? '—'
            : U.badge((x.tauxF - x.tauxG > 0 ? '+' : '') + (Math.round((x.tauxF - x.tauxG) * 10) / 10) + ' pts',
              Math.abs(x.tauxF - x.tauxG) < 5 ? 'ok' : 'attention') }
        ], r.cours.concat([{ niveau: 'Ensemble', tauxG: r.tauxG, tauxF: r.tauxF }])),
        el('p', { class: 'texte-analyse', text: t.genre })
      ])));

      /* --- Section 4 --- */
      zone.appendChild(U.carte('Section 4 — Conclusion',
        el('p', { class: 'texte-analyse', text: t.conclusion })));

      zone.appendChild(el('div', { class: 'barre-actions' }, [
        el('button', { class: 'btn btn-primaire', text: 'Éditer la synthèse', onclick: () => editer(r, t) }),
        el('button', { class: 'btn btn-fantome', text: 'Télécharger en Excel', onclick: () => exporter(r, t) })
      ]));
    }

    function ligneParCours(r, f) {
      const o = {};
      r.cours.forEach(c => { o[c.niveau] = f(c); });
      return o;
    }

    /* ---------------------------------------------------------------- */

    function editer(r, t) {
      const ech = EG.Docs.echapper;
      const id = r.identification;
      const e = r.ensemble;

      const identite = '<table class="tableau-identite"><tbody>'
        + [['Zone pédagogique', id.zone], ['Unité pédagogique', id.up], ['École', id.ecole],
           ['Circonscription scolaire', id.cs], ['DDEMP', id.ddemp], ['Année scolaire', id.annee],
           ['Le Directeur', id.directeur], ['Le CCS', id.ccs], ['Le Titulaire', id.titulaire],
           ['Type d’évaluation', U.libelle(r.type)], ['Nombre de classes', id.classes]]
          .map(([k, v]) => '<tr><td>' + k + '</td><th>' + ech(String(v)) + '</th></tr>').join('')
        + '</tbody></table>';

      const parMatiere = '<table><thead><tr>'
        + ['Matière', 'Inscrits G', 'Inscrits F', 'Inscrits', 'Composé G', 'Composé F', 'Ont composé',
           'Maîtrise partielle', 'Maîtrise minimale', '% réussite', 'À renforcer']
          .map(h => '<th>' + h + '</th>').join('')
        + '</tr></thead><tbody>'
        + r.lignesMatieres.concat([e]).map(l => '<tr><td>' + ech(l.matiere) + '</td><td>'
          + l.inscritsG + '</td><td>' + l.inscritsF + '</td><td>' + l.inscrits + '</td><td>'
          + l.composeG + '</td><td>' + l.composeF + '</td><td>' + l.compose + '</td><td>'
          + l.partielle + '</td><td>' + l.minimale + '</td><td>' + pc(l.taux) + '</td><td>'
          + l.aRenforcer + '</td></tr>').join('')
        + '</tbody></table>';

      const participation = '<table><thead><tr><th>Indicateur</th><th>Garçons</th><th>Filles</th>'
        + '<th>Total</th></tr></thead><tbody>'
        + '<tr><td>Inscrits</td><td>' + e.inscritsG + '</td><td>' + e.inscritsF + '</td><td>' + e.inscrits + '</td></tr>'
        + '<tr><td>Ont composé</td><td>' + e.composeG + '</td><td>' + e.composeF + '</td><td>' + e.compose + '</td></tr>'
        + '<tr><td>Ont atteint le seuil</td><td>' + r.seuilG + '</td><td>' + r.seuilF + '</td><td>' + e.minimale + '</td></tr>'
        + '<tr><td>Taux de réussite</td><td>' + pc(r.tauxG) + '</td><td>' + pc(r.tauxF) + '</td><td>' + pc(e.taux) + '</td></tr>'
        + '</tbody></table>';

      const tableauCours = (titre, lignes) => '<table><thead><tr><th>' + titre + '</th>'
        + r.cours.map(c => '<th>' + c.niveau + '</th>').join('') + '</tr></thead><tbody>'
        + lignes.map(([nom, f]) => '<tr><td>' + nom + '</td>'
          + r.cours.map(c => '<td>' + f(c) + '</td>').join('') + '</tr>').join('')
        + '</tbody></table>';

      EG.genererDocument('SYNTHESE_OFFICIELLE',
        'Synthèse de l’évaluation n° ' + r.numero + ' — ' + U.libelle(r.type),
        '<h2>Synthèse de l’évaluation n° ' + r.numero + '</h2>'
        + '<p>Évaluation ' + U.libelle(r.type).toLowerCase() + ' — ' + ech(id.ecole) + '</p>'
        + identite
        + '<h3>Résultats par matière</h3>' + parMatiere
        + '<h3>Participation et réussite au seuil</h3>'
        + '<p>Une matière est acquise à partir de ' + SEUIL_MAITRISE + ' sur 20 : c’est la '
        + 'maîtrise partielle. La maîtrise minimale ajoute la condition d’ensemble — '
        + r.requis + ' matières acquises sur ' + r.lignesMatieres.length + '.</p>' + participation
        + '<h3>Section 1 — Analyse quantitative</h3>'
        + tableauCours('Indicateur', [
          ['Inscrits', c => c.inscrits],
          ['Ayant atteint le seuil', c => c.seuil],
          ['Taux de réussite', c => pc(c.taux)]
        ])
        + '<p>' + ech(t.quantitative) + '</p>'
        + '<h3>Section 2 — Analyse qualitative</h3>'
        + tableauCours('Cours', [
          ['Taux de réussite', c => pc(c.taux)],
          ['Appréciation', c => appreciation(c.taux)]
        ])
        + '<p>' + ech(t.qualitative) + '</p>'
        + '<h3>Section 3 — Analyse des écarts de genre</h3>'
        + tableauCours('Cours', [
          ['Garçons', c => pc(c.tauxG)],
          ['Filles', c => pc(c.tauxF)]
        ])
        + '<p>' + ech(t.genre) + '</p>'
        + '<h3>Section 4 — Conclusion</h3><p>' + ech(t.conclusion) + '</p>');
    }

    function exporter(r, t) {
      const id = r.identification;
      const e = r.ensemble;
      const feuilles = [
        { nom: 'Identification', lignes: [
          ['Zone pédagogique', id.zone], ['Unité pédagogique', id.up], ['École', id.ecole],
          ['Circonscription scolaire', id.cs], ['DDEMP', id.ddemp], ['Année scolaire', id.annee],
          ['Le Directeur', id.directeur], ['Le CCS', id.ccs], ['Le Titulaire', id.titulaire],
          ['Type d’évaluation', U.libelle(r.type)], ['Évaluation n°', r.numero],
          ['Nombre de classes', id.classes]
        ] },
        { nom: 'Par matière', lignes: [['Matière', 'Inscrits G', 'Inscrits F', 'Inscrits',
          'Composé G', 'Composé F', 'Ont composé', 'Maîtrise partielle', 'Maîtrise minimale',
          '% réussite', 'À renforcer']].concat(r.lignesMatieres.concat([e]).map(l =>
            [l.matiere, l.inscritsG, l.inscritsF, l.inscrits, l.composeG, l.composeF, l.compose,
             l.partielle, l.minimale, l.taux, l.aRenforcer])) },
        { nom: 'Participation', lignes: [['Indicateur', 'Garçons', 'Filles', 'Total'],
          ['Inscrits', e.inscritsG, e.inscritsF, e.inscrits],
          ['Ont composé', e.composeG, e.composeF, e.compose],
          ['Ont atteint le seuil', r.seuilG, r.seuilF, e.minimale],
          ['Taux de réussite', r.tauxG, r.tauxF, e.taux]] },
        { nom: 'Par cours', lignes: [['Cours', 'Inscrits', 'Ont composé', 'Ont atteint le seuil',
          '% réussite', '% garçons', '% filles', 'Appréciation']].concat(r.cours.map(c =>
            [c.niveau, c.inscrits, c.compose, c.seuil, c.taux, c.tauxG, c.tauxF, appreciation(c.taux)])) },
        { nom: 'Analyses', lignes: [
          ['Section 1 — Analyse quantitative', t.quantitative],
          ['Section 2 — Analyse qualitative', t.qualitative],
          ['Section 3 — Écarts de genre', t.genre],
          ['Section 4 — Conclusion', t.conclusion]
        ] }
      ];
      const blob = EG.Tableur.construire(feuilles);
      const nom = 'synthese-officielle-eval-' + r.numero + '.xlsx';
      const a = el('a', { href: URL.createObjectURL(blob), download: nom });
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      U.toast('Classeur « ' + nom + ' » téléchargé');
    }
  });
})(window);
