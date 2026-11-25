// Evaluator groups (Scoring & calculation): who belongs to each group, where it counts, and rename, edit or remove it.
import { useState } from 'react';
import { useApp } from '../lib/store';
import { POSITIONS, TARGET_TYPES, deptName, evaluatorGroups, groupsOf, groupUse, groupUsedBefore } from '../lib/logic';
import { Card, Select, Badge, ask } from '../ui';

const PEOPLE_POSITIONS = [...Object.entries(POSITIONS.TP), ...Object.entries(POSITIONS.NTP)];
const positionName = (p) => POSITIONS.TP[p] || POSITIONS.NTP[p] || p;

export default function EvaluatorGroups({ bar }) {
  const { db, act } = useApp();
  const [editing, setEditing] = useState(null); // the group being changed, or 'new'
  const [msg, setMsg] = useState('');
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
  const open = (id) => { setEditing(id); setMsg(''); window.scrollTo(0, 0); };
  if (editing) {
    return <GroupForm g={editing === 'new' ? null : all.find((g) => g.id === editing)} backTo="All evaluator groups" onCancel={() => open(null)}
      onDone={(r) => { const made = editing === 'new'; open(null); if (made) setMsg(`${r.name} was created. Nobody is asked to rate as ${r.name} yet: open a formula and click "+ Add a group to this formula".`); }} />;
  }
  return (
    <>
    {bar}
    {msg && <div className="note ok">{msg}</div>}
    <Card title="Evaluator groups" actions={<button onClick={() => open('new')}>+ New group</button>}>
      <p className="muted">Everyone who can rate, and where each group counts. To make a group count, add it to a formula. To delete one, remove it from the formulas first.</p>
      <table>
        <thead><tr><th>Group</th><th>Members</th><th>Counts in</th><th /></tr></thead>
        <tbody>
          {all.filter((g) => g.active !== false).map((g) => {
            const use = groupUse(db, g.id);
            return (
              <tr key={g.id}>
                <td><b>{g.name}</b>{g.builtIn && <div className="muted small">built in</div>}</td>
                <td>{members(g).length} <span className="muted small">· {who(g)}</span></td>
                <td>{use.categories.length ? use.categories.map((t) => TARGET_TYPES[t]).join(', ') : <span className="muted">no formula</span>}</td>
                <td><span className="row" style={{ margin: 0 }}>
                  <button className="ghost" onClick={() => open(g.id)}>Edit</button>
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
    </>
  );
}

/** A group on its own screen: create one (g is null), or change its name and members. */
export function GroupForm({ g, backTo, onDone, onCancel }) {
  const { db, act } = useApp();
  const chosen = g ? db.users.filter((u) => ['TP', 'NTP'].includes(u.role) && Array.isArray(u.evaluatorGroupIds) && u.evaluatorGroupIds.includes(g.id)).map((u) => u.id) : [];
  const [name, setName] = useState(g?.name || '');
  const [positions, setPositions] = useState(g?.positions || []);
  const [userIds, setUserIds] = useState(chosen);
  const people = db.users.filter((u) => ['TP', 'NTP'].includes(u.role) && u.active !== false && !userIds.includes(u.id));
  const toggle = (p) => setPositions(positions.includes(p) ? positions.filter((x) => x !== p) : [...positions, p]);
  const fixed = !!g?.builtIn, empty = !fixed && !positions.length && !userIds.length;
  const save = async () => {
    const r = g ? await act('updateEvaluatorGroup', { id: g.id, name, ...(!fixed && { positions, userIds }) }) : await act('addEvaluatorGroup', { name, positions, userIds });
    if (r) onDone(r);
  };
  return (
    <>
      <button className="ghost back" onClick={onCancel}>‹ {backTo}</button>
      <Card className="fx-add" title={g ? `Edit ${g.name}` : 'New evaluator group'}>
        {!g && <p className="muted">A group is the people who rate together, for example Peers. After you create it, add it to a formula to make it count.</p>}
        <h4>Name</h4>
        <input className="wide" aria-label="Name of the group" maxLength={80} placeholder="e.g. Peers" value={name} onChange={(e) => setName(e.target.value)} />
        {fixed
          ? <p className="muted small">The members of a built-in group come from each person's position{db.users.some((u) => evaluatorGroups(u).includes(g.id) && u.evaluatorGroupIds) ? ', or from their account under People & sign-in' : ''}. UB's printed sheets keep their own wording.</p>
          : <>
            <h4>Everyone with these positions</h4>
            <div className="row">{PEOPLE_POSITIONS.map(([k, l]) => <label key={k} className="inline"><input type="checkbox" checked={positions.includes(k)} onChange={() => toggle(k)} /> {l}</label>)}</div>
            <p className="muted small">People added later with a ticked position join by themselves.</p>
            <h4>And these people (optional)</h4>
            <div className="row">
              <Select value="" onChange={(v) => v && setUserIds([...userIds, v])} aria-label="Add a person"><option value="">+ Add a person…</option>{people.map((u) => <option key={u.id} value={u.id}>{u.name} · {deptName(db, u.dept)}</option>)}</Select>
              {userIds.map((id) => <span key={id} className="tag">{db.users.find((u) => u.id === id)?.name}<button type="button" className="tag-x" aria-label={`Remove ${db.users.find((u) => u.id === id)?.name}`} onClick={() => setUserIds(userIds.filter((x) => x !== id))}>×</button></span>)}
            </div>
            {empty && <p className="muted small">Tick at least one position, or add a person.</p>}
            {g && <p className="muted small">Evaluations already answered stay. New members get theirs by themselves.</p>}
          </>}
        <div className="row fx-actions"><button disabled={!name.trim() || empty} onClick={save}>{g ? 'Save' : 'Create group'}</button><button className="ghost" onClick={onCancel}>Cancel</button></div>
      </Card>
    </>
  );
}
