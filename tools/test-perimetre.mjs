import { creerPerimetre } from '../js/perimetre.js';
import assert from 'node:assert/strict';
const cp1 = { id: 'u1', role: 'CP', username: 'cp1', codeZone: 'CSPOBE-ZP01', codeCp: 'CP-1' };
const P = creerPerimetre(cp1);
assert.equal(creerPerimetre({ role: 'CCS' }), null); assert.equal(creerPerimetre({ role: 'ADMIN' }), null);
for (const s of ['schools', 'fiches', 'personnel', 'effectifs', 'bilans', 'activities', 'classReports', 'recensements']) {
  assert.ok(P.lit(s, { codeZone: 'CSPOBE-ZP01' }), s); assert.ok(!P.lit(s, { codeZone: 'CSPOBE-ZP02' }), s); assert.ok(!P.lit(s, {}), s + ' sans zone');
  assert.deepEqual(P.ecrit(s, { id: 1 }).rec.codeZone, 'CSPOBE-ZP01'); assert.equal(P.ecrit(s, { id: 1, codeZone: 'CSPOBE-ZP02' }).ok, false);
  assert.equal(P.ecrit(s, { id: 1, codeZone: 'CSPOBE-ZP01' }, { codeZone: 'CSPOBE-ZP02' }).ok, false, 'écrasement interdit');
}
assert.ok(P.lit('users', { id: 'u1' })); assert.ok(!P.lit('users', { id: 'u2' }));
assert.ok(P.lit('logs', { user: 'cp1' })); assert.ok(!P.lit('logs', { user: 'cp2' }));
assert.ok(P.lit('docs', { by: 'cp1' })); assert.ok(!P.lit('docs', { by: 'cp2', cp: 'CP-2' }));
assert.ok(P.lit('dosp', { by: 'cp1' })); assert.ok(!P.lit('dosp', { by: 'cp2', codeZone: 'CSPOBE-ZP02' }));
assert.ok(P.lit('ref', { type: 'zone', code: 'CSPOBE-ZP01' })); assert.ok(!P.lit('ref', { type: 'zone', code: 'CSPOBE-ZP02' }));
assert.ok(P.lit('ref', { type: 'departement', nom: 'PLATEAU' })); assert.ok(!P.lit('ref', { type: 'up', codeZone: 'CSPOBE-ZP03' }));
assert.ok(!P.lit('photos', { bilanId: 'b1' })); P.noterBilan('b1'); assert.ok(P.lit('photos', { bilanId: 'b1' })); assert.ok(!P.lit('photos', { bilanId: 'b2' }));
assert.ok(P.cleReglageOk('synocp:CSPOBE-ZP01')); assert.ok(!P.cleReglageOk('synocp:CSPOBE-ZP02')); assert.ok(!P.cleReglageOk('synocp-up:CSPOBE-ZP03'));
assert.ok(!P.cleReglageOk('zone_desheritee')); assert.ok(P.cleReglageOk('zone_desheritee:CSPOBE-ZP01')); assert.ok(!P.cleReglageOk('zone_desheritee:CSPOBE-ZP02'));
assert.ok(P.cleReglageOk('planif:CE2')); assert.ok(P.cleReglageOk('saisie-onglet'));
const sans = creerPerimetre({ id: 'u3', role: 'CP', username: 'cpx' });
assert.ok(!sans.lit('schools', { codeZone: '' })); assert.equal(sans.ecrit('schools', { id: 1 }).ok, false);
console.log('perimetre : tous les controles passent');
// réglages : clés zonées et suffixage
assert.equal(P.cleReglage('cpIdentity'), 'cpIdentity@CSPOBE-ZP01');
assert.equal(P.cleReglage('seed-ecoles'), 'seed-ecoles');
assert.equal(P.cleReglage('synocp:CSPOBE-ZP01'), 'synocp:CSPOBE-ZP01');
assert.equal(P.cleReglage('zone_desheritee'), 'zone_desheritee:CSPOBE-ZP01');
assert.equal(P.cleReglageOk('synocp:CSPOBE-ZP02'), false);
assert.equal(P.cleReglageOk(P.cleReglage('pvs')), true);
console.log('réglages : OK');
