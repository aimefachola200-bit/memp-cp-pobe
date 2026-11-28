/* ÉduGestion Pro Master — socle des pièces officielles.
   Cachet, codes QR, signatures et en-têtes : les briques communes à
   toutes les pièces éditées. Ce fichier ne connaît aucun modèle particulier. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  EG.Docs = EG.Docs || {};

  const el = U.el;

  const echapper = v => String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /** Chemin absolu d'une ressource, utilisable depuis une fenêtre d'impression. */
  function ressource(nom) {
    return (global.location && location.href)
      ? new URL('assets/' + nom, location.href).href : 'assets/' + nom;
  }

  /* =======================================================================
     Cachet de l'établissement
     ======================================================================= */

  /**
   * Cachet circulaire dessiné à la volée à partir des données de l'école.
   * Il n'a pas valeur de sceau humide : il identifie l'émetteur et se vérifie
   * par le numéro et l'empreinte portés en pied de document.
   */
  const COULEURS_CACHET = { BLEU: '#1B4D8F', ROUGE: '#B3121D' };

  /**
   * Cachet de l'établissement, entièrement paramétrable : texte de l'arc
   * supérieur, texte central, texte de l'arc inférieur, les deux arcs étant
   * séparés par une petite étoile. Chaque directeur saisit ses propres mentions
   * et choisit l'encre, bleue ou rouge.
   */
  function cachet(ecole, options) {
    /* Même dessin que SCOLARIS, GESCOL et MEMP-CP : trois cercles, texte de l'arc supérieur et de l'arc
       inférieur posé lettre par lettre (largeur réelle de chaque lettre), une étoile de chaque côté, et le texte
       central centré dans le cercle intérieur — sur une à trois lignes (« | » force un retour à la ligne). */
    options = options || {};
    ecole = ecole || {};
    const encre = COULEURS_CACHET[options.couleur || ecole.cachet_couleur || 'BLEU'] || COULEURS_CACHET.BLEU;
    const haut = String(options.haut || ecole.cachet_haut || 'RÉPUBLIQUE DU BÉNIN').toUpperCase().trim();
    const centre = String(options.centre || ecole.cachet_centre || 'LE DIRECTEUR').toUpperCase().trim();
    const bas = String(options.bas || ecole.cachet_bas || ecole.nom || 'ÉCOLE').toUpperCase().trim();
    const taille = options.taille || 118;
    const T = 200, r = T / 2, rt = r * 0.74, fs = r * 0.17;
    const parts = ['<svg class="cachet" width="' + taille + '" height="' + taille + '" viewBox="0 0 ' + T + ' ' + T + '"'
      + ' xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cachet — ' + echapper(centre.replace(/\|/g, ' ')) + '">',
      '<g fill="none" stroke="' + encre + '" opacity="0.92">'
      + '<circle cx="' + r + '" cy="' + r + '" r="' + (r - 3) + '" stroke-width="3.2"/>'
      + '<circle cx="' + r + '" cy="' + r + '" r="' + (r - 8) + '" stroke-width="1"/>'
      + '<circle cx="' + r + '" cy="' + r + '" r="' + (r * 0.56) + '" stroke-width="1.4"/></g>',
      '<g fill="' + encre + '" font-family="Arial, Helvetica, sans-serif" font-weight="700" opacity="0.92">'];
    const rad = d => d * Math.PI / 180, deg = x => x * 180 / Math.PI;
    function arc(texte, enHaut) {
      if (!texte) return;
      let t = fs;
      let larg = Array.from(texte).map(ch => largeurTexte(ch, t, true) + t * 0.08);
      let total = deg(larg.reduce((a, b) => a + b, 0) / rt);
      if (total > 150) { const f = 150 / total; t *= f; larg = larg.map(w => w * f); total = 150; }
      let cumul = 0;
      Array.from(texte).forEach((ch, k) => {
        const pas = deg(larg[k] / rt), milieu = cumul + pas / 2; cumul += pas;
        const a = enHaut ? 90 + total / 2 - milieu : 270 - total / 2 + milieu, rot = enHaut ? 90 - a : 270 - a;
        const x = r + rt * Math.cos(rad(a)), y = r - rt * Math.sin(rad(a));
        parts.push('<text x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" font-size="' + t.toFixed(2) + '" text-anchor="middle" dominant-baseline="central"'
          + ' transform="rotate(' + rot.toFixed(2) + ' ' + x.toFixed(2) + ' ' + y.toFixed(2) + ')">' + echapper(ch) + '</text>');
      });
    }
    arc(haut, true); arc(bas, false);
    [0, 180].forEach(a => parts.push('<text x="' + (r + rt * Math.cos(rad(a))).toFixed(2) + '" y="' + r + '" font-size="' + (fs * 1.1).toFixed(2)
      + '" text-anchor="middle" dominant-baseline="central">\uE05D</text>'));
    /* Texte central : coupé en lignes équilibrées s'il est long, puis taille ajustée pour tenir dans le cercle intérieur. */
    let lignes = centre.split('|').map(x => x.trim()).filter(Boolean);
    if (lignes.length === 1 && lignes[0].length > 14) {
      const mots = lignes[0].split(/\s+/), n = lignes[0].length > 28 ? 3 : 2, cible = lignes[0].length / n;
      lignes = []; let cur = '';
      mots.forEach(m => { if (cur && (cur + ' ' + m).length > cible + 3 && lignes.length < n - 1) { lignes.push(cur); cur = m; } else cur = cur ? cur + ' ' + m : m; });
      if (cur) lignes.push(cur);
    }
    if (!lignes.length) lignes = [''];
    let fc = r * 0.2;
    const maxW = r * 0.98, w = Math.max.apply(null, lignes.map(l => largeurTexte(l, fc, true)));
    if (w > maxW) fc *= maxW / w;
    fc = Math.min(fc, (r * 0.98) / (lignes.length * 1.2));
    const y0 = r - (lignes.length - 1) * fc * 0.6;
    lignes.forEach((l, k) => parts.push('<text x="' + r + '" y="' + (y0 + k * fc * 1.2).toFixed(2) + '" font-size="' + fc.toFixed(2)
      + '" text-anchor="middle" dominant-baseline="central">' + echapper(l) + '</text>'));
    parts.push('</g></svg>');
    return parts.join('');
  }

  /* =======================================================================
     Cachet rectangulaire du nom (« griffe ») — même dessin que SCOLARIS,
     GESCOL et MEMP-CP : bord double (trait épais + trait fin), coins droits,
     2 à 3 lignes centrées en majuscules — titre ou fonction, NOM Prénoms,
     ligne facultative (grade, qualité). La taille s'ajuste à la largeur.
     ======================================================================= */

  let _mesure = null;
  function largeurTexte(t, taille, gras) {
    try {
      _mesure = _mesure || document.createElement('canvas').getContext('2d');
      _mesure.font = (gras ? 'bold ' : '') + taille + 'px Arial, Helvetica, sans-serif';
      return _mesure.measureText(t).width;
    } catch (e) { return t.length * taille * (gras ? 0.66 : 0.58); }
  }
  function lignesGriffe(lignes) {
    return (lignes || []).map(l => String(l || '').replace(/\s+/g, ' ').trim().toUpperCase()).filter(Boolean).slice(0, 3);
  }

  /** Griffe en SVG (largeur en pixels, hauteur calculée). Rend '' sans aucune ligne. */
  function griffe(lignes, couleur, largeur) {
    lignes = lignesGriffe(lignes);
    if (!lignes.length) return '';
    const L = largeur || 230, col = COULEURS_CACHET[couleur] || couleur || COULEURS_CACHET.BLEU;
    const base = L / 19, pad = L * 0.06, dispo = L - 2 * pad;
    const spec = lignes.map((t, i) => {
      const gras = i === 1 || i === 0 || lignes.length === 1;
      let taille = (i === 1 || (i === 0 && lignes.length === 1)) ? base * 1.3 : (i === 0 ? base : base * 0.92);
      const w = largeurTexte(t, taille, gras);
      if (w > dispo && w) taille = Math.max(taille * dispo / w, 3);
      return { t, gras, taille };
    });
    const hTexte = spec.reduce((a, x) => a + x.taille * 1.3, 0), H = hTexte + 2 * pad;
    let y = (H - hTexte) / 2;
    const textes = spec.map(x => { y += x.taille * 1.3; return '<text x="' + (L / 2).toFixed(1) + '" y="' + (y - x.taille * 0.3).toFixed(2) + '" font-size="' + x.taille.toFixed(2) + '" font-weight="' + (x.gras ? 700 : 400) + '">' + echapper(x.t) + '</text>'; }).join('');
    return '<svg class="griffe" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + L.toFixed(1) + ' ' + H.toFixed(1) + '" width="' + L.toFixed(0) + '" height="' + H.toFixed(0) + '"'
      + ' role="img" aria-label="Cachet rectangulaire : ' + echapper(lignes.join(' / ')) + '">'
      + '<g fill="none" stroke="' + col + '" opacity="0.92"><rect x="1.6" y="1.6" width="' + (L - 3.2).toFixed(1) + '" height="' + (H - 3.2).toFixed(1) + '" stroke-width="2.4"/>'
      + '<rect x="' + (1.6 + pad * 0.55).toFixed(1) + '" y="' + (1.6 + pad * 0.55).toFixed(1) + '" width="' + (L - 3.2 - pad * 1.1).toFixed(1) + '" height="' + (H - 3.2 - pad * 1.1).toFixed(1) + '" stroke-width="0.8"/></g>'
      + '<g fill="' + col + '" font-family="Arial, Helvetica, sans-serif" opacity="0.92" text-anchor="middle">' + textes + '</g></svg>';
  }

  /** Griffe d'une école : « LE DIRECTEUR » (ou le titre choisi), le nom du directeur, une 3e ligne facultative. */
  function griffeEcole(ecole, largeur) {
    ecole = ecole || {};
    const nom = ecole.griffe_nom || ecole.directeur_nom || '';
    if (!nom) return '';
    return griffe([ecole.griffe_titre || (ecole.cachet_centre && !/^LE DIRECTEUR$/i.test(ecole.cachet_centre) ? ecole.cachet_centre : 'LE DIRECTEUR'), nom, ecole.griffe_ligne3],
      ecole.griffe_couleur || ecole.cachet_couleur || 'BLEU', largeur);
  }

  /** Griffe d'une circonscription (chef de CS) ou d'une direction départementale (DDEMP). */
  function griffeTerritoire(t, largeur) {
    t = t || {};
    const nom = t.griffe_nom || t.responsable || '';
    if (!nom) return '';
    const titre = t.griffe_titre || (t.type === 'DEPARTEMENT' ? 'LE DIRECTEUR DÉPARTEMENTAL' : 'LE CHEF DE LA CIRCONSCRIPTION SCOLAIRE');
    return griffe([titre, nom, t.griffe_ligne3], t.griffe_couleur || t.cachet_couleur || 'BLEU', largeur);
  }

  /** Cachet rond et/ou rectangulaire selon la forme choisie : ROND_ET_GRIFFE (par défaut), ROND, RECTANGULAIRE. */
  function assembler(rond, rect, forme) {
    if (!rect || forme === 'ROND') return rond;
    if (forme === 'RECTANGULAIRE') return '<span class="cachets-duo">' + rect + '</span>';
    return '<span class="cachets-duo">' + rond + rect + '</span>';
  }
  function cachetComplet(ecole, options) {
    ecole = ecole || {};
    return assembler(cachet(ecole, options), griffeEcole(ecole, options && options.largeurGriffe), ecole.cachet_type || 'ROND_ET_GRIFFE');
  }
  function cachetTerritoireComplet(t, options) {
    t = t || {};
    return assembler(cachetTerritoire(t, options), griffeTerritoire(t, options && options.largeurGriffe), t.cachet_type || 'ROND_ET_GRIFFE');
  }

  /* =======================================================================
     Code QR de vérification
     ======================================================================= */

  /** Adresse de vérification portée par chaque pièce éditée. */
  function adresseVerification(numero, empreinte) {
    /* Chemin explicite plutôt qu'une réécriture d'URL : la page fonctionne ainsi
       sur n'importe quel hébergement statique, y compris GitHub Pages. */
    const base = (global.location && location.origin && location.origin !== 'null')
      ? location.origin + location.pathname.replace(/[^/]*$/, '')
      : 'https://edugestion.bj/';
    return base + 'verification.html?n=' + encodeURIComponent(numero)
      + (empreinte ? '#' + empreinte : '');
  }

  /** QR code d'un document : il mène à l'adresse de vérification. */
  function qrDocument(numero, empreinte, taille) {
    try {
      return '<div class="bloc-qr">' + EG.QR.svg(adresseVerification(numero, empreinte),
        { taille: taille || 82, niveau: 'M', description: 'Vérification du document ' + numero })
        + '<span>Vérifier</span></div>';
    } catch (e) { return ''; }
  }

  /** QR code d'un élève : identité minimale, lisible par un lecteur ordinaire. */
  function qrEleve(eleve, ins, ecole, annee, taille) {
    const charge = [
      'EGP-ELEVE',
      (eleve.educmaster_matricule || eleve.id || '').slice(0, 36),
      ((eleve.nom || '') + ' ' + (eleve.prenoms || '')).trim(),
      eleve.sexe || '',
      eleve.date_naissance || '',
      ins ? ins.niveau : '',
      ecole ? (ecole.code_ecole || ecole.nom) : '',
      annee || ''
    ].join('|');
    try {
      return EG.QR.svg(charge, { taille: taille || 76, niveau: 'M', description: 'Identité de l’élève' });
    } catch (e) { return ''; }
  }

  /* =======================================================================
     Signature numérique
     ======================================================================= */

  /**
   * Qui signe pour l'école : le directeur connecté lui-même ; sinon (pièce éditée par la circonscription, la
   * direction départementale, un adjoint…) le directeur de l'école, avec la signature qu'il a enregistrée.
   */
  function signataireEcole(user, ecole) {
    ecole = ecole || {};
    if (user && user.role === 'DIRECTEUR' && (!ecole.id || user.ecole_id === ecole.id)) return user;
    if (ecole.signature_directeur || ecole.directeur_nom) return { nom: ecole.directeur_nom || '', prenoms: '', signature_image: ecole.signature_directeur || '' };
    return user;
  }

  /** Le parent (ou le tuteur) d'un élève, avec la signature recueillie sur sa fiche. */
  function parentDe(eleve) {
    eleve = eleve || {};
    return { nom: eleve.tuteur_nom || eleve.nom_pere || eleve.nom_mere || '', prenoms: '', signature_image: eleve.signature_parent || '' };
  }

  /**
   * Signatures des acteurs concernés par une pièce (élève, parent, enseignant, agent, autorité…),
   * en ligne, chacune avec sa mention. acteurs : [{ personne, mention }].
   */
  function blocActeurs(acteurs) {
    const l = (acteurs || []).filter(a => a && a.personne);
    if (!l.length) return '';
    return '<div class="bloc-signature bloc-acteurs">' + l.map(a => caseSignature(a.personne, a.mention)).join('') + '</div>';
  }

  /** Une case de signature : mention, tracé s'il existe, nom en dessous. */
  function caseSignature(personne, mention) {
    const image = personne && personne.signature_image
      ? '<img class="signature-trace" src="' + personne.signature_image + '" alt="Signature">'
      : '<div class="signature-vide">Signature manuscrite</div>';
    return '<div class="signature-case">'
      + '<div class="signature-mention">' + echapper(mention || '') + '</div>'
      + image
      + '<div class="signature-nom">'
      + echapper((((personne && personne.prenoms) || '') + ' ' + ((personne && personne.nom) || '')).trim())
      + '</div></div>';
  }

  /**
   * Pied de signature. Le titulaire de la classe y figure à gauche pour toute
   * pièce rattachée à son cours : c'est lui qui répond de ce qui y est écrit.
   */
  function blocSignature(user, ecole, mention, titulaire) {
    return '<div class="bloc-signature">'
      + (titulaire ? caseSignature(titulaire, 'Le titulaire de la classe') : '')
      + caseSignature(mention && !/directeur|directrice/i.test(mention) ? user : signataireEcole(user, ecole), mention === '' ? '' : (mention || 'Le directeur'))
      + '<div class="cachet-case">' + cachetComplet(ecole) + '</div>'
      + '</div>';
  }

  /* -----------------------------------------------------------------------
     Cachet et visa des circonscriptions et des directions départementales.
     Même modèle que le cachet d'école : arc supérieur, centre, arc inférieur,
     encre bleue ou rouge ; seules les mentions par défaut changent.
     ----------------------------------------------------------------------- */

  /** Mentions par défaut d'un territoire : circonscription scolaire ou direction départementale. */
  function mentionsTerritoire(t) {
    t = t || {};
    const nu = String(t.nom || '').replace(/^(CS|DDEMP)\s+/i, '').toUpperCase();
    /* Le centre du cachet reste court (14 caractères au plus) pour tenir dans le cercle intérieur. */
    if (t.type === 'DEPARTEMENT') {
      const dir = 'DIRECTION DÉPARTEMENTALE ' + nu;
      return { haut: 'RÉPUBLIQUE DU BÉNIN', centre: 'LE DDEMP', bas: dir.length > 34 ? 'DDEMP ' + nu : dir };
    }
    const long = 'CIRCONSCRIPTION SCOLAIRE DE ' + nu;
    return { haut: 'RÉPUBLIQUE DU BÉNIN', centre: 'LE CHEF DE CS', bas: long.length > 34 ? 'CS DE ' + nu : long };
  }

  /** Cachet d'une circonscription (type CIRCONSCRIPTION) ou d'un département (DDEMP). */
  function cachetTerritoire(t, options) {
    t = t || {};
    const m = mentionsTerritoire(t);
    return cachet({
      cachet_haut: t.cachet_haut || m.haut, cachet_centre: t.cachet_centre || m.centre,
      cachet_bas: t.cachet_bas || m.bas, cachet_couleur: t.cachet_couleur || 'BLEU', nom: m.bas
    }, options);
  }

  /** Bloc « Fait à …, le … » puis signature et cachet de l'école, prêt à clore un document. */
  function visaEcole(ecole, mention) {
    ecole = ecole || {};
    return '<p class="fait-a">Fait à ' + echapper(ecole.commune || ecole.ville || '……………………') + ', le ' + '……………………' + '</p>'
      + blocSignature({ nom: ecole.directeur_nom || '' }, ecole, mention || 'Le directeur');
  }

  /** Même chose pour une circonscription ou une direction départementale. */
  function visaTerritoire(t, mention) {
    t = t || {};
    return '<p class="fait-a">Fait à ' + echapper(t.ville || '……………………') + ', le ' + '……………………' + '</p>'
      + '<div class="bloc-signature">'
      + caseSignature({ nom: t.responsable || '', signature_image: t.signature_image || '' }, mention || (t.type === 'DEPARTEMENT' ? 'Le Directeur départemental' : 'Le Chef de la circonscription scolaire'))
      + '<div class="cachet-case">' + cachetTerritoireComplet(t) + '</div></div>';
  }

  /**
   * Capture d'une signature au doigt ou à la souris. Sert au responsable qui
   * édite, mais aussi à l'apprenant et à l'enseignant, dont la signature est
   * ensuite apposée sur les pièces qui les concernent.
   * options : { table, titre, mention }
   */
  function capturerSignature(enregistrement, apres, options) {
    options = options || {};
    const table = options.table || 'users';
    const champ = options.champ || 'signature_image';   // ex. signature_parent (élève), signature_directeur (école)
    const user = enregistrement;
    const largeur = 520, hauteur = 200;
    const toile = U.el('canvas', { width: largeur, height: hauteur, class: 'toile-signature',
      'aria-label': 'Zone de signature' });
    const ctx = toile.getContext('2d');
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#17201B';
    let trace = false, vide = true;

    if (user && user[champ]) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, largeur, hauteur); vide = false; };
      img.src = user[champ];
    }

    function point(e) {
      const r = toile.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      return { x: (src.clientX - r.left) * (largeur / r.width), y: (src.clientY - r.top) * (hauteur / r.height) };
    }
    function debut(e) { e.preventDefault(); trace = true; vide = false; const p = point(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
    function bouge(e) { if (!trace) return; e.preventDefault(); const p = point(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    function fin() { trace = false; }
    ['mousedown', 'touchstart'].forEach(t => toile.addEventListener(t, debut, { passive: false }));
    ['mousemove', 'touchmove'].forEach(t => toile.addEventListener(t, bouge, { passive: false }));
    ['mouseup', 'mouseleave', 'touchend'].forEach(t => toile.addEventListener(t, fin));

    U.modal(options.titre || 'Ma signature', U.el('div', {}, [
      U.el('p', { class: 'muet', text: options.mention
        || 'Signez avec le doigt ou la souris. La signature est conservée sur cet appareil et apposée sur les documents que vous éditez.' }),
      toile,
      U.el('p', { class: 'muet petit', text: 'Elle vaut identification de l’émetteur, pas signature électronique qualifiée : chaque document reste vérifiable par son numéro et son empreinte.' })
    ]), fermer => [
      U.el('button', { class: 'btn btn-fantome', text: 'Annuler', onclick: fermer }),
      U.el('button', {
        class: 'btn btn-fantome', text: 'Effacer', onclick: () => {
          ctx.clearRect(0, 0, largeur, hauteur); vide = true;
        }
      }),
      U.el('button', {
        class: 'btn btn-primaire', text: 'Enregistrer', onclick: () => {
          if (vide) { U.toast('La zone de signature est vide', 'attention'); return; }
          const image = toile.toDataURL('image/png');
          DB.put(table, Object.assign({}, user, { [champ]: image }))
            .then(enregistre => {
              if (table === 'users' && EG.session.user.id === enregistre.id) EG.session.user = enregistre;
              /* Le directeur qui signe pour lui-même signe aussi pour son école : sa signature figure ainsi
                 sur les pièces de l'école éditées par la circonscription ou la direction départementale. */
              const suite = (table === 'users' && enregistre.role === 'DIRECTEUR' && enregistre.ecole_id)
                ? DB.get('ecoles', enregistre.ecole_id).then(e => e ? DB.put('ecoles', Object.assign({}, e, { signature_directeur: image })) : null) : Promise.resolve();
              return suite.then(() => DB.audit('SIGNATURE_ENREGISTREE', table, enregistre.id, { champ }));
            })
            .then(() => { fermer(); U.toast('Signature enregistrée'); EG.majSynchro(); if (apres) apres(); });
        }
      })
    ]);
  }

  /* =======================================================================
     En-tête officiel
     ======================================================================= */

  /** Bandeau du ministère, repris du modèle transmis par la DDEMP. */
  function enteteMEMP(departement, service) {
    /* Même en-tête que l'application MEMP-CP : bandeau officiel (armoiries, ministère, coordonnées). */
    return '<div class="entete-memp">'
      + '<img class="entete-bandeau" src="' + ressource('embleme-memp.png') + '" alt="République du Bénin — Ministère des Enseignements Maternel et Primaire — 01 BP 10 Porto-Novo">'
      + '</div>'
      + '<div class="entete-direction">Direction Départementale des Enseignements Maternel et Primaire : '
      + '<strong>' + echapper(departement || '—') + '</strong><br>'
      + echapper(service || 'Service des Examens et Concours') + '</div>';
  }

  /**
   * En-tête administratif, apposé sur toutes les pièces éditées qui n'ont pas
   * déjà leur propre en-tête officiel : le bandeau du MEMP (comme MEMP-CP,
   * SCOLARIS et GESCOL), puis direction départementale, circonscription, école.
   */
  function enteteAdministratif(ecole, contexte) {
    contexte = contexte || {};
    const lignes = [
      contexte.departement ? 'Direction Départementale des Enseignements Maternel et Primaire — ' + echapper(contexte.departement) : '',
      contexte.circonscription ? 'Circonscription scolaire de ' + echapper(String(contexte.circonscription).replace(/^CS\s+/i, '')) : ''
    ].filter(Boolean);
    return '<div class="entete-admin">'
      + '<img class="entete-bandeau" src="' + ressource('embleme-memp.png') + '" alt="République du Bénin — Ministère des Enseignements Maternel et Primaire">'
      + '<div class="entete-admin-centre">'
      + lignes.map(l => '<span>' + l + '</span>').join('')
      + (ecole && ecole.nom ? '<span class="entete-ecole">' + (global.LogoEcole ? global.LogoEcole.entete(ecole, { taille: 46 }) : echapper(ecole.nom)) + '</span>' : '')
      + '</div></div>';
  }

  Object.assign(EG.Docs, {
    echapper, ressource, cachet, COULEURS_CACHET, cachetTerritoire, mentionsTerritoire, visaEcole, visaTerritoire,
    griffe, griffeEcole, griffeTerritoire, cachetComplet, cachetTerritoireComplet,
    adresseVerification, qrDocument, qrEleve,
    caseSignature, blocSignature, capturerSignature, signataireEcole, parentDe, blocActeurs,
    enteteMEMP, enteteAdministratif
  });
})(window);
