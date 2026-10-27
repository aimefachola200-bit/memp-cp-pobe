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
  /** Marque d'icône (dessin commun outils/icones/icones.js) */
  const IC = (nom) => (global.Icones ? global.Icones.code(nom) + ' ' : '');
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

  const MATIERES = ['Français', 'Mathématiques', 'Éducation scientifique et technologique', 'Éducation sociale', 'Éducation artistique', 'Éducation physique et sportive', 'Anglais', 'Langue nationale', 'Autre'];
  /** Grille APC d'observation de classe : 10 critères notés de 0 à 4 (total /40 ramené sur 20) */
  const GRILLE_APC = [['c1', 'Préparation et fiche pédagogique'], ['c2', 'Situation de départ et motivation'], ['c3', 'Clarté des consignes'],
    ['c4', 'Démarche APC (travail individuel, en groupe, collectif)'], ['c5', 'Exploitation des productions des apprenants'], ['c6', 'Objectivation et retour réflexif'],
    ['c7', 'Évaluation formative et remédiation'], ['c8', 'Gestion du temps et de la classe'], ['c9', 'Tenue des documents (cahier de préparation, registres)'], ['c10', 'Climat de classe et inclusion']];
  function noteGrille(r) { const v = GRILLE_APC.map(([k]) => r[k]).filter(x => x !== '' && x != null && !isNaN(+x)); return v.length ? Math.round(10 * v.reduce((a, x) => a + Math.min(4, Math.max(0, +x)), 0) * 20 / (4 * v.length)) / 10 : ''; }
  const appreciation = (n) => (n === '' ? '' : n >= 16 ? 'Très bien' : n >= 14 ? 'Bien' : n >= 12 ? 'Assez bien' : n >= 10 ? 'Passable' : 'Insuffisant');
  /** Session d'examen par défaut : « CEP AAAA » (année de fin de l'année scolaire en cours) */
  const SESSION = () => { const d = new Date(); return 'CEP ' + (d.getMonth() >= 8 ? d.getFullYear() + 1 : d.getFullYear()); };
  const EPREUVES_CEP = [['Communication écrite (rédaction)', 1, 20], ['Lecture', 1, 20], ['Mathématiques', 1, 20], ['Éducation scientifique et technologique', 1, 20], ['Éducation sociale', 1, 20], ['Éducation physique et sportive', 1, 20], ['Éducation artistique', 1, 20]];

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
    },
    /* ===================================================== LOT B ===================================================== */
    {
      id: 'communication', lot: 'B', titre: 'Communication et alertes', icone: IC('annonce').trim(),
      desc: 'Notes de service, circulaires et convocations diffusées aux entités inférieures avec accusé de réception, boîte de réception, échéances et rappels (rapports, statistiques, examens), messages aux parents (WhatsApp, SMS, copie), agenda partagé.',
      onglets: [
        { id: 'boite', titre: 'Boîte de réception', vue: 'boite' },
        { id: 'notes', titre: 'Notes, circulaires et convocations', coll: 'notes', niveaux: NIVEAUX, unique: ['reference', 'objet'],
          lib: (r) => [r.type, r.reference ? 'n° ' + r.reference : '', r.objet].filter(Boolean).join(' — '),
          champs: [
            { k: 'type', l: 'Type', t: 'choix', o: ['Note de service', 'Circulaire', 'Convocation', 'Communiqué', 'Lettre', 'Message'], def: 'Note de service', req: true },
            { k: 'reference', l: 'Référence (n°)', t: 'txt' }, { k: 'date', l: 'Date', t: 'date', req: true }, { k: 'objet', l: 'Objet', t: 'txt', req: true },
            { k: 'destNiveau', l: 'Niveau des destinataires', t: 'choix', o: ['ECOLE', 'UP', 'ZONE', 'CS'], lib: { ECOLE: 'Écoles', UP: 'Unités pédagogiques', ZONE: 'Zones pédagogiques', CS: 'Circonscriptions' }, def: 'ECOLE', req: true },
            { k: 'destinataires', l: 'Destinataires', t: 'entites', dep: 'destNiveau', aide: 'Aucune case cochée = toutes les entités de ce niveau dans votre périmètre' },
            { k: 'texte', l: 'Texte', t: 'long', req: true, cache: true },
            { k: 'lieuReunion', l: 'Lieu (convocation)', t: 'txt', cache: true }, { k: 'dateReunion', l: 'Date de la réunion (convocation)', t: 'date', cache: true }, { k: 'heureReunion', l: 'Heure (convocation)', t: 'heure', cache: true },
            { k: 'echeance', l: 'Échéance (réponse attendue le)', t: 'date' }, { k: 'pieces', l: 'Pièces jointes / ampliations', t: 'long', cache: true },
            { k: 'signataire', l: 'Signataire (nom et qualité)', t: 'txt', cache: true },
            { k: 'accuses', l: 'Accusés de réception', t: 'calc', calc: (r, api) => (api ? api.accuses(r) : '') }],
          docsLigne: [{ type: 'NOTE', l: IC('document') + 'Note signée' }, { type: 'ACCUSES', l: IC('valider-cercle') + 'État des accusés de réception' }] },
        { id: 'echeances', titre: 'Échéances et rappels', coll: 'echeances', niveaux: NIVEAUX, unique: ['objet', 'dateLimite'],
          lib: (r) => r.objet || '',
          champs: [
            { k: 'objet', l: 'Objet', t: 'txt', req: true }, { k: 'type', l: 'Type', t: 'choix', o: ['Rapport', 'Statistiques', 'Examen', 'Réunion', 'Formation', 'Compétition', 'Paiement', 'Autre'], def: 'Rapport' },
            { k: 'dateLimite', l: 'Date limite', t: 'date', req: true }, { k: 'rappelJours', l: 'Rappel (jours avant)', t: 'num', def: 7 },
            { k: 'responsable', l: 'Responsable', t: 'txt' }, { k: 'statut', l: 'Statut', t: 'choix', o: ['À faire', 'En cours', 'Fait'], def: 'À faire' },
            { k: 'etat', l: 'État', t: 'calc', calc: (r) => { if (r.statut === 'Fait') return 'Fait'; const j = Math.round((new Date(String(r.dateLimite || '') + 'T12:00:00') - new Date()) / 864e5); return isNaN(j) ? '' : j < 0 ? 'En retard de ' + (-j) + ' j' : j <= (+r.rappelJours || 7) ? 'Dans ' + j + ' j' : 'À venir'; } },
            { k: 'observations', l: 'Observations', t: 'long', cache: true }] },
        { id: 'alertes', titre: 'Alertes', vue: 'alertes' },
        { id: 'messages', titre: 'Messages aux parents', coll: 'messages', niveaux: ['ECOLE', 'UP', 'ZONE', 'CS'], unique: ['date', 'objet'],
          lib: (r) => r.objet || '',
          champs: [
            { k: 'date', l: 'Date', t: 'date', req: true }, { k: 'objet', l: 'Objet', t: 'txt', req: true }, { k: 'texte', l: 'Message', t: 'long', req: true },
            { k: 'destinataires', l: 'Destinataires', t: 'txt', def: 'Tous les parents d’élèves' }, { k: 'canal', l: 'Canal', t: 'choix', o: ['WhatsApp', 'SMS', 'Affichage', 'Réunion des parents', 'Crieur public', 'Radio communautaire'], def: 'WhatsApp' },
            { k: 'envoye', l: 'Envoyé', t: 'oui', def: 'Non' }],
          actionsLigne: [{ id: 'whatsapp', l: IC('message') + 'WhatsApp' }, { id: 'sms', l: IC('telephone') + 'SMS' }, { id: 'copier', l: IC('presse-papiers') + 'Copier' }] },
        { id: 'agenda', titre: 'Agenda partagé', coll: 'agenda', niveaux: NIVEAUX, vue: 'agenda', unique: ['date', 'objet'],
          lib: (r) => r.objet || '',
          champs: [
            { k: 'date', l: 'Date', t: 'date', req: true }, { k: 'heureDebut', l: 'Heure de début', t: 'heure' }, { k: 'heureFin', l: 'Heure de fin', t: 'heure' },
            { k: 'objet', l: 'Objet', t: 'txt', req: true }, { k: 'type', l: 'Type', t: 'choix', o: ['Réunion', 'Formation', 'Animation pédagogique', 'Visite', 'Compétition', 'Examen', 'Cérémonie', 'Autre'], def: 'Réunion' },
            { k: 'lieu', l: 'Lieu', t: 'txt' }, { k: 'participants', l: 'Participants', t: 'long', cache: true }, { k: 'organisateur', l: 'Organisateur', t: 'txt' }] },
        { id: 'lectures', titre: 'Accusés de réception', coll: 'lectures', niveaux: NIVEAUX, unique: ['note'],
          lib: (r, api) => (api ? api.libRef('notes', r.note) : ''),
          champs: [{ k: 'note', l: 'Note', t: 'ref', o: 'notes', req: true }, { k: 'date', l: 'Date', t: 'date', req: true }, { k: 'lecteur', l: 'Lecteur', t: 'txt' }, { k: 'observations', l: 'Observations', t: 'long', cache: true }] }
      ]
    },
    {
      id: 'sante', lot: 'B', titre: 'Santé, cantine et inclusion', icone: IC('sante').trim(),
      desc: 'Visites médicales et aptitude sportive (reportée sur les licences), registre de l’infirmerie et des incidents, cantine scolaire (bénéficiaires, rations, stocks), élèves à besoins spécifiques, scolarisation des filles, absences et alertes de décrochage.',
      onglets: [
        { id: 'visites', titre: 'Visites médicales', coll: 'visitesMed', niveaux: ['ECOLE'], unique: ['nom', 'prenoms', 'dateVisite'],
          lib: (r) => [String(r.nom || '').toUpperCase(), r.prenoms].filter(Boolean).join(' '),
          champs: [
            { k: 'nom', l: 'Nom', t: 'txt', req: true }, { k: 'prenoms', l: 'Prénoms', t: 'txt', req: true }, { k: 'sexe', l: 'Sexe', t: 'sexe', req: true },
            { k: 'dateNaissance', l: 'Date de naissance', t: 'date', cache: true }, { k: 'cours', l: 'Cours', t: 'choix', o: COURS },
            { k: 'dateVisite', l: 'Date de la visite', t: 'date', req: true }, { k: 'examinateur', l: 'Examinateur (agent de santé)', t: 'txt' },
            { k: 'poids', l: 'Poids (kg)', t: 'num' }, { k: 'taille', l: 'Taille (cm)', t: 'num' },
            { k: 'imc', l: 'IMC', t: 'calc', calc: (r) => (+r.poids && +r.taille ? Math.round(10 * r.poids / Math.pow(r.taille / 100, 2)) / 10 : '') },
            { k: 'vue', l: 'Vue', t: 'choix', o: ['Normale', 'À surveiller', 'Déficiente'] }, { k: 'audition', l: 'Audition', t: 'choix', o: ['Normale', 'À surveiller', 'Déficiente'] },
            { k: 'dentition', l: 'Dentition', t: 'choix', o: ['Bonne', 'Caries', 'À soigner'], cache: true }, { k: 'vaccination', l: 'Vaccination', t: 'choix', o: ['À jour', 'Incomplète', 'Inconnue'] },
            { k: 'aptitude', l: 'Aptitude sportive', t: 'choix', o: ['Apte', 'Apte avec réserve', 'Inapte'], req: true },
            { k: 'reserve', l: 'Réserves / contre-indications', t: 'txt', cache: true }, { k: 'orientation', l: 'Orientation / soins conseillés', t: 'long', cache: true }],
          docsLigne: [{ type: 'APTITUDE', l: IC('valider-cercle') + 'Certificat d’aptitude sportive' }, { type: 'FICHE_SANTE', l: IC('sante') + 'Fiche de visite médicale' }] },
        { id: 'infirmerie', titre: 'Infirmerie et incidents', coll: 'infirmerie', niveaux: ['ECOLE'], unique: ['date', 'heure', 'nom', 'prenoms'],
          lib: (r) => [String(r.nom || '').toUpperCase(), r.prenoms, r.nature].filter(Boolean).join(' — '),
          champs: [
            { k: 'date', l: 'Date', t: 'date', req: true }, { k: 'heure', l: 'Heure', t: 'heure' }, { k: 'nom', l: 'Nom', t: 'txt', req: true }, { k: 'prenoms', l: 'Prénoms', t: 'txt' },
            { k: 'sexe', l: 'Sexe', t: 'sexe' }, { k: 'cours', l: 'Cours', t: 'choix', o: COURS },
            { k: 'nature', l: 'Nature', t: 'choix', o: ['Maladie', 'Blessure', 'Accident', 'Malaise', 'Morsure / piqûre', 'Conflit / violence', 'Autre'], req: true },
            { k: 'circonstances', l: 'Circonstances', t: 'long', cache: true }, { k: 'soins', l: 'Premiers soins', t: 'long', cache: true },
            { k: 'orientation', l: 'Orientation', t: 'choix', o: ['Retour en classe', 'Renvoyé(e) à la maison', 'Centre de santé', 'Hôpital'] },
            { k: 'parentInforme', l: 'Parent informé', t: 'oui' }, { k: 'suivi', l: 'Suivi', t: 'long', cache: true }] },
        { id: 'cantine', titre: 'Cantine : journal des repas', coll: 'cantine', niveaux: ['ECOLE'], unique: ['date', 'repas'],
          lib: (r) => (r.date || '') + ' ' + (r.repas || ''),
          champs: [
            { k: 'date', l: 'Date', t: 'date', req: true }, { k: 'repas', l: 'Repas', t: 'choix', o: ['Petit-déjeuner', 'Déjeuner', 'Collation'], def: 'Déjeuner' },
            { k: 'prevusG', l: 'Bénéficiaires prévus G', t: 'num' }, { k: 'prevusF', l: 'Bénéficiaires prévus F', t: 'num' },
            { k: 'servisG', l: 'Repas servis G', t: 'num' }, { k: 'servisF', l: 'Repas servis F', t: 'num' },
            { k: 'servis', l: 'Total servis', t: 'calc', calc: total('servisG', 'servisF') }, { k: 'menu', l: 'Menu', t: 'txt' },
            { k: 'cuisinieres', l: 'Cuisinières / cuisiniers', t: 'num', cache: true }, { k: 'observations', l: 'Observations', t: 'long', cache: true }],
          docsLigne: [] },
        { id: 'stocks', titre: 'Cantine : stocks', coll: 'stocks', niveaux: ['ECOLE'], vue: 'stocks', unique: ['date', 'denree', 'mouvement', 'piece'],
          lib: (r) => (r.denree || '') + ' ' + (r.mouvement || ''),
          champs: [
            { k: 'date', l: 'Date', t: 'date', req: true }, { k: 'denree', l: 'Denrée', t: 'choix', o: ['Riz', 'Maïs', 'Haricot / niébé', 'Huile', 'Sel', 'Sucre', 'Poisson / sardine', 'Farine enrichie', 'Gari', 'Légumes', 'Autre'], req: true },
            { k: 'mouvement', l: 'Mouvement', t: 'choix', o: ['Entrée', 'Sortie'], req: true }, { k: 'quantite', l: 'Quantité', t: 'num', req: true },
            { k: 'unite', l: 'Unité', t: 'choix', o: ['kg', 'litre', 'sac de 50 kg', 'sac de 25 kg', 'boîte', 'carton'], def: 'kg' },
            { k: 'provenance', l: 'Provenance / destination', t: 'txt', aide: 'Ex. : PAM, État, parents, don ; repas du jour' }, { k: 'piece', l: 'N° de bordereau / pièce', t: 'txt' },
            { k: 'observations', l: 'Observations', t: 'long', cache: true }] },
        { id: 'besoins', titre: 'Élèves à besoins spécifiques', coll: 'besoinsSpec', niveaux: ['ECOLE'], unique: ['nom', 'prenoms', 'type'],
          lib: (r) => [String(r.nom || '').toUpperCase(), r.prenoms].filter(Boolean).join(' '),
          champs: [
            { k: 'nom', l: 'Nom', t: 'txt', req: true }, { k: 'prenoms', l: 'Prénoms', t: 'txt' }, { k: 'sexe', l: 'Sexe', t: 'sexe' }, { k: 'cours', l: 'Cours', t: 'choix', o: COURS },
            { k: 'type', l: 'Type de besoin', t: 'choix', o: ['Handicap moteur', 'Handicap visuel', 'Handicap auditif', 'Déficience intellectuelle', 'Troubles des apprentissages', 'Maladie chronique', 'Albinisme', 'Orphelin / vulnérable', 'Autre'], req: true },
            { k: 'description', l: 'Description', t: 'long', cache: true }, { k: 'amenagements', l: 'Aménagements pédagogiques', t: 'long' },
            { k: 'partenaire', l: 'Partenaire / prise en charge', t: 'txt' }, { k: 'statut', l: 'Suivi', t: 'choix', o: ['En cours', 'Pris en charge', 'Orienté', 'Clos'], def: 'En cours' }],
          docsLigne: [{ type: 'INCLUSION', l: IC('accessibilite') + 'Fiche de suivi' }] },
        { id: 'filles', titre: 'Scolarisation des filles', coll: 'filles', niveaux: ['ECOLE'], unique: [], annee: true,
          lib: (r) => r.entiteLib || '',
          champs: [
            { k: 'inscrites', l: 'Filles inscrites', t: 'num' }, { k: 'garcons', l: 'Garçons inscrits', t: 'num' },
            { k: 'indice', l: 'Indice de parité (F/G)', t: 'calc', calc: (r) => (+r.garcons ? Math.round(100 * r.inscrites / r.garcons) / 100 : '') },
            { k: 'nouvellesCI', l: 'Nouvelles inscrites au CI', t: 'num' }, { k: 'abandons', l: 'Abandons de filles', t: 'num' },
            { k: 'fillesCM2', l: 'Filles au CM2', t: 'num' }, { k: 'admisesCEP', l: 'Filles admises au CEP', t: 'num' },
            { k: 'mentorat', l: 'Mentorat / marrainage', t: 'oui' }, { k: 'club', l: 'Club des filles', t: 'oui' },
            { k: 'actions', l: 'Actions menées', t: 'long', cache: true }, { k: 'obstacles', l: 'Obstacles relevés', t: 'long', cache: true }] },
        { id: 'decrochage', titre: 'Absences et décrochage', coll: 'decrochage', niveaux: ['ECOLE'], vue: 'decrochage', unique: ['nom', 'prenoms', 'dateSignalement'],
          lib: (r) => [String(r.nom || '').toUpperCase(), r.prenoms].filter(Boolean).join(' '),
          champs: [
            { k: 'nom', l: 'Nom', t: 'txt', req: true }, { k: 'prenoms', l: 'Prénoms', t: 'txt' }, { k: 'sexe', l: 'Sexe', t: 'sexe' }, { k: 'cours', l: 'Cours', t: 'choix', o: COURS },
            { k: 'absences', l: 'Demi-journées d’absence', t: 'num' }, { k: 'periode', l: 'Période', t: 'txt' }, { k: 'dateSignalement', l: 'Date du signalement', t: 'date', req: true },
            { k: 'motif', l: 'Motif', t: 'choix', o: ['Maladie', 'Travaux domestiques', 'Travail des enfants', 'Mariage / grossesse précoce', 'Migration / déménagement', 'Éloignement de l’école', 'Difficultés scolaires', 'Manque de moyens', 'Inconnu', 'Autre'] },
            { k: 'actions', l: 'Actions (visite, entretien, médiation…)', t: 'long', cache: true },
            { k: 'statut', l: 'Statut', t: 'choix', o: ['Signalé', 'En suivi', 'Réintégré', 'Abandon définitif'], def: 'Signalé' }, { k: 'observations', l: 'Observations', t: 'long', cache: true }],
          docsLigne: [{ type: 'DECROCHAGE', l: IC('alerte') + 'Fiche de signalement' }] }
      ]
    },
    /* ===================================================== LOT C ===================================================== */
    {
      id: 'inspection', lot: 'C', titre: 'Inspection et formation', icone: IC('inspection').trim(),
      desc: 'Visites de classe avec grille APC notée, comptes rendus signés, suivi des recommandations, plans de formation, animations pédagogiques d’UP et de zone (présences, thèmes, comptes rendus), attestations de participation signées avec QR.',
      onglets: [
        { id: 'visites', titre: 'Visites de classe (grille APC)', coll: 'visitesClasse', niveaux: ['ECOLE'], unique: ['enseignant', 'date'],
          lib: (r) => (r.enseignant || '') + (r.date ? ' — ' + r.date : ''),
          champs: [
            { k: 'enseignant', l: 'Enseignant(e)', t: 'txt', req: true }, { k: 'sexeEns', l: 'Sexe de l’enseignant(e)', t: 'sexe', cache: true }, { k: 'cours', l: 'Cours', t: 'choix', o: COURS },
            { k: 'date', l: 'Date de la visite', t: 'date', req: true }, { k: 'visiteur', l: 'Visiteur', t: 'txt', req: true },
            { k: 'qualiteVisiteur', l: 'Qualité du visiteur', t: 'choix', o: ['Directeur / Directrice', 'Conseiller pédagogique', 'Chef de circonscription', 'Inspecteur', 'Autre'], def: 'Conseiller pédagogique' },
            { k: 'typeVisite', l: 'Type de visite', t: 'choix', o: ['Visite de classe', 'Visite conseil', 'Inspection', 'Contre-visite'], def: 'Visite de classe' },
            { k: 'discipline', l: 'Discipline', t: 'choix', o: MATIERES }, { k: 'seance', l: 'Séance / situation d’apprentissage', t: 'txt', cache: true },
            ...GRILLE_APC.map(([k, l]) => ({ k, l, t: 'num', cache: true, aide: 'Note de 0 à 4' })),
            { k: 'note', l: 'Note (/20)', t: 'calc', calc: noteGrille }, { k: 'appreciation', l: 'Appréciation', t: 'calc', calc: (r) => appreciation(noteGrille(r)) },
            { k: 'pointsForts', l: 'Points forts', t: 'long', cache: true }, { k: 'insuffisances', l: 'Insuffisances', t: 'long', cache: true },
            { k: 'recommandations', l: 'Recommandations', t: 'long', cache: true }],
          docsLigne: [{ type: 'CR_VISITE', l: IC('document') + 'Compte rendu de visite' }] },
        { id: 'recommandations', titre: 'Suivi des recommandations', coll: 'recommandations', niveaux: NIVEAUX, vue: 'suiviReco', unique: ['recommandation', 'destinataire'],
          lib: (r) => String(r.recommandation || '').slice(0, 60),
          champs: [
            { k: 'visite', l: 'Visite de classe', t: 'ref', o: 'visitesClasse' }, { k: 'destinataire', l: 'Destinataire', t: 'txt', req: true },
            { k: 'recommandation', l: 'Recommandation', t: 'long', req: true }, { k: 'echeance', l: 'Échéance', t: 'date' }, { k: 'responsable', l: 'Responsable du suivi', t: 'txt' },
            { k: 'statut', l: 'Statut', t: 'choix', o: ['Non commencée', 'En cours', 'Réalisée', 'Abandonnée'], def: 'Non commencée' },
            { k: 'dateVerification', l: 'Date de vérification', t: 'date', cache: true }, { k: 'observations', l: 'Observations', t: 'long', cache: true }] },
        { id: 'plans', titre: 'Plans de formation', coll: 'plansFormation', niveaux: NIVEAUX, unique: ['theme', 'dateDebut'],
          lib: (r) => r.theme || '',
          champs: [
            { k: 'theme', l: 'Thème', t: 'txt', req: true }, { k: 'publicCible', l: 'Public cible', t: 'choix', o: ['Directeurs', 'Enseignants', 'Enseignants du CI / CP', 'Enseignants du CE', 'Enseignants du CM', 'Éducatrices / éducateurs (maternelle)', 'Conseillers pédagogiques', 'Tous'], def: 'Enseignants' },
            { k: 'objectifs', l: 'Objectifs', t: 'long', cache: true }, { k: 'dateDebut', l: 'Date de début', t: 'date' }, { k: 'dateFin', l: 'Date de fin', t: 'date' },
            { k: 'formateur', l: 'Formateur(s)', t: 'txt' }, { k: 'lieu', l: 'Lieu', t: 'txt' }, { k: 'modalite', l: 'Modalité', t: 'choix', o: ['Présentiel', 'À distance', 'Mixte'], def: 'Présentiel' },
            { k: 'participantsPrevus', l: 'Participants prévus', t: 'num' }, { k: 'cout', l: 'Coût prévu (FCFA)', t: 'num' }, { k: 'financement', l: 'Financement', t: 'txt', cache: true },
            { k: 'statut', l: 'Statut', t: 'choix', o: ['Prévue', 'En cours', 'Réalisée', 'Reportée', 'Annulée'], def: 'Prévue' }] },
        { id: 'animations', titre: 'Animations pédagogiques', coll: 'animations', niveaux: NIVEAUX, unique: ['date', 'theme'],
          lib: (r) => (r.type || '') + ' — ' + (r.theme || ''),
          champs: [
            { k: 'type', l: 'Type', t: 'choix', o: ['Animation pédagogique d’UP', 'Animation de zone', 'Journée pédagogique', 'Formation', 'Atelier', 'Conférence pédagogique'], def: 'Animation pédagogique d’UP', req: true },
            { k: 'date', l: 'Date', t: 'date', req: true }, { k: 'theme', l: 'Thème', t: 'txt', req: true }, { k: 'animateur', l: 'Animateur / animatrice', t: 'txt' }, { k: 'lieu', l: 'Lieu', t: 'txt' },
            { k: 'presentsH', l: 'Présents (hommes)', t: 'num' }, { k: 'presentsF', l: 'Présentes (femmes)', t: 'num' }, { k: 'presents', l: 'Total présents', t: 'calc', calc: total('presentsH', 'presentsF') },
            { k: 'participants', l: 'Liste des participants', t: 'long', cache: true, aide: 'Une personne par ligne : NOM Prénoms — école / fonction' },
            { k: 'compteRendu', l: 'Compte rendu', t: 'long', cache: true }],
          docsLigne: [{ type: 'CR_ANIMATION', l: IC('document') + 'Compte rendu et liste de présence' }, { type: 'ATTEST_FORMATION', l: IC('attestation') + 'Attestations de participation' }] }
      ]
    },
    {
      id: 'patrimoine', lot: 'C', titre: 'Patrimoine et matériel', icone: IC('patrimoine').trim(),
      desc: 'Bâtiments et salles (état), tables-bancs et besoins, manuels par cours et matière, matériel didactique et sportif, besoins exprimés, dotations reçues avec procès-verbal de réception signé.',
      onglets: [
        { id: 'batiments', titre: 'Bâtiments et salles', coll: 'batiments', niveaux: ['ECOLE'], unique: ['designation'],
          lib: (r) => r.designation || '',
          champs: [
            { k: 'designation', l: 'Désignation', t: 'txt', req: true, aide: 'Ex. : Module de 3 classes, salle du CM1' },
            { k: 'nature', l: 'Nature', t: 'choix', o: ['Salle de classe', 'Bureau', 'Magasin', 'Bibliothèque', 'Cantine / cuisine', 'Latrines', 'Logement', 'Clôture', 'Point d’eau', 'Autre'], def: 'Salle de classe', req: true },
            { k: 'nombre', l: 'Nombre', t: 'num', def: 1 }, { k: 'materiaux', l: 'Matériaux', t: 'choix', o: ['Définitif', 'Semi-dur', 'Provisoire / paillote'], def: 'Définitif' },
            { k: 'annee', l: 'Année de construction', t: 'num' }, { k: 'etat', l: 'État', t: 'choix', o: ['Bon', 'Passable', 'Mauvais', 'À réhabiliter', 'Inutilisable'], def: 'Bon', req: true },
            { k: 'financement', l: 'Financement', t: 'txt' }, { k: 'observations', l: 'Observations', t: 'long', cache: true }] },
        { id: 'tables', titre: 'Tables-bancs', coll: 'tablesBancs', niveaux: ['ECOLE'], unique: ['cours'], annee: true,
          lib: (r) => r.cours || '',
          champs: [
            { k: 'cours', l: 'Cours', t: 'choix', o: COURS.concat(['Toute l’école']), req: true }, { k: 'eleves', l: 'Élèves', t: 'num' },
            { k: 'tablesBon', l: 'Tables-bancs en bon état', t: 'num' }, { k: 'tablesMauvais', l: 'Tables-bancs en mauvais état', t: 'num' }, { k: 'places', l: 'Places par table-banc', t: 'num', def: 2 },
            { k: 'besoin', l: 'Besoin en tables-bancs', t: 'calc', calc: (r) => (+r.eleves ? Math.max(0, Math.ceil(r.eleves / (+r.places || 2)) - (+r.tablesBon || 0)) : '') }] },
        { id: 'manuels', titre: 'Manuels scolaires', coll: 'manuels', niveaux: ['ECOLE'], unique: ['cours', 'matiere', 'titre'], annee: true,
          lib: (r) => (r.cours || '') + ' — ' + (r.matiere || ''),
          champs: [
            { k: 'cours', l: 'Cours', t: 'choix', o: COURS, req: true }, { k: 'matiere', l: 'Matière', t: 'choix', o: MATIERES, req: true }, { k: 'titre', l: 'Titre du manuel', t: 'txt' },
            { k: 'nombre', l: 'Exemplaires', t: 'num' }, { k: 'bonEtat', l: 'En bon état', t: 'num' }, { k: 'eleves', l: 'Élèves du cours', t: 'num' },
            { k: 'ratio', l: 'Manuels par élève', t: 'calc', calc: (r) => (+r.eleves ? Math.round(100 * (+r.bonEtat || 0) / r.eleves) / 100 : '') }] },
        { id: 'materiel', titre: 'Matériel didactique et sportif', coll: 'materielEcole', niveaux: NIVEAUX, unique: ['designation', 'categorie'],
          lib: (r) => r.designation || '',
          champs: [
            { k: 'designation', l: 'Désignation', t: 'txt', req: true }, { k: 'categorie', l: 'Catégorie', t: 'choix', o: ['Didactique', 'Sportif', 'Informatique', 'Mobilier', 'Hygiène', 'Autre'], def: 'Didactique' },
            { k: 'quantite', l: 'Quantité', t: 'num', req: true }, { k: 'etat', l: 'État', t: 'choix', o: ['Bon', 'Usagé', 'À réparer', 'Hors d’usage'], def: 'Bon' },
            { k: 'origine', l: 'Origine', t: 'choix', o: ['Achat', 'Don', 'Dotation', 'Prêt'] }, { k: 'date', l: 'Date d’acquisition', t: 'date', cache: true },
            { k: 'valeur', l: 'Valeur (FCFA)', t: 'num', cache: true }, { k: 'observations', l: 'Observations', t: 'long', cache: true }] },
        { id: 'besoins', titre: 'Besoins exprimés', coll: 'besoinsMat', niveaux: NIVEAUX, unique: ['designation'],
          lib: (r) => r.designation || '',
          champs: [
            { k: 'designation', l: 'Désignation', t: 'txt', req: true }, { k: 'categorie', l: 'Catégorie', t: 'choix', o: ['Construction', 'Réhabilitation', 'Mobilier', 'Manuels', 'Matériel didactique', 'Matériel sportif', 'Équipement', 'Personnel', 'Autre'], def: 'Mobilier' },
            { k: 'quantite', l: 'Quantité', t: 'num' }, { k: 'priorite', l: 'Priorité', t: 'choix', o: ['Haute', 'Moyenne', 'Basse'], def: 'Moyenne' },
            { k: 'coutEstime', l: 'Coût estimé (FCFA)', t: 'num' }, { k: 'justification', l: 'Justification', t: 'long', cache: true },
            { k: 'statut', l: 'Statut', t: 'choix', o: ['Exprimé', 'Transmis', 'Satisfait partiellement', 'Satisfait'], def: 'Exprimé' }] },
        { id: 'dotations', titre: 'Dotations reçues', coll: 'dotations', niveaux: NIVEAUX, unique: ['date', 'designation'],
          lib: (r) => (r.designation || '') + (r.date ? ' — ' + r.date : ''),
          champs: [
            { k: 'date', l: 'Date de réception', t: 'date', req: true }, { k: 'designation', l: 'Désignation', t: 'txt', req: true }, { k: 'quantite', l: 'Quantité', t: 'num', req: true },
            { k: 'unite', l: 'Unité', t: 'txt', def: 'unité' }, { k: 'source', l: 'Source', t: 'choix', o: ['État', 'Commune', 'Partenaire / ONG', 'Parents d’élèves', 'Don privé'], def: 'État' },
            { k: 'beneficiaire', l: 'École bénéficiaire', t: 'ecole' }, { k: 'pvNumero', l: 'N° du PV de réception', t: 'txt' },
            { k: 'receptionnaire', l: 'Réceptionnaire', t: 'txt' }, { k: 'etatReception', l: 'État à la réception', t: 'choix', o: ['Conforme', 'Non conforme', 'Incomplet'], def: 'Conforme' },
            { k: 'observations', l: 'Observations', t: 'long', cache: true }],
          docsLigne: [{ type: 'PV_RECEPTION', l: IC('attestation') + 'PV de réception' }] }
      ]
    },
    {
      id: 'examens', lot: 'C', titre: 'Examens et concours', icone: IC('examen').trim(),
      desc: 'CEP de bout en bout : épreuves, centres, jurys, candidats, numéros de table et salles, saisie des notes, délibération, résultats et statistiques, relevés de notes, convocations, listes d’admis ; concours scolaires (dictée, calcul mental, culture générale, génies en herbe, dessin, chant) et palmarès.',
      onglets: [
        { id: 'epreuves', titre: 'Épreuves', coll: 'epreuves', niveaux: ['CS', 'ZONE', 'DDEMP', 'ECOLE', 'UP'], vue: 'epreuvesDefaut', unique: ['session', 'epreuve'],
          lib: (r) => r.epreuve || '',
          champs: [{ k: 'session', l: 'Session', t: 'txt', req: true, def: SESSION() }, { k: 'epreuve', l: 'Épreuve', t: 'txt', req: true }, { k: 'coefficient', l: 'Coefficient', t: 'num', def: 1 },
            { k: 'bareme', l: 'Noté sur', t: 'num', def: 20 }, { k: 'ordre', l: 'Ordre', t: 'num' }] },
        { id: 'centres', titre: 'Centres', coll: 'centres', niveaux: NIVEAUX, unique: ['session', 'centre'],
          lib: (r) => r.centre || '',
          champs: [{ k: 'session', l: 'Session', t: 'txt', req: true, def: SESSION() }, { k: 'centre', l: 'Centre', t: 'txt', req: true }, { k: 'code', l: 'Code du centre', t: 'txt', aide: 'Préfixe des numéros de table (ex. POB1)' },
            { k: 'ecoleSiege', l: 'École siège', t: 'ecole' }, { k: 'chefCentre', l: 'Chef de centre', t: 'txt' }, { k: 'salles', l: 'Salles', t: 'num', def: 1 }, { k: 'capacite', l: 'Places par salle', t: 'num', def: 30 }] },
        { id: 'jurys', titre: 'Jurys', coll: 'jurys', niveaux: NIVEAUX, unique: ['session', 'centre'],
          lib: (r, api) => 'Jury — ' + (api ? api.libRef('centres', r.centre) : ''),
          champs: [{ k: 'session', l: 'Session', t: 'txt', req: true, def: SESSION() }, { k: 'centre', l: 'Centre', t: 'ref', o: 'centres', req: true }, { k: 'president', l: 'Président(e) du jury', t: 'txt', req: true },
            { k: 'vicePresident', l: 'Vice-président(e)', t: 'txt' }, { k: 'secretaire', l: 'Secrétaire', t: 'txt' }, { k: 'membres', l: 'Membres (un par ligne)', t: 'long', cache: true }, { k: 'date', l: 'Date de délibération', t: 'date' }] },
        { id: 'candidats', titre: 'Candidats', coll: 'candidats', niveaux: ['ECOLE'], unique: ['session', 'nom', 'prenoms', 'dateNaissance'],
          lib: (r) => [r.numeroTable, String(r.nom || '').toUpperCase(), r.prenoms].filter(Boolean).join(' '),
          champs: [{ k: 'session', l: 'Session', t: 'txt', req: true, def: SESSION() }, { k: 'numeroTable', l: 'N° de table', t: 'txt' }, { k: 'nom', l: 'Nom', t: 'txt', req: true }, { k: 'prenoms', l: 'Prénoms', t: 'txt', req: true },
            { k: 'sexe', l: 'Sexe', t: 'sexe', req: true }, { k: 'dateNaissance', l: 'Date de naissance', t: 'date' }, { k: 'lieuNaissance', l: 'Lieu de naissance', t: 'txt', cache: true },
            { k: 'centre', l: 'Centre', t: 'ref', o: 'centres' }, { k: 'salle', l: 'Salle', t: 'txt' }, { k: 'statut', l: 'Statut', t: 'choix', o: ['Inscrit', 'Absent', 'Abandon', 'Exclu'], def: 'Inscrit' },
            { k: 'moyenne', l: 'Moyenne', t: 'calc', calc: (r) => (r.moyenne == null ? '' : r.moyenne) }, { k: 'decision', l: 'Décision', t: 'calc', calc: (r) => r.decision || '' }],
          docsLigne: [{ type: 'CONVOCATION_CAND', l: IC('carte-identite') + 'Convocation du candidat' }, { type: 'RELEVE', l: IC('document') + 'Relevé de notes' }] },
        { id: 'notes', titre: 'Saisie des notes', vue: 'notesCep' },
        { id: 'deliberation', titre: 'Délibération et résultats', vue: 'deliberation' },
        { id: 'concours', titre: 'Concours scolaires', coll: 'concours', niveaux: NIVEAUX, unique: ['intitule'],
          lib: (r) => r.intitule || '',
          champs: [{ k: 'intitule', l: 'Intitulé', t: 'txt', req: true }, { k: 'type', l: 'Type', t: 'choix', o: ['Dictée', 'Calcul mental', 'Culture générale', 'Génies en herbe', 'Lecture', 'Dessin', 'Chant / poésie', 'Rédaction', 'Autre'], def: 'Dictée', req: true },
            { k: 'cours', l: 'Cours / catégorie', t: 'txt' }, { k: 'date', l: 'Date', t: 'date' }, { k: 'lieu', l: 'Lieu', t: 'txt' }, { k: 'organisateur', l: 'Organisateur', t: 'txt', cache: true },
            { k: 'bareme', l: 'Noté sur', t: 'num', def: 20 }, { k: 'statut', l: 'Statut', t: 'choix', o: ['Programmé', 'Réalisé', 'Annulé'], def: 'Programmé' }],
          docsLigne: [{ type: 'PALMARES_CONCOURS', l: IC('trophee') + 'Palmarès du concours' }] },
        { id: 'participants', titre: 'Participants et notes', coll: 'participants', niveaux: NIVEAUX, unique: ['concours', 'nom', 'prenoms'],
          lib: (r) => [String(r.nom || '').toUpperCase(), r.prenoms].filter(Boolean).join(' '),
          champs: [{ k: 'concours', l: 'Concours', t: 'ref', o: 'concours', req: true }, { k: 'nom', l: 'Nom', t: 'txt', req: true }, { k: 'prenoms', l: 'Prénoms', t: 'txt' }, { k: 'sexe', l: 'Sexe', t: 'sexe' },
            { k: 'ecole', l: 'École', t: 'ecole' }, { k: 'cours', l: 'Cours', t: 'choix', o: COURS }, { k: 'points', l: 'Note / points', t: 'num' }, { k: 'rang', l: 'Rang', t: 'num', aide: 'Calculé d’après la note s’il est laissé vide' }],
          docsLigne: [{ type: 'PRIX', l: IC('medaille') + 'Diplôme / prix' }] }
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
    { k: 'titres', l: 'Titres et podiums', g: 'Sport scolaire' },
    { k: 'ebComposes', l: 'Examen blanc : ont composé', g: 'Examen blanc' }, { k: 'ebAdmis', l: 'Examen blanc : seuil atteint', g: 'Examen blanc' },
    { k: 'ebTaux', l: 'Examen blanc : taux de réussite (%)', g: 'Examen blanc', ratio: ['ebAdmis', 'ebComposes', 100] }
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
    TABLEAU: { lib: 'Tableau de bord du pilotage', sig: 'visa de l’autorité de l’entité', code: 'TB' },
    NOTE: { lib: 'Note de service / circulaire / convocation', sig: 'autorité émettrice (visa : signature et cachet de l’entité)', code: 'NS' },
    ACCUSES: { lib: 'État des accusés de réception', sig: 'autorité émettrice', code: 'AR' },
    AGENDA: { lib: 'Agenda des activités', sig: 'autorité de l’entité', code: 'AG' },
    APTITUDE: { lib: 'Certificat d’aptitude à la pratique sportive scolaire', sig: 'examinateur (à la main) + visa du directeur', code: 'AS' },
    FICHE_SANTE: { lib: 'Fiche de visite médicale scolaire', sig: 'examinateur (à la main) + visa du directeur', code: 'FS' },
    STOCK: { lib: 'État du stock de la cantine scolaire', sig: 'gestionnaire (à la main) + visa du directeur', code: 'ST' },
    CANTINE: { lib: 'Journal de la cantine scolaire', sig: 'gestionnaire (à la main) + visa du directeur', code: 'CN' },
    INCLUSION: { lib: 'Fiche de suivi d’un élève à besoins spécifiques', sig: 'enseignant titulaire (à la main) + visa du directeur', code: 'IN' },
    DECROCHAGE: { lib: 'Fiche de signalement d’absentéisme / décrochage', sig: 'enseignant titulaire (à la main) + visa du directeur', code: 'SD' },
    CR_VISITE: { lib: 'Compte rendu de visite de classe', sig: 'visiteur + enseignant(e) visité(e) (à la main) + visa du directeur', code: 'VC' },
    CR_ANIMATION: { lib: 'Compte rendu d’animation pédagogique et liste de présence', sig: 'animateur + autorité de l’entité', code: 'AN' },
    ATTEST_FORMATION: { lib: 'Attestation de participation à une formation / animation', sig: 'autorité de l’entité organisatrice', code: 'AF' },
    PV_RECEPTION: { lib: 'Procès-verbal de réception de dotation', sig: 'réceptionnaire + livreur (à la main) + visa de l’autorité', code: 'PR' },
    CONVOCATION_CAND: { lib: 'Convocation du candidat', sig: 'chef de centre + visa de l’autorité', code: 'CC' },
    RELEVE: { lib: 'Relevé de notes', sig: 'président du jury + visa de l’autorité', code: 'RN' },
    PV_DELIBERATION: { lib: 'Procès-verbal de délibération', sig: 'président, vice-président, secrétaire du jury + visa de l’autorité', code: 'PD' },
    LISTE_ADMIS: { lib: 'Liste des candidats admis', sig: 'président du jury + visa de l’autorité', code: 'LA' },
    PALMARES_CONCOURS: { lib: 'Palmarès du concours', sig: 'organisateur + autorité de l’entité', code: 'PC' },
    PRIX: { lib: 'Diplôme de lauréat (concours)', sig: 'autorité de l’entité organisatrice', code: 'PX' }
  };

  global.PVS_CATALOGUE = { MATIERES, GRILLE_APC, noteGrille, appreciation, SESSION, EPREUVES_CEP, NIVEAUX, DISCIPLINES, CATEGORIES, GENRES, COURS, FORMULES, PHASES, EPREUVES, UNITE_EPREUVE, DISTINCTIONS, MODULES, INDICATEURS, DOCUMENTS, categorieAge };
})(typeof window !== 'undefined' ? window : globalThis);
