// Parts of the "Scoring & calculation" page: every category at a glance, both levels of weights together
// (the percentage of each evaluator group, and the parts inside its tool), and adding an evaluator group in one go.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import {
  TARGET_TYPES, CLASS_TYPES, POSITIONS, activeFormula, currentPolicy, defaultFormula, deptName, formGroups, formulaSnapshot, groupName, groupsOf,
  methodOf, targetType, toolName, toolParts, toolProblems, toolStatus,
} from '../lib/logic';
import { Card, Select, Badge, Icon, useNav } from '../ui';
import { openToolNext } from './Tools';

const short = (n) => +Number(n).toFixed(2);
/** The formula of a category (or of one department) that counts now. */
export const formulaNow = (db, tt, dept = null) => {
  const own = dept ? (db.formulas || []).find((f) => f.status === 'active' && f.targetType === tt && f.dept === dept) : null;
  const f = own || activeFormula(db, tt);
  return f ? formulaSnapshot(f) : defaultFormula(db.rules[tt] || {}, currentPolicy(db));
};
/** "Students 40% · Dean 40% · Program Chair 20%", or "Students, Dean (equal)". */
function groupsText(db, f) {
  const m = methodOf(f.method, f.methodVersion ?? 1);
  if (!f.components.length) return 'No evaluator group yet';
  return m?.usesWeights ? f.components.map((c) => `${groupName(db, c.group)} ${c.weight == null || c.weight === '' ? '(not set)' : `${c.weight}%`}`).join(' · ') : `${f.components.map((c) => groupName(db, c.group)).join(', ')} (${m?.label?.toLowerCase() || 'no method'})`;
}
const WORKING = { draft: ['pending', 'Draft not sent'], rejected: ['overdue', 'Returned by VP'], pending: ['info', 'Waiting for VP'], approved: ['completed', 'Approved, not used yet'], scheduled: ['info', 'Starts next period'] };

/* ---------------- every category at a glance ---------------- */
export function Overview({ tt, dept, onPick, onChange }) {
  const { db } = useApp();
  const rows = Object.keys(TARGET_TYPES).flatMap((t) => [
    [t, ''],
    ...[...new Set((db.formulas || []).filter((f) => f.targetType === t && f.dept && f.status !== 'archived').map((f) => f.dept))].map((d) => [t, d]),
  ]);
  return (
    <Card title="Who is rated, and how">
      <p className="muted">{onChange ? 'Each category has its own formula. Click a name to see where its rating comes from, or Change to set its groups and percentages.' : 'Click a name to see where its rating comes from.'}</p>
      <table className="fx-overview">
        <thead><tr><th>Who is rated</th><th>Evaluator groups now</th><th>Status</th><th /></tr></thead>
        <tbody>{rows.map(([t, d]) => {
          const f = formulaNow(db, t, d || null);
          const unset = methodOf(f.method, f.methodVersion ?? 1)?.usesWeights && f.components.some((c) => c.weight == null || c.weight === '');
          const own = (db.formulas || []).some((x) => x.status === 'active' && x.targetType === t && (x.dept || '') === d);
          const working = (db.formulas || []).find((x) => x.targetType === t && (x.dept || '') === d && WORKING[x.status]);
          const on = t === tt && d === dept;
          return (
            <tr key={t + d} className={on ? 'on' : ''}>
              <td className={d ? 'fx-dept' : undefined}><button className="link tool-open" aria-current={on ? 'true' : undefined} onClick={() => onPick(t, d)}>{d ? `only ${deptName(db, d)}` : TARGET_TYPES[t]}</button></td>
              <td>{groupsText(db, f)}{d && !own && <span className="muted small"> (same as all departments)</span>}</td>
              <td>{unset ? <Badge kind="overdue">Percentages not set</Badge> : own ? <Badge kind="completed">In use</Badge> : <Badge kind="muted">Starting formula</Badge>}{working && <> <Badge kind={WORKING[working.status][0]}>{WORKING[working.status][1]}</Badge></>}</td>
              <td>{onChange
                ? <button className="ghost" aria-label={`${working ? 'Open the new formula of' : 'Change'} ${TARGET_TYPES[t]}${d ? ` (${deptName(db, d)})` : ''}`} onClick={() => onChange(t, d)}>{!working ? 'Change' : ['draft', 'rejected'].includes(working.status) ? 'Continue' : 'View'}</button>
                : <button className="ghost" disabled={on} onClick={() => onPick(t, d)}>{on ? 'Shown below' : 'Open'}</button>}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </Card>
  );
}

/* ---------------- both levels of weights ---------------- */
export function BothLevels({ formula, tt, dept }) {
  const { db, user } = useApp();
  const go = useNav();
  const m = methodOf(formula.method, formula.methodVersion ?? 1);
  const open = (id) => { openToolNext(id); go('forms'); };
  return (
    <Card title="Where the rating comes from">
      <p className="muted">Each evaluator group counts for a percentage of the final rating. Inside its tool, each part counts for a percentage of that group's score.</p>
      {formula.components.map((c) => {
        const tools = db.instruments.filter((i) => i.targetType === tt && i.group === c.group && toolStatus(i) === 'in-use' && i.items.length && (!dept || !i.dept || i.dept === dept));
        // the everyday tool first; tools for one department or one type of class are folded away
        const main = tools.filter((i) => !i.dept && !i.variant), special = tools.filter((i) => i.dept || i.variant);
        const coming = db.instruments.filter((i) => i.targetType === tt && i.group === c.group && i.status);
        return (
          <div key={c.group} className="fx-level">
            <div className="fx-level-head"><b>{groupName(db, c.group)}</b>{m?.usesWeights && <b>{c.weight ?? '?'}%</b>}</div>
            {main.map((i) => <ToolWeights key={i.id} i={i} weight={m?.usesWeights ? c.weight : null} onOpen={user.role === 'HR' ? () => open(i.id) : null} />)}
            {special.length > 0 && (
              <details className="source">
                <summary>{special.length} more tool{special.length === 1 ? '' : 's'} for a type of class or a department</summary>
                {special.map((i) => <ToolWeights key={i.id} i={i} weight={m?.usesWeights ? c.weight : null} onOpen={user.role === 'HR' ? () => open(i.id) : null} />)}
              </details>
            )}
            {coming.map((i) => <div key={i.id} className="fx-tool"><span className="muted">{toolName(db, i)} v{i.version}</span> <Badge kind={i.status === 'draft' ? 'pending' : 'info'}>{i.status === 'draft' ? 'Draft' : 'Starts next period'}</Badge>{user.role === 'HR' && <button className="link" onClick={() => open(i.id)}>Open tool</button>}</div>)}
            {!tools.length && !coming.length && <div className="note warn small">No evaluation tool yet, so nobody can be asked to evaluate.</div>}
          </div>
        );
      })}
    </Card>
  );
}
function ToolWeights({ i, weight, onOpen }) {
  const { db } = useApp();
  const parts = toolParts(i);
  const weighted = parts.some((p) => Number(p.weight) > 0);
  const kind = [i.variant && CLASS_TYPES[i.variant], i.dept && `only ${deptName(db, i.dept)}`].filter(Boolean).join(', ');
  return (
    <div className="fx-tool">
      <div className="row between"><span>{toolName(db, i)}{kind && <span className="muted"> · {kind}</span>}{toolProblems(i).length > 0 && <> <Badge kind="overdue">Needs fixing</Badge></>}</span>{onOpen && <button className="link" onClick={onOpen}>Open tool</button>}</div>
      {weighted ? (
        <ul>{parts.map((p) => <li key={p.name}>{p.name}: <b>{p.weight ?? '?'}%</b> <span className="muted">· {p.items.length} indicator{p.items.length === 1 ? '' : 's'}{weight != null && p.weight != null && ` · ${short((Number(weight) * Number(p.weight)) / 100)}% of the final rating`}</span></li>)}</ul>
      ) : <p className="muted small">{i.items.length} indicators, all counting the same.</p>}
    </div>
  );
}

/* ---------------- add an evaluator group (one screen) ---------------- */
const PEOPLE_POSITIONS = [...Object.entries(POSITIONS.TP), ...Object.entries(POSITIONS.NTP)];

export function AddGroup({ tt, dept, base, onDone, onCancel }) {
  const { db, act } = useApp();
  const used = new Set(base.components.map((c) => c.group));
  const choices = (db.evaluatorGroups || []).filter((g) => g.active !== false && !used.has(g.id) && (g.id !== 'ST' || ['COLLEGE_FACULTY', 'BASICED_TEACHER', 'CI'].includes(tt)));
  const [who, setWho] = useState('__new'); // an existing group, or a new one
  const [name, setName] = useState('');
  const [members, setMembers] = useState('position');
  const [position, setPosition] = useState(tt.startsWith('NTP') ? 'staff' : 'faculty');
  const [userIds, setUserIds] = useState([]);
  const [copyFrom, setCopyFrom] = useState('');
  const [weights, setWeights] = useState(() => Object.fromEntries(base.components.map((c) => [c.group, c.weight ?? ''])));
  const [mine, setMine] = useState('');
  const [busy, setBusy] = useState(false);
  const top = useRef(null);
  useEffect(() => { top.current?.scrollIntoView({ block: 'start' }); }, []); // it opens below the card with the button
  const isNew = who === '__new';
  const label = isNew ? name.trim() || 'the new group' : groupName(db, who);

  const people = db.users.filter((u) => ['TP', 'NTP'].includes(u.role) && u.active !== false);
  const isMember = (u) => (isNew ? (members === 'position' ? u.position === position : userIds.includes(u.id)) : u.role !== 'ST' && groupsOf(db, u).includes(who));
  // every target is rated by the members in the same department, except themselves
  const targets = db.users.filter((u) => u.active !== false && targetType(db, u) === tt && (!dept || u.dept === dept));
  const raters = new Map();
  for (const u of people.filter(isMember)) raters.set(u.dept, [...(raters.get(u.dept) || []), u.id]);
  const count = targets.reduce((a, t) => a + (raters.get(t.dept) || []).filter((id) => id !== t.id).length, 0);
  const most = targets.reduce((a, t) => Math.max(a, (raters.get(t.dept) || []).filter((id) => id !== t.id).length), 0);

  const hasTool = !isNew && formGroups(db, tt, { drafts: true }).includes(who);
  const copies = db.instruments.filter((i) => toolStatus(i) === 'in-use' && i.items.length);
  const total = base.components.reduce((a, c) => a + (Number(weights[c.group]) || 0), 0) + (Number(mine) || 0);
  const totalOk = Math.abs(total - 100) < 1e-9;
  const problems = [
    isNew && !name.trim() && 'Give the group a name.',
    isNew && members === 'people' && !userIds.length && 'Choose at least one person.',
    base.components.some((c) => !(Number(weights[c.group]) > 0)) && 'Every group needs a percentage above 0.',
    !(Number(mine) > 0) && `Give ${label} a percentage.`,
    !totalOk && `The percentages add up to ${short(total)}%; they must add up to 100%.`,
  ].filter(Boolean);

  const save = async () => {
    setBusy(true);
    const r = await act('addGroupWithFormula', {
      targetType: tt, dept: dept || null,
      ...(isNew ? { newGroup: { name, positions: members === 'position' ? [position] : [], userIds: members === 'people' ? userIds : [] } } : { group: who }),
      tool: hasTool ? {} : { copyFrom: copyFrom || undefined },
      // a new group's ID is made on the server, so its percentage is sent under the ID it will get
      weights: { ...weights, [isNew ? newId(name) : who]: mine },
    });
    setBusy(false);
    if (r) onDone(r);
  };
  const target = `${TARGET_TYPES[tt]}${dept ? ` (only ${deptName(db, dept)})` : ''}`;
  return (
    <Card title={`Add an evaluator group for ${target}`} className="fx-add">
      <span ref={top} />
      <p className="muted">Answer from top to bottom. Nothing is saved until the last step, and ratings do not change until the new formula is approved and in use.</p>

      <h4>1. Who will rate?</h4>
      <div className="row">
        <Select value={who} onChange={setWho} aria-label="Who will rate"><option value="__new">A new group…</option>{choices.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>
        {isNew && <input className="wide" maxLength={80} placeholder="Name of the group, e.g. Peers" value={name} onChange={(e) => setName(e.target.value)} />}
      </div>
      {isNew && (
        <>
          <div className="fx-choices">
            <label className="inline fx-choice"><input type="radio" name="members" checked={members === 'position'} onChange={() => setMembers('position')} /> <span>Everyone with this position: <Select value={position} onChange={(v) => { setPosition(v); setMembers('position'); }} aria-label="Position">{PEOPLE_POSITIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select><span className="muted small"> · people added later join by themselves</span></span></label>
            <label className="inline fx-choice"><input type="radio" name="members" checked={members === 'people'} onChange={() => setMembers('people')} /> <span>Only people I choose</span></label>
          </div>
          {members === 'people' && (
            <div className="row">
              <Select value="" onChange={(v) => v && setUserIds([...userIds, v])} aria-label="Add a person"><option value="">+ Add a person…</option>{people.filter((u) => !userIds.includes(u.id)).map((u) => <option key={u.id} value={u.id}>{u.name} · {deptName(db, u.dept)}</option>)}</Select>
              {userIds.map((id) => <span key={id} className="tag">{db.users.find((u) => u.id === id)?.name}<button type="button" className="tag-x" aria-label="Remove" onClick={() => setUserIds(userIds.filter((x) => x !== id))}>×</button></span>)}
            </div>
          )}
        </>
      )}

      <h4>2. Whom do they rate?</h4>
      <p>{target}: everyone in their own department, except themselves.</p>

      <h4>3. Which tool will they answer?</h4>
      {hasTool ? <p>The tool they already have for {TARGET_TYPES[tt]}.</p> : (
        <div className="row">
          <Select value={copyFrom} onChange={setCopyFrom} aria-label="Tool"><option value="">A new, empty tool</option>{copies.map((i) => <option key={i.id} value={i.id}>Copy of: {toolName(db, i)}{i.variant ? ` (${CLASS_TYPES[i.variant]})` : ''}</option>)}</Select>
          <span className="muted small">It starts as a draft. You finish it next, under Evaluation tools.</span>
        </div>
      )}

          <h4>4. New percentages</h4>
          <table className="fx-comps">
            <tbody>
              {base.components.map((c) => (
                <tr key={c.group}><td><b>{groupName(db, c.group)}</b></td><td><input type="number" min="0" max="100" step="5" className="tiny" aria-label={`${groupName(db, c.group)} percentage`} value={weights[c.group]} onChange={(e) => setWeights({ ...weights, [c.group]: e.target.value })} /> %</td><td className="muted small">now {c.weight ?? 'not set'}{c.weight != null && '%'}</td></tr>
              ))}
              <tr><td><b>{label}</b> <Badge kind="info">new</Badge></td><td><input type="number" min="0" max="100" step="5" className="tiny" aria-label="New group percentage" value={mine} onChange={(e) => setMine(e.target.value)} /> %</td><td /></tr>
              <tr className="cat-total"><td>Total</td><td><b>{short(total)}%</b></td><td>{!totalOk && <Badge kind="overdue">must be 100%</Badge>}</td></tr>
            </tbody>
          </table>

      <h4>5. Review</h4>
      <div className={`note ${count ? '' : 'warn'}`}>
        {count ? <><b>{count} evaluation{count === 1 ? '' : 's'}</b> by {label}: {targets.length} people rated, up to {most} rater{most === 1 ? '' : 's'} each.{count > 500 && ' That is a lot: each rater answers one form per person.'}</> : `Nobody in ${label} shares a department with the people rated, so no evaluation would be created yet.`}
      </div>
      {problems.length > 0 && <ul className="muted">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      <div className="row">
        <button disabled={busy || problems.length > 0} onClick={save}><Icon name="check" size={16} /> Save as a draft formula</button>
        <button className="ghost" onClick={onCancel}>Cancel</button>
      </div>
    </Card>
  );
}
/** Same rule as the server (addGroupWithFormula): the ID of a new group from its name. */
const newId = (label) => label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30).replace(/_+$/g, '');
