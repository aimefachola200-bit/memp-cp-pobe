// Test : anciennetés arrêtées au 31 décembre de la seconde année de l'année scolaire (« 2026-2027 » → 31/12/2027) ;
// règle de retraite inchangée. Lancer : node tools/test-anciennete.mjs
import vm from 'node:vm'; import fs from 'node:fs'; import assert from 'node:assert/strict';
const R = new URL('..', import.meta.url).pathname;
// MEMP-CP et jumelles
for (const d of [R, R + 'dosp', R + 'memp-cp'].filter(x => fs.existsSync(x + '/js/carriere.js'))) {
  const C = await import(d + '/js/carriere.js');
  const r = C.dateReference(new Date('2026-11-02T12:00:00'));
  assert.equal(r.getFullYear(), 2027); assert.equal(r.getMonth(), 11); assert.equal(r.getDate(), 31);
  const f = C.calculerFiche({ date_prise_service: '2000-06-01', grade: 'A1', date_naissance: '1970-02-10' }, new Date('2026-11-02T12:00:00'));
  assert.equal(f.reference.getFullYear(), 2027);
  // retraite inchangée : né en février 1970, grade A (60 ans) → 1er avril 2030
  assert.equal(f.retraite.getFullYear(), 2030); assert.equal(f.retraite.getMonth(), 3); assert.equal(f.retraite.getDate(), 1);
  console.log('ok', d);
}