// Brings a database made by an earlier version of evalU up to date, without losing data.
// Runs once at start-up (see seed.js). Safe to run many times: it only fills in what is missing.
import { formForTask, uid } from '../src/lib/logic.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

/** Changes db in place. Returns true if anything changed. */
export function upgradeData(db) {
  let changed = false;
  const set = (obj, key, value) => { obj[key] = value; changed = true; };
  db.requests ||= [];
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

  for (const i of db.instruments) {
    if (i.version == null) set(i, 'version', 1);
    if (i.active == null) set(i, 'active', true);
    if (!i.categories) set(i, 'categories', {});
  }

  // NFR8: each period keeps its own weights; FR17: approvals list
  for (const p of db.periods) {
    if (!p.rules) {
      set(p, 'rules', clone(db.rules));
    } else {
      for (const tt of ['BASICED_TEACHER', 'NTP_STAFF', 'NTP_HEAD']) {
        const r = p.rules[tt];
        if (!r || (tt === 'BASICED_TEACHER' && Object.values(r).every((w) => w == null))) { p.rules[tt] = clone(db.rules[tt]); changed = true; }
      }
    }
    if (!Array.isArray(p.approvals)) set(p, 'approvals', []);
  }

  // FR4: remember which form version each submitted evaluation used
  for (const t of db.tasks) {
    if (t.response && !t.response.instrumentId) {
      const ins = formForTask(db, t);
      if (ins) { t.response.instrumentId = ins.id; changed = true; }
    }
  }
  return changed;
}
