// What each signed-in user is allowed to see (FR2, NFR5, NFR6).
// The browser gets a copy of the data with the same shape as before, but with
// everything the user may not see removed. The pages then work as they did.
import { canSeeAll, canSeeOwn, canSeeDept, canSeeComments, isResultHead, personIn, policyFor } from '../src/lib/logic.js';
import { decryptText, opaqueId } from './secrets.js';

// For progress tables we only reveal THAT a student responded, not their answers.
// (sectionStats() only needs to know a response exists to count it.)
const COUNT_ONLY = Object.freeze({ redacted: true, answers: {}, weights: {}, comment: null });

export function viewFor(db, user) {
  const isHR = user.role === 'HR';
  const period = new Map(db.periods.map((p) => [p.id, p]));
  const people = new Map(db.users.map((u) => [u.id, u]));
  const myClasses = new Set(db.sections.filter((s) => s.facultyId === user.id).map((s) => s.id));
  const deptClasses = new Set(
    ['dean', 'chair', 'principal', 'aprincipal'].includes(user.position) ? db.sections.filter((s) => s.dept === user.dept).map((s) => s.id) : [],
  );
  const withComment = (r, allowed) => ({ ...r, comment: allowed && r.comment ? decryptText(r.comment) : null });
  // Anonymity (policy): students' comments about a teacher are shown only when enough students answered,
  // so a comment can't be traced to one of very few students.
  const stAnswered = new Map();
  for (const t of db.tasks) if (t.group === 'ST' && t.response) { const k = t.periodId + '|' + t.targetId; stAnswered.set(k, (stAnswered.get(k) || 0) + 1); }
  const shown = (t, r) => {
    if (t.group !== 'ST') return r;
    const enough = (stAnswered.get(t.periodId + '|' + t.targetId) || 0) >= (policyFor(db, t.periodId).minAnonymity || 0);
    return { ...r, comment: enough ? r.comment : null, commentHidden: !enough && !!r.comment };
  };

  // Nobody but the person who answered gets an answer with who gave it, HR included. Its number and its place in the
  // list would tell too (evaluations are made in the order of the class list), so both are replaced; and the time, so it
  // can't be matched with who was signed in.
  const tasks = [], others = [];
  const show = (t, response) => others.push({ id: opaqueId(t.id), periodId: t.periodId, evaluatorId: null, targetId: t.targetId, group: t.group, sectionId: t.sectionId, draft: null, response: response && response !== COUNT_ONLY ? { ...response, submittedAt: null } : response });
  for (const t of db.tasks) {
    const p = period.get(t.periodId);
    const target = people.get(t.targetId);
    if (t.evaluatorId === user.id) {
      // my own evaluation task (with my saved draft); my submitted comment is not sent back
      tasks.push({ ...t, response: t.response && { ...t.response, comment: null } });
    } else if (isHR) {
      show(t, t.response && withComment(t.response, true));
    } else if (canSeeAll(user, p)) {
      // VPs: released periods only, without evaluator identities
      show(t, t.response && shown(t, withComment(t.response, canSeeComments(user, p))));
    } else if (t.targetId === user.id && canSeeOwn(user, p)) {
      // FR14/NFR5: my own released results, with comments grouped by source but never who gave them
      show(t, t.response && shown(t, withComment(t.response, true)));
    } else if (target && target.id !== user.id && canSeeDept(user, p) && personIn(db, p.id, target).dept === user.dept) {
      // the dean of the department the person was in then
      // FR16/FR18: the dean/principal receives the department's released results (anonymous)
      show(t, t.response && shown(t, withComment(t.response, true)));
    } else if (p.status === 'open' && t.group === 'ST' && (myClasses.has(t.sectionId) || deptClasses.has(t.sectionId))) {
      // live response counts for my classes (faculty) or my department (heads)
      show(t, t.response ? COUNT_ONLY : null);
    }
  }
  tasks.push(...others.sort((a, b) => (a.id < b.id ? -1 : 1)));

  const head = isResultHead(user);
  const pastVisible = (r) => {
    if (isHR || user.role === 'DIR' || r.userId === user.id) return true;
    const u = people.get(r.userId);
    return head && u && u.dept === user.dept;
  };

  const requests = db.requests.filter((r) => isHR || r.headId === user.id);
  // development plans: HR and the VPs see all; a dean or principal those of their department; a person their own
  const plans = (db.plans || []).filter((p) => isHR || user.role === 'DIR' || p.targetId === user.id || (isResultHead(user) && p.targetId !== user.id && (people.get(p.targetId)?.dept === user.dept || personIn(db, p.periodId, people.get(p.targetId)).dept === user.dept)));
  const pastResults = db.pastResults.filter(pastVisible);

  // Only the people and classes this person works with. HR: everyone; VPs: all personnel; heads: also the personnel of
  // their department; the others: themselves and the people they evaluate. Only HR gets the students.
  const all = isHR || user.role === 'DIR', student = user.role === 'ST';
  const who = new Set([user.id, ...tasks.map((t) => t.targetId), ...plans.map((p) => p.targetId), ...requests.map((r) => r.targetId), ...pastResults.map((r) => r.userId)]);
  if (['dean', 'chair', 'principal', 'aprincipal'].includes(user.position)) for (const u of db.users) if (u.dept === user.dept && u.role !== 'ST') who.add(u.id);
  const inTasks = new Set(tasks.map((t) => t.sectionId).filter(Boolean));
  // (the type of classes a teacher has decides the tool of the dean and the other personnel)
  const sections = all ? db.sections : db.sections.filter((s) => inTasks.has(s.id) || myClasses.has(s.id) || deptClasses.has(s.id) || (!student && who.has(s.facultyId)));
  for (const s of sections) who.add(s.facultyId);
  const users = all ? db.users.filter((u) => isHR || u.role !== 'ST' || who.has(u.id)) : db.users.filter((u) => who.has(u.id));
  const studentKeys = isHR ? new Set(db.users.filter((u) => u.role === 'ST').map((u) => u.id)) : null;
  const auto = ({ skip, ...rest }) => ({ ...rest, ...(isHR && skip && { skip: skip.filter((k) => !studentKeys.has(k.split('|')[0])) }) });

  return {
    version: db.version,
    departments: db.departments,
    // never the password hash; HR also gets the account details it manages
    users: users.map((u) => (isHR
      ? { id: u.id, username: u.username, email: u.email, name: u.name, role: u.role, position: u.position, dept: u.dept, evaluatorGroupIds: u.evaluatorGroupIds, active: u.active, mustChangePassword: u.mustChangePassword, hasTempPassword: !!u.tempPassword && u.mustChangePassword, ...(u.deptGuess && { deptGuess: true }) }
      : { id: u.id, name: u.name, role: u.role, position: u.position, dept: u.dept, active: u.active })),
    evaluatorGroups: db.evaluatorGroups || [],
    sections: sections.map((s) => (isHR ? s : { ...s, studentIds: [] })),
    criteria: db.criteria,
    instruments: isHR ? db.instruments : db.instruments.filter((i) => !i.status), // drafts and scheduled versions are HR's until they are used
    rules: db.rules,
    // who was where in a closed period: HR and the VPs get everyone, the others only the people whose results they receive
    periods: db.periods.map((p) => (p.auto ? { ...p, auto: auto(p.auto) } : p)).map((p) => {
      if (all || !p.people) return p;
      const ids = new Set([user.id, ...tasks.filter((t) => t.periodId === p.id).map((t) => t.targetId)]);
      return { ...p, people: Object.fromEntries(Object.entries(p.people).filter(([id]) => ids.has(id))) };
    }),
    policies: db.policies || [],
    formulas: db.formulas || [],
    results: isHR ? db.results || [] : [], // results stored at closing (HR checks them against a fresh computation)
    tasks,
    // who of the personnel evaluates whom, and whether it is done (without the answers); students are counted per class
    ...(isHR && { assignments: db.tasks.filter((t) => t.group !== 'ST').map((t) => ({ id: t.id, periodId: t.periodId, evaluatorId: t.evaluatorId, targetId: t.targetId, group: t.group, sectionId: t.sectionId, done: !!t.response })), settings: db.settings || {} }),
    requests,
    plans,
    pastResults,
    notifications: db.notifications.filter((n) => n.userId === user.id),
  };
}
