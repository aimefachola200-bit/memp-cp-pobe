/* ÉduGestion Pro Master — le personnel des circonscriptions par statut.

   statuts-cs/<catégorie> : pour la circonscription choisie, les directeurs et les adjoints
   - FE     : fonctionnaires de l'État ;
   - ACDPE  : agents contractuels de droit public de l'État ;
   - PRIVE  : écoles privées ;
   - ACDPCTD : enseignants mis à disposition par les collectivités (anciennement AME) ;
   et un récapitulatif par école.

   Chaque catégorie a SA signature numérique (tracée une fois, propre à la circonscription) et SON
   code QR : l'état imprimé ou emporté dans Word est numéroté, scellé par une empreinte et enregistré
   dans le registre des documents ; son QR mène à la page de vérification. Un QR d'identité de la
   catégorie s'affiche aussi à l'écran.

   EG.Categories expose les briques (statut d'un agent, signature, scellé) aux autres modules. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  const el = U.el, Routeur = U.Routeur, E = EG.Ecrans, X0 = EG.EcransCS;
  const S = () => EG.Sortie;
  const sa = U.sansAccent;
  const ech = s => EG.Docs.echapper(s);
  const num = v => (typeof v === 'number' && !isNaN(v)) ? v : 0;

  const CATS = {
    fe: { cat: 'FE', icone: '\uE01E', titre: 'Personnel FE', long: 'Fonctionnaires de l’État (FE)',
      sous: 'Directeurs et adjoints fonctionnaires de l’État des écoles de la circonscription.' },
    acdpe: { cat: 'ACDPE', icone: '\uE01E', titre: 'Personnel ACDPE', long: 'Agents contractuels de droit public de l’État (ACDPE)',
      sous: 'Directeurs et adjoints contractuels de droit public de l’État des écoles de la circonscription.' },
    prive: { cat: 'PRIVE', icone: '\uE022', titre: 'Écoles privées', long: 'Personnel des écoles privées',
      sous: 'Directeurs et adjoints des écoles privées de la circonscription.' },
    acdpctd: { cat: 'ACDPCTD', icone: '\uE01E', titre: 'Enseignants ACDPCTD', long: 'Enseignants ACDPCTD (agents mis à disposition par les collectivités territoriales, anciennement AME)',
      sous: 'Directeurs et adjoints ACDPCTD (anciennement AME) des écoles de la circonscription.' },
    recap: { cat: 'ENSEMBLE', icone: '\uE015', titre: 'Récapitulatif par école', long: 'Récapitulatif du personnel par école et par statut',
      sous: 'Directeurs et adjoints de chaque école selon leur statut, avec les totaux de la circonscription.' }
  };
  const LIB_CAT = { FE: 'FE', ACDPE: 'ACDPE', PRIVE: 'Écoles privées', ACDPCTD: 'ACDPCTD', ENSEMBLE: 'Récapitulatif', A_PRECISER: 'Statut à préciser' };
  const QUALITE_DEFAUT = { FE: 'F.E.', ACDPE: 'A.C.D.P.E.', ACDPCTD: 'A.M.E.' };

  /* =======================================================================
     Statut et rang d'un agent
     ======================================================================= */

  /** FE, ACDPE, PRIVE, ACDPCTD ou A_PRECISER, d'après la qualité de l'agent et le statut de son école. */
  function statutDe(p, ecole) {
    if (ecole && ecole.statut === 'PRIVEE') return 'PRIVE';
    const q = sa(p.qualite).replace(/[^a-z]/g, '');
    if (q === 'ame' || q === 'acdpctd' || X0.categoriePersonnel(p) === 'AME') return 'ACDPCTD';
    if (q === 'acdpe' || q === 'ace' || /contractuel/.test(q)) return 'ACDPE';
    if (q === 'fe' || q === 'ape' || /fonctionnaire/.test(q)) return 'FE';
    return 'A_PRECISER';
  }

  /** DIRECTEUR, ADJOINT (tout enseignant qui n'est pas directeur) ou null pour le personnel non enseignant. */
  function rangDe(p) {
    if (p.fonction === 'DIRECTEUR') return 'DIRECTEUR';
    if (['ADMINISTRATIF', 'SOUTIEN', 'CS', 'CONSEILLER_PEDAGOGIQUE'].indexOf(p.fonction) >= 0) return null;
    return 'ADJOINT';
  }

  /* =======================================================================
     Signature numérique et code QR de chaque catégorie
     ======================================================================= */

  function signatureDe(csId, cat) {
    return DB.where('signatures_categories', r => r.territoire_id === csId && r.categorie === cat).then(l => l[0] || null);
  }

  /** Crée la fiche de signature de la catégorie si besoin, puis ouvre le tracé de la signature. */
  function tracerSignature(cs, cat, apres) {
    return signatureDe(cs.id, cat)
      .then(rec => rec || DB.put('signatures_categories', { territoire_id: cs.id, categorie: cat, signataire_nom: cs.responsable || '', signataire_qualite: 'Le Chef de la circonscription scolaire' }))
      .then(rec => EG.Docs.capturerSignature(rec, apres, { table: 'signatures_categories', titre: 'Signature — ' + LIB_CAT[cat],
        mention: 'Cette signature sera apposée, avec son code QR, sur tous les états de la catégorie « ' + LIB_CAT[cat] + ' » de ' + cs.nom + '.' }));
  }

  /** QR d'identité de la catégorie (lisible par un lecteur ordinaire). */
  function qrCategorie(cs, cat, sig, detail, taille) {
    const charge = ['EGP-CATEGORIE', cat, cs.code || cs.nom, EG.session.annee_code || '', detail || '', (sig && sig.signataire_nom) || ''].join('|');
    try { return EG.QR.svg(charge, { taille: taille || 96, niveau: 'M', description: 'Code QR de la catégorie ' + LIB_CAT[cat] }); } catch (e) { return ''; }
  }

  /**
   * Scelle un état de catégorie : numéro, empreinte, enregistrement dans le registre des documents
   * et signature de la catégorie. Rend le bloc HTML « fait à… signature, cachet, QR » à placer en bas de l'état.
   * o = { cs, cat, titre, corps }
   */
  function sceller(o) {
    return signatureDe(o.cs.id, o.cat).then(sig => {
      sig = sig || {};
      const numero = 'PERS-' + o.cat + '-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-6);
      const hash = EG.empreinte(o.corps + numero);
      const u = EG.session.user;
      return DB.put('documents', { numero, type_code: 'PERSONNEL_' + o.cat, titre: o.titre, ecole_id: null, annee_scolaire_id: EG.session.annee_id,
        sensibilite: 'INTERNE', statut: 'GENERE', hash_sha256: hash, contenu_html: o.corps })
        .then(doc => DB.put('signatures_documents', { document_id: doc.id, signataire_label: sig.signataire_nom || ((u.prenoms || '') + ' ' + u.nom).trim(),
          role_signature: sig.signataire_qualite || U.libelle(u.role), type_signature: sig.signature_image ? 'NUMERIQUE' : 'CACHET', hash_document: hash, signed_at: new Date().toISOString() })
          .then(() => { DB.audit('GENERATION_DOCUMENT', 'documents', doc.id, { type: 'PERSONNEL_' + o.cat, cs: o.cs.id }); EG.majSynchro(); }))
        .then(() => {
          const D = EG.Docs;
          return '<p class="fait-a">Fait à ' + ech(o.cs.ville || '……………………') + ', le ' + ech(U.dateFR(new Date().toISOString())) + '</p>'
            + '<div class="bloc-signature">'
            + D.caseSignature({ prenoms: '', nom: sig.signataire_nom || o.cs.responsable || '', signature_image: sig.signature_image }, sig.signataire_qualite || 'Le Chef de la circonscription scolaire')
            + '<div class="cachet-case">' + D.cachetTerritoireComplet(o.cs) + '</div>'
            + D.qrDocument(numero, hash, 92) + '</div>'
            + '<div class="pied pied-qr"><div>Signature numérique de la catégorie « ' + ech(LIB_CAT[o.cat]) + ' » — document n° ' + ech(numero) + ' — empreinte ' + ech(hash)
            + '<br>Scannez le code ci-contre pour vérifier l’authenticité de cet état.</div></div>';
        });
    });
  }

  EG.Categories = { CATS, LIB_CAT, statutDe, rangDe, signatureDe, tracerSignature, qrCategorie, sceller };

  /* =======================================================================
     Écran
     ======================================================================= */

  Routeur.definir('statuts-cs', function (racine, args, params) {
    const code = CATS[args && args[0]] ? args[0] : 'fe';
    const T = CATS[code];
    let etatCs = null;
    const filtre = { ecole: '', q: '' };
    etatCs = X0.ecran(racine, {
      module: 'statuts-personnel', titre: T.titre, sous: T.sous, cs: params && params.cs, objet: 'son personnel',
      charger: () => E.charger('personnels'),
      avant: zone => {
        zone.textContent = '';
        zone.appendChild(E.barreOnglets(Object.keys(CATS).map(k => [k, CATS[k].icone + ' ' + CATS[k].titre]), code,
          k => Routeur.aller('statuts-cs/' + k + (etatCs && etatCs.cs ? '?cs=' + etatCs.cs : ''))));
      },
      rendre: (zone, X) => {
        const { C, cs, ecoles } = X;
        const ie = {}; ecoles.forEach(e => { ie[e.id] = e; });
        /* Les agents des écoles de la circonscription, avec leur statut et leur rang. */
        const tous = X.data.filter(p => p.actif !== false && p.ecole_id && ie[p.ecole_id])
          .map(p => ({ p, statut: statutDe(p, ie[p.ecole_id]), rang: rangDe(p) }));
        /* Écoles privées sans directeur enregistré : le directeur de la fiche de l'école tient lieu de ligne. */
        ecoles.filter(e => e.statut === 'PRIVEE' && e.directeur_nom
          && !tous.some(x => x.p.ecole_id === e.id && x.rang === 'DIRECTEUR')).forEach(e => {
          tous.push({ p: { id: null, nom: e.directeur_nom, prenoms: '', ecole_id: e.id, fonction: 'DIRECTEUR', telephone: e.directeur_telephone, qualite: 'Privé', _fiche: true }, statut: 'PRIVE', rang: 'DIRECTEUR' });
        });

        if (code === 'recap') { recapitulatif(zone, X, tous, ie); return; }

        const dansCat = tous.filter(x => x.statut === T.cat && x.rang);
        const ecolesCat = ecoles.filter(e => T.cat === 'PRIVE' ? e.statut === 'PRIVEE' : e.statut !== 'PRIVEE');
        const zoneSig = el('div'), zoneStats = el('div'), zoneListes = el('div');
        const barre = el('div', { class: 'barre-filtres' });
        barre.appendChild(U.selecteur('École', ecolesCat.map(e => ({ value: e.id, label: e.nom })), filtre.ecole, v => { filtre.ecole = v; listes(); }, { libelleVide: 'Toutes les écoles' }));
        barre.appendChild(U.champRecherche('Rechercher un agent, un matricule', v => { filtre.q = sa(v); listes(); }));
        const actions = el('div', { class: 'barre-actions' });
        zone.appendChild(zoneSig); zone.appendChild(zoneStats); zone.appendChild(barre); zone.appendChild(actions); zone.appendChild(zoneListes);

        const visibles = rang => dansCat.filter(x => x.rang === rang && (!filtre.ecole || x.p.ecole_id === filtre.ecole)
          && (!filtre.q || sa([x.p.nom, x.p.prenoms, x.p.matricule].join(' ')).indexOf(filtre.q) >= 0))
          .sort((a, b) => String(ie[a.p.ecole_id].nom).localeCompare(String(ie[b.p.ecole_id].nom), 'fr', { numeric: true }) || String(a.p.nom).localeCompare(String(b.p.nom), 'fr'));
        const enTete = ['N°', 'Nom', 'Prénoms', 'Sexe', 'Matricule', 'École', 'Grade', 'Téléphone'];
        const ligneDe = (x, k) => [k + 1, String(x.p.nom || '').toUpperCase(), x.p.prenoms || '', x.p.sexe || '', x.p.matricule || '', ie[x.p.ecole_id].nom,
          x.p.grade || [x.p.categorie, x.p.echelon].filter(Boolean).join(' ') || (x.p._fiche ? 'fiche de l’école' : ''), x.p.telephone || ''];

        function signature() {
          zoneSig.textContent = '';
          signatureDe(cs.id, T.cat).then(sig => {
            const nbD = dansCat.filter(x => x.rang === 'DIRECTEUR').length, nbA = dansCat.filter(x => x.rang === 'ADJOINT').length;
            const qr = qrCategorie(cs, T.cat, sig, 'D' + nbD + '|A' + nbA, 96);
            zoneSig.appendChild(U.carte('Signature numérique et code QR — ' + LIB_CAT[T.cat], el('div', { class: 'ligne-entre', style: 'align-items:center;gap:16px;flex-wrap:wrap' }, [
              el('div', { class: 'signature-apercu', 'data-signature': sig && sig.signature_image ? 'oui' : 'non' }, [
                sig && sig.signature_image ? el('img', { src: sig.signature_image, alt: 'Signature de la catégorie', style: 'max-height:70px;max-width:220px;background:#fff;border:1px solid var(--bordure);border-radius:6px;padding:4px' })
                  : el('span', { class: 'muet', text: 'Aucune signature enregistrée pour cette catégorie.' }),
                el('div', { class: 'petit' }, [el('strong', { text: (sig && sig.signataire_nom) || cs.responsable || 'Signataire à renseigner' }), el('br'), el('span', { class: 'muet', text: (sig && sig.signataire_qualite) || 'Le Chef de la circonscription scolaire' })])
              ]),
              el('div', { class: 'bloc-qr', html: qr + '<span class="petit muet">QR de la catégorie</span>' }),
              X0.peutGerer() ? el('div', { class: 'actions-mini' }, [
                el('button', { class: 'btn btn-fantome', text: sig && sig.signature_image ? '\uE029 Modifier la signature' : '\uE029 Tracer la signature', onclick: () => tracerSignature(cs, T.cat, signature) }),
                el('button', { class: 'btn btn-fantome', text: '\uE006 Signataire', onclick: () => (sig ? Promise.resolve(sig) : DB.put('signatures_categories', { territoire_id: cs.id, categorie: T.cat, signataire_nom: cs.responsable || '', signataire_qualite: 'Le Chef de la circonscription scolaire' }))
                  .then(rec => E.editer('signatures_categories', rec, signature)) })
              ]) : null
            ]), el('p', { class: 'muet petit', text: 'Cette signature et ce code QR sont propres à la catégorie : ils figurent au bas de chaque état imprimé ou emporté dans Word, dont le numéro et l’empreinte se vérifient en scannant le code.' })));
          });
        }

        function listes() {
          const D = visibles('DIRECTEUR'), A = visibles('ADJOINT');
          zoneStats.textContent = '';
          zoneStats.appendChild(el('div', { class: 'grille grille-stats' }, [
            U.stat(U.nombre(dansCat.filter(x => x.rang === 'DIRECTEUR').length), 'Directeurs', ''),
            U.stat(U.nombre(dansCat.filter(x => x.rang === 'ADJOINT').length), 'Adjoints', ''),
            U.stat(U.nombre(dansCat.filter(x => x.p.sexe === 'F').length), 'Femmes', ''),
            U.stat(U.nombre(new Set(dansCat.map(x => x.p.ecole_id)).size) + ' / ' + U.nombre(ecolesCat.length), 'Écoles concernées', '')
          ]));
          const aPreciser = tous.filter(x => x.statut === 'A_PRECISER' && x.rang).length;
          if (aPreciser && T.cat !== 'PRIVE') zoneStats.appendChild(el('p', { class: 'muet petit', text: aPreciser + ' agent(s) de la circonscription n’ont pas de statut renseigné (qualité « F.E. », « A.C.D.P.E. » ou « A.M.E. ») : ils n’apparaissent dans aucune liste.' }));

          actions.textContent = '';
          if (X0.peutGerer()) {
            [['DIRECTEUR', '＋ Directeur'], ['ENSEIGNANT', '＋ Adjoint']].forEach(([f, lib]) => actions.appendChild(el('button', { class: 'btn btn-primaire', text: lib, onclick: () => E.editer('personnels',
              { fonction: f, ecole_id: filtre.ecole || null, qualite: QUALITE_DEFAUT[T.cat] || null, actif: true }, () => X.recharger()) })));
            actions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE00B Importer le fichier du ministère', onclick: () => Routeur.aller('import-export/personnel?cs=' + cs.id) }));
          }
          const titre = T.long + ' — directeurs et adjoints — ' + cs.nom;
          const lignesExport = () => [{ groupe: 'Directeurs (' + D.length + ')' }].concat(D.map((x, k) => ligneDe(x, k)))
            .concat([{ groupe: 'Adjoints (' + A.length + ')' }]).concat(A.map((x, k) => ligneDe(x, k)));
          const corpsHtml = () => '<h2 style="text-align:center">' + ech(titre) + '</h2>'
            + '<h3>Directeurs (' + D.length + ')</h3>' + X0.htmlTableau(enTete, D.map((x, k) => ligneDe(x, k)))
            + '<h3>Adjoints (' + A.length + ')</h3>' + X0.htmlTableau(enTete, A.map((x, k) => ligneDe(x, k)));
          const scelle = () => { const h = corpsHtml(); return sceller({ cs, cat: T.cat, titre, corps: h }).then(bloc => h + bloc); };
          actions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE00C Excel', onclick: () => {
            if (!D.length && !A.length) { U.toast('Rien à exporter', 'attention'); return; }
            S().excel('personnel-' + code + '-' + S().slug(cs.nom).slice(0, 30), [
              { nom: 'Directeurs', lignes: [enTete].concat(D.map((x, k) => ligneDe(x, k))) }, { nom: 'Adjoints', lignes: [enTete].concat(A.map((x, k) => ligneDe(x, k))) }]);
          } }));
          actions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE008 Imprimer (signé, avec QR)', onclick: () => S().imprimer(titre, scelle, { ecole: X0.pseudoEcole(C, cs), paysage: true }) }));
          actions.appendChild(el('button', { class: 'btn btn-fantome', text: '\uE00D Word', onclick: () => S().word('personnel-' + code + '-' + S().slug(cs.nom).slice(0, 30), titre, scelle, { ecole: X0.pseudoEcole(C, cs) }) }));

          zoneListes.textContent = '';
          [['Directeurs', D], ['Adjoints', A]].forEach(([nom, liste]) => {
            zoneListes.appendChild(U.carte(nom + ' (' + liste.length + ')', U.tableau([
              { titre: 'N°', classe: 'col-etroite', valeur: (x) => liste.indexOf(x) + 1 },
              { titre: 'Nom', valeur: x => String(x.p.nom || '').toUpperCase() },
              { titre: 'Prénoms', valeur: x => x.p.prenoms || '' },
              { titre: 'Sexe', valeur: x => x.p.sexe || '' },
              { titre: 'Matricule', valeur: x => x.p.matricule || '' },
              { titre: 'École', valeur: x => ie[x.p.ecole_id].nom },
              { titre: 'Grade', valeur: x => x.p.grade || [x.p.categorie, x.p.echelon].filter(Boolean).join(' ') || (x.p._fiche ? 'fiche de l’école' : '') },
              { titre: 'Téléphone', valeur: x => x.p.telephone || '' }
            ], liste, { messageVide: 'Aucun ' + nom.toLowerCase().replace(/s$/, '') + ' ' + (T.cat === 'PRIVE' ? 'de ce type d’école' : 'de ce statut') + ' pour ' + cs.nom + '.', onLigne: x => { if (x.p.id) Routeur.aller('agent/' + x.p.id); } })));
          });
        }
        signature(); listes();
      }
    });
  });

  /** Récapitulatif : par école, directeurs et adjoints de chaque statut. */
  function recapitulatif(zone, X, tous, ie) {
    const { C, cs, ecoles } = X;
    const ordre = ['FE', 'ACDPE', 'PRIVE', 'ACDPCTD', 'A_PRECISER'];
    const zoneSig = el('div'), zoneTab = el('div');
    zone.appendChild(zoneSig); zone.appendChild(zoneTab);
    const nb = (eid, st, rang) => tous.filter(x => x.rang && x.p.ecole_id === eid && x.statut === st && x.rang === rang).length;
    const enTete = ['École'].concat(...ordre.map(st => [LIB_CAT[st] + ' — dir.', LIB_CAT[st] + ' — adj.']), ['Total']);
    const lignes = ecoles.map(e => {
      const cel = []; ordre.forEach(st => { cel.push(nb(e.id, st, 'DIRECTEUR'), nb(e.id, st, 'ADJOINT')); });
      return [e.nom].concat(cel, [cel.reduce((s, v) => s + v, 0)]);
    });
    const totaux = ['Total de la circonscription'];
    for (let k = 1; k < enTete.length; k++) totaux.push(lignes.reduce((s, l) => s + num(l[k]), 0));
    const toutes = lignes.concat([{ gras: true, cells: totaux }]);
    const titre = 'Récapitulatif du personnel par école et par statut — ' + cs.nom;

    signatureDe(cs.id, 'ENSEMBLE').then(sig => {
      zoneSig.appendChild(U.carte('Signature numérique et code QR — Récapitulatif', el('div', { class: 'ligne-entre', style: 'align-items:center;gap:16px;flex-wrap:wrap' }, [
        el('div', { class: 'signature-apercu', 'data-signature': sig && sig.signature_image ? 'oui' : 'non' }, [
          sig && sig.signature_image ? el('img', { src: sig.signature_image, alt: 'Signature du récapitulatif', style: 'max-height:70px;max-width:220px;background:#fff;border:1px solid var(--bordure);border-radius:6px;padding:4px' })
            : el('span', { class: 'muet', text: 'Aucune signature enregistrée pour le récapitulatif.' }),
          el('div', { class: 'petit' }, [el('strong', { text: (sig && sig.signataire_nom) || cs.responsable || 'Signataire à renseigner' }), el('br'), el('span', { class: 'muet', text: (sig && sig.signataire_qualite) || 'Le Chef de la circonscription scolaire' })])
        ]),
        el('div', { class: 'bloc-qr', html: qrCategorie(cs, 'ENSEMBLE', sig, 'T' + totaux[totaux.length - 1], 96) + '<span class="petit muet">QR du récapitulatif</span>' }),
        X0.peutGerer() ? el('button', { class: 'btn btn-fantome', text: sig && sig.signature_image ? '\uE029 Modifier la signature' : '\uE029 Tracer la signature', onclick: () => tracerSignature(cs, 'ENSEMBLE', () => { zone.textContent = ''; recapitulatif(zone, X, tous, ie); }) }) : null
      ])));
    });
    const scelle = () => { const h = '<h2 style="text-align:center">' + ech(titre) + '</h2>' + X0.htmlTableau(enTete, toutes); return sceller({ cs, cat: 'ENSEMBLE', titre, corps: h }).then(b => h + b); };
    const actions = el('div', { class: 'barre-actions' }, [
      el('button', { class: 'btn btn-fantome', text: '\uE00C Excel', onclick: () => S().excel('personnel-recapitulatif-' + S().slug(cs.nom).slice(0, 30), [{ nom: 'Récapitulatif', lignes: [enTete].concat(lignes, [totaux]) }]) }),
      el('button', { class: 'btn btn-fantome', text: '\uE008 Imprimer (signé, avec QR)', onclick: () => S().imprimer(titre, scelle, { ecole: X0.pseudoEcole(C, cs), paysage: true }) }),
      el('button', { class: 'btn btn-fantome', text: '\uE00D Word', onclick: () => S().word('personnel-recapitulatif-' + S().slug(cs.nom).slice(0, 30), titre, scelle, { ecole: X0.pseudoEcole(C, cs) }) })
    ]);
    zoneTab.appendChild(el('div', { class: 'grille grille-stats' }, [
      U.stat(U.nombre(tous.filter(x => x.rang === 'DIRECTEUR').length), 'Directeurs'), U.stat(U.nombre(tous.filter(x => x.rang === 'ADJOINT').length), 'Adjoints'),
      U.stat(U.nombre(ecoles.length), 'Écoles'), U.stat(U.nombre(tous.filter(x => x.statut === 'A_PRECISER' && x.rang).length), 'Statut à préciser')
    ]));
    zoneTab.appendChild(actions);
    zoneTab.appendChild(U.carte('Directeurs et adjoints par école', el('div', { class: 'tableau-enveloppe defilant' }, el('table', { class: 'tableau grille-notes' }, [
      el('thead', {}, [el('tr', {}, [el('th', { class: 'colle', rowspan: 2, text: 'École' })].concat(ordre.map(st => el('th', { colspan: 2, text: LIB_CAT[st] })), [el('th', { rowspan: 2, text: 'Total' })])),
        el('tr', {}, [].concat(...ordre.map(() => [el('th', { text: 'Dir.' }), el('th', { text: 'Adj.' })])))]),
      el('tbody', {}, toutes.map(l => { const cells = Array.isArray(l) ? l : l.cells; return el('tr', { class: Array.isArray(l) ? '' : 'ligne-totaux' },
        cells.map((v, k) => k === 0 ? el('th', { class: 'colle', text: v }) : el('td', { class: Array.isArray(l) ? '' : 'cel-calc', text: U.nombre(v) }))); }))
    ]))));
  }
})(window);
