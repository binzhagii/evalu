// evalU database (SQLite, built into Node). File: server/data/evalu.db
//
// The tables below are the real storage. For the app's rules (src/lib/logic.js)
// the server also keeps the same data as one JavaScript object in memory ("db"),
// shaped exactly like the old browser data. Every change goes through save(),
// which writes only the rows that actually changed, inside one transaction.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';

fs.mkdirSync(DATA_DIR, { recursive: true });
export const sql = new DatabaseSync(path.join(DATA_DIR, 'evalu.db'));
sql.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

sql.exec(`
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL            -- kind: college | basic
);
CREATE TABLE IF NOT EXISTS evaluator_groups (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, built_in INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  role TEXT NOT NULL,                                                     -- ST | TP | NTP | HR | DIR
  position TEXT, dept TEXT REFERENCES departments(id), evaluator_group_ids TEXT,
  email TEXT,                                                             -- official UB email (FR1), used to sign in
  password_hash TEXT NOT NULL,                                            -- scrypt, never sent to the browser
  active INTEGER NOT NULL DEFAULT 1,                                      -- 0 = deactivated by HR, cannot sign in
  must_change_password INTEGER NOT NULL DEFAULT 0                         -- 1 = temporary password, change at next sign-in
);
CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY, code TEXT NOT NULL, subject TEXT NOT NULL,
  faculty_id TEXT NOT NULL REFERENCES users(id), dept TEXT REFERENCES departments(id)
);
CREATE TABLE IF NOT EXISTS section_students (
  section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (section_id, student_id)
);
CREATE TABLE IF NOT EXISTS criteria (
  id TEXT PRIMARY KEY, text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS instruments (                                  -- evaluation forms (FR3, FR4)
  id TEXT PRIMARY KEY, name TEXT NOT NULL, target_type TEXT NOT NULL, evaluator_group TEXT NOT NULL,
  dept TEXT,                                                              -- NULL = all departments
  version INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,                                      -- 0 = replaced by a newer version
  categories TEXT                                                         -- JSON {category: weight %}, or NULL
);
CREATE TABLE IF NOT EXISTS instrument_items (
  instrument_id TEXT NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  criterion_id TEXT NOT NULL REFERENCES criteria(id),
  weight REAL NOT NULL,
  category TEXT,                                                          -- e.g. 'Management of the Teaching and Learning Process'
  PRIMARY KEY (instrument_id, criterion_id)
);
CREATE TABLE IF NOT EXISTS group_weights (                                -- e.g. College faculty: ST 40 / DEAN 40 / CHAIR 20
  target_type TEXT NOT NULL, evaluator_group TEXT NOT NULL, weight REAL,  -- NULL = not set by HR yet
  PRIMARY KEY (target_type, evaluator_group)
);
CREATE TABLE IF NOT EXISTS periods (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, start_date TEXT, deadline TEXT NOT NULL,
  status TEXT NOT NULL,                                                   -- open | closed
  release_stage TEXT NOT NULL,                                            -- hr | dir | faculty
  threshold_checked INTEGER NOT NULL DEFAULT 0,
  rules TEXT,                                                             -- JSON group weights in force for this period (NFR8)
  depts TEXT,                                                             -- JSON list of departments covered, NULL = all (FR8)
  approvals TEXT,                                                         -- JSON [{userId, at}] Director/VP approvals (FR17)
  last_auto TEXT                                                          -- last day automatic reminders ran (FR10)
);
CREATE TABLE IF NOT EXISTS tasks (                                        -- one evaluator evaluating one person
  id TEXT PRIMARY KEY,
  period_id TEXT NOT NULL REFERENCES periods(id),
  evaluator_id TEXT NOT NULL REFERENCES users(id),
  target_id TEXT NOT NULL REFERENCES users(id),
  evaluator_group TEXT NOT NULL,
  section_id TEXT REFERENCES sections(id),
  draft TEXT                                                              -- JSON of unsaved answers, if any
);
CREATE INDEX IF NOT EXISTS tasks_by_evaluator ON tasks(evaluator_id);
CREATE INDEX IF NOT EXISTS tasks_by_period ON tasks(period_id);
CREATE TABLE IF NOT EXISTS responses (                                    -- a submitted evaluation
  task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  submitted_at TEXT NOT NULL,
  instrument_id TEXT,                                                     -- form version answered (FR4)
  comment TEXT                                                            -- AES-256-GCM encrypted JSON, or NULL
);
CREATE TABLE IF NOT EXISTS answers (
  task_id TEXT NOT NULL REFERENCES responses(task_id) ON DELETE CASCADE,
  criterion_id TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value BETWEEN 1 AND 5),
  weight REAL NOT NULL,                                                   -- weight at the time of submission
  PRIMARY KEY (task_id, criterion_id)
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, key TEXT, user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL, at TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0, text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_by_user ON notifications(user_id);
CREATE TABLE IF NOT EXISTS result_requests (                              -- FR18: other offices get results only through the dean
  id TEXT PRIMARY KEY, period_id TEXT NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES users(id), office TEXT NOT NULL, head_id TEXT NOT NULL REFERENCES users(id),
  by_id TEXT NOT NULL, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS past_results (                                 -- FR21: results imported from earlier records (2022 onward)
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), period_label TEXT NOT NULL,
  final REAL NOT NULL, note TEXT, imported_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (                                    -- FR20: who viewed, changed or released results
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, user_id TEXT, user_name TEXT,
  action TEXT NOT NULL, detail TEXT
);
CREATE TABLE IF NOT EXISTS policies (                                     -- evaluation policy versions HR saved (threshold, bands, approvals…)
  version INTEGER PRIMARY KEY, data TEXT NOT NULL, at TEXT NOT NULL, by_id TEXT, by_name TEXT, reason TEXT
);
CREATE TABLE IF NOT EXISTS formulas (                                     -- computation formulas, one row per version (draft → approved → active → archived)
  id TEXT PRIMARY KEY, key TEXT NOT NULL, target_type TEXT NOT NULL, dept TEXT, version INTEGER NOT NULL,
  status TEXT NOT NULL, config TEXT NOT NULL, meta TEXT                   -- config: the rules the engine runs; meta: who/when/why + history
);
CREATE TABLE IF NOT EXISTS results (                                      -- final results stored when a period is closed, with the formula used
  period_id TEXT NOT NULL REFERENCES periods(id) ON DELETE CASCADE, target_id TEXT NOT NULL, data TEXT NOT NULL,
  PRIMARY KEY (period_id, target_id)
);
CREATE TABLE IF NOT EXISTS plans (                                        -- development follow-up: a plan for someone rated Fair or Poor
  id TEXT PRIMARY KEY, target_id TEXT NOT NULL, period_id TEXT NOT NULL, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL
);
`);

// Databases created by earlier versions: add the new columns.
{
  const addCols = (table, defs) => {
    const cols = new Set(sql.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
    for (const [name, def] of Object.entries(defs)) if (!cols.has(name)) sql.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
  };
  addCols('users', { active: 'INTEGER NOT NULL DEFAULT 1', must_change_password: 'INTEGER NOT NULL DEFAULT 0', email: 'TEXT', temp_password: 'TEXT', dept_guess: 'INTEGER NOT NULL DEFAULT 0' }); // temp_password: encrypted, only until the person sets their own
  addCols('users', { evaluator_group_ids: 'TEXT' });
  addCols('departments', { active: 'INTEGER NOT NULL DEFAULT 1' }); // 0 = deactivated: not offered any more, kept for old records
  addCols('instrument_items', { category: 'TEXT' });
  addCols('criteria', { levels: 'TEXT' });        // JSON: own words for ratings 1..4 (e.g. "One program outreach" ... "More than three")
  addCols('sections', { term: 'TEXT' });          // the semester the class belongs to, "2026-1"; NULL = from before
  addCols('sections', { class_type: 'TEXT' });    // lecture (NULL), lab, skills, clin-dent, clin-pt, clin-mt
  addCols('instruments', { variant: 'TEXT' });    // the type of class this form is for; NULL = standard
  addCols('instruments', { status: 'TEXT' });     // draft | scheduled; NULL = in use (active 1) or old (active 0)
  addCols('evaluator_groups', { positions: 'TEXT', target_types: 'TEXT' }); // JSON: positions that belong to it automatically; categories it was made for
  addCols('periods', { start_date: 'TEXT', rules: 'TEXT', depts: 'TEXT', approvals: 'TEXT', last_auto: 'TEXT', policy: 'TEXT', rejections: 'TEXT', formulas: 'TEXT', opened_at: 'TEXT', last_forecast: 'TEXT', people: 'TEXT', auto: 'TEXT' }); // auto: what the system did or noted by itself (close notice, evaluations HR removed…) · // people: category and department of each person when the period was closed · // policy: the version in force for the period; rejections: VP returns with reasons
  addCols('responses', { instrument_id: 'TEXT' });
  addCols('audit_log', { prev_hash: 'TEXT', hash: 'TEXT' }); // tamper-evident chain (see addAudit)
  // Forms used to allow only one per pairing (UNIQUE). Versions need several, so rebuild that table once.
  if (/UNIQUE/i.test(sql.prepare("SELECT sql FROM sqlite_master WHERE name='instruments'").get().sql)) {
    sql.exec('PRAGMA foreign_keys = OFF');
    sql.exec(`BEGIN;
      CREATE TABLE instruments_new (id TEXT PRIMARY KEY, name TEXT NOT NULL, target_type TEXT NOT NULL, evaluator_group TEXT NOT NULL,
        dept TEXT, version INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1, categories TEXT);
      INSERT INTO instruments_new (id, name, target_type, evaluator_group) SELECT id, name, target_type, evaluator_group FROM instruments;
      DROP TABLE instruments;
      ALTER TABLE instruments_new RENAME TO instruments;
      COMMIT;`);
    sql.exec('PRAGMA foreign_keys = ON');
  }
  sql.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(lower(email))');
}

// ---------- how each table maps to the in-memory object ----------
// Listed parent-first. Rows are kept in insertion order (rowid), like the old arrays.
const TABLES = [
  { name: 'departments', key: ['id'], rows: (db) => db.departments.map((d) => ({ id: d.id, name: d.name, kind: d.kind, active: d.active === false ? 0 : 1 })) },
  { name: 'evaluator_groups', key: ['id'], rows: (db) => (db.evaluatorGroups || []).map((g) => ({ id: g.id, name: g.name, built_in: g.builtIn ? 1 : 0, active: g.active === false ? 0 : 1, positions: g.positions?.length ? JSON.stringify(g.positions) : null, target_types: g.targetTypes?.length ? JSON.stringify(g.targetTypes) : null })) },
  { name: 'users', key: ['id'], rows: (db) => db.users.map((u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, position: u.position ?? null, dept: u.dept ?? null, evaluator_group_ids: Array.isArray(u.evaluatorGroupIds) ? JSON.stringify(u.evaluatorGroupIds) : null, email: u.email ?? null, password_hash: u.passwordHash, active: u.active === false ? 0 : 1, must_change_password: u.mustChangePassword ? 1 : 0, temp_password: u.tempPassword ? JSON.stringify(u.tempPassword) : null, dept_guess: u.deptGuess ? 1 : 0 })) },
  { name: 'sections', key: ['id'], rows: (db) => db.sections.map((s) => ({ id: s.id, code: s.code, subject: s.subject, faculty_id: s.facultyId, dept: s.dept, class_type: s.classType || null, term: s.term || null })) },
  { name: 'section_students', key: ['section_id', 'student_id'], rows: (db) => db.sections.flatMap((s) => s.studentIds.map((st) => ({ section_id: s.id, student_id: st }))) },
  { name: 'criteria', key: ['id'], rows: (db) => db.criteria.map((c) => ({ id: c.id, text: c.text, levels: c.levels?.length ? JSON.stringify(c.levels) : null })) },
  { name: 'instruments', key: ['id'], rows: (db) => db.instruments.map((i) => ({ id: i.id, name: i.name, target_type: i.targetType, evaluator_group: i.group, dept: i.dept ?? null, version: i.version ?? 1, active: i.active === false ? 0 : 1, categories: i.categories && Object.keys(i.categories).length ? JSON.stringify(i.categories) : null, variant: i.variant || null, status: i.status || null })) },
  { name: 'instrument_items', key: ['instrument_id', 'criterion_id'], rows: (db) => db.instruments.flatMap((i) => i.items.map((it) => ({ instrument_id: i.id, criterion_id: it.criterionId, weight: it.weight, category: it.category || null }))) },
  { name: 'group_weights', key: ['target_type', 'evaluator_group'], rows: (db) => Object.entries(db.rules).flatMap(([tt, r]) => Object.entries(r).map(([g, w]) => ({ target_type: tt, evaluator_group: g, weight: w }))) },
  { name: 'periods', key: ['id'], rows: (db) => db.periods.map((p) => ({ id: p.id, name: p.name, start_date: p.startDate ?? null, deadline: p.deadline, status: p.status, release_stage: p.releaseStage, threshold_checked: p.thresholdChecked ? 1 : 0, rules: p.rules ? JSON.stringify(p.rules) : null, depts: p.depts?.length ? JSON.stringify(p.depts) : null, approvals: p.approvals?.length ? JSON.stringify(p.approvals) : null, last_auto: p.lastAuto ?? null, policy: p.policy ? JSON.stringify(p.policy) : null, rejections: p.rejections?.length ? JSON.stringify(p.rejections) : null, formulas: p.formulas && Object.keys(p.formulas).length ? JSON.stringify(p.formulas) : null, opened_at: p.openedAt ?? null, last_forecast: p.lastForecast ?? null, people: p.people ? JSON.stringify(p.people) : null, auto: p.auto && Object.keys(p.auto).length ? JSON.stringify(p.auto) : null })) },
  { name: 'formulas', key: ['id'], rows: (db) => (db.formulas || []).map((f) => ({ id: f.id, key: f.key, target_type: f.targetType, dept: f.dept ?? null, version: f.version, status: f.status, config: JSON.stringify(f.config), meta: JSON.stringify(f.meta || {}) })) },
  { name: 'tasks', key: ['id'], rows: (db) => db.tasks.map((t) => ({ id: t.id, period_id: t.periodId, evaluator_id: t.evaluatorId, target_id: t.targetId, evaluator_group: t.group, section_id: t.sectionId, draft: t.draft ? JSON.stringify(t.draft) : null })) },
  { name: 'results', key: ['period_id', 'target_id'], rows: (db) => (db.results || []).map((r) => ({ period_id: r.periodId, target_id: r.targetId, data: JSON.stringify(r.data) })) },
  { name: 'plans', key: ['id'], rows: (db) => (db.plans || []).map((p) => ({ id: p.id, target_id: p.targetId, period_id: p.periodId, data: JSON.stringify(p) })) },
  { name: 'responses', key: ['task_id'], rows: (db) => db.tasks.filter((t) => t.response).map((t) => ({ task_id: t.id, submitted_at: t.response.submittedAt, instrument_id: t.response.instrumentId ?? null, comment: t.response.comment ? JSON.stringify(t.response.comment) : null })) },
  { name: 'answers', key: ['task_id', 'criterion_id'], rows: (db) => db.tasks.filter((t) => t.response).flatMap((t) => Object.entries(t.response.answers).map(([c, v]) => ({ task_id: t.id, criterion_id: c, value: v, weight: t.response.weights[c] ?? 1 }))) },
  { name: 'result_requests', key: ['id'], rows: (db) => db.requests.map((r) => ({ id: r.id, period_id: r.periodId, target_id: r.targetId, office: r.office, head_id: r.headId, by_id: r.byId, at: r.at })) },
  { name: 'past_results', key: ['id'], rows: (db) => db.pastResults.map((r) => ({ id: r.id, user_id: r.userId, period_label: r.periodLabel, final: r.final, note: r.note ?? null, imported_at: r.importedAt })) },
  { name: 'policies', key: ['version'], rows: (db) => (db.policies || []).map((x) => ({ version: x.version, data: JSON.stringify(x.policy), at: x.at, by_id: x.byId ?? null, by_name: x.byName ?? null, reason: x.reason ?? null })) },
  { name: 'notifications', key: ['id'], rows: (db) => db.notifications.map((n) => ({ id: n.id, key: n.key ?? null, user_id: n.userId, kind: n.kind, at: n.at, read: n.read ? 1 : 0, text: n.text })) },
];

const all = (q, ...a) => sql.prepare(q).all(...a);

function readFromTables() {
  const db = { version: 1 };
  db.departments = all('SELECT id, name, kind, active FROM departments ORDER BY rowid').map((d) => ({ id: d.id, name: d.name, kind: d.kind, ...(!d.active && { active: false }) }));
  db.evaluatorGroups = all('SELECT * FROM evaluator_groups ORDER BY rowid').map((g) => ({ id: g.id, name: g.name, builtIn: !!g.built_in, active: !!g.active, ...(g.positions && { positions: JSON.parse(g.positions) }), ...(g.target_types && { targetTypes: JSON.parse(g.target_types) }) }));
  // password hashes stay on the server: view.js never sends them to the browser
  db.users = all('SELECT * FROM users ORDER BY rowid').map((u) => ({
    id: u.id, username: u.username, email: u.email, name: u.name, role: u.role, position: u.position, dept: u.dept,
    evaluatorGroupIds: u.evaluator_group_ids ? JSON.parse(u.evaluator_group_ids) : undefined,
    passwordHash: u.password_hash, active: !!u.active, mustChangePassword: !!u.must_change_password, tempPassword: u.temp_password ? JSON.parse(u.temp_password) : null,
    ...(u.dept_guess && { deptGuess: true }), // a student's department taken from their teacher (no department in the class list)
  }));
  const enrolled = {};
  for (const r of all('SELECT section_id, student_id FROM section_students ORDER BY rowid')) (enrolled[r.section_id] ||= []).push(r.student_id);
  db.sections = all('SELECT * FROM sections ORDER BY rowid').map((s) => ({ id: s.id, code: s.code, subject: s.subject, facultyId: s.faculty_id, dept: s.dept, studentIds: enrolled[s.id] || [], ...(s.class_type && { classType: s.class_type }), ...(s.term && { term: s.term }) }));
  db.criteria = all('SELECT id, text, levels FROM criteria ORDER BY rowid').map((c) => ({ id: c.id, text: c.text, ...(c.levels && { levels: JSON.parse(c.levels) }) }));
  const items = {};
  for (const r of all('SELECT * FROM instrument_items ORDER BY rowid')) (items[r.instrument_id] ||= []).push({ criterionId: r.criterion_id, weight: r.weight, ...(r.category && { category: r.category }) });
  db.instruments = all('SELECT * FROM instruments ORDER BY rowid').map((i) => ({
    id: i.id, name: i.name, targetType: i.target_type, group: i.evaluator_group, dept: i.dept, version: i.version, active: !!i.active,
    categories: i.categories ? JSON.parse(i.categories) : {}, items: items[i.id] || [], ...(i.variant && { variant: i.variant }), ...(i.status && { status: i.status }),
  }));
  db.rules = {};
  for (const r of all('SELECT * FROM group_weights ORDER BY rowid')) (db.rules[r.target_type] ||= {})[r.evaluator_group] = r.weight;
  db.periods = all('SELECT * FROM periods ORDER BY rowid').map((p) => ({ id: p.id, name: p.name, startDate: p.start_date, deadline: p.deadline, status: p.status, releaseStage: p.release_stage, thresholdChecked: !!p.threshold_checked,
    rules: p.rules ? JSON.parse(p.rules) : null, depts: p.depts ? JSON.parse(p.depts) : null, approvals: p.approvals ? JSON.parse(p.approvals) : [], lastAuto: p.last_auto,
    policy: p.policy ? JSON.parse(p.policy) : null, rejections: p.rejections ? JSON.parse(p.rejections) : [], formulas: p.formulas ? JSON.parse(p.formulas) : null,
    openedAt: p.opened_at ?? null, lastForecast: p.last_forecast ?? null, ...(p.people && { people: JSON.parse(p.people) }), ...(p.auto && { auto: JSON.parse(p.auto) }),
  }));
  const answers = {};
  for (const a of all('SELECT * FROM answers ORDER BY rowid')) {
    const x = (answers[a.task_id] ||= { answers: {}, weights: {} });
    x.answers[a.criterion_id] = a.value; x.weights[a.criterion_id] = a.weight;
  }
  const responses = {};
  for (const r of all('SELECT * FROM responses')) responses[r.task_id] = { ...(answers[r.task_id] || { answers: {}, weights: {} }), comment: r.comment ? JSON.parse(r.comment) : null, submittedAt: r.submitted_at, instrumentId: r.instrument_id };
  db.tasks = all('SELECT * FROM tasks ORDER BY rowid').map((t) => ({
    id: t.id, periodId: t.period_id, evaluatorId: t.evaluator_id, targetId: t.target_id, group: t.evaluator_group, sectionId: t.section_id,
    draft: t.draft ? JSON.parse(t.draft) : null, response: responses[t.id] || null,
  }));
  db.requests = all('SELECT * FROM result_requests ORDER BY rowid').map((r) => ({ id: r.id, periodId: r.period_id, targetId: r.target_id, office: r.office, headId: r.head_id, byId: r.by_id, at: r.at }));
  db.pastResults = all('SELECT * FROM past_results ORDER BY rowid').map((r) => ({ id: r.id, userId: r.user_id, periodLabel: r.period_label, final: r.final, note: r.note, importedAt: r.imported_at }));
  db.formulas = all('SELECT * FROM formulas ORDER BY rowid').map((f) => ({ id: f.id, key: f.key, targetType: f.target_type, dept: f.dept, version: f.version, status: f.status, config: JSON.parse(f.config), meta: f.meta ? JSON.parse(f.meta) : {} }));
  db.results = all('SELECT * FROM results ORDER BY rowid').map((r) => ({ periodId: r.period_id, targetId: r.target_id, data: JSON.parse(r.data) }));
  db.plans = all('SELECT * FROM plans ORDER BY rowid').map((r) => JSON.parse(r.data));
  db.policies = all('SELECT * FROM policies ORDER BY version').map((x) => ({ version: x.version, policy: JSON.parse(x.data), at: x.at, byId: x.by_id, byName: x.by_name, reason: x.reason }));
  db.notifications = all('SELECT * FROM notifications ORDER BY rowid').map((n) => ({ id: n.id, key: n.key, userId: n.user_id, kind: n.kind, at: n.at, read: !!n.read, text: n.text }));
  return db;
}

// ---------- in-memory copy + change tracking ----------
let current = null;     // the db object
let saved = new Map();  // table -> Map(rowKey -> JSON of row as last written)

const keyOf = (t, row) => t.key.map((k) => row[k]).join('\u0000');
function snapshot(db) {
  const m = new Map();
  for (const t of TABLES) m.set(t.name, new Map(t.rows(db).map((r) => [keyOf(t, r), JSON.stringify(r)])));
  return m;
}

function inTransaction(fn) {
  sql.exec('BEGIN');
  try { fn(); sql.exec('COMMIT'); } catch (e) { sql.exec('ROLLBACK'); throw e; }
}

/** The current data. Treat it as read-only; change data with save(). */
export function getDb() {
  if (!current) { current = readFromTables(); saved = snapshot(current); }
  return current;
}

/** Write a changed copy of the db: only rows that differ are inserted, updated or deleted. */
export function save(next) {
  const after = snapshot(next);
  inTransaction(() => {
    for (const t of TABLES) {                     // inserts/updates, parents first
      const before = saved.get(t.name);
      const rows = after.get(t.name);
      for (const [k, json] of rows) {
        if (before.get(k) === json) continue;
        const row = JSON.parse(json);
        const cols = Object.keys(row);
        const upd = cols.filter((c) => !t.key.includes(c));
        sql.prepare(`INSERT INTO ${t.name} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})
          ON CONFLICT (${t.key.join(',')}) DO ${upd.length ? `UPDATE SET ${upd.map((c) => `${c}=excluded.${c}`).join(',')}` : 'NOTHING'}`)
          .run(...cols.map((c) => row[c]));
      }
    }
    for (const t of [...TABLES].reverse()) {      // deletes, children first
      const rows = after.get(t.name);
      for (const k of saved.get(t.name).keys()) {
        if (rows.has(k)) continue;
        const parts = k.split('\u0000');
        sql.prepare(`DELETE FROM ${t.name} WHERE ${t.key.map((c) => `${c}=?`).join(' AND ')}`).run(...parts);
      }
    }
  });
  current = next; saved = after;
}

/** Replace everything (first run, or HR "Reset simulated data"). Every db.users entry needs a passwordHash. */
export function replaceAll(db) {
  const users = db.users;
  inTransaction(() => {
    for (const t of ['plans', 'results', 'answers', 'responses', 'result_requests', 'past_results', 'tasks', 'notifications', 'policies', 'periods', 'group_weights', 'instrument_items', 'instruments', 'criteria', 'section_students', 'sections', 'evaluator_groups']) sql.exec(`DELETE FROM ${t}`);
    // keep sessions of users that still exist; replace user rows in place
    // free every username first, so a seed username can't clash with an account HR created
    sql.exec("UPDATE users SET username = '~' || id, email = NULL");
    const ins = sql.prepare(`INSERT INTO users (id, username, email, name, role, position, dept, evaluator_group_ids, password_hash, active, must_change_password) VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET username=excluded.username, email=excluded.email, name=excluded.name, role=excluded.role, position=excluded.position, dept=excluded.dept,
        evaluator_group_ids=excluded.evaluator_group_ids, password_hash=excluded.password_hash, active=excluded.active, must_change_password=excluded.must_change_password`);
    const insDept = sql.prepare('INSERT INTO departments (id, name, kind) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, kind=excluded.kind');
    const insEvaluatorGroup = sql.prepare('INSERT INTO evaluator_groups (id, name, built_in, active) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, built_in=excluded.built_in, active=excluded.active');
    for (const d of db.departments) insDept.run(d.id, d.name, d.kind);
    for (const g of db.evaluatorGroups || []) insEvaluatorGroup.run(g.id, g.name, g.builtIn ? 1 : 0, g.active === false ? 0 : 1);
    for (const u of users) ins.run(u.id, u.username, u.email ?? null, u.name, u.role, u.position ?? null, u.dept ?? null, Array.isArray(u.evaluatorGroupIds) ? JSON.stringify(u.evaluatorGroupIds) : null, u.passwordHash, u.active === false ? 0 : 1, u.mustChangePassword ? 1 : 0);
    const keep = new Set(users.map((u) => u.id));
    for (const { id } of all('SELECT id FROM users')) if (!keep.has(id)) sql.prepare('DELETE FROM users WHERE id=?').run(id); // sessions cascade
  });
  current = readFromTables(); saved = snapshot(current);
  save(db);
}

export const isEmpty = () => !sql.prepare('SELECT 1 FROM users LIMIT 1').get();

// ---------- users & sessions (used by login) ----------
export const findUserByUsername = (username) => sql.prepare('SELECT * FROM users WHERE lower(username) = lower(?)').get(username);
export const findUserByEmail = (email) => sql.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email);
/** The signed-in user's public details (no password hash), or undefined. */
export function findUserById(id) {
  const u = sql.prepare('SELECT id, username, email, name, role, position, dept, active, must_change_password FROM users WHERE id = ?').get(id);
  return u && { id: u.id, username: u.username, email: u.email, name: u.name, role: u.role, position: u.position, dept: u.dept, active: !!u.active, mustChangePassword: !!u.must_change_password };
}
export const createSession = (tokenHash, userId, expires) => sql.prepare('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?,?,?)').run(tokenHash, userId, expires);
export const findSession = (tokenHash) => sql.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(tokenHash);
export const deleteSession = (tokenHash) => sql.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
/** Sign a user out everywhere (optionally keeping one session, e.g. the one changing the password). */
export const deleteUserSessions = (userId, keepTokenHash = '') => sql.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(userId, keepTokenHash);
export const deleteExpiredSessions = () => sql.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());

// ---------- FR20: audit log (written directly, never edited or deleted by the app) ----------
// Each entry stores a SHA-256 hash of its own content plus the previous entry's hash (a hash chain).
// Changing, inserting or deleting an entry directly in the database breaks the chain; verifyAudit() finds where.
const GENESIS = 'evalU-audit-start';
const entryHash = (prev, e) => createHash('sha256').update([prev, e.at, e.user_id ?? '', e.user_name ?? '', e.action, e.detail ?? ''].join('\u001f')).digest('hex');
const lastHash = () => sql.prepare('SELECT hash FROM audit_log WHERE hash IS NOT NULL ORDER BY id DESC LIMIT 1').get()?.hash || GENESIS;
export function addAudit(user, action, detail = '') {
  const e = { at: new Date().toISOString(), user_id: user?.id ?? null, user_name: user?.name ?? null, action, detail: String(detail).slice(0, 1000) };
  const prev = lastHash();
  sql.prepare('INSERT INTO audit_log (at, user_id, user_name, action, detail, prev_hash, hash) VALUES (?,?,?,?,?,?,?)')
    .run(e.at, e.user_id, e.user_name, e.action, e.detail, prev, entryHash(prev, e));
}
// Entries written before the chain existed get their hashes once, in order.
{
  const missing = sql.prepare('SELECT * FROM audit_log WHERE hash IS NULL ORDER BY id').all();
  if (missing.length) {
    let prev = sql.prepare('SELECT hash FROM audit_log WHERE hash IS NOT NULL AND id < ? ORDER BY id DESC LIMIT 1').get(missing[0].id)?.hash || GENESIS;
    const upd = sql.prepare('UPDATE audit_log SET prev_hash = ?, hash = ? WHERE id = ?');
    inTransaction(() => { for (const e of missing) { const h = entryHash(prev, e); upd.run(prev, h, e.id); prev = h; } });
  }
}
/** Recompute the whole chain: { ok, checked, firstBad: { id, at, reason } | null }. */
export function verifyAudit() {
  let prev = GENESIS, checked = 0;
  for (const e of sql.prepare('SELECT * FROM audit_log ORDER BY id').all()) {
    checked++;
    if (e.prev_hash !== prev) return { ok: false, checked, firstBad: { id: e.id, at: e.at, reason: 'an entry before this one was deleted, or one was inserted' } };
    if (e.hash !== entryHash(prev, e)) return { ok: false, checked, firstBad: { id: e.id, at: e.at, reason: 'this entry was changed after it was written' } };
    prev = e.hash;
  }
  return { ok: true, checked, firstBad: null };
}
export const readAudit = (limit = 500) => sql.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit);
