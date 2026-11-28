/* ÉduGestion Pro Master — la gestion de carrière des agents publics.

   carrieres          le suivi de tous les agents publics du périmètre : statut, grade, ancienneté, dernier et
                      prochain avancement d'échelon, départ à la retraite, complétude du dossier ;
   carriere/<agent>   le dossier de carrière d'un agent : frise des actes, avancement d'échelon en un geste
                      (qui met à jour la fiche de l'agent), projection des échelons jusqu'à la retraite,
                      affectations, diplômes, formations, et fiche de carrière imprimable (numérotée, scellée,
                      signée, avec code QR de vérification).

   Règles de gestion (paramétrables ci-dessous) :
   - l'avancement d'échelon est dû tous les DUREE_ECHELON mois à compter du dernier acte qui fixe l'échelon
     (recrutement, titularisation, avancement, promotion, reclassement) ;
   - sans acte connu, la date du dernier avancement est « à renseigner » : l'application ne suppose rien ;
   - le départ à la retraite suit les règles de la rubrique Retraite (âge selon la catégorie).

   Les agents des écoles privées ne relèvent pas de ce module : ils sont payés par leur école. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, R = EG.Rules, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans, X0 = EG.EcransCS, C = EG.Categories;
  const S = () => EG.Sortie;
  const sa = U.sansAccent;
  const ech = s => EG.Docs.echapper(s);

  const DUREE_ECHELON = 24;        // mois entre deux avancements d'échelon
  const ECHELON_MAX = 15;          // borne du référentiel (voir la fiche « Échelon »)
  const ACTES_ECHELON = ['RECRUTEMENT', 'TITULARISATION', 'AVANCEMENT_ECHELON', 'PROMOTION_GRADE', 'RECLASSEMENT'];
  const ICONES = { RECRUTEMENT: '\uE05C', TITULARISATION: '\uE004', AVANCEMENT_ECHELON: '\uE076', PROMOTION_GRADE: '\uE04D', RECLASSEMENT: '\uE058', MUTATION: '\uE02D', DETACHEMENT: '\uE057',
    DISPONIBILITE: '\uE06A', MISE_A_DISPOSITION: '\uE044', REPRISE_SERVICE: '\uE039', CONGE: '\uE06B', DISTINCTION: '\uE04D', SANCTION: '\uE041', ADMISSION_RETRAITE: '\uE019', AUTRE: '\uE00D' };
  const aujourdhui = () => new Date().toISOString().slice(0, 10);
  /** Anciennetés arrêtées au 31 décembre de la seconde année de l'année scolaire active (« 2026-2027 » → 2027-12-31).
      L'avancement d'échelon et la retraite restent calculés à la date du jour. */
  function refAnciennete() {
    const an = (/(\d{4})\D+(\d{4})/.exec((EG.session && EG.session.annee_code) || '') || [])[2];
    return an ? an + '-12-31' : new Date().getFullYear() + '-12-31';
  }
  const libAnc = () => 'Ancienneté (au 31/12/' + refAnciennete().slice(0, 4) + ')';
  const nomAgent = a => a ? ((a.nom || '').toUpperCase() + ' ' + (a.prenoms || '')).trim() : '—';

  /* =======================================================================
     Calculs
     ======================================================================= */

  function ajouteMois(iso, n) {
    const d = new Date(iso + 'T00:00:00Z'); if (isNaN(d.getTime())) return null;
    const j = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
    const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(j, fin));
    return d.toISOString().slice(0, 10);
  }
  function moisEntre(a, b) {
    const x = new Date(a + 'T00:00:00Z'), y = new Date(b + 'T00:00:00Z');
    if (isNaN(x.getTime()) || isNaN(y.getTime())) return null;
    let m = (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + (y.getUTCMonth() - x.getUTCMonth());
    if (y.getUTCDate() < x.getUTCDate()) m -= 1;
    return m;
  }
  function duree(mois) {
    if (mois === null || mois === undefined) return '—';
    const m = Math.max(0, mois), a = Math.floor(m / 12), r = m % 12;
    return (a ? a + ' an' + (a > 1 ? 's' : '') : '') + (a && r ? ' ' : '') + (r || !a ? r + ' mois' : '');
  }

  /**
   * Situation de carrière d'un agent.
   * ctx = { actes: [...], regles: [...], ecole: {...} | null, diplomes: nombre }
   */
  function situation(p, ctx, ref) {
    ref = ref || aujourdhui();
    const actes = (ctx.actes || []).filter(a => a.date_effet).slice().sort((a, b) => String(a.date_effet).localeCompare(String(b.date_effet)));
    const debut = p.date_premiere_prise_service || (actes.filter(a => a.type_acte === 'RECRUTEMENT')[0] || {}).date_effet || null;
    const m0 = debut ? moisEntre(debut, ctx.refAnc || refAnciennete()) : null, anc = m0 == null ? null : Math.max(0, m0);
    const pivots = actes.filter(a => ACTES_ECHELON.indexOf(a.type_acte) >= 0 && a.date_effet <= ref);
    const dernier = pivots.length ? pivots[pivots.length - 1] : null;
    const echelon = num(p.echelon) || num((actes.filter(a => a.echelon && a.date_effet <= ref).pop() || {}).echelon) || null;
    let etat = 'INCONNU', prochaine = null, retard = 0, dans = null;
    if (echelon && echelon >= ECHELON_MAX) etat = 'MAX';
    else if (dernier) {
      prochaine = ajouteMois(dernier.date_effet, DUREE_ECHELON);
      if (prochaine <= ref) { etat = 'RETARD'; retard = moisEntre(prochaine, ref) || 0; } else { etat = 'A_JOUR'; dans = moisEntre(ref, prochaine); }
    }
    const prevision = R.previsionRetraite(p, ctx.regles || [], ref);
    const controles = [
      ['Matricule', !!p.matricule], ['Date de naissance', !!p.date_naissance], ['Première prise de service', !!p.date_premiere_prise_service],
      ['Grade', !!p.grade], ['Catégorie', !!p.categorie], ['Échelon', !!p.echelon], ['Au moins un acte de carrière', actes.length > 0],
      ['Diplôme renseigné', !!(p.diplome_plus_eleve || p.diplome_recrutement || ctx.diplomes)]
    ];
    return { actes, debut, anc, dernier, echelon, etat, prochaine, retard, dans, prevision, controles, complets: controles.filter(c => c[1]).length, statut: C.statutDe(p, ctx.ecole) };
  }
  const num = v => (typeof v === 'number' && !isNaN(v)) ? v : 0;

  /** Échelons à venir : échelon, date d'effet estimée, jusqu'à la retraite ou l'échelon maximal. */
  function projection(s) {
    if (!s.dernier || !s.echelon) return [];
    const out = []; let ech0 = s.echelon, date = s.dernier.date_effet;
    const finCarriere = s.prevision ? s.prevision.date_retraite : null;
    while (ech0 < ECHELON_MAX && out.length < 12) {
      date = ajouteMois(date, DUREE_ECHELON); ech0 += 1;
      if (finCarriere && date > finCarriere) break;
      out.push({ echelon: ech0, date, passe: date <= aujourdhui() });
    }
    return out;
  }

  const badgeEtat = s => {
    if (s.etat === 'RETARD') return U.badge('Dû depuis ' + duree(s.retard), 'danger');
    if (s.etat === 'A_JOUR') return U.badge(s.dans <= 6 ? 'Dans ' + duree(s.dans) : U.dateCourte(s.prochaine), s.dans <= 6 ? 'attention' : 'ok');
    if (s.etat === 'MAX') return U.badge('Échelon maximal', 'ok');
    return U.badge('À renseigner', 'attention');
  };
  const texteEtat = s => s.etat === 'RETARD' ? 'Dû depuis ' + duree(s.retard) : s.etat === 'A_JOUR' ? 'Dans ' + duree(s.dans) + ' (' + U.dateCourte(s.prochaine) + ')' : s.etat === 'MAX' ? 'Échelon maximal' : 'À renseigner';

  /* =======================================================================
     Avancement d'échelon
     ======================================================================= */

  function modalAvancement(p, s, apres) {
    const nouv = el('input', { type: 'number', min: '1', max: String(ECHELON_MAX), value: String((s.echelon || 0) + 1) });
    const dateEffet = el('input', { type: 'date', value: s.prochaine && s.prochaine <= aujourdhui() ? s.prochaine : aujourdhui() });
    const ref = el('input', { type: 'text', placeholder: 'Arrêté n° …' });
    const obs = el('input', { type: 'text', placeholder: 'Observations (facultatif)' });
    const champ = (l, c) => el('div', { class: 'champ' }, [el('label', { text: l }), c]);
    U.modal('Avancement d’échelon — ' + nomAgent(p), el('div', { class: 'formulaire' }, [
      el('p', { class: 'muet petit', text: 'Échelon actuel : ' + (s.echelon || '—') + (p.categorie ? ' (catégorie ' + p.categorie + ')' : '') + '. L’acte est ajouté à la carrière et la fiche de l’agent est mise à jour.' }),
      champ('Nouvel échelon', nouv), champ('Date d’effet', dateEffet), champ('Référence de l’acte', ref), champ('Observations', obs)]), fermer => [
      el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
      el('button', { class: 'btn btn-primaire', text: 'Enregistrer l’avancement', onclick: () => {
        const n = Number(nouv.value);
        if (!(n >= 1 && n <= ECHELON_MAX)) { U.toast('Échelon entre 1 et ' + ECHELON_MAX, 'attention'); return; }
        if (!dateEffet.value) { U.toast('Indiquez la date d’effet', 'attention'); return; }
        const acte = { personnel_id: p.id, type_acte: 'AVANCEMENT_ECHELON', categorie: p.categorie || null, echelon: n, grade: p.grade || null, date_effet: dateEffet.value,
          reference_acte: ref.value || null, observations: obs.value || null };
        if (['FE', 'ACDPE', 'ACDPCTD'].indexOf(s.statut) >= 0) acte.statut_code = s.statut;
        DB.put('carrieres_personnel', acte)
          .then(rec => (dateEffet.value <= aujourdhui() ? DB.put('personnels', Object.assign({}, p, { echelon: n })) : Promise.resolve(null)).then(() => rec))
          .then(rec => DB.audit('AVANCEMENT_ECHELON', 'carrieres_personnel', rec.id, { agent: p.id, echelon: n }))
          .then(() => { fermer(); EG.majSynchro(); U.toast('Avancement enregistré : échelon ' + n); apres(); });
      } })]);
  }

  /* =======================================================================
     Liste : le suivi des carrières
     ======================================================================= */

  Routeur.definir('carrieres', function (racine) {
    racine.appendChild(E.entete('Gestion des carrières', 'Suivi des agents publics : ancienneté, avancement d’échelon (tous les ' + DUREE_ECHELON / 12 + ' ans), retraite et complétude des dossiers.'));
    const zone = el('div'); racine.appendChild(zone);
    if (!EG.peutVoirModule('carrieres')) { zone.appendChild(U.vide('Ce module n’est pas disponible pour votre compte.')); return; }
    Promise.all([E.charger('personnels'), E.charger('carrieres_personnel'), DB.all('regles_retraite'), DB.all('ecoles').then(l => EG.filtrerPerimetre('ecoles', l))]).then(([pers, actes, regles, ecoles]) => {
      const ie = E.indexer(ecoles);
      const parAgent = {}; actes.forEach(a => { (parAgent[a.personnel_id] = parAgent[a.personnel_id] || []).push(a); });
      const tous = pers.filter(p => p.actif !== false && !(ie[p.ecole_id] && ie[p.ecole_id].statut === 'PRIVEE')).map(p => {
        const ecole = ie[p.ecole_id] || null;
        return { p, ecole, s: situation(p, { actes: parAgent[p.id] || [], regles, ecole }) };
      }).filter(l => l.s.statut !== 'PRIVE');
      if (!tous.length) { zone.appendChild(U.vide('Aucun agent public dans votre périmètre.')); return; }

      const filtre = { statut: '', ecole: '', etat: '', q: '' };
      const barre = el('div', { class: 'barre-filtres' });
      barre.appendChild(U.selecteur('Statut', [{ value: 'FE', label: 'FE' }, { value: 'ACDPE', label: 'ACDPE' }, { value: 'ACDPCTD', label: 'ACDPCTD' }, { value: 'A_PRECISER', label: 'Statut à préciser' }],
        '', v => { filtre.statut = v; liste(); }, { libelleVide: 'Tous les statuts' }));
      if (ecoles.length > 1) barre.appendChild(U.selecteur('École', ecoles.filter(e => tous.some(l => l.p.ecole_id === e.id)).map(e => ({ value: e.id, label: e.nom })), '', v => { filtre.ecole = v; liste(); }, { libelleVide: 'Toutes les écoles' }));
      barre.appendChild(U.selecteur('Avancement', [{ value: 'RETARD', label: 'Avancement dû' }, { value: 'BIENTOT', label: 'Dans les 6 mois' }, { value: 'INCONNU', label: 'À renseigner' }],
        '', v => { filtre.etat = v; liste(); }, { libelleVide: 'Tous' }));
      barre.appendChild(U.champRecherche('Rechercher un agent, un matricule', v => { filtre.q = sa(v); liste(); }));
      const zoneStats = el('div'), actions = el('div', { class: 'barre-actions' }), zoneListe = el('div');
      zone.appendChild(zoneStats); zone.appendChild(barre); zone.appendChild(actions); zone.appendChild(zoneListe);

      const visibles = () => tous.filter(l => (!filtre.statut || l.s.statut === filtre.statut) && (!filtre.ecole || l.p.ecole_id === filtre.ecole)
        && (!filtre.etat || (filtre.etat === 'BIENTOT' ? l.s.etat === 'A_JOUR' && l.s.dans <= 6 : l.s.etat === filtre.etat))
        && (!filtre.q || sa([l.p.nom, l.p.prenoms, l.p.matricule, l.p.nip].join(' ')).indexOf(filtre.q) >= 0))
        .sort((a, b) => (b.s.etat === 'RETARD') - (a.s.etat === 'RETARD') || (b.s.retard - a.s.retard) || nomAgent(a.p).localeCompare(nomAgent(b.p), 'fr'));
      const enTete = ['Agent', 'Matricule', 'École', 'Statut', 'Grade', 'Échelon', libAnc(), 'Dernier avancement', 'Prochain avancement', 'Départ à la retraite', 'Dossier'];
      const ligne = l => [nomAgent(l.p), l.p.matricule || '', l.ecole ? l.ecole.nom : '', C.LIB_CAT[l.s.statut] || l.s.statut, l.p.grade || l.p.categorie || '', l.s.echelon || '',
        duree(l.s.anc), l.s.dernier ? U.dateCourte(l.s.dernier.date_effet) : '', texteEtat(l.s), l.s.prevision ? U.dateCourte(l.s.prevision.date_retraite) : '', l.s.complets + '/' + l.s.controles.length];

      const exporter = imprimer => {
        const v = visibles(); if (!v.length) { U.toast('Rien à exporter', 'attention'); return; }
        if (imprimer) S().imprimer('Suivi des carrières', () => '<h2 style="text-align:center">SUIVI DES CARRIÈRES DES AGENTS PUBLICS</h2><p style="text-align:center">'
          + ech(EG.session.annee_code || '') + ' — ' + v.length + ' agent(s)</p>' + X0.htmlTableau(enTete, v.map(ligne)), { paysage: true });
        else S().excel('suivi-carrieres', [{ nom: 'Carrières', lignes: [enTete].concat(v.map(ligne)) }]);
      };
      actions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE00C Excel', onclick: () => exporter(false) }));
      actions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE008 Imprimer', onclick: () => exporter(true) }));

      function liste() {
        const v = visibles();
        zoneStats.textContent = '';
        zoneStats.appendChild(el('div', { class: 'grille grille-stats' }, [
          U.stat(U.nombre(tous.length), 'Agents suivis', 'ok'),
          U.stat(U.nombre(tous.filter(l => l.s.etat === 'RETARD').length), 'Avancements dus', tous.some(l => l.s.etat === 'RETARD') ? 'attention' : ''),
          U.stat(U.nombre(tous.filter(l => l.s.etat === 'INCONNU').length), 'Dernier avancement à renseigner'),
          U.stat(U.nombre(tous.filter(l => l.s.complets < l.s.controles.length).length), 'Dossiers incomplets'),
          U.stat(U.nombre(tous.filter(l => l.s.prevision && !l.s.prevision.echue && l.s.prevision.mois_restants <= 12).length), 'Départs dans les 12 mois')
        ]));
        zoneListe.textContent = '';
        zoneListe.appendChild(U.carte('Agents (' + v.length + ')', U.tableau([
          { titre: 'Agent', valeur: l => el('strong', { text: nomAgent(l.p) }) },
          { titre: 'École', valeur: l => l.ecole ? l.ecole.nom : '—' },
          { titre: 'Statut', valeur: l => C.LIB_CAT[l.s.statut] || l.s.statut },
          { titre: 'Grade', valeur: l => (l.p.grade || l.p.categorie || '—') + (l.s.echelon ? ' · éch. ' + l.s.echelon : '') },
          { titre: libAnc(), valeur: l => duree(l.s.anc) },
          { titre: 'Dernier avancement', valeur: l => l.s.dernier ? U.dateCourte(l.s.dernier.date_effet) : '—' },
          { titre: 'Prochain avancement', valeur: l => badgeEtat(l.s) },
          { titre: 'Retraite', valeur: l => l.s.prevision ? U.dateCourte(l.s.prevision.date_retraite) : '—' },
          { titre: 'Dossier', valeur: l => U.badge(l.s.complets + '/' + l.s.controles.length, l.s.complets === l.s.controles.length ? 'ok' : 'attention') },
          { titre: '', classe: 'col-etroite', valeur: l => EG.peutEcrire() && l.s.etat === 'RETARD' ? el('button', { class: 'btn btn-fantome btn-petit', text: '\uE076', title: 'Enregistrer l’avancement d’échelon', 'aria-label': 'Avancement d’échelon de ' + nomAgent(l.p),
            onclick: ev => { ev.stopPropagation(); modalAvancement(l.p, l.s, () => Routeur.aller('carrieres')); } }) : '' }
        ], v, { onLigne: l => Routeur.aller('carriere/' + l.p.id), messageVide: 'Aucun agent ne correspond.' })));
        zoneListe.appendChild(el('p', { class: 'muet petit', text: 'L’avancement d’échelon est dû ' + DUREE_ECHELON / 12 + ' ans après le dernier acte fixant l’échelon. Sans acte enregistré, la date du dernier avancement est « à renseigner » : ouvrez le dossier de l’agent pour la saisir.' }));
      }
      liste();
    });
  });

  /* =======================================================================
     Dossier de carrière d'un agent
     ======================================================================= */

  function ficheHtml(p, s, ctx) {
    const t = (a, b) => '<tr><td style="width:34%"><strong>' + ech(a) + '</strong></td><td>' + ech(b === null || b === undefined || b === '' ? '—' : b) + '</td></tr>';
    const ecole = ctx.ecole;
    const actes = s.actes.slice().reverse();
    return '<h2 style="text-align:center">FICHE DE CARRIÈRE</h2><p style="text-align:center">' + ech(nomAgent(p)) + (p.matricule ? ' — matricule ' + ech(p.matricule) : '') + '</p>'
      + '<h3>Identité et situation administrative</h3><table>'
      + t('Nom et prénoms', nomAgent(p)) + t('Date et lieu de naissance', [p.date_naissance ? U.dateFR(p.date_naissance) : '', p.lieu_naissance || ''].filter(Boolean).join(' à '))
      + t('Statut', C.LIB_CAT[s.statut] || s.statut) + t('Emploi', p.emploi) + t('Fonction', X0.LIB_FONCTION[p.fonction] || p.fonction)
      + t('Poste actuel', ecole ? ecole.nom : '') + t('Grade', p.grade) + t('Catégorie et échelon', [p.categorie, s.echelon ? 'échelon ' + s.echelon : ''].filter(Boolean).join(' — '))
      + t('Première prise de service', s.debut ? U.dateFR(s.debut) : '') + t(libAnc(), duree(s.anc))
      + t('Dernier avancement', s.dernier ? U.dateFR(s.dernier.date_effet) : '') + t('Prochain avancement d’échelon', texteEtat(s))
      + t('Départ à la retraite prévu', s.prevision ? U.dateFR(s.prevision.date_retraite) + ' (' + s.prevision.age_retraite + ' ans)' : '') + '</table>'
      + '<h3>Actes de carrière</h3>' + X0.htmlTableau(['Date d’effet', 'Nature de l’acte', 'Grade', 'Catégorie', 'Échelon', 'Référence'],
        actes.map(a => [U.dateCourte(a.date_effet), U.libelle(a.type_acte), a.grade || '', a.categorie || '', a.echelon || '', a.reference_acte || '']))
      + (ctx.affectations.length ? '<h3>Affectations</h3>' + X0.htmlTableau(['Début', 'Fin', 'École', 'Fonction'], ctx.affectations.slice().sort((a, b) => String(b.date_debut).localeCompare(String(a.date_debut)))
        .map(a => [U.dateCourte(a.date_debut), a.date_fin ? U.dateCourte(a.date_fin) : 'En cours', (ctx.ie[a.ecole_id] || {}).nom || '', U.libelle(a.fonction)])) : '');
  }

  Routeur.definir('carriere', function (racine, args) {
    const id = args[0], tete = el('div'), zone = el('div');
    racine.appendChild(tete); racine.appendChild(zone);
    const raf = () => Routeur.aller('carriere/' + id);
    if (!EG.peutVoirModule('carrieres')) { zone.appendChild(U.vide('Ce module n’est pas disponible pour votre compte.')); return; }
    DB.get('personnels', id).then(p0 => p0 ? EG.filtrerPerimetre('personnels', [p0]).then(l => l[0] || null) : null).then(p => {
      if (!p) { zone.appendChild(U.vide('Cet agent est introuvable ou n’appartient pas à votre périmètre.')); return; }
      return Promise.all([DB.where('carrieres_personnel', { personnel_id: id }), DB.where('affectations_personnel', { personnel_id: id }), DB.where('diplomes_personnel', { personnel_id: id }),
        DB.where('formations_personnel', { personnel_id: id }), DB.all('regles_retraite'), DB.all('ecoles'), DB.all('classes')]).then(([actes, affectations, diplomes, formations, regles, ecoles, classes]) => {
        const ie = E.indexer(ecoles), ecole = ie[p.ecole_id] || null;
        if (ecole && ecole.statut === 'PRIVEE') { zone.appendChild(U.vide('Les agents des écoles privées sont gérés par leur école.')); return; }
        const s = situation(p, { actes, regles, ecole, diplomes: diplomes.length });
        const ctx = { affectations, ie, ecole };
        const ecrire = EG.peutEcrire();

        tete.appendChild(E.entete(nomAgent(p), (X0.LIB_FONCTION[p.fonction] || p.fonction || '') + ' • ' + (C.LIB_CAT[s.statut] || s.statut) + ' • ' + (ecole ? ecole.nom : 'sans affectation'), [
          el('button', { class: 'btn btn-fantome', text: '← Carrières', onclick: () => Routeur.aller('carrieres') }),
          ecrire ? el('button', { class: 'btn btn-primaire', text: '\uE076 Avancement d’échelon', onclick: () => modalAvancement(p, s, raf) }) : null,
          ecrire ? el('button', { class: 'btn btn-fantome', text: '＋ Acte de carrière', onclick: () => E.editer('carrieres_personnel', { personnel_id: id, categorie: p.categorie, echelon: p.echelon, grade: p.grade }, raf) }) : null,
          el('button', { class: 'btn btn-fantome', text: '\uE008 Fiche de carrière (signée, avec QR)', onclick: () => EG.genererDocument('FICHE_CARRIERE', 'Fiche de carrière — ' + nomAgent(p), ficheHtml(p, s, ctx), { acteurs: [{ personne: p, mention: 'L’agent' }], ecole_id: p.ecole_id }) }),
          el('button', { class: 'btn btn-fantome', text: '\uE02B Carte d’identité', onclick: () => Routeur.aller('agent-identite/' + id) })
        ]));

        zone.appendChild(el('div', { class: 'grille grille-stats' }, [
          U.stat(duree(s.anc), libAnc(), s.debut ? '' : 'attention'),
          U.stat(s.prevision ? s.prevision.age_actuel + ' ans' : '—', 'Âge'),
          U.stat((p.grade || p.categorie || '—') + (s.echelon ? ' · éch. ' + s.echelon : ''), 'Grade et échelon'),
          U.stat(texteEtat(s), 'Prochain avancement d’échelon', s.etat === 'RETARD' ? 'attention' : ''),
          U.stat(s.prevision ? U.dateCourte(s.prevision.date_retraite) : '—', 'Départ à la retraite', s.prevision && !s.prevision.echue && s.prevision.mois_restants <= 12 ? 'attention' : '')
        ]));

        /* Frise des actes */
        const frise = s.actes.slice().reverse().map(a => ({ date: a.date_effet, icone: ICONES[a.type_acte] || '\uE00D', titre: U.libelle(a.type_acte),
          detail: [a.grade, a.categorie ? 'catégorie ' + a.categorie : '', a.echelon ? 'échelon ' + a.echelon : '', a.reference_acte ? 'acte : ' + a.reference_acte : '', a.observations].filter(Boolean).join(' — '), acte: a }));
        if (s.debut && !s.actes.some(a => a.type_acte === 'RECRUTEMENT')) frise.push({ date: s.debut, icone: '\uE05C', titre: 'Première prise de service', detail: 'Date de la fiche de l’agent', acte: null });
        zone.appendChild(U.carte('Frise de carrière', frise.length ? el('ol', { class: 'frise-carriere', style: 'list-style:none;padding:0;margin:0' }, frise.map(x => el('li', { style: 'display:flex;gap:12px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--bordure, #e3e8e5)' }, [
          el('span', { 'aria-hidden': 'true', style: 'font-size:1.4em', text: x.icone }),
          el('div', { style: 'flex:1' }, [el('strong', { text: x.titre }), el('div', { class: 'muet petit', text: x.detail || '' })]),
          el('span', { class: 'muet', text: U.dateCourte(x.date) }),
          ecrire && x.acte ? el('span', { class: 'actions-mini' }, [
            el('button', { class: 'btn btn-fantome btn-petit', text: '\uE006', 'aria-label': 'Modifier l’acte', onclick: () => E.editer('carrieres_personnel', x.acte, raf) }),
            el('button', { class: 'btn btn-fantome btn-petit btn-alerte', text: '\uE005', 'aria-label': 'Supprimer l’acte', onclick: () => U.confirmer('Supprimer l’acte', 'L’acte « ' + x.titre + ' » du ' + U.dateCourte(x.date) + ' sera supprimé.', () => DB.remove('carrieres_personnel', x.acte.id).then(() => { EG.majSynchro(); raf(); }), 'Supprimer') })
          ]) : null]))) : U.vide('Aucun acte de carrière enregistré. Ajoutez le recrutement, la titularisation et les avancements pour suivre la carrière.')));

        /* Projection */
        const proj = projection(s);
        zone.appendChild(U.carte('Projection des échelons', proj.length ? U.tableau([
          { titre: 'Échelon', valeur: x => (p.categorie || '') + ' ' + x.echelon }, { titre: 'Date d’effet estimée', valeur: x => U.dateCourte(x.date) },
          { titre: 'Situation', valeur: x => x.passe ? U.badge('Échue — à constater', 'attention') : U.badge('À venir', 'ok') }
        ], proj, {}) : el('p', { class: 'muet', text: s.dernier ? 'Aucun avancement d’échelon prévisible avant le départ à la retraite.' : 'La projection nécessite au moins un acte fixant l’échelon (recrutement, titularisation ou avancement) et l’échelon actuel de l’agent.' })));

        /* Dossier */
        zone.appendChild(U.carte('Complétude du dossier — ' + s.complets + ' / ' + s.controles.length, el('ul', { class: 'liste-points' }, s.controles.map(c => el('li', { text: (c[1] ? '\uE003 ' : '\uE002 ') + c[0] })))));

        /* Affectations, diplômes, formations */
        const bloc = (titre, entite, rows, cols, pre) => U.carte(titre, U.tableau(cols, rows, { messageVide: 'Aucun enregistrement.' }),
          ecrire ? el('button', { class: 'btn btn-petit btn-fantome', text: '＋ Ajouter', onclick: () => E.editer(entite, Object.assign({ personnel_id: id }, pre), raf) }) : null);
        zone.appendChild(bloc('Affectations', 'affectations_personnel', affectations.slice().sort((a, b) => String(b.date_debut).localeCompare(String(a.date_debut))), [
          { titre: 'Début', valeur: a => U.dateCourte(a.date_debut) }, { titre: 'Fin', valeur: a => a.date_fin ? U.dateCourte(a.date_fin) : 'En cours' },
          { titre: 'École', valeur: a => (ie[a.ecole_id] || {}).nom || '—' }, { titre: 'Fonction', valeur: a => U.libelle(a.fonction) }], { ecole_id: p.ecole_id, fonction: p.fonction }));
        zone.appendChild(bloc('Diplômes', 'diplomes_personnel', diplomes, [
          { titre: 'Diplôme', valeur: d => d.libelle }, { titre: 'Type', valeur: d => U.libelle(d.type) }, { titre: 'Année', valeur: d => d.annee_obtention || '—' }], {}));
        zone.appendChild(bloc('Formations', 'formations_personnel', formations, [
          { titre: 'Intitulé', valeur: f => f.intitule || '—' }, { titre: 'Type', valeur: f => U.libelle(f.type) }, { titre: 'Début', valeur: f => f.date_debut ? U.dateCourte(f.date_debut) : '—' }, { titre: 'Organisme', valeur: f => f.organisme || '—' }], {}));
      });
    });
  });

  EG.Carrieres = { situation, refAnciennete, projection, ajouteMois, moisEntre, duree, DUREE_ECHELON, ECHELON_MAX };
})(window);
