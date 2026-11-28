/* ÉduGestion Pro Master — répertoire et contacts d'une circonscription, commune par commune.

   On y trouve, pour chaque commune de la circonscription : les directeurs des
   écoles (repris de la fiche de chaque école, sans double saisie) et les
   collaborateurs (conseillers pédagogiques, responsables d'unité pédagogique,
   élus locaux, présidents d'APE, partenaires…), saisis ou importés.

   Comme tout le reste, le répertoire est cloisonné : chaque contact porte
   l'identifiant de sa circonscription et n'apparaît dans aucune autre. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans;
  const sa = U.sansAccent;
  const S = () => EG.Sortie;
  const ech = s => EG.Docs.echapper(s);
  const pl = (n, mot) => U.nombre(n) + ' ' + mot + (n > 1 ? 's' : '');
  const tri = (a, b) => String(a || '').localeCompare(String(b || ''), 'fr', { numeric: true });

  const ROLES_GESTION = ['ADMIN_MEMP', 'ADMIN_TECHNIQUE', 'DDEMP', 'CS', 'CONSEILLER_PEDAGOGIQUE'];
  const peutGerer = () => ROLES_GESTION.indexOf(EG.session.user.role) >= 0 && EG.peutEcrire();
  const SANS_COMMUNE = 'Commune non renseignée';

  const chiffres = t => String(t || '').replace(/\D+/g, '');
  /** Numéro international pour WhatsApp : les numéros béninois n'ont pas leur indicatif à l'écran. */
  const numeroWhatsApp = t => { const c = chiffres(t); return !c ? '' : (c.indexOf('229') === 0 && c.length > 10 ? c : '229' + c); };

  const FONCTIONS = () => EG.SCHEMA.contacts.champs.filter(c => c.n === 'fonction')[0].o;
  const codeFonction = texte => {
    const t = sa(texte).trim(); if (!t) return 'AUTRE';
    const trouve = FONCTIONS().filter(c => sa(c) === t || sa(U.libelle(c)) === t || sa(c).replace(/_/g, ' ') === t)[0];
    if (trouve) return trouve;
    if (/directeur.*adjoint/.test(t)) return 'DIRECTEUR_ADJOINT';
    if (/directeur.*depart|ddemp/.test(t)) return 'DDEMP';
    if (/directeur|directrice/.test(t)) return 'DIRECTEUR';
    if (/conseiller/.test(t)) return 'CONSEILLER_PEDAGOGIQUE';
    if (/chef.*(cs|circ)|ccs/.test(t)) return 'CHEF_CS';
    if (/rup|responsable.*unite/.test(t)) return 'RESPONSABLE_UP';
    if (/maire|elu|mairie|conseiller.*commun/.test(t)) return 'ELU_LOCAL';
    if (/ape/.test(t)) return 'PRESIDENT_APE';
    if (/enseignant|maitre|instituteur/.test(t)) return 'ENSEIGNANT';
    return 'AUTRE';
  };

  Routeur.definir('repertoire', function (racine, args) {
    if (!EG.peutVoirModule('repertoire')) { racine.appendChild(U.vide('Ce module n’est pas disponible pour votre compte.')); return; }
    const gerer = peutGerer();
    const zoneActions = el('div', { class: 'barre-actions' });
    racine.appendChild(E.entete('Répertoire et contacts',
      'Directeurs et collaborateurs de chaque commune de la circonscription : téléphone, WhatsApp, e-mail.'));
    const zoneCs = el('div'), zoneFiltres = el('div', { class: 'barre-filtres' }), zoneCorps = el('div');
    racine.appendChild(zoneCs); racine.appendChild(zoneActions); racine.appendChild(zoneFiltres); racine.appendChild(zoneCorps);

    const etat = { dep: '', cs: (args && args[0]) || '', commune: '', fonction: '', q: '' };
    let C = null, contacts = [];

    function charger() {
      return Promise.all([E.contexteCS(), E.charger('contacts')]).then(([ctx, cts]) => {
        C = ctx; contacts = cts;
        if (etat.cs && !ctx.idsCS[etat.cs]) etat.cs = '';
        E.barreCS(zoneCs, etat, ctx, () => { etat.commune = ''; dessiner(); });
        dessiner();
      });
    }

    const nomCommune = (id, texte) => (id && C.index[id] ? C.index[id].nom : (texte || '')) || SANS_COMMUNE;

    /** Toutes les entrées du répertoire de la circonscription : directeurs (écoles) puis contacts. */
    function entrees(cs) {
      const out = [];
      C.ecoles.filter(e => e.territoire_id === cs.id && C.idsEcoles[e.id] && e.actif !== false).forEach(e => {
        out.push({
          source: 'ECOLE', ecole: e, nom: e.directeur_nom || '', fonction: 'DIRECTEUR', structure: e.nom,
          code: e.code_ecole || '', telephone: e.directeur_telephone || e.telephone || '', email: e.email || '',
          commune: nomCommune(e.commune_id, e.commune)
        });
      });
      contacts.filter(c => c.territoire_id === cs.id && c.actif !== false).forEach(c => {
        const ec = c.ecole_id ? C.ecoles.filter(e => e.id === c.ecole_id)[0] : null;
        out.push({
          source: 'CONTACT', contact: c, nom: ((c.nom || '').toUpperCase() + ' ' + (c.prenoms || '')).trim(), fonction: c.fonction || 'AUTRE',
          structure: ec ? ec.nom : (c.structure || ''), code: ec ? ec.code_ecole || '' : '', telephone: c.telephone || '', telephone2: c.telephone2 || '',
          email: c.email || '', whatsapp: !!c.whatsapp, notes: c.notes || '', commune: nomCommune(c.commune_id)
        });
      });
      return out;
    }

    const estDirecteur = en => en.source === 'ECOLE' || en.fonction === 'DIRECTEUR' || en.fonction === 'DIRECTEUR_ADJOINT';

    function filtrees(cs) {
      const q = sa(etat.q).trim();
      return entrees(cs).filter(en => (!etat.commune || en.commune === etat.commune)
        && (!etat.fonction || en.fonction === etat.fonction)
        && (!q || sa([en.nom, en.structure, en.telephone, en.email, en.code, en.commune].join(' ')).indexOf(q) >= 0));
    }

    function grouper(liste) {
      const par = {};
      liste.forEach(en => { (par[en.commune] = par[en.commune] || []).push(en); });
      return Object.keys(par).sort((a, b) => a === SANS_COMMUNE ? 1 : b === SANS_COMMUNE ? -1 : tri(a, b))
        .map(c => ({ commune: c, liste: par[c].sort((a, b) => (estDirecteur(b) - estDirecteur(a)) || tri(a.structure, b.structure) || tri(a.nom, b.nom)) }));
    }

    /* ---------- affichage ---------- */

    function dessiner() {
      zoneActions.textContent = ''; zoneFiltres.textContent = ''; zoneCorps.textContent = '';
      if (!C || !C.csList.length) return;
      if (!etat.cs) { zoneCorps.appendChild(U.vide('Choisissez une circonscription pour afficher son répertoire.')); return; }
      const cs = C.index[etat.cs];
      const toutes = entrees(cs);
      const communes = Array.from(new Set(toutes.map(en => en.commune))).sort(tri);
      const fonctions = Array.from(new Set(toutes.map(en => en.fonction)));
      if (etat.commune && communes.indexOf(etat.commune) < 0) etat.commune = '';

      if (gerer) {
        zoneActions.appendChild(el('button', { class: 'btn btn-primaire', text: '＋ Contact', onclick: () => formulaireContact(cs, null) }));
        zoneActions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE00B Importer une liste', onclick: () => importer(cs) }));
      }
      zoneActions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE00C Excel', onclick: () => exporter(cs) }));
      zoneActions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE008 Imprimer', onclick: () => sortie(cs, 'imprimer') }));
      zoneActions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE00D Word', onclick: () => sortie(cs, 'word') }));

      zoneFiltres.appendChild(U.selecteur('Commune', communes.map(c => ({ value: c, label: c })), etat.commune,
        v => { etat.commune = v; dessiner(); }, { libelleVide: 'Toutes les communes' }));
      zoneFiltres.appendChild(U.selecteur('Fonction', fonctions.map(f => ({ value: f, label: U.libelle(f) })), etat.fonction,
        v => { etat.fonction = v; dessiner(); }, { libelleVide: 'Toutes les fonctions' }));
      zoneFiltres.appendChild(el('label', { class: 'filtre' }, [el('span', { text: 'Rechercher' }),
        el('input', { type: 'search', placeholder: 'Nom, école, téléphone', value: etat.q, oninput: e => { etat.q = e.target.value; corps(cs); } })]));

      const dirs = toutes.filter(estDirecteur), collabs = toutes.filter(en => !estDirecteur(en));
      const sansTel = dirs.filter(en => !chiffres(en.telephone)).length;
      zoneCorps.appendChild(el('div', { class: 'grille grille-stats' }, [
        U.stat(U.nombre(communes.filter(c => c !== SANS_COMMUNE).length), 'Communes'),
        U.stat(U.nombre(dirs.filter(d => d.source === 'ECOLE').length), 'Directeurs d’école'),
        U.stat(U.nombre(collabs.length), 'Collaborateurs'),
        U.stat(U.nombre(sansTel), 'Directeurs sans téléphone', sansTel ? 'attention' : '')
      ]));
      const zone = el('div'); zoneCorps.appendChild(zone); zoneCorps._zone = zone;
      corps(cs);
    }

    function corps(cs) {
      const zone = zoneCorps._zone; if (!zone) return;
      zone.textContent = '';
      const liste = filtrees(cs);
      if (!liste.length) { zone.appendChild(U.vide('Aucun contact ne correspond. ' + (gerer ? 'Ajoutez-en avec « ＋ Contact » ou importez une liste.' : ''))); return; }
      grouper(liste).forEach(g => {
        const d = el('details', { class: 'cs-carte', open: 'open' });
        d.appendChild(el('summary', { class: 'cs-tete' }, [
          el('span', { class: 'cs-titre' }, el('strong', { text: g.commune === SANS_COMMUNE ? g.commune : 'Commune de ' + g.commune })),
          el('span', { class: 'cs-compte', text: pl(g.liste.filter(estDirecteur).length, 'directeur') + ' · ' + pl(g.liste.filter(en => !estDirecteur(en)).length, 'collaborateur') })
        ]));
        const c = el('div', { class: 'cs-corps' });
        g.liste.forEach(en => c.appendChild(ligne(cs, en)));
        d.appendChild(c); zone.appendChild(d);
      });
    }

    function lienTel(t, classe) {
      const n = chiffres(t);
      return n ? el('a', { href: 'tel:' + (n.indexOf('229') === 0 && n.length > 10 ? '+' + n : '+229' + n), class: classe || '', text: '\uE045 ' + t }) : null;
    }

    function ligne(cs, en) {
      const infos = [en.structure, en.code].filter(Boolean).join(' · ');
      const liens = [lienTel(en.telephone), en.telephone2 ? lienTel(en.telephone2) : null,
        en.whatsapp && chiffres(en.telephone) ? el('a', { href: 'https://wa.me/' + numeroWhatsApp(en.telephone), target: '_blank', rel: 'noopener', text: '\uE035 WhatsApp' }) : null,
        en.email ? el('a', { href: 'mailto:' + en.email, text: '\uE04F ' + en.email }) : null].filter(Boolean);
      const manque = en.source === 'ECOLE' && !en.nom;
      const actions = [];
      if (en.source === 'ECOLE') {
        actions.push(el('button', { class: 'btn btn-fantome btn-petit', text: 'Fiche école', onclick: () => Routeur.aller('carte-ecole/' + en.ecole.id) }));
        if (gerer) actions.push(el('button', { class: 'btn btn-fantome btn-petit', text: 'Directeur', onclick: () => modifierDirecteur(en.ecole) }));
      } else if (gerer) {
        actions.push(el('button', { class: 'btn btn-fantome btn-petit', text: 'Modifier', onclick: () => formulaireContact(cs, en.contact) }));
        actions.push(el('button', { class: 'btn btn-fantome btn-petit btn-alerte', text: 'Supprimer', onclick: () => supprimer(en.contact) }));
      }
      return el('div', { class: 'ecole-ligne' }, [
        el('div', { class: 'ecole-info' }, [
          el('strong', { text: manque ? 'Directeur non renseigné' : en.nom }), ' ',
          U.badge(U.libelle(en.fonction), estDirecteur(en) ? 'ok' : 'info'),
          infos ? el('div', { class: 'muet petit', text: infos }) : null,
          liens.length ? el('div', { class: 'liens-contact' }, liens) : el('div', { class: 'muet petit', text: 'Aucun numéro renseigné' }),
          en.notes ? el('div', { class: 'muet petit', text: en.notes }) : null
        ]),
        actions.length ? el('div', { class: 'actions-mini' }, actions) : null
      ]);
    }

    /* ---------- saisie ---------- */

    function formulaireContact(cs, rec) {
      const dep = EG.Perimetre.ancetre(C.index, cs.id, 'DEPARTEMENT') || {};
      E.refsPour('contacts').then(refs => {
        const communesCS = Array.from(new Set(C.ecoles.filter(e => e.territoire_id === cs.id && e.commune_id).map(e => e.commune_id)));
        const valeurs = Object.assign({ fonction: 'AUTRE', actif: true }, rec || {
          departement_id: dep.id || null, territoire_id: cs.id,
          commune_id: etat.commune ? (C.terr.filter(t => t.type === 'COMMUNE' && t.nom === etat.commune)[0] || {}).id
            : (communesCS.length === 1 ? communesCS[0] : null)
        });
        if (rec && !valeurs.territoire_id) valeurs.territoire_id = cs.id;
        const form = U.formulaire('contacts', valeurs, refs, { excludeId: rec ? rec.id : null });
        const erreurs = el('div', { class: 'erreurs' });
        U.modal(rec ? 'Modifier le contact' : 'Ajouter un contact — ' + cs.nom, [erreurs, form], fermer => [
          el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
          el('button', {
            class: 'btn btn-primaire', text: 'Enregistrer', onclick: () => {
              const lu = form.lire(); erreurs.textContent = '';
              if (lu.erreurs.length) { lu.erreurs.forEach(m => erreurs.appendChild(el('p', { text: m }))); return; }
              lu.valeurs.territoire_id = cs.id; /* un contact reste dans la circonscription où il a été saisi */
              fermer();
              DB.put('contacts', lu.valeurs).then(r => DB.audit(rec ? 'MODIFICATION' : 'CREATION', 'contacts', r.id))
                .then(() => { U.toast('Contact enregistré'); EG.majSynchro(); charger(); });
            }
          })
        ]);
      });
    }

    function modifierDirecteur(ecole) {
      const nom = el('input', { type: 'text', value: ecole.directeur_nom || '' });
      const tel = el('input', { type: 'text', value: ecole.directeur_telephone || '' });
      U.modal('Directeur — ' + ecole.nom, el('div', { class: 'formulaire' }, [
        el('div', { class: 'champ' }, [el('label', { text: 'Nom et prénoms du directeur' }), nom]),
        el('div', { class: 'champ' }, [el('label', { text: 'Téléphone' }), tel])
      ]), fermer => [
        el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
        el('button', {
          class: 'btn btn-primaire', text: 'Enregistrer', onclick: () => {
            fermer();
            DB.put('ecoles', Object.assign({}, ecole, { directeur_nom: nom.value.trim(), directeur_telephone: tel.value.trim() }))
              .then(r => DB.audit('MODIFICATION', 'ecoles', r.id, { champ: 'directeur' }))
              .then(() => { U.toast('Directeur mis à jour'); EG.majSynchro(); charger(); });
          }
        })
      ]);
    }

    function supprimer(c) {
      U.confirmer('Supprimer ce contact', 'Supprimer « ' + ((c.nom || '') + ' ' + (c.prenoms || '')).trim() + ' » du répertoire ?', () => {
        DB.remove('contacts', c.id).then(() => DB.audit('SUPPRESSION', 'contacts', c.id))
          .then(() => { U.toast('Contact supprimé'); EG.majSynchro(); charger(); });
      }, 'Supprimer');
    }

    /* ---------- import ---------- */

    const ENTETES = ['Nom', 'Prénoms', 'Fonction', 'Structure ou école', 'Commune', 'Téléphone', 'E-mail'];

    function importer(cs) {
      const dep = EG.Perimetre.ancetre(C.index, cs.id, 'DEPARTEMENT');
      const communes = C.terr.filter(t => t.type === 'COMMUNE' && (!dep || t.parent_id === dep.id)).sort((a, b) => tri(a.nom, b.nom));
      const texte = el('textarea', { rows: '8', placeholder: 'Une personne par ligne, colonnes séparées par une tabulation ou un point-virgule :\n' + ENTETES.join(' ; ') });
      const fichier = el('input', { type: 'file', accept: '.xlsx,.csv,.txt' });
      const message = el('p', { class: 'muet petit' });
      fichier.addEventListener('change', () => {
        if (!fichier.files[0]) return;
        EG.Tableur.lire(fichier.files[0]).then(l => {
          texte.value = l.map(r => r.map(c => String(c === null || c === undefined ? '' : c).replace(/[\t;\n]/g, ' ')).join('\t')).join('\n');
          message.textContent = l.length + ' ligne(s) lues : vérifiez puis importez.';
        }).catch(e => { message.textContent = 'Fichier illisible : ' + e.message; });
      });
      U.modal('Importer des contacts — ' + cs.nom, el('div', { class: 'formulaire' }, [
        el('div', { class: 'barre-actions' }, el('button', {
          class: 'btn btn-fantome btn-petit', text: '\uE009 Modèle Excel', onclick: () => S().excel('modele-repertoire', [
            { nom: 'Contacts', lignes: [ENTETES] },
            { nom: 'Aide', lignes: [['Une personne par ligne. Seul le nom est obligatoire.'],
              ['Fonction : ' + FONCTIONS().map(U.libelle).join(', ') + '.'],
              ['Commune : ' + communes.map(c => c.nom).join(', ') + '.']] }]) })),
        el('div', { class: 'champ' }, [el('label', { text: 'Fichier Excel ou CSV' }), fichier]),
        el('div', { class: 'champ' }, [el('label', { text: 'Ou coller la liste' }), texte]), message,
        el('p', { class: 'muet petit', text: 'Ces contacts sont rattachés à ' + cs.nom + ' uniquement.' })
      ]), fermer => [
        el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
        el('button', {
          class: 'btn btn-primaire', text: 'Importer', onclick: () => {
            const lignes = texte.value.split(/\r?\n/).map(l => l.split(/\t|;/).map(c => c.trim())).filter(l => l[0]);
            if (lignes.length && /^nom$/.test(sa(lignes[0][0]).trim())) lignes.shift();
            if (!lignes.length) { message.textContent = 'La liste est vide.'; return; }
            const deja = {}; contacts.filter(c => c.territoire_id === cs.id).forEach(c => { deja[sa(c.nom + c.prenoms) + chiffres(c.telephone)] = true; });
            const nouveaux = []; let ignores = 0;
            lignes.forEach(l => {
              const cle = sa((l[0] || '') + (l[1] || '')) + chiffres(l[5]);
              if (deja[cle]) { ignores++; return; }
              deja[cle] = true;
              const t = sa(l[4]).trim();
              const commune = t ? communes.filter(c => sa(c.nom) === t)[0] || communes.filter(c => sa(c.nom).indexOf(t) >= 0 || t.indexOf(sa(c.nom)) >= 0)[0] : null;
              nouveaux.push({ nom: l[0], prenoms: l[1] || '', fonction: codeFonction(l[2]), structure: l[3] || '',
                commune_id: commune ? commune.id : null, departement_id: dep ? dep.id : null, territoire_id: cs.id,
                telephone: l[5] || '', email: l[6] || '', actif: true });
            });
            fermer();
            if (!nouveaux.length) { U.toast('Rien de nouveau : ' + ignores + ' contact(s) déjà présent(s)', 'attention'); return; }
            DB.putBatch('contacts', nouveaux).then(() => DB.audit('IMPORT_CONTACTS', 'contacts', null, { cs: cs.nom, contacts: nouveaux.length }))
              .then(() => { U.toast(pl(nouveaux.length, 'contact') + ' ajouté(s)' + (ignores ? ', ' + ignores + ' déjà présent(s)' : '')); EG.majSynchro(); charger(); });
          }
        })
      ]);
    }

    /* ---------- exports ---------- */

    function lignesExport(cs) {
      return grouper(filtrees(cs)).reduce((s, g) => s.concat(g.liste.map(en => [g.commune, estDirecteur(en) ? 'Directeur' : 'Collaborateur',
        en.nom, U.libelle(en.fonction), en.structure, en.code, en.telephone, en.telephone2 || '', en.email])), []);
    }
    const TITRES = ['Commune', 'Catégorie', 'Nom et prénoms', 'Fonction', 'École ou structure', 'Code école', 'Téléphone', 'Autre téléphone', 'E-mail'];

    function exporter(cs) {
      S().excel('repertoire-' + S().slug(cs.nom).slice(0, 30), [{ nom: 'Répertoire', lignes: [TITRES].concat(lignesExport(cs)) }]);
    }

    function corpsDocument(cs) {
      const groupes = grouper(filtrees(cs));
      const visa = EG.Docs.visaTerritoire ? EG.Docs.visaTerritoire(cs, 'Le Chef de la circonscription scolaire') : '';
      return '<h2 style="text-align:center">Répertoire des directeurs et collaborateurs — ' + ech(cs.nom) + '</h2>'
        + groupes.map(g => '<h3>' + ech(g.commune === SANS_COMMUNE ? g.commune : 'Commune de ' + g.commune) + '</h3>'
          + '<table><thead><tr><th>N°</th><th>Nom et prénoms</th><th>Fonction</th><th>École ou structure</th><th>Téléphone</th><th>E-mail</th></tr></thead><tbody>'
          + g.liste.map((en, i) => '<tr><td>' + (i + 1) + '</td><td>' + ech(en.nom || '—') + '</td><td>' + ech(U.libelle(en.fonction)) + '</td><td>'
            + ech(en.structure) + '</td><td>' + ech(en.telephone) + '</td><td>' + ech(en.email) + '</td></tr>').join('') + '</tbody></table>').join('')
        + visa;
    }

    function sortie(cs, mode) {
      const dep = EG.Perimetre.ancetre(C.index, cs.id, 'DEPARTEMENT');
      const pseudo = { nom: '', territoire_id: cs.id, departement_id: dep ? dep.id : null };
      if (mode === 'imprimer') S().imprimer('Répertoire — ' + cs.nom, () => corpsDocument(cs), { ecole: pseudo });
      else S().word('repertoire-' + S().slug(cs.nom).slice(0, 30), 'Répertoire — ' + cs.nom, () => corpsDocument(cs), { ecole: pseudo });
    }

    charger();
  });
})(window);
