// Core rules of evalU, taken from the thesis manuscript.
// - 50% participation threshold per class section (students)
// - College faculty: Students 40% / Dean 40% / Program Chair 20%
// - Result release order: HR Specialist -> Directors/VPs -> individual faculty
// Anything the manuscript does not specify (Basic Ed and Dean weights) is left
// null and must be entered by HR; no score is computed until it is set.

export const THRESHOLD = 0.5;

export const ROLES = {
  ST: 'Student',
  TP: 'Teaching Personnel',
  NTP: 'Non-Teaching Personnel',
  HR: 'HR Specialist',
  DIR: 'Director / Vice President',
};

export const GROUPS = {
  ST: 'Students',
  DEAN: 'Dean',
  CHAIR: 'Program Chair',
  SEC: 'Secretary',
  FAC: 'Faculty',
  PRIN: 'Principal',
  APRIN: 'Assistant Principal',
  SHEAD: 'Subject Head',
};

export const TARGET_TYPES = {
  COLLEGE_FACULTY: 'College faculty',
  BASICED_TEACHER: 'Basic Ed teacher',
  DEAN: 'Dean',
};

export const STAGES = ['hr', 'dir', 'faculty'];
export const STAGE_LABEL = {
  hr: 'HR Specialist only',
  dir: 'Released to Directors/VPs',
  faculty: 'Released to individual faculty',
};

export function evaluatorGroup(u) {
  if (u.role === 'ST') return 'ST';
  if (u.role === 'NTP' && u.position === 'secretary') return 'SEC';
  if (u.role === 'TP') {
    return { dean: 'DEAN', chair: 'CHAIR', principal: 'PRIN', aprincipal: 'APRIN', shead: 'SHEAD', faculty: 'FAC' }[u.position] || null;
  }
  return null;
}

export function targetType(db, u) {
  if (u.role !== 'TP') return null;
  if (u.position === 'dean') return 'DEAN';
  if (u.position === 'faculty') {
    const d = db.departments.find((x) => x.id === u.dept);
    return d?.kind === 'basic' ? 'BASICED_TEACHER' : 'COLLEGE_FACULTY';
  }
  return null;
}

export const userById = (db, id) => db.users.find((u) => u.id === id);
export const deptName = (db, id) => db.departments.find((d) => d.id === id)?.name || id;
export const periodById = (db, id) => db.periods.find((p) => p.id === id);

export const instrumentFor = (db, tt, group) =>
  db.instruments.find((i) => i.targetType === tt && i.group === group);

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

export function sectionStats(db, periodId, sectionId) {
  const sec = db.sections.find((s) => s.id === sectionId);
  const tasks = db.tasks.filter((t) => t.periodId === periodId && t.sectionId === sectionId && t.group === 'ST');
  const required = tasks.length;
  const done = tasks.filter((t) => t.response);
  const rate = required ? done.length / required : 0;
  const valid = required > 0 && rate >= THRESHOLD;
  const score = valid ? mean(done.map((t) => responseScore(t.response))) : null;
  return { section: sec, required, responded: done.length, rate, valid, score, belowHalf: required > 0 && rate < THRESHOLD };
}

export function computeTarget(db, periodId, targetId) {
  const target = userById(db, targetId);
  const tt = targetType(db, target);
  const rule = db.rules[tt] || {};
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
  let final = null, status = 'complete';
  if (missingW.length) status = 'weights-missing';
  else if (missing.length) status = 'incomplete';
  else {
    const tw = Object.values(groups).reduce((a, g) => a + Number(g.weight), 0);
    final = Object.values(groups).reduce((a, g) => a + Number(g.weight) * g.score, 0) / tw;
  }
  return { targetId, target, type: tt, groups, sections, final, status, missing, missingW };
}

export function targetsOf(db) {
  return db.users.filter((u) => targetType(db, u));
}

export function computeAll(db, periodId) {
  return targetsOf(db).map((u) => computeTarget(db, periodId, u.id));
}

// ---------- tasks / workflow ----------
export function expectedAssignments(db) {
  // Rule-based evaluator assignment from user attributes (role, position, department).
  const out = [];
  for (const t of targetsOf(db)) {
    const tt = targetType(db, t);
    for (const g of Object.keys(db.rules[tt] || {})) {
      if (g === 'ST') {
        for (const sec of db.sections.filter((s) => s.facultyId === t.id))
          for (const sid of sec.studentIds) out.push({ evaluatorId: sid, targetId: t.id, group: g, sectionId: sec.id });
      } else {
        for (const e of db.users.filter((u) => u.dept === t.dept && evaluatorGroup(u) === g && u.id !== t.id))
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
  for (const a of expectedAssignments(draft)) {
    const key = `${a.evaluatorId}|${a.targetId}|${a.group}|${a.sectionId || ''}`;
    if (have.has(key)) continue;
    const tt = targetType(draft, userById(draft, a.targetId));
    if (!instrumentFor(draft, tt, a.group)) { skippedNoForm++; continue; }
    draft.tasks.push({ id: uid('t'), periodId, ...a, draft: null, response: null });
    added++;
  }
  return { added, skippedNoForm };
}

let _n = 0;
export const uid = (p) => `${p}_${Date.now().toString(36)}${(_n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------- 50% threshold check + invalidation notifications ----------
export function runThresholdCheck(draft, periodId) {
  const p = periodById(draft, periodId);
  let flagged = 0;
  for (const sec of draft.sections) {
    const st = sectionStats(draft, periodId, sec.id);
    if (!st.required || st.valid) continue;
    flagged++;
    const key = `thr|${periodId}|${sec.id}`;
    if (draft.notifications.some((n) => n.key === key)) continue;
    draft.notifications.push({
      id: uid('n'), key, userId: sec.facultyId, kind: 'invalidated', at: new Date().toISOString(), read: false,
      text: `Student evaluation for ${sec.code} (${sec.subject}) in ${p.name} is invalidated: only ${st.responded} of ${st.required} students responded (${Math.round(st.rate * 100)}%). At least 50% are required.`,
    });
  }
  p.thresholdChecked = true;
  return flagged;
}

export function sendReminders(draft, periodId) {
  let sent = 0;
  for (const t of draft.tasks.filter((x) => x.periodId === periodId && !x.response)) {
    const key = `rem|${t.id}|${new Date().toISOString().slice(0, 10)}`;
    if (draft.notifications.some((n) => n.key === key)) continue;
    const target = userById(draft, t.targetId);
    const st = taskStatus(draft, t);
    draft.notifications.push({
      id: uid('n'), key, userId: t.evaluatorId, kind: st === 'overdue' ? 'overdue' : 'reminder', at: new Date().toISOString(), read: false,
      text: `${st === 'overdue' ? 'OVERDUE' : 'Reminder'}: your evaluation of ${target.name} is not yet submitted.`,
    });
    sent++;
  }
  return sent;
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
export function canSeeOwn(user, period) {
  return stageAtLeast(period, 'faculty') && !!targetType_safe(user);
}
const targetType_safe = (u) => u.role === 'TP' && (u.position === 'faculty' || u.position === 'dean');
export const canSeeComments = canSeeAll;
