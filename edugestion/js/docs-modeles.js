/* ÉduGestion Pro — modèles de pièces officielles.
   Carte scolaire, certificat de scolarité, fiche d'inscription au CEP et
   fiche d'évaluation de l'agent. Chaque modèle s'appuie sur le socle. */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI;
  EG.Docs = EG.Docs || {};

  const el = U.el;
  const D = EG.Docs;
  const echapper = D.echapper, ressource = D.ressource, cachet = D.cachet,
    qrEleve = D.qrEleve, caseSignature = D.caseSignature, enteteMEMP = D.enteteMEMP;

  /* =======================================================================
     Carte d'identité scolaire
     ======================================================================= */

  /**
   * Verso de la carte : la photo de l'école, sa localisation dans le territoire
   * et la consigne à suivre en cas de perte. Il se remplit tout seul à partir
   * de la fiche de l'établissement.
   */
  function carteScolaireVerso(eleve, ins, ecole, annee, numero, contexte) {
    contexte = contexte || {};
    ecole = ecole || {};
    const sceau = ressource('armoiries-benin.png');
    const nom = ecole.nom || '—';

    const localisation = [
      ['DDEMP', contexte.departement],
      ['Circonscription scolaire', contexte.circonscription],
      ['Commune', ecole.commune],
      ['Arrondissement', ecole.arrondissement],
      ['Village / quartier', ecole.village_quartier]
    ].filter(([, v]) => v).map(([k, v]) =>
      '<tr><td>' + echapper(k) + '</td><th>' + echapper(v) + '</th></tr>').join('');

    const contact = [ecole.telephone, ecole.directeur_telephone, ecole.email]
      .filter(Boolean).join(' · ');

    const visuel = ecole.photo
      ? '<img class="verso-photo" src="' + ecole.photo + '" alt="' + echapper(nom) + '">'
      : '<div class="verso-photo verso-photo-absente">'
        + '<svg viewBox="0 0 120 70" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
        + '<rect x="6" y="30" width="108" height="34" fill="#E6F5EE" stroke="#008751" stroke-width="1.6"/>'
        + '<path d="M2 32 L60 8 L118 32 Z" fill="#008751"/>'
        + '<rect x="18" y="42" width="14" height="22" fill="#fff" stroke="#008751" stroke-width="1"/>'
        + '<rect x="44" y="42" width="14" height="14" fill="#fff" stroke="#008751" stroke-width="1"/>'
        + '<rect x="70" y="42" width="14" height="14" fill="#fff" stroke="#008751" stroke-width="1"/>'
        + '<rect x="94" y="42" width="12" height="22" fill="#fff" stroke="#008751" stroke-width="1"/>'
        + '<path d="M56 14 L60 4 L64 14 Z" fill="#FCD116"/>'
        + '</svg><small>Photo de l’école à ajouter dans sa fiche</small></div>';

    return '<div class="carte-scolaire carte-verso">'
      + '<div class="carte-interieur">'
      + '<img class="carte-filigrane" src="' + sceau + '" alt="">'
      + '<div class="verso-titre">' + echapper(nom) + '</div>'
      + visuel
      + '<table class="verso-localisation"><tbody>' + localisation + '</tbody></table>'
      + '<div class="verso-mention">'
      + '<strong>Cette carte est la propriété de ' + echapper(nom) + '.</strong>'
      + '<span>En cas de perte, prière de la déposer à l’école ou au poste de police le plus proche.'
      + (contact ? ' Contact : ' + echapper(contact) + '.' : '')
      + '</span></div>'
      + '<div class="carte-pied"><span>N° ' + echapper(numero) + '</span>'
      + '<span>Année scolaire ' + echapper(annee) + '</span></div>'
      + '</div></div>';
  }

  /**
   * Carte d'identité scolaire, du CI au CM2 comme en maternelle.
   * Pourtour aux couleurs nationales, armoiries et drapeau en tête, sceau en
   * filigrane, et deux emplacements de signature : l'élève et le directeur.
   */
  function carteScolaire(eleve, ins, ecole, annee, numero, signataire) {
    const initiales = (((eleve.prenoms || ' ')[0] || '') + ((eleve.nom || ' ')[0] || '')).toUpperCase();
    const sceau = ressource('armoiries-benin.png');

    const signature = (personne, mention) => '<div class="carte-signature">'
      + (personne && personne.signature_image
        ? '<img src="' + personne.signature_image + '" alt="Signature">'
        : '<span class="carte-signature-vide"></span>')
      + '<small>' + echapper(mention) + '</small></div>';

    return '<div class="carte-scolaire">'
      + '<div class="carte-interieur">'
      + '<img class="carte-filigrane" src="' + sceau + '" alt="">'

      + '<div class="carte-bandeau">'
      + '<img class="carte-sceau" src="' + sceau + '" alt="Armoiries de la République du Bénin">'
      + '<div class="carte-bandeau-texte">'
      + '<strong>RÉPUBLIQUE DU BÉNIN</strong>'
      + '<span>Ministère des Enseignements Maternel et Primaire</span>'
      + '</div>'
      + '<span class="carte-drapeau" aria-label="Drapeau du Bénin"></span>'
      + '</div>'

      + '<div class="carte-titre">CARTE D’IDENTITÉ SCOLAIRE · ' + echapper(annee) + '</div>'

      + '<div class="carte-corps">'
      + (eleve.photo ? '<div class="carte-photo carte-photo-image"><img src="' + eleve.photo + '" alt="Photo de l’élève"></div>'
        : '<div class="carte-photo"><span>' + echapper(initiales) + '</span><small>Photo</small></div>')
      + '<table class="carte-champs"><tbody>'
      + '<tr><td>Nom</td><th>' + echapper((eleve.nom || '').toUpperCase()) + '</th></tr>'
      + '<tr><td>Prénoms</td><th>' + echapper(eleve.prenoms) + '</th></tr>'
      + '<tr><td>Né(e) le</td><th>' + (eleve.date_naissance ? echapper(U.dateCourte(eleve.date_naissance)) + ' à ' + echapper(eleve.lieu_naissance || '—') : '&nbsp;')
      + '</th></tr>'
      + '<tr><td>Sexe</td><th>' + (eleve.sexe === 'F' ? 'Féminin' : eleve.sexe === 'M' ? 'Masculin' : (eleve.nom ? 'Masculin' : '\uE073 M &nbsp; \uE073 F')) + '</th></tr>'
      + '<tr><td>Classe</td><th>' + echapper(ins.niveau) + '</th></tr>'
      + '<tr><td>École</td><th>' + echapper(ecole ? ecole.nom : '—') + '</th></tr>'
      + '<tr><td>Matricule</td><th>' + echapper(eleve.educmaster_matricule || eleve.npi || 'en cours') + '</th></tr>'
      + '</tbody></table>'
      + '<div class="carte-qr">' + qrEleve(eleve, ins, ecole, annee, 68) + '</div>'
      + '</div>'

      + '<div class="carte-signatures">'
      + signature(eleve, 'L’élève')
      + '<div class="carte-cachet">' + cachet(ecole, { taille: 54 }) + '</div>'
      + signature(D.signataireEcole(signataire, ecole), 'Le Directeur')
      + '</div>'

      + '<div class="carte-pied"><span>N° ' + echapper(numero) + '</span>'
      + '<span>Valable pour l’année scolaire ' + echapper(annee) + '</span></div>'
      + '</div></div>';
  }

  /* =======================================================================
     Certificat de scolarité — un exemplaire par feuille A4
     ======================================================================= */

  /**
   * Certificat de scolarité, un exemplaire par feuille A4.
   * Il porte les insignes du ministère, le NIP et le matricule EDUCMaster,
   * puis la signature du directeur et le cachet de l'établissement.
   */
  function certificatScolarite(eleve, ins, ecole, annee, numero, contexte, appreciations, signataire) {
    appreciations = appreciations || {};
    const p = v => '<span class="pointilles">' + echapper(v || '') + '</span>';

    return '<div class="certificat">'
      + '<div class="cert-entete">'
      + '<div class="cert-armoiries"><img src="' + ressource('entete-memp.jpg')
      + '" alt="Ministère des Enseignements Maternel et Primaire — République du Bénin"></div>'
      + '<div class="cert-colonnes">'
      + '<div class="cert-gauche">DIRECTION DÉPARTEMENTALE DES<br>ENSEIGNEMENTS MATERNEL ET PRIMAIRE<br>DE '
      + p(contexte.departement) + '</div>'
      + '<div class="cert-droite">CIRCONSCRIPTION SCOLAIRE<br>DE : ' + p(contexte.circonscription)
      + '<div class="cert-etoiles">*-*-*-*-*-*-*-*</div>'
      + 'EM/EPP DE : ' + p(ecole ? ecole.nom : '') + '</div>'
      + '</div></div>'

      + '<h2 class="cert-titre">CERTIFICAT DE SCOLARITÉ</h2>'
      + '<p class="cert-numero">N° ' + p(numero) + '</p>'

      + '<div class="cert-corps">'
      + '<p>L… Direct……. de l’EM/EPP de : ' + p(ecole ? ecole.nom : '') + '</p>'
      + '<p>Certifie que l’élève : ' + p(((eleve.nom || '').toUpperCase() + ' ' + (eleve.prenoms || '')).trim()) + '</p>'
      + '<p>Né(e) le ' + p(U.dateCourte(eleve.date_naissance)) + ' à ' + p(eleve.lieu_naissance) + '</p>'
      + '<p>Commune de : ' + p(eleve.commune_naissance || contexte.commune)
      + ' fils(fille) de ' + p(eleve.nom_pere) + '</p>'
      + '<p>et de ' + p(eleve.nom_mere) + '</p>'
      + '<p>Est effectivement inscrit(e) dans ladite école sous le numéro matricule '
      + p(eleve.matricule_ecole || eleve.npi) + '</p>'
      + '<p>depuis le ' + p(U.dateCourte(ins.date_inscription))
      + ' et y poursuit actuellement ses études en Classe de ' + p(ins.niveau) + '</p>'
      + '<p class="cert-appreciations">Avec les appréciations suivantes :<br>'
      + '— ASSIDUITÉ ' + p(appreciations.assiduite) + '<br>'
      + '— CONDUITE ' + p(appreciations.conduite) + '<br>'
      + '— TRAVAIL ' + p(appreciations.travail) + '</p>'
      + '<table class="cert-identite"><tbody>'
      + '<tr><td>NIP</td><th>' + echapper(eleve.npi || '—') + '</th>'
      + '<td rowspan="2" class="cert-qr">' + qrEleve(eleve, ins, ecole, annee, 70) + '</td></tr>'
      + '<tr><td>MATRICULE EDUCMASTER</td><th>' + echapper(eleve.educmaster_matricule || '—') + '</th></tr>'
      + '</tbody></table>'
      + '<p class="cert-sous-titre">Observations particulières</p>'
      + '<p>' + p(appreciations.observations) + '</p>'
      + '<p>' + p('') + '</p>'
      + '<p class="cert-lieu">' + echapper(contexte.commune || '') + ', le '
      + echapper(U.dateCourte(new Date().toISOString())) + '</p>'
      + '</div>'
      + '<div class="bloc-signature cert-signature">'
      + caseSignature(D.signataireEcole(signataire, ecole), 'Le Directeur')
      + '<div class="cachet-case">' + D.cachetComplet(ecole) + '</div>'
      + '</div>'
      + '</div>';
  }

  /* =======================================================================
     Fiche d'évaluation de l'agent — modèle de la Direction de
     l'Administration et des Finances
     ======================================================================= */

  /* Les onze critères notés, avec leur barème et leur regroupement. */
  const CRITERES_EVALUATION = [
    { groupe: 'Compétence professionnelle', total: 8, criteres: [
      { code: 'realisation', nom: 'Taux de réalisation des attentes assignées à l’agent', bareme: 8 }
    ] },
    { groupe: 'Conscience professionnelle', total: 7, criteres: [
      { code: 'ponctualite', nom: 'Ponctualité', bareme: 2 },
      { code: 'assiduite', nom: 'Assiduité', bareme: 2 },
      { code: 'ethique', nom: 'Éthique professionnelle', bareme: 1.5 },
      { code: 'valeurs', nom: 'Sens des valeurs', bareme: 1.5 }
    ] },
    { groupe: 'Le sens du service public', total: 5, criteres: [
      { code: 'sacrifice', nom: 'Esprit de sacrifice', bareme: 1 },
      { code: 'bien_public', nom: 'Respect du bien public', bareme: 2 },
      { code: 'hierarchie', nom: 'Respect de la hiérarchie', bareme: 2 }
    ] }
  ];

  /** Classe de performance officielle, à partir de la note sur 20. */
  function classePerformance(note) {
    if (note === null || note === undefined) return '—';
    if (note >= 18) return 'Très performant';
    if (note >= 16) return 'Performant';
    if (note >= 14) return 'Assez performant';
    if (note >= 10) return 'Peu performant';
    return 'Non performant';
  }

  function tableauCriteres(notes) {
    notes = notes || {};
    let corps = '';
    CRITERES_EVALUATION.forEach((g, ig) => {
      g.criteres.forEach((c, i) => {
        corps += '<tr>'
          + (i === 0 ? '<td rowspan="' + g.criteres.length + '">' + g.groupe + ' (' + g.total + ')</td>' : '')
          + '<td>' + c.nom + '</td>'
          + '<td class="note-critere">' + (notes[c.code] === undefined || notes[c.code] === null
            ? '……..…' : notes[c.code]) + ' / ' + String(c.bareme).replace('.', ',') + '</td>'
          + (i === 0 ? '<td rowspan="' + g.criteres.length + '" class="note-critere">'
            + (notes['_' + g.groupe] === undefined ? '' : notes['_' + g.groupe]) + ' / ' + g.total + '</td>' : '')
          + (ig === 0 && i === 0 ? '<td rowspan="8" class="note-critere">'
            + echapper(notes._classe || '') + '</td>' : '')
          + '</tr>';
      });
    });
    return '<table class="tableau-criteres"><thead><tr><th></th><th>Critères de performance</th>'
      + '<th>Note par critère</th><th>Total</th><th>Classe de performance</th></tr></thead>'
      + '<tbody>' + corps + '</tbody></table>';
  }

  function ficheEvaluationAgent(agent, evaluation, ecole, contexte) {
    evaluation = evaluation || {};
    const p = v => '<span class="pointilles">' + echapper(v || '') + '</span>';

    return '<div class="fiche-agent">'
      + enteteMEMP(contexte.departement, 'Direction de l’Administration et des Finances')
      + '<h2>FICHE D’ÉVALUATION DE L’AGENT</h2>'
      + '<p class="option"><em>(Agent contractuel de l’État n’ayant pas la qualité '
      + 'de supérieur hiérarchique immédiat)</em></p>'

      + '<h3 class="rubrique">1 — Identification de l’agent</h3>'
      + '<div class="identite-agent">'
      + '<p>Nom et prénom(s) : ' + p(((agent.nom || '').toUpperCase() + ' ' + (agent.prenoms || '')).trim()) + '</p>'
      + '<p>Lieu et date de naissance : ' + p((agent.lieu_naissance || '') + ' , le ' + U.dateCourte(agent.date_naissance)) + '</p>'
      + '<p>Tél : ' + p(agent.telephone) + ' &nbsp; E-mail : ' + p(agent.email) + '</p>'
      + '<p>Situation familiale : ' + p(U.libelle(agent.situation_familiale)) + '</p>'
      + '<p>Situation militaire : ' + p(agent.situation_militaire) + '</p>'
      + '<p>Diplôme de recrutement : ' + p(agent.diplome_recrutement) + '</p>'
      + '<p><strong>NIP : ' + p(agent.nip) + '</strong></p>'
      + '<p>Matricule : ' + p(agent.matricule) + '</p>'
      + '<p>Adresse : ' + p(agent.adresse) + '</p>'
      + '</div>'

      + '<h3 class="rubrique">2 — Situation administrative de l’agent</h3>'
      + '<p>Date de première prise de service : ' + p(U.dateCourte(agent.date_premiere_prise_service)) + '</p>'
      + '<p>Grade actuel : ' + p(agent.grade) + ' Catégorie : ' + p(agent.categorie)
      + ' Échelle : ' + p(agent.echelle) + ' Échelon : ' + p(agent.echelon) + '</p>'
      + '<p>Emploi : ' + p(agent.emploi || U.libelle(agent.fonction)) + '</p>'
      + '<p><em>Référence des actes de carrière :</em></p>'
      + '<p>Contrat initial : ' + p(agent.contrat_initial) + '</p>'
      + '<p>Contrat de travail renouvelé : ' + p(agent.contrat_renouvele) + '</p>'
      + '<p>Contrat à durée indéterminée : ' + p(agent.contrat_indetermine) + '</p>'
      + '<p>Avenant : ' + p(agent.avenant) + '</p>'
      + '<p class="lieu-date">Fait à ' + echapper(contexte.commune || '') + ' , le '
      + echapper(U.dateCourte(new Date().toISOString())) + '</p>'
      + '<div class="bloc-signature fiche-signature">'
      + caseSignature(agent, 'L’agent')
      + '<div class="cachet-case">' + D.cachetComplet(ecole) + '</div>'
      + '</div>'

      + '<div class="saut-page"></div>'
      + '<h3 class="rubrique">3 — Évaluation</h3>'
      + '<p>Période de référence : ' + p(U.dateCourte(evaluation.periode_debut))
      + ' à ' + p(U.dateCourte(evaluation.periode_fin)) + '</p>'
      + '<p><strong>3.1 — Rappel des objectifs sur la période</strong></p>'
      + '<div class="zone-libre">' + echapper(evaluation.objectifs || '') + '</div>'
      + '<p><strong>3.2 — Résultats de la période</strong></p>'
      + '<div class="zone-libre">' + echapper(evaluation.resultats || '') + '</div>'
      + '<p><strong>3.3 — Contraintes et difficultés</strong></p>'
      + '<div class="zone-libre">' + echapper(evaluation.contraintes || '') + '</div>'
      + '<p><strong>3.4 — Note et appréciation du supérieur hiérarchique</strong></p>'
      + tableauCriteres(evaluation.notes_hierarchique)
      + '<p><strong>3.5 — Note et appréciation du comité de direction</strong></p>'
      + tableauCriteres(evaluation.notes_comite)
      + '<table class="signatures-fiche"><tr>'
      + '<td>Préciser le titre du supérieur hiérarchique<div class="espace-signature"></div>'
      + 'Prénoms et Nom du supérieur hiérarchique</td>'
      + '<td>Préciser le titre du responsable de la structure<div class="espace-signature"></div>'
      + 'Prénoms et Nom du responsable de la structure</td>'
      + '</tr></table>'
      + '</div>';
  }

  /* =======================================================================
     Fiche d'inscription au CEP — modèle officiel de la DDEMP
     ======================================================================= */

  const case_ = coche => '<span class="case-a-cocher">' + (coche ? '×' : '') + '</span>';
  const ligne_ = valeur => '<span class="pointilles' + (valeur ? '' : ' vide') + '">'
    + echapper(valeur || '') + '</span>';

  /**
   * Fiche d'inscription au CEP : même mise en page que SCOLARIS et GESCOL (modèle Word de la DDEMP reproduit
   * au point près) — en-tête du MEMP, direction départementale à gauche, titre en cartouche vert à droite,
   * session et centre, « ÉCOLE DE PROVENANCE », « CANDIDAT (E) » avec photo, « TRÈS IMPORTANT », « AGENT DE
   * LA DDEMP », signature et cachet du directeur. Les positions sont celles du modèle, en points depuis le haut.
   */
  function ficheCEP(eleve, ins, ecole, annee, fiche, cep, contexte, signataire) {
    contexte = contexte || {}; fiche = fiche || {}; eleve = eleve || {}; ecole = ecole || {};
    signataire = D.signataireEcole(signataire, ecole);
    const VERT = '#194730', OR = '#A3780D', OR_CL = '#C9962B', BORD = '#BAC4BA', TXT = '#1C1A14', GRIS = '#6B6553';
    const KY = 0.955, X = x => (x - 24).toFixed(1) + 'pt', Y = y => ((y - 3) * KY).toFixed(1) + 'pt';
    const out = [];
    const txt = (x, y, t, o) => {
      o = o || {};
      const taille = o.taille || 7.6;
      out.push('<div style="position:absolute;left:' + (o.centre ? X(o.centre - 200) : X(x)) + ';top:' + (((y - 3) * KY) - taille * 0.85).toFixed(1) + 'pt;'
        + (o.centre ? 'width:400pt;text-align:center;' : '') + 'white-space:nowrap;font:' + (o.italique ? 'italic ' : '') + (o.gras === false ? '400 ' : '700 ')
        + taille + 'pt \'Times New Roman\',Times,serif;color:' + (o.coul || VERT) + '">' + echapper(t) + '</div>');
    };
    const lab = (x, y, t, taille, coul, gras, ital) => { txt(x, y, t, { taille, coul: coul || VERT, gras, italique: ital }); return x + largeurTimes(t, taille || 7.6, gras !== false); };
    const champ = (x1, x2, y, v, taille, gras) => {
      out.push('<div style="position:absolute;left:' + X(x1) + ';top:' + Y(y - 9) + ';width:' + (x2 - x1).toFixed(1) + 'pt;height:' + (10.5 * KY).toFixed(1)
        + 'pt;border-bottom:.6pt dotted ' + BORD + ';overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding-left:2pt;box-sizing:border-box;'
        + 'font:' + (gras ? '700 ' : '400 ') + (taille || 9) + 'pt \'Times New Roman\',Times,serif;line-height:' + (10.5 * KY).toFixed(1) + 'pt;color:' + TXT + '">' + echapper(v || '') + '</div>');
    };
    const caseC = (x, y, coche, l) => {
      out.push('<div style="position:absolute;left:' + X(x) + ';top:' + Y(y - 6) + ';width:7pt;height:7pt;border:.6pt solid ' + TXT + ';font:700 7pt Arial;line-height:7pt;text-align:center;color:' + TXT + '">' + (coche ? 'X' : '') + '</div>');
      txt(x + 10, y, l, { taille: 8.5, coul: TXT, gras: !!coche });
    };
    const section = (y1, y2, titre) => {
      out.push('<div style="position:absolute;left:' + X(28) + ';top:' + Y(y1) + ';width:523pt;height:' + ((y2 - y1) * KY).toFixed(1) + 'pt;border:.7pt solid ' + BORD + ';box-sizing:border-box"></div>');
      out.push('<div style="position:absolute;left:' + X(28) + ';top:' + Y(y1) + ';width:523pt;height:' + (15 * KY).toFixed(1) + 'pt;background:' + VERT
        + ';border-radius:2.5pt;color:#fff;font:700 8.3pt \'Times New Roman\',Times,serif;line-height:' + (15 * KY).toFixed(1) + 'pt;padding-left:11pt;box-sizing:border-box">' + echapper(titre) + '</div>');
    };
    const publique = ecole.statut !== 'PRIVEE';
    const auj = U.dateCourte(new Date().toISOString());
    const naiss = ((eleve.date_naissance ? U.dateCourte(eleve.date_naissance) : '') + (eleve.lieu_naissance ? ' à ' + eleve.lieu_naissance : '')).trim();
    const contactParent = ((fiche.parent_contact || '') + (fiche.degre_parente ? ' (' + fiche.degre_parente + ')' : '')).trim();
    const session = fiche.session || ('JUIN ' + (new Date().getFullYear() + (new Date().getMonth() >= 8 ? 1 : 0)));

    /* en-tête du MEMP */
    out.push('<img src="' + ressource('embleme-memp.png') + '" alt="République du Bénin — MEMP" style="position:absolute;left:' + X(28) + ';top:' + Y(5) + ';width:523pt;height:' + (50 * KY).toFixed(1) + 'pt;object-fit:contain;object-position:left center">');
    out.push('<div style="position:absolute;left:' + X(27) + ';top:' + Y(57) + ';width:525pt;border-top:1.4pt solid ' + OR_CL + '"></div>');
    /* direction départementale + cartouche du titre */
    txt(0, 80, 'Direction Départementale des Enseignements', { centre: 157, taille: 8.3, coul: TXT });
    txt(0, 91, 'Maternel et Primaire : ' + (contexte.departement || '……………………'), { centre: 157, taille: 8.3, coul: TXT });
    txt(0, 107, 'Service des Examens et Concours', { centre: 157, taille: 8.3, coul: TXT, gras: false });
    out.push('<div style="position:absolute;left:' + X(287) + ';top:' + Y(67) + ';width:264pt;height:' + (54 * KY).toFixed(1) + 'pt;background:' + VERT + ';border-radius:5pt;color:#fff;text-align:center;font-family:\'Times New Roman\',Times,serif">'
      + '<div style="font:700 11.5pt \'Times New Roman\',Times,serif;margin-top:5pt;line-height:12.4pt">FICHE D’INSCRIPTION À L’EXAMEN DU<br>CERTIFICAT D’ÉTUDES PRIMAIRES (CEP)</div>'
      + '<div style="font-size:6.8pt;color:' + OR_CL + '">OPTION : CEP ' + (fiche.option_6e === false ? '<s style="text-decoration-color:#fff">+ entrée en 6è</s>' : '+ entrée en 6è') + '</div>'
      + '<div style="font:italic 5pt \'Times New Roman\',Times,serif;color:#E3E8E3">(Rayer la mention inutile)</div></div>');
    /* session, centre */
    lab(178, 139, 'SESSION DE :', 8.3, TXT); champ(244, 363, 139, session, 8.5, true);
    lab(178, 153, 'CENTRE DE :', 8.3, TXT); champ(244, 385, 153, fiche.centre || '', 8.5, true);
    /* école de provenance */
    section(168, 286, 'ÉCOLE DE PROVENANCE');
    let x = lab(36, 201, 'COMMUNE DE :'); champ(x + 4, 270, 201, contexte.commune || ecole.commune);
    x = lab(284, 201, 'CIRCONSCRIPTION SCOLAIRE DE :'); champ(x + 4, 543, 201, contexte.circonscription);
    x = lab(36, 219, 'NOM DE L’ÉCOLE :'); champ(x + 4, 543, 219, ecole.nom);
    lab(36, 237, 'STATUT DE L’ÉCOLE :'); caseC(134, 237, publique, 'Publique'); caseC(195, 237, !publique, 'Privée');
    x = lab(36, 255, 'NOM ET PRÉNOM DU DIRECTEUR OU DE LA DIRECTRICE :'); champ(x + 4, 543, 255, contexte.directeur || ecole.directeur_nom);
    x = lab(36, 273, 'CONTACT TÉLÉPHONIQUE DU DIRECTEUR OU DE LA DIRECTRICE :'); champ(x + 4, 543, 273, contexte.directeurContact || ecole.directeur_telephone);
    /* candidat */
    section(293, 592, 'CANDIDAT (E)');
    out.push('<div style="position:absolute;left:' + X(468) + ';top:' + Y(318) + ';width:76pt;height:' + (85 * KY).toFixed(1) + 'pt;border:.9pt solid ' + VERT + ';border-radius:4pt;background:#EDF5ED;overflow:hidden">'
      + (eleve.photo ? '<img src="' + eleve.photo + '" alt="Photo du candidat" style="width:100%;height:100%;object-fit:cover">' : '') + '</div>');
    txt(0, 411, 'Photo du candidat', { centre: 506, taille: 5.2, coul: GRIS, gras: false, italique: true });
    x = lab(36, 328, 'NOM :'); champ(x + 4, 457, 328, (eleve.nom || '').toUpperCase(), 9.5, true);
    lab(38, 338.5, '(À écrire en lettres capitales)', 5, GRIS, false, true);
    x = lab(36, 350, 'PRÉNOMS :'); champ(x + 4, 457, 350, eleve.prenoms, 9.5);
    lab(38, 359.5, '(Écrire tous les prénoms sans abréviation suivant l’ordre et l’orthographe de la pièce d’état civil)', 5, GRIS, false, true);
    x = lab(36, 371, 'SEXE :'); champ(x + 4, 197, 371, eleve.sexe === 'F' ? 'Féminin' : eleve.sexe === 'M' ? 'Masculin' : '');
    x = lab(210, 371, 'DATE ET LIEU DE NAISSANCE :'); champ(x + 4, 457, 371, naiss);
    x = lab(36, 390, 'NUMÉRO EDUCMASTER :'); champ(x + 4, 457, 390, eleve.educmaster_matricule || (cep && cep.numero_table ? 'N° de table ' + cep.numero_table : ''));
    x = lab(36, 408, 'ÉTABLISSEMENTS CHOISIS'); lab(x + 8, 408, '(trois établissements par ordre de préférence, sans abréviation)', 5.4, GRIS, false, true);
    [fiche.etablissement_1, fiche.etablissement_2, fiche.etablissement_3].forEach((e, k) => { const y = 422 + 15.5 * k; lab(36, y, (k + 1) + ' -', 7.6, TXT); champ(56, 457, y, e); });
    x = lab(36, 475, 'RÉSIDENCE DES PARENTS :'); champ(x + 4, 543, 475, fiche.residence_parents);
    lab(36, 493, 'DISPENSE D’ÂGE :'); caseC(118, 493, !!fiche.dispense_age, 'Oui'); caseC(157, 493, !fiche.dispense_age, 'Non');
    lab(215, 493, 'DISPENSE DE SPORT :'); caseC(312, 493, !!fiche.dispense_sport, 'Oui'); caseC(351, 493, !fiche.dispense_sport, 'Non');
    lab(36, 509, 'Je certifie exacts les renseignements ci-dessus.', 7.8, TXT, false, true);
    lab(154, 525, 'Fait à', 7.8, TXT, false); champ(185, 298, 525, contexte.commune || ecole.commune);
    lab(311, 525, 'le', 7.8, TXT, false); champ(325, 430, 525, auj);
    x = lab(36, 542, 'NOM, PRÉNOM ET SIGNATURE DU PARENT :'); champ(x + 4, 543, 542, fiche.parent_nom || D.parentDe(eleve).nom);
    if (eleve.signature_parent) out.push('<img src="' + eleve.signature_parent + '" alt="Signature du parent" style="position:absolute;left:' + X(452) + ';top:' + Y(527) + ';width:88pt;height:' + (19 * KY).toFixed(1) + 'pt;object-fit:contain;object-position:right center">');
    x = lab(36, 561, 'CONTACT TÉLÉPHONIQUE DU PARENT :'); champ(x + 4, 543, 561, contactParent);
    lab(38, 571.5, '(Préciser le degré de parenté)', 5, GRIS, false, true);
    x = lab(36, 582, 'SIGNATURE DU (DE LA) CANDIDAT (E) :'); champ(x + 4, 543, 582, '');
    if (eleve.signature_image) out.push('<img src="' + eleve.signature_image + '" alt="Signature du candidat" style="position:absolute;left:' + X(x + 30) + ';top:' + Y(568) + ';height:' + (17 * KY).toFixed(1) + 'pt">');
    /* très important */
    lab(28, 605, 'TRÈS IMPORTANT :', 8.3, TXT);
    out.push('<div style="position:absolute;left:' + X(28) + ';top:' + Y(608) + ';width:525pt;font:6.4pt/7.3pt \'Times New Roman\',Times,serif;color:' + TXT + '">'
      + NOTES_CEP.map((n, k) => '<div style="padding-left:8pt;text-indent:-8pt;margin-bottom:.5pt">' + (k + 1) + '. ' + echapper(n) + '</div>').join('') + '</div>');
    lab(375, 668, 'Certifié à', 8, TXT, false); champ(413, 470, 668, contexte.commune || ecole.commune, 8);
    lab(470, 668, ', le', 8, TXT, false); champ(486, 551, 668, auj, 8);
    /* agent de la DDEMP */
    out.push('<div style="position:absolute;left:' + X(28) + ';top:' + Y(694) + ';width:280pt;height:' + (75 * KY).toFixed(1) + 'pt;background:#FAF5ED;border:.7pt solid #DED6BF;box-sizing:border-box"></div>');
    out.push('<div style="position:absolute;left:' + X(28) + ';top:' + Y(694) + ';width:280pt;height:' + (16 * KY).toFixed(1) + 'pt;background:' + OR + ';border-radius:3pt;color:#fff;font:700 8.3pt \'Times New Roman\',Times,serif;line-height:' + (16 * KY).toFixed(1) + 'pt;padding-left:11pt;box-sizing:border-box">AGENT DE LA DDEMP</div>');
    ['DOSSIER ÉTUDIÉ PAR :', 'CODE :', 'COLLATIONNÉ PAR :'].forEach((t, k) => { const yy = 726 + 18 * k; const xx = lab(36, yy, t, 7); champ(xx + 4, 300, yy, [fiche.dossier_etudie_par, fiche.code_ddemp, fiche.collationne_par][k]); });
    /* le directeur : titre, cachet, signature, nom */
    const titreDir = /^LA /i.test(ecole.cachet_centre || '') ? 'LA DIRECTRICE' : 'LE DIRECTEUR';
    txt(0, 714, titreDir, { centre: 358, taille: 8.3, coul: TXT });
    txt(0, 735, '(Nom, prénom, signature et', { centre: 358, taille: 5.5, coul: GRIS, gras: false, italique: true });
    txt(0, 743, 'cachet du Directeur)', { centre: 358, taille: 5.5, coul: GRIS, gras: false, italique: true });
    out.push('<div style="position:absolute;left:' + X(408) + ';top:' + Y(698) + ';width:64pt;height:64pt">' + cachet(ecole, { taille: 64 }) + '</div>');
    const griffeDir = D.griffeEcole(ecole, 120);
    if (griffeDir && (ecole.cachet_type || 'ROND_ET_GRIFFE') !== 'ROND') out.push('<div style="position:absolute;left:' + X(476) + ';top:' + Y(702) + ';width:76pt">' + griffeDir.replace('<svg class="griffe"', '<svg class="griffe" style="width:76pt;height:auto"') + '</div>');
    if (signataire && signataire.signature_image) out.push('<img src="' + signataire.signature_image + '" alt="Signature du directeur" style="position:absolute;left:' + X(418) + ';top:' + Y(708) + ';width:110pt;height:' + (40 * KY).toFixed(1) + 'pt;object-fit:contain">');
    out.push('<div style="position:absolute;left:' + X(397) + ';top:' + Y(750) + ';width:154pt;border-top:.6pt solid ' + BORD + '"></div>');
    txt(0, 760, contexte.directeur || ecole.directeur_nom || (signataire ? ((signataire.prenoms || '') + ' ' + (signataire.nom || '')).trim() : ''), { centre: 474, taille: 8.3, coul: TXT });
    return '<div class="fiche-cep-officielle" style="-webkit-print-color-adjust:exact;print-color-adjust:exact;position:relative;width:535pt;height:' + (772 * KY).toFixed(0) + 'pt;margin:0 auto;overflow:hidden;color:' + TXT + '">' + out.join('') + '</div>';
  }
  const NOTES_CEP = [
    'Les Directeurs d’écoles doivent remplir les fiches d’inscription conformément aux informations telles qu’inscrites sur les actes de naissance. Ils doivent collationner les différentes listes envoyées par la DDEMP afin que la liste d’inscription porte la bonne graphie des noms et prénoms, date et lieu de naissance, sexe et école de provenance des candidats.',
    'Les Directeurs doivent s’assurer que sur les listes d’inscription, le nom de leur école est exclusivement porté devant chacun de leurs candidats afin de garantir la fiabilité des statistiques des résultats par école.',
    'Les Directeurs doivent associer les parents d’élèves aux choix des établissements d’accueil de l’enseignement secondaire en cas de succès.'
  ];
  let _mes = null;
  function largeurTimes(t, taille, gras) {
    try { _mes = _mes || document.createElement('canvas').getContext('2d'); _mes.font = (gras ? 'bold ' : '') + taille + 'pt "Times New Roman", Times, serif'; return _mes.measureText(t).width * 0.75; }
    catch (e) { return t.length * taille * 0.55; }
  }

  /* Feuille de style embarquée dans la fenêtre d'impression. */

  /* =======================================================================
     Fiche d'inscription de l'élève, avec sa carte d'identité scolaire
     (même principe que SCOLARIS et GESCOL : photo prise à l'appareil,
     identité, scolarité, parents, puis la carte recto-verso à découper).
     L'en-tête du MEMP, la signature, le cachet rond et le cachet
     rectangulaire du directeur et le QR de vérification sont ajoutés à
     l'impression comme pour toute pièce administrative.
     ======================================================================= */
  function ficheInscription(eleve, ins, ecole, annee, numeroCarte, contexte, signataire) {
    eleve = eleve || {}; ins = ins || {}; ecole = ecole || {};
    const v = x => (x === null || x === undefined || x === '') ? '<span class="vide-ligne">……………………………</span>' : echapper(x);
    const oui = b => b ? 'Oui' : 'Non';
    const ligne = (k, val) => '<tr><td>' + echapper(k) + '</td><th>' + val + '</th></tr>';
    const photo = eleve.photo
      ? '<img class="fi-photo" src="' + eleve.photo + '" alt="Photo de l’élève">'
      : '<div class="fi-photo fi-photo-vide">Photo<br>d’identité</div>';
    const TYPES = { NOUVELLE: 'Nouvelle inscription', REINSCRIPTION: 'Réinscription', TRANSFERT: 'Transfert' };
    return '<div class="fiche-inscription">'
      + '<h2 class="fi-titre">FICHE D’INSCRIPTION — ANNÉE SCOLAIRE ' + echapper(annee) + '</h2>'
      + '<div class="fi-haut">' + photo + '<table class="fi-table"><tbody>'
      + ligne('Nom', '<strong>' + v((eleve.nom || '').toUpperCase()) + '</strong>')
      + ligne('Prénoms', v(eleve.prenoms))
      + ligne('Sexe', eleve.sexe === 'F' ? 'Féminin' : eleve.sexe === 'M' ? 'Masculin' : v(''))
      + ligne('Date et lieu de naissance', (eleve.date_naissance ? echapper(U.dateCourte(eleve.date_naissance)) : v('')) + ' à ' + v(eleve.lieu_naissance || eleve.commune_naissance))
      + ligne('Nationalité', v(eleve.nationalite))
      + ligne('NPI / matricule EDUCMaster', v(eleve.npi || eleve.educmaster_matricule))
      + ligne('Acte de naissance fourni', oui(eleve.acte_naissance))
      + '</tbody></table></div>'
      + '<h3 class="fi-rubrique">Scolarité</h3><table class="fi-table"><tbody>'
      + ligne('École', '<strong>' + v(ecole.nom) + '</strong>' + (ecole.code_ecole ? ' (' + echapper(ecole.code_ecole) + ')' : ''))
      + ligne('Circonscription / département', v([contexte && contexte.circonscription, contexte && contexte.departement].filter(Boolean).join(' — ')))
      + ligne('Cours / classe', v(ins.niveau))
      + ligne('Type d’inscription', v(TYPES[ins.type_inscription] || ins.type_inscription))
      + ligne('Date d’inscription', ins.date_inscription ? echapper(U.dateCourte(ins.date_inscription)) : v(''))
      + ligne('Redoublant(e) · A suivi la maternelle', oui(ins.redoublant) + ' · ' + oui(ins.a_suivi_maternelle))
      + '</tbody></table>'
      + '<h3 class="fi-rubrique">Parents ou tuteur</h3><table class="fi-table"><tbody>'
      + ligne('Père', v(eleve.nom_pere))
      + ligne('Mère', v(eleve.nom_mere))
      + ligne('Tuteur (si différent)', v(eleve.tuteur_nom))
      + ligne('Téléphone des parents / du tuteur', v(eleve.tuteur_telephone))
      + ligne('Adresse', v(eleve.adresse_parents))
      + '</tbody></table>'
      + D.blocActeurs([{ personne: { nom: eleve.nom || '', prenoms: eleve.prenoms || '', signature_image: eleve.signature_image || '' }, mention: 'L’élève' },
        { personne: D.parentDe(eleve), mention: 'Le parent ou le tuteur' }])
      + '<h3 class="fi-rubrique">Carte d’identité scolaire (à découper)</h3>'
      + '<div class="planche-cartes fi-cartes">' + carteScolaire(eleve, ins, ecole, annee, numeroCarte, signataire)
      + carteScolaireVerso(eleve, ins, ecole, annee, numeroCarte, contexte) + '</div>'
      + '</div>';
  }

  Object.assign(EG.Docs, {
    carteScolaire, carteScolaireVerso, ficheInscription, certificatScolarite, ficheCEP, ficheEvaluationAgent,
    CRITERES_EVALUATION, classePerformance
  });
})(window);
