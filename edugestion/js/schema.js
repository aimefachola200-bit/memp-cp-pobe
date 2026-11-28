/* ÉduGestion Pro V5.2 — Schéma de données
   Chaque entité = un magasin IndexedDB + un écran CRUD généré.
   t: text|textarea|number|money|date|datetime|bool|select|ref|json
*/
(function (global) {
  'use strict';

  const CYCLES = ['MATERNELLE', 'PRIMAIRE'];
  const NIVEAUX_MAT = ['EM1', 'EM2', 'PETITS', 'MOYENS', 'GRANDS'];
  const NIVEAUX_PRIM = ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'];
  /* Tous les niveaux de classe : la maternelle d'abord, puis les six cours du primaire
     (CI, CP, CE1, CE2, CM1, CM2). Note : « CP » désigne ici le cours préparatoire ; le
     conseiller pédagogique a son propre code de rôle, CONSEILLER_PEDAGOGIQUE, pour ne
     jamais être confondu avec lui. */
  const NIVEAUX = NIVEAUX_MAT.concat(NIVEAUX_PRIM);
  const ROLES = ['ADMIN_MEMP', 'ADMIN_TECHNIQUE', 'DDEMP', 'CS', 'CONSEILLER_PEDAGOGIQUE',
    'DIRECTEUR', 'ENSEIGNANT', 'PARENT', 'ELEVE'];
  const ETATS = ['BON', 'PASSABLE', 'MAUVAIS', 'HORS_SERVICE'];
  /* Gestion collégiale de l'école : les instances et les rôles que l'on y tient. */
  const INSTANCES = ['COMITE_DIRECTION', 'CONSEIL_MAITRES', 'APE', 'AME', 'COMITE_SANTE', 'COMITE_CANTINE', 'AUTRE_INSTANCE'];
  /* Répertoire et calendrier de la circonscription. */
  const FONCTIONS_CONTACT = ['DIRECTEUR', 'DIRECTEUR_ADJOINT', 'ENSEIGNANT', 'CHEF_CS', 'CONSEILLER_PEDAGOGIQUE',
    'RESPONSABLE_UP', 'DDEMP', 'ELU_LOCAL', 'PRESIDENT_APE', 'PARTENAIRE', 'AUTRE'];
  const TYPES_EVENEMENT = ['RENTREE', 'VACANCES', 'FERIE', 'EXAMEN', 'REUNION', 'ANIMATION_PEDAGOGIQUE',
    'VISITE', 'FORMATION', 'CEREMONIE', 'AUTRE'];
  const ROLES_INSTANCE = ['PRESIDENT', 'VICE_PRESIDENT', 'SECRETAIRE', 'SECRETAIRE_ADJOINT', 'TRESORIER',
    'TRESORIER_ADJOINT', 'COMMISSAIRE_COMPTES', 'RAPPORTEUR', 'CONSEILLER', 'MEMBRE'];

  // Catégories des modules — utilisées pour regrouper l'écran « Tous les
  // modules » par grands pôles (comme l'application de gestion des CS),
  // au lieu d'une longue liste plate.
  const CATEGORIES_MODULES = [
    { code: 'ADMIN', nom: 'Socle & administration', icone: '\uE023', coul: '#2166AC' },
    { code: 'PEDAGOGIE', nom: 'Vie scolaire & pédagogie', icone: '\uE021', coul: '#008751' },
    { code: 'PATRIMOINE', nom: 'Patrimoine & ressources', icone: '\uE022', coul: '#B86400' },
    { code: 'FINANCES', nom: 'Finances', icone: '\uE04E', coul: '#A6790C' },
    { code: 'PILOTAGE', nom: 'Pilotage & suivi', icone: '\uE015', coul: '#7B4FA8' },
    { code: 'SYSTEME', nom: 'Système & exploitation', icone: '\uE058', coul: '#55616B' }
  ];

  // Modules métier (26 de la spécification + modules d'administration) — navigation « Plus »
  const MODULES = [
    { code: 'socle', cat: 'ADMIN', nom: 'Socle & référentiels', icone: '\uE023', entites: ['annees_scolaires', 'territoires', 'ecoles', 'classes', 'matieres', 'niveau_matieres', 'referentiels', 'rollover_jobs'],
      ecran: 'cloture', annexes: [['annuaire-ecoles', 'Annuaire des écoles', '\uE022']] },
    { code: 'espace-cs', cat: 'ADMIN', nom: 'Espace de la circonscription', icone: '\uE024', entites: [], ecran: 'espace-cs' },
    { code: 'personnel-cs', cat: 'ADMIN', nom: 'Personnel de la circonscription', icone: '\uE01C', entites: [], ecran: 'personnel-cs',
      annexes: [['personnel-cs/enseignants', 'Personnel enseignant', '\uE01C'], ['personnel-cs/administratif', 'Personnel administratif', '\uE011'],
        ['personnel-cs/ame', 'Enseignants ACDPCTD', '\uE01E'], ['personnel-cs/soutien', 'Personnel de soutien', '\uE04A']] },
    { code: 'statuts-personnel', cat: 'ADMIN', nom: 'Personnel par statut (FE, ACDPE, privé, ACDPCTD)', icone: '\uE04B', entites: ['signatures_categories'], ecran: 'statuts-cs',
      annexes: [['statuts-cs/fe', 'Personnel FE : directeurs et adjoints', '\uE01E'], ['statuts-cs/acdpe', 'Personnel ACDPE : directeurs et adjoints', '\uE01E'],
        ['statuts-cs/prive', 'Écoles privées : directeurs et adjoints', '\uE022'], ['statuts-cs/acdpctd', 'Enseignants ACDPCTD', '\uE01E'], ['statuts-cs/recap', 'Récapitulatif par école', '\uE015']] },
    { code: 'uascep', cat: 'ADMIN', nom: 'Bureaux UASCEP (école, UP, zone, CS, DDEMP)', icone: '\uE047', entites: [], ecran: 'uascep' },
    { code: 'pvs-sport', cat: 'PILOTAGE', nom: 'Sport scolaire (licences, compétitions, palmarès)', icone: '\uE04D', entites: [], ecran: 'pvs-sport' },
    { code: 'pvs-pilotage', cat: 'PILOTAGE', nom: 'Tableau de bord du pilotage (école → DDEMP)', icone: '\uE015', entites: [], ecran: 'pvs-pilotage' },
    { code: 'pvs-communication', cat: 'PILOTAGE', nom: 'Communication et alertes (notes, convocations, accusés, échéances, parents, agenda)', icone: '\uE050', entites: [], ecran: 'pvs-communication' },
    { code: 'pvs-sante', cat: 'PEDAGOGIE', nom: 'Santé et inclusion (visites médicales, infirmerie, besoins spécifiques, filles)', icone: '\uE07F', entites: [], ecran: 'pvs-sante' },
    { code: 'pvs-inspection', cat: 'PILOTAGE', nom: 'Formation et animations pédagogiques (plans, animations UP, attestations)', icone: '\uE082', entites: [], ecran: 'pvs-inspection' },
    { code: 'pvs-patrimoine', cat: 'PATRIMOINE', nom: 'Manuels, besoins et dotations (PV de réception)', icone: '\uE083', entites: [], ecran: 'pvs-patrimoine' },
    { code: 'pvs-territoire', cat: 'PILOTAGE', nom: 'Territoire et suivi administratif (fiche de rentrée, fiche signalétique, structures)', icone: '\uE048', entites: [], ecran: 'pvs-territoire' },
    { code: 'pvs-examens', cat: 'PEDAGOGIE', nom: 'Examens et concours (CEP : centres, jurys, notes, délibération ; concours)', icone: '\uE084', entites: [], ecran: 'pvs-examens' },
    { code: 'carrieres', cat: 'ADMIN', nom: 'Gestion des carrières', icone: '\uE016', entites: ['carrieres_personnel', 'affectations_personnel', 'diplomes_personnel', 'formations_personnel'], ecran: 'carrieres' },
    { code: 'scolarite-privee', cat: 'FINANCES', nom: 'Scolarité (école privée)', icone: '\uE020', entites: ['frais_scolarite', 'paiements_scolarite', 'remises_scolarite', 'declarations_paiement'], ecran: 'scolarite-privee',
      annexes: [['scolarite-privee/bareme', 'Barème et tranches', '\uE056'], ['scolarite-privee/paiements', 'Paiements et reçus', '\uE04E'],
        ['scolarite-privee/impayes', 'Impayés et relances', '\uE01A'], ['scolarite-privee/classes', 'Fonds reçus par classe', '\uE040']] },
    { code: 'caisse-privee', cat: 'FINANCES', nom: 'Cahier de gestion des fonds (école privée)', icone: '\uE030', entites: ['cahier_fonds'], ecran: 'caisse-privee',
      annexes: [['caisse-privee/cahier', 'Cahier de caisse', '\uE030'], ['caisse-privee/bilan', 'Bilan financier', '\uE015']] },
    { code: 'salaires-privee', cat: 'FINANCES', nom: 'Salaires des enseignants (école privée)', icone: '\uE04E', entites: ['salaires_ecole'], ecran: 'salaires-privee' },
    { code: 'divisions', cat: 'PILOTAGE', nom: 'Divisions et services (statistiques, courbes, plans d’action)', icone: '\uE023', entites: ['divisions_structure', 'lignes_action'], ecran: 'divisions' },
    { code: 'signatures', cat: 'PEDAGOGIE', nom: 'Signatures des acteurs', icone: '\uE029', entites: [], ecran: 'signatures' },
    { code: 'courriers', cat: 'ADMIN', nom: 'Archive des courriers', icone: '\uE04F', entites: ['courriers'], ecran: 'courriers' },
    { code: 'ecoles-cm2', cat: 'PILOTAGE', nom: 'Écoles à CM2 et CEP', icone: '\uE02E', entites: [], ecran: 'ecoles-cm2' },
    { code: 'ecarts-cs', cat: 'PILOTAGE', nom: 'Analyses et écarts', icone: '\uE016', entites: [], ecran: 'ecarts-cs' },
    { code: 'rapport-rentree', cat: 'PILOTAGE', nom: 'Rapports de rentrée', icone: '\uE00D', entites: [], ecran: 'rapport-rentree' },
    { code: 'stats-cs', cat: 'PILOTAGE', nom: 'Effectifs et personnel par école', icone: '\uE016', entites: ['statistiques_ecoles'], ecran: 'stats-cs' },
    { code: 'carte-ecole', cat: 'ADMIN', nom: 'Carte d’identité de l’école', icone: '\uE02B', entites: [], ecran: 'carte-ecole' },
    { code: 'unites-pedagogiques', cat: 'ADMIN', nom: 'Unités pédagogiques', icone: '\uE025', entites: [], ecran: 'unites-pedagogiques' },
    { code: 'repertoire', cat: 'ADMIN', nom: 'Répertoire et contacts', icone: '\uE012', entites: ['contacts'], ecran: 'repertoire' },
    { code: 'reseau', cat: 'ADMIN', nom: 'Écoles par circonscription', icone: '\uE048', entites: ['territoires', 'ecoles'], ecran: 'gestion-ecoles',
      annexes: [['import-ecoles', 'Importer les écoles d’une circonscription', '\uE00B'], ['annuaire-ecoles', 'Annuaire des écoles', '\uE022']] },
    { code: 'comptes', cat: 'ADMIN', nom: 'Comptes d’accès', icone: '\uE032', entites: ['users'], ecran: 'comptes',
      annexes: [['comptes/ecoles', 'Comptes des écoles', '\uE022'], ['comptes/enseignants', 'Comptes des enseignants', '\uE01E'],
        ['comptes/parents', 'Comptes des parents', '\uE01C'], ['comptes/eleves', 'Comptes des élèves', '\uE021']] },
    { code: 'classes-roles', cat: 'ADMIN', nom: 'Classes & rôles de gestion', icone: '\uE01E', entites: ['classes', 'membres_instances'], ecran: 'classes-roles',
      annexes: [['classes-roles/classes', 'Classes et titulaires', '\uE074'], ['classes-roles/roles', 'Rôles de gestion collégiale', '\uE044']] },
    { code: 'pedagogie', cat: 'PEDAGOGIE', nom: 'Pédagogie : fiches, résumés, épreuves et guides', icone: '\uE031', entites: [], ecran: 'pedagogie' },
    { code: 'declarations-paiement', cat: 'FINANCES', nom: 'Déclarations de paiement (parents, école privée)', icone: '\uE04E', entites: ['declarations_paiement'], ecran: 'declarations-paiement' },
    { code: 'bulletins-sec', cat: 'PEDAGOGIE', nom: 'Notes et bulletins du secondaire (6e à Tle)', icone: '\uE010', entites: ['eleves_sec', 'programme_sec', 'notes_sec'], ecran: 'bulletins-sec' },
    { code: 'maitre-semaine', cat: 'PEDAGOGIE', nom: 'Maître de semaine : planning, journal quotidien, rapport hebdomadaire', icone: '\uE004', entites: ['ms_planning', 'ms_journal'], ecran: 'maitre-semaine' },
    { code: 'vie-etablissement', cat: 'PEDAGOGIE', nom: 'Vie de l’établissement (secondaire) : professeurs, conseils, discipline, emplois du temps, stages', icone: '\uE054', entites: ['reg_sec'], ecran: 'vie-etablissement' },
    { code: 'ferme-ecole', cat: 'PEDAGOGIE', nom: 'Ferme-école (lycée agricole) : parcelles, cheptel, intrants, production', icone: '\uE00A', entites: ['reg_sec'], ecran: 'ferme-ecole' },
    { code: 'examens-sec', cat: 'PEDAGOGIE', nom: 'Examens BEPC / BAC : centres, candidats, statistiques', icone: '\uE00F', entites: ['reg_sec'], ecran: 'examens-sec' },
    { code: 'annonces-personnel', cat: 'PEDAGOGIE', nom: 'Annonces au personnel (accusé de lecture)', icone: '\uE050', entites: ['annonces_personnel'], ecran: 'annonces-personnel' },
    { code: 'zone-desheritee', cat: 'PEDAGOGIE', nom: 'Zone déshéritée : agents des postes orange et rouge, prime de zone', icone: '\uE047', entites: ['zone_desheritee'], ecran: 'zone-desheritee' },
    { code: 'releves-mensuels', cat: 'PEDAGOGIE', nom: 'Relevé mensuel des présences', icone: '\uE004', entites: ['presences'], ecran: 'releves-mensuels' },
    { code: 'pilotage-sec', cat: 'PEDAGOGIE', nom: 'Pilotage et enseignement technique (secondaire) : synoptique, identité, filières, ateliers', icone: '\uE00A', entites: ['reg_sec'], ecran: 'pilotage-sec' },
    { code: 'pedagogie-sec', cat: 'PEDAGOGIE', nom: 'Pédagogie du secondaire : fiches, épreuves APC, banque, langues', icone: '\uE031', entites: [], ecran: 'pedagogie-sec' },
    { code: 'docs-pedagogiques', cat: 'PEDAGOGIE', nom: 'Documents pédagogiques : cahiers, fichiers et cahiers de révision (PDF)', icone: '\uE031', entites: [], ecran: 'docs-pedagogiques' },
    { code: 'documents-officiels', cat: 'PEDAGOGIE', nom: 'Documents officiels (SCOLARIS / GESCOL)', icone: '\uE031', entites: [], ecran: 'documents-officiels' },
    { code: 'telechargements', cat: 'ADMIN', nom: 'Téléchargements', icone: '\uE009', entites: [], ecran: 'telechargements',
      annexes: [['telechargements/recensement', 'Fiches de recensement', '\uE040'], ['telechargements/fiches', 'Fiches à remplir', '\uE00E'],
        ['telechargements/certificats', 'Certificats et attestations', '\uE02F']] },
    { code: 'securite', cat: 'ADMIN', nom: 'Utilisateurs & sécurité', icone: '\uE033', entites: ['users', 'user_assignments', 'audit_events'] },
    { code: 'eleves', cat: 'PEDAGOGIE', nom: 'Élèves', icone: '\uE021', entites: ['eleves', 'eleve_handicaps', 'liens_eleves'], ecran: 'eleves' },
    { code: 'inscriptions', cat: 'PEDAGOGIE', nom: 'Inscriptions', icone: '\uE00F', entites: ['inscriptions_eleves', 'profils_annuels_eleves', 'statuts_scolarite', 'transferts_eleves', 'preinscriptions'] },
    { code: 'calendrier-scolaire', cat: 'PEDAGOGIE', nom: 'Calendrier scolaire', icone: '\uE017', entites: ['evenements_calendrier'], ecran: 'calendrier-scolaire',
      annexes: [['calendrier', 'Jours ouvrables (assiduité)', '\uE017']] },
    { code: 'carte-eleve', cat: 'PEDAGOGIE', nom: 'Carte d’identité de l’élève', icone: '\uE02B', entites: [], ecran: 'carte-eleve' },
    { code: 'fiche-cep', cat: 'PEDAGOGIE', nom: 'Fiche d’inscription au CEP', icone: '\uE02B', entites: [], ecran: 'fiche-cep' },
    { code: 'presences', cat: 'PEDAGOGIE', nom: 'Présences', icone: '\uE004', entites: ['presences', 'presences_personnel', 'calendriers_scolaires'], ecran: 'presences',
      annexes: [['registre-appel', 'Registre d’appel du mois', '\uE010'], ['calendrier', 'Calendrier scolaire', '\uE017'],
        ['releve-mensuel', 'Relevé mensuel de fréquentation', '\uE016'],
        ['bilan-presences', 'Bilan de présence par cours', '\uE015'], ['presences-personnel', 'Présence du personnel', '\uE01D']] },
    { code: 'evaluations', cat: 'PEDAGOGIE', nom: 'Évaluations & notes', icone: '\uE00E', entites: ['evaluations', 'notes', 'decisions_annuelles'], ecran: 'evaluations',
      annexes: [['synthese-officielle', 'Synthèse officielle de l’évaluation', '\uE02F'],
        ['synthese-evaluations', 'Panneau de pilotage des évaluations', '\uE016']] },
    { code: 'cep', cat: 'PEDAGOGIE', nom: 'CEP & examens blancs', icone: '\uE020', entites: ['examens_blancs', 'notes_examens_blancs', 'centres_examen', 'compositions_centre', 'fiches_cep', 'resultats_cep'],
      ecran: 'cep', annexes: [['cep-blanc-centre', 'Examen blanc en centre de circonscription', '\uE024']] },
    { code: 'personnel', cat: 'ADMIN', nom: 'Personnel', icone: '\uE01E', entites: ['personnels', 'carrieres_personnel', 'affectations_personnel', 'diplomes_personnel', 'formations_personnel', 'evaluations_personnel', 'participations_up', 'certificats_agents'],
      ecran: 'personnel', annexes: [['certificats', 'Certificats administratifs', '\uE02F']] },
    { code: 'cachets', cat: 'ADMIN', nom: 'Cachets & signatures', icone: '\uE006', entites: [], ecran: 'cachet' },
    { code: 'retraite', cat: 'ADMIN', nom: 'Retraite', icone: '\uE019', entites: ['regles_retraite', 'notifications_retraite'], ecran: 'retraite' },
    { code: 'infrastructure', cat: 'PATRIMOINE', nom: 'Infrastructures', icone: '\uE022', entites: ['infrastructures', 'accessibilite_infrastructure', 'inspections_infrastructure'], ecran: 'patrimoine' },
    { code: 'mobilier', cat: 'PATRIMOINE', nom: 'Mobilier', icone: '\uE028', entites: ['inventaires_mobilier', 'mouvements_mobilier'], ecran: 'patrimoine' },
    { code: 'didactique', cat: 'PATRIMOINE', nom: 'Matériel didactique', icone: '\uE031', entites: ['inventaires_equipements', 'ressources_pedagogiques'], ecran: 'patrimoine' },
    { code: 'services', cat: 'PATRIMOINE', nom: 'Services & structure', icone: '\uE06D', entites: ['services_ecole', 'structure_pedagogique'], ecran: 'patrimoine' },
    { code: 'cantine', cat: 'PEDAGOGIE', nom: 'Cantine', icone: '\uE05B', entites: ['cantines', 'participations_cantine'], ecran: 'cantine',
      annexes: [['cantine-paiements', 'Contributions et listes de paiement', '\uE04E']] },
    { code: 'budget', cat: 'FINANCES', nom: 'Budget', icone: '\uE04E', entites: ['budgets_ecoles', 'mouvements_budget', 'pieces_financieres'], ecran: 'budget' },
    { code: 'gouvernance', cat: 'PILOTAGE', nom: 'Gestion participative', icone: '\uE044', entites: ['gestion_participative', 'reunions_gestion', 'communication_resultats'], ecran: 'gouvernance' },
    { code: 'recensement', cat: 'PILOTAGE', nom: 'Recensement', icone: '\uE040', entites: ['campagnes_recensement', 'recensements_ecoles', 'recensement_valeurs', 'bilans_recensement'], ecran: 'recensement' },
    { code: 'parents', cat: 'PEDAGOGIE', nom: 'Portail parents', icone: '\uE01C', entites: ['profils_parents', 'liens_parent_enfant', 'communications_ecole', 'messages'], ecran: 'parents' },
    { code: 'risques', cat: 'PILOTAGE', nom: 'Risques & décrochage', icone: '\uE041', entites: ['modeles_risque', 'scores_risque', 'alertes_scolaires', 'accompagnements_eleves', 'actions_accompagnement'], ecran: 'risques' },
    { code: 'alertes', cat: 'PILOTAGE', nom: 'Centre d\'alertes', icone: '\uE055', entites: ['types_alertes', 'alertes', 'actions_alertes'], ecran: 'alertes' },
    { code: 'visites', cat: 'PILOTAGE', nom: 'Visites & recommandations', icone: '\uE042', entites: ['visites', 'observations_visites', 'recommandations', 'plans_amelioration', 'actions_plan_amelioration'], ecran: 'visites' },
    { code: 'documents', cat: 'ADMIN', nom: 'Documents & archives', icone: '\uE00D', entites: ['types_documents', 'documents', 'signatures_documents'], ecran: 'documents' },
    { code: 'analytics', cat: 'PILOTAGE', nom: 'Statistiques', icone: '\uE015', entites: ['statistiques_agregees', 'populations_scolarisables', 'definitions_indicateurs', 'projections'], ecran: 'analytics',
      annexes: [['affichage', 'Tableau d’affichage de classe', '\uE046']] },
    { code: 'rapports', cat: 'PILOTAGE', nom: 'Rapports', icone: '\uE011', entites: ['modeles_rapports', 'generations_rapports'], ecran: 'rapports' },
    { code: 'educmaster', cat: 'SYSTEME', nom: 'EDUCMaster & synchro', icone: '\uE058', entites: ['educmaster_sync_queue', 'conflits_synchronisation', 'rapprochements_eleves', 'fusions_eleves', 'device_sync_status'], ecran: 'educmaster' },
    { code: 'import-export', cat: 'SYSTEME', nom: 'Import et export', icone: '\uE06E', entites: [], ecran: 'import-export',
      annexes: [['import-export/export', 'Exporter des données', '\uE00C'], ['import-export/import', 'Importer des données', '\uE00B'],
        ['import-export/jeux', 'Jeux de données des circonscriptions', '\uE011'], ['import-export/personnel', 'Fichiers du personnel (FE, ACDPE, ACDPCTD)', '\uE01C'],
        ['import-export/sauvegarde', 'Sauvegarde et restauration', '\uE007']] },
    { code: 'support', cat: 'SYSTEME', nom: 'Support & exploitation', icone: '\uE052', entites: ['support_tickets', 'maintenances', 'feature_flags'] }
  ];

  const f = (n, l, t, extra) => Object.assign({ n, l, t: t || 'text' }, extra || {});

  /* Hiérarchie territoriale : pour chaque type, la liste des types de parent
     autorisés. Sert à filtrer le sélecteur « Rattaché à » du référentiel des
     territoires, et les listes en cascade du formulaire des écoles, pour que
     personne ne puisse rattacher un niveau au mauvais niveau par erreur. */
  const TERRITOIRE_PARENTS = {
    NATIONAL: [],
    DEPARTEMENT: ['NATIONAL'],
    COMMUNE: ['DEPARTEMENT'],
    ARRONDISSEMENT: ['COMMUNE'],
    VILLAGE_QUARTIER: ['ARRONDISSEMENT'],
    CIRCONSCRIPTION: ['DEPARTEMENT', 'COMMUNE'],
    ZONE_PEDAGOGIQUE: ['CIRCONSCRIPTION', 'DEPARTEMENT', 'COMMUNE'],
    UNITE_PEDAGOGIQUE: ['ZONE_PEDAGOGIQUE', 'CIRCONSCRIPTION']
  };

  const SCHEMA = {
    /* ---------------- SOCLE ---------------- */
    annees_scolaires: {
      label: 'Années scolaires', singulier: 'Année scolaire', icone: '\uE017',
      titre: r => r.code,
      champs: [
        f('code', 'Code', 'text', { req: 1, list: 1, ph: '2026-2027' }),
        f('date_debut', 'Début', 'date', { req: 1, list: 1 }),
        f('date_fin', 'Fin', 'date', { req: 1, list: 1 }),
        f('statut', 'Statut', 'select', { list: 1, o: ['PREPARATION', 'OUVERTE', 'CLOTURE_EN_COURS', 'CLOTUREE', 'ARCHIVEE'], def: 'PREPARATION' })
      ]
    },
    territoires: {
      label: 'Territoires', singulier: 'Territoire', icone: '\uE048',
      titre: r => r.nom,
      champs: [
        f('type', 'Type', 'select', { req: 1, list: 1, o: ['NATIONAL', 'DEPARTEMENT', 'COMMUNE', 'ARRONDISSEMENT', 'VILLAGE_QUARTIER', 'CIRCONSCRIPTION', 'ZONE_PEDAGOGIQUE', 'UNITE_PEDAGOGIQUE'] }),
        f('code', 'Code', 'text', { list: 1 }),
        f('nom', 'Nom', 'text', { req: 1, list: 1 }),
        f('responsable', 'Responsable (CCS, RUP, DDEMP)', 'text', { list: 1 }),
        f('responsable_telephone', 'Téléphone du responsable', 'text'),
        f('arrondissements_couverts', 'Arrondissements couverts (circonscription)', 'textarea'),
        f('nb_zones_prevues', 'Zones pédagogiques prévues (circonscription)', 'number', { min: 0 }),
        /* Cachet de la circonscription ou de la direction départementale : même modèle
           que celui des écoles (arc supérieur, centre, arc inférieur, encre). */
        f('cachet_haut', 'Cachet — texte de l’arc supérieur', 'text'),
        f('cachet_centre', 'Cachet — texte central', 'text'),
        f('cachet_bas', 'Cachet — texte de l’arc inférieur', 'text'),
        f('cachet_couleur', 'Cachet — couleur', 'select', { o: ['BLEU', 'ROUGE'], def: 'BLEU' }),
        /* Cachet rectangulaire du nom (griffe), comme SCOLARIS, GESCOL et MEMP-CP. */
        f('cachet_type', 'Cachet — forme apposée', 'select', { o: ['ROND_ET_GRIFFE', 'ROND', 'RECTANGULAIRE'], def: 'ROND_ET_GRIFFE' }),
        f('griffe_titre', 'Cachet rectangulaire — 1re ligne (titre)', 'text'),
        f('griffe_nom', 'Cachet rectangulaire — nom (vide : celui du responsable)', 'text'),
        f('griffe_ligne3', 'Cachet rectangulaire — 3e ligne (grade, qualité)', 'text'),
        /* Le sélecteur ne montre que les territoires dont le type peut être
           parent du type choisi ci-dessus : impossible de rattacher, par
           exemple, un arrondissement directement au pays. */
        f('parent_id', 'Rattaché à', 'ref', { ref: 'territoires', list: 1,
          casc: { typeChampSource: 'type', reglesParent: 'TERRITOIRE_PARENTS' } }),
        f('actif', 'Actif', 'bool', { def: true })
      ]
    },
    ecoles: {
      label: 'Écoles', singulier: 'École', icone: '\uE022',
      titre: r => r.nom,
      champs: [
        f('code_ecole', 'Code école', 'text', { req: 1, list: 1 }),
        f('nom', 'Nom', 'text', { req: 1, list: 1 }),
        f('cycle', 'Cycle', 'select', { req: 1, list: 1, o: ['MATERNELLE', 'PRIMAIRE', 'MIXTE'] }),

        /* Localisation administrative en cascade : département → commune →
           arrondissement → village/quartier de ville. Chaque niveau ne propose
           que les territoires rattachés au niveau choisi juste avant, ce qui
           rend impossible de rattacher une école au mauvais département, à la
           mauvaise commune ou au mauvais arrondissement. Un « + Ajouter… »
           permet de créer sur-le-champ un arrondissement ou un village/quartier
           qui n'existerait pas encore, toujours correctement rattaché. */
        f('departement_id', 'Département', 'ref', { ref: 'territoires', req: 1, list: 1,
          casc: { typeCible: 'DEPARTEMENT' } }),
        f('commune_id', 'Commune', 'ref', { ref: 'territoires', req: 1, list: 1,
          casc: { typeCible: 'COMMUNE', parentChamp: 'departement_id' } }),
        f('arrondissement_id', 'Arrondissement', 'ref', { ref: 'territoires',
          casc: { typeCible: 'ARRONDISSEMENT', parentChamp: 'commune_id' },
          ajoutRapide: { type: 'ARRONDISSEMENT', libelle: 'un arrondissement' } }),
        f('village_quartier_id', 'Village ou quartier de ville', 'ref', { ref: 'territoires',
          casc: { typeCible: 'VILLAGE_QUARTIER', parentChamp: 'arrondissement_id' },
          ajoutRapide: { type: 'VILLAGE_QUARTIER', libelle: 'un village ou quartier de ville' } }),
        f('territoire_id', 'Circonscription scolaire (CS)', 'ref', { ref: 'territoires', list: 1,
          casc: { typeCible: 'CIRCONSCRIPTION', ancetreChamp: 'departement_id', optionnelSansParent: true } }),
        /* Conservé pour les documents et exports existants : recalculé tout
           seul à partir de la commune choisie ci-dessus, jamais saisi. */
        f('commune', 'Commune', 'text', { derive: 1, deriveDe: 'commune_id' }),
        /* La zone se choisit parmi celles de la circonscription retenue ; tant
           qu'aucune circonscription n'est choisie, parmi celles du département.
           Même principe pour l'unité pédagogique, avec la zone en premier. */
        f('zone_id', 'Zone pédagogique', 'ref', { ref: 'territoires',
          casc: { typeCible: 'ZONE_PEDAGOGIQUE', ancetreChamp: ['territoire_id', 'departement_id'], optionnelSansParent: true } }),
        f('up_id', 'Unité pédagogique', 'ref', { ref: 'territoires',
          casc: { typeCible: 'UNITE_PEDAGOGIQUE', ancetreChamp: ['zone_id', 'territoire_id', 'departement_id'], ouEnfantDirectDe: 'territoire_id', optionnelSansParent: true } }),
        f('devise', 'Devise de l’école', 'text'),
        f('directeur_nom', 'Nom du directeur', 'text'),
        f('cachet_haut', 'Cachet — texte de l’arc supérieur', 'text'),
        f('cachet_centre', 'Cachet — texte central', 'text', { def: 'LE DIRECTEUR' }),
        f('cachet_bas', 'Cachet — texte de l’arc inférieur', 'text'),
        f('cachet_couleur', 'Cachet — couleur', 'select', { o: ['BLEU', 'ROUGE'], def: 'BLEU' }),
        /* Cachet rectangulaire du nom (griffe), comme SCOLARIS, GESCOL et MEMP-CP. */
        f('cachet_type', 'Cachet — forme apposée', 'select', { o: ['ROND_ET_GRIFFE', 'ROND', 'RECTANGULAIRE'], def: 'ROND_ET_GRIFFE' }),
        f('griffe_titre', 'Cachet rectangulaire — 1re ligne (titre)', 'text'),
        f('griffe_nom', 'Cachet rectangulaire — nom (vide : celui du responsable)', 'text'),
        f('griffe_ligne3', 'Cachet rectangulaire — 3e ligne (grade, qualité)', 'text'),
        f('directeur_telephone', 'Téléphone du directeur', 'text'),
        f('statut', 'Statut', 'select', { o: ['PUBLIQUE', 'PRIVEE', 'COMMUNAUTAIRE'] }),
        f('adresse', 'Adresse', 'text'),
        f('telephone', 'Téléphone', 'text'),
        f('email', 'E-mail', 'text'),
        f('latitude', 'Latitude', 'number'),
        f('longitude', 'Longitude', 'number'),
        f('photo', 'Photo de l’école', 'image'),

        /* Identification administrative — feuillet « Écoles primaires » du MEMP */
        f('type_ecole', 'Type', 'select', { o: ['ORDINAIRE', 'APPLICATION', 'INCLUSIVE', 'CONFESSIONNELLE'] }),
        f('region_pedagogique', 'Région pédagogique n°', 'text'),
        f('annee_creation', 'Année de création', 'number'),
        f('reference_creation', 'Référence de création', 'text'),
        f('annee_extension', 'Année de dernière extension', 'number'),
        f('reference_extension', 'Référence d’extension', 'text'),
        f('arrondissement', 'Arrondissement', 'text', { list: 1, derive: 1, deriveDe: 'arrondissement_id' }),
        f('village_quartier', 'Village ou quartier', 'text', { list: 1, derive: 1, deriveDe: 'village_quartier_id' }),
        f('bp', 'Boîte postale', 'text'),
        f('ville', 'Ville', 'text'),

        /* Environnement et accessibilité */
        f('distance_departement', 'Distance du chef-lieu de département (km)', 'number'),
        f('distance_commune', 'Distance du chef-lieu de commune (km)', 'number'),
        f('distance_arrondissement', 'Distance du chef-lieu d’arrondissement (km)', 'number'),
        f('distance_cs', 'Distance du bureau de la CS (km)', 'number'),
        f('distance_centre_sante', 'Distance du centre de santé (km)', 'number'),
        f('distance_marche', 'Distance du marché (km)', 'number'),
        f('acces_permanent', 'Accès permanent', 'bool'),
        f('periode_favorable', 'Période favorable d’accès', 'text'),
        f('inondable', 'École inondable', 'bool'),
        f('localite_electrifiee', 'Localité électrifiée', 'bool'),
        f('source_electricite', 'Source d’électricité', 'text'),
        f('source_eau', 'Source d’eau', 'text'),
        f('pollution', 'Environnement pollué', 'bool'),
        f('type_pollution', 'Type de pollution', 'text'),

        /* Domaine et équipements collectifs */
        f('titre_propriete', 'Titre de propriété', 'select', { o: ['OUI', 'NON', 'EN_COURS'] }),
        f('domaine_delimite', 'Domaine délimité', 'bool'),
        f('superficie_ha', 'Superficie du domaine (ha)', 'number'),
        f('cloture', 'Clôture', 'bool'),
        f('cour_ombragee', 'Cour ombragée', 'bool'),
        f('point_eau_potable', 'Point d’eau potable', 'bool'),
        f('lavage_mains', 'Dispositif de lavage des mains', 'bool'),
        f('cantine_fonctionnelle', 'Cantine fonctionnelle', 'bool'),
        f('magasin_vivres', 'Magasin de vivres en bon état', 'bool'),
        f('jardin_scolaire', 'Jardin ou champ scolaire', 'bool'),
        f('latrines_fonctionnelles', 'Latrines fonctionnelles', 'bool'),
        f('blocs_latrines', 'Blocs de latrines', 'number'),
        f('cabines_latrines', 'Cabines de latrines', 'number'),
        f('latrines_separees', 'Latrines séparées filles/garçons', 'bool'),
        f('latrines_handi', 'Latrines adaptées au handicap', 'bool'),
        f('bibliotheque', 'Bibliothèque fonctionnelle', 'bool'),
        f('nombre_ouvrages', 'Nombre d’ouvrages', 'number'),
        f('boite_pharmacie', 'Boîte à pharmacie', 'bool'),
        f('terrain_sport', 'Terrain de sport tracé', 'bool'),
        f('amenagements_handicap', 'Aménagements pour le handicap', 'bool'),

        /* Structure pédagogique */
        f('classes_autorisees', 'Classes autorisées', 'number'),
        f('classes_existantes', 'Classes ouvertes (simples + jumelées + multigrades)', 'number'),
        f('salles_existantes', 'Salles existantes', 'number'),
        f('salles_utilisees', 'Salles utilisées', 'number'),
        f('classes_simples', 'Classes simples', 'number'),
        f('classes_jumelees', 'Classes jumelées', 'number'),
        f('classes_multigrades', 'Classes multigrades', 'number'),

        /* Langues d'enseignement */
        f('langue_francais', 'Français', 'bool', { def: true }),
        f('langue_anglais', 'Anglais', 'bool'),
        f('langue_arabe', 'Arabe', 'bool'),
        f('langue_nationale', 'Langue nationale', 'bool'),
        f('langue_des_signes', 'Langue des signes', 'bool'),
        f('precision_langues', 'Précisions sur les langues', 'text'),

        /* Instances de gestion */
        f('ape', 'APE en place', 'bool'),
        f('ame', 'AME en place', 'bool'),
        f('comite_direction', 'Comité de direction', 'bool'),
        f('conseil_maitres', 'Conseil des maîtres', 'bool'),

        f('actif', 'Active', 'bool', { def: true })
      ]
    },
    classes: {
      label: 'Classes', singulier: 'Classe', icone: '\uE074',
      titre: r => r.libelle || r.code,
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', req: 1, annee: 1 }),
        f('niveau', 'Niveau', 'select', { req: 1, list: 1, o: NIVEAUX }),
        f('code', 'Code', 'text', { list: 1 }),
        f('libelle', 'Libellé', 'text', { list: 1 }),
        f('titulaire_id', 'Enseignant titulaire', 'ref', { ref: 'personnels', list: 1 }),
        f('regroupement', 'Classe jumelée / multigrade (cours regroupés, ex. CI-CP)', 'text', { aide: 'Même salle, même maître : une classe jumelée ou multigrade compte pour une seule classe ouverte. Laisser vide pour une classe simple.' }),
        f('effectif_max', 'Effectif maximum', 'number', { def: 60 }),
        f('actif', 'Active', 'bool', { def: true })
      ]
    },
    matieres: {
      label: 'Matières', singulier: 'Matière', icone: '\uE030',
      titre: r => r.nom,
      champs: [
        f('code', 'Code', 'text', { req: 1, list: 1 }),
        f('nom', 'Nom', 'text', { req: 1, list: 1 }),
        f('cycle', 'Cycle', 'select', { list: 1, o: CYCLES }),
        f('ordre', 'Ordre', 'number', { list: 1 }),
        f('actif', 'Active', 'bool', { def: true })
      ]
    },
    niveau_matieres: {
      label: 'Matières par niveau', singulier: 'Matière du niveau', icone: '\uE054',
      champs: [
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('niveau', 'Niveau', 'select', { req: 1, list: 1, o: NIVEAUX }),
        f('matiere_id', 'Matière', 'ref', { ref: 'matieres', req: 1, list: 1 }),
        f('coefficient', 'Coefficient', 'number', { def: 1, list: 1 }),
        f('obligatoire', 'Obligatoire', 'bool', { def: true })
      ]
    },
    rapprochements_eleves: {
      label: 'Rapprochements d’élèves', singulier: 'Rapprochement', icone: '\uE02A',
      champs: [
        f('eleve_local_id', 'Dossier examiné', 'ref', { ref: 'eleves', req: 1, list: 1 }),
        f('candidat_id', 'Dossier candidat', 'ref', { ref: 'eleves', list: 1 }),
        f('score', 'Ressemblance (%)', 'number', { list: 1 }),
        f('raisons', 'Critères concordants', 'json'),
        f('statut', 'Statut', 'select', { list: 1, o: ['A_EXAMINER', 'FUSIONNE', 'DISTINCTS'], def: 'A_EXAMINER' })
      ]
    },
    fusions_eleves: {
      label: 'Fusions de dossiers', singulier: 'Fusion', icone: '\uE07D', lectureSeule: true,
      champs: [
        f('eleve_source_id', 'Dossier absorbé', 'ref', { ref: 'eleves', list: 1 }),
        f('eleve_cible_id', 'Dossier conservé', 'ref', { ref: 'eleves', list: 1 }),
        f('justification', 'Justification', 'textarea', { list: 1 }),
        f('effectuee_par_label', 'Effectuée par', 'text', { list: 1 }),
        f('elements_deplaces', 'Éléments déplacés', 'json'),
        f('created_at', 'Date', 'datetime', { list: 1 })
      ]
    },
    rollover_jobs: {
      label: 'Clôtures d’année', singulier: 'Clôture', icone: '\uE058', lectureSeule: true,
      champs: [
        f('from_year_id', 'Année clôturée', 'ref', { ref: 'annees_scolaires', list: 1 }),
        f('to_year_id', 'Année ouverte', 'ref', { ref: 'annees_scolaires', list: 1 }),
        f('statut', 'Statut', 'select', { list: 1, o: ['EN_COURS', 'TERMINE', 'ECHEC'] }),
        f('current_step', 'Étape', 'text', { list: 1 }),
        f('progress', 'Avancement (%)', 'number', { list: 1 }),
        f('resume', 'Résumé', 'json'),
        f('completed_at', 'Terminée le', 'datetime', { list: 1 })
      ]
    },
    referentiels: {
      label: 'Référentiels', singulier: 'Référentiel', icone: '\uE030',
      titre: r => r.nom,
      champs: [
        f('code', 'Code', 'text', { req: 1, list: 1 }),
        f('nom', 'Nom', 'text', { req: 1, list: 1 }),
        f('domaine', 'Domaine', 'text', { list: 1 }),
        f('version', 'Version', 'text', { list: 1 }),
        f('statut', 'Statut', 'select', { list: 1, o: ['BROUILLON', 'EN_REVUE', 'APPROUVE', 'PUBLIE', 'RETIRE'], def: 'BROUILLON' }),
        f('date_effet', 'Date d\'effet', 'date'),
        f('contenu', 'Contenu', 'json'),
        f('reference_officielle', 'Référence officielle', 'textarea')
      ]
    },

    /* ---------------- SÉCURITÉ ---------------- */
    users: {
      label: 'Utilisateurs', singulier: 'Utilisateur', icone: '\uE01D',
      titre: r => (r.nom || '') + ' ' + (r.prenoms || ''),
      champs: [
        f('identifiant', 'Identifiant', 'text', { req: 1, list: 1 }),
        f('nom', 'Nom', 'text', { req: 1, list: 1 }),
        f('prenoms', 'Prénoms', 'text', { list: 1 }),
        f('role', 'Rôle', 'select', { req: 1, list: 1, o: ROLES }),
        f('ecole_id', 'École', 'ref', { ref: 'ecoles' }),
        f('territoire_id', 'Territoire', 'ref', { ref: 'territoires' }),
        f('telephone', 'Téléphone', 'text'),
        f('email', 'E-mail', 'text'),
        f('personnel_id', 'Agent (compte d’enseignant)', 'ref', { ref: 'personnels' }),
        f('classe_id', 'Classe tenue (compte d’enseignant)', 'ref', { ref: 'classes' }),
        f('niveaux_sec', 'Niveaux du secondaire (ex. 6e, 5e, Tle)', 'text'),
        f('cours_ped', 'Cours ouverts en préparation de classe (ex. CI, CP) — facultatif', 'text'),
        f('matieres_sec', 'Matières du secondaire (ex. Français, SVT)', 'text'),
        f('eleve_id', 'Élève (compte d’élève)', 'ref', { ref: 'eleves' }),
        f('mot_de_passe', 'Mot de passe (réinitialiser)', 'password'),
        f('doit_changer_mdp', 'Doit choisir un nouveau mot de passe à la connexion', 'bool'),
        f('actif', 'Actif', 'bool', { def: true, list: 1 })
      ]
    },
    user_assignments: {
      label: 'Affectations de rôle', singulier: 'Affectation', icone: '\uE032',
      champs: [
        f('user_id', 'Utilisateur', 'ref', { ref: 'users', req: 1, list: 1 }),
        f('role', 'Rôle', 'select', { req: 1, list: 1, o: ROLES }),
        f('ecole_id', 'École', 'ref', { ref: 'ecoles' }),
        f('territoire_id', 'Territoire', 'ref', { ref: 'territoires' }),
        f('date_debut', 'Début', 'date', { list: 1 }),
        f('date_fin', 'Fin', 'date'),
        f('actif', 'Active', 'bool', { def: true })
      ]
    },
    audit_events: {
      label: 'Journal d\'audit', singulier: 'Événement', icone: '\uE04B', lectureSeule: true,
      champs: [
        f('occurred_at', 'Horodatage', 'datetime', { list: 1 }),
        f('user_label', 'Utilisateur', 'text', { list: 1 }),
        f('action', 'Action', 'text', { list: 1 }),
        f('entity_type', 'Entité', 'text', { list: 1 }),
        f('entity_id', 'Identifiant', 'text'),
        f('metadata', 'Détails', 'json')
      ]
    },

    /* ---------------- ÉLÈVES ---------------- */
    eleves: {
      label: 'Élèves', singulier: 'Élève', icone: '\uE021',
      titre: r => (r.nom || '').toUpperCase() + ' ' + (r.prenoms || ''),
      champs: [
        f('nom', 'Nom', 'text', { req: 1, list: 1 }),
        f('prenoms', 'Prénoms', 'text', { req: 1, list: 1 }),
        f('sexe', 'Sexe', 'select', { req: 1, list: 1, o: ['M', 'F'] }),
        f('date_naissance', 'Date de naissance', 'date', { list: 1 }),
        f('date_naissance_precision', 'Précision de la date', 'select', { o: ['EXACTE', 'APPROXIMATIVE', 'INCONNUE'], def: 'EXACTE' }),
        f('lieu_naissance', 'Lieu de naissance', 'text'),
        f('acte_naissance', 'Acte de naissance', 'bool'),
        f('npi', 'NPI (numéro personnel d’identification)', 'text', { list: 1 }),
        f('matricule_ecole', 'Numéro matricule de l’école', 'text', { list: 1 }),
        f('nom_pere', 'Nom et prénoms du père', 'text'),
        f('nom_mere', 'Nom et prénoms de la mère', 'text'),
        f('tuteur_nom', 'Tuteur (si différent des parents)', 'text'),
        f('tuteur_telephone', 'Téléphone des parents ou du tuteur', 'text'),
        f('adresse_parents', 'Adresse des parents', 'text'),
        f('photo', 'Photo de l’élève (appareil photo ou fichier)', 'image'),
        f('commune_naissance', 'Commune de naissance', 'text'),
        f('educmaster_matricule', 'Matricule EDUCMaster', 'text', { list: 1 }),
        f('educmaster_statut', 'Statut EDUCMaster', 'select', { o: ['NON_SYNCHRONISE', 'EN_ATTENTE', 'SYNCHRONISE', 'CONFLIT', 'REJETE'], def: 'NON_SYNCHRONISE' }),
        f('nationalite', 'Nationalité', 'text', { def: 'Béninoise' }),
        f('statut_identite', 'Statut', 'select', { o: ['ACTIF', 'FUSIONNE', 'INACTIF'], def: 'ACTIF' })
      ]
    },
    eleve_handicaps: {
      label: 'Situations de handicap', singulier: 'Situation de handicap', icone: '\uE06F',
      champs: [
        f('eleve_id', 'Élève', 'ref', { ref: 'eleves', req: 1, list: 1 }),
        f('type', 'Type', 'select', { req: 1, list: 1, o: ['MOTEUR', 'VISUEL', 'AUDITIF', 'INTELLECTUEL', 'AUTRE'] }),
        f('precision_autre', 'Précision', 'text'),
        f('amenagements', 'Aménagements prévus', 'textarea'),
        f('actif', 'Actif', 'bool', { def: true })
      ]
    },
    liens_eleves: {
      label: 'Liens entre élèves', singulier: 'Lien', icone: '\uE053',
      champs: [
        f('eleve_id', 'Élève', 'ref', { ref: 'eleves', req: 1, list: 1 }),
        f('autre_eleve_id', 'Autre élève', 'ref', { ref: 'eleves', req: 1, list: 1 }),
        f('type', 'Type', 'select', { o: ['FRERE_SOEUR', 'AUTRE'], list: 1 }),
        f('confirme', 'Confirmé', 'bool')
      ]
    },

    /* ---------------- INSCRIPTIONS ---------------- */
    inscriptions_eleves: {
      label: 'Inscriptions', singulier: 'Inscription', icone: '\uE00F',
      champs: [
        f('eleve_id', 'Élève', 'ref', { ref: 'eleves', req: 1, list: 1 }),
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', req: 1, annee: 1 }),
        f('cycle', 'Cycle', 'select', { req: 1, o: CYCLES }),
        f('niveau', 'Niveau', 'select', { req: 1, list: 1, o: NIVEAUX }),
        f('classe_id', 'Classe', 'ref', { ref: 'classes', list: 1 }),
        f('type_inscription', 'Type', 'select', { req: 1, o: ['NOUVELLE', 'REINSCRIPTION', 'TRANSFERT_ENTRANT'], def: 'NOUVELLE' }),
        f('redoublant', 'Redoublant', 'bool', { list: 1 }),
        f('a_suivi_maternelle', 'A suivi la maternelle', 'bool'),
        f('date_inscription', 'Date d\'inscription', 'date', { req: 1 }),
        f('statut', 'Statut', 'select', { list: 1, o: ['ACTIF', 'TRANSFERE', 'ABANDON', 'SORTIE_PRIMAIRE_CEP', 'CLOTURE'], def: 'ACTIF' }),
        f('principale', 'Inscription principale', 'bool', { def: true })
      ]
    },
    profils_annuels_eleves: {
      label: 'Profils annuels', singulier: 'Profil annuel', icone: '\uE060',
      champs: [
        f('inscription_id', 'Inscription', 'ref', { ref: 'inscriptions_eleves', req: 1, list: 1 }),
        f('orphelin', 'Orphelin', 'bool', { list: 1 }),
        f('vulnerable', 'Vulnérable', 'bool', { list: 1 }),
        f('etranger', 'Étranger', 'bool'),
        f('venu_autre_ecole', 'Vient d\'une autre école', 'bool')
      ]
    },
    transferts_eleves: {
      label: 'Transferts', singulier: 'Transfert', icone: '\uE057',
      champs: [
        f('eleve_id', 'Élève', 'ref', { ref: 'eleves', req: 1, list: 1 }),
        f('ecole_origine_id', 'École d\'origine', 'ref', { ref: 'ecoles', req: 1, list: 1 }),
        f('ecole_destination_id', 'École de destination', 'ref', { ref: 'ecoles', req: 1, list: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('motif', 'Motif', 'text'),
        f('statut', 'Statut', 'select', { list: 1, o: ['DEMANDE', 'ACCEPTE', 'REFUSE', 'ANNULE', 'TERMINE'], def: 'DEMANDE' })
      ]
    },
    statuts_scolarite: {
      label: 'Statuts de scolarité', singulier: 'Statut de scolarité', icone: '\uE02C',
      champs: [
        f('inscription_id', 'Inscription', 'ref', { ref: 'inscriptions_eleves', req: 1, list: 1 }),
        f('statut', 'Statut', 'select', { req: 1, list: 1, o: ['SCOLARISE', 'RISQUE_DECROCHAGE', 'DECROCHAGE_CONFIRME', 'ABANDON', 'TRANSFERE', 'SORTIE_PRIMAIRE_CEP', 'SITUATION_INCONNUE'] }),
        f('source', 'Source', 'text', { list: 1 }),
        f('date_statut', 'Date du constat', 'date', { req: 1, list: 1 }),
        f('motif', 'Motif', 'textarea')
      ]
    },
    preinscriptions: {
      label: 'Préinscriptions', singulier: 'Préinscription', icone: '\uE04F',
      champs: [
        f('eleve_id', 'Élève', 'ref', { ref: 'eleves', req: 1, list: 1 }),
        f('annee_scolaire_id', 'Année visée', 'ref', { ref: 'annees_scolaires', list: 1 }),
        f('ecole_destination_id', 'École proposée', 'ref', { ref: 'ecoles', list: 1 }),
        f('niveau_origine', 'Niveau d\'origine', 'select', { o: NIVEAUX }),
        f('niveau_propose', 'Niveau proposé', 'select', { o: NIVEAUX, list: 1 }),
        f('decision_origine', 'Décision d\'origine', 'text'),
        f('statut', 'Statut', 'select', { list: 1, o: ['PROPOSEE', 'CONFIRMEE', 'EXPIREE', 'ANNULEE'], def: 'PROPOSEE' })
      ]
    },

    /* ---------------- PRÉSENCES ---------------- */
    presences: {
      label: 'Présences', singulier: 'Présence', icone: '\uE004',
      champs: [
        f('inscription_id', 'Inscription', 'ref', { ref: 'inscriptions_eleves', req: 1, list: 1 }),
        f('date_presence', 'Date', 'date', { req: 1, list: 1 }),
        f('periode', 'Demi-journée', 'select', { list: 1, o: ['MATIN', 'APRES_MIDI', 'JOURNEE'], def: 'MATIN' }),
        f('statut', 'Statut', 'select', { req: 1, list: 1, o: ['PRESENT', 'ABSENT', 'RETARD'] }),
        f('justifie', 'Justifié', 'bool', { list: 1 }),
        f('motif_justification', 'Motif', 'text'),
        f('commentaire', 'Commentaire', 'textarea')
      ]
    },
    calendriers_scolaires: {
      label: 'Calendrier scolaire', singulier: 'Jour du calendrier', icone: '\uE017',
      champs: [
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('cycle', 'Cycle', 'select', { o: CYCLES, list: 1 }),
        f('date_jour', 'Date', 'date', { req: 1, list: 1 }),
        f('ouvrable', 'Jour ouvrable', 'bool', { def: true, list: 1 }),
        f('coefficient', 'Coefficient', 'number', { def: 1 }),
        f('motif', 'Motif', 'text', { list: 1 })
      ]
    },

    /* ---------------- ÉVALUATIONS ---------------- */
    evaluations: {
      label: 'Évaluations', singulier: 'Évaluation', icone: '\uE00E',
      titre: r => (r.libelle || ('Évaluation ' + r.numero)),
      champs: [
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', req: 1, annee: 1 }),
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('niveau', 'Niveau', 'select', { req: 1, list: 1, o: NIVEAUX }),
        f('classe_id', 'Classe', 'ref', { ref: 'classes', list: 1 }),
        f('numero', 'Numéro (1 à 9)', 'number', { req: 1, list: 1, min: 1, max: 9 }),
        f('type_evaluation', 'Type', 'select', { list: 1, o: ['FORMATIVE', 'SOMMATIVE', 'CERTIFICATIVE'], def: 'SOMMATIVE' }),
        f('mois', 'Mois', 'number', { min: 1, max: 12 }),
        f('libelle', 'Libellé', 'text', { list: 1 }),
        f('statut', 'Statut', 'select', { list: 1, o: ['BROUILLON', 'OUVERTE', 'VALIDEE', 'VERROUILLEE'], def: 'BROUILLON' })
      ]
    },
    notes: {
      label: 'Notes', singulier: 'Note', icone: '\uE040',
      champs: [
        f('evaluation_id', 'Évaluation', 'ref', { ref: 'evaluations', req: 1, list: 1 }),
        f('inscription_id', 'Inscription', 'ref', { ref: 'inscriptions_eleves', req: 1, list: 1 }),
        f('matiere_id', 'Matière', 'ref', { ref: 'matieres', req: 1, list: 1 }),
        f('note', 'Note /20', 'number', { list: 1, min: 0, max: 20, step: 0.25 }),
        f('statut_special', 'Statut particulier', 'select', { o: ['', 'DISPENSE', 'ABSENT', 'NON_NOTE'] })
      ]
    },
    decisions_annuelles: {
      label: 'Décisions annuelles', singulier: 'Décision', icone: '\uE03F',
      champs: [
        f('inscription_id', 'Inscription', 'ref', { ref: 'inscriptions_eleves', req: 1, list: 1 }),
        f('decision_pedagogique', 'Décision pédagogique', 'select', { list: 1, o: ['PASSAGE', 'REDOUBLEMENT', 'SORTIE_PRIMAIRE'] }),
        f('decision_finale', 'Décision finale', 'select', { list: 1, o: ['PASSAGE', 'REDOUBLEMENT', 'SORTIE_PRIMAIRE'] }),
        f('motif', 'Motif', 'text', { list: 1 }),
        f('force_par_cep', 'Forcée par le CEP', 'bool', { list: 1 }),
        f('regle_version', 'Version de règle', 'text'),
        f('statut', 'Statut', 'select', { o: ['BROUILLON', 'A_CONFIRMER', 'VALIDEE', 'VERROUILLEE'], def: 'BROUILLON' })
      ]
    },

    /* ---------------- CEP ---------------- */
    presences_personnel: {
      label: 'Présences du personnel', singulier: 'Présence d’un agent', icone: '\uE018',
      champs: [
        f('personnel_id', 'Agent', 'ref', { ref: 'personnels', req: 1, list: 1 }),
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', scope: 1 }),
        f('date_jour', 'Date', 'date', { req: 1, list: 1 }),
        f('statut', 'Statut', 'select', { req: 1, list: 1, o: ['PRESENT', 'ABSENT', 'RETARD', 'MISSION', 'CONGE', 'FORMATION', 'MALADIE'] }),
        f('justifie', 'Justifié', 'bool', { list: 1 }),
        f('motif', 'Motif', 'text', { list: 1 }),
        f('heure_arrivee', 'Heure d’arrivée', 'text'),
        f('reference_acte', 'Référence de l’acte', 'text')
      ]
    },
    centres_examen: {
      label: 'Centres d’examen blanc', singulier: 'Centre', icone: '\uE027',
      titre: r => r.nom,
      champs: [
        f('nom', 'Centre de composition', 'text', { req: 1, list: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('territoire_id', 'Circonscription', 'ref', { ref: 'territoires', list: 1 }),
        f('commune', 'Commune', 'text', { list: 1 }),
        f('chef_centre', 'Chef de centre', 'text', { list: 1 }),
        f('date_composition', 'Date de composition', 'date', { list: 1 }),
        f('numero', 'Numéro de l’épreuve blanche', 'number', { def: 1, list: 1 }),
        f('statut', 'Statut', 'select', { list: 1, o: ['PREPARATION', 'OUVERT', 'CORRIGE', 'VALIDE', 'VERROUILLE'], def: 'PREPARATION' })
      ]
    },
    compositions_centre: {
      label: 'Compositions en centre', singulier: 'Composition', icone: '\uE006',
      champs: [
        f('centre_id', 'Centre', 'ref', { ref: 'centres_examen', req: 1, list: 1 }),
        f('inscription_id', 'Candidat', 'ref', { ref: 'inscriptions_eleves', req: 1, list: 1 }),
        f('ecole_id', 'École de provenance', 'ref', { ref: 'ecoles', list: 1 }),
        f('numero_ordre', 'N° d’ordre', 'number', { list: 1 }),
        f('notes', 'Notes par épreuve', 'json'),
        f('total', 'Total', 'number', { list: 1 }),
        f('moyenne', 'Moyenne', 'number', { list: 1 }),
        f('maitrises', 'Nombre de maîtrises', 'number', { list: 1 }),
        f('rang', 'Rang', 'number', { list: 1 }),
        f('absent', 'Absent', 'bool', { list: 1 })
      ]
    },
    examens_blancs: {
      label: 'Examens blancs', singulier: 'Examen blanc', icone: '\uE05F',
      titre: r => 'Examen blanc n°' + (r.numero || 1),
      champs: [
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('niveau', 'Niveau', 'select', { o: ['CM2'], def: 'CM2', list: 1 }),
        f('numero', 'Numéro', 'number', { def: 1, list: 1 }),
        f('date_examen', 'Date', 'date', { list: 1 }),
        f('statut', 'Statut', 'select', { list: 1, o: ['BROUILLON', 'OUVERT', 'VALIDE', 'VERROUILLE'], def: 'BROUILLON' })
      ]
    },
    notes_examens_blancs: {
      label: 'Notes d\'examens blancs', singulier: 'Note d\'examen blanc', icone: '\uE04B',
      champs: [
        f('examen_id', 'Examen', 'ref', { ref: 'examens_blancs', req: 1, list: 1 }),
        f('inscription_id', 'Inscription', 'ref', { ref: 'inscriptions_eleves', req: 1, list: 1 }),
        f('matiere_id', 'Matière', 'ref', { ref: 'matieres', req: 1, list: 1 }),
        f('note', 'Note /20', 'number', { list: 1, min: 0, max: 20 }),
        f('dispense', 'Dispensé', 'bool')
      ]
    },
    fiches_cep: {
      label: 'Fiches d’inscription au CEP', singulier: 'Fiche d’inscription', icone: '\uE070',
      champs: [
        f('inscription_id', 'Candidat', 'ref', { ref: 'inscriptions_eleves', req: 1, list: 1 }),
        f('session', 'Session', 'text', { list: 1, ph: 'JUIN 2027' }),
        f('centre', 'Centre de composition', 'text', { list: 1 }),
        f('option_6e', 'Option CEP + entrée en 6ᵉ', 'bool', { list: 1, def: true }),
        f('etablissement_1', 'Établissement choisi 1', 'text'),
        f('etablissement_2', 'Établissement choisi 2', 'text'),
        f('etablissement_3', 'Établissement choisi 3', 'text'),
        f('residence_parents', 'Résidence des parents', 'text', { list: 1 }),
        f('dispense_age', 'Dispense d’âge', 'bool', { list: 1 }),
        f('dispense_sport', 'Dispense de sport', 'bool', { list: 1 }),
        f('parent_nom', 'Nom et prénom du parent', 'text'),
        f('parent_contact', 'Contact du parent', 'text'),
        f('degre_parente', 'Degré de parenté', 'text'),
        f('dossier_etudie_par', 'Dossier étudié par (DDEMP)', 'text'),
        f('code_ddemp', 'Code DDEMP', 'text'),
        f('collationne_par', 'Collationné par', 'text'),
        f('statut', 'Statut', 'select', { list: 1, o: ['BROUILLON', 'COMPLETE', 'TRANSMISE'], def: 'BROUILLON' })
      ]
    },
    resultats_cep: {
      label: 'Résultats CEP', singulier: 'Résultat CEP', icone: '\uE020',
      champs: [
        f('inscription_id', 'Inscription', 'ref', { ref: 'inscriptions_eleves', req: 1, list: 1 }),
        f('numero_table', 'Numéro de table', 'text', { list: 1 }),
        f('inscrit', 'Inscrit', 'bool', { list: 1 }),
        f('a_compose', 'A composé', 'bool', { list: 1 }),
        f('admis', 'Admis', 'bool', { list: 1 }),
        f('statut', 'Statut', 'select', { req: 1, list: 1, o: ['BROUILLON', 'PROVISOIRE', 'OFFICIEL'], def: 'BROUILLON' }),
        f('source', 'Source', 'text'),
        f('date_publication', 'Date de publication', 'date')
      ]
    },

    /* ---------------- PERSONNEL ---------------- */
    personnels: {
      label: 'Personnel', singulier: 'Agent', icone: '\uE01E',
      titre: r => (r.nom || '').toUpperCase() + ' ' + (r.prenoms || ''),
      champs: [
        f('matricule', 'Matricule', 'text', { list: 1 }),
        f('nip', 'NIP (numéro d’identification personnel)', 'text', { list: 1 }),
        f('nom', 'Nom', 'text', { req: 1, list: 1 }),
        f('prenoms', 'Prénoms', 'text', { req: 1, list: 1 }),
        f('sexe', 'Sexe', 'select', { o: ['M', 'F'], list: 1 }),
        f('date_naissance', 'Date de naissance', 'date', { req: 1, list: 1 }),
        f('lieu_naissance', 'Lieu de naissance', 'text'),
        f('telephone', 'Téléphone', 'text', { list: 1 }),
        f('email', 'E-mail', 'text'),
        f('photo', 'Photo de l’agent (appareil photo ou fichier)', 'image'),
        f('ecole_id', 'École d\'affectation', 'ref', { ref: 'ecoles', scope: 1 }),
        f('fonction', 'Fonction', 'select', { list: 1, o: ['DIRECTEUR', 'ENSEIGNANT', 'CONSEILLER_PEDAGOGIQUE', 'CS', 'ADMINISTRATIF', 'SOUTIEN', 'AUTRE'] }),
        f('categorie', 'Catégorie', 'select', { list: 1, o: ['A1', 'A2', 'A3', 'B1', 'C1'] }),
        f('echelon', 'Échelon', 'number', { min: 1, max: 15, list: 1 }),
        f('date_premiere_prise_service', 'Première prise de service', 'date'),
        f('date_arrivee_poste', 'Arrivée au poste', 'date'),
        f('adresse', 'Adresse', 'text'),
        f('situation_familiale', 'Situation familiale', 'select', { o: ['CELIBATAIRE', 'MARIE', 'DIVORCE', 'VEUF'] }),
        f('situation_militaire', 'Situation militaire', 'text'),
        f('diplome_recrutement', 'Diplôme de recrutement', 'text'),
        f('diplome_plus_eleve', 'Diplôme le plus élevé', 'text'),
        f('grade', 'Grade', 'text'),
        f('echelle', 'Échelle', 'text'),
        f('indice_reel', 'Indice réel', 'number'),
        f('emploi', 'Emploi', 'text'),
        f('qualite', 'Qualité', 'text'),
        f('contrat_initial', 'Contrat initial', 'text'),
        f('contrat_renouvele', 'Contrat renouvelé', 'text'),
        f('contrat_indetermine', 'Contrat à durée indéterminée', 'text'),
        f('avenant', 'Avenant', 'text'),
        f('langue_des_signes', 'Langue des signes', 'bool'),
        f('ecriture_braille', 'Écriture braille', 'bool'),
        f('pedagogie_inclusive', 'Pédagogie inclusive', 'bool'),
        f('ph', 'Personne handicapée', 'bool'),
        f('salaire_mensuel', 'Salaire mensuel convenu (école privée, FCFA)', 'number', { min: 0 }),
        f('actif', 'En activité', 'bool', { def: true })
      ]
    },
    carrieres_personnel: {
      label: 'Carrière', singulier: 'Événement de carrière', icone: '\uE016',
      champs: [
        f('personnel_id', 'Agent', 'ref', { ref: 'personnels', req: 1, list: 1 }),
        f('type_acte', 'Nature de l’acte', 'select', { list: 1, o: ['RECRUTEMENT', 'TITULARISATION', 'AVANCEMENT_ECHELON', 'PROMOTION_GRADE', 'RECLASSEMENT',
          'MUTATION', 'DETACHEMENT', 'DISPONIBILITE', 'MISE_A_DISPOSITION', 'REPRISE_SERVICE', 'CONGE', 'DISTINCTION', 'SANCTION', 'ADMISSION_RETRAITE', 'AUTRE'] }),
        f('statut_code', 'Statut', 'select', { o: ['FE', 'ACDPE', 'ACDPCTD', 'APE', 'ACE', 'CONTRACTUEL_ETAT', 'COMMUNAUTAIRE', 'AUTRE'], list: 1 }),
        f('categorie', 'Catégorie', 'select', { o: ['A1', 'A2', 'A3', 'B1', 'C1'], list: 1 }),
        f('echelon', 'Échelon', 'number', { min: 1, max: 15, list: 1 }),
        f('grade', 'Grade', 'text'),
        f('indice_reel', 'Indice réel', 'number'),
        f('date_effet', 'Date d\'effet', 'date', { req: 1, list: 1 }),
        f('reference_acte', 'Référence de l\'acte', 'text'),
        f('observations', 'Observations', 'textarea')
      ]
    },
    affectations_personnel: {
      label: 'Affectations', singulier: 'Affectation', icone: '\uE02D',
      champs: [
        f('personnel_id', 'Agent', 'ref', { ref: 'personnels', req: 1, list: 1 }),
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', list: 1, scope: 1 }),
        f('classe_id', 'Classe', 'ref', { ref: 'classes', list: 1 }),
        f('fonction', 'Fonction', 'text', { req: 1, list: 1 }),
        f('date_debut', 'Début', 'date', { req: 1, list: 1 }),
        f('date_fin', 'Fin', 'date'),
        f('reference_acte', 'Référence de l\'acte', 'text')
      ]
    },
    certificats_agents: {
      label: 'Certificats délivrés', singulier: 'Certificat', icone: '\uE00D',
      champs: [
        f('personnel_id', 'Agent', 'ref', { ref: 'personnels', req: 1, list: 1 }),
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', scope: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('modele', 'Modèle', 'text', { req: 1, list: 1 }),
        f('champs', 'Renseignements saisis', 'json'),
        f('delivre_par_label', 'Délivré par', 'text', { list: 1 })
      ]
    },
    diplomes_personnel: {
      label: 'Diplômes', singulier: 'Diplôme', icone: '\uE02F',
      champs: [
        f('personnel_id', 'Agent', 'ref', { ref: 'personnels', req: 1, list: 1 }),
        f('type', 'Type', 'select', { o: ['ACADEMIQUE', 'PROFESSIONNEL'], list: 1 }),
        f('libelle', 'Libellé', 'text', { req: 1, list: 1, sug: ['BEPC','BAC A','BAC B','BAC C','BAC D','BAC E/F/G','DUT','BTS','Licence','Master','Doctorat','CEAP','CAP','BAPES (secondaire, 1er cycle)','CAPES (secondaire, 2nd cycle)','CAPET (enseignement technique)','CAPEPS (EPS)','CAPEN (écoles normales)'], ph: 'Choisir dans la liste ou saisir' }),
        f('annee_obtention', 'Année d\'obtention', 'number', { list: 1 }),
        f('principal', 'Principal', 'bool')
      ]
    },
    formations_personnel: {
      label: 'Formations', singulier: 'Formation', icone: '\uE02E',
      champs: [
        f('personnel_id', 'Agent', 'ref', { ref: 'personnels', req: 1, list: 1 }),
        f('type', 'Type', 'select', { o: ['INITIALE', 'CONTINUE', 'RECYCLAGE', 'UNITE_PEDAGOGIQUE'], list: 1 }),
        f('intitule', 'Intitulé', 'text', { list: 1 }),
        f('date_debut', 'Début', 'date', { list: 1 }),
        f('date_fin', 'Fin', 'date'),
        f('organisme', 'Organisme', 'text')
      ]
    },
    evaluations_personnel: {
      label: 'Évaluations du personnel', singulier: 'Évaluation d\'agent', icone: '\uE05D',
      champs: [
        f('personnel_id', 'Agent', 'ref', { ref: 'personnels', req: 1, list: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('periode_debut', 'Période du', 'date', { list: 1 }),
        f('periode_fin', 'au', 'date', { list: 1 }),
        f('objectifs', 'Objectifs de la période', 'textarea'),
        f('resultats', 'Résultats de la période', 'textarea'),
        f('contraintes', 'Contraintes et difficultés', 'textarea'),
        f('notes_hierarchique', 'Notes du supérieur hiérarchique', 'json'),
        f('notes_comite', 'Notes du comité de direction', 'json'),
        f('note_proposee', 'Note proposée', 'number', { list: 1 }),
        f('note_hierarchique', 'Note hiérarchique', 'number'),
        f('note_finale', 'Note finale', 'number', { list: 1 }),
        f('observations', 'Observations', 'textarea'),
        f('statut', 'Statut', 'select', { list: 1, o: ['BROUILLON', 'SOUMISE', 'CONTRESIGNEE', 'VERROUILLEE'], def: 'BROUILLON' })
      ]
    },
    participations_up: {
      label: 'Unités pédagogiques', singulier: 'Participation UP', icone: '\uE01C',
      champs: [
        f('personnel_id', 'Agent', 'ref', { ref: 'personnels', req: 1, list: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('nombre_up_total', 'UP organisées', 'number', { list: 1 }),
        f('nombre_participations', 'Participations', 'number', { list: 1 })
      ]
    },

    /* ---------------- RETRAITE ---------------- */
    regles_retraite: {
      label: 'Règles de retraite', singulier: 'Règle de retraite', icone: '\uE061',
      titre: r => r.categorie + ' — ' + r.age_retraite + ' ans',
      champs: [
        f('categorie', 'Catégorie', 'select', { req: 1, list: 1, o: ['A1', 'A2', 'A3', 'B1', 'C1'] }),
        f('echelon_min', 'Échelon minimum', 'number', { def: 1, list: 1 }),
        f('echelon_max', 'Échelon maximum', 'number', { def: 12, list: 1 }),
        f('age_retraite', 'Âge de départ', 'number', { req: 1, list: 1 }),
        f('date_effet', 'Date d\'effet', 'date', { list: 1 }),
        f('reference_reglementaire', 'Référence réglementaire', 'text'),
        f('actif', 'Active', 'bool', { def: true })
      ]
    },
    notifications_retraite: {
      label: 'Notifications de retraite', singulier: 'Notification', icone: '\uE045',
      champs: [
        f('personnel_id', 'Agent', 'ref', { ref: 'personnels', req: 1, list: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('type_notification', 'Type', 'select', { o: ['ANNUELLE', 'J_365', 'J_180', 'J_90', 'J_30'], list: 1 }),
        f('date_retraite_prevue', 'Date prévue', 'date', { list: 1 }),
        f('annees_restantes', 'Années restantes', 'number', { list: 1 }),
        f('message', 'Message', 'textarea'),
        f('statut', 'Statut', 'select', { list: 1, o: ['PLANIFIE', 'EN_COURS', 'ENVOYE', 'LIVRE', 'ECHEC', 'ANNULE'], def: 'PLANIFIE' })
      ]
    },

    /* ---------------- PATRIMOINE ---------------- */
    infrastructures: {
      label: 'Infrastructures', singulier: 'Local', icone: '\uE022',
      titre: r => r.designation || r.code_local || r.type_local,
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('code_local', 'Code du local', 'text', { list: 1 }),
        f('type_local', 'Type', 'select', { req: 1, list: 1, o: ['SALLE_CLASSE', 'BUREAU', 'MAGASIN', 'CANTINE', 'LATRINES', 'BIBLIOTHEQUE', 'LOGEMENT', 'AUTRE'] }),
        f('designation', 'Désignation', 'text', { list: 1 }),
        f('annee_mise_service', 'Année de mise en service', 'number'),
        f('superficie_m2', 'Superficie (m²)', 'number'),
        f('utilise', 'Utilisé', 'bool', { def: true }),
        f('nature_murs', 'Nature des murs', 'select', { o: ['DUR', 'SEMI_DUR', 'BANCO', 'PAILLE', 'AUTRE'] }),
        f('etat_murs', 'État des murs', 'select', { o: ETATS, list: 1 }),
        f('nature_toit', 'Nature du toit', 'select', { o: ['TOLE', 'DALLE', 'PAILLE', 'AUTRE'] }),
        f('etat_toit', 'État du toit', 'select', { o: ETATS }),
        f('etat_portes', 'État des portes', 'select', { o: ETATS }),
        f('etat_fenetres', 'État des fenêtres', 'select', { o: ETATS }),
        f('financeur', 'Financeur', 'text'),
        f('observations', 'Observations', 'textarea')
      ]
    },
    accessibilite_infrastructure: {
      label: 'Accessibilité', singulier: 'Fiche d\'accessibilité', icone: '\uE06F',
      champs: [
        f('infrastructure_id', 'Local', 'ref', { ref: 'infrastructures', req: 1, list: 1 }),
        f('rampe', 'Rampe d\'accès', 'bool', { list: 1 }),
        f('antiderapante', 'Surface antidérapante', 'bool'),
        f('main_courante', 'Main courante', 'bool'),
        f('inclinaison_moins_5', 'Inclinaison < 5 %', 'bool'),
        f('porte_adaptee', 'Porte adaptée', 'bool', { list: 1 }),
        f('circulation_fauteuil', 'Circulation en fauteuil', 'bool', { list: 1 }),
        f('observations', 'Observations', 'textarea')
      ]
    },
    inspections_infrastructure: {
      label: 'Inspections de locaux', singulier: 'Inspection', icone: '\uE02A',
      champs: [
        f('infrastructure_id', 'Local', 'ref', { ref: 'infrastructures', req: 1, list: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('etat_global', 'État global', 'select', { o: ETATS, list: 1 }),
        f('observations', 'Observations', 'textarea'),
        f('inspecte_at', 'Date d\'inspection', 'date', { list: 1 })
      ]
    },
    inventaires_mobilier: {
      label: 'Inventaire du mobilier', singulier: 'Ligne d\'inventaire', icone: '\uE028',
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('type_mobilier', 'Type', 'select', { req: 1, list: 1, o: ['TABLE_BANC', 'CHAISE', 'TABLE_MAITRE', 'ARMOIRE', 'ETAGERE', 'TABLEAU', 'NATTE', 'AUTRE'] }),
        f('niveau', 'Niveau', 'select', { o: NIVEAUX, list: 1 }),
        f('quantite', 'Quantité', 'number', { list: 1 }),
        f('bon_etat', 'En bon état', 'number', { list: 1 }),
        f('a_reparer', 'À réparer', 'number'),
        f('hors_service', 'Hors service', 'number'),
        f('adapte', 'Adapté au handicap', 'bool'),
        f('confirme', 'Confirmé', 'bool')
      ]
    },
    mouvements_mobilier: {
      label: 'Mouvements de mobilier', singulier: 'Mouvement', icone: '\uE062',
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('type_mobilier', 'Type', 'text', { req: 1, list: 1 }),
        f('type_mouvement', 'Mouvement', 'select', { req: 1, list: 1, o: ['ENTREE', 'TRANSFERT_ENTRANT', 'TRANSFERT_SORTANT', 'REPARATION', 'REFORME', 'PERTE', 'CORRECTION'] }),
        f('quantite', 'Quantité', 'number', { req: 1, list: 1 }),
        f('date_mouvement', 'Date', 'date', { req: 1, list: 1 }),
        f('provenance_destination', 'Provenance / destination', 'text'),
        f('reference_document', 'Référence du document', 'text'),
        f('commentaire', 'Commentaire', 'textarea')
      ]
    },
    inventaires_equipements: {
      label: 'Équipements', singulier: 'Équipement', icone: '\uE052',
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('categorie', 'Catégorie', 'select', { req: 1, list: 1, o: ['ORDINAIRE', 'ADAPTE', 'INFORMATIQUE', 'SPORTIF'] }),
        f('code_equipement', 'Équipement', 'text', { req: 1, list: 1 }),
        f('quantite', 'Quantité', 'number', { list: 1 }),
        f('bon_etat', 'En bon état', 'number', { list: 1 }),
        f('mauvais_etat', 'En mauvais état', 'number'),
        f('adapte', 'Adapté au handicap', 'bool')
      ]
    },
    ressources_pedagogiques: {
      label: 'Ressources pédagogiques', singulier: 'Ressource', icone: '\uE031',
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('categorie', 'Catégorie', 'select', { req: 1, list: 1, o: ['PROGRAMME', 'GUIDE', 'MANUEL', 'BRAILLE', 'AUTRE'] }),
        f('code_ressource', 'Ressource', 'text', { req: 1, list: 1 }),
        f('cours', 'Cours', 'select', { o: NIVEAUX, list: 1 }),
        f('quantite', 'Quantité', 'number', { list: 1 }),
        f('adapte_handicap', 'Adaptée au handicap', 'bool')
      ]
    },
    services_ecole: {
      label: 'Services de l\'école', singulier: 'Fiche de services', icone: '\uE06D',
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1, list: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('eau_potable', 'Eau potable', 'bool', { list: 1 }),
        f('eau_forage', 'Forage', 'bool'),
        f('eau_puits', 'Puits', 'bool'),
        f('electricite', 'Électricité', 'bool', { list: 1 }),
        f('solaire', 'Solaire', 'bool'),
        f('cantine', 'Cantine', 'bool', { list: 1 }),
        f('latrines', 'Latrines', 'bool', { list: 1 }),
        f('nb_blocs_latrines', 'Blocs de latrines', 'number'),
        f('nb_cabines_latrines', 'Cabines', 'number'),
        f('latrines_separees_fg', 'Latrines séparées filles/garçons', 'bool'),
        f('latrines_handicap', 'Latrines accessibles', 'bool'),
        f('lavage_mains', 'Dispositif de lavage des mains', 'bool')
      ]
    },
    structure_pedagogique: {
      label: 'Structure pédagogique', singulier: 'Ligne de structure', icone: '\uE063',
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('cycle', 'Cycle', 'select', { o: CYCLES, list: 1 }),
        f('niveau', 'Niveau', 'select', { o: NIVEAUX, list: 1 }),
        f('structure', 'Structure', 'select', { o: ['SIMPLE', 'JUMELEE', 'MULTIGRADE'], list: 1 }),
        f('nombre', 'Nombre', 'number', { list: 1 })
      ]
    },

    /* ---------------- CANTINE / BUDGET / GOUVERNANCE ---------------- */
    cantines: {
      label: 'Cantines', singulier: 'Cantine', icone: '\uE05B',
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1, list: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('fonctionnelle', 'Fonctionnelle', 'bool', { list: 1 }),
        f('tarif_repas', 'Contribution par repas', 'money', { list: 1, def: 0 }),
        f('organisme_soutien', 'Organisme de soutien', 'text', { list: 1 }),
        f('equipement_cuisine', 'Équipement de cuisine', 'bool'),
        f('magasin_vivres_bon_etat', 'Magasin de vivres en bon état', 'bool'),
        f('responsable', 'Responsable', 'text')
      ]
    },
    participations_cantine: {
      label: 'Repas servis', singulier: 'Participation', icone: '\uE05B',
      champs: [
        f('inscription_id', 'Inscription', 'ref', { ref: 'inscriptions_eleves', req: 1, list: 1 }),
        f('date_repas', 'Date', 'date', { req: 1, list: 1 }),
        f('a_mange', 'A mangé', 'bool', { list: 1 }),
        f('montant', 'Contribution due', 'money', { list: 1 }),
        f('paye', 'Réglée', 'bool', { list: 1 }),
        f('date_paiement', 'Date de règlement', 'date')
      ]
    },
    budgets_ecoles: {
      label: 'Budgets', singulier: 'Budget', icone: '\uE04E',
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1, list: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1, list: 1 }),
        f('budget_execute_precedent', 'Budget exécuté (n-1)', 'money'),
        f('solde_exercice_anterieur', 'Solde antérieur', 'money', { list: 1 }),
        f('subvention_etat', 'Subvention de l\'État', 'money', { list: 1 }),
        f('cotisation_parents', 'Cotisations des parents', 'money', { list: 1 }),
        f('autres_ressources', 'Autres ressources', 'money'),
        f('statut', 'Statut', 'select', { list: 1, o: ['BROUILLON', 'SOUMIS', 'VALIDE', 'VERROUILLE'], def: 'BROUILLON' })
      ]
    },
    mouvements_budget: {
      label: 'Mouvements budgétaires', singulier: 'Mouvement', icone: '\uE030',
      champs: [
        f('budget_id', 'Budget', 'ref', { ref: 'budgets_ecoles', req: 1, list: 1 }),
        f('type', 'Type', 'select', { req: 1, list: 1, o: ['SUBVENTION_ETAT', 'COTISATION_PARENT', 'AUTRE_RESSOURCE', 'DEPENSE', 'AJUSTEMENT'] }),
        f('categorie', 'Catégorie', 'text'),
        f('libelle', 'Libellé', 'text', { req: 1, list: 1 }),
        f('montant', 'Montant', 'money', { req: 1, list: 1 }),
        f('date_operation', 'Date', 'date', { req: 1, list: 1 }),
        f('reference_piece', 'Référence de la pièce', 'text'),
        f('commentaire', 'Commentaire', 'textarea')
      ]
    },
    pieces_financieres: {
      label: 'Pièces financières', singulier: 'Pièce', icone: '\uE04B',
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', scope: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('type_piece', 'Type', 'text', { list: 1 }),
        f('numero_piece', 'Numéro', 'text', { list: 1 }),
        f('date_piece', 'Date', 'date', { list: 1 }),
        f('fichier_nom', 'Fichier', 'text')
      ]
    },
    gestion_participative: {
      label: 'Gestion participative', singulier: 'Fiche de gouvernance', icone: '\uE044',
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1, list: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('ape_existe', 'APE constituée', 'bool', { list: 1 }),
        f('ape_fonctionnel', 'APE fonctionnelle', 'bool', { list: 1 }),
        f('ame_existe', 'AME constituée', 'bool'),
        f('comite_direction', 'Comité de direction', 'bool'),
        f('conseil_maitres', 'Conseil des maîtres', 'bool'),
        f('comite_sante', 'Comité de santé', 'bool'),
        f('nombre_reunions_ape', 'Réunions APE', 'number', { list: 1 }),
        f('nombre_ag', 'Assemblées générales', 'number'),
        f('projet_ecole_verte', 'Projet école verte', 'bool')
      ]
    },
    reunions_gestion: {
      label: 'Réunions', singulier: 'Réunion', icone: '\uE035',
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('type', 'Type', 'select', { list: 1, o: ['REUNION_APE', 'AG', 'AME', 'COMITE_DIRECTION', 'CONSEIL_MAITRES', 'AUTRE'] }),
        f('date_reunion', 'Date', 'date', { req: 1, list: 1 }),
        f('nombre_participants', 'Participants', 'number', { list: 1 }),
        f('objet', 'Objet', 'text', { list: 1 }),
        f('compte_rendu', 'Compte rendu', 'textarea'),
        f('budget_aborde', 'Budget abordé', 'bool'),
        f('resultats_abordes', 'Résultats abordés', 'bool')
      ]
    },
    contacts: {
      label: 'Répertoire et contacts', singulier: 'Contact', icone: '\uE012',
      titre: r => ((r.nom || '') + ' ' + (r.prenoms || '')).trim(),
      champs: [
        f('nom', 'Nom', 'text', { req: 1, list: 1 }),
        f('prenoms', 'Prénoms', 'text', { list: 1 }),
        f('fonction', 'Fonction', 'select', { req: 1, list: 1, o: FONCTIONS_CONTACT, def: 'AUTRE' }),
        f('structure', 'Structure ou service', 'text', { list: 1, ph: 'Mairie, bureau de la CS, école…' }),
        f('departement_id', 'Département', 'ref', { ref: 'territoires', casc: { typeCible: 'DEPARTEMENT' } }),
        f('commune_id', 'Commune', 'ref', { ref: 'territoires', req: 1, list: 1,
          casc: { typeCible: 'COMMUNE', parentChamp: 'departement_id' } }),
        f('territoire_id', 'Circonscription scolaire (CS)', 'ref', { ref: 'territoires', req: 1, list: 1,
          casc: { typeCible: 'CIRCONSCRIPTION', ancetreChamp: 'departement_id', optionnelSansParent: true } }),
        f('ecole_id', 'École (si la personne y travaille)', 'ref', { ref: 'ecoles' }),
        f('telephone', 'Téléphone', 'text', { list: 1 }),
        f('telephone2', 'Autre téléphone', 'text'),
        f('whatsapp', 'Joignable sur WhatsApp', 'bool'),
        f('email', 'E-mail', 'text'),
        f('notes', 'Notes', 'textarea'),
        f('actif', 'Actif', 'bool', { def: true })
      ]
    },
    evenements_calendrier: {
      label: 'Événements du calendrier scolaire', singulier: 'Événement', icone: '\uE017',
      titre: r => r.titre,
      champs: [
        f('titre', 'Titre', 'text', { req: 1, list: 1 }),
        f('type', 'Type', 'select', { req: 1, list: 1, o: TYPES_EVENEMENT, def: 'AUTRE' }),
        f('date_debut', 'Du', 'date', { req: 1, list: 1 }),
        f('date_fin', 'Au (laisser vide pour un seul jour)', 'date', { list: 1 }),
        f('cycle', 'Cycle', 'select', { o: ['ENSEMBLE', 'MATERNELLE', 'PRIMAIRE'], def: 'ENSEMBLE' }),
        f('territoire_id', 'Circonscription concernée', 'ref', { ref: 'territoires', list: 1 }),
        f('lieu', 'Lieu', 'text'),
        f('description', 'Détails', 'textarea'),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 })
      ]
    },
    membres_instances: {
      label: 'Membres des instances de gestion', singulier: 'Membre d’instance', icone: '\uE01C',
      titre: r => (r.nom_complet || '') + (r.role ? ' — ' + r.role : ''),
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('instance', 'Instance', 'select', { req: 1, list: 1, o: INSTANCES }),
        f('role', 'Rôle dans l’instance', 'select', { req: 1, list: 1, o: ROLES_INSTANCE, def: 'MEMBRE' }),
        f('personnel_id', 'Agent de l’école', 'ref', { ref: 'personnels', list: 1 }),
        f('nom_complet', 'Nom et prénoms (si la personne n’est pas un agent)', 'text', { list: 1 }),
        f('telephone', 'Téléphone', 'text', { list: 1 }),
        f('date_debut', 'Début du mandat', 'date'),
        f('date_fin', 'Fin du mandat', 'date'),
        f('actif', 'En fonction', 'bool', { def: true })
      ]
    },
    communication_resultats: {
      label: 'Communication des résultats', singulier: 'Fiche de communication', icone: '\uE050',
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1, list: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('carnet_correspondance', 'Carnet de correspondance', 'bool', { list: 1 }),
        f('assemblee_generale', 'Assemblée générale', 'bool', { list: 1 }),
        f('reunion_ape', 'Réunion APE', 'bool'),
        f('echange_parent', 'Échange direct avec le parent', 'bool'),
        f('precision_autre', 'Autre moyen', 'text')
      ]
    },

    /* ---------------- RECENSEMENT & STATS ---------------- */
    campagnes_recensement: {
      label: 'Campagnes de recensement', singulier: 'Campagne', icone: '\uE040',
      titre: r => (r.type || '') + ' ' + (r.version_formulaire || ''),
      champs: [
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1, list: 1 }),
        f('type', 'Type', 'select', { req: 1, list: 1, o: ['MATERNELLE', 'PRIMAIRE'] }),
        f('date_reference_age', 'Date de référence pour l\'âge', 'date', { req: 1 }),
        f('date_ouverture', 'Ouverture', 'date', { list: 1 }),
        f('date_cloture', 'Clôture', 'date', { list: 1 }),
        f('version_formulaire', 'Version du formulaire', 'text'),
        f('statut', 'Statut', 'select', { list: 1, o: ['BROUILLON', 'OUVERTE', 'CLOTUREE', 'VERROUILLEE'], def: 'BROUILLON' })
      ]
    },
        /* Archive des courriers d'une circonscription ou d'une direction : registre des courriers reçus et
       envoyés, avec numéro d'ordre, objet, correspondant, suivi et pièce jointe (image ou PDF). */
    courriers: {
      label: 'Archive des courriers', singulier: 'Courrier', icone: '\uE04F',
      titre: r => (r.reference ? r.reference + ' — ' : '') + (r.objet || ''),
      champs: [
        f('territoire_id', 'Circonscription scolaire (CS)', 'ref', { ref: 'territoires', req: 1, list: 1 }),
        f('ecole_id', 'École concernée', 'ref', { ref: 'ecoles', scope: 1 }),
        f('sens', 'Sens', 'select', { req: 1, list: 1, o: ['ARRIVEE', 'DEPART'], def: 'ARRIVEE' }),
        f('reference', 'N° d’ordre', 'text', { list: 1 }),
        f('date_courrier', 'Date du courrier', 'date', { req: 1, list: 1 }),
        f('objet', 'Objet', 'text', { req: 1, list: 1 }),
        f('correspondant', 'Expéditeur ou destinataire', 'text', { list: 1 }),
        f('categorie', 'Catégorie', 'select', { list: 1, o: ['ADMINISTRATIF', 'PEDAGOGIQUE', 'PERSONNEL', 'FINANCIER', 'STATISTIQUES', 'AUTRE'], def: 'ADMINISTRATIF' }),
        f('statut', 'Suivi', 'select', { list: 1, o: ['A_TRAITER', 'TRAITE', 'CLASSE'], def: 'A_TRAITER' }),
        f('observations', 'Observations', 'textarea'),
        f('fichier_nom', 'Pièce jointe', 'text'),
        f('fichier_type', 'Type de la pièce jointe', 'text'),
        f('fichier_donnees', 'Contenu de la pièce jointe', 'text')
      ]
    },

    /* ---------------- PERSONNEL PAR STATUT : SIGNATURE DE CATÉGORIE ---------------- */
    divisions_structure: {
      label: 'Divisions et services (chefs, attributions)', singulier: 'Division', icone: '\uE023',
      titre: r => (r.sigle || r.division_code || '') + ' — ' + (r.chef_nom || ''),
      champs: [
        f('territoire_id', 'Circonscription ou département', 'ref', { ref: 'territoires', req: 1, list: 1 }),
        f('division_code', 'Code de la division', 'text', { req: 1, list: 1 }),
        f('sigle', 'Sigle', 'text', { list: 1 }),
        f('chef_nom', 'Chef de la division', 'text', { list: 1 }),
        f('chef_titre', 'Titre du signataire', 'text'),
        f('chef_telephone', 'Téléphone', 'text'),
        f('attributions', 'Attributions (texte officiel)', 'textarea'),
        f('article_aof', 'Article de l’AOF', 'text')
      ]
    },
    lignes_action: {
      label: 'Lignes d’action des divisions', singulier: 'Ligne d’action', icone: '\uE02E',
      titre: r => r.libelle,
      champs: [
        f('territoire_id', 'Circonscription ou département', 'ref', { ref: 'territoires', req: 1, list: 1 }),
        f('division_code', 'Division', 'text', { req: 1, list: 1 }),
        f('annee_code', 'Année scolaire', 'text', { req: 1, list: 1 }),
        f('libelle', 'Ligne d’action (attribution)', 'textarea', { req: 1, list: 1 }),
        f('indicateur', 'Indicateur', 'text'),
        f('cible', 'Cible', 'text'),
        f('echeance', 'Échéance', 'date'),
        f('responsable', 'Responsable', 'text'),
        f('etat', 'État', 'select', { list: 1, o: ['PREVUE', 'EN_COURS', 'REALISEE', 'REPORTEE'], def: 'PREVUE' }),
        f('taux', 'Taux de réalisation (%)', 'number', { min: 0, max: 100 }),
        f('observations', 'Observations', 'textarea')
      ]
    },
    signatures_categories: {
      label: 'Signatures des catégories', singulier: 'Signature de catégorie', icone: '\uE029',
      titre: r => (r.categorie || '') + ' — ' + (r.signataire_nom || ''),
      champs: [
        f('territoire_id', 'Circonscription scolaire (CS)', 'ref', { ref: 'territoires', req: 1, list: 1 }),
        f('categorie', 'Catégorie', 'select', { req: 1, list: 1, o: ['FE', 'ACDPE', 'PRIVE', 'ACDPCTD', 'ENSEMBLE'] }),
        f('signataire_nom', 'Nom du signataire', 'text', { list: 1 }),
        f('signataire_qualite', 'Qualité du signataire', 'text', { list: 1 }),
        f('signature_image', 'Signature numérique', 'image')
      ]
    },

    /* ---------------- ÉCOLES PRIVÉES : SCOLARITÉ, CAISSE, SALAIRES ---------------- */
    frais_scolarite: {
      label: 'Frais de scolarité (barème)', singulier: 'Barème de scolarité', icone: '\uE056',
      titre: r => 'Scolarité ' + (r.niveau || ''),
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', req: 1, annee: 1 }),
        f('niveau', 'Cours', 'select', { req: 1, list: 1, o: NIVEAUX }),
        f('frais_inscription', 'Droits d’inscription (FCFA)', 'number', { min: 0, list: 1, def: 0 }),
        f('tranche_1', '1re tranche (FCFA)', 'number', { min: 0, list: 1, def: 0 }),
        f('date_limite_1', 'Date limite de la 1re tranche', 'date'),
        f('tranche_2', '2e tranche (FCFA)', 'number', { min: 0, list: 1, def: 0 }),
        f('date_limite_2', 'Date limite de la 2e tranche', 'date'),
        f('tranche_3', '3e tranche (FCFA)', 'number', { min: 0, list: 1, def: 0 }),
        f('date_limite_3', 'Date limite de la 3e tranche', 'date')
      ]
    },
    remises_scolarite: {
      label: 'Remises et exonérations', singulier: 'Remise de scolarité', icone: '\uE071',
      titre: r => 'Remise de ' + (r.montant || 0) + ' FCFA',
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', req: 1, annee: 1 }),
        f('inscription_id', 'Élève (inscription)', 'ref', { ref: 'inscriptions_eleves', req: 1, list: 1 }),
        f('montant', 'Montant de la remise (FCFA)', 'number', { req: 1, min: 0, list: 1 }),
        f('motif', 'Motif (fratrie, orphelin, bourse…)', 'text', { list: 1 })
      ]
    },
    paiements_scolarite: {
      label: 'Paiements de scolarité', singulier: 'Paiement de scolarité', icone: '\uE04E',
      titre: r => (r.numero_recu || 'Reçu') + ' — ' + (r.montant || 0) + ' FCFA',
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', req: 1, annee: 1 }),
        f('inscription_id', 'Élève (inscription)', 'ref', { ref: 'inscriptions_eleves', req: 1, list: 1 }),
        f('tranche', 'Versement', 'select', { req: 1, list: 1, o: ['INSCRIPTION', 'TRANCHE_1', 'TRANCHE_2', 'TRANCHE_3', 'RESTE'], def: 'TRANCHE_1' }),
        f('montant', 'Montant (FCFA)', 'number', { req: 1, min: 1, list: 1 }),
        f('date_paiement', 'Date du paiement', 'date', { req: 1, list: 1 }),
        f('mode', 'Mode de paiement', 'select', { list: 1, o: ['ESPECES', 'MOBILE_MONEY', 'VIREMENT', 'CHEQUE'], def: 'ESPECES' }),
        f('numero_recu', 'N° du reçu', 'text', { list: 1 }),
        f('reference', 'Référence (transaction, chèque)', 'text'),
        f('observations', 'Observations', 'text')
      ]
    },
    eleves_sec: {
      label: 'Élèves du secondaire', singulier: 'Élève du secondaire', icone: '\uE01F',
      titre: r => ((r.nom || '') + ' ' + (r.prenoms || '')).trim(),
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', req: 1, annee: 1 }),
        f('classe', 'Classe', 'text', { req: 1, list: 1 }),
        f('niveau', 'Niveau', 'select', { req: 1, list: 1, o: ['6e', '5e', '4e', '3e', '2nde', '1ère', 'Tle'] }),
        f('serie', 'Série', 'text'),
        f('nom', 'Nom', 'text', { req: 1, list: 1 }), f('prenoms', 'Prénoms', 'text', { list: 1 }),
        f('sexe', 'Sexe', 'text'), f('matricule', 'Matricule', 'text')
      ]
    },
    programme_sec: {
      label: 'Programme du secondaire', singulier: 'Coefficient', icone: '\uE054',
      titre: r => r.matiere + ' (' + r.niveau + ')',
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', req: 1, annee: 1 }),
        f('niveau', 'Niveau', 'text', { req: 1, list: 1 }), f('serie', 'Série', 'text'),
        f('matiere', 'Matière', 'text', { req: 1, list: 1 }), f('coefficient', 'Coefficient', 'number', { list: 1, min: 0 })
      ]
    },
    notes_sec: {
      label: 'Notes du secondaire', singulier: 'Note', icone: '\uE040',
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', req: 1, annee: 1 }),
        f('eleve_sec_id', 'Élève', 'ref', { ref: 'eleves_sec', req: 1, list: 1 }),
        f('matiere', 'Matière', 'text', { req: 1, list: 1 }), f('periode', 'Période', 'text', { req: 1, list: 1 }),
        f('evaluation', 'Évaluation', 'text', { list: 1 }), f('valeur', 'Note /20', 'number', { list: 1, min: 0, max: 20, step: 0.25 }),
        f('dispense', 'Dispensé / absent', 'bool'), f('saisi_par', 'Saisi par', 'text')
      ]
    },
    ms_planning: {
      label: 'Planning des maîtres de semaine', singulier: 'Semaine', icone: '\uE004',
      titre: r => (r.lundi || '') + ' — ' + (r.maitre_nom || ''),
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('lundi', 'Lundi de la semaine', 'date', { req: 1, list: 1 }), f('maitre_nom', 'Maître de semaine', 'text', { list: 1 })
      ]
    },
    ms_journal: {
      label: 'Journal du maître de semaine', singulier: 'Journée', icone: '\uE004',
      titre: r => r.date,
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('date', 'Date', 'date', { req: 1, list: 1 }), f('lundi', 'Lundi', 'date'), f('maitre_nom', 'Maître de semaine', 'text', { list: 1 }),
        f('heure_arrivee', 'Heure d’arrivée', 'text'), f('salut_couleurs', 'Salut des couleurs', 'text'),
        f('proprete_cour', 'Propreté de la cour', 'text'), f('proprete_classes', 'Propreté des classes', 'text'), f('discipline_etat', 'Discipline', 'text'),
        f('abs_g', 'Absents garçons', 'number'), f('abs_f', 'Absentes filles', 'number'), f('ret_g', 'Retards garçons', 'number'), f('ret_f', 'Retards filles', 'number'),
        f('absences_ens', 'Absences enseignants', 'text'), f('retards_ens', 'Retards enseignants', 'text'), f('discipline', 'Cas de discipline', 'text'),
        f('visites', 'Visites', 'text'), f('incidents', 'Incidents', 'text'), f('activites', 'Activités', 'json'), f('observations', 'Observations', 'text'),
        f('visa_le', 'Visé le', 'text'), f('visa_nom', 'Visé par', 'text'), f('saisi_par', 'Saisi par', 'text')
      ]
    },
    reg_sec: {
      label: 'Registres du secondaire', singulier: 'Ligne de registre', icone: '\uE054',
      titre: r => (r.registre || '') + ' — ' + ((r.donnees && (r.donnees.nom || r.donnees.classe || r.donnees.eleve)) || ''),
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('registre', 'Registre', 'text', { req: 1, list: 1 }),
        f('donnees', 'Données', 'json')
      ]
    },
    annonces_personnel: {
      label: 'Annonces au personnel', singulier: 'Annonce', icone: '\uE050',
      titre: r => r.sujet,
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('sujet', 'Sujet', 'text', { req: 1, list: 1 }), f('texte', 'Texte', 'textarea', { req: 1 }),
        f('cible', 'Destinataires', 'select', { list: 1, o: ['ENSEIGNANTS', 'TOUS'], def: 'ENSEIGNANTS' }),
        f('auteur_nom', 'Auteur', 'text'), f('date_publication', 'Publication', 'text', { list: 1 }), f('lus', 'Lue par', 'json')
      ]
    },
    zone_desheritee: {
      label: 'Zone déshéritée', singulier: 'Zone déshéritée', icone: '\uE047',
      titre: r => 'Zone déshéritée — ' + (r.ecole_id || 'circonscription'),
      champs: [f('ecole_id', 'École', 'ref', { ref: 'ecoles' }), f('donnees', 'Agents et montants', 'json')]
    },
    declarations_paiement: {
      label: 'Déclarations de paiement', singulier: 'Déclaration de paiement', icone: '\uE04E',
      titre: r => (r.reference || 'Déclaration') + ' — ' + (r.montant || 0) + ' FCFA',
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', req: 1, annee: 1 }),
        f('inscription_id', 'Élève (inscription)', 'ref', { ref: 'inscriptions_eleves', req: 1, list: 1 }),
        f('eleve_id', 'Élève', 'ref', { ref: 'eleves' }),
        f('tranche', 'Versement', 'select', { req: 1, list: 1, o: ['INSCRIPTION', 'TRANCHE_1', 'TRANCHE_2', 'TRANCHE_3', 'RESTE'], def: 'TRANCHE_1' }),
        f('montant', 'Montant (FCFA)', 'number', { req: 1, min: 1, list: 1 }),
        f('mode', 'Mode', 'select', { list: 1, o: ['MOBILE_MONEY', 'VIREMENT', 'ESPECES', 'CHEQUE'], def: 'MOBILE_MONEY' }),
        f('operateur', 'Opérateur', 'text'),
        f('reference', 'Référence', 'text', { list: 1 }),
        f('date_paiement', 'Date du paiement', 'date', { list: 1 }),
        f('message', 'Message', 'text'),
        f('statut', 'État', 'select', { list: 1, o: ['EN_ATTENTE', 'CONFIRMEE', 'REJETEE'], def: 'EN_ATTENTE' }),
        f('motif', 'Motif du rejet', 'text'),
        f('numero_recu', 'N° du reçu', 'text'),
        f('paiement_id', 'Paiement créé', 'text'),
        f('declare_par', 'Déclaré par', 'text'),
        f('date_declaration', 'Déclaré le', 'text'),
        f('date_decision', 'Décision le', 'text'),
        f('decide_par', 'Décidé par', 'text')
      ]
    },
    cahier_fonds: {
      label: 'Cahier de gestion des fonds', singulier: 'Écriture de caisse', icone: '\uE030',
      titre: r => (r.libelle || '') + ' — ' + (r.montant || 0) + ' FCFA',
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', req: 1, annee: 1 }),
        f('date_operation', 'Date', 'date', { req: 1, list: 1 }),
        f('sens', 'Sens', 'select', { req: 1, list: 1, o: ['RECETTE', 'DEPENSE'], def: 'DEPENSE' }),
        f('categorie', 'Rubrique', 'select', { req: 1, list: 1, o: ['SCOLARITE', 'INSCRIPTION', 'SUBVENTION', 'DON', 'AUTRE_RECETTE',
          'SALAIRES', 'LOYER', 'EAU_ELECTRICITE', 'FOURNITURES', 'ENTRETIEN', 'IMPOTS_TAXES', 'TRANSPORT', 'EQUIPEMENT', 'FORMATION', 'AUTRE_DEPENSE'], def: 'AUTRE_DEPENSE' }),
        f('libelle', 'Libellé', 'text', { req: 1, list: 1 }),
        f('montant', 'Montant (FCFA)', 'number', { req: 1, min: 1, list: 1 }),
        f('mode', 'Mode', 'select', { o: ['ESPECES', 'MOBILE_MONEY', 'VIREMENT', 'CHEQUE'], def: 'ESPECES' }),
        f('piece', 'Pièce justificative (n°)', 'text', { list: 1 }),
        f('beneficiaire', 'Bénéficiaire ou déposant', 'text')
      ]
    },
    salaires_ecole: {
      label: 'Salaires des enseignants', singulier: 'Salaire', icone: '\uE04E',
      titre: r => (r.mois || '') + ' — ' + (r.net || 0) + ' FCFA',
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', req: 1, annee: 1 }),
        f('personnel_id', 'Enseignant', 'ref', { ref: 'personnels', req: 1, list: 1 }),
        f('mois', 'Mois (AAAA-MM)', 'text', { req: 1, list: 1, ph: '2026-10' }),
        f('salaire_brut', 'Salaire de base (FCFA)', 'number', { req: 1, min: 0, list: 1 }),
        f('primes', 'Primes (FCFA)', 'number', { min: 0, def: 0 }),
        f('retenues', 'Retenues (FCFA)', 'number', { min: 0, def: 0 }),
        f('net', 'Net à payer (FCFA)', 'number', { list: 1 }),
        f('statut', 'Statut', 'select', { list: 1, o: ['A_PAYER', 'PAYE'], def: 'A_PAYER' }),
        f('date_paiement', 'Date du paiement', 'date', { list: 1 }),
        f('mode', 'Mode', 'select', { o: ['ESPECES', 'MOBILE_MONEY', 'VIREMENT', 'CHEQUE'], def: 'ESPECES' }),
        f('observations', 'Observations', 'text')
      ]
    },
/* Effectifs et personnel d'une école pour une année : ce que la circonscription remonte
       dans ses tableaux statistiques (classes autorisées, personnel FE/ACDPE/ACDPCTD, élèves par
       cours et par sexe). Une ligne par école et par année. */
    statistiques_ecoles: {
      label: 'Statistiques par école', singulier: 'Statistique d’école', icone: '\uE016',
      titre: r => 'Année ' + (r.annee_code || ''),
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1, list: 1 }),
        f('annee_code', 'Année scolaire', 'text', { req: 1, list: 1 }),
        f('classes_autorisees', 'Classes autorisées', 'number', { list: 1 }),
        f('personnel_fe', 'Personnel FE (fonctionnaires de l’État)', 'number'),
        f('personnel_acdpe', 'Personnel ACDPE', 'number'),
        f('personnel_ame', 'Personnel ACDPCTD', 'number'),
        f('effectifs', 'Effectifs par cours (garçons, filles)', 'json'),
        f('total_garcons', 'Garçons', 'number', { list: 1 }),
        f('total_filles', 'Filles', 'number', { list: 1 }),
        f('source', 'Source', 'text')
      ]
    },
    recensements_ecoles: {
      label: 'Recensements par école', singulier: 'Recensement', icone: '\uE00B',
      champs: [
        f('campagne_id', 'Campagne', 'ref', { ref: 'campagnes_recensement', req: 1, list: 1 }),
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1, list: 1 }),
        f('statut', 'Statut', 'select', { list: 1, o: ['BROUILLON', 'A_COMPLETER', 'PRET', 'SOUMIS', 'A_CORRIGER', 'VALIDE', 'VERROUILLE'], def: 'BROUILLON' }),
        f('taux_completion', 'Taux de complétion (%)', 'number', { list: 1 })
      ]
    },
    recensement_valeurs: {
      label: 'Valeurs de recensement', singulier: 'Valeur', icone: '\uE040',
      champs: [
        f('recensement_id', 'Recensement', 'ref', { ref: 'recensements_ecoles', req: 1 }),
        f('rubrique', 'Rubrique', 'text', { req: 1, list: 1 }),
        f('champ', 'Champ', 'text', { req: 1, list: 1 }),
        f('valeur', 'Valeur', 'text', { list: 1 }),
        f('origine', 'Origine', 'select', { list: 1, o: ['AUTO', 'CONFIRMEE', 'SAISIE'], def: 'SAISIE' }),
        f('source_table', 'Table source', 'text')
      ]
    },
    bilans_recensement: {
      label: 'Bilans de recensement', singulier: 'Bilan', icone: '\uE015',
      champs: [
        f('campagne_id', 'Campagne', 'ref', { ref: 'campagnes_recensement', req: 1, list: 1 }),
        f('niveau', 'Niveau', 'select', { req: 1, list: 1, o: ['CIRCONSCRIPTION', 'DDEMP', 'NATIONAL'] }),
        f('territoire_id', 'Territoire', 'ref', { ref: 'territoires', list: 1 }),
        f('cycle', 'Cycle', 'select', { o: ['MATERNELLE', 'PRIMAIRE', 'ENSEMBLE'], list: 1 }),
        f('nb_ecoles_attendues', 'Écoles attendues', 'number', { list: 1 }),
        f('nb_ecoles_repondues', 'Écoles ayant répondu', 'number', { list: 1 }),
        f('taux_couverture', 'Couverture (%)', 'number', { list: 1 }),
        f('statut', 'Statut', 'select', { o: ['BROUILLON', 'CALCULE', 'A_CONTROLER', 'VALIDE', 'VERROUILLE'], def: 'BROUILLON' })
      ]
    },
    statistiques_agregees: {
      label: 'Statistiques agrégées', singulier: 'Statistique', icone: '\uE016', lectureSeule: true,
      champs: [
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', list: 1 }),
        f('territoire_type', 'Niveau territorial', 'text', { list: 1 }),
        f('territoire_id', 'Territoire', 'ref', { ref: 'territoires', list: 1 }),
        f('indicateur', 'Indicateur', 'text', { list: 1 }),
        f('cycle', 'Cycle', 'text', { list: 1 }),
        f('sexe', 'Sexe', 'text', { list: 1 }),
        f('valeur', 'Valeur', 'number', { list: 1 })
      ]
    },
    populations_scolarisables: {
      label: 'Populations scolarisables', singulier: 'Population', icone: '\uE01F',
      champs: [
        f('annee', 'Année', 'number', { req: 1, list: 1 }),
        f('territoire_id', 'Territoire', 'ref', { ref: 'territoires', list: 1 }),
        f('age_min', 'Âge minimum', 'number', { req: 1, list: 1 }),
        f('age_max', 'Âge maximum', 'number', { list: 1 }),
        f('sexe', 'Sexe', 'select', { o: ['M', 'F'], req: 1, list: 1 }),
        f('population', 'Population', 'number', { req: 1, list: 1 }),
        f('source', 'Source', 'text')
      ]
    },
    definitions_indicateurs: {
      label: 'Définitions d\'indicateurs', singulier: 'Indicateur', icone: '\uE061',
      titre: r => r.nom,
      champs: [
        f('code', 'Code', 'text', { req: 1, list: 1 }),
        f('nom', 'Nom', 'text', { req: 1, list: 1 }),
        f('description', 'Description', 'textarea'),
        f('formule', 'Formule', 'text', { list: 1 }),
        f('unite', 'Unité', 'text', { list: 1 })
      ]
    },
    projections: {
      label: 'Projections', singulier: 'Projection', icone: '\uE07A',
      champs: [
        f('modele', 'Modèle', 'text', { req: 1, list: 1 }),
        f('version', 'Version', 'text'),
        f('territoire_id', 'Territoire', 'ref', { ref: 'territoires', list: 1 }),
        f('indicateur', 'Indicateur', 'text', { req: 1, list: 1 }),
        f('annee_cible', 'Année cible', 'number', { req: 1, list: 1 }),
        f('valeur_proj', 'Valeur projetée', 'number', { list: 1 }),
        f('intervalle_bas', 'Borne basse', 'number'),
        f('intervalle_haut', 'Borne haute', 'number')
      ]
    },

    /* ---------------- PARENTS ---------------- */
    profils_parents: {
      label: 'Parents', singulier: 'Parent', icone: '\uE01C',
      titre: r => (r.nom || '').toUpperCase() + ' ' + (r.prenoms || ''),
      champs: [
        f('nom', 'Nom', 'text', { req: 1, list: 1 }),
        f('prenoms', 'Prénoms', 'text', { list: 1 }),
        f('telephone', 'Téléphone', 'text', { req: 1, list: 1 }),
        f('telephone_verifie', 'Téléphone vérifié', 'bool', { list: 1 }),
        f('email', 'E-mail', 'text'),
        f('user_id', 'Compte utilisateur', 'ref', { ref: 'users' }),
        f('actif', 'Actif', 'bool', { def: true })
      ]
    },
    liens_parent_enfant: {
      label: 'Liens parent-enfant', singulier: 'Lien', icone: '\uE053',
      champs: [
        f('parent_id', 'Parent', 'ref', { ref: 'profils_parents', req: 1, list: 1 }),
        f('eleve_id', 'Élève', 'ref', { ref: 'eleves', req: 1, list: 1 }),
        f('relation', 'Relation', 'select', { list: 1, o: ['PERE', 'MERE', 'TUTEUR', 'RESPONSABLE', 'AUTRE'] }),
        f('statut', 'Statut', 'select', { list: 1, o: ['EN_ATTENTE', 'VALIDE', 'REFUSE', 'REVOQUE'], def: 'EN_ATTENTE' }),
        f('methode_validation', 'Méthode de validation', 'text')
      ]
    },
    communications_ecole: {
      label: 'Communications de l\'école', singulier: 'Communication', icone: '\uE050',
      titre: r => r.titre,
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1 }),
        f('titre', 'Titre', 'text', { req: 1, list: 1 }),
        f('contenu', 'Contenu', 'textarea', { req: 1 }),
        f('audience', 'Audience', 'select', { list: 1, o: ['TOUS_PARENTS', 'NIVEAU', 'CLASSE', 'PERSONNEL'], def: 'TOUS_PARENTS' }),
        f('niveau', 'Niveau', 'select', { o: NIVEAUX }),
        f('date_publication', 'Publication', 'date', { list: 1 }),
        f('statut', 'Statut', 'select', { list: 1, o: ['BROUILLON', 'PUBLIEE', 'ARCHIVEE'], def: 'BROUILLON' })
      ]
    },
    messages: {
      label: 'Messages école-famille', singulier: 'Message', icone: '\uE035',
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', scope: 1 }),
        f('eleve_id', 'Élève concerné', 'ref', { ref: 'eleves', list: 1 }),
        f('auteur_label', 'Auteur', 'text', { list: 1 }),
        f('destinataire_label', 'Destinataire', 'text', { list: 1 }),
        f('contenu', 'Message', 'textarea', { req: 1, list: 1 }),
        f('lu', 'Lu', 'bool')
      ]
    },

    /* ---------------- RISQUES & ALERTES ---------------- */
    modeles_risque: {
      label: 'Modèles de risque', singulier: 'Modèle', icone: '\uE064',
      titre: r => r.code + ' ' + (r.version || ''),
      champs: [
        f('code', 'Code', 'text', { req: 1, list: 1 }),
        f('version', 'Version', 'text', { req: 1, list: 1 }),
        f('actif', 'Actif', 'bool', { list: 1 }),
        f('configuration', 'Pondérations', 'json'),
        f('date_activation', 'Date d\'activation', 'date')
      ]
    },
    scores_risque: {
      label: 'Scores de risque', singulier: 'Score', icone: '\uE016', lectureSeule: true,
      champs: [
        f('inscription_id', 'Inscription', 'ref', { ref: 'inscriptions_eleves', list: 1 }),
        f('score', 'Score /100', 'number', { list: 1 }),
        f('niveau', 'Niveau', 'select', { list: 1, o: ['FAIBLE', 'MOYEN', 'ELEVE', 'CRITIQUE'] }),
        f('facteurs', 'Facteurs', 'json'),
        f('calcule_at', 'Calculé le', 'datetime', { list: 1 })
      ]
    },
    alertes_scolaires: {
      label: 'Alertes de décrochage', singulier: 'Alerte de décrochage', icone: '\uE065',
      champs: [
        f('inscription_id', 'Inscription', 'ref', { ref: 'inscriptions_eleves', req: 1, list: 1 }),
        f('niveau', 'Niveau', 'select', { req: 1, list: 1, o: ['FAIBLE', 'MOYEN', 'ELEVE', 'CRITIQUE'] }),
        f('statut', 'Statut', 'select', { list: 1, o: ['NOUVELLE', 'A_EXAMINER', 'PRISE_EN_CHARGE', 'SURVEILLANCE', 'RESOLUE', 'CLASSEE'], def: 'NOUVELLE' }),
        f('assignee_label', 'Prise en charge par', 'text', { list: 1 })
      ]
    },
    accompagnements_eleves: {
      label: 'Accompagnements', singulier: 'Accompagnement', icone: '\uE066',
      champs: [
        f('inscription_id', 'Inscription', 'ref', { ref: 'inscriptions_eleves', req: 1, list: 1 }),
        f('responsable_label', 'Responsable', 'text', { list: 1 }),
        f('motif', 'Motif', 'textarea'),
        f('date_ouverture', 'Ouverture', 'date', { req: 1, list: 1 }),
        f('date_cloture', 'Clôture', 'date'),
        f('statut', 'Statut', 'select', { list: 1, o: ['OUVERT', 'EN_COURS', 'CLOTURE'], def: 'OUVERT' }),
        f('conclusion', 'Conclusion', 'textarea')
      ]
    },
    actions_accompagnement: {
      label: 'Actions d\'accompagnement', singulier: 'Action', icone: '\uE029',
      champs: [
        f('accompagnement_id', 'Accompagnement', 'ref', { ref: 'accompagnements_eleves', req: 1, list: 1 }),
        f('type_action', 'Type', 'select', { req: 1, list: 1, o: ['VISITE_FAMILLE', 'APPEL', 'ENTRETIEN', 'SOUTIEN_SCOLAIRE', 'AIDE_MATERIELLE', 'AUTRE'] }),
        f('description', 'Description', 'textarea'),
        f('date_action', 'Date', 'date', { req: 1, list: 1 }),
        f('resultat', 'Résultat', 'textarea'),
        f('prochaine_action', 'Prochaine action', 'date')
      ]
    },
    types_alertes: {
      label: 'Types d\'alertes', singulier: 'Type d\'alerte', icone: '\uE056',
      titre: r => r.libelle,
      champs: [
        f('code', 'Code', 'text', { req: 1, list: 1 }),
        f('categorie', 'Catégorie', 'text', { list: 1 }),
        f('libelle', 'Libellé', 'text', { req: 1, list: 1 }),
        f('severite_defaut', 'Sévérité par défaut', 'select', { list: 1, o: ['INFO', 'FAIBLE', 'MOYENNE', 'ELEVEE', 'CRITIQUE'] }),
        f('actif', 'Actif', 'bool', { def: true })
      ]
    },
    alertes: {
      label: 'Alertes', singulier: 'Alerte', icone: '\uE055',
      titre: r => r.titre,
      champs: [
        f('type_code', 'Type', 'text', { req: 1, list: 1 }),
        f('severite', 'Sévérité', 'select', { req: 1, list: 1, o: ['INFO', 'FAIBLE', 'MOYENNE', 'ELEVEE', 'CRITIQUE'] }),
        f('titre', 'Titre', 'text', { req: 1, list: 1 }),
        f('description', 'Description', 'textarea'),
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', scope: 1, list: 1 }),
        f('statut', 'Statut', 'select', { list: 1, o: ['NOUVELLE', 'AFFECTEE', 'PRISE_EN_CHARGE', 'EN_ATTENTE', 'RESOLUE', 'CLOTUREE', 'IGNOREE'], def: 'NOUVELLE' }),
        f('detectee_at', 'Détectée le', 'datetime', { list: 1 })
      ]
    },
    actions_alertes: {
      label: 'Actions sur alertes', singulier: 'Action', icone: '\uE052',
      champs: [
        f('alerte_id', 'Alerte', 'ref', { ref: 'alertes', req: 1, list: 1 }),
        f('type_action', 'Type', 'text', { list: 1 }),
        f('description', 'Description', 'textarea', { req: 1, list: 1 }),
        f('responsable_label', 'Responsable', 'text'),
        f('date_action', 'Date', 'date', { list: 1 }),
        f('resultat', 'Résultat', 'textarea')
      ]
    },

    /* ---------------- VISITES ---------------- */
    visites: {
      label: 'Visites', singulier: 'Visite', icone: '\uE042',
      titre: r => (r.type_code || 'Visite') + ' — ' + (r.date_visite || ''),
      champs: [
        f('type_code', 'Type', 'select', { req: 1, list: 1, o: ['VISITE_CLASSE', 'VISITE_ECOLE', 'INSPECTION', 'SUIVI'] }),
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1, list: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('personnel_visite_id', 'Agent visité', 'ref', { ref: 'personnels', list: 1 }),
        f('classe_id', 'Classe', 'ref', { ref: 'classes' }),
        f('visiteur_label', 'Visiteur', 'text', { list: 1 }),
        f('date_visite', 'Date', 'date', { req: 1, list: 1 }),
        f('objet', 'Objet', 'textarea'),
        f('conclusion', 'Conclusion', 'textarea'),
        f('statut', 'Statut', 'select', { list: 1, o: ['BROUILLON', 'PLANIFIEE', 'EN_COURS', 'REALISEE', 'RAPPORT_REDIGE', 'A_CONTRESIGNER', 'VALIDEE', 'SUIVI', 'CLOTUREE'], def: 'BROUILLON' }),
        // v7.6.1 : suivi des visites par étapes (planifiée → réalisée → rapport rédigé → validée) et prochaine visite
        f('date_prochaine_visite', 'Date de la prochaine visite', 'date')
      ]
    },
    observations_visites: {
      label: 'Observations de visite', singulier: 'Observation', icone: '\uE043',
      champs: [
        f('visite_id', 'Visite', 'ref', { ref: 'visites', req: 1, list: 1 }),
        f('categorie', 'Catégorie', 'text', { list: 1 }),
        f('niveau', 'Niveau', 'select', { list: 1, o: ['POSITIF', 'INFORMATION', 'A_AMELIORER', 'URGENT'] }),
        f('observation', 'Observation', 'textarea', { req: 1, list: 1 })
      ]
    },
    recommandations: {
      label: 'Recommandations', singulier: 'Recommandation', icone: '\uE02D',
      champs: [
        f('visite_id', 'Visite', 'ref', { ref: 'visites', req: 1, list: 1 }),
        f('texte', 'Recommandation', 'textarea', { req: 1, list: 1 }),
        f('priorite', 'Priorité', 'select', { req: 1, list: 1, o: ['FAIBLE', 'NORMALE', 'ELEVEE', 'URGENTE'], def: 'NORMALE' }),
        f('echeance', 'Échéance', 'date', { list: 1 }),
        f('statut', 'Statut', 'select', { list: 1, o: ['A_FAIRE', 'EN_COURS', 'REALISEE', 'A_VERIFIER', 'VALIDEE', 'NON_APPLICABLE'], def: 'A_FAIRE' })
      ]
    },
    plans_amelioration: {
      label: 'Plans d\'amélioration', singulier: 'Plan', icone: '\uE048',
      titre: r => r.titre,
      champs: [
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', req: 1, scope: 1, list: 1 }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('titre', 'Titre', 'text', { req: 1, list: 1 }),
        f('origine', 'Origine', 'text'),
        f('date_debut', 'Début', 'date', { list: 1 }),
        f('date_fin_prevue', 'Fin prévue', 'date', { list: 1 }),
        f('statut', 'Statut', 'select', { list: 1, o: ['BROUILLON', 'EN_COURS', 'CLOTURE'], def: 'BROUILLON' })
      ]
    },
    actions_plan_amelioration: {
      label: 'Actions de plan', singulier: 'Action', icone: '\uE003',
      champs: [
        f('plan_id', 'Plan', 'ref', { ref: 'plans_amelioration', req: 1, list: 1 }),
        f('titre', 'Titre', 'text', { req: 1, list: 1 }),
        f('description', 'Description', 'textarea'),
        f('responsable_label', 'Responsable', 'text', { list: 1 }),
        f('echeance', 'Échéance', 'date', { list: 1 }),
        f('statut', 'Statut', 'select', { list: 1, o: ['A_FAIRE', 'EN_COURS', 'REALISEE', 'ABANDONNEE'], def: 'A_FAIRE' }),
        f('resultat', 'Résultat', 'textarea')
      ]
    },

    /* ---------------- DOCUMENTS ---------------- */
    types_documents: {
      label: 'Types de documents', singulier: 'Type de document', icone: '\uE056',
      titre: r => r.nom,
      champs: [
        f('code', 'Code', 'text', { req: 1, list: 1 }),
        f('nom', 'Nom', 'text', { req: 1, list: 1 }),
        f('categorie', 'Catégorie', 'text', { list: 1 }),
        f('signature_requise', 'Signature requise', 'bool', { list: 1 }),
        f('verification_qr', 'Vérification par QR', 'bool', { list: 1 })
      ]
    },
    documents: {
      label: 'Documents', singulier: 'Document', icone: '\uE00D',
      titre: r => r.titre,
      champs: [
        f('numero', 'Numéro', 'text', { list: 1 }),
        f('type_code', 'Type', 'text', { req: 1, list: 1 }),
        f('titre', 'Titre', 'text', { req: 1, list: 1 }),
        f('ecole_id', 'École', 'ref', { ref: 'ecoles', scope: 1 }),
        f('classe_id', 'Classe concernée', 'ref', { ref: 'classes' }),
        f('annee_scolaire_id', 'Année', 'ref', { ref: 'annees_scolaires', annee: 1 }),
        f('sensibilite', 'Sensibilité', 'select', { o: ['PUBLIC', 'INTERNE', 'CONFIDENTIEL', 'SENSIBLE'], def: 'INTERNE' }),
        f('statut', 'Statut', 'select', { list: 1, o: ['BROUILLON', 'GENERE', 'A_SIGNER', 'SIGNE', 'VALIDE', 'VERROUILLE', 'ARCHIVE', 'ANNULE'], def: 'GENERE' }),
        f('hash_sha256', 'Empreinte', 'text', { list: 1 }),
        f('orientation', 'Orientation', 'select', { o: ['PORTRAIT', 'PAYSAGE'], def: 'PORTRAIT' }),
        f('contenu_html', 'Contenu', 'textarea')
      ]
    },

    /* ---------------- RAPPORTS ---------------- */
    signatures_documents: {
      label: 'Signatures de documents', singulier: 'Signature', icone: '\uE029', lectureSeule: true,
      champs: [
        f('document_id', 'Document', 'ref', { ref: 'documents', list: 1 }),
        f('signataire_label', 'Signataire', 'text', { list: 1 }),
        f('role_signature', 'Qualité', 'text', { list: 1 }),
        f('type_signature', 'Type', 'select', { list: 1, o: ['NUMERIQUE', 'MANUSCRITE', 'CACHET'] }),
        f('hash_document', 'Empreinte signée', 'text', { list: 1 }),
        f('signed_at', 'Signé le', 'datetime', { list: 1 })
      ]
    },
    modeles_rapports: {
      label: 'Modèles de rapports', singulier: 'Modèle', icone: '\uE011',
      titre: r => r.nom,
      champs: [
        f('code', 'Code', 'text', { req: 1, list: 1 }),
        f('nom', 'Nom', 'text', { req: 1, list: 1 }),
        f('type', 'Type', 'select', { list: 1, o: ['OFFICIEL', 'PARAMETRABLE', 'SYSTEME'] }),
        f('description', 'Description', 'textarea'),
        f('configuration', 'Configuration', 'json'),
        f('actif', 'Actif', 'bool', { def: true })
      ]
    },
    generations_rapports: {
      label: 'Rapports générés', singulier: 'Rapport généré', icone: '\uE00C', lectureSeule: true,
      champs: [
        f('nom', 'Rapport', 'text', { list: 1 }),
        f('format', 'Format', 'text', { list: 1 }),
        f('statut', 'Statut', 'text', { list: 1 }),
        f('created_at', 'Généré le', 'datetime', { list: 1 })
      ]
    },

    /* ---------------- SYNCHRO ---------------- */
    educmaster_sync_queue: {
      label: 'File EDUCMaster', singulier: 'Élément de file', icone: '\uE058', lectureSeule: true,
      champs: [
        f('entity_type', 'Entité', 'text', { list: 1 }),
        f('entity_id', 'Identifiant', 'text', { list: 1 }),
        f('operation', 'Opération', 'text', { list: 1 }),
        f('statut', 'Statut', 'text', { list: 1 }),
        f('attempts', 'Tentatives', 'number', { list: 1 }),
        f('erreur', 'Erreur', 'text')
      ]
    },
    conflits_synchronisation: {
      label: 'Conflits de synchronisation', singulier: 'Conflit', icone: '\uE067',
      champs: [
        f('systeme', 'Système', 'text', { list: 1 }),
        f('entity_type', 'Entité', 'text', { list: 1 }),
        f('entity_id', 'Identifiant', 'text', { list: 1 }),
        f('type_conflit', 'Type', 'text', { list: 1 }),
        f('donnees_locales', 'Données locales', 'json'),
        f('donnees_distantes', 'Données distantes', 'json'),
        f('statut', 'Statut', 'select', { list: 1, o: ['OUVERT', 'RESOLU'], def: 'OUVERT' }),
        f('resolution', 'Résolution', 'text')
      ]
    },
    device_sync_status: {
      label: 'Appareils', singulier: 'Appareil', icone: '\uE045', lectureSeule: true,
      champs: [
        f('device_id', 'Appareil', 'text', { list: 1 }),
        f('user_label', 'Utilisateur', 'text', { list: 1 }),
        f('pending_count', 'En attente', 'number', { list: 1 }),
        f('last_sync_at', 'Dernière synchro', 'datetime', { list: 1 }),
        f('app_version', 'Version', 'text', { list: 1 })
      ]
    },

    /* ---------------- SUPPORT ---------------- */
    support_tickets: {
      label: 'Tickets de support', singulier: 'Ticket', icone: '\uE052',
      titre: r => r.reference + ' — ' + (r.titre || ''),
      champs: [
        f('reference', 'Référence', 'text', { list: 1 }),
        f('module', 'Module', 'text', { list: 1 }),
        f('severite', 'Sévérité', 'select', { list: 1, o: ['P0', 'P1', 'P2', 'P3'], def: 'P2' }),
        f('titre', 'Titre', 'text', { req: 1, list: 1 }),
        f('description', 'Description', 'textarea'),
        f('statut', 'Statut', 'select', { list: 1, o: ['OUVERT', 'EN_COURS', 'RESOLU', 'FERME'], def: 'OUVERT' })
      ]
    },
    maintenances: {
      label: 'Maintenances', singulier: 'Maintenance', icone: '\uE07C',
      titre: r => r.titre,
      champs: [
        f('titre', 'Titre', 'text', { req: 1, list: 1 }),
        f('debut', 'Début', 'datetime', { req: 1, list: 1 }),
        f('fin_prevue', 'Fin prévue', 'datetime', { req: 1, list: 1 }),
        f('impact', 'Impact', 'select', { o: ['AUCUN', 'PARTIEL', 'TOTAL'], list: 1 }),
        f('message', 'Message', 'textarea'),
        f('actif', 'Active', 'bool', { def: true })
      ]
    },
    feature_flags: {
      label: 'Fonctionnalités', singulier: 'Fonctionnalité', icone: '\uE069',
      titre: r => r.code,
      champs: [
        f('code', 'Code', 'text', { req: 1, list: 1 }),
        f('enabled', 'Activée', 'bool', { list: 1 }),
        f('scope_type', 'Portée', 'text', { list: 1 }),
        f('configuration', 'Configuration', 'json')
      ]
    }
  };

  global.EG = global.EG || {};
  /* Version de l'application : même valeur que version.txt et le cache du service worker (tools/version.mjs) */
  global.EG.VERSION = '8.2.3';
  global.EG.SCHEMA = SCHEMA;
  global.EG.MODULES = MODULES;
  global.EG.CATEGORIES_MODULES = CATEGORIES_MODULES;
  global.EG.NIVEAUX = NIVEAUX;
  global.EG.ROLES = ROLES;
  global.EG.NIVEAUX_PRIM = NIVEAUX_PRIM;
  global.EG.NIVEAUX_MAT = NIVEAUX_MAT;
  global.EG.CYCLES = CYCLES;
  global.EG.STORES = Object.keys(SCHEMA);
  global.EG.TERRITOIRE_PARENTS = TERRITOIRE_PARENTS;
})(window);
