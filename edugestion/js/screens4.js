/* ÉduGestion Pro — fiches CEP renseignables, cantine payante,
   bilans de présence et tableau d'affichage de classe. */
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
      el('div', { class: 'ligne-entre' }, [el('h3', { class: 'carte-titre', text: titre }), action || null]),
      contenu
    ]);
  }

  const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const iso = d => d.toISOString().slice(0, 10);

  /** Contexte administratif d'une école : commune, circonscription, département. */
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
        circonscription: circo ? circo.nom : '',
        departement: departement ? departement.nom : '',
        directeur: (ecole && ecole.directeur_nom) || ((session().user.nom || '') + ' ' + (session().user.prenoms || '')),
        directeurContact: (ecole && ecole.directeur_telephone) || session().user.telephone || ''
      };
    });
  }

  /* =======================================================================
     FICHES D'INSCRIPTION AU CEP
     ======================================================================= */

  /** Ouvre la préparation des fiches, pour un candidat ou pour toute la classe. */
  function editerFichesCEP(inscriptionId, ecoleId, direct) {
    /* Un directeur travaille sur son école ; une circonscription, une direction départementale
       ou l'administration choisissent l'école dont elles éditent les fiches. */
    const idEcole = ecoleId || ecoleCourante();
    Promise.all([
      inscriptionsEnrichies({ niveau: 'CM2', statuts: ['ACTIF', 'SORTIE_PRIMAIRE_CEP'] }),
      idEcole ? DB.get('ecoles', idEcole) : Promise.resolve(null), DB.all('fiches_cep'), DB.all('resultats_cep')
    ]).then(([tous, ecole, fiches, ceps]) => {
      if (!idEcole) { U.toast('Choisissez d’abord une école', 'attention'); return; }
      const ins = tous.filter(i => !i.ecole_id || i.ecole_id === idEcole);
      if (!ins.length) { U.toast('Aucun candidat de CM2', 'attention'); return; }
      const parIns = {}; fiches.forEach(f => { parIns[f.inscription_id] = f; });
      const cepParIns = {}; ceps.forEach(c => { cepParIns[c.inscription_id] = c; });

      return contexteEcole(ecole).then(contexte => {
        const cible = inscriptionId ? ins.filter(i => i.id === inscriptionId)[0] : null;
        if (inscriptionId) {
          if (!cible) { U.toast('Ce candidat n’est pas inscrit en CM2 cette année', 'attention'); return; }
          return renseigner(cible);
        }

        /* Une feuille A4 par candidat : la suivante commence sur une page neuve. */
        const editerToutes = () => {
          const corps = ins.map(i => '<div class="saut-page">' + EG.Docs.ficheCEP(
            i._eleve || {}, i, ecole, session().annee_code, parIns[i.id], cepParIns[i.id],
            contexte, session().user
          ) + '</div>').join('');
          EG.genererDocument('FICHE_CEP', 'Fiches d’inscription au CEP — CM2', corps, { ecole_id: idEcole });
        };
        if (direct === 'toutes') return editerToutes();

        const incompletes = ins.filter(i => !parIns[i.id] || parIns[i.id].statut === 'BROUILLON').length;
        U.modal('Fiches d’inscription au CEP', el('div', {}, [
          el('p', { text: ins.length + ' candidat(s) de CM2. ' + incompletes + ' fiche(s) restent à compléter.' }),
          U.tableau([
            { titre: 'Candidat', valeur: i => i._nom },
            { titre: 'Établissements choisis', valeur: i => (parIns[i.id] && parIns[i.id].etablissement_1) ? 'Renseignés' : '—' },
            { titre: 'État', valeur: i => U.statut(parIns[i.id] ? parIns[i.id].statut : 'BROUILLON') }
          ], ins, { onLigne: i => { document.querySelector('.modal-fond').remove(); renseigner(i); } }),
          el('p', { class: 'muet petit', text: 'Touchez un candidat pour compléter sa fiche, ou éditez directement toutes les fiches ci-dessous.' })
        ]), fermer => [
          el('button', { class: 'btn btn-fantome', text: 'Fermer', onclick: fermer }),
          el('button', {
            class: 'btn btn-primaire', text: 'Éditer les ' + ins.length + ' fiches', onclick: () => {
              fermer();
              editerToutes();
            }
          })
        ]);

        function renseigner(i) {
          const f = parIns[i.id] || { inscription_id: i.id, option_6e: true, statut: 'BROUILLON' };
          const ch = {};
          const champ = (nom, etiquette, valeur, type) => {
            const c = el('input', { type: type || 'text', id: 'cep_' + nom, value: valeur === undefined || valeur === null ? '' : valeur });
            ch[nom] = c;
            return el('div', { class: 'champ' }, [el('label', { for: 'cep_' + nom, text: etiquette }), c]);
          };
          const bascule = (nom, etiquette, valeur) => {
            const c = el('input', { type: 'checkbox', id: 'cep_' + nom });
            c.checked = !!valeur; ch[nom] = c;
            return el('div', { class: 'champ champ-bool' }, [c, el('label', { for: 'cep_' + nom, text: etiquette })]);
          };

          const form = el('div', { class: 'formulaire' }, [
            champ('session', 'Session', f.session || ('JUIN ' + (new Date().getFullYear() + 1))),
            champ('centre', 'Centre de composition', f.centre),
            bascule('option_6e', 'Option CEP + entrée en 6ᵉ', f.option_6e !== false),
            champ('etablissement_1', 'Établissement choisi n° 1', f.etablissement_1),
            champ('etablissement_2', 'Établissement choisi n° 2', f.etablissement_2),
            champ('etablissement_3', 'Établissement choisi n° 3', f.etablissement_3),
            champ('residence_parents', 'Résidence des parents', f.residence_parents),
            bascule('dispense_age', 'Dispense d’âge', f.dispense_age),
            bascule('dispense_sport', 'Dispense de sport', f.dispense_sport),
            champ('parent_nom', 'Nom et prénom du parent', f.parent_nom),
            champ('parent_contact', 'Contact téléphonique du parent', f.parent_contact),
            champ('degre_parente', 'Degré de parenté', f.degre_parente)
          ]);

          U.modal('Fiche CEP — ' + i._nom, el('div', {}, [
            el('p', { class: 'muet petit', text: 'Reportez les renseignements tels qu’ils figurent sur l’acte de naissance. Les trois établissements sont à choisir avec les parents.' }),
            form
          ]), fermer => [
            el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
            el('button', {
              class: 'btn btn-fantome', text: 'Enregistrer', onclick: () => enregistrer(i, f, ch, fermer, false)
            }),
            el('button', {
              class: 'btn btn-primaire', text: 'Enregistrer et éditer', onclick: () => enregistrer(i, f, ch, fermer, true)
            })
          ]);
        }

        function enregistrer(i, f, ch, fermer, editerEnsuite) {
          const valeurs = Object.assign({}, f, {
            inscription_id: i.id,
            session: ch.session.value, centre: ch.centre.value,
            option_6e: ch.option_6e.checked,
            etablissement_1: ch.etablissement_1.value, etablissement_2: ch.etablissement_2.value,
            etablissement_3: ch.etablissement_3.value,
            residence_parents: ch.residence_parents.value,
            dispense_age: ch.dispense_age.checked, dispense_sport: ch.dispense_sport.checked,
            parent_nom: ch.parent_nom.value, parent_contact: ch.parent_contact.value,
            degre_parente: ch.degre_parente.value,
            statut: ch.etablissement_1.value && ch.parent_nom.value ? 'COMPLETE' : 'BROUILLON'
          });
          DB.put('fiches_cep', valeurs)
            .then(enregistree => DB.audit('FICHE_CEP', 'fiches_cep', enregistree.id, { candidat: i._nom })
              .then(() => {
                fermer(); U.toast('Fiche enregistrée'); EG.majSynchro();
                if (editerEnsuite) {
                  EG.genererDocument('FICHE_CEP', 'Fiche CEP — ' + i._nom,
                    EG.Docs.ficheCEP(i._eleve || {}, i, ecole, session().annee_code,
                      enregistree, cepParIns[i.id], contexte, session().user),
                    { classe_id: i.classe_id, ecole_id: idEcole });
                }
              }));
        }
      });
    });
  }
  EG.editerFichesCEP = editerFichesCEP;

  /* =======================================================================
     CANTINE — contributions et listes de paiement
     ======================================================================= */

  /** Bornes d'une période, à partir d'une date de référence. */
  function periode(type, reference) {
    const d = new Date(reference + 'T12:00:00');
    if (type === 'JOUR') return { debut: iso(d), fin: iso(d), libelle: 'du ' + U.dateFR(iso(d)) };
    if (type === 'SEMAINE') {
      const jour = (d.getDay() + 6) % 7; // lundi = 0
      const lundi = new Date(d); lundi.setDate(d.getDate() - jour);
      const dimanche = new Date(lundi); dimanche.setDate(lundi.getDate() + 6);
      return { debut: iso(lundi), fin: iso(dimanche), libelle: 'du ' + U.dateCourte(iso(lundi)) + ' au ' + U.dateCourte(iso(dimanche)) };
    }
    if (type === 'MOIS') {
      const debut = new Date(d.getFullYear(), d.getMonth(), 1);
      const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return { debut: iso(debut), fin: iso(fin), libelle: MOIS_COURTS[d.getMonth()] + ' ' + d.getFullYear() };
    }
    return { debut: '0000-01-01', fin: '9999-12-31', libelle: 'année scolaire ' + session().annee_code };
  }

  Routeur.definir('cantine-paiements', function (racine) {
    racine.appendChild(entete('Cantine — contributions',
      'Ce qui est dû, ce qui est réglé, élève par élève.',
      [el('button', { class: 'btn btn-fantome', text: 'Pointage des repas', onclick: () => Routeur.aller('cantine') })]));
    const filtres = el('div', { class: 'barre-filtres' });
    const zone = el('div');
    racine.appendChild(filtres); racine.appendChild(zone);

    let type = 'MOIS', reference = iso(new Date()), classeId = '';

    filtres.appendChild(U.selecteur('Période', [
      { value: 'JOUR', label: 'Journalière' }, { value: 'SEMAINE', label: 'Hebdomadaire' },
      { value: 'MOIS', label: 'Mensuelle' }, { value: 'ANNEE', label: 'Annuelle' }
    ], type, v => { type = v; dessiner(); }, { vide: false }));
    filtres.appendChild(el('label', { class: 'filtre' }, [
      el('span', { text: 'Date de référence' }),
      el('input', { type: 'date', value: reference, onchange: e => { reference = e.target.value; dessiner(); } })
    ]));
    const boiteClasse = el('span', { class: 'boite-filtre' });
    filtres.appendChild(boiteClasse);

    function dessiner() {
      zone.textContent = '';
      const p = periode(type, reference);
      Promise.all([
        inscriptionsEnrichies(),
        DB.all('participations_cantine'),
        charger('cantines', { annee_scolaire_id: anneeCourante() }),
        DB.where('classes', { annee_scolaire_id: anneeCourante() })
      ]).then(([ins, parts, cantines, classes]) => {
        const dispo = classes.filter(c => !ecoleCourante() || c.ecole_id === ecoleCourante());
        if (!boiteClasse.children.length) {
          boiteClasse.appendChild(U.selecteur('Classe', dispo.map(c => ({ value: c.id, label: c.libelle || c.code })),
            classeId, v => { classeId = v; dessiner(); }));
        }
        const tarif = (cantines[0] && cantines[0].tarif_repas) || 0;
        const retenues = classeId ? ins.filter(i => i.classe_id === classeId) : ins;
        const idsIns = indexer(retenues);
        const dansPeriode = parts.filter(x => idsIns[x.inscription_id]
          && x.date_repas >= p.debut && x.date_repas <= p.fin);

        const parEleve = {};
        dansPeriode.forEach(x => {
          const s = parEleve[x.inscription_id] = parEleve[x.inscription_id]
            || { repas: 0, du: 0, regle: 0, lignes: [] };
          if (!x.a_mange) return;
          const montant = (x.montant === null || x.montant === undefined) ? tarif : x.montant;
          s.repas++; s.du += montant;
          if (x.paye) s.regle += montant;
          s.lignes.push(x);
        });

        const lignes = retenues.map(i => Object.assign({ ins: i },
          parEleve[i.id] || { repas: 0, du: 0, regle: 0, lignes: [] }))
          .map(l => Object.assign(l, { reste: l.du - l.regle }));

        const totalDu = lignes.reduce((s, l) => s + l.du, 0);
        const totalRegle = lignes.reduce((s, l) => s + l.regle, 0);
        const repasServis = lignes.reduce((s, l) => s + l.repas, 0);

        zone.appendChild(el('p', { class: 'muet', text: 'Période ' + p.libelle
          + ' • contribution de ' + U.fcfa(tarif) + ' par repas' }));
        zone.appendChild(grille([
          U.stat(U.nombre(repasServis), 'Repas servis'),
          U.stat(U.fcfa(totalDu), 'Contributions dues'),
          U.stat(U.fcfa(totalRegle), 'Réglées'),
          U.stat(U.fcfa(totalDu - totalRegle), 'Restant dû', totalDu - totalRegle > 0 ? 'attention' : '')
        ], 'grille-stats'));

        if (!tarif) {
          zone.appendChild(U.carte('Contribution non fixée',
            U.vide('Aucun tarif de repas n’est enregistré : les montants restent à zéro.',
              EG.peutEcrire() && cantines[0]
                ? el('button', { class: 'btn btn-primaire', text: 'Fixer la contribution', onclick: () => editer('cantines', cantines[0], dessiner) })
                : null)));
        }

        zone.appendChild(U.tableau([
          { titre: 'Élève', valeur: l => l.ins._nom },
          { titre: 'Classe', valeur: l => l.ins.niveau },
          { titre: 'Repas', valeur: l => U.nombre(l.repas) },
          { titre: 'Dû', valeur: l => U.fcfa(l.du) },
          { titre: 'Réglé', valeur: l => U.fcfa(l.regle) },
          { titre: 'Reste', valeur: l => l.reste > 0 ? U.badge(U.fcfa(l.reste), 'attention') : U.badge('à jour', 'ok') }
        ], lignes.filter(l => l.repas > 0), {
          messageVide: 'Aucun repas servi sur cette période.',
          onLigne: l => detailPaiement(l, tarif)
        }));

        const enRetard = lignes.filter(l => l.reste > 0);
        if (EG.peutEcrire() && enRetard.length) {
          zone.appendChild(el('div', { class: 'barre-actions' }, [
            el('button', {
              class: 'btn btn-primaire', text: 'Marquer tout réglé sur la période', onclick: () => {
                U.confirmer('Enregistrer les règlements',
                  enRetard.length + ' élève(s) seront portés comme ayant réglé leur contribution sur ' + p.libelle + '.', () => {
                    const rows = [];
                    enRetard.forEach(l => l.lignes.filter(x => !x.paye).forEach(x => rows.push(
                      Object.assign({}, x, {
                        montant: (x.montant === null || x.montant === undefined) ? tarif : x.montant,
                        paye: true, date_paiement: iso(new Date())
                      }))));
                    DB.putBatch('participations_cantine', rows)
                      .then(() => DB.audit('PAIEMENTS_CANTINE', 'participations_cantine', null, { nombre: rows.length, periode: p.libelle }))
                      .then(() => { U.toast(rows.length + ' règlement(s) enregistré(s)'); dessiner(); EG.majSynchro(); });
                  }, 'Enregistrer');
              }
            }),
            el('button', { class: 'btn btn-fantome', text: 'Éditer la liste de paiement', onclick: () => editerListe(lignes, p, tarif) })
          ]));
        } else {
          zone.appendChild(el('div', { class: 'barre-actions' }, [
            el('button', { class: 'btn btn-fantome', text: 'Éditer la liste de paiement', onclick: () => editerListe(lignes, p, tarif) })
          ]));
        }
      });
    }
    dessiner();

    function detailPaiement(l, tarif) {
      const jours = l.lignes.sort((a, b) => a.date_repas.localeCompare(b.date_repas));
      U.modal('Contributions — ' + l.ins._nom, el('div', {}, [
        el('p', {}, [
          el('strong', { text: U.fcfa(l.du) + ' dus' }),
          document.createTextNode(' · ' + U.fcfa(l.regle) + ' réglés · reste ' + U.fcfa(l.reste))
        ]),
        U.tableau([
          { titre: 'Jour', valeur: x => U.dateCourte(x.date_repas) },
          { titre: 'Montant', valeur: x => U.fcfa((x.montant === null || x.montant === undefined) ? tarif : x.montant) },
          { titre: 'Règlement', valeur: x => U.badge(x.paye ? 'Réglé' : 'Dû', x.paye ? 'ok' : 'attention') },
          { titre: 'Date', valeur: x => x.date_paiement ? U.dateCourte(x.date_paiement) : '—' }
        ], jours, { messageVide: 'Aucun repas sur la période.' })
      ]), fermer => {
        const btns = [el('button', { class: 'btn btn-fantome', text: 'Fermer', onclick: fermer })];
        if (EG.peutEcrire() && l.reste > 0) {
          btns.push(el('button', {
            class: 'btn btn-primaire', text: 'Enregistrer le règlement', onclick: () => {
              const rows = jours.filter(x => !x.paye).map(x => Object.assign({}, x, {
                montant: (x.montant === null || x.montant === undefined) ? tarif : x.montant,
                paye: true, date_paiement: iso(new Date())
              }));
              DB.putBatch('participations_cantine', rows)
                .then(() => { fermer(); U.toast('Règlement enregistré'); dessiner(); EG.majSynchro(); });
            }
          }));
        }
        return btns;
      });
    }

    function editerListe(lignes, p, tarif) {
      const corps = lignes.filter(l => l.repas > 0).map((l, k) =>
        '<tr><td>' + (k + 1) + '</td><td>' + EG.Docs.echapper(l.ins._nom) + '</td><td>' + l.ins.niveau
        + '</td><td>' + l.repas + '</td><td>' + U.fcfa(l.du) + '</td><td>' + U.fcfa(l.regle)
        + '</td><td>' + U.fcfa(l.reste) + '</td><td></td></tr>').join('');
      const totaux = lignes.reduce((s, l) => ({ repas: s.repas + l.repas, du: s.du + l.du, regle: s.regle + l.regle }),
        { repas: 0, du: 0, regle: 0 });
      EG.genererDocument('LISTE_PAIEMENT', 'Liste de paiement cantine — ' + p.libelle,
        '<h2>Cantine scolaire — liste de paiement</h2>'
        + '<p>' + EG.Docs.echapper(session().ecole_nom) + ' — année ' + session().annee_code
        + '<br>Période : ' + EG.Docs.echapper(p.libelle) + ' — contribution de ' + U.fcfa(tarif) + ' par repas</p>'
        + '<table><thead><tr><th>N°</th><th>Élève</th><th>Classe</th><th>Repas</th><th>Dû</th>'
        + '<th>Réglé</th><th>Reste</th><th>Émargement</th></tr></thead><tbody>' + corps
        + '<tr><th colspan="3">Total</th><th>' + totaux.repas + '</th><th>' + U.fcfa(totaux.du)
        + '</th><th>' + U.fcfa(totaux.regle) + '</th><th>' + U.fcfa(totaux.du - totaux.regle)
        + '</th><th></th></tr></tbody></table>');
    }
  });

  /* =======================================================================
     BILAN DE PRÉSENCE PAR COURS
     ======================================================================= */

  Routeur.definir('bilan-presences', function (racine) {
    racine.appendChild(entete('Bilan de présence',
      'Par cours, mois par mois, puis sur l’année.',
      [el('button', { class: 'btn btn-fantome', text: 'Faire l’appel', onclick: () => Routeur.aller('presences') })]));
    const zone = el('div');
    racine.appendChild(zone);

    Promise.all([
      inscriptionsEnrichies(), DB.all('presences'),
      DB.get('annees_scolaires', anneeCourante()),
      DB.where('calendriers_scolaires', { annee_scolaire_id: anneeCourante() })
    ]).then(([ins, presences, annee, calendrier]) => {
      if (!ins.length) { zone.appendChild(U.vide('Aucun élève inscrit.')); return; }
      const idsIns = indexer(ins);
      const retenues = presences.filter(p => idsIns[p.inscription_id]);
      if (!retenues.length) { zone.appendChild(U.vide('Aucune présence enregistrée pour l’instant.')); return; }

      const parNiveau = {};
      ins.forEach(i => { parNiveau[i.niveau] = (parNiveau[i.niveau] || 0) + 1; });
      const niveaux = EG.NIVEAUX.filter(n => parNiveau[n]);

      /* Mois de l'année scolaire, complétés par ceux où des présences existent
         réellement : un appel saisi hors calendrier ne doit pas disparaître du bilan. */
      const moisAnnee = [];
      if (annee) {
        const d = new Date(annee.date_debut + 'T12:00:00');
        const fin = new Date(annee.date_fin + 'T12:00:00');
        while (d <= fin) { moisAnnee.push(d.toISOString().slice(0, 7)); d.setMonth(d.getMonth() + 1); }
      }
      const moisSaisis = [...new Set(retenues.map(p => p.date_presence.slice(0, 7)))];
      const mois = [...new Set(moisAnnee.concat(moisSaisis))].sort();

      const ouvrablesParMois = {};
      calendrier.filter(j => j.ouvrable).forEach(j => {
        const m = j.date_jour.slice(0, 7);
        ouvrablesParMois[m] = (ouvrablesParMois[m] || 0) + 1;
      });

      /* Agrégation niveau × mois. */
      const cube = {};
      retenues.forEach(p => {
        const i = idsIns[p.inscription_id];
        const m = p.date_presence.slice(0, 7);
        const cle = i.niveau + '|' + m;
        const s = cube[cle] = cube[cle] || { total: 0, presents: 0, absents: 0, retards: 0, justifies: 0 };
        s.total++;
        if (p.statut === 'PRESENT') s.presents++;
        else if (p.statut === 'ABSENT') { s.absents++; if (p.justifie) s.justifies++; }
        else if (p.statut === 'RETARD') s.retards++;
      });

      const moisRenseignes = mois.filter(m => niveaux.some(n => cube[n + '|' + m]));

      /* Bilan mensuel */
      const table = el('table', { class: 'tableau' });
      table.appendChild(el('thead', {}, el('tr', {},
        [el('th', { class: 'colle', text: 'Cours' })]
          .concat(moisRenseignes.map(m => el('th', {
            text: MOIS_COURTS[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(2, 4),
            title: m + (ouvrablesParMois[m] ? ' — ' + ouvrablesParMois[m] + ' jours ouvrables' : '')
          })))
          .concat([el('th', { text: 'Année' })]))));
      const tb = el('tbody');
      niveaux.forEach(n => {
        const tr = el('tr');
        tr.appendChild(el('th', { class: 'colle', text: n + ' (' + parNiveau[n] + ')' }));
        let totalAn = 0, presentsAn = 0;
        moisRenseignes.forEach(m => {
          const s = cube[n + '|' + m];
          if (!s) { tr.appendChild(el('td', { class: 'muet', text: '—' })); return; }
          totalAn += s.total; presentsAn += s.presents;
          const taux = Math.round(s.presents / s.total * 100);
          tr.appendChild(el('td', { class: taux < 85 ? 'cel-calc sous-seuil' : 'cel-calc', text: taux + ' %' }));
        });
        tr.appendChild(el('td', { class: 'cel-calc', text: totalAn ? Math.round(presentsAn / totalAn * 100) + ' %' : '—' }));
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      zone.appendChild(sousSection('Taux de présence par cours et par mois',
        el('div', { class: 'tableau-enveloppe defilant' }, table)));

      /* Détail annuel par cours */
      const annuel = niveaux.map(n => {
        const s = moisRenseignes.reduce((acc, m) => {
          const x = cube[n + '|' + m];
          if (!x) return acc;
          return {
            total: acc.total + x.total, presents: acc.presents + x.presents,
            absents: acc.absents + x.absents, retards: acc.retards + x.retards,
            justifies: acc.justifies + x.justifies
          };
        }, { total: 0, presents: 0, absents: 0, retards: 0, justifies: 0 });
        return Object.assign({ niveau: n, effectif: parNiveau[n] }, s);
      });

      zone.appendChild(sousSection('Bilan annuel', U.tableau([
        { titre: 'Cours', valeur: a => a.niveau },
        { titre: 'Effectif', valeur: a => U.nombre(a.effectif) },
        { titre: 'Journées suivies', valeur: a => U.nombre(a.total) },
        { titre: 'Présences', valeur: a => U.nombre(a.presents) },
        { titre: 'Absences', valeur: a => U.nombre(a.absents) + (a.justifies ? ' (dont ' + a.justifies + ' justifiées)' : '') },
        { titre: 'Retards', valeur: a => U.nombre(a.retards) },
        { titre: 'Taux de présence', valeur: a => a.total ? U.badge(Math.round(a.presents / a.total * 100) + ' %',
          a.presents / a.total < 0.85 ? 'attention' : 'ok') : '—' }
      ], annuel)));

      zone.appendChild(el('div', { class: 'barre-actions' }, [
        el('button', {
          class: 'btn btn-fantome', text: 'Éditer le bilan', onclick: () => {
            const enTete = '<tr><th>Cours</th>' + moisRenseignes.map(m =>
              '<th>' + MOIS_COURTS[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(2, 4) + '</th>').join('')
              + '<th>Année</th></tr>';
            const corps = niveaux.map(n => {
              let t = 0, p = 0;
              const cellules = moisRenseignes.map(m => {
                const s = cube[n + '|' + m];
                if (!s) return '<td>—</td>';
                t += s.total; p += s.presents;
                return '<td>' + Math.round(s.presents / s.total * 100) + ' %</td>';
              }).join('');
              return '<tr><th>' + n + '</th>' + cellules + '<td>' + (t ? Math.round(p / t * 100) + ' %' : '—') + '</td></tr>';
            }).join('');
            EG.genererDocument('BILAN_PRESENCE', 'Bilan de présence — ' + session().annee_code,
              '<h2>Bilan de présence par cours</h2><p>' + EG.Docs.echapper(session().ecole_nom)
              + ' — année scolaire ' + session().annee_code + '</p>'
              + '<table><thead>' + enTete + '</thead><tbody>' + corps + '</tbody></table>'
              + '<h3>Détail annuel</h3><table><thead><tr><th>Cours</th><th>Effectif</th>'
              + '<th>Journées</th><th>Présences</th><th>Absences</th><th>Retards</th><th>Taux</th></tr></thead><tbody>'
              + annuel.map(a => '<tr><td>' + a.niveau + '</td><td>' + a.effectif + '</td><td>' + a.total
                + '</td><td>' + a.presents + '</td><td>' + a.absents + '</td><td>' + a.retards + '</td><td>'
                + (a.total ? Math.round(a.presents / a.total * 100) + ' %' : '—') + '</td></tr>').join('')
              + '</tbody></table>');
          }
        })
      ]));
    });
  });

  /* =======================================================================
     TABLEAU D'AFFICHAGE DE CLASSE
     ======================================================================= */

  /** Courbe simple en SVG, utilisable à l'écran comme à l'impression. */
  function courbe(points, options) {
    options = options || {};
    const l = options.largeur || 560, h = options.hauteur || 190;
    const mg = { g: 38, d: 12, hb: 14, b: 30 };
    const maxY = Math.max(options.maxY || 0, Math.max.apply(null, points.map(p => p.y).concat([1])));
    const largeurUtile = l - mg.g - mg.d, hauteurUtile = h - mg.hb - mg.b;
    const x = i => mg.g + (points.length < 2 ? largeurUtile / 2 : i * largeurUtile / (points.length - 1));
    const y = v => mg.hb + hauteurUtile - (v / maxY) * hauteurUtile;

    /* Avec un seul relevé, un segment court se lit mieux qu'un point isolé. */
    const ligne = points.length === 1
      ? 'M' + (x(0) - 26).toFixed(1) + ' ' + y(points[0].y).toFixed(1)
        + ' L' + (x(0) + 26).toFixed(1) + ' ' + y(points[0].y).toFixed(1)
      : points.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.y).toFixed(1)).join(' ');
    const fin = points.length === 1 ? x(0) + 26 : x(points.length - 1);
    const debut = points.length === 1 ? x(0) - 26 : x(0);
    const aire = ligne + ' L' + fin.toFixed(1) + ' ' + (mg.hb + hauteurUtile)
      + ' L' + debut.toFixed(1) + ' ' + (mg.hb + hauteurUtile) + ' Z';

    let grille = '';
    for (let k = 0; k <= 4; k++) {
      const v = maxY * k / 4;
      grille += '<line x1="' + mg.g + '" y1="' + y(v) + '" x2="' + (l - mg.d) + '" y2="' + y(v)
        + '" stroke="#D8E0DB" stroke-width="1"/>'
        + '<text x="' + (mg.g - 6) + '" y="' + (y(v) + 4) + '" font-size="10" fill="#647067" text-anchor="end">'
        + Math.round(v) + (options.unite || '') + '</text>';
    }
    const marques = points.map((p, i) =>
      '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.y).toFixed(1) + '" r="3.5" fill="'
      + (options.couleur || '#008751') + '"/>'
      + '<text x="' + x(i).toFixed(1) + '" y="' + (y(p.y) - 8).toFixed(1) + '" font-size="10.5"'
      + ' font-weight="700" fill="' + (options.couleur || '#008751') + '" text-anchor="middle">'
      + (Math.round(p.y * 10) / 10) + (options.unite || '') + '</text>'
      + '<text x="' + x(i).toFixed(1) + '" y="' + (h - 10) + '" font-size="10" fill="#647067" text-anchor="middle">'
      + EG.Docs.echapper(p.x) + '</text>').join('');

    return '<svg class="courbe" viewBox="0 0 ' + l + ' ' + h + '" width="100%" height="' + h
      + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + (options.titre || 'Courbe') + '">'
      + grille
      + '<path d="' + aire + '" fill="' + (options.couleur || '#008751') + '" opacity="0.12"/>'
      + '<path d="' + ligne + '" fill="none" stroke="' + (options.couleur || '#008751') + '" stroke-width="2.5"'
      + ' stroke-linejoin="round" stroke-linecap="round"/>'
      + marques + '</svg>';
  }

  /** Histogramme apparié filles / garçons, pour la pyramide des âges. */
  function histogrammeSexe(categories, options) {
    options = options || {};
    const l = options.largeur || 560, h = options.hauteur || 200;
    const mg = { g: 34, d: 12, hb: 22, b: 34 };
    const max = Math.max(1, Math.max.apply(null, categories.map(c => Math.max(c.f, c.m))));
    const largeurUtile = l - mg.g - mg.d, hauteurUtile = h - mg.hb - mg.b;
    const pas = largeurUtile / Math.max(1, categories.length);
    const largeurBarre = Math.min(18, pas / 2 - 3);

    let corps = '';
    categories.forEach((c, i) => {
      const base = mg.g + i * pas + pas / 2;
      [['f', '#C2185B'], ['m', '#2166AC']].forEach(([cle, couleur], k) => {
        const valeur = c[cle];
        const hauteur = (valeur / max) * hauteurUtile;
        const x = base - largeurBarre - 2 + k * (largeurBarre + 4);
        corps += '<rect x="' + x.toFixed(1) + '" y="' + (mg.hb + hauteurUtile - hauteur).toFixed(1)
          + '" width="' + largeurBarre.toFixed(1) + '" height="' + Math.max(0, hauteur).toFixed(1)
          + '" fill="' + couleur + '" rx="2"/>';
        if (valeur) corps += '<text x="' + x.toFixed(1) + '" y="' + (mg.hb + hauteurUtile - hauteur - 3).toFixed(1)
          + '" font-size="9" fill="#647067">' + valeur + '</text>';
      });
      corps += '<text x="' + base.toFixed(1) + '" y="' + (h - 14) + '" font-size="10" fill="#17201B"'
        + ' text-anchor="middle">' + EG.Docs.echapper(c.etiquette) + '</text>';
    });

    return '<svg class="courbe" viewBox="0 0 ' + l + ' ' + h + '" width="100%" height="' + h
      + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Répartition par âge et par sexe">'
      + '<line x1="' + mg.g + '" y1="' + (mg.hb + hauteurUtile) + '" x2="' + (l - mg.d) + '" y2="'
      + (mg.hb + hauteurUtile) + '" stroke="#647067"/>'
      + corps
      + '<rect x="' + mg.g + '" y="4" width="9" height="9" fill="#C2185B" rx="2"/>'
      + '<text x="' + (mg.g + 13) + '" y="12" font-size="10" fill="#17201B">Filles</text>'
      + '<rect x="' + (mg.g + 52) + '" y="4" width="9" height="9" fill="#2166AC" rx="2"/>'
      + '<text x="' + (mg.g + 65) + '" y="12" font-size="10" fill="#17201B">Garçons</text>'
      + '</svg>';
  }

  Routeur.definir('affichage', function (racine) {
    racine.appendChild(entete('Tableau d’affichage de classe',
      'Ce qui doit rester sous les yeux : âges, effectifs, assiduité et résultats.'));
    const filtres = el('div', { class: 'barre-filtres' });
    const zone = el('div');
    racine.appendChild(filtres); racine.appendChild(zone);
    let classeId = '';

    DB.where('classes', { annee_scolaire_id: anneeCourante() }).then(cls => {
      const dispo = cls.filter(c => !ecoleCourante() || c.ecole_id === ecoleCourante());
      if (!dispo.length) { zone.appendChild(U.vide('Aucune classe ouverte cette année.')); return; }
      classeId = dispo[0].id;
      filtres.appendChild(U.selecteur('Classe', dispo.map(c => ({ value: c.id, label: c.libelle || c.code })),
        classeId, v => { classeId = v; dessiner(); }, { vide: false }));
      dessiner();
    });

    function dessiner() {
      zone.textContent = '';
      Promise.all([
        inscriptionsEnrichies({ classe_id: classeId }),
        DB.all('presences'), DB.all('notes'),
        DB.where('evaluations', { annee_scolaire_id: anneeCourante() }),
        DB.get('classes', classeId), DB.all('eleve_handicaps')
      ]).then(([ins, presences, notes, evaluations, classe, handicaps]) => {
        if (!ins.length) { zone.appendChild(U.vide('Aucun élève dans cette classe.')); return; }
        const idsIns = indexer(ins);
        const idsEleves = {}; ins.forEach(i => { idsEleves[i.eleve_id] = true; });

        /* --- Courbe des âges --- */
        const parAge = {};
        ins.forEach(i => {
          const a = R.age(i._eleve && i._eleve.date_naissance);
          if (a === null) return;
          const c = parAge[a] = parAge[a] || { f: 0, m: 0 };
          c[(i._eleve && i._eleve.sexe === 'F') ? 'f' : 'm']++;
        });
        const ages = Object.keys(parAge).map(Number).sort((a, b) => a - b);
        const categories = ages.map(a => ({ etiquette: a + ' ans', f: parAge[a].f, m: parAge[a].m }));
        const total = ins.length;
        const filles = ins.filter(i => i._eleve && i._eleve.sexe === 'F').length;
        const agesValides = ins.map(i => R.age(i._eleve && i._eleve.date_naissance)).filter(a => a !== null);
        const ageMoyen = agesValides.length
          ? Math.round(agesValides.reduce((s, a) => s + a, 0) / agesValides.length * 10) / 10 : null;
        /* Âge théorique du niveau : 6 ans au CI, puis un an par cours. */
        const theorique = 6 + Math.max(0, EG.NIVEAUX_PRIM.indexOf(classe ? classe.niveau : ''));
        const enRetard = agesValides.filter(a => a > theorique).length;
        const enAvance = agesValides.filter(a => a < theorique).length;

        /* --- Courbe de scolarité : assiduité mois par mois --- */
        const parMois = {};
        presences.filter(p => idsIns[p.inscription_id]).forEach(p => {
          const m = p.date_presence.slice(0, 7);
          const s = parMois[m] = parMois[m] || { total: 0, presents: 0 };
          s.total++; if (p.statut === 'PRESENT') s.presents++;
        });
        const moisTries = Object.keys(parMois).sort();
        const pointsAssiduite = moisTries.map(m => ({
          x: MOIS_COURTS[Number(m.slice(5, 7)) - 1],
          y: Math.round(parMois[m].presents / parMois[m].total * 100)
        }));

        /* --- Courbe de scolarité : moyenne de classe par évaluation --- */
        const evalsNiveau = evaluations.filter(e => e.niveau === (classe ? classe.niveau : ''))
          .sort((a, b) => (a.numero || 0) - (b.numero || 0));
        const pointsMoyenne = evalsNiveau.map(e => {
          const n = notes.filter(x => x.evaluation_id === e.id && idsIns[x.inscription_id] && typeof x.note === 'number');
          const moy = R.moyenne(n.map(x => ({ note: x.note, coefficient: 1 })));
          return { x: 'Év. ' + e.numero, y: moy === null ? 0 : moy };
        }).filter(p => p.y > 0);

        /* --- Affichage --- */
        zone.appendChild(grille([
          U.stat(U.nombre(total), 'Effectif'),
          U.stat(U.nombre(filles) + ' / ' + U.nombre(total - filles), 'Filles / garçons'),
          U.stat(ageMoyen === null ? '—' : ageMoyen + ' ans', 'Âge moyen'),
          U.stat(theorique + ' ans', 'Âge théorique du cours'),
          U.stat(U.nombre(enRetard), 'En retard d’âge', enRetard > total / 3 ? 'attention' : ''),
          U.stat(U.nombre(ins.filter(i => i.redoublant).length), 'Redoublants')
        ], 'grille-stats'));

        const bloc = (titre, svg, note) => {
          const d = el('div');
          d.innerHTML = svg;
          return sousSection(titre, el('div', {}, [d, note ? el('p', { class: 'muet petit', text: note }) : null]));
        };

        zone.appendChild(bloc('Courbe des âges', histogrammeSexe(categories),
          enRetard + ' élève(s) au-dessus de l’âge théorique, ' + enAvance + ' en dessous.'));

        if (pointsAssiduite.length) {
          zone.appendChild(bloc('Courbe de scolarité — assiduité mensuelle',
            courbe(pointsAssiduite, { maxY: 100, unite: ' %', couleur: '#008751' }),
            'Part des journées où les élèves étaient présents.'));
        }
        if (pointsMoyenne.length) {
          zone.appendChild(bloc('Courbe de scolarité — moyenne de la classe',
            courbe(pointsMoyenne, { maxY: 20, couleur: '#2166AC' }),
            'Moyenne générale de la classe, évaluation après évaluation. Le seuil de maîtrise est à 10.'));
        }

        zone.appendChild(el('div', { class: 'barre-actions' }, [
          el('button', {
            class: 'btn btn-primaire', text: 'Éditer le tableau d’affichage', onclick: () => {
              /* Format SCOLARIS / GESCOL : cadre (cours, classe, titulaire, directeur, effectif, année), liste des élèves
                 (N°, nom, prénoms, sexe, âge au 31/12, scolarité, contact des parents), répartition par sexe, récapitulatifs
                 scolarité × sexe et âge × sexe avec graphiques, courbes de la classe ; signatures, cachet, QR. */
              const nomClasse = classe ? (classe.libelle || classe.code) : '';
              const D = EG.DocsSco;
              const an1 = Number(String(session().annee_code || '').slice(0, 4)) || new Date().getFullYear();
              const ref = new Date(an1, 11, 31);
              const ageAu = d => { if (!d) return null; const n = new Date(d + 'T12:00:00'); if (isNaN(n)) return null; return ref.getFullYear() - n.getFullYear() - ((ref.getMonth() < n.getMonth() || (ref.getMonth() === n.getMonth() && ref.getDate() < n.getDate())) ? 1 : 0); };
              Promise.all([classe && classe.titulaire_id ? DB.get('personnels', classe.titulaire_id) : null, classe ? DB.get('ecoles', classe.ecole_id) : null, DB.all('inscriptions_eleves')]).then(([tit, ecole, toutes]) => {
                const annees = {}; toutes.forEach(x => { (annees[x.eleve_id] = annees[x.eleve_id] || {})[x.annee_scolaire_id] = 1; });
                const liste = ins.slice().sort((x, y) => x._nom.localeCompare(y._nom, 'fr')).map(i => {
                  const e = i._eleve || {};
                  return { nom: (e.nom || '').toUpperCase(), prenoms: e.prenoms || '', sexe: e.sexe === 'F' ? 'F' : 'M', age: ageAu(e.date_naissance),
                    scol: Object.keys(annees[i.eleve_id] || {}).length || 1, tel: e.tuteur_telephone || '' };
                });
                const nF = liste.filter(x => x.sexe === 'F').length, nT = liste.length, pc = n => nT ? Math.round(n / nT * 1000) / 10 + ' %' : '—';
                const croise = cleF => {
                  const v = {}; liste.forEach(x => { const k = x[cleF] === null ? 'Non renseigné' : x[cleF]; const c = v[k] = v[k] || { F: 0, G: 0 }; c[x.sexe === 'F' ? 'F' : 'G']++; });
                  const ks = Object.keys(v).sort((p, q) => (Number(p) || 999) - (Number(q) || 999));
                  return { ks, v, lignes: ks.map(k => [k, v[k].F, v[k].G, v[k].F + v[k].G, pc(v[k].F + v[k].G)]).concat([{ tot: true, cells: ['TOTAL', nF, nT - nF, nT, nT ? '100 %' : '—'] }]) };
                };
                const sc = croise('scol'), ag = croise('age');
                const nomTit = tit ? ((tit.nom || '').toUpperCase() + ' ' + (tit.prenoms || '')).trim() : '';
                const html = D.titre('Liste des élèves — tableau d’affichage', 'Année scolaire ' + session().annee_code + ' — Âge calculé au 31/12/' + an1)
                  + D.infos([['Cours', classe ? classe.niveau : ''], ['Classe', nomClasse], ['Titulaire', nomTit], ['Directeur', ecole ? ecole.directeur_nom || '' : ''],
                    ['Effectif', nT + ' (F : ' + nF + ' — G : ' + (nT - nF) + ')'], ['Année', session().annee_code]], 2)
                  + D.tableau(['N°', 'Nom', 'Prénoms', 'Sexe', 'Âge', 'Scolarité', 'Contact parents'],
                    liste.map((x, k) => [k + 1, { t: x.nom, g: true }, { t: x.prenoms, g: true }, x.sexe, x.age === null ? '—' : x.age, x.scol, x.tel]))
                  + '<h3 class="sco">Répartition par sexe</h3>' + D.tableau(['', 'Filles', 'Garçons', 'Total'], [[{ t: 'Effectif', g: true }, nF, nT - nF, nT], [{ t: 'Pourcentage', g: true }, pc(nF), pc(nT - nF), nT ? '100 %' : '—']])
                  + '<div class="deux-col"><div><h3 class="sco">Récapitulatif : scolarité par sexe</h3>' + D.tableau(['Scolarité (ans)', 'F', 'G', 'Total', '%'], sc.lignes)
                  + histogrammeSexe(sc.ks.map(k => ({ etiquette: k + ' an(s)', f: sc.v[k].F, m: sc.v[k].G })), { largeur: 320 }) + '</div>'
                  + '<div><h3 class="sco">Récapitulatif : âge par sexe (au 31/12/' + an1 + ')</h3>' + D.tableau(['Âge', 'F', 'G', 'Total', '%'], ag.lignes)
                  + histogrammeSexe(ag.ks.map(k => ({ etiquette: k + (isNaN(k) ? '' : ' ans'), f: ag.v[k].F, m: ag.v[k].G })), { largeur: 320 }) + '</div></div>'
                  + '<p class="note-sco">Scolarité : nombre d’années de scolarité de l’élève (années inscrites). Âge : âge révolu au 31/12/' + an1 + '. Âge théorique du cours : ' + theorique + ' ans — '
                  + enRetard + ' élève(s) au-dessus, ' + enAvance + ' en dessous ; redoublants : ' + ins.filter(i => i.redoublant).length + '.</p>'
                  + (pointsAssiduite.length ? '<h3 class="sco">Courbe de scolarité — assiduité mensuelle</h3>' + courbe(pointsAssiduite, { maxY: 100, unite: ' %', largeur: 640 }) : '')
                  + (pointsMoyenne.length ? '<h3 class="sco">Courbe de scolarité — moyenne de la classe</h3>' + courbe(pointsMoyenne, { maxY: 20, couleur: '#2166AC', largeur: 640 }) : '');
                EG.genererDocument('AFFICHAGE_CLASSE', 'Tableau d’affichage — ' + nomClasse, html, { classe_id: classe ? classe.id : null, ecole_id: classe ? classe.ecole_id : null });
              });
            }
          })
        ]));
      });
    }
  });

  EG.Graphes = { courbe, histogrammeSexe };
})(window);
