/* ÉduGestion Pro Master — fin de cycle annuel et répertoire national.
   Rapprochement EDUCMaster, clôture d'année, calendrier scolaire. */
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
  const qui = () => (session().user.prenoms || '') + ' ' + session().user.nom;

  function sousSection(titre, contenu, action) {
    return el('section', { class: 'carte' }, [
      el('div', { class: 'ligne-entre' }, [el('h3', { class: 'carte-titre', text: titre }), action || null]),
      contenu
    ]);
  }

  /** Les élèves visibles : ceux inscrits dans le périmètre de l'utilisateur. */
  function elevesDuPerimetre() {
    return Promise.all([DB.all('eleves'), DB.all('inscriptions_eleves')]).then(([eleves, ins]) => {
      const e = ecoleCourante();
      if (!e) return eleves;
      const autorises = {};
      ins.filter(i => i.ecole_id === e).forEach(i => { autorises[i.eleve_id] = true; });
      return eleves.filter(x => autorises[x.id]);
    });
  }

  /* =======================================================================
     EDUCMASTER — matricules, rapprochement, fusion, conflits
     ======================================================================= */

  Routeur.definir('educmaster', function (racine) {
    racine.appendChild(entete('EDUCMaster',
      'Répertoire national : attribution des matricules, rapprochement des dossiers, arbitrage des conflits.',
      [el('button', { class: 'btn btn-fantome', text: 'Synchronisation', onclick: () => Routeur.aller('sync') })]));
    const zone = el('div');
    racine.appendChild(EG.EducMasterModeles.bloc());
    racine.appendChild(zone);
    const raf = () => Routeur.aller('educmaster');

    Promise.all([
      elevesDuPerimetre(),
      charger('rapprochements_eleves'),
      DB.all('conflits_synchronisation'),
      DB.all('educmaster_sync_queue'),
      DB.all('fusions_eleves')
    ]).then(([eleves, rappro, conflits, file, fusions]) => {
      const vivants = eleves.filter(e => e.statut_identite !== 'FUSIONNE');
      const sansMatricule = vivants.filter(e => !e.educmaster_matricule);
      const synchronises = vivants.filter(e => e.educmaster_statut === 'SYNCHRONISE');
      const enAttente = vivants.filter(e => e.educmaster_statut === 'EN_ATTENTE');

      zone.appendChild(grille([
        U.stat(U.nombre(vivants.length), 'Dossiers d’élèves'),
        U.stat(U.nombre(synchronises.length), 'Synchronisés'),
        U.stat(U.nombre(enAttente.length), 'En file d’envoi'),
        U.stat(U.nombre(sansMatricule.length), 'Sans matricule', sansMatricule.length ? 'attention' : ''),
        U.stat(U.nombre(conflits.filter(c => c.statut === 'OUVERT').length), 'Conflits ouverts',
          conflits.filter(c => c.statut === 'OUVERT').length ? 'attention' : '')
      ], 'grille-stats'));

      /* --- Matricules --- */
      if (sansMatricule.length) {
        const table = el('table', { class: 'tableau' });
        table.appendChild(el('thead', {}, el('tr', {}, ['Élève', 'Naissance', 'Matricule EDUCMaster'].map(t => el('th', { text: t })))));
        const tb = el('tbody');
        const champs = {};
        sansMatricule.slice(0, 40).forEach(e => {
          const inp = el('input', { type: 'text', class: 'cel-texte', placeholder: 'EM0000000', 'aria-label': 'Matricule de ' + nomEleve(e) });
          champs[e.id] = inp;
          tb.appendChild(el('tr', {}, [
            el('th', { text: nomEleve(e) }),
            el('td', { text: U.dateCourte(e.date_naissance) }),
            el('td', {}, inp)
          ]));
        });
        table.appendChild(tb);
        zone.appendChild(sousSection('Matricules à renseigner', el('div', {}, [
          el('p', { class: 'muet', text: 'Reportez ici les matricules communiqués par le répertoire national. Les dossiers sans matricule ne remontent pas.' }),
          el('div', { class: 'tableau-enveloppe defilant' }, table),
          EG.peutEcrire() ? el('div', { class: 'barre-actions' }, [
            el('button', {
              class: 'btn btn-primaire', text: 'Enregistrer les matricules', onclick: () => {
                const rows = [];
                Object.keys(champs).forEach(id => {
                  const v = champs[id].value.trim();
                  if (!v) return;
                  const e = sansMatricule.filter(x => x.id === id)[0];
                  rows.push(Object.assign({}, e, { educmaster_matricule: v, educmaster_statut: 'EN_ATTENTE' }));
                });
                if (!rows.length) { U.toast('Aucun matricule saisi', 'attention'); return; }
                DB.putBatch('eleves', rows)
                  .then(() => DB.audit('MATRICULES_EDUCMASTER', 'eleves', null, { nombre: rows.length }))
                  .then(() => { U.toast(rows.length + ' matricule(s) enregistré(s)'); raf(); EG.majSynchro(); });
              }
            })
          ]) : null
        ])));
      }

      /* --- Rapprochement des dossiers --- */
      const aExaminer = rappro.filter(r => r.statut === 'A_EXAMINER');
      zone.appendChild(sousSection('Dossiers à rapprocher', el('div', {}, [
        el('p', { class: 'muet', text: 'L’analyse compare tous les dossiers deux à deux sur le nom, les prénoms, la date de naissance et le sexe. Un doublon non traité fausse les effectifs et casse le suivi jusqu’au CEP.' }),
        U.tableau([
          { titre: 'Dossier examiné', valeur: r => nomEleve(r._a) },
          { titre: 'Dossier candidat', valeur: r => nomEleve(r._b) },
          { titre: 'Naissance', valeur: r => U.dateCourte(r._a && r._a.date_naissance) + ' / ' + U.dateCourte(r._b && r._b.date_naissance) },
          { titre: 'Ressemblance', valeur: r => r.score + ' %' }
        ], aExaminer.map(r => {
          const ia = indexer(eleves);
          return Object.assign({}, r, { _a: ia[r.eleve_local_id], _b: ia[r.candidat_id] });
        }).filter(r => r._a && r._b), {
          messageVide: 'Aucun rapprochement en attente. Lancez l’analyse pour vérifier le fichier.',
          onLigne: r => arbitrer(r)
        })
      ]), EG.peutEcrire() ? el('button', {
        class: 'btn btn-petit btn-fantome', text: 'Analyser le fichier', onclick: analyser
      }) : null));

      /* --- Conflits --- */
      zone.appendChild(sousSection('Conflits de synchronisation', U.tableau([
        { titre: 'Entité', valeur: c => EG.SCHEMA[c.entity_type] ? EG.SCHEMA[c.entity_type].label : c.entity_type },
        { titre: 'Type', valeur: c => c.type_conflit },
        { titre: 'Statut', valeur: c => U.statut(c.statut) },
        { titre: 'Résolution', valeur: c => c.resolution || '—' }
      ], conflits, {
        messageVide: 'Aucun conflit à arbitrer.',
        onLigne: c => c.statut === 'OUVERT' ? resoudreConflit(c) : null
      })));

      /* --- File d'envoi --- */
      zone.appendChild(sousSection('File d’envoi vers le répertoire national', U.tableau([
        { titre: 'Entité', valeur: q => q.entity_type },
        { titre: 'Opération', valeur: q => q.operation },
        { titre: 'Statut', valeur: q => U.statut(q.statut) },
        { titre: 'Tentatives', valeur: q => q.attempts || 0 }
      ], file.slice(0, 20), { messageVide: 'La file est vide.' }),
        EG.peutEcrire() ? el('button', {
          class: 'btn btn-petit btn-fantome', text: 'Mettre en file les dossiers prêts', onclick: () => {
            const prets = vivants.filter(e => e.educmaster_matricule && e.educmaster_statut !== 'SYNCHRONISE');
            if (!prets.length) { U.toast('Aucun dossier prêt à envoyer', 'attention'); return; }
            DB.putBatch('educmaster_sync_queue', prets.map(e => ({
              entity_type: 'eleve', entity_id: e.id, operation: 'UPSERT',
              payload: { matricule: e.educmaster_matricule, nom: e.nom, prenoms: e.prenoms, sexe: e.sexe, date_naissance: e.date_naissance },
              idempotency_key: DB.uuid(), statut: 'PENDING', attempts: 0
            })))
              .then(() => DB.audit('FILE_EDUCMASTER', 'educmaster_sync_queue', null, { nombre: prets.length }))
              .then(() => { U.toast(prets.length + ' dossier(s) mis en file'); raf(); EG.majSynchro(); });
          }
        }) : null));

      if (fusions.length) {
        zone.appendChild(sousSection('Fusions effectuées', U.tableau([
          { titre: 'Date', valeur: f => U.dateCourte(f.created_at) },
          { titre: 'Dossier conservé', valeur: f => nomEleve(indexer(eleves)[f.eleve_cible_id]) },
          { titre: 'Justification', valeur: f => f.justification },
          { titre: 'Par', valeur: f => f.effectuee_par_label || '—' }
        ], fusions)));
      }

      /* -------- Analyse du fichier -------- */
      function analyser() {
        U.toast('Analyse en cours…');
        const candidats = vivants;
        const trouves = [];
        const dejaVu = {};
        rappro.forEach(r => { dejaVu[[r.eleve_local_id, r.candidat_id].sort().join('|')] = true; });

        for (let i = 0; i < candidats.length; i++) {
          for (let j = i + 1; j < candidats.length; j++) {
            const a = candidats[i], b = candidats[j];
            const cle = [a.id, b.id].sort().join('|');
            if (dejaVu[cle]) continue;
            const score = ressemblance(a, b);
            /* Seuil à 75 : un nom et des prénoms identiques ne suffisent pas,
               il faut au moins l'année de naissance qui concorde. */
            if (score.score >= 75) {
              dejaVu[cle] = true;
              trouves.push({
                eleve_local_id: a.id, candidat_id: b.id, score: score.score,
                raisons: score.raisons, statut: 'A_EXAMINER'
              });
            }
          }
        }
        if (!trouves.length) { U.toast('Aucun doublon détecté sur ' + candidats.length + ' dossiers'); return; }
        DB.putBatch('rapprochements_eleves', trouves)
          .then(() => DB.audit('ANALYSE_DOUBLONS', 'rapprochements_eleves', null, { examines: candidats.length, trouves: trouves.length }))
          .then(() => { U.toast(trouves.length + ' rapprochement(s) à examiner'); raf(); EG.majSynchro(); });
      }

      /* -------- Arbitrage d'un rapprochement -------- */
      function arbitrer(r) {
        const comparaison = el('table', { class: 'tableau' });
        comparaison.appendChild(el('thead', {}, el('tr', {}, ['Donnée', 'Dossier A', 'Dossier B'].map(t => el('th', { text: t })))));
        const tb = el('tbody');
        [
          ['Nom', 'nom'], ['Prénoms', 'prenoms'], ['Sexe', 'sexe'],
          ['Naissance', 'date_naissance'], ['Lieu', 'lieu_naissance'],
          ['NPI', 'npi'], ['Matricule', 'educmaster_matricule']
        ].forEach(([lbl, k]) => {
          const va = r._a[k], vb = r._b[k];
          tb.appendChild(el('tr', { class: va && vb && va !== vb ? 'divergent' : '' }, [
            el('th', { text: lbl }),
            el('td', { text: va === null || va === undefined || va === '' ? '—' : String(va) }),
            el('td', { text: vb === null || vb === undefined || vb === '' ? '—' : String(vb) })
          ]));
        });
        comparaison.appendChild(tb);

        const choix = el('select', {}, [
          el('option', { value: r.eleve_local_id, text: 'Conserver le dossier A — ' + nomEleve(r._a) }),
          el('option', { value: r.candidat_id, text: 'Conserver le dossier B — ' + nomEleve(r._b) })
        ]);
        const justification = el('textarea', { rows: 2, placeholder: 'Même enfant, inscrit deux fois lors du transfert de septembre.' });

        U.modal('Rapprocher deux dossiers', el('div', {}, [
          el('p', { class: 'muet', text: 'Ressemblance ' + r.score + ' % — ' + (r.raisons || []).join(', ') }),
          el('div', { class: 'tableau-enveloppe' }, comparaison),
          el('div', { class: 'champ' }, [el('label', { text: 'Dossier à conserver' }), choix]),
          el('div', { class: 'champ' }, [el('label', { text: 'Justification *' }), justification]),
          el('p', { class: 'muet petit', text: 'La fusion déplace inscriptions, notes, présences, liens de parenté et handicaps vers le dossier conservé. L’opération est tracée et réversible seulement par une correction manuelle.' })
        ]), fermer => [
          el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
          el('button', {
            class: 'btn btn-fantome', text: 'Ce sont deux élèves différents', onclick: () => {
              DB.put('rapprochements_eleves', Object.assign({}, r, { statut: 'DISTINCTS' }))
                .then(() => { fermer(); U.toast('Rapprochement écarté'); raf(); });
            }
          }),
          el('button', {
            class: 'btn btn-primaire', text: 'Fusionner', onclick: () => {
              if (!justification.value.trim()) { U.toast('La justification est obligatoire', 'attention'); return; }
              const cibleId = choix.value;
              const sourceId = cibleId === r.eleve_local_id ? r.candidat_id : r.eleve_local_id;
              fermer();
              fusionner(sourceId, cibleId, justification.value.trim(), r);
            }
          })
        ]);
      }

      function resoudreConflit(c) {
        U.modal('Arbitrer un conflit', el('div', {}, [
          el('p', { text: 'Deux versions de la même donnée existent. Choisissez celle qui fait foi.' }),
          el('div', { class: 'grille' }, [
            U.carte('Version locale', el('pre', { class: 'json', text: JSON.stringify(c.donnees_locales, null, 1) })),
            U.carte('Version du répertoire', el('pre', { class: 'json', text: JSON.stringify(c.donnees_distantes, null, 1) }))
          ])
        ]), fermer => [
          el('button', { class: 'btn btn-fantome', text: 'Plus tard', onclick: fermer }),
          el('button', {
            class: 'btn btn-fantome', text: 'Garder la version locale',
            onclick: () => cloturerConflit(c, 'LOCALE', fermer)
          }),
          el('button', {
            class: 'btn btn-primaire', text: 'Garder la version du répertoire',
            onclick: () => cloturerConflit(c, 'DISTANTE', fermer)
          })
        ]);
      }

      function cloturerConflit(c, resolution, fermer) {
        DB.put('conflits_synchronisation', Object.assign({}, c, {
          statut: 'RESOLU', resolution: resolution, resolu_at: new Date().toISOString()
        }))
          .then(() => DB.audit('CONFLIT_RESOLU', 'conflits_synchronisation', c.id, { resolution }))
          .then(() => { fermer(); U.toast('Conflit arbitré'); raf(); EG.majSynchro(); });
      }
    });
  });

  /** Compare deux dossiers et détaille les critères concordants. */
  function ressemblance(a, b) {
    const raisons = [];
    let score = 0;
    const na = U.sansAccent(a.nom || ''), nb = U.sansAccent(b.nom || '');
    const pa = U.sansAccent(a.prenoms || ''), pb = U.sansAccent(b.prenoms || '');
    if (na && na === nb) { score += 40; raisons.push('même nom'); }
    if (pa && pa === pb) { score += 30; raisons.push('mêmes prénoms'); }
    else if (pa.split(' ')[0] && pa.split(' ')[0] === pb.split(' ')[0]) { score += 15; raisons.push('premier prénom identique'); }
    if (a.date_naissance && a.date_naissance === b.date_naissance) { score += 25; raisons.push('même date de naissance'); }
    else if (a.date_naissance && b.date_naissance && a.date_naissance.slice(0, 4) === b.date_naissance.slice(0, 4)) { score += 8; raisons.push('même année de naissance'); }
    if (a.npi && a.npi === b.npi) { score += 40; raisons.push('même NPI'); }
    if (a.educmaster_matricule && a.educmaster_matricule === b.educmaster_matricule) { score += 40; raisons.push('même matricule'); }
    if (a.sexe && b.sexe && a.sexe !== b.sexe) { score -= 30; raisons.push('sexe différent'); }
    return { score: Math.max(0, Math.min(100, score)), raisons };
  }

  /** Déplace tout ce qui est rattaché au dossier absorbé vers le dossier conservé. */
  function fusionner(sourceId, cibleId, justification, rapprochement) {
    const liees = [
      ['inscriptions_eleves', 'eleve_id'], ['eleve_handicaps', 'eleve_id'],
      ['liens_parent_enfant', 'eleve_id'], ['transferts_eleves', 'eleve_id'],
      ['preinscriptions', 'eleve_id'], ['messages', 'eleve_id']
    ];
    const deplaces = {};
    let chaine = Promise.resolve();

    liees.forEach(([table, champ]) => {
      chaine = chaine.then(() => DB.where(table, r => r[champ] === sourceId))
        .then(rows => {
          if (!rows.length) return null;
          deplaces[table] = rows.length;
          return DB.putBatch(table, rows.map(r => Object.assign({}, r, { [champ]: cibleId })));
        });
    });

    chaine
      .then(() => DB.get('eleves', sourceId))
      .then(src => DB.put('eleves', Object.assign({}, src, {
        statut_identite: 'FUSIONNE', fusionne_vers: cibleId
      })))
      .then(() => DB.put('fusions_eleves', {
        eleve_source_id: sourceId, eleve_cible_id: cibleId,
        justification: justification, effectuee_par_label: qui(), elements_deplaces: deplaces
      }))
      .then(() => rapprochement ? DB.put('rapprochements_eleves', Object.assign({}, rapprochement, { statut: 'FUSIONNE' })) : null)
      .then(() => DB.audit('FUSION_ELEVES', 'eleves', cibleId, { source: sourceId, deplaces }))
      .then(() => {
        const total = Object.keys(deplaces).reduce((s, k) => s + deplaces[k], 0);
        U.toast('Dossiers fusionnés — ' + total + ' élément(s) rattaché(s)');
        Routeur.aller('educmaster');
        EG.majSynchro();
      });
  }

  /* =======================================================================
     CLÔTURE D'ANNÉE ET PASSAGE À L'ANNÉE SUIVANTE
     ======================================================================= */

  const SUITE_NIVEAU = {
    PETITS: 'MOYENS', MOYENS: 'GRANDS', GRANDS: 'CI',
    EM1: 'EM2', EM2: 'CI',
    CI: 'CP', CP: 'CE1', CE1: 'CE2', CE2: 'CM1', CM1: 'CM2', CM2: null
  };

  Routeur.definir('cloture', function (racine) {
    racine.appendChild(entete('Clôture de l’année',
      'Vérifier, décider, préparer l’année suivante, puis fermer.'));
    const zone = el('div');
    racine.appendChild(zone);
    const raf = () => Routeur.aller('cloture');

    Promise.all([
      DB.get('annees_scolaires', anneeCourante()),
      DB.all('annees_scolaires'),
      charger('evaluations', { annee_scolaire_id: anneeCourante() }),
      inscriptionsEnrichies({ statuts: ['ACTIF', 'SORTIE_PRIMAIRE_CEP'] }),
      DB.all('decisions_annuelles'), DB.all('resultats_cep'),
      DB.all('notes'), DB.all('matieres'), DB.where('niveau_matieres', { annee_scolaire_id: anneeCourante() }),
      charger('rollover_jobs'), DB.all('preinscriptions')
    ]).then(([annee, annees, evals, ins, decisions, ceps, notes, matieres, nm, jobs, preinscriptions]) => {
      if (!annee) { zone.appendChild(U.vide('Aucune année scolaire active.')); return; }

      const decParIns = {}; decisions.forEach(d => { decParIns[d.inscription_id] = d; });
      const cepParIns = {}; ceps.forEach(c => { cepParIns[c.inscription_id] = c; });
      const idsEval = {}; evals.forEach(e => { idsEval[e.id] = true; });

      const nonVerrouillees = evals.filter(e => e.statut !== 'VERROUILLEE');
      const sansDecision = ins.filter(i => !decParIns[i.id]);
      const cm2 = ins.filter(i => i.niveau === 'CM2');
      const cepNonOfficiels = cm2.filter(i => !cepParIns[i.id] || cepParIns[i.id].statut !== 'OFFICIEL');

      zone.appendChild(grille([
        U.stat(annee.code, 'Année en cours'),
        U.stat(U.nombre(ins.length), 'Élèves concernés'),
        U.stat(U.nombre(sansDecision.length), 'Décisions manquantes', sansDecision.length ? 'attention' : ''),
        U.stat(U.nombre(nonVerrouillees.length), 'Évaluations non verrouillées', nonVerrouillees.length ? 'attention' : '')
      ], 'grille-stats'));

      /* --- Contrôles préalables --- */
      const controles = [
        { libelle: 'Toutes les évaluations sont verrouillées', ok: nonVerrouillees.length === 0, detail: nonVerrouillees.length + ' évaluation(s) encore ouverte(s)' },
        { libelle: 'Chaque élève a une décision de fin d’année', ok: sansDecision.length === 0, detail: sansDecision.length + ' élève(s) sans décision' },
        { libelle: 'Les résultats du CEP sont officiels', ok: cm2.length === 0 || cepNonOfficiels.length === 0, detail: cepNonOfficiels.length + ' candidat(s) sans résultat officiel' }
      ];
      zone.appendChild(sousSection('Contrôles avant clôture', U.tableau([
        { titre: 'Contrôle', valeur: c => c.libelle },
        { titre: 'État', valeur: c => U.badge(c.ok ? 'Satisfait' : 'À traiter', c.ok ? 'ok' : 'attention') },
        { titre: 'Détail', valeur: c => c.ok ? '—' : c.detail }
      ], controles)));

      /* --- Calcul des décisions --- */
      const prog = {}; nm.forEach(p => { prog[p.niveau + '|' + p.matiere_id] = p.coefficient; });
      function calculerDecisions() {
        const parEleve = {};
        notes.filter(n => idsEval[n.evaluation_id] && typeof n.note === 'number').forEach(n => {
          const m = parEleve[n.inscription_id] = parEleve[n.inscription_id] || {};
          m[n.matiere_id] = m[n.matiere_id] || { total: 0, n: 0 };
          m[n.matiere_id].total += n.note; m[n.matiere_id].n++;
        });
        const rows = ins.map(i => {
          const parMat = parEleve[i.id] || {};
          const detail = Object.keys(parMat).map(mid => ({
            note: Math.round(parMat[mid].total / parMat[mid].n * 100) / 100,
            coefficient: prog[i.niveau + '|' + mid] || 1
          }));
          const moy = R.moyenne(detail);
          const mai = R.maitrises(detail);
          const cep = cepParIns[i.id];
          const d = R.decision({
            niveau: i.niveau, moyenne: moy, maitrisees: mai.maitrisees, notees: mai.notees,
            cep: cep ? { statut: cep.statut, admis: cep.admis } : null
          });
          if (!d.decision) return null;
          return Object.assign(decParIns[i.id] || {}, {
            inscription_id: i.id, decision_pedagogique: d.decision, decision_finale: d.decision,
            motif: d.motif, force_par_cep: d.force_par_cep, regle_version: d.regle_version,
            statut: 'A_CONFIRMER'
          });
        }).filter(Boolean);
        return DB.putBatch('decisions_annuelles', rows)
          .then(() => DB.audit('DECISIONS_ANNUELLES', 'decisions_annuelles', null, { nombre: rows.length }))
          .then(() => rows.length);
      }

      /* --- Répartition des décisions --- */
      const repartition = { PASSAGE: 0, REDOUBLEMENT: 0, SORTIE_PRIMAIRE: 0 };
      ins.forEach(i => {
        const d = decParIns[i.id];
        if (d && repartition[d.decision_finale] !== undefined) repartition[d.decision_finale]++;
      });
      zone.appendChild(sousSection('Décisions enregistrées', U.tableau([
        { titre: 'Décision', valeur: k => U.statut(k) },
        { titre: 'Élèves', valeur: k => U.nombre(repartition[k]) },
        { titre: 'Part', valeur: k => ins.length ? Math.round(repartition[k] / ins.length * 100) + ' %' : '—' }
      ], Object.keys(repartition)),
        EG.peutEcrire() ? el('button', {
          class: 'btn btn-petit btn-fantome', text: 'Calculer les décisions manquantes',
          onclick: () => calculerDecisions().then(n => { U.toast(n + ' décision(s) calculée(s)'); raf(); EG.majSynchro(); })
        }) : null));

      /* --- Préparation de l'année suivante --- */
      const anneeSuivante = annees.filter(a => a.date_debut > annee.date_debut)
        .sort((a, b) => a.date_debut.localeCompare(b.date_debut))[0];
      const dejaPreinscrits = preinscriptions.filter(p => anneeSuivante && p.annee_scolaire_id === anneeSuivante.id).length;

      const bloc = el('div');
      if (!anneeSuivante) {
        const debut = new Date(annee.date_debut); debut.setFullYear(debut.getFullYear() + 1);
        const fin = new Date(annee.date_fin); fin.setFullYear(fin.getFullYear() + 1);
        const codeSuivant = (debut.getFullYear()) + '-' + (debut.getFullYear() + 1);
        const cCode = el('input', { type: 'text', value: codeSuivant });
        const cDebut = el('input', { type: 'date', value: debut.toISOString().slice(0, 10) });
        const cFin = el('input', { type: 'date', value: fin.toISOString().slice(0, 10) });
        bloc.appendChild(el('div', { class: 'formulaire' }, [
          el('div', { class: 'champ' }, [el('label', { text: 'Code de l’année suivante' }), cCode]),
          el('div', { class: 'champ' }, [el('label', { text: 'Rentrée' }), cDebut]),
          el('div', { class: 'champ' }, [el('label', { text: 'Fin des cours' }), cFin])
        ]));
        if (EG.peutEcrire()) bloc.appendChild(el('div', { class: 'barre-actions' }, [
          el('button', {
            class: 'btn btn-primaire', text: 'Créer l’année suivante', onclick: () => {
              DB.put('annees_scolaires', {
                code: cCode.value, date_debut: cDebut.value, date_fin: cFin.value, statut: 'PREPARATION'
              })
                .then(a => DB.audit('CREATION_ANNEE', 'annees_scolaires', a.id, { code: a.code }))
                .then(() => { U.toast('Année suivante créée'); raf(); EG.majSynchro(); });
            }
          })
        ]));
      } else {
        bloc.appendChild(el('p', {}, [
          document.createTextNode('Année suivante : '), el('strong', { text: anneeSuivante.code }),
          document.createTextNode(' — ' + U.libelle(anneeSuivante.statut) + ' • ' + dejaPreinscrits + ' préinscription(s) déjà générée(s).')
        ]));
        if (EG.peutEcrire()) bloc.appendChild(el('div', { class: 'barre-actions' }, [
          el('button', {
            class: 'btn btn-fantome', text: 'Générer les classes de l’année suivante',
            onclick: () => genererClasses(annee, anneeSuivante).then(n => { U.toast(n + ' classe(s) créée(s)'); raf(); EG.majSynchro(); })
          }),
          el('button', {
            class: 'btn btn-primaire', text: 'Générer les préinscriptions',
            onclick: () => genererPreinscriptions(annee, anneeSuivante, ins, decParIns)
              .then(res => { U.toast(res.crees + ' préinscription(s) — ' + res.sorties + ' sortie(s) du primaire'); raf(); EG.majSynchro(); })
          })
        ]));
      }
      zone.appendChild(sousSection('Année suivante', bloc));

      /* --- Clôture --- */
      const bloquants = controles.filter(c => !c.ok).length;
      const blocCloture = el('div', {}, [
        el('p', { class: 'muet', text: bloquants
          ? 'La clôture reste possible, mais ' + bloquants + ' contrôle(s) ne sont pas satisfaits : les données figées le seront en l’état.'
          : 'Tous les contrôles sont satisfaits. La clôture fige les évaluations, les décisions et les effectifs de l’année.' })
      ]);
      if (EG.peutEcrire() && annee.statut !== 'CLOTUREE') {
        blocCloture.appendChild(el('div', { class: 'barre-actions' }, [
          el('button', {
            class: 'btn btn-danger', text: 'Clôturer l’année ' + annee.code, onclick: () => {
              U.confirmer('Clôturer l’année', 'Les saisies de l’année ' + annee.code
                + ' ne seront plus modifiables sans demande de réouverture. Assurez-vous que le recensement est transmis.', () => {
                  DB.put('rollover_jobs', {
                    from_year_id: annee.id, to_year_id: anneeSuivante ? anneeSuivante.id : null,
                    statut: 'EN_COURS', current_step: 'Clôture', progress: 0
                  }).then(job =>
                    DB.put('annees_scolaires', Object.assign({}, annee, {
                      statut: 'CLOTUREE', date_cloture: new Date().toISOString()
                    }))
                      .then(() => anneeSuivante ? DB.put('annees_scolaires', Object.assign({}, anneeSuivante, { statut: 'OUVERTE' })) : null)
                      .then(() => anneeSuivante ? DB.setMeta('annee_active', anneeSuivante.id) : null)
                      .then(() => DB.put('rollover_jobs', Object.assign({}, job, {
                        statut: 'TERMINE', current_step: 'Terminé', progress: 100,
                        completed_at: new Date().toISOString(),
                        resume: { eleves: ins.length, decisions: Object.keys(decParIns).length }
                      })))
                  )
                    .then(() => DB.audit('CLOTURE_ANNEE', 'annees_scolaires', annee.id, { code: annee.code }))
                    .then(() => {
                      if (anneeSuivante) {
                        EG.session.annee_id = anneeSuivante.id;
                        EG.session.annee_code = anneeSuivante.code;
                      }
                      U.toast('Année ' + annee.code + ' clôturée');
                      Routeur.aller('accueil'); EG.majSynchro();
                    });
                }, 'Clôturer');
            }
          })
        ]));
      }
      zone.appendChild(sousSection('Clôture', blocCloture));

      if (jobs.length) {
        zone.appendChild(sousSection('Historique des clôtures', U.tableau([
          { titre: 'Étape', valeur: j => j.current_step },
          { titre: 'Statut', valeur: j => U.statut(j.statut) },
          { titre: 'Terminée le', valeur: j => U.dateCourte(j.completed_at) }
        ], jobs)));
      }
    });

    function genererClasses(annee, suivante) {
      return Promise.all([
        DB.where('classes', { annee_scolaire_id: annee.id }),
        DB.where('classes', { annee_scolaire_id: suivante.id })
      ]).then(([actuelles, existantes]) => {
        const dejaLa = {};
        existantes.forEach(c => { dejaLa[c.ecole_id + '|' + c.code] = true; });
        const aCreer = actuelles
          .filter(c => !ecoleCourante() || c.ecole_id === ecoleCourante())
          .filter(c => !dejaLa[c.ecole_id + '|' + c.code])
          .map(c => ({
            ecole_id: c.ecole_id, annee_scolaire_id: suivante.id, niveau: c.niveau,
            code: c.code, libelle: c.libelle, effectif_max: c.effectif_max, actif: true
          }));
        if (!aCreer.length) return 0;
        return DB.putBatch('classes', aCreer).then(() => aCreer.length);
      });
    }

    /** Chaque décision devient une préinscription au niveau qui convient. */
    function genererPreinscriptions(annee, suivante, ins, decParIns) {
      return DB.where('preinscriptions', { annee_scolaire_id: suivante.id }).then(existantes => {
        const dejaLa = {};
        existantes.forEach(p => { dejaLa[p.eleve_id] = true; });
        let sorties = 0;
        const rows = [];
        ins.forEach(i => {
          if (dejaLa[i.eleve_id]) return;
          const d = decParIns[i.id];
          if (!d) return;
          if (d.decision_finale === 'SORTIE_PRIMAIRE') { sorties++; return; }
          const niveauCible = d.decision_finale === 'REDOUBLEMENT' ? i.niveau : SUITE_NIVEAU[i.niveau];
          if (!niveauCible) { sorties++; return; }
          rows.push({
            eleve_id: i.eleve_id, annee_scolaire_id: suivante.id,
            ecole_origine_id: i.ecole_id, ecole_destination_id: i.ecole_id,
            niveau_origine: i.niveau, niveau_propose: niveauCible,
            decision_origine: d.decision_finale, motif: d.motif,
            statut: 'PROPOSEE',
            expires_at: suivante.date_debut
          });
        });
        if (!rows.length) return { crees: 0, sorties };
        return DB.putBatch('preinscriptions', rows)
          .then(() => DB.audit('PREINSCRIPTIONS', 'preinscriptions', null, { nombre: rows.length, annee: suivante.code }))
          .then(() => ({ crees: rows.length, sorties }));
      });
    }
  });

  /* =======================================================================
     CALENDRIER SCOLAIRE
     ======================================================================= */

  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

  Routeur.definir('calendrier', function (racine) {
    racine.appendChild(entete('Calendrier scolaire',
      'Les jours ouvrables servent de base au calcul de l’assiduité.',
      [el('button', { class: 'btn btn-fantome', text: 'Retour aux présences', onclick: () => Routeur.aller('presences') })]));
    const filtres = el('div', { class: 'barre-filtres' });
    const zone = el('div');
    racine.appendChild(filtres); racine.appendChild(zone);
    let cycle = 'PRIMAIRE', mois = '';

    filtres.appendChild(U.selecteur('Cycle', EG.CYCLES.map(c => ({ value: c, label: U.libelle(c) })), cycle,
      v => { cycle = v; mois = ''; dessiner(); }, { vide: false }));
    /* Le choix du mois dépend du calendrier chargé : il vit dans son propre bloc. */
    const boiteMois = el('span', { class: 'boite-filtre' });
    filtres.appendChild(boiteMois);

    function dessiner() {
      zone.textContent = '';
      Promise.all([
        DB.get('annees_scolaires', anneeCourante()),
        DB.where('calendriers_scolaires', { annee_scolaire_id: anneeCourante(), cycle: cycle })
      ]).then(([annee, jours]) => {
        if (!annee) { zone.appendChild(U.vide('Aucune année scolaire active.')); return; }

        if (!jours.length) {
          zone.appendChild(U.vide('Le calendrier de ce cycle n’est pas encore établi pour ' + annee.code + '.',
            EG.peutEcrire() ? el('button', {
              class: 'btn btn-primaire', text: 'Générer les jours ouvrables', onclick: () => generer(annee)
            }) : null));
          return;
        }

        const ouvrables = jours.filter(j => j.ouvrable);
        zone.appendChild(grille([
          U.stat(U.nombre(ouvrables.length), 'Jours ouvrables'),
          U.stat(U.nombre(jours.length - ouvrables.length), 'Jours non travaillés'),
          U.stat(U.dateCourte(annee.date_debut), 'Rentrée'),
          U.stat(U.dateCourte(annee.date_fin), 'Fin des cours')
        ], 'grille-stats'));

        const parMois = {};
        jours.forEach(j => { (parMois[j.date_jour.slice(0, 7)] = parMois[j.date_jour.slice(0, 7)] || []).push(j); });
        const listeMois = Object.keys(parMois).sort();
        if (!mois || listeMois.indexOf(mois) < 0) mois = listeMois[0];

        boiteMois.textContent = '';
        boiteMois.appendChild(U.selecteur('Mois', listeMois.map(m => ({
          value: m, label: U.dateFR(m + '-01').replace(/^\d+ /, '')
        })), mois, v => { mois = v; dessiner(); }, { vide: false }));

        const dujour = (parMois[mois] || []).sort((a, b) => a.date_jour.localeCompare(b.date_jour));
        zone.appendChild(sousSection('Jours du mois', U.tableau([
          { titre: 'Date', valeur: j => U.dateCourte(j.date_jour) },
          { titre: 'Jour', valeur: j => JOURS[new Date(j.date_jour + 'T12:00:00').getDay()] },
          { titre: 'Travaillé', valeur: j => U.badge(j.ouvrable ? 'Oui' : 'Non', j.ouvrable ? 'ok' : 'neutre') },
          { titre: 'Motif', valeur: j => j.motif || '—' },
          {
            titre: '', valeur: j => EG.peutEcrire() ? el('button', {
              class: 'btn btn-petit btn-fantome', text: j.ouvrable ? 'Fermer' : 'Ouvrir',
              onclick: e => {
                e.stopPropagation();
                basculer(j);
              }
            }) : ''
          }
        ], dujour, { messageVide: 'Aucun jour sur ce mois.' })));

        zone.appendChild(el('div', { class: 'barre-actions' }, [
          el('button', {
            class: 'btn btn-fantome', text: 'Régénérer le calendrier',
            onclick: () => U.confirmer('Régénérer', 'Les jours fermés manuellement seront rétablis en jours ouvrables.',
              () => generer(annee, jours), 'Régénérer')
          })
        ]));
      });
    }
    dessiner();

    function basculer(j) {
      if (j.ouvrable) {
        const motif = el('input', { type: 'text', placeholder: 'Fête nationale, congés, examen…' });
        U.modal('Fermer le ' + U.dateFR(j.date_jour), el('div', { class: 'formulaire' }, [
          el('div', { class: 'champ' }, [el('label', { text: 'Motif' }), motif])
        ]), fermer => [
          el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
          el('button', {
            class: 'btn btn-primaire', text: 'Fermer ce jour', onclick: () => {
              DB.put('calendriers_scolaires', Object.assign({}, j, {
                ouvrable: false, coefficient: 0, motif: motif.value || 'Jour non travaillé'
              })).then(() => { fermer(); U.toast('Jour fermé'); dessiner(); EG.majSynchro(); });
            }
          })
        ]);
      } else {
        DB.put('calendriers_scolaires', Object.assign({}, j, { ouvrable: true, coefficient: 1, motif: null }))
          .then(() => { U.toast('Jour ouvert'); dessiner(); EG.majSynchro(); });
      }
    }

    function generer(annee, existants) {
      const parDate = {};
      (existants || []).forEach(j => { parDate[j.date_jour] = j; });
      const rows = [];
      const d = new Date(annee.date_debut + 'T12:00:00');
      const fin = new Date(annee.date_fin + 'T12:00:00');
      while (d <= fin) {
        const iso = d.toISOString().slice(0, 10);
        const jour = d.getDay();
        const ouvrable = jour !== 0 && jour !== 6;
        rows.push(Object.assign(parDate[iso] || {}, {
          annee_scolaire_id: annee.id, cycle: cycle, date_jour: iso,
          ouvrable: ouvrable, coefficient: ouvrable ? 1 : 0,
          motif: ouvrable ? null : 'Fin de semaine', source: 'NATIONAL'
        }));
        d.setDate(d.getDate() + 1);
      }
      DB.putBatch('calendriers_scolaires', rows)
        .then(() => DB.audit('CALENDRIER', 'calendriers_scolaires', null, { cycle: cycle, jours: rows.length }))
        .then(() => {
          U.toast(rows.filter(r => r.ouvrable).length + ' jours ouvrables établis');
          dessiner(); EG.majSynchro();
        });
    }
  });

  EG.Fusion = { ressemblance, fusionner };
})(window);
