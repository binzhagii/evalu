import { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { STAGES, taskStatus, sectionStats, userById, computeAll, canSeeAll, policyFor, hasRule, ruleMark, hasFinal, pendingApprovals, groupName, participationForecast } from '../lib/logic';
import { cyclePeriod, cycleSteps, needsYou, nextStep } from '../lib/cycle';
import { ApprovalPanel } from './Reports';
import { Card, Stat, Stats, Meter, Badge, Empty, PeriodPicker, Icon, useNav, fmt, pct, dueText, daysUntil, ForecastBadge } from '../ui';

const STAGE_SHORT = { hr: 'HR only', dir: 'VPs', faculty: 'Faculty' };

/** HR → VPs → Faculty, with the current step highlighted. */
export function ReleaseSteps({ stage }) {
  const at = STAGES.indexOf(stage);
  return (
    <ol className="steps">
      {STAGES.map((s, i) => <li key={s} className={i < at ? 'done' : i === at ? 'now' : ''}>{i <= at && <Icon name="check" size={13} />}{STAGE_SHORT[s]}</li>)}
    </ol>
  );
}

/* ---------------- HR ---------------- */
/** Only what a person has to decide; the rest happens by itself. */
function NeedsYou({ db, go }) {
  const list = useMemo(() => needsYou(db), [db]);
  const [all, setAll] = useState(false);
  return (
    <Card title={list.length ? `Needs you (${list.length})` : 'Nothing needs you right now'}>
      {list.length === 0 ? <p className="muted">evalU creates the evaluations, reminds people and closes the period by itself.</p> : <>
        <ul className="plain-list needs">{(all ? list : list.slice(0, 5)).map((x) => <li key={x.text} className="row between"><span>{x.text}</span><button className="ghost" onClick={() => go(x.page, x.args)}>{x.label}</button></li>)}</ul>
        {list.length > 5 && <button className="link" onClick={() => setAll(!all)}>{all ? 'Show less' : `Show all (${list.length})`}</button>}
      </>}
    </Card>
  );
}

/** What HR does each semester, in order. Every step is checked from the real data of the period; the next one stands out. */
function CycleSteps({ db, go }) {
  const [pidSel, setPid] = useState('');
  const p = db.periods.find((x) => x.id === pidSel) || cyclePeriod(db);
  const steps = useMemo(() => cycleSteps(db, p), [db, p]);
  const next = nextStep(steps);
  const groups = [...new Set(steps.map((s) => s.group))];
  return (
    <Card title={`What to do${p ? `: ${p.name}` : ''}`} actions={db.periods.length > 1 && <PeriodPicker periods={db.periods} value={p?.id} onChange={setPid} />}>
      {next
        ? <div className="note"><b>Next: {next.title.charAt(0).toLowerCase() + next.title.slice(1)}.</b> {next.detail} <button className="link next-link" onClick={() => go(next.page)}>Open {next.label} →</button></div>
        : <div className="note ok"><b>Everything is done for {p.name}.</b> For the next semester, start again from step 1, then create its period.</div>}
      {groups.map((g) => (
        <div key={g}>
          <h4 className="term-group">{g}</h4>
          <ol className="term-steps" start={steps.findIndex((s) => s.group === g) + 1}>
            {steps.map((s, i) => s.group === g && (
              <li key={s.key} className={s.done ? 'done' : s === next ? 'next' : ''} aria-current={s === next ? 'step' : undefined}>
                <span className="term-n">{s.done ? <Icon name="check" size={14} /> : i + 1}</span>
                <span><b>{s.title}</b><span className="muted small"> · {s.detail}</span></span>
                <button className="ghost" onClick={() => go(s.page)}>{s.label}</button>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </Card>
  );
}

export function HROverview() {
  const { db } = useApp();
  const go = useNav();
  const open = db.periods.filter((p) => p.status === 'open');
  const openIds = new Set(open.map((p) => p.id));
  const tasks = db.tasks.filter((t) => openIds.has(t.periodId));
  const status = tasks.map((t) => taskStatus(db, t));
  const done = status.filter((s) => s === 'completed').length;
  const overdue = status.filter((s) => s === 'overdue').length;
  const classes = open.flatMap((p) => db.sections.map((s) => ({ p, st: sectionStats(db, p.id, s.id) }))).filter((x) => x.st.required);
  const low = classes.filter((x) => x.st.belowHalf && hasRule(policyFor(db, x.p.id))).sort((a, b) => a.st.rate - b.st.rate);
  const active = db.users.filter((u) => u.active);
  const waiting = active.filter((u) => u.mustChangePassword).length;

  return (
    <>
      <NeedsYou db={db} go={go} />
      <CycleSteps db={db} go={go} />

      <Stats>
        <Stat icon="check" label="Responses received" value={tasks.length ? pct(done / tasks.length) : '—'} sub={`${done} of ${tasks.length} evaluations in open periods`} tone="good" />
        <Stat icon="clock" label="Late evaluations" value={overdue} sub={overdue ? 'Extend the deadline if people need more time' : 'Nothing overdue'} tone={overdue ? 'bad' : ''} />
        <Stat icon="chart" label="Classes needing more answers" value={`${low.length} / ${classes.length}`} sub="May not count if the period closed now" tone={low.length ? 'warn' : ''} />
        <Stat icon="users" label="Active accounts" value={active.length} sub={waiting ? `${waiting} have not signed in yet` : 'Everyone has signed in'} />
      </Stats>

      <div className="grid-2">
        <Card title="Open evaluation periods" actions={<button className="ghost" onClick={() => go('periods')}>Manage</button>}>
          {open.length === 0 ? <Empty icon="calendar" title="No period is open">Create one under Dates &amp; release.</Empty> : open.map((p) => {
            const pt = db.tasks.filter((t) => t.periodId === p.id);
            const byGroup = {};
            for (const t of pt) { const g = (byGroup[t.group] ||= { n: 0, done: 0 }); g.n++; if (t.response) g.done++; }
            const pd = pt.filter((t) => t.response).length;
            const days = daysUntil(p.deadline);
            return (
              <div key={p.id} className="period-block">
                <div className="row between">
                  <b>{p.name}</b>
                  <Badge kind={days < 0 ? 'overdue' : days <= 7 ? 'pending' : 'info'}>{dueText(p.deadline)}</Badge>
                </div>
                <div className="meter-row"><span>All evaluators</span><Meter value={pt.length ? pd / pt.length : 0} tone="brand" /><b>{pt.length ? pct(pd / pt.length) : '—'}</b></div>
                {Object.entries(byGroup).map(([g, v]) => (
                  <div key={g} className="meter-row sub"><span>{groupName(db, g)}</span><Meter value={v.done / v.n} /><span>{v.done}/{v.n}</span></div>
                ))}
              </div>
            );
          })}
        </Card>

        <Card title="Classes needing attention" actions={<button className="ghost" onClick={() => go('monitor')}>See all</button>}>
          {low.length === 0 ? <Empty title="No class needs more answers" /> : (
            <ul className="plain-list">
              {low.slice(0, 6).map(({ p, st }) => (
                <li key={p.id + st.section.id}>
                  <div><b>{st.section.code}</b> <span className="muted">· {userById(db, st.section.facultyId)?.name}{open.length > 1 ? ` · ${p.name}` : ''}</span></div>
                  <div className="meter-row"><Meter value={st.rate} mark={ruleMark(policyFor(db, p.id))} tone="bad" /><span>{st.responded}/{st.required} <span className="muted">needs {st.needed}</span></span></div>
                  <ForecastBadge fc={participationForecast(db, p.id, st.section.id)} deadline={p.deadline} />
                </li>
              ))}
              {low.length > 6 && <li className="muted">and {low.length - 6} more…</li>}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Results release" actions={<button className="ghost" onClick={() => go('periods')}>Manage</button>}>
        <table>
          <thead><tr><th>Period</th><th>Status</th><th>Who can see results</th><th>VP approval</th></tr></thead>
          <tbody>
            {[...db.periods].reverse().map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.status === 'open' ? <Badge kind="info">open</Badge> : <Badge kind="muted">closed</Badge>}</td>
                <td><ReleaseSteps stage={p.releaseStage} /></td>
                <td>{p.releaseStage === 'hr' ? <span className="muted">—</span> : p.releaseStage === 'faculty' ? <Badge kind="completed">approved</Badge> : pendingApprovals(db, p).length ? <Badge kind="pending">waiting for {pendingApprovals(db, p).length}</Badge> : <Badge kind="completed">ready to release</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

/* ---------------- Vice President ---------------- */
export function VpOverview() {
  const { db, user } = useApp();
  const go = useNav();
  const periods = db.periods.filter((p) => canSeeAll(user, p));
  const [pidSel, setPid] = useState(periods[periods.length - 1]?.id);
  const pid = periods.some((p) => p.id === pidSel) ? pidSel : periods[periods.length - 1]?.id; // newest if none chosen yet
  const all = useMemo(() => (pid ? computeAll(db, pid) : []), [db, pid]);
  if (!periods.length) return <Card><Empty icon="clock" title="No results released to you yet">HR releases results to VPs after a period is closed.</Empty></Card>;

  const complete = all.filter(hasFinal);
  const toApprove = periods.filter((p) => p.releaseStage === 'dir');
  const avg = (list) => (list.length ? list.reduce((a, r) => a + r.final, 0) / list.length : null);
  const secs = db.sections.map((s) => sectionStats(db, pid, s.id)).filter((s) => s.required);
  const invalid = secs.filter((s) => !s.valid).length;
  const depts = db.departments.map((d) => {
    const list = complete.filter((r) => r.dept === d.id);
    return { d, avg: avg(list), n: list.length, total: all.filter((r) => r.dept === d.id).length };
  });

  return (
    <>
      {toApprove.map((p) => (
        <Card key={p.id} title={`Waiting for review: ${p.name}`} actions={<button className="ghost" onClick={() => { setPid(p.id); go('reports'); }}>Review results</button>}>
          <p className="muted">HR has sent these results to the VPs. Review them, then approve. Faculty can see their results only after every VP approves and HR releases them.</p>
          <ApprovalPanel period={p} />
        </Card>
      ))}
      {(db.formulas || []).some((f) => f.status === 'pending') && <div className="note"><b>{(db.formulas || []).filter((f) => f.status === 'pending').length} formula(s) waiting for your approval.</b> <button className="link" onClick={() => go('formulas')}>Open Formula approvals</button></div>}
      <div className="row between"><span className="muted">Showing results for</span><PeriodPicker periods={periods} value={pid} onChange={setPid} /></div>
      <Stats>
        <Stat icon="star" label="Average final score" value={fmt(avg(complete))} sub="out of 4" tone="good" />
        <Stat icon="users" label="Personnel with a final score" value={`${complete.length} / ${all.length}`} sub={all.length - complete.length ? `${all.length - complete.length} without a score yet` : 'All have a final score'} />
        <Stat icon="chart" label="Class sections excluded" value={`${invalid} / ${secs.length}`} sub="not enough students answered" tone={invalid ? 'warn' : ''} />
        <Stat icon="calendar" label="Periods released to you" value={periods.length} />
      </Stats>
      <Card title="Average final score by department" actions={<><button className="ghost" onClick={() => go('analytics')}>Analytics</button><button onClick={() => go('reports')}>Full reports</button></>}>
        {depts.map(({ d, avg: a, n, total }) => (
          <div key={d.id} className="meter-row big">
            <span>{d.name}</span>
            <Meter value={a == null ? 0 : a / 4} tone="brand" />
            <b>{fmt(a)}</b>
            <span className="muted">{n}/{total} with a score</span>
          </div>
        ))}
        <p className="muted">If an evaluator group has no valid result, its weight is removed and the score is computed over the rest. People whose weights HR hasn't set show "—".</p>
      </Card>
    </>
  );
}
