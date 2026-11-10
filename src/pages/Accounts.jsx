import { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { ROLES, POSITIONS, needsDept, deptName, missingUbDepartments, isNursingDept, nursingDepts } from '../lib/logic';
import { Card, Select, Badge, Avatar, Empty, SaveInput, newestFirst, usePages } from '../ui';

/* ---------------- change your own password ---------------- */
export function PasswordForm({ onDone, submitLabel = 'Change password', askCurrent = true }) {
  const { changePassword } = useApp();
  const [cur, setCur] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [show, setShow] = useState(false);
  const go = async (e) => {
    e.preventDefault();
    setErr('');
    if ((askCurrent && !cur) || !pw) return setErr('Fill in every field.');
    if (pw !== pw2) return setErr('The two new passwords do not match.');
    setBusy(true);
    const r = await changePassword(cur, pw);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setCur(''); setPw(''); setPw2('');
    onDone?.();
  };
  const type = show ? 'text' : 'password';
  return (
    <form onSubmit={go} noValidate className="pw-form">
      {askCurrent && <label className="field"><span>Current password</span><input type={type} value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></label>}
      <label className="field"><span>New password</span><input type={type} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus={!askCurrent} /></label>
      <label className="field"><span>Repeat new password</span><input type={type} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></label>
      <label className="inline muted"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords</label>
      <p className="muted">At least 8 characters, with a letter and a number. Don't include your username.</p>
      {err && <div className="login-err" role="alert">{err}</div>}
      <button type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
    </form>
  );
}

/** Shown after signing in with a temporary password: nothing else is available until it is changed. */
export function ForcedPasswordChange() {
  const { user, logout } = useApp();
  return (
    <div className="login-wrap">
      <div className="login-bg" aria-hidden="true" />
      <main className="login-center">
        <header className="login-head"><div className="login-logo">eval<span>U</span></div></header>
        <div className="login-card">
          <h1>Choose a new password</h1>
          <p className="muted">Hi {user.name}. You signed in with a temporary password from HR. Choose your own password to continue.</p>
          <PasswordForm submitLabel="Save and continue" askCurrent={false} />
          <p className="lc-foot"><button type="button" className="ghost" onClick={logout}>Log out</button></p>
        </div>
      </main>
    </div>
  );
}

/* ---------------- My account (everyone) ---------------- */
export function MyAccount() {
  const { db, user } = useApp();
  const [done, setDone] = useState(false);
  return (
    <>
      <Card title="My account">
        <table className="kv">
          <tbody>
            <tr><th>Name</th><td>{user.name}</td></tr>
            <tr><th>Username</th><td>{user.username}</td></tr>
            <tr><th>UB email</th><td>{user.email || '—'}</td></tr>
            <tr><th>Role</th><td>{ROLES[user.role]}{Object.keys(POSITIONS[user.role] || {}).length > 1 && ` — ${POSITIONS[user.role][user.position] || user.position}`}</td></tr>
            {user.dept && <tr><th>Department</th><td>{deptName(db, user.dept)}</td></tr>}
          </tbody>
        </table>
        <p className="muted">To correct your name, role or department, contact the HRMC office.</p>
      </Card>
      <Card title="Change password">
        {done && <div className="note ok">Your password was changed. You were signed out on other devices.</div>}
        <PasswordForm onDone={() => setDone(true)} />
      </Card>
    </>
  );
}

/* ---------------- HR: accounts ---------------- */
const EMPTY = { name: '', username: '', email: '', role: 'ST', position: 'student', dept: '', sectionIds: [] };

function AccountForm({ initial, onSave, onCancel, saveLabel }) {
  const { db } = useApp();
  const [f, setF] = useState(initial);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setRole = (role) => setF((x) => ({ ...x, role, position: Object.keys(POSITIONS[role])[0], dept: needsDept(role) ? x.dept : '', sectionIds: role === 'ST' ? x.sectionIds : [] }));
  const classes = db.sections.filter((s) => s.dept === f.dept);
  // Clinical Instructors are only in the School of Nursing
  const chosenDept = db.departments.find((d) => d.id === f.dept);
  const positions = Object.entries(POSITIONS[f.role]).filter(([k]) => k !== 'ci' || !chosenDept || isNursingDept(chosenDept) || f.position === 'ci');
  const deptChoices = f.position === 'ci' ? nursingDepts(db) : db.departments;
  const setPosition = (v) => setF((x) => {
    const keep = v !== 'ci' || isNursingDept(db.departments.find((d) => d.id === x.dept));
    return { ...x, position: v, dept: keep ? x.dept : (nursingDepts(db)[0]?.id || ''), sectionIds: keep ? x.sectionIds : [] };
  });
  const toggle = (id) => set('sectionIds', f.sectionIds.includes(id) ? f.sectionIds.filter((x) => x !== id) : [...f.sectionIds, id]);
  return (
    <div className="acc-form">
      <div className="row">
        <label>Full name<br /><input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Juan Dela Cruz" /></label>
        <label>Username<br /><input value={f.username} onChange={(e) => set('username', e.target.value.toLowerCase())} placeholder="e.g. 20226699" /></label>
        <label>Official UB email<br /><input type="email" value={f.email} onChange={(e) => set('email', e.target.value.toLowerCase())} placeholder={f.role === 'ST' ? 'e.g. 20226699@s.ubaguio.edu' : 'e.g. jdelacruz@ubaguio.edu'} /></label>
      </div>
      <p className="muted">People sign in with this email. Only official UB addresses (ending in ubaguio.edu) are accepted.</p>
      <div className="row">
        <label>Role<br /><Select value={f.role} onChange={setRole}>{Object.entries(ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
        <label>Position<br /><Select value={f.position} onChange={setPosition}>{positions.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
        {needsDept(f.role) && (
          <label>Department<br />
            <Select value={f.dept} onChange={(v) => setF((x) => ({ ...x, dept: v, sectionIds: [] }))}>
              <option value="">Choose…</option>
              {deptChoices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </label>
        )}
      </div>
      {f.position === 'ci' && <p className="muted">Clinical Instructors are only in the School of Nursing, so only Nursing students evaluate them.</p>}
      {f.position === 'ci' && !nursingDepts(db).length && <div className="note warn">Add the School of Nursing under Departments first.</div>}
      {f.role === 'ST' && f.dept && (
        <div className="row">
          <span className="muted">Classes:</span>
          {classes.length ? classes.map((s) => (
            <label key={s.id} className="inline"><input type="checkbox" checked={f.sectionIds.includes(s.id)} onChange={() => toggle(s.id)} /> {s.code}</label>
          )) : <span className="muted">No class sections in this department.</span>}
        </div>
      )}
      <div className="row">
        <button onClick={() => onSave(f)}>{saveLabel}</button>
        {onCancel && <button className="ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}

function TempPasswordNote({ info, onClose }) {
  const box = useRef(null);
  const [copied, setCopied] = useState(false);
  // bring the box into view (e.g. after "Reset password" far down the list)
  useEffect(() => { box.current?.scrollIntoView({ block: 'center' }); }, [info]);
  const copy = async () => { try { await navigator.clipboard.writeText(info.tempPassword); setCopied(true); } catch { setCopied(false); } };
  return (
    <div ref={box} className="note ok row" style={{ justifyContent: 'space-between' }}>
      <span>
        Temporary password for <b>{info.username}</b>: <code className="temp-pw">{info.tempPassword}</code><br />
        <span className="muted">Give it to them privately. They must choose their own password when they first sign in. Until then you can see it again with <b>Show temporary password</b> in the list below.</span>
      </span>
      <span className="row" style={{ margin: 0 }}>
        <button className="ghost" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        <button className="ghost" onClick={onClose}>Done</button>
      </span>
    </div>
  );
}

/** HR adds, renames and removes departments. The type decides which weights a teacher's result uses. */
function Departments() {
  const { db, act } = useApp();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('college');
  const [msg, setMsg] = useState('');
  const people = (id) => db.users.filter((u) => u.dept === id).length;
  const inUse = (id) => people(id) > 0 || db.sections.some((s) => s.dept === id) || db.instruments.some((i) => i.dept === id);
  const add = async () => {
    setMsg('');
    if (!name.trim()) return setMsg('Type the department name first.');
    if (await act('addDepartment', { name, kind })) { setMsg(`${name.trim()} added.`); setName(''); }
  };
  return (
    <Card title={`Departments (${db.departments.length})`}>
      {db.departments.length === 0 && <div className="note warn"><b>Add your departments first.</b> Every student, teacher and staff member belongs to one.</div>}
      {missingUbDepartments(db).length > 0 && (
        <div className="row">
          <button className="ghost" onClick={async () => { setMsg(''); const r = await act('addUbDepartments'); if (r) setMsg(`${r.added} University of Baguio department(s) added.`); }}>
            Add the {missingUbDepartments(db).length} missing UB department(s)
          </button>
          <span className="muted">{missingUbDepartments(db).map((d) => d.id).join(', ')}</span>
        </div>
      )}
      <div className="row">
        <input className="wide" placeholder="Department name, e.g. School of Nursing" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Select value={kind} onChange={setKind}><option value="college">College</option><option value="basic">Basic Education</option></Select>
        <button onClick={add}>Add department</button>
      </div>
      {msg && <div className="note">{msg}</div>}
      {db.departments.length > 0 && (
        <table>
          <thead><tr><th>Department</th><th>Type</th><th>People</th><th /></tr></thead>
          <tbody>{newestFirst(db.departments).map((d) => (
            <tr key={d.id}>
              <td><SaveInput className="wide" value={d.name} onSave={(v) => act('updateDepartment', { deptId: d.id, name: v })} /></td>
              <td><Select value={d.kind} onChange={(v) => act('updateDepartment', { deptId: d.id, kind: v })}><option value="college">College</option><option value="basic">Basic Education</option></Select></td>
              <td>{people(d.id)}</td>
              <td><button className="ghost" disabled={inUse(d.id)} title={inUse(d.id) ? 'People, classes or forms still belong to this department' : ''}
                onClick={() => { if (confirm(`Delete ${d.name}?`)) act('deleteDepartment', { deptId: d.id }); }}>Delete</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <p className="muted">Click a name to rename it. The type decides the weights for teachers: College (Students 40, Dean 40, Program Chair 20) or Basic Education (Students 40, Principal 20, Assistant Principal 20, Subject Head 20).</p>
    </Card>
  );
}

export function Accounts() {
  const { db, user, act } = useApp();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [temp, setTemp] = useState(null);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [dept, setDept] = useState('');
  const [showInactive, setShowInactive] = useState(true);

  const enrolled = (id) => db.sections.filter((s) => s.studentIds.includes(id)).map((s) => s.id);
  const create = async (f) => {
    setMsg('');
    const r = await act('createUser', f);
    if (r) { setTemp(r); setAdding(false); }
  };
  const update = async (f) => {
    setMsg('');
    if (await act('updateUser', { userId: editing, ...f })) { setEditing(null); setMsg('Account updated.'); }
  };
  const reset = async (u) => {
    if (!confirm(`Give ${u.name} a new temporary password? Their current password stops working and they are signed out.`)) return;
    setMsg('');
    const r = await act('resetPassword', { userId: u.id });
    if (r) setTemp(r);
  };
  const setActive = async (u, active) => {
    if (!active && !confirm(`Deactivate ${u.name}? They are signed out and can't sign in until reactivated. Their past evaluations are kept.`)) return;
    setMsg('');
    if (await act('setUserActive', { userId: u.id, active })) setMsg(`${u.name} was ${active ? 'reactivated' : 'deactivated'}.`);
  };

  const s = q.trim().toLowerCase();
  const list = newestFirst(db.users).filter((u) => (!role || u.role === role) && (!dept || u.dept === dept) && (showInactive || u.active)
    && (!s || u.name.toLowerCase().includes(s) || u.username.toLowerCase().includes(s) || (u.email || '').toLowerCase().includes(s)));
  const { rows, bar } = usePages(list, `${role}|${dept}|${showInactive}|${s}`);

  return (
    <>
      <div className="note">
        <b>Accounts are created by HR</b>, not by sign-up, so nobody can give themselves a role. A new account gets a
        temporary password that the person must change the first time they sign in.
      </div>
      <Departments />

      {temp && <TempPasswordNote info={temp} onClose={() => setTemp(null)} />}
      {msg && <div className="note">{msg}</div>}

      <Card title="Add an account" actions={!adding && <button onClick={() => { setAdding(true); setTemp(null); }}>New account</button>}>
        {adding
          ? <AccountForm initial={EMPTY} onSave={create} onCancel={() => setAdding(false)} saveLabel="Create account" />
          : <p className="muted">Create accounts for new students, faculty and staff.</p>}
      </Card>

      <Card title={`Accounts (${list.length})`} actions={
        <div className="row" style={{ margin: 0 }}>
          <input placeholder="Search name, username or email" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select value={role} onChange={setRole}><option value="">All roles</option>{Object.entries(ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          <Select value={dept} onChange={setDept}><option value="">All departments</option>{db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
          <label className="inline muted"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show deactivated</label>
        </div>
      }>
        <table>
          <thead><tr><th>Name</th><th>Username / email</th><th>Role</th><th>Department</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((u) => editing === u.id ? (
              <tr key={u.id}><td colSpan={6}>
                <AccountForm initial={{ name: u.name, username: u.username, email: u.email || '', role: u.role, position: u.position, dept: u.dept || '', sectionIds: enrolled(u.id) }}
                  onSave={update} onCancel={() => setEditing(null)} saveLabel="Save changes" />
              </td></tr>
            ) : (
              <tr key={u.id} className={u.active ? '' : 'inactive'}>
                <td><span className="who-cell"><Avatar name={u.name} size={30} />{u.name}{u.id === user.id && <span className="muted"> (you)</span>}</span></td>
                <td><code>{u.username}</code><br /><span className="muted">{u.email}</span></td>
                <td>{POSITIONS[u.role]?.[u.position] || u.position}<br /><span className="muted">{ROLES[u.role]}</span></td>
                <td>{u.dept ? deptName(db, u.dept) : '—'}</td>
                <td>
                  {!u.active ? <Badge kind="overdue">deactivated</Badge>
                    : u.mustChangePassword ? <Badge kind="pending">temporary password</Badge>
                      : <Badge kind="completed">active</Badge>}
                </td>
                <td className="row" style={{ margin: 0 }}>
                  <button className="ghost" onClick={() => { setEditing(u.id); setTemp(null); }}>Edit</button>
                  {u.hasTempPassword && <button className="ghost" onClick={async () => { setMsg(''); const r = await act('showTempPassword', { userId: u.id }); if (r) setTemp(r); }}>Show temporary password</button>}
                  {u.id !== user.id && u.active && <button className="ghost" onClick={() => reset(u)}>Reset password</button>}
                  {u.id !== user.id && (u.active
                    ? <button className="ghost" onClick={() => setActive(u, false)}>Deactivate</button>
                    : <button className="ghost" onClick={() => setActive(u, true)}>Reactivate</button>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <Empty icon="users" title="No accounts match">Change the filters above.</Empty>}
        {bar}
      </Card>
    </>
  );
}
