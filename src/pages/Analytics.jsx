import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { useApp } from '../lib/store';
import { computeAll, canSeeAll } from '../lib/logic';
import { Card, PeriodPicker, Select } from '../ui';

const avg = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null);

export default function Analytics() {
  const { db, user } = useApp();
  const periods = db.periods.filter((p) => canSeeAll(user, p));
  const [dept, setDept] = useState('ALL');
  const [pid, setPid] = useState(periods[periods.length - 1]?.id);
  const data = useMemo(() => {
    const m = {};
    periods.forEach((p) => { m[p.id] = computeAll(db, p.id).filter((r) => r.status === 'complete'); });
    return m;
  }, [db, user]);
  if (!periods.length) return <Card title="Analytics"><p>No results have been released to you yet.</p></Card>;

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
        <p className="muted">Average final score of personnel whose result is complete. Only periods released to you are shown. Scores need set weights, so only College faculty appear until HR sets the other weights.</p>
        <div className="chart"><ResponsiveContainer><LineChart data={trend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis domain={[1, 5]} /><Tooltip /><Line type="monotone" dataKey="score" stroke="#1d4ed8" strokeWidth={2} connectNulls /></LineChart></ResponsiveContainer></div>
      </Card>
      <Card title="Comparison across departments" actions={<PeriodPicker periods={periods} value={pid} onChange={setPid} />}>
        <div className="chart"><ResponsiveContainer><BarChart data={compare}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="department" /><YAxis domain={[0, 5]} /><Tooltip /><Legend /><Bar dataKey="Average final score" fill="#1d4ed8" /></BarChart></ResponsiveContainer></div>
        <table><thead><tr><th>Department</th><th>Average final score</th><th>Personnel with complete result</th></tr></thead>
          <tbody>{compare.map((c) => <tr key={c.department}><td>{c.department}</td><td>{c['Average final score'] ?? '—'}</td><td>{c['Evaluated (complete)']}</td></tr>)}</tbody></table>
      </Card>
    </>
  );
}
