/* Pilotage et vie scolaire (PVS) — catalogue commun des modules, rubriques, champs et colonnes Excel.
   Même catalogue dans CS Pobè, Mon école, MEMP-CP, DOSP, MEMP-CP Pobè, ÉduGestion Pro / Master ; SCOLARIS et GESCOL
   reprennent les mêmes rubriques et les mêmes en-têtes Excel (voir outils/lots/spec.md, produit depuis ce fichier).
   Chaque champ : k (clé), l (libellé = en-tête Excel), t (type), o (choix), req (obligatoire), def (valeur par défaut),
   calc (valeur calculée, exportée mais non importée), cache (absent du tableau, présent au formulaire et en Excel).
   Types : txt, long, num, date, heure, choix, multi (liste « a, b »), oui (Oui / Non), sexe (M / F), ecole (école du
   périmètre), ref (enregistrement d'une autre rubrique), calc.
   Conception : Maître Aimé FACHE */
(function (global) {
  'use strict';
  const NIVEAUX = ['ECOLE', 'UP', 'ZONE', 'CS', 'DDEMP'];
  const DISCIPLINES = ['Football', 'Handball', 'Volleyball', 'Basketball', 'Athlétisme', 'Pétanque', 'Tennis de table', 'Judo', 'Lutte traditionnelle',
    'Jeux traditionnels', 'Jeux de société (awalé, dames…)', 'Course en sac', 'Chant / chorale', 'Danse', 'Théâtre / sketch', 'Poésie / récitation', 'Dessin', 'Quiz / culture générale'];
  const CATEGORIES = ['Poussins', 'Benjamins', 'Minimes', 'Cadets', 'Toutes catégories'];
  const GENRES = ['Garçons', 'Filles', 'Mixte'];
  const COURS = ['Maternelle', 'CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'];
  const FORMULES = ['Poules puis élimination directe', 'Championnat (matchs simples)', 'Championnat aller-retour', 'Élimination directe', 'Classement individuel ou par équipe (sans matchs)'];
  const PHASES = ['Poule', 'Journée de championnat', 'Seizièmes de finale', 'Huitièmes de finale', 'Quarts de finale', 'Demi-finales', 'Match pour la 3e place', 'Finale'];
  const EPREUVES = ['50 m', '60 m', '80 m', '100 m', 'Relais 4 × 60 m', 'Relais 4 × 100 m', '600 m', '1 000 m', 'Cross', 'Saut en longueur', 'Saut en hauteur', 'Triple saut',
    'Lancer de balle', 'Lancer de poids', 'Lancer de javelot (vortex)', 'Course en sac', 'Course de relais traditionnelle'];
  /** Unité de l'épreuve : temps (s, le plus petit gagne) ou distance (m, le plus grand gagne) */
  const UNITE_EPREUVE = (e) => /saut|lancer/i.test(e || '') ? 'm' : /course en sac|relais trad/i.test(e || '') ? 's' : 's';
  const DISTINCTIONS = ['Médaille d’or', 'Médaille d’argent', 'Médaille de bronze', 'Coupe', 'Trophée', 'Prix spécial', 'Prix du fair-play', 'Meilleur buteur / marqueur', 'Meilleur joueur / joueuse', 'Mention', 'Participation'];

  /** Catégorie d'âge d'un élève pour une saison « AAAA-AAAA » : âge atteint au 31 décembre de la première année */
  function categorieAge(dateNaissance, saison) {
    const y = parseInt(String(dateNaissance || '').slice(0, 4), 10), s = parseInt(String(saison || '').slice(0, 4), 10);
    if (!y || !s) return '';
    const age = s - y;
    return age <= 8 ? 'Poussins' : age <= 10 ? 'Benjamins' : age <= 12 ? 'Minimes' : 'Cadets';
  }
  const n = (v) => { const x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(x) ? 0 : x; };
  const total = (...ks) => (r) => { const s = ks.reduce((a, k) => a + n(r[k]), 0); return s || ''; };
  const pct = (a, b) => (r) => (n(r[b]) ? Math.round(1000 * n(r[a]) / n(r[b])) / 10 : '');

  const MODULES = [
    /* ===================================================== LOT A ===================================================== */
    {
      id: 'sport', lot: 'A', titre: 'Sport scolaire', icone: '\uE04D',
      desc: 'Licences des élèves, compétitions par niveau (école → UP → zone → circonscription → DDEMP), tirage au sort, calendrier, feuilles de match, classements, athlétisme, jeux traditionnels et culturels, palmarès, qualifiés pour le niveau supérieur, diplômes signés.',
      onglets: [
        { id: 'licences', titre: 'Licences', coll: 'licences', niveaux: ['ECOLE'], unique: ['nom', 'prenoms', 'dateNaissance'],
          lib: (r) => [String(r.nom || '').toUpperCase(), r.prenoms].filter(Boolean).join(' '),
          champs: [
            { k: 'numero', l: 'N° de licence', t: 'txt', aide: 'Attribué automatiquement s’il est laissé vide' },
            { k: 'nom', l: 'Nom', t: 'txt', req: true }, { k: 'prenoms', l: 'Prénoms', t: 'txt', req: true },
            { k: 'sexe', l: 'Sexe', t: 'sexe', req: true }, { k: 'dateNaissance', l: 'Date de naissance', t: 'date' },
            { k: 'lieuNaissance', l: 'Lieu de naissance', t: 'txt', cache: true }, { k: 'cours', l: 'Cours', t: 'choix', o: COURS },
            { k: 'categorie', l: 'Catégorie', t: 'choix', o: CATEGORIES, aide: 'Calculée à partir de l’année de naissance si elle est laissée vide' },
            { k: 'disciplines', l: 'Disciplines', t: 'multi', o: DISCIPLINES },
            { k: 'aptitude', l: 'Aptitude médicale', t: 'choix', o: ['Apte', 'Apte avec réserve', 'Inapte', 'Non examiné'], def: 'Non examiné' },
            { k: 'dateVisite', l: 'Date de la visite médicale', t: 'date', cache: true },
            { k: 'parent', l: 'Parent / tuteur', t: 'txt', cache: true }, { k: 'contact', l: 'Contact du parent', t: 'txt', cache: true },
            { k: 'observations', l: 'Observations', t: 'long', cache: true }],
          docsLigne: [{ type: 'LICENCE', l: '\uE02B Carte de licence' }, { type: 'PARTICIPATION', l: '\uE02F Attestation de participation' }] },
        { id: 'competitions', titre: 'Compétitions', coll: 'competitions', niveaux: NIVEAUX, unique: ['intitule'],
          lib: (r) => r.intitule || [r.discipline, r.categorie, r.genre].filter(Boolean).join(' — '),
          champs: [
            { k: 'intitule', l: 'Intitulé', t: 'txt', req: true, aide: 'Ex. : Championnat de football minimes garçons' },
            { k: 'discipline', l: 'Discipline', t: 'choix', o: DISCIPLINES, req: true }, { k: 'categorie', l: 'Catégorie', t: 'choix', o: CATEGORIES },
            { k: 'genre', l: 'Genre', t: 'choix', o: GENRES }, { k: 'formule', l: 'Formule', t: 'choix', o: FORMULES, def: FORMULES[0] },
            { k: 'nbPoules', l: 'Nombre de poules', t: 'num', def: 2 }, { k: 'qualifiesPoule', l: 'Qualifiés par poule', t: 'num', def: 2 },
            { k: 'nbQualifies', l: 'Qualifiés pour le niveau supérieur', t: 'num', def: 1 },
            { k: 'dateDebut', l: 'Date de début', t: 'date' }, { k: 'dateFin', l: 'Date de fin', t: 'date' }, { k: 'lieu', l: 'Lieu / site', t: 'txt' },
            { k: 'organisateur', l: 'Comité d’organisation', t: 'txt', cache: true }, { k: 'reglement', l: 'Règlement particulier', t: 'long', cache: true },
            { k: 'statut', l: 'Statut', t: 'choix', o: ['Programmée', 'En cours', 'Terminée', 'Annulée'], def: 'Programmée' }],
          docsLigne: [{ type: 'CALENDRIER', l: '\uE017 Calendrier' }, { type: 'CLASSEMENT', l: '\uE015 Classement' }, { type: 'PALMARES', l: '\uE04C Palmarès' }, { type: 'QUALIFIES', l: '\uE00A Qualifiés' }] },
        { id: 'equipes', titre: 'Équipes engagées', coll: 'equipes', niveaux: NIVEAUX, unique: ['competition', 'equipe'],
          lib: (r) => r.equipe || r.ecoleLib || '',
          champs: [
            { k: 'competition', l: 'Compétition', t: 'ref', o: 'competitions', req: true },
            { k: 'equipe', l: 'Équipe', t: 'txt', req: true, aide: 'Nom de l’équipe (souvent celui de l’école, de l’UP ou de la zone)' },
            { k: 'ecole', l: 'École', t: 'ecole' }, { k: 'provenance', l: 'Provenance', t: 'txt', aide: 'Ex. : Qualifiée de la zone 2' },
            { k: 'poule', l: 'Poule', t: 'txt' }, { k: 'capitaine', l: 'Capitaine', t: 'txt', cache: true }, { k: 'encadreur', l: 'Encadreur', t: 'txt' },
            { k: 'contact', l: 'Contact', t: 'txt', cache: true }, { k: 'joueursG', l: 'Joueurs (G)', t: 'num' }, { k: 'joueursF', l: 'Joueuses (F)', t: 'num' },
            { k: 'effectif', l: 'Effectif', t: 'calc', calc: total('joueursG', 'joueursF') }, { k: 'liste', l: 'Liste des joueurs', t: 'long', cache: true, aide: 'Un nom par ligne (avec le n° de licence)' }],
          docsLigne: [{ type: 'PARTICIPATION', l: '\uE02F Attestation de participation' }] },
        { id: 'matchs', titre: 'Calendrier et feuilles de match', coll: 'matchs', niveaux: NIVEAUX, unique: ['competition', 'equipeA', 'equipeB', 'phase', 'journee'],
          lib: (r, api) => (api ? api.libRef('equipes', r.equipeA) + ' – ' + api.libRef('equipes', r.equipeB) : ''),
          champs: [
            { k: 'competition', l: 'Compétition', t: 'ref', o: 'competitions', req: true },
            { k: 'phase', l: 'Phase', t: 'choix', o: PHASES, def: 'Poule' }, { k: 'poule', l: 'Poule', t: 'txt' }, { k: 'journee', l: 'Journée / tour', t: 'num' },
            { k: 'date', l: 'Date', t: 'date' }, { k: 'heure', l: 'Heure', t: 'heure' }, { k: 'terrain', l: 'Terrain', t: 'txt' },
            { k: 'equipeA', l: 'Équipe A', t: 'ref', o: 'equipes', dep: 'competition', req: true }, { k: 'equipeB', l: 'Équipe B', t: 'ref', o: 'equipes', dep: 'competition', req: true },
            { k: 'scoreA', l: 'Score A', t: 'num' }, { k: 'scoreB', l: 'Score B', t: 'num' },
            { k: 'tab', l: 'Tirs au but (A-B)', t: 'txt', cache: true, aide: 'En élimination directe, ex. 4-3' },
            { k: 'forfait', l: 'Forfait', t: 'choix', o: ['', 'Équipe A', 'Équipe B', 'Les deux'] },
            { k: 'marqueursA', l: 'Buteurs / marqueurs A', t: 'long', cache: true, aide: 'Ex. : KOFFI Paul (2), ADJA Rita' },
            { k: 'marqueursB', l: 'Buteurs / marqueurs B', t: 'long', cache: true }, { k: 'cartons', l: 'Avertissements et exclusions', t: 'long', cache: true },
            { k: 'arbitre', l: 'Arbitre central', t: 'txt' }, { k: 'assistants', l: 'Arbitres assistants', t: 'txt', cache: true },
            { k: 'delegue', l: 'Délégué / commissaire', t: 'txt', cache: true },
            { k: 'statut', l: 'Statut', t: 'choix', o: ['Programmé', 'Joué', 'Reporté', 'Annulé'], def: 'Programmé' }, { k: 'observations', l: 'Observations', t: 'long', cache: true }],
          docsLigne: [{ type: 'FEUILLE', l: '\uE00E Feuille de match' }] },
        { id: 'performances', titre: 'Athlétisme (performances)', coll: 'performances', niveaux: NIVEAUX, unique: ['competition', 'epreuve', 'nom', 'prenoms', 'tour'],
          lib: (r) => [String(r.nom || '').toUpperCase(), r.prenoms].filter(Boolean).join(' ') + (r.epreuve ? ' — ' + r.epreuve : ''),
          champs: [
            { k: 'competition', l: 'Compétition', t: 'ref', o: 'competitions' }, { k: 'epreuve', l: 'Épreuve', t: 'choix', o: EPREUVES, req: true },
            { k: 'nom', l: 'Nom', t: 'txt', req: true }, { k: 'prenoms', l: 'Prénoms', t: 'txt' }, { k: 'sexe', l: 'Sexe', t: 'sexe', req: true },
            { k: 'ecole', l: 'École', t: 'ecole' }, { k: 'categorie', l: 'Catégorie', t: 'choix', o: CATEGORIES }, { k: 'licence', l: 'N° de licence', t: 'txt', cache: true },
            { k: 'tour', l: 'Tour', t: 'choix', o: ['Série', 'Demi-finale', 'Finale'], def: 'Finale' },
            { k: 'performance', l: 'Performance', t: 'num', aide: 'Secondes (courses) ou mètres (sauts, lancers)' },
            { k: 'unite', l: 'Unité', t: 'calc', calc: (r) => UNITE_EPREUVE(r.epreuve) }, { k: 'date', l: 'Date', t: 'date' }, { k: 'observations', l: 'Observations', t: 'long', cache: true }] },
        { id: 'resultats', titre: 'Jeux et concours (résultats)', coll: 'resultats', niveaux: NIVEAUX, unique: ['competition', 'participant'],
          lib: (r) => r.participant || '',
          champs: [
            { k: 'competition', l: 'Compétition', t: 'ref', o: 'competitions', req: true },
            { k: 'participant', l: 'Participant (élève ou équipe)', t: 'txt', req: true }, { k: 'sexe', l: 'Sexe', t: 'sexe' }, { k: 'ecole', l: 'École', t: 'ecole' },
            { k: 'points', l: 'Points / note', t: 'num' }, { k: 'rang', l: 'Rang', t: 'num', aide: 'Calculé d’après les points s’il est laissé vide' },
            { k: 'observations', l: 'Observations', t: 'long', cache: true }] },
        { id: 'tirage', titre: 'Tirage au sort', vue: 'tirage' },
        { id: 'classements', titre: 'Classements', vue: 'classements' },
        { id: 'records', titre: 'Records', vue: 'records' },
        { id: 'palmares', titre: 'Palmarès et qualifiés', coll: 'palmares', niveaux: NIVEAUX, vue: 'palmares', unique: ['competition', 'rang', 'laureat'],
          lib: (r) => r.laureat || '',
          champs: [
            { k: 'competition', l: 'Compétition', t: 'ref', o: 'competitions', req: true }, { k: 'rang', l: 'Rang', t: 'num', req: true },
            { k: 'laureat', l: 'Lauréat (équipe ou élève)', t: 'txt', req: true }, { k: 'sexe', l: 'Sexe', t: 'sexe' }, { k: 'ecole', l: 'École', t: 'ecole' },
            { k: 'distinction', l: 'Distinction', t: 'choix', o: DISTINCTIONS }, { k: 'performance', l: 'Performance / score', t: 'txt' },
            { k: 'qualifie', l: 'Qualifié(e) au niveau supérieur', t: 'oui', def: 'Non' }, { k: 'versCompetition', l: 'Compétition du niveau supérieur', t: 'ref', o: 'competitions', cache: true }],
          docsLigne: [{ type: 'DIPLOME', l: '\uE04D Diplôme' }] }
      ]
    },
    {
      id: 'pilotage', lot: 'A', titre: 'Tableau de bord du pilotage', icone: '\uE015',
      desc: 'Indicateurs par école, UP, zone, circonscription et département : effectifs, ratios, réussite, CEP, abandons et redoublements, personnel, infrastructures, sport ; graphiques, comparaisons entre entités et entre années, export PDF et Excel.',
      onglets: [
        { id: 'tableau', titre: 'Tableau de bord', vue: 'pilotage' },
        { id: 'indicateurs', titre: 'Saisie des indicateurs', coll: 'indicateurs', niveaux: ['ECOLE'], unique: [], annee: true,
          aide: 'Une ligne par école et par année scolaire. Les valeurs saisies ici complètent ou remplacent celles que l’application calcule (fiches, effectifs, CEP).',
          lib: (r) => r.entiteLib || '',
          champs: [
            { k: 'effG', l: 'Effectif garçons', t: 'num' }, { k: 'effF', l: 'Effectif filles', t: 'num' }, { k: 'effT', l: 'Effectif total', t: 'calc', calc: total('effG', 'effF') },
            { k: 'groupes', l: 'Groupes pédagogiques', t: 'num' }, { k: 'salles', l: 'Salles de classe utilisables', t: 'num' },
            { k: 'enseignants', l: 'Enseignants (total)', t: 'num' }, { k: 'enseignantsF', l: 'Enseignantes', t: 'num' },
            { k: 'ensFE', l: 'Enseignants fonctionnaires (APE / FE)', t: 'num', cache: true }, { k: 'ensContractuels', l: 'Enseignants contractuels (ACE / ACDPE)', t: 'num', cache: true },
            { k: 'ensCommunautaires', l: 'Enseignants communautaires / volontaires', t: 'num', cache: true }, { k: 'ensAutres', l: 'Autres enseignants', t: 'num', cache: true },
            { k: 'tablesBancs', l: 'Tables-bancs en bon état', t: 'num', cache: true }, { k: 'latrines', l: 'Cabines de latrines', t: 'num', cache: true },
            { k: 'pointEau', l: 'Point d’eau', t: 'oui', cache: true }, { k: 'cantine', l: 'Cantine scolaire', t: 'oui', cache: true },
            { k: 'reussiteT1', l: 'Taux de réussite 1er trimestre (%)', t: 'num' }, { k: 'reussiteT2', l: 'Taux de réussite 2e trimestre (%)', t: 'num' },
            { k: 'reussiteT3', l: 'Taux de réussite 3e trimestre (%)', t: 'num' },
            { k: 'cepInscritsG', l: 'CEP inscrits G', t: 'num', cache: true }, { k: 'cepInscritsF', l: 'CEP inscrits F', t: 'num', cache: true },
            { k: 'cepPresentsG', l: 'CEP présents G', t: 'num', cache: true }, { k: 'cepPresentsF', l: 'CEP présents F', t: 'num', cache: true },
            { k: 'cepAdmisG', l: 'CEP admis G', t: 'num', cache: true }, { k: 'cepAdmisF', l: 'CEP admis F', t: 'num', cache: true },
            { k: 'abandonsG', l: 'Abandons G', t: 'num', cache: true }, { k: 'abandonsF', l: 'Abandons F', t: 'num', cache: true },
            { k: 'redoublantsG', l: 'Redoublants G', t: 'num', cache: true }, { k: 'redoublantsF', l: 'Redoublants F', t: 'num', cache: true },
            { k: 'observations', l: 'Observations', t: 'long', cache: true }] }
      ]
    }
  ];

  /** Indicateurs du tableau de bord (clé, libellé, unité, mode d'agrégation) */
  const INDICATEURS = [
    { k: 'ecoles', l: 'Écoles', g: 'Réseau' },
    { k: 'effG', l: 'Effectif garçons', g: 'Effectifs' }, { k: 'effF', l: 'Effectif filles', g: 'Effectifs' }, { k: 'effT', l: 'Effectif total', g: 'Effectifs' },
    { k: 'partF', l: 'Part des filles (%)', g: 'Effectifs', ratio: ['effF', 'effT', 100] },
    { k: 'groupes', l: 'Groupes pédagogiques', g: 'Encadrement' }, { k: 'enseignants', l: 'Enseignants', g: 'Encadrement' },
    { k: 'enseignantsF', l: 'Enseignantes', g: 'Encadrement' },
    { k: 'rem', l: 'Ratio élèves / maître', g: 'Encadrement', ratio: ['effT', 'enseignants', 1] },
    { k: 'reg', l: 'Élèves par groupe pédagogique', g: 'Encadrement', ratio: ['effT', 'groupes', 1] },
    { k: 'ensFE', l: 'Enseignants fonctionnaires (APE / FE)', g: 'Personnel par statut' }, { k: 'ensContractuels', l: 'Contractuels (ACE / ACDPE)', g: 'Personnel par statut' },
    { k: 'ensCommunautaires', l: 'Communautaires / volontaires', g: 'Personnel par statut' }, { k: 'ensAutres', l: 'Autres', g: 'Personnel par statut' },
    { k: 'salles', l: 'Salles de classe', g: 'Infrastructures' }, { k: 'tablesBancs', l: 'Tables-bancs en bon état', g: 'Infrastructures' },
    { k: 'places', l: 'Places assises par élève', g: 'Infrastructures', ratio: ['tablesBancs', 'effT', 2] },
    { k: 'latrines', l: 'Cabines de latrines', g: 'Infrastructures' }, { k: 'pointEau', l: 'Écoles avec point d’eau', g: 'Infrastructures' },
    { k: 'cantine', l: 'Écoles avec cantine', g: 'Infrastructures' },
    { k: 'reussiteT1', l: 'Réussite 1er trimestre (%)', g: 'Réussite', moyenne: true }, { k: 'reussiteT2', l: 'Réussite 2e trimestre (%)', g: 'Réussite', moyenne: true },
    { k: 'reussiteT3', l: 'Réussite 3e trimestre (%)', g: 'Réussite', moyenne: true },
    { k: 'cepInscrits', l: 'CEP inscrits', g: 'CEP' }, { k: 'cepPresents', l: 'CEP présents', g: 'CEP' }, { k: 'cepAdmis', l: 'CEP admis', g: 'CEP' },
    { k: 'cepTaux', l: 'Taux de réussite au CEP (%)', g: 'CEP', ratio: ['cepAdmis', 'cepPresents', 100] },
    { k: 'cepTauxG', l: 'Réussite CEP garçons (%)', g: 'CEP', ratio: ['cepAdmisG', 'cepPresentsG', 100] },
    { k: 'cepTauxF', l: 'Réussite CEP filles (%)', g: 'CEP', ratio: ['cepAdmisF', 'cepPresentsF', 100] },
    { k: 'abandons', l: 'Abandons', g: 'Parcours' }, { k: 'tauxAbandon', l: 'Taux d’abandon (%)', g: 'Parcours', ratio: ['abandons', 'effT', 100] },
    { k: 'redoublants', l: 'Redoublants', g: 'Parcours' }, { k: 'tauxRedoublement', l: 'Taux de redoublement (%)', g: 'Parcours', ratio: ['redoublants', 'effT', 100] },
    { k: 'licenciesG', l: 'Licenciés garçons', g: 'Sport scolaire' }, { k: 'licenciesF', l: 'Licenciées filles', g: 'Sport scolaire' },
    { k: 'licencies', l: 'Licenciés (total)', g: 'Sport scolaire' }, { k: 'tauxLicence', l: 'Élèves licenciés (%)', g: 'Sport scolaire', ratio: ['licencies', 'effT', 100] },
    { k: 'competitions', l: 'Compétitions organisées', g: 'Sport scolaire' }, { k: 'matchsJoues', l: 'Rencontres jouées', g: 'Sport scolaire' },
    { k: 'titres', l: 'Titres et podiums', g: 'Sport scolaire' }
  ];

  /** Documents officiels (code, intitulé, signataires) */
  const DOCUMENTS = {
    LISTE: { lib: 'Liste certifiée', sig: 'visa de l’autorité de l’entité (ou du compte)' },
    LICENCE: { lib: 'Carte de licence sportive scolaire', sig: 'président du bureau UASCEP de l’école + visa du directeur', code: 'LI' },
    PARTICIPATION: { lib: 'Attestation de participation', sig: 'président du bureau UASCEP de l’entité organisatrice + visa', code: 'AP' },
    CALENDRIER: { lib: 'Calendrier des rencontres', sig: 'secrétaire général et président du bureau UASCEP + visa', code: 'CA' },
    FEUILLE: { lib: 'Feuille de match', sig: 'arbitre central, délégué, capitaines (à la main) ; président du bureau UASCEP', code: 'FM' },
    CLASSEMENT: { lib: 'Classement officiel', sig: 'secrétaire général et président du bureau UASCEP + visa', code: 'CL' },
    PALMARES: { lib: 'Palmarès officiel', sig: 'secrétaire général et président du bureau UASCEP + visa', code: 'PA' },
    QUALIFIES: { lib: 'Liste des qualifiés pour le niveau supérieur', sig: 'président du bureau UASCEP + visa', code: 'QU' },
    DIPLOME: { lib: 'Diplôme d’honneur', sig: 'président du bureau UASCEP + visa de l’autorité', code: 'DI' },
    RECORDS: { lib: 'Tableau des records', sig: 'président du bureau UASCEP + visa', code: 'RE' },
    TABLEAU: { lib: 'Tableau de bord du pilotage', sig: 'visa de l’autorité de l’entité', code: 'TB' }
  };

  global.PVS_CATALOGUE = { NIVEAUX, DISCIPLINES, CATEGORIES, GENRES, COURS, FORMULES, PHASES, EPREUVES, UNITE_EPREUVE, DISTINCTIONS, MODULES, INDICATEURS, DOCUMENTS, categorieAge };
})(typeof window !== 'undefined' ? window : globalThis);
