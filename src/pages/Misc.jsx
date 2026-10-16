import { useApp } from '../lib/store';
import { computeTarget, canSeeOwn, sectionStats, STAGE_LABEL } from '../lib/logic';
import { Card, Badge, RuleNote, pct } from '../ui';
import { ResultCard } from './Reports';

export function Notifications() {
  const { db, user, update } = useApp();
  const mine = db.notifications.filter((n) => n.userId === user.id).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Card title="Notifications" actions={mine.some((n) => !n.read) && <button className="ghost" onClick={() => update((d) => d.notifications.forEach((n) => n.userId === user.id && (n.read = true)))}>Mark all read</button>}>
      {mine.length === 0 ? <p>No notifications.</p> : (
        <ul className="notifs">
          {mine.map((n) => (
            <li key={n.id} className={n.read ? '' : 'unread'}>
              <Badge kind={n.kind === 'invalidated' || n.kind === 'overdue' ? 'overdue' : 'pending'}>{n.kind}</Badge>{' '}
              {n.text} <span className="muted">{new Date(n.at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function MyResults() {
  const { db, user } = useApp();
  const myClasses = db.sections.filter((s) => s.facultyId === user.id);
  const open = db.periods.filter((p) => p.status === 'open');
  const released = db.periods.filter((p) => canSeeOwn(user, p));
  const hidden = db.periods.filter((p) => !canSeeOwn(user, p) && p.status === 'closed');
  return (
    <>
      {myClasses.length > 0 && open.length > 0 && (
        <Card title="Student response progress for my classes">
          <RuleNote />
          <table>
            <thead><tr><th>Period</th><th>Class</th><th>Responded</th><th>Rate</th><th>Standing</th></tr></thead>
            <tbody>{open.flatMap((p) => myClasses.map((s) => {
              const st = sectionStats(db, p.id, s.id);
              return <tr key={p.id + s.id}><td>{p.name}</td><td>{s.code} – {s.subject}</td><td>{st.responded} / {st.required}</td><td>{pct(st.rate)}</td>
                <td>{st.belowHalf ? <Badge kind="overdue">below 50%</Badge> : <Badge kind="completed">meets 50%</Badge>}</td></tr>;
            }))}</tbody>
          </table>
        </Card>
      )}
      <Card title="My results">
        {released.length === 0 && <p>Your results have not been released yet.</p>}
        {released.map((p) => (
          <div key={p.id}><h4>{p.name}</h4><ResultCard res={computeTarget(db, p.id, user.id)} db={db} /></div>
        ))}
        {hidden.length > 0 && <p className="muted">Not yet released to you: {hidden.map((p) => `${p.name} (${STAGE_LABEL[p.releaseStage]})`).join('; ')}.</p>}
      </Card>
    </>
  );
}
