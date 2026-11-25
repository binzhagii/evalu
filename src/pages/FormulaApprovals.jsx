// For the Vice Presidents: every formula waiting for approval, with what counts now, what would change and why.
import { useApp } from '../lib/store';
import { TARGET_TYPES, AGGREGATIONS, MISSING_RULES, ROUNDING_METHODS, deptName, formulaWords, groupName, methodOf } from '../lib/logic';
import { Card, Badge, Empty, ask } from '../ui';
import { TryIt, formulaNow } from './FormulaParts';

const short = (txt) => String(txt || '').split(':')[0];
const pctText = (w) => (w == null || w === '' ? 'not set' : `${w}%`);

/** The settings besides the percentages that differ: [name, now, new]. */
function otherChanges(db, a, b) {
  const rows = [
    ['How scores are combined', methodOf(a.method, a.methodVersion ?? 1)?.label, methodOf(b.method, b.methodVersion ?? 1)?.label],
    ['If a group has no rating', short(MISSING_RULES[a.missing]), short(MISSING_RULES[b.missing])],
    ['Rounding', `${a.rounding?.decimals} decimals, ${short(ROUNDING_METHODS[a.rounding?.method])}`, `${b.rounding?.decimals} decimals, ${short(ROUNDING_METHODS[b.rounding?.method])}`],
    ['Groups needed for a final rating', a.minGroups ?? 1, b.minGroups ?? 1],
    ['Effective from', a.effectiveFrom || 'no limit', b.effectiveFrom || 'no limit'],
    ['Effective until', a.effectiveUntil || 'no limit', b.effectiveUntil || 'no limit'],
  ];
  for (const c of b.components) {
    const o = a.components.find((x) => x.group === c.group);
    if (!o) continue;
    rows.push([`${groupName(db, c.group)}: combined by`, AGGREGATIONS[o.aggregation], AGGREGATIONS[c.aggregation]]);
    rows.push([`${groupName(db, c.group)}: score changed by`, o.transform || 'nothing', c.transform || 'nothing']);
  }
  return rows.filter(([, x, y]) => String(x) !== String(y));
}

function Waiting({ f }) {
  const { db, act } = useApp();
  const names = Object.fromEntries((db.evaluatorGroups || []).map((g) => [g.id, g.name]));
  const now = formulaNow(db, f.targetType, f.dept), next = f.config;
  const groups = [...new Set([...now.components, ...next.components].map((c) => c.group))];
  const other = otherChanges(db, now, next);
  const who = `${TARGET_TYPES[f.targetType]}${f.dept ? ` (${deptName(db, f.dept)} only)` : ''}`;
  const approve = async () => { if (await ask(`Approve this formula for ${who}?`, 'HR can then start using it. Old results do not change.', { ok: 'Approve' })) act('approveFormula', { id: f.id }); };
  const giveBack = async () => {
    const reason = await ask('Return this formula to HR?', 'Write what needs to change.', { ok: 'Return to HR', danger: true, input: 'e.g. The percentages do not match the committee decision' });
    if (reason) act('rejectFormula', { id: f.id, reason });
  };
  const change = (a, b) => {
    if (!a) return <Badge kind="info">new</Badge>;
    if (!b) return <Badge kind="overdue">removed</Badge>;
    const d = (Number(b.weight) || 0) - (Number(a.weight) || 0);
    return d === 0 ? <span className="muted">same</span> : <b>{d > 0 ? '+' : '−'}{+Math.abs(d).toFixed(2)}%</b>;
  };
  return (
    <Card title={who} actions={<Badge kind="pending">Waiting for you</Badge>} className="fx-wait">
      <p className="muted">Sent by <b>{f.meta.submittedBy}</b>{f.meta.submittedAt ? ` on ${new Date(f.meta.submittedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}` : ''} · formula version {f.version}</p>
      <p><b>Basis:</b> {f.meta.basis}</p>
      {f.meta.follow && <div className="note"><b>{deptName(db, f.dept)} would give up its own formula</b> and follow all departments again, now and whenever that formula changes.</div>}
      <div className="fx-nownext">
        <div><span className="muted">Now</span><b>{formulaWords(now, names)}</b></div>
        <div className="fx-arrow">→</div>
        <div><span className="muted">New</span><b>{formulaWords(next, names)}</b></div>
      </div>
      <table>
        <thead><tr><th>Evaluator group</th><th>Now</th><th>New</th><th>Change</th></tr></thead>
        <tbody>{groups.map((g) => {
          const a = now.components.find((c) => c.group === g), b = next.components.find((c) => c.group === g);
          return <tr key={g}><td><b>{groupName(db, g)}</b></td><td>{a ? pctText(a.weight) : '—'}</td><td>{b ? pctText(b.weight) : '—'}</td><td>{change(a, b)}</td></tr>;
        })}</tbody>
      </table>
      {other.length > 0 && <><h4>Other changes</h4><ul>{other.map(([k, a, b]) => <li key={k}>{k}: {a} → <b>{b}</b></li>)}</ul></>}
      <TryIt db={db} tt={f.targetType} dept={f.dept || null} draft={next} baseline={now} />
      <div className="row fx-actions"><button onClick={approve}>Approve</button><button className="ghost" onClick={giveBack}>Return to HR</button></div>
    </Card>
  );
}

export default function FormulaApprovals({ first = null }) {
  const { db } = useApp();
  const list = (db.formulas || []).filter((f) => f.status === 'pending');
  // a notification opens the category it is about
  list.sort((a, b) => (b.key === first) - (a.key === first));
  return (
    <>
      {list.length === 0 ? <Card><Empty icon="check" title="No formula is waiting for approval">When HR sends one, it appears here with what would change. The formulas that count now are under Formulas in use.</Empty></Card> : list.map((f) => <Waiting key={f.id} f={f} />)}
    </>
  );
}
