/* ÉduGestion Pro Master — données de démarrage.
   Référentiels nationaux (départements, communes, 118 circonscriptions et leurs zones),
   matières, règles, modèles. Aucune école, aucun élève : tout se saisit dans l'application.
   Tout est modifiable dans l'application : rien n'est figé dans le code. */
(function (global) {
  'use strict';
  const EG = global.EG;
  const DB = EG.DB;

  let graine = 20260828;
  function rnd() { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; }
  function entre(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }


  const DEPARTEMENTS = ['Alibori', 'Atacora', 'Atlantique', 'Borgou', 'Collines', 'Couffo', 'Donga', 'Littoral', 'Mono', 'Ouémé', 'Plateau', 'Zou'];

  /* Les 77 communes du Bénin, réparties dans leurs 12 départements — d'après
     le découpage administratif officiel (source : Association nationale des
     communes du Bénin / Wikipédia). Cette liste alimente automatiquement le
     référentiel des territoires, à chaque démarrage, pour tous les appareils
     — y compris ceux déjà en service avant l'ajout de cette fonctionnalité. */
  const COMMUNES_PAR_DEPARTEMENT = {
    'Alibori': ['Banikoara', 'Gogounou', 'Kandi', 'Karimama', 'Malanville', 'Ségbana'],
    'Atacora': ['Boukoumbé', 'Cobly', 'Kérou', 'Kouandé', 'Matéri', 'Natitingou', 'Péhunco', 'Tanguiéta', 'Toucountouna'],
    'Atlantique': ['Abomey-Calavi', 'Allada', 'Kpomassè', 'Ouidah', 'Sô-Ava', 'Toffo', 'Tori-Bossito', 'Zè'],
    'Borgou': ['Bembèrèkè', 'Kalalé', 'N\'Dali', 'Nikki', 'Parakou', 'Pèrèrè', 'Sinendé', 'Tchaourou'],
    'Collines': ['Bantè', 'Dassa-Zoumè', 'Glazoué', 'Ouèssè', 'Savalou', 'Savè'],
    'Couffo': ['Aplahoué', 'Djakotomey', 'Dogbo', 'Klouékanmè', 'Lalo', 'Toviklin'],
    'Donga': ['Bassila', 'Copargo', 'Djougou', 'Ouaké'],
    'Littoral': ['Cotonou'],
    'Mono': ['Athiémè', 'Bopa', 'Comè', 'Grand-Popo', 'Houéyogbé', 'Lokossa'],
    'Ouémé': ['Adjarra', 'Adjohoun', 'Aguégués', 'Akpro-Missérété', 'Avrankou', 'Bonou', 'Dangbo', 'Porto-Novo', 'Sèmè-Kpodji'],
    'Plateau': ['Adja-Ouèrè', 'Ifangni', 'Kétou', 'Pobè', 'Sakété'],
    'Zou': ['Abomey', 'Agbangnizoun', 'Bohicon', 'Covè', 'Djidja', 'Ouinhi', 'Za-Kpota', 'Zagnanado', 'Zogbodomey']
  };

  function sansAccentSeed(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  /**
   * Complète le référentiel des territoires avec les 12 départements et les
   * 77 communes officielles du Bénin, sans jamais créer de doublon : chaque
   * niveau déjà présent (créé par l'amorce initiale, ou ajouté à la main par
   * un utilisateur) est retrouvé par son nom avant toute création. Tourne à
   * chaque démarrage — y compris sur les appareils déjà en service — pour que
   * la mise à jour profite à tout le monde, pas seulement aux nouvelles
   * installations. Les arrondissements et villages/quartiers, eux, restent à
   * la charge des circonscriptions : trop nombreux (plus de 500, et des
   * milliers de villages/quartiers) pour être fiabilisés depuis ce fichier ;
   * le formulaire des écoles permet de les ajouter à la volée, toujours bien
   * rattachés, avec le bouton « + Ajouter… » de chaque niveau.
   */
  function majTerritoiresGeographie() {
    return DB.all('territoires').then(territoires => {
      const trouver = (type, nom, parentId) => {
        const n = sansAccentSeed(nom);
        return territoires.filter(t => t.type === type && sansAccentSeed(t.nom) === n
          && (parentId == null || t.parent_id === parentId))[0];
      };
      const creer = (obj) => DB.put('territoires', obj, { silencieux: true, synced: true })
        .then(rec => { territoires.push(rec); return rec; });

      let national = territoires.filter(t => t.type === 'NATIONAL')[0];
      return (national ? Promise.resolve(national)
        : creer({ type: 'NATIONAL', code: 'BJ', nom: 'République du Bénin', actif: true }))
        .then(nat => {
          national = nat;
          let creations = 0;
          return Promise.all(Object.keys(COMMUNES_PAR_DEPARTEMENT).map(dep => {
            const existant = trouver('DEPARTEMENT', dep, national.id);
            return (existant ? Promise.resolve(existant)
              : creer({ type: 'DEPARTEMENT', code: dep.slice(0, 3).toUpperCase(), nom: dep, parent_id: national.id, actif: true })
                .then(d => { creations++; return d; }))
              .then(depRec => Promise.all(COMMUNES_PAR_DEPARTEMENT[dep].map(nomCommune => {
                const communeExistante = trouver('COMMUNE', nomCommune, depRec.id);
                if (communeExistante) return communeExistante;
                creations++;
                return creer({ type: 'COMMUNE', nom: nomCommune, parent_id: depRec.id, actif: true });
              })));
          })).then(() => creations);
        });
    });
  }
  EG.majTerritoiresGeographie = majTerritoiresGeographie;

  /**
   * Rattache automatiquement les écoles déjà saisies (avec l'ancien champ
   * « Commune » en texte libre, avant l'introduction des listes en cascade)
   * à leur département et à leur commune du référentiel, quand le nom
   * correspond exactement à une commune connue. Ce qui ne peut pas être
   * déduit sans risque d'erreur (arrondissement, village/quartier) est laissé
   * à compléter par la circonscription, depuis la fiche de l'école.
   */
  function migrerLocalisationEcoles() {
    return Promise.all([DB.all('ecoles'), DB.all('territoires')]).then(([ecoles, territoires]) => {
      const communes = territoires.filter(t => t.type === 'COMMUNE');
      const taches = [];
      ecoles.forEach(e => {
        if (e.commune_id || !e.commune) return;
        const commRec = communes.filter(c => sansAccentSeed(c.nom) === sansAccentSeed(e.commune))[0];
        if (!commRec) return;
        taches.push(DB.put('ecoles', Object.assign({}, e, {
          commune_id: commRec.id, departement_id: commRec.parent_id
        }), { silencieux: true, synced: true }));
      });
      return Promise.all(taches).then(() => taches.length);
    });
  }
  EG.migrerLocalisationEcoles = migrerLocalisationEcoles;

  /* Les neuf matières officielles du primaire. C'est sur ce total que se calcule
     la règle des six maîtrises aux examens blancs (six sur huit si l'EPS est dispensée). */
  const MATIERES = [
    { code: 'DICT', nom: 'Dictée', cycle: 'PRIMAIRE', ordre: 1 },
    { code: 'COMM_ECR', nom: 'Communication écrite', cycle: 'PRIMAIRE', ordre: 2 },
    { code: 'COMP_ECR', nom: 'Compréhension de l\u2019écrit', cycle: 'PRIMAIRE', ordre: 3 },
    { code: 'MATH', nom: 'Mathématiques', cycle: 'PRIMAIRE', ordre: 4 },
    { code: 'ESC', nom: 'Éducation sociale', cycle: 'PRIMAIRE', ordre: 5 },
    { code: 'EST', nom: 'Éducation scientifique et technologique', cycle: 'PRIMAIRE', ordre: 6 },
    { code: 'EA_PLAST', nom: 'EA Plastique', cycle: 'PRIMAIRE', ordre: 7 },
    { code: 'EA_VIV', nom: 'EA Vivant', cycle: 'PRIMAIRE', ordre: 8 },
    { code: 'EPS', nom: 'Éducation physique et sportive', cycle: 'PRIMAIRE', ordre: 9 },
    { code: 'EVE', nom: 'Éveil et découverte du milieu', cycle: 'MATERNELLE', ordre: 10 },
    { code: 'GRAPH', nom: 'Graphisme et langage', cycle: 'MATERNELLE', ordre: 11 }
  ];

  /* Codes utilisés dans les versions précédentes : on renomme l'enregistrement
     existant plutôt que d'en créer un nouveau, pour que les notes déjà saisies
     restent rattachées à leur matière. */
  const ANCIENS_CODES = {
    FR_LAN: 'DICT', FR_EXP: 'COMM_ECR', FR_LEC: 'COMP_ECR',
    FR_ECR: 'EA_VIV', EA: 'EA_PLAST'
  };

  /**
   * Aligne le référentiel des matières sur la liste officielle, à chaque démarrage.
   * Les appareils déjà installés sont mis à jour sans perdre leurs notes.
   */
  function majMatieres() {
    return DB.all('matieres').then(existantes => {
      const parCode = {};
      existantes.forEach(m => { parCode[m.code] = m; });
      const taches = [];

      Object.keys(ANCIENS_CODES).forEach(ancien => {
        const cible = ANCIENS_CODES[ancien];
        if (parCode[ancien] && !parCode[cible]) {
          parCode[cible] = parCode[ancien];
          delete parCode[ancien];
        }
      });

      MATIERES.forEach(m => {
        const actuelle = parCode[m.code];
        if (!actuelle) {
          taches.push(DB.put('matieres', {
            code: m.code, nom: m.nom, cycle: m.cycle, ordre: m.ordre, actif: true
          }, { silencieux: true, synced: true }));
        } else if (actuelle.code !== m.code || actuelle.nom !== m.nom || actuelle.ordre !== m.ordre) {
          taches.push(DB.put('matieres', Object.assign({}, actuelle, {
            code: m.code, nom: m.nom, cycle: m.cycle, ordre: m.ordre, actif: true
          }), { silencieux: true, synced: true }));
        }
      });

      /* Les matières hors référentiel officiel sont désactivées, jamais supprimées :
         les notes des années passées doivent rester lisibles. */
      const officiels = {};
      MATIERES.forEach(m => { officiels[m.code] = true; });
      Object.keys(parCode).forEach(code => {
        if (!officiels[code] && parCode[code].actif !== false) {
          taches.push(DB.put('matieres', Object.assign({}, parCode[code], { actif: false }),
            { silencieux: true, synced: true }));
        }
      });

      return Promise.all(taches).then(() => taches.length);
    });
  }
  EG.majMatieres = majMatieres;

  function hash(txt) {
    // Empreinte locale des mots de passe. Sur appareil, sans serveur : SHA-256 si
    // le contexte est sécurisé, repli déterministe sinon.
    if (global.crypto && crypto.subtle && global.isSecureContext) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode('egp:' + txt))
        .then(b => Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join(''));
    }
    let h = 5381;
    for (let i = 0; i < txt.length; i++) h = ((h * 33) ^ txt.charCodeAt(i)) >>> 0;
    return Promise.resolve('local$' + h.toString(16));
  }
  EG.hashMotDePasse = hash;

  function seed() {
    return DB.meta('amorce_faite').then(fait => {
      if (fait) return false;
      return construire().then(() => DB.setMeta('amorce_faite', true)).then(() => true);
    });
  }

  function construire() {
    const ids = {};
    const auj = new Date();
    const anneeDebut = auj.getMonth() >= 8 ? auj.getFullYear() : auj.getFullYear() - 1;
    const codeAnnee = anneeDebut + '-' + (anneeDebut + 1);

    const push = (store, obj) => DB.put(store, obj, { silencieux: true, synced: true });

    /* --- Années scolaires --- */
    return push('annees_scolaires', {
      code: (anneeDebut - 1) + '-' + anneeDebut, date_debut: (anneeDebut - 1) + '-09-14',
      date_fin: anneeDebut + '-07-10', statut: 'CLOTUREE'
    }).then(a0 => {
      ids.anneePrec = a0.id;
      return push('annees_scolaires', {
        code: codeAnnee, date_debut: anneeDebut + '-09-14', date_fin: (anneeDebut + 1) + '-07-10', statut: 'OUVERTE'
      });
    }).then(a1 => {
      ids.annee = a1.id;
      return DB.setMeta('annee_active', a1.id);
    })

    /* --- Plan national : pays, départements, puis les 118 circonscriptions
       scolaires et leurs zones pédagogiques. Aucune école n'est fournie : elles
       s'ajoutent, circonscription par circonscription, depuis l'onglet « Écoles ». --- */
      .then(() => push('territoires', { type: 'NATIONAL', code: 'BJ', nom: 'République du Bénin', actif: true }))
      .then(nat => {
        ids.national = nat.id;
        return Promise.all(DEPARTEMENTS.map(d =>
          push('territoires', { type: 'DEPARTEMENT', code: d.slice(0, 3).toUpperCase(), nom: d, parent_id: nat.id, actif: true })
        ));
      })
      .then(deps => {
        ids.departements = deps;
        ids.atacora = deps.filter(d => d.nom === 'Atacora')[0].id;
        return EG.majCirconscriptions();
      })
      .then(() => DB.all('territoires'))
      .then(terr => {
        /* (repère historique : première zone de la CS n° 14, utilisée par le nettoyage des anciennes versions) */
        const cs = terr.filter(t => t.type === 'CIRCONSCRIPTION' && t.code === 'CS-014')[0];
        ids.circo = cs ? cs.id : null;
        const zone = cs ? terr.filter(t => t.type === 'ZONE_PEDAGOGIQUE' && t.parent_id === cs.id && t.code === EG.codeZone(14, 1))[0] : null;
        ids.zone = zone ? zone.id : null;
      })

    /* --- Matières et programmes --- */
      .then(() => Promise.all(MATIERES.map(m => push('matieres', {
        code: m.code, nom: m.nom, cycle: m.cycle, ordre: m.ordre, actif: true
      }))))
      .then(ms => {
        ids.matieres = ms;
        const prim = ms.filter(m => m.cycle === 'PRIMAIRE');
        const tasks = [];
        EG.NIVEAUX_PRIM.forEach(niv => {
          prim.forEach(m => tasks.push(push('niveau_matieres', {
            annee_scolaire_id: ids.annee, cycle: 'PRIMAIRE', niveau: niv, matiere_id: m.id,
            coefficient: (m.code === 'MATH' || m.code === 'FR_LEC') ? 2 : 1, obligatoire: true
          })));
        });
        return Promise.all(tasks);
      })

    /* --- Comptes utilisateurs : administration et niveaux territoriaux.
       Les comptes de directeur et d'enseignant se créent, une fois les écoles
       ajoutées, dans Modules › Utilisateurs & sécurité. --- */
      .then(() => {
        const comptes = [
          /* Un seul compte de départ (administrateur, mot de passe à changer) : les comptes des DDEMP, CS, CP,
             directeurs et enseignants se créent avec les vraies personnes (Modules › Utilisateurs & sécurité). */
          { identifiant: 'admin', nom: 'ADMINISTRATEUR', prenoms: '', role: 'ADMIN_MEMP', mdp: 'admin123', territoire_id: ids.national, doit_changer_mdp: true }
        ];
        return Promise.all(comptes.map(c =>
          hash(c.mdp).then(h => push('users', {
            identifiant: c.identifiant, password_hash: h, nom: c.nom, prenoms: c.prenoms,
            role: c.role, ecole_id: null, territoire_id: c.territoire_id || null,
            telephone: '', actif: true, doit_changer_mdp: !!c.doit_changer_mdp
          }))
        ));
      })

    /* --- Règles de retraite --- */
      .then(() => Promise.all([
        push('regles_retraite', { categorie: 'C1', echelon_min: 1, echelon_max: 12, age_retraite: 55, date_effet: '2025-01-01', actif: true, reference_reglementaire: 'Statut général de la fonction publique' }),
        push('regles_retraite', { categorie: 'B1', echelon_min: 1, echelon_max: 12, age_retraite: 58, date_effet: '2025-01-01', actif: true }),
        push('regles_retraite', { categorie: 'A1', echelon_min: 1, echelon_max: 12, age_retraite: 60, date_effet: '2025-01-01', actif: true }),
        push('regles_retraite', { categorie: 'A2', echelon_min: 1, echelon_max: 12, age_retraite: 60, date_effet: '2025-01-01', actif: true }),
        push('regles_retraite', { categorie: 'A3', echelon_min: 1, echelon_max: 12, age_retraite: 60, date_effet: '2025-01-01', actif: true })
      ]))

    /* --- Recensement : la campagne est ouverte ; la fiche de chaque école est
       créée automatiquement dès que l'école est ajoutée. --- */
      .then(() => push('campagnes_recensement', {
        annee_scolaire_id: ids.annee, type: 'PRIMAIRE',
        date_reference_age: new Date().getFullYear() + '-12-31',
        date_ouverture: new Date().getFullYear() + '-10-01',
        date_cloture: new Date().getFullYear() + '-11-30',
        version_formulaire: 'MEMP-2026-P8', statut: 'OUVERTE'
      }))

    /* --- Référentiels d'alertes, documents, modèle de risque --- */
      .then(() => Promise.all([
        push('types_alertes', { code: 'ABSENTEISME_ELEVE', categorie: 'Scolarité', libelle: 'Absentéisme élevé', severite_defaut: 'ELEVEE', actif: true }),
        push('types_alertes', { code: 'EFFECTIF_PLETHORIQUE', categorie: 'Structure', libelle: 'Effectif de classe pléthorique', severite_defaut: 'MOYENNE', actif: true }),
        push('types_alertes', { code: 'LOCAL_DEGRADE', categorie: 'Patrimoine', libelle: 'Local en mauvais état', severite_defaut: 'ELEVEE', actif: true }),
        push('types_alertes', { code: 'RETRAITE_PROCHE', categorie: 'Personnel', libelle: 'Départ à la retraite dans moins d\'un an', severite_defaut: 'MOYENNE', actif: true }),
        push('types_alertes', { code: 'RECENSEMENT_RETARD', categorie: 'Recensement', libelle: 'Recensement non transmis', severite_defaut: 'ELEVEE', actif: true }),
        push('types_alertes', { code: 'DEFICIT_MOBILIER', categorie: 'Patrimoine', libelle: 'Déficit de places assises', severite_defaut: 'MOYENNE', actif: true })
      ]))
      .then(() => Promise.all([
        push('types_documents', { code: 'BULLETIN', nom: 'Bulletin de notes', categorie: 'Scolarité', signature_requise: true, verification_qr: true }),
        push('types_documents', { code: 'CERT_SCOLARITE', nom: 'Certificat de scolarité', categorie: 'Scolarité', signature_requise: true, verification_qr: true }),
        push('types_documents', { code: 'LISTE_CLASSE', nom: 'Liste de classe', categorie: 'Scolarité', signature_requise: false, verification_qr: false }),
        push('types_documents', { code: 'FICHE_RECENSEMENT', nom: 'Fiche de recensement', categorie: 'Recensement', signature_requise: true, verification_qr: true }),
        push('types_documents', { code: 'PV_VISITE', nom: 'Procès-verbal de visite', categorie: 'Pédagogie', signature_requise: true, verification_qr: false }),
        push('types_documents', { code: 'ETAT_BUDGET', nom: 'État d\'exécution budgétaire', categorie: 'Finances', signature_requise: true, verification_qr: true }),
        push('types_documents', { code: 'CARTE_SCOLAIRE', nom: 'Carte d\'identité scolaire', categorie: 'Scolarité', signature_requise: false, verification_qr: true }),
        push('types_documents', { code: 'FICHE_CEP', nom: 'Fiche d\'inscription au CEP', categorie: 'Examens', signature_requise: true, verification_qr: true }),
        push('types_documents', { code: 'LISTE_PAIEMENT', nom: 'Liste de paiement de la cantine', categorie: 'Finances', signature_requise: true, verification_qr: true }),
        push('types_documents', { code: 'BILAN_PRESENCE', nom: 'Bilan de présence par cours', categorie: 'Scolarité', signature_requise: true, verification_qr: true }),
        push('types_documents', { code: 'AFFICHAGE_CLASSE', nom: 'Tableau d\'affichage de classe', categorie: 'Scolarité', signature_requise: false, verification_qr: true }),
        push('types_documents', { code: 'SYNTHESE_EVAL', nom: 'Synthèse d\'évaluation', categorie: 'Pédagogie', signature_requise: true, verification_qr: true }),
        push('types_documents', { code: 'RELEVE_CENTRE', nom: 'Relevé de centre d\'examen blanc', categorie: 'Examens', signature_requise: true, verification_qr: true }),
        push('types_documents', { code: 'RELEVE_PERSONNEL', nom: 'Relevé de présence du personnel', categorie: 'Personnel', signature_requise: true, verification_qr: true }),
        push('types_documents', { code: 'FICHE_EVAL_AGENT', nom: 'Fiche d\'évaluation de l\'agent', categorie: 'Personnel', signature_requise: true, verification_qr: true }),
        push('types_documents', { code: 'CERTIFICAT_AGENT', nom: 'Certificat administratif du personnel', categorie: 'Personnel', signature_requise: true, verification_qr: true }),
        push('types_documents', { code: 'RELEVE_MENSUEL', nom: 'Relevé mensuel de fréquentation', categorie: 'Scolarité', signature_requise: true, verification_qr: true }),
        push('types_documents', { code: 'REGISTRE_APPEL', nom: 'Registre d\'appel mensuel', categorie: 'Scolarité', signature_requise: true, verification_qr: true }),
        push('types_documents', { code: 'SYNTHESE_OFFICIELLE', nom: 'Synthèse officielle de l\'évaluation', categorie: 'Pédagogie', signature_requise: true, verification_qr: true }),
        push('types_documents', { code: 'FICHE_COLLECTE', nom: 'Fiche de collecte des écoles', categorie: 'Administration', signature_requise: false, verification_qr: true })
      ]))
      .then(() => push('modeles_risque', {
        code: 'DECROCHAGE', version: '1.0', actif: true,
        configuration: { absenteisme: 40, resultats: 25, redoublement: 15, retards: 10, cantine: 10 },
        date_activation: new Date().toISOString().slice(0, 10)
      }))
      .then(() => Promise.all([
        push('definitions_indicateurs', { code: 'TBS', nom: 'Taux brut de scolarisation', description: 'Effectif total scolarisé rapporté à la population d\'âge officiel.', formule: 'effectif / population × 100', unite: '%' }),
        push('definitions_indicateurs', { code: 'RATIO_ELEVES_MAITRE', nom: 'Ratio élèves-maître', description: 'Nombre d\'élèves par enseignant en poste.', formule: 'élèves / enseignants', unite: 'élèves' }),
        push('definitions_indicateurs', { code: 'TAUX_REUSSITE_CEP', nom: 'Taux de réussite au CEP', description: 'Admis rapportés aux candidats ayant composé.', formule: 'admis / composants × 100', unite: '%' }),
        push('definitions_indicateurs', { code: 'PARITE', nom: 'Indice de parité filles/garçons', description: 'Effectif des filles rapporté à celui des garçons.', formule: 'filles / garçons', unite: 'ratio' })
      ]))

    /* --- Modèles de rapports --- */
      .then(() => Promise.all([
        push('modeles_rapports', { code: 'EFFECTIFS_NIVEAU', nom: 'Effectifs par niveau et par sexe', type: 'OFFICIEL', description: 'Répartition des élèves inscrits, par niveau et par sexe.', actif: true }),
        push('modeles_rapports', { code: 'ASSIDUITE', nom: 'Assiduité par classe', type: 'OFFICIEL', description: 'Taux de présence sur une période donnée.', actif: true }),
        push('modeles_rapports', { code: 'RESULTATS_EVAL', nom: 'Résultats par évaluation', type: 'OFFICIEL', description: 'Moyennes, maîtrises et rangs.', actif: true }),
        push('modeles_rapports', { code: 'PATRIMOINE', nom: 'État du patrimoine', type: 'OFFICIEL', description: 'Locaux, mobilier et services.', actif: true }),
        push('modeles_rapports', { code: 'RETRAITES_5ANS', nom: 'Départs à la retraite à 5 ans', type: 'OFFICIEL', description: 'Prévisions par école et catégorie.', actif: true })
      ]))
      .then(() => DB.audit('AMORCE', 'systeme', null, { message: 'Référentiels installés : plan national, circonscriptions et zones' }));
  }

  /* ------------------------------------------------------------------
     Retrait des données d'exemple des versions précédentes.

     Les premières versions installaient trois écoles fictives (EP001, EP002,
     EM010) avec leurs élèves, leurs agents, leurs notes, leur budget, etc.
     Une nouvelle installation n'en reçoit plus ; ce nettoyage, lancé une seule
     fois, retire ces données des appareils déjà en service. Il ne touche
     qu'aux écoles dont le code ET le nom sont ceux de l'exemple, puis à tout
     ce qui en dépend (élèves, classes, notes, agents, comptes…). Les écoles
     saisies par les utilisateurs ne sont jamais concernées.
     ------------------------------------------------------------------ */
  const ECOLES_EXEMPLE = [
    { code: 'EP001', nom: 'EPP Natitingou Centre' },
    { code: 'EP002', nom: 'EPP Perma' },
    { code: 'EM010', nom: 'École maternelle Kotopounga' }
  ];
  const CODES_TERRITOIRES_EXEMPLE = ['ZP-NAT1A', 'UP-NAT1A1'];
  const LIEUX_EXEMPLE = [
    ['ARRONDISSEMENT', 'Natitingou I'], ['ARRONDISSEMENT', 'Perma'], ['ARRONDISSEMENT', 'Kotopounga'],
    ['VILLAGE_QUARTIER', 'Quartier Yimporima']
  ];

  function retirerExemples() {
    return DB.meta('exemples_retires_v1').then(fait => {
      if (fait) return null;
      const magasins = EG.STORES.filter(s => s !== 'audit_events');
      return Promise.all(magasins.map(s => DB.all(s).then(rows => [s, rows]))).then(paires => {
        const data = {};
        paires.forEach(([s, rows]) => { data[s] = rows; });
        const marques = {}, parStore = {};
        const marquer = (store, row) => {
          if (marques[row.id]) return false;
          marques[row.id] = true;
          (parStore[store] = parStore[store] || []).push(row.id);
          return true;
        };
        /* Tout enregistrement qui pointe (champ …_id) vers un enregistrement marqué l'est aussi. */
        const propager = () => {
          let change = true;
          while (change) {
            change = false;
            magasins.forEach(s => {
              if (s === 'territoires') return;
              data[s].forEach(row => {
                if (marques[row.id]) return;
                const lie = Object.keys(row).some(k => k !== 'id' && /_id$/.test(k) && row[k] && marques[row[k]]);
                if (lie && marquer(s, row)) change = true;
              });
            });
          }
        };

        data.ecoles.forEach(e => {
          if (ECOLES_EXEMPLE.some(x => x.code === e.code_ecole && x.nom === e.nom)) marquer('ecoles', e);
        });
        const nbEcoles = (parStore.ecoles || []).length;

        if (nbEcoles) {
          data.users.forEach(u => {
            if (u.role === 'PARENT' && u.identifiant === 'parent.demo') marquer('users', u);
          });
          propager();
          /* Un élève disparaît quand toutes ses inscriptions ont disparu. */
          const parEleve = {};
          data.inscriptions_eleves.forEach(i => { (parEleve[i.eleve_id] = parEleve[i.eleve_id] || []).push(i); });
          data.eleves.forEach(e => {
            const ins = parEleve[e.id];
            if (ins && ins.length && ins.every(i => marques[i.id])) marquer('eleves', e);
          });
          propager();
        }

        /* Lieux fictifs qui n'avaient d'autre but que d'illustrer les listes en cascade. */
        const restantes = data.ecoles.filter(e => !marques[e.id]);
        const utilise = id => restantes.some(e => [e.zone_id, e.up_id, e.arrondissement_id,
          e.village_quartier_id, e.territoire_id].indexOf(id) >= 0);
        let encore = true;
        while (encore) {
          encore = false;
          data.territoires.forEach(t => {
            if (marques[t.id]) return;
            const exemple = (CODES_TERRITOIRES_EXEMPLE.indexOf(t.code) >= 0
              && (t.type === 'ZONE_PEDAGOGIQUE' || t.type === 'UNITE_PEDAGOGIQUE'))
              || LIEUX_EXEMPLE.some(([ty, nom]) => t.type === ty && t.nom === nom);
            if (!exemple || utilise(t.id)) return;
            if (data.territoires.some(x => x.parent_id === t.id && !marques[x.id])) return;
            if (marquer('territoires', t)) encore = true;
          });
        }

        /* Le compte conseiller pédagogique d'exemple suivait la zone fictive :
           il passe à la première vraie zone de NATITINGOU 1. */
        const csReelle = data.territoires.filter(t => t.type === 'CIRCONSCRIPTION' && t.code === 'CS-014')[0];
        const zoneReelle = csReelle ? data.territoires.filter(t => t.type === 'ZONE_PEDAGOGIQUE'
          && t.parent_id === csReelle.id && t.code === EG.codeZone(14, 1))[0] : null;
        const reaffectations = data.users
          .filter(u => !marques[u.id] && u.territoire_id && marques[u.territoire_id])
          .map(u => DB.put('users', Object.assign({}, u, { territoire_id: zoneReelle ? zoneReelle.id : null }),
            { silencieux: true, synced: true }));

        const total = Object.keys(marques).length;
        return Promise.all(reaffectations)
          .then(() => DB.purger(parStore))
          .then(() => DB.setMeta('exemples_retires_v1', true))
          .then(() => total ? DB.audit('NETTOYAGE_EXEMPLES', 'systeme', null,
            { ecoles: nbEcoles, enregistrements: total }) : null)
          .then(() => ({ ecoles: nbEcoles, enregistrements: total }));
      });
    });
  }
  EG.retirerExemples = retirerExemples;

  /* Comptes de démonstration des versions précédentes (personnes fictives, circonscription NATITINGOU 1) :
     retirés une fois des appareils déjà en service. Seuls les comptes dont l'identifiant ET le nom sont ceux de
     l'exemple sont concernés ; un compte que l'utilisateur a renommé est conservé. */
  const COMPTES_EXEMPLE = [['ddemp.atacora', 'KOUAGOU'], ['cs.natitingou', "N'TCHA"], ['cp.zone1a', 'YAROU']];
  EG.retirerComptesExemple = function () {
    return DB.meta('comptes_exemple_retires_v1').then(fait => {
      if (fait) return null;
      return DB.all('users').then(us => {
        const a = us.filter(u => COMPTES_EXEMPLE.some(([i, n]) => u.identifiant === i && u.nom === n));
        return Promise.all(a.map(u => DB.remove('users', u.id))).then(() => {
          const admin = us.filter(u => u.identifiant === 'admin' && u.nom === 'ADMIN' && u.prenoms === 'MEMP')[0];
          return admin ? DB.put('users', Object.assign({}, admin, { nom: 'ADMINISTRATEUR', prenoms: '' }), { silencieux: true, synced: true }) : null;
        }).then(() => DB.setMeta('comptes_exemple_retires_v1', true))
          .then(() => a.length ? DB.audit('NETTOYAGE_COMPTES_EXEMPLE', 'users', null, { comptes: a.map(u => u.identifiant) }) : null);
      });
    });
  };

  /**
   * Le rôle « conseiller pédagogique » s'appelait CP, comme le cours préparatoire :
   * les deux se confondaient dans les listes. Il prend le code
   * CONSEILLER_PEDAGOGIQUE ; les comptes et les fiches d'agents déjà créés suivent.
   */
  function migrerRoles() {
    return DB.meta('role_cp_renomme_v1').then(fait => {
      if (fait) return 0;
      return Promise.all([DB.all('users'), DB.all('user_assignments'), DB.all('personnels')])
        .then(([users, affectations, agents]) => {
          const NOUVEAU = 'CONSEILLER_PEDAGOGIQUE';
          const taches = [];
          users.filter(u => u.role === 'CP').forEach(u => taches.push(DB.put('users', Object.assign({}, u, { role: NOUVEAU }))));
          affectations.filter(a => a.role === 'CP').forEach(a => taches.push(DB.put('user_assignments', Object.assign({}, a, { role: NOUVEAU }))));
          agents.filter(a => a.fonction === 'CP').forEach(a => taches.push(DB.put('personnels', Object.assign({}, a, { fonction: NOUVEAU }))));
          return Promise.all(taches).then(() => DB.setMeta('role_cp_renomme_v1', true)).then(() => taches.length);
        });
    });
  }
  EG.migrerRoles = migrerRoles;

  /**
   * Les six cours ont les mêmes matières : chaque année ouverte porte, pour chaque
   * cours, les neuf matières du primaire. Complète ce qui manque (année suivante,
   * cours ajouté) avec le coefficient déjà en usage pour la matière ; ne modifie rien d'existant.
   */
  function majProgrammes() {
    return Promise.all([DB.all('annees_scolaires'), DB.all('matieres'), DB.all('niveau_matieres')])
      .then(([annees, matieres, existants]) => {
        /* Primaire : les mêmes matières dans les six cours. Maternelle : ses propres matières. */
        const parCycle = [
          { cycle: 'PRIMAIRE', niveaux: EG.NIVEAUX_PRIM, matieres: matieres.filter(m => m.cycle === 'PRIMAIRE' && m.actif !== false) },
          { cycle: 'MATERNELLE', niveaux: EG.NIVEAUX_MAT, matieres: matieres.filter(m => m.cycle === 'MATERNELLE' && m.actif !== false) }
        ];
        const taches = [];
        annees.filter(a => a.statut === 'OUVERTE' || a.statut === 'PREPARATION').forEach(a => {
          const deLannee = existants.filter(x => x.annee_scolaire_id === a.id);
          parCycle.forEach(g => g.niveaux.forEach(niveau => g.matieres.forEach(m => {
            if (deLannee.some(x => x.niveau === niveau && x.matiere_id === m.id)) return;
            const modele = deLannee.filter(x => x.matiere_id === m.id)[0];
            taches.push(DB.put('niveau_matieres', {
              annee_scolaire_id: a.id, cycle: g.cycle, niveau, matiere_id: m.id,
              coefficient: modele ? modele.coefficient : 1, obligatoire: true
            }, { silencieux: true, synced: true }));
          })));
        });
        return Promise.all(taches).then(() => taches.length);
      });
  }
  EG.majProgrammes = majProgrammes;

  /**
   * S'assure que chaque école active a sa fiche de recensement dans chaque
   * campagne ouverte. Appelée à l'ajout d'une école et au démarrage, sans
   * jamais créer de doublon.
   */
  function assurerFichesRecensement() {
    return Promise.all([DB.all('campagnes_recensement'), DB.all('ecoles'), DB.all('recensements_ecoles')])
      .then(([campagnes, ecoles, fiches]) => {
        const existe = {};
        fiches.forEach(f => { existe[f.campagne_id + '|' + f.ecole_id] = true; });
        const taches = [];
        campagnes.filter(c => c.statut === 'OUVERTE').forEach(c => {
          ecoles.filter(e => e.actif !== false).forEach(e => {
            if (existe[c.id + '|' + e.id]) return;
            existe[c.id + '|' + e.id] = true;
            taches.push(DB.put('recensements_ecoles', {
              campagne_id: c.id, ecole_id: e.id, statut: 'A_COMPLETER', taux_completion: 0
            }));
          });
        });
        return Promise.all(taches).then(() => taches.length);
      });
  }
  EG.assurerFichesRecensement = assurerFichesRecensement;

  EG.seed = seed;
})(window);
