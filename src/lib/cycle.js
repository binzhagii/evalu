// The evaluation cycle: what HR does each semester, in order, and what is already done (from the real data).
// Also where a notification leads. Used by the Overview and Notifications pages.
import {
  TARGET_TYPES, computeAll, currentPolicy, expectedAssignments, formulaFor, hasFinal, isEvaluatee, isExemptSection, methodOf, needsPlan,
  participationForecast, pendingApprovals, periodCovers, plural, policyFor, stageAtLeast, targetType, toolName, toolProblems, toolStatus,
} from './logic.js';

/** The period the checklist is about: the newest open one, else the newest one. */
export const cyclePeriod = (db) => [...db.periods].reverse().find((p) => p.status === 'open') || db.periods.at(-1) || null;

/**
 * The steps of a semester, in order: [{ key, group, title, page, label, done, detail }].
 * done: true / false, or null for a step that has nothing to check (it never holds up the next one).
 * The first step that is not done is the next one to do.
 */
export function cycleSteps(db, p) {
  const open = p?.status === 'open', closed = p?.status === 'closed';
  const people = db.users.filter((u) => u.active !== false);

  const broken = db.instruments.filter((i) => toolStatus(i) === 'in-use' && i.items.length && toolProblems(i).length);
  const drafts = db.instruments.filter((i) => toolStatus(i) === 'draft').length;

  const unset = Object.keys(TARGET_TYPES).filter((tt) => people.some((u) => targetType(db, u) === tt) && (() => {
    const f = formulaFor(db, null, tt, null);
    return !f.components.length || (methodOf(f.method, f.methodVersion ?? 1)?.usesWeights && f.components.some((c) => c.weight == null || c.weight === ''));
  })());
  const waitingVp = (db.formulas || []).filter((f) => f.status === 'pending').length;

  const version = currentPolicy(db).version;
  const classes = db.sections.filter((s) => !isExemptSection(s) && (!p || periodCovers(p, s.dept)));
  const empty = classes.filter((s) => !s.studentIds.length);

  const tasks = p ? db.tasks.filter((t) => t.periodId === p.id) : [];
  const have = new Set(tasks.map((t) => `${t.evaluatorId}|${t.targetId}|${t.group}|${t.sectionId || ''}`));
  const missing = open ? expectedAssignments(db, p.id).filter((a) => !have.has(`${a.evaluatorId}|${a.targetId}|${a.group}|${a.sectionId || ''}`)).length : 0;
  const answered = tasks.filter((t) => t.response).length;
  const risk = open ? classes.filter((s) => participationForecast(db, p.id, s.id)?.status === 'at-risk').length : 0;

  const results = closed ? computeAll(db, p.id).filter((r) => periodCovers(p, r.target.dept)) : [];
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
    S('classes', 'Prepare', 'Add the classes, students and staff', 'classes', 'Classes & students', classes.length > 0 && !empty.length,
      !classes.length ? 'No class yet. Import the class list from the Registrar or ARC.' : empty.length ? `${plural(empty.length, 'class has', 'classes have')} no students: ${empty.slice(0, 4).map((s) => s.code).join(', ')}${empty.length > 4 ? '…' : ''}` : `${plural(classes.length, 'class', 'classes')}. Check that they are this semester's.`),
    S('period', 'Run', 'Create the evaluation period', 'periods', 'Dates & release', !!p, p ? p.name : 'Choose the school year, semester and dates.'),
    S('tasks', 'Run', 'Create the evaluation tasks', 'assign', 'Evaluation tasks', tasks.length > 0 && !missing,
      !p ? 'evalU prepares who evaluates whom.' : !tasks.length ? 'Not created yet.' : missing ? `${tasks.length} created · ${plural(missing, 'evaluation')} more to create` : `${tasks.length} created`),
    S('monitor', 'Run', 'Follow the responses', 'monitor', 'Response progress', closed || (tasks.length > 0 && answered === tasks.length),
      !tasks.length ? 'See who has answered and send reminders.' : `${answered} of ${tasks.length} answered${risk ? ` · ${plural(risk, 'class', 'classes')} at risk` : ''}`),
    S('close', 'Run', 'Close the period after the deadline', 'periods', 'Dates & release', closed, closed ? 'Closed' : open ? `Deadline: ${new Date(`${p.deadline}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : 'Ratings are computed when it is closed.'),
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
    case 'dp': case 'dpu': case 'dpc': return to(['results']);
    case 'dpa': { const plan = (db.plans || []).find((x) => x.id === a); return to(['reports', 'dept'], { ...(plan && { periodId: plan.periodId }), tab: 'plans' }); }
    case 'rq': return to(['dept'], inPeriod);
    case 'rem': return to(['tasks']);
    case 'remdept': return to(['monitor']);
    case 'remhr': return to(['assign'], inPeriod);
    case 'thr': return isEvaluatee(user) && user.role !== 'HR' && b !== 'dept' ? to(['results']) : to(user.role === 'HR' ? ['reports'] : ['dept', 'monitor'], { ...inPeriod, tab: 'section' });
    case 'part': case 'fc': case 'fcd': case 'fch': return what === 'fc' || (user.position === 'faculty' || user.position === 'ci') ? to(['results']) : to(['monitor']);
    default: return null;
  }
}
