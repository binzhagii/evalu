// Every change the app can make. Each action says who may run it and checks its input.
// run(db, args, user) receives a COPY of the data; the API saves it only if run() succeeds.
import { randomInt } from 'node:crypto';
import {
  GROUPS, TARGET_TYPES, STAGES, ROLES, POSITIONS, needsDept, uid, userById, periodById, targetType, evaluatorGroup, instrumentFor,
  generateTasks, runThresholdCheck, sendReminders,
} from '../src/lib/logic.js';
import { HttpError } from './http.js';
import { encryptText, hashPassword, verifyPassword } from './secrets.js';
import { deleteUserSessions } from './db.js';
import { seedDatabase } from './seed.js';

const HR = ['HR'];
const ANYONE = null;

// ---------- input checks ----------
const fail = (msg, status = 400) => { throw new HttpError(status, msg); };
function text(v, label, max = 200) {
  if (typeof v !== 'string' || !v.trim()) fail(`${label} is required.`);
  if (v.trim().length > max) fail(`${label} is too long (max ${max} characters).`);
  return v.trim();
}
function date(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) fail('Enter a valid date.');
  return v;
}
function number(v, label, min, max) {
  const n = Number(v);
  if (v === '' || v == null || !Number.isFinite(n) || n < min || n > max) fail(`${label} must be a number from ${min} to ${max}.`);
  return n;
}
const find = (list, id, label) => list.find((x) => x.id === id) || fail(`${label} not found.`, 404);
const period = (db, id) => find(db.periods, id, 'Evaluation period');
const instrument = (db, id) => find(db.instruments, id, 'Form');

/** Keep only answers for this form's items, each a whole number 1–5. */
function cleanAnswers(answers, ins) {
  const out = {};
  if (answers && typeof answers === 'object') {
    for (const it of ins.items) {
      const v = answers[it.criterionId];
      if (v == null) continue;
      if (!Number.isInteger(v) || v < 1 || v > 5) fail('Each answer must be a rating from 1 to 5.');
      out[it.criterionId] = v;
    }
  }
  return out;
}
function cleanComment(comment, task) {
  if (comment == null || comment === '') return '';
  if (typeof comment !== 'string') fail('Invalid comment.');
  if (comment.length > 2000) fail('Comment is too long (max 2000 characters).');
  if (task.group !== 'DEAN' && task.group !== 'CHAIR') return ''; // only deans/chairs may comment
  return comment.trim();
}
// ---------- accounts ----------
const USERNAME = /^[a-z0-9._-]{3,32}$/;
function accountFields(db, { name, username, role, position, dept }, editingId = null) {
  const u = { name: text(name, 'Full name', 100) };
  u.username = typeof username === 'string' ? username.trim().toLowerCase() : '';
  if (!USERNAME.test(u.username)) fail('Username must be 3–32 characters: lowercase letters, numbers, dots, dashes or underscores.');
  if (db.users.some((x) => x.id !== editingId && x.username.toLowerCase() === u.username)) fail('That username is already taken.', 409);
  if (!Object.hasOwn(ROLES, role)) fail('Choose a role.');
  if (!Object.hasOwn(POSITIONS[role], position)) fail('Choose a position for this role.');
  u.role = role; u.position = position;
  u.dept = needsDept(role) ? find(db.departments, dept, 'Department').id : null;
  return u;
}
/** Put a student in exactly these class sections (only sections of their department). */
function enroll(db, user, sectionIds) {
  const want = new Set(user.role === 'ST' && Array.isArray(sectionIds) ? sectionIds : []);
  for (const id of want) if (find(db.sections, id, 'Class section').dept !== user.dept) fail('A student can only join classes in their own department.');
  for (const s of db.sections) {
    const has = s.studentIds.includes(user.id);
    if (want.has(s.id) && !has) s.studentIds.push(user.id);
    if (!want.has(s.id) && has) s.studentIds = s.studentIds.filter((x) => x !== user.id);
  }
}
/** A readable temporary password (no 0/O or 1/l/I to mix up). */
function tempPassword() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => abc[randomInt(abc.length)]).join('');
}
function checkNewPassword(pw, u) {
  if (typeof pw !== 'string' || pw.length < 8) fail('Your new password must be at least 8 characters.');
  if (pw.length > 200) fail('Your new password is too long.');
  if (pw.toLowerCase().includes(u.username.toLowerCase())) fail('Your new password must not contain your username.');
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) fail('Use at least one letter and one number.');
  return pw;
}
const account = (db, id) => find(db.users, id, 'Account');

/** The signed-in user's own task, still open for answering. */
function myOpenTask(db, taskId, user) {
  const t = find(db.tasks, taskId, 'Evaluation task');
  if (t.evaluatorId !== user.id) fail('This evaluation is not assigned to you.', 403);
  if (t.response) fail('This evaluation was already submitted.', 409);
  if (periodById(db, t.periodId)?.status !== 'open') fail('This evaluation period is closed.', 409);
  const ins = instrumentFor(db, targetType(db, userById(db, t.targetId)), t.group) || fail('The form for this evaluation no longer exists. Contact HR.', 409);
  return { t, ins };
}

export const actions = {
  /* ---------- everyone: evaluations & notifications ---------- */
  saveDraft: {
    roles: ANYONE,
    run(db, { taskId, answers, comment }, user) {
      const { t, ins } = myOpenTask(db, taskId, user);
      t.draft = { answers: cleanAnswers(answers, ins), comment: cleanComment(comment, t) };
    },
  },
  submitEvaluation: {
    roles: ANYONE,
    run(db, { taskId, answers, comment }, user) {
      const { t, ins } = myOpenTask(db, taskId, user);
      const clean = cleanAnswers(answers, ins);
      const missing = ins.items.filter((it) => clean[it.criterionId] == null).map((it) => it.criterionId);
      if (missing.length) fail(`${missing.length} item(s) are not answered yet.`);
      const c = cleanComment(comment, t);
      t.response = {
        answers: clean,
        weights: Object.fromEntries(ins.items.map((it) => [it.criterionId, it.weight])), // weights fixed at submission
        comment: c ? encryptText(c) : null,
        submittedAt: new Date().toISOString(),
      };
      t.draft = null;
    },
  },
  markNotificationsRead: {
    roles: ANYONE,
    run(db, _args, user) {
      for (const n of db.notifications) if (n.userId === user.id) n.read = true;
    },
  },

  changePassword: {
    roles: ANYONE,
    async run(db, { currentPassword, newPassword }, user, ctx) {
      const u = account(db, user.id);
      if (typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, u.passwordHash))) fail('Your current password is incorrect.');
      checkNewPassword(newPassword, u);
      if (newPassword === currentPassword) fail('Choose a password different from your current one.');
      u.passwordHash = await hashPassword(newPassword);
      u.mustChangePassword = false;
      ctx.afterSave.push(() => deleteUserSessions(u.id, ctx.sessionHash)); // sign out other devices
    },
  },

  /* ---------- HR: accounts ---------- */
  createUser: {
    roles: HR,
    async run(db, args) {
      const password = tempPassword();
      const u = { id: uid('u'), ...accountFields(db, args), passwordHash: await hashPassword(password), active: true, mustChangePassword: true };
      db.users.push(u);
      enroll(db, u, args.sectionIds);
      return { id: u.id, username: u.username, tempPassword: password };
    },
  },
  updateUser: {
    roles: HR,
    run(db, { userId, sectionIds, ...fields }, user) {
      const u = account(db, userId);
      const next = accountFields(db, fields, u.id);
      if (u.id === user.id && next.role !== 'HR') fail('You cannot remove your own HR role.');
      if (db.sections.some((s) => s.facultyId === u.id) && !(next.role === 'TP' && next.position === 'faculty')) {
        fail('This person still teaches a class section, so they must stay Teaching Personnel / Faculty.', 409);
      }
      Object.assign(u, next);
      enroll(db, u, sectionIds ?? db.sections.filter((s) => s.studentIds.includes(u.id)).map((s) => s.id));
    },
  },
  setUserActive: {
    roles: HR,
    run(db, { userId, active }, user, ctx) {
      const u = account(db, userId);
      if (u.id === user.id) fail('You cannot deactivate your own account.');
      u.active = active === true;
      if (!u.active) ctx.afterSave.push(() => deleteUserSessions(u.id)); // signed out at once
    },
  },
  resetPassword: {
    roles: HR,
    async run(db, { userId }, user, ctx) {
      const u = account(db, userId);
      if (u.id === user.id) fail('Use "My account" to change your own password.');
      const password = tempPassword();
      u.passwordHash = await hashPassword(password);
      u.mustChangePassword = true;
      ctx.afterSave.push(() => deleteUserSessions(u.id));
      return { username: u.username, tempPassword: password };
    },
  },

  /* ---------- HR: evaluation periods & release ---------- */
  createPeriod: {
    roles: HR,
    run(db, { name, deadline }) {
      const p = { id: uid('p'), name: text(name, 'Period name', 120), deadline: date(deadline), status: 'open', releaseStage: 'hr', thresholdChecked: false };
      db.periods.push(p);
      return { id: p.id };
    },
  },
  setPeriodDeadline: {
    roles: HR,
    run(db, { periodId, deadline }) { period(db, periodId).deadline = date(deadline); },
  },
  closePeriod: {
    roles: HR,
    run(db, { periodId }) {
      const p = period(db, periodId);
      if (p.status !== 'open') fail('This period is already closed.', 409);
      const flagged = runThresholdCheck(db, p.id);
      p.status = 'closed';
      return { flagged };
    },
  },
  checkThreshold: {
    roles: HR,
    run(db, { periodId }) {
      const p = period(db, periodId);
      const flagged = runThresholdCheck(db, p.id);
      p.thresholdChecked = false; // the period stays open, so the final check still runs on close
      return { flagged };
    },
  },
  reopenPeriod: {
    roles: HR,
    run(db, { periodId }) {
      const p = period(db, periodId);
      if (p.status !== 'closed') fail('This period is already open.', 409);
      p.status = 'open';
    },
  },
  releaseNext: {
    roles: HR,
    run(db, { periodId }) {
      const p = period(db, periodId);
      if (p.status !== 'closed') fail('Close the period before releasing results.', 409);
      const next = STAGES[STAGES.indexOf(p.releaseStage) + 1] || fail('Results are already fully released.', 409);
      p.releaseStage = next;
    },
  },
  withdrawRelease: {
    roles: HR,
    run(db, { periodId }) {
      const p = period(db, periodId);
      const i = STAGES.indexOf(p.releaseStage);
      if (i <= 0) fail('Results are not released yet.', 409);
      p.releaseStage = STAGES[i - 1];
    },
  },

  /* ---------- HR: assignments ---------- */
  generateTasks: {
    roles: HR,
    run(db, { periodId }) { return generateTasks(db, period(db, periodId).id); },
  },
  sendReminders: {
    roles: HR,
    run(db, { periodId }) { return { sent: sendReminders(db, period(db, periodId).id) }; },
  },
  addAssignment: {
    roles: HR,
    run(db, { periodId, evaluatorId, targetId }) {
      const p = period(db, periodId);
      const ev = userById(db, evaluatorId), tg = userById(db, targetId);
      if (!ev || !tg) fail('Choose an evaluator and a person to evaluate.');
      if (ev.id === tg.id) fail('A person cannot evaluate themselves.');
      const group = evaluatorGroup(ev), tt = targetType(db, tg);
      if (!group || group === 'ST') fail('Students are assigned through their class sections.');
      if (!tt) fail(`${tg.name} is not evaluated in this system.`);
      if (!(group in (db.rules[tt] || {}))) fail(`${GROUPS[group]} is not an evaluator group for ${TARGET_TYPES[tt]}.`);
      if (!instrumentFor(db, tt, group)) fail('No form exists for this pairing. Create it under Forms first.');
      if (db.tasks.some((t) => t.periodId === p.id && t.evaluatorId === ev.id && t.targetId === tg.id && t.group === group && !t.sectionId)) fail('That assignment already exists.', 409);
      db.tasks.push({ id: uid('t'), periodId: p.id, evaluatorId: ev.id, targetId: tg.id, group, sectionId: null, draft: null, response: null });
    },
  },
  removeTask: {
    roles: HR,
    run(db, { taskId }) {
      const t = find(db.tasks, taskId, 'Evaluation task');
      if (t.response) fail('A submitted evaluation cannot be removed.', 409);
      db.tasks = db.tasks.filter((x) => x.id !== t.id);
    },
  },

  /* ---------- HR: criteria & forms ---------- */
  addCriterion: {
    roles: HR,
    run(db, { text: t }) { const c = { id: uid('c'), text: text(t, 'Criterion', 300) }; db.criteria.push(c); return { id: c.id }; },
  },
  renameCriterion: {
    roles: HR,
    run(db, { criterionId, text: t }) { find(db.criteria, criterionId, 'Criterion').text = text(t, 'Criterion', 300); },
  },
  deleteCriterion: {
    roles: HR,
    run(db, { criterionId }) {
      const c = find(db.criteria, criterionId, 'Criterion');
      if (db.instruments.some((i) => i.items.some((it) => it.criterionId === c.id))) fail('Remove this criterion from all forms first.', 409);
      db.criteria = db.criteria.filter((x) => x.id !== c.id);
    },
  },
  createForm: {
    roles: HR,
    run(db, { targetType: tt, group }) {
      if (!(tt in db.rules) || !(group in db.rules[tt])) fail('Choose a valid evaluated role and evaluator group.');
      if (instrumentFor(db, tt, group)) fail('A form already exists for this pairing. Edit it instead.', 409);
      const i = { id: uid('i'), name: 'custom', targetType: tt, group, items: [] };
      db.instruments.push(i);
      return { id: i.id };
    },
  },
  addFormItem: {
    roles: HR,
    run(db, { instrumentId, criterionId }) {
      const i = instrument(db, instrumentId);
      find(db.criteria, criterionId, 'Criterion');
      if (i.items.some((it) => it.criterionId === criterionId)) fail('That criterion is already on this form.', 409);
      i.items.push({ criterionId, weight: 1 });
    },
  },
  removeFormItem: {
    roles: HR,
    run(db, { instrumentId, criterionId }) {
      const i = instrument(db, instrumentId);
      i.items = i.items.filter((it) => it.criterionId !== criterionId);
    },
  },
  setFormItemWeight: {
    roles: HR,
    run(db, { instrumentId, criterionId, weight }) {
      const it = instrument(db, instrumentId).items.find((x) => x.criterionId === criterionId) || fail('That criterion is not on this form.', 404);
      it.weight = number(weight, 'Weight', 0, 100);
    },
  },

  /* ---------- HR: group weights ---------- */
  setGroupWeight: {
    roles: HR,
    run(db, { targetType: tt, group, weight }) {
      if (!(tt in db.rules) || !(group in db.rules[tt])) fail('Unknown evaluated role or evaluator group.');
      db.rules[tt][group] = weight === null || weight === '' ? null : number(weight, 'Weight', 0, 100);
    },
  },

  /* ---------- HR: demo data ---------- */
  resetData: {
    roles: HR,
    replacesDb: true, // writes the database itself instead of returning a changed copy
    async run() { await seedDatabase(); },
  },
};
