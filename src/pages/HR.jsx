import { useEffect, useState } from 'react';
import { useApp } from '../lib/store';
import {
  GROUPS, TARGET_TYPES, STAGES, STAGE_LABEL, taskStatus, userById, sectionStats, targetsOf, evaluatorGroups, deptName,
  formUsed, itemCategory, effectiveWeights, isExemptSection, pendingApprovals, periodCovers,
} from '../lib/logic';
import { Card, StatusBadge, RuleNote, PeriodPicker, Select, Badge, SaveInput, Meter, Empty, pct } from '../ui';

const scopeText = (db, p) => (p.depts?.length ? p.depts.map((d) => deptName(db, d)).join(', ') : 'All departments');

/* ---------------- Evaluation periods + release (FR8, FR17) ---------------- */
export function Periods() {
  const { db, act } = useApp();
  const [name, setName] = useState('');
  const [deadline, setDeadline] = useState('');
  const [depts, setDepts] = useState([]);
  const [msg, setMsg] = useState('');
  const add = async () => {
    if (!name || !deadline) return setMsg('Enter a period name and deadline.');
    if (await act('createPeriod', { name, deadline, depts })) { setName(''); setDeadline(''); setDepts([]); setMsg('Period created. Go to Assignments to generate the evaluation tasks.'); }
  };
  const run = async (action, periodId, done) => { setMsg(''); const r = await act(action, { periodId }); if (r) setMsg(typeof done === 'function' ? done(r) : done || ''); };
  const toggle = (d) => setDepts((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]));
  return (
    <>
      <RuleNote />
      {msg && <div className="note">{msg}</div>}
      <Card title="Evaluation periods">
        <table>
          <thead><tr><th>Period</th><th>Covers</th><th>Deadline</th><th>Status</th><th>Release</th><th>Actions</th></tr></thead>
          <tbody>
            {db.periods.map((p) => {
              const nextStage = STAGES[STAGES.indexOf(p.releaseStage) + 1];
              const waiting = p.releaseStage === 'dir' ? pendingApprovals(db, p) : [];
              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="muted">{scopeText(db, p)}</td>
                  <td><input type="date" value={p.deadline} onChange={(e) => e.target.value && act('setPeriodDeadline', { periodId: p.id, deadline: e.target.value })} /></td>
                  <td><Badge kind={p.status === 'open' ? 'pending' : 'completed'}>{p.status}</Badge></td>
                  <td>{STAGE_LABEL[p.releaseStage]}{p.releaseStage === 'dir' && <><br /><span className="muted">{waiting.length ? `Waiting for approval: ${waiting.map((u) => u.name).join(', ')}` : 'All Directors/VPs approved'}</span></>}</td>
                  <td className="row">
                    {p.status === 'open' && <button onClick={() => { if (confirm(`Close ${p.name}? Classes where fewer than half of the class plus one answered will be excluded, and everyone concerned is notified.`)) run('closePeriod', p.id, (r) => `${p.name} closed. ${r.flagged} class(es) were excluded (below half + 1); the faculty, department heads and HR were notified.`); }}>Close period</button>}
                    {p.status === 'open' && <button className="ghost" onClick={() => run('checkThreshold', p.id, (r) => (r.flagged ? `${r.flagged} class(es) are at or below half. The faculty, their department heads and HR were notified.` : 'Every class has enough responses so far.'))}>Send participation alerts</button>}
                    {p.status === 'closed' && p.releaseStage === 'hr' && <button className="ghost" onClick={() => run('reopenPeriod', p.id)}>Reopen</button>}
                    {nextStage && p.status === 'closed' && nextStage === 'dir' && <button onClick={() => run('releaseNext', p.id, 'Results sent to the Directors/VPs for review and approval. They were notified.')}>Send to Directors/VPs for approval</button>}
                    {nextStage === 'faculty' && <button disabled={waiting.length > 0} title={waiting.length ? 'Every Director/VP must approve first' : ''} onClick={() => run('releaseNext', p.id, 'Results released to faculty. Each person was notified.')}>Release to faculty</button>}
                    {p.status === 'open' && <span className="muted">release after closing</span>}
                    {p.releaseStage !== 'hr' && <button className="ghost" onClick={() => run('withdrawRelease', p.id)}>Withdraw one step</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted">Release order is enforced: HR Specialist → Directors/VPs (review and approve) → individual faculty. Faculty see nothing until every Director/VP has approved and HR releases the results.</p>
      </Card>
      <Card title="New evaluation period">
        <div className="row">
          <input placeholder="Period name, e.g. AY 2026-27 Term 2" value={name} onChange={(e) => setName(e.target.value)} className="wide" />
          <label className="inline">Deadline <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
        </div>
        <div className="row">
          <span className="muted">Departments:</span>
          {db.departments.map((d) => <label key={d.id} className="inline"><input type="checkbox" checked={depts.includes(d.id)} onChange={() => toggle(d.id)} /> {d.name}</label>)}
          <span className="muted">{depts.length ? '' : '(none ticked = all departments)'}</span>
        </div>
        <div className="row"><button onClick={add}>Create period</button></div>
        <p className="muted">You can open and close evaluations for one department at a time by creating a period for just that department. The current evaluator weights are saved with the period.</p>
      </Card>
      <Card title="Demo data"><button className="ghost" onClick={async () => { if (confirm('Reset ALL data in the database to the simulated starting dataset?') && await act('resetData')) setMsg('All data was reset to the sample dataset.'); }}>Reset simulated data</button></Card>
    </>
  );
}

/* ---------------- Assignments / workflow (FR6, FR7, FR9, FR10) ---------------- */
export function Assignments() {
  const { db, act } = useApp();
  const [pid, setPid] = useState(db.periods[db.periods.length - 1].id);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [add, setAdd] = useState({ evaluatorId: '', targetId: '' });
  const tasks = db.tasks.filter((t) => t.periodId === pid);
  const evaluators = db.users.filter((u) => u.role !== 'ST' && evaluatorGroups(u).length);
  const summary = {};
  tasks.forEach((t) => { const k = t.group; summary[k] ||= { pending: 0, completed: 0, overdue: 0 }; summary[k][taskStatus(db, t)]++; });
  const s = q.trim().toLowerCase();
  const match = (t) => !s || userById(db, t.evaluatorId)?.name.toLowerCase().includes(s) || userById(db, t.targetId)?.name.toLowerCase().includes(s);
  const listed = tasks.filter((t) => t.group !== 'ST' && match(t)).concat(tasks.filter((t) => t.group === 'ST' && match(t)).slice(0, s ? 200 : 15));

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
          <button onClick={async () => { const r = await act('generateTasks', { periodId: pid }); if (r) setMsg(`${r.added} task(s) generated from the class lists and the role, position and department rules.${r.skippedNoForm ? ` ${r.skippedNoForm} skipped because no form exists.` : ''} Internship, practicum and field trip subjects were skipped.`); }}>Generate tasks for period</button>
          <button className="ghost" onClick={async () => { const r = await act('sendReminders', { periodId: pid }); if (r) setMsg(`Reminders sent to ${r.sent} evaluator(s) with unfinished evaluations. Their department heads and HR were alerted too.`); }}>Send reminders now</button>
        </div>
        <p className="muted">Reminders are also sent automatically once a day during the last 7 days before the deadline, and every day after it until the period is closed.</p>
        <table>
          <thead><tr><th>Evaluator group</th><th>Pending</th><th>Completed</th><th>Overdue</th></tr></thead>
          <tbody>{Object.entries(summary).map(([g, x]) => <tr key={g}><td>{GROUPS[g]}</td><td>{x.pending}</td><td>{x.completed}</td><td>{x.overdue}</td></tr>)}</tbody>
        </table>
      </Card>
      <Card title="Add an evaluator assignment">
        <div className="row">
          <Select value={add.evaluatorId} onChange={(v) => setAdd({ ...add, evaluatorId: v })}><option value="">Evaluator…</option>{evaluators.map((u) => <option key={u.id} value={u.id}>{u.name} ({evaluatorGroups(u).map((g) => GROUPS[g]).join(' / ')})</option>)}</Select>
          <Select value={add.targetId} onChange={(v) => setAdd({ ...add, targetId: v })}><option value="">Evaluates…</option>{targetsOf(db).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
          <button onClick={addOne}>Add</button>
        </div>
      </Card>
      <Card title="Assigned tasks" actions={<input placeholder="Search evaluator or person" value={q} onChange={(e) => setQ(e.target.value)} />}>
        <table>
          <thead><tr><th>Evaluator</th><th>As</th><th>Evaluates</th><th>Class</th><th>Status</th><th /></tr></thead>
          <tbody>
            {listed.map((t) => (
              <tr key={t.id}>
                <td>{userById(db, t.evaluatorId).name}</td><td>{GROUPS[t.group]}</td><td>{userById(db, t.targetId).name}</td>
                <td>{db.sections.find((x) => x.id === t.sectionId)?.code || '—'}</td><td><StatusBadge s={taskStatus(db, t)} /></td>
                <td>{!t.response && <button className="ghost" onClick={() => act('removeTask', { taskId: t.id })}>Remove</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">Student tasks are summarised above; {s ? 'matching ones are listed.' : 'the first 15 are listed here. Search to find a specific evaluator.'}</p>
      </Card>
    </>
  );
}

/* ---------------- Class lists (FR6) ---------------- */
export function Classes() {
  const { db, act } = useApp();
  const [f, setF] = useState({ code: '', subject: '', facultyId: '' });
  const [csv, setCsv] = useState('');
  const [out, setOut] = useState(null);
  const [msg, setMsg] = useState('');
  const faculty = db.users.filter((u) => u.role === 'TP' && u.position === 'faculty' && u.active);
  const used = new Set(db.tasks.map((t) => t.sectionId).filter(Boolean));
  return (
    <>
      <div className="note">Class lists and teaching loads come from the Registrar / ARC. Students evaluate the teacher of each class they are enrolled in. <b>Internship, practicum and field trip subjects are kept on the list but are not evaluated</b> (recognised from the subject name).</div>
      {msg && <div className="note">{msg}</div>}
      <Card title="Import a class list">
        <p className="muted">Paste the list exported from the Registrar/ARC, one student per line: <code>section code, subject, faculty (username or email), student (username or email)</code>. New sections are created and students are enrolled; problem rows are listed and skipped.</p>
        <textarea rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'SEC-A3, Sample Subject A3, fac_a1@ubaguio.edu, st_a01@s.ubaguio.edu'} />
        <div className="row"><button onClick={async () => { const r = await act('importClassList', { csv }); if (r) { setOut(r); if (!r.errorCount) setCsv(''); } }}>Import class list</button></div>
        {out && <div className={`note ${out.errorCount ? 'warn' : 'ok'}`}>{out.created} section(s) created, {out.enrolled} enrolment(s) added.{out.errorCount > 0 && <> {out.errorCount} row(s) skipped:<ul>{out.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></>}</div>}
      </Card>
      <Card title="Add a class section">
        <div className="row">
          <input placeholder="Section code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
          <input placeholder="Subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} className="wide" />
          <Select value={f.facultyId} onChange={(v) => setF({ ...f, facultyId: v })}><option value="">Teacher…</option>{faculty.map((u) => <option key={u.id} value={u.id}>{u.name} · {deptName(db, u.dept)}</option>)}</Select>
          <button onClick={async () => { setMsg(''); if (await act('createSection', f)) { setF({ code: '', subject: '', facultyId: '' }); setMsg('Section added. Enrol students under Accounts or by importing a class list.'); } }}>Add</button>
        </div>
      </Card>
      <Card title={`Class sections (${db.sections.length})`}>
        <table>
          <thead><tr><th>Section</th><th>Subject</th><th>Teacher</th><th>Department</th><th>Students</th><th>Evaluated?</th><th /></tr></thead>
          <tbody>{db.sections.map((s) => (
            <tr key={s.id}>
              <td>{s.code}</td><td>{s.subject}</td><td>{userById(db, s.facultyId)?.name}</td><td>{deptName(db, s.dept)}</td><td>{s.studentIds.length}</td>
              <td>{isExemptSection(s) ? <Badge kind="muted">not evaluated</Badge> : <Badge kind="completed">yes</Badge>}</td>
              <td>{!used.has(s.id) && <button className="ghost" onClick={() => { if (confirm(`Delete section ${s.code}?`)) act('deleteSection', { sectionId: s.id }); }}>Delete</button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </>
  );
}

/* ---------------- Dynamic forms (FR3, FR4, NFR9) ---------------- */
export function Forms() {
  const { db, act } = useApp();
  const [newCrit, setNewCrit] = useState('');
  const [showOld, setShowOld] = useState(false);
  const forms = db.instruments.filter((i) => showOld || i.active !== false);
  const [sel, setSel] = useState(forms[0]?.id);
  const [nf, setNf] = useState({ targetType: 'COLLEGE_FACULTY', group: 'ST', dept: '' });
  const [msg, setMsg] = useState('');
  const ins = db.instruments.find((i) => i.id === sel);
  const used = new Set(ins?.items.map((i) => i.criterionId));
  const groupsFor = (tt) => Object.keys(db.rules[tt] || {});
  const answered = new Set(db.tasks.filter((t) => t.response).flatMap((t) => Object.keys(t.response.answers)));
  const locked = ins && (ins.active === false || formUsed(db, ins));
  const cats = ins ? [...new Set(ins.items.map(itemCategory))] : [];
  const eff = ins ? effectiveWeights(ins) : {};
  const effTotal = Object.values(eff).reduce((a, w) => a + w, 0);
  const label = (i) => `${TARGET_TYPES[i.targetType]} ← ${GROUPS[i.group]}${i.dept ? ` · ${deptName(db, i.dept)}` : ''} · v${i.version || 1}${i.active === false ? ' (old)' : ''}`;

  return (
    <>
      {msg && <div className="note">{msg}</div>}
      <Card title="Evaluation forms" actions={<label className="inline muted"><input type="checkbox" checked={showOld} onChange={(e) => setShowOld(e.target.checked)} /> Show old versions</label>}>
        <div className="row">
          <Select value={sel} onChange={setSel}>{forms.map((i) => <option key={i.id} value={i.id}>{label(i)}</option>)}</Select>
          {ins && ins.active !== false && <button className="ghost" onClick={async () => { const r = await act('reviseForm', { instrumentId: ins.id }); if (r) { setSel(r.id); setMsg(`Version ${r.version} created. Edit it below; evaluations already submitted keep the old version.`); } }}>Create new version</button>}
        </div>
        {ins && (
          <>
            {locked
              ? <div className="note warn">{ins.active === false ? 'This is an old version, kept with the results that used it. It can\'t be changed.' : 'This form already has submitted evaluations, so it is locked to keep past results unchanged. Click "Create new version" to make changes.'}</div>
              : <p className="muted">Changes save when you leave a field. Evaluations already submitted keep the weights they were submitted with.</p>}
            <table>
              <thead><tr><th>Criterion</th><th>Category</th><th>Item weight</th><th>Counts</th><th /></tr></thead>
              <tbody>{ins.items.map((it) => (
                <tr key={it.criterionId}>
                  <td>{db.criteria.find((c) => c.id === it.criterionId)?.text}</td>
                  <td>{locked ? itemCategory(it) : <SaveInput value={it.category || ''} placeholder="General" onSave={(category) => act('setFormItemCategory', { instrumentId: ins.id, criterionId: it.criterionId, category })} />}</td>
                  <td>{locked ? it.weight : <SaveInput type="number" min="0" step="0.5" value={it.weight} onSave={(weight) => act('setFormItemWeight', { instrumentId: ins.id, criterionId: it.criterionId, weight })} />}</td>
                  <td className="muted">{effTotal ? pct(eff[it.criterionId] / effTotal) : '—'}</td>
                  <td>{!locked && <button className="ghost" onClick={() => act('removeFormItem', { instrumentId: ins.id, criterionId: it.criterionId })}>Remove</button>}</td>
                </tr>
              ))}</tbody>
            </table>
            <h4>Category weights</h4>
            <p className="muted">Group items into categories (e.g. "Management of the Teaching and Learning Process" 60% and "Assessment of Learners and Learning Environment" 40%). If every category has a weight, each category counts that share of the score. Leave them blank to use the item weights only.</p>
            <div className="row">
              {cats.map((c) => (
                <label key={c} className="inline">{c}{' '}
                  {locked ? <b>{ins.categories?.[c] ?? '—'}%</b> : <SaveInput type="number" min="0" max="100" value={ins.categories?.[c] ?? ''} onSave={(v) => act('setFormCategoryWeight', { instrumentId: ins.id, category: c, weight: v === '' ? null : Number(v) })} />}
                </label>
              ))}
            </div>
            {!locked && (
              <Select value="" onChange={(v) => v && act('addFormItem', { instrumentId: ins.id, criterionId: v })}>
                <option value="">Add criterion to this form…</option>
                {db.criteria.filter((c) => !used.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.text}</option>)}
              </Select>
            )}
          </>
        )}
      </Card>
      <Card title="Create a new form">
        <div className="row">
          <Select value={nf.targetType} onChange={(v) => setNf({ ...nf, targetType: v, group: groupsFor(v)[0] })}>{Object.entries(TARGET_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          <Select value={nf.group} onChange={(v) => setNf({ ...nf, group: v })}>{groupsFor(nf.targetType).map((g) => <option key={g} value={g}>{GROUPS[g]}</option>)}</Select>
          <Select value={nf.dept} onChange={(v) => setNf({ ...nf, dept: v })}><option value="">All departments</option>{db.departments.map((d) => <option key={d.id} value={d.id}>Only {d.name}</option>)}</Select>
          <button onClick={async () => { const r = await act('createForm', nf); if (r) setSel(r.id); }}>Create empty form</button>
        </div>
        <p className="muted">A department-specific form (e.g. for Nursing) is used for that department instead of the general one.</p>
      </Card>
      <Card title="Criteria bank">
        <p className="muted">Criteria text below is sample content. Criteria already answered in submitted evaluations can't be reworded or deleted, so past reports stay exactly as they were.</p>
        <table><tbody>
          {db.criteria.map((c) => (
            <tr key={c.id}>
              <td>{answered.has(c.id) ? <span>{c.text} <Badge kind="muted">used</Badge></span> : <SaveInput className="wide" value={c.text} onSave={(text) => act('renameCriterion', { criterionId: c.id, text })} />}</td>
              <td><button className="ghost" disabled={answered.has(c.id) || db.instruments.some((i) => i.items.some((it) => it.criterionId === c.id))} title="Remove from forms first" onClick={() => act('deleteCriterion', { criterionId: c.id })}>Delete</button></td>
            </tr>
          ))}
        </tbody></table>
        <div className="row"><input className="wide" placeholder="New criterion" value={newCrit} onChange={(e) => setNewCrit(e.target.value)} />
          <button onClick={async () => { if (newCrit.trim() && await act('addCriterion', { text: newCrit })) setNewCrit(''); }}>Add criterion</button></div>
      </Card>
    </>
  );
}

/* ---------------- Weights (FR5, NFR8) ---------------- */
export function Weights() {
  const { db, act } = useApp();
  return (
    <Card title="Evaluator-group weights (%)">
      <p className="muted">From Table 6 of the manuscript: College faculty — Students 40, Dean 40, Program Chair 20; Basic Education — Students 40, Principal 20, Assistant Principal 20, Subject Head 20; non-teaching personnel are evaluated by one group (head ↔ staff). Weights for evaluating Deans are not given, so HR must enter them. <b>Changes apply to open and future periods; closed periods keep the weights they were computed with.</b> If a group has no valid result, its weight is removed and the score is computed over the rest.</p>
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

/* ---------------- Section monitor (dean / chair / HR) (FR9, FR11) ---------------- */
export function Monitor({ deptOnly }) {
  const { db, user } = useApp();
  const open = db.periods.filter((p) => p.status === 'open');
  const secs = db.sections.filter((s) => !deptOnly || s.dept === user.dept);
  const depts = db.departments.filter((d) => !deptOnly || d.id === user.dept);
  return (
    <>
      <RuleNote />
      {open.length === 0 && <Card><Empty icon="calendar" title="No evaluation period is open" /></Card>}
      {open.map((p) => {
        const pt = db.tasks.filter((t) => t.periodId === p.id);
        const dept = (d) => pt.filter((t) => userById(db, t.evaluatorId)?.dept === d.id || userById(db, t.targetId)?.dept === d.id);
        return (
          <div key={p.id}>
            <Card title={`${p.name} · progress by department`}>
              <table>
                <thead><tr><th>Department</th><th>Evaluations done</th><th>Students</th><th>Personnel</th><th>Overdue</th></tr></thead>
                <tbody>{depts.filter((d) => periodCovers(p, d.id)).map((d) => {
                  const ts = dept(d);
                  const done = ts.filter((t) => t.response).length;
                  const st = ts.filter((t) => t.group === 'ST'), pe = ts.filter((t) => t.group !== 'ST');
                  return <tr key={d.id}><td>{d.name}</td><td><div className="meter-row"><Meter value={ts.length ? done / ts.length : 0} tone="brand" /><span>{done}/{ts.length}</span></div></td>
                    <td>{st.filter((t) => t.response).length}/{st.length}</td><td>{pe.filter((t) => t.response).length}/{pe.length}</td><td>{ts.filter((t) => taskStatus(db, t) === 'overdue').length}</td></tr>;
                })}</tbody>
              </table>
            </Card>
            <Card title={deptOnly ? `Class progress – ${deptName(db, user.dept)}` : 'Class progress'}>
              <table>
                <thead><tr><th>Class</th><th>Faculty</th><th>Responded</th><th>Rate</th><th>Standing</th></tr></thead>
                <tbody>{secs.filter((s) => periodCovers(p, s.dept)).map((s) => {
                  if (isExemptSection(s)) return <tr key={s.id}><td>{s.code} – {s.subject}</td><td>{userById(db, s.facultyId)?.name}</td><td colSpan={2} className="muted">—</td><td><Badge kind="muted">not evaluated (practicum/internship/field trip)</Badge></td></tr>;
                  const st = sectionStats(db, p.id, s.id);
                  return <tr key={s.id}><td>{s.code} – {s.subject}</td><td>{userById(db, s.facultyId)?.name}</td><td><div className="meter-row"><Meter value={st.rate} mark={0.5} /><span>{st.responded}/{st.required} <span className="muted">needs {st.needed}</span></span></div></td><td>{pct(st.rate)}</td>
                    <td>{!st.required ? <span className="muted">no tasks yet</span> : st.belowHalf ? <Badge kind="overdue">below half + 1 – would be excluded</Badge> : <Badge kind="completed">enough responses</Badge>}</td></tr>;
                })}</tbody>
              </table>
            </Card>
          </div>
        );
      })}
    </>
  );
}

/* ---------------- Audit log (FR20, NFR7) ---------------- */
const AUDIT_LABEL = {
  view: 'Viewed results', releaseNext: 'Released results', withdrawRelease: 'Withdrew a release', approveRelease: 'Approved results (VP)',
  setGroupWeight: 'Changed a weight', closePeriod: 'Closed a period', reopenPeriod: 'Reopened a period', createPeriod: 'Created a period',
  submitEvaluation: 'Submitted an evaluation', recordResultRequest: 'Released results through a dean', signIn: 'Signed in', signOut: 'Signed out',
  automaticReminders: 'Automatic reminders', resetData: 'Reset all data',
};
export function AuditLog() {
  const { user } = useApp();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [kind, setKind] = useState('results');
  const [q, setQ] = useState('');
  const load = async () => {
    setErr('');
    try {
      const r = await fetch('/api/audit', { credentials: 'same-origin' });
      const d = await r.json();
      if (r.ok) setRows(d.entries); else setErr(d.error || 'Could not load the audit log.');
    } catch { setErr("Can't reach the server."); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps, react/set-state-in-effect
  if (user.role !== 'HR') return null;
  const RESULT = new Set(['view', 'releaseNext', 'withdrawRelease', 'approveRelease', 'setGroupWeight', 'closePeriod', 'reopenPeriod', 'recordResultRequest', 'reviseForm', 'setFormItemWeight', 'setFormCategoryWeight', 'resetData']);
  const s = q.trim().toLowerCase();
  const list = (rows || []).filter((r) => (kind === 'all' || (kind === 'results' ? RESULT.has(r.action) : kind === r.action))
    && (!s || `${r.user_name} ${r.detail} ${r.action}`.toLowerCase().includes(s)));
  return (
    <Card title="Audit log" actions={<button className="ghost" onClick={load}>Refresh</button>}>
      <p className="muted">Every view, change and release of results is recorded with who did it and when. Entries can't be edited or deleted.</p>
      <div className="row">
        <Select value={kind} onChange={setKind}>
          <option value="results">Results: views, changes, releases</option>
          <option value="view">Views only</option>
          <option value="releaseNext">Releases only</option>
          <option value="all">Everything</option>
        </Select>
        <input placeholder="Search name or detail" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {err && <div className="note warn">{err}</div>}
      {!rows ? <p className="muted">Loading…</p> : (
        <table>
          <thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
          <tbody>{list.slice(0, 300).map((r) => (
            <tr key={r.id}><td>{new Date(r.at).toLocaleString()}</td><td>{r.user_name || 'System'}</td><td>{AUDIT_LABEL[r.action] || r.action}</td><td className="muted">{r.detail || '—'}</td></tr>
          ))}</tbody>
        </table>
      )}
      {rows && list.length === 0 && <Empty icon="list" title="No entries match" />}
    </Card>
  );
}
