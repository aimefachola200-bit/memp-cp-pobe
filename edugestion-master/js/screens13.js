/* ÉduGestion Pro Master — classes et rôles de gestion collégiale ; téléchargements.

   « Classes & rôles » : les six cours du primaire (CI, CP, CE1, CE2, CM1, CM2),
   leurs titulaires, puis les instances de gestion collégiale de l'école (comité
   de direction, conseil des maîtres, APE, AME…) avec le rôle de chacun.

   « Téléchargements » : les fiches de recensement, les fiches à remplir et les
   certificats, en PDF, en Word ou en Excel, vierges ou pré-remplies. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const indexer = E.indexer, entete = E.entete;
  const S = () => EG.Sortie;
  const ech = s => EG.Docs.echapper(s);
  const sa = U.sansAccent;

  const nomAgent = a => a ? ((a.nom || '').toUpperCase() + ' ' + (a.prenoms || '')).trim() : '—';
  const tri = (a, b) => String(a.nom).localeCompare(String(b.nom), 'fr', { numeric: true });
  const iso = d => d.toISOString().slice(0, 10);

  /* =======================================================================
     Choix de l'école (commun aux deux écrans)
     ======================================================================= */

  /**
   * Barre « circonscription › école » pour les comptes qui couvrent plusieurs
   * écoles. Un directeur n'a rien à choisir : son école est fixe.
   * `etat` = { ecole_id, cs, liste, it, ecole } ; rend une promesse.
   */
  function preparerEcoles(etat) {
    return Promise.all([DB.all('ecoles'), DB.all('territoires')]).then(([ecoles, terr]) => {
      etat.liste = EG.ecolesDuPerimetre(ecoles, terr).filter(e => e.actif !== false).sort(tri);
      etat.it = indexer(terr);
      if (EG.session.ecole_id) etat.ecole_id = EG.session.ecole_id;
      else if (!etat.ecole_id && etat.liste.length === 1) etat.ecole_id = etat.liste[0].id;
      if (etat.ecole_id && !etat.liste.some(e => e.id === etat.ecole_id)) etat.ecole_id = '';
      etat.ecole = etat.liste.filter(e => e.id === etat.ecole_id)[0] || null;
    });
  }

  function barreEcole(zone, etat, redessiner, facultatif) {
    zone.textContent = '';
    if (EG.session.ecole_id || etat.liste.length <= 1) return;
    const barre = el('div', { class: 'barre-filtres' });
    const parCs = {};
    etat.liste.forEach(e => { if (e.territoire_id && etat.it[e.territoire_id]) parCs[e.territoire_id] = etat.it[e.territoire_id]; });
    const cs = Object.keys(parCs).map(k => parCs[k]).sort(tri);
    if (cs.length > 1) {
      barre.appendChild(U.selecteur('Circonscription', cs.map(c => ({ value: c.id, label: c.nom })), etat.cs || '',
        v => { etat.cs = v; etat.ecole_id = ''; redessiner(true); }, { libelleVide: 'Toutes' }));
    }
    const dans = etat.liste.filter(e => !etat.cs || e.territoire_id === etat.cs);
    if (dans.length <= 500) {
      barre.appendChild(U.selecteur('École', dans.map(e => ({ value: e.id, label: e.nom })), etat.ecole_id || '',
        v => { etat.ecole_id = v; redessiner(true); }, { libelleVide: facultatif ? 'Aucune (fiches vierges)' : '— Choisir une école —' }));
    } else {
      barre.appendChild(el('p', { class: 'muet petit', text: 'Choisissez d’abord une circonscription pour afficher ses écoles.' }));
    }
    zone.appendChild(barre);
  }

  /* =======================================================================
     CLASSES & RÔLES DE GESTION
     ======================================================================= */

  const GESTION = ['ADMIN_MEMP', 'ADMIN_TECHNIQUE', 'DDEMP', 'CS', 'DIRECTEUR'];
  const peutGerer = () => GESTION.indexOf(EG.session.user.role) >= 0 && EG.peutEcrire();

  /* Rôles qui ne se tiennent qu'une fois par instance. */
  const UNIQUES = ['PRESIDENT', 'VICE_PRESIDENT', 'SECRETAIRE', 'TRESORIER'];
  /* Bureau attendu, pour signaler ce qui manque. */
  const BUREAU = {
    COMITE_DIRECTION: ['PRESIDENT', 'SECRETAIRE'], CONSEIL_MAITRES: ['PRESIDENT', 'SECRETAIRE'],
    APE: ['PRESIDENT', 'SECRETAIRE', 'TRESORIER'], AME: ['PRESIDENT', 'SECRETAIRE', 'TRESORIER'],
    COMITE_SANTE: ['PRESIDENT'], COMITE_CANTINE: ['PRESIDENT', 'TRESORIER'], AUTRE_INSTANCE: []
  };
  const INSTANCES = ['COMITE_DIRECTION', 'CONSEIL_MAITRES', 'APE', 'AME', 'COMITE_SANTE', 'COMITE_CANTINE', 'AUTRE_INSTANCE'];
  const ROLES_INST = ['PRESIDENT', 'VICE_PRESIDENT', 'SECRETAIRE', 'SECRETAIRE_ADJOINT', 'TRESORIER',
    'TRESORIER_ADJOINT', 'COMMISSAIRE_COMPTES', 'RAPPORTEUR', 'CONSEILLER', 'MEMBRE'];

  const ONGLETS_CR = [['classes', '\uE074 Classes et titulaires'], ['roles', '\uE044 Rôles de gestion collégiale']];

  Routeur.definir('classes-roles', function (racine, args) {
    racine.appendChild(entete('Classes et rôles de gestion',
      'Les classes de l’école (maternelle et six cours du primaire) et leurs titulaires ; les instances de gestion collégiale et le rôle de chacun.'));
    let actif = args[0] === 'roles' ? 'roles' : 'classes';
    const etat = { ecole_id: '', cs: '' };
    const zoneOnglets = el('div'), zoneEcole = el('div'), zone = el('div');
    racine.appendChild(zoneOnglets); racine.appendChild(zoneEcole); racine.appendChild(zone);

    function onglets() {
      zoneOnglets.textContent = '';
      zoneOnglets.appendChild(E.barreOnglets(ONGLETS_CR, actif, code => {
        actif = code; E.remplacerRoute('classes-roles/' + code); onglets(); dessiner();
      }));
    }
    function dessiner(rechargerBarre) {
      if (rechargerBarre) barreEcole(zoneEcole, etat, dessiner, false);
      etat.ecole = etat.liste.filter(e => e.id === etat.ecole_id)[0] || null;
      zone.textContent = '';
      if (!etat.liste.length) { zone.appendChild(U.vide('Aucune école dans votre périmètre.')); return; }
      if (!etat.ecole) { zone.appendChild(U.vide('Choisissez une école pour afficher ses classes et ses instances.')); return; }
      if (actif === 'classes') ongletClasses(zone, etat, () => dessiner());
      else ongletRoles(zone, etat, () => dessiner());
    }
    onglets();
    preparerEcoles(etat).then(() => { barreEcole(zoneEcole, etat, dessiner, false); dessiner(); });
  });

  /* Ancienne adresse de l'attribution des classes : renvoie vers le nouvel onglet. */
  Routeur.definir('attribution-classes', function () { Routeur.aller('classes-roles/classes'); });

  /* ---------------- Classes et titulaires ---------------- */

  function ongletClasses(zone, etat, redessiner) {
    const ecole = etat.ecole, annee = EG.session.annee_id, gerer = peutGerer();
    Promise.all([
      DB.where('classes', { ecole_id: ecole.id, annee_scolaire_id: annee }),
      DB.where('personnels', { ecole_id: ecole.id }),
      DB.where('inscriptions_eleves', { ecole_id: ecole.id, annee_scolaire_id: annee, statut: 'ACTIF' })
    ]).then(([classes, agents, ins]) => {
      classes = classes.filter(c => c.actif !== false)
        .sort((a, b) => EG.NIVEAUX.indexOf(a.niveau) - EG.NIVEAUX.indexOf(b.niveau) || String(a.libelle || a.code).localeCompare(String(b.libelle || b.code), 'fr'));
      const enseignants = agents.filter(a => a.actif !== false && (!a.fonction || a.fonction === 'ENSEIGNANT' || a.fonction === 'DIRECTEUR'));
      const ia = indexer(agents);
      const effectifs = {};
      ins.forEach(i => { if (i.classe_id) effectifs[i.classe_id] = (effectifs[i.classe_id] || 0) + 1; });
      const manquants = EG.NIVEAUX_PRIM.filter(n => !classes.some(c => c.niveau === n));

      const compteur = {};
      classes.forEach(c => { if (c.titulaire_id) compteur[c.titulaire_id] = (compteur[c.titulaire_id] || 0) + 1; });
      const sansTitulaire = classes.filter(c => !c.titulaire_id).length;
      const sansClasse = enseignants.filter(a => !compteur[a.id]);

      zone.appendChild(el('div', { class: 'grille grille-stats' }, [
        U.stat(U.nombre(EG.NIVEAUX_PRIM.length - manquants.length) + ' / ' + EG.NIVEAUX_PRIM.length, 'Cours du primaire ouverts', manquants.length ? 'attention' : ''),
        (() => { const x = EG.Classes.ecole({}, classes); return U.stat(U.nombre(x.ouvertes), 'Classes ouvertes (' + x.simples + ' simple(s), ' + x.jumelees + ' jumelée(s), ' + x.multigrades + ' multigrade(s))'); })(),
        U.stat(U.nombre(classes.length - sansTitulaire), 'Classes avec titulaire'),
        U.stat(U.nombre(sansTitulaire), 'Classes sans titulaire', sansTitulaire ? 'attention' : ''),
        U.stat(U.nombre(enseignants.length), 'Enseignants en poste')
      ]));

      if (gerer) {
        const actions = [];
        if (manquants.length) {
          actions.push(el('button', {
            class: 'btn btn-primaire',
            text: classes.length ? 'Créer les cours manquants (' + manquants.join(', ') + ')' : 'Créer les 6 cours (CI, CP, CE1, CE2, CM1, CM2)',
            onclick: () => DB.putBatch('classes', manquants.map(n => ({
              ecole_id: ecole.id, annee_scolaire_id: annee, niveau: n, code: n, libelle: n, effectif_max: 60, actif: true
            }))).then(() => DB.audit('CREATION_COURS', 'classes', null, { ecole: ecole.id, niveaux: manquants }))
              .then(() => { U.toast(manquants.length + ' cours créé(s)'); EG.majSynchro(); redessiner(); })
          }));
        }
        actions.push(el('button', { class: 'btn btn-fantome', text: 'Ajouter une classe (section supplémentaire)', onclick: () => ajouterClasse(ecole, classes, redessiner) }));
        zone.appendChild(el('div', { class: 'barre-actions' }, actions));
      }
      if (!classes.length) {
        zone.appendChild(U.vide('Aucune classe n’est ouverte cette année. Les six cours du primaire se créent en un clic ; les classes de maternelle s’ajoutent une à une.'));
        return;
      }

      const doubles = Object.keys(compteur).filter(k => compteur[k] > 1);
      if (doubles.length) {
        zone.appendChild(U.carte('À vérifier', el('ul', { class: 'liste-points alerte' }, doubles.map(k => el('li', {
          text: nomAgent(ia[k]) + ' est titulaire de ' + compteur[k] + ' classes (possible en classe multigrade).'
        })))));
      }

      const controles = {};
      const table = el('table', { class: 'tableau' });
      table.appendChild(el('thead', {}, el('tr', {}, ['Classe', 'Niveau', 'Effectif', 'Enseignant titulaire', ''].map(t => el('th', { text: t })))));
      const tb = el('tbody');
      classes.forEach(c => {
        const sel = el('select', { 'aria-label': 'Titulaire de ' + (c.libelle || c.code) },
          [el('option', { value: '', text: '— Non attribuée —' })].concat(
            enseignants.concat(c.titulaire_id && !enseignants.some(a => a.id === c.titulaire_id) && ia[c.titulaire_id] ? [ia[c.titulaire_id]] : [])
              .sort((a, b) => nomAgent(a).localeCompare(nomAgent(b), 'fr'))
              .map(a => { const o = el('option', { value: a.id, text: nomAgent(a) }); if (c.titulaire_id === a.id) o.selected = true; return o; })));
        if (!gerer) sel.disabled = true;
        controles[c.id] = { sel, classe: c };
        const effectif = effectifs[c.id] || 0;
        tb.appendChild(el('tr', {}, [
          el('th', { text: c.libelle || c.code }),
          el('td', { text: c.niveau }),
          el('td', { text: U.nombre(effectif) + (c.effectif_max ? ' / ' + c.effectif_max : '') }),
          el('td', {}, sel),
          el('td', {}, gerer && !effectif ? el('button', {
            class: 'btn btn-petit btn-fantome btn-alerte', text: 'Supprimer', onclick: () => U.confirmer('Supprimer la classe',
              'La classe « ' + (c.libelle || c.code) + ' » n’a aucun élève : elle peut être supprimée.',
              () => DB.remove('classes', c.id).then(() => { U.toast('Classe supprimée'); EG.majSynchro(); redessiner(); }), 'Supprimer')
          }) : null)
        ]));
      });
      table.appendChild(tb);
      zone.appendChild(el('div', { class: 'tableau-enveloppe' }, table));

      if (sansClasse.length) {
        zone.appendChild(U.carte('Enseignants sans classe', el('div', { class: 'puces' },
          sansClasse.map(a => el('span', { class: 'puce', text: nomAgent(a) })))));
      }

      const actions = [];
      if (gerer) actions.push(el('button', {
        class: 'btn btn-primaire', text: 'Enregistrer les attributions', onclick: () => {
          const rows = [], affectations = [];
          Object.keys(controles).forEach(id => {
            const { sel, classe } = controles[id];
            const nouveau = sel.value || null;
            if (nouveau === (classe.titulaire_id || null)) return;
            rows.push(Object.assign({}, classe, { titulaire_id: nouveau }));
            if (nouveau) affectations.push({
              personnel_id: nouveau, ecole_id: classe.ecole_id, classe_id: classe.id,
              fonction: 'Titulaire de classe', date_debut: iso(new Date())
            });
          });
          if (!rows.length) { U.toast('Aucun changement'); return; }
          DB.putBatch('classes', rows)
            .then(() => affectations.length ? DB.putBatch('affectations_personnel', affectations) : null)
            .then(() => DB.audit('ATTRIBUTION_CLASSES', 'classes', null, { modifiees: rows.length }))
            .then(() => { U.toast(rows.length + ' attribution(s) enregistrée(s)'); EG.majSynchro(); redessiner(); });
        }
      }));
      actions.push(el('button', {
        class: 'btn btn-fantome', text: 'Éditer la répartition des classes', onclick: () => S().imprimer('Répartition des classes',
          '<h2>Répartition des classes</h2><p>' + ech(ecole.nom) + ' — année scolaire ' + ech(EG.session.annee_code) + '</p>'
          + '<table><thead><tr><th>Classe</th><th>Cours</th><th>Effectif</th><th>Enseignant titulaire</th><th>Matricule</th><th>Émargement</th></tr></thead><tbody>'
          + classes.map(c => { const a = ia[c.titulaire_id]; return '<tr><td>' + ech(c.libelle || c.code) + '</td><td>' + ech(c.niveau) + '</td><td>'
            + (effectifs[c.id] || 0) + '</td><td>' + ech(a ? nomAgent(a) : '—') + '</td><td>' + ech((a && a.matricule) || '—') + '</td><td></td></tr>'; }).join('')
          + '</tbody></table>', { ecole })
      }));
      zone.appendChild(el('div', { class: 'barre-actions' }, actions));
    });
  }

  function ajouterClasse(ecole, classes, redessiner) {
    const niveau = el('select', {}, EG.NIVEAUX.map(n => el('option', { value: n, text: n })));
    const libelle = el('input', { type: 'text', value: '' });
    const erreur = el('div', { class: 'erreurs' });
    const proposer = () => {
      const n = niveau.value, deja = classes.filter(c => c.niveau === n).length;
      libelle.value = deja ? n + ' ' + String.fromCharCode(65 + deja) : n;
    };
    niveau.addEventListener('change', proposer); proposer();
    U.modal('Ajouter une classe', el('div', { class: 'formulaire' }, [
      erreur,
      el('div', { class: 'champ' }, [el('label', { text: 'Niveau (maternelle ou cours du primaire)' }), niveau]),
      el('div', { class: 'champ' }, [el('label', { text: 'Libellé de la classe' }), libelle]),
      el('p', { class: 'muet petit', text: 'Utile quand un cours compte plusieurs sections (CE1 A, CE1 B).' })
    ]), fermer => [
      el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
      el('button', {
        class: 'btn btn-primaire', text: 'Ajouter', onclick: () => {
          const l = libelle.value.trim();
          if (!l) { erreur.textContent = 'Le libellé est obligatoire.'; return; }
          if (classes.some(c => sa(c.libelle || c.code) === sa(l))) { erreur.textContent = 'Une classe porte déjà ce libellé.'; return; }
          fermer();
          DB.put('classes', { ecole_id: ecole.id, annee_scolaire_id: EG.session.annee_id, niveau: niveau.value, code: l, libelle: l, effectif_max: 60, actif: true })
            .then(() => { U.toast('Classe ajoutée'); EG.majSynchro(); redessiner(); });
        }
      })
    ]);
  }

  /* ---------------- Rôles de gestion collégiale ---------------- */

  function ongletRoles(zone, etat, redessiner) {
    const ecole = etat.ecole, annee = EG.session.annee_id, gerer = peutGerer();
    Promise.all([
      DB.where('membres_instances', { ecole_id: ecole.id, annee_scolaire_id: annee }),
      DB.where('personnels', { ecole_id: ecole.id })
    ]).then(([membres, agents]) => {
      agents = agents.filter(a => a.actif !== false);
      const ia = indexer(agents);
      const nomMembre = m => (m.personnel_id && ia[m.personnel_id]) ? nomAgent(ia[m.personnel_id]) : (m.nom_complet || '—');
      const membresDe = code => membres.filter(m => m.instance === code && m.actif !== false)
        .sort((a, b) => ROLES_INST.indexOf(a.role) - ROLES_INST.indexOf(b.role) || nomMembre(a).localeCompare(nomMembre(b), 'fr'));

      const enPlace = INSTANCES.filter(i => membresDe(i).length).length;
      zone.appendChild(el('div', { class: 'grille grille-stats' }, [
        U.stat(enPlace + ' / ' + (INSTANCES.length - 1), 'Instances constituées'),
        U.stat(U.nombre(membres.filter(m => m.actif !== false).length), 'Postes pourvus')
      ]));
      zone.appendChild(el('div', { class: 'barre-actions' }, [
        el('button', {
          class: 'btn btn-fantome', text: 'Éditer la liste des instances', onclick: () => S().imprimer('Instances de gestion collégiale',
            '<h2>Instances de gestion collégiale</h2><p>' + ech(ecole.nom) + ' — année scolaire ' + ech(EG.session.annee_code) + '</p>'
            + INSTANCES.map(i => {
              const l = membresDe(i);
              return '<h3>' + ech(U.libelle(i)) + '</h3>' + (l.length
                ? '<table><thead><tr><th>Nom et prénoms</th><th>Rôle</th><th>Téléphone</th></tr></thead><tbody>'
                  + l.map(m => '<tr><td>' + ech(nomMembre(m)) + '</td><td>' + ech(U.libelle(m.role)) + '</td><td>' + ech(m.telephone || '') + '</td></tr>').join('') + '</tbody></table>'
                : '<p><em>Instance non constituée.</em></p>');
            }).join(''), { ecole })
        })
      ]));

      INSTANCES.forEach(code => {
        const liste = membresDe(code);
        const attendus = BUREAU[code] || [];
        const manque = attendus.filter(r => !liste.some(m => m.role === r));
        const tete = el('div', { class: 'ligne-entre' }, [
          el('div', {}, [
            el('strong', { text: U.libelle(code) }), document.createTextNode(' '),
            !liste.length ? U.badge('Non constituée', 'attention')
              : manque.length ? U.badge('Bureau incomplet : il manque ' + manque.map(r => U.libelle(r).replace(/\(.*\)/, '').toLowerCase()).join(', '), 'attention')
                : U.badge('Bureau complet', 'ok')
          ]),
          gerer ? el('div', { class: 'actions-mini' }, [
            (code === 'COMITE_DIRECTION' || code === 'CONSEIL_MAITRES') ? el('button', {
              class: 'btn btn-petit btn-fantome', text: 'Constituer d’après le personnel',
              onclick: () => constituer(code, ecole, agents, membres, redessiner)
            }) : null,
            el('button', { class: 'btn btn-petit btn-primaire', text: 'Ajouter un membre', onclick: () => formulaireMembre(code, null, ecole, agents, membres, redessiner) })
          ]) : null
        ]);
        const corps = liste.length ? U.tableau([
          { titre: 'Nom et prénoms', valeur: m => nomMembre(m) },
          { titre: 'Rôle', valeur: m => U.libelle(m.role) },
          { titre: 'Origine', valeur: m => m.personnel_id ? 'Agent de l’école' : 'Extérieur à l’équipe' },
          { titre: 'Téléphone', valeur: m => m.telephone || (ia[m.personnel_id] || {}).telephone || '—' },
          { titre: 'Mandat', valeur: m => m.date_debut ? 'depuis le ' + U.dateCourte(m.date_debut) + (m.date_fin ? ' jusqu’au ' + U.dateCourte(m.date_fin) : '') : '—' },
          {
            titre: '', valeur: m => gerer ? el('div', { class: 'actions-mini' }, [
              el('button', { class: 'btn btn-petit btn-fantome', text: 'Modifier', onclick: () => formulaireMembre(code, m, ecole, agents, membres, redessiner) }),
              el('button', {
                class: 'btn btn-petit btn-fantome btn-alerte', text: 'Retirer', onclick: () => U.confirmer('Retirer ce membre',
                  nomMembre(m) + ' ne fera plus partie de « ' + U.libelle(code) + ' ».',
                  () => DB.remove('membres_instances', m.id).then(() => { U.toast('Membre retiré'); EG.majSynchro(); redessiner(); }), 'Retirer')
              })
            ]) : ''
          }
        ], liste) : el('p', { class: 'muet petit', text: 'Aucun membre enregistré.' });
        zone.appendChild(U.carte(null, el('div', {}, [tete, corps])));
      });
    });
  }

  function formulaireMembre(instance, existant, ecole, agents, membres, redessiner) {
    const role = el('select', {}, ROLES_INST.map(r => { const o = el('option', { value: r, text: U.libelle(r) }); if (existant && existant.role === r) o.selected = true; return o; }));
    const agent = el('select', {}, [el('option', { value: '', text: '— Une autre personne (parent, notable…) —' })].concat(
      agents.slice().sort((a, b) => nomAgent(a).localeCompare(nomAgent(b), 'fr')).map(a => {
        const o = el('option', { value: a.id, text: nomAgent(a) }); if (existant && existant.personnel_id === a.id) o.selected = true; return o;
      })));
    const nom = el('input', { type: 'text', value: existant && !existant.personnel_id ? existant.nom_complet || '' : '' });
    const tel = el('input', { type: 'tel', value: existant ? existant.telephone || '' : '' });
    const debut = el('input', { type: 'date', value: existant ? existant.date_debut || '' : iso(new Date()) });
    const fin = el('input', { type: 'date', value: existant ? existant.date_fin || '' : '' });
    const erreur = el('div', { class: 'erreurs' });
    const majNom = () => { nom.disabled = !!agent.value; };
    agent.addEventListener('change', majNom); majNom();

    U.modal((existant ? 'Modifier un membre — ' : 'Ajouter un membre — ') + U.libelle(instance), el('div', { class: 'formulaire' }, [
      erreur,
      el('div', { class: 'champ' }, [el('label', { text: 'Rôle dans l’instance' }), role]),
      el('div', { class: 'champ' }, [el('label', { text: 'Agent de l’école' }), agent]),
      el('div', { class: 'champ' }, [el('label', { text: 'Nom et prénoms (si ce n’est pas un agent)' }), nom]),
      el('div', { class: 'champ' }, [el('label', { text: 'Téléphone' }), tel]),
      el('div', { class: 'champ' }, [el('label', { text: 'Début du mandat' }), debut]),
      el('div', { class: 'champ' }, [el('label', { text: 'Fin du mandat (facultatif)' }), fin])
    ]), fermer => [
      el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
      el('button', {
        class: 'btn btn-primaire', text: 'Enregistrer', onclick: () => {
          erreur.textContent = '';
          if (!agent.value && !nom.value.trim()) { erreur.textContent = 'Choisissez un agent ou saisissez un nom.'; return; }
          if (UNIQUES.indexOf(role.value) >= 0) {
            const autre = membres.filter(m => m.instance === instance && m.actif !== false && m.role === role.value && (!existant || m.id !== existant.id))[0];
            if (autre) { erreur.textContent = 'Le rôle « ' + U.libelle(role.value) + ' » est déjà tenu dans cette instance. Retirez d’abord son titulaire.'; return; }
          }
          const a = agents.filter(x => x.id === agent.value)[0];
          fermer();
          DB.put('membres_instances', Object.assign({}, existant || {}, {
            ecole_id: ecole.id, annee_scolaire_id: EG.session.annee_id, instance, role: role.value,
            personnel_id: a ? a.id : null, nom_complet: a ? nomAgent(a) : nom.value.trim(),
            telephone: tel.value.trim() || (a && a.telephone) || '', date_debut: debut.value || null, date_fin: fin.value || null, actif: true
          })).then(() => { DB.audit('ROLE_INSTANCE', 'membres_instances', null, { instance, role: role.value }); U.toast('Enregistré'); EG.majSynchro(); redessiner(); });
        }
      })
    ]);
  }

  /** Comité de direction et conseil des maîtres se déduisent du personnel de l'école. */
  function constituer(code, ecole, agents, membres, redessiner) {
    const deja = {}; membres.filter(m => m.instance === code && m.actif !== false && m.personnel_id).forEach(m => { deja[m.personnel_id] = true; });
    const directeur = agents.filter(a => a.fonction === 'DIRECTEUR')[0];
    const aAjouter = [];
    const aPresident = membres.some(m => m.instance === code && m.actif !== false && m.role === 'PRESIDENT');
    agents.filter(a => !a.fonction || a.fonction === 'ENSEIGNANT' || a.fonction === 'DIRECTEUR').forEach(a => {
      if (deja[a.id]) return;
      if (code === 'COMITE_DIRECTION' && directeur && a.id !== directeur.id) return; /* le comité : le directeur, puis on complète à la main */
      aAjouter.push(a);
    });
    if (!aAjouter.length) { U.toast('Rien à ajouter : tout le personnel y figure déjà', 'attention'); return; }
    DB.putBatch('membres_instances', aAjouter.map(a => ({
      ecole_id: ecole.id, annee_scolaire_id: EG.session.annee_id, instance: code,
      role: (directeur && a.id === directeur.id && !aPresident) ? 'PRESIDENT' : 'MEMBRE',
      personnel_id: a.id, nom_complet: nomAgent(a), telephone: a.telephone || '', date_debut: iso(new Date()), actif: true
    }))).then(() => { U.toast(aAjouter.length + ' membre(s) ajouté(s)'); EG.majSynchro(); redessiner(); });
  }

  /* =======================================================================
     TÉLÉCHARGEMENTS
     ======================================================================= */

  const pointilles = '<span class="pointilles vide"></span>';
  const pt = l => '<span class="pointilles" style="min-width:' + (l || 160) + 'px"></span>';

  function identite(ctx) {
    return '<table class="fiche-vierge"><tbody>'
      + '<tr><td class="libelle">École</td><td class="saisie">' + (ctx.ecole ? ech(ctx.ecole.nom) : '') + '</td>'
      + '<td class="libelle">Année scolaire</td><td class="saisie">' + ech(EG.session.annee_code) + '</td></tr></tbody></table>';
  }
  /** Bloc de rubriques à remplir : libellé à gauche, case vide à droite. */
  function blocFiche(titre, libelles) {
    return (titre ? '<h3>' + ech(titre) + '</h3>' : '') + '<table class="fiche-vierge"><tbody>'
      + libelles.map(l => '<tr><td class="libelle">' + ech(l) + '</td><td class="saisie"></td></tr>').join('') + '</tbody></table>';
  }
  function grilleVierge(titres, nb, options) {
    options = options || {};
    return '<table class="grille-lignes"><thead><tr>' + titres.map(t => '<th>' + ech(t) + '</th>').join('') + '</tr></thead><tbody>'
      + Array.from({ length: nb }, (x, i) => '<tr>' + titres.map((t, k) => '<td>' + (k === 0 && options.numeroter !== false ? (i + 1) : '') + '</td>').join('') + '</tr>').join('')
      + '</tbody></table>';
  }
  /* École dont on édite les fiches : son cachet (même modèle que sur toutes les pièces) est apposé
     à l'emplacement de la signature. Sans école choisie, la case reste vide, à tamponner à la main. */
  let ecoleCachet = null;
  const signature = (qui) => '<table style="border:0;margin-top:22px"><tbody><tr><td style="border:0;width:55%">Fait à ' + pointilles + ', le ' + pointilles
    + '</td><td style="border:0;text-align:center">' + ech(qui) + '<br>'
    + (ecoleCachet ? '<span class="cachet-case">' + EG.Docs.cachet(ecoleCachet, { taille: 92 }) + '</span><br>(signature)' : '<br><br><br>(signature et cachet)')
    + '</td></tr></tbody></table>';

  /* ---- Fiche de recensement ---- */

  function corpsRecensement(ctx, valeurs) {
    const R = EG.Recensement.RUBRIQUES;
    return '<div class="fiche-vierge"><h2>Fiche de recensement annuel — année scolaire ' + ech(EG.session.annee_code) + '</h2>'
      + identite(ctx)
      + '<p class="consigne">' + (valeurs ? 'Valeurs reprises des données de l’application ; à vérifier, corriger et signer.'
        : 'À remplir par le directeur, puis à retourner à la circonscription scolaire.') + '</p>'
      + R.map(rub => '<h3>' + ech(rub.nom) + '</h3><table class="fiche-vierge"><tbody>'
        + rub.champs.map(c => '<tr><td class="libelle">' + ech(c.l) + '</td><td class="saisie">'
          + ech(valeurs && valeurs[rub.code + '.' + c.c] !== undefined && valeurs[rub.code + '.' + c.c] !== null ? valeurs[rub.code + '.' + c.c] : '') + '</td></tr>').join('')
        + '</tbody></table>').join('')
      + signature('Le directeur') + '</div>';
  }

  /** Valeurs d'une école : ce qui a été confirmé dans la fiche, sinon le calcul automatique. */
  function valeursRecensement(ecole) {
    return Promise.all([
      EG.Recensement.calculerAuto(ecole.id),
      DB.where('recensements_ecoles', { ecole_id: ecole.id }), DB.all('recensement_valeurs')
    ]).then(([auto, fiches, valeurs]) => {
      const ids = {}; fiches.forEach(f => { ids[f.id] = true; });
      const saisies = {};
      valeurs.filter(v => ids[v.recensement_id]).forEach(v => { saisies[v.rubrique + '.' + v.champ] = v.valeur; });
      const out = {};
      EG.Recensement.RUBRIQUES.forEach(rub => rub.champs.forEach(c => {
        const cle = rub.code + '.' + c.c;
        out[cle] = saisies[cle] !== undefined && saisies[cle] !== '' ? saisies[cle] : (auto[c.auto] === undefined || auto[c.auto] === null ? '' : auto[c.auto]);
      }));
      return out;
    });
  }

  function feuilleRecensement(valeurs) {
    const lignes = [['Rubrique', 'Donnée', 'Valeur']];
    EG.Recensement.RUBRIQUES.forEach(rub => rub.champs.forEach(c => lignes.push([
      rub.nom, c.l, valeurs ? (valeurs[rub.code + '.' + c.c] === '' ? '' : valeurs[rub.code + '.' + c.c]) : ''
    ])));
    return [{ nom: 'Recensement', lignes }];
  }

  /** Récapitulatif de toutes les écoles du périmètre : une ligne par école. */
  function recapitulatif(ctx) {
    return Promise.all([DB.all('recensements_ecoles'), DB.all('recensement_valeurs'), DB.all('campagnes_recensement')]).then(([fiches, valeurs, camps]) => {
      const ouvertes = {}; camps.filter(c => c.statut === 'OUVERTE').forEach(c => { ouvertes[c.id] = true; });
      const parEcole = {};
      fiches.filter(f => ouvertes[f.campagne_id]).forEach(f => { parEcole[f.ecole_id] = f; });
      const valParFiche = {};
      valeurs.forEach(v => { (valParFiche[v.recensement_id] = valParFiche[v.recensement_id] || {})[v.rubrique + '.' + v.champ] = v.valeur; });
      const champs = [];
      EG.Recensement.RUBRIQUES.forEach(rub => rub.champs.forEach(c => champs.push({ cle: rub.code + '.' + c.c, l: c.l })));
      const ecoles = ctx.liste.filter(e => !ctx.cs || e.territoire_id === ctx.cs);
      const lignes = [['Circonscription', 'École', 'Code', 'Statut de la fiche', 'Complétion (%)'].concat(champs.map(c => c.l))];
      ecoles.forEach(e => {
        const f = parEcole[e.id];
        lignes.push([(ctx.it[e.territoire_id] || {}).nom || '', e.nom, e.code_ecole || '', f ? U.libelle(f.statut) : 'Pas de fiche', f ? f.taux_completion || 0 : 0]
          .concat(champs.map(c => (f && valParFiche[f.id] && valParFiche[f.id][c.cle] !== undefined) ? valParFiche[f.id][c.cle] : '')));
      });
      return [{ nom: 'Recensement', lignes }];
    });
  }

  /* ---- Catalogue ---- */

  const MOIS = 31;
  const CATALOGUE = {
    recensement: [
      {
        code: 'rec-ecole', nom: 'Fiche de recensement de l’école (pré-remplie)', icone: '\uE040', needsEcole: true,
        description: 'Les effectifs, le personnel, le patrimoine et les finances déjà saisis dans l’application, prêts à signer.',
        pdf: true, word: true, excel: true,
        corps: ctx => valeursRecensement(ctx.ecole).then(v => corpsRecensement(ctx, v)),
        feuilles: ctx => valeursRecensement(ctx.ecole).then(feuilleRecensement)
      },
      {
        code: 'rec-vierge', nom: 'Fiche de recensement vierge', icone: '\uE04B',
        description: 'Le même formulaire, à remplir à la main dans les écoles qui n’ont pas encore l’application.',
        pdf: true, word: true, excel: true,
        corps: ctx => corpsRecensement(ctx, null), feuilles: () => feuilleRecensement(null)
      },
      {
        code: 'rec-recap', nom: 'Récapitulatif des recensements du périmètre', icone: '\uE015', reserve: true,
        description: 'Un tableau Excel : une ligne par école, avec l’état de sa fiche et toutes ses valeurs.',
        excel: true, feuilles: ctx => recapitulatif(ctx)
      },
      {
        code: 'collecte', nom: 'Fiche de collecte — identification de l’école', icone: '\uE02B',
        description: 'Le formulaire papier de l’identification : localisation, accessibilité, équipements, instances.',
        pdf: true, word: true, corps: () => '<div class="fiche-vierge">' + EG.ficheCollecteCorps() + '</div>',
        liens: [{ lib: 'Annuaire des écoles', route: 'annuaire-ecoles' }]
      }
    ],
    fiches: [
      {
        code: 'liste-classe', nom: 'Liste de classe vierge', icone: '\uE00F',
        description: 'Numéro, nom, sexe, date et lieu de naissance, redoublant : 60 lignes à remplir.',
        pdf: true, word: true, excel: true,
        corps: ctx => '<div class="fiche-vierge"><h2>Liste de classe</h2>' + identite(ctx)
          + '<table class="fiche-vierge"><tbody><tr><td class="libelle">Classe</td><td class="saisie"></td><td class="libelle">Titulaire</td><td class="saisie"></td></tr></tbody></table>'
          + grilleVierge(['N°', 'Nom et prénoms', 'Sexe', 'Date de naissance', 'Lieu de naissance', 'Redoublant', 'Observations'], 60) + '</div>',
        feuilles: () => [{ nom: 'Liste de classe', lignes: [['N°', 'Nom et prénoms', 'Sexe', 'Date de naissance', 'Lieu de naissance', 'Redoublant', 'Observations']]
          .concat(Array.from({ length: 60 }, (x, i) => [i + 1, '', '', '', '', '', ''])) }],
        liens: [{ lib: 'Éditer avec les élèves', route: 'documents' }]
      },
      {
        code: 'inscription', nom: 'Fiche d’inscription d’un élève', icone: '\uE021',
        description: 'Identité de l’enfant, parents ou tuteur, scolarité antérieure, pièces fournies.',
        pdf: true, word: true,
        corps: ctx => '<div class="fiche-vierge"><h2>Fiche d’inscription</h2>' + identite(ctx)
          + blocFiche('L’élève', ['Nom', 'Prénoms', 'Sexe', 'Date de naissance', 'Lieu de naissance', 'Acte de naissance (n° et date)', 'NPI', 'Nationalité'])
          + blocFiche('Famille', ['Nom et prénoms du père', 'Nom et prénoms de la mère', 'Tuteur (si différent)', 'Profession du responsable', 'Téléphone', 'Adresse du domicile'])
          + blocFiche('Scolarité', ['Cours demandé', 'École d’origine', 'Dernière classe suivie', 'Redoublant (oui / non)', 'A suivi la maternelle (oui / non)', 'Situation de handicap éventuelle'])
          + blocFiche('Pièces fournies', ['Acte de naissance', 'Certificat de transfert (si transfert)', 'Photos d’identité', 'Carnet de vaccination'])
          + signature('Le directeur') + '</div>'
      },
      {
        code: 'registre-vierge', nom: 'Registre d’appel vierge', icone: '\uE010', paysage: true,
        description: 'Un mois de présences : 45 lignes, une colonne par jour.',
        pdf: true, word: true, excel: true,
        corps: ctx => '<div class="fiche-vierge"><h2>Registre d’appel</h2>' + identite(ctx)
          + '<p class="consigne">Classe : ' + pointilles + ' &nbsp; Mois : ' + pointilles + ' &nbsp; Titulaire : ' + pointilles + '</p>'
          + grilleVierge(['N°', 'Nom et prénoms'].concat(Array.from({ length: MOIS }, (x, i) => String(i + 1))).concat(['Abs.']), 45) + '</div>',
        feuilles: () => [{ nom: 'Registre', lignes: [['N°', 'Nom et prénoms'].concat(Array.from({ length: MOIS }, (x, i) => i + 1)).concat(['Absences'])]
          .concat(Array.from({ length: 45 }, (x, i) => [i + 1])) }],
        liens: [{ lib: 'Registre d’appel du mois', route: 'registre-appel' }]
      },
      {
        code: 'notes-vierge', nom: 'Fiche de notes vierge', icone: '\uE00E', paysage: true,
        description: 'Une ligne par élève, une colonne par matière, moyenne et rang.',
        pdf: true, word: true, excel: true,
        corps: ctx => matieresPrimaire().then(m => '<div class="fiche-vierge"><h2>Fiche de notes</h2>' + identite(ctx)
          + '<p class="consigne">Classe : ' + pointilles + ' &nbsp; Évaluation n° : ' + pointilles + ' &nbsp; Date : ' + pointilles + '</p>'
          + grilleVierge(['N°', 'Nom et prénoms'].concat(m).concat(['Moyenne', 'Rang']), 45) + '</div>'),
        feuilles: () => matieresPrimaire().then(m => [{ nom: 'Notes', lignes: [['N°', 'Nom et prénoms'].concat(m).concat(['Moyenne', 'Rang'])]
          .concat(Array.from({ length: 45 }, (x, i) => [i + 1])) }]),
        liens: [{ lib: 'Saisir les notes', route: 'evaluations' }]
      },
      {
        code: 'presence-personnel', nom: 'Fiche de présence du personnel', icone: '\uE018', paysage: true,
        description: 'Émargement mensuel du personnel : une ligne par agent, une colonne par jour.',
        pdf: true, word: true, excel: true,
        corps: ctx => '<div class="fiche-vierge"><h2>Fiche de présence du personnel</h2>' + identite(ctx)
          + '<p class="consigne">Mois : ' + pointilles + '</p>'
          + grilleVierge(['N°', 'Nom et prénoms', 'Fonction'].concat(Array.from({ length: MOIS }, (x, i) => String(i + 1))), 20) + '</div>',
        feuilles: () => [{ nom: 'Présence', lignes: [['N°', 'Nom et prénoms', 'Fonction'].concat(Array.from({ length: MOIS }, (x, i) => i + 1))]
          .concat(Array.from({ length: 20 }, (x, i) => [i + 1])) }],
        liens: [{ lib: 'Présence du personnel', route: 'presences-personnel' }]
      },
      {
        code: 'fiche-agent', nom: 'Fiche de renseignements du personnel', icone: '\uE01E',
        description: 'État civil, carrière, diplômes et affectation d’un agent.',
        pdf: true, word: true,
        corps: ctx => '<div class="fiche-vierge"><h2>Fiche de renseignements du personnel</h2>' + identite(ctx)
          + blocFiche('État civil', ['Nom', 'Prénoms', 'Sexe', 'Date de naissance', 'Lieu de naissance', 'Situation familiale', 'Téléphone', 'Adresse'])
          + blocFiche('Carrière', ['Matricule', 'NIP', 'Statut (APE, ACE, contractuel…)', 'Catégorie et échelon', 'Grade', 'Première prise de service', 'Arrivée au poste'])
          + blocFiche('Formation', ['Diplôme de recrutement', 'Diplôme le plus élevé', 'Formations suivies'])
          + signature('L’agent') + '</div>',
        liens: [{ lib: 'Personnel', route: 'personnel' }]
      },
      {
        code: 'pv-reunion', nom: 'Procès-verbal de réunion', icone: '\uE035',
        description: 'Comité de direction, conseil des maîtres, APE, AME : présents, ordre du jour, décisions.',
        pdf: true, word: true,
        corps: ctx => '<div class="fiche-vierge"><h2>Procès-verbal de réunion</h2>' + identite(ctx)
          + blocFiche('', ['Instance concernée', 'Date et heure', 'Lieu', 'Président de séance', 'Secrétaire de séance', 'Nombre de participants'])
          + '<h3>Ordre du jour</h3><div class="zone-libre" style="min-height:90px"></div>'
          + '<h3>Délibérations et décisions</h3><div class="zone-libre" style="min-height:180px"></div>'
          + '<table style="border:0;margin-top:22px"><tbody><tr><td style="border:0;text-align:center">Le secrétaire de séance<br><br><br></td>'
          + '<td style="border:0;text-align:center">Le président de séance<br><br><br></td></tr></tbody></table></div>',
        liens: [{ lib: 'Rôles de gestion collégiale', route: 'classes-roles/roles' }]
      }
    ],
    certificats: [
      {
        code: 'cert-scolarite', nom: 'Certificat de scolarité vierge', icone: '\uE02F',
        description: 'Attestation d’inscription de l’élève, à compléter à la main et à signer.',
        pdf: true, word: true,
        corps: ctx => '<div class="fiche-vierge"><h2 style="text-align:center">CERTIFICAT DE SCOLARITÉ</h2>'
          + '<p style="line-height:2.2">Je soussigné(e) ' + pt(220) + ', directeur(trice) de l’école ' + (ctx.ecole ? '<strong>' + ech(ctx.ecole.nom) + '</strong>' : pt(200))
          + ', certifie que l’élève ' + pt(240) + ', né(e) le ' + pt(110) + ' à ' + pt(140) + ', fils (fille) de ' + pt(200) + ' et de ' + pt(200)
          + ', est régulièrement inscrit(e) en classe de ' + pt(60) + ' pour l’année scolaire <strong>' + ech(EG.session.annee_code) + '</strong> (matricule ' + pt(120) + ').</p>'
          + '<p>En foi de quoi, le présent certificat lui est délivré pour servir et valoir ce que de droit.</p>' + signature('Le directeur') + '</div>',
        liens: [{ lib: 'Certificat officiel à souche', fn: () => EG.editerCertificat && EG.editerCertificat() }]
      },
      {
        code: 'attestation-frequentation', nom: 'Attestation de fréquentation vierge', icone: '\uE00D',
        description: 'Atteste que l’enfant fréquente l’école : pour une bourse, un dossier social, une administration.',
        pdf: true, word: true,
        corps: ctx => '<div class="fiche-vierge"><h2 style="text-align:center">ATTESTATION DE FRÉQUENTATION SCOLAIRE</h2>'
          + '<p style="line-height:2.2">Le (la) directeur(trice) de l’école ' + (ctx.ecole ? '<strong>' + ech(ctx.ecole.nom) + '</strong>' : pt(200))
          + ' atteste que l’élève ' + pt(240) + ', né(e) le ' + pt(110) + ', fréquente régulièrement cet établissement en classe de ' + pt(60)
          + ' depuis le ' + pt(110) + ', pour l’année scolaire <strong>' + ech(EG.session.annee_code) + '</strong>.</p>'
          + '<p>Cette attestation est délivrée à la demande de l’intéressé(e) pour servir et valoir ce que de droit.</p>' + signature('Le directeur') + '</div>'
      },
      {
        code: 'cert-transfert', nom: 'Certificat de transfert (exeat) vierge', icone: '\uE058',
        description: 'Délivré à l’élève qui quitte l’école pour un autre établissement.',
        pdf: true, word: true,
        corps: ctx => '<div class="fiche-vierge"><h2 style="text-align:center">CERTIFICAT DE TRANSFERT</h2>'
          + '<p style="line-height:2.2">Je soussigné(e) ' + pt(220) + ', directeur(trice) de l’école ' + (ctx.ecole ? '<strong>' + ech(ctx.ecole.nom) + '</strong>' : pt(200))
          + ', certifie que l’élève ' + pt(240) + ', né(e) le ' + pt(110) + ' à ' + pt(140) + ', inscrit(e) en classe de ' + pt(60)
          + ' pour l’année scolaire <strong>' + ech(EG.session.annee_code) + '</strong>, quitte notre établissement à compter du ' + pt(110)
          + ' pour rejoindre l’école ' + pt(200) + '.</p>'
          + '<p>Il (elle) est libre de tout engagement envers l’école. Situation à la date de départ : moyenne ' + pt(60) + ', rang ' + pt(60) + ', décision ' + pt(120) + '.</p>'
          + signature('Le directeur') + '</div>'
      },
      {
        code: 'cert-officiel', nom: 'Certificat de scolarité officiel (avec les données de l’élève)', icone: '\uE023',
        description: 'Modèle à souche, deux volets par feuille, rempli avec le dossier de l’élève choisi.',
        action: { lib: 'Choisir l’élève', fn: () => EG.editerCertificat && EG.editerCertificat() }
      },
      {
        code: 'cartes', nom: 'Cartes d’identité scolaire', icone: '\uE02B',
        description: 'Une carte par élève, cachet de l’école compris, prête à découper.',
        action: { lib: 'Ouvrir Documents', fn: () => Routeur.aller('documents') }
      },
      {
        code: 'fiches-cep', nom: 'Fiches d’inscription au CEP', icone: '\uE020',
        description: 'Fiches officielles des candidats de CM2.',
        action: { lib: 'Ouvrir les fiches CEP', fn: () => Routeur.aller('fiche-cep') }
      },
      {
        code: 'cert-personnel', nom: 'Certificats du personnel', icone: '\uE01D',
        description: 'Prise de service, cessation, reprise, présence au poste : modèles officiels renseignés depuis le dossier de l’agent.',
        action: { lib: 'Ouvrir les certificats', fn: () => Routeur.aller('certificats') }
      }
    ]
  };

  const ONGLETS_DL = [['recensement', '\uE040 Fiches de recensement'], ['fiches', '\uE00E Fiches à remplir'], ['certificats', '\uE02F Certificats et attestations']];

  function matieresPrimaire() {
    return DB.all('matieres').then(ms => ms.filter(m => m.cycle === 'PRIMAIRE' && m.actif !== false)
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0)).map(m => m.nom));
  }

  Routeur.definir('telechargements', function (racine, args) {
    racine.appendChild(entete('Téléchargements',
      'Fiches de recensement, fiches à remplir et certificats : à imprimer, à enregistrer en PDF ou à ouvrir dans Word et Excel.'));
    let actif = args[0] && CATALOGUE[args[0]] ? args[0] : 'recensement';
    const etat = { ecole_id: '', cs: '' };
    const zoneOnglets = el('div'), zoneEcole = el('div'), zone = el('div');
    racine.appendChild(zoneOnglets); racine.appendChild(zoneEcole); racine.appendChild(zone);

    const role = EG.session.user.role;
    const voitReserve = ['ADMIN_MEMP', 'ADMIN_TECHNIQUE', 'DDEMP', 'CS', 'CONSEILLER_PEDAGOGIQUE'].indexOf(role) >= 0;

    function onglets() {
      zoneOnglets.textContent = '';
      zoneOnglets.appendChild(E.barreOnglets(ONGLETS_DL, actif, code => {
        actif = code; E.remplacerRoute('telechargements/' + code); onglets(); dessiner();
      }));
    }

    function nomFichier(item) {
      return item.code + (etat.ecole ? '-' + S().slug(etat.ecole.nom).slice(0, 30) : '');
    }

    function lancer(item, format) {
      const ctx = { ecole: etat.ecole, liste: etat.liste, it: etat.it, cs: etat.cs };
      ecoleCachet = etat.ecole || null;
      if (item.needsEcole && !ctx.ecole) { U.toast('Choisissez d’abord une école', 'attention'); return; }
      const options = { ecole: ctx.ecole, paysage: item.paysage };
      if (format === 'pdf') S().imprimer(item.nom, () => item.corps(ctx), options);
      else if (format === 'word') S().word(nomFichier(item), item.nom, () => item.corps(ctx), options);
      else Promise.resolve(item.feuilles(ctx)).then(f => S().excel(nomFichier(item), f));
    }

    function dessiner(rechargerBarre) {
      if (rechargerBarre) barreEcole(zoneEcole, etat, dessiner, true);
      etat.ecole = etat.liste.filter(e => e.id === etat.ecole_id)[0] || null;
      zone.textContent = '';
      const items = CATALOGUE[actif].filter(i => !i.reserve || voitReserve);
      zone.appendChild(el('div', { class: 'telechargements' }, items.map(item => {
        const boutons = [];
        if (item.pdf) boutons.push(el('button', { class: 'btn btn-petit btn-primaire', text: 'PDF / imprimer', onclick: () => lancer(item, 'pdf') }));
        if (item.word) boutons.push(el('button', { class: 'btn btn-petit btn-fantome', text: 'Word', onclick: () => lancer(item, 'word') }));
        if (item.excel) boutons.push(el('button', { class: 'btn btn-petit btn-fantome', text: 'Excel', onclick: () => lancer(item, 'excel') }));
        if (item.action) boutons.push(el('button', { class: 'btn btn-petit btn-primaire', text: item.action.lib, onclick: item.action.fn }));
        (item.liens || []).forEach(l => boutons.push(el('button', {
          class: 'btn btn-petit btn-fantome', text: l.lib, onclick: () => (l.route ? Routeur.aller(l.route) : l.fn())
        })));
        return el('article', { class: 'carte dl-carte' }, [
          el('div', { class: 'dl-titre' }, [el('span', { class: 'dl-icone', text: item.icone, 'aria-hidden': 'true' }), el('h3', { text: item.nom })]),
          el('p', { class: 'muet petit', text: item.description }),
          item.needsEcole && !etat.ecole ? el('p', { class: 'petit', text: etat.liste.length
            ? 'Choisissez une école ci-dessus pour utiliser cette fiche.'
            : 'Aucune école dans votre périmètre : ajoutez ou importez d’abord des écoles.' }) : null,
          el('div', { class: 'actions-mini' }, boutons)
        ]);
      })));
      zone.appendChild(el('p', { class: 'muet petit', text: 'Pour enregistrer un PDF : dans la fenêtre d’impression, choisissez « Enregistrer au format PDF » comme imprimante.' }));
    }

    onglets();
    preparerEcoles(etat).then(() => { barreEcole(zoneEcole, etat, dessiner, true); dessiner(); });
  });

  E.selecteurEcole = { preparerEcoles, barreEcole };
})(window);
