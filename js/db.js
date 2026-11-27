/* République du Bénin — MEMP — Base locale IndexedDB (hors-ligne) */
import { VARIANT } from './config.js';
// 5 : magasins « personnel » (versions 1.1 à 1.3) et « effectifs » (version 1.1.0 fournie) réunis, quelle que soit la version d'origine
// 6 : magasin « dosp » (application DOSP : tâches, agenda, envois, formations, plan d'action, documents)
// 7 : magasin « recensements » (fiches de recensement annuel EP / EM, modèle GESCOL)
const NAME = VARIANT.base, VERSION = 7;
const STORES = ['users', 'schools', 'fiches', 'classReports', 'activities', 'ref', 'logs', 'docs', 'themesDone', 'bilans', 'photos', 'personnel', 'effectifs', 'dosp', 'recensements'];
let _db;
/* Cloisonnement des espaces de travail (js/perimetre.js) : pour un CP, TOUTE lecture et écriture est limitée aux données de sa zone.
   Les écrans n'ont rien à filtrer : même un accès direct (adresse, export, sauvegarde, import) ne dépasse pas la zone. */
let _per = null;
const refus = (store) => { try { document.dispatchEvent(new CustomEvent('acces-refuse', { detail: { store } })); } catch (e) { /* hors navigateur */ } };
const INTERDIT = 'Accès interdit : cette donnée appartient à une autre zone.';
const cleDe = (s) => (s === 'settings' ? 'key' : 'id');

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const rq = indexedDB.open(NAME, VERSION);
    rq.onupgradeneeded = () => {
      const d = rq.result;
      STORES.forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); });
      if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' });
    };
    rq.onsuccess = () => { _db = rq.result; _db.onversionchange = () => _db.close(); res(_db); };
    rq.onerror = () => rej(rq.error);
  });
}
const tx = async (store, mode, fn) => {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const st = t.objectStore(store);
    let out;
    Promise.resolve(fn(st)).then(v => { out = v; }).catch(rej);
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
};
const rq = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const db = {
  STORES,
  all: async (s) => { const r = await tx(s, 'readonly', st => rq(st.getAll())); return _per ? r.filter(x => _per.lit(s, x)) : r; },
  // v2.6.1 : sans clé (adresse ouverte sans identifiant, ex. #/fiche), rien à lire : undefined au lieu d'une erreur IndexedDB
  get: async (s, id) => {
    if (id === undefined || id === null || id === '') return undefined;
    const r = await tx(s, 'readonly', st => rq(st.get(id)));
    if (_per && r && !_per.lit(s, r)) { refus(s); return undefined; }
    return r;
  },
  put: async (s, o) => {
    if (_per) {
      const ex = o && o[cleDe(s)] !== undefined ? await tx(s, 'readonly', st => rq(st.get(o[cleDe(s)]))) : undefined;
      const v = _per.ecrit(s, o, ex);
      if (!v.ok) { refus(s); throw new Error(INTERDIT); }
      o = v.rec; if (s === 'bilans') _per.noterBilan(o.id);
    }
    await tx(s, 'readwrite', st => rq(st.put(o)));
    return o;
  },
  putMany: async (s, arr) => {
    if (_per) {
      const ex = new Map((await tx(s, 'readonly', st => rq(st.getAll()))).map(x => [x[cleDe(s)], x]));
      const ok = [];
      for (const o of arr) { const v = _per.ecrit(s, o, ex.get(o && o[cleDe(s)])); if (v.ok) { ok.push(v.rec); if (s === 'bilans') _per.noterBilan(v.rec.id); } }
      if (ok.length < arr.length) refus(s);
      arr = ok;
    }
    await tx(s, 'readwrite', st => { arr.forEach(o => st.put(o)); });
    return arr;
  },
  del: async (s, id) => {
    if (_per) { const ex = await tx(s, 'readonly', st => rq(st.get(id))); if (ex && !_per.lit(s, ex)) { refus(s); throw new Error(INTERDIT); } }
    return tx(s, 'readwrite', st => rq(st.delete(id)));
  },
  delMany: async (s, ids) => {
    if (_per) {
      const permis = new Set((await tx(s, 'readonly', st => rq(st.getAll()))).filter(x => _per.lit(s, x)).map(x => x[cleDe(s)]));
      const ok = ids.filter(i => permis.has(i));
      // un identifiant absent de la base n'a rien à supprimer ; un identifiant hors zone est ignoré
      if (ok.length < ids.length) refus(s);
      ids = ok;
    }
    return tx(s, 'readwrite', st => { ids.forEach(i => st.delete(i)); });
  },
  clear: async (s) => {
    if (!_per) return tx(s, 'readwrite', st => rq(st.clear()));
    // un CP ne vide que sa propre zone
    const cle = cleDe(s), ids = (await tx(s, 'readonly', st => rq(st.getAll()))).filter(x => _per.lit(s, x)).map(x => x[cle]);
    return tx(s, 'readwrite', st => { ids.forEach(i => st.delete(i)); });
  },
  count: async (s) => (_per ? (await db.all(s)).length : tx(s, 'readonly', st => rq(st.count()))),
  async setting(key, value) {
    if (_per) key = _per.cleReglage(key);   // réglages propres au CP : suffixés par sa zone, donc jamais partagés entre CP d'un même appareil
    if (_per && !_per.cleReglageOk(key)) { refus('settings'); if (value === undefined) return undefined; throw new Error(INTERDIT); }
    if (value === undefined) { const r = await tx('settings', 'readonly', st => rq(st.get(key))); return r ? r.value : undefined; }
    await tx('settings', 'readwrite', st => rq(st.put({ key, value })));
    return value;
  },
  async exportAll() {
    const out = {};
    for (const s of STORES) out[s] = await this.all(s);
    out.settings = (await tx('settings', 'readonly', st => rq(st.getAll()))).filter(r => !_per || _per.lit('settings', r));
    if (_per) out.__zone = _per.zone;   // sauvegarde partielle : ne remplace jamais les données des autres zones à la restauration
    return out;
  },
  async importAll(data, { replace = true } = {}) {
    if (data && data.__zone) replace = false;
    for (const s of STORES) {
      if (!Array.isArray(data[s])) continue;
      if (replace) await this.clear(s);
      await this.putMany(s, data[s]);
    }
    if (Array.isArray(data.settings)) { if (replace) await this.clear('settings'); await this.putMany('settings', data.settings); }
  },
};

/** Active (CP) ou retire (autres rôles) le cloisonnement de la session ; appelée à la connexion et à la déconnexion. */
export async function activerPerimetre(p) {
  _per = p || null;
  if (_per) _per.noterBilans(await db.all('bilans'));
}
export const perimetreActif = () => !!_per;
