// What each signed-in user is allowed to see.
// The browser gets a copy of the data with the same shape as before, but with
// everything the user may not see removed. The pages then work as they did.
import { canSeeAll, canSeeOwn, canSeeComments } from '../src/lib/logic.js';
import { decryptText } from './secrets.js';

// For progress tables we only reveal THAT a student responded, not their answers.
// (sectionStats() only needs to know a response exists to count it.)
const COUNT_ONLY = Object.freeze({ redacted: true, answers: {}, weights: {}, comment: null });

export function viewFor(db, user) {
  const isHR = user.role === 'HR';
  const period = new Map(db.periods.map((p) => [p.id, p]));
  const myClasses = new Set(db.sections.filter((s) => s.facultyId === user.id).map((s) => s.id));
  const deptClasses = new Set(
    user.position === 'dean' || user.position === 'chair' ? db.sections.filter((s) => s.dept === user.dept).map((s) => s.id) : [],
  );
  const withComment = (r, allowed) => ({ ...r, comment: allowed && r.comment ? decryptText(r.comment) : null });

  const tasks = [];
  for (const t of db.tasks) {
    const p = period.get(t.periodId);
    if (t.evaluatorId === user.id) {
      // my own evaluation task (with my saved draft); my submitted comment is not sent back
      tasks.push({ ...t, response: t.response && { ...t.response, comment: null } });
    } else if (isHR) {
      tasks.push({ ...t, draft: null, response: t.response && withComment(t.response, true) });
    } else if (canSeeAll(user, p)) {
      // Directors/VPs: released periods only, without evaluator identities
      tasks.push({ ...t, evaluatorId: null, draft: null, response: t.response && withComment(t.response, canSeeComments(user, p)) });
    } else if (t.targetId === user.id && canSeeOwn(user, p)) {
      // my own released results: scores only, anonymous, no comments
      tasks.push({ ...t, evaluatorId: null, draft: null, response: t.response && { ...t.response, comment: null } });
    } else if (p.status === 'open' && t.group === 'ST' && (myClasses.has(t.sectionId) || deptClasses.has(t.sectionId))) {
      // live response counts for my classes (faculty) or my department (dean/chair)
      tasks.push({ ...t, evaluatorId: null, draft: null, response: t.response ? COUNT_ONLY : null });
    }
  }

  return {
    version: db.version,
    departments: db.departments,
    // never the password hash; HR also gets the account details it manages
    users: db.users.map(({ id, username, name, role, position, dept, active, mustChangePassword }) => (isHR
      ? { id, username, name, role, position, dept, active, mustChangePassword }
      : { id, name, role, position, dept, active })),
    sections: db.sections.map((s) => (isHR ? s : { ...s, studentIds: [] })),
    criteria: db.criteria,
    instruments: db.instruments,
    rules: db.rules,
    periods: db.periods,
    tasks,
    notifications: db.notifications.filter((n) => n.userId === user.id),
  };
}
