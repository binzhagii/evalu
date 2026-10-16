import { useState } from 'react';
import { useApp } from '../lib/store';
import {
  GROUPS, TARGET_TYPES, STAGES, STAGE_LABEL, taskStatus, userById, uid, generateTasks, runThresholdCheck,
  sendReminders, sectionStats, targetsOf, targetType, evaluatorGroup, instrumentFor, deptName, periodById,
} from '../lib/logic';
import { Card, StatusBadge, RuleNote, PeriodPicker, Select, Badge, pct } from '../ui';

/* ---------------- Evaluation periods + release ---------------- */
export function Periods() {
  const { db, update, reset } = useApp();
  const [name, setName] = useState('');
  const [deadline, setDeadline] = useState('');
  const [msg, setMsg] = useState('');
  const add = () => {
    if (!name || !deadline) return setMsg('Enter a period name and deadline.');
    update((d) => { d.periods.push({ id: uid('p'), name, deadline, status: 'open', releaseStage: 'hr', thresholdChecked: false }); });
    setName(''); setDeadline(''); setMsg('Period created. Go to Assignments to generate tasks.');
  };
  const patch = (id, f) => update((d) => f(periodById(d, id)));
  return (
    <>
      <RuleNote />
      {msg && <div className="note">{msg}</div>}
      <Card title="Evaluation periods">
        <table>
          <thead><tr><th>Period</th><th>Deadline</th><th>Status</th><th>Release</th><th>Actions</th></tr></thead>
          <tbody>
            {db.periods.map((p, i) => {
              const nextStage = STAGES[STAGES.indexOf(p.releaseStage) + 1];
              const stageLabel = { dir: 'Release to Directors/VPs', faculty: 'Release to faculty' };
              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td><input type="date" value={p.deadline} onChange={(e) => patch(p.id, (x) => (x.deadline = e.target.value))} /></td>
                  <td><Badge kind={p.status === 'open' ? 'pending' : 'completed'}>{p.status}</Badge></td>
                  <td>{STAGE_LABEL[p.releaseStage]}</td>
                  <td className="row">
                    {p.status === 'open' && <button onClick={() => { update((d) => { const n = runThresholdCheck(d, p.id); periodById(d, p.id).status = 'closed'; }); setMsg(`${p.name} closed. 50% threshold check run; faculty were notified for invalidated sections.`); }}>Close &amp; check 50% rule</button>}
                    {p.status === 'open' && <button className="ghost" onClick={() => { update((d) => { runThresholdCheck(d, p.id); periodById(d, p.id).thresholdChecked = false; }); setMsg('Threshold check run (period stays open).'); }}>Check now</button>}
                    {p.status === 'closed' && <button className="ghost" onClick={() => patch(p.id, (x) => (x.status = 'open'))}>Reopen</button>}
                    {nextStage && (p.status === 'closed'
                      ? <button onClick={() => patch(p.id, (x) => (x.releaseStage = nextStage))}>{stageLabel[nextStage]}</button>
                      : <span className="muted" title="Close the period first">release after closing</span>)}
                    {i >= 0 && p.releaseStage !== 'hr' && <button className="ghost" onClick={() => patch(p.id, (x) => (x.releaseStage = STAGES[STAGES.indexOf(x.releaseStage) - 1]))}>Withdraw one step</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted">Release order is enforced: HR Specialist → Directors/VPs → individual faculty. Until released, results are hidden from later groups.</p>
      </Card>
      <Card title="New evaluation period">
        <div className="row">
          <input placeholder="Period name" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          <button onClick={add}>Create</button>
        </div>
      </Card>
      <Card title="Demo data"><button className="ghost" onClick={() => { if (confirm('Reset all data to the simulated starting dataset?')) reset(); }}>Reset simulated data</button></Card>
    </>
  );
}

/* ---------------- Assignments / workflow ---------------- */
export function Assignments() {
  const { db, update } = useApp();
  const [pid, setPid] = useState(db.periods[db.periods.length - 1].id);
  const [msg, setMsg] = useState('');
  const [add, setAdd] = useState({ evaluatorId: '', targetId: '', group: '' });
  const tasks = db.tasks.filter((t) => t.periodId === pid);
  const evaluators = db.users.filter((u) => evaluatorGroup(u));
  const summary = {};
  tasks.forEach((t) => { const k = t.group; summary[k] ||= { pending: 0, completed: 0, overdue: 0 }; summary[k][taskStatus(db, t)]++; });

  const addOne = () => {
    const ev = userById(db, add.evaluatorId), tg = userById(db, add.targetId);
    if (!ev || !tg) return setMsg('Choose an evaluator and a person to evaluate.');
    const group = evaluatorGroup(ev);
    const tt = targetType(db, tg);
    if (!(group in (db.rules[tt] || {}))) return setMsg(`${GROUPS[group]} is not an evaluator group for ${TARGET_TYPES[tt]}.`);
    if (!instrumentFor(db, tt, group)) return setMsg('No form exists for this pairing. Create it under Forms first.');
    if (tasks.some((t) => t.evaluatorId === ev.id && t.targetId === tg.id && t.group === group && !t.sectionId)) return setMsg('That assignment already exists.');
    update((d) => d.tasks.push({ id: uid('t'), periodId: pid, evaluatorId: ev.id, targetId: tg.id, group, sectionId: null, draft: null, response: null }));
    setMsg('Assignment added.');
  };

  return (
    <>
      <Card title="Evaluation workflow" actions={<PeriodPicker periods={db.periods} value={pid} onChange={setPid} />}>
        {msg && <div className="note">{msg}</div>}
        <div className="row">
          <button onClick={() => { update((d) => { generateTasks(d, pid); }); setMsg('Tasks generated from role, position and department rules.'); }}>Generate tasks for period</button>
          <button className="ghost" onClick={() => { update((d) => { sendReminders(d, pid); }); setMsg('Reminders sent to evaluators with pending or overdue tasks.'); }}>Send reminders</button>
        </div>
        <table>
          <thead><tr><th>Evaluator group</th><th>Pending</th><th>Completed</th><th>Overdue</th></tr></thead>
          <tbody>{Object.entries(summary).map(([g, s]) => <tr key={g}><td>{GROUPS[g]}</td><td>{s.pending}</td><td>{s.completed}</td><td>{s.overdue}</td></tr>)}</tbody>
        </table>
      </Card>
      <Card title="Add an evaluator assignment">
        <div className="row">
          <Select value={add.evaluatorId} onChange={(v) => setAdd({ ...add, evaluatorId: v })}><option value="">Evaluator…</option>{evaluators.filter((u) => u.role !== 'ST').map((u) => <option key={u.id} value={u.id}>{u.name} ({GROUPS[evaluatorGroup(u)]})</option>)}</Select>
          <Select value={add.targetId} onChange={(v) => setAdd({ ...add, targetId: v })}><option value="">Evaluates…</option>{targetsOf(db).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
          <button onClick={addOne}>Add</button>
        </div>
      </Card>
      <Card title="All assigned tasks">
        <table>
          <thead><tr><th>Evaluator</th><th>As</th><th>Evaluates</th><th>Class</th><th>Status</th><th /></tr></thead>
          <tbody>
            {tasks.filter((t) => t.group !== 'ST').concat(tasks.filter((t) => t.group === 'ST').slice(0, 15)).map((t) => (
              <tr key={t.id}>
                <td>{userById(db, t.evaluatorId).name}</td><td>{GROUPS[t.group]}</td><td>{userById(db, t.targetId).name}</td>
                <td>{db.sections.find((s) => s.id === t.sectionId)?.code || '—'}</td><td><StatusBadge s={taskStatus(db, t)} /></td>
                <td>{!t.response && <button className="ghost" onClick={() => update((d) => { d.tasks = d.tasks.filter((x) => x.id !== t.id); })}>Remove</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">Student tasks are summarised above; the first 15 are listed here to keep the page short.</p>
      </Card>
    </>
  );
}

/* ---------------- Dynamic forms ---------------- */
export function Forms() {
  const { db, update } = useApp();
  const [newCrit, setNewCrit] = useState('');
  const [sel, setSel] = useState(db.instruments[0]?.id);
  const [nf, setNf] = useState({ targetType: 'COLLEGE_FACULTY', group: 'ST', name: '' });
  const ins = db.instruments.find((i) => i.id === sel);
  const patchIns = (f) => update((d) => f(d.instruments.find((i) => i.id === sel)));
  const used = new Set(ins?.items.map((i) => i.criterionId));
  const groupsFor = (tt) => Object.keys(db.rules[tt] || {});

  return (
    <>
      <Card title="Criteria bank">
        <p className="muted">Criteria text below is sample content. Edit or replace it with the institution's actual criteria.</p>
        <table><tbody>
          {db.criteria.map((c) => (
            <tr key={c.id}>
              <td><input className="wide" value={c.text} onChange={(e) => update((d) => (d.criteria.find((x) => x.id === c.id).text = e.target.value))} /></td>
              <td><button className="ghost" disabled={db.instruments.some((i) => i.items.some((it) => it.criterionId === c.id))} title="Remove from forms first" onClick={() => update((d) => (d.criteria = d.criteria.filter((x) => x.id !== c.id)))}>Delete</button></td>
            </tr>
          ))}
        </tbody></table>
        <div className="row"><input className="wide" placeholder="New criterion" value={newCrit} onChange={(e) => setNewCrit(e.target.value)} />
          <button onClick={() => { if (newCrit.trim()) { update((d) => d.criteria.push({ id: uid('c'), text: newCrit.trim() })); setNewCrit(''); } }}>Add criterion</button></div>
      </Card>
      <Card title="Evaluation forms (by evaluated role and evaluator group)">
        <div className="row">
          <Select value={sel} onChange={setSel}>{db.instruments.map((i) => <option key={i.id} value={i.id}>{TARGET_TYPES[i.targetType]} ← {GROUPS[i.group]} {i.name.includes('sample') ? '' : `(${i.name})`}</option>)}</Select>
        </div>
        {ins && (
          <>
            <p className="muted">Already-submitted evaluations keep the weights they were submitted with. Changes apply to evaluations not yet submitted.</p>
            <table>
              <thead><tr><th>Criterion</th><th>Weight</th><th /></tr></thead>
              <tbody>{ins.items.map((it) => (
                <tr key={it.criterionId}>
                  <td>{db.criteria.find((c) => c.id === it.criterionId)?.text}</td>
                  <td><input type="number" min="0" step="0.5" value={it.weight} onChange={(e) => patchIns((x) => (x.items.find((y) => y.criterionId === it.criterionId).weight = Math.max(0, Number(e.target.value))))} /></td>
                  <td><button className="ghost" onClick={() => patchIns((x) => (x.items = x.items.filter((y) => y.criterionId !== it.criterionId)))}>Remove</button></td>
                </tr>
              ))}</tbody>
            </table>
            <Select value="" onChange={(v) => v && patchIns((x) => x.items.push({ criterionId: v, weight: 1 }))}>
              <option value="">Add criterion to this form…</option>
              {db.criteria.filter((c) => !used.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.text}</option>)}
            </Select>
          </>
        )}
      </Card>
      <Card title="Create a new form">
        <div className="row">
          <Select value={nf.targetType} onChange={(v) => setNf({ ...nf, targetType: v, group: groupsFor(v)[0] })}>{Object.entries(TARGET_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          <Select value={nf.group} onChange={(v) => setNf({ ...nf, group: v })}>{groupsFor(nf.targetType).map((g) => <option key={g} value={g}>{GROUPS[g]}</option>)}</Select>
          <button onClick={() => {
            if (db.instruments.some((i) => i.targetType === nf.targetType && i.group === nf.group)) return alert('A form already exists for this pairing. Edit it above.');
            const id = uid('i');
            update((d) => d.instruments.push({ id, name: 'custom', targetType: nf.targetType, group: nf.group, items: [] }));
            setSel(id);
          }}>Create empty form</button>
        </div>
      </Card>
    </>
  );
}

/* ---------------- Weights ---------------- */
export function Weights() {
  const { db, update } = useApp();
  return (
    <Card title="Evaluator-group weights (%)">
      <p className="muted">College faculty weights (Students 40, Dean 40, Program Chair 20) come from the manuscript. The manuscript does not give weights for Basic Ed teachers or Deans, so they are blank: HR must enter them before a final score is computed.</p>
      {Object.entries(db.rules).map(([tt, rule]) => {
        const total = Object.values(rule).reduce((a, w) => a + (Number(w) || 0), 0);
        return (
          <div key={tt}>
            <h4>{TARGET_TYPES[tt]} {total !== 100 && <Badge kind="overdue">total {total}% (should be 100%)</Badge>}</h4>
            <div className="row">
              {Object.keys(rule).map((g) => (
                <label key={g} className="inline">{GROUPS[g]}{' '}
                  <input type="number" min="0" max="100" value={rule[g] ?? ''} onChange={(e) => update((d) => (d.rules[tt][g] = e.target.value === '' ? null : Number(e.target.value)))} />
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </Card>
  );
}

/* ---------------- Section monitor (dean / chair / HR) ---------------- */
export function Monitor({ deptOnly }) {
  const { db, user } = useApp();
  const open = db.periods.filter((p) => p.status === 'open');
  const secs = db.sections.filter((s) => !deptOnly || s.dept === user.dept);
  return (
    <Card title={deptOnly ? `Class evaluation progress – ${deptName(db, user.dept)}` : 'Class evaluation progress'}>
      <RuleNote />
      {open.length === 0 && <p>No evaluation period is open.</p>}
      {open.map((p) => (
        <div key={p.id}>
          <h4>{p.name}</h4>
          <table>
            <thead><tr><th>Class</th><th>Faculty</th><th>Responded</th><th>Rate</th><th>Standing</th></tr></thead>
            <tbody>{secs.map((s) => {
              const st = sectionStats(db, p.id, s.id);
              return <tr key={s.id}><td>{s.code} – {s.subject}</td><td>{userById(db, s.facultyId).name}</td><td>{st.responded} / {st.required}</td><td>{pct(st.rate)}</td>
                <td>{st.belowHalf ? <Badge kind="overdue">below 50% – would be invalidated</Badge> : <Badge kind="completed">meets 50%</Badge>}</td></tr>;
            })}</tbody>
          </table>
        </div>
      ))}
    </Card>
  );
}
