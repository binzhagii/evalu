// evalU database (SQLite, built into Node). File: server/data/evalu.db
//
// The tables below are the real storage. For the app's rules (src/lib/logic.js)
// the server also keeps the same data as one JavaScript object in memory ("db"),
// shaped exactly like the old browser data. Every change goes through save(),
// which writes only the rows that actually changed, inside one transaction.
import { DatabaseSync } from 'node:sqlite';
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
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  role TEXT NOT NULL,                                                     -- ST | TP | NTP | HR | DIR
  position TEXT, dept TEXT REFERENCES departments(id),
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
CREATE TABLE IF NOT EXISTS instruments (                                  -- evaluation forms
  id TEXT PRIMARY KEY, name TEXT NOT NULL, target_type TEXT NOT NULL, evaluator_group TEXT NOT NULL,
  UNIQUE (target_type, evaluator_group)
);
CREATE TABLE IF NOT EXISTS instrument_items (
  instrument_id TEXT NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  criterion_id TEXT NOT NULL REFERENCES criteria(id),
  weight REAL NOT NULL,
  PRIMARY KEY (instrument_id, criterion_id)
);
CREATE TABLE IF NOT EXISTS group_weights (                                -- e.g. College faculty: ST 40 / DEAN 40 / CHAIR 20
  target_type TEXT NOT NULL, evaluator_group TEXT NOT NULL, weight REAL,  -- NULL = not set by HR yet
  PRIMARY KEY (target_type, evaluator_group)
);
CREATE TABLE IF NOT EXISTS periods (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, deadline TEXT NOT NULL,
  status TEXT NOT NULL,                                                   -- open | closed
  release_stage TEXT NOT NULL,                                            -- hr | dir | faculty
  threshold_checked INTEGER NOT NULL DEFAULT 0
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
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL
);
`);

// Databases created before accounts were added: add the new columns.
{
  const cols = new Set(sql.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
  if (!cols.has('active')) sql.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
  if (!cols.has('must_change_password')) sql.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0');
}

// ---------- how each table maps to the in-memory object ----------
// Listed parent-first. Rows are kept in insertion order (rowid), like the old arrays.
const TABLES = [
  { name: 'departments', key: ['id'], rows: (db) => db.departments.map((d) => ({ id: d.id, name: d.name, kind: d.kind })) },
  { name: 'users', key: ['id'], rows: (db) => db.users.map((u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, position: u.position ?? null, dept: u.dept ?? null, password_hash: u.passwordHash, active: u.active === false ? 0 : 1, must_change_password: u.mustChangePassword ? 1 : 0 })) },
  { name: 'sections', key: ['id'], rows: (db) => db.sections.map((s) => ({ id: s.id, code: s.code, subject: s.subject, faculty_id: s.facultyId, dept: s.dept })) },
  { name: 'section_students', key: ['section_id', 'student_id'], rows: (db) => db.sections.flatMap((s) => s.studentIds.map((st) => ({ section_id: s.id, student_id: st }))) },
  { name: 'criteria', key: ['id'], rows: (db) => db.criteria.map((c) => ({ id: c.id, text: c.text })) },
  { name: 'instruments', key: ['id'], rows: (db) => db.instruments.map((i) => ({ id: i.id, name: i.name, target_type: i.targetType, evaluator_group: i.group })) },
  { name: 'instrument_items', key: ['instrument_id', 'criterion_id'], rows: (db) => db.instruments.flatMap((i) => i.items.map((it) => ({ instrument_id: i.id, criterion_id: it.criterionId, weight: it.weight }))) },
  { name: 'group_weights', key: ['target_type', 'evaluator_group'], rows: (db) => Object.entries(db.rules).flatMap(([tt, r]) => Object.entries(r).map(([g, w]) => ({ target_type: tt, evaluator_group: g, weight: w }))) },
  { name: 'periods', key: ['id'], rows: (db) => db.periods.map((p) => ({ id: p.id, name: p.name, deadline: p.deadline, status: p.status, release_stage: p.releaseStage, threshold_checked: p.thresholdChecked ? 1 : 0 })) },
  { name: 'tasks', key: ['id'], rows: (db) => db.tasks.map((t) => ({ id: t.id, period_id: t.periodId, evaluator_id: t.evaluatorId, target_id: t.targetId, evaluator_group: t.group, section_id: t.sectionId, draft: t.draft ? JSON.stringify(t.draft) : null })) },
  { name: 'responses', key: ['task_id'], rows: (db) => db.tasks.filter((t) => t.response).map((t) => ({ task_id: t.id, submitted_at: t.response.submittedAt, comment: t.response.comment ? JSON.stringify(t.response.comment) : null })) },
  { name: 'answers', key: ['task_id', 'criterion_id'], rows: (db) => db.tasks.filter((t) => t.response).flatMap((t) => Object.entries(t.response.answers).map(([c, v]) => ({ task_id: t.id, criterion_id: c, value: v, weight: t.response.weights[c] ?? 1 }))) },
  { name: 'notifications', key: ['id'], rows: (db) => db.notifications.map((n) => ({ id: n.id, key: n.key ?? null, user_id: n.userId, kind: n.kind, at: n.at, read: n.read ? 1 : 0, text: n.text })) },
];

const all = (q, ...a) => sql.prepare(q).all(...a);

function readFromTables() {
  const db = { version: 1 };
  db.departments = all('SELECT id, name, kind FROM departments ORDER BY rowid');
  // password hashes stay on the server: view.js never sends them to the browser
  db.users = all('SELECT * FROM users ORDER BY rowid').map((u) => ({
    id: u.id, username: u.username, name: u.name, role: u.role, position: u.position, dept: u.dept,
    passwordHash: u.password_hash, active: !!u.active, mustChangePassword: !!u.must_change_password,
  }));
  const enrolled = {};
  for (const r of all('SELECT section_id, student_id FROM section_students ORDER BY rowid')) (enrolled[r.section_id] ||= []).push(r.student_id);
  db.sections = all('SELECT * FROM sections ORDER BY rowid').map((s) => ({ id: s.id, code: s.code, subject: s.subject, facultyId: s.faculty_id, dept: s.dept, studentIds: enrolled[s.id] || [] }));
  db.criteria = all('SELECT id, text FROM criteria ORDER BY rowid').map((c) => ({ ...c }));
  const items = {};
  for (const r of all('SELECT * FROM instrument_items ORDER BY rowid')) (items[r.instrument_id] ||= []).push({ criterionId: r.criterion_id, weight: r.weight });
  db.instruments = all('SELECT * FROM instruments ORDER BY rowid').map((i) => ({ id: i.id, name: i.name, targetType: i.target_type, group: i.evaluator_group, items: items[i.id] || [] }));
  db.rules = {};
  for (const r of all('SELECT * FROM group_weights ORDER BY rowid')) (db.rules[r.target_type] ||= {})[r.evaluator_group] = r.weight;
  db.periods = all('SELECT * FROM periods ORDER BY rowid').map((p) => ({ id: p.id, name: p.name, deadline: p.deadline, status: p.status, releaseStage: p.release_stage, thresholdChecked: !!p.threshold_checked }));
  const answers = {};
  for (const a of all('SELECT * FROM answers ORDER BY rowid')) {
    const x = (answers[a.task_id] ||= { answers: {}, weights: {} });
    x.answers[a.criterion_id] = a.value; x.weights[a.criterion_id] = a.weight;
  }
  const responses = {};
  for (const r of all('SELECT * FROM responses')) responses[r.task_id] = { ...(answers[r.task_id] || { answers: {}, weights: {} }), comment: r.comment ? JSON.parse(r.comment) : null, submittedAt: r.submitted_at };
  db.tasks = all('SELECT * FROM tasks ORDER BY rowid').map((t) => ({
    id: t.id, periodId: t.period_id, evaluatorId: t.evaluator_id, targetId: t.target_id, group: t.evaluator_group, sectionId: t.section_id,
    draft: t.draft ? JSON.parse(t.draft) : null, response: responses[t.id] || null,
  }));
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
    for (const t of ['answers', 'responses', 'tasks', 'notifications', 'periods', 'group_weights', 'instrument_items', 'instruments', 'criteria', 'section_students', 'sections']) sql.exec(`DELETE FROM ${t}`);
    // keep sessions of users that still exist; replace user rows in place
    // free every username first, so a seed username can't clash with an account HR created
    sql.exec("UPDATE users SET username = '~' || id");
    const ins = sql.prepare(`INSERT INTO users (id, username, name, role, position, dept, password_hash, active, must_change_password) VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET username=excluded.username, name=excluded.name, role=excluded.role, position=excluded.position, dept=excluded.dept,
        password_hash=excluded.password_hash, active=excluded.active, must_change_password=excluded.must_change_password`);
    const insDept = sql.prepare('INSERT INTO departments (id, name, kind) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, kind=excluded.kind');
    for (const d of db.departments) insDept.run(d.id, d.name, d.kind);
    for (const u of users) ins.run(u.id, u.username, u.name, u.role, u.position ?? null, u.dept ?? null, u.passwordHash, u.active === false ? 0 : 1, u.mustChangePassword ? 1 : 0);
    const keep = new Set(users.map((u) => u.id));
    for (const { id } of all('SELECT id FROM users')) if (!keep.has(id)) sql.prepare('DELETE FROM users WHERE id=?').run(id); // sessions cascade
  });
  current = readFromTables(); saved = snapshot(current);
  save(db);
}

export const isEmpty = () => !sql.prepare('SELECT 1 FROM users LIMIT 1').get();

// ---------- users & sessions (used by login) ----------
export const findUserByUsername = (username) => sql.prepare('SELECT * FROM users WHERE lower(username) = lower(?)').get(username);
/** The signed-in user's public details (no password hash), or undefined. */
export function findUserById(id) {
  const u = sql.prepare('SELECT id, username, name, role, position, dept, active, must_change_password FROM users WHERE id = ?').get(id);
  return u && { id: u.id, username: u.username, name: u.name, role: u.role, position: u.position, dept: u.dept, active: !!u.active, mustChangePassword: !!u.must_change_password };
}
export const createSession = (tokenHash, userId, expires) => sql.prepare('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?,?,?)').run(tokenHash, userId, expires);
export const findSession = (tokenHash) => sql.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(tokenHash);
export const deleteSession = (tokenHash) => sql.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
/** Sign a user out everywhere (optionally keeping one session, e.g. the one changing the password). */
export const deleteUserSessions = (userId, keepTokenHash = '') => sql.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(userId, keepTokenHash);
export const deleteExpiredSessions = () => sql.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
