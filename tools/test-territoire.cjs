// Test : circuit de la fiche de rentrée et du courrier à travers la synchronisation (montant, décision, décisions transmises
// descendantes) ; incidents, présences et fiche signalétique ne quittent pas l'appareil. Lancer : node tools/test-territoire.js
const assert = require('assert/strict');
global.window = global;
const R = require('path').join(__dirname, '..', 'js'); require(R + '/pvs-modules.js'); require(R + '/pvs.js'); require(R + '/sync-commun.js');
const S = window.SyncCommun;
function appareil(P) { return S.creer({ pvs: { charger: async () => P, enregistrer: async (x) => Object.assign(P, x) }, ecoleCode: (id) => ({ code: 'EC' + id, nom: 'École ' + id }), ecoleLocale: (code) => code.replace(/^EC/, '') }); }
(async () => {
  // école : fiche transmise
  const ecole = { rentree: [{ id: 'r1', niveau: 'ECOLE', entite: '7', entiteLib: 'EPP Test', annee: '2026-2027', effG: 10, effF: 12, statut: 'TRANSMISE', dateTransmission: '2026-10-01T08:00:00.000Z' }], retours: [], courrier: [] };
  const cs = { rentree: [], retours: [], courrier: [] };
  const A = appareil(ecole), C = appareil(cs);
  const montants = (await A.objets()).filter(o => o.type === 'reg:territoire:rentree');
  assert.equal(montants.length, 1); assert.equal(montants[0].sens, 'montant');
  await C.debut(); for (const o of montants) await C.appliquer(o); await C.fin();
  assert.equal(cs.rentree[0].statut, 'TRANSMISE');
  // la CS valide : décision locale + retour descendant
  Object.assign(cs.rentree[0], { statut: 'VALIDEE_CS', validePar: 'CS', dateValidation: '2026-10-02T09:00:00.000Z' });
  cs.retours.push({ id: 'd1', niveau: 'CS', entite: 'CS1', entiteLib: 'CS', objet: 'Fiche de rentrée', cle: 'rentree|epp test|2026-2027', ref: 'r1', destinataire: 'EPP Test', statut: 'Validée CS', statutCode: 'VALIDEE_CS', date: '2026-10-02T09:00:00.000Z', decidePar: 'CS' });
  // une copie montante plus ancienne (nouvelle synchro de l'école) n'écrase pas la décision
  await C.debut(); for (const o of montants) await C.appliquer(o); await C.fin();
  assert.equal(cs.rentree[0].statut, 'VALIDEE_CS', 'décision gardée');
  // retours vers l'école
  const desc = (await C.objets()).filter(o => o.type === 'reg:territoire:retours');
  assert.equal(desc.length, 1); assert.equal(desc[0].sens, 'descendant');
  await A.debut(); for (const o of desc) await A.appliquer(o); await A.fin();
  assert.equal(ecole.rentree[0].statut, 'VALIDEE_CS'); assert.equal(ecole.rentree[0].validePar, 'CS');
  // renvoi puis nouvelle transmission : la nouvelle transmission prime sur l'ancienne décision
  cs.retours.push({ id: 'd2', objet: 'Fiche de rentrée', ref: 'r1', statut: 'Renvoyée', statutCode: 'RENVOYEE', date: '2026-10-03T09:00:00.000Z', decidePar: 'DDEMP', motif: 'Effectifs à vérifier', niveau: 'CS', entite: 'CS1' });
  await A.debut(); for (const o of (await C.objets()).filter(o => o.type === 'reg:territoire:retours')) await A.appliquer(o); await A.fin();
  assert.equal(ecole.rentree[0].statut, 'RENVOYEE'); assert.equal(ecole.rentree[0].motifRenvoi, 'Effectifs à vérifier');
  Object.assign(ecole.rentree[0], { statut: 'TRANSMISE', dateTransmission: '2026-10-04T08:00:00.000Z' });
  assert.equal(window.PVS.appliquerRetours(ecole), 0, 'anciennes décisions ignorées');
  await C.debut(); for (const o of (await A.objets()).filter(o => o.type === 'reg:territoire:rentree')) await C.appliquer(o); await C.fin();
  assert.equal(cs.rentree[0].statut, 'TRANSMISE', 'nouvelle transmission reçue');
  // clôturée : ne change plus
  ecole.rentree[0].statut = 'CLOTUREE'; ecole.retours.push({ id: 'd3', objet: 'Fiche de rentrée', ref: 'r1', statut: 'Renvoyée', statutCode: 'RENVOYEE', date: '2026-12-01T00:00:00.000Z' });
  assert.equal(window.PVS.appliquerRetours(ecole), 0);
  // courrier : envoyé par l'école, lu par la CS, l'école reçoit l'accusé de lecture
  ecole.courrier.push({ id: 'c1', niveau: 'ECOLE', entite: '7', entiteLib: 'EPP Test', saison: '2026-2027', type: 'Rapport', reference: '12', date: '2026-10-05', objet: 'Rapport de rentrée', destNiveau: 'CS', statut: 'Envoyé', numDepart: 'D-2026-0001' });
  await C.debut(); for (const o of (await A.objets()).filter(o => o.type === 'reg:communication:courrier')) await C.appliquer(o); await C.fin();
  Object.assign(cs.courrier[0], { statut: 'Reçu', dateLecture: '2026-10-06T10:00:00.000Z', lecteur: 'Chef CS', numArrivee: 'A-2026-0001' });
  cs.retours.push({ id: 'd4', niveau: 'CS', entite: 'CS1', objet: 'Courrier', ref: 'c1', statut: 'Reçu', date: '2026-10-06T10:00:00.000Z', numArrivee: 'A-2026-0001', dateLecture: '2026-10-06T10:00:00.000Z', lecteur: 'Chef CS' });
  await C.debut(); for (const o of (await A.objets()).filter(o => o.type === 'reg:communication:courrier')) await C.appliquer(o); await C.fin();
  assert.equal(cs.courrier[0].statut, 'Reçu', 'lecture gardée face à la copie montante');
  await A.debut(); for (const o of (await C.objets()).filter(o => o.type === 'reg:territoire:retours')) await A.appliquer(o); await A.fin();
  assert.equal(ecole.courrier[0].statut, 'Reçu'); assert.equal(ecole.courrier[0].numArrivee, 'A-2026-0001'); assert.equal(ecole.courrier[0].lecteur, 'Chef CS');
  // incidents de discipline, présence du personnel, fiche signalétique, structures : ne quittent pas l'appareil
  ecole.incidentsDiscipline = [{ id: 'i1', niveau: 'ECOLE', entite: '7', eleve: 'X' }]; ecole.presencesAgents = [{ id: 'p1', niveau: 'ECOLE', entite: '7' }];
  const types = new Set((await A.objets()).map(o => o.type));
  assert.ok(!types.has('reg:sante:incidents') && !types.has('reg:territoire:presences') && !types.has('reg:territoire:signaletique'));
  console.log('ok circuit rentrée / courrier / retours');
})().catch(e => { console.error(e); process.exit(1); });
