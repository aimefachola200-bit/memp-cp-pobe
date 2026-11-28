/* ÉduGestion Pro Master — couche de données locale (IndexedDB), hors-ligne d'abord. */
(function (global) {
  'use strict';

  const EG = global.EG;
  /* Variante Master : sur github.io, où ÉduGestion Pro est servie à la même adresse, une base à elle ; ailleurs la base
     d'origine (les données déjà saisies sur l'adresse de la Master restent en place). */
  const DB_NAME = (global.location && /github\.io$/.test(location.hostname)) ? 'edugestion_pro_master' : 'edugestion_pro';
  const DB_VERSION = 14;
  const SYSTEM_STORES = ['outbox', 'meta'];
  const ALL_STORES = EG.STORES.concat(SYSTEM_STORES);

  let _db = null;

  function uuid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        ALL_STORES.forEach(name => {
          if (!db.objectStoreNames.contains(name)) {
            const os = db.createObjectStore(name, { keyPath: 'id' });
            os.createIndex('updated_at', 'updated_at');
          }
        });
      };
      /* Une autre fenêtre, restée ouverte sur l'ancienne version, retient la base : la mise à
         jour attend qu'elle se ferme. On le dit clairement au lieu de laisser un écran vide. */
      req.onblocked = () => {
        const txt = document.getElementById('chargement-texte');
        if (txt) txt.textContent = 'ÉduGestion Pro Master est déjà ouvert dans une autre fenêtre avec une ancienne version. Fermez cette autre fenêtre (ou cet autre onglet) : la mise à jour se poursuivra d’elle-même.';
        const b = document.getElementById('chargement-recharger'); if (b) b.hidden = false;
      };
      req.onsuccess = e => {
        _db = e.target.result;
        /* L'espace CP intégré (memp-cp/) lit la base de cette application-ci, pas celle d'une autre servie à la même adresse. */
        try { sessionStorage.setItem('eg-db', DB_NAME); } catch (x) { /* stockage de session indisponible */ }
        /* Ne jamais bloquer une future mise à jour faite depuis une autre fenêtre. */
        _db.onversionchange = () => {
          try { _db.close(); } catch (x) { /* déjà fermée */ }
          _db = null;
          const app = document.getElementById('app');
          if (app && !document.getElementById('avis-maj')) {
            const d = document.createElement('div');
            d.id = 'avis-maj'; d.className = 'ecran-connexion'; d.style.cssText = 'position:fixed;inset:0;z-index:99;background:rgba(4,73,44,.96)';
            d.innerHTML = '<div class="carte-connexion"><h1>Nouvelle version</h1><p>ÉduGestion Pro Master vient d’être mis à jour dans une autre fenêtre. Rechargez cette page pour continuer.</p><button type="button" class="btn btn-primaire pleine" onclick="location.reload()">Recharger</button></div>';
            document.body.appendChild(d);
          }
        };
        resolve(_db);
      };
      req.onerror = e => reject(e.target.error);
    });
  }

  function tx(stores, mode) {
    return open().then(db => db.transaction(stores, mode || 'readonly'));
  }

  function wrap(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  const DB = {
    nom: DB_NAME,
    NOM: DB_NAME,
    uuid,
    open,

    all(store) {
      return tx([store]).then(t => wrap(t.objectStore(store).getAll()));
    },

    get(store, id) {
      if (!id) return Promise.resolve(null);
      return tx([store]).then(t => wrap(t.objectStore(store).get(id)));
    },

    /** Lecture filtrée : where est un objet d'égalités ou une fonction. */
    where(store, cond) {
      return DB.all(store).then(rows => {
        if (!cond) return rows;
        if (typeof cond === 'function') return rows.filter(cond);
        return rows.filter(r => Object.keys(cond).every(k => {
          if (cond[k] === undefined || cond[k] === null || cond[k] === '') return true;
          return r[k] === cond[k];
        }));
      });
    },

    count(store, cond) {
      return DB.where(store, cond).then(r => r.length);
    },

    /** Écriture : versionne, horodate et alimente l'outbox de synchronisation. */
    put(store, obj, opts) {
      opts = opts || {};
      const now = new Date().toISOString();
      const rec = Object.assign({}, obj);
      const creation = !rec.id;
      rec.id = rec.id || uuid();
      rec.created_at = rec.created_at || now;
      rec.updated_at = now;
      rec.version = (rec.version || 0) + 1;
      rec.sync_status = opts.synced ? 'SYNCED' : 'PENDING';
      return tx([store, 'outbox'], 'readwrite').then(t => {
        t.objectStore(store).put(rec);
        if (!opts.silencieux) {
          t.objectStore('outbox').put({
            id: uuid(),
            entity_type: store,
            entity_id: rec.id,
            operation: creation ? 'CREATE' : 'UPDATE',
            payload: rec,
            idempotency_key: uuid(),
            status: 'PENDING',
            attempts: 0,
            created_at: now
          });
        }
        return new Promise((res, rej) => {
          t.oncomplete = () => res(rec);
          t.onerror = () => rej(t.error);
        });
      });
    },

    /** Écriture en lot (saisie hors-ligne : présences, notes, cantine). */
    putBatch(store, rows, opts) {
      opts = opts || {};
      const now = new Date().toISOString();
      return tx([store, 'outbox'], 'readwrite').then(t => {
        const os = t.objectStore(store);
        const ob = t.objectStore('outbox');
        const out = rows.map(r => {
          const rec = Object.assign({}, r);
          const creation = !rec.id;
          rec.id = rec.id || uuid();
          rec.created_at = rec.created_at || now;
          rec.updated_at = now;
          rec.version = (rec.version || 0) + 1;
          rec.sync_status = 'PENDING';
          os.put(rec);
          if (!opts.silencieux) {
            ob.put({
              id: uuid(), entity_type: store, entity_id: rec.id,
              operation: creation ? 'CREATE' : 'UPDATE', payload: rec,
              idempotency_key: uuid(), status: 'PENDING', attempts: 0, created_at: now
            });
          }
          return rec;
        });
        return new Promise((res, rej) => {
          t.oncomplete = () => res(out);
          t.onerror = () => rej(t.error);
        });
      });
    },

    remove(store, id) {
      const now = new Date().toISOString();
      return tx([store, 'outbox'], 'readwrite').then(t => {
        t.objectStore(store).delete(id);
        t.objectStore('outbox').put({
          id: uuid(), entity_type: store, entity_id: id, operation: 'DELETE',
          payload: { id }, idempotency_key: uuid(), status: 'PENDING', attempts: 0, created_at: now
        });
        return new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
      });
    },

    /**
     * Retire des enregistrements sans rien mettre en file d'envoi, et efface
     * de la file les opérations qui les concernaient : sert au nettoyage des
     * données d'exemple, qui n'ont jamais existé côté serveur.
     * `parStore` = { magasin: [id, …] }.
     */
    purger(parStore) {
      const stores = Object.keys(parStore).filter(s => parStore[s] && parStore[s].length);
      if (!stores.length) return Promise.resolve(0);
      return tx(stores.concat(['outbox']), 'readwrite').then(t => {
        const ids = {};
        let n = 0;
        stores.forEach(s => parStore[s].forEach(id => { t.objectStore(s).delete(id); ids[id] = true; n++; }));
        t.objectStore('outbox').openCursor().onsuccess = e => {
          const c = e.target.result;
          if (!c) return;
          if (ids[c.value.entity_id]) c.delete();
          c.continue();
        };
        return new Promise((res, rej) => { t.oncomplete = () => res(n); t.onerror = () => rej(t.error); });
      });
    },

    clearStore(store) {
      return tx([store], 'readwrite').then(t => wrap(t.objectStore(store).clear()));
    },

    /* -------- Outbox / synchronisation -------- */
    outbox() { return DB.all('outbox'); },
    outboxCount() {
      return DB.all('outbox').then(rows => rows.filter(r => r.status === 'PENDING' || r.status === 'FAILED').length);
    },
    outboxClear(ids) {
      return tx(['outbox'], 'readwrite').then(t => {
        ids.forEach(id => t.objectStore('outbox').delete(id));
        return new Promise(res => { t.oncomplete = res; });
      });
    },

    /* -------- Métadonnées applicatives -------- */
    meta(cle) { return DB.get('meta', cle).then(r => (r ? r.valeur : null)); },
    setMeta(cle, valeur) {
      return tx(['meta'], 'readwrite').then(t => {
        t.objectStore('meta').put({ id: cle, valeur, updated_at: new Date().toISOString() });
        return new Promise(res => { t.oncomplete = res; });
      });
    },

    /** Efface toutes les données locales (réinitialisation d'un appareil). */
    reset() {
      return open().then(db => Promise.all(ALL_STORES.map(s => DB.clearStore(s))));
    },

    /** Export complet, pour sauvegarde ou transmission par clé USB. */
    exportAll() {
      return Promise.all(ALL_STORES.map(s => DB.all(s).then(rows => [s, rows])))
        .then(pairs => {
          const out = { application: 'ÉduGestion Pro Master', version: '5.2', exporte_le: new Date().toISOString(), donnees: {} };
          pairs.forEach(([s, rows]) => { if (rows.length) out.donnees[s] = rows; });
          return out;
        });
    },

    importAll(dump) {
      const stores = Object.keys(dump.donnees || {});
      if (!stores.length) return Promise.resolve(0);
      return tx(stores, 'readwrite').then(t => {
        let n = 0;
        stores.forEach(s => {
          const os = t.objectStore(s);
          dump.donnees[s].forEach(r => { os.put(r); n++; });
        });
        return new Promise((res, rej) => { t.oncomplete = () => res(n); t.onerror = () => rej(t.error); });
      });
    },

    /** Tables et champs qui pointent vers un enregistrement de `store`. */
    referents(store) {
      const out = [];
      Object.keys(EG.SCHEMA).forEach(t => {
        EG.SCHEMA[t].champs.forEach(c => {
          if (c.t === 'ref' && c.ref === store) out.push({ table: t, champ: c.n });
        });
      });
      return out;
    },

    /** Ce qui dépend d'un enregistrement : sert à refuser une suppression qui casserait des données. */
    dependances(store, id) {
      const refs = DB.referents(store);
      if (!refs.length) return Promise.resolve([]);
      return Promise.all(refs.map(r => DB.where(r.table, x => x[r.champ] === id)
        .then(rows => ({ table: r.table, champ: r.champ, nombre: rows.length }))))
        .then(res => res.filter(r => r.nombre > 0));
    },

    /**
     * Compacte la file d'attente : plusieurs modifications successives du même
     * enregistrement n'ont pas à voyager séparément. On garde la dernière, en
     * conservant l'opération de création si elle n'est pas encore partie.
     */
    compacterOutbox() {
      return DB.all('outbox').then(rows => {
        const enAttente = rows.filter(o => o.status === 'PENDING');
        const parEntite = {};
        enAttente.forEach(o => {
          const cle = o.entity_type + '|' + o.entity_id;
          (parEntite[cle] = parEntite[cle] || []).push(o);
        });
        const aSupprimer = [];
        const aRemplacer = [];
        Object.keys(parEntite).forEach(cle => {
          const groupe = parEntite[cle].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
          if (groupe.length < 2) return;
          const dernier = groupe[groupe.length - 1];
          const creation = groupe.some(o => o.operation === 'CREATE');
          const suppression = dernier.operation === 'DELETE';
          groupe.slice(0, -1).forEach(o => aSupprimer.push(o.id));
          if (suppression && creation) {
            /* Créé puis supprimé sans être parti : rien à transmettre. */
            aSupprimer.push(dernier.id);
          } else if (creation && dernier.operation === 'UPDATE') {
            aRemplacer.push(Object.assign({}, dernier, { operation: 'CREATE' }));
          }
        });
        if (!aSupprimer.length && !aRemplacer.length) {
          return { avant: enAttente.length, apres: enAttente.length, gagnees: 0 };
        }
        return tx(['outbox'], 'readwrite').then(t => {
          const os = t.objectStore('outbox');
          aSupprimer.forEach(id => os.delete(id));
          aRemplacer.forEach(o => os.put(o));
          return new Promise((res, rej) => {
            t.oncomplete = () => res({
              avant: enAttente.length,
              apres: enAttente.length - aSupprimer.length,
              gagnees: aSupprimer.length
            });
            t.onerror = () => rej(t.error);
          });
        });
      });
    },

    /** Journal d'audit : chaque action sensible laisse une trace. */
    audit(action, entity_type, entity_id, metadata) {
      const u = EG.session && EG.session.user;
      return DB.put('audit_events', {
        occurred_at: new Date().toISOString(),
        user_id: u ? u.id : null,
        user_label: u ? (u.nom + ' ' + (u.prenoms || '')) : 'système',
        action, entity_type, entity_id: entity_id || null,
        metadata: metadata || null
      }, { silencieux: true });
    }
  };

  /* Chaque lecture ou écriture est comptée : l'interface peut ainsi montrer
     qu'elle travaille, sans que chaque écran ait à s'en occuper. */
  /* `DB.generation` change à chaque écriture : les caches dérivés (périmètre du compte) s'en servent pour se renouveler. */
  DB.generation = 0;
  const ECRITURES = ['put', 'putBatch', 'remove', 'importAll', 'purger'];
  (function suivreActivite() {
    let actives = 0;
    const notifier = () => { if (EG.majActivite) EG.majActivite(actives); };
    ['all', 'where', 'get', 'put', 'putBatch', 'remove', 'exportAll', 'importAll',
      'dependances', 'compacterOutbox', 'purger'].forEach(nom => {
      const original = DB[nom];
      DB[nom] = function () {
        actives++; notifier();
        const ecrit = ECRITURES.indexOf(nom) >= 0;
        if (ecrit) DB.generation++;
        const fini = () => { actives = Math.max(0, actives - 1); notifier(); if (ecrit) DB.generation++; };
        return original.apply(DB, arguments).then(
          r => { fini(); return r; },
          e => { fini(); throw e; }
        );
      };
    });
  })();

  EG.DB = DB;
})(window);
