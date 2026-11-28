/* ÉduGestion Pro — briques des pièces au format SCOLARIS / GESCOL (registre de présence, tableau d'affichage, synthèses,
   statistiques). Le document passe ensuite par EG.genererDocument : numéro, empreinte, signature digitale du titulaire et
   du directeur, cachet de l'école et code QR de vérification (verification.html). */
(function (global) {
  'use strict';
  const EG = global.EG;
  const ech = s => EG.Docs.echapper(s == null ? '' : String(s));

  /** Titre centré en capitales bleues + sous-titre (comme les PDF SCOLARIS). */
  function titre(t, sous) { return '<div class="titre-officiel"><h2>' + ech(t) + '</h2>' + (sous ? '<p>' + ech(sous) + '</p>' : '') + '</div>'; }

  /** Cadre d'informations : paires [libellé, valeur], quatre par ligne (Cours, Titulaire, Effectif…). */
  function infos(paires, parLigne) {
    const n = parLigne || 3, l = paires.filter(Boolean);
    let h = '<table class="infos-doc"><tbody>';
    for (let i = 0; i < l.length; i += n) {
      h += '<tr>' + l.slice(i, i + n).map(([a, b]) => '<td class="l">' + ech(a) + '</td><td>' + ech(b) + '</td>').join('');
      for (let k = l.slice(i, i + n).length; k < n; k++) h += '<td class="l"></td><td></td>';
      h += '</tr>';
    }
    return h + '</tbody></table>';
  }

  /** Tableau : entetes = [texte | {t, cs, rs, g}] (une ou plusieurs lignes), lignes = [[cellule | {t, g, cls}]], total = ligne mise en valeur. */
  function tableau(entetes, lignes, options) {
    options = options || {};
    const rangs = Array.isArray(entetes[0]) ? entetes : [entetes];
    const cel = (tag, c) => {
      const o = c && typeof c === 'object' ? c : { t: c };
      return '<' + tag + (o.cs ? ' colspan="' + o.cs + '"' : '') + (o.rs ? ' rowspan="' + o.rs + '"' : '')
        + ((o.g || o.cls) ? ' class="' + [o.g ? 'g' : '', o.cls || ''].join(' ').trim() + '"' : '') + '>' + (o.html !== undefined ? o.html : ech(o.t == null ? '' : o.t)) + '</' + tag + '>';
    };
    return '<table class="sco"><thead>' + rangs.map(r => '<tr>' + r.map(c => cel('th', c)).join('') + '</tr>').join('') + '</thead><tbody>'
      + lignes.map(l => '<tr' + (l.tot ? ' class="tot"' : '') + '>' + (l.cells || l).map(c => cel('td', c)).join('') + '</tr>').join('') + '</tbody></table>';
  }

  /** Contenu d'un écran (indicateurs, tableaux, courbes SVG) recopié dans une pièce : boutons et champs retirés. */
  function capture(noeud) {
    const c = noeud.cloneNode(true);
    c.querySelectorAll('button, input, select, textarea, .barre-actions, .barre-filtres, .page-actions, details.educmaster-plie, .no-print').forEach(x => x.remove());
    return '<div class="capture-ecran">' + c.innerHTML + '</div>';
  }

  /** Bouton « Éditer (signé, QR) » pour un écran de statistiques ou de courbes. */
  function boutonEditer(typeCode, titreDoc, noeud, options) {
    return EG.UI.el('button', { class: 'btn btn-fantome', type: 'button', text: '\uE008 Éditer (signé, avec QR)', onclick: () => {
      const n = typeof noeud === 'function' ? noeud() : noeud;
      EG.genererDocument(typeCode, titreDoc, titre(titreDoc, (EG.session.ecole_nom ? EG.session.ecole_nom + ' — ' : '') + 'Année scolaire ' + EG.session.annee_code) + capture(n),
        Object.assign({ paysage: true }, options || {}));
    } });
  }

  /** Scelle une pièce imprimée hors EG.genererDocument (pièces d'une circonscription ou d'une direction départementale :
      leur signature et leur cachet sont déjà dans le corps) : numéro, empreinte, registre des documents, code QR. */
  function sceller(typeCode, titreDoc, corps, options) {
    options = options || {};
    const numero = typeCode + '-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-6);
    const hash = EG.empreinte(corps + numero), u = EG.session.user;
    return EG.DB.put('documents', { numero, type_code: typeCode, titre: titreDoc, ecole_id: options.ecole_id || null, annee_scolaire_id: EG.session.annee_id,
      orientation: options.paysage ? 'PAYSAGE' : 'PORTRAIT', sensibilite: 'INTERNE', statut: 'GENERE', hash_sha256: hash, contenu_html: corps })
      .then(doc => EG.DB.put('signatures_documents', { document_id: doc.id, signataire_label: ((u.prenoms || '') + ' ' + u.nom).trim(), role_signature: EG.UI.libelle(u.role),
        type_signature: u.signature_image ? 'NUMERIQUE' : 'CACHET', hash_document: hash, signed_at: new Date().toISOString() })
        .then(() => { EG.DB.audit('GENERATION_DOCUMENT', 'documents', doc.id, { type: typeCode }); if (EG.majSynchro) EG.majSynchro(); }))
      .then(() => '<div class="pied pied-qr"><div>Document n° ' + ech(numero) + ' — empreinte ' + ech(hash) + '<br>Édité le ' + EG.UI.dateFR(new Date().toISOString())
        + ' par ' + ech(((u.prenoms || '') + ' ' + u.nom).trim()) + '<br>Scannez le code ci-contre pour vérifier l’authenticité.</div>' + EG.Docs.qrDocument(numero, hash, 92) + '</div>');
  }

  const JOURS = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'];
  /** « Je 1 » : jour de la semaine abrégé + quantième (en-tête de colonne du registre). */
  const jourCourt = iso => { const d = new Date(iso + 'T12:00:00'); return JOURS[d.getDay()] + ' ' + d.getDate(); };

  /** Libellés des pièces pour la page de vérification. */
  EG.TYPES_DOCUMENTS = Object.assign(EG.TYPES_DOCUMENTS || {}, {
    REGISTRE_APPEL: 'Registre de présence (appel)', RELEVE_MENSUEL: 'Relevé mensuel de fréquentation', AFFICHAGE_CLASSE: 'Tableau d’affichage de la classe',
    SYNTHESE_EVAL: 'Synthèse de l’évaluation', RESULTATS_EVAL: 'Résultats de l’évaluation', STATISTIQUES: 'Statistiques et courbes', BILAN_PRESENCE: 'Bilan de présence',
    BULLETIN: 'Bulletin de notes', LISTE_CLASSE: 'Liste de classe', CERT_SCOLARITE: 'Certificat de scolarité', CARTE_SCOLAIRE: 'Carte d’identité scolaire'
  });

  EG.DocsSco = { titre, infos, tableau, capture, boutonEditer, jourCourt, ech, sceller };
})(window);
