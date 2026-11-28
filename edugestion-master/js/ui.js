/* ÉduGestion Pro Master — composants d'interface, routeur, formulaires. */
(function (global) {
  'use strict';
  const EG = global.EG;

  /* ---------- Fabrique d'éléments ---------- */
  function el(tag, props, enfants) {
    const n = document.createElement(tag);
    if (props) Object.keys(props).forEach(k => {
      const v = props[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'dataset') Object.keys(v).forEach(d => { n.dataset[d] = v[d]; });
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    (Array.isArray(enfants) ? enfants : (enfants === undefined || enfants === null ? [] : [enfants]))
      .forEach(c => {
        if (c === null || c === undefined || c === false) return;
        n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
      });
    return n;
  }
  const $ = sel => document.querySelector(sel);

  /* ---------- Formatage ---------- */
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function dateFR(v) {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d.getTime())) return v;
    return d.getDate() + ' ' + MOIS[d.getMonth()] + ' ' + d.getFullYear();
  }
  function dateCourte(v) {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d.getTime())) return v;
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }
  function heure(v) {
    if (!v) return '—';
    const d = new Date(v);
    return dateCourte(v) + ' à ' + String(d.getHours()).padStart(2, '0') + 'h' + String(d.getMinutes()).padStart(2, '0');
  }
  function fcfa(n) {
    if (n === null || n === undefined || n === '') return '—';
    return Number(n).toLocaleString('fr-FR') + ' F CFA';
  }
  function nombre(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number(n).toLocaleString('fr-FR');
  }
  /* Les codes techniques sont stockés en majuscules sans accent ; ce lexique
     rend l'affichage lisible et correctement orthographié pour l'utilisateur. */
  const LEXIQUE = {
    PREVUE: 'Prévue', EN_COURS: 'En cours', REALISEE: 'Réalisée', REPORTEE: 'Reportée',
    ROND_ET_GRIFFE: 'Rond et rectangulaire (griffe)', ROND: 'Rond seul', RECTANGULAIRE: 'Rectangulaire seul',
    PREPARATION: 'Préparation', OUVERTE: 'Ouverte', CLOTURE_EN_COURS: 'Clôture en cours',
    CLOTUREE: 'Clôturée', CLOTURE: 'Clôturé', ARCHIVEE: 'Archivée', ARCHIVE: 'Archivé',
    VALIDEE: 'Validée', VALIDE: 'Validé', VERROUILLEE: 'Verrouillée', VERROUILLE: 'Verrouillé',
    GENERE: 'Généré', A_SIGNER: 'À signer', SIGNE: 'Signé', ANNULE: 'Annulé', ANNULEE: 'Annulée',
    SOUMIS: 'Soumis', SOUMISE: 'Soumise', CONTRESIGNEE: 'Contresignée',
    A_COMPLETER: 'À compléter', A_CORRIGER: 'À corriger', A_CONFIRMER: 'À confirmer',
    A_CONTROLER: 'À contrôler', A_CONTRESIGNER: 'À contresigner', PRET: 'Prêt', CALCULE: 'Calculé',
    NOUVELLE: 'Nouvelle', AFFECTEE: 'Affectée', PRISE_EN_CHARGE: 'Prise en charge',
    EN_ATTENTE: 'En attente', EN_COURS: 'En cours', RESOLUE: 'Résolue', IGNOREE: 'Ignorée',
    A_EXAMINER: 'À examiner', SURVEILLANCE: 'Surveillance', CLASSEE: 'Classée',
    A_FAIRE: 'À faire', REALISEE: 'Réalisée', A_VERIFIER: 'À vérifier', PLANIFIEE: 'Planifiée', RAPPORT_REDIGE: 'Rapport rédigé',
    NON_APPLICABLE: 'Non applicable', ABANDONNEE: 'Abandonnée', SUIVI: 'Suivi',
    PASSAGE: 'Passage', REDOUBLEMENT: 'Redoublement',
    SORTIE_PRIMAIRE: 'Sortie du primaire', SORTIE_PRIMAIRE_CEP: 'Sortie du primaire (CEP)',
    PRESENT: 'Présent', ABSENT: 'Absent', RETARD: 'Retard', JOURNEE: 'Journée',
    APRES_MIDI: 'Après-midi', MATIN: 'Matin',
    NOUVELLE_INSCRIPTION: 'Nouvelle inscription', REINSCRIPTION: 'Réinscription',
    TRANSFERT_ENTRANT: 'Transfert entrant', TRANSFERT_SORTANT: 'Transfert sortant',
    TRANSFERE: 'Transféré', ABANDON: 'Abandon', ACCEPTE: 'Accepté', REFUSE: 'Refusé',
    TERMINE: 'Terminé', PROPOSEE: 'Proposée', CONFIRMEE: 'Confirmée', EXPIREE: 'Expirée',
    REVOQUE: 'Révoqué', BROUILLON: 'Brouillon', PROVISOIRE: 'Provisoire', OFFICIEL: 'Officiel',
    PLANIFIE: 'Planifié', ENVOYE: 'Envoyé', LIVRE: 'Livré', ECHEC: 'Échec',
    ELEVEE: 'Élevée', ELEVE: 'Élevé', MOYENNE: 'Moyenne', MOYEN: 'Moyen', FAIBLE: 'Faible',
    CRITIQUE: 'Critique', INFO: 'Information', URGENTE: 'Urgente', NORMALE: 'Normale',
    POSITIF: 'Positif', A_AMELIORER: 'À améliorer', URGENT: 'Urgent',
    SYNCHRONISE: 'Synchronisé', NON_SYNCHRONISE: 'Non synchronisé', CONFLIT: 'Conflit',
    REJETE: 'Rejeté', ERREUR: 'Erreur', RESOLU: 'Résolu', OUVERT: 'Ouvert', FERME: 'Fermé',
    SUBVENTION_ETAT: 'Subvention de l’État', COTISATION_PARENT: 'Cotisation des parents',
    AUTRE_RESSOURCE: 'Autre ressource', DEPENSE: 'Dépense', AJUSTEMENT: 'Ajustement',
    ENTREE: 'Entrée', REPARATION: 'Réparation', REFORME: 'Réforme', PERTE: 'Perte',
    CORRECTION: 'Correction',
    SALLE_CLASSE: 'Salle de classe', BUREAU: 'Bureau', MAGASIN: 'Magasin', CANTINE: 'Cantine',
    LATRINES: 'Latrines', BIBLIOTHEQUE: 'Bibliothèque', LOGEMENT: 'Logement',
    TABLE_BANC: 'Table-banc', TABLE_MAITRE: 'Table de maître', ETAGERE: 'Étagère',
    CHAISE: 'Chaise', ARMOIRE: 'Armoire', TABLEAU: 'Tableau', NATTE: 'Natte',
    BON: 'Bon', PASSABLE: 'Passable', MAUVAIS: 'Mauvais', HORS_SERVICE: 'Hors service',
    DUR: 'Dur', SEMI_DUR: 'Semi-dur', BANCO: 'Banco', PAILLE: 'Paille', TOLE: 'Tôle', DALLE: 'Dalle',
    ADMIN_MEMP: 'Administrateur MEMP', ADMIN_TECHNIQUE: 'Administrateur technique',
    DDEMP: 'Direction départementale', CS: 'Circonscription scolaire',
    CONSEILLER_PEDAGOGIQUE: 'Conseiller pédagogique',
    DIRECTEUR: 'Directeur', ENSEIGNANT: 'Enseignant', PARENT: 'Parent', ELEVE: 'Élève', INSPECTEUR: 'Inspecteur',
    /* Les six cours : « CP » est le cours préparatoire, jamais le conseiller pédagogique. */
    CI: 'CI', CP: 'CP', CE1: 'CE1', CE2: 'CE2', CM1: 'CM1', CM2: 'CM2',
    MATERNELLE: 'Maternelle', PRIMAIRE: 'Primaire', MIXTE: 'Mixte', ENSEMBLE: 'Ensemble',
    PUBLIQUE: 'Publique', PRIVEE: 'Privée', COMMUNAUTAIRE: 'Communautaire',
    NATIONAL: 'National', DEPARTEMENT: 'Département', COMMUNE: 'Commune',
    ARRONDISSEMENT: 'Arrondissement', VILLAGE_QUARTIER: 'Village ou quartier de ville',
    CIRCONSCRIPTION: 'Circonscription', ZONE_PEDAGOGIQUE: 'Zone pédagogique',
    UNITE_PEDAGOGIQUE: 'Unité pédagogique',
    PERE: 'Père', MERE: 'Mère', TUTEUR: 'Tuteur', RESPONSABLE: 'Responsable',
    FRERE_SOEUR: 'Frère ou sœur',
    MOTEUR: 'Moteur', VISUEL: 'Visuel', AUDITIF: 'Auditif', INTELLECTUEL: 'Intellectuel',
    EXACTE: 'Exacte', APPROXIMATIVE: 'Approximative', INCONNUE: 'Inconnue',
    SCOLARISE: 'Scolarisé', RISQUE_DECROCHAGE: 'Risque de décrochage',
    DECROCHAGE_CONFIRME: 'Décrochage confirmé', SITUATION_INCONNUE: 'Situation inconnue',
    SIMPLE: 'Simple', JUMELEE: 'Jumelée', MULTIGRADE: 'Multigrade',
    VISITE_CLASSE: 'Visite de classe', VISITE_ECOLE: 'Visite d’école', INSPECTION: 'Inspection',
    REUNION_APE: 'Réunion de l’APE', AG: 'Assemblée générale', AME: 'AME',
    COMITE_DIRECTION: 'Comité de direction', CONSEIL_MAITRES: 'Conseil des maîtres',
    ACADEMIQUE: 'Académique', PROFESSIONNEL: 'Professionnel',
    INITIALE: 'Initiale', CONTINUE: 'Continue', RECYCLAGE: 'Recyclage',
    VISITE_FAMILLE: 'Visite à la famille', APPEL: 'Appel téléphonique', ENTRETIEN: 'Entretien',
    SOUTIEN_SCOLAIRE: 'Soutien scolaire', AIDE_MATERIELLE: 'Aide matérielle',
    ORDINAIRE: 'Ordinaire', ADAPTE: 'Adapté', INFORMATIQUE: 'Informatique', SPORTIF: 'Sportif',
    PROGRAMME: 'Programme', GUIDE: 'Guide', MANUEL: 'Manuel', BRAILLE: 'Braille',
    TOUS_PARENTS: 'Tous les parents', NIVEAU: 'Un niveau', CLASSE: 'Une classe',
    PERSONNEL: 'Le personnel', PUBLIEE: 'Publiée', PUBLIC: 'Public', INTERNE: 'Interne',
    CONFIDENTIEL: 'Confidentiel', SENSIBLE: 'Sensible',
    OFFICIELLE: 'Officielle', PARAMETRABLE: 'Paramétrable', SYSTEME: 'Système',
    APE: 'APE', ACE: 'ACE', CONTRACTUEL_ETAT: 'Contractuel de l’État',
    ADMINISTRATIF: 'Administratif', AUTRE: 'Autre', ACTIF: 'Actif', ACTIVE: 'Active',
    AUCUN: 'Aucun', PARTIEL: 'Partiel', TOTAL: 'Total', AUTO: 'Automatique', SAISIE: 'Saisie',
    COMITE_DIRECTION: 'Comité de direction', CONSEIL_MAITRES: 'Conseil des maîtres',
    APE: 'Association des parents d’élèves (APE)', AME: 'Association des mères d’élèves (AME)',
    COMITE_SANTE: 'Comité de santé', COMITE_CANTINE: 'Comité de cantine', AUTRE_INSTANCE: 'Autre instance',
    PRESIDENT: 'Président(e)', VICE_PRESIDENT: 'Vice-président(e)', SECRETAIRE: 'Secrétaire',
    SECRETAIRE_ADJOINT: 'Secrétaire adjoint(e)', TRESORIER: 'Trésorier(ère)', TRESORIER_ADJOINT: 'Trésorier(ère) adjoint(e)',
    COMMISSAIRE_COMPTES: 'Commissaire aux comptes', RAPPORTEUR: 'Rapporteur', CONSEILLER: 'Conseiller(ère)', MEMBRE: 'Membre',
    DIRECTEUR_ADJOINT: 'Directeur adjoint', CHEF_CS: 'Chef de circonscription', CONSEILLER_PEDAGOGIQUE: 'Conseiller pédagogique',
    RESPONSABLE_UP: 'Responsable d’unité pédagogique', DDEMP: 'Directeur départemental', ELU_LOCAL: 'Élu local (mairie)',
    PRESIDENT_APE: 'Président de l’APE', PARTENAIRE: 'Partenaire', RENTREE: 'Rentrée', VACANCES: 'Vacances', FERIE: 'Jour férié',
    EXAMEN: 'Examen', REUNION: 'Réunion', ANIMATION_PEDAGOGIQUE: 'Animation pédagogique', VISITE: 'Visite', FORMATION: 'Formation',
    CEREMONIE: 'Cérémonie', ENSEMBLE: 'Tous les cycles', UNITE_PEDAGOGIQUE: 'Unité pédagogique', ZONE_PEDAGOGIQUE: 'Zone pédagogique',
    ANNUELLE: 'Annuelle', PENDING: 'En attente', SYNCED: 'Synchronisé', FAILED: 'Échec',
    MATIN: 'Matin', APRES_MIDI: 'Après-midi', JOURNEE: 'Journée entière (ancien appel)',
    FE: 'FE (fonctionnaire de l’État)', ACDPE: 'ACDPE', ACDPCTD: 'ACDPCTD', PRIVE: 'Privé',
    INSCRIPTION: 'Droits d’inscription', TRANCHE_1: '1re tranche', TRANCHE_2: '2e tranche', TRANCHE_3: '3e tranche', RESTE: 'Reste à payer',
    ESPECES: 'Espèces', MOBILE_MONEY: 'Mobile money', VIREMENT: 'Virement', CHEQUE: 'Chèque',
    RECETTE: 'Recette', DEPENSE: 'Dépense', SCOLARITE: 'Scolarité', SUBVENTION: 'Subvention', DON: 'Don', AUTRE_RECETTE: 'Autre recette',
    SALAIRES: 'Salaires', LOYER: 'Loyer', EAU_ELECTRICITE: 'Eau et électricité', FOURNITURES: 'Fournitures', ENTRETIEN: 'Entretien',
    IMPOTS_TAXES: 'Impôts et taxes', TRANSPORT: 'Transport', EQUIPEMENT: 'Équipement', AUTRE_DEPENSE: 'Autre dépense',
    A_PAYER: 'À payer', PAYE: 'Payé',
    AVANCEMENT_ECHELON: 'Avancement d’échelon', PROMOTION_GRADE: 'Promotion de grade', MISE_A_DISPOSITION: 'Mise à disposition',
    ADMISSION_RETRAITE: 'Admission à la retraite', REPRISE_SERVICE: 'Reprise de service'
  };

  function libelle(v) {
    if (v === null || v === undefined || v === '') return '—';
    if (v === true) return 'Oui';
    if (v === false) return 'Non';
    const cle = String(v);
    if (LEXIQUE[cle]) return LEXIQUE[cle];
    return cle.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
  }
  function sansAccent(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  /* ---------- Retours visuels ---------- */
  let minuteurToast;
  function toast(message, variante) {
    let t = $('#toast');
    if (!t) { t = el('div', { id: 'toast' }); document.body.appendChild(t); }
    t.className = 'toast ' + (variante || '') + ' visible';
    t.textContent = message;
    clearTimeout(minuteurToast);
    minuteurToast = setTimeout(() => { t.className = 'toast ' + (variante || ''); }, 3200);
  }

  function modal(titre, contenu, actions) {
    const fond = el('div', { class: 'modal-fond' });
    const boite = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': titre });
    const fermer = () => fond.remove();
    boite.appendChild(el('div', { class: 'modal-tete' }, [
      el('h2', { text: titre }),
      el('button', { class: 'icone-btn', 'aria-label': 'Fermer', onclick: fermer, text: '✕' })
    ]));
    boite.appendChild(el('div', { class: 'modal-corps' }, contenu));
    if (actions) boite.appendChild(el('div', { class: 'modal-pied' }, actions(fermer)));
    fond.appendChild(boite);
    fond.addEventListener('click', e => { if (e.target === fond) fermer(); });
    document.body.appendChild(fond);
    return fermer;
  }

  /** Petite boîte de saisie d'un nom, pour créer un territoire à la volée
      (arrondissement, village…) sans quitter le formulaire en cours. */
  function saisieRapide(titre, etiquette, onValider) {
    const champ = el('input', { type: 'text', id: 'saisie-rapide' });
    const erreur = el('p', { class: 'muet petit' });
    modal(titre, el('div', { class: 'champ' }, [
      el('label', { for: 'saisie-rapide', text: etiquette }), champ, erreur
    ]), fermer => [
      el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
      el('button', {
        class: 'btn btn-primaire', text: 'Ajouter', onclick: () => {
          const v = champ.value.trim();
          if (!v) { erreur.textContent = 'Ce champ est obligatoire.'; return; }
          fermer();
          onValider(v);
        }
      })
    ]);
    setTimeout(() => champ.focus(), 30);
  }

  function confirmer(titre, message, onOui, libelleOui) {
    modal(titre, el('p', { text: message }), fermer => [
      el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
      el('button', {
        class: 'btn btn-danger', text: libelleOui || 'Confirmer',
        onclick: () => { fermer(); onOui(); }
      })
    ]);
  }

  function badge(texte, ton) {
    return el('span', { class: 'badge ' + (ton || ''), text: texte });
  }

  const TONS = {
    ACTIF: 'ok', VALIDE: 'ok', VALIDEE: 'ok', PUBLIE: 'ok', PUBLIEE: 'ok', OUVERTE: 'ok', SYNCHRONISE: 'ok',
    PRESENT: 'ok', PASSAGE: 'ok', ADMIS: 'ok', OFFICIEL: 'ok', RESOLUE: 'ok', REALISEE: 'ok', SORTIE_PRIMAIRE: 'info',
    BROUILLON: 'neutre', NOUVELLE: 'info', SOUMIS: 'info', PROVISOIRE: 'info', EN_COURS: 'info', A_COMPLETER: 'attention',
    RETARD: 'attention', MOYEN: 'attention', MOYENNE: 'attention', A_CORRIGER: 'attention', PENDING: 'attention',
    ABSENT: 'danger', REDOUBLEMENT: 'danger', CRITIQUE: 'danger', ELEVE: 'danger', ELEVEE: 'danger', ABANDON: 'danger',
    VERROUILLE: 'verrou', VERROUILLEE: 'verrou', CLOTUREE: 'verrou', CLOTURE: 'verrou'
  };
  function statut(v) {
    if (v === null || v === undefined || v === '') return el('span', { class: 'muet', text: '—' });
    return badge(libelle(v), TONS[String(v).toUpperCase()] || 'neutre');
  }

  function vide(message, action) {
    return el('div', { class: 'etat-vide' }, [
      el('p', { text: message }),
      action || null
    ]);
  }

  function carte(titre, corps, pied) {
    return el('section', { class: 'carte' }, [
      titre ? el('h3', { class: 'carte-titre', text: titre }) : null,
      corps, pied || null
    ]);
  }

  function stat(valeur, etiquette, ton) {
    return el('div', { class: 'stat ' + (ton || '') }, [
      el('div', { class: 'stat-valeur', text: valeur }),
      el('div', { class: 'stat-etiquette', text: etiquette })
    ]);
  }

  function barre(pourcentage, ton) {
    return el('div', { class: 'barre' }, el('span', {
      class: 'barre-remplie ' + (ton || ''), style: 'width:' + Math.max(0, Math.min(100, pourcentage)) + '%'
    }));
  }

  function tableau(colonnes, lignes, options) {
    options = options || {};
    if (!lignes.length) return vide(options.messageVide || 'Rien à afficher pour l’instant.', options.actionVide);
    const t = el('table', { class: 'tableau' });
    t.appendChild(el('thead', {}, el('tr', {}, colonnes.map(c => el('th', { text: c.titre, class: c.classe || '' })))));
    const corps = el('tbody');
    lignes.forEach(r => {
      const tr = el('tr', options.onLigne ? { class: 'cliquable', onclick: () => options.onLigne(r), tabindex: '0',
        onkeydown: e => { if (e.key === 'Enter') options.onLigne(r); } } : {});
      colonnes.forEach(c => {
        const v = c.valeur(r);
        tr.appendChild(el('td', { class: c.classe || '', 'data-th': c.titre },
          v instanceof Node ? v : document.createTextNode(v === null || v === undefined ? '—' : String(v))));
      });
      corps.appendChild(tr);
    });
    t.appendChild(corps);
    return el('div', { class: 'tableau-enveloppe' }, t);
  }

  function champRecherche(placeholder, onSaisie) {
    return el('div', { class: 'recherche' }, [
      el('span', { class: 'recherche-icone', text: '\uE02A', 'aria-hidden': 'true' }),
      el('input', { type: 'search', placeholder: placeholder, 'aria-label': placeholder, oninput: e => onSaisie(e.target.value) })
    ]);
  }

  function selecteur(etiquette, options, valeur, onChange, opts) {
    opts = opts || {};
    const s = el('select', { 'aria-label': etiquette, onchange: e => onChange(e.target.value) });
    if (opts.vide !== false) s.appendChild(el('option', { value: '', text: opts.libelleVide || 'Tous' }));
    options.forEach(o => {
      const op = el('option', { value: o.value, text: o.label });
      if (String(o.value) === String(valeur)) op.selected = true;
      s.appendChild(op);
    });
    return el('label', { class: 'filtre' }, [el('span', { text: etiquette }), s]);
  }

  /* ---------- Formulaire générique piloté par le schéma ---------- */
  function formulaire(entite, valeurs, refs, options) {
    options = options || {};
    const def = EG.SCHEMA[entite];
    const form = el('form', { class: 'formulaire', novalidate: true });
    const controles = {};
    const donnees = Object.assign({}, valeurs || {});
    /* Champs « ref » cascadants (ex. commune selon département) : ceux-ci
       doivent reconstruire la liste de leurs options quand un champ dont ils
       dépendent change, pour ne jamais proposer un choix incohérent. */
    const reconstructeurs = [];

    function valeurChamp(nom) {
      const entree = controles[nom];
      return entree ? (entree.ctrl.value || '') : '';
    }

    function filtrerCascade(casc, lignes) {
      let base = lignes;
      if (casc.typeChampSource) {
        const typeChoisi = valeurChamp(casc.typeChampSource);
        const regles = (EG[casc.reglesParent] && EG[casc.reglesParent][typeChoisi]) || [];
        return base.filter(r => regles.indexOf(r.type) >= 0);
      }
      if (casc.typeCible) base = base.filter(r => r.type === casc.typeCible);
      if (casc.parentChamp) {
        const valParent = valeurChamp(casc.parentChamp);
        if (!valParent) return casc.optionnelSansParent ? base : [];
        base = base.filter(r => r.parent_id === valParent);
      } else if (casc.ancetreChamp) {
        /* Filtre plus souple : le territoire doit simplement descendre, à
           n'importe quelle profondeur, de celui choisi dans ancetreChamp
           (utile pour la circonscription, qui peut être rattachée soit au
           département, soit directement à une commune). */
        /* ancetreChamp peut être une liste, du plus précis au plus large :
           le premier champ renseigné donne l'ancêtre à respecter. */
        const champsAncetre = [].concat(casc.ancetreChamp);
        let valAncetre = '';
        for (let i = 0; i < champsAncetre.length && !valAncetre; i++) valAncetre = valeurChamp(champsAncetre[i]);
        if (!valAncetre) return casc.optionnelSansParent ? base : [];
        const index = {};
        ((refs && refs.territoires) || []).forEach(t => { index[t.id] = t; });
        /* Option : les éléments rattachés directement au territoire indiqué restent proposés
           (ex. une unité pédagogique sans zone reste au choix de toutes les écoles de sa circonscription). */
        const direct = casc.ouEnfantDirectDe ? valeurChamp(casc.ouEnfantDirectDe) : '';
        base = base.filter(r => {
          if (direct && r.parent_id === direct) return true;
          let cur = r, sauts = 0;
          while (cur && sauts < 10) {
            if (cur.id === valAncetre) return true;
            cur = cur.parent_id ? index[cur.parent_id] : null;
            sauts++;
          }
          return false;
        });
      }
      return base;
    }

    function reconstruireCascades() { reconstructeurs.forEach(fn => fn()); }
    /* Commune ou arrondissement choisi : ses arrondissements / villages du référentiel national (js/geo-ref.js) */
    function completerReferentiel(c, ctrl) {
      if (c.ref !== 'territoires' || !EG.GeoRef || !refs || !refs.territoires) return;
      const choisi = refs.territoires.find(r => String(r.id) === String(ctrl.value));
      if (!choisi || (choisi.type !== 'COMMUNE' && choisi.type !== 'ARRONDISSEMENT')) return;
      EG.GeoRef.completer(choisi, refs.territoires).then(n => { if (n) reconstruireCascades(); });
    }

    def.champs.forEach(c => {
      if (options.masquer && options.masquer.indexOf(c.n) >= 0) return;
      if (c.derive) return; /* recalculé à l'enregistrement : jamais saisi directement */
      let ctrl;
      const idc = 'f_' + c.n;
      const val = donnees[c.n] !== undefined && donnees[c.n] !== null ? donnees[c.n] : (c.def !== undefined ? c.def : '');
      if (c.t === 'textarea' || c.t === 'json') {
        ctrl = el('textarea', { id: idc, rows: c.t === 'json' ? 4 : 3 });
        ctrl.value = c.t === 'json' && typeof val === 'object' && val ? JSON.stringify(val, null, 2) : (val || '');
      } else if (c.t === 'bool') {
        ctrl = el('input', { type: 'checkbox', id: idc });
        ctrl.checked = !!val;
      } else if (c.t === 'select') {
        ctrl = el('select', { id: idc });
        ctrl.appendChild(el('option', { value: '', text: '— Choisir —' }));
        (c.o || []).filter(o => o !== '').forEach(o => {
          const op = el('option', { value: o, text: libelle(o) });
          if (String(val) === String(o)) op.selected = true;
          ctrl.appendChild(op);
        });
      } else if (c.t === 'ref') {
        ctrl = el('select', { id: idc });
        let initialise = false;
        const construire = () => {
          const valActuelle = initialise ? ctrl.value : (val !== null && val !== undefined ? String(val) : '');
          initialise = true;
          ctrl.textContent = '';
          ctrl.appendChild(el('option', { value: '', text: '— Choisir —' }));
          let lignes = (refs && refs[c.ref]) || [];
          if (options.excludeId && c.ref === entite) lignes = lignes.filter(r => r.id !== options.excludeId);
          if (c.casc) {
            /* Listes territoriales : ordre alphabétique, « CS 2 » avant « CS 10 ». */
            lignes = filtrerCascade(c.casc, lignes).slice().sort((a, b) =>
              String(EG.UI.titreDe(c.ref, a)).localeCompare(String(EG.UI.titreDe(c.ref, b)), 'fr', { numeric: true }));
          }
          lignes.forEach(r => {
            const op = el('option', { value: r.id, text: EG.UI.titreDe(c.ref, r) });
            if (String(valActuelle) === String(r.id)) op.selected = true;
            ctrl.appendChild(op);
          });
          if (c.ajoutRapide && typeof EG.peutEcrire === 'function' && EG.peutEcrire()) {
            ctrl.appendChild(el('option', { value: '__ajouter__', text: '\uE001 Ajouter ' + c.ajoutRapide.libelle + '…' }));
          }
          if (!lignes.some(r => String(valActuelle) === String(r.id))) ctrl.value = '';
        };
        construire();
        if (c.casc) reconstructeurs.push(construire);
        ctrl.addEventListener('change', () => {
          if (ctrl.value === '__ajouter__') {
            const champParent = c.casc && (c.casc.parentChamp || [].concat(c.casc.ancetreChamp || [])[0]);
            const valParent = champParent ? valeurChamp(champParent) : null;
            ctrl.value = '';
            if (champParent && !valParent) {
              toast('Choisissez d’abord le niveau supérieur.', 'attention');
              return;
            }
            saisieRapide('Ajouter ' + c.ajoutRapide.libelle, 'Nom', nom => {
              const nouveau = { type: c.ajoutRapide.type, nom, actif: true };
              if (c.casc && c.casc.parentChamp) nouveau.parent_id = valParent;
              EG.DB.put('territoires', nouveau).then(rec => {
                (refs[c.ref] = refs[c.ref] || []).push(rec);
                reconstruireCascades();
                ctrl.value = rec.id;
                toast('« ' + rec.nom + ' » ajouté·e.');
              });
            });
            return;
          }
          reconstruireCascades();
          completerReferentiel(c, ctrl);
        });
        if (c.casc && ctrl.value) setTimeout(() => completerReferentiel(c, ctrl), 0);
      } else if (c.t === 'image') {
        /* Une photo choisie sur l'appareil, redimensionnée puis conservée
           telle quelle dans la base : rien ne part sur le réseau. */
        ctrl = el('input', { type: 'file', id: idc, accept: 'image/*' });
        ctrl.dataURL = typeof val === 'string' ? val : '';
        const apercu = el('img', { class: 'apercu-image', alt: '' });
        if (ctrl.dataURL) apercu.src = ctrl.dataURL;
        else apercu.style.display = 'none';
        ctrl.addEventListener('change', () => {
          const fichier = ctrl.files && ctrl.files[0];
          if (!fichier) return;
          const lecteur = new FileReader();
          lecteur.onload = () => {
            const img = new Image();
            img.onload = () => {
              const max = 1200;
              const ratio = Math.min(1, max / Math.max(img.width, img.height));
              const toile = document.createElement('canvas');
              toile.width = Math.round(img.width * ratio);
              toile.height = Math.round(img.height * ratio);
              toile.getContext('2d').drawImage(img, 0, 0, toile.width, toile.height);
              ctrl.dataURL = toile.toDataURL('image/jpeg', 0.82);
              apercu.src = ctrl.dataURL;
              apercu.style.display = '';
            };
            img.src = lecteur.result;
          };
          lecteur.readAsDataURL(fichier);
        });
        ctrl.apercu = apercu;
      } else if (c.t === 'password') {
        ctrl = el('input', { type: 'password', id: idc, autocomplete: 'new-password' });
      } else {
        const type = c.t === 'number' || c.t === 'money' ? 'number'
          : (c.t === 'date' ? 'date' : (c.t === 'datetime' ? 'datetime-local' : 'text'));
        ctrl = el('input', { type: type, id: idc, placeholder: c.ph || '' });
        if (c.min !== undefined) ctrl.min = c.min;
        if (c.max !== undefined) ctrl.max = c.max;
        if (c.step) ctrl.step = c.step;
        ctrl.value = c.t === 'datetime' && val ? String(val).slice(0, 16) : (val === null ? '' : val);
        if (c.sug) {      /* v8.3.0 : suggestions (liste déroulante) tout en gardant la saisie libre */
          const dlId = 'sug_' + c.n + '_' + Math.random().toString(36).slice(2, 7);
          ctrl.setAttribute('list', dlId);
          ctrl._dl = el('datalist', { id: dlId }, c.sug.map(o => el('option', { value: o })));
        }
      }
      if (c.req) ctrl.required = true;
      controles[c.n] = { ctrl, def: c };
      form.appendChild(el('div', { class: 'champ ' + (c.t === 'bool' ? 'champ-bool' : '') },
        c.t === 'bool'
          ? [ctrl, el('label', { for: idc, text: c.l })]
          : [el('label', { for: idc, text: c.l + (c.req ? ' *' : '') }), ctrl]
            .concat(c.t === 'image' ? [ctrl.apercu] : [])));
      if (ctrl._dl) form.appendChild(ctrl._dl);
    });

    /* Un champ dont une cascade dépend doit la redéclencher à chaque
       changement, même s'il n'est pas lui-même cascadant (ex. le « Type »
       d'un territoire, dont dépend le sélecteur « Rattaché à »). */
    const declencheurs = {};
    def.champs.forEach(c => {
      if (!c.casc) return;
      [c.casc.parentChamp, c.casc.typeChampSource].concat(c.casc.ancetreChamp || []).filter(Boolean)
        .forEach(nom => { declencheurs[nom] = true; });
    });
    Object.keys(declencheurs).forEach(nom => {
      const entree = controles[nom];
      if (entree) entree.ctrl.addEventListener('change', reconstruireCascades);
    });

    form.lire = function () {
      const out = Object.assign({}, donnees);
      const erreurs = [];
      Object.keys(controles).forEach(k => {
        const { ctrl, def: c } = controles[k];
        let v;
        if (c.t === 'bool') v = ctrl.checked;
        else if (c.t === 'image') v = ctrl.dataURL || null;
        else if (c.t === 'number' || c.t === 'money') v = ctrl.value === '' ? null : Number(ctrl.value);
        else if (c.t === 'json') {
          if (!ctrl.value.trim()) v = null;
          else { try { v = JSON.parse(ctrl.value); } catch (e) { erreurs.push(c.l + ' : le format JSON est invalide.'); v = null; } }
        } else v = ctrl.value === '' ? null : ctrl.value;
        if (c.req && (v === null || v === '' || v === undefined)) erreurs.push(c.l + ' est obligatoire.');
        if ((c.t === 'number' || c.t === 'money') && v !== null) {
          if (c.min !== undefined && v < c.min) erreurs.push(c.l + ' doit être au minimum ' + c.min + '.');
          if (c.max !== undefined && v > c.max) erreurs.push(c.l + ' doit être au maximum ' + c.max + '.');
        }
        if (c.t === 'password' && !v) return; // mot de passe laissé vide : inchangé
        out[k] = v;
      });
      /* Les rubriques dérivées (nom de la commune, de l'arrondissement…) se
         recalculent depuis le territoire choisi : jamais saisies à la main,
         donc jamais désynchronisées ni fautives d'orthographe. */
      def.champs.filter(c => c.derive && c.deriveDe).forEach(c => {
        const idRef = out[c.deriveDe];
        const table = (refs && refs.territoires) || [];
        const trouve = idRef ? table.filter(t => t.id === idRef)[0] : null;
        out[c.n] = trouve ? trouve.nom : null;
      });
      return { valeurs: out, erreurs };
    };
    return form;
  }

  /* ---------- Routeur ---------- */
  const Routeur = {
    routes: {},
    definir(nom, rendu) { Routeur.routes[nom] = rendu; },
    /** Navigue vers une route. Demander la route déjà affichée la redessine :
        c'est ce qui permet à un écran de se rafraîchir après un enregistrement. */
    aller(chemin) {
      const cible = '#/' + String(chemin).replace(/^#?\/?/, '');
      if (location.hash === cible) window.dispatchEvent(new Event('hashchange'));
      else location.hash = cible;
    },
    lire() {
      const brut = location.hash.replace(/^#\/?/, '');
      const [chemin, requete] = brut.split('?');
      const segments = chemin ? chemin.split('/') : [];
      const params = {};
      (requete || '').split('&').filter(Boolean).forEach(p => {
        const [k, v] = p.split('=');
        params[decodeURIComponent(k)] = decodeURIComponent(v || '');
      });
      return { vue: segments[0] || 'accueil', args: segments.slice(1), params };
    }
  };


  /* ---------- En-têtes fixes (v6.24) ----------
     Chaque tableau garde sa ligne de rubriques visible : thead (ou premières lignes faites de <th>), lignes
     empilées ; dans un cadre .tableau-enveloppe l'en-tête se colle en haut du cadre, ou juste sous le haut de la
     zone de contenu quand le cadre passe dessous ; sous le titre collé de la carte s'il y en a un. 1re colonne
     collée quand le tableau déborde sur les côtés. data-entete="non" : pas d'en-tête fixe. */
  const EntetesFixes = (function () {
    const vide = c => { const b = getComputedStyle(c).backgroundColor; return !b || b === 'transparent' || b === 'rgba(0, 0, 0, 0)'; };
    function lignesEntete(t) {
      if (t.tHead && t.tHead.rows.length) return Array.from(t.tHead.rows);
      const rows = [];
      for (let i = 0; i < t.rows.length && i < 4; i++) {
        const cells = Array.from(t.rows[i].cells);
        if (cells.length && cells.every(c => c.tagName === 'TH')) rows.push(t.rows[i]); else break;
      }
      return rows;
    }
    function titreAuDessus(elt) {
      let a = elt.parentElement;
      for (let i = 0; a && i < 6 && a.id !== 'contenu'; i++, a = a.parentElement) {
        const titres = Array.from(a.children).filter(c => (c.classList.contains('carte-titre') || c.classList.contains('titre-fixe'))
          && (c.compareDocumentPosition(elt) & Node.DOCUMENT_POSITION_FOLLOWING) && getComputedStyle(c).position === 'sticky');
        if (titres.length) return titres[titres.length - 1];
      }
      return null;
    }
    function fixer(t) {
      if (t.closest('[data-entete="non"], .modal, .apercu-document')) return;
      const rows = lignesEntete(t), cadre = t.closest('.tableau-enveloppe');
      let y = 0;
      if (rows.length) t.classList.add('entete-fixe');
      rows.forEach(r => {
        Array.from(r.cells).forEach(c => { c.classList.add('th-fixe'); c.dataset.haut = y; if (vide(c)) c.style.backgroundColor = 'var(--primaire-clair)'; });
        y += r.getBoundingClientRect().height;
      });
      let deborde = cadre && cadre.scrollWidth > cadre.clientWidth + 4;
      const corps = t.tBodies[0] && t.tBodies[0].rows[0];
      if (corps && Array.from(corps.cells).some(c => !c.classList.contains('col-fixe') && getComputedStyle(c).position === 'sticky' && getComputedStyle(c).left !== 'auto')) deborde = false;
      let couvert = 0;   // lignes dont la 1re colonne est occupée par une cellule fusionnée (rowspan) d'au-dessus
      Array.from(t.rows).forEach(r => {
        const c = r.cells[0];
        if (!c) return;
        if (couvert > 0) { couvert--; c.classList.remove('col-fixe'); return; }
        couvert = (c.rowSpan || 1) - 1;
        if (deborde && (c.colSpan || 1) <= 2 && r.cells.length > 2) { c.classList.add('col-fixe'); if (vide(c)) c.style.backgroundColor = c.tagName === 'TH' ? 'var(--primaire-clair)' : 'var(--surface)'; }
        else c.classList.remove('col-fixe');
      });
    }
    function placer() {
      const zone = document.getElementById('contenu');
      const haut = zone ? zone.getBoundingClientRect().top : 0;
      // les positions collées se mesurent depuis l'intérieur de la marge haute de la zone de contenu
      const marge = zone ? parseFloat(getComputedStyle(zone).paddingTop) || 0 : 0;
      document.querySelectorAll('table.entete-fixe').forEach(t => {
        const cadre = t.closest('.tableau-enveloppe'), titre = titreAuDessus(cadre || t);
        // ligne sous laquelle l'en-tête doit rester : haut de la zone de contenu, ou bas du titre collé de la carte
        const ligne = titre ? Math.max(haut, titre.getBoundingClientRect().bottom) : haut;
        const base = cadre ? Math.max(0, ligne - cadre.getBoundingClientRect().top) : ligne - haut - marge;
        t.querySelectorAll('.th-fixe').forEach(c => { c.style.top = (base + (+c.dataset.haut || 0)) + 'px'; });
      });
    }
    function tout() { document.querySelectorAll('#contenu table, .modal table').forEach(fixer); placer(); }
    let minuterie = null, image = false;
    const plusTard = () => { clearTimeout(minuterie); minuterie = setTimeout(() => { const a = document.activeElement; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest('table')) return; tout(); }, 120); };
    document.addEventListener('focusout', plusTard, true);
    document.addEventListener('scroll', () => { if (image) return; image = true; requestAnimationFrame(() => { image = false; placer(); }); }, { capture: true, passive: true });
    window.addEventListener('resize', plusTard);
    document.addEventListener('toggle', plusTard, true);
    const obs = window.ResizeObserver ? new ResizeObserver(plusTard) : null;
    document.addEventListener('DOMContentLoaded', () => {
      if (!window.MutationObserver) return;
      new MutationObserver(muts => {
        if (muts.some(m => Array.from(m.addedNodes).some(n => n.nodeType === 1 && (n.tagName === 'TABLE' || (n.querySelector && n.querySelector('table')))))) {
          if (obs) document.querySelectorAll('#contenu table').forEach(t => obs.observe(t));
          plusTard();
        }
      }).observe(document.body, { childList: true, subtree: true });
    });
    return { tout, placer };
  })();

  EG.UI = {
    el, $, dateFR, dateCourte, heure, fcfa, nombre, libelle, sansAccent,
    toast, modal, confirmer, saisieRapide, badge, statut, vide, carte, stat, barre, tableau,
    champRecherche, selecteur, formulaire, Routeur, EntetesFixes,
    titreDe(entite, r) {
      const d = EG.SCHEMA[entite];
      if (!r) return '—';
      if (d && d.titre) { try { return d.titre(r) || r.id.slice(0, 8); } catch (e) { /* champ manquant */ } }
      return r.nom || r.libelle || r.code || r.titre || (r.id || '').slice(0, 8);
    }
  };
})(window);
