/* ÉduGestion Pro — certificats administratifs du personnel et cachet de l'école. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const charger = E.charger, editer = E.editer, indexer = E.indexer, entete = E.entete;

  const session = () => EG.session;
  const ecoleCourante = () => EG.session.ecole_id || null;
  const anneeCourante = () => EG.session.annee_id || null;
  const grille = (enfants, classe) => el('div', { class: 'grille ' + (classe || '') }, enfants);
  const iso = d => d.toISOString().slice(0, 10);
  const nomAgent = a => a ? ((a.nom || '').toUpperCase() + ' ' + (a.prenoms || '')).trim() : '';

  function contexteEcole(ecole) {
    return DB.all('territoires').then(territoires => {
      const it = indexer(territoires);
      const circo = ecole ? it[ecole.territoire_id] : null;
      let departement = circo ? it[circo.parent_id] : null;
      while (departement && departement.type !== 'DEPARTEMENT' && departement.parent_id) {
        departement = it[departement.parent_id];
      }
      return {
        commune: (ecole && ecole.commune) || (circo ? circo.nom : ''),
        circonscription: circo ? String(circo.nom).replace(/^CS\s+/i, '') : '',
        departement: departement ? departement.nom : ''
      };
    });
  }

  /* =======================================================================
     Modèles de certificats
     ======================================================================= */

  /* Chaque modèle décrit ses lignes. `cle` désigne un champ à saisir,
     `auto` une valeur tirée du dossier de l'agent ou de l'école. */
  const MODELES = [
    {
      code: 'PRESENCE_POSTE', titre: 'CERTIFICAT DE PRÉSENCE AU POSTE', court: 'Présence au poste',
      signataire: 'DIRECTEUR', reference: 'EPP/EM',
      intro: [
        { texte: 'Je soussigné (e)', auto: c => c.signataireNom },
        { texte: 'Direct…… l’École Primaire de', auto: c => c.ecoleNom }
      ],
      corps: [
        { l: 'Atteste que Mr ou Mme', auto: c => nomAgent(c.agent) },
        { l: 'Né (e) le', auto: c => U.dateCourte(c.agent.date_naissance) + ' à ' + (c.agent.lieu_naissance || '') },
        { l: 'Première prise de service', auto: c => U.dateCourte(c.agent.date_premiere_prise_service) },
        { l: 'Numéro matricule', auto: c => c.agent.matricule },
        { l: 'NIP', auto: c => c.agent.nip },
        { l: 'Corps et Grade payé', auto: c => c.agent.grade },
        { l: 'Est en service à', auto: c => c.ecoleNom },
        { l: 'Circonscription scolaire de', auto: c => c.contexte.circonscription + ', département du ' + c.contexte.departement },
        { l: 'Suivant', cle: 'reference_acte' },
        { l: 'En qualité de (Fonction)', auto: c => U.libelle(c.agent.fonction) },
        { l: 'Depuis le', cle: 'depuis', type: 'date' },
        { l: 'jusqu’à ce jour', auto: c => U.dateCourte(new Date().toISOString()) }
      ]
    },
    {
      code: 'PRESENCE_POSTE_PRIVE', titre: 'CERTIFICAT DE PRÉSENCE AU POSTE', court: 'Présence au poste (école privée)',
      sousTitre: 'Enseignant(e) d’une école privée', signataire: 'DIRECTEUR', reference: 'EPP/EM',
      intro: [
        { texte: 'Je soussigné (e)', auto: c => c.signataireNom },
        { texte: 'Direct…… de l’École Privée', auto: c => c.ecoleNom }
      ],
      corps: [
        { l: 'Atteste que Mr ou Mme', auto: c => nomAgent(c.agent) },
        { l: 'Né (e) le', auto: c => U.dateCourte(c.agent.date_naissance) + ' à ' + (c.agent.lieu_naissance || '') },
        { l: 'Titulaire du diplôme', auto: c => c.agent.diplome_recrutement },
        { l: 'Recruté(e) par l’école suivant le contrat n°', cle: 'reference_acte' },
        { l: 'Est en service à', auto: c => c.ecoleNom },
        { l: 'En qualité de (Fonction)', auto: c => U.libelle(c.agent.fonction) },
        { l: 'Depuis le', cle: 'depuis', type: 'date' },
        { l: 'jusqu’à ce jour', auto: c => U.dateCourte(new Date().toISOString()) }
      ]
    },
    {
      code: 'PRISE_SERVICE_PRIVE', titre: 'CERTIFICAT DE PRISE DE SERVICE', court: 'Prise de service (école privée)',
      sousTitre: 'Enseignant(e) d’une école privée', signataire: 'DIRECTEUR', reference: 'EPP/EM',
      intro: [
        { texte: 'Je soussigné (e)', auto: c => c.signataireNom },
        { texte: 'Direct…… de l’École Privée', auto: c => c.ecoleNom }
      ],
      corps: [
        { l: 'Certifie que Mr ou Mme', auto: c => nomAgent(c.agent) },
        { l: 'Titulaire du diplôme', auto: c => c.agent.diplome_recrutement },
        { l: 'Recruté(e) par l’école suivant le contrat n°', cle: 'reference_acte' },
        { l: 'du', cle: 'date_acte', type: 'date' },
        { l: 'Affecté(e) à l’école', auto: c => c.ecoleNom },
        { l: 'En qualité de', auto: c => U.libelle(c.agent.fonction) },
        { l: 'A effectivement pris service le', cle: 'date_effet', type: 'date' }
      ]
    },
    {
      code: 'PRISE_SERVICE', titre: 'CERTIFICAT DE PRISE DE SERVICE', court: 'Prise de service',
      signataire: 'DIRECTEUR', reference: 'EPP/EM',
      intro: [
        { texte: 'Je soussigné (e)', auto: c => c.signataireNom },
        { texte: 'Direct…… de l’École Primaire de', auto: c => c.ecoleNom }
      ],
      corps: [
        { l: 'Certifie que Mr ou Mme', auto: c => nomAgent(c.agent) },
        { l: 'Grade', auto: c => c.agent.grade },
        { l: 'Matricule', auto: c => c.agent.matricule },
        { l: 'NIP', auto: c => c.agent.nip },
        { l: 'Affecté(e) à l’école', auto: c => c.ecoleNom },
        { l: 'Suivant l’arrêté / décision / note de service n°', cle: 'reference_acte' },
        { l: 'du', cle: 'date_acte', type: 'date' },
        { l: 'En qualité de', auto: c => U.libelle(c.agent.fonction) },
        { l: 'A effectivement pris service le', cle: 'date_effet', type: 'date' },
        { l: 'En remplacement de', cle: 'remplace' },
        { l: 'Motif', cle: 'motif' }
      ]
    },
    {
      code: 'REPRISE_SERVICE', titre: 'CERTIFICAT DE REPRISE DE SERVICE', court: 'Reprise de service (AME)',
      signataire: 'DIRECTEUR', reference: 'DIR',
      intro: [
        { texte: 'Nous, soussignés, certifions que Mme/M.', auto: c => nomAgent(c.agent) }
      ],
      corps: [
        { l: 'Titulaire de', auto: c => c.agent.diplome_recrutement || c.agent.grade },
        { l: 'Mis(e) à disposition dans le cadre du Programme spécial de pré-insertion professionnelle dans l’enseignement — édition', cle: 'edition' },
        { l: 'A effectivement repris service le', cle: 'date_effet', type: 'date' },
        { l: 'Conformément au titre d’affectation n°', cle: 'reference_acte' },
        { l: 'du', cle: 'date_acte', type: 'date' },
        { l: 'Classe / section attribuée', cle: 'classe_attribuee' }
      ],
      qualites: ['Instituteur (trice)', 'Instituteur (trice) adjoint(e)', 'Animateur (trice)', 'Élève-instituteur (trice)'],
      visas: true
    },
    {
      code: 'PRISE_SERVICE_AME', titre: 'CERTIFICAT DE PRISE DE SERVICE', court: 'Prise de service (AME)',
      sousTitre: 'Aspirants au métier d’enseignant', signataire: 'DIRECTEUR', reference: 'DIR',
      intro: [
        { texte: 'Nous, soussignés, certifions que Mme/M.', auto: c => nomAgent(c.agent) }
      ],
      corps: [
        { l: 'Titulaire de', auto: c => c.agent.diplome_recrutement || c.agent.grade },
        { l: 'Mis(e) à disposition dans le cadre du Programme spécial de pré-insertion professionnelle dans l’enseignement — édition', cle: 'edition' },
        { l: 'A effectivement pris service le', cle: 'date_effet', type: 'date' },
        { l: 'Conformément au titre d’affectation n°', cle: 'reference_acte' },
        { l: 'du', cle: 'date_acte', type: 'date' },
        { l: 'Classe / section attribuée', cle: 'classe_attribuee' }
      ],
      qualites: ['Instituteur (trice)', 'Instituteur (trice) adjoint(e)', 'Animateur (trice)', 'Élève-instituteur (trice)'],
      visas: true
    },
    {
      code: 'ATTESTATION_DIRECTION', titre: 'ATTESTATION DE DIRECTION', court: 'Attestation de direction',
      signataire: 'CS', reference: 'CS',
      intro: [
        { texte: 'Je soussigné', auto: c => c.signataireNom },
        { texte: 'Chef de la Circonscription Scolaire de', auto: c => c.contexte.circonscription }
      ],
      corps: [
        { l: 'Atteste que Mr ou Mme', auto: c => nomAgent(c.agent) },
        { l: 'Grade', auto: c => c.agent.grade },
        { l: 'Matricule', auto: c => c.agent.matricule },
        { l: 'NIP', auto: c => c.agent.nip },
        { l: 'Affecté (e) à', auto: c => c.ecoleNom },
        { l: 'Est effectivement Direct…… de l’EM/EP', auto: c => c.ecoleNom },
        { l: 'Depuis le', cle: 'depuis', type: 'date' },
        { l: 'Et demeurant réellement Direct…… de', cle: 'nombre_classes' },
        { l: 'Pour compter du', cle: 'date_effet', type: 'date' },
        { l: 'Suivant l’arrêté / décision / note de service n°', cle: 'reference_acte' },
        { l: 'En remplacement de Mr ou Mme', cle: 'remplace' },
        { l: 'Motif', cle: 'motif' }
      ]
    },
    {
      code: 'CERTIFICAT_TRAVAIL', titre: 'CERTIFICAT DE TRAVAIL', court: 'Certificat de travail',
      signataire: 'CS', reference: 'CS',
      intro: [
        { texte: 'Je soussigné', auto: c => c.signataireNom },
        { texte: 'Chef de la Circonscription Scolaire de', auto: c => c.contexte.circonscription }
      ],
      corps: [
        { l: 'Certifie que Mr ou Mme', auto: c => nomAgent(c.agent) },
        { l: 'Grade', auto: c => c.agent.grade },
        { l: 'Matricule', auto: c => c.agent.matricule },
        { l: 'NIP', auto: c => c.agent.nip },
        { l: 'Est en service à l’école', auto: c => c.ecoleNom },
        { l: 'Suivant l’arrêté / décision / note de service n°', cle: 'reference_acte' },
        { l: 'du', cle: 'date_acte', type: 'date' },
        { l: 'En qualité d’', auto: c => U.libelle(c.agent.fonction) },
        { l: 'Depuis le', cle: 'depuis', type: 'date' },
        { l: 'jusqu’à ce jour', auto: c => U.dateCourte(new Date().toISOString()) }
      ]
    },
    {
      code: 'PRISE_EN_CHARGE', titre: 'CERTIFICAT DE PRISE EN CHARGE', court: 'Prise en charge',
      sousTitre: 'Admission des fonctionnaires et assimilés',
      signataire: 'CS', reference: 'CS',
      intro: [],
      corps: [
        { l: 'Nom et prénoms du malade', auto: c => nomAgent(c.agent) },
        { l: 'Profession', auto: c => c.agent.emploi || U.libelle(c.agent.fonction) },
        { l: 'En service à', auto: c => c.ecoleNom },
        { l: 'Indice de traitement', auto: c => c.agent.indice_reel },
        { l: 'Budget devant supporter l’hospitalisation', cle: 'budget' },
        { l: 'Catégorie d’hospitalisation', cle: 'categorie_hospitalisation' }
      ],
      sansFormule: true
    }
  ];
  EG.MODELES_CERTIFICATS = MODELES;

  /* =======================================================================
     Rendu d'un certificat
     ======================================================================= */

  function rendreCertificat(modele, ctx) {
    const ech = EG.Docs.echapper;
    const ligne = v => '<span class="pointilles">' + ech(v === null || v === undefined ? '' : v) + '</span>';
    const valeur = d => d.cle ? (ctx.champs[d.cle] || '') : (d.auto ? d.auto(ctx) : '');

    const reference = 'SO N° ' + ech(ctx.champs.numero_so || '……')
      + (modele.reference === 'CS' ? '' : ' / ' + ech(ctx.ecoleNom))
      + ' / CS-' + ech(ctx.contexte.circonscription)
      + ' / DDEMP-' + ech(ctx.contexte.departement) + ' / SP';

    const intro = (modele.intro || []).map(i =>
      '<p>' + ech(i.texte) + ' ' + ligne(i.auto ? i.auto(ctx) : '') + '</p>').join('');

    const corps = modele.corps.map(d => {
      const v = valeur(d);
      return '<p>' + ech(d.l) + ' ' + ligne(d.type === 'date' && v ? U.dateCourte(v) : v) + '</p>';
    }).join('');

    const qualites = modele.qualites
      ? '<p class="qualites">En qualité de <em>(à cocher)</em> : '
        + modele.qualites.map(q => '<span class="qualite">'
          + '<span class="case-a-cocher">' + (ctx.champs.qualite === q ? '×' : '') + '</span> '
          + ech(q) + '</span>').join('') + '</p>'
      : '';

    const formule = modele.sansFormule ? ''
      : '<p class="formule">En foi de quoi, le présent certificat lui est délivré pour servir et '
        + 'valoir ce que de droit.</p>';

    const visas = modele.visas
      ? '<div class="visas"><h3>Visas</h3><table><tr>'
        + '<td><strong>Le Conseiller Pédagogique</strong><div class="espace-signature"></div>'
        + ligne(ctx.champs.conseiller) + '<br><em>(Nom et prénoms, téléphone)</em></td>'
        + '<td><strong>Le Président / Secrétaire de l’APE</strong><div class="espace-signature"></div>'
        + ligne(ctx.champs.ape) + '<br><em>(Nom et prénoms, téléphone)</em></td>'
        + '</tr></table></div>'
      : '';

    const mention = modele.signataire === 'CS'
      ? 'Le Chef de la Circonscription Scolaire' : 'L…… Direct………';

    return '<div class="certificat-agent">'
      + EG.Docs.enteteMEMP(ctx.contexte.departement,
        modele.signataire === 'CS' ? 'Circonscription Scolaire de ' + ctx.contexte.circonscription
          : ctx.ecoleNom)
      + '<p class="reference-so">' + reference + '</p>'
      + '<h2>' + ech(modele.titre) + '</h2>'
      + (modele.sousTitre ? '<p class="sous-titre-certificat"><em>' + ech(modele.sousTitre) + '</em></p>' : '')
      + '<div class="corps-certificat">' + intro + corps + qualites + formule + '</div>'
      + '<p class="lieu-date">Fait à ' + ech(ctx.contexte.commune) + ', le '
      + ech(U.dateCourte(new Date().toISOString())) + '</p>'
      + '<div class="bloc-signature fiche-signature">'
      + EG.Docs.caseSignature(ctx.signataire, mention)
      + '<div class="cachet-case">' + EG.Docs.cachetComplet(ctx.ecole) + '</div>'
      + '</div>'
      + visas
      + '</div>';
  }

  /* =======================================================================
     ÉCRAN — Certificats du personnel
     ======================================================================= */

  Routeur.definir('certificats', function (racine) {
    racine.appendChild(entete('Certificats du personnel',
      'Modèles officiels renseignés depuis le dossier de l’agent, signés et revêtus du cachet de l’école.',
      [el('button', { class: 'btn btn-fantome', text: 'Mon cachet', onclick: () => Routeur.aller('cachet') })]));
    const zone = el('div');
    racine.appendChild(zone);

    Promise.all([charger('personnels'), DB.get('ecoles', ecoleCourante()), DB.all('certificats_agents')])
      .then(([agents, ecole, delivres]) => {
        const actifs = agents.filter(a => a.actif !== false);
        return contexteEcole(ecole).then(contexte => {
          zone.appendChild(U.carte('Choisir un modèle', el('div', { class: 'raccourcis' },
            MODELES.map(m => el('button', {
              class: 'raccourci', title: m.titre,
              onclick: () => ouvrir(m, actifs, ecole, contexte)
            }, [
              el('span', { class: 'raccourci-icone', text: m.signataire === 'CS' ? '\uE023' : '\uE022' }),
              el('span', { text: m.court })
            ])))));

          if (!actifs.length) {
            zone.appendChild(U.vide('Aucun agent enregistré : ajoutez le personnel avant d’éditer un certificat.'));
          }

          const ia = indexer(actifs);
          zone.appendChild(U.carte('Certificats délivrés', U.tableau([
            { titre: 'Date', valeur: c => U.dateCourte(c.created_at) },
            { titre: 'Agent', valeur: c => nomAgent(ia[c.personnel_id]) },
            { titre: 'Modèle', valeur: c => (MODELES.filter(m => m.code === c.modele)[0] || {}).titre || c.modele },
            { titre: 'Référence', valeur: c => (c.champs && c.champs.numero_so) || '—' }
          ], delivres.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 20),
            { messageVide: 'Aucun certificat délivré pour l’instant.' })));
        });
      });

    function ouvrir(modele, agents, ecole, contexte) {
      if (!agents.length) { U.toast('Aucun agent enregistré', 'attention'); return; }
      const sel = el('select', {}, agents.map(a => el('option', { value: a.id, text: nomAgent(a) })));
      const numero = el('input', { type: 'text', placeholder: 'Numéro de la note de service' });
      const controles = { numero_so: numero };

      const champsLibres = modele.corps.filter(d => d.cle);
      const form = el('div', { class: 'formulaire' }, [
        el('div', { class: 'champ' }, [el('label', { text: 'Agent concerné' }), sel]),
        el('div', { class: 'champ' }, [el('label', { text: 'Numéro SO' }), numero])
      ].concat(champsLibres.map(d => {
        const c = el('input', { type: d.type === 'date' ? 'date' : 'text' });
        controles[d.cle] = c;
        return el('div', { class: 'champ' }, [el('label', { text: d.l }), c]);
      })).concat(modele.qualites ? [(function () {
        const s = el('select', {}, [el('option', { value: '', text: '— Choisir —' })]
          .concat(modele.qualites.map(q => el('option', { value: q, text: q }))));
        controles.qualite = s;
        return el('div', { class: 'champ' }, [el('label', { text: 'Qualité' }), s]);
      })()] : []).concat(modele.visas ? [(function () {
        const cp = el('input', { type: 'text', placeholder: 'Nom et téléphone' });
        const ape = el('input', { type: 'text', placeholder: 'Nom et téléphone' });
        controles.conseiller = cp; controles.ape = ape;
        return el('div', {}, [
          el('div', { class: 'champ' }, [el('label', { text: 'Conseiller pédagogique' }), cp]),
          el('div', { class: 'champ' }, [el('label', { text: 'Président / secrétaire de l’APE' }), ape])
        ]);
      })()] : []));

      U.modal(modele.titre, el('div', {}, [
        el('p', { class: 'muet petit', text: 'Les renseignements du dossier de l’agent — matricule, NIP, grade, dates — sont repris automatiquement. Ne saisissez ici que ce qui manque.' }),
        form
      ]), fermer => [
        el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
        el('button', {
          class: 'btn btn-primaire', text: 'Éditer le certificat', onclick: () => {
            const agent = agents.filter(a => a.id === sel.value)[0];
            const champs = {};
            Object.keys(controles).forEach(k => { champs[k] = controles[k].value; });
            const ctx = {
              agent, ecole, contexte, champs,
              ecoleNom: ecole ? ecole.nom : '',
              signataire: session().user,
              signataireNom: ((session().user.prenoms || '') + ' ' + (session().user.nom || '')).trim()
            };
            fermer();
            DB.put('certificats_agents', {
              personnel_id: agent.id, ecole_id: ecoleCourante(), annee_scolaire_id: anneeCourante(),
              modele: modele.code, champs: champs, delivre_par_label: ctx.signataireNom
            })
              .then(() => DB.audit('CERTIFICAT_AGENT', 'certificats_agents', agent.id, { modele: modele.code }))
              .then(() => {
                EG.majSynchro();
                EG.genererDocument('CERTIFICAT_AGENT',
                  modele.titre + ' — ' + nomAgent(agent), rendreCertificat(modele, ctx));
              });
          }
        })
      ]);
    }
  });

  /* L'écran « Cachet » (école, circonscription, direction départementale) vit désormais dans screens19.js. */
})(window);
