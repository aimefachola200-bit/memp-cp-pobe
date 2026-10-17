/* République du Bénin — MEMP — Référentiel national (valeurs de départ) et types */
export const DEPARTEMENTS = [
  ['ALI', 'ALIBORI', 8, 21], ['ATA', 'ATACORA', 10, 30], ['ATL', 'ATLANTIQUE', 15, 43], ['BOR', 'BORGOU', 13, 38],
  ['COL', 'COLLINES', 9, 29], ['COU', 'COUFFO', 9, 26], ['DON', 'DONGA', 7, 19], ['LIT', 'LITTORAL', 6, 17],
  ['MON', 'MONO', 8, 21], ['OUE', 'OUÉMÉ', 14, 41], ['PLA', 'PLATEAU', 6, 20], ['ZOU', 'ZOU', 13, 38],
];
export const REF_TYPES = {
  departement: { label: 'Départements', fields: [['code', 'Code', 'text', true], ['nom', 'Nom', 'text', true], ['nbCs', 'Nb CS attendues', 'number'], ['nbZones', 'Nb zones attendues', 'number']] },
  cs: { label: 'Circonscriptions scolaires', fields: [['code', 'Code CS (ex. CS118)', 'text', true], ['nom', 'Nom de la CS', 'text', true], ['departement', 'Département', 'text', true, 'dl-departement']] },
  zone: { label: 'Zones pédagogiques', fields: [['code', 'Code zone (ex. CS118-ZP01)', 'text', true], ['numero', 'N° de zone', 'number', true], ['cs', 'Code CS', 'text', true, 'dl-cscode'], ['nom', 'Libellé', 'text']] },
  commune: { label: 'Communes', fields: [['nom', 'Commune', 'text', true], ['departement', 'Département', 'text', false, 'dl-departement']] },
  arrondissement: { label: 'Arrondissements', fields: [['nom', 'Arrondissement', 'text', true], ['commune', 'Commune', 'text', true, 'dl-commune']] },
  localite: { label: 'Villages / quartiers', fields: [['nom', 'Village ou quartier', 'text', true], ['arrondissement', 'Arrondissement', 'text', false, 'dl-arrondissement'], ['commune', 'Commune', 'text', false, 'dl-commune']] },
  up: { label: 'Unités pédagogiques', fields: [['nom', 'Unité pédagogique', 'text', true], ['zone', 'Code zone', 'text', false, 'dl-zonecode'], ['cs', 'Code CS', 'text', false, 'dl-cscode']] },
};
export const SECTEURS = ['Public', 'Privé laïc', 'Privé confessionnel', 'Communautaire'];
export const TYPES_ECOLE = ['Classique', 'Inclusif', 'Spécialisé', 'Autre'];
export const zoneCode = (codeCs, num) => codeCs && num ? `${codeCs}-ZP${String(num).padStart(2, '0')}` : '';
