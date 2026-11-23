// Development follow-up: a plan for someone rated Fair or Poor, made by their dean/principal or HR,
// read and confirmed by the person, and checked against the next term's rating and the same areas.
import { useState } from 'react';
import { useApp } from '../lib/store';
import { computeAll, categoryAverages, needsPlan, planProgress, planStatus, PLAN_OUTCOMES, policyFor, personIn, interpretation, userById, stageAtLeast, isResultHead, TARGET_TYPES, localDay } from '../lib/logic';
import { Card, Badge, Select, Empty, fmt, ask } from '../ui';

const day = (iso) => new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const inDays = (n) => localDay(new Date(Date.now() + n * 86400000));

/** Make or change a plan: the areas (lowest first; those below the low line are ticked), what will be done, the review date. */
export function PlanForm({ targetId, period, plan, onDone }) {
  const { db, act } = useApp();
  const pol = policyFor(db, period.id);
  const cats = Object.entries(categoryAverages(db, period.id, targetId)).sort((a, b) => a[1] - b[1]);
  const [areas, setAreas] = useState(() => plan?.areas || cats.filter(([, v]) => v < pol.lowItem).map(([c]) => c));
  const [actions, setActions] = useState(plan?.actions || '');
  const [reviewBy, setReviewBy] = useState(plan?.reviewBy || inDays(150));
  const toggle = (c) => setAreas(areas.includes(c) ? areas.filter((x) => x !== c) : [...areas, c]);
  const save = async () => {
    const r = plan
      ? await act('updatePlan', { id: plan.id, areas, actions, reviewBy })
      : await act('createPlan', { targetId, periodId: period.id, areas, actions, reviewBy });
    if (r) onDone?.();
  };
  return (
    <div className="plan-form">
      <h4>1. Which areas need work?</h4>
      <p className="muted small">The averages of {userById(db, targetId)?.name} in {period.name}, lowest first. Areas below {pol.lowItem.toFixed(2)} are ticked for you.</p>
      <div className="plan-areas">
        {cats.map(([c, v]) => (
          <label key={c} className="inline"><input type="checkbox" checked={areas.includes(c)} onChange={() => toggle(c)} /> {c} <span className={v < pol.lowItem ? 'warn-text' : 'muted'}>{v.toFixed(2)}</span></label>
        ))}
      </div>
      <h4>2. What will be done?</h4>
      <textarea rows={3} className="wide" value={actions} maxLength={2000} placeholder="e.g. Attend the INSET on assessment; classroom observation by the Program Chair in February; mentoring by a senior teacher." onChange={(e) => setActions(e.target.value)} />
      <h4>3. Review by</h4>
      <div className="row"><input type="date" value={reviewBy} onChange={(e) => setReviewBy(e.target.value)} /><span className="muted small">Usually after the next term's results are released.</span></div>
      <div className="row">
        <button onClick={save} disabled={actions.trim().length < 10}>{plan ? 'Save changes' : 'Save the plan'}</button>
        <button className="ghost" onClick={onDone}>Cancel</button>
        {!plan && <span className="muted small">The person is notified and can read the plan under My results.</span>}
      </div>
    </div>
  );
}

/** One plan: what was agreed, where it stands, and the next term's rating compared with this one. */
export function PlanCard({ plan, canManage }) {
  const { db, user, act } = useApp();
  const [editing, setEditing] = useState(false);
  const [outcome, setOutcome] = useState('');
  const period = db.periods.find((p) => p.id === plan.periodId);
  const who = userById(db, plan.targetId);
  const [kind, label] = planStatus(plan);
  const prog = planProgress(db, plan);
  const mine = plan.targetId === user.id;
  if (editing) return <PlanForm targetId={plan.targetId} period={period} plan={plan} onDone={() => setEditing(false)} />;
  const read = async () => {
    const note = await ask('Confirm you have read this plan?', 'You can add a short note for your dean (optional).', { ok: 'I have read this plan', input: 'e.g. I will attend the February INSET', optional: true });
    if (note !== false) act('acknowledgePlan', { id: plan.id, note });
  };
  const close = async () => {
    const note = await ask(`Close the plan as "${PLAN_OUTCOMES[outcome]}"?`, `${who?.name} is told. You can add a short note (optional).`, { ok: 'Close the plan', input: 'e.g. The rating rose from 2.85 to 3.20', optional: true });
    if (note !== false) { await act('closePlan', { id: plan.id, outcome, note }); setOutcome(''); }
  };
  return (
    <div className="plan-card">
      <div className="plan-head">
        <b>{mine ? 'Your development plan' : who?.name}</b>
        <span className="muted">after {period?.name} · rated {fmt(prog.before)}{prog.before != null && ` (${interpretation(prog.before, String(who?.role) === 'NTP', policyFor(db, plan.periodId))})`}</span>
        <Badge kind={kind}>{label}</Badge>
      </div>
      {plan.areas.length > 0 && <p><span className="muted">Areas to work on:</span> {plan.areas.join(' · ')}</p>}
      <p className="plan-text">{plan.actions}</p>
      <p className="muted small">Made by {plan.createdBy} on {day(plan.createdAt)} · review by {day(plan.reviewBy)}{plan.acknowledgedAt ? ` · read by ${mine ? 'you' : who?.name} on ${day(plan.acknowledgedAt)}` : ''}</p>
      {plan.teacherNote && <p className="small"><span className="muted">{mine ? 'Your note' : `${who?.name}'s note`}:</span> "{plan.teacherNote}"</p>}
      {prog.next ? (
        <div className={`note small ${prog.change >= 0 ? 'ok' : 'warn'}`}>
          <b>Next rating ({prog.next.name}): {fmt(prog.before)} → {fmt(prog.after)} ({prog.change >= 0 ? '+' : ''}{prog.change.toFixed(2)})</b>
          {prog.areas.length > 0 && <ul>{prog.areas.map((a) => (
            <li key={a.area}>{a.area}: {a.before == null ? '—' : a.before.toFixed(2)} → {a.after == null ? 'not rated' : a.after.toFixed(2)}{a.before != null && a.after != null ? (a.after > a.before ? ' (better)' : a.after < a.before ? ' (lower)' : ' (same)') : ''}</li>
          ))}</ul>}
        </div>
      ) : plan.status === 'open' && <p className="muted small">The follow-up appears here when the next term's results are released.</p>}
      {plan.status === 'closed' && <p className="small"><span className="muted">Closed by {plan.closedBy} on {day(plan.closedAt)}:</span> {PLAN_OUTCOMES[plan.outcome]}{plan.closeNote ? ` · "${plan.closeNote}"` : ''}</p>}
      <div className="row">
        {mine && plan.status === 'open' && !plan.acknowledgedAt && <button onClick={read}>I have read this plan</button>}
        {canManage && plan.status === 'open' && <>
          <button className="ghost" onClick={() => setEditing(true)}>Change</button>
          <Select value={outcome} onChange={setOutcome} aria-label="Close the plan as"><option value="">Close the plan as…</option>{Object.entries(PLAN_OUTCOMES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          {outcome && <button onClick={close}>Close</button>}
        </>}
      </div>
    </div>
  );
}

/**
 * For HR and deans/principals: who was rated Fair or Poor in a released period and has no plan yet,
 * and every plan in scope with where it stands. The VPs see the same, without the buttons.
 */
export function FollowUp({ periodId, dept = null }) {
  const { db, user } = useApp();
  const [making, setMaking] = useState('');
  const period = db.periods.find((p) => p.id === periodId);
  const canManage = user.role === 'HR' || isResultHead(user);
  const pol = policyFor(db, periodId);
  const released = period && stageAtLeast(period, 'faculty');
  // a dean follows the people of the department: now, or when they were rated
  const inScope = (id, pid = periodId) => !dept || userById(db, id)?.dept === dept || personIn(db, pid, userById(db, id)).dept === dept;
  const low = released ? computeAll(db, periodId).filter((r) => inScope(r.targetId) && r.targetId !== user.id && needsPlan(r, pol)) : [];
  const hasPlan = (id) => (db.plans || []).some((p) => p.targetId === id && p.periodId === periodId);
  const todo = low.filter((r) => !hasPlan(r.targetId));
  const plans = (db.plans || []).filter((p) => inScope(p.targetId, p.periodId)).sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === 'open' ? -1 : 1));
  return (
    <Card title="Development follow-up">
      <p className="muted">For everyone rated Fair or Poor, the {dept ? 'dean or principal' : 'dean, principal or HR'} agrees a plan with them. The person confirms reading it, and when the next term's results are released evalU shows whether the rating and the same areas improved.</p>
      {!released ? <p className="muted">Plans can be made once the results of {period?.name || 'this period'} are released to faculty.</p> : (
        <>
          <h4>Rated Fair or Poor in {period.name}, no plan yet ({todo.length})</h4>
          {todo.length === 0 ? <p className="muted">{low.length ? 'Everyone rated Fair or Poor has a plan.' : 'No one is rated Fair or Poor.'}</p> : (
            <table>
              <thead><tr><th>Name</th><th>Type</th><th>Final rating</th><th /></tr></thead>
              <tbody>{todo.map((r) => (
                <tr key={r.targetId}>
                  <td>{r.target.name}</td><td>{TARGET_TYPES[r.type]}</td>
                  <td><b>{fmt(r.final)}</b> <Badge kind="overdue">{interpretation(r.final, String(r.type).startsWith('NTP'), pol)}</Badge></td>
                  <td>{canManage && making !== r.targetId && <button className="ghost" onClick={() => setMaking(r.targetId)}>Make a plan</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {making && todo.some((r) => r.targetId === making) && <PlanForm targetId={making} period={period} onDone={() => setMaking('')} />}
        </>
      )}
      <h4>Plans ({plans.length})</h4>
      {plans.length === 0 ? <Empty icon="report" title="No development plans yet" /> : plans.map((p) => <PlanCard key={p.id} plan={p} canManage={canManage && p.targetId !== user.id} />)}
    </Card>
  );
}

/** For the person: their own plans, to read and confirm. */
export function MyPlans() {
  const { db, user } = useApp();
  const mine = (db.plans || []).filter((p) => p.targetId === user.id);
  if (!mine.length) return null;
  return (
    <Card title="Development plan">
      <p className="muted">Your dean or HR agreed these steps with you after a rating of Fair or Poor. When the next term's results are released, you can see here whether the rating and the same areas improved.</p>
      {mine.map((p) => <PlanCard key={p.id} plan={p} canManage={false} />)}
    </Card>
  );
}
