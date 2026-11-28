/* ÉduGestion Pro Master — « Synchronisation entre niveaux » (protocole commun memp-sync v1, /home/claude/outils/sync/spec.md).
   École (directeur, enseignant) → circonscription (compte CS) → département (compte DDEMP) : bureaux et vie UASCEP, registres
   partagés (sport, examens, patrimoine, communication, pilotage), versions pédagogiques. Hors ligne d'abord : fichier .scsync
   (WhatsApp, clé USB, courriel) ou Internet vers un hub SCOLARIS (édition cs / ddemp). Conception : Maître Aimé FACHOLA */
(function (global) {
  'use strict';
  const EG = global.EG, DB = EG.DB, U = EG.UI, E = EG.Ecrans, Routeur = U.Routeur;
  if (!global.SyncClient || !global.SyncCommun || !global.Ed25519) return;
  const el = U.el, norm = global.SyncCommun.norm;
  const NIVEAU = { DIRECTEUR: 'ECOLE', ENSEIGNANT: 'ECOLE', CONSEILLER_PEDAGOGIQUE: 'ZONE', CS: 'CS', DDEMP: 'DDEMP', ADMIN_MEMP: 'DDEMP', ADMIN_TECHNIQUE: 'DDEMP' };
  let client = null, clientDe = '', ecoles = [];
  async function identite() {
    const s = EG.session || {}, u = s.user || {}, niveau = NIVEAU[u.role] || 'ECOLE';
    if (niveau === 'ECOLE') { const e = s.ecole_id ? await DB.get('ecoles', s.ecole_id) : null; return { niveau, code: (e && e.code_ecole) || ('NOM:' + norm((e && e.nom) || s.ecole_nom || '')), nom: (e && e.nom) || s.ecole_nom || 'École' }; }
    const t = u.territoire_id ? await DB.get('territoires', u.territoire_id).catch(() => null) : null;
    return { niveau, code: (t && (t.code || t.nom)) || u.identifiant, nom: (t && t.nom) || (niveau === 'CS' ? 'Circonscription scolaire' : niveau === 'DDEMP' ? 'Direction départementale' : 'Zone pédagogique') };
  }
  function creerClient() {
    const commun = global.SyncCommun.creer({
      uascep: { charger: () => DB.meta('uascep').then(v => v || { bureaux: [], membres: [] }), enregistrer: (e) => DB.setMeta('uascep', e) },
      pvs: { charger: () => DB.meta('pvs').then(v => v || {}), enregistrer: (e) => DB.setMeta('pvs', e) },
      pedagogie: { charger: () => DB.meta('pedagogieNotes').then(v => v || {}), enregistrer: (e) => DB.setMeta('pedagogieNotes', e) },
      ecoleCode: (id) => { const e = ecoles.find(x => String(x.id) === String(id)); return e ? { code: e.code_ecole || '', nom: e.nom } : null; },
      ecoleLocale: (code, nom, parNom) => { const e = (!parNom && ecoles.find(x => x.code_ecole && norm(x.code_ecole) === norm(code))) || ecoles.find(x => norm(x.nom) === norm(parNom ? code : nom)); return e ? e.id : null; }
    });
    return global.SyncClient.installer({
      application: 'EduGestion', base: 'EduGestion-' + (DB.nom || 'pro') + '-' + (((EG.session || {}).user || {}).identifiant || ''), version: EG.VERSION || '', titre: 'ÉduGestion Pro Master', couleur: '#1F4E79',
      identite,
      objets: async () => { ecoles = await DB.all('ecoles').catch(() => []); return commun.objets(); },
      appliquer: (o) => commun.appliquer(o), debut: async () => { ecoles = await DB.all('ecoles').catch(() => []); return commun.debut(); }, fin: () => commun.fin().then(() => { if (EG.majSynchro) EG.majSynchro(); }),
      telecharger: (nom, blob) => EG.Sortie.enregistrer(nom, blob),
      estHub: () => ['CS', 'DDEMP', 'ADMIN_MEMP', 'ADMIN_TECHNIQUE'].indexOf(((EG.session || {}).user || {}).role) >= 0
    });
  }
  function syncClient() {
    const id = ((EG.session || {}).user || {}).id || '';
    if (!client || clientDe !== id) { client = creerClient(); clientDe = id; }
    return client;
  }
  EG.Synchronisation = { client: syncClient };
  Routeur.definir('synchronisation', function (racine) {
    racine.appendChild(E.entete('Synchronisation entre niveaux', 'École → circonscription → département : envois signés par fichier ou par Internet, hors ligne d’abord.'));
    const zone = el('div'); racine.appendChild(zone);
    syncClient().page(zone).catch(e => { zone.textContent = 'La synchronisation n’a pas pu s’ouvrir : ' + e.message; });
  });
})(window);
