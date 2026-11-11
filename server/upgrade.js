// Brings a database made by an earlier version of evalU up to date, without losing data.
// Runs once at start-up (see seed.js). Safe to run many times: it only fills in what is missing.
import { formForTask, uid, UB_DEPARTMENTS } from '../src/lib/logic.js';
import { installUbForms, UB_FORM_MARK } from '../src/lib/ubInstall.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

/** Changes db in place. Returns true if anything changed. */
export function upgradeData(db) {
  let changed = false;
  const set = (obj, key, value) => { obj[key] = value; changed = true; };
  db.requests ||= [];
  // a system with no departments yet starts with the University of Baguio departments
  if (!db.departments.length) { db.departments.push(...clone(UB_DEPARTMENTS)); changed = true; }
  db.pastResults ||= [];

  // FR1: every account needs an official UB email
  const taken = new Set(db.users.map((u) => u.email?.toLowerCase()).filter(Boolean));
  for (const u of db.users) {
    if (u.email) continue;
    let e = `${u.username}@${u.role === 'ST' ? 's.' : ''}ubaguio.edu`;
    for (let i = 2; taken.has(e); i++) e = `${u.username}${i}@${u.role === 'ST' ? 's.' : ''}ubaguio.edu`;
    taken.add(e);
    set(u, 'email', e);
  }

  // Table 6: Basic Education 40/20/20/20 (earlier versions left it blank)
  const be = db.rules.BASICED_TEACHER;
  if (be && Object.values(be).every((w) => w == null)) set(db.rules, 'BASICED_TEACHER', { ST: 40, PRIN: 20, APRIN: 20, SHEAD: 20 });
  // Table 6: non-teaching personnel, head and staff evaluate each other
  if (!db.rules.NTP_STAFF) set(db.rules, 'NTP_STAFF', { NTPHEAD: 100 });
  if (!db.rules.NTP_HEAD) set(db.rules, 'NTP_HEAD', { NTPSTAFF: 100 });
  // Clinical Instructors: their students and the dean evaluate them (weights to be confirmed; start at 50 / 50)
  if (!db.rules.CI) set(db.rules, 'CI', { ST: 50, DEAN: 50 });
  const addForm = (tt, group, texts) => {
    if (db.instruments.some((i) => i.targetType === tt && i.group === group)) return;
    const items = texts.map((text) => {
      let c = db.criteria.find((x) => x.text === text);
      if (!c) { c = { id: uid('c'), text }; db.criteria.push(c); }
      return { criterionId: c.id, weight: 1 };
    });
    db.instruments.push({ id: uid('i'), name: `${tt} / ${group} (sample)`, targetType: tt, group, dept: null, version: 1, active: true, categories: {}, items });
    changed = true;
  };
  addForm('NTP_STAFF', 'NTPHEAD', ['Completes assigned work accurately', 'Is punctual and reliable', 'Works well with the office team']);
  addForm('NTP_HEAD', 'NTPSTAFF', ['Gives clear direction to the office', 'Is fair and approachable', 'Supports the staff in their work']);
  addForm('CI', 'ST', ['Demonstrates clinical skills clearly', 'Supervises students safely during duty', 'Gives helpful feedback during duty', 'Is punctual for clinical duty']);
  addForm('CI', 'DEAN', ['Meets clinical teaching responsibilities', 'Follows hospital and institutional policies', 'Works well with colleagues']);

  for (const i of db.instruments) {
    if (i.version == null) set(i, 'version', 1);
    if (i.active == null) set(i, 'active', true);
    if (!i.categories) set(i, 'categories', {});
  }

  // Repair: a short-lived version removed the Program Chair, non-teaching staff and Directors/VPs.
  // Put back the Table 6 weights and the forms it retired (HR can't remove a group or retire a form
  // without making a newer version, so these can only come from that version).
  const cfr = db.rules.COLLEGE_FACULTY;
  if (cfr && !('CHAIR' in cfr) && cfr.ST === 50 && cfr.DEAN === 50) set(db.rules, 'COLLEGE_FACULTY', { ST: 40, DEAN: 40, CHAIR: 20 });
  if (!db.rules.DEAN) set(db.rules, 'DEAN', { CHAIR: null, SEC: null, FAC: null });
  const formKey = (i) => `${i.targetType}|${i.group}|${i.dept || ''}`;
  const activeKeys = new Set(db.instruments.filter((i) => i.active !== false).map(formKey));
  const newest = new Map();
  for (const i of db.instruments.filter((x) => x.active === false && !activeKeys.has(formKey(x))))
    if (!newest.has(formKey(i)) || (i.version || 1) > (newest.get(formKey(i)).version || 1)) newest.set(formKey(i), i);
  for (const i of newest.values()) set(i, 'active', true);

  // UB's own evaluation tools (4-point scale), added once. They replace the sample forms;
  // forms HR made and every submitted evaluation stay as they are.
  if (!db.instruments.some((i) => i.name.includes(UB_FORM_MARK)) && installUbForms(db)) changed = true;

  // NFR8: each period keeps its own weights; FR17: approvals list
  for (const p of db.periods) {
    if (!p.rules) {
      set(p, 'rules', clone(db.rules));
    } else {
      for (const tt of ['BASICED_TEACHER', 'NTP_STAFF', 'NTP_HEAD', 'CI']) {
        const r = p.rules[tt];
        if (!r || (tt === 'BASICED_TEACHER' && Object.values(r).every((w) => w == null))) { p.rules[tt] = clone(db.rules[tt]); changed = true; }
      }
    }
    if (!Array.isArray(p.approvals)) set(p, 'approvals', []);
  }

  // FR17: only the Vice Presidents approve results; Director accounts are switched off (kept for the records)
  for (const u of db.users) if (u.role === 'DIR' && u.position !== 'vp' && u.active !== false) set(u, 'active', false);

  // FR4: remember which form version each submitted evaluation used
  for (const t of db.tasks) {
    if (t.response && !t.response.instrumentId) {
      const ins = formForTask(db, t);
      if (ins) { t.response.instrumentId = ins.id; changed = true; }
    }
  }
  return changed;
}
