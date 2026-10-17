/* République du Bénin — MEMP — Définition des fiches (EM rentrée, EM fin d'année, EP fin d'année)
   Structure reprise des documents officiels fournis par le Ministère. */
import { hasNum, num } from './util.js';

export const CLASSES = ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'];
export const STATUTS_FICHE = ['Brouillon', 'Transmise', 'Validée', 'À corriger'];
export const FICHE_TYPES = {
  EM_RENTREE: { label: 'Fiche de rapport de rentrée — Maternelle', court: 'EM · Rentrée', cycle: 'Maternelle', titre: 'FICHE DE RAPPORT DE RENTRÉE DES ÉCOLES MATERNELLES', direction: "DIRECTION DE L'ENSEIGNEMENT MATERNEL" },
  EM_FIN: { label: "Fiche de fin d'année — Maternelle", court: "EM · Fin d'année", cycle: 'Maternelle', titre: "FICHE DE FIN D'ANNÉE DES ÉCOLES MATERNELLES", direction: "DIRECTION DE L'ENSEIGNEMENT MATERNEL" },
  EP_RENTREE: { label: 'Fiche de rapport de rentrée — Primaire', court: 'EP · Rentrée', cycle: 'Primaire', titre: 'FICHE DE RAPPORT DE RENTRÉE DES ÉCOLES PRIMAIRES', direction: "DIRECTION DE L'ENSEIGNEMENT PRIMAIRE" },
  EP_FIN: { label: "Fiche de fin d'année — Primaire", court: "EP · Fin d'année", cycle: 'Primaire', titre: "FICHE DE FIN D'ANNÉE DES ÉCOLES PRIMAIRES", direction: "DIRECTION DE L'ENSEIGNEMENT PRIMAIRE" },
};

const f = (k, l, t = 'text', x = {}) => ({ k, l, t, ...x });
const YN = ['Oui', 'Non'];
const STATUT_ECOLE = ['Public', 'Privé', 'Communautaire'];
const STATUT_ENS = ['FE', 'ACDPE', 'ACE', 'Aspirant', 'CNR', 'Stagiaire', 'Suppléant', 'PRIVE', 'Autre'];
const QUALITE = ['Instituteur', 'Éducateur'];
const col = (k, l, x = {}) => ({ k, l, ...x });
const single = (k, l, x = {}) => ({ k, l, cols: [col('n', '', x)] });   // groupe à une seule colonne
const gft = (k, l, order = ['G', 'F']) => ({ k, l, cols: [...order.map(o => col(o, o)), col('T', 'T', { calc: 'sum:' + order.join(',') })] });

/* ---------------- Schémas EM ---------------- */
function identEM() {
  return {
    id: 'ident', type: 'fields', title: "I. Identification et localisation de l'école",
    fields: [
      f('nom_ecole', "1.1 Nom de l'école", 'text', { auto: 'nom' }),
      f('annee_creation', '1.2 Année de création', 'text', { w: 'half', auto: 'anneeCreation' }), f('ref_creation', 'Référence', 'text', { w: 'half' }),
      f('annee_extension', '1.3 Année dernière extension', 'text', { w: 'half' }), f('ref_extension', 'Référence', 'text', { w: 'half' }),
      f('statut', '1.4 Statut', 'select', { options: ['Public', 'Privé', 'Centre Préscolaire Communautaire'], w: 'half', auto: 'secteur' }),
      f('initiative', "Si communautaire, préciser l'initiative", 'text', { w: 'half' }),
      f('departement', '1.5 Département', 'text', { auto: 'departement', list: 'dl-departement', w: 'half' }),
      f('commune', '1.6 Commune', 'text', { auto: 'commune', list: 'dl-commune', w: 'half' }),
      f('arrondissement', '1.7 Arrondissement', 'text', { auto: 'arrondissement', w: 'half' }),
      f('circonscription', '1.8 Circonscription scolaire', 'text', { auto: 'nomCs', list: 'dl-cs', w: 'half' }),
      f('zone', '1.9 Zone pédagogique', 'text', { auto: 'numZone', w: 'half' }),
      f('up', '1.10 Unité pédagogique', 'text', { auto: 'up', w: 'half' }),
      f('localite', '1.11 Village ou quartier de ville', 'text', { auto: 'localite', w: 'half' }),
      f('adresse', '1.12 Adresse postale', 'text', { w: 'half' }),
      f('contact_dir', '1.13 Contact du Directeur/Directrice', 'text', { w: 'half' }),
    ],
  };
}
function infosEM() {
  return {
    id: 'infos', type: 'fields', title: 'II. Informations générales',
    fields: [
      f('fondateur', '2.1 Nom et prénoms du fondateur/fondatrice (EM privées)'),
      f('directeur', '2.2 Nom et prénoms du Directeur/Directrice', 'text', { auto: 'directeur' }),
      f('sections_aut', '2.3 Nombre de sections autorisées', 'number', { w: 'half' }), f('sections_ouv', 'Nombre de sections ouvertes', 'number', { w: 'half' }),
      f('salles_exist', '2.4 Nombre de salles de classe existantes', 'number', { w: 'half' }), f('salles_util', 'Nombre de salles de classe utilisées', 'number', { w: 'half' }),
      f('cantine', "2.5 L'école dispose-t-elle d'une cantine fonctionnelle ?", 'select', { options: YN, w: 'half' }), f('cantine_org', "Si oui, organisme de soutien", 'text', { w: 'half' }),
      f('lavage', "2.6 Dispositif de lavage de mains fonctionnel ?", 'select', { options: YN, w: 'half' }),
      f('gestion_coll', "2.7 Structure de gestion collégiale ?", 'select', { options: YN, w: 'half' }),
      f('sg_ape', 'APE', 'check', { w: 'q' }), f('sg_ame', 'AME', 'check', { w: 'q' }), f('sg_cd', 'Comité de direction', 'check', { w: 'q' }),
      f('sg_autres', 'Autres à préciser', 'text', { w: 'q' }),
    ],
  };
}
function gridsEM(variant) {
  const rows = variant === 'FIN'
    ? [{ k: 'debut', l: "Effectif au début de l'année" }, { k: 'fin', l: "Effectif en fin d'année" }, { k: 'bes', l: 'Dont enfants à besoin spécifique' }, { k: 'aband', l: 'Abandons' }]
    : [{ k: 'debut', l: "Effectif au début de l'année" }, { k: 'bes', l: 'Dont enfants à besoin spécifique' }];
  const nr = [{ k: 'n', l: 'Nombre' }];
  return [
    { id: 'eff', type: 'grid', title: 'III. Répartition des enfants par section', rows,
      groups: [gft('pet', 'Section des petits', ['F', 'G']), gft('gra', 'Section des grands', ['F', 'G']), { ...gft('tot', "Total de l'école", ['F', 'G']), calc: 'groups' }] },
    { id: 'struct', type: 'grid', title: 'IV. Structure pédagogique', rows: [{ k: 'simple', l: 'Simple' }, { k: 'jumelee', l: 'Jumelée' }, { k: 'multi', l: 'Multigrade' }],
      groups: [single('pet', 'Nombre de sections des petits'), single('gra', 'Nombre de sections des grands'), single('salles', 'Nombre de salles de classe')] },
    { id: 'mat', type: 'grid', title: 'V. Matériel pédagogique', rows: nr,
      groups: [single('paeapem', "Programmes d'activités (PAEAPEM)"), single('guides', 'Guides pédagogiques'), single('jeux', 'Recueils de jeux'), single('autres', 'Autres')] },
    { id: 'infra', type: 'grid', title: 'VI. Infrastructure (écrire le nombre)', rows: [{ k: 'salles', l: 'Salles de classe' }, { k: 'bureau', l: 'Bureau / Magasin' }],
      groups: [{ k: 'g', l: '', cols: [col('a', 'Matériaux définitifs (a)'), col('b', 'Matériaux provisoires (b)'), col('sans', 'Sans mur et sans toit'), col('constr', 'En construction'), col('t', 'Total (a+b)', { calc: 'sum:a,b' })] }] },
    { id: 'mob', type: 'grid', title: 'VII. Mobilier', rows: nr,
      groups: [single('bur', 'Bureaux enseignants'), single('chens', 'Chaises enseignants'), single('arm', 'Armoires et placards'), single('tjeux', 'Tables de jeux'), single('tabl', 'Tablettes'), single('chenf', 'Chaises pour enfants'), single('tenf', 'Tables pour enfants'), single('nattes', 'Nattes'), single('autres', 'Autres (à préciser)')] },
    { id: 'ext', type: 'grid', title: 'VIII. Équipements extérieurs', rows: nr,
      groups: [single('tourn', 'Tourniquet'), single('cage', 'Cage à écureuil'), single('escal', 'Escalier de géant'), single('tobog', 'Toboggan'), single('bac', 'Bac à sable'), single('balanc', 'Balançoire'), single('corde', 'Corde à grimper'), single('tunnel', 'Tunnel'), single('poutre', "Poutre d'équilibre"), single('filet', 'Ensemble filet échelle')],
      extra: [f('autres_ext', 'Autres à préciser')] },
    { id: 'int', type: 'grid', title: 'IX. Équipements intérieurs', rows: nr,
      groups: [single('piste', 'Piste de peinture'), single('encast', 'Encastrement'), single('puzzle', 'Puzzle'), single('graph', 'Matériel de graphisme et de dessin'), single('chev', 'Tableau sur chevalet'), single('muraux', 'Tableaux muraux'), single('pres', 'Présentoir'), single('brico', 'Matériel de bricolage')],
      extra: [f('autres_int', 'Autres à préciser')] },
    { id: 'fonct', type: 'grid', title: 'X. Fonctionnement des structures de gestion', rows: nr,
      groups: [single('ag', 'Assemblée générale'), single('cm', 'Conseil des maîtres'), single('ame', "Réunion AME (Association des Mères d'Enfants)"), single('ape', "Réunion APE (Association des Parents d'Élèves)")] },
  ];
}
function persoEM(variant) {
  const cols = [
    col('matricule', 'N° matricule (1)'), col('nom', 'Nom et prénoms', { w: 220 }),
    col('sexe', 'Sexe (2)', { t: 'select', options: ['M', 'F'], w: 70 }), col('naiss', 'Année de naissance', { t: 'number', w: 90 }),
    col('dip_ac', 'Diplôme académique (3)'), col('dip_pro', 'Diplôme professionnel (3)'), col('grade', 'Grade'),
    col('statut', 'Statut (4)', { t: 'select', options: STATUT_ENS }), col('fonction', 'Fonction', { t: 'select', options: ['Directeur/trice', 'Adjoint'] }),
    col('qualite', 'Qualité (5)', { t: 'select', options: QUALITE }), col('section', 'Section tenue', { t: 'select', options: ['Petits', 'Grands', 'Petits et Grands'] }),
    col('indice', 'Indice réel', { t: 'number', w: 80 }),
    col('anc_fp', 'Ancienneté : fonction publique', { t: 'number', w: 90 }), col('anc_dep', 'Ancienneté : département', { t: 'number', w: 90 }), col('anc_ecole', 'Ancienneté : école', { t: 'number', w: 90 }),
  ];
  if (variant === 'FIN') cols.push(col('v_insp', 'Visites : Inspecteur', { t: 'number', w: 80 }), col('v_cp', 'Visites : CP', { t: 'number', w: 80 }), col('v_dir', 'Visites : Directeur', { t: 'number', w: 80 }), col('part_up', '% participation aux UP', { t: 'number', w: 90 }));
  else cols.push(col('form_date', 'Dernière formation : date', { t: 'date' }), col('form_nature', 'Dernière formation : nature (6)'));
  cols.push(col('obs', 'Obs.', { w: 160 }));
  return { id: 'perso', type: 'personnel', title: 'XI. État nominatif du personnel enseignant', cols, minRows: 10, firstFonction: 'Directeur/trice', otherFonction: 'Adjoint',
    notes: ["(1) Pour les FE et ACE, indiquer le numéro matricule figurant sur la fiche de paie", '(2) M = masculin, F = féminin', '(3) Diplômes académiques (BEPC, BAC, LICENCE…) ou professionnels (CEAP, CAP…) le plus élevé',
      "(4) FE, ACDPE, Aspirant, Contractuel Non Reversé (CNR), Stagiaire, PRIVE ou Autre", "(5) Instituteur ou Éducateur (voir Guide)",
      variant === 'FIN' ? "(6) Inspections, contrôles et visites effectués à l'enseignant au cours de l'année" : '(6) Type de formation : diplômante, recyclage… (voir Guide)'] };
}

/* ---------------- Schéma EP (rentrée et fin d'année) ---------------- */
function schemaEP(variant = 'FIN') {
  const R = variant === 'RENTREE';
  const classes = (fn) => CLASSES.map(fn);
  const nr = (rows) => rows;
  return [
    { id: 'ident', type: 'fields', title: "1. Identification et localisation de l'école", fields: [
      f('nom_ecole', "1.1 Nom de l'école", 'text', { auto: 'nom' }),
      f('annee_creation', '1.2 Année de création', 'text', { w: 'half', auto: 'anneeCreation' }), f('ref_creation', 'Référence', 'text', { w: 'half' }),
      f('annee_extension', "1.3 Année d'extension", 'text', { w: 'half' }), f('ref_extension', 'Référence', 'text', { w: 'half' }),
      f('statut', '1.4 Statut', 'select', { options: STATUT_ECOLE, w: 'half', auto: 'secteurEP' }), f('initiative', "Si communautaire, préciser l'initiative", 'text', { w: 'half' }),
      f('circonscription', "1.5 Réseau d'animation pédagogique — i. Circonscription scolaire", 'text', { auto: 'nomCs', list: 'dl-cs', w: 'half' }),
      f('zone', 'ii. Zone pédagogique', 'text', { auto: 'numZone', w: 'q' }), f('up', 'iii. Unité pédagogique', 'text', { auto: 'up', w: 'q' }),
      f('departement', '1.6 Administration territoriale — i. Département', 'text', { auto: 'departement', list: 'dl-departement', w: 'half' }), f('commune', 'ii. Commune', 'text', { auto: 'commune', list: 'dl-commune', w: 'half' }),
      f('arrondissement', 'iii. Arrondissement', 'text', { auto: 'arrondissement', w: 'half' }), f('localite', 'iv. Village ou quartier de ville', 'text', { auto: 'localite', w: 'half' }),
      f('bp', (R ? '1.7' : '1.8') + ' Adresse : Boîte postale', 'text', { w: 'third' }), f('tel', 'Téléphone', 'text', { w: 'third' }), f('email', 'E-mail', 'text', { w: 'third' }),
    ] },
    { id: 'infos', type: 'fields', title: '2. Informations générales', fields: [
      f('fondateur', '2.1 Nom et prénoms du fondateur/fondatrice (1)'), f('directeur', '2.2 Nom et prénoms du Directeur/Directrice', 'text', { auto: 'directeur' }),
      f('classes_aut', '2.3 Nombre de classes autorisées', 'number', { w: 'half', auto: 'classesAutorisees' }), f('classes_ouv', 'Nombre de classes ouvertes', 'number', { w: 'half' }),
      f('salles_exist', 'Nombre de salles de classe existantes', 'number', { w: 'half' }), f('salles_util', 'Nombre de salles de classe utilisées', 'number', { w: 'half' }),
      f('cantine', (R ? '2.5' : '1.7') + " L'école dispose-t-elle d'une cantine ?", 'select', { options: YN, w: 'third' }), f('cantine_fonct', R ? 'Si oui, a-t-elle fonctionné ?' : 'Si oui, fonctionne-t-elle ?', 'select', { options: YN, w: 'third' }), f('cantine_raison', 'Si non, donner la raison', 'text', { w: 'third' }),
      ...(R ? [f('lavage', "2.6 Dispositif de lavage de mains fonctionnel ?", 'select', { options: YN, w: 'third' }),
        f('gestion_coll', '2.7 Structure de gestion collégiale ?', 'select', { options: YN, w: 'third' }), f('gestion_autres', 'Autres à préciser', 'text', { w: 'third' })] : []),
    ], notes: ['(1) Uniquement pour le privé.'] },
    { id: 'struct', type: 'grid', title: (R ? '2.8' : '2.4') + ' Structure pédagogique', rows: [{ k: 'simple', l: 'Simple' }, { k: 'jumelee', l: 'Jumelée' }, { k: 'multi', l: 'Multigrade' }],
      groups: [...classes(c => single(c, c)), single('salles', 'Nombre de salles utilisées')] },
    { id: 'eff', type: 'grid', title: '3. Effectif des élèves par sexe et par classe',
      rows: R ? [{ k: 'debut', l: "Nombre d'élèves" }, { k: 'redoub', l: 'Dont redoublants' }, { k: 'transf', l: "Dont élèves venus d'ailleurs (transférés)" }, { k: 'sans_acte', l: "Dont élèves sans acte de naissance" }, { k: 'handi', l: 'Dont handicapés' }]
        : [{ k: 'debut', l: "Nombre d'élèves en début d'année" }, { k: 'fin', l: "Nombre d'élèves en fin d'année" }, { k: 'promus', l: 'Promus' }, { k: 'redoub', l: 'Redoublants' }, { k: 'aband', l: 'Abandons' }],
      groups: [...classes(c => gft(c, c)), { ...gft('ens', 'ENSEMBLE'), calc: 'groups' }] },
    { id: 'infra', type: 'grid', title: '4. Infrastructures', rows: [{ k: 'salles', l: 'Salles de classe' }, { k: 'bureau', l: 'Bureau / Magasin' }],
      groups: [{ k: 'g', l: '', cols: [col('a', 'En matériaux définitifs (a)'), col('b', 'En matériaux provisoires (b)'), col('sans', 'Sans mur et sans toit'), col('t', 'Total (a+b)', { calc: 'sum:a,b' })] }] },
    { id: 'mob', type: 'grid', title: '5. Mobilier', rows: [{ k: 'tc', l: 'Table + chaise' }, { k: 'tb2', l: 'Table-banc à 2 places' }, { k: 'tb3', l: 'Table-banc à 3 places et plus' }, { k: 'bm', l: 'Bureau du maître + chaise' }],
      groups: [...classes(c => single(c, c)), { ...single('ens', 'ENSEMBLE'), calc: 'groups' }] },
    { id: 'man', type: 'grid', title: '6. Manuels', rows: [{ k: 'fr', l: 'Manuel de français' }, { k: 'maths', l: 'Manuel de maths' }],
      groups: [...classes(c => single(c, c)), { ...single('ens', 'ENSEMBLE'), calc: 'groups' }] },
    ...(R ? [] : [{ id: 'fonct', type: 'grid', title: '7. Fonctionnement des structures de gestion', rows: [{ k: 'n', l: 'Nombre' }],
      groups: [single('ag', 'Assemblée générale'), single('ape', 'Réunion bureau APE'), single('cm', 'Conseil des maîtres')] }]),
    { id: 'perso', type: 'personnel', title: (R ? '7' : '8') + '. État nominatif du personnel enseignant', minRows: 12, firstFonction: 'Directeur/trice', otherFonction: 'Adjoint',
      cols: [
        col('matricule', 'N° matricule (1)'), col('nom', 'Nom et prénoms', { w: 220 }), col('sexe', 'Sexe (2)', { t: 'select', options: ['M', 'F'], w: 70 }), col('naiss', 'Année de naissance', { t: 'number', w: 90 }),
        col('dip_ac', 'Diplôme académique (3)'), col('dip_pro', 'Diplôme professionnel (3)'), col('grade', 'Grade'), col('statut', 'Statut (4)', { t: 'select', options: STATUT_ENS }),
        col('fonction', 'Fonction', { t: 'select', options: ['Directeur/trice', 'Adjoint'] }),
        col('cours', 'Cours tenu(s)', { t: 'multi', options: CLASSES, w: 200 }), col('indice', 'Indice réel', { t: 'number', w: 80 }),
        col('anc_fp', 'Ancienneté : fonction publique', { t: 'number', w: 90 }), col('anc_dep', 'Ancienneté : département', { t: 'number', w: 90 }), col('anc_ecole', 'Ancienneté : école', { t: 'number', w: 90 }),
        col('form_date', 'Date dernière formation continue (5)', { t: 'date' }),
        ...(R ? [] : [col('v_insp', 'Visites : Inspecteur', { t: 'number', w: 80 }), col('v_cp', 'Visites : CP', { t: 'number', w: 80 }), col('v_dir', 'Visites : Directeur', { t: 'number', w: 80 }),
          col('part_up', '% participation aux UP', { t: 'number', w: 90 })]),
      ],
      notes: ['(1) Pour les FE et ACE, indiquer le numéro matricule figurant sur la fiche de paie', '(2) M = masculin, F = féminin', '(3) Diplômes académiques (BEPC, BAC, LICENCE…) ou professionnels (CEAP, CAP…) le plus élevé',
        '(4) FE, ACE, Contractuel Non Reversé (CNR), Stagiaire, Suppléant, PRIVE ou Autre', "(5) Formations organisées par le ministère ou avec sa collaboration"] },
  ];
}

export function sectionsFor(kind) {
  if (kind === 'EM_RENTREE') return [identEM(), infosEM(), ...gridsEM('RENTREE'), persoEM('RENTREE')];
  if (kind === 'EM_FIN') return [identEM(), infosEM(), ...gridsEM('FIN'), persoEM('FIN')];
  if (kind === 'EP_RENTREE') return schemaEP('RENTREE');
  if (kind === 'EP_FIN') return schemaEP('FIN');
  throw new Error('Type de fiche inconnu : ' + kind);
}

/* ---------------- Valeurs de grille (avec calculs) ---------------- */
export const gridKey = (grid, r, g, c) => `${grid.id}.${r}.${g}.${c}`;
export function gridValue(data, grid, r, g, c) {
  const grp = grid.groups.find(x => x.k === g); if (!grp) return null;
  if (grp.calc === 'groups') {
    let tot = null;
    for (const o of grid.groups) {
      if (o.calc === 'groups') continue;
      if (!o.cols.find(x => x.k === c)) continue;
      const v = gridValue(data, grid, r, o.k, c);
      if (v !== null) tot = (tot ?? 0) + v;
    }
    return tot;
  }
  const cl = grp.cols.find(x => x.k === c);
  if (cl && cl.calc && cl.calc.startsWith('sum:')) {
    let tot = null;
    for (const k of cl.calc.slice(4).split(',')) { const v = gridValue(data, grid, r, g, k); if (v !== null) tot = (tot ?? 0) + v; }
    return tot;
  }
  const raw = data[gridKey(grid, r, g, c)];
  return hasNum(raw) ? num(raw) : null;
}
export const isCalc = (grid, g, c) => {
  const grp = grid.groups.find(x => x.k === g); if (!grp) return false;
  if (grp.calc === 'groups') return true;
  const cl = grp.cols.find(x => x.k === c); return !!(cl && cl.calc);
};
export const gridColCount = (grid) => grid.groups.reduce((n, g) => n + g.cols.length, 0);

/** Aplatit une fiche en lignes lisibles (utilisé par les exports) */
export function sectionTitle(s) { return s.title; }

/** Données de départ d'une fiche à partir de l'identité de l'école */
export function prefill(kind, school) {
  const d = {};
  const src = { nom: school.nom, secteur: school.secteur === 'Communautaire' && !kind.startsWith('EP_') ? 'Centre Préscolaire Communautaire' : (school.secteur || ''), secteurEP: school.secteur || '', departement: school.departement, commune: school.commune, arrondissement: school.arrondissement, nomCs: school.nomCs, numZone: school.numZone, up: school.up, localite: school.localite, anneeCreation: school.anneeCreation, classesAutorisees: school.classesAutorisees, directeur: school.directeur };
  for (const s of sectionsFor(kind)) {
    for (const fld of s.fields || []) if (fld.auto && src[fld.auto] !== undefined) d[fld.k] = src[fld.auto] || '';
  }
  return d;
}

/** En-tête de grille (lignes/colonnes fusionnées) — partagé par l'interface, le PDF et l'Excel.
    Les cellules sont positionnées avec la colonne 0 réservée à l'intitulé de ligne. */
export function gridHead(grid) {
  const multi = grid.groups.some(g => g.l && g.cols.length > 1);
  const headRows = multi ? 2 : 1, cells = [{ t: '', c: 0, s: 1, r: 0, rs: headRows }], flat = [];
  let c = 1;
  for (const g of grid.groups) {
    if (g.cols.length === 1 && (g.l || g.cols[0].l)) { cells.push({ t: g.l || g.cols[0].l, c, s: 1, r: 0, rs: headRows }); }
    else if (!g.l) { g.cols.forEach((cl, i) => cells.push({ t: cl.l, c: c + i, s: 1, r: 0, rs: headRows })); }
    else {
      cells.push({ t: g.l, c, s: g.cols.length, r: 0, rs: 1 });
      g.cols.forEach((cl, i) => cells.push({ t: cl.l, c: c + i, s: 1, r: 1, rs: 1 }));
    }
    g.cols.forEach(cl => flat.push({ g: g.k, c: cl.k }));
    c += g.cols.length;
  }
  return { headRows, cells, flat, ncols: c };
}
export const fmtVal = (v) => (v === null || v === undefined ? '' : String(v));
export const persoValue = (v) => Array.isArray(v) ? v.join(', ') : (v ?? '');
