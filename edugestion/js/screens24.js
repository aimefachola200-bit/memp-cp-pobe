/* ÉduGestion Pro — carte d'identité de l'élève, module à part.

   La carte d'identité scolaire (recto : armoiries, drapeau, photo, identité, classe, code QR, cachet
   de l'école et signatures ; verso : photo et localisation de l'école, consigne en cas de perte)
   s'édite ici directement, école par école : une carte, les cartes cochées, une classe entière, toute
   l'école, ou une planche de cartes vierges à remplir à la main.

   Adresse : carte-eleve/<école>. Un directeur ou un enseignant y trouve son école ; une circonscription,
   une direction départementale ou l'administration choisissent l'école dans leur périmètre. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const sa = U.sansAccent;
  const pl = (n, mot) => U.nombre(n) + ' ' + mot + (n > 1 ? 's' : '');
  const SEL = () => E.selecteurEcole;

  const numeroCarte = ins => 'CS-' + (ins.niveau || 'XX') + '-' + String(ins.id || '').slice(0, 6).toUpperCase();

  /** Département et circonscription de l'école, pour le verso. */
  function contexteVerso(ecole) {
    return DB.all('territoires').then(terr => {
      const it = {}; terr.forEach(t => { it[t.id] = t; });
      const circo = ecole && ecole.territoire_id ? it[ecole.territoire_id] : null;
      let dep = ecole && ecole.departement_id ? it[ecole.departement_id] : (circo ? it[circo.parent_id] : null);
      while (dep && dep.type !== 'DEPARTEMENT' && dep.parent_id) dep = it[dep.parent_id];
      return { circonscription: circo ? String(circo.nom).replace(/^CS\s+/i, '') : '', departement: dep ? dep.nom : '' };
    });
  }

  /** Planche : tous les rectos, saut de page, puis tous les versos dans le même ordre. */
  function planche(liste, ecole, contexte, signataire) {
    const annee = EG.session.annee_code;
    const rectos = liste.map(i => EG.Docs.carteScolaire(i._eleve || {}, i, ecole, annee, numeroCarte(i), signataire)).join('');
    const versos = liste.map(i => EG.Docs.carteScolaireVerso(i._eleve || {}, i, ecole, annee, numeroCarte(i), contexte)).join('');
    return '<div class="planche-cartes">' + rectos + '</div><div class="saut-page"></div><div class="planche-cartes">' + versos + '</div>';
  }

  Routeur.definir('carte-eleve', function (racine, args) {
    if (!EG.peutVoirModule('carte-eleve')) { racine.appendChild(U.vide('Ce module n’est pas disponible pour votre compte.')); return; }
    racine.appendChild(E.entete('Carte d’identité de l’élève',
      'Édite les cartes d’identité scolaire d’une école : une carte, plusieurs, une classe entière ou toute l’école, avec le cachet de l’école. Imprimez sur papier fort, puis découpez.'));
    const etat = { ecole_id: (args && args[0]) || '', cs: '' };
    const zoneEcole = el('div'), zone = el('div');
    racine.appendChild(zoneEcole); racine.appendChild(zone);

    const redessiner = rebarre => {
      if (rebarre) SEL().barreEcole(zoneEcole, etat, redessiner, false);
      etat.ecole = etat.liste.filter(e => e.id === etat.ecole_id)[0] || null;
      zone.textContent = '';
      if (!etat.liste.length) { zone.appendChild(U.vide('Aucune école dans votre périmètre.')); return; }
      if (!etat.ecole) { zone.appendChild(U.vide('Choisissez une école ci-dessus.')); return; }
      dessiner(etat.ecole);
    };
    SEL().preparerEcoles(etat).then(() => { SEL().barreEcole(zoneEcole, etat, redessiner, false); redessiner(false); });

    function dessiner(ecole) {
      Promise.all([
        E.inscriptionsEnrichies({ statuts: ['ACTIF'] }),
        DB.where('classes', { ecole_id: ecole.id, annee_scolaire_id: EG.session.annee_id }),
        contexteVerso(ecole)
      ]).then(([toutes, classes, contexte]) => {
        const inscrits = toutes.filter(i => i.ecole_id === ecole.id || (!i.ecole_id && EG.session.ecole_id === ecole.id));
        const coches = {};
        let classeId = '', recherche = '';
        const zoneListe = el('div');

        zone.appendChild(el('div', { class: 'grille grille-stats' }, [
          U.stat(U.nombre(inscrits.length), inscrits.length > 1 ? 'Élèves inscrits' : 'Élève inscrit', inscrits.length ? 'ok' : ''),
          U.stat(U.nombre(classes.filter(c => c.actif !== false).length), 'Classes'),
          U.stat(EG.session.annee_code || '—', 'Année scolaire')
        ]));

        const sel = el('select', { 'aria-label': 'Classe', onchange: e => { classeId = e.target.value; liste(); } },
          [el('option', { value: '', text: 'Toutes les classes' })].concat(classes.filter(c => c.actif !== false)
            .sort((a, b) => String(a.libelle || a.code).localeCompare(String(b.libelle || b.code), 'fr', { numeric: true }))
            .map(c => el('option', { value: c.id, text: c.libelle || c.code }))));
        const champ = el('input', { type: 'search', placeholder: 'Rechercher un élève', 'aria-label': 'Rechercher un élève', oninput: e => { recherche = sa(e.target.value); liste(); } });
        zone.appendChild(el('div', { class: 'barre-filtres' }, [
          el('label', { class: 'filtre' }, [el('span', { text: 'Classe' }), sel]),
          el('label', { class: 'filtre' }, [el('span', { text: 'Recherche' }), champ])
        ]));
        const barreActions = el('div', { class: 'barre-actions' });
        zone.appendChild(barreActions);
        zone.appendChild(zoneListe);

        const visibles = () => inscrits.filter(i => (!classeId || i.classe_id === classeId) && (!recherche || sa(i._nom).indexOf(recherche) >= 0));
        const choisis = () => inscrits.filter(i => coches[i.id]);

        function editer(liste, titre, classe) {
          if (!liste.length) { U.toast('Aucun élève à éditer', 'attention'); return; }
          const html = planche(liste, ecole, contexte, EG.session.user);
          EG.genererDocument('CARTE_SCOLAIRE', titre, html, { classe_id: classe || null, ecole_id: ecole.id });
        }

        function actions() {
          barreActions.textContent = '';
          const n = choisis().length, v = visibles();
          barreActions.appendChild(el('button', { class: 'btn btn-primaire', text: '\uE02B Éditer ' + (n ? 'les ' + n + ' carte(s) cochée(s)' : 'les ' + v.length + ' carte(s) affichée(s)'), disabled: !(n || v.length),
            onclick: () => editer(n ? choisis() : v, 'Cartes scolaires — ' + ecole.nom, classeId) }));
          barreActions.appendChild(el('button', { class: 'btn btn-fantome', text: 'Tout cocher', onclick: () => { v.forEach(i => { coches[i.id] = true; }); liste(); } }));
          barreActions.appendChild(el('button', { class: 'btn btn-fantome', text: 'Tout décocher', onclick: () => { Object.keys(coches).forEach(k => { delete coches[k]; }); liste(); } }));
          barreActions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE00E Cartes vierges (planche de 8)', onclick: () => vierges() }));
          barreActions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE022 Carte d’identité de l’école', onclick: () => Routeur.aller('carte-ecole/' + ecole.id) }));
          if (EG.peutVoirModule('cachets')) barreActions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE006 Cachet de l’école', onclick: () => Routeur.aller('cachet/ecole/' + ecole.id) }));
        }

        function vierges() {
          const blanc = { id: '', niveau: '', _eleve: {} };
          const annee = EG.session.annee_code;
          const html = '<div class="planche-cartes">' + Array.apply(null, Array(8)).map(() => EG.Docs.carteScolaire({}, blanc, ecole, annee, '…………', EG.session.user)).join('') + '</div>'
            + '<div class="saut-page"></div><div class="planche-cartes">' + Array.apply(null, Array(8)).map(() => EG.Docs.carteScolaireVerso({}, blanc, ecole, annee, '…………', contexte)).join('') + '</div>';
          EG.Sortie.imprimer('Cartes scolaires vierges — ' + ecole.nom, html, { ecole, enTete: false });
        }

        function liste() {
          zoneListe.textContent = '';
          actions();
          const v = visibles();
          if (!inscrits.length) {
            zoneListe.appendChild(U.vide('Aucun élève n’est inscrit dans cette école pour l’année ' + (EG.session.annee_code || '') + '. Les cartes se préparent dès l’inscription des élèves ; vous pouvez déjà imprimer des cartes vierges.'));
            return;
          }
          zoneListe.appendChild(U.tableau([
            { titre: '', classe: 'col-etroite', valeur: i => el('input', { type: 'checkbox', checked: !!coches[i.id], 'aria-label': 'Choisir ' + i._nom,
              onclick: ev => ev.stopPropagation(), onchange: e => { if (e.target.checked) coches[i.id] = true; else delete coches[i.id]; actions(); } }) },
            { titre: 'Élève', valeur: i => i._nom },
            { titre: 'Sexe', valeur: i => (i._eleve && i._eleve.sexe) || '—' },
            { titre: 'Classe', valeur: i => i._classe ? (i._classe.libelle || i._classe.code) : (i.niveau || '—') },
            { titre: 'N° de carte', valeur: i => numeroCarte(i) },
            { titre: '', classe: 'col-etroite', valeur: i => el('button', { class: 'btn btn-fantome btn-petit', text: '\uE02B Carte',
              onclick: ev => { ev.stopPropagation(); editer([i], 'Carte scolaire — ' + i._nom, i.classe_id); } }) }
          ], v, { messageVide: 'Aucun élève ne correspond.' }));
        }
        liste();
      });
    }
  });
})(window);
