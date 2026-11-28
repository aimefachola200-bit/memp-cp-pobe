/* ÉduGestion Pro Master — espaces de travail métier (2e série).
   Dossier élève, dossier agent, patrimoine, visites, gouvernance. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, R = EG.Rules, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const charger = E.charger, editer = E.editer, indexer = E.indexer,
    inscriptionsEnrichies = E.inscriptionsEnrichies, entete = E.entete;

  const session = () => EG.session;
  const ecoleCourante = () => EG.session.ecole_id || null;
  const anneeCourante = () => EG.session.annee_id || null;
  const grille = (enfants, classe) => el('div', { class: 'grille ' + (classe || '') }, enfants);
  const nomEleve = e => e ? (e.nom || '').toUpperCase() + ' ' + (e.prenoms || '') : '—';

  function sousSection(titre, contenu, action) {
    return el('section', { class: 'carte' }, [
      el('div', { class: 'ligne-entre' }, [
        el('h3', { class: 'carte-titre', text: titre }),
        action || null
      ]),
      contenu
    ]);
  }

  function boutonAjout(libelle, entite, valeursInitiales, apres) {
    if (!EG.peutEcrire()) return null;
    return el('button', {
      class: 'btn btn-petit btn-fantome', text: libelle,
      onclick: () => editer(entite, valeursInitiales || {}, apres)
    });
  }

  function retour(route, libelle) {
    return el('button', { class: 'btn btn-fantome', text: libelle || 'Retour', onclick: () => Routeur.aller(route) });
  }

  /* =======================================================================
     ÉLÈVES — liste, inscription avec contrôle des doublons, dossier
     ======================================================================= */

  Routeur.definir('eleves', function (racine) {
    racine.appendChild(entete('Élèves', 'Dossier permanent : un élève, un dossier, de la maternelle au CEP.',
      EG.peutEcrire() ? [el('button', { class: 'btn btn-primaire', text: 'Inscrire un élève', onclick: assistantInscription })] : null));

    const filtres = el('div', { class: 'barre-filtres' });
    const zone = el('div');
    if (EG.EducMasterModeles) { const d = el('details', { class: 'educmaster-plie' }, [el('summary', { text: '\uE030 Élèves au format EDUCMaster : exporter / importer' })]); d.addEventListener('toggle', () => { if (d.open && d.children.length === 1) d.appendChild(EG.EducMasterModeles.bloc()); }); racine.appendChild(d); }
    racine.appendChild(filtres); racine.appendChild(zone);

    let recherche = '', niveau = '', afficherSortis = false;

    filtres.appendChild(U.champRecherche('Rechercher un nom, un matricule', v => { recherche = v; dessiner(); }));
    filtres.appendChild(U.selecteur('Niveau', EG.NIVEAUX.map(n => ({ value: n, label: n })), '', v => { niveau = v; dessiner(); }));
    filtres.appendChild(U.selecteur('Inclure', [
      { value: '0', label: 'Élèves actifs' }, { value: '1', label: 'Tous, sortis compris' }
    ], '0', v => { afficherSortis = v === '1'; dessiner(); }, { vide: false }));

    function dessiner() {
      zone.textContent = '';
      const statuts = afficherSortis
        ? ['ACTIF', 'SORTIE_PRIMAIRE_CEP', 'TRANSFERE', 'ABANDON', 'CLOTURE']
        : ['ACTIF'];
      Promise.all([
        inscriptionsEnrichies({ statuts: statuts }),
        DB.where('preinscriptions', { annee_scolaire_id: anneeCourante(), statut: 'PROPOSEE' }),
        DB.all('eleves'), DB.where('classes', { annee_scolaire_id: anneeCourante() })
      ]).then(([ins, preinscriptions, tousEleves, classes]) => {
        /* Rentrée : les décisions de l'an dernier attendent d'être confirmées. */
        const attente = preinscriptions.filter(p => !ecoleCourante() || p.ecole_destination_id === ecoleCourante());
        if (attente.length) zone.appendChild(blocPreinscriptions(attente, tousEleves, classes));

        let lignes = ins;
        if (niveau) lignes = lignes.filter(i => i.niveau === niveau);
        if (recherche) {
          const q = U.sansAccent(recherche);
          lignes = lignes.filter(i => U.sansAccent(i._nom).indexOf(q) >= 0
            || U.sansAccent((i._eleve && i._eleve.educmaster_matricule) || '').indexOf(q) >= 0
            || U.sansAccent((i._eleve && i._eleve.npi) || '').indexOf(q) >= 0);
        }

        const filles = lignes.filter(i => i._eleve && i._eleve.sexe === 'F').length;
        zone.appendChild(el('p', { class: 'muet', text: lignes.length + ' élève(s) — ' + filles + ' filles, ' + (lignes.length - filles) + ' garçons' }));

        zone.appendChild(U.tableau([
          { titre: 'Nom et prénoms', valeur: i => i._nom },
          { titre: 'Sexe', valeur: i => i._eleve ? i._eleve.sexe : '—' },
          { titre: 'Âge', valeur: i => { const a = R.age(i._eleve && i._eleve.date_naissance); return a === null ? '—' : a + ' ans'; } },
          { titre: 'Niveau', valeur: i => i.niveau + (i.redoublant ? ' (R)' : '') },
          { titre: 'Statut', valeur: i => U.statut(i.statut) }
        ], lignes, {
          messageVide: recherche || niveau ? 'Aucun élève ne correspond à cette recherche.' : 'Aucun élève inscrit. Commencez par en inscrire un.',
          onLigne: i => Routeur.aller('eleve/' + i.id)
        }));
      });
    }
    dessiner();

    /** Confirme en bloc les élèves attendus à la rentrée, issus des décisions de l'année précédente. */
    function blocPreinscriptions(attente, tousEleves, classes) {
      const ie = indexer(tousEleves);
      const parNiveau = {};
      attente.forEach(p => { parNiveau[p.niveau_propose] = (parNiveau[p.niveau_propose] || 0) + 1; });
      const resume = Object.keys(parNiveau).sort().map(n => n + ' : ' + parNiveau[n]).join(' · ');

      const corps = el('div', {}, [
        el('p', { text: attente.length + ' élève(s) sont attendus à la rentrée d’après les décisions de l’année précédente.' }),
        el('p', { class: 'muet petit', text: resume }),
        U.tableau([
          { titre: 'Élève', valeur: p => nomEleve(ie[p.eleve_id]) },
          { titre: 'Venant de', valeur: p => p.niveau_origine },
          { titre: 'Attendu en', valeur: p => p.niveau_propose },
          { titre: 'Motif', valeur: p => U.libelle(p.decision_origine) }
        ], attente.slice(0, 8), { messageVide: '' }),
        attente.length > 8 ? el('p', { class: 'muet petit', text: 'et ' + (attente.length - 8) + ' autre(s).' }) : null
      ]);

      const action = EG.peutEcrire() ? el('button', {
        class: 'btn btn-petit btn-primaire', text: 'Confirmer la rentrée', onclick: () => {
          const manquants = [];
          const inscriptions = [];
          const confirmees = [];
          attente.forEach(p => {
            const cl = classes.filter(c => c.niveau === p.niveau_propose
              && (!ecoleCourante() || c.ecole_id === ecoleCourante()))[0];
            if (!cl) { manquants.push(p.niveau_propose); return; }
            inscriptions.push({
              eleve_id: p.eleve_id, ecole_id: cl.ecole_id, annee_scolaire_id: anneeCourante(),
              cycle: EG.NIVEAUX_MAT.indexOf(cl.niveau) >= 0 ? 'MATERNELLE' : 'PRIMAIRE',
              niveau: cl.niveau, classe_id: cl.id, type_inscription: 'REINSCRIPTION',
              redoublant: p.decision_origine === 'REDOUBLEMENT',
              date_inscription: new Date().toISOString().slice(0, 10),
              statut: 'ACTIF', principale: true
            });
            confirmees.push(Object.assign({}, p, { statut: 'CONFIRMEE' }));
          });
          if (!inscriptions.length) {
            U.toast('Aucune classe ouverte pour ces niveaux : ' + [...new Set(manquants)].join(', '), 'attention');
            return;
          }
          DB.putBatch('inscriptions_eleves', inscriptions)
            .then(() => DB.putBatch('preinscriptions', confirmees))
            .then(() => DB.audit('CONFIRMATION_RENTREE', 'inscriptions_eleves', null, { nombre: inscriptions.length }))
            .then(() => {
              U.toast(inscriptions.length + ' élève(s) réinscrit(s)'
                + (manquants.length ? ' — ' + manquants.length + ' sans classe ouverte' : ''));
              dessiner(); EG.majSynchro();
            });
        }
      }) : null;

      return el('section', { class: 'carte carte-action' }, [
        el('div', { class: 'ligne-entre' }, [
          el('h3', { class: 'carte-titre', text: 'Rentrée à confirmer' }), action
        ]),
        corps
      ]);
    }

    /* -------- Assistant d'inscription avec contrôle des doublons -------- */
    function assistantInscription() {
      DB.where('classes', { annee_scolaire_id: anneeCourante() }).then(classes => {
        const dispo = classes.filter(c => !ecoleCourante() || c.ecole_id === ecoleCourante());
        const ch = {};
        const mk = (id, etiquette, noeud) => {
          ch[id] = noeud;
          return el('div', { class: 'champ' }, [el('label', { for: 'i_' + id, text: etiquette }), noeud]);
        };
        const txt = (id, ph) => el('input', { type: 'text', id: 'i_' + id, placeholder: ph || '' });
        const form = el('div', { class: 'formulaire' }, [
          mk('nom', 'Nom *', txt('nom')),
          mk('prenoms', 'Prénoms *', txt('prenoms')),
          mk('sexe', 'Sexe *', el('select', { id: 'i_sexe' }, [
            el('option', { value: '', text: '— Choisir —' }),
            el('option', { value: 'M', text: 'Masculin' }),
            el('option', { value: 'F', text: 'Féminin' })
          ])),
          mk('date_naissance', 'Date de naissance', el('input', { type: 'date', id: 'i_date_naissance' })),
          mk('lieu_naissance', 'Lieu de naissance', txt('lieu_naissance')),
          mk('classe_id', 'Classe *', el('select', { id: 'i_classe_id' }, [el('option', { value: '', text: '— Choisir —' })]
            .concat(dispo.map(c => el('option', { value: c.id, text: (c.libelle || c.code) + ' — ' + c.niveau }))))),
          mk('nom_pere', 'Nom et prénoms du père', txt('nom_pere')),
          mk('nom_mere', 'Nom et prénoms de la mère', txt('nom_mere')),
          mk('tuteur_telephone', 'Téléphone des parents ou du tuteur', txt('tuteur_telephone', '01 …')),
          mk('photo', 'Photo de l’élève (appareil photo ou fichier)', (() => {
            const c = el('input', { type: 'file', id: 'i_photo', accept: 'image/*', 'aria-label': 'Photo de l’élève' });
            const apercu = el('img', { class: 'apercu-image', alt: '', style: 'display:none;max-width:120px;margin-top:4px;border-radius:6px' });
            c.dataURL = '';
            c.addEventListener('change', () => {
              const fichier = c.files && c.files[0];
              if (!fichier) return;
              const lecteur = new FileReader();
              lecteur.onload = () => {
                const img = new Image();
                img.onload = () => {
                  const k = Math.min(1, 900 / Math.max(img.width, img.height)), t = document.createElement('canvas');
                  t.width = Math.round(img.width * k); t.height = Math.round(img.height * k);
                  t.getContext('2d').drawImage(img, 0, 0, t.width, t.height);
                  c.dataURL = t.toDataURL('image/jpeg', 0.82); apercu.src = c.dataURL; apercu.style.display = '';
                };
                img.src = lecteur.result;
              };
              lecteur.readAsDataURL(fichier);
            });
            c.apercu = apercu;
            return el('div', {}, [c, apercu]);
          })()),
          el('div', { class: 'champ champ-bool' }, [
            (ch.acte_naissance = el('input', { type: 'checkbox', id: 'i_acte' })),
            el('label', { for: 'i_acte', text: 'Acte de naissance fourni' })
          ]),
          el('div', { class: 'champ champ-bool' }, [
            (ch.redoublant = el('input', { type: 'checkbox', id: 'i_redoublant' })),
            el('label', { for: 'i_redoublant', text: 'Élève redoublant' })
          ]),
          el('div', { class: 'champ champ-bool' }, [
            (ch.a_suivi_maternelle = el('input', { type: 'checkbox', id: 'i_maternelle' })),
            el('label', { for: 'i_maternelle', text: 'A suivi la maternelle' })
          ])
        ]);
        const messages = el('div', { class: 'erreurs' });

        const fermer = U.modal('Inscrire un élève', [messages, form], f => [
          el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: f }),
          el('button', { class: 'btn btn-primaire', text: 'Vérifier et inscrire', onclick: () => verifier(f) })
        ]);

        function lire() {
          return {
            nom: ch.nom.value.trim(), prenoms: ch.prenoms.value.trim(), sexe: ch.sexe.value,
            date_naissance: ch.date_naissance.value || null, lieu_naissance: ch.lieu_naissance.value.trim() || null,
            acte_naissance: ch.acte_naissance.checked, classe_id: ch.classe_id.value,
            redoublant: ch.redoublant.checked, a_suivi_maternelle: ch.a_suivi_maternelle.checked,
            nom_pere: ch.nom_pere.value.trim() || null, nom_mere: ch.nom_mere.value.trim() || null,
            tuteur_telephone: ch.tuteur_telephone.value.trim() || null,
            photo: (form.querySelector('#i_photo') || {}).dataURL || null
          };
        }

        function verifier(f) {
          const v = lire();
          messages.textContent = '';
          const erreurs = [];
          if (!v.nom) erreurs.push('Le nom est obligatoire.');
          if (!v.prenoms) erreurs.push('Les prénoms sont obligatoires.');
          if (!v.sexe) erreurs.push('Le sexe est obligatoire.');
          if (!v.classe_id) erreurs.push('La classe est obligatoire.');
          if (erreurs.length) { erreurs.forEach(e => messages.appendChild(el('p', { text: e }))); return; }

          DB.all('eleves').then(tous => {
            const proches = doublonsPossibles(tous, v);
            if (!proches.length) return creer(v, f);
            f();
            U.modal('Un dossier existe peut-être déjà', el('div', {}, [
              el('p', { text: 'Ces élèves ressemblent à celui que vous inscrivez. Vérifiez avant de créer un nouveau dossier : un doublon complique tout le suivi jusqu’au CEP.' }),
              U.tableau([
                { titre: 'Élève', valeur: x => nomEleve(x.eleve) },
                { titre: 'Naissance', valeur: x => U.dateCourte(x.eleve.date_naissance) },
                { titre: 'Matricule', valeur: x => x.eleve.educmaster_matricule || '—' },
                { titre: 'Ressemblance', valeur: x => x.score + ' %' }
              ], proches, { onLigne: x => { document.querySelector('.modal-fond').remove(); reinscrire(x.eleve, v); } })
            ]), f2 => [
              el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: f2 }),
              el('button', {
                class: 'btn btn-primaire', text: 'Ce sont des élèves différents, créer le dossier',
                onclick: () => creer(v, f2)
              })
            ]);
          });
        }

        function classeDe(id) { return dispo.filter(c => c.id === id)[0]; }

        function creer(v, f) {
          DB.put('eleves', {
            nom: v.nom, prenoms: v.prenoms, sexe: v.sexe, date_naissance: v.date_naissance,
            date_naissance_precision: v.date_naissance ? 'EXACTE' : 'INCONNUE',
            lieu_naissance: v.lieu_naissance, acte_naissance: v.acte_naissance,
            nationalite: 'Béninoise', educmaster_statut: 'NON_SYNCHRONISE', statut_identite: 'ACTIF',
            nom_pere: v.nom_pere, nom_mere: v.nom_mere, tuteur_telephone: v.tuteur_telephone, photo: v.photo
          }).then(eleve => inscrire(eleve, v, 'NOUVELLE').then(ins => ({ eleve, ins })))
            .then(({ eleve, ins }) => {
              f(); U.toast(v.nom + ' ' + v.prenoms + ' est inscrit(e)'); dessiner(); EG.majSynchro();
              U.modal('Inscription enregistrée', el('p', { text: 'Imprimer maintenant la fiche d’inscription de ' + v.nom + ' ' + v.prenoms + ', avec sa carte d’identité scolaire ?' }), f3 => [
                el('button', { class: 'btn btn-fantome', text: 'Plus tard', onclick: f3 }),
                el('button', { class: 'btn btn-primaire', text: '\uE008 Fiche d’inscription + carte', onclick: () => { f3(); EG.imprimerFicheInscription(eleve, ins); } })
              ]);
            });
        }

        function reinscrire(eleve, v) {
          inscrire(eleve, v, 'REINSCRIPTION')
            .then(() => { U.toast(nomEleve(eleve) + ' est réinscrit(e) — aucun doublon créé'); dessiner(); EG.majSynchro(); });
        }

        function inscrire(eleve, v, type) {
          const cl = classeDe(v.classe_id);
          return DB.put('inscriptions_eleves', {
            eleve_id: eleve.id, ecole_id: cl.ecole_id, annee_scolaire_id: anneeCourante(),
            cycle: EG.NIVEAUX_MAT.indexOf(cl.niveau) >= 0 ? 'MATERNELLE' : 'PRIMAIRE',
            niveau: cl.niveau, classe_id: cl.id, type_inscription: type,
            redoublant: v.redoublant, a_suivi_maternelle: v.a_suivi_maternelle,
            date_inscription: new Date().toISOString().slice(0, 10),
            statut: 'ACTIF', principale: true
          }).then(ins => DB.audit('INSCRIPTION', 'inscriptions_eleves', ins.id, { type: type, niveau: cl.niveau }).then(() => ins));
        }
      });
    }
  });

  /** Fiche d'inscription de l'élève avec sa carte d'identité scolaire (numérotée, scellée, QR, cachets). */
  EG.imprimerFicheInscription = function (eleve, ins) {
    const numeroCarte = 'CS-' + ins.niveau + '-' + ins.id.slice(0, 6).toUpperCase();
    return Promise.all([DB.get('ecoles', ins.ecole_id), DB.all('territoires')]).then(([ecole, territoires]) => {
      const it = {}; territoires.forEach(t => { it[t.id] = t; });
      const circo = ecole ? it[ecole.territoire_id] : null;
      let dep = circo ? it[circo.parent_id] : null;
      while (dep && dep.type !== 'DEPARTEMENT' && dep.parent_id) dep = it[dep.parent_id];
      const contexte = { circonscription: circo ? String(circo.nom).replace(/^CS\s+/i, '') : '', departement: dep ? dep.nom : '' };
      return EG.genererDocument('FICHE_INSCRIPTION', 'Fiche d’inscription — ' + nomEleve(eleve),
        EG.Docs.ficheInscription(eleve, ins, ecole, session().annee_code, numeroCarte, contexte, session().user),
        { classe_id: ins.classe_id, ecole_id: ins.ecole_id });
    });
  };

  /** Rapprochement simple sur le nom, les prénoms et la date de naissance. */
  function doublonsPossibles(tous, v) {
    const n = U.sansAccent(v.nom), p = U.sansAccent(v.prenoms);
    return tous.map(e => {
      let score = 0;
      const en = U.sansAccent(e.nom || ''), ep = U.sansAccent(e.prenoms || '');
      if (en === n) score += 45; else if (en.indexOf(n) === 0 || n.indexOf(en) === 0) score += 25;
      if (ep === p) score += 35; else if (ep.split(' ')[0] === p.split(' ')[0]) score += 20;
      if (v.date_naissance && e.date_naissance) {
        if (e.date_naissance === v.date_naissance) score += 20;
        else if (e.date_naissance.slice(0, 4) === v.date_naissance.slice(0, 4)) score += 8;
      }
      if (v.sexe && e.sexe && v.sexe !== e.sexe) score -= 25;
      return { eleve: e, score: Math.max(0, Math.min(100, score)) };
    }).filter(x => x.score >= 60).sort((a, b) => b.score - a.score).slice(0, 5);
  }
  EG.doublonsPossibles = doublonsPossibles;

  /* -------- Dossier d'un élève -------- */
  Routeur.definir('eleve', function (racine, args) {
    const insId = args[0];
    const tete = el('div');
    const zone = el('div');
    racine.appendChild(tete); racine.appendChild(zone);

    DB.get('inscriptions_eleves', insId).then(ins => {
      if (!ins) { racine.appendChild(U.vide('Cette inscription est introuvable.')); return; }
      return Promise.all([
        DB.get('eleves', ins.eleve_id),
        DB.where('presences', { inscription_id: insId }),
        DB.where('notes', { inscription_id: insId }),
        DB.where('evaluations', { annee_scolaire_id: anneeCourante() }),
        DB.all('matieres'),
        DB.where('resultats_cep', { inscription_id: insId }),
        DB.where('eleve_handicaps', { eleve_id: ins.eleve_id }),
        DB.all('liens_parent_enfant'), DB.all('profils_parents'),
        DB.where('decisions_annuelles', { inscription_id: insId }),
        DB.all('classes')
      ]).then(([eleve, pres, notes, evals, matieres, ceps, handicaps, liens, parents, decisions, classes]) => {
        const im = indexer(matieres), iv = indexer(evals), ip = indexer(parents), ic = indexer(classes);
        const classe = ic[ins.classe_id];

        tete.appendChild(entete(nomEleve(eleve),
          ins.niveau + (classe ? ' — ' + (classe.libelle || classe.code) : '') + ' • ' + U.libelle(ins.statut),
          [retour('eleves', 'Retour à la liste')]));

        /* Synthèse */
        const abs = pres.filter(p => p.statut === 'ABSENT').length;
        const ret = pres.filter(p => p.statut === 'RETARD').length;
        const noteesNum = notes.filter(n => typeof n.note === 'number');
        const moy = R.moyenne(noteesNum.map(n => ({ note: n.note, coefficient: 1 })));
        const risque = R.scoreRisque({
          taux_absence: pres.length ? abs / pres.length : 0,
          moyenne: moy, redoublant: ins.redoublant, retards: ret
        });

        zone.appendChild(grille([
          U.stat(R.age(eleve && eleve.date_naissance) === null ? '—' : R.age(eleve.date_naissance) + ' ans', 'Âge'),
          U.stat(moy === null ? '—' : moy.toFixed(2), 'Moyenne générale', moy !== null && moy < 10 ? 'attention' : ''),
          U.stat(pres.length ? Math.round((pres.length - abs) / pres.length * 100) + ' %' : '—', 'Présence'),
          U.stat(risque.score, 'Score de risque', risque.score >= 50 ? 'attention' : '')
        ], 'grille-stats'));

        /* Carte d'identité — rubrique séparée, sur son propre écran */
        zone.appendChild(el('button', {
          class: 'carte carte-lien', onclick: () => Routeur.aller('eleve-identite/' + insId)
        }, [
          el('div', { class: 'ligne-entre' }, [
            el('h3', { class: 'carte-titre', text: '\uE02B Carte d’identité' }),
            el('span', { class: 'muet', 'aria-hidden': 'true', text: '›' })
          ]),
          el('p', { class: 'muet', text: 'Nom, sexe, naissance, NPI, matricule…' })
        ]));

        /* Résultats par matière */
        const parMat = {};
        noteesNum.forEach(n => {
          const s = parMat[n.matiere_id] = parMat[n.matiere_id] || { total: 0, n: 0 };
          s.total += n.note; s.n++;
        });
        const detail = Object.keys(parMat).map(mid => ({
          matiere: im[mid] ? im[mid].nom : '—',
          note: Math.round(parMat[mid].total / parMat[mid].n * 100) / 100,
          evaluations: parMat[mid].n
        })).sort((a, b) => a.matiere.localeCompare(b.matiere, 'fr'));

        zone.appendChild(sousSection('Résultats par matière', U.tableau([
          { titre: 'Matière', valeur: d => d.matiere },
          { titre: 'Moyenne', valeur: d => d.note.toFixed(2) },
          { titre: 'Évaluations', valeur: d => d.evaluations },
          { titre: 'Maîtrise', valeur: d => U.badge(R.estMaitrise(d.note) ? 'Acquise' : 'À renforcer', R.estMaitrise(d.note) ? 'ok' : 'attention') },
          { titre: 'Perfectionnement', valeur: d => R.perfectionnement(d.note) ? '+' + R.perfectionnement(d.note) + ' pt' : '—' }
        ], detail, { messageVide: 'Aucune note enregistrée pour cet élève.' })));

        /* Décision et CEP */
        const cep = ceps[0];
        const d = R.decision({
          niveau: ins.niveau, moyenne: moy,
          maitrisees: detail.filter(x => R.estMaitrise(x.note)).length, notees: detail.length,
          cep: cep ? { statut: cep.statut, admis: cep.admis } : null
        });
        const bloc = el('div');
        bloc.appendChild(el('p', {}, [
          el('strong', { text: 'Décision calculée : ' }), U.statut(d.decision),
          document.createTextNode(' — ' + d.motif)
        ]));
        if (decisions[0]) bloc.appendChild(el('p', { class: 'muet petit', text: 'Décision enregistrée : ' + U.libelle(decisions[0].decision_finale) + ' (' + U.libelle(decisions[0].statut) + ')' }));
        if (cep) bloc.appendChild(el('p', { class: 'muet', text: 'CEP — table ' + (cep.numero_table || '—') + ' • ' + U.libelle(cep.statut) + (cep.admis === true ? ' • admis' : (cep.admis === false ? ' • non admis' : '')) }));
        zone.appendChild(sousSection('Décision de fin d’année', bloc));

        /* Assiduité */
        const incidents = pres.filter(p => p.statut !== 'PRESENT')
          .sort((a, b) => String(b.date_presence).localeCompare(String(a.date_presence)));
        zone.appendChild(sousSection('Absences et retards', U.tableau([
          { titre: 'Date', valeur: p => U.dateCourte(p.date_presence) },
          { titre: 'Demi-journée', valeur: p => U.libelle(p.periode || 'JOURNEE') },
          { titre: 'Statut', valeur: p => U.statut(p.statut) },
          { titre: 'Justifié', valeur: p => p.justifie ? 'Oui' : 'Non' },
          { titre: 'Motif', valeur: p => p.motif_justification || '—' }
        ], incidents.slice(0, 12), { messageVide: 'Aucune absence ni retard enregistrés.' })));

        /* Facteurs de risque */
        if (risque.facteurs.length) {
          zone.appendChild(sousSection('Facteurs de risque relevés', el('div', {}, [
            U.tableau([
              { titre: 'Facteur', valeur: f => f.facteur },
              { titre: 'Constat', valeur: f => f.valeur },
              { titre: 'Points', valeur: f => '+' + f.points }
            ], risque.facteurs),
            el('p', { class: 'muet petit', text: 'Le handicap n’entre jamais dans ce calcul.' })
          ]), boutonAjout('Ouvrir un accompagnement', 'accompagnements_eleves', {
            inscription_id: insId, date_ouverture: new Date().toISOString().slice(0, 10),
            motif: risque.facteurs.map(f => f.facteur + ' : ' + f.valeur).join(' ; '), statut: 'OUVERT'
          }, () => U.toast('Accompagnement ouvert'))));
        }

        /* Situation de handicap */
        zone.appendChild(sousSection('Situation de handicap', U.tableau([
          { titre: 'Type', valeur: h => U.libelle(h.type) },
          { titre: 'Précision', valeur: h => h.precision_autre || '—' },
          { titre: 'Aménagements', valeur: h => h.amenagements || '—' }
        ], handicaps.filter(h => h.actif !== false), { messageVide: 'Aucune situation de handicap déclarée.' }),
          boutonAjout('Déclarer', 'eleve_handicaps', { eleve_id: ins.eleve_id, actif: true }, () => Routeur.aller('eleve/' + insId))));

        /* Famille */
        const mesLiens = liens.filter(l => l.eleve_id === ins.eleve_id);
        zone.appendChild(sousSection('Famille', U.tableau([
          { titre: 'Parent', valeur: l => ip[l.parent_id] ? U.titreDe('profils_parents', ip[l.parent_id]) : '—' },
          { titre: 'Téléphone', valeur: l => ip[l.parent_id] ? ip[l.parent_id].telephone : '—' },
          { titre: 'Relation', valeur: l => U.libelle(l.relation) },
          { titre: 'Statut', valeur: l => U.statut(l.statut) }
        ], mesLiens, { messageVide: 'Aucun parent rattaché à cet élève.' }),
          boutonAjout('Rattacher un parent', 'liens_parent_enfant', { eleve_id: ins.eleve_id, statut: 'VALIDE' }, () => Routeur.aller('eleve/' + insId))));

        /* Actions */
        const actions = [];
        actions.push(el('button', {
          class: 'btn btn-fantome', text: 'Certificat de scolarité',
          onclick: () => EG.editerCertificat(insId)
        }));
        if (EG.peutEcrire()) actions.push(el('button', {
          class: 'btn btn-fantome',
          text: (eleve && eleve.signature_image) ? 'Modifier la signature de l’élève' : 'Signature de l’élève',
          onclick: () => EG.Docs.capturerSignature(eleve, () => Routeur.aller('eleve/' + insId), {
            table: 'eleves', titre: 'Signature de ' + nomEleve(eleve),
            mention: 'L’élève signe ici. Sa signature sera apposée sur sa fiche d’inscription au CEP et sur les pièces qui le concernent.'
          })
        }));
        actions.push(el('button', {
          class: 'btn btn-fantome', text: 'Carte scolaire', onclick: () => {
            const numeroCarte = 'CS-' + ins.niveau + '-' + ins.id.slice(0, 6).toUpperCase();
            Promise.all([DB.get('ecoles', ins.ecole_id), DB.all('territoires')])
              .then(([ecole, territoires]) => {
              const it = {}; territoires.forEach(t => { it[t.id] = t; });
              const circo = ecole ? it[ecole.territoire_id] : null;
              let dep = circo ? it[circo.parent_id] : null;
              while (dep && dep.type !== 'DEPARTEMENT' && dep.parent_id) dep = it[dep.parent_id];
              const contexte = {
                circonscription: circo ? String(circo.nom).replace(/^CS\s+/i, '') : '',
                departement: dep ? dep.nom : ''
              };
              EG.genererDocument('CARTE_SCOLAIRE', 'Carte scolaire — ' + nomEleve(eleve),
                '<div class="planche-cartes">' + EG.Docs.carteScolaire(
                  eleve || {}, ins, ecole, session().annee_code, numeroCarte, session().user)
                + EG.Docs.carteScolaireVerso(
                  eleve || {}, ins, ecole, session().annee_code, numeroCarte, contexte)
                + '</div>', { classe_id: ins.classe_id });
            });
          }
        }));
        if (EG.peutEcrire()) actions.push(el('button', {
          class: 'btn btn-fantome',
          text: (eleve && eleve.signature_parent) ? 'Modifier la signature du parent' : '\uE029 Signature du parent ou du tuteur',
          onclick: () => EG.Docs.capturerSignature(eleve, () => Routeur.aller('eleve/' + insId), {
            table: 'eleves', champ: 'signature_parent', titre: 'Signature du parent de ' + nomEleve(eleve),
            mention: 'Le parent ou le tuteur signe ici. Sa signature sera apposée sur la fiche d’inscription, la fiche du CEP et les bulletins de l’élève.'
          })
        }));
        actions.push(el('button', {
          class: 'btn btn-fantome', text: '\uE02B Fiche d’inscription + carte d’identité',
          onclick: () => EG.imprimerFicheInscription(eleve || {}, ins)
        }));
        if (ins.niveau === 'CM2') {
          actions.push(el('button', {
            class: 'btn btn-fantome', text: 'Fiche d’inscription au CEP',
            onclick: () => EG.editerFichesCEP(insId)
          }));
        }
        if (EG.peutEcrire() && ins.statut === 'ACTIF') {
          actions.push(el('button', { class: 'btn btn-fantome', text: 'Transférer vers une autre école', onclick: () => transferer(ins, eleve) }));
          actions.push(el('button', {
            class: 'btn btn-fantome', text: 'Déclarer un abandon', onclick: () => {
              U.confirmer('Déclarer un abandon', 'L’élève sortira des effectifs actifs. Un accompagnement est-il déjà engagé ?', () => {
                DB.put('inscriptions_eleves', Object.assign({}, ins, { statut: 'ABANDON' }))
                  .then(() => DB.put('statuts_scolarite', {
                    inscription_id: insId, statut: 'ABANDON', source: 'DIRECTEUR',
                    date_statut: new Date().toISOString().slice(0, 10)
                  }))
                  .then(() => DB.audit('ABANDON', 'inscriptions_eleves', insId))
                  .then(() => { U.toast('Abandon enregistré'); Routeur.aller('eleve/' + insId); EG.majSynchro(); });
              }, 'Déclarer');
            }
          }));
        }
        zone.appendChild(el('div', { class: 'barre-actions' }, actions));
      });
    });

    function transferer(ins, eleve) {
      DB.all('ecoles').then(ecoles => {
        const sel = el('select', {}, [el('option', { value: '', text: '— Choisir —' })]
          .concat(ecoles.filter(e => e.id !== ins.ecole_id).map(e => el('option', { value: e.id, text: e.nom }))));
        const motif = el('input', { type: 'text', placeholder: 'Déménagement de la famille, regroupement…' });
        U.modal('Transférer ' + nomEleve(eleve), el('div', { class: 'formulaire' }, [
          el('div', { class: 'champ' }, [el('label', { text: 'École de destination' }), sel]),
          el('div', { class: 'champ' }, [el('label', { text: 'Motif' }), motif]),
          el('p', { class: 'muet petit', text: 'Le dossier de l’élève reste unique : l’école de destination le retrouvera avec tout son historique.' })
        ]), f => [
          el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: f }),
          el('button', {
            class: 'btn btn-primaire', text: 'Enregistrer le transfert', onclick: () => {
              if (!sel.value) { U.toast('Choisissez l’école de destination', 'attention'); return; }
              DB.put('transferts_eleves', {
                eleve_id: ins.eleve_id, ecole_origine_id: ins.ecole_id, ecole_destination_id: sel.value,
                annee_scolaire_id: anneeCourante(), motif: motif.value || null, statut: 'DEMANDE'
              })
                .then(() => DB.put('inscriptions_eleves', Object.assign({}, ins, { statut: 'TRANSFERE' })))
                .then(() => DB.audit('TRANSFERT', 'inscriptions_eleves', ins.id, { destination: sel.value }))
                .then(() => { f(); U.toast('Transfert enregistré'); Routeur.aller('eleves'); EG.majSynchro(); });
            }
          })
        ]);
      });
    }
  });

  /* -------- Carte d'identité d'un élève — écran à part -------- */
  Routeur.definir('eleve-identite', function (racine, args) {
    const insId = args[0];
    const tete = el('div');
    const zone = el('div');
    racine.appendChild(tete); racine.appendChild(zone);

    DB.get('inscriptions_eleves', insId).then(ins => {
      if (!ins) { racine.appendChild(U.vide('Cette inscription est introuvable.')); return; }
      return DB.get('eleves', ins.eleve_id).then(eleve => {
        tete.appendChild(entete('\uE02B Carte d’identité', nomEleve(eleve),
          [retour('eleve/' + insId, 'Retour au dossier')]));

        const identite = el('dl', { class: 'fiche' });
        [
          ['Nom et prénoms', nomEleve(eleve)],
          ['Sexe', eleve ? U.libelle(eleve.sexe === 'F' ? 'Féminin' : 'Masculin') : '—'],
          ['Date de naissance', U.dateFR(eleve && eleve.date_naissance) + (eleve && eleve.date_naissance_precision === 'APPROXIMATIVE' ? ' (approximative)' : '')],
          ['Lieu de naissance', (eleve && eleve.lieu_naissance) || '—'],
          ['Acte de naissance', eleve && eleve.acte_naissance ? 'Oui' : 'Non'],
          ['NPI', (eleve && eleve.npi) || '—'],
          ['Matricule EDUCMaster', (eleve && eleve.educmaster_matricule) || 'Non attribué'],
          ['Type d’inscription', U.libelle(ins.type_inscription)],
          ['Redoublant', ins.redoublant ? 'Oui' : 'Non'],
          ['A suivi la maternelle', ins.a_suivi_maternelle ? 'Oui' : 'Non']
        ].forEach(([k, v]) => identite.appendChild(el('div', { class: 'fiche-ligne' }, [
          el('dt', { text: k }), el('dd', { text: v })
        ])));
        zone.appendChild(sousSection('Carte d’identité', identite,
          EG.peutEcrire() ? el('button', {
            class: 'btn btn-petit btn-fantome', text: 'Modifier',
            onclick: () => editer('eleves', eleve, () => Routeur.aller('eleve-identite/' + insId))
          }) : null));
      });
    });
  });

  /* =======================================================================
     PERSONNEL — liste et dossier de l'agent
     ======================================================================= */

  Routeur.definir('personnel', function (racine) {
    racine.appendChild(entete('Personnel', 'Dossier de carrière, affectations, formations et évaluation.',
      [EG.peutEcrire() ? el('button', { class: 'btn btn-primaire', text: 'Ajouter un agent', onclick: () => editer('personnels', {}, () => Routeur.aller('personnel')) }) : null,
        EG.session.ecole_id && EG.ListesClasse ? el('button', { class: 'btn btn-fantome', 'data-educmaster': 'agents', text: 'Excel EducMaster (agents)', title: 'Personnel en activité de l’école, modèle officiel « Mes agents »', onclick: () => EG.ListesClasse.exporterAgents(EG.session.ecole_id) }) : null].filter(Boolean)));
    const filtres = el('div', { class: 'barre-filtres' });
    const zone = el('div');
    racine.appendChild(filtres); racine.appendChild(zone);
    let recherche = '';
    filtres.appendChild(U.champRecherche('Rechercher un agent, un matricule', v => { recherche = v; dessiner(); }));

    function dessiner() {
      zone.textContent = '';
      Promise.all([charger('personnels'), DB.all('regles_retraite'), DB.all('ecoles')]).then(([agents, regles, ecoles]) => {
        const ie = indexer(ecoles);
        let lignes = agents.map(a => ({ a, ecole: ie[a.ecole_id] ? ie[a.ecole_id].nom : '—', p: R.previsionRetraite(a, regles) }));
        if (recherche) {
          const q = U.sansAccent(recherche);
          lignes = lignes.filter(x => U.sansAccent(x.a.nom + ' ' + x.a.prenoms + ' ' + (x.a.matricule || '')).indexOf(q) >= 0);
        }
        lignes.sort((x, y) => (x.a.nom || '').localeCompare(y.a.nom || '', 'fr'));

        const femmes = lignes.filter(x => x.a.sexe === 'F').length;
        zone.appendChild(grille([
          U.stat(U.nombre(lignes.length), 'Agents'),
          U.stat(U.nombre(femmes), 'Femmes'),
          U.stat(U.nombre(lignes.filter(x => x.p && x.p.mois_restants <= 12).length), 'Retraite sous 12 mois',
            lignes.filter(x => x.p && x.p.mois_restants <= 12).length ? 'attention' : '')
        ], 'grille-stats'));

        zone.appendChild(U.tableau([
          { titre: 'Agent', valeur: x => (x.a.nom || '').toUpperCase() + ' ' + (x.a.prenoms || '') },
          { titre: 'Matricule', valeur: x => x.a.matricule || '—' },
          { titre: 'Fonction', valeur: x => U.libelle(x.a.fonction) },
          { titre: 'Grade', valeur: x => (x.a.categorie || '—') + (x.a.echelon ? ' · éch. ' + x.a.echelon : '') },
          { titre: 'École', valeur: x => x.ecole },
          { titre: 'Retraite', valeur: x => x.p ? U.dateCourte(x.p.date_retraite) : '—' }
        ], lignes, {
          messageVide: 'Aucun agent enregistré.',
          onLigne: x => Routeur.aller('agent/' + x.a.id)
        }));
      });
    }
    dessiner();
  });

  Routeur.definir('agent', function (racine, args) {
    const id = args[0];
    const tete = el('div');
    const zone = el('div');
    racine.appendChild(tete); racine.appendChild(zone);
    const raf = () => Routeur.aller('agent/' + id);

    Promise.all([
      DB.get('personnels', id),
      DB.where('carrieres_personnel', { personnel_id: id }),
      DB.where('affectations_personnel', { personnel_id: id }),
      DB.where('diplomes_personnel', { personnel_id: id }),
      DB.where('formations_personnel', { personnel_id: id }),
      DB.where('participations_up', { personnel_id: id }),
      DB.where('evaluations_personnel', { personnel_id: id }),
      DB.where('visites', { personnel_visite_id: id }),
      DB.all('regles_retraite'), DB.all('ecoles'), DB.all('classes')
    ]).then(([a, carriere, affectations, diplomes, formations, up, evals, visites, regles, ecoles, classes]) => {
      if (!a) { racine.appendChild(U.vide('Cet agent est introuvable.')); return; }
      const ie = indexer(ecoles), ic = indexer(classes);
      const p = R.previsionRetraite(a, regles);

      tete.appendChild(entete((a.nom || '').toUpperCase() + ' ' + (a.prenoms || ''),
        U.libelle(a.fonction) + ' • ' + (a.categorie || '—') + (a.echelon ? ' échelon ' + a.echelon : '')
        + ' • ' + (ie[a.ecole_id] ? ie[a.ecole_id].nom : 'sans affectation'),
        [retour('personnel', 'Retour à la liste')]));

      zone.appendChild(grille([
        U.stat(R.age(a.date_naissance) === null ? '—' : R.age(a.date_naissance) + ' ans', 'Âge'),
        U.stat(p ? p.age_retraite + ' ans' : '—', 'Âge de départ'),
        U.stat(p ? U.dateCourte(p.date_retraite) : '—', 'Départ prévu', p && p.mois_restants <= 12 ? 'attention' : ''),
        U.stat(p ? (p.echue ? 'Atteint' : p.annees_restantes + ' an(s) ' + p.mois_complementaires + ' m') : '—', 'Échéance', p && p.echue ? 'attention' : '')
      ], 'grille-stats'));

      zone.appendChild(el('button', {
        class: 'carte carte-lien', onclick: () => Routeur.aller('agent-identite/' + id)
      }, [
        el('div', { class: 'ligne-entre' }, [
          el('h3', { class: 'carte-titre', text: '\uE02B Carte d’identité' }),
          el('span', { class: 'muet', 'aria-hidden': 'true', text: '›' })
        ]),
        el('p', { class: 'muet', text: 'État civil, contact, situation…' })
      ]));

      if (EG.peutVoirModule('carrieres')) zone.appendChild(el('button', { class: 'carte carte-lien', onclick: () => Routeur.aller('carriere/' + id) }, [
        el('div', { class: 'ligne-entre' }, [el('h3', { class: 'carte-titre', text: '\uE016 Dossier de carrière' }), el('span', { class: 'muet', 'aria-hidden': 'true', text: '›' })]),
        el('p', { class: 'muet', text: 'Frise des actes, avancement d’échelon, projection, fiche de carrière signée…' })]));

      zone.appendChild(sousSection('Carrière', U.tableau([
        { titre: 'Date d’effet', valeur: c => U.dateCourte(c.date_effet) },
        { titre: 'Statut', valeur: c => U.libelle(c.statut_code) },
        { titre: 'Grade', valeur: c => c.grade || '—' },
        { titre: 'Catégorie', valeur: c => (c.categorie || '—') + (c.echelon ? ' · éch. ' + c.echelon : '') },
        { titre: 'Acte', valeur: c => c.reference_acte || '—' }
      ], carriere.sort((x, y) => String(y.date_effet).localeCompare(String(x.date_effet))),
        { messageVide: 'Aucun acte de carrière enregistré.' }),
        boutonAjout('Ajouter un acte', 'carrieres_personnel', { personnel_id: id, categorie: a.categorie, echelon: a.echelon }, raf)));

      zone.appendChild(sousSection('Affectations', U.tableau([
        { titre: 'Début', valeur: x => U.dateCourte(x.date_debut) },
        { titre: 'Fin', valeur: x => x.date_fin ? U.dateCourte(x.date_fin) : 'En cours' },
        { titre: 'École', valeur: x => ie[x.ecole_id] ? ie[x.ecole_id].nom : '—' },
        { titre: 'Classe', valeur: x => ic[x.classe_id] ? (ic[x.classe_id].libelle || ic[x.classe_id].code) : '—' },
        { titre: 'Fonction', valeur: x => U.libelle(x.fonction) }
      ], affectations.sort((x, y) => String(y.date_debut).localeCompare(String(x.date_debut))),
        { messageVide: 'Aucune affectation enregistrée.' }),
        boutonAjout('Affecter', 'affectations_personnel', { personnel_id: id, ecole_id: a.ecole_id, fonction: a.fonction }, raf)));

      zone.appendChild(sousSection('Diplômes', U.tableau([
        { titre: 'Libellé', valeur: d => d.libelle },
        { titre: 'Type', valeur: d => U.libelle(d.type) },
        { titre: 'Année', valeur: d => d.annee_obtention || '—' }
      ], diplomes, { messageVide: 'Aucun diplôme enregistré.' }),
        boutonAjout('Ajouter', 'diplomes_personnel', { personnel_id: id }, raf)));

      zone.appendChild(sousSection('Formations et unités pédagogiques', el('div', {}, [
        U.tableau([
          { titre: 'Intitulé', valeur: f => f.intitule || '—' },
          { titre: 'Type', valeur: f => U.libelle(f.type) },
          { titre: 'Période', valeur: f => U.dateCourte(f.date_debut) + (f.date_fin ? ' → ' + U.dateCourte(f.date_fin) : '') },
          { titre: 'Organisme', valeur: f => f.organisme || '—' }
        ], formations, { messageVide: 'Aucune formation enregistrée.' }),
        up.length ? el('p', { class: 'muet', text: 'Unités pédagogiques : ' + up[0].nombre_participations + ' participation(s) sur ' + up[0].nombre_up_total + ' organisée(s).' }) : null
      ]), boutonAjout('Ajouter une formation', 'formations_personnel', { personnel_id: id }, raf)));

      zone.appendChild(sousSection('Visites reçues', U.tableau([
        { titre: 'Date', valeur: v => U.dateCourte(v.date_visite) },
        { titre: 'Type', valeur: v => U.libelle(v.type_code) },
        { titre: 'Visiteur', valeur: v => v.visiteur_label || '—' },
        { titre: 'Statut', valeur: v => U.statut(v.statut) }
      ], visites, { messageVide: 'Aucune visite enregistrée.', onLigne: v => Routeur.aller('visite/' + v.id) })));

      zone.appendChild(sousSection('Évaluation annuelle', U.tableau([
        { titre: 'Note proposée', valeur: e => e.note_proposee === null || e.note_proposee === undefined ? '—' : e.note_proposee },
        { titre: 'Note hiérarchique', valeur: e => e.note_hierarchique === null || e.note_hierarchique === undefined ? '—' : e.note_hierarchique },
        { titre: 'Note finale', valeur: e => e.note_finale === null || e.note_finale === undefined ? '—' : e.note_finale },
        { titre: 'Statut', valeur: e => U.statut(e.statut) }
      ], evals, { messageVide: 'Aucune évaluation enregistrée pour cet agent.' }),
        boutonAjout('Évaluer', 'evaluations_personnel', { personnel_id: id, annee_scolaire_id: anneeCourante(), statut: 'BROUILLON' }, raf)));

      if (p) {
        zone.appendChild(el('div', { class: 'barre-actions' }, [
          el('button', {
            class: 'btn btn-fantome', text: 'Éditer la fiche de carrière', onclick: () => {
              const lignes = carriere.map(c => '<tr><td>' + U.dateCourte(c.date_effet) + '</td><td>' + (c.grade || '—')
                + '</td><td>' + (c.categorie || '—') + '</td><td>' + (c.echelon || '—') + '</td><td>' + (c.reference_acte || '—') + '</td></tr>').join('');
              EG.genererDocument('PV_VISITE', 'Fiche de carrière — ' + a.nom,
                '<h2>Fiche de carrière</h2><p><strong>' + (a.nom || '').toUpperCase() + ' ' + (a.prenoms || '')
                + '</strong> — matricule ' + (a.matricule || '—') + '<br>Né(e) le ' + U.dateCourte(a.date_naissance)
                + ' • départ à la retraite prévu le ' + U.dateCourte(p.date_retraite) + ' (' + p.age_retraite + ' ans)</p>'
                + '<table><thead><tr><th>Date d’effet</th><th>Grade</th><th>Catégorie</th><th>Échelon</th><th>Acte</th></tr></thead><tbody>'
                + (lignes || '<tr><td colspan="5">Aucun acte enregistré</td></tr>') + '</tbody></table>', { acteurs: [{ personne: a, mention: 'L’agent' }] });
            }
          }),
          el('button', { class: 'btn btn-fantome', text: 'Fiche d’évaluation', onclick: () => EG.editerFicheAgent(id) }),
          EG.peutEcrire() ? el('button', {
            class: 'btn btn-fantome',
            text: a.signature_image ? 'Modifier la signature de l’agent' : 'Signature de l’agent',
            onclick: () => EG.Docs.capturerSignature(a, raf, {
              table: 'personnels', titre: 'Signature de ' + (a.nom || '') + ' ' + (a.prenoms || ''),
              mention: 'L’enseignant signe ici. Sa signature figurera au pied des documents de sa classe et sur sa fiche d’évaluation.'
            })
          }) : null,
          el('button', { class: 'btn btn-fantome', text: 'Prévisions de retraite', onclick: () => Routeur.aller('retraite') })
        ]));
      }
    });
  });

  /* -------- Carte d'identité d'un agent — écran à part -------- */
  Routeur.definir('agent-identite', function (racine, args) {
    const id = args[0];
    const tete = el('div');
    const zone = el('div');
    racine.appendChild(tete); racine.appendChild(zone);
    const raf = () => Routeur.aller('agent-identite/' + id);

    DB.get('personnels', id).then(a => {
      if (!a) { racine.appendChild(U.vide('Cet agent est introuvable.')); return; }
      tete.appendChild(entete('\uE02B Carte d’identité', (a.nom || '').toUpperCase() + ' ' + (a.prenoms || ''),
        [retour('agent/' + id, 'Retour au dossier')]));

      const identite = el('dl', { class: 'fiche' });
      [
        ['Matricule', a.matricule || '—'],
        ['Sexe', a.sexe === 'F' ? 'Féminin' : (a.sexe === 'M' ? 'Masculin' : '—')],
        ['Date de naissance', U.dateFR(a.date_naissance)],
        ['Lieu de naissance', a.lieu_naissance || '—'],
        ['Téléphone', a.telephone || '—'],
        ['Adresse électronique', a.email || '—'],
        ['Première prise de service', U.dateFR(a.date_premiere_prise_service)],
        ['Personne handicapée', a.ph ? 'Oui' : 'Non'],
        ['En activité', a.actif === false ? 'Non' : 'Oui']
      ].forEach(([k, v]) => identite.appendChild(el('div', { class: 'fiche-ligne' }, [el('dt', { text: k }), el('dd', { text: v })])));
      zone.appendChild(sousSection('Carte d’identité', identite,
        EG.peutEcrire() ? el('button', { class: 'btn btn-petit btn-fantome', text: 'Modifier', onclick: () => editer('personnels', a, raf) }) : null));
    });
  });

  /* =======================================================================
     PATRIMOINE — locaux, mobilier, équipements, ressources, services
     ======================================================================= */

  Routeur.definir('patrimoine', function (racine) {
    racine.appendChild(entete('Patrimoine de l’école', 'Locaux, mobilier, matériel didactique et services.',
      [el('button', { class: 'btn btn-fantome', text: 'Carte d’identité de l’école', onclick: () => Routeur.aller('carte-ecole') })]));
    const tete = el('div');
    const zone = el('div');
    racine.appendChild(tete); racine.appendChild(zone);
    const raf = () => Routeur.aller('patrimoine');

    Promise.all([
      charger('infrastructures'), DB.all('accessibilite_infrastructure'),
      charger('inventaires_mobilier', { annee_scolaire_id: anneeCourante() }),
      charger('inventaires_equipements', { annee_scolaire_id: anneeCourante() }),
      charger('ressources_pedagogiques', { annee_scolaire_id: anneeCourante() }),
      charger('services_ecole', { annee_scolaire_id: anneeCourante() }),
      inscriptionsEnrichies(),
      charger('mouvements_mobilier')
    ]).then(([infra, acces, mobilier, equipements, ressources, services, ins, mouvements]) => {
      const ia = {}; acces.forEach(x => { ia[x.infrastructure_id] = x; });
      const salles = infra.filter(x => x.type_local === 'SALLE_CLASSE');
      const places = R.capaciteMobilier(mobilier);
      const deficit = Math.max(0, ins.length - places);
      const degradees = infra.filter(x => x.etat_murs === 'MAUVAIS' || x.etat_toit === 'MAUVAIS').length;
      const accessibles = infra.filter(x => ia[x.id] && ia[x.id].rampe).length;
      const s = services[0];

      zone.appendChild(grille([
        U.stat(U.nombre(salles.length), 'Salles de classe'),
        U.stat(U.nombre(places), 'Places assises'),
        U.stat(U.nombre(deficit), 'Places manquantes', deficit ? 'attention' : ''),
        U.stat(U.nombre(degradees), 'Locaux dégradés', degradees ? 'attention' : ''),
        U.stat(U.nombre(accessibles) + ' / ' + infra.length, 'Locaux avec rampe')
      ], 'grille-stats'));

      if (deficit) {
        zone.appendChild(U.carte('Ce que dit le déficit', el('div', {}, [
          el('p', { text: ins.length + ' élèves pour ' + places + ' places assises : il manque ' + deficit + ' place(s), soit environ ' + Math.ceil(deficit / 2) + ' table(s)-banc(s).' }),
          U.barre(Math.min(100, Math.round(places / (ins.length || 1) * 100))),
          el('p', { class: 'muet petit', text: 'Le calcul retient deux places par table-banc en bon état, une par chaise ou natte.' })
        ])));
      }

      /* Locaux */
      zone.appendChild(sousSection('Locaux', U.tableau([
        { titre: 'Local', valeur: x => x.designation || x.code_local || '—' },
        { titre: 'Type', valeur: x => U.libelle(x.type_local) },
        { titre: 'Murs', valeur: x => U.statut(x.etat_murs) },
        { titre: 'Toit', valeur: x => U.statut(x.etat_toit) },
        { titre: 'Accessibilité', valeur: x => ia[x.id] && ia[x.id].rampe ? U.badge('Rampe', 'ok') : U.badge('Non aménagé', 'neutre') }
      ], infra, {
        messageVide: 'Aucun local enregistré. Commencez par inventorier les salles de classe.',
        onLigne: x => detailLocal(x, ia[x.id], raf)
      }), boutonAjout('Ajouter un local', 'infrastructures', { ecole_id: ecoleCourante() }, raf)));

      /* Mobilier */
      const parType = {};
      mobilier.forEach(m => {
        const t = parType[m.type_mobilier] = parType[m.type_mobilier] || { q: 0, bon: 0, rep: 0, hs: 0 };
        t.q += m.quantite || 0; t.bon += m.bon_etat || 0; t.rep += m.a_reparer || 0; t.hs += m.hors_service || 0;
      });
      zone.appendChild(sousSection('Mobilier', el('div', {}, [
        U.tableau([
          { titre: 'Type', valeur: t => U.libelle(t) },
          { titre: 'Quantité', valeur: t => U.nombre(parType[t].q) },
          { titre: 'Bon état', valeur: t => U.nombre(parType[t].bon) },
          { titre: 'À réparer', valeur: t => U.nombre(parType[t].rep) },
          { titre: 'Hors service', valeur: t => U.nombre(parType[t].hs) }
        ], Object.keys(parType), { messageVide: 'Aucun mobilier inventorié.' }),
        mouvements.length ? el('p', { class: 'muet petit', text: mouvements.length + ' mouvement(s) enregistré(s) cette année.' }) : null
      ]), el('div', { class: 'module-liens' }, [
        boutonAjout('Inventorier', 'inventaires_mobilier', { ecole_id: ecoleCourante(), annee_scolaire_id: anneeCourante() }, raf),
        boutonAjout('Mouvement', 'mouvements_mobilier', { ecole_id: ecoleCourante(), date_mouvement: new Date().toISOString().slice(0, 10) }, raf)
      ])));

      /* Matériel didactique */
      zone.appendChild(sousSection('Équipements et matériel didactique', el('div', {}, [
        U.tableau([
          { titre: 'Équipement', valeur: e => e.code_equipement },
          { titre: 'Catégorie', valeur: e => U.libelle(e.categorie) },
          { titre: 'Quantité', valeur: e => U.nombre(e.quantite) },
          { titre: 'Bon état', valeur: e => U.nombre(e.bon_etat) },
          { titre: 'Adapté', valeur: e => e.adapte ? 'Oui' : 'Non' }
        ], equipements, { messageVide: 'Aucun équipement inventorié.' }),
        U.tableau([
          { titre: 'Ressource', valeur: r => r.code_ressource },
          { titre: 'Catégorie', valeur: r => U.libelle(r.categorie) },
          { titre: 'Cours', valeur: r => r.cours || 'Tous' },
          { titre: 'Quantité', valeur: r => U.nombre(r.quantite) },
          { titre: 'Adaptée', valeur: r => r.adapte_handicap ? 'Oui' : 'Non' }
        ], ressources, { messageVide: 'Aucune ressource pédagogique inventoriée.' })
      ]), el('div', { class: 'module-liens' }, [
        boutonAjout('Équipement', 'inventaires_equipements', { ecole_id: ecoleCourante(), annee_scolaire_id: anneeCourante() }, raf),
        boutonAjout('Ressource', 'ressources_pedagogiques', { ecole_id: ecoleCourante(), annee_scolaire_id: anneeCourante() }, raf)
      ])));

      /* Services */
      const listeServices = s ? [
        ['Eau potable', s.eau_potable], ['Forage', s.eau_forage], ['Puits', s.eau_puits],
        ['Électricité', s.electricite], ['Énergie solaire', s.solaire], ['Cantine', s.cantine],
        ['Latrines', s.latrines], ['Latrines séparées filles/garçons', s.latrines_separees_fg],
        ['Latrines accessibles', s.latrines_handicap], ['Lavage des mains', s.lavage_mains]
      ] : [];
      zone.appendChild(sousSection('Services', s
        ? el('div', {}, [
          U.tableau([
            { titre: 'Service', valeur: x => x[0] },
            { titre: 'Disponible', valeur: x => U.badge(x[1] ? 'Oui' : 'Non', x[1] ? 'ok' : 'danger') }
          ], listeServices),
          el('p', { class: 'muet', text: (s.nb_blocs_latrines || 0) + ' bloc(s) et ' + (s.nb_cabines_latrines || 0) + ' cabine(s) de latrines pour ' + ins.length + ' élèves.' })
        ])
        : U.vide('La fiche des services n’est pas encore renseignée.',
          boutonAjout('Renseigner les services', 'services_ecole', { ecole_id: ecoleCourante(), annee_scolaire_id: anneeCourante() }, raf)),
        s && EG.peutEcrire() ? el('button', { class: 'btn btn-petit btn-fantome', text: 'Modifier', onclick: () => editer('services_ecole', s, raf) }) : null));

      zone.appendChild(el('div', { class: 'barre-actions' }, [
        el('button', {
          class: 'btn btn-fantome', text: 'Éditer l’état du patrimoine', onclick: () => {
            const lignes = infra.map(x => '<tr><td>' + (x.designation || x.code_local) + '</td><td>' + U.libelle(x.type_local)
              + '</td><td>' + U.libelle(x.etat_murs) + '</td><td>' + U.libelle(x.etat_toit) + '</td></tr>').join('');
            EG.genererDocument('ETAT_BUDGET', 'État du patrimoine — ' + session().ecole_nom,
              '<h2>État du patrimoine</h2><p>' + session().ecole_nom + ' — ' + session().annee_code + '</p>'
              + '<p>' + salles.length + ' salle(s) de classe • ' + places + ' place(s) assise(s) • '
              + deficit + ' place(s) manquante(s)</p>'
              + '<table><thead><tr><th>Local</th><th>Type</th><th>Murs</th><th>Toit</th></tr></thead><tbody>'
              + (lignes || '<tr><td colspan="4">Aucun local</td></tr>') + '</tbody></table>');
          }
        })
      ]));
    });

    function detailLocal(x, accessibilite, raf) {
      const corps = el('dl', { class: 'fiche' });
      [
        ['Type', U.libelle(x.type_local)],
        ['Mise en service', x.annee_mise_service || '—'],
        ['Superficie', x.superficie_m2 ? x.superficie_m2 + ' m²' : '—'],
        ['Murs', U.libelle(x.nature_murs) + ' — ' + U.libelle(x.etat_murs)],
        ['Toit', U.libelle(x.nature_toit) + ' — ' + U.libelle(x.etat_toit)],
        ['Portes', U.libelle(x.etat_portes)],
        ['Fenêtres', U.libelle(x.etat_fenetres)],
        ['Financeur', x.financeur || '—'],
        ['Rampe d’accès', accessibilite && accessibilite.rampe ? 'Oui' : 'Non'],
        ['Circulation en fauteuil', accessibilite && accessibilite.circulation_fauteuil ? 'Oui' : 'Non'],
        ['Observations', x.observations || '—']
      ].forEach(([k, v]) => corps.appendChild(el('div', { class: 'fiche-ligne' }, [el('dt', { text: k }), el('dd', { text: String(v) })])));

      U.modal(x.designation || x.code_local || 'Local', corps, f => {
        const btns = [el('button', { class: 'btn btn-fantome', text: 'Fermer', onclick: f })];
        if (EG.peutEcrire()) {
          btns.push(el('button', {
            class: 'btn btn-fantome', text: 'Accessibilité',
            onclick: () => { f(); editer('accessibilite_infrastructure', accessibilite || { infrastructure_id: x.id }, raf); }
          }));
          btns.push(el('button', {
            class: 'btn btn-fantome', text: 'Inspecter',
            onclick: () => { f(); editer('inspections_infrastructure', { infrastructure_id: x.id, annee_scolaire_id: anneeCourante(), inspecte_at: new Date().toISOString().slice(0, 10) }, raf); }
          }));
          btns.push(el('button', { class: 'btn btn-primaire', text: 'Modifier', onclick: () => { f(); editer('infrastructures', x, raf); } }));
        }
        return btns;
      });
    }
  });

  /* =======================================================================
     VISITES — conduite, observations, recommandations, suivi
     ======================================================================= */

  Routeur.definir('visites', function (racine) {
    racine.appendChild(entete('Visites et suivi pédagogique', 'De l’observation à la recommandation, puis à sa vérification.',
      EG.peutEcrire() ? [el('button', {
        class: 'btn btn-primaire', text: 'Conduire une visite',
        onclick: () => editer('visites', {
          ecole_id: ecoleCourante(), annee_scolaire_id: anneeCourante(),
          visiteur_label: (session().user.prenoms || '') + ' ' + session().user.nom,
          date_visite: new Date().toISOString().slice(0, 10), statut: 'EN_COURS'
        }, () => Routeur.aller('visites'))
      })] : null));
    const zone = el('div');
    racine.appendChild(zone);

    Promise.all([charger('visites'), DB.all('recommandations'), DB.all('personnels'), charger('plans_amelioration')])
      .then(([visites, recos, agents, plans]) => {
        const ia = indexer(agents);
        const enRetard = recos.filter(r => r.echeance && r.echeance < new Date().toISOString().slice(0, 10)
          && ['REALISEE', 'VALIDEE', 'NON_APPLICABLE'].indexOf(r.statut) < 0);

        zone.appendChild(grille([
          U.stat(U.nombre(visites.length), 'Visites'),
          U.stat(U.nombre(recos.filter(r => r.statut === 'A_FAIRE' || r.statut === 'EN_COURS').length), 'Recommandations en cours'),
          U.stat(U.nombre(enRetard.length), 'Échéances dépassées', enRetard.length ? 'attention' : ''),
          U.stat(U.nombre(plans.length), 'Plans d’amélioration')
        ], 'grille-stats'));

        zone.appendChild(sousSection('Visites', U.tableau([
          { titre: 'Date', valeur: v => U.dateCourte(v.date_visite) },
          { titre: 'Type', valeur: v => U.libelle(v.type_code) },
          { titre: 'Agent visité', valeur: v => ia[v.personnel_visite_id] ? U.titreDe('personnels', ia[v.personnel_visite_id]) : '—' },
          { titre: 'Visiteur', valeur: v => v.visiteur_label || '—' },
          { titre: 'Statut', valeur: v => U.statut(v.statut) }
        ], visites, {
          messageVide: 'Aucune visite enregistrée.',
          onLigne: v => Routeur.aller('visite/' + v.id)
        })));

        if (enRetard.length) {
          zone.appendChild(sousSection('Recommandations en retard', U.tableau([
            { titre: 'Recommandation', valeur: r => r.texte },
            { titre: 'Priorité', valeur: r => U.statut(r.priorite) },
            { titre: 'Échéance', valeur: r => U.dateCourte(r.echeance) },
            { titre: 'Statut', valeur: r => U.statut(r.statut) }
          ], enRetard, { onLigne: r => Routeur.aller('visite/' + r.visite_id) })));
        }

        zone.appendChild(sousSection('Plans d’amélioration', U.tableau([
          { titre: 'Titre', valeur: p => p.titre },
          { titre: 'Période', valeur: p => U.dateCourte(p.date_debut) + (p.date_fin_prevue ? ' → ' + U.dateCourte(p.date_fin_prevue) : '') },
          { titre: 'Statut', valeur: p => U.statut(p.statut) }
        ], plans, { messageVide: 'Aucun plan d’amélioration ouvert.', onLigne: p => Routeur.aller('plan/' + p.id) }),
          boutonAjout('Ouvrir un plan', 'plans_amelioration', {
            ecole_id: ecoleCourante(), annee_scolaire_id: anneeCourante(),
            date_debut: new Date().toISOString().slice(0, 10), statut: 'BROUILLON'
          }, () => Routeur.aller('visites'))));
      });
  });

  Routeur.definir('visite', function (racine, args) {
    const id = args[0];
    const tete = el('div');
    const zone = el('div');
    racine.appendChild(tete); racine.appendChild(zone);
    const raf = () => Routeur.aller('visite/' + id);

    Promise.all([
      DB.get('visites', id),
      DB.where('observations_visites', { visite_id: id }),
      DB.where('recommandations', { visite_id: id }),
      DB.all('personnels'), DB.all('classes')
    ]).then(([v, observations, recos, agents, classes]) => {
      if (!v) { racine.appendChild(U.vide('Cette visite est introuvable.')); return; }
      const ia = indexer(agents), ic = indexer(classes);
      const agent = ia[v.personnel_visite_id];

      tete.appendChild(entete(U.libelle(v.type_code) + ' du ' + U.dateFR(v.date_visite),
        (agent ? U.titreDe('personnels', agent) : 'École') + (ic[v.classe_id] ? ' — ' + (ic[v.classe_id].libelle || ic[v.classe_id].code) : '')
        + ' • visiteur : ' + (v.visiteur_label || '—'),
        [retour('visites', 'Retour aux visites')]));

      zone.appendChild(el('div', { class: 'ligne-entre' }, [
        el('p', { class: 'muet', text: v.objet || 'Aucun objet précisé.' }), U.statut(v.statut)
      ]));

      zone.appendChild(sousSection('Observations', U.tableau([
        { titre: 'Niveau', valeur: o => U.statut(o.niveau) },
        { titre: 'Catégorie', valeur: o => o.categorie || '—' },
        { titre: 'Observation', valeur: o => o.observation }
      ], observations, { messageVide: 'Aucune observation consignée.' }),
        boutonAjout('Consigner', 'observations_visites', { visite_id: id }, raf)));

      zone.appendChild(sousSection('Recommandations', U.tableau([
        { titre: 'Recommandation', valeur: r => r.texte },
        { titre: 'Priorité', valeur: r => U.statut(r.priorite) },
        { titre: 'Échéance', valeur: r => U.dateCourte(r.echeance) },
        { titre: 'Statut', valeur: r => U.statut(r.statut) },
        {
          titre: '', valeur: r => EG.peutEcrire() && ['REALISEE', 'VALIDEE'].indexOf(r.statut) < 0
            ? el('button', {
              class: 'btn btn-petit btn-fantome', text: 'Marquer réalisée', onclick: e => {
                e.stopPropagation();
                DB.put('recommandations', Object.assign({}, r, { statut: 'REALISEE' }))
                  .then(() => DB.audit('RECOMMANDATION_REALISEE', 'recommandations', r.id))
                  .then(() => { U.toast('Recommandation marquée réalisée'); raf(); EG.majSynchro(); });
              }
            }) : ''
        }
      ], recos, { messageVide: 'Aucune recommandation formulée.' }),
        boutonAjout('Recommander', 'recommandations', { visite_id: id, priorite: 'NORMALE', statut: 'A_FAIRE' }, raf)));

      const actions = [];
      if (EG.peutEcrire() && v.statut !== 'CLOTUREE') {
        actions.push(el('button', { class: 'btn btn-fantome', text: 'Modifier la visite', onclick: () => editer('visites', v, raf) }));
        actions.push(el('button', {
          class: 'btn btn-primaire', text: v.statut === 'VALIDEE' ? 'Clôturer' : 'Valider la visite',
          onclick: () => {
            const suivant = v.statut === 'VALIDEE' ? 'CLOTUREE' : 'VALIDEE';
            DB.put('visites', Object.assign({}, v, { statut: suivant }))
              .then(() => DB.audit('STATUT_VISITE', 'visites', id, { statut: suivant }))
              .then(() => { U.toast('Visite ' + U.libelle(suivant).toLowerCase()); raf(); EG.majSynchro(); });
          }
        }));
      }
      actions.push(el('button', {
        class: 'btn btn-fantome', text: 'Éditer le procès-verbal', onclick: () => {
          const obs = observations.map(o => '<li><strong>' + U.libelle(o.niveau) + '</strong> — ' + o.observation + '</li>').join('');
          const rec = recos.map(r => '<tr><td>' + r.texte + '</td><td>' + U.libelle(r.priorite) + '</td><td>'
            + U.dateCourte(r.echeance) + '</td></tr>').join('');
          EG.genererDocument('PV_VISITE', 'PV de visite — ' + U.dateCourte(v.date_visite),
            '<h2>Procès-verbal de visite</h2>'
            + '<p>' + session().ecole_nom + ' — ' + U.libelle(v.type_code) + ' du ' + U.dateFR(v.date_visite) + '<br>'
            + 'Agent visité : ' + (agent ? U.titreDe('personnels', agent) : '—') + '<br>'
            + 'Visiteur : ' + (v.visiteur_label || '—') + '</p>'
            + '<p><strong>Objet :</strong> ' + (v.objet || '—') + '</p>'
            + '<h3>Observations</h3><ul>' + (obs || '<li>Aucune</li>') + '</ul>'
            + '<h3>Recommandations</h3><table><thead><tr><th>Recommandation</th><th>Priorité</th><th>Échéance</th></tr></thead><tbody>'
            + (rec || '<tr><td colspan="3">Aucune</td></tr>') + '</tbody></table>'
            + '<p><strong>Conclusion :</strong> ' + (v.conclusion || '—') + '</p>', { acteurs: [agent ? { personne: agent, mention: 'L’agent visité' } : null, { personne: (session().user.role === 'CONSEILLER_PEDAGOGIQUE' || session().user.role === 'CS') ? session().user : { nom: v.visiteur_label || '' }, mention: 'Le visiteur' }] });
        }
      }));
      zone.appendChild(el('div', { class: 'barre-actions' }, actions));
    });
  });

  Routeur.definir('plan', function (racine, args) {
    const id = args[0];
    const tete = el('div');
    const zone = el('div');
    racine.appendChild(tete); racine.appendChild(zone);
    const raf = () => Routeur.aller('plan/' + id);

    Promise.all([DB.get('plans_amelioration', id), DB.where('actions_plan_amelioration', { plan_id: id })])
      .then(([p, actions]) => {
        if (!p) { racine.appendChild(U.vide('Ce plan est introuvable.')); return; }
        tete.appendChild(entete(p.titre,
          U.dateFR(p.date_debut) + (p.date_fin_prevue ? ' → ' + U.dateFR(p.date_fin_prevue) : '') + ' • ' + U.libelle(p.statut),
          [retour('visites', 'Retour aux visites')]));

        const faites = actions.filter(a => a.statut === 'REALISEE').length;
        zone.appendChild(U.carte('Avancement', el('div', {}, [
          U.barre(actions.length ? Math.round(faites / actions.length * 100) : 0),
          el('p', { class: 'muet', text: faites + ' action(s) réalisée(s) sur ' + actions.length + '.' })
        ])));

        zone.appendChild(sousSection('Actions', U.tableau([
          { titre: 'Action', valeur: a => a.titre },
          { titre: 'Responsable', valeur: a => a.responsable_label || '—' },
          { titre: 'Échéance', valeur: a => U.dateCourte(a.echeance) },
          { titre: 'Statut', valeur: a => U.statut(a.statut) }
        ], actions, { messageVide: 'Aucune action inscrite au plan.' }),
          boutonAjout('Ajouter une action', 'actions_plan_amelioration', { plan_id: id, statut: 'A_FAIRE' }, raf)));

        if (EG.peutEcrire()) {
          zone.appendChild(el('div', { class: 'barre-actions' }, [
            el('button', { class: 'btn btn-fantome', text: 'Modifier le plan', onclick: () => editer('plans_amelioration', p, raf) })
          ]));
        }
      });
  });

  /* =======================================================================
     GOUVERNANCE — APE, AME, réunions, communication des résultats
     ======================================================================= */

  Routeur.definir('gouvernance', function (racine) {
    racine.appendChild(entete('Gestion participative', 'Instances de l’école, réunions et information des familles.'));
    const tete = el('div');
    const zone = el('div');
    racine.appendChild(tete); racine.appendChild(zone);
    const raf = () => Routeur.aller('gouvernance');

    Promise.all([
      charger('gestion_participative', { annee_scolaire_id: anneeCourante() }),
      charger('reunions_gestion', { annee_scolaire_id: anneeCourante() }),
      charger('communication_resultats', { annee_scolaire_id: anneeCourante() })
    ]).then(([fiches, reunions, comms]) => {
      const g = fiches[0], c = comms[0];

      if (!g) {
        zone.appendChild(U.vide('La fiche de gestion participative n’est pas encore renseignée pour cette année.',
          boutonAjout('Renseigner la fiche', 'gestion_participative', { ecole_id: ecoleCourante(), annee_scolaire_id: anneeCourante() }, raf)));
      } else {
        const instances = [
          ['APE constituée', g.ape_existe], ['APE fonctionnelle', g.ape_fonctionnel],
          ['AME constituée', g.ame_existe], ['Comité de direction', g.comite_direction],
          ['Conseil des maîtres', g.conseil_maitres], ['Comité de santé', g.comite_sante],
          ['Projet école verte', g.projet_ecole_verte], ['Projet de développement inclusif', g.projet_developpement_inclusif]
        ];
        const actives = instances.filter(x => x[1]).length;
        zone.appendChild(grille([
          U.stat(actives + ' / ' + instances.length, 'Instances en place'),
          U.stat(U.nombre(g.nombre_reunions_ape || 0), 'Réunions de l’APE'),
          U.stat(U.nombre(g.nombre_ag || 0), 'Assemblées générales'),
          U.stat(U.nombre(reunions.length), 'Réunions consignées')
        ], 'grille-stats'));

        zone.appendChild(sousSection('Instances', U.tableau([
          { titre: 'Instance', valeur: x => x[0] },
          { titre: 'État', valeur: x => U.badge(x[1] ? 'En place' : 'Absente', x[1] ? 'ok' : 'attention') }
        ], instances), EG.peutEcrire()
          ? el('button', { class: 'btn btn-petit btn-fantome', text: 'Modifier', onclick: () => editer('gestion_participative', g, raf) })
          : null));
      }

      zone.appendChild(sousSection('Réunions', U.tableau([
        { titre: 'Date', valeur: r => U.dateCourte(r.date_reunion) },
        { titre: 'Type', valeur: r => U.libelle(r.type) },
        { titre: 'Objet', valeur: r => r.objet || '—' },
        { titre: 'Participants', valeur: r => U.nombre(r.nombre_participants) },
        { titre: 'Sujets', valeur: r => [r.budget_aborde ? 'budget' : null, r.resultats_abordes ? 'résultats' : null].filter(Boolean).join(', ') || '—' }
      ], reunions.sort((a, b) => String(b.date_reunion).localeCompare(String(a.date_reunion))),
        { messageVide: 'Aucune réunion consignée cette année.' }),
        boutonAjout('Consigner une réunion', 'reunions_gestion', {
          ecole_id: ecoleCourante(), annee_scolaire_id: anneeCourante(),
          date_reunion: new Date().toISOString().slice(0, 10)
        }, raf)));

      const moyens = c ? [
        ['Carnet de correspondance', c.carnet_correspondance], ['Assemblée générale', c.assemblee_generale],
        ['Réunion de l’APE', c.reunion_ape], ['Échange direct avec le parent', c.echange_parent],
        ['Autre moyen', c.autre]
      ] : [];
      zone.appendChild(sousSection('Communication des résultats aux familles', c
        ? U.tableau([
          { titre: 'Moyen', valeur: x => x[0] },
          { titre: 'Utilisé', valeur: x => U.badge(x[1] ? 'Oui' : 'Non', x[1] ? 'ok' : 'neutre') }
        ], moyens)
        : U.vide('Les moyens de communication ne sont pas encore renseignés.',
          boutonAjout('Renseigner', 'communication_resultats', { ecole_id: ecoleCourante(), annee_scolaire_id: anneeCourante() }, raf)),
        c && EG.peutEcrire() ? el('button', { class: 'btn btn-petit btn-fantome', text: 'Modifier', onclick: () => editer('communication_resultats', c, raf) }) : null));
    });
  });
})(window);
