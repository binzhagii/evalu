// The evaluation cycle: what HR does each semester, in order, and what is already done (from the real data).
// Also where a notification leads. Used by the Overview and Notifications pages.
import {
  TARGET_TYPES, activeDepts, closesAt, deptsToConfirm, deadlinePassed, notStarted, inTerm, suggestClassType, termLabel, termOf, today, workingTerm, computeAll, deptWarnings, currentPolicy, missingEvaluations, formulaFor, hasFinal, isEvaluatee, isExemptSection, methodOf, needsPlan,
  participationForecast, pendingApprovals, periodCovers, plural, policyFor, stageAtLeast, targetType, toolName, toolProblems, toolStatus,
} from './logic.js';

/** The categories with people but without percentages. */
function unsetCategories(db) {
  const used = new Set(db.users.filter((u) => u.active !== false).map((u) => targetType(db, u)));
  return Object.keys(TARGET_TYPES).filter((tt) => {
    if (!used.has(tt)) return false;
    const f = formulaFor(db, null, tt, null);
    return !f.components.length || (methodOf(f.method, f.methodVersion ?? 1)?.usesWeights && f.components.some((c) => c.weight == null || c.weight === ''));
  });
}
/** The period the checklist is about: the newest open one, else the newest one. */
export const cyclePeriod = (db) => [...db.periods].reverse().find((p) => p.status === 'open') || db.periods.at(-1) || null;

/**
 * The steps of a semester, in order: [{ key, group, title, page, label, done, detail }].
 * done: true / false, or null for a step that has nothing to check (it never holds up the next one).
 * The first step that is not done is the next one to do.
 */
export function cycleSteps(db, p) {
  const open = p?.status === 'open', closed = p?.status === 'closed';
  const broken = db.instruments.filter((i) => toolStatus(i) === 'in-use' && i.items.length && toolProblems(i).length);
  const drafts = db.instruments.filter((i) => toolStatus(i) === 'draft').length;

  const unset = unsetCategories(db);
  const waitingVp = (db.formulas || []).filter((f) => f.status === 'pending').length;

  const version = currentPolicy(db).version;
  const classes = db.sections.filter((s) => !isExemptSection(s) && !s.replaced && inTerm(p, s) && (!p || periodCovers(p, s.dept)));
  const empty = classes.filter((s) => !s.studentIds.length);
  const heads = activeDepts(db).filter((d) => (!p || periodCovers(p, d.id)) && deptWarnings(db, d).length);

  const tasks = p ? db.tasks.filter((t) => t.periodId === p.id) : [];
  const missing = open ? missingEvaluations(db, p.id) : 0;
  const answered = tasks.filter((t) => t.response).length;
  const risk = open ? classes.filter((s) => participationForecast(db, p.id, s.id)?.status === 'at-risk').length : 0;

  const results = closed ? computeAll(db, p.id).filter((r) => periodCovers(p, r.dept)) : [];
  const rated = results.filter(hasFinal).length;
  const sent = !!p && stageAtLeast(p, 'dir'), released = !!p && stageAtLeast(p, 'faculty');
  const vps = sent && !released ? pendingApprovals(db, p) : [];
  const pol = p ? policyFor(db, p.id) : null;
  const low = released ? results.filter((r) => needsPlan(r, pol)) : [];
  const noPlan = low.filter((r) => !(db.plans || []).some((x) => x.targetId === r.targetId && x.periodId === p.id)).length;

  const S = (key, group, title, page, label, done, detail) => ({ key, group, title, page, label, done, detail });
  return [
    S('tools', 'Prepare', 'Check the evaluation tools', 'forms', 'Evaluation tools', !broken.length,
      broken.length ? `Needs fixing: ${broken.map((i) => toolName(db, i)).join(', ')}` : `Every tool in use is complete${drafts ? ` · ${plural(drafts, 'draft')} not used yet` : ''}`),
    S('scoring', 'Prepare', 'Check the scoring of every category', 'formulas', 'Scoring & calculation', !unset.length,
      unset.length ? `Percentages not set: ${unset.map((t) => TARGET_TYPES[t]).join(', ')}` : `Every category has its percentages${waitingVp ? ` · ${plural(waitingVp, 'formula')} waiting for the VP` : ''}`),
    S('rules', 'Prepare', 'Check the evaluation rules', 'policy', 'Evaluation rules', null, version ? `Rules version ${version}. Change them only when HRMC changes its policy.` : "UB's starting rules. Change them only when HRMC changes its policy."),
    S('classes', 'Prepare', 'Import the class lists', 'classes', 'Class lists', classes.length > 0 && !empty.length,
      !classes.length ? 'Import them from the Registrar or ARC during or after the first grading period, when students who dropped are no longer on the list.' : empty.length ? `${plural(empty.length, 'class has', 'classes have')} no students: ${empty.slice(0, 4).map((s) => s.code).join(', ')}${empty.length > 4 ? '…' : ''}` : `${plural(classes.length, 'class', 'classes')} of ${p ? termLabel(termOf(p.name)) : termLabel(workingTerm(db))}.${heads.length ? ` ${plural(heads.length, 'department')} with a missing rater: ${heads.slice(0, 3).map((d) => d.name).join(', ')}${heads.length > 3 ? '…' : ''}.` : ''}`),
    S('period', 'Run', 'Create the evaluation period', 'periods', 'Dates & release', !!p, p ? p.name : 'Choose the school year, semester and dates.'),
    S('tasks', 'Run', 'Evaluations are created by themselves', 'assign', 'Evaluation tasks', tasks.length > 0 && !missing,
      !p ? 'evalU prepares who evaluates whom.' : !tasks.length ? (notStarted(p) ? 'They are created on the start date.' : 'None yet.') : missing ? `${tasks.length} created · ${plural(missing, 'evaluation')} more to create` : `${tasks.length} created`),
    S('monitor', 'Run', 'Follow the responses', 'monitor', 'Response progress', closed || (tasks.length > 0 && answered === tasks.length),
      !tasks.length ? 'See who has answered and send reminders.' : `${answered} of ${tasks.length} answered${risk ? ` · ${plural(risk, 'class', 'classes')} at risk` : ''}`),
    S('close', 'Run', 'The period closes after the deadline', 'periods', 'Dates & release', closed, closed ? (p.auto?.closedBy ? 'Closed by itself' : 'Closed') : open ? `It closes by itself 24 hours after the deadline: ${new Date(`${p.deadline}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : 'Ratings are computed when it is closed.'),
    S('review', 'Results', 'Review the results', 'reports', 'View & print results', sent, closed ? `${rated} of ${results.length} people have a final rating` : 'Check the ratings before anyone else sees them.'),
    S('send', 'Results', 'Send the results to the VPs', 'periods', 'Dates & release', sent, sent ? 'Sent' : p?.rejections?.length ? `Returned by ${p.rejections.at(-1).name}: "${p.rejections.at(-1).reason}"` : 'The VPs review and approve them.'),
    S('approve', 'Results', 'VP approval', 'periods', 'Dates & release', sent && (released || !vps.length), released ? 'Approved' : !sent ? 'The VPs approve, or return the results with a reason.' : vps.length ? `Waiting for ${vps.map((u) => u.name).join(', ')}` : 'Approved: you can release the results.'),
    S('release', 'Results', 'Release to faculty and department heads', 'periods', 'Dates & release', released, released ? 'Released' : 'Each person sees only their own result.'),
    S('print', 'Follow up', 'Print the reports', 'reports', 'View & print results', null, 'Comprehensive, performance evaluation and verbatim sheets.'),
    S('plans', 'Follow up', 'Development plans', 'reports', 'View & print results', released ? !noPlan : false,
      !released ? 'For everyone rated Fair or Poor.' : noPlan ? `${plural(noPlan, 'person', 'people')} rated Fair or Poor without a plan` : low.length ? 'Everyone rated Fair or Poor has a plan' : 'No one is rated Fair or Poor'),
  ];
}
/** The next step to do (null when the semester is finished). */
export const nextStep = (steps) => steps.find((s) => s.done === false) || null;

/**
 * Where a notification leads: { page, args } or null. It is read from the notification's key, so the ones sent
 * before this existed work too. `pages` = the pages this person has; the first one they have is used.
 */
export function linkFor(n, db, user, pages) {
  const [what, a, b] = String(n.key || '').split('|');
  const isPeriod = db.periods.some((p) => p.id === a);
  const to = (list, args = {}) => { const page = list.find((x) => pages.includes(x)); return page ? { page, args } : null; };
  const inPeriod = isPeriod ? { periodId: a } : {};
  switch (what) {
    case 'rel': return b === 'dir' ? to(['reports'], inPeriod) : b === 'head' ? to(['dept'], inPeriod) : to(['results'], inPeriod);
    case 'ret': case 'appr': return to(['periods'], inPeriod);
    case 'fx': { const f = (db.formulas || []).find((x) => x.id === a); return to(['formulas'], f ? { tt: f.targetType, dept: f.dept || '' } : {}); }
    case 'dp': case 'dpu': case 'dpc': return to(['results'], { tab: 'plans' });
    case 'dpa': { const plan = (db.plans || []).find((x) => x.id === a); return to(['reports', 'dept'], { ...(plan && { periodId: plan.periodId }), tab: 'plans' }); }
    case 'rq': return to(['dept'], inPeriod);
    case 'rem': case 'ext': return to(['tasks']);
    case 'cls': return to(['periods'], inPeriod);
    case 'vpr': return to(['reports'], inPeriod);
    case 'dpr': return to(['reports', 'dept'], { tab: 'plans' });
    case 'remdept': return to(['monitor']);
    case 'remhr': return to(['assign'], inPeriod);
    case 'thr': return isEvaluatee(user) && user.role !== 'HR' && b !== 'dept' ? to(['results']) : to(user.role === 'HR' ? ['reports'] : ['dept', 'monitor'], { ...inPeriod, tab: 'section' });
    case 'part': case 'fc': case 'fcd': case 'fch': return what === 'fc' || (user.position === 'faculty' || user.position === 'ci') ? to(['results'], { tab: 'classes' }) : to(['monitor'], { tab: 'class' });
    default: return null;
  }
}

/** What needs a decision from HR now: [{ text, page, args, label }]. Everything else evalU does by itself. */
export function needsYou(db) {
  const out = [];
  const add = (text, page, label, args = {}) => out.push({ text, page, label, args });
  const fmt = (ms) => new Date(ms).toLocaleString('en-US', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  for (const p of db.periods) {
    if (p.status === 'open' && deadlinePassed(p)) add(`${p.name}: the deadline has passed. It closes by itself on ${fmt(closesAt(p))}, unless you extend it.`, 'periods', 'Dates & release');
    if (p.status === 'closed' && p.releaseStage === 'hr') add(p.rejections?.length ? `${p.name}: returned by ${p.rejections.at(-1).name}: "${p.rejections.at(-1).reason}"` : `${p.name} is closed: review the results and send them to the VPs.`, 'periods', 'Dates & release');
    if (p.releaseStage === 'dir' && !pendingApprovals(db, p).length) add(`${p.name}: the VPs approved. Release the results to faculty.`, 'periods', 'Dates & release');
  }
  const broken = db.instruments.filter((i) => toolStatus(i) === 'in-use' && i.items.length && toolProblems(i).length);
  for (const i of broken) add(`${toolName(db, i)}: ${toolProblems(i)[0]}`, 'forms', 'Evaluation tools', { toolId: i.id });
  for (const tt of unsetCategories(db)) add(`${TARGET_TYPES[tt]}: the percentages are not set, so nobody gets a rating.`, 'formulas', 'Scoring & calculation', { tt, dept: '' });
  for (const f of db.formulas || []) {
    if (f.status === 'rejected') add(`The formula for ${TARGET_TYPES[f.targetType]} was returned by the VP: "${f.meta.rejectReason}"`, 'formulas', 'Scoring & calculation', { tt: f.targetType, dept: f.dept || '' });
    if (f.status === 'approved') add(`The formula for ${TARGET_TYPES[f.targetType]} is approved: choose when it starts.`, 'formulas', 'Scoring & calculation', { tt: f.targetType, dept: f.dept || '' });
  }
  const term = workingTerm(db), classes = db.sections.filter((s) => s.term === term && !isExemptSection(s) && !s.replaced);
  const types = classes.filter((s) => suggestClassType(db, s)).length, empty = classes.filter((s) => !s.studentIds.length).length;
  if (db.periods.some((p) => p.status === 'open' && termOf(p.name) === term) && !classes.length) add(`No class list for ${termLabel(term)} yet, so students have nothing to evaluate.`, 'classes', 'Class lists', { tab: 'import' });
  if (types) add(`${plural(types, 'class looks', 'classes look')} like laboratory or clinical: confirm the type.`, 'classes', 'Class lists', { tab: 'confirm' });
  const unsure = deptsToConfirm(db).length;
  if (unsure) add(`${plural(unsure, 'new student')} may be in the wrong department: confirm it.`, 'classes', 'Class lists', { tab: 'confirm' });
  if (empty) add(`${plural(empty, 'class has', 'classes have')} no students.`, 'classes', 'Class lists');
  for (const d of activeDepts(db)) { const w = deptWarnings(db, d); if (w.length) add(`${d.name}: ${w[0]}${w.length > 1 ? ` And ${w.length - 1} more.` : ''}`, 'departments', 'Departments & offices', { deptId: d.id }); }
  const due = (db.plans || []).filter((x) => x.status === 'open' && x.reviewBy < today()).length;
  if (due) add(`${plural(due, 'development plan is', 'development plans are')} due for review.`, 'reports', 'View & print results', { tab: 'plans' });
  return out;
}
