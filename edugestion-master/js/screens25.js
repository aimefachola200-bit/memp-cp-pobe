/* ÉduGestion Pro Master — les rubriques de la circonscription et de la direction départementale.

   Ce fichier porte les écrans du menu des comptes de circonscription (CS) et de direction
   départementale (DDEMP) qui n'existaient pas encore :

   - personnel-cs/<type>  : personnel enseignant, administratif, enseignants ACDPCTD (AME), personnel de soutien ;
   - ecoles-cm2           : écoles à CM2 et candidats au CEP de la session ;
   - ecarts-cs            : analyses et écarts entre chiffres déclarés et données enregistrées ;
   - rapport-rentree      : rapport de rentrée de la circonscription (tableau, observations, impression) ;
   - courriers            : archive des courriers reçus et envoyés, avec pièce jointe.

   Tous partent du choix d'une circonscription dans le périmètre du compte : on ne lit jamais
   que les écoles, agents, élèves et courriers de ce périmètre. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI, R = EG.Rules;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const S = () => EG.Sortie;
  const sa = U.sansAccent;
  const ech = s => EG.Docs.echapper(s);
  const pl = (n, mot) => U.nombre(n) + ' ' + mot + (n > 1 ? 's' : '');
  const num = v => (typeof v === 'number' && !isNaN(v)) ? v : 0;
  const ROLES_GESTION = ['ADMIN_MEMP', 'ADMIN_TECHNIQUE', 'DDEMP', 'CS'];
  const peutGerer = () => ROLES_GESTION.indexOf(EG.session.user.role) >= 0 && EG.peutEcrire();
  const tri = (a, b) => String(a.nom).localeCompare(String(b.nom), 'fr', { numeric: true });
  const refuse = racine => racine.appendChild(U.vide('Ce module n’est pas disponible pour votre compte.'));

  /* =======================================================================
     Catégories de personnel
     ======================================================================= */

  /** ENSEIGNANT (FE, ACDPE), AME, ADMINISTRATIF ou SOUTIEN, d'après la fiche de l'agent. */
  function categoriePersonnel(p) {
    const qualite = sa(p.qualite), emploi = sa(p.emploi), fonction = String(p.fonction || '').toUpperCase();
    if (/(^|[^a-z])a\.?m\.?e\.?([^a-z]|$)|acdpctd/.test(qualite) || /acdpctd/.test(emploi)) return 'AME';
    if (fonction === 'SOUTIEN' || (/entretien|gardien|cuisin|manoeuvre/.test(emploi) && !/administratif/.test(emploi))) return 'SOUTIEN';
    if (fonction === 'ADMINISTRATIF' || fonction === 'CS' || fonction === 'CONSEILLER_PEDAGOGIQUE' || /administratif/.test(emploi)) return 'ADMINISTRATIF';
    return 'ENSEIGNANT';
  }
  EG.categoriePersonnel = categoriePersonnel;

  const LIB_FONCTION = { DIRECTEUR: 'Directeur', ENSEIGNANT: 'Enseignant', CONSEILLER_PEDAGOGIQUE: 'Conseiller pédagogique', CS: 'Circonscription',
    ADMINISTRATIF: 'Administratif', SOUTIEN: 'Soutien', AUTRE: 'Autre' };

  /* =======================================================================
     Outils communs
     ======================================================================= */

  /**
   * Squelette d'un écran de circonscription : en-tête, choix de la circonscription, corps.
   * cfg = { module, titre, sous, cs, charger: () => Promise<données>, avant(zone, etat), rendre(zone, contexte) }
   * Rend l'état (etat.cs) pour que les onglets puissent conserver la circonscription.
   */
  function ecran(racine, cfg) {
    if (!EG.peutVoirModule(cfg.module)) { refuse(racine); return null; }
    racine.appendChild(E.entete(cfg.titre, cfg.sous, cfg.actions || null));
    const zoneAvant = el('div'), zoneCs = el('div'), zoneCorps = el('div');
    racine.appendChild(zoneAvant); racine.appendChild(zoneCs); racine.appendChild(zoneCorps);
    const etat = { dep: '', cs: cfg.cs || '' };
    let C = null;

    function charger() {
      return Promise.all([E.contexteCS(), cfg.charger ? cfg.charger() : Promise.resolve(null)]).then(([ctx, data]) => { C = ctx; C.data = data; dessiner(); });
    }
    function dessiner() {
      E.barreCS(zoneCs, etat, C, () => corps(), { libelleVide: '— Choisir une circonscription —' });
      if (cfg.avant) { zoneAvant.textContent = ''; cfg.avant(zoneAvant, etat); }
      corps();
    }
    function corps() {
      zoneCorps.textContent = '';
      if (!C.csList.length) return;
      if (!etat.cs) { zoneCorps.appendChild(U.vide('Choisissez une circonscription pour afficher ' + (cfg.objet || 'son contenu') + '.')); return; }
      const cs = C.index[etat.cs];
      const ecoles = C.ecolesPerimetre.filter(e => e.territoire_id === etat.cs && e.actif !== false).sort(tri);
      if (cfg.avant) { zoneAvant.textContent = ''; cfg.avant(zoneAvant, etat); }
      cfg.rendre(zoneCorps, { C, etat, cs, ecoles, data: C.data, recharger: charger });
    }
    charger();
    return etat;
  }

  /** Écoles fictives portant le territoire, pour l'en-tête administratif des documents. */
  function pseudoEcole(C, cs) {
    const dep = EG.Perimetre.ancetre(C.index, cs.id, 'DEPARTEMENT');
    return { nom: '', territoire_id: cs.id, departement_id: dep ? dep.id : null };
  }

  const cellule = v => v === null || v === undefined ? '' : (typeof v === 'number' ? U.nombre(v) : String(v));

  /** Tableau HTML des sorties (impression, Word). lignes : tableaux de valeurs ; { gras: true, cells } pour un total. */
  function htmlTableau(entetes, lignes) {
    const th = t => '<th>' + ech(t) + '</th>';
    const rang = l => {
      const gras = !Array.isArray(l) && l.gras, cells = Array.isArray(l) ? l : l.cells;
      if (!Array.isArray(l) && l.groupe) return '<tr><th colspan="' + entetes.length + '" style="background:#E6F5EE;text-align:left">' + ech(l.groupe) + '</th></tr>';
      return '<tr' + (gras ? ' style="font-weight:700;background:#F1F5F2"' : '') + '>' + cells.map(v => '<td' + (typeof v === 'number' ? ' style="text-align:right"' : '') + '>' + ech(cellule(v)) + '</td>').join('') + '</tr>';
    };
    return '<table><thead><tr>' + entetes.map(th).join('') + '</tr></thead><tbody>' + lignes.map(rang).join('') + '</tbody></table>';
  }

  /** Les trois boutons de sortie d'un tableau : Excel, impression, Word. */
  function boutonsSortie(o) {
    /* o = { C, cs, titre, fichier, entetes, lignes, paysage, avant, apres } */
    const excelLignes = () => [o.entetes].concat(o.lignes.filter(l => Array.isArray(l) || !l.groupe).map(l => (Array.isArray(l) ? l : l.cells).map(v => v === undefined ? '' : v)));
    const corps = () => '<h2 style="text-align:center">' + ech(o.titre) + '</h2>' + (o.avant || '') + htmlTableau(o.entetes, o.lignes) + (o.apres || '')
      + (EG.Docs.visaTerritoire ? EG.Docs.visaTerritoire(o.cs, o.visa || 'Le Chef de la circonscription scolaire') : '');
    return [
      el('button', { class: 'btn btn-fantome', text: '\uE00C Excel', onclick: () => {
        if (o.lignes.length === 0) { U.toast('Rien à exporter', 'attention'); return; }
        S().excel(o.fichier + '-' + S().slug(o.cs.nom).slice(0, 30), [{ nom: o.titre.slice(0, 28), lignes: excelLignes() }]);
      } }),
      el('button', { class: 'btn btn-fantome', text: '\uE008 Imprimer', onclick: () => S().imprimer(o.titre, corps, { ecole: pseudoEcole(o.C, o.cs), paysage: o.paysage !== false }) }),
      el('button', { class: 'btn btn-fantome', text: '\uE00D Word', onclick: () => S().word(o.fichier + '-' + S().slug(o.cs.nom).slice(0, 30), o.titre, corps, { ecole: pseudoEcole(o.C, o.cs) }) })
    ];
  }

  /** Année scolaire de la session : « 2026-2027 » → 2027 (session du CEP). */
  function anneeExamen() {
    const m = /(\d{4})\D+(\d{4})/.exec(EG.session.annee_code || '');
    return m ? m[2] : String(new Date().getFullYear());
  }

  /* =======================================================================
     PERSONNEL PAR CATÉGORIE
     ======================================================================= */

  const TYPES_PERSONNEL = {
    enseignants: { icone: '\uE01C', titre: 'Personnel enseignant', cat: 'ENSEIGNANT', fonction: 'ENSEIGNANT',
      sous: 'Directeurs et enseignants fonctionnaires (FE) et contractuels (ACDPE) des écoles de la circonscription.' },
    administratif: { icone: '\uE011', titre: 'Personnel administratif', cat: 'ADMINISTRATIF', fonction: 'ADMINISTRATIF',
      sous: 'Préposés des services administratifs, secrétaires, conseillers pédagogiques et collaborateurs.' },
    ame: { icone: '\uE01E', titre: 'Enseignants ACDPCTD', cat: 'AME', fonction: 'ENSEIGNANT',
      sous: 'Agents mis à disposition par les collectivités territoriales (anciens AME) : enseignants des écoles de la circonscription.' },
    soutien: { icone: '\uE04A', titre: 'Personnel de soutien', cat: 'SOUTIEN', fonction: 'SOUTIEN',
      sous: 'Agents d’entretien, gardiens, cuisiniers et autres agents de service.' }
  };

  Routeur.definir('personnel-cs', function (racine, args, params) {
    const code = TYPES_PERSONNEL[args && args[0]] ? args[0] : 'enseignants';
    const T = TYPES_PERSONNEL[code];
    let etatCs = null;
    const filtre = { ecole: '', q: '' };
    etatCs = ecran(racine, {
      module: 'personnel-cs', titre: T.titre, sous: T.sous, cs: params && params.cs, objet: 'son personnel',
      charger: () => E.charger('personnels'),
      avant: zone => {
        zone.textContent = '';
        zone.appendChild(E.barreOnglets(Object.keys(TYPES_PERSONNEL).map(k => [k, TYPES_PERSONNEL[k].icone + ' ' + TYPES_PERSONNEL[k].titre]), code,
          k => Routeur.aller('personnel-cs/' + k + (etatCs && etatCs.cs ? '?cs=' + etatCs.cs : ''))));
      },
      rendre: (zone, X) => {
        const { C, cs, ecoles } = X;
        const idsCS = {}; ecoles.forEach(e => { idsCS[e.id] = true; });
        const ie = {}; ecoles.forEach(e => { ie[e.id] = e; });
        const tous = X.data.filter(p => p.actif !== false && p.ecole_id && idsCS[p.ecole_id]);
        const types = tous.filter(p => categoriePersonnel(p) === T.cat);
        const zoneListe = el('div'), zoneStats = el('div');

        const barre = el('div', { class: 'barre-filtres' });
        barre.appendChild(U.selecteur('École', ecoles.map(e => ({ value: e.id, label: e.nom })), filtre.ecole, v => { filtre.ecole = v; liste(); }, { libelleVide: 'Toutes les écoles' }));
        barre.appendChild(U.champRecherche('Rechercher un agent, un matricule', v => { filtre.q = sa(v); liste(); }));
        const actions = el('div', { class: 'barre-actions' });
        zone.appendChild(zoneStats); zone.appendChild(barre); zone.appendChild(actions); zone.appendChild(zoneListe);

        const visibles = () => types.filter(p => (!filtre.ecole || p.ecole_id === filtre.ecole)
          && (!filtre.q || sa([p.nom, p.prenoms, p.matricule].join(' ')).indexOf(filtre.q) >= 0))
          .sort((a, b) => (ie[a.ecole_id].nom || '').localeCompare(ie[b.ecole_id].nom || '', 'fr', { numeric: true }) || String(a.nom).localeCompare(String(b.nom), 'fr'));

        const enTete = ['Nom', 'Prénoms', 'Sexe', 'Matricule', 'École', 'Fonction', 'Grade', 'Statut', 'Téléphone'];
        const ligneDe = p => [String(p.nom || '').toUpperCase(), p.prenoms || '', p.sexe || '', p.matricule || '', (ie[p.ecole_id] || {}).nom || '',
          LIB_FONCTION[p.fonction] || p.fonction || '', p.grade || [p.categorie, p.echelon].filter(Boolean).join(' '), p.qualite || '', p.telephone || ''];

        function liste() {
          const v = visibles();
          zoneStats.textContent = '';
          const parQualite = {}; types.forEach(p => { const q = p.qualite || '—'; parQualite[q] = (parQualite[q] || 0) + 1; });
          zoneStats.appendChild(el('div', { class: 'grille grille-stats' }, [
            U.stat(U.nombre(types.length), T.titre, types.length ? 'ok' : ''),
            U.stat(U.nombre(types.filter(p => p.sexe === 'F').length), 'Femmes', ''),
            U.stat(U.nombre(new Set(types.map(p => p.ecole_id)).size) + ' / ' + U.nombre(ecoles.length), 'Écoles concernées', ''),
            U.stat(U.nombre(tous.length), 'Personnel enregistré (toutes catégories)', '')
          ]));
          if (Object.keys(parQualite).length > 1 || (Object.keys(parQualite)[0] && Object.keys(parQualite)[0] !== '—')) {
            zoneStats.appendChild(el('p', { class: 'muet petit', text: 'Par statut : ' + Object.keys(parQualite).sort().map(q => q + ' ' + parQualite[q]).join(' · ') }));
          }
          actions.textContent = '';
          if (peutGerer()) {
            actions.appendChild(el('button', { class: 'btn btn-primaire', text: '＋ Agent', onclick: () => E.editer('personnels',
              { fonction: T.fonction, ecole_id: filtre.ecole || null, qualite: T.cat === 'AME' ? 'A.M.E.' : null, actif: true }, () => X.recharger()) }));
            actions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE00B Importer le fichier du ministère', onclick: () => Routeur.aller('import-export/personnel?cs=' + cs.id) }));
          }
          boutonsSortie({ C, cs, titre: T.titre + ' — ' + cs.nom, fichier: 'personnel-' + code, entetes: enTete, lignes: v.map(ligneDe), paysage: true })
            .forEach(b => actions.appendChild(b));
          zoneListe.textContent = '';
          if (!types.length) {
            zoneListe.appendChild(U.vide('Aucun agent de cette catégorie n’est enregistré pour ' + cs.nom + '.'
              + (peutGerer() ? ' Importez les fichiers du ministère ou ajoutez les agents un à un.' : '')));
            return;
          }
          zoneListe.appendChild(U.tableau([
            { titre: 'Agent', valeur: p => String(p.nom || '').toUpperCase() + ' ' + (p.prenoms || '') },
            { titre: 'Sexe', valeur: p => p.sexe || '—', classe: 'col-etroite' },
            { titre: 'Matricule', valeur: p => p.matricule || '—' },
            { titre: 'École', valeur: p => (ie[p.ecole_id] || {}).nom || '—' },
            { titre: 'Fonction', valeur: p => LIB_FONCTION[p.fonction] || p.fonction || '—' },
            { titre: 'Statut', valeur: p => p.qualite || '—' },
            { titre: 'Téléphone', valeur: p => p.telephone || '—' }
          ], v, { onLigne: p => Routeur.aller('agent/' + p.id), messageVide: 'Aucun agent ne correspond.' }));
        }
        liste();
      }
    });
  });

  /* =======================================================================
     ÉCOLES À CM2 ET CEP
     ======================================================================= */

  Routeur.definir('ecoles-cm2', function (racine, args, params) {
    const etat = { seulementCM2: true, statut: '' };
    const session = anneeExamen();
    ecran(racine, {
      module: 'ecoles-cm2', titre: 'Écoles à CM2 et CEP ' + session, cs: (args && args[0]) || (params && params.cs), objet: 'ses écoles à CM2',
      sous: 'Les écoles qui présentent des candidats en CM2, l’effectif attendu et l’avancement des fiches d’inscription au CEP.',
      charger: () => Promise.all([E.charger('statistiques_ecoles'), E.inscriptionsEnrichies({ statuts: ['ACTIF'] }), E.charger('fiches_cep')])
        .then(([stats, ins, fiches]) => ({ stats, ins, fiches })),
      rendre: (zone, X) => {
        const { C, cs, ecoles } = X;
        const { stats, ins, fiches } = X.data;
        const insParId = {}; ins.forEach(i => { insParId[i.id] = i; });
        const dernier = {}; stats.forEach(s => { if (!dernier[s.ecole_id] || String(s.annee_code) > String(dernier[s.ecole_id].annee_code)) dernier[s.ecole_id] = s; });

        const lignes = ecoles.map(e => {
          const cm2 = ins.filter(i => i.ecole_id === e.id && i.niveau === 'CM2');
          let g = 0, f = 0, source = '';
          if (cm2.length) {
            f = cm2.filter(i => i._eleve && i._eleve.sexe === 'F').length; g = cm2.length - f; source = 'Inscriptions ' + (EG.session.annee_code || '');
          } else if (dernier[e.id] && dernier[e.id].effectifs && dernier[e.id].effectifs.CM2) {
            g = num(dernier[e.id].effectifs.CM2[0]); f = num(dernier[e.id].effectifs.CM2[1]); source = 'Statistiques ' + dernier[e.id].annee_code;
          }
          const nbFiches = fiches.filter(fi => insParId[fi.inscription_id] && insParId[fi.inscription_id].ecole_id === e.id).length;
          return { ecole: e, g, f, total: g + f, source, fiches: nbFiches, inscrits: cm2.length };
        });

        const zoneListe = el('div');
        const barre = el('div', { class: 'barre-filtres' });
        barre.appendChild(U.selecteur('Statut', [{ value: 'PUBLIQUE', label: 'Écoles publiques' }, { value: 'PRIVEE', label: 'Écoles privées' }], etat.statut, v => { etat.statut = v; liste(); }, { libelleVide: 'Publiques et privées' }));
        const coche = el('input', { type: 'checkbox', checked: etat.seulementCM2, onchange: e => { etat.seulementCM2 = e.target.checked; liste(); } });
        barre.appendChild(el('label', { class: 'ligne-coche' }, [coche, ' Seulement les écoles qui ont des élèves en CM2']));
        const actions = el('div', { class: 'barre-actions' });
        const zoneStats = el('div');
        zone.appendChild(zoneStats); zone.appendChild(barre); zone.appendChild(actions); zone.appendChild(zoneListe);
        zone.appendChild(el('p', { class: 'muet petit', text: 'Tant que les inscriptions de l’année ne sont pas saisies, l’effectif de CM2 est celui des dernières statistiques de l’école (année précédente) : à titre indicatif.' }));

        const visibles = () => lignes.filter(l => (!etat.statut || (l.ecole.statut || 'PUBLIQUE') === etat.statut) && (!etat.seulementCM2 || l.total > 0))
          .sort((a, b) => String(a.ecole.arrondissement || '').localeCompare(String(b.ecole.arrondissement || ''), 'fr') || tri(a.ecole, b.ecole));

        function liste() {
          const v = visibles();
          const t = v.reduce((s, l) => ({ g: s.g + l.g, f: s.f + l.f, fiches: s.fiches + l.fiches }), { g: 0, f: 0, fiches: 0 });
          zoneStats.textContent = '';
          zoneStats.appendChild(el('div', { class: 'grille grille-stats' }, [
            U.stat(U.nombre(v.length), 'Écoles à CM2', 'ok'),
            U.stat(U.nombre(t.g + t.f), 'Candidats attendus (CM2)', ''),
            U.stat(U.nombre(t.f), 'Filles', ''),
            U.stat(U.nombre(t.fiches), 'Fiches CEP saisies', t.fiches ? 'ok' : 'attention')
          ]));
          const enTete = ['Arrondissement', 'École', 'Statut', 'Garçons', 'Filles', 'Total CM2', 'Fiches CEP', 'Source'];
          const rows = v.map(l => [l.ecole.arrondissement || '', l.ecole.nom, U.libelle(l.ecole.statut || 'PUBLIQUE'), l.g, l.f, l.total, l.fiches, l.source]);
          rows.push({ gras: true, cells: ['', 'TOTAL', '', t.g, t.f, t.g + t.f, t.fiches, ''] });
          actions.textContent = '';
          boutonsSortie({ C, cs, titre: 'Écoles à CM2 et CEP ' + session + ' — ' + cs.nom, fichier: 'ecoles-cm2', entetes: enTete, lignes: rows, paysage: false })
            .forEach(b => actions.appendChild(b));
          actions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE070 Fiches d’inscription au CEP', onclick: () => Routeur.aller('fiche-cep') }));
          zoneListe.textContent = '';
          if (!v.length) { zoneListe.appendChild(U.vide(ecoles.length ? 'Aucune école à CM2 avec ces filtres.' : 'Cette circonscription n’a pas encore d’école : installez son jeu de données ou importez ses écoles.')); return; }
          zoneListe.appendChild(U.tableau([
            { titre: 'École', valeur: l => l.ecole.nom },
            { titre: 'Arrondissement', valeur: l => l.ecole.arrondissement || '—' },
            { titre: 'Statut', valeur: l => U.libelle(l.ecole.statut || 'PUBLIQUE') },
            { titre: 'G', valeur: l => U.nombre(l.g), classe: 'num' },
            { titre: 'F', valeur: l => U.nombre(l.f), classe: 'num' },
            { titre: 'CM2', valeur: l => U.nombre(l.total), classe: 'num' },
            { titre: 'Fiches CEP', valeur: l => l.fiches + (l.inscrits ? ' / ' + l.inscrits : ''), classe: 'num' },
            { titre: 'Source', valeur: l => l.source || '—' },
            { titre: '', classe: 'col-etroite', valeur: l => el('button', { class: 'btn btn-fantome btn-petit', text: 'Fiches CEP', onclick: ev => { ev.stopPropagation(); Routeur.aller('fiche-cep/' + l.ecole.id); } }) }
          ], v));
        }
        liste();
      }
    });
  });

  /* =======================================================================
     ANALYSES ET ÉCARTS
     ======================================================================= */

  Routeur.definir('ecarts-cs', function (racine, args, params) {
    const etat = { annee: '', seulement: false };
    ecran(racine, {
      module: 'ecarts-cs', titre: 'Analyses et écarts', cs: (args && args[0]) || (params && params.cs), objet: 'ses écarts',
      sous: 'Confrontation des chiffres déclarés (statistiques, classes autorisées, personnel FE / ACDPE / ACDPCTD) avec ce qui est enregistré dans l’application.',
      charger: () => Promise.all([E.charger('statistiques_ecoles'), E.inscriptionsEnrichies({ statuts: ['ACTIF'] }), E.charger('classes', { annee_scolaire_id: EG.session.annee_id }), E.charger('personnels')])
        .then(([stats, ins, classes, pers]) => ({ stats, ins, classes, pers })),
      rendre: (zone, X) => {
        const { C, cs, ecoles } = X;
        const ids = {}; ecoles.forEach(e => { ids[e.id] = true; });
        const stats = X.data.stats.filter(s => ids[s.ecole_id]);
        const annees = Array.from(new Set(stats.map(s => s.annee_code))).sort().reverse();
        if (!etat.annee || (annees.length && annees.indexOf(etat.annee) < 0)) etat.annee = annees[0] || '';
        const parEcole = {}; stats.forEach(s => { if (s.annee_code === etat.annee) parEcole[s.ecole_id] = s; });
        const T = EG.StatsEcoles ? EG.StatsEcoles.totaux : (() => ({ t: 0, pers: 0 }));

        const lignes = ecoles.map(e => {
          const st = parEcole[e.id] || null;
          const tt = st ? T(st) : { t: 0, pers: 0 };
          const inscrits = X.data.ins.filter(i => i.ecole_id === e.id).length;
          const classes = EG.Classes.ecole(e, X.data.classes.filter(c => c.ecole_id === e.id), st).ouvertes;
          const agents = X.data.pers.filter(p => p.ecole_id === e.id && p.actif !== false && ['ENSEIGNANT', 'AME'].indexOf(categoriePersonnel(p)) >= 0).length;
          const declEleves = st && st.effectifs ? tt.t : null;
          const declClasses = st && st.classes_autorisees !== null && st.classes_autorisees !== undefined ? st.classes_autorisees : (e.classes_autorisees || null);
          const declPers = st && (st.personnel_fe !== null && st.personnel_fe !== undefined || st.personnel_acdpe !== null && st.personnel_acdpe !== undefined || st.personnel_ame !== null && st.personnel_ame !== undefined) ? tt.pers : null;
          const alertes = [];
          const eEleves = declEleves !== null && inscrits ? inscrits - declEleves : null;
          const eClasses = declClasses !== null && classes ? classes - declClasses : null;
          const ePers = declPers !== null && agents ? agents - declPers : null;
          if (eEleves) alertes.push('élèves inscrits ≠ déclarés');
          if (eClasses && eClasses > 0) alertes.push('classes ouvertes au-delà des autorisées (+' + eClasses + ')');
          const publique = (e.statut || 'PUBLIQUE') === 'PUBLIQUE';
          if (ePers && publique) alertes.push(ePers > 0 ? 'plus d’agents que déclarés' : 'agents manquants dans l’application');
          if (declEleves && (classes || declClasses) && declEleves / (classes || declClasses) > 50) alertes.push('plus de 50 élèves par classe ouverte');
          if (publique && declPers !== null && (classes || declClasses) && declPers < (classes || declClasses)) alertes.push('moins d’enseignants que de classes ouvertes');
          if (!e.directeur_nom) alertes.push('directeur non renseigné');
          return { e, declEleves, inscrits, eEleves, declClasses, classes, eClasses, declPers, agents, ePers, alertes,
            ratio: declEleves && declClasses ? Math.round(declEleves / declClasses * 10) / 10 : null };
        });

        const zoneListe = el('div'), zoneStats = el('div'), actions = el('div', { class: 'barre-actions' });
        const barre = el('div', { class: 'barre-filtres' });
        barre.appendChild(U.selecteur('Statistiques de l’année', annees.map(a => ({ value: a, label: a })), etat.annee, v => { etat.annee = v; X.recharger(); }, { vide: false }));
        const coche = el('input', { type: 'checkbox', checked: etat.seulement, onchange: e => { etat.seulement = e.target.checked; liste(); } });
        barre.appendChild(el('label', { class: 'ligne-coche' }, [coche, ' Seulement les écoles avec une alerte']));
        zone.appendChild(zoneStats); zone.appendChild(barre); zone.appendChild(actions); zone.appendChild(zoneListe);
        zone.appendChild(el('p', { class: 'muet petit', text: 'Un écart n’est calculé que lorsque les deux chiffres existent : tant que les élèves, classes ou agents ne sont pas enregistrés dans l’application, la comparaison reste vide.' }));

        function liste() {
          const v = lignes.filter(l => !etat.seulement || l.alertes.length);
          zoneStats.textContent = '';
          zoneStats.appendChild(el('div', { class: 'grille grille-stats' }, [
            U.stat(U.nombre(lignes.length), 'Écoles', ''),
            U.stat(U.nombre(lignes.filter(l => l.alertes.length).length), 'Écoles avec alerte', lignes.some(l => l.alertes.length) ? 'attention' : 'ok'),
            U.stat(U.nombre(lignes.filter(l => l.eEleves).length), 'Écarts d’effectifs', ''),
            U.stat(U.nombre(lignes.filter(l => l.ePers).length), 'Écarts de personnel', ''),
            U.stat(U.nombre(lignes.filter(l => !l.e.directeur_nom).length), 'Sans directeur renseigné', '')
          ]));
          const enTete = ['École', 'Élèves déclarés', 'Élèves inscrits', 'Écart', 'Classes autorisées', 'Classes ouvertes', 'Écart', 'Personnel déclaré', 'Personnel enregistré', 'Écart', 'Élèves / classe', 'Alertes'];
          const cel = x => x === null || x === undefined ? '' : x;
          const rows = v.map(l => [l.e.nom, cel(l.declEleves), l.inscrits || '', cel(l.eEleves), cel(l.declClasses), l.classes || '', cel(l.eClasses),
            cel(l.declPers), l.agents || '', cel(l.ePers), cel(l.ratio), l.alertes.join(' ; ')]);
          actions.textContent = '';
          boutonsSortie({ C, cs, titre: 'Analyses et écarts — ' + cs.nom + (etat.annee ? ' — statistiques ' + etat.annee : ''), fichier: 'ecarts', entetes: enTete, lignes: rows, paysage: true })
            .forEach(b => actions.appendChild(b));
          zoneListe.textContent = '';
          if (!ecoles.length) { zoneListe.appendChild(U.vide('Cette circonscription n’a pas encore d’école.')); return; }
          const signe = n => n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + n;
          zoneListe.appendChild(U.tableau([
            { titre: 'École', valeur: l => l.e.nom },
            { titre: 'Élèves décl. / inscrits', valeur: l => (l.declEleves === null ? '—' : U.nombre(l.declEleves)) + ' / ' + (l.inscrits ? U.nombre(l.inscrits) : '—') },
            { titre: 'Écart', valeur: l => signe(l.eEleves), classe: 'num' },
            { titre: 'Classes aut. / ouvertes', valeur: l => (l.declClasses === null ? '—' : l.declClasses) + ' / ' + (l.classes || '—') },
            { titre: 'Personnel décl. / enreg.', valeur: l => (l.declPers === null ? '—' : l.declPers) + ' / ' + (l.agents || '—') },
            { titre: 'Écart', valeur: l => signe(l.ePers), classe: 'num' },
            { titre: 'Él./classe', valeur: l => l.ratio === null ? '—' : String(l.ratio).replace('.', ','), classe: 'num' },
            { titre: 'Alertes', valeur: l => l.alertes.length ? el('span', {}, l.alertes.map(a => U.badge(a, 'attention'))) : U.badge('RAS', 'ok') }
          ], v, { onLigne: l => Routeur.aller('carte-ecole/' + l.e.id), messageVide: 'Aucune école avec alerte.' }));
        }
        liste();
      }
    });
  });

  /* =======================================================================
     RAPPORT DE RENTRÉE
     ======================================================================= */

  Routeur.definir('rapport-rentree', function (racine, args, params) {
    const etat = { observations: '' };
    ecran(racine, {
      module: 'rapport-rentree', titre: 'Rapport de rentrée', cs: (args && args[0]) || (params && params.cs), objet: 'son rapport de rentrée',
      sous: 'Synthèse de la rentrée de la circonscription : classes, élèves, personnel, salles et mobilier école par école, à commenter puis imprimer.',
      charger: () => Promise.all([E.charger('statistiques_ecoles'), E.inscriptionsEnrichies({ statuts: ['ACTIF'] }), E.charger('classes', { annee_scolaire_id: EG.session.annee_id }),
        E.charger('personnels'), E.charger('infrastructures'), E.charger('inventaires_mobilier', { annee_scolaire_id: EG.session.annee_id })])
        .then(([stats, ins, classes, pers, infra, mob]) => ({ stats, ins, classes, pers, infra, mob })),
      rendre: (zone, X) => {
        const { C, cs, ecoles } = X;
        const D = X.data;
        const T = EG.StatsEcoles ? EG.StatsEcoles.totaux : (() => ({ g: 0, f: 0, t: 0, pers: 0 }));
        const dernier = {}; D.stats.forEach(s => { if (!dernier[s.ecole_id] || String(s.annee_code) > String(dernier[s.ecole_id].annee_code)) dernier[s.ecole_id] = s; });

        const lignes = ecoles.map(e => {
          const st = dernier[e.id] || null, tt = st ? T(st) : { g: 0, f: 0, t: 0, pers: 0 };
          const ins = D.ins.filter(i => i.ecole_id === e.id);
          const f = ins.filter(i => i._eleve && i._eleve.sexe === 'F').length;
          const eleves = ins.length || tt.t, filles = ins.length ? f : tt.f;
          // classes ouvertes : une classe jumelée ou multigrade compte pour une (js/classes-eg.js)
          const cx = EG.Classes.ecole(e, D.classes.filter(c => c.ecole_id === e.id), st), classes = EG.Classes.pourRatios(cx).n;
          const agents = D.pers.filter(p => p.ecole_id === e.id && p.actif !== false && ['ENSEIGNANT', 'AME'].indexOf(categoriePersonnel(p)) >= 0).length;
          const pers = agents || tt.pers;
          const salles = D.infra.filter(x => x.ecole_id === e.id && x.type_local === 'SALLE_CLASSE');
          const places = R.capaciteMobilier(D.mob.filter(x => x.ecole_id === e.id));
          return { e, classes, eleves, filles, pers,
            salles: salles.length, sallesBon: salles.filter(x => x.etat_murs === 'BON').length, places,
            defSalles: salles.length ? Math.max(0, classes - salles.length) : null,
            defPlaces: places ? Math.max(0, eleves - places) : null,
            defAgents: (e.statut || 'PUBLIQUE') !== 'PUBLIQUE' ? null : (pers ? Math.max(0, classes - pers) : (classes ? classes : null)) };
        });
        const somme = k => lignes.reduce((s, l) => s + (l[k] || 0), 0);
        const enTete = ['École', 'Arrondissement', 'Classes', 'Élèves', 'Filles', 'Personnel', 'Salles de classe', 'Salles en bon état', 'Places assises', 'Salles manquantes', 'Places manquantes', 'Enseignants manquants'];
        const cel = x => x === null || x === undefined ? '' : x;
        const rows = lignes.map(l => [l.e.nom, l.e.arrondissement || '', l.classes, l.eleves, l.filles, l.pers, l.salles, l.sallesBon, l.places, cel(l.defSalles), cel(l.defPlaces), cel(l.defAgents)]);
        rows.push({ gras: true, cells: ['TOTAL', '', somme('classes'), somme('eleves'), somme('filles'), somme('pers'), somme('salles'), somme('sallesBon'), somme('places'), somme('defSalles'), somme('defPlaces'), somme('defAgents')] });

        const texte = () => {
          const el_ = somme('eleves'), fi = somme('filles');
          const pauvres = lignes.filter(l => l.defAgents).sort((a, b) => b.defAgents - a.defAgents).slice(0, 5);
          return 'À la rentrée ' + (EG.session.annee_code || '') + ', d’après les données les plus récentes, la circonscription scolaire de ' + String(cs.nom).replace(/^CS\s+/i, '') + ' compte ' + lignes.length + ' école(s), '
            + somme('classes') + ' classe(s), ' + U.nombre(el_) + ' élève(s) dont ' + U.nombre(fi) + ' fille(s)' + (el_ ? ' (' + Math.round(fi / el_ * 100) + ' %)' : '')
            + ' et ' + U.nombre(somme('pers')) + ' agent(s) enseignant(s). Le manque d’enseignants ne concerne que les écoles publiques (le personnel des écoles privées n’est pas fourni par l’État).'
            + (pauvres.length ? ' Les écoles où l’écart entre classes et enseignants est le plus grand : ' + pauvres.map(l => l.e.nom + ' (' + l.defAgents + ')').join(', ') + '.' : '');
        };

        const zoneStats = el('div', { class: 'grille grille-stats' }, [
          U.stat(U.nombre(lignes.length), 'Écoles', ''), U.stat(U.nombre(somme('classes')), 'Classes', ''),
          U.stat(U.nombre(somme('eleves')), 'Élèves', 'ok'), U.stat(U.nombre(somme('pers')), 'Personnel enseignant', ''),
          U.stat(U.nombre(somme('defAgents')), 'Enseignants manquants', somme('defAgents') ? 'attention' : 'ok')
        ]);
        const zoneObs = el('textarea', { rows: '5', placeholder: 'Observations, difficultés constatées, besoins prioritaires…', 'aria-label': 'Observations',
          oninput: e => { etat.observations = e.target.value; } });
        zoneObs.value = etat.observations;
        const actions = el('div', { class: 'barre-actions' });
        const titre = 'Rapport de rentrée ' + (EG.session.annee_code || '') + ' — ' + cs.nom;
        const avant = () => '<p>' + ech(texte()) + '</p>';
        const apres = () => (etat.observations ? '<h3>Observations</h3><p>' + ech(etat.observations).replace(/\n/g, '<br>') + '</p>' : '');
        const sortie = mode => {
          const o = { C, cs, titre, fichier: 'rapport-rentree', entetes: enTete, lignes: rows, paysage: true, avant: avant(), apres: apres() };
          const btns = boutonsSortie(o);
          return btns[mode].click();
        };
        actions.appendChild(el('button', { class: 'btn btn-primaire', text: '\uE008 Imprimer le rapport', onclick: () => sortie(1) }));
        actions.appendChild(el('button', { class: 'btn btn-fantome', 'data-fiche': 'pdf', text: '\uE00D Télécharger la fiche remplie (PDF)', onclick: () => { if (global.DocExport) global.DocExport.prochain('pdf', 'rapport-rentree-' + (cs.code || cs.nom || '')); sortie(1); } }));
        actions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE00D Word', onclick: () => sortie(2) }));
        actions.appendChild(el('button', { class: 'btn btn-fantome', 'data-fiche': 'excel', text: '\uE00C Télécharger la fiche remplie (Excel)', onclick: () => sortie(0) }));
        zone.appendChild(zoneStats);
        zone.appendChild(U.carte('Synthèse', el('p', { text: texte() })));
        zone.appendChild(U.carte('Observations de la circonscription', zoneObs));
        zone.appendChild(actions);
        zone.appendChild(lignes.length ? U.tableau([
          { titre: 'École', valeur: l => l.e.nom }, { titre: 'Classes', valeur: l => U.nombre(l.classes), classe: 'num' },
          { titre: 'Élèves', valeur: l => U.nombre(l.eleves), classe: 'num' }, { titre: 'Personnel', valeur: l => U.nombre(l.pers), classe: 'num' },
          { titre: 'Salles', valeur: l => l.salles ? l.sallesBon + ' / ' + l.salles : '—', classe: 'num' },
          { titre: 'Places', valeur: l => l.places ? U.nombre(l.places) : '—', classe: 'num' },
          { titre: 'Manque', valeur: l => [l.defSalles ? l.defSalles + ' salle(s)' : '', l.defPlaces ? l.defPlaces + ' place(s)' : '', l.defAgents ? l.defAgents + ' enseignant(s)' : ''].filter(Boolean).join(' · ') || '—' }
        ], lignes, { onLigne: l => Routeur.aller('carte-ecole/' + l.e.id) }) : U.vide('Cette circonscription n’a pas encore d’école.'));
        zone.appendChild(el('p', { class: 'muet petit', text: 'Élèves, classes et personnel viennent des inscriptions et fiches enregistrées ; à défaut, des dernières statistiques de l’école. Les salles et les places assises viennent des inventaires d’infrastructures et de mobilier.' }));
      }
    });
  });

  /* =======================================================================
     ARCHIVE DES COURRIERS
     ======================================================================= */

  const SENS = { ARRIVEE: 'Courrier arrivé', DEPART: 'Courrier envoyé' };
  const CATEGORIES = { ADMINISTRATIF: 'Administratif', PEDAGOGIQUE: 'Pédagogique', PERSONNEL: 'Personnel', FINANCIER: 'Financier', STATISTIQUES: 'Statistiques', AUTRE: 'Autre' };
  const SUIVIS = { A_TRAITER: 'À traiter', TRAITE: 'Traité', CLASSE: 'Classé' };
  const TAILLE_MAX = 2 * 1024 * 1024;
  const dateCourte = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
  const aujourdhui = () => new Date().toISOString().slice(0, 10);

  Routeur.definir('courriers', function (racine, args, params) {
    const f = { sens: '', categorie: '', statut: '', q: '' };
    const gerer = peutGerer();
    ecran(racine, {
      module: 'courriers', titre: 'Archive des courriers', cs: (args && args[0]) || (params && params.cs), objet: 'son archive',
      sous: 'Registre des courriers reçus et envoyés : numéro d’ordre, objet, correspondant, suivi, et le courrier lui-même en pièce jointe.',
      charger: () => E.charger('courriers'),
      rendre: (zone, X) => {
        const { C, cs, ecoles } = X;
        const mes = X.data.filter(c => c.territoire_id === cs.id).sort((a, b) => String(b.date_courrier).localeCompare(String(a.date_courrier)) || String(b.reference).localeCompare(String(a.reference)));
        const ie = {}; ecoles.forEach(e => { ie[e.id] = e; });
        const zoneListe = el('div'), zoneStats = el('div'), actions = el('div', { class: 'barre-actions' });
        const barre = el('div', { class: 'barre-filtres' });
        const opts = o => Object.keys(o).map(k => ({ value: k, label: o[k] }));
        barre.appendChild(U.selecteur('Sens', opts(SENS), f.sens, v => { f.sens = v; liste(); }, { libelleVide: 'Arrivée et départ' }));
        barre.appendChild(U.selecteur('Catégorie', opts(CATEGORIES), f.categorie, v => { f.categorie = v; liste(); }, { libelleVide: 'Toutes' }));
        barre.appendChild(U.selecteur('Suivi', opts(SUIVIS), f.statut, v => { f.statut = v; liste(); }, { libelleVide: 'Tous' }));
        barre.appendChild(U.champRecherche('Rechercher (objet, correspondant, n°)', v => { f.q = sa(v); liste(); }));
        zone.appendChild(zoneStats); zone.appendChild(barre); zone.appendChild(actions); zone.appendChild(zoneListe);

        const visibles = () => mes.filter(c => (!f.sens || c.sens === f.sens) && (!f.categorie || c.categorie === f.categorie) && (!f.statut || c.statut === f.statut)
          && (!f.q || sa([c.objet, c.correspondant, c.reference, c.observations].join(' ')).indexOf(f.q) >= 0));

        function prochainNumero(sens, date) {
          const an = String(date || aujourdhui()).slice(0, 4), pre = (sens === 'DEPART' ? 'D' : 'A') + '-' + an + '-';
          let max = 0;
          mes.forEach(c => { if (String(c.reference || '').indexOf(pre) === 0) max = Math.max(max, Number(String(c.reference).slice(pre.length)) || 0); });
          return pre + String(max + 1).padStart(3, '0');
        }

        function ouvrirPiece(c) {
          if (!c.fichier_donnees) return;
          try {
            const bin = atob(String(c.fichier_donnees).split(',')[1] || ''), octets = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
            const url = URL.createObjectURL(new Blob([octets], { type: c.fichier_type || 'application/octet-stream' }));
            const w = window.open(url, '_blank');
            if (!w) U.toast('Autorisez les fenêtres pour ouvrir la pièce jointe', 'attention');
            setTimeout(() => URL.revokeObjectURL(url), 60000);
          } catch (e) { U.toast('La pièce jointe est illisible', 'danger'); }
        }

        function formulaire(c) {
          const rec = c || { sens: 'ARRIVEE', date_courrier: aujourdhui(), categorie: 'ADMINISTRATIF', statut: 'A_TRAITER' };
          const choix = (nom, lib, o, val) => {
            const s = el('select', { 'aria-label': lib }, Object.keys(o).map(k => { const op = el('option', { value: k, text: o[k] }); if (k === val) op.selected = true; return op; }));
            return el('div', { class: 'champ' }, [el('label', { text: lib }), s]);
          };
          const texte = (lib, val, type, extra) => el('div', { class: 'champ' }, [el('label', { text: lib }), el('input', Object.assign({ type: type || 'text', value: val || '' }, extra || {}))]);
          const cSens = choix('sens', 'Sens', SENS, rec.sens), cDate = texte('Date du courrier', rec.date_courrier, 'date');
          const cRef = texte('N° d’ordre (laissé vide : numéroté automatiquement)', rec.reference, 'text');
          const cObjet = texte('Objet', rec.objet), cCorr = texte('Expéditeur ou destinataire', rec.correspondant);
          const cEcole = el('div', { class: 'champ' }, [el('label', { text: 'École concernée (facultatif)' }),
            el('select', { 'aria-label': 'École concernée' }, [el('option', { value: '', text: '— Aucune —' })].concat(ecoles.map(e => { const op = el('option', { value: e.id, text: e.nom }); if (e.id === rec.ecole_id) op.selected = true; return op; })))]);
          const cCat = choix('categorie', 'Catégorie', CATEGORIES, rec.categorie), cSuivi = choix('statut', 'Suivi', SUIVIS, rec.statut);
          const cObs = el('div', { class: 'champ' }, [el('label', { text: 'Observations' }), el('textarea', { rows: '3', 'aria-label': 'Observations' })]);
          cObs.querySelector('textarea').value = rec.observations || '';
          const fichier = el('input', { type: 'file', accept: 'image/*,.pdf', 'aria-label': 'Pièce jointe' });
          let piece = { nom: rec.fichier_nom || '', type: rec.fichier_type || '', donnees: rec.fichier_donnees || '' };
          const infoPiece = el('p', { class: 'muet petit' });
          const majInfo = () => { infoPiece.textContent = piece.donnees ? 'Pièce jointe : ' + piece.nom : 'Aucune pièce jointe.'; };
          majInfo();
          fichier.addEventListener('change', () => {
            const fi = fichier.files && fichier.files[0]; if (!fi) return;
            if (fi.size > TAILLE_MAX) { U.toast('Pièce jointe trop lourde (2 Mo au maximum)', 'attention'); fichier.value = ''; return; }
            const lec = new FileReader();
            lec.onload = () => { piece = { nom: fi.name, type: fi.type, donnees: String(lec.result) }; majInfo(); };
            lec.readAsDataURL(fi);
          });
          const retirer = el('button', { class: 'btn btn-fantome btn-petit', type: 'button', text: 'Retirer la pièce jointe', onclick: () => { piece = { nom: '', type: '', donnees: '' }; fichier.value = ''; majInfo(); } });
          const corps = el('div', { class: 'formulaire' }, [cSens, cDate, cRef, cObjet, cCorr, cEcole, cCat, cSuivi, cObs,
            el('div', { class: 'champ' }, [el('label', { text: 'Courrier scanné ou photographié (image ou PDF, 2 Mo au plus)' }), fichier, infoPiece, retirer])]);
          U.modal(c ? 'Modifier le courrier' : 'Nouveau courrier', corps, fermer => [
            el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
            el('button', { class: 'btn btn-primaire', text: 'Enregistrer', onclick: () => {
              const val = x => x.querySelector('input,select,textarea').value.trim();
              const objet = val(cObjet), date = val(cDate), sens = val(cSens);
              if (!objet || !date) { U.toast('L’objet et la date sont obligatoires', 'attention'); return; }
              const nouveau = Object.assign({}, c || {}, {
                territoire_id: cs.id, sens, date_courrier: date, objet, correspondant: val(cCorr) || null, ecole_id: val(cEcole) || null,
                categorie: val(cCat), statut: val(cSuivi), observations: val(cObs) || null,
                reference: val(cRef) || (c && c.sens === sens && String(c.date_courrier).slice(0, 4) === date.slice(0, 4) ? c.reference : prochainNumero(sens, date)),
                fichier_nom: piece.donnees ? piece.nom : null, fichier_type: piece.donnees ? piece.type : null, fichier_donnees: piece.donnees || null
              });
              fermer();
              DB.put('courriers', nouveau).then(saved => DB.audit(c ? 'MAJ_COURRIER' : 'NOUVEAU_COURRIER', 'courriers', saved && saved.id || null, { reference: nouveau.reference, cs: cs.nom }))
                .then(() => { U.toast('Courrier enregistré'); EG.majSynchro(); return X.recharger(); });
            } })
          ]);
        }

        function supprimer(c) {
          U.confirmer('Supprimer ce courrier', 'Le courrier « ' + (c.objet || c.reference) + ' » et sa pièce jointe seront effacés.', () => {
            DB.remove('courriers', c.id).then(() => DB.audit('SUPPR_COURRIER', 'courriers', c.id, { reference: c.reference }))
              .then(() => { EG.majSynchro(); return X.recharger(); });
          }, 'Supprimer');
        }

        function changerSuivi(c, statut) {
          DB.put('courriers', Object.assign({}, c, { statut })).then(() => { EG.majSynchro(); return X.recharger(); });
        }

        function liste() {
          const v = visibles();
          zoneStats.textContent = '';
          zoneStats.appendChild(el('div', { class: 'grille grille-stats' }, [
            U.stat(U.nombre(mes.length), 'Courriers archivés', ''),
            U.stat(U.nombre(mes.filter(c => c.sens === 'ARRIVEE').length), 'Arrivés', ''),
            U.stat(U.nombre(mes.filter(c => c.sens === 'DEPART').length), 'Envoyés', ''),
            U.stat(U.nombre(mes.filter(c => c.statut === 'A_TRAITER').length), 'À traiter', mes.some(c => c.statut === 'A_TRAITER') ? 'attention' : 'ok')
          ]));
          actions.textContent = '';
          if (gerer) actions.appendChild(el('button', { class: 'btn btn-primaire', text: '＋ Nouveau courrier', onclick: () => formulaire(null) }));
          const enTete = ['N°', 'Date', 'Sens', 'Objet', 'Expéditeur / destinataire', 'Catégorie', 'Suivi', 'École'];
          boutonsSortie({ C, cs, titre: 'Registre des courriers — ' + cs.nom, fichier: 'courriers', entetes: enTete,
            lignes: v.slice().reverse().map(c => [c.reference || '', dateCourte(c.date_courrier), SENS[c.sens] || '', c.objet || '', c.correspondant || '', CATEGORIES[c.categorie] || '', SUIVIS[c.statut] || '', (ie[c.ecole_id] || {}).nom || '']),
            paysage: true }).forEach(b => actions.appendChild(b));
          zoneListe.textContent = '';
          if (!mes.length) { zoneListe.appendChild(U.vide('Aucun courrier archivé pour ' + cs.nom + '.' + (gerer ? ' Cliquez sur « Nouveau courrier » pour commencer le registre.' : ''))); return; }
          zoneListe.appendChild(U.tableau([
            { titre: 'N°', valeur: c => c.reference || '—' },
            { titre: 'Date', valeur: c => dateCourte(c.date_courrier) },
            { titre: 'Sens', valeur: c => U.badge(c.sens === 'DEPART' ? 'Envoyé' : 'Arrivé', c.sens === 'DEPART' ? 'info' : 'neutre') },
            { titre: 'Objet', valeur: c => c.objet || '—' },
            { titre: 'Correspondant', valeur: c => c.correspondant || '—' },
            { titre: 'Catégorie', valeur: c => CATEGORIES[c.categorie] || '—' },
            { titre: 'Suivi', valeur: c => gerer ? el('select', { 'aria-label': 'Suivi', onclick: ev => ev.stopPropagation(), onchange: ev => changerSuivi(c, ev.target.value) },
              Object.keys(SUIVIS).map(k => { const op = el('option', { value: k, text: SUIVIS[k] }); if (k === c.statut) op.selected = true; return op; })) : (SUIVIS[c.statut] || '—') },
            { titre: '', classe: 'col-etroite', valeur: c => el('span', { class: 'actions-mini' }, [
              c.fichier_donnees ? el('button', { class: 'btn btn-fantome btn-petit', 'aria-label': 'Ouvrir la pièce jointe', text: '\uE060', onclick: ev => { ev.stopPropagation(); ouvrirPiece(c); } }) : null,
              gerer ? el('button', { class: 'btn btn-fantome btn-petit', 'aria-label': 'Modifier', text: '\uE006', onclick: ev => { ev.stopPropagation(); formulaire(c); } }) : null,
              gerer ? el('button', { class: 'btn btn-fantome btn-petit btn-alerte', 'aria-label': 'Supprimer', text: '\uE005', onclick: ev => { ev.stopPropagation(); supprimer(c); } }) : null
            ]) }
          ], v, { messageVide: 'Aucun courrier ne correspond.' }));
        }
        liste();
      }
    });
  });
  /* Outils partagés avec les modules des circonscriptions (personnel par statut, carrières). */
  EG.EcransCS = { ecran, pseudoEcole, htmlTableau, boutonsSortie, peutGerer, refuse, categoriePersonnel, tri, LIB_FONCTION };
})(window);
