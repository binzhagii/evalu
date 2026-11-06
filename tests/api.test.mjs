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

  const fac = await login('fac_a1');
  const fv = (await call('/api/data', { cookie: fac })).data;
  for (const t of fv.tasks.filter((x) => x.evaluatorId !== 'fac_a1')) {
    assert.equal(t.evaluatorId, null, 'faculty never sees evaluator identities');
    assert.ok(!t.response || t.response.comment == null, 'faculty never sees comments');
    const p = fv.periods.find((x) => x.id === t.periodId);
    if (p.releaseStage !== 'faculty') assert.ok(!t.response || t.response.redacted, 'unreleased: counts only, no answers');
  }

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
  const sub = await act(student, 'submitEvaluation', { taskId: task.id, answers: all5, comment: 'students cannot comment' });
  assert.equal(sub.status, 200);
  assert.equal(sql.prepare('SELECT count(*) n FROM answers WHERE task_id=?').get(task.id).n, items.length);
  assert.equal(sql.prepare('SELECT comment FROM responses WHERE task_id=?').get(task.id).comment, null, 'student comment dropped');
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
  const c = await act(hr, 'addCriterion', { text: 'New criterion' });
  assert.equal((await act(hr, 'renameCriterion', { criterionId: c.data.result.id, text: 'Renamed' })).status, 200);
  assert.equal(sql.prepare('SELECT text FROM criteria WHERE id=?').get(c.data.result.id).text, 'Renamed');
  assert.equal((await act(hr, 'deleteCriterion', { criterionId: 'c1' })).status, 409, 'criterion in use cannot be deleted');

  /* ---------- accounts ---------- */
  const tryLogin = (username, password) => call('/api/auth/login', { body: { username, password } });
  const secA = hv.sections.find((x) => x.dept === 'A').id;
  assert.equal((await act(student, 'createUser', { name: 'X', username: 'xxx', role: 'HR', position: 'hr' })).status, 403, 'only HR creates accounts');
  assert.equal((await act(hr, 'createUser', { name: 'Dup', username: 'st_a01', role: 'ST', position: 'student', dept: 'A' })).status, 409, 'username taken');
  assert.equal((await act(hr, 'createUser', { name: 'Bad', username: 'a b', role: 'ST', position: 'student', dept: 'A' })).status, 400);
  assert.equal((await act(hr, 'createUser', { name: 'Bad', username: 'bad1', role: 'ST', position: 'dean', dept: 'A' })).status, 400, 'position must fit role');
  const made = await act(hr, 'createUser', { name: 'New Student', username: 'New.Student', role: 'ST', position: 'student', dept: 'A', sectionIds: [secA] });
  assert.equal(made.status, 200, made.data.error);
  const { id: newId, tempPassword } = made.data.result;
  assert.equal(made.data.result.username, 'new.student');
  assert.ok(tempPassword.length >= 10);
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
  assert.equal((await act(ns, 'changePassword', { currentPassword: 'wrong', newPassword: 'goodpass123' })).status, 400);
  assert.equal((await act(ns, 'changePassword', { currentPassword: tempPassword, newPassword: 'short1' })).status, 400, 'too short');
  assert.equal((await act(ns, 'changePassword', { currentPassword: tempPassword, newPassword: 'onlyletters' })).status, 400, 'needs a number');
  assert.equal((await act(ns, 'changePassword', { currentPassword: tempPassword, newPassword: 'new.student99' })).status, 400, 'no username');
  assert.equal((await act(ns, 'changePassword', { currentPassword: tempPassword, newPassword: 'MyOwnPass2026' })).status, 200);
  assert.equal((await call('/api/data', { cookie: ns })).status, 200, 'same session keeps working');
  assert.equal((await tryLogin('new.student', tempPassword)).status, 401, 'temporary password no longer works');
  assert.equal((await tryLogin('new.student', 'MyOwnPass2026')).data.user.mustChangePassword, false);

  // new period: the new student gets a task for their class
  const p2 = (await act(hr, 'createPeriod', { name: 'Accounts period', deadline: '2030-02-01' })).data.result.id;
  await act(hr, 'generateTasks', { periodId: p2 });
  assert.ok(sql.prepare('SELECT count(*) n FROM tasks WHERE period_id=? AND evaluator_id=?').get(p2, newId).n > 0, 'new student gets tasks');

  // edit
  assert.equal((await act(hr, 'updateUser', { userId: newId, name: 'Renamed Student', username: 'new.student', role: 'ST', position: 'student', dept: 'A', sectionIds: [] })).status, 200);
  assert.equal(sql.prepare('SELECT name FROM users WHERE id=?').get(newId).name, 'Renamed Student');
  assert.equal(sql.prepare('SELECT count(*) n FROM section_students WHERE student_id=?').get(newId).n, 0, 'removed from class');
  assert.equal((await act(hr, 'updateUser', { userId: 'hr', name: 'HR', username: 'hr', role: 'DIR', position: 'director' })).status, 400, 'HR cannot drop own HR role');
  assert.equal((await act(hr, 'updateUser', { userId: 'fac_a1', name: 'F', username: 'fac_a1', role: 'NTP', position: 'staff', dept: 'A' })).status, 409, 'teacher of a class stays faculty');

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
  assert.equal((await call('/api/auth/logout', { body: {}, cookie: hr })).status, 200);
  assert.equal((await call('/api/data', { cookie: hr })).status, 401);

  console.log('api tests passed');
} finally {
  server.close();
  sql.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
