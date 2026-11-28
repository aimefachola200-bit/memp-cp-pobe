/* ÉduGestion Pro Master — annuaire des écoles.
   L'outil de collecte du chef de circonscription : suivi du remplissage école
   par école, import en masse depuis un classeur, export du répertoire complet
   et fiche de collecte à distribuer aux directeurs. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const indexer = E.indexer, editer = E.editer, entete = E.entete;

  const session = () => EG.session;
  const grille = (enfants, classe) => el('div', { class: 'grille ' + (classe || '') }, enfants);

  /* Les rubriques du feuillet officiel, groupées comme sur le formulaire papier. */
  const GROUPES = [
    { nom: 'Identification', champs: ['code_ecole', 'nom', 'cycle', 'type_ecole', 'statut',
      'region_pedagogique', 'annee_creation', 'reference_creation', 'annee_extension',
      'reference_extension', 'directeur_nom', 'directeur_telephone', 'telephone', 'email'] },
    { nom: 'Localisation', champs: ['departement_id', 'commune_id', 'arrondissement_id',
      'village_quartier_id', 'territoire_id', 'zone_id', 'up_id',
      'adresse', 'bp', 'ville', 'latitude', 'longitude'] },
    { nom: 'Accessibilité', champs: ['distance_departement', 'distance_commune',
      'distance_arrondissement', 'distance_cs', 'distance_centre_sante', 'distance_marche',
      'acces_permanent', 'periode_favorable', 'inondable', 'localite_electrifiee',
      'source_electricite', 'source_eau', 'pollution', 'type_pollution'] },
    { nom: 'Domaine et équipements', champs: ['titre_propriete', 'domaine_delimite', 'superficie_ha',
      'cloture', 'cour_ombragee', 'point_eau_potable', 'lavage_mains', 'cantine_fonctionnelle',
      'magasin_vivres', 'jardin_scolaire', 'latrines_fonctionnelles', 'blocs_latrines',
      'cabines_latrines', 'latrines_separees', 'latrines_handi', 'bibliotheque', 'nombre_ouvrages',
      'boite_pharmacie', 'terrain_sport', 'amenagements_handicap'] },
    { nom: 'Structure pédagogique', champs: ['classes_autorisees', 'classes_existantes',
      'salles_existantes', 'salles_utilisees', 'classes_simples', 'classes_jumelees',
      'classes_multigrades'] },
    { nom: 'Langues et instances', champs: ['langue_francais', 'langue_anglais', 'langue_arabe',
      'langue_nationale', 'langue_des_signes', 'precision_langues', 'ape', 'ame',
      'comite_direction', 'conseil_maitres'] }
  ];

  /* Rubriques qui ne se collectent pas : elles se déduisent ou sont techniques. */
  const HORS_COLLECTE = ['id', 'created_at', 'updated_at', 'photo', 'signature_image',
    'cachet_haut', 'cachet_centre', 'cachet_bas', 'cachet_couleur', 'actif',
    /* Recalculées automatiquement depuis les sélecteurs de localisation. */
    'commune', 'arrondissement', 'village_quartier'];

  function champsCollecte() {
    const tous = EG.SCHEMA.ecoles.champs;
    const parCle = {}; tous.forEach(c => { parCle[c.n] = c; });
    const ordonnes = [];
    GROUPES.forEach(g => g.champs.forEach(k => { if (parCle[k]) ordonnes.push(parCle[k]); }));
    /* Ce que les groupes n'ont pas repris reste collecté, en fin de liste. */
    tous.forEach(c => {
      if (HORS_COLLECTE.indexOf(c.n) >= 0) return;
      if (ordonnes.indexOf(c) < 0) ordonnes.push(c);
    });
    return ordonnes;
  }

  /** Corps HTML du formulaire papier de collecte (identification de l'école). */
  function ficheCollecteCorps() {
    const ech = EG.Docs.echapper;
    const parCle = {}; EG.SCHEMA.ecoles.champs.forEach(c => { parCle[c.n] = c; });
    const corps = GROUPES.map(g => {
      const dedans = g.champs.map(k => parCle[k]).filter(Boolean);
      return '<h3>' + ech(g.nom) + '</h3><table class="fiche-collecte"><tbody>'
        + dedans.map(c => '<tr><td>' + ech(c.l) + '</td><th>'
          + (c.t === 'bool' ? '<span class="case-a-cocher"></span> Oui &nbsp; '
            + '<span class="case-a-cocher"></span> Non'
            : (c.o ? ech(c.o.map(o => U.libelle(o)).join(' / '))
              : '<span class="pointilles vide"></span>'))
          + '</th></tr>').join('')
        + '</tbody></table>';
    }).join('');
    return '<h2>Fiche de collecte — identification de l’école</h2>'
      + '<p class="muet">À remplir par le directeur et à retourner à la circonscription. '
      + 'Les rubriques suivies de « Oui / Non » se cochent.</p>'
      + corps;
  }
  EG.ficheCollecteCorps = ficheCollecteCorps;

  function estRenseigne(v) {
    return !(v === null || v === undefined || v === '' || (typeof v === 'number' && isNaN(v)));
  }

  /** Part des rubriques renseignées, groupe par groupe. */
  function completude(ecole, champs) {
    const total = champs.length;
    const remplis = champs.filter(c => estRenseigne(ecole[c.n])).length;
    return { remplis, total, taux: total ? Math.round(remplis / total * 100) : 0 };
  }

  Routeur.definir('annuaire-ecoles', function (racine) {
    racine.appendChild(entete('Annuaire des écoles',
      'La collecte des renseignements de chaque établissement de votre périmètre.'));
    const filtres = el('div', { class: 'barre-filtres' });
    const zone = el('div');
    racine.appendChild(filtres); racine.appendChild(zone);
    let filtreCycle = '', recherche = '';

    filtres.appendChild(U.selecteur('Cycle', [
      { value: '', label: 'Tous les cycles' },
      { value: 'MATERNELLE', label: 'Maternelle' },
      { value: 'PRIMAIRE', label: 'Primaire' },
      { value: 'MIXTE', label: 'Mixte' }
    ], '', v => { filtreCycle = v; dessiner(); }, { vide: false }));
    filtres.appendChild(el('label', { class: 'filtre' }, [
      el('span', { text: 'Rechercher' }),
      el('input', { type: 'search', placeholder: 'Nom ou code',
        oninput: e => { recherche = e.target.value.toLowerCase(); dessiner(); } })
    ]));

    function dessiner() {
      zone.textContent = '';
      const champs = champsCollecte();
      Promise.all([DB.all('ecoles'), DB.all('territoires'),
        DB.where('inscriptions_eleves', { annee_scolaire_id: session().annee_id, statut: 'ACTIF' })
      ]).then(([ecoles, territoires, inscriptions]) => {
        const it = indexer(territoires);

        /* Périmètre : les écoles du département, de la circonscription ou de la
           zone du compte connecté ; celle du directeur pour un directeur. */
        const retenues = EG.ecolesDuPerimetre(ecoles, territoires);

        const effectifs = {};
        inscriptions.forEach(i => { effectifs[i.ecole_id] = (effectifs[i.ecole_id] || 0) + 1; });

        const lignes = retenues
          .filter(e => !filtreCycle || e.cycle === filtreCycle)
          .filter(e => !recherche
            || (e.nom || '').toLowerCase().indexOf(recherche) >= 0
            || (e.code_ecole || '').toLowerCase().indexOf(recherche) >= 0)
          .map(e => Object.assign({ ecole: e, effectif: effectifs[e.id] || 0 }, completude(e, champs)))
          .sort((a, b) => a.taux - b.taux || (a.ecole.nom || '').localeCompare(b.ecole.nom || '', 'fr'));

        const completes = lignes.filter(l => l.taux >= 90).length;
        const moyenne = lignes.length
          ? Math.round(lignes.reduce((s, l) => s + l.taux, 0) / lignes.length) : 0;

        zone.appendChild(grille([
          U.stat(U.nombre(lignes.length), 'Écoles du périmètre'),
          U.stat(U.nombre(completes), 'Fiches complètes', completes < lignes.length ? 'attention' : ''),
          U.stat(moyenne + ' %', 'Remplissage moyen', moyenne < 70 ? 'attention' : ''),
          U.stat(U.nombre(lignes.reduce((s, l) => s + l.effectif, 0)), 'Élèves inscrits')
        ], 'grille-stats'));

        zone.appendChild(el('div', { class: 'barre-actions' }, [
          EG.peutEcrire() ? el('button', {
            class: 'btn btn-primaire', text: 'Ajouter une école',
            onclick: () => editer('ecoles', { cycle: 'PRIMAIRE', actif: true }, dessiner)
          }) : null,
          EG.peutEcrire() ? el('button', {
            class: 'btn btn-fantome', text: 'Importer un classeur', onclick: () => importer(champs, retenues)
          }) : null,
          el('button', {
            class: 'btn btn-fantome', text: 'Modèle de collecte (Excel)',
            onclick: () => modele(champs, retenues)
          }),
          el('button', {
            class: 'btn btn-fantome', text: 'Exporter l’annuaire',
            onclick: () => exporter(champs, lignes.map(l => l.ecole), it)
          }),
          el('button', {
            class: 'btn btn-fantome', text: 'Fiche de collecte à imprimer',
            onclick: () => ficheVierge(champs)
          })
        ].filter(Boolean)));

        if (!lignes.length) {
          zone.appendChild(U.vide('Aucune école dans votre périmètre.',
            EG.peutEcrire() ? el('button', {
              class: 'btn btn-primaire', text: 'Ajouter la première école',
              onclick: () => editer('ecoles', { cycle: 'PRIMAIRE', actif: true }, dessiner)
            }) : null));
          return;
        }

        zone.appendChild(U.carte('Suivi du remplissage', U.tableau([
          { titre: 'Code', valeur: l => l.ecole.code_ecole || '—' },
          { titre: 'École', valeur: l => l.ecole.nom },
          { titre: 'Cycle', valeur: l => U.libelle(l.ecole.cycle) },
          { titre: 'Commune', valeur: l => l.ecole.commune || '—' },
          { titre: 'Directeur', valeur: l => l.ecole.directeur_nom || '—' },
          { titre: 'Élèves', valeur: l => U.nombre(l.effectif) },
          { titre: 'Rubriques', valeur: l => l.remplis + ' / ' + l.total },
          { titre: 'Remplissage', valeur: l => U.badge(l.taux + ' %',
            l.taux >= 90 ? 'ok' : (l.taux >= 60 ? 'attention' : 'danger')) }
        ], lignes, { onLigne: l => detail(l, champs) })));
      });
    }
    dessiner();

    /** Ce qui manque dans une fiche, groupe par groupe. */
    function detail(ligne, champs) {
      const e = ligne.ecole;
      const parCle = {}; EG.SCHEMA.ecoles.champs.forEach(c => { parCle[c.n] = c; });
      const corps = el('div');
      GROUPES.forEach(g => {
        const dedans = g.champs.map(k => parCle[k]).filter(Boolean);
        const manquants = dedans.filter(c => !estRenseigne(e[c.n]));
        corps.appendChild(el('div', { class: 'groupe-collecte' }, [
          el('div', { class: 'ligne-entre' }, [
            el('strong', { text: g.nom }),
            U.badge((dedans.length - manquants.length) + ' / ' + dedans.length,
              manquants.length ? (manquants.length > dedans.length / 2 ? 'danger' : 'attention') : 'ok')
          ]),
          manquants.length
            ? el('p', { class: 'muet petit', text: 'À renseigner : '
              + manquants.map(c => c.l).join(', ') })
            : el('p', { class: 'muet petit', text: 'Complet.' })
        ]));
      });

      U.modal(e.nom, el('div', {}, [
        el('p', { class: 'muet', text: ligne.remplis + ' rubrique(s) renseignée(s) sur '
          + ligne.total + ', soit ' + ligne.taux + ' %.' }),
        corps
      ]), fermer => [
        el('button', { class: 'btn btn-fantome', text: 'Fermer', onclick: fermer }),
        EG.peutEcrire() ? el('button', {
          class: 'btn btn-primaire', text: 'Compléter la fiche',
          onclick: () => { fermer(); editer('ecoles', e, dessiner); }
        }) : null
      ].filter(Boolean));
    }

    /* ---------------- Classeurs ---------------- */

    function enTetes(champs) {
      return ['Code école'].concat(champs.filter(c => c.n !== 'code_ecole').map(c => c.l));
    }

    function valeurBrute(ecole, c, it) {
      const v = ecole[c.n];
      if (v === null || v === undefined) return '';
      if (typeof v === 'boolean') return v ? 'OUI' : 'NON';
      if (c.ref && it && it[v]) return it[v].nom;
      return v;
    }

    /** Un classeur pré-rempli, une ligne par école, à faire compléter. */
    function modele(champs, ecoles) {
      const autres = champs.filter(c => c.n !== 'code_ecole');
      const lignes = [enTetes(champs)];
      ecoles.forEach(e => {
        lignes.push([e.code_ecole || ''].concat(autres.map(c => {
          const v = e[c.n];
          if (typeof v === 'boolean') return v ? 'OUI' : 'NON';
          return (v === null || v === undefined || c.ref) ? '' : v;
        })));
      });
      const legende = [['Rubrique', 'Clé', 'Type', 'Valeurs attendues']].concat(
        champs.map(c => [c.l, c.n, c.t,
          c.o ? c.o.join(' / ') : (c.t === 'bool' ? 'OUI / NON'
            : (c.t === 'number' ? 'nombre' : (c.t === 'date' ? 'AAAA-MM-JJ' : 'texte')))]));
      telecharger(EG.Tableur.construire([
        { nom: 'Écoles', lignes },
        { nom: 'Légende', lignes: legende }
      ]), 'modele-collecte-ecoles.xlsx');
    }

    /** L'annuaire complet, tel qu'il est en base. */
    function exporter(champs, ecoles, it) {
      const autres = champs.filter(c => c.n !== 'code_ecole');
      const lignes = [enTetes(champs)].concat(ecoles.map(e =>
        [e.code_ecole || ''].concat(autres.map(c => valeurBrute(e, c, it)))));
      telecharger(EG.Tableur.construire([{ nom: 'Annuaire', lignes }]),
        'annuaire-ecoles-' + session().annee_code + '.xlsx');
    }

    function telecharger(blob, nom) {
      const a = el('a', { href: URL.createObjectURL(blob), download: nom });
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      U.toast('Classeur « ' + nom + ' » téléchargé');
    }

    /**
     * Reprise d'un classeur rempli. Le rapprochement se fait sur le code de
     * l'école ; une école inconnue est créée, jamais écrasée en silence.
     */
    function importer(champs, ecoles) {
      const entree = el('input', { type: 'file', accept: '.xlsx,.csv' });
      const compte = el('p', { class: 'muet' });
      let resultat = null;

      entree.addEventListener('change', () => {
        const f = entree.files && entree.files[0];
        if (!f) return;
        compte.textContent = 'Lecture en cours…';
        EG.Tableur.lire(f).then(rangs => {
          if (!rangs || rangs.length < 2) {
            compte.textContent = 'Le classeur est vide.'; return;
          }
          const tete = rangs[0].map(x => String(x || '').trim());
          const parLibelle = {}; champs.forEach(c => { parLibelle[c.l] = c; });
          const colonnes = tete.map(t => parLibelle[t] || null);
          if (!colonnes.filter(Boolean).length) {
            compte.textContent = 'Aucune colonne reconnue : partez du modèle de collecte.';
            return;
          }
          const parCode = {}; ecoles.forEach(e => { if (e.code_ecole) parCode[e.code_ecole] = e; });
          const aEnregistrer = []; let crees = 0, majs = 0, ignorees = 0;

          rangs.slice(1).forEach(l => {
            const code = String(l[0] || '').trim();
            if (!code) { ignorees++; return; }
            const base = parCode[code];
            const cible = Object.assign({}, base || { code_ecole: code, cycle: 'PRIMAIRE', actif: true });
            let touche = 0;
            colonnes.forEach((c, i) => {
              if (!c || c.n === 'code_ecole' || c.ref) return;
              const brut = l[i];
              if (brut === null || brut === undefined || String(brut).trim() === '') return;
              const texte = String(brut).trim();
              let v = texte;
              if (c.t === 'bool') v = /^(oui|1|vrai|true|x)$/i.test(texte);
              else if (c.t === 'number') {
                v = Number(texte.replace(',', '.'));
                if (isNaN(v)) return;
              } else if (c.o && c.o.indexOf(texte.toUpperCase()) >= 0) v = texte.toUpperCase();
              if (cible[c.n] === v) return;
              cible[c.n] = v; touche++;
            });
            if (!touche && base) { ignorees++; return; }
            aEnregistrer.push(cible);
            if (base) majs++; else crees++;
          });

          resultat = aEnregistrer;
          compte.textContent = aEnregistrer.length + ' ligne(s) à reprendre — ' + crees
            + ' école(s) à créer, ' + majs + ' à mettre à jour, ' + ignorees + ' sans changement.';
        }).catch(err => { compte.textContent = 'Lecture impossible : ' + err.message; });
      });

      U.modal('Importer un classeur', el('div', { class: 'formulaire' }, [
        el('p', { class: 'muet petit', text: 'Partez du modèle de collecte : la première colonne '
          + 'porte le code de l’école, les suivantes les rubriques. Une école inconnue est créée, '
          + 'une école connue est complétée — rien n’est effacé.' }),
        el('div', { class: 'champ' }, [el('label', { text: 'Classeur rempli (.xlsx ou .csv)' }), entree]),
        compte
      ]), fermer => [
        el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
        el('button', {
          class: 'btn btn-primaire', text: 'Reprendre les données', onclick: () => {
            if (!resultat || !resultat.length) { U.toast('Rien à reprendre', 'attention'); return; }
            DB.putBatch('ecoles', resultat)
              .then(() => DB.audit('IMPORT_ECOLES', 'ecoles', null, { lignes: resultat.length }))
              .then(() => {
                fermer(); U.toast(resultat.length + ' école(s) reprise(s)');
                EG.majSynchro(); dessiner();
              });
          }
        })
      ]);
    }

    /** Le formulaire papier, à remettre aux directeurs qui n'ont pas l'application. */
    function ficheVierge() {
      EG.genererDocument('FICHE_COLLECTE', 'Fiche de collecte — identification de l’école', ficheCollecteCorps());
    }
  });
})(window);
