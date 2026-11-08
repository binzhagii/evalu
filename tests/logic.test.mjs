// Rule checks, mapped to the manuscript's requirements (Table 8 / Table 9).
import assert from 'node:assert/strict';
const { buildSeed } = await import('../src/lib/seed.js');
const L = await import('../src/lib/logic.js');
const db = buildSeed();

// FR11: a class counts only with half of the class PLUS ONE (50 -> 26, 10 -> 6, 40 -> 21)
assert.equal(L.neededResponses(50), 26);
assert.equal(L.neededResponses(10), 6);
assert.equal(L.neededResponses(40), 21);
const secs = db.sections.map((s) => L.sectionStats(db, 'p4', s.id));
assert.deepEqual(secs.map((s) => s.responded), [8, 4, 6, 10, 3, 7, 9, 5, 0]);
assert.deepEqual(secs.map((s) => s.valid), [true, false, true, true, false, true, true, false, false], '5 of 10 is not enough');
assert.equal(secs[1].score, null); // excluded section has no score

// FR6: practicum / internship / field trip subjects get no evaluation tasks
assert.ok(L.isExemptSection({ code: 'X', subject: 'Practicum A' }) && L.isExemptSection({ code: 'X', subject: 'Field Trip' }) && L.isExemptSection({ code: 'OJT-1', subject: 'x' }));
assert.ok(!L.isExemptSection({ code: 'SEC-A1', subject: 'Internal Medicine' }));
assert.equal(db.tasks.filter((t) => t.sectionId === 'sec9').length, 0);

// FR5 / Table 6: weights per evaluatee group
assert.deepEqual(db.rules.COLLEGE_FACULTY, { ST: 40, DEAN: 40, CHAIR: 20 });
assert.deepEqual(db.rules.BASICED_TEACHER, { ST: 40, PRIN: 20, APRIN: 20, SHEAD: 20 });

// FR13: 40/40/20 weighting on a hand-built case
const t = structuredClone(db);
t.tasks = []; t.sections = [{ id: 's', code: 'X', subject: 'X', facultyId: 'fac_a1', dept: 'A', studentIds: ['st_a01', 'st_a02'] }];
const mk = (ev, g, v, sec) => t.tasks.push({ id: ev + g, periodId: 'p4', evaluatorId: ev, targetId: 'fac_a1', group: g, sectionId: sec || null,
  response: { answers: { c1: v }, weights: { c1: 1 }, comment: null } });
mk('st_a01', 'ST', 5, 's'); mk('st_a02', 'ST', 3, 's'); mk('dean_a', 'DEAN', 4); mk('chair_a', 'CHAIR', 2);
const r = L.computeTarget(t, 'p4', 'fac_a1');
assert.equal(r.final, 3.6); // ST=4, Dean=4, Chair=2 -> .4*4+.4*4+.2*2
assert.equal(r.status, 'complete');

// FR13: two program chairs are averaged within their 20%
mk('chair_b', 'CHAIR', 4);
assert.equal(L.computeTarget(t, 'p4', 'fac_a1').groups.CHAIR.score, 3);
t.tasks = t.tasks.filter((x) => x.evaluatorId !== 'chair_b');

// FR13: no dean evaluation -> dean's 40% removed, computed over 60% (ST 4, Chair 2 -> 200/60 = 3.33)
const noDean = structuredClone(t); noDean.tasks = noDean.tasks.filter((x) => x.group !== 'DEAN');
const r1 = L.computeTarget(noDean, 'p4', 'fac_a1');
assert.equal(r1.final, 3.33); assert.equal(r1.status, 'reweighted'); assert.equal(r1.basis, 60); assert.deepEqual(r1.missing, ['DEAN']);

// FR11 + FR13: class below half + 1 -> student 40% removed (Dean 4, Chair 2 -> 200/60 = 3.33)
t.tasks.push({ id: 'p', periodId: 'p4', evaluatorId: 'st_a03', targetId: 'fac_a1', group: 'ST', sectionId: 's', response: null });
t.tasks.push({ id: 'p2', periodId: 'p4', evaluatorId: 'st_a04', targetId: 'fac_a1', group: 'ST', sectionId: 's', response: null });
const r2 = L.computeTarget(t, 'p4', 'fac_a1'); // 2 of 4 answered: needs 3
assert.equal(r2.groups.ST.score, null); assert.equal(r2.status, 'reweighted'); assert.equal(r2.final, 3.33); assert.deepEqual(r2.missing, ['ST']);

// FR13: nobody evaluated -> no score is invented
const none = structuredClone(t); none.tasks = none.tasks.map((x) => ({ ...x, response: null }));
assert.equal(L.computeTarget(none, 'p4', 'fac_a1').status, 'incomplete');
assert.equal(L.computeTarget(none, 'p4', 'fac_a1').final, null);

// FR13: two decimal places
assert.equal(L.round2(3.335), 3.34); assert.equal(L.round2(4.004), 4); assert.equal(L.round2(2.675), 2.68);

// weights not given in the manuscript (evaluating Deans) -> no score until HR sets them
assert.equal(L.computeTarget(db, 'p4', 'dean_a').status, 'weights-missing');

// NFR8: a period keeps its own weights; changing the current weights doesn't change it
const w = structuredClone(db); w.rules.COLLEGE_FACULTY.ST = 10;
assert.equal(L.computeTarget(w, 'p1', 'fac_a1').final, L.computeTarget(db, 'p1', 'fac_a1').final);

// FR3: weighted categories, e.g. 60 / 40, split among the category's items
const cat = L.effectiveWeights({ categories: { A: 60, B: 40 }, items: [{ criterionId: 'x', weight: 1, category: 'A' }, { criterionId: 'y', weight: 1, category: 'A' }, { criterionId: 'z', weight: 1, category: 'B' }] });
assert.deepEqual(cat, { x: 30, y: 30, z: 40 });
assert.deepEqual(L.effectiveWeights({ categories: {}, items: [{ criterionId: 'x', weight: 2 }] }), { x: 2 }, 'no categories: item weights');
assert.equal(L.responseScore({ answers: { x: 5, y: 5, z: 1 }, weights: cat }), 3.4); // .3*5+.3*5+.4*1

// FR15: per-item mean and rating distribution
const items = L.itemStats([{ response: { answers: { c1: 5, c2: 3 } } }, { response: { answers: { c1: 3, c2: 2 } } }, { response: null }]);
const c1 = items.find((x) => x.criterionId === 'c1'), c2 = items.find((x) => x.criterionId === 'c2');
assert.equal(c1.mean, 4); assert.deepEqual(c1.dist, [0, 0, 1, 0, 1]); assert.equal(c1.n, 2);
assert.equal(c2.low, true, `FR19: below ${L.LOW_ITEM} is flagged`); assert.equal(c1.low, false);

// FR12: final check notifies the faculty, the department heads and HR; running it twice adds nothing
const d2 = structuredClone(db); L.runThresholdCheck(d2, 'p4'); const n1 = d2.notifications.length; L.runThresholdCheck(d2, 'p4');
assert.equal(d2.notifications.length, n1);
const inv = d2.notifications.filter((n) => n.kind === 'invalidated' && n.key.startsWith('thr|p4'));
assert.ok(inv.some((n) => n.userId === 'fac_a2'), 'faculty notified');
assert.ok(inv.some((n) => n.userId === 'dean_a') && inv.some((n) => n.userId === 'chair_a'), 'department heads notified');
assert.ok(inv.some((n) => n.userId === 'hr'), 'HR notified');
// while open: progress alerts (FS8-FS10)
const d4 = structuredClone(db); assert.ok(L.participationAlerts(d4, 'p4') > 0);
assert.ok(d4.notifications.some((n) => n.kind === 'participation' && n.userId === 'fac_a2'));
assert.ok(d4.notifications.some((n) => n.kind === 'participation' && n.userId === 'dean_a'));
assert.ok(d4.notifications.some((n) => n.kind === 'participation' && n.userId === 'hr'));

// FR10: one reminder per evaluator per day, department heads and HR alerted; automatic once a day
const d5 = structuredClone(db);
const sent = L.sendReminders(d5, 'p4');
const pendingEvaluators = new Set(d5.tasks.filter((x) => x.periodId === 'p4' && !x.response).map((x) => x.evaluatorId));
assert.equal(sent, pendingEvaluators.size);
assert.equal(L.sendReminders(d5, 'p4'), 0, 'not twice on the same day');
assert.ok(d5.notifications.some((n) => n.key?.startsWith('remdept|p4|A|dean_a')), 'department alerted');
assert.ok(d5.notifications.some((n) => n.key?.startsWith('remhr|p4|hr')), 'HR alerted');
const d6 = structuredClone(db);
assert.equal(L.runDailyAutomation(d6), 1, 'p4 is due within 7 days');
assert.equal(L.runDailyAutomation(d6), 0, 'only once a day');
const d7 = structuredClone(db); d7.periods.find((p) => p.id === 'p4').deadline = '2999-01-01';
assert.equal(L.runDailyAutomation(d7), 0, 'not too early');

// FR17 / NFR6: release order, faculty only after release (which needs VP approval)
const P = { releaseStage: 'hr' }, u = (id) => db.users.find((x) => x.id === id);
assert.ok(L.canSeeAll(u('hr'), P) && !L.canSeeAll(u('director'), P) && !L.canSeeOwn(u('fac_a1'), P));
P.releaseStage = 'dir'; assert.ok(L.canSeeAll(u('director'), P) && !L.canSeeOwn(u('fac_a1'), P) && !L.canSeeDept(u('dean_a'), P));
P.releaseStage = 'faculty'; assert.ok(L.canSeeOwn(u('fac_a1'), P) && L.canSeeOwn(u('staff_a'), P) && L.canSeeDept(u('dean_a'), P) && !L.canSeeDept(u('chair_a'), P));
assert.deepEqual(L.pendingApprovals(db, db.periods.find((p) => p.id === 'p3')).map((x) => x.id), ['director', 'vp']);
assert.deepEqual(L.pendingApprovals(db, db.periods.find((p) => p.id === 'p1')), []);

// Table 6: non-teaching head and staff evaluate each other; a secretary also evaluates the dean
assert.deepEqual(L.evaluatorGroups(u('sec_a')), ['SEC', 'NTPSTAFF']);
assert.ok(db.tasks.some((x) => x.periodId === 'p4' && x.evaluatorId === 'head_a' && x.targetId === 'staff_a' && x.group === 'NTPHEAD'));
assert.ok(db.tasks.some((x) => x.periodId === 'p4' && x.evaluatorId === 'sec_a' && x.targetId === 'head_a' && x.group === 'NTPSTAFF'));
assert.ok(db.tasks.some((x) => x.periodId === 'p4' && x.evaluatorId === 'sec_a' && x.targetId === 'dean_a' && x.group === 'SEC'));

// FR8: a period for one department generates tasks only there
const d8 = structuredClone(db); d8.periods.push({ id: 'pB', name: 'B only', deadline: '2999-01-01', status: 'open', releaseStage: 'hr', rules: d8.rules, depts: ['B'], approvals: [] });
L.generateTasks(d8, 'pB');
const pb = d8.tasks.filter((x) => x.periodId === 'pB');
assert.ok(pb.length > 0 && pb.every((x) => d8.users.find((y) => y.id === x.targetId).dept === 'B'));

// FR4: a form with submitted answers is "used"; the response remembers its version
const used = db.instruments.find((i) => i.id === 'i_COLLEGE_FACULTY_ST');
assert.ok(L.formUsed(db, used));
assert.ok(db.tasks.filter((x) => x.response).every((x) => x.response.instrumentId));

// FR1: institutional email only
assert.ok(L.isInstitutionalEmail('fac_a1@ubaguio.edu') && L.isInstitutionalEmail('20226699@s.ubaguio.edu'));
assert.ok(!L.isInstitutionalEmail('someone@gmail.com') && !L.isInstitutionalEmail('x@ubaguio.edu.evil.com'));

// task generation is idempotent
const d3 = structuredClone(db); const before = d3.tasks.length; L.generateTasks(d3, 'p4'); assert.equal(d3.tasks.length, before);
console.log('all logic checks passed; tasks:', db.tasks.length);
