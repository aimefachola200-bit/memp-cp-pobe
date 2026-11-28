/* ÉduGestion Pro — import des écoles d'une circonscription.

   On choisit la circonscription, puis on apporte la liste de ses écoles : un
   classeur Excel (le modèle se télécharge ici même), un fichier CSV, ou une
   liste collée. La liste s'affiche dans un tableau que l'on corrige librement
   — nom, code, zone pédagogique, commune, directeur… — avant de valider. Rien
   n'est enregistré tant que l'on n'a pas cliqué sur « Importer », et chaque
   école importée reste modifiable ensuite dans l'onglet « Écoles ». */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const indexer = E.indexer, entete = E.entete;
  const sa = U.sansAccent;

  const ROLES_IMPORT = ['ADMIN_MEMP', 'ADMIN_TECHNIQUE', 'DDEMP', 'CS'];
  const tri = (a, b) => String(a.nom).localeCompare(String(b.nom), 'fr', { numeric: true });
  const norm = v => sa(String(v === null || v === undefined ? '' : v)).replace(/\s+/g, ' ').trim();
  const LIMITE = 1500;

  const ENTETES = ['Nom de l’école *', 'Code école', 'Zone pédagogique', 'Unité pédagogique', 'Cycle', 'Statut', 'Commune', 'Arrondissement',
    'Village ou quartier', 'Directeur', 'Téléphone du directeur', 'Téléphone de l’école', 'Adresse', 'E-mail'];

  /** Reconnaît la colonne d'après son titre, sans tenir compte des accents ni de la casse. */
  function typeColonne(titre) {
    const h = norm(titre);
    if (!h) return null;
    if (h.indexOf('unite') >= 0 || h === 'up' || h.indexOf('up ') === 0) return 'up';
    if (h.indexOf('code') >= 0) return 'code';
    if (h.indexOf('zone') >= 0 || h === 'zp') return 'zone';
    if (h.indexOf('cycle') === 0) return 'cycle';
    if (h.indexOf('statut') === 0) return 'statut';
    if (h.indexOf('arrondissement') === 0) return 'arrondissement';
    if (h.indexOf('commune') === 0) return 'commune';
    if (h.indexOf('village') >= 0 || h.indexOf('quartier') >= 0) return 'village';
    if ((h.indexOf('tel') >= 0 || h.indexOf('phone') >= 0) && h.indexOf('direct') >= 0) return 'tel_dir';
    if (h.indexOf('direct') >= 0) return 'directeur';
    if (h.indexOf('tel') >= 0 || h.indexOf('phone') >= 0 || h.indexOf('contact') >= 0) return 'tel';
    if (h.indexOf('adresse') >= 0) return 'adresse';
    if (h.indexOf('mail') >= 0) return 'email';
    if (h.indexOf('nom') >= 0 || h.indexOf('ecole') >= 0 || h.indexOf('etablissement') === 0) return 'nom';
    return null;
  }

  Routeur.definir('import-ecoles', function (racine, args, params) {
    const user = EG.session.user;
    racine.appendChild(entete('Importer les écoles d’une circonscription',
      'Apportez la liste des écoles d’une circonscription, corrigez-la dans le tableau, puis validez : les écoles sont créées d’un coup.'));

    if (ROLES_IMPORT.indexOf(user.role) < 0 || !EG.peutEcrire()) {
      racine.appendChild(U.vide('L’import des écoles est réservé à l’administration, aux directions départementales et aux circonscriptions scolaires.'));
      return;
    }

    const P = EG.Perimetre;
    const zoneCs = el('div'), zoneSource = el('div'), zoneTableau = el('div'), zoneActions = el('div');
    [zoneCs, zoneSource, zoneTableau, zoneActions].forEach(z => racine.appendChild(z));

    let D = null;
    const etat = { dep: '', cs: '', zone: '', commune: '', cycle: 'PRIMAIRE', statut: 'PUBLIQUE' };
    let lignes = [];
    let refsEtat = []; /* cellules « état » de chaque ligne, remises à jour à la volée */

    /* -------- chargement -------- */

    function charger() {
      return Promise.all([DB.all('territoires'), DB.all('ecoles')]).then(([terr, ecoles]) => {
        const index = indexer(terr);
        D = { terr, index, ecoles, p: P.portee(user, index) };
        if (D.p.bloque) return;
        if (D.p.dep) etat.dep = D.p.dep;
        if (D.p.cs) etat.cs = D.p.cs;
        /* Arrivée depuis l'espace d'une circonscription : elle est déjà choisie (si le compte y a droit). */
        if (!etat.cs && params && params.cs && index[params.cs]
          && (!D.p.dep || (P.ancetre(index, params.cs, 'DEPARTEMENT') || {}).id === D.p.dep)) etat.cs = params.cs;
        if (etat.cs && !index[etat.cs]) etat.cs = '';
        if (etat.cs && !etat.dep) { const d = P.ancetre(index, etat.cs, 'DEPARTEMENT'); if (d) etat.dep = d.id; }
      });
    }

    const departements = () => D.terr.filter(t => t.type === 'DEPARTEMENT').sort(tri);
    const circonscriptions = () => D.terr.filter(t => t.type === 'CIRCONSCRIPTION'
      && (!etat.dep || (P.ancetre(D.index, t.id, 'DEPARTEMENT') || {}).id === etat.dep)).sort(tri);
    const zonesDeCs = () => etat.cs ? D.terr.filter(t => t.type === 'ZONE_PEDAGOGIQUE' && t.parent_id === etat.cs).sort(tri) : [];
    const communesDep = () => etat.dep ? D.terr.filter(t => t.type === 'COMMUNE' && (P.ancetre(D.index, t.id, 'DEPARTEMENT') || {}).id === etat.dep).sort(tri) : [];
    const upsDeCs = () => {
      if (!etat.cs) return [];
      const zs = {}; zonesDeCs().forEach(z => { zs[z.id] = true; });
      return D.terr.filter(t => t.type === 'UNITE_PEDAGOGIQUE' && (t.parent_id === etat.cs || zs[t.parent_id])).sort(tri);
    };
    const ecolesDeCs = () => D.ecoles.filter(e => e.territoire_id === etat.cs);

    /* -------- 1. circonscription -------- */

    function dessinerCs() {
      zoneCs.textContent = '';
      if (D.p.bloque) {
        zoneCs.appendChild(U.vide('Aucun territoire n’est rattaché à votre compte : demandez à l’administration de vous en attribuer un.'));
        return;
      }
      const barre = el('div', { class: 'barre-filtres' });
      if (!D.p.dep) {
        barre.appendChild(U.selecteur('Département', departements().map(d => ({ value: d.id, label: d.nom })), etat.dep,
          v => { etat.dep = v; etat.cs = ''; etat.zone = ''; etat.commune = ''; lignes = []; dessinerTout(); }, { libelleVide: 'Tous' }));
      }
      if (!D.p.cs) {
        barre.appendChild(U.selecteur('Circonscription scolaire', circonscriptions().map(c => ({ value: c.id, label: c.nom })), etat.cs,
          v => {
            etat.cs = v; etat.zone = ''; etat.commune = ''; lignes = [];
            const d = v ? P.ancetre(D.index, v, 'DEPARTEMENT') : null; if (d) etat.dep = d.id;
            dessinerTout();
          }, { libelleVide: '— Choisir la circonscription —' }));
      }
      const carte = U.carte('1. Circonscription', barre);
      if (etat.cs) {
        const nb = ecolesDeCs().length;
        carte.appendChild(el('p', { class: 'muet', text: D.index[etat.cs].nom + ' : ' + zonesDeCs().length + ' zone(s) pédagogique(s), '
          + nb + ' école(s) déjà enregistrée(s).' }));
      }
      zoneCs.appendChild(carte);
    }

    /* -------- 2. source de la liste -------- */

    function dessinerSource() {
      zoneSource.textContent = '';
      if (!etat.cs) return;
      const cs = D.index[etat.cs];

      const zonesOptions = zonesDeCs().map(z => ({ value: z.id, label: z.nom }));
      const defauts = el('div', { class: 'barre-filtres' }, [
        U.selecteur('Zone par défaut', zonesOptions, etat.zone, v => { etat.zone = v; }, { libelleVide: 'Aucune (selon la liste)' }),
        U.selecteur('Commune par défaut', communesDep().map(c => ({ value: c.id, label: c.nom })), etat.commune, v => { etat.commune = v; majEtats(); }, { libelleVide: 'Aucune (selon la liste)' }),
        U.selecteur('Cycle', [{ value: 'PRIMAIRE', label: 'Primaire' }, { value: 'MATERNELLE', label: 'Maternelle' }, { value: 'MIXTE', label: 'Maternelle et primaire' }],
          etat.cycle, v => { etat.cycle = v; }, { vide: false }),
        U.selecteur('Statut', [{ value: 'PUBLIQUE', label: 'Publique' }, { value: 'PRIVEE', label: 'Privée' }, { value: 'COMMUNAUTAIRE', label: 'Communautaire' }],
          etat.statut, v => { etat.statut = v; }, { vide: false })
      ]);

      const fichier = el('input', { type: 'file', accept: '.xlsx,.csv,.txt', 'aria-label': 'Fichier des écoles' });
      const message = el('p', { class: 'muet' });
      fichier.addEventListener('change', () => {
        const f = fichier.files && fichier.files[0];
        if (!f) return;
        message.textContent = 'Lecture en cours…';
        const lecture = /\.txt$/i.test(f.name)
          ? f.text().then(t => rangsDepuisTexte(t))
          : EG.Tableur.lire(f);
        Promise.resolve(lecture).then(rangs => {
          const n = ajouterRangs(rangs);
          message.textContent = n ? n + ' ligne(s) lue(s). Vérifiez-les dans le tableau ci-dessous.' : 'Aucune école trouvée dans ce fichier : partez du modèle.';
          fichier.value = '';
        }).catch(e => { message.textContent = 'Lecture impossible : ' + e.message; });
      });

      const zoneColle = el('textarea', {
        rows: '5', placeholder: 'Une école par ligne. Vous pouvez ajouter, séparés par une tabulation ou un point-virgule : la zone, la commune, le directeur, son téléphone.',
        'aria-label': 'Liste collée'
      });

      zoneSource.appendChild(U.carte('2. La liste des écoles de ' + cs.nom, el('div', {}, [
        defauts,
        el('div', { class: 'grille-source' }, [
          el('div', { class: 'champ' }, [
            el('label', { text: 'Un classeur Excel ou un fichier CSV' }), fichier,
            el('div', { class: 'barre-actions' }, [
              el('button', { class: 'btn btn-fantome btn-petit', text: 'Télécharger le modèle Excel', onclick: () => telechargerModele(cs) })
            ]),
            message
          ]),
          el('div', { class: 'champ' }, [
            el('label', { text: 'Ou coller la liste' }), zoneColle,
            el('div', { class: 'barre-actions' }, [
              el('button', {
                class: 'btn btn-fantome btn-petit', text: 'Lire la liste collée', onclick: () => {
                  const n = ajouterRangs(rangsDepuisTexte(zoneColle.value));
                  if (n) { zoneColle.value = ''; message.textContent = n + ' ligne(s) ajoutée(s) au tableau.'; }
                  else U.toast('Rien à lire : collez au moins un nom d’école', 'attention');
                }
              }),
              el('button', { class: 'btn btn-fantome btn-petit', text: '+ Ajouter une ligne vide', onclick: () => { lignes.push(ligneVide()); dessinerTableau(); } })
            ])
          ])
        ])
      ])));
    }

    /** Le modèle : les colonnes attendues, la liste des zones et des communes en aide-mémoire. */
    function telechargerModele(cs) {
      const zones = zonesDeCs();
      EG.Sortie.excel('modele-import-ecoles-' + EG.Sortie.slug(cs.nom).slice(0, 30), [
        { nom: 'Écoles', lignes: [ENTETES] },
        {
          nom: 'Aide', lignes: [
            ['Comment remplir ce modèle'],
            ['Une école par ligne, sous la ligne de titres. Seul le nom est obligatoire.'],
            ['Zone pédagogique : recopiez un nom de l’onglet « Zones », ou le simple numéro de la zone (1, 2, 3…).'],
            ['Unité pédagogique : son nom (ex. UP Centre). Si elle n’existe pas encore dans la circonscription, elle est créée sous la zone.'],
            ['Commune : recopiez un nom de l’onglet « Communes ».'],
            ['Cycle : PRIMAIRE, MATERNELLE ou MIXTE. Statut : PUBLIQUE, PRIVEE ou COMMUNAUTAIRE.'],
            ['Arrondissement et village : s’ils n’existent pas encore, ils sont créés sous la commune.'],
            ['Code école : laissez vide pour qu’il soit attribué automatiquement.']
          ]
        },
        { nom: 'Unités', lignes: [['Unité pédagogique', 'Zone']].concat((typeof upsDeCs === 'function' ? upsDeCs() : []).map(u => [u.nom, (zones.filter(z => z.id === u.parent_id)[0] || {}).nom || ''])) },
        { nom: 'Zones', lignes: [['Zone pédagogique', 'Code']].concat(zones.map(z => [z.nom, z.code || ''])) },
        { nom: 'Communes', lignes: [['Commune']].concat(communesDep().map(c => [c.nom])) }
      ]);
    }

    /* -------- lecture des lignes -------- */

    function rangsDepuisTexte(texte) {
      const brut = String(texte || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (!brut.length) return [];
      const sep = brut.some(l => l.indexOf('\t') >= 0) ? '\t' : (brut.some(l => l.indexOf(';') >= 0) ? ';' : null);
      return brut.map(l => sep ? l.split(sep).map(c => c.trim()) : [l]);
    }

    function ligneVide() {
      return {
        coche: true, nom: '', code: '', up: '', zone_id: etat.zone || '', cycle: etat.cycle, statut: etat.statut,
        commune: '', arrondissement: '', village: '', directeur: '', tel_dir: '', tel: '', adresse: '', email: ''
      };
    }

    function trouverZone(texte) {
      const zones = zonesDeCs();
      const t = norm(texte);
      if (!t) return '';
      let z = zones.filter(x => norm(x.nom) === t || norm(x.code) === t)[0];
      if (z) return z.id;
      const num = /(?:^|zone|zp|z)\s*0*(\d+)\s*[a-z]?$/.exec(t);
      if (num) {
        z = zones.filter(x => new RegExp('zone\\s*0*' + num[1] + '$').test(norm(x.nom)))[0];
        if (z) return z.id;
      }
      const contient = zones.filter(x => norm(x.nom).indexOf(t) >= 0 || t.indexOf(norm(x.nom)) >= 0);
      return contient.length === 1 ? contient[0].id : '';
    }

    function ajouterRangs(rangs) {
      rangs = (rangs || []).filter(r => r && r.some(c => String(c === null || c === undefined ? '' : c).trim() !== ''));
      if (!rangs.length) return 0;
      const colonnes = {};
      /* Ligne de titres : seulement si sa première case est bien un titre de « nom d'école »,
         pour ne jamais prendre pour un titre une école dont le nom commence par « École… ». */
      const premier = norm(rangs[0][0]).replace(/[*'’:]/g, ' ').replace(/\s+/g, ' ').trim();
      const aTitres = /^(nom( de l ?(ecole|etablissement))?|nom ecole|ecoles?|etablissements?|designation)$/.test(premier);
      let donnees;
      if (aTitres) {
        rangs[0].forEach((titre, i) => { const t = typeColonne(titre); if (t && colonnes[t] === undefined) colonnes[t] = i; });
        if (colonnes.nom === undefined) colonnes.nom = 0;
        donnees = rangs.slice(1);
      } else {
        /* Sans ligne de titres : nom, zone, commune, directeur, téléphone du directeur. */
        ['nom', 'zone', 'commune', 'directeur', 'tel_dir'].forEach((k, i) => { colonnes[k] = i; });
        donnees = rangs;
      }
      const lu = (r, k) => (colonnes[k] === undefined || r[colonnes[k]] === null || r[colonnes[k]] === undefined) ? '' : String(r[colonnes[k]]).trim();
      let n = 0;
      donnees.forEach(r => {
        if (lignes.length >= LIMITE) return;
        const nom = lu(r, 'nom');
        if (!nom) return;
        const l = ligneVide();
        l.nom = nom; l.code = lu(r, 'code');
        const zt = lu(r, 'zone'); if (zt) l.zone_id = trouverZone(zt) || l.zone_id;
        l.up = lu(r, 'up');
        const cy = norm(lu(r, 'cycle')); if (cy) l.cycle = cy.indexOf('mixt') >= 0 ? 'MIXTE' : cy.indexOf('mat') >= 0 ? 'MATERNELLE' : cy.indexOf('prim') >= 0 ? 'PRIMAIRE' : l.cycle;
        const st = norm(lu(r, 'statut')); if (st) l.statut = st.indexOf('priv') >= 0 ? 'PRIVEE' : st.indexOf('commun') >= 0 ? 'COMMUNAUTAIRE' : st.indexOf('publ') >= 0 ? 'PUBLIQUE' : l.statut;
        l.commune = lu(r, 'commune'); l.arrondissement = lu(r, 'arrondissement'); l.village = lu(r, 'village');
        l.directeur = lu(r, 'directeur'); l.tel_dir = lu(r, 'tel_dir'); l.tel = lu(r, 'tel'); l.adresse = lu(r, 'adresse'); l.email = lu(r, 'email');
        lignes.push(l); n++;
      });
      /* Les écoles déjà connues sont décochées d'emblée : on ne crée pas de doublon. */
      lignes.forEach(l => { if (evaluer(l).bloquant) l.coche = false; });
      dessinerTableau();
      return n;
    }

    /* -------- 3. tableau modifiable -------- */

    function communeTrouvee(texte) {
      const t = norm(texte);
      if (!t) return etat.commune ? D.index[etat.commune] : null;
      return communesDep().filter(c => norm(c.nom) === t)[0] || null;
    }

    /** État d'une ligne : { texte, ton, bloquant }. */
    function evaluer(l) {
      const nom = norm(l.nom);
      if (!nom) return { texte: 'Nom manquant', ton: 'danger', bloquant: true };
      if (ecolesDeCs().some(e => norm(e.nom) === nom)) return { texte: 'Existe déjà dans la circonscription', ton: 'attention', bloquant: true };
      const avant = lignes.slice(0, lignes.indexOf(l)).some(x => norm(x.nom) === nom);
      if (avant) return { texte: 'Doublon dans la liste', ton: 'attention', bloquant: true };
      const code = String(l.code || '').trim().toLowerCase();
      if (code && D.ecoles.some(e => String(e.code_ecole || '').trim().toLowerCase() === code)) return { texte: 'Code déjà utilisé', ton: 'danger', bloquant: true };
      if (code && lignes.slice(0, lignes.indexOf(l)).some(x => String(x.code || '').trim().toLowerCase() === code)) return { texte: 'Code en double dans la liste', ton: 'danger', bloquant: true };
      if (!communeTrouvee(l.commune)) return { texte: l.commune ? 'Commune inconnue' : 'Commune à préciser', ton: 'attention', bloquant: false };
      return { texte: 'Prête', ton: 'ok', bloquant: false };
    }

    const importables = () => lignes.filter(l => l.coche && !evaluer(l).bloquant);

    function majEtats() {
      lignes.forEach((l, i) => {
        const cel = refsEtat[i];
        if (!cel) return;
        const e = evaluer(l);
        cel.textContent = '';
        cel.appendChild(U.badge(e.texte, e.ton));
      });
      majActions();
    }

    function dessinerTableau() {
      zoneTableau.textContent = '';
      refsEtat = [];
      if (!etat.cs) return;
      if (!lignes.length) {
        zoneTableau.appendChild(U.carte('3. Vérifier et modifier', U.vide('La liste est vide. Chargez un fichier, collez une liste ou ajoutez une ligne.')));
        majActions();
        return;
      }
      const zones = zonesDeCs();
      const communes = communesDep();
      const liste = el('datalist', { id: 'communes-import' }, communes.map(c => el('option', { value: c.nom })));
      const listeUp = el('datalist', { id: 'ups-import' }, upsDeCs().map(u => el('option', { value: u.nom })));
      const table = el('table', { class: 'tableau tableau-edition' });
      table.appendChild(el('thead', {}, el('tr', {}, ['', 'Nom de l’école', 'Code', 'Zone pédagogique', 'Unité pédagogique', 'Cycle', 'Commune', 'Arrondissement', 'Village / quartier', 'Directeur', 'Tél. directeur', 'État', '']
        .map(t => el('th', { text: t })))));
      const tb = el('tbody');
      lignes.forEach((l, i) => {
        const champ = (cle, attrs) => el('input', Object.assign({
          type: 'text', value: l[cle] || '', 'aria-label': cle, oninput: e => { l[cle] = e.target.value; majEtats(); }
        }, attrs || {}));
        const zoneSel = el('select', { 'aria-label': 'Zone pédagogique', onchange: e => { l.zone_id = e.target.value; } },
          [el('option', { value: '', text: '— Aucune —' })].concat(zones.map(z => {
            const o = el('option', { value: z.id, text: z.nom.replace(/^.*—\s*/, '') }); if (l.zone_id === z.id) o.selected = true; return o;
          })));
        const cycleSel = el('select', { 'aria-label': 'Cycle', onchange: e => { l.cycle = e.target.value; } },
          [['PRIMAIRE', 'Primaire'], ['MATERNELLE', 'Maternelle'], ['MIXTE', 'Mixte']].map(([v, t]) => {
            const o = el('option', { value: v, text: t }); if (l.cycle === v) o.selected = true; return o;
          }));
        const coche = el('input', { type: 'checkbox', checked: l.coche, 'aria-label': 'Importer cette école', onchange: e => { l.coche = e.target.checked; majActions(); } });
        const cel = el('td', { class: 'col-etat' });
        refsEtat[i] = cel;
        tb.appendChild(el('tr', {}, [
          el('td', {}, coche),
          el('td', {}, champ('nom', { class: 'large' })),
          el('td', {}, champ('code', { class: 'court', placeholder: 'auto' })),
          el('td', {}, zoneSel),
          el('td', {}, champ('up', { list: 'ups-import', placeholder: 'Unité pédagogique' })),
          el('td', {}, cycleSel),
          el('td', {}, champ('commune', { list: 'communes-import', placeholder: etat.commune ? (D.index[etat.commune] || {}).nom : '' })),
          el('td', {}, champ('arrondissement')),
          el('td', {}, champ('village')),
          el('td', {}, champ('directeur')),
          el('td', {}, champ('tel_dir', { class: 'court' })),
          cel,
          el('td', {}, el('button', {
            class: 'btn btn-petit btn-fantome btn-alerte', 'aria-label': 'Retirer la ligne', text: '✕',
            onclick: () => { lignes.splice(i, 1); dessinerTableau(); }
          }))
        ]));
      });
      table.appendChild(tb);
      const carte = U.carte('3. Vérifier et modifier', el('div', {}, [
        el('p', { class: 'muet petit', text: 'Chaque case se corrige directement. Décochez une ligne pour ne pas l’importer.' }),
        liste, listeUp, el('div', { class: 'tableau-enveloppe' }, table)
      ]));
      zoneTableau.appendChild(carte);
      majEtats();
    }

    /* -------- 4. validation -------- */

    function majActions() {
      zoneActions.textContent = '';
      if (!etat.cs || !lignes.length) return;
      const pretes = importables();
      const communesManquantes = pretes.filter(l => !communeTrouvee(l.commune)).length;
      zoneActions.appendChild(el('div', { class: 'barre-actions' }, [
        el('button', {
          class: 'btn btn-primaire', text: 'Importer ' + U.nombre(pretes.length) + ' école(s)', disabled: !pretes.length, onclick: importer
        }),
        el('button', { class: 'btn btn-fantome', text: 'Tout décocher', onclick: () => { lignes.forEach(l => { l.coche = false; }); dessinerTableau(); } }),
        el('button', {
          class: 'btn btn-fantome', text: 'Vider la liste',
          onclick: () => U.confirmer('Vider la liste', 'Les lignes du tableau seront supprimées. Aucune école déjà enregistrée n’est touchée.', () => { lignes = []; dessinerTableau(); }, 'Vider')
        }),
        communesManquantes ? el('span', { class: 'muet petit', text: communesManquantes + ' école(s) sans commune reconnue : elles seront créées sans commune, à compléter ensuite.' }) : null
      ]));
    }

    function codeSuivant(cs, pris) {
      const prefixe = cs.code || 'CS';
      let max = 0;
      pris.forEach(c => { const m = new RegExp('^' + prefixe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-(\\d+)$', 'i').exec(c); if (m) max = Math.max(max, Number(m[1])); });
      let n = max + 1, code;
      do { code = prefixe + '-' + String(n++).padStart(3, '0'); } while (pris.has(code.toLowerCase()));
      return code;
    }

    /** Arrondissement ou village : retrouvé sous son parent, sinon créé (comme le « + Ajouter… » du formulaire). */
    function territoire(type, nom, parent, cache) {
      if (!nom || !parent) return Promise.resolve(null);
      const cle = type + '|' + parent.id + '|' + norm(nom);
      if (cache[cle]) return Promise.resolve(cache[cle]);
      const existant = D.terr.filter(t => t.type === type && t.parent_id === parent.id && norm(t.nom) === norm(nom))[0];
      if (existant) { cache[cle] = existant; return Promise.resolve(existant); }
      return DB.put('territoires', { type, nom: nom.trim(), parent_id: parent.id, actif: true }).then(t => { D.terr.push(t); D.index[t.id] = t; cache[cle] = t; return t; });
    }

    function importer() {
      const cs = D.index[etat.cs];
      const dep = P.ancetre(D.index, cs.id, 'DEPARTEMENT');
      const aFaire = importables();
      if (!aFaire.length) return;
      const pris = new Set(D.ecoles.map(e => String(e.code_ecole || '').trim().toLowerCase()).filter(Boolean));
      const cache = {};
      const cacheUp = {};
      const enregistrees = [];

      zoneActions.textContent = '';
      zoneActions.appendChild(el('p', { class: 'muet', text: 'Import en cours…' }));

      aFaire.reduce((suite, l) => suite.then(() => {
        const commune = communeTrouvee(l.commune);
        return territoire('ARRONDISSEMENT', l.arrondissement, commune, cache).then(arr =>
          territoire('VILLAGE_QUARTIER', l.village, arr, cache).then(vil => unite(cs, l, cacheUp).then(up => {
            let code = String(l.code || '').trim();
            if (!code) code = codeSuivant(cs, pris);
            pris.add(code.toLowerCase());
            enregistrees.push({
              code_ecole: code, nom: l.nom.trim(), cycle: l.cycle || 'PRIMAIRE', statut: l.statut || 'PUBLIQUE',
              departement_id: dep ? dep.id : null, commune_id: commune ? commune.id : null, commune: commune ? commune.nom : (l.commune || null),
              arrondissement_id: arr ? arr.id : null, arrondissement: arr ? arr.nom : (l.arrondissement || null),
              village_quartier_id: vil ? vil.id : null, village_quartier: vil ? vil.nom : (l.village || null),
              territoire_id: cs.id, zone_id: l.zone_id || (up && D.index[up.parent_id] && D.index[up.parent_id].type === 'ZONE_PEDAGOGIQUE' ? up.parent_id : null),
              up_id: up ? up.id : null,
              directeur_nom: l.directeur || null, directeur_telephone: l.tel_dir || null,
              telephone: l.tel || null, adresse: l.adresse || null, email: l.email || null, actif: true
            });
          })));
      }), Promise.resolve())
        .then(() => DB.putBatch('ecoles', enregistrees))
        .then(() => DB.audit('IMPORT_ECOLES', 'ecoles', null, { circonscription: cs.nom, nombre: enregistrees.length }))
        .then(() => EG.assurerFichesRecensement())
        .then(() => { EG.majSynchro(); return charger(); })
        .then(() => {
          const importees = new Set(aFaire);
          lignes = lignes.filter(l => !importees.has(l));
          dessinerTout();
          U.modal('Import terminé', el('div', {}, [
            el('p', { class: 'ok-texte', text: enregistrees.length + ' école(s) importée(s) dans ' + cs.nom + '.' }),
            el('p', { class: 'muet', text: 'Elles restent modifiables : ouvrez l’onglet « Écoles » pour corriger une fiche, la déplacer d’une zone à l’autre ou la supprimer. Les comptes d’accès se créent depuis « Comptes d’accès ».' }),
            lignes.length ? el('p', { class: 'muet petit', text: lignes.length + ' ligne(s) non importée(s) sont restées dans le tableau.' }) : null
          ]), fermer => [
            el('button', { class: 'btn btn-fantome', text: 'Rester ici', onclick: fermer }),
            el('button', { class: 'btn btn-fantome', text: 'Créer les comptes', onclick: () => { fermer(); Routeur.aller('comptes/ecoles'); } }),
            el('button', { class: 'btn btn-primaire', text: 'Voir dans « Écoles »', onclick: () => { fermer(); Routeur.aller('gestion-ecoles'); } })
          ]);
        })
        .catch(e => { console.error(e); U.toast('Import interrompu : ' + e.message, 'danger'); majActions(); });
    }

    /** L'unité pédagogique de la ligne : celle de la circonscription qui porte ce nom, sinon elle est créée. */
    function unite(cs, l, cache) {
      const nom = String(l.up || '').trim();
      if (!nom) return Promise.resolve(null);
      const cle = norm(nom);
      if (cache[cle]) return Promise.resolve(cache[cle]);
      const existante = upsDeCs().filter(u => norm(u.nom) === cle)[0];
      if (existante) { cache[cle] = existante; return Promise.resolve(existante); }
      const m = /(\d+)\s*$/.exec(cs.code || '');
      let max = 0;
      upsDeCs().concat(Object.keys(cache).map(k => cache[k])).forEach(u => { const c = /-(\d+)$/.exec(u.code || ''); if (c) max = Math.max(max, Number(c[1])); });
      const rec = { type: 'UNITE_PEDAGOGIQUE', nom, parent_id: l.zone_id || cs.id, actif: true };
      if (m) rec.code = 'UP-' + m[1] + '-' + (max + 1);
      return DB.put('territoires', rec).then(r => { cache[cle] = r; D.terr.push(r); D.index[r.id] = r; return r; });
    }

    function dessinerTout() { dessinerCs(); dessinerSource(); dessinerTableau(); }

    zoneCs.appendChild(el('p', { class: 'muet', text: 'Chargement…' }));
    charger().then(dessinerTout);
  });
})(window);
