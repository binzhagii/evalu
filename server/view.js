// What each signed-in user is allowed to see (FR2, NFR5, NFR6).
// The browser gets a copy of the data with the same shape as before, but with
// everything the user may not see removed. The pages then work as they did.
import { canSeeAll, canSeeOwn, canSeeDept, canSeeComments, isResultHead } from '../src/lib/logic.js';
import { decryptText } from './secrets.js';

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

  const tasks = [];
  for (const t of db.tasks) {
    const p = period.get(t.periodId);
    const target = people.get(t.targetId);
    if (t.evaluatorId === user.id) {
      // my own evaluation task (with my saved draft); my submitted comment is not sent back
      tasks.push({ ...t, response: t.response && { ...t.response, comment: null } });
    } else if (isHR) {
      tasks.push({ ...t, draft: null, response: t.response && withComment(t.response, true) });
    } else if (canSeeAll(user, p)) {
      // Directors/VPs: released periods only, without evaluator identities
      tasks.push({ ...t, evaluatorId: null, draft: null, response: t.response && withComment(t.response, canSeeComments(user, p)) });
    } else if (t.targetId === user.id && canSeeOwn(user, p)) {
      // FR14/NFR5: my own released results, with comments grouped by source but never who gave them
      tasks.push({ ...t, evaluatorId: null, draft: null, response: t.response && withComment(t.response, true) });
    } else if (target && target.id !== user.id && target.dept === user.dept && canSeeDept(user, p)) {
      // FR16/FR18: the dean/principal receives the department's released results (anonymous)
      tasks.push({ ...t, evaluatorId: null, draft: null, response: t.response && withComment(t.response, true) });
    } else if (p.status === 'open' && t.group === 'ST' && (myClasses.has(t.sectionId) || deptClasses.has(t.sectionId))) {
      // live response counts for my classes (faculty) or my department (heads)
      tasks.push({ ...t, evaluatorId: null, draft: null, response: t.response ? COUNT_ONLY : null });
    }
  }

  const head = isResultHead(user);
  const pastVisible = (r) => {
    if (isHR || user.role === 'DIR' || r.userId === user.id) return true;
    const u = people.get(r.userId);
    return head && u && u.dept === user.dept;
  };

  return {
    version: db.version,
    departments: db.departments,
    // never the password hash; HR also gets the account details it manages
    users: db.users.map(({ id, username, email, name, role, position, dept, active, mustChangePassword }) => (isHR
      ? { id, username, email, name, role, position, dept, active, mustChangePassword }
      : { id, name, role, position, dept, active })),
    sections: db.sections.map((s) => (isHR ? s : { ...s, studentIds: [] })),
    criteria: db.criteria,
    instruments: db.instruments,
    rules: db.rules,
    periods: db.periods,
    tasks,
    requests: db.requests.filter((r) => isHR || r.headId === user.id),
    pastResults: db.pastResults.filter(pastVisible),
    notifications: db.notifications.filter((n) => n.userId === user.id),
  };
}
