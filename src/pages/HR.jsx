import { useEffect, useState } from 'react';
import { useApp } from '../lib/store';
import {
  STAGES, STAGE_LABEL, taskStatus, userById, periodById, sectionStats, targetsOf, deptName, groupName,
  groupsOf, isExemptSection, isTeacher, pendingApprovals, periodCovers, CLASS_TYPES, approvalRuleText, plural, policyFor, currentPolicy, activeDepts, schoolDepts, hasRule, ruleWords, ruleMark, participationForecast,
  SEMESTERS, closesAt, exemptPattern, exemptWords, saysExempt, deadlinePassed, deptsToConfirm, inTerm, isPastClass, nextTermOf, notStarted, suggestClassType, termLabel, workingTerm, localDay, periodName, samePeriod, schoolYearNow,
} from '../lib/logic';

/** Types of class HR can pick for a section. A Clinical Instructor (Nursing) works in the clinical area or the skills lab. */
const classTypesFor = (teacher) => (teacher?.position === 'ci'
  ? [['', 'Clinical area (hospital, community clinic)'], ['skills', CLASS_TYPES.skills]]
  : Object.entries(CLASS_TYPES).filter(([k]) => k !== 'skills'));
import { QrButton } from './ClassQr';
import { Card, StatusBadge, RuleNote, PeriodPicker, Select, Badge, Meter, Empty, pct, newestFirst, usePages, useNavArgs, useTab, Tabs, Screen, ask, ForecastBadge } from '../ui';

const scopeText = (db, p) => (p.depts?.length ? p.depts.map((d) => deptName(db, d)).join(', ') : 'All departments');

/* ----- choices for a new period, so HR picks instead of typing ----- */
const OPEN_FOR = [[7, '1 week'], [14, '2 weeks'], [21, '3 weeks'], [28, '4 weeks'], [42, '6 weeks']];
const longDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const plusDays = (d, n) => { const x = new Date(`${d}T00:00:00`); x.setDate(x.getDate() + n); return localDay(x); };
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
  const tabs = [['list', 'Evaluation periods'], ['new', 'New period'], ['reset', 'Reset data']];
  const [tab, setTab] = useTab(tabs, db.periods.length ? 'list' : 'new');
  const [moving, setMoving] = useState(null); // { id, date, reopen }: the period whose deadline is being changed
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
      setTab('list'); setDepts([]); setStartDate(isoIn(0)); setMsg(`${name} created.${r.started?.length ? ` The new rating formula starts with this period: ${r.started.join(', ')}.` : ''} ${r.newTools?.length ? ` New tool version(s) in use: ${r.newTools.join(', ')}.` : ''}${r.waitingTools?.length ? ` Still waiting, because another open period uses the old version: ${r.waitingTools.join(', ')}.` : ''} ${startDate > isoIn(0) ? `It opens by itself on ${longDate(startDate)}, and its evaluations are created then.` : `${r.evaluations?.added || 0} evaluation(s) were created by themselves.`}`);
      // suggest the following semester next time
      setPick(pick.sem === 1 ? { year: pick.year, sem: 2 } : { year: pick.year + 1, sem: 1 });
    }
  };
  const run = async (action, periodId, done) => { setMsg(''); const r = await act(action, { periodId }); if (r) setMsg(typeof done === 'function' ? done(r) : done || ''); };
  const toggle = (d) => setDepts((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]));
  const moved = moving && db.periods.find((x) => x.id === moving.id);
  if (moved) {
    const p = moved;
    const go = async () => { if (await act(moving.reopen ? 'reopenPeriod' : 'setPeriodDeadline', { periodId: p.id, deadline: moving.date })) { setMsg(`${p.name} is open until ${longDate(moving.date)}.`); setMoving(null); } };
    return (
      <Screen title={`${moving.reopen ? 'Reopen' : 'Extend or change the deadline of'} ${p.name}`} backTo="All evaluation periods" onBack={() => setMoving(null)}>
        <div className="row">
          {[[3, '+3 days'], [7, '+1 week'], [14, '+2 weeks']].map(([n, l]) => <button key={n} className="ghost" onClick={() => setMoving({ ...moving, date: plusDays(moving.reopen || deadlinePassed(p) ? isoIn(0) : p.deadline, n) })}>{l}</button>)}
          <label className="inline">New deadline <input type="date" aria-label="New deadline" value={moving.date} onChange={(e) => e.target.value && setMoving({ ...moving, date: e.target.value })} /></label>
        </div>
        <p className="muted small">{moving.reopen ? 'People who have not answered can answer again.' : 'People who still have evaluations are told when they get more time.'} It closes by itself 24 hours after the deadline.</p>
        <div className="row"><button disabled={moving.reopen && moving.date < isoIn(0)} onClick={go}>{moving.reopen ? 'Reopen' : 'Save the deadline'}</button><button className="ghost" onClick={() => setMoving(null)}>Cancel</button></div>
      </Screen>
    );
  }
  return (
    <>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {msg && <div className="note">{msg}</div>}
      {tab === 'list' && <>
      <div className="note"><b>Use this page for the three main dates:</b> create the semester's period, extend its deadline if people need more time, then send the results to the VPs and release them to faculty. A period opens on its start date and closes by itself 24 hours after its deadline.</div>
      <RuleNote policy={db.periods.some((p) => p.status === 'open') ? policyFor(db, db.periods.findLast((p) => p.status === 'open').id) : currentPolicy(db)} />
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
                  <td>{longDate(p.deadline)}
                    {p.status === 'open' && <div className="muted small">{notStarted(p) ? `Opens by itself on ${longDate(p.startDate)}` : `Closes by itself on ${new Date(closesAt(p)).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}</div>}
                    {p.status === 'open' && <button className="ghost" onClick={() => setMoving({ id: p.id, date: plusDays(p.deadline, 3), reopen: false })}>Extend or change</button>}</td>
                  <td><Badge kind={p.status === 'open' ? 'pending' : 'completed'}>{p.status === 'open' && notStarted(p) ? 'not started' : p.status}</Badge>{p.status === 'closed' && p.auto?.closedBy && <div className="muted small">closed by itself</div>}</td>
                  <td>{STAGE_LABEL[p.releaseStage]}{p.releaseStage === 'dir' && <><br /><span className="muted">{waiting.length ? `Waiting for approval (${approvalRuleText(db, p)}): ${waiting.map((u) => u.name).join(', ')}` : 'Enough VPs approved'}</span></>}
                    {p.rejections?.length > 0 && p.releaseStage === 'hr' && <><br /><Badge kind="overdue">returned by {p.rejections.at(-1).name}</Badge> <span className="muted small">"{p.rejections.at(-1).reason}"</span></>}
                    <br /><span className="muted small">Rules: {policyFor(db, p.id).version ? `version ${policyFor(db, p.id).version}` : "UB's starting rules"}{p.status === 'open' ? (db.tasks.some((t) => t.periodId === p.id && t.response) ? ' (kept: people already answered)' : ' (changes apply until someone answers)') : ' (locked)'}</span></td>
                  <td className="row">
                    {p.status === 'open' && <button onClick={async () => { if (await ask(`Close ${p.name} now?`, (deadlinePassed(p) ? '' : `The deadline (${longDate(p.deadline)}) has not passed yet: people who have not answered will not be able to. `) + (hasRule(policyFor(db, p.id)) ? `Classes are left out when they do not reach the rule (${ruleWords(policyFor(db, p.id))} must answer), and everyone concerned is notified.` : 'There is no participation rule, so no class is left out for low participation.'), { ok: 'Close period' })) run('closePeriod', p.id, (r) => `${p.name} closed. ${r.flagged} class(es) were left out (not enough answers); the faculty, department heads and HR were notified.`); }}>Close period</button>}
                    {p.status === 'open' && hasRule(policyFor(db, p.id)) && <button className="ghost" onClick={async () => (await ask('Send participation alerts?', 'Teachers and department heads of classes without enough answers are notified now.', { ok: 'Send alerts' })) && run('checkThreshold', p.id, (r) => (r.flagged ? `${r.flagged} class(es) do not have enough answers yet. The faculty, their department heads and HR were notified.` : 'Every class has enough responses so far.'))}>Send participation alerts</button>}
                    {p.status === 'closed' && p.releaseStage === 'hr' && <button className="ghost" onClick={() => setMoving({ id: p.id, date: isoIn(3), reopen: true })}>Reopen</button>}
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
      </>}
      {tab === 'new' && <Card title="New evaluation period">
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
              {activeDepts(db).filter((d) => !depts.includes(d.id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
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
      </Card>}
      {tab === 'reset' && <Card title="Reset or replace data">
        <div className="note warn"><b>Advanced.</b> These actions can permanently remove information.</div>
        <div className="row">
          <button className="danger" onClick={async () => {
            if (!(await ask('Start from scratch?', 'This deletes every account except HR, and all classes, evaluation periods, evaluations, results, notifications and imported records. Departments go back to the University of Baguio list.\n\nThe evaluation forms, questions and weights are kept. This cannot be undone.', { ok: 'Delete everything', danger: true }))) return;
            if (!(await ask('Are you really sure?', 'Everything except the HR accounts, the UB departments and the forms will be gone.', { ok: 'Yes, start from scratch', danger: true }))) return;
            const r = await act('startFromScratch');
            if (r) setMsg(`Done. ${r.removed} account(s) and all records were deleted. Next: add the accounts under People & sign-in (the UB departments are ready), then your class lists, then create an evaluation period.`);
          }}>Start from scratch (keep only HR)</button>
          <button className="ghost" onClick={async () => { if (await ask('Load the sample data?', 'ALL data is replaced with the sample (demo) data. Everything you entered is replaced.', { ok: 'Replace with sample data', danger: true }) && await act('resetData')) setMsg('All data was replaced with the sample data.'); }}>Load sample data</button>
        </div>
        <p className="muted"><b>Start from scratch</b> empties the system for real use: only HR accounts stay, with their passwords, plus the UB departments and the evaluation forms, questions and weights, so you don't have to build them again. <b>Load sample data</b> brings back the demo accounts (password demo1234). The audit log is never erased.</p>
      </Card>}
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
  const [adding, setAdding] = useState(false);
  const tabs = [['summary', 'Summary'], ['all', 'All evaluations']];
  const [tab, setTab] = useTab(tabs, 'summary');
  const tasks = db.tasks.filter((t) => t.periodId === pid);
  const evaluators = db.users.filter((u) => u.role !== 'ST' && groupsOf(db, u).length);
  const summary = {};
  tasks.forEach((t) => { const k = t.group; summary[k] ||= { pending: 0, completed: 0, overdue: 0 }; summary[k][taskStatus(db, t)]++; });
  const s = q.trim().toLowerCase();
  // personnel by name; students are counted per class, so nobody sees which student answered
  const period = periodById(db, pid), late = period && deadlinePassed(period);
  const perClass = new Map();
  for (const t of tasks) if (t.group === 'ST') { const x = perClass.get(t.sectionId) || { id: t.sectionId, group: 'ST', targetId: t.targetId, sectionId: t.sectionId, n: 0, done: 0 }; x.n++; if (t.response) x.done++; perClass.set(t.sectionId, x); }
  const statusOf = (r) => (r.done >= r.n ? 'completed' : late ? 'overdue' : 'pending');
  const all = [...newestFirst((db.assignments || []).filter((t) => t.periodId === pid).map((t) => ({ ...t, n: 1, done: t.done ? 1 : 0 }))), ...perClass.values()]
    .map((r) => { const sec = db.sections.find((x) => x.id === r.sectionId); return { ...r, sec, status: statusOf(r), who: r.group === 'ST' ? `Students of ${sec?.code || 'a class'}` : userById(db, r.evaluatorId)?.name || '' }; });
  const listed = all.filter((r) => (!grp || r.group === grp) && (!st || r.status === st) && (!s || `${r.who} ${userById(db, r.targetId)?.name || ''} ${r.sec?.subject || ''}`.toLowerCase().includes(s)));
  const { rows, bar } = usePages(listed, `${pid}|${s}|${grp}|${st}`);
  if (!db.periods.length) return <Card><Empty icon="calendar" title="No evaluation period yet">Create one under Dates &amp; release first.</Empty></Card>;

  const addOne = async () => {
    setMsg('');
    if (!add.evaluatorId || !add.targetId) return setMsg('Choose an evaluator and a person to evaluate.');
    if (await act('addAssignment', { periodId: pid, ...add })) { setMsg('Evaluation added.'); setAdd({ evaluatorId: '', targetId: '' }); setAdding(false); }
  };

  if (adding) {
    return (
      <Screen title="Add an evaluation" backTo="All evaluations" onBack={() => setAdding(false)}>
        <p className="muted">Only for a one-off case in {periodById(db, pid)?.name}. evalU creates the usual evaluations by itself.</p>
        {msg && <div className="note warn">{msg}</div>}
        <div className="row">
          <label>Who evaluates<br /><Select value={add.evaluatorId} onChange={(v) => setAdd({ ...add, evaluatorId: v })}><option value="">Choose the evaluator…</option>{evaluators.map((u) => <option key={u.id} value={u.id}>{u.name} ({groupsOf(db, u).map((g) => groupName(db, g)).join(' / ')})</option>)}</Select></label>
          <label>Whom they evaluate<br /><Select value={add.targetId} onChange={(v) => setAdd({ ...add, targetId: v })}><option value="">Choose the person…</option>{targetsOf(db).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></label>
        </div>
        <div className="row"><button onClick={addOne}>Add</button><button className="ghost" onClick={() => setAdding(false)}>Cancel</button></div>
      </Screen>
    );
  }
  return (
    <>
      <div className="row between"><Tabs tabs={tabs} value={tab} onChange={setTab} /><PeriodPicker periods={db.periods} value={pid} onChange={setPid} /></div>
      {msg && <div className="note">{msg}</div>}
      {tab === 'summary' && <Card title="Start and follow evaluations">
        <div className="row">
          <button onClick={async () => { const r = await act('generateTasks', { periodId: pid }); if (r) setMsg(`${r.added} evaluation(s) prepared from the class lists and staff roles.${r.skippedNoForm ? ` ${r.skippedNoForm} skipped because no form exists.` : ''} Internship, practicum and field trip subjects were skipped.`); }}>Create evaluation tasks</button>
          <button className="ghost" onClick={async () => { const r = await act('sendReminders', { periodId: pid }); if (r) setMsg(`Reminders sent to ${r.sent} evaluator(s) with unfinished evaluations. Their department heads and HR were alerted too.`); }}>Send reminders now</button>
        </div>
        <p className="muted"><b>You usually don't need this button.</b> evalU creates the evaluations by itself when the period starts and after every change in the classes, students and staff, and removes the unanswered ones of students who dropped a class.</p>
        <p className="muted">Reminders are sent by themselves once a day during the last 7 days before the deadline.</p>
        <table>
          <thead><tr><th>Evaluator group</th><th>Pending</th><th>Completed</th><th>Overdue</th></tr></thead>
          <tbody>{Object.entries(summary).map(([g, x]) => <tr key={g}><td>{groupName(db, g)}</td><td>{x.pending}</td><td>{x.completed}</td><td>{x.overdue}</td></tr>)}</tbody>
        </table>
      </Card>}
      {tab === 'all' && <Card title={`Who evaluates whom (${listed.length})`} actions={<button onClick={() => { setMsg(''); setAdding(true); }}>+ Add an evaluation</button>}>
        <p className="muted">Personnel are listed by name. <b>Students are counted per class</b>: to keep their answers anonymous, nobody sees which student answered.</p>
        <div className="row">
          <Select value={grp} onChange={setGrp}><option value="">All evaluator groups</option>{Object.keys(summary).map((g) => <option key={g} value={g}>{groupName(db, g)}</option>)}</Select>
          <Select value={st} onChange={setSt}><option value="">Any status</option><option value="pending">Pending</option><option value="completed">Completed</option><option value="overdue">Overdue</option></Select>
          <input placeholder="Search a name (optional)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {listed.length === 0 ? <Empty icon="list" title={all.length ? 'No evaluations match' : 'No evaluations yet'}>{all.length ? 'Change the filters above.' : 'They are created by themselves when the period starts.'}</Empty> : <>
        <table>
          <thead><tr><th>Evaluator</th><th>As</th><th>Evaluates</th><th>Class</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.who}</td><td>{groupName(db, r.group)}</td><td>{userById(db, r.targetId)?.name}</td>
                <td>{r.sec ? <>{r.sec.code} <span className="muted small">{r.sec.subject}</span></> : '—'}</td>
                <td>{r.group === 'ST' ? <span>{r.done} of {r.n} answered {r.status !== 'pending' && <StatusBadge s={r.status} />}</span> : <StatusBadge s={r.status} />}</td>
                <td>{r.group !== 'ST' && !r.done && <button className="ghost" onClick={async () => (await ask('Remove this task?', `${r.who} will no longer evaluate ${userById(db, r.targetId)?.name} in this period.`, { ok: 'Remove task', danger: true })) && act('removeTask', { taskId: r.id })}>Remove</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {bar}
        </>}
      </Card>}
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
/** New students of a list without a "student department": which department would they get? HR can choose another, per section. */
function NewStudentDepts({ out, deptOf, setDeptOf }) {
  const { db } = useApp();
  const { rows, bar } = usePages(out.guessed, '', 10);
  return (
    <div className="guess-depts">
      <p><b>Check the department of {plural(out.guessedCount, 'new student')}.</b> The file does not say it, so they would get the department of their teacher. If a section's students belong to another department (for example, they take a general education subject here), choose it:</p>
      <table>
        <thead><tr><th>Section</th><th>New students</th><th>Department of these students</th></tr></thead>
        <tbody>{rows.map((g) => (
          <tr key={g.key}><td><b>{g.code}</b></td><td>{g.students}</td><td>
            <Select value={deptOf[g.key] || ''} onChange={(v) => setDeptOf({ ...deptOf, [g.key]: v })} aria-label={`Department of the new students of ${g.code}`}>
              <option value="">{deptName(db, g.dept)} (their teacher's)</option>
              {schoolDepts(db).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select></td></tr>
        ))}</tbody>
      </table>
      {bar}
      <p className="muted small">A student in several sections gets the department you choose for one of them. Students who already have an account keep their department.</p>
    </div>
  );
}
/** Students whose department was a guess, and whose classes say otherwise. */
function ConfirmDepts() {
  const { db, act } = useApp();
  const list = deptsToConfirm(db);
  const [choice, setChoice] = useState({});
  const { rows, bar } = usePages(list, '', 10);
  if (!list.length) return null;
  const of = (x) => choice[x.user.id] || x.suggest;
  const save = (some) => act('setStudentDepts', { list: some.map((x) => ({ userId: x.user.id, dept: of(x) })) });
  return (
    <Card title={`Confirm the department of ${plural(list.length, 'new student')}`} actions={list.length > 1 && <button onClick={async () => { if (await ask(`Save the department of ${list.length} students?`, 'Each student gets the department shown in the list.', { ok: 'Save all' })) save(list); }}>Save all</button>}>
      <p className="muted">Their class list did not say the department, so they got the one of their teacher. But they have as many or more classes in another department. Choose the right one; their evaluations do not change.</p>
      <table>
        <thead><tr><th>Student</th><th>Now in</th><th>Their classes</th><th>Right department</th><th /></tr></thead>
        <tbody>{rows.map((x) => (
          <tr key={x.user.id}>
            <td><b>{x.user.name}</b> <span className="muted small">{x.user.username}</span></td>
            <td>{deptName(db, x.user.dept)}</td>
            <td>{Object.entries(x.count).sort((a, b) => b[1] - a[1]).map(([d, n]) => <div key={d}>{n} in {deptName(db, d)}</div>)}</td>
            <td><Select value={of(x)} onChange={(v) => setChoice({ ...choice, [x.user.id]: v })} aria-label={`Department of ${x.user.name}`}>{schoolDepts(db).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></td>
            <td><button className="ghost" onClick={() => save([x])}>Save</button></td>
          </tr>
        ))}</tbody>
      </table>
      {bar}
    </Card>
  );
}
/** The same section and subject with another teacher than before: was the earlier one replaced, or do both teach it? */
function TeacherChanges({ list, isReplaced, onChange }) {
  const { rows, bar } = usePages(list, '', 10);
  return (
    <div className="guess-depts">
      <p><b>{plural(list.length, 'class has', 'classes have')} another teacher in this file.</b> Was the earlier teacher replaced, or do both teach the class?</p>
      <table>
        <thead><tr><th>Class</th><th>Until now</th><th>In this file</th><th>Answered already</th><th>What happened?</th></tr></thead>
        <tbody>{rows.map((x) => (
          <tr key={x.id}>
            <td><b>{x.code}</b> {x.subject}<div className="muted small">{x.same} of {plural(x.students, 'student')} are the same</div></td><td>{x.from}</td><td>{x.to}</td><td>{x.answered} of {x.answered + x.waiting}</td>
            <td><Select value={isReplaced(x) ? 'replaced' : 'both'} onChange={(v) => onChange(x.id, v)} aria-label={`What happened to ${x.code} ${x.subject}`}><option value="replaced">{x.from} was replaced</option><option value="both">Both teach it</option></Select></td>
          </tr>
        ))}</tbody>
      </table>
      {bar}
      <p className="muted small"><b>Replaced:</b> students who did not answer yet evaluate only the new teacher. Submitted answers stay with the earlier teacher, and count only if enough of the class had answered. <b>Both teach it:</b> students evaluate both.</p>
    </div>
  );
}
/** FR6: the words that make a subject not evaluated, and the classes they match. */
function NotEvaluated({ list, past }) {
  const { db, act } = useApp();
  const saved = exemptWords(db);
  const [words, setWords] = useState(saved);
  const [word, setWord] = useState('');
  const [msg, setMsg] = useState('');
  const dirty = JSON.stringify(words) !== JSON.stringify(saved);
  const add = () => { const v = word.trim().replace(/\s+/g, ' '); if (v && !words.some((w) => w.toLowerCase() === v.toLowerCase())) setWords([...words, v]); setWord(''); };
  // what saving would do to the classes of this semester and later ones
  const pattern = exemptPattern(words), changed = db.sections.filter((s) => !isPastClass(db, s) && s.evaluated == null && saysExempt(s, pattern) !== isExemptSection(s));
  const answered = new Set(db.tasks.filter((t) => t.response && t.sectionId).map((t) => t.sectionId));
  const stop = changed.filter((s) => !isExemptSection(s) && !answered.has(s.id)), start = changed.filter((s) => isExemptSection(s)), kept = changed.filter((s) => !isExemptSection(s) && answered.has(s.id));
  const names = (some) => `${some.slice(0, 5).map((s) => `${s.code} · ${s.subject}`).join('; ')}${some.length > 5 ? '…' : ''}`;
  const lines = [stop.length && `${plural(stop.length, 'class', 'classes')} would no longer be evaluated: ${names(stop)}`, start.length && `${plural(start.length, 'class', 'classes')} would be evaluated: ${names(start)}`, kept.length && `${plural(kept.length, 'class stays', 'classes stay')} evaluated because students already answered: ${names(kept)}`].filter(Boolean);
  const save = async () => {
    setMsg('');
    if (!(await ask('Save the list of words?', `${lines.length ? lines.join('\n\n') : 'No class of this semester changes.'}\n\nClasses of earlier semesters stay as they were.`, { ok: 'Save' }))) return;
    if (await act('setExemptWords', { words })) setMsg('Saved.');
  };
  const { rows, bar } = usePages(list, '', 10);
  return (
    <>
      <Card title="Subjects that are not evaluated">
        <p className="muted">A class is not evaluated when one of these words is in its subject or section code. Plurals and other ways to join a word count too (Field trip also finds Field-trip and Fieldtrips). Change the list only when HRMC changes its procedure.</p>
        {msg && !dirty && <div className="note ok">{msg}</div>}
        <div className="row">{words.map((w) => <span key={w} className="tag">{w}<button type="button" className="tag-x" aria-label={`Remove ${w}`} onClick={() => setWords(words.filter((x) => x !== w))}>×</button></span>)}{!words.length && <span className="muted">No words: every class is evaluated.</span>}</div>
        <div className="row"><input placeholder="e.g. Educational tour" aria-label="New word" value={word} maxLength={60} onChange={(e) => setWord(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} /><button className="ghost" disabled={!word.trim()} onClick={add}>Add word</button></div>
        {dirty && <div className="note warn"><b>Not saved yet.</b> {lines.length ? lines.map((l) => <div key={l}>{l}</div>) : 'No class of this semester changes.'}<div className="row"><button onClick={save}>Save</button><button className="ghost" onClick={() => setWords(saved)}>Cancel</button></div></div>}
      </Card>
      <Card title={`Classes not evaluated (${list.length})`}>
        {list.length === 0 ? <Empty icon="list" title="Every class of this semester is evaluated" /> : <>
          <table>
            <thead><tr><th>Section</th><th>Subject</th><th>Teacher</th><th>Why</th><th /></tr></thead>
            <tbody>{rows.map((s) => (
              <tr key={s.id}><td><b>{s.code}</b></td><td>{s.subject}</td><td>{userById(db, s.facultyId)?.name}</td><td>{s.evaluated === false ? 'HR chose this' : 'The words above'}</td>
                <td>{!past && <button className="ghost" aria-label={`Evaluate ${s.code} ${s.subject}`} onClick={() => act('setSectionEvaluated', { sectionId: s.id, evaluated: s.evaluated === false && !saysExempt(s, exemptPattern(saved)) ? null : true })}>Evaluate this class</button>}</td></tr>
            ))}</tbody>
          </table>
          {bar}
        </>}
      </Card>
    </>
  );
}
export function Classes() {
  const { db, act } = useApp();
  const [f, setF] = useState({ code: '', subject: '', facultyId: '' });
  const [csv, setCsv] = useState('');
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [listDept, setListDept] = useState('');
  const [drop, setDrop] = useState(false); // remove the students who are not on the list any more
  const [deptOf, setDeptOf] = useState({}); // section → the department HR chose for its new students
  const [both, setBoth] = useState({}); // class → 'replaced' or 'both' (the same class with another teacher)
  const isReplaced = (x) => (both[x.id] || (x.likely ? 'replaced' : 'both')) === 'replaced';
  const [term, setTerm] = useState(() => workingTerm(db)); // the semester HR works on
  const terms = [...new Set([workingTerm(db), nextTermOf(workingTerm(db)), ...db.sections.map((s) => s.term).filter(Boolean), term])].filter(Boolean).sort().reverse();
  const [msg, setMsg] = useState('');
  const suggested = db.sections.filter((s) => s.term === term && suggestClassType(db, s));
  const faculty = db.users.filter((u) => isTeacher(u) && u.active);
  const used = new Set(db.tasks.map((t) => t.sectionId).filter(Boolean));
  const [dept, setDept] = useState('');
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const qs = q.trim().toLowerCase();
  const ofTerm = db.sections.filter((x) => (term === '__none' ? !x.term : x.term === term));
  const listed = newestFirst(ofTerm).filter((x) => (!dept || x.dept === dept)
    && (!kind || (kind === 'exempt') === isExemptSection(x))
    && (!qs || `${x.code} ${x.subject} ${userById(db, x.facultyId)?.name || ''}`.toLowerCase().includes(qs)));
  const { rows, bar } = usePages(listed, `${dept}|${kind}|${qs}|${term}`, 10);
  const toConfirm = deptsToConfirm(db).length + suggested.length;
  const tabs = [['import', 'Import a class list'], ...(toConfirm ? [['confirm', `To confirm (${toConfirm})`]] : []), ['exempt', `Not evaluated (${ofTerm.filter(isExemptSection).length})`], ['classes', `All classes (${ofTerm.length})`]];
  const [tab, setTab] = useTab(tabs, 'import');
  const past = isPastClass(db, { term });
  const [adding, setAdding] = useState(false);
  if (adding) {
    return (
      <Screen title={`Add a class to ${termLabel(term)}`} backTo="All classes" onBack={() => setAdding(false)}>
        <div className="row">
          <label>Section code<br /><input placeholder="e.g. SIT-101A" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></label>
          <label>Subject<br /><input placeholder="e.g. Web Development" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></label>
          <label>Teacher<br /><Select value={f.facultyId} onChange={(v) => setF({ ...f, facultyId: v })}><option value="">Choose the teacher…</option>{faculty.map((u) => <option key={u.id} value={u.id}>{u.name} · {deptName(db, u.dept)}</option>)}</Select></label>
        </div>
        <div className="row"><button onClick={async () => { setMsg(''); if (await act('createSection', { ...f, term })) { setF({ code: '', subject: '', facultyId: '' }); setAdding(false); setMsg('Class added. Add its students by importing a class list, or under People & sign-in.'); } }}>Add</button><button className="ghost" onClick={() => setAdding(false)}>Cancel</button></div>
      </Screen>
    );
  }
  return (
    <>
      <div className="row"><label className="inline"><b>Semester</b> <Select value={term} onChange={(v) => { setTerm(v); setOut(null); }} aria-label="Semester">{terms.map((t) => <option key={t} value={t}>{termLabel(t)}{t === workingTerm(db) ? ' (now)' : ''}</option>)}{db.sections.some((s) => !s.term) && <option value="__none">No semester (from before)</option>}</Select></label>
        <span className="muted">{plural(ofTerm.length, 'class', 'classes')} in this semester{isPastClass(db, { term }) ? ' · over, kept for the records' : ''}</span></div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {msg && <div className="note">{msg}</div>}
      {tab === 'import' && <div className="note"><b>The class list tells evalU which students evaluate which teacher.</b> Import it each semester <b>during or after the first grading period</b>, when students who dropped are no longer on the list. Choose the semester and department, check the file, then import it. Evaluations are created by themselves. Import a newer list any time: new students are added, and you can remove the ones who dropped.</div>}
      {tab === 'exempt' && <NotEvaluated list={ofTerm.filter(isExemptSection)} past={past} />}
      {tab === 'confirm' && <ConfirmDepts />}
      {tab === 'confirm' && suggested.length > 0 && (
        <Card title={`${plural(suggested.length, 'class looks', 'classes look')} like laboratory or clinical`} actions={<button onClick={() => act('applyClassTypes', { sectionIds: suggested.map((s) => s.id) })}>Set them all</button>}>
          <p className="muted">The type decides which form the students answer. These come from the subject names; uncommon ones can be set one by one under Classes.</p>
          <ul className="plain-list">{suggested.slice(0, 8).map((s) => <li key={s.id} className="row between"><span><b>{s.code}</b> {s.subject} → {CLASS_TYPES[suggestClassType(db, s)]}</span><button className="ghost" onClick={() => act('applyClassTypes', { sectionIds: [s.id] })}>Set</button></li>)}{suggested.length > 8 && <li className="muted">and {suggested.length - 8} more</li>}</ul>
        </Card>
      )}
      {tab === 'import' && <Card title="Import a class list">
        <p className="muted">Choose the class list file from the Registrar/ARC, or paste it below. It must be a CSV file (in Excel: <b>File → Save As → CSV</b>). One student per line. If the first row has the column names, the columns can be in any order:</p>
        <p><code>section code, subject, teacher name, teacher email, student ID, student name, student UB email</code> <span className="muted">and, if you have them: <code>subject code</code>, <code>type of class</code>, <code>student department</code></span></p>
        <p className="muted">Names like "Dela Cruz, Juan" are read when they are in quotes (Excel does this by itself). The same section can have several subjects and teachers, and students of other departments can be in a class. Classes that don't exist yet are created. <b>Teachers and students who don't have an account yet get one automatically.</b> New teachers are put in the department you choose. New students get the <code>student department</code> of the file; without it, the one of their teacher, and you can change that after checking the file. A student's first password is their <b>student ID</b>; a teacher's is the part of their email before the @ (for example <code>jdelacruz</code>). Everyone must change it when they first sign in. People who already have an account are just added to the class. Rows with a problem are listed and skipped.</p>
        <div className="row">
          <label className="inline">Department of this list
            <Select value={listDept} onChange={setListDept}><option value="">Choose…</option>{schoolDepts(db).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></label>
        </div>
        <div className="row">
          <label className="file-pick"><input type="file" accept=".csv,.txt,text/csv" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { setCsv(await file.text()); setOut(null); } e.target.value = ''; }} />Choose CSV file…</label>
          <a className="ghost-link" href={'data:text/csv;charset=utf-8,' + encodeURIComponent(SAMPLE_CLASS_LIST)} download="class-list-example.csv">Download an example file</a>
        </div>
        <textarea rows={6} value={csv} onChange={(e) => { setCsv(e.target.value); setOut(null); }} placeholder={SAMPLE_CLASS_LIST} />
        <div className="row">
          {/* step 1: check the file (nothing is saved); step 2: import */}
          <button className="ghost" disabled={busy || !csv.trim() || !listDept} title={listDept ? '' : 'Choose the department first'} onClick={async () => { setBusy(true); const r = await act('importClassList', { csv, dept: listDept, term, preview: true }); setBusy(false); setDeptOf({}); setBoth({}); if (r) setOut(r); }}>1. Check file</button>
          <button disabled={busy || !csv.trim() || !listDept || !out?.preview || term === '__none'} title={out?.preview ? '' : 'Check the file first'} onClick={async () => { if (out.errorCount && !(await ask('Import with problem rows?', `${out.errorCount} row(s) have a problem and will be skipped. The other rows are imported.`, { ok: 'Import the good rows' }))) return; setBusy(true); const r = await act('importClassList', { csv, dept: listDept, term, drop, deptOf, replace: (out.teacherChanges || []).filter(isReplaced).map((x) => x.id) }); setBusy(false); setBoth({}); setDrop(false); setDeptOf({}); if (r) { setOut(r); if (!r.errorCount) setCsv(''); } }}>{busy ? 'Working… (big lists can take a minute)' : '2. Import class list'}</button>
          {csv.trim() && <span className="muted">{csv.trim().split(/\r?\n/).filter((l) => l.trim() && !/^\s*section/i.test(l)).length} row(s) in the file</span>}</div>
        {out?.preview && (
          <div className={`note ${out.errorCount ? 'warn' : 'ok'}`}>
            <b>Check result (nothing saved yet):</b> {out.rows} row(s) read. Importing would create <b>{out.created} class(es)</b>, <b>{out.accounts} new student account(s)</b>{out.teachers ? <>, <b>{out.teachers} new teacher account(s)</b></> : ''}, add <b>{out.enrolled} enrolment(s)</b> and use <b>{out.existingStudents}</b> student(s) who already have an account.
            {out.duplicates > 0 && <> <b>{out.duplicates} duplicate row(s)</b> are counted once.</>}
            {out.errorCount > 0 ? <> <b>{out.errorCount} row(s) have a problem</b> and would be skipped:</> : ' No problems found.'}
            {(out.errors.length > 0 || out.warnings?.length > 0) && <ul>{out.errors.map((e, i) => <li key={'e' + i}>{e}</li>)}{out.warnings.map((w, i) => <li key={'w' + i} className="muted">{w}</li>)}</ul>}
            {out.droppedCount > 0 && <div><label className="inline"><input type="checkbox" checked={drop} onChange={(e) => setDrop(e.target.checked)} /> <b>Remove the {plural(out.droppedCount, 'student')} who {out.droppedCount === 1 ? 'is' : 'are'} not on this list any more</b> (dropped). Their answers, if any, are kept.</label><details className="source"><summary>Show who</summary><ul>{out.dropped.map((d) => <li key={d}>{d}</li>)}</ul></details></div>}
            {out.corrected > 0 && <div><b>{plural(out.corrected, 'student')}</b> who had their teacher's department would get the one in this file.</div>}
            {out.teacherChanges?.length > 0 && <TeacherChanges list={out.teacherChanges} isReplaced={isReplaced} onChange={(id, v) => setBoth({ ...both, [id]: v })} />}
            {out.guessedCount > 0 && <NewStudentDepts key={csv} out={out} deptOf={deptOf} setDeptOf={setDeptOf} />}
            {out.notInFile?.length > 0 && <div className="small muted">Classes of this department that are not in the file (nothing happens to them): {out.notInFile.join('; ')}</div>}
            {out.notEvaluatedCount > 0 && <div><b>{plural(out.notEvaluatedCount, 'class', 'classes')} in this file would not be evaluated</b> (internship, practicum, field trip…): {out.notEvaluated.join('; ')}. <span className="muted">After importing you can change this under Not evaluated.</span></div>}
            {out.newClasses?.length > 0 && <div className="small muted">New classes: {out.newClasses.join('; ')}</div>}
          </div>
        )}
        {out && !out.preview && <div className={`note ${out.errorCount ? 'warn' : 'ok'}`}><b>Imported.</b> {out.created} class section(s) created, <b>{out.teachers || 0} teacher account(s)</b> and <b>{out.accounts || 0} student account(s) created</b>, {out.enrolled} enrolment(s) added{out.duplicates ? `, ${out.duplicates} duplicate row(s) counted once` : ''}.{(out.accounts > 0 || out.teachers > 0) && ' New students sign in with their UB email and their student ID as the password; new teachers with their UB email and the part before the @.'}{out.corrected > 0 && <> The department of {plural(out.corrected, 'student')} was corrected.</>}{out.replaced > 0 && <> <b>{plural(out.replaced, 'teacher')} replaced</b>: {plural(out.removedOld, 'unanswered evaluation')} of the earlier teacher removed.</>}{out.evaluations && <> <b>{out.evaluations.added} evaluation(s) created</b>{out.evaluations.removed ? <> and {out.evaluations.removed} removed</> : ''} by themselves.</>}{out.errorCount > 0 && <> {out.errorCount} row(s) skipped:<ul>{out.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></>}</div>}
      </Card>}
      {tab === 'classes' && <Card title={`Classes of ${term === '__none' ? 'no semester' : termLabel(term)} (${listed.length}${listed.length !== ofTerm.length ? ` of ${ofTerm.length}` : ''})`} actions={<><button disabled={term === '__none'} onClick={() => { setMsg(''); setAdding(true); }}>+ Add a class</button><QrButton sections={listed.filter((x) => !isExemptSection(x) && !x.replaced)} label="QR codes for these classes" /></>}>
        <div className="row">
          <Select value={dept} onChange={setDept}><option value="">All departments</option>{db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
          <Select value={kind} onChange={setKind}><option value="">Evaluated and not evaluated</option><option value="evaluated">Evaluated only</option><option value="exempt">Not evaluated</option></Select>
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
              <td>{s.replaced ? <Badge kind="muted">replaced by {s.replaced.by}</Badge> : isExemptSection(s) ? <Badge kind="muted">not evaluated</Badge> : <Badge kind="completed">yes</Badge>}</td>
              <td>{!s.replaced && <QrButton sections={[s]} />}{!past && !s.replaced && <button className="ghost" onClick={async () => { const out = isExemptSection(s); if (out || await ask(`Don't evaluate ${s.code}?`, `The students of ${s.code} · ${s.subject} would not evaluate this class.`, { ok: "Don't evaluate" })) act('setSectionEvaluated', { sectionId: s.id, evaluated: out }); }}>{isExemptSection(s) ? 'Evaluate' : "Don't evaluate"}</button>}{!used.has(s.id) && <button className="ghost" onClick={async () => { if (await ask(`Delete section ${s.code}?`, `${s.code} · ${s.subject} and its class list will be removed.`, { ok: 'Delete section', danger: true })) act('deleteSection', { sectionId: s.id }); }}>Delete</button>}</td>
            </tr>
          ))}</tbody>
        </table>
        {bar}
        </>}
      </Card>}
    </>
  );
}

/* ---------------- Section monitor (dean / chair / HR) (FR9, FR11) ---------------- */
export function Monitor({ deptOnly }) {
  const { db, user } = useApp();
  const open = db.periods.filter((p) => p.status === 'open');
  const all = db.sections.filter((s) => !deptOnly || s.dept === user.dept);
  const depts = db.departments.filter((d) => !deptOnly || d.id === user.dept);
  const tabs = [['dept', deptOnly ? 'My department' : 'By department'], ['class', 'By class']];
  const [tab, setTab] = useTab(tabs, 'dept');
  const [pidSel, setPid] = useState('');
  const shown = open.find((p) => p.id === pidSel) || open.at(-1);
  return (
    <>
      <RuleNote policy={shown ? policyFor(db, shown.id) : currentPolicy(db)} />
      {open.length === 0 && <Card><Empty icon="calendar" title="No evaluation period is open" /></Card>}
      {shown && <div className="row between"><Tabs tabs={tabs} value={tab} onChange={setTab} />{open.length > 1 && <PeriodPicker periods={open} value={shown.id} onChange={setPid} />}</div>}
      {shown && [shown].map((p) => {
        const pt = db.tasks.filter((t) => t.periodId === p.id);
        const secs = all.filter((s) => inTerm(p, s));
        const dept = (d) => pt.filter((t) => userById(db, t.targetId)?.dept === d.id);
        return (
          <div key={p.id}>
            <EarlyWarning period={p} secs={secs.filter((s) => periodCovers(p, s.dept))} />
            {tab === 'dept' && <Card title={`${p.name} · progress by department`}>
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
            </Card>}
            {tab === 'class' && <ClassProgress title={deptOnly ? `Class progress – ${deptName(db, user.dept)}` : 'Class progress'} period={p} secs={secs.filter((s) => periodCovers(p, s.dept))} />}
          </div>
        );
      })}
    </>
  );
}

/** Participation forecast summary: how many classes may not have enough answers by the deadline at their current pace. */
function EarlyWarning({ period: p, secs }) {
  const { db } = useApp();
  const fcs = secs.map((s) => participationForecast(db, p.id, s.id)).filter(Boolean);
  if (!fcs.length) return null;
  const risk = fcs.filter((f) => f.status === 'at-risk').length, track = fcs.filter((f) => f.status === 'on-track').length;
  const by = new Date(p.deadline + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  return (
    <div className={`note ${risk ? 'warn' : 'ok'}`}>
      <b>Forecast for {by}:</b> {risk ? `${risk} class${risk > 1 ? 'es' : ''} may not have enough answers at the current pace` : 'every class is on track or already has enough answers'}{track ? ` · ${track} on track` : ''} · {fcs.filter((f) => f.status === 'reached').length} already have enough.
      {risk > 0 && ' Teachers and department heads of the classes at risk were warned. To see them, choose "Only classes at risk" under By class.'}
      <details className="source"><summary>How the forecast works</summary><p>Pace = answers so far ÷ days since the period opened. Expected by the deadline = answers so far + pace × days left. A class is "at risk" when that is below the number of answers it needs. The first 2 days are too early to tell. It assumes students keep answering at the same pace; reminders and class time with the QR code usually raise it.</p></details>
    </div>
  );
}

/** Response rate of each class in a period, a page at a time; the classes without enough answers can be shown alone. */
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
  const { rows, bar } = usePages(shown, `${only}|${dept}`, 10);
  return (
            <Card title={`${title} (${shown.length})`}>
              <div className="row">
                <Select value={only} onChange={setOnly}><option value="">All classes</option><option value="low">Only classes without enough answers</option><option value="ok">Only classes with enough responses</option><option value="risk">Only classes at risk (forecast)</option></Select>
                {depts.length > 1 && <Select value={dept} onChange={setDept}><option value="">All departments</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>}
              </div>
              <table>
                <thead><tr><th>Class</th><th>Faculty</th><th>Responded</th><th>Rate</th><th>Standing</th><th>Forecast by {new Date(p.deadline + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</th></tr></thead>
                <tbody>{rows.map((s) => {
                  if (isExemptSection(s)) return <tr key={s.id}><td>{s.code} – {s.subject}</td><td>{userById(db, s.facultyId)?.name}</td><td colSpan={2} className="muted">—</td><td><Badge kind="muted">not evaluated</Badge></td><td /></tr>;
                  const st = sectionStats(db, p.id, s.id);
                  if (s.replaced) return <tr key={s.id}><td>{s.code} – {s.subject}</td><td>{userById(db, s.facultyId)?.name}</td><td>{st.responded} of {st.required}</td><td>{pct(st.rate)}</td><td><Badge kind="muted">replaced by {s.replaced.by}</Badge></td><td /></tr>;
                  return <tr key={s.id}><td>{s.code} – {s.subject}</td><td>{userById(db, s.facultyId)?.name}</td><td><div className="meter-row"><Meter value={st.rate} mark={ruleMark(policyFor(db, p.id))} tone={st.valid ? 'good' : 'bad'} /><span>{st.responded}/{st.required} <span className="muted">needs {st.needed}</span></span></div></td><td>{pct(st.rate)}</td>
                    <td>{!st.required ? <span className="muted">no tasks yet</span> : st.belowHalf ? <Badge kind="overdue">{hasRule(policyFor(db, p.id)) ? 'not enough answers – would be left out' : `needs ${st.needed - st.responded} more to have a score`}</Badge> : <Badge kind="completed">enough responses</Badge>}</td>
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
  setPolicy: 'Changed the evaluation policy', setExemptWords: 'Changed the subjects not evaluated', setSectionEvaluated: 'Chose whether a class is evaluated', saveFormulaDraft: 'Saved a formula draft', followAllDepartments: 'Asked to follow all departments again', submitFormula: 'Submitted a formula for approval', approveFormula: 'Approved a formula (VP)', rejectFormula: 'Returned a formula (VP)', activateFormula: 'Activated a formula', createPlan: 'Made a development plan', updatePlan: 'Changed a development plan', acknowledgePlan: 'Read a development plan', closePlan: 'Closed a development plan', deleteFormulaDraft: 'Deleted a formula draft', returnToHR: 'Returned results to HR (VP)', verifyAudit: 'Checked the audit log', importClassList: 'Imported a class list',
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
