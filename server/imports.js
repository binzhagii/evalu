// Reading the files HR imports: class lists (Registrar / ARC) and staff lists.
import {
  CLASS_TYPES, POSITIONS, ROLES, currentTerm, isEvaluatee, isInstitutionalEmail, isNursingDept, isTeacher, periodName, uid,
} from '../src/lib/logic.js';

/**
 * A CSV file as rows of cells. Reads quoted cells ("Dela Cruz, Juan"), and commas, semicolons or tabs between cells
 * (whichever the first line uses most).
 */
export function parseCsv(text) {
  const src = String(text).replace(/^﻿/, '');
  const first = src.split(/\r?\n/).find((l) => l.trim()) || '';
  const bare = first.replace(/"[^"]*"/g, '');
  const count = (ch) => bare.split(ch).length - 1;
  const sep = [',', '\t', ';'].sort((a, b) => count(b) - count(a))[0];
  const rows = [];
  let cell = '', cells = [], quoted = false, line = 1, start = 1;
  const endCell = () => { cells.push(cell.trim()); cell = ''; };
  const endRow = () => { endCell(); if (cells.some((c) => c)) rows.push({ line: start, cells }); cells = []; start = line; };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false;
      else { if (ch === '\n') line++; cell += ch; }
    } else if (ch === '"' && !cell.trim()) { cell = ''; quoted = true; } else if (ch === sep) endCell();
    else if (ch === '\n') { line++; endRow(); } else if (ch !== '\r') cell += ch;
  }
  endRow();
  return rows;
}

const COLUMNS = {
  section: /^(section|class|block)( code| name)?$/, subjectCode: /^(subject|course) (code|no\.?|number)$/, subject: /^(subject|course)( name| title| description)?$/,
  teacherName: /^(teacher|instructor|professor|faculty)('?s)? name$/, teacher: /^(teacher|instructor|professor|faculty)('?s)?( ub)?( email| username| id)?$/,
  studentId: /^(student|id)( id)?( no\.?| number)$|^student id$/, studentName: /^(student('?s)? )?name$/, studentLogin: /^student('?s)?( ub)?( email)?$/,
  type: /^(class |section )?type( of class)?$/, studentDept: /^student('?s)? (department|school|dept\.?|college)$/,
};
/** Which column is which: by the header, or the fixed order of the example file when there is none. */
function classColumns(rows) {
  const head = rows[0]?.cells.map((c) => c.toLowerCase().replace(/\s+/g, ' ').trim()) || [];
  if (/section|subject|student/.test(head[0] || '') || head.includes('subject')) {
    const at = {};
    head.forEach((h, i) => { const k = Object.keys(COLUMNS).find((c) => !(c in at) && COLUMNS[c].test(h)); if (k) at[k] = i; });
    if (['section', 'subject', 'teacher'].every((k) => k in at)) return { at: () => at, rows: rows.slice(1), types: 'type' in at };
    if (/section/.test(head[0])) rows = rows.slice(1);
  }
  const fixed = { 7: ['section', 'subject', 'teacherName', 'teacher', 'studentId', 'studentName', 'studentLogin'], 6: ['section', 'subject', 'teacher', 'studentId', 'studentName', 'studentLogin'], 4: ['section', 'subject', 'teacher', 'studentLogin'] };
  const by = Object.fromEntries(Object.entries(fixed).map(([n, list]) => [n, Object.fromEntries(list.map((k, i) => [k, i]))]));
  return { at: (cells) => (cells.length >= 7 ? by[7] : cells.length === 6 ? by[6] : by[4]), rows };
}
const plain = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** "Lab", "Laboratory class", "Lecture", "clin-pt"… → the class type ('' = lecture), or null when it is not one. */
export function readClassType(v) {
  const s = plain(v);
  if (!s || /^lec(ture)?/.test(s)) return '';
  const key = Object.keys(CLASS_TYPES).find((k) => k && (plain(k) === s || plain(CLASS_TYPES[k]) === s));
  if (key) return key;
  if (/skill/.test(s)) return 'skills';
  if (/^lab/.test(s)) return 'lab';
  if (/clin/.test(s)) return /dent/.test(s) ? 'clin-dent' : /physical|\bpt\b/.test(s) ? 'clin-pt' : /med/.test(s) ? 'clin-mt' : null;
  return null;
}
const USERNAME = /^[a-z0-9._-]{3,32}$/;
const byLogin = (db, v) => { const k = String(v || '').trim().toLowerCase(); return k ? db.users.find((u) => u.username.toLowerCase() === k || u.email?.toLowerCase() === k) : undefined; };
const findDept = (db, v) => { const s = plain(v); return s ? db.departments.find((d) => plain(d.id) === s || plain(d.name) === s || (d.name.match(/\(([^)]+)\)/)?.[1] || '').toLowerCase() === s) : undefined; };

/**
 * A class list into `db` (a copy the caller saves or throws away). Classes belong to a semester (term, "2026-1") and are
 * told apart by section, subject, teacher and type of class. Returns what was done and what could not be read.
 * drop: students of these classes who are not in the file any more are removed from them.
 * A new student without a "student department" gets the department HR chose for their section (deptOf), or that of
 * their teachers. The second is a guess: it is marked, and HR is asked when their classes say otherwise.
 */
export function importClasses(db, { csv, listDept, term, drop, deptOf = {} }) {
  const errors = [], warnings = [], fresh = [], freshTeachers = [];
  const unknownDept = new Map(); // new student -> their classes in the file
  const corrected = new Set(), differs = new Set();
  const seen = new Map(); // class + student -> first row
  const inFile = new Map(); // class id -> students in the file
  const before = new Set(db.sections.map((s) => s.id));
  let created = 0, enrolled = 0, duplicates = 0, existingStudents = 0;
  const people = new Map(); // quick look-up by username and email
  for (const u of db.users) { people.set(u.username.toLowerCase(), u); if (u.email) people.set(u.email.toLowerCase(), u); }
  const login = (v) => people.get(String(v || '').trim().toLowerCase());
  const addPerson = (u) => { db.users.push(u); people.set(u.username, u); people.set(u.email, u); };
  const classes = new Map();
  const key = (s) => [plain(s.code), plain(s.subject), s.facultyId, s.classType || ''].join('|');
  for (const s of db.sections) if ((s.term || null) === (term || null)) classes.set(key(s), s);

  const { at, rows } = classColumns(parseCsv(csv));
  for (const { line, cells } of rows) {
    const col = at(cells), get = (k) => (col[k] == null ? '' : cells[col[k]] || '');
    const bad = (msg) => { errors.push(`Row ${line}: ${msg}`); };
    const code = get('section'), fac = get('teacher');
    const subject = [get('subjectCode'), get('subject')].filter(Boolean).join(' – ');
    if (!code || !subject || !fac) { bad('needs section code, subject and teacher email.'); continue; }
    if (code.length > 40 || subject.length > 120) { bad('the section code or subject is too long.'); continue; }
    const type = get('type') ? readClassType(get('type')) : '';
    if (type == null) { bad(`"${get('type')}" is not a type of class (Lecture, Laboratory, Skills laboratory, or a clinical type).`); continue; }

    let f = login(fac);
    const tname = get('teacherName');
    if (!f && tname) {
      // a new teacher: a Faculty account in the department of this list
      const temail = fac.toLowerCase(), uname = temail.split('@')[0];
      if (!listDept) { bad(`choose the department of this list so the teacher ${tname} can be created.`); continue; }
      if (!isInstitutionalEmail(temail)) { bad(`"${fac}" is not an official UB email.${cells.length > 8 ? ' If names have a comma, put them in quotes: "Dela Cruz, Juan".' : ''}`); continue; }
      if (!USERNAME.test(uname) || login(uname)) { bad(`can't make a username from "${fac}". Create this teacher under People & sign-in.`); continue; }
      f = { id: uid('u'), username: uname, email: temail, name: tname.slice(0, 100), role: 'TP', position: 'faculty', dept: listDept.id, passwordHash: null, active: true, mustChangePassword: true };
      addPerson(f); freshTeachers.push(f);
    }
    if (!isTeacher(f)) { bad(`"${fac}" is not a faculty or Clinical Instructor account. Add the teacher's name to the row (7 columns) or create the teacher under People & sign-in.`); continue; }
    const want = { code, subject, facultyId: f.id, classType: type };
    // a row without a type belongs to the class already there, whatever type HR gave it
    let s = classes.get(key(want)) || (!get('type') && [...classes.values()].find((x) => plain(x.code) === plain(code) && plain(x.subject) === plain(subject) && x.facultyId === f.id));

    let st = null, isGuess = false;
    const sid = get('studentId').toLowerCase(), sname = get('studentName'), semail = get('studentLogin').toLowerCase();
    if (sid || sname) {
      st = login(semail) || login(sid);
      if (!st) {
        if (!USERNAME.test(sid)) { bad(`student ID "${get('studentId')}" must be 3–32 letters or numbers.`); continue; }
        if (!sname || sname.length > 100) { bad("needs the student's name."); continue; }
        if (!isInstitutionalEmail(semail)) { bad(`"${get('studentLogin')}" is not an official UB email.${cells.length > 8 ? ' If names have a comma, put them in quotes: "Dela Cruz, Juan".' : ''}`); continue; }
        const d = get('studentDept') ? findDept(db, get('studentDept')) : null;
        if (get('studentDept') && (!d || d.kind === 'office')) { bad(`"${get('studentDept')}" is not a department.`); continue; }
        if (!d) isGuess = true;
        st = { id: uid('u'), username: sid, email: semail, name: sname, role: 'ST', position: 'student', dept: (d || db.departments.find((x) => x.id === f.dept)).id, passwordHash: null, active: true, mustChangePassword: true };
      }
    } else if (semail) {
      st = login(semail);
      if (!st) { bad(`"${get('studentLogin')}" has no account. Add the student ID, name and UB email to the row so the account is created.`); continue; }
    }
    if (st && st.role !== 'ST') { bad(`${st.name} is not a student account.`); continue; }
    if (!s) {
      s = { id: uid('sec'), code, subject, facultyId: f.id, dept: f.dept, studentIds: [], ...(term && { term }), ...(type && { classType: type }) };
      db.sections.push(s); classes.set(key(s), s); created++;
    }
    if (!inFile.has(s.id)) inFile.set(s.id, new Set());
    if (!st) continue; // a row that only lists the class
    if (!st.passwordHash && !login(st.username)) { addPerson(st); fresh.push(st); if (isGuess) { st.deptGuess = true; unknownDept.set(st, new Set()); } }
    const given = get('studentDept') ? findDept(db, get('studentDept')) : null;
    if (given && given.kind !== 'office' && st.deptGuess) { // the file says it: no guess any more
      if (!unknownDept.delete(st)) corrected.add(st.id);
      st.dept = given.id; delete st.deptGuess;
    } else if (given && given.id !== st.dept && !differs.has(st.id)) { differs.add(st.id); warnings.push(`Row ${line}: ${st.name} is in ${db.departments.find((x) => x.id === st.dept)?.name}, but the file says ${given.name}. Not changed; correct it under People & sign-in if the file is right.`); }
    unknownDept.get(st)?.add(s);
    const rowKey = `${s.id}|${st.id}`;
    if (seen.has(rowKey)) { duplicates++; warnings.push(`Row ${line}: duplicate of row ${seen.get(rowKey)} (${st.name} in ${code}); counted once.`); continue; }
    seen.set(rowKey, line);
    inFile.get(s.id).add(st.id);
    if (!fresh.includes(st)) existingStudents++;
    if (!s.studentIds.includes(st.id)) { s.studentIds.push(st.id); enrolled++; }
  }

  // new students without a department: the one HR chose for their section, else the one most of their classes have
  const guessed = new Map();
  for (const [st, list] of unknownDept) {
    const chosen = [...list].map((s) => deptOf[plain(s.code)]).find(Boolean);
    const count = {};
    for (const s of list) count[s.dept] = (count[s.dept] || 0) + 1;
    st.dept = chosen || Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || st.dept;
    if (chosen) delete st.deptGuess;
    for (const s of list) {
      const k = plain(s.code), x = guessed.get(k) || { key: k, code: s.code, dept: s.dept, students: new Set() };
      x.students.add(st); guessed.set(k, x);
    }
  }

  // who is not on the list any more (only in the classes the file has)
  const dropped = [];
  for (const [id, students] of inFile) {
    const s = db.sections.find((x) => x.id === id);
    if (!before.has(id) || !students.size) continue;
    for (const x of s.studentIds.filter((y) => !students.has(y))) dropped.push({ section: s.id, code: s.code, subject: s.subject, student: x, name: db.users.find((u) => u.id === x)?.name });
    if (drop) s.studentIds = s.studentIds.filter((x) => students.has(x));
  }
  const notInFile = listDept ? db.sections.filter((s) => (s.term || null) === (term || null) && s.dept === listDept.id && before.has(s.id) && !inFile.has(s.id)) : [];
  return { rows: rows.length, created, enrolled, duplicates, existingStudents, errors, warnings, fresh, freshTeachers, dropped, notInFile, corrected: corrected.size,
    guessed: [...guessed.values()].map((x) => ({ ...x, students: x.students.size })), guessedCount: unknownDept.size };
}

/* ---------- staff (deans, program chairs, office heads, staff…) ---------- */
const STAFF = { name: /^(full )?name$/, email: /^(ub |official )?email( address)?$/, position: /^position$/, dept: /^(department|school|office|dept\.?|college)( or office| \/ office)?$/ };
const positionOf = (v) => {
  const s = plain(v);
  for (const role of ['TP', 'NTP']) for (const [k, l] of Object.entries(POSITIONS[role])) if (s === k || s === plain(l) || (k === 'ci' && /^clinical instructor/.test(s)) || (k === 'aprincipal' && /^(asst|assistant) principal$/.test(s))) return { role, position: k };
  return null;
};
/** name, UB email, position, department or office → accounts (teachers and students come from class lists). */
export function importStaffList(db, { csv }) {
  const errors = [], made = [];
  let rows = parseCsv(csv), at = { name: 0, email: 1, position: 2, dept: 3 };
  const head = rows[0]?.cells.map((c) => c.toLowerCase().trim()) || [];
  if (head.some((h) => STAFF.email.test(h))) {
    at = {};
    head.forEach((h, i) => { const k = Object.keys(STAFF).find((c) => !(c in at) && STAFF[c].test(h)); if (k) at[k] = i; });
    rows = rows.slice(1);
  }
  let existing = 0;
  for (const { line, cells } of rows) {
    const get = (k) => (at[k] == null ? '' : cells[at[k]] || '');
    const bad = (msg) => { errors.push(`Row ${line}: ${msg}`); };
    const email = get('email').toLowerCase(), name = get('name');
    if (!name || !email) { bad('needs the name and the UB email.'); continue; }
    if (!isInstitutionalEmail(email)) { bad(`"${get('email')}" is not an official UB email.`); continue; }
    if (byLogin(db, email)) { existing++; continue; }
    const p = positionOf(get('position'));
    if (!p) { bad(`"${get('position')}" is not a position (${[...Object.values(POSITIONS.TP), ...Object.values(POSITIONS.NTP)].join(', ')}).`); continue; }
    const d = findDept(db, get('dept'));
    if (!d || d.active === false) { bad(`"${get('dept')}" is not a department or office.`); continue; }
    if (d.kind === 'office' && p.role !== 'NTP') { bad(`${d.name} is an office: only non-teaching personnel belong to it.`); continue; }
    if (p.position === 'ci' && !isNursingDept(d)) { bad('Clinical Instructors are only in the School of Nursing.'); continue; }
    const username = email.split('@')[0];
    if (!USERNAME.test(username) || byLogin(db, username)) { bad(`can't make a username from "${email}". Create this account under People & sign-in.`); continue; }
    const u = { id: uid('u'), username, email, name: name.slice(0, 100), role: p.role, position: p.position, dept: d.id, passwordHash: null, active: true, mustChangePassword: true };
    db.users.push(u); made.push(u);
  }
  return { rows: rows.length, made, existing, errors, summary: made.map((u) => `${u.name} · ${POSITIONS[u.role][u.position]} (${ROLES[u.role]})${isEvaluatee(u) ? '' : ' · rates others'}`) };
}
/** A readable semester: "2026-1" → "AY 2026-2027 1st Semester". */
export const termName = (t) => (t ? periodName(...t.split('-').map(Number)) : 'no semester');
export const defaultTerm = currentTerm;
