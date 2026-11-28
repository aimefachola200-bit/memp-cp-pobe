/* ÉduGestion Pro — la gestion financière des écoles privées.

   Trois modules, sept onglets, tous propres à l'école privée choisie :

   scolarite-privee/bareme     barème défini par l'école : droits d'inscription et trois tranches par cours ;
   scolarite-privee/paiements  paiements par tranche (1re, 2e, 3e, reste), reçus imprimables, remises ;
   scolarite-privee/impayes    impayés et relances (convocation aux parents) ;
   scolarite-privee/classes    fonds reçus par classe, selon l'effectif de chaque cours ;
   caisse-privee/cahier        cahier de gestion des fonds : recettes, dépenses, solde ;
   caisse-privee/bilan         bilan financier par mois et par rubrique ;
   salaires-privee/paie        paie des enseignants, bulletins de paie.

   Le cahier de caisse rassemble les écritures saisies à la main et, sans double saisie, les paiements de
   scolarité (recettes) et les salaires payés (dépenses). Le directeur de l'école privée écrit ; la
   circonscription, la direction départementale et l'administration consultent. Les pièces éditées
   (reçus, états, bulletins) passent par le registre des documents : numéro, empreinte, signature, cachet, QR. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans, X0 = EG.EcransCS;
  const S = () => EG.Sortie;
  const sa = U.sansAccent;
  const ech = s => EG.Docs.echapper(s);
  const num = v => (typeof v === 'number' && !isNaN(v)) ? v : 0;
  const somme = (liste, f) => liste.reduce((s, x) => s + num(f ? f(x) : x), 0);
  const F = n => U.fcfa(Math.round(n || 0));
  const aujourdhui = () => new Date().toISOString().slice(0, 10);
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const libMois = m => m ? MOIS[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(0, 4) : '—';
  const grille = (enfants, classe) => el('div', { class: 'grille ' + (classe || '') }, enfants);

  const ONGLETS = [
    ['scolarite-privee/bareme', '\uE056 Barème et tranches'], ['scolarite-privee/paiements', '\uE04E Paiements et reçus'],
    ['scolarite-privee/impayes', '\uE01A Impayés et relances'], ['scolarite-privee/classes', '\uE040 Fonds reçus par classe'],
    ['caisse-privee/cahier', '\uE030 Cahier de caisse'], ['caisse-privee/bilan', '\uE015 Bilan financier'], ['salaires-privee/paie', '\uE04E Salaires']
  ];
  const TRANCHES = ['INSCRIPTION', 'TRANCHE_1', 'TRANCHE_2', 'TRANCHE_3', 'RESTE'];
  const RECETTES = ['SCOLARITE', 'INSCRIPTION', 'SUBVENTION', 'DON', 'AUTRE_RECETTE'];

  /* =======================================================================
     Nombres en lettres (reçus et bulletins de paie)
     ======================================================================= */

  const UNITES = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];
  function moinsDeCent(n, final) {
    if (n < 20) return UNITES[n];
    const d = Math.floor(n / 10), u = n % 10;
    if (d === 7 || d === 9) return DIZAINES[d] + (d === 7 && u === 1 ? ' et ' : '-') + UNITES[n - (d - 1) * 10];
    if (d === 8) return u ? 'quatre-vingt-' + UNITES[u] : 'quatre-vingt' + (final ? 's' : '');
    return DIZAINES[d] + (u === 1 ? ' et un' : (u ? '-' + UNITES[u] : ''));
  }
  function moinsDeMille(n, final) {
    const c = Math.floor(n / 100), r = n % 100;
    let s = c ? (c > 1 ? UNITES[c] + ' ' : '') + 'cent' + (c > 1 && r === 0 && final ? 's' : '') : '';
    if (r) s += (s ? ' ' : '') + moinsDeCent(r, final);
    return s;
  }
  /** 250 000 → « deux cent cinquante mille » */
  function enLettres(n) {
    n = Math.round(n || 0);
    if (!n) return 'zéro';
    const mil = Math.floor(n / 1e6), k = Math.floor((n % 1e6) / 1000), r = n % 1000, parts = [];
    if (mil) parts.push(moinsDeMille(mil, false) + ' million' + (mil > 1 ? 's' : ''));
    if (k) parts.push((k === 1 ? '' : moinsDeMille(k, false) + ' ') + 'mille');
    if (r) parts.push(moinsDeMille(r, true));
    return parts.join(' ');
  }

  /* =======================================================================
     Situations de scolarité
     ======================================================================= */

  /** Pour chaque élève de l'école : ce qui est dû, versé, restant, échu (en retard). */
  function situations(D) {
    const parNiveau = {}; D.frais.forEach(f => { parNiveau[f.niveau] = f; });
    const pay = {}; D.paiements.forEach(p => { (pay[p.inscription_id] = pay[p.inscription_id] || []).push(p); });
    const rem = {}; D.remises.forEach(r => { rem[r.inscription_id] = (rem[r.inscription_id] || 0) + num(r.montant); });
    const auj = aujourdhui();
    return D.ins.map(i => {
      const f = parNiveau[i.niveau] || null;
      const dus = { INSCRIPTION: f ? num(f.frais_inscription) : 0, TRANCHE_1: f ? num(f.tranche_1) : 0, TRANCHE_2: f ? num(f.tranche_2) : 0, TRANCHE_3: f ? num(f.tranche_3) : 0 };
      const dates = { TRANCHE_1: f && f.date_limite_1, TRANCHE_2: f && f.date_limite_2, TRANCHE_3: f && f.date_limite_3 };
      const paye = { INSCRIPTION: 0, TRANCHE_1: 0, TRANCHE_2: 0, TRANCHE_3: 0, RESTE: 0 };
      (pay[i.id] || []).forEach(p => { paye[p.tranche] = (paye[p.tranche] || 0) + num(p.montant); });
      const total = dus.INSCRIPTION + dus.TRANCHE_1 + dus.TRANCHE_2 + dus.TRANCHE_3;
      const remise = rem[i.id] || 0, aPayer = Math.max(0, total - remise), verse = somme(TRANCHES, t => paye[t]);
      let echu = dus.INSCRIPTION;
      ['TRANCHE_1', 'TRANCHE_2', 'TRANCHE_3'].forEach(t => { if (dates[t] && dates[t] <= auj) echu += dus[t]; });
      const suivante = ['TRANCHE_1', 'TRANCHE_2', 'TRANCHE_3'].filter(t => dus[t] > 0 && dates[t] && dates[t] > auj)[0];
      return { i, f, dus, paye, dates, total, remise, aPayer, verse, reste: Math.max(0, aPayer - verse), retard: Math.max(0, echu - remise - verse),
        echeance: suivante ? dates[suivante] : null, sansBareme: !f };
    });
  }
  const nomClasse = i => i._classe ? (i._classe.libelle || i._classe.code) : i.niveau;

  /* =======================================================================
     Squelette commun : choix de l'école privée, onglets, chargement
     ======================================================================= */

  function ecranPrive(racine, params, cfg) {
    if (!EG.peutVoirModule(cfg.module)) { X0.refuse(racine); return; }
    racine.appendChild(E.entete(cfg.titre, cfg.sous));
    const zoneOnglets = el('div'), zoneEcole = el('div', { class: 'barre-filtres' }), zone = el('div');
    racine.appendChild(zoneOnglets); racine.appendChild(zoneEcole); racine.appendChild(zone);
    const role = EG.session.user.role;
    const ecriture = ['DIRECTEUR', 'ADMIN_MEMP', 'ADMIN_TECHNIQUE'].indexOf(role) >= 0 && EG.peutEcrire();
    const etat = { ecole: (params && params.ecole) || EG.session.ecole_id || '' };
    zoneOnglets.appendChild(E.barreOnglets(ONGLETS, cfg.actif, code => Routeur.aller(code + (etat.ecole && !EG.session.ecole_id ? '?ecole=' + etat.ecole : ''))));
    let privees = [], annee = null;

    function charger() {
      zone.textContent = '';
      const ecole = privees.filter(e => e.id === etat.ecole)[0];
      if (!ecole) { zone.appendChild(U.vide(privees.length ? 'Choisissez une école privée.' : 'Aucune école privée dans votre périmètre.')); return; }
      const cond = { ecole_id: ecole.id, annee_scolaire_id: EG.session.annee_id };
      Promise.all([DB.where('frais_scolarite', cond), DB.where('paiements_scolarite', cond), DB.where('remises_scolarite', cond), E.inscriptionsEnrichies({ ecole_id: ecole.id }),
        DB.where('classes', cond), DB.where('cahier_fonds', cond), DB.where('salaires_ecole', cond), DB.where('personnels', { ecole_id: ecole.id })])
        .then(([frais, paiements, remises, ins, classes, cahier, salaires, pers]) => {
          const D = { frais, paiements, remises, ins: ins.filter(i => i.ecole_id === ecole.id), classes, cahier, salaires, pers: pers.filter(p => p.actif !== false) };
          cfg.rendre(zone, { ecole, annee, ecriture, D, recharger: charger, S: situations(D) });
        });
    }

    Promise.all([DB.all('ecoles'), DB.get('annees_scolaires', EG.session.annee_id)]).then(([ecoles, an]) => EG.filtrerPerimetre('ecoles', ecoles).then(liste => {
      annee = an;
      privees = liste.filter(e => e.statut === 'PRIVEE' && e.actif !== false).sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr', { numeric: true }));
      if (EG.session.ecole_id) {
        const e = liste.filter(x => x.id === EG.session.ecole_id)[0];
        if (!e || e.statut !== 'PRIVEE') { zone.appendChild(U.vide('Ce module est réservé aux écoles privées.')); return; }
        zoneEcole.appendChild(el('span', { class: 'badge info', text: 'École privée : ' + e.nom }));
      } else {
        if (!etat.ecole && privees.length) etat.ecole = privees[0].id;
        zoneEcole.appendChild(U.selecteur('École privée', privees.map(e => ({ value: e.id, label: e.nom })), etat.ecole, v => { etat.ecole = v; charger(); }, { vide: false }));
        if (!ecriture) zoneEcole.appendChild(el('span', { class: 'muet petit', text: 'Consultation : la gestion appartient à l’école.' }));
      }
      charger();
    }));
  }

  const carteVide = (zone, msg) => zone.appendChild(U.vide(msg));
  const sceau = (X, type, titre, html) => EG.genererDocument(type, titre, html, { ecole_id: X.ecole.id });
  const entetePiece = (X, titre, sous) => '<h2 style="text-align:center">' + ech(titre) + '</h2>'
    + '<p style="text-align:center">' + ech(X.ecole.nom) + ' — année scolaire ' + ech(X.annee ? X.annee.code : EG.session.annee_code) + (sous ? ' — ' + ech(sous) : '') + '</p>';

  /* =======================================================================
     Onglet 1 — barème et tranches
     ======================================================================= */

  Routeur.definir('scolarite-privee', function (racine, args, params) {
    const onglet = args && args[0] ? args[0] : 'bareme';
    const rendus = { bareme, paiements, impayes, classes };
    ecranPrive(racine, params, {
      module: 'scolarite-privee', actif: 'scolarite-privee/' + (rendus[onglet] ? onglet : 'bareme'),
      titre: 'Scolarité — école privée', sous: 'Le barème est défini par l’école : droits d’inscription et trois tranches, cours par cours. Chaque paiement est rattaché à un élève et donne lieu à un reçu.',
      rendre: (zone, X) => (rendus[onglet] || bareme)(zone, X)
    });
  });

  function bareme(zone, X) {
    const { D, ecole } = X;
    const niveaux = EG.NIVEAUX.filter(n => D.ins.some(i => i.niveau === n) || D.classes.some(c => c.niveau === n) || D.frais.some(f => f.niveau === n));
    const parNiveau = {}; D.frais.forEach(f => { parNiveau[f.niveau] = f; });
    const eff = n => D.ins.filter(i => i.niveau === n).length;
    const pre = n => ({ ecole_id: ecole.id, annee_scolaire_id: EG.session.annee_id, niveau: n, frais_inscription: 0, tranche_1: 0, tranche_2: 0, tranche_3: 0 });
    const attendu = somme(X.S, s => s.aPayer);
    zone.appendChild(grille([
      U.stat(U.nombre(niveaux.length), 'Cours de l’école'), U.stat(U.nombre(D.ins.length), 'Élèves inscrits'),
      U.stat(F(attendu), 'Scolarité attendue (remises déduites)'), U.stat(F(somme(D.remises, r => r.montant)), 'Remises accordées')
    ], 'grille-stats'));
    const actions = el('div', { class: 'barre-actions' });
    if (X.ecriture) {
      actions.appendChild(el('button', { class: 'btn btn-primaire', text: '＋ Définir le barème d’un cours', onclick: () => E.editer('frais_scolarite', pre(''), X.recharger) }));
      const modele = D.frais[0];
      if (modele && niveaux.some(n => !parNiveau[n])) {
        actions.appendChild(el('button', { class: 'btn btn-fantome', text: 'Appliquer le barème de ' + modele.niveau + ' aux cours sans barème', onclick: () => {
          const rows = niveaux.filter(n => !parNiveau[n]).map(n => Object.assign({}, pre(n), { frais_inscription: modele.frais_inscription, tranche_1: modele.tranche_1, tranche_2: modele.tranche_2, tranche_3: modele.tranche_3,
            date_limite_1: modele.date_limite_1, date_limite_2: modele.date_limite_2, date_limite_3: modele.date_limite_3 }));
          DB.putBatch('frais_scolarite', rows).then(() => { U.toast(rows.length + ' cours renseigné(s)'); EG.majSynchro(); X.recharger(); });
        } }));
      }
    }
    const lignes = niveaux.map(n => ({ n, f: parNiveau[n] || null }));
    const total = f => f ? num(f.frais_inscription) + num(f.tranche_1) + num(f.tranche_2) + num(f.tranche_3) : 0;
    const dateT = (f, k) => f && f['date_limite_' + k] ? ' (avant le ' + U.dateCourte(f['date_limite_' + k]) + ')' : '';
    zone.appendChild(actions);
    zone.appendChild(U.carte('Barème de ' + ecole.nom, U.tableau([
      { titre: 'Cours', valeur: x => x.n }, { titre: 'Élèves', valeur: x => eff(x.n) },
      { titre: 'Droits d’inscription', valeur: x => x.f ? F(x.f.frais_inscription) : '—' },
      { titre: '1re tranche', valeur: x => x.f ? F(x.f.tranche_1) + dateT(x.f, 1) : '—' },
      { titre: '2e tranche', valeur: x => x.f ? F(x.f.tranche_2) + dateT(x.f, 2) : '—' },
      { titre: '3e tranche', valeur: x => x.f ? F(x.f.tranche_3) + dateT(x.f, 3) : '—' },
      { titre: 'Total par élève', valeur: x => x.f ? el('strong', { text: F(total(x.f)) }) : el('span', { class: 'badge attention', text: 'À définir' }) },
      { titre: '', classe: 'col-etroite', valeur: x => X.ecriture ? el('span', { class: 'actions-mini' }, [
        el('button', { class: 'btn btn-fantome btn-petit', text: x.f ? '\uE006' : '＋', 'aria-label': 'Définir le barème de ' + x.n, onclick: () => E.editer('frais_scolarite', x.f || pre(x.n), X.recharger) }),
        x.f ? el('button', { class: 'btn btn-fantome btn-petit btn-alerte', text: '\uE005', 'aria-label': 'Supprimer', onclick: () => U.confirmer('Supprimer le barème', 'Le barème de ' + x.n + ' sera supprimé.', () => DB.remove('frais_scolarite', x.f.id).then(() => { EG.majSynchro(); X.recharger(); }), 'Supprimer') }) : null
      ]) : '' }
    ], lignes, { messageVide: 'Aucune classe ni élève : ajoutez des classes (module Socle) ou définissez le barème d’un cours.' })));
    zone.appendChild(el('p', { class: 'muet petit', text: 'Les montants sont librement fixés par l’école. Les dates limites servent à repérer les retards de paiement. Une remise (fratrie, orphelin, bourse) se saisit dans l’onglet « Paiements et reçus ».' }));
  }

  /* =======================================================================
     Onglet 2 — paiements et reçus
     ======================================================================= */

  function numeroRecu(D) {
    const an = (EG.session.annee_code || '').slice(0, 4) || String(new Date().getFullYear());
    const max = D.paiements.reduce((m, p) => { const k = /(\d+)\s*$/.exec(p.numero_recu || ''); return k ? Math.max(m, Number(k[1])) : m; }, 0);
    return 'R-' + an + '-' + String(max + 1).padStart(4, '0');
  }

  function recuHtml(X, p, s) {
    const i = s.i, apres = s.reste;
    const t = (a, b) => '<tr><td style="width:34%"><strong>' + ech(a) + '</strong></td><td>' + b + '</td></tr>';
    return entetePiece(X, 'REÇU DE PAIEMENT DE SCOLARITÉ', 'reçu n° ' + (p.numero_recu || '—'))
      + '<table>' + t('Reçu de', 'les parents ou tuteurs de <strong>' + ech(i._nom) + '</strong>')
      + t('Cours', ech(nomClasse(i)))
      + t('Somme reçue', '<strong>' + ech(F(p.montant)) + '</strong> (' + ech(enLettres(p.montant)) + ' francs CFA)')
      + t('Objet', ech(U.libelle(p.tranche)))
      + t('Date du paiement', ech(U.dateFR(p.date_paiement)))
      + t('Mode de paiement', ech(U.libelle(p.mode)) + (p.reference ? ' — réf. ' + ech(p.reference) : ''))
      + t('Total déjà versé', ech(F(s.verse)))
      + t('Reste à payer', '<strong>' + ech(F(apres)) + '</strong>') + '</table>';
  }

  function modalPaiement(X, S0) {
    const { D } = X;
    const parId = {}; X.S.forEach(s => { parId[s.i.id] = s; });
    const eleve = el('select', {}, [el('option', { value: '', text: '— Choisir l’élève —' })].concat(X.S.slice().sort((a, b) => a.i._nom.localeCompare(b.i._nom, 'fr'))
      .map(s => el('option', { value: s.i.id, text: s.i._nom + ' — ' + nomClasse(s.i) + (s.reste ? ' (reste ' + F(s.reste) + ')' : ' (soldé)') }))));
    if (S0) eleve.value = S0.i.id;
    const tranche = el('select', {}, TRANCHES.map(t => el('option', { value: t, text: U.libelle(t) })));
    const montant = el('input', { type: 'number', min: '1', step: '1', placeholder: 'FCFA' });
    const date = el('input', { type: 'date', value: aujourdhui() });
    const mode = el('select', {}, ['ESPECES', 'MOBILE_MONEY', 'VIREMENT', 'CHEQUE'].map(m => el('option', { value: m, text: U.libelle(m) })));
    const ref = el('input', { type: 'text', placeholder: 'Transaction, n° de chèque…' });
    const info = el('p', { class: 'muet petit' });
    const majMontant = () => {
      const s = parId[eleve.value]; info.textContent = '';
      if (!s) return;
      if (s.sansBareme) info.textContent = 'Le barème de ' + s.i.niveau + ' n’est pas défini : saisissez le montant reçu.';
      else {
        const due = tranche.value === 'RESTE' ? s.reste : Math.max(0, (s.dus[tranche.value] || 0) - (s.paye[tranche.value] || 0));
        if (due > 0) montant.value = due;
        info.textContent = 'Total dû ' + F(s.aPayer) + ' · déjà versé ' + F(s.verse) + ' · reste ' + F(s.reste) + '.';
      }
    };
    eleve.addEventListener('change', majMontant); tranche.addEventListener('change', majMontant); majMontant();
    const champ = (l, c) => el('div', { class: 'champ' }, [el('label', { text: l }), c]);
    function enregistrer(fermer, imprimer) {
      const s = parId[eleve.value], m = Number(montant.value);
      if (!s) { U.toast('Choisissez l’élève', 'attention'); return; }
      if (!(m > 0)) { U.toast('Saisissez un montant supérieur à zéro', 'attention'); return; }
      const p = { ecole_id: X.ecole.id, annee_scolaire_id: EG.session.annee_id, inscription_id: s.i.id, tranche: tranche.value, montant: m, date_paiement: date.value || aujourdhui(),
        mode: mode.value, numero_recu: numeroRecu(D), reference: ref.value || null };
      DB.put('paiements_scolarite', p).then(rec => DB.audit('PAIEMENT_SCOLARITE', 'paiements_scolarite', rec.id, { montant: m, recu: p.numero_recu }).then(() => rec))
        .then(rec => { fermer(); EG.majSynchro(); U.toast('Paiement enregistré — reçu ' + rec.numero_recu);
          if (imprimer) sceau(X, 'RECU_SCOLARITE', 'Reçu ' + rec.numero_recu, recuHtml(X, rec, Object.assign({}, s, { verse: s.verse + m, reste: Math.max(0, s.aPayer - s.verse - m) })));
          X.recharger(); });
    }
    U.modal('Enregistrer un paiement', el('div', { class: 'formulaire' }, [champ('Élève', eleve), champ('Versement', tranche), champ('Montant reçu (FCFA)', montant), info, champ('Date', date), champ('Mode de paiement', mode), champ('Référence (facultatif)', ref)]),
      fermer => [el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
        el('button', { class: 'btn btn-fantome', text: 'Enregistrer', onclick: () => enregistrer(fermer, false) }),
        el('button', { class: 'btn btn-primaire', text: 'Enregistrer et imprimer le reçu', onclick: () => enregistrer(fermer, true) })]);
  }

  function modalRemise(X) {
    const eleve = el('select', {}, [el('option', { value: '', text: '— Choisir l’élève —' })].concat(X.S.slice().sort((a, b) => a.i._nom.localeCompare(b.i._nom, 'fr'))
      .map(s => el('option', { value: s.i.id, text: s.i._nom + ' — ' + nomClasse(s.i) }))));
    const montant = el('input', { type: 'number', min: '1', step: '1', placeholder: 'FCFA' });
    const motif = el('input', { type: 'text', placeholder: 'Fratrie, orphelin, bourse…' });
    const champ = (l, c) => el('div', { class: 'champ' }, [el('label', { text: l }), c]);
    U.modal('Accorder une remise', el('div', { class: 'formulaire' }, [champ('Élève', eleve), champ('Montant de la remise (FCFA)', montant), champ('Motif', motif)]), fermer => [
      el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
      el('button', { class: 'btn btn-primaire', text: 'Enregistrer', onclick: () => {
        if (!eleve.value || !(Number(montant.value) > 0)) { U.toast('Choisissez l’élève et saisissez le montant', 'attention'); return; }
        DB.put('remises_scolarite', { ecole_id: X.ecole.id, annee_scolaire_id: EG.session.annee_id, inscription_id: eleve.value, montant: Number(montant.value), motif: motif.value || null })
          .then(r => DB.audit('REMISE_SCOLARITE', 'remises_scolarite', r.id)).then(() => { fermer(); EG.majSynchro(); U.toast('Remise enregistrée'); X.recharger(); });
      } })]);
  }

  function paiements(zone, X) {
    const { D } = X;
    const parId = {}; X.S.forEach(s => { parId[s.i.id] = s; });
    const filtre = { classe: '', q: '' };
    const encaisse = somme(D.paiements, p => p.montant), attendu = somme(X.S, s => s.aPayer);
    const moisCourant = aujourdhui().slice(0, 7);
    zone.appendChild(grille([
      U.stat(F(encaisse), 'Encaissé depuis la rentrée', 'ok'), U.stat(F(Math.max(0, attendu - encaisse)), 'Reste à recouvrer', attendu > encaisse ? 'attention' : ''),
      U.stat(attendu ? Math.round(encaisse / attendu * 100) + ' %' : '—', 'Taux de recouvrement'),
      U.stat(F(somme(D.paiements.filter(p => (p.date_paiement || '').slice(0, 7) === moisCourant), p => p.montant)), 'Encaissé ce mois-ci')
    ], 'grille-stats'));
    const barre = el('div', { class: 'barre-filtres' });
    barre.appendChild(U.selecteur('Cours', EG.NIVEAUX.filter(n => D.ins.some(i => i.niveau === n)).map(n => ({ value: n, label: n })), '', v => { filtre.classe = v; liste(); }, { libelleVide: 'Tous les cours' }));
    barre.appendChild(U.champRecherche('Rechercher un élève ou un reçu', v => { filtre.q = sa(v); liste(); }));
    zone.appendChild(barre);
    const actions = el('div', { class: 'barre-actions' });
    if (X.ecriture) {
      actions.appendChild(el('button', { class: 'btn btn-primaire', text: '＋ Enregistrer un paiement', onclick: () => modalPaiement(X) }));
      actions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE071 Accorder une remise', onclick: () => modalRemise(X) }));
    }
    actions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE00C Excel', onclick: () => {
      const rows = visibles(); if (!rows.length) { U.toast('Rien à exporter', 'attention'); return; }
      S().excel('paiements-scolarite-' + S().slug(X.ecole.nom).slice(0, 30), [{ nom: 'Paiements', lignes: [['Date', 'N° reçu', 'Élève', 'Cours', 'Versement', 'Montant (FCFA)', 'Mode', 'Référence']]
        .concat(rows.map(p => [p.date_paiement, p.numero_recu, parId[p.inscription_id] ? parId[p.inscription_id].i._nom : '', parId[p.inscription_id] ? nomClasse(parId[p.inscription_id].i) : '', U.libelle(p.tranche), p.montant, U.libelle(p.mode), p.reference || ''])) }]);
    } }));
    zone.appendChild(actions);
    const zoneListe = el('div'); zone.appendChild(zoneListe);
    const visibles = () => D.paiements.filter(p => { const s = parId[p.inscription_id];
      return (!filtre.classe || (s && s.i.niveau === filtre.classe)) && (!filtre.q || sa([s ? s.i._nom : '', p.numero_recu, p.reference].join(' ')).indexOf(filtre.q) >= 0); })
      .sort((a, b) => String(b.date_paiement).localeCompare(String(a.date_paiement)) || String(b.numero_recu).localeCompare(String(a.numero_recu)));
    function liste() {
      zoneListe.textContent = '';
      zoneListe.appendChild(U.carte('Paiements (' + visibles().length + ')', U.tableau([
        { titre: 'Date', valeur: p => U.dateCourte(p.date_paiement) }, { titre: 'Reçu', valeur: p => p.numero_recu || '—' },
        { titre: 'Élève', valeur: p => parId[p.inscription_id] ? parId[p.inscription_id].i._nom : '—' },
        { titre: 'Cours', valeur: p => parId[p.inscription_id] ? nomClasse(parId[p.inscription_id].i) : '—' },
        { titre: 'Versement', valeur: p => U.libelle(p.tranche) }, { titre: 'Montant', valeur: p => F(p.montant) }, { titre: 'Mode', valeur: p => U.libelle(p.mode) },
        { titre: '', classe: 'col-etroite', valeur: p => el('span', { class: 'actions-mini' }, [
          el('button', { class: 'btn btn-fantome btn-petit', text: '\uE008', 'aria-label': 'Imprimer le reçu', title: 'Imprimer le reçu', onclick: () => { const s = parId[p.inscription_id]; if (s) sceau(X, 'RECU_SCOLARITE', 'Reçu ' + p.numero_recu, recuHtml(X, p, s)); } }),
          X.ecriture ? el('button', { class: 'btn btn-fantome btn-petit btn-alerte', text: '\uE005', 'aria-label': 'Supprimer le paiement', onclick: () => U.confirmer('Supprimer le paiement', 'Le paiement ' + (p.numero_recu || '') + ' de ' + F(p.montant) + ' sera supprimé.', () => DB.remove('paiements_scolarite', p.id).then(() => DB.audit('SUPPRESSION_PAIEMENT', 'paiements_scolarite', p.id)).then(() => { EG.majSynchro(); X.recharger(); }), 'Supprimer') }) : null
        ]) }
      ], visibles(), { messageVide: 'Aucun paiement enregistré pour l’instant.' })));
    }
    liste();
    if (D.remises.length) {
      zone.appendChild(U.carte('Remises et exonérations', U.tableau([
        { titre: 'Élève', valeur: r => parId[r.inscription_id] ? parId[r.inscription_id].i._nom : '—' }, { titre: 'Cours', valeur: r => parId[r.inscription_id] ? nomClasse(parId[r.inscription_id].i) : '—' },
        { titre: 'Montant', valeur: r => F(r.montant) }, { titre: 'Motif', valeur: r => r.motif || '—' },
        { titre: '', classe: 'col-etroite', valeur: r => X.ecriture ? el('button', { class: 'btn btn-fantome btn-petit btn-alerte', text: '\uE005', 'aria-label': 'Supprimer la remise', onclick: () => DB.remove('remises_scolarite', r.id).then(() => { EG.majSynchro(); X.recharger(); }) }) : '' }
      ], D.remises)));
    }
  }

  /* =======================================================================
     Onglet 3 — impayés et relances
     ======================================================================= */

  function impayes(zone, X) {
    const filtre = { classe: '', retard: true };
    const barre = el('div', { class: 'barre-filtres' });
    const { D } = X;
    barre.appendChild(U.selecteur('Cours', EG.NIVEAUX.filter(n => D.ins.some(i => i.niveau === n)).map(n => ({ value: n, label: n })), '', v => { filtre.classe = v; liste(); }, { libelleVide: 'Tous les cours' }));
    barre.appendChild(el('label', { class: 'filtre' }, [el('span', { text: 'Afficher' }), el('select', { onchange: e => { filtre.retard = e.target.value === 'retard'; liste(); } }, [
      el('option', { value: 'retard', text: 'Seulement les retards de paiement' }), el('option', { value: 'reste', text: 'Tous les restes à payer' })])]));
    zone.appendChild(barre);
    const zoneStats = el('div'), zoneListe = el('div'); zone.appendChild(zoneStats); zone.appendChild(zoneListe);
    const visibles = () => X.S.filter(s => (!filtre.classe || s.i.niveau === filtre.classe) && (filtre.retard ? s.retard > 0 : s.reste > 0))
      .sort((a, b) => b.retard - a.retard || b.reste - a.reste || a.i._nom.localeCompare(b.i._nom, 'fr'));
    function relanceHtml(s) {
      const nb = Math.max(s.retard, 0) || s.reste;
      return entetePiece(X, 'CONVOCATION — RETARD DE PAIEMENT DE LA SCOLARITÉ')
        + '<p>Madame, Monsieur, parent ou tuteur de <strong>' + ech(s.i._nom) + '</strong>, élève en <strong>' + ech(nomClasse(s.i)) + '</strong>,</p>'
        + '<p>Sauf erreur ou omission de notre part, il reste dû sur la scolarité de votre enfant la somme de <strong>' + ech(F(s.reste)) + '</strong> (' + ech(enLettres(s.reste)) + ' francs CFA)'
        + (s.retard ? ', dont <strong>' + ech(F(s.retard)) + '</strong> déjà échus' : '') + '.</p>'
        + '<table><tbody><tr><td>Scolarité due (remises déduites)</td><td>' + ech(F(s.aPayer)) + '</td></tr><tr><td>Déjà versé</td><td>' + ech(F(s.verse)) + '</td></tr>'
        + '<tr><td><strong>Reste à payer</strong></td><td><strong>' + ech(F(s.reste)) + '</strong></td></tr></tbody></table>'
        + '<p>Nous vous prions de bien vouloir régulariser cette situation, ou de vous présenter à la direction de l’école, dans les meilleurs délais' + (nb ? '' : '') + '.</p>';
    }
    function liste() {
      const v = visibles();
      zoneStats.textContent = '';
      zoneStats.appendChild(grille([
        U.stat(U.nombre(v.length), filtre.retard ? 'Élèves en retard' : 'Élèves avec un reste', v.length ? 'attention' : 'ok'),
        U.stat(F(somme(v, s => s.retard)), 'Montant en retard'), U.stat(F(somme(v, s => s.reste)), 'Reste à payer (total)'),
        U.stat(U.nombre(X.S.filter(s => s.sansBareme).length), 'Élèves sans barème défini', X.S.some(s => s.sansBareme) ? 'attention' : '')
      ], 'grille-stats'));
      const actions = el('div', { class: 'barre-actions' }, [
        el('button', { class: 'btn btn-fantome', text: '\uE00C Excel', onclick: () => { if (!v.length) { U.toast('Rien à exporter', 'attention'); return; }
          S().excel('impayes-' + S().slug(X.ecole.nom).slice(0, 30), [{ nom: 'Impayés', lignes: [['Élève', 'Cours', 'Dû', 'Versé', 'Reste', 'En retard', 'Prochaine échéance']].concat(v.map(s => [s.i._nom, nomClasse(s.i), s.aPayer, s.verse, s.reste, s.retard, s.echeance || ''])) }]); } }),
        el('button', { class: 'btn btn-fantome', text: '\uE008 Liste des impayés', onclick: () => { if (!v.length) { U.toast('Aucun impayé', 'attention'); return; }
          sceau(X, 'IMPAYES_SCOLARITE', 'Impayés de scolarité', entetePiece(X, 'ÉTAT DES IMPAYÉS DE SCOLARITÉ', 'au ' + U.dateFR(aujourdhui()))
            + X0.htmlTableau(['N°', 'Élève', 'Cours', 'Dû', 'Versé', 'Reste', 'En retard'], v.map((s, k) => [k + 1, s.i._nom, nomClasse(s.i), s.aPayer, s.verse, s.reste, s.retard]).concat([{ gras: true, cells: ['', 'Total', '', somme(v, s => s.aPayer), somme(v, s => s.verse), somme(v, s => s.reste), somme(v, s => s.retard)] }]))); } })
      ]);
      zoneStats.appendChild(actions);
      zoneListe.textContent = '';
      zoneListe.appendChild(U.carte('Impayés (' + v.length + ')', U.tableau([
        { titre: 'Élève', valeur: s => s.i._nom }, { titre: 'Cours', valeur: s => nomClasse(s.i) }, { titre: 'Dû', valeur: s => F(s.aPayer) }, { titre: 'Versé', valeur: s => F(s.verse) },
        { titre: 'Reste', valeur: s => F(s.reste) }, { titre: 'En retard', valeur: s => s.retard ? el('span', { class: 'badge attention', text: F(s.retard) }) : '—' },
        { titre: 'Prochaine échéance', valeur: s => s.echeance ? U.dateCourte(s.echeance) : '—' },
        { titre: '', classe: 'col-etroite', valeur: s => el('span', { class: 'actions-mini' }, [
          el('button', { class: 'btn btn-fantome btn-petit', text: '\uE04F', 'aria-label': 'Imprimer la convocation', title: 'Convocation aux parents', onclick: () => sceau(X, 'RELANCE_SCOLARITE', 'Convocation — ' + s.i._nom, relanceHtml(s)) }),
          X.ecriture ? el('button', { class: 'btn btn-fantome btn-petit', text: '\uE04E', 'aria-label': 'Enregistrer un paiement', title: 'Enregistrer un paiement', onclick: () => modalPaiement(X, s) }) : null]) }
      ], v, { messageVide: filtre.retard ? 'Aucun retard de paiement : tout ce qui est échu a été réglé.' : 'Tout est soldé.' })));
    }
    liste();
  }

  /* =======================================================================
     Onglet 4 — fonds reçus par classe
     ======================================================================= */

  function classes(zone, X) {
    const { D, ecole } = X;
    const lignes = D.classes.slice().sort((a, b) => EG.NIVEAUX.indexOf(a.niveau) - EG.NIVEAUX.indexOf(b.niveau)).map(c => {
      const ss = X.S.filter(s => s.i.classe_id === c.id);
      const tit = c.titulaire_id ? D.pers.filter(p => p.id === c.titulaire_id)[0] : null;
      const salaire = tit ? num(tit.salaire_mensuel) : 0;
      const recu = somme(ss, s => s.verse);
      const par = t => somme(ss, s => s.paye[t]);
      return { c, effectif: ss.length, parEleve: ss.length ? Math.round(somme(ss, s => s.total) / ss.length) : 0, attendu: somme(ss, s => s.aPayer), recu, reste: somme(ss, s => s.reste),
        t0: par('INSCRIPTION'), t1: par('TRANCHE_1'), t2: par('TRANCHE_2'), t3: par('TRANCHE_3'), tr: par('RESTE'), tit, salaire, mois: salaire ? Math.round(recu / salaire * 10) / 10 : null };
    });
    const sans = X.S.filter(s => !s.i.classe_id).length;
    const tot = { effectif: somme(lignes, l => l.effectif), attendu: somme(lignes, l => l.attendu), recu: somme(lignes, l => l.recu), reste: somme(lignes, l => l.reste) };
    zone.appendChild(grille([
      U.stat(U.nombre(tot.effectif), 'Élèves en classe'), U.stat(F(tot.attendu), 'Fonds attendus'), U.stat(F(tot.recu), 'Fonds reçus', 'ok'), U.stat(tot.attendu ? Math.round(tot.recu / tot.attendu * 100) + ' %' : '—', 'Taux de recouvrement')
    ], 'grille-stats'));
    const enTete = ['Classe', 'Effectif', 'Scolarité par élève', 'Attendu', 'Reçu', 'Reste', '%', 'Inscription', '1re tranche', '2e tranche', '3e tranche', 'Reste versé', 'Titulaire', 'Salaire mensuel', 'Mois de salaire couverts'];
    const ligneTab = l => [l.c.libelle || l.c.code, l.effectif, l.parEleve, l.attendu, l.recu, l.reste, l.attendu ? Math.round(l.recu / l.attendu * 100) + ' %' : '—', l.t0, l.t1, l.t2, l.t3, l.tr,
      l.tit ? ((l.tit.nom || '').toUpperCase() + ' ' + (l.tit.prenoms || '')).trim() : '—', l.salaire || '—', l.mois === null ? '—' : l.mois];
    zone.appendChild(el('div', { class: 'barre-actions' }, [
      el('button', { class: 'btn btn-fantome', text: '\uE00C Excel', onclick: () => { if (!lignes.length) { U.toast('Rien à exporter', 'attention'); return; } S().excel('fonds-par-classe-' + S().slug(ecole.nom).slice(0, 30), [{ nom: 'Fonds par classe', lignes: [enTete].concat(lignes.map(ligneTab)) }]); } }),
      el('button', { class: 'btn btn-fantome', text: '\uE008 Imprimer l’état', onclick: () => { if (!lignes.length) { U.toast('Aucune classe', 'attention'); return; }
        sceau(X, 'FONDS_CLASSES', 'Fonds reçus par classe', entetePiece(X, 'ÉTAT DES FONDS REÇUS PAR CLASSE', 'au ' + U.dateFR(aujourdhui()))
          + X0.htmlTableau(enTete.slice(0, 12), lignes.map(ligneTab).map(r => r.slice(0, 12)).concat([{ gras: true, cells: ['Total', tot.effectif, '', tot.attendu, tot.recu, tot.reste, tot.attendu ? Math.round(tot.recu / tot.attendu * 100) + ' %' : '—', somme(lignes, l => l.t0), somme(lignes, l => l.t1), somme(lignes, l => l.t2), somme(lignes, l => l.t3), somme(lignes, l => l.tr)] }]))
          + '<p class="muet">Fonds attendus = effectif de chaque cours × barème de l’école, remises déduites.</p>'); } })
    ]));
    zone.appendChild(U.carte('Fonds reçus par classe — ' + ecole.nom, U.tableau([
      { titre: 'Classe', valeur: l => l.c.libelle || l.c.code }, { titre: 'Effectif', valeur: l => l.effectif }, { titre: 'Par élève', valeur: l => F(l.parEleve) },
      { titre: 'Attendu', valeur: l => F(l.attendu) }, { titre: 'Reçu', valeur: l => el('strong', { text: F(l.recu) }) }, { titre: 'Reste', valeur: l => F(l.reste) },
      { titre: '%', valeur: l => l.attendu ? Math.round(l.recu / l.attendu * 100) + ' %' : '—' },
      { titre: 'Inscr. · 1re · 2e · 3e', valeur: l => [l.t0, l.t1, l.t2, l.t3].map(v => U.nombre(v)).join(' · ') },
      { titre: 'Titulaire', valeur: l => l.tit ? (l.tit.nom || '').toUpperCase() : '—' },
      { titre: 'Mois de salaire couverts', valeur: l => l.mois === null ? '—' : l.mois + ' mois' }
    ], lignes, { messageVide: 'Aucune classe ouverte cette année dans cette école.' })));
    if (sans) zone.appendChild(el('p', { class: 'muet petit', text: sans + ' élève(s) n’ont pas de classe : leurs paiements ne figurent pas dans ce tableau.' }));
    zone.appendChild(el('p', { class: 'muet petit', text: 'Le nombre de mois de salaire couverts compare les fonds reçus de la classe au salaire mensuel de son titulaire (fixé dans l’onglet Salaires).' }));
  }

  /* =======================================================================
     Cahier de gestion des fonds
     ======================================================================= */

  /** Les écritures du cahier : saisies manuelles + paiements de scolarité + salaires payés. */
  function ecritures(D, S0) {
    const parId = {}; S0.forEach(s => { parId[s.i.id] = s; });
    const parPers = {}; D.pers.forEach(p => { parPers[p.id] = p; });
    const lignes = D.cahier.map(c => ({ id: c.id, date: c.date_operation, sens: c.sens, categorie: c.categorie, libelle: c.libelle, montant: num(c.montant), piece: c.piece || '', auto: false, rec: c }));
    D.paiements.forEach(p => lignes.push({ id: 'p:' + p.id, date: p.date_paiement, sens: 'RECETTE', categorie: p.tranche === 'INSCRIPTION' ? 'INSCRIPTION' : 'SCOLARITE',
      libelle: 'Scolarité — ' + (parId[p.inscription_id] ? parId[p.inscription_id].i._nom : 'élève') + ' — ' + U.libelle(p.tranche), montant: num(p.montant), piece: p.numero_recu || '', auto: true }));
    D.salaires.filter(s => s.statut === 'PAYE').forEach(s => { const a = parPers[s.personnel_id];
      lignes.push({ id: 's:' + s.id, date: s.date_paiement || (s.mois + '-28'), sens: 'DEPENSE', categorie: 'SALAIRES', libelle: 'Salaire ' + libMois(s.mois) + ' — ' + (a ? (a.nom || '').toUpperCase() + ' ' + (a.prenoms || '') : 'enseignant'),
        montant: num(s.net), piece: 'Paie ' + s.mois, auto: true }); });
    return lignes.sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a.sens === 'RECETTE' ? -1 : 1));
  }

  function cahier(zone, X) {
    const { D, ecole } = X;
    const tout = ecritures(D, X.S);
    const filtre = { mois: '' };
    const mois = Array.from(new Set(tout.map(l => (l.date || '').slice(0, 7)).filter(Boolean))).sort();
    const barre = el('div', { class: 'barre-filtres' });
    barre.appendChild(U.selecteur('Période', mois.map(m => ({ value: m, label: libMois(m) })), '', v => { filtre.mois = v; liste(); }, { libelleVide: 'Toute l’année scolaire' }));
    zone.appendChild(barre);
    const zoneStats = el('div'), zoneListe = el('div'); zone.appendChild(zoneStats); zone.appendChild(zoneListe);
    const pre = sens => ({ ecole_id: ecole.id, annee_scolaire_id: EG.session.annee_id, sens, date_operation: aujourdhui(), categorie: sens === 'RECETTE' ? 'AUTRE_RECETTE' : 'AUTRE_DEPENSE' });

    function liste() {
      const avant = filtre.mois ? tout.filter(l => (l.date || '').slice(0, 7) < filtre.mois) : [];
      const report = somme(avant.filter(l => l.sens === 'RECETTE'), l => l.montant) - somme(avant.filter(l => l.sens === 'DEPENSE'), l => l.montant);
      const v = filtre.mois ? tout.filter(l => (l.date || '').slice(0, 7) === filtre.mois) : tout;
      const rec = somme(v.filter(l => l.sens === 'RECETTE'), l => l.montant), dep = somme(v.filter(l => l.sens === 'DEPENSE'), l => l.montant);
      let cumul = report;
      const rows = v.map(l => { cumul += l.sens === 'RECETTE' ? l.montant : -l.montant; return Object.assign({ solde: cumul }, l); });
      zoneStats.textContent = '';
      zoneStats.appendChild(grille([U.stat(F(rec), 'Recettes', 'ok'), U.stat(F(dep), 'Dépenses'), U.stat(F(report + rec - dep), 'Solde en caisse', report + rec - dep < 0 ? 'attention' : ''), U.stat(F(report), 'Report des périodes précédentes')], 'grille-stats'));
      const actions = el('div', { class: 'barre-actions' });
      if (X.ecriture) {
        actions.appendChild(el('button', { class: 'btn btn-primaire', text: '＋ Recette', onclick: () => E.editer('cahier_fonds', pre('RECETTE'), X.recharger) }));
        actions.appendChild(el('button', { class: 'btn btn-primaire', text: '＋ Dépense', onclick: () => E.editer('cahier_fonds', pre('DEPENSE'), X.recharger) }));
      }
      const titre = 'Cahier de gestion des fonds' + (filtre.mois ? ' — ' + libMois(filtre.mois) : '');
      const enTete = ['Date', 'Pièce', 'Libellé', 'Rubrique', 'Recettes', 'Dépenses', 'Solde'];
      const cellules = rows.map(l => [U.dateCourte(l.date), l.piece, l.libelle, U.libelle(l.categorie), l.sens === 'RECETTE' ? l.montant : '', l.sens === 'DEPENSE' ? l.montant : '', l.solde]);
      actions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE00C Excel', onclick: () => { if (!rows.length) { U.toast('Rien à exporter', 'attention'); return; } S().excel('cahier-fonds-' + S().slug(ecole.nom).slice(0, 30), [{ nom: 'Cahier de caisse', lignes: [enTete].concat([['', '', 'Report', '', '', '', report]], cellules, [['', '', 'Total', '', rec, dep, report + rec - dep]]) }]); } }));
      actions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE008 Imprimer (signé, avec QR)', onclick: () => { if (!rows.length) { U.toast('Aucune écriture', 'attention'); return; }
        sceau(X, 'CAHIER_FONDS', titre, entetePiece(X, titre.toUpperCase()) + X0.htmlTableau(enTete, [['', '', 'Report des périodes précédentes', '', '', '', report]].concat(cellules, [{ gras: true, cells: ['', '', 'Total', '', rec, dep, report + rec - dep] }]))); } }));
      zoneStats.appendChild(actions);
      zoneListe.textContent = '';
      zoneListe.appendChild(U.carte(titre, U.tableau([
        { titre: 'Date', valeur: l => U.dateCourte(l.date) }, { titre: 'Pièce', valeur: l => l.piece || '—' },
        { titre: 'Libellé', valeur: l => l.auto ? el('span', {}, [l.libelle + ' ', el('span', { class: 'badge info', text: 'auto', title: 'Écriture reprise du module ' + (l.sens === 'RECETTE' ? 'Scolarité' : 'Salaires') })]) : l.libelle },
        { titre: 'Rubrique', valeur: l => U.libelle(l.categorie) }, { titre: 'Recettes', classe: 'num', valeur: l => l.sens === 'RECETTE' ? F(l.montant) : '' },
        { titre: 'Dépenses', classe: 'num', valeur: l => l.sens === 'DEPENSE' ? F(l.montant) : '' }, { titre: 'Solde', classe: 'num', valeur: l => F(l.solde) },
        { titre: '', classe: 'col-etroite', valeur: l => (X.ecriture && !l.auto) ? el('span', { class: 'actions-mini' }, [
          el('button', { class: 'btn btn-fantome btn-petit', text: '\uE006', 'aria-label': 'Modifier', onclick: () => E.editer('cahier_fonds', l.rec, X.recharger) }),
          el('button', { class: 'btn btn-fantome btn-petit btn-alerte', text: '\uE005', 'aria-label': 'Supprimer', onclick: () => U.confirmer('Supprimer l’écriture', l.libelle + ' — ' + F(l.montant), () => DB.remove('cahier_fonds', l.id).then(() => { EG.majSynchro(); X.recharger(); }), 'Supprimer') })]) : '' }
      ], rows, { messageVide: 'Aucune écriture : les paiements de scolarité et les salaires payés y figurent automatiquement, les autres recettes et dépenses se saisissent ici.' })));
      zoneListe.appendChild(el('p', { class: 'muet petit', text: 'Les lignes « auto » viennent des modules Scolarité (paiements) et Salaires (paie payée) : elles ne se saisissent pas deux fois. Un report de l’année précédente se saisit comme une recette « Autre recette ».' }));
    }
    liste();
  }

  Routeur.definir('caisse-privee', function (racine, args, params) {
    const onglet = args && args[0] === 'bilan' ? 'bilan' : 'cahier';
    ecranPrive(racine, params, {
      module: 'caisse-privee', actif: 'caisse-privee/' + onglet, titre: 'Cahier de gestion des fonds — école privée',
      sous: 'Recettes, dépenses et solde de l’école : le livre de caisse propre à chaque école privée.',
      rendre: (zone, X) => (onglet === 'bilan' ? bilan : cahier)(zone, X)
    });
  });

  function bilan(zone, X) {
    const { D, ecole } = X;
    const tout = ecritures(D, X.S);
    if (!tout.length) { carteVide(zone, 'Aucune écriture pour établir le bilan.'); return; }
    const mois = Array.from(new Set(tout.map(l => (l.date || '').slice(0, 7)).filter(Boolean))).sort();
    let cumul = 0;
    const lignes = mois.map(m => {
      const v = tout.filter(l => (l.date || '').slice(0, 7) === m);
      const sc = somme(v.filter(l => l.sens === 'RECETTE' && (l.categorie === 'SCOLARITE' || l.categorie === 'INSCRIPTION')), l => l.montant);
      const ar = somme(v.filter(l => l.sens === 'RECETTE'), l => l.montant) - sc;
      const sal = somme(v.filter(l => l.sens === 'DEPENSE' && l.categorie === 'SALAIRES'), l => l.montant);
      const ad = somme(v.filter(l => l.sens === 'DEPENSE'), l => l.montant) - sal;
      cumul += sc + ar - sal - ad;
      return { m, sc, ar, sal, ad, solde: sc + ar - sal - ad, cumul };
    });
    const T = { sc: somme(lignes, l => l.sc), ar: somme(lignes, l => l.ar), sal: somme(lignes, l => l.sal), ad: somme(lignes, l => l.ad) };
    const recettes = T.sc + T.ar, depenses = T.sal + T.ad;
    zone.appendChild(grille([U.stat(F(recettes), 'Recettes de l’année', 'ok'), U.stat(F(depenses), 'Dépenses de l’année'), U.stat(F(recettes - depenses), 'Solde', recettes - depenses < 0 ? 'attention' : 'ok'),
      U.stat(recettes ? Math.round(T.sal / recettes * 100) + ' %' : '—', 'Part des salaires dans les recettes')], 'grille-stats'));
    const enTete = ['Mois', 'Scolarité et inscriptions', 'Autres recettes', 'Total recettes', 'Salaires', 'Autres dépenses', 'Total dépenses', 'Solde du mois', 'Solde cumulé'];
    const ligneTab = l => [libMois(l.m), l.sc, l.ar, l.sc + l.ar, l.sal, l.ad, l.sal + l.ad, l.solde, l.cumul];
    const parRubrique = {};
    tout.forEach(l => { const k = l.sens + '|' + l.categorie; parRubrique[k] = (parRubrique[k] || 0) + l.montant; });
    const rub = Object.keys(parRubrique).sort().map(k => [U.libelle(k.split('|')[0]), U.libelle(k.split('|')[1]), parRubrique[k]]);
    const titre = 'Bilan financier — ' + (X.annee ? X.annee.code : '');
    zone.appendChild(el('div', { class: 'barre-actions' }, [
      el('button', { class: 'btn btn-fantome', text: '\uE00C Excel', onclick: () => S().excel('bilan-financier-' + S().slug(ecole.nom).slice(0, 30), [{ nom: 'Par mois', lignes: [enTete].concat(lignes.map(ligneTab), [['Total', T.sc, T.ar, recettes, T.sal, T.ad, depenses, recettes - depenses, '']]) }, { nom: 'Par rubrique', lignes: [['Sens', 'Rubrique', 'Montant (FCFA)']].concat(rub) }]) }),
      el('button', { class: 'btn btn-fantome', text: '\uE008 Imprimer (signé, avec QR)', onclick: () => sceau(X, 'BILAN_FINANCIER', titre, entetePiece(X, titre.toUpperCase())
        + X0.htmlTableau(enTete, lignes.map(ligneTab).concat([{ gras: true, cells: ['Total', T.sc, T.ar, recettes, T.sal, T.ad, depenses, recettes - depenses, ''] }]))
        + '<h3>Par rubrique</h3>' + X0.htmlTableau(['Sens', 'Rubrique', 'Montant'], rub)) })
    ]));
    zone.appendChild(U.carte('Recettes et dépenses par mois', el('div', { class: 'tableau-enveloppe defilant' }, el('table', { class: 'tableau grille-notes' }, [
      el('thead', {}, el('tr', {}, enTete.map(t => el('th', { text: t })))),
      el('tbody', {}, lignes.map(l => el('tr', {}, ligneTab(l).map((v, k) => k === 0 ? el('th', { class: 'colle', text: v }) : el('td', { text: F(v) }))))
        .concat([el('tr', { class: 'ligne-totaux' }, ['Total', T.sc, T.ar, recettes, T.sal, T.ad, depenses, recettes - depenses, ''].map((v, k) => k === 0 ? el('th', { class: 'colle', text: v }) : el('td', { class: 'cel-calc', text: v === '' ? '' : F(v) })))]))
    ]))));
    zone.appendChild(U.carte('Par rubrique', U.tableau([{ titre: 'Sens', valeur: r => r[0] }, { titre: 'Rubrique', valeur: r => r[1] }, { titre: 'Montant', valeur: r => F(r[2]) }], rub)));
  }

  /* =======================================================================
     Salaires des enseignants
     ======================================================================= */

  function bulletinHtml(X, s, a) {
    const t = (k, v) => '<tr><td style="width:40%"><strong>' + ech(k) + '</strong></td><td>' + v + '</td></tr>';
    return entetePiece(X, 'BULLETIN DE PAIE', libMois(s.mois))
      + '<table>' + t('Agent', ech(((a.nom || '').toUpperCase() + ' ' + (a.prenoms || '')).trim())) + t('Matricule', ech(a.matricule || '—')) + t('Fonction', ech(U.libelle(a.fonction)))
      + t('Salaire de base', ech(F(s.salaire_brut))) + t('Primes', ech(F(s.primes))) + t('Retenues', ech(F(s.retenues)))
      + t('Net à payer', '<strong>' + ech(F(s.net)) + '</strong> (' + ech(enLettres(s.net)) + ' francs CFA)')
      + t('Statut', s.statut === 'PAYE' ? 'Payé le ' + ech(U.dateFR(s.date_paiement)) + ' — ' + ech(U.libelle(s.mode)) : 'À payer') + '</table>';
  }

  function paie(zone, X) {
    const { D, ecole } = X;
    const filtre = { mois: aujourdhui().slice(0, 7) };
    const parPers = {}; D.pers.forEach(p => { parPers[p.id] = p; });
    const nomAgent = a => a ? ((a.nom || '').toUpperCase() + ' ' + (a.prenoms || '')).trim() : '—';
    const barre = el('div', { class: 'barre-filtres' }, el('label', { class: 'filtre' }, [el('span', { text: 'Mois' }),
      el('input', { type: 'month', value: filtre.mois, onchange: e => { filtre.mois = e.target.value || filtre.mois; liste(); } })]));
    zone.appendChild(barre);
    const zoneStats = el('div'), zoneListe = el('div'); zone.appendChild(zoneStats); zone.appendChild(zoneListe);

    function fixerSalaires() {
      const champs = D.pers.slice().sort((a, b) => nomAgent(a).localeCompare(nomAgent(b), 'fr')).map(a => ({ a, inp: el('input', { type: 'number', min: '0', step: '1000', value: a.salaire_mensuel || '', placeholder: 'FCFA' }) }));
      U.modal('Salaires mensuels convenus', el('div', { class: 'formulaire' }, [el('p', { class: 'muet petit', text: 'Le salaire de base de chaque enseignant de l’école : il sert à générer la paie de chaque mois.' })]
        .concat(champs.map(c => el('div', { class: 'champ' }, [el('label', { text: nomAgent(c.a) }), c.inp])))), fermer => [
        el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
        el('button', { class: 'btn btn-primaire', text: 'Enregistrer', onclick: () => {
          const rows = champs.filter(c => Number(c.inp.value) !== num(c.a.salaire_mensuel)).map(c => Object.assign({}, c.a, { salaire_mensuel: Number(c.inp.value) || 0 }));
          (rows.length ? DB.putBatch('personnels', rows) : Promise.resolve()).then(() => { fermer(); U.toast(rows.length + ' salaire(s) mis à jour'); EG.majSynchro(); X.recharger(); });
        } })]);
    }

    function generer() {
      const existants = {}; D.salaires.filter(s => s.mois === filtre.mois).forEach(s => { existants[s.personnel_id] = true; });
      const precedent = {}; D.salaires.filter(s => s.mois < filtre.mois).sort((a, b) => a.mois.localeCompare(b.mois)).forEach(s => { precedent[s.personnel_id] = s; });
      const rows = D.pers.filter(a => !existants[a.id] && (num(a.salaire_mensuel) > 0 || precedent[a.id])).map(a => {
        const p = precedent[a.id], brut = num(a.salaire_mensuel) || num(p && p.salaire_brut), primes = p ? num(p.primes) : 0, ret = p ? num(p.retenues) : 0;
        return { ecole_id: ecole.id, annee_scolaire_id: EG.session.annee_id, personnel_id: a.id, mois: filtre.mois, salaire_brut: brut, primes, retenues: ret, net: brut + primes - ret, statut: 'A_PAYER', mode: 'ESPECES' };
      });
      if (!rows.length) { U.toast(D.pers.some(a => num(a.salaire_mensuel) > 0) ? 'La paie de ce mois est déjà générée' : 'Fixez d’abord les salaires mensuels des enseignants', 'attention'); return; }
      DB.putBatch('salaires_ecole', rows).then(() => { U.toast('Paie de ' + libMois(filtre.mois) + ' générée pour ' + rows.length + ' agent(s)'); EG.majSynchro(); X.recharger(); });
    }

    function payer(s) {
      const mode = el('select', {}, ['ESPECES', 'MOBILE_MONEY', 'VIREMENT', 'CHEQUE'].map(m => el('option', { value: m, text: U.libelle(m) })));
      const date = el('input', { type: 'date', value: aujourdhui() });
      U.modal('Payer le salaire — ' + nomAgent(parPers[s.personnel_id]), el('div', { class: 'formulaire' }, [
        el('p', { text: 'Net à payer : ' + F(s.net) + ' pour ' + libMois(s.mois) + '.' }),
        el('div', { class: 'champ' }, [el('label', { text: 'Date du paiement' }), date]), el('div', { class: 'champ' }, [el('label', { text: 'Mode' }), mode])]), fermer => [
        el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
        el('button', { class: 'btn btn-primaire', text: 'Confirmer le paiement', onclick: () => DB.put('salaires_ecole', Object.assign({}, s, { statut: 'PAYE', date_paiement: date.value || aujourdhui(), mode: mode.value }))
          .then(r => DB.audit('PAIEMENT_SALAIRE', 'salaires_ecole', r.id, { net: s.net })).then(() => { fermer(); EG.majSynchro(); U.toast('Salaire payé'); X.recharger(); }) })]);
    }

    function liste() {
      const v = D.salaires.filter(s => s.mois === filtre.mois).sort((a, b) => nomAgent(parPers[a.personnel_id]).localeCompare(nomAgent(parPers[b.personnel_id]), 'fr'));
      zoneStats.textContent = '';
      zoneStats.appendChild(grille([U.stat(U.nombre(v.length), 'Enseignants payés ou à payer'), U.stat(F(somme(v, s => s.net)), 'Masse salariale nette'),
        U.stat(F(somme(v.filter(s => s.statut === 'PAYE'), s => s.net)), 'Déjà payé', 'ok'), U.stat(F(somme(v.filter(s => s.statut !== 'PAYE'), s => s.net)), 'Reste à payer', v.some(s => s.statut !== 'PAYE') ? 'attention' : '')], 'grille-stats'));
      const actions = el('div', { class: 'barre-actions' });
      if (X.ecriture) {
        actions.appendChild(el('button', { class: 'btn btn-primaire', text: 'Générer la paie du mois', onclick: generer }));
        actions.appendChild(el('button', { class: 'btn btn-fantome', text: 'Fixer les salaires mensuels', onclick: fixerSalaires }));
        actions.appendChild(el('button', { class: 'btn btn-fantome', text: '＋ Ligne de salaire', onclick: () => E.editer('salaires_ecole', { ecole_id: ecole.id, annee_scolaire_id: EG.session.annee_id, mois: filtre.mois, primes: 0, retenues: 0, statut: 'A_PAYER', mode: 'ESPECES' }, X.recharger) }));
      }
      const titre = 'État de paie — ' + libMois(filtre.mois);
      const enTete = ['Agent', 'Salaire de base', 'Primes', 'Retenues', 'Net à payer', 'Statut'];
      const cel = v.map(s => [nomAgent(parPers[s.personnel_id]), s.salaire_brut, s.primes, s.retenues, s.net, U.libelle(s.statut)]);
      actions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE00C Excel', onclick: () => { if (!v.length) { U.toast('Rien à exporter', 'attention'); return; } S().excel('paie-' + filtre.mois, [{ nom: 'Paie', lignes: [enTete].concat(cel) }]); } }));
      actions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE008 État de paie', onclick: () => { if (!v.length) { U.toast('Aucune paie ce mois-ci', 'attention'); return; }
        sceau(X, 'ETAT_PAIE', titre, entetePiece(X, titre.toUpperCase()) + X0.htmlTableau(enTete, cel.concat([{ gras: true, cells: ['Total', somme(v, s => s.salaire_brut), somme(v, s => s.primes), somme(v, s => s.retenues), somme(v, s => s.net), ''] }]))); } }));
      zoneStats.appendChild(actions);
      zoneListe.textContent = '';
      zoneListe.appendChild(U.carte(titre, U.tableau([
        { titre: 'Agent', valeur: s => nomAgent(parPers[s.personnel_id]) }, { titre: 'Salaire de base', valeur: s => F(s.salaire_brut) }, { titre: 'Primes', valeur: s => F(s.primes) },
        { titre: 'Retenues', valeur: s => F(s.retenues) }, { titre: 'Net à payer', valeur: s => el('strong', { text: F(s.net) }) },
        { titre: 'Statut', valeur: s => el('span', { class: 'badge ' + (s.statut === 'PAYE' ? 'ok' : 'attention'), text: U.libelle(s.statut) + (s.statut === 'PAYE' && s.date_paiement ? ' le ' + U.dateCourte(s.date_paiement) : '') }) },
        { titre: '', classe: 'col-etroite', valeur: s => el('span', { class: 'actions-mini' }, [
          X.ecriture && s.statut !== 'PAYE' ? el('button', { class: 'btn btn-fantome btn-petit', text: '\uE003 Payer', onclick: () => payer(s) }) : null,
          el('button', { class: 'btn btn-fantome btn-petit', text: '\uE008', 'aria-label': 'Bulletin de paie', title: 'Bulletin de paie', onclick: () => { const a = parPers[s.personnel_id]; if (a) sceau(X, 'BULLETIN_PAIE', 'Bulletin de paie — ' + nomAgent(a), bulletinHtml(X, s, a)); } }),
          X.ecriture && s.statut !== 'PAYE' ? el('button', { class: 'btn btn-fantome btn-petit', text: '\uE006', 'aria-label': 'Modifier', onclick: () => E.editer('salaires_ecole', s, X.recharger) }) : null,
          X.ecriture && s.statut !== 'PAYE' ? el('button', { class: 'btn btn-fantome btn-petit btn-alerte', text: '\uE005', 'aria-label': 'Supprimer', onclick: () => DB.remove('salaires_ecole', s.id).then(() => { EG.majSynchro(); X.recharger(); }) }) : null]) }
      ], v, { messageVide: 'Aucune paie pour ce mois : fixez les salaires mensuels puis générez la paie.' })));
      zoneListe.appendChild(el('p', { class: 'muet petit', text: 'Net à payer = salaire de base + primes − retenues. Un salaire payé est reporté automatiquement dans le cahier de caisse.' }));
    }
    liste();
  }

  Routeur.definir('salaires-privee', function (racine, args, params) {
    ecranPrive(racine, params, {
      module: 'salaires-privee', actif: 'salaires-privee/paie', titre: 'Salaires des enseignants — école privée',
      sous: 'Salaire de base, primes et retenues de chaque enseignant, paie du mois et bulletins de paie.', rendre: paie
    });
  });

  EG.FinancesPrivees = { enLettres, situations, ecritures };
})(window);
