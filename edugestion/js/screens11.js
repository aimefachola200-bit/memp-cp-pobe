/* ÉduGestion Pro — écoles par circonscription scolaire et zone pédagogique.

   L'onglet « Écoles » : on part du département, on choisit une circonscription,
   on voit ses zones pédagogiques et, dans chaque zone, ses écoles. On peut y
   ajouter, modifier ou supprimer une école, et gérer les zones de chaque
   circonscription (ajout, renommage, suppression).

   Le périmètre suit le compte : l'administration voit tout le pays, la direction
   départementale son département, la circonscription la sienne, le conseiller
   pédagogique sa zone (en lecture seule). */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const indexer = E.indexer, entete = E.entete;

  /* Qui peut modifier la carte des écoles ; le conseiller pédagogique consulte. */
  const ROLES_GESTION = ['ADMIN_MEMP', 'ADMIN_TECHNIQUE', 'DDEMP', 'CS'];
  const ROLES_ACCES = ROLES_GESTION.concat(['CONSEILLER_PEDAGOGIQUE']);
  const SANS_ZONE = '__aucune__';
  const SANS_DEPARTEMENT = '__aucun__';

  const sa = U.sansAccent;
  const tri = (a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr', { numeric: true });
  const pl = (n, mot) => U.nombre(n) + ' ' + mot + (n > 1 ? 's' : '');

  /* ---------------- Hiérarchie et périmètre ---------------- */

  /** Remonte la chaîne des parents jusqu'au premier territoire du type demandé. */
  function ancetre(index, id, type) {
    let cur = id ? index[id] : null, sauts = 0;
    while (cur && sauts++ < 10) {
      if (cur.type === type) return cur;
      cur = cur.parent_id ? index[cur.parent_id] : null;
    }
    return null;
  }

  function departementDe(ecole, index) {
    if (ecole.departement_id) return ecole.departement_id;
    const d = ancetre(index, ecole.territoire_id, 'DEPARTEMENT');
    return d ? d.id : null;
  }

  /**
   * Ce que le compte a le droit de voir : { dep, cs, zone } (identifiants figés,
   * ou null quand le niveau est libre), ou { bloque } quand un rôle
   * territorial n'a aucun territoire rattaché.
   */
  function portee(user, index) {
    const p = { dep: null, cs: null, zone: null, bloque: false, libelle: '' };
    if (user.role === 'ADMIN_MEMP' || user.role === 'ADMIN_TECHNIQUE') return p;
    const t = user.territoire_id ? index[user.territoire_id] : null;
    if (!t || t.type === 'NATIONAL') { p.bloque = true; return p; }
    const dep = ancetre(index, t.id, 'DEPARTEMENT');
    const cs = ancetre(index, t.id, 'CIRCONSCRIPTION');
    if (t.type === 'ZONE_PEDAGOGIQUE') { p.zone = t.id; p.cs = cs ? cs.id : null; }
    else if (t.type === 'CIRCONSCRIPTION') p.cs = t.id;
    p.dep = dep ? dep.id : null;
    if (!p.dep && !p.cs && !p.zone) p.bloque = true;
    p.libelle = t.nom;
    return p;
  }

  function dansPortee(ecole, p, index) {
    if (p.bloque) return false;
    if (p.zone) return ecole.zone_id === p.zone;
    if (p.cs) return ecole.territoire_id === p.cs;
    if (p.dep) return departementDe(ecole, index) === p.dep;
    return true;
  }

  /** Les écoles que le compte connecté a le droit de voir — utilisé aussi par l'annuaire. */
  EG.ecolesDuPerimetre = function (ecoles, territoires) {
    if (EG.session.ecole_id) return ecoles.filter(e => e.id === EG.session.ecole_id);
    const index = indexer(territoires);
    const p = portee(EG.session.user, index);
    return ecoles.filter(e => dansPortee(e, p, index));
  };

  EG.Perimetre = { portee, dansPortee, ancetre, departementDe };

  /* ---------------- Écran ---------------- */

  Routeur.definir('gestion-ecoles', function (racine, args, params) {
    const user = EG.session.user;
    racine.appendChild(entete('Écoles par circonscription',
      'Les écoles de chaque circonscription scolaire et zone pédagogique : ajout, modification, suppression.',
      ROLES_GESTION.indexOf(user.role) >= 0 && EG.peutEcrire() ? [
        el('button', { class: 'btn btn-primaire', text: '\uE00B Importer les écoles d’une circonscription', onclick: () => Routeur.aller('import-ecoles') }),
        EG.peutVoirModule('import-export') ? el('button', { class: 'btn btn-fantome', text: '\uE011 Jeux de données (Plateau)', onclick: () => Routeur.aller('import-export/jeux' + (params && params.cs ? '?cs=' + params.cs : '')) }) : null
      ] : null));

    if (ROLES_ACCES.indexOf(user.role) < 0) {
      racine.appendChild(U.vide('Cet écran est réservé à l’administration, aux directions départementales, '
        + 'aux circonscriptions scolaires et aux conseillers pédagogiques.'));
      return;
    }
    const gerer = ROLES_GESTION.indexOf(user.role) >= 0 && EG.peutEcrire();

    const zoneFiltres = el('div', { class: 'barre-filtres' });
    const zoneResume = el('div');
    const zoneListe = el('div');
    racine.appendChild(zoneFiltres); racine.appendChild(zoneResume); racine.appendChild(zoneListe);

    const f = { dep: '', cs: '', zone: '', q: '' };
    const ouverts = {}; /* circonscriptions dépliées : conservées d'un rafraîchissement à l'autre */
    let D = null; /* { terr, index, ecoles, p } */
    let preselection = (params && params.cs) || ''; /* circonscription demandée par l'adresse (espace de la circonscription) */

    /* -------- chargement -------- */

    function recharger() {
      return Promise.all([DB.all('territoires'), DB.all('ecoles')]).then(([terr, ecoles]) => {
        const index = indexer(terr);
        D = { terr, index, ecoles, p: portee(user, index) };
        if (D.p.dep) f.dep = D.p.dep;
        if (D.p.cs) f.cs = D.p.cs;
        if (D.p.zone) f.zone = D.p.zone;
        if (preselection && index[preselection] && index[preselection].type === 'CIRCONSCRIPTION') {
          f.cs = preselection; f.dep = (ancetre(index, preselection, 'DEPARTEMENT') || {}).id || f.dep; ouverts[preselection] = true;
        }
        preselection = '';
        if (f.dep && f.dep !== SANS_DEPARTEMENT && !index[f.dep]) f.dep = '';
        if (f.cs && !index[f.cs]) f.cs = '';
        if (f.zone && f.zone !== SANS_ZONE && !index[f.zone]) f.zone = '';
        dessinerFiltres();
        dessinerListe();
      });
    }

    const departements = () => D.terr.filter(t => t.type === 'DEPARTEMENT').sort(tri);
    const circonscriptionsDe = depId => D.terr
      .filter(t => t.type === 'CIRCONSCRIPTION' && (ancetre(D.index, t.id, 'DEPARTEMENT') || {}).id === depId).sort(tri);
    const zonesDe = csId => D.terr.filter(t => t.type === 'ZONE_PEDAGOGIQUE' && t.parent_id === csId).sort(tri);
    const visibles = () => D.ecoles.filter(e => dansPortee(e, D.p, D.index));

    /* -------- filtres -------- */

    function dessinerFiltres() {
      zoneFiltres.textContent = '';
      if (D.p.bloque) return;

      if (!D.p.dep) {
        const options = departements().map(d => ({ value: d.id, label: d.nom }));
        if (visibles().some(e => !departementDe(e, D.index))) {
          options.push({ value: SANS_DEPARTEMENT, label: 'Sans département' });
        }
        zoneFiltres.appendChild(U.selecteur('Département', options, f.dep,
          v => { f.dep = v; f.cs = ''; f.zone = ''; dessinerFiltres(); dessinerListe(); },
          { libelleVide: 'Tous les départements' }));
      }
      if (!D.p.cs && f.dep && f.dep !== SANS_DEPARTEMENT) {
        zoneFiltres.appendChild(U.selecteur('Circonscription scolaire',
          circonscriptionsDe(f.dep).map(c => ({ value: c.id, label: c.nom })), f.cs,
          v => { f.cs = v; f.zone = ''; dessinerFiltres(); dessinerListe(); },
          { libelleVide: 'Toutes les circonscriptions' }));
      }
      if (!D.p.zone && f.cs) {
        const options = zonesDe(f.cs).map(z => ({ value: z.id, label: z.nom }));
        options.push({ value: SANS_ZONE, label: 'Écoles sans zone' });
        zoneFiltres.appendChild(U.selecteur('Zone pédagogique', options, f.zone,
          v => { f.zone = v; dessinerListe(); }, { libelleVide: 'Toutes les zones' }));
      }
      zoneFiltres.appendChild(el('label', { class: 'filtre' }, [
        el('span', { text: 'Rechercher une école' }),
        el('input', {
          type: 'search', placeholder: 'Nom, code ou directeur', value: f.q,
          oninput: e => { f.q = e.target.value; dessinerListe(); }
        })
      ]));
      if (D.p.libelle) {
        zoneFiltres.appendChild(el('span', { class: 'badge info', text: 'Votre périmètre : ' + D.p.libelle }));
      }
    }

    /* -------- contenu -------- */

    function dessinerListe() {
      zoneResume.textContent = '';
      zoneListe.textContent = '';
      if (D.p.bloque) {
        zoneListe.appendChild(U.vide('Aucun territoire n’est rattaché à votre compte : demandez à l’administration '
          + 'de renseigner votre département, votre circonscription ou votre zone.'));
        return;
      }
      const q = sa(f.q).trim();
      if (q) return dessinerRecherche(q);
      if (!f.dep) return dessinerDepartements();
      dessinerDepartement();
    }

    function boutonAjout(prefill, libelle) {
      return gerer ? el('button', {
        class: 'btn btn-primaire', text: libelle || '＋ Ajouter une école',
        onclick: () => ajouterEcole(prefill)
      }) : null;
    }

    /** Vue nationale : un carton par département. */
    function dessinerDepartements() {
      const ecoles = visibles();
      const csTous = D.terr.filter(t => t.type === 'CIRCONSCRIPTION');
      const zonesTous = D.terr.filter(t => t.type === 'ZONE_PEDAGOGIQUE');
      zoneResume.appendChild(el('div', { class: 'grille grille-stats' }, [
        U.stat(U.nombre(csTous.length), 'Circonscriptions scolaires'),
        U.stat(U.nombre(zonesTous.length), 'Zones pédagogiques'),
        U.stat(U.nombre(ecoles.length), 'Écoles'),
        U.stat(U.nombre(ecoles.filter(e => !e.zone_id).length), 'Écoles sans zone',
          ecoles.some(e => !e.zone_id) ? 'attention' : '')
      ]));
      const actions = boutonAjout({});
      if (actions) zoneResume.appendChild(el('div', { class: 'barre-actions' }, actions));

      const grille = el('div', { class: 'grille grille-departements' });
      departements().forEach(d => {
        const cs = circonscriptionsDe(d.id);
        const nbZones = cs.reduce((s, c) => s + zonesDe(c.id).length, 0);
        const nbEcoles = ecoles.filter(e => departementDe(e, D.index) === d.id).length;
        grille.appendChild(el('button', {
          class: 'carte carte-lien', onclick: () => { f.dep = d.id; f.cs = ''; f.zone = ''; dessinerFiltres(); dessinerListe(); }
        }, [
          el('h3', { class: 'carte-titre', text: d.nom }),
          el('p', { class: 'muet petit', text: pl(cs.length, 'circonscription') + ' · ' + pl(nbZones, 'zone') }),
          el('p', { class: nbEcoles ? '' : 'muet petit', text: pl(nbEcoles, 'école') })
        ]));
      });
      const sansDep = ecoles.filter(e => !departementDe(e, D.index));
      if (sansDep.length) {
        grille.appendChild(el('button', {
          class: 'carte carte-lien', onclick: () => { f.dep = SANS_DEPARTEMENT; dessinerFiltres(); dessinerListe(); }
        }, [
          el('h3', { class: 'carte-titre', text: 'Sans département' }),
          el('p', { class: 'muet petit', text: 'À rattacher à une circonscription' }),
          el('p', { text: pl(sansDep.length, 'école') })
        ]));
      }
      zoneListe.appendChild(grille);
    }

    /** Un département (ou une circonscription, ou une zone) et ses écoles. */
    function dessinerDepartement() {
      const ecoles = visibles();
      if (f.dep === SANS_DEPARTEMENT) {
        const sans = ecoles.filter(e => !departementDe(e, D.index));
        zoneResume.appendChild(el('div', { class: 'barre-actions' }, [
          el('button', { class: 'btn btn-fantome', text: '← Tous les départements',
            onclick: () => { f.dep = ''; dessinerFiltres(); dessinerListe(); } })
        ]));
        zoneListe.appendChild(blocEcoles('Écoles sans département', sans, 'sans-zone',
          'Ouvrez chaque école (« Modifier ») pour lui choisir son département et sa circonscription.'));
        return;
      }

      const dep = D.index[f.dep];
      const toutesCS = circonscriptionsDe(f.dep);
      let listeCS = f.cs ? toutesCS.filter(c => c.id === f.cs) : toutesCS;
      /* Les chiffres suivent les filtres : département, circonscription, zone. */
      const zonesVues = listeCS.reduce((s, c) => s.concat(zonesDe(c.id)), [])
        .filter(z => !f.zone || f.zone === z.id);
      const dansDep = ecoles.filter(e => departementDe(e, D.index) === f.dep)
        .filter(e => !f.cs || e.territoire_id === f.cs)
        .filter(e => !f.zone || (f.zone === SANS_ZONE ? !e.zone_id : e.zone_id === f.zone));
      const nbZones = f.zone === SANS_ZONE ? 0 : zonesVues.length;

      zoneResume.appendChild(el('div', { class: 'grille grille-stats' }, [
        U.stat(U.nombre(listeCS.length), listeCS.length > 1 ? 'Circonscriptions' : 'Circonscription'),
        U.stat(U.nombre(nbZones), nbZones > 1 ? 'Zones pédagogiques' : 'Zone pédagogique'),
        U.stat(U.nombre(dansDep.length), dansDep.length > 1 ? 'Écoles' : 'École'),
        U.stat(U.nombre(dansDep.filter(e => !e.zone_id).length), 'Écoles sans zone',
          dansDep.some(e => !e.zone_id) ? 'attention' : '')
      ]));

      const notice = f.cs ? null : noticeZones(dep, listeCS, nbZones);
      if (notice) zoneResume.appendChild(notice);

      zoneResume.appendChild(el('div', { class: 'barre-actions' }, [
        !D.p.dep ? el('button', { class: 'btn btn-fantome', text: '← Tous les départements',
          onclick: () => { f.dep = ''; f.cs = ''; f.zone = ''; dessinerFiltres(); dessinerListe(); } }) : null,
        boutonAjout({ departement_id: f.dep, territoire_id: f.cs || null, zone_id: f.zone && f.zone !== SANS_ZONE ? f.zone : null })
      ].filter(Boolean)));

      listeCS.forEach(cs => zoneListe.appendChild(carteCS(cs, ecoles, !!f.cs || !!ouverts[cs.id])));

      const orphelines = dansDep.filter(e => !e.territoire_id);
      if (!f.cs && orphelines.length) {
        zoneListe.appendChild(blocEcoles('Écoles sans circonscription', orphelines, 'sans-zone',
          'Ces écoles sont rattachées au département mais à aucune circonscription : modifiez-les pour en choisir une.'));
      }
      if (!listeCS.length) zoneListe.appendChild(U.vide('Aucune circonscription dans ce département.'));
    }

    /** Le document source annonce parfois plus de zones que son détail n'en donne. */
    function noticeZones(dep, listeCS, nbZonesReelles) {
      if (!dep) return null;
      const cle = Object.keys(EG.ZONES_DECLAREES || {}).filter(k => sa(k) === sa(dep.nom))[0];
      if (!cle) return null;
      const declarees = EG.ZONES_DECLAREES[cle];
      const prevues = listeCS.reduce((s, c) => s + (c.nb_zones_prevues || 0), 0);
      if (!(prevues && prevues < declarees && nbZonesReelles < declarees)) return null;
      return el('div', { class: 'carte carte-action' }, [
        el('strong', { text: 'Une zone est à répartir' }),
        el('p', { class: 'muet petit', text: 'Le document source annonce ' + declarees + ' zones pédagogiques pour le '
          + dep.nom + ', mais le détail de ses circonscriptions n’en compte que ' + prevues + '. La zone manquante '
          + 'n’est rattachée à aucune circonscription : ajoutez-la avec « ＋ Zone » dans la circonscription concernée.' })
      ]);
    }

    /* -------- une circonscription -------- */

    function carteCS(cs, ecolesVisibles, ouvert) {
      const zones = zonesDe(cs.id);
      const ecolesCS = ecolesVisibles.filter(e => e.territoire_id === cs.id);
      const d = el('details', { class: 'cs-carte' });
      d.appendChild(el('summary', { class: 'cs-tete' }, [
        el('span', { class: 'cs-titre' }, [
          el('strong', { text: cs.nom }),
          cs.code ? el('span', { class: 'muet petit', text: cs.code }) : null
        ]),
        el('span', { class: 'cs-compte', text: pl(zones.length, 'zone') + ' · ' + pl(ecolesCS.length, 'école') })
      ]));
      let construit = false;
      const remplir = () => {
        if (construit) return;
        construit = true;
        d.appendChild(corpsCS(cs, zones, ecolesCS));
      };
      d.addEventListener('toggle', () => { ouverts[cs.id] = d.open; if (d.open) remplir(); });
      if (ouvert) { d.open = true; remplir(); }
      return d;
    }

    function corpsCS(cs, zones, ecolesCS) {
      const corps = el('div', { class: 'cs-corps' });
      if (cs.arrondissements_couverts) {
        corps.appendChild(el('p', { class: 'muet petit', text: 'Arrondissements couverts : ' + cs.arrondissements_couverts }));
      }
      if (cs.responsable) {
        corps.appendChild(el('p', { class: 'muet petit',
          text: 'Chef de circonscription : ' + cs.responsable + (cs.responsable_telephone ? ' · ' + cs.responsable_telephone : '') }));
      }
      if (gerer) {
        corps.appendChild(el('div', { class: 'barre-actions' }, [
          el('button', { class: 'btn btn-primaire btn-petit', text: '＋ École',
            onclick: () => ajouterEcole({ departement_id: (ancetre(D.index, cs.id, 'DEPARTEMENT') || {}).id, territoire_id: cs.id }) }),
          el('button', { class: 'btn btn-fantome btn-petit', text: '＋ Zone', onclick: () => ajouterZone(cs) }),
          el('button', { class: 'btn btn-fantome btn-petit', text: '\uE025 Unités pédagogiques', onclick: () => Routeur.aller('unites-pedagogiques/' + cs.id) }),
          el('button', { class: 'btn btn-fantome btn-petit', text: 'Modifier la circonscription',
            onclick: () => E.editer('territoires', cs, recharger) })
        ]));
      }

      const idsZones = {};
      zones.forEach(z => { idsZones[z.id] = true; });
      const aMontrer = zones.filter(z => !f.zone || f.zone === z.id);
      aMontrer.forEach(z => corps.appendChild(blocZone(cs, z, ecolesCS.filter(e => e.zone_id === z.id))));

      const sansZone = ecolesCS.filter(e => !idsZones[e.zone_id]);
      if ((!f.zone || f.zone === SANS_ZONE) && sansZone.length) {
        corps.appendChild(blocEcoles('Écoles sans zone pédagogique', sansZone, 'sans-zone',
          'Choisissez leur zone avec « Modifier ».'));
      }
      if (!zones.length) {
        corps.appendChild(el('p', { class: 'muet', text: 'Aucune zone pédagogique pour cette circonscription.' }));
      }
      return corps;
    }

    function blocZone(cs, zone, ecoles) {
      const tete = el('div', { class: 'zone-tete' }, [
        el('div', {}, [
          el('strong', { text: zone.nom }),
          ' ', U.badge(pl(ecoles.length, 'école'), ecoles.length ? 'ok' : 'neutre'),
          zone.responsable ? el('div', { class: 'muet petit', text: 'Responsable : ' + zone.responsable }) : null
        ]),
        gerer ? el('div', { class: 'actions-mini' }, [
          el('button', { class: 'btn btn-fantome btn-petit', text: '＋ École',
            onclick: () => ajouterEcole({ departement_id: (ancetre(D.index, cs.id, 'DEPARTEMENT') || {}).id,
              territoire_id: cs.id, zone_id: zone.id }) }),
          el('button', { class: 'btn btn-fantome btn-petit', text: 'Modifier la zone',
            onclick: () => E.editer('territoires', zone, recharger) }),
          el('button', { class: 'btn btn-fantome btn-petit btn-alerte', text: 'Supprimer la zone',
            onclick: () => supprimerZone(zone) })
        ]) : null
      ]);
      const bloc = el('div', { class: 'zone-bloc' }, tete);
      if (ecoles.length) ecoles.slice().sort(tri).forEach(e => bloc.appendChild(ligneEcole(e)));
      else bloc.appendChild(el('p', { class: 'muet petit', text: 'Aucune école dans cette zone pour l’instant.' }));
      return bloc;
    }

    function blocEcoles(titre, ecoles, classe, aide) {
      const bloc = el('div', { class: 'zone-bloc ' + (classe || '') }, [
        el('div', { class: 'zone-tete' }, el('div', {}, [
          el('strong', { text: titre }), ' ', U.badge(pl(ecoles.length, 'école'), 'attention'),
          aide ? el('div', { class: 'muet petit', text: aide }) : null
        ]))
      ]);
      ecoles.slice().sort(tri).forEach(e => bloc.appendChild(ligneEcole(e)));
      return el('div', { class: 'carte' }, bloc);
    }

    function ligneEcole(e, avecChemin) {
      const commune = e.commune || (D.index[e.commune_id] || {}).nom;
      const up = e.up_id && D.index[e.up_id] ? D.index[e.up_id].nom : null;
      const infos = [e.code_ecole, U.libelle(e.cycle), commune, up ? 'UP : ' + up : null,
        e.directeur_nom ? 'Directeur : ' + e.directeur_nom : null].filter(Boolean).join(' · ');
      let chemin = null;
      if (avecChemin) {
        const dep = D.index[departementDe(e, D.index)];
        const cs = D.index[e.territoire_id], zone = D.index[e.zone_id];
        chemin = [dep && dep.nom, cs && cs.nom, zone && zone.nom].filter(Boolean).join(' › ') || 'Non rattachée';
      }
      return el('div', { class: 'ecole-ligne' + (e.actif === false ? ' inactive' : '') }, [
        el('div', { class: 'ecole-info' }, [
          el('strong', { text: e.nom }),
          e.actif === false ? ' ' : null,
          e.actif === false ? U.badge('Inactive', 'neutre') : null,
          el('div', { class: 'muet petit', text: infos }),
          chemin ? el('div', { class: 'muet petit', text: chemin }) : null
        ]),
        el('div', { class: 'actions-mini' }, [
          el('button', { class: 'btn btn-fantome btn-petit', text: 'Carte de l’école', onclick: () => Routeur.aller('carte-ecole/' + e.id) }),
          EG.peutVoirModule('carte-eleve') ? el('button', { class: 'btn btn-fantome btn-petit', text: 'Cartes d’élèves', onclick: () => Routeur.aller('carte-eleve/' + e.id) }) : null,
          EG.peutVoirModule('fiche-cep') ? el('button', { class: 'btn btn-fantome btn-petit', text: 'Fiche CEP', onclick: () => Routeur.aller('fiche-cep/' + e.id) }) : null,
          gerer ? el('button', { class: 'btn btn-fantome btn-petit', text: 'Modifier', onclick: () => modifierEcole(e) }) : null,
          gerer ? el('button', { class: 'btn btn-fantome btn-petit btn-alerte', text: 'Supprimer', onclick: () => supprimerEcole(e) }) : null
        ])
      ]);
    }

    /** Recherche : liste à plat, dans le périmètre et les filtres en cours. */
    function dessinerRecherche(q) {
      let ecoles = visibles();
      if (f.dep === SANS_DEPARTEMENT) ecoles = ecoles.filter(e => !departementDe(e, D.index));
      else if (f.dep) ecoles = ecoles.filter(e => departementDe(e, D.index) === f.dep);
      if (f.cs) ecoles = ecoles.filter(e => e.territoire_id === f.cs);
      if (f.zone === SANS_ZONE) ecoles = ecoles.filter(e => !e.zone_id);
      else if (f.zone) ecoles = ecoles.filter(e => e.zone_id === f.zone);
      const trouvees = ecoles.filter(e => sa([e.nom, e.code_ecole, e.directeur_nom, e.commune].join(' ')).indexOf(q) >= 0)
        .sort(tri);
      const bloc = el('div', { class: 'carte' }, [
        el('h3', { class: 'carte-titre', text: pl(trouvees.length, 'école trouvée') })
      ]);
      trouvees.slice(0, 100).forEach(e => bloc.appendChild(ligneEcole(e, true)));
      if (trouvees.length > 100) {
        bloc.appendChild(el('p', { class: 'muet petit', text: 'Les 100 premières sont affichées : précisez la recherche.' }));
      }
      if (!trouvees.length) bloc.appendChild(el('p', { class: 'muet', text: 'Aucune école ne correspond à cette recherche.' }));
      zoneListe.appendChild(bloc);
    }

    /* ---------------- Écoles : ajout, modification, suppression ---------------- */

    function ajouterEcole(prefill) { formulaireEcole(null, prefill || {}); }
    function modifierEcole(ecole) { formulaireEcole(ecole, null); }

    /* La fiche complète compte plus de quatre-vingt-dix rubriques ; ici, l'essentiel
       pour situer l'école. Le reste se complète ensuite (« Enregistrer et compléter »
       ou annuaire des écoles) — rien de ce qui est déjà renseigné n'est perdu. */
    const ESSENTIELS = ['code_ecole', 'nom', 'cycle', 'statut', 'departement_id', 'commune_id',
      'arrondissement_id', 'village_quartier_id', 'territoire_id', 'zone_id', 'up_id',
      'directeur_nom', 'directeur_telephone', 'telephone', 'adresse', 'actif'];

    function formulaireEcole(rec, prefill) {
      const masquer = EG.SCHEMA.ecoles.champs.map(c => c.n).filter(n => ESSENTIELS.indexOf(n) < 0);
      const valeurs = Object.assign({ cycle: 'PRIMAIRE', statut: 'PUBLIQUE', actif: true }, rec || prefill || {});
      /* Le périmètre du compte impose le département et la circonscription. */
      if (!rec) {
        if (D.p.dep) valeurs.departement_id = D.p.dep;
        if (D.p.cs) valeurs.territoire_id = D.p.cs;
        if (D.p.zone) valeurs.zone_id = D.p.zone;
      }
      const form = U.formulaire('ecoles', valeurs, { territoires: D.terr }, { masquer });
      const erreurs = el('div', { class: 'erreurs' });
      let fermerModal = null;

      function enregistrer(completer) {
        const lu = form.lire();
        erreurs.textContent = '';
        const errs = lu.erreurs.slice();
        const v = lu.valeurs;
        const code = String(v.code_ecole || '').trim();
        const nom = String(v.nom || '').trim();
        if (code && D.ecoles.some(x => (!rec || x.id !== rec.id)
          && String(x.code_ecole || '').trim().toLowerCase() === code.toLowerCase())) {
          errs.push('Le code « ' + code + ' » est déjà utilisé par une autre école.');
        }
        if (!v.territoire_id) errs.push('Choisissez la circonscription scolaire de l’école.');
        if (D.p.cs && v.territoire_id && v.territoire_id !== D.p.cs) {
          errs.push('Vous ne gérez que les écoles de votre circonscription (' + D.p.libelle + ').');
        }
        if (D.p.dep && v.departement_id && v.departement_id !== D.p.dep) {
          errs.push('Vous ne gérez que les écoles de votre département.');
        }
        if (D.p.zone && v.zone_id !== D.p.zone) {
          errs.push('Vous ne gérez que les écoles de votre zone pédagogique.');
        }
        if (v.zone_id && v.territoire_id) {
          const z = D.index[v.zone_id];
          if (z && z.parent_id !== v.territoire_id && (ancetre(D.index, z.id, 'CIRCONSCRIPTION') || {}).id !== v.territoire_id) {
            errs.push('La zone choisie n’appartient pas à cette circonscription.');
          }
        }
        if (errs.length) { errs.forEach(m => erreurs.appendChild(el('p', { text: m }))); return; }

        v.code_ecole = code; v.nom = nom;
        DB.put('ecoles', v)
          .then(r => DB.audit(rec ? 'MODIFICATION' : 'CREATION', 'ecoles', r.id)
            .then(() => rec ? null : EG.assurerFichesRecensement())
            .then(() => r))
          .then(r => {
            fermerModal();
            U.toast(rec ? '« ' + r.nom + ' » modifiée' : '« ' + r.nom + ' » ajoutée');
            EG.majSynchro();
            /* On garde la circonscription dépliée pour voir l'école apparaître. */
            if (r.territoire_id) ouverts[r.territoire_id] = true;
            return recharger().then(() => { if (completer) E.editer('ecoles', r, recharger); });
          });
      }

      U.modal(rec ? 'Modifier l’école' : 'Ajouter une école', [erreurs, form], fermer => {
        fermerModal = fermer;
        return [
          el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
          el('button', { class: 'btn btn-fantome', text: 'Enregistrer et compléter la fiche', onclick: () => enregistrer(true) }),
          el('button', { class: 'btn btn-primaire', text: 'Enregistrer', onclick: () => enregistrer(false) })
        ];
      });
    }

    /**
     * Une école qui porte déjà des élèves, des classes, des agents ou des
     * comptes ne s'efface pas : on la désactive. Une école sans rien (celle
     * qu'on vient d'ajouter par erreur) se supprime pour de bon, avec sa
     * fiche de recensement vierge.
     */
    function supprimerEcole(e) {
      Promise.all([
        DB.dependances('ecoles', e.id),
        DB.where('recensements_ecoles', r => r.ecole_id === e.id),
        DB.all('recensement_valeurs')
      ]).then(([deps, fiches, valeurs]) => {
        const vides = fiches.filter(fi => !fi.taux_completion && ['A_COMPLETER', 'BROUILLON'].indexOf(fi.statut) >= 0
          && !valeurs.some(v => v.recensement_id === fi.id));
        const bloquants = deps.map(d => d.table === 'recensements_ecoles'
          ? Object.assign({}, d, { nombre: fiches.length - vides.length }) : d).filter(d => d.nombre > 0);

        if (bloquants.length) {
          U.modal('Suppression impossible', el('div', {}, [
            el('p', { text: '« ' + e.nom + ' » contient des données qui seraient perdues :' }),
            el('ul', {}, bloquants.map(d => el('li', { text: U.nombre(d.nombre) + ' — ' + (EG.SCHEMA[d.table] ? EG.SCHEMA[d.table].label : d.table) }))),
            el('p', { class: 'muet', text: e.actif === false
              ? 'L’école est déjà désactivée : elle n’apparaît plus dans les nouvelles saisies, ses données restent consultables.'
              : 'Désactivez-la plutôt : elle n’apparaîtra plus dans les nouvelles saisies, et son historique reste intact.' })
          ]), fermer => [
            el('button', { class: 'btn btn-fantome', text: 'Fermer', onclick: fermer }),
            e.actif === false ? null : el('button', {
              class: 'btn btn-primaire', text: 'Désactiver l’école',
              onclick: () => {
                fermer();
                DB.put('ecoles', Object.assign({}, e, { actif: false }))
                  .then(r => DB.audit('DESACTIVATION', 'ecoles', r.id))
                  .then(() => { U.toast('« ' + e.nom + ' » désactivée'); EG.majSynchro(); recharger(); });
              }
            })
          ].filter(Boolean));
          return;
        }

        U.confirmer('Supprimer cette école', 'Supprimer définitivement « ' + e.nom + ' » ? '
          + 'Elle ne contient aucune donnée. Cette suppression sera transmise au serveur à la prochaine synchronisation.', () => {
          Promise.all(vides.map(fi => DB.remove('recensements_ecoles', fi.id)))
            .then(() => DB.remove('ecoles', e.id))
            .then(() => DB.audit('SUPPRESSION', 'ecoles', e.id, { nom: e.nom, code: e.code_ecole }))
            .then(() => { U.toast('« ' + e.nom + ' » supprimée'); EG.majSynchro(); recharger(); });
        }, 'Supprimer');
      });
    }

    /* ---------------- Zones pédagogiques ---------------- */

    function ajouterZone(cs) {
      U.saisieRapide('Ajouter une zone pédagogique à ' + cs.nom, 'Nom de la zone', nom => {
        const existantes = zonesDe(cs.id);
        let max = 0;
        existantes.forEach(z => { const m = /-(\d+)$/.exec(z.code || ''); if (m) max = Math.max(max, Number(m[1])); });
        const num = /^CS-(\d+)$/.exec(cs.code || '');
        const rec = { type: 'ZONE_PEDAGOGIQUE', nom, parent_id: cs.id, actif: true };
        if (num) rec.code = 'ZP-' + num[1] + '-' + (max + 1);
        DB.put('territoires', rec)
          .then(r => DB.audit('CREATION', 'territoires', r.id))
          .then(() => { ouverts[cs.id] = true; U.toast('Zone « ' + nom + ' » ajoutée'); EG.majSynchro(); recharger(); });
      });
    }

    function supprimerZone(zone) {
      DB.dependances('territoires', zone.id).then(deps => {
        if (deps.length) {
          U.modal('Suppression impossible', el('div', {}, [
            el('p', { text: 'La zone « ' + zone.nom + ' » est encore utilisée :' }),
            el('ul', {}, deps.map(d => el('li', {
              text: U.nombre(d.nombre) + ' — ' + (d.table === 'territoires' ? 'unités pédagogiques' : EG.SCHEMA[d.table].label)
            }))),
            el('p', { class: 'muet', text: 'Déplacez d’abord ces éléments vers une autre zone (bouton « Modifier » de chaque école), puis supprimez la zone.' })
          ]), fermer => [el('button', { class: 'btn btn-primaire', text: 'Compris', onclick: fermer })]);
          return;
        }
        U.confirmer('Supprimer cette zone', 'Supprimer la zone « ' + zone.nom + ' » ? Elle ne contient aucune école.', () => {
          DB.remove('territoires', zone.id)
            .then(() => DB.audit('SUPPRESSION', 'territoires', zone.id, { nom: zone.nom }))
            .then(() => { U.toast('Zone supprimée'); EG.majSynchro(); recharger(); });
        }, 'Supprimer');
      });
    }

    recharger();
  });
})(window);
