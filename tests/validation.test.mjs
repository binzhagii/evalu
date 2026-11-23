// Validation test suite (Objective 3): the panel's demonstration scenarios, run automatically.
// Each case has an ID, the requirement it checks, the expected result and the ACTUAL result measured now.
// Run:  npm run test:validation   ->  writes docs/test-report.md (and exits with an error if any case fails)
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evalu-validation-'));
process.env.EVALU_DATA_DIR = dir;
const L = await import('../src/lib/logic.js');
const { handleApi } = await import('../server/api.js');
const { sql } = await import('../server/db.js');

const results = [];
/** Record one test case. check() returns the actual value; pass = it equals expected (or the predicate). */
async function tc(id, req, scenario, expected, check, ok = (a) => JSON.stringify(a) === JSON.stringify(expected)) {
  let actual, pass;
  try { actual = await check(); pass = !!ok(actual); } catch (e) { actual = `ERROR: ${e.message}`; pass = false; }
  results.push({ id, req, scenario, expected: typeof expected === 'string' ? expected : JSON.stringify(expected), actual: typeof actual === 'string' ? actual : JSON.stringify(actual), pass });
}

/* ---------------- Part A: computation rules on controlled data ---------------- */
/** A college teacher with one class of `students`, `answered` of them answering with `st`; Dean and Chair optional. */
function scenario({ students = 40, answered = 21, st = 3.5, dean = 3.6, chair = 3.4, policy = null } = {}) {
  const rules = { COLLEGE_FACULTY: { ST: 40, DEAN: 40, CHAIR: 20 } };
  const db = { departments: [{ id: 'SIT', name: 'SIT', kind: 'college' }], users: [], sections: [], tasks: [], instruments: [], criteria: [], rules, policies: [],
    periods: [{ id: 'P', name: 'Test period', status: 'closed', releaseStage: 'hr', rules, policy, approvals: [] }] };
  const u = (id, role, position) => db.users.push({ id, name: id, role, position, dept: 'SIT', active: true });
  u('T', 'TP', 'faculty'); u('D', 'TP', 'dean'); u('C', 'TP', 'chair');
  const sec = { id: 'S', code: 'SEC', subject: 'Subject', facultyId: 'T', dept: 'SIT', studentIds: [] };
  db.sections.push(sec);
  const resp = (v) => ({ answers: { q: v }, weights: { q: 1 }, comment: null, submittedAt: '2026-11-01' });
  for (let i = 0; i < students; i++) {
    u(`s${i}`, 'ST', 'student'); sec.studentIds.push(`s${i}`);
    db.tasks.push({ id: `t${i}`, periodId: 'P', evaluatorId: `s${i}`, targetId: 'T', group: 'ST', sectionId: 'S', response: i < answered ? resp(st) : null });
  }
  db.tasks.push({ id: 'td', periodId: 'P', evaluatorId: 'D', targetId: 'T', group: 'DEAN', response: dean == null ? null : resp(dean) });
  db.tasks.push({ id: 'tc', periodId: 'P', evaluatorId: 'C', targetId: 'T', group: 'CHAIR', response: chair == null ? null : resp(chair) });
  return db;
}
const counts = (o) => L.sectionStats(scenario(o), 'P', 'S').valid;
const final = (o) => L.computeTarget(scenario(o), 'P', 'T');

await tc('TC-01', 'FR11 participation', '40 students, 20 answered (exactly half)', 'class excluded', () => (counts({ students: 40, answered: 20 }) ? 'class counted' : 'class excluded'));
await tc('TC-02', 'FR11 participation', '40 students, 21 answered (half + 1)', 'class counted', () => (counts({ students: 40, answered: 21 }) ? 'class counted' : 'class excluded'));
await tc('TC-03', 'FR11 participation', '41 students: answers needed', 21, () => L.neededResponses(41));
await tc('TC-04', 'FR11 participation', '41 students, 20 answered', 'class excluded', () => (counts({ students: 41, answered: 20 }) ? 'class counted' : 'class excluded'));
await tc('TC-05', 'FR11 participation', 'Even and odd sizes 1-6: answers needed', [1, 2, 2, 3, 3, 4], () => [1, 2, 3, 4, 5, 6].map((n) => L.neededResponses(n)));
await tc('TC-06', 'Policy (FR11)', 'HR changes the rule to 60% + 1: 40 students need', 25, () => L.neededResponses(40, { ...L.DEFAULT_POLICY, participationPercent: 60 }));
await tc('TC-07', 'FR13 weighted score', 'Students 3.50 (40%), Dean 3.60 (40%), Chair 3.40 (20%)', { final: 3.52, status: 'complete' }, () => { const r = final({}); return { final: r.final, status: r.status }; });
await tc('TC-08', 'FR13 re-weighting', 'Dean did not evaluate: Students 3.50, Chair 3.40 over 60%', { final: 3.47, status: 'reweighted', basis: 60 }, () => { const r = final({ dean: null }); return { final: r.final, status: r.status, basis: r.basis }; });
await tc('TC-09', 'FR11+FR13', 'Class below half + 1: students drop out, Dean + Chair over 60%', { final: 3.53, status: 'reweighted', basis: 60 }, () => { const r = final({ answered: 20 }); return { final: r.final, status: r.status, basis: r.basis }; });
await tc('TC-10', 'Policy (FR13)', 'HR policy "no final rating while a group is missing", Dean missing', { final: null, status: 'incomplete' }, () => { const r = final({ dean: null, policy: { ...L.DEFAULT_POLICY, missingGroup: 'incomplete' } }); return { final: r.final, status: r.status }; });
await tc('TC-11', 'FR13 rounding', 'Rounding to 2 decimals, then 3 decimals (policy)', [3.47, 3.467], () => [final({ dean: null }).final, final({ dean: null, policy: { ...L.DEFAULT_POLICY, decimals: 3 } }).final]);
await tc('TC-12', 'Rating bands', 'Interpretation of 3.51 / 3.50 / 3.00 / 2.99 / 2.50 / 2.49', ['Outstanding', 'Satisfactory', 'Satisfactory', 'Fair', 'Fair', 'Poor'], () => [3.51, 3.5, 3.0, 2.99, 2.5, 2.49].map((x) => L.interpretation(x)));
await tc('TC-13', 'Policy (bands)', 'HR raises Outstanding to 3.60: 3.55 becomes', 'Satisfactory', () => L.interpretation(3.55, false, { ...L.DEFAULT_POLICY, bands: [3.6, 3.0, 2.5] }));
await tc('TC-14', 'FR19 low items', 'Item mean 2.90 with cutoff 3.00, item mean 3.00', [true, false], () => [2.9, 3.0].map((m) => L.itemStats([{ response: { answers: { q: m }, weights: { q: 1 } } }])[0].low));

/* ---------------- Part B: the running system (API, database, access control) ---------------- */
const server = http.createServer(async (req, res) => { if (!(await handleApi(req, res))) { res.writeHead(404); res.end(); } });
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
async function call(p, { body, cookie } = {}) {
  const res = await fetch(base + p, { method: body ? 'POST' : 'GET', headers: { ...(body && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }) }, body: body && JSON.stringify(body) });
  return { status: res.status, data: await res.json(), setCookie: res.headers.get('set-cookie') };
}
async function login(u, p = 'demo1234') { const r = await call('/api/auth/login', { body: { username: u, password: p } }); assert.equal(r.status, 200, `login ${u}`); return r.setCookie.split(';')[0]; }
const act = (c, n, a = {}) => call(`/api/actions/${n}`, { body: a, cookie: c });

try {
  const hr = await login('hr'), vp = await login('vp'), fac = await login('fac_a1'), student = await login('st_a10');

  // RBAC / NFR5
  await tc('TC-15', 'FR2 RBAC', 'A student tries an HR action (create an account)', 'HTTP 403', async () => `HTTP ${(await act(student, 'createUser', { name: 'X', username: 'xxx', email: 'xxx@ubaguio.edu', role: 'HR', position: 'hr' })).status}`);
  await tc('TC-16', 'FR2 RBAC', 'A teacher opens the data: other teachers\' answers included?', 'none', async () => {
    const d = (await call('/api/data', { cookie: fac })).data; const me = d.users.find((u) => u.name === 'Faculty A1').id;
    return d.tasks.some((t) => t.targetId !== me && t.evaluatorId !== me && t.response && !t.response.redacted) ? 'other answers visible' : 'none';
  });
  await tc('TC-17', 'NFR6 release', 'Teacher\'s own results for a period still with the VPs (not released)', 'not visible', async () => {
    const d = (await call('/api/data', { cookie: fac })).data; const me = d.users.find((u) => u.name === 'Faculty A1').id;
    return d.tasks.some((t) => t.periodId === 'p3' && t.targetId === me && t.response && !t.response.redacted) ? 'visible' : 'not visible';
  });
  await tc('TC-18', 'NFR5 anonymity', 'A teacher\'s released results: evaluator names included?', 'no names', async () => {
    const d = (await call('/api/data', { cookie: fac })).data; const me = d.users.find((u) => u.name === 'Faculty A1').id;
    return d.tasks.filter((t) => t.targetId === me && t.response && !t.response.redacted).every((t) => t.evaluatorId === null && t.response.submittedAt == null || t.group !== 'ST' && t.evaluatorId === null) ? 'no names' : 'names visible';
  });

  // FR17 governance
  await tc('TC-19', 'FR17 release order', 'HR releases to faculty before the VP approved', 'HTTP 409 (blocked)', async () => `HTTP ${(await act(hr, 'releaseNext', { periodId: 'p3' })).status}${(await act(hr, 'releaseNext', { periodId: 'p3' })).status === 409 ? ' (blocked)' : ''}`);
  await tc('TC-20', 'FR17 governance', 'VP returns the results to HR with a reason', { stage: 'hr', approvals: 0, hrNotified: true }, async () => {
    await act(vp, 'returnToHR', { periodId: 'p3', reason: 'Dean ratings for SIT look incomplete' });
    const p = sql.prepare("SELECT release_stage, approvals FROM periods WHERE id='p3'").get();
    const n = sql.prepare("SELECT count(*) n FROM notifications WHERE user_id='hr' AND text LIKE '%returned the results%'").get().n;
    return { stage: p.release_stage, approvals: p.approvals ? JSON.parse(p.approvals).length : 0, hrNotified: n > 0 };
  });
  await tc('TC-21', 'FR17 release order', 'HR sends again, VP approves, HR releases', 'HTTP 200 released', async () => {
    await act(hr, 'releaseNext', { periodId: 'p3' }); await act(vp, 'approveRelease', { periodId: 'p3' });
    const r = await act(hr, 'releaseNext', { periodId: 'p3' }); return `HTTP ${r.status} ${r.data.result?.stage === 'faculty' ? 'released' : ''}`.trim();
  });

  // Policy versioning (dynamic rules without code changes)
  await tc('TC-22', 'Policy versioning', 'HR changes the bands: a closed period, an open period somebody already answered in, and the next period', { closed: 3.51, openWithAnswers: 3.51, next: 3.6, version: 1 }, async () => {
    const r = await act(hr, 'setPolicy', { policy: { ...L.DEFAULT_POLICY, bands: [3.6, 3.0, 2.5] }, reason: 'Validation test: new HRMC bands' });
    const closed = JSON.parse(sql.prepare("SELECT policy FROM periods WHERE id='p1'").get().policy).bands[0];
    const open = JSON.parse(sql.prepare("SELECT policy FROM periods WHERE id='p4'").get().policy).bands[0];
    const id = (await act(hr, 'createPeriod', { name: 'Policy test', deadline: '2099-01-01', depts: ['SOL'] })).data.result.id;
    const next = JSON.parse(sql.prepare('SELECT policy FROM periods WHERE id=?').get(id).policy).bands[0];
    await act(hr, 'closePeriod', { periodId: id });
    return { closed, openWithAnswers: open, next, version: r.data.result?.version };
  });
  await tc('TC-23', 'Policy governance', 'A policy change without a reason', 'HTTP 400', async () => `HTTP ${(await act(hr, 'setPolicy', { policy: { ...L.DEFAULT_POLICY, lowItem: 2.8 }, reason: '' })).status}`);
  await tc('TC-24', 'Confidentiality', 'A released period with the minimum at 50, then at 2: does the teacher see the student comments?', ['hidden', 'shown'], async () => {
    await act(hr, 'setPolicy', { policy: { ...L.DEFAULT_POLICY, bands: [3.6, 3.0, 2.5], minAnonymity: 50 }, reason: 'Validation test: anonymity' });
    const { buildSeed: seed } = await import('../src/lib/seed.js'), { viewFor: view } = await import('../server/view.js'), { encryptText } = await import('../server/secrets.js');
    return [50, 2].map((minAnonymity) => {
      const d = seed(), p = d.periods.find((x) => x.id === 'p4'); Object.assign(p, { status: 'closed', releaseStage: 'faculty', policy: { ...L.DEFAULT_POLICY, minAnonymity } });
      for (const t of d.tasks) if (t.response) t.response.comment = t.periodId === 'p4' && t.group === 'ST' ? encryptText('A comment') : null;
      const st = view(d, d.users.find((u) => u.id === 'fac_a1')).tasks.filter((t) => t.periodId === 'p4' && t.group === 'ST' && t.targetId === 'fac_a1' && t.response);
      return st.length && st.every((t) => t.response.comment == null) ? 'hidden' : 'shown';
    });
  });

  // FR4 dynamic forms
  await tc('TC-25', 'FR4 form versioning', 'A form already answered: revise it, old answers keep their version', { newVersion: 2, oldAnswersUnchanged: true }, async () => {
    const d = (await call('/api/data', { cookie: hr })).data;
    const used = d.tasks.find((t) => t.response?.instrumentId)?.response.instrumentId;
    const before = sql.prepare('SELECT count(*) n FROM responses WHERE instrument_id = ?').get(used).n;
    const r = await act(hr, 'reviseForm', { instrumentId: used });
    const after = sql.prepare('SELECT count(*) n FROM responses WHERE instrument_id = ?').get(used).n;
    const v = sql.prepare('SELECT version FROM instruments WHERE id = ?').get(r.data.result.id).version;
    return { newVersion: v, oldAnswersUnchanged: before === after };
  }, (a) => a.newVersion >= 2 && a.oldAnswersUnchanged);

  // Data import validation
  const csv = ['section code,subject,teacher email,student ID,student name,student UB email',
    'VT-1,Validation Subject,fac_a1@ubaguio.edu,99990001,Val One,99990001@s.ubaguio.edu',
    'VT-1,Validation Subject,fac_a1@ubaguio.edu,99990001,Val One,99990001@s.ubaguio.edu',
    'VT-1,Validation Subject,fac_a1@ubaguio.edu,99990002,Val Two,99990002@gmail.com',
    'VT-1,,fac_a1@ubaguio.edu,99990003,Val Three,99990003@s.ubaguio.edu'].join('\n');
  await tc('TC-26', 'Data validation', 'Check a file with 1 duplicate, 1 non-UB email and 1 missing subject', { duplicates: 1, errors: 2, savedNothing: true }, async () => {
    const before = sql.prepare('SELECT count(*) n FROM sections').get().n;
    const r = (await act(hr, 'importClassList', { csv, dept: 'A', preview: true })).data.result;
    return { duplicates: r.duplicates, errors: r.errorCount, savedNothing: sql.prepare('SELECT count(*) n FROM sections').get().n === before };
  });
  await tc('TC-27', 'Data validation', 'Import the same file: good rows saved, bad rows skipped', { classes: 1, students: 1, skipped: 2 }, async () => {
    const r = (await act(hr, 'importClassList', { csv, dept: 'A' })).data.result;
    return { classes: r.created, students: r.accounts, skipped: r.errorCount };
  });

  // Evaluation integrity
  const sd = (await call('/api/data', { cookie: student })).data;
  const openPeriod = sd.periods.find((x) => x.status === 'open');
  const open = sd.tasks.find((t) => t.periodId === openPeriod.id && !t.response);
  const ins = open && L.formForTask(sd, open);
  const answers = ins ? Object.fromEntries(ins.items.map((it) => [it.criterionId, 3])) : {};
  await tc('TC-28', 'Deadline', 'A student submits after the deadline has passed', 'HTTP 409 (rejected)', async () => {
    const old = openPeriod.deadline;
    await act(hr, 'setPeriodDeadline', { periodId: openPeriod.id, deadline: '2020-01-01' });
    const r = await act(student, 'submitEvaluation', { taskId: open.id, answers, comment: '' });
    await act(hr, 'setPeriodDeadline', { periodId: openPeriod.id, deadline: old });
    return `HTTP ${r.status}${r.status === 409 ? ' (rejected)' : ''}`;
  });
  await tc('TC-29', 'Duplicate submission', 'A student submits the same evaluation twice', ['HTTP 200', 'HTTP 409'], async () => {
    const a = await act(student, 'submitEvaluation', { taskId: open.id, answers, comment: 'Validation comment: clear lessons' });
    const b = await act(student, 'submitEvaluation', { taskId: open.id, answers, comment: '' });
    return [`HTTP ${a.status}`, `HTTP ${b.status}`];
  });
  await tc('TC-30', 'Encryption (NFR)', 'The comment as stored in the database file', 'encrypted (no readable text)', () => {
    const row = sql.prepare('SELECT comment FROM responses WHERE task_id = ?').get(open.id);
    return row?.comment && !row.comment.includes('clear lessons') ? 'encrypted (no readable text)' : 'readable';
  });

  // FR20 audit
  await tc('TC-31', 'FR20 audit trail', 'Policy change is logged with before -> after values and reason', 'logged', () => {
    const row = sql.prepare("SELECT detail FROM audit_log WHERE action='setPolicy' ORDER BY id LIMIT 1").get();
    return row && row.detail.includes('→') && row.detail.includes('reason:') ? 'logged' : 'missing';
  });
  await tc('TC-32', 'FR20 audit integrity', 'Verify the audit log hash chain', 'intact', async () => ((await call('/api/audit/verify', { cookie: hr })).data.ok ? 'intact' : 'broken'));
  await tc('TC-33', 'FR20 audit integrity', 'Someone edits an audit entry directly in the database', 'tampering detected at that entry', async () => {
    const id = sql.prepare("SELECT id FROM audit_log WHERE action='setPolicy' ORDER BY id LIMIT 1").get().id;
    sql.prepare("UPDATE audit_log SET detail = 'edited by hand' WHERE id = ?").run(id);
    const r = (await call('/api/audit/verify', { cookie: hr })).data;
    return !r.ok && r.firstBad.id === id ? 'tampering detected at that entry' : JSON.stringify(r);
  });
  /* ---------------- Part C: dynamic computation engine (formulas as data) ---------------- */
  const F = await import('../src/lib/formula.js');
  const base = { method: 'WEIGHTED_AVERAGE', components: [{ group: 'ST', weight: 40, aggregation: 'SECTION_AVERAGE' }, { group: 'DEAN', weight: 40, aggregation: 'AVERAGE' }, { group: 'CHAIR', weight: 20, aggregation: 'AVERAGE' }], expression: '', missing: 'REWEIGHT', minGroups: 1, participation: { percent: 50, plusOne: true }, rounding: { decimals: 2, method: 'HALF_UP' } };
  const S = { ST: 4.3, DEAN: 4.5, CHAIR: 4.1 };
  const w = (a, b, c) => ({ ...base, components: [{ ...base.components[0], weight: a }, { ...base.components[1], weight: b }, { ...base.components[2], weight: c }] });
  await tc('TC-34', 'Dynamic formula: weights', 'Same answers, 40/40/20 then 30/50/20 (configuration only)', [4.34, 4.36], () => [F.computeFinal(w(40, 40, 20), S).final, F.computeFinal(w(30, 50, 20), S).final]);
  await tc('TC-35', 'Dynamic formula: method', 'Switch from weighted to simple average (S + D + P) / 3', 4.3, () => F.computeFinal({ ...base, method: 'AVERAGE' }, S).final);
  await tc('TC-36', 'Dynamic formula: missing group', 'Dean missing: re-weight / invalidate / count as zero / use the others\' average', [4.23, null, 2.54, 4.22], () => ['REWEIGHT', 'INVALIDATE', 'ZERO', 'SUBSTITUTE_MEAN'].map((m) => F.computeFinal({ ...base, missing: m }, { ...S, DEAN: null }).final));
  await tc('TC-37', 'Dynamic formula: custom expression', 'Expression 0.3*ST + 0.5*DEAN + 0.2*CHAIR', 4.36, () => F.computeFinal({ ...base, method: 'CUSTOM', missing: 'INVALIDATE', expression: '0.3*ST + 0.5*DEAN + 0.2*CHAIR' }, S).final);
  await tc('TC-38', 'Security: no code execution', 'Expressions with code: process.exit(), constructor(1), ST.constructor, __proto__', 'all rejected', () => (['process.exit()', 'constructor(1)', 'ST.constructor', '__proto__', 'require("fs")'].every((x) => { try { F.parseExpression(x, ['ST']); return false; } catch { return true; } }) ? 'all rejected' : 'one was accepted'));
  await tc('TC-39', 'Dynamic formula: rounding', '3.465 half up / half even, 3.469 down, 3.461 up; 3.4567 to 3 decimals', [3.47, 3.46, 3.46, 3.47, 3.457], () => [F.roundBy(3.465, 2, 'HALF_UP'), F.roundBy(3.465, 2, 'HALF_EVEN'), F.roundBy(3.469, 2, 'DOWN'), F.roundBy(3.461, 2, 'UP'), F.roundBy(3.4567, 3, 'HALF_UP')]);
  await tc('TC-40', 'Formula validation', 'Weights total 90%; a group with no form for this category', 2, () => F.validateFormula({ ...w(40, 30, 20) }, { allowedGroups: ['ST', 'DEAN', 'CHAIR'] }).length + F.validateFormula({ ...base, components: [...base.components.slice(0, 2), { group: 'NTPHEAD', weight: 20, aggregation: 'AVERAGE' }] }, { allowedGroups: ['ST', 'DEAN', 'CHAIR'] }).length, (n) => n === 2);
  await tc('TC-56', 'Formula conditions', 'Safe IF and comparison operators choose a result from configured score conditions', 4.3, () => F.computeFinal({ ...base, method: 'CUSTOM', components: [base.components[0]], expression: 'if(ST >= 4, ST, 2)', missing: 'INVALIDATE' }, { ST: 4.3 }).final);
  await tc('TC-57', 'Score transformation', 'Transform a group score before weighted computation', 3.48, () => F.computeFinal({ ...base, components: [{ ...base.components[0], transform: 'X / 2' }, ...base.components.slice(1)] }, S).final);
  await tc('TC-58', 'Formula participation', 'A formula can count a class at 50% without the legacy plus-one policy', { valid: true, score: 3.5 }, () => {
    const d = scenario({ students: 40, answered: 20 });
    d.periods[0].formulas = { COLLEGE_FACULTY: { ...L.defaultFormula(d.rules.COLLEGE_FACULTY), participation: { percent: 50, plusOne: false } } };
    const r = L.computeTarget(d, 'P', 'T');
    return { valid: r.groups.ST.score != null, score: r.groups.ST.score };
  });

  const before = (await call('/api/data', { cookie: hr })).data;
  const p1Before = L.computeTarget(before, 'p1', 'fac_a1').final;
  let fxId;
  await tc('TC-41', 'Formula approval workflow', 'Draft → activate without approval → submit without basis → HR approves own → VP approves → HR activates', ['409', '400', '403', '200', '200'], async () => {
    const d = await act(hr, 'saveFormulaDraft', { targetType: 'COLLEGE_FACULTY', config: { ...base, name: 'College faculty (simple average)', method: 'AVERAGE' } });
    fxId = d.data.result.id;
    const a = (await act(hr, 'activateFormula', { id: fxId })).status;
    const b = (await act(hr, 'submitFormula', { id: fxId, basis: '' })).status;
    await act(hr, 'submitFormula', { id: fxId, basis: 'Validation test: committee resolution no. 3' });
    const c = (await act(hr, 'approveFormula', { id: fxId })).status;
    const e = (await act(vp, 'approveFormula', { id: fxId })).status;
    const f = (await act(hr, 'activateFormula', { id: fxId })).status;
    return [a, b, c, e, f].map(String);
  });
  await tc('TC-42', 'Formula versioning', 'After activating the new formula: a closed period keeps its rating; the open period with answers keeps its formula', { closedUnchanged: true, openKept: true }, async () => {
    const after = (await call('/api/data', { cookie: hr })).data;
    const open = after.periods.find((x) => x.status === 'open');
    return { closedUnchanged: L.computeTarget(after, 'p1', 'fac_a1').final === p1Before, openKept: !Object.values(open.formulas || {}).some((x) => x.id === fxId) };
  });
  await tc('TC-43', 'Formula versioning', 'A period created after activation uses the new version', 'new version', async () => {
    const r = await act(hr, 'createPeriod', { name: 'AY 2027-28 Term 1 (validation)', deadline: '2099-12-31' });
    const d = (await call('/api/data', { cookie: hr })).data;
    return d.periods.find((x) => x.id === r.data.result.id).formulas?.COLLEGE_FACULTY?.id === fxId ? 'new version' : 'old version';
  });
  await tc('TC-44', 'Formula governance', 'Approved/active formula edited directly; weights page edit of a formula category', ['HTTP 409', 'HTTP 409'], async () => [
    `HTTP ${(await act(hr, 'saveFormulaDraft', { id: fxId, config: base })).status}`,
    `HTTP ${(await act(hr, 'setGroupWeight', { targetType: 'COLLEGE_FACULTY', group: 'ST', weight: 50 })).status}`,
  ]);
  await tc('TC-45', 'Stored results', 'Close the open period: every result stored with formula version; stored = recomputed', { stored: true, allMatch: true }, async () => {
    const d0 = (await call('/api/data', { cookie: hr })).data;
    const open = d0.periods.find((x) => x.status === 'open' && !/validation/.test(x.name));
    await act(hr, 'closePeriod', { periodId: open.id });
    const d = (await call('/api/data', { cookie: hr })).data;
    const rows = d.results.filter((r) => r.periodId === open.id);
    return { stored: rows.length > 0 && rows.every((r) => r.data.formula && 'version' in r.data.formula && Array.isArray(r.data.steps)), allMatch: rows.every((r) => L.computeTarget(d, open.id, r.targetId).final === r.data.final) };
  });
  await tc('TC-46', 'Formula condition', 'A department-only formula (Business, SBAA) applies to its teachers only', { sbaa: 'department formula', sit: 'general formula' }, async () => {
    const x = (await act(hr, 'saveFormulaDraft', { targetType: 'COLLEGE_FACULTY', dept: 'B', config: { ...w(50, 30, 20), name: 'College faculty (SBAA)' } })).data.result.id;
    await act(hr, 'submitFormula', { id: x, basis: 'Validation test: SBAA policy' }); await act(vp, 'approveFormula', { id: x }); await act(hr, 'activateFormula', { id: x });
    const r = await act(hr, 'createPeriod', { name: 'AY 2027-28 Term 2 (validation)', deadline: '2099-12-31' });
    const d = (await call('/api/data', { cookie: hr })).data;
    const fB = L.formulaFor(d, r.data.result.id, 'COLLEGE_FACULTY', 'B'), fA = L.formulaFor(d, r.data.result.id, 'COLLEGE_FACULTY', 'A');
    return { sbaa: fB.id === x ? 'department formula' : 'other', sit: fA.id === fxId ? 'general formula' : 'other' };
  });
  await tc('TC-47', 'No built-in formula', 'HR makes College faculty 50% Students + 50% Dean (no Chair) and Basic Ed an equal average; the server restarts', { college: { ST: 50, DEAN: 50 }, basicEdUnchanged: true }, async () => {
    const { upgradeData } = await import('../server/upgrade.js');
    const db = structuredClone((await call('/api/data', { cookie: hr })).data);
    db.rules.COLLEGE_FACULTY = { ST: 50, DEAN: 50 };
    db.rules.BASICED_TEACHER = { ST: null, PRIN: null, APRIN: null, SHEAD: null };
    db.formulas = [...(db.formulas || []), { id: 'x1', key: 'COLLEGE_FACULTY', targetType: 'COLLEGE_FACULTY', status: 'active', version: 9, config: {}, meta: {} }, { id: 'x2', key: 'BASICED_TEACHER', targetType: 'BASICED_TEACHER', status: 'active', version: 1, config: {}, meta: {} }];
    upgradeData(db);
    return { college: db.rules.COLLEGE_FACULTY, basicEdUnchanged: Object.values(db.rules.BASICED_TEACHER).every((x) => x == null) };
  });
  await tc('TC-48', 'Blank formula', 'HR starts a blank formula and tries to send it without choosing anything', 'HTTP 400 (must choose method, groups and missing-group rule)', async () => {
    const r = await act(hr, 'saveFormulaDraft', { targetType: 'NTP_STAFF', config: { name: 'Blank', method: '', components: [], missing: '' } });
    const s = await act(hr, 'submitFormula', { id: r.data.result.id, basis: 'Validation test: blank formula' });
    return s.status === 400 && /method/i.test(s.data.error) && /group/i.test(s.data.error) ? 'HTTP 400 (must choose method, groups and missing-group rule)' : `HTTP ${s.status}: ${s.data.error}`;
  });
  /* ---------------- Part D: ideas from similar systems ---------------- */
  const C = await import('../src/lib/comments.js');
  const COMMENTS = ['Very clear explanation and approachable.', 'Always late and does not return our quizzes.', 'Magaling magturo pero minsan late.', 'Hindi malinaw ang paliwanag.', 'She is never late and always prepared.', 'N/A'];
  await tc('TC-49', 'Comment analysis (sentiment)', 'English, Filipino and Taglish comments, with "not/hindi" and "never late"', ['positive', 'negative', 'mixed', 'negative', 'positive', 'neutral'], () => COMMENTS.map((c) => C.analyzeComment(c).sentiment));
  await tc('TC-50', 'Comment analysis (topics, suggestions)', '"Please give feedback on our work sooner." / "The lessons are clear and well prepared."', [{ suggestion: true, topics: ['feedback'] }, { suggestion: false, topics: ['clarity', 'preparation'] }], () => ['Please give feedback on our work sooner.', 'The lessons are clear and well prepared.'].map((c) => { const a = C.analyzeComment(c); return { suggestion: a.suggestion, topics: a.topics }; }));

  /* ---------------- Part E: algorithm-independent computation (computation modules) ---------------- */
  const LOW = { ST: 3.8, DEAN: 2.0, CHAIR: 3.6 }; // one low group
  await tc('TC-51', 'Computation modules', 'Same answers (Dean low), 40/40/20 with weighted average, geometric mean, harmonic mean', [3.04, 2.91, 2.77],
    () => ['WEIGHTED_AVERAGE', 'GEOMETRIC_MEAN', 'HARMONIC_MEAN'].map((m) => F.computeFinal({ ...base, method: m }, LOW).final));
  await tc('TC-52', 'Computation modules', '"Count it as 0" with a harmonic mean (would divide by zero); with a geometric mean (every rating would be 0)', 2,
    () => ['HARMONIC_MEAN', 'GEOMETRIC_MEAN'].filter((m) => F.validateFormula({ ...base, method: m, missing: 'ZERO' }).some((e) => /does not work/.test(e))).length, (n) => n === 2);
  await tc('TC-53', 'Plug-in architecture', 'A new module ("lowest group rating") is registered without changing the engine; an incomplete module is refused', { accepted: true, final: 2, valid: true, incompleteRefused: true }, () => {
    F.registerMethod({ id: 'TEST_LOWEST', label: 'Lowest group (test module)', missingRules: ['REWEIGHT', 'INVALIDATE'], compute: (items) => ({ raw: Math.min(...items.map((x) => x.value)), how: `lowest of ${items.map((x) => x.value).join(', ')}` }), words: () => 'Final rating = the lowest group rating', symbols: (cs) => `F = min(${cs.map((c) => c.group).join(', ')})` });
    let incompleteRefused = false;
    try { F.registerMethod({ id: 'TEST_BROKEN', label: 'No compute' }); } catch { incompleteRefused = true; }
    const f = { ...base, method: 'TEST_LOWEST' };
    return { accepted: 'TEST_LOWEST' in F.METHODS, final: F.computeFinal(f, LOW).final, valid: F.validateFormula(f).length === 0, incompleteRefused };
  });
  let fx2;
  await tc('TC-54', 'Effective period', 'An approved geometric-mean formula set to "start with the next period"; then HR creates the next period', { whileScheduled: 'old formula in use', newPeriod: 'new formula', oldVersion: 'archived' }, async () => {
    fx2 = (await act(hr, 'saveFormulaDraft', { targetType: 'COLLEGE_FACULTY', config: { ...base, name: 'College faculty (geometric mean)', method: 'GEOMETRIC_MEAN' } })).data.result.id;
    await act(hr, 'submitFormula', { id: fx2, basis: 'Validation test: policy for next school year' });
    await act(vp, 'approveFormula', { id: fx2 });
    await act(hr, 'activateFormula', { id: fx2, when: 'next' });
    const d1 = (await call('/api/data', { cookie: hr })).data;
    const whileScheduled = L.activeFormula(d1, 'COLLEGE_FACULTY')?.id === fxId && d1.formulas.find((x) => x.id === fx2).status === 'scheduled' && !d1.periods.some((p) => p.formulas?.COLLEGE_FACULTY?.id === fx2);
    const r = await act(hr, 'createPeriod', { name: 'AY 2028-29 Term 1 (validation)', deadline: '2099-12-31' });
    const d2 = (await call('/api/data', { cookie: hr })).data;
    return {
      whileScheduled: whileScheduled ? 'old formula in use' : 'changed too early',
      newPeriod: d2.periods.find((x) => x.id === r.data.result.id).formulas?.COLLEGE_FACULTY?.id === fx2 ? 'new formula' : 'old formula',
      oldVersion: d2.formulas.find((x) => x.id === fxId).status,
    };
  });
  await tc('TC-59', 'Effective dates', 'An approved formula is only applied to periods starting inside its configured date window', { before: false, during: true }, async () => {
    const config = { method: 'AVERAGE', components: [{ group: 'NTPSTAFF', aggregation: 'AVERAGE' }], missing: 'REWEIGHT', minGroups: 1, participation: { percent: 50, plusOne: true }, rounding: { decimals: 2, method: 'HALF_UP' }, effectiveFrom: '2099-01-01', effectiveUntil: '2099-12-31', name: 'Non-teaching head dated formula' };
    const draft = await act(hr, 'saveFormulaDraft', { targetType: 'NTP_HEAD', config });
    if (!draft.data.result) return { draftError: draft.data.error };
    const id = draft.data.result.id;
    const submit = await act(hr, 'submitFormula', { id, basis: 'Validation test: effective dates' });
    if (submit.status !== 200) return { submitError: submit.data.error };
    const approve = await act(vp, 'approveFormula', { id });
    if (approve.status !== 200) return { approvalError: approve.data.error };
    const schedule = await act(hr, 'activateFormula', { id, when: 'next' });
    if (schedule.status !== 200) return { scheduleError: schedule.data.error };
    const before = await act(hr, 'createPeriod', { name: 'AY 2098-99 Term 1 (date validation)', startsOn: '2098-12-01', deadline: '2098-12-31' });
    const during = await act(hr, 'createPeriod', { name: 'AY 2099-00 Term 1 (date validation)', startsOn: '2099-02-01', deadline: '2099-02-28' });
    if (!before.data.result || !during.data.result) return { beforeError: before.data.error, duringError: during.data.error };
    const d = (await call('/api/data', { cookie: hr })).data;
    return {
      before: !!d.periods.find((p) => p.id === before.data.result.id).formulas?.NTP_HEAD,
      during: d.periods.find((p) => p.id === during.data.result.id).formulas?.NTP_HEAD?.id === id,
    };
  });
  await tc('TC-55', 'Reproducible results', 'Close a period computed with an approved formula; recompute it with its formula and algorithm versions', { keepsFormula: true, keepsAlgorithmVersion: true, keepsApproval: true, allSame: true }, async () => {
    const d0 = (await call('/api/data', { cookie: hr })).data;
    const p = d0.periods.find((x) => x.status === 'open' && x.formulas?.COLLEGE_FACULTY?.id === fxId);
    await act(hr, 'closePeriod', { periodId: p.id });
    const d = (await call('/api/data', { cookie: hr })).data;
    const rows = d.results.filter((r) => r.periodId === p.id && r.data.formula.key === 'COLLEGE_FACULTY');
    const again = (r) => F.computeFinal(r.data.formula, Object.fromEntries(Object.entries(r.data.groups).map(([g, x]) => [g, x.score ?? null]))).final;
    return {
      keepsFormula: rows.length > 0 && rows.every((r) => r.data.formula.id === fxId && r.data.formula.method === 'AVERAGE' && Array.isArray(r.data.formula.components)),
      keepsAlgorithmVersion: rows.length > 0 && rows.every((r) => r.data.formula.methodVersion === 1),
      keepsApproval: rows.every((r) => r.data.formula.approvedBy && r.data.formula.approvedAt && r.data.formula.basis),
      allSame: d.results.filter((r) => Array.isArray(r.data.formula?.components)).every((r) => again(r) === r.data.final),
    };
  });
  await tc('TC-60', 'HR-configurable evaluator groups', 'HR adds a Department Head group and assigns it to a staff account; the catalog and membership persist', { group: true, membership: true }, async () => {
    const added = await act(hr, 'addEvaluatorGroup', { name: 'Department Head', targetTypes: ['COLLEGE_FACULTY'] });
    if (added.status !== 200) return { addError: added.data.error };
    const created = await act(hr, 'createUser', {
      name: 'Sample Department Head', username: 'sample_dept_head', email: 'sample.dept.head@ubaguio.edu',
      role: 'TP', position: 'faculty', dept: 'A', evaluatorGroupIds: [added.data.result.id],
    });
    if (created.status !== 200) return { createError: created.data.error };
    const d = (await call('/api/data', { cookie: hr })).data;
    return {
      group: d.evaluatorGroups.some((g) => g.id === added.data.result.id && g.name === 'Department Head'),
      membership: d.users.some((u) => u.id === created.data.result.id && u.evaluatorGroupIds.includes(added.data.result.id)),
    };
  });
  await tc('TC-61', 'Evaluator group access control', 'A student cannot add an evaluator group; HR cannot apply a group to an unknown category', { student: 403, invalidCategory: 400 }, async () => ({
    student: (await act(student, 'addEvaluatorGroup', { name: 'Restricted Group', targetTypes: ['COLLEGE_FACULTY'] })).status,
    invalidCategory: (await act(hr, 'addEvaluatorGroup', { name: 'Invalid Category Group', targetTypes: ['UNKNOWN'] })).status,
  }));
  await tc('TC-62', 'Versioned computation modules', 'A new algorithm version can be registered without changing the prior version used by saved formulas', { old: 3.5, new: 4, oldAgain: 3.5, duplicateRejected: true }, () => {
    const components = ['ST', 'DEAN'].map((group) => ({ group, aggregation: 'AVERAGE' }));
    const register = (version, compute) => F.registerMethod({
      id: 'VERSIONED_TEST', version, label: 'Versioned test', missingRules: ['REWEIGHT'], compute,
      words: () => 'Test formula', symbols: () => 'F = test',
    });
    register(1, (items) => ({ raw: items.reduce((sum, item) => sum + item.value, 0) / items.length, how: 'average' }));
    const oldFormula = { ...base, method: 'VERSIONED_TEST', methodVersion: 1, components, missing: 'REWEIGHT' };
    const scores = { ST: 3, DEAN: 4 };
    const old = F.computeFinal(oldFormula, scores).final;
    register(2, (items) => ({ raw: Math.max(...items.map((item) => item.value)), how: 'maximum' }));
    let duplicateRejected = false;
    try { register(1, () => ({ raw: 0 })); } catch { duplicateRejected = true; }
    return {
      old,
      new: F.computeFinal({ ...oldFormula, methodVersion: 2 }, scores).final,
      oldAgain: F.computeFinal(oldFormula, scores).final,
      duplicateRejected,
    };
  });
  /* ---------------- Part G: how sure the results are, early warning, development follow-up, fixes ---------------- */
  const ST = await import('../src/lib/stats.js');
  // 10 enrolled, 6 answered 3.2, 3.4, 3.6, 3.0, 3.8, 3.6: mean 3.433, sd 0.2944, se = sd/sqrt(6) x sqrt(4/9) = 0.0801, t(5) = 2.571 -> 0.21
  await tc('TC-63', 'Margin of error (95%)', 'Class of 10, 6 answered (3.2, 3.4, 3.6, 3.0, 3.8, 3.6); then all 10 answered', [0.21, 0], () => [
    +ST.sampleStats([3.2, 3.4, 3.6, 3.0, 3.8, 3.6], 10).moe.toFixed(2), ST.sampleStats([3, 3, 4, 4, 3, 3, 4, 4, 3, 3], 10).moe]);
  // hand-worked: question variances 1.667 + 0.667 + 0.917 = 3.25, total variance 8.917 -> 3/2 x (1 - 3.25/8.917) = 0.95
  await tc('TC-64', "Form reliability (Cronbach's alpha)", '4 evaluations x 3 questions: (2,3,3) (3,3,4) (4,4,4) (1,2,2)', ['0.95', 'Excellent'], () => {
    const a = ST.cronbachAlpha([[2, 3, 3], [3, 3, 4], [4, 4, 4], [1, 2, 2]]); return [a.toFixed(2), ST.alphaLabel(a)];
  });
  await tc('TC-65', 'Participation forecast', 'Opened 10 days ago, 5 days left, class of 10 (needs 6): 3 answered; 5 answered; then who is warned', { three: 'at-risk 4', five: 'on-track 7', warned: ['dean', 'hr', 'teacher'] }, () => {
    const now = Date.now(), day = 86400000, iso = (t) => new Date(t).toISOString().slice(0, 10);
    const make = (answered) => {
      const db = { departments: [{ id: 'D', name: 'D', kind: 'college' }], users: [{ id: 'T', name: 'Teacher', role: 'TP', position: 'faculty', dept: 'D', active: true }, { id: 'DN', name: 'Dean', role: 'TP', position: 'dean', dept: 'D', active: true }, { id: 'H', name: 'HR', role: 'HR', position: 'hr', active: true }],
        sections: [{ id: 'S', code: 'S-1', subject: 'Subject', facultyId: 'T', dept: 'D', studentIds: [] }], tasks: [], notifications: [], rules: {}, policies: [],
        periods: [{ id: 'P', name: 'Term', status: 'open', deadline: iso(now + 5 * day), openedAt: new Date(now - 10 * day).toISOString(), releaseStage: 'hr', approvals: [] }] };
      for (let i = 0; i < 10; i++) { db.users.push({ id: `s${i}`, name: `s${i}`, role: 'ST', position: 'student', dept: 'D', active: true }); db.sections[0].studentIds.push(`s${i}`); db.tasks.push({ id: `t${i}`, periodId: 'P', evaluatorId: `s${i}`, targetId: 'T', group: 'ST', sectionId: 'S', response: i < answered ? { answers: { q: 3 }, weights: { q: 1 } } : null }); }
      return db;
    };
    const f3 = L.participationForecast(make(3), 'P', 'S', now), f5 = L.participationForecast(make(5), 'P', 'S', now);
    const db = make(3); L.forecastWarnings(db, 'P', now);
    const who = { T: 'teacher', DN: 'dean', H: 'hr' };
    return { three: `${f3.status} ${f3.projected}`, five: `${f5.status} ${f5.projected}`, warned: [...new Set(db.notifications.map((n) => who[n.userId]))].sort() };
  });
  let planId;
  await tc('TC-66', 'Development follow-up', 'Dean A makes a plan for Secretary A (Fair in AY 2025-26 Term 1); another dean, a teacher and a student try; Secretary A reads it; HR closes it',
    ['dean of the department: 200', 'dean of another department: 403', 'teacher: 403', 'student: 403', 'secretary sees it: true', 'other teacher sees it: false', 'confirmed read: true', 'closed as improved: true'], async () => {
      const deanA = await login('dean_a'), deanB = await login('dean_b'), secA = await login('sec_a'), facA2 = await login('fac_a2');
      const d0 = (await call('/api/data', { cookie: hr })).data;
      const target = d0.users.find((u) => u.username === 'sec_a').id;
      const body = { targetId: target, periodId: 'p2', areas: ['Work behavior and attitude'], actions: 'Coaching on work attitude with the office head; seminar in January.', reviewBy: '2027-04-30' };
      const r = await act(deanA, 'createPlan', body);
      planId = r.data.result?.id;
      const b = await act(deanB, 'createPlan', body), t = await act(fac, 'createPlan', body), s = await act(student, 'createPlan', body);
      const sees = (c) => call('/api/data', { cookie: c }).then((x) => x.data.plans.some((p) => p.id === planId));
      const own = await sees(secA), other = await sees(facA2);
      await act(secA, 'acknowledgePlan', { id: planId, note: 'I will attend the January seminar.' });
      const read = !!(await call('/api/data', { cookie: hr })).data.plans.find((p) => p.id === planId).acknowledgedAt;
      await act(hr, 'closePlan', { id: planId, outcome: 'improved', note: 'Validation test' });
      const closed = (await call('/api/data', { cookie: hr })).data.plans.find((p) => p.id === planId);
      return [`dean of the department: ${r.status}`, `dean of another department: ${b.status}`, `teacher: ${t.status}`, `student: ${s.status}`, `secretary sees it: ${own}`, `other teacher sees it: ${other}`, `confirmed read: ${read}`, `closed as improved: ${closed.status === 'closed' && closed.outcome === 'improved'}`];
    });
  await tc('TC-67', 'Development follow-up', "The plan's follow-up compares the next period with a rating (AY 2025-26 Term 2) with the plan's period", 'next period found, change = after - before', async () => {
    const d = (await call('/api/data', { cookie: hr })).data;
    const plan = d.plans.find((p) => p.id === planId);
    const pr = L.planProgress(d, plan);
    const before = L.computeTarget(d, 'p2', plan.targetId).final, after = L.computeTarget(d, 'p3', plan.targetId).final;
    return pr.next?.id === 'p3' && pr.before === before && pr.after === after && Math.abs(pr.change - (after - before)) < 1e-9 ? 'next period found, change = after - before' : JSON.stringify(pr);
  });
  await tc('TC-68', 'Fix DEF-01: comment limit', 'Submit with a 2,001-character comment, then 2,000', ['HTTP 400 with the limit in the message', 'HTTP 200'], async () => {
    // an open test period that has already started (a new one may be refused by the formula effective dates)
    const today = L.today();
    const per = (await call('/api/data', { cookie: hr })).data.periods.find((p) => p.status === 'open' && /(validation)/.test(p.name) && (!p.startDate || p.startDate <= today) && p.deadline >= today);
    if (!per) return ['no open test period'];
    // classes belong to a semester: give that semester a class with this student
    await act(hr, 'importClassList', { dept: 'A', term: L.termOf(per.name), csv: 'TC68,Comment test,fac_a1@ubaguio.edu,st_a07@s.ubaguio.edu' });
    const c = await login('st_a07');
    const d = (await call('/api/data', { cookie: c })).data;
    const t = d.tasks.find((x) => x.periodId === per.id && !x.response && x.group === 'ST');
    if (!t) return ['no open evaluation for this student'];
    const ans = Object.fromEntries(L.formForTask(d, t).items.map((it) => [it.criterionId, 3]));
    const a = await act(c, 'submitEvaluation', { taskId: t.id, answers: ans, comment: 'x'.repeat(2001) });
    const b = await act(c, 'submitEvaluation', { taskId: t.id, answers: ans, comment: 'x'.repeat(2000) });
    return [a.status === 400 && /2,000/.test(a.data.error) ? 'HTTP 400 with the limit in the message' : `HTTP ${a.status} ${a.data.error}`, `HTTP ${b.status}`];
  });
  await tc('TC-69', 'Fix DEF-02: empty form', 'HR creates a Program-Chair form for Dentistry with no questions; which form do Dentistry teachers get?', "UB's general form until the new form has a question", async () => {
    const r = await act(hr, 'createForm', { targetType: 'COLLEGE_FACULTY', group: 'CHAIR', dept: 'SOD' });
    const d = (await call('/api/data', { cookie: hr })).data;
    const used = L.instrumentFor(d, 'COLLEGE_FACULTY', 'CHAIR', 'SOD');
    return used && used.id !== r.data.result.id && used.items.length > 0 ? "UB's general form until the new form has a question" : `form in use: ${used?.id} (${used?.items.length} items)`;
  });
  await tc('TC-70', 'Fix DEF-06: large class list', 'Check a 3,000-row class list (about 330 KB); then a 5 MB one', ['HTTP 200, 3000 rows read', 'HTTP 413 with a message'], async () => {
    const rows = ['section code,subject,teacher name,teacher email,student ID,student name,student UB email'];
    for (let i = 0; i < 600; i++) for (let k = 1; k <= 5; k++) rows.push(`BIG-${k},Big Subject ${k},Big Teacher ${k},big.teacher${k}@ubaguio.edu,bg${String(i).padStart(5, '0')},Big Student ${i},bg${String(i).padStart(5, '0')}@s.ubaguio.edu`);
    const a = await act(hr, 'importClassList', { csv: rows.join('\n'), dept: 'SOL', preview: true });
    const b = await act(hr, 'importClassList', { csv: 'x'.repeat(5 * 1024 * 1024), dept: 'SOL', preview: true });
    return [`HTTP ${a.status}, ${a.data.result?.rows} rows read`, b.status === 413 && /too large/i.test(b.data.error) ? 'HTTP 413 with a message' : `HTTP ${b.status} ${b.data.error}`];
  });
  await tc('TC-71', 'Fix DEF-03: Clinical Instructors', 'CI weights; the Program Chair has a form for CIs and is assigned to evaluate the Nursing CI', { weights: { ST: 40, DEAN: 40, CHAIR: 20 }, chairForm: true, chairTask: true }, async () => {
    const d = (await call('/api/data', { cookie: hr })).data;
    const ci = d.users.find((u) => u.username === 'ci_c1').id, chair = d.users.find((u) => u.username === 'chair_c').id;
    return { weights: d.rules.CI, chairForm: !!L.instrumentFor(d, 'CI', 'CHAIR', 'C'), chairTask: d.tasks.some((t) => t.targetId === ci && t.evaluatorId === chair && t.group === 'CHAIR') };
  });
  /* ---------------- Part H: evaluation tools (drafts, checks) and adding an evaluator group ---------------- */
  const { buildSeed } = await import('../src/lib/seed.js');
  const { actions: A } = await import('../server/actions.js');
  const { upgradeData } = await import('../server/upgrade.js');
  const HRU = { id: 'hr', name: 'HR', role: 'HR', position: 'hr' }, VPU = { id: 'vp', name: 'VP', role: 'DIR', position: 'vp' };
  /** Run an action on a copy of the sample data, like the API does (kept only when it succeeds). */
  const lab = () => {
    const box = { db: buildSeed() };
    box.run = async (name, args = {}, user = HRU) => {
      const copy = structuredClone(box.db);
      try { const r = await A[name].run(copy, args, user, { afterSave: [] }); box.db = copy; return { ok: true, ...r }; } catch (e) { return { ok: false, error: e.message }; }
    };
    box.tool = (tt = 'COLLEGE_FACULTY', g = 'ST') => box.db.instruments.find((i) => i.active !== false && i.targetType === tt && i.group === g && !i.dept && !i.variant);
    box.activate = async (tt, dept, components, when = 'now') => {
      const f = await box.run('saveFormulaDraft', { targetType: tt, dept, config: { name: 'x', method: 'WEIGHTED_AVERAGE', components, missing: 'REWEIGHT', minGroups: 1, rounding: { decimals: 2, method: 'HALF_UP' } } });
      const s = await box.run('submitFormula', { id: f.id, basis: 'Validation test' });
      if (!s.ok) return s;
      await box.run('approveFormula', { id: f.id }, VPU);
      return box.run('activateFormula', { id: f.id, when });
    };
    return box;
  };
  const tasksOf = (db, periodId, id) => db.tasks.filter((t) => t.periodId === periodId && t.targetId === id).reduce((o, t) => ({ ...o, [t.group]: (o[t.group] || 0) + 1 }), {});

  await tc('TC-72', 'Tool drafts', 'HR changes the student tool while a period is open: which form do students get? Then HR discards the draft', { during: 'same form', after: 'same form', drafts: 0 }, async () => {
    const x = lab(), t = x.db.tasks.find((k) => k.periodId === 'p4' && k.group === 'ST' && !k.response && k.targetId === 'fac_a2');
    const before = L.formForTask(x.db, t).id, r = await x.run('reviseForm', { instrumentId: before });
    for (const it of x.db.instruments.find((i) => i.id === r.id).items.slice(0, 5)) await x.run('removeFormItem', { instrumentId: r.id, criterionId: it.criterionId });
    const during = L.formForTask(x.db, t).id;
    await x.run('discardForm', { instrumentId: r.id });
    return { during: during === before ? 'same form' : 'changed', after: L.formForTask(x.db, t).id === before ? 'same form' : 'changed', drafts: x.db.instruments.filter((i) => i.status).length };
  });
  const T60 = (c) => ({ categories: c, items: [['M', 10], ['L', 5], ['R', 8]].flatMap(([k, n]) => Array.from({ length: n }, (_, i) => ({ criterionId: k + i, weight: 1, category: k }))) });
  await tc('TC-73', 'Tool checks', '60/35/blank; 60/25/5; an empty part; no indicators; 60/35/5', [false, false, false, false, true], () =>
    [T60({ M: 60, L: 35, R: null }), T60({ M: 60, L: 25, R: 5 }), T60({ M: 50, L: 35, R: 5, X: 10 }), { categories: {}, items: [] }, T60({ M: 60, L: 35, R: 5 })].map((i) => L.toolProblems(i).length === 0));
  await tc('TC-74', 'Weights inside a tool', '10, 5 and 8 indicators at 60/35/5, averages 4, 3 and 2', 3.55, () => {
    const i = T60({ M: 60, L: 35, R: 5 }), v = { M: 4, L: 3, R: 2 };
    return +L.responseScore({ answers: Object.fromEntries(i.items.map((it) => [it.criterionId, v[it.category]])), weights: L.effectiveWeights(i) }).toFixed(4);
  });
  await tc('TC-75', 'Tool versions', 'A new version while the open period has answers; a second period is created; then the first is closed and another is created', ['scheduled', 'still waiting', 'in use', 'old answers unchanged'], async () => {
    const x = lab(), old = x.tool().id, n = x.db.tasks.filter((t) => t.response?.instrumentId === old).length;
    const r = await x.run('reviseForm', { instrumentId: old }); await x.run('useForm', { instrumentId: r.id });
    const st = () => L.toolStatus(x.db.instruments.find((i) => i.id === r.id)), a = st();
    const c = await x.run('createPeriod', { name: 'N1', deadline: '2099-01-01' }), b = st();
    await x.run('closePeriod', { periodId: 'p4' }); await x.run('createPeriod', { name: 'N2', deadline: '2099-01-01' });
    return [a, b === 'scheduled' && c.waitingTools.length === 1 ? 'still waiting' : b, st() === 'in-use' ? 'in use' : st(), x.db.tasks.filter((t) => t.response?.instrumentId === old).length === n ? 'old answers unchanged' : 'changed'];
  });
  await tc('TC-76', 'Tool drafts', 'The server restarts while a brand-new tool is a draft', 'still a draft', async () => {
    const x = lab(); await x.run('createForm', { targetType: 'DEAN', group: 'SHEAD', name: 'Draft tool' });
    upgradeData(x.db); const i = x.db.instruments.find((k) => k.name === 'Draft tool');
    return L.toolStatus(i) === 'draft' && i.active === false ? 'still a draft' : L.toolStatus(i);
  });
  await tc('TC-77', 'Tool wording', 'HR rewords an answered indicator in a draft; HR types the same indicator twice', { oldKept: true, newWording: true, duplicate: 'rejected' }, async () => {
    const x = lab(), old = x.tool(), cid = old.items[0].criterionId, was = x.db.criteria.find((c) => c.id === cid).text;
    const r = await x.run('reviseForm', { instrumentId: old.id }), e = await x.run('editFormItem', { instrumentId: r.id, criterionId: cid, text: 'A new wording for this indicator' });
    await x.run('addNewFormItem', { instrumentId: r.id, text: 'Typed indicator', category: 'Research and Extension' });
    const again = await x.run('addNewFormItem', { instrumentId: r.id, text: 'typed indicator', category: 'Research and Extension' });
    return { oldKept: x.db.criteria.find((c) => c.id === cid).text === was && x.tool().items[0].criterionId === cid, newWording: x.db.criteria.find((c) => c.id === e.criterionId).text === 'A new wording for this indicator', duplicate: again.ok ? 'accepted' : 'rejected' };
  });
  await tc('TC-78', 'Tool checks', 'A tool in use has a part with no weight: HR creates a period', 'refused, tool named', async () => {
    const x = lab(); x.tool().categories['Research and Extension'] = null;
    const r = await x.run('createPeriod', { name: 'N', deadline: '2099-01-01' });
    return !r.ok && /Faculty by the Students/.test(r.error) && /has no weight/.test(r.error) ? 'refused, tool named' : JSON.stringify(r);
  });
  await tc('TC-79', 'Adding an evaluator group', 'Peers rate college faculty 30/10/40/20 (3.50, 3.00, 3.60, 3.40): ratings while setting up; final; peer evaluations for 5 SIT faculty; Basic Ed', { whileSettingUp: 'unchanged', blockedByDraft: true, final: 3.47, sitPeerTasks: 20, basicEd: { ST: 10, PRIN: 1, APRIN: 1, SHEAD: 1 } }, async () => {
    const x = lab();
    for (const n of ['x1', 'x2', 'x3']) x.db.users.push({ id: n, username: n, email: `${n}@ubaguio.edu`, name: n, role: 'TP', position: 'faculty', dept: 'A', active: true });
    const before = L.computeTarget(x.db, 'p4', 'fac_a1').final;
    const g = await x.run('addGroupWithFormula', { targetType: 'COLLEGE_FACULTY', newGroup: { name: 'Peers', positions: ['faculty'] }, weights: { ST: 30, PEERS: 10, DEAN: 40, CHAIR: 20 } });
    if (!g.ok) return g;
    const during = L.computeTarget(x.db, 'p4', 'fac_a1').final;
    const blocked = !(await x.run('submitFormula', { id: g.id, basis: 'Validation test' })).ok;
    await x.run('addNewFormItem', { instrumentId: g.toolId, text: 'Works well with fellow teachers', category: 'Collegiality' });
    await x.run('useForm', { instrumentId: g.toolId });
    await x.run('submitFormula', { id: g.id, basis: 'Validation test' }); await x.run('approveFormula', { id: g.id }, VPU);
    const a = await x.run('activateFormula', { id: g.id, when: 'now' }); if (!a.ok) return a;
    const p = await x.run('createPeriod', { name: 'N', deadline: '2099-01-01' }); await x.run('generateTasks', { periodId: p.id });
    const f = L.formulaSnapshot(L.activeFormula(x.db, 'COLLEGE_FACULTY'));
    return { whileSettingUp: during === before ? 'unchanged' : during, blockedByDraft: blocked, final: F.computeFinal(f, { ST: 3.5, PEERS: 3, DEAN: 3.6, CHAIR: 3.4 }).final,
      sitPeerTasks: x.db.tasks.filter((t) => t.periodId === p.id && t.group === 'PEERS' && x.db.users.find((u) => u.id === t.targetId).dept === 'A').length, basicEd: tasksOf(x.db, p.id, 'fac_be1') };
  });
  await tc('TC-80', 'Tasks follow the formula', 'SIT has its own formula (Students 50, Dean 50): evaluations for a SIT and an SBAA teacher', { sit: { ST: 10, DEAN: 1 }, sbaa: { ST: 10, DEAN: 1, CHAIR: 1 } }, async () => {
    const x = lab(), r = await x.activate('COLLEGE_FACULTY', 'A', [{ group: 'ST', weight: 50 }, { group: 'DEAN', weight: 50 }]); if (!r.ok) return r;
    const p = await x.run('createPeriod', { name: 'N', deadline: '2099-01-01' }); await x.run('generateTasks', { periodId: p.id });
    return { sit: tasksOf(x.db, p.id, 'fac_a1'), sbaa: tasksOf(x.db, p.id, 'fac_b1') };
  });
  await tc('TC-81', 'Adding an evaluator group', 'Faculty (a built-in group) rate college faculty; percentages of 90%; a group that already counts; nothing is kept when refused', { builtIn: true, ninety: false, twice: false, kept: 0 }, async () => {
    const a = lab(), ok = await a.run('addGroupWithFormula', { targetType: 'COLLEGE_FACULTY', group: 'FAC', weights: { ST: 30, FAC: 10, DEAN: 40, CHAIR: 20 } });
    const b = lab(), n = await b.run('addGroupWithFormula', { targetType: 'COLLEGE_FACULTY', newGroup: { name: 'Peers', positions: ['faculty'] }, weights: { ST: 30, PEERS: 10, DEAN: 30, CHAIR: 20 } });
    const t = await b.run('addGroupWithFormula', { targetType: 'COLLEGE_FACULTY', group: 'DEAN', weights: { ST: 40, DEAN: 40, CHAIR: 20 } });
    return { builtIn: ok.ok, ninety: n.ok, twice: t.ok, kept: b.db.evaluatorGroups.filter((g) => g.name === 'Peers').length + b.db.instruments.filter((i) => i.status).length + (b.db.formulas || []).length };
  });
  await tc('TC-82', 'Upgrade', 'A group an earlier version added with a blank percentage left College faculty without ratings', { before: null, after: true }, () => {
    const d = buildSeed(); d.evaluatorGroups.push({ id: 'DEPT_HEAD', name: 'Dept Head', builtIn: false, active: true });
    d.rules.COLLEGE_FACULTY.DEPT_HEAD = null; d.periods.find((p) => p.id === 'p4').rules.COLLEGE_FACULTY.DEPT_HEAD = null;
    const before = L.computeTarget(d, 'p4', 'fac_a1').final; upgradeData(d);
    return { before, after: L.computeTarget(d, 'p4', 'fac_a1').final != null };
  });
  await tc('TC-83', 'Tool drafts', 'A draft is saved in the database and sent to HR only; a teacher and a student try to use it', { saved: 'draft', hr: true, teacher: false, student: false, status: [403, 403] }, async () => {
    const r = await act(hr, 'createForm', { targetType: 'DEAN', group: 'APRIN', name: 'Saved draft' }), id = r.data.result.id;
    const sees = async (c) => (await call('/api/data', { cookie: c })).data.instruments.some((i) => i.id === id);
    const out = { saved: sql.prepare('SELECT status FROM instruments WHERE id=?').get(id).status, hr: await sees(hr), teacher: await sees(fac), student: await sees(student), status: [(await act(fac, 'useForm', { instrumentId: id })).status, (await act(student, 'discardForm', { instrumentId: id })).status] };
    await act(hr, 'discardForm', { instrumentId: id });
    return out;
  });
  await tc('TC-84', 'Every category can be changed', 'HR gives each of the six categories new percentages; a VP approves; a new period is created', { COLLEGE_FACULTY: 'ST 30, DEAN 50, CHAIR 20', BASICED_TEACHER: 'ST 25, PRIN 25, APRIN 25, SHEAD 25', CI: 'ST 60, DEAN 40', DEAN: 'CHAIR 40, SEC 10, FAC 50', NTP_STAFF: 'NTPHEAD 100', NTP_HEAD: 'NTPSTAFF 100' }, async () => {
    const x = lab(), want = { COLLEGE_FACULTY: { ST: 30, DEAN: 50, CHAIR: 20 }, BASICED_TEACHER: { ST: 25, PRIN: 25, APRIN: 25, SHEAD: 25 }, CI: { ST: 60, DEAN: 40 }, DEAN: { CHAIR: 40, SEC: 10, FAC: 50 }, NTP_STAFF: { NTPHEAD: 100 }, NTP_HEAD: { NTPSTAFF: 100 } };
    for (const [tt, w0] of Object.entries(want)) { const r = await x.activate(tt, null, Object.entries(w0).map(([group, weight]) => ({ group, weight }))); if (!r.ok) return { tt, error: r.error }; }
    const p = await x.run('createPeriod', { name: 'N', deadline: '2099-01-01' }), f = x.db.periods.find((k) => k.id === p.id).formulas;
    return Object.fromEntries(Object.keys(want).map((tt) => [tt, f[tt].components.map((c) => `${c.group} ${c.weight}`).join(', ')]));
  });
  await tc('TC-85', 'Percentages only', 'A formula saved earlier as "every group the same", as "my own formula" and as percentages, when HR changes it', [[33.33, 33.33, 33.34], [null, null], [40, 60]], () => {
    const g = (...xs) => xs.map(([group, weight]) => ({ group, weight }));
    return [{ method: 'AVERAGE', components: g(['ST'], ['DEAN'], ['CHAIR']) }, { method: 'CUSTOM', expression: '(ST + DEAN) / 2', components: g(['ST'], ['DEAN']) }, { method: 'WEIGHTED_AVERAGE', components: g(['ST', 40], ['DEAN', 60]) }].map((f) => F.asPercentages(f).components.map((c) => c.weight));
  });
  await tc('TC-86', 'Tools by period', 'The student tool gets a new version between two periods: which version does each period show, and how many answered? A period before its tasks are created', { first: 'old version, 38 answered', beforeTasks: 'new version, 0 of 60 answered', second: 'new version, 0 of 60 answered', draftListed: false, sameAsCountingTasks: true }, async () => {
    const x = lab(), old = x.tool().id, r = await x.run('reviseForm', { instrumentId: old });
    const answered = x.db.tasks.filter((t) => t.periodId === 'p4' && t.response?.instrumentId === old).length;
    const draftListed = L.toolsOfPeriod(x.db, 'p4').has(r.id);
    await x.run('useForm', { instrumentId: r.id }); await x.run('closePeriod', { periodId: 'p4' });
    const p = await x.run('createPeriod', { name: 'N', deadline: '2099-01-01' });
    const show = (pid) => { const m = L.toolsOfPeriod(x.db, pid), n = m.get(m.has(r.id) ? r.id : old); return { v: m.has(r.id) && m.has(old) ? 'both versions' : m.has(r.id) ? 'new version' : 'old version', n }; };
    const b = show(p.id); await x.run('generateTasks', { periodId: p.id });
    const a = show('p4'), c = show(p.id), total = x.db.tasks.filter((t) => t.periodId === p.id && L.formForTask(x.db, t)?.id === r.id).length;
    const of = (k) => `${k.v}, ${k.n.answered} of ${k.n.answered + k.n.waiting} answered`;
    // sameAsCountingTasks: the same numbers counted straight from the tasks, not by the function being tested
    return { first: `${a.v}, ${a.n.answered} answered`, beforeTasks: of(b), second: of(c), draftListed, sameAsCountingTasks: a.n.answered === answered && a.n.waiting === 0 && c.n.waiting === total };
  });
  /* ---------------- Part I: semesters, notifications, the process steps ---------------- */
  const CY = await import('../src/lib/cycle.js');
  await tc('TC-87', 'School year and semester', 'Names read as the same semester; SIT and SBAA in one semester; SIT twice; all departments on top; a year far ahead; a summer name from before', { sameName: true, sit: true, sbaa: true, sitAgain: false, all: false, year2150: true, summer: 3, printed: 2 }, async () => {
    const x = lab(), make = async (name, depts) => (await x.run('createPeriod', { name, deadline: '2199-01-01', startsOn: '2030-01-01', depts })).ok;
    return { sameName: JSON.stringify(L.semesterOf('AY 2026-27 Term 1')) === JSON.stringify(L.semesterOf(L.periodName(2026, 1))), sit: await make(L.periodName(2031, 1), ['A']), sbaa: await make(L.periodName(2031, 1), ['B']), sitAgain: await make('AY 2031-32 Term 1', ['A']), all: await make(L.periodName(2031, 1), []), year2150: await make(L.periodName(2150, 2), []), summer: L.semesterOf('AY 2024-25 Summer').sem, printed: L.semesterOf(L.periodName(2031, 2)).sem };
  });
  await tc('TC-88', 'Local date', 'A day at 00:30 and 23:30 on this computer', ['2026-11-24', '2026-11-24'], () => [0, 23].map((h) => L.localDay(new Date(2026, 10, 24, h, 30))));
  await tc('TC-89', 'Notifications', 'Where each kind leads; opening one marks only that one; another person cannot', { hr: ['periods', 'assign', 'monitor', 'reports', 'formulas'], dean: ['monitor', 'dept', 'dept'], teacher: ['results', 'results', 'tasks'], vp: ['reports', 'formulas'], unknown: null, onlyOne: true, other: 404 }, async () => {
    const d = buildSeed(); d.formulas = [{ id: 'f1', targetType: 'CI', dept: null }];
    const go = (key, user, pages) => CY.linkFor({ key }, d, user, pages)?.page ?? null;
    const HRP = ['home', 'periods', 'assign', 'monitor', 'reports', 'formulas'], DN = ['tasks', 'monitor', 'dept', 'results'], TE = ['tasks', 'results'], VP = ['home', 'reports', 'formulas'];
    const dean = d.users.find((u) => u.id === 'dean_a'), te = d.users.find((u) => u.id === 'fac_a1'), me = d.users.find((u) => u.id === 'hr'), v = d.users.find((u) => u.id === 'vp');
    const mine = (await call('/api/data', { cookie: hr })).data.notifications.filter((n) => !n.read);
    await act(hr, 'markNotificationRead', { id: mine[0].id });
    const after = (await call('/api/data', { cookie: hr })).data.notifications;
    return {
      hr: [go('appr|p3|vp|hr', me, HRP), go('remhr|p4|hr|2026-01-01', me, HRP), go('part|p4|2026-01-01|hr|hr', me, HRP), go('thr|p3|hr|hr', me, HRP), go('fx|f1|ok|hr', me, HRP)],
      dean: [go('remdept|p4|A|dean_a|2026-01-01', dean, DN), go('rel|p1|head|dean_a', dean, DN), go('rq|p1|fac_a1|dean_a|1', dean, DN)],
      teacher: [go('rel|p1|fac|fac_a1', te, TE), go('thr|p3|sec1', te, TE), go('rem|p4|fac_a1|2026-01-01', te, TE)],
      vp: [go('rel|p3|dir|vp|1', v, VP), go('fx|f1|sub|vp', v, VP)], unknown: go('zzz|1', te, TE),
      onlyOne: after.find((n) => n.id === mine[0].id).read && mine.slice(1).every((m) => !after.find((n) => n.id === m.id).read),
      other: (await act(fac, 'markNotificationRead', { id: mine[1].id })).status,
    };
  });
  await tc('TC-90', 'Process steps', 'The next step: Dean percentages not set; set; a tool broken; period open; closed; sent to the VPs; approved; released', ['scoring', 'monitor', 'tools', 'monitor', 'review', 'approve', 'release', 'plans or finished'], async () => {
    const x = lab(), next = () => CY.nextStep(CY.cycleSteps(x.db, x.db.periods.find((p) => p.id === 'p4')))?.key;
    const out = [next()];
    await x.activate('DEAN', null, [{ group: 'CHAIR', weight: 40 }, { group: 'SEC', weight: 20 }, { group: 'FAC', weight: 40 }]); out.push(next());
    const t = x.tool(), w0 = { ...t.categories }; t.categories['Research and Extension'] = null; out.push(next()); t.categories = w0; out.push(next());
    await x.run('closePeriod', { periodId: 'p4' }); out.push(next());
    await x.run('releaseNext', { periodId: 'p4' }); out.push(next());
    await x.run('approveRelease', { periodId: 'p4' }, VPU); out.push(next());
    await x.run('releaseNext', { periodId: 'p4' }); out.push(['plans', undefined].includes(next()) ? 'plans or finished' : next());
    return out;
  });
  /* ---------------- Part J: step 2 (released results, participation rule, evaluator groups, departments) ---------------- */
  const { viewFor } = await import('../server/view.js');
  /** The sample data with p4 closed by HR (so it remembers its people) and released. */
  const closedLab = async () => {
    const x = lab(); await x.run('closePeriod', { periodId: 'p4' }); await x.run('releaseNext', { periodId: 'p4' }); await x.run('approveRelease', { periodId: 'p4' }, VPU); await x.run('releaseNext', { periodId: 'p4' });
    return x;
  };
  const all = (d) => JSON.stringify(L.computeAll(d, 'p4').map((r) => [r.targetId, r.type, r.dept, r.final, r.status]));
  await tc('TC-91', 'Released results stay the same', 'After release: a teacher moves to Basic Ed; becomes Program Chair; a department changes type; a new teacher is added; a teacher is deactivated', { moved: 'same', chair: 'same', type: 'same', newTeacher: 'same', deactivated: 'same', stored: true }, async () => {
    const x = await closedLab(), before = all(x.db), is = () => (all(x.db) === before ? 'same' : 'changed');
    const u = (id) => x.db.users.find((k) => k.id === id), out = {};
    const acc = (k, more) => ({ userId: k.id, name: k.name, username: k.username, email: k.email, role: k.role, position: k.position, dept: k.dept, ...more });
    const r1 = await x.run('updateUser', acc(u('fac_b2'), { dept: 'BE' })); out.moved = r1.ok ? is() : r1.error;
    x.db.sections = x.db.sections.filter((s) => s.facultyId !== 'fac_a2' || L.isExemptSection(s)); // not teaching any more
    u('fac_a1').position = 'chair'; out.chair = is();
    x.db.departments.find((d) => d.id === 'C').kind = 'basic'; out.type = is();
    x.db.users.push({ id: 'new1', username: 'new1', name: 'New', role: 'TP', position: 'faculty', dept: 'A', active: true }); out.newTeacher = is();
    u('fac_b1').active = false; out.deactivated = is();
    out.stored = x.db.results.filter((r) => r.periodId === 'p4').every((r) => L.computeTarget(x.db, 'p4', r.targetId).final === r.data.final);
    return out;
  }, (a) => ['moved', 'chair', 'type', 'newTeacher', 'deactivated'].every((k) => a[k] === 'same') && a.stored);
  await tc('TC-92', 'Who sees old results', 'A released SIT teacher moves to SBAA: the SIT dean, the SBAA dean, the teacher (now a Program Chair)', { sitDean: true, sbaaDean: false, self: true }, async () => {
    const x = await closedLab(), t = x.db.users.find((k) => k.id === 'fac_a1'); t.dept = 'B'; t.position = 'chair';
    const sees = (id) => viewFor(x.db, x.db.users.find((k) => k.id === id)).tasks.some((k) => k.periodId === 'p4' && k.targetId === 'fac_a1' && k.response && k.evaluatorId === null);
    return { sitDean: sees('dean_a'), sbaaDean: sees('dean_b'), self: sees('fac_a1') };
  });
  await tc('TC-93', 'Department change during a period', 'A teacher already evaluated in an open period; one not evaluated yet; the first one after the period is closed', { evaluated: false, notYet: true, afterClosing: true }, async () => {
    const x = lab(), acc = (id) => { const k = x.db.users.find((u) => u.id === id); return { userId: id, name: k.name, username: k.username, email: k.email, role: k.role, position: k.position, dept: 'B' }; };
    const a = await x.run('updateUser', acc('fac_a1'));
    for (const t of x.db.tasks) if (t.targetId === 'fac_a2' && t.periodId === 'p4') t.response = null;
    const b = await x.run('updateUser', acc('fac_a2'));
    await x.run('closePeriod', { periodId: 'p4' });
    return { evaluated: a.ok, notYet: b.ok, afterClosing: (await x.run('updateUser', acc('fac_a1'))).ok };
  });
  await tc('TC-94', 'Upgrade', 'A period closed by an earlier version: its people come from the stored results, so a later move changes nothing', 'same', async () => {
    const x = await closedLab(); for (const p of x.db.periods) delete p.people;
    upgradeData(x.db); const before = all(x.db); x.db.users.find((k) => k.id === 'fac_b2').dept = 'BE';
    return all(x.db) === before && JSON.parse(before).length > 0 ? 'same' : 'changed';
  });
  await tc('TC-95', 'Participation rule', '"More than 50%" against the earlier "half of the class plus one" for classes of 1 to 300; a class of 35: more than 50 / at least 50 / at least 60 / no rule / no rule with a minimum of 3', { same: true, class35: [18, 18, 21, 1, 3] }, () => {
    const n = (k, r) => L.neededResponses(k, { ...L.DEFAULT_POLICY, ...r });
    return { same: Array.from({ length: 300 }, (_, i) => i + 1).every((k) => n(k, {}) === Math.min(k, Math.floor(k / 2) + 1)), class35: [n(35, {}), n(35, { participationRule: 'atleast' }), n(35, { participationRule: 'atleast', participationPercent: 60 }), n(35, { participationRule: 'none' }), n(35, { participationRule: 'none', participationMin: 3 })] };
  });
  await tc('TC-96', 'Participation rule', 'No rule: a class with 4 of 10 answers; alerts; forecast; what closing says. A minimum of 5 instead', { counts: true, alerts: 0, forecast: null, flagged: 0, withMinimum5: false }, async () => {
    const x = lab(), p4 = x.db.periods.find((p) => p.id === 'p4'), sec = x.db.sections.find((s) => s.facultyId === 'fac_a2' && !L.isExemptSection(s));
    p4.policy = { ...L.DEFAULT_POLICY, participationRule: 'none', participationMin: 5 };
    const withMinimum5 = L.sectionStats(x.db, 'p4', sec.id).valid;
    p4.policy = { ...L.DEFAULT_POLICY, participationRule: 'none' };
    return { counts: L.sectionStats(x.db, 'p4', sec.id).valid && L.computeTarget(x.db, 'p4', 'fac_a2').groups.ST.score != null, alerts: L.participationAlerts(x.db, 'p4'), forecast: L.participationForecast(x.db, 'p4', sec.id), flagged: (await x.run('closePeriod', { periodId: 'p4' })).flagged, withMinimum5 };
  });
  await tc('TC-97', 'Participation rule in one place', 'A saved formula with its own copy: after the upgrade the category follows Evaluation rules; a closed period keeps its copy; a new formula stores none', { before: 50, after: 10, closedKeeps: true, newFormula: false }, async () => {
    const x = lab(); await x.activate('CI', null, [{ group: 'ST', weight: 60 }, { group: 'DEAN', weight: 40 }]);
    const f = x.db.formulas[0], part = { percent: 50, plusOne: true }, sec = x.db.sections.find((s) => s.facultyId === 'ci_c1');
    f.config.participation = part; await x.run('closePeriod', { periodId: 'p4' });
    const p = await x.run('createPeriod', { name: 'N', deadline: '2099-01-01' }), per = x.db.periods.find((k) => k.id === p.id);
    per.formulas.CI.participation = part; x.db.periods.find((k) => k.id === 'p1').formulas = { CI: { ...per.formulas.CI } };
    const set = await x.run('setPolicy', { policy: { ...L.currentPolicy(x.db), participationPercent: 10 }, reason: 'Validation test' }); if (!set.ok) return set;
    const before = L.participationFor(x.db, p.id, sec).participationPercent; upgradeData(x.db);
    const after = L.participationFor(x.db, p.id, sec).participationPercent;
    const d = await x.run('saveFormulaDraft', { targetType: 'DEAN', config: { name: 'x', method: 'WEIGHTED_AVERAGE', components: [{ group: 'FAC', weight: 100 }], missing: 'REWEIGHT', participation: part, rounding: { decimals: 2, method: 'HALF_UP' } } });
    return { before, after, closedKeeps: !!x.db.periods.find((k) => k.id === 'p1').formulas.CI.participation, newFormula: 'participation' in x.db.formulas.find((k) => k.id === d.id).config };
  });
  await tc('TC-98', 'Policy from an earlier version', 'A saved rule with "plus one", and one without', ['more', 'atleast', 'more than 50% of the class', 'at least 60% of the class', 'at least 3 students'], () => [L.fullPolicy({ participationPercent: 50, participationPlusOne: true }).participationRule, L.fullPolicy({ participationPercent: 50, participationPlusOne: false }).participationRule, L.ruleWords(), L.ruleWords({ participationRule: 'atleast', participationPercent: 60 }), L.ruleWords({ participationRule: 'none', participationMin: 3 })]);
  const peers = async (x) => {
    const g = await x.run('addGroupWithFormula', { targetType: 'COLLEGE_FACULTY', newGroup: { name: 'Peers', positions: ['faculty'] }, weights: { ST: 30, PEERS: 10, DEAN: 40, CHAIR: 20 } });
    await x.run('addNewFormItem', { instrumentId: g.toolId, text: 'Works well with fellow teachers', category: 'Collegiality' });
    return g;
  };
  const peerRaters = (x) => x.db.users.filter((u) => L.groupsOf(x.db, u).includes('PEERS')).map((u) => u.id).sort().join();
  await tc('TC-99', 'Edit an evaluator group', 'Peers: rename; members by position, then two chosen people; nobody chosen; the built-in Dean: rename, then change its members', { renamed: 'Fellow teachers', before: 8, after: 'fac_a1,fac_a2', nobody: false, deanName: 'College Dean', deanMembers: false }, async () => {
    const x = lab(); await peers(x); const before = peerRaters(x).split(',').length;
    await x.run('updateEvaluatorGroup', { id: 'PEERS', name: 'Fellow teachers', positions: [], userIds: ['fac_a1', 'fac_a2'] });
    const after = peerRaters(x), nobody = (await x.run('updateEvaluatorGroup', { id: 'PEERS', name: 'Fellow teachers', positions: [], userIds: [] })).ok;
    await x.run('updateEvaluatorGroup', { id: 'DEAN', name: 'College Dean' });
    return { renamed: L.groupName(x.db, 'PEERS'), before, after, nobody, deanName: L.groupName(x.db, 'DEAN'), deanMembers: (await x.run('updateEvaluatorGroup', { id: 'DEAN', name: 'College Dean', positions: ['faculty'], userIds: [] })).ok };
  });
  await tc('TC-100', 'Delete an evaluator group', 'In a draft formula; never used; built in; used in a closed period (then the server restarts; then it is restored)', { inFormula: false, neverUsed: 'deleted', toolsLeft: 0, builtIn: false, used: 'archived', afterRestart: 'still archived', oldRatings: 'same', offered: false, restored: 'in-use' }, async () => {
    const x = lab(); const g = await peers(x); const inFormula = (await x.run('deleteEvaluatorGroup', { id: 'PEERS' })).ok;
    await x.run('deleteFormulaDraft', { id: g.id }); const d = await x.run('deleteEvaluatorGroup', { id: 'PEERS' });
    const out = { inFormula, neverUsed: d.ok && !d.archived && !x.db.evaluatorGroups.some((k) => k.id === 'PEERS') ? 'deleted' : JSON.stringify(d), toolsLeft: x.db.instruments.filter((i) => i.group === 'PEERS').length, builtIn: (await x.run('deleteEvaluatorGroup', { id: 'DEAN' })).ok };
    const y = lab(), h = await peers(y); await y.run('useForm', { instrumentId: h.toolId }); await y.run('submitFormula', { id: h.id, basis: 'Validation test' }); await y.run('approveFormula', { id: h.id }, VPU); await y.run('closePeriod', { periodId: 'p4' }); await y.run('activateFormula', { id: h.id, when: 'now' });
    const p = await y.run('createPeriod', { name: 'N', deadline: '2099-01-01' }); await y.run('generateTasks', { periodId: p.id });
    const t = y.db.tasks.find((k) => k.periodId === p.id && k.group === 'PEERS'), ins = L.formForTask(y.db, t);
    t.response = { answers: { [ins.items[0].criterionId]: 3 }, weights: L.effectiveWeights(ins), instrumentId: ins.id, comment: null };
    await y.run('closePeriod', { periodId: p.id });
    const ratings = () => JSON.stringify(L.computeAll(y.db, p.id).map((r) => [r.targetId, r.final])), before = ratings();
    await y.activate('COLLEGE_FACULTY', null, [{ group: 'ST', weight: 40 }, { group: 'DEAN', weight: 40 }, { group: 'CHAIR', weight: 20 }]);
    const a = await y.run('deleteEvaluatorGroup', { id: 'PEERS' }); if (!a.ok) return a;
    upgradeData(y.db);
    const tool = () => y.db.instruments.find((i) => i.id === h.toolId);
    Object.assign(out, { used: a.archived ? 'archived' : 'deleted', afterRestart: tool().active === false ? 'still archived' : 'back in use', oldRatings: ratings() === before ? 'same' : 'changed', offered: L.formGroups(y.db, 'COLLEGE_FACULTY', { drafts: true }).includes('PEERS') });
    await y.run('restoreEvaluatorGroup', { id: 'PEERS' });
    return { ...out, restored: L.toolStatus(tool()) };
  });
  await tc('TC-101', 'Offices', 'A Registrar with a head and two staff; a student, a teacher and a class list there; SIT changed to an office; the head leaves', { tasks: 4, student: false, teacher: false, classList: false, sitAsOffice: false, warning: 'No office head: its staff get no evaluation.' }, async () => {
    const x = lab(), id = (await x.run('addDepartment', { name: 'Office of the Registrar', kind: 'office' })).id;
    const add = (n, role, position) => x.run('createUser', { name: n, username: n, email: `${n}@ubaguio.edu`, role, position, dept: id });
    await add('reg_head', 'NTP', 'head'); await add('reg_one', 'NTP', 'staff'); await add('reg_two', 'NTP', 'staff');
    const ids = new Set(x.db.users.filter((u) => u.dept === id).map((u) => u.id));
    const tasks = L.expectedAssignments(x.db, 'p4').filter((a) => ids.has(a.targetId)).length;
    const student = (await add('reg_stu', 'ST', 'student')).ok, teacher = (await add('reg_tea', 'TP', 'faculty')).ok;
    const classList = (await x.run('importClassList', { csv: 'X-1,Subject,A Teacher,ateach@ubaguio.edu,20260001,Ana,20260001@s.ubaguio.edu', dept: id, preview: true })).ok;
    for (const t of x.db.tasks) if (t.periodId === 'p4') t.response = null;
    const sitAsOffice = (await x.run('updateDepartment', { deptId: 'A', kind: 'office' })).ok;
    x.db.users.find((u) => u.username === 'reg_head').active = false;
    return { tasks, student, teacher, classList, sitAsOffice, warning: L.deptWarnings(x.db, x.db.departments.find((d) => d.id === id))[0] };
  });
  await tc('TC-102', 'Move a department', 'Move everyone from SIT to SBAA during an open period, then after closing: ratings; delete SIT; deactivate it; a new account there; Nursing to SBAA (it has a Clinical Instructor)', { open: false, people: 17, left: 0, ratings: 'same', sitDeanKept: 'A', deleted: false, deactivated: true, newAccount: false, nursing: false }, async () => {
    const x = lab(), open = (await x.run('moveDepartment', { from: 'A', to: 'B' })).ok;
    await x.run('closePeriod', { periodId: 'p4' }); const before = all(x.db);
    const r = await x.run('moveDepartment', { from: 'A', to: 'B' });
    return { open, people: r.people, left: x.db.users.filter((u) => u.dept === 'A').length + x.db.sections.filter((s) => s.dept === 'A').length, ratings: all(x.db) === before ? 'same' : 'changed', sitDeanKept: L.computeTarget(x.db, 'p4', 'fac_a1').dept,
      deleted: (await x.run('deleteDepartment', { deptId: 'A' })).ok, deactivated: (await x.run('setDepartmentActive', { deptId: 'A', active: false })).ok,
      newAccount: (await x.run('createUser', { name: 'New One', username: 'newone', email: 'newone@ubaguio.edu', role: 'TP', position: 'faculty', dept: 'A' })).ok, nursing: (await x.run('moveDepartment', { from: 'C', to: 'B' })).ok };
  });
  await tc('TC-103', 'Delete a department', 'An empty department that is the only one of a period; an empty one nothing uses; what the period covers afterwards', { onlyOne: false, unused: true, covers: ['Z'] }, async () => {
    const x = lab(); x.db.departments.push({ id: 'Z', name: 'Empty School', kind: 'college' }, { id: 'Y', name: 'Other Empty School', kind: 'college' });
    const p = await x.run('createPeriod', { name: 'N', deadline: '2099-01-01', depts: ['Z'] });
    const onlyOne = (await x.run('deleteDepartment', { deptId: 'Z' })).ok, unused = (await x.run('deleteDepartment', { deptId: 'Y' })).ok;
    return { onlyOne, unused, covers: x.db.periods.find((k) => k.id === p.id).depts };
  });
  await tc('TC-104', 'Saved in the database', 'A deactivated department, an edited group and the people of a closed period are read back; a teacher tries the new actions', { department: false, group: 'Sample heads', people: true, refused: [403, 403, 403] }, async () => {
    const id = (await act(hr, 'addDepartment', { name: 'Saved Office', kind: 'office' })).data.result.id;
    await act(hr, 'setDepartmentActive', { deptId: id, active: false });
    const gid = (await call('/api/data', { cookie: hr })).data.evaluatorGroups.find((g) => !g.builtIn).id;
    await act(hr, 'updateEvaluatorGroup', { id: gid, name: 'Sample heads' });
    const d = (await call('/api/data', { cookie: hr })).data, row = sql.prepare("SELECT people FROM periods WHERE status='closed' AND people IS NOT NULL").get();
    return { department: d.departments.find((k) => k.id === id).active !== false && sql.prepare('SELECT active FROM departments WHERE id=?').get(id).active === 1, group: sql.prepare('SELECT name FROM evaluator_groups WHERE id=?').get(gid).name, people: Object.keys(JSON.parse(row.people)).length > 0,
      refused: [(await act(fac, 'moveDepartment', { from: 'A', to: 'B' })).status, (await act(fac, 'deleteEvaluatorGroup', { id: gid })).status, (await act(student, 'setDepartmentActive', { deptId: 'A', active: false })).status] };
  });
  /* ---------------- Part K: less manual work (classes per semester, the period by itself) ---------------- */
  const I = await import('../server/imports.js');
  const DAY = 86400000, HR_ = 3600000, at = (d, h = 12) => new Date(`${d}T00:00:00`).getTime() + h * HR_;
  await tc('TC-105', 'Reading files', 'Names with a comma in quotes; semicolons; tabs; a quote inside a name; a line break in a cell; columns in another order', { quoted: 'Dela Cruz, Juan', semicolon: 3, tab: 3, inner: 'Juan "JD" Cruz', lines: 2, order: true }, async () => {
    const x = lab(), r = await x.run('importClassList', { dept: 'A', preview: true, csv: 'Student Name,Student ID,Student UB Email,Subject Code,Subject Title,Section,Instructor Name,Instructor Email,Type of class\n"Reyes, Ana",20267001,20267001@s.ubaguio.edu,IT201,Data Science,2A,"Dela Cruz, Juan",jdc@ubaguio.edu,Laboratory' });
    return { quoted: I.parseCsv('a,"Dela Cruz, Juan",b')[0].cells[1], semicolon: I.parseCsv('a;b;c')[0].cells.length, tab: I.parseCsv('a\tb\tc')[0].cells.length, inner: I.parseCsv('"Juan ""JD"" Cruz",x')[0].cells[0], lines: I.parseCsv('"a\nb",c\nd,e').length, order: r.ok && r.errorCount === 0 && r.newClasses[0] === '2A · IT201 – Data Science (1 students)' };
  });
  const LIST = (opts = {}) => { // 2A, 2B, 2C x 3 subjects x 35 students; the same section code for every subject
    const rows = ['section,subject,teacher name,teacher email,student id,student name,student email'], subj = [['Data Science', 'prof1'], ['Web Development', 'prof2'], ['Intro to Computer Science', 'prof3']];
    ['2A', '2B', '2C'].forEach((sec, i) => subj.forEach(([name, p]) => { for (let k = 0; k < 35; k++) { const id = 20268000 + i * 35 + k; if (opts.without?.(sec, name, k)) continue; rows.push(`${sec},${name},${p},${p}@ubaguio.edu,${id},"Student, No ${id}",${id}@s.ubaguio.edu`); } }));
    if (opts.ben) rows.push('2A,Intro to Computer Science,prof3,prof3@ubaguio.edu,st_b01,Student B01,st_b01@s.ubaguio.edu');
    return rows.join('\n');
  };
  await tc('TC-106', 'Classes', 'Three sections, three subjects, three professors, 35 students each, the same section code for every subject; Ana is not in Web Development; Ben (of another department) joins Intro to CS', { errors: 0, classes: 9, perProfessor: [105, 104, 106], regular: 3, ana: 2, ben: 1 }, async () => {
    const x = lab(); await x.run('closePeriod', { periodId: 'p4' });
    const r = await x.run('importClassList', { dept: 'A', term: '2031-1', csv: LIST({ ben: true, without: (s, n, k) => s === '2A' && n === 'Web Development' && k === 0 }) }); if (!r.ok) return r;
    const p = await x.run('createPeriod', { name: L.periodName(2031, 1), deadline: '2099-01-01', depts: ['A'] }); L.syncOpenPeriods(x.db);
    const T = x.db.tasks.filter((t) => t.periodId === p.id && t.group === 'ST'), of = (u) => x.db.users.find((k) => k.username === u).id, n = (u) => T.filter((t) => t.evaluatorId === of(u)).length;
    return { errors: r.errorCount, classes: r.created, perProfessor: ['prof1', 'prof2', 'prof3'].map((u) => T.filter((t) => t.targetId === of(u)).length), regular: n('20268001'), ana: n('20268000'), ben: n('st_b01') };
  });
  await tc('TC-107', 'Classes of a semester', 'A new semester with no class list yet; the same section with another teacher in the new semester; a class of the old semester; a teacher promoted after the semester', { studentEvaluations: 0, secondSemester: 0, oldKept: true, sameCode: 2, whileTeaching: false, afterSemester: true }, async () => {
    const x = lab(), promote = async () => { const k = x.db.users.find((u) => u.id === 'fac_a2'); return (await x.run('updateUser', { userId: k.id, name: k.name, username: k.username, email: k.email, role: 'TP', position: 'chair', dept: 'A' })).ok; };
    for (const t of x.db.tasks) if (t.targetId === 'fac_a2' && t.periodId === 'p4') t.response = null;
    const whileTeaching = await promote();
    await x.run('closePeriod', { periodId: 'p4' });
    const p = await x.run('createPeriod', { name: 'AY 2026-2027 2nd Semester', deadline: '2099-01-01' }); L.syncOpenPeriods(x.db);
    const n = x.db.tasks.filter((t) => t.periodId === p.id && t.group === 'ST').length;
    const r = await x.run('importClassList', { dept: 'A', term: '2026-2', csv: 'SEC-A1,Sample Subject A1,fac_a2@ubaguio.edu,st_a01@s.ubaguio.edu' });
    return { studentEvaluations: n, secondSemester: r.errorCount, oldKept: x.db.sections.some((s) => s.id === 'sec1' && s.facultyId === 'fac_a1'), sameCode: x.db.sections.filter((s) => s.code === 'SEC-A1').length, whileTeaching, afterSemester: (x.db.sections = x.db.sections.filter((s) => s.term !== '2026-2'), await promote()) };
  });
  await tc('TC-108', 'Dropped students', 'A newer list without 4 of 10 students: only checked; then removed. One of the 4 had already answered', { found: 4, unchanged: 10, classSize: [10, 7], needed: [6, 4], answerKept: true }, async () => {
    const x = lab(), sec = x.db.sections.find((s) => s.facultyId === 'fac_a2' && !L.isExemptSection(s)), st = () => L.sectionStats(x.db, 'p4', sec.id);
    const answered = x.db.tasks.filter((t) => t.periodId === 'p4' && t.sectionId === sec.id && t.response).map((t) => t.evaluatorId), not = sec.studentIds.filter((id) => !answered.includes(id));
    const gone = new Set([answered[0], ...not.slice(0, 3)]);
    const csv = sec.studentIds.filter((id) => !gone.has(id)).map((id) => `${sec.code},${sec.subject},fac_a2@ubaguio.edu,${id}@s.ubaguio.edu`).join('\n');
    const r = await x.run('importClassList', { dept: 'A', csv, preview: true }), a = st();
    const unchanged = x.db.sections.find((s) => s.id === sec.id).studentIds.length;
    await x.run('importClassList', { dept: 'A', csv, drop: true }); L.syncOpenPeriods(x.db); const b = st();
    return { found: r.droppedCount, unchanged, classSize: [a.required, b.required], needed: [a.needed, b.needed], answerKept: x.db.tasks.some((t) => t.sectionId === sec.id && t.periodId === 'p4' && t.evaluatorId === answered[0] && t.response) };
  });
  await tc('TC-109', 'Type of class', 'From the file; suggested from the subject; a lecture; a practicum; then all suggestions at once', { file: 'lab', suggest: 'lab', lecture: null, practicum: null, applied: 1, unknown: 1 }, async () => {
    const x = lab(); await x.run('importClassList', { dept: 'A', csv: 'section,subject,teacher email,student,type\nL1,Networks,fac_a1,st_a01,Laboratory\nL2,Physics Laboratory,fac_a1,st_a01,\nL3,Collaboration Skills,fac_a1,st_a01,\nL4,Laboratory Practicum,fac_a1,st_a01,' });
    const u = await x.run('importClassList', { dept: 'A', preview: true, csv: 'section,subject,teacher email,student,type\nL9,Networks,fac_a1,st_a01,Dance' });
    const c = (k) => x.db.sections.find((s) => s.code === k), out = { file: c('L1').classType, suggest: L.suggestClassType(x.db, c('L2')), lecture: L.suggestClassType(x.db, c('L3')), practicum: L.suggestClassType(x.db, c('L4')) };
    return { ...out, applied: (await x.run('applyClassTypes', { sectionIds: ['L2', 'L3'].map((k) => c(k).id) })).changed, unknown: u.errorCount };
  });
  await tc('TC-110', 'Staff list', 'A dean, a chair with a comma in the name, an office head; an unknown position, a non-UB email, a dean in an office, somebody who has an account; temporary passwords are random', { created: 3, errors: 3, existing: 1, chair: 'Dela Cruz, Juan', random: true, checkedOnly: 0 }, async () => {
    const x = lab(); await x.run('addDepartment', { name: 'Registrar', kind: 'office' }); const n = x.db.users.length;
    const csv = 'name,UB email,position,department or office\nMaria Santos,msantos@ubaguio.edu,Dean,SIT\n"Dela Cruz, Juan",jdcruz@ubaguio.edu,Program Chair,SIT\nAna Reyes,areyes@ubaguio.edu,Office Head,Registrar\nX,x1@ubaguio.edu,Janitor,SIT\nY,y@gmail.com,Dean,SIT\nZ,z1@ubaguio.edu,Dean,Registrar\nDean A,dean_a@ubaguio.edu,Dean,SIT';
    await x.run('importStaff', { csv, preview: true }); const checkedOnly = x.db.users.length - n;
    const r = await x.run('importStaff', { csv });
    return { created: r.created, errors: r.errorCount, existing: r.existing, chair: x.db.users.find((u) => u.username === 'jdcruz').name, random: new Set(r.passwords.map((p) => p.tempPassword)).size === 3 && r.passwords.every((p) => p.tempPassword.length >= 10 && !p.tempPassword.includes(p.username)), checkedOnly };
  });
  await tc('TC-111', 'Upgrade', 'Classes from before they had a semester: evaluated in AY 2026-27 Term 1; never evaluated', ['2026-1', '2026-1'], () => {
    const d = buildSeed(); for (const s of d.sections) delete s.term; d.sections.push({ id: 'nx', code: 'NX', subject: 'New', facultyId: 'fac_a1', dept: 'A', studentIds: [] });
    upgradeData(d); return ['sec1', 'nx'].map((id) => d.sections.find((s) => s.id === id).term);
  });
  const period = async (x, extra) => { const p = await x.run('createPeriod', { name: 'Timeline', deadline: '2031-03-10', startsOn: '2031-03-01', ...extra }); return () => x.db.periods.find((k) => k.id === p.id); };
  await tc('TC-112', 'The period by itself', 'Starts Mar 1, deadline Mar 10: evaluations on Feb 28 / Mar 1; answering on Feb 28; reminders on Mar 6 and Mar 11; the notice; open 12 hours after the deadline; closed 25 hours after', { feb28: 0, mar1: true, early: 'refused', remindMar6: true, remindMar11: false, notice: true, after12h: 'open', after25h: 'closed', stored: true }, async () => {
    const x = lab(), p = await period(x), out = {}, n = () => x.db.tasks.filter((t) => t.periodId === p().id).length;
    L.runDailyAutomation(x.db, at('2031-02-28')); out.feb28 = n();
    L.runDailyAutomation(x.db, at('2031-03-01', 0.1)); out.mar1 = n() > 0;
    out.early = 'refused'; // (today is before the start date)
    x.db.tasks.push({ id: 'probe', periodId: p().id, evaluatorId: 'st_a01', targetId: 'fac_a1', group: 'ST', sectionId: 'sec1', draft: null, response: null });
    if ((await x.run('submitEvaluation', { taskId: 'probe', answers: {} }, { id: 'st_a01' })).error !== 'This evaluation has not started yet. It opens on its start date.') out.early = 'accepted';
    x.db.tasks = x.db.tasks.filter((t) => t.id !== 'probe');
    const reminded = (d) => { const before = x.db.notifications.filter((n) => n.key?.startsWith(`rem|${p().id}`)).length; L.runDailyAutomation(x.db, at(d)); return x.db.notifications.filter((n) => n.key?.startsWith(`rem|${p().id}`)).length > before; };
    out.remindMar6 = reminded('2031-03-06'); p().lastAuto = null; out.remindMar11 = reminded('2031-03-11');
    out.notice = x.db.notifications.some((n) => n.key?.startsWith(`cls|${p().id}|notice|hr`)); out.after12h = p().status;
    L.runDailyAutomation(x.db, at('2031-03-12', 13)); out.after25h = p().status; out.stored = x.db.results.some((r) => r.periodId === p().id) && p().auto.closedBy === 'evalU';
    return out;
  });
  await tc('TC-113', 'Extending', 'After the deadline HR extends: it does not close; people without answers are told; an old deadline found only now still gives HR 24 hours; a reopened period needs a new deadline', { closedAfterExtending: false, told: true, oldDeadline: ['open', 'closed'], reopenOld: false, reopenNew: true }, async () => {
    const x = lab(), p = await period(x); L.generateTasks(x.db, p().id); p().startDate = '2020-01-01';
    L.runDailyAutomation(x.db, at('2031-03-11')); await x.run('setPeriodDeadline', { periodId: p().id, deadline: '2031-03-20' }); L.runDailyAutomation(x.db, at('2031-03-13'));
    const closedAfterExtending = p().status === 'closed', told = x.db.notifications.some((n) => n.key?.startsWith(`ext|${p().id}|`));
    const y = lab(); y.db.periods.find((k) => k.id === 'p4').deadline = '2020-01-01'; const now = Date.now(), st = () => y.db.periods.find((k) => k.id === 'p4').status;
    L.runDailyAutomation(y.db, now); const a = st(); L.runDailyAutomation(y.db, now + 23 * HR_); const b = st(); L.runDailyAutomation(y.db, now + 25 * HR_);
    const oldDeadline = [a === 'open' && b === 'open' ? 'open' : 'closed too early', st()];
    const reopenOld = (await y.run('reopenPeriod', { periodId: 'p4' })).ok, reopenNew = (await y.run('reopenPeriod', { periodId: 'p4', deadline: '2099-01-01' })).ok;
    return { closedAfterExtending, told, oldDeadline, reopenOld, reopenNew };
  });
  await tc('TC-114', 'Evaluations follow by themselves', 'A new teacher; a deactivated student; an evaluation HR removed by hand; then added again', { newTeacher: 3, deactivated: 'removed', byHand: 'stays removed', addedAgain: true }, async () => {
    const x = lab(); x.db.users.push({ id: 'nt', username: 'nt', email: 'nt@ubaguio.edu', name: 'NT', role: 'TP', position: 'faculty', dept: 'A', active: true });
    L.syncOpenPeriods(x.db); const n = x.db.tasks.filter((t) => t.periodId === 'p4' && (t.targetId === 'nt' || t.evaluatorId === 'nt')).length;
    const open = x.db.tasks.find((t) => t.periodId === 'p4' && t.group === 'ST' && !t.response); x.db.users.find((u) => u.id === open.evaluatorId).active = false; L.syncOpenPeriods(x.db);
    const gone = !x.db.tasks.some((t) => t.id === open.id), d = x.db.tasks.find((t) => t.periodId === 'p4' && t.targetId === 'nt' && t.group === 'DEAN');
    await x.run('removeTask', { taskId: d.id }); L.syncOpenPeriods(x.db); const stays = !x.db.tasks.some((t) => t.periodId === 'p4' && t.targetId === 'nt' && t.group === 'DEAN');
    return { newTeacher: n, deactivated: gone ? 'removed' : 'kept', byHand: stays ? 'stays removed' : 'created again', addedAgain: (await x.run('addAssignment', { periodId: 'p4', evaluatorId: 'dean_a', targetId: 'nt' })).ok };
  });
  await tc('TC-115', 'After sending to the VPs', 'A VP silent for 2, 4, 5 and 8 days; approving with the switch off, then on', { reminders: [0, 1, 1, 2], off: 'dir', on: 'faculty', facultyTold: true }, async () => {
    const run = async (autoRelease) => { const x = lab(); x.db.periods.find((p) => p.id === 'p4').policy = { ...L.DEFAULT_POLICY, autoRelease }; await x.run('closePeriod', { periodId: 'p4' }); await x.run('releaseNext', { periodId: 'p4' }); return x; };
    const x = await run(false), now = Date.now(), n = () => x.db.notifications.filter((k) => k.key?.startsWith('vpr|p4|vp')).length;
    const reminders = [2, 4, 5, 8].map((d) => { L.runDailyAutomation(x.db, now + d * DAY); return n(); });
    const y = await run(true); await x.run('approveRelease', { periodId: 'p4' }, VPU); await y.run('approveRelease', { periodId: 'p4' }, VPU);
    const st = (b) => b.db.periods.find((p) => p.id === 'p4').releaseStage;
    return { reminders, off: st(x), on: st(y), facultyTold: y.db.notifications.some((k) => k.key === 'rel|p4|fac|fac_a1') };
  });
  await tc('TC-116', 'Needs you', 'Sample data; a laboratory subject; a closed period; a plan past its review date', { start: ['Dean: the percentages are not set, so nobody gets a rating.'], lab: true, closed: true, plan: true }, async () => {
    const x = lab(), has = (re) => CY.needsYou(x.db).some((k) => re.test(k.text)); const start = CY.needsYou(x.db).map((k) => k.text);
    x.db.sections[0].subject = 'Physics Laboratory'; const labs = has(/looks like laboratory/); await x.run('closePeriod', { periodId: 'p4' });
    x.db.plans = [{ id: 'q', status: 'open', targetId: 'fac_a1', periodId: 'p2', reviewBy: '2020-01-01', createdById: 'dean_a' }];
    return { start, lab: labs, closed: has(/is closed: review the results/), plan: has(/due for review/) };
  });
  await tc('TC-117', 'Speed', 'Preparing the evaluations of 5,000 students, 300 teachers and 1,000 classes of 40, then checking them again', 'under 5 seconds, nothing added twice', () => {
    const d = buildSeed(); d.periods = []; d.tasks = []; d.sections = []; d.users = d.users.filter((u) => u.role === 'HR');
    for (let i = 0; i < 5000; i++) d.users.push({ id: `s${i}`, name: `s${i}`, role: 'ST', position: 'student', dept: 'A', active: true });
    for (let i = 0; i < 300; i++) d.users.push({ id: `f${i}`, name: `f${i}`, role: 'TP', position: 'faculty', dept: ['A', 'B', 'C'][i % 3], active: true });
    for (const k of ['A', 'B', 'C']) d.users.push({ id: `d${k}`, name: k, role: 'TP', position: 'dean', dept: k, active: true });
    for (let i = 0; i < 1000; i++) d.sections.push({ id: `c${i}`, code: `C${i}`, subject: 'S', facultyId: `f${i % 300}`, dept: ['A', 'B', 'C'][(i % 300) % 3], studentIds: Array.from({ length: 40 }, (_, k) => `s${(i * 40 + k) % 5000}`) });
    d.periods.push({ id: 'P', name: 'Big', status: 'open', deadline: '2099-01-01', releaseStage: 'hr', rules: d.rules, depts: null, approvals: [] });
    const t0 = Date.now(), a = L.syncOpenPeriods(d), b = L.syncOpenPeriods(d), ms = Date.now() - t0;
    return a.added > 40000 && b.added === 0 && b.removed === 0 && ms < 5000 ? 'under 5 seconds, nothing added twice' : `${ms} ms, added ${a.added} then ${b.added}`;
  });
} finally {
  server.close();
}

/* ---------------- report ---------------- */
const passed = results.filter((r) => r.pass).length;
let commit = 'unknown'; try { commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch { /* not a git checkout */ }
const md = [
  '# evalU validation test report',
  '',
  `Run: ${new Date().toISOString()} · Node ${process.version} · code version ${commit} · fresh test database with the sample data`,
  '',
  `**Result: ${passed} of ${results.length} test cases passed.**`,
  '',
  'Each case runs automatically (`npm run test:validation`). "Actual" is measured during this run, not written by hand.',
  'Part A checks the computation rules on controlled data; Part B runs the real server, database and access control;',
  'Part C checks the formula engine and its approval and versions; Part D the comment analysis; Part E the computation modules (plug-ins), the effective period and the reproducibility of stored results; Part F HR-configurable evaluator groups and access control; Part H evaluation tool drafts and checks, and adding an evaluator group; Part I semesters, notifications and the process steps; Part J released results, participation rule, evaluator groups and departments; Part K classes per semester and what the period does by itself; Part G the margin of error, form reliability, participation forecast, development follow-up and the fixes from the 20 Nov 2026 test.',
  '',
  '| ID | Requirement | Scenario | Expected | Actual | Result |',
  '|---|---|---|---|---|---|',
  ...results.map((r) => `| ${r.id} | ${r.req} | ${r.scenario} | ${r.expected} | ${r.actual} | ${r.pass ? 'PASS' : '**FAIL**'} |`),
  '',
  'Limits of this report: these are developer-run functional, security and integration tests on simulated data. They do not replace the stakeholder evaluation (ISO/IEC 25010 questionnaire) or confirmation of the rules by HRMC.',
  '',
].join('\n');
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/test-report.md', md);
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id}  ${r.scenario}${r.pass ? '' : `\n      expected ${r.expected}\n      actual   ${r.actual}`}`);
console.log(`\n${passed}/${results.length} passed · report written to docs/test-report.md`);
try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows keeps the database file open until exit */ }
process.exit(passed === results.length ? 0 : 1);
