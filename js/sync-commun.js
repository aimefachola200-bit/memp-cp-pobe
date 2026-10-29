/* Synchronisation — objets communs aux applications JS (moteurs partagés UASCEP, PVS « Pilotage et vie scolaire » et
   Pédagogie) : bureaux et membres UASCEP, vie des bureaux et rapports, registres partagés (sport, examens, patrimoine,
   communication, pilotage), versions d'épreuves / fiches / résumés. Même schéma dans toutes les applications : un objet
   envoyé par Mon école est compris par CS Pobè, MEMP-CP (CP, CCS, DDEMP) et ÉduGestion. Voir /home/claude/outils/sync/spec.md § 6.
   Les identifiants d'école sont remplacés par un code commun (code de l'école, sinon « NOM:<nom normalisé> ») ; les images
   (signatures, cachets, logos importés) et les données personnelles sensibles ne sont jamais envoyées.
   SyncCommun.creer({ uascep: {charger, enregistrer}, pvs: {charger, enregistrer}, pedagogie: {charger, enregistrer},
     ecoleCode: (idLocal) => ({ code, nom }) | null, ecoleLocale: (code, nom) => idLocal | null }) → { objets, appliquer, debut, fin }
   Conception : Maître Aimé FACHOLA */
(function (global) {
  'use strict';
  if (global.SyncCommun) return;
  const MONTANT = { 'sport:licences': 1, 'sport:competitions': 1, 'sport:matchs': 1, 'sport:resultats': 1, 'sport:palmares': 1, 'sport:performances': 1,
    'examens:candidats': 1, 'examens:concours': 1, 'examens:participants': 1, 'patrimoine:besoins': 1, 'communication:lectures': 1, 'pilotage:indicateurs': 1 };
  const DESCENDANT = { 'communication:notes': 1, 'communication:echeances': 1, 'communication:agenda': 1 };
  const SANS_IMAGES = (o) => { const x = Object.assign({}, o); ['signature', 'signatureLe', 'cachetImage', 'photo', 'image'].forEach(k => delete x[k]); if (x.logo && x.logo.image) x.logo = Object.assign({}, x.logo, { image: '' }); return x; };
  const SANS_ELEVE = (o) => { const x = Object.assign({}, o); Object.keys(x).forEach(k => { if (/^(eleve|eleveId|eleve_id|apprenant|apprenantId|matriculeEleve|npiEleve)$/.test(k)) delete x[k]; }); delete x.maj; return x; };
  const norm = (t) => String(t == null ? '' : t).normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\b(EPP|EPM|EM|EP|ECOLE|CS|LE|LA|LES|DE|DU|DES)\b/g, ' ').replace(/[^A-Z0-9]+/g, ' ').trim();
  function onglets() {
    const C = global.PVS_CATALOGUE; const out = [];
    if (!C) return out;
    Object.values(C.MODULES).forEach(m => (m.onglets || []).forEach(o => { if (o.coll) out.push({ type: 'reg:' + m.id + ':' + o.id, coll: o.coll }); }));
    return out;
  }
  function creer(S) {
    let U = null, P = null, N = null, changeU = false, changeP = false, changeN = false;
    const code = (id) => { if (id === undefined || id === null || id === '') return null; const c = S.ecoleCode && S.ecoleCode(id); if (!c) return null; return c.code ? String(c.code) : 'NOM:' + norm(c.nom); };
    const nomEc = (id) => { const c = S.ecoleCode && S.ecoleCode(id); return c ? c.nom || '' : ''; };
    const local = (cd, nom) => { if (!cd) return null; const id = S.ecoleLocale && S.ecoleLocale(String(cd).replace(/^NOM:/, ''), nom || '', String(cd).startsWith('NOM:')); return id === undefined ? null : id; };
    async function charger() {
      U = S.uascep ? ((await S.uascep.charger()) || {}) : null; if (U) { U.bureaux = U.bureaux || []; U.membres = U.membres || []; }
      P = S.pvs ? ((await S.pvs.charger()) || {}) : null;
      N = S.pedagogie ? ((await S.pedagogie.charger()) || {}) : null;
    }
    /** Objets de l'appareil, sous leur forme d'échange (sync-client § 6) */
    async function objets() {
      await charger();
      const l = [];
      if (U) {
        const bur = {};
        U.bureaux.forEach(b => {
          const d = SANS_IMAGES(b); delete d.maj; let ec = null;
          if (b.niveau === 'ECOLE') { ec = code(b.entite); if (ec) { d.entite = ec; d._ecoleNom = nomEc(b.entite) || b.entiteLib || ''; } delete d.ecoleId; }
          bur[b.id] = ec;
          l.push({ type: 'uascep_bureaux', cle: 'ub:' + b.id, sens: 'montant', ecole: ec, donnees: d, liens: {} });
        });
        U.membres.forEach(m => { const d = SANS_IMAGES(m); delete d.maj; delete d.ecoleId; l.push({ type: 'uascep_membres', cle: 'um:' + m.id, sens: 'montant', ecole: bur[m.bureauId] || null, donnees: d, liens: { bureau: 'ub:' + m.bureauId } }); });
        ((global.UASCEP && global.UASCEP.COLLECTIONS) || []).forEach(c => (U[c] || []).forEach(r => {
          const d = Object.assign({ collection: c }, SANS_IMAGES(r)); delete d.maj;
          l.push({ type: c === 'rapports' ? 'uascep_rapports' : 'uascep_vie', cle: 'uv:' + c + ':' + r.id, sens: 'montant', ecole: bur[r.bureauId] || null, donnees: d, liens: { bureau: 'ub:' + r.bureauId } });
        }));
      }
      if (P) onglets().forEach(({ type, coll }) => {
        const sens = MONTANT[type.slice(4)] ? 'montant' : DESCENDANT[type.slice(4)] ? 'descendant' : null;
        if (!sens) return;   // santé, besoins spécifiques, inspection individuelle… : ne quittent pas l'appareil
        (P[coll] || []).forEach(r => {
          const d = SANS_ELEVE(r); let ec = null;
          if (r.niveau === 'ECOLE') { ec = code(r.entite); if (ec) { d.entite = ec; d._ecoleNom = nomEc(r.entite); } }
          l.push({ type, cle: 'rg:' + coll + ':' + r.id, sens, ecole: ec, donnees: d, liens: {} });
        });
      });
      if (N) Object.entries(N).forEach(([k, v]) => {
        const m = /^version:(fiche|resume|epreuve):(.+)$/.exec(k);
        if (!m || !Array.isArray(v) || !v.length) return;
        const der = v[v.length - 1];
        l.push({ type: 'version', cle: 'pv:' + k, sens: 'les deux', ecole: null,
          donnees: { type: m[1], cle: m[2], titre: (der.data && (der.data.titre || (der.data.entete && der.data.entete.titre))) || m[2], contenu: der.data || {}, auteur: der.auteur || '', date: der.date || '', versions: v.length }, liens: {} });
      });
      return l;
    }
    const idDe = (o, pref) => (o.cle ? o.cle.slice(pref.length) : 'S' + String(o.uuid).replace(/-/g, '').slice(0, 12));
    async function debut() { await charger(); changeU = changeP = changeN = false; }
    async function fin() {
      if (U && changeU) await S.uascep.enregistrer(U);
      if (P && changeP) await S.pvs.enregistrer(P);
      if (N && changeN) await S.pedagogie.enregistrer(N);
      changeU = changeP = changeN = false;
    }
    function upsert(liste, id, x, garder) {
      const i = liste.findIndex(r => r.id === id);
      if (i >= 0) { const anc = liste[i]; const n = Object.assign({}, x, { id }); (garder || []).forEach(k => { if (anc[k] !== undefined && (n[k] === undefined || n[k] === '')) n[k] = anc[k]; }); if (anc.logo && anc.logo.image && n.logo) n.logo = Object.assign({}, n.logo, { image: anc.logo.image }); liste[i] = n; }
      else liste.push(Object.assign({}, x, { id }));
    }
    /** Applique un objet reçu (création, mise à jour, tombe) ; rend { cle } */
    async function appliquer(o) {
      const t = o.type;
      if (t === 'uascep_bureaux' && U) {
        const id = idDe(o, 'ub:');
        if (o.supprime) { U.bureaux = U.bureaux.filter(b => b.id !== id); changeU = true; return { cle: 'ub:' + id }; }
        const d = Object.assign({}, o.donnees); delete d._ecoleNom;
        if (d.niveau === 'ECOLE') { const li = local(o.donnees.entite, o.donnees._ecoleNom); if (li !== null) { d.entite = String(li); d.ecoleId = li; } else d.entiteLib = d.entiteLib || o.donnees._ecoleNom || ''; }
        upsert(U.bureaux, id, d, ['signature']); changeU = true; return { cle: 'ub:' + id };
      }
      if (t === 'uascep_membres' && U) {
        const id = idDe(o, 'um:');
        if (o.supprime) { U.membres = U.membres.filter(m => m.id !== id); changeU = true; return { cle: 'um:' + id }; }
        const d = Object.assign({}, o.donnees); if (o.liens.bureau) d.bureauId = o.liens.bureau.slice(3);
        const b = U.bureaux.find(x => x.id === d.bureauId); if (b && b.ecoleId !== undefined) d.ecoleId = b.ecoleId;
        upsert(U.membres, id, d, ['signature', 'signatureLe', 'cachetImage']); changeU = true; return { cle: 'um:' + id };
      }
      if ((t === 'uascep_vie' || t === 'uascep_rapports') && U) {
        const c = (o.donnees && o.donnees.collection) || (o.cle ? o.cle.split(':')[1] : (t === 'uascep_rapports' ? 'rapports' : ''));
        if (!c) return {};
        const id = o.cle ? o.cle.split(':').slice(2).join(':') : 'S' + String(o.uuid).replace(/-/g, '').slice(0, 12);
        U[c] = U[c] || [];
        if (o.supprime) { U[c] = U[c].filter(r => r.id !== id); changeU = true; return { cle: 'uv:' + c + ':' + id }; }
        const d = Object.assign({}, o.donnees); delete d.collection; if (o.liens.bureau) d.bureauId = o.liens.bureau.slice(3);
        upsert(U[c], id, d); changeU = true; return { cle: 'uv:' + c + ':' + id };
      }
      if (t.startsWith('reg:') && P) {
        const og = onglets().find(x => x.type === t); if (!og) return {};
        const c = og.coll, id = o.cle ? o.cle.split(':').slice(2).join(':') : 'S' + String(o.uuid).replace(/-/g, '').slice(0, 12);
        P[c] = P[c] || [];
        if (o.supprime) { P[c] = P[c].filter(r => r.id !== id); changeP = true; return { cle: 'rg:' + c + ':' + id }; }
        const d = Object.assign({}, o.donnees); delete d._ecoleNom;
        if (d.niveau === 'ECOLE') { const li = local(o.donnees.entite, o.donnees._ecoleNom); if (li !== null) d.entite = String(li); }
        upsert(P[c], id, d); changeP = true; return { cle: 'rg:' + c + ':' + id };
      }
      if (t === 'version' && N) {
        const d = o.donnees || {}; if (!d.type || !d.cle) return {};
        const k = 'version:' + d.type + ':' + d.cle;
        if (o.supprime) return { cle: 'pv:' + k };
        const l = N[k] = N[k] || [];
        if (!l.some(v => v.date === d.date && v.auteur === d.auteur)) { l.push({ data: d.contenu || {}, date: d.date || new Date().toISOString(), auteur: d.auteur || (o.emetteur && o.emetteur.nom) || '' }); l.sort((a, b) => String(a.date).localeCompare(String(b.date))); changeN = true; }
        return { cle: 'pv:' + k };
      }
      return {};
    }
    return { objets, appliquer, debut, fin };
  }
  global.SyncCommun = { creer, MONTANT, DESCENDANT, norm };
})(typeof window !== 'undefined' ? window : globalThis);
