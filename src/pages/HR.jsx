import { useState } from 'react';
import { useApp } from '../lib/store';
import {
  GROUPS, TARGET_TYPES, STAGES, STAGE_LABEL, taskStatus, userById, sectionStats, targetsOf, evaluatorGroup, deptName,
} from '../lib/logic';
import { Card, StatusBadge, RuleNote, PeriodPicker, Select, Badge, SaveInput, Meter, Empty, pct } from '../ui';

/* ---------------- Evaluation periods + release ---------------- */
export function Periods() {
  const { db, act } = useApp();
  const [name, setName] = useState('');
  const [deadline, setDeadline] = useState('');
  const [msg, setMsg] = useState('');
  const add = async () => {
    if (!name || !deadline) return setMsg('Enter a period name and deadline.');
    if (await act('createPeriod', { name, deadline })) { setName(''); setDeadline(''); setMsg('Period created. Go to Assignments to generate tasks.'); }
  };
  const run = async (action, periodId, done) => { setMsg(''); if (await act(action, { periodId })) setMsg(done || ''); };
  return (
    <>
      <RuleNote />
      {msg && <div className="note">{msg}</div>}
      <Card title="Evaluation periods">
        <table>
          <thead><tr><th>Period</th><th>Deadline</th><th>Status</th><th>Release</th><th>Actions</th></tr></thead>
          <tbody>
            {db.periods.map((p) => {
              const nextStage = STAGES[STAGES.indexOf(p.releaseStage) + 1];
              const stageLabel = { dir: 'Release to Directors/VPs', faculty: 'Release to faculty' };
              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td><input type="date" value={p.deadline} onChange={(e) => e.target.value && act('setPeriodDeadline', { periodId: p.id, deadline: e.target.value })} /></td>
                  <td><Badge kind={p.status === 'open' ? 'pending' : 'completed'}>{p.status}</Badge></td>
                  <td>{STAGE_LABEL[p.releaseStage]}</td>
                  <td className="row">
                    {p.status === 'open' && <button onClick={() => run('closePeriod', p.id, `${p.name} closed. 50% threshold check run; faculty were notified for invalidated sections.`)}>Close &amp; check 50% rule</button>}
                    {p.status === 'open' && <button className="ghost" onClick={() => run('checkThreshold', p.id, 'Threshold check run (period stays open).')}>Check now</button>}
                    {p.status === 'closed' && <button className="ghost" onClick={() => run('reopenPeriod', p.id)}>Reopen</button>}
                    {nextStage && (p.status === 'closed'
                      ? <button onClick={() => run('releaseNext', p.id)}>{stageLabel[nextStage]}</button>
                      : <span className="muted" title="Close the period first">release after closing</span>)}
                    {p.releaseStage !== 'hr' && <button className="ghost" onClick={() => run('withdrawRelease', p.id)}>Withdraw one step</button>}
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
      <Card title="Demo data"><button className="ghost" onClick={async () => { if (confirm('Reset ALL data in the database to the simulated starting dataset?') && await act('resetData')) setMsg('All data was reset to the sample dataset.'); }}>Reset simulated data</button></Card>
    </>
  );
}

/* ---------------- Assignments / workflow ---------------- */
export function Assignments() {
  const { db, act } = useApp();
  const [pid, setPid] = useState(db.periods[db.periods.length - 1].id);
  const [msg, setMsg] = useState('');
  const [add, setAdd] = useState({ evaluatorId: '', targetId: '', group: '' });
  const tasks = db.tasks.filter((t) => t.periodId === pid);
  const evaluators = db.users.filter((u) => evaluatorGroup(u));
  const summary = {};
  tasks.forEach((t) => { const k = t.group; summary[k] ||= { pending: 0, completed: 0, overdue: 0 }; summary[k][taskStatus(db, t)]++; });

  const addOne = async () => {
    setMsg('');
    if (!add.evaluatorId || !add.targetId) return setMsg('Choose an evaluator and a person to evaluate.');
    if (await act('addAssignment', { periodId: pid, ...add })) setMsg('Assignment added.');
  };

  return (
    <>
      <Card title="Evaluation workflow" actions={<PeriodPicker periods={db.periods} value={pid} onChange={setPid} />}>
        {msg && <div className="note">{msg}</div>}
        <div className="row">
          <button onClick={async () => { const r = await act('generateTasks', { periodId: pid }); if (r) setMsg(`${r.added} task(s) generated from role, position and department rules.${r.skippedNoForm ? ` ${r.skippedNoForm} skipped because no form exists.` : ''}`); }}>Generate tasks for period</button>
          <button className="ghost" onClick={async () => { const r = await act('sendReminders', { periodId: pid }); if (r) setMsg(`${r.sent} reminder(s) sent to evaluators with pending or overdue tasks.`); }}>Send reminders</button>
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
                <td>{!t.response && <button className="ghost" onClick={() => act('removeTask', { taskId: t.id })}>Remove</button>}</td>
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
  const { db, act } = useApp();
  const [newCrit, setNewCrit] = useState('');
  const [sel, setSel] = useState(db.instruments[0]?.id);
  const [nf, setNf] = useState({ targetType: 'COLLEGE_FACULTY', group: 'ST', name: '' });
  const ins = db.instruments.find((i) => i.id === sel);
  const used = new Set(ins?.items.map((i) => i.criterionId));
  const groupsFor = (tt) => Object.keys(db.rules[tt] || {});

  return (
    <>
      <Card title="Criteria bank">
        <p className="muted">Criteria text below is sample content. Edit or replace it with the institution's actual criteria.</p>
        <table><tbody>
          {db.criteria.map((c) => (
            <tr key={c.id}>
              <td><SaveInput className="wide" value={c.text} onSave={(text) => act('renameCriterion', { criterionId: c.id, text })} /></td>
              <td><button className="ghost" disabled={db.instruments.some((i) => i.items.some((it) => it.criterionId === c.id))} title="Remove from forms first" onClick={() => act('deleteCriterion', { criterionId: c.id })}>Delete</button></td>
            </tr>
          ))}
        </tbody></table>
        <div className="row"><input className="wide" placeholder="New criterion" value={newCrit} onChange={(e) => setNewCrit(e.target.value)} />
          <button onClick={async () => { if (newCrit.trim() && await act('addCriterion', { text: newCrit })) setNewCrit(''); }}>Add criterion</button></div>
      </Card>
      <Card title="Evaluation forms (by evaluated role and evaluator group)">
        <div className="row">
          <Select value={sel} onChange={setSel}>{db.instruments.map((i) => <option key={i.id} value={i.id}>{TARGET_TYPES[i.targetType]} ← {GROUPS[i.group]} {i.name.includes('sample') ? '' : `(${i.name})`}</option>)}</Select>
        </div>
        {ins && (
          <>
            <p className="muted">Already-submitted evaluations keep the weights they were submitted with. Changes apply to evaluations not yet submitted. Weights save when you leave the field.</p>
            <table>
              <thead><tr><th>Criterion</th><th>Weight</th><th /></tr></thead>
              <tbody>{ins.items.map((it) => (
                <tr key={it.criterionId}>
                  <td>{db.criteria.find((c) => c.id === it.criterionId)?.text}</td>
                  <td><SaveInput type="number" min="0" step="0.5" value={it.weight} onSave={(weight) => act('setFormItemWeight', { instrumentId: ins.id, criterionId: it.criterionId, weight })} /></td>
                  <td><button className="ghost" onClick={() => act('removeFormItem', { instrumentId: ins.id, criterionId: it.criterionId })}>Remove</button></td>
                </tr>
              ))}</tbody>
            </table>
            <Select value="" onChange={(v) => v && act('addFormItem', { instrumentId: ins.id, criterionId: v })}>
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
          <button onClick={async () => {
            const r = await act('createForm', { targetType: nf.targetType, group: nf.group });
            if (r) setSel(r.id);
          }}>Create empty form</button>
        </div>
      </Card>
    </>
  );
}

/* ---------------- Weights ---------------- */
export function Weights() {
  const { db, act } = useApp();
  return (
    <Card title="Evaluator-group weights (%)">
      <p className="muted">College faculty weights (Students 40, Dean 40, Program Chair 20) come from the manuscript. The manuscript does not give weights for Basic Ed teachers or Deans, so they are blank: HR must enter them before a final score is computed. Each weight saves when you leave the field.</p>
      {Object.entries(db.rules).map(([tt, rule]) => {
        const total = Object.values(rule).reduce((a, w) => a + (Number(w) || 0), 0);
        return (
          <div key={tt}>
            <h4>{TARGET_TYPES[tt]} {total !== 100 && <Badge kind="overdue">total {total}% (should be 100%)</Badge>}</h4>
            <div className="row">
              {Object.keys(rule).map((g) => (
                <label key={g} className="inline">{GROUPS[g]}{' '}
                  <SaveInput type="number" min="0" max="100" value={rule[g] ?? ''} onSave={(v) => act('setGroupWeight', { targetType: tt, group: g, weight: v === '' ? null : Number(v) })} />
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
      {open.length === 0 && <Empty icon="calendar" title="No evaluation period is open" />}
      {open.map((p) => (
        <div key={p.id}>
          <h4>{p.name}</h4>
          <table>
            <thead><tr><th>Class</th><th>Faculty</th><th>Responded</th><th>Rate</th><th>Standing</th></tr></thead>
            <tbody>{secs.map((s) => {
              const st = sectionStats(db, p.id, s.id);
              return <tr key={s.id}><td>{s.code} – {s.subject}</td><td>{userById(db, s.facultyId).name}</td><td><div className="meter-row"><Meter value={st.rate} mark={0.5} /><span>{st.responded}/{st.required}</span></div></td><td>{pct(st.rate)}</td>
                <td>{st.belowHalf ? <Badge kind="overdue">below 50% – would be invalidated</Badge> : <Badge kind="completed">meets 50%</Badge>}</td></tr>;
            })}</tbody>
          </table>
        </div>
      ))}
    </Card>
  );
}
