import { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { GROUPS, STAGES, taskStatus, sectionStats, userById, computeAll, canSeeAll, THRESHOLD } from '../lib/logic';
import { Card, Stat, Stats, Meter, Badge, Empty, PeriodPicker, Icon, useNav, fmt, pct, dueText, daysUntil } from '../ui';

const STAGE_SHORT = { hr: 'HR only', dir: 'Directors/VPs', faculty: 'Faculty' };

/** HR → Directors/VPs → Faculty, with the current step highlighted. */
export function ReleaseSteps({ stage }) {
  const at = STAGES.indexOf(stage);
  return (
    <ol className="steps">
      {STAGES.map((s, i) => <li key={s} className={i < at ? 'done' : i === at ? 'now' : ''}>{i <= at && <Icon name="check" size={13} />}{STAGE_SHORT[s]}</li>)}
    </ol>
  );
}

/* ---------------- HR ---------------- */
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
  const low = classes.filter((x) => x.st.belowHalf).sort((a, b) => a.st.rate - b.st.rate);
  const active = db.users.filter((u) => u.active);
  const waiting = active.filter((u) => u.mustChangePassword).length;

  return (
    <>
      <Stats>
        <Stat icon="check" label="Responses received" value={tasks.length ? pct(done / tasks.length) : '—'} sub={`${done} of ${tasks.length} evaluations in open periods`} tone="good" />
        <Stat icon="clock" label="Overdue evaluations" value={overdue} sub={overdue ? 'Send reminders under Assignments' : 'Nothing overdue'} tone={overdue ? 'bad' : ''} />
        <Stat icon="chart" label="Classes below 50%" value={`${low.length} / ${classes.length}`} sub="Would be invalidated if closed now" tone={low.length ? 'warn' : ''} />
        <Stat icon="users" label="Active accounts" value={active.length} sub={waiting ? `${waiting} not signed in yet` : 'All have signed in'} />
      </Stats>

      <div className="grid-2">
        <Card title="Open evaluation periods" actions={<button className="ghost" onClick={() => go('periods')}>Manage</button>}>
          {open.length === 0 ? <Empty icon="calendar" title="No period is open">Create one under Periods &amp; release.</Empty> : open.map((p) => {
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
                  <div key={g} className="meter-row sub"><span>{GROUPS[g]}</span><Meter value={v.done / v.n} /><span>{v.done}/{v.n}</span></div>
                ))}
              </div>
            );
          })}
        </Card>

        <Card title="Classes needing attention" actions={<button className="ghost" onClick={() => go('monitor')}>See all</button>}>
          {low.length === 0 ? <Empty title="Every class meets the 50% rule" /> : (
            <ul className="plain-list">
              {low.slice(0, 6).map(({ p, st }) => (
                <li key={p.id + st.section.id}>
                  <div><b>{st.section.code}</b> <span className="muted">· {userById(db, st.section.facultyId)?.name}{open.length > 1 ? ` · ${p.name}` : ''}</span></div>
                  <div className="meter-row"><Meter value={st.rate} mark={THRESHOLD} /><span>{st.responded}/{st.required}</span></div>
                </li>
              ))}
              {low.length > 6 && <li className="muted">and {low.length - 6} more…</li>}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Results release" actions={<button className="ghost" onClick={() => go('periods')}>Manage</button>}>
        <table>
          <thead><tr><th>Period</th><th>Status</th><th>Who can see results</th></tr></thead>
          <tbody>
            {[...db.periods].reverse().map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.status === 'open' ? <Badge kind="info">open</Badge> : <Badge kind="muted">closed</Badge>}</td>
                <td><ReleaseSteps stage={p.releaseStage} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

/* ---------------- Director / VP ---------------- */
export function DirectorOverview() {
  const { db, user } = useApp();
  const go = useNav();
  const periods = db.periods.filter((p) => canSeeAll(user, p));
  const [pid, setPid] = useState(periods[periods.length - 1]?.id);
  const all = useMemo(() => (pid ? computeAll(db, pid) : []), [db, pid]);
  if (!periods.length) return <Card><Empty icon="clock" title="No results released to you yet">HR releases results to Directors/VPs after a period is closed.</Empty></Card>;

  const complete = all.filter((r) => r.status === 'complete');
  const avg = (list) => (list.length ? list.reduce((a, r) => a + r.final, 0) / list.length : null);
  const secs = db.sections.map((s) => sectionStats(db, pid, s.id)).filter((s) => s.required);
  const invalid = secs.filter((s) => !s.valid).length;
  const depts = db.departments.map((d) => {
    const list = complete.filter((r) => r.target.dept === d.id);
    return { d, avg: avg(list), n: list.length, total: all.filter((r) => r.target.dept === d.id).length };
  });

  return (
    <>
      <div className="row between"><span className="muted">Showing results for</span><PeriodPicker periods={periods} value={pid} onChange={setPid} /></div>
      <Stats>
        <Stat icon="star" label="Average final score" value={fmt(avg(complete))} sub="out of 5, complete results only" tone="good" />
        <Stat icon="users" label="Personnel with a final score" value={`${complete.length} / ${all.length}`} sub={all.length - complete.length ? `${all.length - complete.length} incomplete or waiting for weights` : 'All complete'} />
        <Stat icon="chart" label="Class sections invalidated" value={`${invalid} / ${secs.length}`} sub="fewer than 50% of students answered" tone={invalid ? 'warn' : ''} />
        <Stat icon="calendar" label="Periods released to you" value={periods.length} />
      </Stats>
      <Card title="Average final score by department" actions={<><button className="ghost" onClick={() => go('analytics')}>Analytics</button><button onClick={() => go('reports')}>Full reports</button></>}>
        {depts.map(({ d, avg: a, n, total }) => (
          <div key={d.id} className="meter-row big">
            <span>{d.name}</span>
            <Meter value={a == null ? 0 : a / 5} tone="brand" />
            <b>{fmt(a)}</b>
            <span className="muted">{n}/{total} complete</span>
          </div>
        ))}
        <p className="muted">Scores need every evaluator group's weight. Groups HR hasn't set weights for show "—".</p>
      </Card>
    </>
  );
}
