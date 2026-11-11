import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import {
  GROUPS, TARGET_TYPES, computeAll, computeTarget, canSeeAll, canSeeComments, canSeeDept, deptName, userById, sectionStats,
  itemStats, formOfTask, itemCategory, hasFinal, pendingApprovals, isEvaluatee, stageAtLeast, targetsOf, commentParts, targetType,
} from '../lib/logic';
import { Card, Badge, RuleNote, PeriodPicker, Select, Meter, Stat, Stats, Empty, Avatar, ItemTable, PrintButton, fmt, pct, newestFirst, usePages, ask } from '../ui';
import { ReleaseSteps } from './Overview';
import { UbPrints, CommentText, SummarySheet, ratingWord, twoDp, UbPacket } from './CompReport';

export const STATUS_TEXT = { complete: 'Complete', reweighted: 'Complete (re-weighted)', incomplete: 'No valid result yet', 'weights-missing': 'Weights not set' };

export function visiblePeriods(db, user) {
  return db.periods.filter((p) => canSeeAll(user, p));
}

/** Category of each item, from the form version the answers were given on. */
function categoryLookup(db, tasks) {
  const ins = tasks.map((t) => t.response && formOfTask(db, t)).find(Boolean);
  if (!ins || !ins.items.some((it) => it.category)) return null;
  const m = Object.fromEntries(ins.items.map((it) => [it.criterionId, itemCategory(it)]));
  const f = (cid) => m[cid] || 'General';
  // the order of the questions on the UB form (so I, II, III come out like the printed sheet)
  f.order = Object.fromEntries(ins.items.map((it, i) => [it.criterionId, i]));
  return f;
}

/** FR14: verbatim comments grouped by source (Students, Dean, Program Chair…), never with a name. */
export function CommentsBySource({ tasks }) {
  const by = {};
  for (const t of tasks) if (t.response?.comment) (by[t.group] ||= []).push(t.response.comment);
  if (!Object.keys(by).length) return null;
  return (
    <div className="comments">
      <h4>Comments (verbatim)</h4>
      {Object.entries(by).map(([g, list]) => (
        <div key={g}><b>From {GROUPS[g]}</b><ul>{list.map((c, i) => <li key={i}><CommentText c={c} /></li>)}</ul></div>
      ))}
      <p className="muted">Comments are shown exactly as written. The names of students are never shown.</p>
    </div>
  );
}

/** FR15: final breakdown + per-subject, dean and program chair reports with per-item rating distributions. */
export function ResultCard({ res, db, periodId, own = false }) {
  const tasks = db.tasks.filter((t) => t.periodId === periodId && t.targetId === res.targetId);
  const validSecs = new Set(res.sections.filter((s) => s.valid).map((s) => s.section.id));
  const groupTasks = (g) => tasks.filter((t) => t.group === g && (g !== 'ST' || validSecs.has(t.sectionId)));
  const shown = hasFinal(res);
  return (
    <div className="result">
      <div className="result-head">
        {!own && <Avatar name={res.target.name} size={44} />}
        <div className="result-who">
          {!own && <b>{res.target.name}</b>}
          <span className="muted">{TARGET_TYPES[res.type]} · {deptName(db, res.target.dept)}</span>
        </div>
        <div className={`score-box ${shown ? '' : 'none'}`}>
          <span className="score-num">{shown ? fmt(res.final) : '—'}</span>
          <span className="muted">{res.status === 'complete' ? 'final score / 4' : res.status === 'reweighted' ? `final score / 4 · over ${res.basis}%` : STATUS_TEXT[res.status]}</span>
        </div>
      </div>
      {res.status === 'reweighted' && <div className="note">Computed over <b>{res.basis}%</b> instead of {res.total}%: there is no valid result from {res.missing.map((g) => GROUPS[g]).join(', ')}, so {res.missing.length > 1 ? 'their weights are' : 'its weight is'} removed from the computation (HRMC rule). Rounded to two decimal places.</div>}
      {res.status === 'incomplete' && <div className="note warn">No final score: none of the evaluator groups has a valid result yet.</div>}
      {res.status === 'weights-missing' && <div className="note warn">No final score yet. HR has not set the weight for: {res.missingW.map((g) => GROUPS[g]).join(', ')}.</div>}
      <div className="group-rows">
        {Object.entries(res.groups).map(([g, v]) => (
          <div key={g} className="meter-row big">
            <span><b>{GROUPS[g]}</b> <span className="muted">{v.weight == null ? 'weight not set' : `counts ${v.weight}%`} · {v.responded}/{v.required} responses</span></span>
            <Meter value={v.score == null ? 0 : v.score / 4} tone="brand" />
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
                <td><div className="meter-row"><Meter value={x.rate} mark={0.5} /><span>{x.responded}/{x.required} <span className="muted">(needs {x.needed})</span></span></div></td>
                <td>{x.valid ? <Badge kind="completed">counted</Badge> : <Badge kind="overdue">excluded (below half + 1)</Badge>}</td><td>{fmt(x.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="item-reports">
        {res.sections.filter((s) => s.valid).map((s) => {
          const ts = tasks.filter((t) => t.sectionId === s.section.id);
          return (
            <details key={s.section.id}><summary>Per-item results · {s.section.code} {s.section.subject} <span className="muted">({s.responded} students)</span></summary>
              <ItemTable rows={itemStats(ts)} criteria={db.criteria} categoryOf={categoryLookup(db, ts)} />
            </details>
          );
        })}
        {Object.keys(res.groups).filter((g) => g !== 'ST').map((g) => {
          const ts = groupTasks(g);
          if (!ts.some((t) => t.response)) return null;
          return (
            <details key={g}><summary>Per-item results · {GROUPS[g]} <span className="muted">({ts.filter((t) => t.response).length} evaluation{ts.filter((t) => t.response).length > 1 ? 's' : ''})</span></summary>
              <ItemTable rows={itemStats(ts)} criteria={db.criteria} categoryOf={categoryLookup(db, ts)} />
            </details>
          );
        })}
      </div>
      <CommentsBySource tasks={tasks} />
    </div>
  );
}

/** FR16: department-wide per-item summary: the department, number of respondents and results per item. */
export function DeptSummary({ db, periodId, dept }) {
  const people = new Set(targetsOf(db).filter((u) => u.dept === dept).map((u) => u.id));
  const tasks = db.tasks.filter((t) => t.periodId === periodId && people.has(t.targetId));
  const valid = new Set(db.sections.filter((s) => s.dept === dept).map((s) => sectionStats(db, periodId, s.id)).filter((s) => s.valid).map((s) => s.section.id));
  const counted = tasks.filter((t) => t.group !== 'ST' || valid.has(t.sectionId));
  const groups = [...new Set(counted.map((t) => t.group))];
  const respondents = counted.filter((t) => t.response).length;
  const results = computeAll(db, periodId).filter((r) => r.target.dept === dept);
  const withScore = results.filter(hasFinal);
  const avg = withScore.length ? withScore.reduce((a, r) => a + r.final, 0) / withScore.length : null;
  return (
    <div className="dept-summary">
      <Stats>
        <Stat icon="users" label="Department" value={deptName(db, dept)} sub={`${results.length} personnel evaluated`} />
        <Stat icon="check" label="Total respondents" value={respondents} sub="evaluations counted" tone="good" />
        <Stat icon="star" label="Average final score" value={fmt(avg)} sub={`${withScore.length} with a final score`} />
      </Stats>
      {groups.length === 0 && <Empty icon="report" title="No evaluations for this department in this period" />}
      {groups.map((g) => {
        const ts = counted.filter((t) => t.group === g);
        return (
          <div key={g}>
            <h4>{GROUPS[g]} <span className="muted">· {ts.filter((t) => t.response).length} respondents</span></h4>
            <ItemTable rows={itemStats(ts)} criteria={db.criteria} categoryOf={categoryLookup(db, ts)} />
          </div>
        );
      })}
    </div>
  );
}

/** FR17: VPs approve results before HR can release them to faculty. */
export function ApprovalPanel({ period }) {
  const { db, user, act } = useApp();
  if (period.releaseStage === 'hr') return null;
  const approvals = period.approvals || [];
  const waiting = pendingApprovals(db, period);
  const mine = approvals.some((a) => a.userId === user.id);
  return (
    <div className={`note ${waiting.length ? 'warn' : 'ok'} approval`}>
      <div>
        <b>Vice President approval.</b>{' '}
        {approvals.length ? `Approved by ${approvals.map((a) => userById(db, a.userId)?.name || 'a former account').join(', ')}.` : 'Not approved yet.'}{' '}
        {period.releaseStage === 'dir' && (waiting.length ? `Waiting for: ${waiting.map((u) => u.name).join(', ')}.` : 'All approved: HR can release the results to faculty.')}
      </div>
      {user.role === 'DIR' && period.releaseStage === 'dir' && !mine && (
        <button onClick={async () => { if (await ask('Approve for release to faculty?', `You approve the results of ${period.name}. HR can then release them to faculty.`, { ok: 'Approve' })) act('approveRelease', { periodId: period.id }); }}>Approve for release to faculty</button>
      )}
    </div>
  );
}

/** FR21: final ratings imported from records kept before evalU. */
export function PastRecords({ userId }) {
  const { db, user, act } = useApp();
  const [csv, setCsv] = useState('');
  const [out, setOut] = useState(null);
  const all = newestFirst(db.pastResults.filter((r) => !userId || r.userId === userId));
  const { rows, bar } = usePages(all);
  const isHR = user.role === 'HR';
  return (
    <>
      {all.length === 0 ? <p className="muted">No earlier records.</p> : (<>
        <table>
          <thead><tr>{!userId && <th>Name</th>}<th>Period</th><th>Final score</th><th>Note</th>{isHR && <th />}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              {!userId && <td>{userById(db, r.userId)?.name}</td>}<td>{r.periodLabel}</td><td><b>{fmt(r.final)}</b></td><td className="muted">{r.note || '—'}</td>
              {isHR && <td><button className="ghost" onClick={async () => { if (await ask('Delete this imported record?', 'This earlier final score is removed from the records.', { ok: 'Delete record', danger: true })) act('deletePastResult', { id: r.id }); }}>Delete</button></td>}
            </tr>
          ))}</tbody>
        </table>
        {bar}
      </>)}
      {isHR && !userId && (
        <div className="import-box">
          <h4>Import earlier records</h4>
          <p className="muted">Paste one result per line: <code>username or email, period, final score, note (optional)</code>. Example: <code>fac_a1@ubaguio.edu, AY 2022-23 Term 2, 4.05</code></p>
          <textarea rows={4} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="username or email, period, final score, note" />
          <div className="row"><button onClick={async () => { const r = await act('importPastResults', { csv }); if (r) { setOut(r); if (!r.errorCount) setCsv(''); } }}>Import</button></div>
          {out && <div className={`note ${out.errorCount ? 'warn' : 'ok'}`}>{out.added} record(s) imported.{out.errorCount > 0 && <> {out.errorCount} row(s) skipped:<ul>{out.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></>}</div>}
        </div>
      )}
    </>
  );
}

/** Offices that usually ask for results, so HR picks one instead of typing it. */
const OFFICES = [
  'Office of the President', 'Office of the VP for Academic Affairs', 'Office of the VP for Administration',
  'Office of the Registrar', 'Quality Assurance / Accreditation Office', 'Scholarship and Grants Office', 'Research and Development Office',
];

/** FR18: HR records a request from another office; the results go to the person's dean only. */
function ResultRequests({ periodId }) {
  const { db, act } = useApp();
  const [f, setF] = useState({ targetId: '', office: '' });
  const [msg, setMsg] = useState('');
  const period = db.periods.find((p) => p.id === periodId);
  const list = newestFirst(db.requests.filter((r) => r.periodId === periodId));
  const people = targetsOf(db).filter(isEvaluatee);
  const [other, setOther] = useState(false);
  const pickOffice = (v) => { if (v === '__other') { setOther(true); setF({ ...f, office: '' }); } else setF({ ...f, office: v }); };
  return (
    <>
      <p className="muted">When another office asks for a person's evaluation results, HRMC releases them only to that person's dean (or principal), who is then responsible for any further release. The request is recorded and the dean is notified.</p>
      {!stageAtLeast(period, 'faculty') ? <div className="note warn">Results can be shared after they are released to faculty.</div> : (
        <div className="row">
          <Select value={f.targetId} onChange={(v) => setF({ ...f, targetId: v })}><option value="">Whose results…</option>{people.map((u) => <option key={u.id} value={u.id}>{u.name} · {deptName(db, u.dept)}</option>)}</Select>
          {other
            ? <><input placeholder="Name of the requesting office" value={f.office} onChange={(e) => setF({ ...f, office: e.target.value })} className="wide" /><button className="ghost" onClick={() => { setOther(false); setF({ ...f, office: '' }); }}>Back to list</button></>
            : <Select value={f.office} onChange={pickOffice}><option value="">Requesting office…</option>{[...new Set([...OFFICES, ...db.requests.map((r) => r.office)])].map((o) => <option key={o} value={o}>{o}</option>)}<option value="__other">Other office…</option></Select>}
          <button onClick={async () => { setMsg(''); const r = await act('recordResultRequest', { periodId, ...f }); if (r) { setMsg(`Released to ${r.sentTo.join(', ')}.`); setF({ targetId: '', office: '' }); setOther(false); } }}>Release through the dean</button>
        </div>
      )}
      {msg && <div className="note ok">{msg}</div>}
      {list.length > 0 && (
        <table>
          <thead><tr><th>When</th><th>Results of</th><th>Requested by</th><th>Released to</th></tr></thead>
          <tbody>{list.map((r) => <tr key={r.id}><td>{new Date(r.at).toLocaleString()}</td><td>{userById(db, r.targetId)?.name}</td><td>{r.office}</td><td>{userById(db, r.headId)?.name}</td></tr>)}</tbody>
        </table>
      )}
    </>
  );
}

// Comments are stored encrypted; the server decrypts them only for those allowed to read them.
function Comments({ periodId }) {
  const { db } = useApp();
  const rows = db.tasks.filter((t) => t.periodId === periodId && t.response?.comment);
  if (!rows.length) return <p className="muted">No comments in this period.</p>;
  return (
    <table>
      <thead><tr><th>Evaluated</th><th>From</th><th>Comment (verbatim)</th></tr></thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.id}><td>{userById(db, t.targetId).name}</td><td>{GROUPS[t.group]}</td><td><CommentText c={t.response.comment} /></td></tr>
        ))}
      </tbody>
    </table>
  );
}

/** Plain words for a comment on paper (the two-box comments are labelled). */
const commentWords = (c) => {
  const p = commentParts(c);
  if (!p) return '';
  return p.text != null ? p.text : [p.plan && `Development plan: ${p.plan}`, p.improve && `Areas to be improved: ${p.improve}`].filter(Boolean).join(' · ');
};

/** The formal printout of a Reports tab (only on paper / PDF): UB header + a bordered table. */
function FormalPrint({ tab, db, pid, period, all, secRows, bySubject, dept, selected }) {
  const ntpOf = (r) => String(r.type).startsWith('NTP');
  const remark = (r) => (r.status === 'complete' ? 'Complete' : r.status === 'reweighted' ? `Computed over ${r.basis}%` : STATUS_TEXT[r.status]);
  let sheet = null;
  if (tab === 'overall') {
    sheet = <SummarySheet title="Evaluation Summary of Personnel" period={period}
      info={[['Personnel evaluated', all.length], ['With a final rating', all.filter(hasFinal).length]]}
      sections={[{ columns: ['Name', 'Type', 'Department', 'Final rating', 'Interpretation', 'Remarks'],
        rows: all.map((r) => [r.target.name.toUpperCase(), TARGET_TYPES[r.type], deptName(db, r.target.dept), twoDp(r.final), ratingWord(r.final, ntpOf(r)), remark(r)]) }]} />;
  } else if (tab === 'subject') {
    sheet = <SummarySheet title="Faculty Evaluation Summary per Subject" period={period}
      sections={[{ columns: ['Subject', 'Sections', 'Counted sections', 'Average rating', 'Interpretation'],
        rows: Object.entries(bySubject).map(([sub, list]) => {
          const v = list.filter((s) => s.valid);
          const a = v.length ? v.reduce((x, s) => x + s.score, 0) / v.length : null;
          return [sub, list.length, v.length, twoDp(a), ratingWord(a)];
        }) }]} />;
  } else if (tab === 'section') {
    sheet = <SummarySheet title="Faculty Evaluation Summary per Section" period={period}
      info={[['Rule', 'A class counts only if at least half of the class plus one answered']]}
      sections={[{ columns: ['Section', 'Subject', 'Faculty', 'Respondents', 'Response rate', 'Result', 'Rating', 'Interpretation'],
        rows: secRows.map((s) => [s.section.code, s.section.subject, userById(db, s.section.facultyId)?.name.toUpperCase(), `${s.responded} of ${s.required}`, pct(s.rate), s.valid ? 'Counted' : 'Excluded', twoDp(s.score), s.valid ? ratingWord(s.score) : '—']) }]} />;
  } else if (tab === 'department') {
    const people = new Set(targetsOf(db).filter((u) => u.dept === dept).map((u) => u.id));
    const valid = new Set(db.sections.filter((s) => s.dept === dept).map((s) => sectionStats(db, pid, s.id)).filter((s) => s.valid).map((s) => s.section.id));
    const counted = db.tasks.filter((t) => t.periodId === pid && people.has(t.targetId) && (t.group !== 'ST' || valid.has(t.sectionId)));
    const results = all.filter((r) => r.target.dept === dept);
    const withScore = results.filter(hasFinal);
    const avg = withScore.length ? withScore.reduce((a, r) => a + r.final, 0) / withScore.length : null;
    // one table per evaluator group and form (e.g. the Program Chair rates the Dean and the faculty on different forms)
    const answered = counted.filter((t) => t.response);
    const keyOf = (t) => t.group + '|' + (formOfTask(db, t)?.id || '');
    const groupSections = [...new Set(answered.map(keyOf))].map((k) => {
      const ts = answered.filter((t) => keyOf(t) === k);
      const g = ts[0].group;
      const kinds = [...new Set(ts.map((t) => TARGET_TYPES[targetType(db, userById(db, t.targetId))]))].join(', ');
      const catOf = categoryLookup(db, ts);
      const order = catOf?.order || {};
      const stats = itemStats(ts).sort((a, b) => (order[a.criterionId] ?? 999) - (order[b.criterionId] ?? 999));
      const rows = []; let last = null; let ci = 0; let n = 0;
      for (const x of stats) {
        const c = catOf?.(x.criterionId);
        if (catOf && c !== last) { rows.push({ cat: `${ROMAN_N[ci] || ci + 1}. ${c}` }); ci++; last = c; n = 0; }
        rows.push([`${++n}. ${db.criteria.find((q) => q.id === x.criterionId)?.text || x.criterionId}`, twoDp(x.mean), x.n]);
      }
      return { heading: `By the ${GROUPS[g]} · rating the ${kinds} · ${ts.length} respondent${ts.length === 1 ? '' : 's'}`, columns: ['Item', 'Mean', 'Answers'], rows, num: false };
    });
    sheet = <SummarySheet title="Department Evaluation Summary" period={period}
      info={[['Department', deptName(db, dept)], ['Personnel evaluated', results.length], ['Total respondents', counted.filter((t) => t.response).length], ['Average final rating', `${twoDp(avg)} ${avg == null ? '' : `(${ratingWord(avg)})`}`]]}
      sections={[{ heading: 'Personnel', columns: ['Name', 'Final rating', 'Interpretation', 'Remarks'], rows: results.map((r) => [r.target.name.toUpperCase(), twoDp(r.final), ratingWord(r.final, ntpOf(r)), remark(r)]) }, ...groupSections]} />;
  } else if (tab === 'comments') {
    const rows = db.tasks.filter((t) => t.periodId === pid && t.response?.comment).map((t) => [userById(db, t.targetId)?.name.toUpperCase(), GROUPS[t.group], commentWords(t.response.comment)]);
    sheet = <SummarySheet title="Evaluation Comments (Verbatim)" period={period} showKey={false}
      info={[['Note', 'Comments are printed word for word, without the names of the evaluators']]}
      sections={[{ columns: ['Evaluated', 'From', 'Comment'], rows }]} />;
  } else if (tab === 'individual' && selected) {
    // one person: UB's own printouts (Comprehensive, Performance Evaluation sheets, Verbatim)
    const res = computeTarget(db, pid, selected);
    return <div className="print-only ub-mine"><UbPacket db={db} period={period} res={res} ctrl={all.findIndex((r) => r.targetId === selected) + 1} what="all" /></div>;
  }
  return sheet && <div className="print-only sum-print">{sheet}</div>;
}
const ROMAN_N = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const FORMAL_TABS = ['overall', 'subject', 'section', 'department', 'comments', 'individual'];

export default function Reports() {
  const { db, user, act } = useApp();
  const periods = visiblePeriods(db, user);
  const [pidSel, setPid] = useState(periods[periods.length - 1]?.id);
  const pid = periods.some((p) => p.id === pidSel) ? pidSel : periods[periods.length - 1]?.id; // newest if none chosen yet
  const [tab, setTab] = useState(user.role === 'HR' ? 'ubprint' : 'overall');
  const [tid, setTid] = useState('');
  const [deptSel, setDept] = useState(db.departments[0]?.id);
  const dept = db.departments.some((d) => d.id === deptSel) ? deptSel : db.departments[0]?.id;
  const all = useMemo(() => (pid ? computeAll(db, pid) : []), [db, pid]);
  const period = db.periods.find((p) => p.id === pid);
  const selected = tid || all[0]?.targetId;
  // FR20: opening a person's result or a department summary is recorded in the audit log
  useEffect(() => {
    if (tab === 'individual' && selected && pid) act('logView', { periodId: pid, targetId: selected, what: 'individual' });
    if (tab === 'department' && dept && pid) act('logView', { periodId: pid, what: 'department' });
  }, [tab, selected, dept, pid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!periods.length) return <Card><Empty icon="clock" title="No results released to you yet">Results appear here after HR closes a period and releases them.</Empty></Card>;
  const secRows = db.sections.map((s) => sectionStats(db, pid, s.id)).filter((s) => s.required);
  const bySubject = {};
  secRows.forEach((s) => { (bySubject[s.section.subject] ||= []).push(s); });
  const tabs = [['overall', 'Overall'], ['subject', 'Per subject'], ['section', 'Per section'], ['individual', 'Individual report'], ['department', 'Department summary']];
  if (canSeeComments(user, period)) tabs.push(['comments', 'All comments']);
  if (user.role === 'HR') { tabs.unshift(['ubprint', 'Print UB reports']); tabs.push(['requests', 'Requests from offices']); }
  tabs.push(['records', 'Earlier records']);
  const withFinal = all.filter(hasFinal);
  const avg = withFinal.length ? withFinal.reduce((x, y) => x + y.final, 0) / withFinal.length : null;
  const invalid = secRows.filter((x) => !x.valid).length;

  return (
    <>
    <div className="row between no-print">
      <PeriodPicker periods={periods} value={pid} onChange={setPid} />
      <span className="row" style={{ margin: 0 }}><span className="muted">Who can see these results:</span><ReleaseSteps stage={period.releaseStage} /></span>
    </div>
    <ApprovalPanel period={period} />
    <Stats>
      <Stat icon="star" label="Average final score" value={fmt(avg)} sub="personnel with a final score" tone="good" />
      <Stat icon="users" label="With a final score" value={`${withFinal.length} / ${all.length}`} sub={`${all.filter((r) => r.status === 'reweighted').length} re-weighted (a group missing)`} />
      <Stat icon="chart" label="Classes excluded" value={`${invalid} / ${secRows.length}`} sub="below half of the class + 1" tone={invalid ? 'warn' : ''} />
    </Stats>
    <Card actions={tab !== 'ubprint' && <PrintButton label={tab === 'individual' ? 'Print UB report' : 'Print'} />}>
      <div className="tabs no-print" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab !== 'ubprint' && !FORMAL_TABS.includes(tab) && <h3 className="print-only">evalU · {period.name} · {tabs.find((t) => t[0] === tab)?.[1]}</h3>}
      {FORMAL_TABS.includes(tab) && <FormalPrint tab={tab} db={db} pid={pid} period={period} all={all} secRows={secRows} bySubject={bySubject} dept={dept} selected={selected} />}
      <div className={FORMAL_TABS.includes(tab) ? 'no-print' : undefined}>
      {tab === 'overall' && (
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Department</th><th>Final score</th><th>Status</th></tr></thead>
          <tbody>{all.map((r) => (
            <tr key={r.targetId}><td><button className="link" onClick={() => { setTid(r.targetId); setTab('individual'); }}>{r.target.name}</button></td><td>{TARGET_TYPES[r.type]}</td><td>{deptName(db, r.target.dept)}</td>
              <td><div className="meter-row"><Meter value={r.final == null ? 0 : r.final / 4} tone="brand" /><b>{fmt(r.final)}</b></div></td>
              <td>{r.status === 'complete' ? <Badge kind="completed">complete</Badge> : r.status === 'reweighted' ? <Badge kind="info">over {r.basis}%</Badge> : <Badge kind="pending">{STATUS_TEXT[r.status].toLowerCase()}</Badge>}</td></tr>
          ))}</tbody>
        </table>
      )}
      {tab === 'subject' && (
        <table>
          <thead><tr><th>Subject</th><th>Sections</th><th>Counted sections</th><th>Average score (counted sections)</th></tr></thead>
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
            <tr key={s.section.id}><td>{s.section.code}</td><td>{userById(db, s.section.facultyId).name}</td><td><div className="meter-row"><Meter value={s.rate} mark={0.5} /><span>{s.responded}/{s.required} <span className="muted">(needs {s.needed})</span></span></div></td><td>{pct(s.rate)}</td>
              <td>{s.valid ? <Badge kind="completed">counted</Badge> : <Badge kind="overdue">excluded</Badge>}</td><td>{fmt(s.score)}</td></tr>
          ))}</tbody>
        </table>
      )}
      {tab === 'individual' && (
        <>
          <label className="inline no-print"><span className="muted">Person</span> <Select value={selected} onChange={setTid}>{all.map((r) => <option key={r.targetId} value={r.targetId}>{r.target.name}</option>)}</Select></label>
          {selected && <ResultCard res={computeTarget(db, pid, selected)} db={db} periodId={pid} />}
        </>
      )}
      {tab === 'department' && (
        <>
          <label className="inline no-print"><span className="muted">Department</span> <Select value={dept} onChange={setDept}>{db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></label>
          <DeptSummary db={db} periodId={pid} dept={dept} />
        </>
      )}
      {tab === 'comments' && <Comments periodId={pid} />}
      </div>
      {tab === 'ubprint' && <UbPrints periodId={pid} />}
      {tab === 'requests' && <ResultRequests periodId={pid} />}
      {tab === 'records' && <PastRecords />}
    </Card>
    <details className="note no-print"><summary>How results are calculated</summary><RuleNote /></details>
    </>
  );
}

/** FR16/FR18: a dean's (or principal's) view of their department's released results. */
export function DeptResults() {
  const { db, user, act } = useApp();
  const periods = db.periods.filter((p) => canSeeDept(user, p));
  const [pidSel, setPid] = useState(periods[periods.length - 1]?.id);
  const pid = periods.some((p) => p.id === pidSel) ? pidSel : periods[periods.length - 1]?.id; // newest if none chosen yet
  const [tid, setTid] = useState('');
  const people = useMemo(() => (pid ? computeAll(db, pid).filter((r) => r.target.dept === user.dept && r.targetId !== user.id) : []), [db, pid, user]);
  const requests = db.requests.filter((r) => r.headId === user.id);
  const selected = tid || '';
  useEffect(() => { if (pid) act('logView', { periodId: pid, what: 'department' }); }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (pid && selected) act('logView', { periodId: pid, targetId: selected, what: 'individual' }); }, [pid, selected]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!periods.length) return <Card><Empty icon="clock" title="No department results released yet">Department results appear after HR releases a period to faculty.</Empty></Card>;
  return (
    <>
      {requests.length > 0 && (
        <Card title="Results released to you on request">
          <p className="muted">These results were requested by another office and released to you, as HRMC policy requires. Any further release is your responsibility.</p>
          <table><thead><tr><th>When</th><th>Results of</th><th>Period</th><th>Requested by</th><th /></tr></thead>
            <tbody>{requests.map((r) => <tr key={r.id}><td>{new Date(r.at).toLocaleDateString()}</td><td>{userById(db, r.targetId)?.name}</td><td>{db.periods.find((p) => p.id === r.periodId)?.name}</td><td>{r.office}</td>
              <td><button className="ghost" onClick={() => { setPid(r.periodId); setTid(r.targetId); }}>Open</button></td></tr>)}</tbody></table>
        </Card>
      )}
      <Card title={`Department summary · ${deptName(db, user.dept)}`} actions={<><PeriodPicker periods={periods} value={pid} onChange={(v) => { setPid(v); setTid(''); }} /><PrintButton /></>}>
        <DeptSummary db={db} periodId={pid} dept={user.dept} />
      </Card>
      <Card title="Individual results in your department">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Final score</th><th>Status</th></tr></thead>
          <tbody>{people.map((r) => (
            <tr key={r.targetId}><td><button className="link" onClick={() => setTid(r.targetId)}>{r.target.name}</button></td><td>{TARGET_TYPES[r.type]}</td>
              <td><div className="meter-row"><Meter value={r.final == null ? 0 : r.final / 4} tone="brand" /><b>{fmt(r.final)}</b></div></td><td>{STATUS_TEXT[r.status]}</td></tr>
          ))}</tbody>
        </table>
        {selected && people.some((r) => r.targetId === selected) && <ResultCard res={computeTarget(db, pid, selected)} db={db} periodId={pid} />}
      </Card>
    </>
  );
}

