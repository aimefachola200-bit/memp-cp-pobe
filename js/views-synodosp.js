/* République du Bénin — MEMP — Application DOSP : tableau synoptique de la DOSP
   Même présentation que les tableaux synoptiques de la CS (SCOLARIS / GESCOL, éditions CS et DDEMP) et du CP :
     1. Identité de la division (MEMP, DDEMP, CS, CCS, chef de la DOSP…) et nombres calculés
     2. Personnel de la DOSP (anciennetés et retraite calculées : règles de SCOLARIS / GESCOL)
     3. Réseau : zones pédagogiques (CP, écoles, UP, enseignants) et écoles (directeurs, contacts, personnel)
     4. Attributions (AOF, article 13) et plan d'action
     5. Comités et instances (membres)
     6. Import / export : classeur Excel complet, import des feuilles Identité, Personnel et Comités, modèle, PDF signé
   Conception : Maître Aimé FACHE — Tél. 01 96 51 03 33 */
import { h, uid, nowISO, toast, confirmBox, pickFile, readAsBuffer, readAsText, download, norm, currentSchoolYear } from './util.js';
import { db } from './db.js';
import { dataTable, formDialog, fieldEl } from './ui.js';
import { scoped, inScope, addLog } from './data.js';
import { calculerFiche, fmtIso, CATEGORIES, DIPLOMES } from './carriere.js';
import { XlsxBook, readXlsx, parseCsv } from './xlsx.js';
import { bannerBytes } from './pdf.js';
import { personnelDuPerimetre } from './views-officiel.js';
import { docOfficiel, ATTRIBUTIONS_DOSP } from './views-dosp.js';

export async function render(id, ctx) { return synodosp(ctx); }

const rc = (el, ...k) => el.replaceChildren(...k.flat().filter(x => x !== null && x !== undefined && x !== false));
const RUB_ID = [['memp', 'Ministère (MEMP)'], ['ddemp', 'Direction départementale (DDEMP)'], ['ddemp_nom', 'Nom du Directeur départemental'], ['cs', 'Circonscription scolaire'],
  ['cs_numero', 'N° de la circonscription'], ['ccs', 'Nom du Chef de circonscription (CCS)'], ['arrondissements', 'Arrondissements couverts'], ['communes', 'Commune(s) / ville'],
  ['division', 'Division'], ['resp_titre', 'Titre du responsable'], ['resp_nom', 'Nom et prénoms du Chef de la DOSP'], ['resp_grade', 'Grade'], ['resp_nip', 'NIP'],
  ['resp_matricule', 'Matricule'], ['resp_prise_fonction', 'Date de prise de fonction'], ['annee_creation', 'Année de création de la CS'], ['adresse', 'Adresse / siège'], ['bp', 'Boîte postale'],
  ['telephone', 'Téléphone'], ['email', 'E-mail'], ['obs', 'Observations']];
const FONCTIONS_DOSP = ['Chef de la DOSP', 'Chef de service / adjoint', 'Statisticien(ne)', 'Planificateur(trice)', 'Chargé(e) de la carte scolaire', 'Chargé(e) du suivi-évaluation',
  'Agent de saisie / informaticien', 'Secrétaire', 'Agent de liaison / planton', 'Autre'];
const COMITES = ['Conseil de division (réunion de service)', 'Commission de réception et de contrôle des fiches', 'Comité de suivi-évaluation', 'Comité de prévision et de carte scolaire',
  'Comité de renforcement des capacités', 'Jury / commission du CEP', 'Autre instance'];
const F_AGENT = [
  { k: 'nom', l: 'Nom', t: 'text', req: true, w: 'half' }, { k: 'prenoms', l: 'Prénoms', t: 'text', w: 'half' },
  { k: 'sexe', l: 'Sexe', t: 'select', options: [{ v: 'M', l: 'Masculin' }, { v: 'F', l: 'Féminin' }], w: 'third' }, { k: 'date_naissance', l: 'Date de naissance', t: 'date', w: 'third' }, { k: 'telephone', l: 'Téléphone', t: 'text', w: 'third' },
  { k: 'matricule', l: 'Matricule', t: 'text', w: 'third' }, { k: 'nip', l: 'NIP', t: 'text', w: 'third' }, { k: 'email', l: 'E-mail', t: 'text', w: 'third' },
  { k: 'fonction', l: 'Fonction / poste', t: 'select', options: FONCTIONS_DOSP, req: true, w: 'half' }, { k: 'statut', l: 'Catégorie', t: 'select', options: CATEGORIES, w: 'q' }, { k: 'grade', l: 'Grade (ex. B1-04)', t: 'text', w: 'q' },
  { k: 'indice_reel', l: 'Indice réel', t: 'number', w: 'third' }, { k: 'date_prise_service', l: 'Première prise de service', t: 'date', w: 'third' }, { k: 'date_service_ecole', l: 'Prise de fonction à la DOSP', t: 'date', w: 'third' },
  { k: 'diplome_academique', l: 'Diplôme académique', t: 'select', options: DIPLOMES, w: 'third' }, { k: 'diplome_pro', l: 'Diplôme professionnel', t: 'text', w: 'third' }, { k: 'date_derniere_formation', l: 'Dernière formation (date)', t: 'date', w: 'third' },
  { k: 'obs', l: 'Observations', t: 'textarea' }];
const COLS_AG = [{ k: 'matricule', l: 'Matricule' }, { k: 'nip', l: 'NIP' }, { k: 'nom', l: 'Nom', w: 110 }, { k: 'prenoms', l: 'Prénoms', w: 130 }, { k: 'sexe', l: 'Sexe' }, { k: 'fonction', l: 'Fonction / poste', w: 160 },
  { k: 'statut', l: 'Catégorie' }, { k: 'grade', l: 'Grade' }, { k: 'indice_reel', l: 'Indice' }, { k: 'date_naissance', l: 'Date de naissance' }, { k: 'date_prise_service', l: '1re prise de service' },
  { k: 'date_service_ecole', l: 'Prise de fonction DOSP' }, { k: 'ancGen', l: 'Anc. générale' }, { k: 'ancDosp', l: 'Anc. à la DOSP' }, { k: 'retraiteTxt', l: 'Retraite' },
  { k: 'diplome_academique', l: 'Diplôme académique' }, { k: 'diplome_pro', l: 'Diplôme professionnel' }, { k: 'date_derniere_formation', l: 'Dernière formation' }, { k: 'telephone', l: 'Contact' }, { k: 'email', l: 'E-mail' }, { k: 'obs', l: 'Observations' }];
const SAISIS_AG = new Set(F_AGENT.map(f => f.k));
const COLS_MB = [{ k: 'comite', l: 'Comité / instance', w: 200 }, { k: 'nom', l: 'Nom et prénoms', w: 170 }, { k: 'qualite', l: 'Qualité (président, membre…)', w: 140 }, { k: 'structure', l: "Structure d'origine", w: 140 }, { k: 'contact', l: 'Contact' }, { k: 'obs', l: 'Observations', w: 160 }];
const F_MB = [{ k: 'comite', l: 'Comité / instance', t: 'select', options: COMITES, req: true }, { k: 'nom', l: 'Nom et prénoms', t: 'text', req: true, w: 'half' }, { k: 'qualite', l: 'Qualité', t: 'text', list: 'dl-qualite', w: 'half' },
  { k: 'structure', l: "Structure d'origine", t: 'text', w: 'half' }, { k: 'contact', l: 'Contact', t: 'text', w: 'half' }, { k: 'obs', l: 'Observations', t: 'textarea' }];
const COLS_ZN = [{ k: 'numero', l: 'N°' }, { k: 'nom', l: 'Zone pédagogique', w: 160 }, { k: 'cp', l: 'Conseiller pédagogique', w: 170 }, { k: 'cpTel', l: 'Contact CP' }, { k: 'ecoles', l: 'Écoles', num: true },
  { k: 'em', l: 'EM', num: true }, { k: 'ep', l: 'EP', num: true }, { k: 'pub', l: 'Publiques', num: true }, { k: 'priv', l: 'Privées', num: true }, { k: 'ups', l: 'UP', num: true }, { k: 'ens', l: 'Enseignants', num: true }, { k: 'ensF', l: 'dont F', num: true }];
const COLS_EC = [{ k: 'zone', l: 'Zone', w: 110 }, { k: 'nom', l: 'École', w: 180 }, { k: 'cycle', l: 'Cycle' }, { k: 'secteur', l: 'Statut' }, { k: 'arrondissement', l: 'Arrondissement' }, { k: 'up', l: 'UP' },
  { k: 'dir', l: 'Directeur / directrice', w: 170 }, { k: 'contact', l: 'Contact' }, { k: 'nbPerso', l: 'Personnel', num: true }, { k: 'nbF', l: 'dont F', num: true }];
const fmtD = (v) => (/^\d{4}-\d{2}-\d{2}/.test(v || '') ? fmtIso(v) : v || '');
const estPrive = (s) => /^priv/i.test(s.secteur || '');

async function synodosp(ctx) {
  const u = ctx.user, peut = ['DOSP', 'ADMIN', 'CCS'].includes(u.role), cle = u.codeCs || u.username;
  ctx.title('Tableau synoptique de la DOSP', 'Division de l’Organisation Scolaire et de la Prévision' + (u.nomCs ? ' — Circonscription scolaire de ' + u.nomCs : ''));
  let onglet = (await db.setting('synodosp-onglet')) || 'identite';
  const tabs = h('div', { class: 'tabs no-print' }), holder = h('div'); ctx.el.append(tabs, holder);
  const ONG = [['identite', '\uE02B Identité'], ['personnel', '\uE01C Personnel de la DOSP'], ['reseau', '\uE022 Réseau : zones et écoles'], ['attributions', '\uE02E Attributions'], ['comites', '\uE044 Comités et instances'], ['transfert', '⇅ Import / export Excel']];
  let data = {}, agents = [], membres = [], zones = [], ecoles = [], perso = [], users = [], lignes = [];

  async function charger() {
    users = await db.all('users');
    const ccs = users.find(x => x.role === 'CCS' && x.codeCs === u.codeCs), ddemp = users.find(x => x.role === 'DDEMP' && (x.csCodes || []).includes(u.codeCs));
    ecoles = (await scoped('schools', u)).sort((a, b) => (a.numZone || 99) - (b.numZone || 99) || a.nom.localeCompare(b.nom, 'fr'));
    zones = (await db.all('ref')).filter(r => r.type === 'zone' && (!u.codeCs || r.cs === u.codeCs)).sort((a, b) => (+a.numero || 0) - (+b.numero || 0));
    perso = await personnelDuPerimetre(u);
    const tousDosp = await db.all('dosp'), du = (r) => u.role === 'ADMIN' || inScope(u, r) || (!r.codeCs && r.by === u.username);
    agents = tousDosp.filter(r => r.kind === 'agent' && du(r)).map(a => calculerFiche(a)).sort((a, b) => (a.fonction === 'Chef de la DOSP' ? -1 : 0) - (b.fonction === 'Chef de la DOSP' ? -1 : 0) || (a.nom || '').localeCompare(b.nom || '', 'fr'));
    membres = tousDosp.filter(r => r.kind === 'membre' && du(r)).sort((a, b) => COMITES.indexOf(a.comite) - COMITES.indexOf(b.comite) || (a.nom || '').localeCompare(b.nom || '', 'fr'));
    lignes = tousDosp.filter(r => r.kind === 'ligne' && r.annee === currentSchoolYear() && du(r));
    const idn = (await db.setting('cpIdentity')) || {}, chef = agents.find(a => a.fonction === 'Chef de la DOSP');
    const defaut = { memp: 'Ministère des Enseignements Maternel et Primaire', ddemp: u.departement ? 'DDEMP ' + u.departement : '', ddemp_nom: ddemp ? `${ddemp.nom || ''} ${ddemp.prenoms || ''}`.trim() : '',
      cs: u.nomCs || '', ccs: ccs ? `${ccs.nom || ''} ${ccs.prenoms || ''}`.trim() : '', division: "Division de l'Organisation Scolaire et de la Prévision (DOSP)",
      resp_titre: idn.titre || "Le Chef de la Division de l'Organisation Scolaire et de la Prévision",
      resp_nom: chef ? `${chef.nom} ${chef.prenoms || ''}`.trim() : (u.role === 'DOSP' ? `${u.nom || ''} ${u.prenoms || ''}`.trim() : ''), resp_grade: chef?.grade || '', resp_nip: chef?.nip || '', resp_matricule: chef?.matricule || '',
      resp_prise_fonction: chef?.date_service_ecole || '', telephone: chef?.telephone || idn.telephone || '', email: chef?.email || idn.email || '',
      arrondissements: [...new Set(ecoles.map(s => s.arrondissement).filter(Boolean))].join(', '), communes: [...new Set(ecoles.map(s => s.commune).filter(Boolean))].join(', ') };
    const enr = (await db.setting('synodosp:' + cle)) || {};
    data = { ...defaut, ...Object.fromEntries(Object.entries(enr).filter(([, v]) => v !== '' && v != null)) };
  }
  const nombres = () => {
    const n = (a, f) => a.filter(f).length, ens = perso.filter(p => /^(direct|adjoint|enseign)/i.test(norm(p.fonction)));
    const ups = new Set(ecoles.map(s => s.up).filter(Boolean));
    return [['Zones pédagogiques', zones.length || new Set(ecoles.map(s => s.codeZone).filter(Boolean)).size], ['Unités pédagogiques', ups.size], ['Écoles', ecoles.length],
      ['Écoles publiques', n(ecoles, s => !estPrive(s))], ['Écoles privées', n(ecoles, estPrive)], ['Écoles primaires (EP)', n(ecoles, s => s.cycle !== 'Maternelle')], ['Écoles maternelles (EM)', n(ecoles, s => s.cycle === 'Maternelle')],
      ['Enseignants', ens.length], ['dont femmes', n(ens, p => p.sexe === 'F')], ['Agents de la DOSP', agents.length], ['Membres des comités', membres.length]];
  };
  const ligneAg = (a) => ({ ...a, ancGen: a.ancTxt?.generale || '', ancDosp: a.ancTxt?.ecole || '', date_naissance: fmtD(a.date_naissance), date_prise_service: fmtD(a.date_prise_service), date_service_ecole: fmtD(a.date_service_ecole), date_derniere_formation: fmtD(a.date_derniere_formation) });
  const lignesZones = () => zones.map(z => {
    const ec = ecoles.filter(s => s.codeZone === z.code), ens = perso.filter(p => p.codeZone === z.code && /^(direct|adjoint|enseign)/i.test(norm(p.fonction)));
    const cpU = users.find(x => x.role === 'CP' && x.codeZone === z.code);
    return { numero: z.numero, nom: z.nom || 'Zone ' + z.numero, cp: cpU ? `${cpU.nom || ''} ${cpU.prenoms || ''}`.trim() : '', cpTel: cpU?.telephone || '', ecoles: ec.length, em: ec.filter(s => s.cycle === 'Maternelle').length, ep: ec.filter(s => s.cycle !== 'Maternelle').length,
      pub: ec.filter(s => !estPrive(s)).length, priv: ec.filter(estPrive).length, ups: new Set(ec.map(s => s.up).filter(Boolean)).size, ens: ens.length, ensF: ens.filter(p => p.sexe === 'F').length };
  });
  const lignesEcoles = () => ecoles.map(s => { const pe = perso.filter(p => p.schoolId === s.id), d = pe.find(p => /^direct/i.test(norm(p.fonction)));
    const z = zones.find(x => x.code === s.codeZone); return { ...s, zone: z ? (z.nom || 'Zone ' + z.numero) : (s.numZone ? 'Zone ' + s.numZone : ''), dir: s.directeur || (d ? `${d.nom} ${d.prenoms || ''}` : ''), nbPerso: pe.length, nbF: pe.filter(p => p.sexe === 'F').length }; });

  const sauver = async () => { await db.setting('synodosp:' + cle, data); await addLog(u, { action: 'Tableau synoptique DOSP', target: 'Identité enregistrée' }); toast('Tableau synoptique enregistré.'); };
  async function editerAgent(rec) {
    const v = await formDialog({ title: rec ? `Modifier — ${rec.nom} ${rec.prenoms || ''}` : 'Ajouter un agent de la DOSP', fields: F_AGENT, values: rec ? Object.fromEntries(Object.entries(rec).filter(([k]) => SAISIS_AG.has(k))) : { fonction: agents.length ? 'Statisticien(ne)' : 'Chef de la DOSP' }, wide: true }); if (!v) return;
    const base = rec ? (await db.get('dosp', rec.id)) : { id: uid(), kind: 'agent', codeCs: u.codeCs || '', departement: u.departement || '', by: u.username, created: nowISO() };
    await db.put('dosp', { ...base, ...v, nom: (v.nom || '').toUpperCase(), updated: nowISO() }); toast(rec ? 'Agent modifié.' : 'Agent ajouté.'); await charger(); draw();
  }
  async function editerMembre(rec) {
    const v = await formDialog({ title: rec ? 'Modifier le membre' : 'Ajouter un membre', fields: F_MB, values: rec || { comite: COMITES[0] } }); if (!v) return;
    await db.put('dosp', { ...(rec || { id: uid(), kind: 'membre', codeCs: u.codeCs || '', departement: u.departement || '', by: u.username, created: nowISO() }), ...v, updated: nowISO() }); await charger(); draw();
  }
  const supprimer = async (r, lib) => { if (!r) return toast('Touchez d’abord une ligne du tableau.', 'warn'); if (!(await confirmBox(`Retirer « ${lib} » ?`, 'Retirer', true))) return; await db.del('dosp', r.id); await charger(); draw(); };

  /* ---------- Excel : classeur complet, modèle, import ---------- */
  async function feuille(wb, nom, titre, cols, rows) {
    const ws = wb.sheet(nom); let r = ws.banner(await bannerBytes(), 820);
    ws.set(r, 0, titre, 'title'); r++; ws.set(r, 0, (u.nomCs ? 'Circonscription scolaire de ' + u.nomCs + ' — ' : '') + "Division de l'Organisation Scolaire et de la Prévision", 'note'); r += 2;
    cols.forEach((c, i) => { ws.set(r, i, c.l, 'th'); ws.width(i, c.xw || Math.max(12, Math.min(40, (c.w || 100) / 6))); }); ws.height(r, 30); ws.freeze(r + 1, 0); r++;
    for (const o of rows) { cols.forEach((c, i) => ws.set(r, i, o[c.k] ?? '', c.num ? 'tdn' : 'td')); r++; }
  }
  const COLS_ID = [{ k: 'l', l: 'Rubrique', xw: 42 }, { k: 'v', l: 'Renseignement', xw: 60 }];
  async function excelComplet() {
    const wb = new XlsxBook();
    await feuille(wb, 'Identité', 'TABLEAU SYNOPTIQUE DE LA DOSP — IDENTITÉ', COLS_ID, [...RUB_ID.map(([k, l]) => ({ l, v: fmtD(data[k]) })), ...nombres().map(([l, v]) => ({ l: 'Nombre — ' + l, v }))]);
    await feuille(wb, 'Personnel', 'PERSONNEL DE LA DOSP', COLS_AG, agents.map(ligneAg));
    await feuille(wb, 'Zones', 'ZONES PÉDAGOGIQUES', COLS_ZN, lignesZones());
    await feuille(wb, 'Écoles', 'ÉCOLES ET DIRECTEURS', COLS_EC, lignesEcoles());
    await feuille(wb, 'Comités', 'COMITÉS ET INSTANCES', COLS_MB, membres);
    await feuille(wb, 'Plan d’action', "PLAN D'ACTION " + currentSchoolYear(), [{ k: 'libelle', l: "Ligne d'action", w: 300 }, { k: 'indicateur', l: 'Indicateur' }, { k: 'echeance', l: 'Échéance' }, { k: 'responsable', l: 'Responsable' }, { k: 'etat', l: 'État' }, { k: 'taux', l: 'Taux (%)', num: true }], lignes);
    download(await wb.toBlob(), `Tableau_synoptique_DOSP${u.nomCs ? '_' + u.nomCs.replace(/\W+/g, '_') : ''}.xlsx`);
  }
  async function modele() {
    const wb = new XlsxBook();
    await feuille(wb, 'Identité', "MODÈLE D'IMPORT — IDENTITÉ (ne pas modifier la colonne Rubrique)", COLS_ID, RUB_ID.map(([k, l]) => ({ l, v: '' })));
    await feuille(wb, 'Personnel', "MODÈLE D'IMPORT — PERSONNEL DE LA DOSP (une ligne par agent ; dates au format JJ/MM/AAAA)", COLS_AG.filter(c => SAISIS_AG.has(c.k)), [{ nom: 'EXEMPLE', prenoms: 'Agent', sexe: 'F', fonction: 'Statisticien(ne)', statut: 'ACDPE', grade: 'B1-04' }]);
    await feuille(wb, 'Comités', "MODÈLE D'IMPORT — COMITÉS ET INSTANCES", COLS_MB, [{ comite: COMITES[0], nom: 'EXEMPLE Membre', qualite: 'Membre', structure: 'DOSP' }]);
    download(await wb.toBlob(), 'Modele_import_synoptique_DOSP.xlsx');
  }
  const dateIso = (v) => { const s = String(v || '').trim(); if (!s) return ''; if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (/^\d{5}(\.\d+)?$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(+s) * 86400000); return d.toISOString().slice(0, 10); } return s; };
  function lire(rows, cols) {
    const hi = rows.findIndex(r => r.filter(c => String(c).trim()).length >= 2); if (hi < 0) return [];
    const head = rows[hi].map(c => norm(c)), idx = {};
    for (const c of cols) { const i = head.findIndex(x => x === norm(c.l) || x === norm(c.k)); if (i >= 0) idx[c.k] = i; }
    return rows.slice(hi + 1).filter(r => r.some(c => String(c).trim())).map(r => Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, String(r[i] ?? '').trim()])));
  }
  async function importer() {
    if (!peut) return toast('Import réservé à la DOSP, au CCS et à l’administrateur.', 'warn');
    const f = await pickFile('.xlsx,.csv,.txt'); if (!f) return;
    try {
      const sheets = /\.(csv|txt)$/i.test(f.name) ? [{ name: 'csv', rows: parseCsv(await readAsText(f)) }] : await readXlsx(await readAsBuffer(f));
      let nA = 0, nM = 0, nI = 0; const bilan = [];
      for (const sh of sheets) {
        const nomF = norm(sh.name), entete = (sh.rows.find(r => r.filter(c => String(c).trim()).length >= 2) || []).map(norm);
        const type = nomF.startsWith('identit') || entete.includes('rubrique') ? 'id' : nomF.startsWith('comit') || entete.includes(norm('Comité / instance')) ? 'mb' : nomF.startsWith('personnel') || nomF === 'csv' || entete.includes('nom') ? 'ag' : '';
        if (type === 'id') {
          for (const r of lire(sh.rows, COLS_ID)) { const k = (RUB_ID.find(([, l]) => norm(l) === norm(r.l)) || [])[0]; if (k && r.v) { data[k] = k === 'resp_prise_fonction' ? dateIso(r.v) : r.v; nI++; } }
        } else if (type === 'ag') {
          const exist = (await db.all('dosp')).filter(x => x.kind === 'agent');
          for (const r of lire(sh.rows, COLS_AG.filter(c => SAISIS_AG.has(c.k))).filter(x => x.nom && !/^exemple$/i.test(x.nom))) {
            for (const k of ['date_naissance', 'date_prise_service', 'date_service_ecole', 'date_derniere_formation']) if (r[k]) r[k] = dateIso(r[k]);
            r.nom = r.nom.toUpperCase(); r.sexe = /^f/i.test(r.sexe || '') ? 'F' : /^m/i.test(r.sexe || '') ? 'M' : '';
            const old = exist.find(x => (r.matricule && x.matricule === r.matricule) || (norm(x.nom) === norm(r.nom) && norm(x.prenoms) === norm(r.prenoms) && (x.codeCs || '') === (u.codeCs || '')));
            const vals = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== ''));
            await db.put('dosp', old ? { ...old, ...vals, updated: nowISO() } : { id: uid(), kind: 'agent', codeCs: u.codeCs || '', departement: u.departement || '', by: u.username, created: nowISO(), fonction: 'Autre', ...vals }); nA++;
          }
        } else if (type === 'mb') {
          const exist = (await db.all('dosp')).filter(x => x.kind === 'membre');
          for (const r of lire(sh.rows, COLS_MB).filter(x => x.nom && !/^exemple/i.test(x.nom))) {
            const old = exist.find(x => norm(x.nom) === norm(r.nom) && x.comite === r.comite);
            await db.put('dosp', old ? { ...old, ...r, updated: nowISO() } : { id: uid(), kind: 'membre', codeCs: u.codeCs || '', departement: u.departement || '', by: u.username, created: nowISO(), ...r, comite: r.comite || COMITES[COMITES.length - 1] }); nM++;
          }
        }
      }
      if (nI) await db.setting('synodosp:' + cle, data);
      if (nI) bilan.push(`${nI} rubrique(s) d'identité`); if (nA) bilan.push(`${nA} agent(s)`); if (nM) bilan.push(`${nM} membre(s) de comité`);
      if (!bilan.length) return toast('Rien de reconnu : utilisez le modèle d’import (feuilles Identité, Personnel, Comités).', 'err');
      await addLog(u, { action: 'Import synoptique DOSP', target: bilan.join(', ') }); toast('Import terminé : ' + bilan.join(', ') + '.'); await charger(); draw();
    } catch (e) { console.error(e); toast('Import impossible : ' + e.message, 'err'); }
  }
  async function excelOnglet() {
    const wb = new XlsxBook();
    if (onglet === 'personnel') await feuille(wb, 'Personnel', 'PERSONNEL DE LA DOSP', COLS_AG, agents.map(ligneAg));
    else if (onglet === 'reseau') { await feuille(wb, 'Zones', 'ZONES PÉDAGOGIQUES', COLS_ZN, lignesZones()); await feuille(wb, 'Écoles', 'ÉCOLES ET DIRECTEURS', COLS_EC, lignesEcoles()); }
    else if (onglet === 'comites') await feuille(wb, 'Comités', 'COMITÉS ET INSTANCES', COLS_MB, membres);
    else return excelComplet();
    download(await wb.toBlob(), `Synoptique_DOSP_${onglet}.xlsx`);
  }
  async function pdfComplet() {
    const ag = agents.map(ligneAg), zl = lignesZones(), el = lignesEcoles();
    download(await docOfficiel(u, { titre: 'TABLEAU SYNOPTIQUE DE LA DIVISION DE L’ORGANISATION SCOLAIRE ET DE LA PRÉVISION', sousTitre: (u.nomCs ? 'Circonscription scolaire de ' + u.nomCs + ' — ' : '') + 'Année scolaire ' + currentSchoolYear(),
      orientation: 'landscape', label: 'Tableau synoptique DOSP', blocs: [
        { heading: '1. Identité', table: { head: ['Rubrique', 'Renseignement'], widths: [1.2, 3], rows: RUB_ID.filter(([k]) => data[k]).map(([k, l]) => [l, fmtD(data[k])]), size: 8 } },
        { heading: '2. Nombres', table: { head: nombres().map(([l]) => l), rows: [nombres().map(([, v]) => String(v))], size: 7 } },
        { heading: `3. Personnel de la DOSP (${ag.length})`, ...(ag.length ? { table: { head: ['Matricule', 'Nom et prénoms', 'Sexe', 'Fonction', 'Catég.', 'Grade', 'Naissance', '1re PS', 'Anc. gén.', 'Anc. DOSP', 'Retraite', 'Diplômes', 'Contact'],
          widths: [1, 2.2, 0.5, 1.8, 0.8, 0.7, 1, 1, 1, 1, 1, 1.4, 1], rows: ag.map(a => [a.matricule || '', `${a.nom} ${a.prenoms || ''}`, a.sexe || '', a.fonction || '', a.statut || '', a.grade || '', a.date_naissance, a.date_prise_service, a.ancGen, a.ancDosp, a.retraiteTxt || '', [a.diplome_academique, a.diplome_pro].filter(Boolean).join(' · '), a.telephone || '']), size: 6.5 } } : { text: 'Aucun agent enregistré.' }) },
        { heading: `4. Zones pédagogiques (${zl.length})`, ...(zl.length ? { table: { head: COLS_ZN.map(c => c.l), widths: [0.4, 1.8, 2, 1.1, 0.7, 0.5, 0.5, 0.8, 0.7, 0.5, 0.9, 0.6], rows: zl.map(z => COLS_ZN.map(c => String(z[c.k] ?? ''))), size: 7 } } : { text: 'Aucune zone pédagogique.' }) },
        { heading: `5. Écoles et directeurs (${el.length})`, ...(el.length ? { table: { head: COLS_EC.map(c => c.l), widths: [1.1, 2, 0.8, 1, 1.1, 1, 2, 1, 0.7, 0.6], rows: el.map(s => COLS_EC.map(c => String(s[c.k] ?? ''))), size: 6.5 } } : { text: 'Aucune école.' }) },
        { heading: '6. Attributions (AOF, article 13)', text: ATTRIBUTIONS_DOSP },
        { heading: `7. Comités et instances (${membres.length})`, ...(membres.length ? { table: { head: COLS_MB.map(c => c.l), widths: [2, 2, 1.3, 1.3, 1, 1.6], rows: membres.map(m => COLS_MB.map(c => m[c.k] || '')), size: 7 } } : { text: 'Aucun membre enregistré.' }) },
      ] }), `Tableau_synoptique_DOSP${u.nomCs ? '_' + u.nomCs.replace(/\W+/g, '_') : ''}.pdf`);
  }

  function draw() {
    rc(tabs, ONG.map(([k, l]) => h('button', { class: 'tab' + (k === onglet ? ' on' : ''), onclick: () => { onglet = k; db.setting('synodosp-onglet', k); draw(); } }, l)));
    const act = [{ label: '\uE009 PDF complet (signé)', onClick: pdfComplet }, { label: '\uE009 Excel (onglet)', onClick: excelOnglet }, { label: '\uE009 Excel complet', onClick: excelComplet },
      { label: '\uE00A Importer Excel', show: peut, onClick: importer }, { label: "\uE00D Modèle d'import", onClick: modele }, { label: '\uE008 Imprimer', onClick: () => window.print() }];
    if (onglet === 'identite') {
      rc(holder, h('div', { class: 'card' }, h('h3', 'Identité de la division et de la circonscription'),
        h('div', { class: 'grid12' }, RUB_ID.map(([k, l]) => fieldEl({ k, l, t: k === 'obs' ? 'textarea' : k === 'resp_prise_fonction' ? 'date' : 'text', w: k === 'obs' ? null : 'half', ro: !peut }, data[k], (kk, v) => { data[kk] = v; })))),
        h('div', { class: 'cards' }, nombres().map(([l, v]) => h('div', { class: 'stat' }, h('b', String(v)), h('span', l)))));
      ctx.actions([{ label: '\uE007 Enregistrer', kind: 'primary', show: peut, onClick: sauver }, ...act]);
    } else if (onglet === 'personnel') {
      const t = dataTable({ columns: COLS_AG, rows: agents.map(ligneAg), onOpen: (r) => peut && editerAgent(agents.find(a => a.id === r.id)), pageSize: 100, empty: 'Aucun agent : touchez « Ajouter » ou « Importer Excel ».' });
      rc(holder, t.el, h('p', { class: 'notes' }, 'Anciennetés au 31 décembre de l’année scolaire et départ à la retraite calculés comme dans SCOLARIS / GESCOL (A : 60 ans, B : 58 ans, C : 55 ans, 1er jour du trimestre suivant la naissance).'));
      ctx.actions([{ label: '\uE001 Ajouter', kind: 'primary', show: peut, onClick: () => editerAgent(null) }, { label: '\uE006 Modifier', show: peut, onClick: () => (t.selected ? editerAgent(agents.find(a => a.id === t.selected.id)) : toast('Touchez une ligne.', 'warn')) },
        { label: '\uE005 Retirer', show: peut, onClick: () => supprimer(t.selected, t.selected ? t.selected.nom : '') }, ...act]);
    } else if (onglet === 'reseau') {
      rc(holder, h('h3', { class: 'sec-h' }, 'Zones pédagogiques'), dataTable({ columns: COLS_ZN, rows: lignesZones(), pageSize: 50, empty: 'Aucune zone (Référentiel national → Zones pédagogiques).' }).el,
        h('h3', { class: 'sec-h' }, 'Écoles et directeurs'), dataTable({ columns: COLS_EC, rows: lignesEcoles(), pageSize: 300, empty: 'Aucune école dans le périmètre.' }).el,
        h('p', { class: 'no-print' }, h('button', { class: 'btn', onclick: async () => { await db.setting('saisie-onglet', 'directeurs'); ctx.go('saisie'); } }, '\uE029 Compléter les directeurs (saisie manuelle)')));
      ctx.actions(act);
    } else if (onglet === 'attributions') {
      rc(holder, h('div', { class: 'card' }, h('h3', 'Attributions (AOF, article 13)'), h('div', { style: { whiteSpace: 'pre-line' } }, ATTRIBUTIONS_DOSP)),
        h('div', { class: 'card' }, h('h3', `Plan d'action ${currentSchoolYear()} (${lignes.length} ligne(s))`), lignes.length ? h('ol', lignes.map(l => h('li', `${l.libelle} — ${l.etat || 'Prévue'}${l.taux ? ' (' + l.taux + ' %)' : ''}`))) : h('p', { class: 'muted' }, 'Aucune ligne d’action.'),
          h('button', { class: 'btn', onclick: () => ctx.go('plandosp') }, "\uE02E Ouvrir le plan d'action")));
      ctx.actions(act);
    } else if (onglet === 'comites') {
      const t = dataTable({ columns: COLS_MB, rows: membres, onOpen: (r) => peut && editerMembre(r), pageSize: 200, empty: 'Aucun membre : touchez « Ajouter » ou « Importer Excel ».' });
      rc(holder, t.el, h('datalist', { id: 'dl-qualite' }, ['Président(e)', 'Vice-président(e)', 'Rapporteur', 'Secrétaire', 'Membre'].map(x => h('option', { value: x }))));
      ctx.actions([{ label: '\uE001 Ajouter', kind: 'primary', show: peut, onClick: () => editerMembre(null) }, { label: '\uE006 Modifier', show: peut, onClick: () => (t.selected ? editerMembre(t.selected) : toast('Touchez une ligne.', 'warn')) },
        { label: '\uE005 Retirer', show: peut, onClick: () => supprimer(t.selected, t.selected ? t.selected.nom : '') }, ...act]);
    } else {
      const btn = (l, f, k = '') => h('button', { class: 'btn ' + k, onclick: f }, l);
      rc(holder, h('div', { class: 'card' }, h('h3', 'Export'), h('p', 'Classeur Excel complet : feuilles Identité, Personnel, Zones, Écoles, Comités et Plan d’action. PDF complet signé (cachet, QR de vérification).'),
        h('p', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, btn('\uE009 Excel complet', excelComplet, 'primary'), btn('\uE009 PDF complet (signé)', pdfComplet))),
        h('div', { class: 'card' }, h('h3', 'Import'), h('p', 'Importe les feuilles « Identité », « Personnel » et « Comités » d’un classeur (modèle ci-dessous, ou classeur complet exporté puis complété). Les agents déjà présents (même matricule, ou mêmes nom et prénoms) sont mis à jour.'),
          h('p', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, peut ? btn('\uE00A Importer Excel', importer, 'primary') : null, btn("\uE00D Modèle d'import", modele))));
      ctx.actions(act);
    }
    ctx.status(`${agents.length} agent(s) DOSP · ${zones.length} zone(s) · ${ecoles.length} école(s) · ${membres.length} membre(s) de comités`);
  }
  await charger(); draw();
}
