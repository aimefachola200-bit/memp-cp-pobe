/* ÉduGestion Pro — Espace CP, CCS et DDEMP (application MEMP-CP intégrée).

   Les conseillers pédagogiques, les chefs de circonscription, les directions départementales et
   l'administration retrouvent ici, à l'identique, l'application MEMP-CP : fiches de recensement, de
   rentrée et de fin d'année ; effectifs par âge, par sexe et par cours (maternelles par section) ;
   infrastructures et mobilier ; structure des écoles ; CEP ; rapports et bilans ; documents
   officiels ; en-têtes du MEMP ; cachets rond et rectangulaire ; QR de vérification.

   L'application est livrée dans le dossier memp-cp/. Elle s'ouvre avec le compte déjà connecté
   (même périmètre) et reprend les écoles et le personnel du périmètre depuis ÉduGestion. */
(function (global) {
  'use strict';
  const EG = global.EG, U = EG.UI, el = U.el, Routeur = U.Routeur;

  const ROLES = ['ADMIN_MEMP', 'ADMIN_TECHNIQUE', 'DDEMP', 'CS', 'CONSEILLER_PEDAGOGIQUE'];

  /* [écran de MEMP-CP, icône, libellé, rôles (facultatif)] */
  const RUBRIQUES = [
    ['accueil', '\uE000', 'Tableau de bord MEMP-CP'],
    ['espace', '\uE01E', 'Espace CP de zone'],
    ['synocp', '\uE00F', 'Tableau synoptique du CP'],
    ['recensement', '\uE011', 'Fiches de recensement annuel (EP, EM) — modèle GESCOL'],
    ['fiches', '\uE00E', 'Fiches de recensement, rentrée, fin d’année'],
    ['saisie', '\uE029', 'Saisie manuelle (sans Excel) : fiches, personnel, directeurs'],
    ['personnel', '\uE01E', 'Personnel enseignant'],
    ['carriere', '\uE016', 'Gestion de carrière (anciennetés, retraite)'],
    ['effectifs', '\uE01F', 'Effectifs : âges, sexe, cours, maternelles'],
    ['infra', '\uE026', 'Infrastructures et mobilier'],
    ['ecolesstruct', '\uE022', 'Écoles : salles, structure, équipements'],
    ['cep', '\uE020', 'CEP : candidats et réussite'],
    ['rapports', '\uE015', 'Rapports de fin d’année'],
    ['synoptique', '\uE011', 'Synthèse des fiches (consolidation)'],
    ['bilans', '\uE016', 'Bilans trimestriel et annuel'],
    ['activites', '\uE017', 'Activités pédagogiques'],
    ['themes', '\uE02E', 'Thèmes de l’année'],
    ['planif', '\uE017', 'Planification annuelle EM et EP'],
    ['emploi', '\uE018', 'Emplois du temps officiels'],
    ['calendrier', '\uE017', 'Calendrier scolaire officiel'],
    ['reglement', '\uE03F', 'Règlement intérieur'],
    ['documents', '\uE00D', 'Documents officiels'],
    ['whatsapp', '\uE035', 'Messages aux directeurs (WhatsApp)'],
    ['identite', '\uE029', 'Signature, cachets rond et rectangulaire'],
    ['verifier', '\uE004', 'Vérifier un document (QR)'],
    ['transmission', '\uE058', 'Transmission et sauvegarde']
  ];

  const autorise = () => !!(EG.session && EG.session.user && ROLES.indexOf(EG.session.user.role) >= 0 && !EG.session.ecole_id);

  /** Ouvre l'écran demandé de l'application MEMP-CP (même onglet : la connexion est reprise). */
  function ouvrir(ecran) {
    try { if (EG.DB && EG.DB.NOM) sessionStorage.setItem('eg-db', EG.DB.NOM); } catch (e) { /* stockage de session indisponible */ }
    location.href = 'memp-cp/index.html#/' + encodeURIComponent(ecran || 'accueil');
  }

  Routeur.definir('memp-cp', function (racine, args) {
    if (!autorise()) {
      racine.appendChild(U.vide('L’espace CP, CCS et DDEMP est réservé aux conseillers pédagogiques, aux chefs de circonscription, '
        + 'aux directions départementales et à l’administration.'));
      return;
    }
    const ecran = args && args[0];
    if (ecran) { ouvrir(ecran); racine.appendChild(el('p', { class: 'muet', text: 'Ouverture de l’espace CP…' })); return; }
    /* Sans écran précis : la liste des rubriques, en tuiles. */
    racine.appendChild(EG.Ecrans.entete('Espace CP, CCS et DDEMP',
      'L’application MEMP-CP intégrée : fiches officielles, mêmes calculs, mêmes en-têtes, cachets rond et rectangulaire, '
      + 'QR de vérification. Elle s’ouvre avec votre compte et reprend les écoles et le personnel de votre périmètre.'));
    racine.appendChild(el('div', { class: 'grille-tuiles', style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px' },
      RUBRIQUES.map(([id, ic, lib]) => el('button', {
        class: 'carte', type: 'button', style: 'text-align:left;cursor:pointer;padding:14px;display:flex;gap:10px;align-items:center',
        onclick: () => ouvrir(id)
      }, [el('span', { text: ic, style: 'font-size:1.6em', 'aria-hidden': 'true' }), el('strong', { text: lib })]))));
  });

  /** Bloc de menu « Espace CP · CCS · DDEMP » (construit par app.js pour les rôles concernés). */
  function blocMenu(lien) {
    if (!autorise()) return null;
    const details = el('details', { class: 'menu-categorie', open: true, dataset: { cat: 'memp-cp' } });
    details.style.setProperty('--coul-cat', '#C8102E');
    details.appendChild(el('summary', {}, [
      el('span', { class: 'menu-icone', text: '\uE06C', 'aria-hidden': 'true' }),
      el('span', { class: 'menu-texte', text: 'Espace CP · CCS · DDEMP (MEMP-CP)' }),
      el('span', { class: 'menu-compte', text: String(RUBRIQUES.length) })
    ]));
    RUBRIQUES.forEach(([id, ic, lib]) => {
      const l = lien('memp-cp/' + id, ic, lib, 'principal');
      l.dataset.route = 'memp-cp';
      details.appendChild(el('div', { class: 'menu-module', dataset: { texte: U.sansAccent(lib + ' memp cp ccs ddemp') } }, el('div', { class: 'menu-module-tete' }, [l])));
    });
    return details;
  }

  EG.EspaceMempCp = { ROLES, RUBRIQUES, blocMenu, ouvrir, autorise };
})(window);
