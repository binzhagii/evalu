import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { useApp } from '../lib/store';
import { computeAll, canSeeAll, hasFinal, itemStats, sectionStats, targetsOf, GROUPS, LOW_ITEM } from '../lib/logic';
import { Card, PeriodPicker, Select, Badge, fmt } from '../ui';

/** Per-item means for one period (counted evaluations only), keyed by evaluator group + criterion. */
function itemMeans(db, periodId, dept) {
  const people = new Set(targetsOf(db).filter((u) => dept === 'ALL' || u.dept === dept).map((u) => u.id));
  const valid = new Set(db.sections.map((s) => sectionStats(db, periodId, s.id)).filter((s) => s.valid).map((s) => s.section.id));
  const tasks = db.tasks.filter((t) => t.periodId === periodId && people.has(t.targetId) && (t.group !== 'ST' || valid.has(t.sectionId)));
  const out = new Map();
  for (const g of [...new Set(tasks.map((t) => t.group))]) for (const r of itemStats(tasks.filter((t) => t.group === g))) out.set(`${g}|${r.criterionId}`, { ...r, group: g });
  return out;
}

const avg = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null);

export default function Analytics() {
  const { db, user } = useApp();
  const periods = db.periods.filter((p) => canSeeAll(user, p));
  const [dept, setDept] = useState('ALL');
  const [pid, setPid] = useState(periods[periods.length - 1]?.id);
  const data = useMemo(() => {
    const m = {};
    periods.forEach((p) => { m[p.id] = computeAll(db, p.id).filter(hasFinal); });
    return m;
  }, [db, user]);
  if (!periods.length) return <Card title="Analytics"><p>No results have been released to you yet.</p></Card>;
  // FR19: item-level results; flag items below LOW_ITEM, and items that were also low in the previous period
  const idx = periods.findIndex((p) => p.id === pid);
  const now = itemMeans(db, pid, dept);
  const before = idx > 0 ? itemMeans(db, periods[idx - 1].id, dept) : new Map();
  const items = [...now.entries()].map(([k, r]) => ({ ...r, prev: before.get(k)?.mean ?? null, consistent: r.low && before.get(k)?.low })).sort((a, b) => a.mean - b.mean);
  const text = (id) => db.criteria.find((c) => c.id === id)?.text || id;

  const trend = periods.map((p) => ({
    period: p.name.replace(/ \(.*\)/, ''),
    score: avg(data[p.id].filter((r) => dept === 'ALL' || r.target.dept === dept).map((r) => r.final)),
  }));
  const compare = db.departments.map((d) => ({
    department: d.name.replace(' (College)', ''),
    'Average final score': avg((data[pid] || []).filter((r) => r.target.dept === d.id).map((r) => r.final)),
    'Evaluated (complete)': (data[pid] || []).filter((r) => r.target.dept === d.id).length,
  }));

  return (
    <>
      <Card title="Trend over time" actions={<label className="inline">Department <Select value={dept} onChange={setDept}><option value="ALL">All</option>{db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></label>}>
        <p className="muted">Average final score of personnel with a final score. Only periods released to you are shown.</p>
        <div className="chart"><ResponsiveContainer><LineChart data={trend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis domain={[1, 5]} /><Tooltip /><Line type="monotone" dataKey="score" stroke="#b3001b" strokeWidth={2} connectNulls /></LineChart></ResponsiveContainer></div>
      </Card>
      <Card title="Comparison across departments" actions={<PeriodPicker periods={periods} value={pid} onChange={setPid} />}>
        <div className="chart"><ResponsiveContainer><BarChart data={compare}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="department" /><YAxis domain={[0, 5]} /><Tooltip /><Legend /><Bar dataKey="Average final score" fill="#b3001b" /></BarChart></ResponsiveContainer></div>
        <table><thead><tr><th>Department</th><th>Average final score</th><th>Personnel with complete result</th></tr></thead>
          <tbody>{compare.map((c) => <tr key={c.department}><td>{c.department}</td><td>{c['Average final score'] ?? '—'}</td><td>{c['Evaluated (complete)']}</td></tr>)}</tbody></table>
      </Card>
      <Card title="Item-level results" actions={<span className="muted">{dept === 'ALL' ? 'All departments' : db.departments.find((d) => d.id === dept)?.name} · {periods[idx]?.name}</span>}>
        <p className="muted">Each evaluation item, lowest first. Items averaging below <b>{LOW_ITEM.toFixed(2)}</b> (below "Very Satisfactory") are flagged; <b>consistently low</b> means it was also below {LOW_ITEM.toFixed(2)} in the previous period. Use these to plan training. Change the department above and the period in the comparison card.</p>
        {items.length === 0 ? <p className="muted">No item results for this selection.</p> : (
          <table className="items">
            <thead><tr><th>Item</th><th>Evaluator group</th><th>Mean</th><th>Previous period</th><th>Answers</th><th>Flag</th></tr></thead>
            <tbody>{items.map((r) => (
              <tr key={r.group + r.criterionId} className={r.low ? 'low' : ''}>
                <td>{text(r.criterionId)}</td><td>{GROUPS[r.group]}</td><td><b>{fmt(r.mean)}</b></td><td>{fmt(r.prev)}</td><td>{r.n}</td>
                <td>{r.consistent ? <Badge kind="overdue">consistently low</Badge> : r.low ? <Badge kind="pending">low</Badge> : ''}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
    </>
  );
}
