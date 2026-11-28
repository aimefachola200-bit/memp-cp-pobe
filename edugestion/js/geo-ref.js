/* ÉduGestion Pro — arrondissements et villages du référentiel national dans les listes en cascade.
   Les territoires livrés ne vont que jusqu'à la commune : dès qu'on choisit une commune (ou un arrondissement)
   dans un formulaire, ses arrondissements (ou ses villages et quartiers de ville) sont ajoutés aux territoires de
   l'appareil à partir de data/referentiel_villages.json (js/choix.js), une seule fois, sans passer par la file de
   synchronisation. Les ajouts faits à la main (« \uE001 Ajouter… ») restent possibles. */
(function (global) {
  'use strict';
  const EG = global.EG;
  const souple = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/^(COMMUNE|ARRONDISSEMENT)\s+(DE L'|DE LA|DU|DES|DE|D')?\s*/, '').replace(/[^A-Z0-9]/g, '').replace(/(.)\1+/g, '$1');
  const enCours = {};

  /** Complète les enfants du territoire « parent » (COMMUNE → ARRONDISSEMENT, ARRONDISSEMENT → VILLAGE_QUARTIER).
      territoires : la liste en mémoire du formulaire (les nouveaux enregistrements y sont ajoutés). Rend le nombre ajouté. */
  function completer(parent, territoires) {
    if (!parent || !global.Choix || (parent.type !== 'COMMUNE' && parent.type !== 'ARRONDISSEMENT')) return Promise.resolve(0);
    if (enCours[parent.id]) return enCours[parent.id];
    const index = {}; territoires.forEach(t => { index[t.id] = t; });
    const p = global.Choix.charger().then(G => {
      let noms = [], type;
      if (parent.type === 'COMMUNE') {
        const com = G.communes.find(c => souple(c.nom) === souple(parent.nom));
        if (!com) return 0;
        noms = G.arr[com.nom] || []; type = 'ARRONDISSEMENT';
      } else {
        const commune = index[parent.parent_id];
        const com = commune && G.communes.find(c => souple(c.nom) === souple(commune.nom));
        const lst = com ? (G.vil[com.nom] || []) : G.lieux;
        noms = lst.filter(v => souple(v.arr) === souple(parent.nom)).map(v => v.nom); type = 'VILLAGE_QUARTIER';
      }
      const deja = new Set(territoires.filter(t => t.parent_id === parent.id && t.type === type).map(t => souple(t.nom)));
      const nouveaux = [...new Set(noms)].filter(n => !deja.has(souple(n))).map(n => ({ type, nom: n, parent_id: parent.id, actif: true, source: 'Référentiel national' }));
      if (!nouveaux.length) return 0;
      return EG.DB.putBatch('territoires', nouveaux, { silencieux: true }).then(recs => { recs.forEach(r => territoires.push(r)); return recs.length; });
    }).catch(() => 0).then(n => { delete enCours[parent.id]; return n; });
    enCours[parent.id] = p;
    return p;
  }

  /** Département / commune par défaut des champs libres (lieu de naissance, résidence…) : ceux de l'école de la session. */
  function defautSession() {
    const s = EG.session; if (!s || !s.ecole_id) { global.CHOIX_GEO_DEFAUT = {}; return Promise.resolve(); }
    return Promise.all([EG.DB.get('ecoles', s.ecole_id), EG.DB.all('territoires')]).then(([e, ts]) => {
      if (!e) return;
      const idx = {}; ts.forEach(t => { idx[t.id] = t; });
      const com = idx[e.commune_id], dep = idx[e.departement_id];
      global.CHOIX_GEO_DEFAUT = { departement: (dep && dep.nom) || '', commune: (com && com.nom) || e.commune || '' };
    }).catch(() => {});
  }

  EG.GeoRef = { completer, defautSession };
})(window);
