// Evaluator groups (Scoring & calculation): who belongs to each group, where it counts, and rename, edit or remove it.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { POSITIONS, TARGET_TYPES, deptName, evaluatorGroups, groupName, groupsOf, groupUse, groupUsedBefore } from '../lib/logic';
import { Card, Select, Badge, ask } from '../ui';

const PEOPLE_POSITIONS = [...Object.entries(POSITIONS.TP), ...Object.entries(POSITIONS.NTP)];
const positionName = (p) => POSITIONS.TP[p] || POSITIONS.NTP[p] || p;

export default function EvaluatorGroups({ editing, setEditing }) {
  const { db, act } = useApp();
  const [old, setOld] = useState(false);
  const all = db.evaluatorGroups || [];
  const archived = all.filter((g) => g.active === false);
  const members = (g) => db.users.filter((u) => u.active !== false && (g.id === 'ST' ? u.role === 'ST' : groupsOf(db, u).includes(g.id)));
  const who = (g) => (g.id === 'ST' ? 'The students of each class' : g.positions?.length ? `Everyone with the position ${g.positions.map(positionName).join(', ')}` : g.builtIn ? 'By position' : 'Chosen people');

  const remove = async (g) => {
    const before = groupUsedBefore(db, g.id);
    const ok = await ask(`Delete ${g.name}?`, before ? 'It was used before, so it is archived: it disappears from the lists, and old results stay as they are. You can restore it.' : 'It was never used, so it is deleted with its tool.', { ok: before ? 'Archive' : 'Delete', danger: true });
    if (ok && await act('deleteEvaluatorGroup', { id: g.id })) setEditing(null);
  };
  return (
    <Card title="Evaluator groups">
      <p className="muted">Everyone who can rate, and where each group counts. Rename a group or change its members here. To delete one, remove it from the formulas first. To add one, use <b>+ Add evaluator group</b> above.</p>
      <table>
        <thead><tr><th>Group</th><th>Members</th><th>Counts in</th><th /></tr></thead>
        <tbody>
          {all.filter((g) => g.active !== false).map((g) => {
            const use = groupUse(db, g.id);
            return editing === g.id ? (
              <tr key={g.id}><td colSpan={4}><EditGroup g={g} onDone={() => setEditing(null)} /></td></tr>
            ) : (
              <tr key={g.id}>
                <td><b>{g.name}</b>{g.builtIn && <div className="muted small">built in</div>}</td>
                <td>{members(g).length} <span className="muted small">· {who(g)}</span></td>
                <td>{use.categories.length ? use.categories.map((t) => TARGET_TYPES[t]).join(', ') : <span className="muted">no formula</span>}</td>
                <td><span className="row" style={{ margin: 0 }}>
                  <button className="ghost" onClick={() => setEditing(g.id)}>Edit</button>
                  {!g.builtIn && <button className="ghost" disabled={use.list.length > 0} title={use.list.length ? `It counts in: ${use.list.join('; ')}` : ''} onClick={() => remove(g)}>Delete</button>}
                </span></td>
              </tr>
            );
          })}
          {old && archived.map((g) => (
            <tr key={g.id}><td><span className="muted">{g.name}</span> <Badge kind="muted">archived</Badge></td><td colSpan={2} className="muted">Kept for old results</td><td><button className="ghost" onClick={() => act('restoreEvaluatorGroup', { id: g.id })}>Restore</button></td></tr>
          ))}
        </tbody>
      </table>
      {archived.length > 0 && <button className="link" onClick={() => setOld(!old)}>{old ? 'Hide archived groups' : `Show archived groups (${archived.length})`}</button>}
    </Card>
  );
}

function EditGroup({ g, onDone }) {
  const { db, act } = useApp();
  const chosen = db.users.filter((u) => ['TP', 'NTP'].includes(u.role) && Array.isArray(u.evaluatorGroupIds) && u.evaluatorGroupIds.includes(g.id)).map((u) => u.id);
  const [name, setName] = useState(g.name);
  const [positions, setPositions] = useState(g.positions || []);
  const [userIds, setUserIds] = useState(chosen);
  const people = db.users.filter((u) => ['TP', 'NTP'].includes(u.role) && u.active !== false && !userIds.includes(u.id));
  const top = useRef(null);
  useEffect(() => { top.current?.scrollIntoView({ block: 'center' }); }, []); // it may be opened from the formula above
  const toggle = (p) => setPositions(positions.includes(p) ? positions.filter((x) => x !== p) : [...positions, p]);
  const save = async () => { if (await act('updateEvaluatorGroup', { id: g.id, name, ...(!g.builtIn && { positions, userIds }) })) onDone(); };
  return (
    <div className="plan-form" ref={top}>
      <h4>Name of the group</h4><input className="wide" aria-label="Name of the group" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      {g.builtIn
        ? <p className="muted small">The members of a built-in group come from each person's position{db.users.some((u) => evaluatorGroups(u).includes(g.id) && u.evaluatorGroupIds) ? ', or from their account under People & sign-in' : ''}. UB's printed sheets keep their own wording.</p>
        : <>
          <h4>Everyone with these positions</h4>
          <div className="row">{PEOPLE_POSITIONS.map(([k, l]) => <label key={k} className="inline"><input type="checkbox" checked={positions.includes(k)} onChange={() => toggle(k)} /> {l}</label>)}</div>
          <h4>And these people</h4>
          <div className="row">
            <Select value="" onChange={(v) => v && setUserIds([...userIds, v])} aria-label="Add a person"><option value="">+ Add a person…</option>{people.map((u) => <option key={u.id} value={u.id}>{u.name} · {deptName(db, u.dept)}</option>)}</Select>
            {userIds.map((id) => <span key={id} className="tag">{db.users.find((u) => u.id === id)?.name}<button type="button" className="tag-x" aria-label="Remove" onClick={() => setUserIds(userIds.filter((x) => x !== id))}>×</button></span>)}
          </div>
          {!positions.length && !userIds.length && <p className="warn-text small">Choose at least one position or person, or nobody can rate as {name || groupName(db, g.id)}.</p>}
          <p className="muted small">Evaluations already created stay. New members get theirs when you click "Create evaluation tasks" again.</p>
        </>}
      <div className="row"><button disabled={!name.trim() || (!g.builtIn && !positions.length && !userIds.length)} onClick={save}>Save</button><button className="ghost" onClick={onDone}>Cancel</button></div>
    </div>
  );
}
