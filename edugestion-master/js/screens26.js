/* ÉduGestion Pro Master — l'import et l'export reliés à chaque rubrique.

   Sous l'en-tête de chaque rubrique (personnel, élèves, écoles, calendrier, courriers…), une barre
   propose « Exporter » et « Importer » : elle ouvre le module Import et export déjà réglé sur les
   données de la rubrique (jeux de données cochés, type d'import choisi, circonscription reprise) et
   ramène à la rubrique d'où l'on vient. La barre n'est posée que pour les comptes qui ont accès
   au module Import et export ; l'import n'est proposé qu'aux comptes de gestion.

   La table LIENS dit, pour une route, quelles données exporter et quel import proposer. Ce qu'elle
   ne dit pas se déduit du module de la rubrique (ses tables) ou, pour une table seule, de la table. */
(function (global) {
  'use strict';
  const EG = global.EG, U = EG.UI;
  const el = U.el, Routeur = U.Routeur;

  const ROLES_IMPORT = ['ADMIN_MEMP', 'ADMIN_TECHNIQUE', 'DDEMP', 'CS', 'DIRECTEUR'];
  const SYSTEME = ['users', 'audit_events', 'educmaster_sync_queue', 'conflits_synchronisation', 'device_sync_status',
    'feature_flags', 'support_tickets', 'maintenances', 'rollover_jobs', 'signatures_documents', 'documents'];
  /* Types que l'écran d'import sait reprendre (voir IMPORTABLES dans screens20.js). */
  const IMPORTABLES = ['eleves', 'personnels', 'classes', 'statistiques_ecoles', 'infrastructures', 'inventaires_mobilier', 'inventaires_equipements',
    'contacts', 'evenements_calendrier', 'courriers', 'carrieres_personnel', 'affectations_personnel', 'annees_scolaires', 'frais_scolarite', 'cahier_fonds'];

  /* exp : tables à exporter ; imp : type d'import, ou { route } pour un import qui a son propre écran ;
     imp absent : l'import général. */
  const LIENS = {
    accueil: { exp: ['ecoles', 'statistiques_ecoles', 'personnels', 'classes'] },
    'espace-cs': { exp: ['ecoles', 'personnels', 'contacts', 'evenements_calendrier', 'statistiques_ecoles'] },
    'carte-ecole': { exp: ['ecoles'], imp: { route: 'import-ecoles' } },
    'gestion-ecoles': { exp: ['ecoles', 'territoires'], imp: { route: 'import-ecoles' } },
    'unites-pedagogiques': { exp: ['territoires'], imp: { route: 'unites-pedagogiques' } },
    'personnel-cs': { exp: ['personnels'], imp: { route: 'import-export/personnel' } },
    personnel: { exp: ['personnels', 'carrieres_personnel', 'affectations_personnel', 'diplomes_personnel', 'formations_personnel'], imp: 'personnels' },
    agent: { exp: ['personnels', 'carrieres_personnel', 'affectations_personnel'], imp: 'personnels' },
    retraite: { exp: ['personnels', 'notifications_retraite'], imp: 'personnels' },
    certificats: { exp: ['certificats_agents', 'personnels'], imp: 'personnels' },
    'stats-cs': { exp: ['statistiques_ecoles'], imp: 'statistiques_ecoles' },
    'ecoles-cm2': { exp: ['statistiques_ecoles', 'inscriptions_eleves'], imp: 'statistiques_ecoles' },
    'ecarts-cs': { exp: ['statistiques_ecoles', 'classes', 'personnels'], imp: 'statistiques_ecoles' },
    'rapport-rentree': { exp: ['statistiques_ecoles', 'classes', 'infrastructures', 'inventaires_mobilier'], imp: 'statistiques_ecoles' },
    patrimoine: { exp: ['infrastructures', 'inventaires_mobilier', 'inventaires_equipements', 'services_ecole'], imp: 'infrastructures' },
    'classes-roles': { exp: ['classes', 'membres_instances'], imp: 'classes' },
    'attribution-classes': { exp: ['classes'], imp: 'classes' },
    repertoire: { exp: ['contacts'], imp: 'contacts' },
    'calendrier-scolaire': { exp: ['evenements_calendrier'], imp: 'evenements_calendrier' },
    courriers: { exp: ['courriers'], imp: 'courriers' },
    eleves: { exp: ['eleves', 'inscriptions_eleves'], imp: 'eleves' },
    'carte-eleve': { exp: ['eleves', 'inscriptions_eleves'], imp: 'eleves' },
    'fiche-cep': { exp: ['fiches_cep', 'inscriptions_eleves'], imp: 'eleves' },
    'presences-personnel': { exp: ['presences_personnel', 'personnels'] },
    bulletins: { exp: ['decisions_annuelles', 'notes', 'evaluations'] },
    'cep-blanc-centre': { exp: ['examens_blancs', 'notes_examens_blancs', 'centres_examen', 'compositions_centre'] },
    telechargements: { exp: ['recensements_ecoles', 'recensement_valeurs'] },
    'synthese-officielle': { exp: ['evaluations', 'notes'] },
    'synthese-evaluations': { exp: ['evaluations', 'notes'] },
    'statuts-cs': { exp: ['personnels', 'signatures_categories'], imp: { route: 'import-export/personnel' } },
    carrieres: { exp: ['personnels', 'carrieres_personnel', 'affectations_personnel', 'diplomes_personnel', 'formations_personnel'], imp: 'carrieres_personnel' },
    carriere: { exp: ['personnels', 'carrieres_personnel', 'affectations_personnel', 'diplomes_personnel', 'formations_personnel'], imp: 'carrieres_personnel' },
    'scolarite-privee': { exp: ['frais_scolarite', 'paiements_scolarite', 'remises_scolarite'], imp: 'frais_scolarite' },
    'caisse-privee': { exp: ['cahier_fonds', 'paiements_scolarite', 'salaires_ecole'], imp: 'cahier_fonds' },
    'salaires-privee': { exp: ['salaires_ecole', 'personnels'] },
    'registre-appel': { exp: ['presences'] },
    'releve-mensuel': { exp: ['presences'] },
    'bilan-presences': { exp: ['presences'] }
  };
  /* Routes sans données propres : pas de barre. */
  const SANS_BARRE = ['modules', 'import-export', 'import-ecoles', 'cachet', 'sync', 'comptes', 'plan', 'affichage', 'cloture'];

  function moduleDe(vue) {
    return EG.MODULES.filter(m => m.ecran === vue || (m.annexes || []).some(a => String(a[0]).split('/')[0] === vue))[0] || null;
  }

  /** { exp, imp } d'une route, ou null s'il n'y a rien à relier. */
  function liensDe(vue, args) {
    if (SANS_BARRE.indexOf(vue) >= 0) return null;
    let l = LIENS[vue] || null;
    if (vue === 'entite') {
      const e = args && args[0];
      if (!e || !EG.SCHEMA[e] || SYSTEME.indexOf(e) >= 0) return null;
      l = { exp: [e], imp: IMPORTABLES.indexOf(e) >= 0 ? e : undefined };
    }
    if (!l) {
      const m = moduleDe(vue);
      if (!m) return null;
      const exp = (m.entites || []).filter(e => EG.SCHEMA[e] && SYSTEME.indexOf(e) < 0);
      const imp = exp.filter(e => IMPORTABLES.indexOf(e) >= 0)[0];
      l = { exp, imp };
    }
    const exp = (l.exp || []).filter(e => EG.SCHEMA[e] && SYSTEME.indexOf(e) < 0);
    if (!exp.length) return null;
    return { exp, imp: l.imp };
  }

  function csDe(vue, args, params) {
    if (params && params.cs) return Promise.resolve(params.cs);
    /* La circonscription choisie dans l'écran (barre « département › circonscription »). */
    if (EG.Ecrans && EG.Ecrans.dernierEtat && EG.Ecrans.dernierEtat.cs) return Promise.resolve(EG.Ecrans.dernierEtat.cs);
    if (!args || !args[0] || !EG.Ecrans || !EG.Ecrans.contexteCS) return Promise.resolve('');
    return EG.Ecrans.contexteCS().then(ctx => (ctx.idsCS && ctx.idsCS[args[0]] ? args[0] : ''));
  }

  /**
   * Pose la barre sous l'en-tête de la rubrique affichée dans `contenu`.
   * À appeler juste après le rendu de l'écran.
   */
  function poser(contenu, vue, args, params) {
    if (!EG.session || !EG.peutVoirModule || !EG.peutVoirModule('import-export')) return;
    const l = liensDe(vue, args);
    if (!l) return;
    const retour = (location.hash || '').replace(/^#\/?/, '');
    const peutImporter = ROLES_IMPORT.indexOf(EG.session.user.role) >= 0 && EG.peutEcrire();
    const ouvrir = (route, extra) => csDe(vue, args, params).then(cs => {
      const q = Object.assign({}, extra || {}, cs ? { cs } : {}, { retour });
      Routeur.aller(route + '?' + Object.keys(q).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(q[k])).join('&'));
    });
    const boutons = [
      el('button', { class: 'btn btn-fantome btn-petit', text: '\uE00C Exporter', title: 'Emporter les données de cette rubrique dans Excel',
        onclick: () => ouvrir('import-export/export', { jeu: l.exp.join(',') }) })
    ];
    if (peutImporter) {
      boutons.push(el('button', { class: 'btn btn-fantome btn-petit', text: '\uE00B Importer', title: 'Reprendre des données depuis un tableau Excel ou CSV',
        onclick: () => {
          if (l.imp && l.imp.route) {
            const r = l.imp.route;
            if (r === 'unites-pedagogiques') csDe(vue, args, params).then(cs => Routeur.aller('unites-pedagogiques' + (cs ? '/' + cs : '')));
            else ouvrir(r);
          } else ouvrir('import-export/import', l.imp ? { type: l.imp } : {});
        } }));
    }
    const barre = el('div', { class: 'barre-ie', role: 'group', 'aria-label': 'Import et export de cette rubrique' }, [
      el('span', { class: 'muet petit', text: 'Import et export' })
    ].concat(boutons));
    const tete = contenu.querySelector('.page-tete');
    if (tete && tete.parentNode === contenu) tete.parentNode.insertBefore(barre, tete.nextSibling);
    else contenu.insertBefore(barre, contenu.firstChild);
  }

  EG.LiensImportExport = { poser, liensDe, LIENS, IMPORTABLES };
})(window);
