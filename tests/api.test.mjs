// Backend tests: sign-in, what each role can see, actions and permission checks.
// Run with `node tests/api.test.mjs` (or `npm test`). Uses a temporary database.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evalu-api-'));
process.env.EVALU_DATA_DIR = dir;
const { handleApi } = await import('../server/api.js');
const { sql } = await import('../server/db.js');
const { instrumentFor, targetType } = await import('../src/lib/logic.js');

const server = http.createServer(async (req, res) => { if (!(await handleApi(req, res))) { res.writeHead(404); res.end(); } });
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

async function call(p, { body, cookie, contentType = 'application/json' } = {}) {
  const res = await fetch(base + p, {
    method: body ? 'POST' : 'GET',
    headers: { ...(body && { 'Content-Type': contentType }), ...(cookie && { Cookie: cookie }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, data: await res.json(), setCookie: res.headers.get('set-cookie') };
}
async function login(username, password = 'demo1234') {
  const r = await call('/api/auth/login', { body: { username, password } });
  assert.equal(r.status, 200, `login ${username}: ${r.data.error}`);
  return r.setCookie.split(';')[0];
}
const act = (cookie, name, args = {}) => call(`/api/actions/${name}`, { body: args, cookie });

try {
  /* ---------- sign-in ---------- */
  assert.equal((await call('/api/auth/me')).status, 401);
  assert.equal((await call('/api/data')).status, 401, 'data needs sign-in');
  assert.equal((await call('/api/auth/login', { body: { username: 'hr', password: 'nope' } })).status, 401);
  assert.equal((await call('/api/auth/login', { body: { username: 'ghost', password: 'demo1234' } })).status, 401);
  assert.equal((await call('/api/auth/login', { body: { username: '', password: '' } })).status, 400);

  const hashes = sql.prepare('SELECT password_hash FROM users').all();
  assert.ok(hashes.length > 10 && hashes.every((u) => u.password_hash.startsWith('scrypt$')), 'passwords are hashed');

  const ok = await call('/api/auth/login', { body: { username: 'HR ', password: 'demo1234' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.id, 'hr');
  assert.equal(ok.data.user.password_hash, undefined);
  assert.match(ok.setCookie, /HttpOnly/);
  assert.match(ok.setCookie, /SameSite=Strict/);
  const hr = ok.setCookie.split(';')[0];
  assert.equal((await call('/api/auth/me', { cookie: hr })).data.user.id, 'hr');
  assert.equal((await call('/api/auth/me', { cookie: 'evalu_sid=forged' })).status, 401);
  assert.equal(sql.prepare('SELECT count(*) n FROM sessions').get().n, 1, 'session stored in database');
  const tokenInDb = sql.prepare('SELECT token_hash FROM sessions').get().token_hash;
  assert.notEqual(tokenInDb, hr.split('=')[1], 'only a hash of the token is stored');

  // FR1: sign in with the official UB email; other email addresses are refused
  assert.equal((await call('/api/auth/login', { body: { username: 'fac_a1@ubaguio.edu', password: 'demo1234' } })).status, 200, 'UB email works');
  assert.equal((await call('/api/auth/login', { body: { username: 'st_a01@s.ubaguio.edu', password: 'demo1234' } })).status, 200, 'student subdomain works');
  assert.equal((await call('/api/auth/login', { body: { username: 'fac_a1@gmail.com', password: 'demo1234' } })).status, 403, 'non-UB email refused');

  // FR10: the first data request of the day sends the automatic reminders (sample period is due in 5 days)
  await call('/api/data', { cookie: hr });
  assert.ok(sql.prepare("SELECT count(*) n FROM notifications WHERE kind='reminder'").get().n > 0, 'automatic reminders sent');
  assert.ok(sql.prepare("SELECT last_auto FROM periods WHERE id='p4'").get().last_auto, 'automation recorded');
  const remCount = sql.prepare("SELECT count(*) n FROM notifications").get().n;
  await call('/api/data', { cookie: hr });
  assert.equal(sql.prepare("SELECT count(*) n FROM notifications").get().n, remCount, 'only once a day');

  // lockout after 5 failures, other accounts unaffected
  for (let i = 0; i < 5; i++) await call('/api/auth/login', { body: { username: 'dean_c', password: 'bad' } });
  assert.equal((await call('/api/auth/login', { body: { username: 'dean_c', password: 'demo1234' } })).status, 429);

  /* ---------- what each role sees ---------- */
  const student = await login('st_a10');
  const sv = (await call('/api/data', { cookie: student })).data;
  assert.ok(sv.tasks.length > 0 && sv.tasks.every((t) => t.evaluatorId === 'st_a10'), 'student sees only own tasks');
  assert.ok(sv.users.every((u) => !('password_hash' in u)), 'no password hashes');
  assert.ok(sv.sections.every((s) => s.studentIds.length === 0), 'no class lists for students');

  const dir1 = await login('director');
  const dv = (await call('/api/data', { cookie: dir1 })).data;
  const released = new Set(dv.periods.filter((p) => p.releaseStage !== 'hr').map((p) => p.id));
  assert.ok(dv.tasks.length > 0 && dv.tasks.every((t) => released.has(t.periodId)), 'director sees released periods only');
  assert.ok(dv.tasks.every((t) => t.evaluatorId === null), 'director does not see who evaluated');
  assert.ok(dv.tasks.some((t) => typeof t.response?.comment === 'string'), 'director sees decrypted comments');

  // a Clinical Instructor sees only their own results, and only once released
  const ci = await login('ci_c1');
  const civ = (await call('/api/data', { cookie: ci })).data;
  assert.ok(civ.tasks.some((x) => x.targetId === 'ci_c1' && x.periodId === 'p1' && x.response && !x.response.redacted && x.evaluatorId === null), 'CI sees own released results');
  assert.ok(!civ.tasks.some((x) => x.targetId === 'ci_c1' && x.periodId === 'p3' && x.response && !x.response.redacted), 'not before release');
  // Clinical Instructors are only in the School of Nursing
  const ciIn = (dept) => act(hr, 'createUser', { name: 'New CI', username: 'new.ci', email: 'new.ci@ubaguio.edu', role: 'TP', position: 'ci', dept });
  assert.equal((await ciIn('A')).status, 400, 'a CI outside Nursing is refused');
  assert.equal((await ciIn('C')).status, 200, 'a CI in the School of Nursing is accepted');
  assert.equal((await act(hr, 'updateDepartment', { deptId: 'C', name: 'School of IT 2' })).status, 409, 'a department with CIs stays Nursing');
  // the HRMC Assistant can do HR work
  const asst = await login('hr_assistant');
  assert.equal((await call('/api/audit', { cookie: asst })).status, 200, 'HRMC Assistant reads the audit log');

  const fac = await login('fac_a1');
  const fv = (await call('/api/data', { cookie: fac })).data;
  for (const t of fv.tasks.filter((x) => x.evaluatorId !== 'fac_a1')) {
    assert.equal(t.evaluatorId, null, 'faculty never sees evaluator identities');
    const p = fv.periods.find((x) => x.id === t.periodId);
    if (p.releaseStage !== 'faculty') assert.ok(!t.response || (t.response.redacted && t.response.comment == null), 'unreleased: counts only, no answers, no comments');
  }
  // FR14: own released results include verbatim comments, never who wrote them
  assert.ok(fv.tasks.some((x) => x.targetId === 'fac_a1' && typeof x.response?.comment === 'string' && x.evaluatorId === null), 'faculty sees anonymous comments');

  const hv = (await call('/api/data', { cookie: hr })).data;
  assert.equal(hv.tasks.length, sql.prepare('SELECT count(*) n FROM tasks').get().n, 'HR sees all tasks');
  const raw = sql.prepare('SELECT comment FROM responses WHERE comment IS NOT NULL').get().comment;
  assert.ok(!raw.includes('Sample verbatim'), 'comments are encrypted in the database');

  /* ---------- evaluating ---------- */
  const open = sv.periods.find((p) => p.status === 'open');
  const task = sv.tasks.find((t) => t.periodId === open.id && !t.response);
  assert.ok(task, 'student has an open task');
  const ins = instrumentFor(sv, targetType(sv, sv.users.find((u) => u.id === task.targetId)), task.group);
  const items = ins.items.map((i) => i.criterionId);

  // strict deadline: after the deadline nothing can be saved or submitted, even though HR has not closed the period
  const keepDeadline = open.deadline;
  assert.equal((await act(hr, 'setPeriodDeadline', { periodId: open.id, deadline: '2020-01-01' })).status, 200);
  assert.equal((await act(student, 'saveDraft', { taskId: task.id, answers: { [items[0]]: 4 } })).status, 409, 'no drafts after the deadline');
  assert.equal((await act(student, 'submitEvaluation', { taskId: task.id, answers: Object.fromEntries(items.map((c) => [c, 5])) })).status, 409, 'no submission after the deadline');
  assert.equal((await act(hr, 'setPeriodDeadline', { periodId: open.id, deadline: keepDeadline })).status, 200);

  // draft is saved, bad ratings rejected
  assert.equal((await act(student, 'saveDraft', { taskId: task.id, answers: { [items[0]]: 4 } })).status, 200);
  assert.deepEqual(sql.prepare('SELECT draft FROM tasks WHERE id=?').get(task.id).draft, JSON.stringify({ answers: { [items[0]]: 4 }, comment: '' }));
  assert.equal((await act(student, 'saveDraft', { taskId: task.id, answers: { [items[0]]: 9 } })).status, 400);
  // incomplete submit rejected
  assert.equal((await act(student, 'submitEvaluation', { taskId: task.id, answers: { [items[0]]: 4 } })).status, 400);
  // someone else's task rejected
  assert.equal((await act(fac, 'submitEvaluation', { taskId: task.id, answers: {} })).status, 403);
  // full submit works and is stored in the answers table
  const all5 = Object.fromEntries(items.map((c) => [c, 5]));
  const sub = await act(student, 'submitEvaluation', { taskId: task.id, answers: all5, comment: 'students can comment too' });
  assert.equal(sub.status, 200);
  assert.equal(sql.prepare('SELECT count(*) n FROM answers WHERE task_id=?').get(task.id).n, items.length);
  const stored = sql.prepare('SELECT comment, instrument_id FROM responses WHERE task_id=?').get(task.id);
  assert.ok(stored.comment && !stored.comment.includes('students can comment'), 'FR14: student comment kept, encrypted');
  assert.equal(stored.instrument_id, ins.id, 'FR4: form version stored with the response');
  assert.equal(sql.prepare('SELECT draft FROM tasks WHERE id=?').get(task.id).draft, null);
  assert.ok(sub.data.data.tasks.find((t) => t.id === task.id).response, 'reply contains refreshed data');
  // cannot submit twice
  assert.equal((await act(student, 'submitEvaluation', { taskId: task.id, answers: all5 })).status, 409);

  /* ---------- HR-only actions ---------- */
  assert.equal((await act(student, 'createPeriod', { name: 'X', deadline: '2030-01-01' })).status, 403, 'students cannot use HR actions');
  assert.equal((await act(dir1, 'setGroupWeight', { targetType: 'DEAN', group: 'SEC', weight: 10 })).status, 403);
  assert.equal((await act(hr, 'nope')).status, 404);
  assert.equal((await act(hr, 'createPeriod', { name: '', deadline: '2030-01-01' })).status, 400);
  const np = await act(hr, 'createPeriod', { name: 'Test period', deadline: '2030-01-01' });
  assert.equal(np.status, 200);
  const pid = np.data.result.id;
  assert.equal(sql.prepare('SELECT name FROM periods WHERE id=?').get(pid).name, 'Test period');
  const gen = await act(hr, 'generateTasks', { periodId: pid });
  assert.ok(gen.data.result.added > 0);
  assert.equal(sql.prepare('SELECT count(*) n FROM tasks WHERE period_id=?').get(pid).n, gen.data.result.added);
  assert.equal((await act(hr, 'releaseNext', { periodId: pid })).status, 409, 'cannot release an open period');
  assert.equal((await act(hr, 'closePeriod', { periodId: pid })).status, 200);
  assert.ok(sql.prepare("SELECT count(*) n FROM notifications WHERE kind='invalidated'").get().n > 1, 'threshold check notified faculty');
  assert.equal((await act(hr, 'setGroupWeight', { targetType: 'DEAN', group: 'SEC', weight: 250 })).status, 400);
  assert.equal((await act(hr, 'setGroupWeight', { targetType: 'DEAN', group: 'SEC', weight: 25 })).status, 200);
  assert.equal(sql.prepare("SELECT weight FROM group_weights WHERE target_type='DEAN' AND evaluator_group='SEC'").get().weight, 25);
  assert.equal(JSON.parse(sql.prepare('SELECT rules FROM periods WHERE id=?').get(pid).rules).DEAN.SEC, null, 'NFR8: closed period keeps its weights');
  assert.equal(JSON.parse(sql.prepare("SELECT rules FROM periods WHERE id='p4'").get().rules).DEAN.SEC, 25, 'open period follows the change');
  assert.equal((await act(hr, 'checkThreshold', { periodId: pid })).status, 409, 'closed period: final check already done');
  const chk = await act(hr, 'checkThreshold', { periodId: 'p4' });
  assert.ok(chk.data.result.flagged > 0);
  assert.ok(sql.prepare("SELECT count(*) n FROM notifications WHERE kind='participation' AND user_id='dean_a'").get().n > 0, 'FR12: dean alerted');

  /* ---------- FR17: Vice President approval before faculty release ---------- */
  assert.equal((await act(hr, 'releaseNext', { periodId: 'p3' })).status, 409, 'needs every Director/VP approval');
  assert.equal((await act(student, 'approveRelease', { periodId: 'p3' })).status, 403);
  assert.equal((await act(dir1, 'approveRelease', { periodId: 'p3' })).status, 200);
  assert.equal((await act(dir1, 'approveRelease', { periodId: 'p3' })).status, 409, 'not twice');
  assert.equal((await act(hr, 'releaseNext', { periodId: 'p3' })).status, 409, 'still waiting for the VP');
  assert.equal((await act(dir1, 'approveRelease', { periodId: 'p4' })).status, 409, 'only periods waiting for review');
  const vp = await login('vp');
  assert.equal((await act(vp, 'approveRelease', { periodId: 'p3' })).status, 200);
  assert.equal((await act(hr, 'releaseNext', { periodId: 'p3' })).status, 200, 'released after both approved');
  assert.ok(sql.prepare("SELECT count(*) n FROM notifications WHERE kind='release' AND user_id='fac_a1'").get().n > 0, 'faculty notified of release');
  assert.ok((await call('/api/data', { cookie: fac })).data.tasks.some((x) => x.periodId === 'p3' && x.targetId === 'fac_a1' && x.response && !x.response.redacted), 'faculty now sees p3');

  /* ---------- FR18: results requested by another office go to the dean ---------- */
  assert.equal((await act(hr, 'recordResultRequest', { periodId: 'p4', targetId: 'fac_a1', office: 'VPAA' })).status, 409, 'not before release');
  const rq = await act(hr, 'recordResultRequest', { periodId: 'p1', targetId: 'fac_a1', office: 'Office of the VPAA' });
  assert.equal(rq.status, 200, rq.data.error);
  assert.deepEqual(rq.data.result.sentTo, ['Dean A']);
  const deanA = await login('dean_a');
  const dav = (await call('/api/data', { cookie: deanA })).data;
  assert.ok(dav.requests.some((x) => x.targetId === 'fac_a1' && x.office === 'Office of the VPAA'), 'dean sees the request');
  assert.ok(dav.tasks.some((x) => x.periodId === 'p1' && x.targetId === 'fac_a1' && x.response && x.evaluatorId === null), 'FR16: dean sees department results, anonymous');
  assert.ok(!dav.tasks.some((x) => x.periodId === 'p4' && x.targetId === 'fac_a1' && x.evaluatorId !== 'dean_a' && x.response && !x.response.redacted), 'not before release');
  assert.equal((await call('/api/data', { cookie: student })).data.requests.length, 0);

  /* ---------- FR4: used forms are locked; changes make a new version ---------- */
  const usedForm = 'i_COLLEGE_FACULTY_ST';
  assert.equal((await act(hr, 'setFormItemWeight', { instrumentId: usedForm, criterionId: 'c1', weight: 3 })).status, 409, 'used form is locked');
  assert.equal((await act(hr, 'renameCriterion', { criterionId: 'c1', text: 'Reworded' })).status, 409, 'answered criterion keeps its wording');
  const rev = await act(hr, 'reviseForm', { instrumentId: usedForm });
  assert.equal(rev.status, 200); assert.equal(rev.data.result.version, 2);
  assert.equal((await act(hr, 'setFormItemWeight', { instrumentId: rev.data.result.id, criterionId: 'c1', weight: 3 })).status, 200, 'new version is editable');
  assert.equal((await act(hr, 'setFormItemCategory', { instrumentId: rev.data.result.id, criterionId: 'c1', category: 'Teaching' })).status, 200);
  assert.equal((await act(hr, 'setFormCategoryWeight', { instrumentId: rev.data.result.id, category: 'Teaching', weight: 60 })).status, 200);
  assert.equal(sql.prepare('SELECT active FROM instruments WHERE id=?').get(usedForm).active, 0, 'old version kept, inactive');
  assert.equal(sql.prepare('SELECT count(*) n FROM responses WHERE instrument_id=?').get(usedForm).n > 0, true, 'past answers still point to the old version');

  /* ---------- FR6: class lists ---------- */
  const imp = await act(hr, 'importClassList', { csv: 'section code, subject, faculty, student\nNEW-A1, New Subject, fac_a1@ubaguio.edu, st_a01@s.ubaguio.edu\nNEW-A1, New Subject, fac_a1, st_b01\nBAD, X, st_a02, st_a01' });
  assert.equal(imp.status, 200);
  assert.equal(imp.data.result.created, 1); assert.equal(imp.data.result.enrolled, 1); assert.equal(imp.data.result.errorCount, 2);
  assert.equal((await act(hr, 'createSection', { code: 'OJT-A', subject: 'Internship A', facultyId: 'fac_a1' })).status, 200);
  // the full ARC list creates the student accounts that don't exist yet
  const full = await act(hr, 'importClassList', { csv: [
    'section code,subject,teacher email,student ID,student name,student UB email',
    'SIT-777,Web Development,fac_a1@ubaguio.edu,20269001,Ana Reyes,20269001@s.ubaguio.edu',
    'SIT-777,Web Development,fac_a1@ubaguio.edu,20269002,Ben Santos,20269002@s.ubaguio.edu',
    'SIT-778,Databases,fac_a1@ubaguio.edu,20269001,Ana Reyes,20269001@s.ubaguio.edu', // same student, second class: no duplicate
    'SIT-777,Web Development,fac_a1@ubaguio.edu,st_a03,Student A03,st_a03@s.ubaguio.edu', // already has an account
    'SIT-777,Web Development,fac_a1@ubaguio.edu,20269003,Cara Lim,cara@gmail.com', // not a UB email
  ].join('\n') });
  assert.equal(full.status, 200, full.data.error);
  assert.equal(full.data.result.accounts, 2, 'two new student accounts');
  assert.equal(full.data.result.created, 2); assert.equal(full.data.result.enrolled, 4); assert.equal(full.data.result.errorCount, 1);
  assert.equal(sql.prepare("SELECT count(*) n FROM users WHERE username='20269001'").get().n, 1, 'no duplicate account');
  assert.equal(sql.prepare("SELECT dept, must_change_password m FROM users WHERE username='20269002'").get().m, 1, 'must change the first password');
  assert.equal((await call('/api/auth/login', { body: { username: '20269002@s.ubaguio.edu', password: '20269002' } })).status, 200, 'first password is the student ID');
  assert.equal(sql.prepare("SELECT count(*) n FROM users WHERE email='cara@gmail.com'").get().n, 0, 'non-UB email refused');
  // 7 columns: a teacher who doesn't exist yet is created in the chosen department (SIT here = id A)
  const t7 = 'section code,subject,teacher name,teacher email,student ID,student name,student UB email\nSIT-900,Networks,Juan Dela Cruz,jdelacruz@ubaguio.edu,20269101,Gia Cruz,20269101@s.ubaguio.edu\nSIT-900,Networks,Juan Dela Cruz,jdelacruz@ubaguio.edu,20269102,Hal Diaz,20269102@s.ubaguio.edu';
  assert.equal((await act(hr, 'importClassList', { csv: t7 })).data.result.teachers, 0, 'no department chosen: teacher not created');
  const imp7 = await act(hr, 'importClassList', { csv: t7, dept: 'A' });
  assert.equal(imp7.data.result.teachers, 1); assert.equal(imp7.data.result.accounts, 2); assert.equal(imp7.data.result.errorCount, 0);
  const jt = sql.prepare("SELECT role, position, dept, must_change_password m FROM users WHERE username='jdelacruz'").get();
  assert.deepEqual([jt.role, jt.position, jt.dept, jt.m], ['TP', 'faculty', 'A', 1], 'new teacher is SIT faculty and must change the password');
  assert.equal(sql.prepare("SELECT dept FROM users WHERE username='20269101'").get().dept, 'A', 'students in the same department');
  assert.equal((await call('/api/auth/login', { body: { username: 'jdelacruz@ubaguio.edu', password: 'jdelacruz' } })).status, 200, 'teacher first password');

  /* ---------- FR8: a period for one department ---------- */
  const pB = (await act(hr, 'createPeriod', { name: 'Dept B only', deadline: '2030-04-01', depts: ['B'] })).data.result.id;
  await act(hr, 'generateTasks', { periodId: pB });
  const deptsInB = sql.prepare('SELECT DISTINCT u.dept FROM tasks t JOIN users u ON u.id = t.target_id WHERE t.period_id=?').all(pB).map((x) => x.dept);
  assert.deepEqual(deptsInB, ['B']);

  /* ---------- FR21: earlier records ---------- */
  const pr = await act(hr, 'importPastResults', { csv: 'user, period, score\nfac_a1@ubaguio.edu, AY 2021-22 Term 2, 4.1\nnobody, X, 4\nfac_a1, Y, 9' });
  assert.equal(pr.data.result.added, 1); assert.equal(pr.data.result.errorCount, 2);
  assert.ok((await call('/api/data', { cookie: fac })).data.pastResults.some((x) => x.periodLabel === 'AY 2021-22 Term 2'), 'faculty sees own earlier records');
  assert.ok(!(await call('/api/data', { cookie: student })).data.pastResults.length, 'students see none');

  /* ---------- FR20: audit log ---------- */
  assert.equal((await act(dir1, 'logView', { periodId: 'p3', targetId: 'fac_a1', what: 'individual' })).status, 200);
  assert.equal((await call('/api/audit', { cookie: student })).status, 403, 'only HR reads the audit log');
  const audit = (await call('/api/audit', { cookie: hr })).data.entries;
  const has = (action, re) => audit.some((e) => e.action === action && (!re || re.test(e.detail)));
  assert.ok(has('releaseNext', /AY 2025-26 Term 2/), 'release logged');
  assert.ok(has('approveRelease') && has('setGroupWeight') && has('signIn'), 'approvals, changes and sign-ins logged');
  assert.ok(has('view', /individual result of Faculty A1/), 'views logged');
  assert.ok(audit.every((e) => !/demo1234|MyOwnPass/.test(e.detail || '')), 'no passwords in the log');
  const c = await act(hr, 'addCriterion', { text: 'New criterion' });
  assert.equal((await act(hr, 'renameCriterion', { criterionId: c.data.result.id, text: 'Renamed' })).status, 200);
  assert.equal(sql.prepare('SELECT text FROM criteria WHERE id=?').get(c.data.result.id).text, 'Renamed');
  assert.equal((await act(hr, 'deleteCriterion', { criterionId: 'c1' })).status, 409, 'criterion in use cannot be deleted');

  /* ---------- accounts ---------- */
  const tryLogin = (username, password) => call('/api/auth/login', { body: { username, password } });
  const secA = hv.sections.find((x) => x.dept === 'A').id;
  assert.equal((await act(student, 'createUser', { name: 'X', username: 'xxx', role: 'HR', position: 'hr' })).status, 403, 'only HR creates accounts');
  assert.equal((await act(hr, 'createUser', { name: 'Dup', username: 'st_a01', email: 'dup@s.ubaguio.edu', role: 'ST', position: 'student', dept: 'A' })).status, 409, 'username taken');
  assert.equal((await act(hr, 'createUser', { name: 'Dup', username: 'dup2', email: 'st_a01@s.ubaguio.edu', role: 'ST', position: 'student', dept: 'A' })).status, 409, 'email taken');
  assert.equal((await act(hr, 'createUser', { name: 'Bad', username: 'a b', email: 'ab@s.ubaguio.edu', role: 'ST', position: 'student', dept: 'A' })).status, 400);
  assert.equal((await act(hr, 'createUser', { name: 'Bad', username: 'bad1', email: 'bad1@ubaguio.edu', role: 'ST', position: 'dean', dept: 'A' })).status, 400, 'position must fit role');
  assert.equal((await act(hr, 'createUser', { name: 'Bad', username: 'bad2', role: 'ST', position: 'student', dept: 'A' })).status, 400, 'FR1: email required');
  assert.equal((await act(hr, 'createUser', { name: 'Bad', username: 'bad3', email: 'bad3@gmail.com', role: 'ST', position: 'student', dept: 'A' })).status, 400, 'FR1: UB email only');
  const made = await act(hr, 'createUser', { name: 'New Student', username: 'New.Student', email: 'New.Student@s.ubaguio.edu', role: 'ST', position: 'student', dept: 'A', sectionIds: [secA] });
  assert.equal(made.status, 200, made.data.error);
  const { id: newId, tempPassword } = made.data.result;
  assert.equal(made.data.result.username, 'new.student');
  assert.ok(tempPassword.length >= 10);
  // HR can see the temporary password again (e.g. after reloading the page), and only HR
  assert.ok((await call('/api/data', { cookie: hr })).data.users.find((x) => x.id === newId).hasTempPassword, 'list shows it can be looked up');
  assert.ok(!('tempPassword' in (await call('/api/data', { cookie: hr })).data.users.find((x) => x.id === newId)), 'never sent with the list');
  assert.equal((await act(hr, 'showTempPassword', { userId: newId })).data.result.tempPassword, tempPassword, 'same temporary password');
  assert.equal((await act(student, 'showTempPassword', { userId: newId })).status, 403, 'only HR');
  assert.ok(!sql.prepare('SELECT temp_password FROM users WHERE id=?').get(newId).temp_password.includes(tempPassword), 'stored encrypted');
  assert.ok(made.data.data.sections.find((x) => x.id === secA).studentIds.includes(newId), 'enrolled in class');
  assert.ok(sql.prepare('SELECT password_hash FROM users WHERE id=?').get(newId).password_hash.startsWith('scrypt$'));
  assert.ok(made.data.data.users.every((u) => !('passwordHash' in u)), 'HR view has no password hashes');

  // first sign-in: must change the temporary password before anything else
  const first = await tryLogin('new.student', tempPassword);
  assert.equal(first.status, 200);
  assert.equal(first.data.user.mustChangePassword, true);
  const ns = first.setCookie.split(';')[0];
  assert.equal((await call('/api/data', { cookie: ns })).status, 403, 'blocked until password changed');
  assert.equal((await act(ns, 'markNotificationsRead')).status, 403);
  assert.equal((await act(ns, 'changePassword', { newPassword: tempPassword })).status, 400, 'the temporary password cannot be kept');
  assert.equal((await act(ns, 'changePassword', { currentPassword: tempPassword, newPassword: 'short1' })).status, 400, 'too short');
  assert.equal((await act(ns, 'changePassword', { currentPassword: tempPassword, newPassword: 'onlyletters' })).status, 400, 'needs a number');
  assert.equal((await act(ns, 'changePassword', { currentPassword: tempPassword, newPassword: 'new.student99' })).status, 400, 'no username');
  assert.equal((await act(ns, 'changePassword', { newPassword: 'MyOwnPass2026' })).status, 200, 'first sign-in: no current password needed');
  assert.equal((await act(ns, 'changePassword', { currentPassword: 'wrong', newPassword: 'Another2026x' })).status, 400, 'after that the current password is checked');
  assert.equal((await act(ns, 'changePassword', { newPassword: 'Another2026x' })).status, 400, 'and it is required');
  assert.equal((await call('/api/data', { cookie: ns })).status, 200, 'same session keeps working');
  assert.equal((await tryLogin('new.student', tempPassword)).status, 401, 'temporary password no longer works');
  assert.equal((await tryLogin('new.student', 'MyOwnPass2026')).data.user.mustChangePassword, false);
  assert.equal((await act(hr, 'showTempPassword', { userId: newId })).status, 409, 'gone once they chose their own');
  assert.equal(sql.prepare('SELECT temp_password FROM users WHERE id=?').get(newId).temp_password, null);

  // new period: the new student gets a task for their class
  const p2 = (await act(hr, 'createPeriod', { name: 'Accounts period', deadline: '2030-02-01' })).data.result.id;
  await act(hr, 'generateTasks', { periodId: p2 });
  assert.ok(sql.prepare('SELECT count(*) n FROM tasks WHERE period_id=? AND evaluator_id=?').get(p2, newId).n > 0, 'new student gets tasks');

  // edit
  assert.equal((await tryLogin('new.student@s.ubaguio.edu', 'MyOwnPass2026')).status, 200, 'new account signs in with UB email');
  assert.equal((await act(hr, 'updateUser', { userId: newId, name: 'Renamed Student', username: 'new.student', email: 'new.student@s.ubaguio.edu', role: 'ST', position: 'student', dept: 'A', sectionIds: [] })).status, 200);
  assert.equal(sql.prepare('SELECT name FROM users WHERE id=?').get(newId).name, 'Renamed Student');
  assert.equal(sql.prepare('SELECT count(*) n FROM section_students WHERE student_id=?').get(newId).n, 0, 'removed from class');
  assert.equal((await act(hr, 'updateUser', { userId: 'hr', name: 'HR', username: 'hr', email: 'hr@ubaguio.edu', role: 'DIR', position: 'director' })).status, 400, 'HR cannot drop own HR role');
  assert.equal((await act(hr, 'updateUser', { userId: 'fac_a1', name: 'F', username: 'fac_a1', email: 'fac_a1@ubaguio.edu', role: 'NTP', position: 'staff', dept: 'A' })).status, 409, 'teacher of a class stays faculty');

  // reset password: signed out, temporary password works and must be changed
  const ns2 = await login('new.student', 'MyOwnPass2026');
  const rp = await act(hr, 'resetPassword', { userId: newId });
  assert.equal(rp.status, 200);
  assert.equal((await call('/api/auth/me', { cookie: ns2 })).status, 401, 'reset signs the user out');
  assert.equal((await tryLogin('new.student', 'MyOwnPass2026')).status, 401);
  assert.equal((await tryLogin('new.student', rp.data.result.tempPassword)).data.user.mustChangePassword, true);
  assert.equal((await act(hr, 'resetPassword', { userId: 'hr' })).status, 400, 'not for own account');

  // deactivate / reactivate
  const fa2 = await login('fac_a2');
  assert.equal((await act(hr, 'setUserActive', { userId: 'hr', active: false })).status, 400, 'cannot deactivate yourself');
  assert.equal((await act(hr, 'setUserActive', { userId: 'fac_a2', active: false })).status, 200);
  assert.equal((await call('/api/data', { cookie: fa2 })).status, 401, 'deactivated user signed out');
  assert.equal((await tryLogin('fac_a2', 'demo1234')).status, 403, 'deactivated user cannot sign in');
  const p3 = (await act(hr, 'createPeriod', { name: 'Inactive period', deadline: '2030-03-01' })).data.result.id;
  await act(hr, 'generateTasks', { periodId: p3 });
  assert.equal(sql.prepare('SELECT count(*) n FROM tasks WHERE period_id=? AND (target_id=? OR evaluator_id=?)').get(p3, 'fac_a2', 'fac_a2').n, 0, 'no new tasks for deactivated');
  assert.equal((await act(hr, 'setUserActive', { userId: 'fac_a2', active: true })).status, 200);
  assert.equal((await tryLogin('fac_a2', 'demo1234')).status, 200);

  // any user can change their own password
  const deanB = await login('dean_b');
  assert.equal((await act(deanB, 'changePassword', { currentPassword: 'demo1234', newPassword: 'DeanB2026x' })).status, 200);
  assert.equal((await tryLogin('dean_b', 'DeanB2026x')).status, 200);

  /* ---------- request safety ---------- */
  assert.equal((await call('/api/actions/createPeriod', { body: { name: 'x', deadline: '2030-01-01' }, cookie: hr, contentType: 'text/plain' })).status, 415, 'non-JSON posts rejected');

  /* ---------- reset & logout ---------- */
  assert.equal((await act(hr, 'resetData')).status, 200);
  assert.equal(sql.prepare('SELECT count(*) n FROM periods WHERE id=?').get(pid).n, 0, 'reset removed test period');
  assert.equal(sql.prepare('SELECT count(*) n FROM users WHERE id=?').get(newId).n, 0, 'reset removed created account');
  assert.equal((await tryLogin('dean_b', 'demo1234')).status, 200, 'reset restored demo password');
  assert.equal((await call('/api/auth/me', { cookie: hr })).status, 200, 'still signed in after reset');

  /* ---------- start from scratch: only HR accounts, forms and weights stay ---------- */
  assert.equal((await act(await login('dean_a'), 'startFromScratch')).status, 403, 'only HR can wipe the data');
  const wiped = await act(hr, 'startFromScratch');
  assert.equal(wiped.status, 200);
  const n = (t) => sql.prepare(`SELECT count(*) n FROM ${t}`).get().n;
  assert.equal(sql.prepare("SELECT count(*) n FROM users WHERE role <> 'HR'").get().n, 0, 'only HR accounts left');
  assert.ok(n('users') >= 1);
  assert.equal(n('departments'), 12, 'departments go back to the 12 UB departments');
  assert.equal((await act(hr, 'addUbDepartments')).data.result.added, 0, 'nothing missing');
  for (const t of ['sections', 'periods', 'tasks', 'responses', 'notifications', 'past_results', 'result_requests']) assert.equal(n(t), 0, `${t} emptied`);
  assert.ok(n('instruments') > 0 && n('criteria') > 0 && n('group_weights') > 0, 'forms, criteria and weights kept');
  assert.equal((await tryLogin('ghost', 'demo1234')).status, 401);
  assert.equal((await call('/api/data', { cookie: hr })).status, 200, 'HR still signed in and can load the empty system');
  const nd = await act(hr, 'addDepartment', { name: 'School of Nursing', kind: 'college' });
  assert.equal(nd.status, 200);
  assert.equal((await act(hr, 'addDepartment', { name: 'school of nursing' })).status, 409, 'no duplicate department names');
  assert.equal((await act(hr, 'createUser', { name: 'New Teacher', username: 'newteach', email: 'newteach@ubaguio.edu', role: 'TP', position: 'faculty', dept: nd.data.result.id })).status, 200);
  assert.equal((await act(hr, 'deleteDepartment', { deptId: nd.data.result.id })).status, 409, 'department with people kept');
  assert.equal((await act(hr, 'updateDepartment', { deptId: nd.data.result.id, name: 'College of Nursing', kind: 'college' })).status, 200);

  assert.equal((await call('/api/auth/logout', { body: {}, cookie: hr })).status, 200);
  assert.equal((await call('/api/data', { cookie: hr })).status, 401);

  console.log('api tests passed');
} finally {
  server.close();
  sql.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
