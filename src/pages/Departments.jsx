// Departments and offices: add, rename, deactivate, move everyone, delete.
import { useState } from 'react';
import { useApp } from '../lib/store';
import { DEPT_KINDS, activeDepts, deptKeep, deptWarnings, missingUbDepartments } from '../lib/logic';
import { Card, Select, SaveInput, Tabs, Screen, useTab, ask } from '../ui';

export default function Departments() {
  const { db, act } = useApp();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('college');
  const [msg, setMsg] = useState('');
  const [moving, setMoving] = useState(null); // { from, to }
  const [adding, setAdding] = useState(false);
  const missing = missingUbDepartments(db);
  const inactive = db.departments.filter((d) => d.active === false);
  const people = (id) => db.users.filter((u) => u.dept === id);
  const add = async () => {
    setMsg('');
    if (!name.trim()) return setMsg('Type the name first.');
    if (await act('addDepartment', { name, kind })) { setMsg(`${name.trim()} added.`); setName(''); setAdding(false); setTab(kind === 'office' ? 'office' : 'dept'); }
  };
  const move = async () => {
    const a = db.departments.find((d) => d.id === moving.from), b = db.departments.find((d) => d.id === moving.to);
    if (!(await ask(`Move everyone from ${a.name}?`, `${people(a.id).length} account(s) and their classes move to ${b.name}. Results of closed periods stay with ${a.name}.${a.kind !== b.kind ? '\n\nThe two have different types, so teachers are rated with another formula from the next period.' : ''}`, { ok: 'Move everyone' }))) return;
    const r = await act('moveDepartment', moving);
    if (r) { setMsg(`${r.people} account(s) and ${r.classes} class(es) moved to ${b.name}.`); setMoving(null); }
  };
  const remove = async (d) => { if (await ask(`Delete ${d.name}?`, 'It is removed from the list.', { ok: 'Delete', danger: true })) act('deleteDepartment', { deptId: d.id }); };
  const rowOf = (d) => {
    const n = people(d.id), keep = deptKeep(db, d.id), warn = d.active === false ? [] : deptWarnings(db, d);
    return (
      <tr key={d.id}>
        <td><SaveInput className="wide" aria-label={`Name of ${d.name}`} value={d.name} onSave={(v) => act('updateDepartment', { deptId: d.id, name: v })} />{warn.map((w) => <div key={w} className="warn-text small">{w}</div>)}</td>
        <td><Select aria-label={`Type of ${d.name}`} value={d.kind} onChange={(v) => act('updateDepartment', { deptId: d.id, kind: v })}>{Object.entries(DEPT_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></td>
        <td>{n.length}{n.some((u) => u.active === false) && <span className="muted small"> ({n.filter((u) => u.active === false).length} deactivated)</span>}</td>
        <td><span className="row" style={{ margin: 0 }}>
          {d.active === false ? <button className="ghost" onClick={() => act('setDepartmentActive', { deptId: d.id, active: true })}>Reactivate</button> : <>
            {n.length > 0 && <button className="ghost" onClick={() => setMoving({ from: d.id, to: '' })}>Move everyone to…</button>}
            <button className="ghost" disabled={n.some((u) => u.active !== false)} title={n.some((u) => u.active !== false) ? 'Move or deactivate its people first' : ''} onClick={() => act('setDepartmentActive', { deptId: d.id, active: false })}>Deactivate</button>
          </>}
          <button className="ghost" disabled={keep.length > 0} title={keep.length ? `It is still used by: ${keep.join(', ')}. Move its people, then deactivate it.` : ''} onClick={() => remove(d)}>Delete</button>
        </span></td>
      </tr>
    );
  };
  const groups = Object.entries(DEPT_KINDS).map(([k, l]) => [k, l, activeDepts(db).filter((d) => d.kind === k)]).filter(([, , list]) => list.length);
  const offices = activeDepts(db).filter((d) => d.kind === 'office').length;
  const tabs = [['dept', `Departments (${activeDepts(db).length - offices})`], ['office', `Offices (${offices})`], ...(inactive.length ? [['old', `Deactivated (${inactive.length})`]] : [])];
  const [tab, setTab] = useTab(tabs, 'dept');
  const shown = groups.filter(([k]) => (k === 'office') === (tab === 'office'));
  const addButton = <button onClick={() => { setMsg(''); setKind(tab === 'office' ? 'office' : 'college'); setAdding(true); }}>+ Add {tab === 'office' ? 'an office' : 'a department'}</button>;
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
  if (moving) {
    return (
      <Screen title={`Move everyone from ${db.departments.find((d) => d.id === moving.from)?.name}`} backTo="Departments & offices" onBack={() => setMoving(null)}>
        <p className="muted">Do this between periods. Results of closed periods stay with the department they were evaluated in.</p>
        <label>Move to<br /><Select value={moving.to} onChange={(to) => setMoving({ ...moving, to })} aria-label="Move to"><option value="">Choose where…</option>{activeDepts(db).filter((d) => d.id !== moving.from).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></label>
        <div className="row"><button disabled={!moving.to} onClick={move}>Move everyone</button><button className="ghost" onClick={() => setMoving(null)}>Cancel</button></div>
      </Screen>
    );
  }
  return (
    <>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="note"><b>Everyone belongs to a department or an office.</b> A <b>College</b> or <b>Basic Education</b> department has classes, teachers and students. An <b>Office</b> (for example the Registrar) has an office head and staff, who evaluate each other.</div>
      {msg && <div className="note ok">{msg}</div>}
      {tab === 'dept' && missing.length > 0 && <div className="row"><button className="ghost" onClick={async () => { setMsg(''); const r = await act('addUbDepartments'); if (r) setMsg(`${r.added} University of Baguio department(s) added.`); }}>Add the {missing.length} missing UB department(s)</button><span className="muted">{missing.map((d) => d.id).join(', ')}</span></div>}
      {tab === 'office' && !shown.length && <Card title="Offices (0)" actions={addButton}><p className="muted">No office yet, for example the Office of the Registrar.</p></Card>}
      {tab !== 'old' && shown.map(([k, l, list], i) => (
        <Card key={k} title={`${k === 'office' ? 'Offices' : l} (${list.length})`} actions={i === 0 && addButton}>
          <table><thead><tr><th>Name</th><th>Type</th><th>People</th><th /></tr></thead><tbody>{list.map(rowOf)}</tbody></table>
        </Card>
      ))}
      {tab === 'old' && (
        <Card title={`Deactivated (${inactive.length})`}>
          <table><thead><tr><th>Name</th><th>Type</th><th>People</th><th /></tr></thead><tbody>{inactive.map(rowOf)}</tbody></table>
        </Card>
      )}
    </>
  );
}
