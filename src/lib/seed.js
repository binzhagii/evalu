// Simulated dataset (per the manuscript's scope: simulated data + test accounts).
// All names, criteria text and ratings below are SAMPLE data, editable in the app.
import { generateTasks, runThresholdCheck, instrumentFor, targetType, evaluatorGroup, uid } from './logic';
import { sha256, encryptText } from './crypto';

export const DEMO_PASSWORD = 'demo1234';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export async function buildSeed() {
  const R = rng(2026);
  const pw = await sha256(DEMO_PASSWORD);
  const db = { version: 1, departments: [], users: [], sections: [], criteria: [], instruments: [], rules: {}, periods: [], tasks: [], notifications: [] };
  db.departments = [
    { id: 'A', name: 'Department A (College)', kind: 'college' },
    { id: 'B', name: 'Department B (College)', kind: 'college' },
    { id: 'C', name: 'Department C (College)', kind: 'college' },
    { id: 'BE', name: 'Basic Education', kind: 'basic' },
  ];
  const U = (id, name, role, position, dept) => db.users.push({ id, username: id, name, role, position, dept, pw });
  U('hr', 'HR Specialist (Sample)', 'HR', 'hr', null);
  U('director', 'Director/VP (Sample)', 'DIR', 'director', null);
  for (const d of ['a', 'b', 'c']) {
    const D = d.toUpperCase();
    U(`dean_${d}`, `Dean ${D}`, 'TP', 'dean', D);
    U(`chair_${d}`, `Program Chair ${D}`, 'TP', 'chair', D);
    U(`sec_${d}`, `Secretary ${D}`, 'NTP', 'secretary', D);
    U(`staff_${d}`, `Staff ${D}`, 'NTP', 'staff', D);
    U(`fac_${d}1`, `Faculty ${D}1`, 'TP', 'faculty', D);
    U(`fac_${d}2`, `Faculty ${D}2`, 'TP', 'faculty', D);
  }
  U('principal', 'Principal (Sample)', 'TP', 'principal', 'BE');
  U('aprincipal', 'Assistant Principal (Sample)', 'TP', 'aprincipal', 'BE');
  U('shead', 'Subject Head (Sample)', 'TP', 'shead', 'BE');
  U('fac_be1', 'Basic Ed Teacher 1', 'TP', 'faculty', 'BE');
  U('fac_be2', 'Basic Ed Teacher 2', 'TP', 'faculty', 'BE');
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

  const bank = {
    ST: ['Explains lessons clearly', 'Is prepared for class', 'Treats students fairly and respectfully', 'Gives timely feedback on work', 'Starts and ends class on time'],
    DEAN: ['Meets teaching and academic responsibilities', 'Follows institutional policies', 'Works well with colleagues', 'Contributes to department goals'],
    CHAIR: ['Follows the curriculum and syllabus', 'Submits requirements on time', 'Collaborates with the program team', 'Participates in program activities'],
    SEC: ['Communicates clearly with the office', 'Supports office operations', 'Is reliable and responsive'],
    FAC: ['Provides clear academic leadership', 'Is accessible to faculty', 'Makes fair decisions', 'Supports faculty development'],
    PRIN: ['Meets teaching and academic responsibilities', 'Follows institutional policies', 'Works well with colleagues'],
    APRIN: ['Meets teaching and academic responsibilities', 'Follows institutional policies', 'Works well with colleagues'],
    SHEAD: ['Follows the curriculum and syllabus', 'Submits requirements on time', 'Collaborates with the subject team'],
  };
  const cid = {};
  for (const [g, list] of Object.entries(bank))
    for (const text of list) {
      if (!cid[text]) { cid[text] = `c${Object.keys(cid).length + 1}`; db.criteria.push({ id: cid[text], text }); }
    }
  const inst = (targetType, group) =>
    db.instruments.push({ id: `i_${targetType}_${group}`, name: `${targetType} / ${group} (sample)`, targetType, group, items: bank[group].map((t) => ({ criterionId: cid[t], weight: 1 })) });
  ['ST', 'DEAN', 'CHAIR'].forEach((g) => inst('COLLEGE_FACULTY', g));
  ['ST', 'PRIN', 'APRIN', 'SHEAD'].forEach((g) => inst('BASICED_TEACHER', g));
  ['CHAIR', 'SEC', 'FAC'].forEach((g) => inst('DEAN', g));

  // Weights: only College faculty (40/40/20) are given in the manuscript. Others stay null until HR sets them.
  db.rules = {
    COLLEGE_FACULTY: { ST: 40, DEAN: 40, CHAIR: 20 },
    BASICED_TEACHER: { ST: null, PRIN: null, APRIN: null, SHEAD: null },
    DEAN: { CHAIR: null, SEC: null, FAC: null },
  };

  const day = 86400000;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const now = Date.now();
  db.periods = [
    { id: 'p1', name: 'AY 2024-25 Term 2 (sample)', deadline: iso(now - 420 * day), status: 'closed', releaseStage: 'faculty', thresholdChecked: true },
    { id: 'p2', name: 'AY 2025-26 Term 1 (sample)', deadline: iso(now - 240 * day), status: 'closed', releaseStage: 'faculty', thresholdChecked: true },
    { id: 'p3', name: 'AY 2025-26 Term 2 (sample)', deadline: iso(now - 90 * day), status: 'closed', releaseStage: 'dir', thresholdChecked: true },
    { id: 'p4', name: 'AY 2026-27 Term 1 (current, sample)', deadline: iso(now + 14 * day), status: 'open', releaseStage: 'hr', thresholdChecked: false },
  ];

  const baseline = {}; // per-target quality
  db.users.forEach((u) => { if (targetType(db, u)) baseline[u.id] = 3.2 + R() * 1.4; });
  const answer = (task, drift) => {
    const ins = instrumentFor(db, targetType(db, db.users.find((u) => u.id === task.targetId)), task.group);
    const answers = {}, weights = {};
    for (const it of ins.items) {
      answers[it.criterionId] = Math.max(1, Math.min(5, Math.round(baseline[task.targetId] + drift + (R() - 0.5) * 1.6)));
      weights[it.criterionId] = it.weight;
    }
    return { answers, weights, comment: null, submittedAt: new Date().toISOString() };
  };

  for (const [pi, p] of db.periods.entries()) {
    generateTasks(db, p.id);
    const drift = [-0.3, 0, 0.15, 0][pi];
    const pts = db.tasks.filter((t) => t.periodId === p.id);
    // per-section student response targets (current period shows several below 50%)
    const stuRate = {};
    db.sections.forEach((s, i) => {
      stuRate[s.id] = pi < 3 ? (i === 3 && pi === 1 ? 0.3 : 0.7 + R() * 0.3) : [0.8, 0.4, 0.6, 1.0, 0.3, 0.7, 0.9, 0.5][i];
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
  // sample restricted (encrypted) comments on a few dean/chair responses
  for (const t of db.tasks.filter((x) => x.response && (x.group === 'DEAN' || x.group === 'CHAIR')).slice(0, 6))
    t.response.comment = await encryptText('Sample verbatim comment from the evaluator (restricted).');
  runThresholdCheck(db, 'p1'); runThresholdCheck(db, 'p2'); runThresholdCheck(db, 'p3');
  db.notifications.forEach((n) => (n.read = true));
  return db;
}
