import { useEffect, useState } from 'react';
import { useApp } from '../lib/store';
import {
  STAGES, STAGE_LABEL, taskStatus, userById, sectionStats, targetsOf, deptName, groupName,
  groupsOf, isExemptSection, isTeacher, pendingApprovals, periodCovers, CLASS_TYPES, approvalRuleText, policyFor, participationForecast,
  SEMESTERS, localDay, periodName, samePeriod, schoolYearNow,
} from '../lib/logic';

/** Types of class HR can pick for a section. A Clinical Instructor (Nursing) works in the clinical area or the skills lab. */
const classTypesFor = (teacher) => (teacher?.position === 'ci'
  ? [['', 'Clinical area (hospital, community clinic)'], ['skills', CLASS_TYPES.skills]]
  : Object.entries(CLASS_TYPES).filter(([k]) => k !== 'skills'));
import { QrButton } from './ClassQr';
import { Card, StatusBadge, RuleNote, PeriodPicker, Select, Badge, Meter, Empty, pct, newestFirst, usePages, useNavArgs, ask, ForecastBadge } from '../ui';

const scopeText = (db, p) => (p.depts?.length ? p.depts.map((d) => deptName(db, d)).join(', ') : 'All departments');

/* ----- choices for a new period, so HR picks instead of typing ----- */
const OPEN_FOR = [[7, '1 week'], [14, '2 weeks'], [21, '3 weeks'], [28, '4 weeks'], [42, '6 weeks']];
const isoIn = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return localDay(d); };
/** The first semester from this school year on that has no period yet. */
function nextTerm(db) {
  for (let year = schoolYearNow(); ; year++) for (const sem of [1, 2]) if (!samePeriod(db, periodName(year, sem))) return { year, sem };
}

/* ---------------- Evaluation periods + release (FR8, FR17) ---------------- */
export function Periods() {
  const { db, act } = useApp();
  const [pick, setPick] = useState(() => nextTerm(db));
  const [weeks, setWeeks] = useState(21);
  const [startDate, setStartDate] = useState(isoIn(0));
  const [deadline, setDeadline] = useState(isoIn(21));
  const [depts, setDepts] = useState([]);
  const [msg, setMsg] = useState('');
  const firstYear = schoolYearNow();
  const yearOk = Number.isInteger(pick.year) && pick.year >= firstYear && pick.year <= 9998;
  const name = periodName(pick.year, pick.sem);
  const exists = samePeriod(db, name, depts); // the same semester for other departments is fine
  const bad = !yearOk || exists || startDate > deadline;
  const add = async () => {
    if (bad) return;
    const r = await act('createPeriod', { name, startsOn: startDate, deadline, depts });
    if (r) {
      setDepts([]); setStartDate(isoIn(0)); setMsg(`${name} created.${r.started?.length ? ` The new rating formula starts with this period: ${r.started.join(', ')}.` : ''} ${r.newTools?.length ? ` New tool version(s) in use: ${r.newTools.join(', ')}.` : ''}${r.waitingTools?.length ? ` Still waiting, because another open period uses the old version: ${r.waitingTools.join(', ')}.` : ''} Go to Evaluation tasks and click "Create evaluation tasks".`);
      // suggest the following semester next time
      setPick(pick.sem === 1 ? { year: pick.year, sem: 2 } : { year: pick.year + 1, sem: 1 });
    }
  };
  const run = async (action, periodId, done) => { setMsg(''); const r = await act(action, { periodId }); if (r) setMsg(typeof done === 'function' ? done(r) : done || ''); };
  const toggle = (d) => setDepts((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]));
  return (
    <>
      <div className="note"><b>Use this page for the three main dates:</b> create the semester's period, close it after the deadline, then send results to the VPs and release them to faculty.</div>
      <RuleNote />
      {msg && <div className="note">{msg}</div>}
      <Card title="Evaluation periods">
        <table>
          <thead><tr><th>Period</th><th>Covers</th><th>Starts</th><th>Deadline</th><th>Status</th><th>Release</th><th>Actions</th></tr></thead>
          <tbody>
            {newestFirst(db.periods).map((p) => {
              const nextStage = STAGES[STAGES.indexOf(p.releaseStage) + 1];
              const waiting = p.releaseStage === 'dir' ? pendingApprovals(db, p) : [];
              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="muted">{scopeText(db, p)}</td>
                  <td>{p.startDate || '—'}</td>
                  <td><input type="date" value={p.deadline} onChange={(e) => e.target.value && act('setPeriodDeadline', { periodId: p.id, deadline: e.target.value })} /></td>
                  <td><Badge kind={p.status === 'open' ? 'pending' : 'completed'}>{p.status}</Badge></td>
                  <td>{STAGE_LABEL[p.releaseStage]}{p.releaseStage === 'dir' && <><br /><span className="muted">{waiting.length ? `Waiting for approval (${approvalRuleText(db, p)}): ${waiting.map((u) => u.name).join(', ')}` : 'Enough VPs approved'}</span></>}
                    {p.rejections?.length > 0 && p.releaseStage === 'hr' && <><br /><Badge kind="overdue">returned by {p.rejections.at(-1).name}</Badge> <span className="muted small">"{p.rejections.at(-1).reason}"</span></>}
                    <br /><span className="muted small">Rules: {policyFor(db, p.id).version ? `version ${policyFor(db, p.id).version}` : "UB's starting rules"}{p.status === 'open' ? ' (changes apply)' : ' (locked)'}</span></td>
                  <td className="row">
                    {p.status === 'open' && <button onClick={async () => { if (await ask(`Close ${p.name}?`, 'Classes where fewer than half of the class plus one answered will be excluded, and everyone concerned is notified.', { ok: 'Close period' })) run('closePeriod', p.id, (r) => `${p.name} closed. ${r.flagged} class(es) were excluded (below half + 1); the faculty, department heads and HR were notified.`); }}>Close period</button>}
                    {p.status === 'open' && <button className="ghost" onClick={async () => (await ask('Send participation alerts?', 'Teachers and department heads of classes below half + 1 are notified now.', { ok: 'Send alerts' })) && run('checkThreshold', p.id, (r) => (r.flagged ? `${r.flagged} class(es) are at or below half. The faculty, their department heads and HR were notified.` : 'Every class has enough responses so far.'))}>Send participation alerts</button>}
                    {p.status === 'closed' && p.releaseStage === 'hr' && <button className="ghost" onClick={async () => (await ask(`Reopen ${p.name}?`, 'Evaluators can answer again until you close it.', { ok: 'Reopen' })) && run('reopenPeriod', p.id)}>Reopen</button>}
                    {nextStage && p.status === 'closed' && nextStage === 'dir' && <button onClick={async () => (await ask('Send results to the VPs?', `The results of ${p.name} go to the VPs for review and approval. They will be notified.`, { ok: 'Send to VPs' })) && run('releaseNext', p.id, 'Results sent to the VPs for review and approval. They were notified.')}>Send to VPs for approval</button>}
                    {nextStage === 'faculty' && <button disabled={waiting.length > 0} title={waiting.length ? 'Every VP must approve first' : ''} onClick={async () => (await ask('Release results to faculty?', `Every person will see their own results for ${p.name} and be notified.`, { ok: 'Release to faculty' })) && run('releaseNext', p.id, 'Results released to faculty. Each person was notified.')}>Release to faculty</button>}
                    {p.status === 'open' && <span className="muted">release after closing</span>}
                    {p.releaseStage !== 'hr' && <button className="ghost" onClick={async () => (await ask('Withdraw the last release step?', `The people who could see the results of ${p.name} will no longer see them.`, { ok: 'Withdraw', danger: true })) && run('withdrawRelease', p.id)}>Withdraw one step</button>}
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
            <span className="year-pick">
              <button type="button" className="ghost" aria-label="Earlier school year" disabled={pick.year <= firstYear} onClick={() => setPick({ ...pick, year: Math.max(firstYear, pick.year - 1) })}>−</button>
              <input type="number" min={firstYear} step="1" aria-label="School year starts in" value={pick.year} onChange={(e) => setPick({ ...pick, year: e.target.value === '' ? '' : Number(e.target.value) })} />
              <span>–</span><b>{yearOk ? pick.year + 1 : '…'}</b>
              <button type="button" className="ghost" aria-label="Later school year" onClick={() => setPick({ ...pick, year: (yearOk ? pick.year : firstYear - 1) + 1 })}>+</button>
            </span></label>
          <label className="inline">Semester
            <Select value={pick.sem} onChange={(v) => setPick({ ...pick, sem: Number(v) })}>{SEMESTERS.map((t, i) => <option key={t} value={i + 1}>{t}{yearOk && samePeriod(db, periodName(pick.year, i + 1), depts) ? ' (already created)' : ''}</option>)}</Select></label>
          <label className="inline">Open for
            <Select value={weeks} onChange={(v) => { const n = Number(v); setWeeks(n); if (n) setDeadline(isoIn(n)); }}>
              {OPEN_FOR.map(([d, l]) => <option key={d} value={d}>{l}</option>)}
              {!OPEN_FOR.some(([d]) => d === weeks) && <option value={weeks}>chosen date</option>}
            </Select></label>
          <label className="inline">Starts on <input type="date" value={startDate} onChange={(e) => e.target.value && setStartDate(e.target.value)} /></label>
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
        <p className={bad ? 'note warn' : 'muted'}>{!yearOk ? `Type a school year from ${firstYear} on.` : exists ? <><b>{exists.name}</b> already exists for {exists.depts?.length ? exists.depts.map((d) => deptName(db, d)).join(', ') : 'all departments'}. Pick another semester, school year or department.</> : startDate > deadline ? 'The start date must be on or before the deadline.' : <>This will create <b>{name}</b> for <b>{depts.length ? depts.map((d) => deptName(db, d)).join(', ') : 'all departments'}</b>, starting <b>{new Date(startDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</b> and open until <b>{new Date(deadline + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</b>.</>}</p>
        <div className="row"><button onClick={add} disabled={!!bad}>Create {yearOk ? name : 'period'}</button></div>
        <p className="muted">You can open and close evaluations for one department at a time by creating a period for just that department. The current evaluator weights are saved with the period.</p>
      </Card>
      <details className="card advanced-panel">
        <summary><b>Reset or replace data</b> <span className="muted">· Advanced. These actions can permanently remove information.</span></summary>
        <div className="advanced-content">
        <div className="row">
          <button className="danger" onClick={async () => {
            if (!(await ask('Start from scratch?', 'This deletes every account except HR, and all classes, evaluation periods, evaluations, results, notifications and imported records. Departments go back to the University of Baguio list.\n\nThe evaluation forms, questions and weights are kept. This cannot be undone.', { ok: 'Delete everything', danger: true }))) return;
            if (!(await ask('Are you really sure?', 'Everything except the HR accounts, the UB departments and the forms will be gone.', { ok: 'Yes, start from scratch', danger: true }))) return;
            const r = await act('startFromScratch');
            if (r) setMsg(`Done. ${r.removed} account(s) and all records were deleted. Next: add the accounts under Accounts (the UB departments are ready), then your class lists, then create an evaluation period.`);
          }}>Start from scratch (keep only HR)</button>
          <button className="ghost" onClick={async () => { if (await ask('Load the sample data?', 'ALL data is replaced with the sample (demo) data. Everything you entered is replaced.', { ok: 'Replace with sample data', danger: true }) && await act('resetData')) setMsg('All data was replaced with the sample data.'); }}>Load sample data</button>
        </div>
        <p className="muted"><b>Start from scratch</b> empties the system for real use: only HR accounts stay, with their passwords, plus the UB departments and the evaluation forms, questions and weights, so you don't have to build them again. <b>Load sample data</b> brings back the demo accounts (password demo1234). The audit log is never erased.</p>
        </div>
      </details>
    </>
  );
}

/* ---------------- Assignments / workflow (FR6, FR7, FR9, FR10) ---------------- */
export function Assignments() {
  const { db, act } = useApp();
  const args = useNavArgs();
  const [pidSel, setPid] = useState(args.periodId || db.periods[db.periods.length - 1]?.id);
  // the chosen period, or the newest one if none is chosen yet (or it was deleted)
  const pid = db.periods.some((p) => p.id === pidSel) ? pidSel : db.periods[db.periods.length - 1]?.id;
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [grp, setGrp] = useState('');
  const [st, setSt] = useState('');
  const [add, setAdd] = useState({ evaluatorId: '', targetId: '' });
  const tasks = db.tasks.filter((t) => t.periodId === pid);
  const evaluators = db.users.filter((u) => u.role !== 'ST' && groupsOf(db, u).length);
  const summary = {};
  tasks.forEach((t) => { const k = t.group; summary[k] ||= { pending: 0, completed: 0, overdue: 0 }; summary[k][taskStatus(db, t)]++; });
  const s = q.trim().toLowerCase();
  const match = (t) => !s || userById(db, t.evaluatorId)?.name.toLowerCase().includes(s) || userById(db, t.targetId)?.name.toLowerCase().includes(s);
  const listed = newestFirst(tasks).filter((t) => (!grp || t.group === grp) && (!st || taskStatus(db, t) === st) && match(t));
  const { rows, bar } = usePages(listed, `${pid}|${s}|${grp}|${st}`);
  if (!db.periods.length) return <Card><Empty icon="calendar" title="No evaluation period yet">Create one under Dates &amp; release first.</Empty></Card>;

  const addOne = async () => {
    setMsg('');
    if (!add.evaluatorId || !add.targetId) return setMsg('Choose an evaluator and a person to evaluate.');
    if (await act('addAssignment', { periodId: pid, ...add })) setMsg('Assignment added.');
  };

  return (
    <>
      <Card title="Start and follow evaluations" actions={<PeriodPicker periods={db.periods} value={pid} onChange={setPid} />}>
        {msg && <div className="note">{msg}</div>}
        <div className="row">
          <button onClick={async () => { const r = await act('generateTasks', { periodId: pid }); if (r) setMsg(`${r.added} evaluation(s) prepared from the class lists and staff roles.${r.skippedNoForm ? ` ${r.skippedNoForm} skipped because no form exists.` : ''} Internship, practicum and field trip subjects were skipped.`); }}>Create evaluation tasks</button>
          <button className="ghost" onClick={async () => { const r = await act('sendReminders', { periodId: pid }); if (r) setMsg(`Reminders sent to ${r.sent} evaluator(s) with unfinished evaluations. Their department heads and HR were alerted too.`); }}>Send reminders now</button>
        </div>
        <p className="muted"><b>Do this after creating a term and importing its class lists.</b> evalU uses the lists and staff roles to prepare who evaluates whom. You can click again after updating a class list; only new evaluations are added.</p>
        <p className="muted">Reminders are also sent automatically once a day during the last 7 days before the deadline, and every day after it until the period is closed.</p>
        <table>
          <thead><tr><th>Evaluator group</th><th>Pending</th><th>Completed</th><th>Overdue</th></tr></thead>
          <tbody>{Object.entries(summary).map(([g, x]) => <tr key={g}><td>{groupName(db, g)}</td><td>{x.pending}</td><td>{x.completed}</td><td>{x.overdue}</td></tr>)}</tbody>
        </table>
      </Card>
      <details className="card advanced-panel">
        <summary><b>Manage individual evaluations</b> <span className="muted">· For fixing a one-off assignment or finding a specific task.</span></summary>
        <div className="advanced-content">
        <Card title="Add an evaluator assignment">
          <div className="row">
            <Select value={add.evaluatorId} onChange={(v) => setAdd({ ...add, evaluatorId: v })}><option value="">Evaluator…</option>{evaluators.map((u) => <option key={u.id} value={u.id}>{u.name} ({groupsOf(db, u).map((g) => groupName(db, g)).join(' / ')})</option>)}</Select>
            <Select value={add.targetId} onChange={(v) => setAdd({ ...add, targetId: v })}><option value="">Evaluates…</option>{targetsOf(db).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
            <button onClick={addOne}>Add</button>
          </div>
        </Card>
        <Card title={`All individual evaluations (${listed.length})`}>
        <div className="row">
          <Select value={grp} onChange={setGrp}><option value="">All evaluator groups</option>{Object.keys(summary).map((g) => <option key={g} value={g}>{groupName(db, g)}</option>)}</Select>
          <Select value={st} onChange={setSt}><option value="">Any status</option><option value="pending">Pending</option><option value="completed">Completed</option><option value="overdue">Overdue</option></Select>
          <input placeholder="Search a name (optional)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {listed.length === 0 ? <Empty icon="list" title={tasks.length ? 'No tasks match' : 'No tasks yet'}>{tasks.length ? 'Change the filters above.' : 'Click "Create evaluation tasks" above.'}</Empty> : <>
        <table>
          <thead><tr><th>Evaluator</th><th>As</th><th>Evaluates</th><th>Class</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>{userById(db, t.evaluatorId).name}</td><td>{groupName(db, t.group)}</td><td>{userById(db, t.targetId).name}</td>
                <td>{db.sections.find((x) => x.id === t.sectionId)?.code || '—'}</td><td><StatusBadge s={taskStatus(db, t)} /></td>
                <td>{!t.response && <button className="ghost" onClick={async () => (await ask('Remove this task?', `${userById(db, t.evaluatorId).name} will no longer evaluate ${userById(db, t.targetId).name} in this period.`, { ok: 'Remove task', danger: true })) && act('removeTask', { taskId: t.id })}>Remove</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {bar}
        </>}
        </Card>
        </div>
      </details>
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
      <div className="note"><b>Most common action: import a class list.</b> Choose the department, check the file, then import it. Students are enrolled in those classes; internship, practicum, and field trip subjects are not evaluated.</div>
      {msg && <div className="note">{msg}</div>}
      <Card title="Import a class list">
        <p className="muted">Choose the class list file from the Registrar/ARC, or paste it below. It must be a CSV file (in Excel: <b>File → Save As → CSV</b>). One student per line, in this order:</p>
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
        <textarea rows={6} value={csv} onChange={(e) => { setCsv(e.target.value); setOut(null); }} placeholder={SAMPLE_CLASS_LIST} />
        <div className="row">
          {/* step 1: check the file (nothing is saved); step 2: import */}
          <button className="ghost" disabled={busy || !csv.trim() || !listDept} title={listDept ? '' : 'Choose the department first'} onClick={async () => { setBusy(true); const r = await act('importClassList', { csv, dept: listDept, preview: true }); setBusy(false); if (r) setOut(r); }}>1. Check file</button>
          <button disabled={busy || !csv.trim() || !listDept || !out?.preview} title={out?.preview ? '' : 'Check the file first'} onClick={async () => { if (out.errorCount && !(await ask('Import with problem rows?', `${out.errorCount} row(s) have a problem and will be skipped. The other rows are imported.`, { ok: 'Import the good rows' }))) return; setBusy(true); const r = await act('importClassList', { csv, dept: listDept }); setBusy(false); if (r) { setOut(r); if (!r.errorCount) setCsv(''); } }}>{busy ? 'Working… (big lists can take a minute)' : '2. Import class list'}</button>
          {csv.trim() && <span className="muted">{csv.trim().split(/\r?\n/).filter((l) => l.trim() && !/^\s*section/i.test(l)).length} row(s) in the file</span>}</div>
        {out?.preview && (
          <div className={`note ${out.errorCount ? 'warn' : 'ok'}`}>
            <b>Check result (nothing saved yet):</b> {out.rows} row(s) read. Importing would create <b>{out.created} class(es)</b>, <b>{out.accounts} new student account(s)</b>{out.teachers ? <>, <b>{out.teachers} new teacher account(s)</b></> : ''}, add <b>{out.enrolled} enrolment(s)</b> and use <b>{out.existingStudents}</b> student(s) who already have an account.
            {out.duplicates > 0 && <> <b>{out.duplicates} duplicate row(s)</b> are counted once.</>}
            {out.errorCount > 0 ? <> <b>{out.errorCount} row(s) have a problem</b> and would be skipped:</> : ' No problems found.'}
            {(out.errors.length > 0 || out.warnings?.length > 0) && <ul>{out.errors.map((e, i) => <li key={'e' + i}>{e}</li>)}{out.warnings.map((w, i) => <li key={'w' + i} className="muted">{w}</li>)}</ul>}
            {out.newClasses?.length > 0 && <div className="small muted">New classes: {out.newClasses.join('; ')}</div>}
          </div>
        )}
        {out && !out.preview && <div className={`note ${out.errorCount ? 'warn' : 'ok'}`}><b>Imported.</b> {out.created} class section(s) created, <b>{out.teachers || 0} teacher account(s)</b> and <b>{out.accounts || 0} student account(s) created</b>, {out.enrolled} enrolment(s) added{out.duplicates ? `, ${out.duplicates} duplicate row(s) counted once` : ''}.{(out.accounts > 0 || out.teachers > 0) && ' New students sign in with their UB email and their student ID as the password; new teachers with their UB email and the part before the @.'}{out.errorCount > 0 && <> {out.errorCount} row(s) skipped:<ul>{out.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></>}</div>}
      </Card>
      <Card title="Add a class section">
        <div className="row">
          <input placeholder="Section code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
          <input placeholder="Subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} className="wide" />
          <Select value={f.facultyId} onChange={(v) => setF({ ...f, facultyId: v })}><option value="">Teacher…</option>{faculty.map((u) => <option key={u.id} value={u.id}>{u.name} · {deptName(db, u.dept)}</option>)}</Select>
          <button onClick={async () => { setMsg(''); if (await act('createSection', f)) { setF({ code: '', subject: '', facultyId: '' }); setMsg('Section added. Enrol students under Accounts or by importing a class list.'); } }}>Add</button>
        </div>
      </Card>
      <Card title={`Class sections (${listed.length}${listed.length !== db.sections.length ? ` of ${db.sections.length}` : ''})`} actions={<QrButton sections={listed.filter((x) => !isExemptSection(x))} label="QR codes for these classes" />}>
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
              <td><QrButton sections={[s]} />{!used.has(s.id) && <button className="ghost" onClick={async () => { if (await ask(`Delete section ${s.code}?`, `${s.code} · ${s.subject} and its class list will be removed.`, { ok: 'Delete section', danger: true })) act('deleteSection', { sectionId: s.id }); }}>Delete</button>}</td>
            </tr>
          ))}</tbody>
        </table>
        {bar}
        </>}
      </Card>
    </>
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
            <EarlyWarning period={p} secs={secs.filter((s) => periodCovers(p, s.dept))} />
            <ClassProgress title={deptOnly ? `Class progress – ${deptName(db, user.dept)}` : 'Class progress'} period={p} secs={secs.filter((s) => periodCovers(p, s.dept))} />
          </div>
        );
      })}
    </>
  );
}

/** Participation forecast summary: how many classes may not reach half + 1 by the deadline at their current pace. */
function EarlyWarning({ period: p, secs }) {
  const { db } = useApp();
  const fcs = secs.map((s) => participationForecast(db, p.id, s.id)).filter(Boolean);
  if (!fcs.length) return null;
  const risk = fcs.filter((f) => f.status === 'at-risk').length, track = fcs.filter((f) => f.status === 'on-track').length;
  const by = new Date(p.deadline + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  return (
    <div className={`note ${risk ? 'warn' : 'ok'}`}>
      <b>Forecast for {by}:</b> {risk ? `${risk} class${risk > 1 ? 'es' : ''} may not reach half + 1 at the current pace` : 'every class is on track or already has enough answers'}{track ? ` · ${track} on track` : ''} · {fcs.filter((f) => f.status === 'reached').length} already have enough.
      {risk > 0 && ' Teachers and department heads of the classes at risk were warned. Choose "Only classes at risk" below to see them.'}
      <details className="source"><summary>How the forecast works</summary><p>Pace = answers so far ÷ days since the period opened. Expected by the deadline = answers so far + pace × days left. A class is "at risk" when that is below half of the class plus one. The first 2 days are too early to tell. It assumes students keep answering at the same pace; reminders and class time with the QR code usually raise it.</p></details>
    </div>
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
    if (only === 'risk') return participationForecast(db, p.id, s.id)?.status === 'at-risk';
    const st = sectionStats(db, p.id, s.id);
    return only === 'low' ? st.required && st.belowHalf : st.required && !st.belowHalf;
  });
  const depts = db.departments.filter((d) => secs.some((s) => s.dept === d.id));
  const { rows, bar } = usePages(shown, `${only}|${dept}`);
  return (
            <Card title={`${title} (${shown.length})`}>
              <div className="row">
                <Select value={only} onChange={setOnly}><option value="">All classes</option><option value="low">Only classes below half + 1</option><option value="ok">Only classes with enough responses</option><option value="risk">Only classes at risk (forecast)</option></Select>
                {depts.length > 1 && <Select value={dept} onChange={setDept}><option value="">All departments</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>}
              </div>
              <table>
                <thead><tr><th>Class</th><th>Faculty</th><th>Responded</th><th>Rate</th><th>Standing</th><th>Forecast by {new Date(p.deadline + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</th></tr></thead>
                <tbody>{rows.map((s) => {
                  if (isExemptSection(s)) return <tr key={s.id}><td>{s.code} – {s.subject}</td><td>{userById(db, s.facultyId)?.name}</td><td colSpan={2} className="muted">—</td><td><Badge kind="muted">not evaluated (practicum/internship/field trip)</Badge></td><td /></tr>;
                  const st = sectionStats(db, p.id, s.id);
                  return <tr key={s.id}><td>{s.code} – {s.subject}</td><td>{userById(db, s.facultyId)?.name}</td><td><div className="meter-row"><Meter value={st.rate} mark={0.5} /><span>{st.responded}/{st.required} <span className="muted">needs {st.needed}</span></span></div></td><td>{pct(st.rate)}</td>
                    <td>{!st.required ? <span className="muted">no tasks yet</span> : st.belowHalf ? <Badge kind="overdue">below half + 1 – would be excluded</Badge> : <Badge kind="completed">enough responses</Badge>}</td>
                    <td><ForecastBadge fc={participationForecast(db, p.id, s.id)} deadline={p.deadline} /></td></tr>;
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
  setPolicy: 'Changed the evaluation policy', saveFormulaDraft: 'Saved a formula draft', submitFormula: 'Submitted a formula for approval', approveFormula: 'Approved a formula (VP)', rejectFormula: 'Returned a formula (VP)', activateFormula: 'Activated a formula', createPlan: 'Made a development plan', updatePlan: 'Changed a development plan', acknowledgePlan: 'Read a development plan', closePlan: 'Closed a development plan', deleteFormulaDraft: 'Deleted a formula draft', returnToHR: 'Returned results to HR (VP)', verifyAudit: 'Checked the audit log', importClassList: 'Imported a class list',
};
export function AuditLog() {
  const { user } = useApp();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [kind, setKind] = useState('results');
  const [q, setQ] = useState('');
  const [check, setCheck] = useState(null);
  // tamper check: recompute the hash chain on the server
  const verify = async () => {
    setCheck({ busy: true });
    try { const r = await fetch('/api/audit/verify', { credentials: 'same-origin' }); setCheck(await r.json()); load(); } catch { setCheck({ error: "Can't reach the server." }); }
  };
  // CSV for the records (opens in Excel)
  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['When', 'Who', 'Action', 'Details', 'Hash'], ...list.map((r) => [r.at, r.user_name || 'System', AUDIT_LABEL[r.action] || r.action, r.detail || '', r.hash || ''])].map((x) => x.map(esc).join(','));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv' }));
    a.download = `evalU-audit-log-${localDay()}.csv`; a.click();
  };
  const load = async () => {
    setErr('');
    try {
      const r = await fetch('/api/audit', { credentials: 'same-origin' });
      const d = await r.json();
      if (r.ok) setRows(d.entries); else setErr(d.error || 'Could not load the audit log.');
    } catch { setErr("Can't reach the server."); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps, react/set-state-in-effect
  const RESULT = new Set(['view', 'releaseNext', 'withdrawRelease', 'approveRelease', 'returnToHR', 'setPolicy', 'verifyAudit', 'saveFormulaDraft', 'submitFormula', 'approveFormula', 'rejectFormula', 'activateFormula', 'deleteFormulaDraft', 'setGroupWeight', 'closePeriod', 'reopenPeriod', 'recordResultRequest', 'reviseForm', 'setFormItemWeight', 'setFormCategoryWeight', 'resetData']);
  const s = q.trim().toLowerCase();
  const list = (rows || []).filter((r) => (kind === 'all' || (kind === 'results' ? RESULT.has(r.action) : kind === r.action))
    && (!s || `${r.user_name} ${r.detail} ${r.action}`.toLowerCase().includes(s)));
  const page = usePages(list, `${kind}|${s}`);
  if (user.role !== 'HR') return null;
  return (
    <Card title="Audit log" actions={<span className="row" style={{ margin: 0 }}><button className="ghost" onClick={exportCsv} disabled={!list.length}>Download for Excel</button><button className="ghost" onClick={load}>Refresh</button><button onClick={verify}>Check for tampering</button></span>}>
      <p className="muted">Every view, change and release of results is recorded: who did it, when, and the old and new value when a rule changes. The log is sealed. If someone edits or deletes an entry directly in the database, <b>Check for tampering</b> shows where.</p>
      <details className="source"><summary>How the seal works</summary><p>Each entry is sealed with a SHA-256 hash that includes the previous entry's hash (a hash chain), so changing or deleting any entry breaks every seal after it. "Check for tampering" recomputes the whole chain.</p></details>
      {check?.busy && <div className="note">Checking every entry…</div>}
      {check?.ok === true && <div className="note ok"><b>No tampering.</b> All {check.checked} entries are exactly as they were recorded.</div>}
      {check?.ok === false && <div className="note warn"><b>Tampering detected</b> at entry #{check.firstBad.id} ({new Date(check.firstBad.at).toLocaleString()}): {check.firstBad.reason}. {check.checked - 1} entries before it are intact.</div>}
      {check?.error && <div className="note warn">{check.error}</div>}
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
