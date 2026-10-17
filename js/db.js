/* République du Bénin — MEMP — Base locale IndexedDB (hors-ligne) */
import { VARIANT } from './config.js';
const NAME = VARIANT.base, VERSION = 3;
const STORES = ['users', 'schools', 'fiches', 'classReports', 'activities', 'ref', 'logs', 'docs', 'themesDone', 'bilans', 'photos', 'personnel'];
let _db;

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
  all: (s) => tx(s, 'readonly', st => rq(st.getAll())),
  get: (s, id) => tx(s, 'readonly', st => rq(st.get(id))),
  put: (s, o) => tx(s, 'readwrite', st => rq(st.put(o))).then(() => o),
  putMany: (s, arr) => tx(s, 'readwrite', st => { arr.forEach(o => st.put(o)); }).then(() => arr),
  del: (s, id) => tx(s, 'readwrite', st => rq(st.delete(id))),
  delMany: (s, ids) => tx(s, 'readwrite', st => { ids.forEach(i => st.delete(i)); }),
  clear: (s) => tx(s, 'readwrite', st => rq(st.clear())),
  count: (s) => tx(s, 'readonly', st => rq(st.count())),
  async setting(key, value) {
    if (value === undefined) { const r = await tx('settings', 'readonly', st => rq(st.get(key))); return r ? r.value : undefined; }
    await tx('settings', 'readwrite', st => rq(st.put({ key, value })));
    return value;
  },
  async exportAll() {
    const out = {};
    for (const s of STORES) out[s] = await this.all(s);
    out.settings = await tx('settings', 'readonly', st => rq(st.getAll()));
    return out;
  },
  async importAll(data, { replace = true } = {}) {
    for (const s of STORES) {
      if (!Array.isArray(data[s])) continue;
      if (replace) await this.clear(s);
      await this.putMany(s, data[s]);
    }
    if (Array.isArray(data.settings)) { if (replace) await this.clear('settings'); await this.putMany('settings', data.settings); }
  },
};
