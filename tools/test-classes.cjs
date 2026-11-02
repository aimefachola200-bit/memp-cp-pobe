// Test : classes ouvertes (une classe jumelée ou multigrade compte pour une ; ouvertes = simples + jumelées + multigrades ;
// classes autorisées à part, écart affiché ; ratios sur les classes ouvertes). Lancer : node tools/test-classes.cjs
const assert = require('assert/strict'), path = require('path');
global.window = global;
const C = require(path.join(__dirname, '..', 'js', 'classes.js'));
assert.equal(C.compter(['CI-CP', 'CE1-CE2', 'CM1-CM2']).ouvertes, 3);
assert.equal(C.compter(['CI-CP', 'CE1-CE2', 'CM1-CM2']).jumelees, 3);
assert.deepEqual([C.compter(['CI+CE2+CM1']).ouvertes, C.compter(['CI+CE2+CM1']).multigrades], [1, 1]);
assert.equal(C.compter(['CI', 'CP', 'CE1-CE2', 'CM1-CM2']).ouvertes, 4);
assert.equal(C.compter([['CI', 'CP', 'CE1'], 'CE2', 'CM1-CM2']).ouvertes, 3);
assert.equal(C.ecart(2, 3).ecart, 1);
assert.equal(C.parClasse(150, 3), 50);
try { const E = require(path.join(__dirname, '..', 'js', 'classes-eg.js'));
  const recs = [{ id: 1, niveau: 'CI', titulaire_id: 'a' }, { id: 2, niveau: 'CP', titulaire_id: 'a' }, { id: 3, niveau: 'CE1', regroupement: 'CE1-CE2' }, { id: 4, niveau: 'CE2', regroupement: 'CE1-CE2' }, { id: 5, niveau: 'CM1', titulaire_id: 'b' }, { id: 6, niveau: 'CM2', titulaire_id: 'b' }];
  const x = E.ecole({ classes_autorisees: 2 }, recs);
  assert.equal(x.ouvertes, 3); assert.equal(x.jumelees, 3); assert.equal(x.ecart, 1);
  assert.equal(E.ecole({ classes_simples: 2, classes_jumelees: 1, classes_multigrades: 1 }, []).ouvertes, 4);
} catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
console.log('ok classes ouvertes');
