/* République du Bénin — MEMP — Application CP — Configuration
   Conception : Maître Aimé FACHE — Tél. 01 96 51 03 33 */
export const APP = {
  name: "Application CP — CS Pobè",
  full: 'Application CP — Gestion pédagogique',
  version: '1.10.0',
  republique: 'RÉPUBLIQUE DU BÉNIN',
  ministere: 'MINISTÈRE DES ENSEIGNEMENTS MATERNEL ET PRIMAIRE',
  concepteur: 'Maître Aimé FACHE',
  concepteurTel: '01 96 51 03 33',
  concepteurTelRaw: '0196510333',
};
/* Variante de l'application. L'application jumelle d'une circonscription (ex. CS Pobè) remplace ce bloc
   (tools/creer-jumelle.mjs) : nom, base de données locale distincte, données de départ (écoles, personnel, zones). */
export const VARIANT = {
  "id": "pobe",
  "titre": "Circonscription scolaire de Pobè",
  "base": "memp-cp-pobe",
  "seed": "data/seed-pobe.json",
  "comptes": [
    [
      "admin",
      "admin123"
    ],
    [
      "ccs",
      "ccs123"
    ],
    [
      "cp1",
      "cp123"
    ],
    [
      "cp2",
      "cp123"
    ],
    [
      "cp3",
      "cp123"
    ]
  ]
};
export const CREDIT = `Conçu par ${APP.concepteur} · Tél. ${APP.concepteurTel}`;
