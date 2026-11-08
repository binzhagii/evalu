// Core rules of evalU, taken from the thesis manuscript (Chapter 3, Tables 6, 8 and 9).
// Shared by the server (server/*.js) and the browser pages.
//
// - FR11  a class counts only if at least half of the class PLUS ONE answered (50 students -> 26)
// - FR13  qualifying subjects and several program chairs are averaged; an evaluator group with no
//         valid result is removed from the denominator (no dean -> computed over 60%); 2 decimals
// - Table 6  College faculty 40/40/20, Basic Education 40/20/20/20, Non-teaching: head <-> staff
// - FR17  release order: HR -> Directors/VPs (review and approve) -> individual faculty
// Anything the manuscript does not give (e.g. weights for evaluating Deans) stays blank (null)
// until HR enters it; no score is invented.

export const THRESHOLD = 0.5;           // the line drawn on progress bars (the rule itself is half PLUS ONE)
export const LOW_ITEM = 3.5;            // FR19: items averaging below "Very Satisfactory" (Table 4) are flagged
export const REMIND_DAYS = 7;           // FR10: automatic reminders start this many days before the deadline
export const INSTITUTION_DOMAIN = 'ubaguio.edu';

/** FR1: only official UB addresses (…@ubaguio.edu, including …@s.ubaguio.edu for students). */
export const isInstitutionalEmail = (e) =>
  typeof e === 'string' && /^[a-z0-9._%+-]+@([a-z0-9-]+\.)*ubaguio\.edu$/i.test(e.trim());

/** FR11: responses needed for a class to count: half of the class plus one. */
export const neededResponses = (enrolled) => Math.floor(enrolled / 2) + 1;

/** FR6: internship, practicum and field trip subjects are not evaluated. */
export const EXEMPT_SUBJECT = /\b(intern(ship)?s?|practicum|ojt|field ?trips?)\b/i;
export const isExemptSection = (s) => EXEMPT_SUBJECT.test(`${s.subject} ${s.code}`);

export const ROLES = {
  ST: 'Student',
  TP: 'Teaching Personnel',
  NTP: 'Non-Teaching Personnel',
  HR: 'HR Specialist',
  DIR: 'Director / Vice President',
};

// Positions allowed for each role (used when HR creates or edits an account).
export const POSITIONS = {
  ST: { student: 'Student' },
  TP: { faculty: 'Faculty', dean: 'Dean', chair: 'Program Chair', principal: 'Principal', aprincipal: 'Assistant Principal', shead: 'Subject Head' },
  NTP: { secretary: 'Secretary', staff: 'Staff', head: 'Office Head' },
  HR: { hr: 'HR Specialist' },
  DIR: { director: 'Director', vp: 'Vice President' },
};
/** Roles that belong to a department. */
export const needsDept = (role) => role === 'ST' || role === 'TP' || role === 'NTP';

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

export const TARGET_TYPES = {
  COLLEGE_FACULTY: 'College faculty',
  BASICED_TEACHER: 'Basic Ed teacher',
  DEAN: 'Dean',
  NTP_STAFF: 'Non-teaching staff',
  NTP_HEAD: 'Non-teaching office head',
};

export const STAGES = ['hr', 'dir', 'faculty'];
export const STAGE_LABEL = {
  hr: 'HR Specialist only',
  dir: 'With Directors/VPs for review and approval',
  faculty: 'Released to individual faculty',
};

/** Every evaluator group a person belongs to (a secretary evaluates the dean AND their office head). */
export function evaluatorGroups(u) {
  if (!u) return [];
  if (u.role === 'ST') return ['ST'];
  if (u.role === 'NTP') return { secretary: ['SEC', 'NTPSTAFF'], staff: ['NTPSTAFF'], head: ['NTPHEAD'] }[u.position] || [];
  if (u.role === 'TP') {
    const g = { dean: 'DEAN', chair: 'CHAIR', principal: 'PRIN', aprincipal: 'APRIN', shead: 'SHEAD', faculty: 'FAC' }[u.position];
    return g ? [g] : [];
  }
  return [];
}
export const evaluatorGroup = (u) => evaluatorGroups(u)[0] || null;

export function targetType(db, u) {
  if (!u) return null;
  if (u.role === 'TP') {
    if (u.position === 'dean') return 'DEAN';
    if (u.position === 'faculty') {
      const d = db.departments.find((x) => x.id === u.dept);
      return d?.kind === 'basic' ? 'BASICED_TEACHER' : 'COLLEGE_FACULTY';
    }
    return null;
  }
  if (u.role === 'NTP') return u.position === 'head' ? 'NTP_HEAD' : 'NTP_STAFF';
  return null;
}
/** People who get evaluation results of their own (faculty, deans, non-teaching personnel). */
export const isEvaluatee = (u) => (u.role === 'TP' && (u.position === 'faculty' || u.position === 'dean')) || u.role === 'NTP';

export const userById = (db, id) => db.users.find((u) => u.id === id);
export const deptName = (db, id) => db.departments.find((d) => d.id === id)?.name || id;
export const periodById = (db, id) => db.periods.find((p) => p.id === id);
const active = (u) => u && u.active !== false;

/** Department heads alerted about progress (deans, program chairs, principals). */
export const deptHeads = (db, dept) =>
  db.users.filter((u) => active(u) && u.dept === dept && u.role === 'TP' && ['dean', 'chair', 'principal', 'aprincipal'].includes(u.position));
/** FR16/FR18: who receives department results: the dean (college) or principal (Basic Ed). */
export const isResultHead = (u) => u.role === 'TP' && (u.position === 'dean' || u.position === 'principal');
export const resultHeads = (db, dept) => db.users.filter((u) => active(u) && u.dept === dept && isResultHead(u));
export const hrUsers = (db) => db.users.filter((u) => active(u) && u.role === 'HR');
export const directors = (db) => db.users.filter((u) => active(u) && u.role === 'DIR');

/* ---------- forms (FR3, FR4) ---------- */
/** The form in use for a pairing: a department-specific one if it exists, else the general one. */
export function instrumentFor(db, tt, group, dept = null) {
  const list = db.instruments.filter((i) => i.targetType === tt && i.group === group && i.active !== false);
  return (dept && list.find((i) => i.dept === dept)) || list.find((i) => !i.dept) || null;
}
/** The form a not-yet-submitted task is answered on. */
export function formForTask(db, task) {
  const tg = userById(db, task.targetId);
  return tg ? instrumentFor(db, targetType(db, tg), task.group, tg.dept) : null;
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

export function sectionStats(db, periodId, sectionId) {
  const sec = db.sections.find((s) => s.id === sectionId);
  const tasks = db.tasks.filter((t) => t.periodId === periodId && t.sectionId === sectionId && t.group === 'ST');
  const required = tasks.length;
  const done = tasks.filter((t) => t.response);
  const needed = neededResponses(required);
  const rate = required ? done.length / required : 0;
  const valid = required > 0 && done.length >= needed;
  const score = valid ? mean(done.map((t) => responseScore(t.response))) : null;
  return { section: sec, required, responded: done.length, needed, rate, valid, score, belowHalf: required > 0 && !valid };
}

/** NFR8: group weights in force for a period (fixed when the period is closed). */
export const rulesFor = (db, periodId) => periodById(db, periodId)?.rules || db.rules;

export function computeTarget(db, periodId, targetId) {
  const target = userById(db, targetId);
  const tt = targetType(db, target);
  const rule = rulesFor(db, periodId)[tt] || {};
  const groups = {};
  const sections = [];
  for (const g of Object.keys(rule)) {
    const tasks = db.tasks.filter((t) => t.periodId === periodId && t.targetId === targetId && t.group === g);
    if (g === 'ST') {
      const secIds = [...new Set(tasks.map((t) => t.sectionId))];
      const st = secIds.map((id) => sectionStats(db, periodId, id));
      sections.push(...st);
      const valid = st.filter((s) => s.valid);
      groups[g] = { weight: rule[g], score: mean(valid.map((s) => s.score)), required: tasks.length, responded: tasks.filter((t) => t.response).length, invalidSections: st.filter((s) => !s.valid).length };
    } else {
      const done = tasks.filter((t) => t.response);
      groups[g] = { weight: rule[g], score: mean(done.map((t) => responseScore(t.response))), required: tasks.length, responded: done.length };
    }
  }
  const missingW = Object.keys(groups).filter((g) => groups[g].weight == null || groups[g].weight === '');
  const missing = Object.keys(groups).filter((g) => groups[g].score == null);
  const total = Object.values(groups).reduce((a, g) => a + (Number(g.weight) || 0), 0);
  let final = null, status, basis = null;
  if (missingW.length) status = 'weights-missing';
  else {
    // FR13: a group with no valid result is removed from the denominator
    const have = Object.values(groups).filter((g) => g.score != null && Number(g.weight) > 0);
    basis = have.reduce((a, g) => a + Number(g.weight), 0);
    if (!have.length || !basis) { status = 'incomplete'; basis = null; }
    else {
      final = round2(have.reduce((a, g) => a + Number(g.weight) * g.score, 0) / basis);
      status = missing.length ? 'reweighted' : 'complete';
    }
  }
  return { targetId, target, type: tt, groups, sections, final, status, missing, missingW, basis, total };
}
/** A result that has a final score (complete, or re-weighted because a group is missing). */
export const hasFinal = (r) => r.final != null;

export function targetsOf(db) {
  return db.users.filter((u) => targetType(db, u));
}

export function computeAll(db, periodId) {
  return targetsOf(db).map((u) => computeTarget(db, periodId, u.id));
}

/**
 * FR15/FR16/FR19: per-item results. For each criterion: number of answers, the mean and the
 * distribution of ratings 1..5. Student identities are never part of this.
 */
export function itemStats(tasks) {
  const m = new Map();
  for (const t of tasks) {
    if (!t.response || t.response.redacted) continue;
    for (const [cid, v] of Object.entries(t.response.answers)) {
      const x = m.get(cid) || { criterionId: cid, n: 0, sum: 0, dist: [0, 0, 0, 0, 0] };
      x.n++; x.sum += v; x.dist[v - 1]++;
      m.set(cid, x);
    }
  }
  return [...m.values()].map((x) => ({ ...x, mean: x.sum / x.n, low: x.sum / x.n < LOW_ITEM }));
}

// ---------- tasks / workflow ----------
/** FR8: a period covers every department, or only the ones HR selected. */
export const periodCovers = (p, dept) => !p?.depts?.length || p.depts.includes(dept);

export function expectedAssignments(db, periodId) {
  // Rule-based evaluator assignment from user attributes (role, position, department) and class lists.
  // Deactivated accounts get no new tasks (their past results stay in the reports).
  const p = periodById(db, periodId);
  const out = [];
  for (const t of targetsOf(db).filter(active)) {
    if (!periodCovers(p, t.dept)) continue;
    const tt = targetType(db, t);
    for (const g of Object.keys(rulesFor(db, periodId)[tt] || {})) {
      if (g === 'ST') {
        for (const sec of db.sections.filter((s) => s.facultyId === t.id && !isExemptSection(s)))
          for (const sid of sec.studentIds.filter((id) => active(userById(db, id)))) out.push({ evaluatorId: sid, targetId: t.id, group: g, sectionId: sec.id });
      } else {
        for (const e of db.users.filter((u) => active(u) && u.dept === t.dept && evaluatorGroups(u).includes(g) && u.id !== t.id))
          out.push({ evaluatorId: e.id, targetId: t.id, group: g, sectionId: null });
      }
    }
  }
  return out;
}

export function generateTasks(draft, periodId) {
  // idempotent; returns {added, skippedNoForm}
  const have = new Set(draft.tasks.filter((t) => t.periodId === periodId).map((t) => `${t.evaluatorId}|${t.targetId}|${t.group}|${t.sectionId || ''}`));
  let added = 0, skippedNoForm = 0;
  for (const a of expectedAssignments(draft, periodId)) {
    const key = `${a.evaluatorId}|${a.targetId}|${a.group}|${a.sectionId || ''}`;
    if (have.has(key)) continue;
    if (!formForTask(draft, a)) { skippedNoForm++; continue; }
    draft.tasks.push({ id: uid('t'), periodId, ...a, draft: null, response: null });
    added++;
  }
  return { added, skippedNoForm };
}

let _n = 0;
export const uid = (p) => `${p}_${Date.now().toString(36)}${(_n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const today = () => new Date().toISOString().slice(0, 10);

/** Adds a notification unless one with the same key already exists. Returns true if added. */
export function notify(draft, { key, userId, kind, text }) {
  if (key && draft.notifications.some((n) => n.key === key)) return false;
  draft.notifications.push({ id: uid('n'), key, userId, kind, at: new Date().toISOString(), read: false, text });
  return true;
}
const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// ---------- FR11 / FR12: participation threshold + notifying the parties concerned ----------
/**
 * Notifies the faculty member, the department heads and HR about every class at or below half.
 * final = false: progress warning while the period is open (once a day).
 * final = true:  the period was closed and these classes are excluded (once).
 * Returns the number of classes below the threshold.
 */
function participationNotices(draft, periodId, final) {
  const p = periodById(draft, periodId);
  const day = today();
  const low = draft.sections.map((s) => sectionStats(draft, periodId, s.id)).filter((st) => st.required && !st.valid);
  const kind = final ? 'invalidated' : 'participation';
  const tag = final ? `thr|${periodId}` : `part|${periodId}|${day}`;
  const line = (st) => `${st.section.code} (${st.section.subject}) – ${userById(draft, st.section.facultyId)?.name}: ${st.responded} of ${st.required} answered, ${st.needed} needed`;
  for (const st of low) {
    const s = st.section;
    notify(draft, {
      key: final ? `thr|${periodId}|${s.id}` : `${tag}|${s.id}`, userId: s.facultyId, kind,
      text: final
        ? `Student evaluation for ${s.code} (${s.subject}) in ${p.name} is excluded from your result: only ${st.responded} of ${st.required} students answered, and at least ${st.needed} (half of the class plus one) were needed.`
        : `Only ${st.responded} of ${st.required} students in ${s.code} (${s.subject}) have answered the evaluation for ${p.name}. At least ${st.needed} (half of the class plus one) are needed by ${fmtDate(p.deadline)}, or this class won't count. Please remind your students.`,
    });
  }
  const byDept = {};
  for (const st of low) (byDept[st.section.dept] ||= []).push(st);
  for (const [dept, list] of Object.entries(byDept)) {
    for (const h of deptHeads(draft, dept)) {
      notify(draft, {
        key: `${tag}|dept|${dept}|${h.id}`, userId: h.id, kind,
        text: `${final ? `${p.name} was closed. These classes in your department are excluded` : `${list.length} class(es) in your department are at or below half for ${p.name}`}: ${list.map(line).join('; ')}.`,
      });
    }
  }
  if (low.length) {
    for (const h of hrUsers(draft)) {
      notify(draft, {
        key: `${tag}|hr|${h.id}`, userId: h.id, kind,
        text: `${p.name}: ${low.length} class(es) ${final ? 'were excluded because' : 'are at or below half;'} fewer than half of the class plus one answered. ${low.slice(0, 5).map(line).join('; ')}${low.length > 5 ? `; and ${low.length - 5} more` : ''}.`,
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
      text: `${overdue ? 'OVERDUE' : 'Reminder'}: you have ${list.length} evaluation(s) not yet submitted for ${p.name} (${names.slice(0, 3).join(', ')}${names.length > 3 ? ', …' : ''}). ${overdue ? 'The deadline has passed' : `Deadline: ${fmtDate(p.deadline)}`}.`,
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
        text: `${p.name}: in your department, ${c.staff} evaluation(s) by personnel and ${c.students} by students are still not submitted. ${overdue ? 'The deadline has passed.' : `Deadline: ${fmtDate(p.deadline)}.`}`,
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
export function runDailyAutomation(draft) {
  const day = today();
  let ran = 0;
  for (const p of draft.periods.filter((x) => x.status === 'open')) {
    if (p.lastAuto === day) continue;
    const daysLeft = Math.round((new Date(p.deadline + 'T00:00:00') - new Date(day + 'T00:00:00')) / 86400000);
    if (daysLeft > REMIND_DAYS) continue;
    sendReminders(draft, p.id);
    participationAlerts(draft, p.id);
    p.lastAuto = day;
    ran++;
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
  return stageAtLeast(period, 'faculty') && isEvaluatee(user);
}
/** FR16: deans/principals see their department's results once released to faculty. */
export function canSeeDept(user, period) {
  return isResultHead(user) && stageAtLeast(period, 'faculty');
}
export const canSeeComments = canSeeAll;

/** FR17: Directors/VPs who still have to approve a period before it can go to faculty. */
export function pendingApprovals(db, period) {
  const done = new Set((period.approvals || []).map((a) => a.userId));
  return directors(db).filter((u) => !done.has(u.id));
}
