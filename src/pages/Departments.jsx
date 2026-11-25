// Departments and offices: the list, and one page per department (its personnel and settings).
import { useState } from 'react';
import { useApp } from '../lib/store';
import {
  DEPT_KINDS, POSITIONS, TARGET_TYPES, activeDepts, deptKeep, deptWarnings, formulaFor, formulaWords, missingUbDepartments, plural, targetType, typeChange,
} from '../lib/logic';
import { Card, Select, SaveInput, Tabs, Screen, Badge, Avatar, Empty, useNav, useNavArgs, usePages, useTab, ask } from '../ui';

const HEAD = { college: ['dean'], basic: ['principal'], office: ['head'] };
/** The order people are listed in: heads first. */
const ORDER = ['dean', 'principal', 'head', 'chair', 'aprincipal', 'shead', 'secretary', 'faculty', 'ci', 'staff'];
const positionName = (u) => POSITIONS[u.role]?.[u.position] || u.position;
const peopleOf = (db, id) => db.users.filter((u) => u.dept === id);
const isStudent = (u) => u.role === 'ST';

export default function Departments() {
  const { db, act } = useApp();
  const args = useNavArgs(); // "Needs you" can open one department
  const [open, setOpen] = useState(args.deptId || null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('college');
  const [msg, setMsg] = useState('');
  const [adding, setAdding] = useState(false);
  const missing = missingUbDepartments(db);
  const inactive = db.departments.filter((d) => d.active === false);
  const groups = Object.entries(DEPT_KINDS).map(([k, l]) => [k, l, activeDepts(db).filter((d) => d.kind === k)]).filter(([, , list]) => list.length);
  const offices = activeDepts(db).filter((d) => d.kind === 'office').length;
  const tabs = [['dept', `Departments (${activeDepts(db).length - offices})`], ['office', `Offices (${offices})`], ...(inactive.length ? [['old', `Deactivated (${inactive.length})`]] : [])];
  const [tab, setTab] = useTab(tabs, 'dept');
  const shown = groups.filter(([k]) => (k === 'office') === (tab === 'office'));
  const add = async () => {
    setMsg('');
    if (!name.trim()) return setMsg('Type the name first.');
    if (await act('addDepartment', { name, kind })) { setMsg(`${name.trim()} added.`); setName(''); setAdding(false); setTab(kind === 'office' ? 'office' : 'dept'); }
  };
  const show = (id) => { setOpen(id); setMsg(''); window.scrollTo(0, 0); };

  const d = open && db.departments.find((x) => x.id === open);
  if (d) return <Department key={d.id} d={d} onBack={(text = '') => { show(null); setMsg(text); }} />;
  if (adding) {
    return (
      <Screen title="Add a department or office" backTo="Departments & offices" onBack={() => setAdding(false)}>
        {msg && <div className="note warn">{msg}</div>}
        <div className="row">
          <label>Name<br /><input placeholder="e.g. Office of the Registrar" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} /></label>
          <label>Type<br /><Select value={kind} onChange={setKind} aria-label="Type">{Object.entries(DEPT_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
        </div>
        <div className="row"><button onClick={add}>Add</button><button className="ghost" onClick={() => setAdding(false)}>Cancel</button></div>
      </Screen>
    );
  }
  const addButton = <button onClick={() => { setMsg(''); setKind(tab === 'office' ? 'office' : 'college'); setAdding(true); }}>+ Add {tab === 'office' ? 'an office' : 'a department'}</button>;
  return (
    <>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="note"><b>Everyone belongs to a department or an office.</b> A <b>College</b> or <b>Basic Education</b> department has classes, teachers and students. An <b>Office</b> (for example the Registrar) has an office head and staff, who evaluate each other. Open one to see its people or change it.</div>
      {msg && <div className="note ok">{msg}</div>}
      {tab === 'dept' && missing.length > 0 && <div className="row"><button className="ghost" onClick={async () => { setMsg(''); const r = await act('addUbDepartments'); if (r) setMsg(`${r.added} University of Baguio department(s) added.`); }}>Add the {missing.length} missing UB department(s)</button><span className="muted">{missing.map((x) => x.id).join(', ')}</span></div>}
      {tab === 'office' && !shown.length && <Card title="Offices (0)" actions={addButton}><p className="muted">No office yet, for example the Office of the Registrar.</p></Card>}
      {tab !== 'old' && shown.map(([k, l, list], i) => <Card key={k} title={`${k === 'office' ? 'Offices' : l} (${list.length})`} actions={i === 0 && addButton}><List list={list} onOpen={show} /></Card>)}
      {tab === 'old' && <Card title={`Deactivated (${inactive.length})`}><List list={inactive} onOpen={show} type /></Card>}
    </>
  );
}

function List({ list, onOpen, type = false }) {
  const { db } = useApp();
  const office = list.every((d) => d.kind === 'office');
  return (
    <table>
      <thead><tr><th>Name</th>{type && <th>Type</th>}<th>Head</th><th>Personnel</th>{!office && <th>Students</th>}<th /></tr></thead>
      <tbody>{list.map((d) => {
        const people = peopleOf(db, d.id), head = people.filter((u) => u.active !== false && HEAD[d.kind].includes(u.position));
        const warn = d.active === false ? [] : deptWarnings(db, d);
        return (
          <tr key={d.id}>
            <td><button className="link tool-open" onClick={() => onOpen(d.id)}>{d.name}</button>{warn.map((w) => <div key={w} className="warn-text small">{w}</div>)}</td>
            {type && <td>{DEPT_KINDS[d.kind]}</td>}
            <td>{head.length ? head.map((u) => <div key={u.id}>{u.name}</div>) : <span className="muted">none</span>}</td>
            <td>{people.filter((u) => !isStudent(u)).length}</td>
            {!office && <td>{people.filter(isStudent).length}</td>}
            <td><button className="ghost" aria-label={`Open ${d.name}`} onClick={() => onOpen(d.id)}>Open</button></td>
          </tr>
        );
      })}</tbody>
    </table>
  );
}

/* ---------------- one department ---------------- */
function Department({ d, onBack }) {
  const { db } = useApp();
  const office = d.kind === 'office';
  const people = peopleOf(db, d.id), staff = people.filter((u) => !isStudent(u));
  const warn = d.active === false ? [] : deptWarnings(db, d);
  const tabs = [['people', `Personnel (${staff.length})`], ['settings', 'Settings']];
  const [tab, setTab] = useState('people');
  const heads = people.filter((u) => u.active !== false && HEAD[d.kind].includes(u.position));
  return (
    <>
      <button className="ghost back" onClick={() => onBack()}>‹ All departments and offices</button>
      <Card className="fx-head">
        <h2>{d.name}</h2>
        <p className="muted">{DEPT_KINDS[d.kind]}{heads.length ? ` · ${heads.map((u) => `${positionName(u)}: ${u.name}`).join(', ')}` : ''}{d.active === false && <> <Badge kind="muted">deactivated</Badge></>}</p>
        {warn.length > 0 && <div className="note warn"><b>Missing raters.</b> These people get no evaluation from that group:<ul>{warn.map((w) => <li key={w}>{w}</li>)}</ul></div>}
      </Card>
      <Tabs tabs={tabs} value={tab} onChange={setTab} label={`Parts of ${d.name}`} />
      {tab === 'people' && <People d={d} people={staff} students={people.length - staff.length} office={office} />}
      {tab === 'settings' && <Settings d={d} people={people} onBack={onBack} />}
    </>
  );
}

function People({ d, people, students, office }) {
  const { db } = useApp();
  const go = useNav();
  const [pos, setPos] = useState('');
  const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  const order = (u) => (ORDER.indexOf(u.position) + 1 || 99) + (u.active === false ? 100 : 0);
  const positions = [...new Set(people.map((u) => u.position))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const list = people.filter((u) => (!pos || u.position === pos) && (!s || `${u.name} ${u.username} ${u.email || ''}`.toLowerCase().includes(s))).sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  const { rows, bar } = usePages(list, `${pos}|${s}`, 10);
  const edit = (u) => go('accounts', { userId: u.id, deptId: d.id });
  return (
    <Card title={`Personnel (${list.length}${list.length !== people.length ? ` of ${people.length}` : ''})`} actions={people.length > 0 && <button className="ghost" onClick={() => go('accounts', { dept: d.id })}>See all in People & sign-in</button>}>
      {people.length === 0 ? <Empty icon="users" title="Nobody yet">Add people under People &amp; sign-in{d.kind === 'office' ? '' : ', or import a class list'}.</Empty> : <>
        <div className="row">
          <Select value={pos} onChange={setPos} aria-label="Position"><option value="">Everyone</option>{positions.map((p) => { const some = people.filter((u) => u.position === p); return <option key={p} value={p}>{positionName(some[0])} ({some.length})</option>; })}</Select>
          <input placeholder="Search a name (optional)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {list.length === 0 ? <Empty icon="users" title="Nobody matches">Change the filters above.</Empty> : <table>
          <thead><tr><th>Name</th><th>Position</th><th>Rated as</th><th>Status</th><th /></tr></thead>
          <tbody>{rows.map((u) => (
            <tr key={u.id} className={u.active === false ? 'inactive' : ''}>
              <td><span className="who-cell"><Avatar name={u.name} size={30} /><button className="link tool-open" onClick={() => edit(u)}>{u.name}</button></span></td>
              <td>{positionName(u)}</td>
              <td>{TARGET_TYPES[targetType(db, u)] || <span className="muted">not rated</span>}</td>
              <td>{u.active === false ? <Badge kind="overdue">deactivated</Badge> : u.mustChangePassword ? <Badge kind="pending">not signed in yet</Badge> : <Badge kind="completed">active</Badge>}</td>
              <td><button className="ghost" aria-label={`Edit ${u.name}`} onClick={() => edit(u)}>Edit</button></td>
            </tr>
          ))}</tbody>
        </table>}
        {bar}
      </>}
      {!office && <p className="muted small">Students of this department: <b>{students}</b>. They come from the class lists.</p>}
    </Card>
  );
}

/** What changing the type does, in words, for the question before it. */
function typeText(db, d, kind) {
  const names = Object.fromEntries((db.evaluatorGroups || []).map((g) => [g.id, g.name]));
  const words = (tt) => formulaWords(formulaFor(db, null, tt, d.id), names).replace(/^Final rating = /, '');
  const { moves, warnings } = typeChange(db, d, kind);
  return [
    ...moves.map((m) => `${plural(m.n, 'person', 'people')} rated as ${TARGET_TYPES[m.from]} would be rated as ${TARGET_TYPES[m.to]}, with that category's tools.\nFormula now: ${words(m.from)}\nFormula then: ${words(m.to)}`),
    ...(moves.length ? [] : ["Nobody's rating changes."]),
    ...(warnings.length ? [`Raters that would be missing:\n${warnings.map((w) => `• ${w}`).join('\n')}`] : []),
    'Results of closed periods stay the same.',
  ].join('\n\n');
}

function Settings({ d, people, onBack }) {
  const { db, act } = useApp();
  const [to, setTo] = useState('');
  const [moving, setMoving] = useState(false);
  const [msg, setMsg] = useState('');
  const keep = deptKeep(db, d.id), activeHere = people.filter((u) => u.active !== false).length;
  const changeType = async (kind) => {
    if (kind === d.kind) return;
    // already evaluated in an open period: the server says why, so there is nothing to ask
    const ids = new Set(people.map((u) => u.id)), open = new Set(db.periods.filter((p) => p.status === 'open').map((p) => p.id));
    const blocked = db.tasks.some((t) => t.response && open.has(t.periodId) && ids.has(t.targetId));
    if (!blocked && !(await ask(`Change ${d.name} to ${DEPT_KINDS[kind]}?`, typeText(db, d, kind), { ok: `Change to ${DEPT_KINDS[kind]}`, danger: true }))) return;
    if (await act('updateDepartment', { deptId: d.id, kind })) setMsg(`${d.name} is now ${DEPT_KINDS[kind]}.`);
  };
  const move = async () => {
    const b = db.departments.find((x) => x.id === to);
    if (!(await ask(`Move everyone from ${d.name}?`, `${people.length} account(s) and their classes move to ${b.name}. Results of closed periods stay with ${d.name}.${d.kind !== b.kind ? '\n\nThe two have different types, so teachers are rated with another formula from the next period.' : ''}`, { ok: 'Move everyone' }))) return;
    const r = await act('moveDepartment', { from: d.id, to });
    if (r) { setMoving(false); setMsg(`${r.people} account(s) and ${r.classes} class(es) moved to ${b.name}.`); }
  };
  const remove = async () => { if (await ask(`Delete ${d.name}?`, 'It is removed from the list.', { ok: 'Delete', danger: true }) && await act('deleteDepartment', { deptId: d.id })) onBack(`${d.name} was deleted.`); };
  return (
    <>
      {msg && <div className="note ok">{msg}</div>}
      <Card title="Name and type">
        <div className="row">
          <label>Name <span className="muted small">(saved when you leave the box)</span><br /><SaveInput className="wide" aria-label={`Name of ${d.name}`} value={d.name} onSave={(v) => act('updateDepartment', { deptId: d.id, name: v })} /></label>
        </div>
        <div className="row">
          <label>Type<br /><Select aria-label={`Type of ${d.name}`} value={d.kind} onChange={changeType}>{Object.entries(DEPT_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
        </div>
        <p className="muted small">The type decides how its teachers are rated. You are told what changes before it is saved.</p>
      </Card>
      <Card title="Move, deactivate or delete">
        {people.length > 0 && (moving ? (
          <>
            <label>Move everyone to<br /><Select value={to} onChange={setTo} aria-label="Move to"><option value="">Choose where…</option>{activeDepts(db).filter((x) => x.id !== d.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></label>
            <p className="muted small">Do this between periods. Results of closed periods stay with the department they were evaluated in.</p>
            <div className="row"><button disabled={!to} onClick={move}>Move everyone</button><button className="ghost" onClick={() => setMoving(false)}>Cancel</button></div>
          </>
        ) : <div className="row"><button className="ghost" onClick={() => setMoving(true)}>Move everyone to…</button><span className="muted">Every account and this semester's classes go to another department.</span></div>)}
        {d.active === false
          ? <div className="row"><button className="ghost" onClick={async () => { if (await act('setDepartmentActive', { deptId: d.id, active: true })) setMsg(`${d.name} is active again.`); }}>Reactivate</button><span className="muted">It is offered again.</span></div>
          : <div className="row"><button className="ghost" disabled={activeHere > 0} onClick={async () => { if (await act('setDepartmentActive', { deptId: d.id, active: false })) setMsg(`${d.name} was deactivated.`); }}>Deactivate</button><span className="muted">{activeHere ? `Not now: ${plural(activeHere, 'active account')} still here. Move or deactivate them first.` : 'It is not offered any more; its records stay.'}</span></div>}
        <div className="row"><button className="ghost" disabled={keep.length > 0} onClick={remove}>Delete</button><span className="muted">{keep.length ? `Not possible: it is still used by ${keep.join(', ')}.` : 'Nothing uses it, so it can be removed.'}</span></div>
      </Card>
    </>
  );
}
