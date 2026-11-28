/* ÉduGestion Pro Master — comptes d'accès : écoles, enseignants, parents et élèves.

   Un seul écran, quatre onglets. Pour chaque personne ou école : créer le
   compte, remettre un mot de passe provisoire (jamais conservé en clair),
   le réinitialiser, désactiver ou réactiver l'accès. La création peut se faire
   en lot : « Créer les comptes manquants » traite toute la liste affichée.

   À sa première connexion, chacun choisit son propre mot de passe : le mot de
   passe provisoire ne sert qu'une fois (voir app.js). */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const indexer = E.indexer, entete = E.entete;
  const S = () => EG.Sortie;
  const sa = U.sansAccent;
  const ech = s => EG.Docs.echapper(s);

  /* Qui peut gérer les comptes, et lesquels : la direction d'école ne gère que
     les siens (enseignants, parents, élèves de son école). */
  const ROLES_COMPTES = ['ADMIN_MEMP', 'ADMIN_TECHNIQUE', 'DDEMP', 'CS', 'DIRECTEUR'];
  const ONGLETS = [
    ['ecoles', '\uE022 Écoles'], ['enseignants', '\uE01E Enseignants'],
    ['parents', '\uE01C Parents'], ['eleves', '\uE021 Élèves']
  ];
  const TAILLE_PAGE = 100;

  /* ---------------- Petits outils partagés ---------------- */

  /** Barre d'onglets d'un écran : [[code, libellé], …]. */
  function barreOnglets(liste, actif, onChoix) {
    return el('div', { class: 'onglets-page', role: 'tablist' }, liste.map(([code, lib]) => el('button', {
      class: 'onglet-page' + (code === actif ? ' actif' : ''), role: 'tab',
      'aria-selected': code === actif ? 'true' : 'false', text: lib, onclick: () => onChoix(code)
    })));
  }
  E.barreOnglets = barreOnglets;
  /** Change l'adresse affichée (onglet choisi) sans redessiner l'écran, et suit le menu. */
  E.remplacerRoute = function (chemin) {
    history.replaceState(null, '', '#/' + chemin);
    if (EG.majMenu) EG.majMenu();
  };

  /** Affiche `liste` par pages de 100 lignes : ne fige jamais l'écran sur un grand périmètre. */
  function paginer(zone, liste, construire, taille) {
    taille = taille || TAILLE_PAGE;
    let affiche = 0;
    const conteneur = el('div');
    const pied = el('div', { class: 'barre-actions' });
    zone.appendChild(conteneur); zone.appendChild(pied);
    function plus() {
      const fin = Math.min(liste.length, affiche + taille);
      conteneur.appendChild(construire(liste.slice(affiche, fin), affiche === 0));
      affiche = fin;
      pied.textContent = '';
      if (affiche < liste.length) {
        pied.appendChild(el('span', { class: 'muet', text: U.nombre(affiche) + ' affichés sur ' + U.nombre(liste.length) }));
        pied.appendChild(el('button', { class: 'btn btn-fantome btn-petit', text: 'Afficher la suite', onclick: plus }));
      }
    }
    plus();
  }
  E.paginer = paginer;

  const nomComplet = (nom, prenoms) => ((nom || '').toUpperCase() + ' ' + (prenoms || '')).trim();
  const chiffres = t => String(t || '').replace(/\D+/g, '');

  /* ---------------- Création et réinitialisation ---------------- */

  /** Ensemble des identifiants déjà pris, pour ne jamais en attribuer deux fois. */
  function ensembleIdentifiants(users) {
    const pris = {};
    users.forEach(u => { pris[String(u.identifiant || '').toLowerCase()] = true; });
    return pris;
  }

  function identifiantLibre(base, pris) {
    let b = (base || 'compte').slice(0, 28), i = 1, id = b;
    while (pris[id.toLowerCase()]) { i++; id = b + i; }
    pris[id.toLowerCase()] = true;
    return id;
  }

  /**
   * Crée le compte et rend { user, mdp } ; le mot de passe provisoire n'existe
   * qu'ici et dans l'écran de remise : seule son empreinte est enregistrée.
   */
  function creerCompte(champs, pris) {
    const mdp = S().motDePasseProvisoire(8);
    const identifiant = identifiantLibre(champs.identifiant, pris);
    return EG.hashMotDePasse(mdp).then(h => DB.put('users', Object.assign({
      actif: true, doit_changer_mdp: true, ecole_id: null, territoire_id: null,
      personnel_id: null, eleve_id: null
    }, champs, { identifiant, password_hash: h }))).then(user => {
      DB.audit('CREATION_COMPTE', 'users', user.id, { role: user.role });
      return { user, mdp };
    });
  }

  function reinitialiser(user) {
    const mdp = S().motDePasseProvisoire(8);
    return EG.hashMotDePasse(mdp)
      .then(h => DB.put('users', Object.assign({}, user, { password_hash: h, doit_changer_mdp: true, actif: true })))
      .then(u => { DB.audit('REINITIALISATION_MDP', 'users', u.id, {}); if (window.Securite) window.Securite.reussite((EG.DB.nom || 'edugestion'), u.identifiant); return { user: u, mdp }; });
  }

  function basculerActif(user) {
    return DB.put('users', Object.assign({}, user, { actif: user.actif === false }))
      .then(u => { DB.audit(u.actif === false ? 'DESACTIVATION_COMPTE' : 'REACTIVATION_COMPTE', 'users', u.id, {}); return u; });
  }

  /* ---------------- Remise des identifiants ---------------- */

  /**
   * Fenêtre affichée après création ou réinitialisation. C'est le seul moment où
   * les mots de passe provisoires sont visibles : on propose de les imprimer
   * (une fiche à découper par personne) ou de les enregistrer dans un tableur.
   */
  function remettre(titre, lignes, apres) {
    if (!lignes.length) return;
    const table = U.tableau([
      { titre: 'Titulaire', valeur: l => l.nom },
      { titre: 'Identifiant', valeur: l => el('code', { class: 'json', text: l.identifiant }) },
      { titre: 'Mot de passe provisoire', valeur: l => el('code', { class: 'json', text: l.mdp }) }
    ], lignes);
    const corpsFiches = () => '<h2>Fiches d’accès à ÉduGestion Pro Master</h2>'
      + '<p class="consigne">À découper et à remettre à chaque titulaire. Le mot de passe est provisoire : '
      + 'il est à changer dès la première connexion.</p><div class="fiches-acces">'
      + lignes.map(l => '<div class="fiche-acces"><h4>ÉduGestion Pro Master — fiche d’accès</h4>'
        + '<p><strong>' + ech(l.nom) + '</strong></p>'
        + '<p>' + ech(l.role) + (l.ecole ? ' — ' + ech(l.ecole) : '') + '</p>'
        + '<p>Identifiant : <span class="code">' + ech(l.identifiant) + '</span></p>'
        + '<p>Mot de passe provisoire : <span class="code">' + ech(l.mdp) + '</span></p>'
        + '<p class="avis">À la première connexion, choisissez votre propre mot de passe. Ne le communiquez à personne.</p></div>').join('')
      + '</div>';
    U.modal(titre, el('div', {}, [
      el('p', { class: 'ok-texte', text: lignes.length + ' compte(s) prêt(s).' }),
      el('p', { class: 'muet petit', text: 'Notez ou imprimez ces mots de passe maintenant : ils ne sont pas conservés et ne seront plus affichés. '
        + 'Chaque titulaire choisira son propre mot de passe à sa première connexion.' }),
      table
    ]), fermer => [
      el('button', { class: 'btn btn-fantome', text: 'Imprimer les fiches d’accès', onclick: () => S().imprimer('Fiches d’accès', corpsFiches(), { enTete: false }) }),
      el('button', {
        class: 'btn btn-fantome', text: 'Enregistrer (Excel)', onclick: () => S().excel('fiches-acces', [{
          nom: 'Accès', lignes: [['Titulaire', 'Rôle', 'École', 'Identifiant', 'Mot de passe provisoire']]
            .concat(lignes.map(l => [l.nom, l.role, l.ecole || '', l.identifiant, l.mdp]))
        }])
      }),
      el('button', { class: 'btn btn-primaire', text: 'Terminé', onclick: () => { fermer(); if (apres) apres(); } })
    ]);
  }

  /* ---------------- Écran ---------------- */

  Routeur.definir('comptes', function (racine, args) {
    const user = EG.session.user;
    const direction = !!EG.session.ecole_id;
    racine.appendChild(entete('Comptes d’accès',
      direction
        ? 'Les comptes des enseignants, des parents et des élèves de votre école.'
        : 'Les comptes des écoles, des enseignants, des parents et des élèves de votre périmètre.'));

    if (ROLES_COMPTES.indexOf(user.role) < 0 || !EG.peutEcrire()) {
      racine.appendChild(U.vide('La gestion des comptes est réservée à l’administration, aux directions départementales, '
        + 'aux circonscriptions scolaires et aux directeurs d’école.'));
      return;
    }

    const onglets = direction ? ONGLETS.filter(o => o[0] !== 'ecoles') : ONGLETS;
    let actif = args[0] && onglets.some(o => o[0] === args[0]) ? args[0] : onglets[0][0];
    const zoneOnglets = el('div');
    const zone = el('div');
    racine.appendChild(zoneOnglets); racine.appendChild(zone);

    const F = { q: '', ecole: '', cs: '', classe: '', compte: '' }; /* filtres, conservés entre les rafraîchissements */
    let D = null;

    function choisir(code) {
      actif = code;
      F.q = ''; F.ecole = ''; F.classe = ''; F.compte = '';
      E.remplacerRoute('comptes/' + code);
      dessinerOnglets();
      dessiner();
    }
    function dessinerOnglets() {
      zoneOnglets.textContent = '';
      zoneOnglets.appendChild(barreOnglets(onglets, actif, choisir));
    }

    /* -------- chargement du périmètre -------- */

    function charger() {
      return Promise.all([
        DB.all('users'), DB.all('ecoles'), DB.all('territoires'), DB.all('personnels'), DB.all('eleves'),
        DB.where('inscriptions_eleves', { annee_scolaire_id: EG.session.annee_id, statut: 'ACTIF' }),
        DB.all('classes'), DB.all('profils_parents'), DB.all('liens_parent_enfant')
      ]).then(([users, ecoles, terr, personnels, eleves, ins, classes, parents, liens]) => {
        const ecolesP = EG.ecolesDuPerimetre(ecoles, terr).filter(e => e.actif !== false)
          .sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr', { numeric: true }));
        const ids = {}; ecolesP.forEach(e => { ids[e.id] = true; });
        D = {
          users, terr, ecoles: ecolesP, ie: indexer(ecolesP), it: indexer(terr), ids,
          personnels: personnels.filter(p => p.ecole_id && ids[p.ecole_id] && p.actif !== false
            && (!p.fonction || p.fonction === 'ENSEIGNANT' || p.fonction === 'DIRECTEUR')),
          eleves: indexer(eleves), ins: ins.filter(i => ids[i.ecole_id]), ic: indexer(classes),
          parents, liens, iu: indexer(users), pris: ensembleIdentifiants(users)
        };
      });
    }

    function rafraichir() { return charger().then(dessiner); }

    /* -------- cellules communes -------- */

    const compteDe = u => u ? (u.actif === false ? U.badge('Désactivé', 'danger')
      : u.doit_changer_mdp ? U.badge('Créé — jamais connecté', 'attention') : U.badge('Actif', 'ok')) : U.badge('Aucun compte', 'neutre');

    function actionsCompte(u, creer, libelleCree) {
      if (!u) return el('button', { class: 'btn btn-petit btn-primaire', text: 'Créer le compte', onclick: e => { e.stopPropagation(); creer(); } });
      return el('div', { class: 'actions-mini' }, [
        el('button', {
          class: 'btn btn-petit btn-fantome', text: 'Nouveau mot de passe',
          onclick: () => U.confirmer('Réinitialiser l’accès',
            'Un nouveau mot de passe provisoire sera créé pour « ' + u.identifiant + ' ». L’ancien cessera de fonctionner.',
            () => reinitialiser(u).then(r => remettre('Nouveau mot de passe', [{
              nom: libelleCree, role: U.libelle(u.role), ecole: (D.ie[u.ecole_id] || {}).nom || '',
              identifiant: r.user.identifiant, mdp: r.mdp
            }], rafraichir)), 'Réinitialiser')
        }),
        el('button', {
          class: 'btn btn-petit btn-fantome' + (u.actif === false ? '' : ' btn-alerte'),
          text: u.actif === false ? 'Réactiver' : 'Désactiver',
          onclick: () => basculerActif(u).then(() => { U.toast(u.actif === false ? 'Compte désactivé' : 'Compte réactivé'); EG.majSynchro(); return rafraichir(); })
        })
      ]);
    }

    /** Crée plusieurs comptes d'un coup puis affiche les identifiants remis. */
    function enLot(titre, aCreer) {
      if (!aCreer.length) { U.toast('Tous les comptes existent déjà', 'attention'); return; }
      U.confirmer(titre, aCreer.length + ' compte(s) vont être créés, avec un mot de passe provisoire chacun. Continuer ?', () => {
        const remises = [];
        /* En série : les identifiants générés restent uniques d'un compte à l'autre. */
        aCreer.reduce((suite, item) => suite.then(() => creerCompte(item.champs, D.pris).then(r => {
          remises.push({ nom: item.nom, role: U.libelle(item.champs.role), ecole: item.ecole || '', identifiant: r.user.identifiant, mdp: r.mdp });
          if (item.apres) return item.apres(r.user);
        })), Promise.resolve()).then(() => { EG.majSynchro(); remettre('Comptes créés', remises, rafraichir); });
      }, 'Créer les comptes');
    }

    function unSeul(item, titre) {
      creerCompte(item.champs, D.pris).then(r => {
        const suite = item.apres ? item.apres(r.user) : null;
        return Promise.resolve(suite).then(() => {
          EG.majSynchro();
          remettre(titre || 'Compte créé', [{
            nom: item.nom, role: U.libelle(item.champs.role), ecole: item.ecole || '',
            identifiant: r.user.identifiant, mdp: r.mdp
          }], rafraichir);
        });
      });
    }

    /* -------- barre de filtres -------- */

    function filtres(options) {
      options = options || {};
      const barre = el('div', { class: 'barre-filtres' });
      const rech = U.champRecherche(options.placeholder || 'Rechercher', v => { F.q = v; options.relancer(); });
      rech.querySelector('input').value = F.q;
      barre.appendChild(rech);
      if (options.ecoles && D.ecoles.length > 1) {
        const parCs = {};
        D.ecoles.forEach(e => { if (e.territoire_id) parCs[e.territoire_id] = true; });
        const csListe = Object.keys(parCs).map(id => D.it[id]).filter(Boolean)
          .sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr', { numeric: true }));
        if (csListe.length > 1) {
          barre.appendChild(U.selecteur('Circonscription', csListe.map(c => ({ value: c.id, label: c.nom })), F.cs,
            v => { F.cs = v; F.ecole = ''; F.classe = ''; options.relancer(); }, { libelleVide: 'Toutes' }));
        }
        const dansCs = D.ecoles.filter(e => !F.cs || e.territoire_id === F.cs);
        if (dansCs.length <= 400 && dansCs.length > 1) {
          barre.appendChild(U.selecteur('École', dansCs.map(e => ({ value: e.id, label: e.nom })), F.ecole,
            v => { F.ecole = v; F.classe = ''; options.relancer(); }, { libelleVide: 'Toutes' }));
        }
      }
      if (options.classes) {
        const cl = classesVisibles();
        if (cl.length) {
          barre.appendChild(U.selecteur('Classe', cl.map(c => ({ value: c.id, label: (c.libelle || c.code) + (D.ecoles.length > 1 ? ' — ' + ((D.ie[c.ecole_id] || {}).nom || '') : '') })),
            F.classe, v => { F.classe = v; options.relancer(); }, { libelleVide: 'Toutes' }));
        }
      }
      barre.appendChild(U.selecteur('Compte', [{ value: 'avec', label: 'Avec un compte' }, { value: 'sans', label: 'Sans compte' }, { value: 'off', label: 'Désactivés' }],
        F.compte, v => { F.compte = v; options.relancer(); }, { libelleVide: 'Tous' }));
      return barre;
    }

    const ecoleOk = e => (!F.ecole || e.id === F.ecole) && (!F.cs || e.territoire_id === F.cs);
    const idEcoleOk = id => { const e = D.ie[id]; return !!e && ecoleOk(e); };
    function classesVisibles() {
      const utilisees = {};
      D.ins.forEach(i => { if (i.classe_id && idEcoleOk(i.ecole_id)) utilisees[i.classe_id] = true; });
      return Object.keys(utilisees).map(id => D.ic[id]).filter(Boolean)
        .sort((a, b) => EG.NIVEAUX.indexOf(a.niveau) - EG.NIVEAUX.indexOf(b.niveau) || String(a.libelle).localeCompare(String(b.libelle)));
    }
    function filtreCompte(u) {
      if (F.compte === 'avec') return !!u;
      if (F.compte === 'sans') return !u;
      if (F.compte === 'off') return !!u && u.actif === false;
      return true;
    }

    /* =====================================================================
       Onglet Écoles
       ===================================================================== */

    function compteEcole(e) {
      return D.users.filter(u => u.role === 'DIRECTEUR' && u.ecole_id === e.id && !u.personnel_id)[0] || null;
    }
    function baseEcole(e) {
      return 'ecole.' + S().slug(e.code_ecole || e.nom);
    }
    function itemEcole(e) {
      const cs = D.it[e.territoire_id];
      return {
        nom: e.directeur_nom || e.nom, ecole: e.nom,
        champs: {
          identifiant: baseEcole(e), nom: e.directeur_nom || e.nom, prenoms: '', role: 'DIRECTEUR', ecole_id: e.id,
          telephone: e.directeur_telephone || e.telephone || ''
        },
        cs: cs ? cs.nom : ''
      };
    }

    function ongletEcoles() {
      zone.appendChild(filtres({ placeholder: 'Rechercher une école ou un directeur', ecoles: false, relancer: dessiner }));
      /* Pour les écoles, le filtre « circonscription » est plus utile que « école ». */
      const csListe = {};
      D.ecoles.forEach(e => { if (e.territoire_id && D.it[e.territoire_id]) csListe[e.territoire_id] = D.it[e.territoire_id]; });
      const cs = Object.keys(csListe).map(k => csListe[k]).sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr', { numeric: true }));
      if (cs.length > 1) {
        zone.lastChild.insertBefore(U.selecteur('Circonscription', cs.map(c => ({ value: c.id, label: c.nom })), F.cs,
          v => { F.cs = v; dessiner(); }, { libelleVide: 'Toutes' }), zone.lastChild.children[1]);
      }

      const q = sa(F.q);
      const liste = D.ecoles.filter(e => (!F.cs || e.territoire_id === F.cs)
        && (!q || sa(e.nom).indexOf(q) >= 0 || sa(e.code_ecole || '').indexOf(q) >= 0 || sa(e.directeur_nom || '').indexOf(q) >= 0)
        && filtreCompte(compteEcole(e)));
      const tous = D.ecoles.filter(e => !F.cs || e.territoire_id === F.cs);
      const sans = tous.filter(e => !compteEcole(e));

      zone.appendChild(el('div', { class: 'grille grille-stats' }, [
        U.stat(U.nombre(tous.length), 'Écoles'),
        U.stat(U.nombre(tous.length - sans.length), 'Avec un compte'),
        U.stat(U.nombre(sans.length), 'Sans compte', sans.length ? 'attention' : '')
      ]));
      if (!D.ecoles.length) {
        zone.appendChild(U.vide('Aucune école dans votre périmètre. Ajoutez-les depuis « Écoles par circonscription » ou importez-les d’un fichier.'));
        return;
      }
      zone.appendChild(el('div', { class: 'barre-actions' }, [
        el('button', {
          class: 'btn btn-primaire', text: 'Créer les comptes manquants (' + U.nombre(sans.length) + ')', disabled: !sans.length,
          onclick: () => enLot('Créer les comptes des écoles', sans.map(itemEcole))
        })
      ]));

      paginer(zone, liste, lignes => U.tableau([
        { titre: 'École', valeur: e => el('div', {}, [el('strong', { text: e.nom }), el('br'), el('span', { class: 'muet petit', text: e.code_ecole || '' })]) },
        { titre: 'Circonscription', valeur: e => (D.it[e.territoire_id] || {}).nom || '—' },
        { titre: 'Directeur', valeur: e => e.directeur_nom || '—' },
        { titre: 'Compte', valeur: e => { const u = compteEcole(e); return el('div', {}, [compteDe(u), u ? el('div', { class: 'muet petit', text: u.identifiant }) : null]); } },
        { titre: '', valeur: e => actionsCompte(compteEcole(e), () => unSeul(itemEcole(e), 'Compte de l’école créé'), e.nom) }
      ], lignes, { messageVide: 'Aucune école ne correspond.' }));
    }

    /* =====================================================================
       Onglet Enseignants
       ===================================================================== */

    const compteAgent = p => D.users.filter(u => u.personnel_id === p.id)[0] || null;
    function itemAgent(p) {
      const ecole = D.ie[p.ecole_id] || {};
      const initiale = sa((p.prenoms || '').trim().charAt(0));
      return {
        nom: nomComplet(p.nom, p.prenoms), ecole: ecole.nom || '',
        champs: {
          identifiant: S().slug((initiale ? initiale + '.' : '') + p.nom) || 'enseignant',
          nom: p.nom, prenoms: p.prenoms || '', role: p.fonction === 'DIRECTEUR' ? 'DIRECTEUR' : 'ENSEIGNANT',
          ecole_id: p.ecole_id, personnel_id: p.id, telephone: p.telephone || '', email: p.email || ''
        }
      };
    }

    function ongletEnseignants() {
      zone.appendChild(filtres({ placeholder: 'Rechercher un enseignant', ecoles: true, relancer: dessiner }));
      const q = sa(F.q);
      const dansFiltre = D.personnels.filter(p => idEcoleOk(p.ecole_id));
      const liste = dansFiltre.filter(p => (!q || sa(nomComplet(p.nom, p.prenoms)).indexOf(q) >= 0 || sa(p.matricule || '').indexOf(q) >= 0)
        && filtreCompte(compteAgent(p)))
        .sort((a, b) => nomComplet(a.nom, a.prenoms).localeCompare(nomComplet(b.nom, b.prenoms), 'fr'));
      const sans = dansFiltre.filter(p => !compteAgent(p));

      zone.appendChild(el('div', { class: 'grille grille-stats' }, [
        U.stat(U.nombre(dansFiltre.length), 'Enseignants'),
        U.stat(U.nombre(dansFiltre.length - sans.length), 'Avec un compte'),
        U.stat(U.nombre(sans.length), 'Sans compte', sans.length ? 'attention' : '')
      ]));
      zone.appendChild(el('div', { class: 'barre-actions' }, [
        el('button', {
          class: 'btn btn-primaire', text: 'Créer les comptes manquants (' + U.nombre(sans.length) + ')', disabled: !sans.length,
          onclick: () => enLot('Créer les comptes des enseignants', sans.map(itemAgent))
        }),
        el('button', {
          class: 'btn btn-fantome', text: 'Nouvel enseignant',
          onclick: () => E.editer('personnels', null, rafraichir)
        })
      ]));
      if (!D.personnels.length) {
        zone.appendChild(U.vide('Aucun enseignant enregistré dans votre périmètre. Ajoutez-les avec « Nouvel enseignant » ou depuis le module Personnel.'));
        return;
      }
      paginer(zone, liste, lignes => U.tableau([
        { titre: 'Enseignant', valeur: p => el('div', {}, [el('strong', { text: nomComplet(p.nom, p.prenoms) }), el('br'), el('span', { class: 'muet petit', text: p.matricule || '' })]) },
        { titre: 'École', valeur: p => (D.ie[p.ecole_id] || {}).nom || '—' },
        { titre: 'Fonction', valeur: p => U.libelle(p.fonction || 'ENSEIGNANT') },
        { titre: 'Compte', valeur: p => { const u = compteAgent(p); return el('div', {}, [compteDe(u), u ? el('div', { class: 'muet petit', text: u.identifiant }) : null]); } },
        { titre: '', valeur: p => actionsCompte(compteAgent(p), () => unSeul(itemAgent(p), 'Compte d’enseignant créé'), nomComplet(p.nom, p.prenoms)) }
      ], lignes, { messageVide: 'Aucun enseignant ne correspond.' }));
    }

    /* =====================================================================
       Onglet Élèves
       ===================================================================== */

    const compteEleve = id => D.users.filter(u => u.role === 'ELEVE' && u.eleve_id === id)[0] || null;
    function itemEleve(i) {
      const e = D.eleves[i.eleve_id] || {};
      const ecole = D.ie[i.ecole_id] || {};
      const matricule = chiffres(e.matricule_ecole);
      return {
        nom: nomComplet(e.nom, e.prenoms), ecole: ecole.nom || '',
        champs: {
          identifiant: matricule.length >= 6 ? 'e' + matricule
            : 'eleve.' + S().slug((e.prenoms || '').split(' ')[0]) + '.' + S().slug(e.nom),
          nom: e.nom || '', prenoms: e.prenoms || '', role: 'ELEVE', ecole_id: i.ecole_id, eleve_id: i.eleve_id
        }
      };
    }

    function ongletEleves() {
      zone.appendChild(filtres({ placeholder: 'Rechercher un élève', ecoles: true, classes: true, relancer: dessiner }));
      const q = sa(F.q);
      const dansFiltre = D.ins.filter(i => idEcoleOk(i.ecole_id) && (!F.classe || i.classe_id === F.classe) && D.eleves[i.eleve_id]);
      const nomI = i => nomComplet(D.eleves[i.eleve_id].nom, D.eleves[i.eleve_id].prenoms);
      const liste = dansFiltre.filter(i => (!q || sa(nomI(i)).indexOf(q) >= 0) && filtreCompte(compteEleve(i.eleve_id)))
        .sort((a, b) => nomI(a).localeCompare(nomI(b), 'fr'));
      const sans = dansFiltre.filter(i => !compteEleve(i.eleve_id));

      zone.appendChild(el('div', { class: 'grille grille-stats' }, [
        U.stat(U.nombre(dansFiltre.length), 'Élèves inscrits'),
        U.stat(U.nombre(dansFiltre.length - sans.length), 'Avec un compte'),
        U.stat(U.nombre(sans.length), 'Sans compte', sans.length ? 'attention' : '')
      ]));
      zone.appendChild(el('div', { class: 'barre-actions' }, [
        el('button', {
          class: 'btn btn-primaire', text: 'Créer les comptes manquants (' + U.nombre(sans.length) + ')', disabled: !sans.length,
          onclick: () => enLot('Créer les comptes des élèves', sans.map(itemEleve))
        }),
        el('span', { class: 'muet petit', text: F.classe ? 'Limité à la classe choisie.' : 'Astuce : choisissez une classe pour ne créer que les comptes de cette classe.' })
      ]));
      if (!D.ins.length) { zone.appendChild(U.vide('Aucun élève inscrit cette année dans votre périmètre.')); return; }
      paginer(zone, liste, lignes => U.tableau([
        { titre: 'Élève', valeur: i => nomI(i) },
        { titre: 'Classe', valeur: i => (D.ic[i.classe_id] ? (D.ic[i.classe_id].libelle || D.ic[i.classe_id].code) : i.niveau) },
        { titre: 'École', valeur: i => (D.ie[i.ecole_id] || {}).nom || '—' },
        { titre: 'Compte', valeur: i => { const u = compteEleve(i.eleve_id); return el('div', {}, [compteDe(u), u ? el('div', { class: 'muet petit', text: u.identifiant }) : null]); } },
        { titre: '', valeur: i => actionsCompte(compteEleve(i.eleve_id), () => unSeul(itemEleve(i), 'Compte d’élève créé'), nomI(i)) }
      ], lignes, { messageVide: 'Aucun élève ne correspond.' }));
    }

    /* =====================================================================
       Onglet Parents
       ===================================================================== */

    function enfantsDe(p) {
      return D.liens.filter(l => l.parent_id === p.id && l.statut !== 'REFUSE' && l.statut !== 'REVOQUE')
        .map(l => D.eleves[l.eleve_id]).filter(Boolean);
    }
    function parentsVisibles() {
      /* Un parent est visible s'il a un enfant inscrit dans le périmètre, ou s'il n'a pas encore d'enfant rattaché. */
      const inscrits = {};
      D.ins.forEach(i => { if (idEcoleOk(i.ecole_id)) inscrits[i.eleve_id] = true; });
      const avecLiens = {};
      D.liens.forEach(l => { avecLiens[l.parent_id] = true; });
      return D.parents.filter(p => p.actif !== false && (!avecLiens[p.id]
        || D.liens.some(l => l.parent_id === p.id && inscrits[l.eleve_id])));
    }
    const compteParent = p => (p.user_id && D.iu[p.user_id]) || null;

    function itemParent(p) {
      const tel = chiffres(p.telephone);
      return {
        nom: nomComplet(p.nom, p.prenoms),
        champs: {
          identifiant: tel.length >= 6 ? 'p' + tel.slice(-8) : 'parent.' + S().slug(p.nom),
          nom: p.nom, prenoms: p.prenoms || '', role: 'PARENT', telephone: p.telephone || '', email: p.email || ''
        },
        apres: user => DB.put('profils_parents', Object.assign({}, p, { user_id: user.id }))
      };
    }

    /** Choix d'élèves par recherche : rend { noeud, lire() → [eleve_id] }. */
    function selecteurEleves(preselection) {
      const choisis = {}; (preselection || []).forEach(id => { choisis[id] = true; });
      const champ = el('input', { type: 'search', placeholder: 'Nom ou matricule de l’élève', 'aria-label': 'Rechercher un élève' });
      const resultats = el('div', { class: 'liste-choix' });
      const puces = el('div', { class: 'puces' });
      const candidats = D.ins.filter(i => D.eleves[i.eleve_id] && (!EG.session.ecole_id || i.ecole_id === EG.session.ecole_id));

      function majPuces() {
        puces.textContent = '';
        Object.keys(choisis).forEach(id => {
          const e = D.eleves[id]; if (!e) return;
          puces.appendChild(el('span', { class: 'puce' }, [
            document.createTextNode(nomComplet(e.nom, e.prenoms) + ' '),
            el('button', { type: 'button', 'aria-label': 'Retirer', text: '✕', onclick: () => { delete choisis[id]; majPuces(); } })
          ]));
        });
        if (!puces.children.length) puces.appendChild(el('span', { class: 'muet petit', text: 'Aucun élève choisi.' }));
      }
      function chercher() {
        resultats.textContent = '';
        const q = sa(champ.value);
        if (q.length < 2) return;
        candidats.filter(i => { const e = D.eleves[i.eleve_id]; return !choisis[i.eleve_id]
          && (sa(nomComplet(e.nom, e.prenoms)).indexOf(q) >= 0 || sa(e.matricule_ecole || '').indexOf(q) >= 0); })
          .slice(0, 8).forEach(i => {
            const e = D.eleves[i.eleve_id];
            resultats.appendChild(el('button', {
              type: 'button', class: 'choix', onclick: () => { choisis[i.eleve_id] = true; champ.value = ''; resultats.textContent = ''; majPuces(); }
            }, [el('strong', { text: nomComplet(e.nom, e.prenoms) }),
              el('span', { class: 'muet petit', text: ' — ' + ((D.ic[i.classe_id] || {}).libelle || i.niveau) + ' • ' + ((D.ie[i.ecole_id] || {}).nom || '') })]));
          });
        if (!resultats.children.length) resultats.appendChild(el('p', { class: 'muet petit', text: 'Aucun élève inscrit ne correspond.' }));
      }
      champ.addEventListener('input', chercher);
      majPuces();
      return { noeud: el('div', { class: 'champ' }, [el('label', { text: 'Enfant(s) inscrit(s) dans l’école' }), champ, resultats, puces]), lire: () => Object.keys(choisis) };
    }

    function ajouterEnfants(p, ids, relation) {
      const deja = {}; D.liens.filter(l => l.parent_id === p.id).forEach(l => { deja[l.eleve_id] = l; });
      const taches = ids.filter(id => !deja[id] || deja[id].statut === 'REFUSE' || deja[id].statut === 'REVOQUE').map(id => DB.put('liens_parent_enfant',
        Object.assign({}, deja[id] || {}, { parent_id: p.id, eleve_id: id, relation: relation || 'RESPONSABLE', statut: 'VALIDE', methode_validation: 'CREATION_ECOLE' })));
      return Promise.all(taches);
    }

    function formulaireParent(existant) {
      const nom = el('input', { type: 'text', value: existant ? existant.nom : '' });
      const prenoms = el('input', { type: 'text', value: existant ? existant.prenoms || '' : '' });
      const tel = el('input', { type: 'tel', value: existant ? existant.telephone || '' : '', placeholder: '+229 97 00 00 00' });
      const relation = el('select', {}, ['PERE', 'MERE', 'TUTEUR', 'RESPONSABLE'].map(r => el('option', { value: r, text: U.libelle(r) })));
      const enfants = selecteurEleves(existant ? enfantsDe(existant).map(e => e.id) : []);
      const erreur = el('div', { class: 'erreurs' });
      U.modal(existant ? 'Rattacher des enfants' : 'Nouveau parent', el('div', { class: 'formulaire' }, [
        erreur,
        existant ? null : el('div', { class: 'champ' }, [el('label', { text: 'Nom *' }), nom]),
        existant ? null : el('div', { class: 'champ' }, [el('label', { text: 'Prénoms' }), prenoms]),
        existant ? null : el('div', { class: 'champ' }, [el('label', { text: 'Téléphone *' }), tel]),
        el('div', { class: 'champ' }, [el('label', { text: 'Lien avec l’enfant' }), relation]),
        enfants.noeud,
        el('p', { class: 'muet petit', text: 'Le rattachement est validé d’emblée puisqu’il est fait par l’école. Le parent ne verra que ses propres enfants.' })
      ]), fermer => [
        el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
        el('button', {
          class: 'btn btn-primaire', text: existant ? 'Rattacher' : 'Créer le parent', onclick: () => {
            erreur.textContent = '';
            const ids = enfants.lire();
            if (!existant) {
              if (!nom.value.trim()) { erreur.appendChild(el('p', { text: 'Le nom est obligatoire.' })); return; }
              if (chiffres(tel.value).length < 8) { erreur.appendChild(el('p', { text: 'Saisissez un numéro de téléphone valide.' })); return; }
              if (D.parents.some(p => chiffres(p.telephone).slice(-8) === chiffres(tel.value).slice(-8))) {
                erreur.appendChild(el('p', { text: 'Un parent porte déjà ce numéro : ouvrez sa ligne et rattachez-lui l’enfant.' })); return;
              }
            }
            if (!ids.length) { erreur.appendChild(el('p', { text: 'Choisissez au moins un enfant.' })); return; }
            fermer();
            if (existant) {
              ajouterEnfants(existant, ids, relation.value).then(() => { U.toast('Enfant(s) rattaché(s)'); EG.majSynchro(); rafraichir(); });
              return;
            }
            DB.put('profils_parents', { nom: nom.value.trim(), prenoms: prenoms.value.trim(), telephone: tel.value.trim(), telephone_verifie: false, actif: true })
              .then(p => ajouterEnfants(p, ids, relation.value).then(() => p))
              .then(p => { D.parents.push(p); unSeul(itemParent(p), 'Compte de parent créé'); });
          }
        })
      ]);
    }

    function ongletParents() {
      zone.appendChild(filtres({ placeholder: 'Rechercher un parent ou un numéro', ecoles: true, relancer: dessiner }));
      const q = sa(F.q);
      const tous = parentsVisibles();
      const enfantsFiltre = p => {
        const es = enfantsDe(p);
        return !es.length || es.some(e => D.ins.some(i => i.eleve_id === e.id && idEcoleOk(i.ecole_id)));
      };
      const dansFiltre = tous.filter(enfantsFiltre);
      const liste = dansFiltre.filter(p => (!q || sa(nomComplet(p.nom, p.prenoms)).indexOf(q) >= 0 || chiffres(p.telephone).indexOf(chiffres(F.q) || '\u0000') >= 0)
        && filtreCompte(compteParent(p)))
        .sort((a, b) => nomComplet(a.nom, a.prenoms).localeCompare(nomComplet(b.nom, b.prenoms), 'fr'));
      const sans = dansFiltre.filter(p => !compteParent(p));

      zone.appendChild(el('div', { class: 'grille grille-stats' }, [
        U.stat(U.nombre(dansFiltre.length), 'Parents'),
        U.stat(U.nombre(dansFiltre.length - sans.length), 'Avec un compte'),
        U.stat(U.nombre(sans.length), 'Sans compte', sans.length ? 'attention' : '')
      ]));
      zone.appendChild(el('div', { class: 'barre-actions' }, [
        el('button', { class: 'btn btn-primaire', text: 'Nouveau parent', onclick: () => formulaireParent(null) }),
        el('button', {
          class: 'btn btn-fantome', text: 'Créer les comptes manquants (' + U.nombre(sans.length) + ')', disabled: !sans.length,
          onclick: () => enLot('Créer les comptes des parents', sans.map(itemParent))
        })
      ]));
      if (!tous.length) {
        zone.appendChild(U.vide('Aucun parent enregistré. Utilisez « Nouveau parent » : le compte est créé en même temps que le rattachement à son enfant.'));
        return;
      }
      paginer(zone, liste, lignes => U.tableau([
        { titre: 'Parent', valeur: p => el('div', {}, [el('strong', { text: nomComplet(p.nom, p.prenoms) }), el('br'), el('span', { class: 'muet petit', text: p.telephone || '' })]) },
        { titre: 'Enfants', valeur: p => { const es = enfantsDe(p); return es.length ? es.map(e => nomComplet(e.nom, e.prenoms)).join(', ') : el('span', { class: 'muet', text: 'Aucun enfant rattaché' }); } },
        { titre: 'Compte', valeur: p => { const u = compteParent(p); return el('div', {}, [compteDe(u), u ? el('div', { class: 'muet petit', text: u.identifiant }) : null]); } },
        {
          titre: '', valeur: p => el('div', { class: 'actions-mini' }, [
            actionsCompte(compteParent(p), () => unSeul(itemParent(p), 'Compte de parent créé'), nomComplet(p.nom, p.prenoms)),
            el('button', { class: 'btn btn-petit btn-fantome', text: '+ Enfant', onclick: () => formulaireParent(p) })
          ])
        }
      ], lignes, { messageVide: 'Aucun parent ne correspond.' }));
    }

    /* -------- dispatch -------- */

    function dessiner() {
      zone.textContent = '';
      if (!D) return;
      if (actif === 'ecoles') ongletEcoles();
      else if (actif === 'enseignants') ongletEnseignants();
      else if (actif === 'eleves') ongletEleves();
      else ongletParents();
    }

    dessinerOnglets();
    zone.appendChild(el('p', { class: 'muet', text: 'Chargement…' }));
    charger().then(dessiner);
  });

  EG.Comptes = { creerCompte, reinitialiser, remettre };
})(window);
