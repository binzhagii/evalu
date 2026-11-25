// Core rules of evalU, taken from the thesis manuscript (Chapter 3, Tables 6, 8 and 9).
// Shared by the server (server/*.js) and the browser pages.
//
// - FR11  a class counts only if enough of it answered: more than 50% to start with (50 students -> 26); HR can change or remove the rule
// - FR13  qualifying subjects and several program chairs are averaged; an evaluator group with no
//         valid result is removed from the denominator (no dean -> computed over 60%); 2 decimals
// - Table 6  College faculty 40/40/20, Basic Education 40/20/20/20, Non-teaching: head <-> staff
// - Clinical Instructors (CIs, allied medical programs): evaluated by their students and the dean;
//            HR confirmed the same weights as college faculty: Students 40, Dean 40, Program Chair 20 (form B2)
// - FR17  release order: HR -> VPs (review and approve) -> individual faculty
// Anything the manuscript does not give (e.g. weights for evaluating Deans) stays blank (null)
// until HR enters it; no score is invented.

export const LOW_ITEM = 3.0;            // FR19: items averaging below "Satisfactory" (UB's 4-point scale) are flagged
export { MAX_RATING, SCALES, CLASS_TYPES } from './ubForms.js';
export { cronbachAlpha, alphaLabel, confidenceLabel } from './stats.js';
import { MAX_RATING, SCALES } from './ubForms.js';
import { defaultFormula, computeFinal, methodOf } from './formula.js';
import { sampleStats, averageOfAverages, combinedMargin, confidenceLabel } from './stats.js';
export { METHODS, AGGREGATIONS, MISSING_RULES, ROUNDING_METHODS, roundBy, parseExpression, validateFormula, computeFinal, defaultFormula, asPercentages, formulaText, formulaWords, howInWords, methodOf, methodList } from './formula.js';

/* ---------- evaluation policy (HR changes it without a programmer; each period keeps the version it used) ---------- */
/**
 * The rules that turn answers into ratings. The defaults are UB's current practice (HRMC comprehensive
 * report and the interview); HR can change them under "Policy & rules". Every change becomes a new
 * version with a reason, so a closed period is always computed with the rules it was evaluated under.
 */
export const DEFAULT_POLICY = Object.freeze({
  participationRule: 'more', // FR11: a class counts when 'more' than / 'atleast' this % of the class answered, or 'none' (no rule)
  participationPercent: 50,  // "more than 50%" is UB's "half of the class plus one" (the same number for every class size)
  participationMin: 1,       // with no rule: the answers a class needs at least
  bands: [3.51, 3.0, 2.5],    // lowest score for Outstanding / Satisfactory / Fair; below = Poor
  lowItem: 3.0,               // FR19: items averaging below this are flagged
  decimals: 2,                // FR13: final ratings are rounded to this many decimals
  missingGroup: 'reweight',   // FR13: a group with no valid result: 'reweight' (remove it from the denominator) or 'incomplete' (no final rating)
  minAnonymity: 2,            // students' comments are shown only when at least this many students of that teacher answered
  approvalMode: 'all',        // FR17: 'all' VPs must approve, 'any' one VP is enough, or 'count' = at least approvalCount
  approvalCount: 1,
  autoRelease: false,         // release to faculty by itself once enough VPs approved (off: HR releases)
});
/** A saved policy with every field; the "plus one" of earlier versions is read as "more than". */
export function fullPolicy(saved) {
  const p = { ...DEFAULT_POLICY, ...(saved || {}) };
  if (saved && !saved.participationRule && 'participationPlusOne' in saved) p.participationRule = saved.participationPlusOne === false ? 'atleast' : 'more';
  delete p.participationPlusOne;
  return p;
}
/** The policy in force now (the newest version HR saved). */
export const currentPolicy = (db) => ({ ...fullPolicy(db?.policies?.at(-1)?.policy), version: db?.policies?.at(-1)?.version || 0 });
/** The policy of a period: the version it was created/closed with (NFR8), else the current one. */
export const policyFor = (db, periodId) => {
  const p = periodId && db?.periods?.find((x) => x.id === periodId);
  return p?.policy ? fullPolicy(p.policy) : currentPolicy(db);
};
/** Round to the policy's number of decimals (2 by default). */
export const roundTo = (x, d = 2) => (x == null ? null : Math.round((x + Number.EPSILON) * 10 ** d) / 10 ** d);

/** UB's rating interpretation (HRMC comprehensive report): 3.51-4.00, 3.00-3.50, 2.50-2.99, 2.49 and below (by default). */
export function interpretation(score, nonTeaching = false, policy = DEFAULT_POLICY) {
  if (score == null) return '';
  const [o, s2, f] = policy.bands || DEFAULT_POLICY.bands;
  const s = roundTo(score, policy.decimals ?? 2);
  const words = nonTeaching ? ['Excellent', 'Good', 'Fair', 'Poor'] : ['Outstanding', 'Satisfactory', 'Fair', 'Poor'];
  return s >= o ? words[0] : s >= s2 ? words[1] : s >= f ? words[2] : words[3];
}
/** The interpretation table printed on reports, from the policy's bands: [['3.51 - 4.00', 0], …]. */
export function bandTable(policy = DEFAULT_POLICY) {
  const [o, s, f] = policy.bands || DEFAULT_POLICY.bands;
  const d = policy.decimals ?? 2;
  const below = (x) => (x - 1 / 10 ** d).toFixed(d);
  return [[`${o.toFixed(d)} - 4.00`, 0], [`${s.toFixed(d)} - ${below(o)}`, 1], [`${f.toFixed(d)} - ${below(s)}`, 2], [`${below(f)} and below`, 3]];
}
export const INTERPRETATION_TABLE = bandTable(DEFAULT_POLICY);
/** The words for each rating (1..4) on a form: the item's own levels if it has them, else the form's scale. */
export const scaleOf = (ins) => SCALES[ins && String(ins.targetType).startsWith('NTP') ? 'perf' : 'demo'];
export const ratingWords = (ins, criterion) => (criterion?.levels?.length === MAX_RATING ? criterion.levels : scaleOf(ins));
export const REMIND_DAYS = 7;           // FR10: automatic reminders start this many days before the deadline
export const INSTITUTION_DOMAIN = 'ubaguio.edu';

/** FR1: only official UB addresses (…@ubaguio.edu, including …@s.ubaguio.edu for students). */
export const isInstitutionalEmail = (e) =>
  typeof e === 'string' && /^[a-z0-9._%+-]+@([a-z0-9-]+\.)*ubaguio\.edu$/i.test(e.trim());

/* ---------- FR11: the participation rule in words, so every screen says what HR set ---------- */
export const PARTICIPATION_RULES = { more: 'More than', atleast: 'At least', none: 'No participation rule' };
/** Is there a participation rule (a share of the class that must answer)? */
export const hasRule = (policy) => policy?.participationRule !== 'none';
/** "more than 50% of the class", "at least 60% of the class", "at least 3 students". */
export function ruleWords(policy = DEFAULT_POLICY) {
  if (hasRule(policy)) return `${policy.participationRule === 'atleast' ? 'at least' : 'more than'} ${policy.participationPercent ?? 50}% of the class`;
  const n = Math.max(1, Number(policy.participationMin) || 1);
  return n === 1 ? 'at least one student' : `at least ${n} students`;
}
/** Where the rule's line is drawn on a progress bar (nothing when there is no rule). */
export const ruleMark = (policy) => (hasRule(policy) ? Math.min(1, (policy.participationPercent ?? 50) / 100) : undefined);

/** FR11: responses needed for a class to count (the policy's participation rule). */
export function neededResponses(enrolled, policy = DEFAULT_POLICY) {
  if (!enrolled) return 0;
  const share = (enrolled * Number(policy.participationPercent ?? 50)) / 100;
  const n = !hasRule(policy) ? Math.round(Number(policy.participationMin) || 1)
    : (policy.participationRule ?? (policy.participationPlusOne === false ? 'atleast' : 'more')) === 'atleast' ? Math.ceil(share - 1e-9) : Math.floor(share + 1e-9) + 1;
  return Math.min(enrolled, Math.max(1, n));
}

/** FR6: internship, practicum and field trip subjects are not evaluated. */
export const EXEMPT_SUBJECT = /\b(intern(ship)?s?|practicum|ojt|field ?trips?)\b/i;
export const isExemptSection = (s) => EXEMPT_SUBJECT.test(`${s.subject} ${s.code}`);

/**
 * The departments of the University of Baguio. HR can rename, add or remove departments later
 * (Accounts → Departments). "kind" decides the weights: college or basic (Basic Education).
 */
export const UB_DEPARTMENTS = [
  { id: 'SBAA', name: 'School of Business Administration & Accountancy (SBAA)', kind: 'college' },
  { id: 'SCJPS', name: 'School of Criminal Justice & Public Safety (SCJPS)', kind: 'college' },
  { id: 'SOD', name: 'School of Dentistry (SOD)', kind: 'college' },
  { id: 'SEA', name: 'School of Engineering & Architecture (SEA)', kind: 'college' },
  { id: 'SIT', name: 'School of Information Technology (SIT)', kind: 'college' },
  { id: 'SIHTM', name: 'School of International Hospitality & Tourism Management (SIHTM)', kind: 'college' },
  { id: 'SOL', name: 'School of Law (SOL)', kind: 'college' },
  { id: 'SNS', name: 'School of Natural Sciences (SNS)', kind: 'college' },
  { id: 'SON', name: 'School of Nursing (SON)', kind: 'college' },
  { id: 'STELA', name: 'School of Teacher Education & Liberal Arts (STELA)', kind: 'college' },
  { id: 'GS', name: 'Graduate School', kind: 'college' },
  { id: 'BE', name: 'Basic Education', kind: 'basic' },
];
/** The type of a department: schools have classes; an office has a head and staff who evaluate each other. */
export const DEPT_KINDS = { college: 'College', basic: 'Basic Education', office: 'Office' };
export const activeDepts = (db) => db.departments.filter((d) => d.active !== false);
/** Departments with classes, teachers and students. */
export const schoolDepts = (db) => activeDepts(db).filter((d) => d.kind !== 'office');
export const officeDepts = (db) => activeDepts(db).filter((d) => d.kind === 'office');
/** What is missing in a department, so nobody is left without an evaluation unnoticed. */
export function deptWarnings(db, d) {
  const here = db.users.filter((u) => u.active !== false && u.dept === d.id);
  const has = (...positions) => here.some((u) => positions.includes(u.position));
  if (d.kind === 'office') return !here.length ? [] : !has('head') ? ['No office head: its staff get no evaluation.'] : !has('staff', 'secretary') ? ['No staff: the office head gets no evaluation.'] : [];
  if (!has('faculty', 'ci')) return [];
  return d.kind === 'basic' ? (has('principal') ? [] : ['No principal.']) : has('dean') ? [] : ['No dean.'];
}
/** Why a department can't be deleted (empty = it can): what still uses it. */
export function deptKeep(db, id) {
  const out = [];
  if (db.users.some((u) => u.dept === id)) out.push('people');
  if (db.sections.some((s) => s.dept === id)) out.push('classes');
  if (db.instruments.some((i) => i.dept === id)) out.push('evaluation tools');
  if ((db.formulas || []).some((f) => f.dept === id)) out.push('a formula');
  if (db.periods.some((p) => p.depts?.includes(id))) out.push('an evaluation period for it');
  if (db.periods.some((p) => Object.values(p.people || {}).some((x) => x.dept === id))) out.push('old results');
  return out;
}
/** The UB departments that are not in the system yet (matched by id or name). */
export const missingUbDepartments = (db) =>
  UB_DEPARTMENTS.filter((d) => !db.departments.some((x) => x.id === d.id || x.name.toLowerCase() === d.name.toLowerCase()));

export const ROLES = {
  ST: 'Student',
  TP: 'Teaching Personnel',
  NTP: 'Non-Teaching Personnel',
  HR: 'HR Specialist',
  DIR: 'Vice President',
};

// Positions allowed for each role (used when HR creates or edits an account).
export const POSITIONS = {
  ST: { student: 'Student' },
  TP: { faculty: 'Faculty', ci: 'Clinical Instructor (CI)', dean: 'Dean', chair: 'Program Chair', principal: 'Principal', aprincipal: 'Assistant Principal', shead: 'Subject Head' },
  NTP: { secretary: 'Secretary', staff: 'Staff', head: 'Office Head' },
  HR: { hr: 'HR Specialist', assistant: 'HRMC Assistant' },
  DIR: { vp: 'Vice President' },
};
/** Roles that belong to a department. */
export const needsDept = (role) => role === 'ST' || role === 'TP' || role === 'NTP';
/** Clinical Instructors are only in the School of Nursing (their students are Nursing students). */
export const isNursingDept = (d) => !!d && (d.id === 'SON' || /nursing/i.test(d.name));
export const nursingDepts = (db) => db.departments.filter(isNursingDept);
/** Someone who teaches classes: faculty and Clinical Instructors. */
export const isTeacher = (u) => !!u && u.role === 'TP' && (u.position === 'faculty' || u.position === 'ci');

export const GROUPS = {
  ST: 'Students',
  DEAN: 'Dean',
  CHAIR: 'Program Chair',
  SEC: 'Secretary',
  FAC: 'Faculty',
  PRIN: 'Principal',
  APRIN: 'Assistant Principal',
  SHEAD: 'Subject Head',
  NTPHEAD: 'Office Head',
  NTPSTAFF: 'Office Staff',
};
export const DEFAULT_EVALUATOR_GROUPS = Object.entries(GROUPS).map(([id, name]) => ({ id, name, builtIn: true, active: true }));
export const groupName = (db, id) => db?.evaluatorGroups?.find((g) => g.id === id)?.name || GROUPS[id] || id;

export const TARGET_TYPES = {
  COLLEGE_FACULTY: 'College faculty',
  BASICED_TEACHER: 'Basic Ed teacher',
  CI: 'Clinical Instructor (CI)',
  DEAN: 'Dean',
  NTP_STAFF: 'Non-teaching staff',
  NTP_HEAD: 'Non-teaching office head',
};

export const STAGES = ['hr', 'dir', 'faculty'];
export const STAGE_LABEL = {
  hr: 'HR Specialist only',
  dir: 'With the VPs for review and approval',
  faculty: 'Released to individual faculty',
};

/** The built-in group memberships used by accounts created before HR-managed memberships existed. */
export function defaultEvaluatorGroups(role, position) {
  if (role === 'ST') return ['ST'];
  if (role === 'NTP') return { secretary: ['SEC', 'NTPSTAFF'], staff: ['NTPSTAFF'], head: ['NTPHEAD'] }[position] || [];
  if (role === 'TP') {
    const g = { dean: 'DEAN', chair: 'CHAIR', principal: 'PRIN', aprincipal: 'APRIN', shead: 'SHEAD', faculty: 'FAC' }[position];
    return g ? [g] : [];
  }
  return [];
}
/** Every evaluation group assigned to a person; system account roles remain separate. */
export function evaluatorGroups(u) {
  if (!u) return [];
  if (u.role === 'ST') return ['ST'];
  if (Array.isArray(u.evaluatorGroupIds)) return [...new Set(u.evaluatorGroupIds)];
  return defaultEvaluatorGroups(u.role, u.position);
}
export const evaluatorGroup = (u) => evaluatorGroups(u)[0] || null;
/**
 * Every evaluator group a person belongs to: their own, plus the groups HR set up as "everyone with this
 * position" (so a teacher imported later joins by themselves).
 */
export function groupsOf(db, u) {
  const own = evaluatorGroups(u);
  if (!u || u.role === 'ST') return own;
  const byPosition = (db?.evaluatorGroups || []).filter((g) => g.active !== false && g.positions?.includes(u.position)).map((g) => g.id);
  return byPosition.length ? [...new Set([...own, ...byPosition])] : own;
}

export function targetType(db, u) {
  if (!u) return null;
  if (u.role === 'TP') {
    if (u.position === 'dean') return 'DEAN';
    if (u.position === 'ci') return 'CI';
    if (u.position === 'faculty') {
      const d = db.departments.find((x) => x.id === u.dept);
      return d?.kind === 'basic' ? 'BASICED_TEACHER' : 'COLLEGE_FACULTY';
    }
    return null;
  }
  if (u.role === 'NTP') return u.position === 'head' ? 'NTP_HEAD' : 'NTP_STAFF';
  return null;
}
/**
 * A person's category and department in a period: { type, dept }. A closed period remembers them (period.people, set
 * when it is closed), so moving or promoting somebody later never changes a rating they already have.
 */
export function personIn(db, periodId, u) {
  const kept = periodId && u && periodById(db, periodId)?.people?.[u.id];
  return kept || { type: targetType(db, u), dept: u?.dept ?? null };
}
/** People who get evaluation results of their own (faculty, Clinical Instructors, deans, non-teaching personnel). */
export const isEvaluatee = (u) => (u.role === 'TP' && ['faculty', 'ci', 'dean'].includes(u.position)) || u.role === 'NTP';

export const userById = (db, id) => db.users.find((u) => u.id === id);
export const deptName = (db, id) => db.departments.find((d) => d.id === id)?.name || id;
/** The school year starts mid-year: from June on it is "this year – next year". */
export const schoolYearNow = (d = new Date()) => (d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1);
export const SEMESTERS = ['1st Semester', '2nd Semester']; // no summer evaluation
/** The name of a period: "AY 2026-2027 1st Semester". */
export const periodName = (year, sem) => `AY ${year}-${Number(year) + 1} ${SEMESTERS[sem - 1]}`;
/** "AY 2026-27 Term 1" or "AY 2026-2027 1st Semester" → { year: 2026, sem: 1 }; sem 3 = an old summer period; null = another kind of name. */
export function semesterOf(name = '') {
  const y = name.match(/(\d{4})\s*-\s*\d{2,4}/);
  const sem = /summer/i.test(name) ? 3 : /term\s*2|2nd|second/i.test(name) ? 2 : /term\s*1|1st|first/i.test(name) ? 1 : 0;
  return y && sem ? { year: Number(y[1]), sem } : null;
}
/* ---------- a class belongs to a semester: its term, "2026-1" (none = classes from before, used in any period) ---------- */
export const termOf = (name) => { const k = semesterOf(name); return k ? `${k.year}-${k.sem}` : null; };
export const termLabel = (t) => { if (!t) return 'No semester'; const [y, s] = t.split('-').map(Number); return s === 3 ? `AY ${y}-${y + 1} Summer` : periodName(y, s); };
export const nextTermOf = (t) => { const [y, s] = t.split('-').map(Number); return s === 1 ? `${y}-2` : `${y + 1}-1`; };
/** The semester going on: of the newest open period, else of the newest period, else the 1st semester of this school year. */
export function currentTerm(db) {
  const list = [...db.periods].reverse();
  const p = list.find((x) => x.status === 'open' && termOf(x.name)) || list.find((x) => termOf(x.name));
  return p ? termOf(p.name) : `${schoolYearNow()}-1`;
}
/** The semester HR prepares classes for: the open period's, else the one after the newest period. */
export function workingTerm(db) {
  const open = [...db.periods].reverse().find((x) => x.status === 'open' && termOf(x.name));
  if (open) return termOf(open.name);
  return db.periods.some((p) => termOf(p.name)) ? nextTermOf(currentTerm(db)) : currentTerm(db);
}
/** Is this class evaluated in this period? (a period with another kind of name takes every class) */
export const inTerm = (p, s) => { const t = p && termOf(p.name); return !t || !s.term || s.term === t; };
/** A class of a semester that is over: it is kept for the records and does not hold anything up. */
export const isPastClass = (db, s) => !!s.term && s.term < currentTerm(db);
/**
 * Students whose department was taken from their teacher, but who do not have most of their classes there (for example
 * they first appeared in a general education class of another school): [{ user, count: { dept: classes }, suggest }].
 */
export function deptsToConfirm(db) {
  const guess = new Map(db.users.filter((u) => u.role === 'ST' && u.active !== false && u.deptGuess).map((u) => [u.id, { user: u, count: {} }]));
  if (!guess.size) return [];
  for (const s of db.sections) if (!isPastClass(db, s)) for (const id of s.studentIds) { const c = guess.get(id)?.count; if (c) c[s.dept] = (c[s.dept] || 0) + 1; }
  const out = [];
  for (const { user, count } of guess.values()) {
    const top = Object.entries(count).sort((a, b) => b[1] - a[1]);
    const others = top.filter(([d]) => d !== user.dept);
    if (others.length && others[0][1] >= (count[user.dept] || 0)) out.push({ user, count, suggest: others[0][1] > (count[user.dept] || 0) ? others[0][0] : user.dept });
  }
  return out;
}
/** A type of class the subject suggests ('lab', 'skills', 'clin-…'), or null. Only for a class HR left as lecture. */
export function suggestClassType(db, s) {
  if (s.classType || isExemptSection(s)) return null;
  const t = `${s.subject} ${s.code}`.toLowerCase(), teacher = db.users.find((u) => u.id === s.facultyId);
  if (teacher?.position === 'ci') return /skills?\s*lab|skills laboratory/.test(t) ? 'skills' : null;
  const d = db.departments.find((x) => x.id === s.dept)?.name.toLowerCase() || '';
  if (/clinic|infirmary/.test(t)) return /dent/.test(d) ? 'clin-dent' : /physical therapy|\bpt\b/.test(`${d} ${t}`) ? 'clin-pt' : /med(ical)?\s*tech|\bmls\b/.test(`${d} ${t}`) ? 'clin-mt' : null;
  return /\blab(oratory)?\b/.test(t) ? 'lab' : null;
}
/** A period of the same school year and semester that already covers one of these departments (none chosen = all). */
export function samePeriod(db, name, depts = []) {
  const k = semesterOf(name);
  return k ? db.periods.find((p) => { const x = semesterOf(p.name); return x && x.year === k.year && x.sem === k.sem && (!depts?.length || !p.depts?.length || p.depts.some((d) => depts.includes(d))); }) || null : null;
}
export const periodById = (db, id) => db.periods.find((p) => p.id === id);
const active = (u) => u && u.active !== false;

/** Department heads alerted about progress (deans, program chairs, principals). */
export const deptHeads = (db, dept) =>
  db.users.filter((u) => active(u) && u.dept === dept && u.role === 'TP' && ['dean', 'chair', 'principal', 'aprincipal'].includes(u.position));
/** FR16/FR18: who receives department results: the dean (college) or principal (Basic Ed). */
export const isResultHead = (u) => u.role === 'TP' && (u.position === 'dean' || u.position === 'principal');
export const resultHeads = (db, dept) => db.users.filter((u) => active(u) && u.dept === dept && isResultHead(u));
export const hrUsers = (db) => db.users.filter((u) => active(u) && u.role === 'HR');
/** FR17: only the Vice Presidents approve results (UB has no Director step). */
export const directors = (db) => db.users.filter((u) => active(u) && u.role === 'DIR' && u.position === 'vp');

/* ---------- forms (FR3, FR4) ---------- */
/**
 * The form in use for a pairing. Most specific first: for this type of class and department, for this
 * type of class, for this department, then the general one. "Type of class" (lecture, laboratory,
 * clinical...) is set per class; lecture is the standard form.
 */
export function instrumentFor(db, tt, group, dept = null, variant = null) {
  // a form with no questions yet is still being built: it is not used, so the next form in line applies
  const list = db.instruments.filter((i) => i.targetType === tt && i.group === group && i.active !== false && i.items?.length > 0);
  const v = (i) => i.variant || null;
  return (variant && dept && list.find((i) => v(i) === variant && i.dept === dept))
    || (variant && list.find((i) => v(i) === variant && !i.dept))
    || (dept && list.find((i) => !v(i) && i.dept === dept))
    || list.find((i) => !v(i) && !i.dept) || null;
}
/**
 * The type of class a task is about: the class itself for students; for the dean or program chair,
 * the type most of the person's evaluated classes have (e.g. a clinical instructor in the dental infirmary).
 */
export function taskVariant(db, task) {
  if (task.sectionId) return db.sections.find((s) => s.id === task.sectionId)?.classType || null;
  const count = {};
  const p = periodById(db, task.periodId);
  for (const s of db.sections) if (s.facultyId === task.targetId && !isExemptSection(s) && inTerm(p, s)) count[s.classType || ''] = (count[s.classType || ''] || 0) + 1;
  const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  return top?.[0] || null;
}
/** The form a not-yet-submitted task is answered on. */
export function formForTask(db, task) {
  const tg = userById(db, task.targetId);
  if (!tg) return null;
  const who = personIn(db, task.periodId, tg);
  return instrumentFor(db, who.type, task.group, who.dept, taskVariant(db, task));
}
/** The form a task was (or will be) answered on: the version stored with a submitted response. */
export const formOfTask = (db, task) =>
  (task.response?.instrumentId && db.instruments.find((i) => i.id === task.response.instrumentId)) || formForTask(db, task);
/** FR4: a form that already has submitted evaluations can't be edited; a new version is made instead. */
export const formUsed = (db, ins) => db.tasks.some((t) => t.response && t.response.instrumentId === ins.id);
export const itemCategory = (it) => (it.category || '').trim() || 'General';

/**
 * FR3: weight of each item at submission. If the form gives every category a weight
 * (e.g. 60% / 40%), each category gets its share, split among its items by item weight.
 * Otherwise the item weights are used directly.
 */
export function effectiveWeights(ins) {
  const cats = ins.categories || {};
  const useCats = Object.keys(cats).length > 0 && ins.items.every((it) => Number(cats[itemCategory(it)]) > 0);
  if (!useCats) return Object.fromEntries(ins.items.map((it) => [it.criterionId, Number(it.weight)]));
  const sum = {};
  for (const it of ins.items) sum[itemCategory(it)] = (sum[itemCategory(it)] || 0) + Number(it.weight);
  return Object.fromEntries(ins.items.map((it) => {
    const c = itemCategory(it);
    return [it.criterionId, sum[c] ? (Number(cats[c]) * Number(it.weight)) / sum[c] : 0];
  }));
}

/* ---------- versions of an evaluation tool: draft → (scheduled) → in use → old ---------- */
// A draft or scheduled version has active = false, so it is never the form somebody answers (see instrumentFor).
export const toolStatus = (i) => i.status || (i.active === false ? 'old' : 'in-use');
/** Versions of the same tool: same evaluated category, evaluator group, department and type of class. */
export const sameTool = (a, b) => a.targetType === b.targetType && a.group === b.group && (a.dept || null) === (b.dept || null) && (a.variant || null) === (b.variant || null);
/** The parts of a tool in order, with their weight (null = not set) and indicators. Empty parts are included. */
export function toolParts(ins) {
  const parts = new Map();
  for (const it of ins.items || []) {
    const name = itemCategory(it);
    if (!parts.has(name)) parts.set(name, { name, weight: ins.categories?.[name] ?? null, items: [] });
    parts.get(name).items.push(it);
  }
  for (const name of Object.keys(ins.categories || {})) if (!parts.has(name)) parts.set(name, { name, weight: ins.categories[name] ?? null, items: [] });
  return [...parts.values()];
}
/**
 * What must be fixed before a tool can be used (empty list = ready). If any part has a weight, every part needs
 * one and they total 100%: otherwise effectiveWeights() would ignore or stretch them without saying so.
 */
export function toolProblems(ins) {
  const out = [];
  if (!ins.items?.length) out.push('Add at least one indicator.');
  const parts = toolParts(ins);
  const weighted = parts.some((p) => Number(p.weight) > 0);
  for (const p of parts) {
    if (!p.items.length) out.push(`"${p.name}" has no indicators. Add one, or remove the part.`);
    if (weighted && !(Number(p.weight) > 0)) out.push(`"${p.name}" has no weight.`);
  }
  const total = parts.reduce((a, p) => a + (Number(p.weight) || 0), 0);
  // 0.05: three equal parts of 33.33% are accepted as 100%
  if (weighted && Math.abs(total - 100) > 0.05) out.push(`The weights add up to ${+total.toFixed(2)}%; they must add up to 100%. ${total < 100 ? `Add ${+(100 - total).toFixed(2)}% more.` : `Remove ${+(total - 100).toFixed(2)}%.`}`);
  const zero = (ins.items || []).filter((it) => !(Number(it.weight) > 0)).length;
  if (zero) out.push(`${zero} indicator${zero === 1 ? ' has' : 's have'} an item weight of 0, so the answers would not count.`);
  return out;
}
/**
 * Would using this version now give people in an open period two different forms? True when somebody already
 * answered (or saved a draft answer on) the form it would replace.
 */
export function toolSwitchMixes(db, ins) {
  const openIds = new Set(db.periods.filter((p) => p.status === 'open').map((p) => p.id));
  const tasks = db.tasks.filter((t) => t.group === ins.group && openIds.has(t.periodId));
  const after = { ...db, instruments: db.instruments.map((i) => (i.id === ins.id ? { ...i, active: true, status: null } : sameTool(i, ins) && i.active !== false ? { ...i, active: false } : i)) };
  const now = new Map(), replaced = new Set();
  const key = (t) => `${t.targetId}|${t.sectionId || ''}`;
  for (const t of tasks) {
    if (now.has(key(t))) continue;
    const a = formForTask(db, t)?.id || null;
    now.set(key(t), a);
    if (a && a !== formForTask(after, t)?.id) replaced.add(a);
  }
  return replaced.size > 0 && tasks.some((t) => (t.response ? replaced.has(t.response.instrumentId) : t.draft && replaced.has(now.get(key(t)))));
}
/** A tool's name for people: UB's name, HR's name, or who rates whom. */
export const toolName = (db, i) => (i.name && i.name !== 'custom' ? i.name.replace(/ \((UB tool|sample)\)$/, '') : `${TARGET_TYPES[i.targetType]} by the ${groupName(db, i.group)}`);

// ---------- task status ----------
export function taskStatus(db, task) {
  if (task.response) return 'completed';
  const p = periodById(db, task.periodId);
  if (p && new Date(p.deadline + 'T23:59:59') < new Date()) return 'overdue';
  return 'pending';
}

// ---------- scoring ----------
export function responseScore(resp) {
  let sw = 0, s = 0;
  for (const [cid, w] of Object.entries(resp.weights)) {
    const v = resp.answers[cid];
    if (v == null) continue;
    sw += w;
    s += w * v;
  }
  return sw ? s / sw : null;
}
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
/** FR13: final ratings are rounded to two decimal places. */
export const round2 = (x) => (x == null ? null : Math.round((x + Number.EPSILON) * 100) / 100);

export function sectionStats(db, periodId, sectionId, participation = null) {
  const sec = db.sections.find((s) => s.id === sectionId);
  const tasks = db.tasks.filter((t) => t.periodId === periodId && t.sectionId === sectionId && t.group === 'ST');
  const required = tasks.length;
  const done = tasks.filter((t) => t.response);
  const needed = neededResponses(required, { ...policyFor(db, periodId), ...(participation || (sec && participationFor(db, periodId, sec)) || {}) });
  const rate = required ? done.length / required : 0;
  const valid = required > 0 && done.length >= needed;
  const score = valid ? mean(done.map((t) => responseScore(t.response))) : null;
  return { section: sec, required, responded: done.length, needed, rate, valid, score, belowHalf: required > 0 && !valid };
}

/** NFR8: group weights in force for a period (fixed when the period is closed). */
export const rulesFor = (db, periodId) => periodById(db, periodId)?.rules || db.rules;

/* ---------- FR13: the final rating, computed by the formula engine (src/lib/formula.js) ---------- */
/** The key of a formula: per evaluated category, optionally only for one department (a condition). */
export const formulaKey = (tt, dept) => (dept ? `${tt}|${dept}` : tt);
/** The formula version in use now for a category (a department-specific one wins). */
export function activeFormula(db, tt, dept) {
  const list = (db.formulas || []).filter((f) => f.status === 'active' && f.targetType === tt);
  return (dept && list.find((f) => f.dept === dept)) || list.find((f) => !f.dept) || null;
}
/** A formula record as the engine needs it (its rules plus its identity). */
export const formulaSnapshot = (rec) => ({ ...rec.config, methodVersion: rec.config.methodVersion ?? 1, id: rec.id, version: rec.version, key: rec.key, dept: rec.dept || null });
/**
 * The formula a period uses for a category: the version fixed in the period (NFR8), else the active one
 * (for previews outside a period), else the starting formula (the starting percentages saved at setup).
 */
export function formulaFor(db, periodId, tt, dept) {
  const p = periodId && periodById(db, periodId);
  const snap = p?.formulas || {};
  const fixed = (dept && snap[formulaKey(tt, dept)]) || snap[tt];
  if (fixed) return fixed;
  if (!p) { const a = activeFormula(db, tt, dept); if (a) return formulaSnapshot(a); }
  return defaultFormula(rulesFor(db, periodId)[tt] || {}, policyFor(db, periodId));
}
/**
 * Evaluation groups that have a tool for a category. Only a tool in use counts (with at least one indicator);
 * { scheduled } also counts one that starts with the next period, { drafts } also one HR is still preparing.
 */
export const formGroups = (db, tt, { scheduled = false, drafts = false } = {}) => [...new Set(db.instruments.filter((i) => {
  if (i.targetType !== tt) return false;
  const s = toolStatus(i);
  return (s === 'in-use' && i.items?.length > 0) || (s === 'scheduled' && (scheduled || drafts)) || (s === 'draft' && drafts);
}).map((i) => i.group))];
/** The evaluator groups of a person's rating in a period: the groups in the formula used for their category and department. */
export const ratingGroups = (db, periodId, u) => { const who = personIn(db, periodId, u); return [...new Set(formulaFor(db, periodId, who.type, who.dept).components.map((c) => c.group))]; };
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * A person's result for a period. opts.formula runs another formula on the same answers (the simulator).
 * The result keeps the formula used, each group's contribution (breakdown) and the computation steps.
 */
export function computeTarget(db, periodId, targetId, opts = {}) {
  const target = userById(db, targetId);
  const { type: tt, dept } = personIn(db, periodId, target);
  const f = opts.formula || formulaFor(db, periodId, tt, dept);
  const comps = f.components || [];
  const groups = {};
  const sections = [];
  const m = methodOf(f.method, f.methodVersion ?? 1);
  const policy = policyFor(db, periodId);
  const participation = participationRuleOf(f, policy);
  const shown = (c) => (m?.usesWeights ? c.weight : m?.equalShares ? +(100 / comps.length).toFixed(2) : null);
  for (const c of comps) {
    const g = c.group;
    const tasks = db.tasks.filter((t) => t.periodId === periodId && t.targetId === targetId && t.group === g);
    if (g === 'ST') {
      const secIds = [...new Set(tasks.map((t) => t.sectionId))];
      const st = secIds.map((id) => sectionStats(db, periodId, id, participation));
      sections.push(...st);
      const valid = st.filter((x) => x.valid);
      // aggregation: average of each class's average (UB practice), or all counted students together
      const counted = (x) => tasks.filter((t) => t.sectionId === x.section?.id && t.response).map((t) => responseScore(t.response)).filter((v) => v != null);
      const score = c.aggregation === 'POOLED'
        ? mean(valid.flatMap(counted))
        : mean(valid.map((x) => x.score));
      // how sure: the answers are a sample of each class (finite population correction with the class size)
      const ms = c.aggregation === 'POOLED'
        ? sampleStats(valid.flatMap(counted), valid.reduce((a, x) => a + x.required, 0))
        : averageOfAverages(valid.map((x) => ({ xs: counted(x), N: x.required })));
      groups[g] = { weight: shown(c), score, required: tasks.length, responded: tasks.filter((t) => t.response).length, invalidSections: st.filter((x) => !x.valid).length, aggregation: c.aggregation, n: ms.n, moe: score == null ? null : ms.moe };
    } else {
      const done = tasks.filter((t) => t.response);
      const scores = done.map((t) => responseScore(t.response)).filter((v) => v != null);
      const ms = sampleStats(scores, tasks.length);
      groups[g] = { weight: shown(c), score: c.aggregation === 'MEDIAN' ? median(scores) : mean(scores), required: tasks.length, responded: done.length, aggregation: c.aggregation, n: ms.n, moe: !scores.length || c.aggregation === 'MEDIAN' ? null : ms.moe };
    }
  }
  const missingW = m?.usesWeights ? comps.filter((c) => c.weight == null || c.weight === '').map((c) => c.group) : [];
  const total = m?.usesWeights ? comps.reduce((a, c) => a + (Number(c.weight) || 0), 0) : 100;
  const r = computeFinal(f, Object.fromEntries(Object.entries(groups).map(([g, x]) => [g, x.score])));
  // margin of error of the final rating (sums of group ratings only: percentages or the same for all)
  let margin = null;
  if (r.final != null && r.breakdown?.some((b) => b.share && b.contribution != null)) {
    const moe = combinedMargin(r.breakdown.filter((b) => b.share).map((b) => ({ share: b.share, moe: groups[b.group]?.moe })));
    if (moe != null) {
      const pol = policyFor(db, periodId), ntp = String(tt).startsWith('NTP');
      const low = Math.max(1, r.final - moe), high = Math.min(MAX_RATING, r.final + moe);
      const lo = interpretation(round2(low), ntp, pol), hi = interpretation(round2(high), ntp, pol);
      margin = { moe, low, high, confidence: confidenceLabel(moe), nearBand: lo !== hi ? [lo, hi] : null };
    }
  }
  return {
    targetId, target, type: tt, dept, groups, sections, final: r.final, status: r.status, missing: r.missing, missingW, basis: r.basis, total, margin,
    // the whole formula version is kept with the result, so it can be recomputed exactly later
    formula: { id: f.id || null, key: f.key || tt, name: f.name, version: f.version ?? 0, method: f.method, methodVersion: f.methodVersion ?? 1, components: comps.map((c) => ({ group: c.group, weight: c.weight ?? null, aggregation: c.aggregation, transform: c.transform || '' })), expression: f.expression || '', missing: f.missing, minGroups: f.minGroups ?? 1, participation: f.participation || null, effectiveFrom: f.effectiveFrom || '', effectiveUntil: f.effectiveUntil || '', rounding: f.rounding },
    breakdown: r.breakdown, steps: r.steps, how: r.how,
  };
}
/** A result that has a final score (complete, or re-weighted because a group is missing). */
export const hasFinal = (r) => r.final != null;

/** Everyone who is evaluated; for a closed period, those who were evaluated then. */
export function targetsOf(db, periodId = null) {
  const kept = periodId && periodById(db, periodId)?.people;
  return db.users.filter((u) => (kept ? kept[u.id] : targetType(db, u)));
}
/**
 * Where an evaluator group counts now: { categories, list }. list says it in words: formulas in use or being prepared,
 * starting formulas, and open periods.
 */
export function groupUse(db, id) {
  const has = (f) => f?.components?.some((c) => c.group === id);
  const categories = Object.keys(TARGET_TYPES).filter((tt) => has(formulaFor(db, null, tt, null)) || (db.formulas || []).some((f) => f.targetType === tt && f.status === 'active' && has(f.config)));
  const list = categories.map((tt) => TARGET_TYPES[tt]);
  for (const f of db.formulas || []) if (['draft', 'pending', 'rejected', 'approved', 'scheduled'].includes(f.status) && has(f.config)) list.push(`a formula being prepared for ${TARGET_TYPES[f.targetType]}`);
  for (const p of db.periods.filter((x) => x.status === 'open')) if (Object.keys(TARGET_TYPES).some((tt) => has(formulaFor(db, p.id, tt, null))) || Object.values(p.formulas || {}).some(has)) list.push(p.name);
  return { categories, list: [...new Set(list)] };
}
/** Did an evaluator group ever count or rate? Then it is archived, not deleted. */
export const groupUsedBefore = (db, id) => db.tasks.some((t) => t.group === id)
  || db.periods.some((p) => Object.values(p.formulas || {}).some((f) => f.components?.some((c) => c.group === id)) || Object.values(p.rules || {}).some((r) => id in r))
  || (db.formulas || []).some((f) => f.status === 'archived' && f.config.components.some((c) => c.group === id));
/** The people of one department in a period (as they were then). */
export const targetsInDept = (db, periodId, dept) => targetsOf(db, periodId).filter((u) => personIn(db, periodId, u).dept === dept);
/** The class sections whose student evaluation counts in a period. */
export const countedSections = (db, periodId) => new Set(db.sections.map((s) => sectionStats(db, periodId, s.id, participationFor(db, periodId, s))).filter((s) => s.valid).map((s) => s.section.id));

export function computeAll(db, periodId) {
  return targetsOf(db, periodId).map((u) => computeTarget(db, periodId, u.id));
}

/**
 * When a period closes, every final result is stored with the formula version (its parameters and its
 * approval), the ratings used, the breakdown and the steps. Later changes to formulas, policies or the
 * program cannot silently change them, and each can be computed again exactly (reproducibility).
 */
export function storeResults(db, p) {
  const at = new Date().toISOString();
  db.results = (db.results || []).filter((r) => r.periodId !== p.id);
  // the category and department each person had in this period (a reopened period keeps the ones it has)
  p.people = { ...Object.fromEntries(targetsOf(db).map((u) => [u.id, { type: targetType(db, u), dept: u.dept ?? null }])), ...(p.people || {}) };
  for (const r of computeAll(db, p.id)) {
    const rec = r.formula.id && (db.formulas || []).find((f) => f.id === r.formula.id);
    db.results.push({ periodId: p.id, targetId: r.targetId, data: {
      final: r.final, status: r.status, basis: r.basis, steps: r.steps, how: r.how, margin: r.margin,
      // the formula version with its parameters, and its approval (the starting formula has none)
      formula: { ...r.formula, approvedBy: rec?.meta.approvedBy || null, approvedAt: rec?.meta.approvedAt || null, basis: rec?.meta.basis || null },
      groups: Object.fromEntries(Object.entries(r.groups).map(([g, x]) => [g, { score: x.score, weight: x.weight, responded: x.responded, required: x.required }])),
      breakdown: r.breakdown, computedAt: at,
    } });
  }
}

/**
 * FR15/FR16/FR19: per-item results. For each criterion: number of answers, the mean and the
 * distribution of ratings 1..4. Student identities are never part of this.
 */
export function itemStats(tasks, lowItem = LOW_ITEM) {
  const m = new Map();
  for (const t of tasks) {
    if (!t.response || t.response.redacted) continue;
    for (const [cid, v] of Object.entries(t.response.answers)) {
      const x = m.get(cid) || { criterionId: cid, n: 0, sum: 0, dist: Array(MAX_RATING).fill(0) };
      x.n++; x.sum += v; if (v >= 1 && v <= MAX_RATING) x.dist[v - 1]++;
      m.set(cid, x);
    }
  }
  return [...m.values()].map((x) => ({ ...x, mean: x.sum / x.n, low: x.sum / x.n < lowItem, cut: lowItem }));
}

// ---------- tasks / workflow ----------
/** FR8: a period covers every department, or only the ones HR selected. */
export const periodCovers = (p, dept) => !p?.depts?.length || p.depts.includes(dept);

export function expectedAssignments(db, periodId) {
  // Rule-based evaluator assignment from user attributes (role, position, department) and class lists.
  // Deactivated accounts get no new tasks (their past results stay in the reports).
  const p = periodById(db, periodId);
  const out = [];
  // looked up once: this runs by itself after every import
  const on = new Set(db.users.filter(active).map((u) => u.id));
  const raters = new Map(); // department -> [[person, their groups]]
  for (const u of db.users) if (on.has(u.id) && u.role !== 'ST') { if (!raters.has(u.dept)) raters.set(u.dept, []); raters.get(u.dept).push([u, groupsOf(db, u)]); }
  const classes = new Map();
  for (const s of db.sections) if (!isExemptSection(s) && inTerm(p, s)) { if (!classes.has(s.facultyId)) classes.set(s.facultyId, []); classes.get(s.facultyId).push(s); }
  for (const t of targetsOf(db).filter(active)) {
    const dept = personIn(db, periodId, t).dept;
    if (!periodCovers(p, dept)) continue;
    // only the groups that count in this person's formula (a department's own formula included) get tasks
    for (const g of ratingGroups(db, periodId, t)) {
      if (g === 'ST') {
        for (const sec of classes.get(t.id) || [])
          for (const sid of sec.studentIds.filter((id) => on.has(id))) out.push({ evaluatorId: sid, targetId: t.id, group: g, sectionId: sec.id });
      } else {
        for (const [e] of (raters.get(dept) || []).filter(([u, gs]) => u.id !== t.id && gs.includes(g)))
          out.push({ evaluatorId: e.id, targetId: t.id, group: g, sectionId: null });
      }
    }
  }
  return out;
}

/**
 * The tools of a period: Map(tool id → { answered, waiting }).
 * Answered evaluations count on the exact version they were answered on. In an open period, the evaluations still
 * waiting count on the version they would get now (before the tasks are created: the expected evaluations).
 * In a closed period an evaluation nobody answered has no version, so it is not counted.
 */
export function toolsOfPeriod(db, periodId) {
  const p = periodById(db, periodId);
  const out = new Map(), forms = new Map();
  if (!p) return out;
  const add = (id, k) => { if (!id) return; if (!out.has(id)) out.set(id, { answered: 0, waiting: 0 }); out.get(id)[k]++; };
  const formId = (t) => {
    const key = `${t.targetId}|${t.group}|${t.sectionId || ''}`;
    if (!forms.has(key)) forms.set(key, formForTask(db, t)?.id || null);
    return forms.get(key);
  };
  const tasks = db.tasks.filter((t) => t.periodId === periodId);
  for (const t of tasks) {
    if (t.response) add(t.response.instrumentId || formId(t), 'answered');
    else if (p.status === 'open') add(formId(t), 'waiting');
  }
  if (!tasks.length && p.status === 'open') for (const t of expectedAssignments(db, periodId)) add(formId(t), 'waiting');
  return out;
}

export const taskKey = (t) => `${t.evaluatorId}|${t.targetId}|${t.group}|${t.sectionId || ''}`;
/** Not started yet / the deadline (end of that day) has passed. */
export const notStarted = (p, day = today()) => !!p.startDate && p.startDate > day;
export const deadlinePassed = (p, now = Date.now()) => new Date(`${p.deadline}T23:59:59`).getTime() < now;
export const CLOSE_AFTER_HOURS = 24;
/** When an open period closes by itself: 24 hours after the deadline, and never less than 24 hours after HR was told. */
export function closesAt(p) {
  const h = CLOSE_AFTER_HOURS * 3600000;
  return Math.max(new Date(`${p.deadline}T23:59:59`).getTime() + h, p.auto?.closeNotice ? Date.parse(p.auto.closeNotice) + h : 0);
}
/**
 * Keep an open period's evaluations right: new classes, students and staff get theirs; unanswered ones of students who
 * dropped a class, and of deactivated accounts, are removed (so the class size is right). Answers are never touched.
 */
export function syncTasks(draft, p, now = Date.now()) {
  if (p.status !== 'open' || notStarted(p, localDay(new Date(now))) || deadlinePassed(p, now)) return { added: 0, removed: 0 };
  const on = new Set(draft.users.filter(active).map((u) => u.id));
  const inClass = new Map(draft.sections.map((s) => [s.id, new Set(s.studentIds)]));
  const before = draft.tasks.length;
  draft.tasks = draft.tasks.filter((t) => t.periodId !== p.id || t.response || (on.has(t.evaluatorId) && on.has(t.targetId) && (!t.sectionId || inClass.get(t.sectionId)?.has(t.evaluatorId))));
  return { removed: before - draft.tasks.length, added: generateTasks(draft, p.id).added };
}
export const syncOpenPeriods = (draft) => draft.periods.filter((p) => p.status === 'open').reduce((a, p) => { const r = syncTasks(draft, p); return { added: a.added + r.added, removed: a.removed + r.removed }; }, { added: 0, removed: 0 });
/** Close a period: leave out classes without enough answers, fix its rules and store every result. Returns the classes left out. */
export function closeNow(draft, p) {
  const flagged = runThresholdCheck(draft, p.id);
  p.status = 'closed';
  p.rules ||= structuredClone(draft.rules);
  p.policy ||= currentPolicy(draft);
  storeResults(draft, p);
  return flagged;
}

export function generateTasks(draft, periodId) {
  // idempotent; returns {added, skippedNoForm}
  const have = new Set(draft.tasks.filter((t) => t.periodId === periodId).map(taskKey));
  const off = new Set(periodById(draft, periodId)?.auto?.skip || []); // evaluations HR removed by hand stay removed
  const forms = new Map();
  const hasForm = (a) => { const k = `${a.targetId}|${a.group}|${a.sectionId || ''}`; if (!forms.has(k)) forms.set(k, !!formForTask(draft, { ...a, periodId })); return forms.get(k); };
  let added = 0, skippedNoForm = 0;
  for (const a of expectedAssignments(draft, periodId)) {
    const key = taskKey(a);
    if (have.has(key) || off.has(key)) continue;
    if (!hasForm(a)) { skippedNoForm++; continue; }
    draft.tasks.push({ id: uid('t'), periodId, ...a, draft: null, response: null });
    added++;
  }
  return { added, skippedNoForm };
}

let _n = 0;
export const uid = (p) => `${p}_${Date.now().toString(36)}${(_n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** A date as YYYY-MM-DD on this computer's clock (not UTC: before 8 a.m. in Manila that is still yesterday). */
export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = () => localDay();

/** Adds a notification unless one with the same key already exists. Returns true if added. */
export function notify(draft, { key, userId, kind, text }) {
  if (key && draft.notifications.some((n) => n.key === key)) return false;
  draft.notifications.push({ id: uid('n'), key, userId, kind, at: new Date().toISOString(), read: false, text });
  return true;
}
/** "1 class", "3 classes" */
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// ---------- FR11 / FR12: participation threshold + notifying the parties concerned ----------
/**
 * Notifies the faculty member, the department heads and HR about every class without enough answers.
 * final = false: progress warning while the period is open (once a day).
 * final = true:  the period was closed and these classes are excluded (once).
 * Returns the number of classes below the threshold.
 */
/** The rule a formula is computed with: the period's policy. A formula used before the rule was set in one place keeps its own. */
const participationRuleOf = (f, policy) => (f.participation
  ? { participationRule: f.participation.plusOne === false ? 'atleast' : 'more', participationPercent: f.participation.percent }
  : { participationRule: policy.participationRule, participationPercent: policy.participationPercent, participationMin: policy.participationMin });
/** The participation rule for a class in a period. */
export function participationFor(db, periodId, section) {
  const who = personIn(db, periodId, userById(db, section.facultyId));
  const formula = formulaFor(db, periodId, who.type, who.dept);
  return participationRuleOf(formula, policyFor(db, periodId));
}
function participationNotices(draft, periodId, final) {
  const p = periodById(draft, periodId);
  const day = today();
  const words = ruleWords(policyFor(draft, periodId));
  // no participation rule: no class is left out, so there is nothing to warn about
  const low = draft.sections.filter((s) => hasRule(participationFor(draft, periodId, s))).map((s) => sectionStats(draft, periodId, s.id)).filter((st) => st.required && !st.valid);
  const kind = final ? 'invalidated' : 'participation';
  const tag = final ? `thr|${periodId}` : `part|${periodId}|${day}`;
  const line = (st) => `${st.section.code} (${st.section.subject}) – ${userById(draft, st.section.facultyId)?.name}: ${st.responded} of ${st.required} answered, ${st.needed} needed`;
  for (const st of low) {
    const s = st.section;
    notify(draft, {
      key: final ? `thr|${periodId}|${s.id}` : `${tag}|${s.id}`, userId: s.facultyId, kind,
      text: final
        ? `Student evaluation for ${s.code} (${s.subject}) in ${p.name} is excluded from your result: only ${st.responded} of ${st.required} students answered, and ${st.needed} (${words}) were needed.`
        : `Only ${st.responded} of ${st.required} students in ${s.code} (${s.subject}) have answered the evaluation for ${p.name}. ${st.needed} (${words}) are needed by ${fmtDate(p.deadline)}, or this class won't count. Please remind your students.`,
    });
  }
  const byDept = {};
  for (const st of low) (byDept[st.section.dept] ||= []).push(st);
  for (const [dept, list] of Object.entries(byDept)) {
    for (const h of deptHeads(draft, dept)) {
      notify(draft, {
        key: `${tag}|dept|${dept}|${h.id}`, userId: h.id, kind,
        text: `${final ? `${p.name} was closed. These classes in your department are excluded` : `${plural(list.length, 'class', 'classes')} in your department ${list.length === 1 ? 'does' : 'do'} not have enough answers yet for ${p.name} (${words})`}: ${list.map(line).join('; ')}.`,
      });
    }
  }
  if (low.length) {
    for (const h of hrUsers(draft)) {
      notify(draft, {
        key: `${tag}|hr|${h.id}`, userId: h.id, kind,
        text: `${p.name}: ${plural(low.length, 'class', 'classes')} ${final ? (low.length === 1 ? 'was excluded:' : 'were excluded:') : (low.length === 1 ? 'does not have enough answers yet:' : 'do not have enough answers yet:')} ${words} must answer. ${low.slice(0, 5).map(line).join('; ')}${low.length > 5 ? `; and ${low.length - 5} more` : ''}.`,
      });
    }
  }
  return low.length;
}
/** Final check when a period is closed (also used for the sample data). */
export function runThresholdCheck(draft, periodId) {
  const n = participationNotices(draft, periodId, true);
  periodById(draft, periodId).thresholdChecked = true;
  return n;
}
/** Progress warning while the period is open. */
export const participationAlerts = (draft, periodId) => participationNotices(draft, periodId, false);

// ---------- FR10: reminders to evaluators, alerts to their department and HR ----------
export function sendReminders(draft, periodId) {
  const p = periodById(draft, periodId);
  const day = today();
  const pending = draft.tasks.filter((x) => x.periodId === periodId && !x.response);
  const overdue = new Date(p.deadline + 'T23:59:59') < new Date();
  // one reminder per evaluator per day, however many evaluations they still have
  const byEvaluator = {};
  for (const t of pending) (byEvaluator[t.evaluatorId] ||= []).push(t);
  let sent = 0;
  for (const [evId, list] of Object.entries(byEvaluator)) {
    if (!active(userById(draft, evId))) continue;
    const names = [...new Set(list.map((t) => userById(draft, t.targetId)?.name))];
    if (notify(draft, {
      key: `rem|${periodId}|${evId}|${day}`, userId: evId, kind: overdue ? 'overdue' : 'reminder',
      text: `${overdue ? 'OVERDUE' : 'Reminder'}: you have ${plural(list.length, 'evaluation')} not yet submitted for ${p.name} (${names.slice(0, 3).join(', ')}${names.length > 3 ? ', …' : ''}). ${overdue ? 'The deadline has passed' : `Deadline: ${fmtDate(p.deadline)}`}.`,
    })) sent++;
  }
  // department alert: pending evaluations by the department's people
  const byDept = {};
  for (const t of pending) {
    const ev = userById(draft, t.evaluatorId);
    if (!active(ev) || !ev.dept) continue;
    const d = (byDept[ev.dept] ||= { staff: 0, students: 0 });
    if (t.group === 'ST') d.students++; else d.staff++;
  }
  for (const [dept, c] of Object.entries(byDept)) {
    for (const h of deptHeads(draft, dept)) {
      notify(draft, {
        key: `remdept|${periodId}|${dept}|${h.id}|${day}`, userId: h.id, kind: overdue ? 'overdue' : 'reminder',
        text: `${p.name}: in your department, ${plural(c.staff, 'evaluation')} by personnel and ${c.students} by students are still not submitted. ${overdue ? 'The deadline has passed.' : `Deadline: ${fmtDate(p.deadline)}.`}`,
      });
    }
  }
  const total = draft.tasks.filter((x) => x.periodId === periodId).length;
  if (pending.length) {
    for (const h of hrUsers(draft)) {
      notify(draft, {
        key: `remhr|${periodId}|${h.id}|${day}`, userId: h.id, kind: overdue ? 'overdue' : 'reminder',
        text: `${p.name}: ${pending.length} of ${total} evaluations are still not submitted. ${overdue ? 'The deadline has passed: close the period when ready.' : `Deadline: ${fmtDate(p.deadline)}.`}`,
      });
    }
  }
  return sent;
}

/**
 * FR10: automatic reminders. Runs at most once a day for each open period, from REMIND_DAYS
 * before the deadline (and every day after it until HR closes the period).
 * Returns the number of periods processed (0 = nothing to do).
 */
// ---------- participation forecast (early warning) ----------
const DAY_MS = 86400000;
/**
 * Will enough of this class answer by the deadline at its current pace?
 * pace = answers so far / days since the period opened; projected = answers so far + pace x days left.
 * Returns null for a class with no evaluation in an open period. status: reached | on-track | at-risk | too-early
 * (the first 2 days give too little to go on).
 */
export function participationForecast(db, periodId, sectionId, now = Date.now()) {
  const p = periodById(db, periodId);
  // the pace counts from the period's start date (or, for older periods, from when it was opened)
  const start = p?.startDate ? Date.parse(p.startDate + 'T00:00:00') : p?.openedAt ? Date.parse(p.openedAt) : null;
  if (!p || p.status !== 'open' || start == null) return null;
  const sec = db.sections.find((x) => x.id === sectionId);
  if (sec && !hasRule(participationFor(db, periodId, sec))) return null; // no rule, nothing to reach
  const st = sectionStats(db, periodId, sectionId);
  if (!st.required || isExemptSection(st.section)) return null;
  const elapsed = (now - start) / DAY_MS;
  const left = Math.max(0, (new Date(p.deadline + 'T23:59:59').getTime() - now) / DAY_MS);
  const perDay = st.responded / Math.max(1, elapsed);
  const projected = Math.min(st.required, Math.floor(st.responded + perDay * left));
  const status = st.responded >= st.needed ? 'reached' : elapsed < 2 ? 'too-early' : projected >= st.needed ? 'on-track' : 'at-risk';
  return { section: st.section, responded: st.responded, needed: st.needed, required: st.required, perDay, projected, daysLeft: Math.ceil(left), status, morePerDay: left >= 1 ? (st.needed - st.responded) / left : st.needed - st.responded };
}
/** The forecast in one plain sentence. */
export function forecastText(fc, deadline, withLabel = true) {
  if (!fc) return '';
  const by = fmtDate(deadline);
  if (fc.status === 'reached') return 'Enough answers already.';
  if (fc.status === 'too-early') return `Too early to tell (${fc.responded} of ${fc.needed} needed so far).`;
  const pace = `${fc.perDay < 1 ? fc.perDay.toFixed(1) : Math.round(fc.perDay)} answer${fc.perDay === 1 ? '' : 's'} a day`;
  const lead = (label, rest) => (withLabel ? `${label}: ${rest}` : rest.charAt(0).toUpperCase() + rest.slice(1));
  if (fc.status === 'on-track') return lead('On track', `at the current pace (${pace}) about ${fc.projected} of ${fc.required} by ${by}; it needs ${fc.needed}.`);
  return lead('At risk', `at the current pace (${pace}) only about ${fc.projected} of ${fc.required} by ${by}; it needs ${fc.needed}. ${((n) => `About ${n} more answer${n > 1 ? 's a day are' : ' a day is'} needed.`)(Math.max(1, Math.ceil(fc.morePerDay)))}`);
}
/** Once a day: warn the teacher (once per class), the department heads and HR (when the list changes) about classes at risk. */
export function forecastWarnings(draft, periodId, now = Date.now()) {
  const p = periodById(draft, periodId);
  const risky = draft.sections.map((s) => participationForecast(draft, periodId, s.id, now)).filter((f) => f?.status === 'at-risk');
  let sent = 0;
  for (const f of risky) {
    if (notify(draft, { key: `fc|${periodId}|${f.section.id}`, userId: f.section.facultyId, kind: 'participation',
      text: `Early warning for ${p.name}: ${f.section.code} (${f.section.subject}). ${forecastText(f, p.deadline)} Show the class QR code in class or remind your students.` })) sent++;
  }
  const line = (f) => `${f.section.code} (${userById(draft, f.section.facultyId)?.name}): about ${f.projected} of ${f.needed} needed`;
  const byDept = {};
  for (const f of risky) (byDept[f.section.dept] ||= []).push(f);
  for (const [dept, list] of Object.entries(byDept)) {
    const ids = list.map((f) => f.section.id).sort().join(',');
    for (const h of deptHeads(draft, dept)) if (notify(draft, { key: `fcd|${periodId}|${dept}|${h.id}|${ids}`, userId: h.id, kind: 'participation', text: `Early warning for ${p.name}: at their current pace, ${plural(list.length, 'class', 'classes')} in your department may not have enough answers by ${fmtDate(p.deadline)}: ${list.map(line).join('; ')}.` })) sent++;
  }
  if (risky.length) {
    const ids = risky.map((f) => f.section.id).sort().join(',');
    for (const h of hrUsers(draft)) if (notify(draft, { key: `fch|${periodId}|${h.id}|${ids}`, userId: h.id, kind: 'participation', text: `Early warning for ${p.name}: at their current pace, ${plural(risky.length, 'class', 'classes')} may not have enough answers by ${fmtDate(p.deadline)}: ${risky.slice(0, 5).map(line).join('; ')}${risky.length > 5 ? `; and ${risky.length - 5} more` : ''}. See Response progress.` })) sent++;
  }
  return sent;
}

const VP_REMIND_DAYS = 3;
const when = (ms) => new Date(ms).toLocaleString('en-US', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/**
 * Everything evalU does by itself. Runs every few minutes on the server; each part happens once a day (or once).
 * Returns the number of things done (0 = nothing to save).
 */
export function runDailyAutomation(draft, now = Date.now()) {
  const day = localDay(new Date(now));
  let ran = 0;
  for (const p of draft.periods.filter((x) => x.status === 'open' && !notStarted(x, day))) {
    const auto = (p.auto ||= {});
    if (!deadlinePassed(p, now)) {
      // evaluations follow the classes, students and staff (checked on the start date, then every day)
      if (auto.synced !== day) { auto.synced = day; const r = syncTasks(draft, p, now); if (r.added || r.removed) ran++; }
    } else {
      // the deadline has passed: nobody can answer, so nobody is reminded. HR is told, and can still extend it.
      if (!auto.closeNotice) {
        auto.closeNotice = new Date(now).toISOString(); ran++;
        for (const h of hrUsers(draft)) notify(draft, { key: `cls|${p.id}|notice|${h.id}|${p.deadline}`, userId: h.id, kind: 'overdue', text: `The deadline of ${p.name} has passed. It closes by itself on ${when(closesAt(p))}. If people need more time, extend the deadline under Dates & release.` });
      }
      if (now >= closesAt(p)) {
        const flagged = closeNow(draft, p); auto.closedBy = 'evalU'; ran++;
        for (const h of hrUsers(draft)) notify(draft, { key: `cls|${p.id}|closed|${h.id}|${p.deadline}`, userId: h.id, kind: 'release', text: `${p.name} was closed by itself after its deadline. ${flagged ? `${plural(flagged, 'class', 'classes')} did not have enough answers. ` : ''}Review the results, then send them to the VPs. You can also reopen it with a new deadline.` });
      }
      continue;
    }
    // early warning from the participation forecast, once a day, from the start of the period
    if (p.lastForecast !== day) { p.lastForecast = day; forecastWarnings(draft, p.id, now); ran++; }
    if (p.lastAuto === day) continue;
    const daysLeft = Math.round((new Date(p.deadline + 'T00:00:00') - new Date(day + 'T00:00:00')) / 86400000);
    if (daysLeft > REMIND_DAYS) continue;
    sendReminders(draft, p.id);
    participationAlerts(draft, p.id);
    p.lastAuto = day;
    ran++;
  }
  // VPs who have not approved after a few days are reminded
  for (const p of draft.periods.filter((x) => x.releaseStage === 'dir' && x.auto?.sentAt)) {
    const last = Date.parse(p.auto.vpReminded || p.auto.sentAt);
    const waiting = pendingApprovals(draft, p);
    if (!waiting.length || now - last < VP_REMIND_DAYS * 86400000) continue;
    p.auto.vpReminded = new Date(now).toISOString(); ran++;
    for (const v of waiting) notify(draft, { key: `vpr|${p.id}|${v.id}|${day}`, userId: v.id, kind: 'reminder', text: `The results of ${p.name} are still waiting for your review. Approve them, or return them to HR with a reason.` });
  }
  // development plans whose review date is near or past: the person who made the plan, once
  for (const plan of (draft.plans || []).filter((x) => x.status === 'open')) {
    if ((Date.parse(plan.reviewBy + 'T00:00:00') - now) / 86400000 > 7) continue;
    if (notify(draft, { key: `dpr|${plan.id}|${plan.reviewBy}`, userId: plan.createdById, kind: 'reminder', text: `The development plan of ${userById(draft, plan.targetId)?.name} is due for review on ${fmtDate(plan.reviewBy)}.` })) ran++;
  }
  return ran;
}

// ---------- visibility (results hidden until released) ----------
export function stageAtLeast(period, stage) {
  return STAGES.indexOf(period.releaseStage) >= STAGES.indexOf(stage);
}
export function canSeeAll(user, period) {
  if (user.role === 'HR') return true;
  if (user.role === 'DIR') return stageAtLeast(period, 'dir');
  return false;
}
/** NFR6: own results only after Vice President approval and release to faculty. */
export function canSeeOwn(user, period) {
  return stageAtLeast(period, 'faculty') && (isEvaluatee(user) || !!period.people?.[user.id]); // also someone who has another position now
}
/** FR16: deans/principals see their department's results once released to faculty. */
export function canSeeDept(user, period) {
  return isResultHead(user) && stageAtLeast(period, 'faculty');
}
export const canSeeComments = canSeeAll;

/** FR17: VPs who still have to approve a period before it can go to faculty. */
export function pendingApprovals(db, period) {
  const done = new Set((period.approvals || []).map((a) => a.userId));
  const vps = directors(db);
  const waiting = vps.filter((u) => !done.has(u.id));
  // policy: every VP, any one VP, or a set number of VPs (so one VP on leave can't block every result)
  const pol = policyFor(db, period.id);
  const needed = pol.approvalMode === 'any' ? 1 : pol.approvalMode === 'count' ? Math.min(Math.max(1, Number(pol.approvalCount) || 1), vps.length || 1) : vps.length;
  return done.size >= needed && vps.length ? [] : waiting;
}
/** How many VP approvals the period needs, in words (for the screens). */
export function approvalRuleText(db, period) {
  const pol = policyFor(db, period?.id);
  return pol.approvalMode === 'any' ? 'any one VP' : pol.approvalMode === 'count' ? `at least ${pol.approvalCount} VP${pol.approvalCount > 1 ? 's' : ''}` : 'every VP';
}

/* ---------- comments: UB's supervisor forms have two boxes ---------- */
/**
 * The Dean/Principal and AP/PC/SH forms for faculty end with two boxes: "Employee's personal and
 * professional development plan" and "Areas to be improved by the employee". Both are kept in the one
 * (encrypted) comment as {"plan","improve"}; other forms keep a plain comment.
 */
export const hasPlanBoxes = (group, tt) => ['DEAN', 'CHAIR', 'PRIN', 'APRIN', 'SHEAD'].includes(group) && tt !== 'DEAN';
export const packComment = (plan = '', improve = '') => (plan.trim() || improve.trim() ? JSON.stringify({ plan: plan.trim(), improve: improve.trim() }) : '');
/** A stored comment as { plan, improve } (two boxes) or { text } (one box). */
export function commentParts(c) {
  if (!c) return null;
  if (typeof c === 'string' && c.startsWith('{"plan"')) {
    try { const o = JSON.parse(c); return { plan: o.plan || '', improve: o.improve || '' }; } catch { /* plain text */ }
  }
  return { text: String(c) };
}

// ---------- development follow-up (plans for people rated Fair or Poor) ----------
export const PLAN_OUTCOMES = { improved: 'Improved', 'not-yet': 'Not improved yet', cancelled: 'Cancelled' };
/** Average answer per form category for one person in a period (only the evaluations that count). */
export function categoryAverages(db, periodId, targetId) {
  const valid = new Set(db.sections.filter((s) => s.facultyId === targetId).map((s) => sectionStats(db, periodId, s.id, participationFor(db, periodId, s))).filter((s) => s.valid).map((s) => s.section.id));
  const out = {};
  for (const t of db.tasks) {
    if (t.periodId !== periodId || t.targetId !== targetId || !t.response || t.response.redacted) continue;
    if (t.group === 'ST' && !valid.has(t.sectionId)) continue;
    const ins = formOfTask(db, t);
    for (const it of ins?.items || []) { const v = t.response.answers[it.criterionId]; if (v != null) (out[itemCategory(it)] ||= []).push(v); }
  }
  return Object.fromEntries(Object.entries(out).map(([c, xs]) => [c, xs.reduce((a, b) => a + b, 0) / xs.length]));
}
/** Whether a rating needs a development plan: Fair or Poor in the period's bands. */
export const needsPlan = (r, policy) => r?.final != null && ['Fair', 'Poor'].includes(interpretation(r.final, String(r.type).startsWith('NTP'), policy));
/**
 * Follow-up of a plan: the person's next period with a final rating (that this viewer can see), compared with
 * the plan's period: final rating and the average of each area of the plan.
 */
export function planProgress(db, plan) {
  const i = db.periods.findIndex((p) => p.id === plan.periodId);
  const before = computeTarget(db, plan.periodId, plan.targetId);
  for (const p of db.periods.slice(i + 1)) {
    const after = computeTarget(db, p.id, plan.targetId);
    if (after.final == null) continue;
    const ca = categoryAverages(db, plan.periodId, plan.targetId), cb = categoryAverages(db, p.id, plan.targetId);
    return { before: before.final, after: after.final, next: p, change: after.final - (before.final ?? after.final),
      areas: plan.areas.map((a) => ({ area: a, before: ca[a] ?? null, after: cb[a] ?? null })) };
  }
  return { before: before.final, after: null, next: null, areas: [] };
}
/** Where a plan stands, for a badge: [badge kind, words]. */
export function planStatus(plan, now = today()) {
  if (plan.status === 'closed') return plan.outcome === 'improved' ? ['completed', 'Improved'] : plan.outcome === 'not-yet' ? ['overdue', 'Not improved yet'] : ['muted', 'Cancelled'];
  if (!plan.acknowledgedAt) return ['pending', 'Waiting to be read'];
  if (plan.reviewBy < now) return ['overdue', 'Due for review'];
  return ['info', 'In progress'];
}
