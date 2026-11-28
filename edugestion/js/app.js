/* ÉduGestion Pro — démarrage, session, droits et navigation. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur;

  EG.session = null;

  /* ---------------- Droits ---------------- */
  const DROITS = {
    ADMIN_MEMP: { ecrire: true, modules: '*' },
    ADMIN_TECHNIQUE: { ecrire: true, modules: '*' },
    DDEMP: { ecrire: true, modules: '*', sauf: ['securite'] },
    CS: { ecrire: true, modules: '*', sauf: ['securite'] },
    CONSEILLER_PEDAGOGIQUE: {
      ecrire: true, modules: ['eleves', 'inscriptions', 'presences', 'evaluations', 'cep', 'personnel',
        'visites', 'risques', 'alertes', 'analytics', 'rapports', 'documents', 'recensement',
        'reseau', 'telechargements', 'espace-cs', 'unites-pedagogiques', 'repertoire', 'calendrier-scolaire',
        'carte-ecole', 'carte-eleve', 'fiche-cep', 'stats-cs', 'divisions', 'signatures', 'documents-officiels', 'docs-pedagogiques', 'pedagogie', 'pedagogie-sec', 'bulletins-sec', 'maitre-semaine', 'annonces-personnel', 'zone-desheritee', 'releves-mensuels', 'vie-etablissement', 'ferme-ecole', 'examens-sec', 'pilotage-sec', 'uascep', 'pvs-sport', 'pvs-pilotage', 'pvs-communication', 'pvs-territoire', 'pvs-sante', 'pvs-inspection', 'pvs-patrimoine', 'pvs-examens']
    },
    DIRECTEUR: {
      ecrire: true, modules: '*', sauf: ['securite', 'support', 'reseau', 'espace-cs', 'unites-pedagogiques', 'personnel-cs', 'statuts-personnel', 'courriers', 'ecoles-cm2', 'ecarts-cs', 'rapport-rentree', 'divisions']
    },
    ENSEIGNANT: {
      ecrire: true, modules: ['eleves', 'inscriptions', 'presences', 'evaluations', 'cep', 'cantine',
        'risques', 'documents', 'parents', 'educmaster', 'telechargements', 'repertoire', 'calendrier-scolaire',
        'carte-ecole', 'carte-eleve', 'signatures', 'documents-officiels', 'docs-pedagogiques', 'pedagogie', 'pedagogie-sec', 'bulletins-sec', 'maitre-semaine', 'annonces-personnel', 'releves-mensuels']
    },
    PARENT: { ecrire: false, modules: ['parents', 'declarations-paiement'] },
    ELEVE: { ecrire: false, modules: ['parents'] }
  };

  EG.peutEcrire = function () {
    const d = DROITS[EG.session.user.role];
    return !!(d && d.ecrire);
  };
  /* Finances propres aux écoles privées : le directeur d'une école publique ne les voit pas ;
     circonscriptions, directions départementales et administration les consultent. */
  const MODULES_PRIVE = ['scolarite-privee', 'caisse-privee', 'salaires-privee', 'declarations-paiement'];
  EG.peutVoirModule = function (code) {
    const d = DROITS[EG.session.user.role];
    if (!d) return false;
    if (d.sauf && d.sauf.indexOf(code) >= 0) return false;
    if (MODULES_PRIVE.indexOf(code) >= 0 && EG.session.user.role === 'DIRECTEUR') return EG.session.ecole_statut === 'PRIVEE';
    if (code === 'carrieres' && EG.session.ecole_statut === 'PRIVEE') return false;   // agents payés par leur école
    return d.modules === '*' || d.modules.indexOf(code) >= 0;
  };

  /* ---------------- Navigation ---------------- */
  const NAV = {
    ENSEIGNANT: [
      ['accueil', '\uE000', 'Accueil'], ['presences', '\uE004', 'Présences'],
      ['evaluations', '\uE00E', 'Notes'], ['cantine', '\uE05B', 'Cantine'], ['modules', '\uE054', 'Modules']
    ],
    DIRECTEUR: [
      ['accueil', '\uE000', 'Accueil'], ['eleves', '\uE021', 'Élèves'],
      ['patrimoine', '\uE022', 'École'], ['alertes', '\uE055', 'Alertes'], ['modules', '\uE054', 'Modules']
    ],
    PARENT: [
      ['accueil', '\uE000', 'Accueil'], ['parents', '\uE01F', 'Mes enfants'], ['declarations-paiement', '\uE020', 'Payer']
    ],
    ELEVE: [
      ['accueil', '\uE000', 'Accueil'], ['parents', '\uE021', 'Mon dossier']
    ],
    DEFAUT: [
      ['accueil', '\uE000', 'Accueil'], ['gestion-ecoles', '\uE022', 'Écoles'], ['analytics', '\uE015', 'Statistiques'],
      ['alertes', '\uE055', 'Alertes'], ['recensement', '\uE040', 'Recensement'], ['modules', '\uE054', 'Modules']
    ]
  };

  /* ---------------- Authentification ---------------- */
  function ecranConnexion() {
    document.body.className = 'connexion';
    const racine = document.getElementById('app');
    racine.textContent = '';

    const identifiant = el('input', { type: 'text', id: 'id', autocomplete: 'username', required: true, placeholder: 'Votre identifiant' });
    const motdepasse = el('input', { type: 'password', id: 'mdp', autocomplete: 'current-password', required: true });
    const erreur = el('p', { class: 'erreur-connexion' });

    function tenter() {
      erreur.textContent = '';
      const ident = identifiant.value.trim();
      if (!ident || !motdepasse.value) { erreur.textContent = 'Saisissez votre identifiant et votre mot de passe.'; return; }
      const S = global.Securite, reste = S ? S.blocage((EG.DB.nom || 'edugestion'), ident) : 0;
      if (reste) { erreur.textContent = S.texteBlocage(reste); return; }
      DB.where('users', u => u.identifiant === ident && u.actif !== false).then(users => {
        if (!users.length) { if (S) S.echec((EG.DB.nom || 'edugestion'), ident); erreur.textContent = 'Identifiant inconnu.'; return; }
        const u = users[0];
        return EG.hashMotDePasse(motdepasse.value).then(h => {
          if (h !== u.password_hash) {
            const r = S ? S.echec((EG.DB.nom || 'edugestion'), ident) : { restants: 0 };
            erreur.textContent = r.bloqueMs ? S.texteBlocage(r.bloqueMs) : 'Mot de passe incorrect.' + (r.restants && r.restants <= 3 ? ' Encore ' + r.restants + ' essai(s) avant blocage temporaire.' : '');
            return;
          }
          if (S) S.reussite((EG.DB.nom || 'edugestion'), ident);
          // mot de passe de départ (admin123…) : changement obligatoire avant d'aller plus loin
          if (S && S.deDepart(motdepasse.value) && !u.doit_changer_mdp) return ouvrirSession(Object.assign({}, u, { doit_changer_mdp: true }));
          return ouvrirSession(u);
        });
      });
    }

    const form = el('form', {
      class: 'carte-connexion', onsubmit: e => { e.preventDefault(); tenter(); }
    }, [
      el('div', { class: 'marque' }, [
        el('span', { class: 'marque-drapeau', 'aria-hidden': 'true' }),
        el('div', {}, [
          el('h1', { text: 'ÉduGestion Pro' }),
          el('p', { text: 'Gestion des écoles maternelles et primaires — Bénin' })
        ])
      ]),
      el('div', { class: 'champ' }, [el('label', { for: 'id', text: 'Identifiant' }), identifiant]),
      el('div', { class: 'champ' }, [el('label', { for: 'mdp', text: 'Mot de passe' }), motdepasse]),
      erreur,
      el('button', { class: 'btn btn-primaire pleine', type: 'submit', text: 'Se connecter' }),
      el('a', { class: 'oubli-lien', href: '#', text: '\uE032 Mot de passe oublié ?', onclick: e => { e.preventDefault(); EG.MotDePasse.dialogueOubli(identifiant.value.trim()); } }),
      el('p', { class: 'muet petit', style: 'margin-top:12px' }, [el('strong', { text: 'Premier démarrage : ' }), document.createTextNode('identifiant '), el('code', { text: 'admin' }),
        document.createTextNode(', mot de passe '), el('code', { text: 'admin123' }), document.createTextNode(' (à changer aussitôt). Créez ensuite les comptes des vraies personnes dans Modules › Utilisateurs & sécurité.')])
    ]);

    racine.appendChild(el('div', { class: 'ecran-connexion' }, form));
    identifiant.focus();
  }

  function ouvrirSession(user) {
    return Promise.all([
      user.ecole_id ? DB.get('ecoles', user.ecole_id) : Promise.resolve(null),
      DB.meta('annee_active').then(id => id ? DB.get('annees_scolaires', id) : null)
    ]).then(([ecole, annee]) => {
      if (!annee) {
        return DB.where('annees_scolaires', { statut: 'OUVERTE' }).then(a => {
          annee = a[0];
          return annee ? DB.setMeta('annee_active', annee.id) : null;
        }).then(() => finaliser(user, ecole, annee));
      }
      return finaliser(user, ecole, annee);
    });
  }

  function finaliser(user, ecole, annee) {
    /* Compte créé ou réinitialisé par l'administration : le mot de passe reçu est
       provisoire, la personne en choisit un à elle avant d'aller plus loin. */
    if (user.doit_changer_mdp) {
      return ecranNouveauMotDePasse(user).then(maj => finaliser(maj, ecole, annee));
    }
    EG.session = {
      user,
      ecole_id: ecole ? ecole.id : null,
      ecole_nom: ecole ? ecole.nom : 'Toutes les écoles',
      ecole_statut: ecole ? ecole.statut || null : null,
      annee_id: annee ? annee.id : null,
      annee_code: annee ? annee.code : '—'
    };
    return DB.setMeta('session_utilisateur', user.id)
      .then(() => DB.audit('CONNEXION', 'users', user.id))
      .then(() => EG.GeoRef && EG.GeoRef.defautSession())
      .then(() => {
        construireCoquille(); Routeur.aller('accueil');
        // copies de sauvegarde automatiques de l'appareil (instantanés) et rappel d'export après 7 jours
        if (global.SauvegardeAuto && !EG.SauvegardesAuto) {
          EG.SauvegardesAuto = global.SauvegardeAuto.installer({
            app: 'edugestion-' + (DB.nom || 'pro'), titre: 'ÉduGestion Pro', couleur: '#1F4E79', garder: 10, intervalleH: 20,
            peutRestaurer: () => !!(EG.session && EG.session.user && ['ADMIN_MEMP', 'ADMIN_TECHNIQUE', 'DIRECTEUR', 'CS', 'DDEMP'].indexOf(EG.session.user.role) >= 0),
            lire: () => DB.exportAll().then(d => JSON.stringify(d)),
            restaurer: (texte) => DB.reset().then(() => DB.importAll(JSON.parse(texte))).then(() => { setTimeout(() => location.reload(), 700); })
          });
        }
        // déconnexion automatique après 20 minutes sans action (données d'élèves et de personnel sur l'appareil)
        if (global.Securite) global.Securite.inactivite(20, () => { DB.audit('DECONNEXION_INACTIVITE', 'users', user.id).catch(() => {}); deconnecter(); });
      });
  }

  /** Écran plein cadre : choisir son mot de passe. Rend l'utilisateur mis à jour. */
  function ecranNouveauMotDePasse(user) {
    return new Promise(resolve => {
      document.body.className = 'connexion';
      const racine = document.getElementById('app');
      racine.textContent = '';
      const n1 = el('input', { type: 'password', id: 'nmdp', autocomplete: 'new-password', required: true, minlength: '8' });
      const n2 = el('input', { type: 'password', id: 'nmdp2', autocomplete: 'new-password', required: true });
      const erreur = el('p', { class: 'erreur-connexion' });
      const form = el('form', {
        class: 'carte-connexion', onsubmit: e => {
          e.preventDefault();
          erreur.textContent = '';
          const faible = global.Securite ? global.Securite.faible(n1.value, user.identifiant) : (n1.value.length < 6 ? 'Choisissez un mot de passe d’au moins 6 caractères.' : '');
          if (faible) { erreur.textContent = faible; return; }
          if (n1.value !== n2.value) { erreur.textContent = 'Les deux saisies ne sont pas identiques.'; return; }
          EG.hashMotDePasse(n1.value).then(h => {
            if (h === user.password_hash) { erreur.textContent = 'Choisissez un mot de passe différent du mot de passe provisoire.'; return; }
            return DB.put('users', Object.assign({}, user, { password_hash: h, doit_changer_mdp: false }))
              .then(maj => { DB.audit('CHANGEMENT_MDP', 'users', maj.id, {}); EG.majSynchro(); resolve(maj); });
          });
        }
      }, [
        el('div', { class: 'marque' }, [
          el('span', { class: 'marque-drapeau', 'aria-hidden': 'true' }),
          el('div', {}, [el('h1', { text: 'Choisissez votre mot de passe' }), el('p', { text: 'Bienvenue ' + (user.prenoms || user.nom) })])
        ]),
        el('p', { class: 'muet', text: 'Le mot de passe qui vous a été remis est provisoire (ou c’est un mot de passe de départ, connu de tous). Choisissez-en un que vous seul connaissez.' }),
        el('p', { class: 'muet petit', text: global.Securite ? global.Securite.regle : '' }),
        el('div', { class: 'champ' }, [el('label', { for: 'nmdp', text: 'Nouveau mot de passe' }), n1]),
        el('div', { class: 'champ' }, [el('label', { for: 'nmdp2', text: 'Confirmez le mot de passe' }), n2]),
        erreur,
        el('button', { class: 'btn btn-primaire pleine', type: 'submit', text: 'Enregistrer et continuer' })
      ]);
      racine.appendChild(el('div', { class: 'ecran-connexion' }, form));
      n1.focus();
    });
  }

  function deconnecter() {
    if (global.Securite) global.Securite.arreterInactivite();
    DB.setMeta('session_utilisateur', null).then(() => {
      EG.session = null;
      ecranConnexion();
    });
  }

  /* ---------------- Coquille applicative ----------------
     Deux panneaux : à gauche le tableau des menus, à droite le grand tableau
     (le contenu). Chacun défile pour son compte — la page, elle, ne bouge pas —
     de sorte que faire défiler l'un ne déplace jamais l'autre. Sur téléphone, le
     menu devient un tiroir ouvert par le bouton \uE03E. */
  function construireCoquille() {
    document.body.className = 'connecte';
    const racine = document.getElementById('app');
    racine.textContent = '';

    const indicateur = el('button', {
      class: 'synchro', id: 'indicateur-synchro', onclick: () => Routeur.aller('sync'),
      'aria-label': 'État de la synchronisation'
    });

    const barre = el('header', { class: 'barre-haut' }, [
      el('button', {
        class: 'icone-btn bouton-menu', id: 'bouton-menu', 'aria-label': 'Ouvrir le menu', 'aria-controls': 'menu-lateral',
        'aria-expanded': 'false', text: '\uE03E', onclick: basculerMenu
      }),
      EG.MotDePasse.boutonRetour(),
      el('button', {
        class: 'marque-mini', onclick: () => Routeur.aller('accueil'), 'aria-label': 'Accueil'
      }, [el('span', { class: 'marque-drapeau petit-drapeau', 'aria-hidden': 'true', id: 'marqueLogoEcole' }), el('span', { text: 'ÉduGestion Pro', id: 'marqueNomEcole' })]),
      el('div', { class: 'barre-droite' }, [
        indicateur,
        el('button', { class: 'icone-btn', 'aria-label': 'Guide d’utilisation', title: 'Guide d’utilisation', 'data-guide': 'menu', text: '\uE07B',
          onclick: () => { const r = { ADMIN_MEMP: 'admin', ADMIN_TECHNIQUE: 'admin', DDEMP: 'ddemp', CS: 'cs', CONSEILLER_PEDAGOGIQUE: 'cp', DIRECTEUR: 'directeur', ENSEIGNANT: 'enseignant', PARENT: 'parent', ELEVE: 'parent' }[(EG.session.user || {}).role] || '';
            if (global.Guide) global.Guide.ouvrir(global.GUIDE_CONTENU, { role: r }); } }),
        el('button', {
          class: 'icone-btn', 'aria-label': 'Compte et déconnexion', text: '⋯',
          onclick: menuCompte
        })
      ])
    ]);

    const contenu = el('main', { id: 'contenu', tabindex: '-1' });
    const menu = construireMenu();
    const voile = el('div', { class: 'voile-menu', onclick: fermerMenu });

    const items = NAV[EG.session.user.role] || NAV.DEFAUT;
    const nav = el('nav', { class: 'barre-onglets', 'aria-label': 'Navigation principale' },
      items.map(([route, icone, libelle]) => el('button', {
        class: 'onglet', dataset: { route: route.split('/')[0] }, onclick: () => Routeur.aller(route)
      }, [el('span', { class: 'onglet-icone', text: icone, 'aria-hidden': 'true' }), el('span', { text: libelle })])));

    racine.appendChild(el('div', { class: 'coque' }, [
      barre,
      el('div', { class: 'corps-app' }, [menu, voile, contenu]),
      nav
    ]));
    EG.majSynchro();
    if (EG.majMarqueEcole) EG.majMarqueEcole();
  }

  /* ---------------- Tableau des menus ---------------- */

  function routeModule(m) { return m.ecran || ('entite/' + m.entites[0]); }

  /** Sous-menu d'un module : ses écrans annexes, puis ses tables. */
  function sousLiens(m) {
    const liens = [];
    const peutImporter = ['ADMIN_MEMP', 'ADMIN_TECHNIQUE', 'DDEMP', 'CS'].indexOf(EG.session.user.role) >= 0 && EG.peutEcrire();
    (m.annexes || []).forEach(([route, lib, icone]) => {
      if (route === 'import-ecoles' && !peutImporter) return; /* réservé à ceux qui peuvent créer des écoles */
      liens.push({ route, lib, icone: icone || '\uE053' });
    });
    (m.ecran ? m.entites : m.entites.slice(1)).forEach(e => liens.push({
      route: 'entite/' + e, lib: EG.SCHEMA[e].label, icone: EG.SCHEMA[e].icone || '\uE00D'
    }));
    return liens;
  }

  /* Menu des comptes de circonscription (CS) et de direction départementale (DDEMP) : les rubriques
     de gestion regroupées en trois blocs, chacune menant à son écran. [route, icône, libellé, module (droit)] */
  const MENU_TERRITOIRE_ROLES = ['CS', 'DDEMP'];
  function rubriquesTerritoire() {
    const an = (/(\d{4})\D+(\d{4})/.exec(EG.session.annee_code || '') || [])[2] || '';
    return [
      { nom: 'Menu principal', icone: '\uE00F', coul: '#008751', items: [
        ['accueil', '\uE015', 'Tableau de bord', null], ['listes-classe', '\uE01F', 'Listes de classe', 'eleves'], ['carte-ecole', '\uE01D', 'Ma fiche école', 'carte-ecole'],
        ['gestion-ecoles', '\uE022', 'Écoles', 'reseau'], ['personnel-cs/enseignants', '\uE01C', 'Personnel enseignant', 'personnel-cs'],
        ['personnel-cs/administratif', '\uE011', 'Personnel administratif', 'personnel-cs'],
        ['statuts-cs/fe', '\uE01E', 'Personnel FE (directeurs, adjoints)', 'statuts-personnel'], ['statuts-cs/acdpe', '\uE01E', 'Personnel ACDPE (directeurs, adjoints)', 'statuts-personnel'],
        ['statuts-cs/prive', '\uE022', 'Écoles privées (directeurs, adjoints)', 'statuts-personnel'], ['statuts-cs/acdpctd', '\uE01E', 'Enseignants ACDPCTD', 'statuts-personnel'],
        ['personnel-cs/soutien', '\uE04A', 'Personnel de soutien', 'personnel-cs'], ['carrieres', '\uE016', 'Gestion des carrières', 'carrieres'],
        ['visites', '\uE02A', 'Visites et inspections', 'visites'], ['retraite', '\uE020', 'Retraite', 'retraite'],
        ['stats-cs', '\uE020', 'Effectifs élèves', 'stats-cs'], ['entite/infrastructures', '\uE026', 'Infrastructures', 'infrastructure'],
        ['entite/inventaires_mobilier', '\uE028', 'Mobilier & matériel', 'mobilier'], ['classes-roles/classes', '\uE040', 'Attribution des classes', 'classes-roles'],
        ['classes-roles/roles', '\uE044', 'Gestion collégiale', 'classes-roles'], ['uascep', '\uE047', 'Bureaux UASCEP', 'uascep'], ['repertoire', '\uE030', 'Répertoires et contacts', 'repertoire']
      ] },
      { nom: 'Vie scolaire, sport et pilotage', icone: '\uE04D', coul: '#B45309', items: [
        ['pvs-sport', '\uE04D', 'Sport scolaire', 'pvs-sport'], ['pvs-pilotage', '\uE015', 'Tableau de bord du pilotage', 'pvs-pilotage'],
        ['pvs-communication', '\uE050', 'Communication et alertes', 'pvs-communication'], ['pvs-sante', '\uE07F', 'Santé et inclusion', 'pvs-sante'],
        ['pvs-inspection', '\uE082', 'Formation et animations', 'pvs-inspection'], ['pvs-patrimoine', '\uE083', 'Manuels, besoins et dotations', 'pvs-patrimoine'], ['pvs-examens', '\uE084', 'Examens et concours', 'pvs-examens'], ['pvs-territoire', '\uE048', 'Territoire et suivi administratif', 'pvs-territoire']
      ] },
      { nom: 'Gestion pédagogique', icone: '\uE021', coul: '#2166AC', items: [
        ['pedagogie', '\uE031', 'Fiches, résumés, épreuves et guides', 'pedagogie'],
        ['pedagogie-sec', '\uE031', 'Pédagogie du secondaire (6e à Tle)', 'pedagogie-sec'],
        ['bulletins-sec', '\uE010', 'Notes et bulletins du secondaire', 'bulletins-sec'],
        ['maitre-semaine', '\uE004', 'Maître de semaine : planning, journal, rapport', 'maitre-semaine'],
        ['annonces-personnel', '\uE050', 'Annonces au personnel', 'annonces-personnel'],
        ['zone-desheritee', '\uE047', 'Zone déshéritée (prime de zone)', 'zone-desheritee'],
        ['releves-mensuels', '\uE004', 'Relevé mensuel des présences', 'releves-mensuels'],
        ['vie-etablissement', '\uE054', 'Vie de l’établissement (secondaire)', 'vie-etablissement'],
        ['examens-sec', '\uE00F', 'Examens BEPC / BAC', 'examens-sec'],
        ['ferme-ecole', '\uE00A', 'Ferme-école (lycée agricole)', 'ferme-ecole'],
        ['pilotage-sec', '\uE00A', 'Pilotage et enseignement technique (secondaire)', 'pilotage-sec'],
        ['evaluations', '\uE00E', 'Évaluations', 'evaluations'], ['eleves', '\uE01F', 'Listes des apprenants', 'eleves'],
        ['presences', '\uE017', 'Présence des apprenants', 'presences'], ['presences-personnel', '\uE018', 'Présence du personnel', 'presences'],
        ['bulletins', '\uE010', 'Notes et bulletins', 'evaluations'], ['fiche-cep', '\uE00F', 'Inscription CEP', 'fiche-cep'],
        ['ecoles-cm2', '\uE02E', 'Écoles à CM2 et CEP ' + an, 'ecoles-cm2'], ['cep-blanc-centre', '\uE027', 'Examen blanc', 'cep'],
        ['carte-eleve', '\uE02B', 'Cartes d’identité', 'carte-eleve']
      ] },
      { nom: 'Administration', icone: '\uE023', coul: '#7B4FA8', items: [
        ['docs-pedagogiques', '\uE031', 'Documents pédagogiques (PDF)', 'docs-pedagogiques'], ['documents-officiels', '\uE031', 'Documents officiels', 'documents-officiels'], ['telechargements', '\uE011', 'Fiches officielles', 'telechargements'], ['certificats', '\uE02F', 'Certificats', 'personnel'],
        ['rapport-rentree', '\uE00D', 'Rapports de rentrée', 'rapport-rentree'], ['courriers', '\uE04F', 'Archive courriers', 'courriers'],
        ['divisions', '\uE023', 'Divisions et services (statistiques, courbes)', 'divisions'], ['signatures', '\uE029', 'Signatures des acteurs', 'signatures'],
        ['ecarts-cs', '\uE016', 'Analyses et écarts', 'ecarts-cs'], ['cachet', '\uE033', 'Cachets et signatures', 'cachets'],
        ['entite/annees_scolaires', '\uE017', 'Années scolaires', 'socle'], ['calendrier-scolaire?type=FERIE&vue=agenda', '\uE017', 'Jours fériés', 'calendrier-scolaire'],
        ['import-export/import', '\uE00B', 'Import Excel', 'import-export'], ['import-export/sauvegarde', '\uE007', 'Sauvegarde', 'import-export']
      ] },
      { nom: 'Autres outils', icone: '\uE052', coul: '#55616B', replie: true, items: [
        ['espace-cs', '\uE024', 'Espace de la circonscription', 'espace-cs'], ['unites-pedagogiques', '\uE025', 'Unités pédagogiques', 'unites-pedagogiques'],
        ['calendrier-scolaire', '\uE017', 'Calendrier scolaire', 'calendrier-scolaire'], ['comptes', '\uE032', 'Comptes d’accès', 'comptes'],
        ['statuts-cs/recap', '\uE015', 'Personnel : récapitulatif par école', 'statuts-personnel'],
        ['scolarite-privee', '\uE020', 'Écoles privées : scolarité', 'scolarite-privee'], ['caisse-privee', '\uE030', 'Écoles privées : cahier des fonds', 'caisse-privee'],
        ['salaires-privee', '\uE04E', 'Écoles privées : salaires', 'salaires-privee'],
        ['import-export/jeux', '\uE011', 'Jeux de données', 'import-export'], ['import-export/personnel', '\uE01C', 'Fichiers du personnel (FE, ACDPE, ACDPCTD)', 'import-export'],
        ['modules', '\uE054', 'Tous les modules', null]
      ] }
    ];
  }

  function menuTerritoire(aside, lien) {
    rubriquesTerritoire().forEach(bloc => {
      const items = bloc.items.filter(it => !it[3] || EG.peutVoirModule(it[3]));
      if (!items.length) return;
      const details = el('details', { class: 'menu-categorie', open: !bloc.replie, dataset: { cat: bloc.nom } });
      details.style.setProperty('--coul-cat', bloc.coul);
      details.appendChild(el('summary', {}, [
        el('span', { class: 'menu-icone', text: bloc.icone, 'aria-hidden': 'true' }),
        el('span', { class: 'menu-texte', text: bloc.nom }),
        el('span', { class: 'menu-compte', text: String(items.length) })
      ]));
      items.forEach(([route, icone, lib]) => {
        const l = lien(route, icone, lib, 'principal');
        l.dataset.route = route.split('?')[0];
        details.appendChild(el('div', { class: 'menu-module', dataset: { texte: U.sansAccent(lib) } }, el('div', { class: 'menu-module-tete' }, [l])));
      });
      aside.appendChild(details);
    });
    aside.appendChild(el('p', { class: 'menu-vide muet petit', text: 'Aucune rubrique ne correspond.', hidden: true }));
  }

  function construireMenu() {
    const user = EG.session.user;
    const aside = el('aside', { class: 'menu-lateral', id: 'menu-lateral', 'aria-label': 'Menu principal' });
    const lien = (route, icone, lib, classe) => el('button', {
      class: 'menu-lien ' + (classe || ''), dataset: { route }, onclick: () => Routeur.aller(route)
    }, [el('span', { class: 'menu-icone', text: icone, 'aria-hidden': 'true' }), el('span', { class: 'menu-texte', text: lib })]);

    aside.appendChild(el('div', { class: 'menu-utilisateur' }, [
      el('strong', { text: ((user.prenoms || '') + ' ' + (user.nom || '')).trim() }),
      el('span', { class: 'muet petit', text: U.libelle(user.role) + (EG.session.ecole_id ? ' — ' + EG.session.ecole_nom : '') })
    ]));

    /* Élèves et parents : un menu réduit à l'essentiel. */
    if (user.role === 'PARENT' || user.role === 'ELEVE') {
      (NAV[user.role] || []).forEach(([route, icone, lib]) => aside.appendChild(lien(route, icone, lib)));
      return aside;
    }

    const champ = el('input', {
      type: 'search', class: 'menu-recherche', placeholder: 'Rechercher dans le menu', 'aria-label': 'Rechercher dans le menu',
      autocomplete: 'off', name: 'recherche-menu', value: '',
      oninput: e => filtrerMenu(aside, e.target.value)
    });
    aside.appendChild(champ);
    const blocMempCp = EG.EspaceMempCp ? EG.EspaceMempCp.blocMenu(lien) : null;
    if (MENU_TERRITOIRE_ROLES.indexOf(user.role) >= 0) {
      menuTerritoire(aside, lien);
      /* L'espace MEMP-CP vient juste après le menu principal. */
      if (blocMempCp) aside.insertBefore(blocMempCp, aside.querySelectorAll('.menu-categorie')[1] || aside.querySelector('.menu-vide'));
      return aside;
    }
    aside.appendChild(lien('accueil', '\uE000', 'Accueil', 'menu-accueil'));
    /* Accès rapide aux listes de classe (lecture seule), sans passer par les inscriptions */
    if (EG.peutVoirModule('eleves')) aside.appendChild(lien('listes-classe', '\uE01F', 'Listes de classe', 'menu-accueil'));
    /* La liste complète des modules reste à portée de clic sur ordinateur comme sur téléphone. */
    if (!['PARENT', 'ELEVE'].includes(user.role)) aside.appendChild(lien('modules', '\uE054', 'Tous les modules', 'menu-accueil'));
    if (blocMempCp) aside.appendChild(blocMempCp);

    (EG.CATEGORIES_MODULES || []).forEach(cat => {
      const modules = EG.MODULES.filter(m => m.cat === cat.code && EG.peutVoirModule(m.code));
      if (!modules.length) return;
      const details = el('details', { class: 'menu-categorie', open: true, dataset: { cat: cat.code } });
      details.style.setProperty('--coul-cat', cat.coul);
      details.appendChild(el('summary', {}, [
        el('span', { class: 'menu-icone', text: cat.icone, 'aria-hidden': 'true' }),
        el('span', { class: 'menu-texte', text: cat.nom }),
        el('span', { class: 'menu-compte', text: String(modules.length) })
      ]));
      modules.forEach(m => {
        const subs = sousLiens(m);
        const bloc = el('div', {
          class: 'menu-module', dataset: {
            texte: U.sansAccent([m.nom].concat(subs.map(x => x.lib)).join(' '))
          }
        });
        const tete = el('div', { class: 'menu-module-tete' }, [lien(routeModule(m), m.icone, m.nom, 'principal')]);
        if (subs.length) {
          tete.appendChild(el('button', {
            class: 'menu-deplier', 'aria-label': 'Afficher les rubriques de ' + m.nom, 'aria-expanded': 'false', text: '›',
            onclick: e => {
              const ouvert = bloc.classList.toggle('deplie');
              e.currentTarget.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
            }
          }));
        }
        bloc.appendChild(tete);
        if (subs.length) {
          bloc.appendChild(el('div', { class: 'menu-sous' }, subs.map(x => lien(x.route, x.icone, x.lib, 'sous'))));
        }
        details.appendChild(bloc);
      });
      aside.appendChild(details);
    });
    aside.appendChild(el('p', { class: 'menu-vide muet petit', text: 'Aucune rubrique ne correspond.', hidden: true }));
    return aside;
  }

  function filtrerMenu(aside, saisie) {
    const q = U.sansAccent(saisie).trim();
    let total = 0;
    Array.prototype.forEach.call(aside.querySelectorAll('.menu-categorie'), det => {
      let vus = 0;
      Array.prototype.forEach.call(det.querySelectorAll('.menu-module'), bloc => {
        const ok = !q || bloc.dataset.texte.indexOf(q) >= 0;
        bloc.hidden = !ok;
        if (ok) vus++;
        if (q && ok) bloc.classList.add('deplie'); else if (!q) bloc.classList.remove('deplie');
      });
      det.hidden = !vus;
      total += vus;
      if (q) det.open = vus > 0;
    });
    const vide = aside.querySelector('.menu-vide');
    if (vide) vide.hidden = !q || total > 0;
    if (!q) majMenuActif();
  }

  /** Met en évidence la rubrique en cours et déplie ce qui la contient. */
  function majMenuActif() {
    const menu = document.getElementById('menu-lateral');
    if (!menu) return;
    const chemin = (location.hash || '').replace(/^#\/?/, '').split('?')[0].replace(/\/+$/, '') || 'accueil';
    let meilleur = null, taille = -1;
    Array.prototype.forEach.call(menu.querySelectorAll('.menu-lien'), b => {
      const r = b.dataset.route;
      b.classList.remove('actif');
      if ((chemin === r || chemin.indexOf(r + '/') === 0) && r.length > taille) { meilleur = b; taille = r.length; }
    });
    if (!meilleur) return;
    meilleur.classList.add('actif');
    const bloc = meilleur.closest('.menu-module');
    if (bloc) {
      if (meilleur.classList.contains('sous')) {
        bloc.classList.add('deplie');
        const fleche = bloc.querySelector('.menu-deplier');
        if (fleche) fleche.setAttribute('aria-expanded', 'true');
      }
      const det = bloc.closest('details');
      if (det) det.open = true;
    }
    /* Le menu défile tout seul jusqu'à la rubrique en cours, sans toucher au contenu. */
    const boite = meilleur.getBoundingClientRect(), cadre = menu.getBoundingClientRect();
    if (boite.top < cadre.top + 60 || boite.bottom > cadre.bottom - 20) {
      menu.scrollTop += boite.top - cadre.top - cadre.height / 3;
    }
  }

  EG.majMenu = majMenuActif;

  function basculerMenu() {
    const ouvert = document.body.classList.toggle('menu-ouvert');
    const b = document.getElementById('bouton-menu');
    if (b) b.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
  }
  function fermerMenu() {
    document.body.classList.remove('menu-ouvert');
    const b = document.getElementById('bouton-menu');
    if (b) b.setAttribute('aria-expanded', 'false');
  }

  function menuCompte() {
    const u = EG.session.user;
    U.modal('Mon compte', el('div', {}, [
      el('p', {}, [el('strong', { text: (u.prenoms || '') + ' ' + u.nom }), el('br'), document.createTextNode(U.libelle(u.role))]),
      el('p', { class: 'muet', text: EG.session.ecole_nom + ' • année ' + EG.session.annee_code }),
      el('p', { class: 'muet petit', text: 'ÉduGestion Pro ' + (EG.VERSION || '') + ' — fonctionne hors ligne, les données restent sur cet appareil jusqu’à la synchronisation.' }),
      el('p', { class: 'muet petit', text: u.signature_image ? 'Signature enregistrée : elle est apposée sur les documents que vous éditez.' : 'Aucune signature enregistrée : vos documents porteront un emplacement à signer à la main.' }),
      el('div', { class: 'barre-actions' }, [
        el('button', {
          class: 'btn btn-fantome', text: u.signature_image ? 'Modifier ma signature' : 'Enregistrer ma signature',
          onclick: () => { document.querySelector('.modal-fond').remove(); EG.Docs.capturerSignature(u, null, { table: 'users' }); }
        }),
        el('button', {
          class: 'btn btn-fantome', text: 'Installer l’application',
          onclick: () => { document.querySelector('.modal-fond').remove(); EG.proposerInstallation(); }
        }),
        el('button', { class: 'btn btn-fantome', text: 'Changer mon mot de passe', onclick: () => { document.querySelector('.modal-fond').remove(); EG.MotDePasse.changerMotDePasse(); } }),
        el('button', { class: 'btn btn-fantome', text: u.secours_question ? '\uE032 Changer ma question de secours' : '\uE032 Définir ma question de secours', onclick: () => { document.querySelector('.modal-fond').remove(); EG.MotDePasse.questionSecours(); } }),
        el('button', { class: 'btn btn-fantome', text: 'Synchronisation', onclick: () => { document.querySelector('.modal-fond').remove(); Routeur.aller('sync'); } }),
        el('button', { class: 'btn btn-fantome', text: 'Tous les modules', onclick: () => { document.querySelector('.modal-fond').remove(); Routeur.aller('modules'); } })
      ])
    ]), fermer => [
      el('button', { class: 'btn btn-fantome', text: 'Fermer', onclick: fermer }),
      el('button', { class: 'btn btn-danger', text: 'Se déconnecter', onclick: () => { fermer(); deconnecter(); } })
    ]);
  }

  EG.majSynchro = function () {
    const n = document.getElementById('indicateur-synchro');
    if (!n) return;
    DB.outboxCount().then(c => {
      if (!navigator.onLine) { n.className = 'synchro hors-ligne'; n.textContent = '\uE05A Hors ligne' + (c ? ' · ' + c : ''); }
      else if (c) { n.className = 'synchro attente'; n.textContent = '\uE05E ' + c + ' en attente'; }
      else { n.className = 'synchro ok'; n.textContent = '✓ À jour'; }
    });
  };

  /* ---------------- Rendu des routes ---------------- */
  function rendre() {
    if (!EG.session) return;
    const { vue, args, params } = Routeur.lire();
    const contenu = document.getElementById('contenu');
    if (!contenu) return;
    contenu.textContent = '';
    contenu.scrollTop = 0;

    Array.prototype.forEach.call(document.querySelectorAll('.onglet'), o => {
      o.classList.toggle('actif', o.dataset.route === vue);
    });
    fermerMenu();
    majMenuActif();

    const rendu = Routeur.routes[vue];
    if (!rendu) { contenu.appendChild(U.vide('Cette page n’existe pas.')); return; }
    try {
      if (EG.Ecrans) EG.Ecrans.dernierEtat = null;
      rendu(contenu, args, params);
      if (EG.LiensImportExport) EG.LiensImportExport.poser(contenu, vue, args, params);
    } catch (e) {
      contenu.appendChild(U.vide('Une erreur est survenue : ' + e.message));
      console.error(e);
    }
    contenu.focus({ preventScroll: true });
  }

  window.addEventListener('hashchange', rendre);
  window.addEventListener('online', EG.majSynchro);
  window.addEventListener('offline', EG.majSynchro);

  /* ---------------- Installation sur l'appareil ----------------
     Le navigateur ne propose l'installation directe que sur une adresse
     sécurisée. Ailleurs, le bandeau reste affiché mais explique la marche à
     suivre plutôt que de disparaître sans rien dire. */
  let promptInstall = null;
  let bandeau = null;

  function dejaInstallee() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || window.navigator.standalone === true;
  }

  function surIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function poserBandeau(texte, action) {
    if (bandeau) bandeau.remove();
    bandeau = el('div', { class: 'bandeau-install' }, [
      el('button', { class: 'bandeau-install-action', text: texte, onclick: action }),
      el('button', {
        class: 'bandeau-install-fermer', text: '✕', 'aria-label': 'Masquer',
        onclick: () => {
          retirerBandeau();
          try { sessionStorage.setItem('install_masque', '1'); } catch (e) { /* sans effet */ }
        }
      })
    ]);
    document.body.appendChild(bandeau);
    /* Le contenu se décale : le bandeau ne doit jamais couvrir une barre d'actions. */
    document.body.classList.add('avec-bandeau');
  }

  function retirerBandeau() {
    if (bandeau) { bandeau.remove(); bandeau = null; }
    document.body.classList.remove('avec-bandeau');
  }

  /** Marche à suivre selon l'appareil, quand le navigateur ne propose rien. */
  function expliquerInstallation() {
    const fichier = location.protocol === 'file:';
    const etapes = fichier
      ? [
        'L’application est ouverte depuis un fichier de votre disque. Les navigateurs '
          + 'réservent l’installation aux adresses sécurisées : il faut donc la mettre en ligne une fois.',
        'Ouvrez app.netlify.com/drop, puis glissez-y le dossier « edugestion-pro » — pas le fichier .zip.',
        'Une adresse en .netlify.app s’affiche après une trentaine de secondes.',
        'Ouvrez cette adresse sur cet appareil : le bandeau d’installation apparaîtra alors.'
      ]
      : surIOS()
        ? [
          'Sur iPhone et iPad, l’installation se fait depuis Safari.',
          'Touchez le bouton Partager, en bas de l’écran.',
          'Choisissez « Sur l’écran d’accueil », puis « Ajouter ».'
        ]
        : [
          'Votre navigateur n’a pas encore proposé l’installation.',
          'Ouvrez son menu — les trois points en haut à droite — puis choisissez '
            + '« Installer l’application » ou « Ajouter à l’écran d’accueil ».',
          'Sur ordinateur, une icône d’installation peut aussi apparaître à droite de la barre d’adresse.'
        ];

    U.modal('Installer ÉduGestion Pro', el('div', {}, [
      el('p', { class: 'muet', text: 'Une fois installée, l’application s’ouvre depuis l’écran '
        + 'd’accueil et fonctionne sans réseau.' }),
      el('ol', { class: 'liste-etapes' }, etapes.map(t => el('li', { text: t })))
    ]), fermer => [el('button', { class: 'btn btn-primaire', text: 'J’ai compris', onclick: fermer })]);
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    promptInstall = e;
    if (dejaInstallee()) return;
    poserBandeau('\uE045 Installer ÉduGestion Pro sur cet appareil', () => {
      promptInstall.prompt();
      promptInstall.userChoice.then(() => { retirerBandeau(); promptInstall = null; });
    });
  });

  window.addEventListener('appinstalled', () => {
    retirerBandeau();
    U.toast('ÉduGestion Pro est installée sur cet appareil');
  });

  /* Si le navigateur n'a rien proposé au bout de quelques secondes, le bandeau
     s'affiche quand même et renvoie vers la marche à suivre. */
  function proposerInstallation() {
    if (bandeau || promptInstall || dejaInstallee()) return;
    try { if (sessionStorage.getItem('install_masque')) return; } catch (e) { /* sans effet */ }
    poserBandeau('\uE045 Installer ÉduGestion Pro — comment faire', expliquerInstallation);
  }
  EG.proposerInstallation = expliquerInstallation;

  /* ---------------- Amorçage ---------------- */
  function demarrer() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      /* Une nouvelle version prend la main en arrière-plan : la page ouverte affiche encore l'ancienne
         jusqu'au rechargement. On le propose à l'utilisateur plutôt que de le laisser sur l'ancienne. */
      const avaitUnControleur = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!avaitUnControleur || EG.majProposee) return;
        EG.majProposee = true;
        U.modal('Nouvelle version disponible', el('p', { text: 'ÉduGestion Pro a été mis à jour. Actualisez la page pour utiliser la dernière version : vos données sont conservées.' }),
          fermer => [
            el('button', { class: 'btn btn-fantome', text: 'Plus tard', onclick: fermer }),
            el('button', { class: 'btn btn-primaire', text: 'Actualiser maintenant', onclick: () => location.reload() })
          ]);
      });
      navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne indisponible sans HTTPS */ });
    }
    /* Hauteur réelle de l'écran : sur certains téléphones, 100vh dépasse la zone visible et la barre du bas
       (dont l'onglet « Modules ») passe sous le bord de l'écran. */
    const hauteurEcran = () => document.documentElement.style.setProperty('--hauteur-app', window.innerHeight + 'px');
    hauteurEcran();
    window.addEventListener('resize', hauteurEcran);
    window.addEventListener('orientationchange', () => setTimeout(hauteurEcran, 250));
    /* Une erreur asynchrone dans un écran ne doit jamais laisser la zone de travail vide sans explication. */
    window.addEventListener('unhandledrejection', ev => {
      console.error(ev.reason);
      const c = document.getElementById('contenu');
      if (c && EG.session && !c.querySelector('.etat-vide')) {
        const n = c.children.length;
        if (n <= 1) c.appendChild(U.vide('Cet écran n’a pas pu s’afficher entièrement (' + ((ev.reason && ev.reason.message) || 'erreur inconnue') + '). Retournez à l’accueil puis réessayez.'));
      }
    });
    setTimeout(proposerInstallation, 4000);
    DB.open()
      .then(() => EG.seed())
      .then(() => EG.majMatieres())
      .then(() => EG.majTerritoiresGeographie())
      .then(() => EG.majCirconscriptions())
      .then(() => EG.retirerExemples())
      .then(() => EG.retirerComptesExemple())
      .then(() => EG.migrerLocalisationEcoles())
      .then(() => EG.migrerRoles())
      .then(() => EG.majProgrammes())
      .then(() => EG.assurerFichesRecensement())
      .then(() => DB.meta('session_utilisateur'))
      .then(id => id ? DB.get('users', id) : null)
      .then(u => (u && u.actif !== false) ? ouvrirSession(u) : ecranConnexion())
      .then(() => rendre())
      .catch(e => {
        console.error(e);
        document.getElementById('app').appendChild(el('div', { class: 'ecran-connexion' },
          el('div', { class: 'carte-connexion' }, [
            el('h1', { text: 'Démarrage impossible' }),
            el('p', { text: 'Le stockage local n’est pas accessible sur cet appareil : ' + e.message }),
            el('p', { class: 'muet petit', text: 'Vérifiez que la navigation privée est désactivée, puis rechargez la page.' })
          ])));
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
  /* Barre du haut : logo et nom de l'école de la session (logo automatique ou importé, voir js/logo-ecole.js) */
  EG.majMarqueEcole = function () {
    const id = EG.session && EG.session.ecole_id; if (!id || !global.LogoEcole) return Promise.resolve();
    return EG.DB.get('ecoles', id).then(e => {
      const g = document.getElementById('marqueLogoEcole'), n = document.getElementById('marqueNomEcole');
      if (!e || !g) return;
      g.className = 'marque-logo-ecole'; g.innerHTML = global.LogoEcole.svgDe(e, 26);
      if (n) { n.textContent = e.nom; n.title = e.devise || ''; }
    }).catch(() => {});
  };
})(window);
