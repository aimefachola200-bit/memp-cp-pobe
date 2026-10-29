/* Synchronisation entre niveaux (école → UP → zone → CS → DDEMP) — client et petit « hub » par fichier des applications JS
   (MEMP-CP, DOSP, MEMP-CP Pobè, CS Pobè, Mon école, ÉduGestion Pro / Master), selon le protocole commun
   /home/claude/outils/sync/spec.md (format « memp-sync » v1, paquets .scsync gzip signés Ed25519, HTTP /sync/push et /sync/pull).

   L'application fournit un adaptateur :
     { application, version, edition?, titre, couleur,
       identite: async () => ({ niveau: 'ECOLE'|'UP'|'ZONE'|'CS'|'DDEMP', code, nom, cs?, departement? }),
       objets: async () => [{ type, cle, sens: 'montant'|'descendant'|'les deux', ecole, donnees, liens: { nom: cleLocale } }],
       appliquer: async (o) => ({ cle?, etat }),   // o = { type, cle (locale, ou null si nouveau), uuid, ecole, donnees, liens (clés locales), supprime, emetteur }
       debut?, fin?,                                // avant / après une série d'objets (enregistrement groupé)
       transmission?: async () => objet,             // paquet de transmission existant, joint aux envois montants
       recevoirTransmission?: async (t, emetteur) => message,
       estHub?: () => booléen }
   API : SyncClient.installer(A) → { etat, preparer, preparerFichier, importerOctets, importerFichier, synchroniser, rejoindre, page, cles }.
   Les clés de l'installation sont gardées dans une base à part (« memp-sync-<application> »), hors des sauvegardes ; jamais publiées.
   Conception : Maître Aimé FACHOLA */
(function (global) {
  'use strict';
  if (global.SyncClient) return;
  const FORMAT = 'memp-sync', V = 1, RANG = { ECOLE: 1, UP: 2, ZONE: 3, CS: 4, DDEMP: 5 };
  const LIB = { ECOLE: 'École', UP: 'Unité pédagogique', ZONE: 'Zone pédagogique', CS: 'Circonscription scolaire', DDEMP: 'Direction départementale' };
  const norm = (t) => String(t == null ? '' : t).normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  /** Représentation canonique (clés triées, sans espaces) : base de la signature, identique à json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False) */
  function canon(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(x => canon(x === undefined ? null : x)).join(',') + ']';
    return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  const enc = (t) => new TextEncoder().encode(t), dec = (b) => new TextDecoder().decode(b);
  async function sha256(t) {
    const b = typeof t === 'string' ? enc(t) : t;
    if (global.crypto && crypto.subtle) return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join('');
    let h = 2166136261; for (const x of b) { h ^= x; h = Math.imul(h, 16777619) >>> 0; } return 'f' + h.toString(16);
  }
  const uuid4 = () => (global.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  async function flux(octets, T) { const s = new Blob([octets]).stream().pipeThrough(new T('gzip')); return new Uint8Array(await new Response(s).arrayBuffer()); }
  const gzip = (o) => (typeof CompressionStream !== 'undefined' ? flux(o, CompressionStream) : Promise.resolve(o));
  const gunzip = (o) => (o[0] === 0x1f && o[1] === 0x8b ? (typeof DecompressionStream !== 'undefined' ? flux(o, DecompressionStream) : Promise.reject(new Error('Ce navigateur ne sait pas ouvrir les paquets compressés.'))) : Promise.resolve(o));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const frDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };

  /* Fusion champ par champ (§ 5) : un champ modifié d'un seul côté prend la valeur modifiée ; modifié des deux côtés,
     la valeur du niveau le plus élevé (à niveau égal, la plus récente). */
  function fusionner(base, local, recu, recuPrioritaire) {
    if (!local) return { donnees: recu, conflits: [] };
    if (!base) base = {};
    const out = Object.assign({}, local), conflits = [];
    const cles = new Set(Object.keys(local).concat(Object.keys(recu)));
    cles.forEach(k => {
      const b = canon(base[k]), l = canon(local[k]), r = canon(recu[k]);
      if (r === l) return;
      if (l === b) { out[k] = recu[k]; return; }        // seul l'émetteur a changé ce champ
      if (r === b) return;                               // seul l'appareil local l'a changé
      const retenu = recuPrioritaire ? recu[k] : local[k];
      out[k] = retenu; conflits.push({ champ: k, local: local[k], recu: recu[k], retenu });
    });
    return { donnees: out, conflits };
  }

  function installer(A) {
    A = Object.assign({ titre: 'Application', couleur: '#1F4E79', edition: '' }, A || {});
    const NOM = 'memp-sync-' + (A.base || A.application);   // une base par application, variante et compte (même adresse pour plusieurs applications)
    let base = null;
    const ouvrir = () => base || (base = new Promise((res, rej) => {
      const r = indexedDB.open(NOM, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('base de synchronisation occupée'));
    }));
    async function lire(k, defaut) { const db = await ouvrir(); return new Promise(res => { const q = db.transaction('kv', 'readonly').objectStore('kv').get(k); q.onsuccess = () => res(q.result === undefined ? defaut : q.result); q.onerror = () => res(defaut); }); }
    async function ecrire(k, v) { const db = await ouvrir(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
    async function journal(e) { const h = await lire('historique', []); h.unshift(Object.assign({ date: new Date().toISOString() }, e)); await ecrire('historique', h.slice(0, 200)); }

    /** Clés de l'installation (créées au premier usage) */
    async function cles() {
      let c = await lire('cle', null);
      if (!c) { const k = await global.Ed25519.genererCles(); c = { installation: uuid4(), prive: k.prive, public: k.public, cree: new Date().toISOString() }; await ecrire('cle', c); }
      return c;
    }
    async function emetteur() {
      const c = await cles(), id = await A.identite();
      return { installation: c.installation, cle: c.public, application: A.application, version: A.version || '', edition: A.edition || '', niveau: id.niveau, code: id.code, nom: id.nom, cs: id.cs || '', departement: id.departement || '' };
    }
    async function signer(p) { const c = await cles(); const q = Object.assign({}, p); delete q.signature; return global.Ed25519.signer(c.prive, enc(canon(q))); }
    async function verifierSignature(p) { const q = Object.assign({}, p); delete q.signature; return !!(p.signature && p.emetteur && p.emetteur.cle) && global.Ed25519.verifier(p.emetteur.cle, enc(canon(q)), p.signature); }

    /** Relit les objets de l'application : nouvel objet ou contenu changé → nouveau seq ; objet disparu → tombe (§ 4) */
    async function suivre() {
      const suivi = await lire('suivi', {}), origine = await lire('origine', {});
      let seq = await lire('seq', 0);
      const objets = await A.objets(), vus = new Set();
      for (const o of objets) {
        vus.add(o.cle);
        const emp = await sha256(canon(o.donnees || {}));
        let s = suivi[o.cle];
        if (!s) { s = suivi[o.cle] = { uuid: o.uuid || uuid4(), type: o.type }; }
        if (s.emp !== emp || s.supprime) { s.emp = emp; s.seq = ++seq; s.maj = new Date().toISOString(); delete s.supprime; }
        s.sens = o.sens || 'montant'; s.type = o.type; s.ecole = o.ecole === undefined ? null : o.ecole;
        s.liens = o.liens || {}; s._o = o;
      }
      Object.keys(suivi).forEach(k => { const s = suivi[k]; if (!vus.has(k) && !s.supprime) { s.supprime = true; s.seq = ++seq; s.maj = new Date().toISOString(); } });
      const parCle = {}; Object.keys(suivi).forEach(k => { parCle[k] = suivi[k].uuid; });
      const net = {}; Object.keys(suivi).forEach(k => { const s = Object.assign({}, suivi[k]); delete s._o; net[k] = s; });
      await ecrire('suivi', net); await ecrire('seq', seq);
      return { suivi, parCle, origine, seq };
    }
    /** Paquet montant (vers le hub) ou descendant (du hub vers une entité : dest = installation, ou null pour toutes) */
    async function preparer(o) {
      o = Object.assign({ sens: 'montant', complet: false, dest: null }, o || {});
      const { suivi, parCle, origine, seq } = await suivre();
      const accuses = await lire('accuses', {}), recus = await lire('recus', {});
      const cleDest = o.sens === 'montant' ? 'hub' : (o.dest || '*');
      const depuis = o.complet ? 0 : (accuses[cleDest] || 0);
      const objets = [];
      Object.keys(suivi).forEach(k => {
        const s = suivi[k];
        if (s.seq <= depuis) return;
        const orig = origine[s.uuid];
        if (o.sens === 'montant') {
          if (s.sens === 'descendant') return;
          if (orig && orig.sens === 'descendant') return;          // reçu du hub : ne remonte pas
        } else {
          if (s.sens === 'montant') return;
          if (orig && orig.sens === 'montant') return;             // reçu d'une école : ne redescend pas
          if (o.dest && orig && orig.installation === o.dest) return;
        }
        if (s.supprime && o.complet) return;
        const liens = {}; Object.entries(s.liens || {}).forEach(([n, c]) => { if (parCle[c]) liens[n] = parCle[c]; });
        objets.push({ type: s.type, uuid: s.uuid, seq: s.seq, maj: s.maj, supprime: !!s.supprime, ecole: s.ecole === undefined ? null : s.ecole,
          donnees: s.supprime ? {} : (s._o ? s._o.donnees : {}), liens });
      });
      const em = await emetteur(), hub = await lire('hub', null);
      const p = { format: FORMAT, v: V, id: uuid4(), cree_le: new Date().toISOString(), sens: o.sens, emetteur: em,
        curseur: { de: depuis, a: seq, complet: !!o.complet }, objets };
      if (o.sens === 'montant') {
        if (hub && hub.entite) p.destinataire = { niveau: hub.niveau || '', code: hub.entite || '', nom: hub.nom || '' };
        // accusé du dernier paquet descendant reçu (du hub rejoint, sinon du niveau supérieur le plus récent)
        const moi = em, sup = Object.values(recus).filter(x => x && (RANG[x.niveau] || 0) > (RANG[moi.niveau] || 0)).sort((a, b) => String(b.derniere || '').localeCompare(String(a.derniere || '')));
        const r = (hub && hub.installation && recus[hub.installation]) || sup[0] || null;
        if (r) p.accuse = { paquet: r.dernier || '', seq: r.seq || 0 };
        // paquet de transmission : joint seulement s'il a changé depuis le dernier envoi (ou envoi complet)
        if (A.transmission) { try { const t = await A.transmission(); if (t) { const e = await sha256(canon(Object.assign({}, t, { cree: '', date: '' }))); if (o.complet || e !== (await lire('transmissionEmp', ''))) { p.transmission = t; p._transEmp = e; } } } catch (e) { console.warn('transmission', e); } }
      } else if (o.dest) {
        const r = recus[o.dest]; if (r) { p.destinataire = { niveau: r.niveau, code: r.code, nom: r.nom }; p.accuse = { paquet: r.dernier || '', seq: r.seq || 0 }; }
      }
      const te = p._transEmp; delete p._transEmp;
      p.signature = await signer(p);
      if (te) Object.defineProperty(p, '_transEmp', { value: te, enumerable: false });
      return p;
    }
    async function octetsDe(p) { return gzip(enc(JSON.stringify(p))); }
    function nomFichier(p) { const d = p.cree_le.slice(0, 16).replace(/[-:]/g, '').replace('T', '-'); return 'sync_' + (norm(p.emetteur.code || p.emetteur.nom).replace(/ /g, '-') || 'entite') + (p.sens === 'descendant' ? '_vers_' + (p.destinataire ? norm(p.destinataire.code || p.destinataire.nom).replace(/ /g, '-') : 'toutes') : '') + '_' + d + '.scsync'; }
    async function partager(octets, nom) {
      const blob = new Blob([octets], { type: 'application/gzip' });
      if (A.telecharger) return A.telecharger(nom, blob);
      const f = typeof File !== 'undefined' ? new File([blob], nom, { type: 'application/gzip' }) : null;
      if (f && navigator.canShare && navigator.canShare({ files: [f] }) && matchMedia('(pointer:coarse)').matches) { try { await navigator.share({ files: [f], title: nom }); return; } catch (e) { /* téléchargement */ } }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    }
    /** Fichier montant (ou descendant pour le hub) : prépare, enregistre dans l'historique, partage */
    async function preparerFichier(o) {
      const p = await preparer(o), oct = await octetsDe(p), nom = nomFichier(p);
      await ecrire('dernierEnvoi', p.cree_le); if (p._transEmp) await ecrire('transmissionEmp', p._transEmp);
      await journal({ sens: p.sens, mode: 'fichier', paquet: p.id, objets: p.objets.length, statut: 'préparé', message: nom });
      await partager(oct, nom);
      return { paquet: p, nom, octets: oct };
    }

    /** Import d'un paquet (fichier ou réponse HTTP) : contrôles, épinglage de la clé, application des objets (§ 2, 4, 5) */
    async function importerOctets(octets, mode) {
      let p;
      try { p = JSON.parse(dec(await gunzip(octets instanceof Uint8Array ? octets : new Uint8Array(octets)))); } catch (e) { throw new Error('Fichier illisible : ce n’est pas un paquet de synchronisation.'); }
      if (!p || p.format !== FORMAT || p.v !== V) throw new Error('Ce fichier n’est pas un paquet de synchronisation (memp-sync v1).');
      if (!(await verifierSignature(p))) { await journal({ sens: p.sens, mode, paquet: p.id, objets: 0, statut: 'refusé', message: 'signature invalide' }); throw new Error('Signature invalide : le paquet a été modifié ou ne vient pas de l’application indiquée. Il est refusé.'); }
      const moi = await A.identite(), c = await cles(), em = p.emetteur;
      if (em.installation === c.installation) throw new Error('Ce paquet a été préparé par cet appareil.');
      const rm = RANG[moi.niveau] || 0, re = RANG[em.niveau] || 0;
      if (p.sens === 'montant' && !(re < rm)) throw new Error('Ce paquet vient d’un niveau qui n’est pas inférieur au vôtre (' + (LIB[em.niveau] || em.niveau) + ').');
      if (p.sens === 'descendant' && !(re > rm)) throw new Error('Ce paquet vient d’un niveau qui n’est pas supérieur au vôtre (' + (LIB[em.niveau] || em.niveau) + ').');
      if (p.destinataire && p.destinataire.code && moi.code && norm(p.destinataire.code) !== norm(moi.code) && norm(p.destinataire.nom || '') !== norm(moi.nom || ''))
        throw new Error('Ce paquet est destiné à ' + (p.destinataire.nom || p.destinataire.code) + ', pas à cet appareil.');
      const epingles = await lire('epingles', {});
      if (epingles[em.installation] && epingles[em.installation] !== em.cle) {
        const att = await lire('clesEnAttente', {}); att[em.installation] = { cle: em.cle, nom: em.nom, niveau: em.niveau, date: new Date().toISOString() }; await ecrire('clesEnAttente', att);
        await journal({ sens: p.sens, mode, paquet: p.id, objets: 0, statut: 'refusé', message: 'clé différente de la clé connue de ' + em.nom });
        throw new Error('Ce paquet est signé par une autre clé que celle connue pour ' + em.nom + ' (changement d’appareil ?). Vérifiez auprès de l’expéditeur, puis « Accepter la nouvelle clé » dans la synchronisation.');
      }
      if (!epingles[em.installation]) { epingles[em.installation] = em.cle; await ecrire('epingles', epingles); }
      const recus = await lire('recus', {}), r = recus[em.installation] = recus[em.installation] || { paquets: [], seq: 0 };
      if ((r.paquets || []).indexOf(p.id) >= 0) { await journal({ sens: p.sens, mode, paquet: p.id, objets: 0, statut: 'déjà reçu', message: em.nom }); return { deja: true, appliques: 0, conflits: 0, emetteur: em }; }
      // l'émetteur accuse ce qu'il a reçu de nous
      const accuses = await lire('accuses', {});
      if (p.accuse && typeof p.accuse.seq === 'number') { const k = p.sens === 'descendant' ? 'hub' : em.installation; accuses[k] = Math.max(accuses[k] || 0, p.accuse.seq); await ecrire('accuses', accuses); }
      // objets
      const suivi = await lire('suivi', {}), origine = await lire('origine', {}), bases = await lire('bases', {});
      const parUuid = {}; Object.keys(suivi).forEach(k => { parUuid[suivi[k].uuid] = k; });
      const courant = {}; (await A.objets()).forEach(o => { courant[o.cle] = o; });
      const conflits = await lire('conflits', []); let appliques = 0, nconf = 0;
      if (A.debut) await A.debut();
      try {
        for (const o of (p.objets || []).slice().sort((a, b) => (a.seq || 0) - (b.seq || 0))) {
          const cleL = parUuid[o.uuid] || null;
          const liens = {}; Object.entries(o.liens || {}).forEach(([n, u]) => { if (parUuid[u]) liens[n] = parUuid[u]; });
          if (o.supprime) {
            if (cleL && origine[o.uuid] && origine[o.uuid].installation === em.installation) { await A.appliquer({ type: o.type, cle: cleL, uuid: o.uuid, supprime: true, ecole: o.ecole, donnees: {}, liens, emetteur: em }); delete bases[o.uuid]; appliques++; }
            continue;
          }
          let donnees = o.donnees || {};
          const loc = cleL && courant[cleL] ? courant[cleL].donnees : null;
          if (loc && o.type !== 'version') {   // versions pédagogiques : ajoutées à l'historique, jamais fusionnées champ par champ
            const f = fusionner(bases[o.uuid], loc, donnees, re >= rm);
            donnees = f.donnees;
            f.conflits.forEach(x => { conflits.unshift(Object.assign({ date: new Date().toISOString(), type: o.type, uuid: o.uuid, cle: cleL, emetteur: em.nom, niveau: em.niveau }, x)); nconf++; });
          }
          const res = await A.appliquer({ type: o.type, cle: cleL, uuid: o.uuid, supprime: false, ecole: o.ecole, donnees, liens, emetteur: em }) || {};
          const nouvelle = res.cle || cleL;
          if (nouvelle) {
            parUuid[o.uuid] = nouvelle;
            const s = suivi[nouvelle] = suivi[nouvelle] || { uuid: o.uuid, type: o.type };
            s.uuid = o.uuid;   // l'uuid d'origine est gardé à vie (relais vers le niveau supérieur)
          }
          origine[o.uuid] = { installation: em.installation, sens: p.sens, niveau: em.niveau, nom: em.nom };
          bases[o.uuid] = o.donnees || {};
          appliques++;
        }
      } finally { if (A.fin) await A.fin(); }
      let msgT = '';
      if (p.transmission && A.recevoirTransmission) { try { msgT = (await A.recevoirTransmission(p.transmission, em)) || ''; } catch (e) { msgT = 'transmission : ' + e.message; } }
      r.paquets = (r.paquets || []).concat([p.id]).slice(-100); r.seq = Math.max(r.seq || 0, (p.curseur && p.curseur.a) || 0); r.dernier = p.id;
      Object.assign(r, { niveau: em.niveau, code: em.code, nom: em.nom, application: em.application, cle: em.cle, derniere: new Date().toISOString() });
      await ecrire('recus', recus); await ecrire('suivi', suivi); await ecrire('origine', origine); await ecrire('bases', bases); await ecrire('conflits', conflits.slice(0, 500));
      await ecrire('derniereReception', new Date().toISOString());
      await journal({ sens: p.sens, mode, paquet: p.id, objets: appliques, statut: 'reçu', message: em.nom + (nconf ? ' — ' + nconf + ' conflit(s) à revoir' : '') + (msgT ? ' — ' + msgT : '') });
      return { appliques, conflits: nconf, emetteur: em, transmission: msgT };
    }
    async function importerFichier(f) { return importerOctets(new Uint8Array(await f.arrayBuffer()), 'fichier'); }

    /* ---------------- HTTP (hub SCOLARIS cs / ddemp) ---------------- */
    function lireInvitation(t) {
      t = String(t || '').trim();
      const m = /^memp-sync:1\?(.*)$/i.exec(t);
      if (!m) throw new Error('Code d’invitation non reconnu (il commence par « memp-sync:1? »).');
      const q = new URLSearchParams(m[1]);
      const u = q.get('u') || '', c = q.get('c') || '';
      if (!/^https?:\/\//i.test(u) || !c) throw new Error('Invitation incomplète : adresse du hub et code d’accès attendus.');
      return { url: u.replace(/\/+$/, ''), code: c, entite: q.get('e') || '', nom: q.get('n') || '' };
    }
    /** Rejoindre un hub : texte du QR code, ou { url, code } */
    async function rejoindre(x) {
      const h = typeof x === 'string' ? lireInvitation(x) : Object.assign({}, x, { url: String(x.url || '').replace(/\/+$/, '') });
      if (!h.url) throw new Error('Adresse du hub manquante.');
      const ancien = await lire('hub', {}) || {};
      let info = null;
      try { const r = await fetch(h.url + '/sync/info', { cache: 'no-store' }); if (r.ok) info = await r.json(); } catch (e) { info = null; }
      const hub = Object.assign({}, ancien, h, info ? { niveau: info.niveau || '', nomHub: info.nom || '', cleHub: info.cle || '' } : {}, { rejoint: new Date().toISOString() });
      await ecrire('hub', hub);
      await journal({ sens: '—', mode: 'http', paquet: '', objets: 0, statut: 'rejoint', message: (hub.nomHub || hub.url) + (info ? '' : ' (hub injoignable pour le moment)') });
      return hub;
    }
    async function synchroniser(o) {
      const hub = await lire('hub', null);
      if (!hub || !hub.url) throw new Error('Aucun hub rejoint : utilisez « Rejoindre » (code QR du hub) ou les fichiers.');
      const p = await preparer({ sens: 'montant', complet: !!(o && o.complet) });
      const corps = await octetsDe(p);
      let r;
      try { r = await fetch(hub.url + '/sync/push', { method: 'POST', headers: { 'Content-Type': 'application/gzip', 'X-Scolaris-Code': hub.code }, body: corps }); }
      catch (e) { await journal({ sens: 'montant', mode: 'http', paquet: p.id, objets: p.objets.length, statut: 'échec', message: 'hub injoignable' }); throw new Error('Le hub ne répond pas (pas de connexion ?). Réessayez plus tard ou passez par un fichier.'); }
      let j = {}; try { j = await r.json(); } catch (e) { j = {}; }
      if (!r.ok || j.ok === false) { await journal({ sens: 'montant', mode: 'http', paquet: p.id, objets: p.objets.length, statut: 'refusé', message: j.message || ('HTTP ' + r.status) }); throw new Error(j.message || ('Envoi refusé par le hub (HTTP ' + r.status + ').')); }
      const accuses = await lire('accuses', {}); if (j.accuse && typeof j.accuse.seq === 'number') { accuses.hub = Math.max(accuses.hub || 0, j.accuse.seq); await ecrire('accuses', accuses); }
      await ecrire('dernierEnvoi', p.cree_le); if (p._transEmp) await ecrire('transmissionEmp', p._transEmp);
      await journal({ sens: 'montant', mode: 'http', paquet: p.id, objets: p.objets.length, statut: 'envoyé', message: (j.message || '') + (j.conflits ? ' — ' + j.conflits + ' conflit(s) au hub' : '') });
      // réception : objets descendants depuis le dernier reçu
      const recus = await lire('recus', {}), rh = Object.values(recus).find(x => x && x.cle && (x.cle === hub.cleHub)) || null;
      let rp;
      try { rp = await fetch(hub.url + '/sync/pull?depuis=' + ((rh && rh.seq) || 0), { headers: { 'X-Scolaris-Code': hub.code }, cache: 'no-store' }); }
      catch (e) { return { envoyes: p.objets.length, recus: 0, message: 'Envoi fait ; réception impossible pour le moment.' }; }
      if (rp.status === 204) return { envoyes: p.objets.length, recus: 0 };
      if (!rp.ok) { let m = ''; try { m = (await rp.json()).message; } catch (e) { /* rien */ } throw new Error(m || ('Réception refusée par le hub (HTTP ' + rp.status + ').')); }
      const oct = new Uint8Array(await rp.arrayBuffer());
      const res = await importerOctets(oct, 'http');
      if (res.emetteur && !hub.installation) { hub.installation = res.emetteur.installation; hub.cleHub = hub.cleHub || res.emetteur.cle; await ecrire('hub', hub); }
      return { envoyes: p.objets.length, recus: res.appliques, conflits: res.conflits };
    }

    async function etat() {
      const [c, hub, h, cf, rec, acc, de, dr, att] = await Promise.all([cles(), lire('hub', null), lire('historique', []), lire('conflits', []), lire('recus', {}), lire('accuses', {}), lire('dernierEnvoi', null), lire('derniereReception', null), lire('clesEnAttente', {})]);
      const { suivi } = await suivre();
      const enAttente = {}; Object.values(suivi).forEach(s => { if (s.seq > (acc.hub || 0) && s.sens !== 'descendant') enAttente[s.type] = (enAttente[s.type] || 0) + 1; });
      return { identite: await A.identite(), cle: c.public, installation: c.installation, hub, historique: h, conflits: cf, recus: rec, accuses: acc, dernierEnvoi: de, derniereReception: dr, enAttente, clesEnAttente: att };
    }
    async function accepterCle(installation) {
      const att = await lire('clesEnAttente', {}), ep = await lire('epingles', {});
      if (!att[installation]) return false;
      ep[installation] = att[installation].cle; delete att[installation];
      await ecrire('epingles', ep); await ecrire('clesEnAttente', att);
      await journal({ sens: '—', mode: '—', paquet: '', objets: 0, statut: 'clé acceptée', message: installation.slice(0, 8) });
      return true;
    }
    async function garderAutre(i) {
      const cf = await lire('conflits', []), x = cf[i]; if (!x) return;
      const courant = {}; (await A.objets()).forEach(o => { courant[o.cle] = o; });
      const o = courant[x.cle]; if (!o) return;
      const autre = canon(x.retenu) === canon(x.recu) ? x.local : x.recu;
      const d = Object.assign({}, o.donnees, { [x.champ]: autre });
      if (A.debut) await A.debut();
      try { await A.appliquer({ type: o.type, cle: x.cle, uuid: x.uuid, supprime: false, ecole: o.ecole, donnees: d, liens: o.liens || {}, emetteur: null }); } finally { if (A.fin) await A.fin(); }
      cf.splice(i, 1); await ecrire('conflits', cf);
    }
    async function resoudre(i) { const cf = await lire('conflits', []); cf.splice(i, 1); await ecrire('conflits', cf); }

    /* ---------------- page « Synchronisation » (§ 7) ---------------- */
    async function page(racine) {
      const S = await etat(), hub = !!(A.estHub && A.estHub());
      const ic = (n) => (global.Icones && global.Icones.icone ? global.Icones.icone(n, { taille: 16 }) : '');
      const b = (a, t, n, p) => '<button type="button" data-sync="' + a + '" class="sync-btn' + (p ? ' p' : '') + '">' + ic(n) + ' ' + esc(t) + '</button>';
      const entites = Object.entries(S.recus).filter(([, r]) => r && RANG[r.niveau] < RANG[S.identite.niveau]);
      racine.innerHTML = '<style>.sync{font-size:.92rem;color:#1D2939}.sync h3{margin:14px 0 6px;font-size:1rem;color:' + A.couleur + '}.sync-carte{background:#fff;border:1px solid #D0D5DD;border-radius:10px;padding:12px 14px;margin:0 0 12px;overflow-wrap:anywhere}'
        + '.sync-btn{display:inline-flex;align-items:center;gap:4px;min-height:40px;border:1px solid #D0D5DD;border-radius:8px;background:#fff;padding:0 12px;font:inherit;cursor:pointer;margin:3px 4px 3px 0}.sync-btn.p{background:' + A.couleur + ';border-color:' + A.couleur + ';color:#fff;font-weight:600}.sync-btn svg{width:16px;height:16px}'
        + '.sync-tw{overflow:auto;max-height:50vh;border:1px solid #EAECF0;border-radius:8px}.sync table{border-collapse:collapse;width:100%;font-size:.84rem}.sync th{position:sticky;top:0;background:#F2F4F7;text-align:left;padding:6px 8px;font-size:.74rem;text-transform:uppercase}.sync td{padding:6px 8px;border-top:1px solid #EAECF0;vertical-align:top}'
        + '.sync-msg{min-height:1.3em;margin:8px 0;font-weight:600}.sync-dl{display:grid;grid-template-columns:minmax(140px,35%) 1fr;gap:3px 10px}.sync-dl dt{font-weight:600;color:#344054}.sync-dl dd{margin:0}@media(max-width:600px){.sync-dl{grid-template-columns:1fr}}</style>'
        + '<div class="sync" data-sync="page">'
        + '<div class="sync-carte"><h3>' + ic('synchro') + ' État de la synchronisation</h3><dl class="sync-dl">'
        + '<dt>Cet appareil</dt><dd>' + esc((LIB[S.identite.niveau] || S.identite.niveau) + ' — ' + (S.identite.nom || '')) + '</dd>'
        + '<dt>Niveau supérieur</dt><dd data-sync="hub">' + (S.hub && S.hub.url ? esc((S.hub.nomHub || S.hub.nom || 'Hub') + ' — ' + S.hub.url) : 'par fichier (aucun hub rejoint)') + '</dd>'
        + '<dt>Clé de l’appareil</dt><dd><code>' + esc(S.cle.slice(0, 8)) + '…</code></dd>'
        + '<dt>Dernier envoi</dt><dd>' + (S.dernierEnvoi ? frDate(S.dernierEnvoi) : 'jamais') + ' · accusé jusqu’au n° ' + (S.accuses.hub || 0) + '</dd>'
        + '<dt>Dernière réception</dt><dd>' + (S.derniereReception ? frDate(S.derniereReception) : 'jamais') + '</dd>'
        + '<dt>Changements en attente</dt><dd data-sync="attente">' + (Object.keys(S.enAttente).length ? Object.entries(S.enAttente).map(([t, n]) => esc(t) + ' : ' + n).join(' · ') : 'aucun') + '</dd></dl></div>'
        + '<div class="sync-carte"><h3>Actions</h3>'
        + (S.hub && S.hub.url ? b('synchroniser', 'Synchroniser maintenant', 'synchro', true) : '')
        + (S.identite.niveau !== 'DDEMP' ? b('fichier', 'Préparer le fichier pour le niveau supérieur', 'telecharger', !(S.hub && S.hub.url)) : '')
        + (hub ? b('descendant', 'Préparer le fichier pour les entités inférieures', 'telecharger') : '')
        + '<label class="sync-btn">' + ic('importer') + ' Importer un fichier reçu<input type="file" accept=".scsync,application/gzip,application/octet-stream" data-sync="importer" multiple style="display:none"></label>'
        + (S.identite.niveau !== 'DDEMP' ? b('rejoindre', 'Rejoindre un hub (code QR)', 'qr') : '')
        + (S.identite.niveau !== 'DDEMP' ? b('complet', 'Envoi complet', 'actualiser') : '')
        + '<p class="sync-msg" data-sync="msg" role="status"></p></div>'
        + (hub || entites.length ? '<div class="sync-carte"><h3>Entités inférieures</h3>' + (entites.length ? '<div class="sync-tw"><table><thead><tr><th>Entité</th><th>Dernier paquet reçu</th><th>N°</th><th>Clé</th><th>Retard</th><th></th></tr></thead><tbody>'
          + entites.map(([inst, r]) => '<tr><td>' + esc((LIB[r.niveau] || r.niveau) + ' — ' + r.nom) + '</td><td>' + frDate(r.derniere) + '</td><td>' + (r.seq || 0) + '</td><td><code>' + esc(String(r.cle || '').slice(0, 8)) + '</code></td><td>'
            + Math.floor((Date.now() - new Date(r.derniere).getTime()) / 86400000) + ' j</td><td>' + b('descendant:' + inst, 'Fichier pour cette entité', 'telecharger') + '</td></tr>').join('') + '</tbody></table></div>' : '<p>Aucun paquet reçu pour le moment.</p>') + '</div>' : '')
        + (Object.keys(S.clesEnAttente).length ? '<div class="sync-carte"><h3>Clés à confirmer</h3>' + Object.entries(S.clesEnAttente).map(([i, x]) => '<p>' + esc(x.nom) + ' (' + esc(LIB[x.niveau] || x.niveau) + ') envoie avec une nouvelle clé <code>' + esc(x.cle.slice(0, 8)) + '…</code> ' + b('cle:' + i, 'Accepter la nouvelle clé', 'cle') + '</p>').join('') + '</div>' : '')
        + '<div class="sync-carte"><h3>Conflits à revoir (' + S.conflits.length + ')</h3>' + (S.conflits.length ? '<div class="sync-tw"><table data-sync="conflits"><thead><tr><th>Date</th><th>Élément</th><th>Champ</th><th>Valeur locale</th><th>Valeur reçue</th><th>Retenue</th><th></th></tr></thead><tbody>'
          + S.conflits.map((x, i) => '<tr><td>' + frDate(x.date) + '</td><td>' + esc(x.type) + '<br><small>' + esc(x.emetteur || '') + '</small></td><td>' + esc(x.champ) + '</td><td>' + esc(canon(x.local)) + '</td><td>' + esc(canon(x.recu)) + '</td><td>' + esc(canon(x.retenu)) + '</td><td>'
            + b('autre:' + i, 'Garder l’autre valeur', 'actualiser') + b('ok:' + i, 'C’est bon', 'valider') + '</td></tr>').join('') + '</tbody></table></div>' : '<p>Aucun conflit.</p>') + '</div>'
        + '<div class="sync-carte"><h3>Historique</h3>' + (S.historique.length ? '<div class="sync-tw"><table data-sync="historique"><thead><tr><th>Date</th><th>Sens</th><th>Mode</th><th>Objets</th><th>Statut</th><th>Message</th></tr></thead><tbody>'
          + S.historique.slice(0, 60).map(x => '<tr><td>' + frDate(x.date) + '</td><td>' + esc(x.sens) + '</td><td>' + esc(x.mode) + '</td><td>' + (x.objets || 0) + '</td><td>' + esc(x.statut) + '</td><td>' + esc(x.message || '') + '</td></tr>').join('') + '</tbody></table></div>' : '<p>Rien pour le moment.</p>') + '</div>'
        + '</div>';
      const msg = racine.querySelector('[data-sync="msg"]');
      const dire = (t, ok) => { msg.textContent = t; msg.style.color = ok === false ? '#B42318' : '#067647'; };
      const action = (f) => async () => { try { await f(); } catch (e) { dire(e.message, false); return; } };
      const rafraichir = () => page(racine);
      racine.querySelectorAll('[data-sync]').forEach(el => {
        const a = el.getAttribute('data-sync');
        if (el.tagName === 'INPUT') {
          el.onchange = action(async () => {
            const fs = [...(el.files || [])]; let n = 0, c = 0; const msgs = [];
            for (const f of fs) { try { const r = await importerFichier(f); n += r.appliques; c += r.conflits; msgs.push(r.deja ? f.name + ' : déjà reçu' : f.name + ' : ' + r.appliques + ' élément(s) de ' + r.emetteur.nom); } catch (e) { msgs.push(f.name + ' : ' + e.message); } }
            await rafraichir(); racine.querySelector('[data-sync="msg"]').textContent = msgs.join(' · ') + (c ? ' — ' + c + ' conflit(s) à revoir' : '');
          });
          return;
        }
        if (el.tagName !== 'BUTTON') return;
        el.onclick = action(async () => {
          if (a === 'synchroniser') { dire('Synchronisation en cours…'); const r = await synchroniser(); await rafraichir(); racine.querySelector('[data-sync="msg"]').textContent = r.envoyes + ' élément(s) envoyé(s), ' + r.recus + ' reçu(s)' + (r.conflits ? ', ' + r.conflits + ' conflit(s)' : '') + '.'; }
          else if (a === 'fichier' || a === 'complet') { const r = await preparerFichier({ sens: 'montant', complet: a === 'complet' }); await rafraichir(); racine.querySelector('[data-sync="msg"]').textContent = 'Fichier « ' + r.nom + ' » prêt (' + r.paquet.objets.length + ' élément(s)) : remettez-le au niveau supérieur (WhatsApp, clé USB, courriel).'; }
          else if (a === 'descendant' || a.startsWith('descendant:')) { const dest = a.includes(':') ? a.split(':')[1] : null; const r = await preparerFichier({ sens: 'descendant', dest }); await rafraichir(); racine.querySelector('[data-sync="msg"]').textContent = 'Fichier « ' + r.nom + ' » prêt (' + r.paquet.objets.length + ' élément(s)).'; }
          else if (a === 'rejoindre') {
            const t = prompt('Collez le texte du code QR du hub (memp-sync:1?u=…&c=…), ou l’adresse du hub :'); if (!t) return;
            let h; if (/^memp-sync:/i.test(t.trim())) h = await rejoindre(t); else { const c = prompt('Code d’accès donné par le hub :'); if (!c) return; h = await rejoindre({ url: t.trim(), code: c.trim() }); }
            await rafraichir(); racine.querySelector('[data-sync="msg"]').textContent = 'Hub rejoint : ' + (h.nomHub || h.url) + '.';
          } else if (a.startsWith('cle:')) { await accepterCle(a.slice(4)); await rafraichir(); }
          else if (a.startsWith('autre:')) { await garderAutre(+a.slice(6)); await rafraichir(); }
          else if (a.startsWith('ok:')) { await resoudre(+a.slice(3)); await rafraichir(); }
        });
      });
    }
    return { etat, preparer, preparerFichier, octetsDe, importerOctets, importerFichier, synchroniser, rejoindre, lireInvitation, page, cles, accepterCle, garderAutre, _lire: lire, _ecrire: ecrire };
  }
  global.SyncClient = { installer, canon, fusionner, norm, RANG, LIB_NIVEAU: LIB };
})(typeof window !== 'undefined' ? window : globalThis);
