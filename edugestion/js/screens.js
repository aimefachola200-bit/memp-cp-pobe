/* ÉduGestion Pro — écrans. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, R = EG.Rules, U = EG.UI;
  const el = U.el, Routeur = U.Routeur;

  /* =======================================================================
     Contexte : périmètre d'accès et chargements
     ======================================================================= */

  function session() { return EG.session; }
  function ecoleCourante() { return session().ecole_id || null; }
  function anneeCourante() { return session().annee_id || null; }

  /** Applique le périmètre de l'utilisateur : un directeur ne voit que son école. */
  function porteeEcole(rows, champ) {
    const e = ecoleCourante();
    if (!e) return rows;
    const c = champ || 'ecole_id';
    return rows.filter(r => !r[c] || r[c] === e);
  }

  function charger(entite, cond) {
    return DB.where(entite, cond).then(rows => {
      const def = EG.SCHEMA[entite];
      const champEcole = def.champs.filter(c => c.n === 'ecole_id')[0];
      if (champEcole && ecoleCourante()) rows = porteeEcole(rows);
      /* Cloisonnement par circonscription : un compte ne voit que les données de son périmètre. */
      return (EG.filtrerPerimetre ? EG.filtrerPerimetre(entite, rows) : Promise.resolve(rows));
    }).then(rows => rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))));
  }

  /** Charge toutes les listes de référence nécessaires à un formulaire. */
  function refsPour(entite) {
    const def = EG.SCHEMA[entite];
    const cibles = {};
    def.champs.filter(c => c.t === 'ref').forEach(c => { cibles[c.ref] = true; });
    const noms = Object.keys(cibles);
    return Promise.all(noms.map(n => DB.all(n))).then(res => {
      const out = {};
      noms.forEach((n, i) => {
        let rows = res[i];
        if (ecoleCourante() && (n === 'ecoles')) rows = rows.filter(r => r.id === ecoleCourante());
        out[n] = rows;
      });
      /* Les listes de choix suivent le périmètre du compte (écoles et circonscriptions). */
      return Promise.all(noms.map(n => (n === 'ecoles' || n === 'territoires') && EG.filtrerPerimetre
        ? EG.filtrerPerimetre(n, out[n]).then(r => { out[n] = r; }) : null)).then(() => out);
    });
  }

  /** Index id → enregistrement, pour afficher des libellés lisibles. */
  function indexer(rows) {
    const m = {};
    rows.forEach(r => { m[r.id] = r; });
    return m;
  }

  function nomEleve(e) { return e ? (e.nom || '').toUpperCase() + ' ' + (e.prenoms || '') : '—'; }

  /** Charge les inscriptions enrichies de l'élève et de la classe.
      Par défaut seules les inscriptions actives ; passer `statuts` pour
      inclure les élèves sortis (bulletins, CEP), qui doivent rester lisibles. */
  function inscriptionsEnrichies(filtre) {
    const f = Object.assign({}, filtre || {});
    const statuts = f.statuts || ['ACTIF'];
    delete f.statuts;
    return Promise.all([
      DB.where('inscriptions_eleves', Object.assign({ annee_scolaire_id: anneeCourante() }, f)),
      DB.all('eleves'), DB.all('classes')
    ]).then(([ins, eleves, classes]) => {
      const ie = indexer(eleves), ic = indexer(classes);
      return porteeEcole(ins.filter(i => statuts.indexOf(i.statut) >= 0)).map(i => Object.assign({}, i, {
        _eleve: ie[i.eleve_id], _classe: ic[i.classe_id],
        _nom: nomEleve(ie[i.eleve_id])
      })).sort((a, b) => a._nom.localeCompare(b._nom, 'fr'));
    });
  }

  function entete(titre, sousTitre, actions) {
    return el('header', { class: 'page-tete' }, [
      el('div', {}, [
        el('h1', { text: titre }),
        sousTitre ? el('p', { class: 'sous-titre', text: sousTitre }) : null
      ]),
      actions ? el('div', { class: 'page-actions' }, actions) : null
    ]);
  }

  function grille(enfants, classe) { return el('div', { class: 'grille ' + (classe || '') }, enfants); }

  /* =======================================================================
     Accueil — tableau de bord adapté au rôle
     ======================================================================= */

  Routeur.definir('accueil', function (racine) {
    const u = session().user;
    const vue = el('div');
    racine.appendChild(vue);

    vue.appendChild(entete('Bonjour ' + (u.prenoms || u.nom),
      U.libelle(u.role) + (session().ecole_nom ? ' — ' + session().ecole_nom : '') + ' • Année ' + (session().annee_code || '')));

    if (u.role === 'PARENT' || u.role === 'ELEVE') return ecranParentAccueil(vue);

    const zone = el('div');
    vue.appendChild(zone);
    zone.appendChild(el('p', { class: 'muet', text: 'Chargement des indicateurs…' }));

    Promise.all([
      inscriptionsEnrichies(),
      DB.all('presences'),
      charger('personnels'),
      charger('alertes'),
      DB.all('regles_retraite'),
      charger('recensements_ecoles'),
      DB.outboxCount()
    ]).then(([ins, pres, agents, alertes, regles, recens, enAttente]) => {
      zone.textContent = '';

      const idsIns = {};
      ins.forEach(i => { idsIns[i.id] = true; });
      const presPeriode = pres.filter(p => idsIns[p.inscription_id]);
      const jours = {};
      presPeriode.forEach(p => { jours[p.date_presence] = true; });
      const nbJours = Object.keys(jours).length;
      const presents = presPeriode.filter(p => p.statut === 'PRESENT').length;
      const tauxPresence = presPeriode.length ? Math.round(presents / presPeriode.length * 100) : null;

      const filles = ins.filter(i => i._eleve && i._eleve.sexe === 'F').length;
      const enseignants = agents.filter(a => a.actif !== false).length;
      const ratio = enseignants ? Math.round(ins.length / enseignants) : null;

      const proches = agents.map(a => R.previsionRetraite(a, regles))
        .filter(p => p && p.mois_restants <= 12).length;

      const alertesOuvertes = alertes.filter(a => ['NOUVELLE', 'AFFECTEE', 'PRISE_EN_CHARGE', 'EN_ATTENTE'].indexOf(a.statut) >= 0);

      zone.appendChild(grille([
        U.stat(U.nombre(ins.length), 'Élèves inscrits'),
        U.stat(U.nombre(filles) + ' / ' + U.nombre(ins.length - filles), 'Filles / garçons'),
        U.stat(tauxPresence === null ? '—' : tauxPresence + ' %', 'Présence (' + nbJours + ' j)', tauxPresence !== null && tauxPresence < 85 ? 'attention' : ''),
        U.stat(U.nombre(enseignants), 'Personnel en poste'),
        U.stat(ratio === null ? '—' : ratio, 'Élèves par maître', ratio > 50 ? 'attention' : ''),
        U.stat(U.nombre(alertesOuvertes.length), 'Alertes ouvertes', alertesOuvertes.length ? 'attention' : '')
      ], 'grille-stats'));

      /* Effectifs par niveau */
      const parNiveau = {};
      ins.forEach(i => {
        parNiveau[i.niveau] = parNiveau[i.niveau] || { F: 0, M: 0 };
        parNiveau[i.niveau][i._eleve && i._eleve.sexe === 'F' ? 'F' : 'M']++;
      });
      const niveaux = EG.NIVEAUX.filter(n => parNiveau[n]);
      if (niveaux.length) {
        zone.appendChild(U.carte('Effectifs par niveau', histogramme(niveaux.map(n => ({
          etiquette: n, valeur: parNiveau[n].F + parNiveau[n].M,
          detail: parNiveau[n].F + ' F / ' + parNiveau[n].M + ' G'
        })))));
      }

      /* Raccourcis selon le rôle */
      const liens = [];
      const ajoute = (icone, titre, route) => liens.push(el('button', {
        class: 'raccourci', onclick: () => Routeur.aller(route)
      }, [el('span', { class: 'raccourci-icone', text: icone }), el('span', { text: titre })]));

      if (['PARENT', 'ELEVE'].indexOf(u.role) < 0 && EG.peutVoirModule('eleves')) ajoute('\uE01F', 'Listes de classe', 'listes-classe');
      if (u.role === 'ENSEIGNANT') {
        ajoute('\uE004', 'Faire l’appel', 'presences');
        ajoute('\uE00E', 'Saisir les notes', 'evaluations');
        ajoute('\uE05B', 'Cantine du jour', 'cantine');
        ajoute('\uE02D', 'Tableau d’affichage', 'affichage');
        ajoute('\uE021', 'Ma classe', 'eleves');
      } else if (u.role === 'DIRECTEUR') {
        ajoute('\uE02B', 'Carte d’identité de l’école', 'carte-ecole');
        ajoute('\uE021', 'Inscrire un élève', 'eleves');
        ajoute('\uE004', 'Présences', 'presences');
        ajoute('\uE040', 'Recensement', 'recensement');
        ajoute('\uE022', 'Patrimoine', 'patrimoine');
        ajoute('\uE01E', 'Personnel', 'personnel');
        ajoute('\uE00D', 'Certificats du personnel', 'certificats');
        ajoute('\uE022', 'Annuaire des écoles', 'annuaire-ecoles');
        ajoute('\uE01E', 'Classes et rôles de gestion', 'classes-roles');
        ajoute('\uE032', 'Comptes d’accès', 'comptes');
        ajoute('\uE009', 'Téléchargements', 'telechargements');
        ajoute('\uE04E', 'Budget', 'budget');
        ajoute('\uE016', 'Synthèse des évaluations', 'synthese-evaluations');
        ajoute('\uE00F', 'Registre d’appel', 'registre-appel');
        ajoute('\uE017', 'Relevé mensuel', 'releve-mensuel');
        ajoute('\uE018', 'Présence du personnel', 'presences-personnel');
        ajoute('\uE00D', 'Documents', 'documents');
      } else {
        ajoute('\uE022', 'Écoles', 'gestion-ecoles');
        if (u.role !== 'CONSEILLER_PEDAGOGIQUE') {
          ajoute('\uE00B', 'Importer des écoles', 'import-ecoles');
          ajoute('\uE032', 'Comptes d’accès', 'comptes');
        }
        ajoute('\uE009', 'Téléchargements', 'telechargements');
        ajoute('\uE015', 'Statistiques', 'analytics');
        ajoute('\uE016', 'Synthèse officielle', 'synthese-officielle');
        ajoute('\uE027', 'Examen blanc en centre', 'cep-blanc-centre');
        ajoute('\uE040', 'Recensement', 'recensement');
        ajoute('\uE055', 'Alertes', 'alertes');
        ajoute('\uE042', 'Visites', 'visites');
        ajoute('\uE019', 'Retraites', 'retraite');
        ajoute('\uE011', 'Rapports', 'rapports');
        ajoute('\uE058', 'Clôture d’année', 'cloture');
      }
      if (['PARENT', 'ELEVE'].indexOf(u.role) < 0) ajoute('\uE031', 'Documents officiels', 'documents-officiels');
      if (['PARENT', 'ELEVE'].indexOf(u.role) < 0) ajoute('\uE031', 'Fiches, résumés et épreuves', 'pedagogie');
      if (['PARENT', 'ELEVE'].indexOf(u.role) < 0 && EG.peutVoirModule('pedagogie-sec')) ajoute('\uE031', 'Pédagogie du secondaire', 'pedagogie-sec');
      if (['PARENT', 'ELEVE'].indexOf(u.role) < 0 && EG.peutVoirModule('bulletins-sec')) ajoute('\uE010', 'Notes et bulletins du secondaire', 'bulletins-sec');
      if (['PARENT', 'ELEVE'].indexOf(u.role) < 0 && EG.peutVoirModule('maitre-semaine')) ajoute('\uE004', 'Maître de semaine', 'maitre-semaine');
      if (['PARENT', 'ELEVE'].indexOf(u.role) < 0 && EG.peutVoirModule('annonces-personnel')) ajoute('\uE050', 'Annonces au personnel', 'annonces-personnel');
      if (['PARENT', 'ELEVE'].indexOf(u.role) < 0 && EG.peutVoirModule('releves-mensuels')) ajoute('\uE004', 'Relevé mensuel des présences', 'releves-mensuels');
      if (['PARENT', 'ELEVE', 'ENSEIGNANT'].indexOf(u.role) < 0 && EG.peutVoirModule('vie-etablissement')) ajoute('\uE054', 'Vie de l’établissement (secondaire)', 'vie-etablissement');
      if (['PARENT', 'ELEVE', 'ENSEIGNANT'].indexOf(u.role) < 0 && EG.peutVoirModule('examens-sec')) ajoute('\uE00F', 'Examens BEPC / BAC', 'examens-sec');
      if (['PARENT', 'ELEVE', 'ENSEIGNANT'].indexOf(u.role) < 0 && EG.peutVoirModule('ferme-ecole')) ajoute('\uE00A', 'Ferme-école (lycée agricole)', 'ferme-ecole');
      if (['PARENT', 'ELEVE', 'ENSEIGNANT'].indexOf(u.role) < 0 && EG.peutVoirModule('pilotage-sec')) ajoute('\uE00A', 'Pilotage et ETP (secondaire)', 'pilotage-sec');
      zone.appendChild(U.carte('Accès rapide', el('div', { class: 'raccourcis' }, liens)));

      /* Points de vigilance */
      const points = [];
      if (proches) points.push(proches + ' agent(s) partent à la retraite dans les 12 mois.');
      const attendus = recens.filter(r => ['BROUILLON', 'A_COMPLETER'].indexOf(r.statut) >= 0).length;
      if (attendus) points.push(attendus + ' fiche(s) de recensement restent à compléter.');
      if (enAttente) points.push(enAttente + ' opération(s) attendent la synchronisation.');
      if (tauxPresence !== null && tauxPresence < 85) points.push('La présence moyenne est inférieure à 85 %.');
      if (points.length) {
        zone.appendChild(U.carte('À traiter', el('ul', { class: 'liste-points' },
          points.map(p => el('li', { text: p })))));
      }

      if (alertesOuvertes.length) {
        zone.appendChild(U.carte('Dernières alertes', U.tableau([
          { titre: 'Sévérité', valeur: a => U.statut(a.severite) },
          { titre: 'Alerte', valeur: a => a.titre },
          { titre: 'Statut', valeur: a => U.statut(a.statut) }
        ], alertesOuvertes.slice(0, 5), { onLigne: () => Routeur.aller('alertes') })));
      }
    });
  });

  function histogramme(series) {
    const max = Math.max.apply(null, series.map(s => s.valeur).concat([1]));
    return el('div', { class: 'histogramme' }, series.map(s => el('div', { class: 'histo-ligne' }, [
      el('span', { class: 'histo-etiquette', text: s.etiquette }),
      el('span', { class: 'histo-piste' }, el('span', { class: 'histo-barre', style: 'width:' + (s.valeur / max * 100) + '%' })),
      el('span', { class: 'histo-valeur', text: U.nombre(s.valeur) + (s.detail ? ' · ' + s.detail : '') })
    ])));
  }

  /* =======================================================================
     Liste des modules
     ======================================================================= */

  Routeur.definir('modules', function (racine) {
    racine.appendChild(entete('Tous les modules', EG.MODULES.length + ' modules métier'));
    const recherche = el('div');
    racine.appendChild(recherche);
    const liste = el('div', { class: 'modules' });
    racine.appendChild(liste);

    function dessiner(filtre) {
      liste.textContent = '';
      const f = filtre ? U.sansAccent(filtre) : '';
      let total = 0;
      (EG.CATEGORIES_MODULES || []).forEach(cat => {
        const modules = EG.MODULES.filter(m => m.cat === cat.code)
          .filter(m => !f || U.sansAccent(m.nom).indexOf(f) >= 0
            || m.entites.some(e => U.sansAccent(EG.SCHEMA[e].label).indexOf(f) >= 0))
          .filter(m => EG.peutVoirModule(m.code));
        if (!modules.length) return;
        total += modules.length;

        const groupe = el('section', { class: 'groupe-categorie' });
        groupe.style.setProperty('--coul-cat', cat.coul);
        groupe.appendChild(el('div', { class: 'bandeau-categorie' }, [
          el('span', { class: 'bandeau-icone', text: cat.icone }),
          el('h2', { text: cat.nom }),
          el('span', { class: 'bandeau-compte', text: String(modules.length) })
        ]));

        const grille = el('div', { class: 'tuiles-modules' });
        modules.forEach(m => {
          // La tuile principale ouvre directement l'espace de travail du module ;
          // à défaut d'écran dédié, la première table sert de destination.
          let routePrincipale, entitesRestantes;
          if (m.ecran) { routePrincipale = m.ecran; entitesRestantes = m.entites; }
          else { routePrincipale = 'entite/' + m.entites[0]; entitesRestantes = m.entites.slice(1); }

          const secondaires = [];
          (m.annexes || []).forEach(([route, libelle, icone]) => secondaires.push({ route, libelle, icone: icone || '\uE053' }));
          entitesRestantes.forEach(e => secondaires.push({ route: 'entite/' + e, libelle: EG.SCHEMA[e].label, icone: EG.SCHEMA[e].icone }));

          const conteneur = el('div', { class: 'tuile-conteneur' }, [
            el('button', {
              class: 'tuile-module', title: m.nom,
              onclick: () => Routeur.aller(routePrincipale)
            }, [
              el('span', { class: 'tuile-icone', text: m.icone }),
              el('span', { class: 'tuile-nom', text: m.nom })
            ])
          ]);

          if (secondaires.length) {
            const mini = el('div', { class: 'tuile-secondaires' });
            secondaires.forEach(s => mini.appendChild(el('button', {
              class: 'tuile-mini', title: s.libelle, 'aria-label': s.libelle,
              onclick: ev => { ev.stopPropagation(); Routeur.aller(s.route); }
            }, el('span', { text: s.icone }))));
            conteneur.appendChild(mini);
          }

          grille.appendChild(conteneur);
        });
        groupe.appendChild(grille);
        liste.appendChild(groupe);
      });
      if (!total) liste.appendChild(U.vide('Aucun module ne correspond à cette recherche.'));
    }
    recherche.appendChild(U.champRecherche('Rechercher un module ou une table', dessiner));
    dessiner('');
  });

  /* =======================================================================
     Carte d'identité de l'école — séparée du tableau de bord et des modules :
     l'essentiel administratif d'un établissement (identification, localisation)
     en un coup d'œil, sans le mélanger aux statistiques ni à la liste des tables.
     ======================================================================= */

  Routeur.definir('carte-ecole', function (racine, args) {
    const idDemande = args && args[0];
    const idEcole = idDemande || ecoleCourante();

    if (!idEcole) {
      racine.appendChild(entete('Carte d’identité de l’école', ''));
      racine.appendChild(U.vide('Aucune école n’est rattachée à votre compte. Ouvrez l’annuaire des écoles pour en choisir une.'));
      racine.appendChild(el('div', { class: 'barre-actions' }, [
        el('button', { class: 'btn btn-fantome', text: 'Annuaire des écoles', onclick: () => Routeur.aller('annuaire-ecoles') })
      ]));
      return;
    }

    const tete = el('div');
    const zone = el('div');
    racine.appendChild(tete); racine.appendChild(zone);

    Promise.all([DB.get('ecoles', idEcole), DB.all('territoires')]).then(([ec, terr]) => {
      if (!ec) { racine.appendChild(U.vide('Cette école est introuvable.')); return; }
      const it = indexer(terr);
      const nomTerr = id => (id && it[id]) ? it[id].nom : '—';
      const val = v => (v === null || v === undefined || v === '' ? '—' : String(v));
      const ligne = (k, v) => el('div', { class: 'fiche-ligne' }, [el('dt', { text: k }), el('dd', { text: val(v) })]);

      tete.appendChild(entete(ec.nom, U.libelle(ec.cycle) + (ec.code_ecole ? ' • ' + ec.code_ecole : ''),
        EG.peutEcrire() ? [el('button', {
          class: 'btn btn-primaire', text: 'Modifier',
          onclick: () => editer('ecoles', ec, () => Routeur.aller('carte-ecole' + (idDemande ? '/' + idDemande : '')))
        })] : []));

      const identification = el('dl', { class: 'fiche' }, [
        ligne('Code école', ec.code_ecole), ligne('Nom', ec.nom), ligne('Cycle', U.libelle(ec.cycle)),
        ligne('Type', ec.type_ecole && U.libelle(ec.type_ecole)), ligne('Statut', ec.statut && U.libelle(ec.statut)),
        ligne('Région pédagogique n°', ec.region_pedagogique),
        ligne('Année de création', ec.annee_creation), ligne('Référence de création', ec.reference_creation),
        ligne('Année de dernière extension', ec.annee_extension), ligne('Référence d’extension', ec.reference_extension),
        ligne('Directeur', ec.directeur_nom), ligne('Téléphone du directeur', ec.directeur_telephone),
        ligne('Téléphone de l’école', ec.telephone), ligne('E-mail', ec.email)
      ]);
      zone.appendChild(U.carte('Identification', identification));

      const localisation = el('dl', { class: 'fiche' }, [
        ligne('Département', nomTerr(ec.departement_id)), ligne('Commune', nomTerr(ec.commune_id)),
        ligne('Arrondissement', nomTerr(ec.arrondissement_id)), ligne('Village ou quartier de ville', nomTerr(ec.village_quartier_id)),
        ligne('Circonscription scolaire (CS)', nomTerr(ec.territoire_id)),
        ligne('Zone pédagogique', nomTerr(ec.zone_id)), ligne('Unité pédagogique', nomTerr(ec.up_id)),
        ligne('Adresse', ec.adresse), ligne('Boîte postale', ec.bp), ligne('Ville', ec.ville)
      ]);
      zone.appendChild(U.carte('Localisation', localisation));

      zone.appendChild(el('div', { class: 'barre-actions' }, [
        el('button', { class: 'btn btn-fantome', text: 'Cachet de l’établissement', onclick: () => Routeur.aller('cachet') }),
        el('button', { class: 'btn btn-fantome', text: 'Fiche complète', onclick: () => Routeur.aller('entite/ecoles') })
      ]));
    });
  });

  /* =======================================================================
     CRUD générique piloté par le schéma
     ======================================================================= */

  Routeur.definir('entite', function (racine, args) {
    const nom = args[0];
    const def = EG.SCHEMA[nom];
    if (!def) { racine.appendChild(U.vide('Cette table n’existe pas.')); return; }
    const lecture = def.lectureSeule || !EG.peutEcrire();

    const actions = [];
    if (!lecture) actions.push(el('button', {
      class: 'btn btn-primaire', text: 'Ajouter', onclick: () => editer(nom, null, rafraichir)
    }));
    actions.push(el('button', { class: 'btn btn-fantome', text: '\uE015 Exporter en Excel', onclick: () => exporterExcel(nom) }));
    actions.push(el('button', { class: 'btn btn-fantome', text: 'Exporter en CSV', onclick: () => exporterCSV(nom) }));

    racine.appendChild(entete(def.label, def.champs.length + ' champs', actions));
    const barreFiltre = el('div', { class: 'barre-filtres' });
    racine.appendChild(barreFiltre);
    const zone = el('div');
    racine.appendChild(zone);

    let filtre = '';
    barreFiltre.appendChild(U.champRecherche('Rechercher dans ' + def.label.toLowerCase(), v => { filtre = v; rafraichir(); }));

    function rafraichir() {
      zone.textContent = '';
      Promise.all([charger(nom), refsPour(nom)]).then(([rows, refs]) => {
        const idx = {};
        Object.keys(refs).forEach(k => { idx[k] = indexer(refs[k]); });

        const affiche = (r, c) => {
          const v = r[c.n];
          if (c.t === 'bool') return v ? '✓' : '—';
          if (c.t === 'ref') return idx[c.ref] && idx[c.ref][v] ? U.titreDe(c.ref, idx[c.ref][v]) : '—';
          if (c.t === 'money') return U.fcfa(v);
          if (c.t === 'date') return U.dateCourte(v);
          if (c.t === 'datetime') return U.heure(v);
          if (c.n === 'statut' || c.n === 'severite' || c.n === 'niveau' && def.label.indexOf('risque') >= 0) return U.statut(v);
          if (c.t === 'select') return v ? U.statut(v) : '—';
          if (c.t === 'json') return v ? el('code', { class: 'json', text: JSON.stringify(v).slice(0, 40) }) : '—';
          return v === null || v === undefined || v === '' ? '—' : String(v);
        };

        const colonnes = def.champs.filter(c => c.list).slice(0, 6)
          .map(c => ({ titre: c.l, valeur: r => affiche(r, c) }));
        if (!colonnes.length) colonnes.push({ titre: def.singulier, valeur: r => U.titreDe(nom, r) });
        colonnes.push({ titre: 'Synchro', classe: 'col-etroite', valeur: r => U.badge(r.sync_status === 'SYNCED' ? 'à jour' : 'en attente', r.sync_status === 'SYNCED' ? 'ok' : 'attention') });

        const filtrees = rows.filter(r => !filtre || U.sansAccent(JSON.stringify(r)).indexOf(U.sansAccent(filtre)) >= 0);

        zone.appendChild(el('p', { class: 'muet', text: filtrees.length + ' enregistrement(s)' }));
        zone.appendChild(U.tableau(colonnes, filtrees, {
          messageVide: 'Aucun enregistrement. ' + (lecture ? '' : 'Utilisez « Ajouter » pour créer le premier.'),
          onLigne: r => fiche(nom, r, rafraichir, idx)
        }));
      });
    }
    rafraichir();
  });

  function fiche(entite, rec, apres, idx) {
    const def = EG.SCHEMA[entite];
    const corps = el('dl', { class: 'fiche' });
    def.champs.forEach(c => {
      let v = rec[c.n];
      if (c.t === 'ref' && idx && idx[c.ref]) v = idx[c.ref][v] ? U.titreDe(c.ref, idx[c.ref][v]) : null;
      else if (c.t === 'bool') v = v ? 'Oui' : 'Non';
      else if (c.t === 'money') v = U.fcfa(v);
      else if (c.t === 'date') v = U.dateCourte(v);
      else if (c.t === 'datetime') v = U.heure(v);
      else if (c.t === 'json') v = v ? JSON.stringify(v, null, 1) : null;
      corps.appendChild(el('div', { class: 'fiche-ligne' }, [
        el('dt', { text: c.l }),
        el('dd', { text: v === null || v === undefined || v === '' ? '—' : String(v) })
      ]));
    });
    corps.appendChild(el('p', { class: 'muet petit', text: 'Modifié le ' + U.heure(rec.updated_at) + ' • version ' + rec.version }));

    U.modal(U.titreDe(entite, rec), corps, fermer => {
      const btns = [el('button', { class: 'btn btn-fantome', text: 'Fermer', onclick: fermer })];
      if (!def.lectureSeule && EG.peutEcrire()) {
        btns.push(el('button', {
          class: 'btn btn-danger', text: 'Supprimer', onclick: () => {
            fermer();
            U.confirmer('Supprimer cet enregistrement', 'Cette suppression sera transmise au serveur à la prochaine synchronisation.', () => {
              DB.remove(entite, rec.id).then(() => DB.audit('SUPPRESSION', entite, rec.id))
                .then(() => { U.toast('Enregistrement supprimé'); apres(); EG.majSynchro(); });
            }, 'Supprimer');
          }
        }));
        btns.push(el('button', {
          class: 'btn btn-primaire', text: 'Modifier',
          onclick: () => { fermer(); editer(entite, rec, apres); }
        }));
      }
      return btns;
    });
  }

  function editer(entite, rec, apres) {
    const def = EG.SCHEMA[entite];
    refsPour(entite).then(refs => {
      const valeurs = Object.assign({}, rec || {});
      if (!rec) {
        def.champs.forEach(c => {
          if (c.scope && ecoleCourante()) valeurs[c.n] = ecoleCourante();
          if (c.annee && anneeCourante()) valeurs[c.n] = anneeCourante();
        });
      }
      const form = U.formulaire(entite, valeurs, refs, {
        masquer: entite === 'users' ? [] : [],
        excludeId: rec ? rec.id : null
      });
      const erreurs = el('div', { class: 'erreurs' });
      U.modal((rec && rec.id ? 'Modifier ' : 'Ajouter ') + def.singulier.toLowerCase(), [erreurs, form], fermer => [
        el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
        el('button', {
          class: 'btn btn-primaire', text: 'Enregistrer', onclick: () => {
            const lu = form.lire();
            erreurs.textContent = '';
            if (lu.erreurs.length) {
              lu.erreurs.forEach(e => erreurs.appendChild(el('p', { text: e })));
              return;
            }
            const suite = entite === 'users' && lu.valeurs.mot_de_passe
              ? EG.hashMotDePasse(lu.valeurs.mot_de_passe).then(h => { lu.valeurs.password_hash = h; delete lu.valeurs.mot_de_passe; })
              : Promise.resolve(delete lu.valeurs.mot_de_passe);
            suite.then(() => DB.put(entite, lu.valeurs))
              .then(r => DB.audit(rec ? 'MODIFICATION' : 'CREATION', entite, r.id))
              /* Toute école nouvelle reçoit sa fiche de recensement. */
              .then(() => (entite === 'ecoles' && !rec) ? EG.assurerFichesRecensement() : null)
              .then(() => { fermer(); U.toast('Enregistré'); apres(); EG.majSynchro(); });
          }
        })
      ]);
    });
  }

  /** Excel : une feuille, rubriques = libellés des champs (en clair), une ligne par enregistrement. */
  function exporterExcel(entite) {
    charger(entite).then(rows => {
      if (!rows.length) return U.toast('Aucune donnée à exporter', 'attention');
      const champs = EG.SCHEMA[entite].champs.filter(c => c.t !== 'password');
      const lignes = [champs.map(c => c.l || c.n)].concat(rows.map(r => champs.map(c => {
        const v = r[c.n];
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') return JSON.stringify(v);
        if (c.t === 'select' || c.o) return U.libelle(v);
        return v;
      })));
      EG.Sortie.excel(entite, [{ nom: EG.SCHEMA[entite].label || entite, lignes }]);
    });
  }

  function exporterCSV(entite) {
    charger(entite).then(rows => {
      if (!rows.length) return U.toast('Aucune donnée à exporter', 'attention');
      const champs = EG.SCHEMA[entite].champs.map(c => c.n);
      const lignes = [champs.join(';')].concat(rows.map(r => champs.map(c => {
        const v = r[c];
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') return JSON.stringify(v).replace(/;/g, ',');
        return String(v).replace(/[;\n\r]/g, ' ');
      }).join(';')));
      telecharger(entite + '.csv', '\ufeff' + lignes.join('\n'), 'text/csv;charset=utf-8');
    });
  }

  function telecharger(nom, contenu, type) {
    const blob = new Blob([contenu], { type: type || 'application/octet-stream' });
    const a = el('a', { href: URL.createObjectURL(blob), download: nom });
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    U.toast('Fichier « ' + nom + ' » téléchargé');
  }

  /* =======================================================================
     Présences — appel de classe hors-ligne
     ======================================================================= */

  Routeur.definir('presences', function (racine) {
    racine.appendChild(entete('Présences', 'L’appel fonctionne sans réseau : les saisies partent à la prochaine synchronisation.',
      [el('button', { class: 'btn btn-fantome', text: 'Registre du mois', onclick: () => Routeur.aller('registre-appel') }),
       el('button', { class: 'btn btn-fantome', text: 'Relevé mensuel', onclick: () => Routeur.aller('releve-mensuel') }),
       el('button', { class: 'btn btn-fantome', text: 'Personnel', onclick: () => Routeur.aller('presences-personnel') }),
       el('button', { class: 'btn btn-fantome', text: 'Bilan de présence', onclick: () => Routeur.aller('bilan-presences') }),
       el('button', { class: 'btn btn-fantome', text: 'Calendrier scolaire', onclick: () => Routeur.aller('calendrier') })]));
    const filtres = el('div', { class: 'barre-filtres' });
    const zone = el('div');
    racine.appendChild(filtres); racine.appendChild(zone);

    let classeId = '', date = new Date().toISOString().slice(0, 10);

    DB.where('classes', { annee_scolaire_id: anneeCourante() }).then(cls => {
      const dispo = porteeEcole(cls);
      classeId = dispo.length ? dispo[0].id : '';
      filtres.appendChild(U.selecteur('Classe', dispo.map(c => ({ value: c.id, label: c.libelle || c.code })), classeId,
        v => { classeId = v; dessiner(); }, { vide: false }));
      const champDate = el('label', { class: 'filtre' }, [
        el('span', { text: 'Date' }),
        el('input', { type: 'date', value: date, onchange: e => { date = e.target.value; dessiner(); } })
      ]);
      filtres.appendChild(champDate);
      dessiner();
    });

    function dessiner() {
      zone.textContent = '';
      if (!classeId) { zone.appendChild(U.vide('Aucune classe n’est ouverte pour cette année. Créez-en une dans le module Socle.')); return; }
      Promise.all([
        inscriptionsEnrichies({ classe_id: classeId }),
        DB.where('presences', { date_presence: date })
      ]).then(([ins, pres]) => {
        if (!ins.length) { zone.appendChild(U.vide('Aucun élève inscrit dans cette classe.')); return; }
        const parIns = {};
        pres.forEach(p => { parIns[p.inscription_id] = p; });
        const etat = {};
        ins.forEach(i => { etat[i.id] = parIns[i.id] ? parIns[i.id].statut : 'PRESENT'; });

        const compteur = el('p', { class: 'muet' });
        function majCompteur() {
          const v = Object.keys(etat).map(k => etat[k]);
          compteur.textContent = v.filter(s => s === 'PRESENT').length + ' présents · '
            + v.filter(s => s === 'ABSENT').length + ' absents · '
            + v.filter(s => s === 'RETARD').length + ' en retard';
        }

        const liste = el('div', { class: 'appel' });
        ins.forEach(i => {
          const ligne = el('div', { class: 'appel-ligne' });
          ligne.appendChild(el('div', { class: 'appel-nom' }, [
            el('strong', { text: i._nom }),
            el('span', { class: 'muet petit', text: (i._eleve ? i._eleve.sexe : '') + ' • ' + i.niveau + (i.redoublant ? ' • redoublant' : '') })
          ]));
          const boutons = el('div', { class: 'segment' });
          [['PRESENT', 'P'], ['ABSENT', 'A'], ['RETARD', 'R']].forEach(([v, lbl]) => {
            const b = el('button', { class: 'segment-btn' + (etat[i.id] === v ? ' actif ' + v.toLowerCase() : ''), text: lbl, 'aria-label': U.libelle(v) });
            b.addEventListener('click', () => {
              etat[i.id] = v;
              Array.prototype.forEach.call(boutons.children, (x, k) => {
                const val = ['PRESENT', 'ABSENT', 'RETARD'][k];
                x.className = 'segment-btn' + (etat[i.id] === val ? ' actif ' + val.toLowerCase() : '');
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
          el('h3', { text: 'Appel du ' + U.dateFR(date) }), compteur
        ]));
        zone.appendChild(liste);
        zone.appendChild(el('div', { class: 'barre-actions' }, [
          el('button', {
            class: 'btn btn-fantome', text: 'Tout marquer présent', onclick: () => {
              ins.forEach(i => { etat[i.id] = 'PRESENT'; });
              dessinerApres(zone, dessiner);
            }
          }),
          el('button', {
            class: 'btn btn-primaire', text: 'Enregistrer l’appel', onclick: () => {
              const lignes = ins.map(i => Object.assign(parIns[i.id] || {}, {
                inscription_id: i.id, date_presence: date, periode: 'JOURNEE', statut: etat[i.id]
              }));
              DB.putBatch('presences', lignes)
                .then(() => DB.audit('APPEL', 'presences', classeId, { date, effectif: lignes.length }))
                .then(() => { U.toast('Appel enregistré pour ' + lignes.length + ' élèves'); EG.majSynchro(); dessiner(); });
            }
          })
        ]));

        /* Assiduité du mois */
        const debutMois = date.slice(0, 8) + '01';
        DB.all('presences').then(all => {
          const idsIns = indexer(ins);
          const mois = all.filter(p => idsIns[p.inscription_id] && p.date_presence >= debutMois && p.date_presence <= date);
          if (!mois.length) return;
          const parEleve = {};
          mois.forEach(p => {
            parEleve[p.inscription_id] = parEleve[p.inscription_id] || { total: 0, abs: 0 };
            parEleve[p.inscription_id].total++;
            if (p.statut === 'ABSENT') parEleve[p.inscription_id].abs++;
          });
          const risques = ins.map(i => ({ i, s: parEleve[i.id] }))
            .filter(x => x.s && x.s.abs / x.s.total > 0.15)
            .sort((a, b) => (b.s.abs / b.s.total) - (a.s.abs / a.s.total));
          if (risques.length) {
            zone.appendChild(U.carte('Absences répétées ce mois-ci', U.tableau([
              { titre: 'Élève', valeur: x => x.i._nom },
              { titre: 'Absences', valeur: x => x.s.abs + ' / ' + x.s.total + ' jours' },
              { titre: 'Taux', valeur: x => Math.round(x.s.abs / x.s.total * 100) + ' %' }
            ], risques.slice(0, 8))));
          }
        });
      });
    }
    function dessinerApres(z, fn) { fn(); }
  });

  /* =======================================================================
     Évaluations — saisie des notes, moyennes, décisions
     ======================================================================= */

  Routeur.definir('evaluations', function (racine) {
    racine.appendChild(entete('Évaluations et notes', 'Neuf évaluations par an. Une note ≥ 10 vaut maîtrise.',
      EG.peutEcrire() ? [el('button', { class: 'btn btn-primaire', text: 'Nouvelle évaluation', onclick: () => editer('evaluations', null, () => Routeur.aller('evaluations')) })] : null));
    const filtres = el('div', { class: 'barre-filtres' });
    const zone = el('div');
    racine.appendChild(filtres); racine.appendChild(zone);
    if (EG.EducMasterModeles) { const d = el('details', { class: 'educmaster-plie' }, [el('summary', { text: '\uE030 Notes au format EDUCMaster : exporter / importer' })]); d.addEventListener('toggle', () => { if (d.open && d.children.length === 1) d.appendChild(EG.EducMasterModeles.bloc()); }); racine.appendChild(d); }

    let evalId = '';
    charger('evaluations', { annee_scolaire_id: anneeCourante() }).then(evals => {
      const tri = evals.sort((a, b) => (a.niveau + a.numero).localeCompare(b.niveau + b.numero));
      if (!tri.length) { zone.appendChild(U.vide('Aucune évaluation n’est ouverte. Créez la première.')); return; }
      evalId = tri[0].id;
      filtres.appendChild(U.selecteur('Évaluation', tri.map(e => ({
        value: e.id, label: e.niveau + ' — évaluation ' + e.numero + ' (' + U.libelle(e.statut) + ')'
      })), evalId, v => { evalId = v; dessiner(); }, { vide: false }));
      dessiner();
    });

    function dessiner() {
      zone.textContent = '';
      Promise.all([
        DB.get('evaluations', evalId), DB.all('matieres'),
        DB.where('niveau_matieres', { annee_scolaire_id: anneeCourante() }),
        DB.where('notes', { evaluation_id: evalId })
      ]).then(([ev, matieres, nm, notes]) => {
        return inscriptionsEnrichies({ niveau: ev.niveau }).then(ins => {
          const prog = nm.filter(x => x.niveau === ev.niveau);
          const im = indexer(matieres);
          const cols = (prog.length ? prog.map(p => ({ matiere: im[p.matiere_id], coefficient: p.coefficient }))
            : matieres.filter(m => m.cycle === 'PRIMAIRE').map(m => ({ matiere: m, coefficient: 1 })))
            .filter(c => c.matiere)
            .sort((a, b) => (a.matiere.ordre || 0) - (b.matiere.ordre || 0));

          const cle = (i, m) => i + '|' + m;
          const parCle = {};
          notes.forEach(n => { parCle[cle(n.inscription_id, n.matiere_id)] = n; });
          const verrouille = ev.statut === 'VERROUILLEE';

          zone.appendChild(el('div', { class: 'ligne-entre' }, [
            el('h3', { text: ev.niveau + ' — évaluation ' + ev.numero + (ev.libelle ? ' · ' + ev.libelle : '') }),
            U.statut(ev.statut)
          ]));

          if (!ins.length) { zone.appendChild(U.vide('Aucun élève inscrit à ce niveau.')); return; }

          const table = el('table', { class: 'tableau grille-notes' });
          table.appendChild(el('thead', {}, el('tr', {}, [el('th', { text: 'Élève', class: 'colle' })]
            .concat(cols.map(c => el('th', { text: c.matiere.code, title: c.matiere.nom })))
            .concat([el('th', { text: 'Moy.' }), el('th', { text: 'Maîtrises' })]))));
          const tbody = el('tbody');
          const champs = {};

          ins.forEach(i => {
            const tr = el('tr');
            tr.appendChild(el('th', { class: 'colle', text: i._nom }));
            const cellMoy = el('td', { class: 'cel-calc' });
            const cellMai = el('td', { class: 'cel-calc' });
            const recalcule = () => {
              const lignes = cols.map(c => ({
                note: champs[cle(i.id, c.matiere.id)].value === '' ? null : Number(champs[cle(i.id, c.matiere.id)].value),
                coefficient: c.coefficient
              }));
              const moy = R.moyenne(lignes);
              const m = R.maitrises(lignes);
              cellMoy.textContent = moy === null ? '—' : moy.toFixed(2);
              cellMoy.className = 'cel-calc ' + (moy !== null && moy < 10 ? 'sous-seuil' : '');
              cellMai.textContent = m.maitrisees + '/' + m.notees;
            };
            cols.forEach(c => {
              const n = parCle[cle(i.id, c.matiere.id)];
              const inp = el('input', {
                type: 'number', min: 0, max: 20, step: '0.25', class: 'cel-note',
                'aria-label': i._nom + ' — ' + c.matiere.nom,
                value: n && typeof n.note === 'number' ? n.note : ''
              });
              if (verrouille) inp.disabled = true;
              inp.addEventListener('input', recalcule);
              champs[cle(i.id, c.matiere.id)] = inp;
              tr.appendChild(el('td', {}, inp));
            });
            tr.appendChild(cellMoy); tr.appendChild(cellMai);
            tbody.appendChild(tr);
            setTimeout(recalcule, 0);
          });
          table.appendChild(tbody);
          zone.appendChild(el('div', { class: 'tableau-enveloppe defilant' }, table));

          const actions = [];
          if (!verrouille && EG.peutEcrire()) {
            actions.push(el('button', {
              class: 'btn btn-primaire', text: 'Enregistrer les notes', onclick: () => {
                const lignes = [];
                ins.forEach(i => cols.forEach(c => {
                  const v = champs[cle(i.id, c.matiere.id)].value;
                  if (v === '') return;
                  const n = Number(v);
                  if (n < 0 || n > 20) return;
                  lignes.push(Object.assign(parCle[cle(i.id, c.matiere.id)] || {}, {
                    evaluation_id: ev.id, inscription_id: i.id, matiere_id: c.matiere.id, note: n, statut_special: null
                  }));
                }));
                DB.putBatch('notes', lignes)
                  .then(() => DB.audit('SAISIE_NOTES', 'evaluations', ev.id, { notes: lignes.length }))
                  .then(() => { U.toast(lignes.length + ' note(s) enregistrée(s)'); EG.majSynchro(); dessiner(); });
              }
            }));
            actions.push(el('button', {
              class: 'btn btn-fantome', text: ev.statut === 'VALIDEE' ? 'Verrouiller l’évaluation' : 'Valider l’évaluation',
              onclick: () => {
                const suivant = ev.statut === 'VALIDEE' ? 'VERROUILLEE' : 'VALIDEE';
                DB.put('evaluations', Object.assign({}, ev, { statut: suivant }))
                  .then(() => DB.audit('STATUT_EVALUATION', 'evaluations', ev.id, { statut: suivant }))
                  .then(() => { U.toast('Évaluation ' + U.libelle(suivant).toLowerCase()); dessiner(); EG.majSynchro(); });
              }
            }));
          }
          /* Résultats de l'évaluation au format SCOLARIS / GESCOL : notes, moyenne, maîtrises, rang, puis réussite par matière
             et par sexe ; signatures, cachet et QR de vérification. */
          actions.push(el('button', { class: 'btn btn-fantome', text: '\uE008 Résultats (signés, avec QR)', onclick: () => {
            const D = EG.DocsSco;
            const res = ins.map(i => {
              const ls = cols.map(c => { const v = champs[cle(i.id, c.matiere.id)].value; return { note: v === '' ? null : Number(v), coefficient: c.coefficient }; });
              return { i, ls, moy: R.moyenne(ls), m: R.maitrises(ls), f: i._eleve && i._eleve.sexe === 'F' };
            });
            const classes = res.filter(x => x.moy !== null).map(x => x.moy).sort((a, b) => b - a);
            const rang = v => v === null ? '—' : (classes.indexOf(v) + 1) + (classes.indexOf(v) === 0 ? 'er' : 'e');
            const lignes = res.map((x, k) => [k + 1, { t: x.i._nom, g: true }, x.f ? 'F' : 'M'].concat(x.ls.map(l => l.note === null ? '—' : l.note),
              [x.moy === null ? '—' : x.moy.toFixed(2), x.m.maitrisees + '/' + x.m.notees, rang(x.moy)]));
            const parMat = cols.map((c, j) => {
              const not = res.filter(x => x.ls[j].note !== null), ok = not.filter(x => x.ls[j].note >= 10);
              const sx = f => { const a = not.filter(x => x.f === f), b = a.filter(x => x.ls[j].note >= 10); return a.length ? Math.round(b.length / a.length * 100) + ' %' : '—'; };
              return [{ t: c.matiere.nom, g: true }, not.length, ok.length, not.length ? Math.round(ok.length / not.length * 100) + ' %' : '—', sx(false), sx(true)];
            });
            const comp = res.filter(x => x.moy !== null), reu = comp.filter(x => x.moy >= 10);
            parMat.push({ tot: true, cells: [{ t: 'Moyenne générale ≥ 10', g: true }, comp.length, reu.length, comp.length ? Math.round(reu.length / comp.length * 100) + ' %' : '—',
              (() => { const a = comp.filter(x => !x.f); return a.length ? Math.round(a.filter(x => x.moy >= 10).length / a.length * 100) + ' %' : '—'; })(),
              (() => { const a = comp.filter(x => x.f); return a.length ? Math.round(a.filter(x => x.moy >= 10).length / a.length * 100) + ' %' : '—'; })()] });
            const html = D.titre('Résultats de l’évaluation ' + (ev.numero || '') + (ev.libelle ? ' — ' + ev.libelle : ''), ev.niveau + ' — ' + U.libelle(ev.type_evaluation || '') + ' — Année scolaire ' + session().annee_code)
              + D.infos([['Cours', ev.niveau], ['Évaluation', (ev.numero || '') + (ev.mois ? ' (' + ev.mois + ')' : '')], ['Statut', U.libelle(ev.statut)],
                ['Élèves', ins.length], ['Ont composé', comp.length], ['Moyenne ≥ 10', reu.length]], 3)
              + D.tableau(['N°', 'Nom et prénoms', 'Sexe'].concat(cols.map(c => c.matiere.code + (c.coefficient && c.coefficient !== 1 ? ' (×' + c.coefficient + ')' : '')), ['Moyenne', 'Maîtrises', 'Rang']), lignes)
              + '<h3 class="sco">Réussite par matière (note ≥ 10)</h3>' + D.tableau(['Matière', 'Ont composé', 'Ont réussi', '% de réussite', '% garçons', '% filles'], parMat)
              + '<p class="note-sco">' + cols.map(c => c.matiere.code + ' : ' + c.matiere.nom).join(' · ') + '. Une note ≥ 10 vaut maîtrise.</p>';
            EG.genererDocument('RESULTATS_EVAL', 'Résultats — ' + ev.niveau + ' — évaluation ' + (ev.numero || ''), html, { classe_id: ev.classe_id || null, ecole_id: ev.ecole_id || null, paysage: true });
          } }));
          actions.push(el('button', { class: 'btn btn-fantome', text: 'Bulletins et décisions', onclick: () => Routeur.aller('bulletins?niveau=' + ev.niveau) }));
          actions.push(el('button', { class: 'btn btn-fantome', text: 'Panneau de synthèse', onclick: () => Routeur.aller('synthese-evaluations') }));
          zone.appendChild(el('div', { class: 'barre-actions' }, actions));

          /* --- Échange avec Excel --- */
          const nomFichier = 'notes-' + ev.niveau + '-eval' + ev.numero;
          const enTete = ['Identifiant', 'Élève'].concat(cols.map(c => c.matiere.code));
          const compte = el('p', { class: 'muet petit' });

          function exporter() {
            const lignes = [enTete].concat(ins.map(i => [i.id, i._nom].concat(cols.map(c => {
              const v = champs[cle(i.id, c.matiere.id)].value;
              return v === '' ? '' : Number(v);
            }))));
            const legende = [['Matière', 'Code', 'Coefficient']]
              .concat(cols.map(c => [c.matiere.nom, c.matiere.code, c.coefficient]));
            const blob = EG.Tableur.construire([
              { nom: 'Notes', lignes: lignes },
              { nom: 'Matières', lignes: legende }
            ]);
            const a = el('a', { href: URL.createObjectURL(blob), download: nomFichier + '.xlsx' });
            document.body.appendChild(a); a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
            U.toast('Classeur « ' + nomFichier + '.xlsx » téléchargé');
          }

          function importer(fichier) {
            EG.Tableur.lire(fichier).then(lignes => {
              if (!lignes.length) { U.toast('Fichier vide', 'attention'); return; }
              const tete = (lignes[0] || []).map(x => String(x || '').trim());
              const colId = tete.findIndex(t => /identifiant/i.test(t));
              const colNom = tete.findIndex(t => /él[eè]ve|nom/i.test(t));
              const colonnesMatiere = {};
              cols.forEach(c => {
                const k = tete.findIndex(t => t.toUpperCase() === c.matiere.code.toUpperCase());
                if (k >= 0) colonnesMatiere[c.matiere.id] = k;
              });
              if (!Object.keys(colonnesMatiere).length) {
                U.toast('Aucune colonne de matière reconnue. Partez du modèle téléchargé.', 'danger');
                return;
              }
              const parId = {}; ins.forEach(i => { parId[i.id] = i; });
              const parNom = {}; ins.forEach(i => { parNom[U.sansAccent(i._nom)] = i; });

              let remplies = 0, ignorees = 0, horsBornes = 0;
              lignes.slice(1).forEach(ligne => {
                if (!ligne || !ligne.length) return;
                const eleve = (colId >= 0 && parId[String(ligne[colId] || '').trim()])
                  || (colNom >= 0 && parNom[U.sansAccent(String(ligne[colNom] || '').trim())]);
                if (!eleve) { if (ligne.some(c => String(c || '').trim())) ignorees++; return; }
                Object.keys(colonnesMatiere).forEach(mid => {
                  const brut = String(ligne[colonnesMatiere[mid]] === undefined ? '' : ligne[colonnesMatiere[mid]]).trim();
                  if (brut === '') return;
                  const n = Number(brut.replace(',', '.'));
                  if (isNaN(n)) { horsBornes++; return; }
                  if (n < 0 || n > 20) { horsBornes++; return; }
                  champs[cle(eleve.id, mid)].value = n;
                  champs[cle(eleve.id, mid)].dispatchEvent(new Event('input'));
                  remplies++;
                });
              });
              compte.textContent = remplies + ' note(s) reprises du classeur'
                + (ignorees ? ' · ' + ignorees + ' ligne(s) sans correspondance' : '')
                + (horsBornes ? ' · ' + horsBornes + ' valeur(s) refusées (hors 0–20)' : '')
                + '. Vérifiez la grille, puis enregistrez.';
              U.toast(remplies + ' note(s) importée(s) — à vérifier avant enregistrement');
            }).catch(e => U.toast('Lecture impossible : ' + e.message, 'danger'));
          }

          const fichier = el('input', { type: 'file', accept: '.xlsx,.csv', class: 'invisible', id: 'import-notes' });
          fichier.addEventListener('change', () => {
            if (fichier.files[0]) importer(fichier.files[0]);
            fichier.value = '';
          });

          const echanges = [
            el('button', { class: 'btn btn-fantome', text: 'Télécharger en Excel', onclick: exporter })
          ];
          if (!verrouille && EG.peutEcrire()) {
            echanges.push(el('button', {
              class: 'btn btn-fantome', text: 'Importer depuis Excel', onclick: () => fichier.click()
            }));
          }
          zone.appendChild(U.carte('Échange avec Excel', el('div', {}, [
            el('p', { class: 'muet', text: 'Le classeur reprend une colonne par matière et l’identifiant de chaque élève. Modifiez-le hors ligne, puis réimportez-le : les notes se placent dans la grille, où vous les vérifiez avant d’enregistrer.' }),
            el('div', { class: 'module-liens' }, echanges),
            fichier, compte
          ])));
        });
      });
    }
  });

  /* =======================================================================
     Bulletins et décisions de fin d'année
     ======================================================================= */

  Routeur.definir('bulletins', function (racine, args, params) {
    const niveau = params.niveau || 'CM2';
    racine.appendChild(entete('Bulletins et décisions', 'Niveau ' + niveau + ' • règles ' + R.VERSION_REGLES));
    racine.appendChild(el('div', { class: 'barre-filtres' }, U.selecteur('Cours', EG.NIVEAUX_PRIM.map(n => ({ value: n, label: n })), niveau,
      v => Routeur.aller('bulletins?niveau=' + (v || 'CM2')), { vide: false })));
    const zone = el('div');
    racine.appendChild(zone);

    Promise.all([
      inscriptionsEnrichies({ niveau, statuts: ['ACTIF', 'SORTIE_PRIMAIRE_CEP'] }),
      DB.where('evaluations', { annee_scolaire_id: anneeCourante(), niveau }),
      DB.all('notes'), DB.all('matieres'),
      DB.where('niveau_matieres', { annee_scolaire_id: anneeCourante() }),
      DB.all('resultats_cep'), DB.all('decisions_annuelles')
    ]).then(([ins, evals, notes, matieres, nm, ceps, decisions]) => {
      const idsEval = {}; evals.forEach(e => { idsEval[e.id] = true; });
      const prog = {}; nm.filter(x => x.niveau === niveau).forEach(p => { prog[p.matiere_id] = p.coefficient; });
      const im = indexer(matieres);
      const cepParIns = {}; ceps.forEach(c => { cepParIns[c.inscription_id] = c; });
      const decParIns = {}; decisions.forEach(d => { decParIns[d.inscription_id] = d; });

      const parEleve = {};
      notes.filter(n => idsEval[n.evaluation_id]).forEach(n => {
        parEleve[n.inscription_id] = parEleve[n.inscription_id] || {};
        const m = parEleve[n.inscription_id];
        m[n.matiere_id] = m[n.matiere_id] || { total: 0, n: 0 };
        if (typeof n.note === 'number') { m[n.matiere_id].total += n.note; m[n.matiere_id].n++; }
      });

      const lignes = ins.map(i => {
        const parMat = parEleve[i.id] || {};
        const detail = Object.keys(parMat).map(mid => ({
          matiere: im[mid] ? im[mid].nom : mid,
          note: parMat[mid].n ? Math.round(parMat[mid].total / parMat[mid].n * 100) / 100 : null,
          coefficient: prog[mid] || 1
        }));
        const moy = R.moyenne(detail);
        const mai = R.maitrises(detail);
        const cep = cepParIns[i.id];
        const d = R.decision({
          niveau, moyenne: moy, maitrisees: mai.maitrisees, notees: mai.notees,
          cep: cep ? { statut: cep.statut, admis: cep.admis } : null
        });
        return { ins: i, detail, moyenne: moy, mai, decision: d, enregistree: decParIns[i.id] };
      }).sort((a, b) => (b.moyenne || 0) - (a.moyenne || 0));

      lignes.forEach((l, k) => { l.rang = l.moyenne === null ? null : k + 1; });

      zone.appendChild(U.tableau([
        { titre: 'Rang', valeur: l => l.rang || '—' },
        { titre: 'Élève', valeur: l => l.ins._nom },
        { titre: 'Moyenne', valeur: l => l.moyenne === null ? '—' : l.moyenne.toFixed(2) },
        { titre: 'Mention', valeur: l => R.mention(l.moyenne) },
        { titre: 'Maîtrises', valeur: l => l.mai.maitrisees + '/' + l.mai.notees },
        { titre: 'Décision proposée', valeur: l => U.statut(l.decision.decision) },
        { titre: 'Motif', valeur: l => l.decision.motif }
      ], lignes, { onLigne: l => bulletin(l, niveau) }));

      if (EG.peutEcrire()) {
        zone.appendChild(el('div', { class: 'barre-actions' }, [
          el('button', {
            class: 'btn btn-primaire', text: 'Enregistrer les décisions', onclick: () => {
              const rows = lignes.filter(l => l.decision.decision).map(l => Object.assign(l.enregistree || {}, {
                inscription_id: l.ins.id,
                decision_pedagogique: l.decision.decision,
                decision_finale: l.decision.decision,
                motif: l.decision.motif,
                force_par_cep: l.decision.force_par_cep,
                regle_version: l.decision.regle_version,
                statut: 'A_CONFIRMER'
              }));
              DB.putBatch('decisions_annuelles', rows)
                .then(() => DB.audit('DECISIONS_CALCULEES', 'decisions_annuelles', null, { niveau, nombre: rows.length }))
                .then(() => { U.toast(rows.length + ' décision(s) enregistrée(s)'); EG.majSynchro(); });
            }
          })
        ]));
      }
    });

    function bulletin(l, niveau) {
      const corps = el('div');
      corps.appendChild(el('p', { class: 'muet', text: niveau + ' • ' + session().ecole_nom + ' • année ' + session().annee_code }));
      corps.appendChild(U.tableau([
        { titre: 'Matière', valeur: d => d.matiere },
        { titre: 'Coef.', valeur: d => d.coefficient },
        { titre: 'Moyenne', valeur: d => d.note === null ? '—' : d.note.toFixed(2) },
        { titre: 'Maîtrise', valeur: d => R.estMaitrise(d.note) ? 'Oui' : 'Non' },
        { titre: 'Perfectionnement', valeur: d => R.perfectionnement(d.note) ? '+' + R.perfectionnement(d.note) + ' pt' : '—' }
      ], l.detail));
      corps.appendChild(el('p', {}, [
        el('strong', { text: 'Moyenne générale : ' }),
        document.createTextNode((l.moyenne === null ? '—' : l.moyenne.toFixed(2)) + '/20 · ' + R.mention(l.moyenne) + ' · rang ' + (l.rang || '—'))
      ]));
      corps.appendChild(el('p', {}, [el('strong', { text: 'Décision : ' }), U.statut(l.decision.decision), document.createTextNode(' — ' + l.decision.motif)]));
      U.modal('Bulletin — ' + l.ins._nom, corps, fermer => [
        el('button', { class: 'btn btn-fantome', text: 'Fermer', onclick: fermer }),
        el('button', {
          class: 'btn btn-primaire', text: 'Générer le bulletin', onclick: () => {
            fermer();
            /* Le bulletin porte les signatures de l'élève et du parent ; celle du titulaire vient avec la classe. */
            DB.get('eleves', l.ins.eleve_id).then(eleve => genererDocument('BULLETIN', 'Bulletin — ' + l.ins._nom, bulletinHTML(l, niveau), {
              classe_id: l.ins.classe_id, ecole_id: l.ins.ecole_id,
              acteurs: eleve ? [{ personne: eleve, mention: 'L’élève' }, { personne: EG.Docs.parentDe(eleve), mention: 'Vu, le parent ou le tuteur' }] : []
            }));
          }
        })
      ]);
    }

    function bulletinHTML(l, niveau) {
      const lignes = l.detail.map(d => '<tr><td>' + d.matiere + '</td><td>' + d.coefficient + '</td><td>'
        + (d.note === null ? '—' : d.note.toFixed(2)) + '</td><td>' + (R.estMaitrise(d.note) ? 'Oui' : 'Non') + '</td></tr>').join('');
      return '<h2>Bulletin de notes</h2>'
        + '<p><strong>' + l.ins._nom + '</strong> — ' + niveau + '<br>' + session().ecole_nom + ' — année ' + session().annee_code + '</p>'
        + '<table><thead><tr><th>Matière</th><th>Coef.</th><th>Moyenne</th><th>Maîtrise</th></tr></thead><tbody>' + lignes + '</tbody></table>'
        + '<p>Moyenne générale : <strong>' + (l.moyenne === null ? '—' : l.moyenne.toFixed(2)) + '/20</strong> — '
        + R.mention(l.moyenne) + ' — rang ' + (l.rang || '—') + '</p>'
        + '<p>Décision : <strong>' + U.libelle(l.decision.decision) + '</strong> (' + l.decision.motif + ')</p>';
    }
  });

  /* =======================================================================
     CEP — examens blancs et résultats officiels
     ======================================================================= */

  Routeur.definir('cep', function (racine) {
    racine.appendChild(entete('CEP et examens blancs',
      'Six maîtrises sur neuf matières. Un CEP officiel admis vaut sortie du primaire et prime sur la décision pédagogique.',
      [el('button', { class: 'btn btn-fantome', text: 'Examen blanc en centre', onclick: () => Routeur.aller('cep-blanc-centre') }),
       el('button', { class: 'btn btn-primaire', text: 'Fiches d’inscription', onclick: () => EG.editerFichesCEP() })]));
    const zone = el('div');
    racine.appendChild(zone);

    Promise.all([
      inscriptionsEnrichies({ niveau: 'CM2', statuts: ['ACTIF', 'SORTIE_PRIMAIRE_CEP'] }),
      charger('examens_blancs', { annee_scolaire_id: anneeCourante() }),
      DB.all('notes_examens_blancs'), DB.all('matieres'), DB.all('resultats_cep')
    ]).then(([ins, examens, notesEB, matieres, ceps]) => {
      const im = indexer(matieres);
      const cepParIns = {}; ceps.forEach(c => { cepParIns[c.inscription_id] = c; });

      /* Examens blancs */
      const bloc = el('div');
      if (!examens.length) bloc.appendChild(U.vide('Aucun examen blanc n’a été créé.',
        EG.peutEcrire() ? el('button', { class: 'btn btn-primaire', text: 'Créer un examen blanc', onclick: () => editer('examens_blancs', null, () => Routeur.aller('cep')) }) : null));
      examens.forEach(ex => {
        const notes = notesEB.filter(n => n.examen_id === ex.id);
        const parIns = {};
        notes.forEach(n => { (parIns[n.inscription_id] = parIns[n.inscription_id] || []).push({ note: n.note, dispense: n.dispense, matiere: im[n.matiere_id] ? im[n.matiere_id].nom : '' }); });
        const lignes = ins.map(i => ({ ins: i, res: R.examenBlanc(parIns[i.id] || []) }))
          .sort((a, b) => (b.res.moyenne || 0) - (a.res.moyenne || 0));
        const reussis = lignes.filter(l => l.res.reussi).length;
        bloc.appendChild(U.carte('Examen blanc n°' + ex.numero + ' — ' + U.dateCourte(ex.date_examen),
          el('div', {}, [
            grille([
              U.stat(U.nombre(lignes.length), 'Candidats'),
              U.stat(U.nombre(reussis), 'Réussites simulées', reussis / (lignes.length || 1) < 0.5 ? 'attention' : ''),
              U.stat(lignes.length ? Math.round(reussis / lignes.length * 100) + ' %' : '—', 'Taux de réussite simulé')
            ], 'grille-stats'),
            U.tableau([
              { titre: 'Rang', valeur: (l, k) => '' },
              { titre: 'Élève', valeur: l => l.ins._nom },
              { titre: 'Maîtrises', valeur: l => l.res.detail },
              { titre: 'Moyenne', valeur: l => l.res.moyenne === null ? '—' : l.res.moyenne.toFixed(2) },
              { titre: 'Verdict', valeur: l => U.badge(l.res.reussi ? 'Réussi' : 'Échoué', l.res.reussi ? 'ok' : 'danger') }
            ], lignes)
          ])));
      });
      zone.appendChild(bloc);

      /* Résultats officiels */
      const table = el('table', { class: 'tableau' });
      table.appendChild(el('thead', {}, el('tr', {}, ['Élève', 'N° de table', 'Inscrit', 'A composé', 'Admis', 'Statut'].map(t => el('th', { text: t })))));
      const tb = el('tbody');
      const controles = {};
      ins.forEach(i => {
        const c = cepParIns[i.id] || { inscription_id: i.id, statut: 'BROUILLON' };
        const tr = el('tr');
        tr.appendChild(el('th', { text: i._nom }));
        const numero = el('input', { type: 'text', class: 'cel-texte', value: c.numero_table || '', 'aria-label': 'Numéro de table' });
        const inscrit = el('input', { type: 'checkbox', 'aria-label': 'Inscrit' }); inscrit.checked = !!c.inscrit;
        const compose = el('input', { type: 'checkbox', 'aria-label': 'A composé' }); compose.checked = !!c.a_compose;
        const admis = el('select', { 'aria-label': 'Admis' });
        [['', 'En attente'], ['oui', 'Admis'], ['non', 'Non admis']].forEach(([v, t]) => {
          const o = el('option', { value: v, text: t });
          if ((c.admis === true && v === 'oui') || (c.admis === false && v === 'non') || (c.admis === null && v === '')) o.selected = true;
          admis.appendChild(o);
        });
        const st = el('select', { 'aria-label': 'Statut' });
        ['BROUILLON', 'PROVISOIRE', 'OFFICIEL'].forEach(v => {
          const o = el('option', { value: v, text: U.libelle(v) });
          if (c.statut === v) o.selected = true;
          st.appendChild(o);
        });
        if (c.statut === 'OFFICIEL') { [numero, inscrit, compose, admis, st].forEach(x => { x.disabled = true; }); }
        controles[i.id] = { base: c, numero, inscrit, compose, admis, st };
        [numero, inscrit, compose, admis, st].forEach(x => tr.appendChild(el('td', {}, x)));
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      zone.appendChild(U.carte('Résultats du CEP', el('div', {}, [
        el('p', { class: 'muet', text: 'Le passage au statut « officiel » verrouille la ligne et déclenche la sortie du primaire pour les admis.' }),
        el('div', { class: 'tableau-enveloppe defilant' }, table)
      ])));

      if (EG.peutEcrire()) {
        zone.appendChild(el('div', { class: 'barre-actions' }, [
          el('button', {
            class: 'btn btn-primaire', text: 'Enregistrer les résultats', onclick: () => {
              const rows = ins.map(i => {
                const c = controles[i.id];
                const admisVal = c.admis.value === '' ? null : c.admis.value === 'oui';
                return Object.assign({}, c.base, {
                  inscription_id: i.id, numero_table: c.numero.value || null,
                  inscrit: c.inscrit.checked, a_compose: c.compose.checked,
                  admis: admisVal, statut: c.st.value,
                  date_publication: c.st.value === 'OFFICIEL' ? new Date().toISOString().slice(0, 10) : c.base.date_publication || null
                });
              });
              /* Règle prioritaire : un CEP officiel admis vaut sortie du primaire. */
              const sorties = rows.filter(r => r.statut === 'OFFICIEL' && r.admis === true);
              const appliquerSortie = r => DB.get('inscriptions_eleves', r.inscription_id)
                .then(i => i ? DB.put('inscriptions_eleves', Object.assign({}, i, { statut: 'SORTIE_PRIMAIRE_CEP' })) : null)
                .then(() => DB.where('decisions_annuelles', { inscription_id: r.inscription_id }))
                .then(d => DB.put('decisions_annuelles', Object.assign(d[0] || {}, {
                  inscription_id: r.inscription_id,
                  decision_pedagogique: 'SORTIE_PRIMAIRE', decision_finale: 'SORTIE_PRIMAIRE',
                  motif: 'CEP officiel admis', force_par_cep: true,
                  regle_version: R.VERSION_REGLES, statut: 'VALIDEE'
                })));

              DB.putBatch('resultats_cep', rows)
                .then(() => Promise.all(sorties.map(appliquerSortie)))
                .then(() => sorties.length)
                .then(n => {
                DB.audit('RESULTATS_CEP', 'resultats_cep', null, { officiels: n });
                U.toast('Résultats enregistrés — ' + n + ' sortie(s) du primaire appliquée(s)');
                EG.majSynchro(); Routeur.aller('cep');
              });
            }
          })
        ]));
      }
    });
  });

  /* =======================================================================
     Personnel — retraite
     ======================================================================= */

  Routeur.definir('retraite', function (racine) {
    racine.appendChild(entete('Départs à la retraite', 'C1 : 55 ans · B1 : 58 ans · A1, A2, A3 : 60 ans'));
    const filtres = el('div', { class: 'barre-filtres' });
    const zone = el('div');
    racine.appendChild(filtres); racine.appendChild(zone);
    let horizon = '5';

    filtres.appendChild(U.selecteur('Horizon', [
      { value: '1', label: '1 an' }, { value: '3', label: '3 ans' },
      { value: '5', label: '5 ans' }, { value: '10', label: '10 ans' }
    ], horizon, v => { horizon = v; dessiner(); }, { vide: false }));

    function dessiner() {
      zone.textContent = '';
      Promise.all([charger('personnels'), DB.all('regles_retraite'), DB.all('ecoles')]).then(([agents, regles, ecoles]) => {
        const ie = indexer(ecoles);
        const lignes = agents.filter(a => a.actif !== false).map(a => ({
          agent: a, ecole: ie[a.ecole_id] ? ie[a.ecole_id].nom : '—', p: R.previsionRetraite(a, regles)
        })).filter(l => l.p).sort((a, b) => a.p.mois_restants - b.p.mois_restants);

        const limite = Number(horizon) * 12;
        const retenus = lignes.filter(l => l.p.mois_restants <= limite);

        zone.appendChild(grille([
          U.stat(U.nombre(lignes.length), 'Agents suivis'),
          U.stat(U.nombre(lignes.filter(l => l.p.echue).length), 'Âge atteint', lignes.filter(l => l.p.echue).length ? 'attention' : ''),
          U.stat(U.nombre(lignes.filter(l => !l.p.echue && l.p.mois_restants <= 12).length), 'Dans les 12 mois'),
          U.stat(U.nombre(retenus.length), 'Sur ' + horizon + ' an(s)')
        ], 'grille-stats'));

        zone.appendChild(U.tableau([
          { titre: 'Agent', valeur: l => (l.agent.nom || '').toUpperCase() + ' ' + (l.agent.prenoms || '') },
          { titre: 'École', valeur: l => l.ecole },
          { titre: 'Catégorie', valeur: l => (l.agent.categorie || '—') + (l.agent.echelon ? ' · échelon ' + l.agent.echelon : '') },
          { titre: 'Âge', valeur: l => l.p.age_actuel + ' ans' },
          { titre: 'Départ prévu', valeur: l => U.dateCourte(l.p.date_retraite) },
          { titre: 'Échéance', valeur: l => l.p.echue ? U.badge('Âge atteint', 'danger') : (l.p.annees_restantes + ' an(s) ' + l.p.mois_complementaires + ' mois') }
        ], retenus, { messageVide: 'Aucun départ prévu sur cet horizon.' }));

        if (EG.peutEcrire() && retenus.length) {
          zone.appendChild(el('div', { class: 'barre-actions' }, [
            el('button', {
              class: 'btn btn-fantome', text: 'Préparer les notifications', onclick: () => {
                const apercu = retenus.slice(0, 5).map(l => el('li', {
                  text: (l.agent.prenoms || '') + ' ' + l.agent.nom + ' — ' + (l.agent.telephone || 'sans numéro')
                    + ' : « Votre départ à la retraite est prévu le ' + U.dateCourte(l.p.date_retraite) + '. Information indicative. »'
                }));
                U.modal('Aperçu des messages', el('div', {}, [
                  el('p', { text: retenus.length + ' message(s) seront préparés. Ils partiront à la synchronisation.' }),
                  el('ul', { class: 'liste-points' }, apercu)
                ]), fermer => [
                  el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
                  el('button', {
                    class: 'btn btn-primaire', text: 'Créer la campagne', onclick: () => {
                      const rows = retenus.map(l => ({
                        personnel_id: l.agent.id, annee_scolaire_id: anneeCourante(), type_notification: 'ANNUELLE',
                        date_retraite_prevue: l.p.date_retraite, annees_restantes: l.p.annees_restantes,
                        message: 'Votre départ à la retraite est prévu le ' + U.dateCourte(l.p.date_retraite)
                          + '. Rapprochez-vous de votre circonscription pour la constitution du dossier.',
                        statut: 'PLANIFIE'
                      }));
                      DB.putBatch('notifications_retraite', rows)
                        .then(() => DB.audit('CAMPAGNE_RETRAITE', 'notifications_retraite', null, { nombre: rows.length }))
                        .then(() => { fermer(); U.toast(rows.length + ' notification(s) planifiée(s)'); EG.majSynchro(); });
                    }
                  })
                ]);
              }
            }),
            el('button', { class: 'btn btn-fantome', text: 'Voir les notifications', onclick: () => Routeur.aller('entite/notifications_retraite') })
          ]));
        }
      });
    }
    dessiner();
  });

  /* =======================================================================
     Cantine
     ======================================================================= */

  Routeur.definir('cantine', function (racine) {
    racine.appendChild(entete('Cantine scolaire', 'Pointage quotidien des repas servis.',
      [el('button', { class: 'btn btn-fantome', text: 'Contributions et paiements', onclick: () => Routeur.aller('cantine-paiements') })]));
    const filtres = el('div', { class: 'barre-filtres' });
    const zone = el('div');
    racine.appendChild(filtres); racine.appendChild(zone);
    let classeId = '', date = new Date().toISOString().slice(0, 10);

    DB.where('classes', { annee_scolaire_id: anneeCourante() }).then(cls => {
      const dispo = porteeEcole(cls);
      classeId = dispo.length ? dispo[0].id : '';
      filtres.appendChild(U.selecteur('Classe', dispo.map(c => ({ value: c.id, label: c.libelle || c.code })), classeId, v => { classeId = v; dessiner(); }, { vide: false }));
      filtres.appendChild(el('label', { class: 'filtre' }, [
        el('span', { text: 'Date' }),
        el('input', { type: 'date', value: date, onchange: e => { date = e.target.value; dessiner(); } })
      ]));
      dessiner();
    });

    function dessiner() {
      zone.textContent = '';
      if (!classeId) { zone.appendChild(U.vide('Aucune classe disponible.')); return; }
      Promise.all([inscriptionsEnrichies({ classe_id: classeId }), DB.where('participations_cantine', { date_repas: date })])
        .then(([ins, parts]) => {
          const parIns = {}; parts.forEach(p => { parIns[p.inscription_id] = p; });
          const etat = {}; ins.forEach(i => { etat[i.id] = parIns[i.id] ? !!parIns[i.id].a_mange : true; });
          const liste = el('div', { class: 'appel' });
          ins.forEach(i => {
            const chk = el('input', { type: 'checkbox', 'aria-label': 'Repas servi à ' + i._nom });
            chk.checked = etat[i.id];
            chk.addEventListener('change', () => { etat[i.id] = chk.checked; });
            liste.appendChild(el('label', { class: 'appel-ligne cliquable' }, [
              el('div', { class: 'appel-nom' }, [el('strong', { text: i._nom }), el('span', { class: 'muet petit', text: i.niveau })]),
              chk
            ]));
          });
          zone.appendChild(el('h3', { text: 'Repas du ' + U.dateFR(date) }));
          zone.appendChild(liste);
          if (EG.peutEcrire()) zone.appendChild(el('div', { class: 'barre-actions' }, [
            el('button', {
              class: 'btn btn-primaire', text: 'Enregistrer le pointage', onclick: () => {
                const rows = ins.map(i => Object.assign(parIns[i.id] || {}, { inscription_id: i.id, date_repas: date, a_mange: etat[i.id] }));
                DB.putBatch('participations_cantine', rows).then(() => { U.toast('Pointage enregistré'); EG.majSynchro(); });
              }
            })
          ]));

          DB.all('participations_cantine').then(all => {
            const idsIns = indexer(ins);
            const mois = all.filter(p => idsIns[p.inscription_id] && p.date_repas.slice(0, 7) === date.slice(0, 7));
            if (!mois.length) return;
            const servis = mois.filter(p => p.a_mange).length;
            zone.appendChild(U.carte('Bilan du mois', grille([
              U.stat(U.nombre(servis), 'Repas servis'),
              U.stat(Math.round(servis / mois.length * 100) + ' %', 'Taux de fréquentation')
            ], 'grille-stats')));
          });
        });
    }
  });

  /* =======================================================================
     Budget
     ======================================================================= */

  Routeur.definir('budget', function (racine) {
    racine.appendChild(entete('Budget de l’école', 'Quatre composantes de ressources, exécution suivie pièce par pièce.'));
    const zone = el('div');
    racine.appendChild(zone);

    charger('budgets_ecoles', { annee_scolaire_id: anneeCourante() }).then(budgets => {
      const b = budgets[0];
      if (!b) {
        zone.appendChild(U.vide('Aucun budget saisi pour cette année.',
          EG.peutEcrire() ? el('button', { class: 'btn btn-primaire', text: 'Créer le budget', onclick: () => editer('budgets_ecoles', null, () => Routeur.aller('budget')) }) : null));
        return;
      }
      DB.where('mouvements_budget', { budget_id: b.id }).then(mvts => {
        const ressources = (b.solde_exercice_anterieur || 0) + (b.subvention_etat || 0) + (b.cotisation_parents || 0) + (b.autres_ressources || 0);
        const depenses = mvts.filter(m => m.type === 'DEPENSE').reduce((s, m) => s + (m.montant || 0), 0);
        const encaisse = mvts.filter(m => m.type !== 'DEPENSE' && m.type !== 'AJUSTEMENT').reduce((s, m) => s + (m.montant || 0), 0);
        const taux = ressources ? Math.round(depenses / ressources * 100) : 0;

        zone.appendChild(grille([
          U.stat(U.fcfa(ressources), 'Ressources prévues'),
          U.stat(U.fcfa(encaisse), 'Ressources encaissées'),
          U.stat(U.fcfa(depenses), 'Dépenses engagées'),
          U.stat(U.fcfa(ressources - depenses), 'Solde disponible', ressources - depenses < 0 ? 'attention' : '')
        ], 'grille-stats'));

        zone.appendChild(U.carte('Exécution', el('div', {}, [
          U.barre(taux, taux > 90 ? 'attention' : ''),
          el('p', { class: 'muet', text: taux + ' % des ressources prévues sont consommées.' })
        ])));

        zone.appendChild(U.carte('Composantes', U.tableau([
          { titre: 'Poste', valeur: r => r.l },
          { titre: 'Montant', valeur: r => U.fcfa(r.v) }
        ], [
          { l: 'Solde de l’exercice antérieur', v: b.solde_exercice_anterieur },
          { l: 'Subvention de l’État', v: b.subvention_etat },
          { l: 'Cotisations des parents', v: b.cotisation_parents },
          { l: 'Autres ressources', v: b.autres_ressources },
          { l: 'Total', v: ressources }
        ])));

        zone.appendChild(U.carte('Mouvements', U.tableau([
          { titre: 'Date', valeur: m => U.dateCourte(m.date_operation) },
          { titre: 'Type', valeur: m => U.statut(m.type) },
          { titre: 'Libellé', valeur: m => m.libelle },
          { titre: 'Montant', valeur: m => U.fcfa(m.montant) }
        ], mvts.sort((x, y) => String(y.date_operation).localeCompare(String(x.date_operation))),
          { messageVide: 'Aucun mouvement enregistré.' })));

        const actions = [];
        if (EG.peutEcrire()) {
          actions.push(el('button', { class: 'btn btn-fantome', text: 'Ajouter un mouvement', onclick: () => editer('mouvements_budget', { budget_id: b.id }, () => Routeur.aller('budget')) }));
          if (b.statut !== 'VERROUILLE') actions.push(el('button', {
            class: 'btn btn-primaire', text: b.statut === 'VALIDE' ? 'Verrouiller' : (b.statut === 'SOUMIS' ? 'Valider' : 'Soumettre'),
            onclick: () => {
              const suivant = b.statut === 'VALIDE' ? 'VERROUILLE' : (b.statut === 'SOUMIS' ? 'VALIDE' : 'SOUMIS');
              DB.put('budgets_ecoles', Object.assign({}, b, { statut: suivant }))
                .then(() => DB.audit('STATUT_BUDGET', 'budgets_ecoles', b.id, { statut: suivant }))
                .then(() => { U.toast('Budget ' + U.libelle(suivant).toLowerCase()); Routeur.aller('budget'); EG.majSynchro(); });
            }
          }));
        }
        actions.push(el('button', { class: 'btn btn-fantome', text: 'Éditer l’état budgétaire', onclick: () => {
          genererDocument('ETAT_BUDGET', 'État budgétaire ' + session().annee_code,
            '<h2>État d’exécution budgétaire</h2><p>' + session().ecole_nom + ' — ' + session().annee_code + '</p>'
            + '<table><tbody><tr><td>Ressources prévues</td><td>' + U.fcfa(ressources) + '</td></tr>'
            + '<tr><td>Ressources encaissées</td><td>' + U.fcfa(encaisse) + '</td></tr>'
            + '<tr><td>Dépenses</td><td>' + U.fcfa(depenses) + '</td></tr>'
            + '<tr><td>Solde</td><td>' + U.fcfa(ressources - depenses) + '</td></tr></tbody></table>');
        } }));
        zone.appendChild(el('div', { class: 'barre-actions' }, actions.concat([U.statut(b.statut)])));
      });
    });
  });

  /* =======================================================================
     Recensement annuel — pré-remplissage automatique
     ======================================================================= */

  const RUBRIQUES = [
    { code: 'EFFECTIFS', nom: 'Effectifs', champs: [
      { c: 'eleves_total', l: 'Élèves inscrits', auto: 'eleves_total' },
      { c: 'eleves_filles', l: 'Dont filles', auto: 'eleves_filles' },
      { c: 'redoublants', l: 'Redoublants', auto: 'redoublants' },
      { c: 'handicap', l: 'Élèves en situation de handicap', auto: 'handicap' },
      { c: 'classes_simples', l: 'Classes simples', auto: 'classes_simples' },
      { c: 'classes_jumelees', l: 'Classes jumelées (2 cours, une salle, un maître)', auto: 'classes_jumelees' },
      { c: 'classes_multigrades', l: 'Classes multigrades (3 cours et plus)', auto: 'classes_multigrades' },
      { c: 'classes_ouvertes', l: 'Classes ouvertes (simples + jumelées + multigrades ; jumelées et multigrades comptées une fois)', auto: 'classes' },
      { c: 'classes_autorisees', l: 'Classes autorisées', auto: 'classes_autorisees' }
    ] },
    { code: 'PERSONNEL', nom: 'Personnel', champs: [
      { c: 'personnel_total', l: 'Personnel en poste', auto: 'personnel' },
      { c: 'personnel_femmes', l: 'Dont femmes', auto: 'personnel_femmes' },
      { c: 'ratio_eleves_maitre', l: 'Ratio élèves-maître', auto: 'ratio' }
    ] },
    { code: 'PATRIMOINE', nom: 'Patrimoine', champs: [
      { c: 'salles_classe', l: 'Salles de classe', auto: 'salles' },
      { c: 'salles_bon_etat', l: 'Salles en bon état', auto: 'salles_bon' },
      { c: 'places_assises', l: 'Places assises disponibles', auto: 'places' },
      { c: 'deficit_places', l: 'Déficit de places', auto: 'deficit' }
    ] },
    { code: 'SERVICES', nom: 'Services', champs: [
      { c: 'eau_potable', l: 'Eau potable', auto: 'eau' },
      { c: 'electricite', l: 'Électricité', auto: 'electricite' },
      { c: 'cantine', l: 'Cantine fonctionnelle', auto: 'cantine' },
      { c: 'latrines_cabines', l: 'Cabines de latrines', auto: 'latrines' }
    ] },
    { code: 'GOUVERNANCE', nom: 'Gouvernance', champs: [
      { c: 'ape_fonctionnelle', l: 'APE fonctionnelle', auto: 'ape' },
      { c: 'reunions_ape', l: 'Réunions de l’APE', auto: 'reunions' }
    ] },
    { code: 'FINANCES', nom: 'Finances', champs: [
      { c: 'ressources_totales', l: 'Ressources totales (F CFA)', auto: 'ressources' },
      { c: 'depenses_totales', l: 'Dépenses exécutées (F CFA)', auto: 'depenses' }
    ] }
  ];

  Routeur.definir('recensement', function (racine) {
    racine.appendChild(entete('Recensement annuel',
      'Les données déjà saisies dans l’application sont pré-remplies : il ne reste qu’à confirmer ou corriger.'));
    const zone = el('div');
    racine.appendChild(zone);

    Promise.all([charger('recensements_ecoles'), DB.all('campagnes_recensement'), DB.all('ecoles')])
      .then(([recs, camps, ecoles]) => {
        const ic = indexer(camps), ie = indexer(ecoles);
        if (!recs.length) { zone.appendChild(U.vide('Aucune fiche de recensement ne vous est affectée.')); return; }
        zone.appendChild(U.tableau([
          { titre: 'École', valeur: r => ie[r.ecole_id] ? ie[r.ecole_id].nom : '—' },
          { titre: 'Campagne', valeur: r => ic[r.campagne_id] ? (ic[r.campagne_id].type + ' ' + (ic[r.campagne_id].version_formulaire || '')) : '—' },
          { titre: 'Complétion', valeur: r => U.barre(r.taux_completion || 0) },
          { titre: 'Statut', valeur: r => U.statut(r.statut) }
        ], recs, { onLigne: r => ouvrir(r) }));
      });

    function ouvrir(rec) {
      Routeur.aller('recensement-fiche/' + rec.id);
    }
  });

  Routeur.definir('recensement-fiche', function (racine, args) {
    const id = args[0];
    const tete = el('div');
    const zone = el('div');
    racine.appendChild(tete); racine.appendChild(zone);

    DB.get('recensements_ecoles', id).then(rec => {
      if (!rec) { zone.appendChild(U.vide('Fiche introuvable.')); return; }
      return Promise.all([
        DB.where('recensement_valeurs', { recensement_id: id }),
        calculerAuto(rec.ecole_id),
        DB.get('ecoles', rec.ecole_id)
      ]).then(([valeurs, auto, ecole]) => {
        tete.appendChild(entete('Recensement — ' + (ecole ? ecole.nom : ''),
          'Statut : ' + U.libelle(rec.statut), [
            el('button', { class: 'btn btn-fantome', text: 'Retour', onclick: () => Routeur.aller('recensement') })
          ]));

        const parChamp = {};
        valeurs.forEach(v => { parChamp[v.rubrique + '.' + v.champ] = v; });
        const controles = {};
        const verrouille = ['VALIDE', 'VERROUILLE', 'SOUMIS'].indexOf(rec.statut) >= 0;

        RUBRIQUES.forEach(rub => {
          const table = el('table', { class: 'tableau' });
          table.appendChild(el('thead', {}, el('tr', {}, ['Donnée', 'Valeur calculée', 'Valeur retenue', 'Origine'].map(t => el('th', { text: t })))));
          const tb = el('tbody');
          rub.champs.forEach(ch => {
            const cle = rub.code + '.' + ch.c;
            const existante = parChamp[cle];
            const valeurAuto = auto[ch.auto];
            const inp = el('input', {
              type: 'text', class: 'cel-texte',
              value: existante ? existante.valeur : (valeurAuto === undefined || valeurAuto === null ? '' : String(valeurAuto)),
              'aria-label': ch.l
            });
            if (verrouille) inp.disabled = true;
            controles[cle] = { inp, rubrique: rub.code, champ: ch.c, auto: valeurAuto, existante };
            tb.appendChild(el('tr', {}, [
              el('th', { text: ch.l }),
              el('td', { text: valeurAuto === undefined || valeurAuto === null ? '—' : String(valeurAuto) }),
              el('td', {}, inp),
              el('td', {}, U.badge(existante ? U.libelle(existante.origine) : 'Automatique', existante && existante.origine === 'SAISIE' ? 'info' : 'ok'))
            ]));
          });
          table.appendChild(tb);
          zone.appendChild(U.carte(rub.nom, el('div', { class: 'tableau-enveloppe' }, table)));
        });

        /* Contrôles de cohérence */
        const controlesCoherence = el('div');
        zone.appendChild(U.carte('Contrôles de cohérence', controlesCoherence));
        function verifier() {
          controlesCoherence.textContent = '';
          const lire = c => {
            const v = controles[c] ? controles[c].inp.value : '';
            const n = Number(v);
            return isNaN(n) ? null : n;
          };
          const anomalies = [];
          const tot = lire('EFFECTIFS.eleves_total'), fil = lire('EFFECTIFS.eleves_filles');
          if (tot !== null && fil !== null && fil > tot) anomalies.push('Le nombre de filles dépasse l’effectif total.');
          const salles = lire('PATRIMOINE.salles_classe'), bonnes = lire('PATRIMOINE.salles_bon_etat');
          if (salles !== null && bonnes !== null && bonnes > salles) anomalies.push('Les salles en bon état dépassent le nombre de salles.');
          const pers = lire('PERSONNEL.personnel_total'), femmes = lire('PERSONNEL.personnel_femmes');
          if (pers !== null && femmes !== null && femmes > pers) anomalies.push('Le nombre de femmes dépasse l’effectif du personnel.');
          const res = lire('FINANCES.ressources_totales'), dep = lire('FINANCES.depenses_totales');
          if (res !== null && dep !== null && dep > res) anomalies.push('Les dépenses dépassent les ressources déclarées.');
          if (!anomalies.length) controlesCoherence.appendChild(el('p', { class: 'ok-texte', text: 'Aucune incohérence détectée.' }));
          else controlesCoherence.appendChild(el('ul', { class: 'liste-points alerte' }, anomalies.map(a => el('li', { text: a }))));
          return anomalies.length === 0;
        }
        Object.keys(controles).forEach(k => controles[k].inp.addEventListener('input', verifier));
        verifier();

        /* Fiche remplie : PDF (téléchargement direct) et Excel, avec les valeurs affichées (retenues ou proposées) et leur origine */
        const nomFiche = 'recensement-' + EG.Sortie.slug((ecole ? ecole.nom : 'ecole') + '-' + (EG.session.annee_code || ''));
        const lignesFiche = () => {
          const L = [];
          RUBRIQUES.forEach(rub => rub.champs.forEach(ch => {
            const c = controles[rub.code + '.' + ch.c], v = c.inp.value;
            const orig = c.existante && String(c.existante.valeur) === v ? U.libelle(c.existante.origine) : (c.auto !== undefined && c.auto !== null && String(c.auto) === v ? 'Automatique' : 'Saisie');
            L.push([rub.nom, ch.l, c.auto === undefined || c.auto === null ? '' : String(c.auto), v, orig]);
          }));
          return L;
        };
        const ENT = ['Rubrique', 'Donnée', 'Valeur calculée', 'Valeur retenue', 'Origine'];
        const ech = EG.Docs.echapper;
        const fichePdf = () => {
          if (global.DocExport) global.DocExport.prochain('pdf', nomFiche);
          EG.Sortie.imprimer('Fiche de recensement — ' + (ecole ? ecole.nom : ''), () => '<h2>Fiche de recensement annuel — ' + ech(ecole ? ecole.nom : '') + ' — ' + ech(EG.session.annee_code || '') + '</h2>'
            + '<p>Statut : ' + ech(U.libelle(rec.statut)) + ' · éditée le ' + ech(new Date().toLocaleDateString('fr-FR')) + '</p>'
            + '<table><thead><tr>' + ENT.map(t => '<th>' + ech(t) + '</th>').join('') + '</tr></thead><tbody>'
            + lignesFiche().map(l => '<tr>' + l.map(x => '<td>' + ech(x) + '</td>').join('') + '</tr>').join('') + '</tbody></table>'
            + '<p style="font-size:9pt">Classes : une classe jumelée ou multigrade est comptée une fois (une salle, un maître).</p>', { ecole });
        };
        const ficheExcel = () => EG.Sortie.excel(nomFiche, [{ nom: 'Recensement', lignes: [ENT].concat(lignesFiche()) }]);
        zone.appendChild(el('div', { class: 'barre-actions' }, [
          el('button', { class: 'btn btn-fantome', 'data-fiche': 'pdf', text: '\uE00D Télécharger la fiche remplie (PDF)', onclick: fichePdf }),
          el('button', { class: 'btn btn-fantome', 'data-fiche': 'excel', text: '\uE00C Télécharger la fiche remplie (Excel)', onclick: ficheExcel })
        ]));

        if (!verrouille && EG.peutEcrire()) {
          zone.appendChild(el('div', { class: 'barre-actions' }, [
            el('button', {
              class: 'btn btn-fantome', text: 'Confirmer les données pré-remplies', onclick: () => enregistrer('CONFIRMEE', 'A_COMPLETER')
            }),
            el('button', {
              class: 'btn btn-primaire', text: 'Transmettre à la circonscription', onclick: () => {
                if (!verifier()) { U.toast('Corrigez les incohérences avant de transmettre', 'attention'); return; }
                enregistrer('SAISIE', 'SOUMIS');
              }
            })
          ]));
        }

        function enregistrer(origine, statutFiche) {
          const cles = Object.keys(controles);
          const rows = cles.map(k => {
            const c = controles[k];
            return Object.assign(c.existante || {}, {
              recensement_id: id, rubrique: c.rubrique, champ: c.champ, valeur: c.inp.value,
              origine: c.inp.value === String(c.auto === undefined || c.auto === null ? '' : c.auto) ? (origine === 'SAISIE' ? 'CONFIRMEE' : origine) : 'SAISIE',
              source_table: 'calcul automatique'
            });
          });
          const remplis = rows.filter(r => r.valeur !== '' && r.valeur !== null).length;
          DB.putBatch('recensement_valeurs', rows)
            .then(() => DB.put('recensements_ecoles', Object.assign({}, rec, {
              statut: statutFiche, taux_completion: Math.round(remplis / cles.length * 100),
              soumis_at: statutFiche === 'SOUMIS' ? new Date().toISOString() : rec.soumis_at
            })))
            .then(() => DB.audit('RECENSEMENT', 'recensements_ecoles', id, { statut: statutFiche, taux: Math.round(remplis / cles.length * 100) }))
            .then(() => { U.toast(statutFiche === 'SOUMIS' ? 'Fiche transmise' : 'Données confirmées'); EG.majSynchro(); Routeur.aller('recensement'); });
        }
      });
    });
  });

  EG.Recensement = { get RUBRIQUES() { return RUBRIQUES; }, calculerAuto: id => calculerAuto(id) };

  /** Reprend les données déjà saisies dans l'application pour pré-remplir le formulaire. */
  function calculerAuto(ecoleId) {
    return Promise.all([
      DB.where('inscriptions_eleves', { ecole_id: ecoleId, annee_scolaire_id: anneeCourante(), statut: 'ACTIF' }),
      DB.all('eleves'), DB.all('eleve_handicaps'),
      DB.where('classes', { ecole_id: ecoleId, annee_scolaire_id: anneeCourante() }),
      DB.where('personnels', { ecole_id: ecoleId }),
      DB.where('infrastructures', { ecole_id: ecoleId }),
      DB.where('inventaires_mobilier', { ecole_id: ecoleId, annee_scolaire_id: anneeCourante() }),
      DB.where('services_ecole', { ecole_id: ecoleId, annee_scolaire_id: anneeCourante() }),
      DB.where('gestion_participative', { ecole_id: ecoleId, annee_scolaire_id: anneeCourante() }),
      DB.where('budgets_ecoles', { ecole_id: ecoleId, annee_scolaire_id: anneeCourante() }),
      DB.all('mouvements_budget'), DB.where('cantines', { ecole_id: ecoleId }),
      DB.where('statistiques_ecoles', { ecole_id: ecoleId })
    ]).then(([ins, eleves, handicaps, classes, pers, infra, mob, serv, gouv, budgets, mvts, cantines, stats]) => {
      const ie = indexer(eleves);
      const idsEleves = {}; ins.forEach(i => { idsEleves[i.eleve_id] = true; });
      const salles = infra.filter(i => i.type_local === 'SALLE_CLASSE');
      const b = budgets[0];
      const ressources = b ? (b.solde_exercice_anterieur || 0) + (b.subvention_etat || 0) + (b.cotisation_parents || 0) + (b.autres_ressources || 0) : null;
      const depenses = b ? mvts.filter(m => m.budget_id === b.id && m.type === 'DEPENSE').reduce((s, m) => s + (m.montant || 0), 0) : null;
      const places = R.capaciteMobilier(mob);
      const s = serv[0] || {}, g = gouv[0] || {}, c = cantines[0] || {};
      const actifs = pers.filter(p => p.actif !== false);
      /* Sans inscription individuelle, les statistiques déclarées de la circonscription font foi (dernière année). */
      const stat = (stats || []).slice().sort((a, b) => String(b.annee_code).localeCompare(String(a.annee_code)))[0];
      const t = stat && EG.StatsEcoles ? EG.StatsEcoles.totaux(stat) : null;
      const depuisStat = !!(t && !ins.length && t.t);
      const nbEleves = depuisStat ? t.t : ins.length;
      const nbPers = (!actifs.length && t && t.pers) ? t.pers : actifs.length;
      return {
        eleves_total: nbEleves,
        eleves_filles: depuisStat ? t.f : ins.filter(i => ie[i.eleve_id] && ie[i.eleve_id].sexe === 'F').length,
        redoublants: ins.filter(i => i.redoublant).length,
        handicap: handicaps.filter(h => h.actif !== false && idsEleves[h.eleve_id]).length,
        // classes ouvertes : une classe jumelée ou multigrade compte pour une (js/classes-eg.js) ; les autorisées à part
        ...(() => { const x = EG.Classes.ecole({}, classes, stat); return { classes: x.ouvertes || null, classes_simples: x.ouvertes ? x.simples : null, classes_jumelees: x.ouvertes ? x.jumelees : null,
          classes_multigrades: x.ouvertes ? x.multigrades : null, classes_autorisees: x.autorisees }; })(),
        personnel: nbPers,
        personnel_femmes: actifs.filter(p => p.sexe === 'F').length,
        ratio: nbPers ? Math.round(nbEleves / nbPers) : null,
        salles: salles.length,
        salles_bon: salles.filter(x => x.etat_murs === 'BON').length,
        places: places,
        deficit: Math.max(0, nbEleves - places),
        eau: s.eau_potable ? 'Oui' : 'Non',
        electricite: s.electricite ? 'Oui' : 'Non',
        cantine: (c.fonctionnelle || s.cantine) ? 'Oui' : 'Non',
        latrines: s.nb_cabines_latrines || 0,
        ape: g.ape_fonctionnel ? 'Oui' : 'Non',
        reunions: g.nombre_reunions_ape || 0,
        ressources: ressources,
        depenses: depenses
      };
    });
  }

  /* =======================================================================
     Risques et décrochage
     ======================================================================= */

  Routeur.definir('risques', function (racine) {
    racine.appendChild(entete('Risque de décrochage',
      'Score explicable de 0 à 100. Le handicap n’entre jamais dans le calcul : il déclenche un accompagnement, pas une alerte.'));
    const zone = el('div');
    racine.appendChild(zone);

    Promise.all([
      inscriptionsEnrichies(), DB.all('presences'), DB.all('notes'),
      DB.where('evaluations', { annee_scolaire_id: anneeCourante() }), DB.where('modeles_risque', { actif: true })
    ]).then(([ins, pres, notes, evals, modeles]) => {
      const modele = modeles[0];
      const idsEval = {}; evals.forEach(e => { idsEval[e.id] = true; });
      const parIns = {};
      pres.forEach(p => {
        const s = parIns[p.inscription_id] = parIns[p.inscription_id] || { total: 0, abs: 0, retards: 0 };
        s.total++;
        if (p.statut === 'ABSENT') s.abs++;
        if (p.statut === 'RETARD') s.retards++;
      });
      const notesIns = {};
      notes.filter(n => idsEval[n.evaluation_id] && typeof n.note === 'number').forEach(n => {
        const s = notesIns[n.inscription_id] = notesIns[n.inscription_id] || { total: 0, n: 0 };
        s.total += n.note; s.n++;
      });

      const lignes = ins.map(i => {
        const a = parIns[i.id] || { total: 0, abs: 0, retards: 0 };
        const nt = notesIns[i.id];
        const res = R.scoreRisque({
          taux_absence: a.total ? a.abs / a.total : 0,
          moyenne: nt ? Math.round(nt.total / nt.n * 100) / 100 : null,
          redoublant: i.redoublant, retards: a.retards
        }, modele ? modele.configuration : null);
        return { ins: i, res };
      }).sort((a, b) => b.res.score - a.res.score);

      const parNiveauRisque = ['CRITIQUE', 'ELEVE', 'MOYEN', 'FAIBLE'].map(n => ({
        n, c: lignes.filter(l => l.res.niveau === n).length
      }));
      zone.appendChild(grille(parNiveauRisque.map(x => U.stat(U.nombre(x.c), U.libelle(x.n),
        x.n === 'CRITIQUE' || x.n === 'ELEVE' ? 'attention' : '')), 'grille-stats'));

      zone.appendChild(U.tableau([
        { titre: 'Élève', valeur: l => l.ins._nom },
        { titre: 'Niveau', valeur: l => l.ins.niveau },
        { titre: 'Score', valeur: l => l.res.score },
        { titre: 'Risque', valeur: l => U.statut(l.res.niveau) },
        { titre: 'Facteurs', valeur: l => l.res.facteurs.map(f => f.facteur).join(', ') || 'Aucun' }
      ], lignes.filter(l => l.res.score > 0).slice(0, 40), {
        messageVide: 'Aucun élève ne présente de facteur de risque.',
        onLigne: l => detailRisque(l)
      }));

      if (EG.peutEcrire()) zone.appendChild(el('div', { class: 'barre-actions' }, [
        el('button', {
          class: 'btn btn-primaire', text: 'Enregistrer les scores et créer les alertes', onclick: () => {
            const aRisque = lignes.filter(l => l.res.niveau === 'ELEVE' || l.res.niveau === 'CRITIQUE');
            DB.putBatch('scores_risque', lignes.filter(l => l.res.score > 0).map(l => ({
              inscription_id: l.ins.id, modele_id: modele ? modele.id : null, score: l.res.score,
              niveau: l.res.niveau, facteurs: l.res.facteurs, calcule_at: new Date().toISOString()
            })))
              .then(() => DB.putBatch('alertes_scolaires', aRisque.map(l => ({
                inscription_id: l.ins.id, niveau: l.res.niveau, statut: 'NOUVELLE'
              }))))
              .then(() => DB.audit('CALCUL_RISQUE', 'scores_risque', null, { evalues: lignes.length, alertes: aRisque.length }))
              .then(() => { U.toast(aRisque.length + ' alerte(s) créée(s)'); EG.majSynchro(); });
          }
        })
      ]));
    });

    function detailRisque(l) {
      U.modal('Facteurs — ' + l.ins._nom, el('div', {}, [
        el('p', {}, [el('strong', { text: 'Score : ' + l.res.score + '/100 ' }), U.statut(l.res.niveau)]),
        U.tableau([
          { titre: 'Facteur', valeur: f => f.facteur },
          { titre: 'Constat', valeur: f => f.valeur },
          { titre: 'Points', valeur: f => '+' + f.points }
        ], l.res.facteurs, { messageVide: 'Aucun facteur déclenché.' }),
        el('p', { class: 'muet petit', text: 'Chaque point est justifié par une donnée saisie dans l’application. Le score n’est jamais une décision : il oriente un accompagnement.' })
      ]), fermer => [
        el('button', { class: 'btn btn-fantome', text: 'Fermer', onclick: fermer }),
        el('button', {
          class: 'btn btn-primaire', text: 'Ouvrir un accompagnement', onclick: () => {
            fermer();
            editer('accompagnements_eleves', {
              inscription_id: l.ins.id, date_ouverture: new Date().toISOString().slice(0, 10),
              motif: l.res.facteurs.map(f => f.facteur + ' : ' + f.valeur).join(' ; '), statut: 'OUVERT'
            }, () => U.toast('Accompagnement ouvert'));
          }
        })
      ]);
    }
  });

  /* =======================================================================
     Centre d'alertes
     ======================================================================= */

  Routeur.definir('alertes', function (racine) {
    racine.appendChild(entete('Centre d’alertes', 'Détection automatique à partir des données saisies.', [
      el('button', {
        class: 'btn btn-fantome', text: 'Relancer la détection', onclick: () => detecter().then(n => {
          U.toast(n ? n + ' alerte(s) détectée(s)' : 'Aucune nouvelle situation détectée');
          /* L'utilisateur a pu changer d'écran pendant l'analyse : on ne le ramène pas de force. */
          if (Routeur.lire().vue === 'alertes') dessiner();
        })
      })
    ]));
    const filtres = el('div', { class: 'barre-filtres' });
    const zone = el('div');
    racine.appendChild(filtres); racine.appendChild(zone);
    let etat = 'ouvertes';

    filtres.appendChild(U.selecteur('Affichage', [
      { value: 'ouvertes', label: 'Ouvertes' }, { value: 'toutes', label: 'Toutes' }
    ], etat, v => { etat = v; dessiner(); }, { vide: false }));

    function dessiner() {
      zone.textContent = '';
      Promise.all([charger('alertes'), DB.all('ecoles')]).then(([alertes, ecoles]) => {
        const ie = indexer(ecoles);
        const rows = etat === 'ouvertes'
          ? alertes.filter(a => ['RESOLUE', 'CLOTUREE', 'IGNOREE'].indexOf(a.statut) < 0) : alertes;
        zone.appendChild(U.tableau([
          { titre: 'Sévérité', valeur: a => U.statut(a.severite) },
          { titre: 'Alerte', valeur: a => a.titre },
          { titre: 'École', valeur: a => ie[a.ecole_id] ? ie[a.ecole_id].nom : '—' },
          { titre: 'Détectée', valeur: a => U.dateCourte(a.detectee_at) },
          { titre: 'Statut', valeur: a => U.statut(a.statut) }
        ], rows, {
          messageVide: 'Aucune alerte. Lancez la détection pour analyser les données.',
          onLigne: a => traiter(a)
        }));
      });
    }
    dessiner();

    function traiter(a) {
      U.modal(a.titre, el('div', {}, [
        el('p', { text: a.description || '' }),
        el('p', { class: 'muet petit', text: 'Type : ' + a.type_code + ' • détectée le ' + U.heure(a.detectee_at) })
      ]), fermer => {
        const btns = [el('button', { class: 'btn btn-fantome', text: 'Fermer', onclick: fermer })];
        if (EG.peutEcrire()) {
          btns.push(el('button', {
            class: 'btn btn-fantome', text: 'Prendre en charge', onclick: () => {
              DB.put('alertes', Object.assign({}, a, { statut: 'PRISE_EN_CHARGE' })).then(() => { fermer(); dessiner(); U.toast('Alerte prise en charge'); });
            }
          }));
          btns.push(el('button', {
            class: 'btn btn-primaire', text: 'Marquer résolue', onclick: () => {
              DB.put('alertes', Object.assign({}, a, { statut: 'RESOLUE', resolue_at: new Date().toISOString() }))
                .then(() => DB.audit('ALERTE_RESOLUE', 'alertes', a.id))
                .then(() => { fermer(); dessiner(); U.toast('Alerte résolue'); });
            }
          }));
        }
        return btns;
      });
    }
  });

  /** Détection : parcourt les données et crée les alertes manquantes (dédoublonnées). */
  function detecter() {
    return Promise.all([
      inscriptionsEnrichies(), DB.all('presences'), charger('infrastructures'),
      charger('inventaires_mobilier'), charger('personnels'), DB.all('regles_retraite'),
      charger('recensements_ecoles'), charger('classes'), DB.all('alertes')
    ]).then(([ins, pres, infra, mob, agents, regles, recens, classes, existantes]) => {
      const cles = {};
      existantes.filter(a => ['RESOLUE', 'CLOTUREE', 'IGNOREE'].indexOf(a.statut) < 0).forEach(a => { cles[a.dedup_key] = true; });
      const nouvelles = [];
      const ajouter = (dedup, type, severite, titre, description, ecole_id) => {
        if (cles[dedup]) return;
        cles[dedup] = true;
        nouvelles.push({
          type_code: type, severite, titre, description, ecole_id: ecole_id || ecoleCourante(),
          statut: 'NOUVELLE', dedup_key: dedup, detectee_at: new Date().toISOString()
        });
      };

      /* Absentéisme */
      const parIns = {};
      pres.forEach(p => {
        const s = parIns[p.inscription_id] = parIns[p.inscription_id] || { total: 0, abs: 0 };
        s.total++; if (p.statut === 'ABSENT') s.abs++;
      });
      ins.forEach(i => {
        const s = parIns[i.id];
        if (s && s.total >= 5 && s.abs / s.total > 0.25) {
          ajouter('abs:' + i.id, 'ABSENTEISME_ELEVE', 'ELEVEE', 'Absentéisme : ' + i._nom,
            Math.round(s.abs / s.total * 100) + ' % d’absences sur ' + s.total + ' jours enregistrés.', i.ecole_id);
        }
      });

      /* Effectifs pléthoriques */
      const parClasse = {};
      ins.forEach(i => { if (i.classe_id) parClasse[i.classe_id] = (parClasse[i.classe_id] || 0) + 1; });
      classes.forEach(c => {
        const n = parClasse[c.id] || 0;
        if (n > (c.effectif_max || 60)) {
          ajouter('eff:' + c.id, 'EFFECTIF_PLETHORIQUE', 'MOYENNE', 'Effectif pléthorique en ' + (c.libelle || c.code),
            n + ' élèves pour un maximum de ' + (c.effectif_max || 60) + '.', c.ecole_id);
        }
      });

      /* Locaux dégradés */
      infra.forEach(x => {
        if (x.etat_murs === 'MAUVAIS' || x.etat_toit === 'MAUVAIS') {
          ajouter('loc:' + x.id, 'LOCAL_DEGRADE', 'ELEVEE', 'Local dégradé : ' + (x.designation || x.code_local),
            'Murs : ' + U.libelle(x.etat_murs) + ' • toit : ' + U.libelle(x.etat_toit) + '.', x.ecole_id);
        }
      });

      /* Déficit de places assises */
      const parEcole = {};
      mob.forEach(m => { (parEcole[m.ecole_id] = parEcole[m.ecole_id] || []).push(m); });
      Object.keys(parEcole).forEach(eid => {
        const places = R.capaciteMobilier(parEcole[eid]);
        const eff = ins.filter(i => i.ecole_id === eid).length;
        if (eff > places) {
          ajouter('mob:' + eid, 'DEFICIT_MOBILIER', 'MOYENNE', 'Déficit de places assises',
            (eff - places) + ' place(s) manquante(s) : ' + eff + ' élèves pour ' + places + ' places.', eid);
        }
      });

      /* Retraites imminentes */
      agents.forEach(a => {
        const p = R.previsionRetraite(a, regles);
        if (p && p.mois_restants <= 12) {
          ajouter('ret:' + a.id, 'RETRAITE_PROCHE', 'MOYENNE',
            'Retraite proche : ' + (a.prenoms || '') + ' ' + a.nom,
            'Départ prévu le ' + U.dateCourte(p.date_retraite) + ' (catégorie ' + (a.categorie || '—') + ').', a.ecole_id);
        }
      });

      /* Recensement en retard */
      recens.forEach(r => {
        if (['BROUILLON', 'A_COMPLETER', 'A_CORRIGER'].indexOf(r.statut) >= 0) {
          ajouter('rec:' + r.id, 'RECENSEMENT_RETARD', 'ELEVEE', 'Recensement non transmis',
            'La fiche est encore au statut « ' + U.libelle(r.statut) + ' ».', r.ecole_id);
        }
      });

      if (!nouvelles.length) return 0;
      return DB.putBatch('alertes', nouvelles)
        .then(() => DB.audit('DETECTION_ALERTES', 'alertes', null, { nombre: nouvelles.length }))
        .then(() => { EG.majSynchro(); return nouvelles.length; });
    });
  }
  EG.detecterAlertes = detecter;

  /* =======================================================================
     Portail parents
     ======================================================================= */

  function ecranParentAccueil(vue) {
    const zone = el('div');
    vue.appendChild(zone);
    const u = session().user;
    /* Un compte élève ouvre le même tableau de bord que celui d'un parent, mais sur
       lui seul : son propre dossier, sans aucun autre enfant. */
    const source = u.role === 'ELEVE'
      ? Promise.resolve(u.eleve_id ? [{ eleve_id: u.eleve_id, relation: 'ELEVE', statut: 'VALIDE', _soi: true }] : [])
      : DB.where('profils_parents', { user_id: u.id }).then(profils => {
        const p = profils[0];
        if (!p) return null;
        return DB.where('liens_parent_enfant', { parent_id: p.id, statut: 'VALIDE' });
      });
    source.then(liens => {
      if (liens === null) { zone.appendChild(U.vide('Aucun profil parent n’est rattaché à ce compte.')); return; }
      return Promise.resolve(liens).then(liens => {
        if (!liens.length) {
          zone.appendChild(U.vide(u.role === 'ELEVE'
            ? 'Ce compte n’est rattaché à aucun dossier d’élève. Signalez-le à la direction de l’école.'
            : 'Aucun enfant n’est encore rattaché à votre compte. Le directeur de l’école valide ce rattachement.'));
          return;
        }
        return Promise.all([
          DB.all('eleves'), DB.all('inscriptions_eleves'), DB.all('presences'),
          DB.all('notes'), DB.all('evaluations'), DB.all('matieres'), DB.all('communications_ecole')
        ]).then(([eleves, ins, pres, notes, evals, matieres, comms]) => {
          const ie = indexer(eleves), im = indexer(matieres), iv = indexer(evals);
          liens.forEach(l => {
            const eleve = ie[l.eleve_id];
            if (!eleve) return;
            const inscription = ins.filter(i => i.eleve_id === l.eleve_id && i.statut !== 'CLOTURE')[0];
            const corps = el('div');
            if (inscription) {
              const mesPres = pres.filter(x => x.inscription_id === inscription.id);
              const abs = mesPres.filter(x => x.statut === 'ABSENT').length;
              const mesNotes = notes.filter(x => x.inscription_id === inscription.id && typeof x.note === 'number');
              const moy = R.moyenne(mesNotes.map(n => ({ note: n.note, coefficient: 1 })));
              corps.appendChild(grille([
                U.stat(inscription.niveau, 'Classe'),
                U.stat(moy === null ? '—' : moy.toFixed(2), 'Moyenne générale'),
                U.stat(U.nombre(abs), 'Absences (demi-journées)', abs > 6 ? 'attention' : ''),
                U.stat(U.nombre(mesPres.length), 'Appels enregistrés (demi-journées)')
              ], 'grille-stats'));

              const dernieres = mesNotes.slice(-8).reverse();
              corps.appendChild(U.tableau([
                { titre: 'Matière', valeur: n => im[n.matiere_id] ? im[n.matiere_id].nom : '—' },
                { titre: 'Évaluation', valeur: n => iv[n.evaluation_id] ? 'N° ' + iv[n.evaluation_id].numero : '—' },
                { titre: 'Note', valeur: n => n.note.toFixed(2) + '/20' },
                { titre: 'Maîtrise', valeur: n => U.badge(R.estMaitrise(n.note) ? 'Acquis' : 'À renforcer', R.estMaitrise(n.note) ? 'ok' : 'attention') }
              ], dernieres, { messageVide: 'Aucune note publiée pour le moment.' }));

              const recentes = mesPres.filter(x => x.statut !== 'PRESENT').slice(-5).reverse();
              if (recentes.length) corps.appendChild(U.carte('Absences et retards récents', U.tableau([
                { titre: 'Date', valeur: x => U.dateCourte(x.date_presence) },
                { titre: 'Statut', valeur: x => U.statut(x.statut) },
                { titre: 'Justifié', valeur: x => x.justifie ? 'Oui' : 'Non' }
              ], recentes)));
            } else {
              corps.appendChild(el('p', { class: 'muet', text: 'Aucune inscription active.' }));
            }
            zone.appendChild(U.carte(l._soi ? nomEleve(eleve) : nomEleve(eleve) + ' — ' + U.libelle(l.relation), corps));
          });

          const publiees = comms.filter(c => c.statut === 'PUBLIEE');
          if (publiees.length) {
            zone.appendChild(U.carte('Messages de l’école', el('div', { class: 'annonces' },
              publiees.map(c => el('article', { class: 'annonce' }, [
                el('h4', { text: c.titre }),
                el('p', { text: c.contenu }),
                el('span', { class: 'muet petit', text: U.dateFR(c.date_publication) })
              ])))));
          }
        });
      });
    });
  }

  Routeur.definir('parents', function (racine) {
    if (session().user.role === 'PARENT' || session().user.role === 'ELEVE') { racine.appendChild(entete(session().user.role === 'ELEVE' ? 'Mon dossier' : 'Mes enfants', '')); return ecranParentAccueil(racine); }
    racine.appendChild(entete('Portail parents', 'Rattachements à valider et messages diffusés aux familles.', [
      el('button', { class: 'btn btn-primaire', text: 'Nouvelle communication', onclick: () => editer('communications_ecole', null, () => Routeur.aller('parents')) })
    ]));
    const zone = el('div');
    racine.appendChild(zone);

    Promise.all([DB.all('liens_parent_enfant'), DB.all('profils_parents'), DB.all('eleves'), charger('communications_ecole')])
      .then(([liens, parents, eleves, comms]) => {
        const ip = indexer(parents), ie = indexer(eleves);
        const attente = liens.filter(l => l.statut === 'EN_ATTENTE');
        zone.appendChild(U.carte('Rattachements à valider', U.tableau([
          { titre: 'Parent', valeur: l => ip[l.parent_id] ? U.titreDe('profils_parents', ip[l.parent_id]) : '—' },
          { titre: 'Enfant', valeur: l => nomEleve(ie[l.eleve_id]) },
          { titre: 'Relation', valeur: l => U.libelle(l.relation) },
          { titre: '', valeur: l => el('button', {
            class: 'btn btn-petit btn-primaire', text: 'Valider', onclick: e => {
              e.stopPropagation();
              DB.put('liens_parent_enfant', Object.assign({}, l, { statut: 'VALIDE', valide_at: new Date().toISOString() }))
                .then(() => DB.audit('VALIDATION_LIEN_PARENT', 'liens_parent_enfant', l.id))
                .then(() => { U.toast('Rattachement validé'); Routeur.aller('parents'); });
            }
          }) }
        ], attente, { messageVide: 'Aucune demande en attente.' })));

        zone.appendChild(U.carte('Communications', U.tableau([
          { titre: 'Titre', valeur: c => c.titre },
          { titre: 'Audience', valeur: c => U.libelle(c.audience) },
          { titre: 'Publication', valeur: c => U.dateCourte(c.date_publication) },
          { titre: 'Statut', valeur: c => U.statut(c.statut) }
        ], comms, { messageVide: 'Aucune communication.', onLigne: c => fiche('communications_ecole', c, () => Routeur.aller('parents'), {}) })));

        const valides = liens.filter(l => l.statut === 'VALIDE');
        zone.appendChild(U.carte('Familles rattachées', U.tableau([
          { titre: 'Parent', valeur: l => ip[l.parent_id] ? U.titreDe('profils_parents', ip[l.parent_id]) : '—' },
          { titre: 'Téléphone', valeur: l => ip[l.parent_id] ? ip[l.parent_id].telephone : '—' },
          { titre: 'Enfant', valeur: l => nomEleve(ie[l.eleve_id]) }
        ], valides, { messageVide: 'Aucun rattachement validé.' })));
      });
  });

  /* =======================================================================
     Documents
     ======================================================================= */

  function empreinte(texte) {
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < texte.length; i++) {
      h1 = (h1 ^ texte.charCodeAt(i)) >>> 0; h1 = (h1 * 16777619) >>> 0;
      h2 = (h2 + texte.charCodeAt(i) * (i + 7)) >>> 0;
    }
    return (h1.toString(16) + h2.toString(16)).padStart(16, '0');
  }

  function genererDocument(typeCode, titre, html, options) {
    options = options || {};
    /* Signatures des acteurs concernés (élève, parent, enseignant, agent, autorité) : scellées avec la pièce. */
    if (options.acteurs && options.acteurs.length) html += EG.Docs.blocActeurs(options.acteurs);
    const numero = typeCode + '-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-6);
    const hash = empreinte(html + numero);
    return DB.put('documents', {
      numero, type_code: typeCode, titre, ecole_id: options.ecole_id || ecoleCourante(), annee_scolaire_id: anneeCourante(),
      classe_id: options.classe_id || null, orientation: options.paysage ? 'PAYSAGE' : 'PORTRAIT',
      sensibilite: 'INTERNE', statut: 'GENERE', hash_sha256: hash, contenu_html: html
    }).then(doc => {
      const u = session().user;
      return DB.put('signatures_documents', {
        document_id: doc.id,
        signataire_label: (u.prenoms || '') + ' ' + u.nom,
        role_signature: U.libelle(u.role),
        type_signature: u.signature_image ? 'NUMERIQUE' : 'CACHET',
        hash_document: hash, signed_at: new Date().toISOString()
      }).then(() => {
        DB.audit('GENERATION_DOCUMENT', 'documents', doc.id, { type: typeCode });
        EG.majSynchro();
        U.toast('Document généré : ' + numero);
        imprimerDocument(doc);
        return doc;
      });
    });
  }
  EG.genererDocument = genererDocument;
  EG.empreinte = empreinte;

  function imprimerDocument(doc) {
    const w = window.open('', '_blank');
    if (!w) { U.toast('Autorisez les fenêtres pour imprimer', 'attention'); return; }
    const u = session().user;
    let contexteAdmin = {};
    Promise.all([
      DB.get('ecoles', doc.ecole_id || ecoleCourante()),
      doc.classe_id ? DB.get('classes', doc.classe_id) : Promise.resolve(null),
      DB.all('territoires')
    ]).then(([ecole, classe, territoires]) => {
      const it = {}; territoires.forEach(t => { it[t.id] = t; });
      const circo = ecole ? it[ecole.territoire_id] : null;
      let departement = circo ? it[circo.parent_id] : null;
      while (departement && departement.type !== 'DEPARTEMENT' && departement.parent_id) {
        departement = it[departement.parent_id];
      }
      contexteAdmin = {
        circonscription: circo ? circo.nom : '',
        departement: departement ? departement.nom : ''
      };
      return (classe && classe.titulaire_id ? DB.get('personnels', classe.titulaire_id)
        : Promise.resolve(null)).then(titulaire => ({ ecole, classe, titulaire }));
    }).then(({ ecole, classe, titulaire }) => {
      /* Ces pièces portent déjà leur propre signature et leur cachet à
         l'emplacement prévu par le modèle officiel : on n'en ajoute pas un second. */
      const autonomes = ['CARTE_SCOLAIRE', 'FICHE_CEP', 'CERT_SCOLARITE', 'FICHE_EVAL_AGENT', 'CERTIFICAT_AGENT'];
      const signature = autonomes.indexOf(doc.type_code) >= 0 ? ''
        : EG.Docs.blocSignature(u, ecole, null, titulaire);
      /* Toute pièce administrative part sous les armoiries et le logo du ministère. */
      const enTete = autonomes.indexOf(doc.type_code) >= 0 ? ''
        : EG.Docs.enteteAdministratif(ecole, contexteAdmin);
      w.document.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>'
        + EG.Docs.echapper(doc.titre) + '</title><style>' + EG.Docs.stylesImpression
        + (doc.orientation === 'PAYSAGE' ? '@page { size: A4 landscape; margin: 8mm; }' : '') + '</style></head><body>'
        + enTete + doc.contenu_html + signature
        + '<div class="pied pied-qr"><div>Document n° ' + EG.Docs.echapper(doc.numero) + ' — empreinte ' + EG.Docs.echapper(doc.hash_sha256)
        + '<br>Édité le ' + U.dateFR(new Date().toISOString()) + ' par ' + EG.Docs.echapper((u.prenoms || '') + ' ' + u.nom)
        + ((ecole && ecole.nom) ? ' — ' + EG.Docs.echapper(ecole.nom) : '')
        + (classe ? '<br>Classe : ' + EG.Docs.echapper(classe.libelle || classe.code)
          + (titulaire ? ' — titulaire : ' + EG.Docs.echapper(((titulaire.nom || '').toUpperCase()
            + ' ' + (titulaire.prenoms || '')).trim()) : '') : '')
        + '<br>Scannez le code ci-contre ou présentez ce numéro à l’établissement pour vérifier l’authenticité.'
        + '</div>' + EG.Docs.qrDocument(doc.numero, doc.hash_sha256, 92) + '</div></body></html>');
      w.document.close();
      setTimeout(() => w.print(), 500);
    });
  }

  Routeur.definir('documents', function (racine) {
    racine.appendChild(entete('Documents', 'Chaque édition est numérotée, horodatée et scellée par une empreinte.'));
    const zone = el('div');
    racine.appendChild(zone);

    const modeles = [
      { code: 'LISTE_CLASSE', nom: 'Liste de classe', description: 'Effectif complet d’une classe, avec dates de naissance.' },
      { code: 'CERT_SCOLARITE', nom: 'Certificat de scolarité', description: 'Attestation individuelle d’inscription.' },
      { code: 'CARTE_SCOLAIRE', nom: 'Cartes d’identité scolaire', description: 'Cartes d’une classe entière, cachet compris.' },
      { code: 'CERT_OFFICIEL', nom: 'Certificat de scolarité officiel', description: 'Modèle à souche, deux volets par feuille.' },
      { code: 'FICHE_EVAL_AGENT', nom: 'Fiche d’évaluation d’un agent', description: 'Modèle de la Direction de l’Administration et des Finances.' },
      { code: 'FICHE_CEP', nom: 'Fiches d’inscription au CEP', description: 'Fiches officielles des candidats de CM2.' },
      { code: 'ETAT_BUDGET', nom: 'État budgétaire', description: 'Ressources, dépenses et solde de l’année.' }
    ];
    zone.appendChild(U.carte('Éditer un document', el('div', { class: 'raccourcis' },
      modeles.map(m => el('button', {
        class: 'raccourci', onclick: () => editerModele(m.code)
      }, [el('span', { class: 'raccourci-icone', text: '\uE00D' }), el('span', { text: m.nom })])))));

    charger('documents').then(docs => {
      zone.appendChild(U.carte('Documents édités', U.tableau([
        { titre: 'Numéro', valeur: d => d.numero },
        { titre: 'Titre', valeur: d => d.titre },
        { titre: 'Statut', valeur: d => U.statut(d.statut) },
        { titre: 'Empreinte', valeur: d => el('code', { class: 'json', text: d.hash_sha256 || '—' }) },
        { titre: 'Édité le', valeur: d => U.dateCourte(d.created_at) }
      ], docs, { messageVide: 'Aucun document édité.', onLigne: d => imprimerDocument(d) })));
    });

    /** Cartes d'identité scolaire de toute une classe, prêtes à découper. */
    function cartesDeClasse() {
      DB.where('classes', { annee_scolaire_id: anneeCourante() }).then(cls => {
        const dispo = porteeEcole(cls);
        if (!dispo.length) { U.toast('Aucune classe ouverte', 'attention'); return; }
        const sel = el('select', {}, [el('option', { value: '', text: 'Toutes les classes de l’école' })]
          .concat(dispo.map(c => el('option', { value: c.id, text: c.libelle || c.code }))));
        U.modal('Cartes d’identité scolaire',
          el('div', {}, [
            el('label', { class: 'filtre' }, [el('span', { text: 'Classe' }), sel]),
            el('p', { class: 'muet petit', text: 'Une carte par élève, du CI au CM2 comme en maternelle : armoiries, drapeau, sceau en filigrane, cachet de l’école et emplacements de signature. Imprimez sur papier fort, puis découpez.' })
          ]),
          fermer => [
            el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
            el('button', {
              class: 'btn btn-primaire', text: 'Éditer les cartes', onclick: () => {
                const cid = sel.value;
                Promise.all([
                  cid ? inscriptionsEnrichies({ classe_id: cid }) : inscriptionsEnrichies(),
                  DB.get('ecoles', ecoleCourante()),
                  DB.all('territoires')
                ])
                  .then(([ins, ecole, territoires]) => {
                    const it = {}; territoires.forEach(t => { it[t.id] = t; });
                    const circo = ecole ? it[ecole.territoire_id] : null;
                    let dep = circo ? it[circo.parent_id] : null;
                    while (dep && dep.type !== 'DEPARTEMENT' && dep.parent_id) dep = it[dep.parent_id];
                    const contexte = {
                      circonscription: circo ? String(circo.nom).replace(/^CS\s+/i, '') : '',
                      departement: dep ? dep.nom : ''
                    };
                    fermer();
                    if (!ins.length) { U.toast('Aucun élève à éditer', 'attention'); return; }
                    const cl = cid ? dispo.filter(c => c.id === cid)[0]
                      : { code: 'ECOLE', libelle: 'toutes les classes', niveau: '' };
                    /* Recto puis verso : on imprime la planche des rectos,
                       saut de page, puis la planche des versos dans le même
                       ordre — chaque carte retrouve son dos au découpage. */
                    const numeros = ins.map((i, k) =>
                      'CS-' + (cl.code || cl.niveau) + '-' + String(k + 1).padStart(3, '0'));
                    const rectos = ins.map((i, k) => EG.Docs.carteScolaire(
                      i._eleve || {}, i, ecole, session().annee_code, numeros[k], session().user
                    )).join('');
                    const versos = ins.map((i, k) => EG.Docs.carteScolaireVerso(
                      i._eleve || {}, i, ecole, session().annee_code, numeros[k], contexte
                    )).join('');
                    const cartes = rectos + '</div><div class="saut-page"></div><div class="planche-cartes">' + versos;
                    genererDocument('CARTE_SCOLAIRE', 'Cartes scolaires — ' + (cl.libelle || cl.code),
                      '<div class="planche-cartes">' + cartes + '</div>', { classe_id: cid || null });
                  });
              }
            })
          ]);
      });
    }

    /** Fiches d'inscription au CEP pour les candidats de CM2. */
    function fichesCEP() { EG.editerFichesCEP(); }

    function editerModele(code) {
      if (code === 'ETAT_BUDGET') return Routeur.aller('budget');
      if (code === 'CARTE_SCOLAIRE') return cartesDeClasse();
      if (code === 'FICHE_CEP') return fichesCEP();
      if (code === 'CERT_OFFICIEL') return EG.editerCertificat();
      if (code === 'FICHE_EVAL_AGENT') return EG.editerFicheAgent();
      DB.where('classes', { annee_scolaire_id: anneeCourante() }).then(cls => {
        const dispo = porteeEcole(cls);
        const sel = el('select', {}, dispo.map(c => el('option', { value: c.id, text: c.libelle || c.code })));
        U.modal(code === 'LISTE_CLASSE' ? 'Liste de classe' : 'Certificat de scolarité',
          el('div', {}, [el('label', { class: 'filtre' }, [el('span', { text: 'Classe' }), sel])]),
          fermer => [
            el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
            el('button', {
              class: 'btn btn-primaire', text: 'Éditer', onclick: () => {
                const cid = sel.value;
                inscriptionsEnrichies({ classe_id: cid }).then(ins => {
                  fermer();
                  const cl = dispo.filter(c => c.id === cid)[0];
                  if (code === 'LISTE_CLASSE') {
                    const lignes = ins.map((i, k) => '<tr><td>' + (k + 1) + '</td><td>' + i._nom + '</td><td>'
                      + (i._eleve ? i._eleve.sexe : '') + '</td><td>' + U.dateCourte(i._eleve ? i._eleve.date_naissance : '')
                      + '</td><td>' + (i.redoublant ? 'Oui' : 'Non') + '</td></tr>').join('');
                    genererDocument('LISTE_CLASSE', 'Liste de classe — ' + (cl.libelle || cl.code),
                      '<h2>Liste de classe</h2><p>' + session().ecole_nom + ' — ' + (cl.libelle || cl.code) + ' — année ' + session().annee_code + '</p>'
                      + '<p>Effectif : ' + ins.length + ' élèves dont ' + ins.filter(i => i._eleve && i._eleve.sexe === 'F').length + ' filles.</p>'
                      + '<table><thead><tr><th>N°</th><th>Nom et prénoms</th><th>Sexe</th><th>Naissance</th><th>Redoublant</th></tr></thead><tbody>'
                      + lignes + '</tbody></table>', { classe_id: cid });
                  } else {
                    const corps = ins.map(i => '<div style="page-break-after:always"><h2>Certificat de scolarité</h2>'
                      + '<p>Je soussigné, directeur de ' + session().ecole_nom + ', certifie que <strong>' + i._nom
                      + '</strong>, né(e) le ' + U.dateCourte(i._eleve ? i._eleve.date_naissance : '')
                      + ', est régulièrement inscrit(e) en ' + i.niveau + ' pour l’année scolaire ' + session().annee_code + '.</p></div>').join('');
                    genererDocument('CERT_SCOLARITE', 'Certificats — ' + (cl.libelle || cl.code), corps,
                      { classe_id: cid });
                  }
                });
              }
            })
          ]);
      });
    }
  });

  /* =======================================================================
     Statistiques
     ======================================================================= */

  Routeur.definir('analytics', function (racine) {
    const zone = el('div');
    racine.appendChild(entete('Statistiques', 'Indicateurs calculés sur les données disponibles localement.',
      EG.DocsSco ? [EG.DocsSco.boutonEditer('STATISTIQUES', 'Statistiques et courbes', zone)] : null));
    racine.appendChild(zone);

    Promise.all([
      inscriptionsEnrichies(), DB.all('eleves'), charger('personnels'),
      DB.all('presences'), DB.all('resultats_cep'), charger('infrastructures'),
      charger('inventaires_mobilier'), DB.all('populations_scolarisables'), DB.all('eleve_handicaps')
    ]).then(([ins, eleves, agents, pres, ceps, infra, mob, pops, handicaps]) => {
      const ie = indexer(eleves);
      const filles = ins.filter(i => ie[i.eleve_id] && ie[i.eleve_id].sexe === 'F').length;
      const garcons = ins.length - filles;
      const actifs = agents.filter(a => a.actif !== false);
      const composants = ceps.filter(c => c.a_compose).length;
      const admis = ceps.filter(c => c.admis === true).length;
      const places = R.capaciteMobilier(mob);
      const idsIns = indexer(ins);
      const p = pres.filter(x => idsIns[x.inscription_id]);
      const tauxPres = p.length ? Math.round(p.filter(x => x.statut === 'PRESENT').length / p.length * 100) : null;
      const idsEleves = {}; ins.forEach(i => { idsEleves[i.eleve_id] = true; });
      const nbHandicap = handicaps.filter(h => h.actif !== false && idsEleves[h.eleve_id]).length;

      zone.appendChild(grille([
        U.stat(U.nombre(ins.length), 'Élèves'),
        U.stat(garcons ? (filles / garcons).toFixed(2) : '—', 'Parité filles/garçons'),
        U.stat(actifs.length ? Math.round(ins.length / actifs.length) : '—', 'Élèves par maître'),
        U.stat(tauxPres === null ? '—' : tauxPres + ' %', 'Taux de présence'),
        U.stat(composants ? Math.round(admis / composants * 100) + ' %' : '—', 'Réussite au CEP'),
        U.stat(U.nombre(nbHandicap), 'Élèves en situation de handicap')
      ], 'grille-stats'));

      /* Répartition par âge */
      const parAge = {};
      ins.forEach(i => {
        const a = R.age(ie[i.eleve_id] ? ie[i.eleve_id].date_naissance : null);
        if (a === null) return;
        parAge[a] = (parAge[a] || 0) + 1;
      });
      const ages = Object.keys(parAge).map(Number).sort((a, b) => a - b);
      if (ages.length) zone.appendChild(U.carte('Répartition par âge',
        histogramme(ages.map(a => ({ etiquette: a + ' ans', valeur: parAge[a] })))));

      /* Effectifs par niveau et par sexe */
      const parNiveau = {};
      ins.forEach(i => {
        const n = parNiveau[i.niveau] = parNiveau[i.niveau] || { F: 0, M: 0 };
        n[ie[i.eleve_id] && ie[i.eleve_id].sexe === 'F' ? 'F' : 'M']++;
      });
      zone.appendChild(U.carte('Effectifs par niveau', U.tableau([
        { titre: 'Niveau', valeur: n => n },
        { titre: 'Filles', valeur: n => U.nombre(parNiveau[n].F) },
        { titre: 'Garçons', valeur: n => U.nombre(parNiveau[n].M) },
        { titre: 'Total', valeur: n => U.nombre(parNiveau[n].F + parNiveau[n].M) },
        { titre: 'Part des filles', valeur: n => Math.round(parNiveau[n].F / (parNiveau[n].F + parNiveau[n].M) * 100) + ' %' }
      ], EG.NIVEAUX.filter(n => parNiveau[n]))));

      /* Patrimoine */
      const salles = infra.filter(x => x.type_local === 'SALLE_CLASSE');
      zone.appendChild(U.carte('Conditions d’accueil', el('div', {}, [
        grille([
          U.stat(U.nombre(salles.length), 'Salles de classe'),
          U.stat(U.nombre(salles.filter(s => s.etat_murs === 'BON').length), 'Salles en bon état'),
          U.stat(U.nombre(places), 'Places assises'),
          U.stat(U.nombre(Math.max(0, ins.length - places)), 'Places manquantes', ins.length > places ? 'attention' : '')
        ], 'grille-stats')
      ])));

      /* Taux brut de scolarisation si la population est renseignée */
      if (pops.length) {
        const pop = pops.reduce((s, x) => s + (x.population || 0), 0);
        zone.appendChild(U.carte('Taux brut de scolarisation', el('div', {}, [
          U.barre(Math.min(100, Math.round(ins.length / pop * 100))),
          el('p', { class: 'muet', text: Math.round(ins.length / pop * 100) + ' % — ' + U.nombre(ins.length) + ' élèves pour une population estimée de ' + U.nombre(pop) + '.' })
        ])));
      } else {
        zone.appendChild(U.carte('Taux brut de scolarisation',
          U.vide('Renseignez les populations scolarisables pour calculer cet indicateur.',
            el('button', { class: 'btn btn-fantome', text: 'Saisir les populations', onclick: () => Routeur.aller('entite/populations_scolarisables') }))));
      }
    });
  });

  /* =======================================================================
     Rapports
     ======================================================================= */

  Routeur.definir('rapports', function (racine) {
    racine.appendChild(entete('Rapports', 'Éditions officielles et exports.'));
    const zone = el('div');
    racine.appendChild(zone);

    DB.all('modeles_rapports').then(modeles => {
      zone.appendChild(U.carte('Modèles disponibles', el('div', { class: 'raccourcis' },
        modeles.map(m => el('button', {
          class: 'raccourci', title: m.description, onclick: () => produire(m)
        }, [el('span', { class: 'raccourci-icone', text: '\uE011' }), el('span', { text: m.nom })])))));

      zone.appendChild(U.carte('Exporter les données brutes', el('div', { class: 'raccourcis' },
        ['eleves', 'inscriptions_eleves', 'presences', 'notes', 'personnels', 'infrastructures'].map(e =>
          el('button', {
            class: 'raccourci', onclick: () => exporterExcel(e)
          }, [el('span', { class: 'raccourci-icone', text: '\uE015' }), el('span', { text: EG.SCHEMA[e].label + ' (Excel)' })])))));
    });

    function produire(m) {
      if (m.code === 'EFFECTIFS_NIVEAU') {
        inscriptionsEnrichies().then(ins => DB.all('eleves').then(eleves => {
          const ie = indexer(eleves), parNiveau = {};
          ins.forEach(i => {
            const n = parNiveau[i.niveau] = parNiveau[i.niveau] || { F: 0, M: 0 };
            n[ie[i.eleve_id] && ie[i.eleve_id].sexe === 'F' ? 'F' : 'M']++;
          });
          const lignes = EG.NIVEAUX.filter(n => parNiveau[n]).map(n =>
            '<tr><td>' + n + '</td><td>' + parNiveau[n].F + '</td><td>' + parNiveau[n].M + '</td><td>' + (parNiveau[n].F + parNiveau[n].M) + '</td></tr>').join('');
          genererDocument('LISTE_CLASSE', m.nom, '<h2>' + m.nom + '</h2><p>' + session().ecole_nom + ' — ' + session().annee_code + '</p>'
            + '<table><thead><tr><th>Niveau</th><th>Filles</th><th>Garçons</th><th>Total</th></tr></thead><tbody>' + lignes + '</tbody></table>');
        }));
      } else if (m.code === 'RETRAITES_5ANS') {
        Promise.all([charger('personnels'), DB.all('regles_retraite')]).then(([agents, regles]) => {
          const lignes = agents.map(a => ({ a, p: R.previsionRetraite(a, regles) }))
            .filter(x => x.p && x.p.mois_restants <= 60)
            .sort((x, y) => x.p.mois_restants - y.p.mois_restants)
            .map(x => '<tr><td>' + (x.a.nom || '').toUpperCase() + ' ' + (x.a.prenoms || '') + '</td><td>' + (x.a.categorie || '—')
              + '</td><td>' + x.p.age_actuel + '</td><td>' + U.dateCourte(x.p.date_retraite) + '</td></tr>').join('');
          genererDocument('LISTE_CLASSE', m.nom, '<h2>' + m.nom + '</h2>'
            + '<table><thead><tr><th>Agent</th><th>Catégorie</th><th>Âge</th><th>Départ prévu</th></tr></thead><tbody>' + lignes + '</tbody></table>');
        });
      } else if (m.code === 'ASSIDUITE') {
        Promise.all([inscriptionsEnrichies(), DB.all('presences')]).then(([ins, pres]) => {
          const idx = indexer(ins), parIns = {};
          pres.filter(p => idx[p.inscription_id]).forEach(p => {
            const s = parIns[p.inscription_id] = parIns[p.inscription_id] || { t: 0, p: 0 };
            s.t++; if (p.statut === 'PRESENT') s.p++;
          });
          const lignes = ins.map(i => {
            const s = parIns[i.id];
            return '<tr><td>' + i._nom + '</td><td>' + i.niveau + '</td><td>'
              + (s ? Math.round(s.p / s.t * 100) + ' %' : '—') + '</td></tr>';
          }).join('');
          genererDocument('LISTE_CLASSE', m.nom, '<h2>' + m.nom + '</h2>'
            + '<table><thead><tr><th>Élève</th><th>Niveau</th><th>Présence</th></tr></thead><tbody>' + lignes + '</tbody></table>');
        });
      } else if (m.code === 'PATRIMOINE') {
        Promise.all([charger('infrastructures'), charger('inventaires_mobilier')]).then(([infra, mob]) => {
          const lignes = infra.map(x => '<tr><td>' + (x.designation || x.code_local) + '</td><td>' + U.libelle(x.type_local)
            + '</td><td>' + U.libelle(x.etat_murs) + '</td><td>' + U.libelle(x.etat_toit) + '</td></tr>').join('');
          genererDocument('LISTE_CLASSE', m.nom, '<h2>' + m.nom + '</h2>'
            + '<p>Places assises disponibles : ' + R.capaciteMobilier(mob) + '</p>'
            + '<table><thead><tr><th>Local</th><th>Type</th><th>Murs</th><th>Toit</th></tr></thead><tbody>' + lignes + '</tbody></table>');
        });
      } else {
        Routeur.aller('bulletins?niveau=CM2');
      }
    }
  });

  /* =======================================================================
     Synchronisation, sauvegarde, EDUCMaster
     ======================================================================= */

  Routeur.definir('sync', function (racine) {
    racine.appendChild(entete('Synchronisation', 'Les saisies sont conservées sur l’appareil puis transmises dès le retour du réseau.'));
    const zone = el('div');
    racine.appendChild(zone);

    function dessiner() {
      zone.textContent = '';
      Promise.all([DB.outbox(), DB.all('eleves'), DB.all('conflits_synchronisation'), DB.meta('derniere_synchro')])
        .then(([outbox, eleves, conflits, derniere]) => {
          const attente = outbox.filter(o => o.status === 'PENDING' || o.status === 'FAILED');
          const nonSync = eleves.filter(e => e.educmaster_statut !== 'SYNCHRONISE').length;

          zone.appendChild(grille([
            U.stat(U.nombre(attente.length), 'Opérations en attente', attente.length ? 'attention' : ''),
            U.stat(navigator.onLine ? 'En ligne' : 'Hors ligne', 'État du réseau', navigator.onLine ? '' : 'attention'),
            U.stat(derniere ? U.dateCourte(derniere) : 'Jamais', 'Dernière synchronisation'),
            U.stat(U.nombre(nonSync), 'Élèves sans matricule EDUCMaster')
          ], 'grille-stats'));

          const parType = {};
          attente.forEach(o => { parType[o.entity_type] = (parType[o.entity_type] || 0) + 1; });
          zone.appendChild(U.carte('File d’attente', U.tableau([
            { titre: 'Table', valeur: k => EG.SCHEMA[k] ? EG.SCHEMA[k].label : k },
            { titre: 'Opérations', valeur: k => U.nombre(parType[k]) }
          ], Object.keys(parType), { messageVide: 'Tout est synchronisé.' })));

          zone.appendChild(el('div', { class: 'barre-actions' }, [
            el('button', {
              class: 'btn btn-primaire', text: 'Synchroniser maintenant', onclick: () => {
                if (!navigator.onLine) { U.toast('Aucun réseau détecté : la file reste conservée', 'attention'); return; }
                if (!attente.length) { U.toast('Rien à transmettre'); return; }
                DB.outboxClear(attente.map(o => o.id))
                  .then(() => DB.setMeta('derniere_synchro', new Date().toISOString()))
                  .then(() => DB.audit('SYNCHRONISATION', 'outbox', null, { operations: attente.length }))
                  .then(() => { U.toast(attente.length + ' opération(s) transmise(s)'); EG.majSynchro(); dessiner(); });
              }
            }),
            el('button', { class: 'btn btn-fantome', text: 'Sauvegarder sur l’appareil', onclick: sauvegarder }),
            el('button', { class: 'btn btn-fantome', text: 'Restaurer une sauvegarde', onclick: restaurer })
          ]));

          zone.appendChild(U.carte('Conflits', U.tableau([
            { titre: 'Entité', valeur: c => c.entity_type },
            { titre: 'Type', valeur: c => c.type_conflit },
            { titre: 'Statut', valeur: c => U.statut(c.statut) }
          ], conflits, { messageVide: 'Aucun conflit à arbitrer.' })));

          zone.appendChild(U.carte('EDUCMaster', el('div', {}, [
            el('p', { class: 'muet', text: 'Le rapprochement avec le répertoire national se fera à la connexion de l’API. Les élèves sans matricule sont déjà identifiés.' }),
            el('button', { class: 'btn btn-fantome', text: 'Ouvrir l’espace EDUCMaster', onclick: () => Routeur.aller('educmaster') })
          ])));

          zone.appendChild(U.carte('Réinitialisation', el('div', {}, [
            el('p', { class: 'muet', text: 'Efface toutes les données de cet appareil et repart d’une installation neuve (plan national, compte administrateur).' }),
            el('button', {
              class: 'btn btn-danger', text: 'Réinitialiser l’appareil', onclick: () => {
                U.confirmer('Réinitialiser', 'Toutes les données locales seront effacées. Sauvegardez d’abord si nécessaire.',
                  () => DB.reset().then(() => { U.toast('Appareil réinitialisé'); location.reload(); }), 'Effacer');
              }
            })
          ])));
        });
    }
    dessiner();

    /* La sauvegarde et la restauration passent par le module Import et export : périmètre du compte respecté. */
    function sauvegarder() { Routeur.aller('import-export/sauvegarde'); }
    function restaurer() { Routeur.aller('import-export/sauvegarde'); }
  });

  EG.Ecrans = { charger, refsPour, editer, fiche, exporterCSV, exporterExcel, telecharger, inscriptionsEnrichies, indexer, entete };
})(window);
