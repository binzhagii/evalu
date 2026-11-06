import { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { GROUPS, TARGET_TYPES, computeAll, computeTarget, canSeeAll, canSeeComments, deptName, userById, sectionStats, STAGE_LABEL } from '../lib/logic';
import { Card, Badge, RuleNote, PeriodPicker, Select, Meter, Stat, Stats, Empty, Avatar, fmt, pct } from '../ui';
import { ReleaseSteps } from './Overview';

const STATUS_TEXT = { complete: 'Complete', incomplete: 'Incomplete', 'weights-missing': 'Weights not set' };

export function visiblePeriods(db, user) {
  return db.periods.filter((p) => canSeeAll(user, p));
}

export function ResultCard({ res, db, own = false }) {
  return (
    <div className="result">
      <div className="result-head">
        {!own && <Avatar name={res.target.name} size={44} />}
        <div className="result-who">
          {!own && <b>{res.target.name}</b>}
          <span className="muted">{TARGET_TYPES[res.type]} · {deptName(db, res.target.dept)}</span>
        </div>
        <div className={`score-box ${res.status === 'complete' ? '' : 'none'}`}>
          <span className="score-num">{res.status === 'complete' ? fmt(res.final) : '—'}</span>
          <span className="muted">{res.status === 'complete' ? 'final score / 5' : STATUS_TEXT[res.status]}</span>
        </div>
      </div>
      {res.status === 'incomplete' && <div className="note warn">No final score yet. There is no valid result from: {res.missing.map((g) => GROUPS[g]).join(', ')}.</div>}
      {res.status === 'weights-missing' && <div className="note warn">No final score yet. HR has not set the weight for: {res.missingW.map((g) => GROUPS[g]).join(', ')}.</div>}
      <div className="group-rows">
        {Object.entries(res.groups).map(([g, v]) => (
          <div key={g} className="meter-row big">
            <span><b>{GROUPS[g]}</b> <span className="muted">{v.weight == null ? 'weight not set' : `counts ${v.weight}%`} · {v.responded}/{v.required} responses</span></span>
            <Meter value={v.score == null ? 0 : v.score / 5} tone="brand" />
            <b>{fmt(v.score)}</b>
          </div>
        ))}
      </div>
      {res.sections.length > 0 && (
        <table>
          <thead><tr><th>Class</th><th>Students answered</th><th>Result</th><th>Score</th></tr></thead>
          <tbody>
            {res.sections.map((x) => (
              <tr key={x.section.id}>
                <td>{x.section.code} <span className="muted">{x.section.subject}</span></td>
                <td><div className="meter-row"><Meter value={x.rate} mark={0.5} /><span>{x.responded}/{x.required}</span></div></td>
                <td>{x.valid ? <Badge kind="completed">valid</Badge> : <Badge kind="overdue">invalidated (&lt;50%)</Badge>}</td><td>{fmt(x.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Comments are stored encrypted; the server decrypts them only for HR and released Directors/VPs.
function Comments({ periodId }) {
  const { db } = useApp();
  const rows = db.tasks.filter((t) => t.periodId === periodId && t.response?.comment);
  if (!rows.length) return <p className="muted">No comments in this period.</p>;
  return (
    <table>
      <thead><tr><th>Evaluated</th><th>From</th><th>Comment (verbatim)</th></tr></thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.id}><td>{userById(db, t.targetId).name}</td><td>{GROUPS[t.group]}</td><td>{t.response.comment}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Reports() {
  const { db, user } = useApp();
  const periods = visiblePeriods(db, user);
  const [pid, setPid] = useState(periods[periods.length - 1]?.id);
  const [tab, setTab] = useState('overall');
  const [tid, setTid] = useState('');
  const all = useMemo(() => (pid ? computeAll(db, pid) : []), [db, pid]);
  const period = db.periods.find((p) => p.id === pid);

  if (!periods.length) return <Card><Empty icon="clock" title="No results released to you yet">Results appear here after HR closes a period and releases them.</Empty></Card>;
  const secRows = db.sections.map((s) => sectionStats(db, pid, s.id)).filter((s) => s.required);
  const bySubject = {};
  secRows.forEach((s) => { (bySubject[s.section.subject] ||= []).push(s); });
  const tabs = [['overall', 'Overall'], ['subject', 'Per subject'], ['section', 'Per section'], ['individual', 'Individual summary']];
  if (canSeeComments(user, period)) tabs.push(['comments', 'Dean/Chair comments']);
  const selected = tid || all[0]?.targetId;
  const complete = all.filter((x) => x.status === 'complete');
  const avg = complete.length ? complete.reduce((x, y) => x + y.final, 0) / complete.length : null;
  const invalid = secRows.filter((x) => !x.valid).length;

  return (
    <>
    <div className="row between">
      <PeriodPicker periods={periods} value={pid} onChange={setPid} />
      <span className="row" style={{ margin: 0 }}><span className="muted">Who can see these results:</span><ReleaseSteps stage={period.releaseStage} /></span>
    </div>
    <Stats>
      <Stat icon="star" label="Average final score" value={fmt(avg)} sub="complete results only" tone="good" />
      <Stat icon="users" label="With a final score" value={`${complete.length} / ${all.length}`} sub="personnel evaluated" />
      <Stat icon="chart" label="Classes invalidated" value={`${invalid} / ${secRows.length}`} sub="below the 50% rule" tone={invalid ? 'warn' : ''} />
    </Stats>
    <Card>
      <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'overall' && (
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Department</th><th>Final score</th><th>Status</th></tr></thead>
          <tbody>{all.map((r) => (
            <tr key={r.targetId}><td><button className="link" onClick={() => { setTid(r.targetId); setTab('individual'); }}>{r.target.name}</button></td><td>{TARGET_TYPES[r.type]}</td><td>{deptName(db, r.target.dept)}</td>
              <td><div className="meter-row"><Meter value={r.final == null ? 0 : r.final / 5} tone="brand" /><b>{fmt(r.final)}</b></div></td>
              <td>{r.status === 'complete' ? <Badge kind="completed">complete</Badge> : <Badge kind="pending">{STATUS_TEXT[r.status].toLowerCase()}</Badge>}</td></tr>
          ))}</tbody>
        </table>
      )}
      {tab === 'subject' && (
        <table>
          <thead><tr><th>Subject</th><th>Sections</th><th>Valid sections</th><th>Average score (valid sections)</th></tr></thead>
          <tbody>{Object.entries(bySubject).map(([sub, list]) => {
            const v = list.filter((s) => s.valid);
            return <tr key={sub}><td>{sub}</td><td>{list.length}</td><td>{v.length}</td><td>{fmt(v.length ? v.reduce((a, s) => a + s.score, 0) / v.length : null)}</td></tr>;
          })}</tbody>
        </table>
      )}
      {tab === 'section' && (
        <table>
          <thead><tr><th>Section</th><th>Faculty</th><th>Responded</th><th>Rate</th><th>Result</th><th>Score</th></tr></thead>
          <tbody>{secRows.map((s) => (
            <tr key={s.section.id}><td>{s.section.code}</td><td>{userById(db, s.section.facultyId).name}</td><td><div className="meter-row"><Meter value={s.rate} mark={0.5} /><span>{s.responded}/{s.required}</span></div></td><td>{pct(s.rate)}</td>
              <td>{s.valid ? <Badge kind="completed">valid</Badge> : <Badge kind="overdue">invalidated</Badge>}</td><td>{fmt(s.score)}</td></tr>
          ))}</tbody>
        </table>
      )}
      {tab === 'individual' && (
        <>
          <label className="inline"><span className="muted">Person</span> <Select value={selected} onChange={setTid}>{all.map((r) => <option key={r.targetId} value={r.targetId}>{r.target.name}</option>)}</Select></label>
          {selected && <ResultCard res={computeTarget(db, pid, selected)} db={db} />}
        </>
      )}
      {tab === 'comments' && <Comments periodId={pid} />}
    </Card>
    <details className="note"><summary>How the 50% rule works</summary><RuleNote /></details>
    </>
  );
}
