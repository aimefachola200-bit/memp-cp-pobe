/* ÉduGestion Pro Master — deux modules détachés, accessibles directement depuis chaque école :

   1. la carte d'identité de l'école (identification, localisation, direction,
      effectifs), à consulter, imprimer, exporter ;
   2. la fiche d'inscription au CEP : les candidats de CM2 de l'école, leurs fiches
      à renseigner, à éditer une par une ou toutes ensemble, ou à imprimer vierges.

   Un directeur y trouve son école ; une circonscription, une direction
   départementale ou l'administration choisissent l'école dans leur périmètre. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const S = () => EG.Sortie;
  const ech = s => EG.Docs.echapper(s);
  const pl = (n, mot) => U.nombre(n) + ' ' + mot + (n > 1 ? 's' : '');
  const SEL = () => E.selecteurEcole;

  const ROLES_EDITION = ['ADMIN_MEMP', 'ADMIN_TECHNIQUE', 'DDEMP', 'CS', 'DIRECTEUR'];
  const peutEditer = () => ROLES_EDITION.indexOf(EG.session.user.role) >= 0 && EG.peutEcrire();
  const val = v => (v === null || v === undefined || v === '' ? '—' : String(v));

  /** Barre d'école commune : prépare la liste, dessine le sélecteur, puis appelle `dessiner`. */
  function avecEcole(racine, etat, dessiner) {
    const zoneEcole = el('div'), zone = el('div');
    racine.appendChild(zoneEcole); racine.appendChild(zone);
    const redessiner = rebarre => {
      if (rebarre) SEL().barreEcole(zoneEcole, etat, redessiner, false);
      etat.ecole = etat.liste.filter(e => e.id === etat.ecole_id)[0] || null;
      zone.textContent = '';
      if (!etat.liste.length) { zone.appendChild(U.vide('Aucune école dans votre périmètre.')); return; }
      if (!etat.ecole) { zone.appendChild(U.vide('Choisissez une école ci-dessus.')); return; }
      dessiner(zone, etat.ecole, () => redessiner(false));
    };
    SEL().preparerEcoles(etat).then(() => { SEL().barreEcole(zoneEcole, etat, redessiner, false); redessiner(false); });
  }

  /* =======================================================================
     CARTE D'IDENTITÉ DE L'ÉCOLE
     ======================================================================= */

  Routeur.definir('carte-ecole', function (racine, args) {
    if (!EG.peutVoirModule('carte-ecole')) { racine.appendChild(U.vide('Ce module n’est pas disponible pour votre compte.')); return; }
    racine.appendChild(E.entete('Carte d’identité de l’école',
      'L’essentiel administratif d’un établissement : identification, localisation, direction et effectifs.'));
    const etat = { ecole_id: (args && args[0]) || '', cs: '' };

    avecEcole(racine, etat, (zone, ec) => {
      const annee = EG.session.annee_id;
      Promise.all([
        DB.all('territoires'),
        DB.where('inscriptions_eleves', { ecole_id: ec.id, annee_scolaire_id: annee, statut: 'ACTIF' }),
        DB.where('classes', { ecole_id: ec.id, annee_scolaire_id: annee }),
        DB.where('personnels', { ecole_id: ec.id }),
        DB.where('statistiques_ecoles', { ecole_id: ec.id })
      ]).then(([terr, ins, classes, agents, stats]) => {
        const it = E.indexer(terr);
        const nomTerr = id => (id && it[id]) ? it[id].nom : '—';
        const lignes = [
          ['Identification', [
            ['Code école', ec.code_ecole], ['Nom', ec.nom], ['Cycle', U.libelle(ec.cycle)],
            ['Type', ec.type_ecole && U.libelle(ec.type_ecole)], ['Statut', ec.statut && U.libelle(ec.statut)],
            ['Région pédagogique n°', ec.region_pedagogique], ['Année de création', ec.annee_creation],
            ['Référence de création', ec.reference_creation], ['Année de dernière extension', ec.annee_extension],
            ['Référence d’extension', ec.reference_extension]]],
          ['Direction et contacts', [
            ['Directeur', ec.directeur_nom], ['Téléphone du directeur', ec.directeur_telephone],
            ['Téléphone de l’école', ec.telephone], ['E-mail', ec.email]]],
          ['Localisation', [
            ['Département', nomTerr(ec.departement_id)], ['Commune', nomTerr(ec.commune_id)],
            ['Arrondissement', nomTerr(ec.arrondissement_id)], ['Village ou quartier de ville', nomTerr(ec.village_quartier_id)],
            ['Circonscription scolaire (CS)', nomTerr(ec.territoire_id)], ['Zone pédagogique', nomTerr(ec.zone_id)],
            ['Unité pédagogique', nomTerr(ec.up_id)], ['Adresse', ec.adresse], ['Boîte postale', ec.bp], ['Ville', ec.ville]]]
        ];
        const effectif = { classes: classes.filter(c => c.actif !== false).length, eleves: ins.length,
          agents: agents.filter(a => a.actif !== false).length };

        zone.appendChild(el('div', { class: 'carte-ecole-tete' }, [
          el('div', {}, [
            el('h2', { text: ec.nom }),
            ec.devise ? el('p', { class: 'devise-ecole', text: '« ' + ec.devise + ' »' }) : null,
            el('p', { class: 'muet', text: [ec.code_ecole, U.libelle(ec.cycle), ec.statut ? U.libelle(ec.statut) : null].filter(Boolean).join(' • ') }),
            ec.actif === false ? U.badge('École inactive', 'neutre') : null
          ]),
          global.LogoEcole ? el('div', { class: 'logo-ecole-carte', html: global.LogoEcole.svgDe(ec, 96) }) : null,
          el('div', { class: 'cachet-apercu', html: EG.Docs.cachet(ec, { taille: 96 }) })
        ]));
        zone.appendChild(el('div', { class: 'grille grille-stats' }, [
          U.stat(U.nombre(effectif.eleves), 'Élèves inscrits'), U.stat(U.nombre(effectif.classes), 'Classes'),
          U.stat(U.nombre(effectif.agents), 'Agents')
        ]));
        /* Statistiques déclarées (jeux de données de la circonscription) : dernière année disponible. */
        const stat = (stats || []).slice().sort((a, b) => String(b.annee_code).localeCompare(String(a.annee_code)))[0];
        if (stat) {
          const t = EG.StatsEcoles ? EG.StatsEcoles.totaux(stat) : { g: 0, f: 0, t: 0, pers: 0 };
          const cours = stat.effectifs ? Object.keys(stat.effectifs) : [];
          zone.appendChild(U.carte('Effectifs et personnel déclarés — ' + stat.annee_code, el('div', {}, [
            el('dl', { class: 'fiche' }, [
              ['Classes autorisées', stat.classes_autorisees], ['Personnel FE', stat.personnel_fe], ['Personnel ACDPE', stat.personnel_acdpe],
              ['Personnel ACDPCTD', stat.personnel_ame], ['Garçons', t.g || null], ['Filles', t.f || null], ['Total élèves', t.t || null]
            ].map(([k, v]) => el('div', { class: 'fiche-ligne' }, [el('dt', { text: k }), el('dd', { text: val(v) })]))),
            cours.length ? el('p', { class: 'muet petit', text: cours.map(c => c + ' : ' + (stat.effectifs[c][0] || 0) + ' G / ' + (stat.effectifs[c][1] || 0) + ' F').join(' · ') }) : null,
            stat.source ? el('p', { class: 'muet petit', text: 'Source : ' + stat.source }) : null
          ])));
        }
        lignes.forEach(([titre, l]) => zone.appendChild(U.carte(titre,
          el('dl', { class: 'fiche' }, l.map(([k, v]) => el('div', { class: 'fiche-ligne' }, [el('dt', { text: k }), el('dd', { text: val(v) })]))))));

        const actions = [];
        if (peutEditer()) actions.push(el('button', { class: 'btn btn-primaire', text: '\uE006 Modifier', onclick: () => E.editer('ecoles', ec, rafraichir_) }));
        /* Logo de l'école (automatique, réglable ou importé) et devise : en tête de ses documents et dans la barre du haut */
        if (peutEditer() && global.LogoEcole) actions.push(el('button', { class: 'btn btn-fantome', text: '\uE047 Logo et devise', 'data-le': 'ouvrir',
          onclick: () => global.LogoEcole.editer({ nom: ec.nom, valeur: ec.logo_cfg, devise: ec.devise, surEnregistrer: (v) =>
            DB.put('ecoles', Object.assign({}, ec, { logo_cfg: v.cfg, logo: v.png || '', devise: v.devise || '' }))
              .then(r => DB.audit('LOGO_ECOLE', 'ecoles', r.id, {})).then(() => { U.toast('Logo et devise enregistrés'); EG.majSynchro(); if (EG.majMarqueEcole) EG.majMarqueEcole(); rafraichir_(); }) }) }));
        actions.push(el('button', { class: 'btn btn-fantome', text: '\uE008 Imprimer', onclick: () => sortie(ec, lignes, effectif, 'imprimer') }));
        actions.push(el('button', { class: 'btn btn-fantome', text: '\uE00D Word', onclick: () => sortie(ec, lignes, effectif, 'word') }));
        actions.push(el('button', { class: 'btn btn-fantome', text: '\uE00C Excel', onclick: () => S().excel('carte-identite-' + S().slug(ec.nom).slice(0, 30),
          [{ nom: 'Carte d’identité', lignes: [['Rubrique', 'Donnée', 'Valeur']].concat(lignes.reduce((s, [t, l]) => s.concat(l.map(([k, v]) => [t, k, v === null || v === undefined ? '' : v])), [])) }]) }));
        if (EG.peutVoirModule('fiche-cep')) actions.push(el('button', { class: 'btn btn-fantome', text: '\uE020 Fiche d’inscription au CEP', onclick: () => Routeur.aller('fiche-cep/' + ec.id) }));
        if (EG.peutVoirModule('carte-eleve')) actions.push(el('button', { class: 'btn btn-fantome', text: '\uE02B Cartes d’identité des élèves', onclick: () => Routeur.aller('carte-eleve/' + ec.id) }));
        actions.push(el('button', { class: 'btn btn-fantome', text: '\uE006 Cachet de l’école', onclick: () => Routeur.aller('cachet/ecole/' + ec.id) }));
        zone.appendChild(el('div', { class: 'barre-actions' }, actions));

        function rafraichir_() { Routeur.aller('carte-ecole/' + ec.id); }
      });
    });

    function sortie(ec, lignes, effectif, mode) {
      const corps = () => '<h2 style="text-align:center">Carte d’identité de l’école</h2>'
        + '<h3 style="text-align:center">' + ech(ec.nom) + (ec.code_ecole ? ' — ' + ech(ec.code_ecole) : '') + '</h3>'
        + lignes.map(([t, l]) => '<h3>' + ech(t) + '</h3><table><tbody>' + l.map(([k, v]) => '<tr><td style="width:42%"><strong>' + ech(k) + '</strong></td><td>'
          + ech(val(v)) + '</td></tr>').join('') + '</tbody></table>').join('')
        + '<h3>Effectifs de l’année ' + ech(EG.session.annee_code || '') + '</h3><table><tbody><tr><td>Élèves inscrits</td><td>' + effectif.eleves
        + '</td><td>Classes</td><td>' + effectif.classes + '</td><td>Agents</td><td>' + effectif.agents + '</td></tr></tbody></table>'
        + EG.Docs.visaEcole(ec, 'Le directeur');
      if (mode === 'imprimer') S().imprimer('Carte d’identité — ' + ec.nom, corps, { ecole: ec });
      else S().word('carte-identite-' + S().slug(ec.nom).slice(0, 30), 'Carte d’identité — ' + ec.nom, corps, { ecole: ec });
    }
  });

  /* =======================================================================
     FICHE D'INSCRIPTION AU CEP
     ======================================================================= */

  Routeur.definir('fiche-cep', function (racine, args) {
    if (!EG.peutVoirModule('fiche-cep')) { racine.appendChild(U.vide('Ce module n’est pas disponible pour votre compte.')); return; }
    racine.appendChild(E.entete('Fiche d’inscription au CEP',
      'Les candidats de CM2 : compléter la fiche de chacun, éditer toutes les fiches de l’école, ou imprimer une fiche vierge.'));
    const etat = { ecole_id: (args && args[0]) || '', cs: '' };

    avecEcole(racine, etat, (zone, ecole) => {
      Promise.all([
        E.inscriptionsEnrichies({ niveau: 'CM2', statuts: ['ACTIF', 'SORTIE_PRIMAIRE_CEP'] }),
        DB.all('fiches_cep')
      ]).then(([tous, fiches]) => {
        const candidats = tous.filter(i => i.ecole_id === ecole.id || (!i.ecole_id && EG.session.ecole_id === ecole.id));
        const parIns = {}; fiches.forEach(f => { parIns[f.inscription_id] = f; });
        const completes = candidats.filter(i => parIns[i.id] && parIns[i.id].statut === 'COMPLETE').length;

        zone.appendChild(el('div', { class: 'grille grille-stats' }, [
          U.stat(U.nombre(candidats.length), candidats.length > 1 ? 'Candidats de CM2' : 'Candidat de CM2'),
          U.stat(U.nombre(completes), 'Fiches complètes', completes === candidats.length && candidats.length ? 'ok' : ''),
          U.stat(U.nombre(candidats.length - completes), 'À compléter', candidats.length - completes ? 'attention' : '')
        ]));

        const actions = [];
        if (candidats.length) actions.push(el('button', {
          class: 'btn btn-primaire', text: '\uE008 Éditer les ' + candidats.length + ' fiches', onclick: () => EG.editerFichesCEP(null, ecole.id, 'toutes')
        }));
        actions.push(el('button', { class: 'btn btn-fantome', text: '\uE00E Fiche vierge (à remplir à la main)', onclick: () => vierge(ecole) }));
        if (candidats.length) actions.push(el('button', { class: 'btn btn-fantome', text: '\uE00C Liste des candidats (Excel)', onclick: () => exporter(ecole, candidats, parIns) }));
        actions.push(el('button', { class: 'btn btn-fantome', text: '\uE02B Carte d’identité de l’école', onclick: () => Routeur.aller('carte-ecole/' + ecole.id) }));
        zone.appendChild(el('div', { class: 'barre-actions' }, actions));

        if (!candidats.length) {
          zone.appendChild(U.vide('Aucun candidat de CM2 n’est inscrit dans cette école cette année. Les élèves de CM2 apparaissent ici dès leur inscription.'));
          return;
        }
        zone.appendChild(U.tableau([
          { titre: 'Candidat', valeur: i => i._nom },
          { titre: 'Classe', valeur: i => i._classe ? (i._classe.libelle || i._classe.code) : '—' },
          { titre: 'Établissement choisi n° 1', valeur: i => (parIns[i.id] && parIns[i.id].etablissement_1) || '—' },
          { titre: 'État', valeur: i => U.statut(parIns[i.id] ? parIns[i.id].statut : 'BROUILLON') },
          { titre: '', classe: 'col-etroite', valeur: i => el('button', {
            class: 'btn btn-fantome btn-petit', text: 'Compléter / éditer',
            onclick: ev => { ev.stopPropagation(); EG.editerFichesCEP(i.id, ecole.id); }
          }) }
        ], candidats, { onLigne: i => EG.editerFichesCEP(i.id, ecole.id) }));
      });
    });

    function vierge(ecole) {
      S().contexteTerritoire(ecole).then(ct => {
        const ctx = Object.assign({ commune: ecole.commune || '', directeur: ecole.directeur_nom || '', directeurContact: ecole.directeur_telephone || '' }, ct);
        S().imprimer('Fiche d’inscription au CEP — vierge', () => EG.Docs.ficheCEP({}, {}, ecole, EG.session.annee_code, {}, null, ctx, {}),
          { ecole: ecole, enTete: false });
      });
    }

    function exporter(ecole, candidats, parIns) {
      S().excel('candidats-cep-' + S().slug(ecole.nom).slice(0, 30), [{
        nom: 'Candidats CEP',
        lignes: [['N°', 'Nom', 'Prénoms', 'Sexe', 'Date de naissance', 'Classe', 'Session', 'Centre', 'Établissement 1', 'Établissement 2', 'Établissement 3', 'Parent', 'Contact', 'État de la fiche']]
          .concat(candidats.map((i, k) => {
            const e = i._eleve || {}, f = parIns[i.id] || {};
            return [k + 1, (e.nom || '').toUpperCase(), e.prenoms || '', e.sexe || '', e.date_naissance ? U.dateCourte(e.date_naissance) : '',
              i._classe ? (i._classe.libelle || i._classe.code) : '', f.session || '', f.centre || '', f.etablissement_1 || '', f.etablissement_2 || '',
              f.etablissement_3 || '', f.parent_nom || '', f.parent_contact || '', U.libelle(f.statut || 'BROUILLON')];
          }))
      }]);
    }
  });
})(window);
