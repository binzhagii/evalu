// Every change the app can make. Each action says who may run it and checks its input.
// run(db, args, user) receives a COPY of the data; the API saves it only if run() succeeds.
// FR numbers refer to Table 8 of the manuscript.
import { randomInt } from 'node:crypto';
import {
  GROUPS, TARGET_TYPES, STAGES, ROLES, POSITIONS, needsDept, uid, userById, periodById, targetType, defaultEvaluatorGroups, groupName,
  instrumentFor, formForTask, effectiveWeights, generateTasks, participationAlerts, sendReminders,
  isInstitutionalEmail, INSTITUTION_DOMAIN, notify, directors, pendingApprovals, resultHeads, hrUsers, isEvaluatee, isTeacher, isNursingDept, stageAtLeast, isResultHead, PLAN_OUTCOMES, UB_DEPARTMENTS, missingUbDepartments, MAX_RATING, CLASS_TYPES,
  evaluatorGroups, groupsOf, ratingGroups, toolStatus, sameTool, toolParts, toolProblems, toolSwitchMixes, toolName, defaultFormula, asPercentages, personIn, groupUse, groupUsedBefore, DEPT_KINDS, deptKeep, workingTerm, termLabel, isPastClass, suggestClassType, notStarted, deadlinePassed, closeNow, taskKey, policyFor, today, samePeriod, deptName,
  currentPolicy, formulaKey, activeFormula, formulaSnapshot, formGroups, validateFormula, methodOf, commentParts, METHODS, AGGREGATIONS, MISSING_RULES, ROUNDING_METHODS,
} from '../src/lib/logic.js';
import { HttpError } from './http.js';
import { encryptText, decryptText, hashPassword, verifyPassword } from './secrets.js';
import { deleteUserSessions, addAudit } from './db.js';
import { seedDatabase } from './seed.js';
import { installUbForms, UB_FORM_MARK } from '../src/lib/ubInstall.js';
import { importClasses, importStaffList } from './imports.js';

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
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) fail('Enter a valid date.');
  const timestamp = Date.parse(`${v}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== v) fail('Enter a valid date.');
  return v;
}
function number(v, label, min, max) {
  const n = Number(v);
  if (v === '' || v == null || !Number.isFinite(n) || n < min || n > max) fail(`${label} must be a number from ${min} to ${max}.`);
  return n;
}
const find = (list, id, label) => list.find((x) => x.id === id) || fail(`${label} not found.`, 404);
const longDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
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
const MAX_COMMENT = 2000; // characters per comment box (the screen shows a counter)
function cleanComment(comment) {
  if (comment == null || comment === '') return '';
  if (typeof comment !== 'string') fail('Invalid comment.');
  const parts = commentParts(comment); // one box, or the two boxes of the Dean/Principal forms
  const boxes = parts.text != null ? [parts.text] : [parts.plan, parts.improve];
  const long = boxes.find((b) => b.length > MAX_COMMENT);
  if (long) fail(`A comment can have up to ${MAX_COMMENT.toLocaleString('en-US')} characters; this one has ${long.length.toLocaleString('en-US')}. Please shorten it.`);
  return comment.trim();
}

// ---------- accounts ----------
const USERNAME = /^[a-z0-9._-]{3,32}$/;
function accountFields(db, { name, username, email, role, position, dept, evaluatorGroupIds }, editingId = null) {
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
  const home = u.dept && db.departments.find((d) => d.id === u.dept);
  if (home?.active === false && db.users.find((x) => x.id === editingId)?.dept !== home.id) fail(`${home.name} is deactivated. Choose another department.`);
  if (home?.kind === 'office' && role !== 'NTP') fail(`${home.name} is an office: only non-teaching personnel belong to it.`);
  if (position === 'ci' && !isNursingDept(db.departments.find((d) => d.id === u.dept))) fail("The Clinical Instructor position is for the School of Nursing (UB's Nursing CI tools). For clinical instructors in Dentistry, Medical Technology or Physical Therapy, choose Faculty, then set their classes' type to the clinical type of their program under Class lists: they get UB's clinical tools and the 40/40/20 weights.");
  if (role === 'TP' || role === 'NTP') {
    const assigned = Array.isArray(evaluatorGroupIds) ? evaluatorGroupIds : defaultEvaluatorGroups(role, position);
    const active = new Set((db.evaluatorGroups || []).filter((g) => g.active !== false).map((g) => g.id));
    if (assigned.some((id) => !active.has(id))) fail('Choose only active evaluator groups.');
    u.evaluatorGroupIds = [...new Set(assigned)];
  } else u.evaluatorGroupIds = [];
  return u;
}
/** Did anyone already answer an evaluation of one of these people in an open period? */
function evaluatedNow(db, ids) {
  const who = new Set(ids), open = new Set(db.periods.filter((p) => p.status === 'open').map((p) => p.id));
  return db.tasks.some((t) => t.response && open.has(t.periodId) && who.has(t.targetId));
}
/** Put a student in exactly these class sections (of any department: general education subjects are taught by other schools). */
function enroll(db, user, sectionIds) {
  const want = new Set(user.role === 'ST' && Array.isArray(sectionIds) ? sectionIds : []);
  for (const id of want) find(db.sections, id, 'Class section');
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
/** Who belongs to a group HR made: everyone with these positions, and these people. At least one. */
function groupMembers(db, { positions, userIds }) {
  const known = new Set(['TP', 'NTP'].flatMap((r) => Object.keys(POSITIONS[r])));
  const pos = Array.isArray(positions) ? [...new Set(positions)] : [];
  if (pos.some((x) => !known.has(x))) fail('Choose positions from the list.');
  const people = (Array.isArray(userIds) ? [...new Set(userIds)] : []).map((id) => account(db, id));
  if (people.some((u) => !['TP', 'NTP'].includes(u.role))) fail('Only teaching and non-teaching personnel can be put in an evaluator group.');
  if (!pos.length && !people.length) fail('Choose who belongs to this group: everyone with a position, or chosen people.');
  return { pos, people };
}
/** A department can have its own formula only for the people it has. */
function deptHasCategory(db, tt, d) {
  if (!db.users.some((u) => u.active !== false && u.dept === d && targetType(db, u) === tt)) fail(`Nobody in ${deptName(db, d)} is rated as ${TARGET_TYPES[tt]}, so it can't have its own formula for them.`);
}
/** A department students can belong to (not an office, not deactivated). */
function schoolDept(db, id) {
  const d = find(db.departments, id, 'Department');
  if (d.kind === 'office' || d.active === false) fail(`Students can't be in ${d.name}.`);
  return d;
}
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
  if (notStarted(periodById(db, t.periodId))) fail('This evaluation has not started yet. It opens on its start date.', 409);
  // Strict cut-off: once the deadline (end of that day) has passed, no more answers are accepted, even if HR has not closed the period yet. HR can extend the deadline in Periods & release.
  const per = periodById(db, t.periodId);
  if (per?.deadline && new Date(per.deadline + 'T23:59:59') < new Date()) fail('The deadline for this evaluation has passed, so it can no longer be submitted. Contact HR if you need more time.', 409);
  const ins = formForTask(db, t) || fail('The form for this evaluation no longer exists. Contact HR.', 409);
  return { t, ins };
}

// ---------- forms (FR4: a used form is never changed; a new version is made) ----------
// People only ever answer a version HR chose to use, so only a draft can be edited.
function editableForm(db, id) {
  const i = instrument(db, id);
  const s = toolStatus(i);
  if (s === 'old') fail('This is an old version, kept with the results that used it. Change the current version instead.', 409);
  if (s === 'scheduled') fail('This version is ready and waiting for the next evaluation period. Click "Back to draft" to change it.', 409);
  if (s === 'in-use') fail('This tool is in use, so it can\'t be changed directly. Click "Make changes" to work on a draft copy; people keep answering the current version until you use the new one.', 409);
  return i;
}
/** The draft or scheduled version of a tool, if HR is already preparing one. */
const preparing = (db, ins) => db.instruments.find((x) => x.status && sameTool(x, ins));
function noSecondDraft(db, ins) {
  const x = preparing(db, ins);
  if (x) fail(`This tool already has a ${x.status === 'draft' ? 'draft' : 'version waiting for the next period'} (version ${x.version}). Open that one, or discard it first.`, 409);
}
const nextVersion = (db, ins) => Math.max(0, ...db.instruments.filter((x) => sameTool(x, ins)).map((x) => x.version || 1)) + 1;
/** Questions typed straight into a tool (not added through the question bank) are removed with it when nothing else uses them. */
const OWN_QUESTION = 'tq';
function dropOwnQuestions(db, ids) {
  const keep = usedCriteria(db);
  const gone = new Set(ids.filter((id) => id.startsWith(`${OWN_QUESTION}_`) && !keep.has(id) && !db.instruments.some((i) => i.items.some((it) => it.criterionId === id))));
  if (gone.size) db.criteria = db.criteria.filter((c) => !gone.has(c.id));
}
/** The question with this wording that is already in the bank (without words of its own for each rating). */
const sameWording = (db, t) => db.criteria.find((c) => !c.levels?.length && c.text.trim().toLowerCase() === t.toLowerCase());
const PART_MAX = 120;
const partName = (v) => { const t = text(v, 'Part name', PART_MAX); return t.toLowerCase() === 'general' ? 'General' : t; };
const partOf = (i, name) => toolParts(i).find((p) => p.name === name) || fail('That part is not on this tool.', 404);
/** Use a checked version: it becomes the one people answer, and the version before it is kept as old. */
function putToolInUse(db, i) {
  for (const x of db.instruments) if (x.id !== i.id && sameTool(x, i) && x.active !== false) x.active = false;
  i.active = true;
  delete i.status;
}
const checkTool = (db, i) => {
  const bad = toolProblems(i);
  if (bad.length) fail(`"${toolName(db, i)}" can't be used yet: ${bad.join(' ')}`, 409);
};
/** Which evaluator groups can rate a category: every active group; students only rate people who teach classes. */
function ratingPair(db, tt, group) {
  if (!Object.hasOwn(TARGET_TYPES, tt)) fail('Choose who is evaluated.');
  if (!(db.evaluatorGroups || []).some((g) => g.id === group && g.active !== false)) fail('Choose a valid evaluated role and evaluator group.');
  if (group === 'ST' && !['COLLEGE_FACULTY', 'BASICED_TEACHER', 'CI'].includes(tt)) fail('Students evaluate only the people who teach their classes.');
}
const usedCriteria = (db) => new Set(db.tasks.filter((t) => t.response).flatMap((t) => Object.keys(t.response.answers)));

// ---------- class lists (FR6) ----------
/** The semester of a class: "2026-1" (1st) or "2026-2" (2nd). */
function classTerm(db, term) {
  if (!term) return workingTerm(db);
  if (typeof term !== 'string' || !/^\d{4}-[12]$/.test(term)) fail('Choose the school year and semester.');
  return term;
}
function sectionFields(db, { code, subject, facultyId, term }, editingId = null) {
  const s = { code: text(code, 'Section code', 40), subject: text(subject, 'Subject', 120) };
  const f = userById(db, facultyId);
  if (!isTeacher(f)) fail('Choose the faculty member or Clinical Instructor who teaches this class.');
  const t = term === undefined && editingId ? db.sections.find((x) => x.id === editingId)?.term : classTerm(db, term);
  if (db.sections.some((x) => x.id !== editingId && (x.term || null) === (t || null) && x.facultyId === f.id && x.code.toLowerCase() === s.code.toLowerCase() && x.subject.toLowerCase() === s.subject.toLowerCase())) fail('This class (section, subject and teacher) already exists in that semester.', 409);
  return { ...s, facultyId: f.id, dept: f.dept, ...(t && { term: t }) };
}

// ---------- development plans ----------
const planRec = (db, id) => (db.plans || []).find((p) => p.id === id) || fail('Development plan not found.', 404);
/** HR, or the dean/principal of the person's department (not for themselves). */
function mayPlanFor(db, user, t, periodId) {
  if (user.role === 'HR') return;
  if (isResultHead(user) && user.id !== t.id && [t.dept, personIn(db, periodId, t).dept].includes(user.dept)) return; // now, or when they were rated
  fail("Only HR or the dean or principal of the person's department can make or change a development plan.", 403);
}
function planFields({ areas, actions, reviewBy }) {
  const list = Array.isArray(areas) ? [...new Set(areas.map((a) => text(a, 'Area', 120)))].slice(0, 12) : [];
  const todo = text(actions, 'What will be done', 2000);
  if (todo.length < 10) fail('Write what will be done, for example "Attend the INSET on assessment; classroom observation by the Program Chair in February".');
  return { areas: list, actions: todo, reviewBy: date(reviewBy) };
}

// ---------- notifications for the release steps ----------

/** Keep only the parts of a formula the engine understands (never code, never extra fields). */
function cleanFormula(c = {}, groups = Object.keys(GROUPS)) { // (the participation rule is in the policy, not in formulas)
  const pick = (v, list, def) => (typeof v === 'string' && Object.hasOwn(list, v) ? v : def);
  const method = pick(c.method, METHODS, '');
  const methodVersion = c.methodVersion == null ? 1 : Number(c.methodVersion);
  if (!Number.isSafeInteger(methodVersion) || methodVersion < 1) fail('Computation method version must be a positive whole number.');
  if (method && !methodOf(method, methodVersion)) fail(`Computation method "${method}" version ${methodVersion} is not available.`);
  return {
    name: text(c.name || 'Untitled formula', 'Formula name', 120),
    method, // a blank formula leaves the choice to HR
    methodVersion,
    components: (Array.isArray(c.components) ? c.components : []).slice(0, 12).map((x) => ({
      group: groups.includes(x?.group) ? x.group : fail('Unknown evaluator group.'),
      weight: x.weight === '' || x.weight == null ? null : number(x.weight, 'Weight', 0, 100),
      aggregation: pick(x.aggregation, AGGREGATIONS, x.group === 'ST' ? 'SECTION_AVERAGE' : 'AVERAGE'),
      transform: typeof x.transform === 'string' ? x.transform.slice(0, 300) : '',
    })),
    expression: typeof c.expression === 'string' ? c.expression.slice(0, 300) : '',
    missing: pick(c.missing, MISSING_RULES, ''),
    minGroups: Math.max(1, Math.min(12, Number.parseInt(c.minGroups, 10) || 1)),
    effectiveFrom: c.effectiveFrom ? date(c.effectiveFrom) : '',
    effectiveUntil: c.effectiveUntil ? date(c.effectiveUntil) : '',
    rounding: { decimals: Math.max(0, Math.min(4, Number.parseInt(c.rounding?.decimals, 10) || 0)), method: pick(c.rounding?.method, ROUNDING_METHODS, 'HALF_UP') },
  };
}
const formulaEffectiveOn = (f, day) => (!f.config.effectiveFrom || f.config.effectiveFrom <= day)
  && (!f.config.effectiveUntil || f.config.effectiveUntil >= day);
/** Put an approved formula version in use: the old version of the same category is archived. */
function putInUse(db, f, user, how = 'activated') {
  for (const old of db.formulas.filter((x) => x.key === f.key && x.status === 'active')) { old.status = 'archived'; logFormula(old, user, 'archived', `replaced by version ${f.version}`); }
  f.status = f.meta.follow ? 'archived' : 'active'; f.meta.activatedBy = user.name; f.meta.activatedAt = new Date().toISOString();
  logFormula(f, user, how);
  if (f.meta.follow) return null; // the department has no formula of its own any more
  const weights = Object.fromEntries(f.config.components.map((c) => [c.group, methodOf(f.config.method, f.config.methodVersion)?.usesWeights ? c.weight : null]));
  if (!f.dept) db.rules[f.targetType] = weights; // the groups that get tasks (and what the Weights page shows)
  return weights;
}
const formulaRec = (db, id) => (db.formulas || []).find((f) => f.id === id) || fail('Formula not found.', 404);
const logFormula = (f, user, action, note = '') => { (f.meta.log ||= []).push({ at: new Date().toISOString(), by: user.name, byId: user.id, action, note }); };

function notifyRelease(db, p, stage) {
  if (stage === 'dir') {
    for (const d of directors(db)) notify(db, { key: `rel|${p.id}|dir|${d.id}|${Date.now()}`, userId: d.id, kind: 'release', text: `Results for ${p.name} are ready for your review. Please review them under Reports and approve them for release to faculty.` });
  } else if (stage === 'faculty') {
    const people = new Set(db.tasks.filter((t) => t.periodId === p.id).map((t) => t.targetId));
    for (const id of people) {
      const u = userById(db, id);
      if (u && u.active !== false && (isEvaluatee(u) || p.people?.[u.id])) notify(db, { key: `rel|${p.id}|fac|${id}`, userId: id, kind: 'release', text: `Your evaluation results for ${p.name} are now available under "My results".` });
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
      if (missing.length) fail(missing.length === 1 ? '1 question is not answered yet.' : `${missing.length} questions are not answered yet.`);
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
  /** Opening one notification marks only that one as read. */
  markNotificationRead: {
    roles: ANYONE, audit: false,
    run(db, { id }, user) {
      const n = db.notifications.find((x) => x.id === id && x.userId === user.id) || fail('Notification not found.', 404);
      n.read = true;
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
      // (classes of semesters that are over don't hold anything up)
      if (db.sections.some((s) => s.facultyId === u.id && !isPastClass(db, s)) && !isTeacher(next)) {
        fail(`${u.name} still teaches a class this semester, so they must stay Faculty or Clinical Instructor.`, 409);
      }
      // someone already evaluated in an open period keeps their department and position until it is closed
      if ((next.dept !== u.dept || next.role !== u.role || next.position !== u.position) && evaluatedNow(db, [u.id])) fail(`${u.name} was already evaluated in an open period, so their department and position can't change until it is closed.`, 409);
      Object.assign(u, next);
      delete u.deptGuess; // HR saved it: it is not a guess any more
      for (const s of db.sections) if (s.facultyId === u.id && !isPastClass(db, s)) s.dept = u.dept;
      enroll(db, u, sectionIds ?? db.sections.filter((s) => s.studentIds.includes(u.id)).map((s) => s.id));
    },
  },
  addEvaluatorGroup: {
    roles: HR,
    run(db, { name, targetTypes, positions, userIds }) {
      db.evaluatorGroups ||= [];
      const label = text(name, 'Evaluator group name', 80);
      const targets = Array.isArray(targetTypes) ? [...new Set(targetTypes)] : [];
      if (targets.some((tt) => !Object.hasOwn(TARGET_TYPES, tt))) fail('Choose valid evaluated categories.');
      const id = label.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30).replace(/_+$/g, '');
      if (!/^[A-Z][A-Z0-9_]{1,29}$/.test(id)) fail('The group name must produce an ID with at least two letters or numbers.');
      if (db.evaluatorGroups.some((g) => g.id === id || g.name.toLowerCase() === label.toLowerCase())) fail('An evaluator group with that ID or name already exists.', 409);
      // The group starts to count when it is put in a formula. (It used to enter the weights at once with no percentage,
      // which left everyone in the category without a rating until the scoring was changed.)
      // who belongs to it (with categories only, as before, its members are chosen in their accounts)
      const { pos, people } = targets.length && positions === undefined && userIds === undefined ? { pos: [], people: [] } : groupMembers(db, { positions, userIds });
      db.evaluatorGroups.push({ id, name: label, builtIn: false, active: true, targetTypes: targets, ...(pos.length && { positions: pos }) });
      for (const u of people) u.evaluatorGroupIds = [...evaluatorGroups(u).filter((x) => x !== id), id];
      return { id, name: label, targetTypes: targets };
    },
  },
  /** Rename a group; change who belongs to a group HR made (by position and/or chosen people). */
  updateEvaluatorGroup: {
    roles: HR,
    run(db, { id, name, positions, userIds }) {
      const g = find(db.evaluatorGroups || [], id, 'Evaluator group');
      if (g.active === false) fail('This group is archived. Restore it first.', 409);
      const label = text(name, 'Evaluator group name', 80);
      if (db.evaluatorGroups.some((x) => x.id !== g.id && x.name.toLowerCase() === label.toLowerCase())) fail('Another evaluator group has that name.', 409);
      g.name = label;
      if (g.builtIn) { if (positions !== undefined || userIds !== undefined) fail("The members of a built-in group come from each person's position.", 409); return { name: label }; }
      if (positions === undefined && userIds === undefined) return { name: label };
      const { pos, people: list } = groupMembers(db, { positions, userIds }), people = new Set(list.map((u) => u.id));
      if (pos.length) g.positions = pos; else delete g.positions;
      for (const u of db.users) {
        const has = Array.isArray(u.evaluatorGroupIds) && u.evaluatorGroupIds.includes(g.id);
        if (people.has(u.id) && !has) u.evaluatorGroupIds = [...evaluatorGroups(u), g.id];
        if (!people.has(u.id) && has) u.evaluatorGroupIds = u.evaluatorGroupIds.filter((x) => x !== g.id);
      }
      return { name: label };
    },
  },
  /** A group no formula uses: deleted when it was never used, archived (kept for old results) when it was. */
  deleteEvaluatorGroup: {
    roles: HR,
    run(db, { id }) {
      const g = find(db.evaluatorGroups || [], id, 'Evaluator group');
      if (g.builtIn) fail("Built-in groups can't be deleted, because accounts and UB's printed sheets use them. Remove it from the formulas instead.", 409);
      const use = groupUse(db, g.id);
      if (use.list.length) fail(`${g.name} still counts in: ${use.list.join('; ')}. Remove it there first.`, 409);
      const archive = groupUsedBefore(db, g.id);
      const drafts = db.instruments.filter((i) => i.group === g.id && (i.status || !archive));
      db.instruments = db.instruments.filter((i) => !drafts.includes(i));
      dropOwnQuestions(db, drafts.flatMap((i) => i.items.map((it) => it.criterionId)));
      if (archive) {
        g.active = false;
        for (const i of db.instruments) if (i.group === g.id) i.active = false;
      } else {
        db.evaluatorGroups = db.evaluatorGroups.filter((x) => x.id !== g.id);
        for (const u of db.users) if (Array.isArray(u.evaluatorGroupIds)) u.evaluatorGroupIds = u.evaluatorGroupIds.filter((x) => x !== g.id);
      }
      return { name: g.name, archived: archive };
    },
  },
  /** Bring back an archived group with the newest version of its tools. */
  restoreEvaluatorGroup: {
    roles: HR,
    run(db, { id }) {
      const g = find(db.evaluatorGroups || [], id, 'Evaluator group');
      if (g.active !== false) fail('This group is not archived.', 409);
      g.active = true;
      const newest = new Map();
      for (const i of db.instruments.filter((x) => x.group === g.id && !x.status)) { const k = [i.targetType, i.dept || '', i.variant || ''].join('|'); if ((newest.get(k)?.version || 0) < (i.version || 1)) newest.set(k, i); }
      for (const i of newest.values()) i.active = true;
      return { name: g.name };
    },
  },
  /**
   * Add an evaluator group to a category's rating in one step: the group (an existing one or a new one with its
   * members), its tool (existing, a copy or an empty draft) and the new percentages, as a formula draft.
   * Nothing is kept unless everything is valid, and nothing changes for the ratings until the formula is in use.
   */
  addGroupWithFormula: {
    roles: HR,
    run(db, { targetType: tt, dept, group, newGroup, tool = {}, weights = {} }, user) {
      db.formulas ||= []; db.evaluatorGroups ||= [];
      if (!Object.hasOwn(TARGET_TYPES, tt)) fail('Choose who is evaluated.');
      const d = dept ? find(db.departments, dept, 'Department').id : null;
      const key = formulaKey(tt, d);
      const working = db.formulas.find((f) => f.key === key && ['draft', 'pending', 'rejected', 'approved', 'scheduled'].includes(f.status));
      if (d && !working) deptHasCategory(db, tt, d);
      if (working && (working.meta.follow || !['draft', 'rejected'].includes(working.status))) fail(`${TARGET_TYPES[tt]} already has a formula on its way (${working.status === 'pending' ? 'waiting for the VP' : 'approved'}). Finish that one first.`, 409);
      const current = activeFormula(db, tt, d);
      const config = clone(asPercentages(working ? working.config : current ? current.config : defaultFormula(db.rules[tt] || {}, currentPolicy(db))));

      // 1. who rates
      let gid = group;
      if (newGroup) {
        const label = text(newGroup.name, 'Evaluator group name', 80);
        gid = label.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30).replace(/_+$/g, '');
        if (!/^[A-Z][A-Z0-9_]{1,29}$/.test(gid)) fail('The group name must have at least two letters or numbers.');
        if (db.evaluatorGroups.some((g) => g.id === gid || g.name.toLowerCase() === label.toLowerCase())) fail('An evaluator group with that name already exists. Choose it from the list instead.', 409);
        const { pos: positions, people } = groupMembers(db, newGroup);
        db.evaluatorGroups.push({ id: gid, name: label, builtIn: false, active: true, targetTypes: [tt], ...(positions.length && { positions }) });
        for (const u of people) u.evaluatorGroupIds = [...evaluatorGroups(u).filter((x) => x !== gid), gid];
      }
      ratingPair(db, tt, gid);
      if (config.components.some((c) => c.group === gid)) fail(`${groupName(db, gid)} already counts in this rating. Change its percentage instead.`, 409);

      // 2. its tool
      const slot = { targetType: tt, group: gid, dept: null, variant: null };
      let made = null;
      const has = db.instruments.find((i) => i.targetType === tt && i.group === gid && (i.status || (i.active !== false && i.items.length)));
      if (!has) {
        const label = text(tool.name || `${TARGET_TYPES[tt]} by the ${groupName(db, gid)}`, 'Tool name', 120);
        const from = tool.copyFrom ? instrument(db, tool.copyFrom) : null;
        made = { id: uid('i'), name: label.replace(UB_FORM_MARK, '').trim(), ...slot, version: nextVersion(db, slot), active: false, status: 'draft', categories: from ? clone(from.categories || {}) : {}, items: from ? clone(from.items) : [] };
        delete made.variant;
        db.instruments.push(made);
      }

      // 3. the percentages
      config.components.push({ group: gid, weight: null, aggregation: gid === 'ST' ? 'SECTION_AVERAGE' : 'AVERAGE' });
      for (const c of config.components) c.weight = number(weights[c.group], `${groupName(db, c.group)} percentage`, 0.01, 100);
      const total = config.components.reduce((a, c) => a + c.weight, 0);
      if (Math.abs(total - 100) > 1e-9) fail(`The percentages add up to ${+total.toFixed(2)}%; they must add up to 100%.`);
      config.name = `${TARGET_TYPES[tt]}${d ? ` – ${find(db.departments, d, 'Department').name}` : ''}`;
      const r = actions.saveFormulaDraft.run(db, { id: working?.id, targetType: tt, dept: d, config }, user);
      return { ...r, group: gid, name: groupName(db, gid), toolId: made?.id || has.id, toolReady: !made && toolStatus(has) !== 'draft' };
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
   * Import a class list exported from the Registrar/ARC, for one department and semester. The first row can name the
   * columns in any order (see server/imports.js); without it, one row per student, either
   *   section code, subject, teacher name, teacher email, student ID, student name, student UB email  (creates missing teachers and students)
   *   section code, subject, teacher email, student ID, student name, student UB email   (creates missing students)
   *   section code, subject, teacher email, student email or username                     (students must already exist)
   * New sections and new student accounts are created; students are enrolled. A new student's first
   * password is their student ID, and they must change it at the first sign-in. Problem rows are listed, not saved.
   */
  importClassList: {
    roles: HR,
    async run(db0, { csv, dept, term, preview, drop, deptOf }) {
      // preview: check the whole file on a copy and report what would happen; nothing is saved
      const db = preview ? structuredClone(db0) : db0;
      if (typeof csv !== 'string' || !csv.trim()) fail('Paste or choose the class list first.');
      if (csv.length > 2000000) fail('The class list is too long. Import it in parts (for example one department at a time).');
      const listDept = dept ? find(db.departments, dept, 'Department') : null; // where new teachers (and so their classes) go
      if (listDept && (listDept.kind === 'office' || listDept.active === false)) fail(`${listDept.name} has no classes.`);
      const t = classTerm(db, term);
      // the department HR chose for the new students of a section (the file has none)
      const chosen = Object.fromEntries(Object.entries(deptOf && typeof deptOf === 'object' ? deptOf : {}).filter(([, v]) => v));
      for (const v of Object.values(chosen)) schoolDept(db, v);
      const r = importClasses(db, { csv, listDept, term: t, drop: drop === true, deptOf: chosen });
      const suggested = db.sections.filter((s) => (s.term || null) === t && suggestClassType(db, s)).length;
      const out = { term: t, rows: r.rows, created: r.created, enrolled: r.enrolled, accounts: r.fresh.length, teachers: r.freshTeachers.length, existingStudents: r.existingStudents, duplicates: r.duplicates,
        dropped: r.dropped.slice(0, 100).map((x) => `${x.name} · ${x.code} ${x.subject}`), droppedCount: r.dropped.length, notInFile: r.notInFile.slice(0, 50).map((s) => `${s.code} · ${s.subject}`), suggested,
        warnings: r.warnings.slice(0, 50), errors: r.errors.slice(0, 50), errorCount: r.errors.length, corrected: r.corrected, guessed: r.guessed.slice(0, 500), guessedCount: r.guessedCount };
      if (preview) return { ...out, preview: true, newClasses: db.sections.filter((x) => !db0.sections.some((y) => y.id === x.id)).map((x) => `${x.code} · ${x.subject} (${x.studentIds.length} students)`).slice(0, 50) };
      // first password = the student ID / the teacher's username (they must change it at the first sign-in)
      const all = [...r.freshTeachers, ...r.fresh];
      for (let i = 0; i < all.length; i += 16) {
        await Promise.all(all.slice(i, i + 16).map(async (u) => { u.passwordHash = await hashPassword(u.username); u.tempPassword = encryptText(u.username); }));
      }
      return out;
    },
  },
  /** The department of students whose department was taken from their teacher (no department in the class list). */
  setStudentDepts: {
    roles: HR,
    run(db, { list }) {
      if (!Array.isArray(list) || !list.length || list.length > 10000) fail('Choose the students first.');
      let moved = 0;
      for (const { userId, dept } of list) {
        const u = account(db, userId);
        if (u.role !== 'ST') fail(`${u.name} is not a student.`);
        const d = schoolDept(db, dept);
        if (u.dept !== d.id) moved++;
        u.dept = d.id;
        delete u.deptGuess;
      }
      return { confirmed: list.length, moved };
    },
  },
  /** Deans, program chairs, office heads, staff…: one row per person (name, UB email, position, department or office). */
  importStaff: {
    roles: HR,
    async run(db0, { csv, preview }) {
      const db = preview ? structuredClone(db0) : db0;
      if (typeof csv !== 'string' || !csv.trim()) fail('Paste or choose the staff list first.');
      if (csv.length > 500000) fail('The list is too long. Import it in parts.');
      const r = importStaffList(db, { csv });
      const out = { rows: r.rows, created: r.made.length, existing: r.existing, summary: r.summary.slice(0, 100), errors: r.errors.slice(0, 50), errorCount: r.errors.length };
      if (preview) return { ...out, preview: true };
      const passwords = [];
      for (const u of r.made) { const pw = tempPassword(); u.passwordHash = await hashPassword(pw); u.tempPassword = encryptText(pw); passwords.push({ name: u.name, username: u.username, email: u.email, tempPassword: pw }); }
      return { ...out, passwords }; // shown once; HR can look one up again under People & sign-in
    },
  },
  /** The types of class the subjects suggest (laboratory, clinical…), all at once. */
  applyClassTypes: {
    roles: HR,
    run(db, { sectionIds }) {
      const ids = new Set(Array.isArray(sectionIds) ? sectionIds : []);
      let changed = 0;
      for (const s of db.sections) { const k = ids.has(s.id) && suggestClassType(db, s); if (k) { s.classType = k; changed++; } }
      return { changed };
    },
  },

  /* ---------- HR: evaluation periods & release ---------- */
  createPeriod: {
    roles: HR,
    run(db, { name, deadline, startsOn, depts }, user) {
      const list = Array.isArray(depts) ? [...new Set(depts)].map((d) => find(db.departments, d, 'Department').id) : [];
      const startDate = date(startsOn || today());
      const endDate = date(deadline);
      if (startDate > endDate) fail('The evaluation period must start on or before its deadline.');
      const same = samePeriod(db, text(name, 'Period name', 120), list);
      if (same) fail(`${same.name} already covers ${!same.depts?.length ? 'all departments' : !list.length ? 'some departments' : same.depts.filter((d) => list.includes(d)).map((d) => deptName(db, d)).join(', ')}.`, 409);
      const started = (db.formulas || []).filter((f) => f.status === 'scheduled' && formulaEffectiveOn(f, startDate));
      for (const f of started) putInUse(db, f, user, 'activated (scheduled for this new period)');
      const expired = (db.formulas || []).filter((f) => f.status === 'active' && !formulaEffectiveOn(f, startDate));
      for (const f of expired) {
        if (!db.formulas.some((candidate) => candidate.key === f.key && formulaEffectiveOn(candidate, startDate) && candidate.status === 'active')) {
          fail(`No formula version for ${TARGET_TYPES[f.targetType]} is effective on ${startDate}. Set an effective period or schedule an approved replacement first.`, 409);
        }
      }
      // tools waiting for "the next period" start now, unless people in another open period are still answering the old version
      const newTools = [], waitingTools = [];
      for (const i of db.instruments.filter((x) => x.status === 'scheduled')) {
        checkTool(db, i);
        if (toolSwitchMixes(db, i)) waitingTools.push(toolName(db, i));
        else { putToolInUse(db, i); newTools.push(`${toolName(db, i)} v${i.version}`); }
      }
      // a tool with missing or wrong weights would give wrong scores without anyone noticing
      const covered = (i) => !i.dept || !list.length || list.includes(i.dept);
      const broken = db.instruments.filter((i) => toolStatus(i) === 'in-use' && i.items.length && covered(i) && toolProblems(i).length);
      if (broken.length) fail(`Fix ${broken.length === 1 ? 'this tool' : 'these tools'} under Evaluation tools first: ${broken.map((i) => `"${toolName(db, i)}" (${toolProblems(i).join(' ')})`).join('; ')}`, 409);
      for (const f of started.filter((x) => !x.meta.follow)) {
        const none = f.config.components.filter((c) => !formGroups(db, f.targetType).includes(c.group));
        if (none.length) fail(`The new formula for ${TARGET_TYPES[f.targetType]} includes ${none.map((c) => groupName(db, c.group)).join(', ')}, but no evaluation tool is in use for ${none.length === 1 ? 'that group' : 'those groups'}. Finish it under Evaluation tools first.`, 409);
      }
      const p = {
        id: uid('p'), name: text(name, 'Period name', 120), startDate, deadline: endDate, status: 'open', releaseStage: 'hr', thresholdChecked: false,
        openedAt: new Date().toISOString(), // the participation forecast counts the pace from the start date, or from here
        rules: clone(db.rules),   // NFR8: the weights in force for this period
        policy: currentPolicy(db), // the policy version in force for this period (threshold, bands, approvals…)
        formulas: Object.fromEntries((db.formulas || []).filter((f) => f.status === 'active' && formulaEffectiveOn(f, startDate)).map((f) => [f.key, formulaSnapshot(f)])), // the formula versions this period is computed with
        depts: list.length ? list : null, // FR8: one department, several, or all
        approvals: [], rejections: [],
      };
      db.periods.push(p);
      return { id: p.id, started: started.map((f) => `${f.config.name} v${f.version}`), newTools, waitingTools };
    },
  },
  setPeriodDeadline: {
    roles: HR,
    run(db, { periodId, deadline }) {
      const p = period(db, periodId), was = p.deadline;
      if (p.status !== 'open') fail('This period is closed. Reopen it with a new deadline.', 409);
      const next = date(deadline);
      if (p.startDate && next < p.startDate) fail('The deadline must be on or after the start date.');
      p.deadline = next; p.lastAuto = null;
      if (p.auto) delete p.auto.closeNotice; // it closes by itself after the new deadline
      // people who have not answered are told when they get more time
      if (next > was && !notStarted(p)) for (const id of new Set(db.tasks.filter((t) => t.periodId === p.id && !t.response).map((t) => t.evaluatorId))) notify(db, { key: `ext|${p.id}|${id}|${next}`, userId: id, kind: 'reminder', text: `The deadline of ${p.name} was moved to ${longDay(next)}. You still have evaluations to answer.` });
      return { from: was, to: next };
    },
  },
  closePeriod: {
    roles: HR,
    run(db, { periodId }) {
      const p = period(db, periodId);
      if (p.status !== 'open') fail('This period is already closed.', 409);
      return { flagged: closeNow(db, p) }; // FR11/FR12: leaves out classes without enough answers and notifies everyone concerned
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
    run(db, { periodId, deadline }) {
      const p = period(db, periodId);
      if (p.status !== 'closed') fail('This period is already open.', 409);
      if (p.releaseStage !== 'hr') fail('Withdraw the released results first.', 409);
      const next = deadline ? date(deadline) : p.deadline;
      if (next < today()) fail('Choose a new deadline: the old one has passed, so the period would close again by itself.');
      p.deadline = next; p.lastAuto = null;
      if (p.auto) delete p.auto.closeNotice;
      p.status = 'open';
      p.thresholdChecked = false;
      db.results = (db.results || []).filter((r) => r.periodId !== p.id); // computed again when it is closed
    },
  },
  releaseNext: {
    roles: HR,
    run(db, { periodId }) {
      const p = period(db, periodId);
      if (p.status !== 'closed') fail('Close the period before releasing results.', 409);
      const next = STAGES[STAGES.indexOf(p.releaseStage) + 1] || fail('Results are already fully released.', 409);
      if (next === 'faculty') {
        // FR17: every VP must approve before faculty see anything
        const waiting = pendingApprovals(db, p);
        if (waiting.length) fail(`Waiting for approval from: ${waiting.map((u) => u.name).join(', ')}.`, 409);
      }
      p.releaseStage = next;
      if (next === 'dir') (p.auto ||= {}).sentAt = new Date().toISOString(); // the VPs are reminded from here
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
  /** FR17 governance: a VP sends the results back to HR with a reason instead of approving them. */
  returnToHR: {
    roles: DIR,
    run(db, { periodId, reason }, user) {
      const p = period(db, periodId);
      if (user.position !== 'vp') fail('Only the Vice Presidents review results.', 403);
      if (p.releaseStage !== 'dir') fail('These results are not waiting for your review.', 409);
      const why = text(reason, 'Reason', 1000);
      if (why.length < 5) fail('Write a short reason so HR knows what to check.');
      p.releaseStage = 'hr';
      p.approvals = []; // after HR fixes it, every approval is given again
      (p.rejections ||= []).push({ userId: user.id, name: user.name, at: new Date().toISOString(), reason: why });
      for (const h of hrUsers(db)) notify(db, { key: `ret|${p.id}|${user.id}|${Date.now()}|${h.id}`, userId: h.id, kind: 'release', text: `${user.name} returned the results of ${p.name} to HR: "${why}". Check them and send them for approval again.` });
    },
  },
  /** FR17: a Vice President approves the results of a period for release to faculty. */
  approveRelease: {
    roles: DIR,
    run(db, { periodId }, user) {
      const p = period(db, periodId);
      if (user.position !== 'vp') fail('Only the Vice Presidents approve results.', 403);
      if (p.releaseStage !== 'dir') fail('These results are not waiting for your approval.', 409);
      p.approvals ||= [];
      if (p.approvals.some((a) => a.userId === user.id)) fail('You already approved these results.', 409);
      p.approvals.push({ userId: user.id, at: new Date().toISOString() });
      const waiting = pendingApprovals(db, p);
      // the switch in Evaluation rules: release as soon as enough VPs approved
      const released = !waiting.length && policyFor(db, p.id).autoRelease === true;
      if (released) { p.releaseStage = 'faculty'; notifyRelease(db, p, 'faculty'); }
      for (const h of hrUsers(db)) {
        notify(db, {
          key: `appr|${p.id}|${user.id}|${h.id}`, userId: h.id, kind: 'release',
          text: waiting.length
            ? `${user.name} approved the results for ${p.name}. Still waiting for: ${waiting.map((u) => u.name).join(', ')}.`
            : `${user.name} approved the results for ${p.name}. ${released ? 'Enough VPs approved, so they were released to faculty by themselves (Evaluation rules).' : 'Enough VPs approved: you can now release them to faculty.'}`,
        });
      }
      return { waiting: waiting.length, released };
    },
  },
  /** FR18: another office asks for a person's results; they are released to that person's dean only. */
  /* ---------- development follow-up: a plan for someone rated Fair or Poor (by their dean/principal or HR) ---------- */
  createPlan: {
    roles: ['HR', 'TP'],
    run(db, { targetId, periodId, areas, actions, reviewBy }, user) {
      const t = account(db, targetId), p = period(db, periodId);
      if (!isEvaluatee(t) && !p.people?.[t.id]) fail(`${t.name} has no evaluation results.`);
      mayPlanFor(db, user, t, p.id);
      if (!stageAtLeast(p, 'faculty')) fail('Make a plan after the results of this period are released to faculty.', 409);
      db.plans ||= [];
      if (db.plans.some((x) => x.targetId === t.id && x.periodId === p.id && x.status === 'open')) fail(`${t.name} already has an open plan for ${p.name}. Change that one instead.`, 409);
      const plan = { id: uid('dp'), targetId: t.id, periodId: p.id, status: 'open', ...planFields({ areas, actions, reviewBy }),
        createdBy: user.name, createdById: user.id, createdAt: new Date().toISOString(), acknowledgedAt: null, teacherNote: '', closedAt: null, outcome: null, closeNote: '' };
      db.plans.push(plan);
      notify(db, { key: `dp|${plan.id}`, userId: t.id, kind: 'release', text: `${user.name} made a development plan with you after your result in ${p.name}. Read it under My results and click "I have read this plan".` });
      return { id: plan.id };
    },
  },
  updatePlan: {
    roles: ['HR', 'TP'],
    run(db, { id, areas, actions, reviewBy }, user) {
      const plan = planRec(db, id), t = account(db, plan.targetId);
      mayPlanFor(db, user, t, plan.periodId);
      if (plan.status !== 'open') fail('This plan is closed.', 409);
      Object.assign(plan, planFields({ areas, actions, reviewBy }));
      if (plan.acknowledgedAt) { plan.acknowledgedAt = null; notify(db, { key: `dpu|${plan.id}|${Date.now()}`, userId: t.id, kind: 'release', text: `${user.name} changed your development plan. Please read it again under My results.` }); }
      return { id: plan.id };
    },
  },
  acknowledgePlan: {
    roles: ANYONE,
    run(db, { id, note }, user) {
      const plan = planRec(db, id);
      if (plan.targetId !== user.id) fail('Only the person the plan is for can confirm reading it.', 403);
      if (plan.status !== 'open') fail('This plan is closed.', 409);
      plan.acknowledgedAt = new Date().toISOString();
      plan.teacherNote = typeof note === 'string' && note.trim() ? text(note, 'Your note', 1000) : '';
      notify(db, { key: `dpa|${plan.id}|${plan.acknowledgedAt}`, userId: plan.createdById, kind: 'release', text: `${user.name} read the development plan you made${plan.teacherNote ? ` and wrote: "${plan.teacherNote}"` : ''}.` });
    },
  },
  closePlan: {
    roles: ['HR', 'TP'],
    run(db, { id, outcome, note }, user) {
      const plan = planRec(db, id), t = account(db, plan.targetId);
      mayPlanFor(db, user, t, plan.periodId);
      if (plan.status !== 'open') fail('This plan is already closed.', 409);
      if (!Object.hasOwn(PLAN_OUTCOMES, outcome)) fail('Choose how the plan ended.');
      Object.assign(plan, { status: 'closed', outcome, closeNote: typeof note === 'string' ? note.trim().slice(0, 1000) : '', closedAt: new Date().toISOString(), closedBy: user.name });
      notify(db, { key: `dpc|${plan.id}`, userId: t.id, kind: 'release', text: `${user.name} closed your development plan: ${PLAN_OUTCOMES[outcome].toLowerCase()}.` });
    },
  },

  recordResultRequest: {
    roles: HR,
    run(db, { periodId, targetId, office }, user) {
      const p = period(db, periodId);
      if (!stageAtLeast(p, 'faculty')) fail('Results can be shared only after they are released to faculty.', 409);
      const t = account(db, targetId);
      if (!isEvaluatee(t) && !p.people?.[t.id]) fail(`${t.name} has no evaluation results.`);
      const heads = resultHeads(db, personIn(db, p.id, t).dept).filter((h) => h.id !== t.id);
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
    run(db, { periodId }) {
      const p = period(db, periodId);
      if (p.status !== 'open') fail('This period is closed.', 409);
      if (notStarted(p)) fail('This period has not started yet.', 409);
      if (deadlinePassed(p)) fail('The deadline has passed, so nobody can answer any more. Extend it first.', 409);
      return { sent: sendReminders(db, p.id) };
    },
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
      const groups = groupsOf(db, ev);
      if (groups.includes('ST')) fail('Students are assigned through their class sections.');
      const counted = ratingGroups(db, p.id, tg);
      const group = groups.find((g) => counted.includes(g)) || fail(`${ev.name} is not in an evaluator group for ${TARGET_TYPES[tt]}.`);
      if (!instrumentFor(db, tt, group, tg.dept)) fail('No form exists for this pairing. Create it under Forms first.');
      if (db.tasks.some((t) => t.periodId === p.id && t.evaluatorId === ev.id && t.targetId === tg.id && t.group === group && !t.sectionId)) fail('That assignment already exists.', 409);
      if (p.auto?.skip) p.auto.skip = p.auto.skip.filter((k) => k !== taskKey({ evaluatorId: ev.id, targetId: tg.id, group, sectionId: null }));
      db.tasks.push({ id: uid('t'), periodId: p.id, evaluatorId: ev.id, targetId: tg.id, group, sectionId: null, draft: null, response: null });
    },
  },
  removeTask: {
    roles: HR,
    run(db, { taskId }) {
      const t = find(db.tasks, taskId, 'Evaluation task');
      if (t.response) fail('A submitted evaluation cannot be removed.', 409);
      db.tasks = db.tasks.filter((x) => x.id !== t.id);
      const p = periodById(db, t.periodId); // evalU creates evaluations by itself: remember not to create this one again
      if (p) (p.auto ||= {}).skip = [...new Set([...(p.auto.skip || []), taskKey(t)])];
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
      const on = db.instruments.find((i) => ['in-use', 'scheduled'].includes(toolStatus(i)) && i.items.some((it) => it.criterionId === c.id));
      if (on) fail(`This question is on a tool in use ("${toolName(db, on)}"). Open that tool and click "Make changes" to reword it there.`, 409);
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
    run(db, { targetType: tt, group, dept, variant, name }) {
      ratingPair(db, tt, group);
      const d = dept ? find(db.departments, dept, 'Department').id : null;
      const v = variant || null;
      if (v && !(v in CLASS_TYPES)) fail('Choose a type of class from the list.');
      const slot = { targetType: tt, group, dept: d, variant: v };
      noSecondDraft(db, slot);
      if (db.instruments.some((i) => i.active !== false && i.items.length && sameTool(i, slot))) fail('A tool already exists for this pairing. Open it and click "Make changes".', 409);
      const label = name ? text(name, 'Tool name', 120).replace(UB_FORM_MARK, '').trim() : '';
      const i = { id: uid('i'), name: label || 'custom', targetType: tt, group, dept: d, ...(v && { variant: v }), version: nextVersion(db, slot), active: false, status: 'draft', categories: {}, items: [] };
      db.instruments.push(i);
      return { id: i.id };
    },
  },
  /** FR4: copy a tool into a draft. People keep answering the current version until HR uses the draft. */
  reviseForm: {
    roles: HR,
    run(db, { instrumentId }) {
      const old = instrument(db, instrumentId);
      if (toolStatus(old) !== 'in-use') fail('Only the version in use can be changed this way.', 409);
      noSecondDraft(db, old);
      const i = { ...clone(old), id: uid('i'), version: nextVersion(db, old), active: false, status: 'draft' };
      db.instruments.push(i);
      return { id: i.id, version: i.version };
    },
  },
  /**
   * Use a draft (or a scheduled version). If people in an open period already answered the version it replaces,
   * it waits for the next period, so nobody in the same period is rated on two different forms.
   */
  useForm: {
    roles: HR,
    run(db, { instrumentId }) {
      const i = instrument(db, instrumentId);
      if (!i.status) fail('This version is not a draft.', 409);
      checkTool(db, i);
      if (toolSwitchMixes(db, i)) {
        if (i.status === 'scheduled') fail('People are still answering the version before it. It starts when that period is closed and you create the next one.', 409);
        i.status = 'scheduled';
        return { id: i.id, version: i.version, scheduled: true };
      }
      putToolInUse(db, i);
      return { id: i.id, version: i.version, scheduled: false };
    },
  },
  unscheduleForm: {
    roles: HR,
    run(db, { instrumentId }) {
      const i = instrument(db, instrumentId);
      if (i.status !== 'scheduled') fail('This version is not waiting for the next period.', 409);
      i.status = 'draft';
    },
  },
  discardForm: {
    roles: HR,
    run(db, { instrumentId }) {
      const i = instrument(db, instrumentId);
      if (!i.status) fail('Only a draft can be discarded; versions that were in use are kept for the records.', 409);
      db.instruments = db.instruments.filter((x) => x.id !== i.id);
      dropOwnQuestions(db, i.items.map((it) => it.criterionId));
      return { discarded: `${toolName(db, i)} v${i.version}` };
    },
  },
  renameForm: {
    roles: HR,
    run(db, { instrumentId, name }) {
      const i = editableForm(db, instrumentId);
      if (i.name.includes(UB_FORM_MARK)) fail("UB's own tools keep their names.", 409);
      i.name = text(name, 'Tool name', 120).replace(UB_FORM_MARK, '').trim() || fail('Tool name is required.');
    },
  },
  /** Type a new indicator straight into a part. The same wording in the question bank is reused, so results can be compared. */
  addNewFormItem: {
    roles: HR,
    run(db, { instrumentId, text: t, category }) {
      const i = editableForm(db, instrumentId);
      const words = text(t, 'Indicator', 300);
      const part = category ? partName(category) : 'General';
      let c = sameWording(db, words);
      if (c && i.items.some((it) => it.criterionId === c.id)) fail('That indicator is already on this tool.', 409);
      if (!c) { c = { id: uid(OWN_QUESTION), text: words }; db.criteria.push(c); }
      i.items.push({ criterionId: c.id, weight: 1, ...(part !== 'General' && { category: part }) });
      return { criterionId: c.id };
    },
  },
  /** Reword an indicator on this tool only: a question other tools use, or that was already answered, stays as it is for them. */
  editFormItem: {
    roles: HR,
    run(db, { instrumentId, criterionId, text: t }) {
      const i = editableForm(db, instrumentId);
      const it = i.items.find((x) => x.criterionId === criterionId) || fail('That indicator is not on this tool.', 404);
      const words = text(t, 'Indicator', 300);
      const c = find(db.criteria, criterionId, 'Indicator');
      if (c.text === words) return { criterionId };
      if (i.items.some((x) => x !== it && db.criteria.find((y) => y.id === x.criterionId)?.text.trim().toLowerCase() === words.toLowerCase())) fail('That indicator is already on this tool.', 409);
      const shared = usedCriteria(db).has(c.id) || db.instruments.some((x) => x.id !== i.id && x.items.some((y) => y.criterionId === c.id));
      if (!shared && c.id.startsWith(`${OWN_QUESTION}_`)) { c.text = words; return { criterionId }; }
      const next = (!c.levels?.length && sameWording(db, words)) || { id: uid(OWN_QUESTION), text: words, ...(c.levels?.length && { levels: [...c.levels] }) };
      if (!db.criteria.includes(next)) db.criteria.push(next);
      it.criterionId = next.id;
      dropOwnQuestions(db, [c.id]);
      return { criterionId: next.id };
    },
  },
  /** Move an indicator up or down inside its part. */
  moveFormItem: {
    roles: HR,
    run(db, { instrumentId, criterionId, dir }) {
      const i = editableForm(db, instrumentId);
      const it = i.items.find((x) => x.criterionId === criterionId) || fail('That indicator is not on this tool.', 404);
      const part = toolParts(i).find((p) => p.items.includes(it)).items;
      const other = part[part.indexOf(it) + (dir === 'up' ? -1 : 1)];
      if (!other) return;
      const a = i.items.indexOf(it), b = i.items.indexOf(other);
      i.items[a] = other; i.items[b] = it;
    },
  },
  addFormPart: {
    roles: HR,
    run(db, { instrumentId, name }) {
      const i = editableForm(db, instrumentId);
      const n = partName(name);
      if (toolParts(i).some((p) => p.name.toLowerCase() === n.toLowerCase())) fail('This tool already has a part with that name.', 409);
      (i.categories ||= {})[n] = null;
    },
  },
  renameFormPart: {
    roles: HR,
    run(db, { instrumentId, from, to }) {
      const i = editableForm(db, instrumentId);
      const p = partOf(i, from), n = partName(to);
      if (n === p.name) return;
      if (toolParts(i).some((x) => x !== p && x.name !== p.name && x.name.toLowerCase() === n.toLowerCase())) fail('This tool already has a part with that name.', 409);
      for (const it of p.items) { if (n === 'General') delete it.category; else it.category = n; }
      i.categories = Object.fromEntries(Object.entries(i.categories || {}).map(([k, v]) => [k === p.name ? n : k, v]));
    },
  },
  /** Removes a part and its indicators. */
  removeFormPart: {
    roles: HR,
    run(db, { instrumentId, name }) {
      const i = editableForm(db, instrumentId);
      const p = partOf(i, name);
      const ids = p.items.map((it) => it.criterionId);
      i.items = i.items.filter((it) => !p.items.includes(it));
      delete i.categories?.[p.name];
      dropOwnQuestions(db, ids);
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
      const part = toolParts(i).find((p) => p.items.some((it) => it.criterionId === criterionId));
      i.items = i.items.filter((it) => it.criterionId !== criterionId);
      // removing a part's last indicator keeps the part (and its weight): HR sees that it is empty
      if (part?.items.length === 1) (i.categories ||= {})[part.name] = part.weight;
      dropOwnQuestions(db, [criterionId]);
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
      if (weight === null || weight === '') i.categories[c] = null;
      else i.categories[c] = number(weight, 'Category weight', 0, 100);
    },
  },

  /* ---------- HR: group weights ---------- */
  setGroupWeight: {
    roles: HR,
    run(db, { targetType: tt, group, weight }) {
      if (!(tt in db.rules) || !(group in db.rules[tt])) fail('Unknown evaluated role or evaluator group.');
      const af = activeFormula(db, tt);
      if (af) fail(`${TARGET_TYPES[tt]} is computed with the formula "${af.config.name}" version ${af.version}. Change it under Scoring & calculation (a new version needs approval).`, 409);
      const w = weight === null || weight === '' ? null : number(weight, 'Weight', 0, 100);
      const from = db.rules[tt][group];
      db.rules[tt][group] = w;
      // NFR8: closed periods keep the weights they were computed with; open ones follow the change
      for (const p of db.periods.filter((x) => x.status === 'open')) {
        p.rules ||= clone(db.rules);
        (p.rules[tt] ||= {})[group] = w;
      }
      return { from, to: w };
    },
  },

  /* ---------- Rating formula (dynamic computation engine) ---------- */
  // A formula version goes: draft (HR edits) → pending (submitted with the committee's basis) →
  // approved by a VP (or rejected, back to HR) → active (HR activates it; the old version is archived).
  // Approved versions never change: a change is always a new version. HR only encodes approved policy.
  saveFormulaDraft: {
    roles: HR,
    run(db, { id, targetType: tt, dept, config }, user) {
      db.formulas ||= [];
      const clean = cleanFormula(config, (db.evaluatorGroups || []).filter((g) => g.active !== false).map((g) => g.id));
      if (id) {
        const f = formulaRec(db, id);
        if (!['draft', 'rejected'].includes(f.status) || f.meta.follow) fail('Only a draft can be edited. Make a new version instead.', 409);
        f.config = clean; f.status = 'draft';
        logFormula(f, user, 'edited');
        return { id: f.id, version: f.version };
      }
      if (!Object.hasOwn(TARGET_TYPES, tt)) fail('Choose who is evaluated.');
      const d = dept ? find(db.departments, dept, 'Department').id : null;
      const key = formulaKey(tt, d);
      if (db.formulas.some((f) => f.key === key && ['draft', 'pending', 'rejected', 'approved', 'scheduled'].includes(f.status))) fail('This category already has a version in progress. Finish or delete it first.', 409);
      if (d) deptHasCategory(db, tt, d);
      const version = Math.max(0, ...db.formulas.filter((f) => f.key === key).map((f) => f.version)) + 1;
      const f = { id: uid('fx'), key, targetType: tt, dept: d, version, status: 'draft', config: clean, meta: { createdBy: user.name, createdAt: new Date().toISOString(), log: [] } };
      logFormula(f, user, 'created');
      db.formulas.push(f);
      return { id: f.id, version };
    },
  },
  /** A department gives up its own formula and follows all departments again. A VP approves it like any formula. */
  followAllDepartments: {
    roles: HR,
    run(db, { targetType: tt, dept, basis }, user) {
      const d = find(db.departments, dept, 'Department');
      if (!Object.hasOwn(TARGET_TYPES, tt)) fail('Choose who is evaluated.');
      const key = formulaKey(tt, d.id);
      if (!(db.formulas || []).some((f) => f.key === key && f.status === 'active')) fail(`${d.name} has no formula of its own for ${TARGET_TYPES[tt]}.`, 409);
      if (db.formulas.some((f) => f.key === key && ['draft', 'pending', 'rejected', 'approved', 'scheduled'].includes(f.status))) fail(`${d.name} already has a new formula in progress. Finish or discard it first.`, 409);
      const why = text(basis, 'Basis (committee decision or memo)', 300);
      if (why.length < 5) fail('Write the basis, e.g. "Evaluation Tool Committee resolution no. 3, s. 2026".');
      const all = activeFormula(db, tt, null);
      const config = clone(asPercentages(all ? all.config : defaultFormula(db.rules[tt] || {}, currentPolicy(db)))); // what it would use now, for the VP to see
      Object.assign(config, { name: `${TARGET_TYPES[tt]} – ${d.name}: follow all departments`, effectiveFrom: '', effectiveUntil: '' });
      const version = Math.max(0, ...db.formulas.filter((f) => f.key === key).map((f) => f.version)) + 1;
      const f = { id: uid('fx'), key, targetType: tt, dept: d.id, version, status: 'pending', config, meta: { follow: true, basis: why, createdBy: user.name, createdAt: new Date().toISOString(), submittedBy: user.name, submittedAt: new Date().toISOString(), log: [] } };
      logFormula(f, user, 'submitted for approval', why);
      db.formulas.push(f);
      for (const v of directors(db)) notify(db, { key: `fx|${f.id}|sub|${v.id}`, userId: v.id, kind: 'release', text: `A formula change is waiting for your approval: ${d.name} would follow the formula of all departments again for ${TARGET_TYPES[tt]}. Basis: ${why}.` });
      return { id: f.id, version };
    },
  },
  deleteFormulaDraft: {
    roles: HR,
    run(db, { id }, user) {
      const f = formulaRec(db, id);
      if (!['draft', 'rejected'].includes(f.status)) fail('Only drafts can be deleted; approved versions are kept for the records.', 409);
      db.formulas = db.formulas.filter((x) => x.id !== id);
      return { deleted: `${f.config.name} v${f.version}`, by: user.name };
    },
  },
  submitFormula: {
    roles: HR,
    run(db, { id, basis }, user) {
      const f = formulaRec(db, id);
      if (f.status !== 'draft') fail('Only a draft can be submitted.', 409);
      const errs = validateFormula(f.config, { allowedGroups: formGroups(db, f.targetType, { scheduled: true }), groupNames: Object.fromEntries((db.evaluatorGroups || []).map((g) => [g.id, g.name])) });
      if (errs.length) fail(`Fix the formula first: ${errs.join(' ')}`);
      const why = text(basis, 'Basis (committee decision or memo)', 300);
      if (why.length < 5) fail('Write the basis of this formula, e.g. "Evaluation Tool Committee resolution no. 3, s. 2026".');
      f.status = 'pending'; f.meta.basis = why; f.meta.submittedBy = user.name; f.meta.submittedAt = new Date().toISOString();
      logFormula(f, user, 'submitted for approval', why);
      for (const v of directors(db)) notify(db, { key: `fx|${f.id}|sub|${v.id}`, userId: v.id, kind: 'release', text: `A computation formula is waiting for your approval: ${f.config.name} (version ${f.version}). Basis: ${why}.` });
    },
  },
  approveFormula: {
    roles: DIR,
    run(db, { id, note }, user) {
      if (user.position !== 'vp') fail('Only the Vice Presidents approve formulas.', 403);
      const f = formulaRec(db, id);
      if (f.status !== 'pending') fail('This formula is not waiting for approval.', 409);
      f.status = 'approved'; f.meta.approvedBy = user.name; f.meta.approvedAt = new Date().toISOString();
      logFormula(f, user, 'approved', typeof note === 'string' ? note.slice(0, 300) : '');
      for (const h of hrUsers(db)) notify(db, { key: `fx|${f.id}|ok|${h.id}`, userId: h.id, kind: 'release', text: `${user.name} approved the formula ${f.config.name} (version ${f.version}). You can start using it under Scoring & calculation.` });
    },
  },
  rejectFormula: {
    roles: DIR,
    run(db, { id, reason }, user) {
      if (user.position !== 'vp') fail('Only the Vice Presidents review formulas.', 403);
      const f = formulaRec(db, id);
      if (f.status !== 'pending') fail('This formula is not waiting for approval.', 409);
      const why = text(reason, 'Reason', 500);
      f.status = 'rejected'; f.meta.rejectedBy = user.name; f.meta.rejectReason = why;
      logFormula(f, user, 'returned to HR', why);
      for (const h of hrUsers(db)) notify(db, { key: `fx|${f.id}|no|${Date.now()}|${h.id}`, userId: h.id, kind: 'release', text: `${user.name} returned the formula ${f.config.name} (version ${f.version}): "${why}".` });
    },
  },
  activateFormula: {
    roles: HR,
    // when: 'now' (open periods with no answers in this category and every new period), or
    // 'next' (scheduled: it starts when HR creates the next evaluation period; open periods keep theirs)
    run(db, { id, when = 'now' }, user) {
      const f = formulaRec(db, id);
      if (!['approved', 'scheduled'].includes(f.status)) fail('Only an approved formula can be activated.', 409);
      // a group whose tool is not in use would get no evaluations, so its percentage would never count
      const ready = formGroups(db, f.targetType, { scheduled: when === 'next' });
      const none = f.meta.follow ? [] : f.config.components.filter((c) => !ready.includes(c.group)).map((c) => groupName(db, c.group));
      if (none.length) fail(`No evaluation tool is in use yet for: ${none.join(', ')}. ${when === 'now' && none.length && f.config.components.every((c) => formGroups(db, f.targetType, { scheduled: true }).includes(c.group)) ? 'It starts with the next period, so choose "Start with the next period".' : 'Finish it under Evaluation tools first.'}`, 409);
      if (when === 'next') {
        if (f.status === 'scheduled') fail('This formula is already set to start with the next evaluation period.', 409);
        f.status = 'scheduled'; f.meta.scheduledBy = user.name; f.meta.scheduledAt = new Date().toISOString();
        logFormula(f, user, 'scheduled', 'starts with the next evaluation period');
        return { version: f.version, scheduled: true };
      }
      if (when !== 'now') fail('Choose when the formula starts.');
      const now = today();
      if (f.config.effectiveFrom && f.config.effectiveFrom > now) fail('This formula starts in the future. Schedule it to start with a period on or after its effective-from date.', 409);
      if (!formulaEffectiveOn(f, now)) fail('This formula is outside its effective dates.', 409);
      const snap = formulaSnapshot(f);
      const weights = putInUse(db, f, user);
      // open periods take the new version only while nobody in that category has been evaluated yet,
      // so results already collected are never computed differently without notice
      let applied = 0, kept = 0;
      for (const p of db.periods.filter((x) => x.status === 'open')) {
        const inCat = (t) => { const u = userById(db, t.targetId); const who = personIn(db, p.id, u); return who.type === f.targetType && (!f.dept || who.dept === f.dept); };
        if (db.tasks.some((t) => t.periodId === p.id && t.response && inCat(t))) { kept++; continue; }
        if (!formulaEffectiveOn(f, p.startDate || now)) { kept++; continue; }
        p.formulas = { ...(p.formulas || {}), [f.key]: snap };
        if (f.meta.follow) delete p.formulas[f.key];
        if (!f.dept) { p.rules ||= clone(db.rules); p.rules[f.targetType] = clone(weights); }
        applied++;
      }
      return { version: f.version, applied, kept };
    },
  },

  /* ---------- HR: evaluation policy (threshold, rating bands, rounding, approvals) ---------- */
  /**
   * Save a new policy version. A reason is required, every version is kept, and a period keeps the version it has
   * once it is closed or somebody answered in it.
   */
  setPolicy: {
    roles: HR,
    run(db, { policy: p = {}, reason }, user) {
      const why = text(reason, 'Reason for the change', 500);
      if (why.length < 5) fail('Write a short reason for the change (for example, "HRMC memo of 2026-11-20").');
      const bands = Array.isArray(p.bands) ? p.bands.map((b, i) => number(b, ['Outstanding', 'Satisfactory', 'Fair'][i] + ' starts at', 1, 4)) : fail('Enter the rating bands.');
      if (bands.length !== 3 || !(bands[0] > bands[1] && bands[1] > bands[2])) fail('The rating bands must go down: Outstanding > Satisfactory > Fair.');
      const next = {
        participationRule: ['more', 'atleast', 'none'].includes(p.participationRule) ? p.participationRule : fail('Choose when a class counts.'),
        participationPercent: number(p.participationPercent, 'Participation %', 1, p.participationRule === 'more' ? 99 : 100),
        participationMin: Math.round(number(p.participationMin ?? 1, 'Minimum number of answers', 1, 50)),
        bands,
        lowItem: number(p.lowItem, 'Low item cutoff', 1, 4),
        decimals: number(p.decimals, 'Decimal places', 0, 4),
        missingGroup: ['reweight', 'incomplete'].includes(p.missingGroup) ? p.missingGroup : fail('Choose what happens when an evaluator group is missing.'),
        minAnonymity: number(p.minAnonymity, 'Minimum students for comments', 0, 50),
        autoRelease: p.autoRelease === true,
        approvalMode: ['all', 'any', 'count'].includes(p.approvalMode) ? p.approvalMode : fail('Choose how many VPs must approve.'),
        approvalCount: number(p.approvalCount ?? 1, 'Number of VPs', 1, 20),
      };
      const before = currentPolicy(db);
      const changed = Object.keys(next).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(before[k])); // (the version number itself is not a rule)
      if (!changed.length) fail('Nothing was changed.', 409);
      // closed periods without their own copy keep the rules they were evaluated under
      for (const per of db.periods) if (per.status !== 'open' && !per.policy) per.policy = before;
      db.policies ||= [];
      const version = (db.policies.at(-1)?.version || 0) + 1;
      db.policies.push({ version, policy: next, at: new Date().toISOString(), byId: user.id, byName: user.name, reason: why });
      // an open period somebody already answered in keeps its rules; the change starts with the next period
      let applied = 0, kept = 0;
      for (const per of db.periods.filter((x) => x.status === 'open')) {
        if (db.tasks.some((t) => t.periodId === per.id && t.response)) { per.policy ||= before; kept++; } else { per.policy = { ...clone(next), version }; applied++; }
      }
      return { version, applied, kept, changed: changed.map((k) => ({ field: k, from: before[k], to: next[k] })) };
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
      const d = { id: uid('d'), name: n, kind: Object.hasOwn(DEPT_KINDS, kind) ? kind : 'college' };
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
      if (kind !== undefined && kind !== d.kind) {
        if (evaluatedNow(db, db.users.filter((u) => u.dept === d.id).map((u) => u.id))) fail('People in this department were already evaluated in an open period, so its type can\'t change until it is closed.', 409);
        if (!Object.hasOwn(DEPT_KINDS, kind)) fail('Choose the type of department.');
        if (kind === 'office' && (db.users.some((u) => u.dept === d.id && u.role !== 'NTP') || db.sections.some((s) => s.dept === d.id))) fail(`${d.name} has students, teachers or classes, so it can't be an office.`, 409);
        d.kind = kind;
      }
    },
  },
  deleteDepartment: {
    roles: HR,
    run(db, { deptId }) {
      const d = find(db.departments, deptId, 'Department');
      const keep = deptKeep(db, d.id); // (a period made for it must keep naming it: an empty list means all departments)
      if (keep.length) fail(`${d.name} can't be deleted: it is still used by ${keep.join(', ')}. Move its people, or deactivate it instead.`, 409);
      db.departments = db.departments.filter((x) => x.id !== d.id);
    },
  },
  /** A deactivated department is not offered any more; its old records stay. */
  setDepartmentActive: {
    roles: HR,
    run(db, { deptId, active }) {
      const d = find(db.departments, deptId, 'Department');
      if (active === true) { delete d.active; return; }
      const n = db.users.filter((u) => u.dept === d.id && u.active !== false).length;
      if (n) fail(`${n} active account(s) still belong to ${d.name}. Move or deactivate them first.`, 409);
      d.active = false;
    },
  },
  /** Move every account and class of a department to another one (between periods). Closed periods keep the old department. */
  moveDepartment: {
    roles: HR,
    run(db, { from, to }) {
      const a = find(db.departments, from, 'Department'), b = find(db.departments, to, 'Department');
      if (a.id === b.id) fail('Choose another department.');
      if (b.active === false) fail(`${b.name} is deactivated.`, 409);
      const people = db.users.filter((u) => u.dept === a.id), ids = new Set(people.map((u) => u.id));
      const open = new Set(db.periods.filter((p) => p.status === 'open').map((p) => p.id));
      if (db.tasks.some((t) => open.has(t.periodId) && ids.has(t.targetId))) fail(`People in ${a.name} have evaluations in an open period. Move them after it is closed.`, 409);
      if (b.kind === 'office' && people.some((u) => u.role !== 'NTP')) fail(`${b.name} is an office, but ${a.name} has students or teachers.`, 409);
      if (people.some((u) => u.position === 'ci') && !isNursingDept(b)) fail('Clinical Instructors work only in a Nursing department.', 409);
      let classes = 0;
      for (const u of people) u.dept = b.id;
      for (const s of db.sections) if (s.dept === a.id && !isPastClass(db, s)) { s.dept = b.id; classes++; }
      return { people: people.length, classes, from: a.name, to: b.name };
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
      db.instruments = db.instruments.filter((i) => (!i.dept || db.departments.some((d) => d.id === i.dept)) && (i.active !== false || i.status));
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
  // before → after values, so every rule change can be traced
  if (name === 'setPolicy' && result?.changed) return `policy version ${result.version}: ${result.changed.map((c) => `${c.field} ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`).join('; ')} · reason: ${args.reason}${result.kept ? ' · open periods with answers keep their rules; it starts with the next period' : ''}`;
  if (name === 'importStaff') return result?.preview ? `checked a staff list (not saved): ${result.rows} rows, ${result.errorCount} error(s)` : `imported a staff list: ${result?.created} account(s), ${result?.errorCount} row(s) skipped`;
  if (name === 'setStudentDepts') return `department of ${result?.confirmed} student(s) confirmed, ${result?.moved} moved`;
  if (name === 'applyClassTypes') return `${result?.changed} class(es) got the type their subject suggests`;
  if (name === 'setPeriodDeadline') return `period: ${periodById(db, args.periodId)?.name} · deadline ${result?.from} → ${result?.to}`;
  if (name === 'moveDepartment') return `${result?.people} account(s) and ${result?.classes} class(es): ${result?.from} → ${result?.to}`;
  if (name === 'setDepartmentActive') return `${db.departments.find((d) => d.id === args.deptId)?.name}: ${args.active ? 'reactivated' : 'deactivated'}`;
  if (['updateEvaluatorGroup', 'deleteEvaluatorGroup', 'restoreEvaluatorGroup'].includes(name)) return `evaluator group: ${result?.name}${result?.archived ? ' (archived)' : ''}`;
  if (name === 'followAllDepartments') return `${TARGET_TYPES[args.targetType]}: ${deptName(db, args.dept)} would follow all departments again · basis: ${args.basis}`;
  if (name === 'addGroupWithFormula') return `${TARGET_TYPES[args.targetType]} ← ${result?.name} (formula draft v${result?.version})`;
  if (name === 'discardForm') return `discarded: ${result?.discarded}`;
  if (name === 'useForm') { const i = db.instruments.find((x) => x.id === args.instrumentId); return `tool: ${i ? toolName(db, i) : ''} v${result?.version} · ${result?.scheduled ? 'starts with the next evaluation period' : 'in use'}`; }
  if (/Formula/.test(name)) { const f = (db.formulas || []).find((x) => x.id === (args.id || result?.id)); const tag = f ? `formula: ${f.config.name} v${f.version} (${TARGET_TYPES[f.targetType]}${f.dept ? ', ' + f.dept : ''}) · algorithm: ${methodOf(f.config.method, f.config.methodVersion ?? 1)?.label || f.config.method} v${f.config.methodVersion ?? 1} · status: ${f.status}` : (result?.deleted ? `formula: ${result.deleted}` : 'formula'); return [tag, args.basis && `basis: ${args.basis}`, args.reason && `reason: ${args.reason}`, result?.applied != null && `applied to ${result.applied} open period(s), ${result.kept} kept the previous version`, result?.scheduled && 'starts with the next evaluation period'].filter(Boolean).join(' · '); }
  if (name === 'createPeriod' && result?.started?.length) return `name: ${args.name} · formula(s) started with this period: ${result.started.join(', ')}`;
  if (/Plan$/.test(name)) { const pl = (db.plans || []).find((x) => x.id === (args.id || result?.id)); const per = pl && periodById(db, pl.periodId); return pl ? [`development plan for ${userById(db, pl.targetId)?.name} (${per?.name})`, `status: ${pl.status}${pl.outcome ? ` (${pl.outcome})` : ''}`, name !== 'acknowledgePlan' && pl.areas.length && `areas: ${pl.areas.join(', ')}`, name !== 'acknowledgePlan' && `review by ${pl.reviewBy}`].filter(Boolean).join(' · ') : 'development plan'; }
  if (name === 'returnToHR') { const per = periodById(db, args.periodId); return `period: ${per?.name} · returned to HR · reason: ${args.reason}`; }
  const parts = [];
  const a = args || {};
  const p = a.periodId && periodById(db, a.periodId);
  if (p) parts.push(`period: ${p.name}`);
  for (const k of ['userId', 'targetId', 'evaluatorId']) { const u = a[k] && userById(db, a[k]); if (u) parts.push(`${k.replace('Id', '')}: ${u.name}`); }
  if (a.instrumentId) { const i = db.instruments.find((x) => x.id === a.instrumentId); if (i) parts.push(`form: ${TARGET_TYPES[i.targetType]} ← ${groupName(db, i.group)} v${i.version || 1}`); }
  if (a.targetType && a.group) parts.push(`${TARGET_TYPES[a.targetType] || a.targetType} ← ${groupName(db, a.group)}`);
  if ('weight' in a) parts.push(result && 'from' in result ? `weight: ${result.from ?? 'blank'} → ${result.to ?? 'blank'}` : `weight: ${a.weight ?? 'blank'}`);
  if (a.taskId) { const t = db.tasks.find((x) => x.id === a.taskId); const tg = t && userById(db, t.targetId); if (tg) parts.push(`evaluation of ${tg.name}`); }
  if (a.office) parts.push(`requested by: ${a.office}`);
  if (a.name && name !== 'changePassword') parts.push(`name: ${a.name}`);
  if (a.code) parts.push(`section: ${a.code}`);
  if (result?.stage) parts.push(`now: ${result.stage}`);
  if (typeof result?.added === 'number') parts.push(`${result.added} added`);
  if (name === 'importClassList' && result) parts.push(result.preview ? `checked a class list (not saved): ${result.rows} rows, ${result.errorCount} error(s), ${result.duplicates} duplicate(s)` : `imported a class list (${termLabel(result.term)}): ${result.created} class(es), ${result.accounts} new student(s), ${result.enrolled} enrolment(s), ${a.drop ? result.droppedCount : 0} dropped, ${result.errorCount} row(s) skipped`);
  return parts.join(' · ');
}
