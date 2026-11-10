// Simulated dataset (per the manuscript's scope: simulated data + test accounts).
// All names, criteria text and ratings below are SAMPLE data, editable in the app.
// Used by the server (server/seed.js) to fill an empty database, and by the tests.
// Passwords are not part of this data; the server hashes DEMO_PASSWORD for every account.
import { UB_DEPARTMENTS, generateTasks, runThresholdCheck, formForTask, targetType, effectiveWeights } from './logic.js';

export const DEMO_PASSWORD = 'demo1234';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function buildSeed() {
  const R = rng(2026);
  const db = { version: 1, departments: [], users: [], sections: [], criteria: [], instruments: [], rules: {}, periods: [], tasks: [], requests: [], pastResults: [], notifications: [] };
  // the real UB departments; the sample people work in three of them (ids A, B and C) and in Basic Education
  db.departments = [
    { id: 'A', name: 'School of Information Technology (SIT)', kind: 'college' },
    { id: 'B', name: 'School of Business Administration & Accountancy (SBAA)', kind: 'college' },
    { id: 'C', name: 'School of Nursing (SON)', kind: 'college' },
    ...UB_DEPARTMENTS.filter((d) => !['SIT', 'SBAA', 'SON'].includes(d.id)),
  ];
  // FR1: every account has an official UB email (students use the s.ubaguio.edu subdomain)
  const U = (id, name, role, position, dept) => db.users.push({ id, username: id, email: `${id}@${role === 'ST' ? 's.' : ''}ubaguio.edu`, name, role, position, dept });
  U('hr', 'HR Specialist (Sample)', 'HR', 'hr', null);
  U('hr_assistant', 'HRMC Assistant (Sample)', 'HR', 'assistant', null); // shares the evaluation work with the HR Specialist
  U('director', 'Director/VP (Sample)', 'DIR', 'director', null);
  U('vp', 'Vice President (Sample)', 'DIR', 'vp', null); // FR17: both must approve before faculty release
  for (const d of ['a', 'b', 'c']) {
    const D = d.toUpperCase();
    U(`dean_${d}`, `Dean ${D}`, 'TP', 'dean', D);
    U(`chair_${d}`, `Program Chair ${D}`, 'TP', 'chair', D);
    U(`sec_${d}`, `Secretary ${D}`, 'NTP', 'secretary', D);
    U(`staff_${d}`, `Staff ${D}`, 'NTP', 'staff', D);
    U(`head_${d}`, `Office Head ${D}`, 'NTP', 'head', D); // Table 6: head and staff evaluate each other
    U(`fac_${d}1`, `Faculty ${D}1`, 'TP', 'faculty', D);
    U(`fac_${d}2`, `Faculty ${D}2`, 'TP', 'faculty', D);
  }
  U('principal', 'Principal (Sample)', 'TP', 'principal', 'BE');
  U('aprincipal', 'Assistant Principal (Sample)', 'TP', 'aprincipal', 'BE');
  U('shead', 'Subject Head (Sample)', 'TP', 'shead', 'BE');
  U('fac_be1', 'Basic Ed Teacher 1', 'TP', 'faculty', 'BE');
  U('fac_be2', 'Basic Ed Teacher 2', 'TP', 'faculty', 'BE');
  U('ci_c1', 'Clinical Instructor C1', 'TP', 'ci', 'C'); // allied medical: e.g. Nursing duty in the hospital or skills lab
  const students = {};
  for (const D of ['A', 'B', 'C', 'BE']) {
    students[D] = [];
    for (let i = 1; i <= 10; i++) {
      const id = `st_${D.toLowerCase()}${String(i).padStart(2, '0')}`;
      U(id, `Student ${D}${String(i).padStart(2, '0')}`, 'ST', 'student', D);
      students[D].push(id);
    }
  }
  // one class section per faculty member, all department students enrolled
  const facs = db.users.filter((u) => u.position === 'faculty');
  facs.forEach((f, i) => {
    db.sections.push({ id: `sec${i + 1}`, code: `SEC-${f.dept}${(i % 2) + 1}`, subject: `Sample Subject ${f.dept}${(i % 2) + 1}`, facultyId: f.id, dept: f.dept, studentIds: students[f.dept] });
  });
  // FR6: practicum, internship and field trip subjects are on the class lists but are not evaluated
  db.sections.push({ id: 'sec9', code: 'PRAC-A', subject: 'Practicum A (sample)', facultyId: 'fac_a2', dept: 'A', studentIds: students.A.slice(0, 6) });
  // a Clinical Instructor's class (clinical duty); its students evaluate the CI
  db.sections.push({ id: 'sec10', code: 'CLIN-C', subject: 'Clinical Duty C (sample)', facultyId: 'ci_c1', dept: 'C', studentIds: students.C });

  const bank = {
    ST: ['Explains lessons clearly', 'Is prepared for class', 'Treats students fairly and respectfully', 'Gives timely feedback on work', 'Starts and ends class on time'],
    DEAN: ['Meets teaching and academic responsibilities', 'Follows institutional policies', 'Works well with colleagues', 'Contributes to department goals'],
    CHAIR: ['Follows the curriculum and syllabus', 'Submits requirements on time', 'Collaborates with the program team', 'Participates in program activities'],
    SEC: ['Communicates clearly with the office', 'Supports office operations', 'Is reliable and responsive'],
    FAC: ['Provides clear academic leadership', 'Is accessible to faculty', 'Makes fair decisions', 'Supports faculty development'],
    PRIN: ['Meets teaching and academic responsibilities', 'Follows institutional policies', 'Works well with colleagues'],
    APRIN: ['Meets teaching and academic responsibilities', 'Follows institutional policies', 'Works well with colleagues'],
    SHEAD: ['Follows the curriculum and syllabus', 'Submits requirements on time', 'Collaborates with the subject team'],
    NTPHEAD: ['Completes assigned work accurately', 'Is punctual and reliable', 'Works well with the office team'],
    NTPSTAFF: ['Gives clear direction to the office', 'Is fair and approachable', 'Supports the staff in their work'],
    CI_ST: ['Demonstrates clinical skills clearly', 'Supervises students safely during duty', 'Gives helpful feedback during duty', 'Is punctual for clinical duty'],
    CI_DEAN: ['Meets clinical teaching responsibilities', 'Follows hospital and institutional policies', 'Works well with colleagues'],
  };
  // Table 6 (Basic Ed student tool): items are grouped into weighted categories
  const BE_CATEGORIES = { 'Management of the Teaching and Learning Process': 60, 'Assessment of Learners and Learning Environment': 40 };
  const beCategory = (t) => (['Gives timely feedback on work', 'Treats students fairly and respectfully'].includes(t) ? 'Assessment of Learners and Learning Environment' : 'Management of the Teaching and Learning Process');
  const cid = {};
  for (const list of Object.values(bank))
    for (const text of list) {
      if (!cid[text]) { cid[text] = `c${Object.keys(cid).length + 1}`; db.criteria.push({ id: cid[text], text }); }
    }
  const inst = (targetType, group, categories = null, texts = bank[group]) =>
    db.instruments.push({
      id: `i_${targetType}_${group}`, name: `${targetType} / ${group} (sample)`, targetType, group, dept: null, version: 1, active: true,
      categories: categories || {}, items: texts.map((t) => ({ criterionId: cid[t], weight: 1, ...(categories && { category: beCategory(t) }) })),
    });
  ['ST', 'DEAN', 'CHAIR'].forEach((g) => inst('COLLEGE_FACULTY', g));
  inst('BASICED_TEACHER', 'ST', BE_CATEGORIES);
  ['PRIN', 'APRIN', 'SHEAD'].forEach((g) => inst('BASICED_TEACHER', g));
  ['CHAIR', 'SEC', 'FAC'].forEach((g) => inst('DEAN', g));
  inst('NTP_STAFF', 'NTPHEAD');
  inst('NTP_HEAD', 'NTPSTAFF');
  inst('CI', 'ST', null, bank.CI_ST);
  inst('CI', 'DEAN', null, bank.CI_DEAN);

  // Weights from Table 6 of the manuscript. Weights for evaluating Deans are not given, so they stay blank
  // until HR enters them. Non-teaching personnel have one evaluator group each, so it counts 100%.
  db.rules = {
    COLLEGE_FACULTY: { ST: 40, DEAN: 40, CHAIR: 20 },
    BASICED_TEACHER: { ST: 40, PRIN: 20, APRIN: 20, SHEAD: 20 },
    DEAN: { CHAIR: null, SEC: null, FAC: null },
    NTP_STAFF: { NTPHEAD: 100 },
    NTP_HEAD: { NTPSTAFF: 100 },
    CI: { ST: 50, DEAN: 50 }, // Clinical Instructors: weights not given yet ("??" in the interview); HR can change them
  };

  const day = 86400000;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const now = Date.now();
  const rules = () => JSON.parse(JSON.stringify(db.rules)); // NFR8: each period keeps its own weights
  const approved = (ms) => [{ userId: 'director', at: new Date(ms).toISOString() }, { userId: 'vp', at: new Date(ms).toISOString() }];
  db.periods = [
    { id: 'p1', name: 'AY 2024-25 Term 2 (sample)', deadline: iso(now - 420 * day), status: 'closed', releaseStage: 'faculty', thresholdChecked: true, rules: rules(), depts: null, approvals: approved(now - 400 * day) },
    { id: 'p2', name: 'AY 2025-26 Term 1 (sample)', deadline: iso(now - 240 * day), status: 'closed', releaseStage: 'faculty', thresholdChecked: true, rules: rules(), depts: null, approvals: approved(now - 220 * day) },
    { id: 'p3', name: 'AY 2025-26 Term 2 (sample)', deadline: iso(now - 90 * day), status: 'closed', releaseStage: 'dir', thresholdChecked: true, rules: rules(), depts: null, approvals: [] },
    { id: 'p4', name: 'AY 2026-27 Term 1 (current, sample)', deadline: iso(now + 5 * day), status: 'open', releaseStage: 'hr', thresholdChecked: false, rules: rules(), depts: null, approvals: [] },
  ];

  const baseline = {}; // per-target quality
  db.users.forEach((u) => { if (targetType(db, u)) baseline[u.id] = 3.2 + R() * 1.4; });
  const answer = (task, drift) => {
    const ins = formForTask(db, task);
    const answers = {};
    for (const it of ins.items) answers[it.criterionId] = Math.max(1, Math.min(5, Math.round(baseline[task.targetId] + drift + (R() - 0.5) * 1.6)));
    return { answers, weights: effectiveWeights(ins), instrumentId: ins.id, comment: null, submittedAt: new Date().toISOString() };
  };

  for (const [pi, p] of db.periods.entries()) {
    generateTasks(db, p.id);
    const drift = [-0.3, 0, 0.15, 0][pi];
    const pts = db.tasks.filter((t) => t.periodId === p.id);
    // per-section student response targets (current period shows several below 50%)
    const stuRate = {};
    db.sections.forEach((s, i) => {
      stuRate[s.id] = pi < 3 ? (i === 3 && pi === 1 ? 0.3 : 0.7 + R() * 0.3) : [0.8, 0.4, 0.6, 1.0, 0.3, 0.7, 0.9, 0.5, 0, 0.7][i];
    });
    for (const t of pts) {
      let doIt;
      if (t.group === 'ST') {
        const sec = db.sections.find((s) => s.id === t.sectionId);
        const idx = sec.studentIds.indexOf(t.evaluatorId);
        doIt = idx < Math.round(stuRate[sec.id] * sec.studentIds.length);
      } else doIt = pi < 3 ? true : R() < 0.6;
      if (doIt) t.response = answer(t, drift);
    }
  }
  // sample comments (plain text here; the server encrypts them). Shown verbatim, grouped by source, never with a name.
  for (const t of db.tasks.filter((x) => x.response && (x.group === 'DEAN' || x.group === 'CHAIR')).slice(0, 6))
    t.response.comment = 'Sample verbatim comment from the evaluator (restricted).';
  const studentNotes = ['Sample comment: the lessons are clear and well prepared.', 'Sample comment: please give feedback on our work sooner.', 'Sample comment: the class always starts on time.'];
  db.tasks.filter((x) => x.response && x.group === 'ST').filter((_, i) => i % 9 === 0).forEach((t, i) => { t.response.comment = studentNotes[i % studentNotes.length]; });
  // FR21: a few final ratings imported from the records kept before evalU (2022 onward)
  const imported = new Date(now - 500 * day).toISOString();
  [['fac_a1', 3.91], ['fac_a2', 4.12], ['fac_b1', 3.67], ['fac_be1', 4.25]].forEach(([userId, v], i) => {
    db.pastResults.push({ id: `pr${i + 1}`, userId, periodLabel: 'AY 2022-23 Term 1 (imported sample)', final: v, note: 'From the HRMC computation system', importedAt: imported });
    db.pastResults.push({ id: `pr${i + 11}`, userId, periodLabel: 'AY 2023-24 Term 1 (imported sample)', final: Math.round((v + 0.08) * 100) / 100, note: 'From the HRMC computation system', importedAt: imported });
  });
  runThresholdCheck(db, 'p1'); runThresholdCheck(db, 'p2'); runThresholdCheck(db, 'p3');
  db.notifications.forEach((n) => (n.read = true));
  return db;
}
