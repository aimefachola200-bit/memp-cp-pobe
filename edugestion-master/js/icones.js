/* Jeu d'icônes communes (dessins au trait originaux, SVG 24 × 24, trait = couleur du texte) — à la place des émojis.
   Même fichier dans CS Pobè, Mon école, MEMP-CP, DOSP, MEMP-CP Pobè, ÉduGestion Pro Master / Master ; les noms et les dessins sont
   repris par SCOLARIS et GESCOL (voir outils/lots/spec.md, « Icônes »).
   Icones.icone(nom, { taille, titre, classe }) → SVG (aria-hidden, ou role="img" + <title> si titre).
   Dans le code des applications, un caractère de la zone privée U+E000… (Icones.code(nom)) marque une icône dans un texte :
   il est remplacé par le dessin à l'affichage (boutons, menus, tuiles, messages, documents imprimés) et retiré ailleurs
   (listes déroulantes, info-bulles, boîtes alert / confirm, Excel, liens de partage, presse-papiers, textes des PDF).
   Conception : Maître Aimé FACHOLA */
(function (global) {
  'use strict';
  if (global.Icones) return;
  /* nom : tracés (chemins « d » séparés par « | » ; « c:cx,cy,r » cercle ; « r:x,y,l,h,rx » rectangle) */
  const D = {
    accueil: 'M3 11l9-7 9 7|M5 10v10h14V10|M10 20v-6h4v6',
    ajouter: 'M12 5v14|M5 12h14',
    fermer: 'M6 6l12 12|M18 6L6 18',
    valider: 'M5 12.5l4.5 4.5L19 7.5',
    'valider-cercle': 'c:12,12,9|M7.5 12.3l3 3 6-6.3',
    supprimer: 'M4 7h16|M9 7V4h6v3|M6 7l1 13h10l1-13|M10 11v6|M14 11v6',
    modifier: 'M4 20l1-4L16 5l3 3L8 19z|M14 7l3 3',
    enregistrer: 'M5 4h11l3 3v13H5z|M8 4v5h7V4|r:8,13,8,7,0.5',
    imprimer: 'M7 9V4h10v5|r:4,9,16,7,1.5|M7 14h10v6H7z|M17 12h.01',
    telecharger: 'M12 4v11|M7 10l5 5 5-5|M5 20h14',
    televerser: 'M12 20V9|M7 14l5-5 5 5|M5 4h14',
    importer: 'M4 14v5h16v-5|M12 4v10|M8 10l4 4 4-4',
    exporter: 'M4 14v5h16v-5|M12 14V4|M8 8l4-4 4 4',
    document: 'M6 3h8l4 4v14H6z|M14 3v4h4|M9 12h6|M9 16h6',
    fiche: 'M6 3h9l3 3v15H6z|M9 9h6|M9 13h4|M12.5 19l1-3 4-4 2 2-4 4z',
    'presse-papiers': 'r:5,5,14,16,1.5|M9 3h6v4H9z|M8.5 12h7|M8.5 16h5',
    'bloc-notes': 'r:5,4,14,17,1.5|M8 2v4|M12 2v4|M16 2v4|M8 11h8|M8 15h6',
    classeur: 'M3 8h18v12H3z|M5 8V5h5l2 3|M7 12h10|M7 16h6',
    fichier: 'r:3,6,18,13,1.5|M7 6V4h10v2|c:9,12.5,2|M13 11h4|M13 14h4|M6.5 17c.6-1.5 4.4-1.5 5 0',
    dossier: 'M3 6h6l2 2h10v11H3z',
    'dossier-ouvert': 'M3 6h6l2 2h8v3|M3 6v13h15l3-8H7l-4 8',
    graphique: 'M4 20h16|M6 20v-6|M10 20V8|M14 20v-9|M18 20V5',
    courbe: 'M4 20h16|M4 4v16|M6 16l4-5 3 3 6-7|M15 7h4v4',
    calendrier: 'r:3,5,18,16,1.5|M3 10h18|M8 3v4|M16 3v4|M7 14h2|M11 14h2|M15 14h2|M7 17h2|M11 17h2',
    horloge: 'c:12,12,9|M12 7v5l3 2',
    sablier: 'M7 3h10|M7 21h10|M8 3c0 5 8 6 8 9s-8 4-8 9|M16 3c0 5-8 6-8 9s8 4 8 9',
    reveil: 'c:12,13,7|M12 10v3l2 1.5|M5 4L3 6|M19 4l2 2',
    chrono: 'c:12,14,7|M12 14v-3|M10 3h4|M12 3v4|M18 7l1.5-1.5',
    groupe: 'c:9,8,3|M3.5 19c.6-3.4 3-5 5.5-5s4.9 1.6 5.5 5|c:16.5,9,2.5|M15 14c3 0 5 1.5 5.5 4.5',
    personne: 'c:12,8,4|M5 20c.8-4 3.7-6 7-6s6.2 2 7 6',
    enseignant: 'c:7,8,2.6|M2.8 19c.4-3 2.2-4.6 4.2-4.6S10.8 16 11.2 19|r:12,4,9,8,0.8|M12 16l4-4|M14 12h7',
    eleve: 'c:12,7,3.2|M7 21v-4c0-2.8 2.2-5 5-5s5 2.2 5 5v4|M9 21v-3|M15 21v-3',
    diplome: 'M2 9l10-5 10 5-10 5z|M6 11v5c3 2.5 9 2.5 12 0v-5|M21 9v6',
    cartable: 'M6 8h12a2 2 0 0 1 2 2v9H4v-9a2 2 0 0 1 2-2z|M9 8V5h6v3|M4 13h16|M11 13v2h2v-2',
    ecole: 'M3 21h18|M5 21V10l7-5 7 5v11|M10 21v-5h4v5|M12 5V2h3|c:12,11,1.6',
    institution: 'M3 21h18|M4 18h16|M4 9h16|M12 3l9 5H3z|M6 9v9|M10 9v9|M14 9v9|M18 9v9',
    batiment: 'r:5,3,14,18,1|M9 7h2|M13 7h2|M9 11h2|M13 11h2|M9 15h2|M13 15h2|M11 21v-3h2v3',
    quartier: 'M2 21h20|M3 21v-8l5-4 5 4v8|M13 21v-6h8v6|M7 21v-4h2v4|M16 11l3-3 3 3',
    chantier: 'M4 21h16|M7 21V5|M7 5h12|M7 8l4-3|M17 5v5|r:15.5,10,3,3,0.5|M10 21v-5h4v5',
    stade: 'M2 12c0-4 4.5-6 10-6s10 2 10 6-4.5 6-10 6S2 16 2 12z|M6 12c0-2 2.6-3 6-3s6 1 6 3-2.6 3-6 3-6-1-6-3z|M12 6v3|M12 15v3',
    chaise: 'M7 3v9h10|M7 12v9|M17 12v9|M7 16h10|M7 3h3',
    signature: 'M3 17c3-1 4-9 6-9s1 8 3 8 2-5 4-5 1 3 2 3h3|M3 21h18',
    rechercher: 'c:10.5,10.5,6.5|M15.5 15.5L21 21',
    'carte-identite': 'r:3,5,18,14,1.8|c:8.5,11,2.2|M5.5 16c.6-1.8 5.4-1.8 6 0|M14 10h4|M14 13h4|M14 16h2',
    repere: 'M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z|c:12,10,2.3',
    epingle: 'M9 3h6|M10 3v6l-3 4h10l-3-4V3|M12 13v8',
    cible: 'c:12,12,9|c:12,12,5|c:12,12,1.2',
    attestation: 'M6 4h11a2 2 0 0 1 2 2v12|M6 4a2 2 0 0 0-2 2v1h3|M7 6v12a2 2 0 0 1-2 2h11a2 2 0 0 0 2-2|M10 9h6|M10 12h6|M10 15h3',
    livre: 'M4 5h5a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4z|M20 5h-5a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h6z',
    livres: 'r:3,4,4,16,0.8|r:8,4,4,16,0.8|M14 6l3.8-1 4 14.6-3.8 1z|M3 8h4|M8 8h4',
    cle: 'c:8,14,4|M11 11l9-9|M17 5l2 2|M15 7l2 2',
    cadenas: 'r:5,10,14,11,1.8|M8 10V7a4 4 0 0 1 8 0v3|M12 14v3',
    deverrouiller: 'r:5,10,14,11,1.8|M8 10V7a4 4 0 0 1 7.6-1.8|M12 14v3',
    message: 'M4 5h16v11H9l-5 4z|M8 9h8|M8 12h5',
    interdit: 'c:12,12,9|M5.6 5.6l12.8 12.8',
    retour: 'M9 14l-5-5 5-5|M4 9h10a6 6 0 0 1 0 12h-3',
    precedent: 'M15 5l-7 7 7 7',
    suivant: 'M9 5l7 7-7 7',
    'fleche-droite': 'M4 12h15|M13 6l6 6-6 6',
    ouvrir: 'M14 4h6v6|M20 4l-9 9|M18 14v6H4V6h6',
    photo: 'M4 8h3l2-3h6l2 3h3v12H4z|c:12,13.5,3.5',
    suggestion: 'M12 3v4|M12 17v4|M3 12h4|M17 12h4|M12 9l1 2 2 1-2 1-1 2-1-2-2-1 2-1z|M18 4l.5 1.5L20 6l-1.5.5L18 8l-.5-1.5L16 6l1.5-.5z',
    menu: 'M4 6h16|M4 12h16|M4 18h16',
    balance: 'M12 4v16|M8 20h8|M5 7h14|M5 7l-3 7h6z|M19 7l-3 7h6z|c:12,4,1',
    calcul: 'r:5,3,14,18,2|r:8,6,8,4,0.5|M8.5 13.5h.01|M12 13.5h.01|M15.5 13.5h.01|M8.5 17h.01|M12 17h.01|M15.5 17h.01',
    alerte: 'M12 3l10 18H2z|M12 10v5|M12 18h.01',
    boussole: 'c:12,12,9|M15.5 8.5l-2 5-5 2 2-5z',
    voir: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z|c:12,12,3',
    accord: 'M3 11l4-4 5 3 5-3 4 4|M7 7l-4 5 6 6 2-2|M17 7l4 5-6 6-3-3|M10 13l2 2|M12 11l3 3',
    telephone: 'r:7,2,10,20,2|M11 18h2',
    image: 'r:3,4,18,16,1.5|c:9,9.5,1.8|M3 17l5-5 4 4 3-3 6 6',
    insigne: 'c:12,9,6|c:12,9,2.5|M8.5 14L7 22l5-2.5 5 2.5-1.5-8',
    carte: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z|M9 4v14|M15 6v14',
    monde: 'c:12,12,9|M3 12h18|M12 3c3 3.5 3 14.5 0 18|M12 3c-3 3.5-3 14.5 0 18',
    balai: 'M14 3l-4 9|M7 12h7l3 9H4z|M8 16l-1 5|M12 16v5',
    recu: 'M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z|M9 8h6|M9 12h6|M9 16h3',
    trophee: 'M8 4h8v5a4 4 0 0 1-8 0z|M8 6H4v1a4 4 0 0 0 4 4|M16 6h4v1a4 4 0 0 1-4 4|M12 13v4|M8 21h8|M9 17h6v4H9z',
    medaille: 'M8 3l4 7 4-7|M6 3h4|M14 3h4|c:12,15,5|M12 12.5l.8 1.6 1.7.2-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.2z',
    argent: 'r:3,6,18,12,1.5|c:12,12,3|M6 9h.01|M18 15h.01',
    courrier: 'r:3,5,18,14,1.5|M3 7l9 6 9-6',
    annonce: 'M3 10v4h3l7 4V6L6 10z|M16 9a4 4 0 0 1 0 6|M19 6a8 8 0 0 1 0 12',
    reglages: 'c:12,12,3|M12 2v3|M12 19v3|M2 12h3|M19 12h3|M4.9 4.9L7 7|M17 17l2.1 2.1|M4.9 19.1L7 17|M17 7l2.1-2.1',
    outils: 'M14.5 6.5a4 4 0 0 1-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2-2z',
    lien: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1|M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    puzzle: 'M4 8h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4h-4a2 2 0 1 0-4 0H4v-4a2 2 0 1 0 0-4z',
    cloche: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4z|M10 20a2 2 0 0 0 4 0',
    etiquette: 'M3 12V4h8l10 10-8 8z|c:7.5,8.5,1.5',
    echange: 'M4 9h16|M16 5l4 4-4 4|M20 15H4|M8 11l-4 4 4 4',
    actualiser: 'M20 11a8 8 0 0 0-14.6-4.5L3 9|M3 4v5h5|M4 13a8 8 0 0 0 14.6 4.5L21 15|M21 20v-5h-5',
    melanger: 'M3 7h4l10 10h4|M3 17h4l3-3|M14 10l3-3h4|M18 4l3 3-3 3|M18 14l3 3-3 3',
    eclair: 'M13 2L5 14h6l-1 8 8-12h-6z',
    repas: 'M4 13h16a8 8 0 0 1-16 0z|M2 21h20|M8 9c0-2 2-2 2-4|M12 9c0-2 2-2 2-4',
    nouveau: 'M12 3l2.4 5.2 5.6.6-4.2 3.8 1.2 5.5L12 15.3 7 18.1l1.2-5.5L4 8.8l5.6-.6z',
    etoile: 'M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6L12 16.4l-5.4 2.9 1.3-6-4.6-4.1 6.1-.6z',
    nuage: 'M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z',
    science: 'M9 3h6|M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3|M7.5 15h9',
    trombone: 'M8 12l6-6a3 3 0 0 1 4.2 4.2l-7.5 7.5a5 5 0 0 1-7-7L11 3.5',
    regle: 'M3 17L17 3l4 4L7 21z|M7 13l2 2|M10 10l2 2|M13 7l2 2',
    camion: 'M2 6h11v10H2z|M13 9h4l4 4v3h-8|c:6,18,2|c:17,18,2',
    brique: 'r:3,5,18,14,0.5|M3 9.7h18|M3 14.3h18|M9 5v4.7|M15 5v4.7|M6 9.7v4.6|M12 9.7v4.6|M18 9.7v4.6|M9 14.3V19|M15 14.3V19',
    cerveau: 'M12 5a3 3 0 0 0-5.5 1.5A3 3 0 0 0 4 11a3 3 0 0 0 1.5 5.5A3 3 0 0 0 12 19z|M12 5a3 3 0 0 1 5.5 1.5A3 3 0 0 1 20 11a3 3 0 0 1-1.5 5.5A3 3 0 0 1 12 19|M12 5v14',
    enfants: 'c:8,6,2.2|c:16,7,1.8|M5 21l1-5-2-3 4-4 3 3|M14 21v-4l-1-3 3-3 3 3|M2 21h20',
    bienvenue: 'c:12,12,9|M8.5 14a4 4 0 0 0 7 0|M9 9.5h.01|M15 9.5h.01',
    confrontation: 'M4 4l10 10|M14 18l4-4|M16 16l4 4|M20 4L10 14|M10 18l-4-4|M8 16l-4 4',
    securite: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z|M9 12l2 2 4-4',
    'feu-tricolore': 'r:8,2,8,20,2|c:12,7,1.6|c:12,12,1.6|c:12,17,1.6',
    pause: 'M9 5v14|M15 5v14',
    vacances: 'M12 22V10|M12 10C8 6 4 7 3 9|M12 10c4-4 8-3 9-1|M12 10c-2-3-1-6 1-7|M4 22h16',
    drapeau: 'M5 21V4|M5 4h14v10H5|M10 4v10|M10 9h9',
    eau: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z|M9 15a3 3 0 0 0 3 3',
    colis: 'M3 7l9-4 9 4v10l-9 4-9-4z|M3 7l9 4 9-4|M12 11v10|M7.5 5l9 4',
    accessibilite: 'c:12,4,1.8|M8 8h8|M12 8v6h4l2 5|M9.5 11.5a5 5 0 1 0 6 6.5',
    urne: 'M4 11h16v10H4z|M8 11V5h8v6|M10 8h4|M9 15h6',
    cadeau: 'r:3,9,18,4,0.5|M5 13v8h14v-8|M12 9v12|M12 9c-2-4-6-4-6-1s4 1 6 1c2 0 6 2 6-1s-4-3-6 1',
    ordinateur: 'r:4,4,16,11,1.2|M2 19h20|M9 15l-1 4|M15 15l1 4',
    case: 'r:4,4,16,16,2',
    porte: 'M5 21V3h11v18|M3 21h18|M13 12h.01|M16 6l3 1v14',
    texte: 'M4 18L9 5l5 13|M5.5 14h7|M15 10h6|M15 14h5|M15 18h6',
    monter: 'M6 15l6-6 6 6|M6 9l6-6 6 6',
    point: 'c:12,12,5',
    ballon: 'c:12,12,9|M12 8l3.3 2.4-1.3 3.9h-4l-1.3-3.9z|M12 3v5|M21 10l-5.7.4|M3 10l5.7.4|M16.8 19.3l-2.8-5|M7.2 19.3l2.8-5',
    de: 'r:4,4,16,16,3|M8.5 8.5h.01|M15.5 8.5h.01|M12 12h.01|M8.5 15.5h.01|M15.5 15.5h.01',
    prevision: 'c:12,10,7|M7 21h10|M9 17l-1 4|M15 17l1 4|M9.5 8a3 3 0 0 1 3-2',
    info: 'c:12,12,9|M12 11v6|M12 7.5h.01',
    extincteur: 'r:8,8,8,13,2|M10 8V5h4v3|M14 5h3l2 2|M12 3v2',
    adn: 'M7 3c0 6 10 6 10 12s-10 6-10 6|M17 3c0 6-10 6-10 12s10 6 10 6|M8 7h8|M8 17h8|M9.5 12h5',
    inscription: 'r:4,3,16,18,1.5|M8 8h8|M8 12h8|M8 16l2 2 4-4',
    sante: 'r:3,7,18,13,1.5|M9 7V4h6v3|M12 10.5v6|M9 13.5h6',
    infirmerie: 'M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6-8 11-8 11z|M12 9v6|M9 12h6',
    formation: 'r:3,4,18,12,1|M7 20l3-4|M17 20l-3-4|M7 9h6|M7 12h10',
    inspection: 'r:5,3,12,17,1.5|M8 8h6|M8 11h4|c:16,16,3|M18.2 18.2L21 21',
    patrimoine: 'M3 21h18|M5 21V9l7-4 7 4v12|M9 13h6v8H9z|M9 17h6',
    examen: 'M6 3h12v18H6z|M9 7h6|M9 11h6|M9 15l1.5 1.5L14 13'
  };
  const NOMS = Object.keys(D);
  const BASE = 0xE000;
  const code = (nom) => { const i = NOMS.indexOf(nom); return i < 0 ? '' : String.fromCharCode(BASE + i); };
  const nomDe = (c) => NOMS[c.charCodeAt(0) - BASE] || '';
  const PUA = /[-]/;
  const PUA_G = /[-]\s?/g;
  const escA = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function tracer(d) {
    return d.split('|').map(t => {
      if (t.startsWith('c:')) { const [cx, cy, r] = t.slice(2).split(','); return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>'; }
      if (t.startsWith('r:')) { const [x, y, w, hh, rx] = t.slice(2).split(','); return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + hh + '" rx="' + (rx || 0) + '"/>'; }
      return '<path d="' + t + '"/>';
    }).join('');
  }
  /** Dessin d'une icône (SVG) */
  function icone(nom, o) {
    o = o || {};
    const d = D[nom] || D.point, t = o.taille ? ' width="' + o.taille + '" height="' + o.taille + '" style="width:' + o.taille + 'px;height:' + o.taille + 'px"' : '';
    const acc = o.titre ? ' role="img" aria-label="' + escA(o.titre) + '"><title>' + escA(o.titre) + '</title>' : ' aria-hidden="true" focusable="false">';
    return '<svg class="ico ico-' + nom + (o.classe ? ' ' + o.classe : '') + '" data-ico="' + nom + '" viewBox="0 0 24 24"' + t + ' fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"' + acc + tracer(d) + '</svg>';
  }
  /** Texte sans marques d'icônes (listes, info-bulles, Excel, liens…) */
  const texte = (s) => (typeof s === 'string' && PUA.test(s) ? s.replace(PUA_G, '').replace(/^\s+/, '') : s);
  /** HTML où chaque marque d'icône devient son dessin */
  const html = (s) => (typeof s === 'string' && PUA.test(s) ? s.replace(/[-]/g, (c) => icone(nomDe(c))) : s);
  global.Icones = { icone, code, nomDe, texte, html, NOMS, DESSINS: D, BASE };

  if (typeof document === 'undefined') return;
  /* ---------- affichage : marques → dessins, partout dans la page ---------- */
  const SANS_DESSIN = { OPTION: 1, OPTGROUP: 1, TITLE: 1, TEXTAREA: 1, text: 1, textPath: 1, tspan: 1 };
  const IGNORER = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1 };
  const ATTRS = ['title', 'placeholder', 'aria-label', 'alt', 'value', 'label', 'data-tip'];
  function noeudTexte(n) {
    const v = n.nodeValue; if (!v || !PUA.test(v)) return;
    const p = n.parentNode; if (!p || IGNORER[p.nodeName]) return;
    if (SANS_DESSIN[p.nodeName] || (p.namespaceURI && p.namespaceURI !== 'http://www.w3.org/1999/xhtml')) { n.nodeValue = texte(v); return; }
    const frag = document.createDocumentFragment(); let dernier = 0;
    v.replace(/[-]/g, (c, i) => {
      if (i > dernier) frag.append(document.createTextNode(v.slice(dernier, i)));
      const t = document.createElement('template'); t.innerHTML = icone(nomDe(c)); frag.append(t.content.firstChild);
      dernier = i + 1; return c;
    });
    if (dernier < v.length) frag.append(document.createTextNode(v.slice(dernier)));
    p.replaceChild(frag, n);
  }
  function attributs(el) { for (const a of ATTRS) { const v = el.getAttribute && el.getAttribute(a); if (v && PUA.test(v)) el.setAttribute(a, texte(v)); } }
  function parcourir(r) {
    if (!r) return;
    if (r.nodeType === 3) { noeudTexte(r); return; }
    if (r.nodeType !== 1 && r.nodeType !== 11) return;
    if (r.nodeType === 1) { if (IGNORER[r.nodeName]) return; attributs(r); }
    const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT), l = [];
    while (w.nextNode()) { const n = w.currentNode; if (n.nodeType === 1) attributs(n); else if (PUA.test(n.nodeValue)) l.push(n); }
    l.forEach(noeudTexte);
  }
  const obs = new MutationObserver(ms => ms.forEach(m => {
    if (m.type === 'characterData') noeudTexte(m.target);
    else if (m.type === 'attributes') attributs(m.target);
    else m.addedNodes.forEach(parcourir);
  }));
  const demarrer = () => { parcourir(document.documentElement); obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS }); };
  if (document.documentElement) demarrer(); else document.addEventListener('DOMContentLoaded', demarrer);
  const st = document.createElement('style');
  st.textContent = 'svg.ico{width:1.15em;height:1.15em;vertical-align:-.2em;flex:none;display:inline-block}';
  (document.head || document.documentElement).append(st);
  /* ---------- sorties sans dessin : boîtes natives, Excel, liens, presse-papiers, canevas ---------- */
  ['alert', 'confirm', 'prompt'].forEach(f => { const o = global[f]; if (typeof o === 'function') global[f] = function (m, ...r) { return o.call(this, texte(String(m == null ? '' : m)), ...r); }; });
  const enc = global.encodeURIComponent; global.encodeURIComponent = (s) => enc(texte(String(s)));
  if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) { const w = navigator.clipboard.writeText.bind(navigator.clipboard); navigator.clipboard.writeText = (t) => w(texte(String(t))); }
  if (global.CanvasRenderingContext2D) ['fillText', 'strokeText', 'measureText'].forEach(f => { const o = CanvasRenderingContext2D.prototype[f]; CanvasRenderingContext2D.prototype[f] = function (t, ...r) { return o.call(this, texte(String(t)), ...r); }; });
  /* fichiers produits (HTML pour Word, CSV, texte) : dessins dans le HTML, marques retirées ailleurs */
  if (global.Blob) {
    const B = global.Blob;
    const conv = (parts, opts) => { const html = /html|svg/.test((opts && opts.type) || ''); return Array.isArray(parts) ? parts.map(x => typeof x === 'string' ? (html ? Icones.html(x) : texte(x)) : x) : parts; };
    class BlobIcones extends B { constructor(parts, opts) { super(conv(parts, opts), opts); } }
    global.Blob = BlobIcones;
  }
  /* fenêtres d'impression ouvertes par l'application : dessins dans le document écrit */
  const ouvrir = global.open;
  if (typeof ouvrir === 'function') global.open = function (...a) {
    const w = ouvrir.apply(this, a);
    try { if (w && w.document) { const wr = w.document.write.bind(w.document), wl = w.document.writeln.bind(w.document); w.document.write = (...x) => wr(...x.map(Icones.html)); w.document.writeln = (...x) => wl(...x.map(Icones.html)); } } catch (e) { /* autre origine */ }
    return w;
  };
})(typeof window !== 'undefined' ? window : globalThis);
