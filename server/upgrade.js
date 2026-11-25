// Brings a database made by an earlier version of evalU up to date, without losing data.
// Runs once at start-up (see seed.js). Safe to run many times: it only fills in what is missing.
import { formForTask, uid, UB_DEPARTMENTS, DEFAULT_POLICY, DEFAULT_EVALUATOR_GROUPS, TARGET_TYPES, targetType, currentPolicy, termOf, workingTerm, storeResults, exemptPattern, exemptWords, saysExempt, isPastClass } from '../src/lib/logic.js';
import { installUbForms } from '../src/lib/ubInstall.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

/** Changes db in place. Returns true if anything changed. */
export function upgradeData(db) {
  let changed = false;
  const set = (obj, key, value) => { obj[key] = value; changed = true; };
  db.requests ||= [];
  if (!Array.isArray(db.evaluatorGroups)) set(db, 'evaluatorGroups', []);
  for (const group of DEFAULT_EVALUATOR_GROUPS) {
    if (!db.evaluatorGroups.some((g) => g.id === group.id)) { db.evaluatorGroups.push({ ...group }); changed = true; }
  }
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

  // HR's own formula always wins: these one-time repairs never touch a category that has a formula
  const hrDecided = (tt) => (db.formulas || []).some((f) => f.targetType === tt && f.status !== 'draft');
  // Table 6: Basic Education 40/20/20/20 (earlier versions left it blank)
  const be = db.rules.BASICED_TEACHER;
  if (be && !hrDecided('BASICED_TEACHER') && Object.values(be).every((w) => w == null)) set(db.rules, 'BASICED_TEACHER', { ST: 40, PRIN: 20, APRIN: 20, SHEAD: 20 });
  // Table 6: non-teaching personnel, head and staff evaluate each other
  if (!db.rules.NTP_STAFF) set(db.rules, 'NTP_STAFF', { NTPHEAD: 100 });
  if (!db.rules.NTP_HEAD) set(db.rules, 'NTP_HEAD', { NTPSTAFF: 100 });
  // Clinical Instructors: students, dean and program chair, 40/40/20 like college faculty (Scoring Rule Confirmation Form B2).
  // Earlier versions started at a 50/50 placeholder: replace it unless HR already set CI weights or a CI formula.
  const ciOld = (r) => r && Object.keys(r).length === 2 && r.ST === 50 && r.DEAN === 50;
  if (!db.rules.CI || (ciOld(db.rules.CI) && !hrDecided('CI'))) set(db.rules, 'CI', { ST: 40, DEAN: 40, CHAIR: 20 });
  for (const p of db.periods) if (p.status === 'open' && ciOld(p.rules?.CI) && !hrDecided('CI')) { p.rules.CI = { ST: 40, DEAN: 40, CHAIR: 20 }; changed = true; }
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
  if (cfr && !hrDecided('COLLEGE_FACULTY') && !('CHAIR' in cfr) && cfr.ST === 50 && cfr.DEAN === 50) set(db.rules, 'COLLEGE_FACULTY', { ST: 40, DEAN: 40, CHAIR: 20 });
  if (!db.rules.DEAN) set(db.rules, 'DEAN', { CHAIR: null, SEC: null, FAC: null });
  const formKey = (i) => `${i.targetType}|${i.group}|${i.dept || ''}`;
  const activeKeys = new Set(db.instruments.filter((i) => i.active !== false).map(formKey));
  const newest = new Map();
  // (a draft or scheduled version HR is preparing is not a retired form: it must never go live by itself)
  for (const i of db.instruments.filter((x) => x.active === false && !x.status && !activeKeys.has(formKey(x)) && db.evaluatorGroups.find((g) => g.id === x.group)?.active !== false)) // (nor the tools of an archived evaluator group)
    if (!newest.has(formKey(i)) || (i.version || 1) > (newest.get(formKey(i)).version || 1)) newest.set(formKey(i), i);
  for (const i of newest.values()) set(i, 'active', true);

  // Earlier versions put a new evaluator group in the weights with no percentage at once, which left the whole category
  // without a rating ("weights not set"). The group is kept; it counts when HR puts it in the formula.
  const builtIn = new Set(DEFAULT_EVALUATOR_GROUPS.map((g) => g.id));
  for (const p of [null, ...db.periods.filter((x) => x.status === 'open')]) {
    for (const [tt, r] of Object.entries((p ? p.rules : db.rules) || {})) {
      if (hrDecided(tt)) continue;
      for (const g of Object.keys(r)) {
        if (builtIn.has(g) || r[g] != null || (p && db.tasks.some((t) => t.periodId === p.id && t.group === g))) continue;
        delete r[g]; changed = true;
        const grp = db.evaluatorGroups.find((x) => x.id === g);
        if (grp && !grp.targetTypes?.includes(tt)) grp.targetTypes = [...(grp.targetTypes || []), tt];
      }
    }
  }

  // UB's own evaluation tools (4-point scale), added once. They replace the sample forms;
  // forms HR made and every submitted evaluation stay as they are.
  // UB's tools, added once; tools added in later versions (e.g. the Program Chair's CI tools) are filled in too
  if (installUbForms(db)) changed = true;

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
    // policy versions: a period evaluated before policies existed keeps UB's default rules
    if (!p.policy && p.status !== 'open') set(p, 'policy', { ...DEFAULT_POLICY });
    if (!Array.isArray(p.rejections)) set(p, 'rejections', []);
  }

  // participation forecast: an open period made before it existed counts its pace from its first answer
  for (const p of db.periods.filter((x) => x.status === 'open' && !x.openedAt)) {
    const first = db.tasks.filter((t) => t.periodId === p.id && t.response?.submittedAt).map((t) => t.response.submittedAt).sort()[0];
    set(p, 'openedAt', first || new Date().toISOString());
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

  // a period closed before results were stored keeps its result too (computed with its own fixed formula)
  db.results ||= [];
  for (const p of db.periods.filter((x) => x.status === 'closed' && !db.results.some((r) => r.periodId === x.id))) { storeResults(db, p); changed = true; }
  // the participation rule is set in one place (Evaluation rules): formulas drop their own copy, except in periods
  // that are closed or were already answered with it
  for (const f of db.formulas || []) {
    if (!f.config.participation || f.status === 'archived') continue;
    const { percent, plusOne } = f.config.participation;
    const pol = currentPolicy(db);
    if (pol.participationPercent !== percent || (pol.participationRule === 'more') !== (plusOne !== false)) (f.meta.log ||= []).push({ at: new Date().toISOString(), by: 'System', action: 'participation rule moved', note: `now follows Evaluation rules (was ${plusOne === false ? 'at least' : 'more than'} ${percent}%)` });
    delete f.config.participation; changed = true;
  }
  for (const p of db.periods.filter((x) => x.status === 'open' && !db.tasks.some((t) => t.periodId === x.id && t.response)))
    for (const f of Object.values(p.formulas || {})) if (f.participation) { delete f.participation; changed = true; }

  // classes from before they belonged to a semester: the one they were last evaluated in (else the one going on)
  for (const s of db.sections.filter((x) => !x.term)) {
    const ids = new Set(db.tasks.filter((t) => t.sectionId === s.id).map((t) => t.periodId));
    const last = db.periods.filter((p) => ids.has(p.id)).at(-1);
    const term = last ? termOf(last.name) : db.periods.some((p) => termOf(p.name)) ? workingTerm(db) : null;
    if (term) { s.term = term; changed = true; }
  }

  // excluded subjects became a list HR keeps: classes of earlier semesters, and those already answered, stay as they were
  const earlier = /\b(intern(ship)?s?|practicum|ojt|field ?trips?)\b/i, pattern = exemptPattern(exemptWords(db));
  const answered = new Set(db.tasks.filter((t) => t.response && t.sectionId).map((t) => t.sectionId));
  for (const s of db.sections.filter((x) => x.exempt == null)) set(s, 'exempt', saysExempt(s, isPastClass(db, s) || answered.has(s.id) ? earlier : pattern));

  // periods closed before they remembered their people: the category is in each stored result's formula
  for (const p of db.periods.filter((x) => x.status === 'closed' && !x.people)) {
    set(p, 'people', Object.fromEntries(db.results.filter((r) => r.periodId === p.id).map((r) => {
      const [type, dept] = String(r.data?.formula?.key || '').split('|');
      const u = db.users.find((x) => x.id === r.targetId);
      return [r.targetId, { type: Object.hasOwn(TARGET_TYPES, type) ? type : targetType(db, u), dept: dept || u?.dept || null }];
    })));
  }
  return changed;
}
