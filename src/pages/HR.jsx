import { useEffect, useState } from 'react';
import { useApp } from '../lib/store';
import {
  GROUPS, TARGET_TYPES, STAGES, STAGE_LABEL, taskStatus, userById, sectionStats, targetsOf, evaluatorGroups, deptName,
  formUsed, itemCategory, effectiveWeights, isExemptSection, isTeacher, pendingApprovals, periodCovers, CLASS_TYPES,
} from '../lib/logic';

/** Types of class HR can pick for a section. A Clinical Instructor (Nursing) works in the clinical area or the skills lab. */
const classTypesFor = (teacher) => (teacher?.position === 'ci'
  ? [['', 'Clinical area (hospital, community clinic)'], ['skills', CLASS_TYPES.skills]]
  : Object.entries(CLASS_TYPES).filter(([k]) => k !== 'skills'));
import { Card, StatusBadge, RuleNote, PeriodPicker, Select, Badge, SaveInput, Meter, Empty, pct, newestFirst, usePages } from '../ui';

const scopeText = (db, p) => (p.depts?.length ? p.depts.map((d) => deptName(db, d)).join(', ') : 'All departments');

/* ----- choices for a new period, so HR picks instead of typing ----- */
const TERMS = ['Term 1', 'Term 2', 'Summer'];
const OPEN_FOR = [[7, '1 week'], [14, '2 weeks'], [21, '3 weeks'], [28, '4 weeks'], [42, '6 weeks']];
const isoIn = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
/** The school year starts mid-year, so from June on it is "this year – next year". */
function schoolYears() {
  const d = new Date();
  const y = d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1;
  return [y - 1, y, y + 1, y + 2].map((s) => `AY ${s}-${String(s + 1).slice(2)}`);
}
const periodExists = (db, ay, term) => db.periods.some((p) => p.name.startsWith(`${ay} ${term}`));
/** The first Term 1 / Term 2 from this school year on that has no period yet. */
function nextTerm(db) {
  const years = schoolYears().slice(1);
  for (const ay of years) for (const term of ['Term 1', 'Term 2']) if (!periodExists(db, ay, term)) return { ay, term };
  return { ay: years[0], term: 'Term 1' };
}

/* ---------------- Evaluation periods + release (FR8, FR17) ---------------- */
export function Periods() {
  const { db, act } = useApp();
  const [pick, setPick] = useState(() => nextTerm(db));
  const [weeks, setWeeks] = useState(21);
  const [deadline, setDeadline] = useState(isoIn(21));
  const [depts, setDepts] = useState([]);
  const [msg, setMsg] = useState('');
  const name = `${pick.ay} ${pick.term}`;
  const exists = periodExists(db, pick.ay, pick.term);
  const add = async () => {
    if (exists) return setMsg(`${name} already exists.`);
    if (await act('createPeriod', { name, deadline, depts })) {
      setDepts([]); setMsg(`${name} created. Go to Assignments and click "Generate tasks for period".`);
      // suggest the following term next time
      const ys = schoolYears();
      setPick(pick.term === 'Term 1' ? { ay: pick.ay, term: 'Term 2' } : { ay: ys[Math.min(ys.indexOf(pick.ay) + 1, ys.length - 1)], term: 'Term 1' });
    }
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
            {newestFirst(db.periods).map((p) => {
              const nextStage = STAGES[STAGES.indexOf(p.releaseStage) + 1];
              const waiting = p.releaseStage === 'dir' ? pendingApprovals(db, p) : [];
              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="muted">{scopeText(db, p)}</td>
                  <td><input type="date" value={p.deadline} onChange={(e) => e.target.value && act('setPeriodDeadline', { periodId: p.id, deadline: e.target.value })} /></td>
                  <td><Badge kind={p.status === 'open' ? 'pending' : 'completed'}>{p.status}</Badge></td>
                  <td>{STAGE_LABEL[p.releaseStage]}{p.releaseStage === 'dir' && <><br /><span className="muted">{waiting.length ? `Waiting for approval: ${waiting.map((u) => u.name).join(', ')}` : 'All VPs approved'}</span></>}</td>
                  <td className="row">
                    {p.status === 'open' && <button onClick={() => { if (confirm(`Close ${p.name}? Classes where fewer than half of the class plus one answered will be excluded, and everyone concerned is notified.`)) run('closePeriod', p.id, (r) => `${p.name} closed. ${r.flagged} class(es) were excluded (below half + 1); the faculty, department heads and HR were notified.`); }}>Close period</button>}
                    {p.status === 'open' && <button className="ghost" onClick={() => run('checkThreshold', p.id, (r) => (r.flagged ? `${r.flagged} class(es) are at or below half. The faculty, their department heads and HR were notified.` : 'Every class has enough responses so far.'))}>Send participation alerts</button>}
                    {p.status === 'closed' && p.releaseStage === 'hr' && <button className="ghost" onClick={() => run('reopenPeriod', p.id)}>Reopen</button>}
                    {nextStage && p.status === 'closed' && nextStage === 'dir' && <button onClick={() => run('releaseNext', p.id, 'Results sent to the VPs for review and approval. They were notified.')}>Send to VPs for approval</button>}
                    {nextStage === 'faculty' && <button disabled={waiting.length > 0} title={waiting.length ? 'Every VP must approve first' : ''} onClick={() => run('releaseNext', p.id, 'Results released to faculty. Each person was notified.')}>Release to faculty</button>}
                    {p.status === 'open' && <span className="muted">release after closing</span>}
                    {p.releaseStage !== 'hr' && <button className="ghost" onClick={() => run('withdrawRelease', p.id)}>Withdraw one step</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted">Release order is enforced: HR Specialist → VPs (review and approve) → individual faculty. Faculty see nothing until every VP has approved and HR releases the results.</p>
      </Card>
      <Card title="New evaluation period">
        <div className="row">
          <label className="inline">School year
            <Select value={pick.ay} onChange={(ay) => setPick({ ...pick, ay })}>{schoolYears().map((y) => <option key={y} value={y}>{y}</option>)}</Select></label>
          <label className="inline">Term
            <Select value={pick.term} onChange={(term) => setPick({ ...pick, term })}>{TERMS.map((t) => <option key={t} value={t}>{t}{periodExists(db, pick.ay, t) ? ' (already created)' : ''}</option>)}</Select></label>
          <label className="inline">Open for
            <Select value={weeks} onChange={(v) => { const n = Number(v); setWeeks(n); if (n) setDeadline(isoIn(n)); }}>
              {OPEN_FOR.map(([d, l]) => <option key={d} value={d}>{l}</option>)}
              {!OPEN_FOR.some(([d]) => d === weeks) && <option value={weeks}>chosen date</option>}
            </Select></label>
          <label className="inline">Deadline <input type="date" value={deadline} onChange={(e) => { if (e.target.value) { setDeadline(e.target.value); setWeeks(0); } }} /></label>
        </div>
        <div className="row">
          <label className="inline">Departments
            <Select value="" onChange={(v) => { if (v === '__all') setDepts([]); else if (v) toggle(v); }}>
              <option value="">{depts.length ? '+ Add another department…' : 'All departments'}</option>
              {depts.length > 0 && <option value="__all">All departments (clear the list)</option>}
              {db.departments.filter((d) => !depts.includes(d.id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select></label>
          {depts.map((id) => (
            <span key={id} className="tag">{deptName(db, id)}
              <button type="button" className="tag-x" aria-label={`Remove ${deptName(db, id)}`} onClick={() => toggle(id)}>×</button>
            </span>
          ))}
        </div>
        <p className={exists ? 'note warn' : 'muted'}>{exists ? <><b>{name}</b> already exists. Pick another term or school year.</> : <>This will create <b>{name}</b> for <b>{depts.length ? depts.map((d) => deptName(db, d)).join(', ') : 'all departments'}</b>, open until <b>{new Date(deadline + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</b>.</>}</p>
        <div className="row"><button onClick={add} disabled={exists}>Create {name}</button></div>
        <p className="muted">You can open and close evaluations for one department at a time by creating a period for just that department. The current evaluator weights are saved with the period.</p>
      </Card>
      <Card title="Start over">
        <div className="row">
          <button className="danger" onClick={async () => {
            if (!confirm('START FROM SCRATCH?\n\nThis deletes every account except HR, and all classes, evaluation periods, evaluations, results, notifications and imported records. Departments go back to the University of Baguio list.\n\nThe evaluation forms, questions and weights are kept. This cannot be undone.')) return;
            if (!confirm('Are you sure? Everything except the HR accounts, the UB departments and the forms will be gone.')) return;
            const r = await act('startFromScratch');
            if (r) setMsg(`Done. ${r.removed} account(s) and all records were deleted. Next: add the accounts under Accounts (the UB departments are ready), then your class lists, then create an evaluation period.`);
          }}>Start from scratch (keep only HR)</button>
          <button className="ghost" onClick={async () => { if (confirm('Replace ALL data with the sample (demo) data? Everything you entered is replaced.') && await act('resetData')) setMsg('All data was replaced with the sample data.'); }}>Load sample data</button>
        </div>
        <p className="muted"><b>Start from scratch</b> empties the system for real use: only HR accounts stay, with their passwords, plus the UB departments and the evaluation forms, questions and weights, so you don't have to build them again. <b>Load sample data</b> brings back the demo accounts (password demo1234). The audit log is never erased.</p>
      </Card>
    </>
  );
}

/* ---------------- Assignments / workflow (FR6, FR7, FR9, FR10) ---------------- */
export function Assignments() {
  const { db, act } = useApp();
  const [pidSel, setPid] = useState(db.periods[db.periods.length - 1]?.id);
  // the chosen period, or the newest one if none is chosen yet (or it was deleted)
  const pid = db.periods.some((p) => p.id === pidSel) ? pidSel : db.periods[db.periods.length - 1]?.id;
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [grp, setGrp] = useState('');
  const [st, setSt] = useState('');
  const [add, setAdd] = useState({ evaluatorId: '', targetId: '' });
  const tasks = db.tasks.filter((t) => t.periodId === pid);
  const evaluators = db.users.filter((u) => u.role !== 'ST' && evaluatorGroups(u).length);
  const summary = {};
  tasks.forEach((t) => { const k = t.group; summary[k] ||= { pending: 0, completed: 0, overdue: 0 }; summary[k][taskStatus(db, t)]++; });
  const s = q.trim().toLowerCase();
  const match = (t) => !s || userById(db, t.evaluatorId)?.name.toLowerCase().includes(s) || userById(db, t.targetId)?.name.toLowerCase().includes(s);
  const listed = newestFirst(tasks).filter((t) => (!grp || t.group === grp) && (!st || taskStatus(db, t) === st) && match(t));
  const { rows, bar } = usePages(listed, `${pid}|${s}|${grp}|${st}`);
  if (!db.periods.length) return <Card><Empty icon="calendar" title="No evaluation period yet">Create one under Periods &amp; release first.</Empty></Card>;

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
      <Card title={`Assigned tasks (${listed.length})`}>
        <div className="row">
          <Select value={grp} onChange={setGrp}><option value="">All evaluator groups</option>{Object.keys(summary).map((g) => <option key={g} value={g}>{GROUPS[g]}</option>)}</Select>
          <Select value={st} onChange={setSt}><option value="">Any status</option><option value="pending">Pending</option><option value="completed">Completed</option><option value="overdue">Overdue</option></Select>
          <input placeholder="Search a name (optional)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {listed.length === 0 ? <Empty icon="list" title={tasks.length ? 'No tasks match' : 'No tasks yet'}>{tasks.length ? 'Change the filters above.' : 'Click "Generate tasks for period" above.'}</Empty> : <>
        <table>
          <thead><tr><th>Evaluator</th><th>As</th><th>Evaluates</th><th>Class</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>{userById(db, t.evaluatorId).name}</td><td>{GROUPS[t.group]}</td><td>{userById(db, t.targetId).name}</td>
                <td>{db.sections.find((x) => x.id === t.sectionId)?.code || '—'}</td><td><StatusBadge s={taskStatus(db, t)} /></td>
                <td>{!t.response && <button className="ghost" onClick={() => act('removeTask', { taskId: t.id })}>Remove</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {bar}
        </>}
      </Card>
    </>
  );
}

/* ---------------- Class lists (FR6) ---------------- */
// same as samples/class-list-example.csv: 1 teacher and 6 students in 2 classes (import it for SIT)
const SAMPLE_CLASS_LIST = `section code,subject,teacher name,teacher email,student ID,student name,student UB email
SIT-101A,Web Development,Juan Dela Cruz,jdelacruz@ubaguio.edu,20260001,Ana Reyes,20260001@s.ubaguio.edu
SIT-101A,Web Development,Juan Dela Cruz,jdelacruz@ubaguio.edu,20260002,Ben Santos,20260002@s.ubaguio.edu
SIT-101A,Web Development,Juan Dela Cruz,jdelacruz@ubaguio.edu,20260003,Carla Mendoza,20260003@s.ubaguio.edu
SIT-101A,Web Development,Juan Dela Cruz,jdelacruz@ubaguio.edu,20260004,Daniel Flores,20260004@s.ubaguio.edu
SIT-101A,Web Development,Juan Dela Cruz,jdelacruz@ubaguio.edu,20260005,Ella Bautista,20260005@s.ubaguio.edu
SIT-102B,Database Systems,Juan Dela Cruz,jdelacruz@ubaguio.edu,20260001,Ana Reyes,20260001@s.ubaguio.edu
SIT-102B,Database Systems,Juan Dela Cruz,jdelacruz@ubaguio.edu,20260002,Ben Santos,20260002@s.ubaguio.edu
SIT-102B,Database Systems,Juan Dela Cruz,jdelacruz@ubaguio.edu,20260006,Felix Garcia,20260006@s.ubaguio.edu`;
export function Classes() {
  const { db, act } = useApp();
  const [f, setF] = useState({ code: '', subject: '', facultyId: '' });
  const [csv, setCsv] = useState('');
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [listDept, setListDept] = useState('');
  const [msg, setMsg] = useState('');
  const faculty = db.users.filter((u) => isTeacher(u) && u.active);
  const used = new Set(db.tasks.map((t) => t.sectionId).filter(Boolean));
  const [dept, setDept] = useState('');
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const qs = q.trim().toLowerCase();
  const listed = newestFirst(db.sections).filter((x) => (!dept || x.dept === dept)
    && (!kind || (kind === 'exempt') === isExemptSection(x))
    && (!qs || `${x.code} ${x.subject} ${userById(db, x.facultyId)?.name || ''}`.toLowerCase().includes(qs)));
  const { rows, bar } = usePages(listed, `${dept}|${kind}|${qs}`);
  return (
    <>
      <div className="note">Class lists and teaching loads come from the Registrar / ARC. Students evaluate the teacher of each class they are enrolled in. <b>Internship, practicum and field trip subjects are kept on the list but are not evaluated</b> (recognised from the subject name).</div>
      {msg && <div className="note">{msg}</div>}
      <Card title="Import a class list">
        <p className="muted">Choose the CSV file exported from the Registrar/ARC (or paste it below), one student per line:</p>
        <p><code>section code, subject, teacher name, teacher email, student ID, student name, student UB email</code></p>
        <p className="muted">Classes that don't exist yet are created. <b>Teachers and students who don't have an account yet get one automatically</b> in the department you choose. A student's first password is their <b>student ID</b>; a teacher's is the part of their email before the @ (for example <code>jdelacruz</code>). Everyone must change it when they first sign in. People who already have an account are just added to the class. Rows with a problem are listed and skipped.</p>
        <div className="row">
          <label className="inline">Department of this list
            <Select value={listDept} onChange={setListDept}><option value="">Choose…</option>{db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></label>
        </div>
        <div className="row">
          <label className="file-pick"><input type="file" accept=".csv,.txt,text/csv" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { setCsv(await file.text()); setOut(null); } e.target.value = ''; }} />Choose CSV file…</label>
          <a className="ghost-link" href={'data:text/csv;charset=utf-8,' + encodeURIComponent(SAMPLE_CLASS_LIST)} download="class-list-example.csv">Download an example file</a>
        </div>
        <textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={SAMPLE_CLASS_LIST} />
        <div className="row"><button disabled={busy || !csv.trim() || !listDept} title={listDept ? '' : 'Choose the department first'} onClick={async () => { setBusy(true); const r = await act('importClassList', { csv, dept: listDept }); setBusy(false); if (r) { setOut(r); if (!r.errorCount) setCsv(''); } }}>{busy ? 'Importing… (this can take a minute for big lists)' : 'Import class list'}</button>
          {csv.trim() && <span className="muted">{csv.trim().split(/\r?\n/).filter((l) => l.trim() && !/^\s*section/i.test(l)).length} row(s) ready</span>}</div>
        {out && <div className={`note ${out.errorCount ? 'warn' : 'ok'}`}>{out.created} class section(s) created, <b>{out.teachers || 0} teacher account(s)</b> and <b>{out.accounts || 0} student account(s) created</b>, {out.enrolled} enrolment(s) added.{(out.accounts > 0 || out.teachers > 0) && ' New students sign in with their UB email and their student ID as the password; new teachers with their UB email and the part before the @.'}{out.errorCount > 0 && <> {out.errorCount} row(s) skipped:<ul>{out.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></>}</div>}
      </Card>
      <Card title="Add a class section">
        <div className="row">
          <input placeholder="Section code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
          <input placeholder="Subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} className="wide" />
          <Select value={f.facultyId} onChange={(v) => setF({ ...f, facultyId: v })}><option value="">Teacher…</option>{faculty.map((u) => <option key={u.id} value={u.id}>{u.name} · {deptName(db, u.dept)}</option>)}</Select>
          <button onClick={async () => { setMsg(''); if (await act('createSection', f)) { setF({ code: '', subject: '', facultyId: '' }); setMsg('Section added. Enrol students under Accounts or by importing a class list.'); } }}>Add</button>
        </div>
      </Card>
      <Card title={`Class sections (${listed.length}${listed.length !== db.sections.length ? ` of ${db.sections.length}` : ''})`}>
        <div className="row">
          <Select value={dept} onChange={setDept}><option value="">All departments</option>{db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
          <Select value={kind} onChange={setKind}><option value="">Evaluated and not evaluated</option><option value="evaluated">Evaluated only</option><option value="exempt">Not evaluated (practicum, internship, field trip)</option></Select>
          <input placeholder="Search (optional)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {listed.length === 0 ? <Empty icon="list" title="No sections match">Change the filters above.</Empty> : <>
        <table>
          <thead><tr><th>Section</th><th>Subject</th><th>Teacher</th><th>Department</th><th>Students</th><th>Type of class (decides the form)</th><th>Evaluated?</th><th /></tr></thead>
          <tbody>{rows.map((s) => (
            <tr key={s.id}>
              <td>{s.code}</td><td>{s.subject}</td><td>{userById(db, s.facultyId)?.name}</td><td>{deptName(db, s.dept)}</td><td>{s.studentIds.length}</td>
              <td>{isExemptSection(s) ? <span className="muted">—</span> : (
                <Select value={s.classType || ''} onChange={(v) => act('setClassType', { sectionId: s.id, classType: v })} aria-label={`Type of class for ${s.code}`}>
                  {classTypesFor(userById(db, s.facultyId)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
              )}</td>
              <td>{isExemptSection(s) ? <Badge kind="muted">not evaluated</Badge> : <Badge kind="completed">yes</Badge>}</td>
              <td>{!used.has(s.id) && <button className="ghost" onClick={() => { if (confirm(`Delete section ${s.code}?`)) act('deleteSection', { sectionId: s.id }); }}>Delete</button>}</td>
            </tr>
          ))}</tbody>
        </table>
        {bar}
        </>}
      </Card>
    </>
  );
}

/** Pick a percentage (0, 5, 10 … 100) instead of typing it. Blank = not set. */
function PercentPicker({ value, onSave }) {
  const steps = Array.from({ length: 21 }, (_, i) => i * 5);
  const cur = value ?? '';
  return (
    <Select value={cur} onChange={(v) => String(v) !== String(cur) && onSave(v === '' ? null : Number(v))}>
      <option value="">not set</option>
      {cur !== '' && !steps.includes(Number(cur)) && <option value={cur}>{cur}%</option>}
      {steps.map((n) => <option key={n} value={n}>{n}%</option>)}
    </Select>
  );
}

/** Pick a category from a list; "+ New category…" asks for a name once. */
function CategoryPicker({ value, options, onSave }) {
  const cur = value && value !== 'General' ? value : '';
  return (
    <Select value={cur} onChange={(v) => {
      if (v !== '__new') return v !== cur && onSave(v);
      const n = window.prompt('Name of the new category, e.g. Assessment of Learners');
      if (n && n.trim()) onSave(n.trim());
    }}>
      <option value="">General</option>
      {options.filter((c) => c !== 'General').map((c) => <option key={c} value={c}>{c}</option>)}
      <option value="__new">+ New category…</option>
    </Select>
  );
}

/* ---------------- Dynamic forms (FR3, FR4, NFR9) ---------------- */
export function Forms() {
  const { db, act } = useApp();
  const [newCrit, setNewCrit] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [ttF, setTtF] = useState('');
  const forms = newestFirst(db.instruments.filter((i) => (showOld || i.active !== false) && (!ttF || i.targetType === ttF)));
  // start on the form most people answer: college faculty evaluated by students
  const [sel, setSel] = useState(() => (db.instruments.find((i) => i.active !== false && i.targetType === 'COLLEGE_FACULTY' && i.group === 'ST' && !i.dept && !i.variant) || forms[forms.length - 1])?.id);
  // every category name used on any form, so HR can pick one instead of typing it
  // (only forms in use: old and sample forms that were replaced don't add their categories)
  const allCats = [...new Set(db.instruments.filter((i) => i.active !== false || i.id === sel).flatMap((i) => [...i.items.map((it) => it.category), ...Object.keys(i.categories || {})]).filter(Boolean))].sort();
  const crit = usePages(newestFirst(db.criteria));
  const [nf, setNf] = useState({ targetType: 'COLLEGE_FACULTY', group: 'ST', dept: '', variant: '' });
  const [msg, setMsg] = useState('');
  const ins = db.instruments.find((i) => i.id === sel);
  const used = new Set(ins?.items.map((i) => i.criterionId));
  const groupsFor = (tt) => Object.keys(db.rules[tt] || {});
  const answered = new Set(db.tasks.filter((t) => t.response).flatMap((t) => Object.keys(t.response.answers)));
  const locked = ins && (ins.active === false || formUsed(db, ins));
  const cats = ins ? [...new Set(ins.items.map(itemCategory))] : [];
  const eff = ins ? effectiveWeights(ins) : {};
  const effTotal = Object.values(eff).reduce((a, w) => a + w, 0);
  // categories start closed so the page stays short; open one to work on its questions
  const [open, setOpen] = useState([]);
  const [find, setFind] = useState('');
  const q = find.trim().toLowerCase();
  const toggle = (c) => setOpen(open.includes(c) ? open.filter((x) => x !== c) : [...open, c]);
  const critText = (id) => db.criteria.find((c) => c.id === id)?.text || '';
  const catTotal = cats.reduce((a, c) => a + (Number(ins?.categories?.[c]) || 0), 0);
  useEffect(() => { setOpen([]); setFind(''); }, [sel]);
  const label = (i) => `${TARGET_TYPES[i.targetType]} ← ${GROUPS[i.group]}${i.variant ? ` · ${CLASS_TYPES[i.variant]}` : ''}${i.dept ? ` · ${deptName(db, i.dept)}` : ''} · v${i.version || 1}${i.active === false ? ' (old)' : ''}${i.name.includes('(UB tool)') ? ` · ${i.name.replace(' (UB tool)', '')}` : ''}`;

  return (
    <>
      {msg && <div className="note">{msg}</div>}
      <Card title="Evaluation forms" actions={<label className="inline muted"><input type="checkbox" checked={showOld} onChange={(e) => setShowOld(e.target.checked)} /> Show old versions</label>}>
        <div className="row">
          <Select value={ttF} onChange={(v) => { setTtF(v); const first = newestFirst(db.instruments.filter((i) => (showOld || i.active !== false) && (!v || i.targetType === v))).at(-1); if (first) setSel(first.id); }} aria-label="Who is evaluated"><option value="">Everyone evaluated</option>{Object.entries(TARGET_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          <Select value={sel} onChange={setSel} className="wide">{forms.map((i) => <option key={i.id} value={i.id}>{label(i)}</option>)}</Select>
          {ins && ins.active !== false && <button className="ghost" onClick={async () => { const r = await act('reviseForm', { instrumentId: ins.id }); if (r) { setSel(r.id); setMsg(`Version ${r.version} created. Edit it below; evaluations already submitted keep the old version.`); } }}>Create new version</button>}
        </div>
        {ins && (
          <>
            {locked
              ? <div className="note warn">{ins.active === false ? 'This is an old version, kept with the results that used it. It can\'t be changed.' : 'This form already has submitted evaluations, so it is locked to keep past results unchanged. Click "Create new version" to make changes.'}</div>
              : <p className="muted">Dropdown choices save as soon as you pick them; item weights save when you leave the box. Evaluations already submitted keep the weights they were submitted with.</p>}
            <div className="row">
              <input placeholder="Find a question on this form…" value={find} onChange={(e) => setFind(e.target.value)} className="wide" />
              <button className="ghost" onClick={() => setOpen(open.length === cats.length ? [] : cats)}>{open.length === cats.length ? 'Hide all questions' : 'Show all questions'}</button>
            </div>
            <table className="form-cats">
              <thead><tr><th>Category</th><th>Weight</th><th>Questions</th><th /></tr></thead>
              <tbody>
                {cats.map((c) => {
                  const items = ins.items.filter((it) => itemCategory(it) === c);
                  const shown = q ? items.filter((it) => critText(it.criterionId).toLowerCase().includes(q)) : items;
                  const isOpen = q ? shown.length > 0 : open.includes(c);
                  if (q && !shown.length) return null;
                  return [
                    <tr key={c} className={`cat-head ${isOpen ? 'on' : ''}`}>
                      <td><button className="link" onClick={() => toggle(c)}>{isOpen ? '▾' : '▸'} {c}</button></td>
                      <td>{locked ? <b>{ins.categories?.[c] != null ? `${ins.categories[c]}%` : '—'}</b> : <PercentPicker value={ins.categories?.[c]} onSave={(weight) => act('setFormCategoryWeight', { instrumentId: ins.id, category: c, weight })} />}</td>
                      <td>{q ? `${shown.length} of ${items.length}` : items.length}</td>
                      <td><button className="ghost" onClick={() => toggle(c)}>{isOpen ? 'Hide' : 'Show questions'}</button></td>
                    </tr>,
                    isOpen && (
                      <tr key={`${c}-q`} className="cat-body"><td colSpan={4}>
                        <ol className="form-qs">
                          {shown.map((it) => {
                            const cr = db.criteria.find((x) => x.id === it.criterionId);
                            return (
                              <li key={it.criterionId}>
                                <div className="form-q-text">{cr?.text}
                                  {cr?.levels && <div className="muted small">{cr.levels.map((l, k) => `${k + 1} = ${l}`).join(' · ')}</div>}
                                  <span className="muted small"> · counts {effTotal ? pct(eff[it.criterionId] / effTotal) : '—'} of the score</span>
                                </div>
                                {!locked && (
                                  <div className="form-q-tools">
                                    <label className="inline small muted">Move to <CategoryPicker value={it.category} options={allCats} onSave={(category) => act('setFormItemCategory', { instrumentId: ins.id, criterionId: it.criterionId, category })} /></label>
                                    <label className="inline small muted">Weight <SaveInput type="number" min="0" step="0.5" className="tiny" value={it.weight} onSave={(weight) => act('setFormItemWeight', { instrumentId: ins.id, criterionId: it.criterionId, weight })} /></label>
                                    <button className="ghost" onClick={() => act('removeFormItem', { instrumentId: ins.id, criterionId: it.criterionId })}>Remove</button>
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ol>
                        {!locked && !q && (
                          <Select value="" onChange={(v) => v && act('addFormItem', { instrumentId: ins.id, criterionId: v, category: c === 'General' ? '' : c })}>
                            <option value="">+ Add a question to "{c}"…</option>
                            {db.criteria.filter((x) => !used.has(x.id)).map((x) => <option key={x.id} value={x.id}>{x.text}</option>)}
                          </Select>
                        )}
                      </td></tr>
                    ),
                  ];
                })}
                <tr className="cat-total"><td>Total</td><td>{cats.some((c) => ins.categories?.[c] != null) ? <b>{catTotal}%</b> : <span className="muted">no category weights</span>} {catTotal !== 100 && cats.some((c) => ins.categories?.[c] != null) && <Badge kind="overdue">should be 100%</Badge>}</td><td>{ins.items.length}</td><td /></tr>
              </tbody>
            </table>
            {q && !cats.some((c) => ins.items.some((it) => itemCategory(it) === c && critText(it.criterionId).toLowerCase().includes(q))) && <p className="muted">No question on this form matches "{find}".</p>}
            <p className="muted small">Each category counts its weight of the score, shared equally by its questions (unless you change a question's weight). Click a category to see, move or remove its questions.</p>
            {!locked && (
              <Select value="" onChange={(v) => v && act('addFormItem', { instrumentId: ins.id, criterionId: v })}>
                <option value="">+ Add a question (no category)…</option>
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
          <Select value={nf.variant} onChange={(v) => setNf({ ...nf, variant: v })}>{Object.entries(CLASS_TYPES).map(([k, l]) => <option key={k} value={k}>{k ? `Only for: ${l}` : 'Any type of class'}</option>)}</Select>
          <button onClick={async () => { const r = await act('createForm', nf); if (r) setSel(r.id); }}>Create empty form</button>
        </div>
        <p className="muted">A department-specific form (e.g. for Nursing) is used for that department instead of the general one. A form for a type of class (e.g. laboratory) is used for the classes set to that type under Class lists.</p>
      </Card>
      <Card title="Criteria bank">
        <p className="muted">The criteria come from UB's evaluation tools. Criteria already answered in submitted evaluations can't be reworded or deleted, so past reports stay exactly as they were.</p>
        <div className="row"><input className="wide" placeholder="New criterion" value={newCrit} onChange={(e) => setNewCrit(e.target.value)} />
          <button onClick={async () => { if (newCrit.trim() && await act('addCriterion', { text: newCrit })) setNewCrit(''); }}>Add criterion</button></div>
        <table><tbody>
          {crit.rows.map((c) => (
            <tr key={c.id}>
              <td>{answered.has(c.id) ? <span>{c.text} <Badge kind="muted">used</Badge></span> : <SaveInput className="wide" value={c.text} onSave={(text) => act('renameCriterion', { criterionId: c.id, text })} />}</td>
              <td><button className="ghost" disabled={answered.has(c.id) || db.instruments.some((i) => i.items.some((it) => it.criterionId === c.id))} title="Remove from forms first" onClick={() => act('deleteCriterion', { criterionId: c.id })}>Delete</button></td>
            </tr>
          ))}
        </tbody></table>
        {crit.bar}
      </Card>
    </>
  );
}

/* ---------------- Weights (FR5, NFR8) ---------------- */
export function Weights() {
  const { db, act } = useApp();
  return (
    <Card title="Evaluator-group weights (%)">
      <p className="muted">From Table 6 of the manuscript: College faculty — Students 40, Dean 40, Program Chair 20; Basic Education — Students 40, Principal 20, Assistant Principal 20, Subject Head 20; non-teaching personnel are evaluated by one group (head ↔ staff); Clinical Instructors (CIs) — Students 50, Dean 50 until the official weights are given. Weights for evaluating Deans are not given, so HR must enter them. <b>Changes apply to open and future periods; closed periods keep the weights they were computed with.</b> If a group has no valid result, its weight is removed and the score is computed over the rest.</p>
      {Object.entries(db.rules).map(([tt, rule]) => {
        const total = Object.values(rule).reduce((a, w) => a + (Number(w) || 0), 0);
        return (
          <div key={tt}>
            <h4>{TARGET_TYPES[tt]} {total !== 100 && <Badge kind="overdue">total {total}% (should be 100%)</Badge>}</h4>
            <div className="row">
              {Object.keys(rule).map((g) => (
                <label key={g} className="inline">{GROUPS[g]}{' '}
                  <PercentPicker value={rule[g]} onSave={(weight) => act('setGroupWeight', { targetType: tt, group: g, weight })} />
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
            <ClassProgress title={deptOnly ? `Class progress – ${deptName(db, user.dept)}` : 'Class progress'} period={p} secs={secs.filter((s) => periodCovers(p, s.dept))} />
          </div>
        );
      })}
    </>
  );
}

/** Response rate of each class in a period, a page at a time; "below half + 1" classes can be shown alone. */
function ClassProgress({ title, period: p, secs }) {
  const { db } = useApp();
  const [only, setOnly] = useState('');
  const [dept, setDept] = useState('');
  const shown = secs.filter((s) => {
    if (dept && s.dept !== dept) return false;
    if (!only) return true;
    if (isExemptSection(s)) return false;
    const st = sectionStats(db, p.id, s.id);
    return only === 'low' ? st.required && st.belowHalf : st.required && !st.belowHalf;
  });
  const depts = db.departments.filter((d) => secs.some((s) => s.dept === d.id));
  const { rows, bar } = usePages(shown, `${only}|${dept}`);
  return (
            <Card title={`${title} (${shown.length})`}>
              <div className="row">
                <Select value={only} onChange={setOnly}><option value="">All classes</option><option value="low">Only classes below half + 1</option><option value="ok">Only classes with enough responses</option></Select>
                {depts.length > 1 && <Select value={dept} onChange={setDept}><option value="">All departments</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>}
              </div>
              <table>
                <thead><tr><th>Class</th><th>Faculty</th><th>Responded</th><th>Rate</th><th>Standing</th></tr></thead>
                <tbody>{rows.map((s) => {
                  if (isExemptSection(s)) return <tr key={s.id}><td>{s.code} – {s.subject}</td><td>{userById(db, s.facultyId)?.name}</td><td colSpan={2} className="muted">—</td><td><Badge kind="muted">not evaluated (practicum/internship/field trip)</Badge></td></tr>;
                  const st = sectionStats(db, p.id, s.id);
                  return <tr key={s.id}><td>{s.code} – {s.subject}</td><td>{userById(db, s.facultyId)?.name}</td><td><div className="meter-row"><Meter value={st.rate} mark={0.5} /><span>{st.responded}/{st.required} <span className="muted">needs {st.needed}</span></span></div></td><td>{pct(st.rate)}</td>
                    <td>{!st.required ? <span className="muted">no tasks yet</span> : st.belowHalf ? <Badge kind="overdue">below half + 1 – would be excluded</Badge> : <Badge kind="completed">enough responses</Badge>}</td></tr>;
                })}</tbody>
              </table>
              {shown.length === 0 && <Empty icon="list" title="No classes match" />}
              {bar}
            </Card>
  );
}

/* ---------------- Audit log (FR20, NFR7) ---------------- */
const AUDIT_LABEL = {
  view: 'Viewed results', releaseNext: 'Released results', withdrawRelease: 'Withdrew a release', approveRelease: 'Approved results (VP)',
  setGroupWeight: 'Changed a weight', closePeriod: 'Closed a period', reopenPeriod: 'Reopened a period', createPeriod: 'Created a period',
  submitEvaluation: 'Submitted an evaluation', recordResultRequest: 'Released results through a dean', signIn: 'Signed in', signOut: 'Signed out',
  automaticReminders: 'Automatic reminders', resetData: 'Reset all data', showTempPassword: 'Viewed a temporary password',
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
  const RESULT = new Set(['view', 'releaseNext', 'withdrawRelease', 'approveRelease', 'setGroupWeight', 'closePeriod', 'reopenPeriod', 'recordResultRequest', 'reviseForm', 'setFormItemWeight', 'setFormCategoryWeight', 'resetData']);
  const s = q.trim().toLowerCase();
  const list = (rows || []).filter((r) => (kind === 'all' || (kind === 'results' ? RESULT.has(r.action) : kind === r.action))
    && (!s || `${r.user_name} ${r.detail} ${r.action}`.toLowerCase().includes(s)));
  const page = usePages(list, `${kind}|${s}`);
  if (user.role !== 'HR') return null;
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
          <tbody>{page.rows.map((r) => (
            <tr key={r.id}><td>{new Date(r.at).toLocaleString()}</td><td>{r.user_name || 'System'}</td><td>{AUDIT_LABEL[r.action] || r.action}</td><td className="muted">{r.detail || '—'}</td></tr>
          ))}</tbody>
        </table>
      )}
      {page.bar}
      {rows && list.length === 0 && <Empty icon="list" title="No entries match" />}
    </Card>
  );
}
