/* ÉduGestion Pro Master — import et export des données.

   Trois onglets :
   - Exporter : choisir les jeux de données (écoles, personnel, contacts, calendrier…) et
     les emporter dans un classeur Excel, pour toute la zone du compte ou pour une seule
     circonscription ;
   - Importer : reprendre un tableau Excel ou CSV dans le personnel, les classes, le
     répertoire ou le calendrier, avec un modèle à remplir, un contrôle ligne à ligne et un
     aperçu avant enregistrement (les écoles et les unités pédagogiques ont leur propre écran) ;
   - Sauvegarde : une copie complète des données du compte, et sa restauration.

   Le cloisonnement par circonscription s'applique partout : on n'exporte que ce que l'on a
   le droit de voir, on n'importe que dans son périmètre, et une sauvegarde restaurée ne
   fait entrer que les données de la zone du compte — jamais celles d'une autre circonscription. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const sa = U.sansAccent;
  const S = () => EG.Sortie;
  const pl = (n, mot) => U.nombre(n) + ' ' + mot + (n > 1 ? 's' : '');
  const tri = (a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr', { numeric: true });
  const ROLES_GESTION = ['ADMIN_MEMP', 'ADMIN_TECHNIQUE', 'DDEMP', 'CS', 'DIRECTEUR'];
  const peutGerer = () => ROLES_GESTION.indexOf(EG.session.user.role) >= 0 && EG.peutEcrire();
  const estAdmin = () => ['ADMIN_MEMP', 'ADMIN_TECHNIQUE'].indexOf(EG.session.user.role) >= 0;

  /* Tables techniques : jamais exportées ni sauvegardées avec les jeux de données. */
  const SYSTEME = ['users', 'audit_events', 'educmaster_sync_queue', 'conflits_synchronisation', 'device_sync_status',
    'feature_flags', 'support_tickets', 'maintenances', 'rollover_jobs', 'signatures_documents', 'documents'];
  const ONGLETS = [['export', '\uE00C Exporter'], ['import', '\uE00B Importer'], ['jeux', '\uE011 Jeux de données'], ['personnel', '\uE01C Personnel (FE, ACDPE, ACDPCTD)'], ['sauvegarde', '\uE007 Sauvegarde et restauration']];
  const PAR_TERRITOIRE = ['contacts', 'evenements_calendrier', 'courriers', 'signatures_categories'];
  const CLES = { eleve_id: 'eleves', inscription_id: 'inscriptions', personnel_id: 'personnels', classe_id: 'classes' };

  /* ---------------- Aides ---------------- */

  const cle = t => sa(String(t === null || t === undefined ? '' : t).replace(/\(.*?\)/g, '')).replace(/[^a-z0-9]+/g, ' ').trim();

  function parseDate(v) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
    const t = String(v).trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
    if (m) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
    m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(t);
    if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
    return null;
  }

  const PIECES_JOINTES = ['fichier_donnees', 'fichier_type', 'fichier_nom'];
  /** parColonne : l'école est une colonne du fichier (au lieu d'être imposée par le choix de l'écran). */
  function champsImportables(entite, parColonne) {
    const def = EG.SCHEMA[entite];
    return def.champs.filter(c => !c.derive && ['image', 'json', 'password'].indexOf(c.t) < 0 && (c.n !== 'ecole_id' || parColonne) && !c.annee
      && PIECES_JOINTES.indexOf(c.n) < 0
      && !(PAR_TERRITOIRE.indexOf(entite) >= 0 && (c.n === 'territoire_id' || c.n === 'departement_id')));
  }

  /** Valeur lisible d'une cellule d'export. */
  function cellule(c, v, idx) {
    if (v === null || v === undefined) return '';
    if (c.t === 'bool') return v ? 'Oui' : 'Non';
    if (c.t === 'ref') return idx[c.ref] && idx[c.ref][v] ? U.titreDe(c.ref, idx[c.ref][v]) : '';
    if (c.t === 'date') return U.dateCourte(v);
    if (c.t === 'datetime') return U.heure(v);
    if (c.t === 'select') return U.libelle(v);
    if (c.t === 'json') return JSON.stringify(v);
    if (c.t === 'image') return v ? '[image]' : '';
    return v;
  }

  /** Restreint des lignes déjà cloisonnées par le compte à une seule circonscription. */
  function restreindre(entite, rows, ctx, csId, ens) {
    if (!csId) return rows;
    const def = EG.SCHEMA[entite], noms = def.champs.map(c => c.n);
    const desc = {}; ctx.terr.forEach(t => {
      let cur = t, n = 0;
      while (cur && n++ < 10) { if (cur.id === csId) { desc[t.id] = true; break; } cur = cur.parent_id ? ctx.index[cur.parent_id] : null; }
    });
    if (entite === 'ecoles') return rows.filter(e => e.territoire_id === csId);
    if (entite === 'territoires') return rows.filter(t => desc[t.id]);
    if (PAR_TERRITOIRE.indexOf(entite) >= 0) return rows.filter(r => r.territoire_id === csId);
    let out = rows;
    if (noms.indexOf('ecole_id') >= 0) out = out.filter(r => ens.ecoles[r.ecole_id]);
    Object.keys(CLES).forEach(k => { if (noms.indexOf(k) >= 0) out = out.filter(r => !r[k] || ens[CLES[k]][r[k]]); });
    if (entite === 'eleves') out = out.filter(r => ens.eleves[r.id]);
    return out;
  }

  /** Ensembles d'identifiants (élèves, agents, classes, inscriptions) des écoles d'une circonscription. */
  function ensemblesCS(ctx, csId) {
    const ecoles = {}; ctx.ecoles.filter(e => e.territoire_id === csId && ctx.idsEcoles[e.id]).forEach(e => { ecoles[e.id] = true; });
    return Promise.all([DB.all('inscriptions_eleves'), DB.all('personnels'), DB.all('classes')]).then(([ins, pers, cls]) => {
      const ens = { ecoles, eleves: {}, inscriptions: {}, personnels: {}, classes: {} };
      ins.forEach(i => { if (ecoles[i.ecole_id]) { ens.eleves[i.eleve_id] = true; ens.inscriptions[i.id] = true; } });
      pers.forEach(p => { if (ecoles[p.ecole_id]) ens.personnels[p.id] = true; });
      cls.forEach(c => { if (ecoles[c.ecole_id]) ens.classes[c.id] = true; });
      return ens;
    });
  }

  /* =======================================================================
     ÉCRAN
     ======================================================================= */

  Routeur.definir('import-export', function (racine, args, params) {
    if (!EG.peutVoirModule('import-export')) { racine.appendChild(U.vide('Ce module n’est pas disponible pour votre compte.')); return; }
    racine.appendChild(E.entete('Import et export',
      'Emporter des données dans Excel, en reprendre depuis un tableau, sauvegarder et restaurer — toujours dans le périmètre du compte.',
      params && params.retour ? [el('button', { class: 'btn btn-fantome', text: '← Retour à la rubrique', onclick: () => Routeur.aller(params.retour) })] : null));
    let actif = ONGLETS.map(o => o[0]).indexOf(args && args[0]) >= 0 ? args[0] : 'export';
    const zoneOnglets = el('div'), zoneCs = el('div'), zone = el('div');
    racine.appendChild(zoneOnglets); racine.appendChild(zoneCs); racine.appendChild(zone);
    const etat = { dep: '', cs: (params && params.cs) || '', ecole_id: '', jeu: params && params.jeu ? params.jeu.split(',').filter(Boolean) : null, type: (params && params.type) || '' };
    let C = null;
    const vivant = () => document.body.contains(racine);

    function onglets() {
      zoneOnglets.textContent = '';
      zoneOnglets.appendChild(E.barreOnglets(ONGLETS, actif, code => { actif = code; E.remplacerRoute('import-export/' + code); onglets(); dessiner(); }));
    }

    function dessiner() {
      zoneCs.textContent = ''; zone.textContent = '';
      if (!C) return;
      if (actif === 'sauvegarde') { ongletSauvegarde(zone); return; }
      if (actif === 'jeux') { EG.OngletsImport.jeux(zone, etat, C, vivant); return; }
      E.barreCS(zoneCs, etat, C, () => dessiner(), { libelleVide: actif === 'export' ? 'Tout mon périmètre' : '— Choisir une circonscription —' });
      if (actif === 'export') ongletExport(zone, etat, C, vivant);
      else if (actif === 'personnel') EG.OngletsImport.personnel(zone, etat, C, vivant);
      else ongletImport(zone, etat, C);
    }

    E.contexteCS().then(ctx => { C = ctx; if (etat.cs && !ctx.idsCS[etat.cs]) etat.cs = ''; onglets(); dessiner(); });
  });

  /* =======================================================================
     EXPORT
     ======================================================================= */

  function jeuxDeDonnees() {
    const vus = {}, groupes = [];
    EG.MODULES.forEach(m => {
      const liste = (m.entites || []).filter(e => EG.SCHEMA[e] && SYSTEME.indexOf(e) < 0 && !vus[e]);
      liste.forEach(e => { vus[e] = true; });
      if (liste.length && EG.peutVoirModule(m.code)) groupes.push({ nom: m.nom, icone: m.icone, entites: liste });
    });
    return groupes;
  }

  function ongletExport(zone, etat, C, vivant) {
    const groupes = jeuxDeDonnees();
    const coches = {};
    (etat.jeu && etat.jeu.length ? etat.jeu : ['ecoles', 'contacts', 'evenements_calendrier']).forEach(e => { coches[e] = true; });
    const compteurs = {};
    const carte = el('div', { class: 'carte' }, el('h3', { class: 'carte-titre', text: 'Données à exporter' }));
    const barre = el('div', { class: 'barre-actions' });
    const resume = el('p', { class: 'muet petit' });

    const majResume = () => {
      const n = Object.keys(coches).filter(k => coches[k]).length;
      resume.textContent = n ? pl(n, 'jeu') + ' de données sélectionné(s)' + (etat.cs ? ' — ' + C.index[etat.cs].nom : ' — tout votre périmètre') : 'Cochez au moins un jeu de données.';
    };
    const cases = {};

    groupes.forEach(g => {
      const bloc = el('div', { class: 'zone-bloc' }, el('div', { class: 'zone-tete' }, el('strong', { text: g.icone + ' ' + g.nom })));
      g.entites.forEach(e => {
        const c = el('input', { type: 'checkbox', id: 'exp_' + e });
        c.checked = !!coches[e]; cases[e] = c;
        c.addEventListener('change', () => { coches[e] = c.checked; majResume(); });
        const nb = el('span', { class: 'muet petit', text: '…' }); compteurs[e] = nb;
        bloc.appendChild(el('div', { class: 'champ champ-bool' }, [c, el('label', { for: 'exp_' + e, text: EG.SCHEMA[e].label + ' ' }), nb]));
      });
      carte.appendChild(bloc);
    });
    if (etat.jeu && etat.jeu.length) {
      carte.insertBefore(el('p', { class: 'muet petit', text: 'Les données de la rubrique d’où vous venez sont déjà cochées ; ajoutez-en d’autres si besoin.' }), carte.children[1] || null);
    }
    zone.appendChild(carte);

    barre.appendChild(el('button', { class: 'btn btn-fantome btn-petit', text: 'Tout cocher', onclick: () => { Object.keys(cases).forEach(e => { cases[e].checked = true; coches[e] = true; }); majResume(); } }));
    barre.appendChild(el('button', { class: 'btn btn-fantome btn-petit', text: 'Tout décocher', onclick: () => { Object.keys(cases).forEach(e => { cases[e].checked = false; coches[e] = false; }); majResume(); } }));
    zone.appendChild(barre); zone.appendChild(resume);
    zone.appendChild(el('div', { class: 'barre-actions' }, [
      el('button', { class: 'btn btn-primaire', text: '\uE00C Exporter en Excel', onclick: () => exporter('xlsx') }),
      el('button', { class: 'btn btn-fantome', text: '\uE00D Exporter en CSV (un seul jeu)', onclick: () => exporter('csv') })
    ]));
    majResume();

    /* Effectifs de chaque jeu, calculés en tâche de fond. */
    const ensPromesse = etat.cs ? ensemblesCS(C, etat.cs) : Promise.resolve(null);
    const lignesDe = entite => Promise.all([E.charger(entite), ensPromesse]).then(([rows, ens]) => restreindre(entite, rows, C, etat.cs, ens));
    const tous = Object.keys(cases);
    tous.reduce((p, e) => p.then(() => vivant() ? lignesDe(e).then(rows => { compteurs[e].textContent = '(' + U.nombre(rows.length) + ')'; }).catch(() => { compteurs[e].textContent = ''; }) : null), Promise.resolve());

    function feuille(entite, rows, refs) {
      const def = EG.SCHEMA[entite];
      const idx = {}; Object.keys(refs).forEach(k => { idx[k] = E.indexer(refs[k]); });
      const champs = def.champs.filter(c => c.t !== 'password');
      return { nom: def.label, lignes: [champs.map(c => c.l)].concat(rows.map(r => champs.map(c => cellule(c, r[c.n], idx)))) };
    }

    function exporter(format) {
      const choisis = Object.keys(coches).filter(k => coches[k]);
      if (!choisis.length) { U.toast('Cochez au moins un jeu de données', 'attention'); return; }
      if (format === 'csv' && choisis.length > 1) { U.toast('Le CSV ne contient qu’un jeu de données : décochez les autres', 'attention'); return; }
      U.toast('Préparation de l’export…');
      Promise.all(choisis.map(e => Promise.all([lignesDe(e), E.refsPour(e)]).then(([rows, refs]) => ({ e, rows, refs })))).then(res => {
        const total = res.reduce((s, x) => s + x.rows.length, 0);
        const portee = etat.cs ? S().slug(C.index[etat.cs].nom).slice(0, 24) : 'perimetre';
        const date = new Date().toISOString().slice(0, 10);
        if (format === 'csv') {
          const f = feuille(res[0].e, res[0].rows, res[0].refs);
          const txt = '﻿' + f.lignes.map(l => l.map(c => '"' + String(c === null || c === undefined ? '' : c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
          S().enregistrer(res[0].e + '-' + portee + '-' + date + '.csv', new Blob([txt], { type: 'text/csv;charset=utf-8' }));
        } else {
          const noms = {};
          const feuilles = res.map(x => {
            const f = feuille(x.e, x.rows, x.refs);
            let n = f.nom.slice(0, 26), k = 2; while (noms[n]) n = f.nom.slice(0, 24) + ' ' + (k++);
            noms[n] = true; f.nom = n; return f;
          });
          S().excel('export-' + portee + '-' + date, feuilles);
        }
        DB.audit('EXPORT', null, null, { jeux: choisis.join(','), lignes: total, cs: etat.cs ? C.index[etat.cs].nom : 'perimetre' });
      });
    }
  }

  /* =======================================================================
     IMPORT
     ======================================================================= */

  /* cible : « ecole » (une école imposée, ou une colonne École dans le fichier), « cs » (la circonscription),
     « aucune » (les références du fichier suffisent). special : traitement à part. */
  const IMPORTABLES = [
    { e: 'eleves', titre: 'Élèves (avec leur inscription de l’année)', cible: 'ecole', special: 'eleves' },
    { e: 'personnels', titre: 'Personnel (enseignants, directeurs…)', cible: 'ecole' },
    { e: 'classes', titre: 'Classes', cible: 'ecole' },
    { e: 'statistiques_ecoles', titre: 'Effectifs et personnel par école', cible: 'ecole', colonne: true },
    { e: 'infrastructures', titre: 'Infrastructures (locaux)', cible: 'ecole' },
    { e: 'inventaires_mobilier', titre: 'Inventaire du mobilier', cible: 'ecole' },
    { e: 'inventaires_equipements', titre: 'Équipements et matériel didactique', cible: 'ecole' },
    { e: 'contacts', titre: 'Répertoire et contacts', cible: 'cs' },
    { e: 'evenements_calendrier', titre: 'Événements du calendrier scolaire', cible: 'cs' },
    { e: 'courriers', titre: 'Archive des courriers (sans pièce jointe)', cible: 'cs' },
    { e: 'carrieres_personnel', titre: 'Carrières du personnel', cible: 'aucune' },
    { e: 'affectations_personnel', titre: 'Affectations du personnel', cible: 'aucune' },
    { e: 'annees_scolaires', titre: 'Années scolaires', cible: 'aucune' },
    { e: 'frais_scolarite', titre: 'Barème de scolarité (école privée)', cible: 'ecole' },
    { e: 'cahier_fonds', titre: 'Cahier de gestion des fonds (école privée)', cible: 'ecole' }
  ].filter(i => EG.SCHEMA[i.e]);
  const estImportable = e => IMPORTABLES.some(i => i.e === e);

  const COLONNES_ELEVE = ['nom', 'prenoms', 'sexe', 'date_naissance', 'lieu_naissance', 'npi', 'matricule_ecole', 'nom_pere', 'nom_mere'];

  /** Champs proposés à l'import d'un type de données. */
  function champsPour(item, parColonne) {
    if (item.special === 'eleves') {
      const def = EG.SCHEMA.eleves;
      const base = COLONNES_ELEVE.map(n => def.champs.filter(c => c.n === n)[0]).filter(Boolean);
      const pseudo = [{ n: '_niveau', l: 'Cours', t: 'select', o: EG.NIVEAUX, req: 1, pseudo: true }];
      if (parColonne) pseudo.push({ n: '_ecole', l: 'École', t: 'ref', ref: 'ecoles', req: 1, pseudo: true });
      return base.concat(pseudo);
    }
    return champsImportables(item.e, parColonne);
  }

  function ongletImport(zone, etat, C) {
    if (!peutGerer()) { zone.appendChild(U.vide('L’import est réservé aux comptes de gestion.')); return; }
    if (!etat.cs) {
      zone.appendChild(U.vide('Choisissez d’abord la circonscription dans laquelle importer : les données ne sont jamais copiées dans une autre.'));
      return;
    }
    const cs = C.index[etat.cs];
    zone.appendChild(el('div', { class: 'grille grille-departements' }, [
      el('button', { class: 'carte carte-lien', onclick: () => Routeur.aller('import-ecoles?cs=' + cs.id) }, [
        el('h3', { class: 'carte-titre', text: '\uE022 Les écoles' }), el('p', { class: 'muet petit', text: 'Créer d’un coup toutes les écoles de ' + cs.nom })]),
      el('button', { class: 'carte carte-lien', onclick: () => Routeur.aller('unites-pedagogiques/' + cs.id) }, [
        el('h3', { class: 'carte-titre', text: '\uE025 Les unités pédagogiques' }), el('p', { class: 'muet petit', text: 'Importer la liste depuis l’écran des unités' })]),
      el('button', { class: 'carte carte-lien', onclick: () => Routeur.aller('import-export/personnel?cs=' + cs.id) }, [
        el('h3', { class: 'carte-titre', text: '\uE01C Le personnel du ministère' }), el('p', { class: 'muet petit', text: 'Fichiers FE, ACDPE et ACDPCTD tels que remis' })])
    ]));

    let courant = IMPORTABLES.filter(i => i.e === etat.type)[0] || IMPORTABLES[0];
    const zoneChoix = el('div'), zoneCorps = el('div');
    zone.appendChild(el('h3', { class: 'carte-titre', text: 'Reprendre un tableau Excel ou CSV' }));
    zone.appendChild(zoneChoix); zone.appendChild(zoneCorps);

    zoneChoix.appendChild(el('div', { class: 'barre-filtres' }, U.selecteur('Type de données', IMPORTABLES.map(i => ({ value: i.e, label: i.titre })), courant.e,
      v => { courant = IMPORTABLES.filter(i => i.e === v)[0]; etat.type = v; formulaire(); }, { vide: false })));
    formulaire();

    function formulaire() {
      zoneCorps.textContent = '';
      const def = EG.SCHEMA[courant.e];
      const ecolesCS = C.ecoles.filter(e => e.territoire_id === cs.id && C.idsEcoles[e.id] && e.actif !== false).sort(tri);
      /* '*' : l'école est une colonne du fichier ; sinon l'identifiant de l'école choisie. */
      let ecoleId = '';
      if (courant.cible === 'ecole') {
        ecoleId = etat.ecole_id && (etat.ecole_id === '*' || ecolesCS.some(e => e.id === etat.ecole_id)) ? etat.ecole_id : (ecolesCS.length === 1 ? ecolesCS[0].id : '*');
        if (courant.colonne) ecoleId = '*';
      }
      const parColonne = ecoleId === '*';
      const champs = champsPour(courant, parColonne);
      if (courant.cible === 'ecole' && !courant.colonne) {
        zoneCorps.appendChild(el('div', { class: 'barre-filtres' }, U.selecteur('École concernée', [{ value: '*', label: 'Plusieurs écoles : colonne « École » dans le fichier' }].concat(ecolesCS.map(e => ({ value: e.id, label: e.nom }))), ecoleId,
          v => { etat.ecole_id = v; formulaire(); }, { vide: false })));
      } else if (courant.colonne) {
        zoneCorps.appendChild(el('p', { class: 'muet petit', text: 'Chaque ligne du fichier indique son école dans la colonne « École » (nom exact de l’école dans ' + cs.nom + ').' }));
      }
      const texte = el('textarea', { rows: '6', placeholder: 'Collez ici les lignes du tableau, titres de colonnes compris (séparés par une tabulation ou un point-virgule).' });
      const fichier = el('input', { type: 'file', accept: '.xlsx,.csv,.txt' });
      const message = el('p', { class: 'muet petit' });
      const apercu = el('div');
      fichier.addEventListener('change', () => {
        if (!fichier.files[0]) return;
        EG.Tableur.lire(fichier.files[0]).then(l => {
          texte.value = l.map(r => r.map(c => String(c === null || c === undefined ? '' : c).replace(/[\t;\n]/g, ' ')).join('\t')).join('\n');
          message.textContent = l.length + ' ligne(s) lues.';
        }).catch(e => { message.textContent = 'Fichier illisible : ' + e.message; });
      });

      zoneCorps.appendChild(el('div', { class: 'carte' }, [
        el('div', { class: 'barre-actions' }, el('button', { class: 'btn btn-fantome btn-petit', text: '\uE009 Télécharger le modèle Excel', onclick: () => modele(courant.e, champs, def.label) })),
        el('div', { class: 'formulaire' }, [
          el('div', { class: 'champ' }, [el('label', { text: 'Fichier Excel ou CSV' }), fichier]),
          el('div', { class: 'champ' }, [el('label', { text: 'Ou coller le tableau' }), texte])
        ]),
        el('div', { class: 'barre-actions' }, el('button', { class: 'btn btn-primaire', text: 'Contrôler avant d’importer', onclick: controler })),
        message, apercu
      ]));

      function controler() {
        apercu.textContent = '';
        if (courant.cible === 'ecole' && !ecoleId) { message.textContent = 'Choisissez l’école concernée.'; return; }
        const lignes = texte.value.split(/\r?\n/).map(l => l.split(/\t|;/).map(c => c.trim())).filter(l => l.some(Boolean));
        if (lignes.length < 2) { message.textContent = 'Collez un tableau avec sa ligne de titres et au moins une ligne de données.'; return; }
        message.textContent = 'Contrôle en cours…';
        const entiteRefs = courant.special === 'eleves' ? 'inscriptions_eleves' : courant.e;
        Promise.all([E.refsPour(entiteRefs), E.charger(courant.e)]).then(([refs, existants]) => {
          /* Une école indiquée dans le fichier ne peut être qu'une école de cette circonscription. */
          const idsCS = {}; ecolesCS.forEach(e => { idsCS[e.id] = true; });
          if (refs.ecoles) refs.ecoles = refs.ecoles.filter(e => idsCS[e.id]);
          const cible = { cs, ecoleId: parColonne ? '' : ecoleId, parColonne, index: C.index };
          const r = analyser(courant.e, champs, lignes, refs, courant.special === 'eleves' ? [] : existants, cible);
          if (courant.special === 'eleves') {
            const deja = {}; existants.forEach(x => { deja[cle([x.nom, x.prenoms, x.date_naissance].join('|'))] = true; });
            r.valides = r.valides.filter(v => { const k = cle([v.nom, v.prenoms, v.date_naissance].join('|')); if (deja[k]) { r.doublons++; return false; } deja[k] = true; return true; });
          }
          message.textContent = '';
          apercu.appendChild(el('div', { class: 'grille grille-stats' }, [
            U.stat(U.nombre(r.valides.length), 'Lignes prêtes', r.valides.length ? 'ok' : ''),
            U.stat(U.nombre(r.erreurs.length), 'Lignes refusées', r.erreurs.length ? 'attention' : ''),
            U.stat(U.nombre(r.doublons), 'Déjà présentes')
          ]));
          if (r.inconnus.length) apercu.appendChild(el('p', { class: 'muet petit', text: 'Colonnes ignorées (titre non reconnu) : ' + r.inconnus.join(', ') }));
          if (r.erreurs.length) {
            apercu.appendChild(el('div', { class: 'carte' }, [el('h4', { text: 'Lignes refusées' })].concat(r.erreurs.slice(0, 15).map(x => el('p', { class: 'petit', text: 'Ligne ' + x.ligne + ' : ' + x.msg })))
              .concat(r.erreurs.length > 15 ? [el('p', { class: 'muet petit', text: '… et ' + (r.erreurs.length - 15) + ' autre(s).' })] : [])));
          }
          if (r.valides.length) {
            const cols = champs.filter(c => c.list && !c.pseudo).slice(0, 4).concat(champs.filter(c => c.pseudo));
            const nomEcole = id => { const e = ecolesCS.filter(x => x.id === id)[0]; return e ? e.nom : '—'; };
            apercu.appendChild(U.tableau(cols.map(c => ({ titre: c.l, valeur: x => {
              const v = x[c.n];
              if (v === null || v === undefined || v === '') return '—';
              if (c.t === 'bool') return v ? 'Oui' : 'Non';
              if (c.t === 'select') return U.libelle(v);
              if (c.t === 'ref') return c.ref === 'ecoles' ? nomEcole(v) : U.titreDe(c.ref, (refs[c.ref] || []).filter(z => z.id === v)[0]);
              return String(v);
            } })), r.valides.slice(0, 8), { messageVide: '' }));
            apercu.appendChild(el('div', { class: 'barre-actions' }, el('button', {
              class: 'btn btn-primaire', text: 'Importer ' + pl(r.valides.length, 'ligne'), onclick: ev => {
                ev.currentTarget.disabled = true;
                enregistrer(r.valides).then(() => DB.audit('IMPORT', courant.e, null, { lignes: r.valides.length, cs: cs.nom }))
                  .then(() => { U.toast(pl(r.valides.length, 'ligne') + ' importée(s) dans ' + cs.nom); EG.majSynchro(); apercu.textContent = ''; texte.value = ''; message.textContent = r.valides.length + ' ligne(s) importée(s).'; })
                  .catch(e => { console.error(e); U.toast('Import interrompu : ' + e.message, 'danger'); });
              }
            })));
          }
        });
      }

      /** Enregistre les lignes contrôlées ; pour les élèves, crée aussi l'inscription de l'année. */
      function enregistrer(valides) {
        if (courant.special !== 'eleves') return DB.putBatch(courant.e, valides);
        const eleves = valides.map(v => { const o = Object.assign({}, v); delete o._niveau; delete o._ecole; return o; });
        return DB.putBatch('eleves', eleves).then(saved => {
          const auj = new Date().toISOString().slice(0, 10);
          const ins = saved.map((el_, i) => ({
            eleve_id: el_.id, ecole_id: valides[i]._ecole || ecoleId, annee_scolaire_id: EG.session.annee_id || null,
            cycle: EG.NIVEAUX_MAT.indexOf(valides[i]._niveau) >= 0 ? 'MATERNELLE' : 'PRIMAIRE', niveau: valides[i]._niveau,
            type_inscription: 'NOUVELLE', date_inscription: auj, statut: 'ACTIF', principale: true
          }));
          return DB.putBatch('inscriptions_eleves', ins);
        });
      }
    }
  }

  function modele(entite, champs, label) {
    const def = EG.SCHEMA[entite];
    const aide = [['Comment remplir ce modèle'], ['Une ligne par enregistrement, sous la ligne de titres. Ne changez pas les titres.'],
      ['Les colonnes marquées * sont obligatoires.']];
    champs.forEach(c => {
      let l = c.l + (c.req ? ' *' : '') + ' : ';
      if (c.t === 'select') l += 'une valeur parmi ' + (c.o || []).map(U.libelle).join(', ');
      else if (c.t === 'bool') l += 'Oui ou Non';
      else if (c.t === 'date') l += 'une date (jj/mm/aaaa)';
      else if (c.t === 'number' || c.t === 'money') l += 'un nombre';
      else if (c.t === 'ref') l += 'le nom exact de l’élément existant dans l’application';
      else l += 'du texte';
      aide.push([l]);
    });
    S().excel('modele-import-' + entite, [{ nom: (label || def.label).slice(0, 28), lignes: [champs.map(c => c.l + (c.req ? ' *' : ''))] }, { nom: 'Aide', lignes: aide }]);
  }

  /** Contrôle d'un tableau : titres reconnus, valeurs converties, références retrouvées, doublons écartés. */
  function analyser(entite, champs, lignes, refs, existants, cible) {
    const def = EG.SCHEMA[entite];
    const table = {};
    champs.forEach(c => { table[cle(c.l)] = c; table[cle(c.n)] = c; });
    champs.forEach(c => { if (c.n === 'personnel_ame') { table[cle('Personnel AME')] = c; table[cle('AME')] = c; } }); /* anciens modèles */
    const entete = lignes[0].map(h => table[cle(String(h).replace(/\*/g, ''))] || null);
    const inconnus = lignes[0].filter((h, i) => !entete[i] && String(h).trim());
    const recherche = {};
    champs.filter(c => c.t === 'ref').forEach(c => {
      const m = {};
      (refs[c.ref] || []).forEach(r => {
        [U.titreDe(c.ref, r), r.nom, r.code, r.code_ecole, r.matricule, r.libelle, ((r.nom || '') + ' ' + (r.prenoms || '')).trim(), ((r.prenoms || '') + ' ' + (r.nom || '')).trim()]
          .forEach(t => { if (t) m[cle(t)] = m[cle(t)] || r.id; });
      });
      recherche[c.n] = m;
    });
    const requis = champs.filter(c => c.req);
    const emprunte = r => cle(requis.map(c => r[c.n]).join('|')) + '|' + (r.ecole_id || r.territoire_id || '');
    const deja = {}; existants.forEach(r => { deja[emprunte(r)] = true; });

    const valides = [], erreurs = []; let doublons = 0;
    lignes.slice(1).forEach((l, n) => {
      const rec = {}; const errs = [];
      champs.forEach(c => { if (c.def !== undefined) rec[c.n] = c.def; });
      entete.forEach((c, i) => {
        if (!c) return;
        const brut = l[i] === undefined ? '' : String(l[i]).trim();
        if (brut === '') return;
        if (c.t === 'number' || c.t === 'money') {
          const v = Number(brut.replace(/\s/g, '').replace(',', '.'));
          if (isNaN(v)) errs.push(c.l + ' : « ' + brut + ' » n’est pas un nombre'); else rec[c.n] = v;
        } else if (c.t === 'bool') rec[c.n] = /^(oui|o|x|vrai|true|1|yes)$/.test(sa(brut));
        else if (c.t === 'date' || c.t === 'datetime') {
          const d = parseDate(brut);
          if (d === null) errs.push(c.l + ' : date illisible « ' + brut + ' »'); else rec[c.n] = d;
        } else if (c.t === 'select') {
          let t = sa(brut);
          if (c.n === 'sexe' || c.n === 'genre') t = /^(m|h|g)/.test(t) ? 'm' : /^f/.test(t) ? 'f' : t;
          const code = (c.o || []).filter(o => sa(o) === t || sa(U.libelle(o)) === t || sa(o).replace(/_/g, ' ') === t)[0];
          if (code === undefined) errs.push(c.l + ' : « ' + brut + ' » n’est pas une valeur permise'); else rec[c.n] = code;
        } else if (c.t === 'ref') {
          const id = (recherche[c.n] || {})[cle(brut)];
          if (!id) { if (c.req) errs.push(c.l + ' : « ' + brut + ' » est introuvable'); } else rec[c.n] = id;
        } else rec[c.n] = brut;
      });
      requis.forEach(c => { if ((rec[c.n] === undefined || rec[c.n] === null || rec[c.n] === '') && !errs.some(m => m.indexOf(c.l + ' :') === 0)) errs.push(c.l + ' est obligatoire'); });
      /* Rattachement imposé : l'école ou la circonscription choisie, jamais une autre. */
      if (def.champs.some(c => c.n === 'ecole_id')) {
        if (!cible.parColonne) rec.ecole_id = cible.ecoleId;
        else if (!rec.ecole_id && !errs.length) errs.push('École : nom absent ou introuvable dans ' + cible.cs.nom);
      }
      if (PAR_TERRITOIRE.indexOf(entite) >= 0) rec.territoire_id = cible.cs.id;
      if (entite === 'contacts') { const d = EG.Perimetre.ancetre(cible.index, cible.cs.id, 'DEPARTEMENT'); if (d) rec.departement_id = d.id; }
      def.champs.filter(c => c.annee).forEach(c => { rec[c.n] = EG.session.annee_id || null; });
      if (errs.length) { erreurs.push({ ligne: n + 2, msg: errs.join(' ; ') }); return; }
      const k = emprunte(rec);
      if (deja[k]) { doublons++; return; }
      deja[k] = true; valides.push(rec);
    });
    return { valides, erreurs, doublons, inconnus };
  }

  /* =======================================================================
     SAUVEGARDE ET RESTAURATION
     ======================================================================= */

  /** Copie des données du compte : tout ce qu'il a le droit de voir, hors comptes d'accès (sauf administration). */
  function creerSauvegarde() {
    return Promise.all([DB.exportAll(), E.contexteCS()]).then(([dump, ctx]) => {
      const sortie = { application: 'ÉduGestion Pro Master', format: 'sauvegarde-perimetre', version: dump.version, exporte_le: dump.exporte_le,
        perimetre: estAdmin() ? 'national' : ctx.csList.map(c => c.nom).join(', '), donnees: {} };
      const stores = Object.keys(dump.donnees).filter(s => ['outbox', 'meta'].indexOf(s) < 0 && (estAdmin() || ['users', 'audit_events'].indexOf(s) < 0));
      return stores.reduce((p, s) => p.then(() => EG.filtrerPerimetre(s, dump.donnees[s]).then(rows => { if (rows.length) sortie.donnees[s] = rows; })), Promise.resolve())
        .then(() => sortie);
    });
  }

  /** Ne garde d'un fichier de sauvegarde que ce qui relève du périmètre du compte. */
  function filtrerSauvegarde(dump) {
    return Promise.all([E.contexteCS(), DB.all('territoires'), DB.all('ecoles')]).then(([ctx, terrLocal, ecolesLocal]) => {
      const total = Object.keys(dump.donnees || {}).reduce((s, k) => s + dump.donnees[k].length, 0);
      if (estAdmin()) return { donnees: dump.donnees, acceptes: total, refuses: 0, total };
      const d = dump.donnees || {};
      const terr = {}; terrLocal.concat(d.territoires || []).forEach(t => { terr[t.id] = t; });
      const ecoles = {}; ecolesLocal.concat(d.ecoles || []).forEach(e => { ecoles[e.id] = e; });
      const P = EG.Perimetre, p = ctx.p;
      const ecoleOk = e => EG.session.ecole_id ? e.id === EG.session.ecole_id : P.dansPortee(e, p, terr);
      const csOk = id => { let cur = id ? terr[id] : null, n = 0; while (cur && n++ < 10) { if (ctx.idsCS[cur.id]) return true; cur = cur.parent_id ? terr[cur.parent_id] : null; } return false; };
      const ecolesOk = {}; Object.keys(ecoles).forEach(k => { if (ecoleOk(ecoles[k])) ecolesOk[k] = true; });
      const hors = { eleves: {}, inscriptions: {}, personnels: {}, classes: {} }, chez = {};
      (d.inscriptions_eleves || []).forEach(i => { if (ecolesOk[i.ecole_id]) chez[i.eleve_id] = true; });
      (d.inscriptions_eleves || []).forEach(i => { if (!ecolesOk[i.ecole_id]) { hors.inscriptions[i.id] = true; if (!chez[i.eleve_id]) hors.eleves[i.eleve_id] = true; } });
      (d.personnels || []).forEach(x => { if (x.ecole_id && !ecolesOk[x.ecole_id]) hors.personnels[x.id] = true; });
      (d.classes || []).forEach(x => { if (x.ecole_id && !ecolesOk[x.ecole_id]) hors.classes[x.id] = true; });
      const sortie = {}; let acceptes = 0;
      Object.keys(d).forEach(s => {
        const def = EG.SCHEMA[s];
        if (['users', 'audit_events', 'outbox', 'meta'].indexOf(s) >= 0) return;
        let rows = d[s];
        if (s === 'ecoles') rows = rows.filter(ecoleOk);
        else if (s === 'territoires') rows = rows.filter(t => ['NATIONAL', 'DEPARTEMENT', 'COMMUNE', 'ARRONDISSEMENT', 'VILLAGE_QUARTIER'].indexOf(t.type) >= 0 || csOk(t.id));
        else if (PAR_TERRITOIRE.indexOf(s) >= 0) rows = rows.filter(r => r.territoire_id && csOk(r.territoire_id));
        else if (def) {
          const noms = def.champs.map(c => c.n);
          if (noms.indexOf('ecole_id') >= 0) rows = rows.filter(r => !r.ecole_id || ecolesOk[r.ecole_id]);
          Object.keys(CLES).forEach(k => { if (noms.indexOf(k) >= 0) rows = rows.filter(r => !r[k] || !hors[CLES[k]][r[k]]); });
          if (s === 'eleves') rows = rows.filter(r => !hors.eleves[r.id]);
        }
        if (rows.length) { sortie[s] = rows; acceptes += rows.length; }
      });
      return { donnees: sortie, acceptes, refuses: total - acceptes, total };
    });
  }

  function restaurerFichier(fichier) {
    return fichier.text().then(txt => {
      let dump; try { dump = JSON.parse(txt); } catch (e) { U.toast('Fichier de sauvegarde illisible', 'danger'); return null; }
      if (!dump || typeof dump.donnees !== 'object') { U.toast('Ce fichier n’est pas une sauvegarde ÉduGestion Pro / ÉduGestion Pro Master', 'danger'); return null; }
      return filtrerSauvegarde(dump).then(f => new Promise(resolve => {
        const corps = el('div', {}, [
          el('p', { text: 'Sauvegarde du ' + U.dateCourte(dump.exporte_le) + (dump.perimetre ? ' — ' + dump.perimetre : '') + '.' }),
          el('p', {}, [el('strong', { text: U.nombre(f.acceptes) }), ' enregistrement(s) relèvent de votre périmètre et seront restaurés.']),
          f.refuses ? el('p', { class: 'muet', text: U.nombre(f.refuses) + ' autre(s), qui appartiennent à d’autres circonscriptions, seront ignorés : ils n’entrent jamais dans votre application.' }) : null
        ]);
        U.modal('Restaurer la sauvegarde', corps, fermer => [
          el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: () => { fermer(); resolve(0); } }),
          f.acceptes ? el('button', {
            class: 'btn btn-primaire', text: 'Restaurer', onclick: () => {
              fermer();
              DB.importAll({ donnees: f.donnees }).then(n => { U.toast(n + ' enregistrement(s) restauré(s)'); resolve(n); });
            }
          }) : null
        ].filter(Boolean));
      }));
    });
  }

  EG.Sauvegarde = { creer: creerSauvegarde, restaurer: restaurerFichier, filtrer: filtrerSauvegarde };

  function ongletSauvegarde(zone) {
    zone.appendChild(el('div', { class: 'carte' }, [
      el('h3', { class: 'carte-titre', text: '\uE007 Créer une sauvegarde' }),
      el('p', { class: 'muet', text: 'Un fichier unique avec toutes les données que votre compte a le droit de voir. Il peut servir à changer d’appareil ou à conserver une copie hors ligne.'
        + (estAdmin() ? '' : ' Les comptes d’accès n’y figurent jamais.') }),
      el('div', { class: 'barre-actions' }, el('button', {
        class: 'btn btn-primaire', text: 'Télécharger la sauvegarde', onclick: () => {
          creerSauvegarde().then(d => {
            const nb = Object.keys(d.donnees).reduce((s, k) => s + d.donnees[k].length, 0);
            S().enregistrer('edugestion-sauvegarde-' + new Date().toISOString().slice(0, 10) + '.json', new Blob([JSON.stringify(d)], { type: 'application/json' }));
            DB.audit('SAUVEGARDE', null, null, { enregistrements: nb });
            if (EG.SauvegardesAuto) EG.SauvegardesAuto.marquerExport();
          });
        }
      }), EG.SauvegardesAuto ? el('button', { class: 'btn', 'data-sauvegarde': 'copies', text: '\uE007 Copies automatiques et restauration', onclick: () => EG.SauvegardesAuto.fenetre() }) : null,
        EG.Synchronisation ? el('button', { class: 'btn', 'data-sync': 'ouvrir', text: '\uE058 Synchronisation entre niveaux', onclick: () => { location.hash = '#/synchronisation'; } }) : null)
    ]));
    if (!peutGerer()) return;
    const fichier = el('input', { type: 'file', accept: '.json' });
    fichier.addEventListener('change', () => { if (fichier.files[0]) restaurerFichier(fichier.files[0]).then(n => { if (n) setTimeout(() => location.reload(), 900); }); });
    zone.appendChild(el('div', { class: 'carte' }, [
      el('h3', { class: 'carte-titre', text: '\uE058 Restaurer une sauvegarde' }),
      el('p', { class: 'muet', text: 'Seules les données de votre périmètre sont reprises : une sauvegarde d’une autre circonscription ne peut pas y déverser ses données.' }),
      fichier
    ]));
  }
})(window);
