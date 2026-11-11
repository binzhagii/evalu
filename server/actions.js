// Every change the app can make. Each action says who may run it and checks its input.
// run(db, args, user) receives a COPY of the data; the API saves it only if run() succeeds.
// FR numbers refer to Table 8 of the manuscript.
import { randomInt } from 'node:crypto';
import {
  GROUPS, TARGET_TYPES, STAGES, ROLES, POSITIONS, needsDept, uid, userById, periodById, targetType, evaluatorGroups,
  instrumentFor, formForTask, formUsed, effectiveWeights, generateTasks, runThresholdCheck, participationAlerts, sendReminders,
  isInstitutionalEmail, INSTITUTION_DOMAIN, notify, directors, pendingApprovals, resultHeads, hrUsers, isEvaluatee, isTeacher, isNursingDept, stageAtLeast, UB_DEPARTMENTS, missingUbDepartments, MAX_RATING, CLASS_TYPES,
} from '../src/lib/logic.js';
import { HttpError } from './http.js';
import { encryptText, decryptText, hashPassword, verifyPassword } from './secrets.js';
import { deleteUserSessions, addAudit } from './db.js';
import { seedDatabase } from './seed.js';
import { installUbForms, UB_FORM_MARK } from '../src/lib/ubInstall.js';

const HR = ['HR'];
const DIR = ['DIR'];
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
const clone = (x) => JSON.parse(JSON.stringify(x));

/** Keep only answers for this form's items, each a whole number 1–4 (UB's 4-point scale). */
function cleanAnswers(answers, ins) {
  const out = {};
  if (answers && typeof answers === 'object') {
    for (const it of ins.items) {
      const v = answers[it.criterionId];
      if (v == null) continue;
      if (!Number.isInteger(v) || v < 1 || v > MAX_RATING) fail(`Each answer must be a rating from 1 to ${MAX_RATING}.`);
      out[it.criterionId] = v;
    }
  }
  return out;
}
/** FR14: every evaluator may add an optional comment; it is stored encrypted and shown without their name. */
function cleanComment(comment) {
  if (comment == null || comment === '') return '';
  if (typeof comment !== 'string') fail('Invalid comment.');
  if (comment.length > 2000) fail('Comment is too long (max 2000 characters).');
  return comment.trim();
}

// ---------- accounts ----------
const USERNAME = /^[a-z0-9._-]{3,32}$/;
function accountFields(db, { name, username, email, role, position, dept }, editingId = null) {
  const u = { name: text(name, 'Full name', 100) };
  u.username = typeof username === 'string' ? username.trim().toLowerCase() : '';
  if (!USERNAME.test(u.username)) fail('Username must be 3–32 characters: lowercase letters, numbers, dots, dashes or underscores.');
  if (db.users.some((x) => x.id !== editingId && x.username.toLowerCase() === u.username)) fail('That username is already taken.', 409);
  u.email = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!isInstitutionalEmail(u.email)) fail(`Enter the person's official UB email (ending in @${INSTITUTION_DOMAIN}). Other email addresses are not accepted.`);
  if (db.users.some((x) => x.id !== editingId && x.email?.toLowerCase() === u.email)) fail('That email already belongs to another account.', 409);
  if (!Object.hasOwn(ROLES, role)) fail('Choose a role.');
  if (!Object.hasOwn(POSITIONS[role], position)) fail('Choose a position for this role.');
  u.role = role; u.position = position;
  u.dept = needsDept(role) ? find(db.departments, dept, 'Department').id : null;
  if (position === 'ci' && !isNursingDept(db.departments.find((d) => d.id === u.dept))) fail('Clinical Instructors belong to the School of Nursing. Choose the School of Nursing as the department.');
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
/** A user by username or email (for CSV imports). */
const byLogin = (db, v) => {
  const k = String(v || '').trim().toLowerCase();
  return db.users.find((u) => u.username.toLowerCase() === k || u.email?.toLowerCase() === k);
};

/** The signed-in user's own task, still open for answering. */
function myOpenTask(db, taskId, user) {
  const t = find(db.tasks, taskId, 'Evaluation task');
  if (t.evaluatorId !== user.id) fail('This evaluation is not assigned to you.', 403);
  if (t.response) fail('This evaluation was already submitted.', 409);
  if (periodById(db, t.periodId)?.status !== 'open') fail('This evaluation period is closed.', 409);
  // Strict cut-off: once the deadline (end of that day) has passed, no more answers are accepted, even if HR has not closed the period yet. HR can extend the deadline in Periods & release.
  const per = periodById(db, t.periodId);
  if (per?.deadline && new Date(per.deadline + 'T23:59:59') < new Date()) fail('The deadline for this evaluation has passed, so it can no longer be submitted. Contact HR if you need more time.', 409);
  const ins = formForTask(db, t) || fail('The form for this evaluation no longer exists. Contact HR.', 409);
  return { t, ins };
}

// ---------- forms (FR4: a used form is never changed; a new version is made) ----------
function editableForm(db, id) {
  const i = instrument(db, id);
  if (i.active === false) fail('This is an old version of the form. Edit the current version instead.', 409);
  if (formUsed(db, i)) fail('This form already has submitted evaluations, so it can\'t be changed. Click "Create new version" to make an editable copy; past results keep the old version.', 409);
  return i;
}
const usedCriteria = (db) => new Set(db.tasks.filter((t) => t.response).flatMap((t) => Object.keys(t.response.answers)));

// ---------- class lists (FR6) ----------
function sectionFields(db, { code, subject, facultyId }, editingId = null) {
  const s = { code: text(code, 'Section code', 40), subject: text(subject, 'Subject', 120) };
  const f = userById(db, facultyId);
  if (!isTeacher(f)) fail('Choose the faculty member or Clinical Instructor who teaches this class.');
  if (db.sections.some((x) => x.id !== editingId && x.code.toLowerCase() === s.code.toLowerCase())) fail('A class section with this code already exists.', 409);
  return { ...s, facultyId: f.id, dept: f.dept };
}

// ---------- notifications for the release steps ----------
function notifyRelease(db, p, stage) {
  if (stage === 'dir') {
    for (const d of directors(db)) notify(db, { key: `rel|${p.id}|dir|${d.id}|${Date.now()}`, userId: d.id, kind: 'release', text: `Results for ${p.name} are ready for your review. Please review them under Reports and approve them for release to faculty.` });
  } else if (stage === 'faculty') {
    const people = new Set(db.tasks.filter((t) => t.periodId === p.id).map((t) => t.targetId));
    for (const id of people) {
      const u = userById(db, id);
      if (u && u.active !== false && isEvaluatee(u)) notify(db, { key: `rel|${p.id}|fac|${id}`, userId: id, kind: 'release', text: `Your evaluation results for ${p.name} are now available under "My results".` });
    }
    for (const h of db.users.filter((u) => u.active !== false && (u.position === 'dean' || u.position === 'principal'))) {
      notify(db, { key: `rel|${p.id}|head|${h.id}`, userId: h.id, kind: 'release', text: `Department results for ${p.name} are now available under "Department results".` });
    }
  }
}

export const actions = {
  /* ---------- everyone: evaluations & notifications ---------- */
  saveDraft: {
    roles: ANYONE, audit: false,
    run(db, { taskId, answers, comment }, user) {
      const { t, ins } = myOpenTask(db, taskId, user);
      t.draft = { answers: cleanAnswers(answers, ins), comment: cleanComment(comment) };
    },
  },
  submitEvaluation: {
    roles: ANYONE,
    run(db, { taskId, answers, comment }, user) {
      const { t, ins } = myOpenTask(db, taskId, user);
      const clean = cleanAnswers(answers, ins);
      const missing = ins.items.filter((it) => clean[it.criterionId] == null).map((it) => it.criterionId);
      if (missing.length) fail(`${missing.length} item(s) are not answered yet.`);
      const c = cleanComment(comment);
      t.response = {
        answers: clean,
        weights: effectiveWeights(ins), // fixed at submission (category and item weights)
        instrumentId: ins.id,           // the form version answered
        comment: c ? encryptText(c) : null,
        submittedAt: new Date().toISOString(),
      };
      t.draft = null;
    },
  },
  markNotificationsRead: {
    roles: ANYONE, audit: false,
    run(db, _args, user) {
      for (const n of db.notifications) if (n.userId === user.id) n.read = true;
    },
  },
  /** FR20: the pages report when someone opens a result, so it can be logged. Changes nothing. */
  logView: {
    roles: ANYONE, readOnly: true,
    run(db, { periodId, targetId, what }, user) {
      const p = periodById(db, periodId);
      const t = targetId ? userById(db, targetId) : null;
      const label = { individual: 'individual result', own: 'own result', department: 'department summary', report: 'report' }[what] || 'result';
      addAudit(user, 'view', `Viewed ${label}${t ? ` of ${t.name}` : ''}${p ? ` (${p.name})` : ''}`);
    },
  },

  changePassword: {
    roles: ANYONE,
    async run(db, { currentPassword, newPassword }, user, ctx) {
      const u = account(db, user.id);
      // First sign-in with a temporary password: they just typed it to sign in, so it isn't asked again.
      // Any other time (My account) the current password is checked.
      if (!u.mustChangePassword && (typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, u.passwordHash)))) fail('Your current password is incorrect.');
      checkNewPassword(newPassword, u);
      if (await verifyPassword(newPassword, u.passwordHash)) fail(u.mustChangePassword ? 'Choose a new password, not the temporary one.' : 'Choose a password different from your current one.');
      u.passwordHash = await hashPassword(newPassword);
      u.mustChangePassword = false;
      u.tempPassword = null; // the temporary password is gone for good
      ctx.afterSave.push(() => deleteUserSessions(u.id, ctx.sessionHash)); // sign out other devices
    },
  },

  /* ---------- HR: accounts ---------- */
  createUser: {
    roles: HR,
    async run(db, args) {
      const password = tempPassword();
      const u = { id: uid('u'), ...accountFields(db, args), passwordHash: await hashPassword(password), active: true, mustChangePassword: true, tempPassword: encryptText(password) };
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
      if (db.sections.some((s) => s.facultyId === u.id) && !isTeacher(next)) {
        fail('This person still teaches a class section, so they must stay Faculty or Clinical Instructor.', 409);
      }
      Object.assign(u, next);
      for (const s of db.sections) if (s.facultyId === u.id) s.dept = u.dept;
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
      u.tempPassword = encryptText(password);
      ctx.afterSave.push(() => deleteUserSessions(u.id));
      return { username: u.username, tempPassword: password };
    },
  },
  /** HR looks up a temporary password again (e.g. after reloading the page). Kept only until the person sets their own; every look is logged. */
  showTempPassword: {
    roles: HR,
    readOnly: true,
    run(db, { userId }, user) {
      const u = account(db, userId);
      if (!u.tempPassword || !u.mustChangePassword) fail(`${u.name} has already chosen their own password. Use "Reset password" to give them a new temporary one.`, 409);
      addAudit(user, 'showTempPassword', `Viewed the temporary password of ${u.name}`);
      return { username: u.username, tempPassword: decryptText(u.tempPassword) };
    },
  },

  /* ---------- HR: class lists (FR6) ---------- */
  createSection: {
    roles: HR,
    run(db, args) {
      const s = { id: uid('sec'), ...sectionFields(db, args), studentIds: [] };
      db.sections.push(s);
      return { id: s.id };
    },
  },
  updateSection: {
    roles: HR,
    run(db, { sectionId, ...args }) {
      const s = find(db.sections, sectionId, 'Class section');
      const next = sectionFields(db, args, s.id);
      if (next.facultyId !== s.facultyId && db.tasks.some((t) => t.sectionId === s.id)) fail('This class already has evaluation tasks, so its teacher can\'t be changed. Create a new section instead.', 409);
      if (next.dept !== s.dept) s.studentIds = s.studentIds.filter((id) => userById(db, id)?.dept === next.dept);
      Object.assign(s, next);
    },
  },
  /** Lecture, laboratory or clinical: decides which UB tool the students (and the dean) answer. */
  setClassType: {
    roles: HR,
    run(db, { sectionId, classType }) {
      const s = find(db.sections, sectionId, 'Class section');
      const v = classType || '';
      if (!(v in CLASS_TYPES)) fail('Choose a type of class from the list.');
      if (v) s.classType = v; else delete s.classType;
    },
  },
  deleteSection: {
    roles: HR,
    run(db, { sectionId }) {
      const s = find(db.sections, sectionId, 'Class section');
      if (db.tasks.some((t) => t.sectionId === s.id)) fail('This class already has evaluation tasks and is kept for the records.', 409);
      db.sections = db.sections.filter((x) => x.id !== s.id);
    },
  },
  /**
   * Import a class list exported from the Registrar/ARC, for one department. One row per student, either
   *   section code, subject, teacher name, teacher email, student ID, student name, student UB email  (creates missing teachers and students)
   *   section code, subject, teacher email, student ID, student name, student UB email   (creates missing students)
   *   section code, subject, teacher email, student email or username                     (students must already exist)
   * New sections and new student accounts are created; students are enrolled. A new student's first
   * password is their student ID, and they must change it at the first sign-in. Problem rows are listed, not saved.
   */
  importClassList: {
    roles: HR,
    async run(db, { csv, dept }) {
      if (typeof csv !== 'string' || !csv.trim()) fail('Paste or choose the class list first.');
      const listDept = dept ? find(db.departments, dept, 'Department') : null; // where new teachers (and so their classes) go
      if (csv.length > 2000000) fail('The class list is too long. Import it in parts (for example one department at a time).');
      const errors = [];
      const fresh = []; // new student accounts, password hashed at the end
      const freshTeachers = []; // new teacher accounts
      let created = 0, enrolled = 0;
      const lines = csv.split(/\r?\n/);
      for (const [i, line] of lines.entries()) {
        let cells = line.split(/[,\t;]/).map((c) => c.trim().replace(/^"|"$/g, '').trim());
        if (!line.trim() || (i === 0 && /section/i.test(cells[0]))) continue; // blank or header row
        const n = i + 1;
        // 7 columns: the teacher's name comes before the teacher's email
        let tname = '';
        if (cells.length >= 7) { tname = cells[2]; cells = [cells[0], cells[1], ...cells.slice(3)]; }
        const full = cells.length >= 6;
        const [code, subject, fac] = cells;
        if (!code || !subject || !fac) { errors.push(`Row ${n}: needs section code, subject and teacher email.`); continue; }
        let f = byLogin(db, fac);
        if (!f && tname) {
          // a new teacher: a Faculty account in the department of this list
          const temail = fac.toLowerCase(), uname = temail.split('@')[0];
          if (!listDept) { errors.push(`Row ${n}: choose the department of this list so the teacher ${tname} can be created.`); continue; }
          if (!isInstitutionalEmail(temail)) { errors.push(`Row ${n}: "${fac}" is not an official UB email.`); continue; }
          if (!USERNAME.test(uname) || byLogin(db, uname)) { errors.push(`Row ${n}: can't make a username from "${fac}". Create this teacher under Accounts.`); continue; }
          f = { id: uid('u'), username: uname, email: temail, name: tname, role: 'TP', position: 'faculty', dept: listDept.id, passwordHash: null, active: true, mustChangePassword: true };
          db.users.push(f); freshTeachers.push(f);
        }
        if (!isTeacher(f)) { errors.push(`Row ${n}: "${fac}" is not a faculty or Clinical Instructor account. Add the teacher's name to the row (7 columns) or create the teacher under Accounts.`); continue; }
        let s = db.sections.find((x) => x.code.toLowerCase() === code.toLowerCase());
        if (!s) { s = { id: uid('sec'), code, subject, facultyId: f.id, dept: f.dept, studentIds: [] }; db.sections.push(s); created++; }
        else if (s.facultyId !== f.id) { errors.push(`Row ${n}: section ${code} belongs to another teacher.`); continue; }

        let st;
        if (full) {
          const [, , , sid, sname, semail] = cells;
          const id = String(sid || '').toLowerCase(), email = String(semail || '').toLowerCase();
          st = byLogin(db, email) || byLogin(db, id);
          if (!st) {
            // a new student: create the account from the row
            if (!USERNAME.test(id)) { errors.push(`Row ${n}: student ID "${sid}" must be 3–32 letters or numbers.`); continue; }
            if (!sname || sname.length > 100) { errors.push(`Row ${n}: needs the student's name.`); continue; }
            if (!isInstitutionalEmail(email)) { errors.push(`Row ${n}: "${semail}" is not an official UB email.`); continue; }
            st = { id: uid('u'), username: id, email, name: sname, role: 'ST', position: 'student', dept: s.dept, passwordHash: null, active: true, mustChangePassword: true };
            db.users.push(st); fresh.push(st);
          }
        } else {
          if (!cells[3]) continue; // a row that only lists the section
          st = byLogin(db, cells[3]);
          if (!st) { errors.push(`Row ${n}: "${cells[3]}" has no account. Add the student ID, name and UB email to the row so the account is created.`); continue; }
        }
        if (st.role !== 'ST') { errors.push(`Row ${n}: ${st.name} is not a student account.`); continue; }
        if (st.dept !== s.dept) { errors.push(`Row ${n}: ${st.name} is not in the same department as ${code}.`); continue; }
        if (!s.studentIds.includes(st.id)) { s.studentIds.push(st.id); enrolled++; }
      }
      // first password = the student ID / the teacher's username (they must change it at the first sign-in)
      const all = [...freshTeachers, ...fresh];
      for (let i = 0; i < all.length; i += 16) {
        await Promise.all(all.slice(i, i + 16).map(async (u) => { u.passwordHash = await hashPassword(u.username); u.tempPassword = encryptText(u.username); }));
      }
      return { created, enrolled, accounts: fresh.length, teachers: freshTeachers.length, errors: errors.slice(0, 50), errorCount: errors.length };
    },
  },

  /* ---------- HR: evaluation periods & release ---------- */
  createPeriod: {
    roles: HR,
    run(db, { name, deadline, depts }) {
      const list = Array.isArray(depts) ? [...new Set(depts)].map((d) => find(db.departments, d, 'Department').id) : [];
      const p = {
        id: uid('p'), name: text(name, 'Period name', 120), deadline: date(deadline), status: 'open', releaseStage: 'hr', thresholdChecked: false,
        rules: clone(db.rules),   // NFR8: the weights in force for this period
        depts: list.length ? list : null, // FR8: one department, several, or all
        approvals: [],
      };
      db.periods.push(p);
      return { id: p.id };
    },
  },
  setPeriodDeadline: {
    roles: HR,
    run(db, { periodId, deadline }) { const p = period(db, periodId); p.deadline = date(deadline); p.lastAuto = null; },
  },
  closePeriod: {
    roles: HR,
    run(db, { periodId }) {
      const p = period(db, periodId);
      if (p.status !== 'open') fail('This period is already closed.', 409);
      const flagged = runThresholdCheck(db, p.id); // FR11/FR12: exclude classes below half + 1, notify everyone concerned
      p.status = 'closed';
      p.rules ||= clone(db.rules);
      return { flagged };
    },
  },
  checkThreshold: {
    roles: HR,
    run(db, { periodId }) {
      const p = period(db, periodId);
      if (p.status !== 'open') fail('This period is closed. The final check already ran when it was closed.', 409);
      return { flagged: participationAlerts(db, p.id) };
    },
  },
  reopenPeriod: {
    roles: HR,
    run(db, { periodId }) {
      const p = period(db, periodId);
      if (p.status !== 'closed') fail('This period is already open.', 409);
      if (p.releaseStage !== 'hr') fail('Withdraw the released results first.', 409);
      p.status = 'open';
      p.thresholdChecked = false;
    },
  },
  releaseNext: {
    roles: HR,
    run(db, { periodId }) {
      const p = period(db, periodId);
      if (p.status !== 'closed') fail('Close the period before releasing results.', 409);
      const next = STAGES[STAGES.indexOf(p.releaseStage) + 1] || fail('Results are already fully released.', 409);
      if (next === 'faculty') {
        // FR17: every Director/VP must approve before faculty see anything
        const waiting = pendingApprovals(db, p);
        if (waiting.length) fail(`Waiting for approval from: ${waiting.map((u) => u.name).join(', ')}.`, 409);
      }
      p.releaseStage = next;
      notifyRelease(db, p, next);
      return { stage: next };
    },
  },
  withdrawRelease: {
    roles: HR,
    run(db, { periodId }) {
      const p = period(db, periodId);
      const i = STAGES.indexOf(p.releaseStage);
      if (i <= 0) fail('Results are not released yet.', 409);
      p.releaseStage = STAGES[i - 1];
      if (p.releaseStage === 'hr') p.approvals = []; // results must be reviewed again
    },
  },
  /** FR17: a Director/VP approves the results of a period for release to faculty. */
  approveRelease: {
    roles: DIR,
    run(db, { periodId }, user) {
      const p = period(db, periodId);
      if (p.releaseStage !== 'dir') fail('These results are not waiting for your approval.', 409);
      p.approvals ||= [];
      if (p.approvals.some((a) => a.userId === user.id)) fail('You already approved these results.', 409);
      p.approvals.push({ userId: user.id, at: new Date().toISOString() });
      const waiting = pendingApprovals(db, p);
      for (const h of hrUsers(db)) {
        notify(db, {
          key: `appr|${p.id}|${user.id}|${h.id}`, userId: h.id, kind: 'release',
          text: waiting.length
            ? `${user.name} approved the results for ${p.name}. Still waiting for: ${waiting.map((u) => u.name).join(', ')}.`
            : `${user.name} approved the results for ${p.name}. All Directors/VPs have approved: you can now release them to faculty.`,
        });
      }
      return { waiting: waiting.length };
    },
  },
  /** FR18: another office asks for a person's results; they are released to that person's dean only. */
  recordResultRequest: {
    roles: HR,
    run(db, { periodId, targetId, office }, user) {
      const p = period(db, periodId);
      if (!stageAtLeast(p, 'faculty')) fail('Results can be shared only after they are released to faculty.', 409);
      const t = account(db, targetId);
      if (!isEvaluatee(t)) fail(`${t.name} has no evaluation results.`);
      const heads = resultHeads(db, t.dept).filter((h) => h.id !== t.id);
      if (!heads.length) fail(`${t.name}'s department has no dean or principal account to receive the results.`, 409);
      const o = text(office, 'Requesting office', 120);
      for (const h of heads) {
        db.requests.push({ id: uid('rq'), periodId: p.id, targetId: t.id, office: o, headId: h.id, byId: user.id, at: new Date().toISOString() });
        notify(db, { key: `rq|${p.id}|${t.id}|${h.id}|${Date.now()}`, userId: h.id, kind: 'release', text: `The ${o} requested the evaluation results of ${t.name} for ${p.name}. As per HRMC policy they are released to you; any further release is your responsibility. See "Department results".` });
      }
      return { sentTo: heads.map((h) => h.name) };
    },
  },

  /* ---------- HR: assignments & reminders ---------- */
  generateTasks: {
    roles: HR,
    run(db, { periodId }) {
      const p = period(db, periodId);
      if (p.status !== 'open') fail('Reopen the period to add tasks.', 409);
      return generateTasks(db, p.id);
    },
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
      const tt = targetType(db, tg);
      if (!tt) fail(`${tg.name} is not evaluated in this system.`);
      const groups = evaluatorGroups(ev);
      if (groups.includes('ST')) fail('Students are assigned through their class sections.');
      const rule = p.rules?.[tt] || db.rules[tt] || {};
      const group = groups.find((g) => g in rule) || fail(`${ev.name} is not in an evaluator group for ${TARGET_TYPES[tt]}.`);
      if (!instrumentFor(db, tt, group, tg.dept)) fail('No form exists for this pairing. Create it under Forms first.');
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

  /* ---------- HR: criteria & forms (FR3, FR4, NFR8, NFR9) ---------- */
  addCriterion: {
    roles: HR,
    run(db, { text: t }) { const c = { id: uid('c'), text: text(t, 'Criterion', 300) }; db.criteria.push(c); return { id: c.id }; },
  },
  renameCriterion: {
    roles: HR,
    run(db, { criterionId, text: t }) {
      const c = find(db.criteria, criterionId, 'Criterion');
      if (usedCriteria(db).has(c.id)) fail('This criterion was already answered in submitted evaluations, so its wording is kept. Add a new criterion and use it in a new form version.', 409);
      c.text = text(t, 'Criterion', 300);
    },
  },
  deleteCriterion: {
    roles: HR,
    run(db, { criterionId }) {
      const c = find(db.criteria, criterionId, 'Criterion');
      if (db.instruments.some((i) => i.items.some((it) => it.criterionId === c.id))) fail('Remove this criterion from all forms first.', 409);
      if (usedCriteria(db).has(c.id)) fail('This criterion was answered in past evaluations and is kept for the records.', 409);
      db.criteria = db.criteria.filter((x) => x.id !== c.id);
    },
  },
  createForm: {
    roles: HR,
    run(db, { targetType: tt, group, dept, variant }) {
      if (!(tt in db.rules) || !(group in db.rules[tt])) fail('Choose a valid evaluated role and evaluator group.');
      const d = dept ? find(db.departments, dept, 'Department').id : null;
      const v = variant || null;
      if (v && !(v in CLASS_TYPES)) fail('Choose a type of class from the list.');
      if (db.instruments.some((i) => i.active !== false && i.targetType === tt && i.group === group && (i.dept || null) === d && (i.variant || null) === v)) fail('A form already exists for this pairing. Edit it, or create a new version.', 409);
      const i = { id: uid('i'), name: 'custom', targetType: tt, group, dept: d, ...(v && { variant: v }), version: 1, active: true, categories: {}, items: [] };
      db.instruments.push(i);
      return { id: i.id };
    },
  },
  /** FR4: copy a form into a new editable version; the old version stays with its past results. */
  reviseForm: {
    roles: HR,
    run(db, { instrumentId }) {
      const old = instrument(db, instrumentId);
      if (old.active === false) fail('This is already an old version.', 409);
      const versions = db.instruments.filter((i) => i.targetType === old.targetType && i.group === old.group && (i.dept || null) === (old.dept || null) && (i.variant || null) === (old.variant || null));
      const i = { ...clone(old), id: uid('i'), version: Math.max(...versions.map((v) => v.version || 1)) + 1, active: true };
      old.active = false;
      db.instruments.push(i);
      return { id: i.id, version: i.version };
    },
  },
  addFormItem: {
    roles: HR,
    run(db, { instrumentId, criterionId, category }) {
      const i = editableForm(db, instrumentId);
      find(db.criteria, criterionId, 'Criterion');
      if (i.items.some((it) => it.criterionId === criterionId)) fail('That criterion is already on this form.', 409);
      i.items.push({ criterionId, weight: 1, ...(typeof category === 'string' && category.trim() && { category: text(category, 'Category', 120) }) });
    },
  },
  removeFormItem: {
    roles: HR,
    run(db, { instrumentId, criterionId }) {
      const i = editableForm(db, instrumentId);
      i.items = i.items.filter((it) => it.criterionId !== criterionId);
    },
  },
  setFormItemWeight: {
    roles: HR,
    run(db, { instrumentId, criterionId, weight }) {
      const it = editableForm(db, instrumentId).items.find((x) => x.criterionId === criterionId) || fail('That criterion is not on this form.', 404);
      it.weight = number(weight, 'Weight', 0, 100);
    },
  },
  setFormItemCategory: {
    roles: HR,
    run(db, { instrumentId, criterionId, category }) {
      const it = editableForm(db, instrumentId).items.find((x) => x.criterionId === criterionId) || fail('That criterion is not on this form.', 404);
      if (typeof category === 'string' && category.trim()) it.category = text(category, 'Category', 120);
      else delete it.category;
    },
  },
  setFormCategoryWeight: {
    roles: HR,
    run(db, { instrumentId, category, weight }) {
      const i = editableForm(db, instrumentId);
      const c = text(category, 'Category', 120);
      i.categories ||= {};
      if (weight === null || weight === '') delete i.categories[c];
      else i.categories[c] = number(weight, 'Category weight', 0, 100);
    },
  },

  /* ---------- HR: group weights ---------- */
  setGroupWeight: {
    roles: HR,
    run(db, { targetType: tt, group, weight }) {
      if (!(tt in db.rules) || !(group in db.rules[tt])) fail('Unknown evaluated role or evaluator group.');
      const w = weight === null || weight === '' ? null : number(weight, 'Weight', 0, 100);
      db.rules[tt][group] = w;
      // NFR8: closed periods keep the weights they were computed with; open ones follow the change
      for (const p of db.periods.filter((x) => x.status === 'open')) {
        p.rules ||= clone(db.rules);
        (p.rules[tt] ||= {})[group] = w;
      }
    },
  },

  /* ---------- HR: records imported from before evalU (FR21) ---------- */
  /** One row per result:  username or email, period label (e.g. "2022-2023 1st Sem"), final score [, note] */
  importPastResults: {
    roles: HR,
    run(db, { csv }) {
      if (typeof csv !== 'string' || !csv.trim()) fail('Paste the records first.');
      if (csv.length > 500000) fail('Too many rows at once. Import them in parts.');
      const errors = [];
      let added = 0;
      csv.split(/\r?\n/).forEach((line, i) => {
        if (!line.trim()) return;
        const [who, label, score, ...rest] = line.split(/[,\t;]/).map((c) => c.trim().replace(/^"|"$/g, ''));
        if (i === 0 && /user|email|name/i.test(who) && Number.isNaN(Number(score))) return; // header
        const n = i + 1;
        const u = byLogin(db, who);
        if (!u || !isEvaluatee(u)) return errors.push(`Row ${n}: "${who}" is not an evaluated person's account.`);
        if (!label) return errors.push(`Row ${n}: the period label is missing.`);
        const v = Number(score);
        if (!Number.isFinite(v) || v < 1 || v > MAX_RATING) return errors.push(`Row ${n}: the final score must be from 1 to ${MAX_RATING}.`);
        if (db.pastResults.some((r) => r.userId === u.id && r.periodLabel.toLowerCase() === label.toLowerCase())) return errors.push(`Row ${n}: ${u.name} already has a record for "${label}".`);
        db.pastResults.push({ id: uid('pr'), userId: u.id, periodLabel: label.slice(0, 80), final: Math.round(v * 100) / 100, note: rest.join(', ').slice(0, 200) || null, importedAt: new Date().toISOString() });
        added++;
      });
      return { added, errors: errors.slice(0, 50), errorCount: errors.length };
    },
  },
  deletePastResult: {
    roles: HR,
    run(db, { id }) { find(db.pastResults, id, 'Record'); db.pastResults = db.pastResults.filter((r) => r.id !== id); },
  },

  /* ---------- HR: departments ---------- */
  /** Adds the University of Baguio departments that are missing. */
  addUbDepartments: {
    roles: HR,
    run(db) {
      const add = missingUbDepartments(db).map((d) => ({ ...d, id: db.departments.some((x) => x.id === d.id) ? uid('d') : d.id }));
      db.departments.push(...add);
      return { added: add.length };
    },
  },
  addDepartment: {
    roles: HR,
    run(db, { name, kind }) {
      const n = text(name, 'Department name', 120);
      if (db.departments.some((d) => d.name.toLowerCase() === n.toLowerCase())) fail('A department with this name already exists.', 409);
      const d = { id: uid('d'), name: n, kind: kind === 'basic' ? 'basic' : 'college' };
      db.departments.push(d);
      return { id: d.id };
    },
  },
  updateDepartment: {
    roles: HR,
    run(db, { deptId, name, kind }) {
      const d = find(db.departments, deptId, 'Department');
      if (name !== undefined) {
        const n = text(name, 'Department name', 120);
        if (db.departments.some((x) => x.id !== d.id && x.name.toLowerCase() === n.toLowerCase())) fail('A department with this name already exists.', 409);
        if (db.users.some((u) => u.position === 'ci' && u.dept === d.id) && !isNursingDept({ id: d.id, name: n })) fail('Clinical Instructors work in this department, so its name must stay a Nursing department.', 409);
        d.name = n;
      }
      if (kind !== undefined) d.kind = kind === 'basic' ? 'basic' : 'college';
    },
  },
  deleteDepartment: {
    roles: HR,
    run(db, { deptId }) {
      const d = find(db.departments, deptId, 'Department');
      if (db.users.some((u) => u.dept === d.id) || db.sections.some((s) => s.dept === d.id) || db.instruments.some((i) => i.dept === d.id))
        fail('People, classes or forms still belong to this department, so it can\'t be deleted.', 409);
      db.departments = db.departments.filter((x) => x.id !== d.id);
      for (const p of db.periods) if (p.depts) p.depts = p.depts.filter((x) => x !== d.id);
    },
  },

  /**
   * Start from scratch: removes every account except HR, and all departments, classes, periods,
   * evaluations, results, notifications and imported records. Keeps the general evaluation forms,
   * the criteria and the weights, so HR doesn't have to build them again. The audit log is never erased.
   */
  startFromScratch: {
    roles: HR,
    run(db) {
      const removed = db.users.filter((u) => u.role !== 'HR').length;
      db.users = db.users.filter((u) => u.role === 'HR');
      for (const u of db.users) u.dept = null;
      // departments go back to the UB list (HR can still add, rename or remove them)
      Object.assign(db, { sections: [], periods: [], tasks: [], requests: [], pastResults: [], notifications: [], departments: structuredClone(UB_DEPARTMENTS) });
      db.instruments = db.instruments.filter((i) => (!i.dept || db.departments.some((d) => d.id === i.dept)) && i.active !== false);
      if (!db.instruments.some((i) => i.name.includes(UB_FORM_MARK))) installUbForms(db);
      return { removed };
    },
  },
  /* ---------- HR: demo data ---------- */
  resetData: {
    roles: HR,
    replacesDb: true, // writes the database itself instead of returning a changed copy
    async run() { await seedDatabase(); },
  },
};

/** FR20: a readable line for the audit log (never includes passwords or answers). */
export function describeAction(name, args, db, result) {
  if (name === 'changePassword') return 'Changed own password';
  const parts = [];
  const a = args || {};
  const p = a.periodId && periodById(db, a.periodId);
  if (p) parts.push(`period: ${p.name}`);
  for (const k of ['userId', 'targetId', 'evaluatorId']) { const u = a[k] && userById(db, a[k]); if (u) parts.push(`${k.replace('Id', '')}: ${u.name}`); }
  if (a.instrumentId) { const i = db.instruments.find((x) => x.id === a.instrumentId); if (i) parts.push(`form: ${TARGET_TYPES[i.targetType]} ← ${GROUPS[i.group]} v${i.version || 1}`); }
  if (a.targetType && a.group) parts.push(`${TARGET_TYPES[a.targetType] || a.targetType} ← ${GROUPS[a.group] || a.group}`);
  if ('weight' in a) parts.push(`weight: ${a.weight ?? 'blank'}`);
  if (a.taskId) { const t = db.tasks.find((x) => x.id === a.taskId); const tg = t && userById(db, t.targetId); if (tg) parts.push(`evaluation of ${tg.name}`); }
  if (a.office) parts.push(`requested by: ${a.office}`);
  if (a.name && name !== 'changePassword') parts.push(`name: ${a.name}`);
  if (a.code) parts.push(`section: ${a.code}`);
  if (result?.stage) parts.push(`now: ${result.stage}`);
  if (typeof result?.added === 'number') parts.push(`${result.added} added`);
  return parts.join(' · ');
}
