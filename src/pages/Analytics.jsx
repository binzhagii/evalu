// Analytics (FR19): descriptive analytics for HR and the VPs. Every card says where its numbers come from
// (which evaluations, which rule, which formula) and what it can NOT tell, so the charts can be checked and trusted.
import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { useApp } from '../lib/store';
import {
  computeAll, canSeeAll, hasFinal, itemStats, sectionStats, targetsOf, targetsInDept, countedSections, personIn, policyFor, ruleWords, TARGET_TYPES, deptName, groupName,
  formOfTask, itemCategory, interpretation, commentParts, cronbachAlpha, alphaLabel,
} from '../lib/logic';
import { Card, PeriodPicker, Select, Badge, Tabs, useTab, usePages, fmt, pct } from '../ui';
import { summarizeComments } from '../lib/comments';

const NO_ANIM = { isAnimationActive: false }; // no moving graphics
const avg = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null);
const short = (name) => name.replace(/\s*\((College|sample|current, sample)\)/g, '').replace(/^School of /, '');
const BAND_COLOR = { Outstanding: '#7a0012', Satisfactory: '#b3001b', Fair: '#9aa0a6', Poor: '#3c4043' };

/** "Where this comes from": the data and method behind a card, so the numbers can be checked. */
function Source({ children }) {
  return (
    <details className="source">
      <summary>Where this comes from</summary>
      <ul>{children}</ul>
    </details>
  );
}

/** The evaluations that count for a period (students only from classes that counted). */
function countedTasks(db, periodId, dept) {
  const people = new Set((dept === 'ALL' ? targetsOf(db, periodId) : targetsInDept(db, periodId, dept)).map((u) => u.id));
  const valid = countedSections(db, periodId);
  return db.tasks.filter((t) => t.periodId === periodId && t.response && !t.response.redacted && people.has(t.targetId) && (t.group !== 'ST' || valid.has(t.sectionId)));
}

/** Per-item means for one period, keyed by evaluator group + criterion. */
function itemMeans(db, periodId, dept) {
  const tasks = countedTasks(db, periodId, dept);
  const out = new Map();
  for (const g of [...new Set(tasks.map((t) => t.group))]) for (const r of itemStats(tasks.filter((t) => t.group === g), policyFor(db, periodId).lowItem)) out.set(`${g}|${r.criterionId}`, { ...r, group: g });
  return out;
}

/** Average of the answers per form category (e.g. "Assessment of learners"), per evaluator group. */
function categoryMeans(db, periodId, dept) {
  const m = new Map();
  for (const t of countedTasks(db, periodId, dept)) {
    const ins = formOfTask(db, t);
    if (!ins) continue;
    const catOf = new Map(ins.items.map((it) => [it.criterionId, itemCategory(it)]));
    for (const [cid, v] of Object.entries(t.response.answers)) {
      const k = `${t.group}|${catOf.get(cid) || 'General'}`;
      const x = m.get(k) || { group: t.group, category: catOf.get(cid) || 'General', sum: 0, n: 0, people: new Set() };
      x.sum += v; x.n++; x.people.add(t.targetId);
      m.set(k, x);
    }
  }
  return [...m.values()].map((x) => ({ ...x, mean: x.sum / x.n, people: x.people.size }));
}

/** Why two periods may not be directly comparable. */
function comparability(db, a, b) {
  const notes = [];
  const pa = policyFor(db, a.id), pb = policyFor(db, b.id);
  for (const [k, label] of [['bands', 'rating bands'], ['participationRule', 'participation rule'], ['participationPercent', 'participation rule'], ['participationMin', 'participation rule'], ['decimals', 'rounding'], ['missingGroup', 'missing-group rule']]) {
    if (JSON.stringify(pa[k]) !== JSON.stringify(pb[k])) notes.push(`different ${label}`);
  }
  if (JSON.stringify(a.rules) !== JSON.stringify(b.rules)) notes.push('different group weights');
  const forms = (p) => new Set(db.tasks.filter((t) => t.periodId === p.id && t.response?.instrumentId).map((t) => t.response.instrumentId));
  const fa = forms(a), fb = forms(b);
  if (fa.size && fb.size && ([...fa].some((x) => !fb.has(x)) || [...fb].some((x) => !fa.has(x)))) notes.push('different form versions (questions or weights changed)');
  return [...new Set(notes)];
}

/* ---------------- cards ---------------- */

/** Plain-language findings from the cards below, each with a possible action. Descriptive only. */
function KeyFindings({ findings }) {
  return (
    <Card title="Key findings">
      <p className="muted">What the data shows for the selected period and department, with a possible action. These describe what happened; they do not explain why, and they are not predictions.</p>
      {findings.length === 0 ? <p className="muted">Not enough data for findings yet.</p> : (
        <table>
          <thead><tr><th>Finding</th><th>Possible action</th><th>From</th></tr></thead>
          <tbody>{findings.map((f, i) => <tr key={i}><td>{f.text}</td><td>{f.action}</td><td className="muted small">{f.from}</td></tr>)}</tbody>
        </table>
      )}
    </Card>
  );
}

function PeriodCompare({ db, periods, data, dept }) {
  const [aSel, setA] = useState(periods.at(-2)?.id || '');
  const [bSel, setB] = useState(periods.at(-1)?.id || '');
  if (periods.length < 2) return null;
  const A = periods.find((p) => p.id === aSel) || periods.at(-2);
  const B = periods.find((p) => p.id === bSel) || periods.at(-1);
  const inDept = (r) => dept === 'ALL' || r.dept === dept;
  const before = new Map((data[A.id] || []).filter(inDept).map((r) => [r.targetId, r]));
  const rows = (data[B.id] || []).filter(inDept).filter((r) => before.has(r.targetId))
    .map((r) => ({ r, a: before.get(r.targetId).final, b: r.final, d: +(r.final - before.get(r.targetId).final).toFixed(2) }))
    .sort((x, y) => x.d - y.d);
  const up = rows.filter((x) => x.d > 0).length, down = rows.filter((x) => x.d < 0).length;
  const notes = comparability(db, A, B);
  return (
    <Card title="Compare two periods" actions={<span className="row" style={{ margin: 0 }}>
      <Select value={A.id} onChange={setA}>{periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
      <span className="muted">→</span>
      <Select value={B.id} onChange={setB}>{periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
    </span>}>
      {notes.length
        ? <div className="note warn"><b>Compare with care:</b> these periods used {notes.join(', ')}. A change in score may come from the rules, not from performance.</div>
        : <div className="note ok">These periods used the same policy, weights and form versions, so their scores are directly comparable.</div>}
      {rows.length === 0 ? <p className="muted">No one has a final rating in both periods.</p> : (
        <>
          <p className="muted">{rows.length} people with a final rating in both periods: <b>{up}</b> improved, <b>{down}</b> declined, {rows.length - up - down} unchanged. Largest declines first, so HR can see who may need support or training.</p>
          <table>
            <thead><tr><th>Name</th><th>Type</th><th>Department</th><th>{A.name}</th><th>{B.name}</th><th>Change</th></tr></thead>
            <tbody>{rows.map(({ r, a, b, d }) => (
              <tr key={r.targetId}><td>{r.target.name}</td><td>{TARGET_TYPES[r.type]}</td><td>{deptName(db, r.dept)}</td><td>{fmt(a)}</td><td>{fmt(b)}</td>
                <td>{d > 0 ? <Badge kind="completed">▲ {d.toFixed(2)}</Badge> : d < 0 ? <Badge kind="overdue">▼ {Math.abs(d).toFixed(2)}</Badge> : <span className="muted">no change</span>}</td></tr>
            ))}</tbody>
          </table>
        </>
      )}
      <Source>
        <li>Final ratings of the same people in both periods (only people with a final rating in both).</li>
        <li>Change = final rating in the second period − final rating in the first.</li>
        <li>The warning compares each period's rules, group percentages and the form versions used in the answers.</li>
      </Source>
    </Card>
  );
}

const TABS = [['find', 'Key findings'], ['ratings', 'Ratings'], ['time', 'Over time'], ['part', 'Participation'], ['questions', 'Questions'], ['comments', 'Comments and agreement']];
export default function Analytics() {
  const { db, user } = useApp();
  const [tab, setTab] = useTab(TABS, 'find');
  const periods = db.periods.filter((p) => canSeeAll(user, p));
  const [dept, setDept] = useState('ALL');
  const [pidSel, setPid] = useState(periods[periods.length - 1]?.id);
  const [allCats, setAllCats] = useState(false);
  const pid = periods.some((p) => p.id === pidSel) ? pidSel : periods[periods.length - 1]?.id; // newest if none chosen yet
  const data = useMemo(() => {
    const m = {};
    periods.forEach((p) => { m[p.id] = computeAll(db, p.id).filter(hasFinal); });
    return m;
  }, [db, user]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!periods.length) return <Card title="Analytics"><p>No results have been released to you yet.</p></Card>;

  const period = periods.find((p) => p.id === pid);
  const pol = policyFor(db, pid);
  const inDept = (r) => dept === 'ALL' || r.dept === dept;
  const depts = db.departments.filter((d) => dept === 'ALL' || d.id === dept);
  const now = (data[pid] || []).filter(inDept);
  const text = (id) => db.criteria.find((c) => c.id === id)?.text || id;

  // trend (with earlier records imported by HR, FR21)
  const userDept = (id) => db.users.find((u) => u.id === id)?.dept;
  const earlierRows = db.pastResults.filter((r) => dept === 'ALL' || userDept(r.userId) === dept);
  const earlierLabels = [...new Set(earlierRows.map((r) => r.periodLabel))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const trend = [
    ...earlierLabels.map((label) => ({ period: label, earlier: avg(earlierRows.filter((r) => r.periodLabel === label).map((r) => r.final)) })),
    ...periods.map((p) => ({ period: p.name.replace(/ \(.*\)/, ''), score: avg((data[p.id] || []).filter(inDept).map((r) => r.final)) })),
  ];

  // rating distribution per department (with the period's bands)
  const bands = ['Outstanding', 'Satisfactory', 'Fair', 'Poor'];
  const distribution = db.departments.map((d) => {
    const rs = (data[pid] || []).filter((r) => r.dept === d.id);
    const row = { department: short(d.name), total: rs.length };
    for (const b of bands) row[b] = rs.filter((r) => interpretation(r.final, false, pol) === b || (b === 'Outstanding' && interpretation(r.final, true, pol) === 'Excellent') || (b === 'Satisfactory' && interpretation(r.final, true, pol) === 'Good' && String(r.type).startsWith('NTP'))).length;
    return row;
  }).filter((r) => r.total && (dept === 'ALL' || db.departments.find((d) => short(d.name) === r.department)?.id === dept));

  // participation per department
  const participation = depts.map((d) => {
    const st = db.sections.filter((s) => personIn(db, pid, db.users.find((u) => u.id === s.facultyId)).dept === d.id).map((s) => sectionStats(db, pid, s.id)).filter((s) => s.required);
    const enrolled = st.reduce((a, s) => a + s.required, 0), answered = st.reduce((a, s) => a + s.responded, 0);
    return { department: short(d.name), classes: st.length, counted: st.filter((s) => s.valid).length, excluded: st.filter((s) => !s.valid).length, enrolled, answered, rate: enrolled ? answered / enrolled : null };
  }).filter((r) => r.classes);

  // department comparison
  const compare = db.departments.map((d) => ({
    department: short(d.name),
    'Average final rating': avg((data[pid] || []).filter((r) => r.dept === d.id).map((r) => r.final)),
    people: (data[pid] || []).filter((r) => r.dept === d.id).length,
  })).filter((r) => r.people);

  // category strengths and weaknesses
  const cats = categoryMeans(db, pid, dept).sort((a, b) => a.mean - b.mean);

  // evaluator agreement: students vs supervisors for the same person
  const gaps = now.map((r) => {
    const gs = Object.entries(r.groups).filter(([, g]) => g.score != null).map(([k, g]) => ({ k, s: g.score }));
    if (gs.length < 2) return null;
    const hi = Math.max(...gs.map((g) => g.s)), lo = Math.min(...gs.map((g) => g.s));
    return { r, gs, gap: +(hi - lo).toFixed(2) };
  }).filter(Boolean).sort((a, b) => b.gap - a.gap);
  const bigGaps = gaps.filter((g) => g.gap >= 0.5);

  // what the comments are about (comment analysis)
  const plain = (c) => { const p = commentParts(c); return p ? (p.text ?? [p.plan, p.improve].filter(Boolean).join(' ')) : ''; };
  const csum = summarizeComments(countedTasks(db, pid, dept).map((t) => t.response.comment).filter(Boolean).map(plain));

  // item-level results
  const idx = periods.findIndex((p) => p.id === pid);
  const nowItems = itemMeans(db, pid, dept);
  const before = idx > 0 ? itemMeans(db, periods[idx - 1].id, dept) : new Map();
  const items = [...nowItems.entries()].map(([k, r]) => ({ ...r, prev: before.get(k)?.mean ?? null, consistent: r.low && before.get(k)?.low })).sort((a, b) => a.mean - b.mean);

  // key findings (descriptive)
  const findings = [];
  const ranked = compare.filter((c) => c['Average final rating'] != null).sort((a, b) => a['Average final rating'] - b['Average final rating']);
  if (dept === 'ALL' && ranked.length > 1) findings.push({ text: `${ranked[0].department} has the lowest average final rating (${fmt(ranked[0]['Average final rating'])}); ${ranked.at(-1).department} the highest (${fmt(ranked.at(-1)['Average final rating'])}).`, action: `Look at ${ranked[0].department}'s weakest categories and items below before planning support.`, from: 'Department comparison' });
  const poorFair = now.filter((r) => ['Fair', 'Poor'].includes(interpretation(r.final, String(r.type).startsWith('NTP'), pol))).length;
  if (now.length) findings.push({ text: `${poorFair} of ${now.length} people (${pct(poorFair / now.length)}) are rated Fair or Poor.`, action: poorFair ? 'Coordinate with their deans or heads for a development plan.' : 'No one below Satisfactory: no urgent follow-up.', from: 'Rating distribution' });
  const excluded = participation.reduce((a, p) => a + p.excluded, 0), classes = participation.reduce((a, p) => a + p.classes, 0);
  const lowPart = [...participation].filter((p) => p.rate != null).sort((a, b) => a.rate - b.rate)[0];
  if (classes) findings.push({ text: `${excluded} of ${classes} classes were excluded for low participation${lowPart ? `; the lowest response rate is ${lowPart.department} (${pct(lowPart.rate)})` : ''}.`, action: excluded ? 'Send reminders earlier next period, or ask advisers to give class time for the evaluation.' : 'Participation was enough in every class.', from: 'Participation' });
  if (cats.length) findings.push({ text: `Weakest category: "${cats[0].category}" (${groupName(db, cats[0].group)}, average ${fmt(cats[0].mean)}).`, action: 'A possible topic for training or an in-service seminar (INSET).', from: 'Strengths and weaknesses' });
  const consistent = items.filter((i) => i.consistent);
  if (consistent.length) findings.push({ text: `${consistent.length} question(s) were low in this period and the one before, e.g. "${text(consistent[0].criterionId)}".`, action: 'Low twice in a row suggests a lasting need rather than a one-time result.', from: 'Item-level results' });
  const worstTopic = [...csum.topics].filter((x) => x.negative).sort((a, b) => b.negative - a.negative)[0];
  if (worstTopic) findings.push({ text: `In the written comments, "${worstTopic.label}" has the most negative or mixed remarks (${worstTopic.negative} of ${worstTopic.count}).`, action: 'Read those comments (Reports → All comments) and consider it for coaching or training.', from: 'What the comments are about' });
  const near = now.filter((r) => r.margin?.nearBand);
  if (near.length) findings.push({ text: `${near.length} of ${now.length} final ratings are close to a band limit (their margin of error crosses it), e.g. ${near[0].target.name} ${fmt(near[0].final)} ± ${near[0].margin.moe.toFixed(2)}.`, action: 'Use these with care for rewards or support; more student answers make them surer.', from: 'How sure are the results?' });
  if (gaps.length) findings.push({ text: `${bigGaps.length} of ${gaps.length} people have a gap of 0.50 or more between evaluator groups.`, action: bigGaps.length ? 'Review these with the dean: the groups see the person differently (e.g. classroom vs. compliance).' : 'Evaluator groups broadly agree.', from: 'Evaluator agreement' });

  const filters = (
    <span className="row" style={{ margin: 0 }}>
      <PeriodPicker periods={periods} value={pid} onChange={setPid} />
      <label className="inline">Department <Select value={dept} onChange={setDept}><option value="ALL">All</option>{db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></label>
    </span>
  );

  return (
    <>
      <div className="row between">
        <p className="muted" style={{ margin: 0 }}>Start with <b>Key findings</b> for a short summary. The term and department you choose apply to every part.</p>
        {filters}
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'find' && <KeyFindings findings={findings} />}

      {tab === 'time' && <Card title="Trend over time">
        <p className="muted">Average final rating per period. The dashed grey line shows earlier records imported by HR (from before evalU).</p>
        <div className="chart"><ResponsiveContainer><LineChart data={trend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis domain={[1, 4]} /><Tooltip /><Legend />
          <Line {...NO_ANIM} type="monotone" dataKey="score" name="evalU periods" stroke="#b3001b" strokeWidth={2} connectNulls />
          <Line {...NO_ANIM} type="monotone" dataKey="earlier" name="Earlier records (imported)" stroke="#6b6b6b" strokeWidth={2} strokeDasharray="5 4" connectNulls /></LineChart></ResponsiveContainer></div>
        <Source>
          <li>evalU periods: the average of the final ratings of everyone with a final rating, in periods released to you.</li>
          <li>Earlier records: final ratings HR imported from the Excel files (Reports → Earlier records). They were <b>not recomputed</b> by evalU, so their forms and weights may differ: compare with care.</li>
          <li>A trend shows change over time; it does not explain the cause.</li>
        </Source>
      </Card>}

      {tab === 'ratings' && <Card title="Rating distribution">
        <p className="muted">How many people fall in each rating band, per department ({period?.name}).</p>
        {distribution.length === 0 ? <p className="muted">No final ratings for this selection.</p> : (
          <>
            <div className="chart"><ResponsiveContainer><BarChart data={distribution}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="department" /><YAxis allowDecimals={false} /><Tooltip /><Legend />
              {bands.map((b) => <Bar {...NO_ANIM} key={b} dataKey={b} stackId="a" fill={BAND_COLOR[b]} />)}</BarChart></ResponsiveContainer></div>
            <table><thead><tr><th>Department</th>{bands.map((b) => <th key={b}>{b}</th>)}<th>Total</th></tr></thead>
              <tbody>{distribution.map((r) => <tr key={r.department}><td>{r.department}</td>{bands.map((b) => <td key={b}>{r[b]}</td>)}<td>{r.total}</td></tr>)}</tbody></table>
          </>
        )}
        <Source>
          <li>Final ratings of the period, placed in the bands of the period's policy (Outstanding from {pol.bands[0].toFixed(2)}, Satisfactory from {pol.bands[1].toFixed(2)}, Fair from {pol.bands[2].toFixed(2)}).</li>
          <li>Non-teaching staff use Excellent / Good / Fair / Poor; they are counted in the matching band.</li>
          <li>People without a final rating (e.g. weights not set) are not counted.</li>
        </Source>
      </Card>}

      {tab === 'part' && <Card title="Participation">
        <p className="muted">Students' response rate and classes left out because not enough answered ({period?.name}: {ruleWords(pol)}).</p>
        {participation.length === 0 ? <p className="muted">No class lists for this selection.</p> : (
          <table><thead><tr><th>Department</th><th>Classes</th><th>Counted</th><th>Excluded</th><th>Students answered</th><th>Response rate</th></tr></thead>
            <tbody>{participation.map((r) => <tr key={r.department}><td>{r.department}</td><td>{r.classes}</td><td>{r.counted}</td><td>{r.excluded ? <Badge kind="overdue">{r.excluded}</Badge> : 0}</td><td>{r.answered} of {r.enrolled}</td><td>{r.rate == null ? '—' : pct(r.rate)}</td></tr>)}</tbody></table>
        )}
        <Source>
          <li>Student evaluation tasks of the period (one per student per class), from the class lists.</li>
          <li>A class counts when its answers reach the period's participation rule; excluded classes are left out of the teachers' results.</li>
          <li>Response rate = students who answered ÷ students enrolled. A high rate does not prove the answers are representative.</li>
        </Source>
      </Card>}

      {tab === 'ratings' && <Card title="Comparison across departments">
        <p className="muted">Average final rating per department ({period?.name}).</p>
        <div className="chart"><ResponsiveContainer><BarChart data={compare}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="department" /><YAxis domain={[0, 4]} /><Tooltip /><Legend /><Bar {...NO_ANIM} dataKey="Average final rating" fill="#b3001b" /></BarChart></ResponsiveContainer></div>
        <table><thead><tr><th>Department</th><th>Average final rating</th><th>People with a final rating</th></tr></thead>
          <tbody>{compare.map((c) => <tr key={c.department}><td>{c.department}</td><td>{fmt(c['Average final rating'])}</td><td>{c.people}</td></tr>)}</tbody></table>
        <Source>
          <li>Average of the final ratings of the people in each department who have a final rating.</li>
          <li>Departments use different forms (e.g. Basic Ed vs. college), so differences may partly come from the forms.</li>
        </Source>
      </Card>}

      {tab === 'questions' && <Card title="Strengths and weaknesses by category">
        <p className="muted">Average answer per form category, lowest first ({dept === 'ALL' ? 'all departments' : deptName(db, dept)}, {period?.name}). Categories below {pol.lowItem.toFixed(2)} are flagged.</p>
        {cats.length === 0 ? <p className="muted">No answers for this selection.</p> : (
          <table><thead><tr><th>Category</th><th>Evaluator group</th><th>Average</th><th>Answers</th><th>People rated</th><th /></tr></thead>
            <tbody>{(allCats ? cats : cats.slice(0, 12)).map((c) => <tr key={c.group + c.category} className={c.mean < pol.lowItem ? 'low' : ''}><td>{c.category}</td><td>{groupName(db, c.group)}</td><td><b>{fmt(c.mean)}</b></td><td>{c.n}</td><td>{c.people}</td><td>{c.mean < pol.lowItem && <Badge kind="overdue">low</Badge>}</td></tr>)}</tbody></table>
        )}
        {cats.length > 12 && <p><button className="ghost" onClick={() => setAllCats(!allCats)}>{allCats ? 'Show the 12 lowest' : `Show all ${cats.length} categories`}</button></p>}
        <Source>
          <li>Every answer (1–4) in the evaluations that count, grouped by the category of its question on UB's form (e.g. "Management of the lesson").</li>
          <li>Average = mean of those answers (category weights are not applied here, so this is not the weighted score).</li>
          <li>Students' answers only from classes that reached the participation rule.</li>
        </Source>
      </Card>}

      {tab === 'comments' && <Card title="What the comments are about">
        <p className="muted">Written comments of the evaluations that count, sorted by topic ({dept === 'ALL' ? 'all departments' : deptName(db, dept)}, {period?.name}).</p>
        {csum.total === 0 ? <p className="muted">No comments for this selection{user.role === 'HR' ? '' : ', or they are not shared with you'}.</p> : (
          <>
            <p><b>{csum.total}</b> comments: <b>{csum.positive}</b> positive, <b>{csum.negative}</b> negative, <b>{csum.mixed}</b> mixed, {csum.neutral} neutral · {csum.suggestions} with a suggestion.</p>
            <table><thead><tr><th>Topic</th><th>Comments</th><th>Positive</th><th>Negative or mixed</th></tr></thead>
              <tbody>{csum.topics.map((x) => <tr key={x.key}><td>{x.label}</td><td>{x.count}</td><td>{x.positive}</td><td>{x.negative ? <Badge kind="overdue">{x.negative}</Badge> : 0}</td></tr>)}</tbody></table>
          </>
        )}
        <Source>
          <li>Each comment is tagged by evalU's built-in word lists (English and Filipino/Taglish): positive or negative words, "not …" turns a word around, and words such as "please" or "sana" mark a suggestion.</li>
          <li>A comment can have several topics or none. The tags help HR find what to read; they can miss sarcasm, so read the comments under Reports → All comments.</li>
          <li>The comments stay inside evalU; nothing is sent to an outside AI service.</li>
        </Source>
      </Card>}

      {tab === 'comments' && <Card title="Do the evaluator groups agree?">
        <p className="muted">Where the evaluator groups rate the same person differently ({period?.name}). A gap of 0.50 or more is flagged.</p>
        {gaps.length === 0 ? <p className="muted">No one was rated by two or more groups.</p> : (
          <table><thead><tr><th>Name</th><th>Ratings by group</th><th>Gap</th></tr></thead>
            <tbody>{gaps.slice(0, 15).map(({ r, gs, gap }) => (
              <tr key={r.targetId}><td>{r.target.name} <span className="muted small">· {TARGET_TYPES[r.type]}</span></td>
                <td>{gs.map((g) => `${groupName(db, g.k)} ${fmt(g.s)}`).join(' · ')}</td>
                <td>{gap >= 0.5 ? <Badge kind="overdue">{gap.toFixed(2)}</Badge> : gap.toFixed(2)}</td></tr>
            ))}</tbody></table>
        )}
        <Source>
          <li>Each group's score for the person (the same scores that make up the final rating).</li>
          <li>Gap = highest group score − lowest group score. Largest gaps first (top 15).</li>
          <li>A gap shows that groups see different things (classroom vs. compliance); it does not say who is right.</li>
        </Source>
      </Card>}

      {tab === 'time' && <PeriodCompare db={db} periods={periods} data={data} dept={dept} />}

      {tab === 'ratings' && <Sureness db={db} pid={pid} now={now} dept={dept} />}

      {tab === 'questions' && <Card title="Results per question">
        <p className="muted">Each question, lowest first. Questions averaging below <b>{pol.lowItem.toFixed(2)}</b> (the low question line in Policy &amp; rules) are flagged; <b>consistently low</b> means it was also low in the previous period.</p>
        {items.length === 0 ? <p className="muted">No item results for this selection.</p> : (
          <Questions items={items} text={text} resetKey={`${pid}|${dept}`} />
        )}
        <Source>
          <li>Average of each question's answers in the evaluations that count, per evaluator group.</li>
          <li>"Previous period" is the period released just before the selected one.</li>
          <li>The cutoff comes from the period's policy (Policy &amp; rules), not a fixed number in the code.</li>
        </Source>
      </Card>}
    </>
  );
}

/** Every question, a page at a time. */
function Questions({ items, text, resetKey }) {
  const { db } = useApp();
  const { rows, bar } = usePages(items, resetKey, 10);
  return (
    <>
      <table className="items">
        <thead><tr><th>Question</th><th>Evaluator group</th><th>Average</th><th>Previous period</th><th>Answers</th><th>Flag</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.group + r.criterionId} className={r.low ? 'low' : ''}>
            <td>{text(r.criterionId)}</td><td>{groupName(db, r.group)}</td><td><b>{fmt(r.mean)}</b></td><td>{fmt(r.prev)}</td><td>{r.n}</td>
            <td>{r.consistent ? <Badge kind="overdue">consistently low</Badge> : r.low ? <Badge kind="pending">low</Badge> : ''}</td>
          </tr>
        ))}</tbody>
      </table>
      {bar}
    </>
  );
}

/**
 * How sure are the results: the 95% margin of error of each final rating, the ones whose range crosses a band
 * limit, and the reliability (Cronbach's alpha) of each form used in the period.
 */
function Sureness({ db, pid, now, dept }) {
  const withMargin = now.filter((r) => r.margin);
  const count = (c) => withMargin.filter((r) => r.margin.confidence === c).length;
  const watch = withMargin.filter((r) => r.margin.nearBand || r.margin.confidence === 'Low').sort((a, b) => b.margin.moe - a.margin.moe).slice(0, 10);
  // reliability of each form: the answers of every counted response on that form version
  const byForm = new Map();
  for (const t of db.tasks) {
    if (t.periodId !== pid || !t.response || t.response.redacted || !t.response.instrumentId) continue;
    if (dept !== 'ALL' && db.users.find((u) => u.id === t.targetId)?.dept !== dept) continue;
    (byForm.get(t.response.instrumentId) || byForm.set(t.response.instrumentId, []).get(t.response.instrumentId)).push(t.response.answers);
  }
  const forms = [...byForm.entries()].map(([id, answers]) => {
    const ins = db.instruments.find((i) => i.id === id);
    if (!ins) return null;
    const rows = answers.map((a) => ins.items.map((it) => a[it.criterionId])).filter((row) => row.every((v) => Number.isFinite(v)));
    const alpha = cronbachAlpha(rows);
    return { id, name: ins.name.replace(' (UB tool)', ''), group: ins.group, n: rows.length, k: ins.items.length, alpha };
  }).filter((x) => x && x.n >= 5).sort((a, b) => (a.alpha ?? 2) - (b.alpha ?? 2));
  const tone = { Excellent: 'completed', Good: 'completed', Acceptable: 'info', Questionable: 'pending', Poor: 'overdue' };
  return (
    <Card title="How sure are the results?">
      <p className="muted">A rating comes from the people who answered, not from everyone. The margin of error says how much it could change if others had answered; the form reliability says whether a form's questions measure consistently.</p>
      {withMargin.length > 0 && (
        <p>Final ratings: <b>{count('High')}</b> high confidence (± 0.10 or less), <b>{count('Moderate')}</b> moderate (up to ± 0.25), <b>{count('Low')}</b> low (more than ± 0.25).</p>
      )}
      {watch.length > 0 && (
        <table>
          <thead><tr><th>Name</th><th>Final rating</th><th>Margin (95%)</th><th>Could be</th></tr></thead>
          <tbody>{watch.map((r) => (
            <tr key={r.targetId}><td>{r.target.name}</td><td><b>{fmt(r.final)}</b></td><td>± {r.margin.moe.toFixed(2)} <span className="muted small">({r.margin.low.toFixed(2)} to {r.margin.high.toFixed(2)})</span></td>
              <td>{r.margin.nearBand ? <Badge kind="pending">{r.margin.nearBand.join(' or ')}</Badge> : <Badge kind="overdue">low confidence</Badge>}</td></tr>
          ))}</tbody>
        </table>
      )}
      {!watch.length && withMargin.length > 0 && <p className="muted">No final rating is close to a band limit or has low confidence.</p>}
      <h4>Reliability of the forms (Cronbach's alpha)</h4>
      {forms.length === 0 ? <p className="muted">Needs at least 5 answered evaluations on a form.</p> : (
        <table>
          <thead><tr><th>Form</th><th>Rated by</th><th>Answers</th><th>Questions</th><th>Alpha</th></tr></thead>
          <tbody>{forms.map((x) => (
            <tr key={x.id}><td>{x.name}</td><td>{groupName(db, x.group)}</td><td>{x.n}</td><td>{x.k}</td>
              <td>{x.alpha == null ? <span className="muted">—</span> : <><b>{x.alpha.toFixed(2)}</b> <Badge kind={tone[alphaLabel(x.alpha)]}>{alphaLabel(x.alpha)}</Badge></>}</td></tr>
          ))}</tbody>
        </table>
      )}
      <Source>
        <li>Margin of error: 95% confidence, from the spread of the answers (Student's t), with the finite population correction for the class size; it is 0 when everyone answered. The final rating's margin combines the groups' margins with their percentages.</li>
        <li>"Could be": the rating's range crosses a band limit of the period's policy, so it could fall in either band.</li>
        <li>Cronbach's alpha: k / (k - 1) x (1 - sum of the question variances / variance of the totals), over every answered evaluation on that form version. 0.90 and up excellent, 0.80 good, 0.70 acceptable, 0.60 questionable, below poor (George &amp; Mallery, 2003). A value below 0 means the answers to the questions disagree with each other, as with random or careless answering.</li>
        <li>These measure how precise the numbers are, not how good the person is.</li>
      </Source>
    </Card>
  );
}
