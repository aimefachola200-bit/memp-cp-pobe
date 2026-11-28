/* République du Bénin — MEMP — Application CP — Configuration
   Conception : Maître Aimé FACHOLA — Tél. +229 01 96 51 03 33 */
export const APP = {
  name: "Espace CP — ÉduGestion Pro Master",
  full: 'Application CP — Gestion pédagogique',
  version: '2.7.2',
  republique: 'RÉPUBLIQUE DU BÉNIN',
  ministere: 'MINISTÈRE DES ENSEIGNEMENTS MATERNEL ET PRIMAIRE',
  concepteur: 'Maître Aimé FACHOLA',
  concepteurTel: '+229 01 96 51 03 33',
  concepteurTelRaw: '0196510333',
};
/* Variante de l'application. L'application jumelle d'une circonscription (ex. CS Pobè) remplace ce bloc
   (tools/creer-jumelle.mjs) : nom, base de données locale distincte, données de départ (écoles, personnel, zones). */
export const VARIANT = {
  "id": "edugestion-master",
  "titre": "Espace CP, CCS et DDEMP — ÉduGestion Pro Master",
  "base": "edugestion-master-memp-cp",
  "seed": null,
  "comptes": [],
  "integre": {
    "bases": [
      "edugestion_pro_master",
      "edugestion_pro"
    ],
    "retour": "../index.html"
  }
};
export const CREDIT = `Conçu par ${APP.concepteur} · Tél. ${APP.concepteurTel}`;
/* Mention discrète portée en pied des documents administratifs (pas de téléphone). */
export const CREDIT_DOC = `Conception : ${APP.concepteur}`;
