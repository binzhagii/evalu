// Parts of the "Scoring & calculation" page: every category at a glance, both levels of weights together
// (the percentage of each evaluator group, and the parts inside its tool), and adding an evaluator group in one go.
import { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import {
  TARGET_TYPES, CLASS_TYPES, activeFormula, currentPolicy, defaultFormula, deptName, formGroups, formulaSnapshot, plural, groupName, groupsOf,
  canSeeAll, computeFinal, computeTarget, howInWords, targetsOf, personIn, methodOf, targetType, toolName, toolParts, toolProblems, toolStatus,
} from '../lib/logic';
import { Card, Select, Badge, Icon, useNav, fmt } from '../ui';

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

/* ---------------- try a formula ---------------- */
const SAMPLE = { ST: 3.5, DEAN: 3.6, CHAIR: 3.4 };
/** The computation in numbers, only when it is a simple sum (percentages or the same for all); otherwise nothing. */
const plainHow = (r) => (r.final != null && r.breakdown?.some((b) => b.share && b.contribution != null) ? howInWords(r) : '');

/** "Try it": the current formula and the new one side by side, on one example and on a past period. */
export function TryIt({ db, tt, dept, draft, baseline }) {
  if (!draft.method || !draft.components.length || !draft.missing) return <div className="fx-try"><h4>Try it</h4><p className="muted">Answer 1 and 2 above, then you can try the formula here.</p></div>;
  return <TryItReady db={db} tt={tt} dept={dept} draft={draft} baseline={baseline} />;
}
function TryItReady({ db, tt, dept, draft, baseline }) {
  const groups = [...new Set([...baseline.components, ...draft.components].map((c) => c.group))];
  const [scores, setScores] = useState(() => Object.fromEntries(groups.map((g) => [g, SAMPLE[g] ?? 3.5])));
  const sc = Object.fromEntries(groups.map((g) => [g, scores[g] === '' || scores[g] == null ? null : Number(scores[g])]));
  const now = computeFinal(baseline, sc), next = computeFinal(draft, sc);
  const { user } = useApp();
  const closed = db.periods.filter((p) => p.status === 'closed' && canSeeAll(user, p)); // a VP sees only the periods sent to them
  const [pid, setPid] = useState(closed.at(-1)?.id || '');
  const [showList, setShowList] = useState(false);
  const people = targetsOf(db, pid).filter((u) => { const who = personIn(db, pid, u); return who.type === tt && (!dept || who.dept === dept); });
  const real = useMemo(() => (pid ? people.map((u) => ({ u, now: computeTarget(db, pid, u.id).final, next: computeTarget(db, pid, u.id, { formula: draft }).final }))
    .filter((r) => r.now != null || r.next != null) : []), [db, pid, draft]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = real.filter((r) => r.now !== r.next);
  const tag = (r) => (r.final == null ? <Badge kind="overdue">no rating</Badge> : null);
  return (
    <div className="fx-try">
      <h4>Try it</h4>
      <p className="muted small">Type example ratings. Leave a box empty to see what happens when a group has no rating.</p>
      <div className="row">{groups.map((g) => (
        <label key={g} className="inline">{groupName(db, g)} <input type="number" step="0.01" min="1" max="4" className="tiny" value={scores[g] ?? ''} placeholder="none" onChange={(e) => setScores({ ...scores, [g]: e.target.value })} /></label>
      ))}</div>
      <div className="fx-compare">
        <div><span className="muted">Now</span><b>{fmt(now.final)}</b>{tag(now)}<span className="muted small">{plainHow(now)}</span></div>
        <div className="fx-arrow">→</div>
        <div><span className="muted">With this formula</span><b>{fmt(next.final)}</b>{tag(next)}<span className="muted small">{plainHow(next)}</span></div>
      </div>
      {closed.length > 0 && (
        <p>
          On <Select value={pid} onChange={setPid}>{closed.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>:{' '}
          <b>{changed.length} of {real.length}</b> {TARGET_TYPES[tt].toLowerCase()} would get a different rating.{' '}
          {changed.length > 0 && <button className="link" onClick={() => setShowList(!showList)}>{showList ? 'Hide' : 'See who'}</button>}
          <span className="muted small"> (Nothing is changed: this is only a test.)</span>
        </p>
      )}
      {showList && changed.length > 0 && (
        <table>
          <thead><tr><th>Name</th><th>Now</th><th>With this formula</th></tr></thead>
          <tbody>{changed.map((r) => <tr key={r.u.id}><td>{r.u.name}</td><td>{fmt(r.now)}</td><td><b>{fmt(r.next)}</b></td></tr>)}</tbody>
        </table>
      )}
    </div>
  );
}

/* ---------------- every category at a glance ---------------- */
function StatusNow({ t, d = '' }) {
  const { db } = useApp();
  const f = formulaNow(db, t, d || null);
  const unset = methodOf(f.method, f.methodVersion ?? 1)?.usesWeights && f.components.some((c) => c.weight == null || c.weight === '');
  const own = (db.formulas || []).some((x) => x.status === 'active' && x.targetType === t && (x.dept || '') === d);
  const working = (db.formulas || []).find((x) => x.targetType === t && (x.dept || '') === d && WORKING[x.status]);
  return <>{unset ? <Badge kind="overdue">Percentages not set</Badge> : own ? <Badge kind="completed">In use</Badge> : !d && <Badge kind="muted">Starting formula</Badge>}{working && <> <Badge kind={WORKING[working.status][0]}>{WORKING[working.status][1]}</Badge></>}</>;
}
/** The departments with a formula of their own (in use or being prepared) for a category. */
const ownDepts = (db, t) => [...new Set((db.formulas || []).filter((f) => f.targetType === t && f.dept && f.status !== 'archived').map((f) => f.dept))];
export function Overview({ onOpen }) {
  const { db } = useApp();
  return (
    <Card title="Who is rated, and how">
      <p className="muted">Each category has its own formula. Open one to see it or change it.</p>
      <table className="fx-overview">
        <thead><tr><th>Who is rated</th><th>Who rates them now</th><th>Status</th><th /></tr></thead>
        <tbody>{Object.keys(TARGET_TYPES).flatMap((t) => [[t, ''], ...ownDepts(db, t).map((d) => [t, d])]).map(([t, d]) => (
          <tr key={t + d}>
            <td className={d ? 'fx-dept' : undefined}><button className="link tool-open" onClick={() => onOpen(t, d)}>{d ? `only ${deptName(db, d)}` : TARGET_TYPES[t]}</button></td>
            <td>{groupsText(db, formulaNow(db, t, d || null))}</td>
            <td><StatusNow t={t} d={d} /></td>
            <td><button className="ghost" aria-label={`Open ${TARGET_TYPES[t]}${d ? ` (only ${deptName(db, d)})` : ''}`} onClick={() => onOpen(t, d)}>Open</button></td>
          </tr>
        ))}</tbody>
      </table>
    </Card>
  );
}
/** The percentages of a formula, as a list. */
export function Shares({ f, tt }) {
  const { db } = useApp();
  const m = methodOf(f.method, f.methodVersion ?? 1);
  return (
    <>
      <table className="fx-comps"><tbody>{f.components.map((c) => <tr key={c.group}><td><b>{groupName(db, c.group)}</b></td><td>{m?.usesWeights ? (c.weight == null || c.weight === '' ? <Badge kind="overdue">not set</Badge> : <b>{c.weight}%</b>) : ''}</td></tr>)}</tbody></table>
      {!f.components.length && <p className="muted">No evaluator group yet, so {TARGET_TYPES[tt]} get no rating.</p>}
    </>
  );
}
/** The departments with their own formula, and giving one to another department. */
export function OwnFormulas({ tt, onOpen }) {
  const { db } = useApp();
  const [d, setD] = useState('');
  const own = ownDepts(db, tt);
  const has = new Set(db.users.filter((u) => u.active !== false && targetType(db, u) === tt).map((u) => u.dept));
  const others = db.departments.filter((x) => x.active !== false && has.has(x.id) && !own.includes(x.id));
  return (
    <Card title="Departments with their own formula">
      <p className="muted">Every department uses the formula above. Give a department its own only when its percentages are different; from then on it does not follow the others.</p>
      {own.length === 0 ? <p>No department has its own formula for {TARGET_TYPES[tt]}.</p> : (
        <table>
          <thead><tr><th>Department</th><th>Who rates them now</th><th>Status</th><th /></tr></thead>
          <tbody>{own.map((x) => <tr key={x}><td><b>{deptName(db, x)}</b></td><td>{groupsText(db, formulaNow(db, tt, x))}</td><td><StatusNow t={tt} d={x} /></td><td><button className="ghost" aria-label={`Open ${deptName(db, x)}`} onClick={() => onOpen(x)}>Open</button></td></tr>)}</tbody>
        </table>
      )}
      <div className="row">
        <label className="inline">Give a department its own formula <Select value={d} onChange={setD} aria-label="Department that gets its own formula"><option value="">Choose the department…</option>{others.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></label>
        <button disabled={!d} onClick={() => onOpen(d)}>Continue</button>
      </div>
      <p className="muted small">Only departments with people rated as {TARGET_TYPES[tt]} are listed.</p>
    </Card>
  );
}

/* ---------------- both levels of weights ---------------- */
export function BothLevels({ formula, tt, dept }) {
  const { db, user } = useApp();
  const go = useNav();
  const m = methodOf(formula.method, formula.methodVersion ?? 1);
  const open = (id) => go('forms', { toolId: id });
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

/* ---------------- add a group to a formula: one question at a time ---------------- */
const ADD_STEPS = ['Who will rate?', 'Which tool will they answer?', 'How much does each group count?'];
export function AddGroup({ who, tt, dept, base, first, onDone, onCancel, onNewGroup }) {
  const { db, act } = useApp();
  const used = new Set(base.components.map((c) => c.group));
  const choices = (db.evaluatorGroups || []).filter((g) => g.active !== false && !used.has(g.id) && (g.id !== 'ST' || ['COLLEGE_FACULTY', 'BASICED_TEACHER', 'CI'].includes(tt)));
  const [step, setStep] = useState(1);
  const [group, setGroup] = useState(first || '');
  const [copyFrom, setCopyFrom] = useState('');
  const [weights, setWeights] = useState(() => Object.fromEntries(base.components.map((c) => [c.group, c.weight ?? ''])));
  const [mine, setMine] = useState('');
  const [busy, setBusy] = useState(false);
  const label = group ? groupName(db, group) : '';

  // every target is rated by the members in the same department, except themselves
  const targets = db.users.filter((u) => u.active !== false && targetType(db, u) === tt && (!dept || u.dept === dept));
  const raters = new Map();
  for (const u of db.users) if (['TP', 'NTP'].includes(u.role) && u.active !== false && group && groupsOf(db, u).includes(group)) raters.set(u.dept, [...(raters.get(u.dept) || []), u.id]);
  const per = targets.map((t) => (raters.get(t.dept) || []).filter((id) => id !== t.id).length);
  const count = per.reduce((a, n) => a + n, 0), most = Math.max(0, ...per);

  const hasTool = !!group && formGroups(db, tt, { drafts: true }).includes(group);
  const copies = db.instruments.filter((i) => toolStatus(i) === 'in-use' && i.items.length);
  const total = base.components.reduce((a, c) => a + (Number(weights[c.group]) || 0), 0) + (Number(mine) || 0);
  const totalOk = Math.abs(total - 100) < 1e-9;
  const ok = [!!group, true, totalOk && Number(mine) > 0 && base.components.every((c) => Number(weights[c.group]) > 0)][step - 1];
  const next = (n) => { setStep(n); window.scrollTo(0, 0); };
  const save = async () => {
    setBusy(true);
    const r = await act('addGroupWithFormula', { targetType: tt, dept: dept || null, group, tool: hasTool ? {} : { copyFrom: copyFrom || undefined }, weights: { ...weights, [group]: mine } });
    setBusy(false);
    if (r) onDone(r);
  };
  return (
    <>
      <button className="ghost back" onClick={onCancel}>‹ Back to {who}</button>
      <Card className="fx-add" title={`Add a group to the formula of ${who}`} actions={<span className="muted">Step {step} of 3</span>}>
        <h4>{ADD_STEPS[step - 1]}</h4>
        {step === 1 && <>
          <div className="row">
            <Select value={group} onChange={setGroup} aria-label="Group"><option value="">Choose a group…</option>{choices.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>
            <span className="muted">Not in the list? <button className="link" onClick={onNewGroup}>Create a new group</button></span>
          </div>
          {group && group !== 'ST' && (count ? <p>Each person in <b>{label}</b> rates the {TARGET_TYPES[tt].toLowerCase()} of their own department, except themselves: <b>{plural(count, 'evaluation')}</b> in all, up to {plural(most, 'rater')} for each person.{count > 500 && ' That is a lot: each rater answers one form per person.'}</p>
            : <div className="note warn">Nobody in {label} shares a department with the people rated, so no evaluation would be created yet.</div>)}
          {group === 'ST' && <p>The students of each class rate their teacher.</p>}
        </>}
        {step === 2 && (hasTool ? <p><b>{label}</b> already has a tool for {TARGET_TYPES[tt]}, so there is nothing to do here.</p> : <>
          <p><b>{label}</b> has no tool for {TARGET_TYPES[tt]} yet. It starts as a draft, and you finish it under Evaluation tools.</p>
          <label>Start from<br /><Select value={copyFrom} onChange={setCopyFrom} aria-label="Tool"><option value="">An empty tool</option>{copies.map((i) => <option key={i.id} value={i.id}>A copy of: {toolName(db, i)}{i.variant ? ` (${CLASS_TYPES[i.variant]})` : ''}</option>)}</Select></label>
        </>)}
        {step === 3 && <>
          <p className="muted">Lower the others to make room for {label}. All of them must total 100%.</p>
          <table className="fx-comps">
            <tbody>
              {base.components.map((c) => (
                <tr key={c.group}><td><b>{groupName(db, c.group)}</b></td><td><input type="number" min="0" max="100" step="5" className="tiny" aria-label={`${groupName(db, c.group)} percentage`} value={weights[c.group]} onChange={(e) => setWeights({ ...weights, [c.group]: e.target.value })} /> %</td><td className="muted small">now {c.weight ?? 'not set'}{c.weight != null && '%'}</td></tr>
              ))}
              <tr><td><b>{label}</b> <Badge kind="info">new</Badge></td><td><input type="number" min="0" max="100" step="5" className="tiny" aria-label={`${label} percentage`} value={mine} onChange={(e) => setMine(e.target.value)} /> %</td><td /></tr>
              <tr className="cat-total"><td>Total</td><td><b>{short(total)}%</b></td><td>{!totalOk && <Badge kind="overdue">must be 100%</Badge>}</td></tr>
            </tbody>
          </table>
          <p className="muted small">It is saved as a draft. Ratings change only after a VP approves the formula and you start using it.</p>
        </>}
        <div className="row fx-actions">
          {step < 3 ? <button disabled={!ok} onClick={() => next(step + 1)}>Next</button> : <button disabled={busy || !ok} onClick={save}><Icon name="check" size={16} /> Add to the formula</button>}
          {step > 1 && <button className="ghost" onClick={() => next(step - 1)}>Back</button>}
          <button className="ghost" onClick={onCancel}>Cancel</button>
        </div>
      </Card>
    </>
  );
}
