/* ÉduGestion Pro Master — unités pédagogiques par circonscription, espace de la
   circonscription, et cloisonnement des données par circonscription.

   Chaque circonscription scolaire (CS) a ses propres unités pédagogiques (UP),
   son répertoire et son calendrier. Rien de ce qui est saisi ou importé pour une
   circonscription — Pobè comme les autres — n'est jamais copié dans une autre :
   chaque enregistrement porte l'identifiant de sa CS, et chaque écran ne montre
   que les circonscriptions du compte connecté. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const indexer = E.indexer, entete = E.entete;
  const S = () => EG.Sortie;
  const sa = U.sansAccent;
  const tri = (a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr', { numeric: true });
  const pl = (n, mot) => U.nombre(n) + ' ' + mot + (n > 1 ? 's' : '');

  const ROLES_GESTION = ['ADMIN_MEMP', 'ADMIN_TECHNIQUE', 'DDEMP', 'CS'];
  const peutGerer = () => ROLES_GESTION.indexOf(EG.session.user.role) >= 0 && EG.peutEcrire();

  /* =======================================================================
     Périmètre : quelles circonscriptions, quelles écoles pour ce compte
     ======================================================================= */

  /**
   * { terr, index, ecoles, p, csList, ecolesPerimetre, idsEcoles, terrVisibles }
   * - csList : les circonscriptions que le compte a le droit de voir ;
   * - terrVisibles : identifiants des territoires visibles (le territoire du compte,
   *   tout ce qu'il contient, et ses parents jusqu'au pays) ;
   * - idsCS : identifiants des circonscriptions visibles.
   */
  let cacheCtx = null;
  function contexte() {
    const cle = DB.generation + '|' + (EG.session.user ? EG.session.user.id : '') + '|' + (EG.session.ecole_id || '');
    if (cacheCtx && cacheCtx.cle === cle) return cacheCtx.promesse.then(c => Object.assign({}, c));
    const promesse = calculerContexte();
    cacheCtx = { cle, promesse };
    return promesse.then(c => Object.assign({}, c));
  }
  function calculerContexte() {
    return Promise.all([DB.all('territoires'), DB.all('ecoles')]).then(([terr, ecoles]) => {
      const index = indexer(terr), user = EG.session.user, P = EG.Perimetre;
      let p, csList, ecolesPerimetre;
      if (EG.session.ecole_id) {
        const ec = ecoles.filter(e => e.id === EG.session.ecole_id)[0];
        const cs = ec && ec.territoire_id ? index[ec.territoire_id] : null;
        csList = cs ? [cs] : [];
        p = { dep: null, cs: cs ? cs.id : null, zone: null, bloque: !cs, libelle: cs ? cs.nom : '' };
        ecolesPerimetre = ec ? [ec] : [];
      } else {
        p = P.portee(user, index);
        ecolesPerimetre = ecoles.filter(e => P.dansPortee(e, p, index));
        csList = p.bloque ? [] : terr.filter(t => t.type === 'CIRCONSCRIPTION').filter(c => {
          if (p.cs) return c.id === p.cs;
          if (p.dep) return (P.ancetre(index, c.id, 'DEPARTEMENT') || {}).id === p.dep;
          return true;
        });
      }
      csList = csList.slice().sort(tri);
      const idsCS = {}; csList.forEach(c => { idsCS[c.id] = true; });
      const idsEcoles = {}; ecolesPerimetre.forEach(e => { idsEcoles[e.id] = true; });

      /* Territoires visibles : les circonscriptions du compte, leurs descendants et leurs ancêtres. */
      const terrVisibles = {};
      const racines = user.role === 'ADMIN_MEMP' || user.role === 'ADMIN_TECHNIQUE' ? null : csList;
      if (racines === null) terr.forEach(t => { terrVisibles[t.id] = true; });
      else {
        racines.forEach(c => {
          let cur = c, n = 0;
          while (cur && n++ < 10) { terrVisibles[cur.id] = true; cur = cur.parent_id ? index[cur.parent_id] : null; }
        });
        terr.forEach(t => {
          let cur = t, n = 0;
          while (cur && n++ < 10) { if (idsCS[cur.id]) { terrVisibles[t.id] = true; break; } cur = cur.parent_id ? index[cur.parent_id] : null; }
        });
        /* Les zones et unités d'une circonscription sont rattachées à elle : déjà comptées ci-dessus. */
      }
      return { terr, index, ecoles, p, csList, idsCS, ecolesPerimetre, idsEcoles, terrVisibles, complet: racines === null };
    });
  }

  const ANCETRE = (index, id, type) => EG.Perimetre.ancetre(index, id, type);

  /**
   * Cloisonnement par circonscription des tables qui portent une école ou un
   * territoire : un compte de circonscription ne voit que ses écoles, ses unités,
   * ses contacts et ses événements. Rend une promesse de lignes filtrées.
   */
  const PAR_TERRITOIRE = ['contacts', 'evenements_calendrier', 'courriers', 'signatures_categories', 'divisions_structure', 'lignes_action'];
  const GEOGRAPHIE = ['NATIONAL', 'DEPARTEMENT', 'COMMUNE', 'ARRONDISSEMENT', 'VILLAGE_QUARTIER'];
  /* Ce qui appartient à d'autres écoles que celles du compte : élèves, inscriptions, agents, classes.
     On n'exclut que ce dont on sait qu'il est ailleurs, pour ne jamais masquer une saisie toute récente. */
  const CLES_ETRANGERES = { eleve_id: 'eleves', inscription_id: 'inscriptions', personnel_id: 'personnels', classe_id: 'classes' };
  const memoHors = { cle: null, promesse: null };
  function ailleurs(ctx) {
    const cle = DB.generation + '|' + Object.keys(ctx.idsEcoles).length + '|' + (EG.session.user ? EG.session.user.id : '');
    if (memoHors.cle === cle) return memoHors.promesse;
    memoHors.cle = cle;
    memoHors.promesse = Promise.all([DB.all('inscriptions_eleves'), DB.all('personnels'), DB.all('classes')]).then(([ins, pers, cls]) => {
      const H = { eleves: {}, inscriptions: {}, personnels: {}, classes: {} };
      const chez = {}; /* élèves inscrits dans le périmètre */
      ins.forEach(i => { if (ctx.idsEcoles[i.ecole_id]) chez[i.eleve_id] = true; });
      ins.forEach(i => {
        if (ctx.idsEcoles[i.ecole_id]) return;
        H.inscriptions[i.id] = true;
        if (!chez[i.eleve_id]) H.eleves[i.eleve_id] = true;
      });
      pers.forEach(p => { if (p.ecole_id && !ctx.idsEcoles[p.ecole_id]) H.personnels[p.id] = true; });
      cls.forEach(c => { if (c.ecole_id && !ctx.idsEcoles[c.ecole_id]) H.classes[c.id] = true; });
      return H;
    });
    return memoHors.promesse;
  }

  EG.filtrerPerimetre = function (entite, rows) {
    const role = EG.session && EG.session.user ? EG.session.user.role : null;
    if (!role || role === 'ADMIN_MEMP' || role === 'ADMIN_TECHNIQUE') return Promise.resolve(rows);
    const def = EG.SCHEMA[entite];
    if (!def) return Promise.resolve(rows);
    const noms = def.champs.map(c => c.n);
    const aEcole = noms.indexOf('ecole_id') >= 0;
    const cles = Object.keys(CLES_ETRANGERES).filter(k => noms.indexOf(k) >= 0);
    const suiviEleve = entite === 'eleves';
    if (!aEcole && entite !== 'ecoles' && entite !== 'territoires' && PAR_TERRITOIRE.indexOf(entite) < 0 && !cles.length && !suiviEleve) return Promise.resolve(rows);
    return contexte().then(ctx => {
      if (entite === 'ecoles') return rows.filter(e => ctx.idsEcoles[e.id]);
      /* La géographie (départements, communes, arrondissements, villages) est commune à tous ;
         les circonscriptions, zones et unités pédagogiques, elles, restent celles du compte. */
      if (entite === 'territoires') return rows.filter(t => GEOGRAPHIE.indexOf(t.type) >= 0 || ctx.terrVisibles[t.id]);
      if (PAR_TERRITOIRE.indexOf(entite) >= 0) return rows.filter(r => r.territoire_id ? ctx.terrVisibles[r.territoire_id] : role === 'DDEMP');
      const parEcole = aEcole ? rows.filter(r => !r.ecole_id || ctx.idsEcoles[r.ecole_id]) : rows;
      if (!cles.length && !suiviEleve) return parEcole;
      return ailleurs(ctx).then(H => parEcole.filter(r => (!suiviEleve || !H.eleves[r.id])
        && cles.every(k => !r[k] || !H[CLES_ETRANGERES[k]][r[k]])));
    });
  };

  /* =======================================================================
     Choix de la circonscription (commun aux écrans de ce fichier)
     ======================================================================= */

  /** Barre « département › circonscription » ; rend rien si une seule circonscription est permise. */
  function barreCS(zone, etat, ctx, changer, opts) {
    opts = opts || {};
    E.dernierEtat = etat; /* lu par la barre Import / Export de la rubrique */
    zone.textContent = '';
    if (!ctx.csList.length) {
      zone.appendChild(U.vide(ctx.p.bloque
        ? 'Aucun territoire n’est rattaché à votre compte : demandez à l’administration de renseigner votre circonscription.'
        : 'Aucune circonscription dans votre périmètre.'));
      return;
    }
    const depDe = c => (ANCETRE(ctx.index, c.id, 'DEPARTEMENT') || {}).id || '';
    if (ctx.csList.length === 1) {
      etat.cs = ctx.csList[0].id;
      zone.appendChild(el('div', { class: 'barre-filtres' }, el('span', { class: 'badge info', text: 'Circonscription : ' + ctx.csList[0].nom })));
      return;
    }
    const barre = el('div', { class: 'barre-filtres' });
    const deps = {};
    ctx.csList.forEach(c => { const d = depDe(c); if (d && ctx.index[d]) deps[d] = ctx.index[d]; });
    const listeDeps = Object.keys(deps).map(k => deps[k]).sort(tri);
    if (etat.cs && !etat.dep) etat.dep = depDe(ctx.index[etat.cs] || {}) || '';
    if (listeDeps.length > 1) {
      barre.appendChild(U.selecteur('Département', listeDeps.map(d => ({ value: d.id, label: d.nom })), etat.dep || '',
        v => { etat.dep = v; etat.cs = ''; changer(true); }, { libelleVide: 'Tous les départements' }));
    }
    const dans = ctx.csList.filter(c => !etat.dep || depDe(c) === etat.dep);
    if (etat.cs && !dans.some(c => c.id === etat.cs)) etat.cs = '';
    barre.appendChild(U.selecteur('Circonscription scolaire', dans.map(c => ({ value: c.id, label: c.nom })), etat.cs || '',
      v => { etat.cs = v; changer(true); }, { libelleVide: opts.libelleVide || '— Choisir une circonscription —' }));
    zone.appendChild(barre);
  }

  const numeroCS = cs => { const m = /(\d+)\s*$/.exec((cs && cs.code) || ''); return m ? m[1] : null; };
  const zonesDe = (ctx, csId) => ctx.terr.filter(t => t.type === 'ZONE_PEDAGOGIQUE' && t.parent_id === csId).sort(tri);
  const upsDe = (ctx, csId) => {
    const zones = {}; zonesDe(ctx, csId).forEach(z => { zones[z.id] = true; });
    return ctx.terr.filter(t => t.type === 'UNITE_PEDAGOGIQUE' && (t.parent_id === csId || zones[t.parent_id])).sort(tri);
  };

  E.barreCS = barreCS;
  E.contexteCS = contexte;

  /* =======================================================================
     UNITÉS PÉDAGOGIQUES
     ======================================================================= */

  Routeur.definir('unites-pedagogiques', function (racine, args) {
    if (!EG.peutVoirModule('unites-pedagogiques')) { racine.appendChild(U.vide('Cet espace est réservé aux comptes de circonscription et de direction départementale.')); return; }
    const gerer = peutGerer();
    racine.appendChild(entete('Unités pédagogiques',
      'La liste des unités pédagogiques de chaque circonscription. C’est dans cette liste que chaque école choisit la sienne.'));
    const zoneCs = el('div'), zoneCorps = el('div');
    racine.appendChild(zoneCs); racine.appendChild(zoneCorps);
    const etat = { dep: '', cs: (args && args[0]) || '' };
    let C = null;

    function charger() {
      return contexte().then(ctx => {
        C = ctx;
        if (etat.cs && !ctx.idsCS[etat.cs]) etat.cs = '';
        barreCS(zoneCs, etat, ctx, () => { dessiner(); });
        dessiner();
      });
    }

    function dessiner() {
      zoneCorps.textContent = '';
      if (!C || !C.csList.length) return;
      if (!etat.cs) {
        zoneCorps.appendChild(U.vide('Choisissez une circonscription pour afficher ses unités pédagogiques.'));
        return;
      }
      const cs = C.index[etat.cs];
      const zones = zonesDe(C, cs.id);
      const ups = upsDe(C, cs.id);
      const ecoles = C.ecoles.filter(e => e.territoire_id === cs.id && (C.idsEcoles[e.id]));
      const parUp = {}; ecoles.forEach(e => { if (e.up_id) (parUp[e.up_id] = parUp[e.up_id] || []).push(e); });
      const sansUp = ecoles.filter(e => !e.up_id || !ups.some(u => u.id === e.up_id));

      zoneCorps.appendChild(el('div', { class: 'grille grille-stats' }, [
        U.stat(U.nombre(ups.length), ups.length > 1 ? 'Unités pédagogiques' : 'Unité pédagogique'),
        U.stat(U.nombre(zones.length), zones.length > 1 ? 'Zones pédagogiques' : 'Zone pédagogique'),
        U.stat(U.nombre(ecoles.length), ecoles.length > 1 ? 'Écoles' : 'École'),
        U.stat(U.nombre(sansUp.length), 'Écoles sans unité', sansUp.length && ups.length ? 'attention' : '')
      ]));

      const actions = [];
      if (gerer) {
        actions.push(el('button', { class: 'btn btn-primaire', text: '＋ Unité pédagogique', onclick: () => formulaireUP(cs, null) }));
        actions.push(el('button', { class: 'btn btn-fantome', text: '\uE00B Importer une liste', onclick: () => importerListe(cs) }));
      }
      actions.push(el('button', {
        class: 'btn btn-fantome', text: '\uE00C Exporter (Excel)',
        onclick: () => S().excel('unites-pedagogiques-' + S().slug(cs.nom).slice(0, 30), [{
          nom: 'Unités pédagogiques',
          lignes: [['Circonscription', 'Zone pédagogique', 'Unité pédagogique', 'Code', 'Responsable', 'Téléphone', 'Nombre d’écoles', 'Écoles']]
            .concat(ups.map(u => [cs.nom, (C.index[u.parent_id] && C.index[u.parent_id].type === 'ZONE_PEDAGOGIQUE') ? C.index[u.parent_id].nom : '',
              u.nom, u.code || '', u.responsable || '', u.responsable_telephone || '',
              (parUp[u.id] || []).length, (parUp[u.id] || []).map(e => e.nom).sort().join(', ')]))
        }])
      }));
      zoneCorps.appendChild(el('div', { class: 'barre-actions' }, actions));

      if (!ups.length) {
        zoneCorps.appendChild(U.vide('Aucune unité pédagogique dans ' + cs.nom + ' pour l’instant. '
          + (gerer ? 'Ajoutez-les une à une ou importez la liste : les écoles pourront alors choisir la leur.' : '')));
        return;
      }

      /* Une carte par zone, puis les unités rattachées directement à la circonscription. */
      const groupes = zones.map(z => ({ titre: z.nom, ups: ups.filter(u => u.parent_id === z.id) }))
        .filter(g => g.ups.length);
      const directes = ups.filter(u => u.parent_id === cs.id);
      if (directes.length) groupes.push({ titre: 'Sans zone pédagogique', ups: directes });
      groupes.forEach(g => {
        const bloc = el('div', { class: 'zone-bloc' }, el('div', { class: 'zone-tete' }, el('div', {}, [
          el('strong', { text: g.titre }), ' ', U.badge(pl(g.ups.length, 'unité'), 'ok')
        ])));
        g.ups.forEach(u => bloc.appendChild(ligneUP(cs, u, parUp[u.id] || [])));
        zoneCorps.appendChild(el('div', { class: 'carte' }, bloc));
      });

      if (sansUp.length) {
        const bloc = el('div', { class: 'zone-bloc sans-zone' }, [
          el('div', { class: 'zone-tete' }, el('div', {}, [
            el('strong', { text: 'Écoles sans unité pédagogique' }), ' ', U.badge(pl(sansUp.length, 'école'), 'attention'),
            el('div', { class: 'muet petit', text: 'Rattachez-les à leur unité avec « Écoles » ci-dessus, ou ouvrez la fiche de l’école.' })
          ])),
          el('p', { class: 'petit', text: sansUp.slice().sort(tri).map(e => e.nom).join(' · ') })
        ]);
        zoneCorps.appendChild(el('div', { class: 'carte' }, bloc));
      }
    }

    function ligneUP(cs, u, ecolesUp) {
      const zone = C.index[u.parent_id] && C.index[u.parent_id].type === 'ZONE_PEDAGOGIQUE' ? C.index[u.parent_id] : null;
      const infos = [u.code, zone ? zone.nom.replace(/^.*—\s*/, '') : null,
        u.responsable ? 'Responsable : ' + u.responsable + (u.responsable_telephone ? ' · ' + u.responsable_telephone : '') : null].filter(Boolean).join(' · ');
      return el('div', { class: 'ecole-ligne' }, [
        el('div', { class: 'ecole-info' }, [
          el('strong', { text: u.nom }), ' ', U.badge(pl(ecolesUp.length, 'école'), ecolesUp.length ? 'ok' : 'neutre'),
          infos ? el('div', { class: 'muet petit', text: infos }) : null,
          ecolesUp.length ? el('div', { class: 'muet petit', text: ecolesUp.slice().sort(tri).map(e => e.nom).join(' · ') }) : null
        ]),
        gerer ? el('div', { class: 'actions-mini' }, [
          el('button', { class: 'btn btn-fantome btn-petit', text: 'Écoles', onclick: () => choisirEcoles(cs, u) }),
          el('button', { class: 'btn btn-fantome btn-petit', text: 'Modifier', onclick: () => formulaireUP(cs, u) }),
          el('button', { class: 'btn btn-fantome btn-petit btn-alerte', text: 'Supprimer', onclick: () => supprimerUP(cs, u, ecolesUp) })
        ]) : null
      ]);
    }

    /* ---------- ajout et modification ---------- */

    function prochainCode(cs) {
      const n = numeroCS(cs);
      if (!n) return null;
      let max = 0;
      upsDe(C, cs.id).forEach(u => { const m = /-(\d+)$/.exec(u.code || ''); if (m) max = Math.max(max, Number(m[1])); });
      return 'UP-' + n + '-' + (max + 1);
    }

    function formulaireUP(cs, rec) {
      const zones = zonesDe(C, cs.id);
      const nom = el('input', { type: 'text', value: rec ? rec.nom : '', placeholder: 'Ex. UP de Igana' });
      const zone = el('select', {}, [el('option', { value: '', text: '— Aucune zone —' })].concat(zones.map(z => {
        const o = el('option', { value: z.id, text: z.nom }); if (rec && rec.parent_id === z.id) o.selected = true; return o;
      })));
      const resp = el('input', { type: 'text', value: rec ? rec.responsable || '' : '', placeholder: 'Responsable de l’unité pédagogique (RUP)' });
      const tel = el('input', { type: 'text', value: rec ? rec.responsable_telephone || '' : '' });
      const erreur = el('div', { class: 'erreurs' });
      U.modal(rec ? 'Modifier l’unité pédagogique' : 'Ajouter une unité pédagogique à ' + cs.nom, el('div', { class: 'formulaire' }, [
        erreur,
        el('div', { class: 'champ' }, [el('label', { text: 'Nom de l’unité pédagogique' }), nom]),
        el('div', { class: 'champ' }, [el('label', { text: 'Zone pédagogique' }), zone,
          el('span', { class: 'muet petit', text: 'Facultatif : une unité peut aussi dépendre directement de la circonscription.' })]),
        el('div', { class: 'champ' }, [el('label', { text: 'Responsable' }), resp]),
        el('div', { class: 'champ' }, [el('label', { text: 'Téléphone du responsable' }), tel])
      ]), fermer => [
        el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
        el('button', {
          class: 'btn btn-primaire', text: 'Enregistrer', onclick: () => {
            const n = nom.value.trim();
            if (!n) { erreur.textContent = 'Le nom est obligatoire.'; return; }
            if (upsDe(C, cs.id).some(u => (!rec || u.id !== rec.id) && sa(u.nom) === sa(n))) {
              erreur.textContent = 'Cette circonscription a déjà une unité pédagogique de ce nom.'; return;
            }
            const valeurs = Object.assign({ type: 'UNITE_PEDAGOGIQUE', actif: true }, rec || {}, {
              nom: n, parent_id: zone.value || cs.id, responsable: resp.value.trim(), responsable_telephone: tel.value.trim()
            });
            if (!rec) valeurs.code = prochainCode(cs);
            fermer();
            DB.put('territoires', valeurs)
              .then(r => DB.audit(rec ? 'MODIFICATION' : 'CREATION', 'territoires', r.id, { type: 'UNITE_PEDAGOGIQUE', cs: cs.nom }))
              /* Une unité déplacée dans une autre zone entraîne ses écoles : la zone d'une école suit son unité. */
              .then(r => (rec && zone.value && rec.parent_id !== zone.value)
                ? Promise.all(C.ecoles.filter(e => e.up_id === r.id).map(e => DB.put('ecoles', Object.assign({}, e, { zone_id: zone.value })))) : null)
              .then(() => { U.toast(rec ? 'Unité modifiée' : 'Unité « ' + n + ' » ajoutée'); EG.majSynchro(); charger(); });
          }
        })
      ]);
    }

    function supprimerUP(cs, u, ecolesUp) {
      const msg = ecolesUp.length
        ? 'Supprimer l’unité « ' + u.nom + ' » ? Ses ' + ecolesUp.length + ' école(s) ne seront pas supprimées : elles resteront sans unité pédagogique.'
        : 'Supprimer l’unité « ' + u.nom + ' » ? Aucune école n’y est rattachée.';
      U.confirmer('Supprimer cette unité', msg, () => {
        DB.dependances('territoires', u.id).then(deps => {
          const autres = deps.filter(d => !(d.table === 'ecoles' && d.champ === 'up_id'));
          if (autres.length) {
            U.modal('Suppression impossible', el('div', {}, [
              el('p', { text: 'Cette unité est encore utilisée :' }),
              el('ul', {}, autres.map(d => el('li', { text: U.nombre(d.nombre) + ' — ' + (EG.SCHEMA[d.table] ? EG.SCHEMA[d.table].label : d.table) })))
            ]), fermer => [el('button', { class: 'btn btn-primaire', text: 'Compris', onclick: fermer })]);
            return;
          }
          Promise.all(ecolesUp.map(e => DB.put('ecoles', Object.assign({}, e, { up_id: null }))))
            .then(() => DB.remove('territoires', u.id))
            .then(() => DB.audit('SUPPRESSION', 'territoires', u.id, { nom: u.nom, type: 'UNITE_PEDAGOGIQUE', cs: cs.nom }))
            .then(() => { U.toast('Unité supprimée'); EG.majSynchro(); charger(); });
        });
      }, 'Supprimer');
    }

    /* ---------- rattacher des écoles à une unité ---------- */

    function choisirEcoles(cs, u) {
      const candidates = C.ecoles.filter(e => e.territoire_id === cs.id && C.idsEcoles[e.id] && e.actif !== false).sort(tri);
      if (!candidates.length) { U.toast('Aucune école dans cette circonscription', 'attention'); return; }
      const cases = {};
      const zoneUp = C.index[u.parent_id] && C.index[u.parent_id].type === 'ZONE_PEDAGOGIQUE' ? C.index[u.parent_id] : null;
      const liste = el('div', { class: 'liste-cases' }, candidates.map(e => {
        const c = el('input', { type: 'checkbox', id: 'upe_' + e.id }); c.checked = e.up_id === u.id; cases[e.id] = c;
        const ailleurs = e.up_id && e.up_id !== u.id && C.index[e.up_id] ? ' (actuellement : ' + C.index[e.up_id].nom + ')' : '';
        return el('div', { class: 'champ champ-bool' }, [c, el('label', { for: 'upe_' + e.id, text: e.nom + ailleurs })]);
      }));
      U.modal('Écoles de « ' + u.nom + ' »', el('div', {}, [
        el('p', { class: 'muet petit', text: 'Cochez les écoles de cette unité.' + (zoneUp ? ' Leur zone pédagogique sera alignée sur « ' + zoneUp.nom + ' ».' : '') }),
        liste
      ]), fermer => [
        el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
        el('button', {
          class: 'btn btn-primaire', text: 'Enregistrer', onclick: () => {
            const maj = [];
            candidates.forEach(e => {
              const veut = cases[e.id].checked;
              if (veut && e.up_id !== u.id) maj.push(Object.assign({}, e, { up_id: u.id, zone_id: zoneUp ? zoneUp.id : e.zone_id }));
              else if (!veut && e.up_id === u.id) maj.push(Object.assign({}, e, { up_id: null }));
            });
            fermer();
            if (!maj.length) return;
            DB.putBatch('ecoles', maj)
              .then(() => DB.audit('UP_ECOLES', 'territoires', u.id, { ecoles: maj.length }))
              .then(() => { U.toast(pl(maj.length, 'école') + ' mise(s) à jour'); EG.majSynchro(); charger(); });
          }
        })
      ]);
    }

    /* ---------- import d'une liste ---------- */

    function trouverZone(cs, texte) {
      const t = sa(texte).trim(); if (!t) return null;
      const zones = zonesDe(C, cs.id);
      let z = zones.filter(x => sa(x.nom) === t || sa(x.code) === t)[0];
      if (z) return z;
      const num = /(?:^|zone|zp|z)\s*0*(\d+)\s*[a-z]?$/.exec(t);
      if (num) z = zones.filter(x => new RegExp('zone\\s*0*' + num[1] + '$').test(sa(x.nom)))[0];
      return z || zones.filter(x => sa(x.nom).indexOf(t) >= 0)[0] || null;
    }

    function importerListe(cs) {
      const zoneTexte = el('textarea', {
        rows: '8', placeholder: 'Une unité pédagogique par ligne.\nVous pouvez ajouter, séparés par une tabulation ou un point-virgule : la zone, le responsable, son téléphone.'
      });
      const fichier = el('input', { type: 'file', accept: '.xlsx,.csv,.txt' });
      const message = el('p', { class: 'muet petit' });
      const NOMS_TITRE = /^(nom( de l ?)?(unite pedagogique|up)?|unites? pedagogiques?|up|designation)$/;
      fichier.addEventListener('change', () => {
        if (!fichier.files[0]) return;
        EG.Tableur.lire(fichier.files[0]).then(lignes => {
          zoneTexte.value = lignes.map(l => l.map(c => String(c === null || c === undefined ? '' : c).replace(/[\t;\n]/g, ' ')).join('\t')).join('\n');
          message.textContent = lignes.length + ' ligne(s) lues : vérifiez puis importez.';
        }).catch(e => { message.textContent = 'Fichier illisible : ' + e.message; });
      });
      U.modal('Importer les unités pédagogiques de ' + cs.nom, el('div', { class: 'formulaire' }, [
        el('div', { class: 'champ' }, [el('label', { text: 'Fichier Excel ou CSV' }), fichier]),
        el('div', { class: 'champ' }, [el('label', { text: 'Ou coller la liste' }), zoneTexte]),
        message,
        el('p', { class: 'muet petit', text: 'Les noms déjà présents dans cette circonscription sont ignorés. Rien n’est copié dans une autre circonscription.' })
      ]), fermer => [
        el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
        el('button', {
          class: 'btn btn-primaire', text: 'Importer', onclick: () => {
            const lignes = zoneTexte.value.split(/\r?\n/).map(l => l.split(/\t|;/).map(c => c.trim())).filter(l => l[0]);
            if (lignes.length && NOMS_TITRE.test(sa(lignes[0][0]).trim())) lignes.shift();
            if (!lignes.length) { message.textContent = 'La liste est vide.'; return; }
            const existants = {}; upsDe(C, cs.id).forEach(x => { existants[sa(x.nom)] = true; });
            const nouveaux = [], vus = {}; let ignorees = 0;
            lignes.forEach(l => {
              const cle = sa(l[0]);
              if (existants[cle] || vus[cle]) { ignorees++; return; }
              vus[cle] = true;
              const z = trouverZone(cs, l[1] || '');
              nouveaux.push({ type: 'UNITE_PEDAGOGIQUE', nom: l[0], parent_id: z ? z.id : cs.id,
                responsable: l[2] || '', responsable_telephone: l[3] || '', actif: true });
            });
            const n = numeroCS(cs);
            let max = 0;
            upsDe(C, cs.id).forEach(x => { const m = /-(\d+)$/.exec(x.code || ''); if (m) max = Math.max(max, Number(m[1])); });
            nouveaux.forEach(x => { if (n) x.code = 'UP-' + n + '-' + (++max); });
            fermer();
            if (!nouveaux.length) { U.toast('Rien de nouveau : ' + ignorees + ' nom(s) déjà présent(s)', 'attention'); return; }
            DB.putBatch('territoires', nouveaux)
              .then(() => DB.audit('IMPORT_UP', 'territoires', null, { cs: cs.nom, unites: nouveaux.length }))
              .then(() => {
                U.toast(pl(nouveaux.length, 'unité') + ' ajoutée(s)' + (ignorees ? ', ' + ignorees + ' déjà présente(s)' : ''));
                EG.majSynchro(); charger();
              });
          }
        })
      ]);
    }

    charger();
  });

  /* =======================================================================
     ESPACE DE LA CIRCONSCRIPTION
     ======================================================================= */

  Routeur.definir('espace-cs', function (racine, args) {
    if (!EG.peutVoirModule('espace-cs')) { racine.appendChild(U.vide('Cet espace est réservé aux comptes de circonscription et de direction départementale.')); return; }
    racine.appendChild(entete('Espace de la circonscription',
      'Tous les outils d’une circonscription au même endroit : écoles, unités pédagogiques, répertoire, calendrier, comptes, exports.'));
    const zoneCs = el('div'), zoneCorps = el('div');
    racine.appendChild(zoneCs); racine.appendChild(zoneCorps);
    const etat = { dep: '', cs: (args && args[0]) || '' };
    let C = null;

    function charger() {
      return Promise.all([contexte(), DB.all('contacts'), DB.all('evenements_calendrier')]).then(([ctx, contacts, evenements]) => {
        C = ctx; C.contacts = contacts; C.evenements = evenements;
        if (etat.cs && !ctx.idsCS[etat.cs]) etat.cs = '';
        barreCS(zoneCs, etat, ctx, () => dessiner());
        dessiner();
      });
    }

    function dessiner() {
      zoneCorps.textContent = '';
      if (!C || !C.csList.length) return;
      if (!etat.cs) { zoneCorps.appendChild(U.vide('Choisissez une circonscription pour ouvrir son espace.')); return; }
      const cs = C.index[etat.cs];
      const ecoles = C.ecoles.filter(e => e.territoire_id === cs.id && C.idsEcoles[e.id]);
      const zones = zonesDe(C, cs.id), ups = upsDe(C, cs.id);
      const contacts = C.contacts.filter(c => c.territoire_id === cs.id && c.actif !== false);
      const aujourdhui = new Date().toISOString().slice(0, 10);
      const evenements = C.evenements.filter(e => e.territoire_id === cs.id && (e.date_fin || e.date_debut) >= aujourdhui);
      const dep = ANCETRE(C.index, cs.id, 'DEPARTEMENT');

      zoneCorps.appendChild(U.carte(cs.nom, el('div', {}, [
        el('p', { class: 'muet', text: [dep ? dep.nom : null, cs.code, cs.responsable ? 'Chef de circonscription : ' + cs.responsable
          + (cs.responsable_telephone ? ' · ' + cs.responsable_telephone : '') : null].filter(Boolean).join(' · ') }),
        cs.arrondissements_couverts ? el('p', { class: 'muet petit', text: 'Arrondissements couverts : ' + cs.arrondissements_couverts }) : null
      ])));

      const tuiles = [
        { m: 'reseau', i: '\uE022', t: 'Écoles', d: pl(ecoles.length, 'école') + ' · ' + pl(zones.length, 'zone'), r: 'gestion-ecoles?cs=' + cs.id },
        { m: 'unites-pedagogiques', i: '\uE025', t: 'Unités pédagogiques', d: pl(ups.length, 'unité'), r: 'unites-pedagogiques/' + cs.id },
        { m: 'stats-cs', i: '\uE016', t: 'Effectifs et personnel', d: 'Classes, personnel FE / ACDPE / ACDPCTD, élèves par cours', r: 'stats-cs/' + cs.id },
        { m: 'repertoire', i: '\uE012', t: 'Répertoire et contacts', d: pl(contacts.length, 'contact') + ' + directeurs des écoles', r: 'repertoire/' + cs.id },
        { m: 'calendrier-scolaire', i: '\uE017', t: 'Calendrier scolaire', d: pl(evenements.length, 'événement') + ' à venir', r: 'calendrier-scolaire/' + cs.id },
        { m: 'reseau', i: '\uE00B', t: 'Importer des écoles', d: 'Créer d’un coup les écoles de la circonscription', r: 'import-ecoles?cs=' + cs.id, gerer: true },
        { m: 'comptes', i: '\uE032', t: 'Comptes d’accès', d: 'Écoles, enseignants, parents, élèves', r: 'comptes' },
        { m: 'classes-roles', i: '\uE01E', t: 'Classes et rôles de gestion', d: 'Titulaires et gestion collégiale', r: 'classes-roles' },
        { m: 'carte-eleve', i: '\uE02B', t: 'Carte d’identité de l’élève', d: 'Cartes des élèves, par école ou par classe', r: 'carte-eleve' },
        { m: 'carte-ecole', i: '\uE022', t: 'Carte d’identité d’une école', d: 'Fiche complète de chaque école', r: 'carte-ecole' },
        { m: 'fiche-cep', i: '\uE020', t: 'Fiches d’inscription au CEP', d: 'Candidats de CM2 par école', r: 'fiche-cep' },
        { m: 'telechargements', i: '\uE009', t: 'Téléchargements', d: 'Fiches de recensement, fiches et certificats', r: 'telechargements' },
        { m: 'recensement', i: '\uE040', t: 'Recensement', d: 'Fiches des écoles de la circonscription', r: 'recensement' },
        { m: 'import-export', i: '\uE011', t: 'Jeux de données', d: 'Écoles et statistiques prêtes à installer', r: 'import-export/jeux?cs=' + cs.id, gerer: true },
        { m: 'import-export', i: '\uE01C', t: 'Personnel (FE, ACDPE, ACDPCTD)', d: 'Importer les fichiers du ministère', r: 'import-export/personnel?cs=' + cs.id, gerer: true },
        { m: 'import-export', i: '\uE06E', t: 'Import et export', d: 'Exporter ou importer des données', r: 'import-export?cs=' + cs.id },
        { m: 'cachets', i: '\uE006', t: 'Cachet de la circonscription', d: 'Le cachet de la CS sur ses documents', r: 'cachet/territoire/' + cs.id, gerer: true }
      ].filter(t => EG.peutVoirModule(t.m) && (!t.gerer || peutGerer()));
      zoneCorps.appendChild(el('div', { class: 'grille grille-departements' }, tuiles.map(t => el('button', {
        class: 'carte carte-lien', onclick: () => Routeur.aller(t.r)
      }, [
        el('h3', { class: 'carte-titre', text: t.i + ' ' + t.t }),
        el('p', { class: 'muet petit', text: t.d })
      ]))));

      zoneCorps.appendChild(el('p', { class: 'muet petit',
        text: 'Les unités pédagogiques, contacts et événements enregistrés ici appartiennent à ' + cs.nom
          + ' et n’apparaissent dans aucune autre circonscription.' }));
    }

    charger();
  });
})(window);
