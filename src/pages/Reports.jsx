import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { GROUPS, TARGET_TYPES, computeAll, computeTarget, canSeeAll, canSeeComments, deptName, userById, sectionStats, STAGE_LABEL } from '../lib/logic';
import { decryptText } from '../lib/crypto';
import { Card, Badge, RuleNote, PeriodPicker, Select, fmt, pct } from '../ui';

const STATUS_TEXT = { complete: 'Complete', incomplete: 'Incomplete', 'weights-missing': 'Weights not set' };

export function visiblePeriods(db, user) {
  return db.periods.filter((p) => canSeeAll(user, p));
}

export function ResultCard({ res, db }) {
  const sectionFor = (g) => (g === 'ST' ? res.sections : []);
  return (
    <div>
      <h4>{res.target.name} <span className="muted">· {TARGET_TYPES[res.type]} · {deptName(db, res.target.dept)}</span></h4>
      {res.status === 'complete' && <p className="big">Final score: {fmt(res.final)} / 5</p>}
      {res.status === 'incomplete' && <div className="note warn">Final score not available. No valid result yet for: {res.missing.map((g) => GROUPS[g]).join(', ')}.</div>}
      {res.status === 'weights-missing' && <div className="note warn">Final score not computed: weights for {res.missingW.map((g) => GROUPS[g]).join(', ')} have not been set by HR.</div>}
      <table>
        <thead><tr><th>Evaluator group</th><th>Weight</th><th>Responses</th><th>Group score</th></tr></thead>
        <tbody>
          {Object.entries(res.groups).map(([g, v]) => (
            <tr key={g}><td>{GROUPS[g]}</td><td>{v.weight == null ? 'not set' : `${v.weight}%`}</td><td>{v.responded} / {v.required}</td><td>{fmt(v.score)}</td></tr>
          ))}
        </tbody>
      </table>
      {sectionFor('ST').length > 0 && (
        <table>
          <thead><tr><th>Class section</th><th>Responded</th><th>Rate</th><th>Result</th><th>Score</th></tr></thead>
          <tbody>
            {res.sections.map((s) => (
              <tr key={s.section.id}>
                <td>{s.section.code} – {s.section.subject}</td><td>{s.responded} / {s.required}</td><td>{pct(s.rate)}</td>
                <td>{s.valid ? <Badge kind="completed">valid</Badge> : <Badge kind="overdue">invalidated (&lt;50%)</Badge>}</td><td>{fmt(s.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Comments({ periodId }) {
  const { db } = useApp();
  const [texts, setTexts] = useState({});
  const rows = db.tasks.filter((t) => t.periodId === periodId && t.response?.comment);
  useEffect(() => {
    let live = true;
    (async () => {
      const out = {};
      for (const t of rows) out[t.id] = await decryptText(t.response.comment);
      if (live) setTexts(out);
    })();
    return () => { live = false; };
  }, [periodId, db]);
  if (!rows.length) return <p className="muted">No comments in this period.</p>;
  return (
    <table>
      <thead><tr><th>Evaluated</th><th>From</th><th>Comment (verbatim)</th></tr></thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.id}><td>{userById(db, t.targetId).name}</td><td>{GROUPS[t.group]}</td><td>{texts[t.id] ?? '…'}</td></tr>
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

  if (!periods.length) return <Card title="Reports"><p>No results have been released to you yet.</p></Card>;
  const secRows = db.sections.map((s) => sectionStats(db, pid, s.id)).filter((s) => s.required);
  const bySubject = {};
  secRows.forEach((s) => { (bySubject[s.section.subject] ||= []).push(s); });
  const tabs = [['overall', 'Overall'], ['subject', 'Per subject'], ['section', 'Per section'], ['individual', 'Individual summary']];
  if (canSeeComments(user, period)) tabs.push(['comments', 'Dean/Chair comments']);
  const selected = tid || all[0]?.targetId;

  return (
    <Card title="Reports" actions={<PeriodPicker periods={periods} value={pid} onChange={setPid} />}>
      <p className="muted">Release status: {STAGE_LABEL[period.releaseStage]}</p>
      <RuleNote />
      <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : 'ghost'} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'overall' && (
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Department</th><th>Final score</th><th>Status</th></tr></thead>
          <tbody>{all.map((r) => (
            <tr key={r.targetId}><td>{r.target.name}</td><td>{TARGET_TYPES[r.type]}</td><td>{deptName(db, r.target.dept)}</td><td>{fmt(r.final)}</td><td>{STATUS_TEXT[r.status]}</td></tr>
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
            <tr key={s.section.id}><td>{s.section.code}</td><td>{userById(db, s.section.facultyId).name}</td><td>{s.responded} / {s.required}</td><td>{pct(s.rate)}</td>
              <td>{s.valid ? <Badge kind="completed">valid</Badge> : <Badge kind="overdue">invalidated</Badge>}</td><td>{fmt(s.score)}</td></tr>
          ))}</tbody>
        </table>
      )}
      {tab === 'individual' && (
        <>
          <Select value={selected} onChange={setTid}>{all.map((r) => <option key={r.targetId} value={r.targetId}>{r.target.name}</option>)}</Select>
          {selected && <ResultCard res={computeTarget(db, pid, selected)} db={db} />}
        </>
      )}
      {tab === 'comments' && <Comments periodId={pid} />}
    </Card>
  );
}
