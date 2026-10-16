import assert from 'node:assert/strict';
const store = {}; globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => (store[k] = v) };
const { buildSeed } = await import('../src/lib/seed.js');
const L = await import('../src/lib/logic.js');
const db = await buildSeed();

// 1. 50% rule: boundary exactly 5/10 valid, 4/10 invalid
const secs = db.sections.map((s) => L.sectionStats(db, 'p4', s.id));
assert.deepEqual(secs.map((s) => s.responded), [8, 4, 6, 10, 3, 7, 9, 5]);
assert.deepEqual(secs.map((s) => s.valid), [true, false, true, true, false, true, true, true]);
assert.equal(secs[1].score, null); // invalidated section has no score

// 2. 40/40/20 weighting on a hand-built case
const t = structuredClone(db);
t.tasks = []; t.sections = [{ id: 's', code: 'X', subject: 'X', facultyId: 'fac_a1', dept: 'A', studentIds: ['st_a01', 'st_a02'] }];
const mk = (ev, g, v, sec) => t.tasks.push({ id: ev + g, periodId: 'p4', evaluatorId: ev, targetId: 'fac_a1', group: g, sectionId: sec || null,
  response: { answers: { c1: v }, weights: { c1: 1 }, comment: null } });
mk('st_a01', 'ST', 5, 's'); mk('st_a02', 'ST', 3, 's'); mk('dean_a', 'DEAN', 4); mk('chair_a', 'CHAIR', 2);
const r = L.computeTarget(t, 'p4', 'fac_a1');
// ST=4, Dean=4, Chair=2 -> .4*4+.4*4+.2*2 = 3.6
assert.ok(Math.abs(r.final - 3.6) < 1e-9, r.final);
// 3. below 50% -> no final, incomplete
t.tasks = t.tasks.filter((x) => x.evaluatorId !== 'st_a02' || false); // 1 of 1 now; re-add a pending one
t.tasks.push({ id: 'p', periodId: 'p4', evaluatorId: 'st_a02', targetId: 'fac_a1', group: 'ST', sectionId: 's', response: null });
t.tasks.push({ id: 'p2', periodId: 'p4', evaluatorId: 'st_a03', targetId: 'fac_a1', group: 'ST', sectionId: 's', response: null });
const r2 = L.computeTarget(t, 'p4', 'fac_a1');
assert.equal(r2.final, null); assert.equal(r2.status, 'incomplete'); assert.deepEqual(r2.missing, ['ST']);
// 4. Weights missing for Basic Ed -> no score invented
assert.equal(L.computeTarget(db, 'p4', 'fac_be1').status, 'weights-missing');
// 5. notification on invalidation, idempotent
const d2 = structuredClone(db); L.runThresholdCheck(d2, 'p4'); const n1 = d2.notifications.length; L.runThresholdCheck(d2, 'p4');
assert.equal(d2.notifications.length, n1);
assert.ok(d2.notifications.some((n) => n.userId === 'fac_a2' && n.kind === 'invalidated'));
// 6. release order visibility
const P = { releaseStage: 'hr' }, hr = db.users.find(u => u.id === 'hr'), dir = db.users.find(u => u.id === 'director'), fac = db.users.find(u => u.id === 'fac_a1');
assert.ok(L.canSeeAll(hr, P) && !L.canSeeAll(dir, P) && !L.canSeeOwn(fac, P));
P.releaseStage = 'dir'; assert.ok(L.canSeeAll(dir, P) && !L.canSeeOwn(fac, P));
P.releaseStage = 'faculty'; assert.ok(L.canSeeOwn(fac, P));
// 7. task generation idempotent
const d3 = structuredClone(db); const before = d3.tasks.length; L.generateTasks(d3, 'p4'); assert.equal(d3.tasks.length, before);
console.log('all logic checks passed; tasks:', db.tasks.length);
